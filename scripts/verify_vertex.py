"""Check Google ADC without generating an answer; --ask explicitly makes one Vertex AI call."""

import argparse
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.knowledge.router import get_store
from app.knowledge.schemas import VertexSettings
from app.knowledge.storage import KnowledgeStore
from app.main import create_app


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--project", required=True, help="Google Cloud project ID, not its display name"
    )
    parser.add_argument("--location", default="global")
    parser.add_argument("--model", help="A Gemini model ID currently available in Vertex AI Studio")
    parser.add_argument(
        "--ask",
        action="store_true",
        help="Make one model request; normal Google usage charges may apply",
    )
    args = parser.parse_args()
    try:
        settings = VertexSettings(project_id=args.project, location=args.location)
    except ValidationError:
        parser.error("Use a valid project ID and location such as global or europe-west2.")
    if args.ask and not args.model:
        parser.error("--ask needs --model with a model available to your Google Cloud project.")
    application = create_app()
    with tempfile.TemporaryDirectory(prefix="jinni-adc-check-") as directory:
        store = KnowledgeStore(Path(directory) / "check.sqlite3")
        application.dependency_overrides[get_store] = lambda: store
        with TestClient(application) as client:
            if args.ask:
                scenario = client.get("/api/v1/decision-scenarios/travel").json()["data"][
                    "scenario"
                ]
                response = client.post(
                    "/api/v1/chat",
                    json={
                        "provider": "vertex",
                        "vertex": settings.model_dump(),
                        "model": args.model,
                        "question": (
                            "Explain the recommended option and its price and travel time. "
                            "Cite the calculated evidence and label fictional information."
                        ),
                        "decision_request": scenario["default_request"],
                    },
                )
            else:
                response = client.post("/api/v1/ai/vertex/check", json=settings.model_dump())
    result = response.json()
    if result.get("error"):
        print(f"CHECK FAILED: {result['error']['code']}. {result['error']['message']}")
        return 1
    data = result["data"]
    if args.ask:
        if data["status"] != "answered" or not data["citations"] or not data["decision"]:
            print("CHECK INCOMPLETE: no supported cited comparison answer was returned.")
            return 1
        print(
            "CHECK PASSED: Vertex AI returned a checked citation "
            "and the actual calculated comparison."
        )
        print("This does not prove every claim is accurate. Review the answer in the desktop app.")
    else:
        print(data["message"])
        print("No model request was made. No credentials or tokens are printed or copied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
