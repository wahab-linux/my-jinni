import json
from contextlib import ExitStack

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app

API_KEY = "sk-test-placeholder-never-a-real-secret"
SOURCE_TEXT = "The launch starts at 18:30. Registration for the launch is free."
CHAT_QUESTION = "When does the launch start?"


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


def provider_response(answer):
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


def valid_provider_handler(request):
    payload = json.loads(request.content)
    chunks = list(evidence_chunks(payload["input"]))
    assert chunks, "The provider request must include the selected retrieved evidence"
    assert request.headers["authorization"] == f"Bearer {API_KEY}"
    return provider_response(
        {
            "answer": "The launch starts at 18:30.",
            "supported": True,
            "citations": [{"chunk_id": chunks[0]["chunk_id"], "quote": chunks[0]["text"][:100]}],
        }
    )


@pytest.fixture
def knowledge_clients(tmp_path):
    from app.knowledge.router import get_ai_client, get_store
    from app.knowledge.storage import KnowledgeStore

    with ExitStack() as stack:

        def make_client(handler=None):
            app = create_app()
            store = KnowledgeStore(tmp_path / "knowledge.sqlite3")

            def forbidden_provider(request):
                raise AssertionError(f"Unexpected provider call: {request.url.path}")

            async def source_client():
                async with httpx.AsyncClient(
                    transport=httpx.MockTransport(handler or forbidden_provider),
                    base_url="https://api.openai.com",
                ) as ai_client:
                    yield ai_client

            app.dependency_overrides[get_store] = lambda: store
            app.dependency_overrides[get_ai_client] = source_client
            return stack.enter_context(TestClient(app, raise_server_exceptions=False))

        yield make_client


def add_source(client, title="Launch information", text=SOURCE_TEXT):
    response = client.post("/api/v1/sources", json={"title": title, "text": text})
    assert response.status_code == 201, response.text
    return response.json()["data"]


def ask(client, source_ids, *, question=CHAT_QUESTION, key=API_KEY, **extra):
    headers = {"X-OpenAI-API-Key": key} if key is not None else {}
    return client.post(
        "/api/v1/chat",
        json={"question": question, "source_ids": source_ids, **extra},
        headers=headers,
    )


def assert_error(response, status, code):
    assert response.status_code == status, response.text
    body = response.json()
    assert body["data"] is None
    assert body["error"]["code"] == code
    assert API_KEY not in response.text
    assert "private-provider-detail" not in response.text
    assert "Traceback" not in response.text


def test_source_lifecycle_persists_across_new_store_instances(knowledge_clients):
    client = knowledge_clients()
    initial = client.get("/api/v1/sources")
    assert initial.status_code == 200, initial.text
    assert initial.json()["data"]["sources"] == []
    assert initial.json()["data"]["storage"] == "local"
    assert initial.json()["data"]["retrieval"] == "lexical"
    assert "selected AI provider" in initial.json()["data"]["cloud_notice"]

    source = add_source(client)
    assert source["title"] == "Launch information"
    assert source["kind"] == "text"
    assert source["chunk_count"] >= 1
    assert source["character_count"] == len(SOURCE_TEXT)

    reopened = knowledge_clients()
    listed = reopened.get("/api/v1/sources").json()["data"]["sources"]
    assert [item["id"] for item in listed] == [source["id"]]
    detail = reopened.get(f"/api/v1/sources/{source['id']}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["data"]["source"]["id"] == source["id"]
    assert SOURCE_TEXT in "\n".join(chunk["text"] for chunk in detail.json()["data"]["chunks"])

    deleted = reopened.delete(f"/api/v1/sources/{source['id']}")
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["data"] == {"source_id": source["id"], "deleted": True}
    assert client.get("/api/v1/sources").json()["data"]["sources"] == []
    assert_error(client.get(f"/api/v1/sources/{source['id']}"), 404, "NOT_FOUND")
    assert_error(client.delete(f"/api/v1/sources/{source['id']}"), 404, "NOT_FOUND")


@pytest.mark.parametrize(
    ("filename", "media_type", "kind"),
    [("notes.txt", "text/plain", "text"), ("notes.md", "text/markdown", "markdown")],
)
def test_utf8_upload_creates_local_source(knowledge_clients, filename, media_type, kind):
    client = knowledge_clients()
    text = "Launch notes include a café meeting at 18:30."
    response = client.post(
        "/api/v1/sources/upload",
        files={"file": (filename, text.encode("utf-8"), media_type)},
        data={"title": "Uploaded launch notes"},
    )
    assert response.status_code == 201, response.text
    source = response.json()["data"]
    assert source["title"] == "Uploaded launch notes"
    assert source["kind"] == kind
    assert source["filename"] == filename
    detail = client.get(f"/api/v1/sources/{source['id']}").json()["data"]
    assert text in "\n".join(chunk["text"] for chunk in detail["chunks"])


def test_unsupported_upload_is_415(knowledge_clients):
    client = knowledge_clients()
    response = client.post(
        "/api/v1/sources/upload",
        files={"file": ("notes.exe", b"not an allowed document", "application/octet-stream")},
    )
    assert_error(response, 415, "UNSUPPORTED_SOURCE_TYPE")
    assert client.get("/api/v1/sources").json()["data"]["sources"] == []


def test_upload_requires_file_and_rejects_corrupt_pdf(knowledge_clients):
    client = knowledge_clients()
    missing = client.post("/api/v1/sources/upload", data={"title": "Missing file"})
    assert_error(missing, 422, "VALIDATION_ERROR")
    corrupt = client.post(
        "/api/v1/sources/upload",
        files={"file": ("broken.pdf", b"not a PDF", "application/pdf")},
    )
    assert_error(corrupt, 422, "INVALID_DOCUMENT")


@pytest.mark.parametrize("data", [{"title": " ", "text": "Text"}, {"title": "Title", "text": " "}])
def test_blank_source_input_is_correctable_validation_error(knowledge_clients, data):
    client = knowledge_clients()
    assert_error(client.post("/api/v1/sources", json=data), 422, "VALIDATION_ERROR")


def test_source_null_characters_are_validation_errors_without_partial_storage(knowledge_clients):
    client = knowledge_clients()
    response = client.post(
        "/api/v1/sources", json={"title": "Invalid source", "text": "Launch\x00notes"}
    )
    assert_error(response, 422, "VALIDATION_ERROR")
    assert client.get("/api/v1/sources").json()["data"]["sources"] == []
    assert add_source(client)["title"] == "Launch information"


@pytest.mark.parametrize("field", ["title", "text"])
def test_source_unpaired_unicode_is_a_validation_error(knowledge_clients, field):
    client = knowledge_clients()
    payload = {"title": "Launch information", "text": SOURCE_TEXT}
    payload[field] = "Invalid\ud800Unicode"
    response = client.post(
        "/api/v1/sources",
        content=json.dumps(payload),
        headers={"Content-Type": "application/json"},
    )
    assert_error(response, 422, "VALIDATION_ERROR")
    assert client.get("/api/v1/sources").json()["data"]["sources"] == []


def test_question_unpaired_unicode_is_rejected_before_provider(knowledge_clients):
    client = knowledge_clients()
    source = add_source(client)
    response = client.post(
        "/api/v1/chat",
        content=json.dumps({"question": "Invalid\ud800question", "source_ids": [source["id"]]}),
        headers={"Content-Type": "application/json", "X-OpenAI-API-Key": API_KEY},
    )
    assert_error(response, 422, "VALIDATION_ERROR")


def test_malformed_upload_metadata_is_422_without_partial_storage(knowledge_clients):
    client = knowledge_clients()
    response = client.post(
        "/api/v1/sources/upload",
        files={"file": ("a" * 256 + ".txt", SOURCE_TEXT.encode(), "text/plain")},
        data={"title": "Valid title"},
    )
    assert_error(response, 422, "INVALID_DOCUMENT")
    assert client.get("/api/v1/sources").json()["data"]["sources"] == []


def test_cited_answer_uses_selected_evidence_and_leaves_no_secret_in_storage(
    knowledge_clients, tmp_path
):
    calls = []

    def handler(request):
        calls.append(json.loads(request.content))
        return valid_provider_handler(request)

    client = knowledge_clients(handler)
    selected = add_source(client)
    unselected = add_source(
        client, title="Private other source", text="Launch sentinel: UNSELECTED_X92"
    )
    response = ask(client, [selected["id"]])
    assert response.status_code == 200, response.text
    body = response.json()
    data = body["data"]
    assert data["status"] == "answered"
    assert data["answer"] == "The launch starts at 18:30."
    assert data["model"] == "gpt-4.1-mini"
    assert data["used_source_ids"] == [selected["id"]]
    assert data["planner"] is None
    assert len(data["citations"]) == 1
    citation = data["citations"][0]
    assert citation["source_id"] == selected["id"]
    assert citation["source_title"] == selected["title"]
    assert citation["quote"] in SOURCE_TEXT
    assert len(calls) == 1
    assert "UNSELECTED_X92" not in json.dumps(calls)
    assert unselected["id"] not in json.dumps(calls)
    assert API_KEY not in json.dumps(calls)
    assert calls[0]["store"] is False
    assert API_KEY not in response.text
    for path in tmp_path.rglob("*"):
        if path.is_file():
            assert API_KEY.encode() not in path.read_bytes()


@pytest.mark.parametrize("import_method", ["text", "upload"])
def test_simulated_source_label_survives_import_retrieval_and_citation(
    knowledge_clients, import_method
):
    client = knowledge_clients(valid_provider_handler)
    if import_method == "text":
        response = client.post(
            "/api/v1/sources",
            json={"title": "Fictional launch guide", "text": SOURCE_TEXT, "is_simulated": True},
        )
    else:
        response = client.post(
            "/api/v1/sources/upload",
            files={"file": ("fictional-guide.txt", SOURCE_TEXT.encode(), "text/plain")},
            data={"title": "Fictional launch guide", "is_simulated": "true"},
        )
    assert response.status_code == 201, response.text
    source = response.json()["data"]
    assert source["is_simulated"] is True
    detail = client.get(f"/api/v1/sources/{source['id']}").json()["data"]
    assert detail["source"]["is_simulated"] is True
    assert all(chunk["is_simulated"] is True for chunk in detail["chunks"])
    answer = ask(client, [source["id"]])
    assert answer.status_code == 200, answer.text
    assert answer.json()["data"]["status"] == "answered"
    assert answer.json()["data"]["citations"][0]["is_simulated"] is True


def test_no_lexical_evidence_needs_neither_key_nor_provider(knowledge_clients):
    client = knowledge_clients()
    source = add_source(client)
    add_source(client, title="Unselected matching source", text="Zygomatic quaternion information.")
    response = ask(client, [source["id"]], question="Zygomatic quaternion?", key=None)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "insufficient_evidence"
    assert data["citations"] == []
    assert data["model"] is None


def test_retrieved_context_without_key_returns_auth_error_without_provider(knowledge_clients):
    client = knowledge_clients()
    source = add_source(client)
    assert_error(ask(client, [source["id"]], key=None), 401, "AI_AUTH_ERROR")


def test_unknown_or_deleted_selected_source_is_not_silently_ignored(knowledge_clients):
    client = knowledge_clients()
    source = add_source(client)
    assert_error(ask(client, [source["id"], "missing-source"]), 404, "NOT_FOUND")
    client.delete(f"/api/v1/sources/{source['id']}")
    assert_error(ask(client, [source["id"]]), 404, "NOT_FOUND")


@pytest.mark.parametrize("invalid", ["unknown_chunk", "forged_quote", "missing_citations"])
def test_supported_answer_with_invalid_citations_is_rejected(knowledge_clients, invalid):
    def handler(request):
        chunks = list(evidence_chunks(json.loads(request.content)["input"]))
        citation = {"chunk_id": chunks[0]["chunk_id"], "quote": chunks[0]["text"][:100]}
        if invalid == "unknown_chunk":
            citation["chunk_id"] = "forged-unretrieved-chunk"
        elif invalid == "forged_quote":
            citation["quote"] = "This exact fabricated statement does not occur in the source."
        return provider_response(
            {
                "answer": "An unsupported claim",
                "supported": True,
                "citations": [] if invalid == "missing_citations" else [citation],
            }
        )

    client = knowledge_clients(handler)
    source = add_source(client)
    assert_error(ask(client, [source["id"]]), 502, "INVALID_AI_RESPONSE")


def test_model_unsupported_answer_becomes_generic_insufficient_evidence(knowledge_clients):
    client = knowledge_clients(
        lambda request: provider_response(
            {"answer": "Fabricated unsupported answer", "supported": False, "citations": []}
        )
    )
    source = add_source(client)
    response = ask(client, [source["id"]])
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "insufficient_evidence"
    assert data["citations"] == []
    assert "Fabricated unsupported answer" not in data["answer"]


@pytest.mark.parametrize(
    ("provider_status", "expected_status", "code"),
    [
        (401, 401, "AI_AUTH_ERROR"),
        (403, 401, "AI_AUTH_ERROR"),
        (429, 429, "AI_RATE_LIMITED"),
        (500, 503, "AI_UNAVAILABLE"),
        (400, 422, "AI_REQUEST_ERROR"),
        (404, 422, "AI_REQUEST_ERROR"),
    ],
)
def test_provider_errors_are_mapped_without_leaking_details(
    knowledge_clients, provider_status, expected_status, code
):
    client = knowledge_clients(
        lambda request: httpx.Response(provider_status, text=f"private-provider-detail {API_KEY}")
    )
    source = add_source(client)
    assert_error(ask(client, [source["id"]]), expected_status, code)


def test_provider_timeout_is_bounded_failure_without_real_wait(knowledge_clients):
    def handler(request):
        raise httpx.ReadTimeout(f"private-provider-detail {API_KEY}", request=request)

    client = knowledge_clients(handler)
    source = add_source(client)
    assert_error(ask(client, [source["id"]]), 504, "AI_TIMEOUT")


def test_malformed_provider_output_is_not_returned_as_answer(knowledge_clients):
    client = knowledge_clients(lambda request: httpx.Response(200, json={"wrong": "format"}))
    source = add_source(client)
    assert_error(ask(client, [source["id"]]), 502, "INVALID_AI_RESPONSE")


def test_planner_context_is_calculated_and_citable(knowledge_clients, valid_request):
    calls = []

    def handler(request):
        payload = json.loads(request.content)
        chunks = list(evidence_chunks(payload["input"]))
        planner_chunk = next(chunk for chunk in chunks if chunk["chunk_id"] == "planner-context")
        planner = json.loads(planner_chunk["text"])
        assert planner["recommended"]["event_id"] == "event-board-games"
        assert planner["recommended"]["total_cost_pence"] == 500
        calls.append(payload)
        return provider_response(
            {
                "answer": "Board Game Night fits the calculated budget and journey constraints.",
                "supported": True,
                "citations": [{"chunk_id": "planner-context", "quote": "Board Game Night"}],
            }
        )

    client = knowledge_clients(handler)
    response = ask(client, [], question="Explain this plan.", preferences=valid_request)
    assert response.status_code == 200, response.text
    body = response.json()
    data = body["data"]
    assert len(calls) == 1
    assert data["status"] == "answered"
    assert data["planner"]["recommended"]["total_cost_pence"] == 500
    assert data["citations"][0]["source_id"] == "planner-context"
    assert data["citations"][0]["is_simulated"] is True
    assert "SIMULATED_DATA" in {warning["code"] for warning in body["warnings"]}
    assert client.get("/api/v1/sources").json()["data"]["sources"] == []


def test_unsupported_planner_scenario_is_rejected_before_provider(knowledge_clients, valid_request):
    client = knowledge_clients()
    valid_request["origin_id"] = "unsupported-origin"
    response = ask(client, [], question="Explain the plan.", preferences=valid_request)
    assert_error(response, 422, "VALIDATION_ERROR")


def test_original_planner_still_works_without_an_ai_key(knowledge_clients, valid_request):
    client = knowledge_clients()
    response = client.post("/api/v1/recommendations", json=valid_request)
    assert response.status_code == 200, response.text
    assert response.json()["data"]["recommended"]["total_cost_pence"] == 500


@pytest.mark.parametrize(
    "payload",
    [
        {"question": " ", "source_ids": ["any-source"]},
        {"question": "Question", "source_ids": []},
        {"question": "Question", "source_ids": ["duplicate", "duplicate"]},
        {"question": "Question", "source_ids": ["source"], "api_key": API_KEY},
    ],
)
def test_invalid_chat_request_is_a_local_validation_error(knowledge_clients, payload):
    client = knowledge_clients()
    assert_error(client.post("/api/v1/chat", json=payload), 422, "VALIDATION_ERROR")
