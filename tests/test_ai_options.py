"""AI proposals use fake credentials, bounded mock HTTP and selected original evidence."""

import asyncio
import copy
import json
from contextlib import ExitStack

import httpx
import pytest
from fastapi.testclient import TestClient

from app.knowledge import vertex
from app.knowledge.openai_client import AIServiceError
from app.knowledge.options import generate_options, options_schema, validate_options
from app.knowledge.provider_catalog import PROVIDER_DEFAULT_MODELS
from app.knowledge.router import get_ai_client, get_store
from app.knowledge.schemas import SourceChunk, VertexSettings
from app.knowledge.storage import KnowledgeStore
from app.main import create_app

PROVIDERS = ("openai", "deepseek", "gemini", "anthropic", "vertex")
KEY = "options-test-placeholder-not-a-real-key"
TOKEN = "options-test-placeholder-not-a-real-google-token"
SETTINGS = VertexSettings(project_id="my-trial-project", location="global")
TEXT = "The fictional library offers quiet desks. The fictional park offers outdoor benches."
CHUNK = SourceChunk(
    chunk_id="guide:0",
    source_id="guide",
    source_title="Fictional study guide",
    page=2,
    index=0,
    text=TEXT,
    is_simulated=True,
)


def choices(chunk_id="guide:0", quote=TEXT):
    return {
        "answer": "Compare these two fictional study choices.",
        "supported": True,
        "options": [
            {
                "id": "quiet-library",
                "title": "Quiet library",
                "summary": "Consider the fictional library for quiet desks.",
                "trade_offs": ["An indoor setting."],
                "missing_information": ["Confirm opening hours."],
                "citations": [{"chunk_id": chunk_id, "quote": quote}],
            },
            {
                "id": "outdoor-park",
                "title": "Outdoor park",
                "summary": "Consider the fictional park for outdoor benches.",
                "trade_offs": [],
                "missing_information": ["Confirm weather and availability."],
                "citations": [{"chunk_id": chunk_id, "quote": quote}],
            },
        ],
    }


def wire(provider, draft):
    text = json.dumps(draft)
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
    if provider == "vertex":
        return {
            "candidates": [
                {
                    "finishReason": "STOP",
                    "content": {"role": "model", "parts": [{"text": text}]},
                }
            ]
        }
    return {
        "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": text}}]
    }


def evidence(body, provider):
    if provider == "openai":
        return json.loads(body["input"][0]["content"])
    if provider == "vertex":
        return json.loads(body["contents"][0]["parts"][0]["text"])
    return json.loads(body["messages"][-1]["content"])


@pytest.fixture(autouse=True)
def fake_adc(monkeypatch):
    async def login(project):
        assert project == SETTINGS.project_id
        return TOKEN

    monkeypatch.setattr(vertex, "load_adc_token", login)


def invoke(provider, *, handler=None, draft=None, **changes):
    calls = []

    async def respond(request):
        calls.append(request)
        if handler is not None:
            return await handler(request)
        return httpx.Response(200, json=wire(provider, draft if draft is not None else choices()))

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(respond),
            trust_env=False,
            auth=httpx.BasicAuth("unrelated", "unrelated"),
            headers={
                "Authorization": "unrelated",
                "x-api-key": "unrelated",
                "x-goog-api-key": "unrelated",
                "X-AI-API-Key": "unrelated",
                "X-OpenAI-API-Key": "unrelated",
                "Cookie": "unrelated",
            },
        ) as client:
            return await generate_options(
                client,
                **{
                    "provider": provider,
                    "api_key": KEY if provider != "vertex" else "",
                    "model": PROVIDER_DEFAULT_MODELS[provider] or "gemini-test-model",
                    "question": "Suggest fictional study choices.",
                    "chunks": [CHUNK],
                    "vertex": SETTINGS if provider == "vertex" else None,
                    **changes,
                },
            )

    return asyncio.run(run()), calls


@pytest.mark.parametrize("provider", PROVIDERS)
def test_options_protocol_uses_selected_evidence_and_only_selected_credentials(provider):
    result, calls = invoke(provider)
    assert len(result.options) == 2
    assert result.options[1].citations[0].quote == TEXT
    assert len(calls) == 1
    request = calls[0]
    assert request.url.scheme == "https"
    assert not request.url.query
    assert "unrelated" not in str(request.headers)
    assert "cookie" not in request.headers
    assert "x-ai-api-key" not in request.headers
    assert "x-openai-api-key" not in request.headers
    assert KEY not in request.content.decode()
    assert TOKEN not in request.content.decode()
    if provider == "anthropic":
        assert request.headers["x-api-key"] == KEY
        assert "authorization" not in request.headers
    else:
        assert (
            request.headers["authorization"] == f"Bearer {TOKEN if provider == 'vertex' else KEY}"
        )
        assert "x-api-key" not in request.headers
    body = json.loads(request.content)
    sent = evidence(body, provider)
    assert sent == {
        "intent": "options",
        "question": "Suggest fictional study choices.",
        "sources": [CHUNK.model_dump(mode="json")],
    }
    if provider == "openai":
        assert body["store"] is False
        assert body["max_output_tokens"] == 3200
        assert body["text"]["format"]["name"] == "grounded_options"
        assert body["text"]["format"]["strict"] is True
    if provider == "deepseek":
        assert body["response_format"] == {"type": "json_object"}
        assert '"options": []' in body["messages"][0]["content"]
    if provider == "gemini":
        assert body["response_format"]["json_schema"]["name"] == "grounded_options"
    if provider == "anthropic":
        assert body["output_config"]["format"]["type"] == "json_schema"
    if provider == "vertex":
        assert request.headers["x-goog-user-project"] == SETTINGS.project_id
        assert body["generationConfig"]["responseMimeType"] == "application/json"
    assert "tools" not in body


def test_common_schema_excludes_unsupported_array_bounds_and_requires_each_option_citation():
    schema = options_schema(["guide:0"])

    def visit(value):
        if isinstance(value, dict):
            assert "maxItems" not in value
            assert "minItems" not in value
            if value.get("type") == "object":
                assert value["additionalProperties"] is False
                assert set(value["required"]) == set(value["properties"])
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(schema)
    assert set(schema["properties"]) == {"answer", "supported", "options"}
    citation = schema["properties"]["options"]["items"]["properties"]["citations"]["items"]
    assert citation["properties"]["chunk_id"]["enum"] == ["guide:0"]


@pytest.mark.parametrize("provider", PROVIDERS)
def test_every_provider_rejects_a_forged_reference_on_the_second_option(provider):
    draft = choices()
    draft["options"][1]["citations"][0]["quote"] = "not an exact original quote"
    with pytest.raises(AIServiceError) as caught:
        invoke(provider, draft=draft)
    assert caught.value.status_code == 502
    assert caught.value.code == "INVALID_AI_RESPONSE"


def invalid_drafts():
    base = choices()
    for count in (0, 1, 4):
        draft = copy.deepcopy(base)
        draft["options"] = [copy.deepcopy(base["options"][0]) for _ in range(count)]
        for index, option in enumerate(draft["options"]):
            option["id"] = f"choice-{index}"
        yield draft
    for field, value in (
        ("id", "Bad ID"),
        ("id", "a" * 61),
        ("title", " " * 2),
        ("title", "a" * 201),
        ("summary", "a" * 1201),
        ("trade_offs", ["x"] * 4),
        ("missing_information", ["x" * 401]),
        ("trade_offs", [" "]),
        ("citations", []),
        ("citations", [{"chunk_id": "guide:0", "quote": TEXT}] * 5),
        ("citations", [{"chunk_id": "excluded:0", "quote": TEXT}]),
        ("citations", [{"chunk_id": "guide:0", "quote": " "}]),
    ):
        draft = copy.deepcopy(base)
        draft["options"][1][field] = value
        yield draft
    for field, value in (("answer", "a" * 2001), ("supported", "true"), ("citations", [])):
        yield {**copy.deepcopy(base), field: value}
    draft = copy.deepcopy(base)
    draft["options"][1]["id"] = draft["options"][0]["id"]
    yield draft
    yield {**copy.deepcopy(base), "supported": False}


@pytest.mark.parametrize("draft", list(invalid_drafts()))
def test_local_validation_enforces_proposal_bounds_omitted_from_provider_schemas(draft):
    with pytest.raises(AIServiceError) as caught:
        validate_options(json.dumps(draft), [CHUNK])
    assert caught.value.code == "INVALID_AI_RESPONSE"


@pytest.mark.parametrize("provider", PROVIDERS)
def test_unsupported_proposals_are_empty_without_manufactured_choices(provider):
    result, calls = invoke(
        provider,
        draft={
            "answer": "There is not enough evidence for two choices.",
            "supported": False,
            "options": [],
        },
    )
    assert result.options == []
    assert result.supported is False
    assert len(calls) == 1


@pytest.mark.parametrize("provider", PROVIDERS)
def test_true_deadline_cancels_a_stalled_mock_provider(provider):
    cancelled = []

    async def handler(request):
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.append(True)

    with pytest.raises(AIServiceError) as caught:
        invoke(provider, handler=handler, timeout_seconds=0.01)
    assert caught.value.code == "AI_TIMEOUT"
    assert cancelled == [True]


@pytest.mark.parametrize("provider", PROVIDERS)
@pytest.mark.parametrize("status", [401, 429, 500])
def test_provider_failures_are_safe_and_never_substitute_choices(provider, status):
    async def handler(request):
        return httpx.Response(status, json={"error": {"message": "private detail " + KEY + TOKEN}})

    with pytest.raises(AIServiceError) as caught:
        invoke(provider, handler=handler)
    expected = {
        401: "ADC_AUTH_ERROR" if provider == "vertex" else "AI_AUTH_ERROR",
        429: "AI_RATE_LIMITED",
        500: "AI_UNAVAILABLE",
    }
    assert caught.value.code == expected[status]
    assert KEY not in caught.value.message
    assert TOKEN not in caught.value.message
    assert "private detail" not in caught.value.message


@pytest.fixture
def clients(tmp_path):
    with ExitStack() as stack:

        def make(provider="openai", handler=None):
            app = create_app()
            store = KnowledgeStore(tmp_path / "options.sqlite3")
            calls = []

            def respond(request):
                calls.append(request)
                sent = evidence(json.loads(request.content), provider)
                assert sent["intent"] == "options"
                if handler is not None:
                    return handler(request, sent)
                chunk = sent["sources"][0]
                return httpx.Response(
                    200, json=wire(provider, choices(chunk["chunk_id"], chunk["text"][:100]))
                )

            async def client_override():
                async with httpx.AsyncClient(
                    transport=httpx.MockTransport(respond), trust_env=False
                ) as client:
                    yield client

            app.dependency_overrides[get_store] = lambda: store
            app.dependency_overrides[get_ai_client] = client_override
            client = stack.enter_context(TestClient(app, raise_server_exceptions=False))
            return client, calls

        yield make


def source(client, text=TEXT):
    response = client.post(
        "/api/v1/sources",
        json={"title": "Original fictional guide", "text": text, "is_simulated": True},
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def ask(client, provider, **changes):
    headers = {} if provider == "vertex" else {"X-AI-API-Key": KEY}
    return client.post(
        "/api/v1/chat",
        json={
            "intent": "options",
            "provider": provider,
            "model": PROVIDER_DEFAULT_MODELS[provider] or "gemini-test-model",
            "question": "Suggest fictional library and park study choices.",
            **({"vertex": SETTINGS.model_dump()} if provider == "vertex" else {}),
            **changes,
        },
        headers=headers,
    )


@pytest.mark.parametrize("provider", PROVIDERS)
def test_api_proposals_preserve_selected_source_identity_page_and_exact_quotes(clients, provider):
    client, calls = clients(provider)
    selected = source(client)
    source(client, "EXCLUDED-SECRET guide says no.")
    response = ask(client, provider, source_ids=[selected])
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "answered"
    assert len(data["options"]) == 2
    assert len(data["citations"]) == 1
    assert data["used_source_ids"] == [selected]
    for option in data["options"]:
        assert option["citations"] == data["citations"]
        citation = option["citations"][0]
        assert citation["source_id"] == selected
        assert citation["source_title"] == "Original fictional guide"
        assert citation["quote"] == TEXT
        assert citation["page"] is None
        assert citation["is_simulated"] is True
    assert len(calls) == 1
    assert "EXCLUDED-SECRET" not in calls[0].content.decode()
    assert KEY not in response.text
    assert TOKEN not in response.text


@pytest.mark.parametrize("provider", PROVIDERS)
def test_no_matching_evidence_avoids_cloud_credentials_and_empty_placeholder_options(
    clients, provider, monkeypatch
):
    async def forbidden(project):
        pytest.fail("ADC must not be loaded without matching evidence")

    monkeypatch.setattr(vertex, "load_adc_token", forbidden)
    client, calls = clients(provider)
    selected = source(client)
    body = {
        "intent": "options",
        "provider": provider,
        "model": PROVIDER_DEFAULT_MODELS[provider] or "gemini-test-model",
        "question": "Axolotl hyperdrive spectroscopy",
        "source_ids": [selected],
        **({"vertex": SETTINGS.model_dump()} if provider == "vertex" else {}),
    }
    response = client.post("/api/v1/chat", json=body)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "insufficient_evidence"
    assert data["model"] is None
    assert data["options"] == data["citations"] == []
    assert calls == []


@pytest.mark.parametrize("provider", PROVIDERS)
def test_calculated_comparison_is_authoritative_and_unchanged_after_proposals(clients, provider):
    client, calls = clients(provider)
    request = {
        "scenario_id": "travel",
        "weights": {"cost-pence": 100, "duration-minutes": 0, "emissions-grams": 0},
        "constraints": [
            {"criterion_id": "cost-pence", "operator": "lte", "value": 800},
            {"criterion_id": "duration-minutes", "operator": "lte", "value": 180},
        ],
    }
    before = client.post("/api/v1/decisions/evaluate", json=request).json()["data"]
    response = ask(client, provider, decision_request=request)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["decision"] == before
    assert data["decision"]["recommended"]["id"] == "coach"
    assert data["citations"][0]["source_id"] == "decision-context"
    sent = evidence(json.loads(calls[0].content), provider)
    context = json.loads(sent["sources"][0]["text"])
    assert context["recommended"]["metrics"] == before["recommended"]["metrics"]
    assert context["limits"] == request["constraints"]
    assert client.post("/api/v1/decisions/evaluate", json=request).json()["data"] == before


def test_invalid_option_citations_return_safe_error_without_partial_choices(clients):
    def handler(request, sent):
        draft = choices(sent["sources"][0]["chunk_id"])
        draft["options"][1]["citations"][0]["chunk_id"] = "unselected-source:0"
        return httpx.Response(200, json=wire("openai", draft))

    client, calls = clients(handler=handler)
    response = ask(client, "openai", source_ids=[source(client)])
    assert response.status_code == 502, response.text
    assert response.json()["data"] is None
    assert response.json()["error"]["code"] == "INVALID_AI_RESPONSE"
    assert len(calls) == 1
