import { recordFor } from '@/lib/sf10Record';
import type { AppState, Student } from '@/lib/types';

const box = (on: unknown) => (on ? '☒' : '☐');
const line = (value: unknown) => (value ? String(value) : '________');
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function BlankRows({ count }: { count: number }) {
  return <>{Array.from({ length: count }, (_, i) => <tr className="sf10-blank" key={i}><td></td><td></td><td></td><td></td><td></td><td></td></tr>)}</>;
}

/** The DepEd SF10-SHS Senior High School Student Permanent Record. */
export function Sf10Sheet({ student, state }: { student: Student; state: AppState }) {
  const rec = recordFor(student, state);
  const el = rec.eligibility;
  const c = rec.completion;
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
        <tr><td><b>LAST NAME:</b> {rec.last}</td><td><b>FIRST NAME:</b> {rec.first}</td><td><b>MIDDLE NAME:</b> {rec.middle}</td></tr>
        <tr><td><b>LRN:</b> {rec.lrn}</td><td><b>Date of Birth (MM/DD/YYYY):</b> {rec.birth}</td><td><b>Sex:</b> {rec.sex}</td></tr>
      </tbody></table>

      <div className="sf10-band">ELIGIBILITY FOR SHS ENROLMENT</div>
      <table className="sf10-info"><tbody>
        <tr><td>{box(el.hsCompleter)} High School Completer* &nbsp; Gen. Ave: {line(el.hsGenAve)}</td><td>{box(el.jhsCompleter)} Junior High School Completer &nbsp; Gen. Ave: {line(el.jhsGenAve)}</td></tr>
        <tr><td>Date of Graduation/Completion (MM/DD/YYYY): {line(el.completionDate)}</td><td>Name of School: {line(el.schoolName)} &nbsp; School Address: {line(el.schoolAddress)}</td></tr>
        <tr><td>{box(el.peptPasser)} PEPT Passer** Rating: {line(el.peptRating)} &nbsp; {box(el.alsPasser)} ALS A&amp;E Passer*** Rating: {line(el.alsRating)}</td><td>Others (Pls. Specify): {line(el.others)}</td></tr>
      </tbody></table>

      <div className="sf10-band">SCHOLASTIC RECORD</div>
      {rec.semesters.map((sem, i) => {
        const rem = sem.remedial;
        return (
          <div key={i}>
            <table className="sf10-info sf10-school"><tbody>
              <tr>
                <td><b>SCHOOL:</b> {sem.school}</td><td><b>SCHOOL ID:</b> {sem.schoolId}</td><td><b>GRADE LEVEL:</b> {sem.gradeLevel}</td>
                <td><b>SY:</b> {sem.sy}</td><td><b>SEM:</b> {sem.semLabel}</td>
              </tr>
              <tr><td colSpan={3}><b>TRACK/STRAND:</b> {sem.track}</td><td colSpan={2}><b>SECTION:</b> {sem.section}</td></tr>
            </tbody></table>
            <table className="sf10-table sf10-grades">
              <thead>
                <tr><th rowSpan={2} className="sf10-cat">Indicate if Subject is CORE, APPLIED, or SPECIALIZED</th><th rowSpan={2}>SUBJECTS</th><th colSpan={2}>Quarter</th><th rowSpan={2}>SEM FINAL GRADE</th><th rowSpan={2}>ACTION TAKEN</th></tr>
                <tr><th>{sem.quarters[0]}</th><th>{sem.quarters[1]}</th></tr>
              </thead>
              <tbody>
                {sem.rows.map((r, k) => (
                  <tr key={k}>
                    <td>{r.category}</td><td className="sf10-subject">{r.subject}</td><td>{r.q1}</td><td>{r.q2}</td><td>{r.final}</td>
                    <td className={r.action === 'FAILED' ? 'sf10-failed' : ''}>{r.action}</td>
                  </tr>
                ))}
                <BlankRows count={2} />
                <tr className="sf10-average"><th colSpan={4} scope="row">General Ave. for the Semester:</th><td>{sem.average}</td><td>{sem.averageAction}</td></tr>
              </tbody>
            </table>
            <p className="sf10-remarks"><b>REMARKS:</b> {sem.remarks}</p>
            <table className="sf10-info sf10-sign"><tbody><tr>
              <td><b>Prepared by:</b><span className="sf10-line"></span>{sem.adviser}<small>Signature of Adviser over Printed Name</small></td>
              <td><b>Certified True and Correct:</b><span className="sf10-line"></span>{sem.principal}{sem.principal ? ', SHS Principal' : ''}<small>Signature of Authorized Person over Printed Name, Designation</small></td>
              <td><b>Date Checked (MM/DD/YYYY):</b><span className="sf10-line">{sem.dateChecked}</span></td>
            </tr></tbody></table>
            <table className="sf10-table sf10-remedial">
              <thead>
                <tr><th colSpan={6} className="sf10-left">REMEDIAL CLASSES &nbsp; Conducted from (MM/DD/YYYY): {line(rem.from)} to (MM/DD/YYYY): {line(rem.to)} &nbsp; SCHOOL: {line(rem.school)} &nbsp; SCHOOL ID: {line(rem.schoolId)}</th></tr>
                <tr><th>Indicate if Subject is CORE, APPLIED, or SPECIALIZED</th><th>SUBJECTS</th><th>SEM FINAL GRADE</th><th>REMEDIAL CLASS MARK</th><th>RECOMPUTED FINAL GRADE</th><th>ACTION TAKEN</th></tr>
              </thead>
              <tbody>
                {rem.rows.length
                  ? rem.rows.map((r, k) => <tr key={k}><td>{r.category}</td><td className="sf10-subject">{r.subject}</td><td>{r.final}</td><td>{r.remedialMark}</td><td>{r.recomputed}</td><td>{r.action}</td></tr>)
                  : <BlankRows count={3} />}
              </tbody>
            </table>
            <p className="sf10-remarks">Name of Teacher/Adviser: {line(rem.teacher)} &nbsp; Signature: ____________________</p>
          </div>
        );
      })}

      <div className="sf10-band"></div>
      <table className="sf10-info"><tbody>
        <tr><td><b>Track/Strand Accomplished:</b> {c.trackAccomplished}</td><td><b>SHS General Average:</b> {c.shsAverage}</td></tr>
        <tr><td><b>Awards/Honors Received:</b> {c.awards}</td><td><b>Date of SHS Graduation (MM/DD/YYYY):</b> {c.graduationDate}</td></tr>
        <tr><td><b>Certified by:</b><span className="sf10-line"></span>{c.certifiedBy}<small>Signature of School Head over Printed Name</small></td><td><b>Place School Seal Here:</b><br /><br /><br /></td></tr>
      </tbody></table>
      <p className="sf10-note"><b>NOTE:</b> This permanent record or a photocopy of this permanent record that bears the seal of the school and the original signature in ink of the School Head shall be considered valid for all legal purposes. Any erasure or alteration made on this copy should be validated by the School Head. If the student transfers to another school, the originating school should produce one (1) certified true copy of this permanent record for safekeeping. The receiving school shall continue filling up the original form. Upon graduation, the school from which the student graduated should keep the original form and produce one (1) certified true copy for the Division Office.</p>
      <p className="sf10-remarks"><b>REMARKS:</b> {c.remarks} (Please indicate the purpose for which this permanent record will be used) {c.purpose} &nbsp; Date Issued (MM/DD/YYYY): {line(c.dateIssued)}</p>
    </>
  );
}
