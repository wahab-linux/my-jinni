# GitHub Pages browser edition

On 2026-10-17 the user requested an additional browser application hosted on GitHub Pages. This explicitly extends the earlier desktop-only delivery decision. The Electron application and Python API remain available with their existing contracts.

The user subsequently requested a general decision workspace with all five challenge scenario areas, compact context tools, animation and optional sound. Contract v0.5 is defined in [GENERAL_DECISIONS.md](GENERAL_DECISIONS.md). Decision comparison is now the main view; the local library/passage search opens on demand and the detailed activity itinerary remains a closed optional example. Existing themes, local sources, PDF extraction and planner behaviour are preserved.

## What users can do

- Compare five configured scenario areas: fictional market context, travel, student opportunities, sustainable choices and your own decision. Adjust criterion weights and optional hard minimum/maximum limits; inspect the highest preference fit, all feasible options, actual measures, score contributions, exclusions and two-source provenance. Presets use simulated data and make no live-price, routing, forecast, suitability or independently verified impact claims.
- Use an optional expanded JSON editor in the own-idea scenario to replace criteria and both source datasets. Limits are 50 options, 10 criteria, 20 constraints, weights from 0 to 100 and finite numbers with magnitude at most 1e12; money uses nonnegative integer pence internally. Money constraints are entered as exact pounds in the interface. Custom source names and simulation flags are supplied metadata, not verification.
- Open **Detailed activity itinerary** for the preserved fictional Glasgow example. Calculate one activity and up to two alternatives using origin, supported date, departure/return times, interests and a GBP budget. No account, key or local server is required.
- Save pasted text, UTF-8 TXT/Markdown and text PDFs in this browser's IndexedDB. The limits are 20 sources, 5 MiB per file, 150,000 extracted characters and 40 PDF pages. Password-protected, scanned/textless, corrupt and oversized PDFs fail without a partial import.
- Select sources and find up to six exact matching passages with keyword search. Open the original extracted text, including PDF page numbers and fictional-content labels, or download extracted text before clearing browser storage.

This is a static browser workspace. It does not call the desktop's loopback API, require GitHub login, send documents/searches to a server, or collect provider keys. It serves assets from the same site; PDF.js and its worker, fonts, character maps and WASM files are included in the deployment. No CDN is needed at runtime. Initial loading and file assets still require access to the site; offline installation is not provided.

Cloud AI generation is not available on this site: GitHub Pages cannot host the existing Python provider service. Search results are labelled original excerpts, never represented as AI answers. Use the desktop edition for provider-backed questions. Arbitrary cities/dates, live events/fares, OCR and cloud sync remain outside scope.

The library is local to this browser profile and site origin, separate from desktop SQLite. Clearing site data, private browsing policies, storage quotas or browser eviction can remove it. Download important sources. Selections reset on reload; saved sources persist. Storage failure leaves decision comparison and the activity planner usable and displays an error for library actions. No source selection or question is inferred from decision inputs. **Library & search** opens a modal tool panel; Escape or **Close tools** closes it and returns focus. Keyword results remain original excerpts, not cloud AI answers.

## Appearance and accessible controls

The redesigned browser workspace uses light and dark palettes, clearer cards, friendly empty/no-match states and compact expandable explanations. The **Dark mode** toggle in the header works with a keyboard and exposes its state to screen readers. It follows the device's preferred appearance until the visitor selects a mode, then remembers that selection in `localStorage` under `my-jinni-theme`. Changes sync to other open tabs. Theme switching still works without persistence if browser storage is restricted; theme initialisation runs before the stylesheet to avoid showing the wrong saved palette first.

Scenario buttons and a native scenario dropdown select the main decision context. Each measure has a labelled weight slider/number input and an optional minimum or maximum limit. Zero weight removes a measure from scoring; a hard limit still requires its measurement. Changes clear prior comparison cards, and no feasible option is distinct from a data/validation error. Score tables scroll within their panel on narrow screens. Explanations, score contributions, exclusions and the own-idea JSON editor expand on demand.

The optional itinerary keeps native origin/date/budget selects and the multi-interest dropdown. Library sorting, exact-pound custom budgets, keyboard dropdown navigation, Escape and focus return are preserved. Both the library and itinerary start closed to keep the decision workspace compact.

Labels, visible focus rings, contrast-aware controls, 44px primary interaction targets, reduced-motion support and mobile-sized form text make the interface easier to operate. Browser tests check common text at WCAG AA's 4.5:1 contrast threshold in both modes, keyboard dropdown/theme operation, saved/device/cross-tab themes, blocked storage, and layouts at 320, 390, 768 and 1280px. These automated checks are not a claim of a complete accessibility audit or human usability review.

Result cards have a short entrance animation and scenario buttons have subtle hover feedback. `prefers-reduced-motion` disables animation/transitions. The visible **Sound effects** toggle starts off; an optional preference is stored under `my-jinni-sound`. After an explicit user gesture, Web Audio can synthesise a brief, quiet feedback tone without external media. No sound plays on page load, including when an earlier preference was enabled. Unsupported/blocked audio never interrupts calculations. Automated checks establish requested synthesis and volume settings, not human audibility.

## Architecture and parity

`web/index.html`, `web/styles.css` and `web/decision-app.mjs` provide the primary scenario/priority/comparison view, collapsed tools and result/error states. `web/app.mjs` preserves the optional activity planner, source selection, browser import and original-text viewing. Dynamic content is inserted as text, never executable HTML. The Content Security Policy restricts scripts, document extraction and network connections to local site assets. The browser uses no new UI framework. `web/effects.mjs` isolates optional failure-tolerant sound synthesis from calculations.

`web/decisions.mjs` exports pure `evaluateDecision(request, entry)`, returning the full `{data,error,warnings}` envelope over `{scenario,dataset}`. It first excludes unknown/unavailable options, missing required measurements and hard-limit violations. Positive-weight criteria are min/max-normalised over feasible options only; constant criteria score 1. Weighted scores and contribution points round to six decimals; equal scores tie-break by option ID. Raw measures and unrounded normalisation are retained. Relative scores express only the supplied preference model, not probabilities or truth. The same core accepts configured domains without requiring student identity.

`web/planner.mjs` is a pure JavaScript decision layer: budget, outbound-arrival and return-deadline constraints all accept equality; ranking is interest match, total cost, total travel time, then event ID. Integer pence and aware timestamps preserve the Python contract. London date/time conversion is independent of the visitor's timezone. Missing/unavailable travel excludes an event and remains visible in warnings. Changes to form inputs clear the prior result.

`scripts/build_pages.py` calls the actual backend decision-detail routes, which fetch both fictional HTTP feed shapes through bounded source adapters. It exports validated `{scenarios:[{scenario,dataset}]}` to `decisions.json`. The legacy activity export still obtains API options and real feed adapters for each origin into `scenario.json`. Neither export contains precomputed successful rankings. Every browser request calculates a fresh result locally; failed/unvalidated data loading has a visible retry state and no automatic fallback. Future rule changes must preserve Python/browser parity before deployment.

`web/library.mjs` separates persistence and selected-source lexical retrieval from UI. Browser PDF.js extraction is bounded and local. Exact text/page provenance helps users inspect a result, but neither keyword matching nor a simulation flag proves source truth. User text is treated only as data.

## Build and test

Prerequisites are Node 22.12+ (Node 24 recommended), npm, Python 3.12 and uv. Install with `uv sync --locked` and `npm ci` in the repository root, then:

```sh
npm run build:pages
npm run lint:web
npm run test:web
uv run pytest tests/test_pages.py tests/test_decision_pages.py
npx playwright install chromium
npm run test:web:e2e
```

`dist/pages/` is the complete artifact, including local PDF.js assets and its Apache 2.0 license. Do not commit `dist/` or `node_modules/`. Build scripts only recreate `dist/pages`, not application source or the OpenAPI contract. To inspect it manually, serve that directory using any static HTTP server; ES modules/PDF workers require HTTP rather than opening a `file:` URL.

The browser tests serve the exact build under `/my-jinni/`, mirroring the project Pages path. They use a browser timezone in America/Los_Angeles to check London-time independence. If Chromium is already installed locally, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable; CI installs the version supplied by Playwright. These are headless browser checks with no Python runtime server, cloud provider, or provider-response mocks.

The activity parity test preserves 226 actual Python application calculations across both origins, boundaries and seeded inputs. Additional generic comparison parity covers all five presets, custom data, changed weights/limits, ties, missing/unknown values and empty results using complete envelopes. Node tests cover the generic scoring/data boundaries, stable ranking, custom domains, safe criterion IDs, optional effects and all earlier planner/retrieval checks. Browser E2E covers primary comparisons, collapsed tools, custom validation, no-match/errors, stale results, source import/search/view/download/delete/reload, PDF failure modes, safe text, storage failure, deployment paths, themes and mobile layouts. Screenshot artifacts, including `workspace-light.png` and `workspace-dark.png`, are ignored under `tmp/web/`. These are local checks, not proof of hosted deployment or live provider access.

The current local browser run passed 31 Node tests, web ESLint and 30 real Chromium end-to-end checks. Light/dark workspace screenshots were inspected. Sound checks used an instrumented Web Audio implementation to prove explicit opt-in and synthesis requests; they do not establish human audibility. No API keys, runtime Python service or cloud-response mocks were used in browser checks.

## Publish

1. Push or merge the change to `main` on `wahab-linux/my-jinni`.
2. In the repository's **Settings → Pages**, choose **GitHub Actions** as the build source. GitHub Pages must be available for the repository's visibility/account plan.
3. Open **Actions → Test and deploy browser app**. The workflow runs Python, desktop-unit and browser checks, builds `dist/pages/`, then deploys the artifact to the `github-pages` environment. Pull requests run checks without deploying. After enabling Pages, rerun the workflow if the first deployment failed before activation.
4. Follow the successful deployment's URL, normally **https://wahab-linux.github.io/my-jinni/**. Calculate all five scenario presets, change priorities/limits and inspect exclusions. Open the library to import/search a fictional guide. Expand the optional activity itinerary for GBP 10 → Board Game Night / GBP 5, GBP 4 → Acoustic Hour, GBP 0 → no match and the city-centre case. Check themes and opt-in sound. Confirm the URL actually serves the deployed application before announcing it as live.

Workflow permissions are limited to repository read in the build job and Pages/ID-token write in the deployment job. No API keys or repository secrets are required. GitHub's environment protection settings may require the repository owner's deployment approval. A local commit, local test result or successful push does not prove a hosted deployment succeeded.
