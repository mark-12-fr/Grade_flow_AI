'use client';

import { useEffect, useState } from 'react';
import { reportCardsPdfUrl } from '@/lib/pdf/sf9';
import type { ReportContext } from '@/lib/domain/grading';
import type { AppState, Student } from '@/lib/domain/types';

/**
 * Shows one learner's report card exactly as it will print: it is the same PDF that Download and Print use,
 * so the fonts, boxes and layout on screen are the real ones. One side is shown at a time: the front (grades) or the back (learner details).
 */
export function PdfPreview({ student, context, state, side }: { student: Student; context: ReportContext; state: AppState; side: 'front' | 'back' }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let made = '';
    let cancelled = false;
    const timer = window.setTimeout(() => {
      reportCardsPdfUrl([student], context, state, side === 'front' ? 1 : 2)
        .then((next) => { if (cancelled) { URL.revokeObjectURL(next); return; } made = next; setFailed(false); setUrl(next); })
        .catch(() => { if (!cancelled) setFailed(true); });
    }, 150);
    return () => { cancelled = true; window.clearTimeout(timer); if (made) URL.revokeObjectURL(made); };
    // The PDF only depends on what is printed on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student, context, state.school, state.teacher, side]);

  if (failed) return <p className="sf10-incomplete" role="alert">The preview could not be prepared. You can still download or print the PDF.</p>;
  return (
    <div className="pdf-preview">
      {url
        ? <iframe key={side} title={`Report card ${side}`} src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`} />
        : <p className="muted">Preparing the preview…</p>}
    </div>
  );
}
