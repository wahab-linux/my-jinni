# my-jinni

A desktop activity planner that combines activity and return-travel information to recommend a feasible plan and explain the cost and timing. Students are the first MVP audience; the decision core does not require student identity.

DYHTG 2026 BlackRock challenge. Backend: roXy. Desktop interface: Wahab.
Repository: [wahab-linux/my-jinni](https://github.com/wahab-linux/my-jinni). Local checkout: `my-jinni`.

## Current delivery

The Python backend calculates recommendations from two independently shaped simulated HTTP feeds. It also provides a local source library and optional source-grounded OpenAI questions with checked citations. The product interface is an Electron desktop client using HTML/CSS/JavaScript; Wahab owns that implementation. No desktop window or installer is delivered by the backend command below.

All activities, venues, travel times, fares and availability are fictional. The configured demo day is **20 October 2026**, in `Europe/London`. Campus and city-centre origins have different travel data. This prototype is a team submission to the challenge and is not an official BlackRock or Aladdin product.

## Run the backend

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then run from the repository root:

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

Verification: 344 tests, Ruff lint and formatting pass. Real local HTTP checks covered source creation/view/list/delete, insufficient evidence, missing-key errors and the original keyless planner. OpenAI output tests use injected transports; a successful real account/model request and the Electron UI still require separate verification.

- Import pasted text, UTF-8 TXT/Markdown or a text PDF. Select sources for each question and open citations to inspect the exact extracted quote and PDF page.
- New source libraries default to `%LOCALAPPDATA%/my-jinni/library.sqlite3` when `LOCALAPPDATA` is available, or `~/.my-jinni/library.sqlite3` otherwise. Set `MY_JINNI_DATA_DIR` to choose another local data directory. No key or chat history is stored there.
- Data compatibility: the legacy `PLANSCOPE_DATA_DIR` setting remains supported. An existing database under `%LOCALAPPDATA%/PlanScope/` or `~/.planscope/` is reused if the new default database is absent; no data is automatically moved or deleted.
- Limits: 20 sources, 5 MiB per upload, 150,000 extracted characters and 40 PDF pages. Retrieval is local lexical search over at most six chunks, not embeddings or cross-language semantic search. One library and stateless chat are the MVP; no OCR, cloud sync or URL imports.
- OpenAI requests send the question and selected evidence snippets to the fixed Responses endpoint with `store: false`. This is not a blanket provider retention guarantee. The default model is `gpt-4.1-mini`; actual model/account access must be checked with the team's own key.
- The client passes its session key in `X-OpenAI-API-Key` for chat, never JSON or URLs. The backend does not save or log it. Without matching evidence, it returns insufficient evidence without contacting the model. A failed provider never becomes a fabricated answer.
- Chat can include the current activity form's `preferences`. The actual planner result is supplied as citable simulated evidence and returned separately; it remains the authoritative cost/time/ranking display.

`GET /api/v1/sources` provides the list and capabilities. Add text with `POST /api/v1/sources`, upload multipart files to `/api/v1/sources/upload`, view/delete `/api/v1/sources/{id}`, and ask through `POST /api/v1/chat`. All use the existing data/error/warnings envelope. Read the extension before wiring these calls through Electron's restricted IPC bridge.

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
desktop/                  Wahab's client implementation boundary and handoff
tests/                    Contract, source, rule and integration checks
scripts/                  OpenAPI export
docs/                     Requirements, architecture, tasks, prompts and AI log
```

Read [requirements](docs/REQUIREMENTS.md), [architecture](docs/ARCHITECTURE.md), [API](docs/API.md), and [tasks](docs/TASKS.md). The [backend prompt](docs/prompts/backend.md) and [desktop interface prompt](docs/prompts/frontend.md) define separate responsibilities. Coordinate shared schemas, examples and dependency changes before merging. All repository content must be English.

## Check

```sh
uv run ruff check .
uv run ruff format --check .
uv run pytest
uv run python -m scripts.export_openapi
```

Required source calls each have a two-second deadline. A failed feed returns 503; malformed/ambiguous data returns 502; valid data with no feasible activity returns 200 with `recommended: null`. There is no automatic fixture fallback. Exact budget, outbound-arrival and return-deadline boundaries are accepted. Ranking is interest match, total cost, total travel time, then event ID.

## Remaining delivery work

Wahab must implement and verify the desktop window, asynchronous API calls, results, loading/error/retry states, and the launcher/backend lifecycle. Together, verify the real client flow, source failure and retry, packaging if time permits, code understanding, demo rehearsal and the factual AI report. Backend automated checks do not establish that these human and UI acceptance steps are complete.
