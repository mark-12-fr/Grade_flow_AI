/**
 * Keeps the uploaded files' data (learners, grades, school details) in the browser's IndexedDB so a page
 * refresh does not lose it. Nothing is sent anywhere; it stays on this computer.
 * IndexedDB is used instead of localStorage because a school-wide list (1000+ learners) is several MB.
 */
import type { AppState } from '@/lib/domain/types';

const DB = 'gradeflow';
const STORE = 'state';
const KEY = 'app';

/** Only the data worth keeping; transient screen state (search boxes, progress) starts fresh. */
export const PERSISTED = [
  'school', 'teacher', 'year', 'term', 'className', 'strand', 'gradeLevel', 'section', 'studentStatus', 'graduationStatus', 'gradingScale',
  'students', 'sf10Students', 'sf10File', 'upload', 'processed', 'generated', 'generatedAt', 'selectedStudentId', 'previewIndex', 'sf10Index',
  'selectedReportIds', 'paperSize', 'orientation', 'printLayout'
] as const satisfies readonly (keyof AppState)[];

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadSaved(): Promise<Partial<AppState> | null> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as Partial<AppState> | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; } // private mode or blocked storage: the app still works, it just forgets on refresh
}

export async function save(state: AppState): Promise<void> {
  try {
    const picked: Record<string, unknown> = {};
    PERSISTED.forEach((k) => { picked[k] = state[k]; });
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(picked, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* storage full or blocked */ }
}
