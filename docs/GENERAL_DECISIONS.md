# General decisions: additive contract v0.5

The 2026-10-18 extension adds a parallel conditions/sources, choices and Ask AI layout and explicitly requested source-grounded AI proposals. [AI_OPTIONS.md](AI_OPTIONS.md) defines additive chat intent `options`; no general-engine or metric schema changes occur. AI cards are distinct from the calculated comparison. Compact source selection shares the existing library state; full tools and settings open separately. Earlier collapsed-question/layout descriptions are superseded.

On 2026-10-17 the user requested a general decision backend covering the challenge's market, travel, student-hub, sustainability and own-idea scenarios. They also requested decision-first presentation, compact/collapsible library and question tools, animation and sound. The challenge image gives potential problem areas, not a requirement to connect every real service or proof of bonus rules.

Preserve all v0.2-v0.4 planner/library/provider contracts and the latest browser edition, themes, accessible controls and local storage. Add a small reusable deterministic comparison core; keep domain assumptions in configured scenarios. Source-run Electron remains available. The browser performs the same calculation locally over exported validated data; it has no cloud AI/key entry.

## Frozen HTTP and bridge

All HTTP results retain `{data,error,warnings}`.

- `GET /api/v1/decision-scenarios`: data `{scenarios:[Scenario]}`.
- `GET /api/v1/decision-scenarios/{id}`: data `{scenario:Scenario,dataset:Dataset}` from the actual two HTTP source adapters.
- `POST /api/v1/decisions/evaluate`: body `DecisionRequest`; data `DecisionResult` below.
- Two separately shaped fictional HTTP feeds per preset: `/mock/decisions/{id}/options` and `/mock/decisions/{id}/metrics`. GET details and POST evaluation fetch both via bounded asynchronous HTTP adapters. Missing/bad source returns 503/502 with no automatic fixture fallback. Custom input errors return 422.
- Electron adds `getDecisionScenarios()`, `getDecisionScenario(id)` and `evaluateDecision(request)` through the existing named bridge, main-only HTTP and validated IPC. Existing operations are unchanged.
- The browser build exports `decisions.json` with `{scenarios:[{scenario,dataset}]}` through actual backend detail calls; no precomputed successful rankings. Existing `scenario.json` and its legacy planner stay intact.

## Shared JSON definitions

IDs use lowercase ASCII slugs (letters/digits/hyphens), max 100 characters. All numeric input is finite, excludes booleans, and has magnitude <= 1e12. Limit inputs to 50 options, 10 criteria, 20 constraints and weights 0..100. Money is integer pence wherever the unit is `pence`. JSON values do not carry an API key or arbitrary URL.

`Scenario`:

```json
{
  "id":"travel",
  "title":"Travel planner",
  "description":"Compare fictional ways to make one journey.",
  "notice":"Simulated options, costs, durations and emissions; not live routing.",
  "criteria":[{"id":"cost-pence","label":"Total cost","unit":"pence","direction":"minimize","default_weight":50}],
  "default_request":{"scenario_id":"travel","weights":{},"constraints":[]}
}
```

`Dataset`:

```json
{
  "option_source":{"id":"demo-options","label":"Fictional option catalog","is_simulated":true,"updated_at":"2026-10-17T10:00:00+01:00"},
  "metric_source":{"id":"demo-measurements","label":"Fictional measurement feed","is_simulated":true,"updated_at":"2026-10-17T10:00:00+01:00"},
  "options":[{"id":"sample-option","name":"Sample option","description":"Fictional example.","category":"bus"}],
  "observations":[{"option_id":"sample-option","available":true,"metrics":{"cost-pence":500}}]
}
```

The two source IDs must differ. Options, observations and criteria must have unique IDs. Unknown observation IDs or malformed feeds are invalid; a missing observation/value/availability excludes the affected option rather than assuming zero or availability. Metric values may be null to represent unknown. User-provided source names/flags are not independently verified.

`DecisionRequest`:

```json
{
  "scenario_id":"travel",
  "weights":{"cost-pence":50},
  "constraints":[{"criterion_id":"cost-pence","operator":"lte","value":1500}]
}
```

Omitted weight IDs use criterion defaults. Explicit zero disables that criterion for scoring; require at least one positive weight. Constraint equality passes for `lte` and `gte`. Unknown criterion IDs are 422. For `scenario_id: "custom"` only, optional `custom` is `{title,criteria,dataset}` using the same definitions; this supports new domains without changing the core. A custom preset also works without an override. Reject custom overrides on other scenario IDs.

`DecisionResult`:

```json
{
  "scenario_id":"travel",
  "title":"Travel planner",
  "method":"weighted_min_max",
  "summary":"Compared fictional options using the selected constraints and weights.",
  "recommended":null,
  "ranked":[],
  "excluded":[],
  "criteria":[],
  "sources":[],
  "evaluated_count":0,
  "is_simulated":true,
  "limitations":[]
}
```

Each ranked option has `{id,name,description,category,score,metrics,contributions,reasons,source_ids}`. Contributions are `{criterion_id,label,unit,value,weight,normalised,points}`. Each excluded option is `{id,name,reasons}`. Sources use the dataset provenance shape. A valid empty result is 200 with null recommendation; no hidden fallback.

## Scoring and scenario coverage

First require known true availability, all active-criterion/constraint metrics and all hard constraints. Normalize each positive-weight criterion over feasible options only: maximize `(value-min)/(max-min)`; minimize `(max-value)/(max-min)`. Constant criteria score 1. Weight by the positive-weight sum, multiply by 100, and round score/contribution points to six decimals. Rank score descending, then ID ascending; ties are reproducible. Scores are relative preference-fit calculations, not probabilities, truth checks or financial forecasts. Show actual measures, trade-offs, constraint exclusions and source provenance.

- `market`: fictional shares/ETF/digital-asset examples and illustrative fee, volatility/liquidity/macro-context measures. Informational synthetic comparison only, no live prices, predicted returns or buy/sell/suitability claims.
- `travel`: train, bus, flight, taxi and cycling examples, compared on cost, duration and emissions.
- `student`: courses, societies, events and internships, compared on cost, time commitment and fit.
- `sustainability`: cost, environmental-impact estimates and availability/wait examples.
- `custom`: editable own-idea criteria/options/measurements; default cost/time/quality example. JSON import may be an optional expanded editor, never the main product flow.

The existing precise activity itinerary remains an optional detailed example, not the application's general identity.

## Presentation and optional effects

Make scenario choice, meaningful constraints/weights and option comparison the main visible workspace. Library and questions start collapsed in side drawers/dialogs; keep import/citation/provider/privacy features available on demand. Preserve light/dark themes on the browser. Desktop may adopt the same palette, but no framework replacement is needed.

Use short transitions, result entrance and feedback animations. Respect `prefers-reduced-motion`. Provide a visible sound toggle, default off, optional preference persistence, no autoplay or external assets. Synthesise brief low-volume sounds with Web Audio only after user interaction; failure must never break decisions. An audio test can prove event synthesis was requested, not human audibility. Keep source/AI content as safe text and credentials out of persistence.

## Ownership and verification

- Backend agent: `app/comparison/`, `data/decisions/`, new Python comparison tests and preset fixtures. Do not edit existing app/main.py or AI router/schemas; coordinator wires them.
- Desktop agent: `desktop/renderer/`, desktop README, existing/new desktop E2E and helpers as needed. Do not edit main/preload/API client/validation; coordinator owns these bridge changes.
- Browser agent: `web/`, browser tests and browser docs. Do not edit scripts/build_pages.py, root manifests or Python tests; coordinator exports decisions.json and owns parity tests/build changes.
- Coordinator: bridge wiring, FastAPI wiring, shared docs/OpenAPI, static build/export, browser/Python parity and final review/tests/integration.

Require meaningful generic-engine boundary/ranking/unknown-data tests, both-source influence/failure checks, all five scenario calculations, custom-domain checks, browser/Python parity, real desktop/browser UI decisions/drawer/effect checks and legacy regressions. No new live provider call or hosted deployment is established by local tests.

Current backend verification: Ruff lint/format and all 566 Python tests pass. This includes 77 focused general engine/API/source tests, actual calculated example-contract equality, decision-context/citation/failure tests and 140 complete general browser/Python parity cases. The 226 prior activity parity requests are preserved. Desktop has 50 passing Node unit tests; browser has 31. Actual UI check counts and review boundaries are maintained in `docs/AI_USAGE.md`; a test request for synthesized tones does not establish human audibility.
