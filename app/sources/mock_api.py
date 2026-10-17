import json

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.errors import error_response
from app.scenario import DEFAULT_ORIGIN_ID, find_origin
from app.schemas import Envelope, ErrorDetail, ErrorEnvelope, EventFeed, OriginId, TravelFeed
from app.settings import DATA_DIR

router = APIRouter(prefix="/mock", tags=["Simulated source APIs"])


@router.get("/events", response_model=Envelope[EventFeed])
def events() -> JSONResponse:
    return read_source("events.json")


def read_source(filename: str, origin_id: str | None = None) -> JSONResponse:
    try:
        payload = json.loads((DATA_DIR / filename).read_text(encoding="utf-8"))
        response = JSONResponse(content={"data": payload, "error": None, "warnings": []})
    except OSError:
        return error_response(503, "SOURCE_UNAVAILABLE", "The simulated source is unavailable.")
    except (ValueError, UnicodeError):
        return error_response(
            502, "INVALID_SOURCE_DATA", "The simulated source contains invalid JSON."
        )
    if origin_id is not None and (
        not isinstance(payload, dict) or payload.get("origin_id") != origin_id
    ):
        return error_response(
            502, "INVALID_SOURCE_DATA", "Travel source origin does not match the requested origin."
        )
    return response


@router.get(
    "/travel",
    response_model=Envelope[TravelFeed],
    responses={502: {"model": ErrorEnvelope, "description": "Travel source origin mismatch"}},
)
def travel(origin_id: OriginId = DEFAULT_ORIGIN_ID) -> JSONResponse:
    origin = find_origin(origin_id)
    if origin is None:
        return error_response(
            422,
            "VALIDATION_ERROR",
            "Please check your request.",
            [
                ErrorDetail(
                    field="query.origin_id", message="Choose an origin from /api/v1/options."
                )
            ],
        )
    return read_source(origin.travel_filename, origin_id)
