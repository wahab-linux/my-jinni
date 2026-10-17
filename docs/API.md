# API contract v0.5

v0.5 adds configurable option comparisons, five initial scenarios and optional calculated comparison evidence in chat. Read [GENERAL_DECISIONS.md](GENERAL_DECISIONS.md) for complete models, ranking, limits, source routes, failure handling and browser export. Existing activity, library and provider operations below are retained unchanged.

| Method | Added path | Result data |
| --- | --- | --- |
| GET | `/api/v1/decision-scenarios` | `{scenarios:[Scenario]}` |
| GET | `/api/v1/decision-scenarios/{id}` | `{scenario,dataset}` from both HTTP sources |
| POST | `/api/v1/decisions/evaluate` | Calculated `DecisionResult` |
| GET | `/mock/decisions/{id}/options` | Independent simulated option catalog |
| GET | `/mock/decisions/{id}/metrics` | Differently shaped simulated measurements |

Chat accepts optional `decision_request: DecisionRequest` and returns additive `decision: DecisionResult|null`, distinct from the existing `preferences`/`planner` pair. Unknown scenario is 404; invalid preferences are 422; unavailable/invalid comparison sources are 503/502. A valid empty comparison is 200 with `recommended:null`. No cloud key is sent when fetching or evaluating decisions.

v0.3 added the source-library and cited-answer endpoints in [AI_EXTENSION.md](AI_EXTENSION.md). v0.4 adds OpenAI, DeepSeek, Google Gemini and Anthropic Claude selection as specified in [AI_PROVIDERS.md](AI_PROVIDERS.md): optional chat `provider`, selected-provider default model, response provider identity and source-list provider catalog. `X-AI-API-Key` is canonical; legacy `X-OpenAI-API-Key` remains OpenAI-only and supplying both is 422. Every v0.2 activity field and v0.3 library/citation field is preserved. AI uses the selected provider's separate session key; the activity planner needs none. The OpenAPI snapshot includes all endpoints.

Read together before implementation. `docs/openapi.json` is the machine-readable snapshot; it must match `app/schemas.py` and the running API. v0.2 is an explicitly coordinated breaking scaffold update; URLs remain `/api/v1` because the first completed API has not shipped.

Here **v0.2 is the contract revision**, not a package release. Application package, `/health.version`, and OpenAPI `info.version` are **0.1.0**.

## Migration

- Replace activity result `back_on_campus_at` with **`return_at`**: arrival back at the selected origin. The old field is removed.
- Options replaces `origin_id`/`origin_label` with **`origins: [{id, label}]`**, adding **`supported_dates`** and **`max_budget_pence`**. The initial origin is `default_request.origin_id`.
- `demo_date` remains the date-control default, not the complete support list. Use `supported_dates` for coverage.
- Travel source metadata now includes **`origin_id`**. Integration must request that origin explicitly and verify the returned origin before joining data.
- Money/time units, other business names, envelope, and ranking stay unchanged. Fixtures and OpenAPI migrate together. The engine now computes responses from both feeds.

## Boundaries

my-jinni compares supplied options using configurable criteria and separate source data. `app/comparison/` owns the reusable general comparison. The activity example still helps anyone choose an activity using budget, time, interests and return travel. `app/scenario.py` configures that example's two origins, source-data day, timezone and budget cap. See `docs/ARCHITECTURE.md`.

GBP, five activity categories, return to the same origin, fixed travel durations and fictional feeds remain limits of the detailed activity endpoint. They do not constrain the general comparison endpoint, whose criteria and datasets can describe other domains. No preset establishes live service coverage.

## Conventions

- Local API base URL: `http://127.0.0.1:8000`; JSON requests use `Content-Type: application/json`. The Electron main process calls these endpoints through a restricted preload/IPC bridge; the renderer does not need a CORS exception.
- Success: `{ "data": ..., "error": null, "warnings": [] }`. Error: `{ "data": null, "error": { "code", "message", "details": [] }, "warnings": [] }`. Exactly one of data/error is non-null.
- Money is **integer pence** (£10 = `1000`). Only raw event `price_gbp` uses decimal GBP strings. Travel cost includes the return journey; do not double it.
- Timestamps are ISO 8601 with UTC offset. Validate scenario dates/display in `Europe/London`. Current default **2026-10-20** uses `+01:00`. Reject naive timestamps.
- `origin_id` is a nonempty lowercase slug; the traveller returns to that selected origin.
- Interests: `games`, `music`, `arts`, `sport`, `learning`; supply 1–5 distinct, equally prioritised interests.
- Structural validation: strict nonnegative integer budget, aware timestamps, `return_by > depart_at`, origin slug, distinct interests, and no extra fields. No configured date/origin lookup or demo budget cap belongs here.
- Application validation: origin must appear in options, both timestamps' London dates must appear in `supported_dates`, and budget must not exceed `max_budget_pence`. Unsupported scenarios return 422 before source fetching.
- All fixtures are fictional. Completed recommendation success responses must include `SIMULATED_DATA`.

## Endpoints

| Method | Path | Purpose | Status |
| --- | --- | --- | --- |
| GET | `/health` | Server and `recommendations_ready` | Implemented; true |
| GET | `/api/v1/options` | Origins, dates, interests, defaults | Implemented |
| POST | `/api/v1/recommendations` | Calculated activity decision | Implemented |
| GET | `/mock/events` | Independent event feed | Implemented |
| GET | `/mock/travel?origin_id=...` | Selected-origin travel feed | Implemented |

`/docs` and `/openapi.json` provide developer documentation. `/` returns the health envelope; there is no website or `/static/` route. `/fixtures/*.json` serves explicit JSON examples rather than computed results. The product interface belongs to the Electron desktop client.

## Options

`GET /api/v1/options` returns this data object (the actual interests list contains all five categories):

```json
{
  "demo_date": "2026-10-20",
  "supported_dates": ["2026-10-20"],
  "timezone": "Europe/London",
  "origins": [
    {"id": "glasgow-main-campus", "label": "University of Glasgow main campus"},
    {"id": "glasgow-city-centre", "label": "Glasgow city centre"}
  ],
  "max_budget_pence": 20000,
  "currency": "GBP",
  "interests": [{"id": "games", "label": "Games"}],
  "default_request": {
    "origin_id": "glasgow-main-campus",
    "budget_pence": 1000,
    "depart_at": "2026-10-20T16:00:00+01:00",
    "return_by": "2026-10-20T19:00:00+01:00",
    "interests": ["games"]
  },
  "is_simulated": true
}
```

The city-centre choice requires no student identity. The single date reflects source coverage, not a core algorithm constraint.

## POST request

```json
{
  "origin_id": "glasgow-main-campus",
  "budget_pence": 1000,
  "depart_at": "2026-10-20T16:00:00+01:00",
  "return_by": "2026-10-20T19:00:00+01:00",
  "interests": ["games"]
}
```

Changing the origin to `glasgow-city-centre` uses its own travel feed: the default request selects `event-film`, total 600p, outbound 8 minutes and return 9 minutes. Board Game Night is excluded because arrival would miss its start. Other dates/origins can pass structural validation while receiving application 422 because this demo lacks coverage.

## Responses

`data.recommended` is one activity or null; `data.alternatives` has zero to two; `data.message` explains the outcome; `data.sources` records source labels, timestamps, simulated status, and travel `origin_id`.

Each activity has `event_id`, `title`, `venue_name`, `category`, `starts_at`, `ends_at`, `ticket_cost_pence`, `travel_cost_pence`, `total_cost_pence`, `outbound_minutes`, `return_minutes`, `arrive_at`, **`return_at`**, and `reasons`.

Canonical campus examples:

- Request: `contracts/fixtures/recommendation-request.json`
- Success (HTTP 200): `contracts/fixtures/recommendation-success.json`
- No match (HTTP 200, default request budget 0): `contracts/fixtures/recommendation-empty.json`
- Source failure (HTTP 503): `contracts/fixtures/recommendation-error.json`

Static error files return HTTP 200 as files but represent a real 503 body; any explicit client preview must model that status. Campus examples must not be presented as calculated city-centre results. City-centre travel to `venue-west` takes 35 minutes and costs 400 pence return, versus campus's 15 minutes and 200 pence.

## Errors and warnings

| HTTP | Code | Meaning |
| --- | --- | --- |
| 422 | `VALIDATION_ERROR` | Invalid structure or unsupported scenario |
| 404 | `NOT_FOUND` | Missing endpoint |
| 405 | `METHOD_NOT_ALLOWED` | Wrong method |
| 502 | `INVALID_SOURCE_DATA` | Invalid/ambiguous source or origin mismatch |
| 503 | `SOURCE_UNAVAILABLE` | Source timeout/failure |
| 500 | `INTERNAL_ERROR` | Unexpected error; no stack trace exposed |

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check your request.",
    "details": [{"field": "body.origin_id", "message": "Choose an origin from /api/v1/options."}]
  },
  "warnings": []
}
```

Warnings use `{ "code": "...", "message": "..." }`. Reserved: `SIMULATED_DATA`, `INVALID_RECORD_SKIPPED`, `MISSING_JOURNEY`. Never conceal a required-source failure with a warning.

Each required source has a **two-second wall-clock deadline**. Both calls run concurrently. Source HTTP/transport failures map to 503; a source-reported `INVALID_SOURCE_DATA` maps to 502. There is no required-feed fallback. A malformed individual record is skipped only if valid records remain; invalid metadata, ambiguous IDs, origin mismatch or all-invalid nonempty lists fail with 502. Valid empty lists yield a successful no-match search.

## Source formats and isolation

Events: `data.provider`, `data.is_simulated`, `data.updated_at`, `data.events[]`. Each event has `id`, nested `venue.id/name`, `category`, aware `starts_at/ends_at`, and decimal `price_gbp` such as `"3.00"`.

Travel: `data.provider`, `data.is_simulated`, `data.updated_at`, **`data.origin_id`**, `data.journeys[]`. Journeys have `destination_id`, `outbound_minutes`, `return_minutes`, `return_fare_pence`, `available`.

- `/mock/travel` defaults to campus for compatibility. The adapter explicitly passes the request's origin.
- Campus reads `data/travel.json`; city centre reads `data/travel-city-centre.json`. Each has distinct origin metadata, provider label, durations, and costs.
- Unknown origin returns 422; no fallback to campus. A selected file whose origin differs from the query returns 502 `INVALID_SOURCE_DATA`.
- The adapter checks `feed.origin_id == preferences.origin_id` before joining venue/destination IDs, and includes origin in travel source status.
- Source status with `id:"travel"` requires `origin_id`; `id:"events"` is origin-independent.
- These are independently shaped mock event/travel feeds, not independent live organisations. A second origin is another travel scenario, not a third source.

## Desktop integration and optional preview

The Electron main process owns HTTP calls and returns `{status, body}` to the renderer through a narrow preload bridge. Preserve the HTTP status and envelope; network errors remain distinguishable from 200/no-match. See `docs/prompts/frontend.md` for the client handoff. An optional explicit fixture preview must visibly identify static campus examples and their represented status. Normal operation always calls the real API. Derive origins/dates from options and use neutral “Return by” wording.
