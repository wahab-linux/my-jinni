"""Google Vertex AI with backend-only ADC; no renderer tokens, key files or arbitrary URLs."""

import asyncio
import json
import re

import google.auth
import httpx
import requests
from google.auth.exceptions import TransportError
from google.auth.transport.requests import Request

from app.knowledge.openai_client import (
    INSTRUCTIONS,
    MAX_OUTPUT_TOKENS,
    MAX_RESPONSE_BYTES,
    AIServiceError,
    _answer_schema,
    validate_draft_answer,
)
from app.knowledge.schemas import DraftAnswer, SourceChunk, VertexSettings

SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]
ADC_HELP = (
    "Google sign-in was not found or has expired. "
    "Run gcloud auth application-default login, then check again."
)


class BoundedRequest(Request):
    def __call__(self, *args, **kwargs):
        kwargs["timeout"] = 8
        return super().__call__(*args, **kwargs)


def _refresh_adc(project_id: str) -> str:
    try:
        with requests.Session() as session:
            session.trust_env = False
            transport = BoundedRequest(session=session)
            credentials, _ = google.auth.default(
                scopes=SCOPES, request=transport, quota_project_id=project_id
            )
            if not credentials.valid:
                credentials.refresh(transport)
            token = credentials.token
            if (
                not isinstance(token, str)
                or not token
                or any(ord(c) <= 32 or ord(c) > 126 for c in token)
            ):
                raise ValueError("Invalid token")
            return token
    except (requests.RequestException, TransportError):
        raise AIServiceError(
            503, "AI_UNAVAILABLE", "Google sign-in could not be reached. Check your connection."
        ) from None
    except Exception:
        # Google exceptions may contain local paths, token responses or credential details.
        raise AIServiceError(401, "ADC_AUTH_ERROR", ADC_HELP) from None


async def load_adc_token(project_id: str) -> str:
    try:
        return await asyncio.wait_for(asyncio.to_thread(_refresh_adc, project_id), timeout=15)
    except TimeoutError:
        raise AIServiceError(
            504, "AI_TIMEOUT", "Google sign-in timed out. Check your connection and try again."
        ) from None


def endpoint(settings: VertexSettings, model: str) -> str:
    if re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}", model) is None:
        raise AIServiceError(
            422, "AI_REQUEST_ERROR", "Use a Gemini model ID available in Vertex AI Studio."
        )
    host = (
        "aiplatform.googleapis.com"
        if settings.location == "global"
        else f"{settings.location}-aiplatform.googleapis.com"
    )
    return f"https://{host}/v1/projects/{settings.project_id}/locations/{settings.location}/publishers/google/models/{model}:generateContent"


def response_schema(value):
    if isinstance(value, list):
        return [response_schema(item) for item in value]
    if not isinstance(value, dict):
        return value
    return {
        key: child.upper() if key == "type" else response_schema(child)
        for key, child in value.items()
        if key != "additionalProperties"
    }


async def generate_answer(
    client: httpx.AsyncClient,
    *,
    settings: VertexSettings,
    model: str,
    question: str,
    chunks: list[SourceChunk],
    timeout_seconds: float = 30,
) -> DraftAnswer:
    # Reuse the same evidence limits as the API-key adapters; the marker is not a credential.
    from app.knowledge.providers import _input_json

    url = endpoint(settings, model)
    user_input = _input_json("adc-validation-marker", model, question, chunks, timeout_seconds)
    if not chunks:
        return DraftAnswer(
            answer="The selected evidence is insufficient.", supported=False, citations=[]
        )

    async def exchange():
        token = await load_adc_token(settings.project_id)
        body = {
            "systemInstruction": {"parts": [{"text": INSTRUCTIONS}]},
            "contents": [{"role": "user", "parts": [{"text": user_input}]}],
            "generationConfig": {
                "maxOutputTokens": MAX_OUTPUT_TOKENS,
                "candidateCount": 1,
                "responseMimeType": "application/json",
                "responseSchema": response_schema(
                    _answer_schema([chunk.chunk_id for chunk in chunks])
                ),
            },
        }
        request = client.build_request("POST", url, json=body, timeout=timeout_seconds)
        for name in (
            "authorization",
            "x-api-key",
            "x-goog-api-key",
            "x-ai-api-key",
            "x-openai-api-key",
            "cookie",
            "x-goog-user-project",
        ):
            request.headers.pop(name, None)
        request.headers["Authorization"] = f"Bearer {token}"
        request.headers["x-goog-user-project"] = settings.project_id
        response = await client.send(request, auth=None, follow_redirects=False, stream=True)
        try:
            if response.status_code in (401, 403):
                raise AIServiceError(
                    response.status_code,
                    "ADC_AUTH_ERROR",
                    "Google denied access. Check your sign-in, Vertex AI permissions, "
                    "enabled API and project billing.",
                )
            if response.status_code == 429:
                raise AIServiceError(
                    429,
                    "AI_RATE_LIMITED",
                    "Google project quota or capacity was exceeded. "
                    "Check Vertex AI quotas and trial eligibility.",
                )
            if response.status_code in (400, 404, 422):
                raise AIServiceError(
                    422,
                    "AI_REQUEST_ERROR",
                    "Check the Google project, location and model in Vertex AI Studio. "
                    "Model availability depends on your account.",
                )
            if not response.is_success:
                raise AIServiceError(
                    503, "AI_UNAVAILABLE", "Vertex AI is unavailable. Try again later."
                )
            content = bytearray()
            async for part in response.aiter_bytes():
                if len(content) + len(part) > MAX_RESPONSE_BYTES:
                    raise ValueError("Oversized response")
                content.extend(part)
        finally:
            await response.aclose()
        payload = json.loads(content)
        if not isinstance(payload, dict) or payload.get("error"):
            raise ValueError("Invalid response")
        if payload.get("promptFeedback", {}).get("blockReason"):
            raise AIServiceError(502, "AI_REFUSED", "Google could not answer this request.")
        candidates = payload.get("candidates")
        if not isinstance(candidates, list) or len(candidates) != 1:
            raise ValueError("Missing answer")
        candidate = candidates[0]
        if candidate.get("finishReason") in (
            "SAFETY",
            "RECITATION",
            "BLOCKLIST",
            "PROHIBITED_CONTENT",
            "SPII",
        ):
            raise AIServiceError(502, "AI_REFUSED", "Google could not answer this request.")
        if candidate.get("finishReason") != "STOP":
            raise ValueError("Incomplete answer")
        parts = candidate["content"]["parts"]
        if not isinstance(parts, list) or not parts:
            raise ValueError("Missing text")
        texts = []
        for part in parts:
            if (
                not isinstance(part, dict)
                or not isinstance(part.get("text"), str)
                or any(key in part for key in ("functionCall", "functionResponse"))
            ):
                raise ValueError("Unexpected content")
            if not part.get("thought", False):
                texts.append(part["text"])
        return validate_draft_answer("".join(texts), chunks)

    try:
        return await asyncio.wait_for(exchange(), timeout=timeout_seconds)
    except AIServiceError:
        raise
    except (httpx.TimeoutException, TimeoutError):
        raise AIServiceError(504, "AI_TIMEOUT", "Vertex AI timed out. Try again.") from None
    except (httpx.HTTPError, OSError):
        raise AIServiceError(
            503, "AI_UNAVAILABLE", "Vertex AI could not be reached. Check your connection."
        ) from None
    except (ValueError, KeyError, TypeError, AttributeError):
        raise AIServiceError(
            502, "INVALID_AI_RESPONSE", "Google returned an invalid or incomplete answer."
        ) from None
