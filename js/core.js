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
FL.BUILD = 9;      // wie CURRENT_PROJECT_VERSION im Xcode-Projekt; steht auf dem Steuerknüppel-Bildschirm, damit man beide Geräte vergleichen kann
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
// Maus: Klick ins Spielbild feuert (wie die Leertaste), das Mausrad stellt beim Panzer die Kanone höher oder tiefer
FL.wheel = 0;
window.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  const t = e.target;
  if (t && t.closest && t.closest('button, a, input, select, .btn, .screen, .menu, .touch-layer, .pausebtn')) return;
  FL.keys.Mouse0 = true;
});
window.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') FL.keys.Mouse0 = false; });
window.addEventListener('wheel', e => { FL.wheel += e.deltaY; }, { passive: true });

// ---------------------------------------------------------------- Töne (im Browser erzeugt, keine Dateien nötig)
FL.audio = {
  ctx: null, noise: null, out: null, last: {}, eng: {}, buf: {},
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
      this.loadSamples();
    } catch (e) { this.ctx = null; }
  },
  // aufgenommene Geräusche aus sounds/pack.js nachladen. Fehlt die Datei, bleiben die erzeugten Töne.
  loadSamples() {
    const s = document.createElement('script');
    s.src = 'sounds/pack.js';
    s.onload = () => {
      const all = FL.SND || {};
      for (const name in all) {
        try {
          const bin = atob(all[name]), u = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          const done = b => { this.buf[name] = b; };
          const p = this.ctx.decodeAudioData(u.buffer, done, () => {});
          if (p && p.catch) p.catch(() => {});
        } catch (e) { /* dieser Ton bleibt erzeugt */ }
      }
      FL.SND = null;
    };
    s.onerror = () => {};
    document.head.appendChild(s);
  },
  // spielt eine Aufnahme ab, falls sie geladen ist
  sample(name, vol, rate) {
    const b = this.buf[name];
    if (!b) return false;
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain();
    s.buffer = b; s.playbackRate.value = rate || 1; g.gain.value = vol;
    s.connect(g); g.connect(this.out); s.start();
    return true;
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
  // Hubschrauber: Rauschen, das im Takt der Rotorblätter lauter und leiser wird, dazu das Pfeifen der Turbine
  heliEngine(level) {
    const c = this.ctx;
    let e = this.eng.heli;
    if (!e) {
      e = this.eng.heli = { live: false, t: 0 };
      e.main = c.createGain(); e.main.gain.value = 0; e.main.connect(this.out);
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; s.start();
      e.f = c.createBiquadFilter(); e.f.type = 'lowpass'; e.f.frequency.value = 240; e.f.Q.value = 0.8;
      e.chop = c.createGain(); e.chop.gain.value = 0.5;
      e.lfo = c.createOscillator(); e.lfo.type = 'sawtooth'; e.lfo.frequency.value = 11; e.lfo.start();
      e.depth = c.createGain(); e.depth.gain.value = 0.45; e.lfo.connect(e.depth); e.depth.connect(e.chop.gain);
      e.vol = c.createGain(); e.vol.gain.value = 0;
      s.connect(e.f); e.f.connect(e.chop); e.chop.connect(e.vol); e.vol.connect(e.main);
      e.osc = c.createOscillator(); e.osc.type = 'sawtooth'; e.osc.start();
      e.wf = c.createBiquadFilter(); e.wf.type = 'bandpass'; e.wf.frequency.value = 1400; e.wf.Q.value = 2;
      e.whine = c.createGain(); e.whine.gain.value = 0;
      e.osc.connect(e.wf); e.wf.connect(e.whine); e.whine.connect(e.main);
    }
    const t = c.currentTime, set = (p, v) => p.setTargetAtTime(v, t, 0.15);
    level = FL.clamp(level, 0, 1);
    set(e.lfo.frequency, 8 + 6 * level); set(e.f.frequency, 190 + 160 * level); set(e.vol.gain, 0.5 + 0.9 * level);
    set(e.osc.frequency, 700 + 500 * level); set(e.whine.gain, 0.006 + 0.01 * level);
    e.t = performance.now();
    if (!e.live) { e.live = true; e.main.gain.setTargetAtTime(1, t, 0.15); }
  },
  engine(kind, level, ab) {
    const c = this.ctx;
    if (!c || FL.save.muted) return;
    if (kind === 'heli') return this.heliEngine(level);
    let e = this.eng[kind];
    // mit Aufnahme: eine Endlosschleife, deren Tonhöhe und Lautstärke dem Schub folgen
    const loopName = kind === 'jet' ? 'jetloop' : 'tankloop';
    if ((!e || !e.rec) && this.buf[loopName]) {
      if (e) { try { e.main.disconnect(); } catch (err) {} }
      e = this.eng[kind] = { live: false, t: 0, rec: true };
      e.main = c.createGain(); e.main.gain.value = 0; e.main.connect(this.out);
      const lp = name => {
        const s = c.createBufferSource(), g = c.createGain(), b = this.buf[name];
        s.buffer = b; s.loop = true; s.loopStart = 0.05; s.loopEnd = b.duration - 0.07; g.gain.value = 0;
        s.connect(g); g.connect(e.main); s.start(0, 0.05);
        return { s, g };
      };
      e.a = lp(loopName);
      if (kind === 'jet' && this.buf.abloop) e.b = lp('abloop');
    }
    if (e && e.rec) {
      const t = c.currentTime, set = (p, v) => p.setTargetAtTime(v, t, 0.12);
      level = FL.clamp(level, 0, 1); ab = ab || 0;
      if (kind === 'jet') { set(e.a.s.playbackRate, 0.72 + 0.5 * level); set(e.a.g.gain, 0.16 + 0.5 * level); if (e.b) { set(e.b.g.gain, ab * 0.9); set(e.b.s.playbackRate, 0.95); } }
      else { set(e.a.s.playbackRate, 0.8 + 0.45 * level); set(e.a.g.gain, 0.28 + 0.45 * level); }
      e.t = performance.now();
      if (!e.live) { e.live = true; e.main.gain.setTargetAtTime(1, t, 0.15); }
      return;
    }
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
      case 'shot': if (this.sample('mg' + (1 + Math.floor(Math.random() * 3)), 0.55, (0.94 + Math.random() * 0.12))) break;
        B(0.1, 0.3, 3400); B(0.035, 0.22, 6500, 1.5, 0, 'bandpass', 4000); T(210, 0.06, 'square', 0.07, -140); T(75, 0.09, 'sine', 0.16, -35); break;
      case 'eshot': if (this.sample('gun', 0.2, 1.12 + Math.random() * 0.2)) break;
        B(0.08, 0.09, 2200); T(120, 0.06, 'sine', 0.05, -50); break;
      case 'laser': T(1300, 0.1, 'sawtooth', 0.05, -900); break;
      case 'rocket': if (this.sample('rocket', 0.8, (0.94 + Math.random() * 0.12))) break;
        B(0.9, 0.34, 900, 1.6, 0, 'bandpass', 3200); B(0.12, 0.3, 2500); T(140, 0.5, 'sawtooth', 0.05, 260); break;
      case 'hit': B(0.05, 0.12, 3000, 2, 0, 'bandpass'); T(420, 0.05, 'square', 0.04, -150); break;
      case 'ouch': B(0.16, 0.3, 1400); T(180, 0.18, 'square', 0.1, -110); T(60, 0.2, 'sine', 0.25, -20); break;
      case 'pop': B(0.22, 0.2, 1200); T(110, 0.16, 'sine', 0.14, -50); break;
      case 'cannon': if (this.sample('shot' + (1 + Math.floor(Math.random() * 4)), 1.0, 0.92 + Math.random() * 0.16)) { B(0.05, 0.3, 6000, 1, 0, 'bandpass', 2500); T(60, 0.35, 'sine', 0.3, -25); break; }
        B(0.06, 0.5, 6000, 1, 0, 'bandpass', 2500); B(0.55, 0.6, 1300); T(120, 0.3, 'sine', 0.45, -80); T(52, 0.55, 'sine', 0.35, -20); B(1.3, 0.12, 500, 0.7, 0.12); break;
      case 'boom': if (this.sample(Math.random() < 0.5 ? 'boom1' : 'boom2', 0.8, 0.9 + Math.random() * 0.2)) break;
        B(0.05, 0.4, 5000, 1, 0, 'bandpass', 2000); B(0.9, 0.7, 1000); T(78, 0.55, 'sine', 0.5, -45); B(1.8, 0.16, 380, 0.7, 0.18); B(0.3, 0.1, 3500, 3, 0.06, 'bandpass'); break;
      case 'bigboom': if (this.sample('bigboom', 0.9, (0.94 + Math.random() * 0.12))) { T(50, 1.0, 'sine', 0.35, -22); break; }
        B(0.07, 0.5, 5000, 1, 0, 'bandpass', 1800); B(1.5, 0.85, 800); T(60, 1.0, 'sine', 0.6, -32); T(42, 1.3, 'sine', 0.4, -10, 0.18); B(2.6, 0.2, 320, 0.7, 0.25); B(0.5, 0.12, 3000, 3, 0.1, 'bandpass'); B(0.4, 0.1, 2400, 3, 0.45, 'bandpass'); break;
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
