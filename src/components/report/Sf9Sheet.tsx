'use client';

/** The SF9 report card as an editable page on screen (front and back). The PDF is drawn separately in lib/pdf/sf9.ts. */

import { Editable } from '@/components/ui/Editable';
import { useUi } from '@/components/layout/Providers';
import { ATTENDANCE_MONTHS, CORE_VALUE_KEYS, semestersFor } from '@/lib/domain/curriculum';
import { isValidGrade, remarkFor, scaleMinimum, semesterAverage, studentContext, type ReportContext } from '@/lib/domain/grading';
import { setState } from '@/lib/state/store';
import type { AppState, Student } from '@/lib/domain/types';

const RATINGS = ['AO', 'SO', 'RO', 'NO'];
const VALUES: [(typeof CORE_VALUE_KEYS)[number], string, string[]][] = [
  ['makaDiyos', '1. Maka-Diyos', ["Expresses one's spiritual beliefs while respecting the spiritual beliefs of others", 'Demonstrates adherence to ethical principles by upholding truth']],
  ['makatao', '2. Makatao', ['Is sensitive to individual, social, and cultural differences', 'Demonstrates contributions toward solidarity']],
  ['makakalikasan', '3. Maka-kalikasan', ['Cares for the environment and utilizes resources wisely, judiciously, and economically', 'Demonstrates stewardship in keeping a flourishing environment']],
  ['makabansa', '4. Makabansa', ['Demonstrates pride in being a Filipino; expresses the rights and responsibilities of a Filipino citizen', 'Demonstrates appropriate behavior in carrying out activities in the school, community, and country']]
];
const gradeText = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '' : String(v));

/** One learner's SF9 as a page you can type on: tap a value and change it. The Download and Print buttons make the real PDF. */
export function Sf9Sheet({ student, context, state, side }: { student: Student; context: ReportContext; state: AppState; side: 'front' | 'back' }) {
  const { toast } = useUi();
  const ctx = studentContext(context, student);
  const update = (change: (s: Student) => Student) => setState((s) => ({ students: s.students.map((x) => (x.id === student.id ? change(x) : x)) }));
  const ed = (value: unknown, commit: (v: string) => void, className?: string, label?: string) => (
    <Editable value={value == null ? '' : String(value)} onCommit={commit} className={className} label={label} />
  );

  function grade(subjectKey: string, period: string, text: string) {
    if (text !== '' && !isValidGrade(state, text)) { toast(`Grades must be numbers between ${scaleMinimum(state)} and 100.`, 'error'); return; }
    update((s) => ({ ...s, grades: { ...s.grades, [subjectKey]: { ...s.grades[subjectKey], [period]: text === '' ? null : Number(text) } } }));
  }
  function attendance(field: 'schoolDays' | 'months' | 'absent', month: string, text: string) {
    const value = text === '' ? null : Number(text);
    if (value !== null && !(Number.isInteger(value) && value >= 0)) { toast('Attendance entries must be non-negative whole numbers.', 'error'); return; }
    update((s) => ({ ...s, attendance: { ...s.attendance, [field]: { ...s.attendance[field], [month]: value } } }));
  }
  const rate = (key: string, q: string) => student.observedValues?.[key]?.[q] ?? '';
  function cycle(key: string, q: string) {
    const next = RATINGS[RATINGS.indexOf(rate(key, q)) + 1] ?? (rate(key, q) === '' ? RATINGS[0] : '');
    update((s) => ({ ...s, observedValues: { ...s.observedValues, [key]: { ...(s.observedValues?.[key] ?? {}), [q]: next } } }));
  }

  if (side === 'front') {
    return (
      <div className="sf9-sheet">
        <h2 className="sf9-title">REPORT ON LEARNING PROGRESS AND ACHIEVEMENT</h2>
        {semestersFor(student.strand || state.strand).map((semester) => {
          const average = semesterAverage(student, semester.key);
          return (
            <section key={semester.key} className="sf9-semester">
              <h3>{semester.label}</h3>
              <table className="sf9-table">
                <thead>
                  <tr><th rowSpan={2} className="sf9-subject-head">Subjects</th><th colSpan={2}>Quarter</th><th rowSpan={2}>Semester<br />Final Grade</th><th rowSpan={2}>Remarks</th></tr>
                  <tr>{semester.quarterLabels.map((l) => <th key={l}>{l}</th>)}</tr>
                </thead>
                <tbody>
                  {semester.groups.flatMap((group) => [
                    <tr key={`g-${group.name}`} className="sf9-group"><th colSpan={5}>{group.name}</th></tr>,
                    ...group.subjects.map(([key, name]) => {
                      const g = student.grades[key] || {};
                      const remark = remarkFor(g.final);
                      return (
                        <tr key={key}>
                          <td className="sf9-subject">{name}</td>
                          {[...semester.quarters, 'final'].map((period) => (
                            <td key={period} className={period === 'final' ? 'sf9-final' : ''}>
                              {ed(gradeText(g[period as 'q1']), (v) => grade(key, period, v), gradeText(g[period as 'q1']) === '' ? 'sf10-missing' : '', `${name} ${period === 'final' ? 'semester final' : `quarter ${period.slice(1)}`}`)}
                            </td>
                          ))}
                          <td className={remark === 'Failed' ? 'sf9-failed' : ''}>{remark}</td>
                        </tr>
                      );
                    })
                  ])}
                  <tr className="sf9-average"><th colSpan={3} scope="row">General Average for the Semester</th><td>{average === null ? '' : average}</td><td>{average === null ? '' : remarkFor(average)}</td></tr>
                </tbody>
              </table>
            </section>
          );
        })}
        <table className="sf9-legends">
          <thead><tr><th>Observed Values</th><th>Learning Progress &amp; Achievement</th><th>Parent/Guardian&apos;s Signature</th></tr></thead>
          <tbody><tr>
            <td><div className="sf9-leg sf9-leg-values">{[['AO', 'Always Observed'], ['SO', 'Sometimes Observed'], ['RO', 'Rarely Observed'], ['NO', 'Not Observed']].map((r) => <div key={r[0]}><b>{r[0]}</b><span>{r[1]}</span></div>)}</div></td>
            <td><div className="sf9-leg sf9-leg-progress">{[['Outstanding', '90-100', 'Passed'], ['Very Satisfactory', '85-89', 'Passed'], ['Satisfactory', '80-84', 'Passed'], ['Fairly Satisfactory', '75-79', 'Passed'], ['Did Not Meet Expectations', 'below 75', 'Failed']].map((r) => <div key={r[0]}><b>{r[0]}</b><span>{r[1]}</span><span className={r[2] === 'Failed' ? 'sf9-failed' : ''}>{r[2]}</span></div>)}</div></td>
            <td><div className="sf9-leg sf9-leg-sign">{['1st Q', '2nd Q', '3rd Q', '4th Q'].map((q) => <div key={q}><b>{q}</b><span /></div>)}</div></td>
          </tr></tbody>
        </table>
      </div>
    );
  }

  const address = String(ctx.schoolAddress || '').split(' · ').map((p) => p.trim()).filter((p) => p && !/senior high school department/i.test(p)).slice(0, 4);
  const transfer = student.transfer || {};
  const t = (key: string, label: string) => (
    <div className="sf9-row" key={key}><span>{label}</span>{ed(transfer[key] ?? '', (v) => update((s) => ({ ...s, transfer: { ...s.transfer, [key]: v } })), '', label)}</div>
  );
  const sum = (row: Record<string, number | null | undefined>) => {
    const values = ATTENDANCE_MONTHS.map((m) => row?.[m.key]).filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(Number(v)));
    return values.length ? String(values.reduce((a, b) => a + Number(b), 0)) : '';
  };
  const attendanceRows = [['No. of school days', 'schoolDays'], ['No. of days present', 'months'], ['No. of days absent', 'absent']] as const;

  return (
    <div className="sf9-sheet">
      <div className="sf9-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={state.school.logo || '/assets/ui-logo.png'} alt="School logo" />
        <div>
          {address.map((a) => <p key={a} className="sf9-address">{a}</p>)}
          <h2>{ctx.schoolName}</h2>
          <p className="sf9-dept">Senior High School Department</p>
        </div>
      </div>

      <div className="sf9-learner">
        <div className="sf9-full"><b>Name:</b> {ed(student.name, (v) => update((s) => ({ ...s, name: v })), 'sf9-grow', 'Name')}</div>
        <div><b>Age:</b> {ed(student.age, (v) => update((s) => ({ ...s, age: v })), '', 'Age')}</div>
        <div><b>Sex:</b> {ed(student.sex, (v) => update((s) => ({ ...s, sex: v })), '', 'Sex')}</div>
        <div><b>Grade:</b> {ctx.gradeLevel}</div>
        <div><b>Section:</b> {ed(ctx.section, (v) => update((s) => ({ ...s, section: v })), '', 'Section')}</div>
        <div><b>School Year:</b> {ed(state.year, (v) => setState({ year: v }), '', 'School year (applies to everyone)')}</div>
        <div><b>LRN:</b> {ed(student.lrn, (v) => update((s) => ({ ...s, lrn: v })), '', 'LRN')}</div>
        <div className="sf9-full"><b>Track/Strand:</b> {ctx.trackStrand || ctx.strand || '-'}</div>
      </div>

      <p className="sf9-dear"><b>Dear Parent:</b></p>
      <p className="sf9-letter">This report card shows your child&apos;s performance in the different learning areas as well as in character formation. The school welcomes you if you desire to know more about the progress of your child.</p>

      <div className="sf9-signs">
        <div>{ed(ctx.teacher, (v) => update((s) => ({ ...s, adviser: v })), '', 'Adviser')}<small>Adviser</small></div>
        <div>{ed(ctx.principal, (v) => setState((s) => ({ school: { ...s.school, principal: v } })), '', 'Principal (applies to everyone)')}<small>Principal</small></div>
      </div>

      <div className="sf9-panels">
        <div>
          <h4>Certificate of Transfer</h4>
          {t('admittedTo', 'Admitted to')}
          <div className="sf9-row"><span>Section</span>{ed(transfer.section || ctx.section, (v) => update((s) => ({ ...s, transfer: { ...s.transfer, section: v } })), '', 'Section (transfer)')}</div>
          {t('eligibilityForGrade', 'Eligibility for admission to grade')}
          {t('approvedBy', 'Approved by')}
          <div className="sf9-sign-box"><small>Adviser</small></div>
        </div>
        <div>
          <h4>Cancellation of Eligibility to Transfer</h4>
          {t('admittedIn', 'Admitted in')}
          {t('transferDate', 'Date')}
          {t('cancellationOfEligibility', 'Approved by')}
          <div className="sf9-row sf9-spacer" />
          <div className="sf9-sign-box"><small>Principal</small></div>
        </div>
      </div>

      <table className="sf9-table sf9-attendance">
        <thead>
          <tr><th colSpan={ATTENDANCE_MONTHS.length + 2} className="sf9-caption">REPORT OF ATTENDANCE</th></tr>
          <tr><th />{ATTENDANCE_MONTHS.map((m) => <th key={m.key}>{m.label}</th>)}<th>Total</th></tr>
        </thead>
        <tbody>
          {attendanceRows.map(([label, field]) => (
            <tr key={field}>
              <td className="sf9-subject">{label}</td>
              {ATTENDANCE_MONTHS.map((m) => <td key={m.key}>{ed(student.attendance?.[field]?.[m.key] ?? '', (v) => attendance(field, m.key, v), '', `${label} in ${m.label}`)}</td>)}
              <td className="sf9-final">{sum(student.attendance?.[field] || {})}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="sf9-table sf9-values">
        <thead>
          <tr><th colSpan={6} className="sf9-caption">REPORT ON LEARNER&apos;S OBSERVED VALUES</th></tr>
          <tr><th>Core values</th><th>Behavior statements</th><th colSpan={4}>Quarter</th></tr>
          <tr><th /><th />{[1, 2, 3, 4].map((q) => <th key={q}>{q}</th>)}</tr>
        </thead>
        <tbody>
          {VALUES.flatMap(([key, name, statements]) => statements.map((statement, i) => (
            <tr key={`${key}-${i}`}>
              {i === 0 && <td rowSpan={2} className="sf9-core">{name}</td>}
              <td className="sf9-subject">{statement}</td>
              {['q1', 'q2', 'q3', 'q4'].map((q) => (
                <td key={q} className="sf9-final">
                  <button type="button" className="sf9-rating" title="Tap to change: AO, SO, RO, NO" aria-label={`${name} quarter ${q.slice(1)}: ${rate(key, q) || 'not set'}. Tap to change`} onClick={() => cycle(key, q)}>{rate(key, q) || '-'}</button>
                </td>
              ))}
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
}
