# AfterClass project plan

## Product boundary

AfterClass helps people choose an activity using their interests, budget, available time, and journey constraints. Students choosing after-class activities are the first MVP audience. The reusable scope is activity selection; a universal decision platform for finance, shopping, or arbitrary industries is not part of this hackathon.

Core story: Given a departure point, budget, time window, and interests, recommend one feasible activity, show alternatives, and explain the total cost and return time.

## Read the requirements before building

- `docs/REQUIREMENTS.md`: requirement IDs, P0/P1 scope, business/data rules, quality requirements, acceptance scenarios, and assumptions.
- `docs/ARCHITECTURE.md`: reusable activity core, scenario/application policy, source adapters, and extension limits.
- `docs/API.md` and `docs/openapi.json`: v0.2 contract and migration from the scaffold's earlier campus-specific fields.
- `docs/TASKS.md`: small work packages with owners, dependencies, outputs, timeboxes, and runnable acceptance checks.
- `docs/prompts/backend.md` and `docs/prompts/frontend.md`: copyable implementation instructions in English.
- `docs/AI_USAGE.md`: actual AI assistance, human decisions/edits, checks, and submission draft.

Requirements, architecture, API contracts, work packages, implementation prompts, and AI logs are maintained separately. Agree the user decision and acceptance criteria first, then develop in dependency order. A page or successful startup alone does not establish that the business requirements are complete.

## MVP configuration

- Student-oriented experience, with campus as the default departure and return point.
- One supported demonstration day, 2026-10-20 in Europe/London. This is scenario data, not a restriction in the reusable request/decision model.
- A city-centre origin with its own transport feed checks that activity selection does not require student identity or campus-specific semantics.
- Two independent mock source APIs: activities and travel. All activities, venues, fares, durations, and availability are fictional and labelled simulated.
- Travel times are fixed estimates, not scheduled buses or a live routing service. Return is to the chosen origin.
- One recommendation and up to two alternatives. Deterministic ranking and fact-based explanations, with no runtime LLM.

The second origin is an architecture/contract acceptance scenario, not a commitment to build separate products or interfaces for multiple audiences during the hackathon.

## Architectural responsibility

1. Experience: render available scenario options and request states. The UI reads capabilities from the API rather than hardcoding campus or supported dates.
2. Application/scenario: select supported origins/dates, validate source capabilities, coordinate fetching, and map failures to the shared API envelope.
3. Decision: pure activity feasibility and ranking over normalised inputs. No student-role checks, campus constants, demo date, FastAPI, network, or file I/O.
4. Integration: fetch independent feeds, convert source formats, preserve provenance, and validate origin/data consistency.

These responsibilities fit the challenge's three layers: experience; decision/application; data integration. Scenario configuration is a boundary inside the application, not a new deployed service.

## Rules and failure policy

- Ticket plus return travel must fit the budget; outbound arrival must not miss the start; event end plus return travel must meet the return deadline. Equality at each boundary is allowed.
- Rank by interest match, then lower total cost, shorter total travel, and stable activity ID. Selected interests have equal priority.
- Missing/unavailable journeys exclude the affected activity; unknown cost/time is never zero. A mismatched source origin must never be used for ranking.
- No feasible activity is a successful empty result. Required-source failure is an error, not a reason to silently use a success fixture. Invalid source structure differs from no results.
- Model syntax validation and scenario capability validation are different: a structurally valid request may still ask for an unsupported origin or date.

## Ownership and integration

| Owner | Primary files | Responsibility |
| --- | --- | --- |
| User | `app/`, `data/`, `tests/`, `scripts/` | Scenario validation, adapters, pure engine, API and tests |
| Wahab | `web/index.html`, `web/styles.css`, new web JS/assets | Options-driven form, results, error states, accessibility |
| Together | Schemas, fixtures, OpenAPI, integration acceptance | Agree and version contract changes before merging |
| Each person | AI usage notes; coordinate shared edits | Record actual tool use, decisions, edits and verification |

Suggested branches remain `backend` and `frontend`. The first handoff is a narrow vertical slice, not a complete backend and a complete frontend developed in isolation. Follow `docs/TASKS.md` for timeboxes and acceptance checks. Pull the v0.2 contract before starting or merging v0.1 work.

## Current delivery status

This revision provides requirements, architecture boundaries, migrated scaffold contracts/fixtures, and implementation handoffs. The calculated recommendation engine and interactive frontend remain outstanding. The explicit HTTP 501 stub must be replaced by actual source integration and decision logic; static success fixtures do not prove that implementation works.

## Schedule and completion

Aim for an early end-to-end slice, then complete edge cases, source failures and documentation. Before finishing Saturday, run the complete main flow and rehearse once. Suggested Sunday 10:30 onward: fixes, final verification, documentation and demo practice. Official code freeze is Sunday 12:00 UK time; suggested milestones are team planning, not additional official rules.

Completion means the P0 requirement acceptance scenarios pass, both people can explain the flow and trade-offs, simulated data is visible, the app starts with one command, and the AI report reflects actual work. Do not tick requirements merely because scaffold tests pass.
