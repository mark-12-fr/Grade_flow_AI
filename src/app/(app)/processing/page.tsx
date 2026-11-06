'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { useUi } from '@/components/Providers';
import { missingGradeCells } from '@/lib/grading';
import { getState, setState, useAppState } from '@/lib/store';

const STAGES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'file-text', title: 'Read your grade sheet', text: 'Students and subjects are matched to your class.' },
  { icon: 'users', title: 'Validate student data', text: 'Names, roll numbers, and required subjects are checked.' },
  { icon: 'clipboard-check', title: 'Check names and grades', text: 'Missing or unusual scores are flagged for you.' },
  { icon: 'message', title: 'Prepare student comments', text: 'A thoughtful starting point is drafted for each student.' },
  { icon: 'file-text', title: 'Build report card drafts', text: 'Your class will be ready for your review.' }
];

const stageOf = (progress: number) => (progress >= 100 ? 5 : Math.min(4, Math.floor(progress / 20)));
const statusOf = (progress: number, index: number) =>
  progress >= 100 || progress >= (index + 1) * 20 ? 'done' : index === stageOf(progress) ? 'current' : 'pending';

function copyFor(progress: number, total: number, missing: number) {
  const left = (min: number) => Math.max(min, Math.ceil((100 - progress) / 20));
  const learners = (suffix: string) => `${total} learner${total === 1 ? '' : 's'}${suffix}`;
  if (progress >= 100) return { headline: 'Your reports are ready', subtitle: 'Every grade is ready for your final check.', count: `All ${total} learner${total === 1 ? ' record' : ' records'} prepared`, eta: 'Ready when you are. Review the preview next.' };
  if (progress >= 80) return { headline: 'Building your report card drafts', subtitle: 'Putting the final pages together for your review.', count: `${total} learner${total === 1 ? ' summary' : ' summaries'} prepared`, eta: `Almost there. About ${left(1)} seconds remaining.` };
  if (progress >= 60) {
    const prepared = Math.min(total, Math.round(((progress - 60) / 20) * total));
    return { headline: 'Your reports are taking shape', subtitle: 'Preparing learner summaries from the imported grades...', count: `${prepared} of ${total} learner${total === 1 ? ' summary' : ' summaries'} prepared`, eta: `About ${left(2)} seconds remaining. You don't need to do anything yet.` };
  }
  if (progress >= 40) return { headline: 'Checking every grade', subtitle: missing ? `${missing} missing grade${missing === 1 ? ' was' : 's were'} flagged for your review.` : 'All grade values look complete.', count: 'Grades checked', eta: `About ${left(2)} seconds remaining.` };
  if (progress >= 20) return { headline: 'Learners and subjects found', subtitle: 'Validating names, roll numbers, and imported class details.', count: learners(' found'), eta: `About ${left(2)} seconds remaining.` };
  return { headline: 'Your reports are taking shape', subtitle: 'Checking the uploaded workbook and organizing grade data...', count: 'Organizing the class workbook', eta: 'Final checks take a few seconds.' };
}

export default function ProcessingPage() {
  const router = useRouter();
  const { toast, openModal } = useUi();
  const state = useAppState();
  const progress = Math.max(0, Math.min(100, state.progress));
  const total = state.students.length || state.sf10Students.length;
  const copy = copyFor(progress, total, missingGradeCells(state.students).length);

  // Run the (short) preparation once when the page opens.
  useEffect(() => {
    const s = getState();
    if (s.processing || s.processed) return;
    if (!s.students.length && !s.sf10Students.length) { toast('Add a grade sheet before processing.', 'error'); return; }
    setState({ processing: true, processed: false, progress: 0, generated: false, generatedAt: null });
    const timer = window.setInterval(() => {
      const next = Math.min(100, getState().progress + 4);
      if (next >= 100) {
        window.clearInterval(timer);
        setState({ processing: false, progress: 100, processed: true });
        toast('Draft ready. Review every grade before generating reports.');
      } else {
        setState({ progress: next });
      }
    }, 150);
    return () => {
      window.clearInterval(timer);
      if (getState().processing) setState({ processing: false, progress: 0 });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = () => {
    if (!state.processing) { router.push('/upload'); return; }
    openModal({
      title: 'Stop processing?',
      body: <p>You can start again from the upload screen. Your grade sheet will not be changed.</p>,
      confirmLabel: 'Stop processing', cancelLabel: 'Keep going', tone: 'danger',
      onConfirm: () => { setState({ processing: false, progress: 0 }); toast('Processing stopped. Your file is still ready to use.', 'info'); router.push('/upload'); }
    });
  };

  return (
    <section className="page active" aria-labelledby="processing-title">
      <div className="page-heading">
        <div>
          <h1 id="processing-title">Your class reports are being prepared.</h1>
          <p>Your imported files are being checked for missing or invalid grades.</p>
        </div>
        <span className="pill pill-blue"><Icon name="lock" /> Processing securely</span>
      </div>
      <div className="processing-layout">
        <article className={`card processing-main${state.processing ? ' is-running' : ''}`}>
          <div className="processing-hero">
            <div className="progress-ring" style={{ ['--progress' as string]: String(progress) }}>
              <span className="progress-ring-inner"><Icon name="sparkles" /></span>
            </div>
            <h2>{copy.headline}</h2>
            <p>{copy.subtitle}</p>
          </div>
          <div className="progress-meta"><span>{copy.count}</span><strong>{Math.round(progress)}%</strong></div>
          <div className="progress-track" role="progressbar" aria-label="Report preparation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="processing-eta">{copy.eta}</p>
          <div className="timeline">
            {STAGES.map((stage, index) => {
              const status = statusOf(progress, index);
              return (
                <div key={stage.title} className={`timeline-item${status === 'done' ? ' done' : ''}${status === 'current' ? ' current' : ''}`}>
                  <span className="timeline-icon"><Icon name={stage.icon} /></span>
                  <div className="timeline-copy"><h3>{stage.title}</h3><p>{stage.text}</p></div>
                  <span className="timeline-status">{status === 'done' ? 'Complete' : status === 'current' ? 'In progress' : 'Up next'}</span>
                </div>
              );
            })}
          </div>
          <div className="simulation-note">
            <Icon name="info" />
            <span><strong>Good to know.</strong> Spreadsheets are read by an AI import service that only maps the columns; every grade is copied from your file and no missing grade is invented.</span>
          </div>
          <div className="processing-actions">
            <button type="button" className="btn btn-secondary" onClick={cancel}>{state.processed ? 'Back to upload' : 'Cancel processing'}</button>
            <button type="button" className="btn btn-primary" disabled={!(state.processed && progress >= 100)} onClick={() => router.push(state.upload ? '/report-card' : '/sf10')}>
              View preview <Icon name="chevron-right" />
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
