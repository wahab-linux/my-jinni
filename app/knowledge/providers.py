import asyncio
import json
import math
import re
from typing import Any

import httpx

from app.knowledge import openai_client
from app.knowledge.openai_client import (
    INSTRUCTIONS,
    MAX_CHUNK_CHARACTERS,
    MAX_EVIDENCE_CHARACTERS,
    MAX_OUTPUT_TOKENS,
    MAX_QUESTION_CHARACTERS,
    MAX_RESPONSE_BYTES,
    MAX_USER_INPUT_CHARACTERS,
    AIServiceError,
    _answer_schema,
    validate_draft_answer,
)
from app.knowledge.provider_catalog import PROVIDER_DEFAULT_MODELS, ProviderId
from app.knowledge.schemas import MAX_RETRIEVED_CHUNKS, DraftAnswer, SourceChunk, VertexSettings

ENDPOINTS = {
    "openai": openai_client.OPENAI_RESPONSES_URL,
    "deepseek": "https://api.deepseek.com/chat/completions",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    "anthropic": "https://api.anthropic.com/v1/messages",
}
_CREDENTIAL_HEADERS = (
    "authorization",
    "x-api-key",
    "x-goog-api-key",
    "x-ai-api-key",
    "x-openai-api-key",
    "cookie",
)


def _invalid_response() -> AIServiceError:
    return AIServiceError(
        502, "INVALID_AI_RESPONSE", "The AI service returned an invalid or incomplete answer."
    )


def _request_error() -> AIServiceError:
    return AIServiceError(
        422, "AI_REQUEST_ERROR", "Please check the provider, model and selected evidence."
    )


def _refused() -> AIServiceError:
    return AIServiceError(502, "AI_REFUSED", "The AI service could not answer this request.")


def _http_error(status: int, provider: ProviderId) -> AIServiceError:
    if status in (401, 403):
        return AIServiceError(
            401, "AI_AUTH_ERROR", "AI authentication failed. Check the selected provider's API key."
        )
    if status == 429:
        return AIServiceError(
            429, "AI_RATE_LIMITED", "AI rate or quota limits were reached. Try again later."
        )
    if provider == "deepseek" and status == 402:
        return AIServiceError(
            429, "AI_RATE_LIMITED", "The selected provider's balance or quota is exhausted."
        )
    if status in (400, 404, 422):
        return _request_error()
    return AIServiceError(503, "AI_UNAVAILABLE", "The AI service is unavailable. Try again later.")


def _input_json(
    api_key: str,
    model: str,
    question: str,
    chunks: list[SourceChunk],
    timeout_seconds: float,
    *,
    intent: str | None = None,
) -> str:
    if (
        not isinstance(api_key, str)
        or not api_key
        or len(api_key) > 1024
        or any(ord(character) < 33 or ord(character) > 126 for character in api_key)
    ):
        raise AIServiceError(
            401, "AI_AUTH_ERROR", "Provide a valid API key for the selected provider."
        )
    if (
        not isinstance(question, str)
        or not question.strip()
        or len(question) > MAX_QUESTION_CHARACTERS
        or not isinstance(model, str)
        or re.fullmatch(r"[a-zA-Z0-9._:-]{1,100}", model) is None
        or not isinstance(timeout_seconds, (int, float))
        or isinstance(timeout_seconds, bool)
        or not math.isfinite(timeout_seconds)
        or timeout_seconds <= 0
        or not isinstance(chunks, list)
        or len(chunks) > MAX_RETRIEVED_CHUNKS
        or any(not isinstance(chunk, SourceChunk) for chunk in chunks)
    ):
        raise _request_error()
    if (
        len({chunk.chunk_id for chunk in chunks}) != len(chunks)
        or any(not chunk.text.strip() or len(chunk.text) > MAX_CHUNK_CHARACTERS for chunk in chunks)
        or sum(len(chunk.text) for chunk in chunks) > MAX_EVIDENCE_CHARACTERS
    ):
        raise _request_error()
    user_input = json.dumps(
        {
            **({"intent": intent} if intent is not None else {}),
            "question": question,
            "sources": [chunk.model_dump(mode="json") for chunk in chunks],
        },
        ensure_ascii=False,
    )
    try:
        user_input.encode("utf-8")
    except UnicodeEncodeError:
        raise _request_error() from None
    if len(user_input) > MAX_USER_INPUT_CHARACTERS:
        raise _request_error()
    return user_input


def _request_body(
    provider: ProviderId,
    model: str,
    user_input: str,
    chunk_ids: list[str],
    *,
    schema: dict[str, Any] | None = None,
    instructions: str = INSTRUCTIONS,
    max_output_tokens: int = MAX_OUTPUT_TOKENS,
    schema_name: str = "grounded_answer",
) -> dict[str, Any]:
    schema = _answer_schema(chunk_ids) if schema is None else schema
    if provider == "anthropic":
        return {
            "model": model,
            "max_tokens": max_output_tokens,
            "system": instructions,
            "messages": [{"role": "user", "content": user_input}],
            "output_config": {"format": {"type": "json_schema", "schema": schema}},
        }
    if provider == "deepseek":
        instructions += (
            "\nThe JSON response must match this JSON schema: "
            + json.dumps(schema)
            + "\nExample insufficient-evidence JSON: "
            + json.dumps(
                {
                    "answer": "The selected evidence is insufficient.",
                    "supported": False,
                    "options" if schema_name == "grounded_options" else "citations": [],
                }
            )
        )
    body = {
        "model": model,
        "max_tokens": max_output_tokens,
        "messages": [
            {"role": "system", "content": instructions},
            {"role": "user", "content": user_input},
        ],
    }
    if provider == "deepseek":
        body["response_format"] = {"type": "json_object"}
        body["thinking"] = {"type": "disabled"}
    else:
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": schema_name, "strict": True, "schema": schema},
        }
    return body


async def _fetch_response(
    client: httpx.AsyncClient,
    *,
    provider: ProviderId,
    api_key: str,
    body: dict[str, Any],
    timeout_seconds: float,
) -> dict[str, Any]:
    request = client.build_request("POST", ENDPOINTS[provider], json=body, timeout=timeout_seconds)
    for header in _CREDENTIAL_HEADERS:
        request.headers.pop(header, None)
    if provider == "anthropic":
        request.headers["x-api-key"] = api_key
        request.headers["anthropic-version"] = "2023-06-01"
    else:
        request.headers["Authorization"] = f"Bearer {api_key}"
    response = await client.send(request, auth=None, follow_redirects=False, stream=True)
    try:
        if not response.is_success:
            raise _http_error(response.status_code, provider)
        content = bytearray()
        async for piece in response.aiter_bytes():
            if len(content) + len(piece) > MAX_RESPONSE_BYTES:
                raise _invalid_response()
            content.extend(piece)
    finally:
        await response.aclose()
    try:
        payload = json.loads(content)
    except (ValueError, UnicodeError):
        raise _invalid_response() from None
    if not isinstance(payload, dict) or payload.get("error") is not None:
        raise _invalid_response()
    return payload


def _completion_text(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or len(choices) != 1 or not isinstance(choices[0], dict):
        raise _invalid_response()
    choice = choices[0]
    message = choice.get("message")
    if choice.get("finish_reason") == "content_filter" or (
        isinstance(message, dict) and message.get("refusal")
    ):
        raise _refused()
    if (
        choice.get("finish_reason") != "stop"
        or not isinstance(message, dict)
        or message.get("role", "assistant") != "assistant"
        or message.get("tool_calls")
        or not isinstance(message.get("content"), str)
    ):
        raise _invalid_response()
    return message["content"]


def _message_text(payload: dict[str, Any]) -> str:
    if payload.get("stop_reason") == "refusal":
        raise _refused()
    blocks = payload.get("content")
    if (
        payload.get("type", "message") != "message"
        or payload.get("role", "assistant") != "assistant"
        or payload.get("stop_reason") != "end_turn"
        or not isinstance(blocks, list)
        or not blocks
    ):
        raise _invalid_response()
    texts = []
    for block in blocks:
        if isinstance(block, dict) and block.get("type") == "refusal":
            raise _refused()
        if (
            not isinstance(block, dict)
            or block.get("type") != "text"
            or not isinstance(block.get("text"), str)
        ):
            raise _invalid_response()
        texts.append(block["text"])
    return "".join(texts)


async def generate_answer(
    client: httpx.AsyncClient,
    *,
    provider: ProviderId,
    api_key: str,
    model: str,
    question: str,
    chunks: list[SourceChunk],
    timeout_seconds: float = 30.0,
    vertex: VertexSettings | None = None,
) -> DraftAnswer:
    if provider not in PROVIDER_DEFAULT_MODELS:
        raise _request_error()
    if provider == "vertex":
        from app.knowledge.vertex import generate_answer as vertex_answer

        if vertex is None:
            raise _request_error()
        return await vertex_answer(
            client,
            settings=vertex,
            model=model,
            question=question,
            chunks=chunks,
            timeout_seconds=timeout_seconds,
        )
    if provider == "openai":
        return await openai_client.generate_answer(
            client,
            api_key=api_key,
            model=model,
            question=question,
            chunks=chunks,
            timeout_seconds=timeout_seconds,
        )
    user_input = _input_json(api_key, model, question, chunks, timeout_seconds)
    if not chunks:
        return DraftAnswer(
            answer="There is not enough evidence in the selected sources to answer this question.",
            supported=False,
            citations=[],
        )
    body = _request_body(provider, model, user_input, [chunk.chunk_id for chunk in chunks])
    try:
        payload = await asyncio.wait_for(
            _fetch_response(
                client,
                provider=provider,
                api_key=api_key,
                body=body,
                timeout_seconds=timeout_seconds,
            ),
            timeout=timeout_seconds,
        )
    except (httpx.TimeoutException, TimeoutError):
        raise AIServiceError(504, "AI_TIMEOUT", "The AI service timed out. Try again.") from None
    except (httpx.HTTPError, OSError):
        raise AIServiceError(
            503, "AI_UNAVAILABLE", "The AI service is unavailable. Try again later."
        ) from None
    text = _message_text(payload) if provider == "anthropic" else _completion_text(payload)
    return validate_draft_answer(text, chunks)
