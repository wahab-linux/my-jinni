from datetime import date
from typing import Annotated, Generic, Literal, TypeVar
from zoneinfo import ZoneInfo

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictInt, model_validator

from app.settings import DEMO_DATE, TIMEZONE

Category = Literal["games", "music", "arts", "sport", "learning"]
Pence = Annotated[StrictInt, Field(ge=0)]
T = TypeVar("T")


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ErrorDetail(Model):
    field: str
    message: str


class APIError(Model):
    code: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)


class APIWarning(Model):
    code: str
    message: str


class Envelope(Model, Generic[T]):
    data: T | None = None
    error: APIError | None = None
    warnings: list[APIWarning] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_data_or_error(self) -> "Envelope[T]":
        if (self.data is None) == (self.error is None):
            raise ValueError("Exactly one of data or error must be present")
        return self


class RecommendationRequest(Model):
    origin_id: Literal["glasgow-main-campus"]
    budget_pence: Annotated[StrictInt, Field(ge=0, le=20000)]
    depart_at: AwareDatetime
    return_by: AwareDatetime
    interests: Annotated[list[Category], Field(min_length=1, max_length=5)]

    @model_validator(mode="after")
    def validate_demo_window(self) -> "RecommendationRequest":
        if self.return_by <= self.depart_at:
            raise ValueError("return_by must be later than depart_at")
        local_zone = ZoneInfo(TIMEZONE)
        for value in (self.depart_at, self.return_by):
            if value.astimezone(local_zone).date() != DEMO_DATE:
                raise ValueError(f"Use the fixed demo date {DEMO_DATE.isoformat()}")
        if len(set(self.interests)) != len(self.interests):
            raise ValueError("interests must not contain duplicates")
        return self


class InterestOption(Model):
    id: Category
    label: str


class Options(Model):
    demo_date: date
    timezone: str
    origin_id: str
    origin_label: str
    currency: Literal["GBP"]
    interests: list[InterestOption]
    default_request: RecommendationRequest
    is_simulated: Literal[True]


class Health(Model):
    status: Literal["ok"]
    version: str
    recommendations_ready: bool


class Venue(Model):
    id: str
    name: str


class EventRecord(Model):
    id: str
    title: str
    venue: Venue
    category: Category
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    price_gbp: str


class EventFeed(Model):
    provider: str
    is_simulated: Literal[True]
    updated_at: AwareDatetime
    events: list[EventRecord]


class JourneyRecord(Model):
    destination_id: str
    outbound_minutes: Annotated[StrictInt, Field(ge=0)]
    return_minutes: Annotated[StrictInt, Field(ge=0)]
    return_fare_pence: Pence
    available: bool


class TravelFeed(Model):
    provider: str
    is_simulated: Literal[True]
    updated_at: AwareDatetime
    origin_id: Literal["glasgow-main-campus"]
    journeys: list[JourneyRecord]


class SourceStatus(Model):
    id: Literal["events", "travel"]
    label: str
    kind: Literal["mock"]
    is_simulated: Literal[True]
    status: Literal["ok"]
    updated_at: AwareDatetime


class RecommendedActivity(Model):
    event_id: str
    title: str
    venue_name: str
    category: Category
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    ticket_cost_pence: Pence
    travel_cost_pence: Pence
    total_cost_pence: Pence
    outbound_minutes: Annotated[StrictInt, Field(ge=0)]
    return_minutes: Annotated[StrictInt, Field(ge=0)]
    arrive_at: AwareDatetime
    back_on_campus_at: AwareDatetime
    reasons: Annotated[list[str], Field(min_length=1)]


class RecommendationData(Model):
    recommended: RecommendedActivity | None
    alternatives: Annotated[list[RecommendedActivity], Field(max_length=2)]
    message: str
    sources: list[SourceStatus]


RecommendationEnvelope = Envelope[RecommendationData]
ErrorEnvelope = Envelope[dict[str, str]]
