# Development tasks and integration checkpoints

This executes `docs/REQUIREMENTS.md`; it is not a completion report. All checkboxes start open. Timeboxes are suggested elapsed working time from team agreement, not official competition timings. Official code freeze is Sunday 18 October at 12:00 UK time. Protect the final 60–90 minutes for fixes, submission checks and rehearsal.

## Product and ownership

**General core:** choose a feasible activity from two sources under budget, time and interest constraints. **Configured scenario:** supported origins, dates, timezone, categories, budget limit and defaults. **First MVP:** a Glasgow student planning time after class. Student identity is not required. Return to the selected origin remains the MVP rule; a different return destination is deferred.

| Owner | Owns | Coordinates first |
| --- | --- | --- |
| You | Backend: `app/`, `data/`, `tests/`, `scripts/` | Schema/source contracts |
| Wahab | Frontend: `web/` | Shared fixtures; no competing field names |
| Together | Scope, contract, integration, code explanations, demo, factual AI log | `docs/`, dependencies, `app/schemas.py`, `web/fixtures/`, OpenAPI |

AI agents implement the human owners' tasks; the humans decide scope and understand the flow. When delegating, assign bounded deliverables and exclusive file lists. Backend adapters/engine can be separate tasks; an isolated frontend helper or read-only accessibility review can be separate. One coordinator integrates each checkpoint. Do not assign all frontend files to another agent while Wahab is editing them.

## Requirement → package → checkpoint → acceptance

S0/B1/B2/B3/F1/F2/S1 are the work-package IDs from `REQUIREMENTS.md`. T0/T1/T2/T3 below are delivery checkpoints that slice those packages into smaller runnable increments, not a second competing package list. A package may contribute to both the first flow and later hardening.

| Requirement IDs | Package | Checkpoints | Acceptance IDs |
| --- | --- | --- | --- |
| FR-01/02/07; BR-01–04; QR-03 | S0: contract | T0 | AC-01/02/13 |
| FR-03/09; BR-01/05–10; QR-02 | B1: adapters | T1-B normal path → T2-B failures → T2-I origin check | AC-03/08/09/12 |
| FR-04/05/06; BR-01–05; QR-01/05 | B2: pure engine | T1-B normal path → T2-B boundaries → T2-I portability | AC-04–07/10/12 |
| FR-01/02/07; QR-02/03/06 | B3: wiring | T1-B real POST → T1-I → T2-B/T2-I errors/config | AC-01/02/03/09/12/13 |
| FR-01/02/08; QR-04 | F1: form | T1-F basics → T1-I → T2-F validation | AC-01/02/11/12 |
| FR-05/06/08/09; QR-04 | F2: result/states | T1-F one result → T1-I → T2-F/T2-I full states | AC-07/09–12 |
| FR-10; QR-03/05–07 | S1: joint acceptance | T1-I → T2-I → T3 | AC-01–14 |

AC-03's synthetic test baseline and the repository's default demo fixture are different setups. Keep their event start times separate: the default Board Game Night starts at 16:30; the generic AC-03 test example starts at 17:00. Expected amounts/times must follow the actual input used.

## Execution order

`T0 → (T1-B ∥ T1-F) → T1-I → (T2-B ∥ T2-F) → T2-I → T3`

Do not wait for both large halves to be “finished”. The first checkpoint is a real default recommendation in the browser; later checkpoints add failures and prove that another origin uses its own travel data.

### T0 — Agree v0.2

- **Owner:** Together
- **Timebox:** 10–15 minutes first
- **Inputs:** Requirements, API docs, OpenAPI, request/response fixtures and source examples
- **Output:** Agreed story, fields, ranking, ownership and a shared baseline revision
- **Dependency:** None
- **Runnable acceptance:** `uv run python -m app`; GET options and both mock feeds, including city-centre travel. The initial scaffold's default POST must show its honest 501. Together check `return_at`, pence, offsets, `max_budget_pence`, options origins and travel origin query.
- [ ] Both agree that student life is a scenario; future accounts/platform work is excluded.
- [ ] Record actual decisions rather than claiming all code has been human-reviewed.

### T1-B — Minimum real backend slice

- **Owner:** You with backend AI
- **Timebox:** 45–60 minutes after T0, parallel with T1-F
- **Inputs:** Agreed models/default request, `/mock/events`, `/mock/travel?origin_id=...`
- **Output:** B1/B2/B3 normal path: fetching/adaptation, pure feasibility/ranking, wired POST and a real default integration test
- **Dependency:** T0 only; do not wait for UI
- **Runnable acceptance:** Real default POST combines both feeds and returns `event-board-games`, 500p, `return_at` 18:15; 400p returns `event-music`. Replace obsolete 501/ready=false assertions only when actual calculation works; retain useful contract tests.
- [ ] No success-fixture fallback or network/files/FastAPI in the decision layer.
- [ ] Share the endpoint and list unfinished edge cases honestly.

### T1-F — Minimum usable frontend slice

- **Owner:** Wahab with frontend AI
- **Timebox:** 45–60 minutes after T0, parallel with T1-B
- **Inputs:** Options contract, request fixture and explicitly labelled success fixture
- **Output:** F1/F2 normal path: configured form, exact money/time serialisation, one result card, live POST wiring and honest 501
- **Dependency:** T0; calculation need not be ready
- **Runnable acceptance:** Load `/`, choose origin/preferences, inspect fields in browser Network. Explicit fixture preview, if implemented, is labelled; normal mode only uses real API status. A preview selector is optional, not a reason to delay integration.
- [ ] Origins, date, defaults and budget cap come from options, not campus/date constants.
- [ ] Visible simulation label and general return-to-origin wording.

### T1-I — First integration

- **Owner:** Together
- **Timebox:** 15 minutes immediately after both T1 slices
- **Inputs:** T1-B and T1-F on one synchronised revision
- **Output:** One browser input-to-calculated-result flow and a short issue list
- **Dependency:** T1-B + T1-F.
- **Runnable acceptance:** Start once; normal browser mode requests £10/games and gets Board Game Night £5, then £4 and gets Acoustic Hour. Inspect both responses and confirm no fixture fallback.
- [ ] Each person explains input → both feeds → filters → result once.
- [ ] Fix contract mismatches now, before independent polish.

### T2-B — Rules, errors and tests

- **Owner:** You with backend AI
- **Timebox:** 60–90 minutes after T1-I
- **Inputs:** Working slice, BR rules and error catalogue
- **Output:** Complete B1/B2/B3: bounded failures, all rules, boundary and two-source integration tests
- **Dependency:** T1-I.
- **Runnable acceptance:** Execute AC-02–10: budget 500 passes/499 fails in its synthetic baseline; exact/one-minute-late outbound and return boundaries; all tie-breakers; no match; missing/unavailable travel; valid empty feeds; malformed records versus invalid whole feed; wrong origin; timeout/failure. Independently change event price and travel fare/duration and observe changed feasibility/ranking.
- [ ] 200/no match, 502/invalid source and 503/unavailable source stay distinct.
- [ ] No invented zero values, fixed answers, stack traces or hidden whole-feed failures.

### T2-F — Complete UI states

- **Owner:** Wahab with frontend AI
- **Timebox:** 60–90 minutes after T1-I, parallel with T2-B
- **Inputs:** Working form/result and error/warning examples
- **Output:** Complete F1/F2: alternatives, cost breakdown, provenance, loading/empty/error/retry and accessible responsive UI
- **Dependency:** T1-I; explicit fixture preview may cover unfinished backend error states
- **Runnable acceptance:** AC-11 plus desktop/~390px and keyboard use; missing interests; reversed time; exact £ conversion; options failure; loading/no result/422/501/502/503/network error; repeat click and stale response. Error preserves inputs without presenting old recommendations as fresh.
- [ ] Simulation/provenance/warnings remain visible; real failure never becomes fixture success.
- [ ] Record whether each check used real API, a controlled transport or fixtures.

### T2-I — Second origin and regression

- **Owner:** Together
- **Timebox:** 20–30 minutes after T2-B/T2-F
- **Inputs:** Both origins' mock data and integrated UI/backend
- **Output:** S1 evidence of a second configured origin without engine edits; integrated error/retry check
- **Dependency:** T2-B + T2-F.
- **Runnable acceptance:** AC-12: select city centre in the real UI; request and travel provenance show `glasgow-city-centre`. `venue-west` travel is 35/30 minutes and 400p, versus campus 15/15 and 200p. Default city-centre departure at 16:00 must exclude the 16:30 Board Game Night; returning it with campus values fails acceptance. Separately shift synthetic engine data to another date without rule edits; unsupported app dates remain 422. Verify £0/no match and a controlled source failure/retry.
- [ ] Two configurations do not imply unlimited places/dates or real travel data.
- [ ] Both explain scenario configuration, decision and adapters separately.

### T3 — Verify, explain and prepare submission

- **Owner:** You: backend checks/architecture; Wahab: UI/demo; together: review/AI record/submission
- **Timebox:** 30–45 minutes; protect final 60–90-minute buffer before freeze
- **Inputs:** Integrated app, actual checks and latest official submission instructions
- **Output:** Accurate README, architecture/trade-offs, AI document, short English demo/Q&A and clean startup
- **Dependency:** T2-I; documentation notes can accumulate earlier
- **Runnable acceptance:** AC-13/14: `uv run ruff check .`, `uv run ruff format --check .`, `uv run pytest`; start with `uv run python -m app`; rehearse default → lower budget → source failure. Each person actually reads/explains relevant code and records actual manual edits.
- [ ] Record real tools/models, generated work, decisions/edits and check results; no invented review/final AI level.
- [ ] Check latest official submission requirements; these docs alone do not establish compliance.
- [ ] Exclude credentials, `.venv`, temporary renders and the opening PDF.

## If time runs short

Keep the real two-source calculation, all three feasibility checks, simulation labels, source-failure handling, critical boundary tests and one complete demo. Defer animation, extra visual polish, more categories/dates/providers and live integrations. Use the already configured second origin as a small architecture check; add no further scenarios during the hackathon. Never claim an unimplemented requirement passed.
