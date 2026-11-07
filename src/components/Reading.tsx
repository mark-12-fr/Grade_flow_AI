'use client';

import { useEffect, useState } from 'react';

const LABEL: Record<'sf9' | 'sf10' | 'sheet', string> = {
  sf9: 'Reading your grade sheet',
  sf10: 'Reading your SF10 file',
  sheet: 'Reading the sheet'
};

/** Shows that a file is being read: spinner, moving bar and a running timer, with one message. */
export function Reading({ fileName, kind }: { fileName: string; kind: 'sf9' | 'sf10' | 'sheet' }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="reading" role="status" aria-live="polite">
      <div className="reading-head">
        <span className="reading-spinner" aria-hidden="true" />
        <div className="reading-text">
          <strong className="reading-step">{LABEL[kind]}<span className="reading-dots" aria-hidden="true" /></strong>
          <span className="reading-file">{fileName}</span>
        </div>
        <span className="reading-time">{seconds}s</span>
      </div>
      <div className="reading-bar" aria-hidden="true"><span /></div>
    </div>
  );
}
