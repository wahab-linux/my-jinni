from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True, slots=True)
class Preferences:
    origin_id: str
    budget_pence: int
    depart_at: datetime
    return_by: datetime
    interests: frozenset[str]


@dataclass(frozen=True, slots=True)
class Activity:
    id: str
    title: str
    venue_id: str
    venue_name: str
    category: str
    starts_at: datetime
    ends_at: datetime
    ticket_cost_pence: int


@dataclass(frozen=True, slots=True)
class Journey:
    destination_id: str
    outbound_minutes: int
    return_minutes: int
    return_fare_pence: int
    available: bool


@dataclass(frozen=True, slots=True)
class Candidate:
    activity: Activity
    journey: Journey
    total_cost_pence: int
    arrive_at: datetime
    return_at: datetime
    interest_match: bool


@dataclass(frozen=True, slots=True)
class DecisionResult:
    candidates: tuple[Candidate, ...]
    missing_journey_ids: tuple[str, ...]
