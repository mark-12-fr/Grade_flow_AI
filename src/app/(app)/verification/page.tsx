'use client';

/** Review and fix the learners' grades, attendance and observed values before previewing the SF9. */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Hint } from '@/components/ui/Hint';
import { Icon } from '@/components/ui/Icon';
import { useUi } from '@/components/layout/Providers';
import { ALL_SUBJECTS, ATTENDANCE_MONTHS, semestersFor, subjectsFor } from '@/lib/domain/curriculum';
import { initials, prettyYear } from '@/lib/domain/format';
import {
  approvedCount, averageGrade, averageLabel, gradeScaleDescription, isValidGrade, missingGradeCells, reviewedCommentCount, scaleMinimum, studentStatus
} from '@/lib/domain/grading';
import { setState, useAppState } from '@/lib/state/store';
import type { AppState, Student } from '@/lib/domain/types';

const PAGE_SIZE = 6;
type Tab = 'grades' | 'attendance' | 'values';
const TABS: [Tab, string][] = [['grades', 'Quarterly grades'], ['attendance', 'Attendance'], ['values', 'Observed values']];
const VALUE_ROWS: [string, string][] = [['makaDiyos', 'Maka-Diyos'], ['makatao', 'Makatao'], ['makakalikasan', 'Maka-kalikasan'], ['makabansa', 'Makabansa']];
const CHOICES: [string, string][] = [['', 'Not set'], ['AO', 'AO — Always Observed'], ['SO', 'SO — Sometimes Observed'], ['RO', 'RO — Rarely Observed'], ['NO', 'NO — Not Observed']];
const ATT_FIELDS: ['schoolDays' | 'months' | 'absent', string][] = [['schoolDays', 'School days'], ['months', 'Days present'], ['absent', 'Days absent']];
const NAMES: Record<string, string> = { lrn: 'LRN', roll: 'Roll / ID number', name: 'Learner name', age: 'Age', sex: 'Sex', birthdate: 'Birthdate' };

function fieldLabel(field: string): string {
  const parts = field.split(':');
  if (parts[0] === 'grade') {
    const subject = ALL_SUBJECTS.find((s) => s.key === parts[1]);
    return `${subject ? subject.name : parts[1]} · ${parts[2] === 'final' ? 'Semester final' : `Quarter ${parts[2].slice(1)}`}`;
  }
  if (parts[0] === 'att') return `Attendance · ${parts[1].toUpperCase()} · ${parts[2].replace(/([A-Z])/g, ' $1').toLowerCase()}`;
  if (parts[0] === 'ov') return `Core value · ${parts[1]} · Q${parts[2].slice(1)}`;
  if (parts[0] === 'transfer') return `Transfer · ${parts[1]}`;
  return NAMES[field] || field.charAt(0).toUpperCase() + field.slice(1);
}

const updateStudent = (id: number, change: (s: Student) => Student) =>
  setState((s) => ({ students: s.students.map((x) => (x.id === id ? change(x) : x)) }));

function StatusBadge({ student }: { student: Student }) {
  return studentStatus(student) === 'approved'
    ? <span className="status-badge status-approved"><Icon name="check" /> Approved</span>
    : <span className="status-badge status-needs"><Icon name="alert-circle" /> Needs correction</span>;
}

function attendanceIssue(student: Student) {
  for (const month of ATTENDANCE_MONTHS) {
    const a = student.attendance;
    const values = [a.schoolDays?.[month.key], a.months?.[month.key], a.absent?.[month.key]];
    const invalid = values.some((v) => v !== null && v !== undefined && (v as unknown) !== '' && (!Number.isInteger(Number(v)) || Number(v) < 0));
    const all = values.every((v) => v !== null && v !== undefined && (v as unknown) !== '');
    if (invalid || (all && Number(values[1]) + Number(values[2]) > Number(values[0]))) return { student, month };
  }
  return null;
}

export default function VerificationPage() {
  const router = useRouter();
  const { toast } = useUi();
  const state = useAppState();
  const [tab, setTab] = useState<Tab>('grades');
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [badAttendance, setBadAttendance] = useState<string | null>(null);
  const editorRef = useRef<HTMLElement>(null);

  const students = state.students;
  const total = students.length;
  const missing = missingGradeCells(students).length;
  const search = state.verificationSearch.trim().toLowerCase();
  const filtered = students.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search) && !String(s.roll).toLowerCase().includes(search)) return false;
    const status = studentStatus(s);
    if (state.verificationFilter === 'approved') return status === 'approved';
    if (state.verificationFilter === 'needs-correction') return status === 'needs-correction';
    if (state.verificationFilter === 'low') { const a = averageGrade(s); return a !== null && a < 75; }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, state.verificationPage), totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  const selected = students.find((s) => s.id === state.selectedStudentId) ?? students[0] ?? null;
  const ai = state.upload?.ai ?? null;
  const hasInvalidDraft = Object.keys(drafts).length > 0;

  function selectStudent(id: number, focusGrades: boolean) {
    if (hasInvalidDraft && id !== selected?.id) { setError('Fix the highlighted grade before selecting another student.'); return; }
    setState({ selectedStudentId: id });
    if (focusGrades) setTab('grades');
  }

  function editGrade(student: Student, subjectKey: string, period: string, raw: string) {
    const key = `${student.id}:${subjectKey}:${period}`;
    const text = raw.trim();
    setError('');
    if (text === '') {
      setDrafts(({ [key]: _gone, ...rest }) => rest);
      updateStudent(student.id, (s) => ({ ...s, grades: { ...s.grades, [subjectKey]: { ...s.grades[subjectKey], [period]: null } } }));
      return;
    }
    if (!isValidGrade(state, text)) {
      setDrafts((d) => ({ ...d, [key]: raw }));
      setError(`Grades must be numbers between ${scaleMinimum(state)} and 100.`);
      return;
    }
    setDrafts(({ [key]: _gone, ...rest }) => rest);
    const was = student.grades[subjectKey]?.[period as 'q1'];
    updateStudent(student.id, (s) => ({ ...s, grades: { ...s.grades, [subjectKey]: { ...s.grades[subjectKey], [period]: Number(text) } } }));
    if (was === null || was === undefined) toast('Grade saved.');
  }

  function editAttendance(student: Student, month: string, field: 'schoolDays' | 'months' | 'absent', raw: string) {
    const text = raw.trim();
    const value = text === '' ? null : Number(text);
    const valid = value === null || (Number.isInteger(value) && value >= 0);
    if (!valid) { setBadAttendance(month); setError('Attendance entries must be non-negative whole numbers.'); return; }
    const next = { ...student.attendance, [field]: { ...student.attendance[field], [month]: value } };
    const { schoolDays, months, absent } = [next.schoolDays[month], next.months[month], next.absent[month]].every((v) => v !== null && v !== undefined)
      ? { schoolDays: next.schoolDays[month] as number, months: next.months[month] as number, absent: next.absent[month] as number } : { schoolDays: 0, months: 0, absent: -1 };
    const exceeds = absent !== -1 && months + absent > schoolDays;
    setBadAttendance(exceeds ? month : null);
    setError(exceeds ? `Days present and absent cannot exceed the school days for ${month.toUpperCase()}.` : '');
    updateStudent(student.id, (s) => ({ ...s, attendance: next }));
  }

  function editValue(student: Student, key: string, period: string, value: string) {
    updateStudent(student.id, (s) => ({ ...s, observedValues: { ...s.observedValues, [key]: { ...(s.observedValues[key] || {}), [period]: value } } }));
  }

  function showStudent(student: Student) {
    const index = filtered.findIndex((s) => s.id === student.id);
    if (index === -1) { setState({ verificationSearch: '', verificationFilter: 'all', verificationPage: Math.floor(students.findIndex((s) => s.id === student.id) / PAGE_SIZE) + 1, selectedStudentId: student.id }); return; }
    setState({ selectedStudentId: student.id, verificationPage: Math.floor(index / PAGE_SIZE) + 1 });
  }

  /** Jumps to the next learner (after the one on screen) that still has a missing grade, and scrolls to their grades. */
  function goNextMissing() {
    if (hasInvalidDraft) { setError('Fix the highlighted grade before moving to another learner.'); return; }
    const withGaps = students.filter((s) => missingGradeCells([s]).length > 0);
    if (!withGaps.length) { toast('No missing grades left.', 'success'); return; }
    const at = selected ? students.findIndex((s) => s.id === selected.id) : -1;
    const next = withGaps.find((s) => students.indexOf(s) > at) ?? withGaps[0];
    setState({ verificationSearch: '', verificationFilter: 'all', verificationPage: Math.floor(students.indexOf(next) / PAGE_SIZE) + 1, selectedStudentId: next.id });
    setTab('grades');
    window.setTimeout(() => editorRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 60);
  }

  // Alt + Left / Right moves to the previous / next learner without leaving the grade boxes.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
      const at = filtered.findIndex((s) => s.id === selected?.id);
      const next = filtered[at + (event.key === 'ArrowRight' ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      if (hasInvalidDraft) { setError('Fix the highlighted grade before selecting another student.'); return; }
      showStudent(next);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  function goPreview() {
    const issue = students.map(attendanceIssue).find(Boolean);
    if (issue) {
      setState({ selectedStudentId: issue.student.id });
      setTab('attendance'); setBadAttendance(issue.month.key);
      setError(`Fix the invalid attendance values for ${issue.student.name} in ${issue.month.label} before previewing.`);
      toast('Fix the highlighted attendance values before continuing.', 'error');
      return;
    }
    if (hasInvalidDraft) {
      setError(`One or more grades are invalid. Enter numbers between ${scaleMinimum(state)} and 100.`);
      toast('Fix the highlighted grade before continuing.', 'error');
      return;
    }
    if (missing) {
      setError(`Enter the remaining ${missing} missing grade${missing === 1 ? '' : 's'} before previewing.`);
      toast(`There ${missing === 1 ? 'is 1 missing grade' : `are ${missing} missing grades`} left to correct.`, 'error');
      const first = missingGradeCells(students)[0];
      const index = students.findIndex((s) => s.id === first.student.id);
      setState({ verificationSearch: '', verificationFilter: 'all', verificationPage: Math.floor(index / PAGE_SIZE) + 1, selectedStudentId: first.student.id });
      setTab('grades');
      return;
    }
    setError('');
    const at = selected ? students.findIndex((s) => s.id === selected.id) : -1;
    if (at > -1) setState({ previewIndex: at });
    router.push('/report-card');
    toast('Grades approved. Your report cards are ready to preview.');
  }

  const selectedMissing = selected ? missingGradeCells([selected]).length : 0;

  return (
    <section className="page active" aria-labelledby="verification-title">
      <div className="page-heading">
        <div>
          <h1 id="verification-title">Grade verification</h1>
          <p>Review the grades and correct anything that needs a second look.</p>
        </div>
      </div>

      {ai && (
        <details className="card ai-notes" open={ai.warnings.length > 0}>
          <summary><strong>How AI read your file</strong> <span>· {ai.mapping.length} columns mapped{ai.warnings.length ? ` · ${ai.warnings.length} to check` : ''}</span></summary>
          <div className="ai-notes-body">
            <p className="muted">Check that each source column landed in the right field. Grades are copied from your file, never generated.</p>
            <ul className="ai-warnings">{ai.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            <div className="table-scroll"><table className="data-table ai-mapping-table">
              <thead><tr><th scope="col">Your column</th><th scope="col">Mapped to</th></tr></thead>
              <tbody>{ai.mapping.map((m) => <tr key={m.col}><td>{m.header || `Column ${m.col + 1}`}</td><td>{fieldLabel(m.field)}</td></tr>)}</tbody>
            </table></div>
          </div>
        </details>
      )}

      <div className="stat-grid verify-stats">
        <article className="card stat-card compact"><div className="stat-label"><span>Students found</span><Icon name="users" /></div><strong>{total}</strong></article>
        <article className="card stat-card compact"><div className="stat-label"><span>Students approved</span><Icon name="check" /></div><strong>{approvedCount(students)}<span className="stat-total"> / {total}</span></strong></article>
        <article className="card stat-card compact"><div className="stat-label"><span>Missing grades</span><Icon name="pencil" /></div><strong>{missing}</strong></article>
        <article className="card stat-card compact"><div className="stat-label"><span>AI comments included</span><Icon name="message" /></div><strong>{reviewedCommentCount(students)}<span className="stat-total"> / {total}</span></strong></article>
      </div>

      <div className="card verify-progress">
        <div className="verify-progress-text">
          <strong>{approvedCount(students)} of {total} learners checked</strong>
          <span>{missing ? `${missing} missing grade${missing === 1 ? '' : 's'} left` : 'No missing grades left'}</span>
        </div>
        <div className="verify-progress-bar" role="progressbar" aria-label="Learners checked" aria-valuemin={0} aria-valuemax={total} aria-valuenow={approvedCount(students)}>
          <span style={{ width: `${total ? Math.round((approvedCount(students) / total) * 100) : 0}%` }} />
        </div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!missing} onClick={goNextMissing}>Next learner with a missing grade <Icon name="arrow-right" /></button>
      </div>

      <article className="card table-card verification-roster-card">
        <div className="table-card-head">
          <div>
            <h2>{state.className}</h2>
            <p><span>{state.term} · {prettyYear(state.year)}</span> · <span>{gradeScaleDescription(state)}</span></p>
          </div>
          <div className="table-tools">
            <div className="search-field">
              <Icon name="search" />
              <input type="search" placeholder="Search students..." aria-label="Search students" value={state.verificationSearch}
                onChange={(e) => setState({ verificationSearch: e.target.value, verificationPage: 1 })} />
            </div>
            <div className="select-wrap select-wrap-sm">
              <select aria-label="Filter students by review status" value={state.verificationFilter}
                onChange={(e) => setState({ verificationFilter: e.target.value as AppState['verificationFilter'], verificationPage: 1 })}>
                <option value="all">All students</option><option value="approved">Approved</option>
                <option value="needs-correction">Needs correction</option><option value="low">Low average</option>
              </select>
              <Icon name="chevron-down" className="select-chevron" />
            </div>
          </div>
        </div>
        <div className="table-scroll">
          <table className="grade-table">
            <caption className="sr-only">Student grades for the selected class and term. Each score is editable.</caption>
            <thead><tr>
              <th scope="col">Roll</th><th scope="col">Student name</th><th scope="col">Age / sex</th><th scope="col">LRN <Hint text="Learner Reference Number: the 12-digit ID the DepEd gives each learner." /></th>
              <th scope="col">General average <Hint text="The average of the learner's final grades across all subjects." /></th><th scope="col">Grade entries</th><th scope="col">Review status</th><th scope="col">Review</th>
            </tr></thead>
            <tbody>
              {visible.length === 0
                ? <tr><td colSpan={8} className="table-empty">{total ? 'No students match this search or filter.' : 'Upload an SF9 grade sheet to review grades.'}</td></tr>
                : visible.map((student) => {
                  const m = missingGradeCells([student]).length;
                  return (
                    <tr key={student.id} className={selected?.id === student.id ? 'selected' : ''} onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) selectStudent(student.id, false); }}>
                      <td className="roll">{student.roll}</td>
                      <td><div className="student-cell"><span className="mini-avatar">{initials(student.name)}</span><div><strong>{student.name}</strong><span className="student-avg">Avg {averageLabel(student)}</span></div></div></td>
                      <td>{[student.age, student.sex].filter(Boolean).join(' / ') || '—'}</td>
                      <td>{student.lrn || '—'}</td>
                      <td>{averageLabel(student)}</td>
                      <td>{subjectsFor(student.strand).length * 3 - m} / {subjectsFor(student.strand).length * 3}</td>
                      <td><StatusBadge student={student} /></td>
                      <td><button type="button" className="btn btn-secondary row-edit" onClick={() => selectStudent(student.id, true)}>Edit grades</button></td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>{filtered.length ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length} student${filtered.length === 1 ? '' : 's'}` : 'Showing 0 students'}</span>
          <div className="pager">
            <button type="button" className="icon-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => setState({ verificationPage: page - 1 })}><Icon name="chevron-left" /></button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" className="icon-btn" aria-label="Next page" disabled={page >= totalPages} onClick={() => setState({ verificationPage: page + 1 })}><Icon name="chevron-right" /></button>
          </div>
        </div>
      </article>

      <article className="card grade-editor-card" ref={editorRef} style={{ scrollMarginTop: 'calc(var(--header-height, 56px) + 12px)' }}>
        {error && <div className="form-error" role="alert">{error}</div>}
        <section className="grade-editor" aria-live="polite">
          {!selected ? (
            <div className="grade-editor-empty"><h2>Student details</h2><p>Upload a grade sheet to review learner grades and report details.</p></div>
          ) : (
            <>
              <div className="grade-editor-heading">
                <div>
                  <span className="grade-editor-kicker">LEARNER RECORD</span>
                  <h2>Review student details</h2>
                  <p className="grade-editor-summary">{selected.name} · {selectedMissing ? `${selectedMissing} grade entries need review` : 'All grade entries are complete'}</p>
                </div>
                <div className="grade-editor-status"><StatusBadge student={selected} /></div>
              </div>
              <div className="grade-editor-tabs" role="tablist" aria-label="Learner details">
                {TABS.map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className={`grade-editor-tab${tab === id ? ' active' : ''}`}
                    onClick={() => { if (hasInvalidDraft) { setError('Fix the highlighted grade before switching sections.'); return; } setError(''); setTab(id); }}>{label}</button>
                ))}
              </div>
              <div className="grade-editor-panel" role="tabpanel" tabIndex={0}>
                {tab === 'grades' && semestersFor(selected?.strand).map((semester) => (
                  <div key={semester.key}>
                    <h4>{semester.label}</h4>
                    <div className="grade-editor-scroll"><table className="grade-editor-table">
                      <thead><tr><th scope="col">Subject</th>{semester.quarterLabels.map((l) => <th key={l} scope="col">Quarter {l}</th>)}<th scope="col">Semester final</th></tr></thead>
                      <tbody>
                        {semester.groups.map((group) => [
                          <tr className="grade-editor-group" key={`g-${group.name}`}><th colSpan={4}>{group.name}</th></tr>,
                          ...group.subjects.map(([key, name]) => (
                            <tr key={key}>
                              <th scope="row">{name}</th>
                              {[...semester.quarters, 'final'].map((period) => {
                                const stored = selected.grades[key]?.[period as 'q1'];
                                const draftKey = `${selected.id}:${key}:${period}`;
                                const isDraft = draftKey in drafts;
                                const empty = stored === null || stored === undefined || (stored as unknown) === '' || Number.isNaN(Number(stored));
                                return (
                                  <td key={period}>
                                    <input
                                      className={`grade-input${empty && !isDraft ? ' missing' : ''}${isDraft ? ' invalid' : ''}`} type="number" min={scaleMinimum(state)} max={100} step="any"
                                      placeholder="—" aria-invalid={isDraft} aria-label={`${selected.name} ${name} ${period === 'final' ? 'Semester final' : `Quarter ${period.slice(1)}`}`}
                                      value={isDraft ? drafts[draftKey] : empty ? '' : String(stored)}
                                      onChange={(e) => editGrade(selected, key, period, e.target.value)}
                                      onBlur={(e) => { const v = e.target.value.trim(); if (v && !isValidGrade(state, v)) toast(`Enter a grade between ${scaleMinimum(state)} and 100.`, 'error'); }}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))
                        ])}
                      </tbody>
                    </table></div>
                  </div>
                ))}
                {tab === 'attendance' && (
                  <section className="review-data-section">
                    <div className="review-data-heading"><div><h4>Edit report of attendance</h4><p>Enter monthly school days, days present, and days absent. Leave unknown values blank.</p></div></div>
                    <div className="grade-editor-scroll"><table className="grade-editor-table report-data-table">
                      <thead><tr><th scope="col">Month</th>{ATT_FIELDS.map(([, l]) => <th key={l} scope="col">{l}</th>)}</tr></thead>
                      <tbody>
                        {ATTENDANCE_MONTHS.map((month) => (
                          <tr key={month.key}>
                            <th scope="row">{month.label}</th>
                            {ATT_FIELDS.map(([field, label]) => {
                              const v = selected.attendance[field]?.[month.key];
                              return (
                                <td key={field}>
                                  <input className={`report-data-input attendance-input${badAttendance === month.key ? ' invalid' : ''}`} type="number" min={0} step={1} placeholder="—"
                                    aria-invalid={badAttendance === month.key} aria-label={`${selected.name} ${month.label} ${label}`}
                                    value={v == null || (v as unknown) === '' ? '' : String(v)} onChange={(e) => editAttendance(selected, month.key, field, e.target.value)} />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  </section>
                )}
                {tab === 'values' && (
                  <section className="review-data-section">
                    <div className="review-data-heading"><div><h4>Edit learner observed values <Hint text="AO = Always Observed, SO = Sometimes Observed, RO = Rarely Observed, NO = Not Observed. Teachers rate each core value every quarter." /></h4><p>Choose an observation rating for each core value and quarter.</p></div></div>
                    <div className="grade-editor-scroll"><table className="grade-editor-table report-data-table observed-editor-table">
                      <thead><tr><th scope="col">Core values</th>{[1, 2, 3, 4].map((q) => <th key={q} scope="col">Quarter {q}</th>)}</tr></thead>
                      <tbody>
                        {VALUE_ROWS.map(([key, label]) => (
                          <tr key={key}>
                            <th scope="row">{label}</th>
                            {['q1', 'q2', 'q3', 'q4'].map((period, i) => (
                              <td key={period}>
                                <label className="sr-only" htmlFor={`observed-${selected.id}-${key}-${period}`}>{`${selected.name} ${label} quarter ${i + 1}`}</label>
                                <div className="select-wrap">
                                  <select className="report-data-input observed-value-input" id={`observed-${selected.id}-${key}-${period}`}
                                    value={selected.observedValues[key]?.[period] ?? ''} onChange={(e) => editValue(selected, key, period, e.target.value)}>
                                    {CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                  </select>
                                  <Icon name="chevron-down" className="select-chevron" />
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  </section>
                )}
              </div>
            </>
          )}
        </section>
      </article>

      <div className="page-actions">
        <Link className="btn btn-secondary" href="/upload"><Icon name="arrow-left" /> Back to upload</Link>
        <div className="action-end">
          <span className="action-note">{missing === 0 ? 'All grades complete · Ready to preview' : `${missing} missing grade${missing === 1 ? '' : 's'} · Correct ${missing === 1 ? 'it' : 'them'} in the table above`}</span>
          <button type="button" className="btn btn-primary" onClick={goPreview}>Preview report cards <Icon name="chevron-right" /></button>
        </div>
      </div>
    </section>
  );
}
