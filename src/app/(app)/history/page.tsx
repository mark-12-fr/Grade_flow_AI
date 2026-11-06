'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { formatDate, prettyYear } from '@/lib/format';
import { useAppState } from '@/lib/store';

export default function HistoryPage() {
  const state = useAppState();
  const count = state.students.length;
  return (
    <section className="page active" aria-labelledby="history-title">
      <div className="page-heading">
        <div>
          <h1 id="history-title">Report history</h1>
          <p>Pick up where you left off.</p>
        </div>
        <span className="pill pill-blue">Your workspace</span>
      </div>
      <article className="card workspace-card">
        <div className="card-heading">
          <h2>Report sets</h2>
          <p>Reports and drafts available in this browser session.</p>
        </div>
        <div className="history-list">
          <div className="history-row">
            <span className="history-icon"><Icon name="file-text" /></span>
            <div className="history-copy">
              <strong>{state.term} reports</strong>
              <span>
                {state.generated
                  ? `${state.className} · ${count} report${count === 1 ? '' : 's'} · Generated ${formatDate(state.generatedAt)}`
                  : `${state.className} · ${state.term} · ${prettyYear(state.year)} · Not generated yet`}
              </span>
            </div>
            <span className={`status-badge ${state.generated ? 'status-approved' : 'status-needs'}`}>{state.generated ? 'Ready' : 'Draft'}</span>
            <Link className="btn btn-secondary btn-sm" href={state.generated ? '/generated-reports' : '/upload'}>
              {state.generated ? 'Open current reports' : 'Continue workflow'}
            </Link>
          </div>
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
