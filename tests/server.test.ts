import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import XLSX from '@/vendor/xlsx.cjs';
import { readGrid, readSheets, parseCsv } from '@/server/import/extract';
import { cleanField, MappingError, runImport, type ImportSchema } from '@/server/import/mapper';
import { runImportSf10 } from '@/server/import/sf10';
import { limiter, limits, guard, HttpError } from '@/server/core/guard';
import { parseJson, callAi, AiError } from '@/server/core/llm';
import { SUBJECTS, ATTENDANCE_MONTHS, CORE_VALUE_KEYS, TRANSFER_FIELDS } from '@/lib/domain/curriculum';

const schema: ImportSchema = {
  subjects: SUBJECTS.map((s) => ({ key: s.key, name: s.name, semester: s.semester })),
  months: ATTENDANCE_MONTHS.map((m) => m.key), coreValues: [...CORE_VALUE_KEYS], transferFields: [...TRANSFER_FIELDS]
};

function workbook(rows: unknown[][], name = 'Sheet1'): Buffer {
  const wb = (XLSX as unknown as { utils: { book_new(): unknown; aoa_to_sheet(r: unknown[][]): unknown; book_append_sheet(w: unknown, s: unknown, n: string): void }; write(w: unknown, o: unknown): Buffer }).utils;
  const lib = XLSX as unknown as { write(w: unknown, o: unknown): Buffer };
  const book = wb.book_new();
  wb.book_append_sheet(book, wb.aoa_to_sheet(rows), name);
  return lib.write(book, { type: 'buffer', bookType: 'xlsx' });
}

describe('mapper', () => {
  it('copies values by the mapping and ignores formatting slips', async () => {
    const rows = [['Title row'], ['Name', 'LRN', 'MIL Q1', 'MIL Q2', 'MIL Final'], ['Santos, Maria', 136388831130, 90, 92, 91], ['Total', '', '', '', '']];
    const grid = readGrid('a.xlsx', workbook(rows));
    const caller = async () => ({
      header_row: 1, first_data_row: 2,
      columns: [{ col: 0, field: 'Learner:name' }, { col: 1, field: 'lrn' }, { col: 2, field: 'grade:media_information_literacy:q1' },
        { col: 3, field: 'grade:media_information_literacy:q2' }, { col: 4, field: 'grade:media_information_literacy:final' }, { col: 9, field: 'name' }],
      class_details: { strand: 'ABM', nonsense: 'x' }
    });
    const result = await runImport(grid, schema, caller);
    expect(result.students).toHaveLength(1); // the "Total" footer row stops the read
    expect(result.students[0].lrn).toBe('136388831130');
    expect(result.students[0].grades.media_information_literacy).toMatchObject({ q1: 90, q2: 92, final: 91 });
    expect(result.classDetails).toEqual({ strand: 'ABM' });
    expect(result.warnings.some((w) => w.includes('unusable'))).toBe(true);
  });

  it('fails clearly when the name column is missing', async () => {
    const grid = readGrid('a.xlsx', workbook([['a', 'b'], [1, 2]]));
    await expect(runImport(grid, schema, async () => ({ header_row: 0, first_data_row: 1, columns: [{ col: 0, field: 'lrn' }] }))).rejects.toThrow(MappingError);
  });

  it('cleans model field names', () => {
    expect(cleanField('Learner:name')).toBe('name');
    expect(cleanField(' Grade:philosophy:q1 ')).toBe('grade:philosophy:q1');
  });
});

describe('extract', () => {
  it('parses quoted CSV and reads every sheet', () => {
    expect(parseCsv('a,"b,c"\n"x ""y""",2\r\n')).toEqual([['a', 'b,c'], ['x "y"', '2']]);
    expect(readSheets('a.xlsx', workbook([['x', 1]]))).toHaveLength(1);
  });
  it('reads the real sample workbook', () => {
    const file = 'public/samples/messy_class.xlsx';
    if (!fs.existsSync(file)) return;
    const grid = readGrid(file, fs.readFileSync(file));
    expect(grid.rows.length).toBeGreaterThan(10);
  });
});

describe('sf10', () => {
  const rows = [['LAST NAME:', 'CULLO', 'FIRST NAME:', 'PRINCESS'], ['Core', 'General Mathematics', 78, 85, 82, 'PASSED']];
  const stub = async () => ({
    learner: { lastName: 'CULLO', firstName: 'PRINCESS', lrn: '1176-2413' },
    semesters: [{ sem: '1', rows: [{ category: 'Core', subject: 'General Mathematics', q1: '78', q2: '99', final: '82', action: 'passed' }], average: '82' }]
  });
  it('keeps only values that exist in the sheet', async () => {
    const out = await runImportSf10(readSheets('x.xlsx', workbook(rows)), { caller: stub });
    const sem = out.students[0].sf10!.semesters[0];
    expect(sem.rows[0]).toMatchObject({ q1: '78', q2: '', final: '82', action: 'PASSED' });
    expect(out.students[0].lrn).toBe('11762413');
    expect(out.warnings.some((w) => w.includes('99'))).toBe(true);
  });
  it('skips oversized sheets without calling the AI', async () => {
    const caller = vi.fn(stub);
    await expect(runImportSf10(readSheets('x.xlsx', workbook(rows)), { caller, maxChars: 5 })).rejects.toThrow(MappingError);
    expect(caller).not.toHaveBeenCalled();
  });
});

describe('guard', () => {
  beforeEach(() => limiter.reset());
  afterEach(() => { delete process.env.AI_RATE_LIMIT; delete process.env.AI_DAILY_CAP; delete process.env.APP_ACCESS_CODE; });
  const req = (headers: Record<string, string> = {}) => new Request('http://x/api', { method: 'POST', headers });

  it('rate limits per visitor', () => {
    process.env.AI_RATE_LIMIT = '2';
    guard(req()); guard(req());
    expect(() => guard(req())).toThrow(HttpError);
  });
  it('enforces the daily cap', () => {
    process.env.AI_DAILY_CAP = '1';
    limiter.takeCall();
    expect(() => limiter.takeCall()).toThrow();
  });
  it('has no limits unless configured', () => {
    const cfg = limits();
    expect([cfg.rateLimit, cfg.dailyCap, cfg.maxSheets, cfg.maxSheetChars]).toEqual([0, 0, 0, 0]);
    for (let i = 0; i < 50; i += 1) guard(req());
    for (let i = 0; i < 50; i += 1) limiter.takeCall();
  });
  it('requires the access code when set', () => {
    process.env.APP_ACCESS_CODE = 'secret';
    expect(() => guard(req())).toThrow(HttpError);
    expect(() => guard(req({ 'x-access-code': 'wrong' }))).toThrow(HttpError);
    expect(() => guard(req({ 'x-access-code': 'secret' }))).not.toThrow();
    expect(limits().maxSheets).toBe(0);
  });
});

describe('llm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of ['AI_API_KEY', 'AI_PROVIDER', 'AI_PROVIDERS', 'AI_ROTATE', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY']) delete process.env[k];
  });
  it('parses fenced JSON', () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => parseJson('nope')).toThrow(AiError);
  });
  it('needs a key for hosted providers', async () => {
    process.env.AI_PROVIDER = 'gemini';
    await expect(callAi('p', { name: 't', input_schema: {} })).rejects.toMatchObject({ kind: 'config' });
  });
  it('sends an OpenAI-style request and returns JSON', async () => {
    process.env.AI_PROVIDER = 'groq'; process.env.AI_API_KEY = 'k';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"a":"ok"}' }, finish_reason: 'stop' }] })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(callAi('hello', { name: 't', input_schema: {} })).resolves.toEqual({ a: 'ok' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/groq\.com\/openai\/v1\/chat\/completions$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
  });
  const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"a":"ok"}' }, finish_reason: 'stop' }] }));
  it('falls back to the next provider when the first is out of quota', async () => {
    process.env.GEMINI_API_KEY = 'g'; process.env.GROQ_API_KEY = 'q';
    const fetchMock = vi.fn(async (url: string) => (url.includes('googleapis') ? new Response('', { status: 429 }) : ok()));
    vi.stubGlobal('fetch', fetchMock);
    await expect(callAi('hi', { name: 't', input_schema: {} })).resolves.toEqual({ a: 'ok' });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([expect.stringMatching(/googleapis/), expect.stringMatching(/groq\.com/)]);
  });
  it('rotates between keys when AI_ROTATE=1', async () => {
    process.env.GROQ_API_KEY = 'k1,k2'; process.env.AI_ROTATE = '1';
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    for (let i = 0; i < 2; i++) await callAi('hi', { name: 't', input_schema: {} });
    const auth = fetchMock.mock.calls.map((c) => ((c as unknown as [string, RequestInit])[1].headers as Record<string, string>).Authorization);
    expect(new Set(auth).size).toBe(2);
  });
});

describe('sf10 roster mode', () => {
  const rows: unknown[][] = [
    ['LRN', 'LAST NAME', 'FIRST NAME', 'ADVISER', 'GRADE 11', '', '', 'GRADE 11', '', ''],
    ['', '', '', '', 'COR 001 - Oral Communication in Context', '', '', 'COR 002 - Reading and Writing Skills', '', ''],
    ['', '', '', '', 'Q1', 'Q2', 'FINAL', 'Q1', 'Q2', 'FINAL'],
    ['117624130043', 'CULLO', 'PRINCESS', 'MS. GALLO', 84, 86, 85, 87, 86, 87],
    ['123456789012', 'REYES', 'JUAN', 'MS. GALLO', 78, 82, 80, '', '', ''],
    ['', '', '', '', '', '', '', '', '', '']
  ];
  const mapping = async () => ({
    first_data_row: 4,
    learner: { lrn: 'A', lastName: 'B', firstName: 'C', adviser: 'D' },
    subjects: [
      { name: 'Oral Communication in Context', category: 'Core', gradeLevel: '11', sem: '1', q1: 'E', q2: 'F', final: 'G' },
      { name: 'Reading and Writing Skills', category: 'Core', gradeLevel: '11', sem: '2', q1: 'H', q2: 'I', final: 'J' }
    ],
    class_details: { year: '2024-2025', schoolName: null, track: 'null' }
  });

  it('is not mistaken for a form, and builds one SF10 per learner', async () => {
    const { looksLikeForm, runRosterImport } = await import('@/server/import/sf10Roster');
    const grid = readSheets('x.xlsx', workbook(rows))[0];
    expect(looksLikeForm(grid)).toBe(false);
    const out = await runRosterImport(grid, mapping);
    expect(out.students).toHaveLength(2);
    const a = out.students[0];
    expect(a.lrn).toBe('117624130043');
    expect(a.sf10!.semesters.map((s) => `${s.gradeLevel}-${s.sem}`)).toEqual(['11-1', '11-2']);
    expect(a.sf10!.semesters[0].rows[0]).toMatchObject({ subject: 'Oral Communication in Context', q1: '84', q2: '86', final: '85', action: 'PASSED' });
    expect(a.sf10!.semesters[0].average).toBe('85');
    expect(a.sf10!.semesters[0].adviser).toBe('MS. GALLO');
    expect(a.sf10!.semesters[0].school).toBe(''); // a missing school stays blank, never the text "null"
    expect(a.sf10!.semesters[0].sy).toBe('2024-2025');
    // second learner has no second-semester grades, so that semester is left out (nothing invented)
    expect(out.students[1].sf10!.semesters).toHaveLength(1);
    expect(out.warnings.some((w) => w.includes('LRN'))).toBe(false);
  });

  it('keeps reading past total rows and reports skipped rows', async () => {
    const { runRosterImport } = await import('@/server/import/sf10Roster');
    const body: unknown[][] = [];
    for (let i = 0; i < 900; i += 1) {
      body.push([String(100000000000 + i), `LAST${i}`, 'FIRST', 'MS. GALLO', 80, 82, 81, '', '', '']);
      if (i % 300 === 299) body.push(['', 'TOTAL', '', '', '', '', '', '', '', '']);
    }
    body.push(['', 'NOGRADE', 'X', '', '', '', '', '', '', '']);
    const grid = readSheets('x.xlsx', workbook([...rows.slice(0, 3), ...body]))[0];
    const out = await runRosterImport(grid, mapping);
    expect(out.students).toHaveLength(900);
    expect(out.warnings.some((w) => w.includes('3 total/signature'))).toBe(true);
    expect(out.warnings.some((w) => w.includes('1 learner row skipped'))).toBe(true);
  });

  it('warns when the LRN column does not hold LRNs', async () => {
    const { runRosterImport } = await import('@/server/import/sf10Roster');
    const grid = readSheets('x.xlsx', workbook(rows))[0];
    const out = await runRosterImport(grid, async () => ({ ...(await mapping()), learner: { lrn: 'D', lastName: 'B', firstName: 'C' } }));
    expect(out.warnings.some((w) => w.includes('LRN'))).toBe(true);
  });

  it('recognises a real SF10 form', async () => {
    const { looksLikeForm } = await import('@/server/import/sf10Roster');
    const grid = readSheets('x.xlsx', workbook([["LEARNER'S INFORMATION"], ['LAST NAME:', 'CULLO']]))[0];
    expect(looksLikeForm(grid)).toBe(true);
  });
});

describe('toCol', () => {
  it('accepts numbers, numeric strings, "7(H)" and letters', async () => {
    const { toCol } = await import('@/server/import/sf10Roster');
    expect([toCol(7, 50), toCol('7', 50), toCol('7(H)', 50), toCol('H', 50), toCol('AB', 50), toCol('b', 50)]).toEqual([7, 7, 7, 7, 27, 1]);
    expect([toCol(-1, 50), toCol(99, 50), toCol('zzz', 50), toCol(null, 50), toCol('x1', 50)]).toEqual([-1, -1, -1, -1, -1]);
  });
});

describe('splitSemesters', () => {
  it('starts semester 2 where the COR code restarts', async () => {
    const { splitSemesters } = await import('@/server/import/sf10Roster');
    const codes = ['APP 001', 'COR 001', 'COR 003', 'COR 005', 'COR 007', 'COR 008', 'COR 011', 'COR 012', 'COR 017', 'ABM 001', 'COR 002', 'COR 004', 'COR 006', 'COR 009', 'APP 005', 'ABM 002'];
    const subjects = codes.map((code) => ({ code, gradeLevel: '11', sem: '1' }));
    const warnings: string[] = [];
    splitSemesters(subjects, warnings);
    expect(subjects.map((s) => s.sem).join('')).toBe('1111111111222222'.slice(0, 0) + '1111111111' + '222222');
    expect(warnings).toHaveLength(1);
    const few = [{ code: 'COR 005', gradeLevel: '12', sem: '2' }, { code: 'COR 001', gradeLevel: '12', sem: '2' }];
    splitSemesters(few);
    expect(few.map((s) => s.sem)).toEqual(['2', '2']);
  });
});

describe('sf10 quality and bulk details', () => {
  const mk = (id: number, lrn: string, finals: string[], school = '', sy = ''): import('@/lib/domain/types').Student => ({
    id, roll: '', name: `L${id}`, age: '', sex: '', lrn, grades: {}, attendance: { present: null, total: null, months: {}, schoolDays: {}, absent: {} },
    transfer: {}, observedValues: {}, comment: '', commentReviewed: true, traits: null, nextSteps: null,
    sf10: {
      eligibility: {}, completion: {},
      semesters: [{ school, schoolId: '', gradeLevel: '11', sy, sem: '1', track: '', section: '', average: '', averageAction: '', remarks: '', adviser: '', principal: '', dateChecked: '',
        rows: finals.map((f, i) => ({ category: 'Core', subject: `S${i}`, q1: '', q2: '', final: f, action: '' })),
        remedial: { from: '', to: '', school: '', schoolId: '', teacher: '', rows: [] } }]
    }
  });

  it('flags missing LRN, missing finals and missing details', async () => {
    const { learnerIssues, expectedSemesters } = await import('@/lib/sf10/quality');
    const { initialState } = await import('@/lib/state/store');
    const good = mk(1, '115675140180', ['80', '81'], 'PUI', '2024-2025');
    const bad = mk(2, '', ['80', ''], '', '');
    const all = [good, bad];
    expect(learnerIssues(good, initialState, expectedSemesters(all))).toEqual([]);
    const kinds = learnerIssues(bad, initialState, expectedSemesters(all)).map((i) => i.kind).sort();
    expect(kinds).toEqual(['details', 'grade', 'lrn']);
  });

  it('applies details only to blanks unless told to overwrite, and only to the chosen learners', async () => {
    const { applyDetails, emptyDetails } = await import('@/lib/sf10/quality');
    const a = mk(1, '1', ['80'], 'KEEP ME', ''), b = mk(2, '2', ['80'], '', '');
    const v = { ...emptyDetails, schoolName: 'PHINMA', sy: '2024-2025', principal: 'DR. LIM' };
    const r1 = applyDetails([a, b], new Set([1, 2]), v, false);
    expect(r1.changed).toBe(2);
    expect(r1.students[0].sf10!.semesters[0].school).toBe('KEEP ME');
    expect(r1.students[1].sf10!.semesters[0].school).toBe('PHINMA');
    expect(r1.students[1].sf10!.completion.certifiedBy).toBe('DR. LIM');
    const r2 = applyDetails([a, b], new Set([1]), v, true);
    expect(r2.students[0].sf10!.semesters[0].school).toBe('PHINMA');
    expect(r2.students[1].sf10!.semesters[0].school).toBe(''); // learner 2 was not chosen
    const r3 = applyDetails([a], new Set([1]), { ...emptyDetails, sy: '2025-2026', syLevel: '12' }, true);
    expect(r3.changed).toBe(0); // the school year is only for grade 12
  });
});

describe('accuracy checks after the AI maps columns', () => {
  it('flags a grade column that does not hold grades, duplicate LRNs and names with numbers', async () => {
    const { gradeColumnWarnings, learnerColumnWarnings } = await import('@/server/import/checks');
    const grid = readSheets('x.xlsx', workbook([
      ['LRN', 'NAME', 'MATH', 'REMARKS'],
      ['111111111111', 'CRUZ, ANA', 88, 'good'],
      ['111111111111', 'CRUZ, ANA', 90, 'late'],
      ['222222222222', 'REYES 12', 91, 'ok']
    ]))[0];
    const grades = gradeColumnWarnings(grid, 1, [{ col: 2, label: 'Math' }, { col: 3, label: 'Remarks' }]);
    expect(grades).toHaveLength(1);
    expect(grades[0]).toContain('Remarks');
    const learners = learnerColumnWarnings(grid, 1, { name: 1, lrn: 0 });
    expect(learners.some((w) => w.includes('LRN'))).toBe(true);
    expect(learners.some((w) => w.includes('more than once'))).toBe(true);
    expect(learners.some((w) => w.includes('contain numbers'))).toBe(true);
  });

  it('SF9 import keeps reading past a total row and reports it', async () => {
    const { applyMapping } = await import('@/server/import/mapper');
    const grid = readSheets('x.xlsx', workbook([
      ['NAME'], ['A ONE'], ['B TWO'], ['Total'], ['C THREE']
    ]))[0];
    const out = applyMapping(grid, { columns: new Map([[0, 'name']]), first: 1, details: {} }, { subjects: [], months: [], coreValues: [], transferFields: [] });
    expect(out.students.map((s) => s.name)).toEqual(['A ONE', 'B TWO', 'C THREE']);
    expect(out.warnings.some((w) => w.includes('1 total/signature row'))).toBe(true);
  });
});
