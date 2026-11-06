"""Build assets/demo_import.json, the "Try demo class" fixture.

It is the real /api/import response shape: the messy sample workbook is read through the
production mapper with the test stub standing in for Claude. Then a few learners are
adjusted so every UI state shows up (Needs correction, Failed, tied ranks, observed values).
All names are fictional. Run from the repo root:  python samples/make_demo_fixture.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend" / "tests"))

from backend import mapper  # noqa: E402
from backend.extractor import read_grid  # noqa: E402
from test_api import SCHEMA, model_stub  # noqa: E402

sample = ROOT / "samples" / "messy_class.xlsx"
result = mapper.run_import(read_grid(sample.name, sample.read_bytes()), SCHEMA, caller=model_stub)
students = {s["name"]: s for s in result["students"]}


def set_subject(name, key, q_a, q_b, final):
    g = students[name]["grades"][key]
    qs = ("q1", "q2") if "q1" in g else ("q3", "q4")
    g[qs[0]], g[qs[1]], g["final"] = q_a, q_b, final


# Failed subjects: one learner fails two, another fails one.
set_subject("Bautista, Rafael", "pe_health_second", 70, 72, 71)
set_subject("Bautista, Rafael", "entrepreneurship", 68, 73, 71)
set_subject("Garcia, Paolo", "philippine_politics", 72, 74, 73)

# Observed values (AO/SO/RO/NO) for a few learners so the SF9/SF10 tables aren't empty.
ratings = {"makaDiyos": "AO", "makatao": "AO", "makakalikasan": "SO", "makabansa": "AO"}
for name in ("Santos, Maria Clara", "Reyes, Juan Miguel", "Cruz, Angelica", "Salvador, Hazel"):
    for value, rating in ratings.items():
        students[name]["observedValues"][value] = {q: rating for q in ("q1", "q2", "q3", "q4")}
students["Reyes, Juan Miguel"]["observedValues"]["makakalikasan"] = {"q1": "SO", "q2": "SO", "q3": "RO", "q4": "SO"}

details = {
    "strand": "ABM", "gradeLevel": "12", "year": "2026-2027", "term": "Annual Report",
    "section": "ABM12-A", "studentStatus": "Regular", "graduationStatus": "Recommended",
    "teacher": "Ms. Rosa D. Lim", "principal": "Dr. Elena Navarro",
}
fixture = {
    "students": result["students"],
    "classDetails": details,
    "mapping": result["mapping"],
    "warnings": [
        "Demo: one grade cell is blank in the source file and was left blank (see Cruz, Angelica).",
        "Demo: the 'Class Average' footer row was recognised and not imported as a learner.",
    ],
    "sheet": result["sheet"],
}


# Self-check: the states the demo promises must actually be present.
def final_avg(s):
    # Same rule as GF.computeRanks: any missing grade (quarters included) means unranked.
    if any(v is None for g in s["grades"].values() for v in g.values()):
        return None
    vals = [g["final"] for g in s["grades"].values()]
    return sum(vals) / len(vals)


avgs = [round(a * 100) for a in map(final_avg, result["students"]) if a is not None]
assert any(v is None for s in result["students"] for g in s["grades"].values() for v in g.values()), "no blank grade"
assert len(avgs) != len(set(avgs)), "no tied averages"
assert any(g["final"] < 75 for s in result["students"] for g in s["grades"].values() if g["final"] is not None), "no failed grade"

out = ROOT / "assets" / "demo_import.json"
out.write_text(json.dumps(fixture, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"wrote {out.relative_to(ROOT)}: {len(fixture['students'])} learners, {len(avgs)} ranked, {len(avgs) - len(set(avgs))} tied")
