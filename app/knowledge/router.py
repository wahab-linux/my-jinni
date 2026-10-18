import json
from collections.abc import AsyncIterator
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, File, Form, Header, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import SecretStr
from starlette.concurrency import run_in_threadpool

from app.comparison.schemas import DecisionRequest, DecisionResult
from app.errors import error_response
from app.knowledge.ingestion import IngestionError, extract_upload
from app.knowledge.openai_client import MAX_CHUNK_CHARACTERS, AIServiceError
from app.knowledge.options import generate_options
from app.knowledge.providers import generate_answer
from app.knowledge.schemas import (
    MAX_RETRIEVED_CHUNKS,
    MAX_UPLOAD_BYTES,
    AIOption,
    ChatData,
    ChatRequest,
    Citation,
    LibrarySource,
    SourceChunk,
    SourceDeleted,
    SourceDetail,
    SourceList,
    TextSourceRequest,
    VertexSettings,
    VertexStatus,
)
from app.knowledge.storage import KnowledgeStore, LibraryLimitError
from app.schemas import APIWarning, Envelope, ErrorEnvelope, RecommendationData
from app.settings import library_database_path

router = APIRouter(prefix="/api/v1", tags=["Source library and AI"])


def get_store() -> KnowledgeStore:
    return KnowledgeStore(library_database_path())


async def get_ai_client() -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(timeout=30.0, trust_env=False, follow_redirects=False) as client:
        yield client


Store = Annotated[KnowledgeStore, Depends(get_store)]
AIClient = Annotated[httpx.AsyncClient, Depends(get_ai_client)]


@router.post(
    "/ai/vertex/check",
    response_model=Envelope[VertexStatus],
    responses={
        401: {"model": ErrorEnvelope},
        503: {"model": ErrorEnvelope},
        504: {"model": ErrorEnvelope},
    },
)
async def check_vertex(settings: VertexSettings):
    from app.knowledge.vertex import load_adc_token

    try:
        await load_adc_token(settings.project_id)
    except AIServiceError as exc:
        return error_response(exc.status_code, exc.code, exc.message)
    return Envelope(
        data=VertexStatus(
            configured=True,
            project_id=settings.project_id,
            location=settings.location,
            message=(
                "Google sign-in works. Project permissions, model access and billing "
                "are checked when you ask a question."
            ),
        )
    )


@router.get("/sources", response_model=Envelope[SourceList])
def list_sources(store: Store) -> Envelope[SourceList]:
    return Envelope(data=SourceList(sources=store.list_sources()))


@router.post("/sources", status_code=201, response_model=Envelope[LibrarySource])
def add_text_source(
    body: TextSourceRequest, store: Store
) -> Envelope[LibrarySource] | JSONResponse:
    try:
        source = store.add_source(
            title=body.title,
            kind="text",
            filename=None,
            pages=[(None, body.text)],
            is_simulated=body.is_simulated,
        )
    except LibraryLimitError:
        return error_response(422, "LIBRARY_LIMIT", "Remove a source before adding another.")
    except ValueError:
        return error_response(
            422, "INVALID_DOCUMENT", "The source contains invalid text or metadata."
        )
    return Envelope(data=source)


@router.post(
    "/sources/upload",
    status_code=201,
    response_model=Envelope[LibrarySource],
    responses={
        413: {"model": ErrorEnvelope, "description": "Document exceeds import limits"},
        415: {"model": ErrorEnvelope, "description": "Unsupported document type"},
    },
)
async def upload_source(
    store: Store,
    file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form(min_length=1, max_length=200)] = None,
    is_simulated: Annotated[bool, Form()] = False,
) -> Envelope[LibrarySource] | JSONResponse:
    try:
        content = await file.read(MAX_UPLOAD_BYTES + 1)
        kind, pages = await run_in_threadpool(extract_upload, file.filename or "", content)
        safe_filename = (file.filename or "source").replace("\\", "/").rsplit("/", 1)[-1]
        source_title = title if title is not None else safe_filename[:200]
        if not source_title.strip():
            return error_response(422, "VALIDATION_ERROR", "Source title must not be blank.")
        source = await run_in_threadpool(
            store.add_source,
            title=source_title,
            kind=kind,
            filename=safe_filename,
            pages=pages,
            is_simulated=is_simulated,
        )
        return Envelope(data=source)
    except IngestionError as exc:
        return error_response(exc.status_code, exc.code, str(exc))
    except LibraryLimitError:
        return error_response(422, "LIBRARY_LIMIT", "Remove a source before adding another.")
    except ValueError:
        return error_response(
            422, "INVALID_DOCUMENT", "The source contains invalid text or metadata."
        )
    finally:
        await file.close()


@router.get(
    "/sources/{source_id}",
    response_model=Envelope[SourceDetail],
    responses={404: {"model": ErrorEnvelope, "description": "Source not found"}},
)
def get_source(source_id: str, store: Store) -> Envelope[SourceDetail] | JSONResponse:
    source = store.get_source(source_id)
    if source is None:
        return error_response(404, "NOT_FOUND", "The selected source no longer exists.")
    return Envelope(data=source)


@router.delete("/sources/{source_id}", response_model=Envelope[SourceDeleted])
def delete_source(source_id: str, store: Store) -> Envelope[SourceDeleted] | JSONResponse:
    if not store.delete_source(source_id):
        return error_response(404, "NOT_FOUND", "The selected source no longer exists.")
    return Envelope(data=SourceDeleted(source_id=source_id))


async def calculated_plan(
    request: Request, body: ChatRequest
) -> tuple[RecommendationData | None, list[APIWarning], JSONResponse | None]:
    if body.preferences is None:
        return None, [], None
    transport = httpx.ASGITransport(app=request.app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://my-jinni.local") as client:
        response = await client.post(
            "/api/v1/recommendations", json=body.preferences.model_dump(mode="json")
        )
    if response.status_code != 200:
        return None, [], JSONResponse(status_code=response.status_code, content=response.json())
    result = Envelope[RecommendationData].model_validate(response.json())
    return result.data, result.warnings, None


async def calculated_decision(
    request: Request, body: ChatRequest
) -> tuple[DecisionResult | None, list[APIWarning], JSONResponse | None]:
    if body.decision_request is None:
        return None, [], None
    transport = httpx.ASGITransport(app=request.app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://my-jinni.local") as client:
        response = await client.post(
            "/api/v1/decisions/evaluate", json=body.decision_request.model_dump(mode="json")
        )
    if response.status_code != 200:
        return None, [], JSONResponse(status_code=response.status_code, content=response.json())
    result = Envelope[DecisionResult].model_validate(response.json())
    return result.data, result.warnings, None


def decision_evidence(decision: DecisionResult, request: DecisionRequest) -> str:
    def brief(option):
        if option is None:
            return None
        return {
            "id": option.id,
            "name": option.name,
            "score": option.score,
            "metrics": option.metrics,
            "contributions": [part.model_dump(mode="json") for part in option.contributions],
        }

    summary = {
        "scenario_id": decision.scenario_id,
        "title": decision.title,
        "method": decision.method,
        "is_simulated": decision.is_simulated,
        "criteria": [
            {
                "id": criterion.id,
                "label": criterion.label,
                "unit": criterion.unit,
                "direction": criterion.direction,
                "weight": request.weights.get(criterion.id, criterion.default_weight),
            }
            for criterion in decision.criteria
        ],
        "limits": [constraint.model_dump(mode="json") for constraint in request.constraints],
        "recommended": brief(decision.recommended),
        "alternatives": [brief(option) for option in decision.ranked[1:3]],
        "ranked_count": len(decision.ranked),
        "excluded_count": len(decision.excluded),
        "excluded": [option.model_dump(mode="json") for option in decision.excluded[:5]],
        "sources": [source.model_dump(mode="json") for source in decision.sources],
        "limitations": decision.limitations,
        "omitted": {},
        "note": (
            "Computed preference-fit scores are relative, not probabilities or predictions. "
            "Read metric and limit units from criteria. Money in pence is GBP: 100 pence = £1.00. "
            "Importance weights are points, not money, time or percentages. "
            "Only the displayed option details are supplied; do not invent omitted details."
        ),
    }

    def encode():
        summary["omitted"] = {
            "alternatives": max(0, len(decision.ranked) - 1 - len(summary["alternatives"])),
            "excluded": len(decision.excluded) - len(summary["excluded"]),
            "contributions": bool(
                decision.recommended
                and decision.recommended.contributions
                and not summary["recommended"]["contributions"]
            ),
        }
        return json.dumps(summary, ensure_ascii=False, separators=(",", ":"))

    text = encode()
    for key in ("excluded", "alternatives"):
        while len(text) > MAX_CHUNK_CHARACTERS and summary[key]:
            summary[key].pop()
            text = encode()
    if len(text) > MAX_CHUNK_CHARACTERS and summary["recommended"]:
        summary["recommended"]["contributions"] = []
        text = encode()
    if len(text) > MAX_CHUNK_CHARACTERS:
        # Keep IDs, units, priorities, limits and actual measures; never cut JSON/quotes.
        for criterion in summary["criteria"]:
            criterion.pop("label")
        summary["limitations"] = ["See the returned comparison for full domain limitations."]
        text = encode()
    return text


def checked_citations(draft, chunks: list[SourceChunk]) -> list[Citation]:
    evidence = {chunk.chunk_id: chunk for chunk in chunks}
    citations = []
    seen: set[tuple[str, str]] = set()
    for reference in draft.citations:
        chunk = evidence.get(reference.chunk_id)
        if chunk is None or not reference.quote.strip() or reference.quote not in chunk.text:
            raise AIServiceError(502, "INVALID_AI_RESPONSE", "The AI returned an invalid citation.")
        identity = (reference.chunk_id, reference.quote)
        if identity in seen:
            continue
        seen.add(identity)
        citations.append(
            Citation(
                chunk_id=chunk.chunk_id,
                source_id=chunk.source_id,
                source_title=chunk.source_title,
                page=chunk.page,
                quote=reference.quote,
                is_simulated=chunk.is_simulated,
            )
        )
    if not citations:
        raise AIServiceError(502, "INVALID_AI_RESPONSE", "The AI returned no supporting citations.")
    return citations


@router.post(
    "/chat",
    response_model=Envelope[ChatData],
    responses={
        status: {"model": ErrorEnvelope, "description": description}
        for status, description in (
            (401, "AI provider key missing or access denied"),
            (403, "Google project access denied"),
            (404, "Selected source not found"),
            (429, "AI provider quota or rate limit"),
            (502, "Invalid or refused AI response"),
            (503, "AI provider unavailable"),
            (504, "AI generation timed out"),
        )
    },
)
async def chat(
    body: ChatRequest,
    request: Request,
    store: Store,
    ai_client: AIClient,
    api_key: Annotated[SecretStr | None, Header(alias="X-OpenAI-API-Key")] = None,
    provider_api_key: Annotated[SecretStr | None, Header(alias="X-AI-API-Key")] = None,
) -> Envelope[ChatData] | JSONResponse:
    if api_key is not None and provider_api_key is not None:
        return error_response(422, "VALIDATION_ERROR", "Supply only one API key header.")
    if body.provider == "vertex" and (api_key is not None or provider_api_key is not None):
        return error_response(
            422, "VALIDATION_ERROR", "Vertex AI uses Google sign-in (ADC), not an API key header."
        )
    for source_id in body.source_ids:
        if await run_in_threadpool(store.get_source, source_id) is None:
            return error_response(404, "NOT_FOUND", "A selected source no longer exists.")
    planner, warnings, failure = await calculated_plan(request, body)
    if failure is not None:
        return failure
    decision, decision_warnings, failure = await calculated_decision(request, body)
    if failure is not None:
        return failure
    warnings.extend(decision_warnings)
    limit = MAX_RETRIEVED_CHUNKS - int(planner is not None) - int(decision is not None)
    chunks = await run_in_threadpool(store.search, body.question, body.source_ids, limit)
    if planner is not None:
        chunks.insert(
            0,
            SourceChunk(
                chunk_id="planner-context",
                source_id="planner-context",
                source_title="Calculated activity plan",
                page=None,
                index=0,
                text=json.dumps(planner.model_dump(mode="json"), ensure_ascii=False),
                is_simulated=True,
            ),
        )
    if decision is not None:
        chunks.insert(
            0,
            SourceChunk(
                chunk_id="decision-context",
                source_id="decision-context",
                source_title="Calculated option comparison",
                page=None,
                index=0,
                text=decision_evidence(decision, body.decision_request),
                is_simulated=decision.is_simulated,
            ),
        )
    used_sources = list(dict.fromkeys(chunk.source_id for chunk in chunks))
    if not chunks:
        return Envelope(
            data=ChatData(
                answer="The selected sources do not contain matching evidence for this question.",
                provider=body.provider,
                status="insufficient_evidence",
                citations=[],
                model=None,
                used_source_ids=[],
                planner=planner,
                decision=decision,
            ),
            warnings=warnings,
        )
    selected_key = provider_api_key or (api_key if body.provider == "openai" else None)
    key = selected_key.get_secret_value() if selected_key is not None else ""
    if body.provider != "vertex" and (
        not key or len(key) > 1024 or not key.isascii() or any(ord(char) <= 32 for char in key)
    ):
        return error_response(
            401,
            "AI_AUTH_ERROR",
            "Enter a valid key for the selected AI provider in session settings.",
        )
    try:
        generator = generate_options if body.intent == "options" else generate_answer
        draft = await generator(
            ai_client,
            provider=body.provider,
            api_key=key,
            model=body.model,
            question=body.question,
            chunks=chunks,
            **({"vertex": body.vertex} if body.provider == "vertex" else {}),
        )
        options = []
        if body.intent == "options":
            for option in draft.options:
                options.append(
                    AIOption(
                        **option.model_dump(exclude={"citations"}),
                        citations=checked_citations(option, chunks),
                    )
                )
            citations = list(
                {
                    (citation.chunk_id, citation.quote): citation
                    for option in options
                    for citation in option.citations
                }.values()
            )
        else:
            citations = checked_citations(draft, chunks) if draft.supported else []
    except AIServiceError as exc:
        return error_response(exc.status_code, exc.code, exc.message)
    return Envelope(
        data=ChatData(
            provider=body.provider,
            answer=(
                draft.answer
                if draft.supported
                else "The selected evidence is insufficient to answer this question reliably."
            ),
            status="answered" if draft.supported else "insufficient_evidence",
            citations=citations,
            model=body.model,
            used_source_ids=used_sources,
            planner=planner,
            decision=decision,
            options=options,
        ),
        warnings=warnings,
    )
