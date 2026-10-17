import json
from collections.abc import AsyncIterator
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, File, Form, Header, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import SecretStr
from starlette.concurrency import run_in_threadpool

from app.errors import error_response
from app.knowledge.ingestion import IngestionError, extract_upload
from app.knowledge.openai_client import AIServiceError, generate_answer
from app.knowledge.schemas import (
    MAX_RETRIEVED_CHUNKS,
    MAX_UPLOAD_BYTES,
    ChatData,
    ChatRequest,
    Citation,
    LibrarySource,
    SourceChunk,
    SourceDeleted,
    SourceDetail,
    SourceList,
    TextSourceRequest,
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
    async with httpx.AsyncClient(transport=transport, base_url="http://planscope.local") as client:
        response = await client.post(
            "/api/v1/recommendations", json=body.preferences.model_dump(mode="json")
        )
    if response.status_code != 200:
        return None, [], JSONResponse(status_code=response.status_code, content=response.json())
    result = Envelope[RecommendationData].model_validate(response.json())
    return result.data, result.warnings, None


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
            (401, "OpenAI key missing or access denied"),
            (404, "Selected source not found"),
            (429, "OpenAI quota or rate limit"),
            (502, "Invalid or refused AI response"),
            (503, "OpenAI unavailable"),
            (504, "OpenAI generation timed out"),
        )
    },
)
async def chat(
    body: ChatRequest,
    request: Request,
    store: Store,
    ai_client: AIClient,
    api_key: Annotated[SecretStr | None, Header(alias="X-OpenAI-API-Key")] = None,
) -> Envelope[ChatData] | JSONResponse:
    for source_id in body.source_ids:
        if await run_in_threadpool(store.get_source, source_id) is None:
            return error_response(404, "NOT_FOUND", "A selected source no longer exists.")
    planner, warnings, failure = await calculated_plan(request, body)
    if failure is not None:
        return failure
    limit = MAX_RETRIEVED_CHUNKS - (1 if planner is not None else 0)
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
    used_sources = list(dict.fromkeys(chunk.source_id for chunk in chunks))
    if not chunks:
        return Envelope(
            data=ChatData(
                answer="The selected sources do not contain matching evidence for this question.",
                status="insufficient_evidence",
                citations=[],
                model=None,
                used_source_ids=[],
                planner=planner,
            ),
            warnings=warnings,
        )
    key = api_key.get_secret_value() if api_key is not None else ""
    if not key or len(key) > 1024 or not key.isascii() or any(ord(char) <= 32 for char in key):
        return error_response(
            401, "AI_AUTH_ERROR", "Enter a valid OpenAI API key in session settings."
        )
    try:
        draft = await generate_answer(
            ai_client, api_key=key, model=body.model, question=body.question, chunks=chunks
        )
        citations = checked_citations(draft, chunks) if draft.supported else []
    except AIServiceError as exc:
        return error_response(exc.status_code, exc.code, exc.message)
    return Envelope(
        data=ChatData(
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
        ),
        warnings=warnings,
    )
