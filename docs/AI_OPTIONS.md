# AI option proposals: additive contract v0.7

On 2026-10-18 the user requested AI-generated choices from a goal, conditions and selected notes/files, plus three parallel workspace panels. The desktop uses the existing selected provider and session credentials (or Vertex ADC). The browser remains a local comparison/library edition without cloud AI.

## User flow

1. In **Conditions & sources**, choose a scenario, enter a goal, set compact priorities/limits and select local notes/files. Full import/edit/search tools stay available through the library dialog.
2. Review the recipient notice and choose **Suggest options**. This explicitly supplies the current comparison request and selected source IDs to the selected provider through the local API.
3. The middle panel shows two or three AI proposals above the ordinary calculated comparison, with a short rationale, trade-offs, missing information and exact source quotations. The proposal section stays hidden until requested, and errors remain visible. Successful generation brings the new options into view when focus remains with the Generate action; it does not interrupt typing elsewhere. Insufficient evidence and provider errors do not create substitute choices.
4. Use the parallel **Ask AI** panel for a separate question. Provider/model/credentials remain in an independent settings dialog. Changing goal, conditions, source selection, provider or model clears stale proposals; changing only display language preserves them without a generation request.

Suggestions are evidence-grounded model output, not newly verified facts, a live search or a guarantee of feasibility. The model is instructed to preserve the supplied calculation and acknowledge missing measurements/conflicts. Exact quote validation checks source membership; it does not establish semantic truth. A document's contents are never executable instructions.

## Additive request

`POST /api/v1/chat` retains all existing fields, envelopes and credential headers. Add optional `intent: "answer" | "options"`, default `answer`. Existing questions, source selection, provider/model defaults, calculation inclusion and Vertex metadata behave as before. For `options`, `question` holds the user's goal (up to 2,000 characters).

```json
{
  "intent": "options",
  "question": "Suggest a few affordable journey choices and explain the trade-offs.",
  "provider": "deepseek",
  "model": "deepseek-flash",
  "source_ids": [],
  "decision_request": {"scenario_id": "travel"}
}
```

Credentials are never JSON fields. Main attaches only the selected API-key provider's key in `X-AI-API-Key`. Vertex continues to use backend ADC and rejects API-key headers. No new endpoint, generic IPC operation, discovery call, SDK or cloud storage is added.

## Additive result

`ChatData` adds `options`, default `[]` for ordinary answers and insufficient evidence. Every successful option has:

| Field | Type and limit |
| --- | --- |
| `id` | Safe lowercase slug, 1–60 characters; unique within the response |
| `title` | Nonblank text, up to 200 characters |
| `summary` | Nonblank text, up to 1,200 characters |
| `trade_offs` | Up to three nonblank strings, each up to 400 characters |
| `missing_information` | Up to three nonblank strings, each up to 400 characters |
| `citations` | One to four existing full `Citation` objects |

For supported proposals, `status` is `answered` and there are two or three options. Otherwise `status` is `insufficient_evidence` and `options` is empty. The top-level `answer` supplies a concise overview; top-level `citations` deduplicate proposal references for existing viewers. Each draft reference must use a selected retrieved chunk ID and a verbatim quote. The API attaches trusted source title/page/simulation metadata. Malformed, duplicate, oversized or forged proposals fail with the existing safe AI error envelope.

`decision` and `planner`, when requested, still contain the exact ordinary endpoint's computed results. AI proposal text never rewrites their metrics, scores, feasibility or order. Automatically extracting confirmed numeric measurements and applying them to a custom comparison remains a separate, unimplemented workflow.

## Evidence and failure handling

The application reuses selected-source lexical retrieval and bounded ephemeral calculated context. No matching evidence avoids cloud generation and key requirements. Comparison validation and source failures propagate before generation. All five existing provider adapters retain fixed endpoints, bounded input/output, overall deadlines, structured/JSON output and no automatic retry/model/provider fallback. There is no web search, browsing, source-requested action or silent inference of form values.

OpenAI uses the Responses structured-output protocol and `store: false`; this is not a general provider retention guarantee. DeepSeek, Gemini, Claude and Vertex retain their existing protocols and credential boundaries. Source labels and quote verification do not verify the content's factual correctness.

Automated verification must distinguish mocked provider/schema/citation behavior from live account/model access and answer quality. See [AI_USAGE.md](AI_USAGE.md) for observed results; no live success is implied by this contract. Static examples are labelled examples, never fallback answers.

Run the focused actual Electron proposal visibility/focus check with `node tests/desktop/options-ui.cjs` after normal dependency setup. It uses temporary sources/settings and a mocked provider, then closes only its owned processes.
