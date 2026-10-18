"""Test-only actual application server with explicitly mocked provider transports."""

import argparse
import asyncio
import json
from collections import Counter

import httpx
import uvicorn
from starlette.responses import JSONResponse

from app.knowledge.router import get_ai_client
from app.main import create_app

app = create_app()
provider_calls = Counter()
last_evidence = []
last_header_used = False
last_body_key_free = True
last_store_disabled = False
last_provider = None
captured_responses = {}
source_failure = False
CAPTURE_PATHS = {
    "/api/v1/chat": "chat",
    "/api/v1/recommendations": "planner",
    "/api/v1/decisions/evaluate": "decision",
}
FAKE_KEYS = {
    "openai": "sk-desktop-test-placeholder",
    "deepseek": "sk-deepseek-test-placeholder",
    "gemini": "sk-gemini-test-placeholder",
    "anthropic": "sk-anthropic-test-placeholder",
}
HOST_PROVIDERS = {
    "api.openai.com": "openai",
    "api.deepseek.com": "deepseek",
    "generativelanguage.googleapis.com": "gemini",
    "api.anthropic.com": "anthropic",
}


class CaptureResponses:
    """Observe bounded fake-user JSON in memory without inspecting credentials."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        if source_failure and scope["path"].startswith("/mock/"):
            response = JSONResponse({"error": "Test-only simulated feed failure"}, 503)
            return await response(scope, receive, send)
        kind = CAPTURE_PATHS.get(scope["path"])
        if kind is None:
            return await self.app(scope, receive, send)
        request_parts = []
        response_parts = []
        request_size = 0
        response_size = 0
        status_code = 0

        async def observed_receive():
            nonlocal request_size
            message = await receive()
            if message["type"] == "http.request":
                chunk = message.get("body", b"")
                request_size += len(chunk)
                if request_size <= 300_000:
                    request_parts.append(chunk)
            return message

        async def observed_send(message):
            nonlocal response_size, status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            elif message["type"] == "http.response.body":
                chunk = message.get("body", b"")
                response_size += len(chunk)
                if response_size <= 4 * 1024 * 1024:
                    response_parts.append(chunk)
                if not message.get("more_body", False):
                    try:
                        captured_responses[kind] = {
                            "sequence": captured_responses.get(kind, {}).get("sequence", 0) + 1,
                            "request": json.loads(b"".join(request_parts)),
                            "status": status_code,
                            "body": json.loads(b"".join(response_parts)),
                        }
                    except ValueError:
                        captured_responses.pop(kind, None)
            await send(message)

        await self.app(scope, observed_receive, observed_send)


app.add_middleware(CaptureResponses)


def provider_response(draft, provider="openai"):
    content = json.dumps(draft)
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
    if provider in {"deepseek", "gemini"}:
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


async def mocked_provider(request):
    global last_evidence, last_header_used, last_body_key_free, last_store_disabled, last_provider
    payload = json.loads(request.content)
    provider = HOST_PROVIDERS[request.url.host]
    last_provider = provider
    model = payload["model"]
    call_id = f"{provider}:{model}"
    provider_calls[call_id] += 1
    chunks = list(evidence_chunks(payload))
    last_evidence = list(dict.fromkeys(chunk["source_id"] for chunk in chunks))
    expected_key = FAKE_KEYS[provider]
    last_header_used = (
        request.headers.get("x-api-key") == expected_key and "authorization" not in request.headers
        if provider == "anthropic"
        else request.headers.get("authorization") == f"Bearer {expected_key}"
        and "x-api-key" not in request.headers
    )
    last_body_key_free = all(key not in request.content.decode() for key in FAKE_KEYS.values())
    last_store_disabled = payload.get("store") is False if provider == "openai" else None
    if not last_header_used:
        return httpx.Response(
            401, json={"error": {"message": "Mocked provider credential mismatch"}}
        )
    if model == "test-auth-error":
        return httpx.Response(401, json={"error": {"message": "Mocked invalid key"}})
    if model == "test-provider-error" and provider_calls[call_id] == 1:
        return httpx.Response(503, json={"error": {"message": "Mocked temporary failure"}})
    if model == "test-rate-limit":
        return httpx.Response(429, json={"error": {"message": "Mocked rate limit"}})
    if model == "test-provider-timeout":
        raise httpx.ReadTimeout("Mocked provider timeout")
    if model == "test-slow":
        await asyncio.sleep(0.4)
    if model == "test-insufficient":
        return provider_response(
            {"answer": "Evidence is insufficient.", "supported": False, "citations": []}, provider
        )
    selected = next(
        (chunk for chunk in chunks if chunk["source_id"] != "planner-context"), chunks[0]
    )
    quote = (
        "A deliberately invalid quote that does not appear in the selected source."
        if model == "test-invalid-quote"
        else selected["text"][:120]
    )
    return provider_response(
        {
            "answer": "The selected guide says: " + quote,
            "supported": True,
            "citations": [{"chunk_id": selected["chunk_id"], "quote": quote}],
        },
        provider,
    )


async def ai_client():
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(mocked_provider), trust_env=False
    ) as client:
        yield client


app.dependency_overrides[get_ai_client] = ai_client


@app.get("/__test__/provider-status", include_in_schema=False)
def provider_status():
    return {
        "provider": "mocked",
        "calls": dict(provider_calls),
        "last_source_ids": last_evidence,
        "header_used": last_header_used,
        "body_key_free": last_body_key_free,
        "store_disabled": last_store_disabled,
        "last_provider": last_provider,
    }


@app.get("/__test__/captured", include_in_schema=False)
def captured():
    return captured_responses


@app.post("/__test__/source-mode", include_in_schema=False)
def source_mode(failed: bool = False):
    global source_failure
    source_failure = failed
    return {"failed": source_failure}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, required=True)
    arguments = parser.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=arguments.port, log_level="error", access_log=False)
