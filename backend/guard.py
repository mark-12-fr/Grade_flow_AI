"""Spend and abuse protection for the AI endpoints.

- Optional access code (APP_ACCESS_CODE): without it, nobody else can use your API key through this server.
- Per-IP rate limit (sliding window) so one visitor cannot burn credits.
- Global daily cap on AI calls as a hard ceiling on the bill.
All limits are in memory and configurable with environment variables.
"""
from __future__ import annotations

import hmac
import os
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


def _int(name: str, default: int) -> int:
    try:
        return max(0, int(os.environ.get(name, default)))
    except ValueError:
        return default


def settings() -> dict:
    return {
        "rate_limit": _int("AI_RATE_LIMIT", 6),           # AI requests per window, per IP
        "rate_window": _int("AI_RATE_WINDOW", 600),       # seconds
        "daily_cap": _int("AI_DAILY_CAP", 60),            # AI calls per day, whole server
        "max_sheets": _int("AI_MAX_SHEETS", 8),           # sheets (= AI calls) per SF10 upload
        "max_sheet_chars": _int("AI_MAX_SHEET_CHARS", 60000),  # ~20k tokens per sheet
    }


class LimitExceeded(RuntimeError):
    pass


class Limiter:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.hits: dict[str, deque] = defaultdict(deque)
        self.day = time.strftime("%Y-%m-%d")
        self.calls = 0

    def reset(self) -> None:
        with self.lock:
            self.hits.clear()
            self.calls = 0

    def check_ip(self, ip: str) -> None:
        cfg = settings()
        if not cfg["rate_limit"]:
            return
        now = time.monotonic()
        with self.lock:
            q = self.hits[ip]
            while q and now - q[0] > cfg["rate_window"]:
                q.popleft()
            if len(q) >= cfg["rate_limit"]:
                wait = int(cfg["rate_window"] - (now - q[0])) + 1
                raise HTTPException(429, f"Too many AI requests. Try again in {wait} seconds.",
                                    headers={"Retry-After": str(wait)})
            q.append(now)

    def take_call(self) -> None:
        """Count one AI call against the daily cap; raise when the cap is used up."""
        cap = settings()["daily_cap"]
        with self.lock:
            today = time.strftime("%Y-%m-%d")
            if today != self.day:
                self.day, self.calls = today, 0
            if cap and self.calls >= cap:
                raise LimitExceeded("The daily AI limit was reached. Try again tomorrow or raise AI_DAILY_CAP.")
            self.calls += 1


limiter = Limiter()


def client_ip(request: Request) -> str:
    if os.environ.get("TRUST_PROXY") == "1":
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def guard(request: Request) -> None:
    """FastAPI dependency for every AI endpoint."""
    code = os.environ.get("APP_ACCESS_CODE", "")
    if code and not hmac.compare_digest(request.headers.get("x-access-code", ""), code):
        raise HTTPException(401, "An access code is required to use the AI import.")
    limiter.check_ip(client_ip(request))
