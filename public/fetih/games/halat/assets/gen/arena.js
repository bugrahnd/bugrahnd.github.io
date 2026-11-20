// Arena dressing for Halat Çekme (art pass v2), matching js/arena.js conventions: rope along x, pit centred on
// x = 0 (half sizes pitHalf x 2.7), water at y = -0.42, team 1 on the left, camera looking from +z.
//
// Look: a village fair ground in a warm, limited palette. The background steps down in contrast and saturation
// with distance (per-vertex haze in the shader), the rope / pit / pullers stay the brightest thing in frame.
// Mown grass with soft large colour patches, worn lanes, chalk lines and tractor tyre marks are painted in the
// ground shader; props sit on cheap baked contact darkening (AO at their base + soft blob shadows); a warm key
// light with soft shadow maps is provided in `lights` for the integrator.
//
// Draw calls: ground, props (all static/wind-animated geometry merged), pit walls, water, sign, clouds,
// contact shadows, particles, three crowd meshes = 12 (+ shadow pass if the key light casts shadows).
import * as THREE from 'three';
import { capsule, band, ellipsoid, roundedBox, tube, warp, MeshBuilder, M4, rng } from './geo.js';
import { toonRamp } from './toon.js';
import { makeCrowdMesh, setPerson, randomPerson, finishCrowd } from './crowd.js';

const TEX = name => new URL(`../textures/${name}.png`, import.meta.url).href;
const C = h => new THREE.Color(h);
const DEFAULTS = { frontX: 3.8, slotGap: 0.6, pullersPerSide: 10, pitHalf: 1.35 };
// palette (sRGB hex): warm, limited
export const PAL = {
  grassL: 0x9ccb66, grassM: 0x84b857, grassD: 0x6aa04a, dirt: 0xc9a173, mudWet: 0x8a6643,
  wood: 0xb5814f, woodD: 0x8a5c34, grain: 0xdcb582, cream: 0xf3ead6, white: 0xfbf6ea,
  yellow: 0xf2c14e, red: 0xd9573f, teal: 0x4fae9f, slate: 0x7d8a94, leaf: 0x5f9a45, leafD: 0x4a8040,
  haze: 0xdde6e2, skyTop: 0x8fc3e6, skyHorizon: 0xf3eedf,
};
const T1 = 1, T2 = 3; // team attribute: (0,1] = team 1 strength, [2,3] = team 2 (2 + strength), 0 = none

function loadTex(url, pending, { srgb = true, repeat = true } = {}) {
  const t = new THREE.Texture();
  pending.push(new THREE.TextureLoader().loadAsync(url).then(img => { t.image = img.image; t.needsUpdate = true; }).catch(() => {}));
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
/** Triangular prism (gable roof) along X: width w (z), height h, length L, flat shaded. */
function prism(w, h, L) {
  const a = [[-L / 2, 0, -w / 2], [-L / 2, 0, w / 2], [-L / 2, h, 0], [L / 2, 0, -w / 2], [L / 2, 0, w / 2], [L / 2, h, 0]].map(p => new THREE.Vector3(...p));
  const f = [[0, 1, 2], [3, 5, 4], [1, 4, 5], [1, 5, 2], [0, 2, 5], [0, 5, 3], [0, 3, 4], [0, 4, 1]];
  const g = new THREE.BufferGeometry().setFromPoints(f.flat().map(i => a[i]));
  g.computeVertexNormals();
  return g;
}

/**
 * createArena({ teamColors: [c1, c2], visual: config.visual, title }) ->
 * { object3D, update(dt), setTeamColors(c1, c2), cheer(k), setDust(k), pitHalf, pitZ, waterY,
 *   background, fog, lights: { hemi, sun }, ready, meshes, dispose() }
 */
export function createArena({ teamColors = [0xe63946, 0x2f7cf6], visual = {}, title = 'HALAT ÇEKME', seed = 11, frontGap = 0 } = {}) {
  const v = { ...DEFAULTS, ...visual };
  const ph = v.pitHalf, pz = 2.7, waterY = -0.42;
  const laneEnd = v.frontX + v.slotGap * v.pullersPerSide + 4.2;
  const group = new THREE.Group(); group.name = 'halat-arena';
  const pending = [];
  const r = rng(seed);
  const uT1 = { value: C(teamColors[0]) }, uT2 = { value: C(teamColors[1]) }, uTime = { value: 0 };
  const uHaze = { value: C(PAL.haze) };

  // ------------------------------------------------------------------ ground (one mesh, painted in the shader)
  const grass = loadTex(TEX('tex_grass'), pending), dirt = loadTex(TEX('tex_dirt'), pending);
  const W = 170, D = 130;
  const gb = new MeshBuilder({ uv: true });
  const slab = (x0, x1, z0, z1) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.max(1, Math.round((x1 - x0) / 6)), Math.max(1, Math.round((z1 - z0) / 6)));
    g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    gb.add(g, { uv: p => [p.x / 3.2, -p.z / 3.2] });
  };
  slab(-W / 2, -ph, -D / 2, D / 2); slab(ph, W / 2, -D / 2, D / 2); slab(-ph, ph, -D / 2, -pz); slab(-ph, ph, pz, D / 2);
  const groundMat = new THREE.MeshLambertMaterial({ map: grass });
  const gu = { tDirt: { value: dirt }, uT1, uT2, uHaze, uPit: { value: new THREE.Vector2(ph, pz) }, uLane: { value: new THREE.Vector3(ph + 0.35, laneEnd, v.frontX - 0.45) },
    uG: { value: [C(PAL.grassL), C(PAL.grassM), C(PAL.grassD)] }, uDirtC: { value: C(PAL.dirt) } };
  groundMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, gu);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vW; uniform sampler2D tDirt; uniform vec3 uT1; uniform vec3 uT2; uniform vec3 uHaze; uniform vec2 uPit; uniform vec3 uLane; uniform vec3 uG[3]; uniform vec3 uDirtC;
      float lineMask(float d, float w) { return 1.0 - smoothstep(w * 0.5, w * 0.5 + 0.015, abs(d)); }
      float lum(vec3 c) { return dot(c, vec3(0.3, 0.55, 0.15)); }`)
      .replace('#include <map_fragment>', `
      vec3 gtex = texture2D(map, vMapUv).rgb;
      vec3 dtex = texture2D(tDirt, vW.xz / 2.4).rgb;
      float n = lum(dtex) - 0.45;
      // large soft colour patches (low-frequency) instead of speckle
      float p1 = lum(texture2D(tDirt, vW.xz / 71.0 + 0.3).rgb), p2 = lum(texture2D(tDirt, vW.xz / 29.0 + 0.7).rgb);
      float pt = smoothstep(0.25, 0.7, p1 * 0.6 + p2 * 0.4);
      vec3 base = mix(uG[2], mix(uG[1], uG[0], smoothstep(0.35, 0.8, pt)), smoothstep(0.0, 0.4, pt));
      vec3 col = base * (0.93 + 0.14 * (lum(gtex) / 0.45 - 1.0) * 0.6);
      float ax = abs(vW.x), az = abs(vW.z);
      // mowing stripes (2 m bands across the field, strongest in the field)
      float field = 1.0 - smoothstep(9.0, 16.0, az) ;
      col *= mix(1.0, mix(0.94, 1.05, step(0.5, fract(vW.x / 4.0 + 0.25))), field);
      // worn dirt: the lanes, a ring around the pit, a footpath in the foreground, tractor tyre marks
      vec3 dcol = uDirtC * (0.85 + 0.35 * (lum(dtex) / 0.45 - 1.0) * 0.7);
      float lane = (1.0 - smoothstep(0.55, 1.05, az + n * 0.5)) * step(uLane.x - 0.2, ax) * (1.0 - smoothstep(uLane.y - 2.5, uLane.y, ax + n));
      float pitD = max(ax - uPit.x, az - uPit.y);
      float ring = 1.0 - smoothstep(0.0, 1.1, pitD + n * 0.6);
      float path = 1.0 - smoothstep(0.5, 0.85, abs(vW.z - (11.6 + sin(vW.x * 0.23) * 1.1)) + n * 0.4);
      float dm = clamp(max(max(lane * 0.85, ring), path * 0.85), 0.0, 1.0);
      col = mix(col, dcol, dm);
      col = mix(col, dcol * 0.55, ring * (1.0 - smoothstep(0.0, 0.35, pitD)) * 0.6); // wet, darker rim right at the pit
      float tyre = (lineMask(vW.z - 0.78, 0.26) + lineMask(vW.z + 0.78, 0.26)) * smoothstep(11.0, 12.5, vW.x) * step(0.35, fract(vW.x * 2.2) + n);
      col = mix(col, col * 0.72, clamp(tyre, 0.0, 1.0) * 0.8);
      // team tint on each lane
      float tl = (1.0 - smoothstep(0.8, 0.86, az)) * step(uLane.x, ax) * step(ax, uLane.y);
      col = mix(col, vW.x < 0.0 ? uT1 : uT2, tl * 0.16);
      // chalk: start lines, dashed lane borders, centre marks beside the pit
      float chalk = lineMask(ax - uLane.z, 0.09) * step(az, 1.25);
      chalk = max(chalk, lineMask(az - 0.95, 0.06) * step(uLane.x, ax) * step(ax, uLane.y - 1.0) * step(0.45, fract(vW.x / 0.8)));
      chalk = max(chalk, lineMask(vW.x, 0.08) * step(uPit.y + 0.35, az) * step(az, uPit.y + 1.6));
      col = mix(col, vec3(0.97, 0.96, 0.9), chalk * 0.85 * (0.75 + 0.25 * step(0.0, n)));
      // contact darkening along the fences and the stands, darker foreground (eye goes to the rope)
      col *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.5, abs(vW.z + 6.6))) - 0.18 * (1.0 - smoothstep(0.0, 0.45, abs(vW.z - 5.4))) * step(ax, 26.0);
      col *= mix(1.0, 0.92, smoothstep(7.0, 17.0, vW.z));
      // atmospheric haze with distance
      float hz = smoothstep(34.0, 85.0, length(vW.xz - vec2(0.0, 2.0)));
      col = mix(col, uHaze, hz * 0.8);
      diffuseColor.rgb = col;`);
  };
  groundMat.customProgramCacheKey = () => 'halat-ground-v2';
  const ground = new THREE.Mesh(gb.build({ team: false }), groundMat); ground.name = 'ground'; ground.receiveShadow = true;
  group.add(ground);

  // ------------------------------------------------------------------ pit walls (mud, world uv) + water with a waterline and wet sheen
  const mud = loadTex(TEX('tex_mud'), pending), mudN = loadTex(TEX('tex_mud_normal'), pending, { srgb: false }), waterN = loadTex(TEX('tex_water_normal'), pending, { srgb: false });
  const pb = new MeshBuilder({ uv: true });
  const depth = 1.3;
  const wall = (len, x, z, ry) => { const g = new THREE.PlaneGeometry(len, depth, 4, 3); g.translate(0, -depth / 2 + 0.02, 0); g.rotateY(ry); g.translate(x, 0, z); pb.add(g, { color: p => C(0xffffff).multiplyScalar(0.45 + 0.55 * (1 + p.y / depth)), uv: p => [(p.x + p.z) / 1.6, p.y / 1.6] }); };
  wall(pz * 2, -ph, 0, Math.PI / 2); wall(pz * 2, ph, 0, -Math.PI / 2); wall(ph * 2, 0, -pz, 0); wall(ph * 2, 0, pz, Math.PI);
  const pitWalls = new THREE.Mesh(pb.build({ team: false }), new THREE.MeshLambertMaterial({ map: mud, vertexColors: true, color: 0xc49a72 }));
  pitWalls.name = 'pit'; group.add(pitWalls);
  const wg = new THREE.PlaneGeometry(ph * 2, pz * 2, 12, 24); wg.rotateX(-Math.PI / 2);
  const wuv = wg.attributes.uv; for (let i = 0; i < wuv.count; i++) wuv.setXY(i, wg.attributes.position.getX(i) / 1.4, wg.attributes.position.getZ(i) / 1.4);
  const waterMat = new THREE.MeshPhongMaterial({ map: mud, normalMap: waterN, normalScale: new THREE.Vector2(0.6, 0.6), color: 0xffffff, shininess: 60, specular: 0x3a3328, emissive: 0x140c04 });
  const wu = { uTime, tN2: { value: mudN }, uPit: { value: new THREE.Vector2(ph, pz) } };
  waterMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, wu);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying vec2 vP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vP = position.xz;
        transformed.y += sin(position.x * 3.1 + uTime * 1.7) * 0.012 + sin(position.z * 2.3 - uTime * 1.3) * 0.014;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform sampler2D tN2; uniform vec2 uPit; varying vec2 vP;')
      .replace('#include <normal_fragment_maps>', `
        vec3 n1 = texture2D(normalMap, vNormalMapUv + vec2(uTime * 0.021, uTime * 0.012)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(tN2, vNormalMapUv * 0.7 + vec2(-uTime * 0.013, uTime * 0.017)).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(vec3((n1.xy + n2.xy) * normalScale, n1.z * n2.z));
        normal = normalize(tbn * mapN);`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb * vec3(1.05, 0.95, 0.8), vec3(0.5, 0.36, 0.21), 0.35);                     // lighter muddy water, less texture contrast
        diffuseColor.rgb *= 0.9 + 0.1 * sin(vMapUv.x * 2.0 + uTime * 0.4) * sin(vMapUv.y * 1.7 - uTime * 0.3);
        float edge = min(uPit.x - abs(vP.x), uPit.y - abs(vP.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.78, 0.64), (1.0 - smoothstep(0.03, 0.09, edge)) * 0.85); // waterline foam
        diffuseColor.rgb *= 0.78 + 0.22 * smoothstep(0.0, 0.5, edge);`)
      .replace('#include <opaque_fragment>', `
        float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
        outgoingLight += vec3(0.62, 0.66, 0.62) * fres * 0.12;                                       // sky sheen at grazing angles
        #include <opaque_fragment>`);
  };
  waterMat.customProgramCacheKey = () => 'halat-water-v2';
  const water = new THREE.Mesh(wg, waterMat); water.position.y = waterY; water.name = 'water'; water.receiveShadow = true;
  group.add(water);

  // ------------------------------------------------------------------ static props (one merged mesh)
  const sb = new MeshBuilder();
  const add = (g, color, m, o = {}) => sb.add(g, { color, matrix: m, ...o });
  const box = (w, h, d, color, pos, rot = [0, 0, 0], o = {}) => add(new THREE.BoxGeometry(w, h, d).deleteAttribute('uv'), color, M4.trs(pos, rot), o);
  const rbox = (w, h, d, rr, color, pos, rot = [0, 0, 0], o = {}) => add(roundedBox(w, h, d, Math.min(rr, w / 2.05, h / 2.05, d / 2.05), 1), color, M4.trs(pos, rot), o);
  const cyl = (rt, rb, h, seg, color, pos, rot = [0, 0, 0], o = {}) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.deleteAttribute('uv'); return add(g, color, M4.trs(pos, rot), o); };
  const blob = (rx, ry, rz, color, pos, o = {}) => { const m = Math.max(rx, ry, rz); return add(m < 0.16 ? ellipsoid(rx, ry, rz, 5, 3) : m < 0.6 ? ellipsoid(rx, ry, rz, 7, 5) : ellipsoid(rx, ry, rz, 10, 7), color, M4.t(...pos), o); };
  const vary = (hex, k = 0.12) => C(hex).multiplyScalar(1 - k + r() * 2 * k);
  const plank = (len, w, t, pos, rot = [0, 0, 0]) => { rbox(len, t, w, 0.018, vary(PAL.wood, 0.1), pos, rot); }; // wood plank, rounded edges
  const TEAM1 = { team: T1 }, TEAM2 = { team: T2 };
  const teamOf = (x, s = 1) => ({ team: x < 0 ? T1 * s : 2 + s });

  // pit edging: planks with end grain + corner posts with rope wrap; a wet-mud lip
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const z = -pz + pz / 3 * (2 * k + 1), L = pz * 2 / 3 - 0.04;
    plank(L, 0.24, 0.16, [sx * (ph + 0.12), 0.05 + (k % 2) * 0.008, z], [0, Math.PI / 2, 0]);
    for (const e of [-1, 1]) box(0.2, 0.12, 0.012, PAL.grain, [sx * (ph + 0.12), 0.05, z + e * (L / 2 + 0.002)]);
  }
  for (const sz of [-1, 1]) for (let k = 0; k < 2; k++) plank(ph - 0.04, 0.22, 0.15, [-ph / 2 + k * ph, 0.045, sz * (pz + 0.11)], [0, 0, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { cyl(0.11, 0.12, 0.5, 8, PAL.woodD, [sx * (ph + 0.14), 0.2, sz * (pz + 0.13)]); cyl(0.105, 0.105, 0.012, 8, PAL.grain, [sx * (ph + 0.14), 0.456, sz * (pz + 0.13)]); add(band(0.12, 0.08, 0.025, 10), 0xd8c08a, M4.t(sx * (ph + 0.14), 0.3, sz * (pz + 0.13))); }
  for (let k = 0; k < 10; k++) { const a = r() * 6.28; const x = Math.cos(a) * (ph + 0.55 + r() * 1.0), z = Math.sin(a) * (pz + 0.5 + r() * 0.7); add(ellipsoid(0.16 + r() * 0.22, 0.012, 0.1 + r() * 0.15, 8, 3), PAL.mudWet, M4.trs([x, 0.008, z], [0, r() * 3, 0])); }

  // low rope barriers keep the team crowds back from the lanes (spectators stay behind them)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x0 = sx * (v.frontX - 1.0), x1 = sx * (laneEnd - 0.5), z = sz * 3.05;
    const nP = Math.round(Math.abs(x1 - x0) / 1.9);
    for (let k = 0; k <= nP; k++) { const x = x0 + (x1 - x0) * k / nP; cyl(0.035, 0.045, 0.75, 6, PAL.white, [x, 0.375, z]); blob(0.05, 0.05, 0.05, PAL.yellow, [x, 0.77, z]); }
    for (let k = 0; k < nP; k++) { const xa = x0 + (x1 - x0) * k / nP, xb = x0 + (x1 - x0) * (k + 1) / nP; const pts = []; for (let j = 0; j <= 6; j++) { const t = j / 6; pts.push([xa + (xb - xa) * t, 0.68 - 0.12 * 4 * t * (1 - t), z]); } add(tube(pts, 0.014, 4, { caps: false }), 0xd9c39a, null); }
  }

  // back fence (white rails) and front fence (wood), rounded posts
  const fence = (z, x0, x1, h, col, gap = 1.6) => {
    for (let x = x0; x <= x1 + 1e-6; x += gap) rbox(0.13, h, 0.13, 0.04, vary(col, 0.05), [x, h / 2, z]);
    for (const y of [h * 0.45, h * 0.88]) rbox(x1 - x0, 0.09, 0.06, 0.03, col, [(x0 + x1) / 2, y, z + 0.07]);
  };
  fence(-6.6, -32, 32, 1.0, PAL.cream);
  fence(5.4, -28, 28, 0.75, PAL.wood);
  // team banners on the back fence: soft fabric gradient (lighter at the top), white trim and emblem
  for (let k = 0; k < 6; k++) {
    const sx = k < 3 ? -1 : 1, x = sx * (3.6 + (k % 3) * 3.5);
    const g = new THREE.PlaneGeometry(1.2, 0.86, 4, 3); g.deleteAttribute('uv');
    add(g, p => C(0xffffff).multiplyScalar(0.84 + 0.16 * (p.y - 0.19) / 0.86), M4.t(x, 0.62, -6.5), { ...teamOf(x), wave: p => 0.22 * (1.05 - p.y) });
    rbox(1.26, 0.07, 0.04, 0.02, PAL.white, [x, 1.06, -6.49]);
    const em = new THREE.CircleGeometry(0.17, 12); em.deleteAttribute('uv'); add(em, PAL.white, M4.t(x, 0.64, -6.475), { wave: 0.06 });
  }

  // stands: lower, further back; wood seats with plank seams, cream risers, short muted awning
  const sx0 = -22, sx1 = 22, rows = 4;
  for (let row = 0; row < rows; row++) {
    const y = 0.45 + row * 0.42, z = -8.6 - row * 0.95;
    rbox(sx1 - sx0, y, 0.95, 0.04, row % 2 ? 0xe6dcc6 : 0xdccfb5, [0, y / 2, z]);
    for (let s = sx0; s < sx1; s += 4) rbox(3.96, 0.07, 0.42, 0.02, vary(PAL.wood, 0.08), [s + 2, y + 0.035, z + 0.2]);
  }
  for (const x of [sx0 - 0.15, sx1 + 0.15]) rbox(0.3, 2.4, 4.2, 0.06, 0xd2c3a2, [x, 1.2, -10.0]);
  for (let x = sx0; x <= sx1; x += 5.5) { cyl(0.06, 0.06, 3.1, 6, PAL.white, [x, 1.55 + 1.55, -8.2]); cyl(0.06, 0.06, 4.0, 6, PAL.white, [x, 2.0, -12.3]); }
  for (let k = 0; k < 22; k++) { // awning: wide cream stripes with narrow muted team stripes, slight sag, scalloped valance
    const x = sx0 + (k + 0.5) * 2, teamStripe = k % 2 === 0;
    const g = new THREE.PlaneGeometry(2, 4.4, 1, 3); g.deleteAttribute('uv'); g.rotateX(-Math.PI / 2 + 0.24);
    warp(g, p => { p.y -= 0.08 * Math.sin((p.z / 4.4 + 0.5) * Math.PI); });
    add(g, teamStripe ? PAL.white : PAL.cream, M4.t(x, 4.05, -10.2), teamStripe ? teamOf(x, 0.55) : {});
    for (let j = 0; j < 4; j++) { const sc = new THREE.CircleGeometry(0.25, 8, Math.PI, Math.PI); sc.deleteAttribute('uv'); add(sc, teamStripe ? PAL.white : PAL.cream, M4.t(x - 0.75 + j * 0.5, 3.6, -8.05), { ...(teamStripe ? teamOf(x, 0.55) : {}), wave: 0.1 }); }
  }

  // team flags on tall poles behind each line (cloth flies outward, sways), soft fabric gradient
  const flagX = v.frontX + v.slotGap * (v.pullersPerSide - 1) + 1.2;
  for (const sx of [-1, 1]) {
    cyl(0.05, 0.065, 4.4, 8, PAL.white, [sx * flagX, 2.2, -2.4]);
    blob(0.09, 0.09, 0.09, PAL.yellow, [sx * flagX, 4.45, -2.4]);
    const fg = new THREE.PlaneGeometry(1.7, 1.05, 10, 3); fg.deleteAttribute('uv'); fg.translate(0.85, 0, 0); fg.scale(sx, 1, 1); if (sx < 0) fg.index.array.reverse();
    add(fg, p => C(0xffffff).multiplyScalar(0.86 + 0.14 * (p.y - 3.22) / 1.05), M4.t(sx * flagX, 3.75, -2.4), { ...(sx < 0 ? TEAM1 : TEAM2), wave: p => Math.abs(p.x - sx * flagX) / 1.7 });
    const eg = new THREE.PlaneGeometry(1.7, 0.14, 10, 1); eg.deleteAttribute('uv'); eg.translate(0.85, 0, 0.004); eg.scale(sx, 1, 1); if (sx < 0) eg.index.array.reverse();
    add(eg, PAL.white, M4.t(sx * flagX, 3.75, -2.4), { wave: p => Math.abs(p.x - sx * flagX) / 1.7 });
  }

  // bunting: pennants in the warm palette (every 4th in a team colour), sway
  const PENNANTS = [PAL.yellow, PAL.white, PAL.teal, 0xe9895a];
  const bunting = (x0, x1, y, z, sag = 0.35, step = 0.55, teamSides = true) => {
    const n = Math.floor((x1 - x0) / step);
    const pts = []; for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push([x0 + (x1 - x0) * t, y - sag * 4 * t * (1 - t), z]); }
    add(tube(pts, 0.012, 4, { caps: false }), 0x6b5a48, null);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = x0 + (x1 - x0) * t, yy = y - sag * 4 * t * (1 - t);
      const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.17, 0, 0), new THREE.Vector3(0.17, 0, 0), new THREE.Vector3(0, -0.32, 0)]); tri.setIndex([0, 2, 1, 0, 1, 2]);
      const tm = teamSides && k % 4 === 0;
      add(tri, tm ? PAL.white : PENNANTS[k % PENNANTS.length], M4.t(x, yy, z), { ...(tm ? teamOf(x, 0.8) : {}), wave: p => 0.5 * (yy - p.y) / 0.32 + 0.15 });
    }
  };
  for (let k = 0; k < 8; k++) { const x0 = -22 + k * 5.5; bunting(x0, x0 + 5.5, 3.05, -8.15, 0.3); }

  // hay bales: round (wrapped), in deliberate groups; square bales by the stands
  const hay = (x, z, rot = 0, s = 1) => {
    const g = new THREE.CylinderGeometry(0.5 * s, 0.5 * s, 0.85 * s, 14, 1); g.deleteAttribute('uv'); g.rotateZ(Math.PI / 2);
    add(warp(g, p => { p.y *= 1 + 0.04 * Math.sin(p.x * 30); p.z *= 1 + 0.03 * Math.sin(p.x * 23); }), p => C(0xe2c26a).multiplyScalar((Math.abs(p.x) > 0.4 * s ? 0.84 : 1) * (0.75 + 0.25 * Math.min(1, p.y / 0.35 + 0.4))), M4.trs([x, 0.5 * s, z], [0, rot, 0]));
    for (const o of [-0.22, 0.22]) add(band(0.505 * s, 0.05, 0.012, 14).rotateZ(Math.PI / 2), 0xb48a3a, M4.trs([x, 0.5 * s, z], [0, rot, 0]).multiply(M4.t(o * s, 0, 0)));
  };
  const BALES = [[-6.7, -4.0, 0.3], [-7.6, -4.9, 1.2], [-5.8, -5.0, 1.5], [6.9, -3.9, -0.4], [7.5, -5.0, 0.2], [-15.5, -3.6, 0.2], [15.8, -3.4, -0.2], [-10.2, 8.3, 0.5], [-11.1, 9.0, 1.1], [17, 7.6, 0.4]];
  for (const [x, z, rt] of BALES) hay(x, z, rt);
  for (const [x, z] of [[-19.5, -6.0], [19.5, -6.0]]) for (let k = 0; k < 3; k++) rbox(1.0, 0.5, 0.55, 0.08, 0xdcbc62, [x + (k === 2 ? 0.25 : (k - 0.5) * 1.05), 0.25 + (k === 2 ? 0.5 : 0), z], [0, 0.1, 0]);
  // a dog asleep by the bales (curled up)
  {
    const x = -5.6, z = -3.6, fur = 0xc98e4f;
    add(ellipsoid(0.32, 0.17, 0.22, 10, 6), fur, M4.trs([x, 0.15, z], [0, 0.4, 0]));
    blob(0.13, 0.11, 0.14, fur, [x + 0.24, 0.13, z + 0.17]); blob(0.06, 0.05, 0.07, 0xf1d8b5, [x + 0.3, 0.11, z + 0.28]); blob(0.025, 0.02, 0.02, 0x2a2420, [x + 0.32, 0.13, z + 0.34]);
    for (const s of [-1, 1]) add(ellipsoid(0.05, 0.09, 0.025, 6, 4), 0x8c5a2e, M4.trs([x + 0.24 + s * 0.09, 0.18, z + 0.13], [0.6, 0, s * 0.7]));
    add(tube([[x - 0.3, 0.12, z - 0.05], [x - 0.36, 0.1, z + 0.12], [x - 0.22, 0.08, z + 0.24]], 0.035, 5), fur, null);
    add(ellipsoid(0.2, 0.02, 0.14, 8, 3), 0x8a3f3a, M4.trs([x + 0.05, 0.006, z + 0.05], [0, 0.4, 0])); // little blanket
  }

  // davul drums (red body, white skins, rope zigzag) on low stands near the pit
  const drum = (x, z, rot) => {
    const m = M4.trs([x, 0.62, z], [0, rot, Math.PI / 2]);
    add(new THREE.CylinderGeometry(0.34, 0.34, 0.34, 18, 1).deleteAttribute('uv'), PAL.red, m);
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.355, 0.355, 0.04, 18, 1).deleteAttribute('uv'), 0xf3ead6, m.clone().multiply(M4.t(0, s * 0.18, 0)));
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, a2 = a + Math.PI / 8; add(tube([[Math.cos(a) * 0.35, -0.16, Math.sin(a) * 0.35], [Math.cos(a2) * 0.35, 0.16, Math.sin(a2) * 0.35]], 0.012, 4), 0xf1e3b2, m); }
    for (const s of [-1, 1]) cyl(0.03, 0.03, 0.42, 5, PAL.woodD, [x + s * 0.18, 0.21, z], [s * 0.2, 0, 0]);
    add(tube([[x - 0.25, 0.96, z + 0.2], [x - 0.1, 1.05, z + 0.25], [x + 0.05, 1.12, z + 0.32]], 0.018, 5), PAL.woodD, null);
  };
  drum(-3.3, -4.0, 0.3); drum(3.5, -3.9, -0.4);

  // referee table behind the pit: cloth, whistle, a small flag stand, a stool
  {
    const x = 0, z = -4.3;
    rbox(1.3, 0.06, 0.6, 0.02, PAL.wood, [x, 0.74, z]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(0.03, 0.03, 0.72, 5, PAL.woodD, [x + sx * 0.58, 0.36, z + sz * 0.24]);
    add(warp(roundedBox(1.36, 0.3, 0.66, 0.02, 1), p => { if (p.y < 0) { p.x *= 1.02; p.z *= 1.04; } }), PAL.white, M4.t(x, 0.64, z));
    cyl(0.025, 0.025, 0.07, 8, PAL.yellow, [x - 0.3, 0.8, z + 0.1], [0, 0, Math.PI / 2]); add(band(0.03, 0.01, 0.006, 8), 0x333333, M4.t(x - 0.36, 0.8, z + 0.1));
    cyl(0.01, 0.01, 0.45, 4, PAL.woodD, [x + 0.35, 0.99, z]); const f = new THREE.PlaneGeometry(0.24, 0.16); f.deleteAttribute('uv'); f.translate(0.12, 0, 0);
    add(f, PAL.yellow, M4.t(x + 0.35, 1.14, z), { wave: 0.4 }); add(f.clone().rotateY(Math.PI), PAL.yellow, M4.t(x + 0.35, 1.14, z), { wave: 0.4 });
    rbox(0.32, 0.05, 0.32, 0.02, PAL.wood, [x + 0.4, 0.45, z - 0.55]); for (const a of [0, 2.1, 4.2]) cyl(0.02, 0.02, 0.44, 4, PAL.woodD, [x + 0.4 + Math.cos(a) * 0.1, 0.22, z - 0.55 + Math.sin(a) * 0.1]);
  }
  // rope coil and stakes at the left lane end; chalk-line marker cart by the right start line
  {
    const x = -(laneEnd - 0.8), z = 2.0;
    for (let k = 0; k < 4; k++) add(band(0.3 - k * 0.02, 0.05, 0.05, 16), vary(0xd9c39a, 0.05), M4.t(x, 0.03 + k * 0.05, z));
    for (const s of [-1, 1]) { cyl(0.025, 0.012, 0.35, 5, PAL.woodD, [x + 0.7 + s * 0.12, 0.12, z + 0.3], [0.3, 0, s * 0.2]); }
    const cx = v.frontX + 0.2, cz = 1.55;
    rbox(0.3, 0.22, 0.4, 0.04, 0x3e7cc0, [cx, 0.2, cz]); add(band(0.08, 0.04, 0.03, 10).rotateZ(Math.PI / 2), 0x333333, M4.t(cx, 0.09, cz + 0.17));
    add(tube([[cx, 0.28, cz - 0.15], [cx, 0.6, cz - 0.45], [cx, 0.85, cz - 0.6]], 0.015, 4), PAL.slate, null); box(0.22, 0.03, 0.03, PAL.slate, [cx, 0.85, cz - 0.6]);
    add(ellipsoid(0.16, 0.004, 0.1, 6, 2), 0xf4f4f0, M4.t(cx, 0.004, cz + 0.4));
  }
  // team benches by the gazebos: water bottles with team caps and folded towels
  const bench = (x, z, side) => {
    rbox(1.6, 0.06, 0.34, 0.02, PAL.wood, [x, 0.44, z]); for (const s of [-1, 1]) rbox(0.06, 0.42, 0.3, 0.02, PAL.woodD, [x + s * 0.7, 0.21, z]);
    for (let k = 0; k < 4; k++) { const bx = x - 0.55 + k * 0.17; cyl(0.045, 0.045, 0.2, 8, 0xe6eef0, [bx, 0.57, z]); cyl(0.03, 0.03, 0.04, 8, 0xffffff, [bx, 0.69, z], [0, 0, 0], side); }
    rbox(0.36, 0.06, 0.26, 0.02, 0xffffff, [x + 0.4, 0.5, z], [0, 0.2, 0], side); rbox(0.34, 0.04, 0.24, 0.02, PAL.white, [x + 0.38, 0.55, z + 0.02], [0, 0.1, 0]);
  };

  // team gazebos within the camera's view (team canopy, scalloped valance) with their benches
  const gazebo = (x, z, team) => {
    const w = 2.8, d = 2.2, tm = { team };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(0.06, 0.06, 2.3, 6, PAL.white, [x + sx * w / 2, 1.15, z + sz * d / 2]);
    add(new THREE.ConeGeometry(w * 0.82, 0.9, 4, 1).deleteAttribute('uv'), p => C(0xffffff).multiplyScalar(0.88 + 0.12 * (p.y - 2.3) / 0.9), M4.trs([x, 2.75, z], [0, Math.PI / 4, 0]), tm);
    blob(0.1, 0.1, 0.1, PAL.yellow, [x, 3.25, z]);
    for (const [ax, az, ry] of [[0, d / 2, 0], [0, -d / 2, Math.PI], [w / 2, 0, Math.PI / 2], [-w / 2, 0, -Math.PI / 2]]) {
      const len = ry % Math.PI === 0 ? w : d;
      for (let k = 0; k < 6; k++) { const g = new THREE.CircleGeometry(len / 12, 8, Math.PI, Math.PI); g.deleteAttribute('uv'); add(g, k % 2 ? PAL.white : 0xffffff, M4.trs([x + ax + (ry % Math.PI === 0 ? (k - 2.5) * len / 6 : 0), 2.3, z + az + (ry % Math.PI === 0 ? 0 : (k - 2.5) * len / 6)], [0, ry, 0]), { ...(k % 2 ? {} : tm), wave: 0.12 }); }
    }
    bench(x, z - 0.2, tm);
  };
  gazebo(-9.6, -4.9, T1); gazebo(9.6, -4.9, T2);

  // scoreboard prop (team panels, wood frame) and the title sign posts
  {
    const x = -6.4, z = -6.0;
    for (const sx of [-1, 1]) cyl(0.08, 0.09, 3.0, 6, PAL.woodD, [x + sx * 1.2, 1.5, z]);
    rbox(2.8, 1.5, 0.18, 0.08, 0x4a3426, [x, 2.35, z]);
    rbox(1.2, 1.1, 0.06, 0.05, 0xffffff, [x - 0.65, 2.32, z + 0.1], [0, 0, 0], TEAM1);
    rbox(1.2, 1.1, 0.06, 0.05, 0xffffff, [x + 0.65, 2.32, z + 0.1], [0, 0, 0], TEAM2);
    for (const sx of [-1, 1]) { rbox(0.5, 0.7, 0.04, 0.05, 0x1d1f26, [x + sx * 0.65, 2.3, z + 0.14]); for (const dy of [-0.18, 0.18]) rbox(0.28, 0.06, 0.03, 0.02, 0xffe066, [x + sx * 0.65, 2.3 + dy, z + 0.16]); }
    rbox(0.08, 0.08, 0.04, 0.02, 0xffffff, [x, 2.42, z + 0.12]); rbox(0.08, 0.08, 0.04, 0.02, 0xffffff, [x, 2.22, z + 0.12]);
  }
  for (const sx of [-2.05, 2.05]) cyl(0.07, 0.08, 2.5, 6, PAL.woodD, [sx, 1.25, -6.42]);

  // pit dressing: warning sign, small team pennants at the corners, a bucket
  {
    cyl(0.04, 0.04, 1.3, 6, PAL.woodD, [ph + 0.5, 0.65, -pz - 0.5]);
    add(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 3).deleteAttribute('uv').rotateX(Math.PI / 2).rotateZ(Math.PI / 2), PAL.yellow, M4.t(ph + 0.5, 1.35, -pz - 0.46));
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 3).deleteAttribute('uv').rotateX(Math.PI / 2).rotateZ(Math.PI / 2), PAL.red, M4.t(ph + 0.5, 1.33, -pz - 0.45));
    rbox(0.07, 0.22, 0.04, 0.02, 0xffffff, [ph + 0.5, 1.37, -pz - 0.41]); blob(0.04, 0.04, 0.02, 0xffffff, [ph + 0.5, 1.21, -pz - 0.41]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cyl(0.025, 0.025, 1.1, 5, PAL.white, [sx * (ph + 0.14), 0.75, sz * (pz + 0.13)]);
      const fg = new THREE.PlaneGeometry(0.4, 0.26, 3, 1); fg.deleteAttribute('uv'); fg.translate(0.2, 0, 0); const fg2 = fg.clone(); fg2.index.array.reverse();
      for (const g of [fg, fg2]) add(g, 0xffffff, M4.t(sx * (ph + 0.14), 1.15, sz * (pz + 0.13)), { team: sx < 0 ? T1 : T2, wave: p => Math.abs(p.x - sx * (ph + 0.14)) * 1.5 });
    }
    cyl(0.16, 0.12, 0.26, 10, PAL.slate, [-ph - 0.6, 0.13, pz + 0.6]); add(band(0.15, 0.02, 0.012, 10), 0x5d6870, M4.t(-ph - 0.6, 0.25, pz + 0.6));
  }

  // market tents at the back corners (striped, scalloped)
  const tent = (x, z, w, d, team) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(0.05, 0.05, 2.2, 6, PAL.white, [x + sx * w / 2, 1.1, z + sz * d / 2]);
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(w / 6, d / 2 * 1.12, 1, 1); g.deleteAttribute('uv'); g.rotateX(-Math.PI / 2 + s * 0.42); if (s > 0) g.index.array.reverse();
      add(g, k % 2 ? PAL.cream : 0xffffff, M4.t(x - w / 2 + (k + 0.5) * w / 6, 2.42, z + s * d / 4), k % 2 ? {} : { team: team === T1 ? 0.6 : 2.6 });
    }
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { const sc = new THREE.CircleGeometry(w / 12, 8, Math.PI, Math.PI); sc.deleteAttribute('uv'); if (s < 0) sc.rotateY(Math.PI); add(sc, PAL.cream, M4.t(x - w / 2 + (k + 0.5) * w / 6, 2.2, z + s * (d / 2 + 0.02)), { wave: 0.15 }); }
    rbox(w * 0.85, 0.85, 0.5, 0.06, PAL.wood, [x, 0.43, z + d / 2 - 0.3]);
  };
  tent(-19.5, -4.2, 3.2, 2.4, T1); tent(19.5, -4.2, 3.2, 2.4, T2); tent(-24, -1.5, 2.8, 2.2, T1); tent(24, -1.5, 2.8, 2.2, T2);

  // çay stand in the foreground: counter, scalloped roof, a proper semaver (tea urn), tulip glasses on saucers
  {
    const x = 6.2, z = 9.0;
    rbox(2.2, 1.0, 0.8, 0.07, 0x3a6d9e, [x, 0.5, z]); rbox(2.4, 0.08, 1.0, 0.03, PAL.cream, [x, 1.04, z]);
    for (const sx of [-1, 1]) cyl(0.05, 0.05, 2.3, 6, PAL.cream, [x + sx * 1.05, 1.15, z - 0.3]);
    for (let k = 0; k < 6; k++) { const g = new THREE.PlaneGeometry(0.4, 1.3); g.deleteAttribute('uv'); g.rotateX(-Math.PI / 2 + 0.3); add(g, k % 2 ? PAL.white : PAL.red, M4.t(x - 1.0 + k * 0.4, 2.32, z - 0.1)); }
    for (let k = 0; k < 6; k++) { const sc = new THREE.CircleGeometry(0.2, 8, Math.PI, Math.PI); sc.deleteAttribute('uv'); add(sc, k % 2 ? PAL.white : PAL.red, M4.t(x - 1.0 + k * 0.4, 2.12, z + 0.53), { wave: 0.12 }); }
    const sx = x - 0.62; // semaver
    cyl(0.12, 0.16, 0.08, 10, 0xc9ccd2, [sx, 1.12, z]); add(capsule([{ y: 0, rx: 0.16 }, { y: 0.22, rx: 0.15 }], 10, 2), 0xd8dbe0, M4.t(sx, 1.2, z)); cyl(0.05, 0.08, 0.1, 8, 0xc9ccd2, [sx, 1.62, z]);
    add(ellipsoid(0.1, 0.07, 0.1, 8, 5), 0xc84a2e, M4.t(sx, 1.72, z)); cyl(0.012, 0.012, 0.1, 4, 0xc9ccd2, [sx + 0.17, 1.28, z], [0, 0, Math.PI / 2]);
    for (let k = 0; k < 5; k++) { const gx = x + 0.05 + k * 0.17; cyl(0.045, 0.045, 0.012, 8, 0xf3ead6, [gx, 1.09, z + 0.15]); cyl(0.03, 0.022, 0.08, 6, 0xb5442a, [gx, 1.14, z + 0.15]); }
    const BAL = [0xef6f6c, PAL.yellow, PAL.teal, 0xb48ad6, 0xf29b5a];
    for (let k = 0; k < 5; k++) { const bx = 7.6 + (k - 2) * 0.22, by = 3.0 + (k % 2) * 0.3; blob(0.17, 0.21, 0.17, BAL[k], [bx, by, 9.1], { wave: 0.6 }); add(tube([[7.4, 1.1, 9.1], [bx, by - 0.2, 9.1]], 0.006, 3, { caps: false }), 0xffffff, null); }
  }
  { // ice cream cart
    const x = -7.4, z = 10.4;
    rbox(1.4, 0.7, 0.8, 0.1, 0xf6f2e8, [x, 0.75, z]); rbox(1.42, 0.12, 0.82, 0.05, 0xef8fa8, [x, 0.5, z]);
    for (const sx of [-1, 1]) add(band(0.24, 0.08, 0.08, 12).rotateZ(Math.PI / 2), 0x3b3d45, M4.t(x + sx * 0.5, 0.24, z + 0.44));
    cyl(0.03, 0.03, 1.4, 5, PAL.cream, [x, 1.6, z]);
    add(new THREE.ConeGeometry(0.9, 0.45, 8).deleteAttribute('uv'), p => C((Math.floor((Math.atan2(p.z - z, p.x - x) + 3.2) / 0.785) % 2) ? 0xffffff : 0xef8fa8), M4.t(x, 2.35, z));
    blob(0.11, 0.11, 0.11, 0xffd9e4, [x - 0.3, 1.18, z]); blob(0.11, 0.11, 0.11, 0xfff1b5, [x, 1.18, z]); blob(0.11, 0.11, 0.11, 0xc89a6a, [x + 0.3, 1.18, z]);
  }
  for (const x of [-18, -6, 6, 18]) { cyl(0.05, 0.06, 2.2, 6, 0x3b3d45, [x, 1.1, 5.2]); blob(0.14, 0.18, 0.14, 0xfff3c4, [x, 2.3, 5.2]); }
  for (const [a, b] of [[-18, -6], [6, 18]]) bunting(a, b, 1.95, 5.2, 0.35, 0.5, false);
  // picnic blankets (checkered) in loose places
  const checker = (x, z, rot, col) => { const base = M4.trs([x, 0.01, z], [0, rot, 0]); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) add(new THREE.BoxGeometry(0.42, 0.015, 0.42).deleteAttribute('uv'), (i + j) % 2 ? PAL.white : col, base.clone().multiply(M4.t((i - 1.5) * 0.42, 0, (j - 1.5) * 0.42))); };
  checker(-3.6, 8.3, 0.25, 0xd06a52); checker(1.6, 10.1, -0.4, 0x5b8fbf); checker(-14.5, 9.4, 0.6, 0x6fae6a);
  add(warp(roundedBox(0.36, 0.22, 0.26, 0.04, 1), p => {}), 0xc9a26a, M4.trs([-2.7, 0.12, 8.8], [0, 0.3, 0])); add(tube([[-2.85, 0.24, 8.75], [-2.7, 0.38, 8.8], [-2.55, 0.24, 8.85]], 0.015, 4), 0x8a5c34, null); // basket

  // a hay cart parked on the foreground path, and a bench with two tea glasses
  { const x = 3.8, z = 12.7, m = M4.trs([x, 0, z], [0, -0.25, 0]);
    add(roundedBox(1.8, 0.12, 1.0, 0.03, 1).translate(0, 0.62, 0), PAL.wood, m); for (const s of [-1, 1]) add(roundedBox(1.8, 0.28, 0.06, 0.02, 1).translate(0, 0.8, s * 0.5), PAL.woodD, m);
    for (const s of [-1, 1]) { add(band(0.36, 0.07, 0.08, 14).rotateX(Math.PI / 2).translate(0.2, 0.38, s * 0.58), PAL.woodD, m); add(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8).deleteAttribute('uv').rotateX(Math.PI / 2).translate(0.2, 0.38, s * 0.58), PAL.grain, m); }
    add(warp(ellipsoid(0.8, 0.35, 0.45, 10, 6), p => { if (p.y < 0) p.y *= 0.3; p.y += 0.04 * Math.sin(p.x * 13); }), 0xe2c26a, m.clone().multiply(M4.t(0, 0.78, 0)));
    add(tube([[-0.9, 0.62, -0.2], [-1.7, 0.4, -0.25]], 0.03, 4), PAL.woodD, m); add(tube([[-0.9, 0.62, 0.2], [-1.7, 0.4, 0.25]], 0.03, 4), PAL.woodD, m); }
  { const x = -15.8, z = 12.3; rbox(1.4, 0.06, 0.36, 0.02, PAL.wood, [x, 0.44, z]); for (const s of [-1, 1]) rbox(0.06, 0.42, 0.3, 0.02, PAL.woodD, [x + s * 0.6, 0.21, z]); for (const s of [-0.2, 0.25]) { cyl(0.045, 0.045, 0.012, 8, 0xf3ead6, [x + s, 0.48, z]); cyl(0.03, 0.022, 0.08, 6, 0xb5442a, [x + s, 0.53, z]); } }

  // ground detail in deliberate clusters with breathing space: flower patches, tufts along edges, stone groups
  const FLOWERS = [0xef6f6c, PAL.yellow, 0xffffff, 0xb48ad6, 0xf29b5a];
  const clusterAt = (cx, cz, n, rad, fn) => { for (let k = 0; k < n; k++) { const a = r() * 6.28, d = Math.sqrt(r()) * rad; fn(cx + Math.cos(a) * d, cz + Math.sin(a) * d * 0.7, k); } };
  for (const [cx, cz, n] of [[-12.5, 6.9, 14], [-4.8, 6.8, 9], [3.5, 6.9, 12], [12.5, 6.8, 10], [-20, 7.2, 12], [20.5, 7.0, 9], [-8.5, 12.8, 10], [10.5, 13.2, 12], [0.5, 13.6, 7]]) {
    const col = FLOWERS[Math.floor(r() * FLOWERS.length)];
    clusterAt(cx, cz, n, 0.9, (x, z, k) => { blob(0.13 + r() * 0.07, 0.1, 0.13, vary(PAL.leafD, 0.1), [x, 0.05, z]); blob(0.045, 0.045, 0.045, k % 3 ? col : PAL.white, [x + (r() - 0.5) * 0.1, 0.15, z + (r() - 0.5) * 0.1]); });
  }
  const tuft = (x, z, s) => { for (let j = 0; j < 3; j++) add(new THREE.ConeGeometry(0.035 * s, 0.26 * s, 4).deleteAttribute('uv'), vary(PAL.grassD, 0.15), M4.trs([x + (j - 1) * 0.05 * s, 0.12 * s, z + (r() - 0.5) * 0.05], [(r() - 0.5) * 0.5, 0, (j - 1) * 0.35])); };
  for (let x = -27; x <= 27; x += 1.6) if (r() < 0.75) clusterAt(x + 0.3, 5.55, 3, 0.25, (a, b) => tuft(a, b, 0.8 + r() * 0.5)); // along the front fence
  for (let x = -26; x <= 26; x += 3.1) clusterAt(x, 14.0, 4, 0.5, (a, b) => tuft(a, b, 0.9 + r() * 0.6));
  for (const [cx, cz] of [[-16, 11.5], [-2, 15.2], [14.5, 11.9], [22, 15.5], [-23, 14.8]]) clusterAt(cx, cz, 4, 0.5, (x, z) => add(warp(ellipsoid(0.16 + r() * 0.2, 0.12, 0.15, 7, 5), p => { p.y = Math.max(p.y, -0.01); }), vary(0xb9b2a6, 0.1), M4.trs([x, 0.02, z], [0, r() * 3, 0])));
  // picket fence and flowering hedge along the bottom of the frame
  for (let x = -27; x <= 27; x += 1.2) rbox(0.1, 0.55, 0.06, 0.03, vary(PAL.white, 0.03), [x, 0.27, 14.4]);
  rbox(54, 0.07, 0.04, 0.02, PAL.white, [0, 0.42, 14.43]);
  for (let k = 0; k < 60; k++) { const x = -28 + k * 0.95 + r() * 0.35, z = 15.3 + r() * 0.5; blob(0.36 + r() * 0.14, 0.3 + r() * 0.12, 0.32, vary(PAL.leaf, 0.12), [x, 0.22, z]); if (r() < 0.45) blob(0.06, 0.06, 0.06, FLOWERS[k % FLOWERS.length], [x + 0.1, 0.48, z + 0.18]); }

  // trees: varied round trees and slim cypresses, grouped
  const tree = (x, z, s = 1) => {
    cyl(0.12 * s, 0.17 * s, 1.6 * s, 7, 0x7a5232, [x, 0.8 * s, z]);
    const g = vary(PAL.leaf, 0.1);
    blob(0.95 * s, 0.85 * s, 0.95 * s, g, [x, 2.2 * s, z]);
    blob(0.7 * s, 0.6 * s, 0.7 * s, g.clone().multiplyScalar(1.08), [x - 0.5 * s, 1.9 * s, z + 0.3 * s]);
    blob(0.65 * s, 0.6 * s, 0.65 * s, g.clone().multiplyScalar(0.9), [x + 0.55 * s, 2.0 * s, z - 0.2 * s]);
  };
  const cypress = (x, z, s = 1) => { cyl(0.06 * s, 0.08 * s, 0.6 * s, 5, 0x6a4a2c, [x, 0.3 * s, z]); add(warp(ellipsoid(0.42 * s, 1.5 * s, 0.42 * s, 8, 7), p => { if (p.y > 0) { const k = 1 - p.y / (1.5 * s) * 0.6; p.x *= k; p.z *= k; } }), vary(PAL.leafD, 0.08), M4.t(x, 1.7 * s, z)); };
  for (const [x, z, s] of [[-27, -9.5, 1.4], [-25.5, -11.5, 1.1], [27, -9, 1.5], [-30, -3, 1.2], [30, -2.5, 1.3], [-24, 11.5, 1.1], [24, 12, 1.2], [-31, 6.5, 1.3], [31, 7, 1.2], [-14, -15, 1.6], [-11.5, -16.5, 1.2], [7, -15.5, 1.7], [17, -15, 1.5], [-27, -15.5, 1.4], [26, -16, 1.6]]) tree(x, z, s);
  for (const [x, z, s] of [[-4, -15, 1.3], [-2.8, -15.6, 1.1], [4.5, -14.8, 1.25], [-20.5, -13.5, 1.2], [21, -13.2, 1.3], [-28.5, 10, 1.1]]) cypress(x, z, s);

  // distant hills with tree clumps on their crests, and a village nestled into the middle hill
  for (let k = 0; k < 11; k++) {
    const x = -80 + k * 16 + r() * 5, z = -46 - r() * 10, rx = 13 + r() * 7, ry = 3.0 + r() * 2.2;
    add(warp(ellipsoid(rx, ry, 9, 18, 8), p => { if (p.y < 0) p.y *= 0.1; p.y *= 1 + 0.12 * Math.sin(p.x * 0.4 + k); }), C(PAL.grassM).lerp(C(0x9ccf88), r() * 0.5), M4.t(x, -0.5, z));
    for (let j = 0; j < 3; j++) { const tx = x + (r() - 0.5) * rx * 1.2, f = 1 - Math.pow((tx - x) / rx, 2); if (f < 0.1) continue; blob(0.45 + r() * 0.4, 0.4 + r() * 0.3, 0.45, vary(PAL.leafD, 0.1), [tx, -0.75 + ry * Math.sqrt(f) * 0.9, z + 5 + r() * 2]); }
  }
  const ROOFS = [0xc8643f, 0xb5523a, 0xa8573d, 0x8b5a3c, 0x7f8a94], WALLS = [0xf1e6d0, 0xe8d9bd, 0xf5efe3, 0xe6cf9c, 0xefe0c8];
  const house = (x, z, ry) => {
    const w = 1.3 + r() * 1.1, d = 1.1 + r() * 0.6, h = 0.9 + (r() < 0.3 ? 1.0 : 0) + r() * 0.4, wall = WALLS[Math.floor(r() * WALLS.length)], roof = ROOFS[Math.floor(r() * ROOFS.length)];
    const m = M4.trs([x, 0, z], [0, ry, 0]);
    add(roundedBox(w, h, d, 0.04, 1).translate(0, h / 2, 0), wall, m);
    add(prism(d + 0.35, 0.45 + r() * 0.35, w + 0.3).translate(0, h, 0), roof, m);
    if (r() < 0.7) add(new THREE.BoxGeometry(0.16, 0.5, 0.16).deleteAttribute('uv').translate(w * 0.25, h + 0.35, -d * 0.15), 0x9b8f84, m);
    for (let k = 0; k < Math.floor(w / 0.55); k++) add(new THREE.BoxGeometry(0.18, 0.22, 0.02).deleteAttribute('uv').translate(-w / 2 + 0.35 + k * 0.55, h * 0.62, d / 2 + 0.01), 0x46607a, m);
    add(new THREE.BoxGeometry(0.22, 0.42, 0.02).deleteAttribute('uv').translate(w * 0.32, 0.21, d / 2 + 0.01), 0x6b4a32, m);
  };
  const village = [[-13, -37.5], [-11.2, -38.6], [-9.6, -37.2], [-12.1, -39.9], [-7.4, -38.9], [-3.8, -39.5], [-2.2, -38.1], [-0.5, -40.2], [1.6, -38.7], [3.1, -40.6], [12.5, -38.3], [14.6, -39.4], [16.1, -37.9]];
  for (const [x, z] of village) { house(x + (r() - 0.5), z, (r() - 0.5) * 0.7); if (r() < 0.5) cypress(x + 1.0 + r(), z - 0.6, 0.9 + r() * 0.3); }
  { const mx = 6.5, mz = -39.6; // mosque: hall, dome, minaret with balcony
    rbox(3.2, 1.8, 2.4, 0.05, 0xf5efe3, [mx, 0.9, mz]); add(warp(ellipsoid(1.1, 1.0, 1.1, 12, 8), p => { if (p.y < 0) p.y *= 0.05; }), 0x8fa3b8, M4.t(mx, 1.8, mz));
    cyl(0.22, 0.26, 5.2, 8, 0xf5efe3, [mx + 2.1, 2.6, mz - 0.4]); add(band(0.3, 0.14, 0.12, 8), 0xf5efe3, M4.t(mx + 2.1, 4.1, mz - 0.4)); add(new THREE.ConeGeometry(0.26, 1.0, 8).deleteAttribute('uv'), 0x8fa3b8, M4.t(mx + 2.1, 5.7, mz - 0.4));
  }

  const staticMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonRamp(), side: THREE.DoubleSide });
  staticMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uT1, uT2, uTime, uHaze });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float team; attribute float wave; uniform float uTime; varying float vSel; varying vec3 vW; varying float vUp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSel = team; vUp = abs(normalize(mat3(modelMatrix) * objectNormal).y);
        transformed.z += wave * (sin(uTime * 3.6 + position.x * 2.3 + position.y * 1.3) * 0.11 + sin(uTime * 6.1 + position.x * 4.0) * 0.035);`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uT1; uniform vec3 uT2; uniform vec3 uHaze; varying float vSel; varying vec3 vW; varying float vUp;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float s1 = vSel < 1.5 ? vSel : 0.0, s2 = vSel > 1.5 ? vSel - 2.0 : 0.0;
        diffuseColor.rgb *= mix(vec3(1.0), uT1, s1) * mix(vec3(1.0), uT2, s2);
        diffuseColor.rgb *= mix(mix(0.68, 1.0, smoothstep(0.0, 0.32, vW.y)), 1.0, smoothstep(0.7, 0.95, vUp));   // baked contact darkening at the base of upright surfaces
        float dist = length(vW.xz - vec2(0.0, 1.0));
        float bg = smoothstep(-6.0, -14.0, vW.z) * 0.22 + smoothstep(22.0, 70.0, dist) * 0.78;          // background steps down
        float l = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(l), uHaze, 0.55), clamp(bg, 0.0, 0.85));`)
      .replace('#include <opaque_fragment>', `
        float rimF = smoothstep(0.6, 0.95, 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0));
        outgoingLight += vec3(1.0, 0.95, 0.85) * rimF * 0.12;
        #include <opaque_fragment>`);
  };
  staticMat.customProgramCacheKey = () => 'halat-static-v2';
  const staticGeo = sb.build();
  if (!staticGeo.attributes.wave) staticGeo.setAttribute('wave', new THREE.Float32BufferAttribute(new Float32Array(staticGeo.attributes.position.count), 1));
  const props = new THREE.Mesh(staticGeo, staticMat); props.name = 'arena-props'; props.castShadow = true; props.receiveShadow = true;
  group.add(props);

  // ------------------------------------------------------------------ title sign (canvas text)
  let sign = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
    const c = cv.getContext('2d');
    const drawSign = () => {
      c.fillStyle = '#7a4a24'; c.fillRect(0, 0, 1024, 256);
      for (let y = 0; y < 256; y += 64) { c.fillStyle = (y / 64) % 2 ? '#8b5a2b' : '#744420'; c.fillRect(0, y, 1024, 60); }
      c.strokeStyle = '#4a2c12'; c.lineWidth = 16; c.strokeRect(8, 8, 1008, 240);
      c.fillStyle = '#fff4d6'; c.font = '900 150px "Paytone One", "Arial Black", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 14; c.strokeStyle = '#3b2210'; c.strokeText(title, 512, 136, 960); c.fillText(title, 512, 136, 960);
    };
    drawSign();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    if (document.fonts?.load) document.fonts.load('900 150px "Paytone One"').then(() => { drawSign(); tex.needsUpdate = true; }).catch(() => {});
    sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshLambertMaterial({ map: tex }));
    sign.position.set(0, 1.85, -6.35); sign.name = 'sign';
    group.add(sign);
  }

  // ------------------------------------------------------------------ crowds: stands (seated, loose groups) + foreground (standing, clusters)
  const stands = makeCrowdMesh(4 * 44, { seated: true });
  const teamPeople = []; // fans in team shirts: [mesh, index, team 0|1, whiten] (recoloured by setTeamColors)
  let k = 0;
  for (let row = 0; row < rows; row++) for (let i = 0; i < 44; i++) {
    const x = -21.4 + i * 0.98 + (r() - 0.5) * 0.3;
    if (Math.sin(x * 0.55 + row * 1.7) + Math.sin(x * 1.3 - row) * 0.5 > 0.9 || r() < 0.08) continue; // empty stretches between groups
    const p = randomPerson(r);
    if (r() < 0.4) { const wk = 0.15 * r(); p.shirt = (x < 0 ? uT1.value : uT2.value).clone().lerp(C(0xffffff), wk); teamPeople.push([stands, k, x < 0 ? 0 : 1, wk]); }
    setPerson(stands, k++, { ...p, x, y: 0.45 + row * 0.42 + 0.06, z: -8.65 - row * 0.95, yaw: (r() - 0.5) * 0.5, group: 0, index: k });
  }
  finishCrowd(stands, k); stands.name = 'stands-crowd';
  const front = makeCrowdMesh(120);
  let kf = 0;
  for (const [cx, n] of [[-22, 7], [-17.5, 9], [-12.8, 6], [-9.5, 8], [-4.6, 5], [-2.2, 4], [2.6, 6], [6.0, 7], [10.5, 9], [14.8, 5], [18.2, 8], [22.6, 6]]) {
    if (Math.abs(cx) < frontGap) continue; // keep the middle of the front fence clear (the pullers stay the biggest thing in frame)
    for (let j = 0; j < n; j++) {
      const p = randomPerson(r);
      const x = cx + (r() - 0.5) * 2.4;
      if (r() < 0.35) { p.shirt = (x < 0 ? uT1.value : uT2.value).clone(); teamPeople.push([front, kf, x < 0 ? 0 : 1, 0]); }
      setPerson(front, kf++, { ...p, x, y: 0, z: 5.85 + r() * 0.75, yaw: Math.PI + (r() - 0.5) * 0.7, group: 0, index: kf });
    }
  }
  const seated = makeCrowdMesh(12, { seated: true });
  let ks = 0;
  for (const [bx, bz, n] of [[-3.6, 8.3, 3], [1.6, 10.1, 2], [-14.5, 9.4, 3]]) for (let j = 0; j < n; j++) { const p = randomPerson(r); setPerson(seated, ks++, { ...p, x: bx + (j - 1) * 0.5 + (r() - 0.5) * 0.2, y: -0.24, z: bz + (r() - 0.5) * 0.4, yaw: Math.PI + (r() - 0.5) * 1.2, group: 0, index: ks }); }
  finishCrowd(front, kf); finishCrowd(seated, ks);
  front.name = 'front-crowd'; seated.name = 'picnic-crowd';
  for (const m of [stands, front, seated]) m.castShadow = true;
  group.add(stands, front, seated);
  const crowdU = [stands.userData.uniforms, front.userData.uniforms, seated.userData.uniforms];

  // ------------------------------------------------------------------ clouds: varied soft shapes in layers, drifting
  const cb = new MeshBuilder();
  for (let k2 = 0; k2 < 12; k2++) {
    const far = k2 % 3 === 0, x = -80 + k2 * 14 + r() * 8, y = (far ? 7 : 10) + r() * 7, z = far ? -95 : -62 - r() * 8, s = far ? 0.7 : 0.8 + r() * 0.7, nb = 3 + Math.floor(r() * 4);
    for (let j = 0; j < nb; j++) cb.add(warp(ellipsoid((1.8 + r() * 1.8) * s, (1.0 + r() * 0.8) * s, 1.2 * s, 10, 7), p => { if (p.y < 0) p.y *= 0.35; }), { color: C(far ? 0xf3f1ea : 0xffffff).multiplyScalar(0.97 + r() * 0.03), matrix: M4.t(x + (j - nb / 2) * 2.0 * s + r(), y + Math.sin(j * 1.7) * 0.6 * s, z) });
  }
  const clouds = new THREE.Mesh(cb.build({ team: false }), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), emissive: 0xb6c4cf, fog: false, transparent: true, opacity: 0.94 }));
  clouds.name = 'clouds'; clouds.renderOrder = -1; group.add(clouds);

  // ------------------------------------------------------------------ soft contact shadows under props (one transparent mesh)
  const shadowSpots = [];
  for (const [x, z, s] of [[-27, -9.5, 1.4], [27, -9, 1.5], [-30, -3, 1.2], [30, -2.5, 1.3], [-24, 11.5, 1.1], [24, 12, 1.2], [-31, 6.5, 1.3], [31, 7, 1.2]]) shadowSpots.push([x + 0.3, z + 0.3, 1.6 * s, 1.3 * s]);
  for (const [x, z] of BALES) shadowSpots.push([x, z + 0.1, 0.8, 0.62]);
  for (const [x, z, w, d] of [[-9.6, -4.9, 2.1, 1.7], [9.6, -4.9, 2.1, 1.7], [-19.5, -4.2, 2.3, 1.8], [19.5, -4.2, 2.3, 1.8], [-24, -1.5, 2.1, 1.7], [24, -1.5, 2.1, 1.7], [6.2, 9.0, 1.6, 0.8], [-7.4, 10.4, 1.0, 0.7], [-6.4, -5.9, 1.7, 0.5], [0, -4.3, 1.0, 0.6], [-5.6, -3.6, 0.5, 0.4], [-3.3, -4.0, 0.5, 0.5], [3.5, -3.9, 0.5, 0.5], [0, -6.6, 32, 0.45], [0, 5.5, 28, 0.35], [0, -8.3, 23, 0.5]]) shadowSpots.push([x, z, w, d]);
  const sg = new THREE.BufferGeometry(); const sp = [], su = [], si = [];
  shadowSpots.forEach(([x, z, w, d], i) => { const b = i * 4; sp.push(x - w, 0.02, z - d, x + w, 0.02, z - d, x + w, 0.02, z + d, x - w, 0.02, z + d); su.push(0, 0, 1, 0, 1, 1, 0, 1); si.push(b, b + 2, b + 1, b, b + 3, b + 2); });
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2)); sg.setIndex(si);
  const shadowMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ vec2 d = vUv * 2.0 - 1.0; float a = 1.0 - smoothstep(0.15, 1.0, length(d)); gl_FragColor = vec4(0.16, 0.2, 0.1, a * 0.3); }' });
  const shadows = new THREE.Mesh(sg, shadowMat); shadows.name = 'contact-shadows'; shadows.renderOrder = 1; group.add(shadows);

  // ------------------------------------------------------------------ ambient particles: pollen motes + dust drifting off the lanes
  const NP = 200, ND = 90;
  const pPos = new Float32Array((NP + ND) * 3), pSeed = new Float32Array((NP + ND) * 4);
  for (let i = 0; i < NP + ND; i++) {
    const dust = i >= NP, sx = r() < 0.5 ? -1 : 1;
    pPos.set(dust ? [sx * (ph + 0.6 + r() * (laneEnd - ph - 1)), 0.05, (r() - 0.5) * 1.8] : [(r() - 0.5) * 34, 0.4 + r() * 5, -6 + r() * 14], i * 3);
    pSeed.set([r() * 100, 0.5 + r(), dust ? 1 : 0, r()], i * 4);
  }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pg.setAttribute('aSeed', new THREE.BufferAttribute(pSeed, 4));
  const pu = { uTime, uDust: { value: 0.35 }, uScale: { value: 900 } };
  const pMat = new THREE.ShaderMaterial({ uniforms: pu, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 aSeed; uniform float uTime; uniform float uDust; uniform float uScale; varying float vA; varying float vDust;
      void main() {
        vec3 p = position; float t = uTime * aSeed.y + aSeed.x; vDust = aSeed.z;
        if (aSeed.z > 0.5) { float c = fract(t * 0.12); p.y += c * 1.1; p.x += sin(t * 0.7) * 0.3 + c * 0.4; p.z += cos(t * 0.5) * 0.3; vA = sin(c * 3.14159) * uDust; }
        else { p += vec3(sin(t * 0.21) * 1.5, sin(t * 0.33) * 0.6, cos(t * 0.17) * 1.2); vA = 0.55 + 0.45 * sin(t * 1.3); }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (aSeed.z > 0.5 ? 0.55 + aSeed.w * 0.4 : 0.05 + aSeed.w * 0.04) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; varying float vDust;
      void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - smoothstep(vDust > 0.5 ? 0.1 : 0.4, 1.0, d)) * vA;
        gl_FragColor = vec4(vDust > 0.5 ? vec3(0.8, 0.68, 0.52) : vec3(1.0, 0.97, 0.84), a * (vDust > 0.5 ? 0.35 : 0.8)); }` });
  const particles = new THREE.Points(pg, pMat); particles.frustumCulled = false; particles.name = 'ambient-particles'; particles.renderOrder = 2;
  group.add(particles);

  // ------------------------------------------------------------------ sky, fog, lights
  let background = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 512; const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#83bde6'); gr.addColorStop(0.45, '#acd3ee'); gr.addColorStop(0.75, '#dcebf0'); gr.addColorStop(1, '#f3eedf'); g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
    background = new THREE.CanvasTexture(cv); background.colorSpace = THREE.SRGBColorSpace;
  } else background = loadTex(TEX('tex_sky_gradient'), pending, { repeat: false });
  const fog = new THREE.Fog(PAL.haze, 60, 150);
  // warm key light with soft shadows over the play area + warm hemisphere fill (replace the scene's sun/hemi)
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.1); sun.position.set(-9, 18, 11); sun.target.position.set(0, 0, -1);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
  Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 13, bottom: -13, near: 2, far: 50 });
  const hemi = new THREE.HemisphereLight(0xfff4e2, 0x6d7a4f, 1.75);

  let excite = 0, t = 0;
  const api = {
    object3D: group, pitHalf: ph, pitZ: pz, waterY, background, fog, lights: { hemi, sun }, palette: PAL, ready: Promise.all(pending),
    meshes: { ground, pitWalls, water, props, sign, stands, front, seated, clouds, shadows, particles },
    /** Dust drifting off the lanes (0..1): raise it while the teams pull hard. */
    setDust(kk) { pu.uDust.value = kk; },
    /** Big moments make the stands jump (same as js/arena.js cheer()). */
    cheer(amount = 1) { excite = Math.min(1.5, excite + amount); },
    setTeamColors(c1, c2) {
      uT1.value.set(c1); uT2.value.set(c2);
      const tc = C(0xffffff);
      for (const [m, i, t, wk] of teamPeople) { tc.copy(t ? uT2.value : uT1.value).lerp(C(0xffffff), wk); m.geometry.attributes.iShirt.setXYZ(i, tc.r, tc.g, tc.b); }
      for (const m of [stands, front]) m.geometry.attributes.iShirt.needsUpdate = true;
    },
    update(dt) {
      t += dt; uTime.value = t;
      excite = Math.max(0, excite - dt * 0.4);
      clouds.position.x = Math.sin(t * 0.012) * 18;
      for (const u of crowdU) { u.uTime.value = t; u.uCheer.value.x = 0.18 + excite * 1.0; u.uWave.value.x = 0.12 + excite * 0.7; }
    },
    dispose() { group.removeFromParent(); group.traverse(o => { if (o.isMesh || o.isPoints) { o.geometry.dispose(); o.material.dispose?.(); } }); },
  };
  return api;
}
