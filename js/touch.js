'use strict';
// Frontlinie 3 – Steuerung per Finger (iPad, Tablet, Handy). Die Knöpfe drücken einfach die passenden Tasten.
(() => {
  const T = FL.touch = { active: false, layer: null, held: new Map() };
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
        if (lo.p_rocket) make(extra, 'Rakete', 'KeyR', 'small rk');
      } else {
        make(extra, 'Turm ◀', 'KeyA', 'small'); make(extra, 'Mitte', 'KeyW', 'small'); make(extra, 'Turm ▶', 'KeyD', 'small');
      }
    }
  };
  T.hide = () => {
    T.pending = null;
    for (const b of T.held.values()) release(b.dataset.code);
    T.held.clear();
    if (T.layer) { T.layer.remove(); T.layer = null; }
  };
})();
