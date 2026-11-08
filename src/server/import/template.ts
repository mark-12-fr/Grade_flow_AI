/**
 * Built-in reader for the standard template ("<Subject> Q1", "Semester 1 Final"... headers).
 * Used when the AI service is not available, so the app keeps working. No grade is ever invented.
 */
import { ATTENDANCE_MONTHS, CORE_VALUE_KEYS, SUBJECTS, TRANSFER_FIELDS, type Subject } from '@/lib/domain/curriculum';
import type { Student } from '@/lib/domain/types';
import type { Grid } from '@/server/import/extract';
import { newStudent, type ImportResult, type ImportSchema } from '@/server/import/mapper';

const HEADER_ALIASES = {
  roll: ['roll', 'rollno', 'rollnumber', 'no', 'number', 'id', 'studentid'],
  name: ['studentname', 'name', 'student', 'fullname'],
  age: ['age'], sex: ['sex', 'gender'], lrn: ['lrn', 'learnerreferencenumber']
};
const CLASS_ALIASES: Record<string, string[]> = {
  className: ['classname', 'class'], strand: ['strand'], gradeLevel: ['gradelevel'], year: ['schoolyear', 'academicyear'],
  term: ['term', 'gradingperiod', 'reportingperiod'], section: ['section', 'sectionname'],
  studentStatus: ['studentstatus', 'learnerstatus'], graduationStatus: ['graduationstatus'],
  teacher: ['adviser', 'advisor', 'teacher', 'classadviser'], principal: ['principal']
};

const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function periodAliases(subject: Subject, period: string): string[] {
  if (period === 'final') {
    return subject.semester === 'first' ? ['semester1final', 'sem1final', 'firstsemesterfinal', 'firstsemfinal']
      : ['semester2final', 'sem2final', 'secondsemesterfinal', 'secondsemfinal'];
  }
  return { q1: ['q1', 'quarter1', 'qtr1'], q2: ['q2', 'quarter2', 'qtr2'], q3: ['q3', 'quarter3', 'qtr3'], q4: ['q4', 'quarter4', 'qtr4'] }[period]!;
}

const gradeColumn = (header: unknown[], subject: Subject, period: string) => {
  const name = norm(subject.name);
  const suffixes = periodAliases(subject, period);
  return header.map(norm).findIndex((h) => suffixes.some((s) => h === name + s));
};

const isGradeHeader = (h: unknown) => SUBJECTS.some((s) => [...s.quarters, s.finalKey].some((p) => gradeColumn([h], s, p) === 0));

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 6); i += 1) {
    const n = rows[i].map(norm);
    if (n.some((c) => HEADER_ALIASES.name.includes(c)) && n.some(isGradeHeader)) return i;
  }
  return -1;
}

const columnIndex = (header: unknown[], aliases: string[]) => header.map(norm).findIndex((h) => aliases.includes(h));

function gradeValue(raw: unknown): { value: number | null } | { error: string } {
  if (raw === null || raw === undefined) return { value: null };
  const cleaned = String(raw).trim().replace(/%$/, '');
  if (['', '-', '—'].includes(cleaned) || cleaned.toLowerCase() === 'n/a') return { value: null };
  const n = Number(cleaned);
  return Number.isFinite(n) ? { value: n } : { error: 'is not a number' };
}

function wholeNumber(raw: unknown): number | null {
  const cleaned = String(raw ?? '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : Number.NaN;
}

export class TemplateError extends Error {}

export function readTemplate(grid: Grid, schema: ImportSchema, scaleMin = 0): ImportResult {
  const rows = grid.rows;
  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) throw new TemplateError('header row not found. Include Student Name and one column per subject.');
  const header = rows[headerIndex];
  const data = rows.slice(headerIndex + 1).filter((r) => r.some((c) => String(c).trim() !== ''));
  if (!data.length) throw new TemplateError('The file has headers but no learner row.');

  const col = {
    roll: columnIndex(header, HEADER_ALIASES.roll), name: columnIndex(header, HEADER_ALIASES.name), age: columnIndex(header, HEADER_ALIASES.age),
    sex: columnIndex(header, HEADER_ALIASES.sex), lrn: columnIndex(header, HEADER_ALIASES.lrn)
  };
  const missing: string[] = [];
  const gradeCols = new Map<string, number>();
  SUBJECTS.forEach((subject) => [...subject.quarters, subject.finalKey].forEach((p) => {
    const i = gradeColumn(header, subject, p);
    gradeCols.set(`${subject.key}:${p}`, i);
    if (i === -1) missing.push(`${subject.name} ${p === 'final' ? (subject.semester === 'first' ? 'Semester 1 Final' : 'Semester 2 Final') : `Quarter ${p.slice(1)}`}`);
  }));
  if (col.name === -1) missing.unshift('Student Name');
  if (missing.length) {
    throw new TemplateError(`Missing required grade columns: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? `, and ${missing.length - 5} more` : ''}.`);
  }

  const errors: string[] = [];
  const students: Student[] = [];
  data.forEach((row, rowIndex) => {
    const name = String(row[col.name] || '').trim();
    if (!name) { errors.push(`Row ${headerIndex + rowIndex + 2} has no student name.`); return; }
    const stu = newStudent(students.length + 1, name, schema);
    const text = (i: number) => (i > -1 ? String(row[i] || '').trim() : '');
    stu.roll = text(col.roll); stu.age = text(col.age); stu.sex = text(col.sex); stu.lrn = text(col.lrn);
    SUBJECTS.forEach((subject) => {
      const g: Record<string, number | null> = {};
      [...subject.quarters, subject.finalKey].forEach((p) => {
        const i = gradeCols.get(`${subject.key}:${p}`)!;
        const parsed = gradeValue(row[i]);
        const label = p === 'final' ? (subject.semester === 'first' ? 'Semester 1 Final' : 'Semester 2 Final') : `Quarter ${p.slice(1)}`;
        if ('error' in parsed) { errors.push(`${name} · ${subject.name} ${label} ${parsed.error} ("${String(row[i]).slice(0, 20)}").`); return; }
        if (parsed.value !== null && !(parsed.value >= scaleMin && parsed.value <= 100)) {
          errors.push(`${name} · ${subject.name} ${label} must be between ${scaleMin} and 100.`); return;
        }
        g[p] = parsed.value;
      });
      stu.grades[subject.key] = g;
    });
    let totalPresent = 0, totalDays = 0;
    ATTENDANCE_MONTHS.forEach((month) => {
      const idx = (f: string) => columnIndex(header, [norm(`${month.label} ${f}`)]);
      const get = (f: string) => { const i = idx(f); return i > -1 ? wholeNumber(row[i]) : null; };
      const days = get('schoolDays'), present = get('present'), absent = get('absent');
      [['school days', days], ['days present', present], ['days absent', absent]].forEach(([label, v]) => {
        if (Number.isNaN(v as number)) errors.push(`${name} · ${month.label} ${label} must be a non-negative whole number.`);
      });
      stu.attendance.schoolDays[month.key] = days;
      stu.attendance.months[month.key] = present;
      stu.attendance.absent[month.key] = absent;
      if (Number.isFinite(days) && Number.isFinite(present) && Number.isFinite(absent) && (present as number) + (absent as number) > (days as number)) {
        errors.push(`${name} · ${month.label} attendance exceeds the number of school days.`);
      }
      if (Number.isFinite(present)) totalPresent += present as number;
      if (Number.isFinite(days)) totalDays += days as number;
    });
    if (totalDays) { stu.attendance.present = totalPresent; stu.attendance.total = totalDays; }
    TRANSFER_FIELDS.forEach((f) => { stu.transfer[f] = text(columnIndex(header, [norm(f)])); });
    CORE_VALUE_KEYS.forEach((key) => ['q1', 'q2', 'q3', 'q4'].forEach((p) => {
      stu.observedValues[key][p] = text(columnIndex(header, [norm(`${key} ${p}`)]));
    }));
    students.push(stu);
  });
  if (errors.length) throw new TemplateError(errors.slice(0, 4).join('\n'));

  const details: Record<string, string> = {};
  const metaErrors: string[] = [];
  Object.entries(CLASS_ALIASES).forEach(([key, aliases]) => {
    const i = columnIndex(header, aliases);
    if (i < 0) return;
    const values = [...new Set(data.map((r) => String(r[i] ?? '').trim()).filter(Boolean))];
    if (values.length > 1) metaErrors.push(`Class detail "${key}" has different values in the learner rows.`);
    else if (values.length === 1) details[key] = values[0];
  });
  if (metaErrors.length) throw new TemplateError(metaErrors.join('\n'));
  return { students, classDetails: details, mapping: [], warnings: [], sheet: grid.sheet };
}
