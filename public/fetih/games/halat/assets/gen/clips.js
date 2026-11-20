// Animation clips authored in code on the generated skeleton (character.js).
// Each clip is a pose function sampled at 30 fps. A pose mixes FK (Euler degrees per bone) with 2-bone IK for
// the legs (planted feet) and the arms (fists closed on the rope line), then everything is baked into
// QuaternionKeyframeTracks (+ root.position), so at runtime it is a plain THREE.AnimationClip on a mixer.
//
// Conventions (character faces +Z, left = +X, all bind rotations identity, limbs hang along -Y):
//   hips/spine/chest X < 0 = lean back, head X > 0 = chin down, Y < 0 = turn toward the character's right,
//   upperArm/upperLeg X < 0 = swing forward, lowerLeg X > 0 = knee bend, lowerArm X < 0 = elbow bend,
//   upperArmL Z > 0 / upperArmR Z < 0 = raise sideways, fingers curl > 0 = close the fist.
//
// The rope: every pull clip keeps both fists on ONE line parallel to Z at x = GRIP.x (rope on the character's
// right) or -GRIP.x (mirrored clip set, rope on the left) and height GRIP.y, in model units (1.75 = height).
import * as THREE from 'three';
import { makeSkeleton } from './character.js';

const FPS = 30, D2R = Math.PI / 180;
/** Rope line for pullers (model units, before any game scaling). Strongman/giant have their own (see GRIPS). */
export const GRIP = { x: -0.24, y: 0.62 };
export const TRACKED = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'upperArmL', 'lowerArmL', 'handL', 'fingersL', 'shoulderR', 'upperArmR', 'lowerArmR', 'handR', 'fingersR',
  'upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR', 'hairTip', 'bandTail'];

// ---------------------------------------------------------------------------------------- easing helpers
const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);
const lerp = (a, b, k) => a + (b - a) * k;
const S = (p, n = 1, ph = 0) => Math.sin((p * n + ph) * Math.PI * 2);
const wrap = p => p - Math.floor(p);
/** Heave curve: small lean-in (anticipation), explosive pull, short hold, slower recovery. Range -0.2 .. 1. */
export function heave(p) {
  p = wrap(p);
  if (p < 0.12) return -0.2 * smooth(p / 0.12);
  if (p < 0.36) return lerp(-0.2, 1, easeOut((p - 0.12) / 0.24));
  if (p < 0.48) return 1 - 0.05 * smooth((p - 0.36) / 0.12);
  return lerp(0.95, 0, smooth((p - 0.48) / 0.52));
}

// ---------------------------------------------------------------------------------------- IK / FK machinery
const _qp = new THREE.Quaternion(), _q = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
const eul = (x = 0, y = 0, z = 0, order = 'XYZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * D2R, y * D2R, z * D2R, order));
const AXIAL = new Set(['hips', 'spine', 'chest', 'neck', 'head']); // yaw about the bone's own up axis first (YXZ)

/** Point a bone (whose child lies along local -Y) toward a world direction with minimal twist. */
function aimBone(bone, dir) {
  bone.parent.getWorldQuaternion(_qp);
  const cur = DOWN.clone().applyQuaternion(_qp);
  _q.setFromUnitVectors(cur, dir.clone().normalize());
  const wq = _q.clone().multiply(_qp);
  bone.quaternion.copy(_qp.clone().invert().multiply(wq));
  bone.updateMatrixWorld(true);
}
/** Two-bone IK in world space. pole = world direction the middle joint should bend toward. */
function solveTwoBone(upper, lower, end, target, pole) {
  upper.updateMatrixWorld(true);
  const a = upper.getWorldPosition(new THREE.Vector3());
  const l1 = lower.position.length(), l2 = end.position.length();
  const toT = new THREE.Vector3().subVectors(target, a);
  let d = toT.length(); const dir = toT.clone().normalize();
  d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.9995);
  const bend = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const upDir = dir.clone().multiplyScalar(cosA).addScaledVector(bend, sinA);
  aimBone(upper, upDir);
  const mid = a.clone().addScaledVector(upDir, l1);
  const endP = a.clone().addScaledVector(dir, d);
  aimBone(lower, endP.sub(mid));
}
function setWorldRot(bone, wq) { bone.parent.getWorldQuaternion(_qp); bone.quaternion.copy(_qp.invert().multiply(wq)); bone.updateMatrixWorld(true); }
/** World rotation whose local -Y = fingers direction and local +Z ~ thumb direction. */
function handFrame(fingers, thumb) {
  const y = fingers.clone().normalize().negate();
  const z = thumb.clone().sub(y.clone().multiplyScalar(thumb.dot(y))).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// ---------------------------------------------------------------------------------------- mirroring
const swapLR = n => (n.endsWith('L') ? n.slice(0, -1) + 'R' : n.endsWith('R') ? n.slice(0, -1) + 'L' : n);
/** Mirror a pose across the YZ plane (left <-> right). */
export function mirrorPose(pose) {
  const m = { ...pose, fk: {}, root: pose.root ? [-pose.root[0], pose.root[1], pose.root[2]] : undefined };
  for (const [k, e] of Object.entries(pose.fk || {})) m.fk[swapLR(k)] = [e[0], -e[1], -e[2]];
  const mv = v => v && [-v[0], v[1], v[2]];
  for (const key of ['feet', 'knees', 'hands', 'curl']) {
    if (!pose[key]) continue;
    m[key] = {};
    for (const [s, v] of Object.entries(pose[key])) {
      const t = s === 'L' ? 'R' : 'L';
      if (key === 'knees') m[key][t] = mv(v);
      else if (key === 'curl') m[key][t] = v;
      else if (key === 'feet') m[key][t] = { ...v, p: mv(v.p), yaw: -(v.yaw || 0), roll: -(v.roll || 0) };
      else m[key][t] = { ...v, p: mv(v.p), pole: mv(v.pole), fingers: mv(v.fingers), thumb: mv(v.thumb) };
    }
  }
  if (pose.rope) m.rope = { ...pose.rope, x: -pose.rope.x, front: pose.rope.front === 'R' ? 'L' : 'R', poleF: mv(pose.rope.poleF), poleB: mv(pose.rope.poleB) };
  if (pose.groundFoot) m.groundFoot = pose.groundFoot === 'L' ? 'R' : 'L';
  return m;
}

// ---------------------------------------------------------------------------------------- clip library
// pose(p, R) gets the phase p (0..1) and rig info R = { s, H, spec, grip }; distances are authored for the puller
// rig and scaled by R.s (leg length ratio) so the same choreography fits the strongman and the giant.
export function clipDefs(kind = 'puller') {
  const giant = kind === 'giant', strong = kind === 'strongman';
  const tempo = giant ? 1.65 : strong ? 1.15 : 1;      // the giant pulls slower and heavier
  const wide = giant ? 1.9 : strong ? 1.3 : 1;          // stance width
  const drop = giant ? 0.17 : strong ? 0.09 : 0;          // lower hips: their (scaled) rope line sits lower on the body

  /** Shared hauling pose. o: { hipsY, hz, lean, spine, chest, twist, neck, head, headRoll, frontZ, backZ, ... } */
  const haul = (R, o) => {
    const s = R.s;
    return {
      root: [0, (o.hipsY - drop) * s - R.H, o.hz * s],
      fk: {
        hips: [o.lean, -6 + (o.hipYaw ?? 0), o.roll ?? 0],
        spine: [o.spine ?? -4, -4, o.spineRoll ?? 0], chest: [o.chest ?? -4, (o.twist ?? -8), o.chestRoll ?? 0],
        neck: [o.neck ?? 10, 12, 0], head: [o.head ?? 12, 10 + (o.headYaw ?? 0), o.headRoll ?? 0],
        shoulderL: [0, -6, -2 + (o.shrug ?? 0)], shoulderR: [0, 6, 2 - (o.shrug ?? 0)],
      },
      feet: {
        R: { p: [-0.14 * s * wide, o.frontLift ?? 0, o.frontZ * s], pitch: o.frontPitch ?? -24, yaw: -6, plant: 'heel' },
        L: { p: [0.15 * s * wide, o.backLift ?? 0, o.backZ * s], pitch: o.backPitch ?? 0, yaw: 18, plant: o.backPlant ?? 'flat' },
      },
      knees: { R: [-0.12, 0.15, 1], L: [0.18, 0.15, 1] },
      rope: { x: R.grip.x, y: R.grip.y + (o.ropeDy ?? 0), front: 'R', gap: 0.14 * s, reachF: o.reachF ?? 0.97, reachB: o.reachB ?? 0.95, slideB: o.slideB ?? 0,
        poleF: [-0.5, -1, -0.15], poleB: [0.7, -0.8, 0.1] },
      curl: { L: 100, R: 100 },
      ...(giant ? { post: g => { g.fk.hips[2] += 14; g.fk.spine[2] += 8; g.fk.chest[1] -= 20; g.fk.head[2] -= 12; g.knees = { R: [-0.7, 0.1, 1], L: [0.8, 0.1, 1] }; } } : {}),
    };
  };

  const defs = {
    idle: { duration: 3.2, loop: true, expression: 'neutral', pose: (p, R) => ({
      root: [0.01 * S(p) * R.s, 0, 0], ground: true,
      fk: {
        hips: [0, 3 * S(p), -2.5 * S(p)], spine: [1.5 * S(p, 2, 0.1), 0, 1.5 * S(p)], chest: [-2 + 2 * S(p, 2, 0.15), 3 * S(p, 1, 0.2), 1.2 * S(p, 1, 0.1)],
        neck: [2, 8 * S(p, 1, 0.3), 0], head: [2 + 2.5 * S(p, 2, 0.3), 14 * Math.sin(p * Math.PI * 2) * smooth(Math.abs(S(p, 1, 0.1))), -3 * S(p, 1, 0.3)],
        shoulderL: [0, 0, 2 + 2 * S(p, 2, 0.1)], shoulderR: [0, 0, -2 - 2 * S(p, 2, 0.1)],
        upperArmL: [4 * S(p, 1, 0.3), 0, 8 + 2 * S(p, 2, 0.25)], lowerArmL: [-16 - 5 * S(p, 2, 0.3), 0, 0], handL: [-6, 0, -6],
        upperArmR: [-4 * S(p, 1, 0.3), 0, -8 - 2 * S(p, 2, 0.25)], lowerArmR: [-16 - 5 * S(p, 2, 0.35), 0, 0], handR: [-6, 0, 6],
        upperLegL: [0, 4, 3 + 1.5 * S(p)], lowerLegL: [3, 0, 0], footL: [-3, 8, -3], upperLegR: [-3, -6, -4 + 1.5 * S(p)], lowerLegR: [6 + 3 * S(p), 0, 0], footR: [-3, -12, 4],
      }, curl: { L: 30 + 6 * S(p, 2), R: 34 + 6 * S(p, 2, 0.2) } }) },

    run: { duration: 0.6, loop: true, expression: 'determined', pose: (p, R) => {
      const a = S(p), b = S(p, 1, 0.5);
      const kneeL = 20 + 75 * smooth(Math.max(0, S(p, 1, 0.1))), kneeR = 20 + 75 * smooth(Math.max(0, S(p, 1, 0.6)));
      return {
        root: [0, 0, 0], ground: true, groundLift: 0.07 * Math.max(0, S(p, 2, 0.2)),
        fk: {
          hips: [10, 12 * a, 0], spine: [4, -7 * a, 0], chest: [5 + 2 * S(p, 2), -12 * a, 0], neck: [-6, 5 * a, 0], head: [-6 + 3 * S(p, 2, 0.25), 6 * a, 0],
          upperLegL: [-50 * a - 8, 0, 3], lowerLegL: [kneeL, 0, 0], footL: [12 * S(p, 1, 0.25), 0, 0],
          upperLegR: [-50 * b - 8, 0, -3], lowerLegR: [kneeR, 0, 0], footR: [12 * S(p, 1, 0.75), 0, 0],
          upperArmL: [55 * a, 0, 14], lowerArmL: [-85 - 15 * a, 0, 0], handL: [-10, 0, 0],
          upperArmR: [55 * b, 0, -14], lowerArmR: [-85 - 15 * b, 0, 0], handR: [-10, 0, 0],
        }, curl: { L: 85, R: 85 } }; } },

    pull: { duration: 1.2 * tempo, loop: true, expression: 'determined', pose: (p, R) => {
      const h = heave(p), hc = heave(p - 0.05), hh = heave(p - 0.11); // chest and head follow through (overlap)
      return haul(R, {
        hipsY: 0.44 + 0.035 * h, hz: -0.06 - 0.17 * h, lean: -16 - 22 * h, spine: -6 - 7 * hc, chest: -5 - 9 * hc, twist: -8 - 3 * hc,
        neck: 18 + 10 * hh, head: 18 + 18 * hh - 8 * clamp01(h - hh) * 3, headRoll: 3 * S(p),
        frontZ: 0.2, backZ: -0.46, ropeDy: -0.01 * h, reachF: 0.98 - 0.12 * clamp01(1 - h), reachB: 0.97 - 0.12 * clamp01(1 - h) });
    } },

    pull_hard: { duration: 0.8 * tempo, loop: true, expression: 'strain', pose: (p, R) => {
      const h = heave(p), hc = heave(p - 0.04), hh = heave(p - 0.08), tr = S(p, 9), tr2 = S(p, 13, 0.3);
      return haul(R, {
        hipsY: 0.4 + 0.03 * h, hz: -0.14 - 0.1 * h, lean: -26 - 12 * h + 1.5 * tr, spine: -5 - 5 * hc, chest: -5 - 6 * hc + 1.5 * tr2, twist: -10 - 3 * hc,
        neck: 22 + 6 * hh, head: 26 + 10 * hh + 2.5 * tr2, headRoll: 3 * tr, chestRoll: 2 * tr, shrug: 6,
        frontZ: 0.24, backZ: -0.48, frontPitch: -32, ropeDy: -0.02, reachF: 0.985, reachB: 0.975 });
    } },

    // losing: being dragged — stutter steps (feet skid toward the pit, one foot at a time catches back),
    // body jerked forward at the shoulders while the hips sit back, arms locked straight
    pull_slip: { duration: 0.9 * tempo, loop: true, expression: 'worried', pose: (p, R) => {
      const jerk = Math.max(0, S(p, 2, 0.05)) ** 3;
      const pose = haul(R, {
        hipsY: 0.4 + 0.02 * S(p, 2), hz: -0.12 + 0.03 * jerk, lean: -32 + 9 * jerk, spine: -2 + 4 * jerk, chest: 2 + 8 * jerk, twist: -10,
        neck: 10, head: 12 + 12 * jerk + 4 * S(p, 2, 0.35), headRoll: 7 * S(p), headYaw: -10 * S(p, 1, 0.2),
        frontZ: 0.3, backZ: -0.08, frontPitch: -36, ropeDy: 0.02 * jerk, reachF: 0.995, reachB: 0.99 });
      const slide = (q, z0, z1) => { q = wrap(q); return q < 0.72 ? [lerp(z0, z1, q / 0.72), 0] : [lerp(z1, z0, smooth((q - 0.72) / 0.28)), 0.07 * Math.sin(((q - 0.72) / 0.28) * Math.PI)]; };
      const [zf, yf] = slide(p, 0.28, 0.46), [zb, yb] = slide(p + 0.5, -0.3, -0.06);
      pose.feet.R.p[2] = zf * R.s; pose.feet.R.p[1] = yf * R.s; pose.feet.L.p[2] = zb * R.s; pose.feet.L.p[1] = yb * R.s;
      pose.feet.L.pitch = -16; pose.feet.L.plant = 'heel';
      pose.fk.shoulderL = [-12, -6, -2]; pose.fk.shoulderR = [-12, 6, 2];
      pose.curl = { L: 105, R: 105 };
      return pose; } },

    cheer: { duration: 0.75, loop: true, expression: 'happy', pose: (p, R) => {
      const air = Math.max(0, Math.sin(p * Math.PI * 2)), land = Math.max(0, -Math.sin(p * Math.PI * 2));
      const pumpL = S(p, 1, 0.1), pumpR = S(p, 1, 0.35);
      return {
        root: [0, (0.17 * air - 0.06 * land) * R.s, 0],
        fk: {
          hips: [-3 + 7 * land, 6 * S(p, 0.5), 0], spine: [-6 + 4 * land, 0, 3 * S(p, 0.5)], chest: [-9 + 6 * land, 0, 0], neck: [-6, 0, 0], head: [-14 + 7 * land, 8 * S(p, 0.5), 8 * S(p, 1, 0.25)],
          shoulderL: [0, 0, 12 + 8 * air], shoulderR: [0, 0, -12 - 8 * air],
          upperArmL: [-22, 0, 132 + 16 * pumpL], lowerArmL: [-25 - 40 * Math.max(0, -pumpL), 0, 0], handL: [0, 0, 0],
          upperArmR: [-22, 0, -132 - 16 * pumpR], lowerArmR: [-25 - 40 * Math.max(0, -pumpR), 0, 0], handR: [0, 0, 0],
          upperLegL: [-28 * air - 26 * land, 0, 7], lowerLegL: [52 * air + 52 * land, 0, 0], footL: [22 * air - 26 * land, 0, 0],
          upperLegR: [-28 * air - 26 * land, 0, -7], lowerLegR: [52 * air + 52 * land, 0, 0], footR: [22 * air - 26 * land, 0, 0],
        }, curl: { L: 95, R: 95 } }; } },

    // tumble forward into the pit (the game flies and spins the whole figure; this is the body action, in place)
    fall: { duration: 1.0, loop: false, expression: 'shock', keys: [
      [0.0, { root: [0, -0.1, 0], curl: 60, fk: { hips: [-26, 0, 0], spine: [4, 0, 0], chest: [6, 0, 0], neck: [4, 0, 0], head: [6, 0, 0], upperArmL: [-70, 0, 12], lowerArmL: [-10, 0, 0], upperArmR: [-75, 0, -12], lowerArmR: [-10, 0, 0], upperLegL: [-40, 0, 4], lowerLegL: [30, 0, 0], footL: [-25, 0, 0], upperLegR: [-15, 0, -4], lowerLegR: [50, 0, 0], footR: [0, 0, 0] } }],
      [0.14, { root: [0, -0.04, 0.06], curl: 10, fk: { hips: [12, 0, 8], spine: [10, 0, 0], chest: [12, 8, 0], neck: [-10, 0, 0], head: [-20, 0, 10], upperArmL: [-150, 0, 50], lowerArmL: [-30, 0, 0], upperArmR: [-120, 0, -60], lowerArmR: [-20, 0, 0], upperLegL: [-70, 0, 6], lowerLegL: [25, 0, 0], footL: [-10, 0, 0], upperLegR: [25, 0, -10], lowerLegR: [70, 0, 0], footR: [25, 0, 0] } }],
      [0.32, { root: [0, 0.02, 0.1], curl: 0, fk: { hips: [30, 0, -6], spine: [8, 0, 0], chest: [4, -10, 0], neck: [-14, 0, 0], head: [-28, 0, -10], upperArmL: [-175, 0, 80], lowerArmL: [-15, 0, 0], upperArmR: [-170, 0, -70], lowerArmR: [-25, 0, 0], upperLegL: [30, 0, 14], lowerLegL: [80, 0, 0], footL: [30, 0, 0], upperLegR: [-20, 0, -12], lowerLegR: [40, 0, 0], footR: [20, 0, 0] } }],
      [0.5, { root: [0, 0.0, 0.1], curl: 10, fk: { hips: [36, 0, 4], spine: [6, 0, 0], chest: [0, 10, 0], neck: [-14, 0, 0], head: [-26, 0, 8], upperArmL: [-110, 0, 95], lowerArmL: [-40, 0, 0], upperArmR: [-200, 0, -95], lowerArmR: [-10, 0, 0], upperLegL: [-10, 0, 16], lowerLegL: [50, 0, 0], footL: [30, 0, 0], upperLegR: [30, 0, -16], lowerLegR: [90, 0, 0], footR: [30, 0, 0] } }],
      [0.7, { root: [0, 0.0, 0.1], curl: 0, fk: { hips: [32, 0, -4], spine: [4, 0, 0], chest: [0, -10, 0], neck: [-14, 0, 0], head: [-30, 0, -8], upperArmL: [-200, 0, 100], lowerArmL: [-10, 0, 0], upperArmR: [-105, 0, -100], lowerArmR: [-40, 0, 0], upperLegL: [30, 0, 18], lowerLegL: [90, 0, 0], footL: [30, 0, 0], upperLegR: [-10, 0, -18], lowerLegR: [50, 0, 0], footR: [30, 0, 0] } }],
      [1.0, { root: [0, 0.0, 0.1], curl: 15, fk: { hips: [34, 0, 0], spine: [2, 0, 0], chest: [-4, 0, 0], neck: [-16, 0, 0], head: [-30, 0, 0], upperArmL: [-160, 0, 110], lowerArmL: [-20, 0, 0], upperArmR: [-160, 0, -110], lowerArmR: [-20, 0, 0], upperLegL: [20, 0, 22], lowerLegL: [70, 0, 0], footL: [30, 0, 0], upperLegR: [20, 0, -22], lowerLegR: [70, 0, 0], footR: [30, 0, 0] } }],
    ] },

    // after losing: sitting in the mud, leaning back on the hands, head wobbling dizzily (butt at y ~ 0)
    sit_dazed: { duration: 2.4, loop: true, expression: 'dazed', pose: (p, R) => {
      const s = R.s, c1 = S(p), c2 = S(p, 1, 0.25);
      return {
        root: [0, (0.1 - R.H / s) * s + 0.006 * S(p, 2) * s, -0.02 * s],
        fk: {
          hips: [-22 + 2 * c2, 0, 2 * c1], spine: [-2 + 2 * S(p, 1, 0.5), 0, 4 * c2], chest: [4, 0, 3 * S(p, 1, 0.3)],
          neck: [8 + 6 * c2, 0, 7 * c1], head: [10 + 10 * c2, 10 * S(p, 1, 0.5), 14 * c1],
          shoulderL: [0, 0, 10], shoulderR: [0, 0, -10],
        },
        feet: { L: { p: [0.22 * s, 0, 0.5 * s + 0.02 * S(p, 2) * s], pitch: -55, yaw: 25, roll: 10, plant: 'heel' }, R: { p: [-0.2 * s, 0, 0.46 * s - 0.02 * S(p, 2) * s], pitch: -48, yaw: -22, roll: -10, plant: 'heel' } },
        knees: { L: [0.4, 1, 0.4], R: [-0.4, 1, 0.4] },
        hands: { L: { p: [0.3 * s, 0.035 * s, -0.24 * s], pole: [0.4, 0.1, -1], fingers: [0.3, -0.4, -1], thumb: [0, 0, 1] }, R: { p: [-0.3 * s, 0.035 * s, -0.24 * s], pole: [-0.4, 0.1, -1], fingers: [-0.3, -0.4, -1], thumb: [0, 0, 1] } },
        curl: { L: 15, R: 15 },
      }; } },
  };

  if (strong || giant) {
    // double-biceps flex with a chest puff, pumping twice
    defs.flex = { duration: 1.8, loop: true, expression: 'happy', pose: (p) => {
      const f = smooth(wrap(p) * 5) * (1 - smooth((wrap(p) - 0.8) * 5)), pump = Math.max(0, S(p, 2, 0.1));
      return { root: [0, 0, 0], ground: true,
        fk: { hips: [0, 0, 0], spine: [-5 * f, 0, 0], chest: [-10 * f - 3 * pump * f, 0, 0], neck: [-4 * f, 0, 0], head: [-8 * f, 14 * S(p, 1, 0.1) * f, 0],
          shoulderL: [0, 0, 12 * f], shoulderR: [0, 0, -12 * f],
          upperArmL: [-12 * f, -10 * f, 92 * f + 8], lowerArmL: [0, 0, 112 * f + 10 * pump * f], handL: [0, 0, 20 * f],
          upperArmR: [-12 * f, 10 * f, -92 * f - 8], lowerArmR: [0, 0, -112 * f - 10 * pump * f], handR: [0, 0, -20 * f],
          upperLegL: [0, 0, 12], lowerLegL: [14 * f, 0, 0], footL: [0, 20, -10], upperLegR: [0, 0, -12], lowerLegR: [14 * f, 0, 0], footR: [0, -20, 10] },
        curl: { L: 30 + 70 * f, R: 30 + 70 * f } }; } };
  }
  if (giant) {
    // stomp: lift the right knee high, slam down (camera shake / giant_step at phase 0.58)
    defs.stomp = { duration: 1.4, loop: true, expression: 'strain', pose: (p, R) => {
      const up = smooth(p / 0.42) * (1 - smooth((p - 0.46) / 0.1)), slam = Math.max(0, 1 - Math.abs(p - 0.58) / 0.12);
      return { root: [0, -0.05 * slam * R.s, 0], ground: true, groundFoot: 'L',
        fk: { hips: [-6 * up + 8 * slam, 0, -9 * up], spine: [-4 * up + 8 * slam, 0, -5 * up], chest: [-8 * up + 8 * slam, 0, 0], neck: [0, 0, 0], head: [-10 * up + 12 * slam, 0, 6 * up],
          upperArmL: [-20 * up, 0, 40 * up + 12], lowerArmL: [-60 * up, 0, 0], upperArmR: [20 * up, 0, -40 * up - 12], lowerArmR: [-60 * up, 0, 0],
          upperLegL: [0, 0, 6], lowerLegL: [12 * slam, 0, 0], footL: [0, 0, 0], upperLegR: [-80 * up, 0, -8], lowerLegR: [88 * up, 0, 0], footR: [20 * up, 0, 0] },
        curl: { L: 90, R: 90 } }; } };
  }
  if (giant) { // heavier, wider pull with a big sit-back
    const base = defs.pull.pose;
    defs.pull.pose = (p, R) => { const o = base(p, R); o.root[1] -= 0.03 * R.s; return o; };
  }
  return defs;
}

// ---------------------------------------------------------------------------------------- baking
function interpKeys(keys, t) {
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [t0, a] = keys[i], [t1, b] = keys[Math.min(i + 1, keys.length - 1)];
  const k = t1 > t0 ? smooth((t - t0) / (t1 - t0)) : 0;
  const fk = {};
  for (const n of new Set([...Object.keys(a.fk), ...Object.keys(b.fk)])) { const A = a.fk[n] || [0, 0, 0], Bv = b.fk[n] || [0, 0, 0]; fk[n] = [0, 1, 2].map(c => lerp(A[c], Bv[c], k)); }
  const cu = lerp(a.curl ?? 30, b.curl ?? 30, k);
  return { root: [0, 1, 2].map(c => lerp(a.root[c], b.root[c], k)), fk, curl: { L: cu, R: cu } };
}

/**
 * Bake all clips for a rig spec and rope side. Returns { clips: {name: AnimationClip}, info: {name: {loop, expression, duration}} }.
 * spec: rigSpec() result; kind: 'puller' | 'strongman' | 'giant'; side: 'R' (rope on the right) | 'L'; grip: { x, y }.
 */
export function bakeClips(spec, kind = 'puller', side = 'R', grip = GRIP) {
  const { bones } = makeSkeleton(spec);
  const root = bones.root; const holder = new THREE.Object3D(); holder.add(root);
  const legLen = spec.W.upperLegL[1] - spec.W.footL[1];
  const R = { s: legLen / 0.515, H: spec.H, spec, grip };
  const defs = clipDefs(kind);
  const clips = {}, info = {};
  const footPts = [[0, -spec.W.footL[1], -spec.footLen * 0.3], [0, -spec.W.footL[1], spec.footLen * 0.7]];
  const reach = spec.ua + spec.la;
  const gripOff = s => new THREE.Vector3(s === 'L' ? -0.034 : 0.034, -spec.palm - 0.02, 0.0); // fist centre from the hand bone (hand local)
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  for (const [name, def] of Object.entries(defs)) {
    const n = Math.max(2, Math.round(def.duration * FPS));
    const times = [], data = Object.fromEntries(TRACKED.map(b => [b, []])), rootPos = [], headQ = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * def.duration;
      const p = def.loop ? (i === n ? 0 : i / n) : i / n;
      let pose = def.keys ? interpKeys(def.keys, t) : def.pose(p, R);
      if (pose.post) { pose.post(pose); delete pose.post; }
      if (side === 'L') pose = mirrorPose(pose);
      for (const b of Object.values(bones)) b.quaternion.identity();
      root.position.set(...(pose.root || [0, 0, 0]));
      for (const [bn, e] of Object.entries(pose.fk || {})) bones[bn].quaternion.copy(eul(e[0], e[1], e[2], AXIAL.has(bn) ? 'YXZ' : 'XYZ'));
      holder.updateMatrixWorld(true);
      // legs: IK to planted feet
      for (const sd of ['L', 'R']) {
        const f = pose.feet?.[sd]; if (!f) continue;
        const fq = eul(f.pitch || 0, f.yaw || 0, f.roll || 0);
        const heel = new THREE.Vector3(0, -spec.W.footL[1], -spec.footLen * 0.3).applyQuaternion(fq);
        const sole = new THREE.Vector3(0, -spec.W.footL[1], 0).applyQuaternion(fq);
        const contact = f.plant === 'heel' ? heel : sole;
        const target = new THREE.Vector3(...f.p).sub(contact);
        const pole = new THREE.Vector3(...(pose.knees?.[sd] || [0, 0, 1])).normalize();
        solveTwoBone(bones['upperLeg' + sd], bones['lowerLeg' + sd], bones['foot' + sd], target, pole);
        setWorldRot(bones['foot' + sd], fq);
      }
      // arms: explicit hand targets ...
      for (const sd of ['L', 'R']) {
        const h = pose.hands?.[sd]; if (!h) continue;
        const hq = handFrame(new THREE.Vector3(...h.fingers), new THREE.Vector3(...h.thumb));
        const wrist = new THREE.Vector3(...h.p);
        solveTwoBone(bones['upperArm' + sd], bones['lowerArm' + sd], bones['hand' + sd], wrist, new THREE.Vector3(...h.pole).normalize());
        setWorldRot(bones['hand' + sd], hq);
      }
      // ... or fists on the rope line: each hand slides along the rope to where its arm is (almost) straight
      if (pose.rope) {
        const r = pose.rope, F = r.front, Bk = F === 'R' ? 'L' : 'R';
        const fing = new THREE.Vector3(0, -1, 0.35), thumb = new THREE.Vector3(0, 0, 1);
        const hq = handFrame(fing, thumb);
        const zOn = (sd, k) => {
          bones['upperArm' + sd].getWorldPosition(v1);
          const off = gripOff(sd).applyQuaternion(hq);                // wrist = ropePoint - off
          const dx = r.x - off.x - v1.x, dy = r.y - off.y - v1.y;
          const L = reach * k;
          return v1.z + Math.sqrt(Math.max(0.0004, L * L - dx * dx - dy * dy)) + off.z; // rope z of this fist
        };
        const zF = zOn(F, r.reachF);
        let zB = Math.min(zF - r.gap, zOn(Bk, r.reachB)) - (r.slideB || 0);
        for (const [sd, z, pole] of [[F, zF, r.poleF], [Bk, zB, r.poleB]]) {
          const off = gripOff(sd).applyQuaternion(hq);
          const wrist = v2.set(r.x, r.y, z).sub(off).clone();
          solveTwoBone(bones['upperArm' + sd], bones['lowerArm' + sd], bones['hand' + sd], wrist, new THREE.Vector3(...pole).normalize());
          setWorldRot(bones['hand' + sd], hq);
        }
      }
      // fingers
      for (const sd of ['L', 'R']) { const c = pose.curl?.[sd] ?? 30; bones['fingers' + sd].quaternion.copy(eul(0, 0, sd === 'L' ? -c : c)); }
      // ground contact (FK clips): lowest heel/toe -> y = 0 (+ optional lift)
      if (pose.ground) {
        holder.updateMatrixWorld(true);
        let minY = Infinity;
        for (const sd of (pose.groundFoot ? [pose.groundFoot] : ['L', 'R'])) for (const fp of footPts) { v1.set(fp[0], fp[1], fp[2]); bones['foot' + sd].localToWorld(v1); minY = Math.min(minY, v1.y); }
        root.position.y += -minY + (pose.groundLift || 0) * R.s;
      }
      holder.updateMatrixWorld(true);
      times.push(t);
      for (const b of TRACKED) data[b].push(bones[b].quaternion.clone());
      rootPos.push(root.position.toArray());
      headQ.push(bones.head.getWorldQuaternion(new THREE.Quaternion()));
    }
    // secondary motion: ponytail / band tails hang toward gravity and lag behind the head (overlapping action)
    const N = headQ.length;
    for (let i = 0; i < N; i++) {
      const lagI = def.loop ? (i - 3 + (N - 1) * 4) % (N - 1) : Math.max(0, i - 3);
      const lagQ = headQ[lagI];
      const cur = headQ[i];
      const world = new THREE.Quaternion().slerpQuaternions(lagQ, new THREE.Quaternion(), 0.55);   // between lagged head and upright
      const local = cur.clone().invert().multiply(world);
      data.hairTip[i] = local.clone();
      data.bandTail[i] = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), local, 1.15).multiply(eul(8, 0, 0));
    }
    const tracks = [];
    for (const b of TRACKED) {
      const vals = []; let prev = null;
      for (const q of data[b]) { if (prev && prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w); vals.push(q.x, q.y, q.z, q.w); prev = q; }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, vals));
    }
    tracks.push(new THREE.VectorKeyframeTrack('root.position', times, rootPos.flat()));
    clips[name] = new THREE.AnimationClip(name, def.duration, tracks);
    info[name] = { loop: def.loop, expression: def.expression, duration: def.duration };
  }
  holder.remove(root);
  return { clips, info };
}
