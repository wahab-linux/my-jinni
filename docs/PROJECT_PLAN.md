# Jinni project plan

**Hackathon development closed on 18 October 2026 at Theo's request.** See [the closeout record](HACKATHON_WRAP_UP.md) for the final baseline, materials, verification and future backlog. The increments below are historical development records; they are not active assignments.

Latest credential-storage direction, 2026-10-18: the user explicitly requested persistent provider keys. Desktop main now stores only OS-encrypted, provider-bound ciphertext in `jinni-credentials.json` under its existing user-data directory, using Electron `safeStorage` (Windows DPAPI). Restart restores keys; deleting a provider removes its saved entry; quitting clears only decrypted memory. Unavailable encryption, Linux `basic_text`, corrupt/decryption failures and failed writes fail closed without plaintext fallback. Settings still return only `{configured}` and existing IPC names and header-only HTTP contracts are retained. No keys enter SQLite, renderer storage, prompts, logs or Git. This supersedes earlier session-only storage descriptions. Model choices remain session-only; Google ADC is unchanged.

## Product and delivery

Latest direction, 2026-10-18: arrange compact conditions and selected sources, candidate/comparison results, and Ask AI as three parallel responsive panels. Selected-provider AI can propose two or three evidence-grounded choices from a user goal and the explicit current settings/sources. [AI_OPTIONS.md](AI_OPTIONS.md) defines additive chat intent `options`, per-option citations and proposal/calculation boundaries. Source selection now sits with conditions; full library operations and AI settings remain separately opened. This supersedes earlier layout descriptions, with no automatic document-to-metric conversion.

Current AI interface direction, 2026-10-18: show Ask AI directly in the desktop workspace and move provider/model/credentials and Vertex ADC setup into a separate settings dialog. Keep the library closed until requested. Offer provider-specific model suggestions plus custom IDs without silently changing provider, model or keys. This supersedes earlier closed-question-dialog descriptions. Browser and desktop continue to share the page and presentation; cloud AI remains a native capability. Selected locally retrieved notes/files inform AI answers with checked quotations, while comparison ranking continues to use explicit option metrics, weights and limits. Importing a document does not automatically extract or apply decision measurements.

Current user direction, 2026-10-18: use `Jinni` for the visible name and one browser-led frontend for both editions. `web/` owns the common page, controls, themes, translations and results. `web/platform.mjs` selects the existing native IPC/Python/SQLite operations or browser data/IndexedDB implementation. Electron serves only allowlisted local assets through `jinni://app/index.html`, preserving sandbox, main-only keys and current data. Keep copy only when it helps someone understand or act; remove repeated slogans, layout descriptions and non-actionable success messages. This supersedes the earlier separate-renderer arrangement below.

On 2026-10-18 the user approved language-only work for English, Simplified Chinese, French, Japanese and Russian. Both experiences share a small local presentation runtime, with separate explicit locale catalogs, a native selector and a persisted locale preference. English remains the default. Language switching must preserve current form values, selections, source content, keys and calculated decisions, and cannot trigger cloud calls or re-rank options. Translation is a presentation feature; original exact quotations, API fields, GBP/pence and London-time rules remain intact. Code, comments and documentation stay English; native UI catalogs are the approved exception.

On 2026-10-18 the user renamed the visible product to `Jinni` and requested a lamp motif, fresh verification and frontend screenshots. Use original vector/CSS artwork with restrained violet/gold accents. Preserve the decision-first layout and honest source/AI boundaries. Existing technical repository/storage/API identifiers remain compatible with `my-jinni`. Language support is being evaluated separately from the brand; UI translation must not alter numeric units, source quotes or ranking.

The latest user-approved scope is a **general decision workspace**: market, travel, student, sustainability and custom scenarios, with configurable priorities and hard limits. [GENERAL_DECISIONS.md](GENERAL_DECISIONS.md) defines additive v0.5. `app/comparison/engine.py` remains pure and domain-independent; presets live in a catalog and ten fictional option/measurement feeds. New domains can supply custom criteria/data without editing the scoring rules. No preset connects a live market, route, university or environmental service.

Decisions are the central desktop/browser flow. Library and question tools start in closed dialogs; the precise activity itinerary is a collapsed example. Short motion respects reduced-motion preferences; sound is optional, synthesized locally and initially off. Preserve the browser themes, local storage, provider selection/privacy and original activity contract. The challenge's possible problem areas inform these scenarios; this is not evidence that animations or sound receive official bonus points.

Current automated verification passes 566 Python tests, 50 desktop and 31 browser Node tests, 32 actual Electron checks, 30 Chromium checks, lint/format and the static build. General browser/Python parity covers 140 full responses; the earlier 226 activity responses remain. All desktop cloud transports are mocked. The detailed checkpoints and earlier counts below describe prior increments; human understanding/rehearsal, real-provider access and hosted deployment remain separate.

The user requested a GitHub Pages browser edition on 2026-10-17, superseding the earlier desktop-only restriction for this additional deliverable. [BROWSER.md](BROWSER.md) defines its static planner, browser-local source library/PDF import and exact passage search. Provider-backed AI remains in the desktop edition. The existing backend and Electron contracts are preserved.

Jinni includes a local source library and optional cited AI questions using OpenAI, DeepSeek, Google Gemini and Anthropic Claude; `docs/AI_PROVIDERS.md` defines separate session keys. Its general comparisons and detailed activity planner run deterministically without a key. The activity example accepts origin, budget, time window and interests and preserves its precise cost/return checks.

The activity backend is implemented: two independently shaped simulated feeds are fetched, normalised, joined and used in actual deterministic decisions. The user confirmed the additive library/AI scope on 2026-10-17 and selected OpenAI. The latest backend baseline passed lint/format and 348 Python tests. The user also authorised agents to implement the Electron interface and its verification: window, planner/library/chat controls, restricted IPC, session-key settings and managed backend modules now exist. Sixteen real Windows Electron end-to-end checks passed with only the OpenAI transport mocked; live OpenAI and human acceptance remain pending. This is a source-run client with no bundled Python runtime or installer.

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

The second origin demonstrates the detailed activity core without student identity. It does not imply arbitrary-place/date coverage or live routing. General comparisons support arbitrary declared criteria/data, including fictional market examples; they do not implement live financial advice, shopping feeds or a universal route planner. The source library is one local collection, with no OCR, URL ingestion, embeddings or cloud sync. Accounts, maps and payments remain outside scope. Jinni is the team's prototype, not an official BlackRock or Aladdin product.

## Architecture and ownership

The three layers are the desktop experience, decision/application and integration. The renderer uses only `window.myJinni` from the restricted preload bridge; trusted main-process modules own local HTTP, the native picker, session keys and backend lifecycle. Context isolation and sandbox are enabled and renderer Node integration is disabled. The renderer neither reads source files nor duplicates rules. Application/scenario code validates coverage and coordinates adapters and the pure, I/O-free engine. Source/chat application code coordinates local extraction/storage/retrieval, optional actual planner output, OpenAI generation and exact citation checks. The AI explanation cannot replace computed activity feasibility or ranking. `docs/DESKTOP_BRIDGE.md` freezes the named operations and result shapes.

| Owner | Primary files | Responsibility |
| --- | --- | --- |
| roXy | `app/`, `data/`, backend `tests/`, `scripts/` | Planner API/adapters/engine; ingestion, local SQLite/retrieval, OpenAI adapter/citation checks, additive source/chat API and backend verification |
| Wahab | Common `web/` interface, native `desktop/` integration and client tests | Shared planner/library/comparison UI, optional native AI tools, file picker, citation view, session settings, restricted bridge, async states and UI verification |
| Together | Schemas, `contracts/fixtures/`, OpenAPI, dependencies and docs | Contract consistency, Node manifests/lockfile, integration, explanations, AI record and submission |

Keep exclusive file ownership when delegating. Coordinate shared changes before editing; never overwrite a teammate's work. The historical prompt filename `frontend.md` now describes the desktop interface. Suggested backend/frontend branch names need not change ownership.

## Rules and failure policy

All three constraints are hard requirements: ticket plus one return fare fits budget, outbound arrival meets event start, and event end plus return travel meets the deadline. Equality passes. Rank interest match, lower total cost, shorter total travel, then event ID. Nonmatching interests remain eligible with honest wording.

Unknown or unavailable travel never means zero. Travel metadata must match the selected origin. Each source call has a two-second deadline and both run concurrently. No feasible result is a successful 200 response; required-source failure is 503 and invalid/ambiguous data is 502. Structural or unsupported-scenario input returns 422 before fetching. Fixtures are explicit examples, never an automatic recovery path.

The library accepts at most 20 sources, 5 MiB per upload, 150,000 extracted characters and 40 PDF pages. It retains extracted original text/chunks and page metadata in local SQLite, not original file bytes, keys or chat history. Retrieval uses only selected sources and supplies at most six bounded chunks, with one reserved for an explicitly requested calculated plan. Lexical search can miss paraphrases and cross-language evidence.

AI generation uses the selected provider's fixed official HTTPS endpoint, structured/JSON output, a 30-second deadline and bounded input/output, without retries, tools, web search or remote file/vector-store uploads. OpenAI retains Responses with `store: false`; DeepSeek/Gemini use Chat Completions and Claude uses native Messages JSON output. The desktop names the selected recipient before sending. Keep independent keys in trusted main-process session memory and pass only the selected key in `X-AI-API-Key`, never JSON or persistence. Legacy OpenAI-only headers remain supported; no silent key/provider fallback. `store: false` is not a blanket provider retention guarantee.

Citation checks require selected chunk IDs and exact quote substrings; they do not prove semantic entailment or truth. No matching evidence produces normal insufficient evidence without a provider call or key. Auth/rate-limit/model/network/timeout/refusal/invalid-output errors remain distinct and safe. Planner failures propagate when preferences are supplied, and the ordinary planner remains usable without OpenAI.

## Next integration sequence

1. Preserve the verified activity backend: its earlier baseline passed 175 tests, Ruff lint/format and actual HTTP startup/calculation/shutdown checks on 2026-10-17. Start it with `uv run python -m app` on `127.0.0.1:8000`; `/` is JSON health and `/docs` is optional developer documentation. This historical count is not extension acceptance.
2. Verify the implemented resizable Electron window, options-driven controls and restricted bridge against the real backend. Main/preload/API/validation/lifecycle modules and renderer assets are present; record actual Windows behaviour separately from unit-test results.
3. Together verify campus / games / GBP 10 -> Board Game Night / GBP 5; GBP 4 -> Acoustic Hour; GBP 0 -> no match. Inspect actual responses and visible simulation/provenance labels.
4. Verify city centre uses its own journeys and excludes the 16:30 Board Game Night when leaving at 16:00. Exercise source failure and retry after a successful result, checking that old recommendations are cleared or marked stale.
5. After initial `uv sync` and `npm ci`, Windows users can double-click `start-my-jinni.cmd` or run `.\start-my-jinni.cmd`. It uses project-local Electron and needs no Node/npm on the launch terminal's PATH. Developer commands `npm run desktop` and Node 22+ `node --run desktop` require Node in that terminal; the Codex-provided runtime is not automatically available in ordinary PowerShell. Dependencies pin Electron 44.9.0 and Playwright 1.64.1 in `package-lock.json`; initial setup needs Internet access. The implemented launcher checks backend identity, starts a portable no-reload process if needed and stops only its owned child. Verify busy-port errors, retry, external-backend reuse and clean close/reopen.
6. Preserve the K1/K2 backend's bounded ingestion and persistence/delete, selected retrieval, exact citations, actual planner-context equality and safe provider failures. These are covered by the coordinating 348-Python-test/lint/format baseline. Keep additive v0.3 and its OpenAPI aligned; backend verification does not complete desktop/live-provider checkpoints.
7. Verify the implemented K3 operations through the named bridge: source list/paste/import/view/delete, explicit selection, chat/citations, current-form planner inclusion and session-only settings. Native imports accept no renderer path. Check cloud disclosure, simulation labels, insufficient evidence, safe errors and stale-response/retry behaviour.
8. Together verify library restart/delete and selected-source isolation, open original quotes/pages, compare chat's `planner` JSON with the ordinary endpoint, and confirm keyless planning after an AI failure. Run a separately recorded real OpenAI request with the team's own key/account; model access and desktop answer quality remain pending until observed.
9. Perform keyboard/tab-order, resizing, nonblocking requests, IPC, session-key privacy, lifecycle and human code-explanation checks. Prepare the English demo, factual AI document and latest official submission requirements. Bundle Python with Electron or build/test a Windows distribution only if the working flow leaves time.

## Verification and schedule

The subsequent v0.4 provider extension passed 474 Python tests, 46 desktop unit tests, Ruff lint/format, desktop ESLint and 20 actual Electron checks. The new provider API/adapter tests use injected transports; all four cloud providers are mocked in Electron. Legacy planner/library checks are preserved. No live provider account/model request has been verified. The preceding counts describe earlier baselines.

The earlier activity-planner baseline passed 175 tests, Ruff lint/format and actual loopback startup/calculation/shutdown checks. The latest backend baseline passed 348 Python tests and Ruff lint/format; the existing Starlette/httpx TestClient deprecation warning remains. Desktop lint and 39 JavaScript unit tests pass. Sixteen real Windows Electron end-to-end checks passed for planning, source/PDF operations, checked original citations, session privacy, selected-source isolation, coupled planner/chat, failures/retry, stale results, keyboard/resizing, persistence and backend ownership. Only OpenAI transport is mocked; the native picker result is substituted, followed by actual upload/extraction. No real OpenAI key is configured or provider request performed; run the optional hidden-prompt `uv run python -m scripts.verify_openai` only when the team supplies its own key. Live account/model access, answer quality, code understanding and human rehearsal remain separate.

Keep the backend's canonical library location by leaving data-directory environment variables unset. `MY_JINNI_BACKEND_URL` optionally selects a validated loopback HTTP origin for local development. Explicit `MY_JINNI_DATA_DIR` isolates backend storage and the Electron profile for automated tests; it does not replace the default library for ordinary launches. Packaging a Python runtime or Windows installer remains deferred.

Aim to integrate the desktop flow on Saturday and rehearse once before finishing. Suggested Sunday 10:30 onward: fixes, final checks, documentation and demo practice. Official code freeze is Sunday 18 October at 12:00 UK time; protect the final 60-90 minutes for submission and rehearsal. Suggested milestones are team planning, not additional official rules.

Completion requires a working desktop planner and approved source/chat flow, calculated two-source decisions, honest failures and simulation labels, checked viewable citations, disclosed cloud processing, reproducible startup, both teammates' understanding and an AI report reflecting the actual process. Record any deferred live-provider/client check explicitly; automated mocks are not a substitute for those checks.
