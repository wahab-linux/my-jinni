# Development tasks and integration checkpoints

This executes `docs/REQUIREMENTS.md`. Backend implementation is now present; desktop delivery and human acceptance remain pending. Checkboxes below record actual team acceptance, so none is checked on the humans' behalf. Timeboxes are suggested planning, not official competition timings. Official code freeze is Sunday 18 October at 12:00 UK time. Protect the final 60-90 minutes for fixes, submission and rehearsal.

## Current status and ownership

PlanScope chooses a feasible activity from two sources using budget, time and interests. Origins, date, timezone, categories and limits are scenario configuration; students are the first audience. Return is to the selected origin. The user changed the deliverable to a desktop client and approved reuse of frontend technology; Electron with HTML/CSS/JavaScript is the selected stack.

| Package | Implementation status | Remaining evidence |
| --- | --- | --- |
| B1/B2/B3 | Implemented; 175 tests, Ruff lint/format and live HTTP startup/calculation/shutdown checks passed on 2026-10-17. Existing Starlette/httpx TestClient deprecation warning remains. | Human code understanding and desktop integration. |
| F1/F2 | Electron client, restricted bridge and managed launcher remain to be implemented. | Real window, asynchronous flow, states, keyboard/resizing, lifecycle and client tests. |
| S0/S1 | v0.2 backend contract retained; examples moved to `contracts/fixtures/`. | Team contract review, real desktop integration, rehearsal and final submission/AI checks. |

| Owner | Owns | Coordinates first |
| --- | --- | --- |
| roXy | Backend: `app/`, `data/`, backend `tests/`, `scripts/` | Schema/source contracts |
| Wahab | `desktop/main.cjs`, `desktop/preload.cjs`, `desktop/renderer/`, client tests | `package.json`, Node lockfile, shared examples and IPC boundary |
| Together | Scope, contract, integration, explanations, demo and factual AI log | `docs/`, dependencies, schemas, `contracts/fixtures/`, OpenAPI |

Assign AI agents bounded tasks with exclusive files. One coordinator integrates each checkpoint. Do not assign Wahab's files to another agent while he is editing them. All tracked content remains English.

The renderer uses only a restricted preload bridge; the trusted Electron main process makes asynchronous API calls. Enable `contextIsolation`, disable `nodeIntegration`, validate allowed IPC operations, and avoid arbitrary URLs or general IPC exposure. This requires no renderer CORS relaxation. It is a desktop application, not a standalone website.

## Requirement -> package -> checkpoint -> acceptance

S0/B1/B2/B3/F1/F2/S1 retain their IDs from `REQUIREMENTS.md`; T0/T1/T2/T3 slice the delivery work into runnable checkpoints.

| Requirement IDs | Package | Checkpoints | Acceptance IDs |
| --- | --- | --- | --- |
| FR-01/02/07; BR-01-04; QR-03 | S0: contract | T0 | AC-01/02/13 |
| FR-03/09; BR-01/05-10; QR-02 | B1: adapters | T1-B normal path -> T2-B failures -> T2-I origin check | AC-03/08/09/12 |
| FR-04/05/06; BR-01-05; QR-01/05 | B2: pure engine | T1-B normal path -> T2-B boundaries -> T2-I portability | AC-04-07/10/12 |
| FR-01/02/07; QR-02/03/06 | B3: wiring | T1-B real POST -> T1-I -> T2-B/T2-I errors/config | AC-01/02/03/09/12/13 |
| FR-01/02/08; QR-04 | F1: desktop form/bridge | T1-F basics -> T1-I -> T2-F validation | AC-01/02/11/12 |
| FR-05/06/08/09; QR-04 | F2: desktop results/states/lifecycle | T1-F result -> T1-I -> T2-F/T2-I full states | AC-07/09-13 |
| FR-10; QR-03/05-07 | S1: joint acceptance | T1-I -> T2-I -> T3 | AC-01-14 |

AC-03's synthetic baseline differs from the default fixture: the default Board Game Night starts at 16:30, while the generic test example starts at 17:00. Expected times must follow the actual inputs.

## Execution order

The backend normal flow, hardening and coordinating verification are complete. Wahab implements the first desktop slice, then integrate immediately: `T0 -> T1-F -> T1-I -> T2-F -> T2-I -> T3`. T1-B/T2-B preserve the backend acceptance criteria and evidence; they are not instructions to recreate completed code or repeat unchanged tests without cause.

### T0 - Confirm v0.2 and desktop boundary

- **Owner:** Together
- **Timebox:** 10-15 minutes
- **Inputs:** Requirements, API/OpenAPI, shared fixtures and desktop handoff
- **Output:** Shared fields, units, ranking, ownership and Electron boundary
- **Runnable acceptance:** `uv run python -m app`; check health, options, both mock feeds and a real recommendation. Check `return_at`, pence, offsets, budget cap, origins and explicit travel-origin query. `/` is JSON health; `/docs` is developer documentation. The former supported-request 501 stub has been replaced.
- [ ] Both understand that student life is a scenario and the deliverable is a desktop application.
- [ ] Coordinate Node manifest/lockfile changes and keep the v0.2 JSON contract unchanged.
- [ ] Record actual decisions; do not claim all code has been human-reviewed.

### T1-B - Real backend slice

- **Owner:** roXy with backend AI
- **Status:** Implemented and verified by the full backend run and live HTTP smoke
- **Inputs:** Default request, events and selected-origin travel feeds
- **Output:** Actual fetching/adaptation, feasibility/ranking, explanations and POST
- **Runnable acceptance:** Campus / games / 1000p -> `event-board-games`, 500p, return 18:15; 400p -> `event-music`; 0p -> successful no match. `recommendations_ready` is true. Both source feeds materially influence the result; no static success fallback.
- [ ] Each teammate can locate and explain the adapter, constraints and ranking.
- [ ] Share the actual endpoint/check results and distinguish backend completion from pending desktop work.

### T1-F - Minimum usable Electron slice

- **Owner:** Wahab with interface AI
- **Timebox:** 45-60 minutes after contract review
- **Inputs:** Backend, options, v0.2 request/response examples and `docs/prompts/frontend.md`
- **Output:** `desktop/main.cjs`, `preload.cjs` and `renderer/`; resizable window, labelled controls, restricted bridge and one calculated result
- **Dependency:** T0; start backend separately for the first integration
- **Runnable acceptance:** Launch the implemented Electron entry, load options asynchronously, select origin/preferences, and submit the exact request through the restricted bridge. Main process calls the backend; renderer has no Node access. No browser product or direct source-file reads. Planned `npm run desktop` is not available until its manifest/entry land.
- [ ] Controls derive origins/date/defaults/budget cap from options.
- [ ] Exact integer-pence and aware-date serialisation, visible simulation label and neutral return-to-origin wording.
- [ ] GUI remains responsive during options/recommendation requests.

### T1-I - First desktop integration

- **Owner:** Together
- **Timebox:** 15 minutes immediately after T1-F
- **Inputs:** Backend and desktop on one synchronised revision
- **Output:** One real desktop input-to-result flow and a short issue list
- **Runnable acceptance:** Campus / games / GBP 10 -> Board Game Night / GBP 5; change to GBP 4 -> Acoustic Hour; GBP 0 -> no match. Inspect requests and responses through development tooling/logs without displaying implementation details in the product. No automatic fixture fallback.
- [ ] Each person explains input -> both feeds -> constraints -> ranking -> displayed result.
- [ ] Fix contract/bridge mismatches before visual polish or packaging.

### T2-B - Backend rules, failures and regression

- **Owner:** roXy with backend AI
- **Status:** Implemented; full run passed with 175 tests and Ruff lint/format
- **Inputs:** BR rules, source and integration tests
- **Output:** Evidence for boundaries, all ranking priorities, source errors and both-source influence
- **Runnable acceptance:** Run AC-02-10 backend checks: 500p passes/499p fails in the synthetic baseline; exact/one-minute-late outbound and return; source-order stability and tie-breakers; missing/unavailable journeys; valid empty feeds; safely skipped records versus all-invalid/ambiguous feeds; origin mismatch. Independently change event price and travel fare/duration. Each source has a two-second deadline; failure is 503 and invalid data is 502. No real Internet or sleeps are required by tests.
- [ ] Both distinguish 200/no match, 422/input, 502/invalid source and 503/unavailable source.
- [ ] Confirm no fabricated zero values, fixed answers, exposed stack traces or concealed source failures.

### T2-F - Desktop states and managed launcher

- **Owner:** Wahab with interface AI
- **Timebox:** 60-90 minutes after T1-I
- **Inputs:** Working desktop slice and error/warning examples
- **Output:** Alternatives, cost breakdown, reasons/provenance, loading/empty/error/retry, keyboard/resizing and owned-backend lifecycle
- **Runnable acceptance:** Check AC-11 with labelled controls, tab order, focus, resizing and long reasons. Exercise missing interests, reversed time, exact GBP conversion, options failure, 422/502/503/network error, repeated submission and stale responses. A failed new request clears or marks the old result stale while preserving inputs. Coordinate `package.json` and lockfile; implement/document `npm run desktop` only when it works.
- **Lifecycle acceptance:** Launcher starts a loopback backend if needed, awaits readiness without freezing UI, and uses no development auto-reload. Report startup/port conflicts. Close/reopen stops only a backend it owns; never terminate a separately started service. Test those cases. Python bundling/installer is optional and remains unclaimed until built and launched.
- [ ] Simulation, provenance and warnings remain visible; real failures never become fixture success.
- [ ] Record whether each check used the real API, controlled failures or an explicitly labelled fixture preview.
- [ ] Context isolation enabled, renderer Node integration disabled and IPC methods/inputs restricted.

### T2-I - Second origin and regression

- **Owner:** Together
- **Timebox:** 20-30 minutes after T2-F
- **Inputs:** Both origins, complete desktop flow and backend regression results
- **Output:** Second-origin evidence, integrated error/retry and lifecycle check
- **Runnable acceptance:** Select city centre; request/travel provenance must show `glasgow-city-centre`. `venue-west` uses 35/30 minutes and 400p versus campus 15/15 and 200p. Leaving at 16:00 excludes the 16:30 Board Game Night. Separately shift synthetic engine data to another date; unchanged relative outcomes demonstrate the generic core, while unsupported app dates still return 422. Verify no match, controlled source failure/retry, close/reopen and a separately started backend.
- [ ] Both understand that two configurations do not imply unlimited locations/dates or live travel data.
- [ ] Both explain scenario configuration, source integration and pure decision rules separately.

### T3 - Verify, explain and prepare submission

- **Owner:** roXy: backend/architecture; Wahab: desktop/demo; together: review, AI record and submission
- **Timebox:** 30-45 minutes; protect final 60-90-minute buffer before freeze
- **Inputs:** Integrated desktop application, actual checks and latest official instructions
- **Output:** Accurate README/architecture, reproducible desktop command, AI document and short English demo/Q&A
- **Runnable acceptance:** AC-13/14: `uv run ruff check .`, `uv run ruff format --check .`, `uv run pytest`, relevant client checks, actual desktop launch and lifecycle smoke. Backend-only startup remains `uv run python -m app`. Rehearse normal result -> lower budget -> source failure/retry. Each person actually reads/explains their code and records manual edits. `/docs` is optional development tooling, never the product demo.
- [ ] Record actual tools/models, generated work, decisions/edits and checks; no invented review or final AI level.
- [ ] Check latest official submission requirements; these documents alone do not establish compliance.
- [ ] Exclude credentials, virtual environments, `node_modules`, temporary renders and the opening PDF.
- [ ] Claim a Windows package/installer only if it was built and actually launched.

## If time runs short

Keep a working desktop window, real two-source calculation, all three feasibility checks, clear simulation/failure states, critical tests and one complete demo. Prioritise the real API flow before packaging; document exact development startup if packaging is deferred. Defer animation, extra polish, more categories/dates/providers and live integrations. Use the existing second origin as the architecture check. Never claim an unimplemented requirement passed.
