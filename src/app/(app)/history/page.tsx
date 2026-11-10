'use client';

/** What is loaded in this browser (SF9 and SF10 sets), with delete (and Undo). */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { useUi } from '@/components/layout/Providers';
import { removeSf10Undoable, removeSf9Undoable } from '@/lib/state/actions';
import { formatDate, prettyYear } from '@/lib/domain/format';
import { useAppState } from '@/lib/state/store';

export default function HistoryPage() {
  const state = useAppState();
  const { toast, openModal } = useUi();
  const count = state.students.length;
  const sf10Count = state.sf10Students.length;

  function confirmDelete(what: string, detail: string, onDelete: () => () => void) {
    openModal({
      title: `Delete ${what}?`,
      body: <p>{detail} This removes it from this browser. Your original file is not changed, and you can upload it again. Right after deleting, you can press Undo.</p>,
      confirmLabel: 'Delete', cancelLabel: 'Keep it', tone: 'danger',
      onConfirm: () => { const undo = onDelete(); toast(`${what[0].toUpperCase()}${what.slice(1)} deleted.`, 'info', { label: 'Undo', onClick: undo }); }
    });
  }

  return (
    <section className="page active" aria-labelledby="history-title">
      <div className="page-heading">
        <div>
          <h1 id="history-title">Report history</h1>
          <p>Reports you have generated before.</p>
        </div>
        <span className="pill pill-blue">Your workspace</span>
      </div>
      <article className="card workspace-card">
        <div className="card-heading">
          <h2>Report sets</h2>
          <p>Reports and drafts available in this browser session.</p>
        </div>
        <div className="history-list">
          {count > 0 && (
            <div className="history-row">
              <span className="history-icon"><Icon name="file-text" /></span>
              <div className="history-copy">
                <strong>{state.term} SF9 reports</strong>
                <span>
                  {state.generated
                    ? `${state.className} · ${count} report${count === 1 ? '' : 's'} · Generated ${formatDate(state.generatedAt)}`
                    : `${state.className} · ${state.term} · ${prettyYear(state.year)} · Not generated yet`}
                </span>
              </div>
              <span className={`status-badge ${state.generated ? 'status-approved' : 'status-needs'}`}>{state.generated ? 'Ready' : 'Draft'}</span>
              <Link className="btn btn-secondary btn-sm" href={state.generated ? '/generated-reports' : '/report-card'}>
                {state.generated ? 'Open current reports' : 'Continue'}
              </Link>
              <button type="button" className="btn btn-secondary btn-sm" aria-label="Delete the SF9 reports"
                onClick={() => confirmDelete('the SF9 reports', `${count} learner${count === 1 ? '' : 's'} from ${state.className}.`, removeSf9Undoable)}>
                <Icon name="x" /> Delete
              </button>
            </div>
          )}
          {sf10Count > 0 && (
            <div className="history-row">
              <span className="history-icon"><Icon name="file-text" /></span>
              <div className="history-copy">
                <strong>SF10 permanent records</strong>
                <span>{state.sf10File?.name ?? 'Built from the class grades'} · {sf10Count} learner{sf10Count === 1 ? '' : 's'}</span>
              </div>
              <span className="status-badge status-approved">Ready</span>
              <Link className="btn btn-secondary btn-sm" href="/sf10">Open</Link>
              <button type="button" className="btn btn-secondary btn-sm" aria-label="Delete the SF10 records"
                onClick={() => confirmDelete('the SF10 records', `${sf10Count} learner${sf10Count === 1 ? '' : 's'} read from ${state.sf10File?.name ?? 'the file'}.`, removeSf10Undoable)}>
                <Icon name="x" /> Delete
              </button>
            </div>
          )}
          {count === 0 && sf10Count === 0 && (
            <div className="history-row">
              <span className="history-icon"><Icon name="file-text" /></span>
              <div className="history-copy">
                <strong>Nothing here yet</strong>
                <span>Upload a grade sheet to start a report set.</span>
              </div>
              <Link className="btn btn-primary btn-sm" style={{ gridColumn: '-2 / -1' }} href="/upload">Go to upload</Link>
            </div>
          )}
        </div>
      </article>
      <div className="info-strip">
        <Icon name="info" />
        <div>
          <strong>Saved in this browser</strong>
          <p>Your learners and corrections are kept on this computer, so they are still here after a refresh. They are not sent to anyone, and clearing the browser data removes them.</p>
        </div>
      </div>
    </section>
  );
}
