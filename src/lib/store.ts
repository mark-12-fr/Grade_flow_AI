'use client';

import { useSyncExternalStore } from 'react';
import type { AppState } from './types';

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

export const getState = () => state;

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, () => state, () => initialState);
}
