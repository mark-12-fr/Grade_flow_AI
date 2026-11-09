import { semestersFor } from '@/lib/domain/curriculum';
import { formatLongDate, prettyYear } from '@/lib/domain/format';
import { averageGrade, reportContext, remarkFor, semesterAverage, studentStatus } from '@/lib/domain/grading';
import type { AppState, Sf10Remedial, Student } from '@/lib/domain/types';

export interface Sf10Rec {
  last: string; first: string; middle: string; lrn: string; sex: string; birth: string;
  eligibility: Record<string, string | boolean>;
  semesters: {
    school: string; schoolId: string; gradeLevel: string; sy: string; semLabel: string; quarters: [string, string];
    track: string; section: string; rows: { category: string; subject: string; q1: string; q2: string; final: string; action: string }[];
    average: string; averageAction: string; remarks: string; adviser: string; principal: string; dateChecked: string; remedial: Sf10Remedial;
  }[];
  completion: Record<string, string>;
  complete: boolean;
}

export function nameParts(student: Student) {
  if (student.lastName || student.firstName) return { last: student.lastName || '', first: student.firstName || '', middle: student.middleName || '' };
  const raw = String(student.name || '').trim();
  if (raw.includes(',')) {
    const bits = raw.split(',');
    const rest = bits.slice(1).join(' ').trim().split(/\s+/);
    return { last: bits[0].trim(), first: rest.length > 1 ? rest.slice(0, -1).join(' ') : rest[0] || '', middle: rest.length > 1 ? rest[rest.length - 1] : '' };
  }
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length < 2) return { last: raw, first: '', middle: '' };
  if (words.length === 2) return { last: words[1], first: words[0], middle: '' };
  return { last: words[words.length - 1], first: words.slice(0, -2).join(' '), middle: words[words.length - 2] };
}

export const ordinal = (n: number) => ({ 1: '1ST', 2: '2ND', 3: '3RD', 4: '4TH' } as Record<number, string>)[n] || String(n);
const EMPTY_REMEDIAL: Sf10Remedial = { from: '', to: '', school: '', schoolId: '', teacher: '', rows: [] };
const cell = (v: unknown) => (v !== undefined && v !== null && v !== '' && !Number.isNaN(Number(v)) ? String(v) : '');

/** One normal form for both sources: an AI-read SF10 or grades built from the class roster. */
export function recordFor(student: Student, state: AppState): Sf10Rec {
  const n = nameParts(student);
  const base = { last: n.last, first: n.first, middle: n.middle, lrn: student.lrn || '', sex: student.sex || '' };
  if (student.sf10) {
    const sf = student.sf10;
    return {
      ...base, birth: student.birthdate || '', eligibility: sf.eligibility || {}, completion: sf.completion || {}, complete: true,
      semesters: (sf.semesters || []).map((sem) => {
        const second = String(sem.sem) === '2';
        return { ...sem, semLabel: second ? '2ND' : '1ST', quarters: (second ? ['3RD', '4TH'] : ['1ST', '2ND']) as [string, string], remedial: { ...EMPTY_REMEDIAL, ...(sem.remedial || {}) } };
      })
    };
  }
  const context = reportContext(state);
  const semesters = semestersFor(student.strand).map((semester) => {
    const rows = semester.groups.flatMap((group) => group.subjects.map(([key, subject]) => {
      const g = student.grades[key] || {};
      const final = cell(g.final);
      return { category: /^core/i.test(group.name) ? 'Core' : 'Applied / Specialized', subject, q1: cell(g[semester.quarters[0]]), q2: cell(g[semester.quarters[1]]), final, action: final ? remarkFor(g.final).toUpperCase() : '' };
    }));
    const avg = semesterAverage(student, semester.key);
    return {
      school: context.schoolName, schoolId: '', gradeLevel: state.gradeLevel, sy: prettyYear(state.year), semLabel: semester.key === 'first' ? '1ST' : '2ND',
      quarters: [ordinal(semester.quarterLabels[0]), ordinal(semester.quarterLabels[1])] as [string, string],
      track: state.strand, section: state.section, rows, average: avg === null ? '' : String(avg), averageAction: avg === null ? '' : remarkFor(avg).toUpperCase(),
      remarks: '', adviser: state.teacher, principal: state.school.principal, dateChecked: '', remedial: EMPTY_REMEDIAL
    };
  });
  const annual = averageGrade(student);
  return {
    ...base, birth: student.birthdate ? formatLongDate(student.birthdate) : '', eligibility: {}, semesters,
    completion: { trackAccomplished: state.strand, shsAverage: annual === null ? '' : String(annual), certifiedBy: state.school.principal },
    complete: studentStatus(student) === 'approved'
  };
}

/** The learners shown on the SF10 page: the ones read from an uploaded SF10, otherwise the class roster. */
export const sf10Source = (state: AppState): Student[] => (state.sf10Students.length ? state.sf10Students : state.students);

/** Strand, section and grade levels of a learner, used to filter the SF10 list. */
export function learnerMeta(student: Student, state: AppState): { strand: string; section: string; levels: string[] } {
  const sems = student.sf10?.semesters ?? [];
  if (!sems.length) return { strand: state.strand, section: state.section, levels: [state.gradeLevel] };
  const last = [...sems].reverse().find((s) => s.section || s.track) ?? sems[sems.length - 1];
  return { strand: last.track || '', section: last.section || '', levels: [...new Set(sems.map((x) => x.gradeLevel).filter(Boolean))] };
}
