# PlanScope project plan

## Product and delivery

PlanScope is a desktop activity planner. Given an origin, budget, time window and interests, it recommends a feasible activity, shows alternatives and explains cost and return timing. Students planning time after class are the first MVP audience; no student identity, account or campus-only rule belongs in the reusable core.

The backend is implemented: two independently shaped simulated feeds are fetched, normalised, joined and used in actual deterministic decisions. The user changed the deliverable to a desktop application and approved reuse of frontend technology. Electron with HTML/CSS/JavaScript is the selected client stack. Wahab's client, restricted IPC bridge and managed backend launcher remain to be implemented. No desktop executable or installer is delivered yet.

## Read together

- `docs/REQUIREMENTS.md`: stable FR/BR/QR/AC IDs, scope, rules and acceptance scenarios.
- `docs/ARCHITECTURE.md`: desktop experience, application/decision core, source adapters and process lifecycle.
- `docs/API.md`, `docs/openapi.json` and `contracts/fixtures/`: the coordinated v0.2 JSON contract and explicit examples.
- `docs/TASKS.md`: ownership, dependencies, delivery checkpoints and pending acceptance.
- `docs/prompts/backend.md` and `docs/prompts/frontend.md`: backend and desktop interface handoffs.
- `desktop/README.md`: current client boundary and startup status.
- `docs/AI_USAGE.md`: actual assistance, human decisions/edits, checks and outstanding review.

A running API or passing backend test does not establish a finished desktop product or human acceptance.

## Configured MVP

- One fictional demonstration day: 2026-10-20, displayed in `Europe/London`.
- Campus as the student default; city centre as a second origin with distinct simulated travel data.
- Two independent mock API shapes: events and travel. All events, venues, fares, durations and availability are fictional and visibly labelled.
- Full attendance at one activity, returning to the selected origin using fixed estimated travel times.
- GBP integer-pence costs; five categories; one recommendation and up to two alternatives.
- Deterministic rules and factual explanations, with no runtime AI service or credentials.

The second origin demonstrates a shared activity core without student identity. It does not imply arbitrary-place/date coverage or live routing. Finance, shopping, accounts, maps, payments and a universal planning framework are outside this hackathon scope. PlanScope is the team's prototype, not an official BlackRock or Aladdin product.

## Architecture and ownership

The three layers are the desktop experience, decision/application and integration. The renderer uses a restricted preload IPC bridge to the trusted Electron main process; the main process calls the local API. Keep context isolation enabled and Node integration disabled. The renderer neither reads source files nor duplicates rules. Application/scenario code validates coverage, coordinates adapters and engine, and renders factual explanations. The pure engine performs no I/O. Adapters preserve selected-origin provenance.

| Owner | Primary files | Responsibility |
| --- | --- | --- |
| roXy | `app/`, `data/`, backend `tests/`, `scripts/` | API, scenario validation, adapters, engine and backend verification |
| Wahab | `desktop/main.cjs`, `desktop/preload.cjs`, `desktop/renderer/`, client tests | Electron window, bridge, asynchronous API calls, result/error states, launcher and UI verification |
| Together | Schemas, `contracts/fixtures/`, OpenAPI, dependencies and docs | Contract consistency, Node manifests/lockfile, integration, explanations, AI record and submission |

Keep exclusive file ownership when delegating. Coordinate shared changes before editing; never overwrite a teammate's work. The historical prompt filename `frontend.md` now describes the desktop interface. Suggested backend/frontend branch names need not change ownership.

## Rules and failure policy

All three constraints are hard requirements: ticket plus one return fare fits budget, outbound arrival meets event start, and event end plus return travel meets the deadline. Equality passes. Rank interest match, lower total cost, shorter total travel, then event ID. Nonmatching interests remain eligible with honest wording.

Unknown or unavailable travel never means zero. Travel metadata must match the selected origin. Each source call has a two-second deadline and both run concurrently. No feasible result is a successful 200 response; required-source failure is 503 and invalid/ambiguous data is 502. Structural or unsupported-scenario input returns 422 before fetching. Fixtures are explicit examples, never an automatic recovery path.

## Next integration sequence

1. Use the verified backend: 175 tests, Ruff lint/format and actual HTTP startup/calculation/shutdown checks passed on 2026-10-17. Start it with `uv run python -m app` on `127.0.0.1:8000`; `/` is JSON health and `/docs` is optional developer documentation.
2. Wahab implements the resizable Electron window, options-driven labelled controls and restricted IPC bridge, with asynchronous calls and clear loading/result/error states. Initially start the backend separately; do not delay the first real API flow for packaging.
3. Together verify campus / games / GBP 10 -> Board Game Night / GBP 5; GBP 4 -> Acoustic Hour; GBP 0 -> no match. Inspect actual responses and visible simulation/provenance labels.
4. Verify city centre uses its own journeys and excludes the 16:30 Board Game Night when leaving at 16:00. Exercise source failure and retry after a successful result, checking that old recommendations are cleared or marked stale.
5. Coordinate `package.json` and its lockfile, then implement `npm run desktop`. The launcher must manage only its own backend, report failures and leave no owned process behind on close. A managed backend uses no auto-reload. The command is planned and does not work until the desktop implementation lands.
6. Perform keyboard/tab-order, resizing, nonblocking-request, IPC, lifecycle and human code-explanation checks. Prepare the English demo, factual AI document and latest official submission requirements. Bundle Python with Electron or build/test a Windows distribution only if the working flow leaves time.

## Verification and schedule

Full backend checks passed: 175 tests, Ruff lint/format and an actual server smoke covering health, two origins, normal/lower/zero budgets and clean shutdown. The existing Starlette/httpx TestClient deprecation warning remains. These checks cover backend feasibility/ranking, normalisation, source errors, two-source influence and the generic core. Desktop client, launcher, installer and human acceptance are pending; human checkboxes remain open until the humans perform those steps.

Aim to integrate the desktop flow on Saturday and rehearse once before finishing. Suggested Sunday 10:30 onward: fixes, final checks, documentation and demo practice. Official code freeze is Sunday 18 October at 12:00 UK time; protect the final 60-90 minutes for submission and rehearsal. Suggested milestones are team planning, not additional official rules.

Completion requires a working desktop flow, calculated two-source decisions, honest failures and simulation labels, reproducible startup, both teammates' understanding and an AI report reflecting the actual process.
