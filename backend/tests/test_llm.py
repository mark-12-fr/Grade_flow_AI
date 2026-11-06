import json

import httpx
import pytest

from backend import llm

TOOL = {"input_schema": {"type": "object", "properties": {"a": {"type": "string"}}}}


def fake_client(handler):
    real = httpx.Client
    return lambda **kw: real(transport=httpx.MockTransport(handler), **kw)


def test_parse_json_accepts_fences_and_prose():
    assert llm.parse_json('```json\n{"a": "1"}\n```') == {"a": "1"}
    assert llm.parse_json('Here you go: {"a": "2"} thanks') == {"a": "2"}
    with pytest.raises(llm.AiError):
        llm.parse_json("no json here")


def test_call_ai_sends_openai_style_request(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "groq")
    monkeypatch.setenv("AI_API_KEY", "k-123")
    seen = {}

    def handler(request):
        seen["url"], seen["auth"], seen["body"] = str(request.url), request.headers["authorization"], json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"a": "ok"}'}}]})

    monkeypatch.setattr(httpx, "Client", fake_client(handler))
    assert llm.call_ai("hello", TOOL) == {"a": "ok"}
    assert seen["url"].endswith("/openai/v1/chat/completions") and seen["auth"] == "Bearer k-123"
    assert seen["body"]["messages"][1]["content"] == "hello" and seen["body"]["response_format"] == {"type": "json_object"}


@pytest.mark.parametrize("status,kind", [(401, "config"), (429, "ai"), (500, "ai")])
def test_call_ai_errors_are_clear(monkeypatch, status, kind):
    monkeypatch.setattr(llm.time, "sleep", lambda seconds: None)
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("AI_API_KEY", "k")
    monkeypatch.setattr(httpx, "Client", fake_client(lambda r: httpx.Response(status, text="x")))
    with pytest.raises(llm.AiError) as exc:
        llm.call_ai("p", TOOL)
    assert exc.value.kind == kind


def test_ollama_needs_no_key(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "ollama")
    monkeypatch.delenv("AI_API_KEY", raising=False)
    assert llm.is_configured()


def test_busy_provider_is_retried(monkeypatch):
    monkeypatch.setattr(llm.time, "sleep", lambda seconds: None)
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("AI_API_KEY", "k")
    calls = []

    def handler(request):
        calls.append(1)
        if len(calls) < 3:
            return httpx.Response(503, text="busy")
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"a": "ok"}'}, "finish_reason": "stop"}]})

    monkeypatch.setattr(httpx, "Client", fake_client(handler))
    assert llm.call_ai("p", TOOL) == {"a": "ok"} and len(calls) == 3
