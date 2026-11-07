'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/Providers';
import { ReportCard } from '@/components/ReportCard';
import { downloadReportCards } from '@/lib/pdf/sf9';
import { approvedCount, missingGradeCells, readyToGenerate, reportContext } from '@/lib/grading';
import { learnerMeta } from '@/lib/sf10Record';
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
  const [strand, setStrand] = useState('');
  const [section, setSection] = useState('');
  const [level, setLevel] = useState('');
  const [quality, setQuality] = useState<'all' | 'check' | 'complete'>('all');
  const listRef = useRef<HTMLDivElement>(null);
  const selectAll = useRef<HTMLInputElement>(null);

  const metas = useMemo(() => new Map(students.map((s) => [s.id, learnerMeta(s, state)])), [students, state]);
  const missingBy = useMemo(() => {
    const map = new Map<number, number>();
    missingGradeCells(students).forEach(({ student: st }) => map.set(st.id, (map.get(st.id) ?? 0) + 1));
    return map;
  }, [students]);
  const options = useMemo(() => {
    const uniq = (values: string[]) => [...new Set(values.filter(Boolean))].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
    const all = [...metas.values()];
    return { strands: uniq(all.map((m) => m.strand)), sections: uniq(all.filter((m) => !strand || m.strand === strand).map((m) => m.section)), levels: uniq(all.flatMap((m) => m.levels)) };
  }, [metas, strand]);
  const needCheck = students.filter((s) => missingBy.has(s.id)).length;
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => students.filter((s) => {
    const m = metas.get(s.id)!;
    if (strand && m.strand !== strand) return false;
    if (section && m.section !== section) return false;
    if (level && !m.levels.includes(level)) return false;
    const count = missingBy.get(s.id) ?? 0;
    if (quality === 'check' && !count) return false;
    if (quality === 'complete' && count) return false;
    return !q || s.name.toLowerCase().includes(q) || String(s.lrn || '').toLowerCase().includes(q) || String(s.roll).toLowerCase().includes(q);
  }), [students, metas, strand, section, level, q, quality, missingBy]);
  const filtersOn = Boolean(q || strand || section || level || quality !== 'all');
  const visibleIndex = student ? filtered.findIndex((s) => s.id === student.id) : -1;
  const show = (st: Student | undefined) => { if (st) setState({ previewIndex: students.findIndex((x) => x.id === st.id) }); };
  const move = (offset: number) => show(filtered[Math.min(Math.max(0, visibleIndex + offset), filtered.length - 1)]);

  // When the filters hide the learner on screen, show the first match instead.
  useEffect(() => {
    if (filtered.length && visibleIndex === -1) show(filtered[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, visibleIndex]);
  useEffect(() => { listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' }); }, [student?.id]);

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
  const pickedShown = filtered.filter((s) => picked.has(s.id)).length;
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = pickedShown > 0 && pickedShown < filtered.length; });
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

      <div className="card sf10-browser">
        <div className="sf10-filters">
          <div className="search-field sf10-search">
            <Icon name="search" />
            <input type="search" placeholder="Search LRN or name..." aria-label="Search learners by LRN or name" value={query} autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && filtered.length) { e.preventDefault(); show(filtered[0]); } }} />
          </div>
          {[
            { label: 'Strand', value: strand, set: (v: string) => { setStrand(v); setSection(''); }, items: options.strands },
            { label: 'Section', value: section, set: setSection, items: options.sections },
            { label: 'Grade level', value: level, set: setLevel, items: options.levels }
          ].map((f) => (
            <div className="select-wrap select-wrap-sm" key={f.label}>
              <select aria-label={`Filter by ${f.label.toLowerCase()}`} value={f.value} disabled={!f.items.length} onChange={(e) => f.set(e.target.value)}>
                <option value="">{f.label === 'Grade level' ? 'All grade levels' : `All ${f.label.toLowerCase()}s`}</option>
                {f.items.map((it) => <option key={it} value={it}>{f.label === 'Grade level' ? `Grade ${it}` : it}</option>)}
              </select>
              <Icon name="chevron-down" className="select-chevron" />
            </div>
          ))}
          <div className="select-wrap select-wrap-sm">
            <select aria-label="Filter by grade check" value={quality} onChange={(e) => setQuality(e.target.value as 'all' | 'check' | 'complete')}>
              <option value="all">All records</option>
              <option value="check">Needs checking ({needCheck})</option>
              <option value="complete">Complete ({total - needCheck})</option>
            </select>
            <Icon name="chevron-down" className="select-chevron" />
          </div>
          {filtersOn && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setQuery(''); setStrand(''); setSection(''); setLevel(''); setQuality('all'); }}>Clear</button>}
        </div>

        <div className="sf10-list-head">
          <label className="sf10-check">
            <input ref={selectAll} type="checkbox" disabled={!filtered.length} checked={filtered.length > 0 && pickedShown === filtered.length}
              aria-label={`Select all ${filtered.length} shown learners`} onChange={(e) => filtered.forEach((s) => toggle(s.id, e.target.checked))} />
            <span>{filtered.length} shown · {selectedStudents.length} selected</span>
          </label>
          <div className="student-pager">
            <button type="button" className="icon-btn" aria-label="Previous learner" disabled={visibleIndex <= 0} onClick={() => move(-1)}><Icon name="chevron-left" /></button>
            <span>{filtered.length ? `${visibleIndex + 1} of ${filtered.length}` : '0 of 0'}</span>
            <button type="button" className="icon-btn" aria-label="Next learner" disabled={visibleIndex < 0 || visibleIndex >= filtered.length - 1} onClick={() => move(1)}><Icon name="chevron-right" /></button>
          </div>
        </div>

        <div className="sf10-list" ref={listRef} role="listbox" aria-label="Learners">
          {filtered.length === 0
            ? <div className="sf10-list-empty">{total ? 'No learners match. Try another LRN, name or filter.' : 'Upload an SF9 file first.'}</div>
            : filtered.map((s) => {
              const m = metas.get(s.id)!;
              const active = student?.id === s.id;
              const count = missingBy.get(s.id) ?? 0;
              return (
                <div key={s.id} className={`sf10-row${active ? ' active' : ''}${picked.has(s.id) ? ' picked' : ''}`} role="option" aria-selected={active} aria-current={active ? 'true' : undefined}>
                  <input type="checkbox" checked={picked.has(s.id)} aria-label={`Select ${s.name}`} onChange={(e) => toggle(s.id, e.target.checked)} />
                  <button type="button" className="sf10-row-main" onClick={() => show(s)}>
                    <strong>{s.lrn || s.roll || '—'}</strong>
                    <span>{s.name}</span>
                    <em>{[m.strand, m.section].filter(Boolean).join(' · ')}</em>
                  </button>
                  <span className={`sf10-quality ${count ? 'check' : 'ok'}`} title={count ? `${count} grade${count === 1 ? '' : 's'} missing` : 'Complete'}>
                    <i aria-hidden="true" />{count ? `${count} to check` : 'Complete'}
                  </span>
                </div>
              );
            })}
        </div>

        <div className="sf10-actions">
          <button type="button" className="btn btn-secondary btn-sm" disabled={!student || busy} onClick={() => student && void download([student], true)}>
            <Icon name="download" /> This learner (PDF)
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!selectedStudents.length || busy} onClick={() => void download(selectedStudents)}>
            <Icon name="download" /> Selected ({selectedStudents.length})
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!filtered.length || busy} onClick={() => void download(filtered)}>
            <Icon name="download" /> {filtersOn ? `All shown (${filtered.length})` : `Everyone (${filtered.length})`}
          </button>
        </div>
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
