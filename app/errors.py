import logging

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.schemas import APIError, ErrorDetail, ErrorEnvelope

logger = logging.getLogger(__name__)


def error_response(status: int, code: str, message: str, details=None) -> JSONResponse:
    body = ErrorEnvelope(error=APIError(code=code, message=message, details=details or []))
    return JSONResponse(status_code=status, content=body.model_dump(mode="json"))


async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    details = [
        ErrorDetail(field=".".join(str(part) for part in item["loc"]), message=item["msg"])
        for item in exc.errors()
    ]
    return error_response(422, "VALIDATION_ERROR", "Please check your request.", details)


async def http_error_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    codes = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED", 501: "NOT_IMPLEMENTED"}
    response = error_response(
        exc.status_code, codes.get(exc.status_code, "HTTP_ERROR"), str(exc.detail)
    )
    if exc.headers:
        response.headers.update(exc.headers)
    return response


async def unexpected_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled request error", exc_info=(type(exc), exc, exc.__traceback__))
    return error_response(500, "INTERNAL_ERROR", "An unexpected error occurred. Please retry.")
