import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import XLSX from '@/vendor/xlsx.cjs';
import { readGrid, readSheets, parseCsv } from '@/server/extract';
import { cleanField, MappingError, runImport, type ImportSchema } from '@/server/mapper';
import { runImportSf10 } from '@/server/sf10';
import { limiter, limits, guard, HttpError } from '@/server/guard';
import { parseJson, callAi, AiError } from '@/server/llm';
import { SUBJECTS, ATTENDANCE_MONTHS, CORE_VALUE_KEYS, TRANSFER_FIELDS } from '@/lib/curriculum';

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
    const file = 'samples/messy_class.xlsx';
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
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.AI_API_KEY; delete process.env.AI_PROVIDER; });
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
});
