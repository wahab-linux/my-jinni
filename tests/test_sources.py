import asyncio
import copy
import json
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from app.settings import DATA_DIR
from app.sources.adapters import (
    InvalidSourceData,
    SourceUnavailable,
    fetch_sources,
    gbp_to_pence,
)


@pytest.fixture
def feeds():
    return {
        "events": json.loads((DATA_DIR / "events.json").read_text(encoding="utf-8")),
        "travel": json.loads((DATA_DIR / "travel.json").read_text(encoding="utf-8")),
    }


def envelope(data: Any) -> dict[str, Any]:
    return {"data": data, "error": None, "warnings": []}


def fetch(
    feeds: dict[str, Any],
    *,
    overrides: dict[str, Any] | None = None,
    handler: Callable | None = None,
    origin_id: str = "glasgow-main-campus",
):
    def route(request: httpx.Request) -> httpx.Response:
        source = request.url.path.rsplit("/", 1)[-1]
        payload = (
            overrides[source] if overrides and source in overrides else envelope(feeds[source])
        )
        return httpx.Response(200, json=payload)

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler or route), base_url="http://sources.test"
        ) as client:
            return await fetch_sources(client, origin_id)

    return asyncio.run(run())


@pytest.mark.parametrize(
    ("price", "expected"),
    [
        ("0.00", 0),
        ("3.00", 300),
        ("1.23", 123),
        ("1.2300", 123),
        ("0.29", 29),
        ("1E-2", 1),
        ("1234567890123456789012345678.99", 123456789012345678901234567899),
    ],
)
def test_gbp_conversion_is_exact(price, expected):
    assert gbp_to_pence(price) == expected


@pytest.mark.parametrize(
    "price",
    ["-0.01", "NaN", "Infinity", "-Infinity", "0.001", "3.009", "", "hello", 3.0, True],
)
def test_gbp_rejects_invalid_negative_nonfinite_or_fractional_pence(price):
    with pytest.raises(ValueError):
        gbp_to_pence(price)


def test_large_fractional_penny_is_not_rounded_away():
    with pytest.raises(ValueError):
        gbp_to_pence("1234567890123456789012345678.001")


def test_both_sources_are_normalised_with_provenance_and_explicit_origin(feeds):
    requests = []

    def handler(request):
        source = request.url.path.rsplit("/", 1)[-1]
        requests.append(request)
        return httpx.Response(200, json=envelope(feeds[source]))

    bundle = fetch(feeds, handler=handler)
    assert len(bundle.activities) == 8
    assert bundle.activities[0].ticket_cost_pence == 300
    assert bundle.activities[0].venue_id == "venue-west"
    assert bundle.journeys["venue-west"].return_fare_pence == 200
    assert not bundle.journeys["venue-sport"].available
    travel_request = next(request for request in requests if request.url.path == "/mock/travel")
    assert travel_request.url.params["origin_id"] == "glasgow-main-campus"
    assert travel_request.extensions["timeout"]["read"] == 2.0
    assert [source.id for source in bundle.sources] == ["events", "travel"]
    assert bundle.sources[0].label == feeds["events"]["provider"]
    assert bundle.sources[0].updated_at.isoformat() == feeds["events"]["updated_at"]
    assert bundle.sources[0].origin_id is None
    assert bundle.sources[1].label == feeds["travel"]["provider"]
    assert bundle.sources[1].origin_id == "glasgow-main-campus"
    assert all(source.is_simulated and source.status == "ok" for source in bundle.sources)
    assert [warning.code for warning in bundle.warnings] == ["SIMULATED_DATA"]


@pytest.mark.parametrize("source", ["events", "travel"])
def test_valid_empty_record_list_is_not_an_error(feeds, source):
    records_key = "events" if source == "events" else "journeys"
    feeds[source][records_key] = []
    bundle = fetch(feeds)
    assert (bundle.activities if source == "events" else bundle.journeys) in ((), {})


def test_safe_bad_records_are_skipped_and_not_interpreted_as_zero(feeds):
    bad_event = copy.deepcopy(feeds["events"]["events"][0])
    bad_event.update(id="broken-event", price_gbp="0.001")
    feeds["events"]["events"].append(bad_event)
    bad_journey = copy.deepcopy(feeds["travel"]["journeys"][0])
    bad_journey.update(destination_id="broken-venue", outbound_minutes=None)
    feeds["travel"]["journeys"].append(bad_journey)
    bundle = fetch(feeds)
    assert len(bundle.activities) == 8
    assert "broken-venue" not in bundle.journeys
    warnings = [warning for warning in bundle.warnings if warning.code == "INVALID_RECORD_SKIPPED"]
    assert len(warnings) == 2
    assert "event" in warnings[0].message
    assert "travel" in warnings[1].message


@pytest.mark.parametrize(
    "changes",
    [
        {"id": " "},
        {"title": " "},
        {"venue": {"id": " ", "name": "Venue"}},
        {"venue": {"id": "venue-a", "name": " "}},
        {"category": "unknown"},
        {"starts_at": "2026-10-20T20:00:00+01:00"},
        {"ends_at": "2026-10-20T16:30:00+01:00"},
        {"starts_at": "2026-10-20T16:30:00"},
        {"price_gbp": 3.0},
        {"price_gbp": "-1.00"},
        {"price_gbp": "NaN"},
    ],
)
def test_nonempty_all_invalid_event_records_fail_the_feed(feeds, changes):
    event = copy.deepcopy(feeds["events"]["events"][0])
    event.update(changes)
    feeds["events"]["events"] = [event]
    with pytest.raises(InvalidSourceData, match="no valid records"):
        fetch(feeds)


@pytest.mark.parametrize(
    "changes",
    [
        {"destination_id": " "},
        {"outbound_minutes": -1},
        {"outbound_minutes": 1.5},
        {"outbound_minutes": True},
        {"return_minutes": "15"},
        {"return_fare_pence": False},
        {"return_fare_pence": -1},
        {"available": "false"},
        {"available": 1},
    ],
)
def test_nonempty_all_invalid_journeys_fail_the_feed(feeds, changes):
    journey = copy.deepcopy(feeds["travel"]["journeys"][0])
    journey.update(changes)
    feeds["travel"]["journeys"] = [journey]
    with pytest.raises(InvalidSourceData, match="no valid records"):
        fetch(feeds)


@pytest.mark.parametrize("source", ["events", "travel"])
@pytest.mark.parametrize("invalid_duplicate", [False, True])
def test_duplicate_identity_is_ambiguous_even_if_one_record_is_invalid(
    feeds, source, invalid_duplicate
):
    records_key = "events" if source == "events" else "journeys"
    duplicate = copy.deepcopy(feeds[source][records_key][0])
    if invalid_duplicate:
        duplicate["price_gbp" if source == "events" else "outbound_minutes"] = "bad"
    feeds[source][records_key].append(duplicate)
    with pytest.raises(InvalidSourceData, match="duplicate"):
        fetch(feeds)


@pytest.mark.parametrize("source", ["events", "travel"])
@pytest.mark.parametrize(
    "changes",
    [
        {"provider": " "},
        {"is_simulated": False},
        {"is_simulated": 1},
        {"updated_at": "2026-10-20T15:50:00"},
        {"updated_at": "not-a-time"},
        {"unexpected": "field"},
    ],
)
def test_invalid_feed_metadata_is_rejected(feeds, source, changes):
    feeds[source].update(changes)
    with pytest.raises(InvalidSourceData, match="metadata"):
        fetch(feeds)


@pytest.mark.parametrize("source", ["events", "travel"])
@pytest.mark.parametrize("bad_records", [None, {}, "not-a-list"])
def test_invalid_top_level_record_collection_is_rejected(feeds, source, bad_records):
    feeds[source]["events" if source == "events" else "journeys"] = bad_records
    with pytest.raises(InvalidSourceData, match="metadata"):
        fetch(feeds)


@pytest.mark.parametrize(
    "payload",
    [None, [], {"data": {}, "error": {"code": "FAIL", "message": "Fail"}}, {"data": []}],
)
def test_invalid_envelopes_are_rejected(feeds, payload):
    with pytest.raises(InvalidSourceData, match="envelope"):
        fetch(feeds, overrides={"events": payload})


def test_travel_origin_must_match_requested_origin(feeds):
    feeds["travel"]["origin_id"] = "another-origin"
    with pytest.raises(InvalidSourceData, match="requested origin"):
        fetch(feeds)


def test_second_origin_uses_its_own_values(feeds):
    feeds["travel"] = json.loads((DATA_DIR / "travel-city-centre.json").read_text(encoding="utf-8"))
    bundle = fetch(feeds, origin_id="glasgow-city-centre")
    assert bundle.journeys["venue-west"].outbound_minutes == 35
    assert bundle.journeys["venue-west"].return_fare_pence == 400
    assert bundle.sources[1].origin_id == "glasgow-city-centre"


@pytest.mark.parametrize("source", ["events", "travel"])
@pytest.mark.parametrize("status_code", [404, 500, 503])
def test_http_failures_do_not_return_partial_results(feeds, source, status_code):
    def handler(request):
        requested = request.url.path.rsplit("/", 1)[-1]
        if requested == source:
            return httpx.Response(status_code, text="Upstream unavailable")
        return httpx.Response(200, json=envelope(feeds[requested]))

    with pytest.raises(SourceUnavailable):
        fetch(feeds, handler=handler)


def test_explicit_upstream_invalid_data_error_remains_invalid_data(feeds):
    def handler(request):
        return httpx.Response(
            502,
            json={"data": None, "error": {"code": "INVALID_SOURCE_DATA", "message": "Bad"}},
        )

    with pytest.raises(InvalidSourceData):
        fetch(feeds, handler=handler)


@pytest.mark.parametrize("source", ["events", "travel"])
def test_httpx_timeout_is_unavailable(feeds, source):
    def handler(request):
        requested = request.url.path.rsplit("/", 1)[-1]
        if requested == source:
            raise httpx.ReadTimeout("Injected timeout", request=request)
        return httpx.Response(200, json=envelope(feeds[requested]))

    with pytest.raises(SourceUnavailable):
        fetch(feeds, handler=handler)


def test_malformed_json_is_invalid_data(feeds):
    def handler(request):
        return httpx.Response(200, content=b"not JSON")

    with pytest.raises(InvalidSourceData, match="JSON envelope"):
        fetch(feeds, handler=handler)


def test_a_real_deadline_cancels_a_hanging_transport_without_sleeps(feeds):
    cancelled = []

    async def handler(request):
        if request.url.path == "/mock/events":
            try:
                await asyncio.Future()
            finally:
                cancelled.append(True)
        return httpx.Response(200, json=envelope(feeds["travel"]))

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler), base_url="http://sources.test"
        ) as client:
            with pytest.raises(SourceUnavailable):
                await fetch_sources(client, "glasgow-main-campus", timeout_seconds=0.001)

    asyncio.run(run())
    assert cancelled == [True]


def test_failure_cancels_the_other_request_immediately(feeds):
    cancelled = []

    async def handler(request):
        if request.url.path == "/mock/events":
            try:
                await asyncio.Future()
            finally:
                cancelled.append(True)
        return httpx.Response(503)

    with pytest.raises(SourceUnavailable):
        fetch(feeds, handler=handler)
    assert cancelled == [True]


def test_upstream_warnings_are_preserved(feeds):
    payload = envelope(feeds["events"])
    payload["warnings"] = [{"code": "SOURCE_NOTE", "message": "Fixture provenance note."}]
    bundle = fetch(feeds, overrides={"events": payload})
    assert [warning.code for warning in bundle.warnings] == ["SIMULATED_DATA", "SOURCE_NOTE"]
