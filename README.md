# my-jinni

A decision workspace that combines independent option and measurement sources, applies your hard limits and priorities, and explains a clear recommendation with comparable alternatives. Students are one example audience; the core works with configurable criteria and datasets.

DYHTG 2026 BlackRock challenge. Backend: roXy. Desktop interface: Wahab.
Repository: [wahab-linux/my-jinni](https://github.com/wahab-linux/my-jinni). Local checkout: `my-jinni`.

## Browser edition on GitHub Pages

The browser edition runs the general comparison workspace, detailed activity example, local source library, TXT/Markdown/text-PDF import and selected-source passage search without installing Python or Electron. All preset data is visibly fictional. Sources stay in this browser's IndexedDB; they are separate from the desktop library. Cloud AI questions remain a desktop feature; browser search returns original excerpts, not generated answers.

The Pages workflow tests and builds the site on pushes to `main`. A repository administrator must select **Settings → Pages → Build and deployment → Source: GitHub Actions** once. After a successful deployment, the site is available at **https://wahab-linux.github.io/my-jinni/**. A commit alone does not establish that it is live. See [browser setup and verification](docs/BROWSER.md).

For local development after `uv sync --locked` and `npm ci`:

```sh
npm run build:pages
python -m http.server 8080 --directory dist/pages
```

Open the local server in a modern browser. `npm run lint:web`, `npm run test:web` and `npm run test:web:e2e` check this edition; the last requires a Playwright Chromium installation (`npx playwright install chromium`).

## Current delivery

The central workspace offers **Market, Travel, Student, Sustainability and Your own idea** scenarios. Adjust criterion weights and optional minimum/maximum limits to compare actual calculated options, scores, measurements, exclusions and both source records. Custom criteria and datasets support new domains without changing the ranking core. [GENERAL_DECISIONS.md](docs/GENERAL_DECISIONS.md) defines additive v0.5, the scoring formula and exact limits.

The market preset compares fictional share/ETF/digital-asset examples using illustrative measurements. The travel preset includes train, bus, flight, taxi and cycling examples; the student preset includes courses, societies, events and internships. Sustainability compares cost, impact and waiting time. These are simulated demonstrations, not live market/travel integrations or investment recommendations. Scores express relative preference fit among supplied options, not probabilities or forecasts.

Library and question tools open on demand in compact dialogs; the activity itinerary is a collapsed detailed example. Short animations respect reduced-motion settings. Sound starts off and can be enabled with the sound button; it uses brief local synthesized tones with no media downloads.

The Electron client adds original-text citation viewing and optional source-grounded questions using OpenAI, DeepSeek, Google Gemini or Anthropic Claude. Its restricted bridge calls the Python backend, which calculates each preset comparison from two independently shaped simulated HTTP feeds. The launcher starts a local backend when needed and stops only the process it owns. This is a source-run application; a Windows installer and bundled Python runtime are not included.

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

Dependencies are locked in `uv.lock`. After initial setup, comparisons, activity calculations and automated tests need no Internet or key. Optional AI questions need a key for the selected provider and network access; the local library uses SQLite.

## Local library and cited AI questions

The user confirmed this extension while retaining activity planning, then requested multiple providers including DeepSeek. [AI_EXTENSION.md](docs/AI_EXTENSION.md) and [AI_PROVIDERS.md](docs/AI_PROVIDERS.md) specify additive v0.4, preserving the planner and library/citation fields.

The prior v0.4 baseline passed 474 Python tests, 46 desktop unit tests and 20 actual Electron end-to-end checks, alongside lint/format. These regressions remain in the current checks below. Every cloud provider transport is mocked. A successful request with a real provider account/model remains unverified.

- Import pasted text, UTF-8 TXT/Markdown or a text PDF. Select sources for each question and open citations to inspect the exact extracted quote and PDF page.
- New source libraries default to `%LOCALAPPDATA%/my-jinni/library.sqlite3` when `LOCALAPPDATA` is available, or `~/.my-jinni/library.sqlite3` otherwise. Set `MY_JINNI_DATA_DIR` to choose another local data directory. No key or chat history is stored there.
- Data compatibility: the legacy `PLANSCOPE_DATA_DIR` setting remains supported. An existing database under `%LOCALAPPDATA%/PlanScope/` or `~/.planscope/` is reused if the new default database is absent; no data is automatically moved or deleted.
- Limits: 20 sources, 5 MiB per upload, 150,000 extracted characters and 40 PDF pages. Retrieval is local lexical search over at most six chunks, not embeddings or cross-language semantic search. One library and stateless chat are the MVP; no OCR, cloud sync or URL imports.
- Provider selection offers OpenAI (`gpt-4.1-mini`), DeepSeek (`deepseek-flash`), Google Gemini (`gemini-3.8-flash`) and Anthropic Claude (`claude-sonnet-4-6`) with editable model IDs. Defaults are suggestions; account access requires a real-key check. Question and bounded selected snippets go only to that provider's fixed official HTTPS endpoint. OpenAI uses `store: false`; do not infer this option or a blanket retention guarantee for every provider. There is no automatic provider fallback or custom base URL.
- The client passes only the selected provider's session key in `X-AI-API-Key` for chat, never JSON or URLs. Legacy `X-OpenAI-API-Key` is accepted for OpenAI only; sending both headers returns 422. The backend does not save or log keys. Without matching evidence, it returns insufficient evidence without contacting any model. A failed provider never becomes a fabricated answer.
- Chat can include the current activity form's `preferences`. The actual planner result is supplied as citable simulated evidence and returned separately; it remains the authoritative cost/time/ranking display.
- Chat can also include the current general `decision_request`. The backend recalculates it through the ordinary comparison endpoint and returns its exact result separately. A bounded ephemeral `decision-context` supplies the calculated winner, alternatives and source metadata for checked quotations; it is never saved as a library document. Neither AI questions nor imported documents automatically change comparison inputs.

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
  comparison/            Pure general scoring, scenario catalog, HTTP adapters and API
  knowledge/             Local library, ingestion, retrieval and OpenAI adapter
data/                     Fictional source datasets
  decisions/              Two independently shaped feeds per general scenario
contracts/fixtures/       Shared request/response examples, not fallback answers
desktop/                  Electron main/preload, API/lifecycle modules and renderer
web/                      Static comparison UI, local library and JavaScript decision core
tests/                    Python checks and desktop unit/end-to-end checks
scripts/                  OpenAPI export and optional live OpenAI check
docs/                     Requirements, architecture, tasks, prompts and AI log
```

Read [requirements](docs/REQUIREMENTS.md), [architecture](docs/ARCHITECTURE.md), [API](docs/API.md), and [tasks](docs/TASKS.md). The [backend prompt](docs/prompts/backend.md) and [desktop interface prompt](docs/prompts/frontend.md) define separate responsibilities. Coordinate shared schemas, examples and dependency changes before merging. All repository content must be English.

## Check

The v0.5 verification passes **566 Python tests**, including 77 focused comparison checks, 140 complete generic browser/Python parity cases and the 226 retained activity parity cases; **50 desktop and 31 browser Node unit tests**; **32 actual Electron and 30 Chromium browser checks**; Ruff lint/format, both ESLint checks and the static build. Mocked/live boundaries are recorded in [AI_USAGE.md](docs/AI_USAGE.md). The existing Starlette/httpx TestClient deprecation warning remains.

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
