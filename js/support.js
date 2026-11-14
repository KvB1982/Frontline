'use strict';
// Frontlinie 3 – Bodenkampf für die Luftunterstützung: Eigene Truppen greifen an, gegnerische Soldaten, Panzer und Fahrzeuge halten dagegen.
// Flugzeug und Hubschrauber benutzen dieselbe Logik. Getroffene Gegner lösen sich auf, Fahrzeuge explodieren.
(() => {
  const SPEED = { tank: 5, jeep: 8, squad: 3.4 }, HP = { tank: 12, jeep: 5, squad: 5 }, REACH = { tank: 75, jeep: 60, squad: 48 }, RATE = { tank: 3.2, jeep: 0.7, squad: 0.8 };
  const MEN = 5;
  FL.GroundFight = class {
    // o: stage, fx, theme, cx, cz (Mitte der gegnerischen Stellung), a (Richtung von dort zu den eigenen Truppen), front (Abstand der Gegner von der Mitte),
    //    back (Startabstand der eigenen Truppen), foes {tanks, jeeps, squads}, own {tanks, squads}, scale, hpMul, last (Sekunden, die die eigenen Truppen allein durchhalten),
    //    rnd, floor(x, z) = Höhe des Bodens (optional), onDead(unit, byPlayer)
    constructor(o) {
      this.o = o; this.units = []; this.foes = []; this.own = []; this.tracers = []; this.on = false; this.t = 0;
      const S = this.S = o.scale || 1, rnd = o.rnd || Math.random, f = o.foes || {}, w = o.own || {};
      const ux = Math.sin(o.a), uz = Math.cos(o.a);
      const spot = (d, side) => [o.cx + ux * d + uz * side, o.cz + uz * d - ux * side];
      const list = (n, kind) => Array.from({ length: n || 0 }, () => kind);
      const foes = [...list(f.tanks, 'tank'), ...list(f.jeeps, 'jeep'), ...list(f.squads, 'squad')];
      const own = [...list(w.tanks, 'tank'), ...list(w.squads, 'squad')];
      const gap = 26 * S;
      foes.forEach((k, i) => {
        const row = i % 2, side = (i - (foes.length - 1) / 2) * gap + (rnd() - 0.5) * 8 * S;
        this.make(k, 'foe', ...spot(o.front + row * 34 * S + rnd() * 10 * S, side), o.a);
      });
      own.forEach((k, i) => {
        const row = i % 2, side = (i - (own.length - 1) / 2) * gap + (rnd() - 0.5) * 8 * S;
        this.make(k, 'own', ...spot(o.back + row * 30 * S, side), o.a + Math.PI);
      });
      this.ownMax = this.own.reduce((s, u) => s + u.max, 0);
      const foeMax = this.foes.reduce((s, u) => s + u.max, 0);
      // Ohne Hilfe aus der Luft verlieren die eigenen Truppen: So zählt jeder Treffer des Spielers.
      this.foeDps = this.ownMax / (Math.max(1, this.foes.length) * (o.last || 200));
      this.ownDps = foeMax / (Math.max(1, this.own.length) * (o.last || 200) * 2.2);
    }
    make(kind, team, x, z, th) {
      const o = this.o, S = this.S, own = team === 'own';
      let mesh, r, h;
      const u = { kind, team, unit: true, alive: true, x, z, th, cd: 1 + Math.random() * 3, men: null, moving: false };
      if (kind === 'squad') {
        mesh = new THREE.Group(); u.men = [];
        for (let i = 0; i < MEN; i++) {
          const m = FL.soldier(own ? { team: 'ally', weapon: 1 } : { team: 'enemy', theme: o.theme, kind: i ? 'soldat' : 'elite' });
          m.position.set((i - 2) * 1.5 + (Math.random() - 0.5) * 0.6, 0, (i % 2) * 1.6 - 0.8);
          FL.noShadow(m); mesh.add(m); u.men.push(m);
        }
        mesh.scale.setScalar(S * 1.25); r = 4.6 * S; h = 2.4 * S;
      } else {
        mesh = kind === 'tank' ? FL.tankModel(own ? FL.PAL.ally : FL.PAL.enemy(o.theme)) : FL.jeepModel(FL.PAL.enemy(o.theme));
        mesh.scale.setScalar(S); r = (mesh.userData.r || 3) * S * 1.1; h = (mesh.userData.h || 2.4) * S;
      }
      mesh.position.set(x, this.gy(x, z), z); mesh.rotation.y = th;
      o.stage.add(mesh);
      u.mesh = mesh; u.r = r; u.h = h; u.hp = u.max = HP[kind] * (own ? 1 : (o.hpMul || 1));
      this.units.push(u); (own ? this.own : this.foes).push(u);
      return u;
    }
    gy(x, z) { return this.o.floor ? this.o.floor(x, z) : 0; }
    ownFrac() { return this.ownMax ? this.own.reduce((s, u) => s + (u.alive ? u.hp : 0), 0) / this.ownMax : 0; }
    foesLeft() { return this.foes.filter(u => u.alive).length; }
    // Treffer: Soldaten lösen sich einzeln auf, Fahrzeuge explodieren am Ende
    hit(u, d, byPlayer) {
      if (!u.alive) return;
      u.hp -= d;
      const fx = this.o.fx, y = this.gy(u.x, u.z);
      if (u.men) {
        const keep = u.hp <= 0 ? 0 : Math.ceil(u.hp / u.max * MEN);
        u.men.forEach((m, i) => { if (m.visible && i >= keep) { m.visible = false; fx.vanish(u.x + m.position.x * this.S, y + 0.5, u.z + m.position.z * this.S); } });
      }
      if (u.hp > 0) return;
      u.alive = false;
      if (!u.men) { fx.explosion(u.x, y + 1, u.z, 1.5 * this.S); FL.audio.play('boom'); }
      this.o.stage.scene.remove(u.mesh);
      if (u.marker) this.o.stage.scene.remove(u.marker);
      if (this.o.onDead) this.o.onDead(u, !!byPlayer);
    }
    update(dt) {
      const fx = this.o.fx, S = this.S;
      this.t += dt;
      if (this.on) for (const u of this.units) {
        if (!u.alive) continue;
        const them = u.team === 'own' ? this.foes : this.own;
        let tg = null, best = 1e9;
        for (const e of them) if (e.alive) { const d = Math.hypot(e.x - u.x, e.z - u.z); if (d < best) { best = d; tg = e; } }
        let gx = this.o.cx, gz = this.o.cz, stop = 30 * S + (this.units.indexOf(u) % 5) * 9 * S;
        if (tg) { gx = tg.x; gz = tg.z; stop = REACH[u.kind] * S; }
        const d = Math.hypot(gx - u.x, gz - u.z), want = Math.atan2(gx - u.x, gz - u.z);
        // Die eigenen Truppen rücken vor, die Gegner halten ihre Stellung und kommen nur das letzte Stück entgegen
        u.moving = d > stop && (u.team === 'own' || (tg && d < stop * 1.6));
        if (tg || u.team === 'own') u.th += FL.wrapAngle(want - u.th) * Math.min(1, 3 * dt);
        if (u.moving) { const v = SPEED[u.kind] * S * 0.8; u.x += Math.sin(u.th) * v * dt; u.z += Math.cos(u.th) * v * dt; }
        u.mesh.position.set(u.x, this.gy(u.x, u.z), u.z); u.mesh.rotation.y = u.th;
        if (u.marker) { u.marker.position.x = u.x; u.marker.position.z = u.z; }
        if (u.men) { for (const m of u.men) if (m.visible) FL.animSoldier(m, this.t, u.moving, !u.moving && !!tg); }
        else if (u.moving && Math.random() < dt * 3) fx.puff('dust', u.x - Math.sin(u.th) * u.r, 0.5, u.z - Math.cos(u.th) * u.r, 2 * S, 0.7, 0, 1, 0, 1.5);
        if (!tg || d > stop * 1.25) continue;
        u.cd -= dt;
        if (u.cd > 0) continue;
        const rate = RATE[u.kind] * (0.8 + Math.random() * 0.4);
        u.cd = rate;
        const big = u.kind === 'tank', y0 = this.gy(u.x, u.z) + (big ? 2.2 : 1.5) * S, ty = this.gy(tg.x, tg.z) + 1.2 * S;
        const tx = tg.x + FL.rand(-2, 2) * S, tz = tg.z + FL.rand(-2, 2) * S;
        this.tracers.push({ m: fx.shot(u.team === 'own' ? 0xbfe8ff : 0xff7a50, (big ? 0.5 : 0.22) * S, (big ? 4 : 3) * S), sx: u.x, sy: y0, sz: u.z, tx, ty, tz, t: 0, T: Math.max(0.12, d / (big ? 160 : 220)), big });
        if (big) fx.spark(u.x + Math.sin(u.th) * u.r, y0, u.z + Math.cos(u.th) * u.r, 3 * S);
        this.hit(tg, (u.team === 'own' ? this.ownDps : this.foeDps) * rate * (0.7 + Math.random() * 0.6), false);
      }
      for (const b of this.tracers) {
        b.t += dt;
        const k = Math.min(1, b.t / b.T);
        b.m.position.set(FL.lerp(b.sx, b.tx, k), FL.lerp(b.sy, b.ty, k), FL.lerp(b.sz, b.tz, k)); b.m.lookAt(b.tx, b.ty, b.tz);
        if (k >= 1) { b.gone = true; fx.freeShot(b.m); if (b.big) fx.puff('dust', b.tx, b.ty, b.tz, 4 * S, 0.6, 0, 2, 0, 1.6); }
      }
      if (this.tracers.length) this.tracers = this.tracers.filter(b => !b.gone);
    }
  };
})();
