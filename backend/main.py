"""GradeFlow AI backend: AI-assisted class import + static frontend."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .extractor import ExtractError, extract_logo, read_grid, read_sheets
from .mapper import MappingError, parse_schema, run_import
from .sf10 import run_import_sf10

ROOT = Path(__file__).resolve().parent.parent
MAX_BYTES = 10 * 1024 * 1024

app = FastAPI(title="GradeFlow AI", docs_url=None, redoc_url=None)


@app.get("/api/health")
def health() -> dict:
    import os

    return {"ok": True, "ai_configured": bool(os.environ.get("ANTHROPIC_API_KEY"))}


@app.post("/api/import")
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
    try:
        grid = read_grid(file.filename or "", data)
        result = run_import(grid, parsed_schema)
        result["schoolLogo"] = extract_logo(file.filename or "", data)
        return result
    except ExtractError as exc:
        raise HTTPException(400, str(exc)) from exc
    except MappingError as exc:
        # 503: server not configured, 422: file can't be understood, 502: AI service failed
        status = 503 if exc.kind == "config" else 422 if exc.kind == "file" else 502
        raise HTTPException(status, str(exc)) from exc


@app.post("/api/import-sf10")
async def import_sf10(file: UploadFile = File(...)) -> dict:
    data = await file.read(MAX_BYTES + 1)
    if not data:
        raise HTTPException(400, "The file is empty.")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "The file is larger than 10 MB.")
    try:
        result = run_import_sf10(read_sheets(file.filename or "", data))
        result["schoolLogo"] = extract_logo(file.filename or "", data)
        return result
    except ExtractError as exc:
        raise HTTPException(400, str(exc)) from exc
    except MappingError as exc:
        status = 503 if exc.kind == "config" else 422 if exc.kind == "file" else 502
        raise HTTPException(status, str(exc)) from exc


# Serve only the frontend files, never the repo root (it holds backend code, .git, .env).
@app.get("/")
def index() -> FileResponse:
    return FileResponse(ROOT / "index.html")


for folder in ("css", "js", "assets"):
    app.mount(f"/{folder}", StaticFiles(directory=ROOT / folder), name=folder)
