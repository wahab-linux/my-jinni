# Desktop interface development prompt

Latest user direction, 2026-10-18: desktop Ask AI starts visible in the shared workspace. Provider/model/credentials and Vertex ADC setup belong in a separate settings dialog. Keep the library closed. Provide provider-specific model suggestions with custom entry and preserve per-provider session choices/keys, explicit cloud disclosure and stale-response guards. Notes/files inform selected retrieved AI evidence; they do not automatically edit comparison metrics or ranking. This supersedes closed-question-tool instructions below.

Use the visible name `Jinni` and the existing lamp mark. Desktop must always follow the browser frontend by loading the same `web/index.html`, stylesheet, controls, translations and presentation modules. Do not build or restore a separate desktop renderer. Keep platform differences in `web/platform.mjs`, shared current-form context in `web/ui-context.mjs` and optional native AI tools. Technical repository/storage/bridge/API identifiers remain `my-jinni`; preserve data and contracts. Keep five interface languages and literal original evidence/custom text.

Keep scenario choice, priorities/hard limits, recommendations and comparable alternatives central. Native calculations use named bridge methods and the real Python API; browser calculations retain the existing pure JavaScript engine and exported data. Library/questions and the activity example start closed. Preserve appearance, language, keyboard/focus, source/PDF/citation/provider features, safe text and stale-response handling. Keep copy only when it adds understanding or action: remove repeated slogans, layout narration, reassurance and non-actionable ready messages. Retain simulation labels, units, actual trade-offs, errors and selected-provider disclosure. Detailed scoring/source information belongs in closed disclosures.

You are building Jinni's desktop client in `wahab-linux/my-jinni` for the DYHTG 2026 BlackRock challenge. I am Wahab and own the interface. My teammate owns the Python backend. The user explicitly wants a desktop application and permits Electron/Tauri to reuse frontend skills. Use Electron with HTML/CSS/JavaScript. Deliver a working application window.

Read `AGENTS.md`, `docs/AI_EXTENSION.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/TASKS.md`, `docs/openapi.json` and `contracts/fixtures/`. Code, comments and documentation remain English. The user approved explicit UI catalogs and localization fixtures for English, Simplified Chinese, French, Japanese and Russian. Translate presentation only, retaining exact user evidence, citation quotes, custom labels, API fields, units and session keys. Product name: Jinni. Keep the repository/directory name `my-jinni`.

The desktop implementation is now present in `desktop/`, including the launcher, restricted bridge, planner/library/chat renderer and tests in `tests/desktop/`. Preserve it and inspect current behaviour before changing files. This prompt defines the acceptance boundary; it is not an instruction to rebuild the app. Run `npm run desktop` or, after setup, Node 22+ `node --run desktop`. See `desktop/README.md` and the frozen `docs/DESKTOP_BRIDGE.md`. Automated end-to-end provider success is mocked; actual OpenAI account access remains a separate check.

## Confirmed extension: source library and cited OpenAI questions

The user confirmed activity planning plus a local library and cited AI chat, then approved multiple mainstream providers including DeepSeek. Current additive v0.4 is defined in `docs/AI_PROVIDERS.md` and `docs/DESKTOP_BRIDGE.md`; it supersedes the original OpenAI-only key/model instructions below. Preserve existing planner/library/citation fields. Provide synchronised provider selectors, editable per-provider models, independent session keys, selected-recipient disclosure and stale-answer invalidation. Use canonical `X-AI-API-Key` from main, never copy one provider's key to another, and clear all keys on quit. The desktop implementation is present; inspect and extend rather than rebuild it.

1. Add a source panel with create-from-text, native-file import, list, select, view-extracted-text and delete. Read limits and default model from `GET /api/v1/sources`. Support TXT, Markdown and text PDFs; do not promise OCR, URL import or multiple notebooks. The backend stores extracted text, not original file bytes. Expose `is_simulated` for fictional/AI-generated demo uploads and retain its label in citations; a false label does not verify factual accuracy.
2. Extend the narrow preload bridge with source-specific methods and `askQuestion`. File import opens a native picker in the main process, reads only the chosen file, and sends multipart `file` plus optional `title`. Do not accept arbitrary renderer-supplied filesystem paths.
3. Maintain separate provider session settings in main-process memory. Clear key entry after saving and send only the selected key in `X-AI-API-Key` on local chat requests. No keys in JSON, URLs, logs, localStorage, SQLite, fixtures or Git. The Python adapter owns provider HTTP requests; the renderer has no direct cloud access.
4. Name the selected provider in the cloud notice before generation. Local storage does not make cloud requests local. Read model suggestions from the source API catalog, allow an editable compatible model, and keep model choices separate per provider. Changing provider clears/invalidate old answers and stale key-status replies.
5. Chat sends `{question, source_ids, model, preferences?}` to `POST /api/v1/chat`. Source selection is explicit. For activity decisions, include the current form's exact `preferences`; questions do not automatically edit/extract form values. Display the returned structured `planner` as the authoritative cost/time/ranking result alongside the AI explanation.
6. Show returned citations as clickable references with source title, quote and page. Open `/api/v1/sources/{id}` for original extracted-text context. `planner-context` is ephemeral: display its quote and the returned planner result rather than trying to fetch it as a saved source. Keep simulated labels visible.
7. Handle answered, insufficient evidence, missing/deleted source, invalid key, model error, rate limit, timeout and unavailable service. Preserve HTTP status across IPC and keep the deterministic planner usable without a key. Allow over 30 seconds for the bounded backend generation plus setup/calculation; report cancellation and ignore stale responses. No hidden fixture success after a provider error.
8. Chat is stateless in this increment; a displayed conversation does not imply server-side chat memory. Lexical retrieval may miss paraphrases or cross-language matches. Use an answerable English source/question for the first integration, and report the limitation honestly.
9. Verify a real source import and cited answer with the team's own key in the application. Backend mock tests do not establish live model/account access or actual desktop behaviour. Record that check and any manual edits in `docs/AI_USAGE.md`.

## Stack, boundaries and ownership

- Own the shared `web/` frontend and desktop native integration, with exclusive file ownership when delegating. Coordinate root manifests, lockfiles, documentation and contracts. Keep the existing plain HTML/CSS/JavaScript and Electron stack; preserve the supported browser edition.
- Common files live in `web/`; native process/bridge/assets live in `desktop/`. The old renderer index is an inert preference-migration stub only. Desktop uses allowlisted local assets through `jinni://app/index.html`, not a remote page or a second copied build. Preserve the existing profile and SQLite library.
- The Python backend is implemented at `http://127.0.0.1:8000`. Do not duplicate ranking, read source JSON directly, or change schemas independently. Fetch options and recommendations through the API.
- The Electron main process makes HTTP requests; expose only named planner/library/chat methods through preload, with structured `{status, body}` results and a separate connection-failure state. Keep `contextIsolation: true`, `nodeIntegration: false` and the renderer sandbox. Validate the IPC sender and request shape; limit channels to the fixed local API routes. Do not expose arbitrary fetch URLs, filesystem, shell, ipcRenderer or process access. Insert provider text using textContent.
- This bridge avoids a renderer-origin/CORS mismatch. Keep web security enabled and use local packaged assets in the application window.
- First integration may start the backend separately with `uv run python -m app`. After that works, add `npm run desktop` to start the local backend if necessary and then open the window. Resolve the repository and `.venv` interpreter portably on Windows; do not hardcode roXy's path. Spawn Python with an argument array, `shell: false`, `windowsHide: true`, loopback binding and no Uvicorn reload.
- Wait for `/health` readiness without blocking the interface; bound startup and HTTP waits, show retry/diagnostics and report port conflicts. On close, stop only the backend process this client created. Never terminate a separately started backend or another app. Check readiness and identity rather than treating any process on port 8000 as ours.
- Backend `/docs` is developer documentation. The normal user flow stays inside the desktop window. A Windows installer and bundling a Python runtime are secondary delivery tasks; document source-run setup honestly until a distribution is built and launched.

## Stage 1: the basic desktop flow

1. Create a resizable Jinni window and load `/api/v1/options` through the bridge. Derive origins, supported date, limits, interests and initial values from the response. Students are the first scenario, not an identity requirement.
2. Build labelled controls for origin, date, departure, return deadline, budget and interests. Internally use integer pence and exact decimal GBP conversion. Reject fractional pence, empty interests and reversed times. Send aware ISO timestamps for `Europe/London`, using the selected date's offset rather than the machine's timezone. Read supported dates from options.
3. POST the v0.2 request through `recommend(preferences)`. Disable repeat submissions while active; use request IDs or cancellation so stale responses cannot overwrite a later request. Keep the window responsive.
4. Show title, venue, category, event times, arrival, return, ticket + return fare = total, and factual reasons. Include up to two alternatives. Format GBP to two decimals and all times in `Europe/London`; the travel fare already includes both legs.
5. Keep 'Simulated demo data' visible. Show source provider labels, update timestamps, requested travel origin and warnings. The timestamps describe fictional data, not live freshness.
6. Integrate immediately against the actual API: campus / games / GBP 10 selects Board Game Night at GBP 5; GBP 4 selects Acoustic Hour; GBP 0 produces no match. City centre at 16:00 excludes Board Game Night because its outbound journey takes 35 minutes. No automatic fixture fallback.

## Stage 2: reliable states and launch

1. Handle initial/options loading, options failure, submitting, success, no match, validation (422), invalid source (502), unavailable source (503), unexpected errors and connection failure. Preserve inputs, offer retry, and clear old recommendations or visibly mark them stale after a new failed request.
2. A 200 `recommended: null` result is a successful no-match search. Error bodies use `data: null`, `error: {code,message,details}`, and warnings. Preserve the HTTP status across IPC. A visibly labelled development fixture preview is optional and must never activate automatically on failure.
3. Implement and verify the managed backend lifecycle and one `npm run desktop` command. Test close/reopen, an unavailable backend, a failed start and a busy port. Initial setup may require `uv sync`; avoid absolute developer paths or dependence on global Python.
4. Check keyboard focus, tab order, labelled controls, readable resize behaviour, long explanations, loading, simulation labels and retry on Windows. Confirm city-centre results use its own journeys.
5. Add useful tests for state transitions, stale responses, IPC status preservation and owned-process shutdown. Run applicable JS checks plus repository Python lint/format/tests. Record actual desktop checks separately from backend coverage.
6. Coordinate packaging after the flow works. If an executable is built, include the Python backend, fixtures and runtime paths and actually launch it. Do not call a source-run window an installer.
7. Update `docs/AI_USAGE.md` with actual tools/models, generated work, human decisions/edits and verification. No invented review or final AI-level claims. Rehearse a short English demo together.

## Contract reminders

- Request: `origin_id`, `budget_pence`, `depart_at`, `return_by`, `interests`.
- Options: `origins`, `supported_dates`, `timezone`, `max_budget_pence`, `interests`, `default_request`.
- Success: `{data: ..., error: null, warnings: [...]}`. `data.recommended` is one object or null; alternatives has at most two.
- `return_at` means return to the selected origin. All money is integer pence.
- Exact schemas are `app/schemas.py` and `docs/openapi.json`; no silent field/unit changes.

References: [preload](https://www.electronjs.org/docs/latest/tutorial/tutorial-preload), [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation), [IPC](https://www.electronjs.org/docs/latest/tutorial/ipc).

Report files, actual startup commands, tested outcomes and remaining work. Keep readable commits and preserve teammate changes.
