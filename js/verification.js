/* ==========================================================================
   Grade Verification
   Inline grade editing, live calculations, and missing-grade focus.
   ========================================================================== */
(function () {
  'use strict';

  const GF = window.GradeFlow;
  const esc = GF.escapeHTML;
  const PAGE_SIZE = 6;

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

  function renderTable() {
    const body = document.getElementById('grades-table-body');
    if (!body) return;
    const page = currentPageStudents();
    if (page.visible.length === 0) {
      body.innerHTML = '<tr><td colspan="10" class="table-empty">No students match this search or filter.</td></tr>';
    } else {
      body.innerHTML = page.visible.map(function (student) {
        const status = GF.studentStatus(student);
        const gradeCells = GF.SUBJECTS.map(function (subject) {
          const value = student.grades[subject.key];
          const missing = value === null || value === '' || Number.isNaN(Number(value));
          const display = missing ? '' : String(value);
          return '<td><input class="grade-input' + (missing ? ' missing' : '') + '" type="text" inputmode="decimal" ' +
            'value="' + esc(display) + '" placeholder="—" ' +
            'data-student-id="' + student.id + '" data-subject-key="' + subject.key + '" ' +
            'aria-label="' + esc(student.name + ' ' + subject.name + ' grade') + '"></td>';
        }).join('');
        return '<tr data-student-id="' + student.id + '" class="' + (GF.state.selectedStudentId === student.id ? 'selected' : '') + '">' +
          '<td class="roll">' + esc(student.roll) + '</td>' +
          '<td><div class="student-cell">' +
            '<span class="mini-avatar">' + esc(GF.initials(student.name)) + '</span>' +
            '<div><strong>' + esc(student.name) + '</strong>' +
            '<span class="student-avg">Avg ' + GF.averageLabel(student) + '</span></div>' +
          '</div></td>' +
          gradeCells +
          '<td>' + statusBadgeHTML(student) + '</td>' +
          '<td><button type="button" class="icon-btn row-edit" data-select-id="' + student.id + '" aria-label="Edit ' + esc(student.name) + '">' +
          '<svg class="icon" aria-hidden="true"><use href="#i-pencil"></use></svg></button></td>' +
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

  function syncRow(student) {
    const row = document.querySelector('#grades-table-body tr[data-student-id="' + student.id + '"]');
    if (!row) return;
    const badgeContainer = row.querySelector('td:nth-last-child(2)');
    if (badgeContainer) badgeContainer.innerHTML = statusBadgeHTML(student);
    const average = row.querySelector('.student-avg');
    if (average) average.textContent = 'Avg ' + GF.averageLabel(student);
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
      student.grades[subjectKey] = null;
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
    const wasMissing = student.grades[subjectKey] === null;
    student.grades[subjectKey] = numeric;
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

  function selectStudent(studentId, focusGrade) {
    const student = GF.getStudent(studentId);
    if (!student) return;
    GF.state.selectedStudentId = student.id;
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
    const entry = missing[0];
    const index = GF.state.students.findIndex(function (student) { return student.id === entry.student.id; });
    if (index > -1) {
      GF.state.verificationSearch = '';
      GF.state.verificationFilter = 'all';
      GF.state.verificationPage = Math.floor(index / PAGE_SIZE) + 1;
      const search = document.getElementById('search-students');
      const filter = document.getElementById('filter-status');
      if (search) search.value = '';
      if (filter) filter.value = 'all';
      renderTable();
    }
    window.setTimeout(function () {
      const field = document.querySelector('.grade-input.missing[data-student-id="' + entry.student.id + '"][data-subject-key="' + entry.subject.key + '"]');
      if (field) {
        field.focus();
        field.scrollIntoView({ block: 'center' });
      }
    }, 30);
  }

  function validateBeforePreview() {
    const renderedInputs = document.querySelectorAll('#grades-table-body .grade-input');
    let invalid = null;
    renderedInputs.forEach(function (input) {
      const raw = input.value.trim();
      if (raw === '') return;
      if (!GF.isValidGrade(raw)) {
        invalid = input;
        input.classList.add('invalid');
        input.setAttribute('aria-invalid', 'true');
        return;
      }
      const student = GF.getStudent(input.getAttribute('data-student-id'));
      const subjectKey = input.getAttribute('data-subject-key');
      if (student && subjectKey) student.grades[subjectKey] = Number(raw);
    });
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
      body.addEventListener('input', handleGradeInput);
      body.addEventListener('blur', handleGradeBlur, true);
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
    renderStats();
    renderTable();
    renderNote();
    showGradeError('');
  }

  GF.registerPage('verification', renderVerification);
  document.addEventListener('DOMContentLoaded', bindEvents);
})();
