import pytest

from backend.extractor import Grid, read_grid
from backend.mapper import MappingError, run_import, validate_mapping

SCHEMA = {
    "subjects": [
        {"key": "math", "name": "Mathematics", "semester": "first"},
        {"key": "sci", "name": "Science", "semester": "second"},
    ],
    "months": ["jun", "jul"],
    "coreValues": ["makaDiyos"],
    "transferFields": ["admittedTo"],
}

GRID = Grid(
    rows=[
        ["Sample School", "", "", "", "", "", "", ""],
        ["No.", "Name", "LRN", "Sex", "Math Q1", "Math Q2", "Math Final", "Sci Q3"],
        [1, "Santos, Ana", 136000000001.0, "F", 88, "91%", 90, "n/a"],
        [2, "Reyes, Ben", "1.36E+11", "male", 70, 120, "abc", 80],
        ["", "", "", "", "", "", "", ""],
        ["", "Class Average", "", "", 79, 80, 81, 80],
    ],
    sheet="t",
)
RAW = {
    "header_row": 1, "first_data_row": 2,
    "columns": [
        {"col": 0, "field": "roll"}, {"col": 1, "field": "name"}, {"col": 2, "field": "lrn"}, {"col": 3, "field": "sex"},
        {"col": 4, "field": "grade:math:q1"}, {"col": 5, "field": "grade:math:q2"}, {"col": 6, "field": "grade:math:final"},
        {"col": 7, "field": "grade:sci:q3"},
        {"col": 7, "field": "grade:sci:q4"},  # duplicate col is fine; field is new
        {"col": 99, "field": "grade:math:q3"},  # out of range -> ignored
        {"col": 4, "field": "grade:nope:q1"},  # unknown field -> ignored
    ],
    "class_details": {"strand": "ABM", "bogus": "x"},
    "warnings": ["Science Q4 not found"],
}


def fake(raw):
    return lambda prompt, tool, client: raw


def test_values_are_copied_not_generated():
    out = run_import(GRID, SCHEMA, caller=fake(RAW))
    a, b = out["students"]
    assert [a["grades"]["math"][k] for k in ("q1", "q2", "final")] == [88, 91, 90]
    assert a["grades"]["sci"]["q3"] is None  # "n/a" stays blank
    assert (a["lrn"], b["lrn"]) == ("136000000001", "136000000000")
    assert (a["sex"], b["sex"]) == ("Female", "Male")
    assert b["grades"]["math"]["q2"] == 120  # out of range is kept; the review screen flags it
    assert b["grades"]["math"]["final"] is None
    assert any("abc" in w for w in out["warnings"])


def test_footer_row_is_not_a_learner_and_details_filtered():
    out = run_import(GRID, SCHEMA, caller=fake(RAW))
    assert len(out["students"]) == 2
    assert out["classDetails"] == {"strand": "ABM"}
    assert out["mapping"][1] == {"col": 1, "header": "Name", "field": "name"}


def test_bad_mappings_are_dropped_with_warnings():
    mapping, warnings = validate_mapping(RAW, SCHEMA, width=8, nrows=6)
    assert 99 not in mapping["columns"]
    assert "grade:nope:q1" not in mapping["columns"].values()
    assert any("Ignored" in w for w in warnings)


def test_missing_name_column_is_an_error():
    with pytest.raises(MappingError):
        run_import(GRID, SCHEMA, caller=fake({**RAW, "columns": [{"col": 4, "field": "grade:math:q1"}]}))


def test_every_expected_grade_key_exists():
    out = run_import(GRID, SCHEMA, caller=fake(RAW))
    assert set(out["students"][0]["grades"]["math"]) == {"q1", "q2", "final"}
    assert set(out["students"][0]["grades"]["sci"]) == {"q3", "q4", "final"}


def test_sample_workbook_reads(tmp_path):
    from pathlib import Path

    path = Path(__file__).resolve().parents[2] / "samples" / "messy_class.xlsx"
    grid = read_grid(path.name, path.read_bytes())
    assert grid.rows[0][0].startswith("Sample National")
    assert any(r[1] == "Class Average" for r in grid.rows)


def test_header_labels_join_two_header_rows_and_fill_merged_cells():
    grid = Grid(rows=[
        ["Title", "", "", ""],
        ["No.", "Name", "Math", ""],
        ["", "", "Q1", "Q2"],
        [1, "Ana", 90, 91],
    ])
    from backend.mapper import header_labels
    labels = header_labels(grid, 3, {0: "roll", 1: "name", 2: "grade:math:q1", 3: "grade:math:q2"})
    assert labels == {0: "No.", 1: "Name", 2: "Math · Q1", 3: "Math · Q2"}


def test_title_row_does_not_leak_into_header_labels():
    grid = Grid(rows=[["Sample School", "", "", ""], ["No.", "Name", "Math", "Sci"], [1, "Ana", 90, 91]], sheet="t")
    from backend.mapper import header_labels
    assert header_labels(grid, 2, {1: "name"}) == {1: "Name"}


def test_model_field_formatting_slips_are_tolerated():
    from backend.mapper import _clean_field

    assert _clean_field("Learner:name") == "name"
    assert _clean_field("student.lrn") == "lrn"
    assert _clean_field(" Grade:philosophy:q1 ") == "grade:philosophy:q1"
    assert _clean_field("grade:media_information_literacy:final") == "grade:media_information_literacy:final"
