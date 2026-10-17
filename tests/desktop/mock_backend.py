"""Test-only actual application server with explicitly mocked provider transports."""

import argparse
import asyncio
import json
from collections import Counter

import httpx
import uvicorn

from app.knowledge.router import get_ai_client
from app.main import create_app

app = create_app()
provider_calls = Counter()
last_evidence = []
last_header_used = False
last_body_key_free = True
last_store_disabled = False
last_provider = None
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
    quote = selected["text"][:120]
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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, required=True)
    arguments = parser.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=arguments.port, log_level="error", access_log=False)
