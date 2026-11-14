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
| Eigenes Flugzeug und Kampfbomber | [Eurofighter Typhoon - Fighter Jet - Free](https://sketchfab.com/3d-models/eurofighter-typhoon-fighter-jet-free-992bcc8987964ca09d55410330aa8579) | [bohmerang](https://sketchfab.com/bohmerang) | [CC BY-NC-SA 4.0](http://creativecommons.org/licenses/by-nc-sa/4.0/) |

Wichtig: Der Eurofighter darf nur nicht-kommerziell genutzt werden. Für das kostenlose Spiel ist das in Ordnung. Vor einer bezahlten Veröffentlichung (zum Beispiel im App Store) muss er gegen ein anderes Modell getauscht werden. Die verkleinerte Fassung in `models/jet.js` steht wie das Original unter CC BY-NC-SA 4.0.

## Geräusche

Triebwerk, Nachbrenner, Panzermotor und Kanonenschüsse sind Aufnahmen von Pixabay (Pixabay-Inhaltslizenz: frei nutzbar, auch ohne Namensnennung). Sie wurden gekürzt und zu Schleifen geschnitten und stecken in `sounds/pack.js`.

- „Tank moving“ von dennish18
- „Distant tank shots“ und „Propulsion jet engine“ von freesound_community
- „Fighter jet taking off“ von spinopel

Alle anderen Töne erzeugt das Spiel selbst.

## Programme

- [three.js](https://threejs.org) mit GLTFLoader, MIT-Lizenz, siehe `lib/three-LICENSE.txt`.
