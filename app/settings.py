from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
WEB_DIR = ROOT / "web"
DEMO_DATE = date(2026, 10, 20)
TIMEZONE = "Europe/London"
ORIGIN_ID = "glasgow-main-campus"
