'use strict';
// Frontlinie 3 – 3D-Modelle aus einfachen Körpern: Soldaten, Fahrzeuge, Flugzeuge, Gebäude, Bäume.
(() => {
  const { box, cyl, ball, mat } = FL;
  const SKIN = 0xd9a57a, BOOT = 0x2a2420, GUN = 0x2b2d31, CYAN = 0x46dcff;
  const glow = c => new THREE.MeshBasicMaterial({ color: c });
  const glowCache = {};
  const G = c => glowCache[c] || (glowCache[c] = glow(c));

  // ---------------------------------------------------------------- Soldaten
  FL.WEAPON_LOOK = [
    g => { g.add(box(0.07, 0.12, 0.26, mat(GUN), 0, 0, 0.1)); },
    g => { g.add(box(0.07, 0.1, 0.9, mat(GUN), 0, 0, 0.35), box(0.08, 0.16, 0.3, mat(0x6b4a2c), 0, -0.04, -0.1)); },
    g => { g.add(box(0.09, 0.13, 0.95, mat(GUN), 0, 0, 0.35), box(0.07, 0.24, 0.1, mat(0x1c1d20), 0, -0.16, 0.25), box(0.05, 0.05, 0.3, mat(0x1c1d20), 0, 0.02, 0.95)); },
    g => { for (const x of [-0.07, 0.07]) g.add(box(0.07, 0.09, 1.05, mat(GUN), x, 0, 0.4)); g.add(box(0.26, 0.2, 0.35, mat(0x43474f), 0, -0.04, 0)); },
    g => { g.add(box(0.2, 0.2, 1.0, mat(0x2d4558), 0, 0, 0.35), box(0.08, 0.08, 0.9, G(CYAN), 0, 0.1, 0.4)); },
    g => { g.add(box(0.28, 0.26, 0.5, mat(0x4a2550), 0, 0, 0)); for (const [x, y] of [[-0.07, 0.06], [0.07, 0.06], [-0.07, -0.06], [0.07, -0.06]]) g.add(box(0.06, 0.06, 0.9, G(0xff6ee6), x, y, 0.6)); },
    g => { g.add(box(0.34, 0.3, 0.6, mat(0x4c3a22), 0, 0, 0), box(0.26, 0.26, 1.0, mat(0x8a5a1e), 0, 0.02, 0.7), box(0.14, 0.14, 0.2, G(0xffb040), 0, 0.02, 1.25)); }
  ];

  FL.soldier = o => {
    const th = FL.THEMES[o.theme || 'wald'];
    const g = new THREE.Group(), body = new THREE.Group();
    g.add(body);
    let uni, dark, helm, bulk = 1, hat = 'helmet';
    if (o.team === 'hero') { uni = mat(0x262b33); dark = mat(0x3a4250); helm = mat(0x1b1e24, { shiny: 30 }); bulk = 1.12; }
    else if (o.team === 'ally') { uni = mat(0xffffff, { map: FL.tex.camo('#506d3a', '#3c5430', '#6c8250') }); dark = mat(0x5f7146); helm = mat(0x43582f); }
    else {
      const k = o.kind || 'soldat';
      const base = new THREE.Color(th.enemy), dk = new THREE.Color(th.enemyDark);
      if (k === 'rekrut') { base.lerp(new THREE.Color(0xffffff), 0.12); hat = 'cap'; bulk = 0.95; }
      if (k === 'elite') { base.copy(dk); dk.multiplyScalar(0.75); bulk = 1.05; }
      if (k === 'schwer') { base.copy(dk).multiplyScalar(0.85); dk.multiplyScalar(0.6); bulk = 1.25; hat = 'visor'; }
      if (k === 'kommandant') { bulk = 1.15; hat = 'beret'; }
      uni = mat(base.getHex()); dark = mat(dk.getHex()); helm = mat(dk.clone().multiplyScalar(0.8).getHex());
    }
    const legs = [], arms = [];
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.13 * bulk, 0.92, 0);
      leg.add(box(0.2 * bulk, 0.86, 0.24, dark, 0, -0.43, 0), box(0.22 * bulk, 0.16, 0.34, mat(BOOT), 0, -0.86, 0.05));
      body.add(leg); legs.push(leg);
      const arm = new THREE.Group();
      arm.position.set(sx * 0.33 * bulk, 1.5, 0);
      arm.add(box(0.14 * bulk, 0.6, 0.16, uni, 0, -0.28, 0), ball(0.08, mat(SKIN), 0, -0.6, 0, 6, 5));
      arm.rotation.x = -1.15; arm.rotation.z = sx * -0.25;
      body.add(arm); arms.push(arm);
    }
    body.add(box(0.5 * bulk, 0.64, 0.3 * bulk, uni, 0, 1.24, 0));
    body.add(box(0.54 * bulk, 0.42, 0.35 * bulk, dark, 0, 1.3, 0));
    body.add(box(0.52 * bulk, 0.08, 0.32 * bulk, mat(0x3a2e22), 0, 0.95, 0));
    body.add(ball(0.16, mat(SKIN), 0, 1.72, 0, 10, 8));
    if (hat === 'cap') body.add(cyl(0.17, 0.17, 0.1, 10, helm, 0, 1.84, 0), box(0.2, 0.03, 0.14, helm, 0, 1.8, 0.2));
    else if (hat === 'beret') { const b = ball(0.19, mat(0xa82828), 0, 1.85, 0, 10, 6); b.scale.y = 0.45; body.add(b); body.add(ball(0.06, mat(0xffc43c, { shiny: 60 }), 0.18, 1.42, 0.17, 6, 5)); }
    else {
      const h = new THREE.Mesh(FL.geo('helm', () => new THREE.SphereGeometry(0.2, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.55)), helm);
      h.position.set(0, 1.74, 0); h.castShadow = true; body.add(h);
      if (hat === 'visor') body.add(box(0.3, 0.1, 0.06, G(0x7cc8ff), 0, 1.72, 0.17));
    }
    if (o.team !== 'enemy') body.add(box(0.36 * bulk, 0.44, 0.2, mat(o.team === 'hero' ? 0x2f3742 : 0x6b5c40), 0, 1.3, -0.24));
    if (o.team === 'hero') {
      for (const sx of [-1, 1]) body.add(ball(0.16, mat(0x4a5362, { shiny: 30 }), sx * 0.36, 1.56, 0, 8, 6));
      body.add(box(0.26, 0.04, 0.02, G(CYAN), 0, 1.4, -0.345), box(0.26, 0.04, 0.02, G(CYAN), 0, 1.24, -0.345));
      body.add(box(0.26, 0.04, 0.04, G(CYAN), 0, 1.8, -0.17));
      body.add(cyl(0.012, 0.012, 0.5, 4, mat(0x888888), 0.14, 2.05, -0.2));
    }
    if (o.team === 'enemy' && (o.kind === 'elite' || o.kind === 'schwer')) for (const sx of [-1, 1]) body.add(ball(0.13, dark, sx * 0.36 * bulk, 1.56, 0, 8, 6));
    const gun = new THREE.Group();
    gun.position.set(0.12, 1.22, 0.42);
    if (o.kind === 'raketen') {
      const t = cyl(0.09, 0.09, 1.3, 8, mat(0x4e5a40), 0.22, 0.42, -0.2); t.rotation.x = Math.PI / 2; gun.add(t);
    } else FL.WEAPON_LOOK[o.team === 'enemy' ? (o.kind === 'rekrut' ? 1 : 2) : (o.weapon || 0)](gun);
    body.add(gun);
    if (o.team === 'hero') g.scale.setScalar(1.22);
    else if (o.team === 'enemy' && o.kind === 'schwer') g.scale.setScalar(1.08);
    g.userData = { legs, arms, body, gun, phase: Math.random() * 6 };
    return g;
  };
  // Turm eines Panzers drehen (fertige Modelle bringen dafür ihre eigene Funktion mit)
  FL.setTurret = (m, yaw, recoil) => {
    const u = m.userData;
    if (u.setTurret) return u.setTurret(yaw, recoil || 0);
    u.turret.rotation.y = yaw;
    if (recoil !== undefined) u.turret.position.z = -0.2 - recoil * 0.35;
  };
  // Laufen und Ducken
  FL.animSoldier = (g, t, moving, crouch) => {
    const u = g.userData, s = moving ? Math.sin(t * 9 + u.phase) * 0.6 : 0;
    u.legs[0].rotation.x = crouch ? -1.25 : s;
    u.legs[1].rotation.x = crouch ? 0.5 : -s;
    u.body.position.y = crouch ? -0.52 : (moving ? Math.abs(Math.sin(t * 9 + u.phase)) * 0.04 : 0);
    u.body.rotation.x = crouch ? 0.28 : 0;
  };

  // ---------------------------------------------------------------- Fahrzeuge
  FL.PAL = {
    ally: { body: mat(0xffffff, { map: FL.tex.camo('#4c6a3a', '#39522f', '#63794a') }), dark: mat(0x33402a), track: mat(0x1e1f1c) },
    enemy(theme) {
      const th = FL.THEMES[theme], a = '#' + new THREE.Color(th.enemy).getHexString(), b = '#' + new THREE.Color(th.enemyDark).getHexString();
      return { body: mat(0xffffff, { map: FL.tex.camo(a, b, '#3a3a36') }), dark: mat(th.enemyDark), track: mat(0x1c1c1c) };
    }
  };
  // Wanne mit Ketten, Laufrollen und Schürzen (für Panzer und Geschützwagen)
  const WHEEL = mat(0x30322e), RUBBER = mat(0x161616), GLASS = mat(0x243746, { shiny: 90 });
  const hull = (g, pal, len) => {
    const L = len || 6.2, n = Math.round(L / 0.95);
    for (const sx of [-1, 1]) {
      g.add(box(0.72, 0.78, L, pal.track, sx * 1.48, 0.42, 0));
      for (const z of [-L / 2, L / 2]) { const e = cyl(0.39, 0.39, 0.72, 10, pal.track, sx * 1.48, 0.45, z); e.rotation.z = Math.PI / 2; g.add(e); }
      for (let i = 0; i < n; i++) { const w = cyl(0.34, 0.34, 0.16, 10, WHEEL, sx * 1.87, 0.38, -L / 2 + 0.5 + i * (L - 1) / (n - 1)); w.rotation.z = Math.PI / 2; g.add(w); }
      const sk = box(0.1, 0.5, L - 0.5, pal.body, sx * 1.9, 0.86, -0.1); g.add(sk);
      g.add(box(1.0, 0.1, L + 0.3, pal.dark, sx * 1.48, 1.0, 0));
    }
    g.add(box(2.4, 0.75, L - 0.9, pal.body, 0, 0.98, -0.25));
    const gl = box(2.4, 0.5, 1.7, pal.body, 0, 1.0, L / 2 - 0.65); gl.rotation.x = 0.5; g.add(gl);
    const lo = box(2.4, 0.45, 0.9, pal.dark, 0, 0.62, L / 2 - 0.25); lo.rotation.x = -0.6; g.add(lo);
    g.add(box(2.3, 0.5, 0.25, pal.dark, 0, 0.95, -L / 2 + 0.05));
    for (const sx of [-1, 1]) { g.add(box(0.5, 0.3, 0.7, mat(0x2a2a28), sx * 0.75, 1.42, -L / 2 + 0.75)); g.add(ball(0.09, G(0xfff2c0), sx * 0.95, 1.12, L / 2 - 0.02, 6, 5)); }
  };
  const barrelOf = (pal, len, r) => {
    const b = new THREE.Group();
    const t = cyl(r, r * 1.15, len, 8, pal.dark, 0, 0, len / 2); t.rotation.x = Math.PI / 2; b.add(t);
    const ev = cyl(r * 1.6, r * 1.6, len * 0.16, 8, pal.dark, 0, 0, len * 0.58); ev.rotation.x = Math.PI / 2; b.add(ev);
    const mz = cyl(r * 1.5, r * 1.5, 0.35, 8, mat(0x1c1c1c), 0, 0, len); mz.rotation.x = Math.PI / 2; b.add(mz);
    return b;
  };
  FL.tankModel = pal => {
    const g = new THREE.Group();
    hull(g, pal, 6.2);
    const turret = new THREE.Group();
    turret.position.set(0, 1.4, -0.2);
    turret.add(box(2.1, 0.72, 2.3, pal.body, 0, 0.38, -0.1));
    for (const sx of [-1, 1]) { const c = box(0.9, 0.7, 1.5, pal.body, sx * 0.72, 0.37, 1.35); c.rotation.y = sx * 0.42; turret.add(c); }
    turret.add(box(0.9, 0.6, 0.9, pal.dark, 0, 0.38, 1.55));
    turret.add(box(1.9, 0.5, 0.9, pal.dark, 0, 0.42, -1.6));                                   // Staukorb hinten
    const barrel = barrelOf(pal, 4.4, 0.12); barrel.position.set(0, 0.42, 1.8); turret.add(barrel);
    turret.add(cyl(0.36, 0.4, 0.22, 10, pal.dark, 0.45, 0.85, -0.3), cyl(0.3, 0.3, 0.14, 10, pal.dark, -0.5, 0.8, 0.1));
    const mg = cyl(0.035, 0.035, 1.1, 5, mat(GUN), 0.45, 1.12, 0.2); mg.rotation.x = Math.PI / 2; turret.add(mg, box(0.12, 0.2, 0.3, mat(GUN), 0.45, 1.05, -0.2));
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const sm = cyl(0.07, 0.07, 0.3, 6, mat(0x222222), sx * 1.12, 0.5 + (i % 2) * 0.14, 0.5 - i * 0.2); sm.rotation.x = 1.1; turret.add(sm); }
    turret.add(cyl(0.015, 0.015, 1.8, 4, mat(0x222222), -0.8, 1.6, -1.2), box(0.3, 0.22, 0.3, GLASS, -0.5, 0.92, 0.45));
    g.add(turret);
    g.userData = { turret, r: 3.2, h: 2.4 };
    return g;
  };
  // geschütztes Geländefahrzeug mit MG-Stand auf dem Dach
  FL.jeepModel = pal => {
    const g = new THREE.Group();
    g.add(box(2.0, 0.55, 4.4, pal.dark, 0, 0.75, 0), box(2.0, 0.55, 1.5, pal.body, 0, 1.25, 1.4));
    const hood = box(2.0, 0.1, 1.5, pal.body, 0, 1.52, 1.4); hood.rotation.x = 0.06; g.add(hood);
    g.add(box(2.0, 1.0, 2.5, pal.body, 0, 1.5, -0.6), box(1.9, 0.08, 2.3, pal.dark, 0, 2.04, -0.6));
    const ws = box(1.8, 0.6, 0.06, GLASS, 0, 1.7, 0.68); ws.rotation.x = -0.25; g.add(ws);
    for (const sx of [-1, 1]) { g.add(box(0.05, 0.36, 0.8, GLASS, sx * 1.01, 1.72, 0.1), box(0.05, 0.36, 0.8, GLASS, sx * 1.01, 1.72, -0.95)); }
    g.add(box(2.1, 0.3, 0.25, mat(0x242424), 0, 0.75, 2.25), box(1.2, 0.4, 0.06, mat(0x1a1a1a), 0, 1.2, 2.17));
    for (const sx of [-1, 1]) g.add(ball(0.1, G(0xfff2c0), sx * 0.75, 1.25, 2.17, 6, 5));
    for (const x of [-1.05, 1.05]) for (const z of [-1.4, 1.45]) { const w = cyl(0.52, 0.52, 0.36, 12, RUBBER, x, 0.52, z); w.rotation.z = Math.PI / 2; g.add(w); const hb = cyl(0.24, 0.24, 0.38, 8, WHEEL, x, 0.52, z); hb.rotation.z = Math.PI / 2; g.add(hb); }
    { const sp = cyl(0.45, 0.45, 0.3, 10, RUBBER, 0, 1.3, -1.95); sp.rotation.x = Math.PI / 2; g.add(sp); }
    g.add(cyl(0.5, 0.5, 0.14, 10, pal.dark, 0, 2.14, -0.5), box(0.9, 0.5, 0.06, pal.dark, 0, 2.45, -0.15));
    const mg = cyl(0.045, 0.045, 1.3, 6, mat(GUN), 0, 2.42, 0.45); mg.rotation.x = Math.PI / 2; g.add(mg, box(0.14, 0.2, 0.4, mat(GUN), 0, 2.4, -0.2));
    g.add(cyl(0.015, 0.015, 1.6, 4, mat(0x222222), -0.85, 2.8, -1.6));
    g.userData = { r: 2.2, h: 2.4 };
    return g;
  };
  FL.werferModel = pal => {
    const g = new THREE.Group();
    g.add(box(2.3, 0.5, 6.4, pal.dark, 0, 0.95, 0), box(2.3, 1.3, 1.7, pal.body, 0, 1.75, 2.3));
    const ws = box(2.1, 0.55, 0.08, GLASS, 0, 2.05, 3.17); ws.rotation.x = -0.12; g.add(ws);
    for (const sx of [-1, 1]) g.add(box(0.05, 0.45, 0.9, GLASS, sx * 1.16, 2.05, 2.45), ball(0.1, G(0xfff2c0), sx * 0.85, 1.3, 3.17, 6, 5));
    g.add(box(2.4, 0.3, 0.25, mat(0x242424), 0, 0.85, 3.25));
    for (const x of [-1.15, 1.15]) for (const z of [-2.3, -1.0, 2.2]) { const w = cyl(0.58, 0.58, 0.42, 12, RUBBER, x, 0.58, z); w.rotation.z = Math.PI / 2; g.add(w); const hb = cyl(0.26, 0.26, 0.44, 8, WHEEL, x, 0.58, z); hb.rotation.z = Math.PI / 2; g.add(hb); }
    const pod = new THREE.Group();
    pod.position.set(0, 1.5, -1.6);
    pod.add(box(2.0, 1.1, 3.0, pal.body, 0, 0.6, 0), box(2.1, 0.1, 3.1, pal.dark, 0, 1.18, 0));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const t = cyl(0.19, 0.19, 0.12, 8, mat(0xd8d8d8), -0.72 + i * 0.48, 0.34 + j * 0.5, 1.52); t.rotation.x = Math.PI / 2; pod.add(t); }
    pod.rotation.x = -0.45;
    g.add(pod, box(0.3, 0.9, 0.3, pal.dark, 0, 1.4, -0.4));
    g.userData = { r: 3.2, h: 3 };
    return g;
  };
  // Geschützwagen: fährt beim Angriff mit und ersetzt dort die festen Geschütztürme (Stufe 1 bis 5)
  FL.spgModel = (pal, lvl) => {
    const g = new THREE.Group();
    hull(g, pal, 6.4);
    const head = new THREE.Group(); head.position.set(0, 1.4, -0.9);
    if (lvl <= 3) {
      head.add(box(2.3, 1.25, 3.0, pal.body, 0, 0.65, 0), box(2.1, 0.1, 2.8, pal.dark, 0, 1.32, 0), box(1.0, 0.7, 0.6, pal.dark, 0, 0.7, 1.7));
      for (const x of (lvl === 3 ? [-0.38, 0.38] : [0])) { const b = barrelOf(pal, lvl === 1 ? 4.2 : 5.0, 0.14); b.position.set(x, 0.75, 1.6); b.rotation.x = -0.42; head.add(b); }
      head.add(cyl(0.3, 0.3, 0.16, 8, pal.dark, 0.6, 1.42, -0.6), cyl(0.015, 0.015, 2, 4, mat(0x222222), -0.9, 2.2, -1.2));
    } else {
      const n = lvl === 4 ? 3 : 4, pod = new THREE.Group();
      pod.add(box(2.3, 1.2, 3.2, mat(lvl === 4 ? 0x4a5240 : 0x3a4048), 0, 0, 0), box(2.4, 0.1, 3.3, pal.dark, 0, 0.64, 0));
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { const t = cyl(0.2, 0.2, 0.1, 8, mat(j ? 0xe8e8e8 : 0xc03020), (i - (n - 1) / 2) * 0.52, -0.28 + j * 0.56, 1.62); t.rotation.x = Math.PI / 2; pod.add(t); }
      pod.position.y = 1.0; pod.rotation.x = -0.5; head.add(pod, box(0.9, 0.8, 0.9, pal.dark, 0, 0.3, 0));
    }
    g.add(head);
    g.userData = { head, r: 3.2, h: 3.2 };
    return g;
  };
  // gezogene Haubitze der Artillerie
  FL.howitzerModel = pal => {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) { const w = cyl(0.55, 0.55, 0.3, 12, RUBBER, sx * 1.0, 0.55, 0); w.rotation.z = Math.PI / 2; g.add(w); const leg = box(0.16, 0.16, 3.4, pal.dark, sx * 0.9, 0.3, -1.9); leg.rotation.y = sx * -0.3; g.add(leg); }
    g.add(box(1.5, 0.5, 1.2, pal.body, 0, 0.8, 0), box(1.9, 1.1, 0.08, pal.body, 0, 1.4, 0.5));
    const b = barrelOf(pal, 4.6, 0.13); b.position.set(0, 1.25, 0.2); b.rotation.x = -0.6; g.add(b);
    g.userData = { r: 2.5, h: 3 };
    return g;
  };

  // ---------------------------------------------------------------- Flugzeuge
  const wingGeo = (key, pts, thick) => FL.geo(key, () => {
    const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
    g.rotateX(Math.PI / 2); g.translate(0, thick / 2, 0);   // Form liegt flach in der x-z-Ebene
    return g;
  });
  FL.jetModel = (color, accent) => {
    const g = new THREE.Group(), m = mat(color, { shiny: 40 }), d = mat(accent, { shiny: 40 }), dk = mat(0x222428);
    const fus = cyl(0.55, 0.75, 7, 10, m, 0, 0, 0); fus.rotation.x = Math.PI / 2; g.add(fus);
    const nose = cyl(0.02, 0.55, 3, 10, m, 0, 0, 5); nose.rotation.x = Math.PI / 2; g.add(nose);
    const tip = cyl(0.01, 0.2, 1.1, 8, mat(0x3a3e44), 0, 0, 6.0); tip.rotation.x = Math.PI / 2; g.add(tip);
    const can = ball(0.5, mat(0x2a3f55, { shiny: 90 }), 0, 0.45, 2.2, 10, 8); can.scale.set(0.8, 0.7, 2.2); g.add(can);
    g.add(box(0.06, 0.5, 0.06, dk, 0, 0.62, 2.0));
    // Lufteinläufe links und rechts am Rumpf
    for (const sx of [-1, 1]) { g.add(box(0.55, 0.7, 3.4, m, sx * 0.85, -0.12, 0.2), box(0.45, 0.55, 0.08, dk, sx * 0.85, -0.12, 1.92)); }
    const wing = new THREE.Mesh(wingGeo('jetwing', [[0, 1.5], [5.2, -2.6], [5.2, -3.4], [0, -2.4], [-5.2, -3.4], [-5.2, -2.6]], 0.16), m);
    wing.castShadow = true; g.add(wing);
    const tail = new THREE.Mesh(wingGeo('jettail', [[0, -1.8], [2.3, -3.9], [2.3, -4.5], [0, -3.8], [-2.3, -4.5], [-2.3, -3.9]], 0.12), m);
    tail.castShadow = true; g.add(tail);
    // zwei schräge Seitenleitwerke
    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(wingGeo('jetfin', [[0, -1.6], [0.1, -3.2], [2.0, -4.3], [2.0, -3.6]], 0.1), d);
      fin.rotation.z = Math.PI / 2 - sx * 0.3; fin.position.set(sx * 0.62, 0.25, 0); fin.castShadow = true; g.add(fin);
    }
    for (const x of [-0.4, 0.4]) { const n = cyl(0.36, 0.42, 0.8, 10, dk, x, 0, -3.8); n.rotation.x = Math.PI / 2; g.add(n); }
    const flame = FL.sprite(FL.tex.icon('glow'), 2.2, { add: true }); flame.position.set(0, 0, -4.6); flame.material.color.set(0xffa040); g.add(flame);
    // Raketen unter den Flügeln und an den Flügelspitzen
    for (const x of [-3.2, 3.2, -1.9, 1.9]) {
      const r = cyl(0.11, 0.11, 2, 6, mat(0xd8d8d8), x, -0.34, -1.6 - Math.abs(x) * 0.2); r.rotation.x = Math.PI / 2; g.add(r);
      const c = cyl(0.01, 0.11, 0.4, 6, mat(0xc03020), x, -0.34, -0.4 - Math.abs(x) * 0.2); c.rotation.x = Math.PI / 2; g.add(c);
      g.add(box(0.06, 0.2, 0.8, dk, x, -0.2, -1.6 - Math.abs(x) * 0.2));
    }
    for (const x of [-5.2, 5.2]) { const r = cyl(0.08, 0.08, 1.8, 6, mat(0xd8d8d8), x, 0.08, -2.9); r.rotation.x = Math.PI / 2; g.add(r); }
    g.add(box(0.5, 0.05, 1.4, d, -3.6, 0.1, -2.6), box(0.5, 0.05, 1.4, d, 3.6, 0.1, -2.6));
    // Fahrwerk: nur am Boden sichtbar
    const gear = new THREE.Group();
    for (const [x, z] of [[0, 3.2], [-1.3, -1.2], [1.3, -1.2]]) {
      gear.add(box(0.1, 1.2, 0.1, mat(0xb8bcc0), x, -0.9, z));
      const w = cyl(0.3, 0.3, 0.2, 10, mat(0x161616), x, -1.4, z); w.rotation.z = Math.PI / 2; gear.add(w);
    }
    gear.visible = false; g.add(gear);
    g.userData = { flame, gear, r: 4, h: 2 };
    return g;
  };
  // Kampfhubschrauber: schmaler Rumpf, zwei Kanzeln hintereinander, Stummelflügel mit Raketenbehältern
  FL.heliModel = () => {
    const g = new THREE.Group(), m = mat(0xffffff, { map: FL.tex.camo('#4a5a3c', '#36452d', '#5f6e4c') }), dk = mat(0x1c1c1c), gl = mat(0x2a3f55, { shiny: 90 });
    const b = ball(1.0, m, 0, 0, 0, 12, 8); b.scale.set(0.85, 1.05, 3.0); g.add(b);
    g.add(box(1.5, 1.0, 2.6, m, 0, 0.55, -0.6));                                                 // Triebwerke oben
    for (const sx of [-1, 1]) { const e = cyl(0.3, 0.36, 2.2, 8, mat(0x3c4634), sx * 0.75, 0.75, -0.9); e.rotation.x = Math.PI / 2; g.add(e); g.add(cyl(0.22, 0.22, 0.2, 8, dk, sx * 0.75, 0.75, -2.05)); }
    const c1 = ball(0.6, gl, 0, 0.45, 2.0, 10, 8); c1.scale.set(0.9, 0.8, 1.3); g.add(c1);
    const c2 = ball(0.62, gl, 0, 0.8, 0.95, 10, 8); c2.scale.set(0.95, 0.8, 1.2); g.add(c2);
    const tb = cyl(0.16, 0.42, 5.4, 8, m, 0, 0.3, -5.0); tb.rotation.x = -Math.PI / 2; g.add(tb);
    const fin = box(0.12, 1.9, 0.9, m, 0, 1.0, -7.5); fin.rotation.x = -0.35; g.add(fin);
    g.add(box(1.8, 0.08, 0.6, m, 0, 0.4, -7.2));
    const tr = new THREE.Group(); tr.position.set(0.16, 1.5, -7.75); tr.add(box(0.04, 2.0, 0.18, dk, 0, 0, 0), box(0.04, 0.18, 2.0, dk, 0, 0, 0)); g.add(tr);
    // Stummelflügel mit Raketen
    g.add(box(4.6, 0.12, 0.9, m, 0, -0.1, -0.3));
    for (const sx of [-1, 1]) {
      const pod = cyl(0.3, 0.3, 1.5, 8, mat(0x3a3e38), sx * 1.6, -0.45, -0.2); pod.rotation.x = Math.PI / 2; g.add(pod);
      g.add(cyl(0.26, 0.26, 0.06, 8, dk, sx * 1.6, -0.45, 0.57).rotateX(Math.PI / 2));
      for (const dx of [-0.16, 0.16]) { const r = cyl(0.07, 0.07, 1.4, 6, mat(0xd8d8d8), sx * 2.2 + dx, -0.32, -0.2); r.rotation.x = Math.PI / 2; g.add(r); }
    }
    // Bordkanone unter der Nase
    g.add(box(0.3, 0.3, 0.5, dk, 0, -0.95, 2.0)); { const k = cyl(0.05, 0.05, 1.2, 6, dk, 0, -1.05, 2.7); k.rotation.x = Math.PI / 2; g.add(k); }
    g.add(ball(0.22, dk, 0, 0.0, 3.05, 8, 6));
    const rotor = new THREE.Group(); rotor.position.set(0, 1.75, -0.4);
    rotor.add(box(12, 0.06, 0.42, dk, 0, 0, 0), box(0.42, 0.06, 12, dk, 0, 0, 0), cyl(0.14, 0.18, 0.7, 6, dk, 0, -0.3, 0), cyl(0.4, 0.4, 0.1, 8, mat(0x3a3e38), 0, 0.05, 0));
    g.add(rotor);
    for (const sx of [-1, 1]) { g.add(box(0.08, 0.9, 0.08, dk, sx * 0.75, -1.2, 1.0)); const w = cyl(0.3, 0.3, 0.2, 10, mat(0x161616), sx * 0.85, -1.6, 1.0); w.rotation.z = Math.PI / 2; g.add(w); }
    { const w = cyl(0.2, 0.2, 0.15, 8, mat(0x161616), 0, -0.6, -6.6); w.rotation.z = Math.PI / 2; g.add(w); g.add(box(0.06, 0.6, 0.06, dk, 0, -0.3, -6.6)); }
    g.userData = { rotor, tail: tr };
    return g;
  };
  FL.droneModel = () => {
    const g = new THREE.Group();
    g.add(box(0.5, 0.16, 0.7, mat(0x2a2f36), 0, 0, 0), ball(0.07, G(0xff4030), 0, -0.1, 0.3, 6, 5));
    for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) { g.add(box(0.06, 0.04, 0.06, mat(0x2a2f36), x * 0.6, 0.02, z * 0.6)); g.add(cyl(0.28, 0.28, 0.02, 10, mat(0x9aa4ae), x, 0.1, z)); }
    return g;
  };
  FL.bombModel = () => {
    const g = new THREE.Group(), m = mat(0x3a4038);
    const b = ball(0.28, m, 0, 0, 0, 8, 6); b.scale.z = 2.4; g.add(b);
    g.add(box(0.5, 0.04, 0.3, m, 0, 0, -0.6), box(0.04, 0.5, 0.3, m, 0, 0, -0.6));
    return g;
  };
  // Granate für Panzer, Geschütze und Artillerie: spitzes Geschoss mit Leuchtspur, fliegt mit der Spitze voran (+z)
  FL.shellModel = r => {
    const g = new THREE.Group();
    const b = cyl(r, r, r * 3.4, 8, mat(0x4a5040, { shiny: 40 }), 0, 0, 0); b.rotation.x = Math.PI / 2; g.add(b);
    const n = cyl(0.01, r, r * 2.2, 8, mat(0xc9a24a, { shiny: 60 }), 0, 0, r * 2.8); n.rotation.x = Math.PI / 2; g.add(n);
    const band = cyl(r * 1.08, r * 1.08, r * 0.5, 8, mat(0xb07a30), 0, 0, -r * 1.1); band.rotation.x = Math.PI / 2; g.add(band);
    g.add(box(r * 0.5, r * 0.5, r * 9, FL.basic(0xffc070), 0, 0, -r * 6.2));
    const f = FL.sprite(FL.tex.icon('glow'), r * 5, { add: true }); f.position.z = -r * 1.9; f.material.color.set(0xffa040); g.add(f);
    for (const c of g.children) c.castShadow = false;
    return g;
  };
  // dreht ein Geschoss in Flugrichtung (aus der Bewegung seit dem letzten Bild)
  FL.aimShell = (o, x, y, z) => {
    if (o.lx !== undefined && (x !== o.lx || y !== o.ly || z !== o.lz)) o.mesh.lookAt(2 * x - o.lx, 2 * y - o.ly, 2 * z - o.lz);
    o.lx = x; o.ly = y; o.lz = z;
  };
  FL.rocketModel = () => {
    const g = new THREE.Group();
    const b = cyl(0.11, 0.11, 1.3, 6, mat(0xdedede), 0, 0, 0); b.rotation.x = Math.PI / 2; g.add(b);
    const n = cyl(0.01, 0.11, 0.35, 6, mat(0xc03020), 0, 0, 0.82); n.rotation.x = Math.PI / 2; g.add(n);
    const f = FL.sprite(FL.tex.icon('glow'), 1.1, { add: true }); f.position.z = -0.8; f.material.color.set(0xffa040); g.add(f);
    return g;
  };

  // ---------------------------------------------------------------- Gebäude
  FL.wallMat = (theme, rx, ry) => {
    const style = FL.THEMES[theme].style;
    if (style === 'wood') return mat(0xffffff, { map: FL.tex.wood('#7a5c3a'), rx: rx * 2, ry: 1 });
    if (style === 'sandstone') return mat(0xffffff, { map: FL.tex.brick('#c4a26a'), rx, ry });
    if (style === 'fortress') return mat(0xffffff, { map: FL.tex.brick('#6a6460'), rx, ry });
    return mat(0xffffff, { map: FL.tex.concrete(theme === 'winter' ? '#aab2b8' : '#8d9092'), rx, ry });
  };
  const roofMat = theme => mat({ wood: 0x4a3a28, sandstone: 0x9a7a4a, fortress: 0x3a3634, concrete: 0x55595c }[FL.THEMES[theme].style]);
  const prism3 = (w, h, d, m, x, y, z) => {       // Satteldach
    const r = new THREE.Mesh(FL.geo('prism3', () => { const g = new THREE.CylinderGeometry(1, 1, 1, 3); g.rotateX(Math.PI / 2); g.rotateZ(Math.PI); g.translate(0, 0.5, 0); return g; }), m);
    r.scale.set(w / 1.732, h / 1.5, d); r.position.set(x, y, z); r.castShadow = true;
    return r;
  };
  FL.building = (kind, theme, opt) => {
    opt = opt || {};
    const g = new THREE.Group();
    let r = 4, h = 4, hp = 10;
    const con = (rx, ry) => mat(0xffffff, { map: FL.tex.concrete(theme === 'winter' ? '#aab2b8' : theme === 'wueste' ? '#b0a488' : '#8d9092'), rx, ry });
    const snow = theme === 'winter';
    const cap = (w, d, y, x, z) => { if (snow) g.add(box(w, 0.22, d, mat(0xf4f8fb), x || 0, y, z || 0)); };
    switch (kind) {
      case 'bunker':
        g.add(box(8, 3, 6, con(2, 1), 0, 1.5, 0), box(8.8, 0.5, 6.8, mat(0x5a5d5e), 0, 3.25, 0));
        g.add(box(4.4, 0.5, 0.3, mat(0x0c0c0c), 0, 2.0, -3.0), box(1.4, 2.0, 0.3, mat(0x2c2c2a), 2.6, 1.0, 3.0));
        { const b = cyl(0.1, 0.1, 1.6, 6, mat(GUN), 0, 2.0, -3.6); b.rotation.x = Math.PI / 2; g.add(b); }
        cap(8.8, 6.8, 3.6); r = 5; h = 3.5; hp = 14; break;
      case 'hangar': {
        const geo = FL.geo('hangar', () => { const q = new THREE.CylinderGeometry(6, 6, 14, 18, 1, false, 0, Math.PI); q.rotateZ(Math.PI / 2); q.rotateY(Math.PI / 2); return q; });
        const m = new THREE.Mesh(geo, mat(0xffffff, { map: FL.tex.metal(snow ? '#c6ced4' : '#7c8a80'), rx: 6, ry: 1 }));
        m.material.side = THREE.DoubleSide; m.castShadow = m.receiveShadow = true; g.add(m);
        for (const z of [-7, 7]) {
          const e = new THREE.Mesh(FL.geo('hangarEnd', () => new THREE.CircleGeometry(6, 18, 0, Math.PI)), mat(0x6a756c));
          e.material.side = THREE.DoubleSide; e.position.z = z; g.add(e);
        }
        g.add(box(7, 3.6, 0.2, mat(0x1a1c1c), 0, 1.8, -7.05));
        r = 8; h = 6; hp = 16; break;
      }
      case 'hq':
        g.add(box(12, 7, 9, mat(0xffffff, { map: FL.tex.windows(theme === 'wueste' ? '#b8a27a' : snow ? '#b4bcc2' : '#84888a'), rx: 3, ry: 2 }), 0, 3.5, 0));
        g.add(box(12.6, 0.4, 9.6, mat(0x4a4d50), 0, 7.2, 0), box(6, 3, 5, con(2, 1), 0, 8.9, 0), box(6.5, 0.3, 5.5, mat(0x4a4d50), 0, 10.5, 0));
        g.add(box(2.4, 2.8, 0.3, mat(0x1c1e20), 0, 1.4, -4.55), box(3.4, 0.3, 1.4, mat(0x4a4d50), 0, 3.0, -5.0));
        g.add(cyl(0.06, 0.06, 6, 5, mat(0x999999), 2, 13.6, 1), cyl(0.05, 0.05, 4, 5, mat(0x999999), -2, 12.6, -1));
        { const f = box(1.8, 1.1, 0.05, mat(0xb82020), -1.05, 14.0, -1); g.add(f); g.userData.flag = f; }
        cap(12.6, 9.6, 7.5); cap(6.5, 5.5, 10.75); r = 8.5; h = 11; hp = 40; break;
      case 'tower': {
        if (FL.THEMES[theme].style === 'wood') {
          const wm = FL.wallMat(theme, 1, 1), wd = mat(0x4a3c2c);
          for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) g.add(box(0.28, 6, 0.28, wd, x, 3, z));
          for (const y of [1.6, 3.6]) { g.add(box(2.6, 0.14, 0.14, wd, 0, y, -1.2), box(2.6, 0.14, 0.14, wd, 0, y, 1.2), box(0.14, 0.14, 2.6, wd, -1.2, y, 0), box(0.14, 0.14, 2.6, wd, 1.2, y, 0)); }
          g.add(box(3.4, 0.25, 3.4, wd, 0, 6.1, 0), box(3.2, 1.1, 3.2, wm, 0, 6.8, 0));
          for (const x of [-1.5, 1.5]) for (const z of [-1.5, 1.5]) g.add(box(0.16, 1.4, 0.16, wd, x, 8.0, z));
          g.add(box(3.8, 0.2, 3.8, roofMat(theme), 0, 8.8, 0));
        } else {
          // moderner Wachturm: Stahlgerüst, gepanzerte Kanzel, Flachdach mit Scheinwerfer
          const stl = mat(0x4c5258), arm = mat(theme === 'wueste' ? 0x9a8c6c : snow ? 0xb4bcc2 : 0x5c645c);
          for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) g.add(box(0.2, 6, 0.2, stl, x, 3, z));
          for (const y of [1.2, 3.0, 4.8]) { g.add(box(2.6, 0.1, 0.1, stl, 0, y, -1.2), box(2.6, 0.1, 0.1, stl, 0, y, 1.2), box(0.1, 0.1, 2.6, stl, -1.2, y, 0), box(0.1, 0.1, 2.6, stl, 1.2, y, 0)); }
          for (const z of [-1.2, 1.2]) { const d1 = box(0.08, 3.4, 0.08, stl, 0, 3, z); d1.rotation.z = 0.78; g.add(d1); }
          g.add(box(3.6, 0.2, 3.6, stl, 0, 6.1, 0), box(3.2, 0.9, 3.2, arm, 0, 6.65, 0), box(3.25, 0.55, 3.25, mat(0x10161c, { shiny: 80 }), 0, 7.38, 0), box(3.2, 0.3, 3.2, arm, 0, 7.8, 0));
          g.add(box(3.8, 0.16, 3.8, stl, 0, 8.03, 0), cyl(0.02, 0.02, 2.2, 4, stl, 1.3, 9.2, 1.3), box(0.5, 0.4, 0.4, stl, -1.0, 8.35, -1.3));
          g.add(box(2.0, 3.0, 0.1, con(1, 1), 0, 1.5, -1.5));
          cap(3.8, 3.8, 8.2);
        }
        g.add(ball(0.3, G(0xfff2b0), snow || FL.THEMES[theme].style !== 'wood' ? -1.0 : 0, FL.THEMES[theme].style === 'wood' ? 7.7 : 8.35, -1.55, 8, 6));
        r = 2.4; h = 9; hp = 12; break;
      }
      case 'depot': {
        const m = mat(0xffffff, { map: FL.tex.metal(snow ? '#d8dee2' : '#c9cdc8'), rx: 6, ry: 1 });
        g.add(cyl(3, 3, 5, 18, m, 0, 2.5, 0));
        const top = ball(3, mat(snow ? 0xf0f4f6 : 0xb9bdb8), 0, 5, 0, 18, 6); top.scale.y = 0.28; g.add(top);
        g.add(cyl(3.04, 3.04, 0.5, 18, mat(0xb8362a), 0, 3.6, 0), box(0.5, 5, 0.12, mat(0x55595c), 0, 2.5, -3.05));
        const p = cyl(0.2, 0.2, 5, 6, mat(0x6a6e70), 3.6, 0.5, 0); p.rotation.z = Math.PI / 2; g.add(p);
        r = 3.4; h = 6; hp = 8; g.userData.fuel = true; break;
      }
      case 'radar': {
        g.add(box(3.2, 2.2, 3.2, con(1, 1), 0, 1.1, 0), cyl(0.25, 0.3, 3, 8, mat(0x6a6e70), 0, 3.7, 0));
        const spin = new THREE.Group(); spin.position.y = 5.4;
        const dish = new THREE.Mesh(FL.geo('dish', () => new THREE.SphereGeometry(2.6, 14, 6, 0, Math.PI * 2, 0, 0.85)), mat(0xd4d8da, { shiny: 30 }));
        dish.material.side = THREE.DoubleSide; dish.rotation.x = -Math.PI / 2 - 0.35; dish.position.set(0, 0.3, 2.3); dish.castShadow = true;
        spin.add(dish, box(0.1, 0.1, 1.8, mat(0x444444), 0, 0.4, 0.3));
        g.add(spin); g.userData.spin = spin;
        cap(3.2, 3.2, 2.3); r = 3; h = 7; hp = 9; break;
      }
      case 'wall': {
        const len = opt.len || 8;
        g.add(box(len, 3.2, 1.0, FL.wallMat(theme, len / 4, 1), 0, 1.6, 0));
        if (FL.THEMES[theme].style === 'wood') { for (let x = -len / 2 + 0.3; x < len / 2; x += 0.6) g.add(cyl(0, 0.3, 0.6, 5, mat(0x6a4e30), x, 3.5, 0)); }
        else {
          // Betonmauer mit Stacheldraht statt Zinnen
          g.add(box(len, 0.16, 1.3, mat(0x55595c), 0, 3.28, 0));
          for (let x = -len / 2 + 0.4; x < len / 2; x += 2) { const p1 = box(0.08, 0.9, 0.08, mat(0x3a3e42), x, 3.75, 0); p1.rotation.x = -0.3; g.add(p1); }
          for (const y of [3.75, 4.05]) { const wr = box(len, 0.035, 0.035, mat(0x9a9ea2), 0, y, -0.12 - (y - 3.75) * 0.3); wr.castShadow = false; g.add(wr); }
          cap(len, 1.3, 3.45);
        }
        r = len / 2; h = 3.6; hp = 10; break;
      }
      case 'gate': {
        const wm = FL.wallMat(theme, 0.5, 1.2);
        g.add(box(1.8, 5, 1.8, wm, -3.4, 2.5, 0), box(1.8, 5, 1.8, wm, 3.4, 2.5, 0), box(8.6, 1.1, 1.6, FL.wallMat(theme, 2, 0.3), 0, 5.0, 0));
        g.add(box(5, 3.9, 0.4, mat(0x2c2620), 0, 1.95, 0), box(5, 0.2, 0.5, mat(0x555555), 0, 2.6, 0), box(5, 0.2, 0.5, mat(0x555555), 0, 1.2, 0));
        g.add(ball(0.25, G(0xff5040), -3.4, 5.3, -0.9, 6, 5), ball(0.25, G(0xff5040), 3.4, 5.3, -0.9, 6, 5));
        cap(8.6, 1.6, 5.65); r = 4.3; h = 5.6; hp = 14; break;
      }
      case 'tent': case 'medtent': {
        const c = kind === 'medtent' ? 0xe8e8e2 : (snow ? 0xd8dcd8 : 0x5d6b45);
        g.add(prism3(5, 2.6, 6, mat(c), 0, 0, 0));
        if (kind === 'medtent') { g.add(box(0.9, 0.3, 0.05, mat(0xd83a30), 0, 1.3, -3.02), box(0.3, 0.9, 0.05, mat(0xd83a30), 0, 1.3, -3.02)); }
        r = 3; h = 2.6; hp = 4; break;
      }
      case 'barracks':
        g.add(box(10, 3, 6, FL.wallMat(theme, 3, 1), 0, 1.5, 0), prism3(6.6, 1.8, 10.6, roofMat(theme), 0, 3.0, 0));
        g.children[1].rotation.y = Math.PI / 2;
        for (const x of [-3, 0, 3]) g.add(box(1.2, 1.0, 0.1, mat(0x263440, { shiny: 50 }), x, 1.8, -3.02));
        r = 6; h = 4.8; hp = 12; break;
      case 'house':
        g.add(box(7, 3.4, 6, mat(0xffffff, { map: FL.tex.windows(opt.tint || '#d9cfb8'), rx: 1, ry: 0.34 }), 0, 1.7, 0), prism3(6.8, 2.4, 7.6, mat(opt.roof || 0x8a3a2a), 0, 3.4, 0));
        g.children[1].rotation.y = Math.PI / 2;
        g.add(box(0.7, 1.2, 0.7, mat(0x6a4a3a), 2, 5.2, 1));
        if (snow) { const s2 = prism3(7.0, 2.5, 7.7, mat(0xf4f8fb), 0, 3.5, 0); s2.rotation.y = Math.PI / 2; g.add(s2); }
        r = 5; h = 5.8; hp = 8; break;
      case 'flak': {
        g.add(cyl(2.4, 2.6, 1.0, 10, mat(0xffffff, { map: FL.tex.sandbag(), rx: 6, ry: 1 }), 0, 0.5, 0), cyl(2.0, 2.0, 1.02, 10, mat(0x2a2620), 0, 0.5, 0));
        const gun = new THREE.Group(); gun.position.y = 1.2;
        gun.add(cyl(0.5, 0.7, 0.8, 8, mat(0x4a4e48), 0, 0, 0));
        for (const x of [-0.25, 0.25]) { const b = cyl(0.08, 0.1, 3, 6, mat(GUN), x, 1.2, 0.9); b.rotation.x = 0.65; gun.add(b); }
        g.add(gun); g.userData.gun = gun; r = 2.6; h = 3; hp = 5; break;
      }
      case 'chimney':
        g.add(cyl(1.1, 1.6, 15, 12, mat(0xffffff, { map: FL.tex.brick('#8a5a48'), rx: 4, ry: 6 }), 0, 7.5, 0), cyl(1.14, 1.2, 1.0, 12, mat(0xd8d8d8), 0, 13.6, 0), cyl(1.2, 1.3, 1.0, 12, mat(0xb8362a), 0, 12.4, 0));
        g.add(box(6, 4, 6, FL.wallMat(theme, 1.5, 1), 3, 2, 0));
        r = 4; h = 15; hp = 14; g.userData.smokeY = 15.5; break;
      case 'sandbags': {
        const len = opt.len || 6;
        g.add(box(len, 0.5, 0.9, mat(0xffffff, { map: FL.tex.sandbag(), rx: len / 1.3, ry: 0.5 }), 0, 0.25, 0), box(len - 0.5, 0.45, 0.7, mat(0xffffff, { map: FL.tex.sandbag(), rx: len / 1.3, ry: 0.5 }), 0, 0.72, 0));
        r = len / 2; h = 1; hp = 99; break;
      }
      case 'checkpoint':
        g.add(box(2.6, 2.6, 2.6, FL.wallMat(theme, 0.8, 0.8), -8.6, 1.3, 0), box(3.0, 0.2, 3.0, roofMat(theme), -8.6, 2.7, 0), box(0.3, 1.3, 0.3, mat(0x444444), -6.9, 0.65, 0));
        for (let i = 0; i < 6; i++) g.add(box(1.0, 0.16, 0.16, mat(i % 2 ? 0xe8e8e8 : 0xc03020), -6.4 + i * 1.0, 3.6 - 0.0, 0));
        // Schranke steht offen (nach oben geklappt), damit die Armee durchkommt
        g.children.slice(3).forEach((b, i) => { b.position.set(-6.9 + 0.2, 1.4 + i * 1.0, 0); b.rotation.z = Math.PI / 2; });
        { const pole = cyl(0.06, 0.06, 6, 5, mat(0xbbbbbb), 8.2, 3, 0); g.add(pole); g.add(box(1.8, 1.1, 0.05, mat(0xffc43c), 9.15, 5.4, 0)); }
        r = 9; h = 3; hp = 99; break;
      case 'mgnest': {
        g.add(cyl(1.5, 1.7, 1.0, 8, mat(0xffffff, { map: FL.tex.sandbag(), rx: 4, ry: 1 }), 0, 0.5, 0), cyl(1.15, 1.15, 1.02, 8, mat(0x2a2620), 0, 0.5, 0));
        const gun = new THREE.Group(); gun.position.y = 1.25;
        const b = cyl(0.05, 0.06, 1.6, 6, mat(GUN), 0, 0, 0.7); b.rotation.x = Math.PI / 2;
        gun.add(b, box(0.2, 0.2, 0.5, mat(GUN), 0, 0, 0), box(0.06, 0.5, 0.06, mat(GUN), 0, -0.3, 0));
        g.add(gun); g.userData.gun = gun; r = 1.7; h = 1.6; hp = 99; break;
      }
      case 'turret': {
        g.add(cyl(3, 3.4, 1.8, 10, con(4, 0.5), 0, 0.9, 0));
        const t = new THREE.Group(); t.position.y = 1.8;
        const dome = ball(1.7, mat(0x5a5f58, { shiny: 20 }), 0, 0, 0, 10, 6); dome.scale.y = 0.6; t.add(dome);
        const b = cyl(0.14, 0.17, 3.4, 8, mat(GUN), 0, 0.35, 2.4); b.rotation.x = Math.PI / 2; t.add(b);
        g.add(t); g.userData.turret = t; r = 3.4; h = 3; hp = 10; break;
      }
      case 'antenna':
        g.add(box(0.5, 18, 0.5, mat(0x8a8e90), 0, 9, 0), box(2.4, 1.6, 2.4, con(1, 1), 0, 0.8, 0), ball(0.3, G(0xff3020), 0, 18.3, 0, 6, 5));
        for (const y of [6, 11, 15]) g.add(box(2.2, 0.1, 0.1, mat(0x8a8e90), 0, y, 0), box(0.1, 0.1, 2.2, mat(0x8a8e90), 0, y, 0));
        r = 1.6; h = 18; hp = 6; break;
      case 'cannon': {       // eigener Geschützturm einer modernen Basis, Stufe 1 bis 5
        const lvl = opt.level || 1, heavy = lvl >= 4;
        const arm = heavy ? mat(0x3c444c, { shiny: 20 }) : FL.PAL.ally.body, dk = mat(heavy ? 0x262c32 : 0x33402a), stl = mat(0x4c5258);
        g.add(cyl(2.5, 2.8, 0.5, 8, con(3, 0.3), 0, 0.25, 0));
        // Schutzwall aus Sandsäcken und Betonblöcken
        g.add(cyl(2.3, 2.5, 0.9, 10, mat(0xffffff, { map: FL.tex.sandbag(), rx: 6, ry: 1 }), 0, 0.9, 0), cyl(1.9, 1.9, 0.92, 10, mat(0x2a2620), 0, 0.9, 0));
        for (const a of [0.8, 2.35, 3.95, 5.5]) g.add(box(1.3, 1.3, 0.45, con(0.5, 0.5), Math.sin(a) * 2.75, 0.65, Math.cos(a) * 2.75).rotateY(a));
        g.add(cyl(0.75, 0.95, 1.6, 8, stl, 0, 1.3, 0), cyl(1.25, 1.25, 0.2, 10, dk, 0, 2.15, 0));
        const head = new THREE.Group(); head.position.y = 2.25;
        head.add(box(2.0, 0.95, 2.2, arm, 0, 0.5, -0.15));
        for (const sx of [-1, 1]) { const c = box(0.7, 0.9, 1.1, arm, sx * 0.72, 0.5, 1.0); c.rotation.y = sx * 0.5; head.add(c); }
        head.add(box(1.7, 0.1, 1.9, dk, 0, 1.02, -0.2), box(0.5, 0.35, 0.5, dk, 0.6, 1.2, -0.6), ball(0.2, mat(0x10161c, { shiny: 90 }), 0.6, 1.5, -0.6, 8, 6));
        head.add(cyl(0.015, 0.015, 1.8, 4, stl, -0.8, 1.9, -0.9), box(1.2, 0.08, 0.04, G(CYAN), 0, 0.5, -1.27));
        if (lvl <= 3) {
          for (const x of (lvl === 3 ? [-0.36, 0.36] : [0])) { const b = barrelOf({ dark: dk }, lvl === 1 ? 3.0 : 3.6, lvl === 1 ? 0.11 : 0.13); b.position.set(x, 0.6, 1.0); b.rotation.x = -0.38; head.add(b); }
          head.add(box(lvl === 3 ? 1.3 : 0.7, 0.6, 0.5, dk, 0, 0.6, 1.15));
        } else {
          const n = lvl === 4 ? 2 : 3;
          for (const sx of [-1, 1]) {
            const pod = new THREE.Group();
            pod.add(box(0.75, 0.3 + 0.36 * n, 1.9, mat(heavy && lvl === 5 ? 0x2c3448 : 0x4a5240), 0, 0, 0));
            for (let i = 0; i < n; i++) for (const dx of [-0.17, 0.17]) { const rk = cyl(0.12, 0.12, 0.08, 8, mat(i % 2 ? 0xc03020 : 0xe8e8e8), dx, (i - (n - 1) / 2) * 0.36, 0.97); rk.rotation.x = Math.PI / 2; pod.add(rk); }
            pod.position.set(sx * 1.45, 0.75, 0.1); pod.rotation.x = -0.45; head.add(pod);
          }
          const dish = box(0.9, 0.6, 0.08, stl, 0, 1.5, 0.3); dish.rotation.x = -0.3; head.add(dish);
        }
        g.add(head); g.userData.head = head; r = 2.8; h = 4.4; hp = 99; break;
      }
    }
    g.userData.r = r; g.userData.h = h; g.userData.hp = hp; g.userData.kind = kind;
    return g;
  };
  // Trümmerhaufen, wenn ein Gebäude zerstört ist
  FL.rubble = (r, h) => {
    const g = new THREE.Group();
    const n = Math.round(6 + r * 1.2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, d = Math.random() * r * 0.85, s = FL.rand(0.5, 1.6) * Math.min(1.6, r / 3);
      const b = box(1, 1, 1, mat(FL.pick([0x3a3836, 0x4a4744, 0x2c2a28, 0x55504a]), { flat: true }), Math.cos(a) * d, s * 0.25, Math.sin(a) * d);
      b.scale.set(s * FL.rand(0.8, 1.6), s * FL.rand(0.4, 1.0), s * FL.rand(0.8, 1.6));
      b.rotation.set(FL.rand(-0.4, 0.4), Math.random() * 3, FL.rand(-0.4, 0.4));
      g.add(b);
    }
    if (h > 5) { const w = box(r * 0.9, h * 0.3, 0.6, mat(0x4a4744), -r * 0.3, h * 0.15, r * 0.2); w.rotation.z = 0.12; g.add(w); }
    return g;
  };

  // ---------------------------------------------------------------- Bäume, Büsche, Felsen
  FL.tree = (kind, rnd) => {
    rnd = rnd || Math.random;
    const g = new THREE.Group(), s = 0.8 + rnd() * 0.6;
    const blob = (r, m, x, y, z) => { const b = new THREE.Mesh(FL.geo('blob', () => new THREE.IcosahedronGeometry(1, 1)), m); b.scale.set(r, r * 0.85, r); b.position.set(x, y, z); b.castShadow = true; return b; };
    const cone = (r, h, m, y) => cyl(0, r, h, 7, m, 0, y, 0);
    if (kind === 'pine' || kind === 'snowpine') {
      const gm = [mat(0x2f5a34, { flat: true }), mat(0x27502e, { flat: true }), mat(0x386a3c, { flat: true })];
      g.add(cyl(0.18, 0.28, 2.2, 6, mat(0x4a3524), 0, 1.1, 0));
      for (let i = 0; i < 4; i++) {
        g.add(cone(2.3 - i * 0.48, 2.4, gm[i % 3], 2.4 + i * 1.5));
        if (kind === 'snowpine') g.add(cone((2.3 - i * 0.48) * 0.72, 1.3, mat(0xf2f6f9, { flat: true }), 3.05 + i * 1.5));
      }
    } else if (kind === 'leaf') {
      const gm = [mat(0x3f7a33, { flat: true }), mat(0x356b2c, { flat: true }), mat(0x4c8a3c, { flat: true })];
      g.add(cyl(0.22, 0.32, 3, 6, mat(0x5a4028), 0, 1.5, 0));
      g.add(blob(2.2, gm[0], 0, 4.4, 0), blob(1.6, gm[1], 1.3, 3.8, 0.4), blob(1.5, gm[2], -1.1, 4.0, -0.6), blob(1.4, gm[1], 0.2, 5.6, 0.3));
    } else if (kind === 'palm') {
      const t = cyl(0.16, 0.26, 5.5, 6, mat(0x7a6244), 0.3, 2.75, 0); t.rotation.z = -0.1; g.add(t);
      for (let i = 0; i < 7; i++) {
        const l = box(0.5, 0.06, 2.8, mat(0x4f7a34, { flat: true }), 0, 0, 1.4);
        const p = new THREE.Group(); p.position.set(0.6, 5.5, 0); p.rotation.y = i / 7 * 6.28; p.rotation.x = 0.5; p.add(l); g.add(p);
      }
    } else if (kind === 'deadtree') {
      g.add(cyl(0.12, 0.26, 4, 5, mat(0x4a4038), 0, 2, 0));
      for (let i = 0; i < 4; i++) { const b = cyl(0.04, 0.09, 1.8, 4, mat(0x4a4038), 0, 2.6 + i * 0.4, 0); b.rotation.z = 0.9 * (i % 2 ? 1 : -1); b.rotation.y = i * 1.3; b.position.x = (i % 2 ? -0.6 : 0.6); g.add(b); }
    } else if (kind === 'bush' || kind === 'deadbush') {
      const m = mat(kind === 'bush' ? 0x3d6e30 : 0x8a7a50, { flat: true });
      g.add(blob(0.9, m, 0, 0.6, 0), blob(0.7, m, 0.8, 0.45, 0.2), blob(0.6, m, -0.6, 0.4, -0.3));
    } else {
      const m = new THREE.Mesh(FL.geo('rock', () => new THREE.DodecahedronGeometry(1, 0)), mat(0x807e78, { flat: true }));
      m.scale.set(1.4 + rnd(), 0.8 + rnd() * 0.6, 1.2 + rnd()); m.position.y = 0.4; m.rotation.y = rnd() * 3; m.castShadow = true; g.add(m);
    }
    g.scale.setScalar(s); g.rotation.y = rnd() * 6.28;
    return g;
  };
  // schaltet Schatten für weit entfernte Deko ab (spart Rechenzeit)
  FL.noShadow = g => { g.traverse(o => { if (o.isMesh) o.castShadow = false; }); return g; };
})();
