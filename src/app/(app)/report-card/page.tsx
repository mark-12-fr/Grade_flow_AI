'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useUi } from '@/components/layout/Providers';
import { PdfPreview } from '@/components/report/PdfPreview';
import { Sf9Editor } from '@/components/report/Sf9Editor';
import { downloadReportCards, printReportCards } from '@/lib/pdf/sf9';
import { approvedCount, missingGradeCells, readyToGenerate, reportContext } from '@/lib/domain/grading';
import { applySf9Details, emptySf9Details, sf9Issues, TRANSFER_DETAILS, type Sf9Details } from '@/lib/sf9/quality';
import { applyObservedValues, askObservedValues } from '@/lib/sf9/observed';
import { learnerMeta } from '@/lib/sf10/record';
import { getState, setState, useAppState } from '@/lib/state/store';
import type { Student } from '@/lib/domain/types';

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
  const previewRef = useRef<HTMLDivElement>(null);

  const metas = useMemo(() => new Map(students.map((s) => [s.id, learnerMeta(s, state)])), [students, state]);
  const issuesBy = useMemo(() => new Map(students.map((s) => [s.id, sf9Issues(s, state)])), [students, state]);
  const [details, setDetails] = useState<Sf9Details>(emptySf9Details);
  const [scope, setScope] = useState<'one' | 'shown' | 'all'>('shown');
  const [overwrite, setOverwrite] = useState(false);
  const [deciding, setDeciding] = useState<{ done: number; total: number } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const options = useMemo(() => {
    const uniq = (values: string[]) => [...new Set(values.filter(Boolean))].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
    const all = [...metas.values()];
    return { strands: uniq(all.map((m) => m.strand)), sections: uniq(all.filter((m) => !strand || m.strand === strand).map((m) => m.section)), levels: uniq(all.flatMap((m) => m.levels)) };
  }, [metas, strand]);
  const needCheck = students.filter((s) => (issuesBy.get(s.id) ?? []).length > 0).length;
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => students.filter((s) => {
    const m = metas.get(s.id)!;
    if (strand && m.strand !== strand) return false;
    if (section && m.section !== section) return false;
    if (level && !m.levels.includes(level)) return false;
    const count = (issuesBy.get(s.id) ?? []).length;
    if (quality === 'check' && !count) return false;
    if (quality === 'complete' && count) return false;
    return !q || s.name.toLowerCase().includes(q) || String(s.lrn || '').toLowerCase().includes(q) || String(s.roll).toLowerCase().includes(q);
  }), [students, metas, strand, section, level, q, quality, issuesBy]);
  const filtersOn = Boolean(q || strand || section || level || quality !== 'all');
  const visibleIndex = student ? filtered.findIndex((s) => s.id === student.id) : -1;
  const show = (st: Student | undefined) => { if (st) setState({ previewIndex: students.findIndex((x) => x.id === st.id) }); };
  // Tapping a learner in the list shows that report card and scrolls down to it.
  const open = (st: Student) => {
    show(st);
    window.setTimeout(() => previewRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 60);
  };
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
  // One learner by default; when learners are checked in the list (or Select all is ticked), the buttons apply to all of them.
  const target = selectedStudents.length ? selectedStudents : student ? [student] : [];
  const pickedShown = filtered.filter((s) => picked.has(s.id)).length;
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = pickedShown > 0 && pickedShown < filtered.length; });
  const toggle = (id: number, on: boolean) => setState((s) => ({ selectedReportIds: on ? [...new Set([...s.selectedReportIds, id])] : s.selectedReportIds.filter((x) => x !== id) }));

  // The real count only moves after each group of 50, so the bar creeps forward in between to keep it moving.
  const [creep, setCreep] = useState(0);
  useEffect(() => {
    setCreep(0);
    if (!deciding) return;
    const timer = window.setInterval(() => setCreep((c) => Math.min(c + 2, 45)), 500);
    return () => window.clearInterval(timer);
  }, [deciding?.done, deciding === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const percent = deciding ? Math.min(99, Math.round((Math.min(deciding.total, deciding.done + creep) / deciding.total) * 100)) : 0;
  const decideCount = (scope === 'one' ? (student ? 1 : 0) : scope === 'shown' ? filtered.length : total);
  async function decideValues() {
    const ids = new Set((scope === 'one' ? (student ? [student] : []) : scope === 'shown' ? filtered : students).map((x) => x.id));
    const list = state.students.filter((s) => ids.has(s.id));
    if (!list.length) return;
    setDeciding({ done: 0, total: list.length });
    try {
      const { values, error } = await askObservedValues(list, (done, all) => setDeciding({ done, total: all }));
      // Read the state again: the teacher may have kept editing while the AI worked.
      const result = applyObservedValues(getState().students, values, overwrite);
      setState({ students: result.students });
      const asked = list.length;
      if (error) toast(`The AI filled ${result.changed} of ${asked} learners, then stopped. ${error.message} Press the button again to finish the rest.`, result.changed ? 'info' : 'error');
      else toast(result.changed ? `The AI filled the observed values of ${result.changed} learner${result.changed === 1 ? '' : 's'}. Please review them in Edit back.` : 'Nothing to change. The observed values are already filled in (turn on "Replace values already filled in").', result.changed ? 'success' : 'info');
    } catch (error) {
      toast(`The AI could not decide the observed values. ${(error as Error).message}`, 'error');
    } finally { setDeciding(null); }
  }

  async function download(list: Student[], single = false) {
    if (!list.length) { toast('Choose at least one learner first.', 'error'); return; }
    setBusy(true);
    try {
      await downloadReportCards(list, context, state, { single });
      toast(single ? `Downloaded ${list[0].name}'s report card as a PDF.` : `Downloaded ${list.length} report cards as a ZIP: one folder per strand, one PDF per section.`);
    } catch (error) {
      toast(`The PDF could not be prepared. ${(error as Error).message}`, 'error');
    } finally { setBusy(false); }
  }

  async function print(list: Student[]) {
    if (!list.length) return;
    setBusy(true);
    try {
      await printReportCards(list, context, state);
      toast(`Opening the print dialog for ${list.length} report card${list.length === 1 ? '' : 's'} (A4, both sides).`, 'info');
    } catch (error) {
      toast(`Printing could not start. ${(error as Error).message}`, 'error');
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
        <div><h1 id="report-preview-title">SF9 report card</h1></div>
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
              const list = issuesBy.get(s.id) ?? [];
              const count = list.length;
              return (
                <div key={s.id} className={`sf10-row${active ? ' active' : ''}${picked.has(s.id) ? ' picked' : ''}`} role="option" aria-selected={active} aria-current={active ? 'true' : undefined}>
                  <input type="checkbox" checked={picked.has(s.id)} aria-label={`Select ${s.name}`} onChange={(e) => toggle(s.id, e.target.checked)} />
                  <button type="button" className="sf10-row-main" onClick={() => open(s)}>
                    <strong>{s.lrn || s.roll || '—'}</strong>
                    <span>{s.name}</span>
                    <em>{[m.strand, m.section].filter(Boolean).join(' · ')}</em>
                  </button>
                  <span className={`sf10-quality ${count ? 'check' : 'ok'}`} title={count ? list.map((i) => i.text).join('\n') : 'Complete'}>
                    <i aria-hidden="true" />{count ? `${count} to check` : 'Complete'}
                  </span>
                </div>
              );
            })}
        </div>

        <div className="sf10-actions">
          <span className="sf10-target">{target.length > 1 ? `${target.length} learners checked` : target.length === 1 ? (selectedStudents.length ? '1 learner checked' : student?.name) : ''}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!target.length || busy} onClick={() => void download(target, target.length === 1)}>
            <Icon name="download" /> {target.length > 1 ? `Download ZIP by strand (${target.length})` : 'Download PDF'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!target.length || busy} onClick={() => void print(target)}>
            <Icon name="printer" /> Print{target.length > 1 ? ` (${target.length})` : ''}
          </button>
        </div>
      </div>

      <details className="card sf10-edit" open={editOpen} onToggle={(e) => setEditOpen((e.target as HTMLDetailsElement).open)}>
        <summary><strong>Fill in missing details</strong> <span>School year, principal, adviser and certificate of transfer, for one learner or many at once</span></summary>
        {!total ? <p className="muted">This is available after you upload an SF9 file.</p> : (
          <div className="sf10-edit-body">
            <div className="sf10-edit-grid">
              {([
                ['year', 'School year, e.g. 2025-2026 (everyone)'], ['principal', 'Principal (everyone)'], ['adviser', 'Adviser']
              ] as [Exclude<keyof Sf9Details, 'transfer'>, string][]).map(([key, label]) => (
                <label key={key} className="sf10-field">
                  <span>{label}</span>
                  <input type="text" value={details[key]} placeholder={key === 'year' ? state.year : key === 'principal' ? state.school.principal : ''}
                    onChange={(e) => setDetails({ ...details, [key]: e.target.value })} />
                </label>
              ))}
              {TRANSFER_DETAILS.map(([key, label]) => (
                <label key={key} className="sf10-field">
                  <span>{label}</span>
                  <input type="text" value={details.transfer[key] ?? ''} onChange={(e) => setDetails({ ...details, transfer: { ...details.transfer, [key]: e.target.value } })} />
                </label>
              ))}
            </div>
            <div className="sf10-edit-actions">
              <div className="select-wrap select-wrap-sm">
                <select aria-label="Apply to" value={scope} onChange={(e) => setScope(e.target.value as 'one' | 'shown' | 'all')}>
                  <option value="one">This learner</option>
                  <option value="shown">All shown ({filtered.length})</option>
                  <option value="all">Everyone ({total})</option>
                </select>
                <Icon name="chevron-down" className="select-chevron" />
              </div>
              <label className="sf10-check"><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /><span>Replace values already filled in</span></label>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => {
                const ids = new Set((scope === 'one' ? (student ? [student] : []) : scope === 'shown' ? filtered : students).map((x) => x.id));
                const result = applySf9Details(state.students, ids, details, overwrite);
                const school = { ...state.school, principal: details.principal.trim() || state.school.principal };
                const globalChange = Boolean(details.year.trim() || details.principal.trim());
                setState({ students: result.students, school, year: details.year.trim() || state.year });
                toast(result.changed || globalChange ? `Updated ${result.changed} learner${result.changed === 1 ? '' : 's'}${globalChange ? ' and the school details' : ''}.` : 'Nothing to change. The fields were empty, or already filled in (turn on "Replace values already filled in").', result.changed || globalChange ? 'success' : 'info');
              }}>Apply</button>
              <button type="button" className={`btn btn-secondary btn-sm btn-ai${deciding ? ' working' : ''}`} disabled={Boolean(deciding) || !decideCount} aria-busy={Boolean(deciding)} style={deciding ? ({ '--ai-progress': `${percent}%` } as React.CSSProperties) : undefined} onClick={() => void decideValues()}
                title="The AI drafts the observed values (AO, SO, RO, NO) from each learner's grades. Attendance is not changed.">
                <Icon name="sparkles" className="ai-sparkle" />
                {deciding ? <span>The AI is deciding · <strong className="ai-percent">{percent}%</strong>{deciding.total > 1 ? ` (${deciding.done} of ${deciding.total})` : ''}</span> : `Decide observed values with AI (${decideCount})`}
              </button>
            </div>
          </div>
        )}
      </details>

      {student && (issuesBy.get(student.id) ?? []).length > 0 && (
        <div className="sf10-issues" role="status">
          <Icon name="alert-triangle" />
          <div><strong>Needs checking</strong><ul>{(issuesBy.get(student.id) ?? []).map((i) => <li key={i.text}>{i.text}</li>)}</ul></div>
          {(issuesBy.get(student.id) ?? []).some((i) => i.kind !== 'grade') && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditOpen(true)}>Fill in details</button>}
          {(issuesBy.get(student.id) ?? []).some((i) => i.kind === 'grade') && <Link className="btn btn-secondary btn-sm" href="/verification">Fix grades</Link>}
        </div>
      )}

      <div className="preview-canvas" ref={previewRef} style={{ scrollMarginTop: 'calc(var(--header-height, 60px) + 12px)' }}>
        <div className="preview-column">
          <div className="preview-tabs" role="group" aria-label="Report card side">
            <button type="button" className={`btn btn-sm ${side === 'front' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={side === 'front'} onClick={() => setSide('front')}>Front Preview</button>
            <button type="button" className={`btn btn-sm ${side === 'back' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={side === 'back'} onClick={() => setSide('back')}>Back Preview</button>
          </div>
          <div className="preview-label"><strong>{side === 'front' ? 'Front' : 'Back'}</strong><span>{side === 'front' ? 'Grades and learning progress' : 'Learner details, transfer, attendance and observed values'}</span><span>A4 portrait · page {side === 'front' ? 1 : 2} of 2</span></div>
          {student
            ? (
              <PdfPreview student={student} context={context} state={state} side={side} />
            )
            : <p className="sf10-incomplete" role="status">No learners yet. Upload an SF9 file first.</p>}
        </div>
      </div>
      {student && (
        <details className="card sf10-edit" open>
          <summary><strong>Edit {side === 'front' ? 'front' : 'back'}</strong> <span>{side === 'front' ? 'Learner details and grades' : 'Attendance and observed values'} for {student.name}. The preview updates as you type.</span></summary>
          <Sf9Editor key={`${student.id}-${side}`} student={student} state={state} side={side} />
        </details>
      )}
      <p className="preview-hint"><Icon name="info" /> This preview is the real PDF (A4, front and back). In the print dialog choose Actual size (100%) and two-sided (flip on long edge).</p>

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
