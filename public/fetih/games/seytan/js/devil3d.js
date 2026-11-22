// The 3D devil: a horned jinn whose lower body is smoke and smokeless fire (shader cones), with a
// muscular torso, ridged horns, glowing eyes, expressions (smirk, hurt, laugh, dazed, scared), arm
// poses, a flickering fire light that lights the courtyard, and glowing cracks as his health drops.
import * as THREE from 'three';
import { makeNoise, pixelCanvas } from './noise.js';
import { radialTexture } from './world3d.js';

export const DEVIL_BASE = 0.85;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const NOISE_GLSL = `
  float h3(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h3(i), h3(i+vec2(1,0)), f.x), mix(h3(i+vec2(0,1)), h3(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }`;

const CONE_VERT = `
  uniform float uTime; varying vec2 vUv; varying float vK; varying vec3 vN;
  void main(){
    vUv = uv;
    vec3 p = position;
    // the cone's apex (+y) becomes the tail tip after the mesh is flipped; its base is the waist
    float kk = clamp((p.y + 1.4) / 2.8, 0.0, 1.0); // 0 at the waist, 1 at the tail tip
    vK = 1.0 - kk;
    p.x += sin(uTime * 1.7 + kk * 4.0) * 0.28 * kk;
    p.z += cos(uTime * 1.3 + kk * 3.0) * 0.12 * kk;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

function skinTexture() {
  const n = makeNoise(7);
  return pixelCanvas(256, 128, (x, y) => {
    const v = n.fbm(x * 0.05, y * 0.08, 4);
    const k = 0.8 + v * 0.4;
    return [180 * k, 70 * k, 52 * k, 255];
  });
}

function hornGeo(s) {
  const curve = new THREE.CatmullRomCurve3([V(s * 0.2, 0.26, 0.02), V(s * 0.52, 0.42, 0.07), V(s * 0.78, 0.84, 0.02), V(s * 0.72, 1.24, -0.06), V(s * 0.52, 1.46, -0.1)]);
  const N = 44; const R = 10;
  const geo = new THREE.TubeGeometry(curve, N, 0.13, R, false);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    const t = i / N; const c = curve.getPointAt(t);
    const taper = (1 - t) * 0.94 + 0.06;
    const ring = i % 4 === 0 ? 0.62 : 1;
    for (let j = 0; j <= R; j++) {
      const idx = i * (R + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(taper).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
      const k = Math.pow(t, 1.3);
      col[idx * 3] = (0.1 + k * 0.78) * ring; col[idx * 3 + 1] = (0.07 + k * 0.72) * ring; col[idx * 3 + 2] = (0.05 + k * 0.6) * ring;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

export class Devil3D {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    const body = new THREE.Group(); this.root.add(body); this.body = body;

    const skinMap = new THREE.CanvasTexture(skinTexture()); skinMap.colorSpace = THREE.SRGBColorSpace;
    const skin = new THREE.MeshStandardMaterial({ color: 0xb8402c, map: skinMap, bumpMap: skinMap, bumpScale: 1.5, roughness: 0.48, metalness: 0.05, emissive: 0x200402 });
    const skinDark = new THREE.MeshStandardMaterial({ color: 0x4a120c, roughness: 0.6 });
    const black = new THREE.MeshBasicMaterial({ color: 0x080000 });
    const ivory = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.35 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb030, toneMapped: false });
    const hornMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.1 });
    this.skin = skin; this.eyeMat = eyeMat;
    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m;
    };

    // --- torso: a tapered ellipsoid with pecs and abs
    const tg = new THREE.SphereGeometry(1, 40, 30);
    const tp = tg.attributes.position; const v = new THREE.Vector3();
    for (let i = 0; i < tp.count; i++) {
      v.fromBufferAttribute(tp, i);
      const w = v.y > 0 ? 1 + 0.18 * v.y : 1 + 0.42 * v.y;
      tp.setXYZ(i, v.x * 0.8 * w, v.y * 0.68, v.z * 0.46 * (v.y > 0 ? 1 : 1 + 0.25 * v.y));
    }
    tg.computeVertexNormals();
    mesh(tg, skin, body);
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(1, 20, 14), skin, body, s * 0.28, 0.24, 0.27, 0.33, 0.2, 0.17);
    for (let row = 0; row < 3; row++) for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(1, 12, 8), skin, body, s * 0.1, -0.06 - row * 0.17, 0.34 - row * 0.03, 0.1, 0.075, 0.055);
    // glowing cracks (appear as health drops)
    const crackMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, toneMapped: false, transparent: true, opacity: 0 });
    this.crackMat = crackMat;
    this.cracks = [];
    const onTorso = (x, y) => V(x, y, 0.46 * Math.sqrt(Math.max(0, 1 - (x / 0.86) ** 2 - (y / 0.68) ** 2)) + 0.03);
    for (const pts of [[[-0.32, 0.1], [-0.2, -0.05], [-0.26, -0.2], [-0.14, -0.36]], [[0.3, 0.2], [0.18, 0.05], [0.27, -0.1]], [[0.02, -0.22], [0.12, -0.38], [0.05, -0.5]], [[-0.5, 0.3], [-0.42, 0.12]], [[0.5, -0.05], [0.4, -0.22], [0.47, -0.36]]]) {
      const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => onTorso(x, y)));
      const m = new THREE.Mesh(new THREE.TubeGeometry(c, 12, 0.014, 5, false), crackMat);
      m.visible = false; body.add(m); this.cracks.push(m);
    }

    // --- shoulders and arms
    this.arms = {};
    for (const s of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.27, 20, 14), skin, body, s * 0.8, 0.4, 0);
      const sh = new THREE.Group(); sh.position.set(s * 0.84, 0.38, 0); body.add(sh);
      mesh(new THREE.CapsuleGeometry(0.155, 0.48, 6, 14), skin, sh, 0, -0.36, 0);
      const el = new THREE.Group(); el.position.set(0, -0.7, 0); sh.add(el);
      mesh(new THREE.CapsuleGeometry(0.125, 0.44, 6, 14), skin, el, 0, -0.32, 0);
      const hand = new THREE.Group(); hand.position.set(0, -0.66, 0); el.add(hand);
      mesh(new THREE.SphereGeometry(0.14, 14, 10), skin, hand, 0, 0, 0, 1, 1.1, 0.8);
      for (let k = -1.5; k <= 1.5; k++) {
        const claw = mesh(new THREE.ConeGeometry(0.026, 0.2, 6), black, hand, k * 0.06, -0.17, 0.04);
        claw.rotation.x = Math.PI + 0.3; claw.rotation.z = k * 0.12;
      }
      this.arms[s] = { sh, el, cur: { srx: 0, srz: 0, erx: 0, erz: 0 } };
    }

    // --- neck and head
    mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.38, 16), skin, body, 0, 0.74, 0);
    const head = new THREE.Group(); head.position.set(0, 1.12, 0.02); body.add(head); this.head = head;
    const hg = new THREE.SphereGeometry(0.42, 40, 30);
    const hp = hg.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      v.fromBufferAttribute(hp, i);
      let { x, y, z } = v;
      if (y < 0) { x *= 1 + (y / 0.42) * 0.42; z += (-y) * 0.22; }
      if (Math.abs(x) > 0.24 && y > -0.12 && y < 0.06) x *= 1.06;
      y *= y > 0 ? 1.0 : 1.18;
      hp.setXYZ(i, x, y, z);
    }
    hg.computeVertexNormals();
    mesh(hg, skin, head, 0, 0, 0, 1, 1.08, 1);
    mesh(new THREE.SphereGeometry(1, 20, 10), skinDark, head, 0, 0.13, 0.31, 0.36, 0.07, 0.11);
    this.brows = {};
    for (const s of [-1, 1]) {
      const b = new THREE.Group(); b.position.set(s * 0.15, 0.12, 0.37); head.add(b);
      mesh(new THREE.BoxGeometry(0.27, 0.06, 0.1), skinDark, b);
      this.brows[s] = b;
    }
    this.eyes = {};
    for (const s of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.1, 14, 10), black, head, s * 0.15, 0.03, 0.31, 1.35, 0.85, 0.55);
      const e = mesh(new THREE.SphereGeometry(0.068, 16, 10), eyeMat, head, s * 0.15, 0.03, 0.355, 1.45, 0.72, 0.55);
      e.castShadow = false;
      const pupil = mesh(new THREE.BoxGeometry(0.014, 0.085, 0.01), black, head, s * 0.15 + s * 0.008, 0.03, 0.395);
      pupil.castShadow = false;
      this.eyes[s] = { e, pupil };
    }
    mesh(new THREE.ConeGeometry(0.05, 0.14, 8), skin, head, 0, -0.07, 0.43).rotation.x = Math.PI / 2 + 0.5;
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.08, 0.42, 8), skin, head, s * 0.44, 0.05, -0.02, 1, 1, 0.45);
      ear.rotation.z = -s * (Math.PI / 2 + 0.3); ear.rotation.y = s * 0.3;
      mesh(hornGeo(s), hornMat, head);
    }
    const beard = mesh(new THREE.ConeGeometry(0.075, 0.26, 8), black, head, 0, -0.55, 0.26);
    beard.rotation.x = Math.PI - 0.35;
    // mouths
    const mouth = new THREE.Group(); mouth.position.set(0, -0.24, 0.415); head.add(mouth); this.mouth = mouth;
    const grinCurve = new THREE.CatmullRomCurve3([V(-0.16, 0.035, -0.02), V(-0.05, -0.02, 0.01), V(0.06, -0.015, 0.01), V(0.17, 0.05, -0.02)]);
    this.grin = new THREE.Group(); mouth.add(this.grin);
    mesh(new THREE.TubeGeometry(grinCurve, 16, 0.019, 6, false), black, this.grin);
    const fang = mesh(new THREE.ConeGeometry(0.018, 0.07, 6), ivory, this.grin, 0.1, -0.04, 0.01); fang.rotation.x = Math.PI;
    this.open = new THREE.Group(); mouth.add(this.open);
    const hole = mesh(new THREE.CircleGeometry(0.13, 24), black, this.open, 0, -0.04, 0.005); hole.castShadow = false;
    this.throat = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), new THREE.MeshBasicMaterial({ color: 0xff7a20, toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.throat.position.set(0, -0.05, 0.01); this.open.add(this.throat);
    this.teeth = [];
    for (const [x, y, rot, s] of [[-0.09, 0.07, Math.PI, 1.3], [0.09, 0.07, Math.PI, 1.3], [-0.03, 0.08, Math.PI, 0.8], [0.03, 0.08, Math.PI, 0.8], [-0.06, -0.15, 0, 0.8], [0.06, -0.15, 0, 0.8]]) {
      const t = mesh(new THREE.ConeGeometry(0.018 * s, 0.06 * s, 6), ivory, this.open, x, y, 0.012); t.rotation.z = rot; t.castShadow = false; this.teeth.push(t);
    }

    // --- smoke and fire lower body
    const coneGeo = new THREE.ConeGeometry(0.74, 2.8, 36, 18, true);
    this.smokeMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: CONE_VERT,
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vK; varying vec3 vN; ${NOISE_GLSL}
        void main(){
          float n = fbm(vec2(vUv.x * 7.0, vUv.y * 3.0 - uTime * 1.1));
          float body = pow(vK, 0.7);
          float a = body * smoothstep(0.22, 0.7, n + body * 0.35) * 0.96;
          vec3 c = mix(vec3(0.03, 0.012, 0.012), vec3(0.12, 0.04, 0.03), n);
          c += vec3(1.0, 0.35, 0.08) * smoothstep(0.78, 0.92, n) * body * 1.5;
          gl_FragColor = vec4(c, a);
        }`,
    });
    const smoke = new THREE.Mesh(coneGeo, this.smokeMat);
    smoke.rotation.x = Math.PI; smoke.position.y = -0.5 - 1.4; body.add(smoke);
    this.fireMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAmp: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: CONE_VERT,
      fragmentShader: `uniform float uTime; uniform float uAmp; varying vec2 vUv; varying float vK; varying vec3 vN; ${NOISE_GLSL}
        void main(){
          float n = fbm(vec2(vUv.x * 9.0, vUv.y * 2.4 - uTime * 2.4));
          float fres = 1.0 - abs(vN.z);
          float f = smoothstep(0.42, 0.85, n) * pow(vK, 1.4) * (0.35 + fres * 1.2) * uAmp;
          vec3 c = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.8, 0.35), smoothstep(0.6, 0.95, n));
          gl_FragColor = vec4(c * f * 2.2, 1.0);
        }`,
    });
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.66, 2.5, 36, 18, true), this.fireMat);
    fire.rotation.x = Math.PI; fire.position.y = -0.5 - 1.25; fire.scale.set(1.05, 1, 1.05); body.add(fire);

    // --- fire light, aura, dazed sparks
    this.light = new THREE.PointLight(0xff6a2a, 9, 8, 2);
    this.light.position.set(0, -0.6, 0.8); body.add(this.light);
    const rt = radialTexture();
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: rt, color: 0xff5a20, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.aura.scale.set(4.6, 5.6, 1); this.aura.position.set(0, -0.2, -0.5); body.add(this.aura);
    this.sparks = [];
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: rt, color: 0xffe08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      sp.scale.setScalar(0.22); sp.visible = false; head.add(sp); this.sparks.push(sp);
    }
    this.root.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
    smoke.castShadow = false; fire.castShadow = false;
    this.mouthOpen = 0;
  }

  /** s: { pos {x,y,z}, scale, rot, alpha, dir, face, arms, flash, hpFrac, t, moving } */
  update(s, dt) {
    const t = s.t;
    const r = this.root;
    r.visible = s.alpha > 0.02;
    if (!r.visible) return;
    r.position.set(s.pos.x, s.pos.y, s.pos.z);
    r.scale.setScalar(DEVIL_BASE * s.scale * (s.flash > 0.5 ? 1.04 : 1));
    r.rotation.z = s.rot;
    const yawT = s.dir * 0.32 + Math.sin(t * 0.6) * 0.06;
    r.rotation.y += (yawT - r.rotation.y) * Math.min(1, dt * 5);
    this.body.position.y = Math.sin(t * 2.6) * 0.08;
    this.body.rotation.z = Math.sin(t * 1.3) * 0.03;
    this.smokeMat.uniforms.uTime.value = t; this.fireMat.uniforms.uTime.value = t;
    this.fireMat.uniforms.uAmp.value = s.face === 'laugh' ? 1.5 : 1;
    this.light.intensity = (8 + Math.sin(t * 17) * 1.4 + Math.sin(t * 7.3) * 1.2) * (s.face === 'laugh' ? 1.4 : 1) * s.alpha;
    this.aura.material.opacity = (s.face === 'laugh' ? 0.5 : 0.32) * s.alpha;

    // hit flash and cracks
    const f = s.flash;
    this.skin.emissive.setRGB(0.13 + f * 0.9, 0.02 + f * 0.55, 0.01 + f * 0.4);
    const crack = Math.max(0, (0.5 - s.hpFrac) * 2);
    const nShow = Math.ceil(crack * this.cracks.length);
    this.cracks.forEach((m, i) => { m.visible = i < nShow; });
    this.crackMat.opacity = crack > 0 ? 0.7 + 0.3 * Math.sin(t * 6) : 0;

    // arms
    const poses = armPose(s.arms, t);
    for (const side of [-1, 1]) {
      const a = this.arms[side]; const p = poses[side]; const k = Math.min(1, dt * 10);
      for (const key of ['srx', 'srz', 'erx', 'erz']) a.cur[key] += (p[key] - a.cur[key]) * k;
      a.sh.rotation.set(a.cur.srx, 0, a.cur.srz);
      a.el.rotation.set(a.cur.erx, 0, a.cur.erz);
    }

    // face
    const face = s.face;
    const shake = face === 'laugh' ? Math.sin(t * 26) * 0.08 : face === 'hurt' ? Math.sin(t * 40) * 0.1 : Math.sin(t * 1.4) * 0.04;
    this.head.rotation.set(face === 'laugh' ? -0.18 : face === 'hurt' ? 0.12 : 0, Math.sin(t * 0.9) * 0.08, shake);
    const angry = face === 'scared' || face === 'hurt' ? -1 : 1;
    for (const side of [-1, 1]) {
      this.brows[side].rotation.z = side * -0.38 * angry;
      this.brows[side].position.y = face === 'scared' ? 0.17 : 0.12;
      const e = this.eyes[side];
      const sy = face === 'hurt' ? 0.18 : face === 'laugh' ? 0.3 : face === 'scared' ? 1.05 : face === 'dazed' ? 0.4 : 0.72;
      e.e.scale.y += (sy - e.e.scale.y) * Math.min(1, dt * 14);
      e.e.rotation.z = face === 'scared' ? 0 : side * 0.28;
      e.pupil.visible = face !== 'hurt' && face !== 'laugh';
      e.pupil.position.x = side * 0.158 + (face === 'dazed' ? Math.sin(t * 4 + side) * 0.03 : 0);
    }
    this.eyeMat.color.setRGB(1, face === 'dazed' ? 0.4 : 0.69, face === 'dazed' ? 0.12 : 0.19);
    const openT = face === 'laugh' ? 0.7 + Math.abs(Math.sin(t * 16)) * 0.45 : face === 'hurt' ? 0.38 : face === 'scared' ? 0.55 : face === 'dazed' ? 0.2 : 0;
    this.mouthOpen += (openT - this.mouthOpen) * Math.min(1, dt * 14);
    this.grin.visible = this.mouthOpen < 0.12;
    this.open.visible = !this.grin.visible;
    this.open.scale.set(face === 'scared' ? 0.6 : 1.15, Math.max(0.12, this.mouthOpen), 1);
    this.throat.material.opacity = face === 'laugh' ? 0.95 : 0.4;
    for (const [i, sp] of this.sparks.entries()) {
      sp.visible = face === 'dazed';
      const a = t * 4.5 + i * Math.PI / 2;
      sp.position.set(Math.cos(a) * 0.7, 0.75 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.4);
    }
  }

  /** World position of the head (for name popups and effects). */
  headWorld(out = new THREE.Vector3()) { return this.head.getWorldPosition(out); }
}

function armPose(pose, t) {
  const out = {};
  for (const s of [-1, 1]) {
    let p;
    if (pose === 'up') p = { srx: -0.25, srz: s * 2.55, erx: -0.2, erz: s * 0.5 + Math.sin(t * 20 + s) * 0.12 };
    else if (pose === 'belly') p = { srx: -0.55, srz: s * 0.32, erx: -1.65, erz: -s * 0.55 + Math.sin(t * 18) * 0.08 };
    else if (pose === 'wave' && s === 1) p = { srx: -0.25, srz: 2.25, erx: -0.1, erz: 0.85 + Math.sin(t * 6) * 0.35 };
    else p = { srx: 0.1, srz: s * 0.6, erx: 0.35, erz: -s * 1.85 };
    out[s] = p;
  }
  return out;
}
