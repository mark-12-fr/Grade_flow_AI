'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/Providers';
import { ReportCard } from '@/components/ReportCard';
import { prettyYear } from '@/lib/format';
import { averageLabel, reportContext } from '@/lib/grading';
import { downloadReportCards } from '@/lib/pdf/sf9';
import { setState, useAppState } from '@/lib/store';
import type { AppState, Student } from '@/lib/types';

const PAGE_SIZE = 6;

function printHeight(state: AppState) {
  const landscape = state.orientation === 'landscape';
  return state.paperSize === 'letter' ? (landscape ? 214 : 278) : (landscape ? 208 : 296);
}

export default function GeneratedReportsPage() {
  const { toast } = useUi();
  const state = useAppState();
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [printing, setPrinting] = useState<Student[] | null>(null);
  const selectAll = useRef<HTMLInputElement>(null);

  const reports = state.students;
  const context = reportContext(state, { generatedAt: state.generatedAt || new Date() });
  const search = state.reportsSearch.trim().toLowerCase();
  const filtered = search ? reports.filter((s) => s.name.toLowerCase().includes(search) || String(s.roll).toLowerCase().includes(search)) : reports;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, state.reportsPage), totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  const selectedIds = new Set(state.selectedReportIds);
  const selectedReports = reports.filter((s) => selectedIds.has(s.id));
  const inScope = scope === 'selected' ? selectedReports : reports;
  const count = reports.length;
  const label = count === 1 ? 'report card' : 'report cards';
  const checkedInFilter = filtered.filter((s) => selectedIds.has(s.id)).length;

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = checkedInFilter > 0 && checkedInFilter < filtered.length;
  });

  // Print through a print-only area so the app interface never reaches paper.
  useEffect(() => {
    if (!printing) return;
    const after = () => setPrinting(null);
    window.addEventListener('afterprint', after, { once: true });
    const timer = window.setTimeout(() => window.print(), 60);
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', after); };
  }, [printing]);

  const toggle = (id: number, on: boolean) => setState((s) => ({ selectedReportIds: on ? [...new Set([...s.selectedReportIds, id])] : s.selectedReportIds.filter((x) => x !== id) }));

  async function download(list: Student[], single = false) {
    if (!list.length) { toast('Choose at least one report first.', 'error'); return; }
    try {
      await downloadReportCards(list, context, state, { single });
      toast(single ? `Downloaded ${list[0].name}'s report as a PDF.` : `Downloaded ${list.length} report card${list.length === 1 ? '' : 's'} as one PDF.`);
    } catch (error) {
      toast(`The PDF could not be prepared. ${(error as Error).message}`, 'error');
    }
  }

  function print(list: Student[]) {
    if (!list.length) { toast('Choose at least one report to print.', 'error'); return; }
    toast(`Opening the print dialog for ${list.length} report${list.length === 1 ? '' : 's'}.`, 'info');
    setPrinting(list);
  }

  if (!state.generated) {
    return (
      <section className="page active" aria-labelledby="generated-title">
        <div className="page-heading">
          <div><h1 id="generated-title">Generated reports</h1><p>Generate the report cards first. They will appear here, ready to download or print.</p></div>
          <span className="pill pill-blue">Final step · Print</span>
        </div>
        <div className="info-strip"><Icon name="info" /><div><strong>No reports generated yet</strong><p>Upload a class, check the SF9 preview, then choose Generate.</p></div></div>
        <div className="page-actions"><Link className="btn btn-primary" href={state.students.length ? '/report-card' : '/upload'}>{state.students.length ? 'Go to preview' : 'Go to upload'}</Link></div>
      </section>
    );
  }

  const sheets = state.printLayout === 'single' ? Math.ceil(inScope.length / 2) : inScope.length;
  const printLabel = scope === 'selected' ? `Print selected ${inScope.length} report${inScope.length === 1 ? '' : 's'}` : `Print all ${inScope.length} report${inScope.length === 1 ? '' : 's'}`;

  return (
    <section className="page active" aria-labelledby="generated-title">
      <div className="page-heading">
        <div><h1 id="generated-title">Generated reports</h1><p>The hard part is done. Your class reports are ready to download and print.</p></div>
        <span className="pill pill-blue">Final step · Print</span>
      </div>

      <section className="report-summary-banner">
        <span className="summary-icon"><Icon name="check" /></span>
        <div className="summary-copy">
          <h2>{count} {label}. Ready for proud moments.</h2>
          <p>{context.className} · {context.term} · {prettyYear(context.year)}</p>
          <span>Generated just now · Reviewed by {context.teacher}</span>
        </div>
        <button type="button" className="btn btn-white" disabled={count === 0} title={count ? `Download all ${count} report${count === 1 ? '' : 's'} as one PDF` : 'No reports available'} onClick={() => void download(reports)}>
          <Icon name="download" /> Download all as PDF
        </button>
      </section>

      <div className="reports-layout">
        <div className="reports-main">
          <article className="card reports-card">
            <div className="reports-card-head">
              <h2>Student reports</h2>
              <span className="pill pill-green"><Icon name="check" /> <span>{count}</span> ready to print</span>
            </div>
            <div className="reports-toolbar">
              <div className="search-field">
                <Icon name="search" />
                <input type="search" placeholder="Find a student's report..." aria-label="Find a student report" value={state.reportsSearch} onChange={(e) => setState({ reportsSearch: e.target.value, reportsPage: 1 })} />
              </div>
            </div>
            <div className="table-scroll">
              <table className="reports-table">
                <caption className="sr-only">Generated report cards. Select reports to download or print.</caption>
                <thead><tr>
                  <th scope="col" className="check-col">
                    <input ref={selectAll} type="checkbox" disabled={filtered.length === 0} checked={filtered.length > 0 && checkedInFilter === filtered.length}
                      aria-label={checkedInFilter === filtered.length ? 'Deselect all reports' : `Select all ${filtered.length} report${filtered.length === 1 ? '' : 's'}`}
                      onChange={(e) => filtered.forEach((s) => toggle(s.id, e.target.checked))} />
                  </th>
                  <th scope="col">Student</th><th scope="col">Pages</th><th scope="col">Status</th><th scope="col" className="align-right">Actions</th>
                </tr></thead>
                <tbody>
                  {visible.length === 0
                    ? <tr><td colSpan={5} className="table-empty">No reports match this search.</td></tr>
                    : visible.map((student) => (
                      <tr key={student.id} className={selectedIds.has(student.id) ? 'selected' : ''}>
                        <td className="check-col"><input type="checkbox" checked={selectedIds.has(student.id)} aria-label={`Select ${student.name}'s report`} onChange={(e) => toggle(student.id, e.target.checked)} /></td>
                        <td><div className="report-student"><strong>{student.name}</strong><span>Roll {student.roll} · {averageLabel(student)} average</span></div></td>
                        <td>1 page</td>
                        <td><span className="status-badge status-approved"><Icon name="check" /> Ready</span></td>
                        <td className="align-right"><div className="report-actions">
                          <button type="button" className="icon-btn" aria-label={`Download ${student.name}'s report as PDF`} title="Download PDF" onClick={() => void download([student], true)}><Icon name="download" /></button>
                          <button type="button" className="icon-btn" aria-label={`Print ${student.name}'s report`} title="Print report" onClick={() => print([student])}><Icon name="printer" /></button>
                        </div></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>{filtered.length ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length} report${filtered.length === 1 ? '' : 's'}` : 'Showing 0 reports'}</span>
              <div className="pager">
                <button type="button" className="icon-btn" aria-label="Previous report page" disabled={page <= 1} onClick={() => setState({ reportsPage: page - 1 })}><Icon name="chevron-left" /></button>
                <span>Page {page} of {totalPages}</span>
                <button type="button" className="icon-btn" aria-label="Next report page" disabled={page >= totalPages} onClick={() => setState({ reportsPage: page + 1 })}><Icon name="chevron-right" /></button>
              </div>
            </div>
          </article>

          <div className="info-strip">
            <Icon name="folder" />
            <div><strong>Saved for whenever you need them</strong><p>These final reports stay in this workspace session. Download the PDF now, or print another copy later.</p></div>
          </div>
          <div className="page-actions"><Link className="btn btn-secondary" href="/report-card"><Icon name="arrow-left" /> Back to preview</Link></div>
        </div>

        <aside className="reports-side">
          <article className="card print-settings">
            <div className="card-heading"><h2>Ready, set, print.</h2><p>A few simple settings for a great result.</p></div>
            <div className="form-group">
              <label htmlFor="paper-size">Paper size</label>
              <div className="select-wrap">
                <select id="paper-size" value={state.paperSize} onChange={(e) => setState({ paperSize: e.target.value as AppState['paperSize'] })}>
                  <option value="a4">A4 · 210 × 297 mm</option><option value="letter">Letter · 8.5 × 11 in</option>
                </select>
                <Icon name="chevron-down" className="select-chevron" />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="print-orientation">Orientation</label>
              <div className="select-wrap">
                <select id="print-orientation" value={state.orientation} onChange={(e) => setState({ orientation: e.target.value as AppState['orientation'] })}>
                  <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
                </select>
                <Icon name="chevron-down" className="select-chevron" />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="print-layout">Sheet estimate</label>
              <div className="select-wrap">
                <select id="print-layout" value={state.printLayout} onChange={(e) => setState({ printLayout: e.target.value as AppState['printLayout'] })}>
                  <option value="double">Single-sided · One sheet per report</option><option value="single">Duplex · Two reports per sheet</option>
                </select>
                <Icon name="chevron-down" className="select-chevron" />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="reports-selector">Reports to print</label>
              <div className="select-wrap">
                <select id="reports-selector" value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'selected')}>
                  <option value="all">All {count} student{count === 1 ? '' : 's'}</option>
                  <option value="selected">Selected reports ({selectedReports.length})</option>
                </select>
                <Icon name="chevron-down" className="select-chevron" />
              </div>
            </div>
            <div className="print-summary">
              <div><span>Report cards</span><strong>{inScope.length}</strong></div>
              <div><span>PDF pages</span><strong>{inScope.length}</strong></div>
              <div><span>Estimated sheets</span><strong>{sheets}</strong></div>
            </div>
            <button type="button" className="btn btn-primary btn-full" title={inScope.length ? printLabel : 'Choose at least one report to print'} onClick={() => print(inScope)}>
              <Icon name="printer" /> {printLabel}
            </button>
            <p className="helper-text center">This is an estimate only. Choose one-sided or two-sided printing in your printer settings.</p>
          </article>
          <div className="info-card">
            <Icon name="info" className="info-card-icon" />
            <div><h3>Try one report first</h3><p>Print a single student&apos;s report to check alignment. Choose Actual size or 100% in your printer settings.</p></div>
          </div>
        </aside>
      </div>

      {printing && (
        <>
          <style>{`@page { size: ${state.paperSize === 'letter' ? 'Letter' : 'A4'} ${state.orientation}; margin: 0; }`}</style>
          <div id="print-area" aria-hidden="true" className={`${state.paperSize === 'letter' ? 'print-letter ' : ''}${state.orientation === 'landscape' ? 'print-landscape' : ''}`} style={{ ['--print-page-height' as string]: `${printHeight(state)}mm` }}>
            {printing.map((student) => (
              <div className="print-page" key={student.id}>
                <article className="report-sheet report-front"><ReportCard student={student} context={context} school={state.school} /></article>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
