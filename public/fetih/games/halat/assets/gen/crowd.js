// Cheap cheering crowd: ONE InstancedMesh of a small rounded spectator (~170 triangles) whose bounce, arm
// waving and pop-in are computed in the vertex shader from per-instance attributes and a few uniforms, so a
// frame costs the CPU nothing but uniform updates. Used for the team crowds behind the lines (createCrowd,
// a drop-in for js/crowd.js Crowd) and for the stands of the arena (makeCrowdMesh).
import * as THREE from 'three';
import { capsule, ellipsoid, MeshBuilder, M4, rng } from './geo.js';
import { toonRamp } from './toon.js';

// vertex "slot" (in the team attribute): 0 = fixed vertex colour, 1 = shirt, 2 = skin, 3 = hair; wave = arm (-1 L, +1 R)
let GEO = null, GEO_SEATED = null;
function personGeometry(seated = false) {
  if (!seated && GEO) return GEO;
  if (seated && GEO_SEATED) return GEO_SEATED;
  const mb = new MeshBuilder();
  const legY = seated ? 0.32 : 0.0;
  if (!seated) for (const s of [1, -1]) mb.add(capsule([{ y: 0.06, rx: 0.065 }, { y: 0.4, rx: 0.075 }], 5, 1), { color: 0x2c3140, matrix: M4.t(s * 0.085, 0, 0) });
  else for (const s of [1, -1]) mb.add(capsule([{ y: -0.16, rx: 0.065 }, { y: 0.16, rx: 0.07 }], 5, 1).rotateX(Math.PI / 2), { color: 0x2c3140, matrix: M4.t(s * 0.085, legY + 0.06, 0.12) });
  mb.add(capsule([{ y: 0.42, rx: 0.17, rz: 0.13 }, { y: 0.66, rx: 0.17, rz: 0.13 }], 8, 1), { color: 0xffffff, team: 1, matrix: M4.t(0, legY - (seated ? 0.3 : 0), 0) });
  mb.add(ellipsoid(0.15, 0.145, 0.14, 8, 5), { color: 0xffffff, team: 2, matrix: M4.t(0, legY + (seated ? 0.62 : 0.92), 0) });
  mb.add(ellipsoid(0.158, 0.1, 0.15, 8, 3), { color: 0xffffff, team: 3, matrix: M4.t(0, legY + (seated ? 0.69 : 0.99), -0.02) });
  for (const s of [1, -1]) {
    mb.add(capsule([{ y: -0.14, rx: 0.058 }, { y: 0, rx: 0.06 }], 4, 1), { color: 0xffffff, team: 1, wave: s, matrix: M4.t(s * 0.2, legY + (seated ? 0.4 : 0.7), 0) });
    mb.add(capsule([{ y: -0.3, rx: 0.046 }, { y: -0.15, rx: 0.05 }], 4, 1), { color: 0xffffff, team: 2, wave: s, matrix: M4.t(s * 0.2, legY + (seated ? 0.4 : 0.7), 0) });
  }
  if (!seated) { const d = new THREE.CircleGeometry(0.27, 10); d.deleteAttribute('uv'); d.rotateX(-Math.PI / 2); mb.add(d, { color: 0x56703f, team: 5, matrix: M4.t(0.02, 0.012, 0.03) }); } // contact shadow (slot 5: no bounce)
  const g = mb.build();
  if (seated) GEO_SEATED = g; else GEO = g;
  return g;
}

/**
 * Instanced crowd mesh. Per instance: matrix (place/turn/scale), shirt/skin/hair colours, phase/speed,
 * group (0 stands, 1 team 1, 2 team 2) and index within its group (for pop-in by count).
 * Uniforms (mesh.userData.uniforms): uTime, uCheer[3] (bounce per group 0..1.6), uCount[3] (visible per group),
 * uWave[3] (arm raise per group 0..1).
 */
export function makeCrowdMesh(capacity, { seated = false } = {}) {
  const geo = personGeometry(seated);
  const uniforms = { uTime: { value: 0 }, uCheer: { value: new THREE.Vector3(0.2, 0, 0) }, uCount: { value: new THREE.Vector3(1e6, 1e6, 1e6) }, uWave: { value: new THREE.Vector3(0.3, 0, 0) } };
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonRamp() });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float team; attribute float wave; attribute vec3 iShirt; attribute vec3 iSkin; attribute vec3 iHair; attribute vec4 iAnim;
        uniform float uTime; uniform vec3 uCheer; uniform vec3 uCount; uniform vec3 uWave; varying vec3 vTint;
        float g3(vec3 v, float gi) { return gi < 0.5 ? v.x : (gi < 1.5 ? v.y : v.z); }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float gi = iAnim.z, ph = iAnim.x, sp = iAnim.y;
        float cheer = g3(uCheer, gi), wv = g3(uWave, gi);
        float beat = abs(sin(uTime * sp + ph));
        float armA = wave != 0.0 ? wave * (0.25 + wv * (2.2 + 0.5 * sin(uTime * sp * 1.3 + ph))) : 0.0;
        float ca = cos(armA), sa = sin(armA);
        if (wave != 0.0) objectNormal.xy = mat2(ca, sa, -sa, ca) * objectNormal.xy;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        if (wave != 0.0) { vec2 pv = vec2(wave * 0.2, ${seated ? '0.72' : '1.02'}); transformed.xy = mat2(ca, sa, -sa, ca) * (transformed.xy - pv) + pv; }
        transformed.y += team > 4.5 ? 0.0 : beat * cheer * 0.22;
        float pop = clamp(g3(uCount, gi) - iAnim.w, 0.0, 1.0);
        transformed *= pop;
        vTint = (team < 0.5 || team > 4.5) ? vec3(1.0) : (team < 1.5 ? iShirt : (team < 2.5 ? iSkin : iHair));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vTint;');
  };
  mat.customProgramCacheKey = () => 'halat-crowd-' + seated;
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  const mk = n => new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
  // the base geometry is shared per pose type; the per-instance buffers live on a clone per mesh
  const g2 = geo.clone();
  for (const k of ['iShirt', 'iSkin', 'iHair', 'iAnim']) g2.setAttribute(k, mk(k === 'iAnim' ? 4 : 3));
  mesh.geometry = g2;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.userData.uniforms = uniforms;
  mesh.name = 'halat-crowd';
  return mesh;
}

const SKINS = [0xf6d2b8, 0xf0bf98, 0xd99a6c, 0xc28655, 0x9a6340, 0x6e432a].map(h => new THREE.Color(h));
const HAIRS = [0x2b1d16, 0x1b1412, 0x6b3a1f, 0xb4532a, 0xe8b84a, 0x3a2a20, 0xd8d2c8].map(h => new THREE.Color(h));
const SHIRTS = [0xe9c46a, 0xf4a261, 0xe07a5f, 0x2a9d8f, 0x3d5a80, 0xf1ece0, 0xa8c5da, 0xb5838d, 0x81b29a, 0xd4a373, 0x6d6875, 0xf2cc8f].map(h => new THREE.Color(h));
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _Y = new THREE.Vector3(0, 1, 0);

/** Write one instance. o: { x, y, z, yaw, scale, shirt (Color), skin, hair, phase, speed, group, index } */
export function setPerson(mesh, i, o) {
  _q.setFromAxisAngle(_Y, o.yaw || 0);
  const sc = o.scale || 1;
  mesh.setMatrixAt(i, _m.compose(_p.set(o.x, o.y || 0, o.z), _q, _s.set(sc * (o.w || 1), sc * (o.h || 1), sc * (o.w || 1))));
  const g = mesh.geometry.attributes;
  g.iShirt.setXYZ(i, o.shirt.r, o.shirt.g, o.shirt.b); g.iSkin.setXYZ(i, o.skin.r, o.skin.g, o.skin.b); g.iHair.setXYZ(i, o.hair.r, o.hair.g, o.hair.b);
  g.iAnim.setXYZW(i, o.phase || 0, o.speed || 6, o.group || 0, o.index || 0);
}
export function randomPerson(r, shirt = null) {
  return { skin: SKINS[Math.floor(r() * SKINS.length)], hair: HAIRS[Math.floor(r() * HAIRS.length)], shirt: shirt || SHIRTS[Math.floor(r() * SHIRTS.length)], phase: r() * 6.28, speed: 4.5 + r() * 3, scale: 0.92 + r() * 0.12, h: 0.86 + r() * 0.26, w: 0.88 + r() * 0.3 };
}
export function finishCrowd(mesh, n) {
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  for (const k of ['iShirt', 'iSkin', 'iHair', 'iAnim']) mesh.geometry.attributes[k].needsUpdate = true;
}

/**
 * createCrowd({ visual, perSide }) -> drop-in for js/crowd.js Crowd (minus the counter sprites):
 * { object3D, setColors(c1, c2), setCounts(a, b, totals), likes(teamId, count), update(dt), ending, cheer: [k1, k2], dispose() }
 * visual = config.visual (frontX, slotGap, pullersPerSide, crowdPerSide).
 */
export function createCrowd({ visual = {}, perSide, seed = 7, frontShare = 0.5, frontZ = [3.6, 4.8], backZ = [3.6, 5.2] } = {}) {
  const v = { frontX: 3.8, slotGap: 0.6, pullersPerSide: 10, crowdPerSide: 160, ...visual };
  const cap = perSide ?? v.crowdPerSide;
  const mesh = makeCrowdMesh(cap * 2);
  const r = rng(seed);
  const shirtTint = [new THREE.Color(0xe63946), new THREE.Color(0x2f7cf6)];
  const slots = [[], []];
  for (let s = 0; s < 2; s++) {
    const sx = s === 0 ? -1 : 1;
    // loose groups behind the rope barriers (|z| > 3.3) along the team's half; nearest groups fill first.
    // frontShare: part of the groups standing between the lane and the camera (frontZ), the rest behind (backZ).
    let i = 0;
    while (i < cap) {
      const front = r() < frontShare, gx = sx * (v.frontX - 0.4 + r() * (v.slotGap * v.pullersPerSide + 3.4)), gz = front ? frontZ[0] + r() * (frontZ[1] - frontZ[0]) : -(backZ[0] + r() * (backZ[1] - backZ[0])), n = 3 + Math.floor(r() * 6);
      for (let j = 0; j < n && i < cap; j++, i++) {
        const x = gx + (r() - 0.5) * 1.8, z = gz + (r() - 0.5) * 0.9;
        slots[s].push({ x, z, yaw: (front ? Math.PI : 0) + (s === 0 ? 1 : -1) * 0.5 + (r() - 0.5) * 0.7, shade: 0.85 + r() * 0.25, ...randomPerson(r) });
      }
    }    slots[s].sort((a, b) => (Math.abs(a.x) * 0.45 + Math.abs(a.z)) - (Math.abs(b.x) * 0.45 + Math.abs(b.z)));
  }
  const write = () => {
    let k = 0;
    for (let s = 0; s < 2; s++) slots[s].forEach((sl, i) => {
      const shirt = _c.copy(shirtTint[s]).multiplyScalar(sl.shade).clone();
      setPerson(mesh, k++, { ...sl, y: 0, shirt, group: s + 1, index: i });
    });
    finishCrowd(mesh, cap * 2);
  };
  write();
  const U = mesh.userData.uniforms;
  const api = {
    object3D: mesh, cheer: [0, 0], visible: [0, 0], want: [0, 0], ending: null, t: 0,
    setColors(c1, c2) { shirtTint[0].set(c1); shirtTint[1].set(c2); write(); },
    setCounts(a, b) { api.want = [a, b]; },
    likes(teamId, count) { const i = teamId === 1 ? 0 : 1; api.cheer[i] = Math.min(1.6, api.cheer[i] + 0.12 + Math.min(0.5, count * 0.02)); },
    update(dt) {
      api.t += dt; U.uTime.value = api.t;
      for (let s = 0; s < 2; s++) {
        api.cheer[s] = Math.max(0, api.cheer[s] - dt * 0.5);
        const want = Math.min(cap, Math.max(0, api.want[s] || 0));
        api.visible[s] = api.visible[s] < want ? Math.min(want, api.visible[s] + Math.max(1, dt * 30)) : Math.max(want, api.visible[s] - dt * 60);
        const won = api.ending && api.ending.winner === s + 1;
        U.uCount.value.setComponent(s + 1, api.visible[s]);
        U.uCheer.value.setComponent(s + 1, 0.15 + api.cheer[s] * 0.8 + (won ? 1.4 : 0));
        U.uWave.value.setComponent(s + 1, Math.min(1, 0.15 + api.cheer[s] * 0.6 + (won ? 1 : 0)));
      }
    },
    dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); },
  };
  return api;
}
