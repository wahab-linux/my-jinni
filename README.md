# my-jinni

A desktop activity planner that combines activity and return-travel information to recommend a feasible plan and explain the cost and timing. Students are the first MVP audience; the decision core does not require student identity.

DYHTG 2026 BlackRock challenge. Backend: roXy. Desktop interface: Wahab.
Repository: [wahab-linux/my-jinni](https://github.com/wahab-linux/my-jinni). Local checkout: `my-jinni`.

## Browser edition on GitHub Pages

The browser edition runs the activity planner, local source library, TXT/Markdown/text-PDF import and selected-source passage search without installing Python or Electron. All activity and travel data is visibly fictional. Sources stay in this browser's IndexedDB; they are separate from the desktop library. Cloud AI questions remain a desktop feature; browser search returns original excerpts, not generated answers.

The Pages workflow tests and builds the site on pushes to `main`. A repository administrator must select **Settings → Pages → Build and deployment → Source: GitHub Actions** once. After a successful deployment, the site is available at **https://wahab-linux.github.io/my-jinni/**. A commit alone does not establish that it is live. See [browser setup and verification](docs/BROWSER.md).

For local development after `uv sync --locked` and `npm ci`:

```sh
npm run build:pages
python -m http.server 8080 --directory dist/pages
```

Open the local server in a modern browser. `npm run lint:web`, `npm run test:web` and `npm run test:web:e2e` check this edition; the last requires a Playwright Chromium installation (`npx playwright install chromium`).

## Current delivery

The Electron desktop client includes activity planning, a local source library, original-text citation viewing and optional source-grounded questions using OpenAI, DeepSeek, Google Gemini or Anthropic Claude. Its restricted bridge calls the Python backend, which calculates recommendations from two independently shaped simulated HTTP feeds. The launcher starts a local backend when needed and stops only the process it owns. This is a source-run application; a Windows installer and bundled Python runtime are not included.

All activities, venues, travel times, fares and availability are fictional. The configured demo day is **20 October 2026**, in `Europe/London`. Campus and city-centre origins have different travel data. This prototype is a team submission to the challenge and is not an official BlackRock or Aladdin product.

## Run the desktop application

Install [uv](https://docs.astral.sh/uv/getting-started/installation/) and Node.js 22 or later with npm. From the repository root, perform the initial setup:

```sh
uv sync
npm ci
```

On Windows, double-click `start-my-jinni.cmd`, or launch it from PowerShell:

```powershell
.\start-my-jinni.cmd
```

This uses the installed project-local Electron executable and works even when `node` and `npm` are absent from your terminal's PATH. The dependencies above must already be installed. It changes no system PATH settings and also works when invoked from another directory.

For development with Node/npm available in the terminal, the desktop window and local backend also start with:

```sh
npm run desktop
```

After dependencies are installed, Node 22+ can also launch it with `node --run desktop`. If PowerShell reports that `node` is not recognised, use the Windows launcher above. A Node runtime available inside Codex does not imply it is on an ordinary PowerShell PATH. Initial dependency installation needs Internet access. Activity planning and local source import/view/delete work without an AI key; optional questions send selected evidence to the selected provider. Choose a provider in **AI settings** and enter its own key. Keys stay separately in main-process memory for this session; switching provider never copies a key. Saving a key does not verify account/model access. Never commit or share a key.

The default local API is `http://127.0.0.1:8000`. An existing backend is reused only after health and identity checks. A busy port produces a visible retryable error. Optional `MY_JINNI_BACKEND_URL` selects another loopback HTTP origin; `MY_JINNI_DATA_DIR` explicitly overrides local storage. Normal launches preserve the backend's canonical library location and legacy-data compatibility.

## Run the backend separately

For backend-only development:

```sh
uv run python -m app
```

This starts the local API at `http://127.0.0.1:8000`. It binds to loopback only. No browser is needed to use a desktop client. `/docs` and `/openapi.json` are optional developer documentation, not the product interface.

```powershell
$request = Get-Content -Raw contracts/fixtures/recommendation-request.json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/recommendations -ContentType 'application/json' -Body $request
```

- Default campus request, budget 1000p: Board Game Night, total 500p, return 18:15.
- Budget 400p: Acoustic Hour. Budget 0p: successful no-match result.
- City-centre departure at 16:00 misses the 16:30 Board Game Night; its actual travel data is used.
- Every calculated success includes simulated-data provenance and warnings where records or journeys were excluded.

Dependencies are locked in `uv.lock`. After initial setup, activity calculations and automated tests need no Internet or key. The optional AI feature needs the user's OpenAI API key and network access; the local library uses SQLite.

## Local library and cited AI questions

The user confirmed this extension while retaining activity planning, then requested multiple providers including DeepSeek. [AI_EXTENSION.md](docs/AI_EXTENSION.md) and [AI_PROVIDERS.md](docs/AI_PROVIDERS.md) specify additive v0.4, preserving the planner and library/citation fields.

Verification passes: 474 Python tests, 46 desktop unit tests, Ruff lint/format, desktop ESLint and 20 actual Electron end-to-end checks. The latter exercise real window/IPC/HTTP/SQLite/planner/citation code, including four-provider selection, key isolation, failure/retry and stale-answer clearing. Every cloud provider transport is mocked. A successful request with a real provider account/model remains unverified.

- Import pasted text, UTF-8 TXT/Markdown or a text PDF. Select sources for each question and open citations to inspect the exact extracted quote and PDF page.
- New source libraries default to `%LOCALAPPDATA%/my-jinni/library.sqlite3` when `LOCALAPPDATA` is available, or `~/.my-jinni/library.sqlite3` otherwise. Set `MY_JINNI_DATA_DIR` to choose another local data directory. No key or chat history is stored there.
- Data compatibility: the legacy `PLANSCOPE_DATA_DIR` setting remains supported. An existing database under `%LOCALAPPDATA%/PlanScope/` or `~/.planscope/` is reused if the new default database is absent; no data is automatically moved or deleted.
- Limits: 20 sources, 5 MiB per upload, 150,000 extracted characters and 40 PDF pages. Retrieval is local lexical search over at most six chunks, not embeddings or cross-language semantic search. One library and stateless chat are the MVP; no OCR, cloud sync or URL imports.
- Provider selection offers OpenAI (`gpt-4.1-mini`), DeepSeek (`deepseek-flash`), Google Gemini (`gemini-3.8-flash`) and Anthropic Claude (`claude-sonnet-4-6`) with editable model IDs. Defaults are suggestions; account access requires a real-key check. Question and bounded selected snippets go only to that provider's fixed official HTTPS endpoint. OpenAI uses `store: false`; do not infer this option or a blanket retention guarantee for every provider. There is no automatic provider fallback or custom base URL.
- The client passes only the selected provider's session key in `X-AI-API-Key` for chat, never JSON or URLs. Legacy `X-OpenAI-API-Key` is accepted for OpenAI only; sending both headers returns 422. The backend does not save or log keys. Without matching evidence, it returns insufficient evidence without contacting any model. A failed provider never becomes a fabricated answer.
- Chat can include the current activity form's `preferences`. The actual planner result is supplied as citable simulated evidence and returned separately; it remains the authoritative cost/time/ranking display.

`GET /api/v1/sources` provides the list and capabilities. Add text with `POST /api/v1/sources`, upload multipart files to `/api/v1/sources/upload`, view/delete `/api/v1/sources/{id}`, and ask through `POST /api/v1/chat`. All use the existing data/error/warnings envelope. The named desktop operations are defined in [DESKTOP_BRIDGE.md](docs/DESKTOP_BRIDGE.md).

For a demo, import [venue-guide.md](contracts/fixtures/venue-guide.md) and mark it fictional/AI-generated. Select it and ask, "Is Board Game Night suitable for a beginner?" With a valid key, inspect the returned quote against the extracted source. You can also tick **Include my current activity preferences** to supply an actual calculated plan. Without a key, demonstrate planning and local sources; do not present automated provider mocks as a live answer.

An optional separate account check uses a hidden prompt, or the process environment, for the key:

```sh
uv run python -m scripts.verify_ai --provider deepseek
```

It makes one real billable request to the selected provider using a fictional fact and checks the returned citation. It prints no key or raw provider response. This is separate from desktop usability verification. The original `scripts.verify_openai` remains available for OpenAI-only checks.

## Structure and ownership

```text
app/
  main.py                 API orchestration and result explanations
  schemas.py              Shared JSON models
  scenario.py             Coverage, origins, supported dates and limits
  sources/adapters.py     HTTP deadlines, source validation and normalisation
  sources/mock_api.py     Independently shaped simulated feeds
  decision/domain.py      Normalised immutable records
  decision/engine.py      Pure feasibility and deterministic ranking
  knowledge/             Local library, ingestion, retrieval and OpenAI adapter
data/                     Fictional source datasets
contracts/fixtures/       Shared request/response examples, not fallback answers
desktop/                  Electron main/preload, API/lifecycle modules and renderer
tests/                    Python checks and desktop unit/end-to-end checks
scripts/                  OpenAPI export and optional live OpenAI check
docs/                     Requirements, architecture, tasks, prompts and AI log
```

Read [requirements](docs/REQUIREMENTS.md), [architecture](docs/ARCHITECTURE.md), [API](docs/API.md), and [tasks](docs/TASKS.md). The [backend prompt](docs/prompts/backend.md) and [desktop interface prompt](docs/prompts/frontend.md) define separate responsibilities. Coordinate shared schemas, examples and dependency changes before merging. All repository content must be English.

## Check

```sh
uv run ruff check .
uv run ruff format --check .
uv run pytest
uv run python -m scripts.export_openapi
npm run lint:desktop
npm run test:desktop
npm run test:e2e
```

The Electron end-to-end suite opens actual Windows app windows on isolated temporary storage and ports. All provider transports are mocked; no account key is needed. Screenshots are written under ignored `tmp/desktop/`. See [desktop/README.md](desktop/README.md) for the test boundary and launch details.

Required source calls each have a two-second deadline. A failed feed returns 503; malformed/ambiguous data returns 502; valid data with no feasible activity returns 200 with `recommended: null`. There is no automatic fixture fallback. Exact budget, outbound-arrival and return-deadline boundaries are accepted. Ranking is interest match, total cost, total travel time, then event ID.

## Remaining delivery work

Together, check the application with the team's own selected-provider account, inspect answer quality and citations, read the code you need to explain, rehearse the demo and complete the factual AI report. Record real manual edits and reviews before deciding the final AI-usage level. A packaged installer is deferred. Automated checks do not establish these human acceptance steps.
