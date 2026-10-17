from app.settings import library_database_path


def test_new_data_directory_override_takes_precedence(monkeypatch, tmp_path):
    monkeypatch.setenv("MY_JINNI_DATA_DIR", str(tmp_path / "current"))
    monkeypatch.setenv("PLANSCOPE_DATA_DIR", str(tmp_path / "previous"))
    assert library_database_path() == tmp_path / "current" / "library.sqlite3"


def test_previous_data_override_still_works(monkeypatch, tmp_path):
    monkeypatch.delenv("MY_JINNI_DATA_DIR", raising=False)
    monkeypatch.setenv("PLANSCOPE_DATA_DIR", str(tmp_path))
    assert library_database_path() == tmp_path / "library.sqlite3"


def test_default_directory_uses_current_product_name(monkeypatch, tmp_path):
    monkeypatch.delenv("MY_JINNI_DATA_DIR", raising=False)
    monkeypatch.delenv("PLANSCOPE_DATA_DIR", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    assert library_database_path() == tmp_path / "my-jinni" / "library.sqlite3"


def test_existing_library_remains_accessible_after_rename(monkeypatch, tmp_path):
    monkeypatch.delenv("MY_JINNI_DATA_DIR", raising=False)
    monkeypatch.delenv("PLANSCOPE_DATA_DIR", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    previous = tmp_path / "PlanScope" / "library.sqlite3"
    previous.parent.mkdir()
    previous.touch()
    assert library_database_path() == previous
    current = tmp_path / "my-jinni" / "library.sqlite3"
    current.parent.mkdir()
    current.touch()
    assert library_database_path() == current
