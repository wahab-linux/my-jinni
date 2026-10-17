"""Cross-language parity protects the static browser planner from rule drift."""

import asyncio
import json
import random
import subprocess
from dataclasses import asdict
from datetime import datetime, timedelta
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.scenario import ORIGINS
from app.sources.adapters import fetch_sources

ROOT = Path(__file__).resolve().parents[1]


def encode(value: object) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError()


def test_browser_planner_matches_python_application() -> None:
    async def bundles() -> dict:
        result = {}
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://parity.local"
        ) as client:
            for origin in ORIGINS:
                bundle = await fetch_sources(client, origin.id)
                result[origin.id] = {
                    "activities": [asdict(item) for item in bundle.activities],
                    "journeys": {key: asdict(item) for key, item in bundle.journeys.items()},
                    "sources": [item.model_dump(mode="json") for item in bundle.sources],
                    "warnings": [item.model_dump(mode="json") for item in bundle.warnings],
                }
        return result

    with TestClient(app) as client:
        options = client.get("/api/v1/options").json()["data"]
        defaults = options["default_request"]
        requests = []
        for origin in ORIGINS:
            for budget in (0, 399, 400, 499, 500, 599, 600, 699, 700, 1000, 20000):
                windows = (("16:00", "19:00"), ("16:15", "18:15"), ("16:16", "18:14"))
                for departure, deadline in windows:
                    requests.append(
                        {
                            **defaults,
                            "origin_id": origin.id,
                            "budget_pence": budget,
                            "depart_at": f"2026-10-20T{departure}:00+01:00",
                            "return_by": f"2026-10-20T{deadline}:00+01:00",
                        }
                    )
        rng = random.Random(20261017)
        base = datetime.fromisoformat(defaults["depart_at"]).replace(hour=12)
        for _ in range(160):
            departure = base + timedelta(minutes=rng.randrange(0, 420))
            requests.append(
                {
                    **defaults,
                    "origin_id": rng.choice(ORIGINS).id,
                    "budget_pence": rng.randrange(0, 20001),
                    "depart_at": departure.isoformat(),
                    "return_by": (departure + timedelta(minutes=rng.randrange(1, 240))).isoformat(),
                    "interests": rng.sample([item["id"] for item in options["interests"]], k=2),
                }
            )
        expected = []
        for request in requests:
            response = client.post("/api/v1/recommendations", json=request)
            assert response.status_code == 200
            expected.append(response.json())
    scenario = {"options": options, "bundles": asyncio.run(bundles())}
    process = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import {recommend} from './web/planner.mjs';"
            "let text=''; for await (const part of process.stdin) text+=part;"
            "const {requests,scenario}=JSON.parse(text);"
            "console.log(JSON.stringify(requests.map(r=>recommend(r,scenario))));",
        ],
        input=json.dumps({"requests": requests, "scenario": scenario}, default=encode),
        text=True,
        capture_output=True,
        check=True,
        cwd=ROOT,
    )
    assert json.loads(process.stdout) == expected
