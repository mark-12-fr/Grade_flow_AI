'use client';

/** The SF10 permanent record as an editable page on screen. The PDF is drawn separately in lib/pdf/sf10.ts. */

import { Editable } from '@/components/ui/Editable';
import { recordFor } from '@/lib/sf10/record';
import type { Sf10Edits } from '@/lib/sf10/edit';
import type { AppState, Student } from '@/lib/domain/types';

const box = (on: unknown) => (on ? '☒' : '☐');
const line = (value: unknown) => (value ? String(value) : '________');
const str = (v: unknown) => (typeof v === 'string' ? v : '');


function BlankRows({ count }: { count: number }) {
  return <>{Array.from({ length: count }, (_, i) => <tr className="sf10-blank" key={i}><td></td><td></td><td></td><td></td><td></td><td></td></tr>)}</>;
}

/** The DepEd SF10-SHS Senior High School Student Permanent Record. */
export function Sf10Sheet({ student, state, edits }: { student: Student; state: AppState; edits?: Sf10Edits }) {
  const rec = recordFor(student, state);
  // With `edits` every value can be typed over in place; without it the record is plain text.
  const ed = (value: unknown, commit: (v: string) => void, className?: string) => (edits ? <Editable value={value == null ? '' : String(value)} onCommit={commit} className={className} /> : (value as string));
  const tick = (on: unknown, key: string) => (edits
    ? <button type="button" className="sf10-tick" aria-pressed={Boolean(on)} aria-label="Tick or untick" onClick={() => edits.eligibility(key, !on)}>{box(on)}</button>
    : box(on));
  const el = rec.eligibility;
  const c = rec.completion;
  const cp = (key: string) => ed(c[key] ?? '', (v) => edits!.completion(key, v));
  return (
    <>
      <div className="sf10-head">
        <span className="sf10-formno">SF10-SHS</span>
        {/* eslint-disable @next/next/no-img-element */}
        <img className="sf10-seal" src="/assets/deped-seal.png" alt="DepEd seal" />
        <div className="sf10-title">
          <p>REPUBLIC OF THE PHILIPPINES</p><p>DEPARTMENT OF EDUCATION</p>
          <h2>SENIOR HIGH SCHOOL STUDENT PERMANENT RECORD</h2>
        </div>
        <img className="sf10-deped" src="/assets/deped-logo.png" alt="DepEd logo" />
        {/* eslint-enable @next/next/no-img-element */}
      </div>
      {!rec.complete && <p className="sf10-incomplete" role="status">Incomplete record: some grades are still missing. Fix them in Grade Verification.</p>}

      <div className="sf10-band">LEARNER&apos;S INFORMATION</div>
      <table className="sf10-info"><tbody>
        <tr><td><b>LAST NAME:</b> {ed(rec.last, (v) => edits!.setName('last', v))}</td><td><b>FIRST NAME:</b> {ed(rec.first, (v) => edits!.setName('first', v))}</td><td><b>MIDDLE NAME:</b> {ed(rec.middle, (v) => edits!.setName('middle', v))}</td></tr>
        <tr><td><b>LRN:</b> {ed(rec.lrn, (v) => edits!.learner((x) => ({ ...x, lrn: v })))}</td><td><b>Date of Birth (MM/DD/YYYY):</b> {ed(rec.birth, (v) => edits!.setBirth(v))}</td><td><b>Sex:</b> {ed(rec.sex, (v) => edits!.learner((x) => ({ ...x, sex: v })))}</td></tr>
      </tbody></table>

      <div className="sf10-band">ELIGIBILITY FOR SHS ENROLMENT</div>
      <table className="sf10-info"><tbody>
        <tr><td>{tick(el.hsCompleter, 'hsCompleter')} High School Completer* &nbsp; Gen. Ave: {edits ? ed(str(el.hsGenAve), (v) => edits.eligibility('hsGenAve', v)) : line(el.hsGenAve)}</td><td>{tick(el.jhsCompleter, 'jhsCompleter')} Junior High School Completer &nbsp; Gen. Ave: {edits ? ed(str(el.jhsGenAve), (v) => edits.eligibility('jhsGenAve', v)) : line(el.jhsGenAve)}</td></tr>
        <tr><td>Date of Graduation/Completion (MM/DD/YYYY): {edits ? ed(str(el.completionDate), (v) => edits.eligibility('completionDate', v)) : line(el.completionDate)}</td><td>Name of School: {edits ? ed(str(el.schoolName), (v) => edits.eligibility('schoolName', v)) : line(el.schoolName)} &nbsp; School Address: {edits ? ed(str(el.schoolAddress), (v) => edits.eligibility('schoolAddress', v)) : line(el.schoolAddress)}</td></tr>
        <tr><td>{tick(el.peptPasser, 'peptPasser')} PEPT Passer** Rating: {edits ? ed(str(el.peptRating), (v) => edits.eligibility('peptRating', v)) : line(el.peptRating)} &nbsp; {tick(el.alsPasser, 'alsPasser')} ALS A&amp;E Passer*** Rating: {edits ? ed(str(el.alsRating), (v) => edits.eligibility('alsRating', v)) : line(el.alsRating)}</td><td>Others (Pls. Specify): {edits ? ed(str(el.others), (v) => edits.eligibility('others', v)) : line(el.others)}</td></tr>
      </tbody></table>

      <div className="sf10-band">SCHOLASTIC RECORD</div>
      {rec.semesters.map((sem, i) => {
        const rem = sem.remedial;
        const rm = (key: 'from' | 'to' | 'school' | 'schoolId' | 'teacher') => (edits ? ed(rem[key], (v) => edits.semester(i, (x) => ({ ...x, remedial: { ...x.remedial, [key]: v } }))) : line(rem[key]));
        const set = (change: Partial<{ school: string; schoolId: string; gradeLevel: string; sy: string; track: string; section: string; average: string; averageAction: string; remarks: string; adviser: string; principal: string; dateChecked: string }>) => edits!.semester(i, (x) => ({ ...x, ...change }));
        return (
          <div key={i}>
            <table className="sf10-info sf10-school"><tbody>
              <tr>
                <td><b>SCHOOL:</b> {ed(sem.school, (v) => set({ school: v }))}</td><td><b>SCHOOL ID:</b> {ed(sem.schoolId, (v) => set({ schoolId: v }))}</td><td><b>GRADE LEVEL:</b> {ed(sem.gradeLevel, (v) => set({ gradeLevel: v }))}</td>
                <td><b>SY:</b> {ed(sem.sy, (v) => set({ sy: v }))}</td><td><b>SEM:</b> {sem.semLabel}</td>
              </tr>
              <tr><td colSpan={3}><b>TRACK/STRAND:</b> {ed(sem.track, (v) => set({ track: v }))}</td><td colSpan={2}><b>SECTION:</b> {ed(sem.section, (v) => set({ section: v }))}</td></tr>
            </tbody></table>
            <table className="sf10-table sf10-grades">
              <thead>
                <tr><th rowSpan={2} className="sf10-cat">Indicate if Subject is CORE, APPLIED, or SPECIALIZED</th><th rowSpan={2}>SUBJECTS</th><th colSpan={2}>Quarter</th><th rowSpan={2}>SEM FINAL GRADE</th><th rowSpan={2}>ACTION TAKEN</th></tr>
                <tr><th>{sem.quarters[0]}</th><th>{sem.quarters[1]}</th></tr>
              </thead>
              <tbody>
                {sem.rows.map((r, k) => (
                  <tr key={k}>
                    <td>{ed(r.category, (v) => edits!.row(i, k, { category: v }))}</td>
                    <td className="sf10-subject">{ed(r.subject, (v) => edits!.row(i, k, { subject: v }))}{edits && <button type="button" className="sf10-remove" aria-label={`Remove ${r.subject || 'this subject'}`} title="Remove this subject" onClick={() => edits.removeRow(i, k)}>×</button>}</td>
                    <td>{ed(r.q1, (v) => edits!.row(i, k, { q1: v }), r.q1 ? '' : 'sf10-missing')}</td><td>{ed(r.q2, (v) => edits!.row(i, k, { q2: v }), r.q2 ? '' : 'sf10-missing')}</td><td>{ed(r.final, (v) => edits!.row(i, k, { final: v }), r.final ? '' : 'sf10-missing')}</td>
                    <td className={r.action === 'FAILED' ? 'sf10-failed' : ''}>{ed(r.action, (v) => edits!.row(i, k, { action: v }))}</td>
                  </tr>
                ))}
                {edits ? <tr className="sf10-add-row"><td colSpan={6}><button type="button" className="sf10-add" onClick={() => edits.addRow(i)}>+ Add a subject</button></td></tr> : <BlankRows count={2} />}
                <tr className="sf10-average"><th colSpan={4} scope="row">General Ave. for the Semester:</th><td>{ed(sem.average, (v) => set({ average: v }))}</td><td>{ed(sem.averageAction, (v) => set({ averageAction: v }))}</td></tr>
              </tbody>
            </table>
            <p className="sf10-remarks"><b>REMARKS:</b> {ed(sem.remarks, (v) => set({ remarks: v }), 'sf10-ed-wide')}</p>
            <table className="sf10-info sf10-sign"><tbody><tr>
              <td><b>Prepared by:</b><span className="sf10-line"></span>{ed(sem.adviser, (v) => set({ adviser: v }))}<small>Signature of Adviser over Printed Name</small></td>
              <td><b>Certified True and Correct:</b><span className="sf10-line"></span>{ed(sem.principal, (v) => set({ principal: v }))}{sem.principal ? ', SHS Principal' : ''}<small>Signature of Authorized Person over Printed Name, Designation</small></td>
              <td><b>Date Checked (MM/DD/YYYY):</b><span className="sf10-line">{ed(sem.dateChecked, (v) => set({ dateChecked: v }))}</span></td>
            </tr></tbody></table>
            <table className="sf10-table sf10-remedial">
              <thead>
                <tr><th colSpan={6} className="sf10-left">REMEDIAL CLASSES &nbsp; Conducted from (MM/DD/YYYY): {rm('from')} to (MM/DD/YYYY): {rm('to')} &nbsp; SCHOOL: {rm('school')} &nbsp; SCHOOL ID: {rm('schoolId')}</th></tr>
                <tr><th>Indicate if Subject is CORE, APPLIED, or SPECIALIZED</th><th>SUBJECTS</th><th>SEM FINAL GRADE</th><th>REMEDIAL CLASS MARK</th><th>RECOMPUTED FINAL GRADE</th><th>ACTION TAKEN</th></tr>
              </thead>
              <tbody>
                {rem.rows.length
                  ? rem.rows.map((r, k) => <tr key={k}><td>{r.category}</td><td className="sf10-subject">{r.subject}</td><td>{r.final}</td><td>{r.remedialMark}</td><td>{r.recomputed}</td><td>{r.action}</td></tr>)
                  : <BlankRows count={3} />}
              </tbody>
            </table>
            <p className="sf10-remarks">Name of Teacher/Adviser: {rm('teacher')} &nbsp; Signature: ____________________</p>
          </div>
        );
      })}

      <div className="sf10-band"></div>
      <table className="sf10-info"><tbody>
        <tr><td><b>Track/Strand Accomplished:</b> {cp('trackAccomplished')}</td><td><b>SHS General Average:</b> {cp('shsAverage')}</td></tr>
        <tr><td><b>Awards/Honors Received:</b> {cp('awards')}</td><td><b>Date of SHS Graduation (MM/DD/YYYY):</b> {cp('graduationDate')}</td></tr>
        <tr><td><b>Certified by:</b><span className="sf10-line"></span>{cp('certifiedBy')}<small>Signature of School Head over Printed Name</small></td><td><b>Place School Seal Here:</b><br /><br /><br /></td></tr>
      </tbody></table>
      <p className="sf10-note"><b>NOTE:</b> This permanent record or a photocopy of this permanent record that bears the seal of the school and the original signature in ink of the School Head shall be considered valid for all legal purposes. Any erasure or alteration made on this copy should be validated by the School Head. If the student transfers to another school, the originating school should produce one (1) certified true copy of this permanent record for safekeeping. The receiving school shall continue filling up the original form. Upon graduation, the school from which the student graduated should keep the original form and produce one (1) certified true copy for the Division Office.</p>
      <p className="sf10-remarks"><b>REMARKS:</b> {cp('remarks')} (Please indicate the purpose for which this permanent record will be used) {cp('purpose')} &nbsp; Date Issued (MM/DD/YYYY): {edits ? cp('dateIssued') : line(c.dateIssued)}</p>
    </>
  );
}
