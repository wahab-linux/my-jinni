"""Check the browser comparison against actual HTTP calculations, including custom domains."""

import copy
import json
import random
import subprocess
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app

ROOT = Path(__file__).resolve().parents[1]


def test_general_comparison_examples_remain_real_calculated_contracts():
    fixtures = ROOT / "contracts" / "fixtures"
    request = json.loads((fixtures / "decision-request.json").read_text(encoding="utf-8"))
    expected = json.loads((fixtures / "decision-response.json").read_text(encoding="utf-8"))
    with TestClient(create_app()) as client:
        response = client.post("/api/v1/decisions/evaluate", json=request)
    assert response.status_code == 200
    assert response.json() == expected
    assert expected["data"]["is_simulated"] is True
    assert len(expected["data"]["sources"]) == 2


def test_browser_general_comparison_matches_actual_python_api():
    cases = []
    expected = []
    rng = random.Random(20261017)
    with TestClient(create_app()) as client:
        catalog = client.get("/api/v1/decision-scenarios").json()["data"]["scenarios"]
        assert {scenario["id"] for scenario in catalog} == {
            "market",
            "travel",
            "student",
            "sustainability",
            "custom",
        }
        for scenario in catalog:
            entry = client.get(f"/api/v1/decision-scenarios/{scenario['id']}").json()["data"]
            requests = [scenario["default_request"], {"scenario_id": scenario["id"]}]
            for criterion in scenario["criteria"]:
                requests.append(
                    {
                        "scenario_id": scenario["id"],
                        "weights": {
                            c["id"]: 100 if c["id"] == criterion["id"] else 0
                            for c in scenario["criteria"]
                        },
                    }
                )
                values = [
                    row["metrics"][criterion["id"]]
                    for row in entry["dataset"]["observations"]
                    if row["metrics"].get(criterion["id"]) is not None
                ]
                for operator, value in [
                    ("lte", min(values)),
                    ("gte", max(values)),
                    ("gte", max(values) + 1),
                ]:
                    requests.append(
                        {
                            "scenario_id": scenario["id"],
                            "constraints": [
                                {
                                    "criterion_id": criterion["id"],
                                    "operator": operator,
                                    "value": value,
                                }
                            ],
                        }
                    )
            for _ in range(12):
                requests.append(
                    {
                        "scenario_id": scenario["id"],
                        "weights": {c["id"]: rng.randint(1, 100) for c in scenario["criteria"]},
                    }
                )
            if scenario["id"] == "custom":
                for variant in (
                    "new-domain",
                    "missing-value",
                    "unknown",
                    "no-options",
                    "ties",
                    "inherited-name",
                ):
                    custom = {
                        "title": "Choose a work tool",
                        "criteria": copy.deepcopy(scenario["criteria"]),
                        "dataset": copy.deepcopy(entry["dataset"]),
                    }
                    custom["dataset"]["option_source"]["is_simulated"] = False
                    custom["dataset"]["metric_source"]["is_simulated"] = False
                    observations = custom["dataset"]["observations"]
                    first_id = scenario["criteria"][0]["id"]
                    if variant == "missing-value":
                        observations[0]["metrics"][first_id] = None
                    elif variant == "unknown":
                        observations[0].pop("available", None)
                    elif variant == "no-options":
                        custom["dataset"]["options"] = []
                        custom["dataset"]["observations"] = []
                    elif variant == "ties":
                        for row in observations:
                            row["available"] = True
                            row["metrics"] = copy.deepcopy(observations[0]["metrics"])
                    elif variant == "inherited-name":
                        custom["criteria"][0]["id"] = "constructor"
                        for row in observations:
                            row["metrics"]["constructor"] = row["metrics"].pop(first_id)
                    requests.append({"scenario_id": "custom", "custom": custom})
            for request in requests:
                response = client.post("/api/v1/decisions/evaluate", json=request)
                assert response.status_code == 200, response.text
                expected.append(response.json())
                cases.append({"request": request, "entry": entry})
    result = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import {evaluateDecision} from './web/decisions.mjs';"
            "let text='';for await(const part of process.stdin)text+=part;"
            "const cases=JSON.parse(text);"
            "console.log(JSON.stringify(cases.map(c=>evaluateDecision(c.request,c.entry))));",
        ],
        input=json.dumps(cases),
        text=True,
        capture_output=True,
        check=True,
        cwd=ROOT,
    )
    actual = json.loads(result.stdout)
    assert len(actual) == len(expected) >= 100
    for index, (browser, python) in enumerate(zip(actual, expected, strict=True)):
        assert browser == python, f"Case {index}: {cases[index]['request']}"
