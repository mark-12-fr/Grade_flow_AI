'use client';

import { nameParts, toSf10Data } from '@/lib/sf10/record';
import { sf10Edits } from '@/lib/sf10/edit';
import type { AppState, Sf10Data, Sf10Row, Sf10Semester, Student } from '@/lib/domain/types';

const PASSING = 75;
const semesterOf = (sem: Sf10Semester): '1st' | '2nd' => (String(sem.sem) === '2' ? '2nd' : '1st');
const EMPTY_ROW: Sf10Row = { category: '', subject: '', q1: '', q2: '', final: '', action: '' };

const ELIGIBILITY_TEXT: [string, string][] = [
  ['hsGenAve', 'High school completer: general average'], ['jhsGenAve', 'Junior high school completer: general average'],
  ['completionDate', 'Date of graduation / completion'], ['schoolName', 'Name of school'], ['schoolAddress', 'School address'],
  ['peptRating', 'PEPT rating'], ['alsRating', 'ALS A&E rating'], ['others', 'Others (specify)']
];
const ELIGIBILITY_BOX: [string, string][] = [['hsCompleter', 'High School Completer'], ['jhsCompleter', 'Junior High School Completer'], ['peptPasser', 'PEPT Passer'], ['alsPasser', 'ALS A&E Passer']];
const COMPLETION: [string, string][] = [
  ['trackAccomplished', 'Track/Strand accomplished'], ['shsAverage', 'SHS general average'], ['awards', 'Awards / honors received'],
  ['graduationDate', 'Date of SHS graduation'], ['certifiedBy', 'Certified by (school head)'], ['remarks', 'Remarks'], ['purpose', 'Purpose of this record'], ['dateIssued', 'Date issued']
];
const SEM_FIELDS: [keyof Sf10Semester, string][] = [
  ['school', 'School'], ['schoolId', 'School ID'], ['gradeLevel', 'Grade level'], ['sy', 'School year'], ['sem', 'Semester (1 or 2)'], ['track', 'Track/Strand'],
  ['section', 'Section'], ['adviser', 'Adviser'], ['principal', 'Principal'], ['dateChecked', 'Date checked'], ['remarks', 'Remarks']
];
const REMEDIAL_FIELDS: [keyof Sf10Semester['remedial'], string][] = [['from', 'Remedial: from'], ['to', 'Remedial: to'], ['school', 'Remedial: school'], ['schoolId', 'Remedial: school ID'], ['teacher', 'Remedial: teacher']];

/** Edits everything printed on one learner's SF10. Every change shows on the record and in the PDF right away. */
export function Sf10Editor({ student, state }: { student: Student; state: AppState }) {
  const e = sf10Edits(student, state);
  const { data } = e;
  const name = nameParts(student);
  const save = e.learner;
  const sf = (change: (d: Sf10Data) => Sf10Data) => save((s) => ({ ...s, sf10: change(toSf10Data(s, state)) }));
  const setName = e.setName;
  const field = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="sf10-field" key={label}><span>{label}</span><input type="text" value={value} onChange={(e) => onChange(e.target.value)} /></label>
  );
  const setSem = e.semester;
  const text = (v: unknown) => (typeof v === 'string' ? v : '');

  return (
    <div className="sf10-edit-body sf9-editor">
      <strong>Learner&apos;s information</strong>
      <div className="sf10-edit-grid">
        {field('Last name', name.last, (v) => setName('last', v))}
        {field('First name', name.first, (v) => setName('first', v))}
        {field('Middle name', name.middle, (v) => setName('middle', v))}
        {field('LRN', student.lrn ?? '', (v) => save((s) => ({ ...s, lrn: v })))}
        {field('Date of birth (MM/DD/YYYY)', student.birthdate ?? '', e.setBirth)}
        {field('Sex', student.sex ?? '', (v) => save((s) => ({ ...s, sex: v })))}
      </div>

      <strong>Eligibility for SHS enrolment</strong>
      <div className="sf10-edit-grid">
        {ELIGIBILITY_BOX.map(([key, label]) => (
          <label className="sf10-check" key={key}>
            <input type="checkbox" checked={Boolean(data.eligibility[key])} onChange={(e) => sf((d) => ({ ...d, eligibility: { ...d.eligibility, [key]: e.target.checked } }))} />
            <span>{label}</span>
          </label>
        ))}
        {ELIGIBILITY_TEXT.map(([key, label]) => field(label, text(data.eligibility[key]), (v) => sf((d) => ({ ...d, eligibility: { ...d.eligibility, [key]: v } }))))}
      </div>

      {data.semesters.map((sem, i) => (
        <details key={i} className="sf10-sem-edit" open={data.semesters.length === 1}>
          <summary><strong>Grade {sem.gradeLevel || '?'} · {semesterOf(sem)} semester</strong> <span>{sem.sy}{sem.track ? ` · ${sem.track}` : ''}</span></summary>
          <div className="sf10-edit-body">
            <div className="sf10-edit-grid">
              {SEM_FIELDS.map(([key, label]) => field(label, text(sem[key]), (v) => setSem(i, (x) => ({ ...x, [key]: v }))))}
              {REMEDIAL_FIELDS.map(([key, label]) => field(label, sem.remedial[key] as string, (v) => setSem(i, (x) => ({ ...x, remedial: { ...x.remedial, [key]: v } }))))}
            </div>
            <div className="grade-editor-scroll">
              <table className="grade-editor-table sf10-rows">
                <thead><tr><th scope="col">Category</th><th scope="col">Subject</th><th scope="col">{semesterOf(sem) === '2nd' ? '3rd' : '1st'} quarter</th><th scope="col">{semesterOf(sem) === '2nd' ? '4th' : '2nd'} quarter</th><th scope="col">Final</th><th scope="col">Action taken</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
                <tbody>
                  {sem.rows.map((row, k) => {
                    const setRow = (part: Partial<Sf10Row>) => setSem(i, (x) => ({ ...x, rows: x.rows.map((r, n) => (n === k ? { ...r, ...part } : r)) }));
                    return (
                      <tr key={k}>
                        {(['category', 'subject', 'q1', 'q2', 'final', 'action'] as const).map((key) => (
                          <td key={key}>
                            <input className={`sf10-cell-input${key === 'subject' ? ' wide' : ''}`} type="text" value={row[key]} aria-label={`${row.subject || 'Subject'} ${key}`}
                              onChange={(e) => setRow({ [key]: e.target.value })} />
                          </td>
                        ))}
                        <td><button type="button" className="icon-btn" aria-label={`Remove ${row.subject || 'this subject'}`} onClick={() => setSem(i, (x) => ({ ...x, rows: x.rows.filter((_, n) => n !== k) }))}>×</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="sf10-edit-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSem(i, (x) => ({ ...x, rows: [...x.rows, { ...EMPTY_ROW }] }))}>Add a subject</button>
              <button type="button" className="btn btn-secondary btn-sm" title="General average = the average of the final grades above" onClick={() => setSem(i, (x) => {
                const finals = x.rows.map((r) => Number(r.final)).filter((n, k) => x.rows[k].final.trim() !== '' && Number.isFinite(n));
                if (!finals.length) return x;
                const avg = Math.round(finals.reduce((a, b) => a + b, 0) / finals.length);
                return { ...x, average: String(avg), averageAction: avg >= PASSING ? 'PASSED' : 'FAILED' };
              })}>Recompute the average</button>
              {field('General average', sem.average, (v) => setSem(i, (x) => ({ ...x, average: v })))}
              {field('Average action', sem.averageAction, (v) => setSem(i, (x) => ({ ...x, averageAction: v })))}
            </div>
          </div>
        </details>
      ))}

      <strong>Completion</strong>
      <div className="sf10-edit-grid">
        {COMPLETION.map(([key, label]) => field(label, text(data.completion[key]), (v) => sf((d) => ({ ...d, completion: { ...d.completion, [key]: v } }))))}
      </div>
    </div>
  );
}
