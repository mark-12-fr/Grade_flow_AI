import { CORE_VALUE_KEYS, PASSING_GRADE, subjectsFor } from '@/lib/domain/curriculum';
import type { Student } from '@/lib/domain/types';

type Quarter = 'q1' | 'q2' | 'q3' | 'q4';
const QUARTERS: Quarter[] = ['q1', 'q2', 'q3', 'q4'];
const num = (v: unknown) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** The grade picture the AI is given: quarter averages and the number of failed subjects. No name or LRN leaves the browser. */
export function gradeSummary(student: Student) {
  const subjects = subjectsFor(student.strand);
  const quarterAverage = Object.fromEntries(QUARTERS.map((q) => {
    const values = subjects.map((s) => num(student.grades[s.key]?.[q])).filter((v): v is number => v !== null);
    return [q, values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null];
  }));
  const failing = subjects.filter((s) => { const v = num(student.grades[s.key]?.final); return v !== null && v < PASSING_GRADE; }).length;
  return { id: student.id, quarterAverage, failing };
}

/** Puts the AI's ratings into the learners. Only blank ratings are filled unless `overwrite` is set. */
export function applyObservedValues(students: Student[], decided: Record<string, Record<string, Record<string, string>>>, overwrite: boolean): { students: Student[]; changed: number } {
  let changed = 0;
  const out = students.map((student) => {
    const values = decided[String(student.id)];
    if (!values) return student;
    const next: Student['observedValues'] = { ...student.observedValues };
    let touched = false;
    CORE_VALUE_KEYS.forEach((key) => {
      const row = { ...(student.observedValues?.[key] ?? {}) };
      QUARTERS.forEach((q) => {
        if ((overwrite || !String(row[q] ?? '').trim()) && values[key]?.[q] && row[q] !== values[key][q]) { row[q] = values[key][q]; touched = true; }
      });
      next[key] = row;
    });
    if (!touched) return student;
    changed += 1;
    return { ...student, observedValues: next };
  });
  return { students: out, changed };
}

/** Asks the server (and so the AI) for a draft of the observed values. If the server wants an access code, asks once and retries. */
export async function askObservedValues(students: Student[]): Promise<Record<string, Record<string, Record<string, string>>>> {
  const body = JSON.stringify({ learners: students.map(gradeSummary) });
  const send = () => fetch('/api/observed-values', {
    method: 'POST', body,
    headers: { 'Content-Type': 'application/json', ...(window.sessionStorage.getItem('gf-access-code') ? { 'X-Access-Code': window.sessionStorage.getItem('gf-access-code')! } : {}) }
  });
  let res = await send();
  if (res.status === 401) {
    const entered = window.prompt('Enter the access code to use the AI:');
    if (entered) {
      window.sessionStorage.setItem('gf-access-code', entered);
      res = await send();
      if (res.status === 401) window.sessionStorage.removeItem('gf-access-code');
    }
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = ((await res.json()) as { detail?: string }).detail || detail; } catch { /* not JSON */ }
    throw new Error(detail);
  }
  return ((await res.json()) as { values: Record<string, Record<string, Record<string, string>>> }).values;
}
