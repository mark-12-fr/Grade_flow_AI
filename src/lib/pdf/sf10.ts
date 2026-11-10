/** Draws the SF10 permanent records into one PDF; download and print. */
import type { jsPDF } from 'jspdf';
import { printPdfUrl, saveBlob, type Downloaded } from '@/lib/pdf/sf9';
import { recordFor } from '@/lib/sf10/record';
import type { AppState, Student } from '@/lib/domain/types';

let logos: { seal: string | null; deped: string | null } = { seal: null, deped: null };

function loadImage(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      try { resolve(canvas.toDataURL('image/png')); } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadLogos() {
  if (logos.seal && logos.deped) return;
  const [seal, deped] = await Promise.all([loadImage('/assets/deped-seal.png'), loadImage('/assets/deped-logo.png')]);
  logos = { seal, deped };
}

/** jsPDF's built-in fonts only cover basic Latin, so replace anything else. */
export function safe(value: unknown): string {
  return String(value ?? '')
    .replace(/[‐-―−]/g, '-').replace(/[·•]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '?');
}

type Opts = { bold?: boolean; fill?: number[]; align?: 'center' | 'left' };

export function drawSf10Page(doc: jsPDF, student: Student, state: AppState) {
  const rec = recordFor(student, state);
  const el = rec.eligibility;
  const left = 10, width = 190;
  const GREY = [190, 190, 190];
  let y = 10;
  const text = (value: unknown, x: number, yy: number, options?: Record<string, unknown>) => doc.text(safe(value), x, yy, options);
  const fit = (value: unknown, w: number) => {
    const base = doc.getFontSize();
    let size = base;
    while (size > 4.5 && doc.getTextWidth(safe(value)) > w - 1.6) { size -= 0.25; doc.setFontSize(size); }
    return base;
  };
  const cell = (value: unknown, x: number, w: number, h: number, opts: Opts = {}) => {
    if (opts.fill) { doc.setFillColor(opts.fill[0], opts.fill[1], opts.fill[2]); doc.rect(x, y, w, h, 'FD'); } else doc.rect(x, y, w, h);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    const base = fit(value, w);
    if (opts.align === 'center') text(value, x + w / 2, y + h * 0.66, { align: 'center' });
    else text(value, x + 1, y + h * 0.66);
    doc.setFontSize(base);
  };
  const row = (cols: unknown[], widths: number[], h: number, opts?: Opts) => {
    let x = left;
    cols.forEach((value, i) => { cell(value, x, widths[i], h, opts); x += widths[i]; });
    y += h;
  };
  const band = (label: string) => {
    doc.setFillColor(GREY[0], GREY[1], GREY[2]); doc.rect(left, y, width, 4, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); text(label, 105, y + 2.9, { align: 'center' }); y += 4;
  };
  const box = (on: unknown) => (on ? '[X]' : '[  ]');
  const or = (value: unknown) => (value ? String(value) : '______');
  const str = (v: unknown) => (typeof v === 'string' ? v : '');

  doc.setLineWidth(0.2); doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6); text('SF10-SHS', 200, y, { align: 'right' });
  if (logos.seal) doc.addImage(logos.seal, 'PNG', 14, y - 1, 17, 17);
  if (logos.deped) doc.addImage(logos.deped, 'PNG', 168, y + 1, 30, 15.4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); text('REPUBLIC OF THE PHILIPPINES', 105, y + 1, { align: 'center' });
  text('DEPARTMENT OF EDUCATION', 105, y + 4.5, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); text('SENIOR HIGH SCHOOL STUDENT PERMANENT RECORD', 105, y + 10, { align: 'center' }); y += 17;
  if (!rec.complete) {
    doc.setTextColor(170, 20, 20); doc.setFontSize(7);
    text('INCOMPLETE RECORD: some grades are missing.', 105, y, { align: 'center' }); doc.setTextColor(0, 0, 0); y += 3;
  }

  doc.setFontSize(6.5);
  band("LEARNER'S INFORMATION");
  row([`LAST NAME: ${rec.last}`, `FIRST NAME: ${rec.first}`, `MIDDLE NAME: ${rec.middle}`], [63, 63, 64], 4.4);
  row([`LRN: ${rec.lrn}`, `Date of Birth (MM/DD/YYYY): ${rec.birth}`, `Sex: ${rec.sex}`], [63, 63, 64], 4.4);
  band('ELIGIBILITY FOR SHS ENROLMENT');
  row([`${box(el.hsCompleter)} High School Completer*   Gen. Ave: ${or(el.hsGenAve)}`, `${box(el.jhsCompleter)} Junior High School Completer   Gen. Ave: ${or(el.jhsGenAve)}`], [95, 95], 4.2);
  row([`Date of Graduation/Completion (MM/DD/YYYY): ${str(el.completionDate)}`, `Name of School: ${str(el.schoolName)}   School Address: ${str(el.schoolAddress)}`], [95, 95], 4.2);
  row([`${box(el.peptPasser)} PEPT Passer**  Rating: ${or(el.peptRating)}   ${box(el.alsPasser)} ALS A&E Passer***  Rating: ${or(el.alsRating)}`, `Others (Pls. Specify): ${str(el.others)}`], [95, 95], 4.2);
  band('SCHOLASTIC RECORD');

  const widths = [32, 90, 17, 17, 17, 17];
  rec.semesters.forEach((sem, si) => {
    if (si > 0) { doc.addPage(); y = 10; }
    doc.setFontSize(6.5);
    row([`SCHOOL: ${sem.school}${sem.schoolId ? `   SCHOOL ID: ${sem.schoolId}` : ''}`, `GRADE LEVEL: ${sem.gradeLevel}    SY: ${sem.sy}    SEM: ${sem.semLabel}`], [122, 68], 4.2);
    row([`TRACK/STRAND: ${sem.track}`, `SECTION: ${sem.section}`], [122, 68], 4.2);
    cell('', left, widths[0], 9, { fill: GREY });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5);
    ['Indicate if Subject is', 'CORE, APPLIED, or', 'SPECIALIZED'].forEach((line, k) => text(line, left + widths[0] / 2, y + 3 + k * 2.2, { align: 'center' }));
    doc.setFontSize(6.5);
    cell('SUBJECTS', left + widths[0], widths[1], 9, { bold: true, fill: GREY, align: 'center' });
    cell('Quarter', left + 122, 34, 4.5, { bold: true, fill: GREY, align: 'center' });
    cell('SEM FINAL GRADE', left + 156, widths[4], 9, { bold: true, fill: GREY, align: 'center' });
    cell('ACTION TAKEN', left + 173, widths[5], 9, { bold: true, fill: GREY, align: 'center' });
    y += 4.5;
    cell(sem.quarters[0], left + 122, 17, 4.5, { bold: true, fill: GREY, align: 'center' });
    cell(sem.quarters[1], left + 139, 17, 4.5, { bold: true, fill: GREY, align: 'center' });
    y += 4.5;
    const rowH = Math.min(4.6, 62 / Math.max(1, sem.rows.length + 3));
    sem.rows.forEach((r) => {
      let x = left;
      [r.category, r.subject, r.q1, r.q2, r.final, r.action].forEach((v, k) => { cell(v, x, widths[k], rowH, { align: k > 1 ? 'center' : 'left' }); x += widths[k]; });
      y += rowH;
    });
    for (let i = 0; i < 3; i += 1) row(['', '', '', '', '', ''], widths, rowH);
    cell('General Ave. for the Semester:', left, 154, 4.8, { bold: true, fill: GREY });
    cell(sem.average, left + 154, 17, 4.8, { bold: true, align: 'center' });
    cell(sem.averageAction, left + 171, 19, 4.8, { bold: true, align: 'center' });
    y += 4.8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); text(`REMARKS: ${sem.remarks || ''}`, left, y + 3.5); y += 6;
    row(['Prepared by:', 'Certified True and Correct:', `Date Checked (MM/DD/YYYY): ${sem.dateChecked || ''}`], [63, 80, 47], 4.2, { bold: true });
    doc.setFont('helvetica', 'normal');
    text(sem.adviser, left + 31, y + 5, { align: 'center' });
    text(sem.principal ? `${sem.principal}, SHS Principal` : '', left + 103, y + 5, { align: 'center' });
    doc.line(left + 3, y + 5.8, left + 60, y + 5.8); doc.line(left + 66, y + 5.8, left + 140, y + 5.8); doc.line(left + 146, y + 5.8, left + 188, y + 5.8);
    doc.setFontSize(5); text('Signature of Adviser over Printed Name', left + 31, y + 8, { align: 'center' });
    text('Signature of Authorized Person over Printed Name, Designation', left + 103, y + 8, { align: 'center' });
    y += 11; doc.setFontSize(6.5);
    const rem = sem.remedial;
    row([`REMEDIAL CLASSES    Conducted from (MM/DD/YYYY): ${rem.from || ''}    to (MM/DD/YYYY): ${rem.to || ''}    SCHOOL: ${rem.school || ''}    SCHOOL ID: ${rem.schoolId || ''}`], [190], 4.4, { bold: true });
    row(['Subject Type', 'SUBJECTS', 'SEM FINAL', 'REMEDIAL MARK', 'RECOMPUTED', 'ACTION TAKEN'], widths, 4.6, { bold: true, fill: GREY, align: 'center' });
    const remRows = rem.rows.length ? rem.rows : [{}, {}, {}];
    remRows.forEach((r) => {
      const x = r as Record<string, string>;
      row([x.category || '', x.subject || '', x.final || '', x.remedialMark || '', x.recomputed || '', x.action || ''], widths, 4.4);
    });
    doc.setFont('helvetica', 'normal'); text(`Name of Teacher/Adviser: ${rem.teacher || ''}                                              Signature:`, left, y + 4); y += 8;
  });

  const c = rec.completion;
  y += 2;
  band('');
  row([`Track/Strand Accomplished: ${c.trackAccomplished || ''}`, `SHS General Average: ${c.shsAverage || ''}`], [110, 80], 4.6, { bold: true });
  row([`Awards/Honors Received: ${c.awards || ''}`, `Date of SHS Graduation (MM/DD/YYYY): ${c.graduationDate || ''}`], [110, 80], 4.6, { bold: true });
  row([`Certified by: ${c.certifiedBy || ''}`, 'Place School Seal Here:'], [110, 80], 14, { bold: true });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5);
  const note = doc.splitTextToSize('NOTE: This permanent record or a photocopy of this permanent record that bears the seal of the school and the original signature in ink of the School Head shall be considered valid for all legal purposes. Any erasure or alteration made on this copy should be validated by the School Head. If the student transfers to another school, the originating school should produce one (1) certified true copy of this permanent record for safekeeping. The receiving school shall continue filling up the original form. Upon graduation, the school from which the student graduated should keep the original form and produce one (1) certified true copy for the Division Office.', 190);
  doc.text(note, left, y + 4); y += 4 + note.length * 2.4;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
  text(`REMARKS: ${[c.remarks, c.purpose].filter(Boolean).join(' - ')}    Date Issued (MM/DD/YYYY): ${c.dateIssued || ''}`, left, y + 3);
}

async function buildSf10(students: Student[], state: AppState) {
  const { jsPDF } = await import('jspdf');
  await loadLogos();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  students.forEach((student, i) => {
    if (i > 0) doc.addPage();
    drawSf10Page(doc, student, state);
  });
  return doc;
}

/** Builds the SF10 PDF for the given learners and downloads it. */
export async function downloadSf10(students: Student[], state: AppState, filename: string): Promise<Downloaded> {
  return saveBlob((await buildSf10(students, state)).output('blob'), filename);
}

/** Builds the SF10 PDF for the given learners and opens the print dialog. */
export async function printSf10(students: Student[], state: AppState) {
  const doc = await buildSf10(students, state);
  printPdfUrl(URL.createObjectURL(doc.output('blob')));
}
