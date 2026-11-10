'use client';

/** The app's single in-memory state, how components read it, and when it is saved to the browser. */

import { useSyncExternalStore } from 'react';
import type { AppState } from '@/lib/domain/types';
import { loadSaved, save } from '@/lib/state/persist';

export const initialState: AppState = {
  school: {
    name: 'University of Iloilo',
    address: 'Republic of the Philippines · Department of Education · Region VI – Western Visayas · Iloilo City · Senior High School Department',
    principal: 'Elena Navarro', department: '', region: '', division: '', logo: ''
  },
  teacher: 'Sarah Collins',
  year: '2026-2027',
  term: 'Annual Report',
  className: 'Grade 12 · UI-FA-ABM12-1',
  strand: 'ABM',
  gradeLevel: '12',
  section: 'UI-FA-ABM12-1',
  studentStatus: 'Regular',
  graduationStatus: 'Recommended',
  gradingScale: 'percentage',
  students: [],
  sf10Students: [],
  sf10File: null,
  upload: null,
  processed: false,
  processing: false,
  progress: 0,
  generated: false,
  generatedAt: null,
  selectedStudentId: null,
  previewIndex: 0,
  sf10Index: 0,
  verificationPage: 1,
  verificationSearch: '',
  verificationFilter: 'all',
  reportsPage: 1,
  reportsSearch: '',
  selectedReportIds: [],
  paperSize: 'a4',
  orientation: 'landscape',
  printLayout: 'double'
};

let state: AppState = initialState;
const listeners = new Set<() => void>();
let hydrated = false; // never save before the saved data was loaded, or the empty start-up state would overwrite it
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const getState = () => state;

/** Whether the learners and grades are safely stored in this browser (shown as a small badge in the top bar). */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
let saveStatus: SaveStatus = 'idle';
const saveListeners = new Set<() => void>();
function setSaveStatus(next: SaveStatus) {
  if (saveStatus === next) return;
  saveStatus = next;
  saveListeners.forEach((l) => l());
}
export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore((cb) => { saveListeners.add(cb); return () => { saveListeners.delete(cb); }; }, () => saveStatus, () => 'idle' as SaveStatus);
}

async function writeNow(): Promise<boolean> {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  setSaveStatus('saving');
  const ok = await save(state);
  // A newer change may have started another save while this one ran; that one will report its own result.
  if (!saveTimer) setSaveStatus(ok ? 'saved' : 'error');
  return ok;
}

/** Saves right away (Ctrl+S) instead of waiting for the short delay. */
export function saveNow(): Promise<boolean> {
  if (!hydrated || typeof window === 'undefined') return Promise.resolve(false);
  return writeNow();
}

function scheduleSave() {
  if (!hydrated || typeof window === 'undefined') return;
  if (saveTimer) clearTimeout(saveTimer);
  setSaveStatus('saving');
  saveTimer = setTimeout(() => { void writeNow(); }, 500);
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
  scheduleSave();
}

/** Brings back what was uploaded before the page was refreshed. Called once when the app starts. */
export async function hydrate(): Promise<void> {
  if (hydrated) return;
  const saved = await loadSaved();
  hydrated = true;
  if (saved) {
    const clean: Partial<AppState> = { ...saved };
    if (clean.upload) clean.upload = { ...clean.upload, parsedAt: new Date(clean.upload.parsedAt) };
    if (clean.generatedAt) clean.generatedAt = new Date(clean.generatedAt);
    // Do not overwrite anything the user already did while the saved data was loading.
    state = { ...state, ...(state.students.length || state.sf10Students.length ? {} : clean) };
    listeners.forEach((l) => l());
  }
  scheduleSave();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, () => state, () => initialState);
}
