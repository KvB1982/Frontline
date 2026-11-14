'use strict';
// Frontlinie 3 – Ablauf: Hauptmenü, Karriere, Laden, freies Spiel, Pause und Ergebnis.
(() => {
  const A = FL.app = { mode: null, backdrop: null, paused: false, done: false, ctx: null, last: 0 };
  const screen = () => document.getElementById('screen');
  const DIFFS = [{ name: 'Leicht', v: 0.7 }, { name: 'Normal', v: 0.85 }, { name: 'Schwer', v: 1.05 }, { name: 'Sehr schwer', v: 1.3 }, { name: 'Extrem', v: 1.6 }];
  const KINDS = ['attack', 'defend', 'flight', 'heli', 'tank'];
  const SHORT = { attack: 'Angriff', defend: 'Verteidigung', flight: 'Kampfflugzeug', heli: 'Hubschrauber', tank: 'Panzer' };

  const clearScreen = () => { const s = screen(); s.innerHTML = ''; return s; };
  const clearHud = () => { document.getElementById('hud').innerHTML = ''; FL.hud.msgs = null; FL.hud.dmgEl = null; };
  const btn = (parent, label, cls, fn) => {
    const b = FL.el('button', 'btn ' + (cls || ''), label, parent);
    b.type = 'button';
    b.addEventListener('click', () => { FL.audio.unlock(); FL.audio.play('click'); fn(b); });
    return b;
  };
  const page = (title, onBack, backLabel) => {
    const p = FL.el('div', 'page', '', clearScreen());
    const head = FL.el('div', 'page-head', '', p);
    btn(head, '← ' + backLabel, 'small', onBack);
    FL.el('h2', '', title, head);
    const body = FL.el('div', 'page-body', '', p), foot = FL.el('div', 'page-foot', '', p);
    FL.onKey = code => { if (code === 'Escape') onBack(); };
    return { p, head, body, foot };
  };
  const coinsEl = parent => FL.el('div', 'coins hud-big', String(FL.save.coins), parent);

  // ---------------------------------------------------------------- Hintergrund für die Menüs
  class Backdrop {
    constructor() {
      const lvl = FL.CAREER[Math.min(FL.save.level, FL.CAREER.length - 1)], th = lvl.theme;
      const st = this.stage = new FL.Stage(th, { far: 700, shadow: 60 });
      const rnd = FL.seeded(5);
      st.ground(1400, FL.tex.ground(th), 18);
      st.add(st.strip(13.5, 500, FL.tex.road(th), 13.5, 12, 0, 100));
      for (let i = 0; i < 90; i++) {
        const x = (rnd() < 0.5 ? -1 : 1) * (12 + rnd() * 70), z = -40 + rnd() * 220;
        if (z > 30 && z < 80 && Math.abs(x) < 34) continue;
        const t = FL.tree(FL.pick(st.theme.trees), rnd); t.position.set(x, 0, z); st.add(t);
      }
      const put = (kind, x, z, opt, rot) => { const b = FL.building(kind, th, opt); b.position.set(x, 0, z); b.rotation.y = rot || 0; st.add(b); return b; };
      put('gate', 0, 40);
      for (const sx of [-1, 1]) { put('wall', sx * 8.4, 40, { len: 8.2 }); put('tower', sx * 14.2, 41.5); put('wall', sx * 21, 40, { len: 10 }); }
      put(st.theme.style === 'wood' ? 'barracks' : 'hq', 0, 54);
      put('depot', 13, 50); put('hangar', -20, 58);
      this.radar = put('radar', 20, 58).userData.spin;
      const hero = FL.soldier({ team: 'hero', weapon: 3 }); hero.position.set(0, 0, 4); st.add(hero);
      for (const x of [-3, -1.5, 1.5, 3]) { const a = FL.soldier({ team: 'ally', weapon: 2 }); a.position.set(x, 0, 5 + Math.abs(x) * 0.3); st.add(a); }
      const tank = FL.tankModel(FL.PAL.ally); tank.position.set(-9, 0, 9); tank.rotation.y = 0.15; st.add(tank);
      const sb = FL.building('sandbags', th, { len: 12 }); sb.position.set(0, 0, 7.5); st.add(sb);
      this.jet = FL.jetModel(0x66788a, 0x2a6fd0); this.jet.rotation.order = 'YXZ'; st.add(this.jet);
      this.t = 0;
      this.update(0);
    }
    update(dt) {
      this.t += dt;
      const a = Math.sin(this.t * 0.12) * 0.5, cam = this.stage.camera;
      cam.position.set(Math.sin(a) * 26, 6.5, -20 + (1 - Math.cos(a)) * 12);
      cam.lookAt(0, 3.5, 30);
      const j = this.t * 0.45;
      this.jet.position.set(Math.sin(j) * 70, 26, 60 + Math.cos(j) * 70);
      this.jet.rotation.set(0, j + Math.PI / 2, -0.5);
      if (this.radar) this.radar.rotation.y += dt * 1.5;
      this.stage.update(new THREE.Vector3(0, 0, 25));
    }
    destroy() { this.stage.dispose(); }
  }
  const toMenus = () => {
    if (A.mode) { A.mode.destroy(); A.mode = null; }
    if (A.backdrop) A.backdrop.destroy();
    A.backdrop = new Backdrop();
    A.paused = false; A.done = false;
    FL.tilt.stop(false);
    FL.touch.hide();
    clearHud();
  };

  // ---------------------------------------------------------------- Hauptmenü
  const mainMenu = () => {
    if (!A.backdrop || A.mode) toMenus();
    const m = FL.el('div', 'menu', '', clearScreen());
    FL.el('div', 'title', 'FRONTLINIE 3', m);
    FL.el('div', 'subtitle', 'Karriere · Luftangriff · Panzer', m);
    const box = FL.el('div', 'menu-buttons', '', m);
    const done = FL.save.level >= FL.CAREER.length;
    btn(box, `Karriere<small>${done ? 'Alle Einsätze geschafft' : 'Einsatz ' + (FL.save.level + 1) + ' von ' + FL.CAREER.length} · ${FL.save.coins} Münzen</small>`, 'primary', careerPage);
    btn(box, 'Laden<small>Waffen, Ausrüstung, Unterstützung, Basis, Flugzeug, Panzer</small>', '', () => shopPage(mainMenu, 'Menü'));
    btn(box, 'Sondereinsätze<small>16 Szenarien für Kampfflugzeug und Panzer, jedes mit Briefing</small>', '', scenarioPage);
    btn(box, 'Freies Spiel<small>Alles selbst einstellen und sofort spielen</small>', '', manualPage);
    const pair = FL.el('div', 'pair', '', box);
    const mute = btn(pair, '', '', () => { FL.save.muted = !FL.save.muted; FL.store(); label(); });
    const label = () => { mute.innerHTML = `Ton: ${FL.save.muted ? 'aus' : 'an'}<small>Taste M</small>`; };
    label();
    const GFX = ['auto', 'schön', 'mittel', 'schnell'];
    const gfx = btn(pair, '', '', () => { FL.save.gfx = GFX[(GFX.indexOf(FL.save.gfx || 'auto') + 1) % GFX.length]; FL.store(); applyGfx(); glabel(); });
    const glabel = () => { gfx.innerHTML = `Grafik: ${FL.save.gfx || 'auto'}<small>bei Ruckeln: „schnell“</small>`; };
    glabel();
    FL.el('div', 'hint', 'F11 schaltet auf Vollbild · P oder Esc pausiert im Spiel', m);
    FL.el('div', 'credits', '3D-Modelle von Sketchfab: 42manako, SIpriv, Duane’s Mind, PolyDucky, Hdjusj (CC BY) und bohmerang (CC BY-NC-SA) · <a href="lizenzen.html" target="_blank" rel="noopener">Quellen</a>', m);
    FL.onKey = code => { if (code === 'KeyM') label(); };
  };

  // ---------------------------------------------------------------- Karriere
  const careerCfg = i => {
    const L = FL.CAREER[i];
    return { kind: L.kind, theme: L.theme, tier: L.tier, sections: L.sections, waves: L.waves, diff: Math.min(0.86, 0.7 + 0.04 * L.tier), towersOn: FL.save.towersOn !== false };
  };
  const careerPage = () => {
    if (!A.backdrop || A.mode) toMenus();
    const P = page('Karriere', mainMenu, 'Menü');
    coinsEl(P.head);
    btn(P.head, 'Laden', '', () => shopPage(careerPage, 'Karriere'));
    const grid = FL.el('div', 'levels', '', P.body), brief = FL.el('div', 'panel brief', '', P.body);
    let sel = Math.min(FL.save.level, FL.CAREER.length - 1);
    const cards = [];
    const start = btn(P.foot, 'Einsatz starten', 'primary', () => launch(careerCfg(sel), FL.loadout(FL.save.up), { type: 'career', index: sel }));
    const pick = i => {
      sel = i;
      cards.forEach((c, k) => c.classList.toggle('sel', k === i));
      const L = FL.CAREER[i], again = i < FL.save.level;
      brief.innerHTML = `<h3>${i + 1}. ${L.name}</h3><div class="muted">${FL.KIND_NAMES[L.kind]} · ${FL.THEMES[L.theme].name}</div><p>${L.text}</p>` +
        `<p>Prämie: <span class="coins">${again ? Math.round(L.reward * 0.4) : L.reward}</span>${again ? ' <span class="muted">(schon geschafft, deshalb weniger)</span>' : ''} und dazu Münzen für jeden Treffer.</p>`;
      start.innerHTML = again ? 'Einsatz wiederholen' : 'Einsatz starten';
    };
    FL.CAREER.forEach((L, i) => {
      const state = i < FL.save.level ? 'done' : i === FL.save.level ? 'next' : 'locked';
      const c = FL.el('button', 'level ' + state, `<span class="nr">Einsatz ${i + 1}</span><span class="name">${L.name}</span><span class="kind">${SHORT[L.kind]} · ${FL.THEMES[L.theme].name}</span><span class="reward"><span class="coins">${L.reward}</span></span>`, grid);
      c.type = 'button';
      if (state === 'locked') c.disabled = true;
      else c.addEventListener('click', () => { FL.audio.play('click'); pick(i); });
      cards.push(c);
    });
    pick(sel);
    if (FL.save.level >= FL.CAREER.length) FL.el('p', '', '<b style="color:#ffc43c">Karriere geschafft!</b> Du kannst jeden Einsatz wiederholen oder im freien Spiel weitermachen.', P.body);
    // zurücksetzen nur mit zweitem Klick
    let armed = false;
    const reset = btn(P.foot, 'Karriere neu beginnen', 'small', () => {
      if (!armed) { armed = true; reset.innerHTML = 'Wirklich alles löschen? Nochmal klicken'; return; }
      const keep = { muted: FL.save.muted, manual: FL.save.manual };
      FL.save = Object.assign(FL.defaultSave(), keep); FL.store();
      toMenus(); careerPage();
    });
    P.foot.insertBefore(reset, start);
    const prev = FL.onKey;
    FL.onKey = code => { if (code === 'Enter') start.click(); else prev(code); };
  };

  // ---------------------------------------------------------------- Sondereinsätze mit Briefing
  const scenarioCfg = S => ({ kind: S.kind, theme: S.theme, tier: S.tier, diff: Math.min(0.95, 0.74 + 0.04 * S.tier), sc: S.sc, towersOn: true });
  let scTab = 'flight';
  const scenarioPage = () => {
    if (!A.backdrop || A.mode) toMenus();
    FL.save.sc = FL.save.sc || {};
    const P = page('Sondereinsätze', mainMenu, 'Menü');
    coinsEl(P.head);
    btn(P.head, 'Laden', '', () => shopPage(scenarioPage, 'Sondereinsätze'));
    const tabs = FL.el('div', 'tabs', '', P.body), grid = FL.el('div', 'levels', '', P.body);
    FL.el('div', 'hint', 'Alle Sondereinsätze sind von Anfang an offen. Du spielst mit der Ausrüstung aus deiner Karriere.', P.foot);
    const draw = () => {
      tabs.innerHTML = ''; grid.innerHTML = '';
      for (const [k, name] of [['flight', 'Kampfflugzeug'], ['heli', 'Hubschrauber'], ['tank', 'Panzer']]) {
        const t = FL.el('button', 'tab' + (k === scTab ? ' on' : ''), name, tabs);
        t.type = 'button';
        t.addEventListener('click', () => { FL.audio.play('click'); scTab = k; draw(); });
      }
      FL.SCENARIOS.filter(S => S.kind === scTab).forEach((S, i) => {
        const done = !!FL.save.sc[S.id];
        const c = FL.el('button', 'level ' + (done ? 'done' : 'next'), `<span class="nr">${done ? 'geschafft' : 'Einsatz ' + (i + 1)}</span><span class="name">${S.name}</span><span class="kind">${FL.THEMES[S.theme].name} · Stärke ${Math.round(S.tier * 2 + 1)}</span><span class="reward"><span class="coins">${done ? Math.round(S.reward * 0.4) : S.reward}</span></span>`, grid);
        c.type = 'button';
        c.addEventListener('click', () => { FL.audio.play('click'); briefingPage(S); });
      });
    };
    draw();
  };
  const briefingPage = S => {
    const P = page('Briefing: ' + S.name, scenarioPage, 'Sondereinsätze');
    const done = !!(FL.save.sc && FL.save.sc[S.id]);
    const b = FL.el('div', 'panel brief briefing', '', P.body);
    b.innerHTML = `<div class="muted">${FL.KIND_NAMES[S.kind]} · ${FL.THEMES[S.theme].name} · Stärke ${Math.round(S.tier * 2 + 1)} von 11</div>` +
      `<h3>Lage</h3><p>${S.lage}</p><h3>Dein Auftrag</h3><p>${S.auftrag}</p><h3>Gefahren</h3><p>${S.gefahr}</p><h3>Tipp</h3><p>${S.tipp}</p>` +
      (S.kind === 'flight' ? '<p class="muted">Ablauf: zum Flugzeug laufen, zur Startbahn rollen, starten, Auftrag erfüllen, zurückfliegen und selbst landen.</p>' : S.kind === 'heli' ? '<p class="muted">Ablauf: abheben, zum Einsatzort fliegen, die Bodentruppen unterstützen, zurückfliegen und auf dem Landeplatz landen. Wer zwischendurch dort landet, wird repariert.</p>' : '') +
      `<p>Prämie: <span class="coins">${done ? Math.round(S.reward * 0.4) : S.reward}</span>${done ? ' <span class="muted">(schon geschafft, deshalb weniger)</span>' : ''} und dazu Münzen für jeden Treffer.</p>`;
    const go = btn(P.foot, 'Einsatz starten', 'primary', () => launch(scenarioCfg(S), FL.loadout(FL.save.up), { type: 'scenario', id: S.id }));
    const prev = FL.onKey;
    FL.onKey = code => { if (code === 'Enter') go.click(); else prev(code); };
  };

  // ---------------------------------------------------------------- Laden
  let shopTab = 'Waffen';
  const levelName = (it, lvl) => it.levels ? it.levels[lvl] : lvl === 0 ? (it.prices.length > 1 ? 'noch nicht gekauft' : 'nicht gekauft') : it.prices.length > 1 ? 'Stufe ' + lvl : 'gekauft';
  const shopPage = (back, backLabel) => {
    const P = page('Laden', back, backLabel);
    const coins = coinsEl(P.head);
    const tabs = FL.el('div', 'tabs', '', P.body), grid = FL.el('div', 'items', '', P.body);
    const draw = () => {
      coins.textContent = String(FL.save.coins);
      tabs.innerHTML = ''; grid.innerHTML = '';
      for (const g of FL.GROUPS) {
        const t = FL.el('button', 'tab' + (g === shopTab ? ' on' : ''), g, tabs);
        t.type = 'button';
        t.addEventListener('click', () => { FL.audio.play('click'); shopTab = g; draw(); });
      }
      for (const it of FL.ITEMS.filter(i => i.group === shopTab)) {
        const lvl = FL.save.up[it.id] || 0, max = it.prices.length, price = it.prices[lvl];
        const card = FL.el('div', 'item', `<div class="name">${it.name}</div><div class="muted">${levelName(it, lvl)}</div><div class="desc">${it.desc}</div>`, grid);
        const row = FL.el('div', 'row', '', card), pips = FL.el('div', 'pips', '', row);
        for (let i = 0; i < max; i++) FL.el('div', 'pip' + (i < lvl ? ' on' : ''), '', pips);
        if (lvl >= max) FL.el('span', 'muted', 'ausgebaut', row);
        else {
          const b = btn(row, `${lvl ? 'Verbessern' : 'Kaufen'} <span class="coins">${price}</span>`, 'small', () => {
            if (FL.save.coins < price) return;
            FL.save.coins -= price; FL.save.up[it.id] = lvl + 1; FL.store();
            FL.audio.play('coin'); draw();
          });
          if (FL.save.coins < price) b.disabled = true;
        }
      }
    };
    draw();
    FL.el('div', 'hint', 'Münzen bekommst du für gewonnene Einsätze und für jeden Treffer.', P.foot);
  };

  // ---------------------------------------------------------------- Freies Spiel
  const manualPage = () => {
    if (!A.backdrop || A.mode) toMenus();
    const m = Object.assign({ kind: 'attack', theme: 'wald', tier: 1, diff: 1, sections: 2, waves: 3, towersOn: true, up: {} }, FL.save.manual || {});
    m.up = Object.assign({}, m.up);
    const keep = () => { FL.save.manual = m; FL.store(); };
    const P = page('Freies Spiel', () => { keep(); mainMenu(); }, 'Menü');
    FL.el('div', 'hint', 'Hier kostet nichts Münzen: Stell alles ein, wie du willst.', P.head);
    const redraw = [];
    const stepper = (parent, name, text, step) => {
      const o = FL.el('div', 'opt', `<div class="name">${name}</div>`, parent), s = FL.el('div', 'stepper', '', o);
      btn(s, '‹', 'small', () => { step(-1); refresh(); });
      const v = FL.el('div', 'val', '', s);
      btn(s, '›', 'small', () => { step(1); refresh(); });
      redraw.push(() => { v.textContent = text(); });
    };
    const refresh = () => { for (const f of redraw) f(); keep(); };
    const cycle = (arr, cur, d) => arr[(arr.indexOf(cur) + d + arr.length) % arr.length];

    FL.el('div', 'group-title', 'Einsatz', P.body);
    const opts = FL.el('div', 'opts', '', P.body);
    stepper(opts, 'Art des Einsatzes', () => FL.KIND_NAMES[m.kind], d => { m.kind = cycle(KINDS, m.kind, d); });
    stepper(opts, 'Landschaft', () => FL.THEMES[m.theme].name, d => { m.theme = cycle(FL.THEME_KEYS, m.theme, d); });
    stepper(opts, 'Stärke der Gegner', () => 'Stufe ' + (m.tier * 2 + 1) + ' von 11', d => { m.tier = FL.clamp(m.tier + d * 0.5, 0, 5); });
    stepper(opts, 'Schwierigkeit', () => DIFFS[m.diff].name, d => { m.diff = FL.clamp(m.diff + d, 0, DIFFS.length - 1); });
    stepper(opts, 'Länge', () => m.kind === 'attack' ? m.sections + ' Abschnitte' : m.kind === 'defend' ? m.waves + ' Wellen' : 'fest',
      d => { if (m.kind === 'attack') m.sections = FL.clamp(m.sections + d, 1, 5); else if (m.kind === 'defend') m.waves = FL.clamp(m.waves + d, 1, 8); });
    stepper(opts, 'Geschütze', () => m.towersOn ? 'an' : 'aus', () => { m.towersOn = !m.towersOn; });
    const quick = FL.el('div', 'tabs', '', P.body); quick.style.marginTop = '14px';
    btn(quick, 'Alles auf Maximum', 'small', () => { for (const it of FL.ITEMS) m.up[it.id] = it.prices.length; refresh(); });
    btn(quick, 'Alles auf Anfang', 'small', () => { m.up = {}; refresh(); });
    btn(quick, 'Wie in meiner Karriere', 'small', () => { m.up = Object.assign({}, FL.save.up); refresh(); });
    for (const g of FL.GROUPS) {
      FL.el('div', 'group-title', g, P.body);
      const box = FL.el('div', 'opts', '', P.body);
      for (const it of FL.ITEMS.filter(i => i.group === g)) {
        stepper(box, it.name, () => { const l = m.up[it.id] || 0; return it.levels ? it.levels[l] : l === 0 ? 'ohne' : it.prices.length > 1 ? 'Stufe ' + l + ' von ' + it.prices.length : 'dabei'; },
          d => { m.up[it.id] = FL.clamp((m.up[it.id] || 0) + d, 0, it.prices.length); });
      }
    }
    refresh();
    const go = btn(P.foot, 'Sofort spielen', 'primary', () => {
      keep();
      launch({ kind: m.kind, theme: m.theme, tier: m.tier, sections: m.sections, waves: m.waves, diff: DIFFS[m.diff].v, towersOn: m.towersOn }, FL.loadout(m.up), { type: 'manual' });
    });
    const prev = FL.onKey;
    FL.onKey = code => { if (code === 'Enter') go.click(); else prev(code); };
  };

  // ---------------------------------------------------------------- Spiel starten, Pause, Ergebnis
  const fade = fn => {
    const f = document.getElementById('fade');
    f.style.opacity = 1;
    setTimeout(() => { fn(); f.style.opacity = 0; }, 260);
  };
  const launch = (cfg, lo, ctx) => {
    if (A.launching) return;
    A.launching = true;
    // Neigungssteuerung fürs Flugzeug: Die Erlaubnis muss direkt beim Fingertipp geholt werden.
    if (cfg.kind === 'flight' && FL.touch.active && FL.save.tilt !== false) FL.tilt.start(false); else FL.tilt.stop(false);
    FL.onKey = null;
    // erst starten, wenn die 3D-Modelle geladen sind
    FL.ext.whenReady(() => fade(() => {
      A.launching = false;
      if (A.backdrop) { A.backdrop.destroy(); A.backdrop = null; }
      if (A.mode) { A.mode.destroy(); A.mode = null; }
      clearScreen(); FL.keys = {};
      A.ctx = { cfg, lo, ctx }; A.paused = false; A.done = false;
      const Mode = cfg.kind === 'flight' ? FL.FlightMission : cfg.kind === 'heli' ? FL.HeliMission : cfg.kind === 'tank' ? FL.TankMission : cfg.kind === 'defend' ? FL.BaseDefense : FL.GroundBattle;
      A.mode = new Mode(cfg, lo);
      FL.touch.show(cfg.kind, lo);
      FL.onKey = code => {
        if (A.done) return;
        if (code === 'KeyP' || code === 'Escape') setPause(!A.paused);
        else if (!A.paused) A.mode.onKey(code);
      };
    }));
  };
  A.launch = launch;
  const leave = () => fade(() => { toMenus(); const t = A.ctx.ctx.type; if (t === 'career') careerPage(); else if (t === 'scenario') scenarioPage(); else manualPage(); });
  const setPause = on => {
    if (!A.mode || A.done) return;
    A.paused = on;
    const s = clearScreen();
    if (!on) return;
    const wrap = FL.el('div', 'pause', '', s), box = FL.el('div', 'panel result', '<h1>Pause</h1>', wrap);
    btn(box, 'Weiterspielen', 'primary', () => setPause(false));
    btn(box, 'Neu starten', '', () => launch(A.ctx.cfg, A.ctx.lo, A.ctx.ctx));
    btn(box, 'Einsatz abbrechen', '', leave);
    if (!FL.touch.active) FL.el('div', 'hint', 'P oder Esc: weiterspielen · M: Ton an/aus', box);
  };
  const finish = () => {
    const mode = A.mode, win = mode.result === 'win', c = A.ctx.ctx;
    A.done = true; FL.touch.hide(); FL.keys = {};
    FL.audio.play(win ? 'coin' : 'alarm');
    const wrap = FL.el('div', 'pause', '', clearScreen()), box = FL.el('div', 'panel result' + (win ? '' : ' lose'), '', wrap);
    FL.el('h1', '', win ? 'SIEG!' : 'VERLOREN', box);
    const retry = () => launch(A.ctx.cfg, A.ctx.lo, c);
    if (c.type === 'career') {
      const L = FL.CAREER[c.index], first = c.index >= FL.save.level;
      const reward = win ? (first ? L.reward : Math.round(L.reward * 0.4)) : 0;
      const bonus = win ? mode.coins : Math.round(mode.coins * 0.5);
      FL.save.coins += reward + bonus;
      if (win && first) FL.save.level = c.index + 1;
      FL.store();
      const last = win && first && FL.save.level >= FL.CAREER.length;
      FL.el('div', 'big', last ? 'Du hast das Hauptquartier erobert. Die Karriere ist geschafft!' : win ? L.name + ' ist geschafft!' : 'Das war knapp. Versuch es gleich nochmal!', box);
      FL.el('table', '', `<tr><td>Prämie</td><td><span class="coins">${reward}</span></td></tr>` +
        `<tr><td>${win ? 'Münzen für Treffer' : 'Trostpreis für Treffer'}</td><td><span class="coins">${bonus}</span></td></tr>` +
        `<tr><td><b>Dein Konto</b></td><td><b><span class="coins">${FL.save.coins}</span></b></td></tr>`, box);
      if (!win) FL.el('div', 'hint', 'Tipp: Im Laden gibt es bessere Waffen und Ausrüstung. Frühere Einsätze kannst du wiederholen, um Münzen zu sammeln.', box);
      if (win) btn(box, 'Weiter', 'primary', leave); else btn(box, 'Nochmal versuchen', 'primary', () => launch(careerCfg(c.index), FL.loadout(FL.save.up), c));
      btn(box, 'Zum Laden', '', () => fade(() => { toMenus(); shopPage(careerPage, 'Karriere'); }));
      if (!win) btn(box, 'Zur Karriere', '', leave);
    } else if (c.type === 'scenario') {
      const S = FL.SCENARIOS.find(x => x.id === c.id);
      FL.save.sc = FL.save.sc || {};
      const first = !FL.save.sc[S.id];
      const reward = win ? (first ? S.reward : Math.round(S.reward * 0.4)) : 0, bonus = win ? mode.coins : Math.round(mode.coins * 0.5);
      FL.save.coins += reward + bonus;
      if (win) FL.save.sc[S.id] = true;
      FL.store();
      FL.el('div', 'big', win ? S.name + ' ist geschafft!' : 'Der Auftrag ist gescheitert. Versuch es gleich nochmal!', box);
      FL.el('table', '', `<tr><td>Prämie</td><td><span class="coins">${reward}</span></td></tr>` +
        `<tr><td>${win ? 'Münzen für Treffer' : 'Trostpreis für Treffer'}</td><td><span class="coins">${bonus}</span></td></tr>` +
        `<tr><td><b>Dein Konto</b></td><td><b><span class="coins">${FL.save.coins}</span></b></td></tr>`, box);
      if (win) btn(box, 'Weiter', 'primary', leave); else btn(box, 'Nochmal versuchen', 'primary', retry);
      btn(box, 'Zum Laden', '', () => fade(() => { toMenus(); shopPage(scenarioPage, 'Sondereinsätze'); }));
      if (!win) btn(box, 'Zu den Sondereinsätzen', '', leave);
    } else {
      FL.el('div', 'big', win ? 'Einsatz gewonnen!' : 'Diesmal hat der Gegner gewonnen.', box);
      FL.el('div', 'muted', `${mode.kills} Treffer · im freien Spiel gibt es keine Münzen`, box);
      btn(box, 'Nochmal', 'primary', retry);
      btn(box, 'Einstellungen ändern', '', leave);
      btn(box, 'Zum Menü', '', () => fade(() => { toMenus(); mainMenu(); }));
    }
  };

  // ---------------------------------------------------------------- Grafik-Stufe
  // "auto" beginnt schön und schaltet von selbst herunter, wenn der Rechner zu langsam ist.
  const applyGfx = () => {
    const g = FL.save.gfx || 'auto';
    FL.setQuality(g === 'schnell' ? 0 : g === 'mittel' ? 1 : 2);
    A.slowT = 0; A.frames = 0; A.frameT = 0;
  };
  const watchSpeed = dt => {
    if ((FL.save.gfx || 'auto') !== 'auto' || FL.quality === 0) return;
    A.frames++; A.frameT += dt;
    if (A.frameT < 2.5) return;
    const fps = A.frames / A.frameT;
    A.frames = 0; A.frameT = 0;
    if (fps < 33) { FL.setQuality(FL.quality - 1); if (FL.hud.msgs) FL.hud.msg('Grafik etwas vereinfacht, damit es flüssig läuft', '#9fb0bd', true); }
  };

  // ---------------------------------------------------------------- Hauptschleife
  const frame = now => {
    requestAnimationFrame(frame);
    const real = Math.max(0, (now - A.last) / 1000), dt = Math.min(0.05, real);
    A.last = now;
    if (real < 0.5 && !A.paused && !document.hidden) watchSpeed(real);
    if (A.mode) {
      if (!A.paused && !A.done) {
        A.mode.update(dt); FL.hud.tick(dt);
        if (A.mode.result) finish();
      }
      A.mode.stage.render();
    } else if (A.backdrop) { A.backdrop.update(dt); A.backdrop.stage.render(); }
  };
  window.addEventListener('blur', () => { if (A.mode && !A.paused && !A.done) setPause(true); });
  window.addEventListener('error', e => {
    const b = document.getElementById('errbox') || FL.el('div', '', '', document.body);
    b.id = 'errbox';
    b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;background:#5a1410;color:#fff;padding:6px 10px;border-radius:8px;font:12px monospace;max-width:70vw';
    b.textContent = 'Fehler: ' + e.message + ' (' + String(e.filename).split('/').pop() + ':' + e.lineno + ')';
  });

  A.start = () => {
    try { FL.initRenderer(); applyGfx(); }
    catch (e) {
      FL.el('div', 'menu', '<div class="title">FRONTLINIE 3</div><div class="panel result"><div class="big">Dieser Browser kann leider kein 3D (WebGL) anzeigen.</div><div class="muted">Bitte mit einem aktuellen Chrome, Edge oder Firefox öffnen.</div></div>', clearScreen());
      return;
    }
    FL.ext.load();
    mainMenu();
    requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && A.mode && !A.paused && !A.done) setPause(true); });
  // Damit das Spiel nach dem ersten Laden auch ohne Internet startet (nur über https, nicht per Doppelklick nötig)
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!window.FL_NO_AUTOSTART) A.start();
})();
