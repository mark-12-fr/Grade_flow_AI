/** What is missing or doubtful on each SF10, and applying "fill in missing details" to many learners. */
import { recordFor } from '@/lib/sf10/record';
import type { AppState, Sf10Semester, Student } from '@/lib/domain/types';

export interface Issue { kind: 'lrn' | 'grade' | 'semester' | 'details'; text: string }

/** What is missing or doubtful in one learner's SF10, so the teacher can see at a glance who needs checking. */
export function learnerIssues(student: Student, state: AppState, expectedSemesters: number): Issue[] {
  const rec = recordFor(student, state);
  const issues: Issue[] = [];
  if (!/^\d{10,13}$/.test(rec.lrn)) issues.push({ kind: 'lrn', text: rec.lrn ? `LRN "${rec.lrn}" does not look right` : 'No LRN' });
  rec.semesters.forEach((sem) => {
    const missing = sem.rows.filter((r) => !r.final).length;
    if (missing) issues.push({ kind: 'grade', text: `Grade ${sem.gradeLevel || '?'} sem ${sem.semLabel === '2ND' ? 2 : 1}: ${missing} subject${missing === 1 ? '' : 's'} without a final grade` });
  });
  if (rec.semesters.length < expectedSemesters) {
    const n = expectedSemesters - rec.semesters.length;
    issues.push({ kind: 'semester', text: `${n} semester${n === 1 ? '' : 's'} with no grades` });
  }
  if (student.sf10) {
    const noSchool = rec.semesters.some((s) => !s.school);
    const noYear = rec.semesters.some((s) => !s.sy);
    if (noSchool || noYear) issues.push({ kind: 'details', text: `Missing ${[noSchool && 'school name', noYear && 'school year'].filter(Boolean).join(' and ')}` });
  }
  return issues;
}

export const expectedSemesters = (students: Student[]) => students.reduce((m, s) => Math.max(m, s.sf10?.semesters.length ?? 0), 0);

export interface DetailValues {
  schoolName: string; schoolId: string; sy: string; syLevel: string; principal: string; adviser: string; track: string;
  dateIssued: string; awards: string; graduationDate: string; jhsSchool: string;
}
export const emptyDetails: DetailValues = { schoolName: '', schoolId: '', sy: '', syLevel: '', principal: '', adviser: '', track: '', dateIssued: '', awards: '', graduationDate: '', jhsSchool: '' };

/** Fills the same details into many SF10 records at once. Only blanks are filled unless `overwrite` is set. */
export function applyDetails(students: Student[], ids: Set<number>, v: DetailValues, overwrite: boolean): { students: Student[]; changed: number } {
  let changed = 0;
  const put = (current: string, next: string) => (next.trim() && (overwrite || !current) ? next.trim() : current);
  const out = students.map((student) => {
    if (!ids.has(student.id) || !student.sf10) return student;
    let touched = false;
    const semesters: Sf10Semester[] = student.sf10.semesters.map((sem) => {
      const next: Sf10Semester = {
        ...sem, school: put(sem.school, v.schoolName), schoolId: put(sem.schoolId, v.schoolId),
        sy: !v.syLevel || sem.gradeLevel === v.syLevel ? put(sem.sy, v.sy) : sem.sy,
        principal: put(sem.principal, v.principal), adviser: put(sem.adviser, v.adviser), track: put(sem.track, v.track)
      };
      if (JSON.stringify(next) !== JSON.stringify(sem)) touched = true;
      return next;
    });
    const c = student.sf10.completion;
    const completion = { ...c };
    const fill = (key: string, next: string) => {
      const was = c[key] ?? '';
      const now = put(was, next);
      if (now !== was) { completion[key] = now; touched = true; }
    };
    fill('certifiedBy', v.principal); fill('trackAccomplished', v.track); fill('dateIssued', v.dateIssued);
    fill('awards', v.awards); fill('graduationDate', v.graduationDate);
    const eligibility = { ...student.sf10.eligibility };
    if (v.jhsSchool.trim() && (overwrite || !eligibility.schoolName)) {
      if (eligibility.schoolName !== v.jhsSchool.trim() || eligibility.jhsCompleter !== true) touched = true;
      eligibility.schoolName = v.jhsSchool.trim(); eligibility.jhsCompleter = true;
    }
    if (!touched) return student;
    changed += 1;
    return { ...student, sf10: { ...student.sf10, semesters, completion, eligibility } };
  });
  return { students: out, changed };
}
