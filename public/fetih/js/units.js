// Draws armies, siege engines and projectiles with instanced, lock-step animated models.
// Figures are drawn oversized in the overview (so they read on a phone) and shrink
// toward natural size as the director camera zooms in.
import * as THREE from 'three';
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
  }

  update(dt, armies, sieges, projectiles, zoom = 1) {
    for (const t of this.templates) {
      t.mixer.update(dt);
      t.root.updateMatrixWorld(true);
    }
    // Oversized in the overview, closer to natural size when zoomed in.
    const k = this.cfg.unitScale * Math.pow(Math.max(1, zoom), -(this.cfg.unitZoomShrink ?? 0.5));
    const tall = this.cfg.unitTallness ?? 1.2; // counters the top-down foreshortening
    for (const b of Object.values(this.batches)) b.begin();
    this.shipBatch.begin();
    const m = this.m;
    let figs = 0;
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
        setYawMatrix(m, x, TILE_H + (f.lift || 0), z, yaw, sc, sc * tall);
        if (this.batches[`${f.type}|${state}|${f.phase % this.phases}`].push(m, a.colorHex)) figs++;
      }
    }
    for (const b of Object.values(this.batches)) b.end();
    this.shipBatch.end();
    this.figureCount = figs;

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
