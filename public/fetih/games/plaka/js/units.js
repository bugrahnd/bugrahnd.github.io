// Draws armies, siege engines and projectiles with instanced, lock-step animated models.
// Figures are drawn oversized in the overview (so they read on a phone) and shrink
// toward natural size as the director camera zooms in.
// Overview LOD: below visual.lodZoom every figure is drawn as a low-poly "token" (a few
// dozen triangles, two instanced draw calls per unit type) instead of the skinned model
// (~2.5k triangles each). Zoomed in, detailed models are used up to
// visual.maxFiguresDetailed; figures beyond that budget fall back to tokens.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, setYawMatrix } from './instancing.js';
import { TILE_H } from './map.js';

const UNIT_MODELS = { infantry: 'unit_infantry', knight: 'unit_knight', cavalry: 'unit_cavalry' };
const CLIPS = {
  infantry: { walk: ['walk'], fight: ['attack-melee-right'], idle: ['idle'] },
  knight: { walk: ['walk'], fight: ['attack-melee-right'], idle: ['idle'] },
  cavalry: { walk: ['horse-run', 'rider-drive'], fight: ['horse-idle', 'rider-attack-melee-right'], idle: ['horse-idle', 'rider-sit'] },
};
const STATES = ['walk', 'fight', 'idle'];
const SIEGE_MODELS = { cannon: 'unit_cannon', catapult: 'unit_siege', trebuchet: 'unit_siege_trebuchet' };
// Extra yaw so the siege model's front faces +Z (verified in game).
const SIEGE_YAW = { cannon: 0, catapult: -Math.PI / 2, trebuchet: -Math.PI / 2 };
export const FIG_SPACING = 5.5; // formation spacing at unitScale 1

export class UnitRenderer {
  constructor(scene, assets, config) {
    this.assets = assets;
    this.cfg = config.visual;
    this.matCache = new Map();
    this.templates = [];
    this.batches = {}; // `${type}|${state}|${phase}` -> Batch
    const phases = Math.max(1, this.cfg.animPhases | 0);
    this.phases = phases;
    const cap = this.cfg.maxFiguresTotal;
    for (const [type, key] of Object.entries(UNIT_MODELS)) {
      const model = assets.model(key);
      for (const state of STATES) {
        for (let ph = 0; ph < phases; ph++) {
          const tpl = assets.makeTemplate(key, CLIPS[type][state], ph / phases + (state === 'fight' ? 0.13 * ph : 0));
          this.templates.push(tpl);
          const batch = new Batch(model, cap, tpl.skeletons, this.matCache);
          scene.add(batch.group);
          this.batches[`${type}|${state}|${ph}`] = batch;
        }
      }
    }
    this.siegeBatches = {};
    for (const [kind, key] of Object.entries(SIEGE_MODELS)) {
      const b = new Batch(assets.model(key), this.cfg.maxSiegeEngines, null, this.matCache);
      scene.add(b.group);
      this.siegeBatches[kind] = b;
    }
    this.flagBatch = new Batch(assets.model('flag'), this.cfg.maxSiegeEngines + 64, null, this.matCache);
    scene.add(this.flagBatch.group);
    this.ballBatch = new Batch(assets.model('projectile_cannonball'), 256, null, this.matCache);
    scene.add(this.ballBatch.group);
    this.shipBatch = new Batch(assets.model('ship'), 24, null, this.matCache);
    scene.add(this.shipBatch.group);
    this.base = {};
    for (const [type, key] of Object.entries(UNIT_MODELS)) this.base[type] = assets.manifest.models[key].scale;
    for (const [kind, key] of Object.entries(SIEGE_MODELS)) this.base[kind] = assets.manifest.models[key].scale * 1.15;
    this.base.ball = assets.manifest.models.projectile_cannonball.scale * 1.6;
    this.base.flag = assets.manifest.models.flag.scale * 0.9;
    this.base.ship = assets.manifest.models.ship.scale;
    this.m = new THREE.Matrix4();
    this.figureCount = 0;
    this.tokenCount = 0;
    // Low-poly tokens sized from each model's bind-pose bounds (model units).
    this.tokens = {};
    const teamMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const plainMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    for (const [type, key] of Object.entries(UNIT_MODELS)) {
      const box = new THREE.Box3();
      for (const part of assets.model(key).parts) {
        if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
        const b = part.geometry.boundingBox.clone();
        if (part.bindMatrix) b.applyMatrix4(part.bindMatrix);
        box.union(b);
      }
      const geos = tokenGeometry(type, box);
      const team = new THREE.InstancedMesh(geos.team, teamMat, cap);
      team.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      const plain = new THREE.InstancedMesh(geos.plain, plainMat, cap);
      for (const mesh of [team, plain]) {
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
        scene.add(mesh);
      }
      team.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.tokens[type] = { team, plain, n: 0 };
    }
    this.col = new THREE.Color();
  }

  _pushToken(type, m, hex) {
    const t = this.tokens[type];
    if (t.n >= t.team.instanceMatrix.count) return false;
    const i = t.n++;
    m.toArray(t.team.instanceMatrix.array, i * 16);
    m.toArray(t.plain.instanceMatrix.array, i * 16);
    this.col.setHex(hex);
    t.team.instanceColor.array[i * 3] = this.col.r;
    t.team.instanceColor.array[i * 3 + 1] = this.col.g;
    t.team.instanceColor.array[i * 3 + 2] = this.col.b;
    return true;
  }

  _endTokens() {
    for (const t of Object.values(this.tokens)) {
      for (const mesh of [t.team, t.plain]) {
        mesh.count = t.n; mesh.visible = t.n > 0;
        if (t.n) { mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, t.n * 16); mesh.instanceMatrix.needsUpdate = true; }
      }
      if (t.n) { t.team.instanceColor.clearUpdateRanges(); t.team.instanceColor.addUpdateRange(0, t.n * 3); t.team.instanceColor.needsUpdate = true; }
    }
  }

  update(dt, armies, sieges, projectiles, zoom = 1) {
    // Overview: tokens only (no skinned models, no skeleton updates).
    const detailed = zoom >= (this.cfg.lodZoom ?? 1.25);
    let budget = detailed ? (this.cfg.maxFiguresDetailed ?? 220) : 0;
    if (detailed) {
      for (const t of this.templates) {
        t.mixer.update(dt);
        t.root.updateMatrixWorld(true);
      }
    }
    this.time = (this.time || 0) + dt;
    // Oversized in the overview, closer to natural size when zoomed in.
    const k = this.cfg.unitScale * Math.pow(Math.max(1, zoom), -(this.cfg.unitZoomShrink ?? 0.5));
    const tall = this.cfg.unitTallness ?? 1.2; // counters the top-down foreshortening
    for (const b of Object.values(this.batches)) b.begin();
    for (const t of Object.values(this.tokens)) t.n = 0;
    this.shipBatch.begin();
    const m = this.m;
    let figs = 0; let toks = 0;
    for (const a of armies) {
      if (!a.figs.length) continue;
      const c = Math.cos(a.yaw); const s = Math.sin(a.yaw);
      if (a.sea && a.state !== 'fight') {
        // Sea crossing: a ship carries the army.
        const sc = this.base.ship * 0.55 * k * a.appear * Math.min(1.6, 0.8 + Math.sqrt(a.troops) / 30);
        const bob = Math.sin(performance.now() / 300 + a.id) * 0.5;
        setYawMatrix(m, a.x, bob - 0.5, a.z, a.yaw, sc);
        this.shipBatch.push(m, a.colorHex);
        continue;
      }
      const state = a.state === 'fight' ? 'fight' : a.state === 'gather' ? 'idle' : 'walk';
      const appear = a.appear;
      for (const f of a.figs) {
        // Local offset (ox: right, oz: forward) rotated by yaw (model faces +Z).
        const ox = f.ox * k; const oz = f.oz * k;
        const x = a.x + ox * c + oz * s;
        const z = a.z - ox * s + oz * c;
        const sc = this.base[f.type] * k * appear * (f.scale || 1);
        if (sc <= 0.001) continue;
        const yaw = a.yaw + (state === 'fight' ? f.wobble : 0);
        if (budget > 0) {
          setYawMatrix(m, x, TILE_H + (f.lift || 0), z, yaw, sc, sc * tall);
          if (this.batches[`${f.type}|${state}|${f.phase % this.phases}`].push(m, a.colorHex)) { figs++; budget--; }
          continue;
        }
        // Token: a little hop while walking, a lunge while fighting.
        const ph = this.time * (state === 'fight' ? 9 : 7) + f.phase * 1.7 + a.id;
        const hop = state === 'idle' ? 0 : Math.abs(Math.sin(ph)) * sc * (state === 'fight' ? 0.12 : 0.08);
        setYawMatrix(m, x, TILE_H + (f.lift || 0) + hop, z, yaw, sc, sc * tall);
        if (this._pushToken(f.type, m, a.colorHex)) toks++;
      }
    }
    for (const b of Object.values(this.batches)) b.end();
    this._endTokens();
    this.shipBatch.end();
    this.figureCount = figs;
    this.tokenCount = toks;

    for (const b of Object.values(this.siegeBatches)) b.begin();
    this.flagBatch.begin();
    for (const sg of sieges) {
      if (sg.hidden) continue;
      const sc = this.base[sg.kind] * k * sg.appear * (1 + sg.recoil * 0.15);
      const yaw = sg.yaw + SIEGE_YAW[sg.kind];
      setYawMatrix(m, sg.x, TILE_H, sg.z, yaw, sc, sc * tall);
      this.siegeBatches[sg.kind].push(m, sg.colorHex);
      // Team flag beside the engine (cannons have no team material).
      const fx = sg.x - Math.cos(sg.yaw) * 3.5 * k; const fz = sg.z + Math.sin(sg.yaw) * 3.5 * k;
      setYawMatrix(m, fx, TILE_H, fz, sg.yaw, this.base.flag * k * sg.appear);
      this.flagBatch.push(m, sg.colorHex);
    }
    for (const a of armies) {
      // Big named armies carry a banner flag.
      if (!a.banner || a.appear <= 0.01 || (a.sea && a.state !== 'fight')) continue;
      const c = Math.cos(a.yaw); const s = Math.sin(a.yaw);
      const x = a.x + 3 * k * s; const z = a.z + 3 * k * c;
      setYawMatrix(m, x, TILE_H, z, a.yaw + Math.PI / 2, this.base.flag * k * 1.5 * a.appear);
      this.flagBatch.push(m, a.colorHex);
    }
    for (const b of Object.values(this.siegeBatches)) b.end();
    this.flagBatch.end();

    this.ballBatch.begin();
    const bs = this.base.ball * Math.max(1, k * 0.7);
    for (const p of projectiles) {
      setYawMatrix(m, p.x, p.y, p.z, 0, bs);
      this.ballBatch.push(m);
    }
    this.ballBatch.end();
  }
}

/**
 * Low-poly stand-in for a unit, fitted to the model's bounds (model faces +Z).
 * Returns { team, plain }: team-coloured parts (tinted per instance) and the rest
 * (vertex colours: skin, wood, horse).
 */
function tokenGeometry(type, box) {
  const size = box.getSize(new THREE.Vector3());
  const H = Math.max(0.001, size.y); const y0 = box.min.y;
  const team = []; const plain = [];
  const at = (g, x, y, z, rotX = 0) => { if (rotX) g.rotateX(rotX); g.translate(x, y0 + y, z); return g.index ? g.toNonIndexed() : g; };
  const paint = (g, hex) => {
    const c = new THREE.Color(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  const SKIN = 0xf2c9a0; const STEEL = 0xb8c0c8; const WOOD = 0x8a5a2b; const HORSE = 0x7a4a26;
  if (type === 'cavalry') {
    const L = Math.max(size.z, H * 0.8);
    plain.push(paint(at(new THREE.BoxGeometry(H * 0.2, H * 0.24, L * 0.62), 0, H * 0.42, 0), HORSE));
    plain.push(paint(at(new THREE.BoxGeometry(H * 0.12, H * 0.24, H * 0.14), 0, H * 0.6, L * 0.32), HORSE));
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) plain.push(paint(at(new THREE.BoxGeometry(H * 0.06, H * 0.32, H * 0.06), lx * H * 0.07, H * 0.16, lz * L * 0.22), HORSE));
    team.push(at(new THREE.CylinderGeometry(H * 0.09, H * 0.12, H * 0.32, 6), 0, H * 0.7, -L * 0.04));
    plain.push(paint(at(new THREE.IcosahedronGeometry(H * 0.08, 0), 0, H * 0.92, -L * 0.04), SKIN));
  } else {
    team.push(at(new THREE.CylinderGeometry(H * 0.15, H * 0.2, H * 0.62, 7), 0, H * 0.31, 0));
    plain.push(paint(at(new THREE.IcosahedronGeometry(H * 0.13, 0), 0, H * 0.74, 0), SKIN));
    if (type === 'knight') {
      plain.push(paint(at(new THREE.ConeGeometry(H * 0.14, H * 0.16, 6), 0, H * 0.88, 0), STEEL));
      team.push(at(new THREE.BoxGeometry(H * 0.26, H * 0.32, H * 0.05), -H * 0.06, H * 0.36, H * 0.2));
    } else {
      plain.push(paint(at(new THREE.BoxGeometry(H * 0.04, H * 1.0, H * 0.04), H * 0.22, H * 0.5, H * 0.04), WOOD));
      plain.push(paint(at(new THREE.ConeGeometry(H * 0.05, H * 0.12, 4), H * 0.22, H * 1.04, H * 0.04), STEEL));
    }
  }
  const strip = (g) => { g.deleteAttribute('uv'); return g; };
  return { team: mergeGeometries(team.map(strip)), plain: mergeGeometries(plain.map(strip)) };
}

/**
 * Build figure offsets for an army (unitScale 1; the renderer scales them).
 * @param {string[]} types unit type per figure
 */
export function layoutFigures(types, spacing = FIG_SPACING) {
  const n = types.length;
  const cols = n <= 3 ? n : n <= 8 ? Math.ceil(n / 2) : Math.min(6, Math.ceil(Math.sqrt(n * 1.5)));
  const figs = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols); const col = i % cols;
    const inRow = Math.min(cols, n - row * cols);
    const sp = types[i] === 'cavalry' ? spacing * 1.25 : spacing;
    figs.push({
      type: types[i],
      ox: (col - (inRow - 1) / 2) * sp + (Math.random() - 0.5) * 0.7,
      oz: -row * sp * 1.1 + (Math.random() - 0.5) * 0.7,
      phase: (i + row) % 2,
      wobble: (Math.random() - 0.5) * 0.8,
      scale: 0.95 + Math.random() * 0.1,
    });
  }
  return figs;
}
