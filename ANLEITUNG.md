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
- **Unterstützung:** Drohnen, Kampfhubschrauber, Kampfbomber, Artillerie, Begleit-Panzer, Raketenwerfer
- **Basis:** Geschütze (in der eigenen Basis feste Geschütztürme, beim Angriff fahren sie als Geschützwagen mit), MG-Nester, Bunker, Sanitätszelt, Radar
- **Flugzeug:** Panzerung, Bordkanone, Bomben, Triebwerk, Raketen
- **Panzer:** Panzerung, Kanone, Ladeautomatik, Motor

Geschaffte Einsätze kannst du wiederholen, um Münzen zu sammeln (die Prämie ist dann kleiner).

## Freies Spiel

Hier stellst du alles selbst ein: Art des Einsatzes (auch Flugzeug und Panzer), Landschaft, Stärke der Gegner, Schwierigkeit, Länge und jede einzelne Ausrüstung. Dann auf „Sofort spielen“. Im freien Spiel gibt es keine Münzen.

## Steuerung

| Einsatz | Tasten |
| --- | --- |
| Bodenkampf | ← → bewegen, Leertaste schießen, ↓ Deckung, E Kameraden aufhelfen oder Fahrzeuge reparieren, X Geschütze abfeuern, T Geschütze an/aus, 1 2 3 4 Drohnen, Hubschrauber, Bomber, Artillerie, V vorrücken |
| Kampfflugzeug | wie ein Steuerknüppel: ← → lenken, ↓ ziehen = Nase hoch, ↑ drücken = Nase runter, Leertaste Bordkanone, B Bombe, R Raketen, G Fahrwerk ein/aus, Umschalt halten = Nachbrenner |
| Panzer | ↑ ↓ fahren, ← → lenken, A D Turm drehen, W Turm nach vorn, Leertaste Kanone, 1 2 3 4 Unterstützung anfordern: Drohnen, Hubschrauber, Bomber, Artillerie |
| Immer | P oder Esc Pause, M Ton an/aus |

## Tipps

- Ein Flug-Einsatz beginnt in deiner Flugbasis: Bei Alarm läufst du zum Flugzeug (blauer Kreis), rollst zur Startbahn (↑ Gas, ↓ bremsen, ← → lenken), hältst ↑ für Vollgas und ziehst bei genug Tempo mit ↓ hoch. Sind alle Ziele zerstört, fliegst du zurück und in Richtung Landebahn durch einen der blauen Ringe. Dann landet die Landehilfe das Flugzeug. Danach rollst du zum Parkplatz und gehst ins Basisgebäude. Erst dann ist der Einsatz gewonnen.
- Im Flugzeug zeigt der gelbe Kreis am Boden, wo die Bombe einschlägt. Wirf sie ab, wenn der Kreis über dem rot markierten Ziel liegt. Gegen die Flak hilft: Kurven fliegen und die Höhe wechseln. Bei jedem Abwurf zeigt die Bomben-Kamera links im Bild, wie die Bombe fällt und ob sie trifft.
- Im Panzer kannst du Unterstützung anfordern, wenn du sie im Laden gekauft hast: Drohnen suchen sich Ziele in der Nähe, der Kampfhubschrauber begleitet dich eine Weile, Kampfbomber und Artillerie treffen die Stelle, auf die deine Kanone gerade zielt.
- Im Panzer rastet das rote Fadenkreuz auf ein Ziel ein, wenn du ungefähr in die Richtung zielst. Bleib in Bewegung, dann wirst du seltener getroffen. Kisten mit Schraubenschlüssel reparieren den Panzer.
- Vor der gegnerischen Basis zielt dein Soldat von selbst auf das nächste Gebäude, wenn kein Gegner vor ihm steht.
- Wenn das Spiel ruckelt: im Hauptmenü bei „Grafik“ auf „schnell“ stellen.

## Sondereinsätze

Im Hauptmenü gibt es 24 Sondereinsätze: zwölf für das Kampfflugzeug, vier für den Hubschrauber und acht für den Panzer. Vor jedem Start kommt ein Briefing mit Lage, Auftrag, Gefahren und Tipp. Alle sind von Anfang an offen und werden mit der Ausrüstung aus der Karriere gespielt. Es gibt Einsätze mit Zeitlimit, reine Luftkämpfe gegen Jäger, Jagd auf Flak-Stellungen, Panzerschlachten und Einsätze mit kaum Reparaturkisten.

Je besser Flugzeug oder Panzer ausgebaut sind, desto mehr hält der Gegner dagegen: mehr Flak, mehr und stärkere Panzer und Jäger. Im freien Spiel gibt es zusätzlich die Schwierigkeiten „Sehr schwer“ und „Extrem“.

## Selbst landen

Wenn alle Ziele zerstört sind, fliegst du zurück zur Basis. Die blauen Ringe zeigen, wo der Anflug beginnt. Dann:

1. Fahrwerk ausfahren (G oder Knopf „Fahrwerk“).
2. In Richtung der Landebahn fliegen und langsam sinken. Oben in der Mitte steht, ob du zu hoch oder zu tief bist.
3. Auf der Bahn aufsetzen. Das Flugzeug bremst dann von selbst, und du rollst zum Parkplatz.

Wer neben der Bahn, schräg oder zu spät aufsetzt, startet automatisch durch und versucht es noch einmal. Sehr steiles Aufsetzen oder Landen ohne Fahrwerk kostet Panzerung.

## Panzer auf dem iPad

- Tippen irgendwo auf den freien Bildschirm feuert einen Schuss.
- Nach links oder rechts wischen dreht den Turm. Der Knopf „Mitte“ stellt ihn wieder geradeaus.
- Nach oben wischen hebt die Kanone, nach unten wischen senkt sie. Das Zielkreuz wandert dabei weiter weg oder näher heran (oben links steht die „Zielweite“). Steht die Kanone zu tief, reicht der Schuss nicht bis zu weit entfernten Zielen.
- Am PC: R und F oder das Mausrad für die Kanone, Mausklick oder Leertaste für den Schuss.

## Flugzeug: Schub, Fahrwerk und Zielhilfe

- Das Flugzeug steigt jetzt bis 6000 m. Oben ist man vor der Flak sicherer, unten trifft man leichter.
- Schub: Im Leerlauf fliegt es nur etwa 270 km/h, mit vollem Schub 840, mit Nachbrenner 1300. Das Tempo steht oben links.
- Beim Rollen bleibt der Horizont waagerecht, nur das Flugzeug dreht sich.
- Zielhilfe: Liegt ein Ziel ungefähr voraus, erscheint ein grüner Ring darauf. Die Bordkanone trifft dann genau dieses Ziel, auch wenn die Nase nicht exakt darauf zeigt.
- Fahrwerk: Nach dem Abheben mit G (iPad: Knopf „Fahrwerk“) einfahren, sonst bleibt das Flugzeug langsam. Vor der Landung wieder ausfahren, sonst gibt es eine Bauchlandung und die kostet Panzerung.
- Nachbrenner: macht das Flugzeug viel schneller, verbraucht aber mehr als doppelt so viel Treibstoff.
- iPad mit Neigesteuerung: Links erscheint ein Schubhebel. Ganz unten ist Leerlauf, im orangen Feld ganz oben zündet der Nachbrenner. Der Hebel gilt beim Rollen, Starten, Fliegen und Landen. Auf dem freien Bildschirm nach unten wischen wirft eine Bombe, nach oben wischen feuert die Raketen.

## Frei fliegen: Looping, Rolle, Rückenflug

- Das Flugzeug lässt sich in alle Richtungen steuern. Ziehen (Pfeil runter, Knüppel nach hinten, iPad zu sich kippen) hebt die Nase, und zwar immer aus Sicht des Flugzeugs. Wer weiter zieht, fliegt einen Looping.
- Leicht nach links oder rechts: Schräglage und Kurve. Für die Rolle um die Längsachse gibt es Q und E (iPad: die Knöpfe „Rolle ◀“ und „Rolle ▶“, mit Neigesteuerung auch das iPad sehr weit zur Seite kippen). Lässt man auf dem Rücken los, fliegt es auf dem Rücken weiter.
- Steil nach oben kostet Tempo, im Sturzflug wird das Flugzeug schneller. Kurz vor dem Boden fängt es sich von selbst ab („Abfangen!“), abstürzen kann man dadurch nicht.
- Bordkanone: irgendwo auf den freien Bildschirm tippen oder den Finger halten (am PC Mausklick oder Leertaste). Wischen nach unten wirft weiter die Bombe, nach oben die Raketen.

## Einsatzorte

Der Einsatzort liegt bei jedem Flug woanders: 1,5 bis 2,6 km von der Basis entfernt, in einer zufälligen Richtung und in einer von vier Landschaften (Berge, Wald, Meer, Wüste). Nach dem Start steht oben die Richtung und Entfernung, auf dem Radar zeigt ein gelber Ring den Einsatzort, der grüne Punkt ist die eigene Basis.

## Basis verteidigen: Rundumsicht

Die Verteidigung ist neu gebaut. Deine Basis liegt mitten auf einem offenen Feld und du stehst im Sandsackring in der Mitte.

- Umsehen: Pfeil links und rechts (iPad: über den Bildschirm wischen oder die Pfeil-Knöpfe). Du kannst dich ganz im Kreis drehen.
- Die Gegner kommen von zwei Seiten gleichzeitig, in späteren Wellen von drei oder vier. Zu Beginn jeder Welle steht da, aus welchen Himmelsrichtungen.
- Radar oben rechts: Deine Blickrichtung zeigt nach oben. Rot sind Gegner am Boden, pink sind Hubschrauber und Flugzeuge, gelbe Ringe am Rand zeigen, von wo die Welle kommt. Oben in der Mitte zeigt ein Pfeil zum nächsten Gegner.
- Schießen: Leertaste, Mausklick oder FEUER. Die Waffe rastet auf den Gegner ein, der am nächsten an deiner Blickrichtung liegt, auch auf Ziele in der Luft.
- Hubschrauber kreisen um die Basis und schießen Raketen. Flugzeuge fliegen zweimal darüber und werfen Bomben. Beide kann man abschießen.
- Die Gegner bleiben vor der Basis stehen und beschießen sie. Fällt der Balken „Basis“ auf null, ist der Einsatz verloren. Nach jeder Welle wird die Basis etwas ausgebessert.
- Kameraden, MG-Nester, Panzer und Raketenwerfer schießen von selbst. X feuert die Geschütze, 1 bis 4 rufen Drohnen, Hubschrauber, Bomber (fliegt in deine Blickrichtung) und Artillerie.

## Angriff: Trupp nach links oder rechts schicken

Beim Angriff verschiebt Q den Trupp nach links und R nach rechts (iPad: Knöpfe „Trupp ◀“ und „Trupp ▶“). Die Kameraden gehen dann seitlich nach vorn und schießen schräg über die Straße. Dieses Kreuzfeuer trifft härter, und an der gegnerischen Basis greifen sie die Türme und Mauern an der Seite an. Noch einmal in die Gegenrichtung drücken holt sie zurück in die Mitte.

## Schiffe angreifen

Unter „Sondereinsätze“ gibt es zwei neue Flüge aufs Meer: „Blockadebrecher“ (drei Schiffe) und „Seeschlacht“ (sechs Schiffe und Jäger). Die Schiffe fahren, schießen mit Bordflak und sinken, wenn sie genug Treffer haben. Zerstörer halten mehr aus als Schnellboote. Auch bei normalen Flügen ans Meer liegen zwei Schiffe vor der Küste.

## Landen mit Landeklappen

- Taste F (iPad: Knopf „Klappen“) fährt die Landeklappen aus. Damit fliegt das Flugzeug langsamer und trägt auch bei wenig Tempo noch.
- Wer zu langsam wird, sinkt: Ohne Klappen ab etwa 350 km/h, mit Klappen erst ab etwa 310 km/h. Nimmst du über der Bahn den Schub ganz weg und hebst die Nase leicht an, setzt das Flugzeug von selbst auf.
- Zeigt die Nase beim Aufsetzen etwas nach oben, berühren die Hinterräder zuerst den Boden und die Nase senkt sich danach. Dafür gibt es die Meldung „Hinterräder zuerst: saubere Landung!“.
- Beim Rückflug zur Basis ist der Bombenzielkreis ausgeblendet. Fliegst du langsam oder hoch, schaut die Kamera steiler nach unten, damit Flugzeug und Zielkreis beide im Bild bleiben.

## Bodentruppen aus der Luft unterstützen

Unter „Sondereinsätze“ gibt es beim Kampfflugzeug die Einsätze „Sturm auf die Waldbasis“ und „Wüstenoffensive“. Eigene Panzer und Soldaten greifen dort eine Basis an, davor stehen Panzer, Fahrzeuge und Trupps des Gegners. Alle haben eine Zielmarke. Die Anzeige „Eigene Truppen“ oben in der Mitte sinkt, solange der Gegner schießt. Ist sie leer, ist der Einsatz verloren. Panzer triffst du am besten mit Bomben oder Raketen, Trupps und Fahrzeuge mit der Bordkanone. Die eigenen Truppen sind auf der Karte hellblau und werden von deinen Bomben nicht getroffen.

## Hubschrauber

Unter „Sondereinsätze“ gibt es den neuen Reiter „Hubschrauber“ mit vier Einsätzen, im freien Spiel die Einsatzart „Hubschrauber“. Du startest auf dem Landeplatz, fliegst zum Einsatzort und hilfst den eigenen Bodentruppen, eine Basis einzunehmen. Danach fliegst du zurück und landest wieder auf dem Landeplatz.

| Was | Tastatur | iPad |
|---|---|---|
| vor und zurück, drehen | Pfeiltasten | Steuerknüppel links |
| hoch und runter | W und S | nach oben oder unten wischen und halten, oder Knöpfe „Hoch“ und „Runter“ |
| seitwärts | A und D | nach links oder rechts wischen und halten, oder Knöpfe „Seite“ |
| Bordkanone | Leertaste oder Mausklick | irgendwo tippen oder halten, Knopf FEUER |
| Raketen | R | Knopf RAKETE |

- Hügel und Waldstücke sind Deckung: Wer dahinter schwebt, wird vom Gegner nicht gesehen. Oben links steht dann „In Deckung“.
- Sieht dich ein Gegner, steht dort „Du wirst anvisiert!“ mit einem roten Balken. Ist der Balken voll, schießt er. Tauchst du vorher wieder ab oder weichst zur Seite aus, geht der Schuss daneben.
- So geht es am besten: hinter einem Hügel aufsteigen, Ziel anvisieren lassen (grüner Ring), schießen, wieder abtauchen.
- Der Hubschrauber stürzt nicht ab. Über Hügel und Baumkronen steigt er von selbst.
- Wer zwischendurch auf dem Landeplatz landet, wird repariert.
- Die Ausbauten für das Flugzeug (Panzerung, Bordkanone, Triebwerk, Raketen) gelten auch für den Hubschrauber.

## Modelle

Panzer, Geländewagen, Hubschrauber und Flugzeuge sind fertige 3D-Modelle von Sketchfab (SPz Puma, T-62, Humvee, Apache, Eurofighter und ein moderner Kampfjet). Dazu kommen Bäume, Palmen, Zelte, Radar und Wachtürme von Sketchfab. Beim ersten Start eines Einsatzes werden sie kurz geladen. Wer sie gebaut hat und unter welcher Lizenz sie stehen, steht in `LIZENZEN.md` und im Spiel unter „Quellen“ im Hauptmenü.

## Auf dem iPad spielen

Auf dem iPad gibt es Knöpfe auf dem Bildschirm: links zum Bewegen oder Lenken, rechts zum Schießen und für alles andere. Im Flugzeug und im Panzer ist links ein runder Steuerknüppel, den du in jede Richtung ziehen kannst. Das iPad quer halten.

Im Bodenkampf kannst du auch wischen: mit dem Finger nach links oder rechts ziehen bewegt deinen Trupp, nach unten wischen und halten ist Deckung. Die Pfeil-Knöpfe gehen weiterhin.

Das Kampfflugzeug kannst du in der Luft auch durch Neigen steuern, wie mit einem Steuerknüppel: das iPad wie ein Lenkrad nach links oder rechts drehen für Kurven, die Oberkante zu dir ziehen für Nase hoch, von dir weg kippen für Nase runter. Beim ersten Flug fragt das iPad einmal, ob das Spiel den Bewegungssensor benutzen darf. Unten in der Mitte schaltest du mit „Neigen: an/aus“ zwischen Neigen und Steuerknüppel um. Halte das iPad so, wie du bequem fliegen willst, und tippe auf „Kalibrieren“: Diese Haltung ist dann die Mitte, das Flugzeug fliegt geradeaus. Das geht jederzeit, auch mitten im Flug. Der kleine Punkt im Kästchen daneben zeigt, was die Neigung gerade steuert. Kurz vor dem Start kalibriert das Spiel einmal von selbst. Am Boden (laufen und rollen) steuerst du immer mit dem Steuerknüppel.

Am iPad lässt sich die `index.html` nicht per Doppelklick starten. Das Spiel braucht eine Adresse im Internet (zum Beispiel über GitHub Pages). Diese Adresse einmal in Safari öffnen, dann auf „Teilen“ und „Zum Home-Bildschirm“ tippen. Danach hat das Spiel ein eigenes Icon, startet im Vollbild und läuft auch ohne Internet. Der Spielstand auf dem iPad ist getrennt von dem am PC.
