import json
from collections.abc import AsyncIterator
from typing import Annotated
from zoneinfo import ZoneInfo

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from app import __version__
from app.comparison.router import mock_router as comparison_mock_router
from app.comparison.router import router as comparison_router
from app.decision.domain import Candidate, Preferences
from app.decision.engine import calculate
from app.errors import (
    error_response,
    http_error_handler,
    unexpected_error_handler,
    validation_error_handler,
)
from app.knowledge.router import router as knowledge_router
from app.scenario import (
    DEMO_DATE,
    MAX_BUDGET_PENCE,
    ORIGINS,
    SUPPORTED_DATES,
    TIMEZONE,
    validate_scenario,
)
from app.schemas import (
    APIWarning,
    Envelope,
    ErrorEnvelope,
    Health,
    InterestOption,
    Options,
    OriginOption,
    RecommendationData,
    RecommendationEnvelope,
    RecommendationRequest,
    RecommendedActivity,
)
from app.settings import FIXTURES_DIR, SOURCE_TIMEOUT_SECONDS
from app.sources.adapters import InvalidSourceData, SourceUnavailable, fetch_sources
from app.sources.mock_api import router as mock_router

ERROR_RESPONSES = {
    422: {"model": ErrorEnvelope, "description": "Invalid input"},
    500: {"model": ErrorEnvelope, "description": "Unexpected server error"},
}


def read_example(name: str) -> dict:
    return json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))


async def get_source_client(request: Request) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=request.app, raise_app_exceptions=False)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://my-jinni.local", timeout=SOURCE_TIMEOUT_SECONDS
    ) as client:
        yield client


def present_candidate(
    candidate: Candidate, preferences: RecommendationRequest
) -> RecommendedActivity:
    activity, journey = candidate.activity, candidate.journey
    local_zone = ZoneInfo(TIMEZONE)
    arrival = candidate.arrive_at.astimezone(local_zone)
    returned = candidate.return_at.astimezone(local_zone)
    deadline = preferences.return_by.astimezone(local_zone)
    reasons = [
        (
            f"Matches your interest in {activity.category}."
            if candidate.interest_match
            else f"A different interest category ({activity.category}) that fits your constraints."
        ),
        (
            f"Costs GBP {candidate.total_cost_pence // 100}.{candidate.total_cost_pence % 100:02d} "
            "including return travel, within your "
            f"GBP {preferences.budget_pence // 100}.{preferences.budget_pence % 100:02d} budget."
        ),
        (
            f"Arrive at {arrival:%H:%M}, at or before the activity starts; "
            f"return to your selected origin at {returned:%H:%M}, "
            f"by your {deadline:%H:%M} deadline ({TIMEZONE})."
        ),
    ]
    return RecommendedActivity(
        event_id=activity.id,
        title=activity.title,
        venue_name=activity.venue_name,
        category=activity.category,
        starts_at=activity.starts_at,
        ends_at=activity.ends_at,
        ticket_cost_pence=activity.ticket_cost_pence,
        travel_cost_pence=journey.return_fare_pence,
        total_cost_pence=candidate.total_cost_pence,
        outbound_minutes=journey.outbound_minutes,
        return_minutes=journey.return_minutes,
        arrive_at=candidate.arrive_at,
        return_at=candidate.return_at,
        reasons=reasons,
    )


def create_app() -> FastAPI:
    app = FastAPI(
        title="my-jinni API",
        version=__version__,
        description=(
            "Contract v0.5: general multi-source decisions, optional detailed activity planning, "
            "a local source library and cited AI. Presets are simulated; custom data and uploads "
            "retain supplied provenance without independent verification."
        ),
        responses=ERROR_RESPONSES,
    )
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(HTTPException, http_error_handler)
    app.add_exception_handler(Exception, unexpected_error_handler)

    @app.get("/health", response_model=Envelope[Health], tags=["Status"])
    def health() -> Envelope[Health]:
        return Envelope(data=Health(status="ok", version=__version__, recommendations_ready=True))

    @app.get("/api/v1/options", response_model=Envelope[Options], tags=["Application"])
    def options() -> Envelope[Options]:
        return Envelope(
            data=Options(
                demo_date=DEMO_DATE,
                timezone=TIMEZONE,
                supported_dates=list(SUPPORTED_DATES),
                origins=[OriginOption(id=origin.id, label=origin.label) for origin in ORIGINS],
                max_budget_pence=MAX_BUDGET_PENCE,
                currency="GBP",
                interests=[
                    InterestOption(id=key, label=label)
                    for key, label in (
                        ("games", "Games"),
                        ("music", "Music"),
                        ("arts", "Arts"),
                        ("sport", "Sport"),
                        ("learning", "Learning"),
                    )
                ],
                default_request=RecommendationRequest.model_validate(
                    read_example("recommendation-request.json")
                ),
                is_simulated=True,
            )
        )

    @app.post(
        "/api/v1/recommendations",
        response_model=RecommendationEnvelope,
        tags=["Application"],
        responses={
            200: {
                "description": "Calculated recommendation, or a successful search with no match",
                "content": {
                    "application/json": {
                        "examples": {
                            "match": {"value": read_example("recommendation-success.json")},
                            "no_match": {"value": read_example("recommendation-empty.json")},
                        }
                    }
                },
            },
            502: {"model": ErrorEnvelope, "description": "A source returned invalid data"},
            503: {"model": ErrorEnvelope, "description": "A required source is unavailable"},
        },
    )
    async def recommendations(
        preferences: RecommendationRequest,
        source_client: Annotated[httpx.AsyncClient, Depends(get_source_client)],
    ) -> RecommendationEnvelope | JSONResponse:
        details = validate_scenario(preferences)
        if details:
            return error_response(422, "VALIDATION_ERROR", "Please check your request.", details)
        try:
            bundle = await fetch_sources(
                source_client, preferences.origin_id, SOURCE_TIMEOUT_SECONDS
            )
        except InvalidSourceData:
            return error_response(
                502, "INVALID_SOURCE_DATA", "A source returned invalid data. Please retry."
            )
        except SourceUnavailable:
            return error_response(
                503, "SOURCE_UNAVAILABLE", "A required source is unavailable. Please retry."
            )
        result = calculate(
            Preferences(
                origin_id=preferences.origin_id,
                budget_pence=preferences.budget_pence,
                depart_at=preferences.depart_at,
                return_by=preferences.return_by,
                interests=frozenset(preferences.interests),
            ),
            bundle.activities,
            bundle.journeys,
        )
        candidates = [present_candidate(item, preferences) for item in result.candidates[:3]]
        warnings = list(bundle.warnings)
        if result.missing_journey_ids:
            warnings.append(
                APIWarning(
                    code="MISSING_JOURNEY",
                    message=(
                        f"Excluded {len(result.missing_journey_ids)} activities with missing "
                        "or unavailable return travel."
                    ),
                )
            )
        if not candidates:
            message = (
                "No activity fits this budget and time window. Try adjusting your preferences."
            )
        elif result.candidates[0].interest_match:
            message = "Found an activity that fits your interests, budget, and return deadline."
        else:
            message = (
                "Found an activity within your budget and time window, "
                "in a different interest category."
            )
        return RecommendationEnvelope(
            data=RecommendationData(
                recommended=candidates[0] if candidates else None,
                alternatives=candidates[1:],
                message=message,
                sources=bundle.sources,
            ),
            warnings=warnings,
        )

    app.include_router(mock_router)
    app.include_router(comparison_mock_router)
    app.include_router(comparison_router)
    app.include_router(knowledge_router)

    @app.get("/", include_in_schema=False)
    def home() -> Envelope[Health]:
        return health()

    app.mount("/fixtures", StaticFiles(directory=FIXTURES_DIR), name="fixtures")
    return app


app = create_app()
