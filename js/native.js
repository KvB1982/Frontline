'use strict';
// Frontlinie 3 – Zusätze für die iPad- und iPhone-App (Capacitor).
// Im Browser passiert hier nichts.
(() => {
  const C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  FL.native = true;
  document.documentElement.classList.add('native');
  const H = C.Plugins && C.Plugins.Haptics;
  if (!H) return;
  // Vibration bei Treffern. iPhones haben dafür einen Motor, iPads nicht (dort bleibt es still).
  let last = 0;
  const buzz = style => {
    const now = performance.now();
    if (now - last < 70) return;
    last = now;
    try { const p = H.impact({ style }); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  };
  FL.haptic = buzz;
  const FEEL = { hit: 'LIGHT', pop: 'LIGHT', cannon: 'MEDIUM', boom: 'MEDIUM', bigboom: 'HEAVY', ouch: 'HEAVY' };
  const play = FL.audio.play;
  FL.audio.play = function (name) {
    if (FEEL[name]) buzz(FEEL[name]);
    return play.apply(this, arguments);
  };
  // Die Knöpfe auf dem Bildschirm rufen navigator.vibrate auf, das es auf iPhone und iPad nicht gibt.
  if (!navigator.vibrate) {
    try { navigator.vibrate = () => { buzz('LIGHT'); return true; }; } catch (e) {}
  }
})();
