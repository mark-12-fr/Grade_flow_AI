/* ==========================================================================
   Summary & Rank
   Class statistics and a ranked list built from verified semester finals.
   Learners with a missing grade are listed but not ranked.
   ========================================================================== */
(function () {
  'use strict';

  const GF = window.GradeFlow;
  const esc = GF.escape;

  function failedSubjects(student) {
    return GF.SUBJECTS.filter(function (subject) {
      return GF.remarkFor((student.grades[subject.key] || {}).final) === 'Failed';
    }).length;
  }

  function buildRows() {
    const ranks = GF.computeRanks(GF.state.students);
    return GF.state.students.map(function (student) {
      const info = ranks.get(student.id);
      const complete = info.average !== null;
      return {
        student: student,
        rank: info.rank,
        first: GF.semesterAverage(student, 'first'),
        second: GF.semesterAverage(student, 'second'),
        general: info.average,
        failed: failedSubjects(student),
        status: !complete ? 'Incomplete' : failedSubjects(student) ? 'Failed' : 'Passed'
      };
    }).sort(function (a, b) {
      if (a.rank === null && b.rank === null) return a.student.name.localeCompare(b.student.name);
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      return a.rank - b.rank || a.student.name.localeCompare(b.student.name);
    });
  }

  function csvCell(value) {
    let text = String(value == null ? '' : value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text; // stop spreadsheet formula injection
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function exportCsv() {
    const header = ['Rank', 'LRN', 'Learner', 'Semester 1 average', 'Semester 2 average', 'General average', 'Failed subjects', 'Remarks'];
    const lines = [header].concat(buildRows().map(function (row) {
      return [row.rank === null ? '' : row.rank, row.student.lrn || '', row.student.name, row.first === null ? '' : row.first,
        row.second === null ? '' : row.second, row.general === null ? '' : row.general, row.failed, row.status];
    }));
    const blob = new Blob(['﻿' + lines.map(function (line) { return line.map(csvCell).join(','); }).join('\r\n')],
      { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'summary-rank-' + String(GF.state.section || 'class').replace(/\W+/g, '_') + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  function stat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function render() {
    const body = document.getElementById('summary-rows');
    if (!body) return;
    const rows = buildRows();
    const ranked = rows.filter(function (row) { return row.general !== null; });
    const mean = ranked.length
      ? (ranked.reduce(function (sum, row) { return sum + row.general; }, 0) / ranked.length).toFixed(1) : '—';
    stat('summary-learners', String(rows.length));
    stat('summary-average', mean);
    stat('summary-passed', String(rows.filter(function (row) { return row.status === 'Passed'; }).length));
    stat('summary-failed', String(rows.filter(function (row) { return row.status === 'Failed'; }).length));
    stat('summary-incomplete', String(rows.filter(function (row) { return row.status === 'Incomplete'; }).length));
    const fmt = function (value) { return value === null ? '—' : String(value); };
    body.innerHTML = rows.map(function (row) {
      return '<tr><td>' + (row.rank === null ? '—' : row.rank) + '</td>' +
        '<th scope="row">' + esc(row.student.name) + '</th>' +
        '<td><strong>' + fmt(row.general) + '</strong></td>' +
        '<td><span class="pill ' + (row.status === 'Passed' ? 'pill-green' : row.status === 'Failed' ? 'pill-red' : 'pill-amber') + '">' + row.status + '</span></td>' +
        '<td>' + esc(row.student.lrn || '') + '</td>' +
        '<td>' + fmt(row.first) + '</td><td>' + fmt(row.second) + '</td>' +
        '<td>' + (row.failed || '') + '</td></tr>';
    }).join('') || '<tr><td colspan="8">Upload a class first.</td></tr>';
  }

  function bind() {
    const button = document.getElementById('summary-export');
    if (button) button.addEventListener('click', exportCsv);
  }

  GF.registerPage('summary', render);
  window.GradeFlowSummary = { buildRows: buildRows };
  document.addEventListener('DOMContentLoaded', bind);
})();
