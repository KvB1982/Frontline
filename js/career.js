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
  { id: 'reinf', group: 'Unterstützung', name: 'Bodenverstärkung', prices: [650, 900], desc: 'Taste 5, einmal pro Angriff: Kameraden und ein Panzer rücken aus einer anderen Richtung auf das Ziel vor und greifen mit an. Stufe 2 bringt mehr Kameraden, einen Raketenwerfer und einen Geschützwagen mit.' },
  { id: 'jets', group: 'Unterstützung', name: 'Kampfjets', prices: [800, 900], desc: 'Taste 6 beim Angriff: Zwei Kampfjets fliegen das Ziel mehrmals an, mit Raketen, Bordkanone und Bombe, drehen ab und greifen wieder an. Stufe 2 fliegt einen Anflug mehr und ist schneller wieder bereit.' },
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
FL.KIND_NAMES = { attack: 'Angriff: Basis erobern', defend: 'Verteidigung der eigenen Basis', flight: 'Luftangriff im Kampfflugzeug', heli: 'Hubschrauber: Bodentruppen unterstützen', tank: 'Panzer-Einsatz' };
FL.CAREER = [
  { kind: 'attack', theme: 'wald', tier: 0, sections: 2, reward: 200, name: 'Das Waldlager', text: 'Ein kleines Militärlager mit Zaun, Wachtürmen und Fuhrpark. Tippe auf den Boden, um dorthin zu laufen, und zerstöre Wachtürme, MG-Nester und Gebäude. Deine Ausrüstung ist noch schwach: Nutze Hügel und Deckung!' },
  { kind: 'defend', theme: 'wald', tier: 0.5, waves: 3, reward: 220, name: 'Gegenangriff', text: 'Der Gegner will das Lager zurück. Halte deine Basis gegen drei Angriffswellen. Jeder Durchbruch schwächt die Basis.' },
  { kind: 'flight', theme: 'wald', tier: 1, reward: 260, name: 'Treibstofflager', text: 'Steig ins Kampfflugzeug. Zerstöre die markierten Tanks und Bunker mit Bomben und weiche dem Flak-Feuer aus.' },
  { kind: 'attack', theme: 'wueste', tier: 1.5, sections: 3, reward: 300, name: 'Der Wüstenstützpunkt', text: 'Ein Stützpunkt in der Wüste mit Bunkern, Hangar und Tanklager. Der Gegner schickt jetzt Elite-Soldaten und Jeeps.' },
  { kind: 'tank', theme: 'wueste', tier: 1.5, reward: 320, name: 'Panzervorstoß', text: 'Fahr mit deinem Panzer durch die Wüste und zerstöre alle markierten Ziele. Achte auf gegnerische Panzer und Geschütze.' },
  { kind: 'defend', theme: 'wueste', tier: 2, waves: 4, reward: 340, name: 'Sandsturm', text: 'Vier Wellen mit Raketen-Soldaten und Panzern rollen auf deine Basis zu. Türme und MG-Nester helfen.' },
  { kind: 'flight', theme: 'industrie', tier: 2.5, reward: 380, name: 'Der Flugplatz', text: 'Greife den gegnerischen Flugplatz an: Hangars, Radar und Tower. Jetzt steigen auch feindliche Jäger auf.' },
  { kind: 'attack', theme: 'industrie', tier: 3, sections: 3, reward: 420, name: 'Die Fabrik', text: 'Eine große Basis neben der Fabrik mit Geschütztürmen, Schornstein und Tanklager. Schwere Soldaten und Panzer verteidigen sie.' },
  { kind: 'tank', theme: 'winter', tier: 3, reward: 440, name: 'Eisfront', text: 'Panzer-Einsatz im Schnee: Radarstationen, Depots und das Hauptgebäude müssen fallen.' },
  { kind: 'defend', theme: 'winter', tier: 3.5, waves: 5, reward: 480, name: 'Winterschlacht', text: 'Fünf Wellen im Schnee. Der Gegner bringt alles mit, was er hat.' },
  { kind: 'flight', theme: 'daemmerung', tier: 4, reward: 520, name: 'Angriff in der Dämmerung', text: 'Letzter Luftschlag vor dem Sturm auf das Hauptquartier: Zerstöre die Luftabwehr der Festung.' },
  { kind: 'attack', theme: 'daemmerung', tier: 4.5, sections: 4, reward: 800, name: 'Das Hauptquartier', text: 'Die größte Basis des Gegners. Erobere sie und die Karriere ist geschafft!' }
];

// ---------------------------------------------------------------- Sondereinsätze für Kampfflugzeug und Panzer
// sc beschreibt, was den Einsatz besonders macht (siehe flight.js und tank.js):
//   Flugzeug: prim = Liste der Zielgebäude, flak = zusätzliche Flak, flakPrim = Flak ist das Ziel, jets = { n: gleichzeitig, cd: Abstand, need: Abschüsse },
//             goal: 'jets' = Jäger abschießen, time = Zeitlimit in Sekunden, fuel = Treibstoff-Faktor
//   Panzer:   camps = Anzahl Lager, tanks = Anzahl Panzer, turrets = zusätzliche Geschütze je Lager, turretPrim = Geschütze sind das Ziel,
//             goal: 'tanks' = alle Panzer zerstören, time = Zeitlimit, crates = Reparaturkisten
FL.SCENARIOS = [
  { id: 'f1', kind: 'flight', theme: 'winter', tier: 1.5, reward: 280, name: 'Blinde Augen',
    lage: 'Der Gegner hat im Schnee eine Kette von Radarstationen aufgebaut. Solange sie stehen, sieht er jedes unserer Flugzeuge schon von weitem.',
    auftrag: 'Zerstöre alle vier Radarstationen. Danach fliegst du zurück und landest selbst auf der eigenen Bahn.',
    gefahr: 'Mehrere Flak-Stellungen schützen die Stationen.', tipp: 'Radarschüsseln sind klein: Bomben aus niedriger Höhe treffen am besten.',
    sc: { seed: 11, prim: ['radar', 'radar', 'radar', 'radar'], flak: 1 } },
  { id: 'f2', kind: 'flight', theme: 'wald', tier: 2, reward: 320, name: 'Abfangjagd',
    lage: 'Feindliche Jäger sind auf dem Weg zu unserer Basis. Es ist niemand sonst in der Luft.',
    auftrag: 'Schieß vier Jäger ab, bevor sie durchbrechen. Gebäude sind diesmal kein Ziel.',
    gefahr: 'Es kommen immer zwei Jäger gleichzeitig, und sie schießen zurück.', tipp: 'Flieg auf einen Jäger zu, bis der grüne Ring erscheint, dann feuern. Kurven hilft gegen ihre Schüsse.',
    sc: { seed: 23, goal: 'jets', prim: [], flakPrim: false, jets: { n: 2, cd: 8, need: 4 } } },
  { id: 'f3', kind: 'flight', theme: 'wueste', tier: 2, reward: 340, name: 'Nachschublinie',
    lage: 'In der Wüste lagert der Gegner Treibstoff und Munition für seinen nächsten Angriff.',
    auftrag: 'Zerstöre alle sechs Depots. Du hast dafür nur vier Minuten in der Luft.',
    gefahr: 'Die Zeit läuft, sobald du abgehoben hast.', tipp: 'Mit Nachbrenner bist du schneller am Ziel, aber der Treibstoff ist schneller leer.',
    sc: { seed: 5, prim: ['depot', 'depot', 'depot', 'depot', 'depot', 'depot'], time: 240 } },
  { id: 'f4', kind: 'flight', theme: 'wueste', tier: 3, reward: 400, name: 'Flak-Gürtel',
    lage: 'Ein dichter Ring aus Flugabwehr sperrt den Luftraum. Unsere Bomber kommen nicht durch.',
    auftrag: 'Schalte alle Flak-Stellungen aus. Nur sie sind diesmal das Ziel.',
    gefahr: 'Sehr viel Flak-Feuer aus allen Richtungen.', tipp: 'Hoch anfliegen, kurz vor dem Ziel abtauchen und nie lange geradeaus fliegen.',
    sc: { seed: 31, prim: [], flakPrim: true, flak: 4 } },
  { id: 'f5', kind: 'flight', theme: 'daemmerung', tier: 2.5, reward: 420, name: 'Blitzangriff',
    lage: 'Der gegnerische Stab trifft sich in der Dämmerung in einem Hauptquartier. In wenigen Minuten ist er wieder weg.',
    auftrag: 'Zerstöre das Hauptquartier und die zwei Bunker daneben. Zeit: zweieinhalb Minuten.',
    gefahr: 'Wenig Zeit und wenig Treibstoff.', tipp: 'Flieg direkt hin. Raketen aus dem Laden sparen einen zweiten Anflug.',
    sc: { seed: 8, prim: ['hq', 'bunker', 'bunker'], flakPrim: false, time: 150, fuel: 0.8 } },
  { id: 'f6', kind: 'flight', theme: 'winter', tier: 3.5, reward: 480, name: 'Luftherrschaft',
    lage: 'Über der Eisfront kreist ein ganzes Geschwader des Gegners.',
    auftrag: 'Schieß sieben Jäger ab und hol dir die Luftherrschaft zurück.',
    gefahr: 'Bis zu drei Jäger gleichzeitig, dazu Flak vom Boden.', tipp: 'Bleib hoch, dort trifft die Flak schlechter. Eine starke Bordkanone lohnt sich.',
    sc: { seed: 41, goal: 'jets', prim: [], flakPrim: false, jets: { n: 3, cd: 6, need: 7 } } },
  { id: 'f7', kind: 'flight', theme: 'industrie', tier: 3.5, reward: 500, name: 'Am Boden zerstört',
    lage: 'Auf einem Flugplatz stehen die Maschinen des Gegners noch in den Hangars.',
    auftrag: 'Zerstöre alle fünf Hangars und den Tower, bevor die Flugzeuge starten können.',
    gefahr: 'Einige Jäger sind schon in der Luft.', tipp: 'Hangars sind groß: Bomben aus mittlerer Höhe reichen. Erst die Jäger, dann die Hangars.',
    sc: { seed: 3, prim: ['hangar', 'hangar', 'hangar', 'hangar', 'hangar', 'tower'], jets: { n: 2, cd: 16 } } },
  { id: 'f8', kind: 'flight', theme: 'daemmerung', tier: 5, reward: 700, name: 'Operation Donnerschlag',
    lage: 'Die letzte große Festung des Gegners: Hauptquartier, Radar, Hangars, Depots und Bunker auf engem Raum.',
    auftrag: 'Zerstöre alle zehn Ziele. Das ist der schwerste Luftangriff von allen.',
    gefahr: 'Dichte Flak und bis zu drei Jäger gleichzeitig.', tipp: 'Bau vorher das Flugzeug voll aus. Flak-Stellungen zuerst, dann wird es ruhiger.',
    sc: { seed: 17, prim: ['hq', 'hq', 'radar', 'radar', 'hangar', 'hangar', 'depot', 'depot', 'bunker', 'bunker'], flakPrim: false, flak: 3, jets: { n: 3, cd: 12 } } },

  { id: 'f9', kind: 'flight', theme: 'wald', tier: 2, reward: 420, name: 'Blockadebrecher',
    lage: 'Vor der Küste kreuzen drei gegnerische Kriegsschiffe und sperren den Hafen. An Land steht nur eine kleine Flak-Stellung.',
    auftrag: 'Versenke alle drei Schiffe.',
    gefahr: 'Die Schiffe fahren und schießen mit ihrer Bordflak zurück, sobald du näher als etwa 400 m kommst.', tipp: 'Flieg in Fahrtrichtung über das Schiff und wirf die Bombe etwas früher. Raketen und Bordkanone treffen auch aus der Ferne.',
    sc: { seed: 21, ships: { n: 3, big: 1 }, flak: -1 } },
  { id: 'f10', kind: 'flight', theme: 'daemmerung', tier: 4, reward: 650, name: 'Seeschlacht',
    lage: 'Ein ganzer Flottenverband ist unterwegs: zwei Zerstörer und vier Schnellboote. Jäger decken ihn aus der Luft.',
    auftrag: 'Versenke alle sechs Schiffe.',
    gefahr: 'Sechs Schiffe mit Flak und bis zu zwei Jäger gleichzeitig.', tipp: 'Erst die Schnellboote am Rand, dann die großen Zerstörer. Die brauchen mehr als einen Treffer.',
    sc: { seed: 33, ships: { n: 6, big: 2 }, flakPrim: false, jets: { n: 2, cd: 14 } } },
  { id: 'f11', kind: 'flight', theme: 'wald', tier: 1.5, reward: 420, name: 'Sturm auf die Waldbasis',
    lage: 'Unsere Panzer und Soldaten greifen eine Basis im Wald an. Davor hat der Gegner Panzer, Fahrzeuge und Trupps aufgestellt. Allein kommen unsere Leute nicht durch.',
    auftrag: 'Unterstütze die Bodentruppen aus der Luft: Schalte alle Panzer, Fahrzeuge und Trupps vor der Basis aus und zerstöre die Kommandozentrale.',
    gefahr: 'Die Anzeige „Eigene Truppen“ sinkt, solange der Gegner schießt. Ist sie leer, ist der Einsatz verloren. Dazu etwas Flak.', tipp: 'Panzer mit Bomben, Trupps und Fahrzeuge mit der Bordkanone. Die eigenen Truppen sind auf der Karte hellblau, ihnen passiert durch deine Bomben nichts.',
    sc: { seed: 61, biome: 'wald', prim: ['hq'], flak: -1, flakPrim: false, support: { foes: { tanks: 3, jeeps: 2, squads: 3 }, own: { tanks: 3, squads: 3 }, last: 125 } } },
  { id: 'f12', kind: 'flight', theme: 'wueste', tier: 3, reward: 600, name: 'Wüstenoffensive',
    lage: 'Großangriff auf die Wüstenfestung. Der Gegner wirft alles in die Schlacht, was er hat, und seine Jäger sind auch in der Luft.',
    auftrag: 'Hilf den Bodentruppen, die Festung einzunehmen: alle Panzer, Fahrzeuge und Trupps ausschalten, dazu Kommandozentrale und Bunker.',
    gefahr: 'Fünf Panzer, viele Fahrzeuge und Trupps, Flak und Jäger. Unsere Truppen halten nicht lange durch.', tipp: 'Zuerst die Panzer: Sie machen den größten Schaden an unseren Truppen. Raketen suchen sich ihr Ziel selbst.',
    sc: { seed: 67, biome: 'wueste', prim: ['hq', 'bunker'], flakPrim: false, jets: { n: 1, cd: 40 }, support: { foes: { tanks: 5, jeeps: 4, squads: 4 }, own: { tanks: 4, squads: 4 }, last: 125 } } },

  { id: 'h1', kind: 'heli', theme: 'wald', tier: 0.5, reward: 300, name: 'Luftunterstützung',
    lage: 'Unsere Soldaten und Panzer greifen ein kleines Lager im Wald an. Der Gegner hat sich davor eingegraben.',
    auftrag: 'Flieg mit dem Kampfhubschrauber hin und hilf den Bodentruppen: Schalte Trupps, Fahrzeuge und Panzer aus und zerstöre die markierten Gebäude.',
    gefahr: 'Eine Flak und die Waffen der Gegner am Boden. Wer dich sieht, visiert dich an und schießt nach kurzer Zeit.', tipp: 'Bleib hinter einem Hügel oder Waldstück, steig kurz auf, schieß und tauch wieder ab. Oben links steht, ob du in Deckung bist.',
    sc: { seed: 3, prim: ['depot'], flak: 1, hills: 7, woods: 5, support: { foes: { tanks: 1, jeeps: 1, squads: 3 }, own: { tanks: 2, squads: 2 }, last: 170 } } },
  { id: 'h2', kind: 'heli', theme: 'winter', tier: 1.5, reward: 400, name: 'Durch das Tal',
    lage: 'Die gegnerische Stellung liegt hinter einem Tal in den Bergen. Auf freier Fläche sieht dich die Flak sofort.',
    auftrag: 'Flieg tief durch das Tal bis zur Stellung und unterstütze unsere Truppen beim Angriff.',
    gefahr: 'Drei Flak-Geschütze, Panzer und Fahrzeuge.', tipp: 'Im Tal bist du unsichtbar. Schalte zuerst die Flak aus: aufsteigen, Raketen los, abtauchen.',
    sc: { seed: 9, valley: true, prim: ['hq', 'depot'], flak: 3, hills: 6, woods: 3, support: { foes: { tanks: 2, jeeps: 2, squads: 3 }, own: { tanks: 3, squads: 3 }, last: 160 } } },
  { id: 'h3', kind: 'heli', theme: 'wueste', tier: 2.5, reward: 500, name: 'Panzerjäger',
    lage: 'Eine Panzerkompanie des Gegners stellt sich unseren Truppen in den Dünen entgegen. Ohne Hilfe aus der Luft kommen sie nicht vorbei.',
    auftrag: 'Zerstöre alle Panzer und Fahrzeuge und hilf den Bodentruppen, die Stellung zu nehmen.',
    gefahr: 'Fünf Panzer. Sie schießen auch auf Hubschrauber, die tief fliegen.', tipp: 'Raketen sind die beste Waffe gegen Panzer. Hinter den Dünen laden sie in Ruhe nach.',
    sc: { seed: 15, prim: ['bunker'], flak: 2, hills: 10, woods: 0, support: { foes: { tanks: 5, jeeps: 2, squads: 2 }, own: { tanks: 4, squads: 3 }, last: 160 } } },
  { id: 'h4', kind: 'heli', theme: 'daemmerung', tier: 4, reward: 700, name: 'Sturm in der Dämmerung',
    lage: 'Der große Angriff auf die Festung beginnt bei Sonnenuntergang. Alle verfügbaren Truppen sind dabei.',
    auftrag: 'Unterstütze den Angriff, bis die Festung eingenommen ist: alle Truppen des Gegners, die Kommandozentrale, das Depot und der Hangar.',
    gefahr: 'Vier Flak-Geschütze, viele Panzer, Fahrzeuge und Trupps. Sie visieren schneller an als sonst.', tipp: 'Nie lange oben bleiben. Am Landeplatz wird der Hubschrauber repariert: Lieber einmal zurückfliegen als abgeschossen werden.',
    sc: { seed: 27, valley: true, prim: ['hq', 'depot', 'hangar'], flak: 4, hills: 8, woods: 4, support: { foes: { tanks: 4, jeeps: 4, squads: 5 }, own: { tanks: 4, squads: 5 }, last: 170 } } },

  { id: 't1', kind: 'tank', theme: 'wald', tier: 0.5, reward: 260, name: 'Spähtrupp',
    lage: 'Im Wald wurden zwei kleine Lager des Gegners gemeldet. Niemand weiß genau, was dort steht.',
    auftrag: 'Fahr hin und zerstöre die markierten Ziele in beiden Lagern.',
    gefahr: 'Je ein Geschütz pro Lager und ein einzelner Panzer.', tipp: 'Ein guter Einsatz zum Üben: Turm drehen, während der Panzer weiterfährt.',
    sc: { seed: 7, camps: 2, tanks: 1 } },
  { id: 't2', kind: 'tank', theme: 'wueste', tier: 2, reward: 340, name: 'Panzerschlacht',
    lage: 'Eine gegnerische Panzerkompanie rollt durch die Wüste auf unsere Stellungen zu.',
    auftrag: 'Zerstöre alle sechs Panzer. Gebäude sind diesmal egal.',
    gefahr: 'Mehrere Panzer greifen gleichzeitig an.', tipp: 'Bleib in Bewegung und nimm dir immer nur einen Panzer vor. Reparaturkisten merken!',
    sc: { seed: 13, goal: 'tanks', tanks: 6 } },
  { id: 't3', kind: 'tank', theme: 'winter', tier: 2, reward: 360, name: 'Wettlauf im Schnee',
    lage: 'Ein Schneesturm zieht auf. Danach ist kein Durchkommen mehr.',
    auftrag: 'Zerstöre alle Ziele in drei Lagern, bevor der Sturm da ist. Zeit: fünf Minuten.',
    gefahr: 'Die Uhr läuft von Anfang an.', tipp: 'Nicht an jedem Geschütz aufhalten: Nur die markierten Ziele zählen.',
    sc: { seed: 19, camps: 3, time: 300 } },
  { id: 't4', kind: 'tank', theme: 'wueste', tier: 3, reward: 420, name: 'Geschützstellungen',
    lage: 'Schwere Geschütze des Gegners beschießen unsere Straße. Kein Lastwagen kommt mehr durch.',
    auftrag: 'Schalte alle Geschütze aus. Nur die Geschütze sind das Ziel.',
    gefahr: 'Jedes Lager hat vier Geschütze, und alle schießen auf dich.', tipp: 'Von außen anfangen und nie mitten ins Lager fahren. Artillerie und Bomber helfen sehr.',
    sc: { seed: 29, camps: 3, turrets: 2, turretPrim: true } },
  { id: 't5', kind: 'tank', theme: 'industrie', tier: 3.5, reward: 480, name: 'Stahlgewitter',
    lage: 'Im Industriegebiet hat der Gegner seine Panzerreserve versteckt.',
    auftrag: 'Zerstöre alle neun Panzer.',
    gefahr: 'Viele starke Panzer und Geschütze in den Lagern.', tipp: 'Lock die Panzer einzeln aus den Lagern heraus, weg von den Geschützen.',
    sc: { seed: 37, goal: 'tanks', tanks: 9 } },
  { id: 't6', kind: 'tank', theme: 'daemmerung', tier: 3, reward: 500, name: 'Hinter den Linien',
    lage: 'Du bist allein weit hinter der Front. Nachschub gibt es hier nicht.',
    auftrag: 'Zerstöre die Ziele in allen fünf Lagern.',
    gefahr: 'Es gibt nur eine einzige Reparaturkiste im ganzen Gebiet.', tipp: 'Jeder Treffer zählt doppelt, wenn man kaum reparieren kann. Unterstützung früh rufen.',
    sc: { seed: 43, camps: 5, crates: 1 } },
  { id: 't7', kind: 'tank', theme: 'winter', tier: 4, reward: 560, name: 'Kesselschlacht',
    lage: 'Der Gegner hat sich in vier Lagern eingegraben und verteidigt sie mit allem, was er hat.',
    auftrag: 'Zerstöre alle markierten Ziele.',
    gefahr: 'Acht Panzer und zusätzliche Geschütze in jedem Lager.', tipp: 'Panzerung und Ladeautomatik vorher ausbauen. Hubschrauber-Begleitung lohnt sich.',
    sc: { seed: 47, camps: 4, tanks: 8, turrets: 1 } },
  { id: 't8', kind: 'tank', theme: 'daemmerung', tier: 5, reward: 750, name: 'Endspiel',
    lage: 'Die letzte Verteidigungslinie vor dem Hauptquartier. Wenn sie fällt, ist der Weg frei.',
    auftrag: 'Zerstöre die Ziele in allen fünf Lagern in acht Minuten.',
    gefahr: 'Zehn Panzer, viele Geschütze und ein Zeitlimit.', tipp: 'Der schwerste Panzer-Einsatz. Ohne voll ausgebauten Panzer und Unterstützung wird es sehr eng.',
    sc: { seed: 53, camps: 5, tanks: 10, turrets: 1, time: 480 } }
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
