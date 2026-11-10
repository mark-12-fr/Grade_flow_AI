#!/usr/bin/env node
/**
 * Renders a reel (public/reel/index.html 16:9, or vertical.html 9:16) to an MP4 with its soundtrack,
 * frame by frame.
 *
 * The reel exposes window.__seek(t), so every frame is drawn at an exact time and
 * captured: no dropped frames, no dependence on how fast this machine is. The music is
 * synthesized by public/reel/soundtrack.js from the reel's own timeline (window.__SOUND),
 * so every hit lands on its cut.
 *
 * Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium)
 * and ffmpeg on PATH.
 *
 *   node scripts/render-reel.mjs                         -> gradeflow-ai-reel.mp4
 *   node scripts/render-reel.mjs --vertical              -> gradeflow-ai-reel-vertical.mp4 (1080x1920)
 *   node scripts/render-reel.mjs out.mp4 --fps 60
 *   node scripts/render-reel.mjs --url gradeflow.example.com
 *   node scripts/render-reel.mjs --music track.mp3       (your own track instead, faded out at the end)
 *   node scripts/render-reel.mjs --no-music              (silent video)
 *   node scripts/render-reel.mjs --wav soundtrack.wav    (only the soundtrack, no video)
 *   node scripts/render-reel.mjs --still 12.5 frame.png  (one frame, for checking)
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const soundtrack = require('../public/reel/soundtrack.js');
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
  if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a value`);
  args.splice(i, 2);
  return v;
};
const toggle = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};
const fps = Number(flag('--fps', '30'));
const url = flag('--url', '');
const still = flag('--still', null);
const wavOnly = flag('--wav', null);
const musicFile = flag('--music', null);
const silent = toggle('--no-music');
const voicePath = flag('--voice', null);
const srtPath = flag('--srt', null);
const pageName = toggle('--vertical') ? 'vertical' : flag('--page', 'index'); // index (16:9), vertical (9:16), ad (9:16, 45 s)
const PAGES = { index: ['index.html', 'gradeflow-ai-reel.mp4'], vertical: ['vertical.html', 'gradeflow-ai-reel-vertical.mp4'], ad: ['ad.html', 'gradeflow-ai-ad.mp4'] };
if (!PAGES[pageName]) throw new Error(`Unknown --page ${pageName}: use ${Object.keys(PAGES).join(', ')}`);
const out = path.resolve(args[0] ?? (still !== null ? 'reel-frame.png' : PAGES[pageName][1]));
if (!Number.isFinite(fps) || fps < 1 || fps > 120) throw new Error(`Bad --fps: ${fps}`);
if (musicFile && !existsSync(musicFile)) throw new Error(`Music file not found: ${musicFile}`);
if (voicePath && !existsSync(voicePath)) throw new Error(`Voice file or folder not found: ${voicePath}`);

const root = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = pathToFileURL(path.join(root, '..', 'public', 'reel', PAGES[pageName][0]));
pageUrl.search = new URLSearchParams({ render: '1', ...(url ? { url } : {}) }).toString();

const tmpWav = path.join(os.tmpdir(), `gradeflow-reel-${process.pid}.wav`);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { console.error('Reel error:', e.message); process.exitCode = 1; });
  await page.goto(pageUrl.href);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  const size = await page.evaluate(() => window.__SIZE || { width: 1920, height: 1080 });
  await page.setViewportSize(size); // the stage is drawn at its exact size in render mode
  const end = await page.evaluate(() => window.__END);
  const score = await page.evaluate(() => window.__SOUND);
  const synth = () => soundtrack.toWav(soundtrack.render(score, { sampleRate: 48000 }));
  const voice = await page.evaluate(() => window.__VOICE || null);

  if (srtPath) { // subtitles for the voiceover lines, for Facebook/TikTok uploads
    if (!voice) throw new Error('This reel has no voiceover lines for --srt');
    const ts = (s) => { const ms = Math.round(s * 1000); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
    const srt = voice.map((v, i) => `${i + 1}\n${ts(v.t)} --> ${ts(Math.min(end, i + 1 < voice.length ? voice[i + 1].t - 0.3 : end, v.t + 5))}\n${v.text}\n`).join('\n');
    writeFileSync(path.resolve(srtPath), srt);
    console.log(`Saved ${path.resolve(srtPath)} (${voice.length} lines)`);
  }

  if (wavOnly !== null) {
    writeFileSync(path.resolve(wavOnly), synth());
    console.log(`Saved ${path.resolve(wavOnly)} (${end}s soundtrack)`);
  } else if (still !== null) {
    await page.evaluate((t) => window.__seek(t), Number(still));
    await page.screenshot({ path: out });
    console.log(`Saved ${out}`);
  } else {
    let audio = [];
    if (musicFile) {
      const fade = Math.max(0, end - 1.5);
      // a track shorter than the reel loops; -t trims it to the reel
      audio = ['-stream_loop', '-1', '-i', path.resolve(musicFile), '-map', '0:v:0', '-map', '1:a:0', '-t', String(end),
        '-af', `afade=t=in:d=0.05,afade=t=out:st=${fade}:d=1.5`, '-c:a', 'aac', '-b:a', '192k'];
    } else if (!silent) {
      writeFileSync(tmpWav, synth());
      audio = ['-i', tmpWav, '-map', '0:v:0', '-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k', '-shortest'];
    }
    if (voicePath && !musicFile && !silent) {
      // A voice over the synthesized music, which dips under it (side-chain). One file is the whole
      // voiceover from 0 s; a folder holds one file per line (sorted by name), each placed at its line's time.
      const files = statSync(voicePath).isDirectory()
        ? readdirSync(voicePath).filter((f) => /\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(f)).sort().map((f) => path.join(voicePath, f))
        : [path.resolve(voicePath)];
      if (!files.length) throw new Error(`No audio files in ${voicePath}`);
      if (files.length > 1 && (!voice || files.length !== voice.length)) throw new Error(`${files.length} voice files, but the reel has ${voice ? voice.length : 0} voiceover lines`);
      const at = files.length > 1 ? voice.map((v) => Math.round(v.t * 1000)) : [0];
      const chains = files.map((_, i) => `[${i + 2}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${at[i]}|${at[i]}[v${i}]`);
      const graph = [...chains,
        // apad: the voice runs to the end, so the music under it does too (-t trims to the reel)
        `${files.map((_, i) => `[v${i}]`).join('')}amix=inputs=${files.length}:normalize=0,volume=1.6,apad,asplit=2[vo][key]`,
        '[1:a][key]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=450[bed]',
        '[bed][vo]amix=inputs=2:normalize=0,alimiter=limit=0.9[mix]'].join(';');
      audio = ['-i', tmpWav, ...files.flatMap((f) => ['-i', f]), '-filter_complex', graph, '-map', '0:v:0', '-map', '[mix]', '-t', String(end), '-c:a', 'aac', '-b:a', '192k'];
    }
    const total = Math.round(end * fps);
    const ff = spawn('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
      ...audio,
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
    const sound = musicFile ? path.basename(musicFile) : silent ? 'no sound' : voicePath ? 'synthesized soundtrack and voice' : 'synthesized soundtrack';
    console.log(`\nSaved ${out} (${end}s at ${fps} fps, ${sound}, rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
} finally {
  await browser.close();
  rmSync(tmpWav, { force: true });
}
