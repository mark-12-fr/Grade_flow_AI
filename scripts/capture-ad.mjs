#!/usr/bin/env node
/**
 * Films the real GradeFlow AI app for the 45-second ad (public/reel/ad.html): the SF9 learner list,
 * picking a learner (the page scrolls and the learner bar sticks), the "Fill in missing details" panel
 * closed and open (the reel replays the app's own open transition between them), filling in the
 * highlighted blank grades one key at a time, the editable Front/Back preview, the SF10 record, the
 * Download PDF toast and the downloaded SF9 and SF10 PDFs.
 *
 * Output: public/reel/shots-ad/ (WebP + manifest.js as window.REEL_SHOTS_AD).
 *   npm run build && npm run reel:capture-ad
 *
 * The app runs with no AI key and reads samples/template_class.xlsx (fictional learners) with the
 * built-in template reader, so no learner data leaves this machine. Needs Playwright, ffmpeg, pdftoppm.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageKit, requireTools, shotsFolder, startApp } from './lib/capture-kit.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE = path.join(root, 'samples', 'template_class.xlsx');
const VIEW = { width: 1200, height: 1560 }; // a portrait browser window, so the vertical ad shows whole pages
const DPR = 2;
const LEARNER = { lrn: '108915240148', name: 'Dela Rosa, Mika Ella' }; // has one blank grade (see make_template_class.py)
// what the teacher types into the blank quarter 4 and semester final: the final is the average of the two
// quarters (Q3 is 94 in the sample, so (94 + 88) / 2 = 91), as on a real SF9
const TYPED = ['88', '91'];

requireTools(root);
const manifest = { view: { ...VIEW, dpr: DPR }, learner: LEARNER, typed: TYPED, layout: {}, boxes: {}, frames: {}, scroll: {}, pdf: {} };
const folder = shotsFolder(path.join(root, 'public', 'reel', 'shots-ad'), 'REEL_SHOTS_AD', manifest);
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gf-capture-ad-'));
const app = await startApp(root, 3178);
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR, acceptDownloads: true, colorScheme: 'light', reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  const { wait, box, shot, dismissToast, settle, scrollTo, scrollY, scrollSettled } = pageKit(page, folder.save, VIEW);
  const viewBox = async (loc) => { const b = await box(loc); return { ...b, y: b.y - (await scrollY()) }; };
  const row = () => page.locator('.sf10-row', { hasText: LEARNER.name });
  const downloadBtn = () => page.locator('.sf10-actions').getByRole('button', { name: /Download PDF/ });

  /* ---------- upload the fictional class, open the SF9 page ---------- */
  await page.goto(`${app.base}/upload`);
  await page.setInputFiles('#file-upload', SAMPLE);
  await page.waitForSelector('#file-info', { timeout: 30000 });
  await dismissToast();
  await page.getByRole('button', { name: /Prepare reports/ }).click();
  await page.waitForSelector('.preview-bar');
  await dismissToast();
  await settle();
  manifest.layout = { sidebar: await box(page.locator('.sidebar')), topbar: await box(page.locator('.topbar')) };

  /* ---------- 1 · the learner list, then pick the learner: the page scrolls, the bar sticks ---------- */
  await shot('list');
  manifest.boxes.list = {
    row: await box(row()), list: await box(page.locator('.sf10-list')), bar: await box(page.locator('.preview-bar')),
    summary: await box(page.locator('details.sf10-edit summary')), download: await box(downloadBtn())
  };
  await row().locator('.sf10-row-main').click();
  manifest.scroll.picked = await scrollSettled();
  await dismissToast();
  await shot('picked-stuck');
  manifest.boxes.pickedStuck = { bar: await viewBox(page.locator('.preview-bar')) };
  await scrollTo(0);
  await settle(400);
  await shot('picked');
  await shot('picked-full', { fullPage: true });
  manifest.boxes.picked = { row: await box(row()), bar: await box(page.locator('.preview-bar')), summary: await box(page.locator('details.sf10-edit summary')) };

  /* ---------- 2 · Fill in missing details: closed ('picked') and open ----------
     The app opens the panel with a 0.35 s block-size + opacity transition on ::details-content; this
     headless Chromium opens it at once, so the reel replays that transition between the two captures. */
  await page.locator('details.sf10-edit summary').click();
  await settle();
  await shot('panel-open');
  await shot('panel-full', { fullPage: true });
  const blank = page.locator('.sf10-missing');
  manifest.boxes.panel = {
    body: await box(page.locator('.sf10-edit-body')), fields: await box(page.locator('.sf10-edit-grid')), bar: await box(page.locator('.preview-bar')),
    banner: await box(page.locator('.sf10-issues')), q4: await box(blank.nth(0)), fin: await box(blank.nth(1))
  };

  // the blank grades, highlighted on the editable page; the teacher types them in
  await scrollTo(manifest.boxes.panel.q4.y - 760);
  await settle(400);
  manifest.scroll.grades = await scrollY();
  await shot('miss');
  manifest.boxes.miss = { q4: await box(blank.nth(0)), fin: await box(blank.nth(1)), bar: await viewBox(page.locator('.preview-bar')) };
  manifest.frames.typing = [];
  for (const [i, value] of TYPED.entries()) {
    const cell = page.locator('.sf10-missing').first(); // after the first is filled, the next blank is first
    await cell.click();
    await wait(200);
    await shot(`type${i}-0`);
    for (let c = 1; c <= value.length; c++) {
      await page.keyboard.type(value[c - 1]);
      await wait(150);
      await shot(`type${i}-${c}`);
    }
    await page.keyboard.press('Enter');
    await settle(500);
    await shot(`type${i}-saved`);
    manifest.frames.typing.push({ cell: i, frames: [...Array(value.length + 1).keys()].map((c) => `type${i}-${c}`), saved: `type${i}-saved`, scroll: await scrollY() });
  }
  manifest.scroll.done = await scrollY();

  /* ---------- 3 · preview and edit: tap any value; Front and Back; then the SF10 record ---------- */
  const cellToHover = page.locator('.sf9-semester .sf10-ed').nth(6);
  await cellToHover.hover();
  await wait(300);
  await shot('hover');
  manifest.boxes.hover = { cell: await box(cellToHover), back: await box(page.getByRole('button', { name: 'Back Preview' })) };
  await page.getByRole('button', { name: 'Back Preview' }).click();
  await settle();
  await shot('back');
  manifest.scroll.back = await scrollY();

  await scrollTo(0);
  await page.locator('a.step-link[href="/sf10"]').click();
  await page.waitForSelector('.preview-bar');
  await settle();
  await shot('sf10-list');
  manifest.boxes.sf10list = { row: await box(row()), download: await box(downloadBtn()) };
  await row().locator('.sf10-row-main').click();
  manifest.scroll.sf10 = await scrollSettled();
  await shot('sf10-stuck');
  manifest.boxes.sf10Stuck = { bar: await viewBox(page.locator('.preview-bar')) };
  await scrollTo(0);
  await settle(400);
  await shot('sf10-top');
  await shot('sf10-full', { fullPage: true });
  manifest.boxes.sf10 = { row: await box(row()), bar: await box(page.locator('.preview-bar')), download: await box(downloadBtn()) };

  /* ---------- 4 · Download PDF ---------- */
  const [sf10Download] = await Promise.all([page.waitForEvent('download'), downloadBtn().click()]);
  await sf10Download.saveAs(path.join(tmp, 'sf10.pdf'));
  await page.waitForSelector('.toast.show');
  await wait(450);
  await shot('sf10-downloaded');
  manifest.boxes.sf10Downloaded = { toast: await box(page.locator('.toast.show')) };
  await dismissToast();
  await page.locator('a.step-link[href="/report-card"]').click();
  await page.waitForSelector('.preview-bar');
  await row().locator('.sf10-row-main').click();
  await scrollSettled();
  await scrollTo(0);
  const [sf9Download] = await Promise.all([page.waitForEvent('download'), downloadBtn().click()]);
  await sf9Download.saveAs(path.join(tmp, 'sf9.pdf'));
  manifest.pdf.sf9 = folder.pdf(path.join(tmp, 'sf9.pdf'), 'sf9pdf');
  manifest.pdf.sf10 = folder.pdf(path.join(tmp, 'sf10.pdf'), 'sf10pdf');

  const n = folder.write('scripts/capture-ad.mjs');
  console.log(`Captured ${n} images into public/reel/shots-ad (SF9 PDF pages: ${manifest.pdf.sf9.length}, SF10: ${manifest.pdf.sf10.length})`);
} finally {
  await browser.close();
  app.stop();
  folder.discard(); // nothing left after a successful write(); a failed run leaves the old captures as they were
  rmSync(tmp, { recursive: true, force: true });
}
