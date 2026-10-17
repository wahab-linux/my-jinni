# GitHub Pages browser edition

On 2026-10-17 the user requested an additional browser application hosted on GitHub Pages. This explicitly extends the earlier desktop-only delivery decision. The Electron application and Python API remain available with their existing contracts.

## What users can do

- Calculate one feasible activity and up to two alternatives from the configured fictional Glasgow event/travel datasets. Choose either origin, supported demo date, departure/return times, interests and a GBP budget. No account, key or local server is required.
- Save pasted text, UTF-8 TXT/Markdown and text PDFs in this browser's IndexedDB. The limits are 20 sources, 5 MiB per file, 150,000 extracted characters and 40 PDF pages. Password-protected, scanned/textless, corrupt and oversized PDFs fail without a partial import.
- Select sources and find up to six exact matching passages with keyword search. Open the original extracted text, including PDF page numbers and fictional-content labels, or download extracted text before clearing browser storage.

This is a static browser workspace. It does not call the desktop's loopback API, require GitHub login, send documents/searches to a server, or collect provider keys. It serves assets from the same site; PDF.js and its worker, fonts, character maps and WASM files are included in the deployment. No CDN is needed at runtime. Initial loading and file assets still require access to the site; offline installation is not provided.

Cloud AI generation is not available on this site: GitHub Pages cannot host the existing Python provider service. Search results are labelled original excerpts, never represented as AI answers. Use the desktop edition for provider-backed questions. Arbitrary cities/dates, live events/fares, OCR and cloud sync remain outside scope.

The library is local to this browser profile and site origin, separate from desktop SQLite. Clearing site data, private browsing policies, storage quotas or browser eviction can remove it. Download important sources. Selections reset on reload; saved sources persist. Storage failure leaves the planner usable and displays an error for library actions. No source selection or question is inferred from planner inputs.

## Architecture and parity

`web/index.html`, `web/styles.css` and `web/app.mjs` provide accessible responsive controls, result/error states, source selection and original-text viewing. Dynamic content is inserted as text, never executable HTML. The Content Security Policy restricts scripts, document extraction and network connections to local site assets. The browser version uses no new UI framework.

`web/planner.mjs` is a pure JavaScript decision layer: budget, outbound-arrival and return-deadline constraints all accept equality; ranking is interest match, total cost, total travel time, then event ID. Integer pence and aware timestamps preserve the Python contract. London date/time conversion is independent of the visitor's timezone. Missing/unavailable travel excludes an event and remains visible in warnings. Changes to form inputs clear the prior result.

`scripts/build_pages.py` obtains options from the existing API and calls its real feed adapters for each configured origin. It exports validated normalised activities, journeys, provenance and warnings to generated `scenario.json`. It never exports precomputed recommendations or a canned success fixture. The browser joins these records and calculates a fresh result for each request. Future backend rule changes must keep the parity tests passing before deployment.

`web/library.mjs` separates persistence and selected-source lexical retrieval from UI. Browser PDF.js extraction is bounded and local. Exact text/page provenance helps users inspect a result, but neither keyword matching nor a simulation flag proves source truth. User text is treated only as data.

## Build and test

Prerequisites are Node 22.12+ (Node 24 recommended), npm, Python 3.12 and uv. Install with `uv sync --locked` and `npm ci` in the repository root, then:

```sh
npm run build:pages
npm run lint:web
npm run test:web
uv run pytest tests/test_pages.py
npx playwright install chromium
npm run test:web:e2e
```

`dist/pages/` is the complete artifact, including local PDF.js assets and its Apache 2.0 license. Do not commit `dist/` or `node_modules/`. Build scripts only recreate `dist/pages`, not application source or the OpenAPI contract. To inspect it manually, serve that directory using any static HTTP server; ES modules/PDF workers require HTTP rather than opening a `file:` URL.

The browser tests serve the exact build under `/my-jinni/`, mirroring the project Pages path. They use a browser timezone in America/Los_Angeles to check London-time independence. If Chromium is already installed locally, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable; CI installs the version supplied by Playwright. These are headless browser checks with no Python runtime server, cloud provider, or provider-response mocks.

The Python parity test compares complete browser result envelopes with 226 actual Python application calculations: both origins, money/time boundaries and seeded budget/time/interest combinations. Node tests cover ranking, missing journeys, unsupported input, currency/time conversion and selected-source retrieval. Browser E2E covers planning/no match/errors, stale results, source import/search/view/download/delete/reload, PDF failure modes, safe text rendering, storage failure, deployment-path loading/retry and mobile/desktop layout. Screenshot artifacts are ignored under `tmp/web/`.

## Publish

1. Push or merge the change to `main` on `wahab-linux/my-jinni`.
2. In the repository's **Settings → Pages**, choose **GitHub Actions** as the build source. GitHub Pages must be available for the repository's visibility/account plan.
3. Open **Actions → Test and deploy browser app**. The workflow runs Python, desktop-unit and browser checks, builds `dist/pages/`, then deploys the artifact to the `github-pages` environment. Pull requests run checks without deploying. After enabling Pages, rerun the workflow if the first deployment failed before activation.
4. Follow the successful deployment's URL, normally **https://wahab-linux.github.io/my-jinni/**. Try GBP 10 → Board Game Night / GBP 5, GBP 4 → Acoustic Hour, GBP 0 → no match; switch to city centre; import the fictional guide and search “beginner”. Confirm the URL actually serves the deployed application before announcing it as live.

Workflow permissions are limited to repository read in the build job and Pages/ID-token write in the deployment job. No API keys or repository secrets are required. GitHub's environment protection settings may require the repository owner's deployment approval. A local commit, local test result or successful push does not prove a hosted deployment succeeded.
