// Camera / projection maths shared by the game logic and the 3D renderer (no three.js import).
//
// The camera is raised and tilted down at the courtyard (an isometric-like view): it looks at
// CAM.target from CAM.dist away, CAM.pitch degrees below the horizon, with a vertical field of view
// of CAM.fov degrees on the 1080x1920 portrait frame.
//
//   toScreen(X, Y, Z)    world point -> design pixel (1080x1920)
//   toWorld(x, y, z)     design pixel -> the world point on the plane at depth z seen at that pixel
//   toView(x, y, dist)   design pixel -> the world point `dist` units from the camera along that pixel
//   legacyWorld(x, y, z) the layout of the first (straight-ahead) camera: world positions of the
//                        scenery were designed with it, so they keep using it whatever the camera
//
// ?kamera=pitch,fov,dist on the page URL overrides the camera (tuning).

export const NEAR = 0.1;
export const FAR = 900;
export const W = 1080;
export const H = 1920;

// aimed between the devil (z ~1) and the crowd (z 3..5) so both sit in the middle of the safe area
export const CAM = { pitch: 30, fov: 50, dist: 19, target: { x: 0, y: 0.9, z: 2.6 } };

let C = { x: 0, y: 0, z: 0 }; // camera position
let F = { x: 0, y: 0, z: -1 }; // forward
let U = { x: 0, y: 1, z: 0 }; // up
let TY = 1; let TX = 1; // tan of the half field of view (vertical, horizontal)

function recompute() {
  const p = (CAM.pitch * Math.PI) / 180;
  F = { x: 0, y: -Math.sin(p), z: -Math.cos(p) };
  U = { x: 0, y: Math.cos(p), z: -Math.sin(p) };
  const t = CAM.target;
  C = { x: t.x, y: t.y + CAM.dist * Math.sin(p), z: t.z + CAM.dist * Math.cos(p) };
  TY = Math.tan(((CAM.fov / 2) * Math.PI) / 180);
  TX = TY * (W / H);
}
recompute();

/** Change the camera (any of pitch, fov, dist, target). */
export function setCamera(o = {}) {
  for (const k of ['pitch', 'fov', 'dist']) if (Number.isFinite(o[k])) CAM[k] = o[k];
  if (o.target) CAM.target = { ...CAM.target, ...o.target };
  recompute();
}

/** Camera pose for three.js: position, look-at target, vertical fov (deg), tan of the half fovs. */
export function camPose() { return { pos: { ...C }, target: { ...CAM.target }, fov: CAM.fov, pitch: CAM.pitch, tanY: TY, tanX: TX }; }

function ray(x, y) {
  const u = (x / (W / 2) - 1) * TX;
  const v = (1 - y / (H / 2)) * TY;
  return { x: F.x + u, y: F.y + v * U.y, z: F.z + v * U.z };
}

/** World point at depth z (the plane world-z = z) seen at design pixel (x, y). */
export function toWorld(x, y, z = 0) {
  const d = ray(x, y);
  const t = Math.abs(d.z) < 1e-4 ? 1000 : Math.max(0.05, (z - C.z) / d.z);
  return { x: C.x + d.x * t, y: C.y + d.y * t, z: C.z + d.z * t };
}

/** World point `dist` units from the camera, seen at design pixel (x, y). */
export function toView(x, y, dist) {
  const d = ray(x, y);
  const n = Math.hypot(d.x, d.y, d.z);
  return { x: C.x + (d.x / n) * dist, y: C.y + (d.y / n) * dist, z: C.z + (d.z / n) * dist };
}

/** Design pixel of a world point; k = how much bigger it looks than at the target's distance. */
export function toScreen(X, Y, Z) {
  const dx = X - C.x; const dy = Y - C.y; const dz = Z - C.z;
  const cz = Math.max(0.01, dx * F.x + dy * F.y + dz * F.z);
  const cy = dx * U.x + dy * U.y + dz * U.z;
  return { x: (W / 2) * (1 + dx / (cz * TX)), y: (H / 2) * (1 - cy / (cz * TY)), k: CAM.dist / cz };
}

// ------------------------------------------------------------------ the first camera's layout
const LS = 100; const LGY = 1158; const LD = 22; const LEYE = (1158 - 1040) / 100;
/** World point of the original straight-ahead layout (design pixel x, y at depth z). */
export function legacyWorld(x, y, z = 0) {
  const k = (LD - z) / LD;
  return { x: ((x - 540) / LS) * k, y: LEYE + ((LGY - y) / LS - LEYE) * k, z };
}
