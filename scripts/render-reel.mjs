#!/usr/bin/env node
/**
 * Renders public/reel/index.html to an MP4, frame by frame.
 *
 * The reel exposes window.__seek(t), so every frame is drawn at an exact time and
 * captured: no dropped frames, no dependence on how fast this machine is.
 *
 * Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium)
 * and ffmpeg on PATH.
 *
 *   node scripts/render-reel.mjs                         -> gradeflow-ai-reel.mp4
 *   node scripts/render-reel.mjs out.mp4 --fps 60
 *   node scripts/render-reel.mjs --url gradeflow.example.com
 *   node scripts/render-reel.mjs --still 12.5 frame.png  (one frame, for checking)
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const fps = Number(flag('--fps', '30'));
const url = flag('--url', '');
const still = flag('--still', null);
const out = path.resolve(args[0] ?? (still !== null ? 'reel-frame.png' : 'gradeflow-ai-reel.mp4'));
if (!Number.isFinite(fps) || fps < 1 || fps > 120) throw new Error(`Bad --fps: ${fps}`);

const root = path.dirname(fileURLToPath(import.meta.url));
const page_url = pathToFileURL(path.join(root, '..', 'public', 'reel', 'index.html'));
page_url.search = new URLSearchParams({ render: '1', ...(url ? { url } : {}) }).toString();

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { console.error('Reel error:', e.message); process.exitCode = 1; });
  await page.goto(page_url.href);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
  const end = await page.evaluate(() => window.__END);

  if (still !== null) {
    await page.evaluate((t) => window.__seek(t), Number(still));
    await page.screenshot({ path: out });
    console.log(`Saved ${out}`);
  } else {
    const total = Math.round(end * fps);
    const ff = spawn('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', out
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    ff.on('error', (e) => { console.error('ffmpeg could not start (is it on PATH?):', e.message); process.exit(1); });

    const t0 = Date.now();
    for (let i = 0; i < total; i++) {
      await page.evaluate((t) => window.__seek(t), i / fps);
      const png = await page.screenshot({ type: 'png' });
      if (!ff.stdin.write(png)) await once(ff.stdin, 'drain');
      if (i % fps === 0 || i === total - 1) process.stdout.write(`\rFrame ${i + 1}/${total}`);
    }
    ff.stdin.end();
    const [code] = await once(ff, 'close');
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
    console.log(`\nSaved ${out} (${end}s at ${fps} fps, rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
} finally {
  await browser.close();
}
