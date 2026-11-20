// Static arena: grass field with a central mud-water pit across the rope, team-tinted
// pulling lanes, start lines, fence, stands with an instanced audience, team flags,
// hay bales and a wooden title sign. Manifest models (ground, pit, fence, flag, stands,
// prop*) replace the procedural pieces when present.
import * as THREE from 'three';
import { rand, hexNum } from './util.js';

function canvasTex(w, h, draw, repeat = null) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

export class Arena {
  constructor(scene, assets, config) {
    this.scene = scene;
    this.assets = assets;
    this.cfg = config;
    this.group = new THREE.Group();
    scene.add(this.group);
    const v = config.visual;
    this.pitHalf = v.pitHalf;
    this.pitZ = 2.7;
    this.waterY = -0.42;
    this.t = 0;
    this._ground();
    this._pit();
    this._lanes();
    this._fenceAndStands();
    this._flags();
    this._props();
  }

  _modelClone(key) {
    const info = this.assets.model(key);
    if (!info) return null;
    const o = info.gltf.scene.clone(true);
    const s = info.entry.scale || 1;
    o.scale.setScalar(s);
    return o;
  }

  _ground() {
    const m = this._modelClone('ground');
    if (m) { this.group.add(m); return; }
    const tex = this.assets.textures.get('ground_tex') || canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#6aa84f'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2200; i++) {
        c.fillStyle = `hsla(${95 + rand(-12, 12)}, ${rand(35, 55)}%, ${rand(32, 48)}%, 0.55)`;
        c.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(2, 5));
      }
    }, [14, 10]);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    // Field with a hole for the pit: four slabs around it.
    const ph = this.pitHalf; const pz = this.pitZ;
    const W = 90; const D = 70;
    const slab = (x0, x1, z0, z1) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2);
      // World-space UVs so the texture lines up across slabs.
      const pos = g.attributes.position; const uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + (x0 + x1) / 2) / 6, (pos.getZ(i) + (z0 + z1) / 2) / 6);
      tex.repeat.set(1, 1);
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      this.group.add(mesh);
    };
    slab(-W / 2, -ph, -D / 2, D / 2);
    slab(ph, W / 2, -D / 2, D / 2);
    slab(-ph, ph, -D / 2, -pz);
    slab(-ph, ph, pz, D / 2);
    // Darker trampled dirt around the pit.
    const dirt = canvasTex(128, 128, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(120,86,52,0.85)'); g.addColorStop(1, 'rgba(120,86,52,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    const dg = new THREE.PlaneGeometry(ph * 2 + 5, pz * 2 + 2.5); dg.rotateX(-Math.PI / 2);
    const d = new THREE.Mesh(dg, new THREE.MeshLambertMaterial({ map: dirt, transparent: true, depthWrite: false }));
    d.position.y = 0.006; d.renderOrder = 0;
    this.group.add(d);
  }

  _pit() {
    const m = this._modelClone('pit');
    const ph = this.pitHalf; const pz = this.pitZ;
    if (m) { this.group.add(m); } else {
      const mud = new THREE.MeshLambertMaterial({ color: 0x5b3f26 });
      const depth = 1.1;
      const wall = (w, x, z, ry) => {
        const g = new THREE.PlaneGeometry(w, depth);
        const mesh = new THREE.Mesh(g, mud);
        mesh.position.set(x, -depth / 2, z); mesh.rotation.y = ry;
        this.group.add(mesh);
      };
      wall(pz * 2, -ph, 0, Math.PI / 2);
      wall(pz * 2, ph, 0, -Math.PI / 2);
      wall(ph * 2, 0, -pz, 0);
      wall(ph * 2, 0, pz, Math.PI);
      // Planks on the two rims the teams face.
      const plank = new THREE.MeshLambertMaterial({ color: 0x9c6b3c });
      for (const sx of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, pz * 2 + 0.3), plank);
        b.position.set(sx * (ph + 0.08), 0.06, 0);
        this.group.add(b);
      }
    }
    // Water surface: animated canvas texture (ripples drift).
    this.waterTex = canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#4c7f8f'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        c.strokeStyle = `rgba(220,240,255,${rand(0.08, 0.25)})`;
        c.lineWidth = rand(1, 2.5);
        c.beginPath(); c.ellipse(rand(0, w), rand(0, h), rand(6, 18), rand(2, 5), 0, 0, Math.PI * 2); c.stroke();
      }
      c.fillStyle = 'rgba(110,80,40,0.25)'; c.fillRect(0, 0, w, h);
    }, [2, 3]);
    const wg = new THREE.PlaneGeometry(ph * 2, pz * 2); wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ map: this.waterTex, transparent: true, opacity: 0.92, emissive: 0x0d2630 }));
    this.water.position.y = this.waterY;
    this.group.add(this.water);
  }

  _lanes() {
    const v = this.cfg.visual;
    this.laneMats = [];
    const len = v.slotGap * v.pullersPerSide + 6;
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? -1 : 1;
      const col = hexNum(this.cfg.teams[i]?.color, i ? 0x2f7cf6 : 0xe63946);
      const g = new THREE.PlaneGeometry(len, 1.7); g.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false });
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(sx * (this.pitHalf + 0.4 + len / 2), 0.012, 0);
      mesh.renderOrder = 0;
      this.group.add(mesh);
      this.laneMats.push(mat);
      // Chalk line where the front puller starts.
      const lg = new THREE.PlaneGeometry(0.08, 2.4); lg.rotateX(-Math.PI / 2);
      const line = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }));
      line.position.set(sx * (v.frontX - 0.45), 0.014, 0);
      this.group.add(line);
    }
  }

  setTeamColors(c1, c2) {
    if (this.laneMats[0]) this.laneMats[0].color.setHex(c1);
    if (this.laneMats[1]) this.laneMats[1].color.setHex(c2);
    for (const f of this.flags || []) f.mat.color.setHex(f.team === 1 ? c1 : c2);
  }

  _fenceAndStands() {
    const fz = -6.6;
    const fence = this._modelClone('fence');
    if (fence) { fence.position.z = fz; this.group.add(fence); } else {
      const wood = new THREE.MeshLambertMaterial({ color: 0xe9dcc4 });
      const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), wood, 60);
      const m = new THREE.Matrix4();
      let n = 0;
      for (let x = -28; x <= 28; x += 1.6) { m.makeTranslation(x, 0.5, fz); posts.setMatrixAt(n++, m); }
      posts.count = n;
      this.group.add(posts);
      for (const y of [0.45, 0.85]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(56, 0.1, 0.06), wood);
        rail.position.set(0, y, fz + 0.05);
        this.group.add(rail);
      }
    }
    // Stands: stepped rows with a cheap audience.
    const stands = this._modelClone('stands');
    if (stands) { stands.position.z = -9; this.group.add(stands); } else {
      const mat = new THREE.MeshLambertMaterial({ color: 0x8c7a6b });
      for (let r = 0; r < 4; r++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(48, 0.5 + r * 0.55, 1.2), mat);
        b.position.set(0, (0.5 + r * 0.55) / 2, -8.2 - r * 1.2);
        this.group.add(b);
      }
      const awning = canvasTex(64, 8, (c, w, h) => {
        for (let x = 0; x < w; x += 8) { c.fillStyle = (x / 8) % 2 ? '#f4efe6' : '#d64545'; c.fillRect(x, 0, 8, h); }
      }, [24, 1]);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(48, 0.12, 4.2), new THREE.MeshLambertMaterial({ map: awning }));
      roof.position.set(0, 4.9, -10.6);
      roof.rotation.x = -0.12;
      this.group.add(roof);
    }
    const bodyG = new THREE.CapsuleGeometry(0.2, 0.3, 2, 6);
    const headG = new THREE.SphereGeometry(0.14, 6, 5);
    headG.translate(0, 0.42, 0);
    const nStands = 260; const nFront = 90;
    const n = nStands + nFront;
    this.spec = { n, bodies: new THREE.InstancedMesh(bodyG, new THREE.MeshLambertMaterial(), n), heads: new THREE.InstancedMesh(headG, new THREE.MeshLambertMaterial(), n), base: [] };
    const col = new THREE.Color();
    const palette = [0xf4d35e, 0xee964b, 0xf95738, 0x0d3b66, 0x83c5be, 0xffffff, 0x6d597a, 0xb56576, 0x84a59d, 0xf6bd60];
    // Front row: a low fence near the camera with neutral spectators behind it (fills the
    // lower part of the portrait frame).
    const ffz = 5.4;
    const fwood = new THREE.MeshLambertMaterial({ color: 0xd9c7a5 });
    const fposts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), fwood, 40);
    const fm = new THREE.Matrix4();
    let fn = 0;
    for (let x = -24; x <= 24; x += 1.6) { fm.makeTranslation(x, 0.35, ffz); fposts.setMatrixAt(fn++, fm); }
    fposts.count = fn;
    this.group.add(fposts);
    const frail = new THREE.Mesh(new THREE.BoxGeometry(48, 0.09, 0.05), fwood);
    frail.position.set(0, 0.6, ffz);
    this.group.add(frail);
    for (let i = 0; i < n; i++) {
      const front = i >= nStands;
      const r = i % 4;
      const x = -23 + Math.random() * 46;
      const y = front ? 0.36 : 0.5 + r * 0.55 + 0.32;
      const z = front ? ffz + 0.6 + rand(0, 1.2) : -8.2 - r * 1.2 + rand(-0.15, 0.15);
      this.spec.base.push({ x, y, z, ph: Math.random() * 6.28, sp: rand(4, 7) });
      this.spec.bodies.setColorAt(i, col.setHex(palette[i % palette.length]));
      this.spec.heads.setColorAt(i, col.setHex([0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524][i % 4]));
    }
    this.spec.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.spec.heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.spec.bodies, this.spec.heads);
    this.excite = 0;
    this._updateSpectators(0);
    // Title sign behind the pit.
    const sign = canvasTex(512, 128, (c, w, h) => {
      c.fillStyle = '#7a4a24'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) { c.fillStyle = y % 64 ? '#8b5a2b' : '#6e4220'; c.fillRect(0, y, w, 30); }
      c.strokeStyle = '#4a2c12'; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8);
      c.fillStyle = '#fff4d6';
      c.font = '900 76px "Paytone One", "Arial Black", sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(this.cfg.title || 'HALAT ÇEKME', w / 2, h / 2 + 4, w - 40);
    });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshLambertMaterial({ map: sign }));
    sm.position.set(0, 1.75, -6.4);
    this.group.add(sm);
    for (const sx of [-1.9, 1.9]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.3, 0.14), new THREE.MeshLambertMaterial({ color: 0x5a3a1c }));
      p.position.set(sx, 1.15, -6.48);
      this.group.add(p);
    }
  }

  _updateSpectators(dt) {
    const s = this.spec;
    const m = new THREE.Matrix4();
    this.excite = Math.max(0, this.excite - dt * 0.4);
    const amp = 0.04 + this.excite * 0.22;
    for (let i = 0; i < s.n; i++) {
      const b = s.base[i];
      const y = b.y + Math.abs(Math.sin(this.t * b.sp + b.ph)) * amp;
      m.makeTranslation(b.x, y, b.z);
      s.bodies.setMatrixAt(i, m);
      s.heads.setMatrixAt(i, m);
    }
    s.bodies.instanceMatrix.needsUpdate = true;
    s.heads.instanceMatrix.needsUpdate = true;
  }

  _flags() {
    this.flags = [];
    const flagModel = this.assets.model('flag');
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? -1 : 1;
      const x = sx * (this.cfg.visual.frontX + this.cfg.visual.slotGap * (this.cfg.visual.pullersPerSide - 1) + 1.2);
      const col = hexNum(this.cfg.teams[i]?.color, i ? 0x2f7cf6 : 0xe63946);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
      pole.position.set(x, 2, -2.2);
      this.group.add(pole);
      if (flagModel) {
        const f = this._modelClone('flag');
        f.position.set(x, 3.2, -2.2);
        let mat = null;
        f.traverse((o) => { if (o.isMesh && o.material?.userData?.isTeam) { o.material = o.material.clone(); o.material.color.setHex(col); mat = o.material; } });
        this.group.add(f);
        this.flags.push({ team: i + 1, mat: mat || new THREE.MeshBasicMaterial(), geo: null });
        continue;
      }
      const g = new THREE.PlaneGeometry(1.6, 1.0, 8, 2);
      g.translate(0.8, 0, 0);
      const mat = new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(x, 3.45, -2.2);
      mesh.scale.x = -sx; // cloth flies outward
      this.group.add(mesh);
      this.flags.push({ team: i + 1, mat, geo: g, base: g.attributes.position.array.slice() });
    }
  }

  _props() {
    const hay = new THREE.MeshLambertMaterial({ color: 0xe0c068 });
    const spots = [[-6.5, -3.6], [6.8, -3.4], [-15, 3.2], [15.5, 3.0], [-2.6, -4.6], [2.9, -4.4]];
    for (const [x, z] of spots) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 10), hay);
      b.rotation.z = Math.PI / 2; b.rotation.y = rand(-0.5, 0.5);
      b.position.set(x, 0.5, z);
      this.group.add(b);
    }
    // Manifest props are scattered on fixed spots at the back.
    const propKeys = [...this.assets.models.keys()].filter((k) => /^prop/.test(k));
    const pspots = [[-10, -5], [10, -5], [-18, -4], [18, -4], [-4.5, -5.6], [4.5, -5.6]];
    propKeys.forEach((k, i) => {
      const o = this._modelClone(k);
      if (!o) return;
      const [x, z] = pspots[i % pspots.length];
      o.position.set(x, 0, z);
      this.group.add(o);
    });
  }

  /** Big moments make the stands jump. */
  cheer(amount = 1) { this.excite = Math.min(1.5, this.excite + amount); }

  update(dt) {
    this.t += dt;
    if (this.waterTex) { this.waterTex.offset.x = Math.sin(this.t * 0.2) * 0.05; this.waterTex.offset.y = this.t * 0.02; }
    this._updateSpectators(dt);
    for (const f of this.flags) {
      if (!f.geo) continue;
      const p = f.geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = f.base[i * 3];
        p.setZ(i, Math.sin(this.t * 4 + x * 3) * 0.12 * (x / 1.6));
      }
      p.needsUpdate = true;
    }
  }
}
