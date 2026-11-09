'use client';

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

function scheduleSave() {
  if (!hydrated || typeof window === 'undefined') return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void save(state); }, 500);
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
