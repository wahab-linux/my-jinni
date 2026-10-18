# Jinni desktop client

The Electron client loads the same local `web/index.html`, styles and presentation modules as the browser edition. Changes to the browser frontend therefore apply to desktop automatically. `web/platform.mjs` uses the restricted bridge for authoritative Python calculations, SQLite sources and native imports. Optional native AI tools extend the shared workspace. Comparisons cover market context, travel, student opportunities, sustainability and custom data; built-in datasets are fictional.

The visible product name is **Jinni**. Its original violet-and-gold lamp mark is inline SVG, with no third-party artwork or external assets. Technical `my-jinni` bridge, storage, repository and launcher identifiers remain unchanged for compatibility.

Sources and cited AI questions start closed in optional dialogs. The activity itinerary remains a collapsed example. Provider selection, import/view/delete, original quotes and separate session keys for OpenAI, DeepSeek, Google Gemini and Anthropic Claude remain available. Comparisons and planning need no AI key.

The language selector offers English, Simplified Chinese, French, Japanese and Russian. Switching preserves inputs, comparisons, evidence and session keys. Original text, exact quotes, answers and custom labels/units remain literal. GBP pence, London-aware times, API fields and ranking stay unchanged. `shared/i18n.js` and `web/locales.js` serve both editions; the native addon registers only missing messages. Blocked storage uses an in-memory choice, and missing labels fall back to English.

## Setup and launch

From the repository root, install Python dependencies with `uv sync` and Node dependencies with `npm ci`. Node 22+ and uv are required for initial setup. On Windows, double-click the root `start-my-jinni.cmd` or run `.\start-my-jinni.cmd` in PowerShell. It launches project-local Electron without requiring Node/npm on the terminal PATH and resolves its working directory from the script location. A missing Electron dependency produces an explicit setup message. The script changes no system PATH settings. With Node on PATH, `npm run desktop` or Node 22+ `node --run desktop` are also available. A runtime available only inside Codex does not make these developer commands available in an ordinary terminal. Electron 44.9.0 and the verification tools are pinned in `package-lock.json`.

The launcher checks `/health` and the OpenAPI title before reusing `http://127.0.0.1:8000`. Otherwise it starts the repository's `.venv` Python interpreter, or `uv run --no-sync`, with loopback binding, no shell and no reload. Closing the client stops only its owned backend. A separately started `uv run python -m app` remains running. Startup failures and port conflicts appear in the window with a retry action.

Optional `MY_JINNI_BACKEND_URL` accepts only a loopback HTTP origin. Explicit `MY_JINNI_DATA_DIR` isolates both library storage and the Electron profile; normal launches leave the backend's canonical default storage unchanged. No installer or bundled Python runtime is delivered.

## Implementation

```text
desktop/
  main.cjs          Window, validated IPC and native file picker
  preload.cjs       Named window.myJinni methods only
  assets.cjs        Allowlisted jinni://app local frontend assets
  api-client.cjs    Bounded local HTTP, status preservation, isolated provider keys
  backend.cjs       Identity/readiness checks and owned-process lifecycle
  validation.cjs    Restricted route/input/loopback validation
  renderer/index.html  Inert legacy preference-migration stub only
web/
  index.html        Same page used in Electron and browsers
  styles.css        Common responsive appearance
  app.mjs           Common activity/library interactions
  decision-app.mjs  Common comparison controls and results
  platform.mjs      Browser/native operation adapter
  ui-context.mjs    Explicit current selection/form readers
  desktop-ai.mjs    Optional native provider/settings/chat tools
```

Read [GENERAL_DECISIONS.md](../docs/GENERAL_DECISIONS.md) for additive v0.5, [DESKTOP_BRIDGE.md](../docs/DESKTOP_BRIDGE.md) for the bridge, [AI_EXTENSION.md](../docs/AI_EXTENSION.md) for source/chat behaviour and [AI_PROVIDERS.md](../docs/AI_PROVIDERS.md) for provider selection. The renderer loads scenario definitions and both-source data through named bridge operations; it never substitutes a static successful ranking. Custom JSON editing is optional and expanded on demand. Unknown measurements/availability cannot become zero or true.

Preserve integer pence and aware `Europe/London` times in the detailed itinerary. Chat/settings provider selectors stay synchronised, editable models are remembered separately in session memory, and changing provider clears key entry plus pending/old answers. Source/provider content renders as text. Chat can explicitly include current comparison settings: the server recalculates them, returns the authoritative decision separately and supplies temporary `decision-context` evidence. Its citations show the quote and returned comparison without looking up a nonexistent library item. The older itinerary-context option is preserved.

Appearance, background waves, sound and language use the same controls and local preferences as the browser. Sound starts off for a fresh profile and requires user opt-in; playback follows an interaction. Motion respects `prefers-reduced-motion`. Existing valid preferences migrate from the previous file origin without reading unrelated storage, documents or keys. Keys and model choices remain session-only.

Context isolation and sandboxing are enabled; renderer Node integration is disabled. The renderer has no general HTTP, shell, IPC or file-path access. Main owns HTTP and the native picker. Each provider's key remains in a private main-process session map; chat attaches only the selected key in `X-AI-API-Key`. Clear removes only the selected provider's key, while quitting clears all keys. The bridge's legacy string setter and omitted provider arguments continue to refer to OpenAI only. Settings return a configured boolean, never keys; saving is not an account-access test. Before generation, the window names the selected recipient of questions and evidence snippets. No keys/models are persisted, no arbitrary provider URL is exposed, and no automatic provider fallback or key sharing occurs. Planning remains keyless.

## Verification

```sh
npm run lint:desktop
npm run test:desktop
npm run test:e2e
```

The unit suite covers route/provider/input validation, asset confinement, safe errors, HTTP statuses/deadlines, isolated keys, header stripping and backend ownership/races. Actual Electron tests use temporary storage/ports and real Python APIs. They cover common assets/controls, five calculated scenarios, custom data and constraints, both activity origins, source/PDF operations and persistence, provider keys, exact citations, authoritative contexts, safe failures/retry and stale answers. Languages, themes, sound, motion, keyboard, resizing and process lifecycle remain part of acceptance. Cloud transports are mocked; passing them does not establish live access. Actual counts are recorded in `docs/AI_USAGE.md`. Screenshots are ignored under `tmp/desktop/`.

The import test substitutes the native picker's return value with a generated fictional PDF; subsequent file reading, multipart upload, extraction and storage are real. The test does not verify a person's interaction with the operating-system picker. Audio checks establish synthesis requests, not human audibility. Actual account/model access for each provider and human demo rehearsal remain separate checks.

Choose a topic, set priorities/limits and compare. Relative fit is not a probability or forecast. Sources and Ask AI open on demand.

For the collapsed detailed activity example: campus / games / GBP 10 -> Board Game Night / GBP 5; GBP 4 -> Acoustic Hour; GBP 0 -> no match. City-centre travel changes the result. Event/travel data stays visibly fictional. An optional source is [venue-guide.md](../contracts/fixtures/venue-guide.md); mark it simulated when importing.
