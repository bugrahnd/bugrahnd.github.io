// Cheap team crowds behind each line: two instanced meshes (bodies, heads) for both teams,
// fixed slots filled front-first, a bounce that grows with likes (cosmetic cheering) and a
// counter sprite for everyone beyond the visible cap. Also the name-tag sprite pool.
import * as THREE from 'three';
import { rand, hexNum, clamp } from './util.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);

export class Crowd {
  constructor(scene, config) {
    const v = config.visual;
    this.cap = v.crowdPerSide;
    this.cfg = config;
    const n = this.cap * 2;
    const bodyG = new THREE.CapsuleGeometry(0.19, 0.42, 2, 7);
    bodyG.translate(0, 0.5, 0);
    const headG = new THREE.SphereGeometry(0.15, 7, 5);
    headG.translate(0, 1.05, 0);
    this.bodies = new THREE.InstancedMesh(bodyG, new THREE.MeshLambertMaterial(), n);
    this.heads = new THREE.InstancedMesh(headG, new THREE.MeshLambertMaterial(), n);
    for (const m of [this.bodies, this.heads]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    // Slots per side, nearest to the pit and the line first.
    this.slots = [[], []];
    for (let s = 0; s < 2; s++) {
      const sx = s === 0 ? -1 : 1;
      const list = [];
      // Half behind the line, half in front of it (between the line and the camera).
      for (let i = 0; i < this.cap; i++) {
        const front = i % 2 === 1;
        const x = sx * rand(v.frontX - 0.6, v.frontX + v.slotGap * v.pullersPerSide + 2.5);
        const z = front ? rand(1.45, 4.7) : -rand(1.4, 4.8);
        list.push({ x, z, front, ph: Math.random() * 6.28, sp: rand(5, 8), sc: rand(0.85, 1.0), shade: rand(0.75, 1.15), skin: [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac][i % 5], yaw: rand(-0.4, 0.4) });
      }
      list.sort((a, b) => (Math.abs(a.x) * 0.45 + Math.abs(a.z)) - (Math.abs(b.x) * 0.45 + Math.abs(b.z)));
      this.slots[s] = list;
    }
    this.visible = [0, 0];
    this.cheer = [0, 0];
    this.colors = [0xe63946, 0x2f7cf6];
    this.t = 0;
    this.counters = [makeCounter(scene), makeCounter(scene)];
    this.counterVals = [-1, -1];
    this.ending = null; // { winner } after the round
  }

  setColors(c1, c2) { this.colors = [c1, c2]; this._colorsDirty = true; }

  /** Number of crowd figures per side (members beyond the line). */
  setCounts(a, b, totals) {
    this.want = [a, b];
    this.totals = totals;
  }

  likes(teamId, count) {
    const i = teamId === 1 ? 0 : 1;
    this.cheer[i] = Math.min(1.6, this.cheer[i] + 0.12 + Math.min(0.5, count * 0.02));
  }

  update(dt, camera) {
    this.t += dt;
    let w = 0;
    for (let s = 0; s < 2; s++) {
      this.cheer[s] = Math.max(0, this.cheer[s] - dt * 0.5);
      const want = clamp(this.want?.[s] ?? 0, 0, this.cap);
      // Grow/shrink smoothly so joins pop in one by one.
      if (this.visible[s] < want) this.visible[s] = Math.min(want, this.visible[s] + Math.max(1, dt * 30));
      else this.visible[s] = Math.max(want, this.visible[s] - dt * 60);
      const nVis = Math.floor(this.visible[s]);
      const won = this.ending && this.ending.winner === s + 1;
      const amp = 0.03 + this.cheer[s] * 0.18 + (won ? 0.3 : 0);
      for (let i = 0; i < nVis; i++) {
        const sl = this.slots[s][i];
        const y = Math.abs(Math.sin(this.t * sl.sp + sl.ph)) * amp;
        _q.setFromAxisAngle(_yAxis, (s === 0 ? 0 : Math.PI) + sl.yaw * 0.3 + Math.PI * 0.5 * (s === 0 ? -0.3 : 0.3));
        _m.compose(_p.set(sl.x, y, sl.z), _q, _s.set(sl.sc, sl.sc, sl.sc));
        this.bodies.setMatrixAt(w, _m);
        this.heads.setMatrixAt(w, _m);
        this.bodies.setColorAt(w, _c.setHex(this.colors[s]).multiplyScalar(sl.shade));
        this.heads.setColorAt(w, _c.setHex(sl.skin));
        w++;
      }
      // Counter: members not drawn as a line figure or a crowd figure.
      const total = this.totals?.[s] ?? 0;
      const extra = Math.max(0, total);
      const c = this.counters[s];
      if (extra !== this.counterVals[s]) { this.counterVals[s] = extra; drawCounter(c, extra, this.colors[s]); }
      c.sprite.visible = this.cfg.visual.crowdCounter && extra > 0;
      const v = this.cfg.visual;
      c.sprite.position.set((s === 0 ? -1 : 1) * (v.frontX + v.slotGap * v.pullersPerSide * 0.55), 2.6 + Math.sin(this.t * 2) * 0.05, -3.8);
    }
    this.bodies.count = this.heads.count = w;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    if (w) {
      this.bodies.instanceColor.needsUpdate = true;
      this.heads.instanceColor.needsUpdate = true;
    }
  }
}

/**
 * Team crowds from the generators (assets/gen createCrowd: one GPU-animated instanced mesh)
 * with the member counter sprites of the procedural Crowd. Same interface as Crowd.
 */
export class GenCrowd {
  constructor(scene, config, gen) {
    this.cfg = config;
    // Thin front groups, kept well in front of the lane so they never merge with the pullers.
    this.inner = gen.createCrowd({ visual: config.visual, frontShare: 0.22, frontZ: [4.5, 5.1], backZ: [3.7, 5.4] });
    scene.add(this.inner.object3D);
    this.colors = [0xe63946, 0x2f7cf6];
    this.counters = [makeCounter(scene), makeCounter(scene)];
    this.counterVals = [-1, -1];
    this.totals = [0, 0];
    this.t = 0;
    this.bodies = { count: 0 };
  }

  get ending() { return this.inner.ending; }
  set ending(v) { this.inner.ending = v; }

  setColors(c1, c2) { this.colors = [c1, c2]; this.inner.setColors(c1, c2); this.counterVals = [-1, -1]; }
  setCounts(a, b, totals) { this.inner.setCounts(a, b); this.totals = totals || [a, b]; }
  likes(teamId, count) { this.inner.likes(teamId, count); }
  cheerTeam(teamId, k) { const i = teamId === 1 ? 0 : 1; this.inner.cheer[i] = Math.min(1.6, this.inner.cheer[i] + k); }

  update(dt) {
    this.t += dt;
    this.inner.update(dt);
    this.bodies.count = Math.floor(this.inner.visible[0] + this.inner.visible[1]);
    const v = this.cfg.visual;
    for (let s = 0; s < 2; s++) {
      const total = this.totals?.[s] ?? 0;
      const c = this.counters[s];
      if (total !== this.counterVals[s]) { this.counterVals[s] = total; drawCounter(c, total, this.colors[s]); }
      c.sprite.visible = v.crowdCounter && total > 0;
      c.sprite.position.set((s === 0 ? -1 : 1) * (v.frontX + 1.6), 2.5 + Math.sin(this.t * 2) * 0.05, -4.2);
    }
  }
}

function makeCounter(scene) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(2.4, 0.9, 1);
  sprite.renderOrder = 20;
  scene.add(sprite);
  return { cv, tex, sprite };
}

function drawCounter(c, n, color) {
  const ctx = c.cv.getContext('2d');
  ctx.clearRect(0, 0, 256, 96);
  const col = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = 'rgba(15,18,30,0.72)';
  roundRect(ctx, 8, 14, 240, 68, 34); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 6;
  roundRect(ctx, 8, 14, 240, 68, 34); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 46px "Paytone One", "Arial Black", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`👥 ${n}`, 128, 50);
  c.tex.needsUpdate = true;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Pool of name-tag sprites (canvas text), re-drawn only when the text changes. */
export class TagPool {
  constructor(scene, size = 10) {
    this.free = [];
    this.all = [];
    for (let i = 0; i < size; i++) {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sprite.renderOrder = 21;
      sprite.visible = false;
      scene.add(sprite);
      const tag = { cv, tex, sprite, key: '' };
      this.free.push(tag); this.all.push(tag);
    }
  }

  acquire() { return this.free.pop() || null; }

  release(tag) {
    if (!tag) return;
    tag.sprite.visible = false;
    this.free.push(tag);
  }

  /** text, accent colour, style: 'captain' | 'special' | 'join' */
  set(tag, text, color, style) {
    const key = `${text}|${color}|${style}`;
    if (tag.key === key) return;
    tag.key = key;
    const ctx = tag.cv.getContext('2d');
    ctx.clearRect(0, 0, 512, 112);
    ctx.font = '800 50px Nunito, "Segoe UI", sans-serif';
    const label = style === 'captain' ? `👑 ${text}` : text;
    const w = Math.min(500, ctx.measureText(label).width + 56);
    const x = (512 - w) / 2;
    const col = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillStyle = style === 'captain' ? 'rgba(60,40,0,0.86)' : 'rgba(12,16,28,0.78)';
    roundRect(ctx, x, 14, w, 80, 40); ctx.fill();
    ctx.strokeStyle = style === 'captain' ? '#ffc83d' : col; ctx.lineWidth = 7;
    roundRect(ctx, x, 14, w, 80, 40); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 256, 56, 470);
    tag.tex.needsUpdate = true;
    const k = Math.max(0.55, w / 512);
    tag.aspect = k;
  }
}
