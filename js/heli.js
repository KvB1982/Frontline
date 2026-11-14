'use strict';
// Frontlinie 3 – Hubschrauber-Einsatz: Man fliegt den Kampfhubschrauber und unterstützt die eigenen Bodentruppen.
// Hügel und Waldstücke geben Deckung: dahinter sieht einen der Gegner nicht. Zum Schießen steigt man kurz auf und taucht wieder ab.
// Richtung wie überall: Der Kurs th zeigt nach (sin th, cos th), eine Linkskurve macht th größer.
(() => {
  const C = { gold: '#ffc43c', red: '#ef5a4c', green: '#5fd07a', cyan: '#46dcff', text: '#e9eef2', orange: '#ff8c3c', muted: '#9fb0bd' };
  const SKID = 2.3, CEIL = 150, PAD_R = 11, WOOD_H = 12.5;
  // wie gefährlich die einzelnen Gegner für den Hubschrauber sind: Reichweite, Zeit zum Anvisieren, Schaden, Tempo des Geschosses, größte Flughöhe
  const THREAT = { flak: { range: 300, lock: 1.7, dmg: 2, v: 120, top: 999 }, tank: { range: 170, lock: 2.6, dmg: 2, v: 130, top: 42 }, jeep: { range: 180, lock: 1.7, dmg: 1, v: 190, top: 999 }, squad: { range: 125, lock: 2.2, dmg: 1, v: 190, top: 999 } };
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1, k = FL.clamp(((px - ax) * dx + (pz - az) * dz) / l, 0, 1); return Math.hypot(px - ax - dx * k, pz - az - dz * k); };

  FL.HeliMission = class {
    constructor(cfg, lo) {
      this.cfg = cfg; this.lo = lo; this.result = null;
      this.tier = cfg.tier; this.diff = cfg.diff || 0.85;
      const sc = this.sc = cfg.sc || {};
      this.pw = (lo.p_armor + lo.p_gun + lo.p_engine + lo.p_rocket * 1.5) / 12;
      const st = this.stage = new FL.Stage(cfg.theme, { far: 1700, shadow: 110, fov: 58, fogNear: 260, fogFar: 1500 });
      this.fx = new FL.FX(st);
      this.t = 0; this.kills = 0; this.coins = 0; this.endT = -1; this.lost = false; this.rtb = false;
      this.x = 0; this.z = 0; this.y = SKID; this.th = 0; this.camTh = 0; this.vf = 0; this.vs = 0; this.vy = 0; this.yawV = 0;
      this.landed = true; this.fightOn = false; this.rotorV = 6;
      this.hpMax = this.hp = 20 + 4 * lo.p_armor; this.volleyCd = 0;
      this.gunCd = 0; this.rocketCd = 0; this.rocketMax = 4.6 - 0.6 * lo.p_rocket; this.invuln = 0; this.shake = 0; this.warn = 0; this.beepT = 0; this.cover = false; this.repT = 0;
      this.shots = []; this.rockets = []; this.eshots = []; this.structures = []; this.spinners = []; this.burning = []; this.hills = []; this.woods = [];
      this.buildWorld();
      this.heli = FL.heliModel(); this.heli.rotation.order = 'YXZ'; st.add(this.heli);
      this.lockMark = FL.sprite(FL.tex.icon('ring'), 1, { depthTest: false }); this.lockMark.material.color.set(0x5fff7a); this.lockMark.visible = false; st.add(this.lockMark);
      this.buildHud();
      FL.hud.msg('HUBSCHRAUBER STARTKLAR', C.gold); FL.hud.msg(FL.touch.active ? '„Hoch“ halten: abheben' : 'W halten: abheben', C.cyan, true);
      this.place(0); this.updateCamera(1); this.updateHud();
    }

    // ---------------------------------------------------------------- Aufbau
    buildWorld() {
      const st = this.stage, th = this.cfg.theme, tier = this.tier, sc = this.sc, fixed = !!this.cfg.fixed;
      const rnd = FL.seeded(211 + Math.round(tier * 10) + th.length * 5 + (sc.seed || 0) + (fixed || sc.seed ? 0 : Math.floor(Math.random() * 5000)));
      const sa = fixed ? 0.3 : (Math.random() * 2 - 1) * 1.0, D = 600 + 50 * Math.min(4, tier);
      const ux = Math.sin(sa), uz = Math.cos(sa), CX = ux * D, CZ = uz * D;
      this.site = { x: CX, z: CZ, a: sa };
      const gnd = st.ground(7000, FL.tex.fields(th), 420); gnd.position.set(CX / 2, 0, CZ / 2);
      // Landeplatz mit kleinem Feldlager
      const pad = new THREE.Mesh(new THREE.CircleGeometry(PAD_R, 32), new THREE.MeshPhongMaterial({ map: FL.tex.concrete('#6f7376'), shininess: 2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }));
      pad.rotation.x = -Math.PI / 2; pad.position.y = 0.08; pad.receiveShadow = true; st.owned.push(pad.geometry, pad.material); st.add(pad);
      const W = FL.basic(0xeeeeee);
      for (const [w, d, x, z] of [[0.9, 7, -2.6, 0], [0.9, 7, 2.6, 0], [5.2, 0.9, 0, 0]]) { const b = FL.box(w, 0.05, d, W, x, 0.14, z); b.castShadow = false; st.add(b); }
      for (const [k, x, z, r] of [['tent', -24, -8, 0], ['tent', -24, 8, 0], ['barracks', 22, -14, Math.PI / 2], ['radar', 24, 10, 0]]) {
        const b = FL.building(k, th); b.position.set(x, 0, z); b.rotation.y = r; st.add(b); if (b.userData.spin) this.spinners.push(b.userData.spin);
      }
      for (const [x, z, r] of [[-14, -6, 1.2], [-13, 5, 1.8], [15, 3, -1.5]]) { const a = FL.soldier({ team: 'ally', weapon: 1 }); a.position.set(x, 0, z); a.rotation.y = r; st.add(a); }

      // Richtung, aus der die eigenen Bodentruppen angreifen: seitlich versetzt zum eigenen Anflug
      const R = 80 + 8 * tier, oa = sa + Math.PI + (rnd() < 0.5 ? 1 : -1) * 1.05, back = R + 230;
      const lane = { ax: CX, az: CZ, bx: CX + Math.sin(oa) * (back + 60), bz: CZ + Math.cos(oa) * (back + 60) };
      // Hügel: Kegel, hinter denen man verschwinden kann
      const hillCol = th === 'winter' ? [0xc4ced6, 0xf4f7f9] : th === 'wueste' ? [0xc7a76c, 0xd9bd86] : th === 'industrie' ? [0x6f7362, 0x8a8d7c] : [0x5d7d45, 0x7d8a5c];
      const addHill = (x, z, r, h, force) => {
        if (!force) {
          if (Math.hypot(x, z) < r + 75 || Math.hypot(x - CX, z - CZ) < r + R + 45 || segDist(x, z, lane.ax, lane.az, lane.bx, lane.bz) < r + 28) return false;
          if (this.hills.some(o => Math.hypot(o.x - x, o.z - z) < (o.r + r) * 0.55)) return false;
        }
        const g = new THREE.Group(), geo = FL.geo('hill', () => new THREE.ConeGeometry(1, 1, 12));
        const c1 = new THREE.Mesh(geo, FL.mat(hillCol[0], { flat: true })); c1.scale.set(r, h + 1, r); c1.position.y = (h + 1) / 2 - 1; c1.receiveShadow = true;
        const c2 = new THREE.Mesh(geo, FL.mat(hillCol[1], { flat: true })); c2.scale.set(r * 0.42, h * 0.42, r * 0.42); c2.position.y = h * 0.79 + 0.3;
        g.add(c1, c2); g.rotation.y = rnd() * 6; g.position.set(x, 0, z); st.add(g);
        this.hills.push({ x, z, r, h });
        return true;
      };
      // ein Hügel liegt immer auf dem Anflugweg, kurz vor der gegnerischen Basis
      addHill(CX - ux * (R + 150), CZ - uz * (R + 150), 66, 46, true);
      if (sc.valley) for (let d = 170; d < D - R - 230; d += 105) for (const s of [-1, 1]) {
        const r = 58 + rnd() * 20, off = s * (r + 34 + rnd() * 10);
        addHill(ux * d + uz * off, uz * d - ux * off, r, 40 + rnd() * 26);
      }
      const nH = sc.hills === undefined ? 7 : sc.hills;
      for (let i = 0, n = 0; i < 200 && n < nH; i++) {
        const a = rnd() * 6.283, d = R + 110 + rnd() * 300, r = 42 + rnd() * 38;
        if (addHill(CX + Math.sin(a) * d, CZ + Math.cos(a) * d, r, Math.min(r * 0.85, 26 + rnd() * 34))) n++;
      }
      // Waldstücke: dicht genug, um sich dahinter zu verstecken
      const kinds = st.theme.trees, nW = sc.woods === undefined ? 5 : sc.woods;
      for (let i = 0, n = 0; i < 200 && n < nW; i++) {
        const a = rnd() * 6.283, d = R + 60 + rnd() * 260, r = 24 + rnd() * 14, x = CX + Math.sin(a) * d, z = CZ + Math.cos(a) * d;
        if (Math.hypot(x, z) < r + 60 || segDist(x, z, lane.ax, lane.az, lane.bx, lane.bz) < r + 18) continue;
        if (this.hills.some(o => Math.hypot(o.x - x, o.z - z) < o.r + r * 0.6) || this.woods.some(o => Math.hypot(o.x - x, o.z - z) < o.r + r + 12)) continue;
        this.woods.push({ x, z, r }); n++;
        for (let k = 0; k < Math.round(r * r / 26); k++) {
          const ta = rnd() * 6.283, td = Math.sqrt(rnd()) * r;
          const t = FL.tree(FL.pick(kinds), rnd, true); t.position.set(x + Math.sin(ta) * td, 0, z + Math.cos(ta) * td); t.scale.setScalar(1.55 + rnd() * 0.4);
          st.add(FL.noShadow(t));
        }
      }
      // einzelne Bäume überall, auch auf den Hügeln
      for (let i = 0; i < 300; i++) {
        const a = rnd() * 6.283, d = 40 + Math.sqrt(rnd()) * (D * 0.5 + 520), x = CX / 2 + Math.sin(a) * d, z = CZ / 2 + Math.cos(a) * d;
        if (Math.hypot(x, z) < 34 || Math.hypot(x - CX, z - CZ) < R + 10 || segDist(x, z, lane.ax, lane.az, lane.bx, lane.bz) < 20) continue;
        const t = FL.tree(FL.pick(kinds), rnd, true); t.position.set(x, this.ground(x, z) - 0.3, z); t.scale.setScalar(1.2 + rnd() * 0.5);
        st.add(FL.noShadow(t));
      }

      // gegnerische Basis: Gebäude, Flak, davor die Truppen
      const placed = [], free = (x, z) => this.ground(x, z) < 0.5 && !this.woods.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 4);
      const add = (kind, primary, rMin, rMax) => {
        for (let tries = 0; tries < 30; tries++) {
          const mesh = FL.building(kind, th), u = mesh.userData, SC = 1.25, r = u.r * SC;
          const p = FL.scatter(rnd, placed, r, 0, 0, rMin, rMax, 7);
          if (!p) return null;
          const x = CX + p[0], z = CZ + p[1];
          if (!free(x, z) || (kind === 'flak' && segDist(x, z, lane.ax, lane.az, lane.bx, lane.bz) < 14)) continue;
          mesh.scale.setScalar(SC); mesh.position.set(x, 0, z); mesh.rotation.y = Math.floor(rnd() * 4) * Math.PI / 2; st.add(mesh);
          if (u.spin) this.spinners.push(u.spin);
          const hp = Math.min(u.hp, 22) * (0.8 + 0.2 * tier) * (1 + 0.5 * this.pw);
          const s = { kind, x, z, r, h: u.h * SC, hp, max: hp, mesh, alive: true, primary, aim: 0, fcd: 0 };
          if (primary) { s.marker = FL.sprite(FL.tex.icon('target'), 8, { depthTest: false, fog: false }); s.marker.position.set(x, s.h + 6, z); st.add(s.marker); }
          this.structures.push(s);
          return s;
        }
        return null;
      };
      for (const k of sc.prim || ['hq', 'depot']) add(k, true, 0, R * 0.7);
      const nFlak = sc.flak === undefined ? 1 + Math.round(tier * 0.7) : sc.flak;
      for (let i = 0; i < nFlak; i++) add('flak', !!sc.flakPrim, 25, R + 30);
      const deco = ['barracks', 'tent', 'house', 'antenna', 'tent', 'bunker'];
      for (let i = 0; i < 4 + Math.round(tier); i++) add(deco[i % deco.length], false, 15, R + 20);
      const def = { foes: { tanks: 1 + Math.round(tier * 0.6), jeeps: 1 + Math.round(tier * 0.5), squads: 2 + Math.round(tier * 0.5) }, own: { tanks: 2 + Math.round(tier * 0.4), squads: 2 + Math.round(tier * 0.4) } };
      const sup = sc.support || def;
      this.fight = new FL.GroundFight({ stage: st, fx: this.fx, theme: th, cx: CX, cz: CZ, a: oa, front: R + 35, back, scale: 1.15, rnd,
        foes: sup.foes, own: sup.own, hpMul: (1.8 + 0.3 * tier) * (1 + 0.5 * this.pw), last: (sup.last || 150) * (0.85 / this.diff),
        onDead: (u, mine) => this.unitDead(u, mine) });
      for (const u of this.fight.foes) {
        u.primary = true; u.aim = 0; u.fcd = 0;
        u.marker = FL.sprite(FL.tex.icon('target'), 8, { depthTest: false, fog: false }); u.marker.position.set(u.x, u.h + 6, u.z); st.add(u.marker);
      }
      this.targets = [...this.structures, ...this.fight.foes];
      this.threats = this.targets.filter(s => s.unit || s.kind === 'flak');
      this.nPrimary = this.targets.filter(s => s.primary).length;
    }
    // Höhe des Bodens: Hügel sind Kegel
    ground(x, z) {
      let g = 0;
      for (const h of this.hills) { const d = Math.hypot(x - h.x, z - h.z); if (d < h.r) g = Math.max(g, h.h * (1 - d / h.r)); }
      return g;
    }
    inWood(x, z) { for (const w of this.woods) if (Math.hypot(x - w.x, z - w.z) < w.r) return true; return false; }
    // freie Sicht zwischen zwei Punkten? Hügel und Wald verdecken.
    los(ax, ay, az, bx, by, bz) {
      for (const h of this.hills) {
        if (segDist(h.x, h.z, ax, az, bx, bz) > h.r) continue;
        for (let i = 1; i < 12; i++) { const k = i / 12, x = FL.lerp(ax, bx, k), z = FL.lerp(az, bz, k), d = Math.hypot(x - h.x, z - h.z); if (d < h.r && FL.lerp(ay, by, k) < h.h * (1 - d / h.r) - 0.6) return false; }
      }
      for (const w of this.woods) {
        if (segDist(w.x, w.z, ax, az, bx, bz) > w.r) continue;
        for (let i = 1; i < 12; i++) { const k = i / 12; if (FL.lerp(ay, by, k) < WOOD_H && Math.hypot(FL.lerp(ax, bx, k) - w.x, FL.lerp(az, bz, k) - w.z) < w.r) return false; }
      }
      return true;
    }
    sees(s) { return this.los(s.x, s.h * 0.8, s.z, this.x, this.y, this.z); }

    buildHud() {
      FL.hud.clear();
      this.hTL = FL.hud.box('hud-tl'); this.hTC = FL.hud.box('hud-tc'); this.hTR = FL.hud.box('hud-tr');
      this.hInfo = FL.el('div', '', '', this.hTR);
      this.map = FL.el('canvas', 'minimap', null, this.hTR); this.map.width = this.map.height = 170;
      this.hint = FL.hud.box('hud-bl');
      this.hint.innerHTML = '↑ ↓ vor und zurück · ← → drehen · W hoch · S runter · A D seitwärts · Leertaste oder Mausklick Bordkanone · R Raketen · hinter Hügeln und Wald sieht dich der Gegner nicht · P Pause';
    }

    // ---------------------------------------------------------------- Treffer
    left() { return this.targets.filter(s => s.alive && s.primary).length; }
    scored(word) {
      if (this.rtb) return;
      const n = this.left();
      if (n === 0) {
        this.rtb = true; FL.audio.play('up');
        FL.hud.msg('BASIS EINGENOMMEN!', C.gold); FL.hud.msg('Flieg zurück und lande auf dem Landeplatz', C.cyan, true);
      } else FL.hud.msg(word + ' Noch ' + n, C.orange, true);
    }
    unitDead(u, mine) {
      if (u.team === 'own') {
        if (!this.fight.own.some(o => o.alive) && !this.rtb && !this.lost && this.endT < 0) { this.lost = true; this.endT = 2.4; FL.hud.msg('Unsere Bodentruppen mussten sich zurückziehen!', C.red); }
        else if (!this.rtb) FL.hud.msg('Unsere Truppen brauchen Hilfe!', C.orange, true);
        return;
      }
      if (u.kind !== 'squad') this.burning.push({ x: u.x, z: u.z, t: 12, size: 4 });
      this.kills++; if (mine) this.coins += u.kind === 'tank' ? 14 : u.kind === 'jeep' ? 9 : 7;
      this.scored(u.kind === 'tank' ? 'Panzer zerstört!' : u.kind === 'jeep' ? 'Fahrzeug zerstört!' : 'Trupp vertrieben!');
    }
    hit(s, d) {
      if (!s.alive) return;
      if (s.unit) { this.fight.hit(s, d, true); return; }
      s.hp -= d;
      if (s.hp > 0) return;
      s.alive = false;
      const big = s.mesh.userData.fuel || s.r > 6, size = Math.max(2, s.r * 0.5);
      this.fx.explosion(s.x, 1, s.z, size);
      for (let i = 0; i < 12; i++) this.fx.chunk(s.x + FL.rand(-s.r, s.r) * 0.6, FL.rand(1, s.h), s.z, 2.5);
      FL.audio.play(big ? 'bigboom' : 'boom');
      if (s.marker) this.stage.scene.remove(s.marker);
      this.stage.scene.remove(s.mesh);
      const rb = FL.rubble(s.r, s.h); rb.position.set(s.x, 0, s.z); this.stage.add(rb);
      this.burning.push({ x: s.x, z: s.z, t: 30, size: Math.max(4, s.r) });
      this.kills++; this.coins += s.primary ? 15 : s.kind === 'flak' ? 10 : 3;
      if (s.primary) this.scored('Ziel zerstört!'); else if (s.kind === 'flak') FL.hud.msg('Flak ausgeschaltet!', C.green, true);
    }
    blast(x, y, z, radius, dmg) {
      this.fx.explosion(x, Math.max(0.3, y), z, radius / 5);
      FL.audio.play('boom');
      for (const s of this.targets) if (s.alive) { const d = Math.hypot(s.x - x, s.z - z) - s.r * 0.7; if (d < radius) this.hit(s, dmg * (d < radius * 0.5 ? 1 : 0.5)); }
    }
    hurt(d) {
      if (this.invuln > 0 || this.lost || this.endT >= 0) return;
      this.hp -= d; this.invuln = 0.6; this.shake = 0.35;
      FL.hud.damage(0.6); FL.audio.play('ouch');
      if (this.hp <= 0) { this.hp = 0; this.lost = true; this.endT = 2.6; FL.hud.damage(1); FL.hud.msg('Schwer getroffen: Notlandung!', C.red); }
    }

    // ---------------------------------------------------------------- ein Zeitschritt
    update(dt) {
      if (this.result) return;
      const lo = this.lo, fx = this.fx;
      this.t += dt; this.gunCd -= dt; this.rocketCd -= dt; this.invuln -= dt; this.shake = Math.max(0, this.shake - dt);
      const active = !this.lost && this.endT < 0;
      // ---- steuern
      let fwd = FL.clamp((FL.down('ArrowUp') ? 1 : 0) - (FL.down('ArrowDown') ? 1 : 0) + FL.stick.y, -1, 1);
      let yaw = FL.clamp((FL.down('ArrowLeft') ? 1 : 0) - (FL.down('ArrowRight') ? 1 : 0) - FL.stick.x, -1, 1);
      let side = (FL.down('KeyA') ? 1 : 0) - (FL.down('KeyD') ? 1 : 0);
      let up = (FL.down('KeyW') ? 1 : 0) - (FL.down('KeyS') ? 1 : 0);
      if (!active) { fwd = yaw = side = 0; up = this.lost ? -0.7 : 0; }
      if (this.landed) {
        fwd = yaw = side = 0;
        if (up > 0 && active) { this.landed = false; FL.audio.play('up'); FL.hud.msg('Abgehoben!', C.green, true); if (!this.told) { this.told = true; FL.hud.msg(this.siteText(), C.gold, true); } }
      }
      const vMax = 30 + 3 * lo.p_engine, k = 1 - Math.exp(-1.7 * dt);
      this.vf = FL.lerp(this.vf, fwd * (fwd > 0 ? vMax : 13), k); this.vs = FL.lerp(this.vs, side * 15, k);
      this.vy = FL.lerp(this.vy, this.landed ? 0 : up * 15, 1 - Math.exp(-3.2 * dt));
      this.yawV = FL.lerp(this.yawV, yaw * 1.45, 1 - Math.exp(-5 * dt));
      this.th = wrap(this.th + this.yawV * dt);
      const sin = Math.sin(this.th), cos = Math.cos(this.th);
      const vx = sin * this.vf + cos * this.vs, vz = cos * this.vf - sin * this.vs;
      this.vx = vx; this.vz = vz;
      this.x += vx * dt; this.z += vz * dt; this.y += this.vy * dt;
      // nicht aus dem Einsatzgebiet hinaus
      const mx = this.site.x / 2, mz = this.site.z / 2, far = Math.hypot(this.x - mx, this.z - mz), lim = Math.hypot(mx, mz) + 560;
      if (far > lim) { this.x = mx + (this.x - mx) * lim / far; this.z = mz + (this.z - mz) * lim / far; if (this.t - (this.farT || -9) > 4) { this.farT = this.t; FL.hud.msg('Zurück zum Einsatzgebiet!', C.text, true); } }
      // Boden, Hügel und Baumkronen: Der Hubschrauber steigt von selbst darüber, er stürzt nicht ab
      const gy = this.ground(this.x, this.z) + SKID, fl = this.inWood(this.x, this.z) ? Math.max(gy, WOOD_H + 3) : gy;
      this.floorY = fl;
      if (this.y < fl) { this.y = Math.min(fl, this.y + 45 * dt); if (this.vy < 0) this.vy = 0; }
      if (this.y > CEIL) { this.y = CEIL; this.vy = Math.min(0, this.vy); }
      const onGround = this.y <= fl + 0.05 && !this.landed;
      if (onGround && up <= 0 && Math.hypot(vx, vz) < 6 && fl < SKID + 0.5 && (active || this.lost)) {
        // aufgesetzt
        this.landed = true; this.vf = this.vs = 0; this.y = fl;
        const home = Math.hypot(this.x, this.z) < PAD_R;
        if (active) {
          FL.audio.play('hit');
          if (this.rtb && home) { this.endT = 1.6; FL.audio.play('coin'); FL.hud.msg('EINSATZ GESCHAFFT!', C.gold); }
          else if (this.rtb) FL.hud.msg('Hier nicht: Lande auf dem Landeplatz (grüner Punkt)', C.orange, true);
          else if (home && this.hp < this.hpMax) FL.hud.msg('Die Mechaniker reparieren den Hubschrauber', C.green, true);
        }
      }
      if (this.landed && active && !this.rtb && Math.hypot(this.x, this.z) < PAD_R && this.hp < this.hpMax) {
        this.repT += dt; if (this.repT > 0.5) { this.repT = 0; this.hp = Math.min(this.hpMax, this.hp + 1); }
      }
      this.place(dt);

      // ---- Bodenkampf: beginnt, sobald der Hubschrauber in der Nähe ist
      const dSite = Math.hypot(this.x - this.site.x, this.z - this.site.z);
      if (!this.fightOn && dSite < 470) {
        this.fightOn = this.fight.on = true;
        FL.hud.msg('Unsere Truppen greifen an!', C.cyan); FL.hud.msg('Hilf ihnen. Bleib hinter Hügeln und Wald in Deckung', C.text, true);
      }
      this.fight.update(dt);

      // ---- Zielhilfe: das Ziel, das am besten voraus liegt und das man sehen kann
      let lock = null, best = 1e9;
      if (active && !this.landed) for (const s of this.targets) {
        if (!s.alive) continue;
        const d = Math.hypot(s.x - this.x, s.z - this.z);
        if (d > 310 || d < 8) continue;
        const rel = Math.abs(FL.bearing(this.x, this.z, this.th, s.x, s.z));
        if (rel > 0.34) continue;
        const score = rel * 500 + d * 0.4 - (s.primary ? 120 : s.kind === 'flak' ? 100 : 0) - (s === this.lock ? 60 : 0);
        if (score < best && this.sees(s)) { best = score; lock = s; }
      }
      this.lock = lock;
      this.lockMark.visible = !!lock;
      if (lock) { const ld = Math.hypot(lock.x - this.x, lock.z - this.z), ls = FL.clamp(ld * 0.06, 6, 22) * (1 + Math.sin(this.t * 14) * 0.08); this.lockMark.position.set(lock.x, lock.h * 0.5, lock.z); this.lockMark.scale.set(ls, ls, 1); }
      // ---- Bordkanone und Raketen
      const fire = FL.down('Space', 'Mouse0');
      if (active && !this.landed && fire && this.gunCd <= 0) {
        this.gunCd = 0.1;
        const ox = this.x + sin * 3.2, oy = this.y - 1, oz = this.z + cos * 3.2;
        let tx, ty, tz;
        if (lock) { const sp = Math.max(1, lock.r * 0.4); tx = lock.x + FL.rand(-sp, sp); ty = lock.h * 0.4; tz = lock.z + FL.rand(-sp, sp); }
        else { const gd = FL.clamp(this.y * 4, 60, 170); tx = this.x + sin * gd + FL.rand(-3, 3); tz = this.z + cos * gd + FL.rand(-3, 3); ty = this.ground(tx, tz); }
        const d = Math.hypot(tx - ox, ty - oy, tz - oz);
        this.shots.push({ m: fx.shot(0xffe68c, 0.3, 6), sx: ox, sy: oy, sz: oz, tx, ty, tz, t: 0, T: d / 300, tg: lock, dmg: 0.5 + 0.25 * lo.p_gun });
        FL.audio.play('shot');
      }
      if (active && !this.landed && FL.down('KeyR') && this.rocketCd <= 0) {
        this.rocketCd = this.rocketMax;
        for (const s of [-1, 1]) {
          const mesh = FL.rocketModel(); mesh.scale.setScalar(2); this.stage.add(mesh);
          const gd = FL.clamp(this.y * 4, 80, 200), gx = this.x + sin * gd, gz = this.z + cos * gd;
          this.rockets.push({ x: this.x + cos * s * 2.2, y: this.y - 0.8, z: this.z - sin * s * 2.2, target: lock, tx: gx, ty: this.ground(gx, gz), tz: gz, t: 0, mesh });
        }
        FL.audio.play('rocket'); FL.hud.msg(lock ? 'Raketen los!' : 'Raketen ohne Ziel abgefeuert', C.cyan, true);
      }
      for (const b of this.shots) {
        b.t += dt;
        const q = Math.min(1, b.t / b.T);
        b.m.position.set(FL.lerp(b.sx, b.tx, q), FL.lerp(b.sy, b.ty, q), FL.lerp(b.sz, b.tz, q)); b.m.lookAt(b.tx, b.ty, b.tz);
        if (q < 1) continue;
        b.gone = true; fx.freeShot(b.m);
        let tg = b.tg && b.tg.alive ? b.tg : null;
        if (!tg) for (const s of this.targets) if (s.alive && Math.hypot(s.x - b.tx, s.z - b.tz) < s.r) { tg = s; break; }
        if (tg) { fx.spark(b.tx, b.ty + 0.5, b.tz, 3); this.hit(tg, b.dmg * (tg.unit && tg.kind !== 'tank' ? 0.7 : 0.3)); }
        else fx.puff('dust', b.tx, b.ty + 0.5, b.tz, 3, 0.5, 0, 2, 0, 1.5);
      }
      if (this.shots.length) this.shots = this.shots.filter(b => !b.gone);
      for (const r of this.rockets) {
        r.t += dt;
        const tg = r.target && r.target.alive ? r.target : null;
        const tx = tg ? tg.x : r.tx, ty = tg ? tg.h * 0.4 : r.ty, tz = tg ? tg.z : r.tz;
        const dx = tx - r.x, dy = ty - r.y, dz = tz - r.z, d = Math.hypot(dx, dy, dz) || 1, step = 150 * dt;
        r.x += dx / d * step; r.y += dy / d * step; r.z += dz / d * step;
        r.mesh.position.set(r.x, r.y, r.z); r.mesh.lookAt(tx, ty, tz);
        if (Math.random() < 0.7) fx.puff('white', r.x, r.y, r.z, 2, 0.5, 0, 0.5, 0, 1.8);
        if (d < step + 2 || r.y < this.ground(r.x, r.z) + 0.3 || r.t > 5) { r.gone = true; this.stage.scene.remove(r.mesh); this.blast(r.x, r.y, r.z, 9, 8 + 3 * lo.p_rocket); }
      }
      if (this.rockets.length) this.rockets = this.rockets.filter(r => !r.gone);

      this.updateThreats(dt, active && !this.landed && this.fightOn);

      // ---- Rauch, Marken, Töne
      for (const b of this.burning) { b.t -= dt; if (Math.random() < dt * 4) fx.puff('smoke', b.x + FL.rand(-1, 1) * b.size * 0.4, 2, b.z, b.size * 1.8, FL.rand(2.5, 4), 1.2, FL.rand(4, 7), 0, 2); }
      if (this.burning.length) this.burning = this.burning.filter(b => b.t > 0);
      for (const s of this.spinners) s.rotation.y += dt * 1.5;
      for (const s of this.targets) if (s.alive && s.marker) {
        const sc = FL.clamp(Math.hypot(s.x - this.x, s.z - this.z) * 0.035, 4, 22) * (1 + Math.sin(this.t * 5) * 0.08);
        s.marker.scale.set(sc, sc, 1); s.marker.position.y = s.h + 3 + sc * 0.6;
      }
      if ((this.hp < this.hpMax * 0.4 || this.lost) && Math.random() < dt * 14) fx.puff('smoke', this.x - sin * 4, this.y + 0.5, this.z - cos * 4, 2.6, 1.1, 0, 1, 0, 2);
      if (this.y < this.floorY + 7 && !this.landed && Math.random() < dt * 10) { const a = Math.random() * 6.283; fx.puff('dust', this.x + Math.sin(a) * 5, this.floorY - SKID + 0.5, this.z + Math.cos(a) * 5, 3, 0.7, Math.sin(a) * 6, 0.6, Math.cos(a) * 6, 1.6); }
      FL.audio.engine('heli', this.landed ? 0.25 : 0.55 + 0.45 * Math.min(1, (Math.abs(this.vf) / 30 + Math.max(0, this.vy) / 15)));
      if (this.endT >= 0) { this.endT -= dt; if (this.endT <= 0) this.result = this.lost ? 'lose' : 'win'; }
      fx.update(dt);
      this.updateCamera(dt);
      this.updateHud();
    }

    // Gegner, die den Hubschrauber sehen, visieren ihn an und schießen erst nach einer Weile. Wer rechtzeitig abtaucht, wird nicht getroffen.
    updateThreats(dt, active) {
      const fx = this.fx;
      let warn = 0, seen = false, near = false;
      const speed = (0.85 / this.diff) / (1 + 0.3 * this.pw);
      this.volleyCd -= dt;
      for (const s of this.threats) {
        if (!s.alive) continue;
        const P = THREAT[s.kind], d = Math.hypot(s.x - this.x, s.z - this.z);
        s.fcd -= dt;
        const inRange = active && d < P.range && this.y - 0 < P.top;
        if (inRange) near = true;
        const sees = inRange && this.sees(s);
        if (sees) { seen = true; s.aim = Math.min(1, s.aim + dt / (P.lock * speed)); } else s.aim = Math.max(0, s.aim - dt * 0.9);
        if (s.kind === 'flak' && s.mesh.userData.gun && d < P.range * 1.3) s.mesh.userData.gun.rotation.y = Math.atan2(this.x - s.x, this.z - s.z) - s.mesh.rotation.y;
        warn = Math.max(warn, s.aim);
        if (!sees || s.aim < 1 || s.fcd > 0 || this.volleyCd > 0) continue;
        s.aim = 0.2; s.fcd = 2; this.volleyCd = Math.max(1, 2.6 - 0.3 * this.tier) * speed;      // nie alle auf einmal: Zwischen zwei Schüssen bleibt Zeit zum Abtauchen
        const T = Math.max(0.25, Math.hypot(d, this.y) / P.v), err = 3;
        const tx = this.x + this.vx * T + FL.rand(-err, err), ty = this.y + this.vy * T * 0.7 + FL.rand(-err, err) * 0.5, tz = this.z + this.vz * T + FL.rand(-err, err);
        const big = P.dmg > 1;
        this.eshots.push({ m: fx.shot(big ? 0xff8c3c : 0xff5a46, big ? 0.5 : 0.3, big ? 5 : 7), sx: s.x, sy: s.h, sz: s.z, tx, ty, tz, t: 0, T, dmg: P.dmg, big });
        fx.spark(s.x, s.h + 0.5, s.z, 4); FL.audio.play(big ? 'pop' : 'eshot');
      }
      for (const b of this.eshots) {
        b.t += dt;
        const q = Math.min(1, b.t / b.T);
        b.m.position.set(FL.lerp(b.sx, b.tx, q), FL.lerp(b.sy, b.ty, q), FL.lerp(b.sz, b.tz, q)); b.m.lookAt(b.tx, b.ty, b.tz);
        if (q < 1) continue;
        b.gone = true; fx.freeShot(b.m);
        if (b.big) { fx.puff('flash', b.tx, b.ty, b.tz, 8, 0.12, 0, 0, 0, 0.6); for (let i = 0; i < 4; i++) fx.puff('flak', b.tx + FL.rand(-2, 2), b.ty + FL.rand(-2, 2), b.tz + FL.rand(-2, 2), FL.rand(5, 8), FL.rand(1.2, 2), 0, FL.rand(0, 1), 0, 0.8); }
        // getroffen wird nur, wer noch dort ist und nicht inzwischen hinter einer Deckung steckt
        if (Math.hypot(b.tx - this.x, b.ty - this.y, b.tz - this.z) < (b.big ? 6.5 : 5) && this.los(b.sx, b.sy, b.sz, this.x, this.y, this.z)) this.hurt(b.dmg);
      }
      if (this.eshots.length) this.eshots = this.eshots.filter(b => !b.gone);
      this.warn = warn; this.cover = near && !seen;
      if (warn > 0.35 && active) { this.beepT -= dt; if (this.beepT <= 0) { this.beepT = 1.1 - 0.6 * warn; FL.audio.play('click'); } }
    }

    place(dt) {
      const h = this.heli, u = h.userData;
      h.position.set(this.x, this.y, this.z);
      const tp = this.vf / 33 * 0.3, tr = -this.vs / 15 * 0.25 - this.yawV * 0.14, k = Math.min(1, 6 * dt);
      h.rotation.y = this.th; h.rotation.x += (tp - h.rotation.x) * k; h.rotation.z += (tr - h.rotation.z) * k;
      h.visible = !(this.invuln > 0 && Math.floor(this.t * 14) % 2);
      this.rotorV = FL.lerp(this.rotorV, this.landed && this.endT >= 0 ? 4 : this.landed ? 14 : 32, Math.min(1, dt * 1.5));
      if (u.rotor) u.rotor.rotation.y += dt * this.rotorV; if (u.tail) u.tail.rotation.x += dt * 40;
    }
    siteText() {
      const dirs = ['Norden', 'Nordwesten', 'Westen', 'Südwesten', 'Süden', 'Südosten', 'Osten', 'Nordosten'], k = ((Math.round(this.site.a / (Math.PI / 4)) % 8) + 8) % 8;
      return `Einsatzort: ${Math.round(Math.hypot(this.site.x, this.site.z) / 10) * 10} m im ${dirs[k]}`;
    }

    updateCamera(dt) {
      const cam = this.stage.camera, sh = this.shake * 1.5;
      this.camTh += wrap(this.th - this.camTh) * (1 - Math.exp(-4 * dt));
      const sin = Math.sin(this.camTh), cos = Math.cos(this.camTh);
      // tief am Boden sitzt die Kamera flach hinter dem Hubschrauber, weiter oben schaut sie mehr von oben
      const hgt = FL.clamp((this.y - this.floorY || 0) / 40, 0, 1), back = FL.lerp(19, 26, hgt), cx = this.x - sin * back, cz = this.z - cos * back;
      const cy = Math.max(this.y + FL.lerp(5.5, 11, hgt), this.ground(cx, cz) + 3);
      cam.up.set(0, 1, 0);
      cam.position.set(cx + FL.rand(-sh, sh), cy + FL.rand(-sh, sh), cz);
      cam.lookAt(this.x + sin * 40, this.y - FL.lerp(2, 16, hgt), this.z + cos * 40);
      this.stage.update(new THREE.Vector3(this.x + sin * 35, 0, this.z + cos * 35));
    }

    updateHud() {
      const H = FL.hud, hp = this.hp / this.hpMax;
      H.set(this.hTL, `<div class="hud-big"><span class="coins">${this.coins}</span></div>` +
        `<div>Panzerung</div>${H.meter(hp, hp < 0.35 ? 'red' : hp < 0.65 ? 'gold' : '')}` +
        `<div>Höhe ${Math.round(Math.max(0, this.y - SKID) * 10)} m · Tempo <b>${Math.round(Math.hypot(this.vf, this.vs) * 8)}</b> km/h</div>` +
        (this.warn > 0.12 ? `<div style="color:#ef5a4c"><b>Du wirst anvisiert!</b></div>${H.meter(this.warn, 'red')}` : this.cover ? '<div style="color:#5fd07a"><b>In Deckung</b>: Der Gegner sieht dich nicht</div>' : ''));
      const me = this, to = (label, g) => `<div>${label} ${FL.arrowHtml(FL.bearing(me.x, me.z, me.th, g.x, g.z), Math.hypot(g.x - me.x, g.z - me.z))}</div>`;
      let tc;
      if (this.rtb) tc = '<div style="color:#5fd07a"><b>Basis eingenommen</b></div>' + (this.endT >= 0 ? '' : to('Zum Landeplatz', { x: 0, z: 0 }) + (Math.hypot(this.x, this.z) < PAD_R ? '<div style="color:#46dcff"><b>Jetzt landen: ' + (FL.touch.active ? '„Runter“' : 'S') + ' halten</b></div>' : ''));
      else {
        const f = this.fight.ownFrac();
        tc = `<div>Ziele: noch <b style="color:#ff8c3c">${this.left()}</b> von ${this.nPrimary}</div><div>Eigene Truppen</div>${H.meter(f, f < 0.35 ? 'red' : f < 0.65 ? 'gold' : 'cyan')}`;
        const next = this.targets.filter(s => s.alive && s.primary).sort((a, b) => Math.hypot(a.x - this.x, a.z - this.z) - Math.hypot(b.x - this.x, b.z - this.z))[0];
        if (this.landed && this.endT < 0) tc += `<div style="color:#46dcff"><b>${FL.touch.active ? '„Hoch“' : 'W'} halten: abheben</b></div>`;
        else if (next) tc += this.fightOn ? to('Nächstes Ziel', next) : to('Einsatzort', this.site);
      }
      H.set(this.hTC, tc);
      H.set(this.hInfo, `<div class="slot ${this.rocketCd <= 0 ? 'ready' : ''}"><b>R</b>Raketen${this.rocketCd <= 0 ? ' bereit' : `<i style="width:${Math.round((1 - this.rocketCd / this.rocketMax) * 100)}%"></i>`}</div>`);
      const items = [], kMap = 79 / 330;
      for (const h of this.hills) items.push({ x: h.x, z: h.z, color: 'rgba(170,180,160,0.55)', size: h.r * kMap * 0.8, ring: true });
      for (const w of this.woods) items.push({ x: w.x, z: w.z, color: 'rgba(70,150,80,0.55)', size: w.r * kMap });
      for (const s of this.targets) if (s.alive) items.push({ x: s.x, z: s.z, color: s.primary ? '#ff5a3c' : s.kind === 'flak' ? '#ffc43c' : '#6f7f8c', size: s.primary ? 3.5 : 2.5, far: s.primary });
      for (const u of this.fight.own) if (u.alive) items.push({ x: u.x, z: u.z, color: '#46dcff', size: 3 });
      items.push({ x: 0, z: 0, color: '#5fd07a', size: 5, far: true });
      FL.drawMinimap(this.map, this.x, this.z, this.th, 330, items);
    }

    onKey() {}
    destroy() { this.stage.dispose(); }
  };
})();
