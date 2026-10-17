from datetime import UTC, timedelta

from app.decision.domain import Activity, Candidate, DecisionResult, Journey, Preferences

MINUTE = timedelta(minutes=1)


def calculate(
    preferences: Preferences,
    activities: tuple[Activity, ...],
    journeys: dict[str, Journey],
) -> DecisionResult:
    candidates: list[Candidate] = []
    missing_journey_ids: list[str] = []
    departure = preferences.depart_at.astimezone(UTC)
    deadline = preferences.return_by.astimezone(UTC)

    for activity in activities:
        journey = journeys.get(activity.venue_id)
        if journey is None or not journey.available:
            missing_journey_ids.append(activity.id)
            continue

        total_cost = activity.ticket_cost_pence + journey.return_fare_pence
        if total_cost > preferences.budget_pence:
            continue

        starts_at = activity.starts_at.astimezone(UTC)
        ends_at = activity.ends_at.astimezone(UTC)
        if journey.outbound_minutes > (starts_at - departure) // MINUTE:
            continue
        if journey.return_minutes > (deadline - ends_at) // MINUTE:
            continue

        arrival = departure + journey.outbound_minutes * MINUTE
        return_at = ends_at + journey.return_minutes * MINUTE
        candidates.append(
            Candidate(
                activity=activity,
                journey=journey,
                total_cost_pence=total_cost,
                arrive_at=arrival.astimezone(preferences.depart_at.tzinfo),
                return_at=return_at.astimezone(activity.ends_at.tzinfo),
                interest_match=activity.category in preferences.interests,
            )
        )

    candidates.sort(
        key=lambda candidate: (
            not candidate.interest_match,
            candidate.total_cost_pence,
            candidate.journey.outbound_minutes + candidate.journey.return_minutes,
            candidate.activity.id,
        )
    )
    return DecisionResult(
        candidates=tuple(candidates),
        missing_journey_ids=tuple(sorted(missing_journey_ids)),
    )
