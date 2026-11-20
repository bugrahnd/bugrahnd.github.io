// Camera rig: a framed 3/4 view of the rope and pit that fits the middle band of a
// portrait 1080x1920 stage (TikTok safe zones). The target point is projected to the band
// centre with an off-axis projection shift. Life: slow drift, push toward the losing edge,
// decaying shake, a short hero framing for tractor/giant arrivals.
import * as THREE from 'three';
import { clamp, damp, smooth } from './util.js';

export class CameraRig {
  constructor(config) {
    this.cfg = config;
    this.camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.5, 200);
    this.target = new THREE.Vector3(0, config.camera.targetY, config.camera.targetZ);
    this.cur = this.target.clone();
    this.dist = 20;
    this.curDist = 20;
    this.t = 0;
    this.shakeAmt = 0;
    this.hero = null; // { x, y, z, until, start, dist }
    this.focusX = 0;
    this.zoom = 1;
    this.W = 1; this.H = 1;
    this.band = { x: 0, y: 0, w: 1, h: 1 };
  }

  /** Viewport size and the band (px) the action must fit in. */
  fit(W, H, band) {
    this.W = W; this.H = H; this.band = band;
    const c = this.camera;
    c.aspect = W / H;
    c.fov = this.cfg.camera.fov;
    c.updateProjectionMatrix();
    // Distance so `span` world units fill the band width (and ~0.62 span its height).
    const tanV = Math.tan(THREE.MathUtils.degToRad(c.fov / 2));
    const tanH = tanV * c.aspect;
    this.wide = band.w / Math.max(1, band.h) > 1.3;
    const span = this._cc().span;
    const dW = ((span / 2) * (W / Math.max(1, band.w))) / tanH;
    const dH = ((span * 0.4 / 2) * (H / Math.max(1, band.h))) / tanV;
    this.dist = Math.max(dW, dH);
    if (!this._fitted) { this.curDist = this.dist; this._fitted = true; }
    // NDC y of the band centre (the target is drawn there).
    this.ndcY = 1 - (2 * (band.y + band.h / 2)) / H;
    this.ndcX = (2 * (band.x + band.w / 2)) / W - 1;
  }

  /** Camera settings; a wide, short band (the overlay's action band) uses camera.wide on top. */
  _cc() {
    const c = this.cfg.camera;
    return this.wide && c.wide ? { ...c, ...c.wide } : c;
  }

  shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a * (this.cfg.visual.shake ?? 1)); }

  /** Short framing of a point (arrivals, the decisive fall); k = distance factor at full blend. */
  heroAt(x, y, z, sec = 2.6, k = 0.7) {
    if (!this.cfg.camera.hero) return;
    this.hero = { x, y, z, start: this.t, until: this.t + sec, k };
  }

  /**
   * @param dt seconds (real time, not slowed)
   * @param o { rope (-1..1), offset (world x of the rope centre), focusX, ending }
   */
  update(dt, o) {
    this.t += dt;
    const cc = this._cc();
    const drift = cc.drift ?? 1;
    const push = cc.push ?? 1;
    // Push toward the losing edge as the rope nears it: the losers are by the pit, so frame the pit side.
    const near = smooth(clamp((Math.abs(o.rope) - 0.55) / 0.45, 0, 1)) * push;
    // Follow the rope centre part way and lean toward the side about to fall into the pit.
    let tx = o.offset * 0.5 + (o.focusX || 0) - Math.sign(o.rope) * near * 1.4 + Math.sin(this.t * 0.11) * 0.3 * drift;
    let ty = cc.targetY + Math.sin(this.t * 0.17) * 0.06 * drift;
    let tz = cc.targetZ;
    let dist = this.dist * (1 - 0.16 * near) * (o.ending ? 0.9 : 1) * (o.zoomOut || 1);
    if (this.hero) {
      const h = this.hero;
      const u = (this.t - h.start) / (h.until - h.start);
      if (u >= 1) this.hero = null;
      else {
        const k = smooth(clamp(Math.min(u / 0.2, (1 - u) / 0.3), 0, 1));
        tx += (h.x - tx) * k * 0.85;
        ty += (h.y - ty) * k * 0.6;
        tz += (h.z - tz) * k * 0.5;
        dist *= 1 - (1 - (h.k ?? 0.7)) * k;
      }
    }
    this.target.set(tx, ty, tz);
    this.cur.lerp(this.target, damp(2.2, dt));
    this.curDist += (dist - this.curDist) * damp(1.8, dt);
    const pitch = THREE.MathUtils.degToRad(cc.pitchDeg);
    const yaw = Math.sin(this.t * 0.07) * 0.03 * drift;
    const c = this.camera;
    c.position.set(
      this.cur.x + Math.sin(yaw) * Math.cos(pitch) * this.curDist,
      this.cur.y + Math.sin(pitch) * this.curDist,
      this.cur.z + Math.cos(yaw) * Math.cos(pitch) * this.curDist,
    );
    // Shake: smooth, quickly decaying wobble (no per-frame random jitter).
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
    const s = this.shakeAmt * this.shakeAmt * 0.16;
    if (s > 0) {
      const t = this.t;
      c.position.x += s * (Math.sin(t * 41) * 0.6 + Math.sin(t * 67 + 1.3) * 0.4);
      c.position.y += s * (Math.sin(t * 53 + 0.7) * 0.6 + Math.sin(t * 29 + 2.1) * 0.4);
    }
    c.lookAt(this.cur);
    c.updateMatrixWorld();
    // Off-axis shift: the target lands on the band centre, not the screen centre.
    c.updateProjectionMatrix();
    const e = c.projectionMatrix.elements;
    e[8] = -(this.ndcX || 0);
    e[9] = -(this.ndcY || 0);
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
    this.zoom = this.dist / this.curDist;
  }
}
