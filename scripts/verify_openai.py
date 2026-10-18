"""Make one optional live OpenAI request using the application's citation checks.

Official references:
https://developers.openai.com/api/docs/models/gpt-4.1-mini
https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses
"""

import argparse
import asyncio
import getpass
import os
import re
import sys
import warnings
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx
from fastapi.testclient import TestClient

from app.knowledge.openai_client import AIServiceError, generate_answer
from app.knowledge.router import checked_citations, get_ai_client, get_store
from app.knowledge.schemas import DEFAULT_MODEL, SourceChunk
from app.knowledge.storage import KnowledgeStore
from app.main import create_app


async def verify(key: str, model: str) -> bool:
    chunk = SourceChunk(
        chunk_id="live-check-chunk",
        source_id="live-check-source",
        source_title="Fictional provider verification guide",
        page=1,
        index=0,
        text="The fictional library opens at 09:30 on Monday. This is simulated test information.",
        is_simulated=True,
    )
    try:
        async with httpx.AsyncClient(
            timeout=30.0, trust_env=False, follow_redirects=False
        ) as client:
            draft = await generate_answer(
                client,
                api_key=key,
                model=model,
                question="At what time does the fictional library open on Monday?",
                chunks=[chunk],
            )
        citations = checked_citations(draft, [chunk]) if draft.supported else []
        if not citations or "09:30" not in draft.answer:
            print("LIVE CHECK FAILED: the response did not support the expected cited fact.")
            return False
    except AIServiceError as error:
        print(f"LIVE CHECK FAILED: {error.code} (HTTP {error.status_code}).")
        return False
    except Exception:
        print("LIVE CHECK FAILED: an unexpected local verification error occurred.")
        return False
    print(
        "LIVE CHECK PASSED: real OpenAI response, expected fact and exact source citation verified."
    )
    print("This does not establish desktop UI acceptance or semantic accuracy for other documents.")
    return True


def verify_decision(key: str, model: str, *, ai_transport=None) -> bool:
    """Exercise actual source adapters, comparison and chat with isolated temporary storage."""
    application = create_app()
    request = {
        "scenario_id": "travel",
        "weights": {"cost-pence": 100, "duration-minutes": 0, "emissions-grams": 0},
        "constraints": [
            {"criterion_id": "cost-pence", "operator": "lte", "value": 800},
            {"criterion_id": "duration-minutes", "operator": "lte", "value": 180},
        ],
    }
    try:
        with TemporaryDirectory(prefix="jinni-openai-check-") as directory:
            store = KnowledgeStore(Path(directory) / "check.sqlite3")
            application.dependency_overrides[get_store] = lambda: store
            if ai_transport is not None:

                async def injected_client():
                    async with httpx.AsyncClient(transport=ai_transport) as client:
                        yield client

                application.dependency_overrides[get_ai_client] = injected_client
            with TestClient(application) as client:
                direct = client.post("/api/v1/decisions/evaluate", json=request)
                if direct.status_code != 200:
                    print("ANALYSIS CHECK FAILED: the comparison could not be calculated.")
                    return False
                expected = direct.json()["data"]
                response = client.post(
                    "/api/v1/chat",
                    headers={"X-AI-API-Key": key},
                    json={
                        "provider": "openai",
                        "model": model,
                        "source_ids": [],
                        "decision_request": request,
                        "question": (
                            "Name the recommended option and explain why it fits my settings. "
                            "Report its actual price with £ and two decimal places, and its "
                            "actual travel time in minutes. Cite the calculated comparison."
                        ),
                    },
                )
        if response.status_code != 200:
            print(f"ANALYSIS CHECK FAILED: {response.json()['error']['code']}.")
            return False
        data = response.json()["data"]
        answer = data["answer"]
        if (
            data["status"] != "answered"
            or data["decision"] != expected
            or expected["recommended"]["id"] != "coach"
            or not any(
                citation["source_id"] == "decision-context" for citation in data["citations"]
            )
            or "coach" not in answer.lower()
            or re.search(r"£\s*8\.00\b", answer) is None
            or re.search(r"\b120\s+minutes\b", answer, re.IGNORECASE) is None
        ):
            print("ANALYSIS CHECK FAILED: the answer did not pass the expected cited fact checks.")
            return False
    except Exception:
        print("ANALYSIS CHECK FAILED: an unexpected local verification error occurred.")
        return False
    print("ANALYSIS CHECK PASSED: actual comparison, checked citation, £8.00 and 120 minutes.")
    print("One example does not establish desktop acceptance or accuracy for every question.")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument(
        "--decision",
        action="store_true",
        help="Check actual comparison analysis through the chat API.",
    )
    args = parser.parse_args()
    key = os.environ.get("OPENAI_API_KEY", "")
    if not key:
        if not sys.stdin.isatty():
            print(
                "Live check needs an interactive terminal for hidden key entry, or OPENAI_API_KEY."
            )
            return 2
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", getpass.GetPassWarning)
                key = getpass.getpass("OpenAI API key (hidden; session only): ")
        except getpass.GetPassWarning:
            print("Hidden key entry is unavailable in this terminal; no request sent.")
            return 2
        except (EOFError, KeyboardInterrupt):
            print("Live check cancelled; no request sent.")
            return 2
    if not key:
        print("Live check skipped: no key supplied.")
        return 2
    passed = (
        verify_decision(key, args.model) if args.decision else asyncio.run(verify(key, args.model))
    )
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
