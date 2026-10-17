# Frontend development prompt

You are developing AfterClass in `wahab-linux/my-jinni` for the DYHTG 2026 BlackRock challenge. I am Wahab and own the frontend; my teammate owns the backend. Deliver an interactive UI, real integration, and failure states in stages. Do not choose a different product or stop at a design proposal.

Read `AGENTS.md`, `docs/REQUIREMENTS.md`, `docs/PROJECT_PLAN.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/TASKS.md`, `docs/openapi.json`, and `web/fixtures/` first. Valid recommendation requests may still return an explicit 501. Use an explicit fixture mode during development, but normal mode must call the real API.

## Product boundary and collaboration

- The product serves people with budget, time, and interest constraints. Student life after class is the first MVP scenario, not a student-only API/UI restriction. Keep the AfterClass brand and campus defaults, but read origins/dates from configuration.
- Use existing HTML/CSS/vanilla JavaScript. Own `web/index.html`, `web/styles.css`, new `web/*.js`, and assets. Do not edit `app/`, backend tests, shared fixtures, contracts, or dependencies without coordination. Do not add accounts, maps, chat, payments, a database, a new framework, or an arbitrary-scenario platform.
- FastAPI serves `/`, `/static/`, and `/fixtures/`. Use `/static/...` for assets, relative API URLs, and retain `uv run python -m app`.
- Use the v0.2 field `return_at` and general UI wording such as “Return to starting point” or “Back by”; do not depend on `back_on_campus_at`. Preserve integer pence and the `data/error/warnings` envelope.
- Where subagents are available, assign an isolated money/time helper module or read-only accessibility review with explicit file ownership. The coordinating agent owns the page and request states; do not have agents edit the same files concurrently.

## Stage 1: minimum page and first real integration, approximately 45–60 minutes

This covers `T1-F` and `T1-I` (F1 and first integration):

1. Fetch `GET /api/v1/options` for `origins[{id,label}]`, `supported_dates`, `demo_date`, `timezone`, `max_budget_pence`, interests, and `default_request`. `demo_date` is only a default. Do not read the obsolete singular `origin_id/origin_label`. An options-loading failure needs a clear message and retry, not an unusable submission form.
2. Build a complete simple form for origin, supported date, budget in GBP, departure time, return deadline, and at least one interest. Use server defaults and short English labels/buttons. Even if only one date is supported, read it from options rather than hardcoding a campus or date in JavaScript.
3. Validate money to at most two decimal places and convert precisely to integer pence; reject scientific notation, negatives, and values over `max_budget_pence`. Send ISO timestamps with UTC offsets, independent of browser timezone. The current single supported date may use the corresponding offset in `default_request`; do not treat `+01:00` as correct for arbitrary dates. Future additional dates require tested conversion for `options.timezone` or coordinated date-offset metadata.
4. In normal mode POST to the real `/api/v1/recommendations`. Start with one card showing title, total cost, event/arrival/return times, reasons, and sources. Keep “Simulated demo data” visible. Show a real 501 as “Recommendation engine is not ready yet”; never substitute a success fixture.
5. You may offer explicit `?demo=success|empty|error` fixture modes with a persistent “Campus fixture preview — not calculated” label. Normal mode must not fall back to fixtures. The static error file is fetched with HTTP 200 but represents a real 503 response.
6. Deliver the first integration before visual polishing: on the same synchronised revision, verify the real default request returns `event-board-games`, £5, and 18:15 return; £4 returns `event-music`. Inspect Network for correct fields/units. Record actual API status and issues, then continue Stage 2.

## Stage 2: complete states, accessibility, and handoff

This covers `T2-F`, `T2-I`, and `T3` (F2/S1):

1. Complete the recommendation card with ticket + return travel = total, venue, category, event times, arrival/return, and explanations; show at most two alternatives. Display times in `Europe/London` and GBP with two decimals. Travel fare already includes the return journey.
2. Handle initial, options-loading failure, submitting, success, no match, 422, 502, 503, 501, and network-error states. Distinguish a successful no-match search from a system error. Show actionable errors, warnings, provenance, and simulation labels without raw stack traces.
3. Prevent duplicate submissions and stale responses overwriting newer results. Clear old results on failure or clearly mark them stale; preserve inputs for retry. Block invalid submission before options load, without interests, or with reversed times and explain the issue.
4. Populate origins from `options.origins`. Selecting `glasgow-city-centre` sends that ID, with general return wording. Display the travel source's `origin_id` or readable label for verification; do not retain campus-only fields/copy. Do not calculate recommendations or invent travel in the frontend.
5. Build a clear branded responsive page and check desktop and approximately 390px widths. Use labels, aria-live async status, readable errors, keyboard support, and visible focus. Prioritise a complete readable flow before visual polish.
6. Check £0/£4/£10, missing interests, malformed/reversed times, every fixture state, real source failure, initial 501, stale responses, and repeat clicks. Once the backend works, verify real default/£4/£0 and second-origin requests produce actual changed results. State explicitly if a failure was checked only with an injected transport or fixture.
7. Lightweight tests for genuine money/time helper risks are welcome; do not add a heavy build pipeline. Run the required `uv run ruff check .`, `uv run ruff format --check .`, and `uv run pytest`. Report browser checks separately; Python checks do not verify the UI.
8. Coordinate README instructions, demo steps, and `docs/AI_USAGE.md`. Record actual tools/models, AI-generated work, human decisions/edits, and checks. Mark unperformed human review, editing, and final AI-level decisions as outstanding rather than claiming them.

Report files changed in each stage, actual browser/command checks, the distinction between live API and fixture previews, remaining issues, and the conversion/request-state/rendering code I should personally understand. Keep small clear commits, follow the session's Git authorisation, and do not force-push or rewrite a teammate's history.
