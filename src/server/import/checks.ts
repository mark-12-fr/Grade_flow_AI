/**
 * Code-side checks run after the AI has mapped the columns. The model only points at columns; these
 * checks look at the real cells under each mapped column, so a wrong mapping is reported instead of
 * silently producing wrong report cards.
 */
import type { Grid } from '@/server/import/extract';

const text = (row: unknown[], c: number) => (c >= 0 && c < row.length ? String(row[c] ?? '').trim() : '');
const rowsFrom = (grid: Grid, first: number) => grid.rows.slice(first).filter((r) => r.some((c) => String(c).trim() !== ''));

/** Grade columns should hold numbers from 0 to 100; flag columns that mostly do not. */
export function gradeColumnWarnings(grid: Grid, first: number, columns: { col: number; label: string }[]): string[] {
  const rows = rowsFrom(grid, first);
  const out: string[] = [];
  for (const { col, label } of columns) {
    let filled = 0, bad = 0;
    for (const row of rows) {
      const t = text(row, col).replace(/%$/, '');
      if (!t) continue;
      filled += 1;
      const n = Number(t);
      if (Number.isNaN(n) || n < 0 || n > 100) bad += 1;
    }
    if (!filled) out.push(`${label}: the mapped column is empty. Check that the right column was used.`);
    else if (bad / filled > 0.2) out.push(`${label}: ${bad} of ${filled} values are not grades between 0 and 100. The wrong column may have been used.`);
  }
  return out;
}

/** Names should be words, LRNs should be 12 digits and unique. */
export function learnerColumnWarnings(grid: Grid, first: number, cols: { name?: number; lrn?: number }): string[] {
  const rows = rowsFrom(grid, first);
  const out: string[] = [];
  if (cols.name !== undefined && cols.name >= 0) {
    const names = rows.map((r) => text(r, cols.name!)).filter(Boolean);
    const withDigits = names.filter((n) => /\d/.test(n)).length;
    if (names.length && withDigits / names.length > 0.2) out.push(`Many values in the name column contain numbers (${withDigits} of ${names.length}). Check that the right column was used.`);
    const seen = new Map<string, number>();
    names.forEach((n) => seen.set(n.toLowerCase(), (seen.get(n.toLowerCase()) ?? 0) + 1));
    const dup = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    if (dup.length) out.push(`${dup.length} learner name${dup.length === 1 ? ' appears' : 's appear'} more than once (for example ${dup.slice(0, 3).join('; ')}). Check for duplicate rows.`);
  }
  if (cols.lrn !== undefined && cols.lrn >= 0) {
    const lrns = rows.map((r) => text(r, cols.lrn!)).filter(Boolean);
    const seen = new Map<string, number>();
    lrns.forEach((v) => seen.set(v, (seen.get(v) ?? 0) + 1));
    const dup = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    if (dup.length) out.push(`${dup.length} LRN${dup.length === 1 ? ' is' : 's are'} used by more than one row (for example ${dup.slice(0, 3).join(', ')}).`);
  }
  return out;
}

export function listRows(rows: number[]): string {
  return `row${rows.length === 1 ? '' : 's'} ${rows.slice(0, 10).join(', ')}${rows.length > 10 ? ', ...' : ''}`;
}
