# Jinni judges guide

**Team 39:** Theo directs backend work; Wahab directs the frontend and Electron desktop interface.

Jinni combines separately shaped sources, applies a person's hard limits and priorities, and explains feasible choices. Our example user is Maya, choosing a journey within GBP 25 and 180 minutes. The same comparison core supports market learning, student opportunities, sustainability and custom criteria.

## What to demonstrate

1. Start `start-my-jinni.cmd`. Choose **Getting around**, set a GBP 25 spending limit and a 180-minute travel limit, then compare. The fictional train and coach fit; flight and taxi exceed the budget, and cycling exceeds the time limit.
2. Change the priorities and compare again. Prices, travel times and carbon measurements remain visible; priorities change the ranking of feasible options.
3. Import one [demo pack](../demo-library/README.md), mark its three sources fictional/AI-generated, and select only those sources. Ask a supplied question or choose **Suggest options**, then open a source quotation. Source-based proposals are separate from the calculated ranking.

## Implemented and verified

- **Two sources:** an option catalog and a differently shaped measurements feed. The backend joins them by option ID. Both are labelled simulated; no live transport, market or environmental provider is connected.
- **API first:** [OpenAPI](openapi.json), consistent `{data,error,warnings}` envelopes and [request/response examples](../contracts/fixtures/). The comparison endpoint is `POST /api/v1/decisions/evaluate`.
- **Three layers:** shared experience in `web/` and `desktop/`; pure comparison logic in `app/comparison/engine.py`; data adapters in `app/comparison/`. Money uses integer pence.
- **Local library:** TXT, Markdown and text-PDF ingestion, SQLite storage on desktop, selected-source retrieval and original quote viewing. Browser storage uses IndexedDB.
- **AI:** desktop questions and two or three option proposals with checked source IDs and exact quotations. Two real DeepSeek `deepseek-flash` requests passed answer and option checks. Other provider protocols were tested with mocked responses.
- **Credentials:** four provider keys are encrypted on the device through Electron safeStorage, restored after restart and deleted on request. Windows uses DPAPI. No plaintext fallback, credential in SQLite or key in renderer storage is permitted.
- **Checks:** 677 Python tests, 93 desktop unit tests, 44 browser unit tests and 36 actual Electron checks passed, alongside lint/format and the static build. Electron verified real encrypted save and restart restoration; its provider responses were mocked.

## Scope and failure behaviour

Preset data and the demo packs are fictional. Scores express relative preference fit, not probabilities or forecasts. Notes do not automatically become numeric measurements or alter deterministic scores. Quote checks validate membership in the selected passages, not every generated claim. Invalid inputs, failed sources and invalid AI output produce visible errors. Deterministic comparison works without AI or an API key. No OCR, web scraping, cloud sync or packaged Windows installer is delivered.

## Development AI disclosure

We used **GPT-6.1 Sol through Codex**. At least one team member used paid access. AI wrote most implementation, tests and presentation material. We supplied requirements and reviewed code without regular manual edits to the generated output. The reported event category is **Level 5 — Vibe coded**. The [AI report PDF](AI_USAGE_SUBMISSION.pdf) contains the formal statement.

Use the current pitch linked in [the presentation guide](presentation/Jinni_Pitch_Guide.md). Earlier PowerPoint versions are historical snapshots.
