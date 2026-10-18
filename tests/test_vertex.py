"""Vertex ADC tests use fake Google credentials and HTTP; never a real login or billable call."""

import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from google.auth.exceptions import DefaultCredentialsError

from app.knowledge import vertex
from app.knowledge.openai_client import AIServiceError
from app.knowledge.router import get_ai_client, get_store
from app.knowledge.schemas import SourceChunk, VertexSettings
from app.knowledge.storage import KnowledgeStore
from app.main import create_app

TOKEN = "fake-google-access-token-never-a-real-credential"
SETTINGS = {"project_id": "my-trial-project", "location": "global"}


def wire(draft):
    return {
        "candidates": [
            {
                "finishReason": "STOP",
                "content": {"role": "model", "parts": [{"text": json.dumps(draft)}]},
            }
        ]
    }


@pytest.fixture
def setup(tmp_path, monkeypatch):
    application = create_app()
    store = KnowledgeStore(tmp_path / "vertex.sqlite3")
    calls, logins = [], []

    async def login(project):
        logins.append(project)
        return TOKEN

    monkeypatch.setattr(vertex, "load_adc_token", login)

    def transport(request):
        calls.append(request)
        payload = json.loads(request.content)
        evidence = json.loads(payload["contents"][0]["parts"][0]["text"])
        chunk = evidence["sources"][0]
        return httpx.Response(
            200,
            json=wire(
                {
                    "answer": "The fictional coach costs £8.00 and takes 120 minutes.",
                    "supported": True,
                    "citations": [{"chunk_id": chunk["chunk_id"], "quote": chunk["text"][:100]}],
                }
            ),
        )

    async def client():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(transport),
            headers={
                "Authorization": "unrelated",
                "x-api-key": "unrelated",
                "cookie": "unrelated",
                "x-goog-user-project": "wrong-project",
            },
        ) as value:
            yield value

    application.dependency_overrides[get_ai_client] = client
    application.dependency_overrides[get_store] = lambda: store
    with TestClient(application) as client:
        yield client, application, calls, logins


def ask(client, **changes):
    body = {
        "provider": "vertex",
        "model": "gemini-test-model",
        "vertex": SETTINGS,
        "question": "Why did this option win?",
        "source_ids": [],
        "decision_request": {
            "scenario_id": "travel",
            "weights": {"cost-pence": 100, "duration-minutes": 0, "emissions-grams": 0},
            "constraints": [
                {"criterion_id": "cost-pence", "operator": "lte", "value": 800},
                {"criterion_id": "duration-minutes", "operator": "lte", "value": 180},
            ],
        },
    }
    return client.post("/api/v1/chat", json={**body, **changes})


@pytest.mark.parametrize("location", ["global", "europe-west2", "us-central1"])
def test_adc_routes_to_official_endpoint_with_actual_comparison_and_no_api_key(setup, location):
    client, _, calls, logins = setup
    response = ask(client, vertex={**SETTINGS, "location": location})
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["provider"] == "vertex"
    assert data["decision"]["recommended"]["id"] == "coach"
    assert data["decision"]["recommended"]["metrics"]["cost-pence"] == 800
    assert data["citations"][0]["source_id"] == "decision-context"
    assert TOKEN not in response.text
    assert logins == [SETTINGS["project_id"]]
    request = calls[0]
    assert request.url.host == (
        "aiplatform.googleapis.com"
        if location == "global"
        else f"{location}-aiplatform.googleapis.com"
    )
    assert (
        f"/projects/my-trial-project/locations/{location}/publishers/google/models/gemini-test-model:generateContent"
        == request.url.path.removeprefix("/v1")
    )
    assert request.headers["authorization"] == f"Bearer {TOKEN}"
    assert request.headers["x-goog-user-project"] == SETTINGS["project_id"]
    assert "unrelated" not in str(request.headers)
    assert "x-api-key" not in request.headers
    assert "cookie" not in request.headers
    assert TOKEN not in request.content.decode()
    body = json.loads(request.content)
    assert body["generationConfig"]["responseMimeType"] == "application/json"
    assert body["generationConfig"]["responseSchema"]["type"] == "OBJECT"
    assert "tools" not in body
    evidence = json.loads(body["contents"][0]["parts"][0]["text"])
    decision = json.loads(evidence["sources"][0]["text"])
    assert (
        next(item for item in decision["criteria"] if item["id"] == "cost-pence")["unit"] == "pence"
    )


def test_sign_in_check_only_returns_safe_status_and_never_calls_a_model(setup):
    client, _, calls, logins = setup
    response = client.post("/api/v1/ai/vertex/check", json=SETTINGS)
    assert response.status_code == 200
    assert response.json()["data"]["configured"] is True
    assert "model access" in response.json()["data"]["message"]
    assert TOKEN not in response.text
    assert logins == [SETTINGS["project_id"]]
    assert calls == []


def test_missing_evidence_does_not_even_load_adc(setup):
    client, _, calls, logins = setup
    source = client.post(
        "/api/v1/sources", json={"title": "Guide", "text": "The museum opens at noon."}
    ).json()["data"]
    response = ask(
        client,
        question="Axolotl hyperdrive spectroscopy",
        source_ids=[source["id"]],
        decision_request=None,
    )
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "insufficient_evidence"
    assert calls == logins == []


@pytest.mark.parametrize("header", ["X-AI-API-Key", "X-OpenAI-API-Key"])
def test_adc_rejects_api_key_headers_without_authentication_or_model_calls(setup, header):
    client, _, calls, logins = setup
    response = client.post(
        "/api/v1/chat",
        headers={header: "do-not-send"},
        json={
            "provider": "vertex",
            "model": "gemini-test",
            "vertex": SETTINGS,
            "question": "Explain",
            "decision_request": {"scenario_id": "travel"},
        },
    )
    assert response.status_code == 422
    assert calls == logins == []


@pytest.mark.parametrize(
    "settings",
    [
        {"project_id": "../private"},
        {"project_id": "https://evil.example"},
        {**SETTINGS, "location": "global.evil.example"},
        {**SETTINGS, "location": "../private"},
        {**SETTINGS, "credential_file": "/private/key.json"},
        {**SETTINGS, "token": TOKEN},
    ],
)
def test_projects_locations_and_credential_uploads_are_validated_before_adc(setup, settings):
    client, _, calls, logins = setup
    assert client.post("/api/v1/ai/vertex/check", json=settings).status_code == 422
    assert ask(client, vertex=settings).status_code == 422
    assert calls == logins == []


def test_vertex_requires_explicit_project_and_model_and_never_falls_back(setup):
    client, _, calls, logins = setup
    assert ask(client, vertex=None).status_code == 422
    assert ask(client, model="").status_code == 422
    assert ask(client, provider="openai").status_code == 422
    assert ask(client, model="evil:generateContent").status_code == 422
    assert calls == logins == []


def test_adc_refresh_uses_google_scopes_and_explicit_quota_project(monkeypatch):
    seen = {}

    class Credentials:
        valid = False
        token = None

        def refresh(self, request):
            assert request.session.trust_env is False
            self.token = TOKEN

    credentials = Credentials()

    def default(**kwargs):
        seen.update(kwargs)
        return credentials, "different-default-project"

    monkeypatch.setattr(vertex.google.auth, "default", default)
    assert vertex._refresh_adc(SETTINGS["project_id"]) == TOKEN
    assert seen["quota_project_id"] == SETTINGS["project_id"]
    assert seen["scopes"] == vertex.SCOPES


def test_adc_library_failure_never_exposes_credential_details(monkeypatch):
    def missing(**_):
        raise DefaultCredentialsError(f"private-file-secret {TOKEN}")

    monkeypatch.setattr(vertex.google.auth, "default", missing)
    with pytest.raises(AIServiceError) as caught:
        asyncio.run(vertex.load_adc_token(SETTINGS["project_id"]))
    assert caught.value.code == "ADC_AUTH_ERROR"
    assert TOKEN not in str(caught.value)
    assert "private-file" not in str(caught.value)


@pytest.mark.parametrize(
    "status,code",
    [
        (401, "ADC_AUTH_ERROR"),
        (403, "ADC_AUTH_ERROR"),
        (429, "AI_RATE_LIMITED"),
        (400, "AI_REQUEST_ERROR"),
        (404, "AI_REQUEST_ERROR"),
        (503, "AI_UNAVAILABLE"),
    ],
)
def test_provider_failures_are_safe_and_never_echo_response_secrets(monkeypatch, status, code):
    async def login(_):
        return TOKEN

    monkeypatch.setattr(vertex, "load_adc_token", login)

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _: httpx.Response(status, text=TOKEN))
        ) as client:
            return await vertex.generate_answer(
                client,
                settings=VertexSettings(**SETTINGS),
                model="gemini-test",
                question="What time?",
                chunks=[chunk()],
            )

    with pytest.raises(AIServiceError) as caught:
        asyncio.run(run())
    assert caught.value.code == code
    assert TOKEN not in str(caught.value)


def chunk():
    return SourceChunk(
        chunk_id="evidence",
        source_id="guide",
        source_title="Guide",
        page=None,
        index=0,
        text="Opens at 09:30.",
    )


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"candidates": []},
        {"candidates": [{"finishReason": "MAX_TOKENS"}]},
        wire(
            {
                "answer": "Opens at noon",
                "supported": True,
                "citations": [{"chunk_id": "evidence", "quote": "invented"}],
            }
        ),
        wire({"answer": "Opens", "supported": True, "citations": []}),
        {
            "candidates": [
                {"finishReason": "STOP", "content": {"parts": [{"functionCall": {"name": "bad"}}]}}
            ]
        },
    ],
)
def test_incomplete_tool_or_uncited_answers_are_rejected(monkeypatch, payload):
    async def login(_):
        return TOKEN

    monkeypatch.setattr(vertex, "load_adc_token", login)

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _: httpx.Response(200, json=payload))
        ) as client:
            return await vertex.generate_answer(
                client,
                settings=VertexSettings(**SETTINGS),
                model="gemini-test",
                question="When?",
                chunks=[chunk()],
            )

    with pytest.raises(AIServiceError) as caught:
        asyncio.run(run())
    assert caught.value.code == "INVALID_AI_RESPONSE"


def test_deadline_includes_adc_loading_without_a_late_model_request(monkeypatch):
    calls = []

    async def slow(_):
        await asyncio.sleep(0.05)
        return TOKEN

    monkeypatch.setattr(vertex, "load_adc_token", slow)

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(lambda req: calls.append(req))
        ) as client:
            await vertex.generate_answer(
                client,
                settings=VertexSettings(**SETTINGS),
                model="gemini-test",
                question="When?",
                chunks=[chunk()],
                timeout_seconds=0.01,
            )

    with pytest.raises(AIServiceError) as caught:
        asyncio.run(run())
    assert caught.value.code == "AI_TIMEOUT"
    assert calls == []
