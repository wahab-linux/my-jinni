import asyncio
import copy
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.comparison import router as comparison_router
from app.comparison.adapters import DecisionSourceUnavailable, fetch_dataset
from app.comparison.catalog import SCENARIOS, get_scenario
from app.comparison.router import get_decision_source_client
from app.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
def client(app):
    with TestClient(app) as value:
        yield value


def feed(scenario, kind):
    return json.loads((comparison_router.PRESET_DATA_DIR / f"{scenario}-{kind}.json").read_text())


def override_client(app, handler):
    async def dependency():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler), base_url="http://test.local"
        ) as client:
            yield client

    app.dependency_overrides[get_decision_source_client] = dependency


@pytest.mark.parametrize("scenario_id", [scenario.id for scenario in SCENARIOS])
def test_all_five_scenarios_have_two_real_http_sources_and_calculated_defaults(client, scenario_id):
    detail = client.get(f"/api/v1/decision-scenarios/{scenario_id}")
    assert detail.status_code == 200, detail.text
    data = detail.json()["data"]
    assert data["dataset"]["option_source"]["id"] != data["dataset"]["metric_source"]["id"]
    assert data["scenario"]["criteria"]
    raw_options = client.get(f"/mock/decisions/{scenario_id}/options").json()["data"]
    raw_metrics = client.get(f"/mock/decisions/{scenario_id}/metrics").json()["data"]
    assert "items" in raw_options and "records" not in raw_options
    assert "records" in raw_metrics and "items" not in raw_metrics
    response = client.post("/api/v1/decisions/evaluate", json=data["scenario"]["default_request"])
    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert result["recommended"] == result["ranked"][0]
    assert result["method"] == "weighted_min_max"
    assert result["evaluated_count"] == len(data["dataset"]["options"])
    assert len(result["sources"]) == 2
    assert response.json()["warnings"] == [
        {
            "code": "SIMULATED_DATA",
            "message": "Options and measurements include fictional simulated data.",
        }
    ]


def test_catalog_covers_requested_categories_and_finance_is_explicitly_fictional(client):
    assert [
        scenario["id"]
        for scenario in client.get("/api/v1/decision-scenarios").json()["data"]["scenarios"]
    ] == ["market", "travel", "student", "sustainability", "custom"]
    market = client.get("/api/v1/decision-scenarios/market").json()["data"]
    assert {option["category"] for option in market["dataset"]["options"]} >= {
        "share",
        "etf",
        "digital-asset",
    }
    assert "no live prices" in market["scenario"]["notice"]
    assert "suitability" in market["scenario"]["notice"]
    travel = client.get("/api/v1/decision-scenarios/travel").json()["data"]
    assert {option["category"] for option in travel["dataset"]["options"]} == {
        "train",
        "bus",
        "flight",
        "taxi",
        "cycling",
    }
    student = client.get("/api/v1/decision-scenarios/student").json()["data"]
    assert {option["category"] for option in student["dataset"]["options"]} == {
        "course",
        "society",
        "event",
        "internship",
    }


def test_actual_both_source_calls_materially_change_response(app, client, tmp_path, monkeypatch):
    catalog = feed("travel", "options")
    metrics = feed("travel", "metrics")
    (tmp_path / "travel-options.json").write_text(json.dumps(catalog))
    (tmp_path / "travel-metrics.json").write_text(json.dumps(metrics))
    monkeypatch.setattr(comparison_router, "PRESET_DATA_DIR", tmp_path)
    calls = []
    transport = httpx.ASGITransport(app=app)

    async def recording(request):
        calls.append(request.url.path)
        return await transport.handle_async_request(request)

    override_client(app, recording)
    payload = get_scenario("travel").default_request.model_dump(mode="json")
    first = client.post("/api/v1/decisions/evaluate", json=payload)
    assert first.json()["data"]["recommended"]["id"] == "train"
    assert sorted(calls) == ["/mock/decisions/travel/metrics", "/mock/decisions/travel/options"]
    catalog["items"][0]["name"] = "Changed fictional train"
    (tmp_path / "travel-options.json").write_text(json.dumps(catalog))
    renamed = client.post("/api/v1/decisions/evaluate", json=payload)
    assert renamed.json()["data"]["recommended"]["name"] == "Changed fictional train"
    metrics["records"][0]["values"]["cost-pence"] = 100_000
    (tmp_path / "travel-metrics.json").write_text(json.dumps(metrics))
    changed = client.post("/api/v1/decisions/evaluate", json=payload)
    assert changed.json()["data"]["recommended"]["id"] == "coach"


@pytest.mark.parametrize("which", ["options", "metrics"])
@pytest.mark.parametrize("failure", ["http", "timeout", "json"])
def test_required_feed_errors_never_become_success(app, client, which, failure):
    def handler(request):
        kind = request.url.path.rsplit("/", 1)[-1]
        if kind != which:
            return httpx.Response(
                200, json={"data": feed("travel", kind), "error": None, "warnings": []}
            )
        if failure == "http":
            return httpx.Response(503)
        if failure == "timeout":
            raise httpx.ReadTimeout("Synthetic failure")
        return httpx.Response(200, content=b"not JSON")

    override_client(app, handler)
    response = client.post("/api/v1/decisions/evaluate", json={"scenario_id": "travel"})
    assert response.status_code == (502 if failure == "json" else 503)
    assert response.json()["data"] is None
    assert response.json()["error"]["code"] == (
        "INVALID_SOURCE_DATA" if failure == "json" else "SOURCE_UNAVAILABLE"
    )


@pytest.mark.parametrize(
    "case",
    [
        "duplicate-option",
        "duplicate-metric",
        "unknown-option",
        "same-source",
        "wrong-scenario",
        "fractional-money",
        "negative-money",
        "unknown-criterion",
        "bad-metadata",
    ],
)
def test_malformed_or_ambiguous_source_data_is_502(app, client, case):
    catalog, metrics = feed("travel", "options"), feed("travel", "metrics")
    if case == "duplicate-option":
        catalog["items"].append(copy.deepcopy(catalog["items"][0]))
    elif case == "duplicate-metric":
        metrics["records"].append(copy.deepcopy(metrics["records"][0]))
    elif case == "unknown-option":
        metrics["records"][0]["option"] = "unknown"
    elif case == "same-source":
        metrics["provenance"]["id"] = catalog["source"]["id"]
    elif case == "wrong-scenario":
        metrics["measurement_set"] = "market"
    elif case == "fractional-money":
        metrics["records"][0]["values"]["cost-pence"] = 1.5
    elif case == "negative-money":
        metrics["records"][0]["values"]["cost-pence"] = -1
    elif case == "unknown-criterion":
        metrics["records"][0]["values"]["unconfigured"] = 5
    else:
        catalog["source"]["updated_at"] = "2026-10-17T10:00:00"

    def handler(request):
        return httpx.Response(
            200,
            json={
                "data": catalog if request.url.path.endswith("options") else metrics,
                "error": None,
                "warnings": [],
            },
        )

    override_client(app, handler)
    response = client.get("/api/v1/decision-scenarios/travel")
    assert response.status_code == 502, response.text


def test_unknown_records_values_and_availability_are_excluded_not_zeroed(app, client):
    catalog, metrics = feed("travel", "options"), feed("travel", "metrics")
    metrics["records"] = [metrics["records"][0]]
    metrics["records"][0].pop("status")
    metrics["records"][0]["values"]["cost-pence"] = None

    def handler(request):
        return httpx.Response(
            200,
            json={
                "data": catalog if request.url.path.endswith("options") else metrics,
                "error": None,
                "warnings": [],
            },
        )

    override_client(app, handler)
    result = client.post("/api/v1/decisions/evaluate", json={"scenario_id": "travel"}).json()[
        "data"
    ]
    assert result["recommended"] is None
    assert len(result["excluded"]) == 5
    train = next(option for option in result["excluded"] if option["id"] == "train")
    assert train["reasons"] == ["Availability is unknown.", "Missing value for Total cost."]


def test_custom_override_is_real_data_and_never_fetches_a_preset(app, client):
    calls = []

    def forbidden(request):
        calls.append(request.url.path)
        raise AssertionError("Custom input must not fall back to preset feeds")

    override_client(app, forbidden)
    detail = TestClient(create_app()).get("/api/v1/decision-scenarios/custom").json()["data"]
    custom = {
        "title": "My laptop choice",
        "criteria": detail["scenario"]["criteria"],
        "dataset": detail["dataset"],
    }
    custom["dataset"]["options"][0]["name"] = "My own laptop"
    response = client.post(
        "/api/v1/decisions/evaluate", json={"scenario_id": "custom", "custom": custom}
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["title"] == "My laptop choice"
    assert response.json()["data"]["recommended"]["name"] == "My own laptop"
    assert calls == []


@pytest.mark.parametrize(
    "changes",
    [
        {"weights": {"unknown": 1}},
        {"weights": {"cost-pence": 0, "duration-minutes": 0, "emissions-grams": 0}},
        {"constraints": [{"criterion_id": "unknown", "operator": "lte", "value": 1}]},
        {"constraints": [{"criterion_id": "cost-pence", "operator": "lte", "value": 1.5}]},
    ],
)
def test_request_errors_fail_before_any_source_calls(app, client, changes):
    calls = []

    def forbidden(request):
        calls.append(request.url.path)
        raise AssertionError("Validation must run before sources")

    override_client(app, forbidden)
    response = client.post("/api/v1/decisions/evaluate", json={"scenario_id": "travel", **changes})
    assert response.status_code == 422, response.text
    assert calls == []


def test_unknown_scenarios_return_404_and_custom_override_cannot_replace_other_presets(client):
    assert client.get("/api/v1/decision-scenarios/unknown").status_code == 404
    assert (
        client.post("/api/v1/decisions/evaluate", json={"scenario_id": "unknown"}).status_code
        == 404
    )
    custom = client.get("/api/v1/decision-scenarios/custom").json()["data"]
    override = {
        "title": "Override",
        "criteria": custom["scenario"]["criteria"],
        "dataset": custom["dataset"],
    }
    assert (
        client.post(
            "/api/v1/decisions/evaluate", json={"scenario_id": "travel", "custom": override}
        ).status_code
        == 422
    )


def test_adapter_wall_clock_deadline_bounds_a_transport_that_ignores_httpx_timeout():
    async def exercise():
        async def stalled(request):
            await asyncio.Future()

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(stalled), base_url="http://test.local"
        ) as client:
            with pytest.raises(DecisionSourceUnavailable):
                await asyncio.wait_for(
                    fetch_dataset(client, get_scenario("travel"), timeout_seconds=0.001),
                    timeout=0.2,
                )

    asyncio.run(exercise())


def test_default_each_source_deadline_is_two_seconds(monkeypatch):
    recorded = []
    original = asyncio.wait_for

    async def record(awaitable, timeout):
        recorded.append(timeout)
        return await original(awaitable, timeout)

    monkeypatch.setattr(asyncio, "wait_for", record)

    async def exercise():
        def handler(request):
            kind = request.url.path.rsplit("/", 1)[-1]
            return httpx.Response(
                200, json={"data": feed("travel", kind), "error": None, "warnings": []}
            )

        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler), base_url="http://test.local"
        ) as client:
            await fetch_dataset(client, get_scenario("travel"))

    asyncio.run(exercise())
    assert recorded == [2.0, 2.0]


def test_valid_empty_dataset_is_a_successful_empty_comparison(app, client):
    catalog, metrics = feed("travel", "options"), feed("travel", "metrics")
    catalog["items"] = []
    metrics["records"] = []

    def handler(request):
        return httpx.Response(
            200,
            json={
                "data": catalog if request.url.path.endswith("options") else metrics,
                "error": None,
                "warnings": [],
            },
        )

    override_client(app, handler)
    response = client.post("/api/v1/decisions/evaluate", json={"scenario_id": "travel"})
    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert result["recommended"] is None
    assert result["ranked"] == []
    assert result["excluded"] == []
    assert result["evaluated_count"] == 0
