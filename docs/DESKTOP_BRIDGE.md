# Electron bridge contract

Latest credential-storage direction, 2026-10-18: the user explicitly requested persistent provider keys. Desktop main now stores only OS-encrypted, provider-bound ciphertext in `jinni-credentials.json` under its existing user-data directory, using Electron `safeStorage` (Windows DPAPI). Restart restores keys; deleting a provider removes its saved entry; quitting clears only decrypted memory. Unavailable encryption, Linux `basic_text`, corrupt/decryption failures and failed writes fail closed without plaintext fallback. Settings still return only `{configured}` and existing IPC names and header-only HTTP contracts are retained. No keys enter SQLite, renderer storage, prompts, logs or Git. This supersedes earlier session-only storage descriptions. Model choices remain session-only; Google ADC is unchanged.

Additive v0.7 permits optional `intent: "answer" | "options"` on the existing named `askQuestion` request, defaulting to ordinary answers when omitted. The validator rejects every other intent and retains exact selected source/current comparison and provider/credential boundaries. No new IPC method or generic operation is introduced. Chat results add `options` with checked per-option citations; see [AI_OPTIONS.md](AI_OPTIONS.md). The current shared workspace shows compact conditions/sources, choices/comparisons and Ask AI in parallel; settings and full library tools open separately.

Additive v0.6 adds `checkVertexAdc({project_id, location})` through the same trusted sender/input checks. It posts only validated Google project/location metadata to `/api/v1/ai/vertex/check` and returns the standard `{status,body}` result. It does not execute shell commands, accept credential files or return tokens. `askQuestion` also accepts provider `vertex` and its validated project/location settings; `setSessionApiKey` rejects Vertex because its credentials belong to the Python backend's Google ADC discovery. Existing provider-key operations remain intact.

The common frontend is `web/index.html` in both browser and Electron. Desktop loads it at the local secure `jinni://app/index.html` document and selects the native platform adapter. IPC accepts only this window's main frame at that exact document, ignoring only its fragment; other origins, paths and query strings are rejected. Assets are allowlisted local files, never a hosted page or general repository server. Native AI tools extend the common interface and read source selection/current form context explicitly. Existing operation names and envelopes below remain unchanged.

Additive v0.5 uses the same trusted main-only HTTP boundary:

| Named operation | Input | Backend result |
| --- | --- | --- |
| `getDecisionScenarios()` | None | GET `/api/v1/decision-scenarios` |
| `getDecisionScenario(id)` | Lowercase slug, max 100 characters | GET `/api/v1/decision-scenarios/{id}` |
| `evaluateDecision(request)` | Validated `DecisionRequest` | POST `/api/v1/decisions/evaluate` |

All retain the existing `{status,body}` transport wrapper and server envelope. `askQuestion` additionally accepts optional `decision_request`; its returned chat data adds `decision`. The main process validates bounded custom datasets and allows only named routes. Provider keys never accompany catalog/detail/evaluation requests. [GENERAL_DECISIONS.md](GENERAL_DECISIONS.md) freezes the schema and formula.

Library and chat dialogs start closed. The legacy activity form remains in a collapsed detailed example. A `decision-context` citation opens its returned exact quotation and calculated comparison locally; this ephemeral source must not be fetched as a saved library ID.

The user authorised agents to implement the desktop interface, verification and integration on 2026-10-17, then requested mainstream provider selection including DeepSeek. Contract v0.4 adds provider selection and per-provider session keys while preserving v0.3 planner/library/citation fields. Read `docs/AI_PROVIDERS.md`. The renderer uses only `window.myJinni`; main owns local HTTP, native files, provider keys and its own backend process.

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
| `askQuestion(request)` | `{question,source_ids,model,provider?,preferences?}` | POST `/api/v1/chat`; main adds selected key in `X-AI-API-Key` |
| `setSessionApiKey(value)` | `{provider,key}`; legacy string sets OpenAI only | `{configured: boolean}` |
| `clearSessionApiKey(provider?)` | Optional provider ID; defaults OpenAI | `{configured:false}` for that provider only |
| `getSessionSettings(provider?)` | Optional provider ID; defaults OpenAI | `{configured:boolean}` for that provider only |
| `getBackendStatus()` | None | `{state:'starting'|'ready'|'error',message:string,owned:boolean}` |
| `retryBackend()` | None | Retry startup and return backend status |

Use allowlisted IPC channels and validate sender and input. Keep context isolation and sandbox enabled, Node integration disabled, and local assets under a strict CSP. No generic HTTP, shell, file-path or ipcRenderer access. Render provider/document strings as text. Key entry is cleared after saving and is not persisted.

Keys are independent for each provider and all clear when main quits. No key is returned or silently copied when switching provider. Renderer chat/settings selectors agree, model choices are separate, pending/previous answers are invalidated when the provider changes, and the cloud notice names the actual recipient. Legacy OpenAI-only HTTP callers may still use `X-OpenAI-API-Key`; the desktop always uses the generic header.

Default backend URL is `http://127.0.0.1:8000`. Optional `MY_JINNI_BACKEND_URL` permits only loopback HTTP URLs with no credentials, query or path, for separate local development/test ports. Check `/health` and OpenAPI `info.title == 'my-jinni API'` before reusing a running backend. Start the portable local `.venv` interpreter or `uv run` without a shell and with `windowsHide`; no auto-reload. Stop only the child this instance started. Initial setup is `uv sync` plus `npm ci`; the application command is `npm run desktop`.

The managed backend inherits `MY_JINNI_DATA_DIR` when explicitly supplied; otherwise leave data-directory environment variables unset to preserve the backend's canonical library location and legacy-data compatibility. An explicit override also isolates the Electron profile under its `desktop` subdirectory. Tests use a temporary data directory. No genuine credentials or user documents belong in tests/screenshots. Provider success in automated end-to-end tests must be explicitly labelled as a mocked provider; live OpenAI validation is separate.
