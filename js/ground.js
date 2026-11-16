'use strict';
// Frontlinie 3 – Basis angreifen im freien Feld. Der Spieler führt als Kommandant seinen Trupp:
// Er läuft frei durch das Gelände, sichert ein Gebiet nach dem anderen und stürmt am Ende die gegnerische Basis.
// Kameraden und Fahrzeuge folgen lose und handeln selbst: Sie verteilen sich, suchen Deckung, rücken abwechselnd vor und geben Feuerschutz.
// Richtung wie überall: Der Kurs th zeigt nach (sin th, cos th), eine Linksdrehung macht th größer. Bei th = 0 liegt +x links.
//
// Aufbau für später: Die Schlacht selbst (Gelände, Gebiete, Gegner, eigene Einheiten in this.own) weiß nichts von der Steuerung.
// Nur control() bewegt die Einheit des Spielers (this.hero). Andere Rollen in derselben Schlacht (Panzer fahren, Luftunterstützung)
// können deshalb später dieselbe Schlacht benutzen und eine andere Einheit steuern.
(() => {
  const C = { gold: '#ffc43c', red: '#ef5a4c', green: '#5fd07a', cyan: '#46dcff', text: '#e9eef2', orange: '#ff8c3c', muted: '#9fb0bd' };
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const ZONE_R = 17, STEP = 78, FIRST = 62, EDGE = 88;
  const ALLY_SLOT = [[3.5, 2.5], [-3.5, 2.5], [7.5, 4.5], [-7.5, 4.5], [11.5, 7], [-11.5, 7]];      // [seitlich, dahinter]
  const ORDERS = ['follow', 'hold', 'storm'];
  const ORDER_NAME = { follow: 'folgt dir', hold: 'hält die Stellung', storm: 'stürmt vor' };
  const REACH = { gewehr: 36, mg: 40, rakete: 46, granate: 58 };
  const isVeh = m => m.kind === 'tank' || m.kind === 'werfer' || m.kind === 'spg';
  const segDist = (x, z, a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z, k = FL.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    return Math.hypot(x - a.x - dx * k, z - a.z - dz * k);
  };

  FL.GroundBattle = class {
    constructor(cfg, lo) {
      this.cfg = cfg; this.lo = lo; this.result = null; this.kind = 'attack'; this.role = cfg.role || 'commander';
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
      this.enemies = []; this.bullets = []; this.ebullets = []; this.shells = []; this.aircraft = [];
      this.structures = []; this.solid = []; this.covers = []; this.spinners = []; this.burning = [];
      this.shake = 0; this.endT = -1; this.fortCd = 2; this.order = 'follow'; this.front = 0; this.camTh = 0; this.lock = null;
      this.buildWorld();
      this.buildArmy();
      this.buildHud();
      for (const z of this.zones) this.garrison(z);
      this.garrison(this.base);
      FL.hud.msg(this.zones.length ? 'Führe deinen Trupp zum ersten Gebiet!' : 'Stürme die gegnerische Basis!', C.gold);
      this.updateCamera(1);
    }

    // ---------------------------------------------------------------- Gelände
    buildWorld() {
      const th = this.cfg.theme, st = this.stage, rnd = FL.seeded(11 + this.nSec * 7 + th.length + Math.round(this.tier * 10));
      // Die Gebiete liegen versetzt auf dem Weg zur Basis, damit man wirklich durchs Gelände ziehen muss
      this.zones = [];
      for (let k = 0; k < this.nSec - 1; k++) this.zones.push({ k, x: (k % 2 ? -1 : 1) * (16 + rnd() * 16), z: FIRST + k * STEP, done: false, left: 0, total: 0 });
      const bz = this.baseZ = FIRST + (this.nSec - 1) * STEP + 14;
      this.base = { k: this.nSec - 1, x: 0, z: bz, base: true, left: 0, total: 0 };
      this.zMax = bz + 46;
      const path = this.path = [{ x: 0, z: -8 }, ...this.zones, { x: 0, z: bz - 5 }];
      const g = st.ground(1800, FL.tex.ground(th), 18); g.position.z = bz / 2;
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
        const road = st.strip(8, len + 6, FL.tex.road(th), 8, 12, (a.x + b.x) / 2, (a.z + b.z) / 2, 0.04 + i * 0.004);
        road.rotation.z = Math.atan2(dx, dz); st.add(road);
      }
      // Deckung: Sandsäcke quer zum Weg. cover = { x, z, r } gilt für Freund und Feind.
      const bags = (x, z, a, len) => {
        const m = FL.building('sandbags', th, { len }); m.position.set(x, 0, z); m.rotation.y = a; st.add(m);
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
      // Gebiete: Ring am Boden, Fahne, Zelt und Sandsäcke der Besatzung
      this.zones.forEach((z, k) => {
        const prev = path[k], ang = Math.atan2(prev.x - z.x, prev.z - z.z);            // Richtung, aus der der Angriff kommt
        z.ang = ang;
        const geo = new THREE.RingGeometry(ZONE_R - 0.7, ZONE_R, 56), mat = new THREE.MeshBasicMaterial({ color: 0xffc43c, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
        z.ring = new THREE.Mesh(geo, mat); z.ring.rotation.x = -Math.PI / 2; z.ring.position.set(z.x, 0.09, z.z); st.add(z.ring);
        st.owned.push(geo, mat);
        st.add(FL.cyl(0.09, 0.09, 8, 5, FL.mat(0xcccccc), z.x, 4, z.z));
        z.flag = st.add(FL.box(2.3, 1.3, 0.06, FL.mat(0xc03020), z.x + 1.2, 7.2, z.z));
        const tent = FL.building('tent', th); tent.position.set(z.x - Math.sin(ang) * 8, 0, z.z - Math.cos(ang) * 8); tent.rotation.y = ang; st.add(tent);
        this.solid.push({ x: tent.position.x, z: tent.position.z, r: (tent.userData.r || 3) * 0.8, alive: true });
        z.posts = [];
        for (const off of [-8, 0, 8]) {
          const px = z.x + Math.sin(ang) * 8 + Math.cos(ang) * off, pz = z.z + Math.cos(ang) * 8 - Math.sin(ang) * off;
          bags(px, pz, ang, 5);
          z.posts.push([px - Math.sin(ang) * 1.8, pz - Math.cos(ang) * 1.8]);
        }
      });
      this.buildEnemyBase(bz);
      this.base.posts = [[-5, bz - 5], [5, bz - 5], [-17, bz - 4], [17, bz - 4], [-11, bz + 7], [11, bz + 7]];
      // Bäume, Büsche und Felsen: locker verteilt, Wege und Gebiete bleiben frei. Felsen taugen als Deckung.
      for (let i = 0; i < 340; i++) {
        const x = (rnd() * 2 - 1) * 150, z = -75 + rnd() * (bz + 170);
        if (Math.hypot(x, z) < 9) continue;
        if (Math.abs(x) < 42 && z > bz - 16 && z < bz + 48) continue;
        if (this.zones.some(q => Math.hypot(q.x - x, q.z - z) < ZONE_R + 3)) continue;
        if (this.covers.some(c => Math.hypot(c.x - x, c.z - z) < 4)) continue;
        let onRoad = false;
        for (let k = 0; k < path.length - 1 && !onRoad; k++) onRoad = segDist(x, z, path[k], path[k + 1]) < 6.5;
        if (onRoad) continue;
        const kind = FL.pick(st.theme.trees), t = FL.tree(kind, rnd);
        t.position.set(x, 0, z);
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
    }

    // Die gegnerische Basis sieht je nach Landschaft anders aus und wächst mit den Leveln.
    buildEnemyBase(bz) {
      const th = this.cfg.theme, style = FL.THEMES[th].style;
      const add = (kind, x, dz, key, baseHp, opt) => {
        const mesh = FL.building(kind, th, opt);
        mesh.position.set(x, 0, bz + dz);
        this.stage.add(mesh);
        if (mesh.userData.spin) this.spinners.push(mesh.userData.spin);
        const flat = kind === 'wall' || kind === 'gate';
        const s = { kind, x, z: bz + dz, r: opt && opt.len ? opt.len / 2 : mesh.userData.r, h: mesh.userData.h || 4, hp: baseHp, max: baseHp, key, flat, mesh, alive: true };
        this.structures.push(s); this.solid.push(s);
        return s;
      };
      add('gate', 0, 0, true, 60);
      for (const sx of [-1, 1]) {
        add('wall', sx * 8.4, 0, false, 30, { len: 8.2 });
        add('tower', sx * 14.2, 1.5, true, 45);
        add('wall', sx * 21, 0, false, 30, { len: 10 });
      }
      add(style === 'wood' ? 'barracks' : 'hq', 0, 14, true, 150);
      const extras = {
        wood: [['tent', 11, 9], ['tent', -11, 9], ['depot', 17, 16]],
        sandstone: [['depot', 12, 10], ['barracks', -14, 12], ['radar', 20, 18]],
        concrete: [['chimney', 14, 14], ['depot', -12, 10], ['hangar', -22, 20], ['radar', 22, 8]],
        fortress: [['radar', 12, 10], ['depot', -12, 10], ['bunker', 20, 16], ['bunker', -20, 16], ['antenna', 6, 22]]
      }[style].slice();
      if (th === 'winter') extras.push(['hangar', 20, 20]);
      for (const [k, x, dz] of extras) add(k, x, dz, true, k === 'tent' ? 25 : 55);
      for (let i = 0; i < 3 + Math.round(this.tier); i++) {
        const b = FL.building(FL.pick(['barracks', 'tent', 'house']), th); b.position.set(FL.rand(-34, 34), 0, bz + 54 + i * 9); b.rotation.y = FL.rand(-0.3, 0.3); this.stage.add(FL.noShadow(b));
      }
      // Die Gebäude halten so viel aus, dass die eigene Armee die Basis in gut einer Minute schaffen kann.
      const total = this.structures.reduce((a, s) => a + (s.key ? s.max : 0), 0);
      const f = this.armyDps() * (36 + 4 * this.tier) / total;
      for (const s of this.structures) s.hp = s.max = Math.max(4, s.max * f);
    }

    // ---------------------------------------------------------------- eigene Truppe
    buildArmy() {
      const lo = this.lo, st = this.stage;
      const mk = (kind, slot, hp, mesh) => {
        const icon = FL.sprite(FL.tex.icon(isVeh({ kind }) ? 'wrench' : 'cross'), 0.9, { depthTest: false });
        icon.visible = false; st.add(icon); st.add(mesh);
        const m = { kind, slot, x: slot[0], z: -slot[1] - 2, th: 0, vx: 0, vz: 0, hp, max: hp, down: false, downT: 0, revive: 0, fireCd: FL.rand(0.4, 1.2), think: FL.rand(0, 0.4), gx: 0, gz: 0, cover: null, threat: null, moving: false, crouch: false, mesh, icon };
        m.gx = m.hx = m.x; m.gz = m.hz = m.z;
        mesh.position.set(m.x, 0, m.z);
        return m;
      };
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
      for (const v of this.vehicles) v.mesh.scale.setScalar(0.8);
      this.own = [this.hero, ...this.allies, ...this.vehicles];
    }

    buildHud() {
      FL.hud.clear();
      this.hTL = FL.hud.box('hud-tl'); this.hTC = FL.hud.box('hud-tc'); this.hTR = FL.hud.box('hud-tr');
      this.hInfo = FL.el('div', '', '', this.hTR);
      this.map = FL.el('canvas', 'minimap', null, this.hTR); this.map.width = this.map.height = 170;
      this.hBC = FL.hud.box('hud-bc');
      FL.hud.box('hud-bl').innerHTML = '↑ ↓ laufen · ← → drehen · A D seitwärts · Leertaste oder Mausklick schießen · C Deckung · E aufhelfen · Q Befehl an den Trupp · X Geschütze · 1 2 3 4 Unterstützung · P Pause';
      this.hCover = FL.el('div', 'cover-note', 'IN DECKUNG', FL.hud.root);
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
    spawnEnemy(x, z, zone, guard, noVehicle) {
      let kind = FL.weighted(this.weights());
      for (let i = 0; i < 6 && noVehicle && FL.ENEMIES[kind].vehicle; i++) kind = FL.weighted(this.weights());
      if (noVehicle && FL.ENEMIES[kind].vehicle) kind = 'soldat';
      const d = FL.ENEMIES[kind];
      const e = {
        kind, vehicle: !!d.vehicle, gun: d.gun, rate: d.rate, pts: d.pts, x, z, th: Math.PI, zone, guard: !!guard, awake: !guard, age: 0,
        hp: Math.max(1, Math.round(d.hp * this.armor)), speed: d.speed * (1 + this.tier * 0.03) * FL.rand(0.9, 1.1),
        reach: REACH[d.gun], pref: kind === 'panzer' ? 40 : kind === 'jeep' ? 26 : guard ? 30 : FL.rand(14, 25),
        fireCd: FL.rand(0.6, 2.2), think: FL.rand(0, 0.4), ph: FL.rand(0, 6.28), r: d.vehicle ? 2.4 : 0.9, tg: null
      };
      e.max = e.hp;
      if (e.vehicle) { e.mesh = (kind === 'jeep' ? FL.jeepModel : FL.tankModel)(FL.PAL.enemy(this.cfg.theme)); e.mesh.scale.setScalar(0.8); }
      else e.mesh = FL.soldier({ team: 'enemy', kind, theme: this.cfg.theme });
      if (e.max > 1) { e.bar = FL.box(1, 0.09, 0.03, FL.basic(0xf05a46), 0, e.vehicle ? 3.4 : 2.25, 0); e.bar.castShadow = false; e.mesh.add(e.bar); }
      e.mesh.position.set(x, 0, z); e.mesh.rotation.y = e.th;
      this.stage.add(e.mesh); this.enemies.push(e);
      return e;
    }
    // Besatzung eines Gebiets (oder der Basis): wartet hinter ihrer Deckung, bis der Trupp näher kommt. Dazu eine Reserve, die später nachrückt.
    garrison(z) {
      const n = Math.round(3 + 1.1 * this.tier + 0.6 * z.k + (z.base ? 1 : 0));
      for (let i = 0; i < n; i++) {
        const p = z.posts[i] || [z.x + FL.rand(-9, 9), z.z + FL.rand(-7, 9)];
        this.spawnEnemy(p[0] + FL.rand(-0.8, 0.8), p[1] + FL.rand(-0.5, 0.5), z, true, true);
      }
      z.reserve = z.base ? 1e9 : Math.round(10 + 6 * this.tier + 3 * z.k);
      z.total = n + (z.base ? 0 : z.reserve);
    }
    // Verstärkung kommt von dort, wo der Kommandant gerade nicht steht
    reinforce(z) {
      const h = this.hero, next = this.path[z.k + 2] || { x: 0, z: this.baseZ + 4 };
      let cands;
      if (z.base) cands = [[-37, this.baseZ + 3], [37, this.baseZ + 3]];
      else {
        const a = Math.atan2(next.x - z.x, next.z - z.z), s = Math.sin(a), c = Math.cos(a);
        cands = [[z.x + s * 52, z.z + c * 52], [z.x + s * 30 + c * 48, z.z + c * 30 - s * 48], [z.x + s * 30 - c * 48, z.z + c * 30 + s * 48]];
      }
      cands = cands.filter(p => Math.abs(p[0]) < EDGE + 20).sort((p, q) => Math.hypot(q[0] - h.x, q[1] - h.z) - Math.hypot(p[0] - h.x, p[1] - h.z));
      const p = z.base ? cands[0] : (cands.find(q => Math.hypot(q[0] - h.x, q[1] - h.z) > 46 && Math.random() < 0.6) || cands[0]);
      const e = this.spawnEnemy(p[0] + FL.rand(-6, 6), p[1] + FL.rand(-6, 6), z, false, false);
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
      if (e.vehicle) { this.fx.explosion(e.x, 0.5, e.z, 1.3); FL.audio.play('boom'); }
      else { this.fx.vanish(e.x, 0, e.z); FL.audio.play('pop'); }
      this.stage.scene.remove(e.mesh);
    }
    damageStructure(s, d) {
      if (!s.alive) return;
      if (!this.baseActive()) { if (this.noteT <= 0 && this.endT < 0) { this.noteT = 4; FL.hud.msg('Erst alle Gebiete sichern, dann fällt die Basis!', C.text, true); } return; }
      s.hp -= d;
      if (s.hp > 0) return;
      s.alive = false;
      this.fx.explosion(s.x, 1, s.z, Math.max(1.6, s.r * 0.45));
      this.fx.explosion(s.x + FL.rand(-2, 2), s.h * 0.6, s.z + FL.rand(-1, 1), Math.max(1.2, s.r * 0.3), true);
      for (let i = 0; i < 14; i++) this.fx.chunk(s.x + FL.rand(-s.r, s.r) * 0.6, FL.rand(1, s.h), s.z, 2);
      FL.audio.play(s.r > 6 ? 'bigboom' : 'boom');
      this.shake = 0.4;
      this.stage.scene.remove(s.mesh);
      const rb = FL.rubble(s.r, s.h); rb.position.copy(s.mesh.position); this.stage.add(rb);
      this.burning.push({ x: s.x, z: s.z, t: 12, size: Math.max(2, s.r * 0.5) });
      this.coins += s.key ? 10 : 3;
      if (s.key) {
        const left = this.keyLeft();
        if (left === 0) { this.endT = 3; FL.hud.msg('BASIS EROBERT!', C.gold); for (const e of this.enemies) if (!e.dead) { e.dead = true; this.fx.vanish(e.x, 0, e.z); this.stage.scene.remove(e.mesh); } }
        else FL.hud.msg('Gebäude zerstört! Noch ' + left, C.orange, true);
      }
    }
    onStructure(s, x, z, pad) { return s.flat ? Math.abs(x - s.x) < s.r + pad && Math.abs(z - s.z) < 1.3 + pad : Math.hypot(x - s.x, z - s.z) < s.r * 0.8 + pad; }
    explode(x, z, radius, dmg, y) {
      FL.audio.play('boom');
      this.shake = Math.max(this.shake, 0.22);
      this.fx.explosion(x, y || 0.3, z, radius / 3);
      for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - x, e.z - z) < radius + (e.vehicle ? 1.2 : 0)) this.damage(e, dmg);
      if (this.baseActive()) for (const s of this.structures) if (s.alive && this.onStructure(s, x, z, radius)) this.damageStructure(s, dmg * 1.5);
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
      m.down = true; m.downT = 0; m.revive = 0; m.moving = false;
      if (m.cover) { m.cover.by = null; m.cover = null; }
      FL.audio.play('pop');
      if (isVeh(m)) { this.fx.explosion(m.x, 1.5, m.z, 0.8, true); FL.hud.msg((m.kind === 'tank' ? 'Panzer' : m.kind === 'werfer' ? 'Raketenwerfer' : 'Geschützwagen') + ' beschädigt! Hingehen und E halten', C.red, true); }
      else FL.hud.msg('Kamerad getroffen! Hingehen und E halten', C.red, true);
    }
    // Steht m geduckt hinter einer Deckung, die zwischen ihm und dem Schützen liegt?
    covered(m, sx, sz) {
      if (isVeh(m) || !(m === this.hero ? this.ducking : m.crouch)) return 0;
      for (const c of this.covers) {
        const dx = c.x - m.x, dz = c.z - m.z;
        if (Math.hypot(dx, dz) < c.r + 1.9 && dx * (sx - m.x) + dz * (sz - m.z) > 0) return m === this.hero ? 1 : 0.7;
      }
      return m === this.hero ? 0.5 : 0.25;                             // geduckt ohne Deckung: schwerer zu treffen
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
      if (this.eshotT <= 0) { this.eshotT = 0.1; FL.audio.play(e.gun === 'rakete' ? 'rocket' : 'eshot'); }
      for (let k = 0; k < n; k++) {
        // etwas vorhalten, aber nicht perfekt: Wer in Bewegung bleibt, wird seltener getroffen
        const lead = FL.rand(0.1, 0.85);
        const tx = m.x + m.vx * T0 * lead + FL.rand(-spread, spread), tz = m.z + m.vz * T0 * lead + FL.rand(-spread, spread);
        const b = { sx: e.x, sz: e.z, sy: e.fort ? e.h : e.vehicle ? 1.8 : 1.35, tx, tz, t: -k * 0.1, T: Math.hypot(tx - e.x, tz - e.z) / speed, kind: e.gun, target: m };
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
    // Granaten, Raketen und Bomben im Bogen. tg = Gegner, Gebäude oder null (dann ein Stück voraus)
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
    fireTowers() {
      const lvl = this.lo.towers;
      if (!this.towersOn || !lvl || this.towerCd > 0 || this.endT >= 0) return;
      const guns = this.spgs.filter(v => !v.down);
      if (!guns.length) { FL.hud.msg('Die Geschützwagen müssen erst repariert werden', C.muted, true); return; }
      const tw = FL.TOWER_LEVELS[lvl - 1], tg = this.strongest();
      const st = this.baseActive() ? this.structures.filter(s => s.alive && s.key) : [];
      this.towerCd = tw.reload; this.shake = 0.15; FL.audio.play('cannon');
      guns.forEach((v, ti) => {
        for (let k = 0; k < tw.n; k++) {
          const i = ti * tw.n + k;
          this.lob(v.x, 3.2, v.z, tg.length ? tg[i % tg.length] : st.length ? st[i % st.length] : null, tw.dmg, tw.radius, tw.kind, k * 0.12, 1.1);
        }
        this.fx.spark(v.x, 3.4, v.z, 3);
      });
    }
    useSpecial(i) {
      const sp = FL.SPECIALS[i], lvl = this.lo[sp.id], h = this.hero;
      if (!lvl) { FL.hud.msg(sp.name + ' hast du noch nicht gekauft', C.muted, true); return; }
      if (this.specialCd[i] > 0 || this.endT >= 0) return;
      this.specialCd[i] = sp.reload * (lvl > 1 ? 0.7 : 1);
      FL.audio.play('up');
      if (i === 0) {
        for (let k = 0; k < 5; k++) { const mesh = FL.droneModel(); mesh.visible = false; this.stage.add(mesh); this.aircraft.push({ kind: 'drone', x: h.x + (k - 2) * 1.2, y: 3, z: h.z, t: -k * 0.15, life: 10, target: null, mesh }); }
        FL.hud.msg('Drohnen gestartet!', C.cyan, true);
      } else if (i === 1) {
        const mesh = FL.heliModel(); this.stage.add(mesh);
        this.aircraft.push({ kind: 'heli', a: h.th + Math.PI, y: 12, t: 0, life: 12, fire: 0, mesh, x: h.x, z: h.z });
        FL.hud.msg('Kampfhubschrauber gibt dir Deckung!', C.cyan, true);
      } else if (i === 3) {
        this.barrage = { n: 10, cd: 0.9 }; FL.audio.play('cannon'); FL.hud.msg('Artillerie feuert!', C.orange);
      } else {
        const mesh = FL.jetModel(0x6a7682, 0x3a4450); this.stage.add(mesh);
        this.aircraft.push({ kind: 'bomber', a: h.th, ox: h.x, oz: h.z, d: -70, y: 17, t: 0, life: 5.2, drop: 0, mesh, x: h.x, z: h.z });
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
      else if (code === 'KeyQ') {
        if (this.own.length < 2) { FL.hud.msg('Du hast noch keinen Trupp: Kameraden gibt es im Laden', C.muted, true); return; }
        this.order = ORDERS[(ORDERS.indexOf(this.order) + 1) % ORDERS.length];
        for (const m of this.own) { m.hx = m.x; m.hz = m.z; m.think = 0; }
        FL.audio.play('click');
        FL.hud.msg('Befehl: Der Trupp ' + ORDER_NAME[this.order], C.cyan, true);
      }
    }

    // Hindernisse schieben Figuren und Fahrzeuge zur Seite: Bäume, Felsen, Sandsäcke, Gebäude, Mauern
    pushOut(o, rad) {
      for (const s of this.solid) {
        if (!s.alive) continue;
        const dx = o.x - s.x, dz = o.z - s.z;
        if (s.flat) {
          const px = s.r + rad - Math.abs(dx), pz = 1.3 + rad - Math.abs(dz);
          if (px > 0 && pz > 0) { if (pz < px) o.z = s.z + (dz < 0 ? -1 : 1) * (1.3 + rad); else o.x = s.x + (dx < 0 ? -1 : 1) * (s.r + rad); }
        } else {
          const d = Math.hypot(dx, dz), min = (s.key !== undefined ? s.r * 0.8 : s.r) + rad;
          if (d < min && d > 0.01) { o.x = s.x + dx / d * min; o.z = s.z + dz / d * min; }
        }
      }
      o.x = FL.clamp(o.x, -EDGE - 30, EDGE + 30);
    }
    // Platz einer Einheit in der lockeren Formation. Sie richtet sich nach dem Ziel aus, nicht nach dem Blick des Kommandanten.
    slotPos(m) {
      if (this.order === 'hold') return [m.hx, m.hz];
      const h = this.hero, o = this.objective(), s = Math.sin(this.front), c = Math.cos(this.front);
      let ax = h.x, az = h.z;
      if (this.order === 'storm') {
        // vorstürmen: ein gutes Stück vor den Kommandanten, aber nicht mitten ins Ziel hinein
        const reach = Math.hypot(o.x - h.x, o.z - h.z) - (o.base ? 30 : 10), adv = FL.clamp(reach, 0, isVeh(m) ? 20 : 26);
        ax += s * adv; az += c * adv;
      }
      return [ax + c * m.slot[0] - s * m.slot[1], az - s * m.slot[0] - c * m.slot[1]];
    }

    // ---------------------------------------------------------------- Steuerung des Kommandanten
    control(dt, active) {
      const h = this.hero, x0 = h.x, z0 = h.z;
      this.ducking = active && FL.down('KeyC');
      const turn = active ? FL.clamp((FL.down('ArrowLeft') ? 1 : 0) - (FL.down('ArrowRight') ? 1 : 0) - FL.stick.x, -1, 1) : 0;
      h.th = wrap(h.th + turn * 2.3 * dt - (active ? FL.touch.swipe * 0.0052 : 0)); FL.touch.swipe = 0;
      let fwd = 0, side = 0;
      if (active && !this.ducking) {
        fwd = FL.clamp((FL.down('ArrowUp', 'KeyW') ? 1 : 0) - (FL.down('ArrowDown', 'KeyS') ? 1 : 0) + FL.stick.y, -1, 1);
        side = (FL.down('KeyD') ? 1 : 0) - (FL.down('KeyA') ? 1 : 0);
      }
      const s = Math.sin(h.th), c = Math.cos(h.th), v = fwd > 0 ? 6.2 * fwd : 4 * fwd;
      h.x += (s * v - c * side * 4.4) * dt; h.z += (c * v + s * side * 4.4) * dt;
      this.pushOut(h, 0.55);
      for (const m of this.vehicles) { const dx = h.x - m.x, dz = h.z - m.z, d = Math.hypot(dx, dz); if (d < 3 && d > 0.01) { h.x = m.x + dx / d * 3; h.z = m.z + dz / d * 3; } }
      const cx = FL.clamp(h.x, -EDGE, EDGE), cz = FL.clamp(h.z, -34, this.zMax);
      if (cx !== h.x || cz !== h.z) {
        h.x = cx; h.z = cz; this.warnT -= dt;
        if (this.warnT <= 0) { this.warnT = 3; FL.hud.msg('Hier endet das Einsatzgebiet', C.text, true); }
      }
      h.vx = dt > 0 ? (h.x - x0) / dt : 0; h.vz = dt > 0 ? (h.z - z0) / dt : 0;
      h.moving = Math.hypot(h.vx, h.vz) > 0.5;
      h.hp = Math.min(h.max, h.hp + (this.ducking ? 1.2 : 0.12) * dt);
      h.mesh.position.set(h.x, 0, h.z); h.mesh.rotation.y = h.th;
      h.mesh.visible = this.invuln <= 0 || Math.floor(this.t * 12) % 2 === 0;
      FL.animSoldier(h.mesh, this.t, h.moving, this.ducking);

      // zielen: Die Waffe rastet auf den Gegner ein, der am nächsten an der Blickrichtung liegt
      let lock = null, best = 1e9;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - h.x, e.z - h.z);
        if (d > 56 || d < 0.5) continue;
        const rel = Math.abs(wrap(Math.atan2(e.x - h.x, e.z - h.z) - h.th));
        if (rel > 0.22 + Math.atan2(e.r, d)) continue;
        const sc = rel * 60 + d * 0.3 - (e === this.lock ? 6 : 0);
        if (sc < best) { best = sc; lock = e; }
      }
      this.lock = lock;
      if (lock) { const q = FL.clamp(Math.hypot(lock.x - h.x, lock.z - h.z) * 0.06, 1.5, 4); this.aim.position.set(lock.x, lock.vehicle ? 1.6 : 1.2, lock.z); this.aim.scale.set(q, q, 1); this.aim.material.opacity = 1; }
      else { this.aim.position.set(h.x + s * 26, 1.3, h.z + c * 26); this.aim.scale.set(1.8, 1.8, 1); this.aim.material.opacity = 0.4; }
      this.aim.visible = active && !this.ducking;

      const w = FL.WEAPONS[this.lo.weapon];
      if (active && !this.ducking && FL.down('Space', 'Mouse0') && this.fireCd <= 0) {
        this.fireCd = w.rate; this.shotCount++;
        const tx = lock ? lock.x : h.x + s * 70, tz = lock ? lock.z : h.z + c * 70, ty = lock ? (lock.vehicle ? 1.4 : 1.2) : 1.4;
        for (let k = 0; k < w.shots; k++) {
          const off = (k - (w.shots - 1) / 2) * 0.3;
          this.addBullet(h.x + s * 0.9 - c * off, 1.45, h.z + c * 0.9 + s * off, tx, ty, tz, w.dmg, w.color, w.spread * 4);
        }
        if (w.rocket && this.shotCount % w.rocket === 0) this.addBullet(h.x + s * 0.9, 1.45, h.z + c * 0.9, tx, ty, tz, 4, 0xff9628, 0, true);
        this.muzzle.position.set(h.x + s * 1.15, 1.45, h.z + c * 1.15); this.muzzle.material.color.set(w.color); this.muzzle.visible = true; this.muzzleT = 0.05;
        FL.audio.play(this.lo.weapon === 4 || this.lo.weapon === 5 ? 'laser' : 'shot');
      }
      if (this.muzzleT <= 0) this.muzzle.visible = false;
    }

    // ---------------------------------------------------------------- Kameraden: lose folgen, Deckung suchen, abwechselnd vorrücken
    updateAllies(dt, active) {
      const h = this.hero, aw = FL.WEAPONS[Math.max(0, this.lo.weapon - 1)];
      this.allies.forEach((a, i) => {
        if (a.down) { a.vx = a.vz = 0; return; }
        a.think -= dt;
        if (a.think <= 0) {
          a.think = FL.rand(0.35, 0.6);
          a.threat = this.nearestFoe(a.x, a.z, 46);
          const [sx, sz] = this.slotPos(a);
          if (a.cover) { a.cover.by = null; a.cover = null; }
          a.gx = sx; a.gz = sz;
          const danger = a.threat || (this.baseActive() ? this.nearestStructure(a.x, a.z, 55) : null);
          if (danger) {
            // die nächste freie Deckung in der Nähe des eigenen Platzes nehmen und sich dahinter stellen
            let best = null, bd = this.order === 'hold' ? 7 : 13;
            for (const c of this.covers) { if (c.by) continue; const d = Math.hypot(c.x - sx, c.z - sz); if (d < bd) { bd = d; best = c; } }
            if (best) {
              const dx = best.x - danger.x, dz = best.z - danger.z, d = Math.hypot(dx, dz) || 1;
              best.by = a; a.cover = best; a.gx = best.x + dx / d * 1.5; a.gz = best.z + dz / d * 1.5;
            }
          }
        }
        const x0 = a.x, z0 = a.z;
        const dx = a.gx - a.x, dz = a.gz - a.z, d = Math.hypot(dx, dz), far = Math.hypot(h.x - a.x, h.z - a.z);
        // Bei Feindkontakt rückt immer nur die Hälfte vor, die andere gibt Feuerschutz
        const wait = a.threat && d < 16 && d > 1 && (i + Math.floor(this.t / 2.4)) % 2 === 0;
        a.moving = active && d > (a.moving ? 0.4 : 1.6) && !wait;
        if (a.moving) {
          const v = Math.min(d / dt, far > 40 ? 8.5 : d > 9 ? 7 : a.threat ? 4.8 : 5.6);
          a.x += dx / d * v * dt; a.z += dz / d * v * dt;
          for (const o of this.own) if (o !== a && !isVeh(o)) { const ex = a.x - o.x, ez = a.z - o.z, e = Math.hypot(ex, ez); if (e < 1.1 && e > 0.01) { a.x += ex / e * (1.1 - e) * 0.5; a.z += ez / e * (1.1 - e) * 0.5; } }
          this.pushOut(a, 0.5);
        }
        a.vx = (a.x - x0) / dt; a.vz = (a.z - z0) / dt;
        // schießen: auf Gegner in Reichweite, sonst vor der Basis auf das nächste Gebäude
        let tg = a.threat && !a.threat.dead && Math.hypot(a.threat.x - a.x, a.threat.z - a.z) < 44 ? a.threat : null, st = null;
        if (!tg && this.baseActive()) st = this.nearestStructure(a.x, a.z, 48);
        a.crouch = !a.moving && !!(tg || st);
        const look = tg || st;
        const want = look && !a.moving ? Math.atan2(look.x - a.x, look.z - a.z) : a.moving ? Math.atan2(dx, dz) : this.front;
        a.th = wrap(a.th + FL.clamp(wrap(want - a.th), -7 * dt, 7 * dt));
        a.fireCd -= dt;
        if (active && look && a.fireCd <= 0 && (!a.moving || d < 4)) {
          a.fireCd = aw.rate * 1.4 * FL.rand(0.9, 1.15);
          const s = Math.sin(a.th), c = Math.cos(a.th);
          const tx = tg ? tg.x : st.x + FL.rand(-0.6, 0.6) * st.r, ty = tg ? (tg.vehicle ? 1.4 : 1.2) : FL.rand(1, Math.min(4, st.h)), tz = tg ? tg.z : st.z;
          for (let k = 0; k < aw.shots; k++) this.addBullet(a.x + s * 0.8, 1.3, a.z + c * 0.8, tx, ty, tz, aw.dmg, aw.color, 3.5);
        }
        a.mesh.position.set(a.x, 0, a.z); a.mesh.rotation.y = a.th;
        FL.animSoldier(a.mesh, this.t + i, a.moving, a.crouch);
      });
    }

    // ---------------------------------------------------------------- Fahrzeuge: fahren hinterher, halten Abstand, bleiben zum Schießen stehen
    updateVehicles(dt, active) {
      const h = this.hero;
      for (const v of this.vehicles) {
        if (v.down) { v.vx = v.vz = 0; if (Math.random() < dt * 4) this.fx.smoke(v.x, 2, v.z, 1.6); continue; }
        v.think -= dt;
        if (v.think <= 0) {
          v.think = 0.5;
          [v.gx, v.gz] = this.slotPos(v);
          v.threat = v.kind === 'spg' ? null : this.heavyTarget(v.x, v.z, v.kind === 'tank' ? 58 : 80);
        }
        const x0 = v.x, z0 = v.z, tg = v.threat && (v.threat.dead || v.threat.alive === false) ? null : v.threat;
        const dx = v.gx - v.x, dz = v.gz - v.z, d = Math.hypot(dx, dz);
        const engaged = tg && Math.hypot(tg.x - v.x, tg.z - v.z) < (v.kind === 'tank' ? 44 : 70);
        v.moving = active && d > (v.moving ? 2 : 6) && !(engaged && d < 30) && Math.hypot(h.x - v.x, h.z - v.z) > 5;
        if (v.moving) {
          const want = Math.atan2(dx, dz), diff = wrap(want - v.th);
          v.th = wrap(v.th + FL.clamp(diff, -1.3 * dt, 1.3 * dt));
          const sp = (v.kind === 'tank' ? 6.4 : 5.8) * (Math.abs(diff) < 0.5 ? 1 : Math.abs(diff) < 1.2 ? 0.45 : 0.1) * (d > 30 ? 1.35 : 1);
          v.x += Math.sin(v.th) * sp * dt; v.z += Math.cos(v.th) * sp * dt;
          this.pushOut(v, 2.3);
          for (const o of this.vehicles) if (o !== v) { const ex = v.x - o.x, ez = v.z - o.z, e = Math.hypot(ex, ez); if (e < 6 && e > 0.01) { v.x = o.x + ex / e * 6; v.z = o.z + ez / e * 6; } }
          if (Math.random() < dt * 5) this.fx.dust(v.x - Math.sin(v.th) * 2.4, 0.2, v.z - Math.cos(v.th) * 2.4, 1.2);
        }
        v.vx = (v.x - x0) / dt; v.vz = (v.z - z0) / dt;
        v.mesh.position.set(v.x, 0, v.z); v.mesh.rotation.y = v.th;
        v.fireCd -= dt;
        if (v.kind === 'tank') {
          FL.setTurret(v.mesh, tg ? wrap(Math.atan2(tg.x - v.x, tg.z - v.z) - v.th) : 0, 0);
          if (active && tg && v.fireCd <= 0) { v.fireCd = 1.8; FL.audio.play('cannon'); this.lob(v.x, 2, v.z, tg, 8, 3.4, 'shell', 0, 0.6); this.fx.spark(v.x, 2.2, v.z, 2.5); }
        } else if (v.kind === 'werfer' && active && tg && v.fireCd <= 0) {
          v.fireCd = 4.5;
          const s = this.strongest(4).filter(e => Math.hypot(e.x - v.x, e.z - v.z) < 85);
          for (let k = 0; k < 4; k++) this.lob(v.x, 2.6, v.z, s.length ? s[k % s.length] : tg, 6, 3.6, 'rocket', k * 0.15);
        }
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
            if (e.vehicle && Math.random() < dt * 4) this.fx.dust(e.x, 0.2, e.z, 1.2);
          }
          e.fireCd -= dt;
          if (d < e.reach && e.fireCd <= 0) { e.fireCd = FL.rand(0.7, 1.3) / (e.rate * rate) * (moving ? 1.6 : 1); this.enemyFire(e, tg); }
        }
        // Wer sich verlaufen hat und weit weg von allem steht, zählt nicht mehr mit
        if (e.age > 100 && !e.guard && Math.hypot(e.x - h.x, e.z - h.z) > 110) { e.dead = true; this.stage.scene.remove(e.mesh); continue; }
        e.mesh.position.set(e.x, 0, e.z); e.mesh.rotation.y = e.th;
        if (!e.vehicle) FL.animSoldier(e.mesh, this.t, moving, false);
        if (e.bar) e.bar.rotation.y = h.th - e.th;
      }
      // Türme, Tor und Hauptgebäude der Basis schießen auf alles, was nah genug herankommt
      this.fortCd -= dt;
      if (this.fortCd <= 0 && active) {
        const guns = this.structures.filter(s => s.alive && (s.kind === 'tower' || s.kind === 'hq' || s.kind === 'barracks' && s.key && s.max > 40 || s.kind === 'bunker' || s.kind === 'gate'));
        this.fortCd = guns.length ? Math.max(1.6, 6.5 / guns.length) : 99;
        if (guns.length) {
          const s = FL.pick(guns), m = this.pickOwn(s.x, s.z, 52);
          if (m) this.enemyFire({ x: s.x, z: s.z - (s.flat ? 1.5 : s.r * 0.8), h: Math.min(s.h, 5), gun: s.kind === 'tower' || s.kind === 'gate' ? 'mg' : 'granate', fort: true }, m);
        }
      }
    }

    // ---------------------------------------------------------------- Gebiete sichern, Verstärkung, Sieg
    updateObjective(dt, active) {
      const o = this.objective(), h = this.hero, dObj = Math.hypot(o.x - h.x, o.z - h.z);
      // Die Formation zeigt zum Ziel. Steht man schon mittendrin, bleibt sie, wie sie war.
      if (dObj > 22) this.front = wrap(this.front + FL.clamp(wrap(Math.atan2(o.x - h.x, o.z - h.z) - this.front), -1.2 * dt, 1.2 * dt));
      const mine = this.enemies.filter(e => !e.dead && e.zone === o).length;
      o.left = mine + (o.base ? 0 : o.reserve);
      if (!active) return;
      const contact = dObj < (o.base ? 75 : 52);
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
      this.beacon.scale.set(q, q, 1); this.beacon.position.set(o.x, (o.base ? 9 : 8.5) + q * 0.6, o.z);
      this.beacon.visible = this.endT < 0 && dObj > (o.base ? 40 : ZONE_R);
    }
    secure(z) {
      z.done = true; this.section++; this.capT = 0; this.secT = 0; this.spawnCd = 4;
      z.ring.material.color.set(0x5fd07a); z.ring.material.opacity = 0.45; z.flag.material = FL.mat(0x2a6fd0);
      this.coins += 10; this.hero.hp = this.hero.max;
      for (const m of this.own) if (m.down) { m.down = false; m.hp = m.max; } else m.hp = m.max;
      FL.audio.play('up');
      FL.hud.msg('Gebiet gesichert!', C.green);
      FL.hud.msg(this.section >= this.zones.length ? 'Jetzt die Basis: Zerstöre alle Gebäude!' : 'Weiter zum nächsten Gebiet', this.section >= this.zones.length ? C.red : C.gold, true);
    }

    // ---------------------------------------------------------------- ein Zeitschritt
    update(dt) {
      if (this.result) return;
      const fx = this.fx, h = this.hero;
      this.t += dt; this.fireCd -= dt; this.muzzleT -= dt; this.eshotT -= dt; this.noteT -= dt;
      this.towerCd = Math.max(0, this.towerCd - dt); this.shake = Math.max(0, this.shake - dt); this.invuln = Math.max(0, this.invuln - dt);
      for (let i = 0; i < 4; i++) this.specialCd[i] = Math.max(0, this.specialCd[i] - dt);
      for (const s of this.spinners) s.rotation.y += dt * 1.5;
      if (this.endT >= 0) { this.endT -= dt; if (this.endT <= 0) { this.result = 'win'; return; } }
      const active = this.endT < 0;

      this.control(dt, active);
      this.updateObjective(dt, active);
      this.updateAllies(dt, active);
      this.updateVehicles(dt, active);
      this.updateEnemies(dt, active);

      // Kameraden aufhelfen, Fahrzeuge reparieren (E halten). Nach einer Weile rappeln sie sich auch selbst wieder auf.
      let helping = null, hd = 3.4;
      if (active && FL.down('KeyE')) for (const m of this.own) if (m.down) { const d = Math.hypot(m.x - h.x, m.z - h.z) - (isVeh(m) ? 2 : 0); if (d < hd) { hd = d; helping = m; } }
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
        m.icon.scale.set(q, q, 1); m.icon.position.set(m.x, veh ? 4 : 2.3, m.z);
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

      // eigene Kugeln
      for (const b of this.bullets) {
        b.life -= dt;
        for (let i = 0; i < 2 && !b.gone; i++) {
          b.x += b.vx * dt / 2; b.y += b.vy * dt / 2; b.z += b.vz * dt / 2;
          for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - b.x, e.z - b.z) < e.r + 0.3 && b.y < (e.vehicle ? 3.2 : 2.4)) {
            b.gone = true;
            if (b.rocket) this.explode(b.x, b.z, 3.2, b.dmg); else { this.damage(e, b.dmg); fx.spark(b.x, b.y, b.z, 0.7); }
            break;
          }
          if (!b.gone && b.z > this.baseZ - 4) for (const s of this.structures) if (s.alive && b.y < s.h + 1 && this.onStructure(s, b.x, b.z, 0)) {
            b.gone = true; this.damageStructure(s, b.rocket ? b.dmg * 3 : b.dmg);
            fx.spark(b.x, b.y, b.z, 1.1);
            if (b.rocket) fx.explosion(b.x, 2, b.z, 0.7, true);
            break;
          }
        }
        if (b.life <= 0 || b.y < 0) b.gone = true;
        if (b.gone) fx.freeShot(b.mesh);
        else { b.mesh.position.set(b.x, b.y, b.z); b.mesh.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz); }
      }
      this.bullets = this.bullets.filter(b => !b.gone);

      // gegnerische Kugeln, Raketen, Granaten: Sie fliegen dorthin, wo beim Abschuss gezielt wurde. Wer weg ist, wird nicht getroffen.
      for (const b of this.ebullets) {
        b.t += dt;
        if (b.t < 0) continue;
        const k = Math.min(1, b.t / b.T), x = FL.lerp(b.sx, b.tx, k), z = FL.lerp(b.sz, b.tz, k);
        const y = FL.lerp(b.sy, 1.2, k) + (b.kind === 'granate' ? Math.sin(k * Math.PI) * 4 : 0);
        b.mesh.visible = true; b.mesh.position.set(x, y, z);
        if (b.kind === 'granate') FL.aimShell(b, x, y, z); else b.mesh.rotation.y = Math.atan2(b.tx - b.sx, b.tz - b.sz);
        if (b.kind === 'rakete' && Math.random() < 0.5) fx.puff('white', x, y, z, 0.5, 0.4, 0, 0.3, 0, 1.5);
        if (k < 1) continue;
        b.gone = true;
        const m = b.target, heavy = b.kind === 'rakete' || b.kind === 'granate';
        if (heavy) {
          const r = b.kind === 'rakete' ? 1.6 : 2.1;
          fx.explosion(x, 0.3, z, 0.6); FL.audio.play('boom');
          for (const o of this.own) if (Math.hypot(o.x - x, o.z - z) < r + (isVeh(o) ? 1.6 : 0) && this.covered(o, b.sx, b.sz) < 1) this.hurt(o, 2);
          this.stage.scene.remove(b.mesh);
        } else {
          if (!m.down && Math.hypot(m.x - x, m.z - z) < (isVeh(m) ? 2.2 : 0.8)) {
            if (Math.random() < this.covered(m, b.sx, b.sz)) { FL.audio.play('ping'); fx.spark(x, 0.9, z, 0.9); }
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
        const x = FL.lerp(s.sx, s.tx, k), y = FL.lerp(s.sy, 0.3, s.kind === 'bomb' ? k * k : k) + arc, z = FL.lerp(s.sz, s.tz, k);
        s.mesh.position.set(x, y, z); if (s.kind !== 'bomb') FL.aimShell(s, x, y, z);
        if (s.kind === 'rocket' && Math.random() < dt * 30) fx.puff('smoke', x, y, z, 0.7, 0.5, 0, 0.3, 0, 1);
        if (k >= 1) { s.gone = true; this.stage.scene.remove(s.mesh); this.explode(s.tx, s.tz, s.radius, s.dmg); }
      }
      this.shells = this.shells.filter(s => !s.gone);
      this.enemies = this.enemies.filter(e => !e.dead);

      for (const b of this.burning) { b.t -= dt; if (Math.random() < dt * 5) fx.smoke(b.x + FL.rand(-1, 1) * b.size * 0.5, 1, b.z, b.size); }
      this.burning = this.burning.filter(b => b.t > 0);
      this.heroCover = this.ducking && this.covers.some(c => Math.hypot(c.x - h.x, c.z - h.z) < c.r + 1.9);

      fx.update(dt);
      this.updateCamera(dt);
      this.updateHud();
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
          const tx = tg ? tg.x : a.x + Math.sin(h.th) * 6, ty = tg ? (tg.h ? 2 : 1) : a.y, tz = tg ? tg.z : a.z + Math.cos(h.th) * 6;
          const dx = tx - a.x, dy = ty - a.y, dz = tz - a.z, d = Math.hypot(dx, dy, dz) || 1, step = 30 * dt;
          a.x += dx / d * Math.min(step, d); a.y += dy / d * Math.min(step, d); a.z += dz / d * Math.min(step, d);
          a.mesh.rotation.y = Math.atan2(dx, dz);
          if (tg && d < 1.2 + (tg.h ? tg.r * 0.7 : 0)) { a.life = 0; this.explode(a.x, a.z, 3, 10, a.y); }
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
      const s = Math.sin(this.camTh), c = Math.cos(this.camTh), sh = this.shake > 0 ? this.shake * 1.1 : 0;
      cam.position.set(h.x - s * 8.6 + FL.rand(-sh, sh), 5.4 + FL.rand(-sh, sh), h.z - c * 8.6);
      cam.lookAt(h.x + s * 15, 1.5, h.z + c * 15);
      this.stage.update(new THREE.Vector3(h.x + s * 14, 0, h.z + c * 14));
    }

    updateHud() {
      const lo = this.lo, H = FL.hud, w = FL.WEAPONS[lo.weapon], h = this.hero, hp = h.hp / h.max, o = this.objective();
      const squad = this.own.length - 1, up = this.up().length - 1;
      let tl = `<div class="hud-big"><span class="coins">${this.coins}</span></div><div>Leben ${H.hearts(this.lives, 4 + lo.lives)}</div>`;
      tl += `<div>Gesundheit</div>${H.meter(hp, hp < 0.3 ? 'red' : hp < 0.6 ? 'gold' : '')}`;
      tl += `<div><b style="color:#${w.color.toString(16).padStart(6, '0')}">${w.name}</b>${squad ? ` · Trupp ${up}/${squad} <b style="color:#46dcff">${ORDER_NAME[this.order]}</b>` : ''}</div>`;
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
        tc += `<div>Gegnerische Basis · noch ${this.keyLeft()} Gebäude ${dObj > 45 ? arrow : ''}</div>${H.meter(frac, 'red')}`;
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
      H.set(this.hInfo, tr);
      const items = [];
      for (const z of this.zones) items.push({ x: z.x, z: z.z, color: z.done ? '#5fd07a' : '#ffc43c', size: z === o ? 8 : 6, far: z === o, ring: true });
      for (const s of this.structures) if (s.alive && s.key) items.push({ x: s.x, z: s.z, color: '#ff8c3c', size: 3.5, far: o.base && s.kind !== 'tower' && s.kind !== 'gate' ? false : o.base && s.kind === 'gate' });
      if (o.base && !this.structures[0].alive) items.push({ x: o.x, z: o.z + 10, color: '#ff8c3c', size: 6, far: true, ring: true });
      for (const m of this.own) if (m !== h) items.push({ x: m.x, z: m.z, color: m.down ? '#ffffff' : '#46dcff', size: isVeh(m) ? 3.5 : 2.2 });
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
      this.hCover.style.display = this.ducking ? '' : 'none';
      H.set(this.hCover, this.heroCover ? 'IN DECKUNG' : 'GEDUCKT');
    }

    destroy() { this.stage.dispose(); }
  };

  // ---------------------------------------------------------------- Steuerung per Finger für den Kommandanten
  // Links der runde Steuerknüppel (vor/zurück laufen, links/rechts drehen), auf dem freien Bildschirm wischen = umsehen,
  // nach unten wischen und halten = Deckung. Die Knöpfe drücken wie überall einfach die passenden Tasten.
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
    // umsehen und Deckung auf dem freien Bildschirm
    const area = FL.el('div', 'tswipe', ''); L.insertBefore(area, L.firstChild);
    let sw = null;
    const end = e => { if (sw && e.pointerId === sw.id) { if (sw.cover) release('KeyC'); sw = null; } };
    area.addEventListener('pointerdown', e => { if (!sw) sw = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, cover: false }; });
    area.addEventListener('pointermove', e => {
      if (!sw || e.pointerId !== sw.id) return;
      const dy = e.clientY - sw.y0, dx = e.clientX - sw.x0;
      if (!sw.cover && dy > 55 && dy > Math.abs(dx) * 1.5) { sw.cover = true; press('KeyC'); }
      else if (sw.cover && dy < 15) { sw.cover = false; release('KeyC'); }
      if (!sw.cover) T.swipe += e.clientX - sw.x;
      sw.x = e.clientX;
    });
    area.addEventListener('pointerup', end); area.addEventListener('pointercancel', end);
    T.endSwipe = () => { if (sw && sw.cover) release('KeyC'); sw = null; };
    // runder Steuerknüppel
    const left = FL.el('div', 'tpad tleft', '', L), right = FL.el('div', 'tpad tright', '', L);
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
      // kleine Ausschläge zur Seite sollen beim Geradeauslaufen nicht gleich drehen
      FL.stick.x = Math.abs(x) < 0.25 ? 0 : Math.sign(x) * (Math.abs(x) - 0.25) / 0.75; FL.stick.y = y;
    };
    const endS = e => { if (e.pointerId !== sid) return; sid = null; FL.stick.x = FL.stick.y = 0; knob.style.transform = ''; stick.classList.remove('on'); };
    stick.addEventListener('pointerdown', e => { if (sid !== null) return; e.preventDefault(); sid = e.pointerId; try { stick.setPointerCapture(sid); } catch (err) {} stick.classList.add('on'); setS(e); });
    stick.addEventListener('pointermove', e => { if (e.pointerId === sid) setS(e); });
    stick.addEventListener('pointerup', endS); stick.addEventListener('pointercancel', endS);
    make(right, 'FEUER', 'Space', 'fire');
    make(right, 'Deckung', 'KeyC', 'wide cover');
    const extra = FL.el('div', 'textra', '', right);
    make(extra, 'Helfen', 'KeyE', 'small');
    if (lo.allies || lo.tank || lo.werfer || lo.towers) make(extra, 'Trupp', 'KeyQ', 'small cyan', true);
    if (lo.towers) make(extra, 'Geschütz', 'KeyX', 'small cyan', true);
    FL.SPECIALS.forEach(sp => { if (lo[sp.id]) make(extra, sp.key, 'Digit' + sp.key, 'small orange', true); });
  };
})();
