'use strict';
// Frontlinie 3 – Basis verteidigen mit Rundumsicht: Die eigene Basis liegt in der Mitte eines offenen Feldes.
// Gegner kommen von mehreren Seiten gleichzeitig, dazu Hubschrauber und Flugzeuge. Das Radar zeigt, von wo.
// Richtung wie überall: Blickwinkel th zeigt nach (sin th, cos th), nach links drehen vergrößert th.
(() => {
  const C = { gold: '#ffc43c', red: '#ef5a4c', green: '#5fd07a', cyan: '#46dcff', text: '#e9eef2', orange: '#ff8c3c', muted: '#9fb0bd' };
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const SPAWN_R = 66, VIEW = 80;
  const COMPASS = { 0: 'Norden', 1: 'Nordwesten', 2: 'Westen', 3: 'Südwesten', 4: 'Süden', '-4': 'Süden', '-3': 'Südosten', '-2': 'Osten', '-1': 'Nordosten' };
  const compass = a => COMPASS[Math.round(wrap(a) / (Math.PI / 4))];
  const P = (a, r) => [Math.sin(a) * r, Math.cos(a) * r];

  FL.BaseDefense = class {
    constructor(cfg, lo) {
      this.cfg = cfg; this.lo = lo; this.result = null; this.kind = 'defend';
      this.tier = cfg.tier; this.diff = cfg.diff || 0.85; this.nWaves = cfg.waves || 3;
      // Wer alles ausgebaut hat, bekommt mehr und stärkere Gegner
      this.pw = (lo.weapon / 6 + lo.allies / 6 + lo.towers / 5 + (lo.tank + lo.werfer) / 2 + lo.mgnest / 2) / 5;
      this.armor = (1 + 0.35 * this.tier) * (1 + 0.45 * this.pw);
      this.towersOn = cfg.towersOn !== false;
      const st = this.stage = new FL.Stage(cfg.theme, { far: 650, shadow: 70 });
      this.fx = new FL.FX(st);
      this.t = 0; this.secT = 0; this.th = 0; this.kills = 0; this.coins = 0;
      this.baseMax = this.baseHp = Math.round(100 + 50 * lo.bunker + 15 * this.tier);
      this.fireCd = 0; this.towerCd = 0; this.specialCd = [0, 0, 0, 0]; this.barrage = null;
      this.invuln = 0; this.ducking = false; this.shake = 0; this.endT = -1; this.eshotT = 0;
      this.enemies = []; this.air = []; this.bullets = []; this.ebullets = []; this.shells = []; this.aircraft = []; this.spinners = [];
      this.wave = 0; this.waveSpawned = 0; this.waveSize = 0; this.waveBreak = 0; this.dirs = []; this.airPlan = [];
      this.lock = null;
      this.buildBase();
      this.buildHud();
      this.startWave();
      this.updateCamera(0);
    }

    // ---------------------------------------------------------------- Aufbau
    buildBase() {
      const st = this.stage, th = this.cfg.theme, lo = this.lo, rnd = FL.seeded(31 + th.length * 5);
      st.add(st.ground(1800, FL.tex.ground(th), 18));
      st.add(st.strip(11, 420, FL.tex.road(th), 11, 12, 0, 0, 0.05));
      const cross = st.strip(11, 420, FL.tex.road(th), 11, 12, 0, 0, 0.07); cross.rotation.z = Math.PI / 2; st.add(cross);
      const put = (kind, a, r, rot, opt) => {
        const b = FL.building(kind, th, opt), [x, z] = P(a, r);
        b.position.set(x, 0, z); b.rotation.y = rot === undefined ? a + Math.PI : rot; st.add(b);
        if (b.userData.spin) this.spinners.push(b.userData.spin);
        return b;
      };
      const D = Math.PI / 4;
      // Gebäude stehen schräg zwischen den vier Wegen, damit der Blick in alle Richtungen frei bleibt
      this.sites = [];
      const site = (kind, a, r, rot, opt) => { const b = put(kind, a, r, rot, opt); this.sites.push({ x: b.position.x, z: b.position.z, h: b.userData.h || 3 }); return b; };
      site('hq', D, 27); site('barracks', 3 * D, 26); site('tent', -3 * D, 19); site('tent', -D, 19);
      for (let i = 0; i < lo.bunker; i++) site('bunker', [D * 0.45, -D * 2.5, D * 2.5][i], 31);
      if (lo.radar) site('radar', -D * 1.45, 26);
      if (lo.medic) site('medtent', -3 * D + 0.42, 26);
      // Sandsackring um den eigenen Stand, mit Lücken an den Wegen
      for (let i = 0; i < 4; i++) put('sandbags', D + i * 2 * D, 5.2, D + i * 2 * D, { len: 5.5 });
      { const [px, pz] = P(D, 19); st.add(FL.cyl(0.08, 0.08, 9, 5, FL.mat(0xcccccc), px, 4.5, pz)); st.add(FL.box(2.4, 1.4, 0.06, FL.mat(0x2a6fd0), px + 1.2, 8.2, pz)); }
      // Geschütztürme, MG-Nester, Kameraden, Fahrzeuge
      this.towers = [];
      if (lo.towers > 0) { const tw = FL.TOWER_LEVELS[lo.towers - 1]; for (let i = 0; i < tw.count; i++) this.towers.push(put('cannon', i ? -D : 3 * D, 13.5, 0, { level: lo.towers })); }
      this.nests = [];
      for (let i = 0; i < lo.mgnest; i++) { const n = put('mgnest', i ? Math.PI + D : D, 10.5, i ? Math.PI + D : D); this.nests.push({ mesh: n, x: n.position.x, z: n.position.z, cd: 0 }); }
      const mk = (kind, a, r, hp, mesh) => { const [x, z] = P(a, r); mesh.position.set(x, 0, z); mesh.rotation.y = a; st.add(mesh); return { kind, x, z, a, hp, max: hp, down: false, downT: 0, fireCd: FL.rand(0.4, 1.2), mesh }; };
      this.hero = { hp: 8 + 3 * lo.vest, max: 8 + 3 * lo.vest, mesh: FL.soldier({ team: 'hero', weapon: lo.weapon }) };
      st.add(this.hero.mesh);
      this.allies = [];
      for (let i = 0; i < lo.allies; i++) this.allies.push(mk('ally', (i + 0.5) / Math.max(1, lo.allies) * 6.283, 7.2, 3, FL.soldier({ team: 'ally', weapon: Math.max(0, lo.weapon - 1) })));
      this.vehicles = [];
      if (lo.tank) { const v = mk('tank', 0.5, 13, 25, FL.tankModel(FL.PAL.ally)); v.mesh.scale.setScalar(0.8); this.vehicles.push(v); }
      if (lo.werfer) { const v = mk('werfer', Math.PI + 0.5, 13, 20, FL.werferModel(FL.PAL.ally)); v.mesh.scale.setScalar(0.8); this.vehicles.push(v); }
      // offenes Feld: nur lockere Baumgruppen, dichter Wald erst weit draußen
      for (let i = 0; i < 230; i++) {
        const a = rnd() * 6.283, far = i > 70, r = far ? 95 + rnd() * 190 : 34 + rnd() * 60, [x, z] = P(a, r);
        if (Math.abs(x) < 9 || Math.abs(z) < 9) continue;
        const t = FL.tree(FL.pick(st.theme.trees), rnd); t.position.set(x, 0, z);
        st.add(r > 60 ? FL.noShadow(t) : t);
      }
      this.aim = FL.sprite(FL.tex.icon('target'), 2.2, { depthTest: false, fog: false }); st.add(this.aim);
      this.muzzle = FL.sprite(FL.tex.icon('glow'), 1.2, { add: true }); this.muzzle.visible = false; st.add(this.muzzle); this.muzzleT = 0;
    }
    buildHud() {
      FL.hud.clear();
      this.hTL = FL.hud.box('hud-tl'); this.hTC = FL.hud.box('hud-tc'); this.hTR = FL.hud.box('hud-tr');
      this.hInfo = FL.el('div', '', '', this.hTR);
      this.map = FL.el('canvas', 'minimap', null, this.hTR); this.map.width = this.map.height = 170;
      this.hBC = FL.hud.box('hud-bc');
      FL.hud.box('hud-bl').innerHTML = '← → umsehen (rundum) · Leertaste oder Mausklick schießen · ↓ Deckung · X Geschütze · 1 2 3 4 Unterstützung · Radar oben rechts: rot = Gegner, pink = Flugzeuge · P Pause';
      this.hCover = FL.el('div', 'cover-note', 'IN DECKUNG', FL.hud.root);
    }

    // ---------------------------------------------------------------- Stärke
    weaponDps(lvl, slow) { const w = FL.WEAPONS[lvl]; return w.dmg * w.shots / (w.rate * (slow || 1)); }
    armyDps() {
      const lo = this.lo;
      let dps = this.weaponDps(lo.weapon) * 0.42;
      dps += this.allies.filter(a => !a.down).length * this.weaponDps(Math.max(0, lo.weapon - 1), 1.4) * 0.45;
      for (const v of this.vehicles) dps += v.kind === 'tank' ? 3.5 : 4;
      if (this.towersOn && lo.towers > 0) { const tw = FL.TOWER_LEVELS[lo.towers - 1]; dps += tw.count * tw.n * tw.dmg / tw.reload * 0.5; }
      return dps + lo.mgnest * 3;
    }
    weights() { return FL.enemyWeights(this.tier + this.wave * 0.3); }
    spawnDelay() {
      const w = this.weights();
      let total = 0, hp = 0;
      for (const k in w) { total += w[k]; hp += w[k] * FL.ENEMIES[k].hp; }
      const avg = hp / total * this.armor;
      const wanted = (0.5 + 0.1 * this.tier + this.secT / 50) * (1 + 1.2 * this.pw);
      const possible = this.diff * this.armyDps() / avg;
      return FL.clamp(1 / Math.min(wanted, possible), 0.2, 2.8) * FL.rand(0.75, 1.25);
    }
    alive() { return this.enemies.filter(e => !e.dead); }

    // ---------------------------------------------------------------- Wellen
    startWave() {
      this.wave++; this.waveSpawned = 0; this.secT = 0; this.spawnCd = 3.5;
      this.waveSize = Math.round((14 + 5 * (this.wave - 1) + 5 * this.tier) * (1 + 0.6 * this.pw));
      // zwei Seiten gleichzeitig, später drei und vier
      const n = Math.min(4, 2 + Math.floor((this.wave - 1) / 2) + (this.tier >= 3 ? 1 : 0)), all = [0, 1, 2, 3, 4, -3, -2, -1].map(i => i * Math.PI / 4);
      this.dirs = [];
      while (this.dirs.length < n) { const a = FL.pick(all); if (this.dirs.every(d => Math.abs(wrap(d - a)) > 1.2)) this.dirs.push(a); }
      // Angriffe aus der Luft: ab der zweiten Welle immer, bei schweren Einsätzen schon in der ersten
      const helis = this.wave >= 2 ? FL.clamp(Math.round((this.wave - 1) * 0.6 + this.tier * 0.3), 1, 3) : this.tier >= 1.5 ? 1 : 0;
      const jets = this.wave >= 2 ? FL.clamp(Math.round((this.wave - 1) * 0.5 + this.tier * 0.25), 1, 3) : this.tier >= 2.5 ? 1 : 0;
      this.airPlan = [];
      for (let i = 0; i < helis; i++) this.airPlan.push({ kind: 'heli', t: 9 + i * 14 + FL.rand(0, 5) });
      for (let i = 0; i < jets; i++) this.airPlan.push({ kind: 'jet', t: 15 + i * 13 + FL.rand(0, 5) });
      FL.hud.msg('Welle ' + this.wave + ' von ' + this.nWaves, C.gold);
      FL.hud.msg('Gegner aus ' + this.dirs.map(compass).join(' und ') + '!', C.red, true);
      FL.audio.play('alarm');
    }
    spawnEnemy() {
      const kind = FL.weighted(this.weights()), d = FL.ENEMIES[kind];
      const a = FL.pick(this.dirs) + FL.rand(-0.42, 0.42), [x, z] = P(a, SPAWN_R + FL.rand(0, 8));
      const e = {
        kind, vehicle: !!d.vehicle, gun: d.gun, rate: d.rate, pts: d.pts, x, z, y: 0, a,
        hp: Math.max(1, Math.round(d.hp * this.armor)), speed: d.speed * 1.15 * (1 + this.tier * 0.03) * FL.rand(0.9, 1.1),
        stop: d.vehicle ? FL.rand(21, 27) : FL.rand(12.5, 18), fireCd: FL.rand(0.4, 2), drift: FL.rand(-0.25, 0.25), r: d.vehicle ? 2.4 : 0.9
      };
      e.max = e.hp;
      if (e.vehicle) { e.mesh = (kind === 'jeep' ? FL.jeepModel : FL.tankModel)(FL.PAL.enemy(this.cfg.theme)); e.mesh.scale.setScalar(0.8); }
      else e.mesh = FL.soldier({ team: 'enemy', kind, theme: this.cfg.theme });
      if (e.max > 1) { e.bar = FL.box(1, 0.09, 0.03, FL.basic(0xf05a46), 0, e.vehicle ? 3.4 : 2.25, 0); e.bar.castShadow = false; e.mesh.add(e.bar); }
      e.mesh.position.set(x, 0, z); e.mesh.rotation.y = a + Math.PI;
      this.stage.add(e.mesh); this.enemies.push(e); this.waveSpawned++;
    }
    spawnAir(kind) {
      const a = FL.pick(this.dirs) + FL.rand(-0.5, 0.5), heli = kind === 'heli';
      const mesh = heli ? FL.heliModel() : FL.jetModel(0x7a3a30, 0xb03020);
      if (!heli) mesh.scale.setScalar(0.9);
      const [x, z] = P(a, heli ? 120 : 210);
      const u = { kind, air: true, x, z, y: heli ? 13 : 24, a, hp: (heli ? 8 + 2.5 * this.lo.weapon : 5 + 1.5 * this.lo.weapon) * this.armor, r: heli ? 3.4 : 3.2, mesh, fireCd: 2, pass: 0, hd: a + Math.PI, orbit: FL.rand(0, 1) < 0.5 ? 1 : -1, bombs: 0 };
      u.max = u.hp;
      u.mark = FL.sprite(FL.tex.icon('target'), 3.2, { depthTest: false, fog: false }); this.stage.add(u.mark);
      mesh.position.set(x, u.y, z); this.stage.add(mesh); this.air.push(u);
      FL.audio.play(heli ? 'alarm' : 'jet');
      FL.hud.msg((heli ? 'Hubschrauber' : 'Flugzeug') + ' aus ' + compass(a) + '!', C.orange, true);
    }

    // ---------------------------------------------------------------- Treffer
    damage(e, d) {
      if (e.dead) return;
      e.hp -= d;
      if (e.bar) e.bar.scale.x = Math.max(0.02, e.hp / e.max);
      if (e.hp > 0) { FL.audio.play('hit'); return; }
      e.dead = true; this.kills++;
      if (e.air) {
        this.coins += e.kind === 'heli' ? 8 : 6;
        this.fx.explosion(e.x, e.y, e.z, 2, true); for (let i = 0; i < 8; i++) this.fx.chunk(e.x, e.y, e.z, 2);
        FL.audio.play('boom'); this.stage.scene.remove(e.mark);
        FL.hud.msg((e.kind === 'heli' ? 'Hubschrauber' : 'Flugzeug') + ' abgeschossen!', C.green, true);
      } else {
        this.coins += Math.max(1, Math.round(e.pts / 25));
        if (e.vehicle) { this.fx.explosion(e.x, 0.5, e.z, 1.3); FL.audio.play('boom'); }
        else { this.fx.vanish(e.x, 0, e.z); FL.audio.play('pop'); }
      }
      this.stage.scene.remove(e.mesh);
    }
    explode(x, z, radius, dmg, y) {
      FL.audio.play('boom'); this.shake = Math.max(this.shake, 0.2);
      this.fx.explosion(x, y || 0.3, z, radius / 3);
      for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - x, e.z - z) < radius + (e.vehicle ? 1.2 : 0)) this.damage(e, dmg);
      for (const u of this.air) if (!u.dead && Math.hypot(u.x - x, u.y - (y || 0), u.z - z) < radius + 4) this.damage(u, dmg);
    }
    hitBase(d, x, z) {
      if (this.endT >= 0 || this.result) return;
      this.baseHp -= d * 0.8;
      if (this.baseHp <= 0) {
        this.baseHp = 0; this.endT = 1.6; this.lost = true;
        for (const s of this.sites) this.fx.explosion(s.x, 2, s.z, 2.4);
        FL.audio.play('bigboom'); FL.hud.msg('Die Basis ist gefallen!', C.red);
      }
    }
    hurtHero(d) {
      if (this.invuln > 0 || this.ducking) return;
      this.hero.hp -= d; FL.hud.damage(0.5); FL.audio.play('ouch');
      if (this.hero.hp <= 0) { this.hero.hp = this.hero.max; this.invuln = 2.5; FL.hud.damage(1); FL.hud.msg('Du wurdest getroffen! Die Basis wird schwächer', C.red, true); this.hitBase(this.baseMax * 0.12); }
    }
    // Ein Gegner schießt: meist auf die Basis, manchmal auf dich oder einen Kameraden
    enemyFire(e) {
      const r = Math.random(), up = this.allies.filter(a => !a.down);
      let tx, tz, ty = 1.3, fn;
      const dmg = e.gun === 'granate' ? 4 : e.gun === 'rakete' ? (e.weak ? 2 : 2.5) : 0.5;
      if (r < 0.2) { tx = 0; tz = 0; fn = () => this.hurtHero(dmg > 1 ? 2 : 1); if (Math.random() < 0.5) fn = () => this.fx.spark(FL.rand(-1.5, 1.5), 1, FL.rand(-1.5, 1.5), 0.6); }
      else if (r < 0.38 && up.length) { const a = FL.pick(up); tx = a.x; tz = a.z; fn = () => { a.hp -= dmg; if (a.hp <= 0 && !a.down) { a.down = true; a.downT = 0; this.fx.vanish(a.x, 0, a.z); a.mesh.visible = false; FL.hud.msg('Kamerad getroffen! Er kommt gleich wieder', C.red, true); } }; }
      else { const s = FL.pick(this.sites); tx = s.x + FL.rand(-2, 2); tz = s.z + FL.rand(-2, 2); ty = FL.rand(1, s.h); fn = () => { this.hitBase(dmg, tx, tz); if (dmg > 1) this.fx.explosion(tx, ty, tz, 0.8, true); else this.fx.spark(tx, ty, tz, 0.7); }; }
      const sy = e.air ? e.y - 1 : e.vehicle ? 2 : 1.4, d = Math.hypot(tx - e.x, ty - sy, tz - e.z), T = d / (dmg > 1 ? 38 : 70);
      const mesh = this.fx.shot(dmg > 1 ? 0xff8c3c : 0xff5a46, dmg > 1 ? 0.3 : 0.12, dmg > 1 ? 2.2 : 1.6);
      this.ebullets.push({ sx: e.x, sy, sz: e.z, tx, ty, tz, t: 0, T, mesh, fn });
      if (this.eshotT <= 0) { this.eshotT = 0.12; FL.audio.play(dmg > 1 ? 'rocket' : 'eshot'); }
    }

    // ---------------------------------------------------------------- eigene Waffen
    nearest(x, z, range, air) {
      let best = null, bd = range;
      for (const e of this.enemies) if (!e.dead) { const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = e; } }
      if (air || !best) for (const u of this.air) if (!u.dead) { const d = Math.hypot(u.x - x, u.z - z); if (d < bd) { bd = d; best = u; } }
      return best;
    }
    strongest(n) { return this.alive().filter(e => Math.hypot(e.x, e.z) < SPAWN_R).sort((a, b) => b.hp - a.hp).slice(0, n || 99); }
    addBullet(x, y, z, tg, dmg, color, spread) {
      const ty = tg.air ? tg.y : tg.vehicle ? 1.4 : 1.2, d = Math.hypot(tg.x - x, ty - y, tg.z - z) || 1, sp = spread || 0;
      const mesh = this.fx.shot(color, 0.14, 1.8);
      this.bullets.push({ x, y, z, vx: (tg.x - x) / d * 95 + FL.rand(-sp, sp), vy: (ty - y) / d * 95 + FL.rand(-sp, sp) * 0.4, vz: (tg.z - z) / d * 95 + FL.rand(-sp, sp), dmg, life: 1.1, mesh });
    }
    lob(x, y, z, tg, dmg, radius, kind, delay, dur) {
      let tx, tz;
      if (tg) { const k = tg.air ? 0 : Math.min(1, (Math.hypot(tg.x, tg.z) - tg.stop) / 20); tx = tg.x * (1 - 0.04 * k); tz = tg.z * (1 - 0.04 * k); }
      else [tx, tz] = P(this.th + FL.rand(-0.5, 0.5), FL.rand(22, 40));
      const mesh = kind === 'rocket' ? FL.rocketModel() : kind === 'bomb' ? FL.bombModel() : FL.shellModel(0.17);
      mesh.visible = false; this.stage.add(mesh);
      this.shells.push({ kind, sx: x, sy: y, sz: z, tx, tz, ty: tg && tg.air ? tg.y : 0.3, t: -(delay || 0), dur: dur || 0.9, target: tg, dmg, radius, mesh });
    }
    fireTowers() {
      const lvl = this.lo.towers;
      if (!this.towersOn || !lvl || this.towerCd > 0) return;
      const tw = FL.TOWER_LEVELS[lvl - 1], tg = this.strongest();
      this.towerCd = tw.reload; this.shake = 0.15; FL.audio.play('cannon');
      this.towers.forEach((m, ti) => {
        for (let k = 0; k < tw.n; k++) this.lob(m.position.x, 3.6, m.position.z, tg.length ? tg[(ti * tw.n + k) % tg.length] : null, tw.dmg, tw.radius, tw.kind, k * 0.12);
        this.fx.spark(m.position.x, 3.8, m.position.z, 3);
      });
    }
    useSpecial(i) {
      const sp = FL.SPECIALS[i], lvl = this.lo[sp.id];
      if (!lvl) { FL.hud.msg(sp.name + ' hast du noch nicht gekauft', C.muted, true); return; }
      if (this.specialCd[i] > 0) return;
      this.specialCd[i] = sp.reload * (lvl > 1 ? 0.7 : 1) * (this.lo.radar ? 0.75 : 1);
      FL.audio.play('up');
      if (i === 0) {
        for (let k = 0; k < 5; k++) { const mesh = FL.droneModel(); mesh.visible = false; this.stage.add(mesh); this.aircraft.push({ kind: 'drone', x: (k - 2) * 1.2, y: 3, z: 0, t: -k * 0.15, life: 10, target: null, mesh }); }
        FL.hud.msg('Drohnen gestartet!', C.cyan, true);
      } else if (i === 1) {
        const mesh = FL.heliModel(); this.stage.add(mesh);
        this.aircraft.push({ kind: 'heli', a: this.th, y: 11, t: 0, life: 11, fire: 0, mesh, x: 0, z: 0 });
        FL.hud.msg('Kampfhubschrauber kreist über der Basis!', C.cyan, true);
      } else if (i === 3) {
        this.barrage = { n: 10, cd: 0.9 }; FL.audio.play('cannon'); FL.hud.msg('Artillerie feuert!', C.orange);
      } else {
        const mesh = FL.jetModel(0x6a7682, 0x3a4450); this.stage.add(mesh);
        this.aircraft.push({ kind: 'bomber', a: this.th, d: -60, y: 16, t: 0, life: 4.6, drop: 0, mesh, x: 0, z: 0 });
        FL.audio.play('jet'); FL.hud.msg('Kampfbomber in Blickrichtung!', C.orange);
      }
    }
    onKey(code) {
      if (code === 'KeyT') { this.towersOn = !this.towersOn; FL.save.towersOn = this.towersOn; FL.store(); FL.hud.msg('Geschütze ' + (this.towersOn ? 'AN' : 'AUS'), C.text, true); for (const m of this.towers) m.visible = this.towersOn; }
      else if (code === 'KeyX' || code === 'KeyC') this.fireTowers();
      else if (code === 'Digit1' || code === 'Numpad1') this.useSpecial(0);
      else if (code === 'Digit2' || code === 'Numpad2') this.useSpecial(1);
      else if (code === 'Digit3' || code === 'Numpad3') this.useSpecial(2);
      else if (code === 'Digit4' || code === 'Numpad4') this.useSpecial(3);
    }

    // ---------------------------------------------------------------- ein Zeitschritt
    update(dt) {
      if (this.result) return;
      const lo = this.lo, fx = this.fx;
      this.t += dt; this.secT += dt; this.fireCd -= dt; this.eshotT -= dt; this.muzzleT -= dt;
      this.towerCd = Math.max(0, this.towerCd - dt); this.shake = Math.max(0, this.shake - dt); this.invuln = Math.max(0, this.invuln - dt);
      for (let i = 0; i < 4; i++) this.specialCd[i] = Math.max(0, this.specialCd[i] - dt);
      for (const s of this.spinners) s.rotation.y += dt * 1.5;
      if (this.endT >= 0) { this.endT -= dt; if (this.endT <= 0) { this.result = this.lost ? 'lose' : 'win'; return; } }
      const active = this.endT < 0;

      // ---- umsehen: rundum, mit Tasten, Knöpfen oder Wischen
      this.ducking = active && FL.down('ArrowDown', 'KeyS');
      const turn = (FL.down('ArrowLeft', 'KeyA') ? 1 : 0) - (FL.down('ArrowRight', 'KeyD') ? 1 : 0);
      this.th = wrap(this.th + turn * 2.1 * dt - FL.touch.swipe * 0.0052); FL.touch.swipe = 0;
      const sin = Math.sin(this.th), cos = Math.cos(this.th);
      if (this.ducking) this.hero.hp = Math.min(this.hero.max, this.hero.hp + 1.2 * dt);
      else this.hero.hp = Math.min(this.hero.max, this.hero.hp + 0.12 * dt);
      const hm = this.hero.mesh; hm.rotation.y = this.th; hm.visible = this.invuln <= 0 || Math.floor(this.t * 12) % 2 === 0;
      FL.animSoldier(hm, this.t, turn !== 0, this.ducking);

      // ---- zielen: Die Waffe rastet auf den Gegner ein, der am nächsten an der Blickrichtung liegt (auch in der Luft)
      let lock = null, best = 1e9;
      const consider = (e, cone) => {
        const d = Math.hypot(e.x, e.z);
        if (d > VIEW + (e.air ? 60 : 0) || d < 2) return;
        const rel = Math.abs(FL.bearing(0, 0, this.th, e.x, e.z)), tol = cone + Math.atan2(e.r, d);
        if (rel > tol) return;
        const sc = rel * 60 + d * 0.25 - (e === this.lock ? 6 : 0);
        if (sc < best) { best = sc; lock = e; }
      };
      for (const e of this.enemies) if (!e.dead) consider(e, 0.17);
      for (const u of this.air) if (!u.dead) consider(u, 0.3);
      this.lock = lock;
      if (lock) { const s = FL.clamp(Math.hypot(lock.x, lock.z) * 0.05, 1.6, 4.5); this.aim.position.set(lock.x, lock.air ? lock.y : lock.vehicle ? 1.6 : 1.2, lock.z); this.aim.scale.set(s, s, 1); this.aim.material.opacity = 1; }
      else { this.aim.position.set(sin * 32, 1.2, cos * 32); this.aim.scale.set(2, 2, 1); this.aim.material.opacity = 0.45; }
      this.aim.visible = active && !this.ducking;

      // ---- schießen
      const w = FL.WEAPONS[lo.weapon];
      if (active && !this.ducking && FL.down('Space', 'Mouse0') && this.fireCd <= 0) {
        this.fireCd = w.rate;
        const tg = lock || { x: sin * 70, z: cos * 70, y: 0, air: false };
        for (let k = 0; k < w.shots; k++) this.addBullet(sin * 0.9 - cos * (k - (w.shots - 1) / 2) * 0.3, 1.45, cos * 0.9 + sin * (k - (w.shots - 1) / 2) * 0.3, tg, w.dmg, w.color, w.spread * 4);
        this.muzzle.position.set(sin * 1.1, 1.45, cos * 1.1); this.muzzle.visible = true; this.muzzleT = 0.05;
        FL.audio.play(w.color === 0x46dcff || w.color === 0xff5adc ? 'laser' : 'shot');
      }
      if (this.muzzleT <= 0) this.muzzle.visible = false;

      // ---- Wellen
      if (active) {
        if (this.waveBreak > 0) { this.waveBreak -= dt; if (this.waveBreak <= 0) this.startWave(); }
        else {
          this.spawnCd -= dt;
          if (this.waveSpawned < this.waveSize && this.spawnCd <= 0 && this.alive().length < 7 + 2 * this.allies.length + Math.round(this.tier + 6 * this.pw)) { this.spawnEnemy(); this.spawnCd = this.spawnDelay(); }
          for (const p of this.airPlan) if (!p.done && this.secT > p.t && this.air.length < 2) { p.done = true; this.spawnAir(p.kind); }
          if (this.waveSpawned >= this.waveSize && !this.alive().length && this.airPlan.every(p => p.done) && !this.air.some(u => !u.dead)) {
            for (const a of this.allies) { a.down = false; a.hp = a.max; a.mesh.visible = true; }
            if (this.wave >= this.nWaves) { this.endT = 2; FL.audio.play('up'); FL.hud.msg('BASIS GEHALTEN!', C.gold); }
            else { this.waveBreak = 5; this.coins += 10; this.baseHp = Math.min(this.baseMax, this.baseHp + this.baseMax * 0.15); FL.hud.msg('Welle abgewehrt! Die Basis wird ausgebessert', C.green); }
          }
        }
      }

      // ---- Gegner am Boden: zur Basis vorrücken, dann stehen bleiben und schießen
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x, e.z), moving = d > e.stop;
        if (moving) {
          const a = Math.atan2(e.x, e.z) + e.drift * Math.min(1, (d - e.stop) / 30) * dt * 2;
          const nd = d - e.speed * dt; e.x = Math.sin(a) * nd; e.z = Math.cos(a) * nd;
          if (e.vehicle && Math.random() < dt * 5) fx.dust(e.x, 0.2, e.z, 1.2);
        }
        e.mesh.position.set(e.x, 0, e.z); e.mesh.rotation.y = Math.atan2(-e.x, -e.z);
        if (!e.vehicle) FL.animSoldier(e.mesh, this.t, moving, false);
        if (e.bar) e.bar.rotation.y = this.th - e.mesh.rotation.y;
        e.fireCd -= dt;
        if (active && d < (moving ? 30 : 46) && e.fireCd <= 0) { e.fireCd = (1 / e.rate) * FL.rand(0.7, 1.3) * (moving ? 2 : 1) * (0.85 / this.diff); this.enemyFire(e); }
      }
      // ---- Gegner in der Luft
      for (const u of this.air) {
        if (u.dead) continue;
        const d = Math.hypot(u.x, u.z);
        if (u.kind === 'heli') {
          // anfliegen, dann die Basis umkreisen und Raketen schießen
          const ang = Math.atan2(u.x, u.z);
          if (d > 34) { const nd = d - 15 * dt; u.x = Math.sin(ang) * nd; u.z = Math.cos(ang) * nd; u.hd = ang + Math.PI; }
          else { const na = ang + u.orbit * 0.22 * dt; u.x = Math.sin(na) * d; u.z = Math.cos(na) * d; u.hd = ang + Math.PI; }
          u.y = 13 + Math.sin(this.t * 1.3 + u.a) * 1.2;
          const ud = u.mesh.userData; if (ud.rotor) ud.rotor.rotation.y += dt * 30; if (ud.tail) ud.tail.rotation.x += dt * 40;
          u.fireCd -= dt;
          if (active && d < 48 && u.fireCd <= 0) { u.fireCd = FL.rand(3, 4.5) * (0.85 / this.diff); this.enemyFire({ x: u.x, z: u.z, y: u.y, air: true, gun: 'rakete', weak: true }); }
        } else {
          // Tiefflug quer über die Basis, zwei Bomben, dann abdrehen und noch einmal kommen
          u.x += Math.sin(u.hd) * 52 * dt; u.z += Math.cos(u.hd) * 52 * dt;
          if (u.bombs < 2 && d < 22 + u.bombs * -14 + 14 && active) {
            u.bombs++;
            const s = FL.pick(this.sites), tx = s.x + FL.rand(-4, 4), tz = s.z + FL.rand(-4, 4);
            const mesh = FL.bombModel(); mesh.scale.setScalar(1.6); this.stage.add(mesh);
            this.shells.push({ kind: 'bomb', enemy: true, sx: u.x, sy: u.y - 1, sz: u.z, tx, tz, ty: 0.3, t: 0, dur: 0.9, dmg: 4, radius: 4, mesh });
          }
          if (d > 215 && u.x * Math.sin(u.hd) + u.z * Math.cos(u.hd) > 0) {
            u.pass++;
            if (u.pass >= 2) { u.dead = true; this.stage.scene.remove(u.mesh); this.stage.scene.remove(u.mark); continue; }
            const a = FL.pick(this.dirs) + FL.rand(-0.6, 0.6); [u.x, u.z] = P(a, 210); u.hd = a + Math.PI; u.bombs = 0;
            FL.hud.msg('Flugzeug kommt zurück aus ' + compass(a) + '!', C.orange, true); FL.audio.play('jet');
          }
        }
        u.mesh.position.set(u.x, u.y, u.z); u.mesh.rotation.y = u.hd;
        const ms = FL.clamp(d * 0.06, 2.4, 9); u.mark.position.set(u.x, u.y, u.z); u.mark.scale.set(ms, ms, 1); u.mark.material.opacity = u === lock ? 1 : 0.6;
      }

      // ---- eigene Truppe: Kameraden, MG-Nester, Fahrzeuge, Artillerie
      for (const a of this.allies) {
        if (a.down) { a.downT += dt; if (a.downT > (lo.medic ? 5 : 12)) { a.down = false; a.hp = a.max; a.mesh.visible = true; } continue; }
        const tg = this.nearest(a.x, a.z, 48, true);
        if (tg) a.mesh.rotation.y = Math.atan2(tg.x - a.x, tg.z - a.z);
        FL.animSoldier(a.mesh, this.t, false, false);
        a.fireCd -= dt;
        if (active && tg && a.fireCd <= 0) {
          const aw = FL.WEAPONS[Math.max(0, lo.weapon - 1)]; a.fireCd = aw.rate * 1.4;
          for (let k = 0; k < aw.shots; k++) this.addBullet(a.x, 1.4, a.z, tg, aw.dmg, aw.color, 3);
        }
      }
      for (const n of this.nests) {
        n.cd -= dt;
        const tg = n.cd <= 0 ? this.nearest(n.x, n.z, 42, true) : null;
        if (active && tg) { n.cd = 0.16; this.addBullet(n.x, 1.3, n.z, tg, 0.5, 0xffe68c, 2.5); }
      }
      for (const v of this.vehicles) {
        v.fireCd -= dt;
        const tg = this.nearest(v.x, v.z, 60, false);
        if (tg && v.kind === 'tank') FL.setTurret(v.mesh, Math.atan2(tg.x - v.x, tg.z - v.z) - v.a, 0);
        if (!active || !tg || v.fireCd > 0) continue;
        if (v.kind === 'tank') { v.fireCd = 1.8; FL.audio.play('cannon'); this.lob(v.x, 2, v.z, tg, 8, 3.4, 'shell', 0, 0.6); fx.spark(v.x, 2.2, v.z, 2.5); }
        else { v.fireCd = 4.5; const s = this.strongest(4); for (let k = 0; k < 4; k++) this.lob(v.x, 2.6, v.z, s.length ? s[k % s.length] : tg, 6, 3.6, 'rocket', k * 0.15); }
      }
      if (this.barrage) {
        const q = this.barrage; q.cd -= dt;
        if (q.cd <= 0) { q.cd = 0.34; q.n--; const pool = this.alive(); this.lob(-sin * 60 + FL.rand(-9, 9), 36, -cos * 60, pool.length ? FL.pick(pool) : null, 12, 4.6, 'shell', 0, 1.5); if (q.n <= 0) this.barrage = null; }
      }
      this.updateAircraft(dt);

      // ---- Geschosse
      for (const b of this.bullets) {
        b.life -= dt;
        for (let i = 0; i < 2 && !b.gone; i++) {
          b.x += b.vx * dt / 2; b.y += b.vy * dt / 2; b.z += b.vz * dt / 2;
          for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - b.x, e.z - b.z) < e.r + 0.3 && b.y < (e.vehicle ? 3.2 : 2.4)) { b.gone = true; this.damage(e, b.dmg); fx.spark(b.x, b.y, b.z, 0.6); break; }
          if (!b.gone) for (const u of this.air) if (!u.dead && Math.hypot(u.x - b.x, u.y - b.y, u.z - b.z) < u.r + 1) { b.gone = true; this.damage(u, b.dmg); fx.spark(b.x, b.y, b.z, 1.2); break; }
        }
        if (b.life <= 0 || b.y < 0) b.gone = true;
        if (b.gone) fx.freeShot(b.mesh);
        else { b.mesh.position.set(b.x, b.y, b.z); b.mesh.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz); }
      }
      this.bullets = this.bullets.filter(b => !b.gone);
      for (const f of this.ebullets) {
        f.t += dt; const k = Math.min(1, f.t / f.T);
        f.mesh.position.set(FL.lerp(f.sx, f.tx, k), FL.lerp(f.sy, f.ty, k), FL.lerp(f.sz, f.tz, k)); f.mesh.lookAt(f.tx, f.ty, f.tz);
        if (k >= 1) { f.gone = true; fx.freeShot(f.mesh); f.fn(); }
      }
      this.ebullets = this.ebullets.filter(f => !f.gone);
      for (const s of this.shells) {
        s.t += dt;
        if (s.t < 0) continue;
        s.mesh.visible = true;
        if (s.target && !s.target.dead && !s.enemy) { s.tx = s.target.x; s.tz = s.target.z; if (s.target.air) s.ty = s.target.y; }
        const k = Math.min(1, s.t / s.dur), arc = s.kind === 'bomb' ? 0 : Math.sin(k * Math.PI) * (s.kind === 'rocket' ? 2.5 : 6);
        const x = FL.lerp(s.sx, s.tx, k), y = FL.lerp(s.sy, s.ty, s.kind === 'bomb' ? k * k : k) + arc, z = FL.lerp(s.sz, s.tz, k);
        s.mesh.position.set(x, y, z); if (s.kind !== 'bomb') FL.aimShell(s, x, y, z);
        if (s.kind === 'rocket' && Math.random() < dt * 30) fx.puff('smoke', x, y, z, 0.7, 0.5, 0, 0.3, 0, 1);
        if (k >= 1) {
          s.gone = true; this.stage.scene.remove(s.mesh);
          if (s.enemy) { FL.audio.play('boom'); this.shake = 0.3; fx.explosion(s.tx, 0.5, s.tz, 1.6); this.hitBase(s.dmg); if (Math.hypot(s.tx, s.tz) < 5) this.hurtHero(2); }
          else this.explode(s.tx, s.tz, s.radius, s.dmg, s.ty);
        }
      }
      this.shells = this.shells.filter(s => !s.gone);
      this.enemies = this.enemies.filter(e => !e.dead);
      this.air = this.air.filter(u => !u.dead);

      fx.update(dt);
      this.updateCamera(dt);
      this.updateHud();
    }

    // eigene Unterstützung aus der Luft
    updateAircraft(dt) {
      for (const a of this.aircraft) {
        a.t += dt; a.life -= dt;
        if (a.t < 0) continue;
        a.mesh.visible = true;
        if (a.kind === 'drone') {
          let tg = a.target;
          if (!tg || tg.dead) { const taken = new Set(this.aircraft.map(o => o.target)); const pool = [...this.alive(), ...this.air.filter(u => !u.dead)]; const free = pool.filter(e => !taken.has(e)); tg = a.target = (free.length ? free : pool).sort((p, q) => q.hp - p.hp)[0] || null; }
          const tx = tg ? tg.x : a.x + Math.sin(this.th) * 6, ty = tg ? (tg.air ? tg.y : 1) : a.y, tz = tg ? tg.z : a.z + Math.cos(this.th) * 6;
          const dx = tx - a.x, dy = ty - a.y, dz = tz - a.z, d = Math.hypot(dx, dy, dz) || 1, step = 30 * dt;
          a.x += dx / d * Math.min(step, d); a.y += dy / d * Math.min(step, d); a.z += dz / d * Math.min(step, d);
          a.mesh.rotation.y = Math.atan2(dx, dz);
          if (tg && d < 1.2) { a.life = 0; this.explode(a.x, a.z, 3, 10, a.y); }
        } else if (a.kind === 'heli') {
          a.a += 0.5 * dt; [a.x, a.z] = P(a.a, 20); a.mesh.rotation.y = a.a + Math.PI / 2; a.mesh.rotation.z = 0.1;
          const ud = a.mesh.userData; if (ud.rotor) ud.rotor.rotation.y += dt * 30; if (ud.tail) ud.tail.rotation.x += dt * 40;
          a.fire -= dt;
          const tg = this.nearest(a.x, a.z, 70, true);
          if (a.fire <= 0 && a.t > 1 && tg) { a.fire = 0.4; this.lob(a.x, a.y - 1, a.z, tg, 9, 3.8, 'rocket', 0, 0.7); }
        } else {
          a.d += 34 * dt; [a.x, a.z] = P(a.a, a.d); a.mesh.rotation.y = a.a; a.drop -= dt;
          if (a.drop <= 0 && a.d > 14 && a.d < 72) {
            a.drop = 0.14;
            for (const off of [-4, 0, 4]) {
              const bx = a.x + Math.cos(a.a) * off, bz = a.z - Math.sin(a.a) * off, mesh = FL.bombModel(); this.stage.add(mesh);
              this.shells.push({ kind: 'bomb', sx: bx, sy: a.y, sz: bz, tx: bx + Math.sin(a.a) * 9, tz: bz + Math.cos(a.a) * 9, ty: 0.3, t: 0, dur: 0.7, target: null, dmg: 15, radius: 4.2, mesh });
            }
          }
        }
        a.mesh.position.set(a.x, a.y, a.z);
      }
      for (const a of this.aircraft) if (a.life <= 0) this.stage.scene.remove(a.mesh);
      this.aircraft = this.aircraft.filter(a => a.life > 0);
    }

    updateCamera(dt) {
      const cam = this.stage.camera, sin = Math.sin(this.th), cos = Math.cos(this.th), sh = this.shake > 0 ? this.shake * 1.2 : 0;
      // bei Zielen in der Luft hebt sich der Blick etwas
      const up = this.lock && this.lock.air ? FL.clamp((this.lock.y - 6) / Math.max(20, Math.hypot(this.lock.x, this.lock.z)) * 26, 0, 14) : 0;
      this.lookY = FL.lerp(this.lookY || 0, up, 1 - Math.exp(-4 * (dt || 1)));
      cam.position.set(-sin * 10 + FL.rand(-sh, sh), 8.2 + FL.rand(-sh, sh), -cos * 10);
      cam.lookAt(sin * 22, 1.2 + this.lookY, cos * 22);
      this.stage.update(new THREE.Vector3(sin * 12, 0, cos * 12));
    }

    updateHud() {
      const lo = this.lo, H = FL.hud, w = FL.WEAPONS[lo.weapon], hp = this.hero.hp / this.hero.max, b = this.baseHp / this.baseMax;
      const up = this.allies.filter(a => !a.down).length + 1;
      H.set(this.hTL, `<div class="hud-big"><span class="coins">${this.coins}</span></div><div>Basis</div>${H.meter(b, b < 0.35 ? 'red' : 'cyan')}` +
        `<div>Gesundheit</div>${H.meter(hp, hp < 0.3 ? 'red' : hp < 0.6 ? 'gold' : '')}` +
        `<div><b style="color:#${w.color.toString(16).padStart(6, '0')}">${w.name}</b> · Armee ${up}/${this.allies.length + 1}</div>`);
      const foes = [...this.alive(), ...this.air.filter(u => !u.dead)];
      let tc = `<div>Welle ${this.wave} von ${this.nWaves} · Blick nach <b>${compass(this.th)}</b></div>`;
      const left = this.waveSize - this.waveSpawned + this.alive().length;
      tc += this.waveBreak > 0 ? '<div style="color:#5fd07a">Nächste Welle kommt gleich …</div>' : H.meter(1 - left / Math.max(1, this.waveSize), 'gold');
      if (foes.length) { const n = foes.reduce((p, e) => Math.hypot(e.x, e.z) < Math.hypot(p.x, p.z) ? e : p); tc += `<div>Nächster Gegner ${FL.arrowHtml(FL.bearing(0, 0, this.th, n.x, n.z), Math.hypot(n.x, n.z))}</div>`; }
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
      for (const s of this.sites) items.push({ x: s.x, z: s.z, color: '#5fd07a', size: 3 });
      for (const a of this.allies) if (!a.down) items.push({ x: a.x, z: a.z, color: '#46dcff', size: 2 });
      for (const e of this.enemies) if (!e.dead) items.push({ x: e.x, z: e.z, color: '#ff5a3c', size: e.vehicle ? 4.5 : 3, far: true });
      for (const u of this.air) if (!u.dead) items.push({ x: u.x, z: u.z, color: '#ff40c0', size: 5, far: true, ring: u.kind === 'jet' });
      // Solange noch niemand zu sehen ist, zeigen gelbe Ringe am Rand, von wo die Welle kommt
      if (this.waveBreak <= 0 && this.waveSpawned < this.waveSize) for (const d of this.dirs) items.push({ x: Math.sin(d) * 200, z: Math.cos(d) * 200, color: '#ffe14a', size: 7, far: true, ring: true });
      FL.drawMinimap(this.map, 0, 0, this.th, 72, items);
      let bc = '';
      if (lo.towers > 0) {
        const tw = FL.TOWER_LEVELS[lo.towers - 1];
        if (!this.towersOn) bc = '<span class="muted">Geschütze AUS (T)</span>';
        else if (this.towerCd <= 0) bc = `<b style="color:#46dcff">${tw.name} bereit (X)</b>`;
        else bc = `Geschütze laden …${H.meter(1 - this.towerCd / tw.reload, 'cyan')}`;
      }
      this.hBC.style.display = bc ? '' : 'none'; H.set(this.hBC, bc);
      this.hCover.style.display = this.ducking ? '' : 'none';
    }

    destroy() { this.stage.dispose(); }
  };
})();
