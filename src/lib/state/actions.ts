'use client';

import { SUBJECTS, subjectsFor, ATTENDANCE_MONTHS, CORE_VALUE_KEYS, TRANSFER_FIELDS } from '@/lib/domain/curriculum';
import { ageFromBirthdate } from '@/lib/domain/format';
import { buildComment, isValidGrade, makeNextSteps, makeTraits, missingGradeCells, scaleMinimum } from '@/lib/domain/grading';
import { setReadProgress } from '@/lib/state/progress';
import { getState, setState } from '@/lib/state/store';
import type { AppState, Student, UploadInfo } from '@/lib/domain/types';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_LEARNERS = 2000; // sanity cap only; a whole-school workbook can list several hundred learners

export const aiSchema = () => ({
  subjects: SUBJECTS.map((s) => ({ key: s.key, name: s.name, semester: s.semester })),
  months: ATTENDANCE_MONTHS.map((m) => m.key),
  coreValues: [...CORE_VALUE_KEYS],
  transferFields: [...TRANSFER_FIELDS]
});

const UPLOAD_SHARE = 25; // the upload is the first 25% of the bar; the server's own stages fill the rest

/** Sends the form with XMLHttpRequest so the upload reports real bytes; the server then streams its own progress. */
function send(url: string, body: FormData, timeoutMs: number): Promise<{ status: number; text: string; aborted: boolean }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.timeout = timeoutMs;
    const code = window.sessionStorage.getItem('gf-access-code');
    if (code) xhr.setRequestHeader('X-Access-Code', code);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setReadProgress({ percent: Math.round((e.loaded / e.total) * UPLOAD_SHARE), label: 'Uploading your file' });
    };
    let seen = 0;
    xhr.onprogress = () => {
      if (xhr.status !== 200) return;
      const lines = xhr.responseText.slice(seen).split('\n');
      lines.slice(0, -1).forEach((line) => {
        seen += line.length + 1;
        try {
          const ev = JSON.parse(line) as { p?: number; l?: string };
          if (typeof ev.p === 'number') setReadProgress({ percent: Math.min(99, UPLOAD_SHARE + Math.round((ev.p / 100) * (100 - UPLOAD_SHARE))), label: ev.l ?? '' });
        } catch { /* partial line */ }
      });
    };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText, aborted: false });
    xhr.onerror = () => resolve({ status: 0, text: '', aborted: false });
    xhr.ontimeout = () => resolve({ status: 0, text: '', aborted: true });
    xhr.send(body);
  });
}

/** POST to an AI endpoint. If the server asks for an access code (401), ask once and retry. */
async function post(url: string, make: () => FormData, timeoutMs: number) {
  let res = await send(url, make(), timeoutMs);
  if (res.status === 401) {
    const entered = window.prompt('Enter the access code to use the AI import:');
    if (entered) {
      window.sessionStorage.setItem('gf-access-code', entered);
      res = await send(url, make(), timeoutMs);
      if (res.status === 401) window.sessionStorage.removeItem('gf-access-code');
    }
  }
  return res;
}

async function callApi<T>(url: string, file: File, extra: Record<string, string> = {}, timeoutMs = 120_000): Promise<{ data?: T; error?: string }> {
  setReadProgress({ percent: 0, label: 'Uploading your file' });
  const make = () => {
    const body = new FormData();
    body.append('file', file);
    Object.entries(extra).forEach(([k, v]) => body.append(k, v));
    return body;
  };
  const res = await post(url, make, timeoutMs);
  if (res.aborted) return { error: 'The AI import took too long.' };
  if (!res.status) return { error: 'The server is not reachable.' };
  if (res.status !== 200) {
    let detail = `HTTP ${res.status}`;
    try { detail = (JSON.parse(res.text) as { detail?: string }).detail || detail; } catch { /* not JSON */ }
    return { error: detail };
  }
  const last = res.text.trim().split('\n').pop() ?? '';
  try {
    const ev = JSON.parse(last) as { done?: T; error?: string };
    if (ev.error) return { error: ev.error };
    if (ev.done !== undefined) {
      setReadProgress({ percent: 100, label: 'Done' });
      await new Promise((r) => setTimeout(r, 700)); // let the bar glide to 100% before the indicator closes
      return { data: ev.done };
    }
  } catch { /* fall through */ }
  return { error: 'The server stopped before the file was read. Try again.' };
}

interface RowCounts { found: number; imported: number; skipped: number; blank: number }

/** Plain-language row accounting shown after an upload, so the numbers can be matched against the Excel file. */
function countNote(c?: RowCounts): string {
  if (!c) return '';
  return ` ${c.found} row${c.found === 1 ? '' : 's'} with content: ${c.imported} imported${c.skipped ? `, ${c.skipped} skipped (see the notes)` : ''}.`;
}

interface Sf9Response {
  counts?: RowCounts;
  students: Student[];
  classDetails: Record<string, string>;
  mapping: { col: number; header: string; field: string }[];
  warnings: string[];
  sheet: string;
  schoolLogo?: string;
  template?: boolean;
  aiError?: string;
  roster?: boolean;
}


function applySchoolDetails(details: Record<string, string>, school: AppState['school']): AppState['school'] {
  const next = { ...school };
  if (details.schoolName) next.name = details.schoolName;
  (['department', 'region', 'division'] as const).forEach((k) => { if (details[k]) next[k] = details[k]; });
  if (details.schoolLogo) next.logo = details.schoolLogo;
  if (details.department || details.region || details.division || details.schoolAddress) {
    next.address = ['Republic of the Philippines', next.department, next.region, next.division, details.schoolAddress].filter(Boolean).join(' · ');
  }
  return next;
}

export interface ImportOutcome { ok: boolean; error?: string; message?: string; type?: 'success' | 'info' | 'error' }

function checkFile(file: File, allowed: string[]): string | null {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
  if (!allowed.includes(ext)) return `${file.name}: unsupported file type. Use CSV or Excel.`;
  if (file.size === 0) return `${file.name}: file is empty.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name}: file is larger than 10 MB.`;
  return null;
}

/** Upload the SF9 class grade sheet: the server reads it with AI (or the built-in template reader). */
export async function importSf9(file: File): Promise<ImportOutcome> {
  const problem = checkFile(file, ['.csv', '.xlsx', '.xls']);
  if (problem) return { ok: false, error: problem, message: 'No class grade files were added.', type: 'error' };
  const { data, error } = await callApi<Sf9Response>('/api/import', file, { spec: JSON.stringify(aiSchema()) });
  if (error || !data) return { ok: false, error: error, message: "No class grade files were added.", type: "error" };
  if (!data.students?.length) return { ok: false, error: `${file.name}: no learners were found.`, message: 'No class grade files were added.', type: 'error' };
  if (data.students.length > MAX_LEARNERS) {
    return { ok: false, error: `${file.name}: the class limit of ${MAX_LEARNERS} learners would be exceeded.`, message: 'No class grade files were added.', type: 'error' };
  }

  const students = data.students.map((student, index) => {
    const s = { ...student };
    s.id = index + 1;
    s.roll = s.roll || String(index + 1).padStart(2, '0');
    if (s.birthdate && !s.age) s.age = ageFromBirthdate(s.birthdate);
    if (!s.comment) { s.comment = buildComment(s); s.traits = makeTraits(s); s.nextSteps = makeNextSteps(s); }
    return s;
  });
  const details: Record<string, string> = { ...data.classDetails, ...(data.schoolLogo ? { schoolLogo: data.schoolLogo } : {}) };
  const missing = missingGradeCells(students).length;
  const ai = data.template || data.roster ? null : { mapping: data.mapping, warnings: data.warnings, sheet: data.sheet };
  const upload: UploadInfo = {
    name: file.name, size: file.size, rows: students.length, type: 'class', parsedAt: new Date(),
    mode: data.template || data.roster ? 'class-workbook' : 'ai-import', files: [file.name], classDetails: details, ai
  };

  setState((s) => {
    const gradeLevel = details.gradeLevel ? details.gradeLevel.replace(/^grade\s*/i, '') : s.gradeLevel;
    const section = details.section || s.section;
    return {
      students,
      selectedStudentId: (students.find((x) => missingGradeCells([x]).length) ?? students[0]).id,
      previewIndex: 0, verificationPage: 1, verificationSearch: '', verificationFilter: 'all', reportsPage: 1, reportsSearch: '',
      selectedReportIds: students.map((x) => x.id),
      processed: false, processing: false, progress: 0, generated: false, generatedAt: null,
      upload,
      strand: details.strand || s.strand,
      gradeLevel,
      year: details.year || s.year,
      term: details.term || s.term,
      section,
      studentStatus: details.studentStatus || s.studentStatus,
      graduationStatus: details.graduationStatus || s.graduationStatus,
      teacher: details.teacher || s.teacher,
      className: details.className || (details.section ? `Grade ${gradeLevel} · ${section}` : s.className),
      school: { ...applySchoolDetails(details, s.school), principal: details.principal || s.school.principal }
    };
  });

  const aiNote = data.roster
    ? ` From ${new Set(students.map((x) => x.section)).size} sections.`
    : data.template
    ? ` AI import unavailable${data.aiError ? ` (${data.aiError})` : ''}; used the standard template reader.`
    : ` AI mapped ${data.mapping.length} columns${data.warnings.length ? ` (${data.warnings.length} note${data.warnings.length === 1 ? '' : 's'} to check).` : '.'}`;
  return {
    ok: true, type: missing || data.counts?.skipped ? 'info' : 'success',
    message: `SF9 ready: ${students.length} learner${students.length === 1 ? '' : 's'} read.${aiNote} ` +
      (missing ? `${missing} grade${missing === 1 ? '' : 's'} need review.` : 'All grades are complete.')
  };
}

interface Sf10Response { counts?: RowCounts; students?: Student[]; warnings?: string[]; schoolLogo?: string }


/**
 * Upload an SF10 file. The server picks what to read by itself: the SF10 forms (one learner per sheet),
 * or the learner list of a school grading workbook (learners in rows).
 */
export async function importSf10(file: File, sheet?: string): Promise<ImportOutcome> {
  const problem = checkFile(file, ['.csv', '.xlsx', '.xls']);
  if (problem) return { ok: false, error: problem, type: 'error', message: problem };
  const { data, error } = await callApi<Sf10Response>('/api/import-sf10', file, sheet ? { sheet } : {}, 240_000);
  if (error || !data) return { ok: false, error, type: 'error', message: `SF10 could not be read: ${error}` };
  const students = data.students ?? [];
  if (!students.length) return { ok: false, error: 'No SF10 record was found in this file.', type: 'error', message: 'SF10 could not be read: no SF10 record was found.' };
  setState((s) => ({
    sf10Students: students,
    sf10Index: 0,
    sf10File: { name: sheet && sheet !== '__forms__' ? `${file.name} · ${sheet}` : file.name, size: file.size, warnings: data.warnings ?? [] },
    school: data.schoolLogo ? { ...s.school, logo: data.schoolLogo } : s.school
  }));
  const n = students.length;
  return { ok: true, type: data.counts?.skipped ? 'info' : 'success', message: `SF10 ready: ${n} record${n === 1 ? '' : 's'} read.${data.counts?.skipped ? ` ${data.counts.skipped} row${data.counts.skipped === 1 ? '' : 's'} skipped (see the notes).` : ''}` };
}

export function removeSf10() {
  setState({ sf10Students: [], sf10File: null, sf10Index: 0 });
}

export function removeSf9() {
  setState({
    upload: null, students: [], selectedStudentId: null, previewIndex: 0, verificationPage: 1, verificationSearch: '', verificationFilter: 'all',
    reportsPage: 1, reportsSearch: '', selectedReportIds: [], processed: false, processing: false, progress: 0, generated: false, generatedAt: null
  });
}

/** Checks done when the teacher clicks "Prepare reports". Returns an error message, or null when OK. */
export function validateBeforeProcessing(): string | null {
  const state = getState();
  if (!state.upload && state.sf10Students.length) return null;
  if (!state.upload) return 'Upload an SF9 or SF10 file before continuing.';
  const errors: string[] = [];
  state.students.forEach((student) => {
    subjectsFor(student.strand).forEach((subject) => {
      const grades = student.grades[subject.key] || {};
      [...subject.quarters, subject.finalKey].forEach((p) => {
        const value = grades[p as 'q1'];
        if (value !== null && value !== undefined && !isValidGrade(state, value)) {
          errors.push(`${student.name} · ${subject.name} ${p === 'final' ? 'semester final' : `quarter ${p.slice(1)}`} must be between ${scaleMinimum(state)} and 100.`);
        }
      });
    });
  });
  if (errors.length) return errors.slice(0, 4).join('\n');
  if (!state.className || !state.term || !state.year || !state.section) return 'Choose a section, term, and school year.';
  return null;
}
