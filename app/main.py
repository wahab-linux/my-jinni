import json

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from app import __version__
from app.errors import (
    error_response,
    http_error_handler,
    unexpected_error_handler,
    validation_error_handler,
)
from app.scenario import (
    DEMO_DATE,
    MAX_BUDGET_PENCE,
    ORIGINS,
    SUPPORTED_DATES,
    TIMEZONE,
    validate_scenario,
)
from app.schemas import (
    Envelope,
    ErrorEnvelope,
    Health,
    InterestOption,
    Options,
    OriginOption,
    RecommendationEnvelope,
    RecommendationRequest,
)
from app.settings import WEB_DIR
from app.sources.mock_api import router as mock_router

ERROR_RESPONSES = {
    422: {"model": ErrorEnvelope, "description": "Invalid input"},
    500: {"model": ErrorEnvelope, "description": "Unexpected server error"},
}


def read_example(name: str) -> dict:
    return json.loads((WEB_DIR / "fixtures" / name).read_text(encoding="utf-8"))


def create_app() -> FastAPI:
    app = FastAPI(
        title="AfterClass API",
        version=__version__,
        description=(
            "Contract v0.2: activity decisions for anyone; students are the first experience. "
            "The recommendation engine remains a 501 scaffold. All source data are simulated."
        ),
        responses=ERROR_RESPONSES,
    )
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(HTTPException, http_error_handler)
    app.add_exception_handler(Exception, unexpected_error_handler)

    @app.get("/health", response_model=Envelope[Health], tags=["Status"])
    def health() -> Envelope[Health]:
        return Envelope(data=Health(status="ok", version=__version__, recommendations_ready=False))

    @app.get("/api/v1/options", response_model=Envelope[Options], tags=["Application"])
    def options() -> Envelope[Options]:
        return Envelope(
            data=Options(
                demo_date=DEMO_DATE,
                timezone=TIMEZONE,
                supported_dates=list(SUPPORTED_DATES),
                origins=[OriginOption(id=origin.id, label=origin.label) for origin in ORIGINS],
                max_budget_pence=MAX_BUDGET_PENCE,
                currency="GBP",
                interests=[
                    InterestOption(id=key, label=label)
                    for key, label in (
                        ("games", "Games"),
                        ("music", "Music"),
                        ("arts", "Arts"),
                        ("sport", "Sport"),
                        ("learning", "Learning"),
                    )
                ],
                default_request=RecommendationRequest.model_validate(
                    read_example("recommendation-request.json")
                ),
                is_simulated=True,
            )
        )

    @app.post(
        "/api/v1/recommendations",
        response_model=RecommendationEnvelope,
        tags=["Application"],
        responses={
            200: {
                "description": "Calculated recommendation, or a successful search with no match",
                "content": {
                    "application/json": {
                        "examples": {
                            "match": {"value": read_example("recommendation-success.json")},
                            "no_match": {"value": read_example("recommendation-empty.json")},
                        }
                    }
                },
            },
            501: {"model": ErrorEnvelope, "description": "Scaffold: engine not implemented yet"},
            502: {"model": ErrorEnvelope, "description": "A source returned invalid data"},
            503: {"model": ErrorEnvelope, "description": "A required source is unavailable"},
        },
    )
    def recommendations(
        preferences: RecommendationRequest,
    ) -> RecommendationEnvelope | JSONResponse:
        details = validate_scenario(preferences)
        if details:
            return error_response(422, "VALIDATION_ERROR", "Please check your request.", details)
        raise HTTPException(
            status_code=501,
            detail="The decision engine is not implemented. Frontend fixtures are in /fixtures/.",
        )

    app.include_router(mock_router)

    @app.get("/", include_in_schema=False)
    def home() -> FileResponse:
        return FileResponse(WEB_DIR / "index.html")

    app.mount("/fixtures", StaticFiles(directory=WEB_DIR / "fixtures"), name="fixtures")
    app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
    return app


app = create_app()
