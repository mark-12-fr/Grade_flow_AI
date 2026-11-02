/* ==========================================================================
   Report Card Preview
   Renders the live front and back of a student's report card. Every value
   comes from the verified class data; the preview never invents a grade.
   ========================================================================== */
(function () {
  'use strict';

  const GF = window.GradeFlow;
  const esc = GF.escapeHTML;
  let previewSearch = '';
  let activeSearchResult = -1;

  function contextForPreview() {
    return GF.reportContext({ generatedAt: GF.state.generatedAt || new Date() });
  }

  function attendanceParts(student) {
    const attendance = student.attendance || {};
    const present = Number(attendance.present);
    const total = Number(attendance.total);
    if (Number.isFinite(present) && Number.isFinite(total) && total > 0) {
      const percent = Math.round((present / total) * 100);
      return {
        detail: present + ' of ' + total + ' days',
        percent: percent + '%'
      };
    }
    return { detail: 'Not provided', percent: '' };
  }

  function headerHTML(context, isBack) {
    return '<header class="rc-header">' +
      '<div class="rc-school">' +
        '<span class="rc-logo"><svg class="icon" aria-hidden="true"><use href="#i-graduation-cap"></use></svg></span>' +
        '<div>' +
          '<strong>' + esc(context.schoolName.toUpperCase()) + '</strong>' +
          '<span>' + esc(context.schoolAddress) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="rc-document-title">' +
        '<strong>' + (isBack ? 'LEARNER PROGRESS AND OBSERVED VALUES' : 'REPORT ON LEARNING PROGRESS AND ACHIEVEMENT') + '</strong>' +
        '<span>' + esc(context.termLabel) + '</span>' +
      '</div>' +
    '</header>';
  }

  function signaturesHTML(context, pageNumber) {
    return '<div class="rc-signatures">' +
      '<div class="rc-signature"><span>Class adviser</span><strong>' + esc(context.teacher) + '</strong></div>' +
      '<div class="rc-signature"><span>School head</span><strong>' + esc(context.principal) + '</strong></div>' +
      '<div class="rc-page">Page ' + pageNumber + ' of 2</div>' +
    '</div>';
  }

  function buildFrontHTML(student, context) {
    const average = GF.averageGrade(student);
    const averageText = average === null ? '—' : average + '%';
    const letter = average === null ? '—' : GF.letterFor(average);
    const attendance = attendanceParts(student);

    const rows = GF.SUBJECTS.map(function (subject) {
      const value = student.grades[subject.key];
      const missing = value === null || value === '' || Number.isNaN(Number(value));
      return '<tr>' +
        '<td>' + esc(subject.name) + '</td>' +
        '<td class="rc-score">' + (missing ? '—' : esc(String(value))) + '</td>' +
        '<td class="rc-letter">' + esc(missing ? '—' : GF.letterFor(value)) + '</td>' +
      '</tr>';
    }).join('');

    return headerHTML(context, false) +
      '<div class="rc-heading">' +
        '<div>' +
          '<h3>Learner information</h3>' +
          '<p>' + esc(context.gradeLevel + ' · ' + context.section) + '</p>' +
        '</div>' +
        '<p>Issued ' + esc(context.issuedDateShort) + '</p>' +
      '</div>' +
      '<div class="rc-learner-grid">' +
        '<div class="rc-learner-field rc-learner-name"><span>Learner’s name</span><strong>' + esc(student.name) + '</strong></div>' +
        '<div class="rc-learner-field"><span>Grade level</span><strong>' + esc(context.gradeLevel) + '</strong></div>' +
        '<div class="rc-learner-field"><span>Section</span><strong>' + esc(context.section) + '</strong></div>' +
        '<div class="rc-learner-field"><span>Roll / roster no.</span><strong>' + esc(student.roll) + '</strong></div>' +
        '<div class="rc-learner-field"><span>School year</span><strong>' + esc(GF.prettyYear(context.year)) + '</strong></div>' +
      '</div>' +
      '<table class="rc-table">' +
        '<caption class="sr-only">Subject scores for ' + esc(student.name) + '</caption>' +
        '<thead><tr><th scope="col">Learning area</th><th scope="col">Grade recorded</th><th scope="col">Letter grade</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
      '<div class="rc-average">' +
        '<span>General average for ' + esc(context.term) + '</span>' +
        '<span><strong>' + averageText + '</strong> <span class="rc-letter-badge">' + esc(letter) + '</span></span>' +
      '</div>' +
      '<div class="rc-two-col">' +
        '<div class="rc-box">' +
          '<span class="rc-box-label">Attendance</span>' +
          '<div class="rc-box-value">' + esc(attendance.detail) +
            (attendance.percent ? ' <span>· ' + esc(attendance.percent) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="rc-box">' +
          '<span class="rc-box-label">Overall performance</span>' +
          '<div class="rc-box-value">' + esc(GF.performanceLabel(student)) + '</div>' +
        '</div>' +
      '</div>' +
      '<p class="rc-scale">Grades shown are the values provided in the uploaded sheet. ' + esc(GF.gradeScaleDescription()) +
        ' · A 90–100, B 80–89, C 70–79, D 60–69, E below 60.</p>' +
      signaturesHTML(context, 1);
  }

  function buildBackHTML(student, context) {
    const comment = student.comment && student.comment.trim()
      ? student.comment.trim()
      : 'A teacher comment has not been saved for this student yet.';
    const traits = student.traits || GF.makeTraits(student);
    const nextSteps = student.nextSteps || GF.makeNextSteps(student);
    const firstName = student.name.split(' ')[0];

    const nextStepsHTML = nextSteps.map(function (step) {
      return '<li>' + esc(step) + '</li>';
    }).join('');

    return headerHTML(context, true) +
      '<div class="rc-heading">' +
        '<div>' +
          '<h3>Teacher comments and learning habits</h3>' +
          '<p>' + esc(context.termLabel) + '</p>' +
        '</div>' +
        '<p>' + esc(context.gradeLevel + ' · ' + context.section) + '</p>' +
      '</div>' +
      '<div class="rc-student">' + esc(student.name) + '</div>' +
      '<div class="rc-meta">' +
        '<span>Roll <strong>' + esc(student.roll) + '</strong></span>' +
        '<span>Reviewed by <strong>' + esc(context.teacher) + '</strong></span>' +
      '</div>' +
      '<div class="rc-comment">' +
        '<div class="rc-comment-label"><svg class="icon" aria-hidden="true"><use href="#i-message"></use></svg> Teacher comment</div>' +
        '<p>' + esc(comment) + '</p>' +
      '</div>' +
      '<div class="rc-traits">' +
        '<h4>Learning habits</h4>' +
        '<div class="rc-trait-row"><span>Participation</span><span>' + esc(traits.participation) + '</span></div>' +
        '<div class="rc-trait-row"><span>Collaboration</span><span>' + esc(traits.collaboration) + '</span></div>' +
        '<div class="rc-trait-row"><span>Work habits</span><span>' + esc(traits.workHabits) + '</span></div>' +
      '</div>' +
      '<div class="rc-next">' +
        '<strong>Next steps at home</strong>' +
        '<ul>' + nextStepsHTML + '</ul>' +
      '</div>' +
      '<p class="rc-closing">Thank you for partnering with us in ' + esc(firstName) +
        '\'s learning this term. Please reach out if you would like to talk through this report.</p>' +
      signaturesHTML(context, 2);
  }

  function currentIndex() {
    const total = GF.state.students.length;
    if (!total) return 0;
    return Math.min(Math.max(0, GF.state.previewIndex), total - 1);
  }

  function selectedStudent() {
    return GF.state.students[currentIndex()] || null;
  }

  function renderStudentOptions() {
    const select = document.getElementById('preview-student-select');
    if (!select) return;
    select.innerHTML = GF.state.students.map(function (student, index) {
      return '<option value="' + index + '">' + esc(student.name) + ' · Roll ' + esc(student.roll) + '</option>';
    }).join('');
    select.value = String(currentIndex());
  }

  function matchingStudents(query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return GF.state.students
      .map(function (student, index) { return { student: student, index: index }; })
      .filter(function (entry) {
        return entry.student.name.toLowerCase().includes(normalized) ||
          String(entry.student.roll).toLowerCase().includes(normalized);
      });
  }

  function renderStudentSearch() {
    const input = document.getElementById('preview-student-search');
    const results = document.getElementById('preview-student-results');
    const status = document.getElementById('preview-student-search-status');
    if (!input || !results) return;
    input.value = previewSearch;
    const matches = matchingStudents(previewSearch);
    const isOpen = Boolean(previewSearch.trim());
    if (!isOpen || matches.length === 0) {
      activeSearchResult = -1;
    } else if (activeSearchResult >= matches.length) {
      activeSearchResult = matches.length - 1;
    } else if (activeSearchResult < 0) {
      activeSearchResult = 0;
    }
    results.hidden = !isOpen;
    input.setAttribute('aria-expanded', String(isOpen));
    const activeEntry = matches[activeSearchResult];
    if (activeEntry) input.setAttribute('aria-activedescendant', 'preview-student-option-' + activeEntry.index);
    else input.removeAttribute('aria-activedescendant');
    results.innerHTML = matches.map(function (entry, matchIndex) {
      return '<button type="button" class="student-search-result" role="option" tabindex="-1" id="preview-student-option-' + entry.index +
        '" aria-selected="' + String(matchIndex === activeSearchResult) + '" data-preview-index="' + entry.index + '">' +
        '<strong>' + esc(entry.student.name) + '</strong><span>ID ' + esc(entry.student.roll) + '</span></button>';
    }).join('');
    if (status) {
      status.textContent = !isOpen
        ? ''
        : matches.length
          ? matches.length + ' student' + (matches.length === 1 ? '' : 's') + ' found.'
          : 'No students found. Search by name or ID number.';
    }
    if (isOpen && matches.length === 0) {
      results.innerHTML = '<div class="student-search-empty">No students found. Try a name or ID number.</div>';
    }
  }

  function selectPreviewStudent(index) {
    if (!Number.isInteger(index) || index < 0 || index >= GF.state.students.length) return;
    GF.state.previewIndex = index;
    previewSearch = '';
    activeSearchResult = -1;
    renderPreview();
  }

  function updateApprovalPill() {
    const pill = document.getElementById('preview-approved-pill');
    const text = document.getElementById('preview-approved-text');
    if (!text) return;
    const total = GF.state.students.length;
    const approved = GF.approvedCount();
    text.textContent = approved + ' of ' + total + ' approved';
    if (pill) {
      pill.classList.toggle('pill-green', approved === total);
      pill.classList.toggle('pill-blue', approved !== total);
    }
  }

  function updateReadiness() {
    const note = document.getElementById('preview-readiness');
    const button = document.getElementById('generate-reports-btn');
    const total = GF.state.students.length;
    const missing = GF.missingGradeCells().length;
    const ready = GF.readyToGenerate();

    if (note) {
      if (ready) {
        note.textContent = total + ' students · ' + (total * 2) + ' pages';
      } else {
        const parts = [];
        if (missing) parts.push(missing + ' grade' + (missing === 1 ? '' : 's') + ' missing');
        note.textContent = parts.join(' · ') + ' · Preview only';
      }
    }

    if (button) {
      button.disabled = !ready;
      button.title = ready ? 'Create the final PDF-ready report set' : 'Finish verification before generating reports';
      button.innerHTML = (GF.state.generated ? 'Regenerate ' : 'Generate ') + total +
        ' report' + (total === 1 ? '' : 's') + ' <svg class="icon" aria-hidden="true"><use href="#i-arrow-right"></use></svg>';
    }
  }

  function renderPreview() {
    const student = selectedStudent();
    const front = document.getElementById('report-card-front');
    const back = document.getElementById('report-card-back');
    const info = document.getElementById('student-info');
    const previous = document.getElementById('prev-student');
    const next = document.getElementById('next-student');
    const total = GF.state.students.length;
    const context = contextForPreview();

    renderStudentOptions();
    renderStudentSearch();
    if (front) front.innerHTML = student ? buildFrontHTML(student, context) : '';
    if (back) back.innerHTML = student ? buildBackHTML(student, context) : '';
    if (info) info.textContent = total ? (currentIndex() + 1) + ' of ' + total : '0 of 0';
    if (previous) previous.disabled = currentIndex() <= 0;
    if (next) next.disabled = currentIndex() >= total - 1;
    updateApprovalPill();
    updateReadiness();
  }

  function move(offset) {
    const total = GF.state.students.length;
    if (!total) return;
    GF.state.previewIndex = Math.min(Math.max(0, currentIndex() + offset), total - 1);
    renderPreview();
  }

  function generateReports() {
    if (!GF.readyToGenerate()) {
      GF.showToast('Finish grade corrections before generating.', 'error');
      return;
    }
    const total = GF.state.students.length;
    const reportLabel = total === 1 ? 'report card' : 'report cards';
    GF.openModal({
      title: 'Generate ' + total + ' ' + reportLabel + '?',
      body: '<p>Each student gets a two-page report card: academic progress on the front, teacher reflections on the back.</p>' +
        '<p><strong>' + total + ' ' + reportLabel + ' · ' + (total * 2) + ' pages</strong></p>' +
        '<p>The final set will appear in Generated Reports, ready to download or print.</p>',
      confirmLabel: 'Generate reports',
      cancelLabel: 'Not yet',
      onConfirm: function () {
        GF.state.generated = true;
        GF.state.generatedAt = new Date();
        GF.state.selectedReportIds = new Set(GF.state.students.map(function (student) { return student.id; }));
        GF.state.reportsPage = 1;
        GF.state.reportsSearch = '';
        GF.navigateTo('generated-reports');
        GF.showToast(total + ' ' + reportLabel + ' generated for ' + GF.state.className + '.');
      }
    });
  }

  function bindEvents() {
    const select = document.getElementById('preview-student-select');
    const search = document.getElementById('preview-student-search');
    const searchResults = document.getElementById('preview-student-results');
    const previous = document.getElementById('prev-student');
    const next = document.getElementById('next-student');
    const generate = document.getElementById('generate-reports-btn');

    if (select) {
      select.addEventListener('change', function () {
        selectPreviewStudent(Number(select.value));
      });
    }
    if (search) {
      search.addEventListener('input', function () {
        previewSearch = search.value;
        activeSearchResult = 0;
        renderStudentSearch();
      });
      search.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const matches = matchingStudents(previewSearch);
          if (matches.length) {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            activeSearchResult = Math.min(matches.length - 1, Math.max(0, activeSearchResult + direction));
            renderStudentSearch();
          }
          return;
        }
        if (event.key === 'Enter') {
          const matches = matchingStudents(previewSearch);
          const exactMatch = matches.find(function (entry) {
            return entry.student.name.toLowerCase() === previewSearch.trim().toLowerCase() ||
              String(entry.student.roll).toLowerCase() === previewSearch.trim().toLowerCase();
          });
          if (exactMatch) {
            event.preventDefault();
            selectPreviewStudent(exactMatch.index);
            return;
          }
          if (matches[activeSearchResult]) {
            event.preventDefault();
            selectPreviewStudent(matches[activeSearchResult].index);
            return;
          }
          if (matches.length === 1) {
            event.preventDefault();
            selectPreviewStudent(matches[0].index);
          }
        } else if (event.key === 'Escape' && previewSearch) {
          previewSearch = '';
          activeSearchResult = -1;
          renderStudentSearch();
        }
      });
    }
    if (searchResults) {
      searchResults.addEventListener('click', function (event) {
        const result = event.target.closest('.student-search-result');
        if (!result) return;
        selectPreviewStudent(Number(result.getAttribute('data-preview-index')));
      });
    }
    if (previous) previous.addEventListener('click', function () { move(-1); });
    if (next) next.addEventListener('click', function () { move(1); });
    if (generate) generate.addEventListener('click', generateReports);

    document.addEventListener('keydown', function (event) {
      if (GF.state.currentPage !== 'report-card') return;
      if (event.target.closest('input, textarea, select')) return;
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    });
  }

  GF.registerPage('report-card', renderPreview);

  window.GradeFlowReports = {
    buildFrontHTML: buildFrontHTML,
    buildBackHTML: buildBackHTML,
    contextForPreview: contextForPreview
  };

  document.addEventListener('DOMContentLoaded', bindEvents);
})();
