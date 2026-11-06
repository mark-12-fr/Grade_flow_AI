"""GradeFlow AI backend: AI-assisted class import + static frontend."""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .extractor import ExtractError, extract_logo, read_grid, read_sheets
from .llm import is_configured
from .guard import LimitExceeded, guard, limiter, settings
from .mapper import MappingError, parse_schema, run_import
from .sf10 import run_import_sf10

ROOT = Path(__file__).resolve().parent.parent


def load_env_file(path: Path) -> None:
    """Read KEY=VALUE lines from .env into the environment (real environment variables win)."""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip().strip('"').strip("'")
        if key.strip() and value:
            os.environ.setdefault(key.strip(), value)


load_env_file(ROOT / ".env")
MAX_BYTES = 10 * 1024 * 1024

app = FastAPI(title="GradeFlow AI", docs_url=None, redoc_url=None)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "ai_configured": is_configured()}


@app.post("/api/import", dependencies=[Depends(guard)])
async def import_class(file: UploadFile = File(...), spec: str = Form(...)) -> dict:
    data = await file.read(MAX_BYTES + 1)
    if not data:
        raise HTTPException(400, "The file is empty.")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "The file is larger than 10 MB.")
    try:
        parsed_schema = parse_schema(spec)
    except MappingError as exc:
        raise HTTPException(400, str(exc)) from exc
    def work() -> dict:
        grid = read_grid(file.filename or "", data)
        limiter.take_call()
        result = run_import(grid, parsed_schema)
        result["schoolLogo"] = extract_logo(file.filename or "", data)
        return result

    try:
        return await run_in_threadpool(work)
    except ExtractError as exc:
        raise HTTPException(400, str(exc)) from exc
    except LimitExceeded as exc:
        raise HTTPException(429, str(exc)) from exc
    except MappingError as exc:
        # 503: server not configured, 422: file can't be understood, 502: AI service failed
        status = 503 if exc.kind == "config" else 422 if exc.kind == "file" else 502
        raise HTTPException(status, str(exc)) from exc


@app.post("/api/import-sf10", dependencies=[Depends(guard)])
async def import_sf10(file: UploadFile = File(...)) -> dict:
    data = await file.read(MAX_BYTES + 1)
    if not data:
        raise HTTPException(400, "The file is empty.")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "The file is larger than 10 MB.")
    def work() -> dict:
        grids = read_sheets(file.filename or "", data, limit=1000)
        cfg = settings()
        if cfg["max_sheets"] and len(grids) > cfg["max_sheets"]:
            raise HTTPException(422, f"This workbook has {len(grids)} sheets; the AI reads one learner per sheet "
                                     f"and the limit is {cfg['max_sheets']}. Upload a file with only the SF10 sheets.")
        result = run_import_sf10(grids, spend=limiter.take_call, max_chars=cfg["max_sheet_chars"])
        result["schoolLogo"] = extract_logo(file.filename or "", data)
        return result

    try:
        return await run_in_threadpool(work)
    except ExtractError as exc:
        raise HTTPException(400, str(exc)) from exc
    except LimitExceeded as exc:
        raise HTTPException(429, str(exc)) from exc
    except MappingError as exc:
        status = 503 if exc.kind == "config" else 422 if exc.kind == "file" else 502
        raise HTTPException(status, str(exc)) from exc


# Serve only the frontend files, never the repo root (it holds backend code, .git, .env).
@app.get("/")
def index() -> FileResponse:
    return FileResponse(ROOT / "index.html")


for folder in ("css", "js", "assets"):
    app.mount(f"/{folder}", StaticFiles(directory=ROOT / folder), name=folder)
