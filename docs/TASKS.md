# Development tasks and integration checkpoints

Current AI interface increment, 2026-10-18: root owns model suggestions, evidence-flow verification and documentation; the integration agent owns the shared native AI panel/settings/locales; the engine agent owns Electron/Vertex UI verification. Ask AI is visible, while library/settings remain closed. Preserve Vertex ADC and all previous source/provider boundaries. No extraction of document measurements into ranking is implemented or implied. Earlier closed-question descriptions below are superseded for desktop Ask AI.

Current authorized work is frontend consolidation and concise copy: desktop follows the same `web/` interface as the browser, with the visible name Jinni. Native operations move behind the platform adapter while retaining existing API/storage/provider boundaries. Preserve the five languages and locale invariants. Remove redundant text while keeping essential units, simulation, trade-offs, errors and cloud disclosure. No new backend domain, retrieval, provider, currency or decision policy is requested.

Current brand is `Jinni` (user decision, 2026-10-18). Verify the original lamp mark and product title in both experiences, keep the actual decision flow central, and inspect fresh light/dark/mobile screenshots. Preserve existing data paths and technical contracts. Distinguish mocked-provider checks from any separately observed real-key test. The user approved a narrow English-content exception for native UI catalogs and localization fixtures; other tracked content remains English.

The latest scope is additive v0.5: a general comparison workspace across market, travel, student, sustainability and custom criteria/data. [GENERAL_DECISIONS.md](GENERAL_DECISIONS.md) owns its frozen contract. Preserve all previous activity/library/provider/browser work, and treat the detailed activity flow below as a retained example rather than the product boundary.

| New package | Owner and files | Acceptance |
| --- | --- | --- |
| G1: generic scoring and feeds | Backend: `app/comparison/`, `data/decisions/`, Python tests | FR-17/18; AC-26/27. Five configurable presets, custom domains, bounded source calls, deterministic hard-limit/weighted scoring and honest failures. |
| G2: decision-first experiences | Desktop renderer and `web/`, respective UI tests | FR-19/20; AC-28. Central comparisons, closed tool dialogs, preserved themes and activity example, accessible motion and opt-in sounds. |
| G3: contract and integration | Coordinator: restricted bridge, actual decision chat context, static export, OpenAPI and parity tests | FR-20; AC-29/30. Preserve authoritative results, exact citations, privacy and complete browser/Python calculation parity. |

G1-G3 are implemented and automatically verified: 566 Python tests, 50 desktop/31 browser Node tests, 32 actual Electron/30 Chromium checks, lint/format and static build. All desktop providers are mocked; no new human acceptance or live access is inferred. Earlier counts below remain historical delivery checkpoints.

The user's additional GitHub Pages request is implemented as the browser edition described in [BROWSER.md](BROWSER.md), with a separate static build/deployment workflow and browser/parity tests. The previous desktop-only task boundary is superseded for that deliverable. Hosted activation and actual deployment status must be recorded separately from local validation and committing.

This executes `docs/REQUIREMENTS.md`. The activity and confirmed library/AI backends, Electron interface, restricted bridge and managed launcher are implemented. All 348 Python tests, 39 JavaScript unit tests and 16 real Windows Electron checks pass, alongside lint/format. Electron provider checks mock only OpenAI transport; human/live-provider acceptance remains pending. Checkboxes record actual team acceptance, so none is checked on the humans' behalf. Timeboxes are suggested planning, not official competition timings. Official code freeze is Sunday 18 October at 12:00 UK time. Protect the final 60-90 minutes for fixes, submission and rehearsal.

## Current status and ownership

The user subsequently approved multiple mainstream providers, specifically DeepSeek. `docs/AI_PROVIDERS.md` defines additive v0.4, preserving planner/library/citation contracts. All four adapters, defaults, isolated keys, header compatibility, recipient disclosure and stale-answer clearing are implemented. Verification passed 474 Python tests, 46 JavaScript unit tests and 20 actual Electron checks plus lint/format, with all cloud transports mocked. Live account/model access remains separate. Existing baseline counts below describe earlier verified increments.

Jinni compares options from separate catalog and measurement sources using configurable priorities and hard limits. Domain assumptions remain in scenario configuration. The precise activity example still checks budget, time, interests and return to the selected origin. Electron with HTML/CSS/JavaScript remains the desktop stack, with a separately supported static browser edition.

The user also confirmed keeping the planner while adding one local source library and cited AI questions using OpenAI. The deterministic planner remains keyless. `docs/AI_EXTENSION.md` defines additive contract v0.3; every v0.2 activity field is preserved. Local SQLite, lexical retrieval and optional AI are now approved scope, with no cloud notebooks/sync, OCR, URL ingestion or embeddings.

| Package | Implementation status | Remaining evidence |
| --- | --- | --- |
| B1/B2/B3 | Earlier planner baseline implemented; 175 tests, Ruff lint/format and actual loopback HTTP startup/calculation/shutdown checks passed on 2026-10-17. Existing Starlette/httpx TestClient deprecation warning remains. | Preserve regression checks; human code understanding and desktop integration. This count does not cover the extension. |
| F1/F2 | Electron window/renderer, restricted preload/main bridge, API client, validation and managed launcher are implemented. Desktop ESLint, 39 unit tests and 16 actual Windows Electron checks pass, including planner/states/keyboard/resize and owned/external lifecycle. | Human acceptance, code understanding and rehearsal. |
| K1/K2 | Backend implemented; 348 Python tests plus Ruff lint/format and real desktop integration checks pass, preserving planner regressions. No real OpenAI call/key was used. | Human understanding and separately recorded real-provider/account access. Existing Starlette/httpx warning remains. |
| K3 | Desktop source selection, paste/native import/view/delete, chat/citations, cloud notice and session-only key/model controls pass real-window checks with mocked OpenAI transport. | Human acceptance and separately recorded live OpenAI check. |
| S0/S1 | Additive contract v0.3 retains v0.2 planner fields; examples live in `contracts/fixtures/`; automated desktop integration passed. | Team contract review, rehearsal and final submission/AI checks. |

| Owner | Owns | Coordinates first |
| --- | --- | --- |
| roXy | Planner and library/AI backend: `app/`, `data/`, backend `tests/`, `scripts/` | Schemas, ingestion/retrieval limits, citation and planner-context contracts |
| Wahab | Shared `web/` interface, native `desktop/` integration and client tests; planner/library/chat/session-key experience | `package.json`, Node lockfile, shared examples and restricted IPC/native picker boundary |
| Together | Scope, contract, integration, explanations, demo and factual AI log | `docs/`, dependencies, schemas, `contracts/fixtures/`, OpenAPI |

Assign AI agents bounded tasks with exclusive files. One coordinator integrates each checkpoint. Do not assign Wahab's files to another agent while he is editing them. All tracked content remains English.

The renderer uses only `window.myJinni`, frozen in `docs/DESKTOP_BRIDGE.md`; trusted main-process modules own asynchronous loopback HTTP, the native picker, session key and backend lifecycle. Context isolation and sandbox are enabled and Node integration is disabled. Inputs and the exact sender/frame/local URL are checked; no arbitrary URLs, paths or general IPC are exposed. Keys stay only in main-process memory and enter the header on chat requests, never JSON or persistence. HTTP status/envelopes, cancelled imports and connection failures remain distinct.

Initial setup is `uv sync` and `npm ci`, which require Internet access. Electron 44.9.0 and Playwright 1.64.1 are pinned in `package-lock.json`; use Node 22 or later for setup. After setup, Windows users can double-click `start-my-jinni.cmd` or run `.\start-my-jinni.cmd`, using project-local Electron without Node/npm on the launch terminal's PATH. The developer commands `npm run desktop` and `node --run desktop` need Node in that terminal; Codex's bundled runtime is not automatically available in ordinary PowerShell. Default library storage remains the backend's canonical location when data variables are unset. Optional `MY_JINNI_BACKEND_URL` permits only loopback HTTP origins; explicit `MY_JINNI_DATA_DIR` isolates storage and the Electron profile for tests. No bundled Python runtime or installer is delivered.

## Requirement -> package -> checkpoint -> acceptance

S0/B1/B2/B3/F1/F2/S1 retain their IDs from `REQUIREMENTS.md`; T0/T1/T2/T3 retain the planner delivery checkpoints. K1/K2/K3 append the approved source-library/backend/desktop work without renumbering existing requirements or acceptance scenarios.

| Requirement IDs | Package | Checkpoints | Acceptance IDs |
| --- | --- | --- | --- |
| FR-01/02/07; BR-01-04; QR-03 | S0: contract | T0 | AC-01/02/13 |
| FR-03/09; BR-01/05-10; QR-02 | B1: adapters | T1-B normal path -> T2-B failures -> T2-I origin check | AC-03/08/09/12 |
| FR-04/05/06; BR-01-05; QR-01/05 | B2: pure engine | T1-B normal path -> T2-B boundaries -> T2-I portability | AC-04-07/10/12 |
| FR-01/02/07; QR-02/03/06 | B3: wiring | T1-B real POST -> T1-I -> T2-B/T2-I errors/config | AC-01/02/03/09/12/13 |
| FR-01/02/08; QR-04 | F1: desktop form/bridge | T1-F basics -> T1-I -> T2-F validation | AC-01/02/11/12 |
| FR-05/06/08/09; QR-04 | F2: desktop results/states/lifecycle | T1-F result -> T1-I -> T2-F/T2-I full states | AC-07/09-13 |
| FR-10; QR-03/05-07 | S1: joint acceptance | T1-I -> T2-I -> T3 | AC-01-14 |
| FR-11/12; QR-09/10 | K1: local library | K1 -> K3 -> T3 | AC-15/16 |
| FR-13/14/15; BR-11-14; QR-08/10 | K2: cited AI and actual planner context | K2 -> K3 -> T3 | AC-17-21 |
| FR-11-15; QR-04/09/10 | K3: desktop source/chat/session settings | K3 -> T3 | AC-15/17-19/21-23 |

AC-03's synthetic baseline differs from the default fixture: the default Board Game Night starts at 16:30, while the generic test example starts at 17:00. Expected times must follow the actual inputs.

## Execution order

Planner hardening, K1/K2 and desktop implementation are complete, with 348 Python tests, 39 JavaScript unit tests and 16 real Windows Electron checks passed. Preserve the integration evidence in `T0 -> T1-F -> T1-I -> T2-F -> T2-I -> T3`; finish live-provider and human review/rehearsal gates. T1-B/T2-B and K1/K2 retain their evidence rather than instructing a rebuild. Coordinate K3 against the additive interface. Repeat tests when changes or unresolved concerns warrant it; do not treat mocks as live-provider or human acceptance.

### T0 - Confirm additive v0.3 and desktop boundary

- **Owner:** Together
- **Timebox:** 10-15 minutes
- **Inputs:** Requirements, API/OpenAPI, `docs/AI_EXTENSION.md`, shared fixtures and desktop handoff
- **Output:** Preserved activity fields/units/ranking; additive source/chat contract, ownership and Electron/key/cloud boundary
- **Runnable acceptance:** `uv run python -m app`; check health, options, both mock feeds and a real recommendation. Check `return_at`, pence, offsets, budget cap, origins and explicit travel-origin query. `/` is JSON health; `/docs` is developer documentation. The former supported-request 501 stub has been replaced.
- [ ] Both understand that student life is a scenario and the deliverable is a desktop application.
- [ ] Coordinate Node manifest/lockfile changes; preserve v0.2 activity fields while adding v0.3 source/chat operations.
- [ ] Both understand that the planner stays keyless; optional AI sends questions/selected snippets to OpenAI and needs separate live acceptance.
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
- **Status:** Window, renderer and named bridge implemented; actual Windows integration checks passed. Human acceptance remains pending.
- **Timebox:** 45-60 minutes after contract review
- **Inputs:** Backend, options, v0.2 request/response examples and `docs/prompts/frontend.md`
- **Output:** `desktop/main.cjs`, `preload.cjs` and `renderer/`; resizable window, labelled controls, restricted bridge and one calculated result
- **Dependency:** T0 and installed Python/Node dependencies
- **Runnable acceptance:** Run `npm run desktop` or `node --run desktop`; load options asynchronously, select origin/preferences and submit the exact request through the named bridge. Main calls the real backend and the renderer has no Node access. Record the real-window result separately from module tests.
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
- **Status:** Implemented; the earlier planner baseline passed with 175 tests and Ruff lint/format, before the source-library extension
- **Inputs:** BR rules, source and integration tests
- **Output:** Evidence for boundaries, all ranking priorities, source errors and both-source influence
- **Runnable acceptance:** Run AC-02-10 backend checks: 500p passes/499p fails in the synthetic baseline; exact/one-minute-late outbound and return; source-order stability and tie-breakers; missing/unavailable journeys; valid empty feeds; safely skipped records versus all-invalid/ambiguous feeds; origin mismatch. Independently change event price and travel fare/duration. Each source has a two-second deadline; failure is 503 and invalid data is 502. No real Internet or sleeps are required by tests.
- [ ] Both distinguish 200/no match, 422/input, 502/invalid source and 503/unavailable source.
- [ ] Confirm no fabricated zero values, fixed answers, exposed stack traces or concealed source failures.

### T2-F - Desktop states and managed launcher

- **Owner:** Wahab with interface AI
- **Status:** State handling and managed launcher implemented; 39 JavaScript unit tests and real Windows window/process lifecycle checks pass.
- **Timebox:** 60-90 minutes after T1-I
- **Inputs:** Working desktop slice and error/warning examples
- **Output:** Alternatives, cost breakdown, reasons/provenance, loading/empty/error/retry, keyboard/resizing and owned-backend lifecycle
- **Runnable acceptance:** Check AC-11 with labelled controls, tab order, focus, resizing and long reasons. Exercise missing interests, reversed time, exact GBP conversion, options failure, 422/502/503/network error, repeated submission and stale responses. A failed new request clears or marks the old result stale while preserving inputs. Verify the documented one-command source-run launch against the pinned dependencies.
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
- **Inputs:** Integrated desktop planner/library/chat, actual checks and latest official instructions
- **Output:** Accurate README/architecture, reproducible desktop command, AI document and short English demo/Q&A
- **Runnable acceptance:** AC-13/14 plus AC-15-23: `uv run ruff check .`, `uv run ruff format --check .`, `uv run pytest`, relevant client checks, actual desktop launch and lifecycle smoke. Backend-only startup remains `uv run python -m app`. Rehearse normal plan -> lower budget -> source failure/retry; import/select a guide -> cited question -> original quote; show insufficient evidence and safe AI failure. Compare chat's planner JSON with the ordinary endpoint. Record injected-provider results separately from any real OpenAI request. Each person reads/explains their code and records manual edits. `/docs` is development tooling, never the product demo.
- [ ] Record actual tools/models, generated work, decisions/edits and checks; no invented review or final AI level.
- [ ] Check latest official submission requirements; these documents alone do not establish compliance.
- [ ] Exclude credentials, virtual environments, `node_modules`, temporary renders and the opening PDF.
- [ ] Claim a Windows package/installer only if it was built and actually launched.
- [ ] Record whether actual OpenAI account/model access, live answer quality, desktop source/chat flow and session-key privacy were checked; leave unperformed steps pending.
- [ ] Explain that exact citation ID/quote verification does not prove semantic entailment, and `store: false` does not guarantee every provider-retention policy.

### K1 - Local source library and selected retrieval

- **Owner:** roXy with backend AI
- **Status:** Backend implemented; covered by the coordinating 348-Python-test/lint/format baseline and actual desktop import/view/delete/restart checks. Human acceptance remains pending.
- **Inputs:** Additive source schemas/API, import limits and one local library
- **Output:** Bounded pasted-text/TXT/Markdown/text-PDF extraction, page-aware chunks, SQLite outside the checkout, source detail/delete and selected-source lexical retrieval
- **Runnable acceptance:** AC-15/16: import/list/view/restart/delete using a temporary database; enforce 5 MiB, 150,000 extracted characters, 40 PDF pages and 20 sources. Reject unsupported/corrupt/encrypted/textless documents clearly. Mark fictional/generated guides using optional `is_simulated` import metadata and check it survives storage/evidence/citations; false does not certify truth. Verify no partial import and no remaining chunks/retrieval entries after deletion. Filenames are metadata; original file bytes, keys and chat history are not stored.
- [ ] Keep this one local collection; no cloud notebooks/sync, OCR, URL ingestion or embeddings.
- [ ] Show extracted original text and one-based PDF pages for citation viewing; do not claim a retained original-file archive.
- [ ] Verify lexical search uses only selected sources and document its paraphrase/cross-language limits.

### K2 - Cited OpenAI answers and actual planner context

- **Owner:** roXy with backend AI
- **Status:** Backend implemented; coordinating 348-Python-test/lint/format baseline includes injected-provider/API checks and planner regression. Real provider/account access remains untested.
- **Inputs:** K1 evidence, `docs/AI_EXTENSION.md`, exact existing preference/planner models and injected provider client
- **Output:** Additive source/chat API, fixed OpenAI Responses adapter, exact citation checks, safe errors and ephemeral calculated planner evidence
- **Runnable acceptance:** AC-17-21: supply only selected evidence, at most six chunks or five plus planner context. Reject forged IDs, changed quotes, malformed/refused/incomplete output and supported answers without citations. No matching evidence gives 200 insufficient evidence without a call/key. Test auth/quota/model/network/deadline failures through MockTransport without real keys, Internet or sleeps. Explicit form preferences return the ordinary endpoint's actual `RecommendationData`; planner validation/source failures propagate. The ordinary planner still works keylessly.
- **Boundary acceptance:** Questions are at most 2,000 characters; provider input/output are bounded and the generation deadline is 30 seconds. Use Structured Outputs and `store: false`; no automatic retries/model changes, tools or cloud file/vector-store upload. No key, snippets, question or upstream error body leaks through errors/logs.
- [ ] Treat source text/titles as untrusted data; no document-requested actions.
- [ ] Preserve authoritative planner feasibility/cost/time/ranking. Do not infer or change form preferences from question text.
- [ ] Keep `planner-context` ephemeral, simulated and absent from persistent library listings.
- [ ] Describe citation checks as ID/quote membership, with human evidence viewing; do not claim semantic truth verification.

### K3 - Desktop source/chat integration and live acceptance

- **Owner:** Wahab for desktop; together for live/human checks
- **Status:** Renderer, native-picker bridge and main-memory session settings implemented and passed actual Windows checks with mocked OpenAI transport. Live-provider and human checks remain pending. The native-picker test substitutes its result before actual reading/upload/extraction.
- **Inputs:** K1/K2 API and published additive contract; existing planner/client
- **Output:** Source panel, native import picker, selection, chat/citation view, optional current-form inclusion and session-only key/model settings through restricted IPC
- **Runnable acceptance:** Open a real Electron window; import/select a fictional guide, ask a cited question and open the original quote/page. Deselect a source and verify it is excluded. Exercise insufficient evidence, missing/deleted source, invalid key, timeout and retry after success without stale answers. Pass current form explicitly and show actual planner JSON separately from AI prose. Preserve simulation labels and keep planner controls usable without a key.
- **Privacy acceptance:** Show the cloud notice before generation; only selected bounded snippets/questions leave the device. The trusted main process keeps the key in memory and adds the loopback header. Restart clears it; inspect settings/database/logs for absence. A native picker controls uploads; no arbitrary renderer paths or general IPC exposure.
- **Live-provider acceptance:** No real OpenAI key is currently configured. With the team's own key, the optional `uv run python -m scripts.verify_openai` uses a hidden session-only prompt for a real provider/citation check; separately inspect an answer/citation in the app. Neither live check has been performed. Do not treat mocked provider/API success as live access, quality or human usability evidence.
- [ ] Record actual desktop, session-key, live-provider and human review outcomes separately.
- [ ] Preserve clear failure status/retry and the cloud disclosure; `store: false` is not a blanket retention promise.

## If time runs short

Keep a working decision workspace, actual two-source calculations, hard constraints, local import/selection, checked viewable citations, honest simulation/failure/privacy states, critical tests and one complete demo. Preserve the five initial scenarios, custom inputs and requested controllable effects. Prioritise working API/IPC and browser parity before packaging or further polish. Defer live service integrations, cloud notebooks, OCR, URL ingestion and embeddings. Record unperformed real-provider and human acceptance honestly.
