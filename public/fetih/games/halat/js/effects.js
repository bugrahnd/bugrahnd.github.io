// GPU-instanced billboard particles from the sprite atlas (two draw calls: normal and
// additive blending) plus effect recipes (dust, sweat, splash, confetti, rings, smoke).
// Fixed capacity, struct-of-arrays, no allocation per particle.
import * as THREE from 'three';
import { rand, pick } from './util.js';

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec2 iSizeRot;
attribute vec4 iColor;
attribute vec4 iUv;
uniform float flatMode;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  float c = cos(iSizeRot.y); float s = sin(iSizeRot.y);
  vec2 p = position.xy * iSizeRot.x;
  vec2 r = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vec4 mv;
  // flat: lies on the horizontal plane (ripples on water); else a camera-facing billboard
  if (flatMode > 0.5) mv = modelViewMatrix * vec4(iPos + vec3(r.x, 0.0, r.y), 1.0);
  else { mv = modelViewMatrix * vec4(iPos, 1.0); mv.xy += r; }
  gl_Position = projectionMatrix * mv;
  vUv = mix(iUv.xy, iUv.zw, uv);
  vColor = iColor;
}`;

const FRAG = /* glsl */`
uniform sampler2D map;
uniform float additive;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(map, vUv);
  vec4 c = t * vColor;
  if (c.a < 0.004) discard;
  gl_FragColor = additive > 0.5 ? vec4(c.rgb * c.a, c.a) : c;
}`;

class ParticleLayer {
  constructor(atlas, capacity, additive, flat = false) {
    this.capacity = capacity;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    const attr = (n) => new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n).setUsage(THREE.DynamicDrawUsage);
    this.aPos = attr(3); this.aSR = attr(2); this.aCol = attr(4); this.aUv = attr(4);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iSizeRot', this.aSR);
    geo.setAttribute('iColor', this.aCol);
    geo.setAttribute('iUv', this.aUv);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { map: { value: atlas.texture }, additive: { value: additive ? 1 : 0 }, flatMode: { value: flat ? 1 : 0 } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
    });
    if (additive) { mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneFactor; }
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = flat ? 3 : additive ? 11 : 10;
    this.geo = geo;
    const n = capacity;
    this.n = 0;
    const f = () => new Float32Array(n);
    this.px = f(); this.py = f(); this.pz = f(); this.vx = f(); this.vy = f(); this.vz = f();
    this.g = f(); this.drag = f(); this.age = f(); this.life = f(); this.s0 = f(); this.s1 = f();
    this.rot = f(); this.rv = f(); this.r = f(); this.gg = f(); this.b = f(); this.a = f(); this.floorY = f();
    this.sprite = new Array(n);
  }

  spawn(o) {
    if (this.n >= this.capacity) this._kill(Math.floor(Math.random() * this.n));
    const i = this.n++;
    this.px[i] = o.x; this.py[i] = o.y; this.pz[i] = o.z;
    this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0; this.vz[i] = o.vz || 0;
    this.g[i] = o.g || 0; this.drag[i] = o.drag || 0;
    this.age[i] = -(o.delay || 0); this.life[i] = o.life || 1;
    this.s0[i] = o.size || 0.5; this.s1[i] = o.size1 ?? o.size ?? 0.5;
    this.rot[i] = o.rot ?? rand(0, 6.283); this.rv[i] = o.rv || 0;
    const c = o.color ?? 0xffffff;
    this.r[i] = ((c >> 16) & 255) / 255; this.gg[i] = ((c >> 8) & 255) / 255; this.b[i] = (c & 255) / 255;
    this.a[i] = o.alpha ?? 1;
    this.floorY[i] = o.floor ?? -100;
    this.sprite[i] = o.sprite;
  }

  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (const k of ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'g', 'drag', 'age', 'life', 's0', 's1', 'rot', 'rv', 'r', 'gg', 'b', 'a', 'floorY']) this[k][i] = this[k][j];
    this.sprite[i] = this.sprite[j];
  }

  update(dt) {
    const P = this.aPos.array; const SR = this.aSR.array; const C = this.aCol.array; const U = this.aUv.array;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      const age = this.age[i];
      if (age >= this.life[i]) { this._kill(i); i--; continue; }
      if (age < 0) continue;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= k; this.vy[i] = this.vy[i] * k - this.g[i] * dt; this.vz[i] *= k;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < this.floorY[i]) { this.py[i] = this.floorY[i]; this.vy[i] = 0; this.vx[i] *= 0.5; this.vz[i] *= 0.5; this.rv[i] *= 0.5; }
      this.rot[i] += this.rv[i] * dt;
      const t = age / this.life[i];
      const fi = Math.min(1, t / 0.08);
      const alpha = this.a[i] * fi * (t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1);
      const sp = this.sprite[i];
      P[w * 3] = this.px[i]; P[w * 3 + 1] = this.py[i]; P[w * 3 + 2] = this.pz[i];
      SR[w * 2] = this.s0[i] + (this.s1[i] - this.s0[i]) * t; SR[w * 2 + 1] = this.rot[i];
      C[w * 4] = this.r[i]; C[w * 4 + 1] = this.gg[i]; C[w * 4 + 2] = this.b[i]; C[w * 4 + 3] = alpha;
      U[w * 4] = sp.u0; U[w * 4 + 1] = sp.v0; U[w * 4 + 2] = sp.u1; U[w * 4 + 3] = sp.v1;
      w++;
    }
    this.geo.instanceCount = w;
    if (w) {
      for (const a of [this.aPos, this.aSR, this.aCol, this.aUv]) { a.clearUpdateRanges(); a.addUpdateRange(0, w * a.itemSize); a.needsUpdate = true; }
    }
  }
}

const CONFETTI_COLORS = [0xff4d6d, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xf72585, 0xffffff, 0xff9f1c];

export class Effects {
  constructor(scene, atlas, capacity = 1400) {
    this.atlas = atlas;
    this.normal = new ParticleLayer(atlas, capacity, false);
    this.add = new ParticleLayer(atlas, Math.round(capacity / 3), true);
    this.flat = new ParticleLayer(atlas, 96, false, true);
    scene.add(this.normal.mesh, this.add.mesh, this.flat.mesh);
    this.sp = (k) => atlas.rects.get(k);
    this.scale = 1; // global particle amount (quality)
  }

  get count() { return this.normal.n + this.add.n + this.flat.n; }

  update(dt) {
    this.normal.update(dt);
    this.add.update(dt);
    this.flat.update(dt);
  }

  /** Expanding ring lying on the water / ground. */
  ripple(x, y, z, color = 0xe8f6ff, size = 2, life = 1.1, delay = 0) {
    this.flat.spawn({ sprite: this.sp('fx_ring'), x, y, z, life, size: size * 0.15, size1: size, color, alpha: 0.75, rot: 0, delay });
  }

  /** Big landing in the pit: water/mud crown, droplets, ripples, mist. */
  bigSplash(x, y, z, k = 1) {
    this.splash(x, y, z, 1.2 * k);
    const sp = this.sp('fx_splash');
    for (let i = 0; i < 10 * k; i++) {
      const a = rand(0, Math.PI * 2); const s = rand(1.5, 3.2);
      this.normal.spawn({ sprite: sp, x, y, z, vx: Math.cos(a) * s * 0.7, vy: rand(3.5, 6.5), vz: Math.sin(a) * s * 0.4, g: 12, life: rand(0.7, 1.1), size: rand(0.16, 0.3), size1: 0.1, color: pick([0x8a6a45, 0x9fd6ea, 0x7e5b3a]), alpha: 0.95, rot: 0, floor: y - 0.05 });
    }
    this.ripple(x, y + 0.03, z, 0xf2fbff, 2.4 * k, 1.0);
    this.ripple(x, y + 0.03, z, 0xf2fbff, 3.4 * k, 1.4, 0.18);
    this.ripple(x, y + 0.03, z, 0xf2fbff, 4.2 * k, 1.7, 0.4);
  }

  dust(x, z, amount = 3, color = 0xc9a77a, power = 1) {
    const sp = this.sp('fx_dust');
    for (let i = 0; i < amount; i++) {
      this.normal.spawn({
        sprite: sp, x: x + rand(-0.15, 0.15), y: 0.1, z: z + rand(-0.15, 0.15),
        vx: rand(-0.6, 0.6) * power, vy: rand(0.3, 0.9) * power, vz: rand(-0.4, 0.4) * power,
        drag: 2.2, life: rand(0.6, 1.1), size: rand(0.25, 0.4) * power, size1: rand(0.7, 1.1) * power,
        color, alpha: 0.55, rv: rand(-1, 1),
      });
    }
  }

  sweat(x, y, z) {
    const sp = this.sp('fx_sweat');
    for (let i = 0; i < 2; i++) {
      this.normal.spawn({
        sprite: sp, x, y, z, vx: rand(-0.8, 0.8), vy: rand(0.8, 1.6), vz: rand(-0.4, 0.4),
        g: 6, life: 0.55, size: 0.12, size1: 0.08, color: 0xbfe7ff, alpha: 0.9, rot: 0,
      });
    }
  }

  splash(x, y, z, big = 1) {
    const sp = this.sp('fx_splash');
    const n = Math.round(14 * big);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2); const s = rand(1, 3) * big;
      this.normal.spawn({
        sprite: sp, x, y, z, vx: Math.cos(a) * s * 0.5, vy: rand(2.5, 5) * big, vz: Math.sin(a) * s * 0.5,
        g: 11, life: rand(0.6, 1.0), size: rand(0.18, 0.32), size1: 0.12, color: 0x8fd0e8, alpha: 0.95, rot: 0, floor: y - 0.05,
      });
    }
    this.ring(x, y + 0.02, z, 0xcfefff, 1.8 * big, 0.7);
    this.normal.spawn({ sprite: this.sp('fx_smoke'), x, y: y + 0.2, z, vy: 0.4, life: 0.8, size: 0.6, size1: 1.8 * big, color: 0xe8f7ff, alpha: 0.6 });
  }

  /** Flat-ish expanding ring (billboard; reads well from the 3/4 view). */
  ring(x, y, z, color = 0xffffff, size = 2.5, life = 0.6) {
    this.add.spawn({ sprite: this.sp('fx_ring'), x, y, z, life, size: size * 0.2, size1: size, color, alpha: 0.9, rot: 0 });
  }

  spark(x, y, z, color = 0xffe08a, n = 8, power = 1) {
    const sp = this.sp('fx_spark');
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      this.add.spawn({ sprite: sp, x, y, z, vx: Math.cos(a) * rand(1, 3) * power, vy: rand(1, 4) * power, vz: Math.sin(a) * rand(0.5, 1.5), g: 5, drag: 1.5, life: rand(0.4, 0.8), size: 0.25, size1: 0.05, color, alpha: 1 });
    }
  }

  smoke(x, y, z, color = 0x777777, size = 0.5) {
    this.normal.spawn({ sprite: this.sp('fx_smoke'), x, y, z, vx: rand(-0.2, 0.2), vy: rand(0.6, 1.1), vz: rand(-0.2, 0.2), drag: 0.6, life: rand(1.0, 1.6), size, size1: size * 3, color, alpha: 0.5, rv: rand(-0.6, 0.6) });
  }

  confetti(x, y, z, spread = 4, n = 60, colors = CONFETTI_COLORS) {
    const sp = this.sp('fx_confetti');
    for (let i = 0; i < n; i++) {
      this.normal.spawn({
        sprite: sp, x: x + rand(-spread, spread), y: y + rand(0, 2), z: z + rand(-spread * 0.5, spread * 0.5),
        vx: rand(-1, 1), vy: rand(-0.5, 2.5), vz: rand(-0.6, 0.6), g: 1.6, drag: 1.2,
        life: rand(2.4, 3.8), size: rand(0.22, 0.34), color: pick(colors), alpha: 1, rv: rand(-9, 9), delay: rand(0, 0.8), floor: 0.02,
      });
    }
  }

  stars(x, y, z, color = 0xffd166, n = 3) {
    const sp = this.sp('fx_star');
    for (let i = 0; i < n; i++) {
      this.add.spawn({ sprite: sp, x: x + rand(-0.3, 0.3), y, z: z + rand(-0.2, 0.2), vy: rand(0.4, 1), vx: rand(-0.4, 0.4), life: 0.9, size: 0.22, size1: 0.1, color, alpha: 1, rv: rand(-4, 4) });
    }
  }
}
