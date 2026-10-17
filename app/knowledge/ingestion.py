from io import BytesIO

from pypdf import PdfReader, apply_configuration
from pypdf.errors import LimitReachedError

from app.knowledge.schemas import MAX_PDF_PAGES, MAX_SOURCE_CHARACTERS, MAX_UPLOAD_BYTES

MAX_PDF_PAGE_STREAM_BYTES = 2 * 1024 * 1024
MAX_PDF_TOTAL_STREAM_BYTES = 10 * 1024 * 1024


class IngestionError(ValueError):
    def __init__(self, message: str, *, status_code: int = 422, code: str = "INVALID_DOCUMENT"):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


def _check_text(pages: list[tuple[int | None, str]]) -> None:
    if any("\x00" in text for _, text in pages):
        raise IngestionError("Source text must not contain null characters.")
    if sum(len(text) for _, text in pages) > MAX_SOURCE_CHARACTERS:
        raise IngestionError(
            "The source exceeds the extracted-text character limit.",
            status_code=413,
            code="SOURCE_TOO_LARGE",
        )
    if not any(text.strip() for _, text in pages):
        raise IngestionError("The source contains no extractable text.")


def extract_upload(filename: str, content: bytes) -> tuple[str, list[tuple[int | None, str]]]:
    if not isinstance(filename, str) or not filename.strip():
        raise IngestionError("Provide a filename with a supported extension.")
    if not isinstance(content, bytes):
        raise IngestionError("Upload a file as bytes.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise IngestionError(
            "The upload exceeds the five-megabyte limit.",
            status_code=413,
            code="SOURCE_TOO_LARGE",
        )
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in {"txt", "md", "pdf"}:
        raise IngestionError(
            "Supported uploads are UTF-8 .txt, .md and text-based .pdf files.",
            status_code=415,
            code="UNSUPPORTED_SOURCE_TYPE",
        )
    if not content:
        raise IngestionError("The upload is empty.")
    if extension in {"txt", "md"}:
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise IngestionError("Text uploads must use UTF-8 encoding.") from exc
        if "\x00" in text:
            raise IngestionError("Text uploads must not contain null characters.")
        pages = [(None, text)]
        _check_text(pages)
        return ("markdown" if extension == "md" else "text"), pages

    try:
        with apply_configuration(
            maximum_declared_stream_length=MAX_UPLOAD_BYTES,
            array_based_stream_maximum_output_length=MAX_PDF_PAGE_STREAM_BYTES,
            zlib_maximum_output_length=MAX_PDF_PAGE_STREAM_BYTES,
            lzw_maximum_output_length=MAX_PDF_PAGE_STREAM_BYTES,
            run_length_maximum_output_length=MAX_PDF_PAGE_STREAM_BYTES,
            brotli_maximum_output_length=MAX_PDF_PAGE_STREAM_BYTES,
            stream_decoding_work_maximum_length=MAX_PDF_TOTAL_STREAM_BYTES,
            page_tree_maximum_entries=MAX_PDF_PAGES * 4,
        ):
            reader = PdfReader(BytesIO(content), strict=True)
            if reader.is_encrypted:
                raise IngestionError("Encrypted PDFs are not supported.")
            if len(reader.pages) > MAX_PDF_PAGES:
                raise IngestionError(
                    f"PDF uploads may contain at most {MAX_PDF_PAGES} pages.",
                    status_code=413,
                    code="SOURCE_TOO_LARGE",
                )
            pages: list[tuple[int | None, str]] = []
            characters = 0
            total_stream_bytes = 0
            for page_number, page in enumerate(reader.pages, start=1):
                contents = page.get_contents()
                stream_bytes = len(contents.get_data()) if contents is not None else 0
                total_stream_bytes += stream_bytes
                if (
                    stream_bytes > MAX_PDF_PAGE_STREAM_BYTES
                    or total_stream_bytes > MAX_PDF_TOTAL_STREAM_BYTES
                ):
                    raise IngestionError(
                        "The PDF content is too complex for local text extraction.",
                        status_code=413,
                        code="SOURCE_TOO_LARGE",
                    )
                text = page.extract_text() or ""
                characters += len(text)
                if characters > MAX_SOURCE_CHARACTERS:
                    raise IngestionError(
                        "The source exceeds the extracted-text character limit.",
                        status_code=413,
                        code="SOURCE_TOO_LARGE",
                    )
                pages.append((page_number, text))
    except IngestionError:
        raise
    except LimitReachedError as exc:
        raise IngestionError(
            "The PDF exceeds local extraction resource limits.",
            status_code=413,
            code="SOURCE_TOO_LARGE",
        ) from exc
    except Exception as exc:
        raise IngestionError("The PDF could not be read as a valid text document.") from exc
    _check_text(pages)
    return "pdf", pages
