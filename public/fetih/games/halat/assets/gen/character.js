// Procedural stylised characters (party-game proportions) skinned to a hand-built THREE.Skeleton.
// One SkinnedMesh (one draw call) per character; geometry is cached per (kind, look) and shared by all instances.
//
// Construction: the torso and neck are smooth lofts with blended hips -> spine -> chest -> neck weights; arms,
// legs, hands and feet are rounded capsules rigidly bound to their bone with ball ends that coincide at the joint,
// so elbows and knees never collapse or tear at any angle. The face is made of small parts on face bones
// (eyes, lids, brows, three mouth shapes) that setExpression() shows, hides and poses.
// Units: metres, character faces +Z, +Y up, its left = +X, feet on y = 0. Bind pose: arms hang down.
import * as THREE from 'three';
import { loft, capsule, band, ellipsoid, tube, roundedBox, warp, mergeVerticesSimple, MeshBuilder, M4 } from './geo.js';

// ------------------------------------------------------------------------------------------------ rig
export const BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'lowerArmL', 'handL', 'fingersL',
  'shoulderR', 'upperArmR', 'lowerArmR', 'handR', 'fingersR',
  'upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR',
  'eyeL', 'eyeR', 'lidL', 'lidR', 'browL', 'browR', 'mouthSmile', 'mouthOpen', 'mouthGrit', 'hairTip', 'bandTail'];

/** Rig dimensions (puller defaults; strongman/giant pass overrides). All bind rotations are identity. */
export function rigSpec(p = {}) {
  const H = p.hipY ?? 0.64;                         // hips bone (pelvis centre)
  const legX = p.legX ?? 0.1, ulTop = H - 0.03, ul = p.upperLeg ?? 0.27, ankle = p.ankleY ?? 0.095;
  const kneeY = ulTop - ul;
  const armY = H + (p.armUp ?? 0.355), sw = p.shoulderX ?? 0.215;
  const ua = p.upperArm ?? 0.23, la = p.lowerArm ?? 0.21, palm = p.palm ?? 0.075, finger = p.finger ?? 0.068;
  const chestY = H + (p.chestUp ?? 0.27), neckY = H + (p.neckUp ?? 0.43), headY = H + (p.headUp ?? 0.5);
  const R = p.headR ?? 0.26, headC = headY + (p.headLift ?? 0.215);
  const HR = { x: R * 1.0, y: R * 0.97, z: R * 0.95 };   // head ellipsoid radii (features sit on it)
  const surf = (x, y) => { const dy = (y - headC) / HR.y, dx = x / HR.x; return HR.z * Math.sqrt(Math.max(0.02, 1 - dx * dx - dy * dy)); };
  const ex = R * 0.37, ey = headC - R * 0.02, by = ey + R * 0.36, my = headC - R * 0.4;
  const W = {
    root: [0, 0, 0], hips: [0, H, 0], spine: [0, H + 0.12, 0], chest: [0, chestY, 0], neck: [0, neckY, 0], head: [0, headY, 0],
    shoulderL: [0.07, armY + 0.005, 0], upperArmL: [sw, armY, 0], lowerArmL: [sw, armY - ua, 0], handL: [sw, armY - ua - la, 0], fingersL: [sw, armY - ua - la - palm, 0],
    upperLegL: [legX, ulTop, 0], lowerLegL: [legX, kneeY, 0], footL: [legX, ankle, 0],
    eyeL: [ex, ey, surf(ex, ey) - 0.012], lidL: [ex, ey, surf(ex, ey) - 0.012], browL: [ex * 0.95, by, surf(ex, by) - 0.006],
    mouthSmile: [0, my, surf(0, my) - 0.012], mouthOpen: [0, my, surf(0, my) - 0.014], mouthGrit: [0, my, surf(0, my) - 0.014],
    hairTip: [0, headC + R * 0.25, -R * 0.9], bandTail: [0, headC + R * 0.32, -R * 0.98],
  };
  for (const k of ['shoulder', 'upperArm', 'lowerArm', 'hand', 'fingers', 'upperLeg', 'lowerLeg', 'foot', 'eye', 'lid', 'brow']) {
    const L = W[k + 'L']; if (L) W[k + 'R'] = [-L[0], L[1], L[2]];
  }
  const PARENT = {
    hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
    shoulderL: 'chest', upperArmL: 'shoulderL', lowerArmL: 'upperArmL', handL: 'lowerArmL', fingersL: 'handL',
    shoulderR: 'chest', upperArmR: 'shoulderR', lowerArmR: 'upperArmR', handR: 'lowerArmR', fingersR: 'handR',
    upperLegL: 'hips', lowerLegL: 'upperLegL', footL: 'lowerLegL', upperLegR: 'hips', lowerLegR: 'upperLegR', footR: 'lowerLegR',
    eyeL: 'head', eyeR: 'head', lidL: 'head', lidR: 'head', browL: 'head', browR: 'head', mouthSmile: 'head', mouthOpen: 'head', mouthGrit: 'head', hairTip: 'head', bandTail: 'head',
  };
  return { W, PARENT, H, sw, ua, la, palm, finger, ul, ll: kneeY - ankle, ankle, legX, ulTop, R, HR, surf, headC, armY, chestY, neckY, headY, kneeY,
    footLen: p.footLen ?? 0.28, footH: p.footH ?? 0.115, footW: p.footW ?? 0.155 };
}

export function makeSkeleton(spec) {
  const bones = {};
  for (const name of BONES) { const b = new THREE.Bone(); b.name = name; bones[name] = b; }
  for (const name of BONES) {
    const w = spec.W[name]; const par = spec.PARENT[name];
    if (par) { const pw = spec.W[par]; bones[name].position.set(w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]); bones[par].add(bones[name]); }
    else bones[name].position.set(...w);
  }
  return { bones, list: BONES.map(n => bones[n]), root: bones.root };
}

// ------------------------------------------------------------------------------------------------ looks
const C = h => new THREE.Color(h);
export const SKIN = { fair: 0xf8d5bd, light: 0xf2c29c, tan: 0xdb9c6c, olive: 0xc48a58, brown: 0x9c6542, dark: 0x6f442b };

/** Puller looks: 8 distinct people from one factory. Team colour goes on the shirt (+ headband / cap / armband). */
export const pullerLooks = [
  { id: 'ahmet', label: 'Ahmet', gender: 'm', skin: SKIN.tan, hair: 'short', hairColor: 0x2b1d16, shirt: 'tee', pants: 'long', pantsColor: 0x34558f, shoes: 0xf4f4f4, shoeTrim: 0xd23c3c, moustache: true, girth: 1.02 },
  { id: 'ayse', label: 'Ayşe', gender: 'f', skin: SKIN.light, hair: 'ponytail', hairColor: 0x70391b, shirt: 'tee', pants: 'shorts', pantsColor: 0x2f3546, shoes: 0xe0484f, shoeTrim: 0xffffff, socks: true, girth: 0.93, blush: true, lashes: true },
  { id: 'mehmet', label: 'Mehmet', gender: 'm', skin: SKIN.dark, hair: 'curly', hairColor: 0x1b1412, shirt: 'tank', pants: 'shorts', pantsColor: 0xc09a5c, shoes: 0x2f2f36, shoeTrim: 0xf5c542, socks: true, girth: 1.06, armK: 1.08, wristbands: true },
  { id: 'zeynep', label: 'Zeynep', gender: 'f', skin: SKIN.fair, hair: 'bun', hairColor: 0xb4532a, shirt: 'long', pants: 'long', pantsColor: 0x4f5a69, shoes: 0xf4f4f4, shoeTrim: 0x5aa0e6, girth: 0.9, blush: true, freckles: true, glasses: 0x2a2a35, lashes: true },
  { id: 'can', label: 'Can', gender: 'm', skin: SKIN.light, hair: 'spiky', hairColor: 0xe8b84a, shirt: 'tee', pants: 'long', pantsColor: 0x2b2f3a, shoes: 0x3c8f5a, shoeTrim: 0xffffff, girth: 1.14, belly: 0.05 },
  { id: 'elif', label: 'Elif', gender: 'f', skin: SKIN.brown, hair: 'long', hairColor: 0x1e1512, shirt: 'tee', pants: 'long', pantsColor: 0x7d52bd, shoes: 0xf4f4f4, shoeTrim: 0x8a5ac8, girth: 0.92, lashes: true, armband: true },
  { id: 'dede', label: 'Dede', gender: 'm', skin: SKIN.olive, hair: 'short', hairColor: 0xc9c4bb, shirt: 'tee', pants: 'long', pantsColor: 0x6b4b33, shoes: 0x4a3426, shoeTrim: 0x2a1d14, moustache: 'big', girth: 1.1, belly: 0.06, cap: true, brows: 'bushy' },
  { id: 'selin', label: 'Selin', gender: 'f', skin: SKIN.tan, hair: 'pigtails', hairColor: 0x7d4bd6, shirt: 'tank', pants: 'shorts', pantsColor: 0x3a6fb0, shoes: 0xffd23f, shoeTrim: 0x2a2a2a, socks: true, girth: 0.9, blush: true, lashes: true, wristbands: true },
];

export const STRONGMAN_LOOK = { id: 'pehlivan', label: 'Pehlivan', gender: 'm', skin: SKIN.olive, hair: 'short', hairColor: 0x161010, shirt: 'none', pants: 'kispet', pantsColor: 0x3a2516, shoes: null, moustache: 'big', girth: 1.0, armband: true, oiled: true, brows: 'thick', headband: true };
export const GIANT_LOOK = { id: 'dev', label: 'Dev', gender: 'm', skin: 0x87a2d2, hair: 'wild', hairColor: 0xf1f4f8, shirt: 'tunic', pants: 'long', pantsColor: 0x4f3d2e, shoes: 0x3b2a1f, shoeTrim: 0x24180f, beard: 'big', moustache: true, girth: 1.0, armband: true, brows: 'thick', bigHands: 1.3, headband: false, wristbands: true };

// ------------------------------------------------------------------------------------------------ body builder
const EYE_WHITE = 0xffffff, PUPIL = 0x231c2a, MOUTH = 0x5e1f2c, TEETH = 0xffffff, TONGUE = 0xe0606f;
const smoothstep = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Build the character geometry in bind pose.
 * @param spec rigSpec()   @param look look object   @param body { chest, arm, leg, hand, waist, neck } multipliers
 * @returns {THREE.BufferGeometry} position/normal/color/team/skinIndex/skinWeight, userData.triangles
 */
export function buildBody(spec, look, body = {}) {
  const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
  const mb = new MeshBuilder({ skinned: true });
  const { H, sw, R, headC, armY, ua, la, palm, finger, kneeY, ankle, legX, ulTop, HR } = spec;
  const ek = R / 0.26; // face feature scale
  const g = look.girth ?? 1, belly = look.belly ?? 0, chestK = body.chest ?? 1, waistK = body.waist ?? 1;
  const armK = (body.arm ?? 1) * (look.armK ?? 1) * (0.9 + 0.1 * g), legK = (body.leg ?? 1) * (0.92 + 0.08 * g), hk = (body.hand ?? 1) * (look.bigHands ?? 1);
  const fem = look.gender === 'f';
  const skin = C(look.skin), skinShade = C(look.skin).multiplyScalar(0.84).lerp(C(0xc0504a), 0.08);
  const hairC = C(look.hairColor), pantsC = C(look.pantsColor), pantsDark = C(look.pantsColor).multiplyScalar(0.72);
  const one = n => [[B[n], 1]];
  const two = (a, b, t) => [[B[a], 1 - t], [B[b], t]];
  const grey = v => C(0xffffff).multiplyScalar(v);

  // ---------------------------------------------------------------- torso (one loft: crotch -> neck base)
  const bare = look.shirt === 'none', tunic = look.shirt === 'tunic';
  const beltY = H + 0.075;
  const hipW = fem ? 1.03 : 1, waistW = (fem ? 0.93 : 1) * waistK;
  const keys = [ // dy, rx, rz, cz
    [-0.1, 0.075, 0.065, 0], [-0.075, 0.14, 0.11, 0], [-0.04, 0.172 * hipW, 0.128, 0], [0, 0.186 * hipW, 0.138, 0.002],
    [0.04, 0.188, 0.142, 0.004], [beltY - H - 0.003, 0.188, 0.142, 0.005], [beltY - H + 0.003, 0.188, 0.142, 0.005],
    [0.12, 0.183 * waistW, 0.138, 0.006], [0.18, 0.189 * waistW, 0.14, 0.008], [0.24, 0.202, 0.145, 0.01], [0.29, 0.21, 0.145, 0.008],
    [0.33, 0.207, 0.138, 0.0], [0.365, 0.19, 0.124, -0.006], [0.39, 0.158, 0.106, -0.01], [0.41, 0.112, 0.084, -0.01], [0.424, 0.058, 0.052, -0.01],
  ];
  const torsoRings = [{ y: H - 0.108, rx: 0, cz: 0 }];
  for (const [dy, rx0, rz0, cz0] of keys) {
    const up = smoothstep(0.12, 0.3, dy);                       // chest region
    const bel = Math.exp(-Math.pow((dy - 0.12) / 0.11, 2));     // belly bump
    const gx = THREE.MathUtils.lerp(g, g * chestK, up), gz = THREE.MathUtils.lerp(g, (1 + (g - 1) * 0.6) * chestK, up);
    torsoRings.push({ y: H + dy, rx: rx0 * gx, rz: rz0 * gz + belly * bel, cz: cz0 + belly * bel * 0.8 });
  }
  torsoRings.push({ y: H + 0.43, rx: 0, cz: -0.01 });
  const torso = loft(torsoRings, 16);
  const torsoW = p => {
    const dy = p.y - H;
    let w;
    if (dy < 0.16) w = two('hips', 'spine', smoothstep(0.05, 0.16, dy));
    else if (dy < 0.38) w = two('spine', 'chest', smoothstep(0.16, 0.27, dy));
    else w = two('chest', 'neck', 0.45 * smoothstep(0.38, 0.43, dy));
    const ax = Math.abs(p.x);
    if (dy > 0.28 && ax > 0.1) { const s = 0.45 * smoothstep(0.28, 0.37, dy) * smoothstep(0.1, 0.19, ax); w = w.map(([b, x]) => [b, x * (1 - s)]); w.push([B[p.x > 0 ? 'shoulderL' : 'shoulderR'], s]); }
    return w;
  };
  const shirtCol = p => {
    if (p.y < beltY && !tunic) return pantsC;
    if (bare) return skin;
    if (p.y > H + 0.405) return grey(0.78); // collar trim
    return grey(1);
  };
  const shirtTeam = p => (bare || (p.y < beltY && !tunic) ? 0 : 1);
  mb.add(torso, { color: shirtCol, team: shirtTeam, bones: torsoW });
  // belt / waistband ring + shirt hem
  const bandAt = (y, scale = 1.0, h = 0.03, t = 0.02, color, team = 0, bones = torsoW) => {
    const dy = y - H; const k = torsoRings.find(r => r.y >= y) || torsoRings[3];
    mb.add(band(k.rx * scale, h, t, 20, (k.rz / k.rx)), { color, team, bones, matrix: M4.t(0, y, k.cz || 0) });
    return dy;
  };
  if (look.pants === 'kispet') bandAt(beltY + 0.005, 1.02, 0.045, 0.024, 0xffffff, 1);         // team belt on the wrestler
  else if (!tunic && !bare) bandAt(beltY + 0.012, 1.025, 0.03, 0.018, grey(0.8), 1);           // shirt hem (team, darker)
  if (tunic) {
    // long tunic skirt (team) with a leather sash
    mb.add(capsule([{ y: H - 0.2, rx: 0.235 * g, rz: 0.19 * g, cap: 0.15 }, { y: H - 0.05, rx: 0.205 * g, rz: 0.165 * g }, { y: H + 0.04, rx: 0.192 * g, rz: 0.15 * g, cap: 0.2 }], 20, 2),
      { color: p => (p.y < H - 0.17 ? grey(0.8) : grey(1)), team: 1, bones: p => two('hips', 'hips', 0) });
    bandAt(H + 0.07, 1.05, 0.06, 0.03, 0x5a3b24, 0);
  }
  if (bare) { // pecs + navel line for the wrestler
    for (const s of [1, -1]) mb.add(ellipsoid(0.105 * chestK, 0.075, 0.05, 14, 9), { color: skin, bones: one('chest'), matrix: M4.trs([s * 0.095 * chestK, H + 0.305, 0.112 * chestK], [0.15, s * 0.25, 0]) });
    mb.add(ellipsoid(0.012, 0.016, 0.006, 6, 4), { color: skinShade, bones: one('spine'), matrix: M4.t(0, H + 0.13, 0.142 * g + 0.002) });
  }

  // ---------------------------------------------------------------- neck
  mb.add(capsule([{ y: H + 0.38, rx: 0.06 * (body.neck ?? 1), rz: 0.056 * (body.neck ?? 1) }, { y: spec.headY + 0.05, rx: 0.056 * (body.neck ?? 1), rz: 0.052 * (body.neck ?? 1) }], 10, 2),
    { color: skin, bones: p => (p.y < spec.neckY + 0.02 ? two('chest', 'neck', smoothstep(spec.neckY - 0.04, spec.neckY + 0.02, p.y)) : two('neck', 'head', smoothstep(spec.neckY + 0.03, spec.headY + 0.04, p.y))) });

  // ---------------------------------------------------------------- arms
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1, x = sx * sw;
    const el = armY - ua, wr = el - la, fy = wr - palm;
    const a = armK, bicep = look.oiled ? 1.18 : 1;
    const longSleeve = look.shirt === 'long';
    const armCol = longSleeve ? grey(1) : skin, armTeam = longSleeve ? 1 : 0;
    // upper arm (ball at the shoulder and elbow)
    mb.add(capsule([{ y: el, rx: 0.052 * a, cx: x }, { y: el + ua * 0.45, rx: 0.059 * a * bicep, rz: 0.061 * a * bicep, cx: x }, { y: armY, rx: 0.063 * a, cx: x }], 10, 2),
      { color: armCol, team: armTeam, bones: one('upperArm' + side) });
    // forearm
    mb.add(capsule([{ y: wr + 0.005, rx: 0.042 * a, rz: 0.047 * a, cx: x }, { y: el - la * 0.38, rx: 0.053 * a, rz: 0.056 * a, cx: x }, { y: el, rx: 0.051 * a, cx: x }], 9, 2),
      { color: armCol, team: armTeam, bones: one('lowerArm' + side) });
    if (look.shirt === 'tee' || look.shirt === 'tunic' || longSleeve) { // sleeve shell
      const sEnd = armY - (longSleeve ? 0.13 : 0.115), sr = 0.077 * a;
      mb.add(capsule([{ y: sEnd, rx: sr * 0.97, cx: x, cap: 0.25 }, { y: armY - 0.04, rx: sr, cx: x }, { y: armY, rx: sr * 0.96, cx: x }], 10, 2),
        { color: p => (p.y < sEnd + 0.012 && !longSleeve ? grey(0.8) : grey(1)), team: 1, bones: one('upperArm' + side) });
    }
    if (longSleeve) mb.add(band(0.05 * a, 0.03, 0.016, 12), { color: grey(0.8), team: 1, bones: one('lowerArm' + side), matrix: M4.t(x, wr + 0.025, 0) });
    if (look.armband) mb.add(band(0.064 * a * bicep, 0.04, 0.02, 14), { color: 0xffffff, team: 1, bones: one('upperArm' + side), matrix: M4.t(x, armY - 0.14, 0) });
    if (look.wristbands) mb.add(band(0.047 * a, 0.045, 0.02, 12), { color: 0xffffff, team: 1, bones: one('lowerArm' + side), matrix: M4.t(x, wr + 0.035, 0) });
    if (look.shirt === 'tank' || bare) mb.add(ellipsoid(0.07 * a, 0.06, 0.068, 10, 7), { color: skin, bones: one('upperArm' + side), matrix: M4.t(x - sx * 0.005, armY + 0.01, 0) });

    // hand: palm (thin in X, palm faces the body), three chunky fingers on the fingers bone, thumb toward +Z
    const h = hk * 1.15;
    mb.add(capsule([{ y: wr - palm * 0.95, rx: 0.03 * h, rz: 0.05 * h, cx: x - sx * 0.004 * h, cz: 0.004, cap: 0.6 }, { y: wr - palm * 0.45, rx: 0.034 * h, rz: 0.054 * h, cx: x }, { y: wr, rx: 0.031 * h, rz: 0.044 * h, cx: x, cap: 0.6 }], 8, 2),
      { color: skin, bones: one('hand' + side) });
    const fl = finger * h, fr = 0.0175 * h;
    [[-0.028, 0.86], [0.0, 1.0], [0.027, 0.95]].forEach(([fz, len]) => {
      const L = fl * len;
      const pts = [[x, fy + 0.012, fz * h], [x - sx * 0.004, fy - L * 0.5, fz * h], [x - sx * 0.014 * h, fy - L, fz * h * 1.05]]; // slight pre-curl toward the palm
      mb.add(tube(pts, fr, 5), { color: skin, bones: one('fingers' + side) });
    });
    mb.add(tube([[x - sx * 0.006, wr - 0.022 * h, 0.03 * h], [x - sx * 0.014 * h, wr - 0.05 * h, 0.06 * h], [x - sx * 0.024 * h, wr - 0.072 * h, 0.07 * h]], 0.019 * h, 5), { color: skin, bones: one('hand' + side) });
  }

  // ---------------------------------------------------------------- legs
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1, x = sx * legX, l = legK;
    const shorts = look.pants === 'shorts', kispet = look.pants === 'kispet', long = look.pants === 'long';
    const thighCol = long || kispet ? pantsC : skin;
    mb.add(capsule([{ y: kneeY, rx: 0.068 * l, cx: x }, { y: kneeY + spec.ul * 0.55, rx: 0.08 * l, rz: 0.084 * l, cx: x }, { y: ulTop, rx: 0.088 * l * Math.sqrt(g), cx: x }], 10, 2),
      { color: thighCol, bones: one('upperLeg' + side) });
    const shinCol = long ? pantsC : (kispet ? (p => (p.y > kneeY - 0.07 ? pantsC : skin)) : skin);
    mb.add(capsule([{ y: ankle + 0.01, rx: 0.05 * l, cx: x }, { y: kneeY - spec.ll * 0.32, rx: 0.062 * l, rz: 0.066 * l, cx: x, cz: -0.006 }, { y: kneeY, rx: 0.066 * l, cx: x }], 9, 2),
      { color: shinCol, bones: one('lowerLeg' + side) });
    if (shorts || kispet) {
      const end = shorts ? kneeY + 0.09 : kneeY - 0.075, pr = 0.1 * l * Math.sqrt(g);
      mb.add(capsule([{ y: end, rx: pr * (kispet ? 0.9 : 1.0), cx: x, cap: 0.22 }, { y: ulTop - 0.05, rx: pr, cx: x }, { y: ulTop, rx: pr * 0.98, cx: x }], 10, 2),
        { color: p => (p.y < end + 0.016 ? pantsDark : pantsC), bones: p => (kispet && p.y < kneeY + 0.02 ? two('upperLeg' + side, 'lowerLeg' + side, smoothstep(kneeY + 0.02, kneeY - 0.03, p.y)) : one('upperLeg' + side)) });
      if (kispet) mb.add(band(0.066 * l, 0.03, 0.016, 12), { color: 0xd8b25a, bones: one('lowerLeg' + side), matrix: M4.t(x, kneeY - 0.07, 0) });
    }
    if (long) mb.add(band(0.057 * l, 0.03, 0.016, 12), { color: pantsDark, bones: one('lowerLeg' + side), matrix: M4.t(x, ankle + 0.075, 0) });
    if (look.socks) mb.add(band(0.054 * l, 0.045, 0.014, 12), { color: 0xffffff, bones: one('lowerLeg' + side), matrix: M4.t(x, ankle + 0.08, 0) });
    // shoe: chunky rounded sneaker, toe forward (+Z), lower toe, rubber sole + toe cap
    const fl = spec.footLen, fh = spec.footH, fw = spec.footW;
    if (look.shoes !== null) {
      const shoe = warp(roundedBox(fw, fh, fl, 0.052, 2), v => {
        const t = THREE.MathUtils.clamp((v.z / (fl / 2) + 1) / 2, 0, 1); // 0 heel .. 1 toe
        v.x *= 1 - 0.12 * (1 - t) + 0.04 * Math.sin(t * Math.PI);
        if (v.y > 0) v.y *= 1 - 0.3 * smoothstep(0.5, 1, t);
      });
      mb.add(shoe, { color: C(look.shoes), bones: one('foot' + side), matrix: M4.t(x, fh * 0.5 + 0.012, fl * 0.2) });
      const sole = warp(roundedBox(fw * 1.015, 0.045, fl * 1.01, 0.02, 1), v => { const t = THREE.MathUtils.clamp((v.z / (fl / 2) + 1) / 2, 0, 1); v.x *= 1 - 0.1 * (1 - t); });
      mb.add(sole, { color: C(look.shoeTrim ?? 0xffffff), bones: one('foot' + side), matrix: M4.t(x, 0.0225, fl * 0.2) });
      mb.add(band(0.055 * l, 0.025, 0.02, 12, 1.15), { color: C(look.shoeTrim ?? 0xffffff), bones: one('foot' + side), matrix: M4.t(x, fh + 0.015, -0.01) }); // collar
    } else { // bare feet
      mb.add(warp(roundedBox(fw * 0.92, fh * 0.75, fl * 0.95, 0.045, 2), v => { if (v.y > 0 && v.z > 0) v.y *= 0.7; }), { color: skin, bones: one('foot' + side), matrix: M4.t(x, fh * 0.37, fl * 0.2) });
    }
  }

  // ---------------------------------------------------------------- head
  const headRings = [];
  const NR = 12;
  for (let i = 0; i <= NR; i++) {
    const th = (i / NR) * Math.PI; // 0 = chin .. PI = top
    const y = headC - Math.cos(th) * HR.y;
    const s = Math.sin(th), low = Math.max(0, -Math.cos(th));
    const cheek = 1 + 0.05 * Math.sin(th * 1.6) * (1 - low * 0.6);
    headRings.push({ y, rx: i === 0 || i === NR ? 0 : HR.x * s * cheek, rz: i === 0 || i === NR ? 0 : HR.z * s, cz: 0.012 * low });
  }
  mb.add(loft(headRings, 16), { color: skin, bones: one('head') });
  const nrm = (x, y) => new THREE.Vector3(x / (HR.x * HR.x), (y - headC) / (HR.y * HR.y), spec.surf(x, y) / (HR.z * HR.z)).normalize();
  /** Place a feature authored at the origin facing +Z onto the face surface at (x, y). */
  const face = (geo, x, y, { inset = 0, out = 0, roll = 0, bones, color, team = 0, s = 1 }) => {
    const n = nrm(x, y);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
    const p = new THREE.Vector3(x, y, spec.surf(x, y)).addScaledVector(n, out - inset);
    mb.add(geo, { color, team, bones, matrix: new THREE.Matrix4().compose(p, q, new THREE.Vector3(s, s, s)) });
  };
  // ears + nose + cheeks
  for (const s of [1, -1]) {
    mb.add(ellipsoid(0.034 * ek, 0.056 * ek, 0.03 * ek, 8, 6), { color: skin, bones: one('head'), matrix: M4.trs([s * HR.x * 0.97, headC - R * 0.06, -0.01], [0, s * 0.3, 0]) });
    mb.add(ellipsoid(0.016 * ek, 0.03 * ek, 0.01 * ek, 6, 4), { color: skinShade, bones: one('head'), matrix: M4.trs([s * (HR.x * 0.97 + 0.022 * ek), headC - R * 0.06, 0.0], [0, s * 0.3, 0]) });
  }
  face(ellipsoid(0.038 * ek, 0.032 * ek, 0.034 * ek, 8, 6), 0, headC - R * 0.15, { out: 0.008 * ek, color: skinShade, bones: one('head') });
  if (look.blush) for (const s of [1, -1]) face(ellipsoid(0.048 * ek, 0.026 * ek, 0.01, 8, 5), s * R * 0.55, headC - R * 0.24, { out: 0.0, color: C(look.skin).lerp(C(0xff6f7d), 0.5), bones: one('head') });
  if (look.freckles) for (let k = 0; k < 8; k++) { const s = k < 4 ? 1 : -1; face(ellipsoid(0.0075, 0.0075, 0.004, 4, 2), s * (R * 0.4 + (k % 4) * 0.02 * ek), headC - R * 0.16 - ((k * 7) % 3) * 0.013, { out: 0.001, color: C(look.skin).multiplyScalar(0.7).lerp(C(0x9a4a2a), 0.4), bones: one('head') }); }

  // eyes: white + pupil + highlight on the eye bone; closed-eye arcs on the lid bone (hidden by default)
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1, e = spec.W['eye' + side];
    const ex = e[0], ey = e[1];
    face(ellipsoid(0.054 * ek, 0.07 * ek, 0.03 * ek, 12, 7), ex, ey, { inset: 0.012 * ek, color: EYE_WHITE, bones: one('eye' + side) });
    face(ellipsoid(0.033 * ek, 0.045 * ek, 0.02 * ek, 8, 5), ex - sx * 0.006 * ek, ey - 0.006 * ek, { out: 0.006 * ek, color: PUPIL, bones: one('eye' + side) });
    face(ellipsoid(0.011 * ek, 0.013 * ek, 0.006, 5, 3), ex + 0.008 * ek, ey + 0.014 * ek, { out: 0.021 * ek, color: 0xffffff, bones: one('eye' + side) });
    if (look.lashes) face(tube([[sx * 0.042 * ek, 0.048 * ek, 0], [sx * 0.058 * ek, 0.06 * ek, 0], [sx * 0.07 * ek, 0.072 * ek, -0.004]], 0.008 * ek, 5), ex, ey, { out: 0.004, color: PUPIL, bones: one('eye' + side) });
    if (look.glasses) {
      face(band(0.068 * ek, 0.014 * ek, 0.011 * ek, 14).rotateX(Math.PI / 2), ex, ey, { out: 0.03 * ek, color: look.glasses, bones: one('head') });
    }
    // closed lid "^" arc (joy) – the expression rotates it into "> <" for strain
    const arc = [[-0.048, -0.016], [-0.024, 0.0], [0, 0.017], [0.024, 0.0], [0.048, -0.016]].map(([a, b]) => [a * ek, b * ek, 0]); // chevron
    face(tube(arc, 0.012 * ek, 5), ex, ey, { out: 0.006, color: PUPIL, bones: one('lid' + side) });
    // brow
    const b = spec.W['brow' + side];
    const thick = look.brows === 'thick' ? 1.7 : look.brows === 'bushy' ? 1.5 : 1;
    const browC = look.hair === 'bald' || look.brows === 'bushy' ? C(look.hairColor).multiplyScalar(0.75) : C(look.hairColor).lerp(C(0x231a16), 0.35);
    face(tube([[-0.05 * ek, -0.008 * ek, -0.006], [0, 0.009 * ek, 0], [0.05 * ek, -0.004 * ek, -0.006]], [0.0135 * thick * ek, 0.008 * ek], 6), b[0], b[1], { out: 0.004, color: browC, bones: one('brow' + side) });
  }
  if (look.glasses) mb.add(tube([[0.03 * ek, spec.W.eyeL[1] + 0.005, spec.W.eyeL[2] + 0.055], [0, spec.W.eyeL[1] + 0.012, spec.W.eyeL[2] + 0.06], [-0.03 * ek, spec.W.eyeL[1] + 0.005, spec.W.eyeL[2] + 0.055]], 0.006, 5), { color: look.glasses, bones: one('head') });

  // mouths: smile arc, open "D" (joy/shock), gritted teeth (strain)
  const my = spec.W.mouthSmile[1], mo = look.beard ? 0.012 : 0;
  const smile = []; for (let k = 0; k <= 8; k++) { const t = k / 8 * 2 - 1; smile.push([t * 0.068 * ek, 0.022 * ek * t * t, -0.012 * ek * t * t]); }
  face(tube(smile, 0.011 * ek, 6), 0, my, { out: 0.002 + mo, color: MOUTH, bones: one('mouthSmile') });
  const dm = warp(ellipsoid(0.07 * ek, 0.056 * ek, 0.02 * ek, 12, 7), v => { if (v.y > 0) v.y *= 0.25; });
  face(dm, 0, my, { inset: 0.004 - mo, color: MOUTH, bones: one('mouthOpen') });
  face(warp(ellipsoid(0.052 * ek, 0.013 * ek, 0.01 * ek, 10, 5), v => { v.y = Math.max(v.y, -0.004); }), 0, my + 0.006 * ek, { out: 0.009 + mo, color: TEETH, bones: one('mouthOpen') });
  face(ellipsoid(0.03 * ek, 0.016 * ek, 0.01, 8, 5), 0, my - 0.03 * ek, { out: 0.004 + mo, color: TONGUE, bones: one('mouthOpen') });
  face(roundedBox(0.128 * ek, 0.054 * ek, 0.02 * ek, 0.02 * ek, 1), 0, my, { inset: 0.004 - mo, color: MOUTH, bones: one('mouthGrit') });
  face(roundedBox(0.112 * ek, 0.04 * ek, 0.012 * ek, 0.014 * ek, 1), 0, my, { out: 0.006 + mo, color: TEETH, bones: one('mouthGrit') });
  face(roundedBox(0.108 * ek, 0.005 * ek, 0.01 * ek, 0.002, 1), 0, my, { out: 0.009 + mo, color: 0xb9a9a9, bones: one('mouthGrit') });

  // ---------------------------------------------------------------- facial hair
  if (look.moustache) {
    const big = look.moustache === 'big' ? 1.45 : 1;
    for (const s of [1, -1]) face(tube([[s * 0.006, 0.0, 0.004], [s * 0.035 * big * ek, -0.002, 0], [s * 0.066 * big * ek, big > 1 ? 0.018 : -0.016, -0.02]], [0.017 * big * ek, 0.019 * big * ek, 0.009 * ek], 7), 0, my + 0.05 * ek, { out: 0.006 + mo, color: hairC.clone().multiplyScalar(look.beard ? 0.92 : 0.85), bones: one('head') });
  }
  if (look.beard) {
    const big = look.beard === 'big' ? 1.3 : 1;
    const beard = warp(ellipsoid(R * 0.88 * big, R * 0.62 * big, R * 0.7 * big, 16, 10), v => { if (v.y > 0) v.y *= 0.22; v.z += 0.02 * Math.max(0, -v.y / (R * 0.6)); });
    mb.add(beard, { color: hairC, bones: p => (p.y < headC - R * 1.0 ? [[B.head, 0.75], [B.hairTip, 0.25]] : one('head')), matrix: M4.t(0, headC - R * 0.44, R * 0.3) });
  }

  // ---------------------------------------------------------------- hair
  // hair shell: a head-shaped sphere slightly larger than the head; below the hairline (high at the forehead, low at
  // the nape) the vertices are pulled inside the head, which gives a clean hairline without cutting geometry.
  const hairCap = ({ k = 1.075, front = 0.42, nape = -0.55, up = 0, back = 0, part = 0, crown = null } = {}) => {
    const g2 = new THREE.SphereGeometry(R, 16, 12); g2.deleteAttribute('uv');
    const p = g2.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / R, y = p.getY(i) / R, z = p.getZ(i) / R;
      const fz = THREE.MathUtils.clamp((z + 0.15) / 1.15, 0, 1);
      let line = THREE.MathUtils.lerp(nape, front, fz * fz);
      if (Math.abs(x) > 0.75 && z > -0.2 && z < 0.5) line -= 0.12; // sideburns
      if (part && z > 0.2) line += part * Math.max(0, x) * 0.25;        // side part (fringe sweeps)
      const s = (y >= line && (!crown || y < crown.top - crown.slope * z)) ? k : 0.9;
      p.setXYZ(i, x * HR.x * s, y * HR.y * s, z * HR.z * s);
    }
    const m = mergeVerticesSimple(g2, 1e-5); m.computeVertexNormals();
    mb.add(m, { color: hairC, bones: one('head'), matrix: M4.t(0, headC + up, -back) });
  };
  const tuft = (x, y, z, rx, ry, rz, rot = [0, 0, 0]) => mb.add(ellipsoid(rx, ry, rz, 8, 6), { color: hairC, bones: one('head'), matrix: M4.trs([x, y, z], rot) });
  const fringe = (n = 3, lift = 0) => { for (let k = 0; k < n; k++) { const t = (k / (n - 1) - 0.5); tuft(t * R * 1.15, headC + R * (0.66 + lift) - Math.abs(t) * 0.05, R * 0.66 - Math.abs(t) * 0.05, 0.085 * ek, 0.052 * ek, 0.065 * ek, [0.55, t * 0.4, -t * 0.7]); } };
  switch (look.hair) {
    case 'short': hairCap({ part: 1 }); fringe(3); break;
    case 'spiky': hairCap({ front: 0.5, k: 1.06 });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.3; const cone = new THREE.ConeGeometry(0.058 * ek, 0.15 * ek, 8); cone.deleteAttribute('uv'); mb.add(cone, { color: hairC, bones: one('head'), matrix: M4.trs([Math.sin(a) * R * 0.5, headC + R * 0.86, Math.cos(a) * R * 0.5 - 0.02], [Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6]) }); }
      { const cone = new THREE.ConeGeometry(0.07 * ek, 0.2 * ek, 8); cone.deleteAttribute('uv'); mb.add(cone, { color: hairC, bones: one('head'), matrix: M4.trs([0, headC + R * 1.02, 0.02], [0.35, 0, 0]) }); }
      break;
    case 'bun': hairCap(); fringe(2); tuft(0, headC + R * 1.0, -R * 0.38, 0.105 * ek, 0.095 * ek, 0.105 * ek);
      mb.add(band(0.075 * ek, 0.025, 0.02, 14), { color: 0xffffff, team: 1, bones: one('head'), matrix: M4.trs([0, headC + R * 0.86, -R * 0.3], [-0.5, 0, 0]) });
      break;
    case 'ponytail': {
      hairCap(); fringe(3);
      const y0 = headC + R * 0.32;
      mb.add(tube([[0, y0, -R * 0.92], [0, y0 - 0.05, -R * 1.18], [0, y0 - 0.2, -R * 1.25], [0, y0 - 0.38, -R * 1.12]], [0.068 * ek, 0.078 * ek, 0.064 * ek, 0.028 * ek], 10),
        { color: hairC, bones: p => two('head', 'hairTip', smoothstep(y0 - 0.03, y0 - 0.22, p.y)) });
      mb.add(band(0.062 * ek, 0.03, 0.022, 12), { color: 0xffffff, team: 1, bones: one('head'), matrix: M4.trs([0, y0 - 0.02, -R * 1.05], [Math.PI / 2 - 0.55, 0, 0]) });
      break; }
    case 'pigtails': hairCap(); fringe(3);
      for (const s of [1, -1]) {
        mb.add(tube([[s * R * 0.82, headC + R * 0.28, -R * 0.2], [s * R * 1.18, headC + R * 0.06, -R * 0.26], [s * R * 1.3, headC - R * 0.42, -R * 0.24]], [0.062 * ek, 0.068 * ek, 0.03 * ek], 9),
          { color: hairC, bones: p => two('head', 'hairTip', smoothstep(headC + R * 0.1, headC - R * 0.4, p.y) * 0.8) });
        mb.add(band(0.055 * ek, 0.028, 0.02, 12), { color: 0xffffff, team: 1, bones: one('head'), matrix: M4.trs([s * R * 1.0, headC + R * 0.2, -R * 0.22], [0, 0, s * 0.9]) });
      }
      break;
    case 'long': hairCap({ k: 1.09, front: 0.38, nape: -0.95 }); fringe(4);
      mb.add(loft([{ y: headC - R * 1.3, rx: 0, cz: -R * 0.45 }, { y: headC - R * 1.22, rx: R * 0.8, rz: R * 0.3, cz: -R * 0.45 }, { y: headC - R * 0.6, rx: R * 1.02, rz: R * 0.48, cz: -R * 0.42 }, { y: headC + R * 0.2, rx: R * 1.06, rz: R * 0.62, cz: -R * 0.42 }, { y: headC + R * 0.5, rx: 0, cz: -R * 0.42 }], 18),
        { color: hairC, bones: p => two('head', 'hairTip', smoothstep(headC - R * 0.2, headC - R * 1.1, p.y) * 0.7) });
      break;
    case 'curly': case 'wild': {
      const big = look.hair === 'wild' ? 1.08 : 1;
      const afro = warp(ellipsoid(R * 1.2 * big, R * 1.06 * big, R * 1.14 * big, 20, 14), v => { const n = v.clone().normalize(); v.multiplyScalar(1 + 0.075 * Math.sin(n.x * 17) * Math.sin(n.y * 15) * Math.sin(n.z * 13 + 1)); });
      // cut the face opening: push vertices in front of / below the hairline inside the head
      warp(afro, v => { const fy = v.y / R; if (v.z > R * 0.2 && fy < 0.35 + 0.0 * v.z) { v.multiplyScalar(0.72); } });
      mb.add(afro, { color: hairC, bones: one('head'), matrix: M4.t(0, headC + R * 0.24, -R * 0.24) });
      break; }
    case 'bald': // a ring of hair at the back and sides
      hairCap({ k: 1.05, front: 0.1, nape: -0.62, crown: { top: 0.18, slope: 0.9 } });
      break;
  }
  if (look.cap) { // flat cap (kasket), team coloured
    mb.add(warp(ellipsoid(HR.x * 1.15, R * 0.6, HR.z * 1.18, 18, 8), v => { if (v.y < 0) v.y *= 0.15; }), { color: grey(1), team: 1, bones: one('head'), matrix: M4.trs([0, headC + R * 0.42, -0.012], [-0.12, 0, 0]) });
    mb.add(warp(ellipsoid(R * 0.74, 0.02, R * 0.42, 16, 5), v => { v.y -= v.z * v.z * 0.8; }), { color: grey(0.78), team: 1, bones: one('head'), matrix: M4.trs([0, headC + R * 0.46, R * 0.98], [0.18, 0, 0]) });
    mb.add(ellipsoid(0.026, 0.016, 0.026, 8, 5), { color: grey(0.85), team: 1, bones: one('head'), matrix: M4.t(0, headC + R * 0.94, -0.02) });
  }
  // ---- team headband hugging the head (tilted: high at the forehead) + knot tails on bandTail
  const wantBand = look.headband ?? !look.cap;
  if (wantBand) {
    const big = look.hair === 'curly' || look.hair === 'wild' ? 1.16 : look.hair === 'bald' ? 0.995 : 1.06;
    const yb = headC + R * 0.36;
    const ring = Math.sqrt(1 - 0.36 * 0.36);
    const g3 = band(HR.x * ring * big + 0.006, 0.058 * ek, 0.026 * ek, 20, HR.z / HR.x, 1);
    mb.add(g3, { color: 0xffffff, team: 1, bones: one('head'), matrix: M4.trs([0, yb, 0.0], [-0.2, 0, 0]) });
    const bz = -HR.z * ring * big - 0.01, by2 = yb - 0.045;
    mb.add(ellipsoid(0.032 * ek, 0.03 * ek, 0.022 * ek, 8, 6), { color: grey(0.85), team: 1, bones: one('head'), matrix: M4.t(0, by2, bz) });
    for (const s of [1, -1]) mb.add(tube([[s * 0.012, by2, bz - 0.005], [s * 0.05 * ek, by2 - 0.06, bz - 0.04], [s * 0.075 * ek, by2 - 0.13, bz - 0.05]], [0.026 * ek, 0.022 * ek, 0.016 * ek].map(r => [r, r * 0.35]), 6),
      { color: grey(0.9), team: 1, bones: p => two('head', 'bandTail', smoothstep(by2 - 0.01, by2 - 0.08, p.y)) });
  }
  const geo = mb.build();
  geo.userData.triangles = mb.triangles;
  return geo;
}
