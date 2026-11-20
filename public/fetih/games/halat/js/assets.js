// Asset loading through assets/manifest.json (same shape as the first game's manifest).
// Every asset is optional: whatever is missing falls back to procedural geometry,
// procedural sprites or synthesized sounds, so the game also runs with no assets at all.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const PULLER_KEYS = ['puller_a', 'puller_b', 'puller_c', 'puller_d', 'puller_e', 'puller_f'];
const MODEL_KEYS = [...PULLER_KEYS, 'puller_strongman', 'tractor', 'giant', 'ground', 'pit', 'fence', 'flag', 'stands'];
const SPRITE_KEYS = ['fx_dust', 'fx_sweat', 'fx_splash', 'fx_confetti', 'fx_ring', 'fx_smoke', 'fx_spark'];

/** Atlas slots (256 px each in a 1024 canvas). */
export const SPRITE_SLOTS = { fx_dust: 0, fx_sweat: 1, fx_splash: 2, fx_confetti: 3, fx_ring: 4, fx_smoke: 5, fx_spark: 6, fx_star: 7 };

export class Assets {
  constructor(manifest) {
    this.manifest = manifest || {};
    this.models = new Map(); // key -> { entry, gltf, clips: Map }
    this.textures = new Map(); // key -> THREE.Texture
    this.atlas = null; // { texture, size, rects: Map(key -> {u0,v0,u1,v1}) }
    this.loaded = { models: [], sprites: [], textures: [] };
  }

  static async load(onProgress) {
    let manifest = {};
    try {
      const res = await fetch('assets/manifest.json', { cache: 'no-cache' });
      if (res.ok) manifest = await res.json();
    } catch { /* no manifest yet: everything procedural */ }
    const a = new Assets(manifest);
    await a._loadAll(onProgress);
    return a;
  }

  /** Entry of a key in any manifest section (models/textures/sprites/audio/...). */
  find(key) {
    for (const sec of Object.values(this.manifest)) {
      if (sec && typeof sec === 'object' && sec[key] && typeof sec[key] === 'object' && sec[key].path) return sec[key];
    }
    return null;
  }

  async _loadAll(onProgress) {
    const loader = new GLTFLoader();
    const jobs = [];
    const models = this.manifest.models || {};
    // Props: any model key starting with "prop" is loaded too.
    const keys = [...MODEL_KEYS, ...Object.keys(models).filter((k) => /^prop/.test(k))];
    for (const key of keys) {
      const entry = models[key];
      if (!entry || !entry.path) continue;
      jobs.push(loader.loadAsync(entry.path).then((gltf) => {
        this._prepareModel(key, entry, gltf);
        this.loaded.models.push(key);
      }).catch((e) => console.warn('[halat] model', key, e?.message || e)));
    }
    const rope = this.find('rope_tex');
    if (rope) {
      jobs.push(new THREE.TextureLoader().loadAsync(rope.path).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
        this.textures.set('rope_tex', t);
        this.loaded.textures.push('rope_tex');
      }).catch(() => {}));
    }
    for (const [key, e] of Object.entries(this.manifest.textures || {})) {
      if (key === 'rope_tex' || !e?.path) continue;
      jobs.push(new THREE.TextureLoader().loadAsync(e.path).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        this.textures.set(key, t);
        this.loaded.textures.push(key);
      }).catch(() => {}));
    }
    jobs.push(this._buildAtlas());
    jobs.push(this._loadFonts());
    let done = 0;
    const total = jobs.length;
    await Promise.all(jobs.map((j) => j.finally(() => onProgress && onProgress(++done / total))));
  }

  async _loadFonts() {
    const fonts = this.manifest.fonts || {};
    await Promise.all(Object.values(fonts).map((f) => {
      if (!f?.family || !f?.path) return null;
      const face = new FontFace(f.family, `url("${new URL(f.path, document.baseURI).href}")`, f.weight ? { weight: f.weight } : {});
      return face.load().then((ff) => document.fonts.add(ff)).catch(() => {});
    }));
  }

  _prepareModel(key, entry, gltf) {
    // Lambert materials are cheaper and suit the low-poly style; "team*" materials get tinted.
    const cache = new Map();
    const convert = (m) => {
      if (cache.has(m)) return cache.get(m);
      const isTeam = /^team/i.test(m.name || '');
      const lm = new THREE.MeshLambertMaterial({
        name: m.name,
        map: m.map || null,
        color: isTeam ? 0xffffff : (m.color ? m.color.clone() : 0xffffff),
        transparent: m.transparent,
        alphaTest: m.alphaTest,
        side: m.side,
      });
      if (lm.map) lm.map.colorSpace = THREE.SRGBColorSpace;
      lm.userData.isTeam = isTeam;
      cache.set(m, lm);
      return lm;
    };
    let skinned = false;
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
        o.frustumCulled = !o.isSkinnedMesh;
        if (o.isSkinnedMesh) skinned = true;
      }
    });
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    this.models.set(key, { key, entry, gltf, skinned, size, minY: box.min.y, clips: new Map(gltf.animations.map((c) => [c.name, c])) });
  }

  model(key) { return this.models.get(key) || null; }

  // ---------- sprites: procedural atlas, real sprites drawn over their slot ----------

  async _buildAtlas() {
    const size = 1024;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d');
    for (const [key, slot] of Object.entries(SPRITE_SLOTS)) drawProcSprite(ctx, key, (slot % 4) * 256, Math.floor(slot / 4) * 256);
    const sprites = this.manifest.sprites || {};
    await Promise.all(SPRITE_KEYS.map(async (key) => {
      const e = sprites[key];
      if (!e?.path) return;
      try {
        const img = await loadImage(e.path);
        const slot = SPRITE_SLOTS[key];
        const x = (slot % 4) * 256; const y = Math.floor(slot / 4) * 256;
        ctx.clearRect(x, y, 256, 256);
        if ((e.frames || 1) > 1 && e.frameSize) ctx.drawImage(img, 0, 0, e.frameSize[0], e.frameSize[1], x, y, 256, 256);
        else ctx.drawImage(img, x, y, 256, 256);
        this.loaded.sprites.push(key);
      } catch { /* keep the procedural one */ }
    }));
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const rects = new Map();
    for (const [key, slot] of Object.entries(SPRITE_SLOTS)) {
      const x = (slot % 4) * 256; const y = Math.floor(slot / 4) * 256;
      const pad = 2;
      rects.set(key, { u0: (x + pad) / size, u1: (x + 256 - pad) / size, v1: 1 - (y + pad) / size, v0: 1 - (y + 256 - pad) / size });
    }
    this.atlas = { texture: tex, size, rects };
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Procedural fallback sprites (white-ish, tinted per particle). */
function drawProcSprite(ctx, key, x, y) {
  const c = 128;
  ctx.save();
  ctx.translate(x, y);
  const radial = (r0, stops) => {
    const g = ctx.createRadialGradient(c, c, 0, c, c, r0);
    for (const [o, col] of stops) g.addColorStop(o, col);
    return g;
  };
  if (key === 'fx_dust' || key === 'fx_smoke') {
    // Soft lumpy puff.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = i === 0 ? 0 : 40;
      const px = c + Math.cos(a) * r; const py = c + Math.sin(a) * r;
      const g = ctx.createRadialGradient(px, py, 0, px, py, 70);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
  } else if (key === 'fx_sweat' || key === 'fx_splash') {
    // Droplet.
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(c, 40);
    ctx.bezierCurveTo(c + 70, 140, c + 60, 210, c, 210);
    ctx.bezierCurveTo(c - 60, 210, c - 70, 140, c, 40);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.ellipse(c - 18, 160, 12, 22, -0.4, 0, Math.PI * 2); ctx.fill();
  } else if (key === 'fx_confetti') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(c - 46, c - 80, 92, 160);
  } else if (key === 'fx_ring') {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 18;
    ctx.beginPath(); ctx.arc(c, c, 100, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = radial(110, [[0, 'rgba(255,255,255,0)'], [0.8, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)']]);
    ctx.fillRect(0, 0, 256, 256);
  } else if (key === 'fx_spark') {
    ctx.fillStyle = radial(120, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
    ctx.fillRect(0, 0, 256, 256);
  } else if (key === 'fx_star') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 45 : 110;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
