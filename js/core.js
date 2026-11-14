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
  ctx: null, noise: null, last: {},
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const n = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, n, n);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
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
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  burst(dur, vol, freq, q) {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.2), t + dur);
    f.Q.value = q || 0.7;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(c.destination);
    s.start(t, Math.random() * 0.5, dur + 0.05);
  },
  play(name) {
    if (!this.ctx || FL.save.muted) return;
    // nicht denselben Ton dutzendfach im selben Augenblick
    const now = performance.now();
    if (now - (this.last[name] || 0) < 40) return;
    this.last[name] = now;
    switch (name) {
      case 'shot': this.burst(0.09, 0.22, 2600); this.tone(160, 0.08, 'square', 0.05, -80); break;
      case 'eshot': this.burst(0.07, 0.07, 1800); break;
      case 'laser': this.tone(1300, 0.1, 'sawtooth', 0.05, -900); break;
      case 'hit': this.tone(420, 0.05, 'square', 0.04, -150); break;
      case 'ouch': this.tone(300, 0.14, 'square', 0.09, -180); break;
      case 'pop': this.tone(520, 0.1, 'triangle', 0.08, -300); break;
      case 'cannon': this.burst(0.45, 0.5, 900); this.tone(90, 0.3, 'sine', 0.3, -40); break;
      case 'boom': this.burst(0.7, 0.6, 700); this.tone(60, 0.5, 'sine', 0.35, -25); break;
      case 'bigboom': this.burst(1.4, 0.8, 500); this.tone(48, 1.0, 'sine', 0.45, -20); break;
      case 'ping': this.tone(1600, 0.06, 'triangle', 0.05, -500); break;
      case 'up': this.tone(520, 0.1, 'square', 0.07); this.tone(780, 0.18, 'square', 0.07, 0, 0.1); break;
      case 'coin': this.tone(990, 0.07, 'triangle', 0.09); this.tone(1320, 0.2, 'triangle', 0.09, 0, 0.07); break;
      case 'alarm': this.tone(440, 0.28, 'sawtooth', 0.08, -200); break;
      case 'jet': this.burst(1.6, 0.25, 1400, 2); break;
      case 'click': this.tone(700, 0.04, 'square', 0.04); break;
      case 'drop': this.tone(900, 0.5, 'sine', 0.05, -700); break;
    }
  }
};
window.addEventListener('pointerdown', () => FL.audio.unlock());
