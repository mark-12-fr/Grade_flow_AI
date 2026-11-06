import { Fragment } from 'react';
import { ATTENDANCE_MONTHS, SEMESTERS, SUBJECTS } from '@/lib/curriculum';
import { prettyYear } from '@/lib/format';
import { remarkFor, semesterAverage, type ReportContext } from '@/lib/grading';
import type { SchoolInfo, Student } from '@/lib/types';

const VALUE_LABELS: [string, string][] = [
  ['makaDiyos', '1. Maka-Diyos'], ['makatao', '2. Makatao'], ['makakalikasan', '3. Maka kalikasan'], ['makabansa', '4. Makabansa']
];
const STATEMENTS: Record<string, [string, string]> = {
  makaDiyos: ["Expresses one's spiritual beliefs while respecting the spiritual beliefs of others", 'Demonstrates adherence to ethical principles by upholding truth'],
  makatao: ['Is sensitive to individual, social, and cultural differences', 'Demonstrates contributions toward solidarity'],
  makakalikasan: ['Cares for the environment and utilizes resources wisely, judiciously, and economically', 'Demonstrates stewardship in keeping a flourishing environment'],
  makabansa: ['Demonstrates pride in being a Filipino; expresses the rights and responsibilities of a Filipino citizen', 'Demonstrates appropriate behavior in carrying out activities in the school, community, and country']
};

const gradeText = (value: unknown) => (value === null || value === undefined || value === '' || Number.isNaN(Number(value)) ? '—' : String(value));

function TransferRows({ fields }: { fields: [string, string | undefined][] }) {
  return <>{fields.map(([label, value]) => <tr key={label}><th scope="row">{label}:</th><td>{value || ''}</td></tr>)}</>;
}

/** The SF9 learner report card (front of the card), same layout as the printed form. */
export function ReportCard({ student, context, school }: { student: Student; context: ReportContext; school: SchoolInfo }) {
  const transfer = student.transfer || {};
  const addressLines = String(context.schoolAddress || '').split(' · ').filter(Boolean)
    .filter((line) => !line.toLowerCase().includes('senior high school department'));
  const attendance = student.attendance;
  const attendanceRows: [string, Record<string, number | null | undefined>][] = [
    ['No. of school days', attendance.schoolDays || {}], ['No. of days present', attendance.months || {}], ['No. of days absent', attendance.absent || {}]
  ];

  return (
    <div className="rc-official-layout">
      <section className="rc-official-learner" aria-label="Learner details and observations">
        <div className="rc-official-school">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="rc-logo" src={school.logo || '/assets/ui-logo.png'} alt="School seal" />
          <div>
            {addressLines.map((line) => <span key={line}>{line}</span>)}
            <strong>{context.schoolName}</strong>
            <span>Senior High School Department</span>
          </div>
        </div>
        <div className="rc-official-fields">
          <div className="rc-official-field rc-official-name"><span>Name:</span><strong>{student.name}</strong></div>
          <div className="rc-official-field"><span>Age:</span><strong>{student.age || '—'}</strong></div>
          <div className="rc-official-field"><span>Sex:</span><strong>{student.sex || '—'}</strong></div>
          <div className="rc-official-field"><span>Grade:</span><strong>{context.gradeLevel}</strong></div>
          <div className="rc-official-field"><span>Section:</span><strong>{context.section}</strong></div>
          <div className="rc-official-field"><span>School Year:</span><strong>{prettyYear(context.year)}</strong></div>
          <div className="rc-official-field"><span>LRN:</span><strong>{student.lrn || '—'}</strong></div>
          <div className="rc-official-field rc-official-track"><span>Track/Strand:</span><strong>{context.trackStrand || context.strand || '—'}</strong></div>
        </div>
        <div className="rc-official-note">
          <strong>Dear Parent:</strong>
          <p>This report card shows your child’s performance in the different learning areas as well as in character formation.</p>
          <p>The school welcomes you if you desire to know more about the progress of your child.</p>
        </div>
        <section className="rc-transfer">
          <div className="rc-cert-signatories">
            <div><strong>{context.teacher || ''}</strong><span>Adviser</span></div>
            <div><strong>{context.principal || ''}</strong><span>Principal</span></div>
          </div>
          <div className="rc-transfer-grid">
            <div className="rc-transfer-panel">
              <h4>Certificate of Transfer</h4>
              <table><tbody>
                <TransferRows fields={[['Admitted to', transfer.admittedTo], ['Section', transfer.section || context.section], ['Eligibility for Admission to Grade', transfer.eligibilityForGrade], ['Approved', transfer.approvedBy]]} />
                <tr className="rc-transfer-signature"><td colSpan={2}><div className="rc-signature-pair"><span>Adviser</span><span>Principal</span></div></td></tr>
              </tbody></table>
            </div>
            <div className="rc-transfer-panel">
              <h4>Cancellation of Eligibility to Transfer</h4>
              <table><tbody>
                <TransferRows fields={[['Admitted in', transfer.admittedIn], ['Date', transfer.transferDate]]} />
                <tr className="rc-transfer-spacer"><td colSpan={2}></td></tr>
                <tr className="rc-transfer-signature"><td colSpan={2}><div className="rc-signature-single"><span>Principal</span></div></td></tr>
              </tbody></table>
            </div>
          </div>
        </section>
        <div className="rc-attendance-wrap">
          <table className="rc-attendance-table">
            <caption>Report of attendance</caption>
            <colgroup><col className="rc-attendance-label" />{ATTENDANCE_MONTHS.map((m) => <col key={m.key} />)}<col className="rc-attendance-total" /></colgroup>
            <thead><tr><th scope="col"></th>{ATTENDANCE_MONTHS.map((m) => <th key={m.key} scope="col">{m.label}</th>)}<th scope="col">Total</th></tr></thead>
            <tbody>
              {attendanceRows.map(([label, bag]) => {
                const values = ATTENDANCE_MONTHS.map((m) => bag[m.key]);
                const total = values.reduce((sum: number, v) => sum + (Number(v) || 0), 0);
                const hasValue = values.some((v) => v !== null && v !== undefined && (v as unknown) !== '');
                return (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    {values.map((v, i) => <td key={i}>{v == null || (v as unknown) === '' ? '' : String(v)}</td>)}
                    <td>{hasValue ? String(total) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="rc-official-values-wrap">
          <table className="rc-official-values">
            <caption>Report on learner’s observed values</caption>
            <colgroup><col className="rc-values-core" /><col className="rc-values-statement" /><col span={4} className="rc-values-quarter" /></colgroup>
            <thead>
              <tr><th scope="col">Core values</th><th scope="col">Behavior Statements</th><th colSpan={4} scope="colgroup">Quarter</th></tr>
              <tr><th></th><th></th><th scope="col">1</th><th scope="col">2</th><th scope="col">3</th><th scope="col">4</th></tr>
            </thead>
            <tbody>
              {VALUE_LABELS.map(([key, label]) => {
                const values = (student.observedValues && student.observedValues[key]) || {};
                const cells = ['q1', 'q2', 'q3', 'q4'].map((p) => <td key={p}>{values[p] || ''}</td>);
                return (
                  <Fragment key={key}>
                    <tr><th scope="rowgroup" rowSpan={2}>{label}</th><td>{STATEMENTS[key][0]}</td>{cells}</tr>
                    <tr><td>{STATEMENTS[key][1]}</td>{cells}</tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rc-official-grades" aria-label="Learning progress and achievement">
        <div className="rc-official-title"><strong>REPORT ON LEARNING PROGRESS AND ACHIEVEMENT</strong></div>
        {SEMESTERS.map((semester) => {
          const avg = semesterAverage(student, semester.key);
          return (
            <section className="rc-semester" key={semester.key}>
              <h4>{semester.label}</h4>
              <table className="rc-table rc-official-grade-table">
                <caption className="sr-only">{semester.label} subjects and grades</caption>
                <colgroup><col className="rc-col-subject" /><col className="rc-col-score" /><col className="rc-col-score" /><col className="rc-col-final" /><col className="rc-col-remarks" /></colgroup>
                <thead>
                  <tr><th rowSpan={2} scope="col">Subjects</th><th colSpan={2} scope="colgroup">Quarter</th><th rowSpan={2} scope="col">Semester<br />Final Grade</th><th rowSpan={2} scope="col">Remarks</th></tr>
                  <tr><th scope="col">{semester.quarterLabels[0]}</th><th scope="col">{semester.quarterLabels[1]}</th></tr>
                </thead>
                <tbody>
                  {semester.groups.map((group) => (
                    <Fragment key={group.name}>
                      <tr className="rc-subject-group"><th colSpan={5}>{group.name}</th></tr>
                      {group.subjects.map(([key]) => {
                        const subject = SUBJECTS.find((s) => s.key === key)!;
                        const grades = student.grades[subject.key] || {};
                        const remark = remarkFor(grades.final);
                        return (
                          <tr key={key}>
                            <td>{subject.name}</td>
                            <td className="rc-score">{gradeText(grades[semester.quarters[0]])}</td>
                            <td className="rc-score">{gradeText(grades[semester.quarters[1]])}</td>
                            <td className="rc-score rc-semester-final">{gradeText(grades.final)}</td>
                            <td className={`rc-remarks rc-remarks-${remark.toLowerCase()}`}>{remark}</td>
                          </tr>
                        );
                      })}
                      <tr className="rc-grade-spacer"><td colSpan={5}></td></tr>
                    </Fragment>
                  ))}
                  <tr className="rc-semester-average">
                    <th colSpan={3} scope="row">General Average for the Semester</th>
                    <td>{avg === null ? '—' : String(avg)}</td>
                    <td className="rc-remarks">{remarkFor(avg)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          );
        })}
        <div className="rc-official-legends">
          <table><caption>Observed values</caption><tbody>
            <tr><th>AO</th><td>Always Observed</td></tr><tr><th>SO</th><td>Sometimes Observed</td></tr>
            <tr><th>RO</th><td>Rarely Observed</td></tr><tr><th>NO</th><td>Not Observed</td></tr>
          </tbody></table>
          <table><caption>Learning Progress &amp; Achievement</caption><tbody>
            <tr><td>Outstanding</td><td>90–100</td><td>Passed</td></tr><tr><td>Very Satisfactory</td><td>85–89</td><td>Passed</td></tr>
            <tr><td>Satisfactory</td><td>80–84</td><td>Passed</td></tr><tr><td>Fairly Satisfactory</td><td>75–79</td><td>Passed</td></tr>
            <tr><td>Did Not Meet Expectations</td><td>below 75</td><td>Failed</td></tr>
          </tbody></table>
          <table className="rc-parent-signatures"><caption>Parent/Guardian’s<br />Signature</caption><tbody>
            <tr><th>1st Q</th><td></td></tr><tr><th>2nd Q</th><td></td></tr><tr><th>3rd Q</th><td></td></tr><tr><th>4th Q</th><td></td></tr>
          </tbody></table>
        </div>
      </section>
    </div>
  );
}
