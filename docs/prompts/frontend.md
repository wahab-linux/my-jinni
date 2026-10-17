# Desktop interface development prompt

You are building PlanScope's desktop client in `wahab-linux/my-jinni` for the DYHTG 2026 BlackRock challenge. I am Wahab and own the interface. My teammate owns the Python backend. The user explicitly wants a desktop application and permits Electron/Tauri to reuse frontend skills. Use Electron with HTML/CSS/JavaScript. Deliver a working application window.

Read `AGENTS.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/TASKS.md`, `docs/openapi.json` and `contracts/fixtures/`. All code, comments, UI copy and documentation must be English. Product name: PlanScope. Keep the repository/directory name `my-jinni`.

## Stack, boundaries and ownership

- Own `desktop/` and client-only tests. Coordinate root `package.json`, its lockfile, `.gitignore` and shared documentation. Pin the selected Electron version in the lockfile using current official documentation. There is no existing JS framework to preserve; start with plain HTML/CSS/JavaScript unless the team chooses one. Do not add a separate website deliverable.
- Suggested files: `desktop/main.cjs` (window, IPC and lifecycle), `preload.cjs` (contextBridge), and `renderer/index.html`, `styles.css`, `app.js` (interface). Keep the implementation small.
- The Python backend is implemented at `http://127.0.0.1:8000`. Do not duplicate ranking, read source JSON directly, or change schemas independently. Fetch options and recommendations through the API.
- The Electron main process makes HTTP requests; expose only `getOptions()` and `recommend(preferences)` through preload, with structured `{status, body}` results and a separate connection-failure state. Keep `contextIsolation: true`, `nodeIntegration: false` and the renderer sandbox. Validate the IPC sender and request shape; limit channels to the fixed local API routes. Do not expose arbitrary fetch URLs, filesystem, shell, ipcRenderer or process access. Insert provider text using textContent.
- This bridge avoids a renderer-origin/CORS mismatch. Keep web security enabled and use local packaged assets in the application window.
- First integration may start the backend separately with `uv run python -m app`. After that works, add `npm run desktop` to start the local backend if necessary and then open the window. Resolve the repository and `.venv` interpreter portably on Windows; do not hardcode roXy's path. Spawn Python with an argument array, `shell: false`, `windowsHide: true`, loopback binding and no Uvicorn reload.
- Wait for `/health` readiness without blocking the interface; bound startup and HTTP waits, show retry/diagnostics and report port conflicts. On close, stop only the backend process this client created. Never terminate a separately started backend or another app. Check readiness and identity rather than treating any process on port 8000 as ours.
- Backend `/docs` is developer documentation. The normal user flow stays inside the desktop window. A Windows installer and bundling a Python runtime are secondary delivery tasks; document source-run setup honestly until a distribution is built and launched.

## Stage 1: the basic desktop flow

1. Create a resizable PlanScope window and load `/api/v1/options` through the bridge. Derive origins, supported date, limits, interests and initial values from the response. Students are the first scenario, not an identity requirement.
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
