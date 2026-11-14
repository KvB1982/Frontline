'use strict';
// Frontlinie 3 – Steuerung per Finger (iPad, Tablet, Handy). Die Knöpfe drücken einfach die passenden Tasten.
(() => {
  const T = FL.touch = { active: false, layer: null, held: new Map(), swipe: 0 };
  // runder Steuerknüppel: x nach rechts, y nach vorn (oben), jeweils -1 bis 1
  FL.stick = { x: 0, y: 0 };
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
  // Die Haltung beim Kalibrieren ist die Mitte. Von dort aus: wie ein Lenkrad nach links oder rechts drehen = Kurve,
  // Oberkante zu sich ziehen = Nase hoch, von sich weg kippen = Nase runter.
  const G = FL.tilt = { on: false, air: false, turn: 0, climb: 0, u: null, u0: null, th: null, sure: false, land: null, listening: false, onChange: null, dot: null };
  const ROLL_FULL = 22, PITCH_FULL = 16, DEAD = 2.5, DEG = 180 / Math.PI;     // Grad für vollen Ausschlag, kleine Bewegungen zählen nicht
  const curve = (deg, full) => {
    const a = Math.abs(deg);
    if (a < DEAD) return 0;
    return Math.sign(deg) * Math.min(1, (a - DEAD) / (full - DEAD));
  };
  const wrapDeg = d => { while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
  // Richtung "oben" vom Gerät aus gesehen, umgerechnet auf den gedrehten Bildschirm: [nach rechts, nach oben, aus dem Bildschirm heraus]
  const onScreen = (u, th) => [u[0] * Math.cos(th) - u[1] * Math.sin(th), u[0] * Math.sin(th) + u[1] * Math.cos(th), u[2]];
  const isLand = () => window.innerWidth >= window.innerHeight;
  // Wie herum der Bildschirm gedreht ist, verrät die Schwerkraft selbst: Die Oberkante des Bildes zeigt nach oben.
  // (Auf die Angabe des Browsers ist auf dem iPad kein Verlass, sie dient nur als Notlösung, wenn das Gerät flach liegt.)
  const pickAngle = u => {
    const land = G.land = isLand(), cands = land ? [90, 270] : [0, 180];
    const sy = onScreen(u, cands[0] * Math.PI / 180)[1];
    if (Math.abs(sy) > 0.3) { G.sure = true; G.th = cands[sy > 0 ? 0 : 1] * Math.PI / 180; return; }
    G.sure = false;
    const so = window.screen && screen.orientation;
    const rep = (((so && typeof so.angle === 'number' ? so.angle : (window.orientation || 0)) % 360) + 360) % 360;
    const old = G.th === null ? -1 : Math.round(G.th * DEG);
    G.th = (cands.includes(rep) ? rep : cands.includes(old) ? old : cands[0]) * Math.PI / 180;
  };
  const calibrate = () => { pickAngle(G.u); G.u0 = G.u.slice(); G.needCal = false; };
  const onOrient = e => {
    if (e.beta === null || e.gamma === null || e.beta === undefined) return;
    const b = e.beta / DEG, g = e.gamma / DEG;
    const u = G.u = [-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g)];
    if (!G.u0 || G.needCal || G.land !== isLand()) calibrate();
    let s = onScreen(u, G.th);
    // lag das Gerät beim Kalibrieren flach, klärt sich die Drehung, sobald es angehoben wird
    if (!G.sure && Math.abs(s[1]) > 0.42) { G.sure = true; if (s[1] < 0) { G.th += Math.PI; s = onScreen(u, G.th); } }
    const n = onScreen(G.u0, G.th);
    const lim = v => Math.asin(FL.clamp(v, -1, 1)) * DEG;
    const roll = lim(s[0]) - lim(n[0]);                                               // positiv: linke Seite tiefer = Linkskurve
    const pitch = wrapDeg((Math.atan2(s[1], s[2]) - Math.atan2(n[1], n[2])) * DEG);   // positiv: Oberkante zu sich gezogen
    G.turn = G.on ? curve(roll, ROLL_FULL) : 0;
    G.climb = G.on ? curve(pitch, PITCH_FULL) : 0;
    if (G.dot) G.dot.style.transform = `translate(${-G.turn * 15}px,${G.climb * 15}px)`;
  };
  // Die aktuelle Haltung wird die neue Mitte.
  G.center = quiet => {
    if (G.u) calibrate(); else G.needCal = true;
    G.turn = G.climb = 0;
    if (!quiet) FL.hud.msg(G.u ? 'Kalibriert: Diese Haltung ist jetzt die Mitte' : 'Noch kein Signal vom Neigungssensor', G.u ? '#46dcff' : '#ef5a4c', true);
  };
  G.listen = () => {
    if (G.listening) return;
    G.listening = true;
    window.addEventListener('deviceorientation', onOrient);
    window.addEventListener('orientationchange', () => { G.needCal = true; });
  };
  // Muss direkt aus einem Fingertipp heraus aufgerufen werden: iPad und iPhone fragen dann einmal um Erlaubnis.
  G.start = byUser => {
    const D = window.DeviceOrientationEvent;
    if (!D) { if (byUser) FL.hud.msg('Dieses Gerät hat keinen Neigungssensor', '#9fb0bd', true); return; }
    const go = () => {
      G.listen(); G.on = true; G.needCal = true; G.turn = G.climb = 0;
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
      if (lo.towers) make(extra, 'Geschütz', 'KeyX', 'small cyan', TAP);
      if (lo.drones) make(extra, '1', 'Digit1', 'small orange', TAP);
      if (lo.heli) make(extra, '2', 'Digit2', 'small orange', TAP);
      if (lo.bomber) make(extra, '3', 'Digit3', 'small orange', TAP);
      if (lo.arty) make(extra, '4', 'Digit4', 'small orange', TAP);
      if (kind === 'attack') make(extra, 'Vor', 'KeyV', 'small gold', TAP);
    } else {
      // runder Steuerknüppel wie auf einem Gamepad: in jede Richtung ziehen, je weiter desto stärker
      const stick = FL.el('div', 'tstick', '', left), knob = FL.el('div', 'tknob', '', stick);
      let sid = null;
      const setS = e => {
        const r = stick.getBoundingClientRect(), R = r.width / 2, M = R * 0.6;
        let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
        const d = Math.hypot(dx, dy);
        if (d > M) { dx *= M / d; dy *= M / d; }
        knob.style.transform = `translate(${dx}px,${dy}px)`;
        let x = dx / M, y = -dy / M;
        const m = Math.hypot(x, y);
        if (m < 0.15) x = y = 0; else { const k = (m - 0.15) / 0.85 / m; x *= k; y *= k; }
        FL.stick.x = x; FL.stick.y = y;
      };
      const endS = e => { if (e.pointerId !== sid) return; sid = null; FL.stick.x = FL.stick.y = 0; knob.style.transform = ''; stick.classList.remove('on'); };
      stick.addEventListener('pointerdown', e => { if (sid !== null) return; e.preventDefault(); sid = e.pointerId; try { stick.setPointerCapture(sid); } catch (err) {} stick.classList.add('on'); setS(e); });
      stick.addEventListener('pointermove', e => { if (e.pointerId === sid) setS(e); });
      stick.addEventListener('pointerup', endS); stick.addEventListener('pointercancel', endS);
      make(right, 'FEUER', 'Space', 'fire');
      const extra = FL.el('div', 'textra', '', right);
      if (kind === 'flight') {
        make(right, 'BOMBE', 'KeyB', 'wide bomb');
        // Neigungssteuerung: an/aus und Mittelstellung neu setzen
        const bar = FL.el('div', 'ttilt', '', L);
        const tog = FL.el('div', 'tchip', '', bar), mid = FL.el('div', 'tchip cal', 'Kalibrieren', bar);
        const gauge = FL.el('div', 'tgauge', '', bar);
        FL.tilt.dot = FL.el('i', '', '', gauge);
        const draw = () => {
          const on = FL.tilt.on;
          tog.textContent = 'Neigen: ' + (on ? 'an' : 'aus');
          tog.classList.toggle('on', on);
          mid.style.display = gauge.style.display = on ? '' : 'none';
          // am Boden (laufen, rollen) braucht man den Steuerknüppel, in der Luft ersetzt das Neigen ihn
          left.style.display = on && FL.tilt.air ? 'none' : '';
          if (left.style.display) FL.stick.x = FL.stick.y = 0;
        };
        FL.tilt.onChange = draw;
        tog.addEventListener('click', () => { if (FL.tilt.on) FL.tilt.stop(true); else FL.tilt.start(true); });
        mid.addEventListener('pointerdown', e => { e.preventDefault(); FL.tilt.center(); mid.classList.add('flash'); setTimeout(() => mid.classList.remove('flash'), 350); });
        draw();
        if (lo.p_rocket) make(extra, 'Rakete', 'KeyR', 'small rk');
      } else {
        make(extra, 'Turm ◀', 'KeyA', 'small'); make(extra, 'Mitte', 'KeyW', 'small'); make(extra, 'Turm ▶', 'KeyD', 'small');
        FL.SPECIALS.forEach((sp, i) => { if (lo[sp.id]) make(extra, sp.key, 'Digit' + sp.key, 'small orange', TAP); });
      }
    }
  };
  T.hide = () => {
    T.pending = null;
    if (T.endSwipe) { T.endSwipe(); T.endSwipe = null; }
    T.swipe = 0;
    FL.tilt.onChange = null; FL.tilt.dot = null;
    FL.stick.x = FL.stick.y = 0;
    for (const b of T.held.values()) release(b.dataset.code);
    T.held.clear();
    if (T.layer) { T.layer.remove(); T.layer = null; }
  };
})();
