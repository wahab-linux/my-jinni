import json
from contextlib import ExitStack

import httpx
import pytest
from fastapi.testclient import TestClient

from app.knowledge.router import get_ai_client, get_store
from app.knowledge.storage import KnowledgeStore
from app.main import create_app

DEFAULT_MODELS = {
    "openai": "gpt-4.1-mini",
    "deepseek": "deepseek-flash",
    "gemini": "gemini-3.8-flash",
    "anthropic": "claude-sonnet-4-6",
}
HOST_PROVIDERS = {
    "api.openai.com": "openai",
    "api.deepseek.com": "deepseek",
    "generativelanguage.googleapis.com": "gemini",
    "api.anthropic.com": "anthropic",
}
KEY = "provider-test-placeholder-not-a-real-secret"
TEXT = "The fictional launch starts at 18:30. Admission to the launch is free."


def evidence_chunks(value):
    if isinstance(value, dict):
        if "chunk_id" in value and "text" in value:
            yield value
        else:
            for child in value.values():
                yield from evidence_chunks(child)
    elif isinstance(value, list):
        for child in value:
            yield from evidence_chunks(child)
    elif isinstance(value, str):
        try:
            decoded = json.loads(value)
        except ValueError:
            return
        if isinstance(decoded, (dict, list)):
            yield from evidence_chunks(decoded)


def provider_response(provider, draft):
    content = json.dumps(draft)
    if provider == "openai":
        return httpx.Response(
            200,
            json={
                "status": "completed",
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "content": [{"type": "output_text", "text": content}],
                    }
                ],
            },
        )
    if provider == "anthropic":
        return httpx.Response(
            200,
            json={
                "type": "message",
                "role": "assistant",
                "stop_reason": "end_turn",
                "content": [{"type": "text", "text": content}],
            },
        )
    return httpx.Response(
        200,
        json={
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {"role": "assistant", "content": content},
                }
            ]
        },
    )


@pytest.fixture
def clients(tmp_path):
    with ExitStack() as stack:

        def make(handler=None):
            app = create_app()
            store = KnowledgeStore(tmp_path / "provider-library.sqlite3")
            calls = []

            def transport(request):
                calls.append(request)
                if handler is None:
                    raise AssertionError("No provider call was expected")
                return handler(request)

            async def client_override():
                async with httpx.AsyncClient(
                    transport=httpx.MockTransport(transport), trust_env=False
                ) as client:
                    yield client

            app.dependency_overrides[get_store] = lambda: store
            app.dependency_overrides[get_ai_client] = client_override
            client = stack.enter_context(TestClient(app, raise_server_exceptions=False))
            return client, calls

        yield make


def source(client, title="Selected launch guide", text=TEXT):
    response = client.post(
        "/api/v1/sources", json={"title": title, "text": text, "is_simulated": True}
    )
    assert response.status_code == 201
    return response.json()["data"]


def ask(client, selected, *, provider="openai", question="When does the launch start?", **extra):
    headers = extra.pop("headers", {"X-AI-API-Key": KEY})
    body = {"question": question, "source_ids": [selected], "provider": provider} | extra
    return client.post("/api/v1/chat", json=body, headers=headers)


def assert_error(response, status, code):
    assert response.status_code == status, response.text
    assert response.json()["data"] is None
    assert response.json()["error"]["code"] == code
    assert KEY not in response.text
    assert "private-provider-detail" not in response.text


def test_catalog_preserves_legacy_defaults_and_advertises_all_providers(clients):
    client, calls = clients()
    metadata = client.get("/api/v1/sources").json()["data"]
    assert metadata["provider"] == "openai"
    assert metadata["default_model"] == DEFAULT_MODELS["openai"]
    assert {item["id"]: item["default_model"] for item in metadata["providers"]} == {
        **DEFAULT_MODELS,
        "vertex": "",
    }
    assert calls == []


@pytest.mark.parametrize("provider", DEFAULT_MODELS)
def test_provider_dispatch_defaults_and_selected_evidence_are_preserved(clients, provider):
    def handler(request):
        assert HOST_PROVIDERS[request.url.host] == provider
        assert request.url.scheme == "https"
        assert not request.url.query
        payload = json.loads(request.content)
        assert payload["model"] == DEFAULT_MODELS[provider]
        chunks = list(evidence_chunks(payload))
        assert chunks
        assert {chunk["source_id"] for chunk in chunks} == {selected["id"]}
        assert "EXCLUDED-SECRET" not in request.content.decode()
        assert KEY not in request.content.decode()
        if provider == "anthropic":
            assert request.headers["x-api-key"] == KEY
            assert "authorization" not in request.headers
        else:
            assert request.headers["authorization"] == f"Bearer {KEY}"
            assert "x-api-key" not in request.headers
        return provider_response(
            provider,
            {
                "answer": "The fictional launch starts at 18:30.",
                "supported": True,
                "citations": [{"chunk_id": chunks[0]["chunk_id"], "quote": TEXT}],
            },
        )

    client, calls = clients(handler)
    selected = source(client)
    source(client, "Excluded launch guide", "The launch code is EXCLUDED-SECRET.")
    response = ask(client, selected["id"], provider=provider)
    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert result["provider"] == provider
    assert result["model"] == DEFAULT_MODELS[provider]
    assert result["status"] == "answered"
    assert result["used_source_ids"] == [selected["id"]]
    assert result["citations"][0]["quote"] == TEXT
    assert result["citations"][0]["is_simulated"] is True
    assert len(calls) == 1


@pytest.mark.parametrize("provider", DEFAULT_MODELS)
def test_no_evidence_skips_every_provider_and_requires_no_key(clients, provider):
    client, calls = clients()
    selected = source(client)
    response = ask(
        client, selected["id"], provider=provider, question="Axolotl hyperdrive", headers={}
    )
    assert response.status_code == 200, response.text
    result = response.json()["data"]
    assert result["provider"] == provider
    assert result["status"] == "insufficient_evidence"
    assert result["model"] is None
    assert result["citations"] == []
    assert calls == []


@pytest.mark.parametrize("provider", DEFAULT_MODELS)
def test_evidence_without_a_key_fails_before_provider_dispatch(clients, provider):
    client, calls = clients()
    selected = source(client)
    assert_error(ask(client, selected["id"], provider=provider, headers={}), 401, "AI_AUTH_ERROR")
    assert calls == []


@pytest.mark.parametrize("provider", ["deepseek", "gemini", "anthropic"])
def test_legacy_openai_header_never_authenticates_another_provider(clients, provider):
    client, calls = clients()
    selected = source(client)
    response = ask(client, selected["id"], provider=provider, headers={"X-OpenAI-API-Key": KEY})
    assert_error(response, 401, "AI_AUTH_ERROR")
    assert calls == []


def test_omitted_provider_and_legacy_header_remain_openai_compatible(clients):
    def handler(request):
        assert HOST_PROVIDERS[request.url.host] == "openai"
        chunks = list(evidence_chunks(json.loads(request.content)))
        return provider_response(
            "openai",
            {
                "answer": TEXT,
                "supported": True,
                "citations": [{"chunk_id": chunks[0]["chunk_id"], "quote": TEXT}],
            },
        )

    client, calls = clients(handler)
    selected = source(client)
    response = client.post(
        "/api/v1/chat",
        json={"question": "When does the launch start?", "source_ids": [selected["id"]]},
        headers={"X-OpenAI-API-Key": KEY},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["provider"] == "openai"
    assert len(calls) == 1


@pytest.mark.parametrize("provider", DEFAULT_MODELS)
@pytest.mark.parametrize("question", ["When does the launch start?", "Axolotl hyperdrive"])
def test_conflicting_key_headers_are_always_rejected(clients, provider, question):
    client, calls = clients()
    selected = source(client)
    response = ask(
        client,
        selected["id"],
        provider=provider,
        question=question,
        headers={"X-AI-API-Key": KEY, "X-OpenAI-API-Key": KEY},
    )
    assert_error(response, 422, "VALIDATION_ERROR")
    assert calls == []


@pytest.mark.parametrize("provider", DEFAULT_MODELS)
@pytest.mark.parametrize("invalid", ["quote", "id"])
def test_exact_quote_and_chunk_id_checks_apply_to_every_provider(clients, provider, invalid):
    def handler(request):
        chunks = list(evidence_chunks(json.loads(request.content)))
        citation = {"chunk_id": chunks[0]["chunk_id"], "quote": TEXT}
        citation["quote" if invalid == "quote" else "chunk_id"] = "not-in-selected-evidence"
        return provider_response(
            provider, {"answer": "Unsupported claim.", "supported": True, "citations": [citation]}
        )

    client, calls = clients(handler)
    selected = source(client)
    assert_error(ask(client, selected["id"], provider=provider), 502, "INVALID_AI_RESPONSE")
    assert len(calls) == 1


@pytest.mark.parametrize("provider", DEFAULT_MODELS)
@pytest.mark.parametrize(
    ("status", "code"), [(401, "AI_AUTH_ERROR"), (429, "AI_RATE_LIMITED"), (503, "AI_UNAVAILABLE")]
)
def test_provider_errors_do_not_leak_secrets_or_fall_back(clients, provider, status, code):
    def handler(request):
        assert HOST_PROVIDERS[request.url.host] == provider
        return httpx.Response(status, json={"error": {"message": "private-provider-detail " + KEY}})

    client, calls = clients(handler)
    selected = source(client)
    assert_error(ask(client, selected["id"], provider=provider), status, code)
    assert len(calls) == 1


@pytest.mark.parametrize(
    "changes",
    [
        {"provider": None},
        {"provider": "unknown"},
        {"model": None},
        {"model": ""},
        {"model": "bad model"},
    ],
)
def test_explicit_invalid_provider_or_model_never_silently_uses_a_default(clients, changes):
    client, calls = clients()
    selected = source(client)
    assert_error(ask(client, selected["id"], **changes), 422, "VALIDATION_ERROR")
    assert calls == []
