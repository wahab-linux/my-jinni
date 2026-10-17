# my-jinni desktop client

The implemented Electron client uses local HTML/CSS/JavaScript. It provides activity planning, local source import/selection/view/delete, optional cited OpenAI questions and session-key settings. Students are the first scenario; the activity core does not require student identity.

## Setup and launch

From the repository root, install Python dependencies with `uv sync` and Node dependencies with `npm ci`. Node 22+ and uv are required. Launch with `npm run desktop`, or `node --run desktop` after setup. Electron 44.9.0 and the verification tools are pinned in `package-lock.json`.

The launcher checks `/health` and the OpenAPI title before reusing `http://127.0.0.1:8000`. Otherwise it starts the repository's `.venv` Python interpreter, or `uv run --no-sync`, with loopback binding, no shell and no reload. Closing the client stops only its owned backend. A separately started `uv run python -m app` remains running. Startup failures and port conflicts appear in the window with a retry action.

Optional `MY_JINNI_BACKEND_URL` accepts only a loopback HTTP origin. Explicit `MY_JINNI_DATA_DIR` isolates both library storage and the Electron profile; normal launches leave the backend's canonical default storage unchanged. No installer or bundled Python runtime is delivered.

## Implementation

```text
desktop/
  main.cjs          Window, validated IPC and native file picker
  preload.cjs       Named window.myJinni methods only
  api-client.cjs    Bounded local HTTP, status preservation, session key
  backend.cjs       Identity/readiness checks and owned-process lifecycle
  validation.cjs    Restricted route/input/loopback validation
  renderer/
    index.html      Labelled planner, source library, chat and dialogs
    styles.css
    app.js
```

Read [DESKTOP_BRIDGE.md](../docs/DESKTOP_BRIDGE.md) for the exact bridge and [AI_EXTENSION.md](../docs/AI_EXTENSION.md) for the additive backend contract. Preserve integer pence and aware `Europe/London` timestamps. The renderer derives choices from options, renders source/provider content as text and discards responses invalidated by input changes.

Context isolation and sandboxing are enabled; renderer Node integration is disabled. The renderer has no general HTTP, shell, IPC or file-path access. Main owns HTTP and the native picker. The key remains in main-process memory, is sent only in the local chat header, clears on restart and is never returned by settings. Saving a key does not test account access. Questions and selected evidence snippets are sent to OpenAI; the window discloses this before generation.

## Verification

```sh
npm run lint:desktop
npm run test:desktop
npm run test:e2e
```

The unit suite covers route/input validation, safe errors, HTTP statuses and deadlines, key isolation and backend ownership/races. The end-to-end suite launches real Electron windows and Python APIs with temporary storage/ports. It exercises actual planner calculations, pasted text and PDF upload, extracted original text/pages, selected-source isolation, key privacy, stale answers, error/retry, persistence, keyboard/resizing and backend lifecycle. Only OpenAI's HTTP transport is mocked. Screenshots are ignored under `tmp/desktop/`; provider screenshots are labelled as mocked in their filenames.

The import test substitutes the native picker's return value with a generated fictional PDF; subsequent file reading, multipart upload, extraction and storage are real. The test does not verify a person's interaction with the operating-system picker. Actual OpenAI account/model access and human demo rehearsal remain separate checks.

First planning flow: campus / games / GBP 10 -> Board Game Night / GBP 5; GBP 4 -> Acoustic Hour; GBP 0 -> no match. City-centre travel changes the result. All event/travel data is visibly fictional. An optional demo source is [venue-guide.md](../contracts/fixtures/venue-guide.md); mark it simulated when importing.
