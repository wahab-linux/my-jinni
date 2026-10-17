# my-jinni

A desktop activity planner that combines activity and return-travel information to recommend a feasible plan and explain the cost and timing. Students are the first MVP audience; the decision core does not require student identity.

DYHTG 2026 BlackRock challenge. Backend: roXy. Desktop interface: Wahab.
Repository: [wahab-linux/my-jinni](https://github.com/wahab-linux/my-jinni). Local checkout: `my-jinni`.

## Current delivery

The Electron desktop client includes activity planning, a local source library, original-text citation viewing and optional source-grounded OpenAI questions. Its restricted bridge calls the Python backend, which calculates recommendations from two independently shaped simulated HTTP feeds. The launcher starts a local backend when needed and stops only the process it owns. This is a source-run application; a Windows installer and bundled Python runtime are not included.

All activities, venues, travel times, fares and availability are fictional. The configured demo day is **20 October 2026**, in `Europe/London`. Campus and city-centre origins have different travel data. This prototype is a team submission to the challenge and is not an official BlackRock or Aladdin product.

## Run the desktop application

Install [uv](https://docs.astral.sh/uv/getting-started/installation/) and Node.js 22 or later with npm. From the repository root, perform the initial setup:

```sh
uv sync
npm ci
```

Then launch the desktop window and its local backend with one command:

```sh
npm run desktop
```

After dependencies are installed, Node 22+ can also launch it with `node --run desktop`. Initial dependency installation needs Internet access. Activity planning and local source import/view/delete work without an AI key; optional questions send selected evidence to OpenAI. Enter your own key in **AI settings**; it stays in main-process memory for this app session. Saving it does not verify model/account access. Never commit or share a key.

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

The user confirmed this extension while retaining activity planning. [AI_EXTENSION.md](docs/AI_EXTENSION.md) specifies its additive v0.3 contract, ownership, errors and desktop handoff.

The backend baseline has 348 passing tests. Real Electron checks cover planner results, source import/view/delete, source selection, session-key clearing, persistence, error/retry and managed backend startup/shutdown. Automated cited-answer checks use a mocked OpenAI transport while exercising the real window, IPC, HTTP, SQLite and citation validator. A successful request with a real OpenAI account/model remains unverified.

- Import pasted text, UTF-8 TXT/Markdown or a text PDF. Select sources for each question and open citations to inspect the exact extracted quote and PDF page.
- New source libraries default to `%LOCALAPPDATA%/my-jinni/library.sqlite3` when `LOCALAPPDATA` is available, or `~/.my-jinni/library.sqlite3` otherwise. Set `MY_JINNI_DATA_DIR` to choose another local data directory. No key or chat history is stored there.
- Data compatibility: the legacy `PLANSCOPE_DATA_DIR` setting remains supported. An existing database under `%LOCALAPPDATA%/PlanScope/` or `~/.planscope/` is reused if the new default database is absent; no data is automatically moved or deleted.
- Limits: 20 sources, 5 MiB per upload, 150,000 extracted characters and 40 PDF pages. Retrieval is local lexical search over at most six chunks, not embeddings or cross-language semantic search. One library and stateless chat are the MVP; no OCR, cloud sync or URL imports.
- OpenAI requests send the question and selected evidence snippets to the fixed Responses endpoint with `store: false`. This is not a blanket provider retention guarantee. The default model is `gpt-4.1-mini`; actual model/account access must be checked with the team's own key.
- The client passes its session key in `X-OpenAI-API-Key` for chat, never JSON or URLs. The backend does not save or log it. Without matching evidence, it returns insufficient evidence without contacting the model. A failed provider never becomes a fabricated answer.
- Chat can include the current activity form's `preferences`. The actual planner result is supplied as citable simulated evidence and returned separately; it remains the authoritative cost/time/ranking display.

`GET /api/v1/sources` provides the list and capabilities. Add text with `POST /api/v1/sources`, upload multipart files to `/api/v1/sources/upload`, view/delete `/api/v1/sources/{id}`, and ask through `POST /api/v1/chat`. All use the existing data/error/warnings envelope. The named desktop operations are defined in [DESKTOP_BRIDGE.md](docs/DESKTOP_BRIDGE.md).

For a demo, import [venue-guide.md](contracts/fixtures/venue-guide.md) and mark it fictional/AI-generated. Select it and ask, "Is Board Game Night suitable for a beginner?" With a valid key, inspect the returned quote against the extracted source. You can also tick **Include my current activity preferences** to supply an actual calculated plan. Without a key, demonstrate planning and local sources; do not present automated provider mocks as a live answer.

An optional separate account check uses a hidden prompt, or the process environment, for the key:

```sh
uv run python -m scripts.verify_openai
```

It makes one real billable request using a fictional fact and checks the returned citation. It prints no key or raw provider response. This is separate from desktop usability verification.

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

The Electron end-to-end suite opens actual Windows app windows on isolated temporary storage and ports. OpenAI transport is mocked; no account key is needed. Screenshots are written under ignored `tmp/desktop/`. See [desktop/README.md](desktop/README.md) for the test boundary and launch details.

Required source calls each have a two-second deadline. A failed feed returns 503; malformed/ambiguous data returns 502; valid data with no feasible activity returns 200 with `recommended: null`. There is no automatic fixture fallback. Exact budget, outbound-arrival and return-deadline boundaries are accepted. Ranking is interest match, total cost, total travel time, then event ID.

## Remaining delivery work

Together, check the application with the team's own OpenAI account, inspect answer quality and citations, read the code you need to explain, rehearse the demo and complete the factual AI report. Record real manual edits and reviews before deciding the final AI-usage level. A packaged installer is deferred. Automated checks do not establish these human acceptance steps.
