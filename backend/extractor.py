"""Read a class gradebook (xlsx / xls / csv) into a plain grid of cell values."""
from __future__ import annotations

import csv
import datetime as dt
import io
from dataclasses import dataclass, field

MAX_ROWS = 600
MAX_COLS = 120


class ExtractError(ValueError):
    """The file could not be read as a spreadsheet."""


@dataclass
class Grid:
    rows: list[list[object]]
    sheet: str = ""
    skipped_sheets: list[str] = field(default_factory=list)


def _clean(value: object) -> object:
    if value is None:
        return ""
    if isinstance(value, dt.datetime):
        return value.date().isoformat()
    if isinstance(value, dt.date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        return value.strip()
    return value


def _trim(rows: list[list[object]]) -> list[list[object]]:
    cleaned = [[_clean(c) for c in row[:MAX_COLS]] for row in rows[:MAX_ROWS]]
    cleaned = [r for r in cleaned if any(str(c).strip() for c in r)]
    width = max((max((i for i, c in enumerate(r) if str(c).strip() != ""), default=-1) + 1 for r in cleaned), default=0)
    return [r + [""] * (width - len(r)) if len(r) < width else r[:width] for r in cleaned]


def _non_empty_cells(rows: list[list[object]]) -> int:
    return sum(1 for r in rows for c in r if str(c).strip() != "")


def read_grid(filename: str, data: bytes) -> Grid:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "csv":
        text = data.decode("utf-8-sig", errors="replace")
        rows = list(csv.reader(io.StringIO(text)))
        return Grid(rows=_trim(rows), sheet="csv")
    if ext == "xlsx":
        from openpyxl import load_workbook

        try:
            wb = load_workbook(io.BytesIO(data), data_only=True, read_only=True)
        except Exception as exc:  # corrupt / not a real xlsx
            raise ExtractError(f"Could not open the Excel file: {exc}") from exc
        sheets = {ws.title: _trim([list(r) for r in ws.iter_rows(values_only=True)]) for ws in wb.worksheets}
    elif ext == "xls":
        import xlrd

        try:
            book = xlrd.open_workbook(file_contents=data)
        except Exception as exc:
            raise ExtractError(f"Could not open the Excel file: {exc}") from exc
        sheets = {}
        for sh in book.sheets():
            raw = []
            for r in range(min(sh.nrows, MAX_ROWS)):
                row = []
                for c in range(min(sh.ncols, MAX_COLS)):
                    cell = sh.cell(r, c)
                    if cell.ctype == xlrd.XL_CELL_DATE:
                        row.append(dt.datetime(*xlrd.xldate_as_tuple(cell.value, book.datemode)))
                    else:
                        row.append(cell.value)
                raw.append(row)
            sheets[sh.name] = _trim(raw)
    else:
        raise ExtractError("Unsupported file type. Use .xlsx, .xls or .csv.")

    if not sheets:
        raise ExtractError("The workbook has no sheets.")
    primary = max(sheets, key=lambda name: _non_empty_cells(sheets[name]))
    if not sheets[primary]:
        raise ExtractError("The file is empty.")
    return Grid(rows=sheets[primary], sheet=primary, skipped_sheets=[n for n in sheets if n != primary and sheets[n]])


def col_letter(index: int) -> str:
    out = ""
    n = index + 1
    while n:
        n, rem = divmod(n - 1, 26)
        out = chr(65 + rem) + out
    return out


def preview_text(grid: Grid, limit: int = 15) -> str:
    """Top rows as a tab-separated table with row/column indexes the model can cite."""
    width = len(grid.rows[0]) if grid.rows else 0
    lines = ["row\\col\t" + "\t".join(f"{i}({col_letter(i)})" for i in range(width))]
    for r, row in enumerate(grid.rows[:limit]):
        lines.append(f"{r}\t" + "\t".join(str(c).replace("\t", " ").replace("\n", " ")[:60] for c in row))
    return "\n".join(lines)


def read_sheets(filename: str, data: bytes, limit: int = 40) -> list[Grid]:
    """Every non-empty sheet as its own grid (an SF10 workbook is usually one learner per sheet)."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "csv":
        return [read_grid(filename, data)]
    if ext == "xlsx":
        from openpyxl import load_workbook

        try:
            wb = load_workbook(io.BytesIO(data), data_only=True, read_only=True)
        except Exception as exc:
            raise ExtractError(f"Could not open the Excel file: {exc}") from exc
        grids = [Grid(rows=_trim([list(r) for r in ws.iter_rows(values_only=True)]), sheet=ws.title) for ws in wb.worksheets]
    elif ext == "xls":
        import xlrd

        try:
            book = xlrd.open_workbook(file_contents=data)
        except Exception as exc:
            raise ExtractError(f"Could not open the Excel file: {exc}") from exc
        grids = []
        for sh in book.sheets():
            raw = [[sh.cell(r, c).value for c in range(min(sh.ncols, MAX_COLS))] for r in range(min(sh.nrows, MAX_ROWS))]
            grids.append(Grid(rows=_trim(raw), sheet=sh.name))
    else:
        raise ExtractError("Unsupported file type. Use .xlsx, .xls or .csv.")
    grids = [g for g in grids if g.rows]
    if not grids:
        raise ExtractError("The file is empty.")
    return grids[:limit]


def full_text(grid: Grid) -> str:
    """Whole sheet as compact text: one line per row with 'colLetter=value' for non-empty cells."""
    lines = []
    for r, row in enumerate(grid.rows):
        cells = [f"{col_letter(i)}={str(c).replace(chr(10), ' ').strip()[:90]}" for i, c in enumerate(row) if str(c).strip() != ""]
        if cells:
            lines.append(f"{r + 1}: " + " | ".join(cells))
    return "\n".join(lines)


def extract_logo(filename: str, data: bytes, max_bytes: int = 400_000) -> str:
    """First picture embedded in an .xlsx (usually the school logo) as a data URL, or ''."""
    if not filename.lower().endswith(".xlsx"):
        return ""
    try:
        import base64

        from openpyxl import load_workbook

        wb = load_workbook(io.BytesIO(data))
        for ws in wb.worksheets:
            for img in getattr(ws, "_images", []):
                raw = img._data()
                if raw and len(raw) <= max_bytes:
                    fmt = (getattr(img, "format", "") or "png").lower()
                    return f"data:image/{'jpeg' if fmt == 'jpg' else fmt};base64," + base64.b64encode(raw).decode()
    except Exception:
        return ""
    return ""
