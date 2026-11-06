/* ==========================================================================
   Report Card Preview
   Renders the live report card for a student. Every value
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

  function buildFrontHTML(student, context) {
    function gradeValue(value) {
      return value === null || value === undefined || value === '' || Number.isNaN(Number(value))
        ? '—' : esc(String(value));
    }

    function semesterAverage(semester) {
      const average = GF.semesterAverage(student, semester.key);
      return average === null ? '—' : String(average);
    }

    const semestersHTML = GF.SEMESTERS.map(function (semester) {
      const groupHTML = semester.groups.map(function (group) {
        const subjectsHTML = group.subjects.map(function (entry) {
          const subject = GF.SUBJECTS.find(function (item) { return item.key === entry[0]; });
          const grades = student.grades[subject.key] || {};
          return '<tr><td>' + esc(subject.name) + '</td>' +
            '<td class="rc-score">' + gradeValue(grades[semester.quarters[0]]) + '</td>' +
            '<td class="rc-score">' + gradeValue(grades[semester.quarters[1]]) + '</td>' +
            '<td class="rc-score rc-semester-final">' + gradeValue(grades.final) + '</td>' +
            '<td class="rc-remarks rc-remarks-' + GF.remarkFor(grades.final).toLowerCase() + '">' + esc(GF.remarkFor(grades.final)) + '</td></tr>';
        }).join('');
        return '<tr class="rc-subject-group"><th colspan="5">' + esc(group.name) + '</th></tr>' + subjectsHTML +
          '<tr class="rc-grade-spacer"><td colspan="5"></td></tr>';
      }).join('');
      return '<section class="rc-semester">' +
        '<h4>' + esc(semester.label) + '</h4>' +
        '<table class="rc-table rc-official-grade-table">' +
          '<caption class="sr-only">' + esc(semester.label) + ' subjects and grades</caption>' +
          '<colgroup><col class="rc-col-subject"><col class="rc-col-score">' +
            '<col class="rc-col-score"><col class="rc-col-final"><col class="rc-col-remarks"></colgroup>' +
          '<thead><tr><th rowspan="2" scope="col">Subjects</th><th colspan="2" scope="colgroup">Quarter</th>' +
            '<th rowspan="2" scope="col">Semester<br>Final Grade</th><th rowspan="2" scope="col">Remarks</th></tr>' +
            '<tr><th scope="col">' + semester.quarterLabels[0] + '</th><th scope="col">' +
              semester.quarterLabels[1] + '</th></tr></thead>' +
          '<tbody>' + groupHTML +
            '<tr class="rc-semester-average"><th colspan="3" scope="row">General Average for the Semester</th>' +
              '<td>' + semesterAverage(semester) + '</td>' +
              '<td class="rc-remarks">' + esc(GF.remarkFor(semesterAverage(semester))) + '</td></tr></tbody>' +
        '</table>' +
      '</section>';
    }).join('');

    const attendance = student.attendance || {};
    const attendanceRows = [
      { label: 'No. of school days', values: attendance.schoolDays || {} },
      { label: 'No. of days present', values: attendance.months || {} },
      { label: 'No. of days absent', values: attendance.absent || {} }
    ];
    const attendanceHTML = '<div class="rc-attendance-wrap"><table class="rc-attendance-table"><caption>Report of attendance</caption>' +
      '<colgroup><col class="rc-attendance-label">' +
        GF.ATTENDANCE_MONTHS.map(function () { return '<col>'; }).join('') +
        '<col class="rc-attendance-total"></colgroup>' +
      '<thead><tr><th scope="col"></th>' + GF.ATTENDANCE_MONTHS.map(function (month) {
        return '<th scope="col">' + esc(month.label) + '</th>';
      }).join('') + '<th scope="col">Total</th></tr></thead><tbody>' +
      attendanceRows.map(function (row) {
        const values = GF.ATTENDANCE_MONTHS.map(function (month) { return row.values[month.key]; });
        const total = values.reduce(function (sum, value) { return sum + (Number(value) || 0); }, 0);
        const hasValue = values.some(function (value) { return value !== null && value !== undefined && value !== ''; });
        return '<tr><th scope="row">' + esc(row.label) + '</th>' +
          values.map(function (value) { return '<td>' + (value == null || value === '' ? '' : esc(String(value))) + '</td>'; }).join('') +
          '<td>' + (hasValue ? String(total) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    const observedValueLabels = [
      ['makaDiyos', '1. Maka-Diyos'],
      ['makatao', '2. Makatao'],
      ['makakalikasan', '3. Maka kalikasan'],
      ['makabansa', '4. Makabansa']
    ];
    const observedStatements = {
      makaDiyos: [
        "Expresses one's spiritual beliefs while respecting the spiritual beliefs of others",
        'Demonstrates adherence to ethical principles by upholding truth'
      ],
      makatao: [
        'Is sensitive to individual, social, and cultural differences',
        'Demonstrates contributions toward solidarity'
      ],
      makakalikasan: [
        'Cares for the environment and utilizes resources wisely, judiciously, and economically',
        'Demonstrates stewardship in keeping a flourishing environment'
      ],
      makabansa: [
        'Demonstrates pride in being a Filipino; expresses the rights and responsibilities of a Filipino citizen',
        'Demonstrates appropriate behavior in carrying out activities in the school, community, and country'
      ]
    };
    // The uploaded sheet stores one rating per core value per quarter, so the
    // rating is shown on both behavior-statement rows, as on the printed form.
    const observedValuesHTML = observedValueLabels.map(function (item) {
      const values = student.observedValues && student.observedValues[item[0]] || {};
      const statements = observedStatements[item[0]];
      const ratingCells = ['q1', 'q2', 'q3', 'q4'].map(function (period) {
        return '<td>' + esc(values[period] || '') + '</td>';
      }).join('');
      return '<tr><th scope="rowgroup" rowspan="2">' + esc(item[1]) + '</th><td>' +
        esc(statements[0]) + '</td>' + ratingCells + '</tr><tr><td>' +
        esc(statements[1]) + '</td>' + ratingCells + '</tr>';
    }).join('');
    const transfer = student.transfer || {};
    const addressLines = String(context.schoolAddress || '').split(' · ').filter(Boolean);
    const schoolAddressHTML = addressLines.filter(function (line) {
      return line.toLowerCase().indexOf('senior high school department') === -1;
    }).map(function (line) {
      return '<span>' + esc(line) + '</span>';
    }).join('');
    const transferLeftFields = [
      ['Admitted to', transfer.admittedTo],
      ['Section', transfer.section || context.section],
      ['Eligibility for Admission to Grade', transfer.eligibilityForGrade],
      ['Approved', transfer.approvedBy]
    ];
    const transferRightFields = [
      ['Admitted in', transfer.admittedIn],
      ['Date', transfer.transferDate]
    ];
    function transferRows(fields) {
      return fields.map(function (field) {
        return '<tr><th scope="row">' + esc(field[0]) + ':</th><td>' +
          (field[1] ? esc(field[1]) : '') +
          '</td></tr>';
      }).join('');
    }

    return '<div class="rc-official-layout">' +
      '<section class="rc-official-learner" aria-label="Learner details and observations">' +
        '<div class="rc-official-school">' +
          '<img class="rc-logo" src="' + esc(GF.state.school.logo || 'assets/ui-logo.png') + '" alt="University of Iloilo seal">' +
          '<div>' + schoolAddressHTML + '<strong>' + esc(context.schoolName) + '</strong>' +
            '<span>Senior High School Department</span></div>' +
        '</div>' +
        '<div class="rc-official-fields">' +
          '<div class="rc-official-field rc-official-name"><span>Name:</span><strong>' + esc(student.name) + '</strong></div>' +
          '<div class="rc-official-field"><span>Age:</span><strong>' + esc(student.age || '—') + '</strong></div>' +
          '<div class="rc-official-field"><span>Sex:</span><strong>' + esc(student.sex || '—') + '</strong></div>' +
          '<div class="rc-official-field"><span>Grade:</span><strong>' + esc(context.gradeLevel) + '</strong></div>' +
          '<div class="rc-official-field"><span>Section:</span><strong>' + esc(context.section) + '</strong></div>' +
          '<div class="rc-official-field"><span>School Year:</span><strong>' + esc(GF.prettyYear(context.year)) + '</strong></div>' +
          '<div class="rc-official-field"><span>LRN:</span><strong>' + esc(student.lrn || '—') + '</strong></div>' +
          '<div class="rc-official-field rc-official-track"><span>Track/Strand:</span><strong>' + esc(context.trackStrand || context.strand || '—') + '</strong></div>' +
        '</div>' +
        '<div class="rc-official-note"><strong>Dear Parent:</strong>' +
          '<p>This report card shows your child’s performance in the different learning areas as well as in character formation.</p>' +
          '<p>The school welcomes you if you desire to know more about the progress of your child.</p></div>' +
        '<section class="rc-transfer">' +
          '<div class="rc-cert-signatories">' +
            '<div><strong>' + esc(context.teacher || '') + '</strong><span>Adviser</span></div>' +
            '<div><strong>' + esc(context.principal || '') + '</strong><span>Principal</span></div>' +
          '</div>' +
          '<div class="rc-transfer-grid">' +
            '<div class="rc-transfer-panel"><h4>Certificate of Transfer</h4><table><tbody>' + transferRows(transferLeftFields) +
              '<tr class="rc-transfer-signature"><td colspan="2">' +
                '<div class="rc-signature-pair"><span>Adviser</span><span>Principal</span></div>' +
              '</td></tr>' +
              '</tbody></table></div>' +
            '<div class="rc-transfer-panel"><h4>Cancellation of Eligibility to Transfer</h4><table><tbody>' + transferRows(transferRightFields) +
              '<tr class="rc-transfer-spacer"><td colspan="2"></td></tr>' +
              '<tr class="rc-transfer-signature"><td colspan="2">' +
                '<div class="rc-signature-single"><span>Principal</span></div>' +
              '</td></tr>' +
              '</tbody></table></div>' +
          '</div>' +
        '</section>' +
        attendanceHTML +
        '<div class="rc-official-values-wrap"><table class="rc-official-values">' +
          '<caption>Report on learner’s observed values</caption>' +
          '<colgroup><col class="rc-values-core"><col class="rc-values-statement">' +
            '<col span="4" class="rc-values-quarter"></colgroup>' +
          '<thead><tr><th scope="col">Core values</th><th scope="col">Behavior Statements</th>' +
            '<th colspan="4" scope="colgroup">Quarter</th></tr><tr><th></th><th></th>' +
            '<th scope="col">1</th><th scope="col">2</th><th scope="col">3</th><th scope="col">4</th></tr></thead><tbody>' +
          observedValuesHTML +
        '</tbody></table></div>' +
      '</section>' +
      '<section class="rc-official-grades" aria-label="Learning progress and achievement">' +
        '<div class="rc-official-title"><strong>REPORT ON LEARNING PROGRESS AND ACHIEVEMENT</strong></div>' +
        semestersHTML +
        '<div class="rc-official-legends">' +
          '<table><caption>Observed values</caption><tbody>' +
            '<tr><th>AO</th><td>Always Observed</td></tr><tr><th>SO</th><td>Sometimes Observed</td></tr>' +
            '<tr><th>RO</th><td>Rarely Observed</td></tr><tr><th>NO</th><td>Not Observed</td></tr>' +
          '</tbody></table>' +
          '<table><caption>Learning Progress &amp; Achievement</caption><tbody>' +
            '<tr><td>Outstanding</td><td>90–100</td><td>Passed</td></tr>' +
            '<tr><td>Very Satisfactory</td><td>85–89</td><td>Passed</td></tr>' +
            '<tr><td>Satisfactory</td><td>80–84</td><td>Passed</td></tr>' +
            '<tr><td>Fairly Satisfactory</td><td>75–79</td><td>Passed</td></tr>' +
            '<tr><td>Did Not Meet Expectations</td><td>below 75</td><td>Failed</td></tr>' +
          '</tbody></table>' +
          '<table class="rc-parent-signatures"><caption>Parent/Guardian’s<br>Signature</caption><tbody>' +
            '<tr><th>1st Q</th><td></td></tr><tr><th>2nd Q</th><td></td></tr>' +
            '<tr><th>3rd Q</th><td></td></tr><tr><th>4th Q</th><td></td></tr>' +
          '</tbody></table>' +
        '</div>' +
      '</section>' +
    '</div>';
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
      return '<option value="' + index + '">' + (student.lrn ? esc(student.lrn) + ' — ' : '') + esc(student.name) + ' · Roll ' + esc(student.roll) + '</option>';
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
          String(entry.student.roll).toLowerCase().includes(normalized) ||
          String(entry.student.lrn || '').toLowerCase().includes(normalized);
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
        '<strong>' + esc(entry.student.name) + '</strong><span>' + (entry.student.lrn ? 'LRN ' + esc(entry.student.lrn) : 'ID ' + esc(entry.student.roll)) + '</span></button>';
    }).join('');
    if (status) {
      status.textContent = !isOpen
        ? ''
        : matches.length
          ? matches.length + ' student' + (matches.length === 1 ? '' : 's') + ' found.'
          : 'No students found. Search by name, LRN or ID number.';
    }
    if (isOpen && matches.length === 0) {
      results.innerHTML = '<div class="student-search-empty">No students found. Try a name, LRN or ID number.</div>';
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
        note.textContent = total + ' students · ' + total + ' pages';
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
    const info = document.getElementById('student-info');
    const previous = document.getElementById('prev-student');
    const next = document.getElementById('next-student');
    const total = GF.state.students.length;
    const context = contextForPreview();

    renderStudentOptions();
    renderStudentSearch();
    if (front) front.innerHTML = student ? buildFrontHTML(student, context) : '';
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
      body: '<p>Each student gets a one-page landscape report card with learner details, attendance, observations, and grades.</p>' +
        '<p><strong>' + total + ' ' + reportLabel + ' · ' + total + ' pages</strong></p>' +
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
    contextForPreview: contextForPreview
  };

  document.addEventListener('DOMContentLoaded', bindEvents);
})();
