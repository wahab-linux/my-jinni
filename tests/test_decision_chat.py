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
        assert summary["criteria"] == [
            {
                **{key: criterion[key] for key in ("id", "label", "unit", "direction")},
                "weight": criterion["default_weight"],
            }
            for criterion in expected["criteria"]
        ]
        assert summary["recommended"]["contributions"] == expected["recommended"]["contributions"]
        assert summary["limitations"] == expected["limitations"]
        assert summary["excluded"] == expected["excluded"][:5]
        assert "relative" in summary["note"]
        assert len(chunk["text"]) <= 12000
        assert store.list_sources() == []
        assert KEY not in response.text
        assert KEY not in json.dumps(captured)


@pytest.mark.parametrize("budget, winner", [(800, "coach"), (799, None)])
def test_ai_sees_real_units_overridden_priorities_limits_and_penny_boundaries(
    tmp_path, budget, winner
):
    captured = []
    request = {
        "scenario_id": "travel",
        "weights": {"cost-pence": 100, "duration-minutes": 0, "emissions-grams": 0},
        "constraints": [
            {"criterion_id": "cost-pence", "operator": "lte", "value": budget},
            {"criterion_id": "duration-minutes", "operator": "lte", "value": 180},
        ],
    }
    with decision_client(tmp_path, captured) as (client, _):
        direct = client.post("/api/v1/decisions/evaluate", json=request).json()["data"]
        response = ask(client, request)
        assert response.status_code == 200
        assert response.json()["data"]["decision"] == direct
        summary = json.loads(captured[0]["sources"][0]["text"])
        criteria = {item["id"]: item for item in summary["criteria"]}
        assert criteria["cost-pence"]["unit"] == "pence"
        assert criteria["duration-minutes"]["unit"] == "minutes"
        assert criteria["emissions-grams"]["unit"] == "g CO2e"
        assert {key: item["weight"] for key, item in criteria.items()} == request["weights"]
        assert summary["limits"] == request["constraints"]
        assert summary["excluded"] == direct["excluded"]
        if winner:
            assert summary["recommended"]["id"] == winner
            assert summary["recommended"]["metrics"]["cost-pence"] == 800
            assert summary["recommended"]["metrics"]["duration-minutes"] == 120
        else:
            assert summary["recommended"] is None
            assert summary["ranked_count"] == 0


def test_large_custom_analysis_keeps_valid_bounded_json_with_units_and_explicit_omissions(tmp_path):
    captured = []
    ids = [f"criterion-{index}-" + "x" * 87 for index in range(10)]
    criteria = [
        {
            "id": key,
            "label": "A" * 100,
            "unit": "custom-measure-" + "u" * 25,
            "direction": "minimize",
            "default_weight": 100,
        }
        for key in ids
    ]
    options = [
        {
            "id": f"option-{index}",
            "name": f"Example {index} " + "n" * 180,
            "description": "Fictional.",
            "category": "example",
        }
        for index in range(50)
    ]
    source = {
        "id": "options",
        "label": "Example source",
        "is_simulated": True,
        "updated_at": "2026-10-18T10:00:00+01:00",
    }
    request = {
        "scenario_id": "custom",
        "constraints": [
            {"criterion_id": key, "operator": op, "value": value}
            for key in ids
            for op, value in [("gte", -1), ("lte", 1)]
        ],
        "custom": {
            "title": "Large comparison",
            "criteria": criteria,
            "dataset": {
                "option_source": source,
                "metric_source": {**source, "id": "measurements"},
                "options": options,
                "observations": [
                    {
                        "option_id": option["id"],
                        "available": True,
                        "metrics": {key: index for key in ids},
                    }
                    for index, option in enumerate(options)
                ],
            },
        },
    }
    with decision_client(tmp_path, captured) as (client, _):
        response = ask(client, request)
        assert response.status_code == 200, response.text
        text = captured[0]["sources"][0]["text"]
        summary = json.loads(text)
        assert len(text) <= 12000
        assert summary["ranked_count"] == 2
        assert summary["excluded_count"] == 48
        assert summary["omitted"]["excluded"] > 0
        assert len(summary["criteria"]) == 10
        assert all(item["unit"] == criteria[0]["unit"] for item in summary["criteria"])
        assert summary["limits"] == request["constraints"]
        assert summary["recommended"]["id"] == "option-0"


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


def test_selected_notes_and_uploaded_files_reach_ai_but_do_not_rewrite_option_metrics(tmp_path):
    captured = []
    with decision_client(tmp_path, captured) as (client, _):
        request = {"scenario_id": "travel"}
        baseline = client.post("/api/v1/decisions/evaluate", json=request).json()["data"]
        note = client.post(
            "/api/v1/sources",
            json={
                "title": "Personal comparison notes",
                "text": "The recommended option should consider my preference for a quiet journey.",
            },
        ).json()["data"]
        uploaded = client.post(
            "/api/v1/sources/upload",
            files={
                "file": (
                    "trial-fares.md",
                    b"# Fictional comparison\nThe recommended coach option costs GBP 9999.",
                    "text/markdown",
                )
            },
            data={"is_simulated": "true"},
        )
        assert uploaded.status_code == 201
        source = uploaded.json()["data"]

        for selected in ([note["id"]], [source["id"]], [note["id"], source["id"]]):
            response = ask(client, request, source_ids=selected)
            assert response.status_code == 200, response.text
            data = response.json()["data"]
            chunks = captured[-1]["sources"]
            assert set(data["used_source_ids"]) == {"decision-context", *selected}
            assert {chunk["source_id"] for chunk in chunks} == {"decision-context", *selected}
            assert data["decision"] == baseline
            if source["id"] in selected:
                file_chunk = next(chunk for chunk in chunks if chunk["source_id"] == source["id"])
                assert "GBP 9999" in file_chunk["text"]
                assert file_chunk["is_simulated"] is True
            else:
                assert "GBP 9999" not in json.dumps(chunks)

        assert client.post("/api/v1/decisions/evaluate", json=request).json()["data"] == baseline
