/* ==========================================================================
   Upload Grades
   Reads CSV and Excel files locally. No grade is ever invented.
   ========================================================================== */
(function () {
  'use strict';

  const GF = window.GradeFlow;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;

  const HEADER_ALIASES = {
    roll: ['roll', 'rollno', 'rollnumber', 'no', 'number', 'id', 'studentid'],
    name: ['studentname', 'name', 'student', 'fullname'],
    english: ['english'],
    mathematics: ['mathematics', 'math', 'maths'],
    science: ['science'],
    social: ['socialstudies', 'socialscience', 'social'],
    art: ['art'],
    pe: ['pe', 'physicaleducation', 'physicaled'],
    present: ['dayspresent', 'present', 'attendancepresent', 'daysattended'],
    absent: ['daysabsent', 'absent', 'attendanceabsent', 'daysmissed']
  };

  function normalizeHeader(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function findHeaderRow(rows) {
    for (let index = 0; index < Math.min(rows.length, 6); index += 1) {
      const normalized = rows[index].map(normalizeHeader);
      const hasName = normalized.some(function (cell) { return HEADER_ALIASES.name.includes(cell); });
      const hasSubject = normalized.some(function (cell) {
        return HEADER_ALIASES.english.includes(cell) || HEADER_ALIASES.mathematics.includes(cell);
      });
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
    return Number.isFinite(numeric) ? numeric : null;
  }

  function buildStudentsFromRows(rows, headerIndex) {
    const headerRow = rows[headerIndex];
    const columns = {
      roll: getColumnIndex(headerRow, HEADER_ALIASES.roll),
      name: getColumnIndex(headerRow, HEADER_ALIASES.name),
      english: getColumnIndex(headerRow, HEADER_ALIASES.english),
      mathematics: getColumnIndex(headerRow, HEADER_ALIASES.mathematics),
      science: getColumnIndex(headerRow, HEADER_ALIASES.science),
      social: getColumnIndex(headerRow, HEADER_ALIASES.social),
      art: getColumnIndex(headerRow, HEADER_ALIASES.art),
      pe: getColumnIndex(headerRow, HEADER_ALIASES.pe),
      present: getColumnIndex(headerRow, HEADER_ALIASES.present),
      absent: getColumnIndex(headerRow, HEADER_ALIASES.absent)
    };

    const missingColumns = [];
    GF.SUBJECTS.forEach(function (subject) {
      if (columns[subject.key] === -1) missingColumns.push(subject.name);
    });
    if (columns.name === -1) missingColumns.unshift('Student Name');
    if (missingColumns.length) {
      throw new Error('Missing required column' + (missingColumns.length > 1 ? 's' : '') + ': ' + missingColumns.join(', ') + '.');
    }

    const students = [];
    const errors = [];
    const dataRows = rows.slice(headerIndex + 1).filter(function (row) {
      return row.some(function (cell) { return String(cell).trim() !== ''; });
    });

    if (dataRows.length === 0) throw new Error('The file has headers but no student row.');
    if (dataRows.length > 1) throw new Error('Each file must contain grades for one student only.');

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
        grades: {},
        attendance: { present: null, total: null },
        comment: '',
        commentReviewed: true,
        traits: null,
        nextSteps: null
      };

      GF.SUBJECTS.forEach(function (subject) {
        const columnIndex = columns[subject.key];
        const parsed = parseGradeValue(row[columnIndex]);
        if (parsed.error) {
          errors.push(name + ' · ' + subject.name + ' ' + parsed.error + ' ("' + String(row[columnIndex]).slice(0, 20) + '").');
          return;
        }
        if (parsed.value !== null && !GF.isValidGrade(parsed.value)) {
          errors.push(name + ' · ' + subject.name + ' must be between ' + GF.scaleMinimum() + ' and 100.');
          return;
        }
        student.grades[subject.key] = parsed.value;
      });

      const present = columns.present > -1 ? parseNumber(row[columns.present]) : null;
      const absent = columns.absent > -1 ? parseNumber(row[columns.absent]) : null;
      if (present !== null && absent !== null) {
        student.attendance.present = present;
        student.attendance.total = present + absent;
      } else if (present !== null) {
        student.attendance.present = present;
      }

      students.push(student);
    });

    if (errors.length) throw new Error(errors.slice(0, 4).join('\n'));

    students.forEach(function (student) {
      student.comment = GF.buildComment(student);
      student.traits = GF.makeTraits(student);
      student.nextSteps = GF.makeNextSteps(student);
    });
    return students;
  }

  function syncSelects() {
    const classSelect = document.getElementById('class-selector');
    const termSelect = document.getElementById('term-selector');
    const yearSelect = document.getElementById('academic-year-selector');
    const scaleSelect = document.getElementById('grading-scale');
    if (classSelect) classSelect.value = GF.state.className;
    if (termSelect) termSelect.value = GF.state.term;
    if (yearSelect) yearSelect.value = GF.state.year;
    if (scaleSelect) scaleSelect.value = GF.state.gradingScale;
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
      if (emptyHint) emptyHint.textContent = 'No student files uploaded';
      if (details) details.textContent = '—';
      if (continueBtn) continueBtn.disabled = true;
      return;
    }

    info.hidden = false;
    if (emptyHint) emptyHint.textContent = upload.name;
    if (details) {
      details.textContent = upload.rows + ' individual student file' + (upload.rows === 1 ? '' : 's') +
        ' · ' + upload.rows + ' student' + (upload.rows === 1 ? '' : 's');
    }
    if (continueBtn) continueBtn.disabled = false;
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
    GF.state.processed = false;
    GF.state.processing = false;
    GF.state.progress = 0;
    GF.state.generated = false;
    GF.state.generatedAt = null;
    const input = document.getElementById('file-upload');
    if (input) input.value = '';
    setError('');
    updateFileUI();
    GF.refreshChrome();
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const input = document.getElementById('file-upload');
    setError('');
    const existingUpload = GF.state.upload;
    const students = existingUpload ? GF.state.students.slice() : [];
    const addedFiles = [];
    const errors = [];
    let totalSize = existingUpload ? existingUpload.size : 0;

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
        const rows = await readWorkbook(file);
        if (!rows || rows.length === 0) throw new Error('file is empty. Add a header row and one student row.');
        const headerIndex = findHeaderRow(rows);
        if (headerIndex === -1) {
          throw new Error('header row not found. Include Student Name and one column per subject.');
        }
        const parsedStudents = buildStudentsFromRows(rows, headerIndex);
        const student = parsedStudents[0];
        if (student.roll && students.some(function (existing) {
          return existing.roll.toLowerCase() === student.roll.toLowerCase();
        })) {
          throw new Error('student ID "' + student.roll + '" is already in the class.');
        }
        student.id = students.length + 1;
        student.roll = student.roll || String(student.id).padStart(2, '0');
        students.push(student);
        addedFiles.push(file.name);
        totalSize += file.size;
      } catch (error) {
        errors.push(file.name + ': ' + (error.message || 'could not be read.'));
      }
    }

    if (!addedFiles.length) {
      setError(errors.join('\n') || 'Choose a student grade file before continuing.');
      GF.showToast('No student grade files were added.', 'error');
      if (input) input.value = '';
      return;
    }

    const missing = students.reduce(function (count, student) {
      return count + GF.SUBJECTS.filter(function (subject) {
        return student.grades[subject.key] === null;
      }).length;
    }, 0);

    GF.state.students = students;
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
      name: students.length + ' individual student files',
      size: totalSize,
      rows: students.length,
      type: 'individual',
      parsedAt: new Date(),
      mode: 'individual-files',
      files: (existingUpload ? existingUpload.files : []).concat(addedFiles)
    };

    updateFileUI();
    if (input) input.value = '';
    GF.refreshChrome();
    if (errors.length) setError(errors.slice(0, 4).join('\n'));
    GF.showToast(addedFiles.length + ' student file' + (addedFiles.length === 1 ? '' : 's') + ' added. ' +
      (missing ? missing + ' grade' + (missing === 1 ? '' : 's') + ' need review.' : 'All grades are complete.'),
    errors.length ? 'info' : missing ? 'info' : 'success');
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
    const rows = [['Roll', 'Student Name', 'English', 'Mathematics', 'Science', 'Social Studies', 'Art', 'PE', 'Days Present', 'Days Absent']];
    GF.state.students.forEach(function (student) {
      const present = student.attendance && student.attendance.present !== null ? student.attendance.present : 93;
      const total = student.attendance && student.attendance.total ? student.attendance.total : 96;
      rows.push([
        student.roll,
        student.name,
        student.grades.english === null ? '' : student.grades.english,
        student.grades.mathematics === null ? '' : student.grades.mathematics,
        student.grades.science === null ? '' : student.grades.science,
        student.grades.social === null ? '' : student.grades.social,
        student.grades.art === null ? '' : student.grades.art,
        student.grades.pe === null ? '' : student.grades.pe,
        present,
        total - present
      ]);
    });
    return rows;
  }

  function downloadTemplate() {
    const rows = templateRows();
    const safeClass = GF.state.className.replace(/[^a-z0-9]+/gi, '').replace('Grade', 'Grade');
    const filename = 'GradeFlow_Template_' + safeClass + '_' + GF.state.term.replace(/\s+/g, '') + '.xlsx';
    if (window.XLSX) {
      const worksheet = window.XLSX.utils.aoa_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 7 }, { wch: 22 }, { wch: 10 }, { wch: 13 }, { wch: 10 },
        { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 13 }, { wch: 12 }
      ];
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
      setError('Add at least one student grade file before continuing.');
      GF.showToast('Add a student grade file first.', 'error');
      return false;
    }
    const errors = [];
    GF.state.students.forEach(function (student) {
      GF.SUBJECTS.forEach(function (subject) {
        const value = student.grades[subject.key];
        if (value !== null && !GF.isValidGrade(value)) {
          errors.push(student.name + ' · ' + subject.name + ' must be between ' + GF.scaleMinimum() + ' and 100.');
        }
      });
    });
    if (errors.length) {
      setError(errors.slice(0, 4).join('\n'));
      GF.showToast('Some grades are outside the selected scale.', 'error');
      return false;
    }
    if (!GF.state.className || !GF.state.term || !GF.state.year) {
      GF.showToast('Choose a class, term, and academic year.', 'error');
      return false;
    }
    if (fileInput) fileInput.value = '';
    return true;
  }

  function bindEvents() {
    const input = document.getElementById('file-upload');
    const browse = document.getElementById('browse-btn');
    const dropzone = document.getElementById('dropzone');
    const remove = document.getElementById('remove-file-btn');
    const template = document.getElementById('template-btn');
    const continueButton = document.getElementById('continue-btn');

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

    document.querySelectorAll('#class-selector, #term-selector, #academic-year-selector, #grading-scale').forEach(function (field) {
      field.addEventListener('change', function () {
        GF.state.className = document.getElementById('class-selector').value;
        GF.state.term = document.getElementById('term-selector').value;
        GF.state.year = document.getElementById('academic-year-selector').value;
        GF.state.gradingScale = document.getElementById('grading-scale').value;
        setError('');
        GF.refreshChrome();
      });
    });

    if (remove) {
      remove.addEventListener('click', function () {
        resetFile();
        GF.showToast('Student files removed. Demo sample records restored.', 'info');
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
    const fileError = document.getElementById('file-error');
    if (fileError && !GF.state.upload) fileError.hidden = true;
  });

  document.addEventListener('DOMContentLoaded', function () {
    syncSelects();
    updateFileUI();
    bindEvents();
  });
})();
