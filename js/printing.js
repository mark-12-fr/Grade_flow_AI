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

  function drawHeader(doc, context, isBack, width, margin, top, logoData) {
    doc.addImage(logoData, 'PNG', margin, top, 9, 10.24);

    doc.setFontSize(10.5);
    setTextColor(doc, COLORS.navy);
    doc.text(pdfSafe(context.schoolName.toUpperCase()), margin + 13, top + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    setTextColor(doc, COLORS.light);
    const addressLines = doc.splitTextToSize(pdfSafe(context.schoolAddress), width * 0.43);
    doc.text(addressLines.slice(0, 2), margin + 13, top + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    setTextColor(doc, COLORS.muted);
    const documentTitle = isBack ? 'LEARNER PROGRESS AND OBSERVED VALUES' : 'REPORT ON LEARNING PROGRESS AND ACHIEVEMENT';
    const titleLines = doc.splitTextToSize(documentTitle, width * 0.41);
    doc.text(titleLines, width - margin, top + 3.2, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    setTextColor(doc, COLORS.light);
    doc.text('School Year ' + pdfSafe(GF.prettyYear(context.year)), width - margin, top + (titleLines.length > 1 ? 12 : 8.5), { align: 'right' });

    setDrawColor(doc, COLORS.border);
    doc.setLineWidth(0.5);
    const headerBottom = top + Math.max(addressLines.length > 1 ? 17 : 12.5, titleLines.length > 1 ? 16.5 : 12.5);
    doc.line(margin, headerBottom, width - margin, headerBottom);

    return headerBottom;
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

  function drawFront(doc, student, context, logoData) {
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const margin = Math.max(12.7, width * 0.043);
    const contentWidth = width - margin * 2;
    const top = Math.max(12.7, height * 0.06);
    const headerBottom = drawHeader(doc, context, false, width, margin, top, logoData);
    const bodyY = headerBottom + 5;
    const columnGap = contentWidth * 0.02;
    const leftWidth = contentWidth * 0.47;
    const rightWidth = contentWidth - columnGap - leftWidth;
    const rightX = margin + leftWidth + columnGap;
    const comment = "This report card shows your child's performance in the different learning areas as well as in character formation. The school welcomes you if you desire to know more about the progress of your child.";
    const tan = [200, 192, 160];
    const grid = [92, 88, 72];

    function drawCell(x, y, cellWidth, cellHeight, fill) {
      setDrawColor(doc, grid);
      if (fill) setFillColor(doc, tan);
      doc.setLineWidth(0.25);
      doc.rect(x, y, cellWidth, cellHeight, fill ? 'FD' : 'S');
    }

    function drawField(label, value, x, y, fieldWidth, fieldHeight) {
      drawCell(x, y, fieldWidth, fieldHeight, false);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4.7);
      setTextColor(doc, COLORS.muted);
      doc.text(pdfSafe(label), x + 1.3, y + 2.4);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.1);
      setTextColor(doc, COLORS.navy);
      doc.text(pdfSafe(value || '-'), x + 1.3, y + fieldHeight - 1.5, { maxWidth: fieldWidth - 2.6 });
    }

    function sectionHeading(text, x, y, sectionWidth, fontSize, headingHeight) {
      const height = headingHeight || 5.2;
      drawCell(x, y, sectionWidth, height, true);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fontSize || 5.7);
      setTextColor(doc, COLORS.navy);
      doc.text(pdfSafe(text), x + 1.5, y + height * 0.7);
    }

    function gradeValue(value) {
      return value === null || value === undefined || value === '' || Number.isNaN(Number(value))
        ? '-' : pdfSafe(String(value));
    }

    let leftY = bodyY;
    const fieldY = leftY;
    const fieldHeight = 6.7;
    drawField('NAME', student.name, margin, fieldY, leftWidth, fieldHeight);
    const details = [
      ['AGE', student.age],
      ['SEX', student.sex],
      ['GRADE', context.gradeLevel],
      ['SECTION', context.section],
      ['SCHOOL YEAR', GF.prettyYear(context.year)],
      ['LRN', student.lrn],
      ['STATUS', context.studentStatus],
      ['GRADUATION STATUS', context.graduationStatus]
    ];
    const halfWidth = leftWidth / 2;
    const detailsY = fieldY + fieldHeight;
    details.forEach(function (item, index) {
      drawField(item[0], item[1], margin + (index % 2) * halfWidth,
        detailsY + Math.floor(index / 2) * fieldHeight, halfWidth, fieldHeight);
    });
    const trackY = detailsY + Math.ceil(details.length / 2) * fieldHeight;
    drawField('TRACK/STRAND', context.trackStrand || context.strand, margin, trackY, leftWidth, fieldHeight);
    leftY = trackY + fieldHeight + 1.5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.6);
    setTextColor(doc, COLORS.navy);
    doc.text('Dear Parent:', margin, leftY + 2.4);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(5.3);
    setTextColor(doc, COLORS.muted);
    const commentLines = doc.splitTextToSize(pdfSafe(comment), leftWidth - 2).slice(0, 2);
    doc.text(commentLines, margin, leftY + 5.2);
    leftY += 7 + commentLines.length * 2.5;

    const signatureWidth = (leftWidth - 8) / 2;
    [
      [context.teacher, 'Adviser'],
      [context.principal, 'Principal']
    ].forEach(function (signature, index) {
      const x = margin + index * (signatureWidth + 8);
      setDrawColor(doc, grid);
      doc.setLineWidth(0.25);
      doc.line(x, leftY + 12, x + signatureWidth, leftY + 12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.4);
      setTextColor(doc, COLORS.navy);
      doc.text(pdfSafe(signature[0]), x + signatureWidth / 2, leftY + 9.8, { align: 'center', maxWidth: signatureWidth });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4.9);
      setTextColor(doc, COLORS.muted);
      doc.text(signature[1], x + signatureWidth / 2, leftY + 14, { align: 'center' });
    });
    leftY += 17;

    const transfer = student.transfer || {};
    const transferFields = [
      ['Certificate of Transfer', transfer.certificateOfTransfer],
      ['Cancellation of Eligibility', transfer.cancellationOfEligibility],
      ['Admitted to', transfer.admittedTo],
      ['Admitted in', transfer.admittedIn],
      ['Eligibility for Grade', transfer.eligibilityForGrade],
      ['Date', transfer.transferDate],
      ['Approved by', transfer.approvedBy]
    ];
    sectionHeading('CERTIFICATE OF TRANSFER / CANCELLATION OF ELIGIBILITY TO TRANSFER', margin, leftY, leftWidth);
    leftY += 5.2;
    const transferCellWidth = leftWidth / 2;
    transferFields.forEach(function (field, index) {
      const x = margin + (index % 2) * transferCellWidth;
      const y = leftY + Math.floor(index / 2) * 6;
      drawCell(x, y, transferCellWidth, 6, false);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4.2);
      setTextColor(doc, COLORS.muted);
      doc.text(pdfSafe(field[0]), x + 1, y + 2.1, { maxWidth: transferCellWidth - 2 });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.2);
      setTextColor(doc, COLORS.navy);
      doc.text(pdfSafe(field[1] || ''), x + 1, y + 5.1, { maxWidth: transferCellWidth - 2 });
    });
    leftY += Math.ceil(transferFields.length / 2) * 6 + 2;

    const attendance = student.attendance || {};
    sectionHeading('REPORT OF ATTENDANCE', margin, leftY, leftWidth, 6.5, 5.8);
    leftY += 5.8;
    const labelWidth = leftWidth * 0.22;
    const monthWidth = (leftWidth - labelWidth) / (GF.ATTENDANCE_MONTHS.length + 1);
    const attendanceHeader = [''].concat(GF.ATTENDANCE_MONTHS.map(function (month) { return month.label; }), ['TOTAL']);
    const attendanceRows = [
      ['No. of school days', attendance.schoolDays || {}],
      ['No. of days present', attendance.months || {}],
      ['No. of days absent', attendance.absent || {}]
    ];
    const attendanceRowHeight = 4.5;
    attendanceHeader.forEach(function (label, index) {
      const x = index === 0 ? margin : margin + labelWidth + (index - 1) * monthWidth;
      const cellWidth = index === 0 ? labelWidth : monthWidth;
      drawCell(x, leftY, cellWidth, attendanceRowHeight, true);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.1);
      setTextColor(doc, COLORS.navy);
      doc.text(label, x + cellWidth / 2, leftY + 3.5, { align: 'center', maxWidth: cellWidth - 0.5 });
    });
    attendanceRows.forEach(function (row, rowIndex) {
      const y = leftY + attendanceRowHeight * (rowIndex + 1);
      drawCell(margin, y, labelWidth, attendanceRowHeight, false);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4.8);
      setTextColor(doc, COLORS.muted);
      doc.text(pdfSafe(row[0]), margin + 1, y + 3.4, { maxWidth: labelWidth - 2 });
      let totalValue = 0;
      let hasValue = false;
      GF.ATTENDANCE_MONTHS.forEach(function (month, monthIndex) {
        const value = row[1][month.key];
        const x = margin + labelWidth + monthIndex * monthWidth;
        drawCell(x, y, monthWidth, attendanceRowHeight, false);
        doc.setFontSize(5);
        const shown = value == null || value === '' ? '' : String(value);
        if (shown) {
          totalValue += Number(value) || 0;
          hasValue = true;
        }
        doc.text(pdfSafe(shown), x + monthWidth / 2, y + 3.4, { align: 'center' });
      });
      const totalX = margin + labelWidth + GF.ATTENDANCE_MONTHS.length * monthWidth;
      drawCell(totalX, y, monthWidth, attendanceRowHeight, false);
      doc.setFont('helvetica', 'bold');
      doc.text(hasValue ? String(totalValue) : '', totalX + monthWidth / 2, y + 3.4, { align: 'center' });
    });
    leftY += attendanceRowHeight * 4 + 1.5;

    sectionHeading("REPORT ON LEARNER'S OBSERVED VALUES", margin, leftY, leftWidth, 6.5, 5.8);
    leftY += 5.8;
    const values = [
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
        'Demonstrates pride in being a Filipino and knows the rights and responsibilities of a Filipino citizen',
        'Demonstrates appropriate behavior in carrying out activities in the school, community, and country'
      ]]
    ];
    const descriptorWidth = leftWidth * 0.49;
    const valueNameWidth = leftWidth * 0.18;
    const ratingWidth = (leftWidth - valueNameWidth - descriptorWidth) / 4;
    const statementY = leftY;
    drawCell(margin, statementY, valueNameWidth, 5.5, true);
    drawCell(margin + valueNameWidth, statementY, descriptorWidth, 5.5, true);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.1);
    setTextColor(doc, COLORS.navy);
    doc.text('CORE VALUES', margin + valueNameWidth / 2, statementY + 3.7, { align: 'center' });
    doc.text('BEHAVIOR STATEMENTS', margin + valueNameWidth + descriptorWidth / 2, statementY + 3.7, { align: 'center' });
    ['1', '2', '3', '4'].forEach(function (label, index) {
      const x = margin + valueNameWidth + descriptorWidth + index * ratingWidth;
      drawCell(x, statementY, ratingWidth, 5.5, true);
      doc.text(label, x + ratingWidth / 2, statementY + 3.7, { align: 'center' });
    });
    const behaviorRowHeight = ratingWidth * 0.48;
    values.forEach(function (entry, valueIndex) {
      const groupY = statementY + 5.5 + valueIndex * behaviorRowHeight * 2;
      drawCell(margin, groupY, valueNameWidth, behaviorRowHeight * 2, false);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4.8);
      setTextColor(doc, COLORS.muted);
      doc.text(pdfSafe(entry[1]), margin + 1, groupY + behaviorRowHeight, {
        maxWidth: valueNameWidth - 2
      });
      const observations = student.observedValues && student.observedValues[entry[0]] || {};
      entry[2].forEach(function (statement, statementIndex) {
        const rowY = groupY + statementIndex * behaviorRowHeight;
        const statementX = margin + valueNameWidth;
        drawCell(statementX, rowY, descriptorWidth, behaviorRowHeight, false);
        doc.setFontSize(4.2);
        doc.text(pdfSafe(statement), statementX + 0.8, rowY + behaviorRowHeight * 0.72, {
          maxWidth: descriptorWidth - 1.6
        });
        if (statementIndex === 0) {
          ['q1', 'q2', 'q3', 'q4'].forEach(function (period, index) {
            const x = statementX + descriptorWidth + index * ratingWidth;
            drawCell(x, rowY, ratingWidth, behaviorRowHeight, false);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(4.8);
            setTextColor(doc, COLORS.navy);
            doc.text(pdfSafe(observations[period] || ''), x + ratingWidth / 2, rowY + behaviorRowHeight * 0.72, {
              align: 'center'
            });
          });
        } else {
          ['q1', 'q2', 'q3', 'q4'].forEach(function (_, index) {
            const x = statementX + descriptorWidth + index * ratingWidth;
            drawCell(x, rowY, ratingWidth, behaviorRowHeight, false);
          });
        }
      });
    });

    const columnAverage = function (semester) {
      const semesterSubjects = semester.groups.reduce(function (all, group) {
        return all.concat(group.subjects.map(function (entry) {
          return GF.SUBJECTS.find(function (subject) { return subject.key === entry[0]; });
        }));
      }, []);
      const scores = semesterSubjects.map(function (subject) { return (student.grades[subject.key] || {}).final; });
      if (scores.some(function (score) { return score == null || score === '' || Number.isNaN(Number(score)); })) return '-';
      return String(Math.round(scores.reduce(function (sum, score) { return sum + Number(score); }, 0) / scores.length));
    };

    let rightY = bodyY;
    GF.SEMESTERS.forEach(function (semester) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.3);
      setTextColor(doc, COLORS.navy);
      doc.text(pdfSafe(semester.label), rightX, rightY + 3);
      rightY += 4;
      const subjectWidth = rightWidth * 0.67;
      const scoreWidth = (rightWidth - subjectWidth) / 3;
      const header1 = 3.5;
      const header2 = 3.5;
      drawCell(rightX, rightY, subjectWidth, header1 + header2, true);
      drawCell(rightX + subjectWidth, rightY, scoreWidth * 2, header1, true);
      drawCell(rightX + subjectWidth + scoreWidth * 2, rightY, scoreWidth, header1 + header2, true);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.8);
      setTextColor(doc, COLORS.navy);
      doc.text('Subjects', rightX + 1.5, rightY + 5);
      doc.text('Quarter', rightX + subjectWidth + scoreWidth, rightY + 2.8, { align: 'center' });
      doc.text('Semester Final Grade', rightX + subjectWidth + scoreWidth * 2 + scoreWidth / 2, rightY + 3.3, {
        align: 'center', maxWidth: scoreWidth - 0.5
      });
      semester.quarterLabels.forEach(function (label, index) {
        const x = rightX + subjectWidth + scoreWidth * index;
        drawCell(x, rightY + header1, scoreWidth, header2, true);
        doc.text(label, x + scoreWidth / 2, rightY + header1 + 2.8, { align: 'center' });
      });
      rightY += header1 + header2;

      semester.groups.forEach(function (group) {
        const groupHeight = 3.7;
        drawCell(rightX, rightY, rightWidth, groupHeight, true);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(4.5);
        doc.text(pdfSafe(group.name), rightX + 1.5, rightY + 2.8);
        rightY += groupHeight;
        group.subjects.forEach(function (subjectDefinition) {
          const subject = GF.SUBJECTS.find(function (entry) { return entry.key === subjectDefinition[0]; });
          const grades = student.grades[subject.key] || {};
          const rowHeight = 4.1;
          drawCell(rightX, rightY, subjectWidth, rowHeight, false);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(4.5);
          setTextColor(doc, COLORS.muted);
          doc.text(pdfSafe(subject.name), rightX + 1.5, rightY + 3, { maxWidth: subjectWidth - 3 });
          semester.quarters.concat(semester.finalKey).forEach(function (period, index) {
            const x = rightX + subjectWidth + scoreWidth * index;
            drawCell(x, rightY, scoreWidth, rowHeight, false);
            doc.setFont('helvetica', index === 2 ? 'bold' : 'normal');
            setTextColor(doc, COLORS.navy);
            doc.text(gradeValue(grades[period]), x + scoreWidth / 2, rightY + 3, { align: 'center' });
          });
          rightY += rowHeight;
        });
      });

      const average = columnAverage(semester);
      drawCell(rightX, rightY, subjectWidth + scoreWidth * 2, 5, true);
      drawCell(rightX + subjectWidth + scoreWidth * 2, rightY, scoreWidth, 5, true);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.8);
      setTextColor(doc, COLORS.navy);
      doc.text('General Average for the Semester', rightX + 1.5, rightY + 3.4);
      doc.text(average, rightX + rightWidth - scoreWidth / 2, rightY + 3.4, { align: 'center' });
      rightY += 5.5;
    });

    const legendGap = 2;
    const legendWidths = [
      rightWidth * 0.25,
      rightWidth * 0.5,
      rightWidth * 0.25 - legendGap * 2
    ];
    const legends = [
      {
        title: 'Observed Values',
        rows: [['AO', 'Always Observed'], ['SO', 'Sometimes Observed'], ['RO', 'Rarely Observed'], ['NO', 'Not Observed']]
      },
      {
        title: 'Learning Progress & Achievement',
        rows: [
          ['Outstanding', '90-100', 'Passed'],
          ['Very Satisfactory', '85-89', 'Passed'],
          ['Satisfactory', '80-84', 'Passed'],
          ['Fairly Satisfactory', '75-79', 'Passed'],
          ['Did Not Meet Expectations', 'below 75', 'Failed']
        ]
      },
      {
        title: "Parent/Guardian's Signature",
        rows: [['1st Q', ''], ['2nd Q', ''], ['3rd Q', ''], ['4th Q', '']]
      }
    ];
    let legendX = rightX;
    legends.forEach(function (legend, legendIndex) {
      const legendWidth = legendWidths[legendIndex];
      drawCell(legendX, rightY, legendWidth, 6, true);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.4);
      setTextColor(doc, COLORS.navy);
      const titleLines = doc.splitTextToSize(legend.title, legendWidth - 2);
      doc.text(titleLines.slice(0, 2), legendX + legendWidth / 2, rightY + 2.5, { align: 'center' });
      let rowY = rightY + 6;
      legend.rows.forEach(function (row) {
        const rowHeight = 3.8;
        drawCell(legendX, rowY, legendWidth, rowHeight, false);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(4);
        setTextColor(doc, COLORS.muted);
        if (legendIndex === 0) {
          doc.setFont('helvetica', 'bold');
          doc.text(row[0], legendX + 1, rowY + 2.8);
          doc.setFont('helvetica', 'normal');
          doc.text(row[1], legendX + 7, rowY + 2.8, { maxWidth: legendWidth - 8 });
        } else if (legendIndex === 1) {
          doc.text(row.join('   '), legendX + 1, rowY + 2.8, { maxWidth: legendWidth - 2 });
        } else {
          doc.setFont('helvetica', 'bold');
          doc.text(row[0], legendX + 1, rowY + 2.8);
        }
        rowY += rowHeight;
      });
      legendX += legendWidth + legendGap;
    });

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
