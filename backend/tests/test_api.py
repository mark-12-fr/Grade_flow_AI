import json
from pathlib import Path

from fastapi.testclient import TestClient

from backend import mapper
from backend.main import app

SAMPLE = Path(__file__).resolve().parents[2] / "samples" / "messy_class.xlsx"
KEYS = [("media_information_literacy", "first"), ("philosophy", "first"), ("contemporary_arts", "first"),
        ("physical_science", "first"), ("pe_health_first", "first"), ("research_daily_life", "first"),
        ("filipino_larang", "first"), ("creative_writing", "first"), ("applied_social_sciences", "first"),
        ("pe_health_second", "second"), ("entrepreneurship", "second"), ("inquiries_immersion", "second"),
        ("empowerment_technologies", "second"), ("creative_nonfiction", "second"), ("philippine_politics", "second"),
        ("trends_networks", "second"), ("community_engagement", "second"), ("culminating_activity", "second")]
MONTHS = ["jun", "jul", "aug", "sep", "oct", "nov", "dec", "jan", "feb", "mar", "apr"]
SCHEMA = {
    "subjects": [{"key": k, "name": k, "semester": s} for k, s in KEYS],
    "months": MONTHS,
    "coreValues": ["makaDiyos", "makatao", "makakalikasan", "makabansa"],
    "transferFields": ["admittedTo"],
}


def model_stub(prompt, tool, client):
    """Stands in for Claude: lays out the sample's known column order."""
    cols = [{"col": 0, "field": "roll"}, {"col": 1, "field": "name"}, {"col": 2, "field": "lrn"},
            {"col": 3, "field": "sex"}, {"col": 4, "field": "birthdate"}]
    c = 5
    for key, sem in KEYS:
        for p in (["q1", "q2"] if sem == "first" else ["q3", "q4"]) + ["final"]:
            cols.append({"col": c, "field": f"grade:{key}:{p}"})
            c += 1
    for m in MONTHS:
        cols += [{"col": c, "field": f"att:{m}:schoolDays"}, {"col": c + 1, "field": f"att:{m}:present"}]
        c += 2
    return {"header_row": 5, "first_data_row": 6, "columns": cols,
            "class_details": {"strand": "ABM", "gradeLevel": "12", "year": "2026-2027", "section": "ABM12-A"}}


def post(client, name, data, schema=SCHEMA):
    return client.post("/api/import", files={"file": (name, data)}, data={"spec": json.dumps(schema)})


def test_sample_end_to_end(monkeypatch):
    import backend.main as main

    orig = mapper.run_import
    monkeypatch.setattr(main, "run_import", lambda grid, schema: orig(grid, schema, caller=model_stub))
    r = post(TestClient(app), "messy_class.xlsx", SAMPLE.read_bytes())
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["students"]) == 16 and body["classDetails"]["strand"] == "ABM"
    first = body["students"][0]
    assert first["name"] == "Santos, Maria Clara" and first["sex"] == "Female"
    assert len(first["lrn"]) == 12
    assert first["birthdate"].startswith("200")
    assert first["attendance"]["total"] == sum([10, 22, 23, 21, 22, 20, 14, 20, 19, 21, 12])
    blanks = [(s["name"], k, p) for s in body["students"] for k, g in s["grades"].items() for p, v in g.items() if v is None]
    assert len(blanks) == 1  # the one cell we left empty in the sample is still empty


def test_rejects_bad_input():
    c = TestClient(app)
    assert post(c, "x.txt", b"hello").status_code == 400
    assert post(c, "x.csv", b"").status_code == 400
    assert c.post("/api/import", files={"file": ("a.csv", b"a,b")}, data={"spec": "nope"}).status_code == 400


def test_missing_api_key_is_a_clear_503(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.delenv("AI_API_KEY", raising=False)
    r = post(TestClient(app), "a.csv", b"Name,Math Q1\nAna,90\n")
    assert r.status_code == 503 and "AI_API_KEY" in r.json()["detail"]


def test_health_and_static_do_not_leak_source():
    c = TestClient(app)
    assert c.get("/api/health").json()["ok"] is True
    assert c.get("/").status_code == 200
    assert c.get("/backend/main.py").status_code == 404
    assert c.get("/.env").status_code == 404
    assert c.get("/.git/config").status_code == 404
