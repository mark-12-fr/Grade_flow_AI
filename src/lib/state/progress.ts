'use client';

import { useSyncExternalStore } from 'react';

export interface ReadProgress { percent: number; label: string }

let current: ReadProgress = { percent: 0, label: '' };
const listeners = new Set<() => void>();

export function setReadProgress(next: ReadProgress) {
  current = next;
  listeners.forEach((l) => l());
}

/** Progress of the file read that is running now (real upload bytes, then the server's own stages). */
export function useReadProgress(): ReadProgress {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => current);
}
