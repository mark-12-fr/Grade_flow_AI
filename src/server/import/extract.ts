/** BACKEND: reads CSV/Excel files into a grid of cells and pulls out the school logo. */
import { unzipSync } from 'fflate';
import XLSX from '@/vendor/xlsx.cjs';

export const MAX_ROWS = 20000; // safety cap only; a school workbook can list 1000+ learners
export const MAX_COLS = 1000; // safety cap only; grade sheets can run past column IN

export class ExtractError extends Error {}

export interface Grid { rows: unknown[][]; sheet: string; skippedSheets: string[] }

function clean(value: unknown): unknown {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') return value.trim();
  return value;
}

const has = (c: unknown) => String(c).trim() !== '';

function trim(rows: unknown[][]): unknown[][] {
  const cleaned = rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map(clean)).filter((r) => r.some(has));
  const width = cleaned.reduce((w, r) => {
    let last = -1;
    r.forEach((c, i) => { if (has(c)) last = i; });
    return Math.max(w, last + 1);
  }, 0);
  return cleaned.map((r) => (r.length < width ? [...r, ...Array(width - r.length).fill('')] : r.slice(0, width)));
}

const nonEmpty = (rows: unknown[][]) => rows.reduce((n, r) => n + r.filter(has).length, 0);

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const extOf = (filename: string) => (filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '');

function workbookSheets(buffer: Buffer): Grid[] {
  let wb: ReturnType<typeof XLSX.read>;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, dense: false });
  } catch (error) {
    throw new ExtractError(`Could not open the Excel file: ${(error as Error).message}`);
  }
  return wb.SheetNames.map((name: string) => ({
    rows: trim(XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' }) as unknown[][]),
    sheet: name, skippedSheets: []
  }));
}

export function readSheets(filename: string, data: Buffer, limit = 1000): Grid[] {
  const ext = extOf(filename);
  let grids: Grid[];
  if (ext === 'csv') {
    grids = [{ rows: trim(parseCsv(data.toString('utf-8').replace(/^﻿/, ''))), sheet: 'csv', skippedSheets: [] }];
  } else if (ext === 'xlsx' || ext === 'xls') {
    grids = workbookSheets(data);
  } else {
    throw new ExtractError('Unsupported file type. Use .xlsx, .xls or .csv.');
  }
  grids = grids.filter((g) => g.rows.length);
  if (!grids.length) throw new ExtractError('The file is empty.');
  return grids.slice(0, limit);
}

/** The sheet with the most content, like the original single-sheet reader. */
export function readGrid(filename: string, data: Buffer): Grid {
  const all = readSheets(filename, data);
  const primary = all.reduce((best, g) => (nonEmpty(g.rows) > nonEmpty(best.rows) ? g : best), all[0]);
  return { ...primary, skippedSheets: all.filter((g) => g !== primary).map((g) => g.sheet) };
}

/**
 * A school-wide master list (many subjects x Q1/Q2/FINAL across strands and grade levels) is not one class's gradebook.
 * Returns the number of FINAL columns when the sheet looks like one, else 0.
 */
export function masterListSize(grid: Grid): number {
  const finals = grid.rows.slice(0, 8).reduce((n, row) => n + row.filter((c) => String(c).trim().toLowerCase() === 'final').length, 0);
  return finals > 30 ? finals : 0;
}

export function colLetter(index: number): string {
  let out = '', n = index + 1;
  while (n) { const rem = (n - 1) % 26; out = String.fromCharCode(65 + rem) + out; n = Math.floor((n - 1) / 26); }
  return out;
}

/** Top rows as a tab-separated table with row/column indexes the model can cite. */
export function previewText(grid: Grid, limit = 15): string {
  const width = grid.rows.length ? grid.rows[0].length : 0;
  const lines = ['row\\col\t' + Array.from({ length: width }, (_, i) => `${i}(${colLetter(i)})`).join('\t')];
  grid.rows.slice(0, limit).forEach((row, r) => {
    lines.push(`${r}\t` + row.map((c) => String(c).replace(/[\t\n]/g, ' ').slice(0, 60)).join('\t'));
  });
  return lines.join('\n');
}

/** Whole sheet as compact text: one line per row with 'colLetter=value' for non-empty cells. */
export function fullText(grid: Grid): string {
  const lines: string[] = [];
  grid.rows.forEach((row, r) => {
    const cells = row.map((c, i) => (has(c) ? `${colLetter(i)}=${String(c).replace(/\n/g, ' ').trim().slice(0, 90)}` : '')).filter(Boolean);
    if (cells.length) lines.push(`${r + 1}: ${cells.join(' | ')}`);
  });
  return lines.join('\n');
}

/** First picture embedded in an .xlsx (usually the school logo) as a data URL, or ''. */
export function extractLogo(filename: string, data: Buffer, maxBytes = 400_000): string {
  if (extOf(filename) !== 'xlsx') return '';
  try {
    const files = unzipSync(new Uint8Array(data), { filter: (f) => f.name.startsWith('xl/media/') });
    const name = Object.keys(files).sort().find((n) => /\.(png|jpe?g|gif)$/i.test(n));
    if (!name || files[name].length > maxBytes) return '';
    const ext = name.split('.').pop()!.toLowerCase();
    return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${Buffer.from(files[name]).toString('base64')}`;
  } catch {
    return '';
  }
}
