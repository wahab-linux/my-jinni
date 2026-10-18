"""Optionally verify one live provider request with the real application adapter.

Run with --provider openai, deepseek, gemini or anthropic. Credentials are read
only for the selected provider, from its environment variable or hidden input.
No keys, raw responses, request headers or source contents are printed or saved.
See docs/AI_PROVIDERS.md for the fixed endpoints and official references.
"""

import argparse
import asyncio
import getpass
import os
import sys
import warnings

import httpx

from app.knowledge.openai_client import AIServiceError
from app.knowledge.provider_catalog import PROVIDER_DEFAULT_MODELS
from app.knowledge.providers import generate_answer
from app.knowledge.router import checked_citations
from app.knowledge.schemas import SourceChunk

KEY_VARIABLES = {
    "openai": "OPENAI_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}


async def verify(provider: str, key: str, model: str) -> bool:
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
                provider=provider,
                api_key=key,
                model=model,
                question="At what time does the fictional library open on Monday?",
                chunks=[chunk],
            )
        citations = checked_citations(draft, [chunk]) if draft.supported else []
        if not any("09:30" in citation.quote for citation in citations):
            print("LIVE CHECK FAILED: the response did not cite the expected source fact.")
            return False
    except AIServiceError as error:
        print(f"LIVE CHECK FAILED: {error.code} (HTTP {error.status_code}).")
        return False
    except Exception:
        print("LIVE CHECK FAILED: an unexpected local verification error occurred.")
        return False
    print(f"LIVE CHECK PASSED: {provider} responded with a checked exact source citation.")
    print("This does not establish desktop acceptance or semantic accuracy for other documents.")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", choices=list(KEY_VARIABLES), default="openai")
    parser.add_argument("--model", help="Override the selected provider's suggested model.")
    args = parser.parse_args()
    variable = KEY_VARIABLES[args.provider]
    key = os.environ.get(variable, "")
    if not key:
        if not sys.stdin.isatty():
            print(f"Use an interactive terminal for hidden key entry, or set {variable}.")
            return 2
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", getpass.GetPassWarning)
                key = getpass.getpass(f"{args.provider} API key (hidden; session only): ")
        except getpass.GetPassWarning:
            print("Hidden key entry is unavailable; no request sent.")
            return 2
        except (EOFError, KeyboardInterrupt):
            print("Live check cancelled; no request sent.")
            return 2
    if not key:
        print("Live check skipped: no key supplied.")
        return 2
    model = args.model if args.model is not None else PROVIDER_DEFAULT_MODELS[args.provider]
    return 0 if asyncio.run(verify(args.provider, key, model)) else 1


if __name__ == "__main__":
    raise SystemExit(main())
