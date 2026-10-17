# Backend development prompt

You are developing AfterClass in `wahab-linux/my-jinni` for the DYHTG 2026 BlackRock challenge. I own the backend; Wahab owns the frontend. Implement the bounded tasks below, delivering a working vertical slice first and then completing rules and failure handling. Do not stop at a plan or choose a different product.

Read `AGENTS.md`, `docs/REQUIREMENTS.md`, `docs/PROJECT_PLAN.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/TASKS.md`, `docs/openapi.json`, `app/schemas.py`, `app/scenario.py`, `data/`, and `web/fixtures/` first. Report concrete discrepancies before coordinating shared-contract changes; do not guess fields.

## Product boundary and collaboration

- AfterClass chooses activities under budget, time, and interest constraints. Student life after class is the first MVP scenario; **student identity is not an algorithm requirement**. No student account, student ID, or campus-only location is needed.
- Keep three layers: experience is the `web/` UI; decision receives normalised activities, travel for the requested origin, and preferences; integration fetches and adapts both feeds. FastAPI application orchestration handles the API, scenario validation, and layer assembly without an additional service. The decision layer must not import FastAPI, use HTTP/files, or hardcode a campus, demo date, or UI copy.
- `app/scenario.py` configures supported origins/dates and the budget cap; application validation rejects unsupported requests. Options expose `origins`, `supported_dates`, `max_budget_pence`, and `default_request`; `demo_date` is only a default. The general request model validates structure, units, aware times, and ordering. The current demo offers campus and `glasgow-city-centre`, with one supported date. Keep student defaults without making them algorithm restrictions.
- Build a configurable activity tool, not accounts, a database, an arbitrary-domain plugin platform, maps, payments, scraping, machine learning, or a runtime LLM.
- Own `app/`, `data/`, `tests/`, and `scripts/`. Use the existing Python/FastAPI/httpx/Pydantic/uv stack and retain `uv run python -m app`.
- Wahab owns frontend implementation in `web/`. Coordinate changes to `app/schemas.py`, `docs/API.md`, `docs/openapi.json`, `web/fixtures/`, dependencies, and shared documentation first. The v0.2 contract uses `return_at`, replacing `back_on_campus_at`; preserve units, remaining request fields, and the `data/error/warnings` envelope.
- Where subagents are available, delegate adapters and the pure engine as bounded tasks with explicit file ownership; retain API wiring and integration with the coordinating agent. Do not have agents edit the same files. Inspect existing work before assigning tasks and avoid duplicating the teammate's work.

## Stage 1: a real minimum vertical slice, approximately 45–60 minutes

This is `T1-B` in `docs/TASKS.md` (normal paths of B1/B2/B3), using the agreed v0.2 contract, both mock feeds, and the default request. Valid requests currently return an explicit HTTP 501. That is a scaffold state; never present the success fixture as a calculated result.

1. Define simple normalised activity/travel/preference models and a pure calculation function. Implement the normal path: fetch both feeds, convert money precisely, join venues, apply all three feasibility rules, and rank deterministically. Do not add product features.
2. Inject `httpx.AsyncClient` and call `/mock/events` and `/mock/travel?origin_id=<requested origin>`. Use `ASGITransport` for same-process feeds instead of a hardcoded port. Check that travel `data.origin_id` matches the request; never reuse campus travel after changing the origin.
3. Convert GBP price strings with `Decimal` to integer pence. Travel fare already includes the return journey. Use aware datetimes and require total cost `<= budget_pence`, `depart_at + outbound_minutes <= starts_at`, and `ends_at + return_minutes <= return_by`. Equality is allowed.
4. Sort by interest match descending, total cost ascending, total travel minutes ascending, then event ID ascending. Return one recommendation, up to two alternatives, and explanations from actual facts. Use `return_at` for the return timestamp.
5. Wire the actual engine into the endpoint and set health's `recommendations_ready` to true only when it works. Replace scaffold-only 501/ready=false assertions in `tests/test_contract.py` with business assertions; do not preserve the stub to satisfy obsolete tests or remove useful contract checks.
6. Deliver integration immediately: start the app and POST the default request. It should select `event-board-games`, cost 500 pence, and have `return_at=2026-10-20T18:15:00+01:00`; budget 400 should select `event-music`. Give Wahab the real status, startup command, and example request for `T1-I`. Confirm the contract is unchanged, then continue Stage 2 without waiting for every visual improvement.

Stage 1 proves only the normal flow. Explicitly list unfinished error handling, tests, and submission work; do not claim full completion.

## Stage 2: rules, failures, scenario independence, and handoff

This covers `T2-B`, `T2-I`, and `T3` (finish B1/B2 and complete B3/S1):

1. Exclude missing/unavailable travel; unknown cost or duration is never zero. Budget 0 in the default window returns HTTP 200 with `recommended: null` and no alternatives. Validate return fare and outbound/return durations separately.
2. Safely skippable malformed records produce `INVALID_RECORD_SKIPPED`; missing travel uses `MISSING_JOURNEY`. Invalid feed structure, ambiguous duplicate IDs, a nonempty feed with no valid records, or a travel feed for the wrong origin produce 502 `INVALID_SOURCE_DATA`. Structurally valid empty lists are normal no-match cases.
3. Implement testable bounded timeouts/failures for both sources. A required feed failure/timeout is 503 `SOURCE_UNAVAILABLE`; do not substitute stale/fixed recommendations or conceal a feed failure with a warning. Do not expose stack traces.
4. Preserve strict nonnegative integer pence, distinct interests, aware times, ordering, and extra-field validation. Application scenario validation returns the shared 422 error for unsupported origins/dates or a budget over `options.max_budget_pence`; general models and the pure engine must not be bound to the demo day or budget cap. All successful calculated responses retain provenance/timestamps, `SIMULATED_DATA`, and simulation labels; travel provenance records the requested `origin_id`.
5. Unit-test equality and just-over boundaries for budget/outbound/return; interest ranking and every tie-breaker; no match; missing travel; malformed records. Integration tests must use both actual mock HTTP routes and independently change event prices and travel costs/durations to prove both feeds affect results. Also test source failure, invalid data, and origin mismatch. Inject transports; do not depend on Internet access or sleeps.
6. Request `glasgow-city-centre` and verify the same activity's cost/arrival or return uses that origin's travel and differs from campus. The city-centre journey to `venue-west` takes 35 minutes outbound, so leaving at 16:00 misses the 16:30 board-game start; do not reuse the campus 15-minute route. Separately give the pure engine synthetic valid data for a non-campus origin and another date to prove it does not depend on students or the demo day. This does not claim that the MVP supplies data for that date.
7. You may update implementation status, remove the 501 scaffold description, and run `uv run python -m scripts.export_openapi`; inspect the diff. Coordinate business-field changes before editing the shared contract.
8. Run `uv run ruff check .`, `uv run ruff format --check .`, and `uv run pytest`. Start the app and check default, £4, £0, and the second origin. Integrate with Wahab for success, changed results, no match, and failure/retry.
9. Coordinate README/architecture trade-offs and `docs/AI_USAGE.md` updates. Record actual tools/models, generated work, human decisions/edits, and checks. The user chose the product and backend role; human approval of rules, code review/edits, and the final AI level must reflect what actually happens. Never claim review on the humans' behalf.

Report files changed in each stage, actual commands/results, actual integration outcomes, outstanding work, limitations, and the adapter/feasibility/ranking code I should personally read and explain. Keep small clear commits, follow the session's Git authorisation, and do not force-push or rewrite a teammate's history.
