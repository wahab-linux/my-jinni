# Multiple AI providers: additive contract v0.4

## Google Cloud ADC extension, v0.6 (2026-10-18)

The user additionally requested Google Cloud trial-credit access through ADC in the desktop app. Provider `vertex` is **Google Vertex AI (ADC)**, separate from the Gemini Developer API-key provider `gemini`. Follow [GOOGLE_ADC_SETUP.md](GOOGLE_ADC_SETUP.md) for the local Google sign-in walkthrough. The new `google-auth[requests]` dependency is recorded in the lockfile.

- `/api/v1/sources` advertises the additional provider. Its suggested model is intentionally empty: the user enters a Gemini model ID currently available in their Vertex AI Studio/project/location. Existing provider/model defaults stay unchanged.
- `POST /api/v1/chat` accepts `provider: "vertex"`, an explicit compatible `model`, and `vertex: {project_id, location}`. The settings contain validated identifiers, never URLs, credential paths, uploaded JSON or tokens. Other providers reject the `vertex` object. Vertex rejects both API-key header aliases; existing API-key providers retain their contracts.
- `POST /api/v1/ai/vertex/check` accepts `{project_id, location}` and obtains ADC in the backend. It returns `{data:{configured, project_id, location, message},error,warnings}`. It does not call a model or establish model/project permissions, billing eligibility or quota.
- Backend-only Google ADC obtains and refreshes short-lived OAuth tokens using the Cloud Platform scope and the selected quota project. Native `generateContent` HTTPS requests use the fixed global or validated regional `aiplatform.googleapis.com` host. Tokens never return to the renderer and are not persisted by Jinni. The app neither executes sign-in shell commands nor exposes a credential-file picker.
- Native structured responses pass the existing answer schema and exact selected-quote checks. Evidence/response bounds, the overall generation deadline, explicit context inclusion, actual calculated results, insufficient-evidence behavior and no automatic model/provider fallback are preserved.
- Desktop exposes the additional named operation `checkVertexAdc(settings)`. API-key settings are hidden for Vertex. Only nonsecret project/location preferences may be saved locally; models remain session-only. Google manages the ADC credential file outside the repository. Clearing a Jinni provider API key does not revoke ADC.
- `ADC_AUTH_ERROR` covers missing/expired sign-in or denied project access; HTTP 403 remains distinguishable. Network, quota/capacity, invalid model/location, timeout, refusal and invalid answers use safe error families. Raw credential exceptions and Google response bodies are not exposed.

Model calls can consume trial credits or incur charges; ADC is authentication, not free model entitlement. Google decides trial, region, model, organisation and quota eligibility. The sign-in check makes no generative model request. The optional `scripts.verify_vertex --ask` command explicitly makes one model call. Automated tests do not establish live Google access.

The user requested mainstream provider selection, specifically DeepSeek, on 2026-10-17. Preserve every planner field and the v0.3 library/chat behaviour. Existing requests default to OpenAI. No arbitrary base URL, automatic provider fallback or automatic key sharing is supported.

## Provider catalog

`GET /api/v1/sources` retains `provider: "openai"` and `default_model: "gpt-4.1-mini"` as legacy default metadata. Add `providers`, a list of `{id,label,default_model}`. IDs and initial defaults:

| ID | Label | Default model | Protocol |
| --- | --- | --- | --- |
| `openai` | OpenAI | `gpt-4.1-mini` | Existing Responses adapter, unchanged |
| `deepseek` | DeepSeek | `deepseek-flash` | Chat Completions, JSON object, thinking disabled |
| `gemini` | Google Gemini | `gemini-3.8-flash` | Official OpenAI-compatible Chat Completions, JSON schema |
| `anthropic` | Anthropic Claude | `claude-sonnet-4-6` | Native Messages, output_config.format JSON schema |

These are editable model suggestions, not promises of account access. Provider/model access requires a separate real-key check. No new provider SDK dependency is needed; use the injected httpx client. All endpoints are fixed official HTTPS URLs. JSON mode does not guarantee schema conformance; local schema and exact-citation checks apply to every provider.

## HTTP

- Chat adds optional `provider`, default `openai`. An omitted model resolves to the selected provider's default. Explicit invalid/null provider/model values return 422; do not silently select another provider.
- Chat response adds `provider` identifying the requested provider, including insufficient-evidence responses. `model` remains null when generation was skipped. Existing answer/citation/planner fields are unchanged.
- New canonical credential header: `X-AI-API-Key`. Preserve `X-OpenAI-API-Key` for OpenAI-only legacy callers. Supplying both is 422. A legacy OpenAI header must never authenticate another provider. No key in body, URL, storage, logs or errors.
- No matching evidence still avoids every cloud call. Preserve 30-second generation deadline, bounded inputs/output, no retries, no tools or web search, no silent provider/model switching, safe status codes, and exact selected-chunk/quote validation.
- Sources metadata uses a generic cloud notice; the UI names the selected recipient before sending. OpenAI uses `store: false`; do not imply this option or a blanket retention promise for every provider.

## Desktop bridge (backwards compatible)

- `askQuestion` accepts the additive `provider` field and main attaches only that provider's session key in `X-AI-API-Key`.
- `setSessionApiKey({provider,key})` stores a key for one provider. Legacy string input sets OpenAI only. Returns `{configured:boolean}`; no key is returned.
- `getSessionSettings(provider?)` and `clearSessionApiKey(provider?)` accept an optional provider ID, default OpenAI, and retain `{configured:boolean}` results. Clear affects only that provider. Main clears every provider key when quitting through an internal `clearAllSessionApiKeys()` method.
- The renderer provides a provider selector, editable model and per-provider key setting. Synchronise chat/settings provider selectors; clear the key input and invalidate pending/old answers on provider changes. Keep model choices separate per provider. Saving a key is not a connection test.
- All IPC remains named, sender/input validated and loopback-only. Preserve isolated/sandboxed renderer, no Node integration and source text rendered as text.

## Implementation ownership

- Coordinator: `app/knowledge/provider_catalog.py`, schemas/router, API/OpenAPI/examples, docs and final integration.
- Provider agent: `app/knowledge/providers.py`, minimal shared-validation refactor in `openai_client.py`, `tests/test_providers.py` only.
- Desktop agent: `desktop/`, `tests/desktop/api-client.test.cjs`, `tests/desktop/validation.test.cjs` only.
- Verification agent: new provider API tests, `tests/desktop/mock_backend.py`, `tests/desktop/e2e.cjs` and optional generic live-check script. Do not overwrite the other owners' files.

## Official references checked

- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
- [DeepSeek models](https://api-docs.deepseek.com/quick_start/pricing/), [JSON output](https://api-docs.deepseek.com/guides/json_mode/), [thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/)
- [Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)
- [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

Verification passed on 2026-10-17: 474 Python tests (including 76 new adapter and 50 new provider API checks), 46 JavaScript unit tests, Ruff lint/format across 52 Python files, desktop ESLint and 20 actual Electron end-to-end checks. Provider selection/defaults, four mocked cited answers, key isolation/clear-one/clear-all, legacy header compatibility, rejected quotes, errors/retry and stale answers are covered. Root visually inspected the DeepSeek selection and settings screenshots; no real credentials were used. All cloud transports are mocked; live account/model access remains unverified.

After updating, close the existing desktop window and restart with `start-my-jinni.cmd` to load the new renderer/backend. Separately started backends need their own restart. The app does not kill externally owned services, and restarting clears session keys. Select DeepSeek in AI settings, keep or edit its suggested model, enter the user's own API key, and select local evidence for an actual question.
