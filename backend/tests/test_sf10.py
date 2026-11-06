import io

from openpyxl import Workbook

from backend.extractor import read_sheets
from backend.sf10 import run_import_sf10


def workbook() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "CULLO"
    ws.append(["LAST NAME:", "CULLO", "FIRST NAME:", "PRINCESS FIONA", "MIDDLE NAME:", "MARCIAL"])
    ws.append(["LRN:", "117624130043", "Sex:", "FEMALE"])
    ws.append(["Core", "Oral Communication in Context", 84, 86, 85, "PASSED"])
    ws.append(["Core", "General Mathematics", 78, 85, 82, "PASSED"])
    ws.append(["General Ave. for the Semester:", 84, "PASSED"])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def stub(prompt, tool, client, max_tokens=0):
    return {
        "learner": {"lastName": "CULLO", "firstName": "PRINCESS FIONA", "middleName": "MARCIAL", "lrn": "117624130043", "sex": "FEMALE"},
        "semesters": [{"gradeLevel": "11", "sy": "2024-2025", "sem": "1", "rows": [
            {"category": "Core", "subject": "Oral Communication in Context", "q1": "84", "q2": "86", "final": "85", "action": "passed"},
            {"category": "Core", "subject": "General Mathematics", "q1": "78", "q2": "99", "final": "82", "action": "PASSED"}],
            "average": "84", "averageAction": "PASSED"}],
    }


def test_sf10_import_keeps_only_values_present_in_sheet():
    result = run_import_sf10(read_sheets("x.xlsx", workbook()), caller=stub)
    student = result["students"][0]
    assert student["lrn"] == "117624130043" and student["middleName"] == "MARCIAL"
    rows = student["sf10"]["semesters"][0]["rows"]
    assert rows[0]["final"] == "85" and rows[0]["action"] == "PASSED"
    assert rows[1]["q2"] == ""  # 99 never appears in the sheet, so it is dropped
    assert any("99" in w for w in result["warnings"])
    assert student["sf10"]["semesters"][0]["average"] == "84"
