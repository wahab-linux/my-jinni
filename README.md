# PlanScope

A desktop activity planner that combines activity and return-travel information to recommend a feasible plan and explain the cost and timing. Students are the first MVP audience; the decision core does not require student identity.

DYHTG 2026 BlackRock challenge. Backend: roXy. Desktop interface: Wahab.
Repository: [wahab-linux/my-jinni](https://github.com/wahab-linux/my-jinni). Local checkout: `my-jinni`.

## Current delivery

The Python backend calculates recommendations from two independently shaped simulated HTTP feeds. The product interface is an Electron desktop client using HTML/CSS/JavaScript; Wahab owns that implementation. No desktop window or installer is delivered by the backend command below.

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

Dependencies are locked in `uv.lock`. After initial dependency setup, normal calculations and tests need no Internet, API keys, database or runtime AI service.

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
