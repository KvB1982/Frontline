'use strict';
// Frontlinie 3 – merkt sich alle Dateien, damit das Spiel auch ohne Internet läuft.
// Mit Internet wird immer zuerst die neueste Fassung geholt.
const CACHE = 'frontlinie3-v13';
const FILES = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'lib/three.min.js', 'lib/GLTFLoader.js',
  'js/core.js', 'js/touch.js', 'js/world.js', 'js/models.js', 'js/ext.js', 'js/career.js', 'js/ground.js', 'js/defend.js', 'js/support.js', 'js/flight.js', 'js/heli.js', 'js/tank.js', 'js/app.js',
  'lizenzen.html', 'sounds/pack.js', 'models/puma.js', 'models/t62.js', 'models/humvee.js', 'models/apache.js', 'models/jet.js', 'models/ejet.js', 'models/deko.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
