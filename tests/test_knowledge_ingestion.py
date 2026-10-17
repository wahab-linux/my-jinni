from io import BytesIO

import pytest
from pypdf import PdfWriter, get_configuration
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.knowledge.ingestion import MAX_PDF_PAGE_STREAM_BYTES, IngestionError, extract_upload
from app.knowledge.schemas import MAX_PDF_PAGES, MAX_SOURCE_CHARACTERS, MAX_UPLOAD_BYTES


def make_pdf(texts, *, encrypted=False, extra_stream=b"", compressed=False):
    writer = PdfWriter()
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    for text in texts:
        page = writer.add_blank_page(width=300, height=300)
        if text is None:
            continue
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
        )
        escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream = DecodedStreamObject()
        stream.set_data(
            b"BT /F1 12 Tf 10 100 Td (" + escaped.encode("ascii") + b") Tj ET\n" + extra_stream
        )
        if compressed:
            stream = stream.flate_encode()
        page[NameObject("/Contents")] = writer._add_object(stream)
    if encrypted:
        writer.encrypt("private-password")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


@pytest.mark.parametrize(
    ("filename", "expected_kind"),
    [("notes.txt", "text"), ("NOTES.TXT", "text"), ("notes.md", "markdown")],
)
def test_utf8_text_and_markdown_keep_exact_text(filename, expected_kind):
    text = "  # Original title\r\nExact punctuation!\n\nKeep this spacing.  "
    kind, pages = extract_upload(filename, text.encode())
    assert kind == expected_kind
    assert pages == [(None, text)]


def test_utf8_bom_is_accepted():
    assert extract_upload("notes.txt", b"\xef\xbb\xbfOpening hours.") == (
        "text",
        [(None, "Opening hours.")],
    )


def test_utf8_multibyte_characters_are_counted_as_characters():
    text = "\u00e9" * MAX_SOURCE_CHARACTERS
    assert extract_upload("notes.txt", text.encode())[1] == [(None, text)]


@pytest.mark.parametrize(
    "filename", ["file.exe", "document.docx", "image.png", "file", "page.html"]
)
def test_unsupported_extensions_return_frozen_public_code(filename):
    with pytest.raises(IngestionError) as error:
        extract_upload(filename, b"Some text.")
    assert error.value.status_code == 415
    assert error.value.code == "UNSUPPORTED_SOURCE_TYPE"


@pytest.mark.parametrize("content", [b"", b" \r\n\t", b"\xff\xfeinvalid", b"null\x00byte"])
def test_empty_binary_or_non_utf8_text_is_rejected(content):
    with pytest.raises(IngestionError) as error:
        extract_upload("notes.txt", content)
    assert error.value.status_code == 422
    assert error.value.code == "INVALID_DOCUMENT"


def test_oversized_upload_rejected_before_decoding():
    with pytest.raises(IngestionError) as error:
        extract_upload("notes.txt", b"x" * (MAX_UPLOAD_BYTES + 1))
    assert error.value.status_code == 413
    assert error.value.code == "SOURCE_TOO_LARGE"


def test_decoded_character_limit_rejects_one_extra_character():
    with pytest.raises(IngestionError) as error:
        extract_upload("notes.md", ("x" * (MAX_SOURCE_CHARACTERS + 1)).encode())
    assert error.value.status_code == 413
    assert error.value.code == "SOURCE_TOO_LARGE"


def test_pdf_extraction_preserves_original_page_numbers_including_blank_pages():
    content = make_pdf([None, "Library opens at nine.", "Museum closes at five."])
    kind, pages = extract_upload("guide.pdf", content)
    assert kind == "pdf"
    assert pages == [(1, ""), (2, "Library opens at nine."), (3, "Museum closes at five.")]


def test_encrypted_pdf_is_rejected_without_attempting_a_password():
    content = make_pdf(["Private text."], encrypted=True)
    with pytest.raises(IngestionError) as error:
        extract_upload("private.pdf", content)
    assert error.value.status_code == 422
    assert error.value.code == "INVALID_DOCUMENT"
    assert "Encrypted" in str(error.value)
    assert "private-password" not in str(error.value)


@pytest.mark.parametrize("content", [b"not a PDF", b"%PDF-1.7\ninvalid body\n%%EOF"])
def test_corrupt_pdf_returns_safe_english_error(content):
    with pytest.raises(IngestionError) as error:
        extract_upload("guide.pdf", content)
    assert error.value.status_code == 422
    assert error.value.code == "INVALID_DOCUMENT"
    assert str(error.value) == "The PDF could not be read as a valid text document."


def test_pdf_without_extractable_text_is_not_silently_accepted():
    with pytest.raises(IngestionError) as error:
        extract_upload("scan.pdf", make_pdf([None]))
    assert error.value.status_code == 422
    assert error.value.code == "INVALID_DOCUMENT"
    assert "no extractable text" in str(error.value)


def test_pdf_page_limit_rejects_before_extracting_text():
    with pytest.raises(IngestionError) as error:
        extract_upload("long.pdf", make_pdf(["Opening hours."] * (MAX_PDF_PAGES + 1)))
    assert error.value.status_code == 413
    assert error.value.code == "SOURCE_TOO_LARGE"


def test_pdf_at_page_limit_retains_every_original_page_number():
    _, pages = extract_upload("guide.pdf", make_pdf(["Hours."] * MAX_PDF_PAGES))
    assert [page for page, _ in pages] == list(range(1, MAX_PDF_PAGES + 1))


def test_pdf_combined_extracted_character_limit_applies_across_pages():
    content = make_pdf(["x" * (MAX_SOURCE_CHARACTERS // 2 + 1)] * 2)
    with pytest.raises(IngestionError) as error:
        extract_upload("long.pdf", content)
    assert error.value.status_code == 413
    assert error.value.code == "SOURCE_TOO_LARGE"


def test_compressed_pdf_stream_limit_is_enforced_and_configuration_restored():
    configuration = get_configuration()
    content = make_pdf(
        ["Small text."],
        extra_stream=b" " * (MAX_PDF_PAGE_STREAM_BYTES + 1),
        compressed=True,
    )
    assert len(content) < MAX_UPLOAD_BYTES
    with pytest.raises(IngestionError) as error:
        extract_upload("compressed.pdf", content)
    assert error.value.status_code == 413
    assert error.value.code == "SOURCE_TOO_LARGE"
    assert get_configuration() is configuration


def test_pdf_context_limits_are_restored_after_success():
    configuration = get_configuration()
    extract_upload("valid.pdf", make_pdf(["Public guide."]))
    assert get_configuration() is configuration


def test_upload_filename_is_not_read_as_an_arbitrary_path(tmp_path):
    path = tmp_path / "private.txt"
    path.write_text("Do not read this file.")
    assert extract_upload(str(path), b"Only submitted bytes.") == (
        "text",
        [(None, "Only submitted bytes.")],
    )
