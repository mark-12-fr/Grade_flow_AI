'use client';

/** The progress card shown while a file is being read: percent, stage, steps and a Cancel button. */

import { useEffect, useRef, useState } from 'react';
import { cancelRead, useReadProgress } from '@/lib/state/progress';

const STEPS: Record<'sf9' | 'sf10' | 'sheet', string[]> = {
  sf9: ['Uploading your file', 'Reading the sheet', 'Finding the learners and subjects', 'Copying the grades into the report cards'],
  sf10: ['Uploading your file', 'Reading the sheets', 'Reading the SF10 details', 'Building the permanent records'],
  sheet: ['Opening the sheet', 'Mapping the columns', 'Copying each learner\'s grades', 'Building one SF10 per learner']
};
const STARTS = [0, 25, 40, 90]; // percent at which each step begins; the percent itself is real (see lib/progress.ts)

/** Shows a file being read: spinner, the real percent, the current stage, a step checklist and the file name. */
export function Reading({ fileName, kind }: { fileName: string; kind: 'sf9' | 'sf10' | 'sheet' }) {
  const { percent: real, label } = useReadProgress();
  // The number glides 1 -> 100 instead of jumping between the server's stages. It never passes the real
  // progress by more than a small margin, and it only reaches 100 once the real result has arrived.
  const [percent, setPercent] = useState(0);
  const target = useRef(real);
  target.current = real;
  useEffect(() => {
    let slow = 0;
    const id = window.setInterval(() => {
      setPercent((d) => {
        const t = target.current;
        if (t >= 100) return Math.min(100, d + Math.max(2, Math.ceil((100 - d) / 4)));
        if (d < t) return Math.min(t, d + Math.max(1, Math.ceil((t - d) / 6)));
        slow += 40;
        if (d < Math.min(99, t + 12) && slow >= 600) { slow = 0; return d + 1; } // waiting on the AI: keep moving, slowly
        return d;
      });
    }, 40);
    return () => window.clearInterval(id);
  }, []);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 25_000);
    return () => window.clearTimeout(id);
  }, []);
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
        <button type="button" className="btn btn-secondary btn-sm reading-cancel" onClick={cancelRead}>Cancel</button>
      </div>
      <div className="reading-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%`, animation: 'none', background: 'var(--blue)', transition: 'width 0.3s var(--ease-soft)' }} />
      </div>
      {slow && percent < 100 && <p className="reading-slow">This is taking longer than usual. The free AI can be slow when many people use it. You can keep waiting or press Cancel and try again.</p>}
      <ol className="reading-steps" aria-hidden="true">
        {steps.map((text, i) => (
          <li key={text} className={i < stage ? 'done' : i === stage ? 'current' : ''}>{text}</li>
        ))}
      </ol>
    </div>
  );
}
