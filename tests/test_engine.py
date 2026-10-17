from dataclasses import replace
from datetime import UTC, datetime, timedelta
from itertools import permutations
from zoneinfo import ZoneInfo

import pytest

from app.decision.domain import Activity, Journey, Preferences
from app.decision.engine import calculate


def instant(hour: int, minute: int = 0) -> datetime:
    return datetime(2031, 6, 12, hour, minute, tzinfo=UTC)


@pytest.fixture
def preferences():
    return Preferences(
        origin_id="community-centre",
        budget_pence=1000,
        depart_at=instant(16),
        return_by=instant(19),
        interests=frozenset({"games"}),
    )


@pytest.fixture
def activity():
    return Activity(
        id="event-a",
        title="Games afternoon",
        venue_id="venue-a",
        venue_name="Community room",
        category="games",
        starts_at=instant(17),
        ends_at=instant(18),
        ticket_cost_pence=300,
    )


@pytest.fixture
def journey():
    return Journey(
        destination_id="venue-a",
        outbound_minutes=15,
        return_minutes=15,
        return_fare_pence=200,
        available=True,
    )


def test_calculated_cost_includes_one_return_fare_and_both_journeys(preferences, activity, journey):
    result = calculate(preferences, (activity,), {journey.destination_id: journey})
    candidate = result.candidates[0]
    assert candidate.total_cost_pence == 500
    assert candidate.arrive_at == instant(16, 15)
    assert candidate.return_at == instant(18, 15)
    assert candidate.interest_match is True
    assert candidate.activity is activity
    assert candidate.journey is journey
    assert result.missing_journey_ids == ()


@pytest.mark.parametrize(("budget", "qualifies"), [(500, True), (499, False)])
def test_exact_budget_passes_and_one_penny_less_fails(
    preferences, activity, journey, budget, qualifies
):
    preferences = replace(preferences, budget_pence=budget)
    result = calculate(preferences, (activity,), {journey.destination_id: journey})
    assert bool(result.candidates) is qualifies


@pytest.mark.parametrize(("departure_minute", "qualifies"), [(15, True), (16, False)])
def test_arriving_at_start_passes_and_one_minute_later_fails(
    preferences, activity, journey, departure_minute, qualifies
):
    preferences = replace(preferences, depart_at=instant(16, departure_minute))
    activity = replace(activity, starts_at=instant(16, 30))
    result = calculate(preferences, (activity,), {journey.destination_id: journey})
    assert bool(result.candidates) is qualifies
    if qualifies:
        assert result.candidates[0].arrive_at == activity.starts_at


@pytest.mark.parametrize(("deadline_minute", "qualifies"), [(15, True), (14, False)])
def test_returning_at_deadline_passes_and_one_minute_later_fails(
    preferences, activity, journey, deadline_minute, qualifies
):
    preferences = replace(preferences, return_by=instant(18, deadline_minute))
    result = calculate(preferences, (activity,), {journey.destination_id: journey})
    assert bool(result.candidates) is qualifies
    if qualifies:
        assert result.candidates[0].return_at == preferences.return_by


def test_subminute_lateness_does_not_round_into_feasibility(preferences, activity, journey):
    preferences = replace(
        preferences,
        depart_at=instant(16, 45) + timedelta(microseconds=1),
    )
    result = calculate(preferences, (activity,), {journey.destination_id: journey})
    assert result.candidates == ()


def test_every_ranking_priority_is_stable_under_source_order(preferences, activity, journey):
    cases = (
        ("match-a", "games", 300, 10, 10, 200),
        ("match-b", "games", 300, 10, 10, 200),
        ("0-slow", "games", 300, 0, 30, 200),
        ("0-expensive", "games", 600, 1, 1, 200),
        ("0-unmatched", "music", 0, 0, 0, 0),
    )
    activities = tuple(
        replace(activity, id=key, venue_id=key, category=category, ticket_cost_pence=ticket)
        for key, category, ticket, _, _, _ in cases
    )
    journeys = {
        key: replace(
            journey,
            destination_id=key,
            outbound_minutes=outbound,
            return_minutes=returning,
            return_fare_pence=fare,
        )
        for key, _, _, outbound, returning, fare in reversed(cases)
    }
    expected = ["match-a", "match-b", "0-slow", "0-expensive", "0-unmatched"]
    for source_order in permutations(activities):
        result = calculate(preferences, source_order, journeys)
        assert [candidate.activity.id for candidate in result.candidates] == expected


def test_all_selected_interests_have_equal_priority(preferences, activity, journey):
    preferences = replace(preferences, interests=frozenset({"games", "music"}))
    music = replace(activity, id="music", category="music", ticket_cost_pence=200)
    result = calculate(preferences, (activity, music), {journey.destination_id: journey})
    assert [candidate.activity.id for candidate in result.candidates] == ["music", "event-a"]
    assert all(candidate.interest_match for candidate in result.candidates)


def test_feasible_nonmatching_activity_is_retained_without_false_match(
    preferences, activity, journey
):
    preferences = replace(preferences, interests=frozenset({"learning"}))
    result = calculate(preferences, (activity,), {journey.destination_id: journey})
    assert len(result.candidates) == 1
    assert result.candidates[0].interest_match is False


def test_missing_and_unavailable_journeys_exclude_activities_and_report_sorted_ids(
    preferences, activity, journey
):
    missing = replace(activity, id="z-missing", venue_id="missing")
    unavailable = replace(activity, id="a-unavailable", venue_id="closed")
    journeys = {
        journey.destination_id: journey,
        "closed": replace(journey, destination_id="closed", available=False),
    }
    result = calculate(preferences, (missing, activity, unavailable), journeys)
    assert [candidate.activity.id for candidate in result.candidates] == ["event-a"]
    assert result.missing_journey_ids == ("a-unavailable", "z-missing")


def test_empty_events_return_no_candidates(preferences, journey):
    result = calculate(preferences, (), {journey.destination_id: journey})
    assert result.candidates == ()
    assert result.missing_journey_ids == ()


def test_empty_journeys_return_no_candidates_and_report_missing_data(preferences, activity):
    result = calculate(preferences, (activity,), {})
    assert result.candidates == ()
    assert result.missing_journey_ids == ("event-a",)


def test_zero_cost_and_zero_duration_are_feasible_when_explicitly_known(
    preferences, activity, journey
):
    preferences = replace(preferences, budget_pence=0, depart_at=activity.starts_at)
    activity = replace(activity, ticket_cost_pence=0)
    journey = replace(journey, outbound_minutes=0, return_minutes=0, return_fare_pence=0)
    result = calculate(preferences, (activity,), {journey.destination_id: journey})
    assert result.candidates[0].total_cost_pence == 0
    assert result.candidates[0].arrive_at == activity.starts_at
    assert result.candidates[0].return_at == activity.ends_at


@pytest.mark.parametrize("duration_field", ["outbound_minutes", "return_minutes"])
def test_absurd_source_duration_is_infeasible_without_datetime_overflow(
    preferences, activity, journey, duration_field
):
    journey = replace(journey, **{duration_field: 10**100})
    result = calculate(preferences, (activity,), {journey.destination_id: journey})
    assert result.candidates == ()
    assert result.missing_journey_ids == ()


def test_core_works_for_other_origins_dates_and_large_budgets(preferences, activity, journey):
    shift = timedelta(days=4000)
    preferences = replace(
        preferences,
        origin_id="remote-office",
        budget_pence=30000,
        depart_at=preferences.depart_at + shift,
        return_by=preferences.return_by + shift,
    )
    activity = replace(
        activity,
        starts_at=activity.starts_at + shift,
        ends_at=activity.ends_at + shift,
        ticket_cost_pence=25000,
    )
    result = calculate(preferences, (activity,), {journey.destination_id: journey})
    assert result.candidates[0].total_cost_pence == 25200
    assert result.candidates[0].arrive_at == instant(16, 15) + shift
    assert result.candidates[0].return_at == instant(18, 15) + shift


def test_times_with_different_offsets_are_compared_as_instants(preferences, activity, journey):
    activity = replace(
        activity,
        starts_at=datetime.fromisoformat("2031-06-12T18:00:00+02:00"),
        ends_at=datetime.fromisoformat("2031-06-12T19:00:00+02:00"),
    )
    preferences = replace(preferences, depart_at=instant(15, 45), return_by=instant(17, 15))
    result = calculate(preferences, (activity,), {journey.destination_id: journey})
    assert len(result.candidates) == 1
    assert result.candidates[0].arrive_at == activity.starts_at
    assert result.candidates[0].return_at == preferences.return_by


def test_travel_crossing_daylight_saving_change_uses_elapsed_minutes(
    preferences, activity, journey
):
    london = ZoneInfo("Europe/London")
    preferences = replace(
        preferences,
        depart_at=datetime(2031, 3, 30, 0, 45, tzinfo=london),
        return_by=datetime(2031, 3, 30, 3, 45, tzinfo=london),
    )
    activity = replace(
        activity,
        starts_at=datetime(2031, 3, 30, 2, 15, tzinfo=london),
        ends_at=datetime(2031, 3, 30, 3, tzinfo=london),
    )
    journey = replace(journey, outbound_minutes=30, return_minutes=45)
    result = calculate(preferences, (activity,), {journey.destination_id: journey})
    assert result.candidates[0].arrive_at.isoformat() == "2031-03-30T02:15:00+01:00"
    assert result.candidates[0].return_at.isoformat() == "2031-03-30T03:45:00+01:00"
