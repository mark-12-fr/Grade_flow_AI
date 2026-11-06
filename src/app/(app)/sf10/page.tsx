'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/Providers';
import { Sf10Sheet } from '@/components/Sf10Sheet';
import { downloadSf10 } from '@/lib/pdf/sf10';
import { learnerMeta, sf10Source } from '@/lib/sf10Record';
import { setState, useAppState } from '@/lib/store';
import type { Student } from '@/lib/types';

const slug = (value: string) => value.replace(/[^\x20-\x7E]/g, '?').replace(/\W+/g, '_').replace(/^_+|_+$/g, '') || 'SF10';

export default function Sf10Page() {
  const { toast } = useUi();
  const state = useAppState();
  const source = sf10Source(state);
  const [query, setQuery] = useState('');
  const [strand, setStrand] = useState('');
  const [section, setSection] = useState('');
  const [level, setLevel] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const selectAll = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const metas = useMemo(() => new Map(source.map((s) => [s.id, learnerMeta(s, state)])), [source, state]);
  const options = useMemo(() => {
    const uniq = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const all = [...metas.values()];
    return { strands: uniq(all.map((m) => m.strand)), sections: uniq(all.filter((m) => !strand || m.strand === strand).map((m) => m.section)), levels: uniq(all.flatMap((m) => m.levels)) };
  }, [metas, strand]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => source.filter((s) => {
    const m = metas.get(s.id)!;
    if (strand && m.strand !== strand) return false;
    if (section && m.section !== section) return false;
    if (level && !m.levels.includes(level)) return false;
    return !q || s.name.toLowerCase().includes(q) || s.lrn.toLowerCase().includes(q);
  }), [source, metas, strand, section, level, q]);

  const current = source[Math.min(Math.max(0, state.sf10Index), Math.max(0, source.length - 1))] ?? null;
  const visibleIndex = current ? filtered.findIndex((s) => s.id === current.id) : -1;
  const show = (student: Student | undefined) => { if (student) setState({ sf10Index: source.findIndex((s) => s.id === student.id) }); };

  // When the filters hide the learner on screen, show the first match instead.
  useEffect(() => {
    if (filtered.length && visibleIndex === -1) show(filtered[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, visibleIndex]);

  const pickedSet = new Set(picked);
  const pickedShown = filtered.filter((s) => pickedSet.has(s.id)).length;
  const selectedStudents = source.filter((s) => pickedSet.has(s.id));
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = pickedShown > 0 && pickedShown < filtered.length;
  });
  useEffect(() => { // keep the active row in view when using prev/next
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current?.id]);

  const filtersOn = Boolean(q || strand || section || level);
  const toggle = (id: number, on: boolean) => setPicked((p) => (on ? [...new Set([...p, id])] : p.filter((x) => x !== id)));

  async function download(students: Student[], name: string) {
    if (!students.length) { toast('Choose at least one learner first.', 'error'); return; }
    setBusy(true);
    try { await downloadSf10(students, state, `SF10-${name}.pdf`); toast(`Downloaded ${students.length} SF10 record${students.length === 1 ? '' : 's'} as one PDF.`); }
    catch { toast('PDF support did not load. Reload the page and try again.', 'error'); }
    finally { setBusy(false); }
  }

  const scopeName = slug([strand, section, level && `G${level}`].filter(Boolean).join('-') || 'class');

  return (
    <section className="page active" aria-labelledby="sf10-page-title">
      <div className="page-heading">
        <div>
          <h1 id="sf10-page-title">SF10 permanent record</h1>
          <p>Read from the uploaded SF10 (or built from the class grades). Search by LRN or name, filter, and download one, several or a whole section.</p>
        </div>
        <span className="pill pill-blue">{source.length} learner{source.length === 1 ? '' : 's'}</span>
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
          {filtersOn && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setQuery(''); setStrand(''); setSection(''); setLevel(''); }}>Clear</button>}
        </div>

        <div className="sf10-list-head">
          <label className="sf10-check">
            <input ref={selectAll} type="checkbox" disabled={!filtered.length} checked={filtered.length > 0 && pickedShown === filtered.length}
              aria-label={`Select all ${filtered.length} shown learners`} onChange={(e) => filtered.forEach((s) => toggle(s.id, e.target.checked))} />
            <span>{filtered.length} shown · {picked.length} selected</span>
          </label>
          <div className="student-pager">
            <button type="button" className="icon-btn" aria-label="Previous learner" disabled={visibleIndex <= 0} onClick={() => show(filtered[visibleIndex - 1])}><Icon name="chevron-left" /></button>
            <span>{filtered.length ? `${visibleIndex + 1} of ${filtered.length}` : '0 of 0'}</span>
            <button type="button" className="icon-btn" aria-label="Next learner" disabled={visibleIndex < 0 || visibleIndex >= filtered.length - 1} onClick={() => show(filtered[visibleIndex + 1])}><Icon name="chevron-right" /></button>
          </div>
        </div>

        <div className="sf10-list" ref={listRef} role="listbox" aria-label="Learners">
          {filtered.length === 0
            ? <div className="sf10-list-empty">{source.length ? 'No learners match. Try another LRN, name or filter.' : 'Upload an SF10 or SF9 file first.'}</div>
            : filtered.map((s) => {
              const m = metas.get(s.id)!;
              const active = current?.id === s.id;
              return (
                <div key={s.id} className={`sf10-row${active ? ' active' : ''}${pickedSet.has(s.id) ? ' picked' : ''}`} role="option" aria-selected={active} aria-current={active ? 'true' : undefined}>
                  <input type="checkbox" checked={pickedSet.has(s.id)} aria-label={`Select ${s.name}`} onChange={(e) => toggle(s.id, e.target.checked)} />
                  <button type="button" className="sf10-row-main" onClick={() => show(s)}>
                    <strong>{s.lrn || '—'}</strong>
                    <span>{s.name}</span>
                    <em>{[m.strand, m.section].filter(Boolean).join(' · ')}</em>
                  </button>
                </div>
              );
            })}
        </div>

        <div className="sf10-actions">
          <button type="button" className="btn btn-secondary btn-sm" disabled={!current || busy} onClick={() => current && void download([current], slug(current.lrn || current.name))}>
            <Icon name="download" /> This learner (PDF)
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!picked.length || busy} onClick={() => void download(selectedStudents, 'selected')}>
            <Icon name="download" /> Selected ({picked.length})
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!filtered.length || busy} onClick={() => void download(filtered, scopeName)}>
            <Icon name="download" /> {filtersOn ? `All shown (${filtered.length})` : `Everyone (${filtered.length})`}
          </button>
          {busy && <span className="sf10-busy" role="status">Preparing the PDF...</span>}
        </div>
      </div>

      <article className="card sf10-sheet" aria-label="SF10 record">
        {current && visibleIndex !== -1
          ? <div key={current.id} className="swap-in"><Sf10Sheet student={current} state={state} /></div>
          : <p className="sf10-incomplete">{source.length ? 'No learner to show. Change the search or filters.' : 'Upload an SF10 or SF9 file first.'}</p>}
      </article>
    </section>
  );
}
