"""Generate public/samples/messy_class.xlsx: a realistic, NON-template gradebook with fictional learners."""
import random
from pathlib import Path

from openpyxl import Workbook

random.seed(12)
SUBJECTS = [  # (short header the teacher might use, semester)
    ("MIL", "first"), ("Intro to Philo", "first"), ("CPAR", "first"), ("Phys Sci", "first"), ("PE & Health 1", "first"),
    ("Research 2", "first"), ("Pagsulat sa Filipino", "first"), ("Creative Writing", "first"), ("DIASS", "first"),
    ("PE & Health 2", "second"), ("Entrep", "second"), ("III", "second"), ("Empowerment Tech", "second"),
    ("Creative Nonfiction", "second"), ("PPG", "second"), ("Trends", "second"), ("CSC", "second"), ("Culminating Activity", "second"),
]
MONTHS = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"]
DAYS = [10, 22, 23, 21, 22, 20, 14, 20, 19, 21, 12]
NAMES = [
    ("Santos, Maria Clara", "F"), ("Reyes, Juan Miguel", "M"), ("Cruz, Angelica", "F"), ("Garcia, Paolo", "M"),
    ("Mendoza, Bea Louise", "F"), ("Torres, Carlo", "M"), ("Ramos, Kyla Mae", "F"), ("Villanueva, Dennis", "M"),
    ("Aquino, Shiela", "F"), ("Bautista, Rafael", "M"), ("Flores, Jasmine", "F"), ("Castillo, Nathan", "M"),
    ("Navarro, Isabel", "F"), ("Domingo, Kenneth", "M"), ("Salvador, Hazel", "F"), ("Dela Cruz, Mark Anthony", "M"),
]

wb = Workbook()
ws = wb.active
ws.title = "Grade 12 ABM"
ws["A1"] = "Sample National High School - Senior High School Department"
ws["A2"] = "CLASS RECORD  S.Y. 2026-2027"
ws["A3"] = "Strand: ABM    Grade 12    Section: ABM12-A"
ws["A4"] = "Adviser: Ms. Rosa D. Lim        Principal: Dr. Elena Navarro"
header1, header2 = ["No.", "Learner's Name", "LRN", "Sex", "Birthdate"], ["", "", "", "", ""]
for name, sem in SUBJECTS:
    header1 += [name, "", ""]
    header2 += (["Q1", "Q2", "Sem 1 Final"] if sem == "first" else ["Q3", "Q4", "Sem 2 Final"])
for m in MONTHS:
    header1 += [f"{m} ", ""]
    header2 += ["School Days", "Days Present"]
ws.append([]); ws.append(header1); ws.append(header2)
rows = []
for i, (name, sex) in enumerate(NAMES, 1):
    base = random.randint(76, 95)
    row = [i, name, 136000000000 + random.randint(10**8, 10**9), sex, f"200{random.randint(6,8)}-0{random.randint(1,9)}-1{random.randint(0,9)}"]
    for _ in SUBJECTS:
        a, b = base + random.randint(-4, 4), base + random.randint(-4, 4)
        row += [min(a, 99), min(b, 99), round((min(a, 99) + min(b, 99)) / 2)]
    for d in DAYS:
        row += [d, d - random.choice([0, 0, 0, 1, 2])]
    rows.append(row)
for r in rows:
    ws.append(r)
if len(rows) > 3:  # blank a grade to prove we never invent one
    ws.cell(row=7 + 3, column=9).value = None
ws.append([]); ws.append(["", "Class Average"])
out = Path(__file__).parent.parent / "public" / "samples" / "messy_class.xlsx"
wb.save(out)
print("wrote", out)
