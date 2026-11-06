/* ==========================================================================
   Grade Verification
   Inline grade editing, live calculations, and missing-grade focus.
   ========================================================================== */
(function () {
  'use strict';

  const GF = window.GradeFlow;
  const esc = GF.escapeHTML;
  const PAGE_SIZE = 6;
  let activeEditorTab = 'grades';

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function selectedStudent() {
    let student = GF.getStudent(GF.state.selectedStudentId);
    if (!student) {
      student = GF.state.students[0] || null;
      if (student) GF.state.selectedStudentId = student.id;
    }
    return student;
  }

  function filteredStudents() {
    const search = GF.state.verificationSearch.trim().toLowerCase();
    const filter = GF.state.verificationFilter;
    return GF.state.students.filter(function (student) {
      const matchesSearch = !search ||
        student.name.toLowerCase().includes(search) ||
        String(student.roll).toLowerCase().includes(search);
      if (!matchesSearch) return false;
      const status = GF.studentStatus(student);
      if (filter === 'approved') return status === 'approved';
      if (filter === 'needs-correction') return status === 'needs-correction';
      if (filter === 'low') {
        const average = GF.averageGrade(student);
        return average !== null && average < 75;
      }
      return true;
    });
  }

  function currentPageStudents() {
    const all = filteredStudents();
    const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    GF.state.verificationPage = Math.min(Math.max(1, GF.state.verificationPage), totalPages);
    const start = (GF.state.verificationPage - 1) * PAGE_SIZE;
    return { all: all, visible: all.slice(start, start + PAGE_SIZE), totalPages: totalPages, start: start };
  }

  function statusBadgeHTML(student) {
    const status = GF.studentStatus(student);
    return status === 'approved'
      ? '<span class="status-badge status-approved"><svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg> Approved</span>'
      : '<span class="status-badge status-needs"><svg class="icon" aria-hidden="true"><use href="#i-alert-circle"></use></svg> Needs correction</span>';
  }

  function renderStats() {
    const total = GF.state.students.length;
    const missing = GF.missingGradeCells().length;
    setText('verified-students', String(total));
    setText('approved-students', String(GF.approvedCount()));
    setText('total-students', String(total));
    setText('pending-fixes', String(missing));
    setText('comments-reviewed', String(GF.reviewedCommentCount()));
    setText('comments-total', String(total));
    setText('changes-saved-pill', 'Changes saved');
  }

  // Explain what the AI import did, so the teacher can spot a wrongly mapped column.
  function fieldLabel(field) {
    const parts = field.split(':');
    if (parts[0] === 'grade') {
      const subject = GF.SUBJECTS.find(function (entry) { return entry.key === parts[1]; });
      return (subject ? subject.name : parts[1]) + ' · ' + (parts[2] === 'final' ? 'Semester final' : 'Quarter ' + parts[2].slice(1));
    }
    if (parts[0] === 'att') return 'Attendance · ' + parts[1].toUpperCase() + ' · ' + parts[2].replace(/([A-Z])/g, ' $1').toLowerCase();
    if (parts[0] === 'ov') return 'Core value · ' + parts[1] + ' · Q' + parts[2].slice(1);
    if (parts[0] === 'transfer') return 'Transfer · ' + parts[1];
    return field.charAt(0).toUpperCase() + field.slice(1);
  }

  function renderAiNotes() {
    const box = document.getElementById('ai-import-notes');
    if (!box) return;
    const ai = GF.state.upload && GF.state.upload.ai;
    box.hidden = !ai;
    if (!ai) return;
    const warnings = ai.warnings || [];
    document.getElementById('ai-import-summary').textContent =
      '· ' + ai.mapping.length + ' columns mapped' + (warnings.length ? ' · ' + warnings.length + ' to check' : '');
    document.getElementById('ai-import-warnings').innerHTML = warnings.map(function (warning) {
      return '<li>' + GF.escape(warning) + '</li>';
    }).join('');
    document.getElementById('ai-import-mapping').innerHTML = ai.mapping.map(function (entry) {
      return '<tr><td>' + GF.escape(entry.header || 'Column ' + (entry.col + 1)) + '</td><td>' + GF.escape(fieldLabel(entry.field)) + '</td></tr>';
    }).join('');
    box.open = warnings.length > 0;
  }

  function renderTable() {
    const body = document.getElementById('grades-table-body');
    if (!body) return;
    const page = currentPageStudents();
    if (page.visible.length === 0) {
      body.innerHTML = '<tr><td colspan="8" class="table-empty">No students match this search or filter.</td></tr>';
    } else {
      body.innerHTML = page.visible.map(function (student) {
        const status = GF.studentStatus(student);
        const missing = GF.missingGradeCells([student]).length;
        return '<tr data-student-id="' + student.id + '" class="' + (GF.state.selectedStudentId === student.id ? 'selected' : '') + '">' +
          '<td class="roll">' + esc(student.roll) + '</td>' +
          '<td><div class="student-cell">' +
            '<span class="mini-avatar">' + esc(GF.initials(student.name)) + '</span>' +
            '<div><strong>' + esc(student.name) + '</strong>' +
            '<span class="student-avg">Avg ' + GF.averageLabel(student) + '</span></div>' +
          '</div></td>' +
          '<td>' + esc([student.age, student.sex].filter(Boolean).join(' / ') || '—') + '</td>' +
          '<td>' + esc(student.lrn || '—') + '</td>' +
          '<td>' + esc(GF.averageLabel(student)) + '</td>' +
          '<td>' + (GF.SUBJECTS.length * 3 - missing) + ' / ' + (GF.SUBJECTS.length * 3) + '</td>' +
          '<td>' + statusBadgeHTML(student) + '</td>' +
          '<td><button type="button" class="btn btn-secondary row-edit" data-select-id="' + student.id + '">Edit grades</button></td>' +
          '</tr>';
      }).join('');
    }

    const showing = document.getElementById('verification-showing');
    const pageLabel = document.getElementById('verification-page');
    const previous = document.getElementById('verification-prev');
    const next = document.getElementById('verification-next');
    if (showing) {
      showing.textContent = page.all.length
        ? 'Showing ' + (page.start + 1) + '–' + Math.min(page.start + PAGE_SIZE, page.all.length) + ' of ' + page.all.length + ' student' + (page.all.length === 1 ? '' : 's')
        : 'Showing 0 students';
    }
    if (pageLabel) pageLabel.textContent = 'Page ' + GF.state.verificationPage + ' of ' + page.totalPages;
    if (previous) previous.disabled = GF.state.verificationPage <= 1;
    if (next) next.disabled = GF.state.verificationPage >= page.totalPages;
  }

  function renderGradeEditor() {
    const editor = document.getElementById('grade-editor');
    const student = GF.getStudent(GF.state.selectedStudentId);
    if (!editor) return;
    if (!student) {
      editor.innerHTML = '<div class="grade-editor-empty"><h2>Student details</h2>' +
        '<p>Upload a grade sheet to review learner grades and report details.</p></div>';
      return;
    }

    const tabs = [
      ['grades', 'Quarterly grades'],
      ['attendance', 'Attendance'],
      ['values', 'Observed values']
    ];
    const activeTab = tabs.find(function (tab) { return tab[0] === activeEditorTab; }) || tabs[0];
    const missingCount = GF.missingGradeCells([student]).length;
    let panelContent;
    if (activeTab[0] === 'attendance') {
      panelContent = renderAttendanceEditor(student);
    } else if (activeTab[0] === 'values') {
      panelContent = renderObservedValuesEditor(student);
    } else {
      panelContent = renderGradesEditor(student);
    }

    editor.innerHTML = '<div class="grade-editor-heading"><div>' +
      '<span class="grade-editor-kicker">LEARNER RECORD</span>' +
      '<h2>Review student details</h2>' +
      '<p class="grade-editor-summary">' + esc(student.name) + ' · ' + (missingCount
        ? missingCount + ' grade entries need review'
        : 'All grade entries are complete') + '</p></div>' +
      '<div class="grade-editor-status">' + statusBadgeHTML(student) + '</div></div>' +
      '<div class="grade-editor-tabs" role="tablist" aria-label="Learner details">' +
      tabs.map(function (tab) {
        const selected = tab[0] === activeTab[0];
        return '<button type="button" class="grade-editor-tab' + (selected ? ' active' : '') +
          '" id="grade-tab-' + tab[0] + '" role="tab" aria-selected="' + selected +
          '" aria-controls="grade-editor-panel" tabindex="' + (selected ? '0' : '-1') +
          '" data-editor-tab="' + tab[0] + '">' + esc(tab[1]) + '</button>';
      }).join('') + '</div>' +
      '<div class="grade-editor-panel" id="grade-editor-panel" role="tabpanel" tabindex="0" aria-labelledby="grade-tab-' +
      activeTab[0] + '">' + panelContent + '</div>';
  }

  function renderGradesEditor(student) {
    return GF.SEMESTERS.map(function (semester) {
        const rows = semester.groups.map(function (group) {
          return '<tr class="grade-editor-group"><th colspan="4">' + esc(group.name) + '</th></tr>' +
            group.subjects.map(function (subjectDefinition) {
              const subject = GF.SUBJECTS.find(function (entry) { return entry.key === subjectDefinition[0]; });
              const grades = student.grades[subject.key] || {};
              const values = semester.quarters.concat(semester.finalKey).map(function (period) {
                const value = grades[period];
                const missing = value === null || value === undefined || value === '' || Number.isNaN(Number(value));
                const label = period === 'final' ? 'Semester final' : 'Quarter ' + period.slice(1);
                return '<td><input class="grade-input' + (missing ? ' missing' : '') + '" type="number" min="' +
                  GF.scaleMinimum() + '" max="100" step="any" value="' + (missing ? '' : esc(String(value))) +
                  '" placeholder="—" data-student-id="' + student.id + '" data-subject-key="' +
                  subject.key + '" data-period="' + period + '" aria-label="' +
                  esc(student.name + ' ' + subject.name + ' ' + label) + '"></td>';
              }).join('');
              return '<tr><th scope="row">' + esc(subject.name) + '</th>' + values + '</tr>';
            }).join('');
        }).join('');
        return '<h4>' + esc(semester.label) + '</h4><div class="grade-editor-scroll"><table class="grade-editor-table">' +
          '<thead><tr><th scope="col">Subject</th>' +
          semester.quarterLabels.map(function (label) { return '<th scope="col">Quarter ' + label + '</th>'; }).join('') +
          '<th scope="col">Semester final</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
      }).join('');
  }

  function renderAttendanceEditor(student) {
    const attendance = student.attendance || {};
    const fields = [
      ['schoolDays', 'School days'],
      ['months', 'Days present'],
      ['absent', 'Days absent']
    ];
    const rows = GF.ATTENDANCE_MONTHS.map(function (month) {
      const cells = fields.map(function (field) {
        const values = attendance[field[0]] || {};
        const value = values[month.key];
        const shown = value == null || value === '' ? '' : esc(String(value));
        return '<td><input class="report-data-input attendance-input" type="number" min="0" step="1" ' +
          'value="' + shown + '" placeholder="—" data-attendance-month="' + month.key +
          '" data-attendance-field="' + field[0] + '" aria-label="' +
          esc(student.name + ' ' + month.label + ' ' + field[1]) + '"></td>';
      }).join('');
      return '<tr><th scope="row">' + esc(month.label) + '</th>' + cells + '</tr>';
    }).join('');
    return '<section class="review-data-section">' +
      '<div class="review-data-heading"><div><h4>Edit report of attendance</h4>' +
        '<p>Enter monthly school days, days present, and days absent. Leave unknown values blank.</p></div></div>' +
      '<div class="grade-editor-scroll"><table class="grade-editor-table report-data-table">' +
        '<thead><tr><th scope="col">Month</th>' + fields.map(function (field) {
          return '<th scope="col">' + esc(field[1]) + '</th>';
        }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</section>';
  }

  function renderObservedValuesEditor(student) {
    const values = [
      ['makaDiyos', 'Maka-Diyos'],
      ['makatao', 'Makatao'],
      ['makakalikasan', 'Maka-kalikasan'],
      ['makabansa', 'Makabansa']
    ];
    const choices = [
      ['', 'Not set'],
      ['AO', 'AO — Always Observed'],
      ['SO', 'SO — Sometimes Observed'],
      ['RO', 'RO — Rarely Observed'],
      ['NO', 'NO — Not Observed']
    ];
    const rows = values.map(function (value) {
      const observations = student.observedValues && student.observedValues[value[0]] || {};
      return '<tr><th scope="row">' + esc(value[1]) + '</th>' +
        ['q1', 'q2', 'q3', 'q4'].map(function (period, index) {
          return '<td><label class="sr-only" for="observed-' + student.id + '-' + value[0] + '-' + period + '">' +
            esc(student.name + ' ' + value[1] + ' quarter ' + (index + 1)) + '</label>' +
            '<div class="select-wrap"><select class="report-data-input observed-value-input" id="observed-' +
              student.id + '-' + value[0] + '-' + period + '" data-observed-key="' + value[0] +
              '" data-observed-period="' + period + '">' +
              choices.map(function (choice) {
                return '<option value="' + choice[0] + '"' +
                  (observations[period] === choice[0] ? ' selected' : '') + '>' +
                  esc(choice[1]) + '</option>';
              }).join('') +
            '</select><svg class="icon select-chevron" aria-hidden="true"><use href="#i-chevron-down"></use></svg></div></td>';
        }).join('') + '</tr>';
    }).join('');
    return '<section class="review-data-section">' +
      '<div class="review-data-heading"><div><h4>Edit learner observed values</h4>' +
        '<p>Choose an observation rating for each core value and quarter.</p></div></div>' +
      '<div class="grade-editor-scroll"><table class="grade-editor-table report-data-table observed-editor-table">' +
        '<thead><tr><th scope="col">Core values</th><th scope="col">Quarter 1</th><th scope="col">Quarter 2</th>' +
          '<th scope="col">Quarter 3</th><th scope="col">Quarter 4</th></tr></thead><tbody>' +
          rows + '</tbody></table></div>' +
    '</section>';
  }

  function syncRow(student) {
    renderTable();
    const heading = document.querySelector('#grade-editor .grade-editor-summary');
    const missing = GF.missingGradeCells([student]).length;
    if (heading) {
      heading.textContent = student.name + ' · ' + (missing
        ? missing + ' grade entries need review'
        : 'All grade entries are complete');
    }
    const status = document.querySelector('#grade-editor .grade-editor-status');
    if (status) status.innerHTML = statusBadgeHTML(student);
  }

  function renderNote() {
    const note = document.getElementById('verification-ready-note');
    if (!note) return;
    const missing = GF.missingGradeCells().length;
    if (missing === 0) {
      note.textContent = 'All grades complete · Ready to preview';
    } else {
      note.textContent = missing + ' missing grade' + (missing === 1 ? '' : 's') + ' · Correct ' + (missing === 1 ? 'it' : 'them') + ' in the table above';
    }
  }

  function showGradeError(message) {
    const box = document.getElementById('grade-error');
    if (!box) return;
    if (!message) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.textContent = message;
    box.hidden = false;
  }

  function handleGradeInput(event) {
    const input = event.target.closest('.grade-input');
    if (!input) return;
    const student = GF.getStudent(input.getAttribute('data-student-id'));
    const subjectKey = input.getAttribute('data-subject-key');
    if (!student || !subjectKey) return;
    const raw = input.value.trim();
    showGradeError('');

    if (raw === '') {
      student.grades[subjectKey][input.getAttribute('data-period')] = null;
      input.classList.add('missing');
      input.classList.remove('invalid');
      input.setAttribute('aria-invalid', 'false');
      syncRow(student);
      renderStats();
      renderNote();
      GF.refreshChrome();
      return;
    }

    if (!GF.isValidGrade(raw)) {
      input.classList.add('invalid');
      input.setAttribute('aria-invalid', 'true');
      showGradeError('Grades must be numbers between ' + GF.scaleMinimum() + ' and 100.');
      return;
    }

    const numeric = Number(raw);
    const period = input.getAttribute('data-period');
    const wasMissing = student.grades[subjectKey][period] === null;
    student.grades[subjectKey][period] = numeric;
    input.classList.remove('invalid', 'missing');
    input.setAttribute('aria-invalid', 'false');
    syncRow(student);
    renderStats();
    renderNote();
    GF.refreshChrome();
    if (wasMissing) GF.showToast('Grade saved. ' + GF.averageLabel(student) + ' is the new average.');
  }

  function handleGradeBlur(event) {
    const input = event.target.closest('.grade-input');
    if (!input) return;
    const raw = input.value.trim();
    if (raw !== '' && !GF.isValidGrade(raw)) {
      GF.showToast('Enter a grade between ' + GF.scaleMinimum() + ' and 100.', 'error');
    }
  }

  function handleReportDataInput(event) {
    const input = event.target.closest('.attendance-input');
    if (!input) return;
    const student = GF.getStudent(GF.state.selectedStudentId);
    if (!student) return;
    const raw = input.value.trim();
    const value = raw === '' ? null : Number(raw);
    const valid = value === null || (Number.isInteger(value) && value >= 0);
    input.classList.toggle('invalid', !valid);
    input.setAttribute('aria-invalid', String(!valid));
    if (!valid) {
      showGradeError('Attendance entries must be non-negative whole numbers.');
      return;
    }

    const month = input.getAttribute('data-attendance-month');
    const field = input.getAttribute('data-attendance-field');
    if (!student.attendance) student.attendance = { months: {}, schoolDays: {}, absent: {} };
    if (!student.attendance[field]) student.attendance[field] = {};
    student.attendance[field][month] = value;

    const schoolDays = student.attendance.schoolDays[month];
    const present = student.attendance.months[month];
    const absent = student.attendance.absent[month];
    const monthInputs = Array.from(document.querySelectorAll(
      '.attendance-input[data-attendance-month="' + month + '"]'
    ));
    const exceedsDays = [schoolDays, present, absent].every(function (entry) {
      return entry !== null && entry !== undefined && entry !== '';
    }) && present + absent > schoolDays;
    monthInputs.forEach(function (fieldInput) {
      fieldInput.classList.toggle('invalid', exceedsDays);
      fieldInput.setAttribute('aria-invalid', String(exceedsDays));
    });
    if (exceedsDays) {
      showGradeError('Days present and absent cannot exceed the school days for ' + month.toUpperCase() + '.');
      return;
    }
    showGradeError('');
    setText('changes-saved-pill', 'Changes saved');
    GF.refreshChrome();
  }

  function handleObservedValueChange(event) {
    const input = event.target.closest('.observed-value-input');
    if (!input) return;
    const student = GF.getStudent(GF.state.selectedStudentId);
    if (!student) return;
    const key = input.getAttribute('data-observed-key');
    const period = input.getAttribute('data-observed-period');
    if (!student.observedValues) student.observedValues = {};
    if (!student.observedValues[key]) student.observedValues[key] = {};
    student.observedValues[key][period] = input.value;
    setText('changes-saved-pill', 'Changes saved');
    GF.refreshChrome();
  }

  function selectStudent(studentId, focusGrade) {
    const student = GF.getStudent(studentId);
    if (!student) return;
    const invalidGrade = document.querySelector('#grade-editor .grade-input.invalid');
    if (invalidGrade && student.id !== GF.state.selectedStudentId) {
      showGradeError('Fix the highlighted grade before selecting another student.');
      invalidGrade.focus();
      return;
    }
    GF.state.selectedStudentId = student.id;
    if (focusGrade) activeEditorTab = 'grades';
    renderGradeEditor();
    document.querySelectorAll('#grades-table-body tr[data-student-id]').forEach(function (row) {
      row.classList.toggle('selected', Number(row.getAttribute('data-student-id')) === student.id);
    });
    if (focusGrade) {
      window.setTimeout(function () {
        const missing = document.querySelector('.grade-input.missing[data-student-id="' + student.id + '"]');
        const firstInput = document.querySelector('.grade-input[data-student-id="' + student.id + '"]');
        const target = missing || firstInput;
        if (target) target.focus();
      }, 30);
    }
  }

  function focusFirstMissingGrade() {
    const missing = GF.missingGradeCells();
    if (!missing.length) return;
    activeEditorTab = 'grades';
    const entry = missing[0];
    const index = GF.state.students.findIndex(function (student) { return student.id === entry.student.id; });
    if (index > -1) {
      GF.state.verificationSearch = '';
      GF.state.verificationFilter = 'all';
      GF.state.verificationPage = Math.floor(index / PAGE_SIZE) + 1;
      GF.state.selectedStudentId = entry.student.id;
      const search = document.getElementById('search-students');
      const filter = document.getElementById('filter-status');
      if (search) search.value = '';
      if (filter) filter.value = 'all';
      renderTable();
    }
    window.setTimeout(function () {
      renderGradeEditor();
      const field = document.querySelector('.grade-input.missing[data-student-id="' + entry.student.id + '"][data-subject-key="' + entry.subject.key + '"][data-period="' + entry.period + '"]');
      if (field) {
        field.focus();
        field.scrollIntoView({ block: 'center' });
      }
    }, 30);
  }

  function validateBeforePreview() {
    const invalidAttendance = GF.state.students.reduce(function (issue, student) {
      if (issue) return issue;
      const attendance = student.attendance || {};
      return GF.ATTENDANCE_MONTHS.reduce(function (monthIssue, month) {
        if (monthIssue) return monthIssue;
        const values = [
          (attendance.schoolDays || {})[month.key],
          (attendance.months || {})[month.key],
          (attendance.absent || {})[month.key]
        ];
        const invalidValue = values.some(function (value) {
          return value !== null && value !== undefined && value !== '' &&
            (!Number.isInteger(Number(value)) || Number(value) < 0);
        });
        const allPresent = values.every(function (value) {
          return value !== null && value !== undefined && value !== '';
        });
        if (invalidValue || (allPresent && Number(values[1]) + Number(values[2]) > Number(values[0]))) {
          return { student: student, month: month };
        }
        return null;
      }, null);
    }, null);
    if (invalidAttendance) {
      GF.state.selectedStudentId = invalidAttendance.student.id;
      activeEditorTab = 'attendance';
      renderGradeEditor();
      const invalidReportData = document.querySelector(
        '.attendance-input[data-attendance-month="' + invalidAttendance.month.key + '"]'
      );
      document.querySelectorAll('.attendance-input[data-attendance-month="' +
        invalidAttendance.month.key + '"]').forEach(function (input) {
        input.classList.add('invalid');
        input.setAttribute('aria-invalid', 'true');
      });
      showGradeError('Fix the invalid attendance values for ' + invalidAttendance.student.name +
        ' in ' + invalidAttendance.month.label + ' before previewing.');
      GF.showToast('Fix the highlighted attendance values before continuing.', 'error');
      if (invalidReportData) invalidReportData.focus();
      return false;
    }
    const invalid = document.querySelector('#grade-editor .grade-input.invalid');
    if (invalid) {
      showGradeError('One or more grades are invalid. Enter numbers between ' + GF.scaleMinimum() + ' and 100.');
      GF.showToast('Fix the highlighted grade before continuing.', 'error');
      invalid.focus();
      return false;
    }

    const missing = GF.missingGradeCells();
    if (missing.length) {
      showGradeError('Enter the remaining ' + missing.length + ' missing grade' + (missing.length === 1 ? '' : 's') + ' before previewing.');
      GF.showToast('There ' + (missing.length === 1 ? 'is 1 missing grade' : 'are ' + missing.length + ' missing grades') + ' left to correct.', 'error');
      focusFirstMissingGrade();
      return false;
    }

    showGradeError('');
    const current = selectedStudent();
    const previewIndex = current
      ? GF.state.students.findIndex(function (student) { return student.id === current.id; })
      : -1;
    if (previewIndex > -1) GF.state.previewIndex = previewIndex;
    GF.navigateTo('report-card');
    GF.showToast('Grades approved. Your report cards are ready to preview.');
    return true;
  }

  function bindEvents() {
    const body = document.getElementById('grades-table-body');
    if (body) {
      body.addEventListener('click', function (event) {
        const editButton = event.target.closest('.row-edit');
        if (editButton) {
          selectStudent(Number(editButton.getAttribute('data-select-id')), true);
          return;
        }
        if (event.target.closest('input, button')) return;
        const row = event.target.closest('tr[data-student-id]');
        if (row) selectStudent(Number(row.getAttribute('data-student-id')), false);
      });
    }

    const search = document.getElementById('search-students');
    if (search) {
      search.value = GF.state.verificationSearch;
      search.addEventListener('input', function () {
        GF.state.verificationSearch = search.value;
        GF.state.verificationPage = 1;
        renderTable();
      });
    }
    const filter = document.getElementById('filter-status');
    if (filter) {
      filter.value = GF.state.verificationFilter;
      filter.addEventListener('change', function () {
        GF.state.verificationFilter = filter.value;
        GF.state.verificationPage = 1;
        renderTable();
      });
    }

    const previous = document.getElementById('verification-prev');
    const next = document.getElementById('verification-next');
    if (previous) {
      previous.addEventListener('click', function () {
        GF.state.verificationPage = Math.max(1, GF.state.verificationPage - 1);
        renderTable();
      });
    }
    if (next) {
      next.addEventListener('click', function () {
        GF.state.verificationPage += 1;
        renderTable();
      });
    }

    const previewButton = document.getElementById('confirm-preview-btn');
    if (previewButton) previewButton.addEventListener('click', validateBeforePreview);
    const gradeEditor = document.getElementById('grade-editor');
    if (gradeEditor) {
      gradeEditor.addEventListener('input', handleGradeInput);
      gradeEditor.addEventListener('input', handleReportDataInput);
      gradeEditor.addEventListener('blur', handleGradeBlur, true);
      gradeEditor.addEventListener('change', handleObservedValueChange);
      gradeEditor.addEventListener('click', function (event) {
        const tab = event.target.closest('[data-editor-tab]');
        if (!tab || tab.getAttribute('data-editor-tab') === activeEditorTab) return;
        const invalidGrade = gradeEditor.querySelector('.grade-input.invalid');
        if (invalidGrade) {
          showGradeError('Fix the highlighted grade before switching sections.');
          invalidGrade.focus();
          return;
        }
        activeEditorTab = tab.getAttribute('data-editor-tab');
        showGradeError('');
        renderGradeEditor();
        const selectedTab = gradeEditor.querySelector('[data-editor-tab="' + activeEditorTab + '"]');
        if (selectedTab) selectedTab.focus();
      });
      gradeEditor.addEventListener('keydown', function (event) {
        const tab = event.target.closest('[data-editor-tab]');
        if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = Array.from(gradeEditor.querySelectorAll('[data-editor-tab]'));
        const currentIndex = tabs.indexOf(tab);
        const nextIndex = event.key === 'Home' ? 0
          : event.key === 'End' ? tabs.length - 1
            : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        tabs[nextIndex].click();
        const selectedTab = gradeEditor.querySelector('[data-editor-tab="' + activeEditorTab + '"]');
        if (selectedTab) selectedTab.focus();
      });
    }
  }

  function renderVerification() {
    const search = document.getElementById('search-students');
    const filter = document.getElementById('filter-status');
    if (search) search.value = GF.state.verificationSearch;
    if (filter) filter.value = GF.state.verificationFilter;
    setText('verification-class-title', GF.state.className);
    setText('verification-term', GF.termLabel());
    setText('verification-scale', GF.gradeScaleDescription());
    selectedStudent();
    renderAiNotes();
    renderStats();
    renderTable();
    renderGradeEditor();
    renderNote();
    showGradeError('');
  }

  GF.registerPage('verification', renderVerification);
  document.addEventListener('DOMContentLoaded', bindEvents);
})();
