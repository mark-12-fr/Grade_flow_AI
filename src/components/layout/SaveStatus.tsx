'use client';

/** Top-bar badge: "Saving…", "Saved" or "Not saved" for the data stored in this browser. */

import { Icon } from '@/components/ui/Icon';
import { useAppState, useSaveStatus } from '@/lib/state/store';

/** Small badge in the top bar: tells the teacher their corrections are stored in this browser (or that they are not). */
export function SaveStatus() {
  const status = useSaveStatus();
  const state = useAppState();
  if (!state.students.length && !state.sf10Students.length) return null;
  if (status === 'idle') return null;
  const text = status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Not saved';
  const icon = status === 'saving' ? 'refresh' : status === 'saved' ? 'check-circle' : 'alert-triangle';
  return (
    <span className={`save-status ${status}`} role="status" aria-live="polite"
      title={status === 'error' ? 'Your browser would not store the data (private window or full storage). Download your files before closing this page.' : 'Your learners and corrections are stored in this browser. Press Ctrl+S to save right now.'}>
      <Icon name={icon} /><span>{text}</span>
    </span>
  );
}
