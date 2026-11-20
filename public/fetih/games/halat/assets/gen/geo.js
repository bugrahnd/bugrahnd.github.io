// Geometry helpers for the generators: smooth lofts, capsules, lathes, ellipsoids, tubes, rounded boxes and a
// merge-builder that writes position/normal/color/team (+ skinIndex/skinWeight) into ONE indexed BufferGeometry
// (one draw call per character / prop group).
import * as THREE from 'three';

const _v = new THREE.Vector3(), _n = new THREE.Vector3();

/** Smooth loft along +Y: rings = [{ y, rx, rz?, cx?, cz? }]; rx = 0 makes a pole. Indexed, seamless normals. */
export function loft(rings, radial = 12) {
  const pos = [], idx = [], ringStart = [];
  for (const r of rings) {
    ringStart.push(pos.length / 3);
    const rz = r.rz ?? r.rx;
    if (r.rx <= 1e-5) { pos.push(r.cx || 0, r.y, r.cz || 0); continue; }
    for (let i = 0; i < radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      pos.push((r.cx || 0) + Math.sin(a) * r.rx, r.y, (r.cz || 0) + Math.cos(a) * rz);
    }
  }
  for (let k = 0; k < rings.length - 1; k++) {
    const A = ringStart[k], B = ringStart[k + 1];
    const pa = rings[k].rx <= 1e-5, pb = rings[k + 1].rx <= 1e-5;
    const up = rings[k + 1].y > rings[k].y;
    for (let i = 0; i < radial; i++) {
      const j = (i + 1) % radial;
      if (pa && pb) continue;
      const tri = (a, b, c) => (up ? idx.push(a, c, b) : idx.push(a, b, c)); // CCW seen from outside
      if (pa) tri(A, B + i, B + j);
      else if (pb) tri(A + i, B, A + j);
      else { tri(A + i, B + i, A + j); tri(A + j, B + i, B + j); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Vertical capsule / tapered limb: pts ascending in y, [{ y, rx, rz?, cx?, cz?, cap? }]. Hemispherical (or
 * squashed: cap = height factor) ends are added below the first and above the last point.
 */
export function capsule(pts, radial = 10, capSteps = 3) {
  const out = [];
  const a = pts[0], b = pts[pts.length - 1];
  const ca = a.cap ?? 1, cb = b.cap ?? 1;
  const base = p => ({ cx: p.cx || 0, cz: p.cz || 0 });
  out.push({ ...base(a), y: a.y - a.rx * ca, rx: 0 });
  for (let s = capSteps - 1; s >= 1; s--) {
    const t = (s / capSteps) * Math.PI / 2;
    out.push({ ...base(a), y: a.y - Math.sin(t) * a.rx * ca, rx: a.rx * Math.cos(t), rz: (a.rz ?? a.rx) * Math.cos(t) });
  }
  for (const p of pts) out.push({ ...base(p), y: p.y, rx: p.rx, rz: p.rz ?? p.rx });
  for (let s = 1; s < capSteps; s++) {
    const t = (s / capSteps) * Math.PI / 2;
    out.push({ ...base(b), y: b.y + Math.sin(t) * b.rx * cb, rx: b.rx * Math.cos(t), rz: (b.rz ?? b.rx) * Math.cos(t) });
  }
  out.push({ ...base(b), y: b.y + b.rx * cb, rx: 0 });
  return loft(out, radial);
}

/** Closed ring (band, belt, cuff, hem) around the Y axis: radius r, height h, thickness t, elliptic (sz = z/x). */
export function band(r, h, t, seg = 18, sz = 1, n = 0) {
  if (n === 0) { // plain rectangle profile; smooth normals round it visually (cheap: 8 triangles per segment)
    const pr = [[r + t / 2, -h / 2], [r + t / 2, h / 2], [r - t / 2, h / 2], [r - t / 2, -h / 2], [r + t / 2, -h / 2]].map(([a, b]) => new THREE.Vector2(a, b));
    let g0 = new THREE.LatheGeometry(pr, seg); g0.deleteAttribute('uv'); g0.deleteAttribute('normal');
    g0 = mergeVerticesSimple(g0, 1e-5); if (sz !== 1) g0.scale(1, 1, sz); g0.computeVertexNormals();
    return g0;
  }
  const pts = [];
  const cr = Math.min(t, h) * 0.49;
  // rounded-rectangle profile, counter-clockwise in (radius, y) => outward-facing lathe
  const corners = [[r + t / 2 - cr, h / 2 - cr, 0], [r - t / 2 + cr, h / 2 - cr, Math.PI / 2], [r - t / 2 + cr, -h / 2 + cr, Math.PI], [r + t / 2 - cr, -h / 2 + cr, Math.PI * 1.5]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push(new THREE.Vector2(cx + Math.cos(a) * cr, cy + Math.sin(a) * cr)); }
  pts.push(pts[0].clone());
  let g = new THREE.LatheGeometry(pts, seg);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVerticesSimple(g, 1e-5);
  if (sz !== 1) g.scale(1, 1, sz);
  g.computeVertexNormals();
  return g;
}

/** Ellipsoid (smooth). */
export function ellipsoid(rx, ry, rz, w = 14, h = 10) {
  const g = new THREE.SphereGeometry(1, w, h);
  g.deleteAttribute('uv');
  g.scale(rx, ry, rz);
  const m = mergeVerticesSimple(g, 1e-6); m.computeVertexNormals();
  return m;
}

/** Tube along a polyline with radius per point (number, array, [ra, rb] elliptic, or fn(t)), optional rounded caps. */
export function tube(points, radius, radial = 8, { caps = true } = {}) {
  const pts = points.map(p => (p.isVector3 ? p : new THREE.Vector3(...p)));
  const n = pts.length; const rad = i => (typeof radius === 'function' ? radius(i / (n - 1)) : Array.isArray(radius) && radius.length === n ? radius[i] : radius);
  const T = [], N = [], B = [];
  for (let i = 0; i < n; i++) T.push(new THREE.Vector3().subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize());
  const ref = Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const nn = new THREE.Vector3().crossVectors(T[0], ref).normalize();
  for (let i = 0; i < n; i++) {
    if (i > 0) { const b = new THREE.Vector3().crossVectors(T[i - 1], T[i]); if (b.length() > 1e-6) { b.normalize(); const ang = Math.acos(THREE.MathUtils.clamp(T[i - 1].dot(T[i]), -1, 1)); nn.applyAxisAngle(b, ang); } }
    N.push(nn.clone()); B.push(new THREE.Vector3().crossVectors(T[i], nn).normalize());
  }
  const pos = [], idx = [];
  const ring = (c, i, r) => { const [ra, rb] = Array.isArray(r) ? r : [r, r]; for (let k = 0; k < radial; k++) { const a = (k / radial) * Math.PI * 2; _v.copy(c).addScaledVector(N[i], Math.cos(a) * ra).addScaledVector(B[i], Math.sin(a) * rb); pos.push(_v.x, _v.y, _v.z); } };
  const rings = [];
  const r0 = rad(0), rN = rad(n - 1);
  const rr = r => (Array.isArray(r) ? r[0] : r);
  const sc = (r, k) => (Array.isArray(r) ? r.map(x => x * k) : r * k);
  if (caps) { rings.push(['pole', pts[0].clone().addScaledVector(T[0], -rr(r0) * 0.95)]); rings.push(['ring', pts[0].clone().addScaledVector(T[0], -rr(r0) * 0.7), 0, sc(r0, 0.72)]); }
  for (let i = 0; i < n; i++) rings.push(['ring', pts[i], i, rad(i)]);
  if (caps) { rings.push(['ring', pts[n - 1].clone().addScaledVector(T[n - 1], rr(rN) * 0.7), n - 1, sc(rN, 0.72)]); rings.push(['pole', pts[n - 1].clone().addScaledVector(T[n - 1], rr(rN) * 0.95)]); }
  const start = [];
  for (const r of rings) { start.push(pos.length / 3); if (r[0] === 'pole') pos.push(r[1].x, r[1].y, r[1].z); else ring(r[1], r[2], r[3]); }
  for (let k = 0; k < rings.length - 1; k++) {
    const A = start[k], Bs = start[k + 1], pa = rings[k][0] === 'pole', pb = rings[k + 1][0] === 'pole';
    for (let i = 0; i < radial; i++) {
      const j = (i + 1) % radial;
      if (pa) idx.push(A, Bs + j, Bs + i); else if (pb) idx.push(A + i, A + j, Bs); else { idx.push(A + i, A + j, Bs + i); idx.push(A + j, Bs + j, Bs + i); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** Rounded box: a subdivided box whose vertices are pushed onto rounded corners (smooth normals). */
export function roundedBox(w, h, d, r = 0.1, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const p = g.attributes.position, hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    c.set(THREE.MathUtils.clamp(_v.x, -hw, hw), THREE.MathUtils.clamp(_v.y, -hh, hh), THREE.MathUtils.clamp(_v.z, -hd, hd));
    _n.subVectors(_v, c); if (_n.lengthSq() < 1e-12) _n.set(0, 1, 0);
    _n.normalize(); _v.copy(c).addScaledVector(_n, r);
    p.setXYZ(i, _v.x, _v.y, _v.z);
  }
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const m = mergeVerticesSimple(g); m.computeVertexNormals();
  return m;
}

/** Weld coincident vertices (position only) so normals become smooth. */
export function mergeVerticesSimple(g, tol = 1e-4) {
  const p = g.attributes.position; const map = new Map(); const pos = []; const remap = new Uint32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) / tol)},${Math.round(p.getY(i) / tol)},${Math.round(p.getZ(i) / tol)}`;
    let j = map.get(k); if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
    remap[i] = j;
  }
  const idx = [];
  const I = g.index; const cnt = I ? I.count : p.count;
  for (let t = 0; t < cnt; t += 3) {
    const a = remap[I ? I.getX(t) : t], b = remap[I ? I.getX(t + 1) : t + 1], c = remap[I ? I.getX(t + 2) : t + 2];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setIndex(idx); return o;
}

/** Apply fn(v: Vector3) to every vertex (in place) and recompute normals. */
export function warp(g, fn) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); fn(_v); p.setXYZ(i, _v.x, _v.y, _v.z); }
  g.computeVertexNormals();
  return g;
}

/**
 * Collects parts into one geometry. part options:
 *   color: hex | THREE.Color | (pos) => THREE.Color     team: 0..1 | (pos) => number
 *   bones: [[boneIndex, weight], ...] | (pos) => [[i,w],...]   (skinned builds only)
 *   matrix: THREE.Matrix4 applied first (normals transformed too)
 *   uv: false | (pos, normal) => [u, v]   (only when the builder was created with { uv: true })
 */
export class MeshBuilder {
  constructor({ skinned = false, uv = false } = {}) { this.skinned = skinned; this.uv = uv; this.P = []; this.N = []; this.C = []; this.T = []; this.WV = []; this.SI = []; this.SW = []; this.UV = []; this.I = []; this.count = 0; }
  add(geo, { color = 0xffffff, team = 0, bones = null, matrix = null, uv = null, wave = 0 } = {}) {
    let g = geo;
    if (matrix) { g = g.clone(); g.applyMatrix4(matrix); }
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal, base = this.count;
    const col = new THREE.Color();
    const nv = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      this.P.push(_v.x, _v.y, _v.z); this.N.push(n.getX(i), n.getY(i), n.getZ(i));
      if (typeof color === 'function') col.copy(color(_v)); else col.set(color);
      this.C.push(col.r, col.g, col.b);
      this.T.push(typeof team === 'function' ? team(_v) : team);
      this.WV.push(typeof wave === 'function' ? wave(_v) : wave);
      if (this.uv) {
        if (uv) { nv.fromBufferAttribute(n, i); const [u, w] = uv(_v, nv); this.UV.push(u, w); }
        else if (g.attributes.uv) this.UV.push(g.attributes.uv.getX(i), g.attributes.uv.getY(i));
        else this.UV.push(0, 0);
      }
      if (this.skinned) {
        const bw = typeof bones === 'function' ? bones(_v) : bones || [[0, 1]];
        const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
        bw.filter(x => x[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4).forEach(([b, w], k) => { si[k] = b; sw[k] = w; });
        const s = sw[0] + sw[1] + sw[2] + sw[3] || 1; this.SI.push(...si); this.SW.push(...sw.map(w => w / s));
      }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.I.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.I.push(base + i);
    this.count += p.count;
    return this;
  }
  get triangles() { return this.I.length / 3; }
  build({ team = true } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    if (team) g.setAttribute('team', new THREE.Float32BufferAttribute(this.T, 1));
    if (this.WV.some(v => v !== 0)) g.setAttribute('wave', new THREE.Float32BufferAttribute(this.WV, 1));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    if (this.skinned) {
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    }
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

export const M4 = {
  t: (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z),
  trs: (t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => new THREE.Matrix4().compose(new THREE.Vector3(...t), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...(typeof s === 'number' ? [s, s, s] : s))),
};

/** Deterministic PRNG (mulberry32). */
export function rng(seed = 1) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
