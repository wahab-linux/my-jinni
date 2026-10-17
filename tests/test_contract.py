import json

import pytest
from pydantic import ValidationError

from app.main import create_app
from app.schemas import ErrorEnvelope, RecommendationEnvelope, RecommendationRequest
from app.settings import FIXTURES_DIR, ROOT


def test_app_serves_backend_health_and_defaults(client):
    assert client.get("/").status_code == 200
    health = client.get("/health").json()
    assert health["data"]["recommendations_ready"] is True
    assert client.get("/").json() == health
    assert client.get("/static/index.html").status_code == 404
    options = client.get("/api/v1/options").json()["data"]
    assert options["demo_date"] == "2026-10-20"
    assert options["supported_dates"] == ["2026-10-20"]
    assert {origin["id"] for origin in options["origins"]} == {
        "glasgow-main-campus",
        "glasgow-city-centre",
    }
    assert options["default_request"]["origin_id"] == "glasgow-main-campus"
    assert options["max_budget_pence"] == 20000
    assert "origin_id" not in options
    assert options["timezone"] == "Europe/London"
    assert options["is_simulated"] is True


def test_valid_request_returns_calculated_result(client, valid_request):
    response = client.post("/api/v1/recommendations", json=valid_request)
    assert response.status_code == 200
    result = RecommendationEnvelope.model_validate(response.json())
    assert result.error is None
    assert result.data.recommended.event_id == "event-board-games"
    assert result.data.recommended.total_cost_pence == 500
    assert result.data.recommended.return_at.isoformat() == "2026-10-20T18:15:00+01:00"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("budget_pence", -1),
        ("budget_pence", 10.5),
        ("budget_pence", True),
        ("origin_id", ""),
        ("depart_at", "2026-10-20T16:00:00"),
        ("return_by", "2026-10-20T15:00:00+01:00"),
        ("return_by", "2026-10-21T19:00:00+01:00"),
        ("interests", []),
        ("interests", ["games", "games"]),
        ("unexpected_field", "value"),
    ],
)
def test_invalid_requests_have_one_error_shape(client, valid_request, field, value):
    response = client.post("/api/v1/recommendations", json=valid_request | {field: value})
    assert response.status_code == 422
    payload = ErrorEnvelope.model_validate(response.json())
    assert payload.error.code == "VALIDATION_ERROR"
    assert payload.error.details


def test_malformed_json_has_contract_error(client):
    response = client.post(
        "/api/v1/recommendations",
        content="{",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_both_source_apis_are_independent_and_simulated(client):
    events = client.get("/mock/events").json()["data"]
    travel = client.get("/mock/travel").json()["data"]
    assert events["is_simulated"] and travel["is_simulated"]
    board_games = next(event for event in events["events"] if event["id"] == "event-board-games")
    journey = next(
        item for item in travel["journeys"] if item["destination_id"] == board_games["venue"]["id"]
    )
    assert board_games["price_gbp"] == "3.00"
    assert journey["return_fare_pence"] == 200


@pytest.mark.parametrize("filename", ["recommendation-success.json", "recommendation-empty.json"])
def test_frontend_response_fixtures_match_contract(client, filename):
    response = client.get(f"/fixtures/{filename}")
    assert response.status_code == 200
    result = RecommendationEnvelope.model_validate(response.json())
    assert result.error is None
    assert {source.id for source in result.data.sources} == {"events", "travel"}
    assert result.warnings[0].code == "SIMULATED_DATA"
    assert next(source for source in result.data.sources if source.id == "travel").origin_id == (
        "glasgow-main-campus"
    )


def test_frontend_failure_fixture_has_error_envelope(client):
    body = client.get("/fixtures/recommendation-error.json").json()
    assert ErrorEnvelope.model_validate(body).error.code == "SOURCE_UNAVAILABLE"


def test_missing_endpoint_and_wrong_method_use_error_envelope(client):
    missing = client.get("/api/v1/missing")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "NOT_FOUND"
    wrong_method = client.put("/mock/events")
    assert wrong_method.status_code == 405
    assert wrong_method.json()["error"]["code"] == "METHOD_NOT_ALLOWED"
    wrong_app_method = client.get("/api/v1/recommendations")
    assert wrong_app_method.status_code == 405
    assert wrong_app_method.json()["error"]["code"] == "METHOD_NOT_ALLOWED"


def test_error_envelope_cannot_hide_success_data():
    with pytest.raises(ValidationError):
        ErrorEnvelope(data={"status": "ok"}, error={"code": "BAD", "message": "Bad"})


def test_default_request_is_valid(valid_request):
    assert RecommendationRequest.model_validate(valid_request).budget_pence == 1000


def test_openapi_snapshot_matches_running_app():
    snapshot = json.loads((ROOT / "docs" / "openapi.json").read_text(encoding="utf-8"))
    assert create_app().openapi() == snapshot


def test_success_example_contains_consistent_money_and_time():
    data = json.loads((FIXTURES_DIR / "recommendation-success.json").read_text("utf-8"))
    recommendation = RecommendationEnvelope.model_validate(data).data.recommended
    assert recommendation.total_cost_pence == (
        recommendation.ticket_cost_pence + recommendation.travel_cost_pence
    )
    assert recommendation.arrive_at <= recommendation.starts_at
    assert recommendation.return_at > recommendation.ends_at
    assert "back_on_campus_at" not in data["data"]["recommended"]
