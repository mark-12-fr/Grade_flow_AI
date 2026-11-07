'use client';

import { useReadProgress } from '@/lib/progress';

const STEPS: Record<'sf9' | 'sf10' | 'sheet', string[]> = {
  sf9: ['Uploading your file', 'Reading the sheet', 'AI is finding the learners and subjects', 'Copying the grades into the report cards'],
  sf10: ['Uploading your file', 'Reading the sheets', 'AI is reading the SF10 details', 'Building the permanent records'],
  sheet: ['Opening the sheet', 'AI is mapping the columns', 'Copying each learner\'s grades', 'Building one SF10 per learner']
};
const STARTS = [0, 25, 40, 90]; // percent at which each step begins; the percent itself is real (see lib/progress.ts)

/** Shows a file being read: spinner, the real percent, the current stage, a step checklist and the file name. */
export function Reading({ fileName, kind }: { fileName: string; kind: 'sf9' | 'sf10' | 'sheet' }) {
  const { percent, label } = useReadProgress();
  const steps = STEPS[kind];
  const stage = percent >= 100 ? steps.length : STARTS.filter((s) => percent >= s).length - 1;
  return (
    <div className="reading" role="status" aria-live="polite">
      <div className="reading-head">
        <span className="reading-spinner" aria-hidden="true" />
        <div className="reading-text">
          <strong className="reading-step">{label || steps[0]}{percent < 100 && <span className="reading-dots" aria-hidden="true" />}</strong>
          <span className="reading-file">{fileName}</span>
        </div>
        <span className="reading-time"><strong>{percent}%</strong></span>
      </div>
      <div className="reading-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%`, animation: 'none', background: 'var(--blue)', transition: 'width 0.3s var(--ease-soft)' }} />
      </div>
      <ol className="reading-steps" aria-hidden="true">
        {steps.map((text, i) => (
          <li key={text} className={i < stage ? 'done' : i === stage ? 'current' : ''}>{text.replace(/^AI is /, '')}</li>
        ))}
      </ol>
    </div>
  );
}
