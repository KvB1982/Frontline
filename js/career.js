'use strict';
// Frontlinie 3 – Spieldaten: Waffen, Gegner, Shop-Angebot, Karriere-Level. Dazu die Anzeige im Spiel (HUD).

FL.WEAPONS = [
  { name: 'Pistole',        rate: 0.38, dmg: 1, shots: 1, spread: 0,    color: 0xffe68c },
  { name: 'Gewehr',         rate: 0.26, dmg: 1, shots: 1, spread: 0,    color: 0xffe68c },
  { name: 'Sturmgewehr',    rate: 0.13, dmg: 1, shots: 1, spread: 0,    color: 0xffd26e },
  { name: 'Doppel-MG',      rate: 0.12, dmg: 1, shots: 2, spread: 0.35, color: 0xffbe5a },
  { name: 'Plasma-Blaster', rate: 0.11, dmg: 2, shots: 2, spread: 0.4,  color: 0x46dcff },
  { name: 'Gatling-Laser',  rate: 0.07, dmg: 2, shots: 3, spread: 0.45, color: 0xff5adc },
  { name: 'Mega-Kanone',    rate: 0.07, dmg: 3, shots: 3, spread: 0.5,  color: 0xff9628, rocket: 5 }
];
FL.TOWER_LEVELS = [
  { name: 'Geschütz',          count: 1, reload: 3.0, kind: 'shell',  n: 1, dmg: 4, radius: 3.0 },
  { name: 'Zwei Geschütze',    count: 2, reload: 2.6, kind: 'shell',  n: 1, dmg: 4, radius: 3.0 },
  { name: 'Zwillingsgeschütze', count: 2, reload: 2.2, kind: 'shell',  n: 2, dmg: 5, radius: 3.4 },
  { name: 'Raketenbatterien',  count: 2, reload: 1.9, kind: 'rocket', n: 2, dmg: 6, radius: 3.8 },
  { name: 'Mega-Batterien',    count: 2, reload: 1.4, kind: 'rocket', n: 3, dmg: 8, radius: 4.4 }
];
FL.SPECIALS = [
  { id: 'drones', key: '1', name: 'Drohnen', reload: 22 },
  { id: 'heli',   key: '2', name: 'Kampfhubschrauber', reload: 35 },
  { id: 'bomber', key: '3', name: 'Kampfbomber', reload: 50 },
  { id: 'arty',   key: '4', name: 'Artillerie', reload: 40 }
];
// Gegner: Lebenspunkte, Tempo, Punkte, Waffe, Schüsse pro Sekunde
FL.ENEMIES = {
  rekrut:     { hp: 1,  speed: 2.6, pts: 10,  gun: 'gewehr',  rate: 0.18, name: 'Rekrut' },
  soldat:     { hp: 2,  speed: 2.8, pts: 20,  gun: 'gewehr',  rate: 0.25, name: 'Soldat' },
  elite:      { hp: 4,  speed: 3.0, pts: 40,  gun: 'mg',      rate: 0.35, name: 'Elite' },
  raketen:    { hp: 3,  speed: 2.2, pts: 40,  gun: 'rakete',  rate: 0.15, name: 'Raketen-Soldat' },
  schwer:     { hp: 8,  speed: 2.0, pts: 80,  gun: 'mg',      rate: 0.4,  name: 'Schwerer Soldat' },
  kommandant: { hp: 15, speed: 1.8, pts: 200, gun: 'mg',      rate: 0.45, name: 'Kommandant' },
  jeep:       { hp: 12, speed: 3.4, pts: 120, gun: 'mg',      rate: 0.5,  name: 'Jeep', vehicle: true },
  panzer:     { hp: 30, speed: 1.3, pts: 300, gun: 'granate', rate: 0.22, name: 'Panzer', vehicle: true }
};
// Welche Gegner bei welcher Stärke (tier 0 bis 5) wie oft kommen
FL.enemyWeights = t => ({
  rekrut: Math.max(0.5, 6 - 1.6 * t), soldat: 3 + 0.4 * t,
  elite: t >= 1 ? 0.8 + t : 0, raketen: t >= 1.5 ? 0.6 * t : 0,
  schwer: t >= 2.5 ? t - 1.5 : 0, kommandant: t >= 3.5 ? 0.5 : 0,
  jeep: t >= 1 ? 0.4 + 0.12 * t : 0, panzer: t >= 2 ? 0.18 * (t - 1) : 0
});

// ---------------------------------------------------------------- Shop
// id, Gruppe, Name, Preise je Stufe, Beschreibung, optional Namen der Stufen
FL.ITEMS = [
  { id: 'weapon', group: 'Waffen', name: 'Waffe', prices: [150, 300, 500, 800, 1200, 1800], desc: 'Deine Waffe im Bodenkampf. Die Kameraden bekommen immer die Waffe eine Stufe darunter.', levels: FL.WEAPONS.map(w => w.name) },
  { id: 'vest', group: 'Ausrüstung', name: 'Schutzweste', prices: [120, 260, 480], desc: 'Du hältst mehr Treffer aus.' },
  { id: 'allies', group: 'Ausrüstung', name: 'Kameraden', prices: [100, 180, 280, 400, 550, 750], desc: 'Soldaten, die neben dir kämpfen und selbst zielen.' },
  { id: 'lives', group: 'Ausrüstung', name: 'Extra-Leben', prices: [300, 600], desc: 'Ein Leben mehr pro Einsatz.' },
  { id: 'medkit', group: 'Ausrüstung', name: 'Sanitäter-Kit', prices: [200], desc: 'Du hilfst getroffenen Kameraden doppelt so schnell wieder auf.' },
  { id: 'drones', group: 'Unterstützung', name: 'Drohnen', prices: [250, 400], desc: 'Taste 1: fünf Drohnen suchen sich je ein Ziel. Stufe 2 lädt schneller. Geht auch im Panzer-Einsatz.' },
  { id: 'heli', group: 'Unterstützung', name: 'Kampfhubschrauber', prices: [450, 600], desc: 'Taste 2: fliegt über das Feld und feuert Raketen. Stufe 2 lädt schneller. Im Panzer-Einsatz begleitet er dich eine Weile.' },
  { id: 'bomber', group: 'Unterstützung', name: 'Kampfbomber', prices: [700, 800], desc: 'Taste 3: Bombenteppich über das ganze Feld. Stufe 2 lädt schneller. Im Panzer-Einsatz bombardiert er dein Ziel.' },
  { id: 'arty', group: 'Unterstützung', name: 'Artillerie', prices: [500, 700], desc: 'Taste 4: Die Artillerie schießt von weit hinten eine Salve Granaten auf die Gegner. Stufe 2 lädt schneller. Im Panzer-Einsatz trifft die Salve dein Ziel.' },
  { id: 'tank', group: 'Unterstützung', name: 'Begleit-Panzer', prices: [600], desc: 'Ein eigener Panzer kämpft im Bodenkampf mit.' },
  { id: 'werfer', group: 'Unterstützung', name: 'Raketenwerfer', prices: [750], desc: 'Ein Raketenwerfer-Fahrzeug unterstützt dich im Bodenkampf.' },
  { id: 'towers', group: 'Basis', name: 'Geschütze', prices: [200, 350, 550, 800, 1100], desc: 'Taste X feuert. Bei der Verteidigung stehen sie als Geschütztürme in deiner Basis, beim Angriff fahren sie als Geschützwagen mit. Jede Stufe macht sie stärker.', levels: ['keine'].concat(FL.TOWER_LEVELS.map(t => t.name)) },
  { id: 'mgnest', group: 'Basis', name: 'MG-Nester', prices: [250, 450], desc: 'Schießen bei der Verteidigung von selbst auf Gegner.' },
  { id: 'bunker', group: 'Basis', name: 'Bunker', prices: [200, 350, 500], desc: 'Deine Basis hält bei der Verteidigung mehr Durchbrüche aus.' },
  { id: 'medic', group: 'Basis', name: 'Sanitätszelt', prices: [300], desc: 'Bei der Verteidigung stehen getroffene Kameraden nach kurzer Zeit von selbst wieder auf.' },
  { id: 'radar', group: 'Basis', name: 'Radar', prices: [400], desc: 'Bei der Verteidigung laden Drohnen, Hubschrauber und Bomber schneller.' },
  { id: 'p_armor', group: 'Flugzeug', name: 'Panzerung', prices: [200, 350, 550], desc: 'Dein Kampfflugzeug hält mehr Treffer aus.' },
  { id: 'p_gun', group: 'Flugzeug', name: 'Bordkanone', prices: [180, 320, 520], desc: 'Schießt schneller und stärker.' },
  { id: 'p_bomb', group: 'Flugzeug', name: 'Bomben', prices: [220, 380, 600], desc: 'Größere Explosion und schneller nachgeladen.' },
  { id: 'p_engine', group: 'Flugzeug', name: 'Triebwerk', prices: [200, 350, 550], desc: 'Das Flugzeug lenkt wendiger und hat Treibstoff für einen Anflug mehr.' },
  { id: 'p_rocket', group: 'Flugzeug', name: 'Raketen', prices: [400, 600], desc: 'Taste R: Raketen suchen sich ihr Ziel selbst.' },
  { id: 't_armor', group: 'Panzer', name: 'Panzerung', prices: [200, 350, 550], desc: 'Dein Panzer hält mehr Treffer aus.' },
  { id: 't_gun', group: 'Panzer', name: 'Kanone', prices: [220, 380, 600], desc: 'Mehr Schaden pro Schuss.' },
  { id: 't_reload', group: 'Panzer', name: 'Ladeautomatik', prices: [200, 350, 550], desc: 'Die Kanone lädt schneller nach.' },
  { id: 't_engine', group: 'Panzer', name: 'Motor', prices: [180, 320, 500], desc: 'Schneller fahren und drehen.' }
];
FL.GROUPS = ['Waffen', 'Ausrüstung', 'Unterstützung', 'Basis', 'Flugzeug', 'Panzer'];
FL.loadout = up => {
  const lo = {};
  for (const it of FL.ITEMS) lo[it.id] = Math.min(it.prices.length, (up && up[it.id]) || 0);
  return lo;
};

// ---------------------------------------------------------------- Karriere
FL.KIND_NAMES = { attack: 'Angriff: Basis erobern', defend: 'Verteidigung der eigenen Basis', flight: 'Luftangriff im Kampfflugzeug', tank: 'Panzer-Einsatz' };
FL.CAREER = [
  { kind: 'attack', theme: 'wald', tier: 0, sections: 2, reward: 200, name: 'Das Waldlager', text: 'Ein kleines Lager mit Holzpalisade. Rücke über den Waldweg vor und zerstöre Tor, Wachtürme und Kommandozelt. Deine Ausrüstung ist noch schwach: Nutze die Deckung!' },
  { kind: 'defend', theme: 'wald', tier: 0.5, waves: 3, reward: 220, name: 'Gegenangriff', text: 'Der Gegner will das Lager zurück. Halte deine Basis gegen drei Angriffswellen. Jeder Durchbruch schwächt die Basis.' },
  { kind: 'flight', theme: 'wald', tier: 1, reward: 260, name: 'Treibstofflager', text: 'Steig ins Kampfflugzeug. Zerstöre die markierten Tanks und Bunker mit Bomben und weiche dem Flak-Feuer aus.' },
  { kind: 'attack', theme: 'wueste', tier: 1.5, sections: 3, reward: 300, name: 'Das Wüstenfort', text: 'Ein Fort aus Sandstein mit dicken Mauern. Der Gegner schickt jetzt Elite-Soldaten und Jeeps.' },
  { kind: 'tank', theme: 'wueste', tier: 1.5, reward: 320, name: 'Panzervorstoß', text: 'Fahr mit deinem Panzer durch die Wüste und zerstöre alle markierten Ziele. Achte auf gegnerische Panzer und Geschütze.' },
  { kind: 'defend', theme: 'wueste', tier: 2, waves: 4, reward: 340, name: 'Sandsturm', text: 'Vier Wellen mit Raketen-Soldaten und Panzern rollen auf deine Basis zu. Türme und MG-Nester helfen.' },
  { kind: 'flight', theme: 'industrie', tier: 2.5, reward: 380, name: 'Der Flugplatz', text: 'Greife den gegnerischen Flugplatz an: Hangars, Radar und Tower. Jetzt steigen auch feindliche Jäger auf.' },
  { kind: 'attack', theme: 'industrie', tier: 3, sections: 3, reward: 420, name: 'Die Fabrik', text: 'Eine Fabrik-Basis aus Beton mit Schornstein und Tanklager. Schwere Soldaten und Panzer verteidigen sie.' },
  { kind: 'tank', theme: 'winter', tier: 3, reward: 440, name: 'Eisfront', text: 'Panzer-Einsatz im Schnee: Radarstationen, Depots und das Hauptgebäude müssen fallen.' },
  { kind: 'defend', theme: 'winter', tier: 3.5, waves: 5, reward: 480, name: 'Winterschlacht', text: 'Fünf Wellen im Schnee. Der Gegner bringt alles mit, was er hat.' },
  { kind: 'flight', theme: 'daemmerung', tier: 4, reward: 520, name: 'Angriff in der Dämmerung', text: 'Letzter Luftschlag vor dem Sturm auf das Hauptquartier: Zerstöre die Luftabwehr der Festung.' },
  { kind: 'attack', theme: 'daemmerung', tier: 4.5, sections: 4, reward: 800, name: 'Das Hauptquartier', text: 'Die große Festung des Gegners. Erobere sie und die Karriere ist geschafft!' }
];

// ---------------------------------------------------------------- Anzeige im Spiel
FL.hud = {
  root: null, msgs: null, dmgEl: null, dmgV: 0,
  clear() {
    this.root = document.getElementById('hud');
    this.root.innerHTML = '';
    this.msgs = FL.el('div', 'msgs', '', this.root);
    this.dmgEl = FL.el('div', 'dmg', '', this.root);
    this.dmgV = 0;
  },
  box(cls) { return FL.el('div', 'panel hud-box ' + cls, '', this.root); },
  set(el, html) { if (el.__h !== html) { el.__h = html; el.innerHTML = html; } },
  msg(text, color, small) {
    if (!this.msgs) return;
    const m = FL.el('div', 'msg' + (small ? ' small' : ''), text, this.msgs);
    m.style.color = color || '#ffc43c';
    while (this.msgs.children.length > 4) this.msgs.firstChild.remove();
    setTimeout(() => m.remove(), 2400);
  },
  damage(v) { this.dmgV = Math.max(this.dmgV, v); },
  tick(dt) {
    if (!this.dmgEl) return;
    this.dmgV = Math.max(0, this.dmgV - dt * 1.6);
    this.dmgEl.style.opacity = Math.min(1, this.dmgV).toFixed(2);
  },
  meter(frac, cls) { return `<div class="meter ${cls || ''}"><i style="width:${Math.round(FL.clamp(frac, 0, 1) * 100)}%"></i></div>`; },
  hearts(n, max) { let s = ''; for (let i = 0; i < max; i++) s += `<span style="color:${i < n ? '#5fd07a' : '#3a4854'}">⬢</span>`; return s; }
};
