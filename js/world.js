'use strict';
// Frontlinie 3 – 3D-Welt: Renderer, Landschaften (Themen), Texturen, Himmel, Licht, Effekte.

FL.THEMES = {
  wald: {
    name: 'Wald', skyTop: '#2f6fc4', skyBot: '#cfe4f5', fog: '#c3d6e2', fogNear: 60, fogFar: 520,
    sun: 0xfff1d0, sunI: 1.55, sunDir: [-0.55, 0.8, -0.3], hemiSky: 0xbcd8ff, hemiGround: 0x556a3a, hemiI: 0.72,
    ground: ['#5a7a3a', '#4c6b31', '#6c8a47', '#3f5a2a'], road: ['#8a7450', '#7a6644', '#9a8560'],
    trees: ['pine', 'leaf', 'leaf', 'pine', 'bush'], mountain: '#5f7f6a', enemy: 0x716c58, enemyDark: 0x565244, style: 'wood'
  },
  wueste: {
    name: 'Wüste', skyTop: '#2f86de', skyBot: '#f3e6c6', fog: '#ecdcb8', fogNear: 80, fogFar: 600,
    sun: 0xfff4d8, sunI: 1.75, sunDir: [0.5, 0.85, -0.25], hemiSky: 0xcfe2ff, hemiGround: 0xb39660, hemiI: 0.8,
    ground: ['#c9a86a', '#b8975a', '#d8ba7e', '#a88a52'], road: ['#b39a68', '#a38a5c', '#c4ab78'],
    trees: ['palm', 'deadbush', 'rock', 'rock', 'palm'], mountain: '#c29a6a', enemy: 0xa49062, enemyDark: 0x7d6d48, style: 'sandstone'
  },
  industrie: {
    name: 'Industriegebiet', skyTop: '#5c7890', skyBot: '#cdd3d8', fog: '#b9c2c9', fogNear: 50, fogFar: 430,
    sun: 0xf2f0ea, sunI: 1.15, sunDir: [-0.4, 0.75, -0.5], hemiSky: 0xc9d4de, hemiGround: 0x54584e, hemiI: 0.85,
    ground: ['#5f6558', '#555b50', '#6b7164', '#4a4f46'], road: ['#4b4d50', '#434548', '#58595c'],
    trees: ['leaf', 'pine', 'bush', 'rock'], mountain: '#6a747c', enemy: 0x585d63, enemyDark: 0x40444a, style: 'concrete'
  },
  winter: {
    name: 'Winter', skyTop: '#5f93cf', skyBot: '#eef4fa', fog: '#e3ebf2', fogNear: 55, fogFar: 480,
    sun: 0xffffff, sunI: 1.35, sunDir: [-0.6, 0.6, -0.4], hemiSky: 0xdcebff, hemiGround: 0xb8c4cf, hemiI: 0.9,
    ground: ['#e8eef3', '#dbe4ec', '#f4f8fb', '#c9d5df'], road: ['#a9a9a4', '#9b9b96', '#bcbcb8'],
    trees: ['snowpine', 'snowpine', 'deadtree', 'rock'], mountain: '#a9bccd', enemy: 0xb4bcc0, enemyDark: 0x8a9498, style: 'concrete'
  },
  daemmerung: {
    name: 'Abenddämmerung', skyTop: '#27376b', skyBot: '#f3a35f', fog: '#c58f70', fogNear: 55, fogFar: 460,
    sun: 0xffb070, sunI: 1.45, sunDir: [-0.75, 0.32, 0.55], hemiSky: 0x8f9bd0, hemiGround: 0x5a4a3a, hemiI: 0.7,
    ground: ['#4d5a38', '#435031', '#586642', '#38442a'], road: ['#6e5b44', '#5f4e3a', '#7c6950'],
    trees: ['pine', 'leaf', 'pine', 'bush'], mountain: '#5a4a5a', enemy: 0x5d4e48, enemyDark: 0x443834, style: 'fortress'
  }
};
FL.THEME_KEYS = Object.keys(FL.THEMES);

// ---------------------------------------------------------------- Renderer
// Grafik-Stufe: 2 = schön (scharf, mit Schatten), 1 = mittel (mit Schatten), 0 = schnell (ohne Schatten)
FL.quality = 2;
FL.setQuality = q => {
  FL.quality = q;
  if (FL.resize) FL.resize();
  if (FL.stage) FL.stage.sun.castShadow = q >= 1;
};
FL.initRenderer = () => {
  const canvas = document.getElementById('gl');
  THREE.ColorManagement.legacyMode = false;
  const r = FL.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  r.outputEncoding = THREE.sRGBEncoding;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.08;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  const resize = () => {
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, FL.quality >= 2 ? 2 : 1));
    r.setSize(window.innerWidth, window.innerHeight, false);
    if (FL.stage) { FL.stage.camera.aspect = window.innerWidth / window.innerHeight; FL.stage.camera.updateProjectionMatrix(); }
  };
  window.addEventListener('resize', resize);
  FL.resize = resize;
  resize();
};

// ---------------------------------------------------------------- Texturen (alle im Browser gemalt)
FL.texCache = {};
FL.canvasTex = (key, size, paint, repeat) => {
  if (FL.texCache[key]) return FL.texCache[key];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  paint(g, size, FL.seeded(key.length * 7919 + key.charCodeAt(0) * 31 + key.charCodeAt(key.length - 1)));
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (FL.texCache[key] = t);
};
const speckle = (g, s, rnd, colors, n, r0, r1, alpha) => {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * (0.4 + rnd() * 0.6);
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const r = r0 + rnd() * (r1 - r0), x = rnd() * s, y = rnd() * s;
    // an den Rändern doppelt malen, damit sich die Textur nahtlos wiederholt
    for (const ox of [0, -s, s]) for (const oy of [0, -s, s]) {
      if (x + ox < -r1 || x + ox > s + r1 || y + oy < -r1 || y + oy > s + r1) continue;
      g.beginPath(); g.ellipse(x + ox, y + oy, r, r * (0.6 + rnd() * 0.6), rnd() * 3, 0, 7); g.fill();
    }
  }
  g.globalAlpha = 1;
};
FL.tex = {
  ground(theme) {
    const p = FL.THEMES[theme].ground;
    return FL.canvasTex('ground-' + theme, 512, (g, s, rnd) => {
      g.fillStyle = p[0]; g.fillRect(0, 0, s, s);
      speckle(g, s, rnd, [p[1], p[2], p[3]], 60, 30, 90, 0.35);
      speckle(g, s, rnd, p, 5000, 0.8, 2.6, 0.7);
      if (theme !== 'winter' && theme !== 'wueste') {
        g.lineWidth = 1;
        for (let i = 0; i < 1800; i++) {
          g.strokeStyle = p[Math.floor(rnd() * 4)]; g.globalAlpha = 0.6;
          const x = rnd() * s, y = rnd() * s;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd() * 4 - 2, y - 3 - rnd() * 4); g.stroke();
        }
        g.globalAlpha = 1;
      }
    }, true);
  },
  road(theme) {
    const p = FL.THEMES[theme].road;
    return FL.canvasTex('road-' + theme, 256, (g, s, rnd) => {
      g.fillStyle = p[0]; g.fillRect(0, 0, s, s);
      speckle(g, s, rnd, p, 30, 14, 40, 0.4);
      speckle(g, s, rnd, [p[1], p[2], '#000000'], 2600, 0.6, 1.8, 0.45);
      // Fahrspuren
      g.globalAlpha = 0.22; g.fillStyle = '#000';
      for (const x of [0.26, 0.38, 0.62, 0.74]) g.fillRect(x * s - 6, 0, 12, s);
      g.globalAlpha = 1;
    }, true);
  },
  fields(theme) {
    const p = FL.THEMES[theme].ground, rd = FL.THEMES[theme].road;
    return FL.canvasTex('fields-' + theme, 1024, (g, s, rnd) => {
      g.fillStyle = p[0]; g.fillRect(0, 0, s, s);
      const n = 6, c = s / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        g.fillStyle = p[Math.floor(rnd() * p.length)];
        g.globalAlpha = 0.55 + rnd() * 0.45;
        g.fillRect(i * c + 3, j * c + 3, c - 6, c - 6);
        // Ackerfurchen
        g.globalAlpha = 0.12; g.strokeStyle = '#000'; g.lineWidth = 2;
        const horiz = rnd() < 0.5;
        for (let k = 8; k < c - 6; k += 9) {
          g.beginPath();
          if (horiz) { g.moveTo(i * c + 4, j * c + k); g.lineTo(i * c + c - 4, j * c + k); }
          else { g.moveTo(i * c + k, j * c + 4); g.lineTo(i * c + k, j * c + c - 4); }
          g.stroke();
        }
      }
      g.globalAlpha = 1;
      speckle(g, s, rnd, p, 2500, 1, 3, 0.4);
      // Feldwege
      g.strokeStyle = rd[0]; g.lineWidth = 7;
      g.beginPath(); g.moveTo(0, s * 0.5); g.lineTo(s, s * 0.5); g.moveTo(s * 0.5, 0); g.lineTo(s * 0.5, s); g.stroke();
      // Baumgruppen als dunkle Tupfen
      if (theme !== 'wueste') speckle(g, s, rnd, [theme === 'winter' ? '#8fa3ad' : '#2e4a24'], 140, 4, 9, 0.8);
    }, true);
  },
  concrete(tint) {
    return FL.canvasTex('concrete-' + tint, 256, (g, s, rnd) => {
      g.fillStyle = tint; g.fillRect(0, 0, s, s);
      speckle(g, s, rnd, ['#000000', '#ffffff'], 1800, 0.6, 1.8, 0.1);
      speckle(g, s, rnd, ['#000000'], 14, 10, 40, 0.07);
      g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(s, i * 64); g.stroke(); }
      for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, s); g.stroke(); }
      // Regenspuren
      for (let i = 0; i < 12; i++) {
        const x = rnd() * s, gr = g.createLinearGradient(0, 0, 0, 110);
        gr.addColorStop(0, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x, 0, 3 + rnd() * 5, 110);
      }
    }, true);
  },
  windows(tint) {
    return FL.canvasTex('windows-' + tint, 256, (g, s, rnd) => {
      g.fillStyle = tint; g.fillRect(0, 0, s, s);
      speckle(g, s, rnd, ['#000000', '#ffffff'], 1200, 0.6, 1.6, 0.08);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        const x = 18 + c * 60, y = 22 + r * 78;
        g.fillStyle = '#1c2a36'; g.fillRect(x, y, 40, 46);
        g.fillStyle = rnd() < 0.3 ? '#ffd98a' : '#3d5a72'; g.fillRect(x + 3, y + 3, 34, 40);
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 3, y + 3, 14, 18);
        g.fillStyle = '#1c2a36'; g.fillRect(x + 19, y, 2, 46);
      }
    }, true);
  },
  metal(tint) {
    return FL.canvasTex('metal-' + tint, 128, (g, s, rnd) => {
      g.fillStyle = tint; g.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 8) {
        g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(x, 0, 3, s);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 5, 0, 3, s);
      }
      speckle(g, s, rnd, ['#5a3a20'], 30, 2, 9, 0.2);
    }, true);
  },
  wood(tint) {
    return FL.canvasTex('wood-' + tint, 128, (g, s, rnd) => {
      g.fillStyle = tint; g.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 16) {
        g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.2})`; g.fillRect(x, 0, 16, s);
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, 0, 2, s);
      }
      speckle(g, s, rnd, ['#000000'], 300, 0.5, 1.2, 0.2);
    }, true);
  },
  brick(tint) {
    return FL.canvasTex('brick-' + tint, 256, (g, s, rnd) => {
      g.fillStyle = tint; g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 32) for (let x = -32; x < s; x += 64) {
        const ox = (y / 32) % 2 ? 32 : 0;
        g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * 0.12})`;
        g.fillRect(x + ox + 2, y + 2, 60, 28);
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; g.strokeRect(x + ox, y, 64, 32);
      }
      speckle(g, s, rnd, ['#000000', '#ffffff'], 1500, 0.6, 1.6, 0.08);
    }, true);
  },
  camo(a, b, c) {
    return FL.canvasTex('camo-' + a + b + c, 128, (g, s, rnd) => {
      g.fillStyle = a; g.fillRect(0, 0, s, s);
      speckle(g, s, rnd, [b, c], 34, 8, 22, 1);
    }, true);
  },
  sandbag() {
    return FL.canvasTex('sandbag', 128, (g, s, rnd) => {
      g.fillStyle = '#a8946a'; g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 32) for (let x = -32; x < s; x += 64) {
        const ox = (y / 32) % 2 ? 32 : 0;
        const gr = g.createLinearGradient(0, y, 0, y + 32);
        gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(x + ox + 32, y + 16, 31, 15, 0, 0, 7); g.fill();
      }
      speckle(g, s, rnd, ['#000000'], 500, 0.5, 1.2, 0.15);
    }, true);
  },
  puff(kind) {
    return FL.canvasTex('puff-' + kind, 128, (g, s, rnd) => {
      const core = { fire: '255,210,120', flash: '255,250,220', smoke: '70,70,72', dust: '190,170,140', white: '235,238,240', flak: '30,30,34' }[kind];
      const blobs = kind === 'flash' ? 1 : 9;
      for (let i = 0; i < blobs; i++) {
        const x = s / 2 + (blobs > 1 ? (rnd() - 0.5) * s * 0.4 : 0), y = s / 2 + (blobs > 1 ? (rnd() - 0.5) * s * 0.4 : 0);
        const r = blobs > 1 ? s * (0.16 + rnd() * 0.14) : s * 0.5;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(${core},${kind === 'flash' ? 1 : 0.75})`);
        gr.addColorStop(1, `rgba(${core},0)`);
        g.fillStyle = gr; g.fillRect(0, 0, s, s);
      }
      if (kind === 'fire') {
        const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.3);
        gr.addColorStop(0, 'rgba(255,255,230,0.9)'); gr.addColorStop(1, 'rgba(255,140,30,0)');
        g.fillStyle = gr; g.fillRect(0, 0, s, s);
      }
    });
  },
  icon(kind) {
    return FL.canvasTex('icon-' + kind, 96, (g, s) => {
      g.clearRect(0, 0, s, s);
      if (kind === 'cross') {
        g.fillStyle = '#fff'; g.beginPath(); g.arc(48, 48, 44, 0, 7); g.fill();
        g.fillStyle = '#d83a30'; g.fillRect(38, 16, 20, 64); g.fillRect(16, 38, 64, 20);
      } else if (kind === 'target') {
        g.strokeStyle = '#ff5a3c'; g.lineWidth = 8;
        g.beginPath(); g.arc(48, 48, 36, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(48, 0); g.lineTo(48, 30); g.moveTo(48, 66); g.lineTo(48, 96);
        g.moveTo(0, 48); g.lineTo(30, 48); g.moveTo(66, 48); g.lineTo(96, 48); g.stroke();
      } else if (kind === 'wrench') {
        g.fillStyle = '#fff'; g.beginPath(); g.arc(48, 48, 44, 0, 7); g.fill();
        g.strokeStyle = '#2a7fd0'; g.lineWidth = 12; g.lineCap = 'round';
        g.beginPath(); g.moveTo(28, 68); g.lineTo(62, 34); g.stroke();
        g.beginPath(); g.arc(66, 30, 12, 0.6, 5.2); g.stroke();
      } else if (kind === 'ring') {
        g.strokeStyle = 'rgba(255,240,120,0.95)'; g.lineWidth = 6;
        g.beginPath(); g.arc(48, 48, 40, 0, 7); g.stroke();
        g.beginPath(); g.arc(48, 48, 5, 0, 7); g.fillStyle = 'rgba(255,240,120,0.95)'; g.fill();
      } else if (kind === 'glow') {
        const gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.55)'); gr.addColorStop(1, 'rgba(255,220,160,0)');
        g.fillStyle = gr; g.fillRect(0, 0, s, s);
      } else if (kind === 'cloud') {
        for (let i = 0; i < 16; i++) {
          const x = 14 + Math.random() * 68, y = 40 + Math.random() * 18, r = 10 + Math.random() * 14;
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.fillRect(0, 0, s, s);
        }
      } else if (kind === 'scorch') {
        const gr = g.createRadialGradient(48, 48, 4, 48, 48, 46);
        gr.addColorStop(0, 'rgba(15,12,10,0.85)'); gr.addColorStop(0.6, 'rgba(25,20,16,0.5)'); gr.addColorStop(1, 'rgba(25,20,16,0)');
        g.fillStyle = gr; g.fillRect(0, 0, s, s);
      }
    });
  }
};

// ---------------------------------------------------------------- Materialien und Formen (geteilt, damit es schnell bleibt)
FL.matCache = {};
FL.mat = (color, opts) => {
  opts = opts || {};
  const key = color + '|' + (opts.map ? opts.map.uuid : '') + '|' + (opts.flat ? 1 : 0) + '|' + (opts.emissive || 0) + '|' + (opts.shiny || 0) + '|' + (opts.rx || 1) + 'x' + (opts.ry || 1);
  if (FL.matCache[key]) return FL.matCache[key];
  let map = opts.map || null;
  if (map && (opts.rx || opts.ry)) {
    map = map.clone(); map.needsUpdate = true;
    map.repeat.set(opts.rx || 1, opts.ry || 1);
  }
  const m = new THREE.MeshPhongMaterial({
    color, map, flatShading: !!opts.flat, shininess: opts.shiny || 6,
    specular: opts.shiny ? 0x555555 : 0x111111, emissive: opts.emissive || 0
  });
  return (FL.matCache[key] = m);
};
FL.basicCache = {};
FL.basic = color => FL.basicCache[color] || (FL.basicCache[color] = new THREE.MeshBasicMaterial({ color }));
FL.geoCache = {};
FL.geo = (key, make) => FL.geoCache[key] || (FL.geoCache[key] = make());
FL.box = (w, h, d, mat, x, y, z) => {
  const m = new THREE.Mesh(FL.geo(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)), mat);
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = true; m.receiveShadow = true;
  return m;
};
FL.cyl = (rt, rb, h, seg, mat, x, y, z) => {
  const m = new THREE.Mesh(FL.geo(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), mat);
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = true; m.receiveShadow = true;
  return m;
};
FL.ball = (r, mat, x, y, z, ws, hs) => {
  const m = new THREE.Mesh(FL.geo(`s${r}|${ws || 10}|${hs || 8}`, () => new THREE.SphereGeometry(r, ws || 10, hs || 8)), mat);
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = true;
  return m;
};
FL.sprite = (tex, size, opts) => {
  opts = opts || {};
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, fog: opts.fog !== false,
    blending: opts.add ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: opts.opacity === undefined ? 1 : opts.opacity,
    depthTest: opts.depthTest !== false
  }));
  s.scale.set(size, size, 1);
  return s;
};

// ---------------------------------------------------------------- Bühne: Szene, Kamera, Himmel, Licht
FL.Stage = class {
  constructor(themeKey, opts) {
    opts = opts || {};
    const th = this.theme = FL.THEMES[themeKey];
    this.themeKey = themeKey;
    const far = this.far = opts.far || 700;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(th.fog, (opts.fogNear || th.fogNear), Math.min(far * 0.92, opts.fogFar || th.fogFar));
    this.camera = new THREE.PerspectiveCamera(opts.fov || 55, window.innerWidth / window.innerHeight, 0.4, far);
    this.owned = [];

    // Himmelskuppel mit Farbverlauf
    const g = new THREE.SphereGeometry(1, 32, 16);
    const top = new THREE.Color(th.skyTop), bot = new THREE.Color(th.skyBot), fog = new THREE.Color(th.fog);
    const col = [], pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const c = y < 0 ? fog.clone() : fog.clone().lerp(bot, Math.min(1, y * 8)).lerp(top, Math.pow(Math.max(0, y), 0.55));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.scale.setScalar(far * 0.95);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.owned.push(g);

    const dir = new THREE.Vector3(...th.sunDir).normalize();
    this.sunDir = dir;
    const glow = FL.sprite(FL.tex.icon('glow'), far * 0.5, { add: true, fog: false });
    glow.position.copy(dir).multiplyScalar(0.85);
    glow.material.color.set(th.sun);
    this.sky.add(glow);
    glow.scale.setScalar(0.5);
    // Wolken
    const rnd = FL.seeded(themeKey.length * 97 + 5);
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2, h = 0.1 + rnd() * 0.28, r = Math.sqrt(1 - h * h) * 0.8;
      const c = FL.sprite(FL.tex.icon('cloud'), 1, { fog: false, opacity: themeKey === 'industrie' ? 0.75 : 0.6 });
      c.position.set(Math.cos(a) * r, h * 0.8, Math.sin(a) * r);
      const s = 0.25 + rnd() * 0.3;
      c.scale.set(s * 1.8, s * 0.7, 1);
      if (themeKey === 'daemmerung') c.material.color.set(0xffc9a0);
      this.sky.add(c);
    }
    // ferne Berge als gezackter Ring
    for (let ring = 0; ring < 2; ring++) {
      const n = 96, verts = [], R = 0.78 - ring * 0.1;
      const hs = [];
      for (let i = 0; i <= n; i++) {
        const a = i / n * Math.PI * 2;
        hs.push(0.035 + 0.03 * (ring + 1) * Math.abs(Math.sin(a * 3 + ring) * 0.6 + Math.sin(a * 7 + ring * 2) * 0.3 + Math.sin(a * 13) * 0.2));
      }
      for (let i = 0; i < n; i++) {
        const a1 = i / n * Math.PI * 2, a2 = (i + 1) / n * Math.PI * 2;
        const x1 = Math.cos(a1) * R, z1 = Math.sin(a1) * R, x2 = Math.cos(a2) * R, z2 = Math.sin(a2) * R;
        verts.push(x1, -0.01, z1, x2, -0.01, z2, x2, hs[i + 1], z2, x1, -0.01, z1, x2, hs[i + 1], z2, x1, hs[i], z1);
      }
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      const mc = new THREE.Color(th.mountain).lerp(fog, 0.45 + ring * 0.25);
      const mm = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: mc, fog: false, side: THREE.DoubleSide, depthWrite: false }));
      mm.renderOrder = -9 + ring;
      this.sky.add(mm);
      this.owned.push(mg);
    }

    this.hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiI);
    this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(th.sun, th.sunI);
    sun.castShadow = FL.quality >= 1;
    const S = opts.shadow || 55;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 400 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.05;
    this.scene.add(sun, sun.target);
    this.focus = new THREE.Vector3();
    FL.stage = this;
  }
  add(o) { this.scene.add(o); return o; }
  // große Bodenfläche mit sich wiederholender Textur
  ground(size, tex, tile, y) {
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(size / tile, size / tile);
    const geo = new THREE.PlaneGeometry(size, size);
    const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ map: t, shininess: 2, specular: 0x050505 }));
    m.rotation.x = -Math.PI / 2; m.position.y = y || 0; m.receiveShadow = true;
    this.owned.push(geo, t, m.material);
    return this.add(m);
  }
  strip(w, len, tex, tileW, tileL, x, z, y) {
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(w / tileW, len / tileL);
    const geo = new THREE.PlaneGeometry(w, len);
    const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ map: t, shininess: 2, specular: 0x050505 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x || 0, y || 0.03, z || 0); m.receiveShadow = true;
    this.owned.push(geo, t, m.material);
    return m;
  }
  update(focus) {
    this.sky.position.copy(this.camera.position);
    if (focus) this.focus.copy(focus);
    this.sun.target.position.copy(this.focus);
    this.sun.position.copy(this.focus).addScaledVector(this.sunDir, 160);
  }
  render() { FL.renderer.render(this.scene, this.camera); }
  dispose() {
    for (const o of this.owned) if (o.dispose) o.dispose();
    this.sun.shadow.map && this.sun.shadow.map.dispose();
    if (FL.stage === this) FL.stage = null;
  }
};

// ---------------------------------------------------------------- Effekte: Rauch, Feuer, Trümmer, Leuchtspuren
FL.FX = class {
  constructor(stage) {
    this.stage = stage; this.parts = []; this.pool = {}; this.debris = []; this.debrisPool = []; this.scorches = [];
    this.shots = []; this.shotPool = [];
    this.light = new THREE.PointLight(0xffb060, 0, 60, 2);
    stage.add(this.light);
    this.lightT = 0;
  }
  puff(kind, x, y, z, size, life, vx, vy, vz, grow, delay) {
    const pool = this.pool[kind] || (this.pool[kind] = []);
    const s = pool.pop() || FL.sprite(FL.tex.puff(kind), 1, { add: kind === 'fire' || kind === 'flash' });
    s.position.set(x, y, z);
    s.material.rotation = Math.random() * 6.28;
    s.visible = false;
    this.stage.scene.add(s);
    this.parts.push({ s, kind, size, life, age: -(delay || 0), vx: vx || 0, vy: vy || 0, vz: vz || 0, grow: grow === undefined ? 1 : grow });
  }
  explosion(x, y, z, size, quiet) {
    size = size || 1;
    this.puff('flash', x, y + 0.5 * size, z, 7 * size, 0.14, 0, 0, 0, 0.6);
    for (let i = 0; i < 7; i++) {
      this.puff('fire', x + FL.rand(-1, 1) * size, y + FL.rand(0.2, 1.6) * size, z + FL.rand(-1, 1) * size, FL.rand(2.2, 3.6) * size,
        FL.rand(0.35, 0.6), FL.rand(-1, 1) * size, FL.rand(1.5, 4) * size, FL.rand(-1, 1) * size, 1.2, i * 0.02);
    }
    for (let i = 0; i < 6; i++) {
      this.puff('smoke', x + FL.rand(-1.2, 1.2) * size, y + FL.rand(0.5, 2) * size, z + FL.rand(-1.2, 1.2) * size, FL.rand(2.5, 4.5) * size,
        FL.rand(1.2, 2.2), FL.rand(-0.6, 0.6), FL.rand(1.5, 3.5) * size, FL.rand(-0.6, 0.6), 1.6, 0.1 + i * 0.05);
    }
    if (!quiet) {
      for (let i = 0; i < Math.round(8 * size); i++) this.chunk(x, y + 0.5, z, size);
      this.light.position.set(x, y + 3, z); this.light.intensity = 3 * size; this.lightT = 0.25;
      if (y < 3) this.scorch(x, z, 3.2 * size);
    }
  }
  chunk(x, y, z, size, color) {
    const m = this.debrisPool.pop() || new THREE.Mesh(FL.geo('chunk', () => new THREE.BoxGeometry(1, 1, 1)), FL.mat(0x3a3632, { flat: true }));
    m.material = FL.mat(color || 0x3a3632, { flat: true });
    const s = FL.rand(0.15, 0.5) * Math.min(2, size);
    m.scale.set(s, s * FL.rand(0.5, 1.2), s * FL.rand(0.6, 1.4));
    m.position.set(x, y, z);
    this.stage.scene.add(m);
    const a = Math.random() * 6.28, v = FL.rand(3, 9) * Math.sqrt(size);
    this.debris.push({ m, vx: Math.cos(a) * v, vy: FL.rand(5, 12) * Math.sqrt(size), vz: Math.sin(a) * v, life: FL.rand(1.2, 2.2), rx: FL.rand(-8, 8), rz: FL.rand(-8, 8) });
  }
  scorch(x, z, r) {
    const geo = FL.geo('scorch', () => new THREE.PlaneGeometry(1, 1));
    const m = new THREE.Mesh(geo, FL.scorchMat || (FL.scorchMat = new THREE.MeshBasicMaterial({ map: FL.tex.icon('scorch'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28;
    m.position.set(x, 0.06 + this.scorches.length * 0.0005, z); m.scale.set(r * 2, r * 2, 1);
    (this.scorchParent || this.stage.scene).add(m);
    this.scorches.push(m);
    if (this.scorches.length > 50) { const o = this.scorches.shift(); o.parent && o.parent.remove(o); }
  }
  smoke(x, y, z, size, kind) {
    this.puff(kind || 'smoke', x + FL.rand(-0.3, 0.3), y, z + FL.rand(-0.3, 0.3), size, FL.rand(1.4, 2.4), FL.rand(-0.4, 0.4) + 0.6, FL.rand(1.5, 3), FL.rand(-0.4, 0.4), 1.8);
  }
  dust(x, y, z, size) {
    for (let i = 0; i < 4; i++) this.puff('dust', x + FL.rand(-0.4, 0.4), y, z + FL.rand(-0.4, 0.4), size, FL.rand(0.4, 0.8), FL.rand(-1, 1), FL.rand(0.5, 2), FL.rand(-1, 1), 1.5);
  }
  vanish(x, y, z) {
    // Gegner lösen sich in einem hellen Wölkchen auf
    for (let i = 0; i < 5; i++) this.puff('white', x + FL.rand(-0.3, 0.3), y + FL.rand(0.3, 1.6), z + FL.rand(-0.3, 0.3), FL.rand(0.9, 1.5), FL.rand(0.3, 0.55), FL.rand(-0.8, 0.8), FL.rand(0.6, 2), FL.rand(-0.8, 0.8), 1.2);
  }
  spark(x, y, z, size) { this.puff('flash', x, y, z, size || 0.9, 0.1, 0, 0, 0, 0.5); }
  // Leuchtspur / Geschoss als längliches, selbstleuchtendes Stäbchen
  shot(color, thick, len) {
    const m = this.shotPool.pop() || new THREE.Mesh(FL.geo('shot', () => new THREE.BoxGeometry(1, 1, 1)), FL.basic(color));
    m.material = FL.basic(color);
    m.scale.set(thick, thick, len);
    this.stage.scene.add(m);
    return m;
  }
  freeShot(m) { this.stage.scene.remove(m); this.shotPool.push(m); }
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age < 0) continue;
      const k = p.age / p.life;
      if (k >= 1) { this.stage.scene.remove(p.s); this.pool[p.kind].push(p.s); this.parts.splice(i, 1); continue; }
      p.s.visible = true;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      const sc = p.size * (0.5 + p.grow * k);
      p.s.scale.set(sc, sc, 1);
      p.s.material.opacity = p.kind === 'smoke' || p.kind === 'flak' ? 0.75 * (1 - k) * Math.min(1, k * 6) : (1 - k * k);
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt; d.vy -= 22 * dt;
      d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
      d.m.rotation.x += d.rx * dt; d.m.rotation.z += d.rz * dt;
      if (d.m.position.y < 0.1) { d.m.position.y = 0.1; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; d.rx *= 0.5; d.rz *= 0.5; }
      if (d.life <= 0) { this.stage.scene.remove(d.m); this.debrisPool.push(d.m); this.debris.splice(i, 1); }
    }
    if (this.lightT > 0) { this.lightT -= dt; if (this.lightT <= 0) this.light.intensity = 0; }
  }
};
