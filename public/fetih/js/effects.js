// GPU-instanced billboard particles from the sprite atlas (two draw calls:
// additive + normal blending) plus ready-made effect recipes.
import * as THREE from 'three';
import { rand, pick } from './util.js';

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec2 iSizeRot;
attribute vec4 iColor;
attribute vec4 iUv;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSizeRot.y); float s = sin(iSizeRot.y);
  vec2 p = position.xy * iSizeRot.x;
  mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
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
  if (c.a < 0.003) discard;
  gl_FragColor = additive > 0.5 ? vec4(c.rgb * c.a, c.a) : c;
}`;

class ParticleLayer {
  constructor(atlas, capacity, additive) {
    this.capacity = capacity;
    this.k = 1; // size multiplier applied at spawn (bigger in the overview)
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSR = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aUv = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iSizeRot', this.aSR);
    geo.setAttribute('iColor', this.aCol);
    geo.setAttribute('iUv', this.aUv);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { map: { value: atlas.texture }, additive: { value: additive ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
    });
    if (additive) {
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneFactor;
    }
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 11 : 10;
    this.geo = geo;
    // Particle state (struct of arrays).
    const n = capacity;
    this.n = 0;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.g = new Float32Array(n); this.drag = new Float32Array(n);
    this.age = new Float32Array(n); this.life = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n);
    this.rot = new Float32Array(n); this.rv = new Float32Array(n);
    this.r = new Float32Array(n); this.gg = new Float32Array(n); this.b = new Float32Array(n); this.a = new Float32Array(n);
    this.fadeIn = new Float32Array(n);
    this.sprite = new Array(n);
  }

  spawn(o) {
    if (this.n >= this.capacity) {
      // Full: recycle the oldest-looking slot instead of dropping the effect.
      this._kill(Math.floor(Math.random() * this.n));
    }
    const i = this.n++;
    const k = this.k;
    this.px[i] = o.x; this.py[i] = o.y; this.pz[i] = o.z;
    this.vx[i] = (o.vx || 0) * k; this.vy[i] = (o.vy || 0) * k; this.vz[i] = (o.vz || 0) * k;
    this.g[i] = (o.g || 0) * k; this.drag[i] = o.drag || 0;
    this.age[i] = -(o.delay || 0); this.life[i] = o.life || 1;
    this.s0[i] = (o.size || 5) * k; this.s1[i] = (o.size1 ?? o.size ?? 5) * k;
    this.rot[i] = o.rot ?? rand(0, 6.283); this.rv[i] = o.rv || 0;
    const c = o.color ?? 0xffffff;
    this.r[i] = ((c >> 16) & 255) / 255; this.gg[i] = ((c >> 8) & 255) / 255; this.b[i] = (c & 255) / 255;
    this.a[i] = o.alpha ?? 1;
    this.fadeIn[i] = o.fadeIn ?? 0.08;
    this.sprite[i] = o.sprite;
  }

  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
    this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
    this.g[i] = this.g[j]; this.drag[i] = this.drag[j];
    this.age[i] = this.age[j]; this.life[i] = this.life[j];
    this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
    this.rot[i] = this.rot[j]; this.rv[i] = this.rv[j];
    this.r[i] = this.r[j]; this.gg[i] = this.gg[j]; this.b[i] = this.b[j]; this.a[i] = this.a[j];
    this.fadeIn[i] = this.fadeIn[j]; this.sprite[i] = this.sprite[j];
  }

  update(dt, atlasSize) {
    const P = this.aPos.array; const SR = this.aSR.array; const C = this.aCol.array; const U = this.aUv.array;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      const age = this.age[i];
      if (age >= this.life[i]) { this._kill(i); i--; continue; }
      if (age < 0) continue; // delayed
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= k; this.vy[i] = this.vy[i] * k - this.g[i] * dt; this.vz[i] *= k;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.rv[i] * dt;
      const t = age / this.life[i];
      const fi = this.fadeIn[i] > 0 ? Math.min(1, t / this.fadeIn[i]) : 1;
      const alpha = this.a[i] * fi * (t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1);
      const sp = this.sprite[i];
      let u0 = sp.u0; let v0 = sp.v0; let u1 = sp.u1; let v1 = sp.v1;
      if (sp.frames > 1) {
        const f = Math.min(sp.frames - 1, Math.floor(t * sp.frames));
        const cx = f % sp.columns; const cy = Math.floor(f / sp.columns);
        u0 = (sp.x + cx * sp.w) / atlasSize; u1 = u0 + sp.w / atlasSize;
        v1 = 1 - (sp.y + cy * sp.h) / atlasSize; v0 = v1 - sp.h / atlasSize;
      }
      P[w * 3] = this.px[i]; P[w * 3 + 1] = this.py[i]; P[w * 3 + 2] = this.pz[i];
      SR[w * 2] = this.s0[i] + (this.s1[i] - this.s0[i]) * t; SR[w * 2 + 1] = this.rot[i];
      C[w * 4] = this.r[i]; C[w * 4 + 1] = this.gg[i]; C[w * 4 + 2] = this.b[i]; C[w * 4 + 3] = alpha;
      U[w * 4] = u0; U[w * 4 + 1] = v0; U[w * 4 + 2] = u1; U[w * 4 + 3] = v1;
      w++;
    }
    this.geo.instanceCount = w;
    if (w) {
      for (const a of [this.aPos, this.aSR, this.aCol, this.aUv]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, w * a.itemSize);
        a.needsUpdate = true;
      }
    }
    this.mesh.visible = w > 0;
  }
}

export class Effects {
  constructor(scene, atlas, maxParticles) {
    this.atlas = atlas;
    this.sprites = new Map();
    const S = atlas.size;
    for (const [key, r] of atlas.rects) {
      this.sprites.set(key, {
        ...r,
        u0: r.x / S, u1: (r.x + r.w) / S, v1: 1 - r.y / S, v0: 1 - (r.y + r.h) / S,
      });
    }
    this.add = new ParticleLayer(atlas, Math.floor(maxParticles * 0.6), true);
    this.norm = new ParticleLayer(atlas, Math.floor(maxParticles * 0.4), false);
    scene.add(this.norm.mesh);
    scene.add(this.add.mesh);
  }

  /** Effects are drawn larger in the overview so they read on a phone. */
  setScale(k) { this.add.k = k; this.norm.k = k; this.k = k; }

  sp(key) { return this.sprites.get(key) || this.sprites.values().next().value; }

  get count() { return this.add.n + this.norm.n; }

  update(dt) {
    this.add.update(dt, this.atlas.size);
    this.norm.update(dt, this.atlas.size);
  }

  clear() { this.add.n = 0; this.norm.n = 0; }

  // ---------- recipes (positions in world units) ----------

  explosion(x, y, z, scale = 1) {
    const s = scale;
    this.add.spawn({ sprite: this.sp('fx_explosion'), x, y: y + 6 * s, z, size: 26 * s, size1: 34 * s, life: 0.55, fadeIn: 0, rot: rand(0, 6) });
    this.add.spawn({ sprite: this.sp('fx_flash'), x, y: y + 5 * s, z, size: 20 * s, size1: 30 * s, life: 0.4, fadeIn: 0 });
    this.add.spawn({ sprite: this.sp('fx_glow'), x, y: y + 4, z, size: 50 * s, size1: 20 * s, life: 0.35, color: 0xffb040, fadeIn: 0 });
    this.add.spawn({ sprite: this.sp('fx_ring'), x, y: y + 1, z, size: 6 * s, size1: 60 * s, life: 0.5, color: 0xffd28a, fadeIn: 0, alpha: 0.9 });
    for (let i = 0; i < 10 * s + 4; i++) {
      const a = rand(0, Math.PI * 2); const sp = rand(25, 70) * s;
      this.add.spawn({ sprite: this.sp('fx_spark'), x, y: y + 3, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rand(20, 60) * s, g: 90, drag: 1.5, size: rand(2, 4) * s, size1: 0.5, life: rand(0.5, 0.9), color: pick([0xffd060, 0xff8a30, 0xffffff]), fadeIn: 0 });
    }
    for (let i = 0; i < 5 * s + 2; i++) {
      this.norm.spawn({ sprite: this.sp(pick(['fx_smoke', 'fx_smoke_b', 'fx_smoke_c'])), x: x + rand(-5, 5) * s, y: y + rand(3, 8) * s, z: z + rand(-5, 5) * s, vy: rand(6, 14), vx: rand(-4, 4), size: rand(10, 16) * s, size1: rand(24, 36) * s, life: rand(1.4, 2.4), color: pick([0x3a3a3a, 0x555555, 0x6b6560]), alpha: 0.75, delay: 0.12, rv: rand(-0.6, 0.6), fadeIn: 0.15 });
    }
    this.norm.spawn({ sprite: this.sp('fx_dust_b'), x, y: y + 2, z, size: 18 * s, size1: 40 * s, life: 0.9, color: 0x8a7a60, alpha: 0.6 });
  }

  muzzle(x, y, z) {
    this.add.spawn({ sprite: this.sp('fx_flash'), x, y, z, size: 10, size1: 14, life: 0.3, fadeIn: 0 });
    this.norm.spawn({ sprite: this.sp('fx_puff'), x, y, z, size: 8, size1: 16, vy: 6, life: 0.9, color: 0xdddddd, alpha: 0.8 });
  }

  trail(x, y, z) {
    this.norm.spawn({ sprite: this.sp('fx_smoke'), x, y, z, size: 3, size1: 7, life: 0.6, color: 0x999999, alpha: 0.5, fadeIn: 0 });
  }

  capture(x, y, z, colorHex, big = false) {
    const b = big ? 1.6 : 1;
    // Shockwave rings + a light column in the conqueror's colour.
    this.add.spawn({ sprite: this.sp('fx_ring'), x, y: y + 1, z, size: 8, size1: 110 * b, life: 0.9, color: colorHex, fadeIn: 0 });
    this.add.spawn({ sprite: this.sp('fx_ring_b'), x, y: y + 1, z, size: 6, size1: 75 * b, life: 0.7, color: 0xffffff, alpha: 0.9, fadeIn: 0, delay: 0.08 });
    this.add.spawn({ sprite: this.sp('fx_ring_soft'), x, y: y + 1, z, size: 10, size1: 70 * b, life: 1.1, color: colorHex, alpha: 0.8, fadeIn: 0 });
    this.add.spawn({ sprite: this.sp('fx_glow'), x, y: y + 14, z, size: 60 * b, size1: 20, life: 0.8, color: colorHex, fadeIn: 0 });
    this.add.spawn({ sprite: this.sp('fx_flash'), x, y: y + 8, z, size: 30 * b, size1: 50 * b, life: 0.35, fadeIn: 0 });
    this.add.spawn({ sprite: this.sp('fx_star_b'), x, y: y + 16, z, size: 10, size1: 42 * b, life: 0.8, color: colorHex, rv: 2 });
    for (let i = 0; i < 18; i++) {
      const a = rand(0, Math.PI * 2); const sp = rand(20, 45);
      this.add.spawn({ sprite: this.sp('fx_star'), x, y: y + 4, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rand(30, 60), g: 70, drag: 1.2, size: rand(3, 5), size1: 1, life: rand(0.7, 1.1), color: i % 2 ? colorHex : 0xffffff, fadeIn: 0 });
    }
  }

  wake(x, y, z, colorHex) {
    this.add.spawn({ sprite: this.sp('fx_magic'), x, y: y + 1, z, size: 10, size1: 50, life: 1.1, color: colorHex, rv: 1.5 });
    this.add.spawn({ sprite: this.sp('fx_trace'), x, y: y + 20, z, size: 40, size1: 40, life: 0.9, color: colorHex, rot: 0 });
    this.add.spawn({ sprite: this.sp('fx_glow'), x, y: y + 6, z, size: 30, size1: 8, life: 0.9, color: colorHex });
  }

  sparkle(x, y, z, colorHex, n = 5, big = 1) {
    for (let i = 0; i < n; i++) {
      this.add.spawn({ sprite: this.sp(i % 2 ? 'fx_star' : 'fx_spark'), x: x + rand(-6, 6), y: y + rand(4, 14), z: z + rand(-6, 6), vy: rand(10, 25), size: rand(3, 6) * big, size1: 0.5, life: rand(0.5, 0.9), color: i % 3 ? colorHex : 0xffffff, rv: rand(-3, 3), fadeIn: 0 });
    }
  }

  clash(x, y, z) {
    this.add.spawn({ sprite: this.sp('fx_slash'), x: x + rand(-6, 6), y: y + rand(5, 10), z: z + rand(-6, 6), size: rand(8, 13), size1: rand(12, 16), life: 0.28, color: 0xffffff, fadeIn: 0 });
    this.add.spawn({ sprite: this.sp('fx_spark'), x: x + rand(-5, 5), y: y + rand(4, 9), z: z + rand(-5, 5), size: rand(4, 7), size1: 1, life: 0.25, color: 0xffe080, fadeIn: 0 });
    if (Math.random() < 0.4) this.norm.spawn({ sprite: this.sp('fx_dust'), x: x + rand(-8, 8), y: y + 2, z: z + rand(-8, 8), size: 8, size1: 16, life: 0.8, color: 0xa08e70, alpha: 0.5 });
  }

  dust(x, y, z) {
    this.norm.spawn({ sprite: this.sp('fx_dust'), x: x + rand(-3, 3), y: y + 1.5, z: z + rand(-3, 3), size: 5, size1: 11, vy: 3, life: 0.9, color: 0xb59f7c, alpha: 0.45 });
  }

  hearts(x, y, z, n = 3) {
    for (let i = 0; i < n; i++) {
      this.add.spawn({ sprite: this.sp('fx_heart'), x: x + rand(-8, 8), y: y + rand(6, 12), z: z + rand(-4, 4), vy: rand(12, 22), size: rand(3, 5), size1: rand(5, 7), life: rand(0.9, 1.3), color: pick([0xff3b6b, 0xff7aa2, 0xff2050]) });
    }
  }

  burning(x, y, z) {
    this.norm.spawn({ sprite: this.sp('fx_black_smoke'), x: x + rand(-4, 4), y: y + 4, z: z + rand(-4, 4), vy: 8, size: 12, size1: 24, life: 1.6, alpha: 0.8 });
    this.add.spawn({ sprite: this.sp('fx_fire'), x: x + rand(-4, 4), y: y + 4, z: z + rand(-4, 4), vy: 6, size: 7, size1: 3, life: 0.7, color: 0xff8030 });
  }

  lightning(x, y, z) {
    this.add.spawn({ sprite: this.sp('fx_lightning'), x, y: y + 35, z, size: 70, size1: 70, life: 0.35, rot: 0, color: 0xcfe6ff, fadeIn: 0 });
    this.add.spawn({ sprite: this.sp('fx_glow'), x, y: y + 5, z, size: 60, size1: 30, life: 0.4, color: 0x9fd0ff, fadeIn: 0 });
  }

  /** Gift arrival at the spawn province, escalating with the tier (0..4). */
  giftBurst(x, y, z, colorHex, tier) {
    const s = [0.8, 1.1, 1.5, 1.9, 2.3][Math.min(4, tier)];
    this.add.spawn({ sprite: this.sp('fx_glow'), x, y: y + 10 * s, z, size: 18 * s, size1: 40 * s, life: 0.7, color: 0xffd700, fadeIn: 0 });
    this.add.spawn({ sprite: this.sp('fx_ring'), x, y: y + 1, z, size: 6, size1: 40 * s, life: 0.6, color: 0xffd700, fadeIn: 0 });
    if (tier >= 1) this.add.spawn({ sprite: this.sp('fx_magic'), x, y: y + 1, z, size: 10, size1: 55 * s, life: 1.0, color: colorHex, rv: 2 });
    if (tier >= 2) this.add.spawn({ sprite: this.sp('fx_flare'), x, y: y + 18, z, size: 30 * s, size1: 10, life: 0.8, color: 0xffffff, fadeIn: 0 });
    // Tier signatures so 1 / 10 / 100 coins read differently at a glance.
    if (tier === 1) {
      // Knights' charge: crossed blade slashes and a kicked-up dust ring.
      for (let i = 0; i < 3; i++) this.add.spawn({ sprite: this.sp('fx_slash'), x: x + rand(-4, 4), y: y + 10, z: z + rand(-3, 3), size: 14, size1: 26, life: 0.45, color: i === 1 ? colorHex : 0xffffff, rot: i * 1.1, fadeIn: 0, delay: i * 0.08 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.norm.spawn({ sprite: this.sp('fx_dust'), x: x + Math.cos(a) * 6, y: y + 2, z: z + Math.sin(a) * 6, vx: Math.cos(a) * 22, vz: Math.sin(a) * 22, drag: 2, size: 6, size1: 14, life: 0.9, color: 0xb59f7c, alpha: 0.6 });
      }
    } else if (tier === 2) {
      // Cannon salute: a ring of muzzle flashes and smoke puffs, then a gold shock ring.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2; const px = x + Math.cos(a) * 16; const pz = z + Math.sin(a) * 12;
        this.add.spawn({ sprite: this.sp('fx_flash'), x: px, y: y + 6, z: pz, size: 10, size1: 18, life: 0.3, fadeIn: 0, delay: i * 0.07 });
        this.norm.spawn({ sprite: this.sp('fx_puff'), x: px, y: y + 6, z: pz, vy: 8, size: 8, size1: 20, life: 1.2, color: 0xdddddd, alpha: 0.8, delay: i * 0.07 });
      }
      this.add.spawn({ sprite: this.sp('fx_ring_b'), x, y: y + 1, z, size: 8, size1: 90, life: 0.8, color: 0xffb040, fadeIn: 0, delay: 0.45 });
      this.add.spawn({ sprite: this.sp('fx_explosion'), x, y: y + 12, z, size: 18, size1: 34, life: 0.5, fadeIn: 0, delay: 0.45 });
    }
    const n = 4 + tier * 5;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2); const sp = rand(10, 30) * s;
      this.add.spawn({ sprite: this.sp(i % 2 ? 'fx_star' : 'fx_spark'), x, y: y + 4, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rand(30, 70) * s, g: 60, drag: 1, size: rand(3, 5) * s, size1: 1, life: rand(0.7, 1.2), color: pick([colorHex, 0xffd700, 0xffffff]), fadeIn: 0 });
    }
  }

  bigBurst(x, y, z, colorHex) {
    this.add.spawn({ sprite: this.sp('fx_burst'), x, y: y + 10, z, size: 20, size1: 110, life: 0.9, color: colorHex, fadeIn: 0, rv: 1 });
    this.add.spawn({ sprite: this.sp('fx_ring_b'), x, y: y + 2, z, size: 10, size1: 160, life: 1.2, color: 0xffd700, fadeIn: 0 });
    this.add.spawn({ sprite: this.sp('fx_magic_b'), x, y: y + 2, z, size: 20, size1: 90, life: 1.4, color: colorHex, rv: -1 });
    for (let i = 0; i < 30; i++) {
      const a = rand(0, Math.PI * 2); const sp = rand(40, 110);
      this.add.spawn({ sprite: this.sp(pick(['fx_star', 'fx_spark', 'fx_flare'])), x, y: y + 6, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rand(40, 100), g: 80, drag: 1, size: rand(3, 7), size1: 1, life: rand(0.9, 1.6), color: pick([colorHex, 0xffd700, 0xffffff]), fadeIn: 0 });
    }
  }
}
