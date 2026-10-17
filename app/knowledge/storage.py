import re
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.knowledge.schemas import (
    MAX_RETRIEVED_CHUNKS,
    MAX_SOURCE_CHARACTERS,
    MAX_SOURCES,
    LibrarySource,
    SourceChunk,
    SourceDetail,
)

CHUNK_CHARACTERS = 1200
CHUNK_OVERLAP = 150
_KINDS = frozenset({"text", "markdown", "pdf", "planner"})
_WORD = re.compile(r"[^\W_]+", re.UNICODE)
_CJK = re.compile(r"[\u3400-\u9fff\uf900-\ufaff]+")
_STOPWORDS = frozenset(
    "a an and are as at be been being by can could did do does for from had has have how "
    "i if in into is it its me my of on or our please should that the their them there these "
    "they this those to us was we were what when where which who why will with would you your "
    "about tell".split()
)


class LibraryLimitError(ValueError):
    """The configured local source limit has been reached."""


def _terms(text: str) -> list[str]:
    words = [
        word for word in _WORD.findall(_CJK.sub(" ", text.casefold())) if word not in _STOPWORDS
    ]
    for match in _CJK.finditer(text):
        run = match.group()
        words.extend(run)
        words.extend(run[index : index + 2] for index in range(len(run) - 1))
    return words


def _chunks(pages: list[tuple[int | None, str]]) -> Iterator[tuple[int | None, str]]:
    for page, text in pages:
        if not text.strip():
            continue
        start = 0
        while start < len(text):
            end = min(start + CHUNK_CHARACTERS, len(text))
            yield page, text[start:end]
            if end == len(text):
                break
            start = end - CHUNK_OVERLAP


class KnowledgeStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        if str(self.path) == ":memory:":
            raise ValueError("Use a local database file for persistent sources")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS sources (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    filename TEXT,
                    created_at TEXT NOT NULL,
                    chunk_count INTEGER NOT NULL,
                    character_count INTEGER NOT NULL,
                    is_simulated INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS chunks (
                    id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    page INTEGER,
                    chunk_index INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    UNIQUE(source_id, chunk_index)
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS chunk_search USING fts5(
                    index_text, chunk_id UNINDEXED, tokenize='unicode61'
                );
                CREATE INDEX IF NOT EXISTS chunks_source ON chunks(source_id, chunk_index);
                """
            )

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=5.0)
        try:
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            yield connection
        finally:
            connection.close()

    def list_sources(self) -> list[LibrarySource]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT * FROM sources ORDER BY created_at DESC, id"
            ).fetchall()
        return [LibrarySource.model_validate(dict(row)) for row in rows]

    def add_source(
        self,
        *,
        title: str,
        kind: str,
        filename: str | None,
        pages: list[tuple[int | None, str]],
        is_simulated: bool = False,
    ) -> LibrarySource:
        if not isinstance(title, str) or not title.strip() or len(title) > 200:
            raise ValueError("Source title must contain between 1 and 200 characters")
        if not isinstance(kind, str) or kind not in _KINDS:
            raise ValueError("Unsupported source kind")
        if not isinstance(is_simulated, bool):
            raise ValueError("Source simulation status must be a boolean")
        if filename is not None:
            if not isinstance(filename, str):
                raise ValueError("Source filename must be text")
            filename = filename.replace("\\", "/").rsplit("/", 1)[-1]
            if not filename.strip() or len(filename) > 255 or filename in {".", ".."}:
                raise ValueError("Source filename must be a valid display name")
        if not isinstance(pages, list):
            raise ValueError("Source pages must be a list")
        for item in pages:
            if not isinstance(item, tuple) or len(item) != 2:
                raise ValueError("Source pages must contain page-number and text pairs")
            page, text = item
            if page is not None and (type(page) is not int or page < 1):
                raise ValueError("Source page numbers must be positive integers")
            if not isinstance(text, str) or "\x00" in text:
                raise ValueError("Source content must be text without null characters")
        character_count = sum(len(text) for _, text in pages)
        if character_count > MAX_SOURCE_CHARACTERS:
            raise ValueError("Source exceeds the character limit")
        pieces = list(_chunks(pages))
        if not pieces:
            raise ValueError("Source must contain nonblank text")

        source = LibrarySource(
            id=uuid4().hex,
            title=title.strip(),
            kind=kind,
            filename=filename,
            created_at=datetime.now(UTC),
            chunk_count=len(pieces),
            character_count=character_count,
            is_simulated=is_simulated,
        )
        with self._connection() as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            if connection.execute("SELECT COUNT(*) FROM sources").fetchone()[0] >= MAX_SOURCES:
                raise LibraryLimitError(f"The library supports at most {MAX_SOURCES} sources")
            connection.execute(
                "INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    source.id,
                    source.title,
                    source.kind,
                    source.filename,
                    source.created_at.isoformat(),
                    source.chunk_count,
                    source.character_count,
                    int(source.is_simulated),
                ),
            )
            for index, (page, text) in enumerate(pieces):
                chunk_id = uuid4().hex
                connection.execute(
                    "INSERT INTO chunks VALUES (?, ?, ?, ?, ?)",
                    (chunk_id, source.id, page, index, text),
                )
                connection.execute(
                    "INSERT INTO chunk_search (chunk_id, index_text) VALUES (?, ?)",
                    (chunk_id, " ".join(_terms(text))),
                )
        return source

    def get_source(self, source_id: str) -> SourceDetail | None:
        with self._connection() as connection:
            connection.execute("BEGIN")
            row = connection.execute("SELECT * FROM sources WHERE id = ?", (source_id,)).fetchone()
            if row is None:
                return None
            chunks = connection.execute(
                """
                SELECT c.id AS chunk_id, c.source_id, s.title AS source_title, c.page,
                       c.chunk_index AS 'index', c.text, s.is_simulated
                FROM chunks AS c JOIN sources AS s ON s.id = c.source_id
                WHERE c.source_id = ? ORDER BY c.chunk_index
                """,
                (source_id,),
            ).fetchall()
        return SourceDetail(
            source=LibrarySource.model_validate(dict(row)),
            chunks=[SourceChunk.model_validate(dict(chunk)) for chunk in chunks],
        )

    def delete_source(self, source_id: str) -> bool:
        with self._connection() as connection, connection:
            connection.execute(
                "DELETE FROM chunk_search WHERE chunk_id IN "
                "(SELECT id FROM chunks WHERE source_id = ?)",
                (source_id,),
            )
            cursor = connection.execute("DELETE FROM sources WHERE id = ?", (source_id,))
            return cursor.rowcount > 0

    def search(
        self, question: str, source_ids: list[str], limit: int = MAX_RETRIEVED_CHUNKS
    ) -> list[SourceChunk]:
        if not isinstance(question, str):
            raise ValueError("Search question must be text")
        if type(limit) is not int or not 1 <= limit <= MAX_RETRIEVED_CHUNKS:
            raise ValueError(f"Retrieval limit must be between 1 and {MAX_RETRIEVED_CHUNKS}")
        if not isinstance(source_ids, list) or any(
            not isinstance(source_id, str) or not source_id for source_id in source_ids
        ):
            raise ValueError("Select sources by their IDs")
        if len(source_ids) > MAX_SOURCES:
            raise ValueError(f"Select at most {MAX_SOURCES} sources")
        terms = list(dict.fromkeys(_terms(question)))
        if not source_ids or not terms:
            return []
        expression = " OR ".join('"' + term.replace('"', '""') + '"' for term in terms)
        placeholders = ", ".join("?" for _ in source_ids)
        with self._connection() as connection:
            rows = connection.execute(
                f"""
                SELECT c.id AS chunk_id, c.source_id, s.title AS source_title, c.page,
                       c.chunk_index AS 'index', c.text, s.is_simulated
                FROM chunk_search
                JOIN chunks AS c ON c.id = chunk_search.chunk_id
                JOIN sources AS s ON s.id = c.source_id
                WHERE chunk_search MATCH ? AND c.source_id IN ({placeholders})
                ORDER BY bm25(chunk_search), c.source_id, c.chunk_index, c.id
                LIMIT ?
                """,
                (expression, *source_ids, limit),
            ).fetchall()
        return [SourceChunk.model_validate(dict(row)) for row in rows]
