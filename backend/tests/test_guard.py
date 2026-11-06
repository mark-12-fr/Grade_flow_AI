import json

from fastapi.testclient import TestClient

from backend import mapper
from backend.guard import limiter
from backend.main import app
from backend.tests.test_api import SAMPLE, SCHEMA, model_stub


def setup_function():
    limiter.reset()


def post(client, headers=None):
    return client.post("/api/import", files={"file": ("messy_class.xlsx", SAMPLE.read_bytes())},
                       data={"spec": json.dumps(SCHEMA)}, headers=headers or {})


def stub_ai(monkeypatch):
    import backend.main as main

    orig = mapper.run_import
    monkeypatch.setattr(main, "run_import", lambda grid, schema: orig(grid, schema, caller=model_stub))


def test_per_ip_rate_limit(monkeypatch):
    monkeypatch.setenv("AI_RATE_LIMIT", "2")
    stub_ai(monkeypatch)
    c = TestClient(app)
    assert post(c).status_code == 200
    assert post(c).status_code == 200
    r = post(c)
    assert r.status_code == 429 and "Retry-After" in r.headers


def test_daily_cap(monkeypatch):
    monkeypatch.setenv("AI_DAILY_CAP", "1")
    monkeypatch.setenv("AI_RATE_LIMIT", "0")
    stub_ai(monkeypatch)
    c = TestClient(app)
    assert post(c).status_code == 200
    assert post(c).status_code == 429


def test_access_code_required(monkeypatch):
    monkeypatch.setenv("APP_ACCESS_CODE", "secret")
    stub_ai(monkeypatch)
    c = TestClient(app)
    assert post(c).status_code == 401
    assert post(c, {"X-Access-Code": "wrong"}).status_code == 401
    assert post(c, {"X-Access-Code": "secret"}).status_code == 200


def test_health_never_exposes_the_key(monkeypatch):
    monkeypatch.setenv("AI_API_KEY", "test-key-123")
    body = TestClient(app).get("/api/health").text
    assert "test-key-123" not in body and "true" in body


def test_sf10_sheet_cap(monkeypatch):
    import io
    from openpyxl import Workbook

    monkeypatch.setenv("AI_MAX_SHEETS", "2")
    wb = Workbook()
    for i in range(3):
        ws = wb.active if i == 0 else wb.create_sheet()
        ws.append(["a", i])
    buf = io.BytesIO(); wb.save(buf)
    r = TestClient(app).post("/api/import-sf10", files={"file": ("x.xlsx", buf.getvalue())})
    assert r.status_code == 422 and "3 sheets" in r.text
