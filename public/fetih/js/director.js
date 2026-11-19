// Director camera: the full-map overview is the default and dominant view. It only
// pushes in for genuinely big moments (top-tier gifts, a capital falling, the final
// seconds), with slow eased moves, a minimum gap between zooms, and never cutting from
// one zoom straight into another. Game code reports interest with note() (only used
// when visual.director.autoHeatShots is on) and big moments call force().

export class Director {
  constructor(rig, config) {
    this.rig = rig;
    this.cfg = config.visual.director || {};
    this.enabled = config.visual.cameraAttention !== false;
    this.events = []; // { x, z, score, t }
    this.time = 0;
    this.current = null; // { prio, until }
    this.lastShotEnd = -1e9; // time the last shot fully returned to the overview
    this.fallback = null; // () => {x, z} | null : the leading team's front
  }

  get gapSec() { return this.cfg.minGapSec ?? 28; }

  /** Something interesting happened at world (x, z). */
  note(x, z, score) {
    if (!this.enabled || !this.cfg.autoHeatShots || !(score > 0)) return;
    this.events.push({ x, z, score, t: this.time });
    if (this.events.length > 240) this.events.splice(0, this.events.length - 240);
  }

  /** True when a new shot may start now (prio >= bypassGapPrio ignores the gap). */
  canShoot(prio = 1) {
    if (!this.enabled) return false;
    if (this.current || this.rig.busy) return false; // never zoom-to-zoom
    if (prio >= (this.cfg.bypassGapPrio ?? 9)) return true;
    return this.time - this.lastShotEnd >= this.gapSec;
  }

  /**
   * Push in on a big moment. zoom/hold are upper bounds; the config caps them.
   * Ignored while another shot runs or the minimum gap has not passed.
   */
  force(x, z, zoom, hold, prio = 1) {
    if (!this.canShoot(prio)) return false;
    const c = this.cfg;
    const zz = Math.min(c.maxZoom ?? 1.8, zoom || c.zoom || 1.6);
    const hh = Math.min(c.maxHoldSec ?? 6, hold || c.holdSec || 4.5);
    this._shoot(x, z, zz, hh, prio);
    return true;
  }

  _shoot(x, z, zoom, hold, prio) {
    const ease = this.cfg.easeSec ?? 2.2;
    const dur = hold + ease * 2;
    this.rig.shot({ x, z }, zoom, dur, ease);
    this.current = { prio, until: this.time + dur };
  }

  update(dt) {
    this.time += dt;
    if (!this.enabled) return;
    const c = this.cfg;
    if (this.current && this.time >= this.current.until && !this.rig.busy) {
      this.current = null; this.lastShotEnd = this.time;
    }
    if (this.current || !c.autoHeatShots) return;
    if (this.time - this.lastShotEnd < this.gapSec) return;

    // Optional heat-driven shots (off by default).
    const halfLife = c.heatHalfLifeSec ?? 4;
    const cutoff = this.time - halfLife * 4;
    let drop = 0;
    while (drop < this.events.length && this.events[drop].t < cutoff) drop++;
    if (drop) this.events.splice(0, drop);
    const R = c.clusterRadius ?? 90; const R2 = R * R;
    let best = null; let bestHeat = 0;
    const w = this.events.map((e) => e.score * Math.pow(0.5, (this.time - e.t) / halfLife));
    for (const e of this.events) {
      let heat = 0; let sx = 0; let sz = 0;
      this.events.forEach((f, j) => {
        if ((f.x - e.x) ** 2 + (f.z - e.z) ** 2 > R2) return;
        heat += w[j]; sx += f.x * w[j]; sz += f.z * w[j];
      });
      if (heat > bestHeat) { bestHeat = heat; best = { x: sx / heat, z: sz / heat }; }
    }
    if (best && bestHeat >= (c.minHeat ?? 120)) {
      this._shoot(best.x, best.z, c.zoom ?? 1.6, c.holdSec ?? 4.5, 0);
      this.events.length = 0;
    }
  }

  reset() {
    this.events.length = 0;
    this.current = null;
    this.lastShotEnd = this.time;
  }
}
