/** Help: the workflow, a glossary of terms and the keyboard shortcuts. */
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

const STEPS = [
  ['Upload your grade sheet', 'Upload your SF9 class grade sheet, your SF10 record, or both. CSV and Excel files are supported. The columns are mapped automatically and every grade is copied from your file.'],
  ['Preview the SF9 and SF10', 'Pick any learner by LRN and review the report card and the permanent record.'],
  ['Fix anything that needs a second look', 'Missing or invalid grades can be corrected in Grade Verification before you generate reports.'],
  ['Generate and print', 'Download a PDF or print the completed reports. Only report pages are sent to the printer.']
];

const TERMS = [
  ['SF9', "Learner's Progress Report Card, given to the learner every school year."],
  ['SF10', "Learner's Permanent Record, which follows the learner from school to school."],
  ['LRN', 'Learner Reference Number, the 12-digit ID the DepEd gives each learner.'],
  ['AO / SO / RO / NO', 'Observed values ratings: Always, Sometimes, Rarely or Not Observed. Teachers rate each core value every quarter.'],
  ['General average', "The average of the learner's final grades across all subjects."]
];

const SHORTCUTS = [
  ['← / →', 'Previous or next learner on the SF9 and SF10 pages (not while typing in a box).'],
  ['Alt + ← / →', 'Previous or next learner in Grade verification, even while typing a grade.'],
  ['Ctrl + S', 'Save right now. Changes are also saved by themselves a moment after you make them.'],
  ['Enter / Esc', 'Save or cancel when editing a value on the report card or the permanent record.']
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
          <p>Every step stays under your control, from upload to print.</p>
        </div>
        <ol className="help-steps">
          {STEPS.map(([title, text], i) => (
            <li key={title}><span>{i + 1}</span><div><strong>{title}</strong><p>{text}</p></div></li>
          ))}
        </ol>
      </article>
      <article className="card workspace-card help-guide">
        <div className="card-heading">
          <h2>Words you will see</h2>
          <p>A quick reminder of the terms used in the app.</p>
        </div>
        <dl className="help-list">
          {TERMS.map(([term, text]) => <div key={term}><dt>{term}</dt><dd>{text}</dd></div>)}
        </dl>
      </article>
      <article className="card workspace-card help-guide">
        <div className="card-heading">
          <h2>Keyboard shortcuts</h2>
          <p>Handy when you check many learners.</p>
        </div>
        <dl className="help-list">
          {SHORTCUTS.map(([keys, text]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{text}</dd></div>)}
        </dl>
      </article>
      <div className="info-card workspace-privacy">
        <Icon name="shield-check" className="info-card-icon" />
        <div>
          <h3>Your student data stays private</h3>
          <p>The uploaded file is sent to the AI service you configured only to work out its column layout. Missing grades are never invented. Use fictional data with free AI tiers.</p>
        </div>
      </div>
      <div className="page-actions">
        <Link className="btn btn-primary" href="/upload"><Icon name="upload" /> Go to upload</Link>
      </div>
    </section>
  );
}
