# OpenAI analysis in the Jinni desktop app

To ask for choices, enter a **Decision goal** in the left conditions/source panel, select notes/files and set priorities/limits. Choose **Suggest options** after reviewing the named provider notice. The middle panel displays citation-bearing AI suggestions separately from calculated scores; the parallel **Ask AI** panel accepts a further independent question. This explicit action sends the goal, current comparison and selected retrieved snippets. Missing evidence and provider failures do not create fallback choices. See [AI_OPTIONS.md](AI_OPTIONS.md).

Jinni calculates comparisons in Python and can ask OpenAI to explain the calculated data and selected documents. Choose **Desktop app** for this workflow. The GitHub Pages edition has local comparisons and text search; it does not host the Python AI service.

## Connect your account

1. From the repository root, run `uv sync --locked` and `npm ci` once. Start with `npm run desktop`, or use `start-my-jinni.cmd` on Windows after setup.
2. Choose a topic, set importance and limits, and calculate a comparison.
3. Open **AI settings** from the header or the visible Ask AI panel and select **OpenAI**.
4. Enter your own OpenAI API key and choose **Use for this session**. The field clears after saving. Saving a key is not a connection test.
5. Keep the default `gpt-4.1-mini`, choose a suggested model, or select **Custom model** and enter a compatible Responses/structured-output model your API account can access. API access, billing and quota are separate from having a ChatGPT subscription.
6. Close settings. In **Ask AI**, tick **Include my current comparison**. Optionally select relevant notes/files in the library. Review the notice naming OpenAI as the recipient of your question and selected evidence.
7. Ask a question. Open a returned citation and compare the quote and calculated result with the answer.

The app keeps each provider key in the Electron main process's session memory. It sends only the selected provider's key in a request header. It does not save keys in SQLite, the frontend's local storage, the presentation or Git. Restarting clears session keys. Do not paste a genuine key into chat, slides or source code.

## Useful questions

- “Why did this option rank first? Explain its price, travel time and important trade-offs.”
- “Compare the recommended option with the alternatives using my chosen priorities. Show money in £.”
- “Which supplied choices were excluded, and which of my limits caused that?”
- “What does my selected guide say about access? Cite the exact passage.”
- “What information is missing before I rely on this comparison?”

Comparison questions need **Include my current comparison**. Document questions need selected, relevant notes/files. The separate **Include my current activity preferences** checkbox calculates the optional detailed itinerary. Questions do not automatically change form values or infer a budget from prose.

Selected matching document passages inform AI analysis with original citations. They do not automatically fill comparison metrics or change its deterministic ranking. Enter or review structured custom data separately when a document contains measurements you want to compare.

## What OpenAI receives

The backend recalculates the current comparison through the actual `/api/v1/decisions/evaluate` route. It supplies temporary `decision-context` evidence with:

- Criterion labels, units, preferred direction and actual effective weights, including explicit zeroes.
- The exact requested limits and their criterion IDs; criteria provide the units.
- The calculated winner, up to two alternatives and their score contributions when they fit the evidence budget.
- A sample of exclusion reasons, total counts, source metadata, simulation labels and domain limitations.
- Explicit omission markers when details are left out to keep valid JSON within 12,000 characters.

Up to six evidence chunks are supplied in total. Calculated comparison/activity contexts each reserve a slot; selected-source lexical retrieval fills the remaining slots. The full calculated decision is returned separately and remains authoritative. Source context is temporary, not a saved note. The OpenAI request uses the fixed Responses endpoint, a strict answer/citation schema, `store: false`, bounded output and a 30-second generation deadline. `store: false` is not a general promise about all provider retention policies.

Money marked `pence` means integer GBP pence: `800` is **£8.00**. Minutes, hours, days, carbon measurements and custom units keep their meanings. Importance weights are relative points, not currency, time or percentages. The instructions tell OpenAI to explain the supplied calculation, avoid changing the ranking, distinguish fictional data and acknowledge omitted information.

This is configured option comparison and evidence explanation. It is not unrestricted spreadsheet/statistical execution, live financial advice or live routing. Current source imports are UTF-8 text/Markdown and text PDFs, not CSV/Excel; scanned PDFs need OCR that is not implemented. Custom structured options use the comparison schema. Lexical retrieval may miss paraphrases and does not guarantee that the model sees an entire document or every option.

## Run the optional live check locally

From an interactive terminal in the repository root:

```sh
uv run python -m scripts.verify_openai --decision
```

The script asks for a hidden API key, unless `OPENAI_API_KEY` is already configured in your local environment. Do not put the key in a command argument. A model override is available:

```sh
uv run python -m scripts.verify_openai --decision --model gpt-4.1-mini
```

This makes one provider request and may incur your account's normal API charge. It uses a temporary empty library, the real fictional travel feeds, the actual comparison endpoint and the actual chat route. It checks that the returned decision matches the ordinary calculated result, that a decision citation passes exact-quote validation, and that the example explanation identifies the coach at **£8.00 / 120 minutes**. It prints a safe outcome rather than the key or raw response. It does not modify your saved sources or run your desktop session.

Exit code `0` means the example passed; `1` means the request or conservative fact checks failed; `2` means no usable key/hidden input was supplied. The older command without `--decision` checks a simple fictional opening-hours passage. Neither command proves accuracy for every question or verifies the window interaction.

No genuine OpenAI key was configured in the cloud environment during this change. Automated provider tests inject fake responses. Live account/model access remains unverified until you run the command or a real desktop question successfully.

## A short demonstration

| Step | Settings/action | Expected calculated result |
| --- | --- | --- |
| 1 | Getting around defaults: £25, maximum 180 minutes; importance price 45 / time 35 / carbon 20 | Fictional train, £18.00, 70 minutes, 55 relative points |
| 2 | Importance: price 100, time 0, carbon 0; keep the 180-minute limit; budget £8.00 | Fictional coach, £8.00, 120 minutes |
| 3 | Ask OpenAI with current comparison included | An evidence-based explanation; inspect the citation and returned calculation |
| 4 | Change the budget to £7.99 and compare again | No match; coach exceeds the budget and cycling exceeds the time limit |
| 5 | Ask about the no-match result with current comparison included | The model has the actual exclusions and cannot legitimately invent an eligible choice |

Use the exact controls in your installed version. Zero importance disables a factor's score contribution; it does not disable a separate hard limit. Relative scores are neither confidence percentages nor predicted returns.

## If a request fails

| Outcome | What to check |
| --- | --- |
| No selected context | Tick current comparison/activity preferences or select relevant sources. |
| Insufficient evidence | Select evidence containing the answer or ask a question covered by the supplied comparison. |
| `AI_AUTH_ERROR` | Verify the selected OpenAI account's key and model permissions; saving a key alone does not test them. |
| `AI_REQUEST_ERROR` | Check the model name and Responses/structured-output compatibility. |
| `AI_RATE_LIMITED` | Check account quota, billing and rate limits before trying again. |
| `INVALID_AI_RESPONSE` | The response failed structure or quotation checks; do not present it as a valid cited answer. |
| `AI_UNAVAILABLE` / `AI_TIMEOUT` | Check provider/network availability and retry later. |
| `SOURCE_UNAVAILABLE` / invalid comparison input | Fix or reload the comparison first. Generation cannot replace a failed calculation. |

A quote check establishes that the quoted text exists in the supplied evidence. It does not prove every claim in an answer is true or supported in meaning. Review important claims and the original data. Ordinary comparison and library functions remain usable without OpenAI.

## Presentation and code references

- [PowerPoint deck](presentation/Jinni_Code_Walkthrough.pptx)
- [What to write and say on each slide](PRESENTATION_GUIDE.md)
- Shared native tool: `web/desktop-ai.mjs`; context readers: `web/ui-context.mjs`.
- Provider key/HTTP boundary: `desktop/api-client.cjs`, `desktop/preload.cjs`, `desktop/main.cjs`.
- Actual comparison: `app/comparison/engine.py`, `app/comparison/router.py`.
- Evidence and citation orchestration: `app/knowledge/router.py`.
- OpenAI protocol and instructions: `app/knowledge/openai_client.py`.
- Relevant checks: `tests/test_decision_chat.py`, `tests/test_openai_client.py`, `tests/test_verify_openai.py`.

Official API references: [Responses](https://platform.openai.com/docs/api-reference/responses), [Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) and [API billing](https://help.openai.com/en/articles/9039756-billing-settings-in-chatgpt-vs-platform). Model access and current pricing depend on your API account.
