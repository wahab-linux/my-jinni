"""Test-only actual application server with an explicitly mocked OpenAI transport."""

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


def provider_response(draft):
    return httpx.Response(
        200,
        json={
            "status": "completed",
            "output": [
                {
                    "type": "message",
                    "role": "assistant",
                    "status": "completed",
                    "content": [{"type": "output_text", "text": json.dumps(draft)}],
                }
            ],
        },
    )


async def mocked_provider(request):
    global last_evidence, last_header_used, last_body_key_free, last_store_disabled
    payload = json.loads(request.content)
    model = payload["model"]
    provider_calls[model] += 1
    data = json.loads(payload["input"][0]["content"])
    chunks = data["sources"]
    last_evidence = list(dict.fromkeys(chunk["source_id"] for chunk in chunks))
    last_header_used = request.headers.get("authorization") == "Bearer sk-desktop-test-placeholder"
    last_body_key_free = "sk-desktop-test-placeholder" not in request.content.decode()
    last_store_disabled = payload.get("store") is False
    if model == "test-auth-error":
        return httpx.Response(401, json={"error": {"message": "Mocked invalid key"}})
    if model == "test-provider-error" and provider_calls[model] == 1:
        return httpx.Response(503, json={"error": {"message": "Mocked temporary failure"}})
    if model == "test-rate-limit":
        return httpx.Response(429, json={"error": {"message": "Mocked rate limit"}})
    if model == "test-provider-timeout":
        raise httpx.ReadTimeout("Mocked provider timeout")
    if model == "test-slow":
        await asyncio.sleep(0.4)
    if model == "test-insufficient":
        return provider_response(
            {"answer": "Evidence is insufficient.", "supported": False, "citations": []}
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
        }
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
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, required=True)
    arguments = parser.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=arguments.port, log_level="error", access_log=False)
