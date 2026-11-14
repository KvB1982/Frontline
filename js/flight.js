'use strict';
// Frontlinie 3 – Luftangriff: Man fliegt das Kampfflugzeug selbst und zerstört die markierten Ziele.
// Richtung: Der Kurs th zeigt nach (sin th, cos th). Bei th = 0 liegt +x links im Bild, eine Linkskurve macht th also größer.
(() => {
  const C = { gold: '#ffc43c', red: '#ef5a4c', green: '#5fd07a', cyan: '#46dcff', text: '#e9eef2', orange: '#ff8c3c', muted: '#9fb0bd' };
  const GRAV = 40;
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  // ---------------------------------------------------------------- Helfer für Flugzeug und Panzer
  FL.wrapAngle = wrap;
  // Winkel zum Ziel, vom eigenen Kurs aus gesehen. Positiv heißt: Das Ziel liegt links.
  FL.bearing = (px, pz, th, tx, tz) => wrap(Math.atan2(tx - px, tz - pz) - th);
  FL.arrowHtml = (rel, dist) => `<span style="display:inline-block;font-size:20px;color:#ff8c3c;transform:rotate(${Math.round(-rel * 180 / Math.PI)}deg)">▲</span> ${Math.round(dist)} m`;
  // Runde Übersichtskarte, die eigene Blickrichtung zeigt immer nach oben.
  FL.drawMinimap = (cv, px, pz, th, range, items) => {
    const g = cv.getContext('2d'), S = cv.width, c = S / 2, k = (c - 6) / range;
    const sin = Math.sin(th), cos = Math.cos(th);
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(160,190,210,0.25)'; g.lineWidth = 1;
    g.beginPath(); g.arc(c, c, (c - 6) / 2, 0, 7); g.stroke();
    for (const it of items) {
      const dx = it.x - px, dz = it.z - pz;
      let f = dx * sin + dz * cos, l = dx * cos - dz * sin;
      const d = Math.hypot(f, l);
      if (d > range) { if (!it.far) continue; f *= range / d; l *= range / d; }
      g.fillStyle = it.color;
      g.beginPath(); g.arc(c - l * k, c - f * k, it.size || 3, 0, 7); g.fill();
    }
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(c, c - 8); g.lineTo(c - 5, c + 6); g.lineTo(c + 5, c + 6); g.closePath(); g.fill();
  };
  // Gebäude so verteilen, dass sie sich nicht überlappen
  FL.scatter = (rnd, placed, r, cx, cz, rMin, rMax, gap) => {
    for (let tries = 0; tries < 200; tries++) {
      const a = rnd() * Math.PI * 2, d = rMin + rnd() * (rMax - rMin + tries);
      const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
      if (placed.every(p => Math.hypot(p.x - x, p.z - z) > p.r + r + gap)) { placed.push({ x, z, r }); return [x, z]; }
    }
    return null;
  };

  FL.FlightMission = class {
    constructor(cfg, lo) {
      this.cfg = cfg; this.lo = lo; this.result = null;
      this.tier = cfg.tier; this.diff = cfg.diff || 0.85;
      const st = this.stage = new FL.Stage(cfg.theme, { far: 2600, shadow: 230, fov: 60, fogNear: 350, fogFar: 2300 });
      this.fx = new FL.FX(st);
      this.t = 0; this.kills = 0; this.coins = 0; this.endT = -1; this.lost = false;
      this.x = 0; this.y = 46; this.z = -720; this.th = 0; this.camTh = 0; this.roll = 0; this.pitch = 0;
      this.speed = 62;
      this.turnRate = 0.85 + 0.17 * lo.p_engine;
      this.hpMax = this.hp = 10 + 3 * lo.p_armor;
      this.fuelMax = this.fuel = 210 + 40 * lo.p_engine + 15 * this.tier;
      this.gunCd = 0; this.bombCd = 0; this.rocketCd = 0; this.shake = 0; this.warnT = 0; this.invuln = 0; this.smokeT = 0; this.jetCd = 25;
      this.bullets = []; this.bombs = []; this.rockets = []; this.flakShots = []; this.ebullets = []; this.jets = [];
      this.structures = []; this.spinners = []; this.burning = [];
      this.buildWorld();
      this.jet = FL.jetModel(0x66788a, 0x2a6fd0);
      this.jet.rotation.order = 'YXZ';
      st.add(this.jet);
      this.ring = this.groundMark('ring', 1);
      this.dot = this.groundMark('glow', 0.8);
      this.dot.material.color.set(0xff5a3c);
      this.buildHud();
      FL.hud.msg('Zerstöre alle markierten Ziele!', C.gold);
      FL.audio.play('jet');
      this.place();
      this.updateCamera(1);
    }

    groundMark(icon, opacity) {
      const m = new THREE.Mesh(FL.geo('mark', () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({ map: FL.tex.icon(icon), transparent: true, depthWrite: false, depthTest: false, opacity, fog: false }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 5;
      this.stage.add(m);
      return m;
    }

    // ---------------------------------------------------------------- Aufbau
    buildWorld() {
      const th = this.cfg.theme, st = this.stage, tier = this.tier, rnd = FL.seeded(71 + Math.round(tier * 10) + th.length * 3);
      st.ground(9000, FL.tex.fields(th), 420);
      st.add(st.strip(13, 2400, FL.tex.road(th), 13, 12, 0, 0, 0.08));
      const cross = st.strip(13, 1800, FL.tex.road(th), 13, 12, 0, 40, 0.1); cross.rotation.z = Math.PI / 2; st.add(cross);
      const placed = [];
      const airfield = th === 'industrie';
      if (airfield) {
        const rw = st.strip(34, 520, FL.tex.concrete('#6f7376'), 17, 20, 120, 20, 0.12); st.add(rw);
        for (let i = -5; i <= 5; i++) st.add(FL.box(1.2, 0.05, 22, FL.basic(0xe8e8e8), 120, 0.16, 20 + i * 44));
        for (let i = 0; i < 13; i++) placed.push({ x: 120, z: -220 + i * 40, r: 20 });
      }
      for (let i = -3; i <= 3; i++) placed.push({ x: 0, z: i * 60, r: 8 }, { x: i * 60, z: 40, r: 8 });

      const prim = ['depot', 'depot', 'bunker', 'depot'];
      if (tier >= 2) prim.push('hangar', 'radar');
      if (tier >= 3) prim.push('hq', 'hangar');
      if (tier >= 4) prim.push('radar', 'bunker');
      if (airfield) prim.push('tower');
      const flakPrim = th === 'daemmerung';
      const nFlak = 2 + Math.round(tier * 1.1);
      const R = 190 + 22 * tier;
      const add = (kind, primary, rMin, rMax, opt) => {
        // aus der Luft wären die Gebäude sonst sehr klein, deshalb etwas größer
        const mesh = FL.building(kind, th, opt), u = mesh.userData, SC = 1.7;
        u.r *= SC; u.h *= SC; mesh.scale.setScalar(SC);
        const p = FL.scatter(rnd, placed, u.r, 0, 30, rMin, rMax, 10);
        if (!p) return null;
        mesh.position.set(p[0], 0, p[1]);
        mesh.rotation.y = Math.floor(rnd() * 4) * Math.PI / 2;
        st.add(mesh);
        if (u.spin) this.spinners.push(u.spin);
        const hp = Math.min(u.hp, 22) * (1.1 + 0.3 * tier);
        const s = { kind, x: p[0], z: p[1], r: u.r, h: u.h, hp, max: hp, mesh, alive: true, primary, cd: FL.rand(1, 3) };
        if (primary) {
          s.marker = FL.sprite(FL.tex.icon('target'), 10, { depthTest: false, fog: false });
          s.marker.position.set(s.x, s.h + 8, s.z); st.add(s.marker);
        }
        this.structures.push(s);
        return s;
      };
      for (const k of prim) add(k, true, 20, R);
      for (let i = 0; i < nFlak; i++) add('flak', flakPrim, 30, R + 30);
      const deco = ['barracks', 'tent', 'house', 'barracks', 'tent', 'antenna', 'bunker', 'house'];
      for (let i = 0; i < 6 + Math.round(tier * 2); i++) add(deco[i % deco.length], false, 20, R + 40);
      if (th === 'industrie' || th === 'winter') add('chimney', false, 30, R);
      this.flak = this.structures.filter(s => s.kind === 'flak');
      this.nPrimary = this.structures.filter(s => s.primary).length;

      // Bäume rundherum (ohne Schatten, damit es flüssig läuft)
      for (let i = 0; i < 520; i++) {
        const a = rnd() * 6.283, d = R + 60 + Math.pow(rnd(), 0.7) * 1100;
        const x = Math.sin(a) * d, z = 30 + Math.cos(a) * d;
        if (Math.abs(x) < 12 || Math.abs(z - 40) < 12) continue;
        if (airfield && Math.abs(x - 120) < 30 && Math.abs(z - 20) < 300) continue;
        const t = FL.tree(FL.pick(st.theme.trees), rnd);
        t.position.set(x, 0, z); t.scale.setScalar(1.5);
        st.add(FL.noShadow(t));
      }
      // ein paar Bäume zwischen den Gebäuden
      for (let i = 0; i < 40; i++) {
        const t = FL.tree(FL.pick(st.theme.trees), rnd), p = FL.scatter(rnd, placed, 3, 0, 30, 20, R + 50, 4);
        if (p) { t.position.set(p[0], 0, p[1]); t.scale.setScalar(1.4); st.add(t); }
      }
    }

    buildHud() {
      FL.hud.clear();
      this.hTL = FL.hud.box('hud-tl'); this.hTC = FL.hud.box('hud-tc'); this.hTR = FL.hud.box('hud-tr');
      this.hInfo = FL.el('div', '', '', this.hTR);
      this.map = FL.el('canvas', 'minimap', null, this.hTR); this.map.width = this.map.height = 170;
      const hint = FL.hud.box('hud-bl');
      hint.innerHTML = 'Wie ein Steuerknüppel: ← → lenken · ↓ ziehen = Nase hoch · ↑ drücken = Nase runter · Leertaste Bordkanone · B Bombe (gelber Kreis zeigt den Einschlag)' + (this.lo.p_rocket ? ' · R Raketen' : '') + ' · P Pause';
    }

    // ---------------------------------------------------------------- Treffer
    left() { return this.structures.filter(s => s.alive && s.primary).length; }
    hitStructure(s, d) {
      if (!s.alive) return;
      s.hp -= d;
      if (s.hp > 0) return;
      s.alive = false;
      const big = s.mesh.userData.fuel || s.r > 6, size = Math.max(2.4, s.r * 0.6) * (s.mesh.userData.fuel ? 1.5 : 1);
      this.fx.explosion(s.x, 1, s.z, size);
      this.fx.explosion(s.x + FL.rand(-3, 3), s.h * 0.6, s.z + FL.rand(-3, 3), size * 0.7, true);
      for (let i = 0; i < 16; i++) this.fx.chunk(s.x + FL.rand(-s.r, s.r) * 0.6, FL.rand(1, s.h), s.z, 3);
      FL.audio.play(big ? 'bigboom' : 'boom');
      this.stage.scene.remove(s.mesh);
      if (s.marker) this.stage.scene.remove(s.marker);
      const rb = FL.rubble(s.r, s.h); rb.position.set(s.x, 0, s.z); this.stage.add(rb);
      this.burning.push({ x: s.x, z: s.z, t: 40, size: Math.max(5, s.r) });
      this.kills++; this.coins += s.primary ? 15 : s.kind === 'flak' ? 8 : 3;
      if (s.primary) {
        const n = this.left();
        if (n === 0) { this.endT = 3; FL.hud.msg('ALLE ZIELE ZERSTÖRT!', C.gold); }
        else FL.hud.msg('Ziel zerstört! Noch ' + n, C.orange, true);
      } else if (s.kind === 'flak') FL.hud.msg('Flak ausgeschaltet!', C.green, true);
    }
    blast(x, y, z, radius, dmg) {
      this.fx.explosion(x, Math.max(0.3, y), z, radius / 5);
      FL.audio.play('boom');
      for (const s of this.structures) {
        if (!s.alive) continue;
        const d = Math.hypot(s.x - x, s.z - z) - s.r * 0.7;
        if (d < radius) this.hitStructure(s, dmg * (d < radius * 0.5 ? 1 : 0.5));
      }
      for (const j of this.jets) if (Math.hypot(j.x - x, j.y - y, j.z - z) < radius + 6) this.hitJet(j, dmg);
    }
    hitJet(j, d) {
      if (j.dead) return;
      j.hp -= d;
      if (j.hp <= 0) {
        j.dead = true;
        this.fx.explosion(j.x, j.y, j.z, 2.2, true);
        for (let i = 0; i < 10; i++) this.fx.chunk(j.x, j.y, j.z, 2.5);
        FL.audio.play('boom');
        this.stage.scene.remove(j.mesh);
        this.kills++; this.coins += 15;
        FL.hud.msg('Jäger abgeschossen!', C.green, true);
      }
    }
    hurt(d) {
      if (this.invuln > 0 || this.lost || this.endT >= 0) return;
      this.hp -= d; this.invuln = 0.5; this.shake = 0.35;
      FL.hud.damage(0.6); FL.audio.play('ouch');
      if (this.hp <= 0) {
        this.hp = 0; this.lost = true; this.endT = 2.2;
        FL.hud.damage(1); FL.hud.msg('Schwer getroffen: Notlandung!', C.red);
      }
    }

    // ---------------------------------------------------------------- ein Zeitschritt
    update(dt) {
      if (this.result) return;
      const lo = this.lo, fx = this.fx;
      this.t += dt;
      this.gunCd -= dt; this.bombCd -= dt; this.rocketCd -= dt; this.invuln -= dt;
      this.shake = Math.max(0, this.shake - dt);

      // lenken
      let turn = (FL.down('ArrowLeft', 'KeyA') ? 1 : 0) - (FL.down('ArrowRight', 'KeyD') ? 1 : 0);
      // Steuerknüppel: nach hinten ziehen (Pfeil runter) hebt die Nase, nach vorn drücken (Pfeil hoch) senkt sie
      let climb = (FL.down('ArrowDown', 'KeyS') ? 1 : 0) - (FL.down('ArrowUp', 'KeyW') ? 1 : 0);
      if (FL.tilt.on) { turn = FL.clamp(turn + FL.tilt.turn, -1, 1); climb = FL.clamp(climb + FL.tilt.climb, -1, 1); }
      const far = Math.hypot(this.x, this.z - 30);
      if (far > 1000) {
        // zu weit weg: Das Flugzeug dreht von selbst zum Zielgebiet zurück
        const rel = FL.bearing(this.x, this.z, this.th, 0, 30);
        if (Math.abs(rel) > 0.25) turn = rel > 0 ? 1 : -1;
        this.warnT -= dt;
        if (this.warnT <= 0) { this.warnT = 4; FL.hud.msg('Zurück zum Zielgebiet!', C.text, true); }
      }
      if (this.lost) { turn = 0; climb = -1.2; }
      this.th = wrap(this.th + turn * this.turnRate * dt);
      this.y = FL.clamp(this.y + climb * 24 * dt, this.lost ? 4 : 16, 85);
      const k = 1 - Math.exp(-5 * dt);
      this.roll = FL.lerp(this.roll, -turn * 0.8, k);
      this.pitch = FL.lerp(this.pitch, -climb * 0.22, k);
      const sin = Math.sin(this.th), cos = Math.cos(this.th);
      this.x += sin * this.speed * dt; this.z += cos * this.speed * dt;
      this.place();
      if (!this.lost && this.endT < 0) {
        this.fuel -= dt;
        if (this.fuel <= 0) { this.fuel = 0; this.lost = true; this.endT = 2.2; FL.hud.msg('Treibstoff leer: Rückflug!', C.red); }
        else if (this.fuel < 30 && Math.floor(this.fuel) % 10 === 0 && Math.floor(this.fuel + dt) !== Math.floor(this.fuel)) FL.hud.msg('Treibstoff wird knapp!', C.orange, true);
      }

      // Zielpunkte am Boden: Bombe (Kreis) und Bordkanone (Punkt)
      const fall = Math.sqrt(2 * this.y / GRAV);
      const bx = this.x + sin * this.speed * fall, bz = this.z + cos * this.speed * fall;
      const bombR = 13 + 4 * lo.p_bomb;
      this.ring.position.set(bx, 0.4, bz); this.ring.scale.set(bombR * 2, bombR * 2, 1);
      this.ring.material.opacity = this.bombCd <= 0 ? 1 : 0.35;
      const gd = 70 + this.y * 2.4, gx = this.x + sin * gd, gz = this.z + cos * gd;
      this.dot.position.set(gx, 0.5, gz); this.dot.scale.set(9, 9, 1);

      const active = !this.lost && this.endT < 0;
      // Bordkanone: zielt von selbst auf einen Jäger, der vor einem fliegt
      if (active && FL.down('Space') && this.gunCd <= 0) {
        this.gunCd = 0.13 - 0.02 * lo.p_gun;
        let tx = gx, ty = 0, tz = gz;
        const tj = this.jets.filter(j => !j.dead && Math.abs(FL.bearing(this.x, this.z, this.th, j.x, j.z)) < 0.3 && Math.hypot(j.x - this.x, j.z - this.z) < 420)[0];
        if (tj) { const tt = Math.hypot(tj.x - this.x, tj.z - this.z) / 420; tx = tj.x + tj.vx * tt; ty = tj.y; tz = tj.z + tj.vz * tt; }
        for (const side of [-1, 1]) {
          const ox = this.x + cos * side * 1.6, oz = this.z - sin * side * 1.6;
          const dx = tx - ox + FL.rand(-2, 2), dy = ty - this.y, dz = tz - oz + FL.rand(-2, 2), d = Math.hypot(dx, dy, dz);
          const mesh = fx.shot(0xffe68c, 0.35, 9);
          this.bullets.push({ x: ox, y: this.y - 0.3, z: oz, vx: dx / d * 420, vy: dy / d * 420, vz: dz / d * 420, dmg: 1 + 0.6 * lo.p_gun, mesh });
        }
        FL.audio.play('shot');
      }
      if (active && FL.down('KeyB', 'KeyX', 'Enter') && this.bombCd <= 0) {
        this.bombCd = 1.5 - 0.3 * lo.p_bomb;
        const mesh = FL.bombModel(); mesh.scale.setScalar(3.2); this.stage.add(mesh);
        this.bombs.push({ x: this.x, y: this.y - 1, z: this.z, vx: sin * this.speed, vy: 0, vz: cos * this.speed, mesh, r: bombR, dmg: 12 + 5 * lo.p_bomb });
        FL.audio.play('drop');
      }
      if (active && lo.p_rocket && FL.down('KeyR') && this.rocketCd <= 0) {
        this.rocketCd = this.rocketMax = 8 - 2.5 * (lo.p_rocket - 1);
        const pool = [...this.structures.filter(s => s.alive), ...this.jets.filter(j => !j.dead)]
          .map(s => ({ s, rel: Math.abs(FL.bearing(this.x, this.z, this.th, s.x, s.z)), d: Math.hypot(s.x - this.x, s.z - this.z) }))
          .filter(o => o.rel < 0.6 && o.d < 650)
          .sort((a, b) => (a.s.primary ? 0 : 300) + a.d - ((b.s.primary ? 0 : 300) + b.d));
        for (const side of [-1, 1]) {
          const mesh = FL.rocketModel(); mesh.scale.setScalar(3); this.stage.add(mesh);
          const tg = pool.length ? pool[(side + 1) / 2 % pool.length].s : null;
          this.rockets.push({ x: this.x + cos * side * 3, y: this.y - 1, z: this.z - sin * side * 3, target: tg, tx: gx, tz: gz, t: 0, mesh });
        }
        FL.audio.play('laser');
        FL.hud.msg(pool.length ? 'Raketen los!' : 'Raketen ohne Ziel abgefeuert', C.cyan, true);
      }

      // eigene Geschosse
      for (const b of this.bullets) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        for (const j of this.jets) if (!j.dead && Math.hypot(j.x - b.x, j.y - b.y, j.z - b.z) < 9) { b.gone = true; this.hitJet(j, b.dmg); fx.spark(b.x, b.y, b.z, 5); break; }
        if (!b.gone && b.y < 20) for (const s of this.structures) {
          if (s.alive && b.y < s.h + 1 && Math.hypot(s.x - b.x, s.z - b.z) < s.r) { b.gone = true; this.hitStructure(s, b.dmg * 0.3); fx.spark(b.x, b.y + 1, b.z, 5); break; }
        }
        if (!b.gone && b.y <= 0) { b.gone = true; fx.puff('dust', b.x, 0.6, b.z, 5, 0.5, 0, 2, 0, 1.5); }
        if (b.gone) fx.freeShot(b.mesh);
        else { b.mesh.position.set(b.x, b.y, b.z); b.mesh.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz); }
      }
      this.bullets = this.bullets.filter(b => !b.gone);
      for (const b of this.bombs) {
        b.vy -= GRAV * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.mesh.position.set(b.x, b.y, b.z); b.mesh.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
        if (b.y <= 0.5) { b.gone = true; this.stage.scene.remove(b.mesh); this.blast(b.x, 0.5, b.z, b.r, b.dmg); }
      }
      this.bombs = this.bombs.filter(b => !b.gone);
      for (const r of this.rockets) {
        r.t += dt;
        const tg = r.target && (r.target.alive || (r.target.hp > 0 && !r.target.dead)) ? r.target : null;
        const tx = tg ? tg.x : r.tx, ty = tg ? (tg.y || tg.h * 0.4) : 0, tz = tg ? tg.z : r.tz;
        const dx = tx - r.x, dy = ty - r.y, dz = tz - r.z, d = Math.hypot(dx, dy, dz) || 1, step = 170 * dt;
        r.x += dx / d * step; r.y += dy / d * step; r.z += dz / d * step;
        r.mesh.position.set(r.x, r.y, r.z); r.mesh.lookAt(tx, ty, tz);
        if (Math.random() < 0.7) fx.puff('white', r.x, r.y, r.z, 3, 0.5, 0, 0.5, 0, 1.8);
        if (d < step + 3 || r.y <= 0.5 || r.t > 6) { r.gone = true; this.stage.scene.remove(r.mesh); this.blast(r.x, Math.max(0.5, r.y), r.z, 10, 12 + 4 * lo.p_rocket); }
      }
      this.rockets = this.rockets.filter(r => !r.gone);

      this.updateFlak(dt, sin, cos, active);
      this.updateJets(dt, active);

      // Rauch, Radarschüsseln, Zielmarken
      for (const b of this.burning) { b.t -= dt; if (Math.random() < dt * 4) fx.puff('smoke', b.x + FL.rand(-1, 1) * b.size * 0.4, 3, b.z, b.size * 2.2, FL.rand(2.5, 4), 1.5, FL.rand(5, 9), 0, 2); }
      this.burning = this.burning.filter(b => b.t > 0);
      for (const s of this.spinners) s.rotation.y += dt * 1.5;
      for (const s of this.structures) if (s.alive && s.marker) {
        const sc = FL.clamp(Math.hypot(s.x - this.x, s.z - this.z) * 0.04, 7, 40) * (1 + Math.sin(this.t * 5) * 0.08);
        s.marker.scale.set(sc, sc, 1); s.marker.position.y = s.h + 4 + sc * 0.6;
      }
      if (this.hp < this.hpMax * 0.4 || this.lost) {
        this.smokeT -= dt;
        if (this.smokeT <= 0) { this.smokeT = 0.06; fx.puff('smoke', this.x - sin * 5, this.y, this.z - cos * 5, 3.5, 1.2, 0, 1, 0, 2); }
      }

      if (this.endT >= 0) { this.endT -= dt; if (this.endT <= 0) this.result = this.lost ? 'lose' : 'win'; }
      fx.update(dt);
      this.updateCamera(dt);
      this.updateHud();
    }

    place() {
      this.jet.position.set(this.x, this.y, this.z);
      this.jet.rotation.set(this.pitch, this.th, this.roll);
      this.jet.visible = !(this.invuln > 0 && Math.floor(this.t * 14) % 2);
    }

    // Flak: Die Granaten platzen dort, wo das Flugzeug bei geradem Flug gleich wäre. Kurven und Höhe wechseln hilft.
    updateFlak(dt, sin, cos, active) {
      const fx = this.fx;
      const near = this.flak.filter(s => s.alive && Math.hypot(s.x - this.x, s.z - this.z) < 480)
        .sort((a, b) => Math.hypot(a.x - this.x, a.z - this.z) - Math.hypot(b.x - this.x, b.z - this.z)).slice(0, 2);
      for (const s of near) {
        s.mesh.userData.gun.rotation.y = Math.atan2(this.x - s.x, this.z - s.z) - s.mesh.rotation.y;
        s.cd -= dt;
        if (s.cd > 0 || !active) continue;
        s.cd = FL.rand(2.4, 3.6) / (1 + 0.07 * this.tier) * (0.85 / this.diff);
        const T = 1.5, err = Math.max(18, 30 - 2.2 * this.tier);
        const tx = this.x + sin * this.speed * T + FL.rand(-err, err), ty = this.y + FL.rand(-err, err) * 0.5, tz = this.z + cos * this.speed * T + FL.rand(-err, err);
        const mesh = fx.shot(0xff8c3c, 0.5, 6);
        this.flakShots.push({ sx: s.x, sy: s.h, sz: s.z, tx, ty, tz, t: 0, T, mesh });
        fx.spark(s.x, s.h + 1, s.z, 6);
      }
      for (const f of this.flakShots) {
        f.t += dt;
        const k = Math.min(1, f.t / f.T);
        f.mesh.position.set(FL.lerp(f.sx, f.tx, k), FL.lerp(f.sy, f.ty, k), FL.lerp(f.sz, f.tz, k));
        f.mesh.lookAt(f.tx, f.ty, f.tz);
        if (k >= 1) {
          f.gone = true; fx.freeShot(f.mesh);
          fx.puff('flash', f.tx, f.ty, f.tz, 12, 0.12, 0, 0, 0, 0.6);
          for (let i = 0; i < 5; i++) fx.puff('flak', f.tx + FL.rand(-3, 3), f.ty + FL.rand(-3, 3), f.tz + FL.rand(-3, 3), FL.rand(8, 13), FL.rand(1.6, 2.6), FL.rand(-1, 1), FL.rand(0, 1.5), FL.rand(-1, 1), 0.8);
          FL.audio.play('pop');
          if (Math.hypot(f.tx - this.x, f.ty - this.y, f.tz - this.z) < 7.5) this.hurt(1);
        }
      }
      this.flakShots = this.flakShots.filter(f => !f.gone);
    }

    // feindliche Jäger ab den späteren Leveln
    updateJets(dt, active) {
      const fx = this.fx;
      if (this.tier >= 2.5 && active) {
        this.jetCd -= dt;
        if (this.jetCd <= 0 && this.jets.filter(j => !j.dead).length < (this.tier >= 4 ? 2 : 1)) {
          this.jetCd = (30 - 3 * this.tier) * (0.85 / this.diff);
          const a = this.th + FL.rand(-0.9, 0.9), d = 700;
          const j = { x: this.x + Math.sin(a) * d, y: this.y + FL.rand(-8, 12), z: this.z + Math.cos(a) * d, th: a + Math.PI, hp: 4 + 1.5 * this.tier, cd: 1.5, brk: 0, vx: 0, vz: 0 };
          j.mesh = FL.jetModel(this.stage.theme.enemy, 0xb03020); j.mesh.rotation.order = 'YXZ'; this.stage.add(j.mesh);
          this.jets.push(j);
          FL.audio.play('alarm'); FL.hud.msg('Feindlicher Jäger!', C.red, true);
        }
      }
      for (const j of this.jets) {
        if (j.dead) continue;
        const rel = FL.bearing(j.x, j.z, j.th, this.x, this.z), d = Math.hypot(this.x - j.x, this.z - j.z);
        let turn = 0;
        if (j.brk > 0) j.brk -= dt;
        else if (d < 60) j.brk = 6;
        else turn = FL.clamp(rel * 2, -1, 1);
        j.th = wrap(j.th + turn * 0.75 * dt);
        j.y = FL.lerp(j.y, this.y + 3, dt * 0.6);
        j.vx = Math.sin(j.th) * 66; j.vz = Math.cos(j.th) * 66;
        j.x += j.vx * dt; j.z += j.vz * dt;
        j.mesh.position.set(j.x, j.y, j.z); j.mesh.rotation.set(0, j.th, -turn * 0.7);
        j.cd -= dt;
        if (active && j.cd <= 0 && j.brk <= 0 && d < 260 && Math.abs(rel) < 0.15) {
          j.cd = 2.4 * (0.85 / this.diff);
          const T = d / 260, tx = this.x + Math.sin(this.th) * this.speed * T + FL.rand(-11, 11), ty = this.y + FL.rand(-6, 6), tz = this.z + Math.cos(this.th) * this.speed * T + FL.rand(-11, 11);
          for (let i = 0; i < 3; i++) this.ebullets.push({ sx: j.x, sy: j.y, sz: j.z, tx, ty, tz, t: -i * 0.08, T, mesh: fx.shot(0xff5a46, 0.35, 8) });
          FL.audio.play('eshot');
        }
      }
      this.jets = this.jets.filter(j => !j.dead);
      for (const b of this.ebullets) {
        b.t += dt;
        const k = FL.clamp(b.t / b.T, 0, 1.6);
        const x = FL.lerp(b.sx, b.tx, k), y = FL.lerp(b.sy, b.ty, k), z = FL.lerp(b.sz, b.tz, k);
        b.mesh.visible = b.t >= 0; b.mesh.position.set(x, y, z); b.mesh.lookAt(b.tx, b.ty, b.tz);
        if (b.t >= 0 && Math.hypot(x - this.x, y - this.y, z - this.z) < 4) { b.gone = true; this.hurt(1); }
        if (k >= 1.6) b.gone = true;
        if (b.gone) fx.freeShot(b.mesh);
      }
      this.ebullets = this.ebullets.filter(b => !b.gone);
    }

    updateCamera(dt) {
      const cam = this.stage.camera;
      this.camTh += wrap(this.th - this.camTh) * (1 - Math.exp(-3.5 * dt));
      const sin = Math.sin(this.camTh), cos = Math.cos(this.camTh), sh = this.shake * 2;
      cam.position.set(this.x - sin * 27 + FL.rand(-sh, sh), this.y + 9 + FL.rand(-sh, sh), this.z - cos * 27);
      cam.lookAt(this.x + sin * 45, this.y - 9, this.z + cos * 45);
      this.stage.update(new THREE.Vector3(this.x + Math.sin(this.th) * 90, 0, this.z + Math.cos(this.th) * 90));
    }

    updateHud() {
      const H = FL.hud, lo = this.lo, hp = this.hp / this.hpMax, fuel = this.fuel / this.fuelMax;
      H.set(this.hTL, `<div class="hud-big"><span class="coins">${this.coins}</span></div>` +
        `<div>Panzerung</div>${H.meter(hp, hp < 0.35 ? 'red' : hp < 0.65 ? 'gold' : '')}` +
        `<div>Treibstoff</div>${H.meter(fuel, fuel < 0.2 ? 'red' : 'cyan')}` +
        `<div>Höhe ${Math.round(this.y * 10)} m</div>`);
      let tc = `<div>Ziele: noch <b style="color:#ff8c3c">${this.left()}</b> von ${this.nPrimary}</div>`;
      const next = this.structures.filter(s => s.alive && s.primary).sort((a, b) => Math.hypot(a.x - this.x, a.z - this.z) - Math.hypot(b.x - this.x, b.z - this.z))[0];
      if (next) tc += `<div>Nächstes Ziel ${FL.arrowHtml(FL.bearing(this.x, this.z, this.th, next.x, next.z), Math.hypot(next.x - this.x, next.z - this.z))}</div>`;
      H.set(this.hTC, tc);
      let tr = `<div class="slot ${this.bombCd <= 0 ? 'ready' : ''}"><b>B</b>Bombe ${this.bombCd <= 0 ? 'bereit' : 'lädt'}</div>`;
      if (lo.p_rocket) tr += `<br><div class="slot ${this.rocketCd <= 0 ? 'ready' : ''}"><b>R</b>Raketen${this.rocketCd <= 0 ? ' bereit' : `<i style="width:${Math.round((1 - this.rocketCd / this.rocketMax) * 100)}%"></i>`}</div>`;
      H.set(this.hInfo, tr);
      const items = [];
      for (const s of this.structures) if (s.alive) items.push({ x: s.x, z: s.z, color: s.primary ? '#ff5a3c' : s.kind === 'flak' ? '#ffc43c' : '#6f7f8c', size: s.primary ? 4 : 2.5, far: s.primary });
      for (const j of this.jets) items.push({ x: j.x, z: j.z, color: '#ff40c0', size: 4, far: true });
      FL.drawMinimap(this.map, this.x, this.z, this.th, 520, items);
    }

    onKey() {}
    destroy() { this.stage.dispose(); }
  };
})();
