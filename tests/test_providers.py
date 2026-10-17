import asyncio
import copy
import inspect
import json

import httpx
import pytest

from app.knowledge.openai_client import MAX_RESPONSE_BYTES, AIServiceError
from app.knowledge.provider_catalog import PROVIDER_DEFAULT_MODELS
from app.knowledge.providers import generate_answer
from app.knowledge.schemas import SourceChunk

NEW_PROVIDERS = ("deepseek", "gemini", "anthropic")
EXPECTED_ENDPOINTS = {
    "deepseek": "https://api.deepseek.com/chat/completions",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    "anthropic": "https://api.anthropic.com/v1/messages",
}
TEST_KEY = "test-selected-provider-placeholder"
PRIVATE_DETAIL = "private-upstream-details"


@pytest.fixture
def chunks():
    return [
        SourceChunk(
            chunk_id="guide:0",
            source_id="guide",
            source_title="Fictional opening hours",
            page=2,
            index=0,
            text="The fictional library opens at 09:30 on Monday.",
            is_simulated=True,
        )
    ]


def draft_answer():
    return {
        "answer": "The fictional library opens at 09:30 on Monday.",
        "supported": True,
        "citations": [{"chunk_id": "guide:0", "quote": "opens at 09:30 on Monday"}],
    }


def wire_response(provider, draft=None):
    text = json.dumps(draft if draft is not None else draft_answer())
    if provider == "openai":
        return {
            "status": "completed",
            "output": [
                {
                    "type": "message",
                    "role": "assistant",
                    "status": "completed",
                    "content": [{"type": "output_text", "text": text}],
                }
            ],
        }
    if provider == "anthropic":
        return {
            "type": "message",
            "role": "assistant",
            "stop_reason": "end_turn",
            "content": [{"type": "text", "text": text}],
        }
    return {
        "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": text}}]
    }


def invoke(chunks, provider="deepseek", *, payload=None, handler=None, calls=None, **overrides):
    calls = calls if calls is not None else []

    async def respond(request):
        calls.append(request)
        if handler is not None:
            response = handler(request)
            return await response if inspect.isawaitable(response) else response
        return httpx.Response(200, json=payload if payload is not None else wire_response(provider))

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(respond),
            trust_env=False,
            auth=httpx.BasicAuth("unrelated-user", "unrelated-secret"),
            headers={
                "Authorization": "Bearer unrelated-default-key",
                "x-api-key": "unrelated-anthropic-key",
                "x-goog-api-key": "unrelated-google-key",
                "X-AI-API-Key": "unrelated-desktop-key",
                "Cookie": "unrelated-session-cookie",
            },
        ) as client:
            settings = {
                "provider": provider,
                "api_key": TEST_KEY,
                "model": PROVIDER_DEFAULT_MODELS.get(provider, "invalid-provider-model"),
                "question": "When does the fictional library open?",
                "chunks": chunks,
                **overrides,
            }
            return await generate_answer(client, **settings)

    return asyncio.run(run()), calls


@pytest.mark.parametrize("provider", NEW_PROVIDERS)
def test_provider_protocol_and_credentials_are_isolated(chunks, provider):
    selected_model = "custom-selected-model"
    answer, calls = invoke(chunks, provider, model=selected_model)
    assert answer.answer == draft_answer()["answer"]
    assert answer.citations[0].quote == "opens at 09:30 on Monday"
    assert len(calls) == 1
    request = calls[0]
    assert str(request.url) == EXPECTED_ENDPOINTS[provider]
    assert request.url.scheme == "https"
    assert request.method == "POST"
    body = json.loads(request.content)
    assert body["model"] == selected_model
    assert body["max_tokens"] == 1800
    assert "tools" not in body
    assert "store" not in body
    assert TEST_KEY not in request.content.decode()
    assert TEST_KEY not in str(request.url)
    assert "unrelated" not in str(request.headers)
    assert "x-ai-api-key" not in request.headers
    assert "x-goog-api-key" not in request.headers
    assert "cookie" not in request.headers
    messages = body["messages"]
    evidence = json.loads(messages[-1]["content"])
    assert evidence["question"] == "When does the fictional library open?"
    assert evidence["sources"] == [chunks[0].model_dump(mode="json")]
    if provider == "anthropic":
        assert request.headers["x-api-key"] == TEST_KEY
        assert request.headers["anthropic-version"] == "2023-06-01"
        assert "authorization" not in request.headers
        schema = body["output_config"]["format"]["schema"]
        assert body["output_config"]["format"]["type"] == "json_schema"
        assert "UNTRUSTED DATA" in body["system"]
    else:
        assert request.headers["authorization"] == f"Bearer {TEST_KEY}"
        assert "x-api-key" not in request.headers
        assert "UNTRUSTED DATA" in messages[0]["content"]
        if provider == "deepseek":
            assert body["thinking"] == {"type": "disabled"}
            assert body["response_format"] == {"type": "json_object"}
            assert "JSON schema" in messages[0]["content"]
            assert '"citations"' in messages[0]["content"]
            return
        assert body["response_format"]["type"] == "json_schema"
        assert body["response_format"]["json_schema"]["strict"] is True
        schema = body["response_format"]["json_schema"]["schema"]
    assert schema["properties"]["citations"]["items"]["properties"]["chunk_id"]["enum"] == [
        chunks[0].chunk_id
    ]
    assert schema["additionalProperties"] is False


def test_openai_keeps_the_existing_responses_protocol(chunks):
    result, calls = invoke(chunks, "openai")
    assert result.supported is True
    assert len(calls) == 1
    assert str(calls[0].url) == "https://api.openai.com/v1/responses"
    body = json.loads(calls[0].content)
    assert body["store"] is False
    assert body["text"]["format"]["type"] == "json_schema"
    assert "messages" not in body


@pytest.mark.parametrize("provider", NEW_PROVIDERS)
@pytest.mark.parametrize(
    "invalid", ["forged_id", "forged_quote", "missing_citations", "extra_field"]
)
def test_json_mode_or_schema_mode_never_bypasses_local_validation(chunks, provider, invalid):
    draft = draft_answer()
    if invalid == "forged_id":
        draft["citations"][0]["chunk_id"] = "unselected-or-unretrieved-chunk"
    elif invalid == "forged_quote":
        draft["citations"][0]["quote"] = "The library opens at midnight."
    elif invalid == "missing_citations":
        draft["citations"] = []
    else:
        draft["execute_action"] = "Untrusted provider instruction"
    with pytest.raises(AIServiceError) as caught:
        invoke(chunks, provider, payload=wire_response(provider, draft))
    assert caught.value.status_code == 502
    assert caught.value.code == "INVALID_AI_RESPONSE"


@pytest.mark.parametrize("provider", NEW_PROVIDERS)
def test_unsupported_answer_is_returned_for_generic_api_handling(chunks, provider):
    draft = {"answer": "Evidence is missing.", "supported": False, "citations": []}
    answer, calls = invoke(chunks, provider, payload=wire_response(provider, draft))
    assert answer.supported is False
    assert answer.citations == []
    assert len(calls) == 1


@pytest.mark.parametrize("provider", NEW_PROVIDERS)
def test_no_evidence_never_calls_any_provider(chunks, provider):
    answer, calls = invoke([], provider)
    assert answer.supported is False
    assert calls == []


@pytest.mark.parametrize("provider", NEW_PROVIDERS)
@pytest.mark.parametrize("stop", ["truncated", "refused", "tool_use"])
def test_refusal_incomplete_or_unrequested_tool_output_is_not_an_answer(chunks, provider, stop):
    payload = wire_response(provider)
    if provider == "anthropic":
        payload["stop_reason"] = {
            "truncated": "max_tokens",
            "refused": "refusal",
            "tool_use": "tool_use",
        }[stop]
    else:
        payload["choices"][0]["finish_reason"] = {
            "truncated": "length",
            "refused": "content_filter",
            "tool_use": "tool_calls",
        }[stop]
    with pytest.raises(AIServiceError) as caught:
        invoke(chunks, provider, payload=payload)
    assert caught.value.status_code == 502
    assert caught.value.code == ("AI_REFUSED" if stop == "refused" else "INVALID_AI_RESPONSE")


@pytest.mark.parametrize("provider", NEW_PROVIDERS)
@pytest.mark.parametrize("invalid", ["invalid_json", "empty", "missing_envelope", "oversized"])
def test_malformed_or_oversized_output_is_rejected(chunks, provider, invalid):
    if invalid == "invalid_json":
        response = httpx.Response(200, content=b"{invalid")
    elif invalid == "empty":
        response = httpx.Response(200, content=b"")
    elif invalid == "missing_envelope":
        response = httpx.Response(200, json={"answer": "Unwrapped answer"})
    else:
        response = httpx.Response(200, content=b" " * (MAX_RESPONSE_BYTES + 1))
    with pytest.raises(AIServiceError) as caught:
        invoke(chunks, provider, handler=lambda request: response)
    assert caught.value.status_code == 502
    assert caught.value.code == "INVALID_AI_RESPONSE"


@pytest.mark.parametrize(
    ("status", "expected_status", "code"),
    [
        (400, 422, "AI_REQUEST_ERROR"),
        (401, 401, "AI_AUTH_ERROR"),
        (403, 401, "AI_AUTH_ERROR"),
        (404, 422, "AI_REQUEST_ERROR"),
        (422, 422, "AI_REQUEST_ERROR"),
        (429, 429, "AI_RATE_LIMITED"),
        (500, 503, "AI_UNAVAILABLE"),
        (503, 503, "AI_UNAVAILABLE"),
    ],
)
def test_upstream_errors_are_safe_and_never_retried(chunks, status, expected_status, code):
    calls = []
    with pytest.raises(AIServiceError) as caught:
        invoke(
            chunks,
            calls=calls,
            handler=lambda request: httpx.Response(status, text=f"{PRIVATE_DETAIL} {TEST_KEY}"),
        )
    assert caught.value.status_code == expected_status
    assert caught.value.code == code
    assert TEST_KEY not in str(caught.value)
    assert PRIVATE_DETAIL not in str(caught.value)
    assert len(calls) == 1


def test_deepseek_insufficient_balance_is_a_safe_quota_error(chunks):
    with pytest.raises(AIServiceError) as caught:
        invoke(chunks, handler=lambda request: httpx.Response(402, text=PRIVATE_DETAIL))
    assert caught.value.status_code == 429
    assert caught.value.code == "AI_RATE_LIMITED"
    assert "balance or quota" in caught.value.message
    assert PRIVATE_DETAIL not in str(caught.value)


@pytest.mark.parametrize("provider", NEW_PROVIDERS)
def test_redirects_never_forward_credentials_or_switch_provider(chunks, provider):
    calls = []
    with pytest.raises(AIServiceError) as caught:
        invoke(
            chunks,
            provider,
            calls=calls,
            handler=lambda request: httpx.Response(
                307, headers={"Location": "https://example.com/collect"}
            ),
        )
    assert caught.value.code == "AI_UNAVAILABLE"
    assert len(calls) == 1
    assert str(calls[0].url) == EXPECTED_ENDPOINTS[provider]


@pytest.mark.parametrize("provider", NEW_PROVIDERS)
def test_generation_deadline_cancels_stalled_transport_without_real_sleep(chunks, provider):
    cancelled = []

    async def stalled(request):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.append(True)

    with pytest.raises(AIServiceError) as caught:
        invoke(chunks, provider, handler=stalled, timeout_seconds=0.001)
    assert caught.value.status_code == 504
    assert caught.value.code == "AI_TIMEOUT"
    assert cancelled == [True]


@pytest.mark.parametrize("failure", [httpx.ReadTimeout, httpx.ConnectError])
def test_transport_errors_never_expose_upstream_context(chunks, failure):
    def handler(request):
        raise failure(f"{PRIVATE_DETAIL} {TEST_KEY}", request=request)

    with pytest.raises(AIServiceError) as caught:
        invoke(chunks, handler=handler)
    assert caught.value.code == ("AI_TIMEOUT" if failure is httpx.ReadTimeout else "AI_UNAVAILABLE")
    assert PRIVATE_DETAIL not in str(caught.value)
    assert TEST_KEY not in str(caught.value)


@pytest.mark.parametrize("provider", ["unknown", "OPENAI", "https://example.com"])
def test_unknown_provider_is_rejected_without_any_cloud_call(chunks, provider):
    calls = []
    with pytest.raises(AIServiceError) as caught:
        invoke(chunks, provider, calls=calls)
    assert caught.value.status_code == 422
    assert caught.value.code == "AI_REQUEST_ERROR"
    assert calls == []


@pytest.mark.parametrize(
    "settings",
    [
        {"api_key": ""},
        {"api_key": "private key with spaces"},
        {"api_key": "private\nheader"},
        {"model": "https://example.com/model"},
        {"question": " "},
        {"question": "q" * 2001},
        {"question": "Invalid\ud800question"},
        {"timeout_seconds": 0},
        {"timeout_seconds": float("inf")},
    ],
)
def test_invalid_input_never_reaches_provider(chunks, settings):
    calls = []
    with pytest.raises(AIServiceError) as caught:
        invoke(chunks, calls=calls, **settings)
    assert caught.value.status_code in {401, 422}
    assert calls == []


@pytest.mark.parametrize(
    "invalid", ["too_many", "duplicate", "oversized_text", "oversized_metadata"]
)
def test_evidence_limits_are_enforced_before_transport(chunks, invalid):
    if invalid == "too_many":
        chunks = [chunks[0].model_copy(update={"chunk_id": f"guide:{index}"}) for index in range(7)]
    elif invalid == "duplicate":
        chunks.append(copy.deepcopy(chunks[0]))
    elif invalid == "oversized_text":
        chunks[0] = chunks[0].model_copy(update={"text": "x" * 12001})
    else:
        chunks[0] = chunks[0].model_copy(update={"source_title": "x" * 33000})
    calls = []
    with pytest.raises(AIServiceError) as caught:
        invoke(chunks, calls=calls)
    assert caught.value.status_code == 422
    assert calls == []
