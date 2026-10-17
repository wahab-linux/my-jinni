import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.comparison.adapters import (
    DecisionSourceUnavailable,
    InvalidDecisionSource,
    MetricsFeed,
    OptionsFeed,
    fetch_dataset,
)
from app.comparison.catalog import SCENARIOS, get_scenario
from app.comparison.engine import DecisionInputError, evaluate, validate_request
from app.comparison.schemas import DecisionRequest, DecisionResult, ScenarioDetail, ScenarioList
from app.errors import error_response
from app.schemas import APIWarning, Envelope, ErrorDetail, ErrorEnvelope

router = APIRouter(prefix="/api/v1", tags=["General decisions"])
mock_router = APIRouter(prefix="/mock/decisions", tags=["Simulated comparison feeds"])
PRESET_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "decisions"
ERRORS = {status: {"model": ErrorEnvelope} for status in (404, 422, 502, 503)}


async def get_decision_source_client(request: Request) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=request.app, raise_app_exceptions=False),
        base_url="http://my-jinni.local",
        timeout=2.0,
        trust_env=False,
    ) as client:
        yield client


SourceClient = Annotated[httpx.AsyncClient, Depends(get_decision_source_client)]


def _source_failure(error) -> JSONResponse:
    if isinstance(error, InvalidDecisionSource):
        return error_response(
            502, "INVALID_SOURCE_DATA", "A decision source returned invalid data. Please retry."
        )
    return error_response(
        503, "SOURCE_UNAVAILABLE", "A required decision source is unavailable. Please retry."
    )


@router.get("/decision-scenarios", response_model=Envelope[ScenarioList])
def scenarios() -> Envelope[ScenarioList]:
    return Envelope(data=ScenarioList(scenarios=list(SCENARIOS)))


@router.get(
    "/decision-scenarios/{scenario_id}", response_model=Envelope[ScenarioDetail], responses=ERRORS
)
async def scenario_detail(scenario_id: str, source_client: SourceClient):
    scenario = get_scenario(scenario_id)
    if scenario is None:
        return error_response(404, "NOT_FOUND", "The decision scenario does not exist.")
    try:
        dataset = await fetch_dataset(source_client, scenario)
    except (InvalidDecisionSource, DecisionSourceUnavailable) as error:
        return _source_failure(error)
    return Envelope(data=ScenarioDetail(scenario=scenario, dataset=dataset))


@router.post("/decisions/evaluate", response_model=Envelope[DecisionResult], responses=ERRORS)
async def evaluate_decision(body: DecisionRequest, source_client: SourceClient):
    scenario = get_scenario(body.scenario_id)
    if scenario is None:
        return error_response(404, "NOT_FOUND", "The decision scenario does not exist.")
    try:
        validate_request(scenario, body)
        dataset = (
            body.custom.dataset
            if body.custom is not None
            else await fetch_dataset(source_client, scenario)
        )
        result = evaluate(scenario, dataset, body)
    except DecisionInputError as error:
        return error_response(
            422,
            "VALIDATION_ERROR",
            str(error),
            [ErrorDetail(field=error.field, message=str(error))],
        )
    except (InvalidDecisionSource, DecisionSourceUnavailable) as error:
        return _source_failure(error)
    warnings = (
        [
            APIWarning(
                code="SIMULATED_DATA",
                message="Options and measurements include fictional simulated data.",
            )
        ]
        if result.is_simulated
        else []
    )
    return Envelope(data=result, warnings=warnings)


def _mock_feed(scenario_id: str, kind: str):
    if get_scenario(scenario_id) is None:
        return error_response(404, "NOT_FOUND", "The decision scenario does not exist.")
    try:
        data = json.loads(
            (PRESET_DATA_DIR / f"{scenario_id}-{kind}.json").read_text(encoding="utf-8")
        )
    except OSError:
        return error_response(
            503, "SOURCE_UNAVAILABLE", "The simulated decision feed is unavailable."
        )
    except ValueError:
        return error_response(
            502, "INVALID_SOURCE_DATA", "The simulated decision feed contains invalid data."
        )
    try:
        (OptionsFeed if kind == "options" else MetricsFeed).model_validate(data)
    except ValueError:
        return error_response(
            502, "INVALID_SOURCE_DATA", "The simulated decision feed contains invalid data."
        )
    return Envelope(data=data)


@mock_router.get("/{scenario_id}/options", response_model=Envelope[dict])
def mock_options(scenario_id: str):
    return _mock_feed(scenario_id, "options")


@mock_router.get("/{scenario_id}/metrics", response_model=Envelope[dict])
def mock_metrics(scenario_id: str):
    return _mock_feed(scenario_id, "metrics")
