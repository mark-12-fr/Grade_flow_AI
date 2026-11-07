'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/Providers';
import { removeSf10, removeSf9 } from '@/lib/actions';
import { formatDate, prettyYear } from '@/lib/format';
import { useAppState } from '@/lib/store';

export default function HistoryPage() {
  const state = useAppState();
  const { toast, openModal } = useUi();
  const count = state.students.length;
  const sf10Count = state.sf10Students.length;

  function confirmDelete(what: string, detail: string, onDelete: () => void) {
    openModal({
      title: `Delete ${what}?`,
      body: <p>{detail} This removes it from this browser session. Your original file is not changed, and you can upload it again.</p>,
      confirmLabel: 'Delete', cancelLabel: 'Keep it', tone: 'danger',
      onConfirm: () => { onDelete(); toast(`${what[0].toUpperCase()}${what.slice(1)} deleted.`, 'info'); }
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
                onClick={() => confirmDelete('the SF9 reports', `${count} learner${count === 1 ? '' : 's'} from ${state.className}.`, removeSf9)}>
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
                onClick={() => confirmDelete('the SF10 records', `${sf10Count} learner${sf10Count === 1 ? '' : 's'} read from ${state.sf10File?.name ?? 'the file'}.`, removeSf10)}>
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
          <strong>Saved for this workspace session</strong>
          <p>Generated reports are available while this page remains open.</p>
        </div>
      </div>
    </section>
  );
}
