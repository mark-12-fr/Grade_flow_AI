/**
 * Reader for a school-wide master list (one row per learner, many "<code> - <Subject>" column groups of Q1/Q2/FINAL,
 * several strands and grade levels). The teacher picks one section; grades are copied by code, never generated.
 */
import { ALL_SUBJECTS, subjectsFor } from '@/lib/domain/curriculum';
import type { Student } from '@/lib/domain/types';
import type { Grid } from '@/server/import/extract';
import { lrnText, newStudent, type ImportResult, type ImportSchema, MappingError } from '@/server/import/mapper';

const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const cell = (row: unknown[], i: number) => (i >= 0 && i < row.length ? String(row[i] ?? '').trim() : '');
const STOP = new Set(['the', 'of', 'to', 'and', 'in', 'for', 'sa', 'ng', 'at', 'a', 'shs']);

const tokens = (text: string) => text.toLowerCase().replace(/^\W*[a-z]{3}\s*\d{3}\s*-\s*/, '').split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));
const oneEdit = (a: string, b: string) => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return a.slice(i + (a.length >= b.length ? 1 : 0)) === b.slice(i + (b.length >= a.length ? 1 : 0));
};
/** Same word, allowing one typo or a longer form ("Larang" / "Larangan"). */
const sameWord = (a: string, b: string) => {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 5 && long.startsWith(short) || short.length >= 4 && oneEdit(a, b)
    || short.length >= 9 && long.slice(0, 7) === short.slice(0, 7); // accounting / accountancy
};
const overlap = (a: string[], b: string[]) => a.filter((x) => b.some((y) => sameWord(x, y))).length;

interface Group { start: number; name: string; grade: number }
interface Layout {
  qRow: number; first: number; groups: Group[];
  col: { name: number; lrn: number; age: number; sex: number; section: number; strand: number; adviser: number; birth: number };
}

export function layoutOf(grid: Grid): Layout | null {
  const rows = grid.rows;
  const qRow = rows.slice(0, 8).findIndex((r) => r.filter((c) => norm(c) === 'final').length > 30);
  if (qRow < 1) return null;
  const headerRow = rows.slice(0, qRow + 1).findIndex((r) => r.some((c) => norm(c) === 'lrn'));
  if (headerRow < 0) return null;
  const head = rows[headerRow];
  const find = (test: (h: string) => boolean) => head.findIndex((c) => test(norm(c)));
  const col = {
    name: find((h) => h === 'name'), lrn: find((h) => h === 'lrn'), age: find((h) => h === 'age'),
    sex: find((h) => h === 'gender' || h === 'sex'), section: find((h) => h.includes('section')),
    strand: find((h) => h.includes('strand')), adviser: find((h) => h === 'adviser'), birth: find((h) => h.includes('birthdate'))
  };
  if (col.name < 0 || col.section < 0) return null;
  const groups: Group[] = [];
  rows[qRow].forEach((c, i) => {
    if (norm(c) !== 'q1') return;
    const name = cell(rows[qRow - 1], i);
    const grade = Number(/grade\s*(\d+)/i.exec(cell(rows[qRow - 2] ?? [], i))?.[1] ?? 0);
    if (name) groups.push({ start: i, name, grade });
  });
  return { qRow, first: qRow + 1, groups, col };
}

export function listSections(grid: Grid): { name: string; learners: number }[] {
  const lay = layoutOf(grid);
  if (!lay) return [];
  const counts = new Map<string, number>();
  grid.rows.slice(lay.first).forEach((r) => {
    const section = cell(r, lay.col.section);
    if (section && cell(r, lay.col.name)) counts.set(section, (counts.get(section) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([name, learners]) => ({ name, learners }));
}

function matchGroups(subjectName: string, groups: Group[], strand: string): Group[] {
  const parts = subjectName.split(/[/:|]/).map(tokens).filter((p) => p.length);
  const strandTokens = tokens(strand);
  const out: { group: Group; score: number }[] = [];
  groups.forEach((group) => {
    const g = tokens(group.name);
    let best = 0;
    parts.forEach((p) => {
      const o = overlap(p, g);
      const extra = g.filter((t) => !p.some((x) => sameWord(x, t))).filter((t) => /[a-z]{3}/.test(t));
      if (o === p.length && p.length >= 2 && extra.length) {
        // The subject is a shorter form of a strand-specific title (e.g. "Culminating Activity in Criminology"):
        // it only matches the title of the learner's own strand.
        if (overlap(extra, strandTokens) > 0) best = Math.max(best, 0.9);
        return;
      }
      const jac = o / (p.length + g.length - o);
      if (jac >= 0.6) best = Math.max(best, jac);
    });
    if (best) out.push({ group, score: best });
  });
  const top = Math.max(0, ...out.map((m) => m.score));
  return out.filter((m) => m.score === top).map((m) => m.group);
}

const STRAND_KEYS: [RegExp, string][] = [
  [/criminology/i, 'GASCRIM'], [/health/i, 'HEALTH'], [/accountancy|\babm\b/i, 'ABM'], [/humanities|humss/i, 'HUMSS'],
  [/general academic|\bgas\b/i, 'GAS'], [/science|stem/i, 'STEM']
];
const strandKey = (text: string) => STRAND_KEYS.find(([re]) => re.test(text))?.[1] ?? text;

/** section = one section's name, or null to read every section in the list. */
export function readMasterList(grid: Grid, schema: ImportSchema, section: string | null): ImportResult {
  const lay = layoutOf(grid);
  if (!lay) throw new MappingError('This list could not be read: the learner name, section and Q1/Q2/Final columns were not found.', 'file');
  const level = Math.max(0, ...lay.groups.map((g) => g.grade));
  const groups = lay.groups.filter((g) => g.grade === level);
  const earlier = lay.groups.filter((g) => g.grade !== level); // the printed card also shows subjects graded in the earlier year
  const rows = grid.rows.slice(lay.first).filter((r) => (section === null ? cell(r, lay.col.section) : cell(r, lay.col.section) === section) && cell(r, lay.col.name));
  if (!rows.length) throw new MappingError(`No learners were found in ${section === null ? 'this list' : `section "${section}"`}.`, 'file');

  const warnings: string[] = [];
  const mapping: { col: number; header: string; field: string }[] = [];
  const byStrand = new Map<string, Map<string, Group[]>>();
  const colsFor = (strand: string) => {
    const known = byStrand.get(strand);
    if (known) return known;
    const cols = new Map<string, Group[]>();
    subjectsFor(strandKey(strand)).forEach((subject) => {
      const names = [subject.name, ...(subject.alt ?? [])].join('|');
      // Preferred column first (first/last match by semester), then any other match, then earlier-year columns.
      const rank = (hits: Group[]) => (subject.semester === 'first' ? hits : [...hits].reverse());
      const options = [...rank(matchGroups(names, groups, strand)), ...rank(matchGroups(names, earlier, strand))];
      if (options.length) cols.set(subject.key, options);
    });
    byStrand.set(strand, cols);
    return cols;
  };

  const grade = (raw: unknown) => {
    const n = Number(String(raw ?? '').trim());
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : null; // 0 is the sheet's placeholder for "not taken"
  };
  const students: Student[] = rows.map((row, i) => {
    const stu = newStudent(i + 1, cell(row, lay.col.name), schema);
    stu.roll = String(i + 1).padStart(2, '0');
    stu.age = cell(row, lay.col.age).replace(/\.0+$/, '');
    const sex = cell(row, lay.col.sex).toLowerCase();
    stu.sex = sex.startsWith('m') ? 'Male' : sex.startsWith('f') ? 'Female' : cell(row, lay.col.sex);
    stu.lrn = lrnText(row[lay.col.lrn]);
    const birth = cell(row, lay.col.birth);
    stu.birthdate = /^\d{4}-\d{2}-\d{2}/.test(birth) ? birth.slice(0, 10) : birth;
    const strandText = cell(row, lay.col.strand);
    const cols = colsFor(strandText);
    stu.section = cell(row, lay.col.section);
    stu.strand = strandKey(strandText);
    stu.adviser = cell(row, lay.col.adviser);
    subjectsFor(stu.strand).forEach((subject) => {
      const g: Record<string, number | null> = {};
      const options = cols.get(subject.key) ?? [];
      // The learner's own grades decide between several matching columns (the first one that has a mark).
      const pick = options.find((o) => [0, 1, 2].some((k) => grade(row[o.start + k]) !== null)) ?? options[0];
      const periods = subject.semester === 'first' ? ['q1', 'q2'] : ['q3', 'q4'];
      [...periods, 'final'].forEach((p, k) => { g[p] = pick ? grade(row[pick.start + k]) : null; });
      stu.grades[subject.key] = g;
    });
    return stu;
  });

  const first = students[0];
  const details: Record<string, string> = { gradeLevel: String(level || 12) };
  if (section !== null) Object.assign(details, { section, strand: first.strand ?? '', teacher: first.adviser ?? '' });
  else details.section = 'All sections';
  const sections = new Set(students.map((x) => x.section)).size;
  [...byStrand.entries()].forEach(([strand, cols]) => {
    const missing = subjectsFor(strandKey(strand)).filter((x) => !cols.has(x.key)).map((x) => x.name);
    if (missing.length) warnings.push(`${strandKey(strand)}: no column found for ${missing.join(', ')}; left blank.`);
    cols.forEach((options, key) => {
      const pick = options[0];
      const subject = ALL_SUBJECTS.find((x) => x.key === key)!;
      const periods = subject.semester === 'first' ? ['q1', 'q2'] : ['q3', 'q4'];
      if (mapping.some((m) => m.field === `grade:${key}:${periods[0]}`)) return;
      [...periods, 'final'].forEach((p, k) => mapping.push({ col: pick.start + k, header: `${pick.name} · ${['Q1', 'Q2', 'FINAL'][k]}`, field: `grade:${key}:${p}` }));
    });
  });
  warnings.unshift(`Read ${section === null ? `all ${sections} sections` : `section ${section}`} from the school-wide list "${grid.sheet}": ${students.length} learners. Attendance and observed values are not in this list.`);
  return {
    students, classDetails: details, mapping, warnings, sheet: grid.sheet,
    counts: { found: students.length, imported: students.length, skipped: 0, blank: 0 }
  };
}
