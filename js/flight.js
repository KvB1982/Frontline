'use strict';
// Frontlinie 3 – Luftangriff: Man fliegt das Kampfflugzeug selbst und zerstört die markierten Ziele.
// Richtung: Der Kurs th zeigt nach (sin th, cos th). Bei th = 0 liegt +x links im Bild, eine Linkskurve macht th also größer.
(() => {
  const C = { gold: '#ffc43c', red: '#ef5a4c', green: '#5fd07a', cyan: '#46dcff', text: '#e9eef2', orange: '#ff8c3c', muted: '#9fb0bd' };
  const GRAV = 40, CEIL = 600;                                     // größte Flughöhe (im Spiel als 6000 m angezeigt)
  // Die eigene Flugbasis liegt südlich vom Zielgebiet. Die Startbahn läuft von Süd (RZ0) nach Nord (RZ1).
  const BX = -260, RZ0 = -1100, RZ1 = -680, GY = 1.7;
  const PARK = { x: -312, z: -1078 }, DOOR = { x: -338, z: -1037 }, START = { x: BX, z: -1085 };
  const AP_N = { x: BX, z: RZ1 + 220, th: Math.PI, dir: -1 }, AP_S = { x: BX, z: RZ0 - 220, th: 0, dir: 1 };
  const BASE_C = { x: BX, z: (RZ0 + RZ1) / 2 };
  const BIOMES = { berge: 'in den Bergen', wald: 'im Wald', meer: 'am Meer', wueste: 'in der Wüste' };
  const Y_AXIS = new THREE.Vector3(0, 1, 0), X_AXIS = new THREE.Vector3(1, 0, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);
  const QA = new THREE.Quaternion(), QT = new THREE.Quaternion(), M4 = new THREE.Matrix4(), T1 = new THREE.Vector3(), T2 = new THREE.Vector3(), T3 = new THREE.Vector3();
  // Drehung, bei der die Nase nach f zeigt und die Flügel waagrecht liegen
  const levelQuat = f => { T2.crossVectors(Y_AXIS, f).normalize(); T3.crossVectors(f, T2); M4.makeBasis(T2, T3, f); return QT.setFromRotationMatrix(M4); };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
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
      g.beginPath(); g.arc(c - l * k, c - f * k, it.size || 3, 0, 7);
      if (it.ring) { g.strokeStyle = it.color; g.lineWidth = 2.5; g.stroke(); } else { g.fillStyle = it.color; g.fill(); }
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
      // sc = Besonderheiten eines Sondereinsatzes, pw = wie stark das eigene Flugzeug ausgebaut ist (0 bis 1): Der Gegner hält dagegen
      const sc = this.sc = cfg.sc || {};
      this.pw = (lo.p_armor + lo.p_gun + lo.p_bomb + lo.p_engine + lo.p_rocket * 1.5) / 15;
      this.goal = sc.goal || 'targets'; this.jetKills = 0; this.timeLeft = sc.time || 0; this.goAround = 0;
      const st = this.stage = new FL.Stage(cfg.theme, { far: 2600, shadow: 230, fov: 60, fogNear: 350, fogFar: 2300 });
      this.fx = new FL.FX(st);
      this.t = 0; this.kills = 0; this.coins = 0; this.endT = -1; this.lost = false;
      this.x = PARK.x; this.y = GY; this.z = PARK.z; this.th = Math.PI / 2; this.camTh = this.th; this.roll = 0; this.pitch = 0;
      this.speed = 62; this.v = 0; this.floor = 16;
      this.gearDown = true; this.ab = false; this.gearT = 0; this.lock = null;
      this.phase = 'walk'; this.rtb = false; this.alarmT = 0; this.alarmN = 0; this.bview = null;
      this.walkCam = Math.atan2(PARK.x - DOOR.x, PARK.z - DOOR.z);
      this.turnRate = 0.85 + 0.17 * lo.p_engine; this.pitchRate = 1.05 + 0.1 * lo.p_engine;
      // Fluglage: q dreht das Flugzeug, F = nach vorn, U = nach oben, L = zur linken Tragfläche
      this.q = new THREE.Quaternion(); this.F = new THREE.Vector3(0, 0, 1); this.U = new THREE.Vector3(0, 1, 0); this.L = new THREE.Vector3(1, 0, 0);
      this.fov0 = this.stage.camera.fov; this.camF = new THREE.Vector3(0, 0, 1); this.camU = new THREE.Vector3(0, 1, 0); this.recov = false;
      this.hpMax = this.hp = 10 + 3 * lo.p_armor;
      this.fuelMax = this.fuel = (210 + 40 * lo.p_engine + 15 * this.tier) * (sc.fuel || 1);
      this.gunCd = 0; this.bombCd = 0; this.rocketCd = 0; this.shake = 0; this.warnT = 0; this.invuln = 0; this.smokeT = 0; this.jetCd = sc.jets ? 9 : 25;
      this.bullets = []; this.bombs = []; this.rockets = []; this.flakShots = []; this.ebullets = []; this.jets = [];
      this.structures = []; this.spinners = []; this.burning = [];
      this.buildWorld();
      this.jet = FL.jetModel(0x66788a, 0x2a6fd0);
      this.jet.rotation.order = 'YXZ';
      st.add(this.jet);
      this.ring = this.groundMark('ring', 1);
      this.dot = this.groundMark('glow', 0.8);
      this.dot.material.color.set(0xff5a3c);
      this.lockMark = FL.sprite(FL.tex.icon('ring'), 1, { depthTest: false }); this.lockMark.material.color.set(0x5fff7a); this.lockMark.visible = false; st.add(this.lockMark);
      this.goalRing = this.groundMark('ring', 1);
      this.goalRing.material = this.goalRing.material.clone(); this.goalRing.material.color.set(0x46dcff);
      this.hero = { x: DOOR.x, z: DOOR.z, th: this.walkCam, mesh: FL.soldier({ team: 'hero', weapon: 0 }) };
      st.add(this.hero.mesh);
      this.apMarks = [AP_N, AP_S].map(a => { const m = FL.sprite(FL.tex.icon('ring'), 30, { depthTest: false, fog: false }); m.material.color.set(0x46dcff); m.position.set(a.x, 30, a.z); m.visible = false; st.add(m); return m; });
      this.bcam = new THREE.PerspectiveCamera(48, 1.6, 0.5, 2600);
      this.buildHud();
      this.setShadow(55);
      FL.tilt.air = false;
      FL.hud.msg('ALARM!', C.red); FL.hud.msg('Lauf zu deinem Flugzeug!', C.gold, true);
      this.place();
      this.updateBase(0);
      // Die Bomben-Kamera wird als kleines zweites Bild über das Hauptbild gezeichnet.
      st.render = () => {
        const r = FL.renderer, W = window.innerWidth, H = window.innerHeight;
        r.setScissorTest(false); r.setViewport(0, 0, W, H);
        r.render(st.scene, st.camera);
        if (!this.bview) return;
        const q = this.camBox.getBoundingClientRect();
        if (q.width < 10) return;
        this.bcam.aspect = q.width / q.height; this.bcam.updateProjectionMatrix();
        st.sky.position.copy(this.bcam.position);
        r.setScissorTest(true); r.setScissor(q.left, H - q.bottom, q.width, q.height); r.setViewport(q.left, H - q.bottom, q.width, q.height);
        r.render(st.scene, this.bcam);
        r.setScissorTest(false); r.setViewport(0, 0, W, H);
        st.sky.position.copy(st.camera.position);
      };
    }
    setShadow(S) {
      const c = this.stage.sun.shadow.camera;
      if (c.right === S) return;
      c.left = -S; c.right = S; c.top = S; c.bottom = -S; c.updateProjectionMatrix();
    }
    setPhase(ph) {
      this.phase = ph;
      if (ph === 'flight') { this.q.setFromEuler(new THREE.Euler(this.pitch, this.th, this.roll, 'YXZ')); this.F.set(0, 0, 1).applyQuaternion(this.q); this.camF.copy(this.F); this.camU.set(0, 1, 0); }
      const air = ph === 'flight' || ph === 'landing';
      this.setShadow(air ? 230 : 55);
      const cockpit = !['walk', 'walkback', 'parked'].includes(ph);
      if (FL.tilt.air !== (ph === 'flight') || FL.tilt.cockpit !== cockpit) { FL.tilt.air = ph === 'flight'; FL.tilt.cockpit = cockpit; if (FL.tilt.onChange) FL.tilt.onChange(); }
      const H = {
        walk: '← → ↑ ↓ laufen · Lauf zum Flugzeug (blauer Kreis)',
        taxi: '↑ Gas · ↓ bremsen · ← → lenken · Roll zum blauen Kreis auf der Startbahn',
        lineup: 'Das Flugzeug richtet sich aus …',
        takeoff: '↑ halten = Vollgas · Umschalt = Nachbrenner · bei genug Tempo ↓ ziehen = abheben',
        flight: 'Steuerknüppel: ← → Schräglage und Kurve · Q E Rolle · ↓ ziehen = Nase hoch (halten = Looping) · ↑ = Nase runter · Leertaste oder Mausklick Bordkanone · B Bombe' + (this.lo.p_rocket ? ' · R Raketen' : '') + ' · G Fahrwerk · F Landeklappen · Umschalt Nachbrenner',
        landing: 'Aufgesetzt: Das Flugzeug bremst und rollt aus',
        taxiback: '↑ Gas · ↓ bremsen · ← → lenken · Roll zum Parkplatz (blauer Kreis)',
        parked: 'Motor aus …',
        walkback: '← → ↑ ↓ laufen · Geh ins Basisgebäude (blauer Kreis)'
      }[ph];
      if (this.hint) this.hint.innerHTML = H + ' · P Pause';
    }

    groundMark(icon, opacity) {
      const m = new THREE.Mesh(FL.geo('mark', () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({ map: FL.tex.icon(icon), transparent: true, depthWrite: false, depthTest: false, opacity, fog: false }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 5;
      this.stage.add(m);
      return m;
    }

    // ---------------------------------------------------------------- Aufbau
    buildWorld() {
      const th = this.cfg.theme, st = this.stage, tier = this.tier, sc = this.sc;
      // Der Einsatzort liegt jedes Mal woanders: Richtung, Entfernung, Landschaft und Anordnung werden ausgewürfelt.
      const fixed = !!this.cfg.fixed, R0 = fixed ? 0.5 : Math.random();
      const rnd = FL.seeded(71 + Math.round(tier * 10) + th.length * 3 + (sc.seed || 0) + (fixed ? 0 : Math.floor(Math.random() * 5000)));
      const sa = fixed ? 0.27 : (Math.random() * 2 - 1) * 2.1, sd = fixed ? 955 : 1500 + Math.random() * 1100;
      const OX = Math.round(BASE_C.x + Math.sin(sa) * sd), OZ = Math.round(BASE_C.z + Math.cos(sa) * sd) - 30;
      const biome = sc.ships ? 'meer' : sc.biome || this.cfg.biome || Object.keys(BIOMES)[Math.floor(R0 * 4) % 4];
      this.site = { x: OX, z: OZ + 30, a: sa, d: sd, biome };
      this.mid = { x: (BASE_C.x + OX) / 2, z: (BASE_C.z + OZ) / 2 }; this.midR = sd / 2 + 1150;
      if (this.timeLeft > 0) this.timeLeft += Math.round(sd / 55);
      const gnd = st.ground(16000, FL.tex.fields(th), 420); gnd.position.x = this.mid.x; gnd.position.z = this.mid.z;
      st.add(st.strip(13, 2400, FL.tex.road(th), 13, 12, OX, OZ, 0.08));
      const cross = st.strip(13, 1800, FL.tex.road(th), 13, 12, OX, OZ + 40, 0.1); cross.rotation.z = Math.PI / 2; st.add(cross);
      const placed = [];
      const airfield = th === 'industrie';
      if (airfield) {
        const rw = st.strip(34, 520, FL.tex.concrete('#6f7376'), 17, 20, OX + 120, OZ + 20, 0.12); st.add(rw);
        for (let i = -5; i <= 5; i++) st.add(FL.box(1.2, 0.05, 22, FL.basic(0xe8e8e8), OX + 120, 0.16, OZ + 20 + i * 44));
        for (let i = 0; i < 13; i++) placed.push({ x: 120, z: -220 + i * 40, r: 20 });
      }
      for (let i = -3; i <= 3; i++) placed.push({ x: 0, z: i * 60, r: 8 }, { x: i * 60, z: 40, r: 8 });

      const R = 190 + 22 * tier;
      this.buildBiome(biome, OX, OZ, R, rnd);
      const prim = ['depot', 'depot', 'bunker', 'depot'];
      if (tier >= 2) prim.push('hangar', 'radar');
      if (tier >= 3) prim.push('hq', 'hangar');
      if (tier >= 4) prim.push('radar', 'bunker');
      if (airfield) prim.push('tower');
      if (sc.prim) { prim.length = 0; prim.push(...sc.prim); }
      if (sc.ships && !sc.prim) prim.length = 0;                      // reiner Seeeinsatz: An Land steht nur der Hafen
      const flakPrim = sc.flakPrim !== undefined ? sc.flakPrim : th === 'daemmerung';
      const nFlak = 2 + Math.round(tier * 1.1) + (sc.flak || 0) + Math.round(2 * this.pw);
      const add = (kind, primary, rMin, rMax, opt) => {
        // aus der Luft wären die Gebäude sonst sehr klein, deshalb etwas größer
        const mesh = FL.building(kind, th, opt), u = mesh.userData, SC = 1.7;
        u.r *= SC; u.h *= SC; mesh.scale.setScalar(SC);
        const p = FL.scatter(rnd, placed, u.r, 0, 30, rMin, rMax, 10);
        if (!p) return null;
        p[0] += OX; p[1] += OZ;
        mesh.position.set(p[0], 0, p[1]);
        mesh.rotation.y = Math.floor(rnd() * 4) * Math.PI / 2;
        st.add(mesh);
        if (u.spin) this.spinners.push(u.spin);
        const hp = Math.min(u.hp, 22) * (1.1 + 0.3 * tier) * (1 + 0.7 * this.pw);
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
      // Schiffe: Am Meer liegen immer welche vor der Küste, beim Seeeinsatz ist es ein ganzer Verband
      this.ships = [];
      if (biome === 'meer') {
        const ux = Math.sin(this.site.a), uz = Math.cos(this.site.a), n = sc.ships ? sc.ships.n : this.cfg.sc ? 0 : 2, nBig = sc.ships ? (sc.ships.big || 0) : 1;      // Sondereinsätze behalten ihre festen Ziele
        for (let i = 0; i < n; i++) {
          const big = i < nBig, mesh = FL.shipModel(big), u = mesh.userData, SC = 1.5;
          mesh.scale.setScalar(SC);
          const out = R + 260 + (i % 3) * 150 + rnd() * 90, side = (i - (n - 1) / 2) * 190 + (rnd() - 0.5) * 80;
          const x = OX + ux * out + uz * side, z = OZ + 30 + uz * out - ux * side;
          const hd = this.site.a + Math.PI / 2 + (rnd() - 0.5) * 0.5 + (i % 2 ? Math.PI : 0);
          mesh.position.set(x, 0, z); mesh.rotation.y = hd; st.add(mesh);
          this.spinners.push(u.spin);
          const hp = u.hp * (1 + 0.25 * tier) * (1 + 0.7 * this.pw);
          const s = { kind: 'ship', ship: true, big, x, z, r: u.r * SC, h: u.h * SC, hp, max: hp, mesh, alive: true, primary: true, cd: FL.rand(1, 3), hd, v: big ? 3.5 : 6, turnT: FL.rand(14, 26) };
          s.marker = FL.sprite(FL.tex.icon('target'), 10, { depthTest: false, fog: false }); s.marker.position.set(x, s.h + 8, z); st.add(s.marker);
          this.structures.push(s); this.ships.push(s);
        }
      }
      this.sinking = [];
      // Bodenkampf: Eigene Truppen greifen die Basis an, davor stehen Soldaten, Panzer und Fahrzeuge des Gegners
      if (sc.support) {
        const SC = 1.8;
        this.fight = new FL.GroundFight({ stage: st, fx: this.fx, theme: th, cx: OX, cz: OZ + 30, a: this.site.a + Math.PI, front: R + 70, back: R + 330, scale: SC, rnd,
          foes: sc.support.foes, own: sc.support.own, hpMul: (1 + 0.2 * tier) * (1 + 0.5 * this.pw), last: (sc.support.last || 170) * (0.85 / this.diff),
          onDead: (u, mine) => this.unitDead(u, mine) });
        for (const u of this.fight.foes) {
          u.primary = true;
          u.marker = FL.sprite(FL.tex.icon('target'), 10, { depthTest: false, fog: false }); u.marker.position.set(u.x, u.h + 8, u.z); st.add(u.marker);
          this.structures.push(u);
        }
      }
      this.buildBase(th);
      this.flak = this.structures.filter(s => s.kind === 'flak' || s.ship);
      this.nPrimary = this.goal === 'jets' ? sc.jets.need : this.structures.filter(s => s.primary).length;

      // Bäume rund um den Einsatzort und rund um die eigene Basis (ohne Schatten, damit es flüssig läuft)
      const okTree = (x, z) => !(x > -420 && x < -200 && z > RZ0 - 90 && z < RZ1 + 60) && !(Math.abs(x - BX) < 45 && z > RZ0 - 420 && z < RZ1 + 420);
      const kinds = biome === 'wueste' ? FL.THEMES.wueste.trees : st.theme.trees;
      for (let i = 0; i < 720; i++) {
        const atBase = i >= 520, a = rnd() * 6.283, d = atBase ? 60 + Math.pow(rnd(), 0.7) * 900 : R + 60 + Math.pow(rnd(), 0.7) * 1100;
        const lx = Math.sin(a) * d, lz = 30 + Math.cos(a) * d;
        if (!atBase && (Math.abs(lx) < 12 || Math.abs(lz - 40) < 12)) continue;
        if (!atBase && airfield && Math.abs(lx - 120) < 30 && Math.abs(lz - 20) < 300) continue;
        const x = atBase ? BASE_C.x + lx : OX + lx, z = atBase ? BASE_C.z + lz : OZ + lz;
        if (!okTree(x, z)) continue;
        if (this.sea && this.sea(x, z)) continue;
        const t = FL.tree(FL.pick(atBase ? st.theme.trees : kinds), rnd, true);
        t.position.set(x, 0, z); t.scale.setScalar(1.5);
        st.add(FL.noShadow(t));
      }
      // ein paar Bäume zwischen den Gebäuden
      for (let i = 0; i < 40; i++) {
        const t = FL.tree(FL.pick(kinds), rnd, true), p = FL.scatter(rnd, placed, 3, 0, 30, 20, R + 50, 4);
        if (p) { t.position.set(p[0] + OX, 0, p[1] + OZ); t.scale.setScalar(1.4); st.add(t); }
      }
    }

    // Landschaft am Einsatzort: Berge, dichter Wald, Küste oder Wüste
    buildBiome(biome, OX, OZ, R, rnd) {
      const st = this.stage, cx = OX, cz = OZ + 30;
      const patch = (name, rad, y) => {
        const t = FL.tex.ground(name).clone(); t.needsUpdate = true; t.repeat.set(rad * 2 / 18, rad * 2 / 18);
        const g = new THREE.CircleGeometry(rad, 48), m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ map: t, shininess: 2, specular: 0x050505, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
        m.rotation.x = -Math.PI / 2; m.position.set(cx, y, cz); m.receiveShadow = true;
        st.owned.push(g, t, m.material); st.add(m);
      };
      if (biome === 'wueste') patch('wueste', R + 520, 0.04);
      else if (biome === 'berge') {
        patch('winter', R + 260, 0.04);
        const rock = FL.mat(0x77797c, { flat: true }), snow = FL.mat(0xf2f5f8, { flat: true });
        for (let i = 0; i < 16; i++) {
          const a = i / 16 * 6.283 + rnd() * 0.3, d = R + 330 + rnd() * 620, rad = 150 + rnd() * 190, h = 190 + rnd() * 300;
          const g = new THREE.Group();
          const c1 = new THREE.Mesh(FL.geo('berg', () => new THREE.ConeGeometry(1, 1, 7)), rock); c1.scale.set(rad, h, rad); c1.position.y = h / 2;
          const c2 = new THREE.Mesh(FL.geo('berg', () => new THREE.ConeGeometry(1, 1, 7)), snow); c2.scale.set(rad * 0.36, h * 0.36, rad * 0.36); c2.position.y = h * 0.825;
          g.add(c1, c2); g.rotation.y = rnd() * 6;
          g.position.set(cx + Math.sin(a) * d, -4, cz + Math.cos(a) * d);
          const x = g.position.x, z = g.position.z;
          if (Math.abs(x - BX) < rad + 120 && z > RZ0 - 900 && z < RZ1 + 900) continue;      // nicht in den Landeanflug
          st.add(g);
        }
      } else if (biome === 'meer') {
        // Küste: Strand unter dem Einsatzort, dahinter das Meer (auf der Seite, die von der eigenen Basis weg zeigt)
        patch('wueste', R + 300, 0.04);
        const ux = Math.sin(this.site.a), uz = Math.cos(this.site.a), edge = R + 110;
        const g = new THREE.PlaneGeometry(9000, 9000), m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0x2c6f9c, shininess: 70, specular: 0x8fb8d0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }));
        m.rotation.x = -Math.PI / 2; m.position.set(0, 0.07, edge + 4500); m.receiveShadow = true;
        const sg = new THREE.Group(); sg.add(m); sg.rotation.y = this.site.a; sg.position.set(cx, 0, cz);
        st.owned.push(g, m.material); st.add(sg);
        this.sea = (x, z) => (x - cx) * ux + (z - cz) * uz > edge - 6;
      } else patch('wald', R + 420, 0.04);
      if (biome === 'wald') for (let i = 0; i < 380; i++) {
        const a = rnd() * 6.283, d = R + 30 + Math.sqrt(rnd()) * 480, x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
        const t = FL.tree(FL.pick(['pine', 'pine', 'leaf', 'leaf', 'bush']), rnd, true); t.position.set(x, 0, z); t.scale.setScalar(1.5 + rnd() * 0.5);
        st.add(FL.noShadow(t));
      }
    }

    // Die eigene Flugbasis: Startbahn, Vorfeld, Basisgebäude, Hangar, Tower
    buildBase(th) {
      const st = this.stage, con = FL.tex.concrete('#74787b'), W = FL.basic(0xeeeeee);
      // flach über dem Boden: polygonOffset verhindert Flimmern, wenn man knapp darüber steht
      const flat = (m, n) => { m.material.polygonOffset = true; m.material.polygonOffsetFactor = -n; m.material.polygonOffsetUnits = -n * 4; return st.add(m); };
      flat(st.strip(80, 76, FL.tex.concrete('#6a6e70'), 16, 19, -315, -1074, 0.16), 2);
      flat(st.strip(30, RZ1 - RZ0, con, 15, 20, BX, (RZ0 + RZ1) / 2, 0.2), 3);
      for (let z = RZ0 + 30; z < RZ1 - 20; z += 34) { const b = FL.box(0.9, 0.04, 16, W, BX, 0.27, z); b.castShadow = false; st.add(b); }
      for (const z of [RZ0 + 8, RZ1 - 8]) for (let i = -3; i <= 3; i++) { if (!i) continue; const b = FL.box(2, 0.04, 10, W, BX + i * 3.6, 0.27, z); b.castShadow = false; st.add(b); }
      // Anflugbefeuerung an beiden Enden
      for (const [z0, d] of [[RZ0, -1], [RZ1, 1]]) for (let i = 1; i <= 6; i++) for (const sx of [-1, 1]) {
        const l = FL.ball(0.7, FL.basic(i % 2 ? 0xffffff : 0xffc43c), BX + sx * 9, 0.6, z0 + d * i * 32, 6, 5); l.castShadow = false; st.add(l);
      }
      this.baseSolid = [];
      const put = (kind, x, z, rot, r) => {
        const b = FL.building(kind, th); b.position.set(x, 0, z); b.rotation.y = rot || 0; st.add(b);
        if (b.userData.spin) this.spinners.push(b.userData.spin);
        this.baseSolid.push({ x, z, r: r || b.userData.r });
        return b;
      };
      put('hq', DOOR.x, -1029, 0, 7); put('hangar', -347, -1086, Math.PI / 2, 9); put('tower', -300, -1031); put('radar', -318, -1029);
      put('barracks', -372, -1040, Math.PI / 2, 6); put('tent', -372, -1066);
      for (const [x, z] of [[-340, -1104], [-306, -1104]]) {
        const j = FL.jetModel(0x66788a, 0x2a6fd0); j.userData.gear.visible = true; j.position.set(x, GY, z); j.rotation.y = Math.PI / 2; st.add(j);
        this.baseSolid.push({ x, z, r: 5.5 });
      }
      for (const [x, z, r] of [[-330, -1040, 1.2], [-326, -1040.5, -0.6], [-296, -1060, 2.6]]) {
        const a = FL.soldier({ team: 'ally', weapon: 1 }); a.position.set(x, 0, z); a.rotation.y = r; st.add(a);
      }
      const pole = FL.cyl(0.08, 0.08, 9, 5, FL.mat(0xcccccc), -327, 4.5, -1035); st.add(pole);
      st.add(FL.box(2.4, 1.4, 0.06, FL.mat(0x2a6fd0), -325.8, 8.2, -1035));
    }

    buildHud() {
      FL.hud.clear();
      this.hTL = FL.hud.box('hud-tl'); this.hTC = FL.hud.box('hud-tc'); this.hTR = FL.hud.box('hud-tr');
      this.hInfo = FL.el('div', '', '', this.hTR);
      this.map = FL.el('canvas', 'minimap', null, this.hTR); this.map.width = this.map.height = 170;
      this.hint = FL.hud.box('hud-bl');
      this.camBox = FL.el('div', 'bombcam', '<span>BOMBEN-KAMERA</span><b></b>', FL.hud.root);
      this.camBox.style.display = 'none';
      this.setPhase(this.phase);
    }

    // ---------------------------------------------------------------- Treffer
    left() { return this.goal === 'jets' ? Math.max(0, this.sc.jets.need - this.jetKills) : this.structures.filter(s => s.alive && s.primary).length; }
    // ein Ziel weniger: Sind alle erledigt, geht es zurück zur Basis
    scored(word) {
      if (this.rtb) return;
      const n = this.left();
      if (n === 0) {
        this.rtb = true; FL.audio.play('up');
        FL.hud.msg(this.goal === 'jets' ? 'ALLE JÄGER ABGESCHOSSEN!' : this.fight ? 'BASIS EINGENOMMEN!' : 'ALLE ZIELE ZERSTÖRT!', C.gold); FL.hud.msg('Flieg zurück zur Basis und lande selbst', C.cyan, true);
        for (const m of this.apMarks) m.visible = true;
      }
      else FL.hud.msg(word + ' Noch ' + n, C.orange, true);
    }
    // ein Trupp oder Fahrzeug im Bodenkampf ist ausgefallen
    unitDead(u, mine) {
      if (u.team === 'own') {
        if (!this.fight.own.some(o => o.alive) && !this.rtb && !this.lost && this.endT < 0) { this.lost = true; this.endT = 2.4; FL.hud.msg('Unsere Bodentruppen mussten sich zurückziehen!', C.red); }
        else if (!this.rtb) FL.hud.msg('Unsere Truppen brauchen Hilfe!', C.orange, true);
        return;
      }
      if (u.kind !== 'squad') this.burning.push({ x: u.x, z: u.z, t: 12, size: 5 });
      this.kills++; if (mine) this.coins += u.kind === 'tank' ? 14 : u.kind === 'jeep' ? 9 : 7;
      this.scored(u.kind === 'tank' ? 'Panzer zerstört!' : u.kind === 'jeep' ? 'Fahrzeug zerstört!' : 'Trupp vertrieben!');
    }
    hitStructure(s, d) {
      if (!s.alive) return;
      if (s.unit) { this.fight.hit(s, d, true); return; }
      s.hp -= d;
      if (s.hp > 0) return;
      s.alive = false;
      const big = s.mesh.userData.fuel || s.r > 6, size = Math.max(2.4, s.r * 0.6) * (s.mesh.userData.fuel ? 1.5 : 1);
      this.fx.explosion(s.x, 1, s.z, size);
      this.fx.explosion(s.x + FL.rand(-3, 3), s.h * 0.6, s.z + FL.rand(-3, 3), size * 0.7, true);
      for (let i = 0; i < 16; i++) this.fx.chunk(s.x + FL.rand(-s.r, s.r) * 0.6, FL.rand(1, s.h), s.z, 3);
      FL.audio.play(big ? 'bigboom' : 'boom');
      if (s.marker) this.stage.scene.remove(s.marker);
      if (s.ship) { this.sinking.push({ s, t: 0 }); this.burning.push({ x: s.x, z: s.z, t: 9, size: 7 }); }
      else {
        this.stage.scene.remove(s.mesh);
        const rb = FL.rubble(s.r, s.h); rb.position.set(s.x, 0, s.z); this.stage.add(rb);
        this.burning.push({ x: s.x, z: s.z, t: 40, size: Math.max(5, s.r) });
      }
      this.kills++; this.coins += s.ship ? (s.big ? 30 : 20) : s.primary ? 15 : s.kind === 'flak' ? 8 : 3;
      if (s.primary) {
        this.scored(s.ship ? 'Schiff versenkt!' : 'Ziel zerstört!');
      } else if (s.kind === 'flak') FL.hud.msg('Flak ausgeschaltet!', C.green, true);
    }
    blast(x, y, z, radius, dmg) {
      this.fx.explosion(x, Math.max(0.3, y), z, radius / 5);
      FL.audio.play('boom');
      let hit = false;
      for (const s of this.structures) {
        if (!s.alive) continue;
        const d = Math.hypot(s.x - x, s.z - z) - s.r * 0.7;
        if (d < radius) { hit = true; this.hitStructure(s, dmg * (d < radius * 0.5 ? 1 : 0.5)); }
      }
      for (const j of this.jets) if (Math.hypot(j.x - x, j.y - y, j.z - z) < radius + 6) { hit = true; this.hitJet(j, dmg); }
      return hit;
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
        this.kills++; this.coins += 15; this.jetKills++;
        if (this.goal === 'jets') this.scored('Jäger abgeschossen!'); else FL.hud.msg('Jäger abgeschossen!', C.green, true);
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
      if (this.phase !== 'flight') { this.updateBase(dt); return; }

      // ---- lenken: frei in alle Richtungen (Schräglage, Rolle, Looping, Rückenflug, Sturzflug)
      let turn = FL.clamp((FL.down('ArrowLeft', 'KeyA') ? 1 : 0) - (FL.down('ArrowRight', 'KeyD') ? 1 : 0) - FL.stick.x, -1, 1);
      // Steuerknüppel: nach hinten ziehen (Pfeil runter) hebt die Nase, nach vorn drücken (Pfeil hoch) senkt sie
      let climb = FL.clamp((FL.down('ArrowDown', 'KeyS') ? 1 : 0) - (FL.down('ArrowUp', 'KeyW') ? 1 : 0) - FL.stick.y, -1, 1);
      const rollKey = (FL.down('KeyQ') ? 1 : 0) - (FL.down('KeyE') ? 1 : 0);
      let hard = rollKey !== 0;                                          // Q und E (iPad: Knöpfe „Rolle“): Rolle um die Längsachse
      if (hard) turn = rollKey;
      if (FL.tilt.on) {
        turn = FL.clamp(turn + FL.tilt.turn * 0.9, -1, 1); climb = FL.clamp(climb + FL.tilt.climb, -1, 1);
        if (Math.abs(FL.tilt.rollDeg || 0) > 42) { turn = Math.sign(FL.tilt.rollDeg); hard = true; }
      }
      const q = this.q, F = this.F, U = this.U, L = this.L;
      const axes = () => { F.copy(Z_AXIS).applyQuaternion(q); U.copy(Y_AXIS).applyQuaternion(q); L.copy(X_AXIS).applyQuaternion(q); };
      axes();
      const theta = Math.asin(FL.clamp(F.y, -1, 1)), phi = Math.atan2(-L.y, U.y);      // Nase über dem Horizont, Schräglage (links positiv)
      const far = Math.hypot(this.x - this.mid.x, this.z - this.mid.z);
      if (far > this.midR) {
        // zu weit weg: Das Flugzeug dreht von selbst zum Einsatzgebiet zurück
        const rel = FL.bearing(this.x, this.z, this.th, this.mid.x, this.mid.z);
        if (Math.abs(rel) > 0.25) { turn = rel > 0 ? 0.85 : -0.85; hard = false; }
        this.warnT -= dt;
        if (this.warnT <= 0) { this.warnT = 4; FL.hud.msg('Zurück zum Einsatzgebiet!', C.text, true); }
      }
      // Landen darf man nur im Anflug auf die eigene Bahn, sonst bleibt eine sichere Mindesthöhe
      const canLand = this.rtb && !this.lost && this.goAround <= 0 && Math.abs(this.x - BX) < 70 && this.z > RZ0 - 750 && this.z < RZ1 + 750;
      const fl = this.lost ? 4 : canLand ? GY : this.floor;
      const vy = F.y * this.speed;
      // Automatik: nach dem Abheben steigen, Sturzflug rechtzeitig abfangen (kein Absturz), oben nicht durch die Decke
      let auto = null;
      if (this.lost) auto = -0.22;
      else if (this.goAround > 0) { this.goAround -= dt; auto = 0.3; }
      else if (this.floor < 16) { this.floor = Math.min(16, this.floor + 8 * dt); if (theta < 0.2) auto = 0.3; }
      else if (this.recov || (vy < 0 && !(canLand && vy > -26) && this.y - fl < -vy * 1.0 + 4)) {
        auto = 0.25;
        if (!this.recov) { this.recov = true; FL.audio.play('alarm'); FL.hud.msg('Abfangen!', C.orange, true); }
        if (F.y > 0.08) { this.recov = false; auto = null; }
      }
      else if (this.y > CEIL - 8 && F.y > 0) auto = 0;
      if (auto !== null) {
        T1.set(F.x, 0, F.z);
        if (T1.lengthSq() < 1e-4) T1.set(Math.sin(this.th), 0, Math.cos(this.th));
        T1.normalize().multiplyScalar(Math.sqrt(1 - auto * auto)); T1.y = auto;
        q.rotateTowards(levelQuat(T1), (this.lost ? 1.2 : 2.6) * dt);
      } else {
        // rollen: wenig Ausschlag = Schräglage halten, voller Ausschlag = durchrollen, auf dem Rücken bleibt es auf dem Rücken
        let rate;
        if (hard) rate = Math.sign(turn) * 2.9;
        else if (Math.abs(phi) > 2.0) rate = Math.abs(turn) > 0.3 ? Math.sign(turn) * 2.5 : FL.clamp(wrap(Math.sign(phi) * Math.PI - phi) * 3, -2, 2);
        else if (Math.abs(phi) > 1.3 && Math.abs(turn) <= 0.3) rate = Math.sign(phi) * (Math.abs(phi) > 1.62 ? 1.5 : -1.5);
        else rate = FL.clamp((turn * 1.1 - phi) * 4, -2.9, 2.9);
        q.multiply(QA.setFromAxisAngle(Z_AXIS, -rate * dt));
        // Nase: ziehen und drücken wirken immer aus Sicht des Flugzeugs, deshalb gehen Loopings
        let pr = climb * this.pitchRate;
        if (Math.abs(climb) < 0.08 && Math.abs(phi) < 1.2 && Math.abs(theta) < 0.5) pr = FL.clamp(-theta * 1.2, -0.35, 0.35);    // losgelassen: sanft geradeaus
        q.multiply(QA.setFromAxisAngle(X_AXIS, -pr * dt));
        // Kurve durch die Schräglage
        axes();
        const yaw = this.turnRate * FL.clamp(-L.y * 1.35, -1, 1);
        q.premultiply(QA.setFromAxisAngle(Y_AXIS, yaw * dt));
      }
      q.normalize(); axes();
      // Schub: Schubhebel (Neigesteuerung) oder Umschalt-Taste für den Nachbrenner. Steigen kostet Tempo, im Sturzflug wird man schneller.
      const thr = this.thr = this.lost ? 0.3 : this.throttle();
      this.ab = thr > 0.9 && !this.lost;
      let wantV = this.ab ? 130 : FL.lerp(27, 84, Math.min(1, thr / 0.9));       // Leerlauf ist sehr langsam, voller Schub schnell, Nachbrenner rasant
      if (this.gearDown) wantV = Math.min(wantV, 52);              // ausgefahrenes Fahrwerk bremst
      if (this.flaps) wantV = Math.min(wantV * 0.82, 46);          // Landeklappen bremsen und tragen bei wenig Tempo
      wantV = Math.max(this.flaps ? 19 : 24, wantV - F.y * 24);
      this.speed = FL.lerp(this.speed, wantV, 1 - Math.exp(-(wantV > this.speed ? (this.ab ? 1.1 : 0.75) : 0.6) * dt));
      if (this.gearDown && !this.lost && !this.rtb && this.y > GY + 14) {
        this.gearT -= dt;
        if (this.gearT <= 0) { this.gearT = 6; FL.hud.msg(FL.touch.active ? 'Fahrwerk einfahren (Knopf „Fahrwerk“)' : 'Fahrwerk einfahren: Taste G', C.cyan, true); }
      }
      // zu langsam: Das Flugzeug sackt durch. Mit Klappen erst viel später, so setzt man mit wenig Schub sanft auf.
      const stallV = this.flaps ? 31 : 35, sink = this.lost ? 0 : FL.clamp((stallV - this.speed) / stallV, 0, 1) * 15;
      this.sink = sink;
      if (sink > 1.5 && !canLand && this.y > fl + 1) { this.stallT = (this.stallT || 0) - dt; if (this.stallT <= 0) { this.stallT = 7; FL.hud.msg('Zu langsam: Das Flugzeug sinkt. Mehr Schub!', C.orange, true); } }
      this.x += F.x * this.speed * dt; this.y += (F.y * this.speed - sink) * dt; this.z += F.z * this.speed * dt;
      if (this.y > CEIL) this.y = CEIL;
      if (this.y < fl) {
        this.y = fl;
        if (F.y < 0) { T1.set(F.x, 0, F.z).normalize(); q.rotateTowards(levelQuat(T1), 6 * dt); axes(); }
      }
      if (Math.abs(F.y) < 0.985) this.th = Math.atan2(F.x, F.z);
      if (canLand && this.y <= GY + 0.02 && this.endT < 0) {
        const dir = Math.cos(this.th) > 0 ? 1 : -1, remain = dir > 0 ? RZ1 - this.z : this.z - RZ0;
        const onRw = Math.abs(this.x - BX) < 15 && this.z > RZ0 && this.z < RZ1;
        const straight = Math.abs(wrap(this.th - (dir > 0 ? 0 : Math.PI))) < 0.32 && Math.abs(phi) < 0.5;
        if (onRw && straight && remain > 150) {
          // sauber aufgesetzt: ausrollen
          const rear = F.y > 0.02 && this.gearDown, down = -vy + this.sink;
          if (down > 17 && this.gearDown) { this.hp = Math.max(1, this.hp - 2); FL.hud.damage(0.5); FL.hud.msg('Harte Landung!', C.orange, true); }
          this.y = GY; this.landDir = dir; this.touched = false; this.v = this.speed; this.gearT = 0; this.roll = 0; this.pitch = rear ? -FL.clamp(Math.asin(F.y), 0.05, 0.15) : 0; this.flareT = rear ? 1.3 : 0;
          if (rear && down <= 17) FL.hud.msg('Hinterräder zuerst: saubere Landung!', C.green, true);
          this.setPhase('landing');
          for (const m of this.apMarks) m.visible = false;
          this.updateBase(0.0001); return;
        }
        this.goAround = 1.6; FL.audio.play('alarm');
        FL.hud.msg('Durchstarten!', C.red); FL.hud.msg(!onRw ? 'Du warst nicht über der Landebahn' : !straight ? 'Du warst schräg zur Landebahn' : 'Die Bahn reicht nicht mehr zum Ausrollen', C.text, true);
      }
      const sin = Math.sin(this.th), cos = Math.cos(this.th);
      this.place();
      if (!this.lost && this.endT < 0 && !this.rtb) {
        this.fuel -= dt * (this.ab ? 2.2 : 1);
        if (this.fuel <= 0) { this.fuel = 0; this.lost = true; this.endT = 2.2; FL.hud.msg('Treibstoff leer: Rückflug!', C.red); }
        else if (this.fuel < 30 && Math.floor(this.fuel) % 10 === 0 && Math.floor(this.fuel + dt) !== Math.floor(this.fuel)) FL.hud.msg('Treibstoff wird knapp!', C.orange, true);
        if (this.timeLeft > 0 && !this.lost) {
          this.timeLeft -= dt;
          if (this.timeLeft <= 0) { this.timeLeft = 0; this.lost = true; this.endT = 2.2; FL.hud.msg('Zeit abgelaufen: Einsatz abgebrochen!', C.red); }
        }
      }

      // Zielpunkte am Boden: Bombe (Kreis) und Bordkanone (Punkt)
      const bvy = F.y * this.speed, fall = (bvy + Math.sqrt(bvy * bvy + 2 * GRAV * this.y)) / GRAV;
      const bx = this.x + F.x * this.speed * fall, bz = this.z + F.z * this.speed * fall;
      const bombR = 13 + 4 * lo.p_bomb;
      this.ring.visible = !this.rtb && !this.lost; this.goalRing.visible = false;
      this.ringD = Math.hypot(bx - this.x, bz - this.z);
      this.ring.position.set(bx, 0.4, bz); this.ring.scale.set(bombR * 2, bombR * 2, 1);
      this.ring.material.opacity = this.bombCd <= 0 ? 1 : 0.35;
      // wohin die Nase am Boden zeigt (nur wenn sie nach unten zeigt)
      const down = F.y < -0.04, gd = down ? Math.min(900, this.y / -F.y) : 400, gx = this.x + F.x * gd, gz = this.z + F.z * gd;
      // Zielhilfe: Liegt ein Ziel ungefähr voraus, rastet die Bordkanone darauf ein (grüner Punkt)
      const cone = FL.tilt.on ? 0.34 : 0.22;
      const tj = this.jets.filter(j => !j.dead && Math.abs(FL.bearing(this.x, this.z, this.th, j.x, j.z)) < cone + 0.1 && Math.hypot(j.x - this.x, j.z - this.z) < 440)[0];
      let lock = null, best = 1e9;
      if (!tj) for (const s of this.structures) {
        if (!s.alive) continue;
        const d = Math.hypot(s.x - this.x, s.z - this.z);
        if (d > 200 + this.y * 2.6 || d < 35 || theta > 0.45) continue;
        const rel = Math.abs(FL.bearing(this.x, this.z, this.th, s.x, s.z));
        if (rel > cone) continue;
        const sc = rel * 700 + d * 0.3 - (s.primary ? 150 : s.kind === 'flak' ? 90 : 0) - (s === this.lock ? 60 : 0);
        if (sc < best) { best = sc; lock = s; }
      }
      this.lock = lock;
      this.dot.position.set(gx, 0.5, gz); this.dot.scale.set(9, 9, 1); this.dot.visible = !lock && !tj && down;
      const lt = tj || lock;
      this.lockMark.visible = !!lt;
      if (lt) {
        const ld = Math.hypot(lt.x - this.x, lt.z - this.z), ls = FL.clamp(ld * 0.06, 9, 34) * (1 + Math.sin(this.t * 14) * 0.08);
        this.lockMark.position.set(lt.x, tj ? tj.y : lock.h * 0.5, lt.z); this.lockMark.scale.set(ls, ls, 1);
      }

      const active = !this.lost && this.endT < 0;
      // Bordkanone: zielt von selbst auf einen Jäger, der vor einem fliegt
      if (active && FL.down('Space', 'Mouse0') && this.gunCd <= 0) {
        this.gunCd = 0.13 - 0.02 * lo.p_gun;
        let tx = this.x + F.x * 420, ty = this.y + F.y * 420, tz = this.z + F.z * 420;
        if (tj) { const tt = Math.hypot(tj.x - this.x, tj.z - this.z) / 420; tx = tj.x + tj.vx * tt; ty = tj.y; tz = tj.z + tj.vz * tt; }
        else if (lock) { tx = lock.x; ty = lock.h * 0.4; tz = lock.z; }
        for (const side of [-1, 1]) {
          const ox = this.x + cos * side * 1.6, oz = this.z - sin * side * 1.6;
          const sp = lock ? 1.2 : 2, dx = tx - ox + FL.rand(-sp, sp), dy = ty - this.y, dz = tz - oz + FL.rand(-sp, sp), d = Math.hypot(dx, dy, dz);
          const mesh = fx.shot(0xffe68c, 0.35, 9);
          this.bullets.push({ x: ox, y: this.y - 0.3, z: oz, vx: dx / d * 420, vy: dy / d * 420, vz: dz / d * 420, dmg: 1 + 0.6 * lo.p_gun, mesh });
        }
        FL.audio.play('shot');
      }
      if (active && FL.down('KeyB', 'KeyX', 'Enter') && this.bombCd <= 0) {
        this.bombCd = 1.5 - 0.3 * lo.p_bomb;
        const mesh = FL.bombModel(); mesh.scale.setScalar(3.2); this.stage.add(mesh);
        const bomb = { x: this.x, y: this.y - 1, z: this.z, vx: F.x * this.speed, vy: Math.min(0, F.y * this.speed), vz: F.z * this.speed, mesh, r: bombR, dmg: 12 + 5 * lo.p_bomb };
        this.bombs.push(bomb);
        this.bview = { b: bomb, hold: -1 };
        this.camBox.style.display = ''; this.camBox.className = 'bombcam'; this.camBox.lastChild.textContent = '';
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
        FL.audio.play('rocket');
        FL.hud.msg(pool.length ? 'Raketen los!' : 'Raketen ohne Ziel abgefeuert', C.cyan, true);
      }

      // eigene Geschosse
      for (const b of this.bullets) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        for (const j of this.jets) if (!j.dead && Math.hypot(j.x - b.x, j.y - b.y, j.z - b.z) < 9) { b.gone = true; this.hitJet(j, b.dmg); fx.spark(b.x, b.y, b.z, 5); break; }
        if (!b.gone && b.y < 20) for (const s of this.structures) {
          if (s.alive && b.y < s.h + 1 && Math.hypot(s.x - b.x, s.z - b.z) < s.r) { b.gone = true; this.hitStructure(s, b.dmg * (s.unit && s.kind !== 'tank' ? 0.8 : 0.3)); fx.spark(b.x, b.y + 1, b.z, 5); break; }
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
        if (b.y <= 0.5) {
          b.gone = true; this.stage.scene.remove(b.mesh);
          const hit = this.blast(b.x, 0.5, b.z, b.r, b.dmg);
          if (this.bview && this.bview.b === b) {
            this.bview.hold = 1.7;
            this.camBox.className = 'bombcam ' + (hit ? 'hit' : 'miss'); this.camBox.lastChild.textContent = hit ? 'TREFFER!' : 'Daneben';
          }
        }
      }
      this.bombs = this.bombs.filter(b => !b.gone);
      this.updateBombCam(dt);
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

      this.updateFlak(dt, sin, cos, active && !this.rtb);
      this.updateJets(dt, active && !this.rtb);

      // Heimflug: Die blauen Ringe zeigen, wo der Anflug auf die Landebahn beginnt. Gelandet wird selbst.
      if (this.rtb && active) {
        this.apMarks.forEach((m, i) => { const a = i ? AP_S : AP_N, sc = FL.clamp(dist(this, a) * 0.07, 24, 70); m.scale.set(sc, sc, 1); });
      }

      // Rauch, Radarschüsseln, Zielmarken
      for (const b of this.burning) { b.t -= dt; if (Math.random() < dt * 4) fx.puff('smoke', b.x + FL.rand(-1, 1) * b.size * 0.4, 3, b.z, b.size * 2.2, FL.rand(2.5, 4), 1.5, FL.rand(5, 9), 0, 2); }
      this.burning = this.burning.filter(b => b.t > 0);
      for (const s of this.spinners) s.rotation.y += dt * 1.5;
      for (const s of this.ships) if (s.alive) {
        // langsame Fahrt, ab und zu eine Wende, nie zurück an Land
        s.turnT -= dt;
        const nx = s.x + Math.sin(s.hd) * 60, nz = s.z + Math.cos(s.hd) * 60;
        if (s.turnT <= 0 || !this.sea(nx, nz) || !this.sea(nx - Math.sin(this.site.a) * 150, nz - Math.cos(this.site.a) * 150)) { s.turn = (s.turn || 0) + Math.PI; s.turnT = FL.rand(18, 30); }
        if (s.turn > 0) { const d = Math.min(s.turn, 0.35 * dt); s.hd += d; s.turn -= d; }
        s.x += Math.sin(s.hd) * s.v * dt; s.z += Math.cos(s.hd) * s.v * dt;
        s.mesh.position.set(s.x, Math.sin(this.t * 0.9 + s.x) * 0.15, s.z); s.mesh.rotation.y = s.hd; s.mesh.rotation.z = Math.sin(this.t * 0.7 + s.z) * 0.02;
        s.marker.position.x = s.x; s.marker.position.z = s.z;
        if (Math.random() < dt * 6) fx.puff('smoke', s.x - Math.sin(s.hd) * s.r * 1.2, 0.6, s.z - Math.cos(s.hd) * s.r * 1.2, 3, 1.2, 0, 0.3, 0, 0.5);
      }
      if (this.fight) {
        // Der Bodenkampf beginnt, sobald das Flugzeug in der Nähe ist
        if (!this.fight.on && dist(this, this.site) < 950) { this.fight.on = true; FL.hud.msg('Unsere Truppen greifen an!', C.cyan); FL.hud.msg('Hilf ihnen: Panzer, Fahrzeuge und Trupps ausschalten', C.text, true); }
        this.fight.update(dt);
      }
      for (const k of this.sinking) {
        k.t += dt; const m = k.s.mesh;
        m.position.y = -k.t * 1.6; m.rotation.x = Math.min(0.5, k.t * 0.07); m.rotation.z = Math.min(0.35, k.t * 0.05);
        if (k.t > 9) { this.stage.scene.remove(m); k.gone = true; }
      }
      if (this.sinking.length) this.sinking = this.sinking.filter(k => !k.gone);
      for (const s of this.structures) if (s.alive && s.marker) {
        const sc = FL.clamp(Math.hypot(s.x - this.x, s.z - this.z) * 0.04, 7, 40) * (1 + Math.sin(this.t * 5) * 0.08);
        s.marker.scale.set(sc, sc, 1); s.marker.position.y = s.h + 4 + sc * 0.6;
      }
      if (this.hp < this.hpMax * 0.4 || this.lost) {
        this.smokeT -= dt;
        if (this.smokeT <= 0) { this.smokeT = 0.06; fx.puff('smoke', this.x - sin * 5, this.y, this.z - cos * 5, 3.5, 1.2, 0, 1, 0, 2); }
      }

      FL.audio.engine('jet', 0.35 + 0.65 * Math.min(1, thr / 0.9), this.ab ? 1 : 0);
      if (this.endT >= 0) { this.endT -= dt; if (this.endT <= 0) this.result = this.lost ? 'lose' : 'win'; }
      fx.update(dt);
      this.updateCamera(dt);
      this.updateHud();
    }

    updateBombCam(dt) {
      const v = this.bview;
      if (!v) return;
      const b = v.b;
      if (v.hold < 0) {
        const s = Math.hypot(b.vx, b.vy, b.vz) || 1, dx = b.vx / s, dy = b.vy / s, dz = b.vz / s;
        this.bcam.position.set(b.x - dx * 17, b.y - dy * 17 + 5, b.z - dz * 17);
        this.bcam.lookAt(b.x + dx * 10, b.y + dy * 10, b.z + dz * 10);
      } else {
        v.hold -= dt;
        this.bcam.position.y = Math.max(this.bcam.position.y, 9);
        this.bcam.lookAt(b.x, 2, b.z);
        if (v.hold <= 0) { this.bview = null; this.camBox.style.display = 'none'; }
      }
    }

    // ---------------------------------------------------------------- an der Basis: laufen, rollen, starten, landen
    solidPush(o, rad, skipJet) {
      for (const s of this.baseSolid) {
        const dx = o.x - s.x, dz = o.z - s.z, d = Math.hypot(dx, dz), min = s.r + rad;
        if (d < min && d > 0.01) { o.x = s.x + dx / d * min; o.z = s.z + dz / d * min; }
      }
      if (!skipJet) { const dx = o.x - this.x, dz = o.z - this.z, d = Math.hypot(dx, dz); if (d < 4 && d > 0.01) { o.x = this.x + dx / d * 4; o.z = this.z + dz / d * 4; } }
    }
    updateBase(dt) {
      const fx = this.fx, ph = this.phase, h = this.hero;
      const kx = FL.clamp((FL.down('ArrowLeft', 'KeyA') ? 1 : 0) - (FL.down('ArrowRight', 'KeyD') ? 1 : 0) - FL.stick.x, -1, 1);
      const ky = FL.clamp((FL.down('ArrowUp', 'KeyW') ? 1 : 0) - (FL.down('ArrowDown', 'KeyS') ? 1 : 0) + FL.stick.y, -1, 1);
      let goal = null, camMode = 'jet';
      if (ph === 'walk' || ph === 'walkback') {
        goal = ph === 'walk' ? PARK : DOOR; camMode = 'walk';
        const c = this.walkCam, done = this.endT >= 0;
        const mx = done ? 0 : Math.sin(c) * ky + Math.cos(c) * kx, mz = done ? 0 : Math.cos(c) * ky - Math.sin(c) * kx, m = Math.hypot(mx, mz);
        if (m > 0) { const sp = 9 * Math.min(1, m) / m; h.x += mx * sp * dt; h.z += mz * sp * dt; h.th = Math.atan2(mx, mz); }
        h.x = FL.clamp(h.x, -362, -246); h.z = FL.clamp(h.z, -1112, -1034);
        this.solidPush(h, 0.7, ph === 'walk');
        h.mesh.position.set(h.x, 0, h.z); h.mesh.rotation.y = h.th;
        FL.animSoldier(h.mesh, this.t * 1.6, m > 0, false);
        if (ph === 'walk') {
          this.alarmT -= dt;
          if (this.alarmT <= 0 && this.alarmN < 6) { this.alarmT = 0.9; this.alarmN++; FL.audio.play('alarm'); FL.hud.damage(0.35); }
          if (dist(h, PARK) < 6.5) {
            h.mesh.visible = false; FL.audio.play('up');
            this.setPhase('taxi'); FL.hud.msg('Eingestiegen!', C.green); FL.hud.msg('Roll zur Startbahn', C.gold, true); FL.hud.msg(this.siteText(), C.cyan, true);
          }
        } else if (!done && dist(h, DOOR) < 3.2) {
          h.mesh.visible = false; this.endT = 1.8; FL.audio.play('coin');
          FL.hud.msg('EINSATZ GESCHAFFT!', C.gold);
        }
      } else if (ph === 'taxi' || ph === 'taxiback') {
        goal = ph === 'taxi' ? START : PARK;
        const want = ky > 0.3 ? 15 : ky < -0.3 ? -4 : FL.throttle.on ? Math.min(1, FL.throttle.v / 0.9) * 16 : 0;
        this.v += FL.clamp(want - this.v, -16 * dt, 9 * dt);
        this.th = wrap(this.th + kx * 1.15 * FL.clamp(this.v / 5, -1, 1) * dt);
        const ox = this.x, oz = this.z;
        this.x += Math.sin(this.th) * this.v * dt; this.z += Math.cos(this.th) * this.v * dt;
        this.x = FL.clamp(this.x, -352, BX + 13); this.z = FL.clamp(this.z, RZ0 - 6, RZ1 + 6);
        // neben der Startbahn gibt es nur das Vorfeld
        if (this.x < BX - 14 && (this.z < -1108 || this.z > -1042)) {
          if (ox >= BX - 14) this.x = BX - 14; else this.z = FL.clamp(this.z, -1108, -1042);
        }
        this.solidPush(this, 5, true);
        this.y = GY; this.roll = 0; this.pitch = 0;
        if (Math.abs(this.v) > 3 && Math.random() < dt * 8) fx.puff('dust', this.x - Math.sin(this.th) * 5, 0.5, this.z - Math.cos(this.th) * 5, 2, 0.7, 0, 1, 0, 1.5);
        if (dist(this, goal) < (ph === 'taxi' ? 9 : 7)) {
          if (ph === 'taxi') { this.lineT = 0; this.from = { x: this.x, z: this.z, th: this.th }; this.setPhase('lineup'); FL.hud.msg('Startbahn erreicht!', C.green, true); }
          else { this.v = 0; this.parkT = 1.3; this.setPhase('parked'); FL.audio.play('up'); FL.hud.msg('Geparkt!', C.green); }
        }
      } else if (ph === 'lineup') {
        this.lineT += dt / 1.6;
        const k = Math.min(1, this.lineT), e = k * k * (3 - 2 * k), f = this.from;
        this.x = FL.lerp(f.x, START.x, e); this.z = FL.lerp(f.z, START.z, e); this.th = f.th + wrap(0 - f.th) * e; this.v = 0;
        if (k >= 1) { this.th = 0; if (FL.tilt.on) FL.tilt.center(true); this.setPhase('takeoff'); FL.hud.msg('Start frei!', C.gold); FL.hud.msg('Gas geben', C.text, true); }
      } else if (ph === 'takeoff') {
        const thr = this.thr = FL.throttle.on ? FL.throttle.v : ky > 0.3 ? (FL.down('ShiftLeft', 'ShiftRight') ? 1 : 0.8) : 0;
        const gas = thr > 0.25, pull = ky < -0.3 || (FL.tilt.on && FL.tilt.climb > 0.35);
        this.ab = thr > 0.9;
        const acc = this.ab ? 20 : FL.throttle.on ? 5 + 10 * thr : 13;
        this.v = FL.clamp(this.v + (gas ? acc : this.v > 45 ? 6 : -10) * dt, 0, this.ab ? 75 : 62);
        this.z += this.v * dt; this.x = BX; this.th = 0;
        if (this.v > 8 && Math.random() < dt * 14) fx.puff('dust', this.x + FL.rand(-2, 2), 0.6, this.z - 6, 3, 0.8, 0, 1, -this.v * 0.2, 1.6);
        if (this.v > 5 && !this.roared) { this.roared = true; FL.audio.play('jet'); }
        if (this.v >= 45 && !this.rotMsg) { this.rotMsg = true; FL.hud.msg('Jetzt ziehen: abheben!', C.cyan); }
        this.pitch = FL.lerp(this.pitch, this.v >= 45 ? -0.12 : 0, 1 - Math.exp(-4 * dt));
        if (this.v >= 45 && (pull || this.v >= 61.5 || this.z > RZ1 - 90)) {
          this.floor = GY; this.speed = this.v; this.gearT = 5; this.setPhase('flight');
          FL.hud.msg('Abgehoben!', C.green); FL.hud.msg(this.siteText(), C.gold, true);
        }
      } else if (ph === 'landing') {
        const d = this.landDir, s = d > 0 ? this.z - RZ0 : RZ1 - this.z;
        const des = Math.atan2(BX - this.x, 80 * d), dth = FL.clamp(wrap(des - this.th), -1.3 * dt, 1.3 * dt);
        this.th = wrap(this.th + dth);
        const ty = s < 0 ? GY + -s * 0.13 : GY;
        this.y += FL.clamp(ty - this.y, -22 * dt, 4 * dt);
        const ground = this.y <= GY + 0.05 && s > -8;
        const lthr = this.thr = FL.throttle.on ? FL.throttle.v : 0.4;
        this.ab = false;
        if (!this.gearDown && !ground) { this.gearT -= dt; if (this.gearT <= 0) { this.gearT = 2.5; FL.audio.play('alarm'); FL.hud.msg(FL.touch.active ? 'Fahrwerk ausfahren! (Knopf „Fahrwerk“)' : 'Fahrwerk ausfahren! Taste G', C.red, true); } }
        if (ground) {
          this.y = GY;
          if (!this.touched && !this.gearDown) {
            // ohne Fahrwerk aufgesetzt: Es rumpelt und kostet Panzerung, die Mechaniker fahren es dann aus
            this.gearDown = true; this.hp = Math.max(1, this.hp - 3); this.shake = 0.8; FL.hud.damage(0.7); FL.audio.play('boom');
            for (let i = 0; i < 14; i++) fx.spark(this.x + FL.rand(-3, 3), 0.6, this.z + FL.rand(-4, 4), 6);
            FL.hud.msg('Bauchlandung! Fahrwerk vergessen', C.red);
          }
          if (!this.touched) { this.touched = true; this.shake = 0.3; FL.audio.play('hit'); for (let i = 0; i < 6; i++) fx.puff('white', this.x + FL.rand(-3, 3), 0.6, this.z, 3, 0.9, 0, 1.5, 0, 1.8); FL.hud.msg('Aufgesetzt!', C.green, true); }
          this.v = Math.max(9, this.v - (lthr > 0.5 ? 5 : 11) * dt);
        } else this.v = FL.lerp(this.v, FL.lerp(38, 56, Math.min(1, lthr / 0.9)), 1 - Math.exp(-1.2 * dt));
        this.x += Math.sin(this.th) * this.v * dt; this.z += Math.cos(this.th) * this.v * dt;
        const k = 1 - Math.exp(-5 * dt);
        this.roll = FL.lerp(this.roll, ground ? 0 : -FL.clamp(dth / dt, -1, 1) * 0.5, k);
        this.flareT = (this.flareT || 0) - dt;
        if (!(ground && this.flareT > 0)) this.pitch = FL.lerp(this.pitch, ground ? 0 : -0.1, 1 - Math.exp(-2.4 * dt));     // erst die Hinterräder, dann senkt sich die Nase
        if (ground) this.y = GY + Math.abs(this.pitch) * 3.2;
        if (ground && this.v <= 9.01) { this.setPhase('taxiback'); FL.hud.msg('Gelandet!', C.gold); FL.hud.msg('Roll zum Parkplatz', C.text, true); }
      } else if (ph === 'parked') {
        this.parkT -= dt;
        if (this.parkT <= 0) {
          const a = Math.atan2(DOOR.x - this.x, DOOR.z - this.z);
          h.x = this.x + Math.sin(a) * 5; h.z = this.z + Math.cos(a) * 5; h.th = a; h.mesh.visible = true;
          this.walkCam = Math.atan2(DOOR.x - h.x, DOOR.z - h.z);
          this.camTh = this.walkCam;
          this.setPhase('walkback'); FL.hud.msg('Ausgestiegen. Geh ins Basisgebäude', C.gold, true);
        }
      }
      if (ph === 'taxi' || ph === 'taxiback' || ph === 'lineup') { this.ab = false; this.thr = 0; FL.audio.engine('jet', 0.12 + 0.25 * Math.min(1, Math.abs(this.v) / 15), 0); }
      else if (ph === 'takeoff') FL.audio.engine('jet', 0.15 + 0.85 * Math.min(1, this.thr / 0.9), this.ab ? 1 : 0);
      else if (ph === 'landing') FL.audio.engine('jet', 0.25 + 0.4 * this.thr, 0);
      this.place();
      this.ring.visible = false; this.dot.visible = false; this.lockMark.visible = false;
      this.goalRing.visible = !!goal;
      if (goal) { const sc = (goal === DOOR ? 5 : 11) * (1 + Math.sin(this.t * 5) * 0.1); this.goalRing.position.set(goal.x, 0.3, goal.z); this.goalRing.scale.set(sc, sc, 1); }
      this.walkGoal = goal;
      for (const s of this.spinners) s.rotation.y += dt * 1.5;
      for (const b of this.burning) { b.t -= dt; if (Math.random() < dt * 4) fx.puff('smoke', b.x, 3, b.z, b.size * 2.2, FL.rand(2.5, 4), 1.5, FL.rand(5, 9), 0, 2); }
      this.updateBombCam(dt);
      if (this.endT >= 0) { this.endT -= dt; if (this.endT <= 0) this.result = this.lost ? 'lose' : 'win'; }
      fx.update(dt);
      if (camMode === 'walk') {
        const cam = this.stage.camera, c = this.walkCam, sin = Math.sin(c), cos = Math.cos(c);
        cam.up.set(0, 1, 0);
        cam.position.set(h.x - sin * 12, 6.5, h.z - cos * 12);
        cam.lookAt(h.x + sin * 8, 1.6, h.z + cos * 8);
        this.stage.update(new THREE.Vector3(h.x + sin * 12, 0, h.z + cos * 12));
      } else this.updateCamera(dt);
      this.updateHud();
    }

    place() {
      this.jet.position.set(this.x, this.y, this.z);
      if (this.phase === 'flight') this.jet.quaternion.copy(this.q); else this.jet.rotation.set(this.pitch, this.th, this.roll);
      this.jet.visible = !(this.invuln > 0 && Math.floor(this.t * 14) % 2);
      this.jet.userData.gear.visible = this.gearDown;
      const fl = this.jet.userData.flame;
      if (fl) { const k = this.ab ? 2.6 + Math.random() * 0.6 : 1; fl.scale.setScalar((fl.userData.s0 || (fl.userData.s0 = fl.scale.x)) * k); }
    }
    siteText() {
      const s = this.site, dirs = ['Norden', 'Nordwesten', 'Westen', 'Südwesten', 'Süden', 'Südosten', 'Osten', 'Nordosten'];
      const k = ((Math.round(s.a / (Math.PI / 4)) % 8) + 8) % 8;
      return `Einsatzort ${BIOMES[s.biome]}: ${(s.d / 100).toFixed(0) / 10} km im ${dirs[k]}`;
    }
    throttle() { return FL.throttle.on ? FL.throttle.v : FL.down('ShiftLeft', 'ShiftRight') ? 1 : 0.62; }
    toggleGear() {
      const ph = this.phase;
      if (ph !== 'flight' && ph !== 'landing') return;
      if (ph === 'landing' && this.touched) return;
      if (this.y < GY + 5 && this.gearDown) return;
      this.gearDown = !this.gearDown; this.gearT = 6;
      FL.audio.play('gear');
      FL.hud.msg(this.gearDown ? 'Fahrwerk ausgefahren' : 'Fahrwerk eingefahren', C.cyan, true);
    }

    // Flak: Die Granaten platzen dort, wo das Flugzeug bei geradem Flug gleich wäre. Kurven und Höhe wechseln hilft.
    updateFlak(dt, sin, cos, active) {
      const fx = this.fx;
      const near = this.flak.filter(s => s.alive && Math.hypot(s.x - this.x, s.z - this.z) < 480)
        .sort((a, b) => Math.hypot(a.x - this.x, a.z - this.z) - Math.hypot(b.x - this.x, b.z - this.z)).slice(0, 2);
      for (const s of near) {
        s.mesh.userData.gun.rotation.y = Math.atan2(this.x - s.x, this.z - s.z) - s.mesh.rotation.y;
        if (s.ship && Math.hypot(s.x - this.x, s.z - this.z) > 380) continue;
        s.cd -= dt;
        if (s.cd > 0 || !active) continue;
        s.cd = FL.rand(2.4, 3.6) / (1 + 0.07 * this.tier) * (0.85 / this.diff) / (1 + 0.5 * this.pw);
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
      const sj = this.sc.jets;
      if ((this.tier >= 2.5 || sj || (this.pw > 0.6 && this.tier >= 1.5)) && active) {
        this.jetCd -= dt;
        if (this.jetCd <= 0 && this.jets.filter(j => !j.dead).length < (sj ? sj.n : (this.tier >= 4 ? 2 : 1) + (this.pw > 0.8 ? 1 : 0))) {
          this.jetCd = (sj ? sj.cd : 30 - 3 * this.tier) * (0.85 / this.diff) / (1 + 0.4 * this.pw);
          const a = this.th + FL.rand(-0.9, 0.9), d = 700;
          const j = { x: this.x + Math.sin(a) * d, y: this.y + FL.rand(-8, 12), z: this.z + Math.cos(a) * d, th: a + Math.PI, hp: (4 + 1.5 * this.tier) * (1 + 0.8 * this.pw), cd: 1.5, brk: 0, vx: 0, vz: 0 };
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
      const cam = this.stage.camera, sh = this.shake * 2;
      if (this.phase === 'flight') {
        // Die Kamera folgt dem Flugzeug in jede Lage. Normal bleibt der Horizont fast gerade, im Looping und auf dem Rücken dreht sie mit.
        const F = this.F, U = this.U, cf = this.camF, cu = this.camU;
        cf.lerp(F, 1 - Math.exp(-4.5 * dt)).normalize();
        // Die Kamera rollt nicht mit: Nur das Flugzeug dreht sich um die Längsachse, der Horizont bleibt waagerecht.
        // Im Looping kippt sie mit der Nase über den Scheitel, danach richtet sie sich wieder auf.
        cu.addScaledVector(cf, -cu.dot(cf));
        if (cu.lengthSq() < 1e-6) cu.copy(U);
        cu.normalize();
        if (Math.abs(cf.y) < 0.9 && (U.y > 0.25 || cu.y > 0)) {
          T1.copy(Y_AXIS).addScaledVector(cf, -cf.y).normalize();
          cu.lerp(T1, 1 - Math.exp(-(cu.y > 0 ? 6 : 2.2) * dt)).normalize();
        }
        // Liegt der Bombenkreis fast unter dem Flugzeug (langsam oder hoch), schaut die Kamera von weiter oben steiler nach unten
        const wantLd = this.ring.visible && this.y > 20 && Math.abs(cf.y) < 0.5 && cu.y > 0.5 ? FL.clamp(1.15 - (this.ringD || 999) / (this.y * 1.9), 0, 1) : 0;
        this.ld = FL.lerp(this.ld || 0, wantLd, 1 - Math.exp(-2.5 * dt));
        const ld = this.ld, sp = FL.clamp((this.speed - 60) / 70, -0.5, 1), back = 26 + sp * 5 + ld * 6, upO = 8 + ld * 20;
        cam.position.set(this.x - cf.x * back + cu.x * upO + FL.rand(-sh, sh), Math.max(1.5, this.y - cf.y * back + cu.y * upO + FL.rand(-sh, sh)), this.z - cf.z * back + cu.z * upO);
        cam.up.copy(cu);
        // Blickziel: normal voraus, sonst ein Punkt zwischen Flugzeug und Bombenkreis, damit beides im Bild ist
        T1.set(this.ring.position.x - this.x, -this.y, this.ring.position.z - this.z).normalize();
        const k0 = 1 - ld;
        cam.lookAt(this.x + (cf.x * 45 - cu.x * 3) * k0 + T1.x * 42 * ld, this.y + (cf.y * 45 - cu.y * 3) * k0 + T1.y * 42 * ld, this.z + (cf.z * 45 - cu.z * 3) * k0 + T1.z * 42 * ld);
        const fov = this.fov0 + sp * 9;                                  // schnell = weiterer Blick, so spürt man das Tempo
        if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, 3 * dt); cam.updateProjectionMatrix(); }
        this.camTh = this.th;
        this.stage.update(new THREE.Vector3(this.x + Math.sin(this.th) * 90, 0, this.z + Math.cos(this.th) * 90));
        return;
      }
      cam.up.set(0, 1, 0);
      if (cam.fov !== this.fov0) { cam.fov = this.fov0; cam.updateProjectionMatrix(); }
      this.camTh += wrap(this.th - this.camTh) * (1 - Math.exp(-3.5 * dt));
      const sin = Math.sin(this.camTh), cos = Math.cos(this.camTh);
      const hgt = FL.clamp((this.y - GY) / 22, 0, 1), back = FL.lerp(20, 27, hgt);
      cam.position.set(this.x - sin * back + FL.rand(-sh, sh), this.y + FL.lerp(5.5, 9, hgt) + FL.rand(-sh, sh), this.z - cos * back);
      cam.lookAt(this.x + sin * 45, this.y - FL.lerp(1, 9, hgt), this.z + cos * 45);
      const ahead = FL.lerp(15, 90, hgt);
      this.stage.update(new THREE.Vector3(this.x + Math.sin(this.th) * ahead, 0, this.z + Math.cos(this.th) * ahead));
    }

    updateHud() {
      const H = FL.hud, lo = this.lo, hp = this.hp / this.hpMax, fuel = this.fuel / this.fuelMax;
      H.set(this.hTL, `<div class="hud-big"><span class="coins">${this.coins}</span></div>` +
        `<div>Panzerung</div>${H.meter(hp, hp < 0.35 ? 'red' : hp < 0.65 ? 'gold' : '')}` +
        `<div>Treibstoff</div>${H.meter(fuel, fuel < 0.2 ? 'red' : 'cyan')}` +
        `<div>Höhe ${Math.round(Math.max(0, this.y - GY) * 10)} m · Tempo <b>${Math.round((this.phase === 'flight' ? this.speed : this.v || 0) * 10)}</b> km/h</div>` +
        (this.phase === 'flight' || this.phase === 'landing' || this.phase === 'takeoff' ? `<div>Schub ${this.ab ? '<b style="color:#ff8c3c">NACHBRENNER</b>' : Math.round(Math.min(1, (this.thr || 0) / 0.9) * 100) + ' %'} · Fahrwerk ${this.gearDown ? '<b style="color:#46dcff">aus</b>' : 'ein'}${this.flaps ? ' · <b style="color:#46dcff">Klappen</b>' : ''}</div>` : ''));
      let tc = `<div>${this.goal === 'jets' ? 'Jäger' : 'Ziele'}: noch <b style="color:#ff8c3c">${this.left()}</b> von ${this.nPrimary}</div>`;
      if (this.fight && !this.rtb) { const f = this.fight.ownFrac(); tc += `<div>Eigene Truppen</div>${H.meter(f, f < 0.35 ? 'red' : f < 0.65 ? 'gold' : 'cyan')}`; }
      if (this.timeLeft > 0) tc += `<div>Zeit <b style="color:${this.timeLeft < 30 ? '#ef5a4c' : '#46dcff'}">${Math.floor(this.timeLeft / 60)}:${String(Math.floor(this.timeLeft % 60)).padStart(2, '0')}</b></div>`;
      const next = this.goal === 'jets' ? this.jets.filter(j => !j.dead)[0] : this.structures.filter(s => s.alive && s.primary).sort((a, b) => Math.hypot(a.x - this.x, a.z - this.z) - Math.hypot(b.x - this.x, b.z - this.z))[0];
      const ph = this.phase, walking = ph === 'walk' || ph === 'walkback';
      const me = walking ? this.hero : this, myTh = walking ? this.walkCam : this.th;
      const to = (label, g) => `<div>${label} ${FL.arrowHtml(FL.bearing(me.x, me.z, myTh, g.x, g.z), dist(me, g))}</div>`;
      if (ph === 'walk') tc = '<div style="color:#ef5a4c"><b>ALARM!</b></div>' + to('Zum Flugzeug', PARK);
      else if (ph === 'taxi') tc = to('Zur Startbahn', START);
      else if (ph === 'lineup') tc = '<div>Ausrichten …</div>';
      else if (ph === 'takeoff') tc = `<div>Tempo</div>${H.meter(this.v / 45, this.v >= 45 ? '' : 'gold')}<div>${this.v >= 45 ? '<b style="color:#46dcff">Ziehen: abheben!</b>' : 'Gas geben'}</div>`;
      else if (ph === 'landing') tc = '<div style="color:#46dcff"><b>Landeanflug</b></div>';
      else if (ph === 'taxiback') tc = to('Zum Parkplatz', PARK);
      else if (ph === 'parked') tc = '<div>Geparkt</div>';
      else if (ph === 'walkback') tc = to('Zum Basisgebäude', DOOR);
      else if (this.rtb) {
        const a = dist(this, AP_N) < dist(this, AP_S) ? AP_N : AP_S, thr = a === AP_S ? { x: BX, z: RZ0 + 25 } : { x: BX, z: RZ1 - 25 };
        const inLine = Math.abs(this.x - BX) < 70 && Math.abs(wrap(this.th - a.th)) < 0.6, dT = dist(this, thr);
        tc = '<div style="color:#5fd07a"><b>' + (this.goal === 'jets' ? 'Alle Jäger abgeschossen' : 'Alle Ziele zerstört') + '</b></div>';
        if (!inLine) tc += to('Zum Landeanflug', a);
        else {
          const want = dT * 0.11, h = this.y - GY;
          tc += `<div>Landebahn ${Math.round(dT)} m · ${h > want + 9 ? '<b style="color:#ff8c3c">zu hoch: sinken</b>' : h < want - 9 && dT > 60 ? '<b style="color:#ff8c3c">zu tief: halten</b>' : '<b style="color:#5fd07a">Höhe gut</b>'}</div>` +
            `<div>${this.gearDown ? 'Fahrwerk ist aus' : '<b style="color:#ef5a4c">Fahrwerk ausfahren!</b>'} · ${this.flaps ? 'Klappen sind aus: Schub wegnehmen, Nase leicht hoch' : '<b style="color:#ffc43c">Klappen ausfahren (F)</b>'}</div>`;
        }
      }
      else if (next) tc += dist(this, this.site) > 650 ? to('Einsatzort ' + BIOMES[this.site.biome], this.site) : to('Nächstes Ziel', next);
      H.set(this.hTC, tc);
      let tr = `<div class="slot ${this.bombCd <= 0 ? 'ready' : ''}"><b>B</b>Bombe ${this.bombCd <= 0 ? 'bereit' : 'lädt'}</div>`;
      if (lo.p_rocket) tr += `<br><div class="slot ${this.rocketCd <= 0 ? 'ready' : ''}"><b>R</b>Raketen${this.rocketCd <= 0 ? ' bereit' : `<i style="width:${Math.round((1 - this.rocketCd / this.rocketMax) * 100)}%"></i>`}</div>`;
      H.set(this.hInfo, tr);
      const items = [];
      for (const s of this.structures) if (s.alive) items.push({ x: s.x, z: s.z, color: s.primary ? '#ff5a3c' : s.kind === 'flak' ? '#ffc43c' : '#6f7f8c', size: s.primary ? 4 : 2.5, far: s.primary });
      for (const j of this.jets) items.push({ x: j.x, z: j.z, color: '#ff40c0', size: 4, far: true });
      if (this.fight) for (const u of this.fight.own) if (u.alive) items.push({ x: u.x, z: u.z, color: '#46dcff', size: 3 });
      items.push({ x: BX, z: (RZ0 + RZ1) / 2, color: '#5fd07a', size: 5, far: true });
      if (this.rtb) for (const a of [AP_N, AP_S]) items.push({ x: a.x, z: a.z, color: '#46dcff', size: 4, far: true });
      else items.push({ x: this.site.x, z: this.site.z, color: '#ffe14a', size: 8, far: true, ring: true });
      const air = ph === 'flight' || ph === 'landing';
      this.hInfo.style.display = ph === 'flight' && !this.rtb ? '' : 'none';
      FL.drawMinimap(this.map, me.x, me.z, myTh, air ? 520 : 120, items);
    }

    onKey(code) {
      if (code === 'KeyG') this.toggleGear();
      else if (code === 'KeyF' && (this.phase === 'flight' || this.phase === 'landing')) {
        this.flaps = !this.flaps; FL.audio.play('gear');
        FL.hud.msg(this.flaps ? 'Landeklappen ausgefahren: langsamer, sinkt später' : 'Landeklappen eingefahren', C.cyan, true);
      }
    }
    destroy() { FL.tilt.air = false; this.stage.dispose(); }
  };
})();
