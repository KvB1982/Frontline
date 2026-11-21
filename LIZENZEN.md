# Quellen und Lizenzen

## 3D-Modelle

Die Fahrzeuge und Flugzeuge stammen von Sketchfab. Für das Spiel wurden sie verkleinert (weniger Dreiecke, kleinere Texturen, nur die Grundfarbe) und in `models/*.js` verpackt.

| Im Spiel | Modell | Urheber | Lizenz |
| --- | --- | --- | --- |
| Eigener Panzer | [SPz Puma](https://sketchfab.com/3d-models/spz-puma-8e7d946d4b3d4fdeaf458a3fc4226e1b) | [42manako](https://sketchfab.com/42manako) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| Gegnerische Panzer | [Low poly T-62](https://sketchfab.com/3d-models/low-poly-t-62-82a85290a17e47b0be91d0f172efbeb5) | [SIpriv](https://sketchfab.com/S1Priv) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| Gegnerische Geländewagen | [Low Poly Humvee vehicle](https://sketchfab.com/3d-models/low-poly-humvee-vehicle-fac4178dc3db4eb9abf7f45425125e1e) | [Duane's Mind](https://sketchfab.com/duanesmind) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| Kampfhubschrauber | [AH-64 Apache Attack Helicopter Low Poly](https://sketchfab.com/3d-models/ah-64-apache-attack-helicopter-low-poly-34986214decd4b3db90e91f12e624d78) | [PolyDucky](https://sketchfab.com/salphytheunemployed) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| Gegnerische Flugzeuge | [Modern Jet Fighter Low Poly Game Ready Free](https://sketchfab.com/3d-models/modern-jet-fighter-low-poly-game-ready-free-cd2bd715dcd14dc4b47ebaeb2403fb89) | [Hdjusj](https://sketchfab.com/Hdjusj) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| Bäume | [Low poly trees](https://sketchfab.com/3d-models/low-poly-trees-51cae4a194344e8bbfbd0a4cff205f76) | [Aditya Graphical](https://sketchfab.com/Adityakm) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| Palmen | [low poly Palm tree](https://sketchfab.com/3d-models/low-poly-palm-tree-10365d785677428291aecc4464bf0f2d) | [lucq22](https://sketchfab.com/lucq22) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| Radar | [Low-Poly Radar Dish](https://sketchfab.com/3d-models/low-poly-radar-dish-ed6850e61792430581c8f9851fb7b4c5) | [joe_carrot](https://sketchfab.com/joe_carrot) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| Zelte | [Military Tent](https://sketchfab.com/3d-models/military-tent-d0d6d9a9f5ab4939932dd27bbaa5ca7d) | [Khata](https://sketchfab.com/Khatagames) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| Wachtürme | [Game Ready Military Base Asset Pack](https://sketchfab.com/3d-models/game-ready-military-base-asset-pack-47c0a32b43bf42abbb743458fbd95114) | [Oxygen3D](https://sketchfab.com/oxygen3d) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |

Mit [3D AI Studio](https://www.3daistudio.com) erzeugt und für das Spiel aufbereitet wurden: die Figuren (Kommandant, eigene Soldaten, Gegner, schwerer Gegner), Geschützwagen, Raketenwerfer, Lastwagen, das eigene Flugzeug mit Kampfbomber, die Drohne, beide Schiffe, Geschützturm, Flak, MG-Nest, Basisgeschütz, Bunker und Hauptquartier.

Das frühere Eurofighter-Modell (nur nicht-kommerziell nutzbar) ist nicht mehr im Spiel. Vor einer bezahlten Veröffentlichung sollten noch die Nutzungsbedingungen von 3D AI Studio für erzeugte Modelle geprüft werden.

## Bewegungen der Figuren

Stehen, Gehen, Rennen, geducktes Gehen und Knien der Soldaten sind Motion-Capture-Aufnahmen von [Mixamo](https://www.mixamo.com) (Adobe): „Walk With Rifle“, „Rifle Start Run“, „Sneak Walk“, „Sprint“ und „Standing“. Laut den [Mixamo-Bedingungen von Adobe](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) dürfen die Bewegungen kostenlos und ohne Namensnennung in eigenen Projekten verwendet werden, auch in bezahlten Spielen. Nicht erlaubt ist, die Mixamo-Dateien selbst weiterzugeben. Deshalb liegen hier nur die für unsere Figuren umgerechneten Bewegungsdaten (`models/bewegung.js`), nicht die heruntergeladenen Dateien.

Die Figuren haben dafür ein Skelett mit 22 Gelenken bekommen.

## Geräusche

Triebwerk, Nachbrenner, Panzermotor, Schüsse, Raketen und Explosionen sind Aufnahmen von Pixabay (Pixabay-Inhaltslizenz: frei nutzbar, auch ohne Namensnennung). Sie wurden gekürzt und zu Schleifen geschnitten und stecken in `sounds/pack.js`.

- „Tank moving“ von dennish18
- „Distant tank shots“ und „Propulsion jet engine“ von freesound_community
- „Fighter jet taking off“ von spinopel
- „Clean machine gun burst“ von freesound_community (Bordkanone und Gewehre)
- „Gun shot“ von u_62htdrvg4y (Schüsse der Gegner)
- „Rocket launcher“ von 49053354 (Raketen)
- „Explosion FX“ von soundreality, „Missile boom“ von u_cps9x2omzt und „Bomb explosion“ von wings_of_freedom (Explosionen)

Alle anderen Töne erzeugt das Spiel selbst.

## Programme

- [three.js](https://threejs.org) mit GLTFLoader, MIT-Lizenz, siehe `lib/three-LICENSE.txt`.
