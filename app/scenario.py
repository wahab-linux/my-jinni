from dataclasses import dataclass
from datetime import date
from zoneinfo import ZoneInfo

from app.schemas import ErrorDetail, RecommendationRequest

TIMEZONE = "Europe/London"
DEMO_DATE = date(2026, 10, 20)
SUPPORTED_DATES = (DEMO_DATE,)
DEFAULT_ORIGIN_ID = "glasgow-main-campus"
MAX_BUDGET_PENCE = 20000


@dataclass(frozen=True)
class OriginConfig:
    id: str
    label: str
    travel_filename: str


ORIGINS = (
    OriginConfig("glasgow-main-campus", "University of Glasgow main campus", "travel.json"),
    OriginConfig("glasgow-city-centre", "Glasgow city centre", "travel-city-centre.json"),
)


def find_origin(origin_id: str) -> OriginConfig | None:
    return next((origin for origin in ORIGINS if origin.id == origin_id), None)


def validate_scenario(preferences: RecommendationRequest) -> list[ErrorDetail]:
    details = []
    if find_origin(preferences.origin_id) is None:
        details.append(
            ErrorDetail(field="body.origin_id", message="Choose an origin from /api/v1/options.")
        )
    local_zone = ZoneInfo(TIMEZONE)
    for field in ("depart_at", "return_by"):
        if getattr(preferences, field).astimezone(local_zone).date() not in SUPPORTED_DATES:
            details.append(
                ErrorDetail(
                    field=f"body.{field}",
                    message="Choose a date from /api/v1/options supported_dates.",
                )
            )
    if preferences.budget_pence > MAX_BUDGET_PENCE:
        details.append(
            ErrorDetail(
                field="body.budget_pence",
                message=f"This demo supports budgets up to {MAX_BUDGET_PENCE} pence.",
            )
        )
    return details
