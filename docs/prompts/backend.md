# Backend development and integration prompt

Current visible product name is `jinni`. Preserve the existing repository, storage, IPC and API identity for compatibility; a branding change must not migrate or discard user data. UI language support cannot silently translate source evidence or alter units and ranking.

You are maintaining jinni in `wahab-linux/my-jinni` for the DYHTG 2026 BlackRock challenge. I own the Python backend; Wahab owns the Electron desktop client. The product compares options across configurable domains; students and detailed activity planning are examples. All repository content must be English.

Read `docs/GENERAL_DECISIONS.md` for additive v0.5 before editing. Preserve the generic pure comparison in `app/comparison/engine.py`, configured catalog, two differently shaped source feeds per preset, custom criteria/datasets and full browser/Python parity. Keep domains out of core rules; enforce bounded inputs, known availability, hard limits, nonnegative integer pence, deterministic weighted min/max scoring and stable ties. Never promote simulation into live market/routing claims. `decision_request` chat inclusion must call the real endpoint, return its exact result and use bounded ephemeral `decision-context`; preserve the older activity context and all citation/provider/key controls.

Read `AGENTS.md`, `docs/AI_EXTENSION.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/TASKS.md`, `app/schemas.py`, `app/scenario.py` and `contracts/fixtures/`. Inspect existing implementation and tests before editing. The engine is implemented; do not recreate the old HTTP 501 scaffold or present a static example as a calculation.

## Confirmed additive AI extension

The user retained the planner and approved a local source library plus cited OpenAI questions. Contract v0.3 adds source CRUD/import and chat endpoints without changing v0.2 activity fields. `app/knowledge/` owns SQLite storage, lexical retrieval, text/PDF ingestion, the Responses adapter and citation validation; `docs/AI_EXTENSION.md` defines scope and errors. The planner remains deterministic and usable without a key.

Current v0.4 is defined in `docs/AI_PROVIDERS.md`: support OpenAI, DeepSeek, Gemini and Claude through fixed official endpoints, a shared citation contract and isolated provider session keys. Use canonical `X-AI-API-Key`; legacy `X-OpenAI-API-Key` is OpenAI-only and both headers together return 422. Preserve 30-second deadlines, input/output bounds and no provider fallback. OpenAI retains `store: false`, which is not a cross-provider retention promise. Treat source text as untrusted data; require exact selected-chunk citations, without claiming semantic truth. No evidence avoids every provider call. Inspect the existing adapters rather than recreating them.

Chat optionally accepts existing form preferences. Calculate those with the actual recommendation endpoint and supply the result as ephemeral `planner-context`; return structured planner data for the client. Do not extract/change the form silently, invent travel, or replace a failed plan with model guesses. Keep selected source IDs isolated, delete their chunks/index entries and store runtime data outside Git. `MY_JINNI_DATA_DIR` configures the local storage directory.

First integrate TXT/Markdown/text PDFs, source selection, one answer with checked citations, an absent-answer case and a provider error. Do not expand to cloud sync, OCR, scraping, embeddings or multiple notebooks before this works. Use mocked provider transports for automated checks; actual OpenAI success and desktop usability must be tested separately with the team's own key.

## Boundaries and existing implementation

- Own `app/`, `data/`, backend tests and `scripts/`. Wahab owns `desktop/`, Electron main/preload/renderer and client tests. Coordinate shared schemas, examples, Node/Python dependency files, OpenAPI and docs. Keep API contract v0.2 field names and units.
- `app/sources/adapters.py` fetches both feeds with injected `httpx.AsyncClient`, concurrent calls and a two-second deadline per source. Same-process mock HTTP routes use ASGITransport without a hardcoded external server. Travel requests explicitly select and verify `origin_id`.
- `app/decision/domain.py` defines normalised records. `engine.calculate` is pure: no FastAPI, HTTP, file I/O, source-schema or scenario dependency. It checks all hard constraints before deterministic ranking.
- `app/main.py` validates scenario coverage, fetches sources, calls the engine and renders factual explanations and the response envelope. `app/scenario.py` owns supported origins, fictional dates, timezone and budget cap. The general request model and engine remain independent of these demo limits.
- The implemented Electron main process calls the local API through fixed IPC methods exposed by preload. See `docs/DESKTOP_BRIDGE.md` for the named operations and `tests/desktop/` for real-window verification. The renderer uses HTML/CSS/JavaScript inside the desktop window. No standalone website, wildcard CORS or disabled browser security is needed.

## Rules to preserve

1. Convert event GBP strings with Decimal into exact integer pence. Reject negative/nonfinite/subpenny prices. Add ticket cost plus one return fare; never double that fare.
2. Require total cost <= budget, departure + outbound <= event start, and event end + return <= deadline. Equality passes. Compare aware timestamps as instants and add travel across DST correctly.
3. Rank interest match first, then total cost, total outbound + return minutes, then stable event ID. Unmatched interests may remain feasible but explanations must not claim a match. Return one recommendation and at most two alternatives.
4. Missing/unavailable travel excludes affected activities and warns `MISSING_JOURNEY`. Unknown duration/cost is never zero. Keep simulated-data warnings and provider labels/timestamps, including the requested travel origin.
5. A valid empty search is HTTP 200 with null recommendation and no alternatives. A required source failure/timeout is 503; invalid structure, duplicate identity, wrong origin or an all-invalid nonempty feed is 502. Safely skipped individual records warn `INVALID_RECORD_SKIPPED`. No partial success or fixture fallback hides a feed failure.
6. Preserve strict request types, distinct supported interests, aware ordered times, extra-field rejection and scenario validation before source calls. Unsupported app coverage is 422 even when the generic model could represent it.

## Next backend work: integrate the actual desktop client

1. Start `uv run python -m app`. Confirm `/health` readiness and `/api/v1/options`; share the base URL and the exact request example with Wahab. No API keys or live data are required.
2. Verify real campus requests with budgets 1000, 400 and 0 pence: Board Game Night at 500p / return 18:15; Acoustic Hour; no match. Verify city centre at 16:00 excludes Board Game Night and uses city travel/provenance.
3. Work with Wahab on loading, success, no-match, 422, 502, 503 and retry. Label which failures used injected transports rather than an actual desktop run. Preserve HTTP statuses across IPC. Do not claim backend tests verify the window.
4. Coordinate the Electron-owned Python process lifecycle: loopback, portable interpreter paths, readiness checks, no auto-reload for a managed process, and shutdown only of the child the client created. `python -m app` starts without reload by default. A separately started backend must remain running when the client closes.
5. After an agreed API change, regenerate `uv run python -m scripts.export_openapi` and review the diff. Keep `contracts/fixtures/`, schemas, API docs and client consistent.
6. Run `uv run ruff check .`, `uv run ruff format --check .`, and `uv run pytest`. Existing tests cover boundary equality, ranking, both actual mock routes, independent event/travel changes, validation and source failures. Add tests only for meaningful new behaviour or regressions.
7. Keep `docs/AI_USAGE.md` factual: actual tools/models, generated work, human decisions/edits and checks. Human code review, demo rehearsal and final AI classification must reflect what actually occurred.

If substantial independent implementation remains, delegate bounded tasks with exclusive file ownership; keep API integration with the coordinator. Do not overlap Wahab's files. Report actual commands/results, files, limitations and remaining client/human acceptance work. Keep small readable commits and preserve teammate changes.
