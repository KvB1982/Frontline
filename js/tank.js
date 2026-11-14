'use strict';
// Frontlinie 3 – Panzer-Einsatz: Man fährt frei durch das Gelände und zerstört die markierten Ziele.
// Richtung wie beim Flugzeug: Der Kurs th zeigt nach (sin th, cos th), eine Linkskurve macht th größer.
(() => {
  const C = { gold: '#ffc43c', red: '#ef5a4c', green: '#5fd07a', cyan: '#46dcff', text: '#e9eef2', orange: '#ff8c3c', muted: '#9fb0bd' };
  const wrap = a => FL.wrapAngle(a);
  const MAP = 330;

  FL.TankMission = class {
    constructor(cfg, lo) {
      this.cfg = cfg; this.lo = lo; this.result = null;
      this.tier = cfg.tier; this.diff = cfg.diff || 0.85;
      const st = this.stage = new FL.Stage(cfg.theme, { far: 1000, shadow: 75, fov: 55 });
      this.fx = new FL.FX(st);
      this.t = 0; this.kills = 0; this.coins = 0; this.endT = -1; this.lost = false;
      this.x = 0; this.z = -285; this.th = 0; this.tu = 0; this.camTh = 0; this.v = 0;
      this.hpMax = this.hp = 18 + 6 * lo.t_armor;
      this.dmg = 6 + 3 * lo.t_gun;
      this.reload = 1.8 - 0.3 * lo.t_reload;
      this.maxV = 10 + 1.6 * lo.t_engine;
      this.turnRate = 1.05 + 0.15 * lo.t_engine;
      this.cd = 0; this.shake = 0; this.dustT = 0; this.warnT = 0; this.recoil = 0;
      this.supCd = [0, 0, 0, 0]; this.sup = []; this.barrage = null; this.aimX = 0; this.aimZ = 0;
      this.shells = []; this.eshells = []; this.structures = []; this.tanks = []; this.spinners = []; this.burning = []; this.crates = []; this.solid = [];
      this.buildWorld();
      this.tank = FL.tankModel(FL.PAL.ally);
      st.add(this.tank);
      this.aim = FL.sprite(FL.tex.icon('target'), 2.2, { depthTest: false, fog: false });
      st.add(this.aim);
      this.buildHud();
      FL.hud.msg('Zerstöre alle markierten Ziele!', C.gold);
      this.updateCamera(1);
    }

    // ---------------------------------------------------------------- Aufbau
    buildWorld() {
      const th = this.cfg.theme, st = this.stage, tier = this.tier, rnd = FL.seeded(137 + Math.round(tier * 10) + th.length * 5);
      st.ground(2600, FL.tex.ground(th), 18);
      const placed = [{ x: 0, z: -285, r: 30 }];
      // Lager des Gegners: jedes mit Zielen, Geschütz und etwas drumherum
      const sets = [['depot', 'depot'], ['bunker', 'radar'], ['hangar', 'depot'], ['hq', 'antenna'], ['radar', 'bunker']];
      const nCamps = FL.clamp(2 + Math.round(tier * 0.75), 3, 5);
      const camps = [];
      for (let i = 0; i < nCamps; i++) {
        const a = -1.25 + 2.5 * (nCamps === 1 ? 0.5 : i / (nCamps - 1)) + (rnd() - 0.5) * 0.25, d = 150 + rnd() * 110 + (i % 2) * 60;
        camps.push({ x: Math.sin(a) * d, z: -120 + Math.cos(a) * d * 1.15 });
      }
      this.camps = camps;
      const add = (kind, camp, primary, rMin, rMax, opt) => {
        const mesh = FL.building(kind, th, opt), u = mesh.userData;
        const p = FL.scatter(rnd, placed, u.r, camp.x, camp.z, rMin, rMax, 7);
        if (!p) return null;
        mesh.position.set(p[0], 0, p[1]);
        mesh.rotation.y = kind === 'turret' ? 0 : Math.floor(rnd() * 4) * Math.PI / 2;
        st.add(mesh);
        if (u.spin) this.spinners.push(u.spin);
        const hp = (kind === 'turret' ? 10 : Math.min(u.hp, 30)) * (1 + 0.22 * tier);
        const s = { kind, x: p[0], z: p[1], r: u.r, h: u.h, hp, max: hp, mesh, alive: true, primary, cd: FL.rand(2, 4), gun: kind === 'turret' };
        if (primary) { s.marker = FL.sprite(FL.tex.icon('target'), 5, { depthTest: false, fog: false }); s.marker.position.set(s.x, s.h + 4, s.z); st.add(s.marker); }
        this.structures.push(s);
        this.solid.push(s);
        return s;
      };
      camps.forEach((c, i) => {
        for (const k of sets[i % sets.length]) add(k, c, true, 0, 22);
        add('turret', c, false, 20, 34);
        if (tier >= 3) add('turret', c, false, 20, 36);
        for (const k of ['barracks', 'tent', 'tower'].slice(0, 2 + (i % 2))) add(k, c, false, 10, 36);
        for (let w = 0; w < 3; w++) {
          const a = rnd() * 6.283, m = FL.building('sandbags', th, { len: 6 });
          m.position.set(c.x + Math.sin(a) * 40, 0, c.z + Math.cos(a) * 40); m.rotation.y = a; st.add(m);
        }
        // Weg vom Start zum Lager
        const dx = c.x, dz = c.z + 285, len = Math.hypot(dx, dz);
        const road = st.strip(9, len, FL.tex.road(th), 9, 12, dx / 2, -285 + dz / 2, 0.04 + i * 0.004);
        road.rotation.z = Math.atan2(dx, dz); st.add(road);
      });
      this.nPrimary = this.structures.filter(s => s.primary).length;

      // gegnerische Panzer
      const nTanks = Math.round(1.4 + tier * 0.9);
      for (let i = 0; i < nTanks; i++) {
        const c = camps[i % camps.length], p = FL.scatter(rnd, placed, 5, c.x, c.z, 38, 60, 6);
        if (!p) continue;
        const mesh = FL.tankModel(FL.PAL.enemy(th)); st.add(mesh);
        const hp = 12 * (1 + 0.25 * tier);
        const e = { x: p[0], z: p[1], th: rnd() * 6.283, hp, max: hp, cd: FL.rand(2, 4), mesh, r: 3.2, alert: false };
        e.bar = FL.box(3, 0.22, 0.08, FL.basic(0xf05a46), 0, 4.2, 0); e.bar.castShadow = false; mesh.add(e.bar);
        this.tanks.push(e);
      }
      // Reparaturkisten
      for (let i = 0; i < 3; i++) {
        const p = FL.scatter(rnd, placed, 3, 0, -60 + i * 90, 20, 150, 10);
        if (!p) continue;
        const g = new THREE.Group();
        g.add(FL.box(2.2, 1.6, 2.2, FL.mat(0xffffff, { map: FL.tex.wood('#8a6a40') }), 0, 0.8, 0));
        const ic = FL.sprite(FL.tex.icon('wrench'), 2.6, { depthTest: false }); ic.position.y = 3.6; g.add(ic);
        g.position.set(p[0], 0, p[1]); st.add(g);
        this.crates.push({ x: p[0], z: p[1], mesh: g });
      }
      // Bäume, Büsche, Felsen
      for (let i = 0; i < 330; i++) {
        const a = rnd() * 6.283, d = Math.sqrt(rnd()) * (MAP + 160);
        const x = Math.sin(a) * d, z = -60 + Math.cos(a) * d;
        if (placed.some(p => Math.hypot(p.x - x, p.z - z) < p.r + 7) || camps.some(c => Math.hypot(c.x - x, c.z - z) < 46)) continue;
        if (camps.some(c => { const dx = c.x, dz = c.z + 285, l = Math.hypot(dx, dz), u = ((x * dx + (z + 285) * dz) / (l * l)); return u > 0 && u < 1 && Math.abs((x * dz - (z + 285) * dx) / l) < 8; })) continue;
        const kind = FL.pick(st.theme.trees), t = FL.tree(kind, rnd);
        t.position.set(x, 0, z);
        if (d > MAP) FL.noShadow(t);
        st.add(t);
        if (kind !== 'bush' && kind !== 'deadbush') this.solid.push({ x, z, r: kind === 'rock' ? 1.6 : 0.9, alive: true, tree: true });
      }
    }

    buildHud() {
      FL.hud.clear();
      this.hTL = FL.hud.box('hud-tl'); this.hTC = FL.hud.box('hud-tc'); this.hTR = FL.hud.box('hud-tr');
      this.hInfo = FL.el('div', '', '', this.hTR);
      this.map = FL.el('canvas', 'minimap', null, this.hTR); this.map.width = this.map.height = 170;
      const hint = FL.hud.box('hud-bl');
      hint.innerHTML = '↑ ↓ fahren · ← → lenken · A D Turm drehen · W Turm nach vorn · Leertaste Kanone · 1 2 3 4 Unterstützung · Schraubenschlüssel-Kisten reparieren · P Pause';
    }

    // ---------------------------------------------------------------- Treffer
    left() { return this.structures.filter(s => s.alive && s.primary).length; }
    hitStructure(s, d) {
      if (!s.alive) return;
      s.hp -= d;
      if (s.hp > 0) { this.fx.spark(s.x, s.h * 0.5, s.z, 3); return; }
      s.alive = false;
      const fuel = s.mesh.userData.fuel, size = Math.max(1.6, s.r * 0.45) * (fuel ? 1.5 : 1);
      this.fx.explosion(s.x, 1, s.z, size);
      this.fx.explosion(s.x + FL.rand(-2, 2), s.h * 0.6, s.z + FL.rand(-2, 2), size * 0.7, true);
      for (let i = 0; i < 14; i++) this.fx.chunk(s.x + FL.rand(-s.r, s.r) * 0.6, FL.rand(1, s.h), s.z, 2);
      FL.audio.play(fuel || s.r > 6 ? 'bigboom' : 'boom');
      this.shake = 0.4;
      this.stage.scene.remove(s.mesh);
      if (s.marker) this.stage.scene.remove(s.marker);
      const rb = FL.rubble(s.r, s.h); rb.position.set(s.x, 0, s.z); this.stage.add(rb);
      this.burning.push({ x: s.x, z: s.z, t: 30, size: Math.max(2, s.r * 0.5) });
      s.r *= 0.5;
      this.kills++; this.coins += s.primary ? 15 : s.gun ? 10 : 3;
      if (s.primary) {
        const n = this.left();
        if (n === 0) { this.endT = 3; FL.hud.msg('ALLE ZIELE ZERSTÖRT!', C.gold); }
        else FL.hud.msg('Ziel zerstört! Noch ' + n, C.orange, true);
      } else if (s.gun) FL.hud.msg('Geschütz ausgeschaltet!', C.green, true);
    }
    hitTank(e, d) {
      if (e.dead) return;
      e.hp -= d; e.alert = true;
      e.bar.scale.x = Math.max(0.02, e.hp / e.max);
      if (e.hp > 0) { this.fx.spark(e.x, 2, e.z, 3); FL.audio.play('hit'); return; }
      e.dead = true;
      this.fx.explosion(e.x, 1, e.z, 1.6);
      FL.audio.play('boom'); this.shake = 0.3;
      this.stage.scene.remove(e.mesh);
      const rb = FL.rubble(3, 2); rb.position.set(e.x, 0, e.z); this.stage.add(rb);
      this.burning.push({ x: e.x, z: e.z, t: 20, size: 2 });
      this.kills++; this.coins += 15;
      FL.hud.msg('Panzer zerstört!', C.green, true);
    }
    hurt(d) {
      if (this.lost || this.endT >= 0) return;
      this.hp -= d; this.shake = 0.4;
      FL.hud.damage(0.6); FL.audio.play('ouch');
      if (this.hp <= 0) {
        this.hp = 0; this.lost = true; this.endT = 2.2;
        this.fx.explosion(this.x, 1.5, this.z, 1, true);
        FL.hud.damage(1); FL.hud.msg('Dein Panzer kann nicht mehr weiter!', C.red);
      }
    }
    // Wer steht in Schussrichtung? (Zielhilfe)
    lockOn(ath) {
      let best = null, bs = 1e9;
      const check = (o, r) => {
        const d = Math.hypot(o.x - this.x, o.z - this.z);
        if (d > 175) return;
        const rel = Math.abs(FL.bearing(this.x, this.z, ath, o.x, o.z));
        const tol = 0.1 + Math.atan2(r, d);
        if (rel < tol && d < bs) { bs = d; best = o; }
      };
      for (const e of this.tanks) if (!e.dead) check(e, e.r);
      for (const s of this.structures) if (s.alive) check(s, s.r * 0.6);
      return best;
    }
    // ---------------------------------------------------------------- Unterstützung durch andere Truppen
    // 1 Drohnen, 2 Kampfhubschrauber, 3 Kampfbomber, 4 Artillerie (wie im Bodenkampf, im Laden gekauft)
    blast(x, z, radius, dmg, y) {
      this.fx.explosion(x, y || 0.6, z, radius / 4);
      FL.audio.play('boom'); this.shake = Math.max(this.shake, 0.15);
      for (const e of this.tanks) if (!e.dead && Math.hypot(e.x - x, e.z - z) < radius + e.r) this.hitTank(e, dmg);
      for (const s of this.structures) if (s.alive && Math.hypot(s.x - x, s.z - z) < radius + s.r * 0.7) this.hitStructure(s, dmg);
    }
    // nächstes lohnendes Ziel: erst Panzer und Geschütze, dann die markierten Gebäude
    supTarget(x, z, range, taken) {
      let best = null, bs = 1e9;
      const check = (o, bonus) => { if (taken && taken.has(o)) return; const d = Math.hypot(o.x - x, o.z - z); if (d < range && d + bonus < bs) { bs = d + bonus; best = o; } };
      for (const e of this.tanks) if (!e.dead) check(e, 0);
      for (const s of this.structures) if (s.alive && (s.gun || s.primary)) check(s, s.gun ? 20 : 60);
      return best;
    }
    support(i) {
      const sp = FL.SPECIALS[i], lvl = this.lo[sp.id], st = this.stage;
      if (!lvl) { FL.hud.msg(sp.name + ' hast du noch nicht gekauft', C.muted, true); return; }
      if (this.supCd[i] > 0 || this.lost || this.endT >= 0) return;
      this.supCd[i] = sp.reload * 1.5 * (lvl > 1 ? 0.7 : 1);
      FL.audio.play('up');
      const ath = wrap(this.th + this.tu), sin = Math.sin(ath), cos = Math.cos(ath);
      if (i === 0) {
        for (let k = 0; k < 5; k++) { const mesh = FL.droneModel(); mesh.scale.setScalar(2.2); mesh.visible = false; st.add(mesh); this.sup.push({ kind: 'drone', x: this.x + (k - 2) * 1.5, y: 3.5, z: this.z, t: -k * 0.15, life: 14, target: null, mesh }); }
        FL.hud.msg('Drohnen gestartet!', C.cyan, true);
      } else if (i === 1) {
        const mesh = FL.heliModel(); st.add(mesh);
        this.sup.push({ kind: 'heli', x: this.x - sin * 90, y: 22, z: this.z - cos * 90, th: ath, t: 0, life: 18, fire: 1.5, mesh });
        FL.hud.msg('Kampfhubschrauber begleitet dich!', C.cyan, true);
      } else if (i === 2) {
        const mesh = FL.jetModel(0x6a7682, 0x3a4450); mesh.rotation.y = ath; st.add(mesh);
        this.sup.push({ kind: 'bomber', x: this.aimX - sin * 280, y: 32, z: this.aimZ - cos * 280, sin, cos, ax: this.aimX, az: this.aimZ, t: 0, life: 7, drop: 0, mesh });
        FL.audio.play('jet'); FL.hud.msg('Kampfbomber im Anflug auf dein Ziel!', C.orange);
      } else {
        this.barrage = { n: 8, cd: 1.0, x: this.aimX, z: this.aimZ };
        FL.audio.play('cannon'); FL.hud.msg('Artillerie feuert auf dein Ziel!', C.orange);
      }
    }
    updateSupport(dt) {
      const fx = this.fx, st = this.stage;
      for (let i = 0; i < 4; i++) this.supCd[i] = Math.max(0, this.supCd[i] - dt);
      if (this.barrage) {
        const q = this.barrage; q.cd -= dt;
        if (q.cd <= 0) {
          q.cd = 0.36; q.n--;
          const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * 13, tx = q.x + Math.sin(a) * d, tz = q.z + Math.cos(a) * d;
          const mesh = FL.shellModel(0.3); st.add(mesh);
          this.sup.push({ kind: 'shell', sx: tx - Math.sin(this.th) * 30, sz: tz - Math.cos(this.th) * 30, tx, tz, x: tx, y: 70, z: tz, t: 0, T: 1.3, life: 9, mesh });
          if (q.n <= 0) this.barrage = null;
        }
      }
      for (const a of this.sup) {
        a.t += dt; a.life -= dt;
        if (a.t < 0) continue;
        a.mesh.visible = true;
        if (a.kind === 'drone') {
          if (!a.target || a.target.dead || a.target.alive === false) {
            const taken = new Set(this.sup.filter(o => o !== a && o.kind === 'drone' && o.target).map(o => o.target));
            a.target = this.supTarget(a.x, a.z, 280, taken) || this.supTarget(a.x, a.z, 280);
          }
          const tg = a.target;
          const tx = tg ? tg.x : this.x + Math.sin(this.t * 2 + a.x) * 8, ty = tg ? 2 : 7, tz = tg ? tg.z : this.z + Math.cos(this.t * 2 + a.x) * 8;
          const dx = tx - a.x, dy = ty - a.y, dz = tz - a.z, d = Math.hypot(dx, dy, dz) || 1, step = 38 * dt;
          a.x += dx / d * Math.min(step, d); a.y += dy / d * Math.min(step, d); a.z += dz / d * Math.min(step, d);
          a.mesh.rotation.y = Math.atan2(dx, dz);
          if (tg && d < 2 + (tg.r || 0) * 0.5) { a.life = 0; this.blast(a.x, a.z, 6, 8, a.y); }
        } else if (a.kind === 'heli') {
          const ath = this.th + this.tu, leaving = a.life < 3;
          const wx = leaving ? a.x + Math.sin(a.th) * 100 : this.x + Math.sin(ath) * 28, wz = leaving ? a.z + Math.cos(a.th) * 100 : this.z + Math.cos(ath) * 28;
          const dx = wx - a.x, dz = wz - a.z, d = Math.hypot(dx, dz) || 1, step = Math.min(d, (leaving ? 40 : 26) * dt);
          a.x += dx / d * step; a.z += dz / d * step; a.y = FL.lerp(a.y, leaving ? 40 : 15, dt * 0.8);
          const tg = leaving ? null : this.supTarget(a.x, a.z, 190);
          const face = tg ? Math.atan2(tg.x - a.x, tg.z - a.z) : d > 3 ? Math.atan2(dx, dz) : a.th;
          a.th = wrap(a.th + FL.clamp(wrap(face - a.th), -2 * dt, 2 * dt));
          a.mesh.rotation.set(0.12, a.th, 0);
          a.mesh.userData.rotor.rotation.y += dt * 30; a.mesh.userData.tail.rotation.x += dt * 40;
          a.fire -= dt;
          if (tg && a.fire <= 0) {
            a.fire = 0.75;
            const mesh = FL.rocketModel(); mesh.scale.setScalar(2); st.add(mesh);
            this.sup.push({ kind: 'rocket', x: a.x, y: a.y - 1.2, z: a.z, target: tg, t: 0, life: 6, mesh });
            FL.audio.play('rocket');
          }
        } else if (a.kind === 'rocket') {
          const tg = a.target, ty = Math.min((tg.h || 3) * 0.4, 3);
          const dx = tg.x - a.x, dy = ty - a.y, dz = tg.z - a.z, d = Math.hypot(dx, dy, dz) || 1, step = 85 * dt;
          a.x += dx / d * Math.min(step, d); a.y += dy / d * Math.min(step, d); a.z += dz / d * Math.min(step, d);
          a.mesh.lookAt(tg.x, ty, tg.z);
          if (Math.random() < 0.7) fx.puff('white', a.x, a.y, a.z, 1.2, 0.5, 0, 0.4, 0, 1.6);
          if (d < step + 1.5) { a.life = 0; this.blast(a.x, a.z, 5, 7, a.y); }
        } else if (a.kind === 'bomber') {
          a.x += a.sin * 95 * dt; a.z += a.cos * 95 * dt; a.drop -= dt;
          const along = (a.x - a.ax) * a.sin + (a.z - a.az) * a.cos;
          // etwas früher auslösen, weil die Bomben noch ein Stück weiterfliegen
          if (a.drop <= 0 && along > -75 && along < 15) {
            a.drop = 0.11;
            for (const side of [-5, 5]) {
              const mesh = FL.bombModel(); mesh.scale.setScalar(2.4); st.add(mesh);
              this.sup.push({ kind: 'bomb', x: a.x + a.cos * side, y: a.y - 1, z: a.z - a.sin * side, vx: a.sin * 38, vz: a.cos * 38, vy: 0, t: 0, life: 5, mesh });
            }
          }
          a.mesh.rotation.y = Math.atan2(a.sin, a.cos);
        } else if (a.kind === 'bomb') {
          a.vy -= 40 * dt; a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
          a.mesh.lookAt(a.x + a.vx, a.y + a.vy, a.z + a.vz);
          if (a.y <= 0.5) { a.life = 0; this.blast(a.x, a.z, 8, 12); }
        } else if (a.kind === 'shell') {
          const k = Math.min(1, a.t / a.T);
          a.x = FL.lerp(a.sx, a.tx, k); a.z = FL.lerp(a.sz, a.tz, k); a.y = 70 * (1 - k * k);
          if (k >= 1) { a.life = 0; this.blast(a.x, a.z, 7, 9); }
          FL.aimShell(a, a.x, a.y, a.z);
        }
        a.mesh.position.set(a.x, a.y, a.z);
      }
      for (const a of this.sup) if (a.life <= 0) { st.scene.remove(a.mesh); if (a.kind === 'drone' && a.t > 13) fx.puff('white', a.x, a.y, a.z, 2, 0.5, 0, 1, 0, 1.5); }
      this.sup = this.sup.filter(a => a.life > 0);
    }

    // Hindernisse: Gebäude und Bäume schieben den Panzer zur Seite
    pushOut(o, rad) {
      for (const s of this.solid) {
        const dx = o.x - s.x, dz = o.z - s.z, d = Math.hypot(dx, dz), min = s.r * (s.tree ? 1 : 0.85) + rad;
        if (d < min && d > 0.01) { o.x = s.x + dx / d * min; o.z = s.z + dz / d * min; }
      }
    }

    // ---------------------------------------------------------------- ein Zeitschritt
    update(dt) {
      if (this.result) return;
      const fx = this.fx, active = !this.lost && this.endT < 0;
      this.t += dt; this.cd -= dt;
      this.shake = Math.max(0, this.shake - dt); this.recoil = Math.max(0, this.recoil - dt * 4);

      // fahren und lenken
      const sy = FL.stick.y, fwd = active ? FL.clamp((FL.down('ArrowUp') ? 1 : 0) - (FL.down('ArrowDown') ? 0.6 : 0) + (sy > 0 ? sy : sy * 0.6), -0.6, 1) : 0;
      const turn = active ? FL.clamp((FL.down('ArrowLeft') ? 1 : 0) - (FL.down('ArrowRight') ? 1 : 0) - FL.stick.x, -1, 1) : 0;
      const tturn = active ? (FL.down('KeyA', 'KeyQ') ? 1 : 0) - (FL.down('KeyD', 'KeyE') ? 1 : 0) : 0;
      this.v = FL.lerp(this.v, fwd * this.maxV, 1 - Math.exp(-3 * dt));
      FL.audio.engine('tank', Math.min(1, Math.abs(this.v) / this.maxV * 0.8 + Math.abs(fwd) * 0.2), 0);
      this.th = wrap(this.th + turn * this.turnRate * dt);
      this.tu = wrap(this.tu + tturn * 1.5 * dt);
      if (active && FL.down('KeyW', 'KeyS')) this.tu = FL.lerp(this.tu, 0, 1 - Math.exp(-8 * dt));
      this.x += Math.sin(this.th) * this.v * dt; this.z += Math.cos(this.th) * this.v * dt;
      this.pushOut(this, 2.6);
      for (const e of this.tanks) if (!e.dead) { const dx = this.x - e.x, dz = this.z - e.z, d = Math.hypot(dx, dz); if (d < 6.5 && d > 0.01) { this.x = e.x + dx / d * 6.5; this.z = e.z + dz / d * 6.5; } }
      const edge = Math.hypot(this.x, this.z + 60);
      if (edge > MAP) {
        this.x *= MAP / edge; this.z = (this.z + 60) * MAP / edge - 60;
        this.warnT -= dt;
        if (this.warnT <= 0) { this.warnT = 3; FL.hud.msg('Hier endet das Einsatzgebiet', C.text, true); }
      }
      this.tank.position.set(this.x, 0, this.z);
      this.tank.rotation.y = this.th;
      FL.setTurret(this.tank, this.tu, this.recoil);
      if (Math.abs(this.v) > 2) {
        this.dustT -= dt;
        if (this.dustT <= 0) { this.dustT = 0.1; fx.puff('dust', this.x - Math.sin(this.th) * 3.2, 0.5, this.z - Math.cos(this.th) * 3.2, 2.2, 0.8, 0, 1, 0, 1.6); }
      }

      // zielen und schießen
      const ath = wrap(this.th + this.tu);
      const lock = active ? this.lockOn(ath) : null;
      let ax = this.x + Math.sin(ath) * 70, az = this.z + Math.cos(ath) * 70, ay = 1.9;
      if (lock) { ax = lock.x; az = lock.z; ay = lock.h ? Math.min(lock.h * 0.5, 3) : 1.8; }
      this.aim.position.set(ax, ay, az);
      this.aimX = ax; this.aimZ = az;
      const ad = Math.hypot(ax - this.x, az - this.z);
      const as = FL.clamp(ad * 0.045, 1.6, 5) * (lock ? 1.25 : 1);
      this.aim.scale.set(as, as, 1);
      this.aim.material.opacity = lock ? 1 : 0.55;
      this.aim.visible = active;
      if (active && FL.down('Space') && this.cd <= 0) {
        this.cd = this.reload; this.recoil = 1; this.shake = Math.max(this.shake, 0.18);
        const dir = Math.atan2(ax - this.x, az - this.z);
        const sx = this.x + Math.sin(ath) * 5, sz = this.z + Math.cos(ath) * 5;
        const mesh = fx.shot(0xffe0a0, 0.3, 3.5);
        this.shells.push({ x: sx, z: sz, vx: Math.sin(dir) * 120, vz: Math.cos(dir) * 120, life: 1.6, mesh });
        fx.spark(sx, 1.9, sz, 4); fx.puff('smoke', sx, 2, sz, 2.5, 0.8, 0, 1, 0, 1.5);
        FL.audio.play('cannon');
      }
      for (const s of this.shells) {
        s.life -= dt;
        const steps = 3;
        for (let i = 0; i < steps && !s.gone; i++) {
          s.x += s.vx * dt / steps; s.z += s.vz * dt / steps;
          for (const e of this.tanks) if (!e.dead && Math.hypot(e.x - s.x, e.z - s.z) < e.r) { s.gone = true; this.hitTank(e, this.dmg); break; }
          if (!s.gone) for (const b of this.structures) if (b.alive && Math.hypot(b.x - s.x, b.z - s.z) < b.r * 0.85) { s.gone = true; this.hitStructure(b, this.dmg); break; }
        }
        if (!s.gone && s.life <= 0) { s.gone = true; }
        if (s.gone) { fx.freeShot(s.mesh); fx.explosion(s.x, 1.2, s.z, 0.7, s.life > 0); if (s.life <= 0) FL.audio.play('pop'); }
        else { s.mesh.position.set(s.x, 1.9, s.z); s.mesh.rotation.y = Math.atan2(s.vx, s.vz); }
      }
      this.shells = this.shells.filter(s => !s.gone);

      this.updateEnemies(dt, active);
      this.updateSupport(dt);

      // Reparaturkisten
      for (const c of this.crates) {
        c.mesh.children[1].position.y = 3.6 + Math.sin(this.t * 3) * 0.25;
        if (active && Math.hypot(c.x - this.x, c.z - this.z) < 4.5 && this.hp < this.hpMax) {
          c.gone = true; this.stage.scene.remove(c.mesh);
          this.hp = Math.min(this.hpMax, this.hp + this.hpMax * 0.5);
          FL.audio.play('up'); FL.hud.msg('Repariert!', C.green, true);
        }
      }
      this.crates = this.crates.filter(c => !c.gone);

      for (const b of this.burning) { b.t -= dt; if (Math.random() < dt * 5) fx.smoke(b.x + FL.rand(-1, 1) * b.size * 0.5, 1, b.z, b.size * 1.3); }
      this.burning = this.burning.filter(b => b.t > 0);
      for (const s of this.spinners) s.rotation.y += dt * 1.5;
      for (const s of this.structures) if (s.alive && s.marker) {
        const sc = FL.clamp(Math.hypot(s.x - this.x, s.z - this.z) * 0.035, 3.5, 12) * (1 + Math.sin(this.t * 5) * 0.08);
        s.marker.scale.set(sc, sc, 1); s.marker.position.y = s.h + 2 + sc * 0.6;
      }
      if ((this.hp < this.hpMax * 0.35 || this.lost) && Math.random() < dt * 6) fx.smoke(this.x, 2.4, this.z, 1.8);

      if (this.endT >= 0) { this.endT -= dt; if (this.endT <= 0) this.result = this.lost ? 'lose' : 'win'; }
      fx.update(dt);
      this.updateCamera(dt);
      this.updateHud();
    }

    updateEnemies(dt, active) {
      const fx = this.fx, rate = (1 + 0.1 * this.tier) * (this.diff / 0.85);
      const fire = (x, z, y) => {
        const d = Math.hypot(this.x - x, this.z - z), T = d / 55;
        // etwas vorhalten, aber nicht perfekt: Wer in Bewegung bleibt, wird seltener getroffen
        const lead = FL.rand(0.2, 0.9);
        const tx = this.x + Math.sin(this.th) * this.v * T * lead + FL.rand(-4.5, 4.5), tz = this.z + Math.cos(this.th) * this.v * T * lead + FL.rand(-4.5, 4.5);
        const mesh = fx.shot(0xff5a46, 0.32, 3);
        this.eshells.push({ sx: x, sz: z, y, tx, tz, t: 0, T: Math.hypot(tx - x, tz - z) / 55, mesh });
        fx.spark(x, y, z, 3.5); FL.audio.play('eshot');
      };
      for (const e of this.tanks) {
        if (e.dead) continue;
        const d = Math.hypot(this.x - e.x, this.z - e.z);
        if (d < 120) e.alert = true; else if (d > 190) e.alert = false;
        if (e.alert && active) {
          const want = Math.atan2(this.x - e.x, this.z - e.z);
          e.th = wrap(e.th + FL.clamp(wrap(want - e.th), -0.7 * dt, 0.7 * dt));
          if (d > 55) { e.x += Math.sin(e.th) * 5 * dt; e.z += Math.cos(e.th) * 5 * dt; this.pushOut(e, 2.6); }
          FL.setTurret(e.mesh, wrap(want - e.th));
          e.cd -= dt;
          if (e.cd <= 0 && d < 150) { e.cd = FL.rand(3.6, 5) / rate; fire(e.x + Math.sin(want) * 5, e.z + Math.cos(want) * 5, 1.9); }
        }
        e.mesh.position.set(e.x, 0, e.z); e.mesh.rotation.y = e.th;
      }
      this.tanks = this.tanks.filter(e => !e.dead);
      for (const s of this.structures) {
        if (!s.alive || !s.gun) continue;
        const d = Math.hypot(this.x - s.x, this.z - s.z);
        if (d > 125 || !active) continue;
        const want = Math.atan2(this.x - s.x, this.z - s.z);
        s.mesh.userData.turret.rotation.y = want;
        s.cd -= dt;
        if (s.cd <= 0) { s.cd = FL.rand(4.5, 6) / rate; fire(s.x + Math.sin(want) * 3, s.z + Math.cos(want) * 3, 2.2); }
      }
      for (const b of this.eshells) {
        b.t += dt;
        const k = Math.min(1, b.t / b.T), x = FL.lerp(b.sx, b.tx, k), z = FL.lerp(b.sz, b.tz, k);
        b.mesh.position.set(x, b.y, z); b.mesh.rotation.y = Math.atan2(b.tx - b.sx, b.tz - b.sz);
        const hit = Math.hypot(x - this.x, z - this.z) < 2.7;
        if (hit || k >= 1) {
          b.gone = true; fx.freeShot(b.mesh);
          fx.explosion(x, 1, z, 0.7, true); FL.audio.play('pop');
          if (hit) this.hurt(1.5);
        }
      }
      this.eshells = this.eshells.filter(b => !b.gone);
    }

    updateCamera(dt) {
      const cam = this.stage.camera, ath = this.th + this.tu;
      this.camTh += wrap(ath - this.camTh) * (1 - Math.exp(-5 * dt));
      const sin = Math.sin(this.camTh), cos = Math.cos(this.camTh), sh = this.shake;
      cam.position.set(this.x - sin * 15 + FL.rand(-sh, sh), 7.6 + FL.rand(-sh, sh), this.z - cos * 15);
      cam.lookAt(this.x + sin * 20, 1.5, this.z + cos * 20);
      this.stage.update(new THREE.Vector3(this.x + sin * 25, 0, this.z + cos * 25));
    }

    updateHud() {
      const H = FL.hud, hp = this.hp / this.hpMax;
      H.set(this.hTL, `<div class="hud-big"><span class="coins">${this.coins}</span></div>` +
        `<div>Panzerung</div>${H.meter(hp, hp < 0.35 ? 'red' : hp < 0.65 ? 'gold' : '')}` +
        `<div>Kanone ${this.cd <= 0 ? '<b style="color:#46dcff">bereit</b>' : 'lädt …'}</div>${H.meter(1 - Math.max(0, this.cd) / this.reload, 'cyan')}`);
      let tc = `<div>Ziele: noch <b style="color:#ff8c3c">${this.left()}</b> von ${this.nPrimary}</div>`;
      const ath = this.th + this.tu;
      const next = this.structures.filter(s => s.alive && s.primary).sort((a, b) => Math.hypot(a.x - this.x, a.z - this.z) - Math.hypot(b.x - this.x, b.z - this.z))[0];
      if (next) tc += `<div>Nächstes Ziel ${FL.arrowHtml(FL.bearing(this.x, this.z, ath, next.x, next.z), Math.hypot(next.x - this.x, next.z - this.z))}</div>`;
      H.set(this.hTC, tc);
      let tr = '';
      FL.SPECIALS.forEach((sp, i) => {
        const lvl = this.lo[sp.id];
        if (!lvl) return;
        const total = sp.reload * 1.5 * (lvl > 1 ? 0.7 : 1), ready = this.supCd[i] <= 0;
        tr += `<div class="slot ${ready ? 'ready' : ''}"><b>${sp.key}</b>${sp.name}${ready ? '' : `<i style="width:${Math.round((1 - this.supCd[i] / total) * 100)}%"></i>`}</div><br>`;
      });
      H.set(this.hInfo, tr);
      const items = [];
      for (const a of this.sup) if (a.kind === 'heli' || a.kind === 'bomber') items.push({ x: a.x, z: a.z, color: '#46dcff', size: 3.5 });
      for (const s of this.structures) if (s.alive) items.push({ x: s.x, z: s.z, color: s.primary ? '#ff5a3c' : s.gun ? '#ffc43c' : '#6f7f8c', size: s.primary ? 4 : 2.5, far: s.primary });
      for (const e of this.tanks) items.push({ x: e.x, z: e.z, color: '#ff40c0', size: 3.5 });
      for (const c of this.crates) items.push({ x: c.x, z: c.z, color: '#5fd07a', size: 3 });
      FL.drawMinimap(this.map, this.x, this.z, ath, 190, items);
    }

    onKey(code) {
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code.replace('Numpad', 'Digit'));
      if (i >= 0) this.support(i);
    }
    destroy() { this.stage.dispose(); }
  };
})();
