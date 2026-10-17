import json

from fastapi import APIRouter

from app.schemas import Envelope, EventFeed, TravelFeed
from app.settings import DATA_DIR

router = APIRouter(prefix="/mock", tags=["Simulated source APIs"])


@router.get("/events", response_model=Envelope[EventFeed])
def events() -> Envelope[EventFeed]:
    payload = json.loads((DATA_DIR / "events.json").read_text(encoding="utf-8"))
    return Envelope(data=EventFeed.model_validate(payload))


@router.get("/travel", response_model=Envelope[TravelFeed])
def travel() -> Envelope[TravelFeed]:
    payload = json.loads((DATA_DIR / "travel.json").read_text(encoding="utf-8"))
    return Envelope(data=TravelFeed.model_validate(payload))
