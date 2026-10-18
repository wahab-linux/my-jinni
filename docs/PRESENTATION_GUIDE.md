# Jinni: what to write in your PowerPoint

The editable deck is [Jinni_Code_Walkthrough.pptx](presentation/Jinni_Code_Walkthrough.pptx). This guide contains the slide text, what to say, and files to explain. Speaker notes are also embedded in the deck.

Aim for 10–12 minutes. Add your name and course/event details on the title slide. Use the slide text as prompts; explain the speaker notes in your own words. Keep screenshots and demo examples visibly labelled fictional. No genuine API key or live OpenAI success is included in this deck.

Edit [slide-content.json](presentation/slide-content.json) to change the source material. Regenerate with `uv run --with python-pptx==1.0.2 python -m scripts.build_presentation`. The optional authoring dependency does not change application requirements.

## Slide 1: Jinni

**Write on the slide**

Compare data. Explain decisions.

- One shared interface
- Deterministic comparisons
- Evidence-based AI explanations

**What to say**

Introduce Jinni as a decision-support prototype. It helps people compare supplied options using their budget, time and priorities, then ask an optional cloud AI to explain the evidence. The built-in examples are fictional. Add your name, teammate names and course or event details before presenting. Do not describe the demo as a live travel or investment service.

**Code to explain**

- `README.md`
- `docs/GENERAL_DECISIONS.md`

## Slide 2: A choice has more than one measure

**Write on the slide**

Travel, student life, greener choices, financial examples and custom decisions.

- Money: What fits my budget? Prices display in £.
- Time: How long will it take? Minutes, hours and days stay distinct.
- Priorities: What matters most? Importance is measured in points.

**What to say**

Explain the user problem before describing the technology. A cheaper journey may take longer, so a single price sort is not always enough. A hard limit rules out an option; an importance setting affects how the remaining options rank. Financial examples use synthetic information and do not provide investment advice.

**Code to explain**

- `app/comparison/catalog.py`
- `web/presentation.mjs`

## Slide 3: The user journey

**Write on the slide**

Comparison works without an API key. AI is an optional desktop tool.

- Choose: Pick a topic and options.
- Adjust: Set limits and importance.
- Compare: Read measures and trade-offs.
- Ask + check: Use OpenAI, then open a citation.

**What to say**

Show the common interface in the desktop app. Explain that typing a value or moving a slider changes the same underlying setting. The app keeps money, time and importance units separate. Ask AI opens a separate dialog; the user explicitly chooses whether to include the current comparison or activity preferences. An answer is not sent automatically just because a comparison was calculated.

**Code to explain**

- `web/decision-app.mjs`
- `web/desktop-ai.mjs`
- `web/ui-context.mjs`

## Slide 4: One interface, two runtimes

**Write on the slide**

web/platform.mjs selects the runtime. The UI is not duplicated.

**Desktop app**

- Shared web/ interface in Electron
- Restricted preload → main-process IPC
- Local FastAPI calculations + SQLite
- OpenAI or Google Vertex AI through the backend

**GitHub Pages**

- The same page, styles and controls
- JavaScript calculates from exported data
- IndexedDB stores local notes
- Original-text search; no cloud AI server


**What to say**

An API is a defined way for one part of the app to request work from another. Electron runs the same page as the website, but its platform adapter calls named bridge methods. The trusted main process calls the local Python service. GitHub Pages is static, so its comparisons run in JavaScript. This presentation focuses on the desktop OpenAI path the user selected.

**Code to explain**

- `web/platform.mjs`
- `desktop/preload.cjs`
- `desktop/main.cjs`
- `desktop/assets.cjs`

## Slide 5: Where the code lives

**Write on the slide**

| Code | Responsibility |
| --- | --- |
| web/decision-app.mjs | Controls, validation and comparison results |
| web/desktop-ai.mjs | AI dialog, provider choice and explicit context |
| desktop/main.cjs + preload.cjs | Trusted window, named IPC and key operations |
| app/comparison/ | Scenario data, source adapters and pure ranking |
| app/knowledge/ | Document search, AI requests and citation checks |
| tests/ + scripts/ | Regression checks, parity and optional live verification |


**What to say**

Walk through these files in the same order as a request. Keep the explanation at responsibility level first. The renderer presents information; the main process owns trusted desktop operations; the backend coordinates data and calculations. The pure comparison engine does not import FastAPI or frontend code. A pure function calculates from its inputs without calling the network or changing external state.

**Code to explain**

- `docs/ARCHITECTURE.md`
- `docs/DESKTOP_BRIDGE.md`

## Slide 6: From two sources to a comparison

**Write on the slide**

Missing values never become zero. A failed required source returns an error.

- Fetch: Option catalog + separate measurements
- Validate: IDs, types, units and source metadata
- Filter: Availability, required values and limits
- Rank: Score only the feasible options

**What to say**

The option feed says what the choices are; the measurement feed provides values such as cost, time and emissions. The adapters fetch the two differently shaped fictional feeds concurrently with bounded deadlines. The engine joins options and observations by ID. Unknown availability, missing active measurements or failed limits exclude a choice. In this prototype the mock feeds are routes in the same backend, not independent live organisations.

**Code to explain**

- `app/comparison/adapters.py`
- `app/comparison/router.py`
- `app/comparison/engine.py`
- `data/decisions/`

## Slide 7: How ranking works

**Write on the slide**

A score is relative preference fit, not a probability or forecast.

`score = 100 × Σ(weight × normalised value) / Σ(weight)`

- Apply hard limits first.
- Normalise each active measure over feasible options.
- Reverse the scale when a lower value is better.
- Rank by score; use the option ID to break ties.

**What to say**

For a lower-is-better measure, use (maximum minus value) divided by (maximum minus minimum). For a higher-is-better measure, use (value minus minimum) divided by the range. A constant measure receives 1 because every feasible choice is equal on it. A weight of zero removes that measure from scoring, but a separate limit can still apply. Scores and contribution points round to six decimal places. Importance weights do not have to sum to 100.

**Code to explain**

- `app/comparison/engine.py`
- `web/decisions.mjs`
- `tests/test_comparison_engine.py`

## Slide 8: Worked example: travel

**Write on the slide**

At £7.99 with the 180-minute limit, no choice fits. At £8.00, the coach fits.

| Fictional option | Price | Travel time | Carbon | Relative fit |
| --- | --- | --- | --- | --- |
| Train | £18.00 | 70 minutes | 2.2 kg CO₂e | 55 / 100 |
| Coach | £8.00 | 120 minutes | 5 kg CO₂e | 45 / 100 |

- Limits: spend up to £25 and travel for at most 180 minutes.
- Importance: price 45, time 35, carbon 20.
- Change to price-only importance with an £8 limit: coach wins.

**What to say**

These numbers come from the actual comparison endpoint using the configured travel fixtures. Train receives 35 points for time and 20 for emissions, giving 55; coach receives 45 for cost. Flight and taxi exceed the default budget and cycling exceeds the time limit. Changing the settings changes the calculation; this is not a canned response. The presentation builder checks this example against the Python application before creating the deck.

**Code to explain**

- `data/decisions/travel-options.json`
- `data/decisions/travel-metrics.json`
- `app/comparison/catalog.py`

## Slide 9: How AI supports the decision

**Write on the slide**

Python ranks the options. The AI explains supplied results and evidence.

- Calculate: Run the actual comparison again.
- Assemble: Add explicit settings and selected evidence.
- Explain: The selected provider returns structured text.
- Check: Validate citations; return the actual result.

**What to say**

Tick Include my current comparison before asking. The backend calls the same comparison endpoint used by the normal workflow and inserts its result into temporary decision-context evidence. OpenAI receives the question and bounded evidence through the Responses API. The request uses a strict JSON schema, store false and a 30-second deadline. The final response includes the authoritative calculated decision separately from the AI prose. No API key or chat history is written to the source library. Google Vertex AI uses the same evidence and quote checks, with backend-only ADC and native generateContent instead of an API key.

**Code to explain**

- `web/desktop-ai.mjs`
- `app/knowledge/router.py`
- `app/knowledge/openai_client.py`

## Slide 10: Give AI the meaning of the numbers

**Write on the slide**

Selected document passages can provide additional evidence. Exact quotes remain original.

**Supplied context**

- Criteria: label, unit, direction and effective weight
- The exact limits the user selected
- Winner, up to two alternatives and contributions
- Sample exclusions, source metadata and limitations

**Interpretation rules**

- 800 pence means £8.00
- 120 minutes stays a time measurement
- Importance points are not money or percentages
- Omitted details are flagged, never invented


**What to say**

This is the main OpenAI improvement in this change. A number such as 800 is ambiguous without a unit. The updated context includes criteria definitions and chosen weights and limits, so the explanation can discuss trade-offs and exclusion reasons. Large contexts drop optional details as whole structured items and report omissions; they do not cut JSON in the middle. Selected documents use bounded lexical retrieval. This is comparison analysis and evidence explanation, not arbitrary spreadsheet execution, forecasting or a whole-document statistical audit.

**Code to explain**

- `app/knowledge/router.py: decision_evidence`
- `app/knowledge/openai_client.py: INSTRUCTIONS`
- `tests/test_decision_chat.py`

## Slide 11: Connect OpenAI in the desktop app

**Write on the slide**

- Launch the app and open Ask AI.
- Choose OpenAI; expand AI session settings.
- Enter your API key and select Use for this session.
- Keep a compatible accessible model, such as gpt-4.1-mini.
- Tick Include my current comparison, ask a question, then open its citation.

Try: “Why did this option rank first? Explain the price, time and trade-offs.”

**What to say**

After initial uv sync and npm ci, run npm run desktop or the Windows launcher. API access, model availability and quota must be enabled for the user's OpenAI account; a ChatGPT subscription does not itself prove API access. Saving a key only stores it for the session; access is checked on the first actual question. The notice names OpenAI as the recipient of the question and selected evidence. Never put a genuine key on a slide, in source code, in Git or in chat.

**Code to explain**

- `web/desktop-ai.mjs`
- `desktop/api-client.cjs`
- `docs/OPENAI_DESKTOP_GUIDE.md`

## Slide 12: Google Cloud sign-in: ADC

**Write on the slide**

- ADC means the Google sign-in stored on your computer.
- Sign in using gcloud auth application-default login.
- Choose Google Vertex AI (ADC) in Ask AI.
- Enter your Project ID, location and an available Gemini model ID.
- Check Google sign-in, then explicitly ask with your comparison included.

Sign-in checking makes no model request. Asking can consume credits or incur charges.

**What to say**

ADC is Application Default Credentials. The Google Cloud CLI creates it locally; the user does not upload a JSON file or paste an API key into Jinni. The Python backend discovers and refreshes short-lived OAuth tokens for the selected Google Cloud project. The renderer sees only project metadata and safe status. A successful sign-in check does not prove project permissions, model availability, billing eligibility or quota. Select a model actually available in Vertex AI Studio. Google decides whether trial credits apply. Never put credential files or tokens into slides, Git or chat.

**Code to explain**

- `docs/GOOGLE_ADC_SETUP.md`
- `app/knowledge/vertex.py`
- `web/desktop-ai.mjs`
- `scripts/verify_vertex.py`

## Slide 13: Reliability, privacy and honest limits

**Write on the slide**

Source documents are untrusted data. The AI has no tools or authority to change the ranking.

- Credentials: API keys stay in session memory. Google ADC stays with the local Cloud sign-in.
- Evidence: Every accepted quote must match selected evidence. Quote checks do not prove every claim.
- Failures: Missing evidence, invalid keys, quota limits and timeouts have explicit outcomes.

**What to say**

The renderer has no Node access and uses a narrow preload bridge. The main process attaches a key only to the selected provider's chat request. The backend validates structured output and exact quotation membership. Instructions inside documents are treated as data, but this and quotation checks are safeguards rather than proof of truth. No matching source passages avoids a provider call. Ordinary comparisons remain available without any AI provider. Text/PDF import is bounded, with no OCR, web scraping or automatic provider fallback. ADC uses local Google-managed credentials and backend-only access tokens; the app does not store or return them.

**Code to explain**

- `desktop/preload.cjs`
- `desktop/validation.cjs`
- `app/knowledge/openai_client.py`
- `app/knowledge/storage.py`

## Slide 14: What the checks establish

**Write on the slide**

A mocked API test does not establish live account access or answer quality.

**Automated verification**

- Budget and time boundaries; missing-data handling
- All five topics and custom criteria
- Python/JavaScript response parity
- Mocked key/ADC providers, citations and safe errors

**Separate live acceptance**

- Check Google ADC, then explicitly test an available model
- Confirm the actual model responds
- Check the cited answer in the desktop window
- Review answer quality on your own selected data


**What to say**

Describe which checks used actual calculations and which used injected cloud responses. The new tests inspect the exact data sent to OpenAI, including units, changed priorities, limits and bounded custom context. A conservative live checker also checks that an example answer says £8.00 and 120 minutes and includes a valid citation. No genuine OpenAI key was configured during this work, so live access remains unverified. Update this slide only after recording a real run; do not claim human review or live success just because automated tests pass. ADC tests inject Google credential discovery/refresh and HTTP. Separate Chromium checks exercise the actual shared native-tools form with a fake bridge; they are not Electron window or live Google tests. No genuine Google credentials or live model call were used.

**Code to explain**

- `tests/test_decision_chat.py`
- `tests/test_openai_client.py`
- `tests/test_verify_openai.py`
- `scripts/verify_openai.py`

## Slide 15: Demo it, explain it, check it

**Write on the slide**

- Compare the travel defaults: train, £18.00 and 70 minutes.
- Choose price-only importance and an £8 / 180-minute limit: coach.
- Ask the selected provider to explain the result; inspect the returned quote.
- Reduce the budget to £7.99: show no match.
- Explain one code path from the UI to the engine and back.

ADC check: uv run python -m scripts.verify_vertex --project YOUR_PROJECT_ID

**What to say**

The demo should show a changing calculated result, not just a polished screen. Start keyless, then add optional OpenAI explanation with explicit context. If the provider fails, show the real error and continue using the comparison. Do not improvise a fake AI success. End by explaining one important design choice: exact pence protects money boundaries; pure ranking makes results reproducible; citations let users inspect evidence. Future live-data adapters and hosted browser AI are possible extensions, not current completed features. The ADC check obtains a Google token without making a model request. The separate --ask command requires a model and can consume credits.

**Code to explain**

- `docs/GOOGLE_ADC_SETUP.md`
- `docs/OPENAI_DESKTOP_GUIDE.md`
- `scripts/verify_openai.py`
- `docs/AI_USAGE.md`

## Questions you should be ready to answer

- **Why use Python and an AI model?** Python applies repeatable constraints and scoring; OpenAI explains the computed result using selected evidence.
- **What does a score of 100 mean?** Best fit under the supplied option set and settings. It is not a 100% chance of success, and a single feasible option can score 100.
- **Why integer pence?** £7.99 and £8.00 remain exact budget boundaries.
- **Are citations a truth guarantee?** They establish that the quote exists in the supplied evidence. They do not prove every sentence follows from that evidence.
- **Does the website use OpenAI?** The GitHub Pages edition uses local calculations and text search. The desktop edition has the provider-backed AI tools.
- **Can it analyse any spreadsheet?** Current imports are bounded text/Markdown/text PDFs. Custom structured comparisons use the declared criteria/data schema; there is no CSV, Excel, OCR, forecasting or arbitrary-code analysis engine.

See [OPENAI_DESKTOP_GUIDE.md](OPENAI_DESKTOP_GUIDE.md) for setup, prompts, the demo checklist and the optional live verification command. For Google Cloud sign-in, see [GOOGLE_ADC_SETUP.md](GOOGLE_ADC_SETUP.md).
