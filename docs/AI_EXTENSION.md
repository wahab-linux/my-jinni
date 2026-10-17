# Source-grounded AI extension: contract v0.3

The user confirmed this scope on 2026-10-17: **keep activity planning; add a local source library and cited AI questions; use OpenAI**. These additions preserve every v0.2 activity request/response field. They do not replace the deterministic planner or make it require a key. Package version remains 0.1.0; v0.3 is the additive contract revision.

## Experience and ownership

One local library is sufficient for this MVP. Wahab owns the Electron source panel, source selection, chat, citation viewer and session-only key/model settings. roXy owns document ingestion, SQLite storage/retrieval, the OpenAI adapter, citation checks, API and tests. Coordinate shared contract files. Do not implement multiple notebooks/accounts/cloud sync, OCR, website crawling or embeddings before the complete flow works.

The renderer calls narrow preload methods; the trusted Electron main process performs local HTTP. Add methods such as `listSources`, `addTextSource`, `importSource`, `getSource`, `deleteSource`, `askQuestion`, and `setSessionApiKey`. Keep the key in main-process memory after entry, not localStorage or a file. `askQuestion` adds `X-OpenAI-API-Key` to the local HTTP request; the key is not a JSON request field. Source uploads must originate in the native file picker, not an arbitrary renderer-supplied filesystem path. Preserve HTTP status plus the existing data/error/warnings envelope across IPC.

## Endpoints

All paths below are additive and retain `/api/v1`. Existing `/api/v1/options` and `/api/v1/recommendations` are unchanged.

| Method | Path | Request | Successful data |
| --- | --- | --- | --- |
| GET | `/api/v1/sources` | None | `sources` and import/provider/retrieval limits |
| POST | `/api/v1/sources` | JSON `{title, text}` | Created source metadata; HTTP 201 |
| POST | `/api/v1/sources/upload` | Multipart `file`, optional `title` | Created source metadata; HTTP 201 |
| GET | `/api/v1/sources/{id}` | None | `{source, chunks}` for original extracted-text viewing |
| DELETE | `/api/v1/sources/{id}` | None | `{source_id, deleted: true}` |
| POST | `/api/v1/chat` | JSON below; key header for actual generation | Answer, checked citations and optional calculated planner result |

```json
{
  "question": "Which plan fits my budget, and what does the venue guide say about access?",
  "source_ids": ["id-returned-by-the-source-api"],
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

`question` is nonblank, at most 2000 characters. `source_ids` contains distinct selected source IDs, up to 20. `model` defaults to `gpt-4.1-mini` and may be changed to a model supporting Responses and Structured Outputs that the user's API account can access. `preferences` is optional and uses the exact existing model. At least one source or preferences must be provided. Questions do not automatically update or extract activity form values; the client passes its current form explicitly when the user wants a calculated plan.

Successful chat data has:

- `answer`: text for display using textContent or safely rendered Markdown.
- `status`: `answered` or `insufficient_evidence`.
- `citations`: objects with `chunk_id`, `source_id`, `source_title`, `page`, `quote`, `is_simulated`.
- `model`: requested model for an actual generation; null when no model call was needed.
- `used_source_ids`: source IDs of evidence actually supplied, not every available source.
- `planner`: the computed RecommendationData object or null. This remains the authoritative cost/time/ranking display.

The ephemeral `planner-context` source contains the result computed by the existing endpoint for this request. Its citation text is returned in `quote`, its page is null and it is labelled simulated. It is not saved into the user's library. Existing simulated-source warnings remain visible. If calculation fails, propagate its error rather than fabricate a recommendation.

## Local source representation and retrieval

Source metadata: `id`, `title`, `kind` (`text`, `markdown`, `pdf`), `filename` or null, `created_at`, `chunk_count`, `character_count`, `is_simulated`. Detail chunks contain `chunk_id`, `source_id`, `source_title`, `page` (one-based PDF page or null), `index`, `text`, `is_simulated`.

Store extracted text and page-aware chunks in a local SQLite database outside the checkout. Uploaded filenames are metadata, never paths to open. Retain extracted original text for citation viewing; retaining original file bytes is outside this increment. Delete removes the source, chunks and retrieval entries. No API key or chat history is stored in the database.

Support UTF-8 TXT/Markdown and text PDFs, at most 5 MiB, 150,000 extracted characters and 40 PDF pages, with at most 20 sources. Scanned/no-text, encrypted or corrupted PDFs are rejected clearly. No OCR or URL fetch. Search only selected sources with local lexical retrieval; retrieve at most six bounded chunks, reserving one slot for a calculated plan when preferences are present. This is not semantic/vector retrieval and may miss paraphrases or cross-language matches.

## OpenAI boundary and errors

Use the fixed Responses endpoint with `store: false`, a bounded output and a 30-second request deadline. No remote file/vector-store upload, web tools or autonomous actions. Only the question and bounded selected evidence leave the device. Disclose this before the first AI request. `store: false` concerns Responses object storage; it is not a blanket promise about provider retention policies.

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

No matching retrieved evidence is a normal 200 `insufficient_evidence` response without a provider call or fabricated answer. A missing key is only an error if actual generation would occur. Existing planner-only operation remains available without OpenAI.

## Acceptance and desktop handoff

1. Import a short fictional venue guide; list, reopen and delete it, including after backend restart.
2. Ask an answerable question using only that selected source. Open the returned citation and match the original quote/page.
3. Exclude another source and verify it contributes no evidence. Ask an absent question and show insufficient evidence.
4. Pass activity form preferences and selected source IDs; display the actual planner result alongside its cited explanation.
5. Show invalid key, unavailable provider, timeout and retry as errors without stale success or exposed secrets. The planner must still work without a key.
6. Backend tests use injected provider transports. Live OpenAI success must be verified in the app using the team's own key and recorded separately; do not claim mocks establish real account access, model quality or desktop usability.

Official references checked: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [Responses migration and storage](https://developers.openai.com/api/docs/guides/migrate-to-responses), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
