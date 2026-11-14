'use strict';
// Frontlinie 3 – Bodenkampf: gegnerische Basis angreifen oder die eigene Basis verteidigen.
// Achtung Richtung: Die Kamera schaut nach +z. Dabei liegt +x links im Bild, "rechts" ist also -x.
(() => {
  const ROAD = 6, Z_FAR = 58, COVER_Z = 2.4, BREACH_Z = 2.9, ALLY_Z = 1.0, SEC = 40, FORT_Z = 46;
  const ALLY_OFF = [1.5, -1.5, 3, -3, 4.5, -4.5];
  const C = { gold: '#ffc43c', red: '#ef5a4c', green: '#5fd07a', cyan: '#46dcff', text: '#e9eef2', orange: '#ff8c3c', muted: '#9fb0bd' };
  const isVeh = m => m.kind === 'tank' || m.kind === 'werfer';

  FL.GroundBattle = class {
    constructor(cfg, lo) {
      this.cfg = cfg; this.lo = lo; this.result = null;
      this.kind = cfg.kind; this.tier = cfg.tier; this.diff = cfg.diff || 0.85;
      this.nSec = this.kind === 'attack' ? cfg.sections : 1;
      this.armor = 1 + 0.35 * this.tier;
      this.towersOn = cfg.towersOn !== false;
      this.stage = new FL.Stage(cfg.theme, { far: 650, shadow: 60 });
      this.fx = new FL.FX(this.stage);
      this.world = new THREE.Group();
      this.stage.add(this.world);
      this.fx.scorchParent = this.world;

      this.t = 0; this.secT = 0; this.x = 0;
      this.kills = 0; this.coins = 0; this.secKills = 0;
      this.lives = 4 + lo.lives;
      this.baseMax = this.baseHp = 8 + 4 * lo.bunker;
      this.fireCd = 0; this.shotCount = 0; this.towerCd = 0; this.muzzleT = 0;
      this.specialCd = [0, 0, 0, 0]; this.barrage = null; this.spawnCd = 2.5; this.invuln = 0; this.ducking = false;
      this.enemies = []; this.bullets = []; this.ebullets = []; this.shells = []; this.aircraft = [];
      this.shake = 0; this.section = 0; this.scroll = 0; this.advancing = 0; this.secured = false;
      this.wave = 0; this.waveSpawned = 0; this.waveBreak = 0; this.waveSize = 0;
      this.structures = []; this.spinners = []; this.burning = []; this.endT = -1; this.fortCd = 2; this.nestCd = 0;

      this.buildSquad();
      this.buildScenery();
      this.buildHud();
      if (this.kind === 'defend') this.startWave();
      else FL.hud.msg('Abschnitt 1 von ' + this.nSec, C.gold);
      this.updateCamera(0);
    }

    // ---------------------------------------------------------------- Aufbau
    buildSquad() {
      const lo = this.lo, st = this.stage;
      const mk = (kind, offset, z, hp, mesh) => {
        const icon = FL.sprite(FL.tex.icon(isVeh({ kind }) ? 'wrench' : 'cross'), 0.9, { depthTest: false });
        icon.visible = false; st.add(icon); st.add(mesh);
        return { kind, offset, x: offset, z, hp, max: hp, down: false, downT: 0, revive: 0, fireCd: FL.rand(0.4, 1.2), hitT: 0, mesh, icon };
      };
      this.hero = mk('hero', 0, 0, 8 + 3 * lo.vest, FL.soldier({ team: 'hero', weapon: lo.weapon }));
      this.allies = [];
      for (let i = 0; i < lo.allies; i++) this.allies.push(mk('ally', ALLY_OFF[i], ALLY_Z, 3, FL.soldier({ team: 'ally', weapon: Math.max(0, lo.weapon - 1) })));
      this.vehicles = [];
      if (lo.tank) this.vehicles.push(mk('tank', 7.8, 4.6, 25, FL.tankModel(FL.PAL.ally)));
      if (lo.werfer) this.vehicles.push(mk('werfer', -7.8, 4.6, 20, FL.werferModel(FL.PAL.ally)));
      for (const v of this.vehicles) { v.mesh.position.set(v.x, 0, v.z); v.mesh.scale.setScalar(0.8); }
      // Kanonentürme
      this.towerMeshes = [];
      if (lo.towers > 0) {
        const tw = FL.TOWER_LEVELS[lo.towers - 1];
        for (let i = 0; i < tw.count; i++) {
          // In der eigenen Basis stehen feste Geschütztürme, beim Angriff fahren Geschützwagen mit.
          const mobile = this.kind === 'attack';
          const m = mobile ? FL.spgModel(FL.PAL.ally, lo.towers) : FL.building('cannon', this.cfg.theme, { level: lo.towers });
          if (mobile) m.scale.setScalar(0.8);
          m.position.set((i === 0 ? 1 : -1) * (mobile ? 14 : 10.8), 0, mobile ? 13.5 : 7.5);
          st.add(m); this.towerMeshes.push(m);
        }
      }
      const cover = FL.building('sandbags', this.cfg.theme, { len: 15 });
      cover.position.set(0, 0, COVER_Z); st.add(cover);
      this.muzzle = FL.sprite(FL.tex.icon('glow'), 1.2, { add: true }); this.muzzle.visible = false; st.add(this.muzzle);
    }

    buildScenery() {
      const th = this.cfg.theme, st = this.stage, w = this.world, rnd = FL.seeded(11 + this.nSec * 7 + th.length);
      const len = this.nSec * SEC + 170;
      w.add(st.ground(1800, FL.tex.ground(th), 18));
      w.children[w.children.length - 1].position.z = len / 2 - 100;
      w.add(st.strip(13.5, len + 80, FL.tex.road(th), 13.5, 12, 0, len / 2 - 40));
      const fortZw = (this.nSec - 1) * SEC + FORT_Z;
      this.fortZw = fortZw;
      for (let z = -30; z < len; z += 2.1) {
        for (const side of [-1, 1]) {
          if (rnd() > 0.78) continue;
          // beim Angriff fahren Panzer und Geschützwagen mit: Dort bleibt neben der Straße eine breite Gasse frei
          const x = side * ((this.kind === 'attack' ? 17.8 : 9.8) + Math.pow(rnd(), 1.6) * 70), zz = z + rnd() * 2;
          const local = ((zz % SEC) + SEC) % SEC;
          if (Math.abs(x) < 14 && local > 1 && local < 12) continue;                 // Platz für Türme und Fahrzeuge
          if (this.kind === 'attack' && zz > fortZw - 9 && zz < fortZw + 30 && Math.abs(x) < 34) continue;
          if (this.kind === 'defend' && zz > -22 && zz < 40 && Math.abs(x) < 40) continue;
          const t = FL.tree(FL.pick(st.theme.trees), rnd);
          t.position.set(x, 0, zz);
          if (Math.abs(x) > 28 || zz > 120) FL.noShadow(t);
          w.add(t);
        }
      }
      // Kontrollpunkte zwischen den Abschnitten
      for (let k = 0; k < this.nSec - 1; k++) {
        const z = k * SEC + 44.5, g = new THREE.Group();
        g.add(FL.box(2.6, 2.6, 2.6, FL.wallMat(th, 0.8, 0.8), 20, 1.3, 0), FL.box(3.0, 0.25, 3.0, FL.mat(0x3a3430), 20, 2.72, 0));
        for (let i = 0; i < 5; i++) g.add(FL.box(0.18, 1.0, 0.18, FL.mat(i % 2 ? 0xe8e8e8 : 0xc03020), 17.2, 1.2 + i * 1.0, 0));
        g.add(FL.box(0.4, 1.3, 0.4, FL.mat(0x444444), 17.2, 0.65, 0), FL.cyl(0.07, 0.07, 6.5, 5, FL.mat(0xbbbbbb), -17.2, 3.25, 0), FL.box(1.9, 1.1, 0.06, FL.mat(0xffc43c), -18.2, 5.8, 0));
        for (const sx of [-1, 1]) { const sb = FL.building('sandbags', th, { len: 4 }); sb.position.set(sx * 19.5, 0, -2.4); g.add(sb); }
        g.position.z = z; w.add(g);
      }
      if (this.kind === 'attack') this.buildEnemyBase(fortZw);
      else this.buildOwnBase();
    }

    // Die gegnerische Basis sieht je nach Landschaft anders aus und wächst mit den Leveln.
    buildEnemyBase(zw) {
      const th = this.cfg.theme, style = FL.THEMES[th].style;
      const hpMul = 1;
      const add = (kind, x, dz, row, key, baseHp, opt, rotY) => {
        const mesh = FL.building(kind, th, opt);
        mesh.position.set(x, 0, zw + dz);
        if (rotY) mesh.rotation.y = rotY;
        this.world.add(mesh);
        if (mesh.userData.spin) this.spinners.push(mesh.userData.spin);
        const s = { kind, x, zw: zw + dz, r: opt && opt.len ? opt.len / 2 : mesh.userData.r, h: mesh.userData.h, hp: baseHp * hpMul, max: baseHp * hpMul, key, row, mesh, alive: true };
        this.structures.push(s);
        return s;
      };
      add('gate', 0, 0, 0, true, 60);
      for (const sx of [-1, 1]) {
        add('wall', sx * 8.4, 0, 0, false, 30, { len: 8.2 });
        add('tower', sx * 14.2, 1.5, 0, true, 45);
        add('wall', sx * 21, 0, 0, false, 30, { len: 10 });
      }
      const hq = style === 'wood' ? 'barracks' : 'hq';
      add(hq, 0, 13, 1, true, 150);
      const extras = {
        wood: [['tent', 11, 9], ['tent', -11, 9], ['depot', 17, 16]],
        sandstone: [['depot', 12, 10], ['barracks', -14, 12], ['radar', 20, 18]],
        concrete: [['chimney', 14, 14], ['depot', -12, 10], ['hangar', -22, 20], ['radar', 22, 8]],
        fortress: [['radar', 12, 10], ['depot', -12, 10], ['bunker', 20, 16], ['bunker', -20, 16], ['antenna', 6, 22]]
      }[style];
      if (th === 'winter') extras.push(['hangar', 20, 20]);
      for (const [k, x, dz] of extras) add(k, x, dz, 1, true, k === 'tent' ? 25 : 55);
      // Deko dahinter
      for (let i = 0; i < 3 + Math.round(this.tier); i++) {
        const b = FL.building(FL.pick(['barracks', 'tent', 'house']), th); b.position.set(FL.rand(-34, 34), 0, zw + 30 + i * 9); b.rotation.y = FL.rand(-0.3, 0.3); this.world.add(FL.noShadow(b));
      }
      // Die Gebäude halten so viel aus, dass die eigene Armee die Basis in etwa anderthalb Minuten schaffen kann.
      const total = this.structures.reduce((a, s) => a + (s.key ? s.max : 0), 0);
      const f = this.armyDps() * (50 + 6 * this.tier) / total;
      for (const s of this.structures) { s.hp = s.max = Math.max(4, s.max * f); }
    }

    buildOwnBase() {
      const th = this.cfg.theme, lo = this.lo, w = this.world;
      const put = (kind, x, z, rot, opt) => { const b = FL.building(kind, th, opt); b.position.set(x, 0, z); b.rotation.y = rot || 0; w.add(b); if (b.userData.spin) this.spinners.push(b.userData.spin); return b; };
      put('hq', 31, 30, Math.PI / 2);
      put('barracks', -30, 28, Math.PI / 2);
      put('tent', -21, 16, 0.3); put('tent', 22, 17, -0.2);
      for (let i = 0; i < lo.bunker; i++) put('bunker', (i % 2 ? -1 : 1) * (17 + i), 25 + i * 5, Math.PI);
      if (lo.radar) put('radar', -17, 10);
      if (lo.medic) put('medtent', 16, 10, Math.PI);
      this.nests = [];
      for (let i = 0; i < lo.mgnest; i++) { const n = put('mgnest', i === 0 ? 6.9 : -6.9, 8.2); this.nests.push(n); }
      for (const sx of [-1, 1]) put('sandbags', sx * 13, 13, 0.3 * sx, { len: 6 });
      const pole = FL.cyl(0.08, 0.08, 9, 5, FL.mat(0xcccccc), -12.5, 4.5, 9); w.add(pole);
      w.add(FL.box(2.4, 1.4, 0.06, FL.mat(0x2a6fd0), -13.7, 8.2, 9));
    }

    buildHud() {
      FL.hud.clear();
      this.hTL = FL.hud.box('hud-tl'); this.hTC = FL.hud.box('hud-tc'); this.hTR = FL.hud.box('hud-tr');
      this.hBC = FL.hud.box('hud-bc');
      const hint = FL.hud.box('hud-bl');
      hint.innerHTML = '← → bewegen · Leertaste schießen · ↓ Deckung · E aufhelfen · X Geschütze · 1 2 3 4 Unterstützung' + (this.kind === 'attack' ? ' · V vorrücken' : '') + ' · P Pause';
      this.hCover = FL.el('div', 'cover-note', 'IN DECKUNG', FL.hud.root);
    }

    // ---------------------------------------------------------------- Stärke und Schwierigkeit
    weaponDps(lvl, slow) { const w = FL.WEAPONS[lvl]; return w.dmg * w.shots / (w.rate * (slow || 1)); }
    armyDps() {
      const lo = this.lo;
      let dps = this.weaponDps(lo.weapon) * 0.6;
      const up = this.allies ? this.allies.filter(a => !a.down).length : lo.allies;
      dps += up * this.weaponDps(Math.max(0, lo.weapon - 1), 1.4) * 0.45;
      for (const v of (this.vehicles || [])) if (!v.down) dps += v.kind === 'tank' ? 3.5 : 4;
      if (this.towersOn && lo.towers > 0) { const tw = FL.TOWER_LEVELS[lo.towers - 1]; dps += tw.count * tw.n * tw.dmg / tw.reload * 0.5; }
      if (this.kind === 'defend') dps += lo.mgnest * 3;
      return dps;
    }
    weights() { return FL.enemyWeights(this.tier + this.section * 0.4 + (this.kind === 'defend' ? this.wave * 0.3 : 0)); }
    spawnDelay() {
      const w = this.weights();
      let total = 0, hp = 0;
      for (const k in w) { total += w[k]; hp += w[k] * FL.ENEMIES[k].hp; }
      const avg = hp / total * this.armor;
      // Es kommen mit der Zeit immer mehr Gegner, aber nie mehr, als die eigene Armee schaffen kann.
      const wanted = 0.55 + 0.1 * this.tier + this.secT / 45 + 0.15 * this.section;
      const possible = this.diff * this.armyDps() / avg;
      return FL.clamp(1 / Math.min(wanted, possible), 0.15, 2.8) * FL.rand(0.75, 1.25);
    }
    maxEnemies() { return 9 + 3 * (this.allies.length + 1) + 2 * this.section; }
    fortActive() { return this.kind === 'attack' && this.section === this.nSec - 1 && !this.advancing && this.endT < 0; }
    keyLeft() { return this.structures.filter(s => s.alive && s.key).length; }
    members() {
      this.hero.x = this.x;
      for (const a of this.allies) if (!a.down) a.x = FL.clamp(this.x + a.offset, -ROAD - 2.5, ROAD + 2.5);
      return [this.hero, ...this.allies, ...this.vehicles];
    }

    // ---------------------------------------------------------------- Gegner
    spawnEnemy() {
      const kind = FL.weighted(this.weights()), d = FL.ENEMIES[kind];
      const fort = this.fortActive(), gate = fort && this.structures[0].alive;
      const lim = gate ? 2.2 : ROAD - (d.vehicle ? 2 : 0.8);
      const e = {
        kind, vehicle: !!d.vehicle, gun: d.gun, rate: d.rate, pts: d.pts,
        hp: Math.max(1, Math.round(d.hp * this.armor)), speed: d.speed * (1 + this.tier * 0.03) * FL.rand(0.9, 1.1),
        z: (fort ? FORT_Z - 2.5 : Z_FAR) + FL.rand(0, 3), phase: FL.rand(0, 6.28), fireCd: FL.rand(0.4, 2), hitT: 0, dying: -1
      };
      e.max = e.hp; e.x = e.baseX = FL.rand(-lim, lim);
      if (e.vehicle) { e.mesh = (kind === 'jeep' ? FL.jeepModel : FL.tankModel)(FL.PAL.enemy(this.cfg.theme)); e.mesh.scale.setScalar(0.8); }
      else e.mesh = FL.soldier({ team: 'enemy', kind, theme: this.cfg.theme });
      e.mesh.rotation.y = Math.PI;
      e.mesh.position.set(e.x, 0, e.z);
      if (e.max > 1) {
        e.bar = FL.box(1, 0.09, 0.03, FL.basic(0xf05a46), 0, e.vehicle ? 3.4 : 2.25, 0);
        e.bar.castShadow = false; e.mesh.add(e.bar);
      }
      this.stage.add(e.mesh);
      this.enemies.push(e);
      this.waveSpawned++;
    }
    damage(e, d) {
      if (e.dying >= 0) return;
      e.hp -= d; e.hitT = 0.1;
      if (e.bar) e.bar.scale.x = Math.max(0.02, e.hp / e.max);
      if (e.hp <= 0) {
        e.dying = 0;
        this.kills++; this.secKills++; this.coins += Math.max(1, Math.round(e.pts / 25));
        if (e.vehicle) { this.fx.explosion(e.x, 0.5, e.z, 1.3); FL.audio.play('boom'); }
        else { this.fx.vanish(e.x, 0, e.z); FL.audio.play('pop'); }
      } else FL.audio.play('hit');
    }
    damageStructure(s, d) {
      if (!s.alive || !this.fortActive()) return;
      s.hp -= d; s.hitT = 0.12;
      if (s.hp <= 0) {
        s.alive = false;
        const rel = s.zw - this.scroll;
        this.fx.explosion(s.x, 1, rel, Math.max(1.6, s.r * 0.45));
        this.fx.explosion(s.x + FL.rand(-2, 2), s.h * 0.6, rel + FL.rand(-1, 1), Math.max(1.2, s.r * 0.3), true);
        for (let i = 0; i < 14; i++) this.fx.chunk(s.x + FL.rand(-s.r, s.r) * 0.6, FL.rand(1, s.h), rel, 2);
        FL.audio.play(s.r > 6 ? 'bigboom' : 'boom');
        this.shake = 0.4;
        this.world.remove(s.mesh);
        const rb = FL.rubble(s.r, s.h); rb.position.copy(s.mesh.position); this.world.add(rb);
        this.burning.push({ x: s.x, zw: s.zw, t: 12, size: Math.max(2, s.r * 0.5) });
        this.coins += s.key ? 10 : 3;
        if (s.key) {
          const left = this.keyLeft();
          if (left === 0) { this.endT = 3; FL.hud.msg('BASIS EROBERT!', C.gold); for (const e of this.enemies) if (e.dying < 0) { e.dying = 0; this.fx.vanish(e.x, 0, e.z); } }
          else FL.hud.msg('Gebäude zerstört! Noch ' + left, C.orange, true);
        }
      }
    }
    explode(x, z, radius, dmg, y) {
      FL.audio.play('boom');
      this.shake = Math.max(this.shake, 0.22);
      this.fx.explosion(x, y || 0.3, z, radius / 3);
      for (const e of this.enemies) if (e.dying < 0 && Math.hypot(e.x - x, e.z - z) < radius + (e.vehicle ? 1.2 : 0)) this.damage(e, dmg);
      if (this.fortActive()) for (const s of this.structures) {
        if (s.alive && Math.abs(s.x - x) < radius + s.r * 0.8 && Math.abs(s.zw - this.scroll - z) < radius + 3) this.damageStructure(s, dmg * 1.5);
      }
    }
    hurt(m, d) {
      if (m.down) return;
      if (m === this.hero) {
        if (this.invuln > 0) return;
        m.hp -= d; FL.hud.damage(0.5); FL.audio.play('ouch');
        if (m.hp <= 0) {
          m.hp = m.max; this.invuln = 2.5; FL.hud.damage(1);
          if (this.kind === 'defend') { this.baseHp -= 2; FL.hud.msg('Du wurdest getroffen! Die Basis wird schwächer', C.red, true); }
          else { this.lives--; FL.hud.msg('Du wurdest getroffen! Ein Leben weniger', C.red, true); }
          this.checkLose();
        }
        return;
      }
      m.hp -= d; m.hitT = 0.15;
      if (m.hp <= 0) {
        m.down = true; m.downT = 0; m.revive = 0;
        FL.audio.play('pop');
        if (isVeh(m)) { this.fx.explosion(m.x, 1.5, m.z, 0.8, true); FL.hud.msg((m.kind === 'tank' ? 'Panzer' : 'Raketenwerfer') + ' beschädigt! Hinfahren und E halten', C.red, true); }
        else FL.hud.msg('Kamerad getroffen! Hingehen und E halten', C.red, true);
      }
    }
    checkLose() {
      if (this.result) return;
      if ((this.kind === 'attack' && this.lives <= 0) || (this.kind === 'defend' && this.baseHp <= 0)) {
        this.lives = Math.max(0, this.lives); this.baseHp = Math.max(0, this.baseHp);
        this.result = 'lose';
      }
    }
    enemyFire(e) {
      const ms = this.members().filter(m => !m.down);
      const w = {};
      ms.forEach((m, i) => { w[i] = m === this.hero ? 3 : isVeh(m) ? 2 : 1; });
      const m = ms[+FL.weighted(w)];
      const n = e.gun === 'mg' ? 3 : 1, spread = e.gun === 'mg' ? 0.9 : 0.6;
      FL.audio.play('eshot');
      for (let k = 0; k < n; k++) {
        const speed = e.gun === 'rakete' ? 16 : e.gun === 'granate' ? 20 : 30;
        const b = {
          sx: e.x, sz: e.z - 0.5, tx: m.x + FL.rand(-spread, spread), tz: m.z, speed, t: -k * 0.1, kind: e.gun, target: m,
          h0: e.vehicle || e.fort ? (e.fort ? 4 : 1.8) : 1.3
        };
        b.mesh = e.gun === 'rakete' ? FL.rocketModel() : e.gun === 'granate' ? FL.shellModel(0.13) : this.fx.shot(0xff5a46, 0.07, 1.5);
        if (e.gun !== 'gewehr' && e.gun !== 'mg') this.stage.add(b.mesh);
        b.mesh.visible = false;
        this.ebullets.push(b);
      }
    }

    // ---------------------------------------------------------------- eigene Waffen
    addBullet(x, z, vx, vz, dmg, color, rocket, big) {
      const mesh = this.fx.shot(rocket ? 0xffffff : color, rocket ? 0.18 : big ? 0.12 : 0.07, rocket ? 1.2 : 1.9);
      this.bullets.push({ x, z, vx, vz, dmg, rocket, color, mesh });
    }
    shoot() {
      const w = FL.WEAPONS[this.lo.weapon];
      this.shotCount++;
      // Vor der Basis zielt der Held von selbst auf das nächste Gebäude, wenn kein Gegner vor ihm steht.
      let vx = 0;
      if (this.fortActive() && !this.enemies.some(e => e.dying < 0 && Math.abs(e.x - this.x) < 1.3)) {
        const s = this.nearestStructure(this.x);
        if (s && Math.abs(s.x - this.x) > s.r * 0.6) vx = (s.x + FL.rand(-0.5, 0.5) * s.r - this.x) / ((s.zw - this.scroll - 1) / 75);
      }
      for (let i = 0; i < w.shots; i++) {
        const off = w.shots === 1 ? 0 : -w.spread + 2 * w.spread * i / (w.shots - 1);
        this.addBullet(this.x - 0.2 + off, 1.0, vx, 75, w.dmg, w.color, false, this.lo.weapon >= 4);
      }
      if (w.rocket && this.shotCount % w.rocket === 0) this.addBullet(this.x - 0.2, 1.0, vx * 50 / 75, 50, 4, 0xff9628, true);
      this.muzzleT = 0.06;
      FL.audio.play(this.lo.weapon === 4 || this.lo.weapon === 5 ? 'laser' : 'shot');
    }
    nearestStructure(x) {
      let best = null, bd = 1e9;
      for (const s of this.structures) {
        if (!s.alive || !s.key) continue;
        const front = this.structures.find(o => o.alive && o.row === 0 && Math.abs(o.x - s.x) < o.r);
        const t = s.row === 1 && front ? front : s;
        const d = Math.abs(t.x - x) + (t.row ? 4 : 0);
        if (d < bd) { bd = d; best = t; }
      }
      return best;
    }
    allyShoot(a) {
      const w = FL.WEAPONS[Math.max(0, this.lo.weapon - 1)];
      const near = this.enemies.filter(e => e.dying < 0 && Math.abs(e.x - a.x) < 3.2 && e.z < Z_FAR - 3);
      let vx = 0;
      if (near.length) {
        const tg = near.reduce((p, e) => e.z < p.z ? e : p);
        vx = (tg.x - a.x) / Math.max(0.15, (tg.z - ALLY_Z) / 65);
      } else if (this.fortActive()) {
        const s = this.nearestStructure(a.x);
        if (!s) return;
        vx = (s.x + FL.rand(-s.r, s.r) * 0.6 - a.x) / ((s.zw - this.scroll - ALLY_Z) / 65);
      } else return;
      for (let k = 0; k < w.shots; k++) this.addBullet(a.x + (k - (w.shots - 1) / 2) * 0.3, ALLY_Z + 0.8, vx, 65, w.dmg, w.color);
    }
    pickTarget(x) {
      let best = null;
      for (const e of this.enemies) if (e.dying < 0 && e.z < Z_FAR - 1 && (!best || e.z < best.z)) best = e;
      return best;
    }
    aimPoint(tg, x) {
      if (tg) return [tg.x, Math.max(BREACH_Z + 1.5, tg.z - tg.speed * 0.7)];
      if (this.fortActive()) { const s = this.nearestStructure(x || 0); if (s) return [s.x + FL.rand(-1, 1), s.zw - this.scroll]; }
      return [FL.rand(-4, 4), FL.rand(16, 34)];
    }
    lob(x, y, z, tg, dmg, radius, kind, delay, dur) {
      const [ax, az] = this.aimPoint(tg, x);
      const mesh = kind === 'rocket' ? FL.rocketModel() : kind === 'bomb' ? FL.bombModel() : FL.shellModel(0.17);
      mesh.visible = false; this.stage.add(mesh);
      this.shells.push({ kind, x, y, z, sx: x, sy: y, sz: z, tx: ax, tz: az, t: -(delay || 0), dur: dur || 0.9, target: tg, dmg, radius, mesh });
    }
    fireTowers() {
      const lvl = this.lo.towers;
      if (!this.towersOn || !lvl || this.towerCd > 0 || this.advancing) return;
      const tw = FL.TOWER_LEVELS[lvl - 1];
      this.towerCd = tw.reload; this.shake = 0.15;
      FL.audio.play('cannon');
      const tg = this.enemies.filter(e => e.dying < 0 && e.z < Z_FAR - 1).sort((a, b) => a.z - b.z);
      this.towerMeshes.forEach((m, ti) => {
        for (let k = 0; k < tw.n; k++) this.lob(m.position.x, 3.6, m.position.z, tg.length ? tg[(ti * tw.n + k) % tg.length] : null, tw.dmg, tw.radius, tw.kind, k * 0.12);
        this.fx.spark(m.position.x, 3.8, m.position.z + 2, 3);
      });
    }
    useSpecial(i) {
      const sp = FL.SPECIALS[i], lvl = this.lo[sp.id];
      if (!lvl) { FL.hud.msg(sp.name + ' hast du noch nicht gekauft', C.muted, true); return; }
      if (this.specialCd[i] > 0 || this.advancing) return;
      this.specialCd[i] = sp.reload * (lvl > 1 ? 0.7 : 1) * (this.kind === 'defend' && this.lo.radar ? 0.75 : 1);
      FL.audio.play('up');
      if (i === 0) {
        for (let k = 0; k < 5; k++) { const mesh = FL.droneModel(); mesh.visible = false; this.stage.add(mesh); this.aircraft.push({ kind: 'drone', x: this.x + (k - 2) * 1.2, y: 3, z: -1, t: -k * 0.15, life: 9, target: null, mesh }); }
        FL.hud.msg('Drohnen gestartet!', C.cyan, true);
      } else if (i === 1) {
        const mesh = FL.heliModel(); mesh.rotation.y = -Math.PI / 2; this.stage.add(mesh);
        this.aircraft.push({ kind: 'heli', x: 24, y: 10, z: 13, t: 0, life: 9, fire: 0, mesh });
        FL.hud.msg('Kampfhubschrauber im Anflug!', C.cyan, true);
      } else if (i === 3) {
        this.barrage = { n: 10, cd: 0.9 };
        FL.audio.play('cannon');
        FL.hud.msg('Artillerie feuert!', C.orange);
      } else {
        const mesh = FL.jetModel(0x6a7682, 0x3a4450); this.stage.add(mesh);
        this.aircraft.push({ kind: 'bomber', x: 0, y: 16, z: -40, t: 0, life: 5, drop: 0, mesh });
        FL.audio.play('jet');
        FL.hud.msg('Kampfbomber!', C.orange);
      }
    }
    fireVehicle(v) {
      const any = this.enemies.some(e => e.dying < 0 && e.z < Z_FAR - 1);
      if (!any && !(this.fortActive() && this.keyLeft())) return;
      if (v.kind === 'tank') {
        v.fireCd = 1.8; FL.audio.play('cannon');
        this.lob(v.x, 2, v.z + 3, this.pickTarget(v.x), 8, 3.4, 'shell', 0, 0.6);
        this.fx.spark(v.x, 2, v.z + 4.2, 2.5);
      } else {
        v.fireCd = 4.5;
        const tg = this.enemies.filter(e => e.dying < 0 && e.z < Z_FAR - 1).sort((a, b) => b.hp - a.hp);
        for (let k = 0; k < 4; k++) this.lob(v.x, 2.6, v.z - 0.5, tg.length ? tg[k % tg.length] : null, 6, 3.6, 'rocket', k * 0.15);
      }
    }

    // ---------------------------------------------------------------- Ablauf: Wellen und Vorrücken
    startWave() {
      this.wave++; this.waveSpawned = 0; this.secT = 0; this.spawnCd = 3;
      this.waveSize = Math.round(14 + 5 * (this.wave - 1) + 5 * this.tier);
      FL.hud.msg('Welle ' + this.wave + ' von ' + this.cfg.waves, C.gold);
    }
    advance() {
      if (!this.secured || this.advancing) return;
      this.secured = false; this.advancing = 4;
      FL.audio.play('up'); FL.hud.msg('Vorrücken!', C.gold);
    }
    finishAdvance() {
      this.section++; this.secKills = 0; this.secT = 0; this.spawnCd = 2.5;
      for (const m of [...this.allies, ...this.vehicles]) { m.down = false; m.hp = m.max; }
      this.hero.hp = this.hero.max;
      if (this.section === this.nSec - 1) FL.hud.msg('Die Basis liegt vor dir: Zerstöre alle Gebäude!', C.red);
      else FL.hud.msg('Abschnitt ' + (this.section + 1) + ' von ' + this.nSec, C.gold);
    }
    onKey(code) {
      if (code === 'KeyT') { this.towersOn = !this.towersOn; FL.save.towersOn = this.towersOn; FL.store(); FL.hud.msg('Geschütze ' + (this.towersOn ? 'AN' : 'AUS'), C.text, true); for (const m of this.towerMeshes) m.visible = this.towersOn; }
      else if (code === 'KeyX' || code === 'KeyC') this.fireTowers();
      else if (code === 'Digit1' || code === 'Numpad1') this.useSpecial(0);
      else if (code === 'Digit2' || code === 'Numpad2') this.useSpecial(1);
      else if (code === 'Digit3' || code === 'Numpad3') this.useSpecial(2);
      else if (code === 'Digit4' || code === 'Numpad4') this.useSpecial(3);
      else if (code === 'KeyV') this.advance();
    }

    // ---------------------------------------------------------------- ein Zeitschritt
    update(dt) {
      if (this.result) return;
      const lo = this.lo, fx = this.fx;
      this.t += dt; this.secT += dt;
      this.fireCd -= dt; this.towerCd = Math.max(0, this.towerCd - dt);
      for (let i = 0; i < 4; i++) this.specialCd[i] = Math.max(0, this.specialCd[i] - dt);
      // Artillerie-Salve: Die Granaten kommen nacheinander von weit hinten
      if (this.barrage && !this.advancing) {
        const q = this.barrage; q.cd -= dt;
        if (q.cd <= 0) {
          q.cd = 0.34; q.n--;
          const pool = this.enemies.filter(e => e.dying < 0 && e.z < Z_FAR - 1);
          this.lob(FL.rand(-9, 9), 36, -34, pool.length ? FL.pick(pool) : null, 12, 4.6, 'shell', 0, 1.5);
          if (q.n <= 0) this.barrage = null;
        }
      }
      this.muzzleT -= dt; this.shake = Math.max(0, this.shake - dt); this.invuln = Math.max(0, this.invuln - dt);

      this.ducking = FL.down('ArrowDown', 'KeyS') && !this.advancing;
      let moving = !!this.advancing;
      if (!this.ducking) {
        if (FL.down('ArrowLeft', 'KeyA')) { this.x += 7 * dt; moving = true; }
        if (FL.down('ArrowRight', 'KeyD')) { this.x -= 7 * dt; moving = true; }
      }
      // Wischen auf dem iPad: Der Trupp folgt dem Finger (nach rechts wischen = nach rechts laufen)
      if (FL.touch.swipe) {
        const K = (2 * ROAD) / (window.innerWidth * 0.4);            // so viele Meter pro Pixel
        if (this.ducking || this.advancing) FL.touch.swipe = 0;
        else {
          const want = FL.clamp(FL.touch.swipe * K, -3, 3), step = FL.clamp(want, -18 * dt, 18 * dt);
          this.x -= step; FL.touch.swipe = (want - step) / K;
          if (Math.abs(step) > 0.002) moving = true; else FL.touch.swipe = 0;
        }
      }
      this.x = FL.clamp(this.x, -ROAD + 0.3, ROAD - 0.3);
      const squad = this.members();

      if (this.ducking) this.hero.hp = Math.min(this.hero.max, this.hero.hp + 1.2 * dt);
      else if (FL.down('Space') && this.fireCd <= 0 && !this.advancing) { this.fireCd = FL.WEAPONS[lo.weapon].rate; this.shoot(); }

      // Kameraden aufhelfen, Fahrzeuge reparieren
      let helping = null;
      if (FL.down('KeyE') && !this.advancing) helping = squad.find(m => m.down && Math.abs(m.x - this.x) < 3.2) || null;
      for (const m of squad) {
        m.hitT = Math.max(0, m.hitT - dt);
        if (!m.down) continue;
        m.downT += dt;
        const need = (isVeh(m) ? 2 : 1.2) * (lo.medkit ? 0.5 : 1);
        if (m === helping) m.revive += dt; else m.revive = Math.max(0, m.revive - dt);
        const auto = this.kind === 'defend' && lo.medic && !isVeh(m) && m.downT > 7;
        if (m.revive >= need || auto) {
          m.down = false; m.hp = m.max; FL.audio.play('up');
          FL.hud.msg(isVeh(m) ? 'Repariert!' : 'Kamerad ist wieder dabei!', C.green, true);
        }
      }

      // Kameraden, Fahrzeuge und MG-Nester schießen von selbst
      const busy = this.enemies.some(e => e.dying < 0 && e.z < Z_FAR - 3) || (this.fortActive() && this.keyLeft() > 0);
      for (const a of this.allies) {
        if (a.down || this.ducking || this.advancing) continue;
        a.fireCd -= dt;
        if (a.fireCd <= 0 && busy) { a.fireCd = FL.WEAPONS[Math.max(0, lo.weapon - 1)].rate * 1.4 * FL.rand(0.9, 1.1); this.allyShoot(a); }
      }
      for (const v of this.vehicles) {
        if (v.down || this.advancing) continue;
        v.fireCd -= dt;
        if (v.fireCd <= 0) { v.fireCd = 0.5; this.fireVehicle(v); }
      }
      if (this.nests && this.nests.length) {
        this.nestCd -= dt;
        if (this.nestCd <= 0) {
          this.nestCd = 0.24;
          for (const n of this.nests) {
            const tg = this.enemies.filter(e => e.dying < 0 && e.z < 40).sort((a, b) => a.z - b.z)[0];
            if (!tg) continue;
            const dx = tg.x - n.position.x, dz = tg.z - n.position.z, d = Math.hypot(dx, dz);
            n.userData.gun.rotation.y = Math.atan2(dx, dz);
            this.addBullet(n.position.x, n.position.z + 0.5, dx / d * 65, dz / d * 65, 1, 0xffe68c);
          }
        }
      }

      // Vorrücken zum nächsten Abschnitt
      if (this.advancing) {
        const step = SEC / 4 * dt;
        this.advancing = Math.max(0, this.advancing - dt);
        this.scroll += step;
        if (this.advancing === 0) { this.scroll = Math.round(this.scroll / SEC) * SEC; this.finishAdvance(); }
        this.world.position.z = -this.scroll;
      }

      // Nachschub an Gegnern
      if (this.kind === 'attack') {
        const last = this.section === this.nSec - 1;
        const goal = Math.round(22 + 6 * this.tier + 6 * this.section);
        this.goal = goal;
        const spawning = !this.advancing && this.endT < 0 && (last || this.secKills < goal);
        if (spawning) {
          this.spawnCd -= dt;
          if (this.spawnCd <= 0) {
            const delay = this.spawnDelay(), group = delay < 0.6 ? Math.max(1, Math.round(0.6 / delay)) : 1;
            for (let i = 0; i < group; i++) if (this.enemies.filter(e => e.dying < 0).length < this.maxEnemies()) this.spawnEnemy();
            this.spawnCd = (group > 1 ? Math.max(delay, 0.6) : delay) * (last ? 1.7 : 1);
          }
        } else if (!last && !this.advancing && !this.secured && !this.enemies.some(e => e.dying < 0)) {
          this.secured = true; FL.audio.play('up');
          FL.hud.msg('Gebiet gesichert!', C.green); FL.hud.msg('Drücke V zum Vorrücken', C.text, true);
        }
      } else if (this.endT < 0) {
        if (this.waveBreak > 0) {
          this.waveBreak -= dt;
          if (this.waveBreak <= 0) this.startWave();
        } else if (this.waveSpawned < this.waveSize) {
          this.spawnCd -= dt;
          if (this.spawnCd <= 0) {
            if (this.enemies.filter(e => e.dying < 0).length < this.maxEnemies()) this.spawnEnemy();
            this.spawnCd = this.spawnDelay();
          }
        } else if (!this.enemies.some(e => e.dying < 0)) {
          if (this.wave >= this.cfg.waves) { this.endT = 2.5; FL.hud.msg('BASIS GEHALTEN!', C.gold); }
          else {
            this.waveBreak = 5; FL.audio.play('up');
            FL.hud.msg('Welle abgewehrt!', C.green);
            for (const m of [...this.allies, ...this.vehicles]) { m.down = false; m.hp = m.max; }
          }
        }
      }

      // Die Basis schießt zurück, solange Türme oder das Hauptgebäude stehen
      if (this.fortActive()) {
        this.fortCd -= dt;
        if (this.fortCd <= 0) {
          const guns = this.structures.filter(s => s.alive && (s.kind === 'tower' || s.kind === 'hq' || s.kind === 'bunker' || s.kind === 'gate'));
          this.fortCd = guns.length ? Math.max(0.5, 3.2 / guns.length) : 99;
          if (guns.length) { const s = FL.pick(guns); this.enemyFire({ x: s.x, z: s.zw - this.scroll - 1, gun: s.kind === 'hq' || s.kind === 'bunker' ? 'granate' : 'mg', fort: true }); }
        }
      }

      // Gegner bewegen und schießen lassen
      for (const e of this.enemies) {
        e.hitT = Math.max(0, e.hitT - dt);
        if (e.dying >= 0) {
          e.dying += dt;
          const k = Math.max(0, 1 - e.dying / 0.22);
          e.mesh.scale.setScalar((e.vehicle ? 0.8 : 1) * k + 0.001);
          if (e.dying > 0.25) e.gone = true;
          continue;
        }
        if (this.advancing) { e.z -= SEC / 4 * dt; e.mesh.position.z = e.z; continue; }
        const stop = e.kind === 'panzer' ? 16 : BREACH_Z - 1;
        const walking = e.z > stop;
        if (walking) e.z -= e.speed * dt;
        e.x = FL.clamp(e.baseX + Math.sin(this.t * 0.7 + e.phase) * (e.vehicle ? 0.6 : 1.2), -ROAD + 0.4, ROAD - 0.4);
        e.mesh.position.set(e.x, 0, e.z);
        if (!e.vehicle) FL.animSoldier(e.mesh, this.t, walking, false);
        if (e.z < Z_FAR - 2) {
          e.fireCd -= dt;
          if (e.fireCd <= 0) { e.fireCd = FL.rand(0.7, 1.3) / (e.rate * (1.2 + 0.12 * this.tier)); this.enemyFire(e); }
        }
        if (e.z < BREACH_Z) {
          e.gone = true;
          FL.hud.damage(0.8); FL.audio.play('alarm');
          if (this.kind === 'defend') this.baseHp -= e.vehicle ? 3 : 1; else this.lives--;
          FL.hud.msg('Durchgebrochen!', C.red, true);
          this.checkLose();
        }
      }

      // eigene Kugeln
      const fort = this.fortActive(), fz = this.fortZw - this.scroll;
      for (const b of this.bullets) {
        const z0 = b.z;
        b.z += b.vz * dt; b.x += b.vx * dt;
        for (const e of this.enemies) {
          if (e.dying >= 0) continue;
          if (z0 - 0.5 <= e.z && e.z <= b.z + 0.5 && Math.abs(e.x - b.x) < (e.vehicle ? 1.6 : 0.7)) {
            b.gone = true;
            if (b.rocket) this.explode(b.x, e.z, 3.2, b.dmg);
            else { this.damage(e, b.dmg); fx.spark(b.x, 1.3, e.z - 0.3, 0.8); }
            break;
          }
        }
        if (!b.gone && fort && b.z >= fz - 1) {
          for (const s of this.structures) {
            if (!s.alive) continue;
            const sz = s.zw - this.scroll;
            if (b.z >= sz - (s.row ? 4 : 1) && Math.abs(s.x - b.x) < s.r) {
              b.gone = true; this.damageStructure(s, b.rocket ? b.dmg * 3 : b.dmg);
              fx.spark(b.x, 1.6 + Math.random(), sz - (s.row ? 4 : 0.8), 1.1);
              if (b.rocket) fx.explosion(b.x, 2, sz - 1, 0.7, true);
              break;
            }
          }
        }
        if (b.z > Z_FAR + 30) b.gone = true;
        if (b.gone) fx.freeShot(b.mesh);
        else { b.mesh.position.set(b.x, 1.35, b.z); b.mesh.rotation.y = Math.atan2(b.vx, b.vz); }
      }
      this.bullets = this.bullets.filter(b => !b.gone);

      // gegnerische Kugeln, Raketen, Granaten
      for (const b of this.ebullets) {
        b.t += dt;
        if (b.t < 0) continue;
        const dist = Math.max(0.1, b.sz - b.tz), k = Math.min(1, b.t * b.speed / dist);
        const x = b.sx + (b.tx - b.sx) * k, z = b.sz + (b.tz - b.sz) * k;
        const y = (b.h0 + (1.2 - b.h0) * k) + (b.kind === 'granate' ? Math.sin(k * Math.PI) * 4 : 0);
        b.mesh.visible = true; b.mesh.position.set(x, y, z);
        if (b.kind === 'granate') FL.aimShell(b, x, y, z); else b.mesh.rotation.y = Math.atan2(b.tx - b.sx, b.tz - b.sz);
        if (b.kind === 'rakete' && Math.random() < 0.5) fx.puff('white', x, y, z + 0.6, 0.5, 0.4, 0, 0.3, 0, 1.5);
        const m = b.target, soldier = !isVeh(m);
        if (this.ducking && soldier && z <= COVER_Z + 0.3) {
          b.gone = true; FL.audio.play('ping'); fx.spark(x, 0.9, COVER_Z + 0.4, 1);
        } else if (k >= 1) {
          b.gone = true;
          if (b.kind === 'rakete' || b.kind === 'granate') {
            const r = b.kind === 'rakete' ? 1.5 : 2.0;
            fx.explosion(x, 0.3, z, 0.6); FL.audio.play('boom');
            for (const mm of this.members()) if (Math.abs(mm.x - x) < r + (isVeh(mm) ? 1 : 0) && Math.abs(mm.z - z) < 2 && !(this.ducking && !isVeh(mm))) this.hurt(mm, 2);
          } else if (Math.abs(m.x - x) < (soldier ? 0.5 : 1.8)) this.hurt(m, 1);
        }
        if (b.gone) { if (b.kind === 'gewehr' || b.kind === 'mg') fx.freeShot(b.mesh); else this.stage.scene.remove(b.mesh); }
      }
      this.ebullets = this.ebullets.filter(b => !b.gone);

      // Granaten, Raketen und Bomben der eigenen Seite
      for (const s of this.shells) {
        s.t += dt;
        if (s.t < 0) continue;
        s.mesh.visible = true;
        if (s.kind === 'rocket') {
          let tg = s.target;
          if (!tg || tg.dying >= 0) { tg = s.target = this.enemies.filter(e => e.dying < 0 && e.z < Z_FAR).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0] || null; }
          if (tg) { s.tx = tg.x; s.tz = tg.z; }
          const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz) || 1, step = 38 * dt;
          s.x += dx / d * Math.min(step, d); s.z += dz / d * Math.min(step, d);
          s.y = Math.max(1, s.y - dt * 4);
          s.mesh.rotation.y = Math.atan2(dx, dz);
          if (Math.random() < 0.6) fx.puff('white', s.x, s.y, s.z, 0.6, 0.45, 0, 0.4, 0, 1.6);
          if (d < 0.8 || s.t > 4) { s.gone = true; this.explode(s.x, s.z, s.radius, s.dmg); }
        } else {
          const k = Math.min(1, s.t / s.dur);
          s.x = s.sx + (s.tx - s.sx) * k; s.z = s.sz + (s.tz - s.sz) * k;
          s.y = s.kind === 'bomb' ? s.sy * (1 - k * k) : s.sy * (1 - k) + Math.sin(k * Math.PI) * 7;
          if (k >= 1) { s.gone = true; this.explode(s.x, s.z, s.radius, s.dmg); }
        }
        s.mesh.position.set(s.x, s.y, s.z);
        if (s.kind !== 'rocket') FL.aimShell(s, s.x, s.y, s.z);
        if (s.gone) this.stage.scene.remove(s.mesh);
      }
      this.shells = this.shells.filter(s => !s.gone);

      this.updateAircraft(dt);
      for (const e of this.enemies) if (e.gone) this.stage.scene.remove(e.mesh);
      this.enemies = this.enemies.filter(e => !e.gone);

      // brennende Trümmer, drehende Radarschüsseln
      for (const b of this.burning) { b.t -= dt; if (Math.random() < dt * 5) fx.smoke(b.x + FL.rand(-1, 1) * b.size * 0.5, 1, b.zw - this.scroll, b.size); }
      this.burning = this.burning.filter(b => b.t > 0);
      for (const s of this.spinners) s.rotation.y += dt * 1.5;
      for (const v of this.vehicles) if (v.down && Math.random() < dt * 4) fx.smoke(v.x, 2, v.z, 1.6);

      if (this.endT >= 0) { this.endT -= dt; if (this.endT <= 0) this.result = 'win'; }

      // Figuren bewegen
      for (const m of squad) {
        const veh = isVeh(m);
        if (!veh) {
          m.mesh.position.set(m.x, 0, m.z);
          FL.animSoldier(m.mesh, this.t, moving && !m.down, this.ducking || m.down);
          m.mesh.visible = !(m === this.hero && this.invuln > 0 && Math.floor(this.t * 12) % 2);
        }
        m.icon.visible = m.down;
        if (m.down) {
          const near = Math.abs(m.x - this.x) < 3.2;
          const s = (near ? 1.1 : 0.8) + Math.sin(this.t * 6) * 0.08 + m.revive * 0.5;
          m.icon.scale.set(s, s, 1); m.icon.position.set(m.x, veh ? 4 : 2.3, m.z);
        }
      }
      this.muzzle.visible = this.muzzleT > 0 && !this.ducking;
      if (this.muzzle.visible) { this.muzzle.position.set(this.x - 0.2, 1.55, 1.3); this.muzzle.material.color.set(FL.WEAPONS[lo.weapon].color); }
      fx.update(dt);
      this.updateCamera(dt);
      this.updateHud();
    }

    updateAircraft(dt) {
      for (const a of this.aircraft) {
        a.t += dt; a.life -= dt;
        if (a.t < 0) continue;
        a.mesh.visible = true;
        if (a.kind === 'drone') {
          let tg = a.target;
          if (!tg || tg.dying >= 0) {
            const taken = new Set(this.aircraft.filter(o => o !== a && o.target).map(o => o.target));
            const pool = this.enemies.filter(e => e.dying < 0 && e.z < Z_FAR);
            const free = pool.filter(e => !taken.has(e));
            tg = a.target = (free.length ? free : pool).sort((p, q) => q.hp - p.hp)[0] || null;
          }
          let tx = a.x, ty = a.y, tz = a.z + 6, st = null;
          if (tg) { tx = tg.x; ty = 1; tz = tg.z; }
          else if (this.fortActive() && (st = this.nearestStructure(a.x))) { tx = st.x; ty = 2; tz = st.zw - this.scroll - 1; }
          const dx = tx - a.x, dy = ty - a.y, dz = tz - a.z, d = Math.hypot(dx, dy, dz) || 1, step = 26 * dt;
          a.x += dx / d * Math.min(step, d); a.y += dy / d * Math.min(step, d); a.z += dz / d * Math.min(step, d);
          a.mesh.rotation.y = Math.atan2(dx, dz);
          if ((tg || st) && d < 0.9) { a.life = 0; this.explode(a.x, a.z, 3, 10, a.y); }
        } else if (a.kind === 'heli') {
          a.x -= 5.5 * dt; a.fire -= dt;
          a.mesh.userData.rotor.rotation.y += dt * 30; a.mesh.userData.tail.rotation.x += dt * 40;
          a.mesh.rotation.z = 0.12;
          if (a.fire <= 0 && a.t > 1 && a.t < 7.5) { a.fire = 0.35; this.lob(a.x, a.y - 1, a.z, this.pickTarget(a.x), 9, 3.8, 'rocket'); }
        } else {
          a.z += 30 * dt; a.drop -= dt;
          const end = this.fortActive() ? this.fortZw - this.scroll + 12 : Z_FAR;
          if (a.drop <= 0 && a.z > 2 && a.z < end - 6) {
            a.drop = 0.13;
            for (const bx of [-3.6, 0, 3.6]) {
              const mesh = FL.bombModel(); this.stage.add(mesh);
              this.shells.push({ kind: 'bomb', x: bx, y: a.y, z: a.z, sx: bx, sy: a.y, sz: a.z, tx: bx, tz: a.z + 9, t: 0, dur: 0.7, target: null, dmg: 15, radius: 4.2, mesh });
            }
          }
        }
        a.mesh.position.set(a.x, a.y, a.z);
      }
      for (const a of this.aircraft) if (a.life <= 0) this.stage.scene.remove(a.mesh);
      this.aircraft = this.aircraft.filter(a => a.life > 0);
    }

    updateCamera(dt) {
      const cam = this.stage.camera, cx = this.x * 0.45;
      const sh = this.shake > 0 ? this.shake * 1.2 : 0;
      cam.position.set(cx + FL.rand(-sh, sh), 5.7 + FL.rand(-sh, sh), -10.8);
      cam.lookAt(cx, 1.7, 16);
      this.stage.update(new THREE.Vector3(0, 0, 22));
    }

    updateHud() {
      const lo = this.lo, H = FL.hud, w = FL.WEAPONS[lo.weapon];
      const hp = this.hero.hp / this.hero.max;
      const up = this.allies.filter(a => !a.down).length + 1;
      let tl = `<div class="hud-big"><span class="coins">${this.coins}</span></div>`;
      tl += this.kind === 'attack' ? `<div>Leben ${H.hearts(this.lives, 4 + lo.lives)}</div>` : `<div>Basis</div>${H.meter(this.baseHp / this.baseMax, this.baseHp / this.baseMax < 0.35 ? 'red' : 'cyan')}`;
      tl += `<div>Gesundheit</div>${H.meter(hp, hp < 0.3 ? 'red' : hp < 0.6 ? 'gold' : '')}`;
      tl += `<div><b style="color:#${w.color.toString(16).padStart(6, '0')}">${w.name}</b> · Armee ${up}/${this.allies.length + 1}</div>`;
      H.set(this.hTL, tl);

      let tc = '';
      if (this.kind === 'attack') {
        tc += '<div class="route">';
        for (let i = 0; i <= this.nSec; i++) {
          if (i) tc += `<div class="seg ${i <= this.section ? 'on' : ''}"></div>`;
          tc += `<div class="dot ${i <= this.section ? 'on' : ''}"></div>`;
        }
        tc += '</div>';
        if (this.section === this.nSec - 1) {
          const key = this.structures.filter(s => s.key);
          const frac = key.reduce((a, s) => a + Math.max(0, s.hp), 0) / key.reduce((a, s) => a + s.max, 0);
          tc += `<div>Gegnerische Basis · noch ${this.keyLeft()} Gebäude</div>${H.meter(frac, 'red')}`;
        } else if (this.secured) tc += '<div style="color:#5fd07a">Gebiet gesichert! V = vorrücken</div>';
        else if (this.advancing) tc += '<div>Die Armee rückt vor …</div>';
        else tc += `<div>Gebiet sichern</div>${H.meter(this.secKills / (this.goal || 1))}`;
      } else {
        tc += `<div>Welle ${this.wave} von ${this.cfg.waves}</div>`;
        const left = this.waveSize - this.waveSpawned + this.enemies.filter(e => e.dying < 0).length;
        tc += this.waveBreak > 0 ? '<div style="color:#5fd07a">Nächste Welle kommt gleich …</div>' : H.meter(1 - left / Math.max(1, this.waveSize), 'gold');
      }
      H.set(this.hTC, tc);

      let tr = '';
      FL.SPECIALS.forEach((sp, i) => {
        const lvl = lo[sp.id];
        if (!lvl) { tr += `<div class="slot"><b>${sp.key}</b>${sp.name}: nicht gekauft</div><br>`; return; }
        const total = sp.reload * (lvl > 1 ? 0.7 : 1), ready = this.specialCd[i] <= 0;
        tr += `<div class="slot ${ready ? 'ready' : ''}"><b>${sp.key}</b>${sp.name}${ready ? '' : `<i style="width:${Math.round((1 - this.specialCd[i] / total) * 100)}%"></i>`}</div><br>`;
      });
      H.set(this.hTR, tr);

      let bc = '';
      if (lo.towers > 0) {
        const tw = FL.TOWER_LEVELS[lo.towers - 1];
        if (!this.towersOn) bc = '<span class="muted">Geschütze AUS (T)</span>';
        else if (this.towerCd <= 0) bc = `<b style="color:#46dcff">${this.kind === 'attack' ? 'Geschützwagen' : tw.name} bereit (X)</b>`;
        else bc = `Geschütze laden …${H.meter(1 - this.towerCd / tw.reload, 'cyan')}`;
      }
      this.hBC.style.display = bc ? '' : 'none';
      H.set(this.hBC, bc);
      this.hCover.style.display = this.ducking ? '' : 'none';
    }

    destroy() { this.stage.dispose(); }
  };
})();
