// Public character factories: createPuller / createStrongman / createGiant.
// Every factory returns the same shape:
//   { object3D, mesh, skeleton, bones, clips, clipsL, clipsR, attach, grip, kind, look, triangles, height,
//     setTeamColor(c), setExpression(name), setRopeSide('L'|'R'), gripTo(localY), clone(opts), dispose() }
import * as THREE from 'three';
import { rigSpec, makeSkeleton, buildBody, pullerLooks, STRONGMAN_LOOK, GIANT_LOOK } from './character.js';
import { bakeClips, GRIP } from './clips.js';
import { toonMaterial } from './toon.js';

/** World rope height the grips are designed for (scene: rope.handY), and the game's default figure scales. */
export const ROPE_Y = GRIP.y;
const KINDS = {
  puller: { rig: {}, body: {}, rim: 0.45, height: 1.75, grip: { x: GRIP.x, y: GRIP.y } },
  strongman: {
    rig: { hipY: 0.62, shoulderX: 0.315, headR: 0.235, chestUp: 0.29, neckUp: 0.455, headUp: 0.52, headLift: 0.2, armUp: 0.375, upperArm: 0.245, lowerArm: 0.23, legX: 0.135, upperLeg: 0.265, footLen: 0.3, footW: 0.17 },
    body: { chest: 1.48, arm: 1.6, leg: 1.38, hand: 1.25, waist: 1.12, neck: 1.6 }, rim: 0.55,
    // game scale 1.38 -> k = 1.38 * 1.75 / height; rope at ROPE_Y world => local y = ROPE_Y / k
    height: 1.72, gameScale: 1.38, gripX: -0.2,
  },
  giant: {
    rig: { hipY: 0.72, upperLeg: 0.31, ankleY: 0.11, headR: 0.25, shoulderX: 0.305, chestUp: 0.31, neckUp: 0.48, headUp: 0.55, headLift: 0.21, armUp: 0.4, upperArm: 0.29, lowerArm: 0.28, palm: 0.085, finger: 0.078, legX: 0.14, footLen: 0.34, footH: 0.13, footW: 0.19 },
    body: { chest: 1.36, arm: 1.5, leg: 1.4, hand: 1.2, waist: 1.25, neck: 1.5 }, rim: 0.65,
    // game scale 2.2 (js/scene.js GIANT_SCALE): the baked pull clips put the fists on the world rope at that scale
    height: 2.0, gameScale: 2.2, gripX: -0.34,
  },
};
for (const k of ['strongman', 'giant']) { const K = KINDS[k]; const kk = K.gameScale * 1.75 / K.height; K.grip = { x: K.gripX, y: ROPE_Y / kk }; }

const specCache = new Map(), geoCache = new Map(), clipCache = new Map();
const spec = kind => { if (!specCache.has(kind)) specCache.set(kind, rigSpec(KINDS[kind].rig)); return specCache.get(kind); };
function geometry(kind, look) {
  const key = kind + ':' + look.id;
  if (!geoCache.has(key)) geoCache.set(key, buildBody(spec(kind), look, KINDS[kind].body));
  return geoCache.get(key);
}
/** Baked clips for a body kind and rope side (cached; shared by every instance of that kind). */
export function clipsFor(kind = 'puller', side = 'R') {
  const key = kind + ':' + side;
  if (!clipCache.has(key)) clipCache.set(key, bakeClips(spec(kind), kind, side, KINDS[kind].grip));
  return clipCache.get(key);
}
/** Grip line of a kind in model units: { x (right side; mirror for L), y, height (declared model height) }. */
export function gripFor(kind = 'puller') { const K = KINDS[kind]; return { x: K.grip.x, y: K.grip.y, height: K.height }; }

// Expressions drive the face bones. Clips never key these bones, so expressions and clips combine freely.
// eye: [scaleX, scaleY] (both eyes; L/R override with eyeL/eyeR), lid: [show, rotDeg], brow: [tiltDeg (+ = angry), lift],
// smile: [sx, sy, rotDeg], open: [sx, sy], grit: [sx, sy]
const E = (o) => ({ eye: [1, 1], lid: [0, 0], brow: [0, 0], smile: [1, 1, 0], open: [0, 0], grit: [0, 0], ...o });
export const EXPRESSIONS = {
  neutral: E({}),
  determined: E({ eye: [1, 0.72], brow: [16, -0.008], smile: [0.75, 0.3, 0] }),
  strain: E({ eye: [0, 0], lid: [1, 90], brow: [24, -0.012], smile: [0, 0, 0], grit: [1.08, 1.05] }),
  happy: E({ eye: [0, 0], lid: [1, 0], brow: [-8, 0.014], smile: [0, 0, 0], open: [1.1, 1.15] }),
  worried: E({ eye: [1.05, 1.12], brow: [-20, 0.012], smile: [0.75, 0.8, 180] }),
  shock: E({ eye: [1.2, 1.28], brow: [-8, 0.03], smile: [0, 0, 0], open: [0.62, 1.35] }),
  dazed: E({ eyeL: [1.0, 0.45], eyeR: [1.15, 1.15], brow: [-10, 0.008], browAsym: 0.02, smile: [0.7, 0.9, 168] }),
  sad: E({ eye: [0.95, 0.85], brow: [-22, 0.006], smile: [0.65, 0.7, 180] }),
};
EXPRESSIONS.joy = EXPRESSIONS.happy;
EXPRESSIONS.surprised = EXPRESSIONS.shock;
const HIDE = 1e-4;

function createCharacter(kind, look, { teamColor = 0xd83a3a, expression, ropeSide = 'R' } = {}) {
  const sp = spec(kind);
  const K = KINDS[kind];
  const geo = geometry(kind, look);
  const matFor = c => toonMaterial({ team: c, rim: look.oiled ? 0.55 : K.rim, rimColor: kind === 'giant' ? new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.35) : 0xfff1dc, kind: 'char' });
  const { bones, list, root } = makeSkeleton(sp);
  const mesh = new THREE.SkinnedMesh(geo, matFor(teamColor));
  mesh.name = `${kind}-${look.id}`;
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list));
  mesh.frustumCulled = false; // animated; the game culls by its own logic
  // Fixed bounds: the declared height makes every look of a kind normalise to the same scale (hands on one rope line).
  const half = 0.45 * K.height;
  mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-half, 0, -half), new THREE.Vector3(half, K.height, half));
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, K.height / 2, 0), K.height * 0.75);
  const object3D = new THREE.Group();
  object3D.name = mesh.name;
  object3D.add(mesh);
  object3D.userData.halat = { kind, look: look.id };

  // attachment points (Object3Ds parented to bones; read their world position after the mixer update)
  const mk = (name, bone, pos) => { const o = new THREE.Object3D(); o.name = 'attach_' + name; o.position.set(...pos); bones[bone].add(o); return o; };
  const fist = s => [s === 'L' ? -0.034 : 0.034, -sp.palm - 0.02, 0];
  const attach = {
    handL: mk('handL', 'handL', fist('L')), handR: mk('handR', 'handR', fist('R')),
    head: mk('head', 'head', [0, sp.headC - sp.headY + sp.R * 1.05, 0]),
    face: mk('face', 'head', [0, sp.headC - sp.headY, sp.R]),
    chest: mk('chest', 'chest', [0, 0.05, 0.16]),
    footL: mk('footL', 'footL', [0, -sp.ankle, sp.footLen * 0.2]), footR: mk('footR', 'footR', [0, -sp.ankle, sp.footLen * 0.2]),
    hips: mk('hips', 'hips', [0, 0, 0]),
  };
  const clipSets = { R: clipsFor(kind, 'R'), L: clipsFor(kind, 'L') };
  let side = ropeSide === 'L' ? 'L' : 'R';

  const api = {
    kind, look, object3D, mesh, skeleton: mesh.skeleton, bones, attach,
    clips: clipSets[side].clips, clipsR: clipSets.R.clips, clipsL: clipSets.L.clips, clipInfo: clipSets.R.info,
    /** Rope line in model units for the current side: x (lateral), y (height); the rope runs along local Z. */
    grip: { x: side === 'L' ? -K.grip.x : K.grip.x, y: K.grip.y, axis: '+z', height: K.height },
    ropeSide: side,
    mixerHints: { loopOnce: ['fall'], crossFade: 0.25, expressions: Object.fromEntries(Object.entries(clipSets.R.info).map(([n, v]) => [n, v.expression])) },
    height: K.height,
    triangles: geo.index.count / 3,
    setTeamColor(c) { const m = matFor(c); if (mesh.material !== m) mesh.material = m; return api; },
    /** Switch which side of the body the rope runs on (changes api.clips; existing mixer actions keep the old clips). */
    setRopeSide(s) { side = s === 'L' ? 'L' : 'R'; api.ropeSide = side; api.clips = clipSets[side].clips; api.grip.x = side === 'L' ? -K.grip.x : K.grip.x; return api; },
    setExpression(name = 'neutral') {
      const e = EXPRESSIONS[name] || EXPRESSIONS.neutral;
      const eyeL = e.eyeL || e.eye, eyeR = e.eyeR || e.eye;
      bones.eyeL.scale.set(Math.max(HIDE, eyeL[0]), Math.max(HIDE, eyeL[1]), Math.max(HIDE, eyeL[0] ? 1 : 0));
      bones.eyeR.scale.set(Math.max(HIDE, eyeR[0]), Math.max(HIDE, eyeR[1]), Math.max(HIDE, eyeR[0] ? 1 : 0));
      const lid = e.lid[0] ? 1 : HIDE;
      bones.lidL.scale.setScalar(lid); bones.lidR.scale.setScalar(lid);
      bones.lidL.rotation.z = THREE.MathUtils.degToRad(e.lid[1]); bones.lidR.rotation.z = -THREE.MathUtils.degToRad(e.lid[1]);
      const bt = THREE.MathUtils.degToRad(e.brow[0]), asym = e.browAsym || 0;
      bones.browL.rotation.z = bt; bones.browR.rotation.z = -bt;
      bones.browL.position.y = sp.W.browL[1] - sp.W.head[1] + e.brow[1] + asym; bones.browR.position.y = sp.W.browR[1] - sp.W.head[1] + e.brow[1] - asym * 0.5;
      const sm = e.smile; bones.mouthSmile.scale.set(Math.max(HIDE, sm[0]), Math.max(HIDE, sm[1]), sm[0] ? 1 : HIDE); bones.mouthSmile.rotation.z = THREE.MathUtils.degToRad(sm[2]);
      const o = e.open; bones.mouthOpen.scale.set(Math.max(HIDE, o[0]), Math.max(HIDE, o[1]), o[0] ? 1 : HIDE);
      const gr = e.grit; bones.mouthGrit.scale.set(Math.max(HIDE, gr[0]), Math.max(HIDE, gr[1]), gr[0] ? 1 : HIDE);
      api.expression = name; return api;
    },
    /**
     * Optional runtime fix-up after mixer.update(): bend the arms so both fists land exactly on a rope line at
     * model-local height y (and lateral x, default api.grip.x). Only meaningful while a pull clip plays. No allocations.
     */
    gripTo: null,
    /** Fresh instance with the same look/options (geometry and clips are shared). */
    clone(opts = {}) { return createCharacter(kind, look, { teamColor: mesh.material.userData.teamColor.getHex(), ropeSide: side, expression: api.expression, ...opts }); },
    dispose() { object3D.removeFromParent(); mesh.skeleton.dispose(); },
  };
  api.gripTo = makeGripIK(api, sp);
  api.setExpression(expression || 'neutral');
  return api;
}

/** Runtime 2-bone arm IK toward a rope line (used by gripTo). */
function makeGripIK(api, sp) {
  const { bones, object3D } = api;
  const v = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), t: new THREE.Vector3(), d: new THREE.Vector3(), n: new THREE.Vector3(), p: new THREE.Vector3() };
  const q = { a: new THREE.Quaternion(), b: new THREE.Quaternion(), c: new THREE.Quaternion() };
  const m = new THREE.Matrix4();
  const DOWN = new THREE.Vector3(0, -1, 0);
  const aim = (bone, dirW) => { // dirW: world direction for the bone's -Y
    bone.parent.getWorldQuaternion(q.a);
    v.n.copy(DOWN).applyQuaternion(q.a);
    q.b.setFromUnitVectors(v.n, v.d.copy(dirW).normalize()).multiply(q.a);
    bone.quaternion.copy(q.a.invert()).multiply(q.b);
    bone.updateMatrixWorld(true);
  };
  return function gripTo(y, x = api.grip.x) {
    object3D.updateMatrixWorld(true);
    m.copy(api.mesh.matrixWorld).invert();
    for (const s of ['L', 'R']) {
      const up = bones['upperArm' + s], lo = bones['lowerArm' + s], hd = bones['hand' + s];
      const fist = api.attach['hand' + s];
      // current fist and shoulder in mesh-local space
      fist.getWorldPosition(v.c).applyMatrix4(m);
      const dx = x - v.c.x, dy = y - v.c.y;
      if (Math.abs(dx) < 0.004 && Math.abs(dy) < 0.004) continue;
      // desired fist position (same z), converted back to world, minus the wrist->fist offset
      v.t.set(x, y, v.c.z).applyMatrix4(api.mesh.matrixWorld);
      fist.getWorldPosition(v.p); hd.getWorldPosition(v.b);
      v.t.sub(v.p.sub(v.b)); // wrist target (world)
      up.getWorldPosition(v.a);
      lo.getWorldPosition(v.p);
      const l1 = lo.position.length() * up.getWorldScale(v.n).x, l2 = hd.position.length() * v.n.x;
      v.d.subVectors(v.t, v.a); let d = v.d.length(); const dir = v.d.normalize().clone();
      d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.999);
      // keep the current elbow bend plane
      v.n.subVectors(v.p, v.a); v.n.addScaledVector(dir, -v.n.dot(dir)); if (v.n.lengthSq() < 1e-8) v.n.set(0, -1, 0); v.n.normalize();
      const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))), sinA = Math.sqrt(1 - cosA * cosA);
      hd.getWorldQuaternion(q.c);
      const upDir = v.b.copy(dir).multiplyScalar(cosA).addScaledVector(v.n, sinA).clone();
      aim(up, upDir);
      const mid = v.p.copy(v.a).addScaledVector(upDir, l1);
      const endP = v.c.copy(v.a).addScaledVector(dir, d);
      aim(lo, endP.sub(mid));
      hd.parent.getWorldQuaternion(q.a); hd.quaternion.copy(q.a.invert().multiply(q.c)); hd.updateMatrixWorld(true);
    }
  };
}

const pickLook = (look, seed) => {
  if (look && typeof look === 'object') return look;
  if (typeof look === 'string') return pullerLooks.find(l => l.id === look) || pullerLooks[0];
  if (typeof look === 'number') return pullerLooks[((look % pullerLooks.length) + pullerLooks.length) % pullerLooks.length];
  return pullerLooks[Math.abs(Math.floor(seed ?? 0)) % pullerLooks.length];
};

/** createPuller({ look: id|index|lookObject, teamColor, seed, ropeSide: 'R'|'L', expression }) */
export function createPuller(opts = {}) { return createCharacter('puller', pickLook(opts.look, opts.seed), opts); }
/** Broad barrel-chested oil wrestler ("Pehlivan"): bare chest, leather kispet, team belt/armbands/headband; extra clip "flex". */
export function createStrongman(opts = {}) { return createCharacter('strongman', STRONGMAN_LOOK, opts); }
/** Big bearded giant ("Dev") in a team tunic, team-tinted rim light; slower heavier clips + "flex", "stomp". */
export function createGiant(opts = {}) { return createCharacter('giant', GIANT_LOOK, opts); }

export { pullerLooks };
