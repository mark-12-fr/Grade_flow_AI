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

  function buildHTML(student) {
    const context = GF.reportContext();
    const totals = attendanceTotals(student);
    const semesters = GF.SEMESTERS.map(function (semester) {
      const rows = semester.groups.map(function (group) {
        return '<tr class="sf10-group"><th colspan="5" scope="colgroup">' + esc(group.name) + '</th></tr>' +
          group.subjects.map(function (entry) {
            const grades = student.grades[entry[0]] || {};
            const remark = GF.remarkFor(grades.final);
            return '<tr><td>' + esc(entry[1]) + '</td>' +
              '<td>' + cellValue(grades[semester.quarters[0]]) + '</td>' +
              '<td>' + cellValue(grades[semester.quarters[1]]) + '</td>' +
              '<td><strong>' + cellValue(grades.final) + '</strong></td>' +
              '<td class="' + (remark === 'Failed' ? 'sf10-failed' : '') + '">' + remark + '</td></tr>';
          }).join('');
      }).join('');
      const average = GF.semesterAverage(student, semester.key);
      return '<section class="sf10-semester"><h4>' + esc(semester.label) + '</h4>' +
        '<table class="sf10-table"><thead><tr><th scope="col">Subjects</th>' +
        '<th scope="col">Q' + semester.quarterLabels[0] + '</th><th scope="col">Q' + semester.quarterLabels[1] + '</th>' +
        '<th scope="col">Final</th><th scope="col">Remarks</th></tr></thead><tbody>' + rows +
        '<tr class="sf10-average"><th scope="row" colspan="3">General Average for the Semester</th>' +
        '<td>' + (average === null ? '' : average) + '</td><td>' + GF.remarkFor(average) + '</td></tr></tbody></table></section>';
    }).join('');

    const values = CORE_VALUES.map(function (pair) {
      const ratings = (student.observedValues || {})[pair[0]] || {};
      return '<tr><th scope="row">' + pair[1] + '</th>' + ['q1', 'q2', 'q3', 'q4'].map(function (q) {
        return '<td>' + esc(ratings[q] || '') + '</td>';
      }).join('') + '</tr>';
    }).join('');

    return '<div class="sf10-head"><p>Republic of the Philippines · Department of Education</p>' +
      '<h3>' + esc(context.schoolName) + '</h3>' +
      '<h2>Senior High School Student Permanent Record (SF10)</h2></div>' +
      (isComplete(student) ? '' : '<p class="sf10-incomplete" role="status">Incomplete record: some grades are still missing. Fix them in Grade Verification.</p>') +
      '<table class="sf10-info"><tbody>' +
      '<tr><th scope="row">Learner</th><td colspan="3">' + esc(student.name) + '</td></tr>' +
      '<tr><th scope="row">LRN</th><td>' + esc(student.lrn || '') + '</td><th scope="row">Sex</th><td>' + esc(student.sex || '') + '</td></tr>' +
      '<tr><th scope="row">Birthdate</th><td>' + esc(student.birthdate ? GF.formatLongDate(student.birthdate) : '') + '</td>' +
      '<th scope="row">Age</th><td>' + esc(student.age || '') + '</td></tr>' +
      '<tr><th scope="row">Grade · Strand</th><td>Grade ' + esc(GF.state.gradeLevel) + ' · ' + esc(GF.state.strand) + '</td>' +
      '<th scope="row">Section</th><td>' + esc(GF.state.section) + '</td></tr>' +
      '<tr><th scope="row">School year</th><td>' + esc(GF.prettyYear(GF.state.year)) + '</td>' +
      '<th scope="row">Adviser</th><td>' + esc(GF.state.teacher) + '</td></tr></tbody></table>' +
      '<div class="sf10-semesters">' + semesters + '</div>' +
      '<div class="sf10-bottom"><table class="sf10-table"><caption>Attendance (school year)</caption><tbody>' +
      '<tr><th scope="row">School days</th><td>' + (totals.days === null ? '' : totals.days) + '</td></tr>' +
      '<tr><th scope="row">Days present</th><td>' + (totals.present === null ? '' : totals.present) + '</td></tr>' +
      '<tr><th scope="row">Days absent</th><td>' + (totals.absent === null ? '' : totals.absent) + '</td></tr></tbody></table>' +
      '<table class="sf10-table"><caption>Observed values</caption><thead><tr><th scope="col">Core value</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th></tr></thead><tbody>' + values + '</tbody></table></div>' +
      '<div class="sf10-sign"><div><span></span>' + esc(GF.state.teacher) + '<small>Class adviser</small></div>' +
      '<div><span></span>' + esc(GF.state.school.principal) + '<small>School principal</small></div></div>';
  }

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

  function drawPage(doc, student) {
    const context = GF.reportContext();
    const left = 12;
    const width = 186;
    let y = 14;
    const text = function (value, x, yy, options) { doc.text(safe(value), x, yy, options); };
    const row = function (cols, widths, height, bold, fill) {
      let x = left;
      const baseSize = doc.getFontSize();
      cols.forEach(function (value, i) {
        if (fill) { doc.setFillColor(fill[0], fill[1], fill[2]); doc.rect(x, y, widths[i], height, 'FD'); } else doc.rect(x, y, widths[i], height);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        let size = baseSize;
        while (size > 5 && doc.getTextWidth(safe(value)) > widths[i] - 2.4) { size -= 0.25; doc.setFontSize(size); }
        text(value, x + 1.2, y + height * 0.68);
        doc.setFontSize(baseSize);
        x += widths[i];
      });
      y += height;
    };

    doc.setLineWidth(0.2);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    text('Republic of the Philippines - Department of Education', 105, y, { align: 'center' }); y += 4.5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    text(context.schoolName, 105, y, { align: 'center' }); y += 5;
    doc.setFontSize(10);
    text('Senior High School Student Permanent Record (SF10)', 105, y, { align: 'center' }); y += 5;
    if (!isComplete(student)) {
      doc.setTextColor(170, 20, 20); doc.setFontSize(8);
      text('INCOMPLETE RECORD: some grades are missing.', 105, y, { align: 'center' }); doc.setTextColor(0, 0, 0); y += 4;
    }
    doc.setFontSize(8);
    const info = [
      ['Learner', student.name, 'LRN', student.lrn || ''],
      ['Birthdate', student.birthdate || '', 'Sex / Age', [student.sex, student.age].filter(Boolean).join(' / ')],
      ['Grade / Strand', 'Grade ' + GF.state.gradeLevel + ' - ' + GF.state.strand, 'Section', GF.state.section],
      ['School year', GF.prettyYear(GF.state.year), 'Adviser', GF.state.teacher]
    ];
    info.forEach(function (r) {
      row([r[0], r[1], r[2], r[3]], [28, 70, 28, 60], 5.2, false);
    });
    y += 3;

    GF.SEMESTERS.forEach(function (semester) {
      const widths = [96, 18, 18, 24, 30];
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      text(semester.label, left, y + 3); y += 4.5; doc.setFontSize(7.5);
      row(['Subjects', 'Q' + semester.quarterLabels[0], 'Q' + semester.quarterLabels[1], 'Final', 'Remarks'], widths, 4.8, true, [226, 220, 196]);
      semester.groups.forEach(function (group) {
        row([group.name, '', '', '', ''], widths, 4.2, true, [240, 237, 223]);
        group.subjects.forEach(function (entry) {
          const g = student.grades[entry[0]] || {};
          const f = function (v) { return cellValue(v); };
          row([entry[1], f(g[semester.quarters[0]]), f(g[semester.quarters[1]]), f(g.final), GF.remarkFor(g.final)], widths, 4.4, false);
        });
      });
      const avg = GF.semesterAverage(student, semester.key);
      row(['General Average for the Semester', '', '', avg === null ? '' : String(avg), GF.remarkFor(avg)], widths, 5, true, [240, 237, 223]);
      y += 3;
    });

    const totals = attendanceTotals(student);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    text('Attendance (school year)', left, y + 3); y += 4.5; doc.setFontSize(7.5);
    row(['School days', totals.days === null ? '' : String(totals.days), 'Days present', totals.present === null ? '' : String(totals.present), 'Days absent', totals.absent === null ? '' : String(totals.absent)], [31, 31, 31, 31, 31, 31], 4.8, false);
    y += 3;
    doc.setFont('helvetica', 'bold'); text('Observed values', left, y + 3); y += 4.5;
    row(['Core value', 'Q1', 'Q2', 'Q3', 'Q4'], [78, 27, 27, 27, 27], 4.6, true, [226, 220, 196]);
    CORE_VALUES.forEach(function (pair) {
      const r = (student.observedValues || {})[pair[0]] || {};
      row([pair[1], r.q1 || '', r.q2 || '', r.q3 || '', r.q4 || ''], [78, 27, 27, 27, 27], 4.4, false);
    });
    y = Math.max(y + 10, 268);
    doc.line(20, y, 80, y); doc.line(125, y, 185, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    text(GF.state.teacher + ' - Class adviser', 50, y + 4, { align: 'center' });
    text(GF.state.school.principal + ' - School principal', 155, y + 4, { align: 'center' });
  }

  function download(students, filename) {
    const JsPDF = jsPdfClass();
    if (!JsPDF) { GF.showToast('PDF support did not load. Reload the page and try again.', 'error'); return; }
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
