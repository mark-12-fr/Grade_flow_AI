'use client';

import { useEffect, useState } from 'react';

const STAGES: Record<'sf9' | 'sf10' | 'sheet', string[]> = {
  sf9: ['Uploading your file', 'Reading the sheet', 'AI is finding the learners and subjects', 'Copying the grades into the report cards', 'Almost done'],
  sf10: ['Uploading your file', 'Reading the sheets', 'AI is reading the SF10 details', 'Building the permanent records', 'Almost done'],
  sheet: ['Opening the sheet', 'AI is mapping the columns', 'Copying each learner\'s grades', 'Building one SF10 per learner', 'Almost done']
};

/** Shows that a file is being read: spinner, moving bar, rotating steps and a running timer. */
export function Reading({ fileName, kind }: { fileName: string; kind: 'sf9' | 'sf10' | 'sheet' }) {
  const [elapsed, setElapsed] = useState(0); // milliseconds
  useEffect(() => {
    const start = performance.now();
    const id = window.setInterval(() => setElapsed(performance.now() - start), 200);
    return () => window.clearInterval(id);
  }, []);
  const seconds = Math.floor(elapsed / 1000);
  // The server gives no real progress, so the percent eases toward 95% and never claims to be finished.
  const percent = Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed / 12000))));
  const steps = STAGES[kind];
  const stage = Math.min(steps.length - 1, Math.floor(percent / 22));
  return (
    <div className="reading" role="status" aria-live="polite">
      <div className="reading-head">
        <span className="reading-spinner" aria-hidden="true" />
        <div className="reading-text">
          <strong key={stage} className="reading-step">{steps[stage]}<span className="reading-dots" aria-hidden="true" /></strong>
          <span className="reading-file">{fileName}</span>
        </div>
        <span className="reading-time"><strong>{percent}%</strong> · {seconds}s</span>
      </div>
      <div className="reading-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%`, animation: 'none', background: 'var(--blue)', transition: 'width 0.3s var(--ease-soft)' }} />
      </div>
      <ol className="reading-steps" aria-hidden="true">
        {steps.slice(0, 4).map((label, i) => (
          <li key={label} className={i < stage ? 'done' : i === stage ? 'current' : ''}>{label.replace(/^AI is /, '')}</li>
        ))}
      </ol>
    </div>
  );
}
