/** What is missing or doubtful on each SF9, and applying "fill in missing details" to many learners. */
import { ATTENDANCE_MONTHS, CORE_VALUE_KEYS } from '@/lib/domain/curriculum';
import { missingGradeCells } from '@/lib/domain/grading';
import type { AppState, Student } from '@/lib/domain/types';

export interface Issue { kind: 'grade' | 'lrn' | 'learner' | 'attendance' | 'values' | 'class'; text: string }

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

/** What is missing or doubtful on one learner's SF9, so the teacher can see at a glance who needs checking. */
export function sf9Issues(student: Student, state: AppState): Issue[] {
  const issues: Issue[] = [];
  const grades = missingGradeCells([student]).length;
  if (grades) issues.push({ kind: 'grade', text: `${grades} grade${grades === 1 ? '' : 's'} missing` });
  if (!/^\d{10,13}$/.test(student.lrn || '')) issues.push({ kind: 'lrn', text: student.lrn ? `LRN "${student.lrn}" does not look right` : 'No LRN' });
  const learner = [blank(student.age) && 'age', blank(student.sex) && 'sex'].filter(Boolean);
  if (learner.length) issues.push({ kind: 'learner', text: `Missing ${learner.join(' and ')}` });

  const a = student.attendance;
  if (!ATTENDANCE_MONTHS.some((m) => Number.isInteger(a.schoolDays[m.key]))) issues.push({ kind: 'attendance', text: 'No attendance (school days, present, absent)' });
  else {
    const noPresent = ATTENDANCE_MONTHS.filter((m) => Number.isInteger(a.schoolDays[m.key]) && !Number.isInteger(a.months[m.key])).length;
    if (noPresent) issues.push({ kind: 'attendance', text: `${noPresent} month${noPresent === 1 ? '' : 's'} without days present` });
  }
  const noValues = CORE_VALUE_KEYS.filter((k) => !['q1', 'q2', 'q3', 'q4'].some((q) => !blank(student.observedValues?.[k]?.[q])));
  if (noValues.length) issues.push({ kind: 'values', text: noValues.length === CORE_VALUE_KEYS.length ? 'Observed values not set' : `Observed values not set for ${noValues.length} core value${noValues.length === 1 ? '' : 's'}` });

  const klass = [blank(state.school.name) && 'school name', blank(state.year) && 'school year', blank(state.school.principal) && 'principal', blank(student.adviser || state.teacher) && 'adviser'].filter(Boolean);
  if (klass.length) issues.push({ kind: 'class', text: `Missing ${klass.join(', ')}` });
  return issues;
}

export interface Sf9Details {
  year: string; principal: string; adviser: string;
  /** Certificate of Transfer entries, keyed like Student.transfer. */
  transfer: Record<string, string>;
}
export const emptySf9Details: Sf9Details = { year: '', principal: '', adviser: '', transfer: {} };
export const TRANSFER_DETAILS: [string, string][] = [
  ['admittedTo', 'Transfer: admitted to'], ['eligibilityForGrade', 'Transfer: eligibility for admission to grade'], ['approvedBy', 'Transfer: approved by'],
  ['admittedIn', 'Transfer: admitted in'], ['transferDate', 'Transfer: date'], ['cancellationOfEligibility', 'Transfer: cancellation of eligibility, approved by']
];

/** Fills the same details into many learners at once. Only blanks are filled unless `overwrite` is set. */
export function applySf9Details(students: Student[], ids: Set<number>, v: Sf9Details, overwrite: boolean): { students: Student[]; changed: number } {
  let changed = 0;
  const put = (current: string | undefined, next: string) => (next.trim() && (overwrite || !current) ? next.trim() : current);
  const out = students.map((student) => {
    if (!ids.has(student.id)) return student;
    const next: Student = { ...student, adviser: put(student.adviser, v.adviser) };
    const transfer = { ...student.transfer };
    TRANSFER_DETAILS.forEach(([key]) => { const next = put(transfer[key], v.transfer[key] ?? ''); if (next) transfer[key] = next; });
    next.transfer = transfer;
    if (JSON.stringify(next) === JSON.stringify(student)) return student;
    changed += 1;
    return next;
  });
  return { students: out, changed };
}
