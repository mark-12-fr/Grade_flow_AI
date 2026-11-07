'use client';

import { useReadProgress } from '@/lib/progress';

/** Shows a file being read: spinner, the real percent, the current stage and the file name. */
export function Reading({ fileName }: { fileName: string; kind?: 'sf9' | 'sf10' | 'sheet' }) {
  const { percent, label } = useReadProgress();
  return (
    <div className="reading" role="status" aria-live="polite">
      <div className="reading-head">
        <span className="reading-spinner" aria-hidden="true" />
        <div className="reading-text">
          <strong className="reading-step">{label || 'Starting'}{percent < 100 && <span className="reading-dots" aria-hidden="true" />}</strong>
          <span className="reading-file">{fileName}</span>
        </div>
        <span className="reading-time"><strong>{percent}%</strong></span>
      </div>
      <div className="reading-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%`, animation: 'none', background: 'var(--blue)', transition: 'width 0.3s var(--ease-soft)' }} />
      </div>
    </div>
  );
}
