# Ballon-Alarm – so startest du das Spiel

1. Python installieren (Version 3.9 oder neuer): https://www.python.org/downloads/
   Unter Windows beim Installieren das Häkchen bei „Add Python to PATH“ setzen.
2. Ein Terminal öffnen (Windows: „Eingabeaufforderung“, Mac: „Terminal“) und pygame installieren:

       pip install pygame

   (Auf dem Mac ggf. `pip3 install pygame`.)
3. In den Ordner mit `ballon_alarm.py` wechseln und starten:

       python ballon_alarm.py

   (Auf dem Mac ggf. `python3 ballon_alarm.py`.)

## Steuerung

| Taste | Was passiert |
|---|---|
| ← → | Schützen bewegen |
| Leertaste (gedrückt halten) | Seifenblasen schießen |
| X | Kanonentürme feuern |
| T | Kanonentürme an/aus (auch im Startmenü per Klick) |
| P / Esc | Pause |
| M | Ton an/aus |

## Spielregeln

- Ballons (1 Treffer), Roboter (3 Treffer) und Glibber-Blobs (10 Treffer) kommen von oben.
- Mehr Treffer = mehr Schützen: bei 6, 15, 28, 45, 65 und 90 Treffern kommt ein Freund dazu (bis zu 7).
- Bei 20, 40, 65 und 95 Treffern gibt es Kanonentürme (bis zu 4). Sie schießen Glitzersterne, die mehrere Gegner auf einmal erwischen.
- Erreicht ein Gegner den Boden, verlierst du ein Herz. Nach 3 Herzen ist die Runde vorbei.
- Rekord und Einstellungen werden in `~/.ballon_alarm.json` gespeichert.

---

# Frontlinie (Version für ältere Kinder, ca. 10 Jahre)

Starten genauso wie oben, nur mit:

    python frontlinie.py

Du bist der Anführer (schwarze Panzerung, leuchtende Streifen). Gegnerische Soldaten marschieren in 3D-Perspektive auf dich zu. Getroffene Gegner fallen um und verschwinden.

| Taste | Was passiert |
|---|---|
| ← → oder A D | Armee bewegen |
| Leertaste (halten) | schießen |
| X | Kanonentürme feuern |
| T | Kanonentürme an/aus (auch im Startmenü per Klick) |
| P / Esc | Pause |
| M | Ton an/aus |

**Waffen** (nach Treffern): Pistole → Gewehr (12) → Sturmgewehr (35) → Doppel-MG (70) → Plasma-Blaster (120) → Gatling-Laser (190) → Mega-Kanone mit Raketen (280)

**Verstärkung**: Bei 6, 20, 45, 80, 125 und 180 Treffern kommt ein Kamerad dazu (bis zu 7 Soldaten). Kameraden zielen selbst.

**Kanonentürme**: Kanonenturm (30) → zwei Türme (75) → Doppelkanone (140) → Raketenturm mit Zielsuch-Raketen (220) → Mega-Turm (320)

**Gegner**: Rekrut, Soldat, Elite, Schwerer Soldat und Kommandant (rote Mütze) halten immer mehr aus. Es werden mit der Zeit immer mehr, aber nie mehr, als deine Armee schaffen kann. Wer es schwerer oder leichter will, ändert oben in `frontlinie.py` den Wert `SCHWIERIGKEIT` (0.4 leicht, 0.65 normal, 0.9 schwer).

---

# Frontlinie 2 (mit Vorrücken bis zur gegnerischen Basis)

Starten mit:

    python frontlinie2.py

**Ziel:** Rücke über Brücke, Dorf und Bunkerlinie bis zur gegnerischen Basis vor und zerstöre sie. Dann ist das Level geschafft.

| Taste | Was passiert |
|---|---|
| ← → oder A D | bewegen |
| Leertaste (halten) | schießen |
| ↓ oder S (halten) | in Deckung hinter die Sandsäcke (keine Treffer, du erholst dich, schießt aber nicht) |
| E (halten) | umgefallenen Kameraden aufhelfen oder Fahrzeug reparieren (in die Nähe gehen) |
| X | Kanonentürme feuern |
| 1 / 2 / 3 | Drohnen / Luftunterstützung (Kampfhubschrauber) / Kampfbomber |
| V | vorrücken, wenn das Gebiet gesichert ist |
| T | Kanonentürme an/aus |
| P / Esc | Pause |
| M | Ton an/aus |

- **Gegner schießen zurück.** Getroffene Kameraden fallen um und bleiben liegen, bis du sie mit E rettest. Beim Vorrücken stehen alle wieder auf.
- **Die Gegner rüsten auf:** erst Gewehre, dann Maschinengewehre, Raketen-Soldaten, Jeeps und Panzer. Die Basis schießt mit Kanonen.
- **Schweres Gerät:** Ab der Brücke kämpft ein eigener Panzer mit, ab dem Dorf ein Raketenwerfer.
- **Spezialwaffen:** Drohnen ab 15 Treffern, Luftunterstützung ab 60, Kampfbomber ab 110. Sie brauchen lange zum Nachladen.
- **Schwierigkeit:** oben in `frontlinie2.py` steht `SCHWIERIGKEIT = 0.85`. Kleiner = leichter, größer = schwerer. Über 1.0 kann die Armee nicht mehr alle Gegner schaffen.

---

# Frontlinie 3 (Karriere, Kampfflugzeug und Panzer in echtem 3D)

Frontlinie 3 läuft im Browser und braucht kein Python. Öffne den Ordner `frontlinie3` und mach einen Doppelklick auf `index.html`. Es funktioniert auch ohne Internet. Am besten mit Chrome, Edge oder Firefox, und mit F11 im Vollbild.

Der Spielstand (Münzen, gekaufte Ausrüstung, geschaffte Einsätze) wird im Browser gespeichert. Wenn du einen anderen Browser nimmst, beginnt die Karriere dort neu.

## Karriere

Es gibt 12 Einsätze, die nacheinander frei werden: Basen angreifen und erobern, die eigene Basis verteidigen, Luftangriffe im Kampfflugzeug und Panzer-Einsätze. Am Anfang hast du nur eine Pistole und sonst nichts. Für jeden Sieg und für jeden Treffer gibt es Münzen. Damit kaufst du im Laden:

- **Waffen:** von der Pistole bis zur Mega-Kanone
- **Ausrüstung:** Schutzweste, Kameraden, Extra-Leben, Sanitäter-Kit
- **Unterstützung:** Drohnen, Kampfhubschrauber, Kampfbomber, Begleit-Panzer, Raketenwerfer
- **Basis:** Kanonentürme, MG-Nester, Bunker, Sanitätszelt, Radar
- **Flugzeug:** Panzerung, Bordkanone, Bomben, Triebwerk, Raketen
- **Panzer:** Panzerung, Kanone, Ladeautomatik, Motor

Geschaffte Einsätze kannst du wiederholen, um Münzen zu sammeln (die Prämie ist dann kleiner).

## Freies Spiel

Hier stellst du alles selbst ein: Art des Einsatzes (auch Flugzeug und Panzer), Landschaft, Stärke der Gegner, Schwierigkeit, Länge und jede einzelne Ausrüstung. Dann auf „Sofort spielen“. Im freien Spiel gibt es keine Münzen.

## Steuerung

| Einsatz | Tasten |
| --- | --- |
| Bodenkampf | ← → bewegen, Leertaste schießen, ↓ Deckung, E Kameraden aufhelfen oder Fahrzeuge reparieren, X Kanonentürme abfeuern, T Türme an/aus, 1 2 3 Drohnen, Hubschrauber, Bomber, V vorrücken |
| Kampfflugzeug | wie ein Steuerknüppel: ← → lenken, ↓ ziehen = Nase hoch, ↑ drücken = Nase runter, Leertaste Bordkanone, B Bombe, R Raketen |
| Panzer | ↑ ↓ fahren, ← → lenken, A D Turm drehen, W Turm nach vorn, Leertaste Kanone |
| Immer | P oder Esc Pause, M Ton an/aus |

## Tipps

- Ein Flug-Einsatz beginnt in deiner Flugbasis: Bei Alarm läufst du zum Flugzeug (blauer Kreis), rollst zur Startbahn (↑ Gas, ↓ bremsen, ← → lenken), hältst ↑ für Vollgas und ziehst bei genug Tempo mit ↓ hoch. Sind alle Ziele zerstört, fliegst du zurück und in Richtung Landebahn durch einen der blauen Ringe. Dann landet die Landehilfe das Flugzeug. Danach rollst du zum Parkplatz und gehst ins Basisgebäude. Erst dann ist der Einsatz gewonnen.
- Im Flugzeug zeigt der gelbe Kreis am Boden, wo die Bombe einschlägt. Wirf sie ab, wenn der Kreis über dem rot markierten Ziel liegt. Gegen die Flak hilft: Kurven fliegen und die Höhe wechseln. Bei jedem Abwurf zeigt die Bomben-Kamera links im Bild, wie die Bombe fällt und ob sie trifft.
- Im Panzer rastet das rote Fadenkreuz auf ein Ziel ein, wenn du ungefähr in die Richtung zielst. Bleib in Bewegung, dann wirst du seltener getroffen. Kisten mit Schraubenschlüssel reparieren den Panzer.
- Vor der gegnerischen Basis zielt dein Soldat von selbst auf das nächste Gebäude, wenn kein Gegner vor ihm steht.
- Wenn das Spiel ruckelt: im Hauptmenü bei „Grafik“ auf „schnell“ stellen.

## Auf dem iPad spielen

Auf dem iPad gibt es Knöpfe auf dem Bildschirm: links zum Bewegen oder Lenken, rechts zum Schießen und für alles andere. Im Flugzeug und im Panzer ist links ein runder Steuerknüppel, den du in jede Richtung ziehen kannst. Das iPad quer halten.

Im Bodenkampf kannst du auch wischen: mit dem Finger nach links oder rechts ziehen bewegt deinen Trupp, nach unten wischen und halten ist Deckung. Die Pfeil-Knöpfe gehen weiterhin.

Das Kampfflugzeug kannst du in der Luft auch durch Neigen steuern, wie mit einem Steuerknüppel: das iPad wie ein Lenkrad nach links oder rechts drehen für Kurven, die Oberkante zu dir ziehen für Nase hoch, von dir weg kippen für Nase runter. Beim ersten Flug fragt das iPad einmal, ob das Spiel den Bewegungssensor benutzen darf. Unten in der Mitte schaltest du mit „Neigen: an/aus“ zwischen Neigen und Steuerknüppel um. Halte das iPad so, wie du bequem fliegen willst, und tippe auf „Kalibrieren“: Diese Haltung ist dann die Mitte, das Flugzeug fliegt geradeaus. Das geht jederzeit, auch mitten im Flug. Der kleine Punkt im Kästchen daneben zeigt, was die Neigung gerade steuert. Kurz vor dem Start kalibriert das Spiel einmal von selbst. Am Boden (laufen und rollen) steuerst du immer mit dem Steuerknüppel.

Am iPad lässt sich die `index.html` nicht per Doppelklick starten. Das Spiel braucht eine Adresse im Internet (zum Beispiel über GitHub Pages). Diese Adresse einmal in Safari öffnen, dann auf „Teilen“ und „Zum Home-Bildschirm“ tippen. Danach hat das Spiel ein eigenes Icon, startet im Vollbild und läuft auch ohne Internet. Der Spielstand auf dem iPad ist getrennt von dem am PC.
