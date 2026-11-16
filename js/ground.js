'use strict';
// Frontlinie 3 – Basis angreifen im freien Feld. Der Spieler führt als Kommandant seinen Trupp:
// Er tippt auf einen Punkt im Gelände und läuft geduckt dorthin, sichert ein Gebiet nach dem anderen und stürmt am Ende die gegnerische Militärbasis.
// Kameraden und Fahrzeuge folgen lose und handeln selbst: Sie verteilen sich, suchen Deckung, rücken abwechselnd vor und geben Feuerschutz.
// Richtung wie überall: Der Kurs th zeigt nach (sin th, cos th), eine Linksdrehung macht th größer. Bei th = 0 liegt +x links.
//
// Das Gelände ist wellig: gy(x, z) gibt die Höhe des Bodens. Hügel versperren die Sicht und halten Kugeln auf, man kann sich dahinter in Stellung legen.
//
// Aufbau für später: Die Schlacht selbst (Gelände, Gebiete, Gegner, eigene Einheiten in this.own) weiß nichts von der Steuerung.
// Nur control() bewegt die Einheit des Spielers (this.hero). Andere Rollen in derselben Schlacht (Panzer fahren, Luftunterstützung)
// können deshalb später dieselbe Schlacht benutzen und eine andere Einheit steuern.
(() => {
  const C = { gold: '#ffc43c', red: '#ef5a4c', green: '#5fd07a', cyan: '#46dcff', text: '#e9eef2', orange: '#ff8c3c', muted: '#9fb0bd' };
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const smooth = (a, b, v) => { const k = FL.clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const ZONE_R = 17, STEP = 78, FIRST = 62, EDGE = 88;
  const BASE_W = 47, BASE_D = 70, LEVEL = 0.7;                       // halbe Breite und Tiefe der gegnerischen Basis, Höhe ihres ebenen Platzes
  const ALLY_SLOT = [[3.5, 2.5], [-3.5, 2.5], [7.5, 4.5], [-7.5, 4.5], [11.5, 7], [-11.5, 7]];      // [seitlich, dahinter]
  const GROUP_SLOT = [[0, 0], [3.5, 2], [-3.5, 2], [7, 4], [-7, 4], [0, 5], [10.5, 6], [-10.5, 6]]; // Plätze in einer abgeteilten Gruppe
  const GROUP_VEH = [[8, 10], [-8, 10], [0, 14], [15, 12]];
  const ORDERS = ['follow', 'hold', 'storm'];
  const ORDER_NAME = { follow: 'folgt dir', hold: 'hält die Stellung', storm: 'stürmt vor' };
  const SPLIT_NAME = { 1: 'Flanke links', '-1': 'Flanke rechts' };
  const REACH = { gewehr: 36, mg: 40, rakete: 46, granate: 58 };
  const VEH_NAME = { tank: 'Panzer', werfer: 'Raketenwerfer', spg: 'Geschützwagen', gun: 'Geschützwagen' };
  const isVeh = m => m.kind === 'tank' || m.kind === 'werfer' || m.kind === 'spg' || m.kind === 'gun';
  const segDist = (x, z, a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z, k = FL.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    return Math.hypot(x - a.x - dx * k, z - a.z - dz * k);
  };

  FL.GroundBattle = class {
    constructor(cfg, lo) {
      this.cfg = cfg; this.lo = lo; this.result = null; this.kind = 'attack'; this.zoomable = true; this.role = cfg.role || 'commander';
      this.tier = cfg.tier; this.diff = cfg.diff || 0.85;
      this.nSec = Math.max(1, cfg.sections || 2);
      this.armor = 1 + 0.35 * this.tier;
      this.towersOn = cfg.towersOn !== false;
      const st = this.stage = new FL.Stage(cfg.theme, { far: 700, shadow: 70 });
      this.fx = new FL.FX(st);
      this.t = 0; this.secT = 0; this.kills = 0; this.coins = 0; this.section = 0; this.capT = 0;
      this.lives = 4 + lo.lives;
      this.fireCd = 0; this.shotCount = 0; this.towerCd = 0; this.muzzleT = 0; this.eshotT = 0; this.warnT = 0; this.noteT = 0;
      this.specialCd = [0, 0, 0, 0]; this.barrage = null; this.spawnCd = 3; this.invuln = 0; this.ducking = false; this.heroCover = null;
      this.enemies = []; this.bullets = []; this.ebullets = []; this.shells = []; this.aircraft = []; this.jets = [];
      this.structures = []; this.solid = []; this.covers = []; this.spinners = []; this.burning = []; this.gaps = [];
      this.shake = 0; this.endT = -1; this.fortCd = 2; this.order = 'follow'; this.front = 0; this.camTh = 0; this.camY = LEVEL; this.lock = null;
      // Laufziel (Tipp auf den Boden), Umweg durch ein Tor, Stillstand, Zeit seit dem letzten Schuss
      this.dest = null; this.via = null; this.viaHold = 0; this.stuckT = 0; this.still = 0; this.lastShot = 9; this.manualAim = false;
      this.split = 0; this.groups = [null, null, null]; this.reinfUsed = false; this.jetCd = 0;
      this.buildWorld();
      this.buildArmy();
      this.buildHud();
      for (const z of this.zones) this.garrison(z);
      this.garrison(this.base);
      FL.hud.msg(this.zones.length ? 'Tippe auf den Boden: Dorthin läuft dein Kommandant' : 'Stürme die gegnerische Basis!', C.gold);
      // am Rechner: Mausklick ins Gelände = dorthin laufen
      this.onPointer = e => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        const t = e.target;
        if (t && t.closest && t.closest('button, a, input, select, .btn, .screen, .menu, .touch-layer, .pausebtn')) return;
        this.tap(e.clientX, e.clientY);
      };
      window.addEventListener('pointerdown', this.onPointer);
      this.updateCamera(1);
    }

    // ---------------------------------------------------------------- Gelände
    // Höhe des Bodens an der Stelle (x, z)
    gy(x, z) {
      const T = this.ter, fx = (x - T.X0) / T.G, fz = (z - T.Z0) / T.G;
      if (fx < 0 || fz < 0 || fx >= T.nx || fz >= T.nz) return -0.5;
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, w = T.nx + 1, k = j * w + i, h = T.hs;
      return (h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + w] * (1 - u) + h[k + w + 1] * u) * v;
    }
    // Freie Sicht von einem Punkt zum anderen? 1 = frei, sonst der Anteil der Strecke, nach dem ein Hügel im Weg ist.
    losK(x0, y0, z0, x1, y1, z1) {
      const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 2.5);
      for (let i = 1; i < n; i++) { const k = i / n; if (this.gy(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k) > y0 + (y1 - y0) * k + 0.05) return k; }
      return 1;
    }
    inBase(x, z, pad) { pad = pad || 0; return Math.abs(x) < BASE_W + pad && z > this.baseZ - 2 - pad && z < this.baseZ + BASE_D + pad; }
    // Wer von draußen in die Basis will (oder umgekehrt), muss durch ein Tor oder eine Lücke im Zaun
    gapFor(x, z, gx, gz) {
      if (this.inBase(x, z) === this.inBase(gx, gz)) return null;
      let best = null, bd = 1e9;
      for (const g of this.gaps) { const d = Math.hypot(g[0] - x, g[1] - z) + Math.hypot(g[0] - gx, g[1] - gz); if (d < bd) { bd = d; best = g; } }
      return best;
    }
    // Figur oder Fahrzeug auf den Boden stellen. Fahrzeuge neigen sich mit dem Hang.
    place(mesh, x, z, th, veh) {
      mesh.position.set(x, this.gy(x, z), z);
      if (!veh) { mesh.rotation.y = th; return; }
      const s = Math.sin(th), c = Math.cos(th);
      mesh.rotation.order = 'YXZ';
      mesh.rotation.set(-Math.atan2(this.gy(x + s * 2, z + c * 2) - this.gy(x - s * 2, z - c * 2), 4), th, Math.atan2(this.gy(x + c * 1.5, z - s * 1.5) - this.gy(x - c * 1.5, z + s * 1.5), 3));
    }

    buildWorld() {
      const th = this.cfg.theme, st = this.stage, rnd = FL.seeded(11 + this.nSec * 7 + th.length + Math.round(this.tier * 10));
      // Die Gebiete liegen versetzt auf dem Weg zur Basis, damit man wirklich durchs Gelände ziehen muss
      this.zones = [];
      for (let k = 0; k < this.nSec - 1; k++) this.zones.push({ k, x: (k % 2 ? -1 : 1) * (16 + rnd() * 16), z: FIRST + k * STEP, done: false, left: 0, total: 0 });
      const bz = this.baseZ = FIRST + (this.nSec - 1) * STEP + 14;
      this.base = { k: this.nSec - 1, x: 0, z: bz + 34, base: true, left: 0, total: 0 };
      this.zMax = bz + BASE_D + 8;
      const path = this.path = [{ x: 0, z: -8 }, ...this.zones, { x: 0, z: bz - 2 }];
      this.buildTerrain(rnd);
      for (let i = 0; i < path.length - 1; i++) this.road(path[i], path[i + 1], i);
      // Deckung: Sandsäcke quer zum Weg. cover = { x, z, r } gilt für Freund und Feind.
      const bags = this.bags = (x, z, a, len, kind) => {
        const m = FL.building(kind || 'sandbags', th, { len }); m.position.set(x, this.gy(x, z), z); m.rotation.y = a; st.add(m);
        this.covers.push({ x, z, r: len / 2, by: null });
        for (let q = -1; q <= 1; q++) this.solid.push({ x: x + Math.cos(a) * q * len * 0.33, z: z - Math.sin(a) * q * len * 0.33, r: 1.0, alive: true });
      };
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1], dx = b.x - a.x, dz = b.z - a.z, ang = Math.atan2(dx, dz), len = Math.hypot(dx, dz);
        for (const f of [0.3, 0.52, 0.72]) for (const side of [-1, 1]) {
          const off = side * (5.5 + rnd() * 11), along = f * len + (rnd() - 0.5) * 8;
          bags(a.x + Math.sin(ang) * along + Math.cos(ang) * off, a.z + Math.cos(ang) * along - Math.sin(ang) * off, ang + (rnd() - 0.5) * 0.5, 4.5);
        }
      }
      // Hügel sind auch Deckung: Man stellt sich knapp hinter die Kuppe
      for (const q of this.hills) this.covers.push({ x: q.x, z: q.z, r: q.r * 0.42, by: null, hill: true });
      // Gebiete: Ring am Boden, Fahne, Zelt und Sandsäcke der Besatzung
      this.zones.forEach((z, k) => {
        const prev = path[k], ang = Math.atan2(prev.x - z.x, prev.z - z.z), y = this.gy(z.x, z.z);            // Richtung, aus der der Angriff kommt
        z.ang = ang;
        const geo = new THREE.RingGeometry(ZONE_R - 0.7, ZONE_R, 56), mat = new THREE.MeshBasicMaterial({ color: 0xffc43c, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide });
        // der Ring schmiegt sich an den Boden
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setY(i, this.gy(z.x + pos.getX(i), z.z + pos.getZ(i)) + 0.12);
        z.ring = new THREE.Mesh(geo, mat); z.ring.position.set(z.x, 0, z.z); st.add(z.ring);
        st.owned.push(geo, mat);
        st.add(FL.cyl(0.09, 0.09, 8, 5, FL.mat(0xcccccc), z.x, y + 4, z.z));
        z.flag = st.add(FL.box(2.3, 1.3, 0.06, FL.mat(0xc03020), z.x + 1.2, y + 7.2, z.z));
        const tx = z.x - Math.sin(ang) * 8, tz = z.z - Math.cos(ang) * 8;
        const tent = FL.building('tent', th); tent.position.set(tx, this.gy(tx, tz), tz); tent.rotation.y = ang; st.add(tent);
        this.solid.push({ x: tx, z: tz, r: (tent.userData.r || 3) * 0.8, alive: true });
        z.posts = [];
        for (const off of [-8, 0, 8]) {
          const px = z.x + Math.sin(ang) * 8 + Math.cos(ang) * off, pz = z.z + Math.cos(ang) * 8 - Math.sin(ang) * off;
          bags(px, pz, ang, 5);
          z.posts.push([px - Math.sin(ang) * 1.8, pz - Math.cos(ang) * 1.8]);
        }
      });
      this.buildEnemyBase(bz);
      // Bäume, Büsche und Felsen: locker verteilt, Wege, Gebiete und die Basis bleiben frei. Felsen taugen als Deckung.
      for (let i = 0; i < 360; i++) {
        const x = (rnd() * 2 - 1) * 150, z = -75 + rnd() * (this.zMax + 150);
        if (Math.hypot(x, z) < 9) continue;
        if (this.inBase(x, z, 7)) continue;
        if (this.zones.some(q => Math.hypot(q.x - x, q.z - z) < ZONE_R + 3)) continue;
        if (this.covers.some(c => !c.hill && Math.hypot(c.x - x, c.z - z) < 4)) continue;
        let onRoad = false;
        for (let k = 0; k < path.length - 1 && !onRoad; k++) onRoad = segDist(x, z, path[k], path[k + 1]) < 6.5;
        if (onRoad) continue;
        const kind = FL.pick(st.theme.trees), t = FL.tree(kind, rnd);
        t.position.set(x, this.gy(x, z) - 0.05, z);
        const inside = Math.abs(x) < EDGE + 4 && z > -40 && z < this.zMax + 4;
        if (!inside) FL.noShadow(t);
        st.add(t);
        if (inside && kind !== 'bush' && kind !== 'deadbush') {
          this.solid.push({ x, z, r: kind === 'rock' ? 1.6 : 0.8, alive: true });
          if (kind === 'rock') this.covers.push({ x, z, r: 1.9, by: null });
        }
      }
      this.beacon = FL.sprite(FL.tex.icon('target'), 5, { depthTest: false, fog: false }); st.add(this.beacon);
      this.aim = FL.sprite(FL.tex.icon('target'), 2.2, { depthTest: false, fog: false }); st.add(this.aim);
      this.muzzle = FL.sprite(FL.tex.icon('glow'), 1.2, { add: true }); this.muzzle.visible = false; st.add(this.muzzle);
      // Markierung für das Laufziel
      const mg = new THREE.RingGeometry(0.75, 1.1, 28), mm = new THREE.MeshBasicMaterial({ color: 0x46dcff, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, side: THREE.DoubleSide });
      this.marker = new THREE.Mesh(mg, mm); this.marker.rotation.x = -Math.PI / 2; this.marker.visible = false; st.add(this.marker);
      st.owned.push(mg, mm);
    }

    // Welliges Gelände: sanfte Bodenwellen und einzelne Hügel. Wege, Gebiete und die Basis liegen flacher.
    buildTerrain(rnd) {
      const st = this.stage, th = this.cfg.theme, bz = this.baseZ, path = this.path;
      const G = 3, X0 = -(EDGE + 72), Z0 = -112, nx = Math.ceil((EDGE + 72) * 2 / G), nz = Math.ceil((this.zMax + 112 - Z0) / G);
      const X1 = X0 + nx * G, Z1 = Z0 + nz * G, p = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
      const roadDist = (x, z) => { let d = 1e9; for (let k = 0; k < path.length - 1; k++) d = Math.min(d, segDist(x, z, path[k], path[k + 1])); return d; };
      const hills = this.hills = [];
      const tryHill = (x, z, r, h) => {
        if (Math.abs(x) > EDGE - 6 || this.inBase(x, z, r + 5) || Math.hypot(x, z + 4) < r + 10 || roadDist(x, z) < r * 0.6 + 4) return;
        if (this.zones.some(q => Math.hypot(q.x - x, q.z - z) < ZONE_R + r * 0.55) || hills.some(q => Math.hypot(q.x - x, q.z - z) < (q.r + r) * 0.7)) return;
        hills.push({ x, z, r, h });
      };
      // vor jedem Gebiet und vor der Basis liegen zwei Hügel, von denen aus man gut in Stellung gehen kann
      for (let k = 1; k < path.length; k++) {
        const a = path[k - 1], b = path[k], ang = Math.atan2(b.x - a.x, b.z - a.z), last = k === path.length - 1;
        for (const side of [-1, 1]) {
          const back = (last ? 26 : 29) + rnd() * 7, off = side * (13 + rnd() * 9);
          tryHill(b.x - Math.sin(ang) * back + Math.cos(ang) * off, b.z - Math.cos(ang) * back - Math.sin(ang) * off, 9 + rnd() * 3, 2.5 + rnd() * 0.8);
        }
      }
      for (let i = 0; i < 8 + 5 * this.nSec; i++) tryHill((rnd() * 2 - 1) * (EDGE - 8), 8 + rnd() * (bz - 30), 8 + rnd() * 6, 2.1 + rnd() * 1.3);
      const height = (x, z) => {
        let u = 0.55 * (1 + Math.sin(x * 0.043 + p[0]) * Math.cos(z * 0.036 + p[1])) + 0.3 * (1 + Math.sin((x * 0.6 + z) * 0.09 + p[2]));
        for (const q of hills) { const d2 = ((x - q.x) * (x - q.x) + (z - q.z) * (z - q.z)) / (q.r * q.r); if (d2 < 6) u += q.h * Math.exp(-d2 * 1.6); }
        let m = smooth(0, 16, Math.hypot(Math.max(Math.abs(x) - BASE_W - 3, 0), Math.max(bz - 5 - z, z - bz - BASE_D - 3, 0)));
        m *= 0.3 + 0.7 * smooth(6, 18, Math.hypot(x, z + 4));
        for (const q of this.zones) m *= 0.3 + 0.7 * smooth(ZONE_R - 3, ZONE_R + 10, Math.hypot(q.x - x, q.z - z));
        m *= 0.45 + 0.55 * smooth(4, 12, roadDist(x, z));
        const e = Math.min(x - X0, X1 - x, z - Z0, Z1 - z);
        return FL.lerp(-0.9, LEVEL + (u - LEVEL) * m, smooth(0, 24, e));
      };
      const w = nx + 1, hs = new Float32Array(w * (nz + 1)), pos = [], uv = [], idx = [];
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const x = X0 + i * G, z = Z0 + j * G, y = hs[j * w + i] = height(x, z);
        pos.push(x, y, z); uv.push(x / 18, z / 18);
      }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * w + i; idx.push(a, a + w, a + 1, a + w, a + w + 1, a + 1); }
      this.ter = { G, X0, Z0, nx, nz, hs };
      const far = st.ground(1800, FL.tex.ground(th), 18, -0.5); far.position.z = bz / 2;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const tex = FL.tex.ground(th).clone(); tex.needsUpdate = true; tex.repeat.set(1, 1);
      const mat = new THREE.MeshPhongMaterial({ map: tex, shininess: 2, specular: 0x050505 });
      this.terrain = new THREE.Mesh(geo, mat); this.terrain.receiveShadow = true; st.add(this.terrain);
      st.owned.push(geo, tex, mat);
    }
    // Ein Weg als Band, das dem Gelände folgt
    road(a, b, i) {
      const st = this.stage, dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), s = dx / len, c = dz / len, n = Math.ceil((len + 6) / 2.5);
      const pos = [], uv = [], idx = [];
      for (let k = 0; k <= n; k++) {
        const along = -3 + (len + 6) * k / n, cx = a.x + s * along, cz = a.z + c * along;
        for (let q = 0; q < 5; q++) { const off = (q - 2) * 2, x = cx + c * off, z = cz - s * off; pos.push(x, this.gy(x, z) + 0.08 + i * 0.004, z); uv.push(q / 4, along / 12); }
      }
      for (let k = 0; k < n; k++) for (let q = 0; q < 4; q++) { const v = k * 5 + q; idx.push(v, v + 5, v + 1, v + 5, v + 6, v + 1); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const tex = FL.tex.road(this.cfg.theme).clone(); tex.needsUpdate = true; tex.repeat.set(1, 1);
      const mat = new THREE.MeshPhongMaterial({ map: tex, shininess: 2, specular: 0x050505, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; st.add(m);
      st.owned.push(geo, tex, mat);
    }

    // Die gegnerische Basis ist ein Militärlager wie die eigene Basis: Zaun mit Stacheldraht, Kontrollpunkt, Wachtürme, Bunker, MG-Nester,
    // Kommandogebäude, Kasernen, Zelte, Fuhrpark mit vielen Fahrzeugen, Hubschrauberlandeplatz, Tanklager, Radar. Sie wächst mit den Leveln.
    buildEnemyBase(bz) {
      const th = this.cfg.theme, st = this.stage, T = Math.round(this.tier), W = BASE_W, D = BASE_D, pal = FL.PAL.enemy(th);
      const add = (kind, x, dz, key, baseHp, opt, rot, mesh) => {
        mesh = mesh || FL.building(kind, th, opt);
        const z = bz + dz, u = mesh.userData;
        mesh.position.set(x, this.gy(x, z), z); if (rot) mesh.rotation.y = rot;
        st.add(mesh);
        if (u.spin) this.spinners.push(u.spin);
        const r = opt && opt.len ? opt.len / 2 : u.r || 3;
        const s = { kind, x, z, y: mesh.position.y, r, h: u.h || 4, hp: baseHp, max: baseHp, key, mesh, alive: true, fuel: !!u.fuel };
        if (opt && opt.len) { const alongZ = Math.abs(Math.sin(rot || 0)) > 0.7; s.flat = true; s.hx = alongZ ? 0.7 : r; s.hz = alongZ ? r : 0.7; }
        this.structures.push(s); this.solid.push(s);
        return s;
      };
      const deco = (kind, x, dz, rot, solidR, opt) => {
        const m = FL.building(kind, th, opt), z = bz + dz; m.position.set(x, this.gy(x, z), z); if (rot) m.rotation.y = rot; st.add(m);
        if (solidR) this.solid.push({ x, z, r: solidR, alive: true });
        return m;
      };
      // befestigte Wege und Plätze
      const strip = (w, len, tex, x, dz, y, rot) => { const m = st.strip(w, len, tex, 8, 12, x, bz + dz, LEVEL + y); if (rot) m.rotation.z = rot; m.material.polygonOffset = true; m.material.polygonOffsetFactor = -3; m.material.polygonOffsetUnits = -3; st.add(m); };
      const con = FL.tex.concrete(th === 'winter' ? '#aab2b8' : th === 'wueste' ? '#b0a488' : '#8d9092');
      strip(8, 44, FL.tex.road(th), 0, 18, 0.05);
      strip(8, W * 2, FL.tex.road(th), 0, 32, 0.06, Math.PI / 2);
      strip(26, 22, con, 27, 24, 0.045);
      strip(18, 14, con, 0, 47, 0.045);
      // Zaun rundherum, mit Kontrollpunkt vorn und je einem Seitentor
      const fence = (x, dz, len, rot) => { add('fence', x, dz, false, 2, { len }, rot).fence = true; };
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 4; i++) fence(sx * (10 + 4.625 + i * 9.25), -2, 9.25, 0);
        for (let i = 0; i < 4; i++) fence(sx * W, -2 + 3.5 + i * 7, 7, sx * -Math.PI / 2);
        for (let i = 0; i < 4; i++) fence(sx * W, 38 + 4 + i * 8, 8, sx * -Math.PI / 2);
        for (let i = 0; i < 5; i++) fence(sx * (4.7 + i * 9.4), D, 9.4, Math.PI);
      }
      this.gaps.push([0, bz - 2], [-W, bz + 32], [W, bz + 32]);
      deco('checkpoint', 0, -2, 0); this.solid.push({ x: -8.6, z: bz - 2, r: 1.9, alive: true });
      // Wachtürme, MG-Nester, Bunker, Geschütztürme
      for (const sx of [-1, 1]) {
        add('tower', sx * 13, 3, true, 45);
        add('mgnest', sx * 16, 10, true, 30, null, Math.PI);
        if (T >= 1) { add('bunker', sx * 27, 14, true, 70); add('tower', sx * (W - 3), 2, true, 45); }
        if (T >= 3) { add('turret', sx * 36, 8, true, 70, null, Math.PI); add('tower', sx * (W - 3), D - 4, true, 45); }
      }
      // Gebäude
      add(FL.THEMES[th].style === 'wood' && T < 1 ? 'barracks' : 'hq', 0, 47, true, 150);
      add('barracks', -22, 56, true, 55);
      add('depot', 37, 44, true, 55);
      add('radar', -9, 63, true, 55);
      if (T >= 1) add('hangar', -38, 59, true, 55);
      if (T >= 2) { add('barracks', 22, 58, true, 55); add('antenna', 9, 64, true, 40); add('depot', 37, 53, true, 55); }
      if (th === 'industrie') add('chimney', 30, 64, true, 55);
      for (const x of [-38, -31, -24]) add('tent', x, 43, false, 20, null, Math.PI);
      add('container', 14, 37, false, 20, { color: 0x3e5a48 }); add('container', 14, 39.7, false, 20, { color: 0x6a5a3a }); add('container', 21, 38.4, false, 20, { color: 0x4a5560 }, Math.PI / 2);
      for (const [x, dz] of [[9, 13], [-9, 24], [21, 45], [-15, 37], [-34, 10]]) add('crates', x, dz, false, 10, null, x);
      for (const [x, dz] of [[32, 48], [41, 49], [-6, 12]]) add('barrels', x, dz, false, 8);
      // Fuhrpark: Lastwagen, Jeeps und Panzer unter dem Dach und davor in einer Reihe
      add('garage', 27, 31, false, 30);
      const cars = [[21, 30.5, 'truck'], [27, 30.5, 'tank'], [33, 30.5, 'truck'], [19, 19, 'jeep'], [24.5, 19, 'truck'], [30, 19, 'jeep'], [35.5, 19, 'tank'], [38, 26, 'jeep']];
      cars.slice(0, 5 + T).forEach(([x, dz, k], i) => {
        const m = (k === 'truck' ? FL.truckModel : k === 'jeep' ? FL.jeepModel : FL.tankModel)(pal); m.scale.setScalar(0.8);
        const s = add('parked', x, dz, false, 14, null, Math.PI + (i % 3 - 1) * 0.06, m); s.r = 2.4; s.h = 2.6;
      });
      // Hubschrauberlandeplatz
      deco('helipad', -28, 23);
      { const m = FL.heliModel(); m.scale.setScalar(0.85); const s = add('parked', -28, 23, false, 16, null, 2.4, m); s.r = 3; s.h = 3; m.position.y += 0.15; }
      for (const [x, dz] of [[-42, 12], [42, 12], [-42, 50], [42, 60], [-12, 34], [12, 30]]) deco('floodlight', x, dz, x > 0 ? -1.2 : 1.2, 0.5);
      st.add(FL.cyl(0.08, 0.08, 9, 5, FL.mat(0xcccccc), -8, LEVEL + 4.5, bz + 40)); st.add(FL.box(2.4, 1.4, 0.06, FL.mat(0xc03020), -6.8, LEVEL + 8.2, bz + 40));
      // Schutzwälle für die Besatzung: nach vorn und zu den Seitentoren
      const posts = this.base.posts = [];
      for (const [x, dz, len] of [[-6, 8, 5], [6, 8, 5], [-22, 6, 6], [22, 6, 6], [-8, 34, 5], [8, 34, 5], [0, 39, 6]]) { this.bags(x, bz + dz, 0, len, 'hesco'); posts.push([x, bz + dz + 1.9]); }
      for (const [x, dz] of [[-37, 25], [37, 37], [-37, 38], [37, 13]]) { this.bags(x, bz + dz, Math.PI / 2, 5, 'hesco'); posts.push([x - Math.sign(x) * 1.9, bz + dz]); }
      // Die Gebäude halten so viel aus, dass die eigene Armee die Basis in gut einer Minute schaffen kann.
      const total = this.structures.reduce((a, s) => a + (s.key ? s.max : 0), 0);
      const f = this.armyDps() * (36 + 4 * this.tier) / total;
      for (const s of this.structures) if (!s.fence) s.hp = s.max = Math.max(4, s.max * f);
    }

    // ---------------------------------------------------------------- eigene Truppe
    mkUnit(kind, slot, hp, mesh, x, z) {
      const st = this.stage, veh = isVeh({ kind });
      const icon = FL.sprite(FL.tex.icon(veh ? 'wrench' : 'cross'), 0.9, { depthTest: false });
      icon.visible = false; st.add(icon); st.add(mesh);
      if (veh) mesh.scale.setScalar(0.8);
      const m = {
        kind, slot, grp: 0, gslot: null, x, z, th: 0, vx: 0, vz: 0, hp, max: hp, down: false, downT: 0, revive: 0, fireCd: FL.rand(0.4, 1.2), think: FL.rand(0, 0.4),
        gx: x, gz: z, hx: x, hz: z, cover: null, threat: null, moving: false, crouch: false, stuck: 0, blocked: 0, push: 0, av: { t: 0, side: 1, keep: 0, n: 0 }, via: null, viaHold: 0, tur: 0, salvo: null, mesh, icon
      };
      this.place(mesh, x, z, 0, veh);
      return m;
    }
    buildArmy() {
      const lo = this.lo, mk = (kind, slot, hp, mesh) => this.mkUnit(kind, slot, hp, mesh, slot[0], -slot[1] - 2);
      this.hero = mk('hero', [0, -2], 8 + 3 * lo.vest, FL.soldier({ team: 'hero', weapon: lo.weapon }));
      this.allies = [];
      for (let i = 0; i < lo.allies; i++) this.allies.push(mk('ally', ALLY_SLOT[i], 3, FL.soldier({ team: 'ally', weapon: Math.max(0, lo.weapon - 1) })));
      this.vehicles = [];
      if (lo.tank) this.vehicles.push(mk('tank', [14, 9], 25, FL.tankModel(FL.PAL.ally)));
      if (lo.werfer) this.vehicles.push(mk('werfer', [-14, 13], 20, FL.werferModel(FL.PAL.ally)));
      // Die Geschütze aus dem Laden fahren beim Angriff als Geschützwagen weiter hinten mit
      this.spgs = [];
      if (lo.towers > 0) {
        const tw = FL.TOWER_LEVELS[lo.towers - 1];
        for (let i = 0; i < tw.count; i++) { const v = mk('spg', [i ? -8 : 8, 22], 22, FL.spgModel(FL.PAL.ally, lo.towers)); v.mesh.visible = this.towersOn; this.vehicles.push(v); this.spgs.push(v); }
      }
      this.own = [this.hero, ...this.allies, ...this.vehicles];
    }

    buildHud() {
      FL.hud.clear();
      this.hTL = FL.hud.box('hud-tl'); this.hTC = FL.hud.box('hud-tc'); this.hTR = FL.hud.box('hud-tr');
      this.hInfo = FL.el('div', '', '', this.hTR);
      this.map = FL.el('canvas', 'minimap', null, this.hTR); this.map.width = this.map.height = 170;
      this.hBC = FL.hud.box('hud-bc');
      FL.hud.box('hud-bl').innerHTML = 'Mausklick ins Gelände: dorthin laufen · ← → drehen und zielen · Leertaste schießen · C anhalten · Mausrad Zoom · Q Befehl an den Trupp · R Trupp teilen (Flanke) · X Geschütze · 1 2 3 4 Unterstützung · 5 Verstärkung · 6 Kampfjets · P Pause';
      this.hCover = FL.el('div', 'cover-note', 'IN DECKUNG', FL.hud.root);
      // Splitter von Explosionen sollen auf dem welligen Boden liegen, nicht darunter
      const sc = this.fx.scorch.bind(this.fx);
      this.fx.scorch = (x, z, r) => { sc(x, z, r); const m = this.fx.scorches[this.fx.scorches.length - 1]; if (m) m.position.y += this.gy(x, z) + 0.04; };
    }

    // ---------------------------------------------------------------- Stärke und Schwierigkeit
    weaponDps(lvl, slow) { const w = FL.WEAPONS[lvl]; return w.dmg * w.shots / (w.rate * (slow || 1)); }
    armyDps() {
      const lo = this.lo;
      let dps = this.weaponDps(lo.weapon) * 0.6;
      const up = this.allies ? this.allies.filter(a => !a.down).length : lo.allies;
      dps += up * this.weaponDps(Math.max(0, lo.weapon - 1), 1.4) * 0.45;
      if (this.vehicles) { for (const v of this.vehicles) if (!v.down && v.kind !== 'spg') dps += v.kind === 'tank' ? 3.5 : 4; }
      else dps += lo.tank * 3.5 + lo.werfer * 4;
      if (this.towersOn && lo.towers > 0) { const tw = FL.TOWER_LEVELS[lo.towers - 1]; dps += tw.count * tw.n * tw.dmg / tw.reload * 0.5; }
      return dps;
    }
    weights() { return FL.enemyWeights(this.tier + this.section * 0.4); }
    spawnDelay() {
      const w = this.weights();
      let total = 0, hp = 0;
      for (const k in w) { total += w[k]; hp += w[k] * FL.ENEMIES[k].hp; }
      const avg = hp / total * this.armor;
      // Es kommen mit der Zeit immer mehr Gegner, aber nie mehr, als die eigene Armee schaffen kann.
      const wanted = 0.4 + 0.08 * this.tier + this.secT / 70 + 0.1 * this.section;
      const possible = this.diff * this.armyDps() / avg * 0.8;
      return FL.clamp(1 / Math.min(wanted, possible), 0.8, 3.2) * FL.rand(0.75, 1.25);
    }
    maxEnemies() { return 5 + 2 * this.allies.length + 2 * this.vehicles.length + Math.round(this.tier) + this.section; }
    alive() { return this.enemies.filter(e => !e.dead); }
    objective() { return this.section < this.zones.length ? this.zones[this.section] : this.base; }
    baseActive() { return this.section >= this.zones.length && this.endT < 0; }
    keyLeft() { return this.structures.filter(s => s.alive && s.key).length; }
    up() { return this.own.filter(m => !m.down); }

    // ---------------------------------------------------------------- Gegner
    spawnEnemy(x, z, zone, guard, noVehicle, forced) {
      let kind = forced || FL.weighted(this.weights());
      for (let i = 0; i < 6 && noVehicle && FL.ENEMIES[kind].vehicle; i++) kind = FL.weighted(this.weights());
      if (noVehicle && FL.ENEMIES[kind].vehicle) kind = 'soldat';
      const d = FL.ENEMIES[kind];
      const e = {
        kind, vehicle: !!d.vehicle, gun: d.gun, rate: d.rate, pts: d.pts, x, z, y: 0, th: Math.PI, zone, guard: !!guard, awake: !guard, age: 0,
        hp: Math.max(1, Math.round(d.hp * this.armor)), speed: d.speed * (1 + this.tier * 0.03) * FL.rand(0.9, 1.1),
        reach: REACH[d.gun], pref: kind === 'panzer' ? 40 : kind === 'jeep' ? 26 : guard ? 30 : FL.rand(14, 25),
        fireCd: FL.rand(0.6, 2.2), think: FL.rand(0, 0.4), ph: FL.rand(0, 6.28), r: d.vehicle ? 2.4 : 0.9, tg: null
      };
      e.max = e.hp;
      if (e.vehicle) { e.mesh = (kind === 'jeep' ? FL.jeepModel : FL.tankModel)(FL.PAL.enemy(this.cfg.theme)); e.mesh.scale.setScalar(0.8); }
      else e.mesh = FL.soldier({ team: 'enemy', kind, theme: this.cfg.theme });
      if (e.max > 1) { e.bar = FL.box(1, 0.09, 0.03, FL.basic(0xf05a46), 0, e.vehicle ? 3.4 : 2.25, 0); e.bar.castShadow = false; e.mesh.add(e.bar); }
      this.place(e.mesh, x, z, e.th, e.vehicle); e.y = e.mesh.position.y;
      this.stage.add(e.mesh); this.enemies.push(e);
      return e;
    }
    // Besatzung eines Gebiets (oder der Basis): wartet hinter ihrer Deckung, bis der Trupp näher kommt. Dazu eine Reserve, die später nachrückt.
    garrison(z) {
      let n = Math.round(3 + 1.1 * this.tier + 0.6 * z.k + (z.base ? 2 : 0));
      for (let i = 0; i < n; i++) {
        const p = z.posts[i] || [z.x + FL.rand(-9, 9), z.z + FL.rand(-7, 9)];
        this.spawnEnemy(p[0] + FL.rand(-0.8, 0.8), p[1] + FL.rand(-0.5, 0.5), z, true, true);
      }
      // In der Basis stehen ab den mittleren Leveln auch besetzte Fahrzeuge bereit
      if (z.base && this.tier >= 1) { this.spawnEnemy(10, this.baseZ + 22, z, true, false, 'jeep'); n++; }
      if (z.base && this.tier >= 2.5) { this.spawnEnemy(-11, this.baseZ + 25, z, true, false, 'panzer'); n++; }
      z.reserve = z.base ? 1e9 : Math.round(10 + 6 * this.tier + 3 * z.k);
      z.total = n + (z.base ? 0 : z.reserve);
    }
    // Verstärkung kommt von dort, wo der Kommandant gerade nicht steht
    reinforce(z) {
      const h = this.hero, next = this.path[z.k + 2] || { x: 0, z: this.baseZ + 4 };
      let cands;
      if (z.base) cands = [[-22, this.baseZ + 50], [22, this.baseZ + 51], [0, this.baseZ + 60], [-30, this.baseZ + 36]];
      else {
        const a = Math.atan2(next.x - z.x, next.z - z.z), s = Math.sin(a), c = Math.cos(a);
        cands = [[z.x + s * 52, z.z + c * 52], [z.x + s * 30 + c * 48, z.z + c * 30 - s * 48], [z.x + s * 30 - c * 48, z.z + c * 30 + s * 48]];
      }
      cands = cands.filter(p => Math.abs(p[0]) < EDGE + 20).sort((p, q) => Math.hypot(q[0] - h.x, q[1] - h.z) - Math.hypot(p[0] - h.x, p[1] - h.z));
      const p = z.base ? cands[Math.random() < 0.6 ? 0 : 1] : (cands.find(q => Math.hypot(q[0] - h.x, q[1] - h.z) > 46 && Math.random() < 0.6) || cands[0]);
      const e = this.spawnEnemy(p[0] + FL.rand(-6, 6), p[1] + FL.rand(-6, 6), z, false, !!z.base);
      this.pushOut(e, e.r);
      z.reserve--;
    }
    damage(e, d) {
      if (e.dead) return;
      e.hp -= d;
      // Wer beschossen wird oder einen Kameraden fallen sieht, wird wach
      if (!e.awake || e.hp <= 0) for (const o of this.enemies) if (!o.dead && !o.awake && Math.hypot(o.x - e.x, o.z - e.z) < 24) o.awake = true;
      if (e.bar) e.bar.scale.x = Math.max(0.02, e.hp / e.max);
      if (e.hp > 0) { FL.audio.play('hit'); return; }
      e.dead = true;
      this.kills++; this.coins += Math.max(1, Math.round(e.pts / 25));
      if (e.vehicle) { this.fx.explosion(e.x, e.y + 0.5, e.z, 1.3); FL.audio.play('boom'); }
      else { this.fx.vanish(e.x, e.y, e.z); FL.audio.play('pop'); }
      this.stage.scene.remove(e.mesh);
    }
    damageStructure(s, d) {
      if (!s.alive) return;
      if (s.fence) {
        // Zäune halten keine Explosion und keinen Panzer aus: Es entsteht eine Lücke, durch die alle hindurchkönnen
        s.alive = false; this.stage.scene.remove(s.mesh); this.fx.dust(s.x, s.y + 1, s.z, 2.5); this.gaps.push([s.x, s.z]);
        return;
      }
      if (!this.baseActive()) { if (this.noteT <= 0 && this.endT < 0) { this.noteT = 4; FL.hud.msg('Erst alle Gebiete sichern, dann fällt die Basis!', C.text, true); } return; }
      s.hp -= d;
      if (s.hp > 0) return;
      s.alive = false;
      this.fx.explosion(s.x, s.y + 1, s.z, Math.max(1.6, s.r * 0.45));
      this.fx.explosion(s.x + FL.rand(-2, 2), s.y + s.h * 0.6, s.z + FL.rand(-1, 1), Math.max(1.2, s.r * 0.3), true);
      for (let i = 0; i < 14; i++) this.fx.chunk(s.x + FL.rand(-s.r, s.r) * 0.6, s.y + FL.rand(1, s.h), s.z, 2);
      FL.audio.play(s.r > 6 ? 'bigboom' : 'boom');
      this.shake = 0.4;
      this.stage.scene.remove(s.mesh);
      const rb = FL.rubble(s.r, s.h); rb.position.set(s.x, s.y, s.z); this.stage.add(rb);
      this.burning.push({ x: s.x, z: s.z, t: 12, size: Math.max(2, s.r * 0.5) });
      this.coins += s.key ? 10 : 3;
      // Tanklager und Fässer reißen mit, was daneben steht
      if (s.fuel) this.explode(s.x, s.z, s.kind === 'barrels' ? 5 : 9, 12);
      if (s.key) {
        const left = this.keyLeft();
        if (left === 0) { this.endT = 3; FL.hud.msg('BASIS EROBERT!', C.gold); for (const e of this.enemies) if (!e.dead) { e.dead = true; this.fx.vanish(e.x, e.y, e.z); this.stage.scene.remove(e.mesh); } }
        else FL.hud.msg('Zerstört! Noch ' + left + (left === 1 ? ' Ziel' : ' Ziele'), C.orange, true);
      }
    }
    onStructure(s, x, z, pad) { return s.flat ? Math.abs(x - s.x) < s.hx + pad && Math.abs(z - s.z) < s.hz + pad : Math.hypot(x - s.x, z - s.z) < s.r * 0.8 + pad; }
    explode(x, z, radius, dmg, y) {
      FL.audio.play('boom');
      this.shake = Math.max(this.shake, 0.22);
      this.fx.explosion(x, y === undefined ? this.gy(x, z) + 0.3 : y, z, radius / 3);
      for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - x, e.z - z) < radius + (e.vehicle ? 1.2 : 0)) this.damage(e, dmg);
      const act = this.baseActive();
      if (this.inBase(x, z, radius + 4)) for (const s of this.structures) if (s.alive && (act || s.fence) && this.onStructure(s, x, z, radius)) this.damageStructure(s, dmg * 1.5);
    }
    hurt(m, d) {
      if (m.down || this.endT >= 0) return;
      if (m === this.hero) {
        if (this.invuln > 0) return;
        m.hp -= d; FL.hud.damage(0.5); FL.audio.play('ouch');
        if (m.hp <= 0) {
          m.hp = m.max; this.invuln = 3; this.lives--; FL.hud.damage(1);
          if (this.lives <= 0) { this.lives = 0; this.result = 'lose'; }
          else FL.hud.msg('Du wurdest getroffen! Ein Leben weniger', C.red, true);
        }
        return;
      }
      m.hp -= d;
      if (m.hp > 0) return;
      m.down = true; m.downT = 0; m.revive = 0; m.moving = false; m.salvo = null;
      if (m.cover) { m.cover.by = null; m.cover = null; }
      FL.audio.play('pop');
      if (isVeh(m)) { this.fx.explosion(m.x, this.gy(m.x, m.z) + 1.5, m.z, 0.8, true); FL.hud.msg(VEH_NAME[m.kind] + ' beschädigt! Hinlaufen und daneben stehen bleiben', C.red, true); }
      else FL.hud.msg('Kamerad getroffen! Hinlaufen und daneben stehen bleiben', C.red, true);
    }
    // Wie hoch ragt eine Einheit über den Boden? Wer kniet und nicht schießt, macht sich ganz klein.
    stanceH(m) {
      if (isVeh(m)) return 1.7;
      if (m === this.hero) return this.ducking ? (this.lastShot > 0.6 ? 0.75 : 1.05) : 1.4;
      return m.crouch ? 1.0 : 1.45;
    }
    // Steht m in Stellung hinter einer Deckung, die zwischen ihm und dem Schützen liegt? (Hügel zählen schon über die freie Sicht.)
    covered(m, sx, sz) {
      const hero = m === this.hero;
      if (isVeh(m) || !(hero ? this.ducking : m.crouch)) return 0;
      for (const c of this.covers) {
        if (c.hill) continue;
        const dx = c.x - m.x, dz = c.z - m.z;
        if (Math.hypot(dx, dz) < c.r + 1.9 && dx * (sx - m.x) + dz * (sz - m.z) > 0) return hero ? (this.lastShot > 0.6 ? 1 : 0.75) : 0.7;
      }
      return hero ? 0.4 : 0.25;                             // in Stellung ohne Deckung: schwerer zu treffen
    }
    // Wen nimmt ein Schütze an der Stelle (x, z) aufs Korn? Meist den Nächsten, Fahrzeuge etwas lieber.
    pickOwn(x, z, range) {
      let best = null, bs = range;
      for (const m of this.own) {
        if (m.down || (m.kind === 'spg' && !this.towersOn)) continue;
        const d = Math.hypot(m.x - x, m.z - z) * (m === this.hero ? 0.95 : isVeh(m) ? 0.9 : 1);
        if (d < bs) { bs = d; best = m; }
      }
      return best;
    }
    enemyFire(e, m) {
      const n = e.gun === 'mg' ? (e.fort ? 2 : 3) : 1, spread = e.gun === 'mg' ? 1.4 : 0.9;
      const speed = e.gun === 'rakete' ? 18 : e.gun === 'granate' ? 24 : 34;
      const d = Math.hypot(m.x - e.x, m.z - e.z), T0 = d / speed;
      const sy = e.fort ? e.y + e.h : this.gy(e.x, e.z) + (e.vehicle ? 1.8 : 1.35), hgt = this.stanceH(m);
      if (this.eshotT <= 0) { this.eshotT = 0.1; FL.audio.play(e.gun === 'rakete' ? 'rocket' : 'eshot'); }
      for (let k = 0; k < n; k++) {
        // etwas vorhalten, aber nicht perfekt: Wer in Bewegung bleibt, wird seltener getroffen
        const lead = FL.rand(0.1, 0.85);
        let tx = m.x + m.vx * T0 * lead + FL.rand(-spread, spread), tz = m.z + m.vz * T0 * lead + FL.rand(-spread, spread);
        let ty = this.gy(tx, tz) + hgt, T = Math.hypot(tx - e.x, tz - e.z) / speed, blocked = false;
        // Liegt ein Hügel dazwischen, bleibt der Schuss dort stecken (Granaten fliegen im Bogen darüber)
        if (e.gun !== 'granate') {
          const q = this.losK(e.x, sy, e.z, tx, ty, tz);
          if (q < 1) { blocked = true; tx = FL.lerp(e.x, tx, q); tz = FL.lerp(e.z, tz, q); ty = this.gy(tx, tz) + 0.1; T *= q; }
        }
        const b = { sx: e.x, sz: e.z, sy, tx, tz, ty, t: -k * 0.1, T: Math.max(0.05, T), kind: e.gun, target: m, blocked };
        b.mesh = e.gun === 'rakete' ? FL.rocketModel() : e.gun === 'granate' ? FL.shellModel(0.13) : this.fx.shot(0xff5a46, 0.09, 1.5);
        if (e.gun === 'rakete' || e.gun === 'granate') this.stage.add(b.mesh);
        b.mesh.visible = false;
        this.ebullets.push(b);
      }
    }

    // ---------------------------------------------------------------- eigene Waffen
    addBullet(x, y, z, tx, ty, tz, dmg, color, spread, rocket) {
      const d = Math.hypot(tx - x, ty - y, tz - z) || 1, sp = spread || 0, v = rocket ? 60 : 95;
      const mesh = this.fx.shot(rocket ? 0xffffff : color, rocket ? 0.2 : 0.12, rocket ? 1.3 : 1.8);
      this.bullets.push({ x, y, z, vx: (tx - x) / d * v + FL.rand(-sp, sp), vy: (ty - y) / d * v + FL.rand(-sp, sp) * 0.3, vz: (tz - z) / d * v + FL.rand(-sp, sp), dmg, life: 0.95, rocket, mesh });
    }
    nearestFoe(x, z, range) {
      let best = null, bd = range;
      for (const e of this.enemies) if (!e.dead) { const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = e; } }
      return best;
    }
    nearestStructure(x, z, range) {
      let best = null, bd = range;
      for (const s of this.structures) if (s.alive && s.key) { const d = Math.hypot(s.x - x, s.z - z) - s.r; if (d < bd) { bd = d; best = s; } }
      return best;
    }
    strongest(n) { const h = this.hero; return this.alive().filter(e => Math.hypot(e.x - h.x, e.z - h.z) < 95).sort((a, b) => b.hp - a.hp).slice(0, n || 99); }
    // Granaten, Raketen und Bomben im Bogen. y ist die Höhe über dem Meer (nicht über dem Boden). tg = Gegner, Gebäude oder null (dann ein Stück voraus)
    lob(x, y, z, tg, dmg, radius, kind, delay, dur) {
      let tx, tz;
      if (tg) { tx = tg.x; tz = tg.z; }
      else { const a = this.hero.th + FL.rand(-0.5, 0.5), d = FL.rand(24, 42); tx = this.hero.x + Math.sin(a) * d; tz = this.hero.z + Math.cos(a) * d; }
      const mesh = kind === 'rocket' ? FL.rocketModel() : kind === 'bomb' ? FL.bombModel() : FL.shellModel(0.17);
      mesh.visible = false; this.stage.add(mesh);
      this.shells.push({ kind, sx: x, sy: y, sz: z, tx, tz, t: -(delay || 0), dur: dur || 0.9, target: tg || null, dmg, radius, mesh });
    }
    // Ziel für schwere Waffen: erst Gegner in der Nähe, vor der Basis auch deren Gebäude
    heavyTarget(x, z, range) { return this.nearestFoe(x, z, range) || (this.baseActive() ? this.nearestStructure(x, z, range + 15) : null); }
    // Die Geschützwagen drehen sich erst zum Ziel und feuern dann
    fireTowers() {
      const lvl = this.lo.towers;
      if (!this.towersOn || !lvl || this.towerCd > 0 || this.endT >= 0) return;
      const guns = this.spgs.filter(v => !v.down);
      if (!guns.length) { FL.hud.msg('Die Geschützwagen müssen erst repariert werden', C.muted, true); return; }
      const tw = FL.TOWER_LEVELS[lvl - 1], tg = this.strongest();
      const st = this.baseActive() ? this.structures.filter(s => s.alive && s.key) : [];
      this.towerCd = tw.reload;
      guns.forEach((v, ti) => {
        const list = [];
        for (let k = 0; k < tw.n; k++) { const i = ti * tw.n + k; list.push(tg.length ? tg[i % tg.length] : st.length ? st[i % st.length] : null); }
        v.salvo = { list, t: 0, tw };
      });
    }
    useSpecial(i) {
      const sp = FL.SPECIALS[i], lvl = this.lo[sp.id], h = this.hero, hy = this.gy(h.x, h.z);
      if (!lvl) { FL.hud.msg(sp.name + ' hast du noch nicht gekauft', C.muted, true); return; }
      if (this.specialCd[i] > 0 || this.endT >= 0) return;
      this.specialCd[i] = sp.reload * (lvl > 1 ? 0.7 : 1);
      FL.audio.play('up');
      if (i === 0) {
        for (let k = 0; k < 5; k++) { const mesh = FL.droneModel(); mesh.visible = false; this.stage.add(mesh); this.aircraft.push({ kind: 'drone', x: h.x + (k - 2) * 1.2, y: hy + 3, z: h.z, t: -k * 0.15, life: 10, target: null, mesh }); }
        FL.hud.msg('Drohnen gestartet!', C.cyan, true);
      } else if (i === 1) {
        const mesh = FL.heliModel(); this.stage.add(mesh);
        this.aircraft.push({ kind: 'heli', a: h.th + Math.PI, y: hy + 12, t: 0, life: 12, fire: 0, mesh, x: h.x, z: h.z });
        FL.hud.msg('Kampfhubschrauber gibt dir Deckung!', C.cyan, true);
      } else if (i === 3) {
        this.barrage = { n: 10, cd: 0.9 }; FL.audio.play('cannon'); FL.hud.msg('Artillerie feuert!', C.orange);
      } else {
        const mesh = FL.jetModel(0x6a7682, 0x3a4450); this.stage.add(mesh);
        this.aircraft.push({ kind: 'bomber', a: h.th, ox: h.x, oz: h.z, d: -70, y: hy + 19, t: 0, life: 5.2, drop: 0, mesh, x: h.x, z: h.z });
        FL.audio.play('jet'); FL.hud.msg('Kampfbomber in Blickrichtung!', C.orange);
      }
    }
    onKey(code) {
      if (code === 'KeyT') { this.towersOn = !this.towersOn; FL.save.towersOn = this.towersOn; FL.store(); FL.hud.msg('Geschütze ' + (this.towersOn ? 'AN' : 'AUS'), C.text, true); for (const v of this.spgs) v.mesh.visible = this.towersOn; }
      else if (code === 'KeyX') this.fireTowers();
      else if (code === 'Digit1' || code === 'Numpad1') this.useSpecial(0);
      else if (code === 'Digit2' || code === 'Numpad2') this.useSpecial(1);
      else if (code === 'Digit3' || code === 'Numpad3') this.useSpecial(2);
      else if (code === 'Digit4' || code === 'Numpad4') this.useSpecial(3);
      else if (code === 'Digit5' || code === 'Numpad5') this.callReinf();
      else if (code === 'Digit6' || code === 'Numpad6') this.callJets();
      else if (code === 'KeyR') this.toggleSplit();
      else if (code === 'KeyC') { this.dest = null; this.via = null; }
      else if (code === 'KeyQ') {
        if (this.own.length < 2) { FL.hud.msg('Du hast noch keinen Trupp: Kameraden gibt es im Laden', C.muted, true); return; }
        this.order = ORDERS[(ORDERS.indexOf(this.order) + 1) % ORDERS.length];
        for (const m of this.own) { m.hx = m.x; m.hz = m.z; m.think = 0; }
        FL.audio.play('click');
        FL.hud.msg('Befehl: Der Trupp ' + ORDER_NAME[this.order], C.cyan, true);
      }
    }

    // Hindernisse schieben Figuren und Fahrzeuge zur Seite: Bäume, Felsen, Sandsäcke, Gebäude, Zäune. crush = Fahrzeug, das Zäune einfach umfährt.
    pushOut(o, rad, crush) {
      for (const s of this.solid) {
        if (!s.alive) continue;
        const dx = o.x - s.x, dz = o.z - s.z;
        if (s.flat) {
          const px = s.hx + rad - Math.abs(dx), pz = s.hz + rad - Math.abs(dz);
          if (px > 0 && pz > 0) {
            if (crush && s.fence) { this.damageStructure(s, 99); continue; }
            if (pz < px) o.z = s.z + (dz < 0 ? -1 : 1) * (s.hz + rad); else o.x = s.x + (dx < 0 ? -1 : 1) * (s.hx + rad);
          }
        } else {
          const d = Math.hypot(dx, dz), min = (s.key !== undefined ? s.r * 0.8 : s.r) + rad;
          if (d < min && d > 0.01) { o.x = s.x + dx / d * min; o.z = s.z + dz / d * min; }
        }
      }
      o.x = FL.clamp(o.x, -EDGE - 30, EDGE + 30);
    }
    // Ausweichen: Hängt eine Figur an einem Hindernis, läuft sie ein Stück seitlich daran vorbei, und zwar auf der Seite, auf der das Ziel liegt.
    // Gibt die Laufrichtung zurück. (dx, dz) zeigt zum Ziel, d ist die Entfernung dorthin.
    dodge(m, dx, dz, d, stuck, dt) {
      const q = m.av;
      q.t -= dt; q.keep -= dt;
      if (stuck && q.t <= 0) {
        if (q.keep <= 0) {
          let best = null, bd = 6;
          for (const s of this.solid) if (s.alive) { const e = Math.hypot(s.x - m.x, s.z - m.z) - (s.flat ? 0 : s.r); if (e < bd) { bd = e; best = s; } }
          q.side = best && dz * (best.x - m.x) - dx * (best.z - m.z) > 0 ? -1 : 1;
        }
        q.t = 0.7; q.keep = 3; q.n++;
      }
      if (q.t <= 0) return [dx / d, dz / d];
      const a = Math.atan2(dx, dz) + q.side * 1.25;
      return [Math.sin(a), Math.cos(a)];
    }
    // Platz einer Einheit in der lockeren Formation. Sie richtet sich nach dem Ziel aus, nicht nach dem Blick des Kommandanten.
    slotPos(m) {
      if (m.grp) {
        // abgeteilte Gruppe (Flanke oder Verstärkung): Sie hat ihren eigenen Sammelpunkt
        if (m.grp === 1 && this.order === 'hold') return [m.hx, m.hz];
        const g = this.groups[m.grp], s = Math.sin(g.th), c = Math.cos(g.th), q = m.gslot;
        return [g.x + c * q[0] - s * q[1], g.z - s * q[0] - c * q[1]];
      }
      if (this.order === 'hold') return [m.hx, m.hz];
      const h = this.hero, o = this.objective(), s = Math.sin(this.front), c = Math.cos(this.front);
      let ax = h.x, az = h.z;
      if (this.order === 'storm') {
        // vorstürmen: ein gutes Stück vor den Kommandanten, aber nicht mitten ins Ziel hinein
        const reach = Math.hypot(o.x - h.x, o.z - h.z) - (o.base ? 40 : 10), adv = FL.clamp(reach, 0, isVeh(m) ? 20 : 26);
        ax += s * adv; az += c * adv;
      }
      return [ax + c * m.slot[0] - s * m.slot[1], az - s * m.slot[0] - c * m.slot[1]];
    }

    // ---------------------------------------------------------------- Trupp teilen: Die Hälfte greift von der Seite an
    // Weg einer abgeteilten Gruppe: erst seitlich am Ziel vorbei, dann von der Flanke hinein. In die Basis geht es durch das Seitentor.
    flankRoute(o, side, direct) {
      if (o.base) {
        const z = this.baseZ + 32, r = [{ x: side * (BASE_W + 15), z }, { x: side * (BASE_W - 15), z }];
        if (!direct) r.unshift({ x: side * (BASE_W + 17), z: this.baseZ - 12 });
        return r;
      }
      const f = o.ang + Math.PI, px = Math.cos(f) * side, pz = -Math.sin(f) * side, cl = v => FL.clamp(v, -EDGE - 12, EDGE + 12);
      const r = [{ x: cl(o.x + px * 13), z: o.z + pz * 13 }];
      if (!direct) r.unshift({ x: cl(o.x + px * 38 + Math.sin(o.ang) * 8), z: o.z + pz * 38 + Math.cos(o.ang) * 8 });
      return r;
    }
    toggleSplit() {
      const units = [...this.allies, ...this.vehicles].filter(m => m.grp < 2);
      if (units.length < 1) { FL.hud.msg('Zum Teilen brauchst du einen Trupp: Kameraden gibt es im Laden', C.muted, true); return; }
      this.split = this.split === 0 ? 1 : this.split === 1 ? -1 : 0;
      for (const m of units) { m.grp = 0; m.think = 0; m.via = null; }
      FL.audio.play('click');
      if (!this.split) { this.groups[1] = null; FL.hud.msg('Der Trupp sammelt sich wieder bei dir', C.cyan, true); return; }
      const mem = [...units.filter(m => !isVeh(m)).filter((m, i) => i % 2 === 1), ...units.filter(isVeh).filter((m, i) => i % 2 === 1)];
      if (!mem.length) mem.push(units[units.length - 1]);
      this.groups[1] = this.makeGroup(1, this.split, mem);
      FL.hud.msg(SPLIT_NAME[this.split] + ': Die Hälfte deines Trupps greift von der Seite an', C.cyan, true);
    }
    makeGroup(grp, side, mem, x, z) {
      let si = 0, vi = 0, cx = 0, cz = 0;
      for (const m of mem) { m.grp = grp; m.gslot = isVeh(m) ? GROUP_VEH[vi++ % GROUP_VEH.length] : GROUP_SLOT[si++ % GROUP_SLOT.length]; m.think = 0; cx += m.x; cz += m.z; }
      return { grp, side, units: mem, x: x === undefined ? cx / mem.length : x, z: z === undefined ? cz / mem.length : z, th: this.front, obj: null, route: [], i: 0 };
    }
    updateGroups(dt, active) {
      const o = this.objective();
      for (const g of this.groups) {
        if (!g) continue;
        const up = g.units.filter(m => !m.down);
        if (g.obj !== o) { g.route = this.flankRoute(o, g.side, g.obj === null && g.grp === 2); g.obj = o; g.i = 0; g.there = false; }
        g.th = wrap(g.th + FL.clamp(wrap(Math.atan2(o.x - g.x, o.z - g.z) - g.th), -1.5 * dt, 1.5 * dt));
        if (!active || !up.length || (g.grp === 1 && this.order === 'hold')) continue;
        const wp = g.route[g.i], dx = wp.x - g.x, dz = wp.z - g.z, d = Math.hypot(dx, dz);
        if (d < 3) { if (g.i < g.route.length - 1) g.i++; else g.there = true; continue; }
        // Der Sammelpunkt wartet, wenn die Gruppe zurückhängt oder Gegner direkt vor ihr stehen
        const foot = up.filter(m => !isVeh(m)), cnt = foot.length ? foot : up;
        const lag = cnt.reduce((a, m) => a + Math.hypot(m.x - g.x, m.z - g.z), 0) / cnt.length;
        if (lag > 14 || this.nearestFoe(g.x, g.z, 15)) continue;
        const v = Math.min(5.2 * dt, d);
        g.x += dx / d * v; g.z += dz / d * v;
      }
    }

    // ---------------------------------------------------------------- Bodenverstärkung: einmal pro Einsatz, kommt aus einer anderen Richtung
    callReinf() {
      const lvl = this.lo.reinf, o = this.objective(), h = this.hero;
      if (!lvl) { FL.hud.msg('Bodenverstärkung hast du noch nicht gekauft', C.muted, true); return; }
      if (this.reinfUsed) { FL.hud.msg('Die Verstärkung ist schon im Einsatz', C.muted, true); return; }
      if (this.endT >= 0) return;
      this.reinfUsed = true;
      const side = this.split ? -this.split : (h.x > o.x ? -1 : 1), first = this.flankRoute(o, side, true)[0];
      // Startpunkt weit draußen in der Richtung, aus der die Flanke kommt
      const ox = first.x - o.x, oz = first.z - o.z, od = Math.hypot(ox, oz) || 1;
      const sx = FL.clamp(first.x + ox / od * 62, -EDGE - 26, EDGE + 26), sz = first.z + oz / od * 62;
      const mem = [], lo = this.lo, w = Math.max(1, lo.weapon - 1);
      for (let i = 0; i < (lvl > 1 ? 6 : 4); i++) mem.push(this.mkUnit('ally', ALLY_SLOT[i], 3, FL.soldier({ team: 'ally', weapon: w }), sx + FL.rand(-5, 5), sz + FL.rand(-5, 5)));
      mem.push(this.mkUnit('tank', [0, 0], 25, FL.tankModel(FL.PAL.ally), sx + side * 6, sz + 8));
      if (lvl > 1) {
        mem.push(this.mkUnit('werfer', [0, 0], 20, FL.werferModel(FL.PAL.ally), sx + side * 9, sz - 8));
        mem.push(this.mkUnit('gun', [0, 0], 22, FL.spgModel(FL.PAL.ally, Math.max(2, lo.towers)), sx + side * 13, sz));
      }
      for (const m of mem) { if (isVeh(m)) this.vehicles.push(m); else this.allies.push(m); this.own.push(m); m.th = Math.atan2(o.x - m.x, o.z - m.z); }
      this.groups[2] = this.makeGroup(2, side, mem, sx, sz);
      this.groups[2].th = Math.atan2(o.x - sx, o.z - sz);
      FL.audio.play('up');
      FL.hud.msg('Verstärkung rückt von ' + (side > 0 ? 'links' : 'rechts') + ' an!', C.green);
    }

    // ---------------------------------------------------------------- Steuerung des Kommandanten
    // Tipp (oder Mausklick) auf den Boden: Dorthin läuft er, bis man woanders hintippt.
    tap(cx, cy) {
      if (this.result || this.endT >= 0 || (FL.app && (FL.app.paused || FL.app.done))) return;
      const cam = this.stage.camera, ray = this.ray || (this.ray = new THREE.Raycaster());
      cam.updateMatrixWorld();
      ray.setFromCamera(new THREE.Vector2(cx / window.innerWidth * 2 - 1, 1 - cy / window.innerHeight * 2), cam);
      ray.far = 170;
      const hit = ray.intersectObject(this.terrain, false)[0];
      if (!hit) return;
      // sehr weit entfernte Punkte (Tipp nahe am Horizont) auf eine vernünftige Strecke kürzen
      const h = this.hero, dx = hit.point.x - h.x, dz = hit.point.z - h.z, d = Math.hypot(dx, dz), k = Math.min(1, 90 / (d || 1));
      this.goTo(h.x + dx * k, h.z + dz * k);
    }
    goTo(x, z) {
      x = FL.clamp(x, -EDGE, EDGE); z = FL.clamp(z, -34, this.zMax);
      // Liegt eine Deckung am Ziel, stellt er sich gleich auf die sichere Seite
      let best = null, bd = 3.2;
      for (const c of this.covers) { if (c.hill) continue; const d = Math.hypot(c.x - x, c.z - z) - c.r * 0.5; if (d < bd) { bd = d; best = c; } }
      if (best) {
        const e = this.nearestFoe(best.x, best.z, 70) || this.objective(), dx = best.x - e.x, dz = best.z - e.z, d = Math.hypot(dx, dz) || 1;
        x = best.x + dx / d * 1.5; z = best.z + dz / d * 1.5;
      }
      const p = { x, z };
      this.pushOut(p, 0.6);
      this.dest = p; this.via = null; this.viaHold = 0; this.stuckT = 0; this.manualAim = false; this.hero.av.n = 0;
      FL.audio.play('click');
    }
    control(dt, active) {
      const h = this.hero, x0 = h.x, z0 = h.z;
      // Steuerknüppel und Pfeiltasten drehen nur den Körper und damit die Waffe. Gelaufen wird zum angetippten Punkt.
      const turn = active ? FL.clamp((FL.down('ArrowLeft') ? 1 : 0) - (FL.down('ArrowRight') ? 1 : 0) - FL.stick.x, -1, 1) : 0;
      const sw = active ? FL.touch.swipe : 0; FL.touch.swipe = 0;
      if (turn || sw) this.manualAim = true;
      h.th = wrap(h.th + turn * 2.3 * dt - sw * 0.0052);
      let fwd = 0, side = 0, mvx = 0, mvz = 0;
      if (active) {
        fwd = (FL.down('ArrowUp', 'KeyW') ? 1 : 0) - (FL.down('ArrowDown', 'KeyS') ? 1 : 0);
        side = (FL.down('KeyD') ? 1 : 0) - (FL.down('KeyA') ? 1 : 0);
        if (FL.down('KeyC')) { this.dest = null; fwd = side = 0; }                 // anhalten und in Stellung gehen
      }
      this.viaHold -= dt;
      if (fwd || side) {
        // am Rechner geht auch Laufen mit den Tasten
        this.dest = null;
        const s = Math.sin(h.th), c = Math.cos(h.th), v = fwd > 0 ? 6.2 : 4 * fwd;
        mvx = s * v - c * side * 4.4; mvz = c * v + s * side * 4.4;
      } else if (active && this.dest) {
        // Liegt ein Zaun dazwischen, geht es erst durch das nächste Tor
        if (!this.via && this.viaHold <= 0) { const g = this.gapFor(h.x, h.z, this.dest.x, this.dest.z); if (g) this.via = { x: g[0], z: g[1] }; }
        const tg = this.via || this.dest, dx = tg.x - h.x, dz = tg.z - h.z, d = Math.hypot(dx, dz);
        if (this.via && d < 1.2) { this.via = null; this.viaHold = 1.6; }
        else if (!this.via && d < 0.3) this.dest = null;
        else {
          // nach vorn am schnellsten, seitwärts und rückwärts etwas langsamer
          const rel = Math.abs(wrap(Math.atan2(dx, dz) - h.th)), v = Math.min(d / dt, 6.4 - 1.5 * smooth(0.9, 2.4, rel));
          const [ux, uz] = this.dodge(h, dx, dz, d, this.stuckT > 0.12, dt);           // hängt er an einem Hindernis, läuft er seitlich daran vorbei
          mvx = ux * v; mvz = uz * v;
        }
      }
      h.x += mvx * dt; h.z += mvz * dt;
      this.pushOut(h, 0.55);
      for (const m of this.vehicles) { const dx = h.x - m.x, dz = h.z - m.z, d = Math.hypot(dx, dz); if (d < 3 && d > 0.01) { h.x = m.x + dx / d * 3; h.z = m.z + dz / d * 3; } }
      const cx = FL.clamp(h.x, -EDGE, EDGE), cz = FL.clamp(h.z, -34, this.zMax);
      if (cx !== h.x || cz !== h.z) {
        h.x = cx; h.z = cz; this.warnT -= dt; this.dest = null;
        if (this.warnT <= 0) { this.warnT = 3; FL.hud.msg('Hier endet das Einsatzgebiet', C.text, true); }
      }
      h.vx = dt > 0 ? (h.x - x0) / dt : 0; h.vz = dt > 0 ? (h.z - z0) / dt : 0;
      const sp = Math.hypot(h.vx, h.vz);
      h.moving = sp > 0.5;
      if (this.dest && (mvx || mvz) && sp < 1.5) { this.stuckT += dt; if (this.stuckT > 1.6 || h.av.n > 7) { this.dest = null; this.via = null; } } else this.stuckT = 0;
      // Wer stehen bleibt, geht von selbst in Stellung (und hinter einer Deckung in Deckung)
      this.still = h.moving ? 0 : this.still + dt;
      this.ducking = active && this.still > 0.12;
      this.lastShot += dt;
      h.hp = Math.min(h.max, h.hp + (this.ducking && this.lastShot > 1.5 ? 1.2 : this.ducking ? 0.35 : 0.12) * dt);

      // zielen: Die Waffe rastet auf das Ziel ein, das am nächsten an der Blickrichtung liegt. Gebäude der Basis zählen auch.
      let lock = null, best = 1e9;
      const consider = (e, r, d, pen) => {
        if (d > 58 || d < 0.5) return;
        const rel = Math.abs(wrap(Math.atan2(e.x - h.x, e.z - h.z) - h.th));
        if (rel > (e === this.lock ? 0.7 : 0.48) + Math.atan2(r, d)) return;
        const sc = rel * 50 + d * 0.3 + pen - (e === this.lock ? 8 : 0);
        if (sc < best) { best = sc; lock = e; }
      };
      for (const e of this.enemies) if (!e.dead) consider(e, e.r, Math.hypot(e.x - h.x, e.z - h.z), 0);
      if (this.baseActive()) for (const s of this.structures) if (s.alive && s.key) consider(s, s.r * 0.6, Math.max(1, Math.hypot(s.x - h.x, s.z - h.z) - s.r * 0.6), 14);
      this.lock = lock;
      // Lässt man den Steuerknüppel los, dreht sich der Kommandant von selbst genau auf das Ziel.
      // Ohne Ziel schaut er beim Laufen nach vorn, solange man nicht selbst gedreht hat.
      if (active && !turn && !sw) {
        let want = null, rate = 2.6;
        if (lock) want = Math.atan2(lock.x - h.x, lock.z - h.z);
        else if (h.moving && !this.manualAim && (mvx || mvz)) { want = Math.atan2(mvx, mvz); rate = 3.2; }
        if (want !== null) h.th = wrap(h.th + FL.clamp(wrap(want - h.th), -rate * dt, rate * dt));
      }
      const s = Math.sin(h.th), c = Math.cos(h.th), hy = this.gy(h.x, h.z), gunY = hy + (this.ducking ? 1.0 : 1.3);
      this.place(h.mesh, h.x, h.z, h.th);
      h.mesh.visible = this.invuln <= 0 || Math.floor(this.t * 12) % 2 === 0;
      FL.animSoldier(h.mesh, this.t, h.moving, this.ducking, true);          // geduckt rennen

      let tx = h.x + s * 70, tz = h.z + c * 70, ty;
      if (lock) {
        tx = lock.x; tz = lock.z; ty = lock.key !== undefined ? lock.y + Math.min(2.2, lock.h * 0.5) : lock.y + (lock.vehicle ? 1.4 : 1.1);
        const q = FL.clamp(Math.hypot(tx - h.x, tz - h.z) * 0.06, 1.5, 4); this.aim.position.set(tx, ty + 0.1, tz); this.aim.scale.set(q, q, 1); this.aim.material.opacity = 1;
      } else {
        ty = this.gy(tx, tz) + 1.3;
        this.aim.position.set(h.x + s * 26, this.gy(h.x + s * 26, h.z + c * 26) + 1.3, h.z + c * 26); this.aim.scale.set(1.8, 1.8, 1); this.aim.material.opacity = 0.4;
      }
      this.aim.visible = active;
      this.marker.visible = !!this.dest && active;
      if (this.dest) { const q = 1 + Math.sin(this.t * 7) * 0.12; this.marker.position.set(this.dest.x, this.gy(this.dest.x, this.dest.z) + 0.15, this.dest.z); this.marker.scale.set(q, q, 1); }

      const w = FL.WEAPONS[this.lo.weapon];
      if (active && FL.down('Space') && this.fireCd <= 0) {
        this.fireCd = w.rate; this.shotCount++; this.lastShot = 0;
        for (let k = 0; k < w.shots; k++) {
          const off = (k - (w.shots - 1) / 2) * 0.3;
          this.addBullet(h.x + s * 0.9 - c * off, gunY, h.z + c * 0.9 + s * off, tx, ty, tz, w.dmg, w.color, w.spread * 4);
        }
        if (w.rocket && this.shotCount % w.rocket === 0) this.addBullet(h.x + s * 0.9, gunY, h.z + c * 0.9, tx, ty, tz, 4, 0xff9628, 0, true);
        this.muzzle.position.set(h.x + s * 1.15, gunY, h.z + c * 1.15); this.muzzle.material.color.set(w.color); this.muzzle.visible = true; this.muzzleT = 0.05;
        FL.audio.play(this.lo.weapon === 4 || this.lo.weapon === 5 ? 'laser' : 'shot');
      }
      if (this.muzzleT <= 0) this.muzzle.visible = false;
    }

    // ---------------------------------------------------------------- Kameraden: lose folgen, Deckung suchen, abwechselnd vorrücken
    updateAllies(dt, active) {
      const h = this.hero, aw = FL.WEAPONS[Math.max(0, this.lo.weapon - 1)];
      this.allies.forEach((a, i) => {
        if (a.down) { a.vx = a.vz = 0; return; }
        a.think -= dt; a.push -= dt; a.viaHold -= dt;
        if (a.think <= 0) {
          a.think = FL.rand(0.35, 0.6);
          a.threat = this.nearestFoe(a.x, a.z, 46);
          const [sx, sz] = this.slotPos(a);
          if (a.cover) { a.cover.by = null; a.cover = null; }
          a.gx = sx; a.gz = sz;
          const danger = a.threat || (this.baseActive() ? this.nearestStructure(a.x, a.z, 55) : null);
          if (danger && a.push > 0) {
            // Ein Hügel versperrt das Schussfeld: ein Stück auf den Gegner zu, bis die Sicht frei ist
            const dx = danger.x - a.x, dz = danger.z - a.z, d = Math.hypot(dx, dz) || 1;
            a.gx = a.x + dx / d * 8; a.gz = a.z + dz / d * 8;
          } else if (danger) {
            // die nächste freie Deckung in der Nähe des eigenen Platzes nehmen und sich dahinter stellen (bei einem Hügel knapp hinter die Kuppe)
            let best = null, bd = this.order === 'hold' && a.grp < 2 ? 7 : 13;
            for (const c of this.covers) { if (c.by) continue; const d = Math.hypot(c.x - sx, c.z - sz); if (d < bd) { bd = d; best = c; } }
            if (best) {
              const dx = best.x - danger.x, dz = best.z - danger.z, d = Math.hypot(dx, dz) || 1, off = best.hill ? best.r + 1 : 1.5;
              best.by = a; a.cover = best; a.gx = best.x + dx / d * off; a.gz = best.z + dz / d * off;
            }
          }
          // Zaun im Weg: durch das nächste Tor
          if (!a.via && a.viaHold <= 0) a.via = this.gapFor(a.x, a.z, a.gx, a.gz);
        }
        const x0 = a.x, z0 = a.z, lead = a.grp ? this.groups[a.grp] : h;
        const goalD = Math.hypot(a.gx - a.x, a.gz - a.z);
        let dx = a.gx - a.x, dz = a.gz - a.z, d = goalD;
        if (a.via) {
          dx = a.via[0] - a.x; dz = a.via[1] - a.z; d = Math.hypot(dx, dz);
          if (d < 1.4) { a.via = null; a.viaHold = 1.6; dx = a.gx - a.x; dz = a.gz - a.z; d = goalD; }
        }
        const far = Math.hypot(lead.x - a.x, lead.z - a.z);
        // Bei Feindkontakt rückt immer nur die Hälfte vor, die andere gibt Feuerschutz
        const wait = a.threat && goalD < 16 && goalD > 1 && (i + Math.floor(this.t / 2.4)) % 2 === 0;
        a.moving = active && d > (a.moving ? 0.4 : 1.6) && !wait;
        if (a.moving) {
          const v = Math.min(d / dt, far > 40 ? 8.5 : goalD > 9 ? 7 : a.threat ? 4.8 : 5.6);
          const [ux, uz] = this.dodge(a, dx, dz, d, a.stuck > 0.25, dt);
          a.x += ux * v * dt; a.z += uz * v * dt;
          for (const o of this.own) if (o !== a && !isVeh(o)) { const ex = a.x - o.x, ez = a.z - o.z, e = Math.hypot(ex, ez); if (e < 1.1 && e > 0.01) { a.x += ex / e * (1.1 - e) * 0.5; a.z += ez / e * (1.1 - e) * 0.5; } }
          this.pushOut(a, 0.5);
        }
        a.vx = (a.x - x0) / dt; a.vz = (a.z - z0) / dt;
        a.stuck = a.moving && Math.hypot(a.vx, a.vz) < 0.9 ? a.stuck + dt : 0;
        if (a.stuck > 2.5) { a.stuck = 0; a.via = null; a.think = 0; }
        // schießen: auf Gegner in Reichweite, sonst vor der Basis auf das nächste Gebäude
        let tg = a.threat && !a.threat.dead && Math.hypot(a.threat.x - a.x, a.threat.z - a.z) < 44 ? a.threat : null, st = null;
        if (!tg && this.baseActive()) st = this.nearestStructure(a.x, a.z, 48);
        a.crouch = !a.moving && !!(tg || st);
        const look = tg || st;
        const want = look && !a.moving ? Math.atan2(look.x - a.x, look.z - a.z) : a.moving ? Math.atan2(dx, dz) : (a.grp ? lead.th : this.front);
        a.th = wrap(a.th + FL.clamp(wrap(want - a.th), -7 * dt, 7 * dt));
        a.fireCd -= dt;
        if (active && look && a.fireCd <= 0 && (!a.moving || goalD < 4)) {
          a.fireCd = aw.rate * 1.4 * FL.rand(0.9, 1.15);
          const s = Math.sin(a.th), c = Math.cos(a.th), ay = this.gy(a.x, a.z) + (a.crouch ? 1.0 : 1.3);
          const tx = tg ? tg.x : st.x + FL.rand(-0.6, 0.6) * st.r, ty = tg ? tg.y + (tg.vehicle ? 1.4 : 1.1) : st.y + FL.rand(1, Math.min(4, st.h)), tz = tg ? tg.z : st.z;
          if (this.losK(a.x, ay, a.z, tx, ty, tz) < 1) {
            // kein freies Schussfeld: nach ein paar Versuchen die Stellung wechseln
            if (++a.blocked >= 3) { a.blocked = 0; a.push = 4; a.think = 0; }
          } else {
            a.blocked = 0;
            for (let k = 0; k < aw.shots; k++) this.addBullet(a.x + s * 0.8, ay, a.z + c * 0.8, tx, ty, tz, aw.dmg, aw.color, 3.5);
          }
        }
        this.place(a.mesh, a.x, a.z, a.th);
        FL.animSoldier(a.mesh, this.t + i, a.moving, a.crouch, !!a.threat);
      });
    }

    // ---------------------------------------------------------------- Fahrzeuge: fahren hinterher, halten Abstand, bleiben zum Schießen stehen
    // Vor jedem Schuss dreht sich das Fahrzeug wirklich zum Ziel. Beim Panzer zielt zusätzlich der Turm.
    updateVehicles(dt, active) {
      const h = this.hero, ok = q => q && !q.dead && q.alive !== false;
      for (const v of this.vehicles) {
        const vy = this.gy(v.x, v.z);
        if (v.down) { v.vx = v.vz = 0; if (Math.random() < dt * 4) this.fx.smoke(v.x, vy + 2, v.z, 1.6); continue; }
        v.think -= dt;
        if (v.think <= 0) {
          v.think = 0.5;
          [v.gx, v.gz] = this.slotPos(v);
          v.threat = v.kind === 'spg' ? null : this.heavyTarget(v.x, v.z, v.kind === 'tank' ? 58 : 80);
        }
        const x0 = v.x, z0 = v.z, tg = ok(v.threat) ? v.threat : null, lead = v.grp ? this.groups[v.grp] : h;
        const aimAt = v.salvo ? v.salvo.list.find(ok) || null : tg;
        const dx = v.gx - v.x, dz = v.gz - v.z, d = Math.hypot(dx, dz);
        const engaged = tg && Math.hypot(tg.x - v.x, tg.z - v.z) < (v.kind === 'tank' ? 44 : 70);
        // Wer kämpft, bleibt stehen. Eine abgeteilte Gruppe fährt aber erst an ihren Platz in der Flanke, außer der Gegner steht schon dicht davor.
        const halt = engaged && d < 30 && (!v.grp || lead.there || Math.hypot(tg.x - v.x, tg.z - v.z) < 24);
        v.moving = active && !v.salvo && d > (v.moving ? 2 : 6) && !halt && (v.grp > 0 || Math.hypot(h.x - v.x, h.z - v.z) > 5);
        if (v.moving) {
          const want = Math.atan2(dx, dz), diff = wrap(want - v.th);
          v.th = wrap(v.th + FL.clamp(diff, -1.3 * dt, 1.3 * dt));
          const sp = (v.kind === 'tank' ? 6.4 : 5.8) * (Math.abs(diff) < 0.5 ? 1 : Math.abs(diff) < 1.2 ? 0.45 : 0.1) * (d > 30 ? 1.35 : 1);
          v.x += Math.sin(v.th) * sp * dt; v.z += Math.cos(v.th) * sp * dt;
          this.pushOut(v, 2.3, true);                                  // Zäune fährt es einfach um
          for (const o of this.vehicles) if (o !== v) { const ex = v.x - o.x, ez = v.z - o.z, e = Math.hypot(ex, ez); if (e < 6 && e > 0.01) { v.x = o.x + ex / e * 6; v.z = o.z + ez / e * 6; } }
          if (Math.random() < dt * 5) this.fx.dust(v.x - Math.sin(v.th) * 2.4, vy + 0.2, v.z - Math.cos(v.th) * 2.4, 1.2);
        } else if (aimAt && active) {
          const diff = wrap(Math.atan2(aimAt.x - v.x, aimAt.z - v.z) - v.th);
          if (Math.abs(diff) > 0.02) v.th = wrap(v.th + FL.clamp(diff, -1.2 * dt, 1.2 * dt));
        }
        v.vx = (v.x - x0) / dt; v.vz = (v.z - z0) / dt;
        const rel = aimAt ? wrap(Math.atan2(aimAt.x - v.x, aimAt.z - v.z) - v.th) : 0, lined = Math.abs(rel) < 0.1;
        v.fireCd -= dt;
        if (v.kind === 'tank') {
          v.tur += FL.clamp(wrap(rel - v.tur), -2.2 * dt, 2.2 * dt);
          FL.setTurret(v.mesh, v.tur, 0);
          if (active && tg && v.fireCd <= 0 && Math.abs(wrap(rel - v.tur)) < 0.08) { v.fireCd = 1.8; FL.audio.play('cannon'); this.lob(v.x, vy + 2, v.z, tg, 8, 3.4, 'shell', 0, 0.6); this.fx.spark(v.x + Math.sin(v.th + v.tur) * 3, vy + 2.2, v.z + Math.cos(v.th + v.tur) * 3, 2.5); }
        } else if (v.kind === 'werfer') {
          if (active && tg && !v.moving && lined && v.fireCd <= 0) {
            v.fireCd = 4.5;
            const s = this.strongest(4).filter(e => Math.hypot(e.x - v.x, e.z - v.z) < 85 && Math.abs(wrap(Math.atan2(e.x - v.x, e.z - v.z) - v.th)) < 0.5);
            for (let k = 0; k < 4; k++) this.lob(v.x, vy + 2.6, v.z, s.length ? s[k % s.length] : tg, 6, 3.6, 'rocket', k * 0.15);
          }
        } else if (v.kind === 'gun') {
          // Geschützwagen der Verstärkung feuert von selbst
          if (active && tg && !v.moving && lined && v.fireCd <= 0) { v.fireCd = 3; FL.audio.play('cannon'); this.lob(v.x, vy + 3.2, v.z, tg, 7, 3.4, 'shell', 0, 1.0); this.fx.spark(v.x + Math.sin(v.th) * 3, vy + 3.4, v.z + Math.cos(v.th) * 3, 3); }
        } else if (v.salvo && active) {
          // Geschützwagen aus dem Laden: Salve auf Knopfdruck, sobald das Rohr zum Ziel zeigt
          const q = v.salvo; q.t += dt;
          if (!aimAt || lined || q.t > 3) {
            const tw = q.tw;
            this.shake = 0.15; FL.audio.play('cannon');
            q.list.forEach((t, k) => this.lob(v.x, vy + 3.2, v.z, ok(t) ? t : aimAt, tw.dmg, tw.radius, tw.kind, k * 0.12, 1.1));
            this.fx.spark(v.x + Math.sin(v.th) * 3, vy + 3.4, v.z + Math.cos(v.th) * 3, 3);
            v.salvo = null;
          }
        }
        this.place(v.mesh, v.x, v.z, v.th, true);
      }
    }

    // ---------------------------------------------------------------- Gegner: Besatzung hält ihre Stellung, Verstärkung rückt an
    updateEnemies(dt, active) {
      const rate = 1.2 + 0.12 * this.tier, h = this.hero;
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.age += dt; e.think -= dt;
        if (e.think <= 0) { e.think = FL.rand(0.4, 0.7); e.tg = this.pickOwn(e.x, e.z, e.awake ? 400 : 48); if (e.tg) e.awake = true; }
        const tg = e.tg && !e.tg.down ? e.tg : null;
        let moving = false;
        if (tg && e.awake && active) {
          const dx = tg.x - e.x, dz = tg.z - e.z, d = Math.hypot(dx, dz), want = Math.atan2(dx, dz);
          e.th = wrap(e.th + FL.clamp(wrap(want - e.th), -(e.vehicle ? 1.4 : 7) * dt, (e.vehicle ? 1.4 : 7) * dt));
          // heranrücken, bis die eigene Schussweite passt. Die Besatzung bleibt an ihrer Deckung, solange sie von dort treffen kann.
          if (d > (e.guard ? e.reach - 3 : e.pref)) {
            moving = true; e.guard = false;
            const k = e.vehicle ? Math.max(0, Math.cos(wrap(want - e.th))) : 1, wob = e.vehicle ? 0 : Math.sin(this.t * 0.8 + e.ph) * 0.35;
            e.x += Math.sin(e.th + wob) * e.speed * k * dt; e.z += Math.cos(e.th + wob) * e.speed * k * dt;
            this.pushOut(e, e.r * 0.6);
            if (e.vehicle && Math.random() < dt * 4) this.fx.dust(e.x, e.y + 0.2, e.z, 1.2);
          }
          e.fireCd -= dt;
          // auch gegnerische Fahrzeuge schießen nur dorthin, wohin sie zeigen
          if (d < e.reach && e.fireCd <= 0 && (!e.vehicle || Math.abs(wrap(want - e.th)) < 0.25)) { e.fireCd = FL.rand(0.7, 1.3) / (e.rate * rate) * (moving ? 1.6 : 1); this.enemyFire(e, tg); }
        }
        // Wer sich verlaufen hat und weit weg von allem steht, zählt nicht mehr mit
        if (e.age > 100 && !e.guard && Math.hypot(e.x - h.x, e.z - h.z) > 110) { e.dead = true; this.stage.scene.remove(e.mesh); continue; }
        this.place(e.mesh, e.x, e.z, e.th, e.vehicle); e.y = e.mesh.position.y;
        if (!e.vehicle) FL.animSoldier(e.mesh, this.t, moving, false);
        if (e.bar) e.bar.rotation.y = h.th - e.th;
      }
      // Wachtürme, Bunker, MG-Nester, Geschütztürme und das Kommandogebäude schießen auf alles, was nah genug herankommt
      this.fortCd -= dt;
      if (this.fortCd <= 0 && active) {
        const guns = this.structures.filter(s => s.alive && s.key && (s.kind === 'tower' || s.kind === 'hq' || s.kind === 'bunker' || s.kind === 'mgnest' || s.kind === 'turret'));
        this.fortCd = guns.length ? Math.max(1.6, 6.5 / guns.length) : 99;
        for (let i = 0; i < 4 && guns.length; i++) {
          const s = FL.pick(guns), m = this.pickOwn(s.x, s.z, 52);
          if (!m) continue;
          const a = Math.atan2(m.x - s.x, m.z - s.z), u = s.mesh.userData, out = Math.min(3, s.r * 0.8);
          if (u.turret && s.kind === 'turret') u.turret.rotation.y = a - s.mesh.rotation.y;
          if (u.gun && s.kind === 'mgnest') u.gun.rotation.y = a - s.mesh.rotation.y;
          this.enemyFire({ x: s.x + Math.sin(a) * out, z: s.z + Math.cos(a) * out, y: s.y, h: Math.min(s.h, 5), gun: s.kind === 'tower' || s.kind === 'mgnest' ? 'mg' : 'granate', fort: true }, m);
          break;
        }
      }
    }

    // ---------------------------------------------------------------- Gebiete sichern, Verstärkung, Sieg
    updateObjective(dt, active) {
      const o = this.objective(), h = this.hero, dObj = Math.hypot(o.x - h.x, o.z - h.z);
      // Die Formation zeigt zum Ziel. Steht man schon mittendrin, bleibt sie, wie sie war.
      if (dObj > (o.base ? 46 : 22)) this.front = wrap(this.front + FL.clamp(wrap(Math.atan2(o.x - h.x, o.z - h.z) - this.front), -1.2 * dt, 1.2 * dt));
      const mine = this.enemies.filter(e => !e.dead && e.zone === o).length;
      o.left = mine + (o.base ? 0 : o.reserve);
      if (!active) return;
      const contact = dObj < (o.base ? 100 : 52);
      if (contact) this.secT += dt;
      if (contact && o.reserve > 0) {
        this.spawnCd -= dt;
        if (this.spawnCd <= 0) {
          // Die schlafende Besatzung weiter hinten zählt nicht mit: Es geht darum, wie viele gerade wirklich angreifen
          if (this.enemies.filter(e => !e.dead && e.awake).length < this.maxEnemies() * (o.base ? 0.45 : 1)) this.reinforce(o);
          this.spawnCd = this.spawnDelay() * (o.base ? 4.5 : 1);
        }
      }
      if (!o.base) {
        if (o.left === 0 && dObj < ZONE_R) {
          this.capT += dt;
          if (this.capT > 2.2) this.secure(o);
        } else this.capT = Math.max(0, this.capT - dt * 2);
      }
      const q = FL.clamp(dObj * 0.035, 3, 9) * (1 + Math.sin(this.t * 5) * 0.08);
      this.beacon.scale.set(q, q, 1); this.beacon.position.set(o.x, this.gy(o.x, o.z) + (o.base ? 14 : 8.5) + q * 0.6, o.z);
      this.beacon.visible = this.endT < 0 && dObj > (o.base ? 64 : ZONE_R);
    }
    secure(z) {
      z.done = true; this.section++; this.capT = 0; this.secT = 0; this.spawnCd = 4;
      z.ring.material.color.set(0x5fd07a); z.ring.material.opacity = 0.45; z.flag.material = FL.mat(0x2a6fd0);
      this.coins += 10; this.hero.hp = this.hero.max;
      for (const m of this.own) if (m.down) { m.down = false; m.hp = m.max; } else m.hp = m.max;
      FL.audio.play('up');
      FL.hud.msg('Gebiet gesichert!', C.green);
      FL.hud.msg(this.section >= this.zones.length ? 'Jetzt die Basis: Zerstöre Wachtürme, Bunker und Gebäude!' : 'Weiter zum nächsten Gebiet', this.section >= this.zones.length ? C.red : C.gold, true);
    }

    // ---------------------------------------------------------------- ein Zeitschritt
    update(dt) {
      if (this.result) return;
      const fx = this.fx, h = this.hero;
      this.t += dt; this.fireCd -= dt; this.muzzleT -= dt; this.eshotT -= dt; this.noteT -= dt;
      this.towerCd = Math.max(0, this.towerCd - dt); this.shake = Math.max(0, this.shake - dt); this.invuln = Math.max(0, this.invuln - dt);
      this.jetCd = Math.max(0, this.jetCd - dt);
      for (let i = 0; i < 4; i++) this.specialCd[i] = Math.max(0, this.specialCd[i] - dt);
      for (const s of this.spinners) s.rotation.y += dt * 1.5;
      if (this.endT >= 0) { this.endT -= dt; if (this.endT <= 0) { this.result = 'win'; return; } }
      const active = this.endT < 0;

      this.control(dt, active);
      this.updateObjective(dt, active);
      this.updateGroups(dt, active);
      this.updateAllies(dt, active);
      this.updateVehicles(dt, active);
      this.updateEnemies(dt, active);

      // Kameraden aufhelfen, Fahrzeuge reparieren: einfach daneben stehen bleiben (oder E halten).
      // Nach einer Weile rappeln sie sich auch selbst wieder auf.
      let helping = null, hd = 3.4;
      if (active && (!h.moving || FL.down('KeyE'))) for (const m of this.own) if (m.down) { const d = Math.hypot(m.x - h.x, m.z - h.z) - (isVeh(m) ? 2 : 0); if (d < hd) { hd = d; helping = m; } }
      for (const m of this.own) {
        m.icon.visible = m.down;
        if (!m.down) continue;
        m.downT += dt;
        const veh = isVeh(m), need = (veh ? 2 : 1.2) * (this.lo.medkit ? 0.5 : 1);
        if (m === helping) m.revive += dt; else m.revive = Math.max(0, m.revive - dt);
        if (m.revive >= need || m.downT > (veh ? 40 : 28)) {
          m.down = false; m.hp = m.max; m.icon.visible = false; FL.audio.play('up');
          FL.hud.msg(veh ? 'Repariert!' : 'Kamerad ist wieder dabei!', C.green, true);
          continue;
        }
        const near = Math.hypot(m.x - h.x, m.z - h.z) < 3.4 + (veh ? 2 : 0), q = (near ? 1.3 : 0.9) + Math.sin(this.t * 6) * 0.08 + m.revive * 0.5;
        m.icon.scale.set(q, q, 1); m.icon.position.set(m.x, this.gy(m.x, m.z) + (veh ? 4 : 2.3), m.z);
        if (!veh) FL.animSoldier(m.mesh, this.t, false, true);
      }

      // Artillerie-Salve
      if (this.barrage && active) {
        const q = this.barrage; q.cd -= dt;
        if (q.cd <= 0) {
          q.cd = 0.34; q.n--;
          const pool = this.strongest(), st = this.baseActive() ? this.structures.filter(s => s.alive && s.key && Math.hypot(s.x - h.x, s.z - h.z) < 95) : [];
          this.lob(h.x - Math.sin(this.front) * 60 + FL.rand(-9, 9), 36, h.z - Math.cos(this.front) * 60, pool.length ? FL.pick(pool) : st.length ? FL.pick(st) : null, 12, 4.6, 'shell', 0, 1.5);
          if (q.n <= 0) this.barrage = null;
        }
      }
      this.updateAircraft(dt);
      this.updateJets(dt, active);

      // eigene Kugeln: Sie bleiben im Hang stecken, wenn ein Hügel im Weg ist
      const inBaseZ = this.baseZ - 6;
      for (const b of this.bullets) {
        b.life -= dt;
        for (let i = 0; i < 2 && !b.gone; i++) {
          b.x += b.vx * dt / 2; b.y += b.vy * dt / 2; b.z += b.vz * dt / 2;
          for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - b.x, e.z - b.z) < e.r + 0.3 && b.y < e.y + (e.vehicle ? 3.2 : 2.4)) {
            b.gone = true;
            if (b.rocket) this.explode(b.x, b.z, 3.2, b.dmg); else { this.damage(e, b.dmg); fx.spark(b.x, b.y, b.z, 0.7); }
            break;
          }
          if (!b.gone && b.z > inBaseZ) for (const s of this.structures) if (s.alive && !s.fence && b.y < s.y + s.h + 1 && this.onStructure(s, b.x, b.z, 0)) {
            b.gone = true; this.damageStructure(s, b.rocket ? b.dmg * 3 : b.dmg);
            fx.spark(b.x, b.y, b.z, 1.1);
            if (b.rocket) fx.explosion(b.x, b.y, b.z, 0.7, true);
            break;
          }
          if (!b.gone && b.y < this.gy(b.x, b.z)) { b.gone = true; if (b.rocket) this.explode(b.x, b.z, 3.2, b.dmg); else if (Math.random() < 0.5) fx.puff('dust', b.x, b.y + 0.2, b.z, 0.9, 0.35, 0, 1.2, 0, 1.4); }
        }
        if (b.life <= 0) b.gone = true;
        if (b.gone) fx.freeShot(b.mesh);
        else { b.mesh.position.set(b.x, b.y, b.z); b.mesh.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz); }
      }
      this.bullets = this.bullets.filter(b => !b.gone);

      // gegnerische Kugeln, Raketen, Granaten: Sie fliegen dorthin, wo beim Abschuss gezielt wurde. Wer weg ist, wird nicht getroffen.
      for (const b of this.ebullets) {
        b.t += dt;
        if (b.t < 0) continue;
        const k = Math.min(1, b.t / b.T), x = FL.lerp(b.sx, b.tx, k), z = FL.lerp(b.sz, b.tz, k);
        const y = FL.lerp(b.sy, b.ty, k) + (b.kind === 'granate' ? Math.sin(k * Math.PI) * 4 : 0);
        b.mesh.visible = true; b.mesh.position.set(x, y, z);
        if (b.kind === 'granate') FL.aimShell(b, x, y, z); else b.mesh.rotation.y = Math.atan2(b.tx - b.sx, b.tz - b.sz);
        if (b.kind === 'rakete' && Math.random() < 0.5) fx.puff('white', x, y, z, 0.5, 0.4, 0, 0.3, 0, 1.5);
        if (k < 1) continue;
        b.gone = true;
        const m = b.target, heavy = b.kind === 'rakete' || b.kind === 'granate';
        if (heavy) {
          const r = b.kind === 'rakete' ? 1.6 : 2.1;
          fx.explosion(x, this.gy(x, z) + 0.3, z, 0.6); FL.audio.play('boom');
          for (const o of this.own) if (Math.hypot(o.x - x, o.z - z) < r + (isVeh(o) ? 1.6 : 0) && this.covered(o, b.sx, b.sz) < 1) this.hurt(o, 2);
          this.stage.scene.remove(b.mesh);
        } else {
          if (b.blocked) { if (Math.random() < 0.6) fx.puff('dust', x, y + 0.2, z, 0.9, 0.35, 0, 1.2, 0, 1.4); }
          else if (!m.down && Math.hypot(m.x - x, m.z - z) < (isVeh(m) ? 2.2 : 0.8)) {
            if (Math.random() < this.covered(m, b.sx, b.sz)) { FL.audio.play('ping'); fx.spark(x, y, z, 0.9); }
            else this.hurt(m, 1);
          }
          fx.freeShot(b.mesh);
        }
      }
      this.ebullets = this.ebullets.filter(b => !b.gone);

      // Granaten, Raketen und Bomben der eigenen Seite
      for (const s of this.shells) {
        s.t += dt;
        if (s.t < 0) continue;
        s.mesh.visible = true;
        if (s.target && !s.target.dead && s.target.alive !== false) { s.tx = s.target.x; s.tz = s.target.z; }
        const k = Math.min(1, s.t / s.dur), arc = s.kind === 'bomb' ? 0 : Math.sin(k * Math.PI) * (s.kind === 'rocket' ? 2.5 : 6);
        const x = FL.lerp(s.sx, s.tx, k), y = FL.lerp(s.sy, this.gy(s.tx, s.tz) + 0.3, s.kind === 'bomb' ? k * k : k) + arc, z = FL.lerp(s.sz, s.tz, k);
        s.mesh.position.set(x, y, z); if (s.kind !== 'bomb') FL.aimShell(s, x, y, z);
        if (s.kind === 'rocket' && Math.random() < dt * 30) fx.puff('smoke', x, y, z, 0.7, 0.5, 0, 0.3, 0, 1);
        if (k >= 1) { s.gone = true; this.stage.scene.remove(s.mesh); this.explode(s.tx, s.tz, s.radius, s.dmg); }
      }
      this.shells = this.shells.filter(s => !s.gone);
      this.enemies = this.enemies.filter(e => !e.dead);

      for (const b of this.burning) { b.t -= dt; if (Math.random() < dt * 5) fx.smoke(b.x + FL.rand(-1, 1) * b.size * 0.5, this.gy(b.x, b.z) + 1, b.z, b.size); }
      this.burning = this.burning.filter(b => b.t > 0);
      this.heroCover = this.ducking && this.covers.some(c => !c.hill && Math.hypot(c.x - h.x, c.z - h.z) < c.r + 1.9);

      fx.update(dt);
      this.updateCamera(dt);
      this.updateHud();
    }

    // ---------------------------------------------------------------- zwei Kampfjets: mehrere Anflüge auf das Ziel, abdrehen, wieder angreifen
    callJets() {
      const lvl = this.lo.jets, o = this.objective();
      if (!lvl) { FL.hud.msg('Kampfjets hast du noch nicht gekauft', C.muted, true); return; }
      if (this.jetCd > 0 || this.jets.length || this.endT >= 0) return;
      this.jetCd = this.jetTotal = lvl > 1 ? 60 : 85;
      for (let k = 0; k < 2; k++) {
        // Sie kommen von hinten über die eigenen Linien, leicht versetzt
        const from = this.front + Math.PI + (k ? 0.45 : -0.45), dist = 210 + k * 85, mesh = FL.jetModel(0x6a7682, 0x3a4450);
        mesh.rotation.order = 'YXZ'; this.stage.add(mesh);
        if (mesh.userData.gear) mesh.userData.gear.visible = false;
        this.jets.push({ k, x: o.x + Math.sin(from) * dist, z: o.z + Math.cos(from) * dist, y: this.gy(o.x, o.z) + 38, a: wrap(from + Math.PI), state: 'run', pass: 0, passes: lvl > 1 ? 4 : 3, cd: 0, shots: 0, bank: 0, tg: null, mesh });
      }
      FL.audio.play('jet');
      FL.hud.msg('Zwei Kampfjets im Anflug!', C.orange);
    }
    updateJets(dt, active) {
      const o = this.objective(), V = 54;
      for (const j of this.jets) {
        // Ziel dieses Anflugs: der stärkste Gegner am Ziel, sonst ein Gebäude der Basis, sonst das Ziel selbst
        if (!j.tg || j.tg.dead || j.tg.alive === false) {
          const pool = this.alive().filter(e => Math.hypot(e.x - o.x, e.z - o.z) < 70).sort((a, b) => b.hp - a.hp);
          j.tg = pool[j.k % Math.max(1, pool.length)] || (this.baseActive() ? this.nearestStructure(o.x + (j.k ? 12 : -12), o.z, 90) : null);
        }
        const tx = j.tg ? j.tg.x : o.x, tz = j.tg ? j.tg.z : o.z, gy = this.gy(tx, tz);
        const dx = tx - j.x, dz = tz - j.z, d = Math.hypot(dx, dz), brg = Math.atan2(dx, dz);
        let want = j.a, wantY = gy + 38;
        if (j.state === 'run') {
          want = brg; wantY = gy + 13 + 25 * smooth(40, 150, d);
          const lined = Math.abs(wrap(brg - j.a)) < 0.22, mode = (j.pass + j.k) % 3;
          j.cd -= dt;
          if (active && lined && d < 105 && d > 20) {
            const s = Math.sin(j.a), c = Math.cos(j.a);
            if (mode === 0 && j.cd <= 0 && j.shots < 4) {
              // Raketen
              j.cd = 0.22; j.shots++;
              this.lob(j.x + c * (j.shots % 2 ? 2 : -2), j.y - 0.6, j.z - s * (j.shots % 2 ? 2 : -2), j.tg, 11, 4, 'rocket', 0, Math.max(0.45, d / 85));
              FL.audio.play('rocket');
            } else if (mode === 1 && j.cd <= 0 && d < 90) {
              // Bordkanone: eine Garbe, die auf das Ziel zuwandert
              j.cd = 0.06; j.shots++;
              const ax = tx + FL.rand(-2.2, 2.2), az = tz + FL.rand(-2.2, 2.2);
              this.addBullet(j.x + s * 3, j.y - 0.4, j.z + c * 3, ax, this.gy(ax, az) + 0.6, az, 2, 0xffe68c, 2);
              if (j.shots % 3 === 0) FL.audio.play('shot');
            } else if (mode === 2 && j.shots < 1 && d < 46) {
              // eine Bombe
              j.shots++;
              const mesh = FL.bombModel(); this.stage.add(mesh);
              this.shells.push({ kind: 'bomb', sx: j.x, sy: j.y - 1, sz: j.z, tx, tz, t: 0, dur: 0.95, target: null, dmg: 24, radius: 6.5, mesh });
            }
          }
          // überflogen: hochziehen und abdrehen
          if (d < 16 || (d < 70 && Math.cos(wrap(brg - j.a)) < 0)) { j.state = 'away'; j.pass++; j.shots = 0; j.turn = (j.k ? 1 : -1) * (j.pass % 2 ? 1 : -1); j.tg = null; }
        } else if (j.state === 'away') {
          want = j.a + j.turn * 0.35;                                   // weiter weg in einer flachen Kurve
          if (d > 165) { j.state = j.pass >= j.passes ? 'exit' : 'run'; if (j.state === 'run') FL.audio.play('jet'); }
        } else if (d > 420) j.gone = true;
        const da = FL.clamp(wrap(want - j.a), -0.9 * dt, 0.9 * dt);
        j.a = wrap(j.a + da);
        j.bank += (-da / dt * 0.75 - j.bank) * Math.min(1, dt * 4);
        const vy = FL.clamp((wantY - j.y) * 1.2, -16, 16);
        j.x += Math.sin(j.a) * V * dt; j.z += Math.cos(j.a) * V * dt; j.y += vy * dt;
        j.mesh.position.set(j.x, j.y, j.z); j.mesh.rotation.set(-Math.atan2(vy, V), j.a, j.bank);
      }
      for (const j of this.jets) if (j.gone) this.stage.scene.remove(j.mesh);
      this.jets = this.jets.filter(j => !j.gone);
    }

    // eigene Unterstützung aus der Luft
    updateAircraft(dt) {
      const h = this.hero;
      for (const a of this.aircraft) {
        a.t += dt; a.life -= dt;
        if (a.t < 0) continue;
        a.mesh.visible = true;
        if (a.kind === 'drone') {
          let tg = a.target;
          if (!tg || tg.dead || tg.alive === false) {
            const taken = new Set(this.aircraft.map(o => o.target));
            const pool = this.strongest(), free = pool.filter(e => !taken.has(e));
            tg = a.target = (free.length ? free : pool)[0] || (this.baseActive() ? this.nearestStructure(a.x, a.z, 90) : null);
          }
          const tx = tg ? tg.x : a.x + Math.sin(h.th) * 6, ty = tg ? tg.y + (tg.h ? 2 : 1) : a.y, tz = tg ? tg.z : a.z + Math.cos(h.th) * 6;
          const dx = tx - a.x, dy = ty - a.y, dz = tz - a.z, d = Math.hypot(dx, dy, dz) || 1, step = 30 * dt;
          a.x += dx / d * Math.min(step, d); a.y += dy / d * Math.min(step, d); a.z += dz / d * Math.min(step, d);
          a.y = Math.max(a.y, this.gy(a.x, a.z) + 0.8);
          a.mesh.rotation.y = Math.atan2(dx, dz);
          if (tg && Math.hypot(dx, dz) < 1.4 + (tg.h ? tg.r * 0.7 : 0)) { a.life = 0; this.explode(a.x, a.z, 3, 10, a.y); }
        } else if (a.kind === 'heli') {
          // kreist über dem Kommandanten und schießt Raketen auf alles in der Nähe
          a.a += 0.5 * dt; a.x = h.x + Math.sin(a.a) * 20; a.z = h.z + Math.cos(a.a) * 20; a.mesh.rotation.y = a.a + Math.PI / 2; a.mesh.rotation.z = 0.1;
          const ud = a.mesh.userData; if (ud.rotor) ud.rotor.rotation.y += dt * 30; if (ud.tail) ud.tail.rotation.x += dt * 40;
          a.fire -= dt;
          const tg = this.heavyTarget(a.x, a.z, 70);
          if (a.fire <= 0 && a.t > 1 && tg) { a.fire = 0.4; this.lob(a.x, a.y - 1, a.z, tg, 9, 3.8, 'rocket', 0, 0.7); }
        } else {
          a.d += 36 * dt; a.x = a.ox + Math.sin(a.a) * a.d; a.z = a.oz + Math.cos(a.a) * a.d; a.mesh.rotation.y = a.a; a.drop -= dt;
          if (a.drop <= 0 && a.d > 14 && a.d < 100) {
            a.drop = 0.14;
            for (const off of [-4, 0, 4]) {
              const bx = a.x + Math.cos(a.a) * off, bz = a.z - Math.sin(a.a) * off, mesh = FL.bombModel(); this.stage.add(mesh);
              this.shells.push({ kind: 'bomb', sx: bx, sy: a.y, sz: bz, tx: bx + Math.sin(a.a) * 9, tz: bz + Math.cos(a.a) * 9, t: 0, dur: 0.7, target: null, dmg: 15, radius: 4.2, mesh });
            }
          }
        }
        a.mesh.position.set(a.x, a.y, a.z);
      }
      for (const a of this.aircraft) if (a.life <= 0) this.stage.scene.remove(a.mesh);
      this.aircraft = this.aircraft.filter(a => a.life > 0);
    }

    updateCamera(dt) {
      const cam = this.stage.camera, h = this.hero;
      this.camTh += wrap(h.th - this.camTh) * (1 - Math.exp(-9 * dt));
      this.camY += (this.gy(h.x, h.z) - this.camY) * (1 - Math.exp(-7 * dt));
      const s = Math.sin(this.camTh), c = Math.cos(this.camTh), sh = this.shake > 0 ? this.shake * 1.1 : 0;
      FL.touch.wheelZoom();
      const k = FL.touch.view(cam);                                 // Zoom: zwei Finger oder Mausrad
      const cx = h.x - s * 8.6 * k, cz = h.z - c * 8.6 * k;
      // die Kamera bleibt über dem Boden, auch wenn hinter dem Kommandanten ein Hügel liegt
      cam.position.set(cx + FL.rand(-sh, sh), Math.max(this.camY + 5.4 * k, this.gy(cx, cz) + 2) + FL.rand(-sh, sh), cz);
      cam.lookAt(h.x + s * 15, this.camY + 1.5, h.z + c * 15);
      this.stage.update(new THREE.Vector3(h.x + s * 14, this.camY, h.z + c * 14));
    }

    updateHud() {
      const lo = this.lo, H = FL.hud, w = FL.WEAPONS[lo.weapon], h = this.hero, hp = h.hp / h.max, o = this.objective();
      const squad = this.own.length - 1, up = this.up().length - 1;
      let tl = `<div class="hud-big"><span class="coins">${this.coins}</span></div><div>Leben ${H.hearts(this.lives, 4 + lo.lives)}</div>`;
      tl += `<div>Gesundheit</div>${H.meter(hp, hp < 0.3 ? 'red' : hp < 0.6 ? 'gold' : '')}`;
      tl += `<div><b style="color:#${w.color.toString(16).padStart(6, '0')}">${w.name}</b>${squad ? ` · Trupp ${up}/${squad} <b style="color:#46dcff">${ORDER_NAME[this.order]}</b>` : ''}</div>`;
      if (this.split) tl += `<div style="color:#46dcff">${SPLIT_NAME[this.split]}</div>`;
      H.set(this.hTL, tl);

      let tc = '<div class="route">';
      for (let i = 0; i <= this.nSec; i++) {
        if (i) tc += `<div class="seg ${i <= this.section ? 'on' : ''}"></div>`;
        tc += `<div class="dot ${i <= this.section ? 'on' : ''}"></div>`;
      }
      tc += '</div>';
      const dObj = Math.hypot(o.x - h.x, o.z - h.z), arrow = FL.arrowHtml(FL.bearing(h.x, h.z, h.th, o.x, o.z), dObj);
      if (o.base) {
        const key = this.structures.filter(s => s.key);
        const frac = key.reduce((a, s) => a + (s.alive ? Math.max(0, s.hp) : 0), 0) / key.reduce((a, s) => a + s.max, 0);
        tc += `<div>Gegnerische Basis · noch ${this.keyLeft()} Ziele ${dObj > 60 ? arrow : ''}</div>${H.meter(frac, 'red')}`;
      } else if (o.left === 0) {
        tc += dObj < ZONE_R ? `<div style="color:#5fd07a">Gebiet wird gesichert …</div>${H.meter(this.capT / 2.2)}` : `<div style="color:#5fd07a">Gebiet ist frei: Geh in den Ring bei der Fahne ${arrow}</div>`;
      } else {
        tc += `<div>Gebiet ${this.section + 1} sichern ${dObj > ZONE_R ? arrow : ''} · noch ${o.left} Gegner</div>${H.meter(1 - o.left / Math.max(1, o.total))}`;
      }
      H.set(this.hTC, tc);

      let tr = '';
      FL.SPECIALS.forEach((sp, i) => {
        const lvl = lo[sp.id];
        if (!lvl) return;
        const total = sp.reload * (lvl > 1 ? 0.7 : 1), ready = this.specialCd[i] <= 0;
        tr += `<div class="slot ${ready ? 'ready' : ''}"><b>${sp.key}</b>${sp.name}${ready ? '' : `<i style="width:${Math.round((1 - this.specialCd[i] / total) * 100)}%"></i>`}</div><br>`;
      });
      if (lo.reinf && !this.reinfUsed) tr += '<div class="slot ready"><b>5</b>Verstärkung (einmal)</div><br>';
      if (lo.jets) {
        const ready = this.jetCd <= 0 && !this.jets.length;
        tr += `<div class="slot ${ready ? 'ready' : ''}"><b>6</b>Kampfjets${ready ? '' : `<i style="width:${Math.round((1 - this.jetCd / (this.jetTotal || 1)) * 100)}%"></i>`}</div><br>`;
      }
      H.set(this.hInfo, tr);
      const items = [];
      for (const z of this.zones) items.push({ x: z.x, z: z.z, color: z.done ? '#5fd07a' : '#ffc43c', size: z === o ? 8 : 6, far: z === o, ring: true });
      for (const s of this.structures) if (s.alive && s.key) items.push({ x: s.x, z: s.z, color: '#ff8c3c', size: 3.5 });
      if (o.base) items.push({ x: o.x, z: o.z, color: '#ff8c3c', size: 7, far: true, ring: true });
      if (this.dest) items.push({ x: this.dest.x, z: this.dest.z, color: '#46dcff', size: 4, ring: true });
      for (const m of this.own) if (m !== h) items.push({ x: m.x, z: m.z, color: m.down ? '#ffffff' : m.grp ? '#7dffb0' : '#46dcff', size: isVeh(m) ? 3.5 : 2.2 });
      for (const j of this.jets) items.push({ x: j.x, z: j.z, color: '#ffffff', size: 3, far: true });
      for (const e of this.enemies) if (!e.dead && e.awake) items.push({ x: e.x, z: e.z, color: '#ff5a3c', size: e.vehicle ? 4.5 : 2.8 });
      FL.drawMinimap(this.map, h.x, h.z, h.th, 85, items);

      let bc = '';
      if (lo.towers > 0) {
        const tw = FL.TOWER_LEVELS[lo.towers - 1];
        if (!this.towersOn) bc = '<span class="muted">Geschütze AUS (T)</span>';
        else if (this.towerCd <= 0) bc = '<b style="color:#46dcff">Geschützwagen bereit (X)</b>';
        else bc = `Geschütze laden …${H.meter(1 - this.towerCd / tw.reload, 'cyan')}`;
      }
      this.hBC.style.display = bc ? '' : 'none'; H.set(this.hBC, bc);
      this.hCover.style.display = this.ducking && this.endT < 0 ? '' : 'none';
      H.set(this.hCover, this.heroCover ? 'IN DECKUNG' : 'IN STELLUNG');
    }

    destroy() { window.removeEventListener('pointerdown', this.onPointer); this.stage.dispose(); }
  };

  // ---------------------------------------------------------------- Steuerung per Finger für den Kommandanten
  // Auf den Boden tippen = dorthin laufen. Der runde Steuerknüppel links dreht nur den Körper und damit die Waffe (auch beim Laufen),
  // über den freien Bildschirm wischen dreht ebenfalls. Die Knöpfe drücken wie überall einfach die passenden Tasten.
  const T = FL.touch, showOther = T.show;
  const press = code => { if (!FL.keys[code]) { FL.keys[code] = true; if (FL.onKey) FL.onKey(code); } };
  const release = code => { FL.keys[code] = false; };
  T.show = (kind, lo) => {
    if (kind !== 'attack') return showOther(kind, lo);
    T.hide();
    if (!T.active) { T.pending = { kind, lo }; return; }
    const L = T.layer = FL.el('div', 'touch-layer', '');
    document.body.insertBefore(L, document.getElementById('screen'));
    const btnAt = e => { const q = document.elementFromPoint(e.clientX, e.clientY); return q && q.closest ? q.closest('.tbtn') : null; };
    L.addEventListener('pointerdown', e => {
      const b = btnAt(e);
      if (!b) return;
      e.preventDefault(); T.held.set(e.pointerId, b); b.classList.add('on'); press(b.dataset.code);
      if (navigator.vibrate && b.dataset.tap) navigator.vibrate(8);
    });
    const up = e => {
      const cur = T.held.get(e.pointerId);
      if (!cur) return;
      T.held.delete(e.pointerId); cur.classList.remove('on');
      if (![...T.held.values()].some(o => o.dataset.code === cur.dataset.code)) release(cur.dataset.code);
    };
    L.addEventListener('pointerup', up); L.addEventListener('pointercancel', up);
    const make = (parent, label, code, cls, tap) => { const b = FL.el('div', 'tbtn ' + (cls || ''), label, parent); b.dataset.code = code; if (tap) b.dataset.tap = '1'; return b; };
    make(L, 'II', 'KeyP', 'tpause', true);
    // freier Bildschirm: kurzer Tipp = Laufziel, wischen = drehen
    const area = FL.el('div', 'tswipe', ''); L.insertBefore(area, L.firstChild);
    let sw = null;
    area.addEventListener('pointerdown', e => { if (!sw) sw = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, drag: false }; });
    area.addEventListener('pointermove', e => {
      if (!sw || e.pointerId !== sw.id) return;
      if (!sw.drag && Math.hypot(e.clientX - sw.x0, e.clientY - sw.y0) > 26) { sw.drag = true; sw.x = e.clientX; }
      if (sw.drag) { T.swipe += e.clientX - sw.x; sw.x = e.clientX; }
    });
    area.addEventListener('pointerup', e => {
      if (!sw || e.pointerId !== sw.id) return;
      const tap = !sw.drag, m = FL.app && FL.app.mode;
      sw = null;
      if (tap && m && m.tap) { m.tap(e.clientX, e.clientY); if (navigator.vibrate) navigator.vibrate(6); }
    });
    // wird der Finger abgebrochen (zum Beispiel weil ein zweiter zum Zoomen dazukommt), zählt es nicht als Tipp
    area.addEventListener('pointercancel', e => { if (sw && e.pointerId === sw.id) sw = null; });
    T.endSwipe = () => { sw = null; };
    // runder Steuerknüppel: nur drehen und zielen
    const left = FL.el('div', 'tpad tleft', '', L), right = FL.el('div', 'tpad tright', '', L);
    const stick = FL.el('div', 'tstick', '', left), knob = FL.el('div', 'tknob', '', stick);
    let sid = null;
    const setS = e => {
      const r = stick.getBoundingClientRect(), R = r.width / 2, M = R * 0.6;
      let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
      const d = Math.hypot(dx, dy);
      if (d > M) { dx *= M / d; dy *= M / d; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      const x = dx / M;
      FL.stick.x = Math.abs(x) < 0.15 ? 0 : Math.sign(x) * (Math.abs(x) - 0.15) / 0.85; FL.stick.y = 0;
    };
    const endS = e => { if (e.pointerId !== sid) return; sid = null; FL.stick.x = FL.stick.y = 0; knob.style.transform = ''; stick.classList.remove('on'); };
    stick.addEventListener('pointerdown', e => { if (sid !== null) return; e.preventDefault(); sid = e.pointerId; try { stick.setPointerCapture(sid); } catch (err) {} stick.classList.add('on'); setS(e); });
    stick.addEventListener('pointermove', e => { if (e.pointerId === sid) setS(e); });
    stick.addEventListener('pointerup', endS); stick.addEventListener('pointercancel', endS);
    make(right, 'FEUER', 'Space', 'fire');
    make(right, 'Halt', 'KeyC', 'wide cover', true);
    const extra = FL.el('div', 'textra', '', right);
    if (lo.allies || lo.tank || lo.werfer || lo.towers) { make(extra, 'Trupp', 'KeyQ', 'small cyan', true); make(extra, 'Flanke', 'KeyR', 'small cyan', true); }
    if (lo.towers) make(extra, 'Geschütz', 'KeyX', 'small cyan', true);
    FL.SPECIALS.forEach(sp => { if (lo[sp.id]) make(extra, sp.key, 'Digit' + sp.key, 'small orange', true); });
    if (lo.reinf) make(extra, 'Verst.', 'Digit5', 'small green', true);
    if (lo.jets) make(extra, 'Jets', 'Digit6', 'small green', true);
  };
})();
