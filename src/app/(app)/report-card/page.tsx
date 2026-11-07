'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/Providers';
import { ReportCard } from '@/components/ReportCard';
import { downloadReportCards } from '@/lib/pdf/sf9';
import { approvedCount, missingGradeCells, readyToGenerate, reportContext } from '@/lib/grading';
import { setState, useAppState } from '@/lib/store';
import type { Student } from '@/lib/types';

export default function ReportCardPage() {
  const router = useRouter();
  const { toast, openModal } = useUi();
  const state = useAppState();
  const students = state.students;
  const total = students.length;
  const index = total ? Math.min(Math.max(0, state.previewIndex), total - 1) : 0;
  const student = students[index] ?? null;
  const context = useMemo(() => reportContext(state, { generatedAt: state.generatedAt || new Date() }), [state]);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return students.map((s, i) => ({ s, i })).filter(({ s }) =>
      s.name.toLowerCase().includes(q) || String(s.roll).toLowerCase().includes(q) || String(s.lrn || '').toLowerCase().includes(q));
  }, [query, students]);

  const select = (i: number) => { setState({ previewIndex: i }); setQuery(''); setActive(0); };
  const move = (offset: number) => { if (total) setState({ previewIndex: Math.min(Math.max(0, index + offset), total - 1) }); };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input, textarea, select')) return;
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const approved = approvedCount(students);
  const missing = missingGradeCells(students).length;
  const ready = readyToGenerate(students);
  const label = total === 1 ? 'report card' : 'report cards';

  const [busy, setBusy] = useState(false);
  const picked = new Set(state.selectedReportIds);
  const selectedStudents = students.filter((s) => picked.has(s.id));
  const toggle = (id: number, on: boolean) => setState((s) => ({ selectedReportIds: on ? [...new Set([...s.selectedReportIds, id])] : s.selectedReportIds.filter((x) => x !== id) }));

  async function download(list: Student[], single = false) {
    if (!list.length) { toast('Choose at least one learner first.', 'error'); return; }
    setBusy(true);
    try {
      await downloadReportCards(list, context, state, { single });
      toast(single ? `Downloaded ${list[0].name}'s report card as a PDF.` : `Downloaded ${list.length} report card${list.length === 1 ? '' : 's'} as one PDF.`);
    } catch (error) {
      toast(`The PDF could not be prepared. ${(error as Error).message}`, 'error');
    } finally { setBusy(false); }
  }

  function generate() {
    if (!ready) { toast('Finish grade corrections before generating.', 'error'); return; }
    openModal({
      title: `Generate ${total} ${label}?`,
      body: (
        <>
          <p>Each student gets a one-page landscape report card with learner details, attendance, observations, and grades.</p>
          <p><strong>{total} {label} · {total} pages</strong></p>
          <p>The final set will appear in Generated Reports, ready to download or print.</p>
        </>
      ),
      confirmLabel: 'Generate reports', cancelLabel: 'Not yet',
      onConfirm: () => {
        setState((s) => ({ generated: true, generatedAt: new Date(), selectedReportIds: s.students.map((x) => x.id), reportsPage: 1, reportsSearch: '' }));
        router.push('/generated-reports');
        toast(`${total} ${label} generated for ${state.className}.`);
      }
    });
  }

  return (
    <section className="page active" aria-labelledby="report-preview-title">
      <div className="page-heading">
        <div>
          <h1 id="report-preview-title">{total ? 'SF9 report cards' : 'No report cards yet'}</h1>
          <p>Review the report card before creating the final PDF.</p>
        </div>
        <span className={`pill ${approved === total ? 'pill-green' : 'pill-blue'}`}><Icon name="check-circle" /> <span>{approved} of {total} approved</span></span>
      </div>

      <div className="card student-picker">
        <label htmlFor="preview-student-search">Find a student</label>
        <div className="student-search">
          <div className="search-field">
            <Icon name="search" />
            <input
              type="search" id="preview-student-search" placeholder="Search name, LRN or ID number..." autoComplete="off" role="combobox"
              aria-autocomplete="list" aria-expanded={Boolean(query.trim())} aria-controls="preview-student-results" value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  if (matches.length) { e.preventDefault(); setActive((a) => Math.min(matches.length - 1, Math.max(0, a + (e.key === 'ArrowDown' ? 1 : -1)))); }
                } else if (e.key === 'Enter') {
                  const exact = matches.find(({ s }) => s.name.toLowerCase() === query.trim().toLowerCase() || String(s.roll).toLowerCase() === query.trim().toLowerCase());
                  const pick = exact ?? matches[active] ?? (matches.length === 1 ? matches[0] : undefined);
                  if (pick) { e.preventDefault(); select(pick.i); }
                } else if (e.key === 'Escape' && query) { setQuery(''); }
              }}
            />
          </div>
          {query.trim() && (
            <div className="student-search-results" id="preview-student-results" role="listbox" aria-label="Matching students">
              {matches.length === 0
                ? <div className="student-search-empty">No students found. Try a name, LRN or ID number.</div>
                : matches.map(({ s, i }, n) => (
                  <button key={s.id} type="button" className="student-search-result" role="option" tabIndex={-1} aria-selected={n === active} onClick={() => select(i)}>
                    <strong>{s.name}</strong><span>{s.lrn ? `LRN ${s.lrn}` : `ID ${s.roll}`}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
        <label htmlFor="preview-student-select">Or select</label>
        <div className="student-select">
          <div className="select-wrap">
            <select id="preview-student-select" value={index} onChange={(e) => select(Number(e.target.value))}>
              {students.map((s, i) => <option key={s.id} value={i}>{s.lrn || s.name}</option>)}
            </select>
            <Icon name="chevron-down" className="select-chevron" />
          </div>
        </div>
        <div className="student-pager">
          <button type="button" className="icon-btn" aria-label="Previous student" disabled={index <= 0} onClick={() => move(-1)}><Icon name="chevron-left" /></button>
          <span>{total ? `${index + 1} of ${total}` : '0 of 0'}</span>
          <button type="button" className="icon-btn" aria-label="Next student" disabled={index >= total - 1} onClick={() => move(1)}><Icon name="chevron-right" /></button>
        </div>
        <span className="picker-meta"><Icon name="file-text" /> A4 landscape · 1 page per student</span>
      </div>

      <div className="sf10-actions" style={{ marginBottom: 14 }}>
        <label className="sf10-check">
          <input type="checkbox" disabled={!student} checked={Boolean(student && picked.has(student.id))} onChange={(e) => student && toggle(student.id, e.target.checked)} />
          <span>Select this learner</span>
        </label>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!student || busy} onClick={() => student && void download([student], true)}>
          <Icon name="download" /> This learner (PDF)
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!selectedStudents.length || busy} onClick={() => void download(selectedStudents)}>
          <Icon name="download" /> Selected ({selectedStudents.length})
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!total || busy} onClick={() => void download(students)}>
          <Icon name="download" /> Everyone ({total})
        </button>
      </div>

      <div className="preview-canvas">
        <div className="preview-column">
          <div className="preview-label"><strong>Report card</strong><span>Learning progress and achievement</span><span>1 page</span></div>
          <article className="report-sheet report-front" aria-label="Report card">
            {student
              ? <div key={student.id} className="swap-in"><ReportCard student={student} context={context} school={state.school} /></div>
              : <p className="sf10-incomplete" role="status">No learners yet. Upload an SF9 file first.</p>}
          </article>
        </div>
      </div>
      <p className="preview-hint"><Icon name="info" /> This preview is live. Changes you make during verification appear here immediately.</p>

      <div className="page-actions">
        <Link className="btn btn-secondary" href="/verification"><Icon name="arrow-left" /> Back to verification</Link>
        <div className="action-end">
          <span className="action-note">{ready ? `${total} students · ${total} pages` : `${missing ? `${missing} grade${missing === 1 ? '' : 's'} missing` : ''} · Preview only`}</span>
          <button type="button" className="btn btn-primary" disabled={!ready} title={ready ? 'Create the final PDF-ready report set' : 'Finish verification before generating reports'} onClick={generate}>
            {state.generated ? 'Regenerate' : 'Generate'} {total} report{total === 1 ? '' : 's'} <Icon name="arrow-right" />
          </button>
        </div>
      </div>
    </section>
  );
}
