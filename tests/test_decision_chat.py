"""The optional explanation consumes an actual comparison without replacing its result."""

import json
from contextlib import contextmanager

import httpx
import pytest
from fastapi.testclient import TestClient

from app.comparison.router import get_decision_source_client
from app.knowledge.router import get_ai_client, get_store
from app.knowledge.storage import KnowledgeStore
from app.main import create_app

KEY = "test-placeholder-never-a-real-key"


@contextmanager
def decision_client(tmp_path, captured, *, invalid_quote=False, source_failure=False):
    app = create_app()
    store = KnowledgeStore(tmp_path / "decision-chat.sqlite3")

    def provider(request):
        payload = json.loads(request.content)
        evidence = json.loads(payload["input"][0]["content"])
        captured.append(evidence)
        chunk = next(
            chunk for chunk in evidence["sources"] if chunk["chunk_id"] == "decision-context"
        )
        answer = {
            "supported": True,
            "answer": "This is the calculated comparison.",
            "citations": [
                {
                    "chunk_id": chunk["chunk_id"],
                    "quote": "invented quote" if invalid_quote else chunk["text"][:100],
                }
            ],
        }
        return httpx.Response(
            200,
            json={
                "status": "completed",
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "content": [{"type": "output_text", "text": json.dumps(answer)}],
                    }
                ],
            },
        )

    async def ai_client():
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
            yield client

    async def failed_source():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _: httpx.Response(503, json={})),
            base_url="http://decision-source.local",
        ) as client:
            yield client

    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_ai_client] = ai_client
    if source_failure:
        app.dependency_overrides[get_decision_source_client] = failed_source
    with TestClient(app) as client:
        yield client, store


def ask(client, request, **extra):
    return client.post(
        "/api/v1/chat",
        headers={"X-AI-API-Key": KEY},
        json={
            "question": "Why is this option recommended?",
            "source_ids": [],
            "decision_request": request,
            **extra,
        },
    )


@pytest.mark.parametrize("scenario", ["market", "travel", "student", "sustainability", "custom"])
def test_chat_includes_exact_actual_decision_and_ephemeral_checked_citation(tmp_path, scenario):
    captured = []
    with decision_client(tmp_path, captured) as (client, store):
        request = {"scenario_id": scenario}
        expected = client.post("/api/v1/decisions/evaluate", json=request).json()["data"]
        response = ask(client, request)
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["decision"] == expected
        assert data["planner"] is None
        assert data["used_source_ids"] == ["decision-context"]
        assert data["citations"][0]["source_id"] == "decision-context"
        assert data["citations"][0]["is_simulated"] is True
        chunk = captured[0]["sources"][0]
        summary = json.loads(chunk["text"])
        assert summary["recommended"]["id"] == expected["recommended"]["id"]
        assert summary["recommended"]["score"] == expected["recommended"]["score"]
        assert summary["recommended"]["metrics"] == expected["recommended"]["metrics"]
        assert summary["sources"] == expected["sources"]
        assert "relative" in summary["note"]
        assert len(chunk["text"]) <= 12000
        assert store.list_sources() == []
        assert KEY not in response.text
        assert KEY not in json.dumps(captured)


@pytest.mark.parametrize(
    ("decision_request", "status", "code"),
    [
        ({"scenario_id": "unknown-domain"}, 404, "NOT_FOUND"),
        ({"scenario_id": "travel", "weights": {"unknown": 10}}, 422, "VALIDATION_ERROR"),
        (
            {
                "scenario_id": "travel",
                "constraints": [{"criterion_id": "cost-pence", "operator": "lte", "value": 1.5}],
            },
            422,
            "VALIDATION_ERROR",
        ),
    ],
)
def test_invalid_decision_propagates_before_any_provider_call(
    tmp_path, decision_request, status, code
):
    captured = []
    with decision_client(tmp_path, captured) as (client, _):
        direct = client.post("/api/v1/decisions/evaluate", json=decision_request)
        response = ask(client, decision_request)
        assert response.status_code == status, response.text
        assert response.json() == direct.json()
        assert response.json()["error"]["code"] == code
        assert captured == []


def test_comparison_source_failure_is_not_replaced_by_a_generated_answer(tmp_path):
    captured = []
    with decision_client(tmp_path, captured, source_failure=True) as (client, _):
        response = ask(client, {"scenario_id": "travel"})
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "SOURCE_UNAVAILABLE"
        assert captured == []


def test_decision_citation_must_be_an_exact_quote(tmp_path):
    captured = []
    with decision_client(tmp_path, captured, invalid_quote=True) as (client, _):
        response = ask(client, {"scenario_id": "travel"})
        assert response.status_code == 502, response.text
        assert response.json()["error"]["code"] == "INVALID_AI_RESPONSE"
        assert len(captured) == 1


def test_no_feasible_decision_is_still_real_evidence_not_a_hidden_fallback(tmp_path):
    captured = []
    with decision_client(tmp_path, captured) as (client, _):
        request = {
            "scenario_id": "travel",
            "constraints": [{"criterion_id": "duration-minutes", "operator": "lte", "value": 0}],
        }
        response = ask(client, request)
        assert response.status_code == 200, response.text
        decision = response.json()["data"]["decision"]
        assert decision["recommended"] is None
        assert decision["ranked"] == []
        assert decision["excluded"]
        assert json.loads(captured[0]["sources"][0]["text"])["recommended"] is None


def test_both_calculated_contexts_reserve_slots_and_keep_library_selection_bounded(tmp_path):
    captured = []
    with decision_client(tmp_path, captured) as (client, _):
        source_ids = []
        for index in range(8):
            response = client.post(
                "/api/v1/sources",
                json={
                    "title": f"Option notes {index}",
                    "text": f"Option {index} is recommended for comparison.",
                },
            )
            assert response.status_code == 201
            source_ids.append(response.json()["data"]["id"])
        preferences = client.get("/api/v1/options").json()["data"]["default_request"]
        plan = client.post("/api/v1/recommendations", json=preferences).json()["data"]
        response = ask(
            client, {"scenario_id": "travel"}, source_ids=source_ids, preferences=preferences
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["planner"] == plan
        chunks = captured[0]["sources"]
        assert len(chunks) == 6
        assert {chunk["source_id"] for chunk in chunks[:2]} == {
            "planner-context",
            "decision-context",
        }
        assert all(chunk["source_id"] in source_ids for chunk in chunks[2:])
