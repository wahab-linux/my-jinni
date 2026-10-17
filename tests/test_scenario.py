import json

import pytest
from pydantic import ValidationError

from app.schemas import RecommendationRequest, SourceStatus, TravelFeed


def test_request_model_has_no_student_origin_date_or_budget_cap(valid_request):
    preferences = RecommendationRequest.model_validate(
        valid_request
        | {
            "origin_id": "community-centre",
            "depart_at": "2027-03-12T16:00:00+00:00",
            "return_by": "2027-03-13T01:00:00+00:00",
            "budget_pence": 30000,
        }
    )
    assert preferences.origin_id == "community-centre"
    assert preferences.return_by.date() > preferences.depart_at.date()


def test_city_centre_uses_its_own_travel_in_calculation(client, valid_request):
    response = client.post(
        "/api/v1/recommendations", json=valid_request | {"origin_id": "glasgow-city-centre"}
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["recommended"]["event_id"] != "event-board-games"
    assert next(source for source in data["sources"] if source["id"] == "travel")["origin_id"] == (
        "glasgow-city-centre"
    )


@pytest.mark.parametrize(
    ("changes", "expected_fields"),
    [
        ({"origin_id": "community-centre"}, {"body.origin_id"}),
        (
            {
                "depart_at": "2027-03-12T16:00:00+00:00",
                "return_by": "2027-03-12T19:00:00+00:00",
            },
            {"body.depart_at", "body.return_by"},
        ),
        ({"budget_pence": 20001}, {"body.budget_pence"}),
    ],
)
def test_demo_rejects_unsupported_scenario_after_generic_validation(
    client, valid_request, changes, expected_fields
):
    request = valid_request | changes
    RecommendationRequest.model_validate(request)
    response = client.post("/api/v1/recommendations", json=request)
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert {detail["field"] for detail in error["details"]} == expected_fields


def test_scenario_checks_dates_in_london_time(client, valid_request):
    response = client.post(
        "/api/v1/recommendations",
        json=valid_request
        | {
            "depart_at": "2026-10-19T23:30:00+00:00",
            "return_by": "2026-10-20T18:00:00+00:00",
        },
    )
    assert response.status_code == 200


def test_travel_origin_selects_its_own_dataset(client):
    campus = TravelFeed.model_validate(
        client.get("/mock/travel", params={"origin_id": "glasgow-main-campus"}).json()["data"]
    )
    city = TravelFeed.model_validate(
        client.get("/mock/travel", params={"origin_id": "glasgow-city-centre"}).json()["data"]
    )
    assert campus.origin_id == "glasgow-main-campus"
    assert city.origin_id == "glasgow-city-centre"
    campus_west = next(j for j in campus.journeys if j.destination_id == "venue-west")
    city_west = next(j for j in city.journeys if j.destination_id == "venue-west")
    assert campus_west.return_fare_pence == 200
    assert city_west.return_fare_pence == 400
    assert campus_west.outbound_minutes == 15
    assert city_west.outbound_minutes == 35
    assert campus.provider != city.provider
    assert campus.is_simulated and city.is_simulated


def test_unknown_travel_origin_is_not_silently_replaced_with_campus(client):
    response = client.get("/mock/travel", params={"origin_id": "unknown-origin"})
    assert response.status_code == 422
    assert response.json()["data"] is None
    assert response.json()["error"]["details"][0]["field"] == "query.origin_id"


def test_travel_api_rejects_mismatched_origin_metadata(client, monkeypatch, tmp_path):
    source = client.get("/mock/travel").json()["data"]
    (tmp_path / "travel-city-centre.json").write_text(json.dumps(source), encoding="utf-8")
    monkeypatch.setattr("app.sources.mock_api.DATA_DIR", tmp_path)
    response = client.get("/mock/travel", params={"origin_id": "glasgow-city-centre"})
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "INVALID_SOURCE_DATA"
    assert response.json()["data"] is None


def test_travel_source_status_requires_origin_traceability():
    status = {
        "id": "travel",
        "label": "City centre simulated travel",
        "kind": "mock",
        "is_simulated": True,
        "status": "ok",
        "updated_at": "2026-10-20T15:50:00+01:00",
    }
    with pytest.raises(ValidationError, match="origin_id"):
        SourceStatus.model_validate(status)
    assert SourceStatus.model_validate(status | {"origin_id": "glasgow-city-centre"}).origin_id == (
        "glasgow-city-centre"
    )
