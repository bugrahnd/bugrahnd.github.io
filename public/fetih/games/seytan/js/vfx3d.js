// 3D effects: GPU point particles (additive glow / fire / embers / magic, and alpha-blended smoke and
// dust), spark streaks, bouncing rock debris (instanced, casts shadows), shockwave rings, impact
// lights, the projectile rock meshes, and camera shake. All positions are world coordinates.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise, pixelCanvas, stoneTexture } from './noise.js';
import { camPose } from './proj.js';

const rand = (a, b) => a + Math.random() * (b - a);
// point size: world size * this / distance (pixels per world unit at distance 1, 1920 px frame)
const pxPerUnit = (hPx) => hPx / (2 * camPose().tanY);
const PX_PER_UNIT = pxPerUnit(1920);

function puffTexture() {
  const n = makeNoise(5);
  const c = pixelCanvas(128, 128, (x, y) => {
    const dx = (x - 64) / 64; const dy = (y - 64) / 64; const d = Math.hypot(dx, dy);
    const v = n.fbm(x * 0.06, y * 0.06, 4);
    const a = Math.max(0, 1 - d) ** 1.4 * (0.55 + v * 0.7);
    return [255, 255, 255, Math.min(255, a * 255)];
  });
  return new THREE.CanvasTexture(c);
}
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.8)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

class PointPool {
  constructor(scene, max, texture, additive, scale) {
    this.max = max; this.list = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uScale = { value: scale };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: texture }, uScale: this.uScale },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; varying float vA; varying vec3 vC;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; vA = aAlpha; vC = aColor; }`,
      fragmentShader: `uniform sampler2D uTex; varying float vA; varying vec3 vC;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
    this.geo = geo;
  }

  add(p) {
    if (this.list.length >= this.max) this.list.shift();
    p.age = 0; p.life ??= 1; p.vx ??= 0; p.vy ??= 0; p.vz ??= 0; p.s0 ??= 0.3; p.s1 ??= p.s0; p.a0 ??= 1;
    p.c0 ??= [1, 1, 1]; p.c1 ??= p.c0;
    this.list.push(p);
  }

  update(dt) {
    const keep = [];
    for (const p of this.list) {
      p.age += dt;
      if (p.age >= p.life) continue;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.vy += (p.g || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      keep.push(p);
    }
    this.list = keep;
    const n = keep.length;
    for (let i = 0; i < n; i++) {
      const p = keep[i]; const k = p.age / p.life;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.size[i] = p.s0 + (p.s1 - p.s0) * k;
      const fade = p.fadeIn ? Math.min(1, k / p.fadeIn) : 1;
      this.alpha[i] = p.a0 * (1 - k) ** (p.fadePow ?? 1) * fade * (p.flicker ? 0.6 + 0.4 * Math.sin(p.age * 30 + p.x * 10) : 1);
      for (let c = 0; c < 3; c++) this.col[i * 3 + c] = p.c0[c] + (p.c1[c] - p.c0[c]) * k;
    }
    this.geo.setDrawRange(0, n);
    for (const a of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[a].needsUpdate = true;
  }
}

export class Vfx3D {
  constructor(scene) {
    this.scene = scene;
    const dot = dotTexture();
    this.glow = new PointPool(scene, 2200, dot, true, PX_PER_UNIT);
    this.smoke = new PointPool(scene, 700, puffTexture(), false, PX_PER_UNIT);

    // spark streaks
    this.sparkMax = 500; this.sparks = [];
    const sg = new THREE.BufferGeometry();
    this.sparkPos = new Float32Array(this.sparkMax * 6); this.sparkCol = new Float32Array(this.sparkMax * 6);
    sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkLines = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.sparkLines.frustumCulled = false; this.sparkLines.renderOrder = 6;
    scene.add(this.sparkLines);

    // rock materials and geometries (debris and projectiles)
    const st = stoneTexture(128, 128, [150, 142, 132], 91, 0.08, 0.4);
    const stTex = new THREE.CanvasTexture(st); stTex.colorSpace = THREE.SRGBColorSpace; stTex.wrapS = stTex.wrapT = THREE.RepeatWrapping;
    this.mats = {
      stone: new THREE.MeshStandardMaterial({ map: stTex, bumpMap: stTex, bumpScale: 2, roughness: 0.9, color: 0xc8c0b4 }),
      fire: new THREE.MeshStandardMaterial({ map: stTex, color: 0x6a3018, emissive: 0xff5a10, emissiveIntensity: 1.6, roughness: 0.8 }),
      star: new THREE.MeshBasicMaterial({ color: 0xe8f2ff, toneMapped: false }),
    };
    const n = makeNoise(17);
    this.rockGeos = [];
    for (let k = 0; k < 4; k++) {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.attributes.position; const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(0.78 + n.noise(v.x * 2 + k * 7, v.y * 2 + v.z * 1.3) * 0.42); p.setXYZ(i, v.x, v.y * 0.85, v.z); }
      g.computeVertexNormals();
      this.rockGeos.push(g);
    }
    this.debrisMax = 320;
    this.debris = [];
    this.debrisMesh = new THREE.InstancedMesh(this.rockGeos[0], this.mats.stone, this.debrisMax);
    this.debrisMesh.castShadow = true; this.debrisMesh.frustumCulled = false;
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.debrisMesh);
    this.fireDebris = new THREE.InstancedMesh(this.rockGeos[1], this.mats.fire, 120);
    this.fireDebris.frustumCulled = false; this.fireDebris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.fireDebris);
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();

    // shockwave rings
    this.rings = [];
    this.ringPool = [];
    const ringGeo = new THREE.RingGeometry(0.86, 1, 64);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.visible = false; m.renderOrder = 6; scene.add(m); this.ringPool.push(m);
    }
    // impact lights
    this.flashes = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffc080, 0, 10, 2); scene.add(l); this.flashes.push({ l, t: 0, max: 0, life: 0.3 }); }

    // fire arrow: shaft, iron head, red-and-white fletching and a burning rag behind the head (+z = forward)
    {
      const col = (geo, hex) => { const c = new THREE.Color(hex); const n = geo.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo.index ? geo.toNonIndexed() : geo; };
      const parts = [
        col(new THREE.CylinderGeometry(0.016, 0.016, 0.95, 6).rotateX(Math.PI / 2), 0x8a6238),
        col(new THREE.ConeGeometry(0.045, 0.16, 6).rotateX(Math.PI / 2).translate(0, 0, 0.55), 0x34343c),
        col(new THREE.SphereGeometry(0.05, 8, 6).scale(1, 1, 1.6).translate(0, 0, 0.4), 0x3a1a0c),
      ];
      for (let i = 0; i < 3; i++) {
        const f = new THREE.BoxGeometry(0.005, 0.07, 0.2).translate(0, 0.045, -0.4).rotateZ((i / 3) * Math.PI * 2);
        parts.push(col(f, i === 0 ? 0xd82a2a : 0xf4eee0));
      }
      this.arrowGeo = mergeGeometries(parts);
      this.arrowGeo.computeVertexNormals();
      this.arrowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
    }
    this.arrowPool = [];

    // projectile meshes pool
    this.rockPool = [];
    this.shakeAmt = 0;
    this.shakeOffset = { x: 0, y: 0 };
  }

  /** Canvas height in pixels: point particles are sized in world units. */
  setViewport(hPx) { this.glow.uScale.value = this.smoke.uScale.value = pxPerUnit(hPx); }

  // ------------------------------------------------------------------------------- projectiles
  getRock(kind, radius) {
    if (kind === 'arrow') {
      let a = this.arrowPool.pop();
      if (!a) { a = new THREE.Mesh(this.arrowGeo, this.arrowMat); a.castShadow = true; a.userData.arrow = true; this.scene.add(a); }
      a.scale.setScalar(radius); a.visible = true;
      return a;
    }
    const mat = kind === 'boulder' ? this.mats.fire : kind === 'meteor' ? this.mats.star : this.mats.stone;
    let m = this.rockPool.pop();
    if (!m) { m = new THREE.Mesh(this.rockGeos[0], mat); m.castShadow = true; this.scene.add(m); }
    m.material = mat;
    m.geometry = this.rockGeos[Math.floor(Math.random() * 4)];
    m.scale.setScalar(radius);
    m.visible = true;
    m.castShadow = kind !== 'meteor';
    return m;
  }

  releaseRock(m) { m.visible = false; (m.userData.arrow ? this.arrowPool : this.rockPool).push(m); }

  // ------------------------------------------------------------------------------- emitters
  shake(a) { this.shakeAmt = Math.min(0.5, this.shakeAmt + a); }

  flash(p, color = 0xffc080, intensity = 30, life = 0.3) {
    const f = this.flashes.reduce((a, b) => (b.l.intensity < a.l.intensity ? b : a));
    f.l.color.set(color); f.l.position.set(p.x, p.y, p.z + 0.6); f.max = intensity; f.t = 0; f.life = life;
  }

  ring(p, { color = 0xffffff, size = 2, life = 0.5, ground = false, width = 1 } = {}) {
    const m = this.ringPool.find((r) => !r.visible) || this.ringPool[0];
    m.visible = true; m.material.color.set(color); m.position.set(p.x, ground ? 0.03 : p.y, p.z);
    m.rotation.set(ground ? -Math.PI / 2 : 0, 0, 0);
    this.rings = this.rings.filter((r) => r.m !== m);
    this.rings.push({ m, t: 0, life, size, width });
  }

  sparksAt(p, n, { speed = 6, color = [1, 0.75, 0.35], life = 0.45, up = 2 } = {}) {
    for (let i = 0; i < n; i++) {
      if (this.sparks.length >= this.sparkMax) this.sparks.shift();
      const a = Math.random() * Math.PI * 2; const b = Math.random() * Math.PI;
      const sp = speed * rand(0.4, 1.2);
      this.sparks.push({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * Math.sin(b) * sp, vy: Math.cos(b) * sp + up, vz: Math.sin(a) * Math.sin(b) * sp * 0.6 + 1, age: 0, life: life * rand(0.6, 1.3), c: color });
    }
  }

  debrisAt(p, n, { speed = 4, size = 0.08, fire = false, up = 3 } = {}) {
    for (let i = 0; i < n; i++) {
      if (this.debris.length >= this.debrisMax + 120) this.debris.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = speed * rand(0.3, 1.1);
      this.debris.push({ x: p.x + rand(-0.1, 0.1), y: p.y + rand(-0.1, 0.1), z: p.z + 0.2, vx: Math.cos(a) * sp, vy: rand(0.2, 1) * up + Math.sin(a) * sp * 0.5, vz: rand(0.5, 2.5),
        rx: rand(0, 6), ry: rand(0, 6), wx: rand(-12, 12), wy: rand(-12, 12), s: size * rand(0.5, 1.4), age: 0, life: rand(1.6, 2.8), fire, rest: false });
    }
  }

  puff(p, n, { color = [0.45, 0.42, 0.4], size = 0.8, grow = 2, life = 1, speed = 1, alpha = 0.55, up = 0.6 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.add({ x: p.x + rand(-0.15, 0.15), y: p.y + rand(-0.15, 0.15), z: p.z + rand(-0.1, 0.3), vx: Math.cos(a) * speed * rand(0.3, 1), vy: Math.sin(a) * speed * 0.6 + up, vz: rand(-0.2, 0.6) * speed, drag: 1.6,
        s0: size * rand(0.7, 1.2), s1: size * grow * rand(0.8, 1.3), life: life * rand(0.7, 1.3), a0: alpha, fadeIn: 0.12, c0: color, c1: color.map((c) => c * 0.7) });
    }
  }

  glowAt(p, { color = [1, 0.85, 0.6], size = 2, life = 0.25, alpha = 1 } = {}) {
    this.glow.add({ x: p.x, y: p.y, z: p.z + 0.3, s0: size, s1: size * 1.8, life, a0: alpha, c0: color, fadePow: 1.6 });
  }

  /** Stone breaking on the devil. size: 0.5 pebble .. 3 huge; kind: stone | fire | magic. */
  impact(p, size = 1, kind = 'stone') {
    const fire = kind === 'fire'; const magic = kind === 'magic';
    const col = fire ? [1, 0.6, 0.25] : magic ? [0.8, 0.9, 1] : [1, 0.9, 0.7];
    this.glowAt(p, { color: col, size: 0.9 + size * 1.1, life: 0.18 + size * 0.05 });
    this.glow.add({ x: p.x, y: p.y, z: p.z + 0.35, s0: 0.25 + size * 0.5, s1: 0.05, life: 0.12, c0: [1, 1, 1] }); // hot core
    this.debrisAt(p, Math.round(3 + size * 7), { speed: 2.5 + size * 1.8, size: 0.04 + size * 0.045, fire });
    this.sparksAt(p, Math.round(4 + size * 8), { speed: 4 + size * 2.5, color: fire ? [1, 0.55, 0.15] : magic ? [0.7, 0.85, 1] : [1, 0.82, 0.5] });
    this.puff(p, Math.round(2 + size * 3), { color: fire ? [0.25, 0.17, 0.14] : [0.5, 0.47, 0.44], size: 0.35 + size * 0.35, grow: 2.6, life: 0.8 + size * 0.3, speed: 0.8 + size * 0.5, alpha: 0.5 });
    if (size >= 1) this.ring(p, { color: fire ? 0xffa050 : magic ? 0xcfe2ff : 0xe8dcc4, size: 0.8 + size * 0.9, life: 0.35 + size * 0.08 });
    if (size >= 1) this.flash(p, fire ? 0xff8a40 : magic ? 0xbfd8ff : 0xffe0b0, 6 + size * 10, 0.22 + size * 0.06);
  }

  /** A like pebble landing: a puff of grit and two or three sparks, no glow (likes come in floods). */
  pebble(p) {
    this.debrisAt(p, 2, { speed: 2, size: 0.035 });
    this.sparksAt(p, 2, { speed: 3, color: [1, 0.85, 0.6], life: 0.3 });
    if (Math.random() < 0.4) this.puff(p, 1, { color: [0.5, 0.47, 0.44], size: 0.25, grow: 2.2, life: 0.6, speed: 0.6, alpha: 0.35 });
  }

  /** A fire arrow striking: a burst of flame and embers. */
  arrowHit(p) {
    this.glowAt(p, { color: [1, 0.62, 0.22], size: 1.6, life: 0.22 });
    for (let i = 0; i < 8; i++) this.glow.add({ x: p.x, y: p.y, z: p.z + 0.3, vx: rand(-1.5, 1.5), vy: rand(0.5, 2.5), vz: rand(-0.3, 0.8), drag: 2, s0: rand(0.25, 0.45), s1: 0.08, life: rand(0.3, 0.55), c0: [1, 0.85, 0.4], c1: [0.9, 0.2, 0.04] });
    this.sparksAt(p, 5, { speed: 4, color: [1, 0.6, 0.2], life: 0.35 });
    this.debrisAt(p, 2, { speed: 2, size: 0.04, fire: true });
    if (Math.random() < 0.35) this.flash(p, 0xff8a40, 10, 0.2);
  }

  /** Flames climbing the devil's body while he burns (call every frame). w: torso, s: his scale. */
  burnOn(w, s, dt) {
    const n = Math.round(dt * 70 + Math.random());
    for (let i = 0; i < n; i++) {
      const x = w.x + rand(-0.6, 0.6) * s; const y = w.y + rand(-1.1, 0.9) * s;
      this.glow.add({ x, y, z: w.z + 0.45, vx: rand(-0.2, 0.2), vy: rand(1.2, 2.6), vz: 0, drag: 0.5, s0: rand(0.3, 0.6) * s, s1: 0.06, life: rand(0.35, 0.65), flicker: true, c0: [1, 0.82, 0.35], c1: [0.95, 0.18, 0.03] });
    }
    if (Math.random() < dt * 8) this.smoke.add({ x: w.x + rand(-0.4, 0.4) * s, y: w.y + 0.9 * s, z: w.z + 0.3, vy: rand(0.6, 1.2), vx: rand(-0.3, 0.3), s0: 0.4, s1: 1.4, life: 1.2, a0: 0.35, fadeIn: 0.15, c0: [0.12, 0.08, 0.07] });
  }

  explosion(p, size = 2) {
    this.impact(p, size, size > 2.5 ? 'magic' : 'fire');
    const magic = size > 2.5;
    for (let i = 0; i < 26 + size * 8; i++) {
      const a = Math.random() * Math.PI * 2; const b = Math.random() * Math.PI; const sp = rand(1, 5) * (0.6 + size * 0.2);
      this.glow.add({ x: p.x, y: p.y, z: p.z + 0.3, vx: Math.cos(a) * Math.sin(b) * sp, vy: Math.cos(b) * sp + 1, vz: Math.sin(a) * Math.sin(b) * sp * 0.5, drag: 2.4, g: 1.5,
        s0: rand(0.5, 1.1) * (0.7 + size * 0.25), s1: 0.2, life: rand(0.4, 0.8), c0: magic ? [0.9, 0.95, 1] : [1, 0.85, 0.45], c1: magic ? [0.3, 0.45, 1] : [0.8, 0.2, 0.05] });
    }
    this.puff(p, 10 + size * 3, { color: magic ? [0.3, 0.32, 0.42] : [0.2, 0.14, 0.12], size: 0.9, grow: 3.2, life: 1.6, speed: 2.4, alpha: 0.6, up: 1.2 });
    this.debrisAt(p, 10 + size * 4, { speed: 5 + size, size: 0.1, fire: !magic });
    this.ring(p, { color: magic ? 0xd8e8ff : 0xffc080, size: 3 + size * 1.4, life: 0.6 });
    this.ring({ x: p.x, y: 0, z: Math.max(p.z, -1) }, { color: magic ? 0xbfd8ff : 0xffa050, size: 3.5 + size, life: 0.7, ground: true });
    this.flash(p, magic ? 0xbfd8ff : 0xff9040, 40 + size * 25, 0.5);
    this.shake(0.05 + size * 0.025);
  }

  /** Dark smoke and embers (teleport, escape). */
  poof(p, big = false) {
    this.puff(p, big ? 26 : 16, { color: [0.12, 0.06, 0.06], size: 0.9, grow: 2.8, life: 1.1, speed: big ? 3 : 2, alpha: 0.75, up: 0.8 });
    for (let i = 0; i < (big ? 50 : 22); i++) this.ember({ x: p.x + rand(-0.6, 0.6), y: p.y + rand(-1, 1), z: p.z }, big ? 3 : 1.6);
    this.glowAt(p, { color: [1, 0.45, 0.15], size: big ? 5 : 3, life: 0.4 });
  }

  ember(p, speed = 1) {
    this.glow.add({ x: p.x, y: p.y, z: p.z + 0.2, vx: rand(-0.5, 0.5) * speed, vy: rand(0.6, 1.8) * speed, vz: rand(-0.2, 0.4), drag: 0.6, s0: rand(0.06, 0.14), s1: 0.02, life: rand(0.7, 1.4), flicker: true, c0: [1, 0.7, 0.3], c1: [1, 0.25, 0.05] });
  }

  devilSmoke(p) {
    this.smoke.add({ x: p.x + rand(-0.25, 0.25), y: p.y, z: p.z + rand(-0.2, 0.2), vx: rand(-0.3, 0.3), vy: rand(0.3, 0.8), vz: 0, drag: 0.8, s0: rand(0.4, 0.7), s1: rand(1.2, 1.8), life: rand(1, 1.6), a0: 0.45, fadeIn: 0.25, c0: [0.08, 0.04, 0.04], c1: [0.04, 0.03, 0.04] });
  }

  trail(p, kind) {
    if (kind === 'boulder') {
      this.glow.add({ x: p.x + rand(-0.1, 0.1), y: p.y + rand(-0.1, 0.1), z: p.z, vx: rand(-0.3, 0.3), vy: rand(0.2, 0.8), vz: 0, s0: rand(0.5, 0.9), s1: 0.1, life: rand(0.25, 0.45), c0: [1, 0.8, 0.4], c1: [0.8, 0.15, 0.03] });
      if (Math.random() < 0.5) this.smoke.add({ x: p.x, y: p.y, z: p.z - 0.1, vy: 0.4, s0: 0.35, s1: 1.1, life: 0.9, a0: 0.4, fadeIn: 0.1, c0: [0.15, 0.1, 0.09] });
    } else if (kind === 'meteor') {
      for (let i = 0; i < 3; i++) this.glow.add({ x: p.x + rand(-0.2, 0.2), y: p.y + rand(-0.2, 0.2), z: p.z, vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5), vz: 0, s0: rand(0.7, 1.4), s1: 0.1, life: rand(0.35, 0.7), c0: [0.95, 0.97, 1], c1: [0.25, 0.45, 1] });
      if (Math.random() < 0.6) this.sparksAt(p, 1, { speed: 2, color: [0.75, 0.88, 1], life: 0.5, up: 0 });
    } else if (kind === 'arrow') {
      for (let i = 0; i < 2; i++) this.glow.add({ x: p.x + rand(-0.05, 0.05), y: p.y + rand(-0.05, 0.05), z: p.z, vx: rand(-0.2, 0.2), vy: rand(0.3, 0.9), vz: 0, s0: rand(0.35, 0.55), s1: 0.06, life: rand(0.2, 0.34), c0: [1, 0.88, 0.45], c1: [0.95, 0.25, 0.04] });
      if (Math.random() < 0.3) this.smoke.add({ x: p.x, y: p.y, z: p.z - 0.05, vy: 0.4, s0: 0.12, s1: 0.45, life: 0.5, a0: 0.3, c0: [0.2, 0.14, 0.12] });
    } else if (kind === 'stone' || kind === 'rain') {
      this.smoke.add({ x: p.x, y: p.y, z: p.z, s0: 0.12, s1: 0.4, life: 0.35, a0: 0.25, c0: [0.6, 0.57, 0.53] });
    }
  }

  /** Gold sparkles falling over the scene (round won). */
  sparkle(n = 30) {
    for (let i = 0; i < n; i++) {
      this.glow.add({ x: rand(-5.5, 5.5), y: rand(9, 12), z: rand(-1, 3), vx: rand(-0.4, 0.4), vy: rand(-2.5, -1), vz: 0, s0: rand(0.1, 0.22), s1: 0.06, life: rand(2.2, 3.5), flicker: true, c0: [1, 0.85, 0.45], c1: [1, 0.7, 0.3] });
    }
  }

  /** Ground ring + rising motes where a thrower summons something. */
  summon(p, color = [0.6, 0.85, 1]) {
    this.ring({ x: p.x, y: 0, z: p.z }, { color: new THREE.Color(...color), size: 1.4, life: 0.7, ground: true });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      this.glow.add({ x: p.x + Math.cos(a) * 0.5, y: 0.1, z: p.z + Math.sin(a) * 0.3, vy: rand(1, 2.4), s0: rand(0.1, 0.2), s1: 0.04, life: rand(0.6, 1), c0: color });
    }
  }

  /** Dust where something lands on the courtyard. */
  dust(p, n = 8) { this.puff({ x: p.x, y: 0.15, z: p.z }, n, { color: [0.42, 0.4, 0.42], size: 0.3, grow: 3, life: 0.9, speed: 1.4, alpha: 0.45, up: 0.3 }); }

  // ------------------------------------------------------------------------------- update
  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);

    // sparks
    const sk = [];
    for (const s of this.sparks) {
      s.age += dt; if (s.age >= s.life) continue;
      s.vy -= 9 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      sk.push(s);
    }
    this.sparks = sk;
    for (let i = 0; i < sk.length; i++) {
      const s = sk[i]; const k = 1 - s.age / s.life;
      const L = 0.035;
      this.sparkPos.set([s.x, s.y, s.z, s.x - s.vx * L, s.y - s.vy * L, s.z - s.vz * L], i * 6);
      this.sparkCol.set([s.c[0] * k * 2, s.c[1] * k * 2, s.c[2] * k * 2, 0, 0, 0], i * 6);
    }
    this.sparkLines.geometry.setDrawRange(0, sk.length * 2);
    this.sparkLines.geometry.attributes.position.needsUpdate = true;
    this.sparkLines.geometry.attributes.color.needsUpdate = true;

    // debris with floor bounce
    const keep = [];
    let ns = 0; let nf = 0;
    for (const d of this.debris) {
      d.age += dt; if (d.age >= d.life) continue;
      if (!d.rest) {
        d.vy -= 12 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.wx * dt; d.ry += d.wy * dt;
        const floor = d.z > -7 ? d.s * 0.6 : -2;
        if (d.y < floor) {
          d.y = floor;
          if (Math.abs(d.vy) > 1.2) { d.vy *= -0.35; d.vx *= 0.6; d.vz *= 0.6; d.wx *= 0.6; d.wy *= 0.6; }
          else { d.vy = 0; d.vx *= 0.8; d.vz *= 0.8; if (Math.abs(d.vx) + Math.abs(d.vz) < 0.2) d.rest = true; }
        }
      }
      keep.push(d);
      const k = d.age / d.life; const sc = d.s * (k > 0.8 ? (1 - k) / 0.2 : 1);
      this._e.set(d.rx, d.ry, 0); this._q.setFromEuler(this._e);
      this._m4.compose(this._v.set(d.x, d.y, d.z), this._q, this._s.set(sc, sc * 0.8, sc));
      if (d.fire && nf < 120) this.fireDebris.setMatrixAt(nf++, this._m4);
      else if (ns < this.debrisMax) this.debrisMesh.setMatrixAt(ns++, this._m4);
    }
    this.debris = keep;
    this.debrisMesh.count = ns; this.debrisMesh.instanceMatrix.needsUpdate = true;
    this.fireDebris.count = nf; this.fireDebris.instanceMatrix.needsUpdate = true;

    // rings
    const rk = [];
    for (const r of this.rings) {
      r.t += dt; const k = r.t / r.life;
      if (k >= 1) { r.m.visible = false; continue; }
      const e = 1 - (1 - k) ** 3;
      r.m.scale.setScalar(0.2 + r.size * e);
      r.m.material.opacity = (1 - k) * 0.9;
      rk.push(r);
    }
    this.rings = rk;
    // impact lights
    for (const f of this.flashes) { f.t += dt; f.l.intensity = f.t < f.life ? f.max * (1 - f.t / f.life) ** 2 : 0; }
    // camera shake
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 0.9);
    const a = this.shakeAmt;
    this.shakeOffset.x = a > 0.005 ? (Math.random() - 0.5) * a : 0;
    this.shakeOffset.y = a > 0.005 ? (Math.random() - 0.5) * a : 0;
  }
}

