"""The optional live-check CLI is tested with an injected transport, never a genuine key."""

import json

import httpx
import pytest

from scripts.verify_openai import verify_decision

KEY = "test-placeholder-not-a-live-key"


@pytest.mark.parametrize("reported_price,passed", [("£8.00", True), ("£800.00", False)])
def test_analysis_check_uses_actual_app_context_and_rejects_wrong_money_units(
    reported_price, passed, capsys
):
    calls = []

    def provider(request):
        calls.append(request)
        evidence = json.loads(json.loads(request.content)["input"][0]["content"])
        chunk = next(item for item in evidence["sources"] if item["chunk_id"] == "decision-context")
        summary = json.loads(chunk["text"])
        assert summary["recommended"]["id"] == "coach"
        assert summary["recommended"]["metrics"]["cost-pence"] == 800
        assert summary["recommended"]["metrics"]["duration-minutes"] == 120
        assert (
            next(item for item in summary["criteria"] if item["id"] == "cost-pence")["unit"]
            == "pence"
        )
        draft = {
            "answer": f"The fictional coach costs {reported_price} and takes 120 minutes.",
            "supported": True,
            "citations": [{"chunk_id": chunk["chunk_id"], "quote": '"cost-pence":800'}],
        }
        return httpx.Response(
            200,
            json={
                "status": "completed",
                "output": [
                    {
                        "type": "message",
                        "content": [{"type": "output_text", "text": json.dumps(draft)}],
                    }
                ],
            },
        )

    assert (
        verify_decision(KEY, "gpt-4.1-mini", ai_transport=httpx.MockTransport(provider)) is passed
    )
    assert len(calls) == 1
    assert calls[0].url == "https://api.openai.com/v1/responses"
    assert KEY not in calls[0].content.decode()
    output = capsys.readouterr().out
    assert KEY not in output
    assert ("ANALYSIS CHECK PASSED" in output) is passed


def test_analysis_check_prints_safe_auth_failure_without_echoing_provider_content(capsys):
    transport = httpx.MockTransport(lambda _: httpx.Response(401, text=KEY))
    assert verify_decision(KEY, "gpt-4.1-mini", ai_transport=transport) is False
    output = capsys.readouterr().out
    assert "AI_AUTH_ERROR" in output
    assert KEY not in output
