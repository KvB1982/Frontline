# Frontlinie 3 als iPad- und iPhone-App

Das Spiel bleibt, wie es ist. [Capacitor](https://capacitorjs.com) packt die vorhandenen Dateien in eine echte App. Das Xcode-Projekt liegt fertig im Ordner `ios`.

## Was die App anders macht als der Browser

- Echtes Vollbild ohne Statusleiste, fest im Querformat.
- Die Neigungssteuerung fragt nicht mehr nach Erlaubnis für die Bewegungssensoren.
- Auf dem iPhone vibriert es bei Treffern und Explosionen. iPads haben keinen Vibrationsmotor, dort bleibt es still.
- Alles liegt in der App und läuft ohne Internet.

## Einmal einrichten (auf dem Mac)

Du brauchst:

- **Xcode** aus dem Mac App Store, Version 26 oder neuer. Nach der Installation einmal öffnen und die iOS-Komponenten laden lassen.
- **Node.js** von https://nodejs.org (die Version „LTS“ installieren).
- Ein Kabel, um das iPad mit dem Mac zu verbinden.

Dann im Programm **Terminal**:

```bash
cd ~/Documents
git clone https://github.com/KvB1982/Frontline.git
cd Frontline
npm install
npm run ios
```

`npm run ios` kopiert das Spiel in die App und öffnet Xcode. Beim ersten Öffnen lädt Xcode ein paar Pakete nach. Das dauert ein bis zwei Minuten und braucht Internet.

## In Xcode anmelden und signieren

1. Links oben auf das blaue Symbol **App** klicken, dann in der Mitte unter „Targets“ wieder **App** wählen.
2. Den Reiter **Signing & Capabilities** öffnen.
3. Den Haken bei **Automatically manage signing** setzen.
4. Bei **Team** auf „Add an Account…“ klicken und mit deiner Apple-ID anmelden. Danach das Team auswählen (bei der kostenlosen Variante heißt es „Dein Name (Personal Team)“).
5. Falls Xcode meldet, die Kennung sei vergeben: Bei **Bundle Identifier** `de.kvb1982.frontlinie3` etwas ändern, zum Beispiel hinten eine Zahl anhängen.

**Kostenlose Apple-ID:** Reicht zum Testen auf dem eigenen iPad. Die App läuft dann 7 Tage und muss danach neu aus Xcode gestartet werden. Der Spielstand bleibt dabei erhalten.

**Entwicklerkonto (99 € im Jahr):** Die App läuft ein Jahr, und du kannst sie über TestFlight verteilen und im App Store einreichen.

## Auf dem iPad starten

1. iPad per Kabel anschließen, entsperren und „Diesem Computer vertrauen“ antippen.
2. Auf dem iPad den Entwicklermodus einschalten: **Einstellungen → Datenschutz & Sicherheit → Entwicklermodus**. Das iPad startet danach neu. (Der Punkt erscheint erst, nachdem das iPad einmal mit Xcode verbunden war.)
3. In Xcode oben in der Mitte dein iPad als Ziel auswählen.
4. Auf den Pfeil **▶** klicken oder `⌘R` drücken.
5. Beim ersten Mal mit kostenloser Apple-ID verweigert das iPad den Start. Dann auf dem iPad: **Einstellungen → Allgemein → VPN & Geräteverwaltung**, deine Apple-ID antippen und **Vertrauen** wählen. Danach in Xcode noch einmal auf ▶.

Ohne iPad kannst du oben auch einen Simulator wählen (zum Beispiel „iPad Pro“). Neigung und Vibration gibt es dort nicht.

## Nach Änderungen am Spiel

Immer wenn sich Spieldateien geändert haben:

```bash
git pull
npm install
npm run sync
```

Danach in Xcode wieder auf ▶. `npm run sync` kopiert die aktuellen Spieldateien in die App.

## Vor dem App Store

- **Eurofighter ersetzen:** Das Modell des eigenen Jets steht unter CC BY-NC-SA und darf nicht kommerziell genutzt werden. Vor einer kostenpflichtigen Veröffentlichung muss ein anderes Modell hinein. Die übrigen Lizenzen stehen in [LIZENZEN.md](LIZENZEN.md).
- **App-Symbol:** Das Symbol ist aus dem kleinen Web-Symbol hochgerechnet und wirkt leicht unscharf. Für den Store sollte ein neues Bild mit 1024 × 1024 Pixeln hinein (`ios/App/App/Assets.xcassets/AppIcon.appiconset`).
- **Version:** Für jedes Update in Xcode unter **General** die Felder „Version“ und „Build“ hochzählen.

## Was wo liegt

| Datei oder Ordner | Zweck |
| --- | --- |
| `index.html`, `js`, `models`, … | Das Spiel. Dieselben Dateien laufen weiter auf der Webseite. |
| `js/native.js` | Kleine Brücke für die App (Vibration). Im Browser macht sie nichts. |
| `capacitor.config.json` | Name, Kennung und Einstellungen der App. |
| `scripts/copy-web.mjs` | Kopiert das Spiel nach `www`. |
| `www` | Kopie des Spiels für die App. Wird automatisch erzeugt, nicht von Hand ändern. |
| `ios` | Das Xcode-Projekt. |
