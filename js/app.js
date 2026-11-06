/* ==========================================================================
   GradeFlow AI — shared application core
   Keeps data, navigation, and reusable helpers in one beginner-friendly place.
   ========================================================================== */
(function () {
  'use strict';

  const ATTENDANCE_MONTHS = [
    { key: 'jun', label: 'JUN' }, { key: 'jul', label: 'JUL' }, { key: 'aug', label: 'AUG' },
    { key: 'sep', label: 'SEP' }, { key: 'oct', label: 'OCT' }, { key: 'nov', label: 'NOV' },
    { key: 'dec', label: 'DEC' }, { key: 'jan', label: 'JAN' }, { key: 'feb', label: 'FEB' },
    { key: 'mar', label: 'MAR' }, { key: 'apr', label: 'APR' }
  ];

  const SEMESTERS = [
    {
      key: 'first',
      label: 'First Semester',
      quarters: ['q1', 'q2'],
      quarterLabels: ['1', '2'],
      finalKey: 'final',
      groups: [
        {
          name: 'Core Subjects',
          subjects: [
            ['media_information_literacy', 'Media and Information Literacy'],
            ['philosophy', 'Introduction to Philosophy of the Human Person/Pambungad sa Pilosopiya ng Tao'],
            ['contemporary_arts', 'Contemporary Philippine Arts from the Regions'],
            ['physical_science', 'Physical Science'],
            ['pe_health_first', 'Physical Education and Health']
          ]
        },
        {
          name: 'Applied and Specialized Subjects',
          subjects: [
            ['research_daily_life', 'Research in Daily Life 2'],
            ['filipino_larang', 'Pagsulat sa Filipino sa Piling Larang'],
            ['creative_writing', 'Creative Writing/Malikhaing Pagsulat'],
            ['applied_social_sciences', 'Disciplines and Ideas in the Applied Social Sciences']
          ]
        }
      ]
    },
    {
      key: 'second',
      label: 'Second Semester',
      quarters: ['q3', 'q4'],
      quarterLabels: ['3', '4'],
      finalKey: 'final',
      groups: [
        {
          name: 'Core Subjects',
          subjects: [['pe_health_second', 'Physical Education and Health']]
        },
        {
          name: 'Applied and Specialized Subjects',
          subjects: [
            ['entrepreneurship', 'Entrepreneurship'],
            ['inquiries_immersion', 'Inquiries, Investigations and Immersion'],
            ['empowerment_technologies', 'Empowerment Technologies'],
            ['creative_nonfiction', 'Creative Nonfiction: The Literary Essay'],
            ['philippine_politics', 'Philippine Politics and Governance'],
            ['trends_networks', 'Trends, Networks and Critical Thinking in the 21st Century Culture'],
            ['community_engagement', 'Community Engagement, Solidarity and Citizenship'],
            ['culminating_activity', 'Culminating Activity']
          ]
        }
      ]
    }
  ];

  const SUBJECTS = SEMESTERS.reduce(function (subjects, semester) {
    semester.groups.forEach(function (group) {
      group.subjects.forEach(function (definition) {
        subjects.push({
          key: definition[0],
          name: definition[1],
          semester: semester.key,
          group: group.name,
          quarters: semester.quarters,
          finalKey: semester.finalKey
        });
      });
    });
    return subjects;
  }, []);

  const PAGE_META = {
    upload: { label: 'Upload Grades', breadcrumb: 'Upload Grades', nav: 'upload', fileTitle: 'Upload Grades' },
    processing: { label: 'Preparing Reports', breadcrumb: 'Preparing Reports', nav: 'processing', fileTitle: 'Preparing Reports' },
    verification: { label: 'Grade Verification', breadcrumb: 'Grade Verification', nav: 'verification', fileTitle: 'Grade Verification' },
    'report-card': { label: 'Report Cards', breadcrumb: 'Report Cards', nav: 'report-card', fileTitle: 'Report Cards' },
    'generated-reports': { label: 'Generated Reports', breadcrumb: 'Report Cards', nav: 'report-card', fileTitle: 'Generated Reports' },
    sf10: { label: 'SF10 Record', breadcrumb: 'SF10 Record', nav: 'sf10', fileTitle: 'SF10 Record' },
    summary: { label: 'Summary & Rank', breadcrumb: 'Summary & Rank', nav: 'summary', fileTitle: 'Summary & Rank' },
    history: { label: 'Report History', breadcrumb: 'Report History', nav: 'history', fileTitle: 'Report History' },
    settings: { label: 'Workspace Settings', breadcrumb: 'Settings', nav: 'settings', fileTitle: 'Workspace Settings' },
    help: { label: 'Help', breadcrumb: 'Help', nav: 'help', fileTitle: 'Help' }
  };

  const STEP_ORDER = ['upload', 'processing', 'report-card', 'sf10', 'generated-reports'];

  // Fictional demo roster. No real student information is used.
  const ROSTER = [
    ['Ava Thompson', [88, 92, 90, 86, 94, 96], 93],
    ['Ethan Brooks', [82, 85, 87, 80, 89, 93], 91],
    ['Mia Patel', [94, 86, 93, 91, 95, 92], 95],
    ['Noah Williams', [80, null, 84, 82, 88, 90], 91],
    ['Olivia Chen', [91, 94, 92, 89, 94, 90], 95],
    ['Liam Johnson', [85, 83, 86, 81, 90, 95], 90],
    ['Sofia Reyes', [89, 88, 91, 87, 92, 94], 94],
    ['Lucas Nguyen', [78, 81, 83, 79, 88, 91], 89],
    ['Isabella Cruz', [93, 95, 94, 92, 96, 93], 96],
    ['Mateo Santos', [84, 86, 88, 85, 90, 92], 92],
    ['Chloe Garcia', [87, 84, 86, 88, 93, 95], 93],
    ['Daniel Kim', [90, 92, 89, 91, 94, 96], 95],
    ['Grace Lim', [86, 80, 85, 84, 91, 90], 90],
    ['Gabriel Silva', [79, 83, 81, 80, 87, 92], 88],
    ['Hannah Park', [95, 93, 92, 94, 96, 94], 96],
    ['Julian Rivera', [83, 85, 84, 86, 89, 91], 92],
    ['Layla Hassan', [88, 87, 90, 89, 92, 93], 94],
    ['Owen Mitchell', [76, 74, 79, 78, 86, 89], 87],
    ['Priya Sharma', [92, 90, 91, 93, 95, 94], 95],
    ['Ryan Okafor', [81, 79, 83, 82, 88, 90], 89],
    ['Stella Marino', [90, 89, 90, 92, 94, 92], 93],
    ['Tomas Alvarez', [85, 88, 86, 84, 90, 94], 92],
    ['Yuna Sato', [94, 92, 93, 91, 95, 96], 96],
    ['Zoe Bennett', [87, 86, 89, 88, 91, 93], 93]
  ];

  const SUBJECT_ACTIONS = {
    english: 'read for 15 minutes each day and add detail to written answers',
    mathematics: 'practise problem-solving strategies and explain the thinking behind each step',
    science: 'ask questions and connect new ideas to the world around them',
    social: 'share what has been learned and explore different perspectives',
    art: 'experiment with new techniques and describe creative choices',
    pe: 'build teamwork and try new activities with confidence'
  };

  const LETTER_GRADES = [
    { minimum: 90, letter: 'A' },
    { minimum: 80, letter: 'B' },
    { minimum: 70, letter: 'C' },
    { minimum: 60, letter: 'D' },
    { minimum: 0, letter: 'E' }
  ];

  const state = {
    school: {
      name: 'University of Iloilo',
      address: 'Republic of the Philippines · Department of Education · Region VI – Western Visayas · Iloilo City · Senior High School Department',
      principal: 'Elena Navarro'
    },
    teacher: 'Sarah Collins',
    year: '2026-2027',
    term: 'Annual Report',
    className: 'Grade 12 · UI-FA-ABM12-1',
    strand: 'ABM',
    gradeLevel: '12',
    section: 'UI-FA-ABM12-1',
    studentStatus: 'Regular',
    graduationStatus: 'Recommended',
    gradingScale: 'percentage',
    students: [],
    archive: null,
    upload: null,
    sf10: {
      classFile: null,
      studentFiles: [],
      analysisRun: false
    },
    processed: false,
    processing: false,
    progress: 0,
    generated: false,
    generatedAt: null,
    currentPage: 'upload',
    selectedStudentId: 4,
    previewIndex: 0,
    verificationPage: 1,
    verificationSearch: '',
    verificationFilter: 'all',
    reportsPage: 1,
    reportsSearch: '',
    selectedReportIds: new Set(),
    reportSelectionMode: '',
    viewingArchive: false,
    paperSize: 'a4',
    orientation: 'landscape',
    printLayout: 'double'
  };

  const pageHooks = {};

  /* ---------- Small helpers ---------- */
  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function prettyYear(year) {
    return String(year || '').replace('-', '–');
  }

  function termLabel() {
    return state.term + ' · ' + prettyYear(state.year);
  }

  function initials(name) {
    return String(name || '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (part) { return part.charAt(0); })
      .join('')
      .toUpperCase();
  }

  function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }

  function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const datePart = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
    const timePart = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
    return datePart + ' at ' + timePart;
  }

  function formatLongDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }

  const PASSING_GRADE = 75;

  function isGradeValue(value) {
    return value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value));
  }

  // Mean of semester finals for the given subjects, or null while any grade is missing.
  function rawAverage(student, subjects) {
    if (!student || !student.grades || !subjects.length) return null;
    const values = subjects.map(function (subject) { return (student.grades[subject.key] || {}).final; });
    if (!values.every(isGradeValue)) return null;
    return values.reduce(function (sum, value) { return sum + Number(value); }, 0) / values.length;
  }

  function semesterSubjects(semesterKey) {
    return SUBJECTS.filter(function (subject) { return subject.semester === semesterKey; });
  }

  // General average for one semester (rounded), or null.
  function semesterAverage(student, semesterKey) {
    const raw = rawAverage(student, semesterSubjects(semesterKey));
    return raw === null ? null : Math.round(raw);
  }

  // General average for the whole school year (rounded), or null.
  function averageGrade(student) {
    const raw = rawAverage(student, SUBJECTS);
    return raw === null ? null : Math.round(raw);
  }

  function remarkFor(value) {
    if (!isGradeValue(value)) return '';
    return Number(value) >= PASSING_GRADE ? 'Passed' : 'Failed';
  }

  // Standard competition ranking (1,2,2,4). Learners with any missing or invalid grade
  // (quarters included) are unranked until the teacher fixes them in Grade Verification.
  function computeRanks(students) {
    const scored = (students || state.students).map(function (student) {
      return { student: student, raw: studentStatus(student) === 'approved' ? rawAverage(student, SUBJECTS) : null };
    });
    const ranked = scored.filter(function (entry) { return entry.raw !== null; })
      .sort(function (a, b) { return b.raw - a.raw; });
    const result = new Map();
    ranked.forEach(function (entry, index) {
      const previous = ranked[index - 1];
      const rank = previous && Math.round(previous.raw * 100) === Math.round(entry.raw * 100)
        ? result.get(previous.student.id).rank : index + 1;
      result.set(entry.student.id, { rank: rank, average: Math.round(entry.raw), raw: entry.raw });
    });
    scored.forEach(function (entry) {
      if (!result.has(entry.student.id)) result.set(entry.student.id, { rank: null, average: null, raw: null });
    });
    return result;
  }

  // Age in whole years on a reference date (default: today) from an ISO birthdate.
  function ageFromBirthdate(birthdate, onDate) {
    const born = new Date(birthdate);
    if (!birthdate || Number.isNaN(born.getTime())) return '';
    const ref = onDate || new Date();
    let age = ref.getFullYear() - born.getFullYear();
    if (ref.getMonth() < born.getMonth() || (ref.getMonth() === born.getMonth() && ref.getDate() < born.getDate())) age -= 1;
    return age >= 0 && age < 100 ? String(age) : '';
  }

  function averageLabel(student) {
    const average = averageGrade(student);
    return average === null ? '—' : average + '%';
  }

  function letterFor(score) {
    if (score === null || score === undefined || score === '') return '—';
    const numeric = Number(score);
    if (Number.isNaN(numeric)) return '—';
    return LETTER_GRADES.find(function (entry) { return numeric >= entry.minimum; }).letter;
  }

  function performanceLabel(student) {
    const average = averageGrade(student);
    if (average === null) return 'Awaiting grades';
    if (average >= 95) return 'Outstanding progress';
    if (average >= 85) return 'Excellent progress';
    if (average >= 75) return 'Good progress';
    if (average >= 65) return 'Developing steadily';
    return 'Needs support';
  }

  function subjectAction(subjectKey) {
    return SUBJECT_ACTIONS[subjectKey] || SUBJECT_ACTIONS.english;
  }

  function buildComment(student) {
    if (!student) return '';
    const first = student.name.split(' ')[0];
    const entries = SUBJECTS
      .map(function (subject) { return { subject: subject, value: (student.grades[subject.key] || {}).final }; })
      .filter(function (entry) { return entry.value !== null && entry.value !== '' && !Number.isNaN(Number(entry.value)); })
      .sort(function (a, b) { return Number(b.value) - Number(a.value); });
    const average = averageGrade(student);
    const strongest = entries.length ? entries[0].subject : SUBJECTS[0];
    const growth = entries.length ? entries[entries.length - 1].subject : SUBJECTS[1];
    let opening;
    if (average === null) opening = 'has shown real effort this term while we complete the grade record.';
    else if (average >= 93) opening = 'has had an outstanding term.';
    else if (average >= 85) opening = 'has made excellent progress this term.';
    else if (average >= 75) opening = 'has shown steady progress this term.';
    else opening = 'is building confidence this term.';

    return first + ' ' + opening + ' ' + first + ' brings energy and curiosity to ' + strongest.name +
      ' and contributes thoughtfully to class discussions. To keep growing, ' + first + ' should ' +
      subjectAction(growth.key) + '. I am proud of the effort and consistency shown, ' + first + '.';
  }

  function makeTraits(student) {
    const average = averageGrade(student) || 0;
    return {
      participation: average >= 90 ? 'Consistently engaged' : average >= 80 ? 'Growing confidence' : 'Encouraged to share',
      collaboration: average >= 88 ? 'Kind and supportive' : 'Works well with others',
      workHabits: average >= 85 ? 'Independent and organised' : 'Improving with support'
    };
  }

  function makeNextSteps(student) {
    const entries = SUBJECTS
      .map(function (subject) { return { subject: subject, value: (student.grades[subject.key] || {}).final }; })
      .filter(function (entry) { return typeof entry.value === 'number'; })
      .sort(function (a, b) { return Number(a.value) - Number(b.value); });
    const growth = entries.length ? entries[0].subject : SUBJECTS[0];
    return [
      growth.key === 'english' ? 'Read for 15 minutes each day and share one new idea.' : 'Practise ' + growth.name.toLowerCase() + ' a little every day.',
      'Add examples and detail to longer written answers.',
      'Keep exploring creative projects with classmates.'
    ];
  }

  function makeStudent(row, index, options) {
    const settings = options || {};
    const student = {
      id: index + 1,
      roll: String(index + 1).padStart(2, '0'),
      name: row[0],
      grades: {},
      age: '',
      sex: '',
      lrn: '',
      attendance: {
        present: row[2],
        total: 96,
        months: {},
        schoolDays: {},
        absent: {}
      },
      transfer: {},
      observedValues: {},
      comment: '',
      commentReviewed: settings.reviewed !== false,
      traits: null,
      nextSteps: null
    };
    SUBJECTS.forEach(function (subject, subjectIndex) {
      let value = row[1][subjectIndex % row[1].length];
      if (value === null && settings.fillMissing) value = 84;
      const score = value === null ? null : Number(value);
      const grades = { final: score };
      grades[subject.quarters[0]] = score;
      grades[subject.quarters[1]] = score;
      student.grades[subject.key] = grades;
    });
    student.comment = buildComment(student);
    student.traits = makeTraits(student);
    student.nextSteps = makeNextSteps(student);
    return student;
  }

  function createCurrentStudents() {
    return ROSTER.map(function (row, index) {
      return makeStudent(row, index, { reviewed: true });
    });
  }

  function createArchive() {
    return {
      label: 'Term 1',
      year: '2025-26',
      className: 'Grade 5 · Section A',
      generatedAt: new Date(2025, 11, 12, 10, 42),
      students: ROSTER.map(function (row, index) {
        return makeStudent(row, index, { fillMissing: true, reviewed: true });
      })
    };
  }

  state.students = createCurrentStudents();
  state.archive = createArchive();

  function getStudent(studentId) {
    return state.students.find(function (student) { return student.id === Number(studentId); }) || null;
  }

  function studentStatus(student) {
    const missing = SUBJECTS.some(function (subject) {
      const grades = student.grades[subject.key] || {};
      return subject.quarters.concat(subject.finalKey).some(function (period) {
        const value = grades[period];
        return value === null || value === '' || Number.isNaN(Number(value));
      });
    });
    return missing ? 'needs-correction' : 'approved';
  }

  function missingGradeCells(students) {
    const list = [];
    (students || state.students).forEach(function (student) {
      SUBJECTS.forEach(function (subject) {
        const grades = student.grades[subject.key] || {};
        subject.quarters.concat(subject.finalKey).forEach(function (period) {
          const value = grades[period];
          if (value === null || value === '' || Number.isNaN(Number(value))) {
            list.push({
              student: student,
              subject: subject,
              period: period,
              periodLabel: period === 'final' ? 'Semester final' : 'Quarter ' + period.slice(1)
            });
          }
        });
      });
    });
    return list;
  }

  function approvedCount(students) {
    return (students || state.students).filter(function (student) {
      return studentStatus(student) === 'approved';
    }).length;
  }

  function reviewedCommentCount(students) {
    return (students || state.students).filter(function (student) { return student.commentReviewed; }).length;
  }

  function allCommentsReviewed() {
    return state.students.length > 0 && reviewedCommentCount() === state.students.length;
  }

  function allGradesComplete() {
    return state.students.length > 0 && approvedCount() === state.students.length;
  }

  function readyToGenerate() {
    return allGradesComplete() && allCommentsReviewed();
  }

  function scaleMinimum() {
    return state.gradingScale === 'deped' ? 60 : 0;
  }

  function isValidGrade(value) {
    if (value === '' || value === null || value === undefined) return false;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= scaleMinimum() && numeric <= 100;
  }

  function gradeScaleDescription() {
    return state.gradingScale === 'deped' ? 'All grades out of 100 · passing mark 75' : 'All grades out of 100';
  }

  function reportContext(overrides) {
    const options = overrides || {};
    const year = options.year || state.year;
    const term = options.term || state.term;
    const className = options.className || state.className;
    const parts = className.split('·');
    const generatedAt = options.generatedAt || state.generatedAt || new Date();
    return {
      schoolName: state.school.name,
      schoolAddress: state.school.address,
      teacher: state.teacher,
      principal: state.school.principal,
      year: year,
      term: term,
      termLabel: term + ' · ' + prettyYear(year),
      className: className,
      gradeLevel: options.gradeLevel || (options.className
        ? (parts[0] ? parts[0].trim().replace(/^Grade\s+/, '') : '5')
        : state.gradeLevel),
      section: parts[1] ? parts[1].trim() : 'Section A',
      strand: state.strand,
      trackStrand: ({
        ABM: 'ACAD: ACCOUNTANCY, BUSINESS AND MANAGEMENT (ABM)',
        GAS: 'ACAD: GENERAL ACADEMIC STRAND (GAS)',
        GASCRIM: 'ACAD: GENERAL ACADEMIC STRAND - CRIMINOLOGY (GASCRIM)',
        HUMSS: 'ACAD: HUMANITIES AND SOCIAL SCIENCES (HUMSS)',
        STEM: 'ACAD: SCIENCE, TECHNOLOGY, ENGINEERING AND MATHEMATICS (STEM)',
        HEALTH: 'TECHNICAL-VOCATIONAL: HEALTH'
      })[state.strand] || state.strand,
      studentStatus: state.studentStatus,
      graduationStatus: state.graduationStatus,
      issuedDate: formatLongDate(generatedAt),
      issuedDateShort: formatDate(generatedAt),
      archive: Boolean(options.archive)
    };
  }

  /* ---------- Toasts, modals, navigation ---------- */
  let toastTimer = null;

  function showToast(message, type) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    if (!toast || !toastMessage) return;
    const style = type || 'success';
    toastMessage.textContent = message;
    toast.className = 'toast ' + style;
    const use = toast.querySelector('.toast-icon use');
    if (use) {
      use.setAttribute('href', style === 'error' ? '#i-alert-circle' : style === 'info' ? '#i-info' : '#i-check-circle');
    }
    window.clearTimeout(toastTimer);
    toast.classList.add('show');
    toastTimer = window.setTimeout(function () { toast.classList.remove('show'); }, 4200);
  }

  function openModal(options) {
    const dialog = document.getElementById('modal');
    if (!dialog) return;
    const settings = options || {};
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const cancel = document.getElementById('modal-cancel');
    const confirm = document.getElementById('modal-confirm');

    title.textContent = settings.title || 'Confirmation';
    body.innerHTML = settings.body || '';
    cancel.textContent = settings.cancelLabel || 'Cancel';
    cancel.hidden = Boolean(settings.hideCancel);
    confirm.textContent = settings.confirmLabel || 'Close';
    confirm.className = 'btn ' + (settings.tone === 'danger' ? 'btn-danger' : 'btn-primary');

    const close = function () {
      if (dialog.open) dialog.close();
    };

    confirm.onclick = function () {
      if (typeof settings.onConfirm === 'function') {
        const shouldClose = settings.onConfirm();
        if (shouldClose === false) return;
      }
      close();
    };
    cancel.onclick = close;
    dialog.querySelector('.modal-close').onclick = close;
    dialog.onclick = function (event) {
      if (event.target === dialog) close();
    };

    if (!dialog.open) dialog.showModal();
  }

  function registerPage(pageId, callback) {
    if (!pageHooks[pageId]) pageHooks[pageId] = [];
    pageHooks[pageId].push(callback);
  }

  function updateStepper(pageId) {
    const stepper = document.getElementById('stepper');
    if (pageId === 'verification') pageId = 'processing';
    const currentIndex = STEP_ORDER.indexOf(pageId);
    if (stepper) stepper.hidden = currentIndex < 0;
    if (currentIndex < 0) return;
    document.querySelectorAll('.step-link').forEach(function (link) {
      const stepPage = link.getAttribute('data-step-page');
      const stepIndex = STEP_ORDER.indexOf(stepPage);
      link.classList.toggle('active', stepPage === pageId);
      link.classList.toggle('completed', stepIndex < currentIndex);
      if (stepPage === pageId) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
  }

  function updateChrome() {
    const meta = PAGE_META[state.currentPage] || PAGE_META.upload;
    const breadcrumb = document.getElementById('breadcrumb-current');
    if (breadcrumb) breadcrumb.textContent = meta.breadcrumb;
    document.title = meta.fileTitle + ' · GradeFlow AI';

    const yearLabel = document.getElementById('academic-year-label');
    if (yearLabel) yearLabel.textContent = prettyYear(state.year);

    document.querySelectorAll('.nav-link[data-page]').forEach(function (link) {
      const active = link.getAttribute('data-page') === meta.nav;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    updateStepper(state.currentPage);
    updateNotificationDot();
    const backdrop = document.getElementById('sidebar-backdrop');
    const toggle = document.getElementById('menu-toggle');
    if (!sidebar) return;
    sidebar.classList.remove('open');
    if (backdrop) backdrop.hidden = true;
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  function openSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const toggle = document.getElementById('menu-toggle');
    if (!sidebar) return;
    sidebar.classList.add('open');
    if (backdrop) backdrop.hidden = false;
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const toggle = document.getElementById('menu-toggle');
    if (!sidebar) return;
    sidebar.classList.remove('open');
    if (backdrop) backdrop.hidden = true;
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  function renderPage(pageId) {
    state.currentPage = pageId;
    document.querySelectorAll('.page').forEach(function (page) {
      page.classList.toggle('active', page.id === pageId);
    });
    updateChrome();
    const hooks = pageHooks[pageId] || [];
    hooks.forEach(function (callback) {
      try {
        callback();
      } catch (error) {
        console.error('Page render failed for ' + pageId, error);
      }
    });
    closeSidebar();
    closeNotifications();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function navigateTo(pageId, options) {
    const safePage = PAGE_META[pageId] ? pageId : 'upload';
    if (safePage === 'generated-reports') state.viewingArchive = Boolean(options && options.archive);
    if (window.location.hash !== '#' + safePage) {
      history.pushState({ page: safePage }, '', '#' + safePage);
    }
    renderPage(safePage);
  }

  function updateNotificationDot() {
    const dot = document.getElementById('notification-dot');
    if (!dot) return;
    const missing = missingGradeCells().length;
    dot.hidden = missing === 0 && allCommentsReviewed();
  }

  function closeNotifications() {
    const panel = document.getElementById('notifications-panel');
    const button = document.getElementById('notifications-btn');
    if (!panel) return;
    panel.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function renderNotifications() {
    const body = document.getElementById('notifications-body');
    const count = document.getElementById('notification-count');
    if (!body) return;
    const missing = missingGradeCells();
    const items = [];

    if (missing.length > 0) {
      items.push({
        icon: '#i-alert-triangle',
        title: missing.length + ' grade' + (missing.length === 1 ? '' : 's') + ' need review',
        text: missing[0].student.name + ' · ' + missing[0].subject.name,
        link: 'verification',
        linkLabel: 'Review grades'
      });
    }
    if (readyToGenerate() && !state.generated) {
      items.push({
        icon: '#i-sparkles',
        title: 'Ready to generate',
        text: 'All grades are approved for ' + state.className + '.',
        link: 'report-card',
        linkLabel: 'Preview reports'
      });
    }
    if (items.length === 0) {
      items.push({
        icon: '#i-check-circle',
        title: 'You are all caught up',
        text: 'There are no grade checks waiting for you right now.',
        link: '',
        linkLabel: ''
      });
    }

    body.innerHTML = items.map(function (item) {
      return '<div class="notification-item">' +
        '<svg class="icon" aria-hidden="true"><use href="' + item.icon + '"></use></svg>' +
        '<div><strong>' + escapeHTML(item.title) + '</strong>' +
        escapeHTML(item.text) +
        (item.link ? ' <a href="#' + item.link + '">' + escapeHTML(item.linkLabel) + '</a>' : '') +
        '</div></div>';
    }).join('');

    if (count) count.textContent = items.length + (items.length === 1 ? ' update' : ' updates');
    updateNotificationDot();
  }

  function toggleNotifications() {
    const panel = document.getElementById('notifications-panel');
    const button = document.getElementById('notifications-btn');
    if (!panel) return;
    renderNotifications();
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    if (button) button.setAttribute('aria-expanded', String(willOpen));
  }

  function refreshChrome() {
    updateChrome();
    renderNotifications();
  }

  function renderHistoryPage() {
    const currentTitle = document.getElementById('history-current-title');
    const currentDetails = document.getElementById('history-current-details');
    const currentStatus = document.getElementById('history-current-status');
    const currentAction = document.getElementById('history-current-action');
    const archiveTitle = document.getElementById('history-archive-title');
    const archiveDetails = document.getElementById('history-archive-details');
    if (currentTitle) currentTitle.textContent = state.term + ' reports';
    if (currentDetails) {
      currentDetails.textContent = state.generated
        ? state.className + ' · ' + state.students.length + ' report' + (state.students.length === 1 ? '' : 's') +
          ' · Generated ' + formatDate(state.generatedAt)
        : state.className + ' · ' + termLabel() + ' · Not generated yet';
    }
    if (currentStatus) {
      currentStatus.textContent = state.generated ? 'Ready' : 'Draft';
      currentStatus.className = 'status-badge ' + (state.generated ? 'status-approved' : 'status-needs');
    }
    if (currentAction) {
      currentAction.href = state.generated ? '#generated-reports' : '#upload';
      currentAction.textContent = state.generated ? 'Open current reports' : 'Continue workflow';
      currentAction.setAttribute('data-history-mode', 'current');
    }
    if (archiveTitle) archiveTitle.textContent = state.archive.label + ' reports';
    if (archiveDetails) {
      archiveDetails.textContent = state.archive.className + ' · ' + state.archive.students.length +
        ' reports · ' + formatDate(state.archive.generatedAt);
    }
  }

  function renderSettingsPage() {
    const values = {
      'settings-school': state.school.name,
      'settings-address': state.school.address,
      'settings-principal': state.school.principal,
      'settings-teacher': state.teacher,
      'settings-class': state.className,
      'settings-term': state.term,
      'settings-year': prettyYear(state.year),
      'settings-scale': state.gradingScale === 'deped' ? 'DepEd · 60–100' : 'Percentage · 0–100',
      'settings-paper': state.paperSize.toUpperCase(),
      'settings-orientation': state.orientation.charAt(0).toUpperCase() + state.orientation.slice(1),
      'settings-layout': state.printLayout === 'double' ? 'Duplex · Sheet estimate' : 'Single-sided · Sheet estimate',
      'settings-theme': document.documentElement.getAttribute('data-theme') === 'dark' ? 'Dark mode' : 'Light mode'
    };
    Object.keys(values).forEach(function (id) {
      const element = document.getElementById(id);
      if (element) element.textContent = values[id];
    });
  }

  registerPage('history', renderHistoryPage);
  registerPage('settings', renderSettingsPage);

  /* ---------- Initialisation and shared events ---------- */
  function bindEvents() {
    // All internal links use one small router.
    document.addEventListener('click', function (event) {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const pageId = link.getAttribute('href').slice(1);
      if (!PAGE_META[pageId]) return;
      event.preventDefault();
      if (pageId === 'generated-reports') {
        navigateTo(pageId, { archive: link.getAttribute('data-history-mode') === 'archive' });
      } else {
        navigateTo(pageId);
      }
    });

    document.querySelectorAll('[data-workspace]').forEach(function (button) {
      button.addEventListener('click', function () {
        navigateTo(button.getAttribute('data-workspace'));
      });
    });

    const menuToggle = document.getElementById('menu-toggle');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (menuToggle) {
      menuToggle.addEventListener('click', function () {
        const sidebar = document.getElementById('sidebar');
        if (window.innerWidth > 1024) {
          const collapsed = document.body.classList.toggle('sidebar-collapsed');
          menuToggle.setAttribute('aria-expanded', String(!collapsed));
          menuToggle.setAttribute('aria-label', collapsed ? 'Open menu' : 'Close menu');
          return;
        }
        if (sidebar.classList.contains('open')) closeSidebar();
        else openSidebar();
      });
      if (window.innerWidth > 1024) menuToggle.setAttribute('aria-expanded', 'true');
    }
    if (backdrop) backdrop.addEventListener('click', closeSidebar);

    const notificationsBtn = document.getElementById('notifications-btn');
    if (notificationsBtn) notificationsBtn.addEventListener('click', toggleNotifications);
    document.addEventListener('click', function (event) {
      const panel = document.getElementById('notifications-panel');
      const button = document.getElementById('notifications-btn');
      if (!panel || panel.hidden) return;
      if (!panel.contains(event.target) && !button.contains(event.target)) closeNotifications();
    });

    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
      profileBtn.addEventListener('click', function () { navigateTo('settings'); });
    }

    const settingsThemeToggle = document.getElementById('settings-theme-toggle');
    const themeToggle = document.getElementById('theme-toggle');
    if (settingsThemeToggle && themeToggle) settingsThemeToggle.addEventListener('click', function () { themeToggle.click(); });

    const toastClose = document.getElementById('toast-close');
    if (toastClose) {
      toastClose.addEventListener('click', function () {
        document.getElementById('toast').classList.remove('show');
      });
    }

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      closeSidebar();
      closeNotifications();
    });

    window.addEventListener('popstate', function () {
      const pageId = window.location.hash.replace('#', '') || 'upload';
      const safePage = PAGE_META[pageId] ? pageId : 'upload';
      if (safePage !== pageId) history.replaceState({ page: safePage }, '', '#' + safePage);
      renderPage(safePage);
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 1024) closeSidebar();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    renderNotifications();
    const initialPage = window.location.hash.replace('#', '');
    const pageId = PAGE_META[initialPage] ? initialPage : 'upload';
    if (!window.location.hash || pageId !== initialPage) {
      history.replaceState({ page: pageId }, '', '#' + pageId);
    }
    renderPage(pageId);
  });

  /* ---------- Public API used by the page modules ---------- */
  window.GradeFlow = {
    state: state,
    SUBJECTS: SUBJECTS,
    SEMESTERS: SEMESTERS,
    ATTENDANCE_MONTHS: ATTENDANCE_MONTHS,
    PAGE_META: PAGE_META,
    registerPage: registerPage,
    navigateTo: navigateTo,
    showToast: showToast,
    openModal: openModal,
    refreshChrome: refreshChrome,
    renderNotifications: renderNotifications,
    escapeHTML: escapeHTML,
    initials: initials,
    formatFileSize: formatFileSize,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    formatLongDate: formatLongDate,
    prettyYear: prettyYear,
    averageGrade: averageGrade,
    semesterAverage: semesterAverage,
    remarkFor: remarkFor,
    computeRanks: computeRanks,
    ageFromBirthdate: ageFromBirthdate,
    PASSING_GRADE: PASSING_GRADE,
    averageLabel: averageLabel,
    letterFor: letterFor,
    performanceLabel: performanceLabel,
    buildComment: buildComment,
    makeTraits: makeTraits,
    makeNextSteps: makeNextSteps,
    makeStudent: makeStudent,
    resetCurrentStudents: createCurrentStudents,
    getStudent: getStudent,
    studentStatus: studentStatus,
    missingGradeCells: missingGradeCells,
    approvedCount: approvedCount,
    reviewedCommentCount: reviewedCommentCount,
    allCommentsReviewed: allCommentsReviewed,
    allGradesComplete: allGradesComplete,
    readyToGenerate: readyToGenerate,
    isValidGrade: isValidGrade,
    scaleMinimum: scaleMinimum,
    gradeScaleDescription: gradeScaleDescription,
    reportContext: reportContext,
    termLabel: termLabel,
    escape: escapeHTML
  };

  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const themeIcon = themeToggle.querySelector('svg use');
    const themeStatus = themeToggle.querySelector('.sr-only');

    function savedTheme() {
      try {
        const value = localStorage.getItem('theme');
        return value === 'dark' || value === 'light' ? value : null;
      } catch (error) {
        return null;
      }
    }

    function applyTheme(theme, persist) {
      const isDark = theme === 'dark';
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      themeToggle.setAttribute('aria-pressed', String(isDark));
      themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      if (themeStatus) themeStatus.textContent = isDark ? 'Dark mode' : 'Light mode';
      if (themeIcon) themeIcon.setAttribute('href', isDark ? '#i-sun' : '#i-moon');
      const settingsTheme = document.getElementById('settings-theme');
      if (settingsTheme) settingsTheme.textContent = isDark ? 'Dark mode' : 'Light mode';
      if (persist) {
        try {
          localStorage.setItem('theme', isDark ? 'dark' : 'light');
        } catch (error) {
          // A blocked storage API should not stop the toggle from working.
        }
      }
    }

    applyTheme(savedTheme() || (systemTheme.matches ? 'dark' : 'light'), false);

    themeToggle.addEventListener('click', function () {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
    });

    function followSystemTheme(event) {
      if (!savedTheme()) applyTheme(event.matches ? 'dark' : 'light', false);
    }
    if (typeof systemTheme.addEventListener === 'function') {
      systemTheme.addEventListener('change', followSystemTheme);
    } else if (typeof systemTheme.addListener === 'function') {
      systemTheme.addListener(followSystemTheme);
    }
  }
})();
