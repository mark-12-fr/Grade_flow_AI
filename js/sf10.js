/* ==========================================================================
   SF10 · Senior High School permanent (scholastic) record
   Built from the verified grades, attendance and observed values. Nothing is invented:
   missing grades are shown as blanks and the record is marked incomplete.
   ========================================================================== */
(function () {
  'use strict';

  const GF = window.GradeFlow;
  const esc = GF.escape;
  const CORE_VALUES = [
    ['makaDiyos', 'Maka-Diyos'], ['makatao', 'Makatao'],
    ['makakalikasan', 'Maka-kalikasan'], ['makabansa', 'Makabansa']
  ];
  let index = 0;

  function cellValue(value) {
    return value !== undefined && value !== null && value !== '' && !Number.isNaN(Number(value)) ? String(value) : '';
  }

  function attendanceTotals(student) {
    const a = student.attendance || {};
    const sum = function (bag) {
      const values = GF.ATTENDANCE_MONTHS.map(function (month) { return (bag || {})[month.key]; })
        .filter(function (value) { return Number.isFinite(Number(value)) && value !== null && value !== ''; });
      return values.length ? values.reduce(function (total, value) { return total + Number(value); }, 0) : null;
    };
    return { days: sum(a.schoolDays), present: sum(a.months), absent: sum(a.absent) };
  }

  function isComplete(student) {
    return GF.studentStatus(student) === 'approved';
  }

  // Splits a full name into DepEd SF10 parts: "Last, First Middle" or "First Middle Last".
  function nameParts(full) {
    const raw = String(full || '').trim();
    if (raw.indexOf(',') > -1) {
      const bits = raw.split(',');
      const rest = bits.slice(1).join(' ').trim().split(/\s+/);
      return { last: bits[0].trim(), first: rest.length > 1 ? rest.slice(0, -1).join(' ') : (rest[0] || ''), middle: rest.length > 1 ? rest[rest.length - 1] : '' };
    }
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length < 2) return { last: raw, first: '', middle: '' };
    if (words.length === 2) return { last: words[1], first: words[0], middle: '' };
    return { last: words[words.length - 1], first: words.slice(0, -2).join(' '), middle: words[words.length - 2] };
  }

  function categoryOf(group) {
    return /^core/i.test(group.name) ? 'Core' : 'Applied / Specialized';
  }

  function semesterRows(student, semester) {
    const rows = [];
    semester.groups.forEach(function (group) {
      group.subjects.forEach(function (entry) {
        const g = student.grades[entry[0]] || {};
        rows.push({
          category: categoryOf(group), subject: entry[1],
          q1: cellValue(g[semester.quarters[0]]), q2: cellValue(g[semester.quarters[1]]),
          final: cellValue(g.final), action: cellValue(g.final) ? GF.remarkFor(g.final).toUpperCase() : ''
        });
      });
    });
    return rows;
  }

  function buildHTML(student) {
    const context = GF.reportContext();
    const n = nameParts(student.name);
    const sy = GF.prettyYear(GF.state.year);
    const dateOf = student.birthdate ? GF.formatLongDate(student.birthdate) : '';
    const blank = function (count) {
      return Array(count + 1).join('<tr class="sf10-blank"><td></td><td></td><td></td><td></td><td></td><td></td></tr>');
    };
    const semesters = GF.SEMESTERS.map(function (semester) {
      const rows = semesterRows(student, semester);
      const average = GF.semesterAverage(student, semester.key);
      return '<table class="sf10-info sf10-school"><tbody><tr>' +
        '<td><b>SCHOOL:</b> ' + esc(context.schoolName) + '</td><td><b>GRADE LEVEL:</b> ' + esc(GF.state.gradeLevel) + '</td>' +
        '<td><b>SY:</b> ' + esc(sy) + '</td><td><b>SEM:</b> ' + (semester.key === 'first' ? '1ST' : '2ND') + '</td></tr>' +
        '<tr><td colspan="2"><b>TRACK/STRAND:</b> ' + esc(GF.state.strand) + '</td><td colspan="2"><b>SECTION:</b> ' + esc(GF.state.section) + '</td></tr></tbody></table>' +
        '<table class="sf10-table sf10-grades"><thead><tr><th rowspan="2" class="sf10-cat">Indicate if Subject is CORE, APPLIED, or SPECIALIZED</th><th rowspan="2">SUBJECTS</th>' +
        '<th colspan="2">Quarter</th><th rowspan="2">SEM FINAL GRADE</th><th rowspan="2">ACTION TAKEN</th></tr>' +
        '<tr><th>' + ordinal(semester.quarterLabels[0]) + '</th><th>' + ordinal(semester.quarterLabels[1]) + '</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + esc(r.category) + '</td><td class="sf10-subject">' + esc(r.subject) + '</td><td>' + r.q1 + '</td><td>' + r.q2 +
            '</td><td>' + r.final + '</td><td class="' + (r.action === 'FAILED' ? 'sf10-failed' : '') + '">' + r.action + '</td></tr>';
        }).join('') + blank(2) +
        '<tr class="sf10-average"><th colspan="4" scope="row">General Ave. for the Semester:</th><td>' + (average === null ? '' : average) + '</td><td>' + (average === null ? '' : GF.remarkFor(average).toUpperCase()) + '</td></tr></tbody></table>' +
        '<p class="sf10-remarks"><b>REMARKS:</b></p>' +
        '<table class="sf10-info sf10-sign"><tbody><tr><td><b>Prepared by:</b><span class="sf10-line"></span>' + esc(GF.state.teacher) + '<small>Signature of Adviser over Printed Name</small></td>' +
        '<td><b>Certified True and Correct:</b><span class="sf10-line"></span>' + esc(GF.state.school.principal) + ', SHS Principal<small>Signature of Authorized Person over Printed Name, Designation</small></td>' +
        '<td><b>Date Checked (MM/DD/YYYY):</b><span class="sf10-line"></span></td></tr></tbody></table>' +
        '<table class="sf10-table sf10-remedial"><thead><tr><th colspan="6" class="sf10-left">REMEDIAL CLASSES &nbsp; Conducted from (MM/DD/YYYY): ________ to (MM/DD/YYYY): ________ &nbsp; SCHOOL: ________ &nbsp; SCHOOL ID: ________</th></tr>' +
        '<tr><th>Indicate if Subject is CORE, APPLIED, or SPECIALIZED</th><th>SUBJECTS</th><th>SEM FINAL GRADE</th><th>REMEDIAL CLASS MARK</th><th>RECOMPUTED FINAL GRADE</th><th>ACTION TAKEN</th></tr></thead><tbody>' + blank(3) + '</tbody></table>' +
        '<p class="sf10-remarks">Name of Teacher/Adviser: ____________________ &nbsp; Signature: ____________________</p>';
    }).join('');

    return '<div class="sf10-head"><span class="sf10-formno">SF10-SHS</span>' +
      '<img class="sf10-seal" src="assets/deped-seal.png" alt="DepEd seal">' +
      '<div class="sf10-title"><p>REPUBLIC OF THE PHILIPPINES</p><p>DEPARTMENT OF EDUCATION</p>' +
      '<h2>SENIOR HIGH SCHOOL STUDENT PERMANENT RECORD</h2></div>' +
      '<img class="sf10-deped" src="assets/deped-logo.png" alt="DepEd logo"></div>' +
      (isComplete(student) ? '' : '<p class="sf10-incomplete" role="status">Incomplete record: some grades are still missing. Fix them in Grade Verification.</p>') +
      '<div class="sf10-band">LEARNER\'S INFORMATION</div>' +
      '<table class="sf10-info"><tbody>' +
      '<tr><td><b>LAST NAME:</b> ' + esc(n.last) + '</td><td><b>FIRST NAME:</b> ' + esc(n.first) + '</td><td><b>MIDDLE NAME:</b> ' + esc(n.middle) + '</td></tr>' +
      '<tr><td><b>LRN:</b> ' + esc(student.lrn || '') + '</td><td><b>Date of Birth (MM/DD/YYYY):</b> ' + esc(dateOf) + '</td><td><b>Sex:</b> ' + esc(student.sex || '') + '</td></tr></tbody></table>' +
      '<div class="sf10-band">ELIGIBILITY FOR SHS ENROLMENT</div>' +
      '<table class="sf10-info"><tbody>' +
      '<tr><td>&#9744; High School Completer* &nbsp; Gen. Ave: ____</td><td>&#9744; Junior High School Completer &nbsp; Gen. Ave: ____</td></tr>' +
      '<tr><td>Date of Graduation/Completion (MM/DD/YYYY): ________</td><td>Name of School: ________ &nbsp; School Address: ________</td></tr>' +
      '<tr><td>&#9744; PEPT Passer** Rating: ____ &nbsp; &#9744; ALS A&amp;E Passer*** Rating: ____</td><td>Others (Pls. Specify): ________</td></tr></tbody></table>' +
      '<div class="sf10-band">SCHOLASTIC RECORD</div>' + semesters +
      '<div class="sf10-band"></div>' +
      '<table class="sf10-info"><tbody><tr><td><b>Track/Strand Accomplished:</b> ' + esc(GF.state.strand) + '</td><td><b>SHS General Average:</b> ' + esc(annualAverage(student)) + '</td></tr>' +
      '<tr><td><b>Awards/Honors Received:</b></td><td><b>Date of SHS Graduation (MM/DD/YYYY):</b></td></tr>' +
      '<tr><td><b>Certified by:</b><span class="sf10-line"></span>' + esc(GF.state.school.principal) + '<small>Signature of School Head over Printed Name</small></td><td><b>Place School Seal Here:</b><br><br><br></td></tr></tbody></table>' +
      '<p class="sf10-note"><b>NOTE:</b> This permanent record or a photocopy of this permanent record that bears the seal of the school and the original signature in ink of the School Head shall be considered valid for all legal purposes. Any erasure or alteration made on this copy should be validated by the School Head. If the student transfers to another school, the originating school should produce one (1) certified true copy of this permanent record for safekeeping. The receiving school shall continue filling up the original form. Upon graduation, the school from which the student graduated should keep the original form and produce one (1) certified true copy for the Division Office.</p>' +
      '<p class="sf10-remarks"><b>REMARKS:</b> (Please indicate the purpose for which this permanent record will be used) &nbsp; Date Issued (MM/DD/YYYY): ________</p>';
  }

  function annualAverage(student) {
    const value = GF.averageGrade ? GF.averageGrade(student) : null;
    return value === null || value === undefined ? '' : String(value);
  }

  function ordinal(n) { return ({ 1: '1ST', 2: '2ND', 3: '3RD', 4: '4TH' })[n] || String(n); }

  /* ---------- PDF ---------- */
  function jsPdfClass() {
    return (window.jspdf && (window.jspdf.jsPDF || window.jspdf.default)) || null;
  }

  function safe(value) {
    return String(value == null ? '' : value)
      .replace(/[‐-―−]/g, '-').replace(/[·•]/g, '-')
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '?');
  }

  const logos = { seal: null, deped: null };

  function loadImage(url) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        try { resolve(canvas.toDataURL('image/png')); } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  function loadLogos() {
    if (logos.seal && logos.deped) return Promise.resolve();
    return Promise.all([loadImage('assets/deped-seal.png'), loadImage('assets/deped-logo.png')]).then(function (r) { logos.seal = r[0]; logos.deped = r[1]; });
  }

  function drawPage(doc, student) {
    const context = GF.reportContext();
    const n = nameParts(student.name);
    const left = 10;
    const width = 190;
    const GREY = [190, 190, 190];
    let y = 10;
    const text = function (value, x, yy, options) { doc.text(safe(value), x, yy, options); };
    const fit = function (value, w) {
      const base = doc.getFontSize();
      let size = base;
      while (size > 4.5 && doc.getTextWidth(safe(value)) > w - 1.6) { size -= 0.25; doc.setFontSize(size); }
      return base;
    };
    const cell = function (value, x, w, h, opts) {
      opts = opts || {};
      if (opts.fill) { doc.setFillColor(opts.fill[0], opts.fill[1], opts.fill[2]); doc.rect(x, y, w, h, 'FD'); } else doc.rect(x, y, w, h);
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      const base = fit(value, w);
      if (opts.align === 'center') text(value, x + w / 2, y + h * 0.66, { align: 'center' });
      else text(value, x + 1, y + h * 0.66);
      doc.setFontSize(base);
    };
    const row = function (cols, widths, h, opts) {
      let x = left;
      cols.forEach(function (value, i) { cell(value, x, widths[i], h, opts); x += widths[i]; });
      y += h;
    };
    const band = function (label) {
      doc.setFillColor(GREY[0], GREY[1], GREY[2]); doc.rect(left, y, width, 4, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); text(label, 105, y + 2.9, { align: 'center' }); y += 4;
    };

    doc.setLineWidth(0.2); doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6); text('SF10-SHS', 200, y, { align: 'right' });
    if (logos.seal) doc.addImage(logos.seal, 'PNG', 14, y - 1, 17, 17);
    if (logos.deped) doc.addImage(logos.deped, 'PNG', 168, y + 1, 30, 15.4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); text('REPUBLIC OF THE PHILIPPINES', 105, y + 1, { align: 'center' });
    text('DEPARTMENT OF EDUCATION', 105, y + 4.5, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); text('SENIOR HIGH SCHOOL STUDENT PERMANENT RECORD', 105, y + 10, { align: 'center' }); y += 17;
    if (!isComplete(student)) {
      doc.setTextColor(170, 20, 20); doc.setFontSize(7);
      text('INCOMPLETE RECORD: some grades are missing.', 105, y, { align: 'center' }); doc.setTextColor(0, 0, 0); y += 3;
    }

    doc.setFontSize(6.5);
    band("LEARNER'S INFORMATION");
    row(['LAST NAME: ' + n.last, 'FIRST NAME: ' + n.first, 'MIDDLE NAME: ' + n.middle], [63, 63, 64], 4.4, { bold: false });
    row(['LRN: ' + (student.lrn || ''), 'Date of Birth (MM/DD/YYYY): ' + (student.birthdate || ''), 'Sex: ' + (student.sex || '')], [63, 63, 64], 4.4);
    band('ELIGIBILITY FOR SHS ENROLMENT');
    row(['[  ] High School Completer*   Gen. Ave: ______', '[  ] Junior High School Completer   Gen. Ave: ______'], [95, 95], 4.2);
    row(['Date of Graduation/Completion (MM/DD/YYYY):', 'Name of School:                         School Address:'], [95, 95], 4.2);
    row(['[  ] PEPT Passer**  Rating: ____   [  ] ALS A&E Passer***  Rating: ____', 'Others (Pls. Specify):'], [95, 95], 4.2);
    band('SCHOLASTIC RECORD');

    const widths = [32, 90, 17, 17, 17, 17];
    GF.SEMESTERS.forEach(function (semester, si) {
      if (si > 0) { doc.addPage(); y = 10; }
      doc.setFontSize(6.5);
      row(['SCHOOL: ' + context.schoolName, 'GRADE LEVEL: ' + GF.state.gradeLevel + '    SY: ' + GF.prettyYear(GF.state.year) + '    SEM: ' + (semester.key === 'first' ? '1ST' : '2ND')], [122, 68], 4.2);
      row(['TRACK/STRAND: ' + GF.state.strand, 'SECTION: ' + GF.state.section], [122, 68], 4.2);
      // two-level header
      cell('', left, widths[0], 9, { fill: GREY });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5);
      ['Indicate if Subject is', 'CORE, APPLIED, or', 'SPECIALIZED'].forEach(function (line, k) { text(line, left + widths[0] / 2, y + 3 + k * 2.2, { align: 'center' }); });
      doc.setFontSize(6.5);
      cell('SUBJECTS', left + widths[0], widths[1], 9, { bold: true, fill: GREY, align: 'center' });
      cell('Quarter', left + 122, 34, 4.5, { bold: true, fill: GREY, align: 'center' });
      cell('SEM FINAL GRADE', left + 156, widths[4] , 9, { bold: true, fill: GREY, align: 'center' });
      cell('ACTION TAKEN', left + 173, widths[5], 9, { bold: true, fill: GREY, align: 'center' });
      y += 4.5;
      cell(ordinal(semester.quarterLabels[0]), left + 122, 17, 4.5, { bold: true, fill: GREY, align: 'center' });
      cell(ordinal(semester.quarterLabels[1]), left + 139, 17, 4.5, { bold: true, fill: GREY, align: 'center' });
      y += 4.5;
      const rows = semesterRows(student, semester);
      rows.forEach(function (r) {
        let x = left;
        [r.category, r.subject, r.q1, r.q2, r.final, r.action].forEach(function (v, k) {
          cell(v, x, widths[k], 4.6, { align: k > 1 ? 'center' : 'left' }); x += widths[k];
        });
        y += 4.6;
      });
      for (let i = 0; i < 3; i += 1) row(['', '', '', '', '', ''], widths, 4.6);
      const avg = GF.semesterAverage(student, semester.key);
      cell('General Ave. for the Semester:', left, 154, 4.8, { bold: true, fill: GREY });
      cell(avg === null ? '' : String(avg), left + 154, 17, 4.8, { bold: true, align: 'center' });
      cell(avg === null ? '' : GF.remarkFor(avg).toUpperCase(), left + 171, 19, 4.8, { bold: true, align: 'center' });
      y += 4.8;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); text('REMARKS:', left, y + 3.5); y += 6;
      row(['Prepared by:', 'Certified True and Correct:', 'Date Checked (MM/DD/YYYY):'], [63, 80, 47], 4.2, { bold: true });
      doc.setFont('helvetica', 'normal');
      text(GF.state.teacher, left + 31, y + 5, { align: 'center' });
      text(GF.state.school.principal + ', SHS Principal', left + 103, y + 5, { align: 'center' });
      doc.line(left + 3, y + 5.8, left + 60, y + 5.8); doc.line(left + 66, y + 5.8, left + 140, y + 5.8); doc.line(left + 146, y + 5.8, left + 188, y + 5.8);
      doc.setFontSize(5); text('Signature of Adviser over Printed Name', left + 31, y + 8, { align: 'center' });
      text('Signature of Authorized Person over Printed Name, Designation', left + 103, y + 8, { align: 'center' });
      y += 11; doc.setFontSize(6.5);
      row(['REMEDIAL CLASSES    Conducted from (MM/DD/YYYY):             to (MM/DD/YYYY):             SCHOOL:                                   SCHOOL ID:'], [190], 4.4, { bold: true });
      row(['Subject Type', 'SUBJECTS', 'SEM FINAL', 'REMEDIAL MARK', 'RECOMPUTED', 'ACTION TAKEN'], widths, 4.6, { bold: true, fill: GREY, align: 'center' });
      for (let i = 0; i < 3; i += 1) row(['', '', '', '', '', ''], widths, 4.4);
      doc.setFont('helvetica', 'normal'); text('Name of Teacher/Adviser:                                                              Signature:', left, y + 4); y += 8;
    });

    // Final certification block (last page)
    y += 2;
    band('');
    row(['Track/Strand Accomplished: ' + GF.state.strand, 'SHS General Average: ' + annualAverage(student)], [110, 80], 4.6, { bold: true });
    row(['Awards/Honors Received:', 'Date of SHS Graduation (MM/DD/YYYY):'], [110, 80], 4.6, { bold: true });
    row(['Certified by: ' + GF.state.school.principal, 'Place School Seal Here:'], [110, 80], 14, { bold: true });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5);
    const note = doc.splitTextToSize('NOTE: This permanent record or a photocopy of this permanent record that bears the seal of the school and the original signature in ink of the School Head shall be considered valid for all legal purposes. Any erasure or alteration made on this copy should be validated by the School Head. If the student transfers to another school, the originating school should produce one (1) certified true copy of this permanent record for safekeeping. The receiving school shall continue filling up the original form. Upon graduation, the school from which the student graduated should keep the original form and produce one (1) certified true copy for the Division Office.', 190);
    doc.text(note, left, y + 4); y += 4 + note.length * 2.4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
    text('REMARKS: (Please indicate the purpose for which this permanent record will be used)        Date Issued (MM/DD/YYYY):', left, y + 3);
  }

  function download(students, filename) {
    const JsPDF = jsPdfClass();
    if (!JsPDF) { GF.showToast('PDF support did not load. Reload the page and try again.', 'error'); return; }
    loadLogos().then(function () { buildPdf(JsPDF, students, filename); });
  }

  function buildPdf(JsPDF, students, filename) {
    const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    students.forEach(function (student, i) {
      if (i > 0) doc.addPage();
      drawPage(doc, student);
    });
    doc.save(filename);
  }

  /* ---------- Page ---------- */
  function current() {
    const total = GF.state.students.length;
    index = Math.min(Math.max(0, index), Math.max(0, total - 1));
    return GF.state.students[index] || null;
  }

  function render() {
    const select = document.getElementById('sf10-student-select');
    const sheet = document.getElementById('sf10-sheet');
    if (!select || !sheet) return;
    const student = current();
    select.innerHTML = GF.state.students.map(function (entry, i) {
      return '<option value="' + i + '">' + (entry.lrn ? esc(entry.lrn) + ' — ' : '') + esc(entry.name) + '</option>';
    }).join('');
    select.value = String(index);
    document.getElementById('sf10-position').textContent = student ? (index + 1) + ' of ' + GF.state.students.length : '0 of 0';
    sheet.innerHTML = student ? buildHTML(student) : '<p class="sf10-incomplete">Upload a class first.</p>';
    ['sf10-download-one', 'sf10-download-all'].forEach(function (id) { document.getElementById(id).disabled = !student; });
  }

  function bind() {
    const on = function (id, event, handler) { const el = document.getElementById(id); if (el) el.addEventListener(event, handler); };
    on('sf10-student-select', 'change', function (e) { index = Number(e.target.value); render(); });
    on('sf10-prev', 'click', function () { index -= 1; render(); });
    on('sf10-next', 'click', function () { index += 1; render(); });
    on('sf10-download-one', 'click', function () {
      const student = current();
      if (student) download([student], 'SF10-' + safe(student.lrn || student.name).replace(/\W+/g, '_') + '.pdf');
    });
    on('sf10-download-all', 'click', function () {
      download(GF.state.students, 'SF10-' + safe(GF.state.section).replace(/\W+/g, '_') + '.pdf');
    });
  }

  GF.registerPage('sf10', render);
  window.GradeFlowSf10 = { buildHTML: buildHTML, download: download };
  document.addEventListener('DOMContentLoaded', bind);
})();
