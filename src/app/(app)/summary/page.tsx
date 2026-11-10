'use client';

/** Class summary and ranking, with a CSV export. */

import { subjectsFor } from '@/lib/domain/curriculum';
import { computeRanks, remarkFor, semesterAverage } from '@/lib/domain/grading';
import { useAppState } from '@/lib/state/store';
import type { Student } from '@/lib/domain/types';

const failedSubjects = (s: Student) => subjectsFor(s.strand).filter((subject) => remarkFor((s.grades[subject.key] || {}).final) === 'Failed').length;

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; // stop spreadsheet formula injection
  return `"${text.replace(/"/g, '""')}"`;
}

export default function SummaryPage() {
  const state = useAppState();
  const ranks = computeRanks(state.students);
  const rows = state.students.map((student) => {
    const info = ranks.get(student.id)!;
    const failed = failedSubjects(student);
    return { student, rank: info.rank, first: semesterAverage(student, 'first'), second: semesterAverage(student, 'second'), general: info.average, failed,
      status: info.average === null ? 'Incomplete' : failed ? 'Failed' : 'Passed' };
  }).sort((a, b) => {
    if (a.rank === null && b.rank === null) return a.student.name.localeCompare(b.student.name);
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return a.rank - b.rank || a.student.name.localeCompare(b.student.name);
  });
  const ranked = rows.filter((r) => r.general !== null);
  const mean = ranked.length ? (ranked.reduce((sum, r) => sum + (r.general as number), 0) / ranked.length).toFixed(1) : '—';
  const fmt = (v: number | null) => (v === null ? '—' : String(v));
  const count = (status: string) => rows.filter((r) => r.status === status).length;

  function exportCsv() {
    const header = ['Rank', 'LRN', 'Learner', 'Semester 1 average', 'Semester 2 average', 'General average', 'Failed subjects', 'Remarks'];
    const lines = [header, ...rows.map((r) => [r.rank ?? '', r.student.lrn || '', r.student.name, r.first ?? '', r.second ?? '', r.general ?? '', r.failed, r.status])];
    const blob = new Blob([`﻿${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `summary-rank-${String(state.section || 'class').replace(/\W+/g, '_')}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  return (
    <section className="page active" aria-labelledby="summary-title">
      <div className="page-heading">
        <div><h1 id="summary-title">Summary &amp; rank</h1><p>Ranked by general average. Learners with a missing grade are listed but not ranked.</p></div>
        <button type="button" className="btn btn-secondary" onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="stat-grid verify-stats">
        <article className="card stat-card compact"><div className="stat-label"><span>Learners</span></div><strong>{rows.length}</strong></article>
        <article className="card stat-card compact"><div className="stat-label"><span>Class average</span></div><strong>{mean}</strong></article>
        <article className="card stat-card compact"><div className="stat-label"><span>Passed</span></div><strong>{count('Passed')}</strong></article>
        <article className="card stat-card compact"><div className="stat-label"><span>Failed</span></div><strong>{count('Failed')}</strong></article>
        <article className="card stat-card compact"><div className="stat-label"><span>Incomplete</span></div><strong>{count('Incomplete')}</strong></article>
      </div>
      <article className="card">
        <div className="table-scroll"><table className="summary-table">
          <thead><tr><th scope="col">Rank</th><th scope="col">Learner</th><th scope="col">General average</th><th scope="col">Remarks</th><th scope="col">LRN</th><th scope="col">Sem 1</th><th scope="col">Sem 2</th><th scope="col">Failed subjects</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={8}>Upload a class first.</td></tr> : rows.map((r) => (
              <tr key={r.student.id}>
                <td>{r.rank === null ? '—' : r.rank}</td><th scope="row">{r.student.name}</th><td><strong>{fmt(r.general)}</strong></td>
                <td><span className={`pill ${r.status === 'Passed' ? 'pill-green' : r.status === 'Failed' ? 'pill-red' : 'pill-amber'}`}>{r.status}</span></td>
                <td>{r.student.lrn || ''}</td><td>{fmt(r.first)}</td><td>{fmt(r.second)}</td><td>{r.failed || ''}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </article>
    </section>
  );
}
