from typing import Annotated, Any, Literal

from pydantic import AwareDatetime, Field, StrictBool, field_validator, model_validator

from app.comparison.schemas import DecisionRequest, DecisionResult
from app.knowledge.provider_catalog import PROVIDER_CATALOG, PROVIDER_DEFAULT_MODELS, ProviderId
from app.schemas import Model, RecommendationData, RecommendationRequest

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_SOURCE_CHARACTERS = 150_000
MAX_PDF_PAGES = 40
MAX_SOURCES = 20
MAX_RETRIEVED_CHUNKS = 6
DEFAULT_MODEL = "gpt-4.1-mini"
SourceId = Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")]
SourceKind = Literal["text", "markdown", "pdf", "planner"]


class LibrarySource(Model):
    id: SourceId
    title: str
    kind: SourceKind
    filename: str | None
    created_at: AwareDatetime
    chunk_count: Annotated[int, Field(ge=1)]
    character_count: Annotated[int, Field(ge=1)]
    is_simulated: bool = False


class SourceChunk(Model):
    chunk_id: str
    source_id: SourceId
    source_title: str
    page: Annotated[int, Field(ge=1)] | None
    index: Annotated[int, Field(ge=0)]
    text: str
    is_simulated: bool = False


class SourceDetail(Model):
    source: LibrarySource
    chunks: list[SourceChunk]


class AIProvider(Model):
    id: ProviderId
    label: str
    default_model: str


class SourceList(Model):
    sources: list[LibrarySource]
    max_sources: int = MAX_SOURCES
    max_upload_bytes: int = MAX_UPLOAD_BYTES
    max_source_characters: int = MAX_SOURCE_CHARACTERS
    max_pdf_pages: int = MAX_PDF_PAGES
    supported_extensions: list[str] = [".txt", ".md", ".pdf"]
    provider: Literal["openai"] = "openai"
    default_model: str = DEFAULT_MODEL
    providers: list[AIProvider] = Field(
        default_factory=lambda: [AIProvider(**provider) for provider in PROVIDER_CATALOG]
    )
    storage: Literal["local"] = "local"
    retrieval: Literal["lexical"] = "lexical"
    cloud_notice: str = (
        "Questions and selected evidence snippets are sent to your selected AI provider."
    )


class TextSourceRequest(Model):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    text: Annotated[str, Field(min_length=1, max_length=MAX_SOURCE_CHARACTERS)]
    is_simulated: StrictBool = False

    @field_validator("title", "text")
    @classmethod
    def require_nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Text must not be blank")
        if "\x00" in value:
            raise ValueError("Text must not contain null characters")
        try:
            value.encode("utf-8")
        except UnicodeEncodeError:
            raise ValueError("Text must be valid Unicode") from None
        return value


class SourceDeleted(Model):
    source_id: SourceId
    deleted: Literal[True] = True


class ChatRequest(Model):
    question: Annotated[str, Field(min_length=1, max_length=2000)]
    provider: ProviderId = "openai"
    source_ids: Annotated[list[SourceId], Field(max_length=MAX_SOURCES)] = []
    model: Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9._:-]+$")] = (
        DEFAULT_MODEL
    )
    preferences: RecommendationRequest | None = None
    decision_request: DecisionRequest | None = None

    @model_validator(mode="before")
    @classmethod
    def choose_default_model(cls, value: Any) -> Any:
        if isinstance(value, dict) and "model" not in value:
            provider = value.get("provider", "openai")
            if isinstance(provider, str) and provider in PROVIDER_DEFAULT_MODELS:
                return {**value, "model": PROVIDER_DEFAULT_MODELS[provider]}
        return value

    @model_validator(mode="after")
    def validate_question_and_selection(self) -> "ChatRequest":
        if not self.question.strip():
            raise ValueError("Question must not be blank")
        try:
            self.question.encode("utf-8")
        except UnicodeEncodeError:
            raise ValueError("Question must be valid Unicode") from None
        if len(self.source_ids) != len(set(self.source_ids)):
            raise ValueError("source_ids must not contain duplicates")
        if not self.source_ids and self.preferences is None and self.decision_request is None:
            raise ValueError("Select a source or provide a decision or activity preferences")
        return self


class DraftCitation(Model):
    chunk_id: Annotated[str, Field(min_length=1, max_length=150)]
    quote: Annotated[str, Field(min_length=1, max_length=1200)]


class DraftAnswer(Model):
    answer: Annotated[str, Field(min_length=1, max_length=12000)]
    supported: StrictBool
    citations: Annotated[list[DraftCitation], Field(max_length=12)]


class Citation(Model):
    chunk_id: str
    source_id: SourceId
    source_title: str
    page: int | None
    quote: str
    is_simulated: bool


class ChatData(Model):
    answer: str
    provider: ProviderId = "openai"
    status: Literal["answered", "insufficient_evidence"]
    citations: list[Citation]
    model: str | None
    used_source_ids: list[str]
    planner: RecommendationData | None = None
    decision: DecisionResult | None = None
