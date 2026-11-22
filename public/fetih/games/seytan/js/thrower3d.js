// The players as small 3D figures gathered in the middle of the courtyard: a robed body whose head
// is the viewer's avatar medallion. Everyone who plays (likes or gifts) joins the crowd, which fills
// from the centre outwards and stays: a figure only leaves after a long idle spell or when the crowd
// is full and a newcomer needs the place. They turn to the devil and throw their stones overhand (one
// throw per stone), raise both arms to summon rock rain or a shooting star, or point the catapult at
// him. Names are drawn by the 2D overlay (labels()), only for figures acting right now.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toScreen } from './proj.js';
import { safeImageUrl, cleanNick, graphemes } from '../../../shared/sanitize.js';
import { radialTexture } from './world3d.js';

// Crowd places (world x, z): staggered rows in front of the devil, nearest the centre first.
function makeSlots(rowsZ = [3.0, 3.95, 4.9, 5.85]) {
  const out = [];
  rowsZ.forEach((z, r) => {
    const n = 7 + r;
    for (let i = 0; i < n; i++) out.push({ x: (i - (n - 1) / 2) * 0.86, z, r });
  });
  return out.sort((a, b) => (Math.abs(a.x) + a.r * 0.55) - (Math.abs(b.x) + b.r * 0.55));
}
// sakura theme (reference/style.json): every figure wears the same navy hooded robe with gold trim
const SAKURA_ROBE = 0x3d498d;

// ---- sakura figure: one merged, vertex-coloured mesh per part (body, two sleeves) ------------------
// A chibi villager: folded robe flaring at the hem, trimmed hem band and belt, a short capelet with a
// collar, an emblem on the back (the side the camera sees), wide sleeves with cuffs, and one of four
// headwears. Every player gets a stable look picked from their name (robe colour x headwear x trim),
// so the crowd is varied but a returning viewer looks the same. Variants are built once and cached;
// one shared material keeps 30+ figures cheap.
const ROBES = [
  [0x3d498d, 0x2a3270], // navy
  [0x6a3d8d, 0x4a2866], // plum
  [0x2f6f7a, 0x1f4c56], // teal
  [0x8d2f3f, 0x62202c], // crimson
  [0x3f6e45, 0x2a4c30], // pine
  [0xc8782f, 0x8e5220], // saffron
  [0x4a5568, 0x323a4a], // slate
];
const HEADS = ['hood', 'kasa', 'bun', 'cap'];
const TRIMS = [0xe0b45a, 0xc8ccd8]; // gold, silver
const VARIANTS = new Map();
function lookOf(user) {
  let h = 2166136261;
  for (const ch of String(user.name || user.id || user.nick || '?')) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return { robe: h % ROBES.length, head: HEADS[(h >>> 8) % HEADS.length], trim: (h >>> 16) % 5 === 0 ? 1 : 0, scale: 0.9 + ((h >>> 20) % 9) * 0.025 };
}
function colored(geo, hex, fn) {
  const c = new THREE.Color(hex); const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3); const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(geo.attributes.position, i);
    const cc = fn ? fn(v, c.clone()) : c;
    col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo.index ? geo : geo;
}
let SHARED_MAT = null;
function sakuraParts(look) {
  const key = `${look.robe}-${look.head}-${look.trim}`;
  if (VARIANTS.has(key)) return VARIANTS.get(key);
  const [navy, navyDark] = ROBES[look.robe]; const gold = TRIMS[look.trim]; const face = 0x121633; const skin = 0xe8b48e;
  const hair = 0x1e1620; const straw = 0xd9b46a;
  const parts = [];
  // robe: lathe with soft vertical folds that fade towards the waist
  const prof = [[0.001, 0], [0.37, 0], [0.38, 0.035], [0.34, 0.22], [0.28, 0.5], [0.22, 0.74], [0.17, 0.86], [0.001, 0.9]].map(([x, y]) => new THREE.Vector2(x, y));
  const robe = new THREE.LatheGeometry(prof, 32);
  const p = robe.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x); const k = Math.max(0, 1 - v.y / 0.6);
    const f = 1 + Math.sin(a * 9) * 0.045 * k;
    p.setXYZ(i, v.x * f, v.y, v.z * f);
  }
  robe.computeVertexNormals();
  parts.push(colored(robe, navy, (q, c) => (q.y < 0.05 ? c.set(gold) : c.lerp(new THREE.Color(navyDark), Math.max(0, 0.5 - q.y) * 0.6))));
  // belt with a knot at the back
  const belt = new THREE.TorusGeometry(0.255, 0.03, 8, 32); belt.rotateX(Math.PI / 2); belt.translate(0, 0.52, 0); parts.push(colored(belt, gold));
  // NB the figure's front is -z (it turns -z towards the devil); its back, +z, faces the camera
  const knot = new THREE.SphereGeometry(0.05, 10, 8); knot.translate(0, 0.52, 0.26); parts.push(colored(knot, gold));
  // capelet over the shoulders and a gold collar
  const cape = new THREE.CylinderGeometry(0.17, 0.33, 0.26, 28, 1, true); cape.translate(0, 0.78, 0); parts.push(colored(cape, navyDark));
  const capeHem = new THREE.TorusGeometry(0.33, 0.018, 6, 32); capeHem.rotateX(Math.PI / 2); capeHem.translate(0, 0.65, 0); parts.push(colored(capeHem, gold));
  const collar = new THREE.TorusGeometry(0.155, 0.026, 8, 24); collar.rotateX(Math.PI / 2); collar.translate(0, 0.91, 0); parts.push(colored(collar, gold));
  const lighter = new THREE.Color(navy).lerp(new THREE.Color(0xffffff), 0.18).getHex();
  if (look.head === 'hood') {
    // hood: rounded, slightly elongated backwards, with a soft point falling down the back
    const hood = new THREE.SphereGeometry(0.235, 24, 16); hood.scale(1, 1.02, 1.1); hood.translate(0, 1.1, 0.02);
    parts.push(colored(hood, navy, (q, c) => c.lerp(new THREE.Color(lighter), Math.max(0, q.y - 1.15) * 2.2)));
    const tip = new THREE.ConeGeometry(0.1, 0.3, 14); tip.rotateX(Math.PI / 2 + 0.9); tip.translate(0, 1.2, 0.27); parts.push(colored(tip, lighter));
    const opening = new THREE.CircleGeometry(0.15, 24); opening.rotateY(Math.PI); opening.translate(0, 1.08, -0.252); parts.push(colored(opening, face));
    const rim = new THREE.TorusGeometry(0.155, 0.02, 6, 24); rim.translate(0, 1.08, -0.245); parts.push(colored(rim, gold));
  } else {
    // a head with dark hair seen from behind
    const head = new THREE.SphereGeometry(0.2, 22, 14); head.translate(0, 1.08, 0); parts.push(colored(head, hair, (q, c) => (q.z < -0.12 && q.y < 1.12 ? c.set(skin) : c)));
    if (look.head === 'kasa') {
      // conical straw hat (kasa) with a dark band
      const hat = new THREE.ConeGeometry(0.44, 0.2, 28, 1, true); hat.translate(0, 1.27, 0); parts.push(colored(hat, straw, (q, c) => c.multiplyScalar(0.85 + (q.y - 1.17) * 1.2)));
      const under = new THREE.CircleGeometry(0.44, 28); under.rotateX(Math.PI / 2); under.translate(0, 1.17, 0); parts.push(colored(under, 0x8a6a34));
      const band = new THREE.TorusGeometry(0.2, 0.025, 6, 22); band.rotateX(Math.PI / 2); band.translate(0, 1.21, 0); parts.push(colored(band, navyDark));
    } else if (look.head === 'bun') {
      // hair bun on top with a coloured headband
      const bun = new THREE.SphereGeometry(0.09, 14, 10); bun.translate(0, 1.29, 0.03); parts.push(colored(bun, hair));
      const band = new THREE.TorusGeometry(0.2, 0.03, 8, 24); band.rotateX(Math.PI / 2 - 0.15); band.translate(0, 1.13, 0); parts.push(colored(band, 0xd23a3a));
      const tail1 = new THREE.BoxGeometry(0.05, 0.16, 0.015); tail1.rotateZ(0.3); tail1.translate(0.05, 1.04, 0.2); parts.push(colored(tail1, 0xd23a3a));
      const tail2 = new THREE.BoxGeometry(0.05, 0.14, 0.015); tail2.rotateZ(-0.35); tail2.translate(-0.04, 1.05, 0.2); parts.push(colored(tail2, 0xd23a3a));
    } else {
      // round cap in the robe colour with a trim ring and a button
      const cap = new THREE.SphereGeometry(0.215, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.75, 1); cap.translate(0, 1.13, 0); parts.push(colored(cap, navy));
      const ring = new THREE.TorusGeometry(0.212, 0.022, 6, 24); ring.rotateX(Math.PI / 2); ring.translate(0, 1.13, 0); parts.push(colored(ring, gold));
      const knob = new THREE.SphereGeometry(0.035, 8, 6); knob.translate(0, 1.29, 0); parts.push(colored(knob, gold));
    }
  }
  // gold emblem on the back (+z, towards the camera)
  const emblem = new THREE.CircleGeometry(0.075, 6); emblem.translate(0, 0.72, 0.292); parts.push(colored(emblem, gold));
  const emblemIn = new THREE.CircleGeometry(0.04, 6); emblemIn.rotateZ(Math.PI / 6); emblemIn.translate(0, 0.72, 0.296); parts.push(colored(emblemIn, navyDark));
  const body = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  body.computeBoundingSphere();
  // sleeve: wide cone, gold cuff, hand
  const sl = new THREE.CylinderGeometry(0.06, 0.105, 0.36, 18, 1, false); sl.translate(0, -0.2, 0);
  const cuff = new THREE.TorusGeometry(0.1, 0.018, 6, 20); cuff.rotateX(Math.PI / 2); cuff.translate(0, -0.38, 0);
  const hand = new THREE.SphereGeometry(0.06, 12, 8); hand.translate(0, -0.43, 0);
  const sleeve = mergeGeometries([colored(sl, navy), colored(cuff, gold), colored(hand, skin)].map((g) => (g.index ? g.toNonIndexed() : g)));
  SHARED_MAT ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 });
  const v2 = { body, sleeve, mat: SHARED_MAT };
  VARIANTS.set(key, v2);
  return v2;
}
const MAX_LABELS = 6;
const IDLE_LEAVE = 90; // seconds without playing before a figure walks off
const LABEL_SEC = 3; // a name tag shows this long after the figure last played
const MAX_QUEUE = 4; // pending throws per figure; more likes add their damage to the last one
const TIER = {
  like: { robe: 0x3c4458, ring: '#b9c2d6', glow: null },
  stone: { robe: 0x46536e, ring: '#d9b45a', glow: null },
  rain: { robe: 0x2b6378, ring: '#8fd6ff', glow: 0x6fc8ff },
  arrows: { robe: 0x7a3a1a, ring: '#ff9a4a', glow: 0xff7a2a },
  catapult: { robe: 0x8a3420, ring: '#ffb35a', glow: 0xff8a3a },
  chains: { robe: 0x6a5a22, ring: '#ffe27a', glow: 0xffd65a },
  meteor: { robe: 0xd8d4ec, ring: '#e8f0ff', glow: 0xbfd8ff },
  dragon: { robe: 0x8a1a22, ring: '#ff6a4a', glow: 0xff5a3a },
};
const SUMMON_COLOR = { meteor: [0.8, 0.9, 1], chains: [1, 0.85, 0.4], dragon: [1, 0.4, 0.2] };
const ease = (k) => 1 - (1 - k) ** 3;
const easeIn = (k) => k * k;

const imgCache = new Map();
function loadImg(url, onload) {
  const u = safeImageUrl(url);
  if (!u) return null;
  let e = imgCache.get(u);
  if (!e) {
    const im = new Image(); im.referrerPolicy = 'no-referrer'; im.decoding = 'async'; im.crossOrigin = 'anonymous';
    e = { im, ok: false, waiters: [] };
    im.onload = () => { e.ok = true; for (const f of e.waiters) f(); e.waiters = []; };
    im.onerror = () => {
      // retry without CORS (drawing a tainted image into a texture fails, so only the fallback is used)
      e.waiters = [];
    };
    im.src = u;
    imgCache.set(u, e);
    if (imgCache.size > 300) imgCache.delete(imgCache.keys().next().value);
  }
  if (!e.ok && onload) e.waiters.push(onload);
  return e;
}

function hue(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h % 360; }

function drawMedallion(c, user, ringColor, img) {
  const g = c.getContext('2d');
  const S = c.width; const R = S / 2;
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath(); g.arc(R, R, R * 0.84, 0, Math.PI * 2); g.clip();
  const nick = cleanNick(user.nick || user.name || '?', 22);
  if (img && img.ok) {
    try { g.drawImage(img.im, R * 0.16, R * 0.16, S - R * 0.32, S - R * 0.32); } catch { /* tainted */ }
  } else {
    const h = hue(user.name || nick);
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, `hsl(${h},45%,46%)`); gr.addColorStop(1, `hsl(${h},50%,26%)`);
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.fillStyle = '#fff'; g.font = `900 ${Math.round(S * 0.42)}px Nunito, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(graphemes(nick)[0]?.toLocaleUpperCase('tr') || '?', R, R * 1.06);
  }
  // inner shade
  const sh = g.createRadialGradient(R, R * 0.8, R * 0.4, R, R, R * 0.86);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,10,0.35)');
  g.fillStyle = sh; g.fillRect(0, 0, S, S);
  g.restore();
  // gold ring with an eight-pointed star rosette
  g.lineWidth = R * 0.16; g.strokeStyle = ringColor; g.beginPath(); g.arc(R, R, R * 0.88, 0, Math.PI * 2); g.stroke();
  g.lineWidth = R * 0.04; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(R, R, R * 0.8, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(R, R, R * 0.95, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
}

export class Throwers {
  /** opts.rows: world z of the crowd rows; opts.style: 'sakura' (hooded navy robes) or the default. */
  constructor(scene, vfx, onRelease, opts = {}) {
    this.scene = scene; this.vfx = vfx; this.onRelease = onRelease;
    this.slots = makeSlots(opts.rows);
    this.sakura = opts.style === 'sakura';
    this.list = [];
    this.skin = new THREE.MeshStandardMaterial({ color: 0xc89070, roughness: 0.6 });
    this.gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.35, metalness: 0.85 });
    this.rockMat = vfx.mats.stone;
    this.glowTex = radialTexture();
    this._v = new THREE.Vector3();
  }

  _build(user, tier) {
    if (this.sakura) return this._buildSakura(user, tier);
    const T = TIER[tier] || TIER.stone;
    const g = new THREE.Group();
    const body = new THREE.Group(); g.add(body);
    const robeMat = new THREE.MeshStandardMaterial({ color: this.sakura ? SAKURA_ROBE : T.robe, roughness: 0.7 });
    const lathe = new THREE.LatheGeometry([[0.001, 0], [0.36, 0], [0.34, 0.12], [0.27, 0.5], [0.21, 0.78], [0.14, 0.9], [0.001, 0.94]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
    const robe = new THREE.Mesh(lathe, robeMat); robe.castShadow = true; body.add(robe);
    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.03, 8, 24), this.gold); sash.rotation.x = Math.PI / 2; sash.position.y = 0.56; body.add(sash);
    const yoke = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10), robeMat); yoke.scale.set(1.25, 0.6, 0.9); yoke.position.y = 0.88; yoke.castShadow = true; body.add(yoke);
    if (this.sakura) {
      // rounded hood over the head, gold hem at the bottom, a faint gold ring on the ground
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), robeMat); hood.scale.set(1, 1.05, 1); hood.position.set(0, 1.08, -0.02); hood.castShadow = true; body.add(hood);
      const hem = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.025, 6, 28), this.gold); hem.rotation.x = Math.PI / 2; hem.position.y = 0.05; body.add(hem);
      const ring = new THREE.Mesh(this.ringGeo || (this.ringGeo = new THREE.RingGeometry(0.42, 0.5, 32)), this.ringMat || (this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
    } else {
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10), this.skin); neck.position.y = 1.0; body.add(neck);
    }
    const arms = {};
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.22, 0.88, 0); body.add(sh);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 10), robeMat); arm.position.y = -0.2; arm.castShadow = true; sh.add(arm);
      const hand = new THREE.Group(); hand.position.y = -0.42; sh.add(hand);
      const hm = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), this.skin); hand.add(hm);
      arms[s] = { sh, hand };
    }
    const held = new THREE.Mesh(this.vfx.rockGeos[2], this.rockMat); held.scale.setScalar(0.11); held.position.y = -0.06; held.visible = false; held.castShadow = true;
    arms[1].hand.add(held);
    // avatar medallion (always faces the camera)
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 192;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const med = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: this.sakura ? 0 : 1 }));
    med.scale.set(0.56, 0.56, 1); med.position.y = this.sakura ? 1.55 : 1.3; g.add(med);
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: T.glow || 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.scale.set(1.5, 1.5, 1); aura.position.y = 1.3; g.add(aura);
    const redraw = () => { drawMedallion(canvas, user, T.ring, img); texture.needsUpdate = true; };
    const img = loadImg(user.avatar, () => redraw());
    redraw();
    this.scene.add(g);
    return { g, body, arms, held, med, aura, robeMat, canvas, texture, redraw, tier };
  }

  /** Sakura figure: merged body + two sleeves (3 meshes), ground ring, avatar medallion, aura. */
  _buildSakura(user, tier) {
    const T = TIER[tier] || TIER.stone;
    const look = lookOf(user);
    const P = sakuraParts(look);
    const g = new THREE.Group();
    g.scale.setScalar(look.scale);
    const body = new THREE.Group(); g.add(body);
    const torso = new THREE.Mesh(P.body, P.mat); torso.castShadow = true; body.add(torso);
    const arms = {};
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.25, 0.84, 0); body.add(sh);
      sh.add(new THREE.Mesh(P.sleeve, P.mat));
      const hand = new THREE.Group(); hand.position.y = -0.43; sh.add(hand);
      arms[s] = { sh, hand };
    }
    const held = new THREE.Mesh(this.vfx.rockGeos[2], this.rockMat); held.scale.setScalar(0.11); held.position.y = -0.06; held.visible = false;
    arms[1].hand.add(held);
    const ring = new THREE.Mesh(this.ringGeo || (this.ringGeo = new THREE.RingGeometry(0.42, 0.5, 32)), this.ringMat || (this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 192;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const med = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0 }));
    med.scale.set(0.56, 0.56, 1); med.position.y = 1.55; g.add(med);
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: T.glow || 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.scale.set(1.5, 1.5, 1); aura.position.y = 1.3; g.add(aura);
    const redraw = () => { drawMedallion(canvas, user, T.ring, img); texture.needsUpdate = true; };
    const img = loadImg(user.avatar, () => redraw());
    redraw();
    this.scene.add(g);
    return { g, body, arms, held, med, aura, robeMat: null, canvas, texture, redraw, tier, baseScale: look.scale };
  }

  _setTier(th, tier) {
    // a gifter stays dressed as one when they later only like
    if (th.tier === tier || (tier === 'like' && th.tier !== 'like')) return;
    th.tier = tier;
    const T = TIER[tier] || TIER.stone;
    th.model.robeMat?.color.set(T.robe);
    th.model.aura.material.color.set(T.glow || 0xffd27a);
    const img = loadImg(th.user.avatar);
    drawMedallion(th.model.canvas, th.user, T.ring, img);
    th.model.texture.needsUpdate = true;
  }

  /** Queue actions for a viewer: [{ type: 'throw' | 'summon' | 'command', ... }]. */
  request(user, tier, actions) {
    const key = user.name || user.id || '?';
    let th = this.list.find((x) => x.key === key && x.state !== 'gone');
    if (!th) {
      const used = new Set(this.list.filter((x) => x.state !== 'out' && x.state !== 'gone').map((x) => x.slot));
      let slot = this.slots.findIndex((_, i) => !used.has(i));
      if (slot < 0) {
        // crowd full: a liker idle for longest makes room, else whoever is idle for longest
        const pool = this.list.filter((x) => x.state !== 'out' && x.state !== 'gone' && !x.cur && !x.actions.length);
        const victim = (pool.length ? pool : this.list.filter((x) => x.state !== 'out' && x.state !== 'gone'))
          .sort((a, b) => (a.tier === 'like' ? 0 : 1) - (b.tier === 'like' ? 0 : 1) || b.idle - a.idle || a.born - b.born)[0];
        slot = victim.slot; this._leave(victim, true);
      }
      const s = this.slots[slot];
      const jitter = () => (Math.random() - 0.5) * 0.12;
      th = { key, user, slot, x: s.x + jitter(), z: s.z + jitter(), state: 'in', t: 0, actions: [], cur: null, curT: 0, idle: 0, combo: 0, born: performance.now(), model: this._build(user, tier), tier, alpha: 1, released: false, labelT: 0 };
      th.model.g.position.set(th.x, 2.4, th.z);
      this.list.push(th);
    } else if (th.state === 'out') { th.state = 'idle'; th.model.g.scale.setScalar(th.model.baseScale || 1); }
    th.user = user;
    this._setTier(th, tier);
    th.combo++;
    th.idle = 0;
    th.comboT = 1.2;
    // name tag: gifters always, likers only when their name is due (the game throttles those)
    if (tier !== 'like' || actions.some((a) => a.name)) { th.labelT = LABEL_SEC; th.labelAt = performance.now(); }
    for (const a of actions) {
      // a busy liker: fold extra pebbles into the last queued throw instead of a long queue
      const last = th.actions[th.actions.length - 1];
      if (th.actions.length >= MAX_QUEUE && last && last.type === a.type && last.kind === a.kind) {
        last.dmg += a.dmg || 0; last.stones = (last.stones || 0) + (a.stones || 0); last.name = last.name || a.name;
      } else th.actions.push(a);
    }
    return th;
  }

  /** Number of figures in the crowd. */
  get size() { return this.list.filter((x) => x.state !== 'out' && x.state !== 'gone').length; }

  _leave(th, now = false) {
    th.state = 'out'; th.t = 0;
    if (now) th.t = 0.3;
    this.vfx.puff({ x: th.x, y: 0.6, z: th.z }, 6, { color: [0.3, 0.28, 0.3], size: 0.3, grow: 2.2, life: 0.6, speed: 1, alpha: 0.5 });
  }

  /** Remove everyone at once (sim <-> live switch). */
  clear() {
    for (const th of this.list) this.scene.remove(th.model.g);
    this.list = [];
  }

  update(dt, t, target) {
    for (const th of this.list) {
      const m = th.model; const g = m.g;
      th.t += dt;
      // face the devil
      const dx = target.x - th.x; const dz = target.z - th.z;
      const yaw = Math.atan2(-dx, -dz);
      g.rotation.y += (yaw - g.rotation.y) * Math.min(1, dt * 8);
      let lean = 0; let hop = 0; let squash = 1;
      const R = m.arms[1]; const L = m.arms[-1];
      let ra = 0; let la = 0; let raz = 0.12; let laz = -0.12;
      if (th.state === 'in') {
        const k = Math.min(1, th.t / 0.42);
        g.position.y = 2.4 * (1 - easeIn(k));
        if (k >= 1) { th.state = 'idle'; th.t = 0; this.vfx.dust({ x: th.x, z: th.z }, 7); this.vfx.ring({ x: th.x, y: 0, z: th.z }, { color: 0xd9b45a, size: 1.1, life: 0.45, ground: true }); th.land = 0.25; }
      } else if (th.state === 'out') {
        const k = Math.min(1, th.t / 0.35);
        g.scale.setScalar(Math.max(0.01, (m.baseScale || 1) * (1 - ease(k))));
        if (k >= 1) { th.state = 'gone'; this.scene.remove(g); }
        continue;
      }
      if (th.land > 0) { th.land -= dt; squash = 1 - Math.sin((th.land / 0.25) * Math.PI) * 0.18; }

      // run actions
      if (!th.cur && th.actions.length && th.state === 'idle') { th.cur = th.actions.shift(); th.curT = 0; th.released = false; }
      if (th.cur) {
        th.idle = 0;
        const fast = th.actions.length > 2 ? 1.7 : 1;
        th.curT += dt * fast;
        const a = th.cur;
        if (a.type === 'throw') {
          // pebbles (likes) are flicked quickly, gift stones get the full overhand swing
          const small = a.kind === 'like';
          const Wd = small ? 0.16 : 0.3; const Sw = small ? 0.1 : 0.16; const Rc = small ? 0.16 : 0.28;
          if (th.curT < Wd) {
            const k = ease(th.curT / Wd);
            ra = -2.4 * k; lean = 0.22 * k; la = 0.6 * k; m.held.visible = true;
          } else if (th.curT < Wd + Sw) {
            const k = easeIn((th.curT - Wd) / Sw);
            ra = -2.4 - 2.1 * k; lean = 0.22 - 0.5 * k; la = 0.6 - 0.9 * k; hop = Math.sin(k * Math.PI) * 0.06;
            if (k > 0.45 && !th.released) {
              th.released = true; m.held.visible = false;
              R.hand.getWorldPosition(this._v);
              this.onRelease(a, { x: this._v.x, y: this._v.y, z: this._v.z }, th);
              this.vfx.puff({ x: this._v.x, y: this._v.y, z: this._v.z }, 2, { color: [0.6, 0.58, 0.55], size: 0.12, grow: 2.5, life: 0.35, speed: 0.6, alpha: 0.35 });
            }
          } else if (th.curT < Wd + Sw + Rc) {
            const k = ease((th.curT - Wd - Sw) / Rc);

            ra = (-4.5 + 2 * Math.PI) * (1 - k); lean = -0.28 * (1 - k); la = -0.3 * (1 - k);
          } else th.cur = null;
        } else if (a.type === 'summon' || a.type === 'command') {
          const Dur = a.type === 'summon' ? 0.85 : 0.7;
          const k = th.curT / Dur;
          const up = Math.sin(Math.min(1, k) * Math.PI);
          if (a.type === 'summon') { ra = -Math.PI * 0.92 * Math.min(1, k * 2.5) * (k < 0.8 ? 1 : (1 - k) / 0.2); la = ra; raz = 0.35; laz = -0.35; hop = up * 0.12; m.aura.material.opacity = up * 0.9; }
          else { ra = 1.35 * Math.min(1, k * 3) * (k < 0.8 ? 1 : (1 - k) / 0.2); lean = -0.15 * up; }
          if (k > 0.45 && !th.released) {
            th.released = true;
            R.hand.getWorldPosition(this._v);
            if (a.type === 'summon') this.vfx.summon({ x: th.x, z: th.z }, SUMMON_COLOR[a.kind] || [0.5, 0.85, 1]);
            this.onRelease(a, { x: this._v.x, y: this._v.y, z: this._v.z }, th);
          }
          if (k >= 1) { th.cur = null; m.aura.material.opacity = 0; }
        } else th.cur = null;
      } else if (th.state === 'idle') {
        th.idle += dt;
        ra = Math.sin(t * 2 + th.slot) * 0.08; la = -ra;
        if (th.idle > IDLE_LEAVE) this._leave(th);
      }
      th.comboT = Math.max(0, (th.comboT || 0) - dt);
      th.labelT = Math.max(0, (th.labelT || 0) - dt);
      R.sh.rotation.set(ra, 0, raz); L.sh.rotation.set(la, 0, laz);
      m.body.rotation.x = lean;
      m.body.position.y = hop + (th.state === 'idle' && !th.cur ? Math.sin(t * 3 + th.slot) * 0.012 : 0);
      m.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      m.med.position.y = (this.sakura ? 1.55 : 1.3) + hop + (squash - 1) * 0.6 + Math.sin(t * 2.2 + th.slot) * 0.02;
      if (this.sakura) {
        // the avatar floats above the hood only while this viewer is playing
        const show = (th.tier !== 'like' && (th.cur || th.actions.length)) ? 1 : Math.min(1, (th.labelT || 0) / 0.5);
        m.med.material.opacity += (show - m.med.material.opacity) * Math.min(1, dt * 8);
      }
      m.aura.position.y = m.med.position.y;
    }
    this.list = this.list.filter((th) => th.state !== 'gone');
  }

  /** Name labels for the 2D overlay (design pixels). */
  labels() {
    const out = [];
    for (const th of this.list) {
      if (th.state === 'gone' || th.state === 'out') continue;
      // only a few figures carry a name tag at a time (a crowd of tags would hide the scene):
      // gifters while they throw, anyone for a moment after their name was due
      const gift = th.tier !== 'like';
      const busy = gift && (th.cur || th.actions.length);
      const active = busy ? 1 : Math.min(1, (th.labelT || 0) / 0.4);
      if (active <= 0) continue;
      // above the medallion
      const s = toScreen(th.x, this.sakura ? 1.95 : 1.75, th.z);
      const a = (th.state === 'in' ? Math.min(1, th.t / 0.3) : 1) * active;
      out.push({ x: s.x, y: s.y - 6, name: cleanNick(th.user.nick || th.user.name, 12), combo: th.combo, pulse: th.comboT || 0, alpha: a, color: TIER[th.tier]?.ring || '#d9b45a', gift, at: th.labelAt || 0 });
    }
    // at most MAX_LABELS: gifters first, then the most recent; drawn with gifters on top
    return out.sort((a, b) => (b.gift - a.gift) || (b.at - a.at)).slice(0, MAX_LABELS).sort((a, b) => (a.gift ? 1 : 0) - (b.gift ? 1 : 0));
  }
}
