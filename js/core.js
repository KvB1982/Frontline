'use strict';
// Frontlinie 3 – Grundlagen: Hilfsfunktionen, Spielstand, Tastatur, Töne.
const FL = window.FL = {};

FL.rand = (a, b) => a + Math.random() * (b - a);
FL.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
FL.lerp = (a, b, k) => a + (b - a) * k;
FL.pick = arr => arr[Math.floor(Math.random() * arr.length)];
FL.dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
FL.weighted = weights => {
  const keys = Object.keys(weights).filter(k => weights[k] > 0);
  let r = Math.random() * keys.reduce((s, k) => s + weights[k], 0);
  for (const k of keys) { r -= weights[k]; if (r <= 0) return k; }
  return keys[keys.length - 1];
};
// fester Zufall, damit eine Landschaft bei jedem Start gleich aussieht
FL.seeded = seed => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

FL.el = (tag, cls, html, parent) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined && html !== null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};

// ---------------------------------------------------------------- Spielstand
FL.SAVE_KEY = 'frontlinie3';
FL.defaultSave = () => ({ coins: 0, level: 0, up: {}, muted: false, towersOn: true, manual: null });
FL.loadSave = () => {
  try {
    const raw = localStorage.getItem(FL.SAVE_KEY);
    if (raw) return Object.assign(FL.defaultSave(), JSON.parse(raw));
  } catch (e) { /* kein Speicher verfügbar: dann eben ohne */ }
  return FL.defaultSave();
};
FL.store = () => {
  try { localStorage.setItem(FL.SAVE_KEY, JSON.stringify(FL.save)); } catch (e) { /* egal */ }
};
FL.save = FL.loadSave();

// ---------------------------------------------------------------- Tastatur
FL.keys = {};
FL.onKey = null;   // wird vom laufenden Modus oder Menü gesetzt
const BLOCK = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab'];
window.addEventListener('keydown', e => {
  if (BLOCK.includes(e.code)) e.preventDefault();
  FL.audio.unlock();
  if (!e.repeat) {
    FL.keys[e.code] = true;
    if (e.code === 'KeyM') { FL.save.muted = !FL.save.muted; FL.store(); }
    if (FL.onKey) FL.onKey(e.code);
  }
});
window.addEventListener('keyup', e => { FL.keys[e.code] = false; });
window.addEventListener('blur', () => { FL.keys = {}; });
FL.down = (...codes) => codes.some(c => FL.keys[c]);

// ---------------------------------------------------------------- Töne (im Browser erzeugt, keine Dateien nötig)
FL.audio = {
  ctx: null, noise: null, out: null, last: {}, eng: {},
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const n = c.sampleRate * 2;
      this.noise = c.createBuffer(1, n, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      // alles läuft über einen Begrenzer, damit laute Stellen nicht kratzen
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
      const master = c.createGain(); master.gain.value = 0.9;
      master.connect(comp); comp.connect(c.destination);
      this.out = master;
      // läuft ein Motor nicht mehr (Pause, Menü, Ton aus), wird er leise
      setInterval(() => {
        const now = performance.now();
        for (const k in this.eng) { const e = this.eng[k]; if (e.live && (now - e.t > 220 || FL.save.muted)) { e.live = false; e.main.gain.setTargetAtTime(0, c.currentTime, 0.12); } }
      }, 100);
    } catch (e) { this.ctx = null; }
  },
  tone(f, dur, type, vol, slide, delay) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + dur + 0.02);
  },
  // Rauschen durch einen Filter: der Grundstoff für Schüsse, Explosionen und Wind
  burst(dur, vol, freq, q, delay, type, endF) {
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    f.type = type || 'lowpass'; f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(50, endF || freq * 0.2), t + dur);
    f.Q.value = q || 0.7;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out);
    s.start(t, Math.random() * 1.2, dur + 0.05);
  },
  // Dauerton für Triebwerk ('jet') oder Panzermotor ('tank'). level 0 bis 1, ab = Nachbrenner. Muss jedes Bild neu gerufen werden.
  engine(kind, level, ab) {
    const c = this.ctx;
    if (!c || FL.save.muted) return;
    let e = this.eng[kind];
    if (!e) {
      e = this.eng[kind] = { live: false, t: 0 };
      const src = () => { const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; s.start(); return s; };
      const chain = (node, type, f, q) => { const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; node.connect(fl); fl.connect(g); g.connect(e.main); return { f: fl, g }; };
      e.main = c.createGain(); e.main.gain.value = 0; e.main.connect(this.out);
      e.hiss = chain(src(), 'bandpass', 900, 1.1);          // Pfeifen und Rauschen der Turbine
      e.rumble = chain(src(), 'lowpass', 180, 0.8);        // tiefes Grollen
      e.osc = c.createOscillator(); e.osc.type = 'sawtooth'; e.osc.start();
      e.drone = chain(e.osc, 'lowpass', 400, 0.7);         // Grundton
      e.osc2 = c.createOscillator(); e.osc2.type = kind === 'jet' ? 'sine' : 'square'; e.osc2.start();
      e.whine = chain(e.osc2, 'lowpass', 6000, 0.7);
    }
    const t = c.currentTime, set = (p, v) => p.setTargetAtTime(v, t, 0.12);
    level = FL.clamp(level, 0, 1); ab = ab || 0;
    if (kind === 'jet') {
      set(e.hiss.f.frequency, 500 + 2100 * level); set(e.hiss.g.gain, 0.04 + 0.13 * level + 0.08 * ab);
      set(e.rumble.f.frequency, 150 + 130 * level + 260 * ab); set(e.rumble.g.gain, 0.05 + 0.1 * level + 0.5 * ab);
      set(e.osc.frequency, 55 + 60 * level); set(e.drone.g.gain, 0.015 + 0.02 * level + 0.03 * ab);
      set(e.osc2.frequency, 900 + 2600 * level); set(e.whine.g.gain, 0.004 + 0.008 * level);
    } else {
      set(e.hiss.f.frequency, 300 + 500 * level); set(e.hiss.g.gain, 0.02 + 0.05 * level);
      set(e.rumble.f.frequency, 90 + 110 * level); set(e.rumble.g.gain, 0.12 + 0.22 * level);
      set(e.osc.frequency, 34 + 46 * level); set(e.drone.g.gain, 0.05 + 0.05 * level);
      set(e.osc2.frequency, 17 + 23 * level); set(e.whine.g.gain, 0.02 + 0.02 * level);
    }
    e.t = performance.now();
    if (!e.live) { e.live = true; e.main.gain.setTargetAtTime(1, t, 0.15); }
  },
  play(name) {
    if (!this.ctx || FL.save.muted) return;
    // nicht denselben Ton dutzendfach im selben Augenblick
    const now = performance.now();
    if (now - (this.last[name] || 0) < 40) return;
    this.last[name] = now;
    const B = (...a) => this.burst(...a), T = (...a) => this.tone(...a);
    switch (name) {
      case 'shot': B(0.1, 0.3, 3400); B(0.035, 0.22, 6500, 1.5, 0, 'bandpass', 4000); T(210, 0.06, 'square', 0.07, -140); T(75, 0.09, 'sine', 0.16, -35); break;
      case 'eshot': B(0.08, 0.09, 2200); T(120, 0.06, 'sine', 0.05, -50); break;
      case 'laser': T(1300, 0.1, 'sawtooth', 0.05, -900); break;
      case 'rocket': B(0.9, 0.34, 900, 1.6, 0, 'bandpass', 3200); B(0.12, 0.3, 2500); T(140, 0.5, 'sawtooth', 0.05, 260); break;
      case 'hit': B(0.05, 0.12, 3000, 2, 0, 'bandpass'); T(420, 0.05, 'square', 0.04, -150); break;
      case 'ouch': B(0.16, 0.3, 1400); T(180, 0.18, 'square', 0.1, -110); T(60, 0.2, 'sine', 0.25, -20); break;
      case 'pop': B(0.22, 0.2, 1200); T(110, 0.16, 'sine', 0.14, -50); break;
      case 'cannon': B(0.06, 0.5, 6000, 1, 0, 'bandpass', 2500); B(0.55, 0.6, 1300); T(120, 0.3, 'sine', 0.45, -80); T(52, 0.55, 'sine', 0.35, -20); B(1.3, 0.12, 500, 0.7, 0.12); break;
      case 'boom': B(0.05, 0.4, 5000, 1, 0, 'bandpass', 2000); B(0.9, 0.7, 1000); T(78, 0.55, 'sine', 0.5, -45); B(1.8, 0.16, 380, 0.7, 0.18); B(0.3, 0.1, 3500, 3, 0.06, 'bandpass'); break;
      case 'bigboom': B(0.07, 0.5, 5000, 1, 0, 'bandpass', 1800); B(1.5, 0.85, 800); T(60, 1.0, 'sine', 0.6, -32); T(42, 1.3, 'sine', 0.4, -10, 0.18); B(2.6, 0.2, 320, 0.7, 0.25); B(0.5, 0.12, 3000, 3, 0.1, 'bandpass'); B(0.4, 0.1, 2400, 3, 0.45, 'bandpass'); break;
      case 'ping': T(1600, 0.06, 'triangle', 0.05, -500); break;
      case 'up': T(520, 0.1, 'square', 0.07); T(780, 0.18, 'square', 0.07, 0, 0.1); break;
      case 'coin': T(990, 0.07, 'triangle', 0.09); T(1320, 0.2, 'triangle', 0.09, 0, 0.07); break;
      case 'alarm': T(640, 0.3, 'sawtooth', 0.06, 180); T(820, 0.3, 'sawtooth', 0.06, -180, 0.3); break;
      case 'jet': B(2.2, 0.3, 600, 2.2, 0, 'bandpass', 2600); B(2.2, 0.25, 260, 0.8, 0.3); break;
      case 'click': T(700, 0.04, 'square', 0.04); break;
      case 'drop': T(1500, 1.3, 'sine', 0.05, -1050); B(0.15, 0.15, 800); break;
      case 'gear': T(150, 0.6, 'sawtooth', 0.045, -30); B(0.6, 0.06, 1800, 3, 0, 'bandpass', 1500); B(0.09, 0.35, 700, 0.7, 0.6); T(90, 0.1, 'sine', 0.2, -30, 0.6); break;
    }
  }
};
window.addEventListener('pointerdown', () => FL.audio.unlock());
