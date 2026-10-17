import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
FIXTURES_DIR = ROOT / "contracts" / "fixtures"
SOURCE_TIMEOUT_SECONDS = 2.0


def library_database_path() -> Path:
    configured = os.environ.get("PLANSCOPE_DATA_DIR")
    if configured:
        directory = Path(configured).expanduser()
    else:
        local_data = os.environ.get("LOCALAPPDATA")
        directory = Path(local_data) / "PlanScope" if local_data else Path.home() / ".planscope"
    return directory / "library.sqlite3"
