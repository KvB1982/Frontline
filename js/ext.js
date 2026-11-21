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
    jet:    { size: 12.5, yaw: -Math.PI / 2, bottom: -0.62 },
    ejet:   { size: 12,   yaw: -Math.PI / 2, bottom: -0.9 },
    // Deko aus models/deko.js: hier zählt die Höhe (high) statt der Länge
    palm:   { high: 6.6, yaw: 0, bottom: -0.05, file: 'deko', flat: true },
    tree1:  { high: 8.2, yaw: 0, bottom: -0.05, file: 'deko', flat: true },
    tree9:  { high: 7.4, yaw: 0, bottom: -0.05, file: 'deko', flat: true },
    tree4:  { high: 6.4, yaw: 0, bottom: -0.3, file: 'deko', flat: true },
    tree6:  { high: 7.6, yaw: 0, bottom: -0.05, file: 'deko', flat: true },
    tree11: { high: 5.0, yaw: 0, bottom: -0.05, file: 'deko', flat: true },
    tent:   { size: 6.2, yaw: 0, bottom: -0.03, file: 'deko' },
    radar:  { high: 6.6, yaw: 0, bottom: 0, file: 'deko' },
    wtower: { high: 8.8, yaw: 0, bottom: 0, file: 'deko' },
    // mit 3D AI Studio erzeugt: Geschützwagen und eigener Soldat (raw = Maße stecken schon im Modell)
    spg:    { size: 9.4,  yaw: -Math.PI / 2, bottom: 0 },
    werfer: { size: 7.4,  yaw: 0, bottom: 0 },
    lkw:    { size: 7.4,  yaw: -Math.PI / 2, bottom: 0 },
    drohne: { size: 1.1,  yaw: 0, bottom: -0.15 },
    schiff: { size: 46,   yaw: 0, bottom: -2.4 },
    boot:   { size: 26,   yaw: 0, bottom: -2.0 },
    // Geschütze und Gebäude: high = Höhe; axis = Mitte bleibt die Drehachse des Modells (Knoten 'kopf' dreht sich)
    turm:   { high: 3.3, yaw: -Math.PI / 2, bottom: 0, axis: true },
    flak:   { high: 4.2, yaw: Math.PI, bottom: 0, axis: true },
    mgnest: { high: 1.5, yaw: -Math.PI / 2, bottom: 0, axis: true },
    kanone: { high: 5.4, yaw: -Math.PI / 2, bottom: 0, axis: true },
    bunker: { high: 3.7, yaw: Math.PI, bottom: 0 },
    hq:     { high: 10.5, yaw: Math.PI / 2, bottom: 0 },
    soldat: { raw: true }, held: { raw: true }, gegner: { raw: true }, schwer: { raw: true }
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
      if (!mats.has(o.material)) { const nm = simple(o.material); if (d.flat) { nm.flatShading = true; o.geometry.computeVertexNormals(); } mats.set(o.material, nm); }
      o.material = mats.get(o.material); o.castShadow = true; o.receiveShadow = false;
    });
    const hold = new THREE.Group(); hold.add(scene);
    if (d.raw) {
      for (const m of mats.values()) m.side = THREE.DoubleSide;
      const t = X.tpl[name] = { hold, size: new THREE.Vector3(1, 1, 1), top: 1 };
      let skin = null; scene.traverse(o => { if (o.isSkinnedMesh && !skin) skin = o; });
      if (skin) {
        // Figur mit Skelett: Haut, Gelenke und ihre Lage in der Grundhaltung merken; jede Figur im Spiel bekommt eine eigene Kopie der Gelenke
        const sk = skin.skeleton, at = {};
        sk.bones.forEach((bn, i) => { at[bn.name] = new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert()); });
        const leg = at.LeftUpLeg.distanceTo(at.LeftLeg) + at.LeftLeg.distanceTo(at.LeftFoot) + at.LeftFoot.y;
        t.skin = { geo: skin.geometry, mat: skin.material, root: sk.bones[0], names: sk.bones.map(bn => bn.name), inv: sk.boneInverses, at, k: leg / 94.9 };
      }
      return;
    }
    scene.rotation.y = d.yaw;
    hold.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(hold), size = box.getSize(new THREE.Vector3());
    const s = d.high ? d.high / size.y : d.size / size.z;
    scene.scale.multiplyScalar(s);
    hold.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(hold);
    const c = box.getCenter(new THREE.Vector3());
    if (!d.axis) { scene.position.x -= c.x; scene.position.z -= c.z; }
    scene.position.y += d.bottom - box.min.y;
    hold.updateMatrixWorld(true);
    box.setFromObject(hold); size = box.getSize(new THREE.Vector3());
    X.tpl[name] = { hold, size, top: box.max.y };
  };
  // Bewegungen (models/bewegung.js): je Bild 22 Gelenke mal 4 Werte, als Zahlenfelder auspacken
  const readAnim = () => {
    const A = FL.ANIM; if (!A) return;
    const i16 = t => new Int16Array(b64(t));
    for (const c of Object.values(A.clips)) { c.q = i16(c.q); c.h = i16(c.h); }
    X.anim = A;
  };
  X.load = () => {
    if (X.promise) return X.promise;
    const names = Object.keys(DEF);
    const got = {};
    script('models/bewegung.js').then(readAnim).catch(e => { console.warn('Bewegungen nicht geladen', e && e.message); });
    const one = name => { const f = DEF[name].file || name; return got[f] || (got[f] = script('models/' + f + '.js')); };
    const one2 = name => one(name).then(() => new Promise((ok, fail) => {
      const data = FL.GLB && FL.GLB[name];
      if (!data || !THREE.GLTFLoader) return fail(new Error('fehlt'));
      new THREE.GLTFLoader().parse(b64(data), '', g => { delete FL.GLB[name]; prepare(name, g.scene); ok(); }, fail);
    })).catch(e => { console.warn('Modell ' + name + ' nicht geladen', e && e.message); });
    // zwischen zwei Modellen kurz Luft lassen, damit Menü und Bild nicht stocken
    const pause = () => new Promise(ok => setTimeout(ok, 30));
    X.promise = names.reduce((p, n) => p.then(() => one2(n)).then(pause), Promise.resolve()).then(() => { X.done = true; for (const f of X.waiting.splice(0)) f(); });
    return X.promise;
  };
  // ruft fn auf, sobald alle Modelle da sind (spätestens nach 12 Sekunden, dann eben mit den einfachen Modellen)
  X.whenReady = fn => {
    if (!X.promise) X.load();
    if (X.done) return fn();
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
    // Fahrwerk: das gegnerische Modell bringt eines mit, das eigene bekommt ein einfaches zum Ein- und Ausfahren
    const on = find(g, 'LandingOn'), off = find(g, 'LandingOff'), light = find(g, 'LandingLight');
    if (on) u.gear = { get visible() { return on.visible; }, set visible(v) { on.visible = v; if (off) off.visible = !v; if (light) light.visible = v; } };
    else {
      const gear = new THREE.Group(), leg = FL.mat(0xb8bcc0), tyre = FL.mat(0x161616);
      for (const [x, z] of [[0, t.size.z * 0.27], [-1.25, -t.size.z * 0.08], [1.25, -t.size.z * 0.08]]) {
        gear.add(FL.box(0.1, 0.8, 0.1, leg, x, -0.95, z));
        const w = FL.cyl(0.27, 0.27, 0.2, 10, tyre, x, -1.38, z); w.rotation.z = Math.PI / 2; gear.add(w);
      }
      g.add(gear); u.gear = gear;
    }
    u.gear.visible = false;
    return g;
  };
  // ---------------------------------------------------------------- mit 3D AI Studio erzeugte Modelle
  const oldSpg = FL.spgModel, oldSoldier = FL.soldier, oldWerfer = FL.werferModel, oldTruck = FL.truckModel, oldDrone = FL.droneModel, oldShip = FL.shipModel;
  // Einfärben: Die hellen Modelle (Gegner, Lastwagen) bekommen die Farbe der Landschaft. BEIGE ist ihre Grundfarbe.
  const BEIGE = new THREE.Color(0.78, 0.7, 0.55), tints = new Map();
  const tint = (g, color, f) => {
    const c = new THREE.Color(color), key = c.getHex() + '/' + f;
    g.traverse(o => {
      if (!o.isMesh) return;
      const k = o.material.uuid + key;
      if (!tints.has(k)) { const m = o.material.clone(); m.color.setRGB(Math.min(1.7, c.r / BEIGE.r * f), Math.min(1.7, c.g / BEIGE.g * f), Math.min(1.7, c.b / BEIGE.b * f)); tints.set(k, m); }
      o.material = tints.get(k);
    });
  };
  // Geschützwagen mit Rohr (Stufe 1 bis 3); die Raketenwerfer-Stufen bleiben beim einfachen Modell
  FL.spgModel = (pal, lvl) => {
    const g = lvl <= 3 && pal === FL.PAL.ally ? make('spg') : null;
    if (!g) return oldSpg(pal, lvl);
    g.userData = { head: new THREE.Object3D(), r: 3.2, h: 3.2 };
    return g;
  };
  FL.werferModel = pal => { const g = pal === FL.PAL.ally ? make('werfer') : null; if (!g) return oldWerfer(pal); g.userData = { r: 3.2, h: 3 }; return g; };
  FL.truckModel = pal => {
    const g = make('lkw');
    if (!g) return oldTruck(pal);
    if (pal !== FL.PAL.ally && pal.dark) tint(g, pal.dark.color.getHex(), 1.5);
    g.userData = { r: 3.2, h: 3.3 };
    return g;
  };
  FL.droneModel = () => make('drohne') || oldDrone();
  FL.shipModel = big => {
    const g = make(big ? 'schiff' : 'boot');
    if (!g) return oldShip(big);
    const L = big ? 46 : 26, gun = new THREE.Object3D(), spin = new THREE.Object3D();
    g.add(gun, spin);
    g.userData = { r: big ? 13 : 8, h: big ? 9 : 7, hp: big ? 30 : 16, kind: 'ship', gun, spin, len: L };
    return g;
  };
  // Figuren: Jedes Modell hat ein Skelett mit 22 Gelenken. Bewegt wird es mit den Motion-Capture-Aufnahmen aus models/bewegung.js.
  // s = Größe der Figur
  const FIG = { soldat: { s: 1 }, held: { s: 1.14 }, gegner: { s: 1 }, schwer: { s: 1.08 } };
  const ONE = new THREE.Matrix4();
  FL.soldier = o => {
    const kind = o.kind || 'soldat';
    const name = o.team === 'hero' ? 'held' : o.team === 'ally' ? 'soldat' : kind === 'schwer' ? 'schwer' : 'gegner';
    const t = X.tpl[name], f = FIG[name], A = X.anim;
    if (!t || !t.skin || !A) return oldSoldier(o);
    const S = t.skin, g = new THREE.Group(), body = new THREE.Group(), root = S.root.clone(true), by = {};
    root.traverse(bn => { by[bn.name] = bn; });
    const bones = S.names.map(n => by[n]), mesh = new THREE.SkinnedMesh(S.geo, S.mat);
    mesh.castShadow = true; mesh.frustumCulled = false;
    body.add(root, mesh); mesh.bind(new THREE.Skeleton(bones, S.inv), ONE);
    g.add(body);
    let scale = f.s;
    if (o.team === 'enemy') {
      // Rekrut heller und kleiner, Elite dunkler, Kommandant größer mit rotem Barett
      const th = FL.THEMES[o.theme || 'wald'];
      tint(body, kind === 'elite' || kind === 'schwer' ? th.enemyDark : th.enemy, kind === 'rekrut' ? 1.5 : kind === 'elite' ? 1.15 : 1.3);
      if (kind === 'rekrut') scale = 0.94;
      if (kind === 'elite') scale = 1.04;
      if (kind === 'kommandant') { scale = 1.12; const b = FL.ball(0.17, FL.mat(0x8a2020), 0, 1.86 - S.at.Head.y, 0.02 - S.at.Head.z, 10, 6); b.scale.y = 0.45; by.Head.add(b); }
    }
    // Die Waffe liegt in der rechten Hand und zeigt zur linken
    const gun = new THREE.Group(), cm = S.k * 1.05;
    gun.quaternion.fromArray(A.gun.q); gun.position.set(A.gun.p[0] * cm, A.gun.p[1] * cm, A.gun.p[2] * cm);
    if (kind === 'raketen') { const tb = FL.cyl(0.09, 0.09, 1.3, 8, FL.mat(0x4e5a40), 0, 0.12, 0.1); tb.rotation.x = Math.PI / 2; gun.add(tb); }
    else { const look = new THREE.Group(); look.position.set(0, -0.04, -0.05); FL.WEAPON_LOOK[o.team === 'enemy' ? (kind === 'rekrut' ? 1 : 2) : (o.weapon || 0)](look); gun.add(look); }
    by.RightHand.add(gun);
    if (scale !== 1) g.scale.setScalar(scale);
    g.userData = { legs: [], arms: [], body, gun, phase: Math.random() * 6, sk: { bones, hips: by.Hips, at: S.at.Hips, k: S.k, clip: null, time: Math.random() * 2, fade: 0, from: new Float32Array(bones.length * 4), fromH: new THREE.Vector3(), v: 0 } };
    FL.animSoldier(g, 0, false, false);
    return g;
  };
  // Bewegung wählen und abspielen: stehen, gehen, rennen, geduckt gehen, knien. Beim Wechsel wird kurz überblendet.
  const oldAnim = FL.animSoldier, WALKS = { geh: 1, renn: 1, tief: 1, sprint: 1 };
  FL.animSoldier = (g, t, moving, crouch, low) => {
    const u = g.userData, k = u.sk;
    if (!k) return oldAnim(g, t, moving, crouch, low);
    const A = X.anim, C = A.clips;
    let dt = k.t0 === undefined ? 0 : t - k.t0; k.t0 = t;
    if (dt < 0 || dt > 0.25) dt = 0.016;
    // Tempo aus dem zurückgelegten Weg, damit die Schritte zur Geschwindigkeit passen
    const p = g.position;
    if (k.px !== undefined && dt > 0) { const v = Math.hypot(p.x - k.px, p.z - k.pz) / dt; k.v += (Math.min(v, 14) - k.v) * Math.min(1, dt * 8); }
    k.px = p.x; k.pz = p.z;
    const fast = k.v > (k.clip === 'renn' || k.clip === 'sprint' ? 3.0 : 3.8), veryFast = k.v > (k.clip === 'sprint' ? 6.2 : 7.2);
    const want = crouch ? 'duck' : !moving ? 'steh' : veryFast ? 'sprint' : fast ? 'renn' : low ? 'tief' : 'geh';
    if (want !== k.clip) {
      if (k.clip) { for (let i = 0; i < k.bones.length; i++) k.bones[i].quaternion.toArray(k.from, i * 4); k.fromH.copy(k.hips.position); k.fade = 1; }
      if (!(WALKS[want] && WALKS[k.clip])) k.time = WALKS[want] ? k.time : 0;
      else k.time = k.time / C[k.clip].n * C[want].n;                    // im Schritt bleiben
      k.clip = want;
    }
    const c = C[want], n = c.n;
    const rate = c.v && k.v > 0.4 ? Math.min(1.9, Math.max(0.7, k.v / (c.v * g.scale.x))) : c.rate;
    k.time = (k.time + dt * A.fps * rate) % n;
    const i0 = Math.floor(k.time) % n, i1 = (i0 + 1) % n, f = k.time - Math.floor(k.time), nb = k.bones.length, q = c.q;
    if (k.fade > 0) k.fade = Math.max(0, k.fade - dt / 0.2);
    const w = k.fade * k.fade * (3 - 2 * k.fade), from = k.from;
    for (let b = 0; b < nb; b++) {
      const a = (i0 * nb + b) * 4, e = (i1 * nb + b) * 4;
      let x = q[a], y = q[a + 1], z = q[a + 2], s = q[a + 3];
      const sg = x * q[e] + y * q[e + 1] + z * q[e + 2] + s * q[e + 3] < 0 ? -f : f;
      x += (q[e] * (sg < 0 ? -1 : 1) - x) * f; y += (q[e + 1] * (sg < 0 ? -1 : 1) - y) * f; z += (q[e + 2] * (sg < 0 ? -1 : 1) - z) * f; s += (q[e + 3] * (sg < 0 ? -1 : 1) - s) * f;
      let l = 1 / Math.hypot(x, y, z, s); x *= l; y *= l; z *= l; s *= l;
      if (w > 0) {
        const o = b * 4, d = from[o] * x + from[o + 1] * y + from[o + 2] * z + from[o + 3] * s < 0 ? -1 : 1;
        x += (from[o] * d - x) * w; y += (from[o + 1] * d - y) * w; z += (from[o + 2] * d - z) * w; s += (from[o + 3] * d - s) * w;
        l = 1 / Math.hypot(x, y, z, s); x *= l; y *= l; z *= l; s *= l;
      }
      k.bones[b].quaternion.set(x, y, z, s);
    }
    const h = c.h, cm = k.k / 50, a = i0 * 3, e = i1 * 3, hp = k.hips.position;
    hp.set(k.at.x + (h[a] + (h[e] - h[a]) * f) * cm, k.at.y + (h[a + 1] + (h[e + 1] - h[a + 1]) * f) * cm, k.at.z + (h[a + 2] + (h[e + 2] - h[a + 2]) * f) * cm);
    if (w > 0) hp.lerp(k.fromH, w);
  };
  // Bäume: im Bodenkampf und beim Panzer die Sketchfab-Bäume, aus dem Flugzeug (simple) die einfachen, weil dort sehr viele stehen
  const TREES = { pine: ['tree1', 'tree9'], leaf: ['tree4', 'tree6'], palm: ['palm'], deadtree: ['tree11'] };
  const oldTree = FL.tree, oldBuilding = FL.building;
  FL.tree = (kind, rnd, simple) => {
    const list = TREES[kind];
    rnd = rnd || Math.random;
    const g = !simple && list ? make(list[Math.floor(rnd() * list.length) % list.length]) : null;
    if (!g) return oldTree(kind, rnd);
    g.scale.setScalar(0.8 + rnd() * 0.6); g.rotation.y = rnd() * 6.28;
    return g;
  };
  // Gebäude: Zelt, Radar, Wachturm, Bunker, Hauptquartier und die Geschütze kommen als Modell, alles andere bleibt wie bisher
  const BUILD = { tent: 'tent', radar: 'radar', tower: 'wtower', bunker: 'bunker', hq: 'hq', turret: 'turm', flak: 'flak', mgnest: 'mgnest', cannon: 'kanone' };
  FL.building = (kind, theme, opt) => {
    const base = oldBuilding(kind, theme, opt);
    // der eigene Geschützturm hat ab Stufe 4 Raketenbehälter, die gibt es nur als einfaches Modell
    const g = BUILD[kind] && !(kind === 'cannon' && opt && opt.level > 3) ? make(BUILD[kind]) : null;
    if (!g) return base;
    const hold = new THREE.Group(); hold.add(g);
    const u = Object.assign(hold.userData, base.userData), kopf = find(g, 'kopf');
    if (kind === 'radar') u.spin = g;
    if (kind === 'tower') delete u.flag;
    if (kind === 'turret') u.turret = kopf;
    if (kind === 'flak' || kind === 'mgnest') u.gun = kopf;
    if (kind === 'cannon') u.head = kopf;
    if (kind === 'hq' && u.flag) {                                  // die rote Fahne bleibt als Erkennungszeichen auf dem Dach
      const top = X.tpl.hq.top, f = u.flag;
      hold.add(FL.cyl(0.06, 0.06, 3.4, 5, FL.mat(0x999999), 0, top + 1.2, 0)); f.position.set(-0.95, top + 2.3, 0); hold.add(f);
    }
    return hold;
  };
})();
