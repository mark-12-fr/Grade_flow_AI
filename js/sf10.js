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
  function nameParts(student) {
    if (student.lastName || student.firstName) {
      return { last: student.lastName || '', first: student.firstName || '', middle: student.middleName || '' };
    }
    const raw = String(student.name || '').trim();
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

  function ordinal(n) { return ({ 1: '1ST', 2: '2ND', 3: '3RD', 4: '4TH' })[n] || String(n); }

  function annualAverage(student) {
    const value = GF.averageGrade ? GF.averageGrade(student) : null;
    return value === null || value === undefined ? '' : String(value);
  }

  // The learners shown on this page: the ones read from an uploaded SF10, otherwise the class roster.
  function sourceList() {
    return Array.isArray(GF.state.sf10Students) && GF.state.sf10Students.length ? GF.state.sf10Students : GF.state.students;
  }

  const EMPTY_REMEDIAL = { from: '', to: '', school: '', schoolId: '', teacher: '', rows: [] };

  // One normal form for both sources (AI-read SF10 or grades built from the class roster).
  function recordFor(student) {
    const n = nameParts(student);
    const base = { last: n.last, first: n.first, middle: n.middle, lrn: student.lrn || '', sex: student.sex || '' };
    if (student.sf10) {
      const sf = student.sf10;
      const sems = (sf.semesters || []).map(function (sem) {
        const second = String(sem.sem) === '2';
        return Object.assign({}, sem, {
          semLabel: second ? '2ND' : '1ST', quarters: second ? ['3RD', '4TH'] : ['1ST', '2ND'],
          remedial: Object.assign({}, EMPTY_REMEDIAL, sem.remedial || {})
        });
      });
      return Object.assign(base, {
        birth: student.birthdate || '', eligibility: sf.eligibility || {}, semesters: sems,
        completion: sf.completion || {}, complete: true
      });
    }
    const context = GF.reportContext();
    const sems = GF.SEMESTERS.map(function (semester) {
      const rows = [];
      semester.groups.forEach(function (group) {
        group.subjects.forEach(function (entry) {
          const g = student.grades[entry[0]] || {};
          rows.push({ category: categoryOf(group), subject: entry[1], q1: cellValue(g[semester.quarters[0]]),
            q2: cellValue(g[semester.quarters[1]]), final: cellValue(g.final),
            action: cellValue(g.final) ? GF.remarkFor(g.final).toUpperCase() : '' });
        });
      });
      const average = GF.semesterAverage(student, semester.key);
      return {
        school: context.schoolName, schoolId: '', gradeLevel: GF.state.gradeLevel, sy: GF.prettyYear(GF.state.year),
        semLabel: semester.key === 'first' ? '1ST' : '2ND', quarters: [ordinal(semester.quarterLabels[0]), ordinal(semester.quarterLabels[1])],
        track: GF.state.strand, section: GF.state.section, rows: rows,
        average: average === null ? '' : String(average), averageAction: average === null ? '' : GF.remarkFor(average).toUpperCase(),
        remarks: '', adviser: GF.state.teacher, principal: GF.state.school.principal, dateChecked: '', remedial: EMPTY_REMEDIAL
      };
    });
    return Object.assign(base, {
      birth: student.birthdate ? GF.formatLongDate(student.birthdate) : '', eligibility: {}, semesters: sems,
      completion: { trackAccomplished: GF.state.strand, shsAverage: annualAverage(student), certifiedBy: GF.state.school.principal },
      complete: isComplete(student)
    });
  }

  const BOX = function (on) { return on ? '&#9746;' : '&#9744;'; };

  function buildHTML(student) {
    const rec = recordFor(student);
    const el = rec.eligibility;
    const blank = function (count) {
      return Array(count + 1).join('<tr class="sf10-blank"><td></td><td></td><td></td><td></td><td></td><td></td></tr>');
    };
    const line = function (value) { return value ? esc(value) : '________'; };
    const semesters = rec.semesters.map(function (sem) {
      const rem = sem.remedial;
      return '<table class="sf10-info sf10-school"><tbody><tr>' +
        '<td><b>SCHOOL:</b> ' + esc(sem.school) + '</td><td><b>SCHOOL ID:</b> ' + esc(sem.schoolId) + '</td><td><b>GRADE LEVEL:</b> ' + esc(sem.gradeLevel) + '</td>' +
        '<td><b>SY:</b> ' + esc(sem.sy) + '</td><td><b>SEM:</b> ' + esc(sem.semLabel) + '</td></tr>' +
        '<tr><td colspan="3"><b>TRACK/STRAND:</b> ' + esc(sem.track) + '</td><td colspan="2"><b>SECTION:</b> ' + esc(sem.section) + '</td></tr></tbody></table>' +
        '<table class="sf10-table sf10-grades"><thead><tr><th rowspan="2" class="sf10-cat">Indicate if Subject is CORE, APPLIED, or SPECIALIZED</th><th rowspan="2">SUBJECTS</th>' +
        '<th colspan="2">Quarter</th><th rowspan="2">SEM FINAL GRADE</th><th rowspan="2">ACTION TAKEN</th></tr>' +
        '<tr><th>' + esc(sem.quarters[0]) + '</th><th>' + esc(sem.quarters[1]) + '</th></tr></thead><tbody>' +
        sem.rows.map(function (r) {
          return '<tr><td>' + esc(r.category) + '</td><td class="sf10-subject">' + esc(r.subject) + '</td><td>' + esc(r.q1) + '</td><td>' + esc(r.q2) +
            '</td><td>' + esc(r.final) + '</td><td class="' + (r.action === 'FAILED' ? 'sf10-failed' : '') + '">' + esc(r.action) + '</td></tr>';
        }).join('') + blank(2) +
        '<tr class="sf10-average"><th colspan="4" scope="row">General Ave. for the Semester:</th><td>' + esc(sem.average) + '</td><td>' + esc(sem.averageAction) + '</td></tr></tbody></table>' +
        '<p class="sf10-remarks"><b>REMARKS:</b> ' + esc(sem.remarks) + '</p>' +
        '<table class="sf10-info sf10-sign"><tbody><tr><td><b>Prepared by:</b><span class="sf10-line"></span>' + esc(sem.adviser) + '<small>Signature of Adviser over Printed Name</small></td>' +
        '<td><b>Certified True and Correct:</b><span class="sf10-line"></span>' + esc(sem.principal) + (sem.principal ? ', SHS Principal' : '') + '<small>Signature of Authorized Person over Printed Name, Designation</small></td>' +
        '<td><b>Date Checked (MM/DD/YYYY):</b><span class="sf10-line">' + esc(sem.dateChecked) + '</span></td></tr></tbody></table>' +
        '<table class="sf10-table sf10-remedial"><thead><tr><th colspan="6" class="sf10-left">REMEDIAL CLASSES &nbsp; Conducted from (MM/DD/YYYY): ' + line(rem.from) + ' to (MM/DD/YYYY): ' + line(rem.to) +
        ' &nbsp; SCHOOL: ' + line(rem.school) + ' &nbsp; SCHOOL ID: ' + line(rem.schoolId) + '</th></tr>' +
        '<tr><th>Indicate if Subject is CORE, APPLIED, or SPECIALIZED</th><th>SUBJECTS</th><th>SEM FINAL GRADE</th><th>REMEDIAL CLASS MARK</th><th>RECOMPUTED FINAL GRADE</th><th>ACTION TAKEN</th></tr></thead><tbody>' +
        (rem.rows.length ? rem.rows.map(function (r) {
          return '<tr><td>' + esc(r.category) + '</td><td class="sf10-subject">' + esc(r.subject) + '</td><td>' + esc(r.final) + '</td><td>' + esc(r.remedialMark) + '</td><td>' + esc(r.recomputed) + '</td><td>' + esc(r.action) + '</td></tr>';
        }).join('') : blank(3)) + '</tbody></table>' +
        '<p class="sf10-remarks">Name of Teacher/Adviser: ' + line(rem.teacher) + ' &nbsp; Signature: ____________________</p>';
    }).join('');
    const c = rec.completion;

    return '<div class="sf10-head"><span class="sf10-formno">SF10-SHS</span>' +
      '<img class="sf10-seal" src="assets/deped-seal.png" alt="DepEd seal">' +
      '<div class="sf10-title"><p>REPUBLIC OF THE PHILIPPINES</p><p>DEPARTMENT OF EDUCATION</p>' +
      '<h2>SENIOR HIGH SCHOOL STUDENT PERMANENT RECORD</h2></div>' +
      '<img class="sf10-deped" src="assets/deped-logo.png" alt="DepEd logo"></div>' +
      (rec.complete ? '' : '<p class="sf10-incomplete" role="status">Incomplete record: some grades are still missing. Fix them in Grade Verification.</p>') +
      '<div class="sf10-band">LEARNER\'S INFORMATION</div>' +
      '<table class="sf10-info"><tbody>' +
      '<tr><td><b>LAST NAME:</b> ' + esc(rec.last) + '</td><td><b>FIRST NAME:</b> ' + esc(rec.first) + '</td><td><b>MIDDLE NAME:</b> ' + esc(rec.middle) + '</td></tr>' +
      '<tr><td><b>LRN:</b> ' + esc(rec.lrn) + '</td><td><b>Date of Birth (MM/DD/YYYY):</b> ' + esc(rec.birth) + '</td><td><b>Sex:</b> ' + esc(rec.sex) + '</td></tr></tbody></table>' +
      '<div class="sf10-band">ELIGIBILITY FOR SHS ENROLMENT</div>' +
      '<table class="sf10-info"><tbody>' +
      '<tr><td>' + BOX(el.hsCompleter) + ' High School Completer* &nbsp; Gen. Ave: ' + line(el.hsGenAve) + '</td><td>' + BOX(el.jhsCompleter) + ' Junior High School Completer &nbsp; Gen. Ave: ' + line(el.jhsGenAve) + '</td></tr>' +
      '<tr><td>Date of Graduation/Completion (MM/DD/YYYY): ' + line(el.completionDate) + '</td><td>Name of School: ' + line(el.schoolName) + ' &nbsp; School Address: ' + line(el.schoolAddress) + '</td></tr>' +
      '<tr><td>' + BOX(el.peptPasser) + ' PEPT Passer** Rating: ' + line(el.peptRating) + ' &nbsp; ' + BOX(el.alsPasser) + ' ALS A&amp;E Passer*** Rating: ' + line(el.alsRating) + '</td><td>Others (Pls. Specify): ' + line(el.others) + '</td></tr></tbody></table>' +
      '<div class="sf10-band">SCHOLASTIC RECORD</div>' + semesters +
      '<div class="sf10-band"></div>' +
      '<table class="sf10-info"><tbody><tr><td><b>Track/Strand Accomplished:</b> ' + esc(c.trackAccomplished) + '</td><td><b>SHS General Average:</b> ' + esc(c.shsAverage) + '</td></tr>' +
      '<tr><td><b>Awards/Honors Received:</b> ' + esc(c.awards) + '</td><td><b>Date of SHS Graduation (MM/DD/YYYY):</b> ' + esc(c.graduationDate) + '</td></tr>' +
      '<tr><td><b>Certified by:</b><span class="sf10-line"></span>' + esc(c.certifiedBy) + '<small>Signature of School Head over Printed Name</small></td><td><b>Place School Seal Here:</b><br><br><br></td></tr></tbody></table>' +
      '<p class="sf10-note"><b>NOTE:</b> This permanent record or a photocopy of this permanent record that bears the seal of the school and the original signature in ink of the School Head shall be considered valid for all legal purposes. Any erasure or alteration made on this copy should be validated by the School Head. If the student transfers to another school, the originating school should produce one (1) certified true copy of this permanent record for safekeeping. The receiving school shall continue filling up the original form. Upon graduation, the school from which the student graduated should keep the original form and produce one (1) certified true copy for the Division Office.</p>' +
      '<p class="sf10-remarks"><b>REMARKS:</b> ' + esc(c.remarks) + ' (Please indicate the purpose for which this permanent record will be used) ' + esc(c.purpose) + ' &nbsp; Date Issued (MM/DD/YYYY): ' + line(c.dateIssued) + '</p>';
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
    const rec = recordFor(student);
    const el = rec.eligibility;
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
    const box = function (on) { return on ? '[X]' : '[  ]'; };
    const or = function (value) { return value || '______'; };

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
    row(['LAST NAME: ' + rec.last, 'FIRST NAME: ' + rec.first, 'MIDDLE NAME: ' + rec.middle], [63, 63, 64], 4.4);
    row(['LRN: ' + rec.lrn, 'Date of Birth (MM/DD/YYYY): ' + rec.birth, 'Sex: ' + rec.sex], [63, 63, 64], 4.4);
    band('ELIGIBILITY FOR SHS ENROLMENT');
    row([box(el.hsCompleter) + ' High School Completer*   Gen. Ave: ' + or(el.hsGenAve), box(el.jhsCompleter) + ' Junior High School Completer   Gen. Ave: ' + or(el.jhsGenAve)], [95, 95], 4.2);
    row(['Date of Graduation/Completion (MM/DD/YYYY): ' + (el.completionDate || ''), 'Name of School: ' + (el.schoolName || '') + '   School Address: ' + (el.schoolAddress || '')], [95, 95], 4.2);
    row([box(el.peptPasser) + ' PEPT Passer**  Rating: ' + or(el.peptRating) + '   ' + box(el.alsPasser) + ' ALS A&E Passer***  Rating: ' + or(el.alsRating), 'Others (Pls. Specify): ' + (el.others || '')], [95, 95], 4.2);
    band('SCHOLASTIC RECORD');

    const widths = [32, 90, 17, 17, 17, 17];
    rec.semesters.forEach(function (sem, si) {
      if (si > 0) { doc.addPage(); y = 10; }
      doc.setFontSize(6.5);
      row(['SCHOOL: ' + sem.school + (sem.schoolId ? '   SCHOOL ID: ' + sem.schoolId : ''), 'GRADE LEVEL: ' + sem.gradeLevel + '    SY: ' + sem.sy + '    SEM: ' + sem.semLabel], [122, 68], 4.2);
      row(['TRACK/STRAND: ' + sem.track, 'SECTION: ' + sem.section], [122, 68], 4.2);
      cell('', left, widths[0], 9, { fill: GREY });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5);
      ['Indicate if Subject is', 'CORE, APPLIED, or', 'SPECIALIZED'].forEach(function (line, k) { text(line, left + widths[0] / 2, y + 3 + k * 2.2, { align: 'center' }); });
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
      sem.rows.forEach(function (r) {
        let x = left;
        [r.category, r.subject, r.q1, r.q2, r.final, r.action].forEach(function (v, k) {
          cell(v, x, widths[k], rowH, { align: k > 1 ? 'center' : 'left' }); x += widths[k];
        });
        y += rowH;
      });
      for (let i = 0; i < 3; i += 1) row(['', '', '', '', '', ''], widths, rowH);
      cell('General Ave. for the Semester:', left, 154, 4.8, { bold: true, fill: GREY });
      cell(sem.average, left + 154, 17, 4.8, { bold: true, align: 'center' });
      cell(sem.averageAction, left + 171, 19, 4.8, { bold: true, align: 'center' });
      y += 4.8;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); text('REMARKS: ' + (sem.remarks || ''), left, y + 3.5); y += 6;
      row(['Prepared by:', 'Certified True and Correct:', 'Date Checked (MM/DD/YYYY): ' + (sem.dateChecked || '')], [63, 80, 47], 4.2, { bold: true });
      doc.setFont('helvetica', 'normal');
      text(sem.adviser, left + 31, y + 5, { align: 'center' });
      text(sem.principal ? sem.principal + ', SHS Principal' : '', left + 103, y + 5, { align: 'center' });
      doc.line(left + 3, y + 5.8, left + 60, y + 5.8); doc.line(left + 66, y + 5.8, left + 140, y + 5.8); doc.line(left + 146, y + 5.8, left + 188, y + 5.8);
      doc.setFontSize(5); text('Signature of Adviser over Printed Name', left + 31, y + 8, { align: 'center' });
      text('Signature of Authorized Person over Printed Name, Designation', left + 103, y + 8, { align: 'center' });
      y += 11; doc.setFontSize(6.5);
      const rem = sem.remedial;
      row(['REMEDIAL CLASSES    Conducted from (MM/DD/YYYY): ' + (rem.from || '') + '    to (MM/DD/YYYY): ' + (rem.to || '') + '    SCHOOL: ' + (rem.school || '') + '    SCHOOL ID: ' + (rem.schoolId || '')], [190], 4.4, { bold: true });
      row(['Subject Type', 'SUBJECTS', 'SEM FINAL', 'REMEDIAL MARK', 'RECOMPUTED', 'ACTION TAKEN'], widths, 4.6, { bold: true, fill: GREY, align: 'center' });
      const remRows = rem.rows.length ? rem.rows : [{}, {}, {}];
      remRows.forEach(function (r) {
        row([r.category || '', r.subject || '', r.final || '', r.remedialMark || '', r.recomputed || '', r.action || ''], widths, 4.4);
      });
      doc.setFont('helvetica', 'normal'); text('Name of Teacher/Adviser: ' + (rem.teacher || '') + '                                              Signature:', left, y + 4); y += 8;
    });

    // Final certification block (last page)
    const c = rec.completion;
    y += 2;
    band('');
    row(['Track/Strand Accomplished: ' + (c.trackAccomplished || ''), 'SHS General Average: ' + (c.shsAverage || '')], [110, 80], 4.6, { bold: true });
    row(['Awards/Honors Received: ' + (c.awards || ''), 'Date of SHS Graduation (MM/DD/YYYY): ' + (c.graduationDate || '')], [110, 80], 4.6, { bold: true });
    row(['Certified by: ' + (c.certifiedBy || ''), 'Place School Seal Here:'], [110, 80], 14, { bold: true });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5);
    const note = doc.splitTextToSize('NOTE: This permanent record or a photocopy of this permanent record that bears the seal of the school and the original signature in ink of the School Head shall be considered valid for all legal purposes. Any erasure or alteration made on this copy should be validated by the School Head. If the student transfers to another school, the originating school should produce one (1) certified true copy of this permanent record for safekeeping. The receiving school shall continue filling up the original form. Upon graduation, the school from which the student graduated should keep the original form and produce one (1) certified true copy for the Division Office.', 190);
    doc.text(note, left, y + 4); y += 4 + note.length * 2.4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
    text('REMARKS: ' + [c.remarks, c.purpose].filter(Boolean).join(' - ') + '    Date Issued (MM/DD/YYYY): ' + (c.dateIssued || ''), left, y + 3);
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
    const list = sourceList();
    index = Math.min(Math.max(0, index), Math.max(0, list.length - 1));
    return list[index] || null;
  }

  function render() {
    const select = document.getElementById('sf10-student-select');
    const sheet = document.getElementById('sf10-sheet');
    if (!select || !sheet) return;
    const student = current();
    select.innerHTML = sourceList().map(function (entry, i) {
      return '<option value="' + i + '">' + esc(entry.lrn || entry.name) + '</option>';
    }).join('');
    select.value = String(index);
    document.getElementById('sf10-position').textContent = student ? (index + 1) + ' of ' + sourceList().length : '0 of 0';
    sheet.innerHTML = student ? buildHTML(student) : '<p class="sf10-incomplete">Upload an SF10 or SF9 file first.</p>';
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
      download(sourceList(), 'SF10-' + safe(GF.state.section).replace(/\W+/g, '_') + '.pdf');
    });
  }

  GF.registerPage('sf10', render);
  window.GradeFlowSf10 = { buildHTML: buildHTML, download: download };
  document.addEventListener('DOMContentLoaded', bind);
})();
