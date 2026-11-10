/**
 * AI reader for SF10 (Senior High School permanent record) workbooks.
 * An SF10 is a printed form, not a table, so the model reads the whole sheet and returns the record
 * as structured data. Every number it returns is then checked against the sheet's own cells: a grade
 * the model could not have read from the sheet is dropped, never kept.
 */
import { AiError, callAi, type Caller, type Tool } from '@/server/core/llm';
import { fullText, type Grid } from '@/server/import/extract';
import { MappingError } from '@/server/import/mapper';
import type { Sf10Semester, Student } from '@/lib/domain/types';

const T = { type: 'string' };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });

const SEMESTER = obj({
  school: T, schoolId: T, gradeLevel: T, sy: T, sem: { type: 'string', description: '1 or 2' }, track: T, section: T,
  rows: { type: 'array', items: obj({ category: { type: 'string', description: 'Core, Applied or Specialized' }, subject: T, q1: T, q2: T, final: T, action: { type: 'string', description: 'PASSED or FAILED' } }) },
  average: T, averageAction: T, remarks: T, adviser: T, principal: T, dateChecked: T,
  remedial: obj({ from: T, to: T, school: T, schoolId: T, teacher: T, rows: { type: 'array', items: obj({ category: T, subject: T, final: T, remedialMark: T, recomputed: T, action: T }) } })
});

export const SF10_TOOL: Tool = {
  name: 'submit_sf10',
  description: 'Report the SF10 record exactly as written in the sheet. Leave a field empty when the sheet does not show it. Never invent or compute values.',
  input_schema: obj({
    learner: obj({ lastName: T, firstName: T, middleName: T, lrn: T, birthdate: { type: 'string', description: 'Date of birth as shown' }, sex: T }),
    eligibility: obj({
      hsCompleter: { type: 'boolean' }, hsGenAve: T, jhsCompleter: { type: 'boolean' }, jhsGenAve: T, completionDate: T, schoolName: T, schoolAddress: T,
      peptPasser: { type: 'boolean' }, peptRating: T, alsPasser: { type: 'boolean' }, alsRating: T, alsDate: T, alsCenter: T, others: T
    }),
    semesters: { type: 'array', description: 'Every Scholastic Record block in order (each grade level and semester).', items: SEMESTER },
    completion: obj({ trackAccomplished: T, shsAverage: T, awards: T, graduationDate: T, certifiedBy: T, remarks: T, purpose: T, dateIssued: T }),
    warnings: { type: 'array', items: T }
  }, ['learner', 'semesters'])
};

export function buildPrompt(grid: Grid): string {
  return `This sheet is a Philippine DepEd SF10-SHS (Senior High School Student Permanent Record) for ONE learner.
Read it and call submit_sf10 exactly once.

- Copy values exactly as written (grades as digits, dates as shown, names in the sheet's spelling).
- \`semesters\` has one entry per SCHOLASTIC RECORD block (school, grade level, SY, SEM, track/strand, section, subject rows,
  General Ave. for the Semester, remarks, Prepared by / Certified True and Correct names, Date Checked, and the Remedial Classes block under it).
- Subject rows: category (Core / Applied / Specialized), subject, 1st/2nd (or 3rd/4th) quarter grade as q1/q2, semester final, action taken.
  Skip empty rows.
- Learner information, Eligibility for SHS Enrolment (checkboxes -> booleans), and the final SHS completion block
  (track accomplished, SHS general average, awards, graduation date, certified by, remarks/purpose, date issued).
- If something is not on the sheet, leave it empty. Never calculate, guess or fix values. Put doubts in \`warnings\`.

Sheet "${grid.sheet}" (row: column=value):
${fullText(grid)}
`;
}

function tokens(grid: Grid): Set<string> {
  const out = new Set<string>();
  grid.rows.forEach((row) => row.forEach((c) => {
    const t = String(c).trim();
    if (!t) return;
    out.add(t);
    if (/^\d+\.0+$/.test(t)) out.add(t.split('.')[0]);
  }));
  return out;
}

const s = (value: unknown, limit = 120) => String(value ?? '').trim().slice(0, limit);
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function checkedGrade(value: unknown, tk: Set<string>, where: string, warnings: string[]): string {
  const t = String(value ?? '').trim();
  if (!t) return '';
  if (!tk.has(t)) { warnings.push(`${where}: '${t}' was not found in the sheet; left blank.`); return ''; }
  return t;
}

export function normalize(raw: Raw, grid: Grid, index: number): { student: Student; warnings: string[] } {
  const tk = tokens(grid);
  const warnings: string[] = ((raw.warnings as unknown[]) ?? []).map(String).filter((w) => w.trim());
  const learner: Raw = raw.learner ?? {};
  const last = s(learner.lastName), first = s(learner.firstName), middle = s(learner.middleName);
  if (!last && !first) throw new MappingError(`Sheet "${grid.sheet}": could not find the learner name.`, 'file');
  const el: Raw = raw.eligibility ?? {};
  const bools = ['hsCompleter', 'jhsCompleter', 'peptPasser', 'alsPasser'];
  const eligibility: Record<string, string | boolean> = {};
  ['hsCompleter', 'hsGenAve', 'jhsCompleter', 'jhsGenAve', 'completionDate', 'schoolName', 'schoolAddress', 'peptPasser', 'peptRating',
    'alsPasser', 'alsRating', 'alsDate', 'alsCenter', 'others'].forEach((k) => { eligibility[k] = bools.includes(k) ? Boolean(el[k]) : s(el[k]); });

  const semesters: Sf10Semester[] = [];
  ((raw.semesters as Raw[]) ?? []).forEach((sem, i) => {
    const n = i + 1;
    const label = `Semester block ${n}`;
    const rows = ((sem.rows as Raw[]) ?? []).filter((r) => s(r.subject)).map((r) => {
      const subject = s(r.subject, 90);
      const where = `${label} ${subject}`;
      return {
        category: s(r.category, 20), subject, q1: checkedGrade(r.q1, tk, where, warnings), q2: checkedGrade(r.q2, tk, where, warnings),
        final: checkedGrade(r.final, tk, where, warnings), action: s(r.action, 12).toUpperCase()
      };
    });
    const rem: Raw = sem.remedial ?? {};
    semesters.push({
      school: s(sem.school), schoolId: s(sem.schoolId, 20), gradeLevel: s(sem.gradeLevel, 10), sy: s(sem.sy, 20),
      sem: s(sem.sem, 6).replace(/\D/g, '').slice(0, 1) || (n % 2 ? '1' : '2'),
      track: s(sem.track), section: s(sem.section, 40), rows,
      average: checkedGrade(sem.average, tk, `${label} general average`, warnings),
      averageAction: s(sem.averageAction, 12).toUpperCase(), remarks: s(sem.remarks, 200),
      adviser: s(sem.adviser), principal: s(sem.principal), dateChecked: s(sem.dateChecked, 20),
      remedial: {
        from: s(rem.from, 20), to: s(rem.to, 20), school: s(rem.school), schoolId: s(rem.schoolId, 20), teacher: s(rem.teacher),
        rows: ((rem.rows as Raw[]) ?? []).filter((x) => s(x.subject)).map((x) => ({
          category: s(x.category, 90), subject: s(x.subject, 90), final: s(x.final, 90), remedialMark: s(x.remedialMark, 90),
          recomputed: s(x.recomputed, 90), action: s(x.action, 90)
        }))
      }
    });
  });
  if (!semesters.length) throw new MappingError(`Sheet "${grid.sheet}": no Scholastic Record was found.`, 'file');
  const comp: Raw = raw.completion ?? {};
  const completion: Record<string, string> = {};
  ['trackAccomplished', 'shsAverage', 'awards', 'graduationDate', 'certifiedBy', 'remarks', 'purpose', 'dateIssued'].forEach((k) => { completion[k] = s(comp[k], 300); });
  const name = [last, [first, middle].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const student: Student = {
    id: index, roll: String(index).padStart(2, '0'), name, lastName: last, firstName: first, middleName: middle,
    lrn: s(learner.lrn).replace(/\D/g, ''), sex: s(learner.sex, 10), birthdate: s(learner.birthdate, 20), age: '',
    grades: {}, attendance: { present: null, total: null, months: {}, schoolDays: {}, absent: {} },
    transfer: {}, observedValues: {}, comment: '', commentReviewed: true, traits: null, nextSteps: null,
    sf10: { eligibility, semesters, completion }
  };
  return { student, warnings };
}

export interface Sf10Result { students: Student[]; warnings: string[]; sheets: number }

export async function runImportSf10(grids: Grid[], opts: { caller?: Caller; spend?: () => void; maxChars?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<Sf10Result> {
  const { caller = callAi, spend, maxChars = 0, onProgress } = opts;
  const one = async (grid: Grid, i: number): Promise<{ student: Student | null; warnings: string[] }> => {
    if (maxChars && fullText(grid).length > maxChars) {
      return { student: null, warnings: [`Sheet "${grid.sheet}" is too large to be one learner's SF10; skipped (no AI call).`] };
    }
    try {
      spend?.();
      let raw: Record<string, unknown>;
      try { raw = await caller(buildPrompt(grid), SF10_TOOL, 8000); }
      catch (error) { if (error instanceof AiError) throw new MappingError(error.message, error.kind === 'config' ? 'config' : 'ai'); throw error; }
      return normalize(raw, grid, i + 1);
    } catch (error) {
      if (error instanceof MappingError && error.kind === 'file') return { student: null, warnings: [error.message] };
      throw error;
    }
  };
  const results: { student: Student | null; warnings: string[] }[] = [];
  for (let i = 0; i < grids.length; i += 4) {
    results.push(...(await Promise.all(grids.slice(i, i + 4).map((g, k) => one(g, i + k)))));
    onProgress?.(results.length, grids.length);
  }
  const students = results.map((r) => r.student).filter((x): x is Student => Boolean(x));
  const warnings = results.flatMap((r) => r.warnings);
  if (!students.length) throw new MappingError(warnings[0] ?? 'No SF10 record was found in this file.', 'file');
  return { students, warnings: warnings.slice(0, 60), sheets: grids.length };
}
