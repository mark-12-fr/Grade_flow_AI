/* ==========================================================================
   AI Processing (local demo)
   The timeline and progress are a simulation. No external AI service is used.
   ========================================================================== */
(function () {
  'use strict';

  const GF = window.GradeFlow;
  let timer = null;
  let runToken = 0;

  function currentStage(progress) {
    if (progress >= 100) return 5;
    return Math.min(4, Math.floor(progress / 20));
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function completionStatus(progress, index) {
    if (progress >= 100 || progress >= (index + 1) * 20) return 'done';
    if (index === currentStage(progress)) return 'current';
    return 'pending';
  }

  function renderTimeline(progress) {
    document.querySelectorAll('#timeline .timeline-item').forEach(function (item, index) {
      const status = completionStatus(progress, index);
      item.classList.toggle('done', status === 'done');
      item.classList.toggle('current', status === 'current');
      const label = item.querySelector('.timeline-status');
      if (label) label.textContent = status === 'done' ? 'Complete' : status === 'current' ? 'In progress' : 'Up next';
    });
  }

  function stageCopy(progress) {
    const total = GF.state.students.length;
    const missing = GF.missingGradeCells().length;
    if (progress >= 100) {
      return {
        headline: 'Your reports are ready',
        subtitle: 'Every grade is ready for your final check.',
        count: 'All ' + total + ' student' + (total === 1 ? '' : 's') + ' record' + (total === 1 ? '' : 's') + ' prepared',
        eta: 'Ready when you are. Review the grades next.'
      };
    }
    if (progress >= 80) {
      return {
        headline: 'Building your report card drafts',
        subtitle: 'Putting the final pages together for your review.',
        count: total + ' of ' + total + ' comment' + (total === 1 ? '' : 's') + ' prepared',
        eta: 'Almost there. About ' + Math.max(1, Math.ceil((100 - progress) / 20)) + ' seconds remaining.'
      };
    }
    if (progress >= 60) {
      const prepared = Math.min(total, Math.round(((progress - 60) / 20) * total));
      return {
        headline: 'Your reports are taking shape',
        subtitle: 'Writing thoughtful student comments...',
        count: prepared + ' of ' + total + ' comment' + (total === 1 ? '' : 's') + ' prepared',
        eta: 'About ' + Math.max(2, Math.ceil((100 - progress) / 20)) + ' seconds remaining. You don\'t need to do anything yet.'
      };
    }
    if (progress >= 40) {
      return {
        headline: 'Checking every grade',
        subtitle: missing
          ? missing + ' missing grade' + (missing === 1 ? ' was' : 's were') + ' flagged for your review.'
          : 'All grade values look complete.',
        count: 'Grades checked',
        eta: 'About ' + Math.max(2, Math.ceil((100 - progress) / 20)) + ' seconds remaining.'
      };
    }
    if (progress >= 20) {
      return {
        headline: 'Students and subjects found',
        subtitle: 'Validating names, roll numbers, and class details.',
        count: total + ' student' + (total === 1 ? '' : 's') + ' found',
        eta: 'About ' + Math.max(2, Math.ceil((100 - progress) / 20)) + ' seconds remaining.'
      };
    }
    return {
      headline: 'Your reports are taking shape',
      subtitle: 'Reading your grade sheet and matching the columns...',
      count: 'Reading the grade sheet',
      eta: 'This local demo takes a few seconds. Nothing is sent anywhere.'
    };
  }

  function renderProgress() {
    const progress = Math.max(0, Math.min(100, GF.state.progress || 0));
    const copy = stageCopy(progress);
    const ring = document.getElementById('progress-ring');
    const bar = document.getElementById('progress-bar');
    const track = document.getElementById('processing-progress');
    const percent = document.getElementById('progress-percent');
    const main = document.querySelector('.processing-main');
    const review = document.getElementById('review-grades-btn');
    const cancel = document.getElementById('cancel-processing-btn');

    if (ring) ring.style.setProperty('--progress', String(progress));
    if (bar) bar.style.width = progress + '%';
    if (track) track.setAttribute('aria-valuenow', String(progress));
    if (percent) percent.textContent = Math.round(progress) + '%';
    setText('processing-headline', copy.headline);
    setText('processing-subtitle', copy.subtitle);
    setText('processing-count', copy.count);
    setText('processing-eta', copy.eta);
    renderTimeline(progress);
    if (main) main.classList.toggle('is-running', GF.state.processing);
    if (review) review.disabled = !(GF.state.processed && progress >= 100);
    if (cancel) cancel.textContent = GF.state.processed ? 'Back to upload' : 'Cancel processing';
  }

  function renderPage() {
    renderProgress();
  }

  function stopTimer() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function finishProcessing(token) {
    if (token !== runToken) return;
    stopTimer();
    GF.state.processing = false;
    GF.state.progress = 100;
    GF.state.processed = true;
    renderPage();
    GF.refreshChrome();
    GF.showToast('Draft ready. Review every grade before generating reports.');
  }

  function startProcessing() {
    if (GF.state.processing) return;
    if (!GF.state.students.length) {
      GF.showToast('Add a grade sheet before processing.', 'error');
      return;
    }
    stopTimer();
    runToken += 1;
    const token = runToken;
    GF.state.processing = true;
    GF.state.processed = false;
    GF.state.progress = 0;
    GF.state.generated = false;
    GF.state.generatedAt = null;

    renderPage();
    GF.renderNotifications();

    timer = window.setInterval(function () {
      if (token !== runToken) return;
      if (!GF.state.processing) {
        stopTimer();
        return;
      }
      GF.state.progress = Math.min(100, GF.state.progress + 4);
      if (GF.state.progress >= 100) {
        finishProcessing(token);
      } else {
        renderProgress();
      }
    }, 150);
  }

  function cancelProcessing() {
    const stop = function () {
      runToken += 1;
      stopTimer();
      GF.state.processing = false;
      GF.state.progress = 0;
      renderPage();
      GF.showToast('Processing stopped. Your file is still ready to use.', 'info');
      GF.navigateTo('upload');
    };

    if (GF.state.processing) {
      GF.openModal({
        title: 'Stop processing?',
        body: '<p>You can start again from the upload screen. Your grade sheet will not be changed.</p>',
        confirmLabel: 'Stop processing',
        cancelLabel: 'Keep going',
        tone: 'danger',
        onConfirm: stop
      });
      return;
    }
    GF.navigateTo('upload');
  }

  function bindEvents() {
    const review = document.getElementById('review-grades-btn');
    const cancel = document.getElementById('cancel-processing-btn');

    if (review) {
      review.addEventListener('click', function () {
        if (!GF.state.processed) {
          GF.showToast('Processing is still running.', 'info');
          return;
        }
        GF.navigateTo('verification');
      });
    }
    if (cancel) cancel.addEventListener('click', cancelProcessing);
  }

  GF.registerPage('processing', function () {
    renderPage();
    if (!GF.state.processing && !GF.state.processed) {
      // Opening this screen directly still gives the demo something useful to show.
      window.setTimeout(function () {
        if (GF.state.currentPage === 'processing' && !GF.state.processing && !GF.state.processed) {
          startProcessing();
        }
      }, 180);
    }
  });

  window.GradeFlowProcessing = {
    start: startProcessing,
    cancel: cancelProcessing,
    render: renderPage
  };

  document.addEventListener('DOMContentLoaded', bindEvents);
})();
