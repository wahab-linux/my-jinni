import asyncio
import math
from dataclasses import dataclass
from decimal import Decimal, DecimalException, localcontext
from typing import Annotated, Any

import httpx
from pydantic import (
    AwareDatetime,
    Field,
    StrictBool,
    ValidationError,
    field_validator,
    model_validator,
)

from app.decision.domain import Activity, Journey
from app.schemas import (
    APIWarning,
    Envelope,
    EventRecord,
    JourneyRecord,
    Model,
    OriginId,
    SourceStatus,
    Venue,
)


class SourceUnavailable(Exception):
    """A required feed could not be fetched within its deadline."""


class InvalidSourceData(Exception):
    """A required feed cannot establish trustworthy activity or journey facts."""


@dataclass(frozen=True)
class SourceBundle:
    activities: tuple[Activity, ...]
    journeys: dict[str, Journey]
    sources: list[SourceStatus]
    warnings: list[APIWarning]


def _nonblank(value: str) -> str:
    if not value.strip():
        raise ValueError("Required text must not be blank")
    return value


class _Venue(Venue):
    _text = field_validator("id", "name")(_nonblank)


class _Event(EventRecord):
    venue: _Venue
    _text = field_validator("id", "title")(_nonblank)

    @model_validator(mode="after")
    def ordered_times(self) -> "_Event":
        if self.starts_at >= self.ends_at:
            raise ValueError("Event start must precede event end")
        return self


class _Journey(JourneyRecord):
    available: StrictBool
    _text = field_validator("destination_id")(_nonblank)


class _FeedHeader(Model):
    provider: Annotated[str, Field(min_length=1)]
    is_simulated: StrictBool
    updated_at: AwareDatetime
    _text = field_validator("provider")(_nonblank)

    @field_validator("is_simulated")
    @classmethod
    def simulated_only(cls, value: bool) -> bool:
        if not value:
            raise ValueError("These demo adapters require simulated source data")
        return value


class _EventFeed(_FeedHeader):
    events: list[Any]


class _TravelFeed(_FeedHeader):
    origin_id: OriginId
    journeys: list[Any]


def gbp_to_pence(value: str) -> int:
    """Convert exact GBP text; reject negative, nonfinite and fractional-penny prices."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("GBP price must be decimal text")
    try:
        amount = Decimal(value)
        if not amount.is_finite() or amount < 0:
            raise ValueError("GBP price must be finite and nonnegative")
        with localcontext() as context:
            context.prec = max(28, len(amount.as_tuple().digits) + 2)
            pence = amount * 100
            if pence != pence.to_integral_value():
                raise ValueError("GBP price must not contain fractional pence")
            return int(pence)
    except (DecimalException, OverflowError) as exc:
        raise ValueError("GBP price must be a representable decimal amount") from exc


def _source_error(response: httpx.Response) -> Exception:
    try:
        payload = response.json()
        if isinstance(payload, dict) and isinstance(payload.get("error"), dict):
            if payload["error"].get("code") == "INVALID_SOURCE_DATA":
                return InvalidSourceData("A source reported invalid data.")
    except ValueError:
        pass
    return SourceUnavailable("A required source is unavailable.")


async def _fetch_feed(
    client: httpx.AsyncClient,
    path: str,
    timeout_seconds: float,
    params: dict[str, str] | None = None,
) -> Envelope[dict[str, Any]]:
    try:
        response = await asyncio.wait_for(
            client.get(path, params=params, timeout=timeout_seconds), timeout=timeout_seconds
        )
    except (httpx.HTTPError, TimeoutError, OSError) as exc:
        raise SourceUnavailable("A required source timed out or could not be reached.") from exc
    if not response.is_success:
        raise _source_error(response)
    try:
        envelope = Envelope[dict[str, Any]].model_validate(response.json())
    except (ValueError, ValidationError) as exc:
        raise InvalidSourceData("A source returned an invalid JSON envelope.") from exc
    if envelope.error is not None:
        if envelope.error.code == "INVALID_SOURCE_DATA":
            raise InvalidSourceData("A source reported invalid data.")
        raise SourceUnavailable("A required source reported a failure.")
    return envelope


def _check_unique(records: list[Any], key: str, source: str) -> None:
    seen: set[str] = set()
    for record in records:
        identity = record.get(key) if isinstance(record, dict) else None
        if isinstance(identity, str) and identity.strip():
            if identity in seen:
                raise InvalidSourceData(f"The {source} feed contains duplicate identifiers.")
            seen.add(identity)


def _invalid_record_warning(source: str, count: int) -> APIWarning:
    return APIWarning(
        code="INVALID_RECORD_SKIPPED",
        message=f"Skipped {count} invalid {source} record(s); valid records remain in use.",
    )


def _adapt_events(records: list[Any]) -> tuple[tuple[Activity, ...], list[APIWarning]]:
    _check_unique(records, "id", "events")
    activities: list[Activity] = []
    skipped = 0
    for raw in records:
        try:
            event = _Event.model_validate(raw)
            ticket_cost = gbp_to_pence(event.price_gbp)
        except (ValueError, ValidationError):
            skipped += 1
            continue
        activities.append(
            Activity(
                id=event.id,
                title=event.title,
                venue_id=event.venue.id,
                venue_name=event.venue.name,
                category=event.category,
                starts_at=event.starts_at,
                ends_at=event.ends_at,
                ticket_cost_pence=ticket_cost,
            )
        )
    if records and not activities:
        raise InvalidSourceData("The nonempty events feed contains no valid records.")
    warnings = [_invalid_record_warning("event", skipped)] if skipped else []
    return tuple(activities), warnings


def _adapt_journeys(records: list[Any]) -> tuple[dict[str, Journey], list[APIWarning]]:
    _check_unique(records, "destination_id", "travel")
    journeys: dict[str, Journey] = {}
    skipped = 0
    for raw in records:
        try:
            record = _Journey.model_validate(raw)
        except (ValueError, ValidationError):
            skipped += 1
            continue
        journeys[record.destination_id] = Journey(
            destination_id=record.destination_id,
            outbound_minutes=record.outbound_minutes,
            return_minutes=record.return_minutes,
            return_fare_pence=record.return_fare_pence,
            available=record.available,
        )
    if records and not journeys:
        raise InvalidSourceData("The nonempty travel feed contains no valid records.")
    warnings = [_invalid_record_warning("travel", skipped)] if skipped else []
    return journeys, warnings


async def fetch_sources(
    client: httpx.AsyncClient, origin_id: str, timeout_seconds: float = 2.0
) -> SourceBundle:
    """Fetch both feeds concurrently, with an independent wall-clock deadline per request."""
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise ValueError("Source timeout must be positive and finite")
    tasks = [
        asyncio.create_task(_fetch_feed(client, "/mock/events", timeout_seconds)),
        asyncio.create_task(
            _fetch_feed(client, "/mock/travel", timeout_seconds, {"origin_id": origin_id})
        ),
    ]
    try:
        event_envelope, travel_envelope = await asyncio.gather(*tasks)
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    try:
        events = _EventFeed.model_validate(event_envelope.data)
        travel = _TravelFeed.model_validate(travel_envelope.data)
    except ValidationError as exc:
        raise InvalidSourceData("A source returned invalid feed metadata or record lists.") from exc
    if travel.origin_id != origin_id:
        raise InvalidSourceData("Travel data does not match the requested origin.")
    activities, event_warnings = _adapt_events(events.events)
    journeys, travel_warnings = _adapt_journeys(travel.journeys)
    return SourceBundle(
        activities=activities,
        journeys=journeys,
        sources=[
            SourceStatus(
                id="events",
                label=events.provider,
                kind="mock",
                is_simulated=True,
                status="ok",
                updated_at=events.updated_at,
            ),
            SourceStatus(
                id="travel",
                label=travel.provider,
                kind="mock",
                is_simulated=True,
                status="ok",
                updated_at=travel.updated_at,
                origin_id=travel.origin_id,
            ),
        ],
        warnings=[
            APIWarning(
                code="SIMULATED_DATA",
                message="Activities and travel are fictional simulated data, not live information.",
            ),
            *event_envelope.warnings,
            *travel_envelope.warnings,
            *event_warnings,
            *travel_warnings,
        ],
    )
