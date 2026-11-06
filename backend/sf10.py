"""AI reader for SF10 (Senior High School permanent record) workbooks.

An SF10 is a printed form, not a table, so the model reads the whole sheet and returns the
record as structured data. Every number it returns is then checked against the sheet's own
cells: a grade the model could not have read from the sheet is dropped, never kept.
"""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

from .extractor import Grid, full_text
from .mapper import MappingError, call_claude

TEXT = {"type": "string"}


def _obj(props: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": props, "required": required or []}


SEMESTER = _obj({
    "school": TEXT, "schoolId": TEXT, "gradeLevel": TEXT, "sy": TEXT, "sem": {"type": "string", "description": "1 or 2"},
    "track": TEXT, "section": TEXT,
    "rows": {"type": "array", "items": _obj({
        "category": {"type": "string", "description": "Core, Applied or Specialized"}, "subject": TEXT,
        "q1": TEXT, "q2": TEXT, "final": TEXT, "action": {"type": "string", "description": "PASSED or FAILED"}})},
    "average": TEXT, "averageAction": TEXT, "remarks": TEXT,
    "adviser": TEXT, "principal": TEXT, "dateChecked": TEXT,
    "remedial": _obj({"from": TEXT, "to": TEXT, "school": TEXT, "schoolId": TEXT, "teacher": TEXT,
                      "rows": {"type": "array", "items": _obj({"category": TEXT, "subject": TEXT, "final": TEXT,
                                                               "remedialMark": TEXT, "recomputed": TEXT, "action": TEXT})}}),
})

TOOL = {
    "name": "submit_sf10",
    "description": "Report the SF10 record exactly as written in the sheet. Leave a field empty when the sheet does not show it. Never invent or compute values.",
    "input_schema": _obj({
        "learner": _obj({"lastName": TEXT, "firstName": TEXT, "middleName": TEXT, "lrn": TEXT,
                         "birthdate": {"type": "string", "description": "Date of birth as shown"}, "sex": TEXT}),
        "eligibility": _obj({
            "hsCompleter": {"type": "boolean"}, "hsGenAve": TEXT, "jhsCompleter": {"type": "boolean"}, "jhsGenAve": TEXT,
            "completionDate": TEXT, "schoolName": TEXT, "schoolAddress": TEXT,
            "peptPasser": {"type": "boolean"}, "peptRating": TEXT, "alsPasser": {"type": "boolean"}, "alsRating": TEXT,
            "alsDate": TEXT, "alsCenter": TEXT, "others": TEXT}),
        "semesters": {"type": "array", "description": "Every Scholastic Record block in order (each grade level and semester).", "items": SEMESTER},
        "completion": _obj({"trackAccomplished": TEXT, "shsAverage": TEXT, "awards": TEXT, "graduationDate": TEXT,
                            "certifiedBy": TEXT, "remarks": TEXT, "purpose": TEXT, "dateIssued": TEXT}),
        "warnings": {"type": "array", "items": TEXT},
    }, ["learner", "semesters"]),
}


def build_prompt(grid: Grid) -> str:
    return f"""This sheet is a Philippine DepEd SF10-SHS (Senior High School Student Permanent Record) for ONE learner.
Read it and call submit_sf10 exactly once.

- Copy values exactly as written (grades as digits, dates as shown, names in the sheet's spelling).
- `semesters` has one entry per SCHOLASTIC RECORD block (school, grade level, SY, SEM, track/strand, section, subject rows,
  General Ave. for the Semester, remarks, Prepared by / Certified True and Correct names, Date Checked, and the Remedial Classes block under it).
- Subject rows: category (Core / Applied / Specialized), subject, 1st/2nd (or 3rd/4th) quarter grade as q1/q2, semester final, action taken.
  Skip empty rows.
- Learner information, Eligibility for SHS Enrolment (checkboxes -> booleans), and the final SHS completion block
  (track accomplished, SHS general average, awards, graduation date, certified by, remarks/purpose, date issued).
- If something is not on the sheet, leave it empty. Never calculate, guess or fix values. Put doubts in `warnings`.

Sheet "{grid.sheet}" (row: column=value):
{full_text(grid)}
"""


def _tokens(grid: Grid) -> set[str]:
    out: set[str] = set()
    for row in grid.rows:
        for c in row:
            t = str(c).strip()
            if t:
                out.add(t)
                if re.fullmatch(r"\d+\.0+", t):
                    out.add(t.split(".")[0])
    return out


def _grade(value: object, tokens: set[str], where: str, warnings: list[str]) -> str:
    t = str(value or "").strip()
    if not t:
        return ""
    if t not in tokens:
        warnings.append(f"{where}: '{t}' was not found in the sheet; left blank.")
        return ""
    return t


def _s(value: object, limit: int = 120) -> str:
    return str(value or "").strip()[:limit]


def normalize(raw: dict, grid: Grid, index: int) -> tuple[dict, list[str]]:
    tokens = _tokens(grid)
    warnings = [str(w) for w in raw.get("warnings", []) if str(w).strip()]
    learner = raw.get("learner") or {}
    last, first, middle = _s(learner.get("lastName")), _s(learner.get("firstName")), _s(learner.get("middleName"))
    if not (last or first):
        raise MappingError(f'Sheet "{grid.sheet}": could not find the learner name.', "file")
    lrn = re.sub(r"\D", "", _s(learner.get("lrn")))
    el = raw.get("eligibility") or {}
    eligibility = {k: (bool(el.get(k)) if k in ("hsCompleter", "jhsCompleter", "peptPasser", "alsPasser") else _s(el.get(k)))
                   for k in ("hsCompleter", "hsGenAve", "jhsCompleter", "jhsGenAve", "completionDate", "schoolName", "schoolAddress",
                             "peptPasser", "peptRating", "alsPasser", "alsRating", "alsDate", "alsCenter", "others")}
    semesters = []
    for n, sem in enumerate(raw.get("semesters") or [], 1):
        label = f"Semester block {n}"
        rows = []
        for r in sem.get("rows") or []:
            subject = _s(r.get("subject"), 90)
            if not subject:
                continue
            rows.append({"category": _s(r.get("category"), 20), "subject": subject,
                         "q1": _grade(r.get("q1"), tokens, f"{label} {subject}", warnings),
                         "q2": _grade(r.get("q2"), tokens, f"{label} {subject}", warnings),
                         "final": _grade(r.get("final"), tokens, f"{label} {subject}", warnings),
                         "action": _s(r.get("action"), 12).upper()})
        rem = sem.get("remedial") or {}
        semesters.append({
            "school": _s(sem.get("school")), "schoolId": _s(sem.get("schoolId"), 20), "gradeLevel": _s(sem.get("gradeLevel"), 10),
            "sy": _s(sem.get("sy"), 20), "sem": re.sub(r"\D", "", _s(sem.get("sem"), 6))[:1] or ("1" if n % 2 else "2"),
            "track": _s(sem.get("track")), "section": _s(sem.get("section"), 40), "rows": rows,
            "average": _grade(sem.get("average"), tokens, f"{label} general average", warnings),
            "averageAction": _s(sem.get("averageAction"), 12).upper(), "remarks": _s(sem.get("remarks"), 200),
            "adviser": _s(sem.get("adviser")), "principal": _s(sem.get("principal")), "dateChecked": _s(sem.get("dateChecked"), 20),
            "remedial": {"from": _s(rem.get("from"), 20), "to": _s(rem.get("to"), 20), "school": _s(rem.get("school")),
                         "schoolId": _s(rem.get("schoolId"), 20), "teacher": _s(rem.get("teacher")),
                         "rows": [{k: _s(x.get(k), 90) for k in ("category", "subject", "final", "remedialMark", "recomputed", "action")}
                                  for x in (rem.get("rows") or []) if _s(x.get("subject"))]},
        })
    if not semesters:
        raise MappingError(f'Sheet "{grid.sheet}": no Scholastic Record was found.', "file")
    comp = raw.get("completion") or {}
    completion = {k: _s(comp.get(k), 300) for k in ("trackAccomplished", "shsAverage", "awards", "graduationDate",
                                                     "certifiedBy", "remarks", "purpose", "dateIssued")}
    name = ", ".join(x for x in [last, " ".join(x for x in [first, middle] if x)] if x)
    student = {
        "id": index, "roll": str(index).zfill(2), "name": name, "lastName": last, "firstName": first, "middleName": middle,
        "lrn": lrn, "sex": _s(learner.get("sex"), 10), "birthdate": _s(learner.get("birthdate"), 20), "age": "",
        "grades": {}, "attendance": {"present": None, "total": None, "months": {}, "schoolDays": {}, "absent": {}},
        "transfer": {}, "observedValues": {}, "comment": "", "commentReviewed": True, "traits": None, "nextSteps": None,
        "sf10": {"eligibility": eligibility, "semesters": semesters, "completion": completion},
    }
    return student, warnings


def run_import_sf10(grids: list[Grid], client: Any | None = None, caller: Callable[..., dict] = call_claude) -> dict:
    def one(item: tuple[int, Grid]) -> tuple[dict | None, list[str]]:
        i, grid = item
        try:
            raw = caller(build_prompt(grid), TOOL, client, max_tokens=8000)
            student, warns = normalize(raw, grid, i)
            return student, warns
        except MappingError as exc:
            if exc.kind != "file":
                raise
            return None, [str(exc)]

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(one, enumerate(grids, 1)))
    students = [s for s, _ in results if s]
    warnings = [w for _, ws in results for w in ws]
    if not students:
        raise MappingError(warnings[0] if warnings else "No SF10 record was found in this file.", "file")
    return {"students": students, "warnings": warnings[:60], "sheets": len(grids)}
