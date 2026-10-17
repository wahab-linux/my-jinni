# my-jinni desktop client

The implemented Electron client uses local HTML/CSS/JavaScript. It provides activity planning, local source import/selection/view/delete, optional cited questions with OpenAI, DeepSeek, Google Gemini or Anthropic Claude, and separate session-key settings. Students are the first scenario; the activity core does not require student identity.

## Setup and launch

From the repository root, install Python dependencies with `uv sync` and Node dependencies with `npm ci`. Node 22+ and uv are required for initial setup. On Windows, double-click the root `start-my-jinni.cmd` or run `.\start-my-jinni.cmd` in PowerShell. It launches project-local Electron without requiring Node/npm on the terminal PATH and resolves its working directory from the script location. A missing Electron dependency produces an explicit setup message. The script changes no system PATH settings. With Node on PATH, `npm run desktop` or Node 22+ `node --run desktop` are also available. A runtime available only inside Codex does not make these developer commands available in an ordinary terminal. Electron 44.9.0 and the verification tools are pinned in `package-lock.json`.

The launcher checks `/health` and the OpenAPI title before reusing `http://127.0.0.1:8000`. Otherwise it starts the repository's `.venv` Python interpreter, or `uv run --no-sync`, with loopback binding, no shell and no reload. Closing the client stops only its owned backend. A separately started `uv run python -m app` remains running. Startup failures and port conflicts appear in the window with a retry action.

Optional `MY_JINNI_BACKEND_URL` accepts only a loopback HTTP origin. Explicit `MY_JINNI_DATA_DIR` isolates both library storage and the Electron profile; normal launches leave the backend's canonical default storage unchanged. No installer or bundled Python runtime is delivered.

## Implementation

```text
desktop/
  main.cjs          Window, validated IPC and native file picker
  preload.cjs       Named window.myJinni methods only
  api-client.cjs    Bounded local HTTP, status preservation, isolated provider keys
  backend.cjs       Identity/readiness checks and owned-process lifecycle
  validation.cjs    Restricted route/input/loopback validation
  renderer/
    index.html      Labelled planner, source library, chat and dialogs
    styles.css
    app.js
```

Read [DESKTOP_BRIDGE.md](../docs/DESKTOP_BRIDGE.md) for the bridge, [AI_EXTENSION.md](../docs/AI_EXTENSION.md) for source/chat behaviour and [AI_PROVIDERS.md](../docs/AI_PROVIDERS.md) for additive v0.4 provider selection. Preserve integer pence and aware `Europe/London` timestamps. The renderer derives planner choices from options and provider/model defaults from the source capabilities. Chat and settings provider selectors stay synchronised, editable models are remembered separately in session memory, and changing provider clears key entry plus pending/old answers. Source/provider content renders as text.

Context isolation and sandboxing are enabled; renderer Node integration is disabled. The renderer has no general HTTP, shell, IPC or file-path access. Main owns HTTP and the native picker. Each provider's key remains in a private main-process session map; chat attaches only the selected key in `X-AI-API-Key`. Clear removes only the selected provider's key, while quitting clears all keys. The bridge's legacy string setter and omitted provider arguments continue to refer to OpenAI only. Settings return a configured boolean, never keys; saving is not an account-access test. Before generation, the window names the selected recipient of questions and evidence snippets. No keys/models are persisted, no arbitrary provider URL is exposed, and no automatic provider fallback or key sharing occurs. Planning remains keyless.

## Verification

```sh
npm run lint:desktop
npm run test:desktop
npm run test:e2e
```

The unit suite covers route/provider/input validation, safe errors, HTTP statuses and deadlines, isolated provider keys, single/all-key clearing, header stripping and backend ownership/races. The end-to-end suite launches real Electron windows and Python APIs with temporary storage/ports. It exercises actual planner calculations, pasted text and PDF upload, extracted original text/pages, selected-source isolation, key privacy, provider switching, stale answers, error/retry, persistence, keyboard/resizing and backend lifecycle. Cloud-provider transports are mocked; this does not establish live access. Screenshots are ignored under `tmp/desktop/`; provider screenshots are labelled as mocked in their filenames.

The import test substitutes the native picker's return value with a generated fictional PDF; subsequent file reading, multipart upload, extraction and storage are real. The test does not verify a person's interaction with the operating-system picker. Actual account/model access for each provider and human demo rehearsal remain separate checks.

First planning flow: campus / games / GBP 10 -> Board Game Night / GBP 5; GBP 4 -> Acoustic Hour; GBP 0 -> no match. City-centre travel changes the result. All event/travel data is visibly fictional. An optional demo source is [venue-guide.md](../contracts/fixtures/venue-guide.md); mark it simulated when importing.
