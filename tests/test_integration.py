import copy
import json
from contextlib import ExitStack
from datetime import datetime

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.sources import mock_api


@pytest.fixture
def source_payloads():
    return {
        "/mock/events": {
            "provider": "Integration events",
            "is_simulated": True,
            "updated_at": "2026-10-20T15:50:00+01:00",
            "events": [
                {
                    "id": "event-baseline",
                    "title": "Baseline activity",
                    "venue": {"id": "venue-baseline", "name": "Baseline venue"},
                    "category": "games",
                    "starts_at": "2026-10-20T17:00:00+01:00",
                    "ends_at": "2026-10-20T18:00:00+01:00",
                    "price_gbp": "3.00",
                }
            ],
        },
        "/mock/travel": {
            "provider": "Integration travel",
            "is_simulated": True,
            "updated_at": "2026-10-20T15:45:00+01:00",
            "origin_id": "glasgow-main-campus",
            "journeys": [
                {
                    "destination_id": "venue-baseline",
                    "outbound_minutes": 15,
                    "return_minutes": 15,
                    "return_fare_pence": 200,
                    "available": True,
                }
            ],
        },
    }


def source_response(payloads, request):
    assert request.url.path in payloads
    if request.url.path == "/mock/travel":
        assert request.url.params["origin_id"] == "glasgow-main-campus"
    return httpx.Response(
        200,
        json={"data": payloads[request.url.path], "error": None, "warnings": []},
    )


@pytest.fixture
def transport_client():
    from app.main import get_source_client

    with ExitStack() as stack:

        def make_client(handler):
            app = create_app()

            async def override_source_client():
                async with httpx.AsyncClient(
                    transport=httpx.MockTransport(handler),
                    base_url="http://integration.test",
                    timeout=2.0,
                ) as source_client:
                    yield source_client

            app.dependency_overrides[get_source_client] = override_source_client
            return stack.enter_context(TestClient(app, raise_server_exceptions=False))

        yield make_client


def write_source_files(directory, payloads):
    for path, filename in (("/mock/events", "events.json"), ("/mock/travel", "travel.json")):
        (directory / filename).write_text(json.dumps(payloads[path]), encoding="utf-8")


def assert_no_match(response):
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["error"] is None
    assert body["data"]["recommended"] is None
    assert body["data"]["alternatives"] == []


def assert_source_error(response, status, code):
    assert response.status_code == status, response.text
    body = response.json()
    assert body["data"] is None
    assert body["error"]["code"] == code
    assert "Traceback" not in response.text
    assert "private-source-details" not in response.text


def test_two_actual_source_routes_calculate_baseline(
    tmp_path, monkeypatch, source_payloads, valid_request
):
    write_source_files(tmp_path, source_payloads)
    monkeypatch.setattr(mock_api, "DATA_DIR", tmp_path)
    with TestClient(create_app()) as client:
        response = client.post("/api/v1/recommendations", json=valid_request)

    assert response.status_code == 200, response.text
    body = response.json()
    recommendation = body["data"]["recommended"]
    assert recommendation["event_id"] == "event-baseline"
    assert recommendation["ticket_cost_pence"] == 300
    assert recommendation["travel_cost_pence"] == 200
    assert recommendation["total_cost_pence"] == 500
    assert datetime.fromisoformat(recommendation["arrive_at"]) == datetime.fromisoformat(
        "2026-10-20T16:15:00+01:00"
    )
    assert datetime.fromisoformat(recommendation["return_at"]) == datetime.fromisoformat(
        "2026-10-20T18:15:00+01:00"
    )
    assert recommendation["reasons"]
    assert "SIMULATED_DATA" in {warning["code"] for warning in body["warnings"]}
    sources = {source["id"]: source for source in body["data"]["sources"]}
    assert sources.keys() == {"events", "travel"}
    assert sources["events"]["label"] == "Integration events"
    assert sources["travel"]["label"] == "Integration travel"
    assert sources["travel"]["origin_id"] == valid_request["origin_id"]
    for source in sources.values():
        assert source["is_simulated"] is True
        expected = source_payloads[f"/mock/{source['id']}"]["updated_at"]
        assert datetime.fromisoformat(source["updated_at"]) == datetime.fromisoformat(expected)


@pytest.mark.parametrize(
    ("feed", "records", "field", "value"),
    [
        ("/mock/events", "events", "price_gbp", "11.00"),
        ("/mock/travel", "journeys", "return_fare_pence", 1200),
        ("/mock/travel", "journeys", "outbound_minutes", 61),
        ("/mock/travel", "journeys", "return_minutes", 61),
    ],
)
def test_independently_changing_either_actual_feed_changes_feasibility(
    tmp_path, monkeypatch, source_payloads, valid_request, feed, records, field, value
):
    write_source_files(tmp_path, source_payloads)
    monkeypatch.setattr(mock_api, "DATA_DIR", tmp_path)
    with TestClient(create_app()) as client:
        baseline = client.post("/api/v1/recommendations", json=valid_request)
        assert baseline.status_code == 200, baseline.text
        assert baseline.json()["data"]["recommended"]["total_cost_pence"] == 500
        source_payloads[feed][records][0][field] = value
        write_source_files(tmp_path, source_payloads)
        assert_no_match(client.post("/api/v1/recommendations", json=valid_request))


@pytest.mark.parametrize(
    ("failure", "status", "code"),
    [
        ("missing_file", 503, "SOURCE_UNAVAILABLE"),
        ("invalid_json", 502, "INVALID_SOURCE_DATA"),
        ("nonfinite_json", 502, "INVALID_SOURCE_DATA"),
        ("wrong_origin", 502, "INVALID_SOURCE_DATA"),
    ],
)
def test_actual_source_route_errors_keep_their_failure_meaning(
    tmp_path, monkeypatch, source_payloads, valid_request, failure, status, code
):
    write_source_files(tmp_path, source_payloads)
    travel_file = tmp_path / "travel.json"
    if failure == "missing_file":
        travel_file.unlink()
    elif failure == "invalid_json":
        travel_file.write_text("{broken", encoding="utf-8")
    elif failure == "nonfinite_json":
        source_payloads["/mock/travel"]["journeys"][0]["return_fare_pence"] = float("nan")
        write_source_files(tmp_path, source_payloads)
    else:
        source_payloads["/mock/travel"]["origin_id"] = "glasgow-city-centre"
        write_source_files(tmp_path, source_payloads)
    monkeypatch.setattr(mock_api, "DATA_DIR", tmp_path)
    with TestClient(create_app()) as client:
        response = client.post("/api/v1/recommendations", json=valid_request)
    assert_source_error(response, status, code)


def test_actual_source_route_passes_individual_record_validation_to_adapter(
    tmp_path, monkeypatch, source_payloads, valid_request
):
    source_payloads["/mock/events"]["events"].append({"incomplete": True})
    write_source_files(tmp_path, source_payloads)
    monkeypatch.setattr(mock_api, "DATA_DIR", tmp_path)
    with TestClient(create_app()) as client:
        response = client.post("/api/v1/recommendations", json=valid_request)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["data"]["recommended"]["event_id"] == "event-baseline"
    assert "INVALID_RECORD_SKIPPED" in {warning["code"] for warning in body["warnings"]}


@pytest.mark.parametrize(
    ("budget", "event_id", "total"),
    [(1000, "event-board-games", 500), (400, "event-music", 400), (0, None, None)],
)
def test_default_demo_budget_changes_calculated_recommendation(
    client, valid_request, budget, event_id, total
):
    valid_request["budget_pence"] = budget
    response = client.post("/api/v1/recommendations", json=valid_request)
    if event_id is None:
        assert_no_match(response)
        return
    assert response.status_code == 200, response.text
    recommendation = response.json()["data"]["recommended"]
    assert recommendation["event_id"] == event_id
    assert recommendation["total_cost_pence"] == total


def test_city_centre_uses_its_own_journeys_and_provenance(client, valid_request):
    valid_request["origin_id"] = "glasgow-city-centre"
    response = client.post("/api/v1/recommendations", json=valid_request)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    choices = [data["recommended"], *data["alternatives"]]
    assert all(choice["event_id"] != "event-board-games" for choice in choices if choice)
    travel = next(source for source in data["sources"] if source["id"] == "travel")
    assert travel["origin_id"] == "glasgow-city-centre"
    assert data["recommended"]["event_id"] == "event-film"
    assert data["recommended"]["travel_cost_pence"] == 0
    assert data["recommended"]["outbound_minutes"] == 8
    assert data["recommended"]["return_minutes"] == 9


@pytest.mark.parametrize("source", ["/mock/events", "/mock/travel"])
@pytest.mark.parametrize("failure", ["http", "timeout"])
def test_either_required_source_failure_returns_503_without_fallback(
    transport_client, source_payloads, valid_request, source, failure
):
    def handler(request):
        if request.url.path != source:
            return source_response(source_payloads, request)
        if failure == "timeout":
            raise httpx.ReadTimeout("private-source-details", request=request)
        return httpx.Response(500, text="private-source-details")

    client = transport_client(handler)
    assert_source_error(
        client.post("/api/v1/recommendations", json=valid_request), 503, "SOURCE_UNAVAILABLE"
    )


@pytest.mark.parametrize("source", ["/mock/events", "/mock/travel"])
@pytest.mark.parametrize("invalid_kind", ["json", "envelope", "header", "records"])
def test_invalid_source_payload_is_502_instead_of_success_or_empty(
    transport_client, source_payloads, valid_request, source, invalid_kind
):
    def handler(request):
        if request.url.path != source:
            return source_response(source_payloads, request)
        if invalid_kind == "json":
            return httpx.Response(
                200, content=b"{broken", headers={"content-type": "application/json"}
            )
        if invalid_kind == "envelope":
            return httpx.Response(200, json={"data": None, "error": None, "warnings": []})
        payload = copy.deepcopy(source_payloads[source])
        if invalid_kind == "header":
            del payload["updated_at"]
        else:
            payload["events" if source == "/mock/events" else "journeys"] = {"wrong": "shape"}
        return httpx.Response(200, json={"data": payload, "error": None, "warnings": []})

    client = transport_client(handler)
    assert_source_error(
        client.post("/api/v1/recommendations", json=valid_request), 502, "INVALID_SOURCE_DATA"
    )


def test_wrong_travel_origin_is_502(transport_client, source_payloads, valid_request):
    source_payloads["/mock/travel"]["origin_id"] = "glasgow-city-centre"
    client = transport_client(lambda request: source_response(source_payloads, request))
    assert_source_error(
        client.post("/api/v1/recommendations", json=valid_request), 502, "INVALID_SOURCE_DATA"
    )


@pytest.mark.parametrize("source", ["/mock/events", "/mock/travel"])
def test_partial_invalid_records_preserve_valid_result_with_warning(
    transport_client, source_payloads, valid_request, source
):
    records = "events" if source == "/mock/events" else "journeys"
    source_payloads[source][records].append({"incomplete": True})
    client = transport_client(lambda request: source_response(source_payloads, request))
    response = client.post("/api/v1/recommendations", json=valid_request)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["data"]["recommended"]["event_id"] == "event-baseline"
    assert "INVALID_RECORD_SKIPPED" in {warning["code"] for warning in body["warnings"]}


@pytest.mark.parametrize("source", ["/mock/events", "/mock/travel"])
@pytest.mark.parametrize("invalid_kind", ["all_invalid", "duplicate"])
def test_all_invalid_or_ambiguous_source_records_fail_the_whole_request(
    transport_client, source_payloads, valid_request, source, invalid_kind
):
    records = "events" if source == "/mock/events" else "journeys"
    if invalid_kind == "all_invalid":
        source_payloads[source][records] = [{"incomplete": True}]
    else:
        duplicate = copy.deepcopy(source_payloads[source][records][0])
        duplicate["price_gbp" if records == "events" else "return_fare_pence"] = (
            "4.00" if records == "events" else 300
        )
        source_payloads[source][records].append(duplicate)
    client = transport_client(lambda request: source_response(source_payloads, request))
    assert_source_error(
        client.post("/api/v1/recommendations", json=valid_request), 502, "INVALID_SOURCE_DATA"
    )


@pytest.mark.parametrize("missing_kind", ["missing", "unavailable"])
def test_missing_or_unavailable_journey_is_excluded_with_warning(
    transport_client, source_payloads, valid_request, missing_kind
):
    journey = source_payloads["/mock/travel"]["journeys"][0]
    if missing_kind == "missing":
        journey["destination_id"] = "another-venue"
    else:
        journey["available"] = False
    client = transport_client(lambda request: source_response(source_payloads, request))
    response = client.post("/api/v1/recommendations", json=valid_request)
    assert_no_match(response)
    assert "MISSING_JOURNEY" in {warning["code"] for warning in response.json()["warnings"]}


@pytest.mark.parametrize("source", ["/mock/events", "/mock/travel"])
def test_valid_empty_source_list_is_normal_no_match(
    transport_client, source_payloads, valid_request, source
):
    source_payloads[source]["events" if source == "/mock/events" else "journeys"] = []
    client = transport_client(lambda request: source_response(source_payloads, request))
    assert_no_match(client.post("/api/v1/recommendations", json=valid_request))


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("origin_id", "unsupported-origin"),
        ("budget_pence", 20001),
        ("depart_at", "2026-10-19T16:00:00+01:00"),
    ],
)
def test_unsupported_scenario_is_rejected_before_source_io(
    transport_client, valid_request, field, value
):
    calls = []

    def handler(request):
        calls.append(request.url.path)
        raise AssertionError("Source transport must not run for unsupported scenarios")

    client = transport_client(handler)
    valid_request[field] = value
    response = client.post("/api/v1/recommendations", json=valid_request)
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert calls == []
