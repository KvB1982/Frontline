'use strict';
// Frontlinie 3 – Steuerung per Finger (iPad, Tablet, Handy). Die Knöpfe drücken einfach die passenden Tasten.
(() => {
  const T = FL.touch = { active: false, layer: null, held: new Map(), swipe: 0 };
  const press = code => { if (!FL.keys[code]) { FL.keys[code] = true; if (FL.onKey) FL.onKey(code); } };
  const release = code => { FL.keys[code] = false; };
  const btnAt = (x, y) => { const e = document.elementFromPoint(x, y); return e && e.closest ? e.closest('.tbtn') : null; };

  // Sobald einmal ein Finger den Bildschirm berührt, gilt das Gerät als Touch-Gerät.
  const enable = () => {
    if (T.active) return;
    T.active = true;
    document.body.classList.add('touch');
    if (T.pending) { const p = T.pending; T.pending = null; T.show(p.kind, p.lo); }
  };
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') enable(); }, true);
  window.addEventListener('touchend', () => FL.audio.unlock(), { passive: true });
  // kein Zoomen und kein Verschieben der Seite mitten im Spiel
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  document.addEventListener('contextmenu', e => { if (T.active) e.preventDefault(); });

  const down = e => {
    const b = btnAt(e.clientX, e.clientY);
    if (!b) return;
    e.preventDefault();
    T.held.set(e.pointerId, b);
    b.classList.add('on'); press(b.dataset.code);
    if (navigator.vibrate && b.dataset.tap) navigator.vibrate(8);
  };
  const move = e => {
    const cur = T.held.get(e.pointerId);
    if (!cur || !cur.dataset.slide) return;
    // mit dem Finger über das Steuerkreuz rutschen wechselt die Richtung
    const b = btnAt(e.clientX, e.clientY);
    if (b && b !== cur && b.dataset.slide) {
      cur.classList.remove('on'); release(cur.dataset.code);
      T.held.set(e.pointerId, b);
      b.classList.add('on'); press(b.dataset.code);
    }
  };
  const up = e => {
    const cur = T.held.get(e.pointerId);
    if (!cur) return;
    T.held.delete(e.pointerId);
    cur.classList.remove('on');
    if (![...T.held.values()].some(o => o.dataset.code === cur.dataset.code)) release(cur.dataset.code);
  };

  const make = (parent, label, code, cls, opt) => {
    const b = FL.el('div', 'tbtn ' + (cls || ''), label, parent);
    b.dataset.code = code;
    if (opt && opt.slide) b.dataset.slide = '1';
    if (opt && opt.tap) b.dataset.tap = '1';
    return b;
  };

  // ---------------------------------------------------------------- Steuern durch Neigen (wie ein Steuerknüppel)
  // Das Gerät wird quer gehalten. Wie ein Lenkrad nach links oder rechts drehen = Kurve.
  // Oberkante zu sich ziehen = Nase hoch, von sich weg kippen = Nase runter.
  const G = FL.tilt = { on: false, turn: 0, climb: 0, zero: null, last: null, listening: false, onChange: null };
  const ROLL_FULL = 24, PITCH_FULL = 16, DEAD = 2.5;     // Grad für vollen Ausschlag, kleine Bewegungen zählen nicht
  const curve = (deg, full) => {
    const a = Math.abs(deg);
    if (a < DEAD) return 0;
    return Math.sign(deg) * Math.min(1, (a - DEAD) / (full - DEAD));
  };
  const onOrient = e => {
    if (e.beta === null || e.gamma === null) return;
    const b = e.beta * Math.PI / 180, g = e.gamma * Math.PI / 180;
    // Richtung "oben" aus Sicht des Geräts, dann auf den gedrehten Bildschirm umgerechnet
    const ux = -Math.cos(b) * Math.sin(g), uy = Math.sin(b), uz = Math.cos(b) * Math.cos(g);
    const so = window.screen && screen.orientation;
    const th = ((so && typeof so.angle === 'number' ? so.angle : (window.orientation || 0)) * Math.PI) / 180;
    const sx = ux * Math.cos(th) - uy * Math.sin(th), sy = ux * Math.sin(th) + uy * Math.cos(th);
    const roll = Math.asin(FL.clamp(sx, -1, 1)) * 180 / Math.PI;      // positiv: linke Seite tiefer = Linkskurve
    const pitch = Math.atan2(sy, uz) * 180 / Math.PI;                  // 90 = Gerät steht senkrecht, 0 = liegt flach
    G.last = pitch;
    if (G.zero === null) G.zero = pitch;
    G.turn = curve(roll, ROLL_FULL);
    G.climb = curve(pitch - G.zero, PITCH_FULL);
  };
  G.center = () => { if (G.last !== null) G.zero = G.last; };
  G.listen = () => {
    if (G.listening) return;
    G.listening = true;
    window.addEventListener('deviceorientation', onOrient);
  };
  // Muss direkt aus einem Fingertipp heraus aufgerufen werden: iPad und iPhone fragen dann einmal um Erlaubnis.
  G.start = byUser => {
    const D = window.DeviceOrientationEvent;
    if (!D) { if (byUser) FL.hud.msg('Dieses Gerät hat keinen Neigungssensor', '#9fb0bd', true); return; }
    const go = () => {
      G.listen(); G.on = true; G.zero = null; G.turn = G.climb = 0;
      if (byUser) { FL.save.tilt = true; FL.store(); }
      if (G.onChange) G.onChange();
    };
    if (typeof D.requestPermission === 'function') {
      D.requestPermission().then(r => {
        if (r === 'granted') go();
        else if (byUser) FL.hud.msg('Neigungssensor nicht erlaubt', '#ef5a4c', true);
      }).catch(() => {});
    } else go();
  };
  G.stop = byUser => {
    G.on = false; G.turn = G.climb = 0;
    if (byUser) { FL.save.tilt = false; FL.store(); }
    if (G.onChange) G.onChange();
  };

  T.show = (kind, lo) => {
    T.hide();
    if (!T.active) { T.pending = { kind, lo }; return; }
    const L = T.layer = FL.el('div', 'touch-layer', '');
    document.body.insertBefore(L, document.getElementById('screen'));
    for (const [ev, fn] of [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up]]) L.addEventListener(ev, fn);
    make(L, 'II', 'KeyP', 'tpause', { tap: true });
    const left = FL.el('div', 'tpad tleft', '', L), right = FL.el('div', 'tpad tright', '', L);
    const S = { slide: true }, TAP = { tap: true };
    if (kind === 'attack' || kind === 'defend') {
      // Wischen auf dem freien Bildschirm: links/rechts bewegt den Trupp, nach unten wischen und halten ist Deckung
      const area = FL.el('div', 'tswipe', '');
      L.insertBefore(area, L.firstChild);
      let sw = null;
      const end = e => { if (sw && e.pointerId === sw.id) { if (sw.cover) release('ArrowDown'); sw = null; } };
      area.addEventListener('pointerdown', e => { if (!sw) sw = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, cover: false }; });
      area.addEventListener('pointermove', e => {
        if (!sw || e.pointerId !== sw.id) return;
        const dy = e.clientY - sw.y0, dx = e.clientX - sw.x0;
        if (!sw.cover && dy > 45 && dy > Math.abs(dx) * 1.2) { sw.cover = true; press('ArrowDown'); }
        else if (sw.cover && dy < 15) { sw.cover = false; release('ArrowDown'); }
        if (!sw.cover) T.swipe += e.clientX - sw.x;
        sw.x = e.clientX;
        if (sw.cover) { sw.x0 = e.clientX; }
      });
      area.addEventListener('pointerup', end); area.addEventListener('pointercancel', end);
      T.endSwipe = () => { if (sw && sw.cover) release('ArrowDown'); sw = null; };
      left.classList.add('row');
      make(left, '◀', 'ArrowLeft', 'big', S); make(left, '▶', 'ArrowRight', 'big', S);
      make(right, 'FEUER', 'Space', 'fire');
      make(right, 'Deckung', 'ArrowDown', 'wide cover');
      const extra = FL.el('div', 'textra', '', right);
      make(extra, 'Helfen', 'KeyE', 'small');
      if (lo.towers) make(extra, 'Türme', 'KeyX', 'small cyan', TAP);
      if (lo.drones) make(extra, '1', 'Digit1', 'small orange', TAP);
      if (lo.heli) make(extra, '2', 'Digit2', 'small orange', TAP);
      if (lo.bomber) make(extra, '3', 'Digit3', 'small orange', TAP);
      if (kind === 'attack') make(extra, 'Vor', 'KeyV', 'small gold', TAP);
    } else {
      left.classList.add('dpad');
      make(left, '▲', 'ArrowUp', 'big up', S); make(left, '◀', 'ArrowLeft', 'big lf', S);
      make(left, '▶', 'ArrowRight', 'big rt', S); make(left, '▼', 'ArrowDown', 'big dn', S);
      make(right, 'FEUER', 'Space', 'fire');
      const extra = FL.el('div', 'textra', '', right);
      if (kind === 'flight') {
        make(right, 'BOMBE', 'KeyB', 'wide bomb');
        // Neigungssteuerung: an/aus und Mittelstellung neu setzen
        const bar = FL.el('div', 'ttilt', '', L);
        const tog = FL.el('div', 'tchip', '', bar), mid = FL.el('div', 'tchip', 'Mitte neu', bar);
        const draw = () => {
          const on = FL.tilt.on;
          tog.textContent = 'Neigen: ' + (on ? 'an' : 'aus');
          tog.classList.toggle('on', on);
          mid.style.display = on ? '' : 'none';
          left.style.display = on ? 'none' : '';
        };
        FL.tilt.onChange = draw;
        tog.addEventListener('click', () => { if (FL.tilt.on) FL.tilt.stop(true); else FL.tilt.start(true); });
        mid.addEventListener('click', () => FL.tilt.center());
        draw();
        if (lo.p_rocket) make(extra, 'Rakete', 'KeyR', 'small rk');
      } else {
        make(extra, 'Turm ◀', 'KeyA', 'small'); make(extra, 'Mitte', 'KeyW', 'small'); make(extra, 'Turm ▶', 'KeyD', 'small');
      }
    }
  };
  T.hide = () => {
    T.pending = null;
    if (T.endSwipe) { T.endSwipe(); T.endSwipe = null; }
    T.swipe = 0;
    FL.tilt.onChange = null;
    for (const b of T.held.values()) release(b.dataset.code);
    T.held.clear();
    if (T.layer) { T.layer.remove(); T.layer = null; }
  };
})();
