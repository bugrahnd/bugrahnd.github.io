// Figures: the pullers, helpers, strongmen and the giant.
// Each figure is a plain state object (position, facing, mode, colours) owned by the scene.
// Two renderers draw them:
//  - ProcFigures: procedural capsule-and-sphere figures, all parts GPU-instanced (one draw
//    call per part type for every figure), posed procedurally in a local frame
//    (feet at the origin, facing +x) so hands stay on the rope.
//  - GltfFigures: skinned models from the manifest (puller_a..f, puller_strongman, giant),
//    one pooled clone + AnimationMixer per visible figure, clips cross-faded by mode.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { PULLER_KEYS } from './assets.js';
import { clamp, hash01 } from './util.js';

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xd9a066];
const HAIR = [0x2b1d14, 0x3b2a1a, 0x111111, 0x6b4423, 0xa0522d, 0x222222];
const PANTS = [0x2b2d42, 0x3d405b, 0x1d3557, 0x4a4e69, 0x2f3e46];

/** New figure state object (pooled by the scene). */
export function makeFigure() {
  return {
    active: false, key: '', kind: 'member', team: 1, player: null,
    x: 0, y: 0, z: 0, yaw: 0, tilt: 0, roll: 0, scale: 1,
    mode: 'idle', t: 0, phase: 0, lean: 0, step: 0, speed: 0,
    ropeY: 0.95, ropeLZ: 0, intensity: 0, heave: 0,
    shirt: 0xffffff, pants: 0x2b2d42, skin: 0xf1c27d, hair: 0x222222, band: -1, crown: false,
    girth: 1, modelKey: '', gltf: null, alpha: 1, seed: 0,
    // scene-side behaviour
    tx: 0, tz: 0, state: 'slot', timer: 0, slot: -1, vx: 0, vy: 0, vz: 0, spin: 0, fallDelay: 0, tag: null, tagUntil: 0,
  };
}

/** Per-player look (skin, hair, pants) from a stable seed. */
export function dressFigure(fig, seedStr) {
  const h = hash01(seedStr || String(Math.random()));
  fig.seed = h;
  fig.skin = SKIN[Math.floor(h * SKIN.length) % SKIN.length];
  fig.hair = HAIR[Math.floor(h * 7919) % HAIR.length];
  fig.pants = PANTS[Math.floor(h * 104729) % PANTS.length];
  fig.phase = (h * 0.24) - 0.12; // small rhythm offset
}

// ---------------------------------------------------------------- procedural renderer

const _m = new THREE.Matrix4();
const _root = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _zAxis = new THREE.Vector3(0, 0, 1);
const _e = new THREE.Euler();
const _col = new THREE.Color();

const P = { torso: 0, head: 1, armL: 2, armR: 3, legL: 4, legR: 5, hair: 6 };

export class ProcFigures {
  constructor(scene, capacity = 96) {
    this.capacity = capacity;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const geos = [
      new THREE.CapsuleGeometry(0.2, 0.34, 4, 10), // torso
      new THREE.SphereGeometry(0.16, 12, 9), // head
      new THREE.CapsuleGeometry(0.06, 0.88, 3, 6), // arm (unit length, scaled)
      new THREE.CapsuleGeometry(0.06, 0.88, 3, 6),
      new THREE.CapsuleGeometry(0.08, 0.86, 3, 6), // leg (unit length, scaled)
      new THREE.CapsuleGeometry(0.08, 0.86, 3, 6),
      new THREE.SphereGeometry(0.168, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), // hair cap / headband
    ];
    this.parts = geos.map((g) => {
      const m = new THREE.InstancedMesh(g, mat, capacity);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, _col.set(0xffffff));
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });
    // Captain crown (gold, open 5-point ring).
    const crownGeo = new THREE.CylinderGeometry(0.17, 0.13, 0.16, 5, 1, true);
    crownGeo.translate(0, 0.08, 0);
    this.crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffc83d, emissive: 0x6b4a00, side: THREE.DoubleSide }), 8);
    this.crown.count = 0; this.crown.frustumCulled = false;
    scene.add(this.crown);
    // Blob shadows.
    const sc = document.createElement('canvas'); sc.width = sc.height = 64;
    const sx = sc.getContext('2d');
    const g = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    sx.fillStyle = g; sx.fillRect(0, 0, 64, 64);
    const st = new THREE.CanvasTexture(sc);
    const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false }), capacity + 8);
    this.shadow.count = 0; this.shadow.frustumCulled = false; this.shadow.renderOrder = 1;
    scene.add(this.shadow);
    this.n = 0; this.nCrown = 0; this.nShadow = 0;
  }

  begin() { this.n = 0; this.nCrown = 0; this.nShadow = 0; }

  end() {
    for (const m of this.parts) {
      m.count = this.n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.crown.count = this.nCrown; this.crown.instanceMatrix.needsUpdate = true;
    this.shadow.count = this.nShadow; this.shadow.instanceMatrix.needsUpdate = true;
  }

  _rootMatrix(f) {
    _e.set(f.roll, f.yaw, 0, 'YXZ');
    _q.setFromEuler(_e);
    // Forward tilt (tumbling) about the local z axis.
    _q2.setFromAxisAngle(_zAxis, -f.tilt);
    _q.multiply(_q2);
    _root.compose(_p.set(f.x, f.y, f.z), _q, _s.set(f.scale, f.scale, f.scale));
  }

  _put(part, i, pos, quat, sx, sy, sz, color) {
    _m.compose(pos, quat, _s.set(sx, sy, sz));
    _m.premultiply(_root);
    this.parts[part].setMatrixAt(i, _m);
    this.parts[part].setColorAt(i, _col.setHex(color));
  }

  /** A limb (capsule of unit length) from a to b. */
  _limb(part, i, a, b, w, color) {
    _d.subVectors(b, a);
    const len = Math.max(0.05, _d.length());
    _q.setFromUnitVectors(_up, _d.multiplyScalar(1 / len));
    _p.addVectors(a, b).multiplyScalar(0.5);
    this._put(part, i, _p, _q, w, len, w, color);
  }

  shadowAt(x, z, size, alpha = 1) {
    if (this.nShadow >= this.capacity + 8) return;
    _m.compose(_p.set(x, 0.015, z), _q.identity(), _s.set(size * alpha, 1, size * 0.7 * alpha));
    this.shadow.setMatrixAt(this.nShadow++, _m);
  }

  draw(f) {
    if (this.n >= this.capacity) return;
    const i = this.n++;
    this._rootMatrix(f);
    const t = f.t;
    const g = f.girth;
    let lean = f.lean;
    let hipY = 0.84; let hipX = 0;
    const lat = 0.2 * g;
    let hlx = 0; let hly = 0.8; let hrx = 0; let hry = 0.8; let hz = 0.26; let handsZ = null;
    let flx = 0; let fly = 0.05; let frx = 0; let fry = 0.05; let fz = 0.1;
    const st = f.step;
    switch (f.mode) {
      case 'run': {
        lean = -0.2;
        hipY = 0.84 + Math.abs(Math.sin(st)) * 0.06;
        flx = Math.sin(st) * 0.36; fly = 0.05 + Math.max(0, Math.cos(st)) * 0.16;
        frx = -Math.sin(st) * 0.36; fry = 0.05 + Math.max(0, -Math.cos(st)) * 0.16;
        hlx = -Math.sin(st) * 0.32; hrx = Math.sin(st) * 0.32; hly = hry = 0.92;
        break;
      }
      case 'cheer':
      case 'flex': {
        const j = f.mode === 'cheer' ? Math.max(0, Math.sin(t * 7 + f.seed * 6)) : 0;
        hipY = 0.84 + j * 0.22;
        fly = fry = 0.05 + j * 0.22;
        flx = 0.08; frx = -0.08;
        lean = 0.04 * Math.sin(t * 3);
        if (f.mode === 'flex') { hlx = hrx = 0.05; hly = hry = 1.55; hz = 0.5; } else {
          hlx = hrx = 0.12; hly = hry = 1.95 + j * 0.22 + Math.sin(t * 9) * 0.05; hz = 0.36;
        }
        break;
      }
      case 'fall': {
        lean = -0.1;
        hlx = 0.3 + Math.sin(t * 13) * 0.2; hrx = 0.3 + Math.cos(t * 11) * 0.2; hly = 1.7; hry = 1.6; hz = 0.42;
        flx = 0.3; fly = 0.4; frx = -0.1; fry = 0.25;
        break;
      }
      case 'sit': {
        hipY = 0.26;
        lean = 0.12 + Math.sin(t * 1.7 + f.seed * 5) * 0.12;
        flx = 0.62; fly = 0.1; frx = 0.58; fry = 0.12; fz = 0.17;
        hlx = -0.3; hrx = -0.28; hly = hry = 0.12; hz = 0.32;
        break;
      }
      case 'pull':
      case 'pull_hard':
      case 'pull_slip': {
        // Hips back and down with the lean; hands on the rope; feet braced.
        const s = Math.sin(lean);
        hipX = -s * 0.3 - 0.04;
        hipY = 0.84 - s * 0.2;
        const ry = (f.ropeY - f.y) / f.scale;
        hlx = 0.46 - s * 0.1; hrx = 0.2 - s * 0.12; hly = hry = ry;
        handsZ = f.ropeLZ / f.scale;
        flx = 0.42; frx = -0.3; fz = 0.11;
        if (f.mode === 'pull') {
          // Stepping back while winning ground.
          const k = clamp(f.speed * 4, 0, 1);
          flx += Math.sin(st) * 0.12 * k; fly = 0.05 + Math.max(0, Math.sin(st)) * 0.1 * k;
          frx += Math.sin(st + Math.PI) * 0.12 * k; fry = 0.05 + Math.max(0, Math.sin(st + Math.PI)) * 0.1 * k;
        } else if (f.mode === 'pull_slip') {
          // Dragged: feet skid forward, body jerks.
          flx = 0.55 + Math.sin(t * 11 + f.seed * 9) * 0.05; frx = -0.05 + Math.sin(t * 8) * 0.08;
          hipY -= 0.04;
        } else {
          flx += Math.sin(t * 30 + f.seed * 7) * 0.01; // tremble
        }
        break;
      }
      default: { // idle
        lean = 0.03 * Math.sin(t * 1.4 + f.seed * 6);
        hipY = 0.84 + Math.sin(t * 2 + f.seed * 3) * 0.01;
        hlx = 0.04; hrx = 0.04; hly = hry = 0.78; hz = 0.27;
        flx = 0.03; frx = -0.03;
      }
    }
    // Torso axis.
    const dx = -Math.sin(lean); const dy = Math.cos(lean);
    const hip = _a.set(hipX, hipY, 0);
    // torso
    _q.setFromAxisAngle(_d.set(0, 0, 1), lean);
    _p.set(hip.x + dx * 0.32, hip.y + dy * 0.32, 0);
    this._put(P.torso, i, _p, _q, g, 1, g * 0.9, f.shirt);
    // head
    const hx = hip.x + dx * 0.8; const hy = hip.y + dy * 0.8;
    _q.identity();
    this._put(P.head, i, _p.set(hx, hy, 0), _q, 1, 1, 1, f.skin);
    // hair cap / headband
    _q.setFromAxisAngle(_d.set(0, 0, 1), lean * 0.8);
    this._put(P.hair, i, _p.set(hx - 0.01, hy + 0.015, 0), _q, 1, 1, 1, f.band >= 0 ? f.band : f.hair);
    // arms
    const shY = hip.y + dy * 0.56; const shX = hip.x + dx * 0.56;
    const zl = handsZ !== null ? handsZ : hz; const zr = handsZ !== null ? handsZ : -hz;
    const w = 0.95 + (g - 1) * 1.4;
    _b.set(hlx, hly, zl);
    this._limb(P.armL, i, _a.set(shX, shY, lat), _b, w, f.skin);
    _b.set(hrx, hry, zr);
    this._limb(P.armR, i, _a.set(shX, shY, -lat), _b, w, f.skin);
    // legs
    _b.set(flx, fly, fz);
    this._limb(P.legL, i, _a.set(hipX, hipY, 0.09 * g), _b, 1 + (g - 1) * 0.8, f.pants);
    _b.set(frx, fry, -fz);
    this._limb(P.legR, i, _a.set(hipX, hipY, -0.09 * g), _b, 1 + (g - 1) * 0.8, f.pants);
    // crown
    if (f.crown && this.nCrown < 8) {
      _q.setFromAxisAngle(_d.set(0, 0, 1), lean);
      _m.compose(_p.set(hx, hy + 0.12, 0), _q, _s.set(1, 1, 1));
      _m.premultiply(_root);
      this.crown.setMatrixAt(this.nCrown++, _m);
    }
    if (f.y < 0.4) this.shadowAt(f.x, f.z, 0.9 * f.scale * g, clamp(1 - f.y, 0.3, 1));
  }
}

// ---------------------------------------------------------------- glTF renderer

const CLIP_FOR = {
  idle: ['idle'], run: ['run', 'walk'], pull: ['pull', 'pull_hard'], pull_hard: ['pull_hard', 'pull'],
  pull_slip: ['pull_slip', 'pull'], cheer: ['cheer', 'idle'], flex: ['cheer', 'idle'], fall: ['fall', 'pull_slip'], sit: ['sit_dazed', 'idle'],
};
const HEIGHT = 1.75; // world height of a puller at scale 1

export class GltfFigures {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.pool = new Map(); // modelKey -> [instances]
    this.matCache = new Map(); // model|team|color -> material
    this.pullerKeys = PULLER_KEYS.filter((k) => assets.model(k)?.skinned);
    this.used = new Set();
  }

  /** Model key for a figure, or '' when no model exists (procedural). */
  keyFor(fig) {
    if (fig.kind === 'strongman' && this.assets.model('puller_strongman')) return 'puller_strongman';
    if (fig.kind === 'giant' && this.assets.model('giant')) return 'giant';
    if (fig.kind === 'giant' || fig.kind === 'strongman') return this.pullerKeys.length ? this.pullerKeys[0] : '';
    if (!this.pullerKeys.length) return '';
    return this.pullerKeys[Math.floor(fig.seed * 9973) % this.pullerKeys.length];
  }

  get available() { return this.pullerKeys.length > 0; }

  _acquire(key) {
    const list = this.pool.get(key) || [];
    let inst = list.pop();
    if (!inst) {
      const info = this.assets.model(key);
      const root = SkeletonUtils.clone(info.gltf.scene);
      const mixer = new THREE.AnimationMixer(root);
      const teamMeshes = [];
      root.traverse((o) => { if (o.isMesh && o.material?.userData?.isTeam) teamMeshes.push(o); });
      inst = { key, root, mixer, info, actions: new Map(), cur: null, curName: '', teamMeshes, color: -1, h: info.size.y || 1, minY: info.minY || 0 };
    }
    this.scene.add(inst.root);
    return inst;
  }

  release(fig) {
    const inst = fig.gltf;
    if (!inst) return;
    fig.gltf = null;
    this.scene.remove(inst.root);
    inst.mixer.stopAllAction();
    inst.cur = null; inst.curName = '';
    if (!this.pool.has(inst.key)) this.pool.set(inst.key, []);
    this.pool.get(inst.key).push(inst);
  }

  _tint(inst, color) {
    if (inst.color === color) return;
    inst.color = color;
    for (const o of inst.teamMeshes) {
      const ck = `${inst.key}|${o.material.name}|${color}`;
      let m = this.matCache.get(ck);
      if (!m) { m = o.material.clone(); m.color.setHex(color); this.matCache.set(ck, m); }
      o.material = m;
    }
  }

  _play(inst, mode) {
    const names = CLIP_FOR[mode] || ['idle'];
    let name = '';
    for (const n of names) if (inst.info.clips.has(n)) { name = n; break; }
    if (!name) name = inst.info.clips.keys().next().value || '';
    if (!name || name === inst.curName) return;
    let act = inst.actions.get(name);
    if (!act) { act = inst.mixer.clipAction(inst.info.clips.get(name)); inst.actions.set(name, act); }
    act.reset();
    act.setLoop(mode === 'fall' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    act.clampWhenFinished = true;
    act.time = ((act.getClip().duration || 1) * ((0.5 + (inst.phaseOff || 0)) % 1));
    act.play();
    if (inst.cur) inst.cur.crossFadeTo(act, 0.25, false);
    inst.cur = act; inst.curName = name;
  }

  /** Draw (position/animate) one figure; returns false when it must be drawn procedurally. */
  draw(fig, dt) {
    if (!fig.modelKey) return false;
    if (!fig.gltf) { fig.gltf = this._acquire(fig.modelKey); fig.gltf.phaseOff = fig.seed; }
    const inst = fig.gltf;
    this._tint(inst, fig.shirt);
    this._play(inst, fig.mode);
    // Pull intensity speeds the clip up a little.
    if (inst.cur) inst.cur.timeScale = fig.mode.startsWith('pull') ? 0.85 + fig.intensity * 0.4 : 1;
    inst.mixer.update(dt);
    const k = (HEIGHT / inst.h) * fig.scale;
    inst.root.scale.setScalar(k);
    inst.root.position.set(fig.x, fig.y - inst.minY * k, fig.z);
    inst.root.rotation.set(0, 0, 0);
    inst.root.rotateY(fig.yaw + Math.PI / 2); // models face +Z, figures face local +X
    inst.root.rotateX(fig.tilt);
    return true;
  }
}
