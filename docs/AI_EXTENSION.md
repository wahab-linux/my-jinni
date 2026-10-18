# Source-grounded AI extension: additive contract v0.5

Additive v0.7 supports explicitly requested AI option proposals via chat intent `options`; see [AI_OPTIONS.md](AI_OPTIONS.md). The shared responsive workspace places compact conditions/source selection, candidate/comparison results and Ask AI in parallel. Proposals use the selected provider and retrieved evidence, retain checked per-option citations and leave ordinary calculated results unchanged. Full library tools and AI settings remain separately opened. This supersedes older layout descriptions.

The additive Google Cloud ADC provider is defined in [AI_PROVIDERS.md](AI_PROVIDERS.md#google-cloud-adc-extension-v06-2026-10-18). Select **Google Vertex AI (ADC)** on desktop, with an explicit project, location and currently available model. [GOOGLE_ADC_SETUP.md](GOOGLE_ADC_SETUP.md) explains local sign-in and the distinction between a sign-in check and a model request. Other provider-key and citation contracts remain intact.

The general workspace adds optional `decision_request` to chat and `decision` to its result. [GENERAL_DECISIONS.md](GENERAL_DECISIONS.md) defines the request/result. The server calls the actual comparison endpoint, propagates validation/source failures before generation, and returns the exact calculated result. Its ephemeral `decision-context` supplies criteria with units/directions/effective weights, requested limits, winner/alternative measurements and contributions, sampled exclusion reasons, counts, source metadata and limitations. The JSON remains within 12,000 characters by dropping optional whole items and reporting omissions; required units/settings/measures remain available. Selected chunk IDs and exact quotes are checked normally. This context is not saved in SQLite. Scores remain relative preference fit, not forecasts or verified truth.

[OPENAI_DESKTOP_GUIDE.md](OPENAI_DESKTOP_GUIDE.md) explains account setup, current-comparison inclusion, units, sample questions and the optional `uv run python -m scripts.verify_openai --decision` live check. [PRESENTATION_GUIDE.md](PRESENTATION_GUIDE.md) provides copy-ready slide text and speaker notes alongside the editable PowerPoint.

Decision inclusion is explicit in the desktop Ask AI panel, which starts visible as requested on 2026-10-18. Provider/model/credentials and Vertex ADC setup live in a separate settings dialog. Comparison-input changes invalidate pending/previous included-context answers. The existing `preferences`/`planner` path is retained for the detailed activity example; either or both contexts reserve one slot each from the six-chunk retrieval limit. A question with decision context needs no selected library document, but generation still requires the selected provider's key or Vertex ADC. The browser has local original-passage search only, not cloud AI.

Selected notes/files supply matching chunks to AI analysis, not automatically extracted numeric comparison inputs. Importing, selecting or contradicting a price in a document does not rewrite the comparison dataset or change its deterministic scores. Turning source claims into ranked measurements would require a separate extraction, unit/provenance review and explicit confirmation workflow; that feature is not implemented.

The user confirmed this scope on 2026-10-17: **keep activity planning; add a local source library and cited AI questions**. The initial v0.3 used OpenAI; the same day the user requested multiple mainstream providers, specifically DeepSeek. [AI_PROVIDERS.md](AI_PROVIDERS.md) defines the additive v0.4 provider catalog, credentials and adapter protocols. OpenAI remains the default for legacy requests. Every v0.2 planner field and v0.3 library/citation field is preserved. Package version remains 0.1.0. The deterministic planner still needs no key.

## Experience and ownership

One local library is sufficient for this MVP. Wahab owns the Electron source panel, source selection, chat, citation viewer and session-only key/model settings. roXy owns document ingestion, SQLite storage/retrieval, the OpenAI adapter, citation checks, API and tests. Coordinate shared contract files. Do not implement multiple notebooks/accounts/cloud sync, OCR, website crawling or embeddings before the complete flow works.

The renderer calls narrow preload methods; the trusted Electron main process performs local HTTP. Methods include `listSources`, `addTextSource`, `importSource`, `getSource`, `deleteSource`, `askQuestion`, and `setSessionApiKey`. Keep separate provider keys in main-process memory, not localStorage or files. `askQuestion` adds only the selected provider's key in `X-AI-API-Key`; a key is never a JSON field. Legacy `X-OpenAI-API-Key` works only for OpenAI; both key headers together return 422. Source uploads originate in the native picker, not arbitrary renderer paths. Preserve HTTP statuses and the data/error/warnings envelope.

## Endpoints

All paths below are additive and retain `/api/v1`. Existing `/api/v1/options` and `/api/v1/recommendations` are unchanged.

| Method | Path | Request | Successful data |
| --- | --- | --- | --- |
| GET | `/api/v1/sources` | None | `sources` and import/provider/retrieval limits |
| POST | `/api/v1/sources` | JSON `{title, text, is_simulated?}` | Created source metadata; HTTP 201 |
| POST | `/api/v1/sources/upload` | Multipart `file`, optional `title`, optional `is_simulated` | Created source metadata; HTTP 201 |
| GET | `/api/v1/sources/{id}` | None | `{source, chunks}` for original extracted-text viewing |
| DELETE | `/api/v1/sources/{id}` | None | `{source_id, deleted: true}` |
| POST | `/api/v1/chat` | JSON below; key header for actual generation | Answer, checked citations and optional calculated planner result |

```json
{
  "question": "Which plan fits my budget, and what does the venue guide say about access?",
  "source_ids": ["id-returned-by-the-source-api"],
  "provider": "openai",
  "model": "gpt-4.1-mini",
  "preferences": {
    "origin_id": "glasgow-main-campus",
    "budget_pence": 1000,
    "depart_at": "2026-10-20T16:00:00+01:00",
    "return_by": "2026-10-20T19:00:00+01:00",
    "interests": ["games"]
  }
}
```

`question` is nonblank, at most 2000 characters. `source_ids` contains distinct selected source IDs, up to 20. Optional `provider` defaults to `openai`; other IDs are `deepseek`, `gemini` and `anthropic`. An omitted `model` uses that provider's catalog default; an explicit model must support its adapter's structured/JSON protocol and be accessible to the user's account. `preferences` retains the exact existing planner model. At least one source, preferences or `decision_request` is required. Questions do not infer or change form values; calculated contexts are supplied only when explicitly selected.

Successful chat data has:

- `answer`: text for display using textContent or safely rendered Markdown.
- `status`: `answered` or `insufficient_evidence`.
- `provider`: selected provider ID, including when generation is skipped.
- `citations`: objects with `chunk_id`, `source_id`, `source_title`, `page`, `quote`, `is_simulated`.
- `model`: requested model for an actual generation; null when no model call was needed.
- `used_source_ids`: source IDs of evidence actually supplied, not every available source.
- `planner`: the computed RecommendationData object or null. This remains the authoritative cost/time/ranking display.
- `decision`: the actual computed DecisionResult or null, retaining authoritative measurements, ranking and source metadata independently of the AI prose.

The ephemeral `planner-context` source contains the result computed by the existing endpoint for this request. Its citation text is returned in `quote`, its page is null and it is labelled simulated. It is not saved into the user's library. Existing simulated-source warnings remain visible. If calculation fails, propagate its error rather than fabricate a recommendation.

## Local source representation and retrieval

Source metadata: `id`, `title`, `kind` (`text`, `markdown`, `pdf`), `filename` or null, `created_at`, `chunk_count`, `character_count`, `is_simulated`. Detail chunks contain `chunk_id`, `source_id`, `source_title`, `page` (one-based PDF page or null), `index`, `text`, `is_simulated`.

Set optional `is_simulated: true` when importing fictional or AI-generated demo material; it defaults to false for ordinary user-provided sources. This label is preserved in retrieved citations. A false value is not verification that a document is factually correct. The sample `source-create.json` is explicitly fictional; use the source ID returned by the real import, not the placeholder ID in chat examples.

Store extracted text and page-aware chunks in a local SQLite database outside the checkout. Uploaded filenames are metadata, never paths to open. Retain extracted original text for citation viewing; retaining original file bytes is outside this increment. Delete removes the source, chunks and retrieval entries. No API key or chat history is stored in the database.

Support UTF-8 TXT/Markdown and text PDFs, at most 5 MiB, 150,000 extracted characters and 40 PDF pages, with at most 20 sources. Scanned/no-text, encrypted or corrupted PDFs are rejected clearly. No OCR or URL fetch. Search only selected sources with local lexical retrieval; retrieve at most six bounded chunks, reserving one slot for a calculated plan when preferences are present. This is not semantic/vector retrieval and may miss paraphrases or cross-language matches.

## Provider boundary and errors

Use fixed official HTTPS endpoints, bounded input/output and a 30-second generation deadline. OpenAI retains its Responses adapter with `store: false`; DeepSeek uses JSON-object Chat Completions, Gemini its official OpenAI-compatible JSON-schema protocol, and Claude native Messages JSON output. No remote file/vector-store upload, web tools, autonomous actions, retries or silent provider fallback. Only the question and bounded selected evidence leave the device. Name the selected recipient before sending. `store: false` is specific to the OpenAI request and is not a blanket provider retention promise.

The model returns structured answer/citation data. The server verifies that citation IDs belong to this request's retrieved evidence and every quoted span exists verbatim. A supported answer must have valid citations. Invalid output fails rather than presenting invented references. These checks do not prove semantic entailment of every sentence; the human can open evidence and verify it. Materials are untrusted data, not instructions to execute.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 401 | `AI_AUTH_ERROR` | Missing/invalid key or access denied |
| 404 | `NOT_FOUND` | Selected source no longer exists |
| 413 | `SOURCE_TOO_LARGE` | Import exceeds limits |
| 415 | `UNSUPPORTED_SOURCE_TYPE` | Unsupported document type |
| 422 | `VALIDATION_ERROR` / `INVALID_DOCUMENT` / `LIBRARY_LIMIT` | Invalid input/document or source-count cap |
| 422 | `AI_REQUEST_ERROR` | Model/request unsupported by the provider |
| 429 | `AI_RATE_LIMITED` | Provider quota/rate limit; retry later |
| 502 | `INVALID_AI_RESPONSE` / `AI_REFUSED` | Invalid, incomplete, ungrounded or refused output |
| 503 | `AI_UNAVAILABLE` | Provider/network unavailable |
| 504 | `AI_TIMEOUT` | Generation deadline reached |

No matching retrieved evidence is a normal 200 `insufficient_evidence` response without a provider call or fabricated answer. A missing key is only an error if actual generation would occur. Existing planner-only operation remains available without any AI provider.

## Acceptance and desktop handoff

1. Import a short fictional venue guide; list, reopen and delete it, including after backend restart.
2. Ask an answerable question using only that selected source. Open the returned citation and match the original quote/page.
3. Exclude another source and verify it contributes no evidence. Ask an absent question and show insufficient evidence.
4. Pass activity form preferences and selected source IDs; display the actual planner result alongside its cited explanation.
5. Show invalid key, unavailable provider, timeout and retry as errors without stale success or exposed secrets. The planner must still work without a key.
6. Backend tests use injected provider transports. Verify live access for each selected provider separately using the team's own key; do not claim mocks establish account/model access or live answer quality. Switching providers must not share keys or retain stale answers; clearing one provider key must leave other provider keys intact.

Official references checked: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [Responses migration and storage](https://developers.openai.com/api/docs/guides/migrate-to-responses), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
