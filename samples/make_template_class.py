"""Generate samples/template_class.xlsx: a class gradebook in the app's standard template, fictional learners.

The built-in template reader (src/server/template.ts) reads this file without any AI key, so the whole
upload -> SF9 -> SF10 flow works offline. scripts/capture-reel.mjs uses it to film the real app.
"""
import random
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font

random.seed(2026)

FIRST = [
    "Media and Information Literacy",
    "Introduction to Philosophy of the Human Person/Pambungad sa Pilosopiya ng Tao",
    "Contemporary Philippine Arts from the Regions",
    "Physical Science",
    "Physical Education and Health",
    "Research in Daily Life 2",
    "Pagsulat sa Filipino sa Piling Larang",
    "Creative Writing/Malikhaing Pagsulat",
    "Disciplines and Ideas in the Applied Social Sciences",
]
SECOND = [
    "Physical Education and Health",
    "Entrepreneurship",
    "Inquiries, Investigations and Immersion",
    "Empowerment Technologies",
    "Creative Nonfiction: The Literary Essay",
    "Philippine Politics and Governance",
    "Trends, Networks and Critical Thinking in the 21st Century Culture",
    "Community Engagement, Solidarity and Citizenship",
    "Culminating Activity",
]
MONTHS = ["JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR"]
DAYS = [10, 22, 23, 21, 22, 20, 14, 20, 19, 21, 12]
VALUES = ["makaDiyos", "makatao", "makakalikasan", "makabansa"]
NAMES = [  # fictional learners
    ("Aquino, Bea Marie", "F"), ("Bautista, Carlo Jose", "M"), ("Castillo, Andrea Faith", "F"), ("Dela Rosa, Mika Ella", "F"),
    ("Domingo, Kenneth Ray", "M"), ("Espino, Lara Grace", "F"), ("Ferrer, Jomar Luis", "M"), ("Garcia, Lianne Joy", "F"),
    ("Herrera, Paolo Miguel", "M"), ("Ignacio, Trisha Mae", "F"), ("Lopez, Rafael Andre", "M"), ("Mendoza, Kyla Sofia", "F"),
    ("Navarro, Isaac Daniel", "M"), ("Ocampo, Jasmine Rose", "F"), ("Pascual, Nathan Cole", "M"), ("Ramos, Hazel Anne", "F"),
]

header = ["No.", "Student Name", "LRN", "Sex", "Age", "Strand", "Grade Level", "Section", "School Year", "Adviser"]
for s in FIRST:
    header += [f"{s} Q1", f"{s} Q2", f"{s} Semester 1 Final"]
for s in SECOND:
    header += [f"{s} Q3", f"{s} Q4", f"{s} Semester 2 Final"]
for m in MONTHS:
    header += [f"{m} schoolDays", f"{m} present", f"{m} absent"]
for v in VALUES:
    header += [f"{v} q{q}" for q in range(1, 5)]

wb = Workbook()
ws = wb.active
ws.title = "Grade 12 ABM"
ws.append(header)
for c in ws[1]:
    c.font = Font(bold=True)

for i, (name, sex) in enumerate(NAMES, start=1):
    level = random.randint(82, 94)  # each learner has a typical level; grades vary around it
    row = [i, name, f"1089152{40000 + i * 37:05d}", sex, random.choice([17, 17, 18]), "ABM", "12", "UI-FA-ABM12-1", "2026-2027", "Rosa D. Lim"]
    for _ in FIRST + SECOND:
        a = max(75, min(99, level + random.randint(-4, 4)))
        b = max(75, min(99, level + random.randint(-3, 5)))
        row += [a, b, round((a + b) / 2)]
    for days in DAYS:
        absent = random.choice([0, 0, 0, 1, 1, 2]) if days > 12 else 0
        row += [days, days - absent, absent]
    for _ in VALUES:
        row += [random.choice(["AO", "AO", "SO"]) for _ in range(4)]
    ws.append(row)

# One blank grade on purpose: the app must leave it blank and flag it, never invent it.
miss = header.index("Culminating Activity Q4")
ws.cell(row=1 + 11, column=1 + miss).value = None
ws.cell(row=1 + 11, column=2 + miss).value = None  # its Semester 2 Final cannot be computed either

out = Path(__file__).with_name("template_class.xlsx")
wb.save(out)
print(f"wrote {out} ({len(NAMES)} fictional learners, {len(header)} columns)")
