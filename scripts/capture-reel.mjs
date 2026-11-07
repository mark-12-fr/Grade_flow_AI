#!/usr/bin/env node
/**
 * Films the real GradeFlow AI app for the promo reel: screenshots of every state the reel shows,
 * the element positions it animates the cursor and camera to, and the real SF9 / SF10 PDFs the
 * app downloads, rendered to images. Output: public/reel/shots/ (WebP files + manifest.js).
 *
 * Re-run it whenever the UI changes and the reel picks up the new look:
 *   npm run build && npm run reel:capture
 *
 * The app is started with no AI key, so the built-in template reader reads
 * samples/template_class.xlsx (fictional learners) and no learner data leaves this machine.
 * Needs Playwright with Chromium, ffmpeg (WebP) and pdftoppm (poppler-utils).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'public', 'reel', 'shots');
const SAMPLE = path.join(root, 'samples', 'template_class.xlsx');
const VIEW = { width: 1680, height: 1050 };
const DPR = 2;
const PORT = 3177;
const BASE = `http://localhost:${PORT}`;
const LEARNER = { lrn: '108915240148', name: 'Dela Rosa, Mika Ella' };

for (const [tool, args] of [['ffmpeg', ['-version']], ['pdftoppm', ['-v']]]) {
  if (spawnSync(tool, args).error) { console.error(`${tool} is required (ffmpeg for WebP, pdftoppm from poppler-utils for the PDFs).`); process.exit(1); }
}
if (!existsSync(path.join(root, '.next', 'BUILD_ID'))) { console.error('Build the app first: npm run build'); process.exit(1); }
if (!existsSync(SAMPLE)) { console.error('Missing samples/template_class.xlsx: run python3 samples/make_template_class.py'); process.exit(1); }

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gf-capture-'));
const manifest = { view: { ...VIEW, dpr: DPR }, learner: LEARNER, layout: {}, shots: {}, boxes: {}, reading: [], typing: [], pdf: {} };

/** PNG buffer -> public/reel/shots/<name>.webp */
function saveWebp(name, png, meta) {
  const file = `${name}.webp`;
  const res = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'png_pipe', '-i', '-', '-c:v', 'libwebp', '-quality', '88', '-compression_level', '6', path.join(OUT, file)], { input: png });
  if (res.status !== 0) throw new Error(`WebP encode failed for ${name}: ${res.stderr}`);
  manifest.shots[name] = { file, ...meta };
}

const server = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(PORT)], {
  cwd: root, env: { ...process.env, AI_API_KEY: '', AI_REQUIRED: '', APP_ACCESS_CODE: '' }, stdio: ['ignore', 'ignore', 'inherit']
});
const browser = await chromium.launch();
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* not up yet */ }
    if (i > 60) throw new Error('The app did not start on port ' + PORT);
    await new Promise((r) => setTimeout(r, 500));
  }
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR, acceptDownloads: true, colorScheme: 'light', reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  const wait = (ms) => page.waitForTimeout(ms);

  /** Element box in page coordinates (CSS px), so it stays valid in full-page shots. */
  async function box(locator) {
    const b = await locator.first().boundingBox();
    if (!b) throw new Error(`No box for ${locator}`);
    const sy = await page.evaluate(() => window.scrollY);
    return { x: Math.round(b.x), y: Math.round(b.y + sy), w: Math.round(b.width), h: Math.round(b.height) };
  }
  async function shot(name, opts = {}) {
    const png = await page.screenshot({ type: 'png', ...opts });
    const size = opts.clip ? { w: opts.clip.width, h: opts.clip.height } : opts.fullPage
      ? await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })) : { w: VIEW.width, h: VIEW.height };
    saveWebp(name, png, { ...size, ...(opts.clip ? { x: opts.clip.x, y: opts.clip.y } : {}) });
  }
  async function dismissToast() {
    const close = page.locator('.toast.show .toast-close');
    if (await close.count()) { await close.click(); await wait(500); }
  }
  async function settle() { await page.evaluate(() => document.fonts.ready); await wait(700); }

  /* ---------- upload ---------- */
  await page.goto(`${BASE}/upload`);
  await settle();
  manifest.layout = { sidebar: await box(page.locator('.sidebar')), topbar: await box(page.locator('.topbar')) };
  await shot('upload');
  manifest.boxes.upload = {
    chooseSf9: await box(page.locator('#browse-sf9')),
    sf9Card: await box(page.locator('.docs-item').first()),
    card: await box(page.locator('.docs-upload'))
  };

  // Slow the upload down so the real progress indicator has time to show every stage.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: -1, uploadThroughput: 4 * 1024 });
  await page.setInputFiles('#file-upload', SAMPLE);
  // One full frame once the indicator is up, then only the upload card (small and fast to grab),
  // so the indicator's own animation is caught at many steps.
  await page.waitForSelector('.reading .reading-time strong');
  manifest.readingBasePct = parseInt(await page.locator('.reading-time strong').textContent(), 10);
  await shot('reading-base');
  const area = await box(page.locator('.docs-upload'));
  const clip = { x: area.x, y: area.y, width: area.w, height: area.h + 8 };
  const frames = [];
  while (!(await page.locator('#file-info').count())) {
    const pct = await page.locator('.reading-time strong').textContent().catch(() => null);
    if (pct === null) break;
    frames.push({ pct: parseInt(pct, 10), png: await page.screenshot({ type: 'png', clip }) });
  }
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  // keep up to 14 frames spread over the percent range, each a different percent
  const picked = [];
  for (let k = 0; k < 14; k++) {
    const target = Math.round((k / 13) * 100);
    const f = frames.find((x) => x.pct >= target && !picked.some((p) => p.pct === x.pct));
    if (f) picked.push(f);
  }
  picked.forEach((f, i) => {
    saveWebp(`reading-${i}`, f.png, { w: clip.width, h: clip.height, x: clip.x, y: clip.y });
    manifest.reading.push({ shot: `reading-${i}`, pct: f.pct });
  });
  await wait(400);
  await dismissToast();
  await settle();
  await shot('uploaded');
  manifest.boxes.uploaded = { prepare: await box(page.getByRole('button', { name: /Prepare reports/ })), file: await box(page.locator('#file-info')) };

  /* ---------- SF9 ---------- */
  await page.getByRole('button', { name: /Prepare reports/ }).click();
  await page.waitForSelector('.report-sheet .rc-official-layout');
  await dismissToast();
  await settle();
  await shot('sf9');
  const card = await box(page.locator('.sf10-browser'));
  manifest.boxes.sf9 = {
    card, search: await box(page.locator('.sf10-search input')), list: await box(page.locator('.sf10-list')),
    thisLearner: await box(page.getByRole('button', { name: /This learner \(PDF\)/ })), sheet: await box(page.locator('.report-sheet'))
  };
  await page.locator('.sf10-search input').click();
  let typedH = 0;
  for (let i = 1; i <= LEARNER.lrn.length; i++) {
    await page.keyboard.type(LEARNER.lrn[i - 1]);
    await wait(90);
    // The first key adds a Clear button, so the first frame is the whole screen. After that only the
    // search card changes until the list narrows (the card shrinks, the preview moves up): grab just the
    // card while its size holds, the whole screen otherwise.
    const now = await box(page.locator('.sf10-browser'));
    if (i === 1) typedH = now.h;
    await shot(`sf9-type-${i}`, i > 1 && now.h === typedH ? { clip: { x: now.x, y: now.y, width: now.w, height: now.h } } : {});
    manifest.typing.push(`sf9-type-${i}`);
  }
  await page.keyboard.press('Enter');
  await settle();
  await shot('sf9-picked');
  await shot('sf9-picked-full', { fullPage: true });
  manifest.boxes.sf9picked = {
    row: await box(page.locator('.sf10-row.active')), thisLearner: await box(page.getByRole('button', { name: /This learner \(PDF\)/ })),
    sheet: await box(page.locator('.report-sheet')), grades: await box(page.locator('.report-sheet .rc-official-grades')),
    learner: await box(page.locator('.report-sheet .rc-official-learner'))
  };
  const [sf9Download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /This learner \(PDF\)/ }).click()]);
  await sf9Download.saveAs(path.join(tmp, 'sf9.pdf'));
  await page.waitForSelector('.toast.show');
  await wait(450);
  await shot('sf9-downloaded');
  manifest.boxes.sf9downloaded = { toast: await box(page.locator('.toast.show')) };
  await dismissToast();

  /* ---------- SF10 ---------- */
  await page.locator('a.step-link[href="/sf10"]').click();
  await page.waitForSelector('.sf10-sheet');
  await page.locator('.sf10-search input').fill(LEARNER.lrn);
  await page.keyboard.press('Enter');
  await settle();
  await shot('sf10');
  await shot('sf10-full', { fullPage: true });
  manifest.boxes.sf10 = {
    card: await box(page.locator('.sf10-browser')), row: await box(page.locator('.sf10-row.active')),
    thisLearner: await box(page.getByRole('button', { name: /This learner \(PDF\)/ })), sheet: await box(page.locator('.sf10-sheet'))
  };
  const [sf10Download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /This learner \(PDF\)/ }).click()]);
  await sf10Download.saveAs(path.join(tmp, 'sf10.pdf'));
  await page.waitForSelector('.toast.show');
  await wait(450);
  await shot('sf10-downloaded');
  manifest.boxes.sf10downloaded = { toast: await box(page.locator('.toast.show')) };
  await dismissToast();

  /* ---------- a learner with a blank grade: flagged, never filled in ---------- */
  await page.locator('a.step-link[href="/report-card"]').click();
  await page.waitForSelector('.report-sheet .rc-official-layout');
  await page.locator('.sf10-search input').fill('');
  await page.getByLabel('Filter by grade check').selectOption('check');
  await settle();
  await shot('sf9-check');
  await shot('sf9-check-full', { fullPage: true });
  manifest.boxes.sf9check = {
    row: await box(page.locator('.sf10-row.active')), quality: await box(page.locator('.sf10-row.active .sf10-quality')),
    blankRow: await box(page.locator('.report-sheet tr', { hasText: 'Culminating Activity' })),
    // subject, Q3, Q4, semester final, remarks: Q4 and the final are the blank ones
    blankCells: await Promise.all([0, 1, 2, 3, 4].map((i) => box(page.locator('.report-sheet tr', { hasText: 'Culminating Activity' }).first().locator('td').nth(i)))),
    secondSem: await box(page.locator('.report-sheet .rc-official-grades'))
  };
  manifest.checkLearner = (await page.locator('.sf10-row.active .sf10-row-main span').textContent())?.trim();

  /* ---------- the PDFs, as printed ---------- */
  for (const kind of ['sf9', 'sf10']) {
    const prefix = path.join(tmp, kind);
    const res = spawnSync('pdftoppm', ['-r', '220', '-png', `${prefix}.pdf`, prefix]);
    if (res.status !== 0) throw new Error(`pdftoppm failed for ${kind}: ${res.stderr}`);
    const pages = readdirSync(tmp).filter((f) => f.startsWith(`${kind}-`) && f.endsWith('.png')).sort();
    manifest.pdf[kind] = [];
    for (const [i, f] of pages.entries()) {
      const png = readFileSync(path.join(tmp, f));
      saveWebp(`${kind}-pdf-${i + 1}`, png, { w: png.readUInt32BE(16), h: png.readUInt32BE(20) }); // PNG IHDR width/height
      manifest.pdf[kind].push(`${kind}-pdf-${i + 1}`);
    }
  }

  writeFileSync(path.join(OUT, 'manifest.js'),
    '/* Generated by scripts/capture-reel.mjs from the real app. Do not edit by hand. */\n' +
    `window.REEL_SHOTS = ${JSON.stringify(manifest, null, 1)};\n`);
  const files = readdirSync(OUT);
  console.log(`Captured ${files.length - 1} images into public/reel/shots (reading frames: ${manifest.reading.map((r) => r.pct).join(', ')}%)`);
} finally {
  await browser.close();
  server.kill();
  rmSync(tmp, { recursive: true, force: true });
}
