// Attack arrows: a flowing, team-coloured chevron stream from an army's source to its
// target, drawn flat on the map. Pooled ribbons, one small draw call each.
import * as THREE from 'three';
import { TILE_H } from './map.js';

const SEG = 24;

const VERT = /* glsl */`
attribute vec2 aUv;
varying vec2 vUv;
void main() { vUv = aUv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */`
uniform vec3 color; uniform float time; uniform float alpha; uniform float len; uniform float progress;
varying vec2 vUv;
void main() {
  float across = abs(vUv.y - 0.5) * 2.0;           // 0 centre .. 1 edge
  float along = vUv.x;                              // 0 source .. 1 target
  // Chevrons flowing toward the target.
  float v = fract(along * len / 16.0 - time * 1.8 - across * 0.35);
  float chev = smoothstep(0.0, 0.12, v) * (1.0 - smoothstep(0.38, 0.5, v));
  float core = 1.0 - smoothstep(0.15, 0.3, across);
  float edge = 1.0 - smoothstep(0.8, 1.0, across);
  float a = (chev * 0.85 + core * 0.35) * edge;
  // Fade in at the source, solid near the head; dim the part already travelled.
  a *= smoothstep(0.0, 0.08, along);
  a *= mix(0.45, 1.0, step(progress, along));
  vec3 c = mix(color, vec3(1.0), chev * 0.35);
  gl_FragColor = vec4(c, a * alpha);
}`;

export class ArrowRenderer {
  constructor(scene, cap = 40) {
    this.scene = scene;
    this.pool = [];
    this.live = new Map(); // army -> ribbon
    this.cap = cap;
    this.time = 0;
    this.k = 1; // width multiplier (bigger in the overview)
  }

  _make() {
    const n = (SEG + 1) * 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uv = new Float32Array(n * 2);
    const idx = [];
    for (let i = 0; i <= SEG; i++) {
      uv[i * 4] = i / SEG; uv[i * 4 + 1] = 0; uv[i * 4 + 2] = i / SEG; uv[i * 4 + 3] = 1;
      if (i < SEG) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    geo.setAttribute('aUv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color() }, time: { value: 0 }, alpha: { value: 0 }, len: { value: 100 }, progress: { value: 0 } },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    return { mesh, geo, mat, fade: 0, width: 0, key: '' };
  }

  _shape(r, a) {
    const P = r.geo.attributes.position.array;
    const dx = a.tx - a.sx; const dz = a.tz - a.sz;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len; const uz = dz / len;
    const nx = -uz; const nz = ux;
    // A raised arc, so the arrow climbs above the plate badges at both ends.
    const bulge = Math.min(10, len * 0.06) * (a.id % 2 ? 1 : -1);
    const lift = Math.min(34, 8 + len * 0.4) * this.k;
    const w = r.width;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const s = Math.sin(t * Math.PI);
      const b = s * bulge;
      const y = TILE_H + 1 + s * lift;
      const cx = a.sx + dx * t + nx * b; const cz = a.sz + dz * t + nz * b;
      // Shaft, then an arrow head over the last 18%.
      let hw = w * 0.5;
      if (t > 0.82) hw = w * 1.25 * (1 - (t - 0.82) / 0.18);
      else if (t > 0.78) hw = w * 0.5 + (w * 0.75) * ((t - 0.78) / 0.04);
      P[i * 6] = cx + nx * hw; P[i * 6 + 1] = y; P[i * 6 + 2] = cz + nz * hw;
      P[i * 6 + 3] = cx - nx * hw; P[i * 6 + 4] = y; P[i * 6 + 5] = cz - nz * hw;
    }
    r.geo.attributes.position.needsUpdate = true;
    r.mat.uniforms.len.value = len;
  }

  update(dt, armies) {
    this.time += dt;
    const seen = new Set();
    for (const a of armies) {
      if (a.kind === 'move' || a.state === 'done') continue;
      let r = this.live.get(a);
      if (!r) {
        if (this.live.size >= this.cap) continue;
        r = this.pool.pop() || this._make();
        r.fade = 0; r.key = '';
        r.mesh.visible = true;
        r.mat.uniforms.color.value.setHex(a.colorHex);
        this.live.set(a, r);
      }
      seen.add(a);
      const width = Math.min(18, 7 + Math.sqrt(a.troops) * 0.3) * this.k * (a.big ? 1.3 : 1);
      const key = `${a.sx | 0},${a.sz | 0},${a.tx | 0},${a.tz | 0},${width.toFixed(1)},${this.k.toFixed(2)}`;
      if (key !== r.key) { r.key = key; r.width = width; this._shape(r, a); }
      r.fade = Math.min(1, r.fade + dt * 3);
      r.mat.uniforms.alpha.value = r.fade * (a.state === 'fight' ? 1 : 0.9);
      r.mat.uniforms.time.value = this.time;
      r.mat.uniforms.progress.value = Math.min(1, a.traveled / a.dist);
    }
    for (const [a, r] of this.live) {
      if (seen.has(a)) continue;
      r.fade -= dt * 2.5;
      r.mat.uniforms.alpha.value = Math.max(0, r.fade);
      r.mat.uniforms.time.value = this.time;
      if (r.fade <= 0) { r.mesh.visible = false; this.live.delete(a); this.pool.push(r); }
    }
  }

  clear() {
    for (const r of this.live.values()) { r.mesh.visible = false; this.pool.push(r); }
    this.live.clear();
  }
}
