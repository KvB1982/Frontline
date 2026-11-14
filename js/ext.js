'use strict';
// Frontlinie 3 – fertige 3D-Modelle (glTF) für Panzer, Fahrzeuge, Flugzeuge und Hubschrauber.
// Die Modelle stecken als Text in models/*.js, damit das Spiel auch per Doppelklick ohne Server läuft.
// Solange ein Modell nicht geladen ist (oder das Laden scheitert), nimmt das Spiel die einfachen Modelle aus models.js.
(() => {
  // Quellen und Lizenzen: siehe LIZENZEN.md
  // size = Länge in Fahrtrichtung, yaw = Drehung, bis die Nase nach +z zeigt, bottom = Unterkante (y)
  const DEF = {
    puma:   { size: 7.4,  yaw: -Math.PI / 2, bottom: 0 },
    t62:    { size: 9.2,  yaw: Math.PI, bottom: 0 },
    humvee: { size: 4.9,  yaw: 0, bottom: 0 },
    apache: { size: 12.5, yaw: 0, bottom: -1.9 },
    jet:    { size: 12.5, yaw: -Math.PI / 2, bottom: -1.5 },
    ejet:   { size: 12,   yaw: -Math.PI / 2, bottom: -0.9 }
  };
  const X = FL.ext = { tpl: {}, done: false, waiting: [], DEF };
  const norm = s => String(s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const find = (root, name) => { let hit = null; root.traverse(o => { if (!hit && norm(o.name).startsWith(norm(name))) hit = o; }); return hit; };
  X.find = find;

  const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  const script = src => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
  // einfache, schnelle Materialien wie im restlichen Spiel
  const simple = m => {
    const n = new THREE.MeshLambertMaterial({ color: m.color ? m.color.clone() : 0xffffff, map: m.map || null, side: m.side });
    if (m.transparent || m.opacity < 1) { n.transparent = true; n.opacity = Math.min(m.opacity, 0.6); n.depthWrite = false; }
    if (m.alphaTest) n.alphaTest = m.alphaTest;
    return n;
  };
  const prepare = (name, scene) => {
    const d = DEF[name], mats = new Map();
    scene.traverse(o => {
      if (!o.isMesh) return;
      if (!mats.has(o.material)) mats.set(o.material, simple(o.material));
      o.material = mats.get(o.material); o.castShadow = true; o.receiveShadow = false;
    });
    const hold = new THREE.Group(); hold.add(scene);
    scene.rotation.y = d.yaw;
    if (name === 'jet') { const off = find(scene, 'LandingOff'); if (off) off.visible = false; }       // mit ausgefahrenem Fahrwerk vermessen
    hold.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(hold), size = box.getSize(new THREE.Vector3());
    const s = d.size / size.z;
    scene.scale.multiplyScalar(s);
    hold.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(hold);
    const c = box.getCenter(new THREE.Vector3());
    scene.position.x -= c.x; scene.position.z -= c.z; scene.position.y += d.bottom - box.min.y;
    hold.updateMatrixWorld(true);
    box.setFromObject(hold); size = box.getSize(new THREE.Vector3());
    X.tpl[name] = { hold, size, top: box.max.y };
  };
  X.load = () => {
    if (X.promise) return X.promise;
    const names = Object.keys(DEF);
    const one = name => script('models/' + name + '.js').then(() => new Promise((ok, fail) => {
      const data = FL.GLB && FL.GLB[name];
      if (!data || !THREE.GLTFLoader) return fail(new Error('fehlt'));
      new THREE.GLTFLoader().parse(b64(data), '', g => { delete FL.GLB[name]; prepare(name, g.scene); ok(); }, fail);
    })).catch(e => { console.warn('Modell ' + name + ' nicht geladen', e && e.message); });
    X.promise = names.reduce((p, n) => p.then(() => one(n)), Promise.resolve()).then(() => { X.done = true; for (const f of X.waiting.splice(0)) f(); });
    return X.promise;
  };
  // ruft fn auf, sobald alle Modelle da sind (spätestens nach 12 Sekunden, dann eben mit den einfachen Modellen)
  X.whenReady = fn => {
    if (X.done || !X.promise) return fn();
    let called = false; const go = () => { if (!called) { called = true; fn(); } };
    X.waiting.push(go); setTimeout(go, 12000);
  };
  const make = name => {
    const t = X.tpl[name];
    if (!t) return null;
    const g = t.hold.clone(true);
    g.userData = { r: Math.max(t.size.x, t.size.z) * 0.36, h: t.top };
    return g;
  };

  // ---------------------------------------------------------------- die Modell-Funktionen aus models.js ersetzen
  const old = { tank: FL.tankModel, jeep: FL.jeepModel, heli: FL.heliModel, jet: FL.jetModel };
  FL.tankModel = pal => {
    const own = pal === FL.PAL.ally, g = make(own ? 'puma' : 't62');
    if (!g) return old.tank(pal);
    const u = g.userData; u.r = 3.2; u.h = 2.6;
    u.turret = new THREE.Object3D();                              // Platzhalter, damit alter Code nicht stolpert
    const node = own ? find(g, 'turret') : null;
    if (node) { const base = node.rotation.z; u.setTurret = yaw => { node.rotation.z = base + yaw; }; }
    else u.setTurret = () => {};
    return g;
  };
  FL.jeepModel = pal => { const g = make('humvee'); if (!g) return old.jeep(pal); g.userData.r = 2.2; g.userData.h = 2.4; return g; };
  FL.heliModel = () => {
    const g = make('apache');
    if (!g) return old.heli();
    g.userData.rotor = find(g, 'Cube.009') || new THREE.Object3D();
    g.userData.tail = new THREE.Object3D();
    return g;
  };
  FL.jetModel = (color, accent) => {
    const enemy = accent === 0xb03020, g = make(enemy ? 'ejet' : 'jet');
    if (!g) return old.jet(color, accent);
    const u = g.userData, t = X.tpl[enemy ? 'ejet' : 'jet'];
    u.r = 4; u.h = 2;
    const flame = FL.sprite(FL.tex.icon('glow'), 2.4, { add: true }); flame.position.set(0, 0.1, -t.size.z / 2 - 0.3); flame.material.color.set(0xffa040); g.add(flame);
    u.flame = flame;
    const on = find(g, 'LandingOn'), off = find(g, 'LandingOff'), light = find(g, 'LandingLight');
    u.gear = { get visible() { return on ? on.visible : false; }, set visible(v) { if (on) on.visible = v; if (off) off.visible = !v; if (light) light.visible = v; } };
    u.gear.visible = false;
    return g;
  };
})();
