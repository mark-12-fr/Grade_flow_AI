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
  let logoDataPromise = null;

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
      '<td>1 page</td>' +
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
    const cards = document.getElementById('print-summary-cards');
    const pages = document.getElementById('print-summary-pages');
    const sheets = document.getElementById('print-summary-sheets');
    const printButton = document.getElementById('print-all-btn');

    if (cards) cards.textContent = String(scope.length);
    if (pages) pages.textContent = String(scope.length);
    const duplex = document.getElementById('print-layout');
    if (sheets) sheets.textContent = String(duplex && duplex.value === 'single'
      ? Math.ceil(scope.length / 2)
      : scope.length);

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

  function loadLogoData() {
    if (!logoDataPromise) {
      logoDataPromise = new Promise(function (resolve, reject) {
        const image = new Image();
        image.onload = function () {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas is unavailable.');
            context.drawImage(image, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } catch (error) {
            reject(error);
          }
        };
        image.onerror = function () {
          reject(new Error('The University of Iloilo logo could not be loaded.'));
        };
        image.src = 'assets/ui-logo.png';
      }).catch(function (error) {
        logoDataPromise = null;
        throw error;
      });
    }
    return logoDataPromise;
  }

  function drawFront(doc, student, context, logoData) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    // The card is designed on A4 landscape. Scale it down when the user picks
    // Letter or portrait so the same proportions still fit on one page.
    const scale = Math.min(pageWidth / 297, pageHeight / 210);
    const offsetX = (pageWidth - 297 * scale) / 2;
    const offsetY = (pageHeight - 210 * scale) / 2;
    const X = function (value) { return offsetX + value * scale; };
    const Y = function (value) { return offsetY + value * scale; };
    const S = function (value) { return value * scale; };

    const left = 10;
    const rightEdge = 287;
    const contentWidth = rightEdge - left;
    const columnGap = contentWidth * 0.015;
    const leftWidth = (contentWidth - columnGap) * (48.5 / 98);
    const rightWidth = contentWidth - columnGap - leftWidth;
    const rightX = left + leftWidth + columnGap;
    const bodyTop = 26;
    const bodyBottom = 200;

    const line = [70, 68, 62];
    const tan = [200, 192, 160];
    const cream = [244, 241, 228];
    const ink = [34, 34, 34];
    const soft = [85, 84, 80];

    function setFont(style, size, color) {
      doc.setFont('helvetica', style || 'normal');
      doc.setFontSize(S(size));
      setTextColor(doc, color || ink);
    }

    function cell(x, y, width, height, options) {
      const settings = options || {};
      if (settings.fill) setFillColor(doc, settings.fill);
      setDrawColor(doc, settings.stroke || line);
      doc.setLineWidth(S(settings.lineWidth || 0.22));
      doc.rect(X(x), Y(y), S(width), S(height), settings.fill ? 'FD' : 'S');
    }

    function centeredText(text, x, y, width, options) {
      const settings = options || {};
      doc.text(pdfSafe(text), X(x + width / 2), Y(y), {
        align: 'center',
        baseline: settings.baseline || 'middle',
        maxWidth: S(width - (settings.inset == null ? 1.4 : settings.inset))
      });
    }

    function leftText(text, x, y, width, options) {
      const settings = options || {};
      doc.text(pdfSafe(text), X(x + (settings.inset == null ? 1.2 : settings.inset)), Y(y), {
        align: 'left',
        baseline: settings.baseline || 'middle',
        maxWidth: S(width - 2)
      });
    }

    function fitFont(text, style, size, width) {
      let current = size;
      doc.setFont('helvetica', style || 'normal');
      doc.setFontSize(S(current));
      while (current > 3.2 && doc.getTextWidth(pdfSafe(text)) > S(width)) {
        current -= 0.1;
        doc.setFontSize(S(current));
      }
      return current;
    }

    function drawLabelValue(label, value, x, y, width, size) {
      setFont('bold', size || 5.1, ink);
      doc.text(pdfSafe(label + ':'), X(x), Y(y), { baseline: 'middle' });
      const labelWidth = doc.getTextWidth(pdfSafe(label + ':')) / scale;
      setFont('normal', (size || 5.1) + 0.4, ink);
      doc.text(pdfSafe(value || '-'), X(x + labelWidth + 1.2), Y(y), {
        baseline: 'middle',
        maxWidth: S(width - labelWidth - 2.4)
      });
    }

    /* ---------- Header ---------- */
    if (logoData) doc.addImage(logoData, 'PNG', X(12), Y(8.4), S(11.4), S(12.9));
    const addressLines = String(context.schoolAddress || '')
      .split(' · ')
      .map(function (part) { return part.trim(); })
      .filter(function (part) {
        return part && part.toLowerCase().indexOf('senior high school department') === -1;
      });
    setFont('normal', 4.1, soft);    addressLines.slice(0, 4).forEach(function (address, index) {
      centeredText(address, left + 18, 9.6 + index * 2.15, leftWidth - 20);
    });
    setFont('bold', 9.2, ink);
    centeredText(context.schoolName, left + 18, 19.7, leftWidth - 20);
    setFont('normal', 4.8, soft);
    centeredText('Senior High School Department', left + 18, 22.4, leftWidth - 20);

    setFont('bold', 10.8, ink);
    doc.setFont('times', 'bold');
    doc.setFontSize(S(10.8));
    setTextColor(doc, ink);
    doc.text(pdfSafe('REPORT ON LEARNING PROGRESS AND ACHIEVEMENT'),
      X(rightX + rightWidth / 2), Y(16.2), { align: 'center', baseline: 'middle' });

    setDrawColor(doc, line);
    doc.setLineWidth(S(0.35));
    doc.line(X(left), Y(24.1), X(rightEdge), Y(24.1));

    /* ---------- Learner details ---------- */
    const fieldRows = [
      ['Name', student.name],
      ['Age', student.age || '-', 'Sex', student.sex || '-'],
      ['Grade', context.gradeLevel, 'Section', context.section],
      ['School Year', GF.prettyYear(context.year), 'LRN', student.lrn || '-'],
      ['Track/Strand', context.trackStrand || context.strand || '-']
    ];
    fieldRows.forEach(function (row, index) {
      const y = bodyTop + index * 5.0 + 2.4;
      if (index === 0 || index === 4) {
        drawLabelValue(row[0], row[1], left, y, leftWidth, 5.1);
      } else {
        drawLabelValue(row[0], row[1], left, y, leftWidth / 2, 5.0);
        drawLabelValue(row[2], row[3], left + leftWidth / 2, y, leftWidth / 2, 5.0);
      }
    });
    let leftY = bodyTop + fieldRows.length * 5.0 + 1.4;

    /* ---------- Dear Parent ---------- */
    setFont('bold', 5.2, ink);
    doc.text('Dear Parent:', X(left), Y(leftY + 2.1), { baseline: 'middle' });
    setFont('italic', 4.7, ink);
    const noteLines = doc.splitTextToSize(pdfSafe(
      'This report card shows your child\'s performance in the different learning areas as well as in character formation. ' +
      'The school welcomes you if you desire to know more about the progress of your child.'
    ), S(leftWidth));
    doc.text(noteLines.slice(0, 2).map(pdfSafe), X(left), Y(leftY + 5.1), {
      baseline: 'top',
      lineHeightFactor: 1.35
    });
    leftY += 6.1 + Math.min(noteLines.length, 2) * 2.35;

    /* ---------- Adviser and principal names ---------- */
    leftY += 1.6;
    [
      [context.teacher, left, leftWidth / 2, 'Adviser'],
      [context.principal, left + leftWidth / 2, leftWidth / 2, 'Principal']
    ].forEach(function (signature) {
      setFont('bold', 5.4, ink);
      centeredText(signature[0], signature[1], leftY, signature[2]);
      setDrawColor(doc, line);
      doc.setLineWidth(S(0.22));
      doc.line(X(signature[1] + 1), Y(leftY + 1.4), X(signature[1] + signature[2] - 1), Y(leftY + 1.4));
    });
    leftY += 3.4;

    /* ---------- Certificate panels ---------- */
    const panelWidth = leftWidth / 2;
    const headingHeight = 4.3;
    const transferRowHeight = 4.0;
    function transferPanel(x, title, fields, signatureLabel) {
      cell(x, leftY, panelWidth, headingHeight, { fill: tan, stroke: line });
      setFont('bold', 4.4, ink);
      centeredText(title, x, leftY + headingHeight / 2, panelWidth);
      let rowY = leftY + headingHeight;
      const labelWidth = panelWidth * 0.55;
      fields.forEach(function (field) {
        cell(x, rowY, labelWidth, transferRowHeight, { stroke: line });
        cell(x + labelWidth, rowY, panelWidth - labelWidth, transferRowHeight, { stroke: line });
        setFont('normal', 3.9, soft);
        leftText(field[0], x, rowY + transferRowHeight / 2, labelWidth, { inset: 0.9 });
        setFont('normal', 4.2, ink);
        leftText(field[1] || '', x + labelWidth, rowY + transferRowHeight / 2, panelWidth - labelWidth, { inset: 0.9 });
        rowY += transferRowHeight;
      });
      const signatureHeight = 6.2;
      cell(x, rowY, panelWidth, signatureHeight, { stroke: line });
      const signatureWidth = panelWidth * 0.55;
      setDrawColor(doc, line);
      doc.setLineWidth(S(0.22));
      const signatureCenter = x + panelWidth / 2;
      doc.line(X(signatureCenter - signatureWidth / 2), Y(rowY + 1.6),
        X(signatureCenter + signatureWidth / 2), Y(rowY + 1.6));
      setFont('normal', 3.8, soft);
      centeredText(signatureLabel, x, rowY + 3.5, panelWidth);
    }

    const transfer = student.transfer || {};
    const leftTransferFields = [
      ['Admitted to', transfer.admittedTo],
      ['Section', transfer.section || context.section],
      ['Eligibility for admission to grade', transfer.eligibilityForGrade],
      ['Approved by', transfer.approvedBy]
    ];
    const rightTransferFields = [
      ['Admitted in', transfer.admittedIn],
      ['Date', transfer.transferDate],
      ['Approved by', transfer.cancellationOfEligibility]
    ];
    transferPanel(left, 'Certificate of Transfer', leftTransferFields, 'Adviser');
    // The right panel reserves one blank row so both panels end at the same height.
    const rightPanelTop = leftY;
    cell(left + panelWidth, rightPanelTop, panelWidth, headingHeight, { fill: tan, stroke: line });
    setFont('bold', 4.4, ink);
    centeredText('Cancellation of Eligibility to Transfer', left + panelWidth,
      rightPanelTop + headingHeight / 2, panelWidth);
    let rightRowY = rightPanelTop + headingHeight;
    const rightLabelWidth = panelWidth * 0.55;
    rightTransferFields.forEach(function (field) {
      cell(left + panelWidth, rightRowY, rightLabelWidth, transferRowHeight, { stroke: line });
      cell(left + panelWidth + rightLabelWidth, rightRowY,
        panelWidth - rightLabelWidth, transferRowHeight, { stroke: line });
      setFont('normal', 3.9, soft);
      leftText(field[0], left + panelWidth, rightRowY + transferRowHeight / 2,
        rightLabelWidth, { inset: 0.9 });
      setFont('normal', 4.2, ink);
      leftText(field[1] || '', left + panelWidth + rightLabelWidth,
        rightRowY + transferRowHeight / 2, panelWidth - rightLabelWidth, { inset: 0.9 });
      rightRowY += transferRowHeight;
    });
    rightRowY += transferRowHeight; // blank spacer row, as on the printed form
    setDrawColor(doc, line);
    doc.setLineWidth(S(0.22));
    doc.line(X(left + panelWidth), Y(rightRowY - transferRowHeight),
      X(left + panelWidth), Y(rightRowY));
    doc.line(X(left + panelWidth * 2), Y(rightRowY - transferRowHeight),
      X(left + panelWidth * 2), Y(rightRowY));
    cell(left + panelWidth, rightRowY, panelWidth, 6.2, { stroke: line });
    const rightSignatureCenter = left + panelWidth + panelWidth / 2;
    const rightSignatureWidth = panelWidth * 0.55;
    doc.line(X(rightSignatureCenter - rightSignatureWidth / 2), Y(rightRowY + 1.6),
      X(rightSignatureCenter + rightSignatureWidth / 2), Y(rightRowY + 1.6));
    setFont('normal', 3.8, soft);
    centeredText('Principal', left + panelWidth, rightRowY + 3.5, panelWidth);
    leftY += headingHeight + 4 * transferRowHeight + 6.2 + 1.6;

    /* ---------- Attendance ---------- */
    function drawTableCaption(text, x, y, width, height) {
      cell(x, y, width, height, { fill: tan, stroke: line });
      setFont('bold', 4.5, ink);
      centeredText(text, x, y + height / 2, width);
    }

    const attendance = student.attendance || {};
    drawTableCaption('REPORT OF ATTENDANCE', left, leftY, leftWidth, 4.0);
    let attendanceY = leftY + 4.0;
    const attendanceLabelWidth = leftWidth * 0.20;
    const attendanceTotalWidth = leftWidth * 0.08;
    const attendanceMonthWidth = (leftWidth - attendanceLabelWidth - attendanceTotalWidth) /
      GF.ATTENDANCE_MONTHS.length;
    const attendanceHeaderHeight = 3.4;
    cell(left, attendanceY, attendanceLabelWidth, attendanceHeaderHeight, { fill: cream, stroke: line });
    GF.ATTENDANCE_MONTHS.forEach(function (month, index) {
      const x = left + attendanceLabelWidth + index * attendanceMonthWidth;
      cell(x, attendanceY, attendanceMonthWidth, attendanceHeaderHeight, { fill: cream, stroke: line });
      setFont('bold', 4.0, ink);
      centeredText(month.label, x, attendanceY + attendanceHeaderHeight / 2,
        attendanceMonthWidth, { inset: 0.2 });
    });
    const totalX = left + attendanceLabelWidth +
      GF.ATTENDANCE_MONTHS.length * attendanceMonthWidth;
    cell(totalX, attendanceY, attendanceTotalWidth, attendanceHeaderHeight,
      { fill: cream, stroke: line });
    setFont('bold', 4.0, ink);
    centeredText('Total', totalX, attendanceY + attendanceHeaderHeight / 2,
      attendanceTotalWidth, { inset: 0.2 });

    const attendanceRows = [
      ['No. of school days', attendance.schoolDays || {}],
      ['No. of days present', attendance.months || {}],
      ['No. of days absent', attendance.absent || {}]
    ];
    const attendanceRowHeight = 3.3;
    attendanceRows.forEach(function (row, rowIndex) {
      const y = attendanceY + attendanceHeaderHeight + rowIndex * attendanceRowHeight;
      cell(left, y, attendanceLabelWidth, attendanceRowHeight, { stroke: line });
      setFont('normal', 4.0, ink);
      leftText(row[0], left, y + attendanceRowHeight / 2, attendanceLabelWidth, { inset: 0.8 });
      let total = 0;
      let hasValue = false;
      GF.ATTENDANCE_MONTHS.forEach(function (month, monthIndex) {
        const value = row[1][month.key];
        const x = left + attendanceLabelWidth + monthIndex * attendanceMonthWidth;
        cell(x, y, attendanceMonthWidth, attendanceRowHeight, { stroke: line });
        setFont('normal', 4.1, ink);
        centeredText(value == null ? '' : String(value), x, y + attendanceRowHeight / 2,
          attendanceMonthWidth, { inset: 0.2 });
        if (value !== null && value !== undefined && value !== '') {
          total += Number(value) || 0;
          hasValue = true;
        }
      });
      cell(totalX, y, attendanceTotalWidth, attendanceRowHeight, { stroke: line });
      setFont('bold', 4.1, ink);
      centeredText(hasValue ? String(total) : '', totalX, y + attendanceRowHeight / 2,
        attendanceTotalWidth, { inset: 0.2 });
    });
    leftY = attendanceY + attendanceHeaderHeight + attendanceRows.length * attendanceRowHeight + 2.0;

    /* ---------- Observed values ---------- */
    const valuesTop = leftY;
    const valuesBottom = bodyBottom;
    const valuesCaptionHeight = 4.1;
    const valuesHeaderOne = 3.6;
    const valuesHeaderTwo = 3.2;
    const valuesBodyHeight = valuesBottom - valuesTop - valuesCaptionHeight -
      valuesHeaderOne - valuesHeaderTwo;
    const valuesRowHeight = valuesBodyHeight / 8;
    const coreWidth = leftWidth * 0.13;
    const statementWidth = leftWidth * 0.61;
    const ratingWidth = (leftWidth - coreWidth - statementWidth) / 4;

    drawTableCaption('REPORT ON LEARNER\'S OBSERVED VALUES', left, valuesTop, leftWidth,
      valuesCaptionHeight);
    let valuesY = valuesTop + valuesCaptionHeight;
    cell(left, valuesY, coreWidth + statementWidth, valuesHeaderOne, { fill: cream, stroke: line });
    cell(left, valuesY, coreWidth, valuesHeaderOne, { fill: cream, stroke: line });
    cell(left + coreWidth, valuesY, statementWidth, valuesHeaderOne, { fill: cream, stroke: line });
    cell(left + coreWidth + statementWidth, valuesY, ratingWidth * 4, valuesHeaderOne,
      { fill: cream, stroke: line });
    setFont('bold', 4.1, ink);
    centeredText('Core values', left, valuesY + valuesHeaderOne / 2, coreWidth, { inset: 0.6 });
    centeredText('Behavior statements', left + coreWidth, valuesY + valuesHeaderOne / 2,
      statementWidth, { inset: 0.6 });
    centeredText('Quarter', left + coreWidth + statementWidth, valuesY + valuesHeaderOne / 2,
      ratingWidth * 4, { inset: 0.4 });
    valuesY += valuesHeaderOne;
    cell(left, valuesY, coreWidth, valuesHeaderTwo, { fill: cream, stroke: line });
    cell(left + coreWidth, valuesY, statementWidth, valuesHeaderTwo, { fill: cream, stroke: line });
    for (let q = 0; q < 4; q += 1) {
      const x = left + coreWidth + statementWidth + q * ratingWidth;
      cell(x, valuesY, ratingWidth, valuesHeaderTwo, { fill: cream, stroke: line });
      setFont('bold', 4.1, ink);
      centeredText(String(q + 1), x, valuesY + valuesHeaderTwo / 2, ratingWidth, { inset: 0.2 });
    }
    valuesY += valuesHeaderTwo;

    const observedValues = [
      ['makaDiyos', '1. Maka-Diyos', [
        "Expresses one's spiritual beliefs while respecting the spiritual beliefs of others",
        'Demonstrates adherence to ethical principles by upholding truth'
      ]],
      ['makatao', '2. Makatao', [
        'Is sensitive to individual, social, and cultural differences',
        'Demonstrates contributions toward solidarity'
      ]],
      ['makakalikasan', '3. Maka-kalikasan', [
        'Cares for the environment and utilizes resources wisely, judiciously, and economically',
        'Demonstrates stewardship in keeping a flourishing environment'
      ]],
      ['makabansa', '4. Makabansa', [
        'Demonstrates pride in being a Filipino; expresses the rights and responsibilities of a Filipino citizen',
        'Demonstrates appropriate behavior in carrying out activities in the school, community, and country'
      ]]
    ];
    observedValues.forEach(function (entry) {
      const groupHeight = valuesRowHeight * 2;
      const groupTop = valuesY;
      cell(left, groupTop, coreWidth, groupHeight, { stroke: line });
      const ratings = student.observedValues && student.observedValues[entry[0]] || {};
      setFont('normal', 4.1, ink);
      centeredText(entry[1], left, groupTop + groupHeight / 2, coreWidth, { inset: 0.6 });
      entry[2].forEach(function (statement, statementIndex) {
        const rowY = groupTop + statementIndex * valuesRowHeight;
        cell(left + coreWidth, rowY, statementWidth, valuesRowHeight, { stroke: line });
        setFont('normal', 4.1, ink);
        leftText(statement, left + coreWidth, rowY + valuesRowHeight / 2, statementWidth,
          { inset: 0.9 });
        for (let q = 0; q < 4; q += 1) {
          const x = left + coreWidth + statementWidth + q * ratingWidth;
          cell(x, rowY, ratingWidth, valuesRowHeight, { stroke: line });
          setFont('bold', 4.6, ink);
          centeredText(ratings['q' + (q + 1)] || '-', x, rowY + valuesRowHeight / 2,
            ratingWidth, { inset: 0.2 });
        }
      });
      valuesY += groupHeight;
    });

    /* ---------- Semester grade tables ---------- */
    function semesterAverage(semester) {
      const subjectKeys = semester.groups.reduce(function (all, group) {
        return all.concat(group.subjects.map(function (item) { return item[0]; }));
      }, []);
      const scores = subjectKeys.map(function (key) {
        return (student.grades[key] || {}).final;
      });
      if (scores.some(function (score) {
        return score === null || score === undefined || score === '' || Number.isNaN(Number(score));
      })) return '-';
      return String(Math.round(scores.reduce(function (sum, score) {
        return sum + Number(score);
      }, 0) / scores.length));
    }

    function gradeValue(value) {
      return value === null || value === undefined || value === '' || Number.isNaN(Number(value))
        ? '-' : String(value);
    }

    function drawSemester(semester, top, bottom) {
      const headingHeight = 3.2;
      setFont('bold', 7.4, ink);
      doc.setFont('times', 'bold');
      doc.setFontSize(S(7.4));
      setTextColor(doc, ink);
      doc.text(pdfSafe(semester.label), X(rightX + rightWidth / 2), Y(top + headingHeight * 0.55),
        { align: 'center', baseline: 'middle' });

      const tableTop = top + headingHeight + 0.8;
      const tableHeight = bottom - tableTop;
      const headerOne = 4.6;
      const headerTwo = 3.4;
      const groupHeight = 3.8;
      const averageHeight = 5.0;
      const subjectHeight = (tableHeight - headerOne - headerTwo -
        semester.groups.length * groupHeight - averageHeight) /
        semester.groups.reduce(function (sum, group) { return sum + group.subjects.length; }, 0);
      const subjectWidth = rightWidth * 0.47;
      const scoreWidth = rightWidth * 0.175;
      const finalWidth = rightWidth - subjectWidth - scoreWidth * 2;
      const scoresX = rightX + subjectWidth;
      const finalX = scoresX + scoreWidth * 2;

      cell(rightX, tableTop, rightWidth, tableHeight, { stroke: [55, 52, 46], lineWidth: 0.4 });
      // Header: Subjects, Quarter (two columns), Semester Final Grade.
      cell(rightX, tableTop, subjectWidth, headerOne + headerTwo,
        { fill: tan, stroke: line, lineWidth: 0.3 });
      cell(scoresX, tableTop, scoreWidth * 2, headerOne,
        { fill: tan, stroke: line, lineWidth: 0.3 });
      cell(finalX, tableTop, finalWidth, headerOne + headerTwo,
        { fill: tan, stroke: line, lineWidth: 0.3 });
      cell(scoresX, tableTop + headerOne, scoreWidth, headerTwo,
        { fill: tan, stroke: line, lineWidth: 0.3 });
      cell(scoresX + scoreWidth, tableTop + headerOne, scoreWidth, headerTwo,
        { fill: tan, stroke: line, lineWidth: 0.3 });
      setFont('bold', 4.8, ink);
      leftText('Subjects', rightX, tableTop + (headerOne + headerTwo) / 2, subjectWidth,
        { inset: 1.0 });
      centeredText('Quarter', scoresX, tableTop + headerOne / 2, scoreWidth * 2, { inset: 0.4 });
      setFont('bold', 4.2, ink);
      centeredText('Semester', finalX, tableTop + headerOne / 2 + 0.4, finalWidth, { inset: 0.3 });
      centeredText('Final Grade', finalX, tableTop + headerOne / 2 + 2.1, finalWidth, { inset: 0.3 });
      setFont('bold', 4.8, ink);
      semester.quarterLabels.forEach(function (label, index) {
        centeredText(label, scoresX + index * scoreWidth, tableTop + headerOne + headerTwo / 2,
          scoreWidth, { inset: 0.2 });
      });

      let rowY = tableTop + headerOne + headerTwo;
      semester.groups.forEach(function (group) {
        cell(rightX, rowY, rightWidth, groupHeight, { fill: tan, stroke: line, lineWidth: 0.3 });
        setFont('bold', 4.4, ink);
        leftText(group.name, rightX, rowY + groupHeight / 2, rightWidth, { inset: 1.0 });
        rowY += groupHeight;
        group.subjects.forEach(function (item) {
          const subject = GF.SUBJECTS.find(function (entry) { return entry.key === item[0]; });
          const grades = student.grades[subject.key] || {};
          cell(rightX, rowY, subjectWidth, subjectHeight, { stroke: line });
          cell(scoresX, rowY, scoreWidth, subjectHeight, { stroke: line });
          cell(scoresX + scoreWidth, rowY, scoreWidth, subjectHeight, { stroke: line });
          cell(finalX, rowY, finalWidth, subjectHeight, { stroke: line });
          const subjectSize = fitFont(subject.name, 'normal', 4.6, subjectWidth - 2.2);
          setFont('normal', subjectSize, ink);
          leftText(subject.name, rightX, rowY + subjectHeight / 2, subjectWidth, { inset: 1.1 });
          [semester.quarters[0], semester.quarters[1], semester.finalKey].forEach(function (period, index) {
            const x = index < 2 ? scoresX + index * scoreWidth : finalX;
            const cellWidth = index < 2 ? scoreWidth : finalWidth;
            setFont(index === 2 ? 'bold' : 'normal', 4.8, ink);
            centeredText(gradeValue(grades[period]), x, rowY + subjectHeight / 2, cellWidth,
              { inset: 0.3 });
          });
          rowY += subjectHeight;
        });
      });

      cell(rightX, rowY, subjectWidth + scoreWidth * 2, averageHeight,
        { fill: cream, stroke: line, lineWidth: 0.3 });
      cell(finalX, rowY, finalWidth, averageHeight,
        { fill: cream, stroke: line, lineWidth: 0.3 });
      setFont('bold', 4.8, ink);
      leftText('General Average for the Semester', rightX,
        rowY + averageHeight / 2, subjectWidth + scoreWidth * 2, { inset: 1.0 });
      centeredText(semesterAverage(semester), finalX, rowY + averageHeight / 2, finalWidth,
        { inset: 0.3 });
    }

    drawSemester(GF.SEMESTERS[0], 27.0, 105.0);
    drawSemester(GF.SEMESTERS[1], 107.4, 184.4);

    /* ---------- Joined legend strip ---------- */
    const legendTop = 186.0;
    const legendHeight = bodyBottom - legendTop;
    const legendGap = 0;
    const firstLegendWidth = rightWidth * (0.9 / 3.7);
    const middleLegendWidth = rightWidth * (1.9 / 3.7);
    const lastLegendWidth = rightWidth - firstLegendWidth - middleLegendWidth;
    const captionHeight = 4.0;

    function legendPanel(x, width, title, rows, columns) {
      const rowHeight = (legendHeight - captionHeight) / rows.length;
      cell(x, legendTop, width, legendHeight, { stroke: [55, 52, 46], lineWidth: 0.35 });
      cell(x, legendTop, width, captionHeight, { fill: tan, stroke: line, lineWidth: 0.3 });
      setFont('bold', 4.1, ink);
      centeredText(title, x, legendTop + captionHeight / 2, width, { inset: 0.4 });
      const columnWidths = columns || [width];
      rows.forEach(function (row, rowIndex) {
        const rowY = legendTop + captionHeight + rowIndex * rowHeight;
        let columnX = x;
        row.forEach(function (value, columnIndex) {
          const cellWidth = columnWidths[columnIndex] || width;
          if (columnIndex > 0) {
            setDrawColor(doc, line);
            doc.setLineWidth(S(0.22));
            doc.line(X(columnX), Y(rowY), X(columnX), Y(rowY + rowHeight));
          }
          if (rowIndex > 0) {
            doc.line(X(columnX), Y(rowY), X(columnX + cellWidth), Y(rowY));
          }
          setFont(columnIndex === 0 ? 'bold' : 'normal', 3.9, ink);
          leftText(value, columnX, rowY + rowHeight / 2, cellWidth, { inset: 0.7 });
          columnX += cellWidth;
        });
      });
    }

    const middleColumnWidths = [
      middleLegendWidth * 0.55,
      middleLegendWidth * 0.2,
      middleLegendWidth * 0.25
    ];
    const lastColumnWidths = [lastLegendWidth * 0.44, lastLegendWidth * 0.56];
    legendPanel(rightX, firstLegendWidth, 'Observed Values', [
      ['AO', 'Always Observed'],
      ['SO', 'Sometimes Observed'],
      ['RO', 'Rarely Observed'],
      ['NO', 'Not Observed']
    ], [firstLegendWidth * 0.3, firstLegendWidth * 0.7]);
    legendPanel(rightX + firstLegendWidth + legendGap, middleLegendWidth,
      'Learning Progress & Achievement', [
        ['Outstanding', '90-100', 'Passed'],
        ['Very Satisfactory', '85-89', 'Passed'],
        ['Satisfactory', '80-84', 'Passed'],
        ['Fairly Satisfactory', '75-79', 'Passed'],
        ['Did Not Meet Expectations', 'below 75', 'Failed']
      ], middleColumnWidths);
    legendPanel(rightX + firstLegendWidth + middleLegendWidth + legendGap * 2,
      lastLegendWidth, 'Parent/Guardian\'s Signature', [
        ['1st Q', ''],
        ['2nd Q', ''],
        ['3rd Q', ''],
        ['4th Q', '']
      ], lastColumnWidths);
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

  async function downloadReports(reports, options) {
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
    let logoData;
    try {
      logoData = await loadLogoData();
    } catch (error) {
      GF.showToast('The University of Iloilo logo could not be prepared for the PDF. ' + error.message, 'error');
      return;
    }
    const doc = createDocument(pdfSafe(title));
    if (!doc) {
      GF.showToast('PDF support did not load. Reload the page and try again.', 'error');
      return;
    }

    reports.forEach(function (student, index) {
      if (index > 0) doc.addPage();
      drawFront(doc, student, dataset.context, logoData);
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
        window.GradeFlowReports.buildFrontHTML(student, dataset.context) + '</article></div>';
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
