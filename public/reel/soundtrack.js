/**
 * GradeFlow AI reel soundtrack: an original score synthesized from scratch.
 * No samples and no third-party music, so there is nothing to license.
 *
 * render(score, { sampleRate }) -> { sampleRate, left, right } (Float32Array, -1..1)
 *   score = { T, END, events } as published by the reel (window.__SOUND):
 *     T       scene start times (s1..s6, s3b, s4b) and END, which place the music sections
 *     events  [{ t, type, ...options }] sound effects placed by the reel's own animations
 *
 * The same input always gives the same samples (seeded noise), so the browser player
 * and the MP4 renderer (scripts/render-reel.mjs) produce the same track.
 *
 * Works as a classic <script> (window.GFSoundtrack) and as a CommonJS module.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GFSoundtrack = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* mulberry32: small seeded PRNG so every render is identical */
  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* RBJ biquad: low-pass, high-pass, band-pass (0 dB peak) */
  class Biquad {
    constructor(sr) { this.sr = sr; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.b0 = 1; this.b1 = this.b2 = this.a1 = this.a2 = 0; }
    set(type, f, q = 0.707) {
      f = Math.min(Math.max(f, 10), this.sr * 0.45);
      const w = (TAU * f) / this.sr, c = Math.cos(w), a = Math.sin(w) / (2 * q);
      let b0, b1, b2;
      if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
      else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
      else { b0 = a; b1 = 0; b2 = -a; }
      const a0 = 1 + a;
      this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * c) / a0; this.a2 = (1 - a) / a0;
      return this;
    }
    run(x) {
      const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
      this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
      return y;
    }
  }

  /* Freeverb (Jezar's public-domain design), mono in, stereo out */
  function freeverb(input, sr, room, damp, wet) {
    const scale = sr / 44100, combLens = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], apLens = [556, 441, 341, 225];
    const out = [new Float32Array(input.length), new Float32Array(input.length)];
    [0, 23].forEach((spread, ch) => {
      const cb = combLens.map((l) => new Float32Array(Math.round((l + spread) * scale)));
      const cp = new Int32Array(8), cs = new Float64Array(8);
      const ab = apLens.map((l) => new Float32Array(Math.round((l + spread) * scale)));
      const ap = new Int32Array(4);
      const o = out[ch];
      for (let i = 0; i < input.length; i++) {
        const x = input[i] * 0.015;
        let y = 0;
        for (let k = 0; k < 8; k++) {
          const b = cb[k], v = b[cp[k]];
          cs[k] = v * (1 - damp) + cs[k] * damp;
          b[cp[k]] = x + cs[k] * room;
          if (++cp[k] >= b.length) cp[k] = 0;
          y += v;
        }
        for (let k = 0; k < 4; k++) {
          const b = ab[k], v = b[ap[k]], z = -y + v;
          b[ap[k]] = y + v * 0.5;
          if (++ap[k] >= b.length) ap[k] = 0;
          y = z;
        }
        o[i] = y * wet * 3;
      }
    });
    return out;
  }

  /* chords: bass root and pad voicing (MIDI). A minor / C major. */
  const CH = {
    Am: { root: 45, pad: [57, 60, 64, 71] },
    F: { root: 41, pad: [53, 57, 60, 64] },
    C: { root: 48, pad: [55, 60, 64, 74] },
    G: { root: 43, pad: [55, 59, 62, 64] }
  };

  function render(score, opts = {}) {
    const sr = opts.sampleRate || 44100;
    const T = score.T, END = score.END;
    const N = Math.ceil(END * sr);
    const bus = () => [new Float32Array(N), new Float32Array(N)];
    const mus = bus(), drm = bus(), fx = bus();
    const send = new Float32Array(N);
    const rand = rng(20261107);
    const noise = () => rand() * 2 - 1;
    const idx = (t) => Math.round(t * sr);
    const kicks = [];

    /* Runs fn(tLocal) once per sample from t0 for dur seconds, writing into bus b with a pan and a reverb send. */
    function voice(b, t0, dur, pan, rev, fn) {
      const s0 = idx(t0), i0 = Math.max(0, s0), i1 = Math.min(N, idx(t0 + dur));
      const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4);
      for (let i = i0; i < i1; i++) {
        const v = fn((i - s0) / sr);
        b[0][i] += v * gl; b[1][i] += v * gr; send[i] += v * rev;
      }
    }
    const blep = (t, dt) => (t < dt ? ((t /= dt), t + t - t * t - 1) : t > 1 - dt ? ((t = (t - 1) / dt), t * t + t + t + 1) : 0);
    function saw(f) { let ph = rand(); const dt = f / sr; return () => { ph += dt; if (ph >= 1) ph -= 1; return 2 * ph - 1 - blep(ph, dt); }; }
    const release = (t, len, r) => (t > len ? Math.max(0, 1 - (t - len) / r) : 1);

    /* ---------- instruments ---------- */
    function pad(notes, t0, t1, o) {
      const gain = o.gain ?? 0.03, cut = o.cut ?? [900, 900], attack = o.attack ?? 0.1, rel = o.release ?? 0.5, rev = o.rev ?? 0.35;
      const len = t1 - t0;
      notes.forEach((m, n) => {
        [-1, 1].forEach((side) => {
          const f = mtof(m), a = saw(f * Math.pow(2, (side * 0.08) / 12)), b = saw(f * Math.pow(2, (side * 0.03) / 12));
          const lp = new Biquad(sr); let k = 0;
          voice(mus, t0, len + rel, side * (0.3 + 0.12 * (n % 3)), rev, (t) => {
            if ((k++ & 31) === 0) lp.set('lp', cut[0] + (cut[1] - cut[0]) * Math.min(1, t / len), 0.8);
            const env = Math.min(1, t / attack) * release(t, len, rel);
            return lp.run((a() + b()) * 0.5) * gain * env;
          });
        });
      });
    }
    function bassNote(t0, dur, m, vel = 1) {
      const f = mtof(m), osc = saw(f), lp = new Biquad(sr); let ph = 0, k = 0;
      voice(mus, t0, dur + 0.04, 0, 0.02, (t) => {
        if ((k++ & 15) === 0) lp.set('lp', 220 + 1300 * Math.exp(-t * 18) * vel, 1.1);
        ph += f / sr;
        const env = Math.min(1, t / 0.004) * release(t, dur, 0.04);
        return (lp.run(osc()) * 0.55 + Math.sin(TAU * ph) * 0.6) * env * 0.3 * vel;
      });
    }
    function drone(t0, t1, m, g, attack) {
      const f = mtof(m); let ph = 0;
      voice(mus, t0, t1 - t0 + 0.3, 0, 0, (t) => { ph += f / sr; return Math.sin(TAU * ph) * Math.min(1, t / attack) * release(t, t1 - t0, 0.3) * g; });
    }
    function kick(t0, g) {
      let ph = 0;
      voice(drm, t0, 0.5, 0, 0.03, (t) => {
        ph += (46 + 120 * Math.exp(-t * 30)) / sr;
        const click = t < 0.004 ? noise() * (1 - t / 0.004) * 0.35 : 0;
        return Math.tanh(Math.sin(TAU * ph) * Math.exp(-t * 6.5) * 1.4 + click) * 0.75 * g;
      });
    }
    function clap(t0, g) {
      const bp = new Biquad(sr).set('bp', 1400, 0.9);
      voice(drm, t0, 0.35, 0.05, 0.25, (t) => {
        const env = t < 0.03 ? Math.exp(-(t % 0.01) * 300) : Math.exp(-(t - 0.03) * 16);
        return bp.run(noise()) * env * 1.1 * g;
      });
    }
    function snare(t0, g) {
      const bp = new Biquad(sr).set('bp', 2200, 0.7); let ph = 0;
      voice(drm, t0, 0.25, -0.05, 0.2, (t) => { ph += 190 / sr; return (bp.run(noise()) * 0.9 * Math.exp(-t * 18) + Math.sin(TAU * ph) * 0.35 * Math.exp(-t * 30)) * g; });
    }
    function hat(t0, g, open) {
      const hp = new Biquad(sr).set('hp', 7500, 0.7);
      voice(drm, t0, open ? 0.35 : 0.08, 0.25, 0.05, (t) => hp.run(noise()) * Math.exp(-t * (open ? 9 : 45)) * 0.3 * g);
    }
    function pluck(t0, m, g, pan) {
      const L = Math.max(2, Math.round(sr / mtof(m))), buf = new Float32Array(L);
      for (let i = 0; i < L; i++) buf[i] = noise();
      for (let pass = 0; pass < 2; pass++) for (let i = 1; i < L; i++) buf[i] = 0.5 * (buf[i] + buf[i - 1]);
      let p = 0;
      voice(mus, t0, 0.7, pan, 0.3, (t) => {
        const n = p + 1 === L ? 0 : p + 1, out = buf[p];
        buf[p] = 0.996 * 0.5 * (buf[p] + buf[n]); p = n;
        return out * 0.2 * g * release(t, 0.6, 0.1);
      });
    }
    function bell(t0, m, g = 1, dur = 1.8, pan = 0) {
      const f = mtof(m); let pc = 0, pm = 0;
      voice(fx, t0, dur, pan, 0.45, (t) => {
        pc += f / sr; pm += (f * 3.5) / sr;
        const I = 2.2 * Math.exp(-t * 6) + 0.25;
        return Math.sin(TAU * pc + I * Math.sin(TAU * pm)) * Math.min(1, t / 0.002) * Math.exp((-t * 6.4) / dur) * 0.14 * g;
      });
    }
    function ping(t0, m, g = 1, pan = 0.2) {
      const f = mtof(m); let p1 = 0, p2 = 0;
      voice(fx, t0, 0.45, pan, 0.3, (t) => { p1 += f / sr; p2 += (2 * f) / sr; return (Math.sin(TAU * p1) + 0.3 * Math.sin(TAU * p2)) * Math.min(1, t / 0.002) * Math.exp(-t * 11) * 0.12 * g; });
    }
    function tick(t0, m, g = 1, pan = 0) {
      const f = mtof(m); let p = 0;
      voice(fx, t0, 0.12, pan, 0.35, (t) => { p += f / sr; return Math.sin(TAU * p) * Math.min(1, t / 0.001) * Math.exp(-t * 38) * 0.1 * g; });
    }
    function key(t0, g = 1) {
      const hp = new Biquad(sr).set('hp', 2500, 0.7), f = 1700 + rand() * 600, pan = 0.2 + rand() * 0.2; let ph = 0;
      voice(fx, t0, 0.04, pan, 0.05, (t) => { ph += f / sr; return (hp.run(noise()) * 0.5 + Math.sin(TAU * ph) * 0.3) * Math.exp(-t * 160) * 0.22 * g; });
    }
    function click(t0, g = 1) {
      const hp = new Biquad(sr).set('hp', 1800, 0.7); let ph = 0;
      voice(fx, t0, 0.06, 0.15, 0.08, (t) => { ph += 1100 / sr; return (Math.sin(TAU * ph) * 0.6 + hp.run(noise()) * 0.4) * Math.exp(-t * 90) * 0.25 * g; });
    }
    function pop(t0, g = 1) {
      let ph = 0;
      voice(fx, t0, 0.14, 0.2, 0.2, (t) => { ph += (300 + 900 * Math.exp(-t * 45)) / sr; return Math.sin(TAU * ph) * Math.min(1, t / 0.002) * Math.exp(-t * 28) * 0.2 * g; });
    }
    function thump(t0, g = 1) {
      const lp = new Biquad(sr).set('lp', 900, 0.7); let ph = 0;
      voice(fx, t0, 0.25, 0, 0.1, (t) => { ph += (60 + 90 * Math.exp(-t * 35)) / sr; return (Math.sin(TAU * ph) * 0.8 + lp.run(noise()) * 0.3 * Math.exp(-t * 30)) * Math.exp(-t * 16) * 0.35 * g; });
    }
    function hit(t0, g = 1) {
      const lp = new Biquad(sr).set('lp', 1200, 0.7); let ph = 0;
      voice(fx, t0, 1.2, 0, 0.45, (t) => { ph += (42 + 70 * Math.exp(-t * 20)) / sr; return (Math.tanh(Math.sin(TAU * ph) * 1.6) * Math.exp(-t * 3.2) * 0.6 + lp.run(noise()) * Math.exp(-t * 25) * 0.35) * g; });
    }
    function whoosh(t0, dur, g = 1, up = true, pan = 0) {
      const bp = new Biquad(sr); let k = 0;
      voice(fx, t0, dur, pan, 0.25, (t) => {
        const p = t / dur;
        if ((k++ & 31) === 0) bp.set('bp', 350 * Math.pow(16, up ? p : 1 - p), 1.4);
        return bp.run(noise()) * Math.pow(Math.sin(Math.PI * Math.min(1, p)), 2) * 0.45 * g;
      });
    }
    function scribble(t0, dur, g = 1) {
      const bp = new Biquad(sr).set('bp', 3200, 1.2), rate = 11 + rand() * 4;
      voice(fx, t0, dur, -0.2, 0.1, (t) => {
        const p = t / dur, stroke = 0.55 + 0.45 * Math.sin(TAU * rate * t);
        return bp.run(noise()) * stroke * Math.min(1, p / 0.08) * Math.min(1, (1 - p) / 0.15) * 0.3 * g;
      });
    }
    function scan(t0, dur, g = 1) {
      const bp = new Biquad(sr); let k = 0, ph = 0;
      voice(fx, t0, dur, 0.3, 0.2, (t) => {
        const p = t / dur;
        if ((k++ & 31) === 0) bp.set('bp', 900 + 2600 * p, 3);
        ph += (1400 + 600 * p) / sr;
        return (bp.run(noise()) * 0.5 + Math.sin(TAU * ph) * 0.05 * (0.6 + 0.4 * Math.sin(TAU * 18 * t))) * Math.sin(Math.PI * p) * 0.3 * g;
      });
    }
    function shimmer(t0, dur, g = 1) {
      const notes = [81, 84, 86, 88, 91, 93, 96, 98];
      notes.forEach((m, i) => bell(t0 + (dur * i) / notes.length, m, 0.35 * g, 1.2, i % 2 ? 0.5 : -0.5));
    }
    /* noise + pitch sweep that ends exactly on a cut */
    function riser(tEnd, dur, g = 1) {
      const bp = new Biquad(sr); let k = 0, ph = 0;
      voice(fx, tEnd - dur, dur, 0, 0.35, (t) => {
        const p = t / dur;
        if ((k++ & 31) === 0) bp.set('bp', 250 * Math.pow(30, p), 2.2);
        ph += mtof(57 + 24 * p * p) / sr;
        const env = p * p * (p > 0.985 ? (1 - p) / 0.015 : 1);
        return (bp.run(noise()) * 0.6 + Math.sin(TAU * ph) * 0.1 * p) * env * g;
      });
    }
    function impact(t0, size = 1) {
      const lp = new Biquad(sr).set('lp', 2600, 0.7), hp = new Biquad(sr).set('hp', 4500, 0.7); let ph = 0;
      voice(fx, t0, 1.2 + size, 0, 0.5 * size, (t) => {
        ph += (30 + 40 * Math.exp(-t * 9)) / sr;
        const body = Math.tanh(Math.sin(TAU * ph) * Math.exp(-t * (2.4 / size)) * 0.9 + lp.run(noise()) * Math.exp(-t * 9) * 0.5);
        return body * 0.7 * Math.min(1, size) + hp.run(noise()) * Math.exp(-t * 2.6) * 0.16 * size;
      });
    }

    /* a run of bars from t0 to t1 at 120 BPM, chords given as [offset seconds, name] */
    function section(t0, t1, prog, o) {
      const chordAt = (t) => { let c = prog[0][1]; for (const [off, name] of prog) if (t >= t0 + off - 1e-6) c = name; return CH[c]; };
      prog.forEach(([off, name], i) => {
        const s = t0 + off, e = i + 1 < prog.length ? t0 + prog[i + 1][0] : t1;
        if (o.pad) pad(CH[name].pad, s, e, { ...o.pad, attack: i === 0 ? o.pad.attack ?? 0.05 : 0.12 });
        if (o.bass === 'sustain') bassNote(s, e - s - 0.02, CH[name].root, 0.8);
      });
      const n8 = Math.floor((t1 - t0) / 0.25 + 1e-6);
      for (let e = 0; e < n8; e++) {
        const t = t0 + e * 0.25, c = chordAt(t);
        if (o.kick === 'four' && e % 2 === 0) kicks.push({ t, g: 1 });
        if (o.kick === 'half' && (e % 8 === 0 || e % 8 === 5)) kicks.push({ t, g: e % 8 ? 0.8 : 1 });
        if (o.kick === 'heart' && e % 8 === 0) kicks.push({ t, g: 0.8 }, { t: t + 0.22, g: 0.45 });
        if (o.kick === 'soft' && e % 4 === 0) kicks.push({ t, g: 0.5 });
        if (o.clap && e % 4 === 2) clap(t, o.clap);
        if (o.snare && e % 8 === 4) snare(t, o.snare);
        if (o.hats && e % 2 === 1) hat(t, o.hats, e % 8 === 7);
        if (o.hats8) hat(t, o.hats8 * (e % 2 ? 1 : 0.55), false);
        if (o.bass === '8ths') bassNote(t, 0.2, c.root + (e % 2 ? 12 : 0), (e % 2 ? 0.7 : 1) * (o.bassVel ?? 1));
      }
      if (o.pluck) {
        const pat = [0, 1, 2, 3, 2, 1, 2, 3], n16 = Math.floor((t1 - t0) / 0.125 + 1e-6);
        for (let s = 0; s < n16; s++) {
          const t = t0 + s * 0.125;
          pluck(t, chordAt(t).pad[pat[s % 8]] + 12, (s % 4 === 0 ? 1 : 0.6) * o.pluck, s % 2 ? 0.35 : -0.35);
        }
      }
    }

    /* ---------- arrangement ----------
       A plan is a list of sections: { at, kind, chords, pluck, hit, riser, riserG, roll, marks }.
         kind    intro (dark pad, drone) · hook (low drone, the reel adds hits) · groove (120 BPM four on
                 the floor, side-chained) · soft (light and upbeat) · half (half time) · drop (heartbeat) ·
                 end (ringing C major)
         hit     an impact on the cut, this size · riser / roll: seconds of riser / snare roll into the cut
         marks   extra light hits inside the section
       A reel can pass score.plan; without one the plan comes from the 16:9 reel's timeline T. */
    // one chord per 2 s bar, cycling through `names` until the section is full
    const bars = (names, len) => Array.from({ length: Math.max(1, Math.ceil(len / 2 - 1e-6)) }, (_, i) => [i * 2, names[i % names.length]]);
    const plan = score.plan || [
      { at: 0, kind: 'intro' },
      { at: T.s2, kind: 'groove', chords: ['F', 'G', 'C'], hit: 1, riser: 0.9, riserG: 0.55 },
      { at: T.s3, kind: 'groove', pluck: true, chords: ['Am', 'F', 'C', 'G'], hit: 0.55, riser: 0.5, riserG: 0.35, marks: T.s3b ? [T.s3b] : [] },
      { at: T.s4, kind: 'half', chords: ['Am', 'F', 'G', 'Am'], hit: 1, riser: 0.7, riserG: 0.5 },
      { at: T.s5, kind: 'drop', hit: 1.2, riser: 0.8, riserG: 0.45 },
      { at: T.s6, kind: 'end', hit: 1.4, riser: 1.4, riserG: 0.8, roll: 1.2 }
    ];
    plan.forEach((sec, i) => {
      const s = sec.at, e = i + 1 < plan.length ? plan[i + 1].at : END, len = e - s;
      const nextRoll = i + 1 < plan.length ? plan[i + 1].roll || 0 : 0;
      if (sec.riser) riser(s, sec.riser, sec.riserG ?? 0.5);
      if (sec.roll) for (let t = s - sec.roll, gap = 0.2, g = 0.25; t < s - 0.02; t += gap, gap = Math.max(0.035, gap * 0.82), g = Math.min(0.9, g * 1.12)) snare(t, g);
      if (sec.hit) impact(s, sec.hit);
      for (const m of sec.marks || []) { riser(m, 0.4, 0.25); impact(m, 0.4); }
      const chords = bars(sec.chords || ['Am'], len);
      if (sec.kind === 'intro') {
        pad(CH.Am.pad, s, e, { gain: 0.03, cut: [260, 1500], attack: Math.min(1.8, len / 2), release: 0.25, rev: 0.5 });
        drone(s, e, 33, 0.1, Math.min(1.5, len / 2));
      } else if (sec.kind === 'hook') {
        pad(CH.Am.pad.map((m) => m - 12), s, e, { gain: 0.026, cut: [300, 900], attack: 0.05, release: 0.15, rev: 0.5 });
        drone(s, e, 33, 0.13, 0.05);
      } else if (sec.kind === 'groove') {
        section(s, e, chords, { kick: 'four', clap: 0.9, hats: 1, bass: '8ths', pluck: sec.pluck ? 0.8 : 0,
          pad: sec.pluck ? { gain: 0.022, cut: [1800, 2400] } : { gain: 0.026, cut: [1400, 2600] } });
      } else if (sec.kind === 'soft') {
        // soft and upbeat: kick on 1 and 3, light snaps and shaker, a gentle plucked arpeggio
        section(s, e, chords, { kick: 'soft', clap: 0.35, hats: 0.55, bass: '8ths', bassVel: 0.7, pluck: sec.pluck ? 0.65 : 0,
          pad: { gain: 0.024, cut: [1600, 2600] } });
      } else if (sec.kind === 'half') {
        section(s, e, chords, { kick: 'half', snare: 0.8, hats8: 0.45, bass: 'sustain', pad: { gain: 0.028, cut: [700, 1400] } });
      } else if (sec.kind === 'drop') {
        pad(CH.Am.pad.map((m) => m - 12), s, e, { gain: 0.03, cut: [300, 700], attack: 0.6, release: 0.2, rev: 0.5 });
        drone(s, e, 33, 0.12, 0.4);
        section(s, e - nextRoll, [[0, 'Am']], { kick: 'heart' });
      } else if (sec.kind === 'end') {
        pad([...CH.C.pad, 79, 84], s, e, { gain: 0.03, cut: [2800, 1500], attack: 0.03, release: 0.01, rev: 0.55 });
        bassNote(s, len - 0.05, 36, 0.6);
        drone(s, e, 24, 0.09, 0.05);
      }
    });

    /* ---------- sound effects placed by the reel ---------- */
    for (const ev of score.events || []) {
      const g = ev.g ?? 1;
      switch (ev.type) {
        case 'bell': ev.notes.forEach((m, i) => bell(ev.t + i * 0.03, m, g, ev.dur ?? 1.8, i % 2 ? 0.3 : -0.3)); break;
        case 'chime': ev.notes.forEach((m, i) => bell(ev.t + i * 0.07, m, 0.8 * g, 0.9, i % 2 ? 0.25 : -0.25)); break;
        case 'shimmer': shimmer(ev.t, ev.dur, g); break;
        case 'ping': ping(ev.t, ev.note, g); break;
        case 'tick': tick(ev.t, ev.note, g, ev.pan ?? 0); break;
        case 'key': key(ev.t, g); break;
        case 'click': click(ev.t, g); break;
        case 'pop': pop(ev.t, g); break;
        case 'thump': thump(ev.t, g); break;
        case 'hit': hit(ev.t, g); break;
        case 'whoosh': whoosh(ev.t, ev.dur, g, ev.up !== false, ev.pan ?? 0); break;
        case 'scribble': scribble(ev.t, ev.dur, g); break;
        case 'scan': scan(ev.t, ev.dur, g); break;
        default: break;
      }
    }

    /* ---------- mix ---------- */
    for (const k of kicks) kick(k.t, k.g);
    // side-chain: the music bus dips under every kick
    const duck = new Float32Array(N).fill(1), span = idx(0.3);
    for (const k of kicks) {
      const i0 = idx(k.t);
      for (let i = Math.max(0, i0); i < Math.min(N, i0 + span); i++) {
        const t = (i - i0) / sr, d = 1 - 0.5 * k.g * Math.min(1, t / 0.005) * Math.exp(-t / 0.09);
        if (d < duck[i]) duck[i] = d;
      }
    }
    const [rl, rr] = freeverb(send, sr, 0.84, 0.25, 0.3);
    const left = new Float32Array(N), right = new Float32Array(N);
    let sumSq = 0;
    for (let i = 0; i < N; i++) {
      left[i] = mus[0][i] * duck[i] + drm[0][i] + fx[0][i] + rl[i];
      right[i] = mus[1][i] * duck[i] + drm[1][i] + fx[1][i] + rr[i];
      sumSq += left[i] * left[i] + right[i] * right[i];
    }
    // level: bring RMS to about -16 dBFS, soft-clip the peaks, keep the true peak under -1 dBFS
    const pre = 0.16 / Math.max(1e-6, Math.sqrt(sumSq / (2 * N)));
    const fadeOut = 1.6, fo0 = idx(END - fadeOut), fi = idx(0.01);
    let peak = 0;
    for (let i = 0; i < N; i++) {
      const f = (i < fi ? i / fi : 1) * (i > fo0 ? 0.5 + 0.5 * Math.cos((Math.PI * (i - fo0)) / (N - fo0)) : 1);
      left[i] = Math.tanh(left[i] * pre) * f;
      right[i] = Math.tanh(right[i] * pre) * f;
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    }
    const post = peak > 0.89 ? 0.89 / peak : 1;
    if (post < 1) for (let i = 0; i < N; i++) { left[i] *= post; right[i] *= post; }
    return { sampleRate: sr, left, right };
  }

  /* 16-bit PCM stereo WAV */
  function toWav({ sampleRate, left, right }) {
    const n = left.length, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    const s16 = (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 4, true);
    for (let i = 0, o = 44; i < n; i++, o += 4) { v.setInt16(o, s16(left[i]), true); v.setInt16(o + 2, s16(right[i]), true); }
    return new Uint8Array(buf);
  }

  return { render, toWav };
});
