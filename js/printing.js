/* ==========================================================================
   Generated Reports, PDF downloads, and printing
   Uses the final verified report cards. PDFs are drawn locally with jsPDF;
   printing fills a print-only area so the app interface never reaches paper.
   ========================================================================== */
(function () {
  'use strict';

  const GF = window.GradeFlow;
  const esc = GF.escapeHTML;
  const PAGE_SIZE = 6;

  const COLORS = {
    navy: [20, 44, 78],
    blue: [57, 121, 207],
    ice: [233, 241, 252],
    success: [22, 131, 75],
    muted: [103, 118, 140],
    light: [138, 151, 168],
    border: [228, 234, 242],
    soft: [247, 250, 253],
    white: [255, 255, 255]
  };

  /* ---------- Data ---------- */
  function activeDataset() {
    const state = GF.state;
    if (state.generated && !state.viewingArchive) {
      return {
        mode: 'current',
        reports: state.students,
        context: GF.reportContext({ generatedAt: state.generatedAt || new Date() })
      };
    }
    const archive = state.archive;
    return {
      mode: 'archive',
      reports: archive.students,
      context: GF.reportContext({
        term: archive.label,
        year: archive.year,
        className: archive.className,
        generatedAt: archive.generatedAt,
        archive: true
      })
    };
  }

  function reportById(dataset, id) {
    return dataset.reports.find(function (student) { return student.id === Number(id); }) || null;
  }

  function filteredReports(dataset) {
    const search = GF.state.reportsSearch.trim().toLowerCase();
    if (!search) return dataset.reports;
    return dataset.reports.filter(function (student) {
      return student.name.toLowerCase().includes(search) ||
        String(student.roll).toLowerCase().includes(search);
    });
  }

  function ensureSelection(reports) {
    const dataset = activeDataset();
    if (GF.state.reportSelectionMode === dataset.mode) return;
    GF.state.selectedReportIds.clear();
    reports.forEach(function (student) { GF.state.selectedReportIds.add(student.id); });
    GF.state.reportSelectionMode = dataset.mode;
  }

  function selectedReports(dataset) {
    return dataset.reports.filter(function (student) {
      return GF.state.selectedReportIds.has(student.id);
    });
  }

  function scopeReports(dataset) {
    const selector = document.getElementById('reports-selector');
    if (selector && selector.value === 'selected') return selectedReports(dataset);
    return dataset.reports.slice();
  }

  function pageData(dataset) {
    const all = filteredReports(dataset);
    const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    GF.state.reportsPage = Math.min(Math.max(1, GF.state.reportsPage), totalPages);
    const start = (GF.state.reportsPage - 1) * PAGE_SIZE;
    return {
      all: all,
      visible: all.slice(start, start + PAGE_SIZE),
      totalPages: totalPages,
      start: start
    };
  }

  /* ---------- Banner and archive note ---------- */
  function renderBanner(dataset) {
    const count = dataset.reports.length;
    const reportLabel = count === 1 ? 'report card' : 'report cards';
    const title = document.getElementById('reports-banner-title');
    const meta = document.getElementById('reports-banner-meta');
    const date = document.getElementById('reports-banner-date');
    const ready = document.getElementById('reports-ready-count');
    const archiveNote = document.getElementById('archive-note');
    const bulkButton = document.getElementById('bulk-download-btn');

    if (title) title.textContent = count + ' ' + reportLabel + '. Ready for proud moments.';
    if (meta) {
      meta.textContent = dataset.context.className + ' · ' + dataset.context.term +
        ' · ' + GF.prettyYear(dataset.context.year);
    }
    if (date) {
      date.textContent = dataset.mode === 'archive'
        ? 'Generated ' + dataset.context.issuedDate + ' · Saved archive'
        : 'Generated just now · Reviewed by ' + dataset.context.teacher;
    }
    if (ready) ready.textContent = String(count);
    if (archiveNote) archiveNote.hidden = dataset.mode !== 'archive';
    if (bulkButton) {
      bulkButton.disabled = count === 0;
      bulkButton.title = count
        ? 'Download all ' + count + ' report' + (count === 1 ? '' : 's') + ' as one PDF'
        : 'No reports available';
    }
  }

  /* ---------- Reports table ---------- */
  function checked(rowStudentId) {
    return GF.state.selectedReportIds.has(rowStudentId);
  }

  function reportRow(student, dataset) {
    const average = GF.averageLabel(student);
    const isSelected = checked(student.id);
    return '<tr data-report-id="' + student.id + '" class="' + (isSelected ? 'selected' : '') + '">' +
      '<td class="check-col">' +
        '<input type="checkbox" data-report-check="' + student.id + '"' + (isSelected ? ' checked' : '') +
          ' aria-label="Select ' + esc(student.name) + '\'s report">' +
      '</td>' +
      '<td><div class="report-student">' +
        '<strong>' + esc(student.name) + '</strong>' +
        '<span>Roll ' + esc(student.roll) + ' · ' + esc(average) + ' average</span>' +
      '</div></td>' +
      '<td>2 pages</td>' +
      '<td><span class="status-badge status-approved"><svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg> ' +
        (dataset.mode === 'archive' ? 'Archived' : 'Ready') + '</span></td>' +
      '<td class="align-right"><div class="report-actions">' +
        '<button type="button" class="icon-btn" data-download-id="' + student.id + '" aria-label="Download ' + esc(student.name) + '\'s report as PDF" title="Download PDF">' +
          '<svg class="icon" aria-hidden="true"><use href="#i-download"></use></svg></button>' +
        '<button type="button" class="icon-btn" data-print-id="' + student.id + '" aria-label="Print ' + esc(student.name) + '\'s report" title="Print report">' +
          '<svg class="icon" aria-hidden="true"><use href="#i-printer"></use></svg></button>' +
      '</div></td>' +
    '</tr>';
  }

  function updateSelectAll(dataset) {
    const selectAll = document.getElementById('select-all-reports');
    if (!selectAll) return;
    const filtered = filteredReports(dataset);
    const count = filtered.filter(function (student) { return checked(student.id); }).length;
    selectAll.disabled = filtered.length === 0;
    selectAll.checked = filtered.length > 0 && count === filtered.length;
    selectAll.indeterminate = count > 0 && count < filtered.length;
    selectAll.setAttribute('aria-label', count === filtered.length
      ? 'Deselect all reports'
      : 'Select all ' + filtered.length + ' report' + (filtered.length === 1 ? '' : 's'));
  }

  function renderTable(dataset) {
    const body = document.getElementById('reports-list');
    if (!body) return;
    const page = pageData(dataset);

    if (page.visible.length === 0) {
      body.innerHTML = '<tr><td colspan="5" class="table-empty">No reports match this search.</td></tr>';
    } else {
      body.innerHTML = page.visible.map(function (student) {
        return reportRow(student, dataset);
      }).join('');
    }

    const showing = document.getElementById('reports-showing');
    const pageLabel = document.getElementById('reports-page');
    const previous = document.getElementById('reports-prev');
    const next = document.getElementById('reports-next');

    if (showing) {
      showing.textContent = page.all.length
        ? 'Showing ' + (page.start + 1) + '–' + Math.min(page.start + PAGE_SIZE, page.all.length) + ' of ' + page.all.length + ' report' + (page.all.length === 1 ? '' : 's')
        : 'Showing 0 reports';
    }
    if (pageLabel) pageLabel.textContent = 'Page ' + GF.state.reportsPage + ' of ' + page.totalPages;
    if (previous) previous.disabled = GF.state.reportsPage <= 1;
    if (next) next.disabled = GF.state.reportsPage >= page.totalPages;
    updateSelectAll(dataset);
  }

  function updateSelectionUI(dataset) {
    document.querySelectorAll('#reports-list tr[data-report-id]').forEach(function (row) {
      const id = Number(row.getAttribute('data-report-id'));
      row.classList.toggle('selected', checked(id));
      const box = row.querySelector('[data-report-check]');
      if (box) box.checked = checked(id);
    });
    updateSelectAll(dataset);
  }

  function updatePrintSummary(dataset) {
    const selector = document.getElementById('reports-selector');
    const total = dataset.reports.length;
    const selected = selectedReports(dataset).length;

    if (selector) {
      const previousValue = selector.value || 'all';
      selector.innerHTML = '<option value="all">All ' + total + ' student' + (total === 1 ? '' : 's') + '</option>' +
        '<option value="selected">Selected reports (' + selected + ')</option>';
      selector.value = previousValue === 'selected' ? 'selected' : 'all';
    }

    const scope = scopeReports(dataset);
    const layout = document.getElementById('print-layout');
    const doubleSided = !layout || layout.value === 'double';
    const cards = document.getElementById('print-summary-cards');
    const pages = document.getElementById('print-summary-pages');
    const sheets = document.getElementById('print-summary-sheets');
    const printButton = document.getElementById('print-all-btn');

    if (cards) cards.textContent = String(scope.length);
    if (pages) pages.textContent = String(scope.length * 2);
    if (sheets) sheets.textContent = String(doubleSided ? scope.length : scope.length * 2);

    if (printButton) {
      const usingSelection = selector && selector.value === 'selected';
      let label = 'Print all ' + scope.length + ' report' + (scope.length === 1 ? '' : 's');
      if (usingSelection) label = 'Print selected ' + scope.length + ' report' + (scope.length === 1 ? '' : 's');
      printButton.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-printer"></use></svg> ' + esc(label);
      printButton.title = scope.length ? label : 'Choose at least one report to print';
    }
  }

  /* ---------- PDF drawing ---------- */
  function pdfConstructor() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (window.jspdf && window.jspdf.default) return window.jspdf.default;
    return null;
  }

  function pdfSafe(value) {
    return String(value == null ? '' : value)
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/[–—−]/g, '-')
      .replace(/[·•]/g, '-')
      .replace(/…/g, '...')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, '');
  }

  function safeFilename(value) {
    return String(value || 'report')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90) || 'report';
  }

  function setTextColor(doc, color) {
    doc.setTextColor(color[0], color[1], color[2]);
  }

  function setFillColor(doc, color) {
    doc.setFillColor(color[0], color[1], color[2]);
  }

  function setDrawColor(doc, color) {
    doc.setDrawColor(color[0], color[1], color[2]);
  }

  function drawHeader(doc, context, isBack, width, margin, top) {
    setFillColor(doc, COLORS.navy);
    doc.roundedRect(margin, top, 9, 9, 1.6, 1.6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setTextColor(doc, COLORS.white);
    doc.text('M', margin + 4.5, top + 6.1, { align: 'center' });

    doc.setFontSize(10.5);
    setTextColor(doc, COLORS.navy);
    doc.text(pdfSafe(context.schoolName.toUpperCase()), margin + 13, top + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    setTextColor(doc, COLORS.light);
    doc.text(pdfSafe(context.schoolAddress), margin + 13, top + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    setTextColor(doc, COLORS.muted);
    const documentTitle = isBack ? 'LEARNER PROGRESS AND OBSERVED VALUES' : 'REPORT ON LEARNING PROGRESS AND ACHIEVEMENT';
    const titleLines = doc.splitTextToSize(documentTitle, width * 0.41);
    doc.text(titleLines, width - margin, top + 3.2, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    setTextColor(doc, COLORS.light);
    doc.text(pdfSafe(context.termLabel), width - margin, top + (titleLines.length > 1 ? 12 : 8.5), { align: 'right' });

    setDrawColor(doc, COLORS.border);
    doc.setLineWidth(0.5);
    const headerBottom = top + (titleLines.length > 1 ? 16.5 : 12.5);
    doc.line(margin, headerBottom, width - margin, headerBottom);

    return headerBottom;
  }

  function drawSignatures(doc, context, pageNumber, width, height, margin) {
    const y = height - 28;
    const contentWidth = width - margin * 2;
    const signatureWidth = Math.min(52, contentWidth * 0.29);
    const rightX = margin + Math.min(70, contentWidth * 0.39);

    setDrawColor(doc, COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + signatureWidth, y);
    doc.line(rightX, y, rightX + signatureWidth, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    setTextColor(doc, COLORS.light);
    doc.text('CLASS ADVISER', margin, y + 4);
    doc.text('SCHOOL HEAD', rightX, y + 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    setTextColor(doc, COLORS.muted);
    doc.text(pdfSafe(context.teacher), margin, y + 8.5);
    doc.text(pdfSafe(context.principal), rightX, y + 8.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    setTextColor(doc, COLORS.light);
    doc.text('Page ' + pageNumber + ' of 2', width - margin, y + 4, { align: 'right' });
  }

  function drawFooter(doc, context, width, height, margin) {
    setDrawColor(doc, COLORS.border);
    doc.setLineWidth(0.2);
    doc.line(margin, height - 8, width - margin, height - 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    setTextColor(doc, COLORS.light);
    doc.text('Generated locally by GradeFlow AI - demo report', margin, height - 4.5);
    doc.text(pdfSafe(context.schoolName + ' · ' + context.termLabel), width - margin, height - 4.5, { align: 'right' });
  }

  function drawFront(doc, student, context) {
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const margin = width * 0.06;
    const contentWidth = width - margin * 2;
    const top = height * 0.052;
    drawHeader(doc, context, false, width, margin, top);

    const titleY = top + 24;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setTextColor(doc, COLORS.navy);
    doc.text('LEARNER INFORMATION', margin, titleY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setTextColor(doc, COLORS.muted);
    doc.text('Issued ' + pdfSafe(context.issuedDateShort), width - margin, titleY, { align: 'right' });

    const field = function (label, value, x, y, fieldWidth, valueSize) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      setTextColor(doc, COLORS.light);
      doc.text(label, x, y);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(valueSize || 8);
      setTextColor(doc, COLORS.navy);
      doc.text(pdfSafe(value), x, y + 4.2, { maxWidth: fieldWidth });
      setDrawColor(doc, COLORS.border);
      doc.setLineWidth(0.25);
      doc.line(x, y + 6.4, x + fieldWidth, y + 6.4);
    };
    const fieldY = titleY + 6;
    field('LEARNER\'S NAME', student.name, margin, fieldY, contentWidth, 9);
    const fieldWidth = contentWidth / 4;
    const detailY = fieldY + 9.5;
    field('GRADE LEVEL', context.gradeLevel, margin, detailY, fieldWidth - 3);
    field('SECTION', context.section, margin + fieldWidth, detailY, fieldWidth - 3);
    field('ROLL / ROSTER NO.', student.roll, margin + fieldWidth * 2, detailY, fieldWidth - 3, 7);
    field('SCHOOL YEAR', GF.prettyYear(context.year), margin + fieldWidth * 3, detailY, fieldWidth - 3);

    const tableY = detailY + 10;
    const headerHeight = Math.max(6.5, height * 0.033);
    const rowHeight = Math.max(6, height * 0.031);
    const scoreX = margin + contentWidth * 0.73;
    const letterX = margin + contentWidth * 0.89;

    setFillColor(doc, COLORS.navy);
    doc.rect(margin, tableY, contentWidth, headerHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    setTextColor(doc, COLORS.white);
    doc.text('LEARNING AREA', margin + 3, tableY + headerHeight * 0.66);
    doc.text('GRADE RECORDED', scoreX, tableY + headerHeight * 0.66, { align: 'center' });
    doc.text('LETTER GRADE', letterX, tableY + headerHeight * 0.66, { align: 'center' });

    GF.SUBJECTS.forEach(function (subject, index) {
      const rowY = tableY + headerHeight + index * rowHeight;
      if (index % 2 === 1) {
        setFillColor(doc, COLORS.soft);
        doc.rect(margin, rowY, contentWidth, rowHeight, 'F');
      }
      const value = student.grades[subject.key];
      const missing = value === null || value === '' || Number.isNaN(Number(value));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.3);
      setTextColor(doc, COLORS.muted);
      doc.text(pdfSafe(subject.name), margin + 3, rowY + rowHeight * 0.66);
      doc.text(missing ? '-' : pdfSafe(String(value)), scoreX, rowY + rowHeight * 0.66, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      setTextColor(doc, COLORS.navy);
      doc.text(missing ? '-' : pdfSafe(GF.letterFor(value)), letterX, rowY + rowHeight * 0.66, { align: 'center' });
      setDrawColor(doc, COLORS.border);
      doc.setLineWidth(0.2);
      doc.line(margin, rowY + rowHeight, width - margin, rowY + rowHeight);
    });

    const tableBottom = tableY + headerHeight + rowHeight * GF.SUBJECTS.length;
    const averageY = tableBottom + 5;
    const averageHeight = Math.max(7, height * 0.04);
    setFillColor(doc, COLORS.ice);
    doc.roundedRect(margin, averageY, contentWidth, averageHeight, 1.4, 1.4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.6);
    setTextColor(doc, COLORS.navy);
    doc.text('General average for ' + pdfSafe(context.term), margin + 4, averageY + averageHeight * 0.63);
    const average = GF.averageGrade(student);
    doc.text((average === null ? '-' : average + '%') + '   ' +
      (average === null ? '-' : pdfSafe(GF.letterFor(average))), width - margin - 4, averageY + averageHeight * 0.63, { align: 'right' });

    const boxY = averageY + averageHeight + 6;
    const boxHeight = Math.max(12, height * 0.065);
    const gap = 6;
    const boxWidth = (contentWidth - gap) / 2;
    const attendance = student.attendance || {};
    const present = Number(attendance.present);
    const total = Number(attendance.total);
    const attendanceText = Number.isFinite(present) && Number.isFinite(total) && total > 0
      ? present + ' of ' + total + ' days (' + Math.round((present / total) * 100) + '%)'
      : 'Not provided';

    [{
      x: margin,
      label: 'ATTENDANCE',
      value: attendanceText
    }, {
      x: margin + boxWidth + gap,
      label: 'OVERALL PERFORMANCE',
      value: GF.performanceLabel(student)
    }].forEach(function (box) {
      setFillColor(doc, COLORS.soft);
      setDrawColor(doc, [232, 238, 247]);
      doc.roundedRect(box.x, boxY, boxWidth, boxHeight, 1.2, 1.2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.9);
      setTextColor(doc, COLORS.light);
      doc.text(box.label, box.x + 4, boxY + 5);
      doc.setFontSize(8.2);
      setTextColor(doc, COLORS.navy);
      const lines = doc.splitTextToSize(pdfSafe(box.value), boxWidth - 8);
      doc.text(lines.slice(0, 2), box.x + 4, boxY + 10);
    });

    const scaleY = boxY + boxHeight + 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.3);
    setTextColor(doc, COLORS.light);
    const scaleText = 'Grades shown are the values provided in the uploaded sheet. ' + GF.gradeScaleDescription() +
      ' - A 90-100, B 80-89, C 70-79, D 60-69, E below 60.';
    doc.text(doc.splitTextToSize(pdfSafe(scaleText), contentWidth), margin, scaleY);

    drawSignatures(doc, context, 1, width, height, margin);
    drawFooter(doc, context, width, height, margin);
  }

  function fitComment(doc, text, width, maxHeight) {
    let size = 9;
    let lines = [];
    let lineHeight = 4.2;
    while (size >= 7.5) {
      doc.setFontSize(size);
      lines = doc.splitTextToSize(text, width);
      lineHeight = size * 0.47;
      if (13 + lines.length * lineHeight <= maxHeight) {
        return { lines: lines, lineHeight: lineHeight, size: size };
      }
      size -= 0.5;
    }
    doc.setFontSize(7.5);
    lineHeight = 7.5 * 0.47;
    lines = doc.splitTextToSize(text, width);
    const maxLines = Math.max(1, Math.floor((maxHeight - 15) / lineHeight));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = String(lines[maxLines - 1]).replace(/\s+\S*$/, '') + '...';
    }
    return { lines: lines, lineHeight: lineHeight, size: 7.5 };
  }

  function drawBack(doc, student, context) {
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const margin = width * 0.06;
    const contentWidth = width - margin * 2;
    const top = height * 0.052;
    drawHeader(doc, context, true, width, margin, top);

    const titleY = top + 26;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    setTextColor(doc, COLORS.navy);
    doc.text("Teacher's reflections", margin, titleY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setTextColor(doc, COLORS.muted);
    doc.text(pdfSafe(context.termLabel), width - margin, titleY, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    setTextColor(doc, COLORS.navy);
    doc.text(pdfSafe(student.name), margin, titleY + 16);

    const metaY = titleY + 21;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    setTextColor(doc, COLORS.muted);
    doc.text('Roll ' + pdfSafe(student.roll), margin, metaY);
    doc.text('Reviewed by ' + pdfSafe(context.teacher), width - margin, metaY, { align: 'right' });

    const signatureY = height - 28;
    const commentY = metaY + 8;
    const maxCommentHeight = Math.max(24, signatureY - commentY - 76);
    const commentText = student.comment && student.comment.trim()
      ? student.comment.trim()
      : 'A teacher comment has not been saved for this student yet.';
    const fitted = fitComment(doc, pdfSafe(commentText), contentWidth - 10, maxCommentHeight);
    const commentHeight = 14 + fitted.lines.length * fitted.lineHeight;

    setFillColor(doc, COLORS.soft);
    setDrawColor(doc, [229, 237, 247]);
    doc.roundedRect(margin, commentY, contentWidth, commentHeight, 1.6, 1.6, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    setTextColor(doc, COLORS.blue);
    doc.text('TEACHER COMMENT', margin + 5, commentY + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fitted.size);
    setTextColor(doc, [74, 91, 112]);
    doc.text(fitted.lines, margin + 5, commentY + 11.5);

    const traits = student.traits || GF.makeTraits(student);
    let cursor = commentY + commentHeight + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    setTextColor(doc, COLORS.navy);
    doc.text('Learning habits', margin, cursor);
    cursor += 5.6;
    const traitRows = [
      ['Participation', traits.participation],
      ['Collaboration', traits.collaboration],
      ['Work habits', traits.workHabits]
    ];
    const traitRowHeight = Math.max(4.8, Math.min(6.2, height * 0.021));
    traitRows.forEach(function (trait) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setTextColor(doc, COLORS.muted);
      doc.text(pdfSafe(trait[0]), margin, cursor);
      setTextColor(doc, [69, 86, 107]);
      doc.text(pdfSafe(trait[1]), width - margin, cursor, { align: 'right' });
      setDrawColor(doc, [237, 241, 246]);
      doc.setLineWidth(0.2);
      doc.line(margin, cursor + 1.8, width - margin, cursor + 1.8);
      cursor += traitRowHeight;
    });

    const nextSteps = student.nextSteps || GF.makeNextSteps(student);
    const nextY = cursor + 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    const stepLines = [];
    nextSteps.forEach(function (step) {
      doc.setFontSize(7.8);
      const lines = doc.splitTextToSize('- ' + pdfSafe(step), contentWidth - 10);
      lines.forEach(function (line) { stepLines.push(line); });
    });
    const stepLineHeight = 3.9;
    const nextHeight = 11 + stepLines.length * stepLineHeight;
    setFillColor(doc, COLORS.ice);
    doc.roundedRect(margin, nextY, contentWidth, nextHeight, 1.4, 1.4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    setTextColor(doc, COLORS.navy);
    doc.text('Next steps at home', margin + 4, nextY + 5.2);
    doc.setFont('helvetica', 'normal');
    setTextColor(doc, [81, 100, 123]);
    doc.text(stepLines, margin + 4, nextY + 9.6);

    const closingY = nextY + nextHeight + 6;
    if (closingY < signatureY - 8) {
      const firstName = student.name.split(' ')[0];
      const closing = 'Thank you for partnering with us in ' + firstName +
        "'s learning this term. Please reach out if you would like to talk through this report.";
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.6);
      setTextColor(doc, COLORS.muted);
      const lines = doc.splitTextToSize(pdfSafe(closing), contentWidth);
      doc.text(lines.slice(0, Math.max(1, Math.floor((signatureY - closingY) / 3.8))), margin, closingY);
    }

    drawSignatures(doc, context, 2, width, height, margin);
    drawFooter(doc, context, width, height, margin);
  }

  function createDocument(title) {
    const PDF = pdfConstructor();
    if (!PDF) return null;
    const orientation = GF.state.orientation === 'landscape' ? 'landscape' : 'portrait';
    const format = GF.state.paperSize === 'letter' ? 'letter' : 'a4';
    const doc = new PDF({ orientation: orientation, unit: 'mm', format: format, compress: true });
    if (doc.setProperties) {
      doc.setProperties({
        title: title,
        subject: 'GradeFlow AI report card (local demo)',
        author: GF.state.teacher,
        creator: 'GradeFlow AI'
      });
    }
    return doc;
  }

  function downloadReports(reports, options) {
    const settings = options || {};
    if (!reports.length) {
      GF.showToast('Choose at least one report first.', 'error');
      return;
    }
    const dataset = activeDataset();
    const first = reports[0];
    const title = settings.single
      ? dataset.context.term + ' report card for ' + first.name
      : dataset.context.term + ' report cards for ' + dataset.context.className;
    const doc = createDocument(pdfSafe(title));
    if (!doc) {
      GF.showToast('PDF support did not load. Reload the page and try again.', 'error');
      return;
    }

    reports.forEach(function (student, index) {
      if (index > 0) doc.addPage();
      drawFront(doc, student, dataset.context);
      doc.addPage();
      drawBack(doc, student, dataset.context);
    });

    let filename;
    if (settings.single) {
      filename = 'GradeFlow_' + safeFilename(first.name) + '_' + safeFilename(dataset.context.term) + '.pdf';
    } else {
      filename = 'GradeFlow_' + safeFilename(dataset.context.term) + '_' +
        safeFilename(dataset.context.className) + '_' + reports.length + '-Reports.pdf';
    }
    doc.save(filename);
    GF.showToast(settings.single
      ? 'Downloaded ' + first.name + '\'s report as a PDF.'
      : 'Downloaded ' + reports.length + ' report card' + (reports.length === 1 ? '' : 's') + ' as one PDF.');
  }

  /* ---------- Printing ---------- */
  function printPageHeight() {
    const paper = GF.state.paperSize;
    const landscape = GF.state.orientation === 'landscape';
    if (paper === 'letter') return landscape ? 214 : 278;
    return landscape ? 208 : 296;
  }

  function printReports(reports) {
    if (!reports.length) {
      GF.showToast('Choose at least one report to print.', 'error');
      return;
    }
    const area = document.getElementById('print-area');
    const style = document.getElementById('print-page-style');
    if (!area || !window.GradeFlowReports) {
      GF.showToast('Printing is not available. Reload the page and try again.', 'error');
      return;
    }

    const dataset = activeDataset();
    area.innerHTML = reports.map(function (student) {
      return '<div class="print-page"><article class="report-sheet report-front">' +
        window.GradeFlowReports.buildFrontHTML(student, dataset.context) + '</article></div>' +
        '<div class="print-page"><article class="report-sheet report-back">' +
        window.GradeFlowReports.buildBackHTML(student, dataset.context) + '</article></div>';
    }).join('');

    area.classList.toggle('print-letter', GF.state.paperSize === 'letter');
    area.classList.toggle('print-landscape', GF.state.orientation === 'landscape');
    area.style.setProperty('--print-page-height', printPageHeight() + 'mm');

    if (style) {
      const paper = GF.state.paperSize === 'letter' ? 'Letter' : 'A4';
      style.textContent = '@page { size: ' + paper + ' ' + GF.state.orientation + '; margin: 0; }';
    }

    GF.showToast('Opening the print dialog for ' + reports.length + ' report' + (reports.length === 1 ? '' : 's') + '.', 'info');
    window.print();
  }

  /* ---------- Page rendering ---------- */
  function renderGeneratedReports() {
    const dataset = activeDataset();
    ensureSelection(dataset.reports);
    renderBanner(dataset);
    const search = document.getElementById('search-reports');
    if (search) search.value = GF.state.reportsSearch;
    renderTable(dataset);
    updatePrintSummary(dataset);
  }

  /* ---------- Events ---------- */
  function bindEvents() {
    const body = document.getElementById('reports-list');
    if (body) {
      body.addEventListener('change', function (event) {
        const box = event.target.closest('[data-report-check]');
        if (!box) return;
        const id = Number(box.getAttribute('data-report-check'));
        if (box.checked) GF.state.selectedReportIds.add(id);
        else GF.state.selectedReportIds.delete(id);
        updateSelectionUI(activeDataset());
        updatePrintSummary(activeDataset());
      });
      body.addEventListener('click', function (event) {
        const download = event.target.closest('[data-download-id]');
        if (download) {
          const dataset = activeDataset();
          const student = reportById(dataset, download.getAttribute('data-download-id'));
          if (student) downloadReports([student], { single: true });
          return;
        }
        const print = event.target.closest('[data-print-id]');
        if (print) {
          const dataset = activeDataset();
          const student = reportById(dataset, print.getAttribute('data-print-id'));
          if (student) printReports([student]);
        }
      });
    }

    const selectAll = document.getElementById('select-all-reports');
    if (selectAll) {
      selectAll.addEventListener('change', function () {
        const dataset = activeDataset();
        filteredReports(dataset).forEach(function (student) {
          if (selectAll.checked) GF.state.selectedReportIds.add(student.id);
          else GF.state.selectedReportIds.delete(student.id);
        });
        updateSelectionUI(dataset);
        updatePrintSummary(dataset);
      });
    }

    const search = document.getElementById('search-reports');
    if (search) {
      search.addEventListener('input', function () {
        GF.state.reportsSearch = search.value;
        GF.state.reportsPage = 1;
        const dataset = activeDataset();
        renderTable(dataset);
        updatePrintSummary(dataset);
      });
    }

    const previous = document.getElementById('reports-prev');
    const next = document.getElementById('reports-next');
    if (previous) {
      previous.addEventListener('click', function () {
        GF.state.reportsPage = Math.max(1, GF.state.reportsPage - 1);
        renderTable(activeDataset());
      });
    }
    if (next) {
      next.addEventListener('click', function () {
        GF.state.reportsPage += 1;
        renderTable(activeDataset());
      });
    }

    const bulk = document.getElementById('bulk-download-btn');
    if (bulk) {
      bulk.addEventListener('click', function () {
        downloadReports(activeDataset().reports, {});
      });
    }

    const printAll = document.getElementById('print-all-btn');
    if (printAll) {
      printAll.addEventListener('click', function () {
        printReports(scopeReports(activeDataset()));
      });
    }

    const selector = document.getElementById('reports-selector');
    if (selector) {
      selector.addEventListener('change', function () {
        updatePrintSummary(activeDataset());
      });
    }

    ['paper-size', 'print-orientation', 'print-layout'].forEach(function (id) {
      const field = document.getElementById(id);
      if (!field) return;
      field.addEventListener('change', function () {
        GF.state.paperSize = document.getElementById('paper-size').value;
        GF.state.orientation = document.getElementById('print-orientation').value;
        GF.state.printLayout = document.getElementById('print-layout').value;
        updatePrintSummary(activeDataset());
      });
    });
  }

  GF.registerPage('generated-reports', renderGeneratedReports);

  document.addEventListener('DOMContentLoaded', function () {
    const paper = document.getElementById('paper-size');
    const orientation = document.getElementById('print-orientation');
    const layout = document.getElementById('print-layout');
    if (paper) paper.value = GF.state.paperSize;
    if (orientation) orientation.value = GF.state.orientation;
    if (layout) layout.value = GF.state.printLayout;
    bindEvents();
  });
})();
