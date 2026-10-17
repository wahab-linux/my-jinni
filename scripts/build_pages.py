"""Build a self-contained Pages artifact from validated application data."""

import asyncio
import json
import shutil
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.scenario import ORIGINS
from app.sources.adapters import fetch_sources

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist" / "pages"


def encode(value: object) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Cannot encode {type(value)}")


async def build() -> None:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(ROOT / "web", OUTPUT)
    shutil.copyfile(ROOT / "contracts" / "fixtures" / "venue-guide.md", OUTPUT / "venue-guide.md")
    with TestClient(app) as client:
        response = client.get("/api/v1/options")
        response.raise_for_status()
        options = response.json()["data"]
    bundles = {}
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://pages-build.local"
    ) as client:
        for origin in ORIGINS:
            bundle = await fetch_sources(client, origin.id)
            bundles[origin.id] = {
                "activities": [asdict(item) for item in bundle.activities],
                "journeys": {key: asdict(value) for key, value in bundle.journeys.items()},
                "sources": [item.model_dump(mode="json") for item in bundle.sources],
                "warnings": [item.model_dump(mode="json") for item in bundle.warnings],
            }
    (OUTPUT / "scenario.json").write_text(
        json.dumps({"options": options, "bundles": bundles}, default=encode, indent=2) + "\n",
        encoding="utf-8",
    )
    vendor = OUTPUT / "vendor"
    vendor.mkdir()
    pdfjs = ROOT / "node_modules" / "pdfjs-dist"
    for filename in ("pdf.mjs", "pdf.worker.mjs"):
        shutil.copyfile(pdfjs / "build" / filename, vendor / filename)
    for directory in ("cmaps", "standard_fonts", "wasm"):
        shutil.copytree(pdfjs / directory, vendor / directory)
    shutil.copyfile(pdfjs / "LICENSE", vendor / "PDFJS-LICENSE")
    (OUTPUT / ".nojekyll").touch()
    print(f"Built {OUTPUT}; {len(bundles)} validated travel scenarios, no backend required.")


if __name__ == "__main__":
    asyncio.run(build())
