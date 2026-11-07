/**
 * Reel engine, shared by index.html (16:9) and vertical.html (9:16).
 *
 * One clock (t, seconds) drives everything through render(t), so a reel is seekable and the
 * renderer (scripts/render-reel.mjs) can draw any frame exactly. A composition calls
 * ReelEngine.create({...}), places its animations with the helpers it returns, then calls start().
 *
 *   A(el, at, dur, { o, x, y, s, sx, r, b: [from, to] }, ease)  property track (keyframe semantics)
 *   F(at, dur, (p, t) => {}, ease)                              function track, called every frame
 *   sfx(t, type, options)                                       a sound cue for soundtrack.js
 *   new Screen(host, { left, top, width, vh, url })             a browser window over real captures
 *
 * Query options: ?render (exact size, no controls) · ?once (no loop) · ?url=... (read by compositions)
 * Keys: Space play/pause · ← → seek 1 s · R restart · M sound · F fullscreen
 */
(function () {
  'use strict';

  const E = {
    lin: (p) => p,
    out3: (p) => 1 - Math.pow(1 - p, 3),
    out5: (p) => 1 - Math.pow(1 - p, 5),
    inOut3: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    in3: (p) => p * p * p,
    back: (p) => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
    expo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p))
  };
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const center = (b) => [b.x + b.w / 2, b.y + b.h / 2];

  function create(opts) {
    const { width = 1920, height = 1080, T, END, scenes, fps = 30, plan = null } = opts;
    const transition = { type: 'fade', dur: 0.42, ...(opts.transition || {}) };
    const params = new URLSearchParams(location.search);
    const RENDER = params.has('render');
    const LOOP = !params.has('once');
    if (RENDER) document.documentElement.classList.add('render');
    const stage = $('#stage');
    Object.assign(stage.style, { width: width + 'px', height: height + 'px' });

    /* ---------- tracks ---------- */
    const DEF = { o: 1, x: 0, y: 0, s: 1, sx: 1, r: 0, b: 0 };
    const tracks = new Map();
    function A(target, at, dur, props, ease = 'out3') {
      const els = typeof target === 'string' ? $$(target) : Array.isArray(target) ? target : [target];
      if (!els.length) throw new Error('No element for track: ' + target);
      for (const el of els) {
        if (!el) throw new Error('Missing element for track: ' + target);
        if (!tracks.has(el)) tracks.set(el, []);
        tracks.get(el).push({ at, dur, ease: E[ease], props });
      }
    }
    const stagger = (els, at, gap, dur, props, ease) => els.forEach((el, i) => A(el, at + i * gap, dur, props, ease));
    const fns = [];
    const F = (at, dur, fn, ease = 'lin') => fns.push({ at, dur, ease: E[ease], fn });
    function applyTracks(t) {
      for (const [el, list] of tracks) {
        const v = { ...DEF }, seen = {};
        for (const tr of list) {
          const raw = tr.dur > 0 ? clamp((t - tr.at) / tr.dur) : (t >= tr.at ? 1 : 0);
          for (const k in tr.props) {
            const [a, b] = tr.props[k];
            if (t < tr.at) { if (!seen[k]) v[k] = a; } else v[k] = lerp(a, b, tr.ease(raw));
            seen[k] = true;
          }
        }
        el.style.opacity = v.o.toFixed(4);
        el.style.transform = `translate3d(${v.x.toFixed(2)}px,${v.y.toFixed(2)}px,0) scale(${(v.s * v.sx).toFixed(4)},${v.s.toFixed(4)}) rotate(${v.r.toFixed(3)}deg)`;
        el.style.filter = v.b > 0.05 ? `blur(${v.b.toFixed(2)}px)` : 'none';
      }
      for (const f of fns) f.fn(f.ease(clamp(f.dur > 0 ? (t - f.at) / f.dur : (t >= f.at ? 1 : 0))), t);
    }

    /* ---------- sound cues and small helpers ---------- */
    const SOUND = [];
    const sfx = (t, type, o = {}) => SOUND.push({ t: Math.round(t * 1000) / 1000, type, ...o });
    function drawPath(el, at, dur, ease = 'inOut3') { // SVG stroke drawing
      const len = el.getTotalLength();
      el.style.strokeDasharray = `${len} ${len}`;
      F(at, dur, (p) => { el.style.strokeDashoffset = (len * (1 - p)).toFixed(2); el.style.opacity = p > 0.001 ? 1 : 0; }, ease);
    }
    const blurIn = { o: [0, 1], y: [34, 0], b: [14, 0] };

    /* ---------- Screen: a browser window over captures of the real app ----------
       Captures, element boxes and PDF pages come from scripts/capture-reel.mjs (shots/manifest.js).
       The window has a camera (zoom and pan), page scrolling and a cursor, all keyed to the clock. */
    const SH = window.REEL_SHOTS || null;
    const CURSOR_SVG = '<svg viewBox="0 0 34 34" width="34" height="34"><path d="M5 3.5v24.2l6.3-6 4.4 9.6 4.3-1.9-4.3-9.4h8.8z" fill="#0f172a" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
    const screens = [];
    class Screen {
      // vw/vh: the part of the 1680x1050 capture the window shows at zoom 1 (a narrower vw crops it,
      // for a portrait frame); the camera pans over the whole capture
      constructor(host, { left, top, width, vw = SH.view.width, vh = SH.view.height, url = '' }) {
        const k = width / vw;
        Object.assign(host.style, { left: left + 'px', top: top + 'px', width: width + 'px' });
        host.innerHTML = '<div class="bar"><i></i><i></i><i></i><div class="url"></div></div>'
          + '<div class="vp"><div class="screen"><div class="cam"><div class="pagelayer"></div><div class="fixedlayer"></div></div></div></div>';
        this.vw = vw; this.vh = vh; this.cw = SH.view.width; this.ch = SH.view.height;
        this.urlEl = host.querySelector('.url');
        this.urlEl.textContent = url;
        Object.assign(host.querySelector('.vp').style, { width: width + 'px', height: vh * k + 'px' });
        Object.assign(host.querySelector('.screen').style, { width: vw + 'px', height: vh + 'px', transform: `scale(${k})` });
        this.cam = host.querySelector('.cam');
        Object.assign(this.cam.style, { width: this.cw + 'px', height: this.ch + 'px' });
        this.page = host.querySelector('.pagelayer');
        this.fixed = host.querySelector('.fixedlayer');
        this.cursor = document.createElement('div'); this.cursor.className = 'cursor'; this.cursor.innerHTML = CURSOR_SVG;
        this.ripple = document.createElement('div'); this.ripple.className = 'ripple';
        this.cam.append(this.ripple, this.cursor);
        this.layers = new Map();
        this.seq = []; this.camKeys = []; this.scrollKeys = []; this.curKeys = []; this.clicks = []; this.curVis = []; this.urls = [];
        this.curStart = { x: vw * 0.72, y: vh * 0.78 };
        screens.push(this);
      }
      layer(name, fixedFrom) {
        if (this.layers.has(name)) return;
        const s = SH.shots[name];
        if (!s) throw new Error('Missing capture: ' + name);
        const img = new Image(); img.alt = ''; img.src = 'shots/' + s.file;
        Object.assign(img.style, { left: (s.x || 0) + 'px', top: (s.y || 0) + 'px', width: s.w + 'px', height: s.h + 'px' });
        this.page.appendChild(img);
        const fixed = [];
        // a full-page capture scrolls; the fixed sidebar and the sticky top bar stay where they are
        if (fixedFrom) for (const b of [SH.layout.sidebar, SH.layout.topbar]) {
          const clip = document.createElement('div'); clip.className = 'fixclip';
          Object.assign(clip.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
          const fi = new Image(); fi.alt = ''; fi.src = 'shots/' + SH.shots[fixedFrom].file;
          Object.assign(fi.style, { left: -b.x + 'px', top: -b.y + 'px', width: SH.view.width + 'px', height: SH.view.height + 'px' });
          clip.appendChild(fi); this.fixed.appendChild(clip); fixed.push(clip);
        }
        this.layers.set(name, { img, fixed });
      }
      /* from `at`, show these captures (later names on top); fade crossfades from the previous set */
      show(at, names, fade = 0, fixedFrom = null) { names.forEach((n, i) => this.layer(n, i === 0 ? fixedFrom : null)); this.seq.push({ at, names, fade }); return this; }
      camera(at, dur, z, x, y, ease = 'inOut3') { this.camKeys.push({ at, dur, v: { z, x, y }, ease: E[ease] }); return this; }
      scroll(at, dur, to, ease = 'inOut3') { this.scrollKeys.push({ at, dur, v: { s: to }, ease: E[ease] }); return this; }
      cursorFrom([x, y]) { this.curStart = { x, y }; return this; }
      move(at, dur, [x, y], ease = 'inOut3') { this.curKeys.push({ at, dur, v: { x, y }, ease: E[ease] }); return this; }
      click(at) { this.clicks.push(at); return this; }
      cursorOn(at, on) { this.curVis.push({ at, on }); return this; }
      url(at, text) { this.urls.push({ at, text }); return this; }
      /* an amber highlight around a box (page coordinates, so it scrolls with the page) */
      ring(at, dur, b, pad = 6) {
        const el = document.createElement('div'); el.className = 'ring';
        Object.assign(el.style, { left: b.x - pad + 'px', top: b.y - pad + 'px', width: b.w + 2 * pad + 'px', height: b.h + 2 * pad + 'px' });
        this.page.appendChild(el);
        A(el, at, 0.45, { o: [0, 1], s: [1.25, 1] }, 'back');
        if (dur) A(el, at + dur, 0.3, { o: [1, 0] }, 'in3');
        return this;
      }
      /* keyframes: each key eases from the value before it to its own */
      static keyed(keys, t, start) {
        const v = { ...start };
        for (const k of keys) {
          if (t < k.at || (t === k.at && k.dur > 0)) break;
          const p = k.dur > 0 ? clamp((t - k.at) / k.dur) : 1, e = k.ease(p), from = { ...v };
          for (const key in k.v) v[key] = lerp(from[key], k.v[key], e);
          if (p < 1) break;
        }
        return v;
      }
      render(t) {
        let i = 0;
        for (let j = 0; j < this.seq.length; j++) if (t >= this.seq[j].at) i = j;
        const cur = this.seq[i], prev = this.seq[i - 1];
        const p = cur.fade > 0 && t >= cur.at ? E.inOut3(clamp((t - cur.at) / cur.fade)) : 1;
        for (const [name, L] of this.layers) {
          const ci = cur.names.indexOf(name), pi = prev ? prev.names.indexOf(name) : -1;
          let o = 0, z = 0;
          if (ci >= 0) { o = pi >= 0 ? 1 : p; z = 20 + ci; } else if (pi >= 0 && p < 1) { o = 1; z = 10 + pi; }
          for (const el of [L.img, ...L.fixed]) { el.style.opacity = o.toFixed(3); el.style.visibility = o > 0 ? 'visible' : 'hidden'; }
          L.img.style.zIndex = z;
        }
        const s = Screen.keyed(this.scrollKeys, t, { s: 0 }).s;
        this.page.style.transform = `translate3d(0,${(-s).toFixed(2)}px,0)`;
        const c = Screen.keyed(this.camKeys, t, { z: 1, x: this.vw / 2, y: this.vh / 2 });
        // keep the camera inside the capture
        const tx = clamp(this.vw / 2 - c.x * c.z, Math.min(0, this.vw - this.cw * c.z), 0);
        const ty = clamp(this.vh / 2 - c.y * c.z, Math.min(0, this.vh - this.ch * c.z), 0);
        this.cam.style.transform = `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0) scale(${c.z.toFixed(4)})`;
        let vis = false;
        for (const v of this.curVis) if (t >= v.at) vis = v.on;
        const m = Screen.keyed(this.curKeys, t, this.curStart);
        let press = 0, rip = null;
        for (const at of this.clicks) {
          const d = t - at;
          if (d >= 0 && d < 0.6) { rip = d; press = Math.max(press, d < 0.08 ? d / 0.08 : Math.max(0, 1 - (d - 0.08) / 0.16)); }
        }
        this.cursor.style.opacity = vis ? 1 : 0;
        this.cursor.style.transform = `translate3d(${(m.x - 5).toFixed(2)}px,${(m.y - 4).toFixed(2)}px,0) scale(${(1 - 0.16 * press).toFixed(3)})`;
        this.ripple.style.opacity = rip === null || !vis ? 0 : (1 - rip / 0.6).toFixed(3);
        this.ripple.style.transform = `translate3d(${m.x.toFixed(2)}px,${m.y.toFixed(2)}px,0) scale(${rip === null ? 0 : (0.3 + 1.2 * E.out3(rip / 0.6)).toFixed(3)})`;
        let u = null;
        for (const x of this.urls) if (t >= x.at) u = x.text;
        if (u !== null && this.urlEl.textContent !== u) this.urlEl.textContent = u;
      }
    }

    /* ---------- scenes: fade (crossfade with a slight settle) or whip (fast slide with motion blur) ---------- */
    const sceneEls = scenes.map((s) => {
      const el = document.getElementById(s.id);
      if (!el) throw new Error('Missing scene #' + s.id);
      return el;
    });
    const XD = transition.dur;
    function sceneState(i, t) {
      const start = scenes[i].at, next = i + 1 < scenes.length ? scenes[i + 1].at : Infinity;
      if (t < start || t >= next + XD) return null;
      const ein = transition.type === 'whip' ? E.out3 : E.inOut3;
      const pin = i > 0 && t < start + XD ? ein(clamp((t - start) / XD)) : 1;      // coming in
      const pout = t >= next ? E.in3(clamp((t - next) / XD)) : 0;                     // going out
      return { pin, pout };
    }
    function render(t) {
      t = clamp(t, 0, END);
      let top = 0;
      sceneEls.forEach((el, i) => {
        const st = sceneState(i, t);
        el.style.zIndex = String(i + 1);
        if (!st) { el.style.visibility = 'hidden'; el.style.opacity = '0'; return; }
        el.style.visibility = 'visible';
        if (transition.type === 'whip') {
          const dx = (1 - st.pin) * width * 0.32 - st.pout * width * 0.32, blur = (1 - st.pin) * 26 + st.pout * 26;
          el.style.opacity = (st.pout > 0 ? 1 - st.pout : st.pin).toFixed(4);
          el.style.transform = `translate3d(${dx.toFixed(1)}px,0,0) scale(${(1 + 0.06 * (1 - st.pin)).toFixed(4)})`;
          el.style.filter = blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : 'none';
        } else {
          // fade: the incoming scene settles in over the outgoing one, which stays until it is covered
          el.style.opacity = (st.pout > 0 ? 1 : st.pin).toFixed(4);
          el.style.transform = `scale(${(1.03 - 0.03 * st.pin).toFixed(4)})`;
        }
        if ((st.pout > 0 ? 1 - st.pout : st.pin) > 0.5) top = i;
      });
      applyTracks(t);
      for (const s of screens) s.render(t);
      if (opts.onFrame) opts.onFrame(t, top);
      current = t;
    }

    function fit() {
      if (RENDER) return;
      const k = Math.min(innerWidth / width, innerHeight / height);
      stage.style.transform = `translate(-50%,-50%) scale(${k})`;
    }
    addEventListener('resize', fit);
    fit();

    /* ---------- player ---------- */
    let current = 0, playing = false, last = 0;
    let actx = null, abuf = null, src = null, aStart = 0, aOffset = 0, soundOn = false;
    let playBtn, seek, timeEl, ctl, soundBtn;
    const ICON = {
      play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
      pause: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4.5" width="4.5" height="15" rx="1"/><rect x="14" y="4.5" width="4.5" height="15" rx="1"/></svg>',
      soundOff: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/></svg>',
      soundOn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9a4.2 4.2 0 0 1 0 6M18.8 6.5a8 8 0 0 1 0 11"/></svg>',
      full: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'
    };
    const score = () => ({ T, END, events: SOUND, ...(plan ? { plan } : {}) });
    function syncUi() {
      playBtn.innerHTML = playing ? ICON.pause : ICON.play;
      playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      seek.value = String(Math.round((current / END) * 1000));
      timeEl.textContent = `${current.toFixed(1)} / ${END.toFixed(1)} s`;
    }
    function stopAudio() {
      if (!src) return;
      try { src.stop(); } catch { /* already stopped */ }
      src.disconnect();
      src = null;
    }
    function startAudio(at) { // while sound plays, the audio clock drives the timeline
      stopAudio();
      if (!soundOn || !abuf || !playing) return;
      src = actx.createBufferSource();
      src.buffer = abuf;
      src.connect(actx.destination);
      src.start(0, Math.min(at, abuf.duration));
      aStart = actx.currentTime;
      aOffset = at;
    }
    async function toggleSound() { // off until asked for: browsers block autoplay with sound
      if (!window.GFSoundtrack) return;
      soundOn = !soundOn;
      if (soundOn && !actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        soundBtn.disabled = true;
        soundBtn.textContent = '…';
        await new Promise((r) => setTimeout(r, 30)); // let the button repaint before the synth runs
        const track = window.GFSoundtrack.render(score(), { sampleRate: actx.sampleRate });
        abuf = actx.createBuffer(2, track.left.length, track.sampleRate);
        abuf.copyToChannel(track.left, 0);
        abuf.copyToChannel(track.right, 1);
        soundBtn.disabled = false;
      }
      if (actx && actx.state === 'suspended') await actx.resume();
      if (soundOn && !playing) setPlaying(true);
      else if (soundOn) startAudio(current);
      else stopAudio();
      syncSound();
    }
    function syncSound() {
      soundBtn.innerHTML = soundOn ? ICON.soundOn : ICON.soundOff;
      soundBtn.setAttribute('aria-pressed', String(soundOn));
      soundBtn.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
    }
    function seekTo(t) {
      current = clamp(t, 0, END);
      render(current);
      if (playing) startAudio(current);
      syncUi();
    }
    function setPlaying(v) {
      playing = v;
      if (v && current >= END) current = 0;
      last = performance.now();
      if (v) startAudio(current); else stopAudio();
      syncUi();
    }
    function loop(now) {
      if (playing) {
        current = src ? aOffset + (actx.currentTime - aStart) : current + Math.min(0.1, (now - last) / 1000);
        if (current >= END) {
          if (LOOP) { current = 0; startAudio(0); } else { current = END; playing = false; stopAudio(); }
        }
        render(current);
        syncUi();
      }
      last = now;
      requestAnimationFrame(loop);
    }
    function toggleFull() {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    }
    function buildControls() {
      ctl = document.createElement('div');
      ctl.id = 'ctl'; ctl.setAttribute('role', 'group'); ctl.setAttribute('aria-label', 'Reel controls');
      ctl.innerHTML = '<button type="button" id="ctlPlay" aria-label="Play"></button>'
        + '<input type="range" id="ctlSeek" min="0" max="1000" step="1" value="0" aria-label="Seek">'
        + '<span id="ctlTime">0.0 s</span>'
        + '<button type="button" id="ctlSound" aria-label="Turn sound on" aria-pressed="false"></button>'
        + `<button type="button" id="ctlFull" aria-label="Fullscreen">${ICON.full}</button>`;
      document.body.appendChild(ctl);
      [playBtn, seek, timeEl, soundBtn] = ['#ctlPlay', '#ctlSeek', '#ctlTime', '#ctlSound'].map((s) => $(s));
      playBtn.addEventListener('click', () => setPlaying(!playing));
      seek.addEventListener('input', () => seekTo((+seek.value / 1000) * END));
      soundBtn.addEventListener('click', toggleSound);
      soundBtn.hidden = !window.GFSoundtrack;
      $('#ctlFull').addEventListener('click', toggleFull);
      syncSound();
      addEventListener('keydown', (e) => {
        if (e.target === seek && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
        if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) return; // let the focused button act
        if (e.key === ' ' || e.key === 'k') { e.preventDefault(); setPlaying(!playing); }
        else if (e.key === 'ArrowRight') seekTo(current + 1);
        else if (e.key === 'ArrowLeft') seekTo(current - 1);
        else if (e.key === 'r' || e.key === 'R') { seekTo(0); setPlaying(true); }
        else if (e.key === 'm' || e.key === 'M') toggleSound();
        else if (e.key === 'f' || e.key === 'F') toggleFull();
      });
      let idle;
      const wake = () => { ctl.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => playing && ctl.classList.add('idle'), 2200); };
      addEventListener('pointermove', wake);
      addEventListener('keydown', wake);
      wake();
    }

    async function start() {
      if (document.fonts) await document.fonts.ready;
      if (opts.onMeasure) opts.onMeasure();
      render(0);
      window.__END = END;
      window.__FPS = fps;
      window.__SIZE = { width, height };
      window.__seek = (t) => { render(t); return t; };
      window.__SOUND = score();
      // every capture must be decoded before the first frame is drawn
      await Promise.all([...document.images].map((im) => (im.decode ? im.decode().catch(() => {}) : null)));
      render(current);
      window.__ready = true;
      if (RENDER) return;
      buildControls();
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { current = END; render(END); syncUi(); } // end card; press play
      else setPlaying(true);
      requestAnimationFrame(loop);
    }

    return { E, clamp, lerp, $, $$, center, A, F, stagger, sfx, drawPath, blurIn, SH, Screen, params, RENDER, fps, XD, start };
  }

  window.ReelEngine = { create };
})();
