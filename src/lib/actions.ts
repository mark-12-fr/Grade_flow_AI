'use client';

import { SUBJECTS, ATTENDANCE_MONTHS, CORE_VALUE_KEYS, TRANSFER_FIELDS } from './curriculum';
import { ageFromBirthdate } from './format';
import { buildComment, isValidGrade, makeNextSteps, makeTraits, missingGradeCells, scaleMinimum } from './grading';
import { getState, setState } from './store';
import type { AppState, Student, UploadInfo } from './types';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_LEARNERS = 200;

export const aiSchema = () => ({
  subjects: SUBJECTS.map((s) => ({ key: s.key, name: s.name, semester: s.semester })),
  months: ATTENDANCE_MONTHS.map((m) => m.key),
  coreValues: [...CORE_VALUE_KEYS],
  transferFields: [...TRANSFER_FIELDS]
});

/** POST to an AI endpoint. If the server asks for an access code (401), ask once and retry. */
async function post(url: string, body: FormData, signal: AbortSignal): Promise<Response> {
  const send = () => {
    const code = window.sessionStorage.getItem('gf-access-code');
    return fetch(url, { method: 'POST', body, signal, headers: code ? { 'X-Access-Code': code } : {} });
  };
  let response = await send();
  if (response.status === 401) {
    const entered = window.prompt('Enter the access code to use the AI import:');
    if (entered) {
      window.sessionStorage.setItem('gf-access-code', entered);
      response = await send();
      if (response.status === 401) window.sessionStorage.removeItem('gf-access-code');
    }
  }
  return response;
}

async function callApi<T>(url: string, file: File, extra: Record<string, string> = {}, timeoutMs = 120_000): Promise<{ data?: T; error?: string }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = new FormData();
    body.append('file', file);
    Object.entries(extra).forEach(([k, v]) => body.append(k, v));
    const response = await post(url, body, controller.signal);
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try { detail = (await response.json()).detail || detail; } catch { /* not JSON */ }
      return { error: detail };
    }
    return { data: (await response.json()) as T };
  } catch (error) {
    return { error: (error as Error).name === 'AbortError' ? 'The AI import took too long.' : 'The server is not reachable.' };
  } finally {
    window.clearTimeout(timer);
  }
}

interface Sf9Response {
  students: Student[];
  classDetails: Record<string, string>;
  mapping: { col: number; header: string; field: string }[];
  warnings: string[];
  sheet: string;
  schoolLogo?: string;
  template?: boolean;
  aiError?: string;
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
  if (error || !data) return { ok: false, error: `${file.name}: ${error}`, message: 'No class grade files were added.', type: 'error' };
  if (!data.students.length) return { ok: false, error: `${file.name}: no learners were found.`, message: 'No class grade files were added.', type: 'error' };
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
  const ai = data.template ? null : { mapping: data.mapping, warnings: data.warnings, sheet: data.sheet };
  const upload: UploadInfo = {
    name: file.name, size: file.size, rows: students.length, type: 'class', parsedAt: new Date(),
    mode: data.template ? 'class-workbook' : 'ai-import', files: [file.name], classDetails: details, ai
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

  const aiNote = data.template
    ? ` AI import unavailable${data.aiError ? ` (${data.aiError})` : ''}; used the standard template reader.`
    : ` AI mapped ${data.mapping.length} columns${data.warnings.length ? ` (${data.warnings.length} note${data.warnings.length === 1 ? '' : 's'} to check).` : '.'}`;
  return {
    ok: true, type: missing ? 'info' : 'success',
    message: `1 class file read.${aiNote} ${students.length} learner${students.length === 1 ? '' : 's'} found. ` +
      (missing ? `${missing} grade${missing === 1 ? '' : 's'} need review.` : 'All grades are complete.')
  };
}

interface Sf10Response { students: Student[]; warnings: string[]; sheets: number; schoolLogo?: string }

/** Upload an SF10 workbook: the AI reads every form field, one learner per sheet. */
export async function importSf10(file: File): Promise<ImportOutcome> {
  const problem = checkFile(file, ['.csv', '.xlsx', '.xls']);
  if (problem) return { ok: false, error: problem, type: 'error', message: problem };
  const { data, error } = await callApi<Sf10Response>('/api/import-sf10', file, {}, 240_000);
  if (error || !data) return { ok: false, error, type: 'error', message: `SF10 could not be read: ${error}` };
  setState((s) => ({
    sf10Students: data.students,
    sf10Index: 0,
    sf10File: { name: file.name, size: file.size, warnings: data.warnings },
    school: data.schoolLogo ? { ...s.school, logo: data.schoolLogo } : s.school
  }));
  const n = data.students.length;
  return { ok: true, type: 'success', message: `${n} SF10 record${n === 1 ? '' : 's'} read.` };
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
    SUBJECTS.forEach((subject) => {
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
