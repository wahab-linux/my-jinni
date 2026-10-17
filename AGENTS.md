# AfterClass development instructions

- Keep all tracked repository content in English, including documentation, prompts, comments, UI copy, metadata, and AI usage records.
- Read `docs/PROJECT_PLAN.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/TASKS.md`, and your assigned prompt before editing.
- The user owns backend work; Wahab owns frontend work. Backend changes belong in `app/`, `data/`, `tests/`, and `scripts/`; frontend changes belong in `web/`. Coordinate shared contract, dependency, and documentation changes before editing them.
- Preserve the contract in `docs/openapi.json` and the response examples in `web/fixtures/`. Do not silently rename fields or change money/time units.
- Keep three layers: experience, decision, and data integration. The decision layer must not import FastAPI or frontend code.
- All event and travel fixtures are fictional simulated data. Keep that label visible. Do not represent them as real Glasgow events or fares.
- The product helps people choose activities; students are the first MVP audience. Keep audience, supported origins, demo dates, and source capabilities in scenario configuration, not the reusable decision core.
- Use integer pence and timezone-aware timestamps. Check outbound arrival and return-to-origin feasibility separately. Use `return_at`, not campus-specific response terminology.
- The recommendation endpoint starts as an explicit HTTP 501 stub. Never return a canned fixture as a calculated recommendation.
- Use deterministic ranking. An LLM is not required at runtime.
- Do not add authentication, maps, payment, scraping, a database, or a new frontend framework to this MVP without a team decision.
- Add meaningful tests for budget/time boundaries, ranking, integration of both sources, and failed/invalid sources when implementing the engine.
- Run `uv run ruff check .`, `uv run ruff format --check .`, and `uv run pytest` before handing off changes.
- Keep `docs/AI_USAGE.md` factual. Record AI assistance, actual human decisions/edits, and verification. Never claim human review or a final AI level that has not occurred.
- Do not commit credentials, local virtual environments, temporary PDF renders, or the opening ceremony PDF.
