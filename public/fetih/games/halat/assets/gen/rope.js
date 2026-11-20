// The rope: a braided tube (tex_rope + tex_rope_normal, strands slide with the rope) rebuilt in place every
// frame along the same curve as js/rope.js (hand height through both lines, tension-dependent sag and a
// travelling wobble across the pit, tails dropping to the ground or tied to a tractor), plus the centre marker
// (knot + hanging flag). Drop-in for js/rope.js `Rope`: same update(dt, o), heightAt(x), jerk(a), handY.
// No allocations per frame. Draw calls: 2 (rope, marker).
import * as THREE from 'three';
import { ellipsoid, tube, band, MeshBuilder, M4 } from './geo.js';
import { toonMaterial } from './toon.js';

const TEX = name => new URL(`../textures/${name}.png`, import.meta.url).href;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/**
 * createRope({ segments = 96, radial = 8, radius = 0.048, handY = 0.62 })
 *   -> { object3D, handY, update(dt, o), heightAt(x), jerk(a), marker, ready, dispose() }
 * o (as in js/rope.js): { offset, tension 0..1, vel, front: [xl, xr],
 *                         left: { anchorX, endX, endY, tied }, right: { anchorX, endX, endY, tied } }
 */
export function createRope({ segments = 96, radial = 8, radius = 0.048, handY = 0.62 } = {}) {
  const SEG = segments, RAD = radial, NV = (SEG + 1) * (RAD + 1);
  const pending = [];
  const load = (name, srgb) => { const t = new THREE.Texture(); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; pending.push(new THREE.TextureLoader().loadAsync(TEX(name)).then(i => { t.image = i.image; t.needsUpdate = true; }).catch(() => {})); return t; };
  const map = load('tex_rope', true), nmap = load('tex_rope_normal', false);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(NV * 3), nor = new Float32Array(NV * 3), uv = new Float32Array(NV * 2), idx = [];
  for (let i = 0; i < SEG; i++) for (let k = 0; k < RAD; k++) { const a = i * (RAD + 1) + k, b = a + RAD + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  const mat = new THREE.MeshLambertMaterial({ map, normalMap: nmap, normalScale: new THREE.Vector2(0.8, 0.8), color: 0xf2e6cc });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.name = 'rope';

  // centre marker: knot + ribbon flag (flag pivots at the knot)
  const mk = new MeshBuilder();
  mk.add(ellipsoid(0.1, 0.09, 0.12, 10, 7), { color: 0xffd23f });
  mk.add(band(0.075, 0.06, 0.03, 12).rotateZ(Math.PI / 2), { color: 0xe23a3a });
  const fg = new THREE.PlaneGeometry(0.36, 0.52, 2, 3); fg.deleteAttribute('uv'); fg.translate(0, -0.33, 0);
  mk.add(fg, { color: 0xffd23f });
  const fg2 = fg.clone(); fg2.index.array.reverse(); mk.add(fg2, { color: 0xffc21a });
  mk.add(new THREE.PlaneGeometry(0.36, 0.08).deleteAttribute('uv').translate(0, -0.42, 0.002), { color: 0xe23a3a });
  const marker = new THREE.Mesh(mk.build(), toonMaterial({ kind: 'rope-marker' }));
  marker.material.side = THREE.DoubleSide; marker.name = 'rope-marker';
  const object3D = new THREE.Group(); object3D.name = 'halat-rope'; object3D.add(mesh, marker);

  const px = new Float32Array(SEG + 1), py = new Float32Array(SEG + 1);
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const api = {
    object3D, marker, handY, wobble: 0, t: 0, x0: -14, x1: 14, ready: Promise.all(pending),
    jerk(a = 0.08) { api.wobble = Math.min(0.35, api.wobble + a); },
    heightAt(x) { const i = clamp(Math.round(((x - api.x0) / (api.x1 - api.x0)) * SEG), 0, SEG); return py[i] || api.handY; },
    update(dt, o) {
      api.t += dt;
      api.wobble = Math.max(0, api.wobble - dt * api.wobble * 1.6 - dt * 0.01);
      const L = o.left, R = o.right, hy = api.handY, t = api.t, wob = api.wobble;
      api.x0 = L.endX; api.x1 = R.endX;
      const sag = 0.05 + (1 - (o.tension ?? 0.5)) * 0.2, fl = o.front[0], fr = o.front[1], span = Math.max(0.5, fr - fl);
      for (let i = 0; i <= SEG; i++) {
        const x = api.x0 + ((api.x1 - api.x0) * i) / SEG;
        let y = hy;
        if (x > fl && x < fr) {
          const u = (x - fl) / span;
          y = hy - sag * 4 * u * (1 - u) + Math.sin(u * Math.PI) * Math.sin(t * 15) * wob * 0.6 + Math.sin(u * Math.PI * 3 - t * 9) * wob * 0.15;
        } else if (x <= fl) {
          if (x < L.anchorX) { const k = clamp((L.anchorX - x) / 1.3, 0, 1); y = L.tied ? L.endY + (hy - L.endY) * clamp((x - L.endX) / Math.max(0.01, L.anchorX - L.endX), 0, 1) : hy + (0.05 - hy) * (k * k * (3 - 2 * k)); }
          else y = hy + Math.sin(x * 2.1 - t * 7) * wob * 0.05;
        } else if (x > R.anchorX) { const k = clamp((x - R.anchorX) / 1.3, 0, 1); y = R.tied ? R.endY + (hy - R.endY) * clamp((R.endX - x) / Math.max(0.01, R.endX - R.anchorX), 0, 1) : hy + (0.05 - hy) * (k * k * (3 - 2 * k)); }
        else y = hy + Math.sin(x * 2.1 + t * 7) * wob * 0.05;
        px[i] = x; py[i] = y;
      }
      const r = radius * (1 - 0.18 * (o.tension ?? 0.5)), tile = 8 * 2 * r, off = o.offset || 0;
      for (let i = 0; i <= SEG; i++) {
        const a = Math.max(0, i - 1), b = Math.min(SEG, i + 1);
        T.set(px[b] - px[a], py[b] - py[a], 0).normalize();
        N.copy(UP).addScaledVector(T, -UP.dot(T)).normalize(); B.crossVectors(T, N);
        const u = (px[i] - off) / tile;
        for (let k = 0; k <= RAD; k++) {
          const ang = (k / RAD) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang), j = i * (RAD + 1) + k;
          const nx = N.x * c + B.x * s, ny = N.y * c + B.y * s, nz = N.z * c + B.z * s;
          pos[j * 3] = px[i] + nx * r; pos[j * 3 + 1] = py[i] + ny * r; pos[j * 3 + 2] = nz * r;
          nor[j * 3] = nx; nor[j * 3 + 1] = ny; nor[j * 3 + 2] = nz;
          uv[j * 2] = u; uv[j * 2 + 1] = k / RAD;
        }
      }
      geo.attributes.position.needsUpdate = geo.attributes.normal.needsUpdate = geo.attributes.uv.needsUpdate = true;
      const cx = off, cy = api.heightAt(cx);
      marker.position.set(cx, cy, 0);
      marker.rotation.x = Math.sin(t * 3.1) * 0.25 + wob;
      marker.rotation.z = clamp(-(o.vel || 0) * 3, -0.6, 0.6);
    },
    dispose() { object3D.removeFromParent(); geo.dispose(); mat.dispose(); marker.geometry.dispose(); },
  };
  return api;
}
