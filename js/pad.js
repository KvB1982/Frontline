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
  // Der runde Steuerknüppel auf dem iPad bleibt benutzbar: Das iPhone überschreibt ihn nur, solange es selbst ausschlägt.
  let padDrive = false;
  const drive = (x, y) => {
    const act = !!(x || y);
    if (act || padDrive) { FL.stick.x = x; FL.stick.y = y; }
    padDrive = act;
  };
  const neutral = () => {
    G.turn = G.climb = 0; G.rollDeg = 0; padDrive = false;
    FL.stick.x = FL.stick.y = 0;
    for (const c of heldKeys) release(c);
    heldKeys.clear();
  };
  const hostData = m => {
    if (m.k === 's') {
      if (!G.on) { G.on = true; if (G.onChange) G.onChange(); }
      const t = FL.clamp(+m.t || 0, -1, 1), c = FL.clamp(+m.c || 0, -1, 1);
      if (m.j) {
        // zu Fuß oder im Fahrzeug: Das iPhone zeigt den runden Steuerknüppel, Neigen zählt nicht
        G.turn = G.climb = 0; G.rollDeg = 0;
        drive(FL.clamp(+m.x || 0, -1, 1), FL.clamp(+m.y || 0, -1, 1));
      } else if (G.air) {
        // in der Luft: wie die Neigungssteuerung des iPads
        G.turn = t; G.climb = c; G.rollDeg = +m.r || 0;
        drive(0, 0);
      } else {
        // im Flugzeug am Boden (rollen, starten): Neigen wirkt wie der runde Steuerknüppel
        G.turn = 0; G.rollDeg = 0; G.climb = c;
        drive(-t || 0, -c || 0);
      }
      if (FL.throttle.on) FL.throttle.v = FL.clamp(+m.v || 0, 0, 1);
    } else if (m.k === 'd' && typeof m.c === 'string') { heldKeys.add(m.c); press(m.c); }
    else if (m.k === 'u' && typeof m.c === 'string') { heldKeys.delete(m.c); release(m.c); }
  };

  // Das iPhone zeigt zu Fuß den runden Steuerknüppel und erst im Flugzeug den Schubhebel. Dafür muss es wissen, wo man gerade ist.
  // Sofort bei jedem Wechsel und zur Sicherheit jede Sekunde noch einmal.
  let sentPit = null, sentAt = 0;
  setInterval(() => {
    if (!P.on) { sentPit = null; return; }
    const pit = FL.app && FL.app.mode && G.cockpit ? 1 : 0, now = Date.now();
    if (pit !== sentPit || now - sentAt > 1000) { sentPit = pit; sentAt = now; P.send({ k: 'm', p: pit, a: G.air ? 1 : 0 }, true); }
  }, 200);

  // ---------------------------------------------------------------- iPhone: der Steuerknüppel-Bildschirm
  let ctl = null;
  const padData = m => {
    if (m.k === 'cal') { G.center(true); if (ctl) ctl.flash(); }
    else if (m.k === 'm') { if (ctl) ctl.hostMode(!!m.p, !!m.a); }
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
    const sens = FL.el('div', 'pc-chip', G.sensText(), mid);
    sens.addEventListener('click', () => { sens.textContent = G.nextSens(); if (FL.haptic) FL.haptic('LIGHT'); });
    const help = FL.el('div', 'pc-help', '', mid);
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
    // runder Steuerknüppel links: zu Fuß und im Fahrzeug, solange man nicht im Flugzeug sitzt
    const stick = FL.el('div', 'tstick', '', FL.el('div', 'pc-stick', '', root)), knob = FL.el('div', 'tknob', '', stick);
    let sx = 0, sy = 0, sid = null, pit = false;
    const setS = e => {
      const r = stick.getBoundingClientRect(), R = r.width / 2, M = R * 0.6;
      let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
      const d = Math.hypot(dx, dy);
      if (d > M) { dx *= M / d; dy *= M / d; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      let x = dx / M, y = -dy / M;
      const m = Math.hypot(x, y);
      if (m < 0.15) x = y = 0; else { const k = (m - 0.15) / 0.85 / m; x *= k; y *= k; }
      sx = x; sy = y;
    };
    const endS = e => { if (e && e.pointerId !== sid) return; sid = null; sx = sy = 0; knob.style.transform = ''; stick.classList.remove('on'); };
    stick.addEventListener('pointerdown', e => { if (sid !== null) return; e.preventDefault(); sid = e.pointerId; try { stick.setPointerCapture(sid); } catch (err) {} stick.classList.add('on'); setS(e); });
    stick.addEventListener('pointermove', e => { if (e.pointerId === sid) setS(e); });
    stick.addEventListener('pointerup', endS); stick.addEventListener('pointercancel', endS);
    let inited = false;
    const mode = (p, air) => {
      if (inited && p === pit) return;
      inited = true; pit = p;
      root.classList.toggle('pit', pit);
      endS(); tid = null; setT(pit && air ? 0.62 : 0);                                  // wer mitten im Flug dazukommt, behält Schub
      help.innerHTML = pit ? 'iPhone quer halten wie ein Lenkrad.<br>Drehen = Kurve, kippen = hoch und runter.' : 'Links der Steuerknüppel zum Laufen und Fahren.<br>Im Flugzeug erscheint dort der Schubhebel.';
      help.innerHTML += '<br>Version ' + FL.BUILD;
    };
    mode(false);
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
    // Ein iPad mit älterer App-Version meldet nicht, ob man im Flugzeug sitzt. Dann gilt die alte Bedienung
    // (Neigen und Schubhebel), und das iPhone sagt, dass das iPad aktualisiert werden muss.
    let heard = false, old = false, wait = null;
    const hostMode = (p, air) => { heard = true; if (old) { old = false; draw(); } mode(p, air); };
    const draw = () => {
      const live = P.state === 'connected';
      if (!live) { heard = old = false; clearTimeout(wait); wait = null; mode(false); }
      else if (!heard && !old && !wait) wait = setTimeout(() => { wait = null; if (!heard && P.state === 'connected') { old = true; mode(true, false); draw(); } }, 3000);
      status.textContent = live && old ? 'Verbunden, aber das iPad hat eine ältere Version. Bitte dort in TestFlight aktualisieren.' : P.state === 'connected' ? 'Verbunden mit ' + (P.peer || 'iPad') : P.state === 'error' ? 'Verbindung nicht möglich. Bitte WLAN oder Bluetooth einschalten.' : 'Suche das iPad … (dort im Menü „Steuerknüppel“ einschalten)';
      root.classList.toggle('live', P.state === 'connected');
    };
    // 30-mal in der Sekunde die Haltung schicken
    const timer = setInterval(() => {
      dot.style.transform = `translate(${-G.turn * 22}px,${G.climb * 22}px)`;
      if (pit) P.send({ k: 's', t: +G.turn.toFixed(3), c: +G.climb.toFixed(3), r: Math.round(G.rollDeg || 0), v: +v.toFixed(2) }, false);
      else P.send({ k: 's', j: 1, x: +sx.toFixed(3), y: +sy.toFixed(3) }, false);
    }, 33);
    ctl = { flash, draw, hostMode };
    const shut = () => {
      clearInterval(timer); clearTimeout(wait);
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
  P.label = () => P.role !== 'host' ? 'aus' : P.state === 'connected' ? 'verbunden mit ' + (P.peer || 'iPhone') + ' (Version ' + FL.BUILD + ')' : P.state === 'error' ? 'Verbindung nicht möglich' : 'wartet auf das iPhone …';
})();
