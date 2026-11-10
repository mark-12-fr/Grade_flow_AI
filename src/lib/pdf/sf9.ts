/** Draws the SF9 report cards into PDFs; builds the single PDF or the ZIP by strand; opens the print dialog. */
/* eslint-disable @typescript-eslint/no-explicit-any */
// Draws the SF9 report card PDF with jsPDF (ported from the original printing module).
import type { jsPDF } from 'jspdf';
import { ALL_SUBJECTS, ATTENDANCE_MONTHS, semestersFor } from '@/lib/domain/curriculum';
import { prettyYear } from '@/lib/domain/format';
import { remarkFor, semesterAverage as semAvg, studentContext, type ReportContext } from '@/lib/domain/grading';
import type { AppState, Student } from '@/lib/domain/types';

function pdfSafe(value: unknown): string {
  return String(value == null ? '' : value)
    .replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"').replace(/[–—−]/g, '-').replace(/[·•]/g, '-').replace(/…/g, '...')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '');
}

function safeFilename(value: unknown): string {
  return String(value || 'report').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'report';
}

function setTextColor(doc: any, color: number[]) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function setFillColor(doc: any, color: any) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function setDrawColor(doc: any, color: any) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

/**
 * Draws one learner's report card.
 * 'landscape': the whole card on one landscape page (the original layout).
 * 'portrait': A4 portrait, exactly two pages: the front (school header, learner details, grades) and the back
 * (certificate of transfer, attendance, observed values, legends and the parent/guardian signature).
 * The same drawing code serves both; in portrait each block is drawn at its own scale on its own page.
 */
export function drawFront(doc: jsPDF, student: Student, classContext: ReportContext, logoData: string | null, mode: 'landscape' | 'portrait' = 'landscape') {
  const portrait = mode === 'portrait';
  const context = studentContext(classContext, student);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  // The card is designed on A4 landscape. Scale it down when the user picks
  // Letter or portrait so the same proportions still fit on one page.
  let scale = Math.min(pageWidth / 297, pageHeight / 210);
  let offsetX = (pageWidth - 297 * scale) / 2;
  let offsetY = (pageHeight - 210 * scale) / 2;
  const frontPage = doc.getNumberOfPages();
  let backPage = frontPage;
  if (portrait) { doc.addPage(); backPage = doc.getNumberOfPages(); doc.setPage(frontPage); }
  const X = function (value: number) { return offsetX + value * scale; };
  const Y = function (value: any) { return offsetY + value * scale; };
  const S = function (value: any) { return value * scale; };

  const left = 10;
  const rightEdge = 287;
  const contentWidth = rightEdge - left;
  const columnGap = contentWidth * 0.015;
  const leftWidth = (contentWidth - columnGap) * (48.5 / 98);
  const rightWidth = contentWidth - columnGap - leftWidth;
  const rightX = left + leftWidth + columnGap;
  const bodyTop = portrait ? 29 : 26;
  const bodyBottom = 200;

  const line = [70, 68, 62];
  const tan = [200, 192, 160];
  const cream = [244, 241, 228];
  const ink = [34, 34, 34];
  const soft = [85, 84, 80];

  // Portrait (A4, two pages): the FRONT is the grades side (title, both semesters, legends and parent signatures);
  // the BACK is the learner side (school header, details, certificate of transfer, attendance, observed values).
  // Both sides are laid out on the landscape design grid and enlarged to fill the 190 mm printable width and the page height.
  const MARGIN = 10;
  const leftScale = 190 / leftWidth;
  const rightScale = 190 / rightWidth;
  const headOffsetY = MARGIN - 8.4 * leftScale;
  function stage(name: 'head' | 'title' | 'grades') {
    if (!portrait) return;
    if (name === 'head') { doc.setPage(backPage); scale = leftScale; offsetX = MARGIN - left * scale; offsetY = headOffsetY; }
    if (name === 'title') { doc.setPage(frontPage); scale = rightScale; offsetX = MARGIN - rightX * scale; offsetY = MARGIN + 4 - 16.2 * scale; }
    if (name === 'grades') { doc.setPage(frontPage); scale = rightScale; offsetX = MARGIN - rightX * scale; offsetY = MARGIN + 14 - 27 * scale; }
  }
  stage('head');

  function setFont(style: any, size: any, color: any) {
    doc.setFont('helvetica', style || 'normal');
    doc.setFontSize(S(size));
    setTextColor(doc, color || ink);
  }

  function cell(x: any, y: any, width: any, height: any, options?: any) {
    const settings = options || {};
    if (settings.fill) setFillColor(doc, settings.fill);
    setDrawColor(doc, settings.stroke || line);
    doc.setLineWidth(S(settings.lineWidth || 0.22));
    doc.rect(X(x), Y(y), S(width), S(height), settings.fill ? 'FD' : 'S');
  }

  function centeredText(text: any, x: any, y: any, width: any, options?: any) {
    const settings = options || {};
    doc.text(pdfSafe(text), X(x + width / 2), Y(y), {
      align: 'center',
      baseline: settings.baseline || 'middle',
      maxWidth: S(width - (settings.inset == null ? 1.4 : settings.inset))
    });
  }

  function leftText(text: any, x: any, y: any, width: any, options?: any) {
    const settings = options || {};
    doc.text(pdfSafe(text), X(x + (settings.inset == null ? 1.2 : settings.inset)), Y(y), {
      align: 'left',
      baseline: settings.baseline || 'middle',
      maxWidth: S(width - 2)
    });
  }

  function fitFont(text: any, style: any, size: any, width: any) {
    let current = size;
    doc.setFont('helvetica', style || 'normal');
    doc.setFontSize(S(current));
    while (current > 3.2 && doc.getTextWidth(pdfSafe(text)) > S(width)) {
      current -= 0.1;
      doc.setFontSize(S(current));
    }
    return current;
  }

  function drawLabelValue(label: any, value: any, x: any, y: any, width: any, size: any) {
    setFont('bold', size || 5.1, ink);
    doc.text(pdfSafe(label + ':'), X(x), Y(y), { baseline: 'middle' });
    const labelWidth = doc.getTextWidth(pdfSafe(label + ':')) / scale;
    setFont('normal', (size || 5.1) + 0.4, ink);
    doc.text(pdfSafe(value || '-'), X(x + labelWidth + 1.2), Y(y), {
      baseline: 'middle',
      maxWidth: S(width - labelWidth - 2.4)
    });
    // A thin line under the value, like the printed form.
    const gap = width < leftWidth ? 4 : 0; // keeps the two columns of a row apart
    setDrawColor(doc, line);
    doc.setLineWidth(S(0.2));
    doc.line(X(x + labelWidth + 1), Y(y + 1.9), X(x + width - gap), Y(y + 1.9));
  }

  /* ---------- Header ---------- */
  const H = portrait ? 1.3 : 1; // the header is drawn larger on the portrait page, where there is room
  if (logoData) doc.addImage(logoData, 'PNG', X(left + 2), Y(8.4), S(11.4 * H), S(12.9 * H));
  const addressLines = String(context.schoolAddress || '')
    .split(' · ')
    .map(function (part: any) { return part.trim(); })
    .filter(function (part: any) {
      return part && part.toLowerCase().indexOf('senior high school department') === -1;
    });
  setFont('normal', 4.1 * H, soft);    addressLines.slice(0, 4).forEach(function (address: any, index: any) {
    centeredText(address, left + 18 * H, 9.6 + index * 2.15 * H, leftWidth - 20 * H);
  });
  setFont('bold', 9.2 * (portrait ? 1.15 : 1), ink);
  centeredText(context.schoolName, left + 18 * H, 19.7 + (portrait ? 3.4 : 0), leftWidth - 20 * H);
  setFont('normal', 4.8 * H, soft);
  centeredText('Senior High School Department', left + 18 * H, 22.4 + (portrait ? 4.6 : 0), leftWidth - 20 * H);

  stage('title');
  setFont('bold', 10.8, ink);
  doc.setFont('times', 'bold');
  doc.setFontSize(S(10.8));
  setTextColor(doc, ink);
  doc.text(pdfSafe('REPORT ON LEARNING PROGRESS AND ACHIEVEMENT'),
    X(rightX + rightWidth / 2), Y(16.2), { align: 'center', baseline: 'middle' });

  stage('head');
  if (!portrait) {
    setDrawColor(doc, line);
    doc.setLineWidth(S(0.35));
    doc.line(X(left), Y(24.1), X(rightEdge), Y(24.1));
  }

  /* ---------- Learner details ---------- */
  const fieldRows = [
    ['Name', student.name],
    ['Age', student.age || '-', 'Sex', student.sex || '-'],
    ['Grade', context.gradeLevel, 'Section', context.section],
    ['School Year', prettyYear(context.year), 'LRN', student.lrn || '-'],
    ['Track/Strand', context.trackStrand || context.strand || '-']
  ];
  const fieldRowHeight = 5.5;
  fieldRows.forEach(function (row: any, index: any) {
    const y = bodyTop + index * fieldRowHeight + 2.6;
    if (index === 0 || index === 4) {
      drawLabelValue(row[0], row[1], left, y, leftWidth, 5.1);
    } else {
      drawLabelValue(row[0], row[1], left, y, leftWidth / 2, 5.0);
      drawLabelValue(row[2], row[3], left + leftWidth / 2, y, leftWidth / 2, 5.0);
    }
  });
  let leftY = bodyTop + fieldRows.length * fieldRowHeight + 1.4;

  /* ---------- Dear Parent ---------- */
  setFont('bold', 5.2, ink);
  doc.text('Dear Parent:', X(left), Y(leftY + 2.2), { baseline: 'middle' });
  setFont('italic', 4.7, ink);
  const noteLines = doc.splitTextToSize(pdfSafe(
    'This report card shows your child\'s performance in the different learning areas as well as in character formation. ' +
    'The school welcomes you if you desire to know more about the progress of your child.'
  ), S(leftWidth));
  doc.text(noteLines.slice(0, 2).map(pdfSafe), X(left), Y(leftY + 5.4), {
    baseline: 'top',
    lineHeightFactor: 1.35
  });
  leftY += 6.4 + Math.min(noteLines.length, 2) * 2.5;

  /* ---------- Adviser and principal names ---------- */
  leftY += 1.7;
  [
    [context.teacher, left, leftWidth / 2, 'Adviser'],
    [context.principal, left + leftWidth / 2, leftWidth / 2, 'Principal']
  ].forEach(function (signature: any) {
    setFont('bold', 5.4, ink);
    centeredText(signature[0], signature[1], leftY, signature[2]);
    setDrawColor(doc, line);
    doc.setLineWidth(S(0.22));
    doc.line(X(signature[1] + 1), Y(leftY + 1.5), X(signature[1] + signature[2] - 1), Y(leftY + 1.5));
    setFont('normal', 4.2, soft);
    centeredText(signature[3], signature[1], leftY + 3.6, signature[2]);
  });
  leftY += 5.4;

  /* ---------- Certificate panels ---------- */
  const panelWidth = leftWidth / 2;
  const headingHeight = 4.6;
  const transferRowHeight = 4.7;
  const signatureHeight = 10.8; // room to sign above the line
  function transferPanel(x: any, title: any, fields: any, signatureLabel: any) {
    cell(x, leftY, panelWidth, headingHeight, { fill: tan, stroke: line });
    setFont('bold', 4.4, ink);
    centeredText(title, x, leftY + headingHeight / 2, panelWidth);
    let rowY = leftY + headingHeight;
    const labelWidth = panelWidth * 0.55;
    fields.forEach(function (field: any) {
      cell(x, rowY, labelWidth, transferRowHeight, { stroke: line });
      cell(x + labelWidth, rowY, panelWidth - labelWidth, transferRowHeight, { stroke: line });
      setFont('normal', 3.9, soft);
      leftText(field[0], x, rowY + transferRowHeight / 2, labelWidth, { inset: 0.9 });
      setFont('normal', 4.2, ink);
      leftText(field[1] || '', x + labelWidth, rowY + transferRowHeight / 2, panelWidth - labelWidth, { inset: 0.9 });
      rowY += transferRowHeight;
    });
    const signatureWidth = panelWidth * 0.55;
    cell(x, rowY, panelWidth, signatureHeight, { stroke: line });
    setDrawColor(doc, line);
    doc.setLineWidth(S(0.22));
    const signatureCenter = x + panelWidth / 2;
    doc.line(X(signatureCenter - signatureWidth / 2), Y(rowY + 7.4),
      X(signatureCenter + signatureWidth / 2), Y(rowY + 7.4));
    setFont('normal', 3.8, soft);
    centeredText(signatureLabel, x, rowY + 9.4, panelWidth);
  }

  const transfer = student.transfer || {};
  const leftTransferFields = [
    ['Admitted to', transfer.admittedTo],
    ['Section', transfer.section || context.section],
    ['Eligibility for admission to grade', transfer.eligibilityForGrade],
    ['Approved by', transfer.approvedBy]
  ];
  const rightTransferFields = [
    ['Admitted in', transfer.admittedIn],
    ['Date', transfer.transferDate],
    ['Approved by', transfer.cancellationOfEligibility]
  ];
  transferPanel(left, 'Certificate of Transfer', leftTransferFields, 'Adviser');
  // The right panel reserves one blank row so both panels end at the same height.
  const rightPanelTop = leftY;
  cell(left + panelWidth, rightPanelTop, panelWidth, headingHeight, { fill: tan, stroke: line });
  setFont('bold', 4.4, ink);
  centeredText('Cancellation of Eligibility to Transfer', left + panelWidth,
    rightPanelTop + headingHeight / 2, panelWidth);
  let rightRowY = rightPanelTop + headingHeight;
  const rightLabelWidth = panelWidth * 0.55;
  rightTransferFields.forEach(function (field: any) {
    cell(left + panelWidth, rightRowY, rightLabelWidth, transferRowHeight, { stroke: line });
    cell(left + panelWidth + rightLabelWidth, rightRowY,
      panelWidth - rightLabelWidth, transferRowHeight, { stroke: line });
    setFont('normal', 3.9, soft);
    leftText(field[0], left + panelWidth, rightRowY + transferRowHeight / 2,
      rightLabelWidth, { inset: 0.9 });
    setFont('normal', 4.2, ink);
    leftText(field[1] || '', left + panelWidth + rightLabelWidth,
      rightRowY + transferRowHeight / 2, panelWidth - rightLabelWidth, { inset: 0.9 });
    rightRowY += transferRowHeight;
  });
  rightRowY += transferRowHeight; // blank spacer row, as on the printed form
  setDrawColor(doc, line);
  doc.setLineWidth(S(0.22));
  doc.line(X(left + panelWidth), Y(rightRowY - transferRowHeight),
    X(left + panelWidth), Y(rightRowY));
  doc.line(X(left + panelWidth * 2), Y(rightRowY - transferRowHeight),
    X(left + panelWidth * 2), Y(rightRowY));
  cell(left + panelWidth, rightRowY, panelWidth, signatureHeight, { stroke: line });
  const rightSignatureCenter = left + panelWidth + panelWidth / 2;
  const rightSignatureWidth = panelWidth * 0.55;
  doc.line(X(rightSignatureCenter - rightSignatureWidth / 2), Y(rightRowY + 7.4),
    X(rightSignatureCenter + rightSignatureWidth / 2), Y(rightRowY + 7.4));
  setFont('normal', 3.8, soft);
  centeredText('Principal', left + panelWidth, rightRowY + 9.4, panelWidth);
  leftY += headingHeight + 4 * transferRowHeight + signatureHeight + 1.6;

  /* ---------- Attendance ---------- */
  function drawTableCaption(text: any, x: any, y: any, width: any, height: any) {
    cell(x, y, width, height, { fill: tan, stroke: line });
    setFont('bold', 4.5, ink);
    centeredText(text, x, y + height / 2, width);
  }

  const attendance = student.attendance || {};
  drawTableCaption('REPORT OF ATTENDANCE', left, leftY, leftWidth, 4.2);
  let attendanceY = leftY + 4.2;
  const attendanceLabelWidth = leftWidth * 0.20;
  const attendanceTotalWidth = leftWidth * 0.08;
  const attendanceMonthWidth = (leftWidth - attendanceLabelWidth - attendanceTotalWidth) /
    ATTENDANCE_MONTHS.length;
  const attendanceHeaderHeight = 3.6;
  cell(left, attendanceY, attendanceLabelWidth, attendanceHeaderHeight, { fill: cream, stroke: line });
  ATTENDANCE_MONTHS.forEach(function (month: any, index: any) {
    const x = left + attendanceLabelWidth + index * attendanceMonthWidth;
    cell(x, attendanceY, attendanceMonthWidth, attendanceHeaderHeight, { fill: cream, stroke: line });
    setFont('bold', 4.0, ink);
    centeredText(month.label, x, attendanceY + attendanceHeaderHeight / 2,
      attendanceMonthWidth, { inset: 0.2 });
  });
  const totalX = left + attendanceLabelWidth +
    ATTENDANCE_MONTHS.length * attendanceMonthWidth;
  cell(totalX, attendanceY, attendanceTotalWidth, attendanceHeaderHeight,
    { fill: cream, stroke: line });
  setFont('bold', 4.0, ink);
  centeredText('Total', totalX, attendanceY + attendanceHeaderHeight / 2,
    attendanceTotalWidth, { inset: 0.2 });

  const attendanceRows = [
    ['No. of school days', attendance.schoolDays || {}],
    ['No. of days present', attendance.months || {}],
    ['No. of days absent', attendance.absent || {}]
  ];
  const attendanceRowHeight = 4.3;
  attendanceRows.forEach(function (row: any, rowIndex: any) {
    const y = attendanceY + attendanceHeaderHeight + rowIndex * attendanceRowHeight;
    cell(left, y, attendanceLabelWidth, attendanceRowHeight, { stroke: line });
    setFont('normal', 4.0, ink);
    leftText(row[0], left, y + attendanceRowHeight / 2, attendanceLabelWidth, { inset: 0.8 });
    let total = 0;
    let hasValue = false;
    ATTENDANCE_MONTHS.forEach(function (month: any, monthIndex: any) {
      const value = row[1][month.key];
      const x = left + attendanceLabelWidth + monthIndex * attendanceMonthWidth;
      cell(x, y, attendanceMonthWidth, attendanceRowHeight, { stroke: line });
      setFont('normal', 4.1, ink);
      centeredText(value == null ? '' : String(value), x, y + attendanceRowHeight / 2,
        attendanceMonthWidth, { inset: 0.2 });
      if (value !== null && value !== undefined && value !== '') {
        total += Number(value) || 0;
        hasValue = true;
      }
    });
    cell(totalX, y, attendanceTotalWidth, attendanceRowHeight, { stroke: line });
    setFont('bold', 4.1, ink);
    centeredText(hasValue ? String(total) : '', totalX, y + attendanceRowHeight / 2,
      attendanceTotalWidth, { inset: 0.2 });
  });
  leftY = attendanceY + attendanceHeaderHeight + attendanceRows.length * attendanceRowHeight + 2.2;

  /* ---------- Observed values ---------- */
  const valuesTop = leftY;
  const valuesBottom = portrait ? (285 - headOffsetY) / leftScale : bodyBottom; // the observed values stretch to the foot of the page
  const valuesCaptionHeight = 4.3;
  const valuesHeaderOne = 3.7;
  const valuesHeaderTwo = 3.3;
  const valuesBodyHeight = valuesBottom - valuesTop - valuesCaptionHeight -
    valuesHeaderOne - valuesHeaderTwo;
  const valuesRowHeight = valuesBodyHeight / 8;
  const coreWidth = leftWidth * 0.13;
  const statementWidth = leftWidth * 0.61;
  const ratingWidth = (leftWidth - coreWidth - statementWidth) / 4;

  drawTableCaption('REPORT ON LEARNER\'S OBSERVED VALUES', left, valuesTop, leftWidth,
    valuesCaptionHeight);
  let valuesY = valuesTop + valuesCaptionHeight;
  cell(left, valuesY, coreWidth + statementWidth, valuesHeaderOne, { fill: cream, stroke: line });
  cell(left, valuesY, coreWidth, valuesHeaderOne, { fill: cream, stroke: line });
  cell(left + coreWidth, valuesY, statementWidth, valuesHeaderOne, { fill: cream, stroke: line });
  cell(left + coreWidth + statementWidth, valuesY, ratingWidth * 4, valuesHeaderOne,
    { fill: cream, stroke: line });
  setFont('bold', 4.1, ink);
  centeredText('Core values', left, valuesY + valuesHeaderOne / 2, coreWidth, { inset: 0.6 });
  centeredText('Behavior statements', left + coreWidth, valuesY + valuesHeaderOne / 2,
    statementWidth, { inset: 0.6 });
  centeredText('Quarter', left + coreWidth + statementWidth, valuesY + valuesHeaderOne / 2,
    ratingWidth * 4, { inset: 0.4 });
  valuesY += valuesHeaderOne;
  cell(left, valuesY, coreWidth, valuesHeaderTwo, { fill: cream, stroke: line });
  cell(left + coreWidth, valuesY, statementWidth, valuesHeaderTwo, { fill: cream, stroke: line });
  for (let q = 0; q < 4; q += 1) {
    const x = left + coreWidth + statementWidth + q * ratingWidth;
    cell(x, valuesY, ratingWidth, valuesHeaderTwo, { fill: cream, stroke: line });
    setFont('bold', 4.1, ink);
    centeredText(String(q + 1), x, valuesY + valuesHeaderTwo / 2, ratingWidth, { inset: 0.2 });
  }
  valuesY += valuesHeaderTwo;

  const observedValues = [
    ['makaDiyos', '1. Maka-Diyos', [
      "Expresses one's spiritual beliefs while respecting the spiritual beliefs of others",
      'Demonstrates adherence to ethical principles by upholding truth'
    ]],
    ['makatao', '2. Makatao', [
      'Is sensitive to individual, social, and cultural differences',
      'Demonstrates contributions toward solidarity'
    ]],
    ['makakalikasan', '3. Maka-kalikasan', [
      'Cares for the environment and utilizes resources wisely, judiciously, and economically',
      'Demonstrates stewardship in keeping a flourishing environment'
    ]],
    ['makabansa', '4. Makabansa', [
      'Demonstrates pride in being a Filipino; expresses the rights and responsibilities of a Filipino citizen',
      'Demonstrates appropriate behavior in carrying out activities in the school, community, and country'
    ]]
  ];
  observedValues.forEach(function (entry: any) {
    const groupHeight = valuesRowHeight * 2;
    const groupTop = valuesY;
    cell(left, groupTop, coreWidth, groupHeight, { stroke: line });
    const ratings = student.observedValues && student.observedValues[entry[0]] || {};
    setFont('normal', 4.1, ink);
    centeredText(entry[1], left, groupTop + groupHeight / 2, coreWidth, { inset: 0.6 });
    entry[2].forEach(function (statement: any, statementIndex: any) {
      const rowY = groupTop + statementIndex * valuesRowHeight;
      cell(left + coreWidth, rowY, statementWidth, valuesRowHeight, { stroke: line });
      setFont('normal', 4.1, ink);
      leftText(statement, left + coreWidth, rowY + valuesRowHeight / 2, statementWidth,
        { inset: 0.9 });
      for (let q = 0; q < 4; q += 1) {
        const x = left + coreWidth + statementWidth + q * ratingWidth;
        cell(x, rowY, ratingWidth, valuesRowHeight, { stroke: line });
        setFont('bold', 4.6, ink);
        centeredText(ratings['q' + (q + 1)] || '-', x, rowY + valuesRowHeight / 2,
          ratingWidth, { inset: 0.2 });
      }
    });
    valuesY += groupHeight;
  });

  /* ---------- Semester grade tables ---------- */
  function semesterAverage(semester: any) {
    const average = semAvg(student, semester.key);
    return average === null ? '-' : String(average);
  }

  function gradeValue(value: any) {
    return value === null || value === undefined || value === '' || Number.isNaN(Number(value))
      ? '-' : String(value);
  }

  function drawSemester(semester: any, top: any, bottom: any) {
    const headingHeight = 3.2;
    setFont('bold', 7.4, ink);
    doc.setFont('times', 'bold');
    doc.setFontSize(S(7.4));
    setTextColor(doc, ink);
    doc.text(pdfSafe(semester.label), X(rightX), Y(top + headingHeight * 0.55),
      { align: 'left', baseline: 'middle' });

    const tableTop = top + headingHeight + 0.8;
    let tableHeight = bottom - tableTop;
    const headerOne = 4.6;
    const headerTwo = 3.4;
    const groupHeight = 3.8;
    const averageHeight = 5.0;
    const subjectCount = semester.groups.reduce(function (sum: any, group: any) { return sum + group.subjects.length; }, 0);
    let subjectHeight = (tableHeight - headerOne - headerTwo - semester.groups.length * groupHeight - averageHeight) / subjectCount;
    if (portrait && subjectHeight > 10.5) {
      // A strand with few subjects: keep the rows a sensible height instead of stretching them over the page.
      subjectHeight = 10.5;
      tableHeight = headerOne + headerTwo + semester.groups.length * groupHeight + averageHeight + subjectCount * subjectHeight;
    }
    const subjectWidth = rightWidth * 0.38;
    const scoreWidth = rightWidth * 0.14;
    const finalWidth = rightWidth * 0.16;
    const remarksWidth = rightWidth - subjectWidth - scoreWidth * 2 - finalWidth;
    const scoresX = rightX + subjectWidth;
    const finalX = scoresX + scoreWidth * 2;
    const remarksX = finalX + finalWidth;

    cell(rightX, tableTop, rightWidth, tableHeight, { stroke: [55, 52, 46], lineWidth: 0.4 });
    // Header: Subjects, Quarter (two columns), Semester Final Grade.
    cell(rightX, tableTop, subjectWidth, headerOne + headerTwo,
      { fill: tan, stroke: line, lineWidth: 0.3 });
    cell(scoresX, tableTop, scoreWidth * 2, headerOne,
      { fill: tan, stroke: line, lineWidth: 0.3 });
    cell(finalX, tableTop, finalWidth, headerOne + headerTwo,
      { fill: tan, stroke: line, lineWidth: 0.3 });
    cell(remarksX, tableTop, remarksWidth, headerOne + headerTwo,
      { fill: tan, stroke: line, lineWidth: 0.3 });
    cell(scoresX, tableTop + headerOne, scoreWidth, headerTwo,
      { fill: tan, stroke: line, lineWidth: 0.3 });
    cell(scoresX + scoreWidth, tableTop + headerOne, scoreWidth, headerTwo,
      { fill: tan, stroke: line, lineWidth: 0.3 });
    setFont('bold', 4.8, ink);
    leftText('Subjects', rightX, tableTop + (headerOne + headerTwo) / 2, subjectWidth,
      { inset: 1.0 });
    centeredText('Quarter', scoresX, tableTop + headerOne / 2, scoreWidth * 2, { inset: 0.4 });
    setFont('bold', 4.2, ink);
    centeredText('Semester', finalX, tableTop + headerOne / 2 + 0.4, finalWidth, { inset: 0.3 });
    centeredText('Final Grade', finalX, tableTop + headerOne / 2 + 2.1, finalWidth, { inset: 0.3 });
    setFont('bold', 4.8, ink);
    centeredText('Remarks', remarksX, tableTop + (headerOne + headerTwo) / 2, remarksWidth, { inset: 0.3 });
    semester.quarterLabels.forEach(function (label: any, index: any) {
      centeredText(label, scoresX + index * scoreWidth, tableTop + headerOne + headerTwo / 2,
        scoreWidth, { inset: 0.2 });
    });

    let rowY = tableTop + headerOne + headerTwo;
    semester.groups.forEach(function (group: any) {
      cell(rightX, rowY, rightWidth, groupHeight, { fill: tan, stroke: line, lineWidth: 0.3 });
      setFont('bold', 4.4, ink);
      leftText(group.name, rightX, rowY + groupHeight / 2, rightWidth, { inset: 1.0 });
      rowY += groupHeight;
      group.subjects.forEach(function (item: any) {
        const subject = ALL_SUBJECTS.find(function (entry: any) { return entry.key === item[0]; })!;
        const grades: Record<string, any> = student.grades[subject.key] || {};
        cell(rightX, rowY, subjectWidth, subjectHeight, { stroke: line });
        cell(scoresX, rowY, scoreWidth, subjectHeight, { stroke: line });
        cell(scoresX + scoreWidth, rowY, scoreWidth, subjectHeight, { stroke: line });
        cell(finalX, rowY, finalWidth, subjectHeight, { stroke: line });
        cell(remarksX, rowY, remarksWidth, subjectHeight, { stroke: line });
        const subjectSize = fitFont(subject.name, 'normal', 4.6, subjectWidth - 2.2);
        setFont('normal', subjectSize, ink);
        leftText(subject.name, rightX, rowY + subjectHeight / 2, subjectWidth, { inset: 1.1 });
        [semester.quarters[0], semester.quarters[1], semester.finalKey].forEach(function (period: any, index: any) {
          const x = index < 2 ? scoresX + index * scoreWidth : finalX;
          const cellWidth = index < 2 ? scoreWidth : finalWidth;
          setFont(index === 2 ? 'bold' : 'normal', 4.8, ink);
          centeredText(gradeValue(grades[period]), x, rowY + subjectHeight / 2, cellWidth,
            { inset: 0.3 });
        });
        const remark = remarkFor(grades.final);
        setFont(remark === 'Failed' ? 'bold' : 'normal', 4.4, remark === 'Failed' ? [170, 20, 20] : ink);
        centeredText(remark, remarksX, rowY + subjectHeight / 2, remarksWidth, { inset: 0.3 });
        rowY += subjectHeight;
      });
    });

    cell(rightX, rowY, subjectWidth + scoreWidth * 2, averageHeight,
      { fill: cream, stroke: line, lineWidth: 0.3 });
    cell(finalX, rowY, finalWidth, averageHeight,
      { fill: cream, stroke: line, lineWidth: 0.3 });
    cell(remarksX, rowY, remarksWidth, averageHeight,
      { fill: cream, stroke: line, lineWidth: 0.3 });
    setFont('bold', 4.8, ink);
    leftText('General Average for the Semester', rightX,
      rowY + averageHeight / 2, subjectWidth + scoreWidth * 2, { inset: 1.0 });
    centeredText(semesterAverage(semester), finalX, rowY + averageHeight / 2, finalWidth,
      { inset: 0.3 });
    centeredText(remarkFor(semAvg(student, semester.key)), remarksX,
      rowY + averageHeight / 2, remarksWidth, { inset: 0.3 });
    return rowY + averageHeight; // where the table ends, so the next block can follow it
  }

  const strandSemesters = semestersFor(student.strand);
  let semestersEnd = 176.4;
  stage('grades');
  if (portrait) {
    const firstEnd = drawSemester(strandSemesters[0], 27.0, 107.0);
    semestersEnd = drawSemester(strandSemesters[1], firstEnd + 2.5, 194.0);
  } else {
    drawSemester(strandSemesters[0], 27.0, 105.0);
    drawSemester(strandSemesters[1], 107.4, 176.4);
  }

  /* ---------- Joined legend strip ---------- */
  // The legends follow the second semester (portrait) or sit at the foot of the page (landscape); tall enough for the parent/guardian to sign each quarter.
  const legendTop = portrait ? semestersEnd + 3 : 178.0;
  const legendHeight = portrait ? 22 : bodyBottom - legendTop;
  const legendGap = 0;
  const firstLegendWidth = rightWidth * (0.9 / 3.7);
  const middleLegendWidth = rightWidth * (1.9 / 3.7);
  const lastLegendWidth = rightWidth - firstLegendWidth - middleLegendWidth;
  const captionHeight = 4.0;

  function legendPanel(x: any, width: any, title: any, rows: any, columns: any) {
    const rowHeight = (legendHeight - captionHeight) / rows.length;
    cell(x, legendTop, width, legendHeight, { stroke: [55, 52, 46], lineWidth: 0.35 });
    cell(x, legendTop, width, captionHeight, { fill: tan, stroke: line, lineWidth: 0.3 });
    setFont('bold', 4.1, ink);
    centeredText(title, x, legendTop + captionHeight / 2, width, { inset: 0.4 });
    const columnWidths = columns || [width];
    let dividerX = x;
    columnWidths.slice(0, -1).forEach(function (columnWidth: any) {
      dividerX += columnWidth;
      setDrawColor(doc, line);
      doc.setLineWidth(S(0.22));
      doc.line(X(dividerX), Y(legendTop + captionHeight), X(dividerX), Y(legendTop + legendHeight));
    });
    rows.forEach(function (row: any, rowIndex: any) {
      const rowY = legendTop + captionHeight + rowIndex * rowHeight;
      if (rowIndex > 0) {
        setDrawColor(doc, line);
        doc.setLineWidth(S(0.22));
        doc.line(X(x), Y(rowY), X(x + width), Y(rowY));
      }
      let columnX = x;
      row.forEach(function (value: any, columnIndex: any) {
        const cellWidth = columnWidths[columnIndex] || width;
        setFont(columnIndex === 0 ? 'bold' : 'normal', 3.9, ink);
        leftText(value, columnX, rowY + rowHeight / 2, cellWidth, { inset: 0.7 });
        columnX += cellWidth;
      });
    });
  }

  const middleColumnWidths = [
    middleLegendWidth * 0.55,
    middleLegendWidth * 0.2,
    middleLegendWidth * 0.25
  ];
  const lastColumnWidths = [lastLegendWidth * 0.44, lastLegendWidth * 0.56];
  legendPanel(rightX, firstLegendWidth, 'Observed Values', [
    ['AO', 'Always Observed'],
    ['SO', 'Sometimes Observed'],
    ['RO', 'Rarely Observed'],
    ['NO', 'Not Observed']
  ], [firstLegendWidth * 0.3, firstLegendWidth * 0.7]);
  legendPanel(rightX + firstLegendWidth + legendGap, middleLegendWidth,
    'Learning Progress & Achievement', [
      ['Outstanding', '90-100', 'Passed'],
      ['Very Satisfactory', '85-89', 'Passed'],
      ['Satisfactory', '80-84', 'Passed'],
      ['Fairly Satisfactory', '75-79', 'Passed'],
      ['Did Not Meet Expectations', 'below 75', 'Failed']
    ], middleColumnWidths);
  legendPanel(rightX + firstLegendWidth + middleLegendWidth + legendGap * 2,
    lastLegendWidth, 'Parent/Guardian\'s Signature', [
      ['1st Q', ''],
      ['2nd Q', ''],
      ['3rd Q', ''],
      ['4th Q', '']
    ], lastColumnWidths);
}

let logoCache: { source: string; promise: Promise<string> } | null = null;

export function loadLogoData(source: string): Promise<string> {
  if (!logoCache || logoCache.source !== source) {
    const promise = new Promise<string>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas is unavailable.');
          context.drawImage(image, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (error) { reject(error); }
      };
      image.onerror = () => reject(new Error('The school logo could not be loaded.'));
      image.src = source;
    });
    promise.catch(() => { logoCache = null; });
    logoCache = { source, promise };
  }
  return logoCache.promise;
}

export { pdfSafe, safeFilename };

export interface Downloaded { filename: string; size: number }

/** Starts the browser download of a file and tells the caller its name and size. */
export function saveBlob(blob: Blob, filename: string): Downloaded {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { filename, size: blob.size };
}

/** Builds the report-card PDF (A4 portrait, front and back for every learner) without saving it. */
async function buildReportCardsPdf(reports: Student[], context: ReportContext, state: AppState, single: boolean) {
  const { jsPDF: PDF } = await import('jspdf');
  const logoData = await loadLogoData(state.school.logo || '/assets/ui-logo.png');
  const doc = new PDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const first = reports[0];
  const title = single ? `${context.term} report card for ${first.name}` : `${context.term} report cards for ${context.className}`;
  doc.setProperties({ title: pdfSafe(title), subject: 'GradeFlow AI report card', author: state.teacher, creator: 'GradeFlow AI' });
  reports.forEach((student, index) => {
    if (index > 0) doc.addPage();
    drawFront(doc, student, context, logoData, 'portrait');
  });
  // e.g. SF9_UI-FA-ABM12-1_Princess-Cullo.pdf: the document, the section and the learner, so files sort and search well
  const filename = single
    ? `SF9_${safeFilename(first.section || context.section || 'Class')}_${safeFilename(first.name)}.pdf`
    : `SF9_${safeFilename(context.className)}_${reports.length}-Reports.pdf`;
  return { doc, filename };
}

/** Several learners: a ZIP with one folder per strand (STEM, GAS, HUMSS...), each holding one PDF per section. One learner: a single PDF. */
export async function downloadReportCards(
  reports: Student[], context: ReportContext, state: AppState,
  options: { single?: boolean; onProgress?: (done: number, total: number) => void } = {}
): Promise<Downloaded> {
  if (reports.length <= 1 || options.single) {
    const { doc, filename } = await buildReportCardsPdf(reports, context, state, true);
    return saveBlob(doc.output('blob'), filename);
  }
  const { zipSync } = await import('fflate');
  const folders = new Map<string, Map<string, Student[]>>();
  reports.forEach((student) => {
    const strand = safeFilename(student.strand || context.strand || 'Other');
    const section = safeFilename(student.section || context.section || 'Class');
    if (!folders.has(strand)) folders.set(strand, new Map());
    const sections = folders.get(strand)!;
    sections.set(section, [...(sections.get(section) ?? []), student]);
  });
  const files: Record<string, Uint8Array> = {};
  const totalSections = [...folders.values()].reduce((n, sections) => n + sections.size, 0);
  let doneSections = 0;
  options.onProgress?.(0, totalSections);
  for (const [strand, sections] of [...folders.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const [section, list] of [...sections.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
      const { doc } = await buildReportCardsPdf(list, context, state, false);
      files[`${strand}/SF9_${section}.pdf`] = new Uint8Array(doc.output('arraybuffer'));
      options.onProgress?.(++doneSections, totalSections);
      await new Promise((resolve) => setTimeout(resolve)); // let the page breathe between sections
    }
  }
  const zip = zipSync(files, { level: 0 }); // PDFs are already compressed
  return saveBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), `SF9_${safeFilename(context.className)}_${reports.length}-Reports.zip`);
}

/** A temporary address of the PDF, for showing it on screen. Release it with URL.revokeObjectURL. */
export async function reportCardsPdfUrl(reports: Student[], context: ReportContext, state: AppState, onlyPage?: 1 | 2): Promise<string> {
  const { doc } = await buildReportCardsPdf(reports, context, state, reports.length === 1);
  if (onlyPage && reports.length === 1) doc.deletePage(onlyPage === 1 ? 2 : 1); // preview one side at a time
  return URL.createObjectURL(doc.output('blob'));
}

/** Prints exactly the pages that the PDF download contains, so the preview, the print and the file always match. */
/** Opens the browser's print dialog for a PDF at `url` (through a hidden frame); the URL is released afterwards. */
export function printPdfUrl(url: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  const cleanup = () => { frame.remove(); URL.revokeObjectURL(url); };
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(cleanup, 120_000);
    } catch {
      window.open(url, '_blank'); // the browser would not print inside the page: open the PDF so it can be printed from there
      window.setTimeout(cleanup, 120_000);
    }
  };
  frame.src = url;
  document.body.appendChild(frame);
}

export async function printReportCards(reports: Student[], context: ReportContext, state: AppState): Promise<void> {
  printPdfUrl(await reportCardsPdfUrl(reports, context, state));
}
