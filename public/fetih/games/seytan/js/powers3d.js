// Big gift powers drawn in 3D: the talisman chains that bind the devil (600+ coins) and the eastern
// dragon that sweeps over the shrine and breathes fire on him (1500+). Game rules (damage, binding)
// stay in game.js; this module only builds the models, animates them and reports timing events.
// World coordinates: x right, y up, z towards the camera.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toWorld, camPose } from './proj.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (k) => 1 - (1 - k) ** 3;
const Y = new THREE.Vector3(0, 1, 0);

/** Paints vertex colours on a geometry: fn(x, y, z) -> THREE.Color-compatible hex. */
function paint(geo, fn) {
  const p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    col.set(fn(p.getX(i), p.getY(i), p.getZ(i)));
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
const solid = (geo, hex) => paint(geo, () => hex);
/** Geometry placed with position / rotation (Euler, radians) / scale, ready to merge. */
function place(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  return geo.applyMatrix4(m);
}
/** A flame-shaped cone: base colour to a bright tip. */
function flameCone(r, h, base, tip, seg = 5) {
  const g = new THREE.ConeGeometry(r, h, seg);
  const a = new THREE.Color(base); const b = new THREE.Color(tip); const c = new THREE.Color();
  return paint(g, (x, y) => c.copy(a).lerp(b, clamp((y / h) + 0.5, 0, 1)).getHex());
}
const merge = (list) => {
  const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)));
  g.computeVertexNormals();
  return g;
};

// ------------------------------------------------------------------------------------- textures

function sealTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.translate(256, 256);
  g.strokeStyle = '#ffe9a8'; g.fillStyle = '#ffe9a8'; g.shadowColor = '#ffb83a'; g.shadowBlur = 18; g.lineCap = 'round';
  const circle = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  circle(244, 9); circle(226, 3); circle(176, 4); circle(96, 5); circle(52, 3);
  // glyph band: short pseudo-script strokes between the two outer rings
  let seed = 7; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 24; i++) {
    g.save(); g.rotate((i / 24) * Math.PI * 2); g.translate(0, -201); g.lineWidth = 4;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      const x0 = (r() - 0.5) * 18; const y0 = (r() - 0.5) * 22;
      g.moveTo(x0, y0); g.lineTo(x0 + (r() - 0.5) * 20, y0 + (r() - 0.5) * 18); g.stroke();
    }
    g.restore();
  }
  // eight-pointed star (two squares)
  g.lineWidth = 5;
  for (const a of [0, Math.PI / 4]) {
    g.save(); g.rotate(a); g.beginPath(); g.rect(-120, -120, 240, 240); g.stroke(); g.restore();
  }
  // three commas (mitsudomoe) in the middle
  for (let i = 0; i < 3; i++) {
    g.save(); g.rotate((i / 3) * Math.PI * 2);
    g.beginPath(); g.arc(0, -24, 14, 0, Math.PI * 2); g.fill();
    g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 36, -Math.PI / 2, -Math.PI / 2 + 1.6); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ofudaTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 168;
  const g = c.getContext('2d');
  g.fillStyle = '#f4e8c8'; g.fillRect(0, 0, 64, 168);
  g.strokeStyle = '#c0282a'; g.lineWidth = 4; g.strokeRect(5, 5, 54, 158);
  g.strokeStyle = '#2a1a1a'; g.lineWidth = 5; g.lineCap = 'round';
  let seed = 3; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 22; y < 118; y += 18) {
    g.beginPath(); g.moveTo(32 - 12 + r() * 6, y); g.lineTo(32 + 12 - r() * 6, y + r() * 4); g.stroke();
    g.beginPath(); g.moveTo(32 + (r() - 0.5) * 10, y - 6); g.lineTo(32 + (r() - 0.5) * 10, y + 8); g.stroke();
  }
  g.fillStyle = '#c0282a'; g.beginPath(); g.arc(32, 140, 12, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------------------------- chains

const CHAINS = 4;
const LINK = 0.17; // world distance between link centres
const MAX_LINKS = 26;

class Chains {
  constructor(scene, vfx) {
    this.scene = scene; this.vfx = vfx;
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    // the seal under him
    this.sealMat = new THREE.MeshBasicMaterial({ map: sealTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: 0xffd27a });
    this.seal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.sealMat);
    this.seal.rotation.x = -Math.PI / 2; this.seal.renderOrder = 3;
    this.group.add(this.seal);
    // a soft column of light rising from the seal
    const colGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true); colGeo.translate(0, 0.5, 0);
    const cc = document.createElement('canvas'); cc.width = 4; cc.height = 64;
    const cg = cc.getContext('2d'); const gr = cg.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(255,220,140,0)'); gr.addColorStop(1, 'rgba(255,220,140,1)'); cg.fillStyle = gr; cg.fillRect(0, 0, 4, 64);
    this.colMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, opacity: 0 });
    this.column = new THREE.Mesh(colGeo, this.colMat); this.group.add(this.column);
    // links: elongated gold rings, two alternating orientations
    const linkGeo = new THREE.TorusGeometry(0.085, 0.026, 6, 14); linkGeo.scale(1, 1.55, 1);
    this.linkMat = new THREE.MeshStandardMaterial({ color: 0xe2b85c, metalness: 0.7, roughness: 0.35, emissive: 0x8a5a10, emissiveIntensity: 0.2 });
    this.links = new THREE.InstancedMesh(linkGeo, this.linkMat, CHAINS * MAX_LINKS);
    this.links.frustumCulled = false; this.links.castShadow = true; this.links.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.links);
    // stakes in the ground, each with a paper talisman
    const stakeGeo = merge([
      solid(new THREE.CylinderGeometry(0.07, 0.1, 0.62, 6).translate(0, 0.31, 0), 0x4a4250),
      solid(new THREE.ConeGeometry(0.1, 0.16, 6).translate(0, 0.7, 0), 0xd8b060),
      solid(new THREE.TorusGeometry(0.1, 0.025, 5, 10).rotateX(Math.PI / 2).translate(0, 0.5, 0), 0xd8b060),
    ]);
    const stakeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });
    this.ofudaMat = new THREE.MeshBasicMaterial({ map: ofudaTexture(), side: THREE.DoubleSide, toneMapped: false, transparent: true });
    const ofudaGeo = new THREE.PlaneGeometry(0.2, 0.52);
    this.stakes = [];
    for (let i = 0; i < CHAINS; i++) {
      const s = new THREE.Group();
      const m = new THREE.Mesh(stakeGeo, stakeMat); m.castShadow = true; s.add(m);
      const tag = new THREE.Mesh(ofudaGeo, this.ofudaMat); tag.position.set(0, 0.32, 0.11); s.add(tag);
      this.group.add(s); this.stakes.push(s);
    }
    // talismans circling him
    this.tags = [];
    for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(ofudaGeo, this.ofudaMat); t.scale.setScalar(1.25); this.group.add(t); this.tags.push(t); }
    this.light = new THREE.PointLight(0xffd27a, 0, 9, 2); this.group.add(this.light);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._d = new THREE.Vector3(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this.active = false;
  }

  /** Binds the devil standing over ground point (x, z) for `sec` seconds (extends if already bound). */
  bind(x, z, sec) {
    if (this.active && this.state !== 'break') { this.left = Math.max(this.left, sec); this.pulse = 1; return; }
    this.active = true; this.state = 'rise'; this.t = 0; this.left = sec; this.pulse = 1;
    this.cx = x; this.cz = z;
    this.anchors = [];
    for (let i = 0; i < CHAINS; i++) {
      const a = (i / CHAINS) * Math.PI * 2 + Math.PI / 4;
      this.anchors.push({ x: x + Math.cos(a) * 1.75, z: z + Math.sin(a) * 1.25, delay: i * 0.07 });
    }
    this.anchors.forEach((a, i) => { this.stakes[i].position.set(a.x, -0.8, a.z); this.stakes[i].rotation.y = rand(0, Math.PI); });
    this.group.visible = true;
    this.vfx.ring({ x, y: 0, z }, { color: 0xffd27a, size: 4.2, life: 0.8, ground: true, width: 2 });
  }

  /** Ends the binding early (round over): the chains burst. */
  release() { if (this.active && this.state !== 'break') { this.state = 'break'; this.t = 0; this._burst(); } }

  get bound() { return this.active && this.state === 'hold'; }

  _burst() {
    if (!this.devil) return;
    for (const a of this.anchors) {
      for (let k = 0.15; k < 1; k += 0.2) {
        const p = { x: a.x + (this.devil.x - a.x) * k, y: 0.6 + (this.devil.y - 0.3 - 0.6) * k, z: a.z + (this.devil.z - a.z) * k };
        this.vfx.sparksAt(p, 4, { speed: 4, color: [1, 0.85, 0.4], life: 0.6 });
        this.vfx.glowAt(p, { color: [1, 0.85, 0.45], size: 0.8, life: 0.35 });
      }
    }
    this.vfx.flash({ x: this.devil.x, y: this.devil.y, z: this.devil.z }, 0xffd27a, 40, 0.5);
  }

  /** dt, game time, devil torso (world). Returns 'bound' once when the chains lock on. */
  update(dt, t, devil) {
    if (!this.active) return null;
    this.devil = devil;
    this.t += dt;
    this.pulse = Math.max(0, this.pulse - dt * 1.5);
    let ev = null;
    let ext = 1; let fade = 1;
    if (this.state === 'rise') {
      ext = clamp(this.t / 0.5, 0, 1);
      if (this.t >= 0.5) { this.state = 'hold'; this.t = 0; ev = 'bound'; this.pulse = 1; this.vfx.shake(0.06); }
    } else if (this.state === 'hold') {
      this.left -= dt;
      if (this.left <= 0) { this.state = 'break'; this.t = 0; this._burst(); }
    } else if (this.state === 'break') {
      fade = 1 - clamp(this.t / 0.45, 0, 1);
      ext = fade;
      if (this.t >= 0.45) { this.active = false; this.group.visible = false; return 'free'; }
    }
    const appear = this.state === 'rise' ? easeOut(clamp(this.t / 0.35, 0, 1)) : 1;
    // seal and light column
    const sealS = 4.4 * (this.state === 'rise' ? easeOut(clamp(this.t / 0.4, 0, 1)) : 1);
    this.seal.position.set(this.cx, 0.04, this.cz);
    this.seal.scale.set(sealS, sealS, 1);
    this.seal.rotation.z = t * 0.6;
    this.sealMat.opacity = (0.75 + 0.25 * Math.sin(t * 6) + this.pulse * 0.4) * fade;
    this.column.position.set(this.cx, 0, this.cz);
    this.column.scale.set(1.5, 4.5 * appear, 1.5);
    this.colMat.opacity = (0.09 + this.pulse * 0.18) * fade;
    // the light sits low on the seal: lights the ground and the stakes, not a glare on his chest
    this.light.position.set(this.cx, 0.35, this.cz + 1.2);
    this.light.intensity = (5 + this.pulse * 10 + Math.sin(t * 9)) * fade;
    this.linkMat.emissiveIntensity = 0.18 + this.pulse * 0.6 + 0.08 * Math.sin(t * 8);
    // stakes punch up out of the ground
    for (const [i, a] of this.anchors.entries()) {
      const k = this.state === 'rise' ? easeOut(clamp((this.t - a.delay) / 0.25, 0, 1)) : 1;
      this.stakes[i].position.y = -0.8 + 0.8 * k - (1 - fade) * 0.4;
    }
    // chains from each stake to the devil's chest, with a little sag and a struggle shake
    let n = 0;
    const struggle = this.state === 'hold' ? 0.05 : 0;
    for (const [i, a] of this.anchors.entries()) {
      const A = this._a.set(a.x, 0.62, a.z);
      const B = this._b.set(devil.x + (a.x - devil.x) * 0.12, devil.y - 0.2 + (i % 2 ? 0.25 : -0.15), devil.z + (a.z - devil.z) * 0.12);
      const len = A.distanceTo(B);
      const count = Math.min(MAX_LINKS, Math.ceil(len / LINK));
      const shown = Math.floor(count * clamp((this.state === 'rise' ? (this.t - a.delay) / 0.4 : ext), 0, 1));
      const dir = this._d.copy(B).sub(A).normalize();
      this._q.setFromUnitVectors(Y, dir);
      const sag = this.state === 'hold' ? 0.05 : 0.25;
      for (let k = 0; k < shown; k++) {
        const u = (k + 0.5) / count;
        const p = this._p.copy(A).lerp(B, u);
        p.y -= sag * 4 * u * (1 - u);
        p.x += Math.sin(t * 23 + k + i) * struggle * u; p.z += Math.cos(t * 19 + k) * struggle * u;
        this._q2.setFromAxisAngle(dir, (k % 2) * Math.PI / 2 + i);
        this._m.compose(p, this._q2.multiply(this._q), this._s);
        this.links.setMatrixAt(n++, this._m);
      }
      // sparks race up the chain while it shoots out
      if (this.state === 'rise' && shown > 0 && shown < count && Math.random() < 0.7) {
        this.vfx.sparksAt(this._p, 2, { speed: 2.5, color: [1, 0.85, 0.45], life: 0.35 });
      }
    }
    this.links.count = n; this.links.instanceMatrix.needsUpdate = true;
    // talismans orbiting him, always turned to the camera
    const cam = camPose().pos;
    for (const [i, tag] of this.tags.entries()) {
      const a = t * 1.6 + (i / this.tags.length) * Math.PI * 2;
      const r = 1.15 * appear;
      tag.position.set(devil.x + Math.cos(a) * r, devil.y - 0.1 + Math.sin(t * 3 + i) * 0.25, devil.z + Math.sin(a) * r * 0.7);
      tag.lookAt(cam.x, cam.y, cam.z);
      tag.rotation.z += Math.sin(t * 4 + i) * 0.25;
      tag.visible = fade > 0.05 && appear > 0.05;
    }
    this.ofudaMat.opacity = fade;
    if (this.state === 'hold' && Math.random() < dt * 20) {
      const a = Math.random() * Math.PI * 2;
      this.vfx.glow.add({ x: this.cx + Math.cos(a) * 2, y: 0.1, z: this.cz + Math.sin(a) * 1.4, vy: rand(0.8, 2), s0: rand(0.08, 0.16), s1: 0.03, life: rand(0.7, 1.2), c0: [1, 0.86, 0.5] });
    }
    return ev;
  }
}

// ------------------------------------------------------------------------------------- dragon

const SEGS = 34;
const S = 1.4; // dragon scale
const SPACING = 0.34 * S;
const RED = 0xc7202a; const RED_DK = 0x8c1420; const GOLD = 0xf0c060; const CREAM = 0xf4d898; const ORANGE = 0xff8a24;

function segmentGeo() {
  const body = new THREE.SphereGeometry(1, 18, 12);
  body.scale(0.5, 0.45, 0.4);
  paint(body, (x, y, z) => {
    if (y < -0.24) return Math.abs(Math.sin(z * 18)) > 0.82 ? 0xd8b070 : CREAM; // belly plates
    if (y > 0.3 && Math.abs(x) < 0.1) return GOLD; // gold ridge along the spine
    return y > 0.05 ? RED : RED_DK;
  });
  const fin = place(flameCone(0.13, 0.46, GOLD, ORANGE, 4), { p: [0, 0.5, -0.06], r: [-0.55, 0, 0], s: [0.35, 1, 1] });
  const sideL = place(flameCone(0.08, 0.3, ORANGE, 0xffd27a, 4), { p: [0.44, -0.05, -0.1], r: [-1.2, 0, -0.9], s: [0.4, 1, 1] });
  const sideR = place(flameCone(0.08, 0.3, ORANGE, 0xffd27a, 4), { p: [-0.44, -0.05, -0.1], r: [-1.2, 0, 0.9], s: [0.4, 1, 1] });
  return merge([body, fin, sideL, sideR]);
}

function headGeo() {
  const parts = [];
  const skull = new THREE.SphereGeometry(1, 20, 14); skull.scale(0.48, 0.4, 0.55);
  parts.push(paint(skull, (x, y) => (y < -0.22 ? CREAM : y > 0.1 ? RED : RED_DK)));
  // snout, tapering towards the nose
  const snout = new THREE.BoxGeometry(0.56, 0.3, 0.8, 4, 2, 6);
  const sp = snout.attributes.position;
  for (let i = 0; i < sp.count; i++) { const z = sp.getZ(i); const k = 1 - 0.28 * ((z + 0.4) / 0.8); sp.setX(i, sp.getX(i) * k); if (sp.getY(i) > 0) sp.setY(i, sp.getY(i) * (1 - 0.25 * ((z + 0.4) / 0.8))); }
  snout.translate(0, 0.02, 0.62);
  parts.push(paint(snout, (x, y) => (y < -0.08 ? CREAM : RED)));
  parts.push(place(solid(new THREE.SphereGeometry(0.1, 10, 8), GOLD), { p: [0, 0.17, 0.78], s: [1.4, 0.7, 1.6] })); // nose ridge
  for (const sx of [-1, 1]) {
    parts.push(place(solid(new THREE.SphereGeometry(0.085, 10, 8), RED_DK), { p: [sx * 0.17, 0.1, 1.0] })); // nostrils
    parts.push(place(flameCone(0.09, 0.42, GOLD, 0xfff0c0, 5), { p: [sx * 0.26, 0.33, 0.12], r: [-1.1, 0, -sx * 0.35] })); // brows
    parts.push(place(flameCone(0.12, 0.5, ORANGE, 0xffe080, 4), { p: [sx * 0.46, -0.04, -0.12], r: [-1.3, 0, -sx * 1.0], s: [0.45, 1, 1] })); // cheek fins
    for (let k = 0; k < 4; k++) parts.push(place(solid(new THREE.ConeGeometry(0.035, 0.12, 5), 0xfff6e6), { p: [sx * 0.2, -0.17, 0.55 + k * 0.13], r: [Math.PI, 0, 0] })); // upper teeth
  }
  // mane: flame tufts around the back of the head
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.05 + (i / 8) * 0.9);
    parts.push(place(flameCone(0.12, 0.6, ORANGE, 0xffe27a, 5), { p: [Math.cos(a) * 0.42, Math.sin(a) * 0.36 + 0.02, -0.38], r: [-1.25 + Math.sin(a) * 0.3, 0, (a - Math.PI / 2) * -0.9] }));
  }
  // beard under the chin
  for (const sx of [-0.1, 0, 0.1]) parts.push(place(flameCone(0.07, 0.42, CREAM, 0xffffff, 4), { p: [sx, -0.36, 0.25], r: [-2.4, 0, sx * 2] }));
  return merge(parts);
}

function jawGeo() {
  const parts = [];
  const jaw = new THREE.BoxGeometry(0.48, 0.13, 0.78, 3, 1, 5);
  const jp = jaw.attributes.position;
  for (let i = 0; i < jp.count; i++) { const z = jp.getZ(i); jp.setX(i, jp.getX(i) * (1 - 0.3 * ((z + 0.39) / 0.78))); }
  jaw.translate(0, -0.06, 0.42);
  parts.push(paint(jaw, (x, y) => (y > -0.02 ? 0x5a0a10 : CREAM)));
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) parts.push(place(solid(new THREE.ConeGeometry(0.03, 0.1, 5), 0xfff6e6), { p: [sx * 0.17, 0.03, 0.45 + k * 0.14] }));
  return merge(parts);
}

function hornGeo(side) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.18, 0.3, -0.12), new THREE.Vector3(side * 0.34, 0.62, -0.42),
    new THREE.Vector3(side * 0.44, 0.86, -0.86), new THREE.Vector3(side * 0.5, 1.02, -1.3),
  ]);
  const tube = new THREE.TubeGeometry(curve, 16, 0.055, 7, false);
  const branch = new THREE.CatmullRomCurve3([new THREE.Vector3(side * 0.38, 0.72, -0.6), new THREE.Vector3(side * 0.62, 0.95, -0.55), new THREE.Vector3(side * 0.76, 1.15, -0.62)]);
  const tb = new THREE.TubeGeometry(branch, 8, 0.035, 6, false);
  const tip = place(new THREE.ConeGeometry(0.055, 0.18, 7), { p: [side * 0.51, 1.06, -1.4], r: [-1.2, 0, 0] });
  const c = new THREE.Color(); const a = new THREE.Color(0xf6ead0); const b = new THREE.Color(0xd8a040);
  return merge([tube, tb, tip].map((g) => paint(g, (x, y) => c.copy(a).lerp(b, clamp((y - 0.3) / 0.8, 0, 1)).getHex())));
}

function whiskerGeo(side) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.24, -0.02, 0.92), new THREE.Vector3(side * 0.62, 0.06, 1.0),
    new THREE.Vector3(side * 1.05, -0.08, 0.5), new THREE.Vector3(side * 1.35, -0.3, -0.35), new THREE.Vector3(side * 1.55, -0.22, -1.25),
  ]);
  return new THREE.TubeGeometry(curve, 30, 0.024, 5, false);
}

function legGeo() {
  const parts = [
    place(solid(new THREE.CylinderGeometry(0.075, 0.06, 0.42, 7), RED), { p: [0, -0.2, 0.06], r: [0.45, 0, 0] }),
    place(solid(new THREE.CylinderGeometry(0.06, 0.05, 0.34, 7), RED_DK), { p: [0, -0.5, 0.2], r: [-0.3, 0, 0] }),
    place(flameCone(0.1, 0.34, ORANGE, 0xffe27a, 4), { p: [0, -0.18, -0.12], r: [-2.2, 0, 0], s: [0.5, 1, 1] }), // elbow fluff
  ];
  for (const a of [-0.5, 0, 0.5]) parts.push(place(solid(new THREE.ConeGeometry(0.03, 0.16, 5), 0xf6ead0), { p: [Math.sin(a) * 0.08, -0.7, 0.26 + Math.cos(a) * 0.05], r: [2.2, a, 0] }));
  return merge(parts);
}

function tuftGeo() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    parts.push(place(flameCone(0.14, 0.8, ORANGE, 0xffe27a, 5), { p: [Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.3], r: [-Math.PI / 2 + Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35] }));
  }
  return merge(parts);
}

let DRAGON_PARTS = null;
function dragonParts() {
  if (DRAGON_PARTS) return DRAGON_PARTS;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.25, emissive: 0x3a0606, emissiveIntensity: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd27a, roughness: 0.35, metalness: 0.6, emissive: 0x6a4210, emissiveIntensity: 0.6 });
  DRAGON_PARTS = { seg: segmentGeo(), head: headGeo(), jaw: jawGeo(), hornL: hornGeo(1), hornR: hornGeo(-1), whL: whiskerGeo(1), whR: whiskerGeo(-1), leg: legGeo(), tuft: tuftGeo(), mat, gold };
  return DRAGON_PARTS;
}

class Dragon {
  /** user: who called it; target(): current devil torso (world). */
  constructor(scene, vfx) {
    const P = dragonParts();
    this.scene = scene; this.vfx = vfx;
    this.group = new THREE.Group(); scene.add(this.group);
    this.body = new THREE.InstancedMesh(P.seg, P.mat, SEGS);
    this.body.frustumCulled = false; this.body.castShadow = true; this.body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.body);
    // head
    this.head = new THREE.Group(); this.head.scale.setScalar(S); this.group.add(this.head);
    const hm = new THREE.Mesh(P.head, P.mat); hm.castShadow = true; this.head.add(hm);
    this.head.add(new THREE.Mesh(P.hornL, P.mat), new THREE.Mesh(P.hornR, P.mat));
    this.jaw = new THREE.Group(); this.jaw.position.set(0, -0.16, 0.08); this.head.add(this.jaw);
    this.jaw.add(new THREE.Mesh(P.jaw, P.mat));
    this.whiskers = [new THREE.Mesh(P.whL, P.gold), new THREE.Mesh(P.whR, P.gold)];
    for (const w of this.whiskers) this.head.add(w);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff07a, toneMapped: false });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x140404 });
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), eyeMat); e.position.set(sx * 0.27, 0.16, 0.36); this.head.add(e);
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.11, 0.02), pupilMat); p.position.set(sx * 0.3, 0.16, 0.43); this.head.add(p);
    }
    this.mouth = new THREE.Object3D(); this.mouth.position.set(0, -0.12, 1.1); this.head.add(this.mouth);
    // legs (front pair behind the neck, back pair mid-body) and the tail tuft follow their segments
    this.legs = [];
    for (const [seg, side] of [[5, 1], [5, -1], [20, 1], [20, -1]]) {
      const m = new THREE.Mesh(P.leg, P.mat); m.matrixAutoUpdate = false; m.castShadow = true; this.group.add(m);
      this.legs.push({ m, seg, side, local: new THREE.Matrix4() });
    }
    this.tuft = new THREE.Mesh(P.tuft, P.mat); this.tuft.matrixAutoUpdate = false; this.group.add(this.tuft);
    this.light = new THREE.PointLight(0xff7a30, 0, 14, 2); this.group.add(this.light);
    this._m = new THREE.Matrix4(); this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._u = new THREE.Vector3(); this._q = new THREE.Quaternion();
    this._sc = new THREE.Vector3(); this._lm = new THREE.Matrix4(); this._lq = new THREE.Quaternion(); this._le = new THREE.Euler();
    this.pts = Array.from({ length: SEGS }, () => new THREE.Vector3());
    this.group.visible = false;
    this.done = true;
  }

  start(devil) {
    // flight path in screen terms (stays readable whatever the camera): in from the upper right,
    // a pause above-right of the devil to breathe fire, out to the upper left
    const at = (sx, sy, z) => { const p = toWorld(sx, sy, z); return new THREE.Vector3(p.x, p.y, p.z); };
    // the pause is above-right of him and a little nearer the camera, clear of his body
    const hover = at(700, 610, devil.z + 1.3);
    this.hover = hover;
    // in: down over the torii from the upper left in an S, out: away over the left houses
    this.inCurve = new THREE.CatmullRomCurve3([at(260, -80, -26), at(330, 170, -12), at(760, 300, devil.z - 4.5), at(880, 470, devil.z - 1.4), hover], false, 'centripetal');
    this.outCurve = new THREE.CatmullRomCurve3([hover, at(520, 470, devil.z - 1), at(260, 330, -6), at(140, 120, -14), at(-280, -120, -26)], false, 'centripetal');
    this.t = 0; this.done = false; this.breath = false; this.tick = 0;
    this.T1 = 2.1; this.T2 = this.T1 + 2.6; this.T3 = this.T2 + 2.2;
    // a trail behind the start point so the whole body exists from the first frame
    const p0 = this.inCurve.getPointAt(0); const back = this.inCurve.getTangentAt(0).multiplyScalar(-1);
    this.hist = [];
    for (let i = SEGS + 4; i >= 0; i--) this.hist.push(p0.clone().addScaledVector(back, i * SPACING));
    this.group.visible = true;
    this.head.position.copy(p0);
  }

  /** Head position at time t: fast in, a slow drift around the hover point while breathing, fast out. */
  _headAt(t) {
    if (t < this.T1) return this.inCurve.getPointAt(easeOut(t / this.T1));
    if (t < this.T2) {
      const k = t - this.T1;
      const fade = Math.min(1, k / 0.6) * Math.min(1, (this.T2 - t) / 0.6);
      return this.hover.clone().add(this._v.set(Math.sin(k * 1.7) * 0.45 * fade, Math.sin(k * 2.3) * 0.22 * fade, 0));
    }
    return this.outCurve.getPointAt(Math.min(1, ((t - this.T2) / (this.T3 - this.T2)) ** 1.3));
  }

  /** Returns events: 'breathStart', 'tick' (every 0.2 s of fire), 'breathEnd', 'done'. */
  update(dt, t, devil) {
    if (this.done) return [];
    const ev = [];
    this.t += dt;
    const headPos = this._headAt(this.t);
    headPos.y += Math.sin(this.t * 3) * 0.12;
    // breath window
    const breathing = this.t > this.T1 - 0.2 && this.t < this.T2 - 0.1;
    if (breathing && !this.breath) { this.breath = true; ev.push('breathStart'); }
    if (!breathing && this.breath) { this.breath = false; ev.push('breathEnd'); }
    // body: follow the head's trail
    const last = this.hist[this.hist.length - 1];
    if (last.distanceTo(headPos) > 0.04) this.hist.push(headPos.clone());
    if (this.hist.length > 600) this.hist.splice(0, this.hist.length - 600);
    let segI = 0; let need = 0; let acc = 0;
    for (let i = this.hist.length - 1; i > 0 && segI < SEGS; i--) {
      const a = this.hist[i]; const b = this.hist[i - 1];
      const d = a.distanceTo(b);
      while (segI < SEGS && acc + d >= need) {
        const k = d > 0 ? (need - acc) / d : 0;
        this.pts[segI].copy(a).lerp(b, k);
        segI++; need = segI * SPACING;
      }
      acc += d;
    }
    for (; segI < SEGS; segI++) this.pts[segI].copy(this.pts[Math.max(0, segI - 1)]);
    // undulation: a travelling wave sideways and up-down along the body
    for (let i = 1; i < SEGS; i++) {
      const w = Math.min(1, i / 4);
      this.pts[i].x += Math.sin(this.t * 5 - i * 0.45) * 0.16 * w;
      this.pts[i].y += Math.cos(this.t * 4 - i * 0.38) * 0.2 * w;
    }
    // segment matrices
    const P = dragonParts();
    for (let i = 0; i < SEGS; i++) {
      const prev = this.pts[Math.max(0, i - 1)]; const next = this.pts[Math.min(SEGS - 1, i + 1)];
      const fwd = this._v.copy(prev).sub(next);
      if (fwd.lengthSq() < 1e-6) fwd.set(-1, 0, 0);
      const k = i / (SEGS - 1);
      const s = S * (i < 2 ? 0.82 + i * 0.09 : 1 - 0.78 * k ** 1.25);
      this._m.lookAt(this._w.set(0, 0, 0), fwd.normalize().negate(), Y); // +z towards the head
      this._q.setFromRotationMatrix(this._m);
      this._m.compose(this.pts[i], this._q, this._sc.set(s, s, s));
      this.body.setMatrixAt(i, this._m);
      for (const L of this.legs) {
        if (L.seg !== i) continue;
        const swing = Math.sin(this.t * 6 + i) * 0.35;
        this._lq.setFromEuler(this._le.set(swing, 0, L.side * 0.5));
        this._lm.compose(this._w.set(L.side * 0.42, -0.2, 0), this._lq, this._sc.set(1, 1, 1));
        L.m.matrix.multiplyMatrices(this._m, this._lm);
      }
      if (i === SEGS - 1) this.tuft.matrix.copy(this._m);
    }
    this.body.instanceMatrix.needsUpdate = true;
    // head: along the path, turning to the devil while it breathes
    this.head.position.copy(headPos);
    const along = this._v.copy(headPos).sub(this.pts[1]).normalize();
    const toDevil = this._u.set(devil.x - headPos.x, devil.y - headPos.y, devil.z - headPos.z).normalize();
    const w = this.breath ? 0.85 : 0;
    this._aim = (this._aim ?? 0) + (w - (this._aim ?? 0)) * Math.min(1, dt * 5);
    const dir = along.lerp(toDevil, this._aim).normalize();
    this.head.lookAt(this._w.copy(headPos).add(dir));
    this.jaw.rotation.x = this.breath ? 0.55 + Math.sin(this.t * 20) * 0.05 : 0.08 + Math.sin(this.t * 2) * 0.04;
    this.whiskers[0].rotation.y = Math.sin(this.t * 3) * 0.12; this.whiskers[1].rotation.y = -Math.sin(this.t * 3 + 0.5) * 0.12;
    // fire breath
    this.light.intensity = this.breath ? 10 + Math.random() * 4 : 0;
    if (this.breath) {
      const m = this.mouth.getWorldPosition(this._w);
      this.light.position.copy(m);
      const aim = this._u.set(devil.x - m.x, devil.y - m.y, devil.z - m.z);
      const dist = aim.length(); aim.normalize();
      const sp = dist / 0.4;
      // a cone of flame: hot yellow core at the mouth, deep orange and red where it hits
      for (let i = 0; i < 7; i++) {
        const j = 0.12;
        this.vfx.glow.add({ x: m.x, y: m.y, z: m.z, vx: (aim.x + rand(-j, j)) * sp * rand(0.85, 1.1), vy: (aim.y + rand(-j, j)) * sp * rand(0.85, 1.1), vz: (aim.z + rand(-j, j)) * sp * rand(0.85, 1.1), drag: 0.4,
          s0: rand(0.12, 0.22), s1: rand(0.7, 1.15), life: rand(0.34, 0.44), a0: 0.75, c0: [1, 0.82, 0.38], c1: [0.85, 0.12, 0.02], fadePow: 1.6 });
      }
      if (Math.random() < 0.5) this.vfx.smoke.add({ x: devil.x + rand(-0.5, 0.5), y: devil.y + rand(-0.3, 0.6), z: devil.z, vy: rand(0.6, 1.4), vx: rand(-0.4, 0.4), s0: 0.5, s1: 1.8, life: 1.1, a0: 0.45, fadeIn: 0.15, c0: [0.14, 0.08, 0.07] });
      this.tick -= dt;
      if (this.tick <= 0) { this.tick = 0.2; ev.push('tick'); }
    }
    // embers drifting off the body and the tail flame
    if (Math.random() < dt * 30) {
      const p = this.pts[Math.floor(rand(3, SEGS))];
      this.vfx.ember({ x: p.x, y: p.y, z: p.z }, 1.2);
    }
    if (this.t >= this.T3) { this.done = true; this.group.visible = false; this.light.intensity = 0; ev.push('done'); }
    return ev;
  }

  hide() { this.done = true; this.group.visible = false; this.light.intensity = 0; }
}

// ------------------------------------------------------------------------------------- facade

export class Powers {
  constructor(scene, vfx) {
    this.scene = scene; this.vfx = vfx;
    this.chains = new Chains(scene, vfx);
    this.dragon = null; // built on first use (one model, reused)
  }

  get chainsBound() { return this.chains.bound; }
  get dragonBusy() { return !!this.dragon && !this.dragon.done; }

  bind(x, z, sec) { this.chains.bind(x, z, sec); }

  callDragon(devil) {
    if (!this.dragon) this.dragon = new Dragon(this.scene, this.vfx);
    this.dragon.start(devil);
  }

  /** Stops everything (new round, sim/live switch). */
  clear() { this.chains.release(); this.dragon?.hide(); }

  /** Returns { chains: 'bound' | 'free' | null, dragon: [events] }. */
  update(dt, t, devil) {
    return { chains: this.chains.update(dt, t, devil), dragon: this.dragon ? this.dragon.update(dt, t, devil) : [] };
  }
}
