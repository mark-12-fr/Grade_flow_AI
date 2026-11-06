"""assets/demo_import.json powers "Try demo class". It must stay in the real /api/import shape."""
import json
from pathlib import Path

from backend.tests.test_api import KEYS, MONTHS

FIXTURE = Path(__file__).resolve().parents[2] / "assets" / "demo_import.json"


def load():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_top_level_shape_matches_import_response():
    data = load()
    assert set(data) == {"students", "classDetails", "mapping", "warnings", "sheet"}
    for key in ("strand", "gradeLevel", "year", "term", "section", "studentStatus", "graduationStatus", "teacher", "principal"):
        assert data["classDetails"].get(key), f"classDetails.{key} missing, Continue would need manual confirmation"


def test_every_student_has_every_key_the_ui_reads():
    for s in load()["students"]:
        assert {"id", "roll", "name", "lrn", "sex", "birthdate", "grades", "attendance", "observedValues"} <= set(s)
        assert set(s["grades"]) == {k for k, _ in KEYS}
        assert set(s["attendance"]["schoolDays"]) <= set(MONTHS)


def test_demo_exercises_the_interesting_ui_states():
    students = load()["students"]
    grades = [(s["name"], v) for s in students for g in s["grades"].values() for v in g.values()]
    assert any(v is None for _, v in grades), "needs a blank grade for the Needs-correction state"
    assert any(v is not None and v < 75 for _, v in grades), "needs a failed grade"
    assert len({s["id"] for s in students}) == len(students)


def test_fictional_lrns_are_twelve_digits():
    assert all(len(s["lrn"]) == 12 and s["lrn"].isdigit() for s in load()["students"])
