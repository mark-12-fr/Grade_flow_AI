'use client';

import { useState } from 'react';
import { ATTENDANCE_MONTHS, CORE_VALUE_KEYS, STRAND_TRACK, semestersFor } from '@/lib/domain/curriculum';
import { isValidGrade, scaleMinimum } from '@/lib/domain/grading';
import { setState } from '@/lib/state/store';
import type { AppState, Student } from '@/lib/domain/types';

const update = (id: number, change: (s: Student) => Student) =>
  setState((s) => ({ students: s.students.map((x) => (x.id === id ? change(x) : x)) }));

const VALUE_LABELS: Record<string, string> = { makaDiyos: 'Maka-Diyos', makatao: 'Makatao', makakalikasan: 'Maka-kalikasan', makabansa: 'Makabansa' };

/** Edits what is printed on the chosen side of one learner's SF9. Every change updates the PDF preview right away. */
export function Sf9Editor({ student, state, side }: { student: Student; state: AppState; side: 'front' | 'back' }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const edit = (change: (s: Student) => Student) => update(student.id, change);

  const text = (key: 'name' | 'lrn' | 'age' | 'sex' | 'section' | 'strand' | 'adviser', label: string, placeholder = '') => (
    <label className="sf10-field" key={key}>
      <span>{label}</span>
      <input type="text" value={student[key] ?? ''} placeholder={placeholder} onChange={(e) => edit((s) => ({ ...s, [key]: e.target.value }))} />
    </label>
  );

  function grade(subjectKey: string, period: string, raw: string) {
    const key = `${student.id}:${subjectKey}:${period}`;
    const value = raw.trim();
    if (value !== '' && !isValidGrade(state, value)) {
      setDrafts((d) => ({ ...d, [key]: raw }));
      setError(`Grades must be numbers between ${scaleMinimum(state)} and 100.`);
      return;
    }
    setDrafts(({ [key]: _gone, ...rest }) => rest);
    setError('');
    edit((s) => ({ ...s, grades: { ...s.grades, [subjectKey]: { ...s.grades[subjectKey], [period]: value === '' ? null : Number(value) } } }));
  }

  function attendance(month: string, field: 'schoolDays' | 'months' | 'absent', raw: string) {
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && !(Number.isInteger(value) && value >= 0)) { setError('Attendance entries must be non-negative whole numbers.'); return; }
    setError('');
    edit((s) => ({ ...s, attendance: { ...s.attendance, [field]: { ...s.attendance[field], [month]: value } } }));
  }

  if (side === 'front') {
    return (
      <div className="sf10-edit-body sf9-editor">
        {error && <p className="sf10-incomplete" role="alert">{error}</p>}
        <div className="sf10-edit-grid">
          {text('name', 'Name')}{text('lrn', 'LRN')}{text('age', 'Age')}{text('sex', 'Sex')}
          {text('section', 'Section', state.section)}{text('adviser', 'Adviser', state.teacher)}
          <label className="sf10-field">
            <span>Track/Strand</span>
            <select value={student.strand ?? ''} onChange={(e) => edit((s) => ({ ...s, strand: e.target.value }))}>
              <option value="">{state.strand ? `Class strand (${state.strand})` : 'Not set'}</option>
              {Object.keys(STRAND_TRACK).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
        </div>
        {semestersFor(student.strand || state.strand).map((semester) => (
          <div key={semester.key} className="grade-editor-scroll">
            <table className="grade-editor-table sf9-grades">
              <colgroup><col /><col className="sf9-grade-col" /><col className="sf9-grade-col" /><col className="sf9-grade-col" /></colgroup>
              <thead><tr><th scope="col">{semester.label}</th>{semester.quarterLabels.map((l) => <th key={l} scope="col">Quarter {l}</th>)}<th scope="col">Semester final</th></tr></thead>
              <tbody>
                {semester.groups.flatMap((group) => [
                  <tr className="grade-editor-group" key={`g-${group.name}`}><th colSpan={4}>{group.name}</th></tr>,
                  ...group.subjects.map(([key, name]) => (
                    <tr key={key}>
                      <th scope="row">{name}</th>
                      {[...semester.quarters, 'final'].map((period) => {
                        const draftKey = `${student.id}:${key}:${period}`;
                        const stored = student.grades[key]?.[period as 'q1'];
                        const empty = stored === null || stored === undefined || (stored as unknown) === '' || Number.isNaN(Number(stored));
                        const isDraft = draftKey in drafts;
                        return (
                          <td key={period}>
                            <input className={`grade-input${empty && !isDraft ? ' missing' : ''}${isDraft ? ' invalid' : ''}`} type="number" step="any"
                              min={scaleMinimum(state)} max={100} placeholder="—" aria-invalid={isDraft}
                              aria-label={`${name} ${period === 'final' ? 'semester final' : `quarter ${period.slice(1)}`}`}
                              value={isDraft ? drafts[draftKey] : empty ? '' : String(stored)} onChange={(e) => grade(key, period, e.target.value)} />
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ])}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="sf10-edit-body sf9-editor">
      {error && <p className="sf10-incomplete" role="alert">{error}</p>}
      <strong>Report of Attendance</strong>
      <div className="grade-editor-scroll">
        <table className="grade-editor-table">
          <thead><tr><th scope="col" />{ATTENDANCE_MONTHS.map((m) => <th key={m.key} scope="col">{m.label}</th>)}</tr></thead>
          <tbody>
            {([['schoolDays', 'School days'], ['months', 'Days present'], ['absent', 'Days absent']] as const).map(([field, label]) => (
              <tr key={field}>
                <th scope="row">{label}</th>
                {ATTENDANCE_MONTHS.map((m) => (
                  <td key={m.key}>
                    <input className="grade-input" type="number" min={0} step={1} placeholder="—" aria-label={`${label} in ${m.label}`}
                      value={student.attendance[field][m.key] ?? ''} onChange={(e) => attendance(m.key, field, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <strong>Observed Values</strong>
      <div className="grade-editor-scroll">
        <table className="grade-editor-table">
          <thead><tr><th scope="col">Core value</th>{['q1', 'q2', 'q3', 'q4'].map((q) => <th key={q} scope="col">Quarter {q.slice(1)}</th>)}</tr></thead>
          <tbody>
            {CORE_VALUE_KEYS.map((key) => (
              <tr key={key}>
                <th scope="row">{VALUE_LABELS[key]}</th>
                {['q1', 'q2', 'q3', 'q4'].map((q) => (
                  <td key={q}>
                    <select className="grade-input" aria-label={`${VALUE_LABELS[key]} quarter ${q.slice(1)}`} value={student.observedValues?.[key]?.[q] ?? ''}
                      onChange={(e) => edit((s) => ({ ...s, observedValues: { ...s.observedValues, [key]: { ...(s.observedValues?.[key] ?? {}), [q]: e.target.value } } }))}>
                      <option value="">—</option><option value="AO">AO</option><option value="SO">SO</option><option value="RO">RO</option><option value="NO">NO</option>
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
