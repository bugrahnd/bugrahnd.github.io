// Stylised farm tractor: rounded hood and fenders, glass cab, big lugged rear wheels, small front wheels,
// exhaust stack with a puff anchor and a rear hitch. ONE SkinnedMesh (one draw call) whose bones spin the
// wheels and shake the chassis; clips: idle (engine shake), drive (rolling), pull (straining: wheels spin
// faster, nose lifts, heavy shake).
// Units: metres, faces +Z (drives forward toward +Z), ground y = 0, about 3.0 long, 1.9 wide, 2.3 tall.
import * as THREE from 'three';
import { capsule, band, ellipsoid, roundedBox, tube, warp, mergeVerticesSimple, MeshBuilder, M4 } from './geo.js';
import { toonMaterial } from './toon.js';

const BONES = ['root', 'body', 'wheelRL', 'wheelRR', 'wheelFL', 'wheelFR', 'exhaust'];
const RR = 0.72, RW = 0.44, RX = 0.8, RZ = -0.6;        // rear wheels: radius, width, x, z
const FR = 0.36, FW = 0.26, FX = 0.62, FZ = 1.02;      // front wheels (half the radius => exactly 2 turns per rear turn)
const PIPE = [0.3, 2.12, 0.42];                        // exhaust tip
const HITCH = [0, 0.56, -1.52];
const C = h => new THREE.Color(h);
const grey = v => C(0xffffff).multiplyScalar(v);

/** A wheel around the X axis centred at the origin: tyre with chevron lugs, dished rim, hub. */
function wheelParts(mb, r, w, bone, { rim = 0xf2c230, lugs = 16, tread = true } = {}) {
  const tyre = 0x2d2f36, tyreSide = 0x3a3d45;
  // tyre: closed rounded profile (counter-clockwise in (radius, y) => outward faces) lathed around Y, turned to X
  const n = 6, outer = [];
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI; outer.push(new THREE.Vector2(r - (1 - Math.cos(a)) * r * 0.16, (w / 2) * Math.sin(a))); }
  const full = [new THREE.Vector2(r * 0.64, w / 2), new THREE.Vector2(r * 0.64, -w / 2), ...outer, new THREE.Vector2(r * 0.64, w / 2)];
  let g = new THREE.LatheGeometry(full.map(p => new THREE.Vector2(p.x, p.y)), 22); g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVerticesSimple(g, 1e-5); g.computeVertexNormals();
  g.rotateZ(Math.PI / 2);
  mb.add(g, { color: p => (Math.hypot(p.y, p.z) > r * 0.8 ? C(tyre) : C(tyreSide)), bones: bone });
  if (tread) { // chevron lugs on the tread
    for (let k = 0; k < lugs; k++) {
      const a = (k / lugs) * Math.PI * 2;
      for (const s of [1, -1]) {
        const lug = new THREE.BoxGeometry(w * 0.46, 0.06, 0.1); lug.deleteAttribute('uv'); lug.deleteAttribute('normal');
        const m = new THREE.Matrix4().makeRotationX(a).multiply(M4.trs([s * w * 0.24, r - 0.022, 0], [0, s * 0.45, 0]));
        mb.add(lug, { color: tyre, bones: bone, matrix: m });
      }
    }
  }
  // rim: dished disc both sides + hub + lug nuts
  for (const s of [1, -1]) {
    const disc = new THREE.CylinderGeometry(r * 0.64, r * 0.6, 0.04, 22, 1); disc.deleteAttribute('uv');
    disc.rotateZ(Math.PI / 2);
    mb.add(disc, { color: rim, bones: bone, matrix: M4.t(s * (w / 2 - 0.05), 0, 0) });
    const hub = new THREE.CylinderGeometry(r * 0.24, r * 0.3, 0.1, 14, 1); hub.deleteAttribute('uv'); hub.rotateZ(-s * Math.PI / 2);
    mb.add(hub, { color: C(rim).multiplyScalar(0.8), bones: bone, matrix: M4.t(s * (w / 2 - 0.0), 0, 0) });
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; mb.add(ellipsoid(0.022, 0.022, 0.022, 4, 3), { color: grey(0.85), bones: bone, matrix: M4.t(s * (w / 2 + 0.035), Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.16) }); }
  }
}

/** Arc fender over a wheel: extruded ring sector (rounded), across X with width w. */
function fender(r0, r1, w, a0, a1) {
  const sh = new THREE.Shape();
  sh.absarc(0, 0, r1, a0, a1, false);
  sh.absarc(0, 0, r0, a1, a0, true);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: w - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 9 });
  g.deleteAttribute('uv'); g.translate(0, 0, -(w - 0.06) / 2);
  g.rotateY(Math.PI / 2); // extrusion along X; the arc lies in the YZ plane
  const m = mergeVerticesSimple(g, 1e-5); m.computeVertexNormals();
  return m;
}

let GEO = null;
function buildTractor() {
  if (GEO) return GEO;
  const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
  const mb = new MeshBuilder({ skinned: true });
  const body = [[B.body, 1]];
  const TEAM = 1, dark = 0x34363d, metal = 0xb9c0c9, glass = 0x9fd8f2, black = 0x202228;
  // ---- chassis rails + belly
  mb.add(roundedBox(0.62, 0.3, 2.5, 0.08, 1), { color: dark, bones: body, matrix: M4.t(0, 0.62, 0.15) });
  // ---- hood (engine): rounded, nose slightly lower, team colour
  const hood = warp(roundedBox(0.92, 0.72, 1.5, 0.22, 3), v => { const t = THREE.MathUtils.clamp(v.z / 0.75, -1, 1); if (v.y > 0) v.y -= 0.08 * Math.max(0, t) ** 2; v.x *= 1 - 0.06 * Math.max(0, t); });
  mb.add(hood, { color: p => (p.y < 0.82 ? grey(0.78) : grey(1)), team: TEAM, bones: body, matrix: M4.t(0, 1.06, 0.66) });
  // hood stripe + side vents
  mb.add(roundedBox(0.2, 0.04, 1.36, 0.02, 1), { color: 0xffffff, bones: body, matrix: M4.trs([0, 1.43, 0.66], [0.035, 0, 0]) });
  for (const s of [1, -1]) for (let k = 0; k < 3; k++) mb.add(roundedBox(0.03, 0.05, 0.36, 0.015, 1), { color: black, bones: body, matrix: M4.t(s * 0.455, 1.12 - k * 0.1, 0.78) });
  // grille + headlights + bumper
  mb.add(roundedBox(0.66, 0.5, 0.08, 0.05, 1), { color: black, bones: body, matrix: M4.t(0, 1.0, 1.42) });
  for (let k = 0; k < 4; k++) mb.add(roundedBox(0.58, 0.03, 0.04, 0.012, 1), { color: metal, bones: body, matrix: M4.t(0, 0.83 + k * 0.11, 1.46) });
  for (const s of [1, -1]) {
    mb.add(ellipsoid(0.1, 0.1, 0.06, 12, 8), { color: 0xfff6c8, bones: body, matrix: M4.t(s * 0.32, 1.3, 1.4) });
    mb.add(band(0.1, 0.05, 0.03, 14).rotateX(Math.PI / 2), { color: metal, bones: body, matrix: M4.t(s * 0.32, 1.3, 1.4) });
  }
  mb.add(roundedBox(1.02, 0.14, 0.14, 0.06, 1), { color: dark, bones: body, matrix: M4.t(0, 0.62, 1.48) });
  // ---- rear body / seat box under the cab
  mb.add(roundedBox(1.1, 0.5, 1.0, 0.12, 2), { color: p => grey(p.y > 1.18 ? 1 : 0.78), team: TEAM, bones: body, matrix: M4.t(0, 1.0, -0.62) });
  // ---- fenders over the rear wheels (team) and small front mudguards (dark)
  for (const s of [1, -1]) {
    mb.add(fender(RR + 0.05, RR + 0.15, RW + 0.12, Math.PI * 0.08, Math.PI * 0.92), { color: grey(1), team: TEAM, bones: body, matrix: M4.t(s * RX, RR, RZ) });
    mb.add(fender(FR + 0.05, FR + 0.1, FW + 0.08, Math.PI * 0.12, Math.PI * 0.88), { color: dark, bones: body, matrix: M4.t(s * FX, FR, FZ) });
    // step
    mb.add(roundedBox(0.22, 0.04, 0.3, 0.015, 1), { color: metal, bones: body, matrix: M4.t(s * 0.62, 0.5, -0.02) });
  }
  // axles
  mb.add(capsule([{ y: -RX, rx: 0.07 }, { y: RX, rx: 0.07 }], 8, 2).rotateZ(Math.PI / 2), { color: dark, bones: body, matrix: M4.t(0, RR, RZ) });
  mb.add(capsule([{ y: -FX, rx: 0.06 }, { y: FX, rx: 0.06 }], 8, 2).rotateZ(Math.PI / 2), { color: dark, bones: body, matrix: M4.t(0, FR, FZ) });
  // ---- cab: 4 pillars, glass, roof
  const cy0 = 1.25, cy1 = 2.22, cz0 = -1.08, cz1 = -0.16, cx = 0.56;
  for (const sx of [1, -1]) for (const z of [cz0, cz1]) mb.add(roundedBox(0.09, cy1 - cy0, 0.09, 0.035, 1), { color: grey(0.78), team: TEAM, bones: body, matrix: M4.t(sx * cx, (cy0 + cy1) / 2, z) });
  const glassC = p => (p.y > 1.95 && p.y < 2.02 ? C(0xe9f8ff) : C(glass));
  mb.add(roundedBox(cx * 2 - 0.06, cy1 - cy0 - 0.1, 0.04, 0.02, 1), { color: glassC, bones: body, matrix: M4.trs([0, (cy0 + cy1) / 2 - 0.02, cz1 + 0.01], [-0.06, 0, 0]) });
  mb.add(roundedBox(cx * 2 - 0.06, cy1 - cy0 - 0.1, 0.04, 0.02, 1), { color: glass, bones: body, matrix: M4.t(0, (cy0 + cy1) / 2, cz0) });
  for (const sx of [1, -1]) mb.add(roundedBox(0.04, cy1 - cy0 - 0.1, cz1 - cz0 - 0.06, 0.02, 1), { color: glassC, bones: body, matrix: M4.t(sx * cx, (cy0 + cy1) / 2, (cz0 + cz1) / 2) });
  mb.add(warp(roundedBox(cx * 2 + 0.3, 0.14, cz1 - cz0 + 0.36, 0.07, 2), v => { if (v.y > 0) v.y += 0.06 * (1 - (v.x / (cx + 0.15)) ** 2); }), { color: 0xffffff, bones: body, matrix: M4.t(0, cy1 + 0.05, (cz0 + cz1) / 2) });
  // seat + steering wheel (seen through the glass)
  mb.add(roundedBox(0.42, 0.12, 0.4, 0.05, 1), { color: black, bones: body, matrix: M4.t(0, 1.38, -0.72) });
  mb.add(roundedBox(0.42, 0.42, 0.1, 0.05, 1), { color: black, bones: body, matrix: M4.trs([0, 1.6, -0.92], [-0.2, 0, 0]) });
  mb.add(band(0.13, 0.03, 0.03, 14).rotateX(1.0), { color: black, bones: body, matrix: M4.t(0, 1.72, -0.36) });
  // ---- exhaust stack (+ rain cap on its own bone)
  mb.add(capsule([{ y: 1.2, rx: 0.06 }, { y: PIPE[1] - 0.08, rx: 0.06 }], 10, 1), { color: metal, bones: body, matrix: M4.t(PIPE[0], 0, PIPE[2]) });
  mb.add(band(0.075, 0.12, 0.03, 12), { color: dark, bones: body, matrix: M4.t(PIPE[0], 1.56, PIPE[2]) });
  mb.add(warp(ellipsoid(0.085, 0.03, 0.085, 10, 5), v => { if (v.y < 0) v.y *= 0.3; }), { color: dark, bones: [[B.exhaust, 1]], matrix: M4.trs([PIPE[0], PIPE[1] + 0.01, PIPE[2] - 0.04], [-0.35, 0, 0]) });
  // ---- hitch: drawbar + ring
  mb.add(roundedBox(0.16, 0.1, 0.5, 0.04, 1), { color: dark, bones: body, matrix: M4.t(HITCH[0], HITCH[1], HITCH[2] + 0.22) });
  mb.add(band(0.08, 0.05, 0.035, 14), { color: metal, bones: body, matrix: M4.t(...HITCH) });
  // rear lights
  for (const s of [1, -1]) mb.add(roundedBox(0.12, 0.08, 0.04, 0.02, 1), { color: 0xff4a3a, bones: body, matrix: M4.t(s * 0.42, 1.16, -1.13) });
  // ---- wheels (each on its own bone, built at the origin and moved to the bone position)
  // (copy vertex colours from the wheel sub-build)
  const addWheel = (bone, x, y, z, r, w, opts) => {
    const wm = new MeshBuilder({ skinned: true });
    wheelParts(wm, r, w, [[B[bone], 1]], opts);
    const base = mb.count;
    for (let i = 0; i < wm.count; i++) {
      mb.P.push(wm.P[i * 3] + x, wm.P[i * 3 + 1] + y, wm.P[i * 3 + 2] + z); mb.N.push(wm.N[i * 3], wm.N[i * 3 + 1], wm.N[i * 3 + 2]);
      mb.C.push(wm.C[i * 3], wm.C[i * 3 + 1], wm.C[i * 3 + 2]); mb.T.push(0); mb.WV.push(0); mb.SI.push(B[bone], 0, 0, 0); mb.SW.push(1, 0, 0, 0);
    }
    for (const ix of wm.I) mb.I.push(base + ix);
    mb.count += wm.count;
  };
  for (const s of [1, -1]) {
    addWheel(s > 0 ? 'wheelRL' : 'wheelRR', s * RX, RR, RZ, RR, RW, { rim: 0xf2c230, lugs: 18 });
    addWheel(s > 0 ? 'wheelFL' : 'wheelFR', s * FX, FR, FZ, FR, FW, { rim: 0xf2c230, lugs: 12 });
  }
  GEO = mb.build();
  GEO.userData.triangles = mb.triangles;
  return GEO;
}

function skeleton() {
  const pos = { root: [0, 0, 0], body: [0, 0.75, 0], wheelRL: [RX, RR, RZ], wheelRR: [-RX, RR, RZ], wheelFL: [FX, FR, FZ], wheelFR: [-FX, FR, FZ], exhaust: [PIPE[0], PIPE[1], PIPE[2]] };
  const par = { body: 'root', wheelRL: 'root', wheelRR: 'root', wheelFL: 'root', wheelFR: 'root', exhaust: 'body' };
  const bones = {};
  for (const n of BONES) { const b = new THREE.Bone(); b.name = n; bones[n] = b; }
  for (const n of BONES) { const p = par[n]; if (p) { bones[p].add(bones[n]); bones[n].position.set(pos[n][0] - pos[p][0], pos[n][1] - pos[p][1], pos[n][2] - pos[p][2]); } else bones[n].position.set(...pos[n]); }
  return { bones, list: BONES.map(n => bones[n]) };
}

let CLIPS = null;
/** idle / drive / pull clips (shared by every tractor). */
export function tractorClips() {
  if (CLIPS) return CLIPS;
  const FPS = 30, q = new THREE.Quaternion(), e = new THREE.Euler();
  const make = (name, dur, f) => {
    const n = Math.round(dur * FPS), times = [], tr = { body: [], bodyP: [], wheelRL: [], wheelRR: [], wheelFL: [], wheelFR: [], exhaust: [] };
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * dur, p = i / n; times.push(t);
      const o = f(p, t);
      q.setFromEuler(e.set(o.pitch || 0, 0, o.roll || 0)); tr.body.push(q.x, q.y, q.z, q.w);
      tr.bodyP.push(0, 0.75 + (o.bob || 0), o.surge || 0);
      for (const w of ['wheelRL', 'wheelRR']) { q.setFromEuler(e.set(o.rear || 0, 0, 0)); tr[w].push(q.x, q.y, q.z, q.w); }
      for (const w of ['wheelFL', 'wheelFR']) { q.setFromEuler(e.set(o.front || 0, 0, 0)); tr[w].push(q.x, q.y, q.z, q.w); }
      q.setFromEuler(e.set(-(o.flap || 0), 0, 0)); tr.exhaust.push(q.x, q.y, q.z, q.w);
    }
    const fix = a => { for (let i = 4; i < a.length; i += 4) { if (a[i] * a[i - 4] + a[i + 1] * a[i - 3] + a[i + 2] * a[i - 2] + a[i + 3] * a[i - 1] < 0) for (let k = 0; k < 4; k++) a[i + k] = -a[i + k]; } return a; };
    const tracks = [
      new THREE.QuaternionKeyframeTrack('body.quaternion', times, fix(tr.body)), new THREE.VectorKeyframeTrack('body.position', times, tr.bodyP),
      ...['wheelRL', 'wheelRR', 'wheelFL', 'wheelFR', 'exhaust'].map(w => new THREE.QuaternionKeyframeTrack(`${w}.quaternion`, times, fix(tr[w]))),
    ];
    return new THREE.AnimationClip(name, dur, tracks);
  };
  const TAU = Math.PI * 2, S = (p, k) => Math.sin(p * TAU * k);
  CLIPS = {
    // engine idle: fast small vibration, exhaust cap flutter
    idle: make('idle', 1.0, p => ({ bob: 0.006 * S(p, 24), roll: 0.004 * S(p, 18), pitch: 0.003 * S(p, 12), flap: 0.25 + 0.2 * Math.abs(S(p, 6)) })),
    // rolling forward: rear wheel one turn, front two turns per cycle (FR = RR / 2), gentle bounce
    drive: make('drive', 1.6, p => ({ rear: p * TAU, front: p * TAU * 2, bob: 0.012 * Math.abs(S(p, 4)) + 0.004 * S(p, 20), pitch: 0.01 * S(p, 2), roll: 0.008 * S(p, 3), flap: 0.35 + 0.3 * Math.abs(S(p, 8)) })),
    // straining against the rope: wheels spin faster (slipping), nose lifts, heavy shake and stack flap
    pull: make('pull', 0.8, p => ({ rear: p * TAU * 2, front: p * TAU * 4, bob: 0.02 + 0.014 * S(p, 16), pitch: -0.05 - 0.012 * S(p, 4) + 0.006 * S(p, 22), roll: 0.014 * S(p, 6), surge: -0.02 * Math.abs(S(p, 2)), flap: 0.5 + 0.4 * Math.abs(S(p, 10)) })),
  };
  return CLIPS;
}

/**
 * createTractor({ teamColor }) -> { object3D, mesh, clips: { idle, drive, pull }, attach: { hitch, exhaust, seat, wheel* },
 *   setTeamColor, setExpression (no-op), dispose, triangles }
 */
export function createTractor({ teamColor = 0xd83a3a } = {}) {
  const geo = buildTractor();
  const { bones, list } = skeleton();
  const mesh = new THREE.SkinnedMesh(geo, toonMaterial({ team: teamColor, rim: 0.3, kind: 'char' }));
  mesh.name = 'tractor';
  mesh.add(bones.root); mesh.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(list));
  mesh.frustumCulled = false;
  mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-1.05, 0, -1.6), new THREE.Vector3(1.05, 2.42, 1.6));
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.1, 0), 2.1);
  const object3D = new THREE.Group(); object3D.name = 'tractor'; object3D.add(mesh);
  const mk = (name, bone, wpos) => { const o = new THREE.Object3D(); o.name = 'attach_' + name; const b = bones[bone]; b.updateWorldMatrix(true, false); o.position.copy(b.worldToLocal(new THREE.Vector3(...wpos))); b.add(o); return o; };
  mesh.updateMatrixWorld(true);
  const attach = {
    hitch: mk('hitch', 'body', HITCH), exhaust: mk('exhaust', 'body', [PIPE[0], PIPE[1] + 0.06, PIPE[2]]), seat: mk('seat', 'body', [0, 1.45, -0.7]),
    wheelRL: bones.wheelRL, wheelRR: bones.wheelRR, wheelFL: bones.wheelFL, wheelFR: bones.wheelFR,
  };
  const api = {
    kind: 'tractor', object3D, mesh, skeleton: mesh.skeleton, bones, attach, clips: tractorClips(), triangles: geo.index.count / 3,
    dims: { length: 3.1, width: 2.0, height: 2.42, rearWheelRadius: RR, frontWheelRadius: FR, hitch: HITCH.slice(), exhaust: [PIPE[0], PIPE[1] + 0.06, PIPE[2]] },
    setTeamColor(c) { mesh.material = toonMaterial({ team: c, rim: 0.3, kind: 'char' }); return api; },
    setExpression() { return api; },
    dispose() { object3D.removeFromParent(); mesh.skeleton.dispose(); },
  };
  return api;
}
