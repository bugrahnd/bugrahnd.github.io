// Visual source adapter: the ONE place that decides where characters and the tractor come
// from. Order of preference:
//   1. code generators in assets/gen/ (createPuller, createStrongman, createGiant,
//      createTractor, createArena, createRope, createCrowd; see assets/gen/README.md)
//   2. glTF models listed in assets/manifest.json (puller_a..f, puller_strongman, giant, tractor)
//   3. the built-in procedural figures (figures.js ProcFigures) and the box tractor below.
// A generator that throws only disables itself: that kind falls back to the next source.
import * as THREE from 'three';
import { GltfFigures } from './figures.js';

const GEN_ENTRY = '../assets/gen/index.js';
const HEIGHT = 1.75; // world height of a puller at figure scale 1
// Generated characters face +Z (figures face local +X).
const FACING_OFFSET = Math.PI / 2;

/** The generator module, or null when it does not exist (yet). */
export async function loadGenerators() {
  try {
    const mod = await import(GEN_ENTRY);
    if (mod && typeof mod.createPuller === 'function') return mod;
    console.warn('[halat] assets/gen bulundu ama createPuller yok; yedek figürler kullanılıyor');
  } catch (e) { console.warn('[halat] assets/gen yüklenemedi; yedek figürler kullanılıyor', e?.message || e); }
  return null;
}

/** Figure renderer for the non-procedural path (generators first, then glTF). */
export function createFigureSource(scene, assets, gen, opts = {}) {
  if (gen) return new GenFigures(scene, gen, opts);
  return new GltfFigures(scene, assets);
}

/** Clip per figure mode (first one the model has wins). */
const CLIP_FOR = {
  idle: ['idle'], run: ['run', 'idle'], pull: ['pull', 'pull_hard'], pull_hard: ['pull_hard', 'pull'],
  pull_slip: ['pull_slip', 'pull'], cheer: ['cheer', 'idle'], flex: ['flex', 'cheer', 'idle'], stomp: ['stomp', 'flex', 'idle'],
  fall: ['fall', 'pull_slip'], sit: ['sit_dazed', 'idle'], sad: ['sit_dazed', 'idle'],
};
/** Default expression per mode (the scene may override with fig.expr). */
const EXPRESSION_FOR = {
  pull: 'determined', pull_hard: 'strain', pull_slip: 'worried', cheer: 'happy', flex: 'happy', stomp: 'strain',
  fall: 'shock', sit: 'dazed', sad: 'sad', idle: 'neutral', run: 'determined',
};
const PULL_MODES = new Set(['pull', 'pull_hard', 'pull_slip']);

/** Captain crown: small gold ring with five points (one shared geometry/material). */
let CROWN = null;
function crownMesh() {
  if (!CROWN) {
    const g = new THREE.CylinderGeometry(0.15, 0.12, 0.13, 10, 1, true);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0) {
        const a = Math.atan2(pos.getZ(i), pos.getX(i));
        const spike = Math.pow(Math.abs(Math.cos(a * 2.5)), 6);
        pos.setY(i, pos.getY(i) + spike * 0.09);
      }
    }
    g.computeVertexNormals();
    g.translate(0, 0.05, 0);
    CROWN = { g, m: new THREE.MeshToonMaterial({ color: 0xffc83d, emissive: 0x7a5200, side: THREE.DoubleSide }) };
  }
  const m = new THREE.Mesh(CROWN.g, CROWN.m);
  m.name = 'crown';
  return m;
}

/**
 * Characters from the code generators: pooled per (kind, look), one AnimationMixer each.
 * Per frame the scene sets on the figure: mode, ropeSide ('L'|'R'), ropeY (world rope height
 * at the hands), expr (optional expression override), crown, scale, x/y/z, yaw, tilt.
 * After draw() the figure has headX/headY/headZ (world top of head).
 */
class GenFigures {
  constructor(scene, gen, { shadows = false } = {}) {
    this.scene = scene;
    this.gen = gen;
    this.shadows = shadows;
    this.looks = Array.isArray(gen.pullerLooks) && gen.pullerLooks.length ? gen.pullerLooks : [null];
    this.pool = new Map();
    this.broken = new Set(); // generator kinds that threw: procedural fallback
    this._v = new THREE.Vector3();
    this.live = 0;
  }

  get available() { return true; }

  keyFor(fig) {
    let key;
    if (fig.kind === 'strongman') key = 'strongman';
    else if (fig.kind === 'giant') key = 'giant';
    else key = `puller:${Math.floor(fig.seed * 9973) % this.looks.length}`;
    return this.broken.has(key.split(':')[0]) ? '' : key;
  }

  /** Lateral distance (world units) between a figure's centre and the rope for its kind and scale. */
  gripOffset(kind, scale) {
    const g = this.gen.gripFor ? this.gen.gripFor(kind === 'strongman' || kind === 'giant' ? kind : 'puller') : { x: -0.24, height: HEIGHT };
    return Math.abs(g.x) * (HEIGHT / (g.height || HEIGHT)) * scale;
  }

  _create(key, fig) {
    const g = this.gen;
    const opts = { teamColor: fig.shirt, seed: Math.floor(fig.seed * 1e6), ropeSide: fig.ropeSide || 'R' };
    let m;
    if (key === 'strongman') m = (g.createStrongman || g.createPuller)(opts);
    else if (key === 'giant') m = (g.createGiant || g.createStrongman || g.createPuller)(opts);
    else {
      const look = this.looks[Number(key.split(':')[1]) || 0];
      m = g.createPuller(look !== null && look !== undefined ? { ...opts, look: look.id ?? look } : opts);
    }
    const root = m.object3D;
    root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = this.shadows; } });
    const box = new THREE.Box3().setFromObject(root);
    const h = Math.max(0.01, box.max.y - box.min.y);
    const inst = { key, model: m, root, mixer: new THREE.AnimationMixer(root), clips: new Map(), actions: new Map(), cur: null, curName: '', color: -1, expr: '', h, minY: box.min.y, side: m.ropeSide || 'R', crown: null };
    this._loadClips(inst);
    return inst;
  }

  _loadClips(inst) {
    inst.clips.clear();
    for (const [name, c] of Object.entries(inst.model.clips || {})) if (c && c.tracks) inst.clips.set(name, c);
  }

  release(fig) {
    const inst = fig.gltf;
    if (!inst) return;
    fig.gltf = null;
    this.live--;
    this.scene.remove(inst.root);
    inst.mixer.stopAllAction();
    inst.cur = null; inst.curName = '';
    if (inst.crown) inst.crown.visible = false;
    if (!this.pool.has(inst.key)) this.pool.set(inst.key, []);
    this.pool.get(inst.key).push(inst);
  }

  _play(inst, mode, phase) {
    let name = '';
    for (const n of CLIP_FOR[mode] || ['idle']) if (inst.clips.has(n)) { name = n; break; }
    if (!name || name === inst.curName) return;
    let act = inst.actions.get(name);
    if (!act) { act = inst.mixer.clipAction(inst.clips.get(name)); inst.actions.set(name, act); }
    act.reset();
    const once = name === 'fall';
    act.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    act.clampWhenFinished = true;
    // Looping clips start at the figure's own phase so a line never moves in lockstep.
    act.time = once ? 0 : (act.getClip().duration || 1) * phase;
    act.play();
    if (inst.cur) inst.cur.crossFadeTo(act, name === 'fall' ? 0.12 : 0.25, false);
    inst.cur = act; inst.curName = name;
  }

  draw(fig, dt) {
    if (!fig.modelKey) return false;
    if (!fig.gltf) {
      const list = this.pool.get(fig.modelKey);
      let inst = list && list.pop();
      if (!inst) {
        try { inst = this._create(fig.modelKey, fig); } catch (e) {
          const kind = fig.modelKey.split(':')[0];
          console.warn(`[halat] ${kind} üreticisi hata verdi; yedek figür kullanılıyor`, e);
          this.broken.add(kind);
          fig.modelKey = '';
          return false;
        }
      }
      fig.gltf = inst;
      this.live++;
      inst.phaseOff = fig.seed;
      this.scene.add(inst.root);
    }
    const inst = fig.gltf;
    const model = inst.model;
    // Rope side (only changes when a figure changes slot).
    const side = fig.ropeSide === 'L' ? 'L' : 'R';
    if (inst.side !== side && model.setRopeSide) {
      model.setRopeSide(side);
      inst.side = side;
      this._loadClips(inst);
      inst.mixer.stopAllAction();
      for (const a of inst.actions.values()) inst.mixer.uncacheAction(a.getClip());
      inst.actions.clear();
      inst.cur = null; inst.curName = '';
    }
    if (inst.color !== fig.shirt) { inst.color = fig.shirt; try { model.setTeamColor?.(fig.shirt); } catch { /* keep */ } }
    const expr = fig.expr || EXPRESSION_FOR[fig.mode] || 'neutral';
    if (expr !== inst.expr) { inst.expr = expr; try { model.setExpression?.(expr); } catch { /* keep */ } }
    this._play(inst, fig.mode, inst.phaseOff || 0);
    if (inst.cur) {
      const pulling = PULL_MODES.has(fig.mode);
      inst.cur.timeScale = pulling ? 0.8 + (fig.intensity || 0) * 0.45 : fig.mode === 'run' ? (fig.runRate || 1) : 1;
    }
    inst.mixer.update(dt);
    const k = (HEIGHT / inst.h) * fig.scale;
    inst.root.scale.setScalar(k);
    inst.root.position.set(fig.x, fig.y - inst.minY * k, fig.z);
    inst.root.rotation.set(0, 0, 0);
    inst.root.rotateY(fig.yaw + FACING_OFFSET);
    inst.root.rotateX(fig.tilt);
    // Fists exactly on the rope (the rope sags and figures are scaled).
    if (PULL_MODES.has(fig.mode) && model.gripTo && Number.isFinite(fig.ropeY) && !fig.noGrip) {
      try { model.gripTo((fig.ropeY - fig.y) / k); } catch { /* keep the clip pose */ }
    } else inst.root.updateMatrixWorld(true);
    // Captain crown on the head.
    if (fig.crown && model.attach?.head) {
      if (!inst.crown) { inst.crown = crownMesh(); model.attach.head.add(inst.crown); }
      inst.crown.visible = true;
    } else if (inst.crown) inst.crown.visible = false;
    // World top of the head (name tags, sweat, stars).
    const hd = model.attach?.head;
    if (hd) {
      hd.getWorldPosition(this._v);
      fig.headX = this._v.x; fig.headY = this._v.y; fig.headZ = this._v.z;
    } else { fig.headX = fig.x; fig.headY = fig.y + HEIGHT * fig.scale; fig.headZ = fig.z; }
    return true;
  }
}

/** Optional generated arena dressing (null = procedural arena). */
export function createGenArena(gen, opts) {
  if (!gen || typeof gen.createArena !== 'function') return null;
  try { return gen.createArena(opts); } catch (e) { console.warn('[halat] createArena', e); return null; }
}

// ---------------------------------------------------------------- tractor

/**
 * Tractor visual for one team: { team, group, state, x, wheelAngle, player, tag,
 * setColor(c), update(dt, t), exhaustWorld(), hitchWorld(), hitchOffset }. It drives away from
 * the pit; the rope hitch is at its rear (toward the pit).
 */
export function createTractorVisual(assets, team, gen, { shadows = false } = {}) {
  const group = new THREE.Group();
  const sx = team === 1 ? -1 : 1;
  const wheels = [];
  let teamMats = [];
  let setColor = (c) => { for (const m of teamMats) m.color.setHex(c); };
  let exhaust = new THREE.Vector3(0.4, 2.0, 0.3);
  let hitchLocal = null; // Object3D at the hitch (generator)
  let exhaustLocal = null;
  let mixer = null;
  let actions = null;
  let curClip = '';
  let scaleK = 1;
  const info = assets.model('tractor');
  const fitModel = (obj, faceZ) => {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const k = 3.0 / (Math.max(size.x, size.z) || 1);
    scaleK = k;
    obj.scale.setScalar(k);
    obj.position.y = -box.min.y * k;
    if (faceZ) obj.rotation.y = sx * Math.PI / 2; // models face +Z; the tractor drives away from the pit
    obj.traverse((o) => { if (/wheel/i.test(o.name)) wheels.push(o); if (o.isMesh) o.castShadow = shadows; });
    group.add(obj);
  };
  let gm = null;
  if (gen && typeof gen.createTractor === 'function') {
    try { gm = gen.createTractor({ teamColor: 0xcc3333, seed: team }); } catch (e) { console.warn('[halat] createTractor', e); }
  }
  if (gm && gm.object3D) {
    fitModel(gm.object3D, true);
    gm.object3D.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
    setColor = (c) => { try { gm.setTeamColor?.(c); gm.object3D.traverse((o) => { if (o.isMesh) o.castShadow = shadows; }); } catch { /* keep */ } };
    wheels.length = 0;
    const clips = gm.clips || {};
    if (clips.idle || clips.drive || clips.pull) {
      mixer = new THREE.AnimationMixer(gm.object3D);
      actions = {};
      for (const n of ['idle', 'drive', 'pull']) if (clips[n]?.tracks) actions[n] = mixer.clipAction(clips[n]);
    }
    hitchLocal = gm.attach?.hitch || null;
    exhaustLocal = gm.attach?.exhaust || null;
  } else if (info) {
    const m = info.gltf.scene.clone(true);
    m.traverse((o) => { if (o.isMesh && o.material?.userData?.isTeam) { o.material = o.material.clone(); teamMats.push(o.material); } });
    fitModel(m, true);
  } else {
    // Procedural tractor facing +x, then turned to drive away from the pit.
    const body = new THREE.Group();
    const teamMat = new THREE.MeshLambertMaterial({ color: 0xcc3333 });
    teamMats = [teamMat];
    const dark = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const metal = new THREE.MeshLambertMaterial({ color: 0x999999 });
    const glass = new THREE.MeshLambertMaterial({ color: 0x9fd3ff, emissive: 0x1a3040 });
    const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); body.add(m); return m; };
    box(1.5, 0.75, 0.9, teamMat, 0.45, 0.95, 0); // hood
    box(2.4, 0.3, 1.0, dark, 0, 0.55, 0); // chassis
    box(0.9, 1.0, 1.05, teamMat, -0.55, 1.45, 0); // cab
    box(0.92, 0.5, 1.08, glass, -0.55, 1.6, 0); // windows
    box(1.1, 0.1, 1.2, dark, -0.55, 2.0, 0); // roof
    box(0.05, 0.55, 0.7, metal, 1.21, 0.95, 0); // grill
    box(0.4, 0.12, 0.12, metal, -1.35, 0.65, 0); // hitch
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), metal); pipe.position.set(0.8, 1.6, 0.3); body.add(pipe);
    const hubMat = new THREE.MeshLambertMaterial({ color: 0xffd23f });
    const wheel = (r, w, x, z) => {
      const g = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), dark); tire.rotation.x = Math.PI / 2;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 8), hubMat); hub.rotation.x = Math.PI / 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, r * 0.18, w + 0.04), dark);
      g.add(tire, hub, spoke);
      g.position.set(x, r, z);
      body.add(g);
      wheels.push(g);
    };
    wheel(0.62, 0.38, -0.65, 0.68); wheel(0.62, 0.38, -0.65, -0.68);
    wheel(0.36, 0.26, 0.85, 0.6); wheel(0.36, 0.26, 0.85, -0.6);
    body.rotation.y = sx < 0 ? Math.PI : 0; // team 1 (left) drives toward -x
    group.add(body);
    exhaust = new THREE.Vector3(0.8 * sx, 2.05, 0.3 * sx);
  }
  const _w = new THREE.Vector3();
  const tr = {
    team, group, state: 'off', x: sx * 30, wheelAngle: 0, player: null, tag: null, tagUntil: 0, spin: 0,
    /** Distance from the tractor's centre to its hitch along x (toward the pit). */
    hitchOffset: 1.35,
    setColor: (c) => setColor(c),
    update(dt, t) {
      for (const w of wheels) w.rotation.z = -tr.wheelAngle;
      if (mixer && actions) {
        const want = tr.state === 'enter' || tr.state === 'leave' ? 'drive' : tr.state === 'pull' ? 'pull' : 'idle';
        const a = actions[want] || actions.drive || actions.idle;
        if (a && curClip !== want) {
          const prev = curClip ? actions[curClip] : null;
          a.reset().play();
          if (prev && prev !== a) prev.crossFadeTo(a, 0.3, false);
          curClip = want;
        }
        // Wheel speed follows the actual motion.
        if (a) a.timeScale = want === 'drive' ? Math.max(0.4, Math.min(2.2, tr.spin / 6)) : want === 'pull' ? 0.8 + Math.min(1.2, tr.spin / 8) : 1;
        mixer.update(tr.state === 'off' ? 0 : dt);
      }
      group.position.y = mixer ? 0 : Math.abs(Math.sin(t * 22)) * 0.025 * (tr.state === 'off' ? 0 : 1);
    },
    exhaustWorld() {
      if (exhaustLocal) { group.updateMatrixWorld(true); exhaustLocal.getWorldPosition(_w); return { x: _w.x, y: _w.y, z: _w.z }; }
      return { x: tr.x + exhaust.x, y: exhaust.y, z: exhaust.z };
    },
    hitchWorld() {
      if (hitchLocal) { group.updateMatrixWorld(true); hitchLocal.getWorldPosition(_w); return { x: _w.x, y: _w.y, z: _w.z }; }
      return { x: tr.x - sx * 1.35, y: 0.65, z: 0 };
    },
  };
  if (hitchLocal) {
    // Measure the hitch distance once (model is static apart from the shake).
    group.position.set(0, 0, 0);
    group.updateMatrixWorld(true);
    hitchLocal.getWorldPosition(_w);
    tr.hitchOffset = Math.abs(_w.x) || 1.35;
  }
  void scaleK;
  return tr;
}
