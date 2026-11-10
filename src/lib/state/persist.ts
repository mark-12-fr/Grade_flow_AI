/**
 * Keeps the uploaded files' data (learners, grades, school details) in the browser's IndexedDB so a page
 * refresh does not lose it. Nothing is sent anywhere; it stays on this computer.
 * IndexedDB is used instead of localStorage because a school-wide list (1000+ learners) is several MB.
 */
import type { AppState } from '@/lib/domain/types';

const DB = 'gradeflow';
const STORE = 'state';
const KEY = 'app';
const VERSION = 2; // 2: the SF10 upload no longer sets the SF9 logo, so a logo saved by version 1 is dropped

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
      req.onsuccess = () => {
        const saved = req.result as (Partial<AppState> & { version?: number }) | undefined;
        if (saved && (saved.version ?? 1) < VERSION && saved.school) saved.school = { ...saved.school, logo: '' };
        resolve(saved ?? null);
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; } // private mode or blocked storage: the app still works, it just forgets on refresh
}

export async function save(state: AppState): Promise<boolean> {
  try {
    const picked: Record<string, unknown> = {};
    PERSISTED.forEach((k) => { picked[k] = state[k]; });
    picked.version = VERSION;
    const db = await open();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(picked, KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch { return false; } // storage full or blocked
}
