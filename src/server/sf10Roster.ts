/**
 * SF10 from a school grading workbook ("roster mode").
 * Learners are rows and each subject has Q1 / Q2 / Final columns, like a deliberation list.
 * The AI only maps the columns (looking at the top rows); code then copies every grade from the
 * sheet and builds one SF10 per learner, grouped by grade level and semester.
 */
import { AiError, callAi, type Caller, type Tool } from './llm';
import { previewText, type Grid } from './extract';
import { lrnText, MappingError } from './mapper';
import type { Sf10Semester, Student } from '@/lib/types';

const INT = { type: 'integer' };
const ROSTER_TOOL: Tool = {
  name: 'submit_roster_mapping',
  description: 'Report which column holds what in a school grading sheet. Never output grade values.',
  input_schema: {
    type: 'object',
    properties: {
      first_data_row: { type: 'integer', description: 'Row index (0-based) of the first learner row' },
      learner: {
        type: 'object',
        description: 'Column index of each learner field, or -1 when the sheet has no such column',
        properties: { name: INT, lastName: INT, firstName: INT, middleName: INT, lrn: INT, sex: INT, birthdate: INT, section: INT, adviser: INT, strand: INT }
      },
      subjects: {
        type: 'array',
        description: 'One entry per subject; q1/q2/final are column indexes (or -1)',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' }, category: { type: 'string', description: 'Core, Applied or Specialized' },
            gradeLevel: { type: 'string', description: '11 or 12' }, sem: { type: 'string', description: '1 or 2' },
            q1: INT, q2: INT, final: INT
          },
          required: ['name', 'gradeLevel', 'sem', 'final']
        }
      },
      class_details: { type: 'object', additionalProperties: { type: 'string' }, description: 'schoolName, year (school year), track, strand' },
      warnings: { type: 'array', items: { type: 'string' } }
    },
    required: ['first_data_row', 'learner', 'subjects']
  }
};

export function looksLikeForm(grid: Grid): boolean {
  const head = grid.rows.slice(0, 60).map((r) => r.join(' ')).join(' ').toLowerCase();
  return /permanent record|scholastic record|learner'?s information/.test(head);
}

export function buildRosterPrompt(grid: Grid): string {
  return `This sheet ("${grid.sheet}") is a Philippine Senior High School grading workbook: each row is a learner and each subject has Q1, Q2 and FINAL grade columns,
usually for Grade 11 and Grade 12. Map its columns so an SF10 permanent record can be built for every learner. Call submit_roster_mapping exactly once.

Row and column indexes are 0-based and shown in the table header. You only see the top rows.
- learner: column index of name (full name), lastName, firstName, middleName, lrn, sex, birthdate, section, adviser, strand; use -1 when missing.
- subjects: one entry per subject. Read the subject name from the header (drop codes like "COR 001 -" but keep the real name),
  its category (COR = Core, APP = Applied, anything else such as ABM/STM/SSP/SOC = Specialized), the grade level
  (a "GRADE 11" / "GRADE 12" header above or beside it), and the semester (1 or 2).
  A subject that has only a final grade column uses q1=-1, q2=-1.
  If the semester is not written, infer it from the subject and the column order (Grade 11 first-semester subjects come before second-semester ones); add a warning when you infer.
- If a subject appears in more than one block (different grade level or semester), list each block separately.
- Never output grade values. Describe the layout only.

Sheet "${grid.sheet}" (top rows):
${previewText(grid, 12)}
`;
}

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const col = (v: unknown, width: number): number => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < width ? (v as number) : -1);
const cell = (row: unknown[], c: number) => (c >= 0 && c < row.length ? String(row[c] ?? '').trim() : '');
const grade = (row: unknown[], c: number): string => {
  const t = cell(row, c).replace(/%$/, '');
  if (!t || Number.isNaN(Number(t))) return '';
  const n = Number(t);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
};
const FOOTER = /^(total|average|ave\.?|mean|passed|failed|remarks?|prepared by|checked by|noted by)\b/i;

function splitName(full: string) {
  if (full.includes(',')) {
    const [last, rest] = [full.split(',')[0].trim(), full.split(',').slice(1).join(' ').trim()];
    const words = rest.split(/\s+/).filter(Boolean);
    return { last, first: words.length > 1 ? words.slice(0, -1).join(' ') : words[0] ?? '', middle: words.length > 1 ? words[words.length - 1] : '' };
  }
  const words = full.split(/\s+/).filter(Boolean);
  return words.length < 2 ? { last: full, first: '', middle: '' } : { last: words[words.length - 1], first: words.slice(0, -1).join(' '), middle: '' };
}

const category = (v: unknown) => {
  const t = String(v ?? '').toLowerCase();
  return t.startsWith('core') ? 'Core' : t.startsWith('app') ? 'Applied' : 'Specialized';
};

export function buildRoster(raw: Raw, grid: Grid): { students: Student[]; warnings: string[] } {
  const width = grid.rows[0]?.length ?? 0;
  const warnings: string[] = ((raw.warnings as unknown[]) ?? []).map(String).filter((w) => w.trim());
  const L: Raw = raw.learner ?? {};
  const cols = {
    name: col(L.name, width), last: col(L.lastName, width), first: col(L.firstName, width), middle: col(L.middleName, width),
    lrn: col(L.lrn, width), sex: col(L.sex, width), birth: col(L.birthdate, width), section: col(L.section, width),
    adviser: col(L.adviser, width), strand: col(L.strand, width)
  };
  if (cols.name < 0 && cols.last < 0 && cols.lrn < 0) throw new MappingError(`Sheet "${grid.sheet}": could not find the learner name or LRN column.`, 'file');
  const first = raw.first_data_row;
  if (!Number.isInteger(first) || first < 0 || first >= grid.rows.length) throw new MappingError(`Sheet "${grid.sheet}": could not tell where the learner rows start.`, 'file');

  const subjects = ((raw.subjects as Raw[]) ?? []).map((s) => ({
    name: String(s.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 90), category: category(s.category),
    gradeLevel: String(s.gradeLevel ?? '').replace(/\D/g, '').slice(0, 2) || '', sem: String(s.sem ?? '').replace(/\D/g, '').slice(0, 1) === '2' ? '2' : '1',
    q1: col(s.q1, width), q2: col(s.q2, width), final: col(s.final, width)
  })).filter((s) => s.name && (s.final >= 0 || s.q1 >= 0));
  if (!subjects.length) throw new MappingError(`Sheet "${grid.sheet}": no subject grade columns were found.`, 'file');

  // Blocks in column order, e.g. Grade 11 sem 1, Grade 11 sem 2, Grade 12 sem 1...
  const blocks: { key: string; gradeLevel: string; sem: string }[] = [];
  subjects.forEach((s) => {
    const key = `${s.gradeLevel}-${s.sem}`;
    if (!blocks.some((b) => b.key === key)) blocks.push({ key, gradeLevel: s.gradeLevel, sem: s.sem });
  });
  blocks.sort((a, b) => Number(a.gradeLevel) - Number(b.gradeLevel) || Number(a.sem) - Number(b.sem));

  const details: Record<string, string> = {};
  Object.entries((raw.class_details as Record<string, unknown>) ?? {}).forEach(([k, v]) => { if (String(v).trim()) details[k] = String(v).trim(); });

  const students: Student[] = [];
  for (let r = first; r < grid.rows.length; r += 1) {
    const row = grid.rows[r];
    const full = cell(row, cols.name);
    const lrn = lrnText(cell(row, cols.lrn));
    const named = cols.last >= 0 ? { last: cell(row, cols.last), first: cell(row, cols.first), middle: cell(row, cols.middle) } : splitName(full);
    if (!named.last && !named.first && !lrn) continue;
    if (FOOTER.test(named.last || full)) break;

    const section = cell(row, cols.section), adviser = cell(row, cols.adviser);
    const semesters: Sf10Semester[] = [];
    for (const block of blocks) {
      const rows = subjects.filter((s) => `${s.gradeLevel}-${s.sem}` === block.key).map((s) => ({
        category: s.category, subject: s.name, q1: grade(row, s.q1), q2: grade(row, s.q2), final: grade(row, s.final), action: ''
      })).filter((x) => x.q1 || x.q2 || x.final).map((x) => ({ ...x, action: x.final ? (Number(x.final) >= 75 ? 'PASSED' : 'FAILED') : '' }));
      if (!rows.length) continue;
      const finals = rows.map((x) => x.final);
      const avg = finals.every(Boolean) ? Math.round(finals.reduce((a, b) => a + Number(b), 0) / finals.length) : null;
      semesters.push({
        school: details.schoolName ?? '', schoolId: '', gradeLevel: block.gradeLevel, sy: details.year ?? '', sem: block.sem,
        track: cell(row, cols.strand) || details.track || details.strand || '', section, rows,
        average: avg === null ? '' : String(avg), averageAction: avg === null ? '' : avg >= 75 ? 'PASSED' : 'FAILED', remarks: '',
        adviser, principal: '', dateChecked: '',
        remedial: { from: '', to: '', school: '', schoolId: '', teacher: '', rows: [] }
      });
    }
    if (!semesters.length) continue; // a learner without any grade has no record to show
    const avgs = semesters.map((s) => s.average);
    const total = avgs.every(Boolean) ? Math.round(avgs.reduce((a, b) => a + Number(b), 0) / avgs.length) : null;
    const id = students.length + 1;
    students.push({
      id, roll: String(id).padStart(2, '0'), name: [named.last, [named.first, named.middle].filter(Boolean).join(' ')].filter(Boolean).join(', ') || lrn,
      lastName: named.last, firstName: named.first, middleName: named.middle, lrn, sex: cell(row, cols.sex), birthdate: cell(row, cols.birth), age: '',
      grades: {}, attendance: { present: null, total: null, months: {}, schoolDays: {}, absent: {} }, transfer: {}, observedValues: {},
      comment: '', commentReviewed: true, traits: null, nextSteps: null,
      sf10: {
        eligibility: {}, semesters,
        completion: { trackAccomplished: cell(row, cols.strand) || details.track || details.strand || '', shsAverage: total === null ? '' : String(total), certifiedBy: '' }
      }
    });
  }
  if (!students.length) throw new MappingError(`Sheet "${grid.sheet}": no learners with grades were found below the header.`, 'file');
  return { students, warnings };
}

export async function runRosterImport(grid: Grid, caller: Caller = callAi, spend?: () => void) {
  let raw: Record<string, unknown>;
  try {
    spend?.();
    raw = await caller(buildRosterPrompt(grid), ROSTER_TOOL, 8000);
  } catch (error) {
    if (error instanceof AiError) throw new MappingError(error.message, error.kind === 'config' ? 'config' : 'ai');
    throw error;
  }
  const { students, warnings } = buildRoster(raw, grid);
  return { students, warnings, sheets: 1, mode: 'roster' as const };
}
