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


class VertexSettings(Model):
    project_id: Annotated[str, Field(pattern=r"^[a-z][a-z0-9-]{4,28}[a-z0-9]$")]
    location: Annotated[str, Field(pattern=r"^(global|[a-z]+-[a-z]+[0-9])$")] = "global"


class VertexStatus(Model):
    configured: bool
    project_id: str
    location: str
    message: str


class ChatRequest(Model):
    intent: Literal["answer", "options"] = "answer"
    question: Annotated[str, Field(min_length=1, max_length=2000)]
    provider: ProviderId = "openai"
    source_ids: Annotated[list[SourceId], Field(max_length=MAX_SOURCES)] = []
    model: Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9._:-]+$")] = (
        DEFAULT_MODEL
    )
    preferences: RecommendationRequest | None = None
    decision_request: DecisionRequest | None = None
    vertex: VertexSettings | None = None

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
        if self.provider == "vertex" and self.vertex is None:
            raise ValueError("Enter your Google Cloud project ID and location for Vertex AI")
        if self.provider != "vertex" and self.vertex is not None:
            raise ValueError("Google Cloud settings apply only to the Vertex AI provider")
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


OptionText = Annotated[str, Field(min_length=1, max_length=400)]
OptionId = Annotated[str, Field(max_length=60, pattern=r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")]


class DraftAIOption(Model):
    id: OptionId
    title: Annotated[str, Field(min_length=1, max_length=200)]
    summary: Annotated[str, Field(min_length=1, max_length=1200)]
    trade_offs: Annotated[list[OptionText], Field(max_length=3)]
    missing_information: Annotated[list[OptionText], Field(max_length=3)]
    citations: Annotated[list[DraftCitation], Field(min_length=1, max_length=4)]

    @model_validator(mode="after")
    def require_visible_text(self) -> "DraftAIOption":
        if any(
            not text.strip()
            for text in [self.title, self.summary, *self.trade_offs, *self.missing_information]
        ):
            raise ValueError("Option descriptions must not be blank")
        return self


class DraftOptions(Model):
    answer: Annotated[str, Field(min_length=1, max_length=2000)]
    supported: StrictBool
    options: Annotated[list[DraftAIOption], Field(max_length=3)]

    @model_validator(mode="after")
    def require_grounded_choices(self) -> "DraftOptions":
        if not self.answer.strip():
            raise ValueError("The overview must not be blank")
        if (self.supported and not 2 <= len(self.options) <= 3) or (
            not self.supported and self.options
        ):
            raise ValueError("Return two or three supported options, or no unsupported options")
        if len({option.id for option in self.options}) != len(self.options):
            raise ValueError("Option IDs must be unique")
        return self


class Citation(Model):
    chunk_id: str
    source_id: SourceId
    source_title: str
    page: int | None
    quote: str
    is_simulated: bool


class AIOption(Model):
    id: OptionId
    title: Annotated[str, Field(min_length=1, max_length=200)]
    summary: Annotated[str, Field(min_length=1, max_length=1200)]
    trade_offs: Annotated[list[OptionText], Field(max_length=3)]
    missing_information: Annotated[list[OptionText], Field(max_length=3)]
    citations: Annotated[list[Citation], Field(min_length=1, max_length=4)]


class ChatData(Model):
    answer: str
    provider: ProviderId = "openai"
    status: Literal["answered", "insufficient_evidence"]
    citations: list[Citation]
    model: str | None
    used_source_ids: list[str]
    planner: RecommendationData | None = None
    decision: DecisionResult | None = None
    options: list[AIOption] = Field(default_factory=list, max_length=3)
