# Electron bridge contract

The user authorised agents to implement the desktop interface, verification and integration on 2026-10-17. Keep contract v0.3 unchanged. The renderer uses only `window.myJinni`; Electron main owns local HTTP, native file selection, the session key and its own backend process.

HTTP methods return `{status, body}` preserving the server envelope. A connection failure has status 0, `connectionError` containing a safe message, and no invented success body. A cancelled file picker returns `{status: 0, body: null, cancelled: true}`. No API key is ever returned to the renderer.

| Method | Input | Result |
| --- | --- | --- |
| `getOptions()` | None | GET `/api/v1/options` |
| `recommend(preferences)` | Exact existing preference object | POST `/api/v1/recommendations` |
| `listSources()` | None | GET `/api/v1/sources` |
| `addTextSource(source)` | `{title,text,is_simulated}` | POST `/api/v1/sources` |
| `importSource(options)` | `{is_simulated}`; no path | Native picker, then multipart upload |
| `getSource(id)` | Source ID | GET `/api/v1/sources/{id}` |
| `deleteSource(id)` | Source ID | DELETE `/api/v1/sources/{id}` |
| `askQuestion(request)` | `{question,source_ids,model,preferences?}` | POST `/api/v1/chat`; main adds session-key header |
| `setSessionApiKey(key)` | String; keep in main-process memory | `{configured: boolean}` |
| `clearSessionApiKey()` | None | `{configured:false}` |
| `getSessionSettings()` | None | `{configured:boolean}` only |
| `getBackendStatus()` | None | `{state:'starting'|'ready'|'error',message:string,owned:boolean}` |
| `retryBackend()` | None | Retry startup and return backend status |

Use allowlisted IPC channels and validate sender and input. Keep context isolation and sandbox enabled, Node integration disabled, and local assets under a strict CSP. No generic HTTP, shell, file-path or ipcRenderer access. Render provider/document strings as text. Key entry is cleared after saving and is not persisted.

Default backend URL is `http://127.0.0.1:8000`. Optional `MY_JINNI_BACKEND_URL` permits only loopback HTTP URLs with no credentials, query or path, for separate local development/test ports. Check `/health` and OpenAPI `info.title == 'my-jinni API'` before reusing a running backend. Start the portable local `.venv` interpreter or `uv run` without a shell and with `windowsHide`; no auto-reload. Stop only the child this instance started. Initial setup is `uv sync` plus `npm ci`; the application command is `npm run desktop`.

The managed backend inherits `MY_JINNI_DATA_DIR` when explicitly supplied; otherwise leave data-directory environment variables unset to preserve the backend's canonical library location and legacy-data compatibility. An explicit override also isolates the Electron profile under its `desktop` subdirectory. Tests use a temporary data directory. No genuine credentials or user documents belong in tests/screenshots. Provider success in automated end-to-end tests must be explicitly labelled as a mocked provider; live OpenAI validation is separate.
