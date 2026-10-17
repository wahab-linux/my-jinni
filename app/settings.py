import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
FIXTURES_DIR = ROOT / "contracts" / "fixtures"
SOURCE_TIMEOUT_SECONDS = 2.0


def library_database_path() -> Path:
    configured = os.environ.get("MY_JINNI_DATA_DIR") or os.environ.get("PLANSCOPE_DATA_DIR")
    if configured:
        directory = Path(configured).expanduser()
    else:
        local_data = os.environ.get("LOCALAPPDATA")
        directory = Path(local_data) / "my-jinni" if local_data else Path.home() / ".my-jinni"
        legacy_directory = (
            Path(local_data) / "PlanScope" if local_data else Path.home() / ".planscope"
        )
        if (
            not (directory / "library.sqlite3").exists()
            and (legacy_directory / "library.sqlite3").is_file()
        ):
            return legacy_directory / "library.sqlite3"
    return directory / "library.sqlite3"
