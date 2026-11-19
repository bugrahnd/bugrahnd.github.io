// Director camera: holds the overview by default, regularly pushes in on whatever is
// hottest (big battles, captures, bombardments, big gifts), holds a few seconds and
// pulls back. Game code reports interest with note(); big moments call force().

export class Director {
  constructor(rig, config) {
    this.rig = rig;
    this.cfg = config.visual.director || {};
    this.enabled = config.visual.cameraAttention !== false;
    this.events = []; // { x, z, score, t }
    this.time = 0;
    this.overviewSince = 0; // time the last shot ended
    this.current = null; // { prio, until }
    this.lastShotAt = -1e9;
    this.fallback = null; // () => {x, z} | null : the leading team's front
  }

  /** Something interesting happened at world (x, z). */
  note(x, z, score) {
    if (!this.enabled || !(score > 0)) return;
    this.events.push({ x, z, score, t: this.time });
    if (this.events.length > 240) this.events.splice(0, this.events.length - 240);
  }

  /** Cut to a big moment now (unless a more important shot is running). */
  force(x, z, zoom, hold, prio = 1) {
    if (!this.enabled) return;
    if (this.current && this.current.until > this.time && this.current.prio >= prio) return;
    this._shoot(x, z, zoom, hold, prio);
  }

  _shoot(x, z, zoom, hold, prio) {
    const dur = hold + 2; // ease in + ease out
    this.rig.shot({ x, z }, zoom, dur);
    this.current = { prio, until: this.time + dur };
    this.lastShotAt = this.time;
  }

  update(dt) {
    this.time += dt;
    if (!this.enabled) return;
    const c = this.cfg;
    const halfLife = c.heatHalfLifeSec ?? 4;
    // Drop old events.
    const cutoff = this.time - halfLife * 4;
    let drop = 0;
    while (drop < this.events.length && this.events[drop].t < cutoff) drop++;
    if (drop) this.events.splice(0, drop);

    if (this.current && this.time >= this.current.until) { this.current = null; this.overviewSince = this.time; }
    if (this.current) return;
    if (this.time - this.overviewSince < (c.overviewSec ?? 6)) return;

    // Hottest cluster.
    const R = c.clusterRadius ?? 90;
    const R2 = R * R;
    let best = null; let bestHeat = 0;
    const w = this.events.map((e) => e.score * Math.pow(0.5, (this.time - e.t) / halfLife));
    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i];
      let heat = 0; let sx = 0; let sz = 0;
      for (let j = 0; j < this.events.length; j++) {
        const f = this.events[j];
        const dx = f.x - e.x; const dz = f.z - e.z;
        if (dx * dx + dz * dz > R2) continue;
        heat += w[j]; sx += f.x * w[j]; sz += f.z * w[j];
      }
      if (heat > bestHeat) { bestHeat = heat; best = { x: sx / heat, z: sz / heat }; }
    }
    if (best && bestHeat >= (c.minHeat ?? 30)) {
      const zoom = Math.min(c.maxZoom ?? 3, (c.zoom ?? 2.4) + Math.min(0.6, bestHeat / 400));
      this._shoot(best.x, best.z, zoom, c.holdSec ?? 4.5, 0);
      // Do not shoot the same spot again right away.
      for (const e of this.events) if ((e.x - best.x) ** 2 + (e.z - best.z) ** 2 < R2) e.score *= 0.25;
      return;
    }
    if (this.time - this.lastShotAt > (c.idleShotSec ?? 16) && this.fallback) {
      const p = this.fallback();
      if (p) this._shoot(p.x, p.z, c.zoom ?? 2.4, (c.holdSec ?? 4.5) - 1, 0);
      else this.lastShotAt = this.time;
    }
  }

  reset() {
    this.events.length = 0;
    this.current = null;
    this.overviewSince = this.time;
  }
}
