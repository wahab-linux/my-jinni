# PlanScope project plan

## Product and delivery

PlanScope is a desktop activity planner with a user-confirmed local source library and cited OpenAI questions. Given an origin, budget, time window and interests, its deterministic planner recommends a feasible activity and explains cost and return timing without requiring a key. Students are the first MVP audience; no student identity, account or campus-only rule belongs in the reusable activity core.

The activity backend is implemented: two independently shaped simulated feeds are fetched, normalised, joined and used in actual deterministic decisions. The user confirmed the additive library/AI scope on 2026-10-17 and selected OpenAI. That feature is implemented on `backend-ai-library`, with coordinating lint/format and 344 tests passing; desktop and real-provider acceptance remain pending. Electron with HTML/CSS/JavaScript is the selected client stack. Wahab owns planner controls, source panel, chat/citation viewer, session-key settings, restricted IPC and managed backend launcher. No desktop executable or installer is delivered yet.

## Read together

- `docs/REQUIREMENTS.md`: stable FR/BR/QR/AC IDs, scope, rules and acceptance scenarios.
- `docs/ARCHITECTURE.md`: desktop experience, application/decision core, source adapters and process lifecycle.
- `docs/API.md`, `docs/AI_EXTENSION.md`, `docs/openapi.json` and `contracts/fixtures/`: additive contract v0.3 and explicit examples; every v0.2 activity field is preserved.
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
- Deterministic activity rules and factual explanations; the planner and local source library need no AI credentials.
- One local SQLite source library outside the checkout: pasted text, UTF-8 TXT/Markdown and text PDFs, with page-aware extracted chunks, view/delete and selected-source lexical retrieval. Optional `is_simulated` import metadata labels fictional/generated demo guides and follows citations; false is not a truth guarantee.
- Optional OpenAI questions with checked quote/source citations, or insufficient evidence. Passing current form preferences explicitly adds the real calculated planner result as ephemeral simulated evidence; questions do not infer or mutate form values.

The second origin demonstrates a shared activity core without student identity. It does not imply arbitrary-place/date coverage or live routing. The source library is one local collection, not cloud notebooks or sync. OCR, URL ingestion, embeddings, finance, shopping, accounts, maps, payments and a universal planning framework are outside this hackathon scope. PlanScope is the team's prototype, not an official BlackRock or Aladdin product.

## Architecture and ownership

The three layers are the desktop experience, decision/application and integration. The renderer uses restricted preload IPC to the trusted Electron main process, which calls the loopback API. Keep context isolation enabled and Node integration disabled. The renderer neither reads source files nor duplicates rules. Application/scenario code validates coverage and coordinates adapters and the pure, I/O-free engine. Source/chat application code coordinates local extraction/storage/retrieval, optional actual planner output, OpenAI generation and exact citation checks. The AI explanation cannot replace computed activity feasibility or ranking.

| Owner | Primary files | Responsibility |
| --- | --- | --- |
| roXy | `app/`, `data/`, backend `tests/`, `scripts/` | Planner API/adapters/engine; ingestion, local SQLite/retrieval, OpenAI adapter/citation checks, additive source/chat API and backend verification |
| Wahab | `desktop/main.cjs`, `desktop/preload.cjs`, `desktop/renderer/`, client tests | Electron planner/library/chat, native import picker, citation view, session-key settings, restricted bridge, asynchronous states, launcher and UI verification |
| Together | Schemas, `contracts/fixtures/`, OpenAPI, dependencies and docs | Contract consistency, Node manifests/lockfile, integration, explanations, AI record and submission |

Keep exclusive file ownership when delegating. Coordinate shared changes before editing; never overwrite a teammate's work. The historical prompt filename `frontend.md` now describes the desktop interface. Suggested backend/frontend branch names need not change ownership.

## Rules and failure policy

All three constraints are hard requirements: ticket plus one return fare fits budget, outbound arrival meets event start, and event end plus return travel meets the deadline. Equality passes. Rank interest match, lower total cost, shorter total travel, then event ID. Nonmatching interests remain eligible with honest wording.

Unknown or unavailable travel never means zero. Travel metadata must match the selected origin. Each source call has a two-second deadline and both run concurrently. No feasible result is a successful 200 response; required-source failure is 503 and invalid/ambiguous data is 502. Structural or unsupported-scenario input returns 422 before fetching. Fixtures are explicit examples, never an automatic recovery path.

The library accepts at most 20 sources, 5 MiB per upload, 150,000 extracted characters and 40 PDF pages. It retains extracted original text/chunks and page metadata in local SQLite, not original file bytes, keys or chat history. Retrieval uses only selected sources and supplies at most six bounded chunks, with one reserved for an explicitly requested calculated plan. Lexical search can miss paraphrases and cross-language evidence.

AI generation uses the fixed OpenAI Responses endpoint, Structured Outputs, a 30-second deadline, bounded input/output and `store: false`, without retries, tools, web search or remote file/vector-store uploads. Before generation, the desktop must disclose that questions and selected evidence leave the device. Keep the key only in trusted main-process session memory; pass it in `X-OpenAI-API-Key`, never JSON or persistence. `store: false` is not a blanket provider-retention guarantee.

Citation checks require selected chunk IDs and exact quote substrings; they do not prove semantic entailment or truth. No matching evidence produces normal insufficient evidence without a provider call or key. Auth/rate-limit/model/network/timeout/refusal/invalid-output errors remain distinct and safe. Planner failures propagate when preferences are supplied, and the ordinary planner remains usable without OpenAI.

## Next integration sequence

1. Preserve the verified activity backend: its earlier baseline passed 175 tests, Ruff lint/format and actual HTTP startup/calculation/shutdown checks on 2026-10-17. Start it with `uv run python -m app` on `127.0.0.1:8000`; `/` is JSON health and `/docs` is optional developer documentation. This historical count is not extension acceptance.
2. Wahab implements the resizable Electron window, options-driven labelled controls and restricted IPC bridge, with asynchronous calls and clear loading/result/error states. Initially start the backend separately; do not delay the first real API flow for packaging.
3. Together verify campus / games / GBP 10 -> Board Game Night / GBP 5; GBP 4 -> Acoustic Hour; GBP 0 -> no match. Inspect actual responses and visible simulation/provenance labels.
4. Verify city centre uses its own journeys and excludes the 16:30 Board Game Night when leaving at 16:00. Exercise source failure and retry after a successful result, checking that old recommendations are cleared or marked stale.
5. Coordinate `package.json` and its lockfile, then implement `npm run desktop`. The launcher must manage only its own backend, report failures and leave no owned process behind on close. A managed backend uses no auto-reload. The command is planned and does not work until the desktop implementation lands.
6. Use K1/K2 on `backend-ai-library`: bounded ingestion and local persistence/delete, selected-source retrieval, the OpenAI adapter and exact citation checks, actual planner-context equality and injected-provider failures are covered by the coordinating 344-test/lint/format run. Keep the additive v0.3 OpenAPI contract aligned. Backend verification does not complete the desktop/live-provider checkpoints.
7. Wahab implements K3 through narrow IPC: source list/paste/import/view/delete, explicit source selection, chat/citation view, current-form planner inclusion and session-only key/model settings. A native picker controls uploads; expose no arbitrary path/URL capability. Show the cloud notice, simulation labels, insufficient evidence, provider errors and stale-response/retry states.
8. Together verify library restart/delete and selected-source isolation, open original quotes/pages, compare chat's `planner` JSON with the ordinary endpoint, and confirm keyless planning after an AI failure. Run a separately recorded real OpenAI request with the team's own key/account; model access and desktop answer quality remain pending until observed.
9. Perform keyboard/tab-order, resizing, nonblocking requests, IPC, session-key privacy, lifecycle and human code-explanation checks. Prepare the English demo, factual AI document and latest official submission requirements. Bundle Python with Electron or build/test a Windows distribution only if the working flow leaves time.

## Verification and schedule

The earlier activity-planner baseline passed 175 tests, Ruff lint/format and an actual server smoke covering health, two origins, normal/lower/zero budgets and clean shutdown. After the library/AI extension, the coordinating run passed 344 tests plus Ruff lint/format across 42 Python files; the existing Starlette/httpx TestClient deprecation warning remains. The total preserves all planner regressions and adds storage/ingestion, mocked provider/API and contract checks. No real OpenAI key or request was used. Desktop client, launcher, installer, session-key behaviour, real account/model access, live answer/citation quality and human acceptance remain pending until performed.

Aim to integrate the desktop flow on Saturday and rehearse once before finishing. Suggested Sunday 10:30 onward: fixes, final checks, documentation and demo practice. Official code freeze is Sunday 18 October at 12:00 UK time; protect the final 60-90 minutes for submission and rehearsal. Suggested milestones are team planning, not additional official rules.

Completion requires a working desktop planner and approved source/chat flow, calculated two-source decisions, honest failures and simulation labels, checked viewable citations, disclosed cloud processing, reproducible startup, both teammates' understanding and an AI report reflecting the actual process. Record any deferred live-provider/client check explicitly; automated mocks are not a substitute for those checks.
