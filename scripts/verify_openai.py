"""Make one optional live OpenAI request using the application's citation checks.

Official references:
https://developers.openai.com/api/docs/models/gpt-4.1-mini
https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses
"""

import argparse
import asyncio
import getpass
import os
import sys
import warnings

import httpx

from app.knowledge.openai_client import AIServiceError, generate_answer
from app.knowledge.router import checked_citations
from app.knowledge.schemas import DEFAULT_MODEL, SourceChunk


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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=DEFAULT_MODEL)
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
    return 0 if asyncio.run(verify(key, args.model)) else 1


if __name__ == "__main__":
    raise SystemExit(main())
