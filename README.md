# AfterClass

Choose an activity that fits your interests, budget, and journey back.

Combine activity and travel information to help anyone choose a feasible plan. Students choosing after-class activities are the first MVP audience.

DYHTG 2026 · BlackRock challenge · Backend: roXy · Frontend: Wahab

Repository: [wahab-linux/my-jinni](https://github.com/wahab-linux/my-jinni). The checkout directory is `my-jinni`; the product name remains AfterClass.

## Run

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then run from the repository root. The first run prepares Python and the locked dependencies:

```sh
uv run python -m app
```

- Website: <http://127.0.0.1:8000>
- Interactive API: <http://127.0.0.1:8000/docs>
- OpenAPI JSON: <http://127.0.0.1:8000/openapi.json>

The initial scaffold serves the landing page, options, two mock source APIs, and frontend fixtures. The recommendation endpoint deliberately returns **501 NOT_IMPLEMENTED** until the backend task is completed. A running server does not mean the decision engine is finished.

All event names, venues, travel times, fares, and availability are fictional simulated data. The first scenario supports **20 October 2026**, in `Europe/London`; this is scenario configuration, not a core decision-model restriction or live information. It includes campus and city-centre origins to check that the architecture is not tied to student identity.

## Start development

1. Read the [project plan](docs/PROJECT_PLAN.md), [requirements](docs/REQUIREMENTS.md), [architecture](docs/ARCHITECTURE.md), [API contract](docs/API.md), and [task packages](docs/TASKS.md).
2. Backend owner: copy the [backend development prompt](docs/prompts/backend.md) into your AI coding session.
3. Wahab: copy the [frontend development prompt](docs/prompts/frontend.md) into your AI coding session.
4. Use separate Git branches. Coordinate changes to shared schemas or fixtures and integrate the first working flow at the early checkpoints in `docs/TASKS.md`.

```text
app/
  main.py               API routing and application wiring
  schemas.py            Shared request/response models
  errors.py             Consistent error responses
  settings.py           Runtime paths
  scenario.py           Supported origins/dates and application policy
  sources/              Source APIs and future adapters
  decision/             Future pure decision engine
data/                   Simulated event and origin-specific travel datasets
web/                    Wahab's HTML, CSS, JavaScript
  fixtures/             Shared contract examples
tests/                  Backend and contract verification
scripts/                OpenAPI export
docs/
  API.md                API contract
  openapi.json          Committed machine-readable contract
  PROJECT_PLAN.md       Scope, architecture, and task ownership
  REQUIREMENTS.md       Identified requirements and acceptance scenarios
  ARCHITECTURE.md       Reusable activity core and scenario boundaries
  TASKS.md              Small, ordered development packages
  AI_USAGE.md           Development log and submission draft
  prompts/              Copyable development prompts
```

## Check

```sh
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

After an agreed schema change, regenerate and commit the API snapshot:

```sh
uv run python -m scripts.export_openapi
```

Dependencies are locked in `uv.lock`. No database, account, API key, or paid runtime AI service is required for this scaffold. Keep repository files in English.

## Contract v0.2 migration

Activity output now uses `return_at` instead of `back_on_campus_at`. Options expose `origins` and `supported_dates`; use `default_request` for initial values rather than the removed single-origin fields. Read `docs/API.md` before merging frontend work based on v0.1. The core supports general activity decisions; other industries or a universal plugin platform are outside this MVP.

## Remaining work

- Implement source fetching/normalisation and the deterministic decision engine.
- Build the interactive frontend and connect it to the recommendation endpoint.
- Add business-rule unit tests and integration tests covering source failure.
- Complete demo practice, architecture/trade-off notes, and the factual AI usage report.
