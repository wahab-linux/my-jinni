import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import pytest

from app.knowledge.schemas import MAX_RETRIEVED_CHUNKS, MAX_SOURCE_CHARACTERS, MAX_SOURCES
from app.knowledge.storage import KnowledgeStore, LibraryLimitError


@pytest.fixture
def store(tmp_path):
    return KnowledgeStore(tmp_path / "library.sqlite3")


def add(store, text="Library opens at nine.", **changes):
    values = {"title": "Campus guide", "kind": "text", "filename": None, "pages": [(None, text)]}
    return store.add_source(**(values | changes))


def test_sources_and_exact_chunks_survive_store_reopen(tmp_path):
    path = tmp_path / "nested" / "library.sqlite3"
    source = add(KnowledgeStore(path), "  Exact punctuation,\nspacing and\r\nline breaks.  ")
    reopened = KnowledgeStore(path)
    assert reopened.list_sources() == [source]
    detail = reopened.get_source(source.id)
    assert detail.source == source
    assert detail.chunks[0].text == "  Exact punctuation,\nspacing and\r\nline breaks.  "
    assert detail.chunks[0].page is None
    assert detail.chunks[0].source_title == "Campus guide"
    assert detail.chunks[0].source_id == source.id
    assert len(source.id) == 32
    assert int(source.id, 16) >= 0
    assert isinstance(source.created_at, datetime)
    assert source.created_at.utcoffset() is not None


def test_chunks_preserve_page_citations_overlap_and_all_original_text(store):
    first_page = "Intro: " + "precise text " * 200
    second_page = "New page. " * 30
    source = add(store, pages=[(1, first_page), (2, second_page)], kind="pdf")
    detail = store.get_source(source.id)
    assert source.character_count == len(first_page) + len(second_page)
    assert source.chunk_count == len(detail.chunks)
    assert [chunk.index for chunk in detail.chunks] == list(range(source.chunk_count))
    assert len({chunk.chunk_id for chunk in detail.chunks}) == source.chunk_count
    assert all(1 <= len(chunk.text) <= 1200 for chunk in detail.chunks)
    for page_number, original in [(1, first_page), (2, second_page)]:
        page_chunks = [chunk.text for chunk in detail.chunks if chunk.page == page_number]
        assert page_chunks[0] + "".join(chunk[150:] for chunk in page_chunks[1:]) == original
        for previous, current in zip(page_chunks, page_chunks[1:], strict=False):
            assert previous[-150:] == current[:150]


def test_blank_pdf_pages_do_not_change_original_page_numbers(store):
    source = add(store, pages=[(1, ""), (2, "Opening hours are nine to five."), (3, " ")])
    result = store.search("opening hours", [source.id])
    assert len(result) == 1
    assert result[0].page == 2


def test_filename_is_only_display_metadata_and_never_used_as_a_path(store, tmp_path):
    source = add(store, filename="../../private/../../../outside.txt")
    assert source.filename == "outside.txt"
    assert sorted(path.name for path in tmp_path.iterdir()) == ["library.sqlite3"]
    windows_name = add(store, filename=r"C:\Users\someone\secret.md", kind="markdown")
    assert windows_name.filename == "secret.md"


def test_search_respects_selected_sources_and_never_uses_global_fallback(store):
    selected = add(store, "Library opening hours: nine to five.")
    excluded = add(store, "Observatory opening hours: ten to six.", title="Observatory")
    assert {chunk.source_id for chunk in store.search("opening hours", [selected.id])} == {
        selected.id
    }
    assert store.search("observatory", [selected.id]) == []
    assert store.search("observatory", []) == []
    assert store.search("observatory", ["missing"]) == []
    assert store.search("opening hours", [excluded.id])[0].source_id == excluded.id


@pytest.mark.parametrize("question", ["irrelevant aardvarks", "the and what is", '*** " ()', ""])
def test_no_lexical_evidence_returns_no_chunks(store, question):
    source = add(store)
    assert store.search(question, [source.id]) == []


@pytest.mark.parametrize(
    "question",
    ['" OR * NEAR(', "library' OR 1=1; DROP TABLE sources; --", "library:opening AND NOT *"],
)
def test_fts_and_sql_syntax_are_treated_as_literal_terms(store, question):
    source = add(store)
    assert isinstance(store.search(question, [source.id]), list)
    assert store.list_sources() == [source]
    assert store.search("library", ["' OR 1=1 --"]) == []


def test_relevance_precedes_stable_ties_and_results_are_bounded(store):
    stronger = add(store, "Astronomy astronomy telescope telescope.")
    add(store, "Telescope gives a broad overview of distant stars and dark skies.")
    more = [add(store, "Telescope." + " Other words." * 20) for _ in range(8)]
    selected = [source.id for source in store.list_sources()]
    first = store.search("astronomy telescope", selected)
    assert len(first) == MAX_RETRIEVED_CHUNKS
    assert first[0].source_id == stronger.id
    assert first == store.search("astronomy telescope", list(reversed(selected)))
    assert len(store.search("telescope", [source.id for source in more], limit=2)) == 2


def test_best_effort_cjk_terms_keep_exact_original_citation_text(store):
    text = "\u673a\u5668\u5b66\u4e60\u8bfe\u7a0b\u5728\u5468\u4e94\u4e0b\u5348"
    source = add(store, text)
    result = store.search("\u673a\u5668\u5b66\u4e60", [source.id])
    assert result[0].text == text


def test_simulated_sources_remain_labelled_in_details_and_search(store):
    source = add(store, is_simulated=True, kind="planner")
    assert store.get_source(source.id).source.is_simulated is True
    assert store.search("library", [source.id])[0].is_simulated is True


def test_deletion_removes_metadata_chunks_and_fts_matches_and_frees_capacity(store):
    source = add(store)
    assert store.delete_source(source.id) is True
    assert store.delete_source(source.id) is False
    assert store.get_source(source.id) is None
    assert store.list_sources() == []
    assert store.search("library", [source.id]) == []
    with sqlite3.connect(store.path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM chunks").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM chunk_search").fetchone()[0] == 0


def test_max_sources_is_atomic_for_competing_writers(tmp_path):
    path = tmp_path / "library.sqlite3"
    first_store, second_store = KnowledgeStore(path), KnowledgeStore(path)
    for number in range(MAX_SOURCES - 1):
        add(first_store, title=f"Guide {number}")

    def try_add(candidate):
        try:
            return add(candidate)
        except LibraryLimitError:
            return None

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(try_add, [first_store, second_store]))
    assert sum(result is not None for result in results) == 1
    assert len(first_store.list_sources()) == MAX_SOURCES
    with pytest.raises(LibraryLimitError):
        add(first_store)
    source = first_store.list_sources()[0]
    assert first_store.delete_source(source.id)
    add(second_store)
    assert len(first_store.list_sources()) == MAX_SOURCES


def test_character_limit_accepts_boundary_and_rejects_one_extra_character(store):
    source = add(store, "x" * MAX_SOURCE_CHARACTERS)
    assert source.character_count == MAX_SOURCE_CHARACTERS
    with pytest.raises(ValueError, match="character limit"):
        add(store, pages=[(1, "x" * MAX_SOURCE_CHARACTERS), (2, "y")])
    assert len(store.list_sources()) == 1


@pytest.mark.parametrize(
    "changes",
    [
        {"title": " "},
        {"title": "x" * 201},
        {"kind": "url"},
        {"pages": []},
        {"pages": [(None, " \n")]},
        {"pages": [(0, "text")]},
        {"pages": [(True, "text")]},
        {"pages": [(1, b"bytes")]},
        {"pages": [(1, "null\x00byte")]},
        {"filename": "../"},
        {"is_simulated": "false"},
    ],
)
def test_invalid_source_is_rejected_without_partial_metadata(store, changes):
    with pytest.raises(ValueError):
        add(store, **changes)
    assert store.list_sources() == []


@pytest.mark.parametrize("limit", [0, -1, 7, True, 1.5])
def test_invalid_retrieval_limit_is_rejected(store, limit):
    with pytest.raises(ValueError):
        store.search("library", [], limit=limit)


def test_questions_are_not_persisted_and_connections_do_not_hold_the_file_open(store, tmp_path):
    source = add(store)
    question = "NeverPersistThisQuestion783914"
    assert store.search(question, [source.id]) == []
    assert question.encode() not in store.path.read_bytes()
    store.get_source(source.id)
    store.list_sources()
    renamed = tmp_path / "renamed.sqlite3"
    store.path.rename(renamed)
    assert KnowledgeStore(renamed).get_source(source.id).source == source
