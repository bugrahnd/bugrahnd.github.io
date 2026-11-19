// Asset loading strictly through assets/manifest.json.
// Models are pre-processed into "parts" (one merged geometry per material) so they
// can be drawn with instancing: static models bake node transforms, skinned
// models fold bone-attached props (swords, shields) into the skinned geometry.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MODELS_NEEDED = [
  'unit_infantry', 'unit_knight', 'unit_cavalry', 'unit_siege', 'unit_cannon', 'unit_siege_trebuchet',
  'projectile_cannonball', 'castle_small', 'castle_medium', 'castle_large', 'flag', 'tent',
  'tree_a', 'tree_b', 'tree_c', 'mountain_a', 'forest', 'rock_a', 'ship', 'ship_small', 'house',
];

export class Assets {
  constructor(manifest) {
    this.manifest = manifest;
    this.models = new Map(); // key -> { entry, gltf, parts, skinned, skeletonCount, clips }
    this.atlas = null; // { texture, rects: Map(key -> {u0,v0,u1,v1, frames?}) }
  }

  static async load(onProgress) {
    const res = await fetch('assets/manifest.json', { cache: 'no-cache' });
    const manifest = await res.json();
    const a = new Assets(manifest);
    await a._loadAll(onProgress);
    return a;
  }

  path(section, key) {
    const e = this.manifest[section]?.[key];
    return e ? e.path : null;
  }

  async _loadAll(onProgress) {
    const tasks = [];
    let done = 0;
    const step = () => onProgress && onProgress(++done / total);
    const loader = new GLTFLoader();
    for (const key of MODELS_NEEDED) {
      const entry = this.manifest.models[key];
      if (!entry) continue;
      tasks.push(loader.loadAsync(entry.path).then((gltf) => { this._prepareModel(key, entry, gltf); step(); }));
    }
    tasks.push(this._buildAtlas().then(step));
    tasks.push(this._loadFonts().then(step));
    const total = tasks.length;
    this._setUiVars();
    await Promise.all(tasks);
  }

  // ---------- fonts / UI ----------

  async _loadFonts() {
    const fonts = this.manifest.fonts || {};
    const jobs = [];
    for (const f of Object.values(fonts)) {
      const desc = f.family === 'Nunito' ? { weight: '200 1000' } : {};
      const face = new FontFace(f.family, `url("${f.path}")`, desc);
      jobs.push(face.load().then((ff) => document.fonts.add(ff)).catch((e) => console.warn('font', f.path, e)));
    }
    await Promise.all(jobs);
  }

  _setUiVars() {
    const root = document.documentElement.style;
    for (const [key, e] of Object.entries(this.manifest.ui || {})) {
      // Absolute URL: relative url() in a custom property resolves against the stylesheet.
      root.setProperty(`--ui-${key.replace(/_/g, '-')}`, `url("${new URL(e.path, document.baseURI).href}")`);
    }
  }

  uiPath(key) {
    return this.manifest.ui?.[key]?.path || '';
  }

  // ---------- models ----------

  _prepareModel(key, entry, gltf) {
    // Lambert materials are cheaper and suit the low-poly style.
    const matCache = new Map();
    const convert = (m) => {
      if (matCache.has(m)) return matCache.get(m);
      const isTeam = /^team/.test(m.name || '');
      const lm = new THREE.MeshLambertMaterial({
        name: m.name,
        map: m.map || null,
        color: isTeam ? 0xffffff : (m.color ? m.color.clone() : 0xffffff),
        transparent: m.transparent,
        alphaTest: m.alphaTest,
        side: m.side,
      });
      lm.userData = { ...m.userData, isTeam, teamShade: m.userData?.teamShade ?? 1 };
      if (lm.map) lm.map.colorSpace = THREE.SRGBColorSpace;
      matCache.set(m, lm);
      return lm;
    };
    gltf.scene.traverse((o) => {
      if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
    });
    gltf.scene.updateMatrixWorld(true);

    const info = { key, entry, gltf, clips: new Map(gltf.animations.map((c) => [c.name, c])) };
    if (entry.skinned) {
      Object.assign(info, prepareSkinned(gltf.scene));
      info.skinned = true;
    } else {
      info.parts = prepareStatic(gltf.scene);
      info.skinned = false;
    }
    this.models.set(key, info);
  }

  model(key) {
    return this.models.get(key);
  }

  /** Animated clone of a skinned model playing the given clips (lock-step template). */
  makeTemplate(key, clipNames, phase = 0) {
    const info = this.models.get(key);
    const root = SkeletonUtils.clone(info.gltf.scene);
    const mixer = new THREE.AnimationMixer(root);
    for (const name of clipNames) {
      const clip = info.clips.get(name);
      if (!clip) { console.warn('missing clip', key, name); continue; }
      const action = mixer.clipAction(clip);
      action.play();
      action.time = phase * clip.duration;
    }
    const skeletons = [];
    root.traverse((o) => { if (o.isSkinnedMesh && !skeletons.includes(o.skeleton)) skeletons.push(o.skeleton); });
    mixer.update(0);
    root.updateMatrixWorld(true);
    return { root, mixer, skeletons };
  }

  // ---------- sprite atlas ----------

  async _buildAtlas() {
    const sprites = this.manifest.sprites || {};
    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const rects = new Map();
    const loadImg = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    const singles = Object.entries(sprites).filter(([, e]) => (e.frames || 1) === 1);
    const sheets = Object.entries(sprites).filter(([, e]) => (e.frames || 1) > 1);
    const imgs = await Promise.all(Object.values(sprites).map((e) => loadImg(e.path).catch(() => null)));
    const imgByPath = new Map(Object.values(sprites).map((e, i) => [e.path, imgs[i]]));

    // Single sprites in 256px slots, 8 per row, top half of the atlas.
    singles.forEach(([key, e], i) => {
      const x = (i % 8) * 256; const y = Math.floor(i / 8) * 256;
      const img = imgByPath.get(e.path);
      if (img) ctx.drawImage(img, x, y, 256, 256);
      rects.set(key, { x, y, w: 256, h: 256, frames: 1 });
    });
    // Sheets below, packed in two columns of 1024px.
    let colY = [1024, 1024];
    for (const [key, e] of sheets) {
      const img = imgByPath.get(e.path);
      const w = e.columns * e.frameSize[0]; const h = e.rows * e.frameSize[1];
      const col = colY[0] <= colY[1] ? 0 : 1;
      const x = col * 1024; const y = colY[col];
      if (img) ctx.drawImage(img, 0, 0, w, h, x, y, w, h);
      colY[col] += h;
      rects.set(key, { x, y, w: e.frameSize[0], h: e.frameSize[1], frames: e.frames, columns: e.columns, fps: e.fps || 20 });
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.atlas = { texture: tex, size, rects };
  }
}

// ---------- geometry preparation ----------

function ensureAttributes(geo, withSkin) {
  if (!geo.index) {
    const n = geo.attributes.position.count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  const keep = withSkin ? ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'] : ['position', 'normal', 'uv'];
  for (const name of Object.keys(geo.attributes)) if (!keep.includes(name)) geo.deleteAttribute(name);
  // Normalise attribute types so geometries can be merged.
  for (const name of ['position', 'normal', 'uv', 'skinWeight']) {
    const a = geo.attributes[name];
    if (!a) continue;
    if (!(a.array instanceof Float32Array) || a.normalized || a.isInterleavedBufferAttribute) {
      const out = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
      geo.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
    }
  }
  if (geo.attributes.skinIndex) {
    const a = geo.attributes.skinIndex;
    const out = new Uint16Array(a.count * 4);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < 4; k++) out[i * 4 + k] = a.getComponent(i, k);
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out, 4));
  }
  geo.morphAttributes = {};
  return geo;
}

function primitivesOf(mesh) {
  // Split multi-material meshes into (geometry, material) pairs.
  if (!Array.isArray(mesh.material)) return [[mesh.geometry, mesh.material]];
  const out = [];
  for (const g of mesh.geometry.groups) {
    const sub = mesh.geometry.clone();
    sub.clearGroups();
    const idx = sub.index;
    if (idx) sub.setIndex(new THREE.BufferAttribute(idx.array.slice(g.start, g.start + g.count), 1));
    out.push([sub, mesh.material[g.materialIndex]]);
  }
  return out;
}

function mergeByMaterial(list) {
  // list: [{geo, mat, ...extra}] -> [{geometry, material}]
  const groups = new Map();
  for (const it of list) {
    if (!groups.has(it.mat)) groups.set(it.mat, []);
    groups.get(it.mat).push(it.geo);
  }
  const out = [];
  for (const [mat, geos] of groups) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) { console.warn('merge failed', mat.name); continue; }
    merged.computeBoundingSphere();
    out.push({ geometry: merged, material: mat, team: !!mat.userData.isTeam, shade: mat.userData.teamShade ?? 1 });
  }
  return out;
}

function prepareStatic(scene) {
  const list = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const [g, mat] of primitivesOf(o)) {
      const geo = ensureAttributes(g.clone(), false);
      geo.applyMatrix4(o.matrixWorld);
      list.push({ geo, mat });
    }
  });
  return mergeByMaterial(list);
}

function prepareSkinned(scene) {
  const skeletons = [];
  const bindOf = new Map(); // skeleton -> bindMatrix of its first skinned mesh
  scene.traverse((o) => {
    if (o.isSkinnedMesh && !skeletons.includes(o.skeleton)) {
      skeletons.push(o.skeleton);
      bindOf.set(o.skeleton, o.bindMatrix.clone());
    }
  });
  const boneToSkel = new Map();
  skeletons.forEach((s, si) => s.bones.forEach((b, bi) => boneToSkel.set(b, [si, bi])));
  const perSkel = skeletons.map(() => []);
  const tmp = new THREE.Matrix4();

  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) {
      const si = skeletons.indexOf(o.skeleton);
      const B = bindOf.get(o.skeleton);
      tmp.copy(B).invert().multiply(o.bindMatrix);
      for (const [g, mat] of primitivesOf(o)) {
        const geo = ensureAttributes(g.clone(), true);
        geo.applyMatrix4(tmp);
        perSkel[si].push({ geo, mat });
      }
      return;
    }
    // Plain mesh: attach to the nearest ancestor bone, if any.
    let p = o.parent;
    while (p && !boneToSkel.has(p)) p = p.parent;
    if (!p) return; // not part of a rig (ignored for skinned models)
    const [si, bi] = boneToSkel.get(p);
    const skel = skeletons[si];
    const B = bindOf.get(skel);
    // vertex_bind = B^-1 * (boneInverse_j)^-1 * (boneWorldRest_j)^-1 * meshWorldRest * v
    const L = new THREE.Matrix4().copy(p.matrixWorld).invert().multiply(o.matrixWorld);
    const M = new THREE.Matrix4().copy(B).invert()
      .multiply(new THREE.Matrix4().copy(skel.boneInverses[bi]).invert())
      .multiply(L);
    for (const [g, mat] of primitivesOf(o)) {
      const geo = ensureAttributes(g.clone(), false);
      geo.applyMatrix4(M);
      const n = geo.attributes.position.count;
      const si4 = new Uint16Array(n * 4); const sw4 = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si4[i * 4] = bi; sw4[i * 4] = 1; }
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si4, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw4, 4));
      perSkel[si].push({ geo, mat });
    }
  });

  const parts = [];
  perSkel.forEach((list, si) => {
    for (const part of mergeByMaterial(list)) {
      part.skeletonIndex = si;
      part.bindMatrix = bindOf.get(skeletons[si]).clone();
      parts.push(part);
    }
  });
  return { parts, skeletonCount: skeletons.length };
}
