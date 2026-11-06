"""Free-tier friendly AI client.

Talks to any OpenAI-compatible chat endpoint, so you can use a free provider:
  gemini      Google AI Studio free tier   (key: https://aistudio.google.com/apikey)
  groq        Groq free tier               (key: https://console.groq.com/keys)
  openrouter  OpenRouter ":free" models    (key: https://openrouter.ai/keys)
  ollama      Runs on your own computer, no key, no limits (https://ollama.com)
The model returns JSON that matches the tool's schema; code validates it afterwards.
"""
from __future__ import annotations

import json
import os
import re
import time
from typing import Any

PROVIDERS = {
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.5-flash", True),
    "groq": ("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile", True),
    "openrouter": ("https://openrouter.ai/api/v1", "meta-llama/llama-3.3-70b-instruct:free", True),
    "ollama": ("http://localhost:11434/v1", "llama3.1", False),
}


class AiError(RuntimeError):
    """kind: 'config' (server not set up), 'ai' (service failure)."""

    def __init__(self, message: str, kind: str = "ai"):
        super().__init__(message)
        self.kind = kind


def provider() -> tuple[str, str, str, bool]:
    name = os.environ.get("AI_PROVIDER", "gemini").strip().lower()
    if name not in PROVIDERS:
        raise AiError(f"AI_PROVIDER must be one of: {', '.join(PROVIDERS)}.", "config")
    base, model, needs_key = PROVIDERS[name]
    return name, os.environ.get("AI_BASE_URL", base).rstrip("/"), os.environ.get("AI_MODEL", model), needs_key


def is_configured() -> bool:
    try:
        _, _, _, needs_key = provider()
    except AiError:
        return False
    return bool(os.environ.get("AI_API_KEY")) or not needs_key


def parse_json(text: str) -> dict:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fenced:
        text = fenced.group(1).strip()
    if not text.startswith("{"):
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            text = text[start:end + 1]
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise AiError("The AI answer was not valid JSON.") from exc
    if not isinstance(data, dict):
        raise AiError("The AI answer was not a JSON object.")
    return data


def call_ai(prompt: str, tool: dict, client: Any | None = None, max_tokens: int = 4096) -> dict:
    name, base, model, needs_key = provider()
    key = os.environ.get("AI_API_KEY", "")
    if needs_key and not key:
        raise AiError(f"AI_API_KEY is not set on the server (AI_PROVIDER={name}). See .env.example.", "config")
    import httpx

    system = ("You are a careful data-extraction engine. Reply with ONE JSON object only (no prose, no markdown) "
              "that follows this JSON Schema exactly. Use empty strings or empty arrays when a value is not present.\n"
              + json.dumps(tool["input_schema"]))
    # Output budget: JSON for a whole gradebook mapping is long, and thinking models spend tokens before answering.
    body = {"model": model, "max_tokens": max(max_tokens, 8192), "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]}
    if name == "gemini":
        body["reasoning_effort"] = "none"  # extraction needs no deliberation; keeps answers fast and complete
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    r = None
    for attempt, pause in enumerate((0, 2, 5, 10)):
        if pause:
            time.sleep(pause)
        try:
            with httpx.Client(timeout=120) as http:
                r = http.post(f"{base}/chat/completions", json=body, headers=headers)
        except httpx.HTTPError as exc:
            if attempt == 3:
                raise AiError(f"Could not reach the AI service ({name}): {exc.__class__.__name__}.") from exc
            continue
        if r.status_code not in (500, 502, 503, 504):  # free tiers drop busy requests; try again shortly
            break
    if r.status_code == 429:
        raise AiError("The free AI quota was reached. Wait a minute and try again.")
    if r.status_code in (401, 403):
        raise AiError(f"The AI provider rejected the key (HTTP {r.status_code}). Check AI_API_KEY.", "config")
    if r.status_code >= 400:
        raise AiError(f"The AI service failed (HTTP {r.status_code}): {r.text[:200]}")
    try:
        choice = r.json()["choices"][0]
        content = choice["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise AiError("The AI service returned an unexpected answer.") from exc
    if choice.get("finish_reason") == "length":
        raise AiError("The AI answer was cut off (too long for this model). Try a smaller file or a model with a larger output limit.")
    return parse_json(content or "")
