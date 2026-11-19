// Tilted perspective camera fitted to the map band of the current HUD layout.
// The director pushes in on hot spots with shot(), the rig eases in, holds and
// eases back to the overview. Also screen shake.
import * as THREE from 'three';
import { clamp, easeInOutCubic } from './util.js';

export class CameraRig {
  constructor(config) {
    this.cfg = config.visual;
    this.camera = new THREE.PerspectiveCamera(this.cfg.fovDeg, 1, 10, 6000);
    this.tilt = THREE.MathUtils.degToRad(this.cfg.tiltDeg);
    this.dir = new THREE.Vector3(0, Math.cos(this.tilt), Math.sin(this.tilt)); // from target to camera
    this.box = { minX: -500, maxX: 500, minZ: -300, maxZ: 300 };
    this.center = new THREE.Vector3();
    this.baseDist = 1000;
    this.target = new THREE.Vector3();
    this.dist = 1000;
    this.shotState = null; // { to, zoom, t, dur, inT, outT, k }
    this.shakeAmp = 0;
    this.version = 0; // bumps when the view changes (labels re-project)
    this.zoom = 1;
  }

  /** World-space bounds of everything that must be visible in the overview. */
  setBounds(minX, maxX, minZ, maxZ) {
    this.box = { minX, maxX, minZ, maxZ };
    this.center.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  }

  /**
   * @param {number} w,h viewport size in px
   * @param {{x,y,w,h}} rect where the map should appear (px)
   */
  fit(w, h, rect) {
    const cam = this.camera;
    cam.aspect = w / h;
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
    const B = this.box;
    const halfX = rect.w / w; const halfY = rect.h / h;
    const corners = [];
    for (const x of [B.minX, B.maxX]) for (const z of [B.minZ, B.maxZ]) corners.push(new THREE.Vector3(x, 0, z));
    // A little headroom above the far edge for castles and soldiers.
    for (const x of [B.minX, B.maxX]) corners.push(new THREE.Vector3(x, 22, B.minZ));
    const center = this.center;
    const v = new THREE.Vector3();
    const measure = (d) => {
      cam.position.copy(center).addScaledVector(this.dir, d);
      cam.lookAt(center);
      cam.updateMatrixWorld();
      let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
      for (const c of corners) {
        v.copy(c).project(cam);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
      return { minX, maxX, minY, maxY };
    };
    const fitX = this.cfg.fitWidth ?? 0.9;
    let lo = 100; let hi = 20000;
    for (let i = 0; i < 40; i++) {
      const d = (lo + hi) / 2;
      const m = measure(d);
      // Side margin keeps the east/west plates (Hakkari, Edirne) and KKTC inside the frame.
      const ok = (m.maxX - m.minX) <= halfX * 2 * fitX && (m.maxY - m.minY) <= halfY * 2 * 0.95;
      if (ok) hi = d; else lo = d;
    }
    this.baseDist = hi;
    // Far plane follows the fitted distance (narrow portrait screens sit far back).
    cam.near = Math.max(1, hi * 0.02);
    cam.far = hi * 1.6 + 2000;
    cam.updateProjectionMatrix();
    const m = measure(hi);
    const midX = (m.minX + m.maxX) / 2; const midY = (m.minY + m.maxY) / 2;
    // Shift the principal point so the projected map lands in rect's centre.
    const rcx = rect.x + rect.w / 2; const rcy = rect.y + rect.h / 2;
    const offX = w / 2 + (midX * w) / 2 - rcx;
    const offY = h / 2 - (midY * h) / 2 - rcy;
    cam.setViewOffset(w, h, offX, offY, w, h);
    cam.updateProjectionMatrix();
    if (!this.shotState) { this.target.copy(center); this.dist = hi; }
    this._apply();
    this.version++;
  }

  /** Push in on a world point, hold, and return to the overview. */
  shot(point, zoom, dur, ease = 2) {
    const B = this.box;
    // Slow, symmetric ease in/out (never longer than half the shot).
    const e = Math.min(ease, dur / 2);
    // Keep the zoomed view mostly over the map.
    const fx = 1 - 1 / zoom;
    const hx = ((B.maxX - B.minX) / 2) * fx; const hz = ((B.maxZ - B.minZ) / 2) * fx;
    const p = new THREE.Vector3(
      clamp(point.x, this.center.x - hx, this.center.x + hx), 0,
      clamp(point.z, this.center.z - hz, this.center.z + hz));
    // A shot already running is never replaced (no zoom-to-zoom cuts).
    if (this.shotState) return;
    this.shotState = { to: p, zoom, t: 0, dur, inT: e, outT: e, k: 0 };
  }

  /** Back-compat alias. */
  attention(point, zoom, dur) { this.shot(point, zoom, dur); }

  get busy() { return !!this.shotState; }
  get remaining() { return this.shotState ? this.shotState.dur - this.shotState.t : 0; }

  shake(amount) {
    this.shakeAmp = Math.max(this.shakeAmp, amount * (this.cfg.shakeScale ?? 1));
  }

  update(dt) {
    let changed = false;
    const s = this.shotState;
    if (s) {
      s.t += dt;
      let k;
      if (s.t < s.inT) k = easeInOutCubic(s.t / s.inT);
      else if (s.t < s.dur - s.outT) k = 1;
      else if (s.t < s.dur) k = 1 - easeInOutCubic((s.t - (s.dur - s.outT)) / s.outT);
      else { k = 0; this.shotState = null; }
      this.target.copy(this.center).lerp(s.to, k);
      this.dist = this.baseDist / (1 + (s.zoom - 1) * k);
      s.k = k;
      changed = true;
    } else if (this.target.distanceToSquared(this.center) > 1e-6 || Math.abs(this.dist - this.baseDist) > 1e-3) {
      this.target.copy(this.center); this.dist = this.baseDist; changed = true;
    }
    if (this.shakeAmp > 0.01) { changed = true; this.shakeAmp *= Math.pow(0.02, dt); } else if (this.shakeAmp) { this.shakeAmp = 0; changed = true; }
    this.zoom = this.baseDist / this.dist;
    if (changed) {
      this._apply();
      // Only re-project overlays when the view really moved (a held shot is static).
      const p = this.camera.position;
      if (!this._lp || Math.abs(p.x - this._lp.x) + Math.abs(p.y - this._lp.y) + Math.abs(p.z - this._lp.z) > 1e-3) {
        this._lp = p.clone(); this.version++;
      }
    }
  }

  _apply() {
    const cam = this.camera;
    cam.position.copy(this.target).addScaledVector(this.dir, this.dist);
    cam.lookAt(this.target);
    if (this.shakeAmp > 0) {
      const a = this.shakeAmp / Math.max(1, this.zoom);
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
      cam.position.z += (Math.random() - 0.5) * a;
    }
    cam.updateMatrixWorld();
  }

  /** Ground-plane polygon (world xz) currently visible inside the band rect (px). */
  visibleQuad(w, h, rect) {
    const cam = this.camera;
    const out = [];
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    for (const [px, py] of [[rect.x, rect.y], [rect.x + rect.w, rect.y], [rect.x + rect.w, rect.y + rect.h], [rect.x, rect.y + rect.h]]) {
      ndc.set((px / w) * 2 - 1, -(py / h) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      if (ray.ray.intersectPlane(plane, hit)) out.push([hit.x, hit.z]);
    }
    return out;
  }
}
