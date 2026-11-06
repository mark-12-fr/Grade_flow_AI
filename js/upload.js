/* ==========================================================================
   Upload Grades
   Reads CSV and Excel files locally. No grade is ever invented.
   ========================================================================== */
(function () {
  'use strict';

  const GF = window.GradeFlow;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const ATTENDANCE_FIELDS = ['schoolDays', 'present', 'absent'];
  const TRANSFER_FIELDS = [
    'certificateOfTransfer',
    'cancellationOfEligibility',
    'admittedTo',
    'admittedIn',
    'eligibilityForGrade',
    'transferDate',
    'approvedBy'
  ];
  const CORE_VALUE_KEYS = ['makaDiyos', 'makatao', 'makakalikasan', 'makabansa'];
  const CLASS_METADATA_ALIASES = {
    className: ['classname', 'class'],
    strand: ['strand'],
    gradeLevel: ['gradelevel'],
    year: ['schoolyear', 'academicyear'],
    term: ['term', 'gradingperiod', 'reportingperiod'],
    section: ['section', 'sectionname'],
    studentStatus: ['studentstatus', 'learnerstatus'],
    graduationStatus: ['graduationstatus'],
    teacher: ['adviser', 'advisor', 'teacher', 'classadviser'],
    principal: ['principal']
  };
  let nextSf10FileId = 1;
  let manualClassDetailsConfirmed = false;

  const HEADER_ALIASES = {
    roll: ['roll', 'rollno', 'rollnumber', 'no', 'number', 'id', 'studentid'],
    name: ['studentname', 'name', 'student', 'fullname'],
    age: ['age'],
    sex: ['sex', 'gender'],
    lrn: ['lrn', 'learnerreferencenumber']
  };

  function normalizeHeader(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function gradePeriodAliases(subject, period) {
    if (period === 'final') {
      return subject.semester === 'first'
        ? ['semester1final', 'sem1final', 'firstsemesterfinal', 'firstsemfinal']
        : ['semester2final', 'sem2final', 'secondsemesterfinal', 'secondsemfinal'];
    }
    return period === 'q1' ? ['q1', 'quarter1', 'qtr1']
      : period === 'q2' ? ['q2', 'quarter2', 'qtr2']
        : period === 'q3' ? ['q3', 'quarter3', 'qtr3']
          : ['q4', 'quarter4', 'qtr4'];
  }

  function gradeColumnIndex(headerRow, subject, period) {
    const subjectName = normalizeHeader(subject.name);
    const suffixes = gradePeriodAliases(subject, period);
    const normalized = headerRow.map(normalizeHeader);
    return normalized.findIndex(function (header) {
      return suffixes.some(function (suffix) { return header === subjectName + suffix; });
    });
  }

  function gradeHeaderMatch(header) {
    return GF.SUBJECTS.some(function (subject) {
      return subject.quarters.concat(subject.finalKey).some(function (period) {
        return gradeColumnIndex([header], subject, period) === 0;
      });
    });
  }

  function findHeaderRow(rows) {
    for (let index = 0; index < Math.min(rows.length, 6); index += 1) {
      const normalized = rows[index].map(normalizeHeader);
      const hasName = normalized.some(function (cell) { return HEADER_ALIASES.name.includes(cell); });
      const hasSubject = normalized.some(gradeHeaderMatch);
      if (hasName && hasSubject) return index;
    }
    return -1;
  }

  function getColumnIndex(headerRow, aliases) {
    const normalized = headerRow.map(normalizeHeader);
    for (let index = 0; index < normalized.length; index += 1) {
      if (aliases.includes(normalized[index])) return index;
    }
    return -1;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const source = text.replace(/^\uFEFF/, '');

    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (inQuotes) {
        if (character === '"' && source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          inQuotes = false;
        } else {
          field += character;
        }
      } else if (character === '"') {
        inQuotes = true;
      } else if (character === ',') {
        row.push(field);
        field = '';
      } else if (character === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (character !== '\r') {
        field += character;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter(function (line) {
      return line.some(function (cell) { return String(cell).trim() !== ''; });
    });
  }

  async function readWorkbook(file) {
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (extension === '.csv') {
      return parseCsv(await file.text());
    }
    if (!window.XLSX) {
      throw new Error('Excel support did not load. Please use a CSV file or reload the page.');
    }
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('The workbook does not contain a sheet.');
    const sheet = workbook.Sheets[sheetName];
    return window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false });
  }

  function parseGradeValue(rawValue) {
    if (rawValue === null || rawValue === undefined) return { value: null };
    const cleaned = String(rawValue).trim().replace(/%$/, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '—' || cleaned.toLowerCase() === 'n/a') {
      return { value: null };
    }
    const numeric = Number(cleaned);
    if (!Number.isFinite(numeric)) return { error: 'is not a number' };
    return { value: numeric };
  }

  function parseNumber(rawValue) {
    if (rawValue === null || rawValue === undefined) return null;
    const cleaned = String(rawValue).trim();
    if (cleaned === '') return null;
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) && Number.isInteger(numeric) && numeric >= 0 ? numeric : NaN;
  }

  function readClassMetadata(headerRow, dataRows) {
    const details = {};
    const errors = [];
    Object.keys(CLASS_METADATA_ALIASES).forEach(function (key) {
      const columnIndex = getColumnIndex(headerRow, CLASS_METADATA_ALIASES[key]);
      if (columnIndex < 0) return;
      const values = Array.from(new Set(dataRows.map(function (row) {
        return String(row[columnIndex] == null ? '' : row[columnIndex]).trim();
      }).filter(Boolean)));
      if (values.length > 1) {
        errors.push('Class detail "' + key + '" has different values in the learner rows.');
      } else if (values.length === 1) {
        details[key] = values[0];
      }
    });
    if (errors.length) throw new Error(errors.join('\n'));
    return details;
  }

  function buildStudentsFromRows(rows, headerIndex) {
    const headerRow = rows[headerIndex];
    const dataRows = rows.slice(headerIndex + 1).filter(function (row) {
      return row.some(function (cell) { return String(cell).trim() !== ''; });
    });
    if (dataRows.length === 0) throw new Error('The file has headers but no learner row.');

    const columns = {
      roll: getColumnIndex(headerRow, HEADER_ALIASES.roll),
      name: getColumnIndex(headerRow, HEADER_ALIASES.name),
      age: getColumnIndex(headerRow, HEADER_ALIASES.age),
      sex: getColumnIndex(headerRow, HEADER_ALIASES.sex),
      lrn: getColumnIndex(headerRow, HEADER_ALIASES.lrn),
      grades: {},
      attendance: {},
      transfer: {},
      observedValues: {}
    };

    const missingColumns = [];
    GF.SUBJECTS.forEach(function (subject) {
      columns.grades[subject.key] = {};
      subject.quarters.concat(subject.finalKey).forEach(function (period) {
        const index = gradeColumnIndex(headerRow, subject, period);
        columns.grades[subject.key][period] = index;
        if (index === -1) {
          const label = period === 'final' ? (subject.semester === 'first' ? 'Semester 1 Final' : 'Semester 2 Final')
            : 'Quarter ' + period.slice(1);
          missingColumns.push(subject.name + ' ' + label);
        }
      });
    });
    if (columns.name === -1) missingColumns.unshift('Student Name');
    if (missingColumns.length) {
      throw new Error('Missing required grade columns: ' + missingColumns.slice(0, 5).join(', ') +
        (missingColumns.length > 5 ? ', and ' + (missingColumns.length - 5) + ' more' : '') + '. Download the report-card template for the full column list.');
    }

    GF.ATTENDANCE_MONTHS.forEach(function (month) {
      columns.attendance[month.key] = {};
      ATTENDANCE_FIELDS.forEach(function (field) {
        const index = getColumnIndex(headerRow, [normalizeHeader(month.label + ' ' + field)]);
        columns.attendance[month.key][field] = index;
      });
    });
    TRANSFER_FIELDS.forEach(function (field) {
      columns.transfer[field] = getColumnIndex(headerRow, [normalizeHeader(field)]);
    });
    CORE_VALUE_KEYS.forEach(function (key) {
      columns.observedValues[key] = {};
      ['q1', 'q2', 'q3', 'q4'].forEach(function (period) {
        columns.observedValues[key][period] = getColumnIndex(headerRow, [normalizeHeader(key + ' ' + period)]);
      });
    });

    const students = [];
    const errors = [];

    dataRows.forEach(function (row, rowIndex) {
      const name = String(row[columns.name] || '').trim();
      if (!name) {
        errors.push('Row ' + (headerIndex + rowIndex + 2) + ' has no student name.');
        return;
      }
      const student = {
        id: students.length + 1,
        roll: columns.roll > -1 ? String(row[columns.roll] || '').trim() : '',
        name: name.slice(0, 80),
        age: columns.age > -1 ? String(row[columns.age] || '').trim() : '',
        sex: columns.sex > -1 ? String(row[columns.sex] || '').trim() : '',
        lrn: columns.lrn > -1 ? String(row[columns.lrn] || '').trim() : '',
        grades: {},
        attendance: { present: null, total: null, months: {}, schoolDays: {}, absent: {} },
        transfer: {},
        observedValues: {},
        comment: '',
        commentReviewed: true,
        traits: null,
        nextSteps: null
      };

      GF.SUBJECTS.forEach(function (subject) {
        const grades = {};
        subject.quarters.concat(subject.finalKey).forEach(function (period) {
          const columnIndex = columns.grades[subject.key][period];
          const parsed = parseGradeValue(row[columnIndex]);
          const label = period === 'final'
            ? (subject.semester === 'first' ? 'Semester 1 Final' : 'Semester 2 Final')
            : 'Quarter ' + period.slice(1);
          if (parsed.error) {
            errors.push(name + ' · ' + subject.name + ' ' + label + ' ' + parsed.error + ' ("' + String(row[columnIndex]).slice(0, 20) + '").');
            return;
          }
          if (parsed.value !== null && !GF.isValidGrade(parsed.value)) {
            errors.push(name + ' · ' + subject.name + ' ' + label + ' must be between ' + GF.scaleMinimum() + ' and 100.');
            return;
          }
          grades[period] = parsed.value;
        });
        student.grades[subject.key] = grades;
      });

      let totalPresent = 0;
      let totalSchoolDays = 0;
      GF.ATTENDANCE_MONTHS.forEach(function (month) {
        const indexes = columns.attendance[month.key];
        const schoolDays = indexes.schoolDays > -1 ? parseNumber(row[indexes.schoolDays]) : null;
        const present = indexes.present > -1 ? parseNumber(row[indexes.present]) : null;
        const absent = indexes.absent > -1 ? parseNumber(row[indexes.absent]) : null;
        [['school days', schoolDays], ['days present', present], ['days absent', absent]].forEach(function (entry) {
          if (Number.isNaN(entry[1])) errors.push(name + ' · ' + month.label + ' ' + entry[0] + ' must be a non-negative whole number.');
        });
        student.attendance.schoolDays[month.key] = schoolDays;
        student.attendance.months[month.key] = present;
        student.attendance.absent[month.key] = absent;
        if (Number.isFinite(schoolDays) && Number.isFinite(present) && Number.isFinite(absent) && present + absent > schoolDays) {
          errors.push(name + ' · ' + month.label + ' attendance exceeds the number of school days.');
        }
        if (Number.isFinite(present)) totalPresent += present;
        if (Number.isFinite(schoolDays)) totalSchoolDays += schoolDays;
      });
      if (totalSchoolDays) {
        student.attendance.present = totalPresent;
        student.attendance.total = totalSchoolDays;
      }

      TRANSFER_FIELDS.forEach(function (field) {
        const index = columns.transfer[field];
        student.transfer[field] = index > -1 ? String(row[index] || '').trim() : '';
      });
      CORE_VALUE_KEYS.forEach(function (key) {
        student.observedValues[key] = {};
        ['q1', 'q2', 'q3', 'q4'].forEach(function (period) {
          const index = columns.observedValues[key][period];
          student.observedValues[key][period] = index > -1 ? String(row[index] || '').trim() : '';
        });
      });

      students.push(student);
    });

    if (errors.length) throw new Error(errors.slice(0, 4).join('\n'));

    students.forEach(function (student) {
      student.comment = GF.buildComment(student);
      student.traits = GF.makeTraits(student);
      student.nextSteps = GF.makeNextSteps(student);
    });
    return {
      students: students,
      classDetails: readClassMetadata(headerRow, dataRows)
    };
  }

  function setSelectValue(select, value) {
    if (!select || !value) return;
    const exists = Array.from(select.options).some(function (option) {
      return option.value === value;
    });
    if (!exists) select.add(new Option(value, value));
    select.value = value;
  }

  function syncSelects() {
    const strandSelect = document.getElementById('strand-selector');
    const gradeLevelSelect = document.getElementById('grade-level-selector');
    const schoolYearSelect = document.getElementById('school-year-selector');
    const statusSelect = document.getElementById('status-selector');
    const graduationStatusSelect = document.getElementById('graduation-status-selector');
    const sectionSelect = document.getElementById('section-selector');
    const adviserInput = document.getElementById('adviser-name');
    const principalInput = document.getElementById('principal-name');
    const termInput = document.getElementById('term-name');
    setSelectValue(strandSelect, GF.state.strand);
    setSelectValue(gradeLevelSelect, GF.state.gradeLevel);
    setSelectValue(schoolYearSelect, GF.state.year);
    setSelectValue(statusSelect, GF.state.studentStatus);
    setSelectValue(graduationStatusSelect, GF.state.graduationStatus);
    setSelectValue(sectionSelect, GF.state.section);
    if (adviserInput) adviserInput.value = GF.state.teacher;
    if (principalInput) principalInput.value = GF.state.school.principal;
    if (termInput) termInput.value = GF.state.term;
  }

  function hasCompleteImportedClassDetails(details) {
    const required = ['strand', 'gradeLevel', 'year', 'term', 'section',
      'studentStatus', 'graduationStatus', 'teacher', 'principal'];
    return required.every(function (key) { return Boolean(details && details[key]); });
  }

  function invalidateManualClassDetailsConfirmation() {
    manualClassDetailsConfirmed = false;
    const confirmation = document.getElementById('confirm-manual-class-details');
    if (confirmation) confirmation.checked = false;
  }

  function setError(message) {
    const box = document.getElementById('file-error');
    if (!box) return;
    if (!message) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    const lines = String(message).split('\n');
    box.innerHTML = '<strong>' + GF.escape(lines[0]) + '</strong>' +
      (lines.slice(1).map(function (line) { return '<br>' + GF.escape(line); }).join(''));
    box.hidden = false;
  }

  function updateFileUI() {
    const info = document.getElementById('file-info');
    const emptyHint = document.getElementById('selected-filename');
    const details = document.getElementById('file-details');
    const continueBtn = document.getElementById('continue-btn');
    const upload = GF.state.upload;

    if (!info) return;
    if (!upload) {
      info.hidden = true;
      if (emptyHint) emptyHint.textContent = 'No class file uploaded';
      if (details) details.textContent = '—';
      if (continueBtn) continueBtn.disabled = true;
      return;
    }

    info.hidden = false;
    if (emptyHint) emptyHint.textContent = upload.name;
    if (details) {
      const fileCount = upload.files.length;
      details.textContent = upload.rows + ' learner' + (upload.rows === 1 ? '' : 's') +
        ' · ' + fileCount + ' grade file' + (fileCount === 1 ? '' : 's');
    }
    if (continueBtn) continueBtn.disabled = false;
  }

  function sf10State() {
    if (!GF.state.sf10) GF.state.sf10 = { classFile: null, studentFiles: [], analysisRun: false };
    if (!Array.isArray(GF.state.sf10.studentFiles)) GF.state.sf10.studentFiles = [];
    if (GF.state.sf10.analysisRun === undefined) GF.state.sf10.analysisRun = false;
    return GF.state.sf10;
  }

  function sf10FileLabel(file) {
    return GF.escape(file.name) + ' · ' + GF.formatFileSize(file.size);
  }

  function renderSf10UI() {
    const state = sf10State();
    const classList = document.getElementById('class-sf10-file-list');
    const studentList = document.getElementById('student-sf10-file-list');
    const analyzeButton = document.getElementById('analyze-sf10-btn');
    const analysisResult = document.getElementById('sf10-analysis-result');
    if (classList) {
      classList.innerHTML = state.classFile
        ? '<div class="sf10-file-row"><span class="file-type-icon"><svg class="icon" aria-hidden="true"><use href="#i-file-text"></use></svg></span>' +
          '<span class="sf10-file-name">' + sf10FileLabel(state.classFile) + '</span>' +
          '<button type="button" class="icon-btn" data-remove-class-sf10 aria-label="Remove class SF10">' +
            '<svg class="icon" aria-hidden="true"><use href="#i-x"></use></svg></button></div>'
        : '<span class="sf10-empty">No class SF10 selected</span>';
    }

    if (!studentList) return;
    if (!state.studentFiles.length) {
      studentList.innerHTML = '<span class="sf10-empty">No student SF10s selected</span>';
    } else {
      const hasUploadedRoster = Boolean(GF.state.upload);
      studentList.innerHTML = state.studentFiles.map(function (entry) {
        const options = hasUploadedRoster
          ? '<label class="sr-only" for="sf10-student-' + entry.id + '">Assign ' + GF.escape(entry.file.name) + ' to a student</label>' +
            '<div class="select-wrap"><select id="sf10-student-' + entry.id + '" data-sf10-student="' + entry.id + '">' +
              '<option value="">Select a student</option>' +
              GF.state.students.map(function (student) {
                return '<option value="' + student.id + '"' +
                  (String(entry.studentId) === String(student.id) ? ' selected' : '') + '>' +
                  GF.escape(student.name) + (student.roll ? ' · ' + GF.escape(student.roll) : '') + '</option>';
              }).join('') +
            '</select><svg class="icon select-chevron" aria-hidden="true"><use href="#i-chevron-down"></use></svg></div>'
          : '<span class="sf10-assignment-hint">Upload grade files to assign this document</span>';
        return '<div class="sf10-file-row">' +
          '<span class="file-type-icon"><svg class="icon" aria-hidden="true"><use href="#i-file-text"></use></svg></span>' +
          '<span class="sf10-file-name">' + sf10FileLabel(entry.file) + '</span>' +
          options +
          '<button type="button" class="icon-btn" data-remove-student-sf10="' + entry.id + '" aria-label="Remove ' +
            GF.escape(entry.file.name) + '">' +
            '<svg class="icon" aria-hidden="true"><use href="#i-x"></use></svg></button>' +
        '</div>';
      }).join('');
    }

    const hasDocuments = Boolean(state.classFile || state.studentFiles.length);
    if (analyzeButton) analyzeButton.disabled = !hasDocuments;
    if (analysisResult) {
      analysisResult.hidden = !state.analysisRun;
      if (state.analysisRun) analysisResult.innerHTML = buildSf10DemoSummary(state);
    }
  }

  function buildSf10DemoSummary(state) {
    const context = GF.reportContext();
    const documents = Number(Boolean(state.classFile)) + state.studentFiles.length;
    function semesterAverage(student, semester) {
      const subjects = semester.groups.reduce(function (all, group) {
        return all.concat(group.subjects.map(function (entry) {
          return GF.SUBJECTS.find(function (subject) { return subject.key === entry[0]; });
        }));
      }, []);
      const values = subjects.map(function (subject) {
        return (student.grades[subject.key] || {}).final;
      });
      if (values.some(function (value) {
        return value === null || value === undefined || value === '' || Number.isNaN(Number(value));
      })) return '—';
      return String(Math.round(values.reduce(function (sum, value) { return sum + Number(value); }, 0) / values.length));
    }
    const rosterSummary = GF.state.upload
      ? '<strong>Learner data from the uploaded grade sheets</strong><ul>' +
        GF.state.students.slice(0, 5).map(function (student) {
          return '<li>' + GF.escape(student.name) +
            ' · Age ' + GF.escape(student.age || '—') +
            ' · Sex ' + GF.escape(student.sex || '—') +
            ' · LRN ' + GF.escape(student.lrn || '—') +
            ' · Semester 1 average ' + GF.escape(semesterAverage(student, GF.SEMESTERS[0])) +
            ' · Semester 2 average ' + GF.escape(semesterAverage(student, GF.SEMESTERS[1])) +
            ' · Annual average ' + GF.escape(GF.averageLabel(student)) + '</li>';
        }).join('') +
        (GF.state.students.length > 5
          ? '<li>And ' + (GF.state.students.length - 5) + ' more learner records.</li>' : '') +
        '</ul><p>' + GF.state.students.length + ' learner' + (GF.state.students.length === 1 ? '' : 's') +
        ' and ' + GF.SUBJECTS.length + ' learning areas are available, including both semesters, quarter scores, and semester finals.</p>'
      : '<p>No grade-sheet roster uploaded yet; learner names, age, sex, LRN, and grades are not available to summarize.</p>';
    return '<strong>Demo summary (not extracted from the SF10 file)</strong>' +
      '<p>The uploaded document contents were not read. This simulation uses the class selections and grade sheets already entered in the app.</p>' +
      '<ul><li>Strand: ' + GF.escape(context.strand) + '</li>' +
      '<li>Grade level: ' + GF.escape(context.gradeLevel) + '</li>' +
      '<li>School year: ' + GF.escape(GF.prettyYear(context.year)) + '</li>' +
      '<li>Status: ' + GF.escape(context.studentStatus) + '</li>' +
      '<li>Graduation status: ' + GF.escape(context.graduationStatus) + '</li>' +
      '<li>Section: ' + GF.escape(context.section) + '</li>' +
      '<li>Adviser: ' + GF.escape(context.teacher) + '</li>' +
      '<li>Principal: ' + GF.escape(context.principal) + '</li>' +
      '<li>SF10 documents attached: ' + documents + '</li></ul>' +
      rosterSummary +
      '<p>Attendance and learner-observed values can be reviewed and edited in grade verification.</p>';
  }

  function addSf10Files(fileList, isClassFile) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const state = sf10State();
    const errors = files.filter(function (file) { return !file.size; }).map(function (file) {
      return file.name + ': file is empty.';
    });
    const validFiles = files.filter(function (file) { return file.size > 0; });

    if (isClassFile) {
      if (validFiles.length) state.classFile = validFiles[0];
      if (files.length > 1) errors.push('Choose one file for the class SF10.');
    } else {
      validFiles.forEach(function (file) {
        const duplicate = state.studentFiles.some(function (entry) {
          return entry.file.name === file.name && entry.file.size === file.size &&
            entry.file.lastModified === file.lastModified;
        });
        if (!duplicate) {
          state.studentFiles.push({ id: nextSf10FileId++, file: file, studentId: '' });
        }
      });
    }
    state.analysisRun = false;

    renderSf10UI();
    if (errors.length) {
      GF.showToast(errors.join(' '), 'error');
    } else {
      const count = isClassFile ? 1 : validFiles.length;
      GF.showToast(count + ' SF10 document' + (count === 1 ? '' : 's') + ' added.');
    }
  }

  function resetFile() {
    GF.state.upload = null;
    GF.state.students = GF.resetCurrentStudents();
    GF.state.selectedStudentId = GF.state.students[0].id;
    GF.state.previewIndex = 0;
    GF.state.verificationPage = 1;
    GF.state.verificationSearch = '';
    GF.state.verificationFilter = 'all';
    GF.state.reportsPage = 1;
    GF.state.reportsSearch = '';
    GF.state.selectedReportIds = new Set(GF.state.students.map(function (student) { return student.id; }));
    sf10State().studentFiles.forEach(function (entry) { entry.studentId = ''; });
    GF.state.processed = false;
    GF.state.processing = false;
    GF.state.progress = 0;
    GF.state.generated = false;
    GF.state.generatedAt = null;
    manualClassDetailsConfirmed = false;
    const manualConfirmation = document.getElementById('confirm-manual-class-details');
    if (manualConfirmation) manualConfirmation.checked = false;
    const input = document.getElementById('file-upload');
    if (input) input.value = '';
    setError('');
    updateFileUI();
    renderSf10UI();
    GF.refreshChrome();
  }

  /* ---------- AI import (server maps the columns, code copies the values) ---------- */
  const AI_TIMEOUT_MS = 90000;
  let lastAiError = '';
  let fileHelpDefault = null;

  function setImportBusy(message) {
    const zone = document.getElementById('dropzone');
    const help = document.getElementById('file-help');
    if (help && fileHelpDefault === null) fileHelpDefault = help.textContent;
    if (zone) {
      zone.classList.toggle('is-busy', Boolean(message));
      zone.setAttribute('aria-busy', message ? 'true' : 'false');
    }
    if (help) help.textContent = message || fileHelpDefault || '';
  }

  function aiSchema() {
    return {
      subjects: GF.SUBJECTS.map(function (subject) {
        return { key: subject.key, name: subject.name, semester: subject.semester };
      }),
      months: GF.ATTENDANCE_MONTHS.map(function (month) { return month.key; }),
      coreValues: CORE_VALUE_KEYS,
      transferFields: TRANSFER_FIELDS
    };
  }

  // Returns the parsed class, or null when the AI service is unavailable (caller falls back).
  async function importWithAI(file) {
    lastAiError = '';
    const controller = new AbortController();
    const timer = window.setTimeout(function () { controller.abort(); }, AI_TIMEOUT_MS);
    try {
      setImportBusy('Reading ' + file.name + ' with AI: finding learners, subjects and class details...');
      const body = new FormData();
      body.append('file', file);
      body.append('spec', JSON.stringify(aiSchema()));
      const response = await fetch('/api/import', { method: 'POST', body: body, signal: controller.signal });
      if (!response.ok) {
        let detail = 'HTTP ' + response.status;
        try { detail = (await response.json()).detail || detail; } catch (ignore) { /* not JSON */ }
        lastAiError = detail;
        return null;
      }
      const result = await response.json();
      if (!result || !Array.isArray(result.students) || !result.students.length) {
        lastAiError = 'The AI import returned no learners.';
        return null;
      }
      return {
        students: result.students,
        classDetails: result.classDetails || {},
        ai: { mapping: result.mapping || [], warnings: result.warnings || [], sheet: result.sheet || '' }
      };
    } catch (error) {
      lastAiError = error.name === 'AbortError' ? 'The AI import took too long.' : 'The AI import service is not reachable.';
      return null;
    } finally {
      window.clearTimeout(timer);
      setImportBusy('');
    }
  }

  // Put an imported class (from the local parser or the AI import) into the app state.
  function applyImport(students, importedClassDetails, info, errors) {
    const addedFiles = info.files;
    const totalSize = info.size;
    const input = document.getElementById('file-upload');
    errors = errors || [];
    students.forEach(function (student) {
      if (student.birthdate && !student.age) student.age = GF.ageFromBirthdate(student.birthdate);
      if (!student.comment) {
        student.comment = GF.buildComment(student);
        student.traits = GF.makeTraits(student);
        student.nextSteps = GF.makeNextSteps(student);
      }
    });
    if (importedClassDetails.strand) GF.state.strand = importedClassDetails.strand;
    if (importedClassDetails.gradeLevel) {
      GF.state.gradeLevel = importedClassDetails.gradeLevel.replace(/^grade\s*/i, '');
    }
    if (importedClassDetails.year) GF.state.year = importedClassDetails.year;
    if (importedClassDetails.term) GF.state.term = importedClassDetails.term;
    if (importedClassDetails.section) GF.state.section = importedClassDetails.section;
    if (importedClassDetails.studentStatus) GF.state.studentStatus = importedClassDetails.studentStatus;
    if (importedClassDetails.graduationStatus) GF.state.graduationStatus = importedClassDetails.graduationStatus;
    if (importedClassDetails.teacher) GF.state.teacher = importedClassDetails.teacher;
    if (importedClassDetails.principal) GF.state.school.principal = importedClassDetails.principal;
    GF.state.className = importedClassDetails.className ||
      (importedClassDetails.section
        ? 'Grade ' + GF.state.gradeLevel + ' · ' + importedClassDetails.section
        : GF.state.className);

    const missing = students.reduce(function (count, student) {
      return count + GF.missingGradeCells([student]).length;
    }, 0);

    GF.state.students = students;
    sf10State().studentFiles.forEach(function (entry) { entry.studentId = ''; });
    GF.state.selectedStudentId = (students.find(function (student) {
      return GF.studentStatus(student) === 'needs-correction';
    }) || students[0]).id;
    GF.state.previewIndex = 0;
    GF.state.verificationPage = 1;
    GF.state.verificationSearch = '';
    GF.state.verificationFilter = 'all';
    GF.state.reportsPage = 1;
    GF.state.reportsSearch = '';
    GF.state.selectedReportIds = new Set(students.map(function (student) { return student.id; }));
    GF.state.processed = false;
    GF.state.processing = false;
    GF.state.progress = 0;
    GF.state.generated = false;
    GF.state.generatedAt = null;
    GF.state.upload = {
      name: addedFiles[0],
      size: totalSize,
      rows: students.length,
      type: 'class',
      parsedAt: new Date(),
      mode: info.mode,
      files: addedFiles,
      classDetails: Object.assign({}, importedClassDetails),
      ai: info.ai || null
    };

    manualClassDetailsConfirmed = false;
    const manualConfirmation = document.getElementById('confirm-manual-class-details');
    if (manualConfirmation) manualConfirmation.checked = false;
    syncSelects();
    updateFileUI();
    renderSf10UI();
    if (input) input.value = '';
    GF.refreshChrome();
    if (errors.length) setError(errors.slice(0, 4).join('\n'));
    const aiNote = info.ai ? ' AI mapped ' + info.ai.mapping.length + ' columns' +
      (info.ai.warnings.length ? ' (' + info.ai.warnings.length + ' note' + (info.ai.warnings.length === 1 ? '' : 's') + ' to check).' : '.')
      : (lastAiError ? ' AI import unavailable, used the standard template reader.' : '');
    GF.showToast(addedFiles.length + ' class file' + (addedFiles.length === 1 ? '' : 's') + ' read.' + aiNote + ' ' +
      students.length + ' learner' + (students.length === 1 ? '' : 's') + ' found. ' +
      (missing ? missing + ' grade' + (missing === 1 ? '' : 's') + ' need review.' : 'All grades are complete.'),
    errors.length ? 'info' : missing ? 'info' : 'success');
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const input = document.getElementById('file-upload');
    setError('');
    if (files.length > 1) {
      setError('Upload one complete class gradebook at a time.');
      GF.showToast('Choose one class grade file.', 'error');
      if (input) input.value = '';
      return;
    }

    const students = [];
    const addedFiles = [];
    const errors = [];
    const importedClassDetails = {};
    let aiInfo = null;
    let totalSize = 0;

    for (const file of files) {
      const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!['.csv', '.xlsx', '.xls'].includes(extension)) {
        errors.push(file.name + ': unsupported file type. Use CSV or Excel.');
        continue;
      }
      if (file.size === 0) {
        errors.push(file.name + ': file is empty.');
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push(file.name + ': file is larger than 10 MB.');
        continue;
      }
      if (students.length >= 200) {
        errors.push(file.name + ': the class limit of 200 students has been reached.');
        continue;
      }

      try {
        let parsed = await importWithAI(file);
        if (parsed) {
          aiInfo = parsed.ai;
        } else {
          const rows = await readWorkbook(file);
          if (!rows || rows.length === 0) throw new Error('file is empty. Add a header row and at least one learner row.');
          const headerIndex = findHeaderRow(rows);
          if (headerIndex === -1) {
            throw new Error('header row not found. Include Student Name and one column per subject.');
          }
          parsed = buildStudentsFromRows(rows, headerIndex);
        }
        if (students.length + parsed.students.length > 200) {
          throw new Error('the class limit of 200 learners would be exceeded.');
        }

        const nextClassDetails = Object.assign({}, importedClassDetails);
        Object.keys(parsed.classDetails).forEach(function (key) {
          const value = parsed.classDetails[key];
          if (nextClassDetails[key] && nextClassDetails[key] !== value) {
            throw new Error('class detail "' + key + '" does not match the other uploaded files.');
          }
          nextClassDetails[key] = value;
        });

        const seenRolls = new Set(students.map(function (student) {
          return String(student.roll || '').toLowerCase();
        }).filter(Boolean));
        parsed.students.forEach(function (student, index) {
          const id = students.length + index + 1;
          student.id = id;
          student.roll = student.roll || String(id).padStart(2, '0');
          const normalizedRoll = student.roll.toLowerCase();
          if (seenRolls.has(normalizedRoll)) {
            throw new Error('student ID "' + student.roll + '" is duplicated in the class.');
          }
          seenRolls.add(normalizedRoll);
        });

        students.push.apply(students, parsed.students);
        Object.assign(importedClassDetails, nextClassDetails);
        addedFiles.push(file.name);
        totalSize += file.size;
      } catch (error) {
        errors.push(file.name + ': ' + (error.message || 'could not be read.') +
          (lastAiError ? ' (AI import: ' + lastAiError + ')' : ''));
      }
    }

    if (!addedFiles.length) {
      setError(errors.join('\n') || 'Choose a class grade file before continuing.');
      GF.showToast('No class grade files were added.', 'error');
      if (input) input.value = '';
      return;
    }

    applyImport(students, importedClassDetails, { files: addedFiles, size: totalSize, mode: aiInfo ? 'ai-import' : 'class-workbook', ai: aiInfo }, errors);
  }

  function downloadFile(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function templateRows() {
    const context = GF.reportContext();
    const headers = [
      'Class Name', 'Strand', 'Grade Level', 'School Year', 'Term', 'Section',
      'Student Status', 'Graduation Status', 'Adviser', 'Principal',
      'Roll', 'Student Name', 'Age', 'Sex', 'LRN'
    ];
    GF.SUBJECTS.forEach(function (subject) {
      subject.quarters.forEach(function (period) {
        headers.push(subject.name + ' ' + period.toUpperCase());
      });
      headers.push(subject.name + (subject.semester === 'first' ? ' Semester 1 Final' : ' Semester 2 Final'));
    });
    GF.ATTENDANCE_MONTHS.forEach(function (month) {
      headers.push(month.label + ' School Days', month.label + ' Present', month.label + ' Absent');
    });
    TRANSFER_FIELDS.forEach(function (field) {
      headers.push(field.replace(/([A-Z])/g, ' $1').replace(/^./, function (letter) { return letter.toUpperCase(); }));
    });
    CORE_VALUE_KEYS.forEach(function (key) {
      ['q1', 'q2', 'q3', 'q4'].forEach(function (period) {
        headers.push(key.replace(/([A-Z])/g, ' $1').replace(/^./, function (letter) { return letter.toUpperCase(); }) +
          ' ' + period.toUpperCase());
      });
    });
    const rows = [headers];
    GF.state.students.forEach(function (student) {
      const row = [
        context.className, context.strand, context.gradeLevel, context.year, context.term, context.section,
        context.studentStatus, context.graduationStatus, context.teacher, context.principal,
        student.roll, student.name, student.age || '', student.sex || '', student.lrn || ''
      ];
      GF.SUBJECTS.forEach(function (subject) {
        const grades = student.grades[subject.key] || {};
        subject.quarters.forEach(function (period) {
          row.push(grades[period] == null ? '' : grades[period]);
        });
        row.push(grades.final == null ? '' : grades.final);
      });
      GF.ATTENDANCE_MONTHS.forEach(function (month) {
        const attendance = student.attendance || {};
        row.push(
          attendance.schoolDays && attendance.schoolDays[month.key] != null ? attendance.schoolDays[month.key] : '',
          attendance.months && attendance.months[month.key] != null ? attendance.months[month.key] : '',
          attendance.absent && attendance.absent[month.key] != null ? attendance.absent[month.key] : ''
        );
      });
      TRANSFER_FIELDS.forEach(function (field) {
        row.push(student.transfer && student.transfer[field] || '');
      });
      CORE_VALUE_KEYS.forEach(function (key) {
        ['q1', 'q2', 'q3', 'q4'].forEach(function (period) {
          row.push(student.observedValues && student.observedValues[key] && student.observedValues[key][period] || '');
        });
      });
      rows.push(row);
    });
    return rows;
  }

  function downloadTemplate() {
    const rows = templateRows();
    const safeClass = GF.state.className.replace(/[^a-z0-9]+/gi, '').replace('Grade', 'Grade');
    const filename = 'GradeFlow_Report_Card_Template_' + safeClass + '.xlsx';
    if (window.XLSX) {
      const worksheet = window.XLSX.utils.aoa_to_sheet(rows);
      worksheet['!cols'] = rows[0].map(function (header, index) {
        return { wch: index < 15 ? (index === 11 ? 28 : 16) : Math.max(12, Math.min(42, String(header).length + 2)) };
      });
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Grade sheet');
      window.XLSX.writeFile(workbook, filename);
      GF.showToast('Template downloaded with fictional sample rows.');
      return;
    }

    // If SheetJS is unavailable, fall back to a perfectly valid CSV template.
    const csv = rows.map(function (row) {
      return row.map(function (cell) {
        const value = String(cell == null ? '' : cell);
        return /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
      }).join(',');
    }).join('\r\n');
    downloadFile(filename.replace(/\.xlsx$/, '.csv'), new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    GF.showToast('Template downloaded as CSV.');
  }

  function validateCurrentFile() {
    const fileInput = document.getElementById('file-upload');
    if (!GF.state.upload) {
      setError('Upload a class gradebook before continuing.');
      GF.showToast('Upload a class gradebook first.', 'error');
      return false;
    }
    const manualConfirmation = document.getElementById('confirm-manual-class-details');
    const manualConfirmed = manualClassDetailsConfirmed && manualConfirmation && manualConfirmation.checked;
    if (!hasCompleteImportedClassDetails(GF.state.upload.classDetails) && !manualConfirmed) {
      setError('Class details are missing from the workbook. Use the template or open the manual details and confirm them.');
      GF.showToast('Add or confirm the class details before continuing.', 'error');
      return false;
    }
    const errors = [];
    GF.state.students.forEach(function (student) {
      GF.SUBJECTS.forEach(function (subject) {
        const grades = student.grades[subject.key] || {};
        subject.quarters.concat(subject.finalKey).forEach(function (period) {
          const value = grades[period];
          if (value !== null && value !== undefined && !GF.isValidGrade(value)) {
            const label = period === 'final' ? 'semester final' : 'quarter ' + period.slice(1);
            errors.push(student.name + ' · ' + subject.name + ' ' + label + ' must be between ' + GF.scaleMinimum() + ' and 100.');
          }
        });
      });
    });
    if (errors.length) {
      setError(errors.slice(0, 4).join('\n'));
      GF.showToast('Some grades are outside the selected scale.', 'error');
      return false;
    }
    if (!GF.state.className || !GF.state.term || !GF.state.year || !GF.state.section) {
      GF.showToast('Choose a section, term, and school year.', 'error');
      return false;
    }
    if (fileInput) fileInput.value = '';
    setError('');
    return true;
  }

  function bindEvents() {
    const input = document.getElementById('file-upload');
    const browse = document.getElementById('browse-btn');
    const dropzone = document.getElementById('dropzone');
    const remove = document.getElementById('remove-file-btn');
    const template = document.getElementById('template-btn');
    const continueButton = document.getElementById('continue-btn');
    const classSf10Input = document.getElementById('class-sf10-upload');
    const studentSf10Input = document.getElementById('student-sf10-upload');
    const classSf10Browse = document.getElementById('browse-class-sf10');
    const studentSf10Browse = document.getElementById('browse-student-sf10');
    const classSf10List = document.getElementById('class-sf10-file-list');
    const studentSf10List = document.getElementById('student-sf10-file-list');
    const analyzeSf10Button = document.getElementById('analyze-sf10-btn');
    const adviserInput = document.getElementById('adviser-name');
    const principalInput = document.getElementById('principal-name');
    const termInput = document.getElementById('term-name');
    const manualConfirmation = document.getElementById('confirm-manual-class-details');

    if (analyzeSf10Button) {
      analyzeSf10Button.addEventListener('click', function () {
        const state = sf10State();
        if (!state.classFile && !state.studentFiles.length) {
          GF.showToast('Choose an SF10 document before running the demo.', 'error');
          return;
        }
        state.analysisRun = true;
        renderSf10UI();
      });
    }
    [adviserInput, principalInput].forEach(function (field) {
      if (!field) return;
      field.addEventListener('change', function () {
        invalidateManualClassDetailsConfirmation();
        GF.state.teacher = adviserInput ? adviserInput.value.trim() : GF.state.teacher;
        GF.state.school.principal = principalInput ? principalInput.value.trim() : GF.state.school.principal;
        renderSf10UI();
        GF.refreshChrome();
      });
    });
    if (termInput) {
      termInput.addEventListener('change', function () {
        invalidateManualClassDetailsConfirmation();
        GF.state.term = termInput.value.trim();
      });
    }
    if (manualConfirmation) {
      manualConfirmation.addEventListener('change', function () {
        manualClassDetailsConfirmed = manualConfirmation.checked;
      });
    }

    if (classSf10Browse && classSf10Input) {
      classSf10Browse.addEventListener('click', function () { classSf10Input.click(); });
      classSf10Input.addEventListener('change', function () {
        addSf10Files(classSf10Input.files, true);
        classSf10Input.value = '';
      });
    }
    if (studentSf10Browse && studentSf10Input) {
      studentSf10Browse.addEventListener('click', function () { studentSf10Input.click(); });
      studentSf10Input.addEventListener('change', function () {
        addSf10Files(studentSf10Input.files, false);
        studentSf10Input.value = '';
      });
    }
    if (classSf10List) {
      classSf10List.addEventListener('click', function (event) {
        if (!event.target.closest('[data-remove-class-sf10]')) return;
        sf10State().classFile = null;
        sf10State().analysisRun = false;
        renderSf10UI();
      });
    }
    if (studentSf10List) {
      studentSf10List.addEventListener('change', function (event) {
        const select = event.target.closest('[data-sf10-student]');
        if (!select) return;
        const entry = sf10State().studentFiles.find(function (item) {
          return String(item.id) === select.getAttribute('data-sf10-student');
        });
        if (entry) entry.studentId = select.value;
      });
      studentSf10List.addEventListener('click', function (event) {
        const button = event.target.closest('[data-remove-student-sf10]');
        if (!button) return;
        const id = button.getAttribute('data-remove-student-sf10');
        GF.state.sf10.studentFiles = sf10State().studentFiles.filter(function (entry) {
          return String(entry.id) !== id;
        });
        if (!GF.state.sf10.classFile && !GF.state.sf10.studentFiles.length) {
          GF.state.sf10.analysisRun = false;
        }
        renderSf10UI();
      });
    }

    if (browse && input) {
      browse.addEventListener('click', function (event) {
        event.stopPropagation();
        input.click();
      });
    }
    if (input) {
      input.addEventListener('change', function () {
        handleFiles(input.files);
      });
    }
    if (dropzone && input) {
      dropzone.addEventListener('click', function (event) {
        if (event.target.closest('button')) return;
        input.click();
      });
      dropzone.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          input.click();
        }
      });
      ['dragenter', 'dragover'].forEach(function (type) {
        dropzone.addEventListener(type, function (event) {
          event.preventDefault();
          dropzone.classList.add('dragover');
        });
      });
      ['dragleave', 'dragend'].forEach(function (type) {
        dropzone.addEventListener(type, function () { dropzone.classList.remove('dragover'); });
      });
      dropzone.addEventListener('drop', function (event) {
        event.preventDefault();
        dropzone.classList.remove('dragover');
        handleFiles(event.dataTransfer.files);
      });
    }

    document.querySelectorAll('#strand-selector, #grade-level-selector, #school-year-selector, #status-selector, #graduation-status-selector, #section-selector').forEach(function (field) {
      field.addEventListener('change', function () {
        invalidateManualClassDetailsConfirmation();
        GF.state.strand = document.getElementById('strand-selector').value;
        GF.state.gradeLevel = document.getElementById('grade-level-selector').value;
        GF.state.year = document.getElementById('school-year-selector').value;
        GF.state.studentStatus = document.getElementById('status-selector').value;
        GF.state.graduationStatus = document.getElementById('graduation-status-selector').value;
        GF.state.section = document.getElementById('section-selector').value;
        GF.state.className = 'Grade ' + GF.state.gradeLevel + ' · ' + GF.state.section;
        setError('');
        renderSf10UI();
        GF.refreshChrome();
      });
    });

    if (remove) {
      remove.addEventListener('click', function () {
        resetFile();
        GF.showToast('Class gradebook removed. Sample records restored.', 'info');
      });
    }
    if (template) template.addEventListener('click', downloadTemplate);
    if (continueButton) {
      continueButton.addEventListener('click', function () {
        if (!validateCurrentFile()) return;
        GF.state.processed = false;
        GF.state.processing = false;
        GF.state.progress = 0;
        GF.state.generated = false;
        GF.state.generatedAt = null;
        GF.navigateTo('processing');
        if (window.GradeFlowProcessing) window.GradeFlowProcessing.start();
      });
    }
  }

  GF.registerPage('upload', function () {
    syncSelects();
    updateFileUI();
    renderSf10UI();
    const fileError = document.getElementById('file-error');
    if (fileError && !GF.state.upload) fileError.hidden = true;
  });

  document.addEventListener('DOMContentLoaded', function () {
    syncSelects();
    updateFileUI();
    renderSf10UI();
    bindEvents();
  });
})();
