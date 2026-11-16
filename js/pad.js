'use strict';
// Frontlinie 3 – ein zweites Gerät als Steuerknüppel (nur in der App).
// Das iPad spielt ("host"), das iPhone steuert ("pad"). Beide finden sich direkt, ohne Internet.
// Das iPhone schickt Neigung, Schub und Knöpfe. Das iPad schickt Vibration und "neu kalibrieren" zurück.
(() => {
  const P = FL.pad = { role: null, state: 'off', peer: '', on: false, ctl: false, onChange: null, sim: null, ready: false };
  const plug = () => P.sim || (FL.native && window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.PadLink) || null;
  P.available = () => !!plug();
  const G = FL.tilt, T = FL.touch;
  const heldKeys = new Set();
  const press = code => { if (!FL.keys[code]) { FL.keys[code] = true; if (FL.onKey) FL.onKey(code); } };
  const release = code => { FL.keys[code] = false; };

  P.send = (msg, reliable) => {
    const p = plug();
    if (!p || P.state !== 'connected') return;
    try { const r = p.send({ d: JSON.stringify(msg), reliable: !!reliable }); if (r && r.catch) r.catch(() => {}); } catch (e) {}
  };

  // ---------------------------------------------------------------- iPad: Eingaben vom Steuerknüppel übernehmen
  const neutral = () => {
    G.turn = G.climb = 0; G.rollDeg = 0;
    FL.stick.x = FL.stick.y = 0;
    for (const c of heldKeys) release(c);
    heldKeys.clear();
  };
  const hostData = m => {
    if (m.k === 's') {
      if (!G.on) { G.on = true; if (G.onChange) G.onChange(); }
      const t = FL.clamp(+m.t || 0, -1, 1), c = FL.clamp(+m.c || 0, -1, 1);
      if (G.air) {
        // in der Luft: wie die Neigungssteuerung des iPads
        G.turn = t; G.climb = c; G.rollDeg = +m.r || 0;
        FL.stick.x = FL.stick.y = 0;
      } else {
        // am Boden (laufen, rollen, starten): Neigen wirkt wie der runde Steuerknüppel
        G.turn = 0; G.rollDeg = 0; G.climb = c;
        FL.stick.x = -t; FL.stick.y = -c;
      }
      if (FL.throttle.on) FL.throttle.v = FL.clamp(+m.v || 0, 0, 1);
    } else if (m.k === 'd' && typeof m.c === 'string') { heldKeys.add(m.c); press(m.c); }
    else if (m.k === 'u' && typeof m.c === 'string') { heldKeys.delete(m.c); release(m.c); }
  };

  // ---------------------------------------------------------------- iPhone: der Steuerknüppel-Bildschirm
  let ctl = null;
  const padData = m => {
    if (m.k === 'cal') { G.center(true); if (ctl) ctl.flash(); }
    else if (m.k === 'b' && FL.haptic) FL.haptic(m.s || 'LIGHT');
  };
  P.openController = onClose => {
    if (ctl) return;
    P.ctl = true;
    const root = FL.el('div', 'padctl', '', document.body);
    const status = FL.el('div', 'pc-status', '', root);
    const close = FL.el('div', 'pc-chip pc-close', '← Trennen', root);
    const mid = FL.el('div', 'pc-mid', '', root);
    const gauge = FL.el('div', 'pc-gauge', '<i></i>', mid), dot = gauge.querySelector('i');
    const cal = FL.el('div', 'pc-chip pc-cal', 'Kalibrieren', mid);
    FL.el('div', 'pc-help', 'iPhone quer halten wie ein Lenkrad.<br>Drehen = Kurve, kippen = hoch und runter.', mid);
    // Schubhebel links
    const thr = FL.el('div', 'pc-thr', '<span>NB</span><i></i><b></b><em></em>', root);
    const fill = thr.querySelector('i'), grip = thr.querySelector('b'), txt = thr.querySelector('em');
    let v = 0, tid = null;
    const setT = x => {
      v = FL.clamp(x, 0, 1);
      fill.style.height = `calc((100% - 28px) * ${v})`; grip.style.bottom = `calc(14px + (100% - 28px) * ${v})`;
      thr.classList.toggle('ab', v > 0.9);
      txt.textContent = v > 0.9 ? 'Nachbrenner' : 'Schub ' + Math.round(v / 0.9 * 100) + ' %';
    };
    const evT = e => { const r = thr.getBoundingClientRect(); setT(1 - (e.clientY - r.top - 14) / (r.height - 28)); };
    thr.addEventListener('pointerdown', e => { if (tid !== null) return; e.preventDefault(); tid = e.pointerId; try { thr.setPointerCapture(tid); } catch (err) {} evT(e); });
    thr.addEventListener('pointermove', e => { if (e.pointerId === tid) evT(e); });
    const endT = e => { if (e.pointerId === tid) tid = null; };
    thr.addEventListener('pointerup', endT); thr.addEventListener('pointercancel', endT);
    setT(0);
    // Knöpfe rechts
    const right = FL.el('div', 'pc-right', '', root);
    const key = (label, code, cls) => {
      const b = FL.el('div', 'pc-btn ' + (cls || ''), label, right);
      let id = null;
      const up = e => { if (e.pointerId !== id) return; id = null; b.classList.remove('on'); P.send({ k: 'u', c: code }, true); };
      b.addEventListener('pointerdown', e => {
        if (id !== null) return;
        e.preventDefault(); id = e.pointerId; try { b.setPointerCapture(id); } catch (err) {}
        b.classList.add('on'); P.send({ k: 'd', c: code }, true);
        if (FL.haptic) FL.haptic('LIGHT');
      });
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      return b;
    };
    key('Rolle ◀', 'KeyQ', 'small'); key('Rolle ▶', 'KeyE', 'small'); key('Pause', 'KeyP', 'small');
    key('Fahrwerk', 'KeyG', 'small cyan'); key('Klappen', 'KeyF', 'small cyan'); key('Rakete', 'KeyR', 'small orange');
    key('BOMBE', 'KeyB', 'bomb'); key('FEUER', 'Space', 'fire');

    const flash = () => { cal.classList.add('flash'); setTimeout(() => cal.classList.remove('flash'), 350); };
    cal.addEventListener('pointerdown', e => { e.preventDefault(); G.center(true); flash(); });
    const draw = () => {
      status.textContent = P.state === 'connected' ? 'Verbunden mit ' + (P.peer || 'iPad') : P.state === 'error' ? 'Verbindung nicht möglich. Bitte WLAN oder Bluetooth einschalten.' : 'Suche das iPad … (dort im Menü „Steuerknüppel“ einschalten)';
      root.classList.toggle('live', P.state === 'connected');
    };
    // 30-mal in der Sekunde die Haltung schicken
    const timer = setInterval(() => {
      dot.style.transform = `translate(${-G.turn * 22}px,${G.climb * 22}px)`;
      P.send({ k: 's', t: +G.turn.toFixed(3), c: +G.climb.toFixed(3), r: Math.round(G.rollDeg || 0), v: +v.toFixed(2) }, false);
    }, 33);
    ctl = { flash, draw };
    const shut = () => {
      clearInterval(timer);
      root.remove(); ctl = null; P.ctl = false;
      G.stop(false);
      P.stop();
      if (onClose) onClose();
    };
    close.addEventListener('click', shut);
    G.start(false);
    P.join();
    draw();
  };

  // ---------------------------------------------------------------- Verbindung
  const onState = e => {
    const was = P.on;
    P.state = e.state || 'off'; P.peer = e.peer || '';
    P.on = P.role === 'host' && P.state === 'connected';
    if (was && !P.on) {
      // Steuerknüppel weg: alles loslassen und das Spiel anhalten
      neutral();
      G.on = false; if (G.onChange) G.onChange();
      const A = FL.app;
      if (A && A.mode && !A.paused && !A.done) { press('KeyP'); release('KeyP'); }
    }
    if (!was && P.on) { G.needCal = true; P.send({ k: 'cal' }, true); }
    if (ctl) ctl.draw();
    if (P.onChange) P.onChange();
  };
  const onData = e => {
    let m = null;
    try { m = JSON.parse(e.d); } catch (err) { return; }
    if (!m || typeof m !== 'object') return;
    if (P.role === 'host') { if (P.on) hostData(m); } else if (P.role === 'pad') padData(m);
  };
  const wire = () => {
    const p = plug();
    if (!p || P.ready) return p;
    P.ready = true;
    p.addListener('state', onState);
    p.addListener('data', onData);
    return p;
  };
  const call = name => { const p = wire(); if (!p) return; try { const r = p[name](); if (r && r.catch) r.catch(() => {}); } catch (e) {} };
  P.host = () => { P.role = 'host'; P.state = 'searching'; call('host'); if (P.onChange) P.onChange(); };
  P.join = () => { P.role = 'pad'; P.state = 'searching'; call('join'); if (P.onChange) P.onChange(); };
  P.stop = () => {
    call('stop');
    onState({ state: 'off' });
    P.role = null;
    if (P.onChange) P.onChange();
  };
  P.label = () => P.role !== 'host' ? 'aus' : P.state === 'connected' ? 'verbunden mit ' + (P.peer || 'iPhone') : P.state === 'error' ? 'Verbindung nicht möglich' : 'wartet auf das iPhone …';
})();
