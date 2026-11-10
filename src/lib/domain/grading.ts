/** Grade rules: validity, averages, pass/fail remarks, ranks, missing grades, comments and the report context. */
import { PASSING_GRADE, STRAND_TRACK, subjectsFor, type Subject } from '@/lib/domain/curriculum';
import { formatDate, formatLongDate, prettyYear } from '@/lib/domain/format';
import type { AppState, GradeValue, Period, Student } from '@/lib/domain/types';

export function isGradeValue(value: GradeValue): boolean {
  return value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value));
}

function rawAverage(student: Student, subjects: Subject[]): number | null {
  if (!student || !student.grades || !subjects.length) return null;
  const values = subjects.map((s) => (student.grades[s.key] || {}).final);
  if (!values.every(isGradeValue)) return null;
  return values.reduce((sum: number, v) => sum + Number(v), 0) / values.length;
}

export const semesterSubjects = (student: Student, key: string) => subjectsFor(student.strand).filter((s) => s.semester === key);


export function semesterAverage(student: Student, key: string): number | null {
  const raw = rawAverage(student, semesterSubjects(student, key));
  return raw === null ? null : Math.round(raw);
}

export function averageGrade(student: Student): number | null {
  const raw = rawAverage(student, subjectsFor(student.strand));
  return raw === null ? null : Math.round(raw);
}

export function remarkFor(value: GradeValue): '' | 'Passed' | 'Failed' {
  if (!isGradeValue(value)) return '';
  return Number(value) >= PASSING_GRADE ? 'Passed' : 'Failed';
}

export function studentStatus(student: Student): 'approved' | 'needs-correction' {
  const missing = subjectsFor(student.strand).some((subject) => {
    const grades = student.grades[subject.key] || {};
    return [...subject.quarters, subject.finalKey].some((p) => {
      const v = grades[p as Period];
      return v === null || v === undefined || v === '' || Number.isNaN(Number(v));
    });
  });
  return missing ? 'needs-correction' : 'approved';
}

export function missingGradeCells(students: Student[]) {
  const list: { student: Student; subject: Subject; period: Period; periodLabel: string }[] = [];
  students.forEach((student) => {
    subjectsFor(student.strand).forEach((subject) => {
      const grades = student.grades[subject.key] || {};
      [...subject.quarters, subject.finalKey].forEach((p) => {
        const period = p as Period;
        const v = grades[period];
        if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) {
          list.push({ student, subject, period, periodLabel: period === 'final' ? 'Semester final' : `Quarter ${period.slice(1)}` });
        }
      });
    });
  });
  return list;
}

export const approvedCount = (students: Student[]) => students.filter((s) => studentStatus(s) === 'approved').length;
export const reviewedCommentCount = (students: Student[]) => students.filter((s) => s.commentReviewed).length;
export const allCommentsReviewed = (students: Student[]) => students.length > 0 && reviewedCommentCount(students) === students.length;
export const allGradesComplete = (students: Student[]) => students.length > 0 && approvedCount(students) === students.length;
export const readyToGenerate = (students: Student[]) => allGradesComplete(students) && allCommentsReviewed(students);

export const scaleMinimum = (state: Pick<AppState, 'gradingScale'>) => (state.gradingScale === 'deped' ? 60 : 0);

export function isValidGrade(state: Pick<AppState, 'gradingScale'>, value: GradeValue): boolean {
  if (value === '' || value === null || value === undefined) return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= scaleMinimum(state) && n <= 100;
}

export function gradeScaleDescription(state: Pick<AppState, 'gradingScale'>): string {
  return state.gradingScale === 'deped' ? 'All grades out of 100 · passing mark 75' : 'All grades out of 100';
}

// Standard competition ranking (1,2,2,4); learners with any missing grade stay unranked.
export function computeRanks(students: Student[]) {
  const scored = students.map((student) => ({ student, raw: studentStatus(student) === 'approved' ? rawAverage(student, subjectsFor(student.strand)) : null }));
  const ranked = scored.filter((e) => e.raw !== null).sort((a, b) => (b.raw as number) - (a.raw as number));
  const result = new Map<number, { rank: number | null; average: number | null; raw: number | null }>();
  ranked.forEach((entry, index) => {
    const prev = ranked[index - 1];
    const rank = prev && Math.round((prev.raw as number) * 100) === Math.round((entry.raw as number) * 100)
      ? (result.get(prev.student.id)?.rank as number) : index + 1;
    result.set(entry.student.id, { rank, average: Math.round(entry.raw as number), raw: entry.raw });
  });
  scored.forEach((entry) => {
    if (!result.has(entry.student.id)) result.set(entry.student.id, { rank: null, average: null, raw: null });
  });
  return result;
}

export const averageLabel = (student: Student) => {
  const a = averageGrade(student);
  return a === null ? '—' : `${a}%`;
};

const LETTERS = [{ min: 90, l: 'A' }, { min: 80, l: 'B' }, { min: 70, l: 'C' }, { min: 60, l: 'D' }, { min: 0, l: 'E' }];
export function letterFor(score: GradeValue): string {
  if (score === null || score === undefined || score === '') return '—';
  const n = Number(score);
  if (Number.isNaN(n)) return '—';
  return (LETTERS.find((e) => n >= e.min) as { l: string }).l;
}

export function performanceLabel(student: Student): string {
  const a = averageGrade(student);
  if (a === null) return 'Awaiting grades';
  if (a >= 95) return 'Outstanding progress';
  if (a >= 85) return 'Excellent progress';
  if (a >= 75) return 'Good progress';
  if (a >= 65) return 'Developing steadily';
  return 'Needs support';
}

const SUBJECT_ACTIONS: Record<string, string> = {
  english: 'read for 15 minutes each day and add detail to written answers'
};
const subjectAction = (key: string) => SUBJECT_ACTIONS[key] || SUBJECT_ACTIONS.english;

export function buildComment(student: Student): string {
  const first = student.name.split(' ')[0];
  const subjects = subjectsFor(student.strand);
  const entries = subjects.map((subject) => ({ subject, value: (student.grades[subject.key] || {}).final }))
    .filter((e) => e.value !== null && e.value !== undefined && e.value !== '' && !Number.isNaN(Number(e.value)))
    .sort((a, b) => Number(b.value) - Number(a.value));
  const average = averageGrade(student);
  const strongest = entries.length ? entries[0].subject : subjects[0];
  const growth = entries.length ? entries[entries.length - 1].subject : subjects[1];
  let opening: string;
  if (average === null) opening = 'has shown real effort this term while we complete the grade record.';
  else if (average >= 93) opening = 'has had an outstanding term.';
  else if (average >= 85) opening = 'has made excellent progress this term.';
  else if (average >= 75) opening = 'has shown steady progress this term.';
  else opening = 'is building confidence this term.';
  return `${first} ${opening} ${first} brings energy and curiosity to ${strongest.name} and contributes thoughtfully to class discussions. ` +
    `To keep growing, ${first} should ${subjectAction(growth.key)}. I am proud of the effort and consistency shown, ${first}.`;
}

export function makeTraits(student: Student) {
  const average = averageGrade(student) || 0;
  return {
    participation: average >= 90 ? 'Consistently engaged' : average >= 80 ? 'Growing confidence' : 'Encouraged to share',
    collaboration: average >= 88 ? 'Kind and supportive' : 'Works well with others',
    workHabits: average >= 85 ? 'Independent and organised' : 'Improving with support'
  };
}

export function makeNextSteps(student: Student): string[] {
  const subjects = subjectsFor(student.strand);
  const entries = subjects.map((subject) => ({ subject, value: (student.grades[subject.key] || {}).final }))
    .filter((e) => typeof e.value === 'number')
    .sort((a, b) => Number(a.value) - Number(b.value));
  const growth = entries.length ? entries[0].subject : subjects[0];
  return [
    `Practise ${growth.name.toLowerCase()} a little every day.`,
    'Add examples and detail to longer written answers.',
    'Keep exploring creative projects with classmates.'
  ];
}

export function reportContext(state: AppState, overrides: { year?: string; term?: string; className?: string; generatedAt?: Date | null; archive?: boolean } = {}) {
  const year = overrides.year || state.year;
  const term = overrides.term || state.term;
  const className = overrides.className || state.className;
  const parts = className.split('·');
  const generatedAt = overrides.generatedAt || state.generatedAt || new Date();
  return {
    schoolName: state.school.name,
    schoolAddress: state.school.address,
    teacher: state.teacher,
    principal: state.school.principal,
    year, term,
    termLabel: `${term} · ${prettyYear(year)}`,
    className,
    gradeLevel: overrides.className ? (parts[0] ? parts[0].trim().replace(/^Grade\s+/, '') : '5') : state.gradeLevel,
    section: parts[1] ? parts[1].trim() : 'Section A',
    strand: state.strand,
    trackStrand: STRAND_TRACK[state.strand] || state.strand,
    studentStatus: state.studentStatus,
    graduationStatus: state.graduationStatus,
    issuedDate: formatLongDate(generatedAt),
    issuedDateShort: formatDate(generatedAt),
    archive: Boolean(overrides.archive)
  };
}
export type ReportContext = ReturnType<typeof reportContext>;

/** The class-level context with this learner's own section, strand and adviser when the upload mixed several sections. */
export function studentContext(context: ReportContext, student: Student): ReportContext {
  if (!student.section && !student.strand && !student.adviser) return context;
  const strand = student.strand || context.strand;
  return {
    ...context,
    section: student.section || context.section,
    strand,
    trackStrand: STRAND_TRACK[strand] || strand,
    teacher: student.adviser || context.teacher
  };
}
