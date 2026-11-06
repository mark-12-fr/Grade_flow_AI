import Link from 'next/link';
import { Icon } from '@/components/Icon';

const STEPS = [
  ['Upload your grade sheet', 'Upload your SF9 class grade sheet, your SF10 record, or both. CSV and Excel files are supported.'],
  ['Process your class', 'AI maps your spreadsheet columns, then the app checks the data and prepares draft comments.'],
  ['Preview the SF9 and SF10', 'Pick any learner by LRN and review the report card and the permanent record.'],
  ['Fix anything that needs a second look', 'Missing or invalid grades can be corrected in Grade Verification before you generate reports.'],
  ['Generate and print', 'Download a PDF or print the completed reports. Only report pages are sent to the printer.']
];

export default function HelpPage() {
  return (
    <section className="page active" aria-labelledby="help-title">
      <div className="page-heading">
        <div>
          <h1 id="help-title">Help and getting started</h1>
          <p>A simple guide to preparing and printing your class report cards.</p>
        </div>
        <span className="pill pill-blue">Quick-start guide</span>
      </div>
      <article className="card workspace-card help-guide">
        <div className="card-heading">
          <h2>Your report-card workflow</h2>
          <p>Every step stays under your control, from upload through final print.</p>
        </div>
        <ol className="help-steps">
          {STEPS.map(([title, text], i) => (
            <li key={title}><span>{i + 1}</span><div><strong>{title}</strong><p>{text}</p></div></li>
          ))}
        </ol>
      </article>
      <div className="info-card workspace-privacy">
        <Icon name="shield-check" className="info-card-icon" />
        <div>
          <h3>Your student data stays private</h3>
          <p>Spreadsheets are sent to the AI service you configured only to read their layout, and missing grades are never invented. Use fictional data with free AI tiers.</p>
        </div>
      </div>
      <div className="page-actions">
        <Link className="btn btn-primary" href="/upload"><Icon name="upload" /> Go to upload</Link>
      </div>
    </section>
  );
}
