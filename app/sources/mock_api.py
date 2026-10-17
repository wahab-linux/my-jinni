import json

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.errors import error_response
from app.scenario import DEFAULT_ORIGIN_ID, find_origin
from app.schemas import Envelope, ErrorDetail, ErrorEnvelope, EventFeed, OriginId, TravelFeed
from app.settings import DATA_DIR

router = APIRouter(prefix="/mock", tags=["Simulated source APIs"])


@router.get("/events", response_model=Envelope[EventFeed])
def events() -> Envelope[EventFeed]:
    payload = json.loads((DATA_DIR / "events.json").read_text(encoding="utf-8"))
    return Envelope(data=EventFeed.model_validate(payload))


@router.get(
    "/travel",
    response_model=Envelope[TravelFeed],
    responses={502: {"model": ErrorEnvelope, "description": "Travel source origin mismatch"}},
)
def travel(origin_id: OriginId = DEFAULT_ORIGIN_ID) -> Envelope[TravelFeed] | JSONResponse:
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
    payload = json.loads((DATA_DIR / origin.travel_filename).read_text(encoding="utf-8"))
    feed = TravelFeed.model_validate(payload)
    if feed.origin_id != origin_id:
        return error_response(
            502, "INVALID_SOURCE_DATA", "Travel source origin does not match the requested origin."
        )
    return Envelope(data=feed)
