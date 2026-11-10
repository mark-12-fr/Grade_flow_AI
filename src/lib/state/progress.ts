'use client';

/** Progress and cancel handle of the file read that is running now. */

import { useSyncExternalStore } from 'react';

export interface ReadProgress { percent: number; label: string }

let current: ReadProgress = { percent: 0, label: '' };
const listeners = new Set<() => void>();

export function setReadProgress(next: ReadProgress) {
  current = next;
  listeners.forEach((l) => l());
}

let canceller: (() => void) | null = null;
/** The running upload registers how to stop itself; the Cancel button in the progress card calls cancelRead(). */
export function setCanceller(fn: (() => void) | null) { canceller = fn; }
export function cancelRead() { canceller?.(); }

/** Progress of the file read that is running now (real upload bytes, then the server's own stages). */
export function useReadProgress(): ReadProgress {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => current);
}
