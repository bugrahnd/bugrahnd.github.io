// The rope: a chain of instanced cylinder segments along a curve recomputed every frame
// (hand height through both lines, a tension-dependent sag and travelling wobble across
// the pit, tails dropping to the ground behind the last puller or tied to a tractor),
// plus the centre ribbon that shows where the rope stands.
import * as THREE from 'three';
import { clamp } from './util.js';

const SEG = 96;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _d = new THREE.Vector3();
const _s = new THREE.Vector3();
const _x = new THREE.Vector3(1, 0, 0);

export class Rope {
  constructor(scene, assets) {
    let tex = assets.textures.get('rope_tex');
    if (!tex) {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
      const c = cv.getContext('2d');
      c.fillStyle = '#c9a46a'; c.fillRect(0, 0, 64, 64);
      c.strokeStyle = '#8a6a3a'; c.lineWidth = 7;
      for (let i = -64; i < 128; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 64, 64); c.stroke(); }
      c.strokeStyle = 'rgba(255,240,200,0.45)'; c.lineWidth = 2;
      for (let i = -64; i < 128; i += 16) { c.beginPath(); c.moveTo(i + 5, 0); c.lineTo(i + 69, 64); c.stroke(); }
      tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    }
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    geo.rotateZ(-Math.PI / 2); // axis along +x
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map: tex }), SEG);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.px = new Float32Array(SEG + 1);
    this.py = new Float32Array(SEG + 1);
    this.pz = new Float32Array(SEG + 1);
    // Centre ribbon: knot + hanging flag.
    this.marker = new THREE.Group();
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffe14d, emissive: 0x5a4a00 }));
    const fg = new THREE.PlaneGeometry(0.34, 0.5, 2, 3); fg.translate(0, -0.27, 0);
    this.flag = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ color: 0xffd400, emissive: 0x4a3a00, side: THREE.DoubleSide }));
    this.marker.add(knot, this.flag);
    scene.add(this.marker);
    this.t = 0;
    this.wobble = 0; // transverse wave amplitude (jerks, tugs)
    this.handY = 0.98;
  }

  /** A jerk travels along the rope (tug gifts, heaves). */
  jerk(a = 0.08) { this.wobble = Math.min(0.35, this.wobble + a); }

  /** Rope height at world x (for hands). */
  heightAt(x) {
    const i = clamp(Math.round(((x - this.x0) / (this.x1 - this.x0)) * SEG), 0, SEG);
    return this.py[i] ?? this.handY;
  }

  /**
   * @param o { offset (world x of the centre), tension 0..1, left/right: { anchorX, endX, endY, tied } , front: [xl, xr] }
   */
  update(dt, o) {
    this.t += dt;
    this.wobble = Math.max(0, this.wobble - dt * this.wobble * 1.6 - dt * 0.01);
    const L = o.left; const R = o.right;
    this.x0 = L.endX; this.x1 = R.endX;
    const hy = this.handY;
    const sag = 0.05 + (1 - o.tension) * 0.2;
    const fl = o.front[0]; const fr = o.front[1];
    const span = Math.max(0.5, fr - fl);
    for (let i = 0; i <= SEG; i++) {
      const x = this.x0 + ((this.x1 - this.x0) * i) / SEG;
      let y = hy;
      if (x > fl && x < fr) {
        const u = (x - fl) / span;
        y = hy - sag * 4 * u * (1 - u) + Math.sin(u * Math.PI) * Math.sin(this.t * 15) * this.wobble * 0.6 +
          Math.sin(u * Math.PI * 3 - this.t * 9) * this.wobble * 0.15;
      } else if (x <= fl) {
        // Left team side: taut through hands, then the tail drops behind the last anchor.
        if (x < L.anchorX) {
          const k = clamp((L.anchorX - x) / 1.3, 0, 1);
          y = L.tied ? L.endY + (hy - L.endY) * clamp((x - L.endX) / Math.max(0.01, L.anchorX - L.endX), 0, 1) : hy + (0.04 - hy) * (k * k * (3 - 2 * k));
        } else y = hy + Math.sin(x * 2.1 - this.t * 7) * this.wobble * 0.05;
      } else {
        if (x > R.anchorX) {
          const k = clamp((x - R.anchorX) / 1.3, 0, 1);
          y = R.tied ? R.endY + (hy - R.endY) * clamp((R.endX - x) / Math.max(0.01, R.endX - R.anchorX), 0, 1) : hy + (0.04 - hy) * (k * k * (3 - 2 * k));
        } else y = hy + Math.sin(x * 2.1 + this.t * 7) * this.wobble * 0.05;
      }
      this.px[i] = x; this.py[i] = y; this.pz[i] = 0;
    }
    const r = 0.048 * (1 - 0.18 * o.tension);
    for (let i = 0; i < SEG; i++) {
      _a.set(this.px[i], this.py[i], this.pz[i]);
      _d.set(this.px[i + 1] - this.px[i], this.py[i + 1] - this.py[i], this.pz[i + 1] - this.pz[i]);
      const len = _d.length();
      _q.setFromUnitVectors(_x, _d.multiplyScalar(1 / Math.max(1e-5, len)));
      _a.addScaledVector(_d, len * 0.5);
      _m.compose(_a, _q, _s.set(len * 1.04, r, r));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    // Ribbon at the rope centre.
    const cx = o.offset;
    const cy = this.heightAt(cx);
    this.marker.position.set(cx, cy, 0);
    this.flag.rotation.x = Math.sin(this.t * 3.1) * 0.25 + this.wobble;
    this.flag.rotation.z = clamp(-o.vel * 3, -0.6, 0.6);
  }
}
