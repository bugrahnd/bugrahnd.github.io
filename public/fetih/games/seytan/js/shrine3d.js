// "Sakura" theme of Şeytan Avı (reference: games/seytan/reference/shrine-night.webp, contract in
// reference/style.json): a Japanese shrine courtyard at night. A long lavender-blue stone path runs
// from the camera to stairs and a red torii; two-storey wooden buildings with warm windows and
// cherry trees frame both sides; stone lanterns (toro) line the path, black iron street lamps stand in
// front, low stone fences and shrubs edge it, and the devil stands in a ring of stones with embers.
// Everything is procedural (no image or model files). Warm light comes mostly from emissive parts
// and additive glow sprites; only a handful of real point lights are used (performance).
//
// buildShrine(world) adds the scene to world.scene and returns { props, lanterns, petals, pit }.
//   props     hiding props (same shape as the Ottoman ones): { id, obj, hides, break, canopy? }
//   lanterns  flickering point lights { light, base, seed }
//   petals    update(t, dt) for drifting cherry petals
import * as THREE from 'three';
import { rng, makeNoise, stoneTexture, pixelCanvas } from './noise.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
const cast = (m, c = true, r = true) => { m.castShadow = c; m.receiveShadow = r; return m; };
const tex = (canvas, repeat = [1, 1], srgb = true) => {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

// palette (reference/style.json)
const C = {
  paveFar: 0xa492c4, paveNear: 0x8a88bc, joint: 'rgba(40,34,80,0.45)',
  stone: 0x8e8aa8, stoneDark: 0x5a5678,
  wood: 0x4a2e2c, woodDark: 0x301c20, plaster: 0x8e7088, roof: 0x262a48,
  window: 0xffc86a, glow: 0xfff0a4, fire: 0xff7a40,
  torii: 0xd03a2c, toriiTop: 0x2a1c22,
  sakura: [0xf08cbc, 0xe070a8, 0xf6a8cc, 0xd65f9a], bark: 0x3e2a2e,
  shrub: 0x2c4a48, iron: 0x1c1d26,
};

export const PIT = { x: 0, z: -0.8 };

export function buildShrine(world) {
  const s = world.scene;
  const first = s.children.length;
  const glowTex = radial();
  const out = { lanterns: [], petals: null, props: [] };
  const glow = (x, y, z, size, color = C.glow, opacity = 0.85) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sp.position.set(x, y, z); sp.scale.set(size, size, 1); s.add(sp); return sp;
  };

  ground(s);
  pathAndStairs(s);
  torii(s);
  buildings(s, glow);
  fences(s);
  shrubs(s);
  for (const [x, z] of [[-2.7, -10.5], [2.7, -10.5], [-2.7, -7], [2.7, -7], [-3.0, -3.6], [3.0, -3.6], [-3.3, 0.4], [3.3, 0.4]]) toro(s, x, z, glow);
  for (const [x, z] of [[-4.9, 3.6], [4.9, 3.6]]) out.lanterns.push(streetLamp(s, x, z, glow));
  out.pit = firePit(s, glow);
  out.lanterns.push({ light: out.pit.light, base: out.pit.light.intensity, seed: 7 });

  // cherry trees framing the sides (not hiding props)
  const r = rng(91);
  for (const [x, z, h] of [[-6.4, -2.5, 4.2], [6.6, -3.2, 4.4], [-7.2, -8.5, 4.8], [7.4, -9.5, 5], [-6.2, 4.5, 3.8], [6.3, 5.2, 3.6], [-8.5, 1.5, 4.4], [8.6, 0.8, 4.2]]) sakura(s, x, z, h, r);

  // hiding props: a big cherry tree (left), a rock garden (centre back), a small shrine (right)
  const tree = sakura(s, -3.9, -3.4, 4.6, rng(17), 1.25);
  const rocks = rockGarden(s, 0.5, -4.2);
  const hokora = smallShrine(s, 4.0, -3.4, glow);
  out.props = [
    { id: 'hokora', obj: hokora, hides: [{ x: 4.0, y: 1.6, z: -4.9, label: 'küçük tapınağın arkasına' }], break: hokora },
    { id: 'rocks', obj: rocks, hides: [{ x: 0.5, y: 1.2, z: -5.6, label: 'kayaların arkasına' }], break: rocks },
    { id: 'tree', obj: tree.group, hides: [{ x: -3.9, y: 1.7, z: -4.9, label: 'sakuranın arkasına' }], break: tree.group, canopy: tree.canopy },
  ];
  out.petals = petals(s);
  // Shadow budget: only the hiding props cast shadows (with the devil, the crowd and the stones);
  // the decor still receives them. Casting from every lantern, fence post and house cost ~30% FPS.
  const casters = new Set(out.props.map((p) => p.obj));
  for (const o of s.children.slice(first)) if (!casters.has(o)) o.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  return out;
}

// ------------------------------------------------------------------------------------- ground
function ground(s) {
  // paving: square slabs, lighter and warmer far away (the texture is tinted per vertex)
  const pc = document.createElement('canvas'); pc.width = pc.height = 512;
  const g = pc.getContext('2d');
  g.drawImage(stoneTexture(256, 256, [200, 196, 222], 61, 0.035, 0.22), 0, 0, 512, 512);
  const r = rng(62);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,30,80' : '255,240,255'},${r() * 0.08})`; g.fillRect(i * 128, j * 128, 128, 128); }
  g.strokeStyle = C.joint; g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke(); }
  const geo = new THREE.PlaneGeometry(44, 48, 1, 24);
  const col = new Float32Array(geo.attributes.position.count * 3);
  const far = new THREE.Color(C.paveFar); const near = new THREE.Color(C.paveNear); const c = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const v = geo.attributes.position.getY(i); // +24 far .. -24 near (before rotation)
    c.copy(near).lerp(far, Math.min(1, Math.max(0, (v + 6) / 22)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const floor = new THREE.Mesh(geo, std({ map: tex(pc, [14, 15]), bumpMap: tex(pc, [14, 15], false), bumpScale: 1.5, roughness: 0.85, vertexColors: true }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -3); floor.receiveShadow = true;
  s.add(floor);
}

function pathAndStairs(s) {
  const stoneMat = std({ color: C.stone, roughness: 0.8 });
  // a curb on both sides of the path
  for (const x of [-3.9, 3.9]) { const k = cast(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.14, 15), stoneMat)); k.position.set(x, 0.07, -4.5); s.add(k); }
  // stairs up to the torii
  for (let i = 0; i < 6; i++) {
    const st = cast(new THREE.Mesh(new THREE.BoxGeometry(5.6 - i * 0.12, 0.22, 0.55), std({ color: i % 2 ? 0xa596c4 : 0x9a8cbc, roughness: 0.8 })));
    st.position.set(0, 0.11 + i * 0.22, -11.9 - i * 0.55); s.add(st);
  }
  const top = cast(new THREE.Mesh(new THREE.BoxGeometry(9, 1.32, 8), std({ color: 0x8c7eb0, roughness: 0.85 })));
  top.position.set(0, 0.66, -18.7); s.add(top);
}

function torii(s) {
  const g = new THREE.Group();
  const red = std({ color: C.torii, roughness: 0.55, emissive: 0x2a0604 });
  const black = std({ color: C.toriiTop, roughness: 0.6 });
  for (const x of [-2.0, 2.0]) {
    const p = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 5.2, 16), red)); p.position.set(x, 2.6, 0); g.add(p);
    const b = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 16), black)); b.position.set(x, 0.15, 0); g.add(b);
  }
  const nuki = cast(new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.26, 0.26), red)); nuki.position.y = 4.2; g.add(nuki);
  const kasagi = cast(new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.34, 0.5), red)); kasagi.position.y = 5.1; g.add(kasagi);
  // the black top beam curves up at the ends
  const shape = new THREE.Shape();
  shape.moveTo(-3.5, 0.15); shape.quadraticCurveTo(0, -0.1, 3.5, 0.15); shape.lineTo(3.4, 0.45); shape.quadraticCurveTo(0, 0.2, -3.4, 0.45); shape.lineTo(-3.5, 0.15);
  const top = cast(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false }), black));
  top.position.set(0, 5.15, -0.3); g.add(top);
  const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.08), black); tablet.position.set(0, 4.65, 0.18); g.add(tablet);
  // far at the top of the stairs, smaller than life so it closes the view without filling it
  g.position.set(0, 1.32, -16.6); g.scale.setScalar(0.85);
  s.add(g);
}

function buildings(s, glow) {
  const r = rng(33);
  const plaster = std({ color: C.plaster, roughness: 0.9 });
  const wood = std({ color: C.wood, roughness: 0.8 });
  const roofMat = std({ color: C.roof, roughness: 0.55, metalness: 0.15 });
  const win = new THREE.MeshBasicMaterial({ color: C.window, toneMapped: false });
  const house = (x, z, w, d, h, rotY, floors = 2) => {
    const g = new THREE.Group();
    for (let f = 0; f < floors; f++) {
      const fw = w - f * 0.8; const fh = h / floors;
      const body = cast(new THREE.Mesh(new THREE.BoxGeometry(fw, fh, d - f * 0.6), plaster)); body.position.y = fh * (f + 0.5); g.add(body);
      // timber frame
      for (let k = -1; k <= 1; k += 2) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, fh, 0.14), wood); post.position.set(k * fw / 2, fh * (f + 0.5), (d - f * 0.6) / 2 + 0.01); g.add(post); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.14, 0.14), wood); beam.position.set(0, fh * (f + 1) - 0.07, (d - f * 0.6) / 2 + 0.01); g.add(beam);
      // warm windows (shoji)
      const n = Math.max(2, Math.round(fw / 1.2));
      for (let i = 0; i < n; i++) {
        if (r() < 0.2) continue;
        const wx = (i - (n - 1) / 2) * (fw / n);
        const wm = new THREE.Mesh(new THREE.PlaneGeometry(fw / n * 0.62, fh * 0.42), win); wm.position.set(wx, fh * (f + 0.52), (d - f * 0.6) / 2 + 0.02); g.add(wm);
        for (let q = 1; q < 3; q++) { const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.03, fh * 0.42), wood); bar.position.set(wx - fw / n * 0.31 + q * fw / n * 0.207, fh * (f + 0.52), (d - f * 0.6) / 2 + 0.03); g.add(bar); }
      }
      // flared roof over each floor
      const rw = fw + 1.0; const rd = d - f * 0.6 + 1.0;
      const roof = cast(new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(rw, rd) / 2, 0.9, 4, 1), roofMat));
      roof.rotation.y = Math.PI / 4; roof.scale.set(rw / Math.hypot(rw, rd) * 1.414, 1, rd / Math.hypot(rw, rd) * 1.414);
      roof.position.y = fh * (f + 1) + 0.4; g.add(roof);
    }
    g.position.set(x, 0, z); g.rotation.y = rotY;
    s.add(g);
    glow(x + Math.sin(rotY) * (d / 2 + 0.6), h * 0.3, z + Math.cos(rotY) * (d / 2 + 0.6), 3.2, 0xffb060, 0.35);
  };
  house(-8.2, -7.5, 5, 4, 4.6, Math.PI / 2 - 0.25);
  house(8.2, -7.5, 5, 4, 4.6, -Math.PI / 2 + 0.25);
  house(-7.0, -14.5, 6, 4, 5.4, 0.35);
  house(7.0, -14.5, 6, 4, 5.4, -0.35);
  house(-12.5, -1.5, 5, 4, 4.2, Math.PI / 2);
  house(12.5, -1.5, 5, 4, 4.2, -Math.PI / 2);
}

function fences(s) {
  const mat = std({ color: C.stone, roughness: 0.85 });
  const post = new THREE.BoxGeometry(0.22, 0.75, 0.22);
  const rail = new THREE.BoxGeometry(0.12, 0.1, 1.9);
  for (const x of [-4.4, 4.4]) {
    for (let z = -11; z <= 1.2; z += 2) {
      const p = cast(new THREE.Mesh(post, mat)); p.position.set(x, 0.375, z); s.add(p);
      if (z + 2 <= 1.3) for (const y of [0.32, 0.62]) { const rr = new THREE.Mesh(rail, mat); rr.position.set(x, y, z + 1); s.add(rr); }
    }
  }
}

function shrubs(s) {
  const r = rng(44);
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const n = 70;
  const inst = new THREE.InstancedMesh(geo, std({ color: 0xffffff, roughness: 0.9, flatShading: true }), n);
  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler(); const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (4.9 + r() * 1.6); const z = -12 + r() * 15;
    const sc = 0.35 + r() * 0.35;
    e.set(r() * 3, r() * 3, r() * 3); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, sc * 0.6, z), q, new THREE.Vector3(sc, sc * 0.8, sc));
    inst.setMatrixAt(i, m4);
    col.setHex(C.shrub).multiplyScalar(0.8 + r() * 0.5);
    inst.setColorAt(i, col);
  }
  cast(inst, false, true);
  s.add(inst);
}

// ------------------------------------------------------------------------------------- lanterns
const toroGeo = {
  base: new THREE.CylinderGeometry(0.34, 0.42, 0.22, 6),
  post: new THREE.CylinderGeometry(0.13, 0.16, 0.85, 8),
  plate: new THREE.CylinderGeometry(0.3, 0.26, 0.12, 6),
  box: new THREE.BoxGeometry(0.42, 0.36, 0.42),
  roof: new THREE.ConeGeometry(0.5, 0.32, 6),
  knob: new THREE.SphereGeometry(0.08, 8, 6),
};
function toro(s, x, z, glow) {
  const g = new THREE.Group();
  const mat = std({ color: C.stone, roughness: 0.85 });
  const add = (geo, y, m = mat) => { const o = cast(new THREE.Mesh(geo, m)); o.position.y = y; g.add(o); return o; };
  add(toroGeo.base, 0.11); add(toroGeo.post, 0.65); add(toroGeo.plate, 1.13);
  add(toroGeo.box, 1.37, new THREE.MeshBasicMaterial({ color: 0xffd48a, toneMapped: false }));
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const fr = new THREE.Mesh(new THREE.BoxGeometry(dx ? 0.04 : 0.44, 0.38, dz ? 0.04 : 0.44), mat); fr.position.set(dx * 0.21, 1.37, dz * 0.21); g.add(fr); }
  add(toroGeo.roof, 1.71); add(toroGeo.knob, 1.92);
  g.position.set(x, 0, z);
  s.add(g);
  glow(x, 1.4, z + 0.05, 1.5, C.glow, 0.9);
  glow(x, 0.05, z, 2.2, 0xffa860, 0.22).material.rotation = 0;
}

function streetLamp(s, x, z, glow) {
  const g = new THREE.Group();
  const iron = std({ color: C.iron, roughness: 0.45, metalness: 0.7 });
  const pole = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 3.0, 10), iron)); pole.position.y = 1.5; g.add(pole);
  const foot = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.18, 10), iron)); foot.position.y = 0.09; g.add(foot);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.17, 0.5, 6), new THREE.MeshBasicMaterial({ color: 0xffe6a0, toneMapped: false })); cage.position.y = 3.3; g.add(cage);
  const cap = cast(new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.3, 6), iron)); cap.position.y = 3.7; g.add(cap);
  const light = new THREE.PointLight(0xffc070, 9, 9, 1.8); light.position.y = 3.2; g.add(light);
  g.position.set(x, 0, z);
  s.add(g);
  glow(x, 3.3, z, 2.4, C.glow, 0.9);
  return { light, base: 9, seed: x };
}

function firePit(s, glow) {
  const g = new THREE.Group();
  const n = makeNoise(5);
  const mat = std({ color: 0x6a5a78, roughness: 0.9, vertexColors: true });
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const geo = new THREE.IcosahedronGeometry(0.34, 2);
    const p = geo.attributes.position; const col = new Float32Array(p.count * 3); const v = new THREE.Vector3();
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k);
      v.multiplyScalar(0.8 + n.noise(v.x * 4 + i, v.y * 4 + v.z * 3) * 0.4);
      p.setXYZ(k, v.x, v.y * 0.75, v.z);
      // inner faces glow red-orange from the embers
      const inner = Math.max(0, -(v.x * Math.cos(a) + v.z * Math.sin(a)) / 0.34);
      col.set([0.6 + inner * 0.9, 0.5 + inner * 0.2, 0.62 - inner * 0.3], k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = cast(new THREE.Mesh(geo, mat)); m.position.set(Math.cos(a) * 1.15, 0.18, Math.sin(a) * 1.15); m.rotation.y = a * 3; g.add(m);
  }
  const embers = new THREE.Mesh(new THREE.CircleGeometry(1.0, 32), new THREE.MeshBasicMaterial({ color: 0xff6a30, toneMapped: false }));
  embers.rotation.x = -Math.PI / 2; embers.position.y = 0.04; g.add(embers);
  const light = new THREE.PointLight(0xff7040, 10, 7, 1.8); light.position.y = 0.8; g.add(light);
  g.position.set(PIT.x, 0, PIT.z);
  s.add(g);
  glow(PIT.x, 0.3, PIT.z, 3.4, 0xff7a40, 0.55);
  return { group: g, light };
}

// ------------------------------------------------------------------------------------- trees, props
function sakura(s, x, z, h, r, scale = 1) {
  const g = new THREE.Group();
  const bark = std({ color: C.bark, roughness: 0.9 });
  const trunk = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, h * 0.62, 10), bark)); trunk.position.y = h * 0.31; trunk.rotation.z = (r() - 0.5) * 0.2; g.add(trunk);
  for (const [rz, len] of [[0.7, h * 0.32], [-0.6, h * 0.3], [0.15, h * 0.26]]) {
    const b = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, len, 8), bark)); b.geometry.translate(0, len / 2, 0); b.position.y = h * 0.55; b.rotation.set((r() - 0.5) * 0.6, 0, rz); g.add(b);
  }
  const canopy = new THREE.Group(); canopy.position.y = h * 0.82; g.add(canopy);
  const N = 26;
  const inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), std({ color: 0xffffff, roughness: 0.8, emissive: 0x220614 }), N);
  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler(); const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2; const d = Math.sqrt(r());
    const p = new THREE.Vector3(Math.cos(a) * 1.7 * d, (r() - 0.35) * 1.0, Math.sin(a) * 1.2 * d);
    const sc = 0.5 + r() * 0.45;
    e.set(r() * 3, r() * 3, r() * 3); q.setFromEuler(e);
    m4.compose(p, q, new THREE.Vector3(sc, sc * 0.8, sc));
    inst.setMatrixAt(i, m4);
    col.setHex(C.sakura[i % C.sakura.length]).multiplyScalar(0.85 + (p.y + 0.5) * 0.2);
    inst.setColorAt(i, col);
  }
  cast(inst); canopy.add(inst);
  g.position.set(x, 0, z); g.scale.setScalar(scale);
  s.add(g);
  return { group: g, canopy };
}

function rockGarden(s, x, z) {
  const g = new THREE.Group();
  const n = makeNoise(82);
  const c = stoneTexture(256, 256, [150, 140, 170], 83, 0.05, 0.35);
  const mat = std({ map: tex(c, [2, 2]), bumpMap: tex(c, [2, 2], false), bumpScale: 2.5, roughness: 0.9, vertexColors: true });
  for (const [rx, ry, rz, rad, sc] of [[-0.8, 0.75, 0.1, 0.95, [1.15, 0.85, 0.9]], [0.85, 0.8, 0, 1.0, [1.1, 0.9, 0.85]], [0.05, 1.35, -0.3, 0.9, [1, 0.95, 0.9]], [1.6, 0.32, 0.5, 0.42, [1.2, 0.75, 1]]]) {
    const geo = new THREE.IcosahedronGeometry(rad, 4);
    const pos = geo.attributes.position; const col = new Float32Array(pos.count * 3); const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.multiplyScalar(1 + (n.fbm(v.x * 1.6 + rx * 3 + v.z * 0.7, v.y * 1.6 + v.z, 4) - 0.5) * 0.5);
      pos.setXYZ(i, v.x, v.y, v.z);
      const moss = Math.max(0, Math.min(1, (v.y / rad - 0.35) * 2.2)) * (0.5 + n.noise(v.x * 6, v.z * 6) * 0.6);
      col.set([1 - moss * 0.6, 1 - moss * 0.25, 1 - moss * 0.5], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = cast(new THREE.Mesh(geo, mat)); m.position.set(rx, ry, rz); m.scale.set(...sc); m.rotation.y = rx; g.add(m);
  }
  // raked gravel around the rocks
  const gravel = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), std({ color: 0xb8b0cc, roughness: 1 }));
  gravel.rotation.x = -Math.PI / 2; gravel.position.y = 0.012; gravel.receiveShadow = true; g.add(gravel);
  g.position.set(x, 0, z);
  s.add(g);
  return g;
}

function smallShrine(s, x, z, glow) {
  const g = new THREE.Group();
  const wood = std({ color: C.wood, roughness: 0.75 });
  const red = std({ color: C.torii, roughness: 0.6 });
  const roofMat = std({ color: C.roof, roughness: 0.55 });
  const stone = std({ color: C.stone, roughness: 0.85 });
  const base = cast(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 2.0), stone)); base.position.y = 0.25; g.add(base);
  const body = cast(new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.6, 1.4), wood)); body.position.y = 1.3; g.add(body);
  for (const sx of [-0.8, 0.8]) { const p = cast(new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 0.16), red)); p.position.set(sx, 1.35, 0.72); g.add(p); }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.1), new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false })); door.position.set(0, 1.25, 0.71); g.add(door);
  const roof = cast(new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.1, 4), roofMat)); roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, 1); roof.position.y = 2.65; g.add(roof);
  g.position.set(x, 0, z); g.rotation.y = -0.35;
  s.add(g);
  glow(x + 0.3, 1.3, z + 0.9, 2.2, 0xffb060, 0.45);
  return g;
}

// ------------------------------------------------------------------------------------- petals
function petals(s) {
  const N = 140;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const r = rng(71);
  const st = [];
  for (let i = 0; i < N; i++) { st.push({ x: (r() - 0.5) * 22, y: r() * 9, z: -14 + r() * 22, s: 0.4 + r() * 0.6, ph: r() * 6 }); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const c = pixelCanvas(32, 32, (x, y) => { const dx = (x - 16) / 14; const dy = (y - 16) / 9; const d = dx * dx + dy * dy; return [255, 190, 220, d < 1 ? 255 * (1 - d * 0.6) : 0]; });
  const mat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 0.16, transparent: true, depthWrite: false, color: 0xffd0e4 });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  s.add(pts);
  return {
    update(t, dt) {
      for (let i = 0; i < N; i++) {
        const p = st[i];
        p.y -= dt * 0.45 * p.s; p.x += Math.sin(t * 0.8 + p.ph) * dt * 0.5; p.z += dt * 0.15;
        if (p.y < 0.02) { p.y = 6 + r() * 3; p.x = (r() - 0.5) * 22; p.z = -14 + r() * 22; }
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

function radial(size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
