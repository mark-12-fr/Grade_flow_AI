/**
 * SF10 from a school grading workbook ("roster mode").
 * Learners are rows and each subject has Q1 / Q2 / Final columns, like a deliberation list.
 * The AI only maps the columns (looking at the top rows); code then copies every grade from the
 * sheet and builds one SF10 per learner, grouped by grade level and semester.
 */
import { AiError, callAi, type Caller, type Tool } from '@/server/core/llm';
import { gradeColumnWarnings, learnerColumnWarnings, listRows } from '@/server/import/checks';
import { colLetter, type Grid } from '@/server/import/extract';
import { lrnText, MappingError, type ImportCounts } from '@/server/import/mapper';
import type { Sf10Semester, Student } from '@/lib/domain/types';

const COL = { type: 'string', description: 'Spreadsheet column LETTER such as H or AB, or empty string when the sheet has no such column' };
const ROSTER_TOOL: Tool = {
  name: 'submit_roster_mapping',
  description: 'Report which column holds what in a school grading sheet. Never output grade values.',
  input_schema: {
    type: 'object',
    properties: {
      first_data_row: { type: 'integer', description: 'Row NUMBER, as printed in the sheet listing, of the first learner row' },
      learner: {
        type: 'object',
        description: 'Column LETTER of each learner field, or empty string when the sheet has no such column',
        properties: { name: COL, lastName: COL, firstName: COL, middleName: COL, lrn: COL, sex: COL, birthdate: COL, section: COL, adviser: COL, strand: COL, jhsSchool: COL, jhsAverage: COL }
      },
      subjects: {
        type: 'array',
        description: 'One entry per subject; q1/q2/final are column LETTERS (or empty string)',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' }, code: { type: 'string', description: 'Subject code as written in the header, e.g. COR 001, or empty' }, category: { type: 'string', description: 'Core, Applied or Specialized' },
            gradeLevel: { type: 'string', description: '11 or 12' }, sem: { type: 'string', description: '1 or 2' },
            q1: COL, q2: COL, final: COL
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

function listing(grid: Grid, limit = 12): string {
  return grid.rows.slice(0, limit).map((row, r) => {
    const cells = row.map((c, i) => (String(c).trim() ? `${colLetter(i)}=${String(c).replace(/\s+/g, ' ').trim().slice(0, 120)}` : '')).filter(Boolean);
    return cells.length ? `Row ${r + 1}: ${cells.join(' | ')}` : '';
  }).filter(Boolean).join('\n');
}

export function buildRosterPrompt(grid: Grid): string {
  return `This sheet ("${grid.sheet}") is a Philippine Senior High School grading workbook: each row is a learner and each subject has Q1, Q2 and FINAL grade columns,
usually for Grade 11 and Grade 12. Map its columns so an SF10 permanent record can be built for every learner. Call submit_roster_mapping exactly once.

Below are the top rows. Each cell is written as COLUMNLETTER=value, so copy the column letter exactly as printed (for example H or AB).
- learner: the column LETTER of name (full name), lastName, firstName, middleName, lrn, sex, birthdate, section, adviser, strand, jhsSchool (the junior high school the learner came from) and jhsAverage (junior high general average); use an empty string when missing.
- first_data_row: the printed Row number of the first learner row (the first row with a real learner, after all header rows).
- subjects: one entry per subject. Read the subject name from the header (drop codes like "COR 001 -" from the name but copy the code into the "code" field),
  its category (COR = Core, APP = Applied, anything else such as ABM/STM/SSP/SOC = Specialized), the grade level
  (a "GRADE 11" / "GRADE 12" header above or beside it), and the semester (1 or 2).
  q1, q2 and final are the column LETTERS of that subject's Q1, Q2 and FINAL grade. A subject with only a final column leaves q1 and q2 empty.
  If the semester is not written, infer it from the subject and the column order (Grade 11 first-semester subjects come before second-semester ones); add a warning when you infer.
- If a subject appears in more than one block (different grade level or semester), list each block separately.
- Never output grade values. Describe the layout only.

Sheet "${grid.sheet}" (top rows):
${listing(grid)}
`;
}

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Column index from what the model wrote: 7, "7", "7(H)", or a spreadsheet letter like "H" / "AB". -1 when unusable. */
export function toCol(v: unknown, width: number): number {
  let n = -1;
  if (typeof v === 'number' && Number.isInteger(v)) n = v;
  else if (typeof v === 'string') {
    const t = v.trim();
    const num = /^(\d+)\s*(\(.*\))?$/.exec(t);
    const letters = /^([A-Za-z]{1,3})$/.exec(t) ?? /\(([A-Za-z]{1,3})\)/.exec(t);
    if (num) n = Number(num[1]);
    else if (letters) n = [...letters[1].toUpperCase()].reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  }
  return n >= 0 && n < width ? n : -1;
}
const col = toCol;
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

/**
 * Models are poor at telling which semester a subject belongs to when the sheet does not say.
 * DepEd core subject codes restart for the second semester (COR 001, 003, ... COR 017, then COR 002, 004...),
 * so inside one grade level a drop in the COR number marks the start of semester 2.
 */
export function splitSemesters(subjects: { code: string; gradeLevel: string; sem: string }[], warnings: string[] = []) {
  const levels = [...new Set(subjects.map((s) => s.gradeLevel))];
  levels.forEach((level) => {
    const group = subjects.filter((s) => s.gradeLevel === level);
    if (group.length < 8) return; // too few subjects to hold two semesters
    let last = -1, boundary = -1;
    group.forEach((s, i) => {
      const m = /^COR\s*0*(\d+)/i.exec(s.code);
      if (!m) return;
      const n = Number(m[1]);
      if (last >= 0 && n < last && boundary < 0) boundary = i;
      last = n;
    });
    if (boundary <= 0) return;
    group.forEach((s, i) => { s.sem = i < boundary ? '1' : '2'; });
    warnings.push(`Grade ${level}: semesters were assigned from the subject codes (first ${boundary} subjects = 1st semester). Please check.`);
  });
}

function jhsEligibility(row: unknown[], cols: { jhsSchool: number; jhsAverage: number }): Record<string, string | boolean> {
  const school = cell(row, cols.jhsSchool);
  const ave = grade(row, cols.jhsAverage);
  return school || ave ? { jhsCompleter: true, jhsGenAve: ave, schoolName: school } : {};
}

export function buildRoster(raw: Raw, grid: Grid): { students: Student[]; warnings: string[]; counts: ImportCounts } {
  const width = grid.rows[0]?.length ?? 0;
  const warnings: string[] = ((raw.warnings as unknown[]) ?? []).map(String).filter((w) => w.trim());
  const L: Raw = raw.learner ?? {};
  const cols = {
    name: col(L.name, width), last: col(L.lastName, width), first: col(L.firstName, width), middle: col(L.middleName, width),
    lrn: col(L.lrn, width), sex: col(L.sex, width), birth: col(L.birthdate, width), section: col(L.section, width),
    adviser: col(L.adviser, width), strand: col(L.strand, width), jhsSchool: col(L.jhsSchool, width), jhsAverage: col(L.jhsAverage, width)
  };
  if (cols.name < 0 && cols.last < 0 && cols.lrn < 0) console.warn('[sf10 roster] unusable learner mapping from the AI:', JSON.stringify(raw.learner)?.slice(0, 400));
  if (cols.name < 0 && cols.last < 0 && cols.lrn < 0) throw new MappingError(`Sheet "${grid.sheet}": could not find the learner name or LRN column.`, 'file');
  const printed = typeof raw.first_data_row === 'string' && /^\d+$/.test(raw.first_data_row.trim()) ? Number(raw.first_data_row) : raw.first_data_row;
  const first = Number.isInteger(printed) ? (printed as number) - 1 : printed;
  if (!Number.isInteger(first) || first < 0 || first >= grid.rows.length) throw new MappingError(`Sheet "${grid.sheet}": could not tell where the learner rows start.`, 'file');

  const subjects = ((raw.subjects as Raw[]) ?? []).map((s) => ({
    code: String(s.code ?? '').trim(), name: String(s.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 90), category: category(s.category),
    gradeLevel: String(s.gradeLevel ?? '').replace(/\D/g, '').slice(0, 2) || '', sem: String(s.sem ?? '').replace(/\D/g, '').slice(0, 1) === '2' ? '2' : '1',
    q1: col(s.q1, width), q2: col(s.q2, width), final: col(s.final, width)
  })).filter((s) => s.name && (s.final >= 0 || s.q1 >= 0));
  if (!subjects.length) throw new MappingError(`Sheet "${grid.sheet}": no subject grade columns were found.`, 'file');

  splitSemesters(subjects, warnings);

  // Blocks in column order, e.g. Grade 11 sem 1, Grade 11 sem 2, Grade 12 sem 1...
  const blocks: { key: string; gradeLevel: string; sem: string }[] = [];
  subjects.forEach((s) => {
    const key = `${s.gradeLevel}-${s.sem}`;
    if (!blocks.some((b) => b.key === key)) blocks.push({ key, gradeLevel: s.gradeLevel, sem: s.sem });
  });
  blocks.sort((a, b) => Number(a.gradeLevel) - Number(b.gradeLevel) || Number(a.sem) - Number(b.sem));

  const details: Record<string, string> = {};
  Object.entries((raw.class_details as Record<string, unknown>) ?? {}).forEach(([k, v]) => {
    const t = v == null ? '' : String(v).trim();
    if (t && !/^(null|undefined|n\/a|none)$/i.test(t)) details[k] = t;
  });

  const students: Student[] = [];
  const skipped = { footer: [] as number[], noGrades: [] as number[], nameless: [] as number[], blank: 0 };
  for (let r = first; r < grid.rows.length; r += 1) {
    const row = grid.rows[r];
    const full = cell(row, cols.name);
    const lrn = lrnText(cell(row, cols.lrn));
    const named = cols.last >= 0 ? { last: cell(row, cols.last), first: cell(row, cols.first), middle: cell(row, cols.middle) } : splitName(full);
    if (!named.last && !named.first && !lrn) {
      if (row.some((c) => String(c ?? '').trim() !== '')) skipped.nameless.push(r + 1); else skipped.blank += 1;
      continue;
    }
    const footer = FOOTER.test(named.last || full);
    if (footer && !lrn) { skipped.footer.push(r + 1); continue; } // a subtotal or signature row, not the end of the list

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
    if (!semesters.length) { skipped.noGrades.push(r + 1); continue; } // a learner without any grade has no record to show
    const avgs = semesters.map((s) => s.average);
    const total = avgs.every(Boolean) ? Math.round(avgs.reduce((a, b) => a + Number(b), 0) / avgs.length) : null;
    const id = students.length + 1;
    students.push({
      id, roll: String(id).padStart(2, '0'), name: [named.last, [named.first, named.middle].filter(Boolean).join(' ')].filter(Boolean).join(', ') || lrn,
      lastName: named.last, firstName: named.first, middleName: named.middle, lrn, sex: cell(row, cols.sex), birthdate: cell(row, cols.birth), age: '',
      grades: {}, attendance: { present: null, total: null, months: {}, schoolDays: {}, absent: {} }, transfer: {}, observedValues: {},
      comment: '', commentReviewed: true, traits: null, nextSteps: null,
      sf10: {
        eligibility: jhsEligibility(row, cols), semesters,
        completion: { trackAccomplished: cell(row, cols.strand) || details.track || details.strand || '', shsAverage: total === null ? '' : String(total), certifiedBy: '' }
      }
    });
  }
  if (skipped.noGrades.length) warnings.push(`${skipped.noGrades.length} learner row${skipped.noGrades.length === 1 ? '' : 's'} skipped because no numeric grade was found (${listRows(skipped.noGrades)}).`);
  if (skipped.footer.length) warnings.push(`${skipped.footer.length} total/signature row${skipped.footer.length === 1 ? '' : 's'} ignored (${listRows(skipped.footer)}).`);
  warnings.push(
    ...learnerColumnWarnings(grid, first, { name: cols.name >= 0 ? cols.name : cols.last, lrn: cols.lrn }),
    ...gradeColumnWarnings(grid, first, subjects.flatMap((s) => {
      const periods: [string, number][] = [['Q1', s.q1], ['Q2', s.q2], ['Final', s.final]];
      return periods.filter(([, c]) => c >= 0).map(([p, c]) => ({ col: c, label: `Grade ${s.gradeLevel} sem ${s.sem} ${s.name} ${p}` }));
    }))
  );
  if (skipped.nameless.length) warnings.push(`${skipped.nameless.length} row${skipped.nameless.length === 1 ? ' has' : 's have'} data but no learner name or LRN, so ${skipped.nameless.length === 1 ? 'it was' : 'they were'} skipped (${listRows(skipped.nameless)}).`);
  const skippedCount = skipped.noGrades.length + skipped.footer.length + skipped.nameless.length;
  const counts = { found: students.length + skippedCount, imported: students.length, skipped: skippedCount, blank: skipped.blank };
  warnings.unshift(`${counts.found} row${counts.found === 1 ? '' : 's'} with content found below the header (${skipped.blank} empty row${skipped.blank === 1 ? '' : 's'} ignored): ${students.length} learners imported, ${skippedCount} skipped.`);
  if (!students.length) throw new MappingError(`Sheet "${grid.sheet}": no learners with grades were found below the header.`, 'file');
  if (cols.lrn >= 0) {
    const ok = students.filter((x) => /^\d{10,13}$/.test(x.lrn)).length;
    if (ok / students.length < 0.5) warnings.push(`Most values in the column read as LRN do not look like LRNs (${ok} of ${students.length}). Check that the right column was used.`);
  }
  return { students, warnings, counts };
}

export async function runRosterImport(grid: Grid, caller: Caller = callAi, spend?: () => void, emit?: (percent: number, label: string) => void) {
  let raw: Record<string, unknown>;
  try {
    spend?.();
    emit?.(10, 'Mapping the columns');
    raw = await caller(buildRosterPrompt(grid), ROSTER_TOOL, 8000);
  } catch (error) {
    if (error instanceof AiError) throw new MappingError(error.message, error.kind === 'config' ? 'config' : 'ai');
    throw error;
  }
  emit?.(80, 'Copying each learner\'s grades');
  const { students, warnings, counts } = buildRoster(raw, grid);
  return { students, warnings, counts, sheets: 1, mode: 'roster' as const };
}
