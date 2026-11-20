// The Turkey map: extruded province tiles, glowing front lines, colour-flood captures,
// sea, castles/flags and decorations.
// Map coordinates (x east, y north) -> world (x, height, -y * MZ): north is away from the
// camera. MZ is a modest north-south stretch so the thin map gets more screen height
// in a portrait frame (models are not stretched, only positions and tiles).
import * as THREE from 'three';
import { Batch, setYawMatrix } from './instancing.js';
import { NEUTRAL_HEX, shadeHex } from './colors.js';
import { pointInProvince, clamp } from './util.js';

export const TILE_H = 3;
export let MZ = 1;
/** Must be called before anything converts map coordinates. */
export function setMapStretch(v) { MZ = v > 0.5 && v < 2.5 ? v : 1; }
/** Map y (north) -> world z. */
export const wzOf = (y) => -y * MZ;

const FRONT_W = 2.6; // front-line ribbon width (map units)

export class MapView {
  constructor(scene, provinces, assets, config, effects) {
    this.scene = scene;
    this.assets = assets;
    this.config = config;
    this.effects = effects;
    this.provinces = provinces;
    this.byPlate = new Map(provinces.map((p) => [p.plate, p]));
    this.tiles = new Map(); // plate -> tile state
    this.owner = new Map(provinces.map((p) => [p.plate, 0]));
    this.ownerHex = new Map(provinces.map((p) => [p.plate, NEUTRAL_HEX]));
    this.matCache = new Map();
    this.time = 0;
    this._buildSea();
    this._buildTiles();
    this._buildBorders();
    this._buildFronts();
    this._buildMarkers();
    if (config.visual.decorations) this._buildDecorations();
  }

  toWorld(x, y, h = TILE_H) {
    return new THREE.Vector3(x, h, wzOf(y));
  }

  _buildSea() {
    const geo = new THREE.PlaneGeometry(4000, 3000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float time; varying vec2 vP;
        void main(){
          float d = length(vP * vec2(0.0011, 0.0018));
          vec3 deep = vec3(0.04, 0.17, 0.33); vec3 shallow = vec3(0.10, 0.40, 0.62);
          vec3 c = mix(shallow, deep, clamp(d, 0.0, 1.0));
          float w1 = sin(vP.x * 0.045 + time * 0.9) * sin(vP.y * 0.06 - time * 0.6);
          float w2 = sin(vP.x * 0.021 - vP.y * 0.03 + time * 0.5);
          c += vec3(0.05, 0.08, 0.10) * smoothstep(0.7, 1.0, w1);
          c += vec3(0.02, 0.04, 0.05) * w2;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sea = new THREE.Mesh(geo, mat);
    this.sea.position.y = -0.6;
    this.scene.add(this.sea);
  }

  _buildTiles() {
    for (const p of this.provinces) {
      const shapes = p.polygons.map((poly) => {
        const shape = new THREE.Shape(poly[0].map(([x, y]) => new THREE.Vector2(x, y)));
        for (let h = 1; h < poly.length; h++) shape.holes.push(new THREE.Path(poly[h].map(([x, y]) => new THREE.Vector2(x, y))));
        return shape;
      });
      const geo = new THREE.ExtrudeGeometry(shapes, { depth: TILE_H, bevelEnabled: false, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2); // (x,y,z) -> (x, z, -y)
      geo.scale(1, 1, MZ);
      geo.computeVertexNormals();
      // Slight per-province lightness jitter keeps same-coloured neighbours apart.
      const jitter = 0.94 + ((p.plate * 37) % 13) / 100;
      const top = new THREE.MeshLambertMaterial({ color: shadeHex(NEUTRAL_HEX, jitter) });
      const side = new THREE.MeshLambertMaterial({ color: shadeHex(NEUTRAL_HEX, 0.6) });
      const flood = {
        uPrev: { value: new THREE.Color(shadeHex(NEUTRAL_HEX, jitter)) },
        uFC: { value: new THREE.Vector2() },
        uFR: { value: 1e5 },
      };
      top.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, flood);
        sh.vertexShader = sh.vertexShader
          .replace('void main() {', 'varying vec2 vWXZ;\nvoid main() {')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('void main() {', 'uniform vec3 uPrev; uniform vec2 uFC; uniform float uFR; varying vec2 vWXZ;\nvoid main() {')
          .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
            float fd = distance(vWXZ, uFC);
            float outside = step(uFR, fd);
            float rim = (1.0 - outside) * smoothstep(uFR - 9.0, uFR, fd);
            vec3 dcol = mix(diffuse, uPrev, outside) + vec3(rim * 0.55);
            vec4 diffuseColor = vec4( dcol, opacity );`);
      };
      top.customProgramCacheKey = () => 'tileFlood';
      const mesh = new THREE.Mesh(geo, [top, side]);
      mesh.userData.plate = p.plate;
      this.scene.add(mesh);
      this.tiles.set(p.plate, {
        mesh, top, side, jitter, flood,
        cur: new THREE.Color(shadeHex(NEUTRAL_HEX, jitter)),
        target: new THREE.Color(shadeHex(NEUTRAL_HEX, jitter)),
        flash: 0, lift: 0, liftTarget: 0, floodT: -1, floodMax: Math.sqrt(p.area) * 2.2,
      });
    }
  }

  _buildBorders() {
    const pts = [];
    const y = TILE_H + 0.15;
    for (const p of this.provinces) {
      for (const poly of p.polygons) for (const ring of poly) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]; const b = ring[(i + 1) % ring.length];
          pts.push(a[0], y, wzOf(a[1]), b[0], y, wzOf(b[1]));
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x1c2026, transparent: true, opacity: 0.75 });
    this.borders = new THREE.LineSegments(geo, mat);
    this.scene.add(this.borders);
  }

  /**
   * Front lines: for every shared border segment, a thin ribbon on each side, inside
   * the province. A ribbon glows in its province's owner colour when the neighbour
   * across it belongs to someone else.
   */
  _buildFronts() {
    const key = (a, b) => {
      const ka = `${a[0]},${a[1]}`; const kb = `${b[0]},${b[1]}`;
      return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    };
    const edges = new Map(); // segment key -> [{ plate, a, b }]
    for (const p of this.provinces) {
      for (const poly of p.polygons) for (const ring of poly) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]; const b = ring[(i + 1) % ring.length];
          const k = key(a, b);
          let l = edges.get(k);
          if (!l) { l = []; edges.set(k, l); }
          l.push({ plate: p.plate, a, b });
        }
      }
    }
    const segs = new Map(); // plate -> [{ q, a, b }]
    for (const l of edges.values()) {
      if (l.length !== 2 || l[0].plate === l[1].plate) continue;
      for (const [me, other] of [[l[0], l[1]], [l[1], l[0]]]) {
        if (!segs.has(me.plate)) segs.set(me.plate, []);
        segs.get(me.plate).push({ q: other.plate, a: me.a, b: me.b });
      }
    }
    const pos = []; const edge = []; const idx = [];
    this.frontRanges = new Map(); // plate -> [{ q, start(vertex), count }]
    let v = 0;
    const y = TILE_H + 0.3;
    for (const [plate, list] of segs) {
      const ranges = [];
      // Group consecutive segments by neighbour so each range is one colour switch.
      for (const s of list) {
        const dx = s.b[0] - s.a[0]; const dy = s.b[1] - s.a[1];
        const len = Math.hypot(dx, dy) || 1;
        // Rings are CCW (holes CW): the interior is on the left.
        const nx = (-dy / len) * FRONT_W; const ny = (dx / len) * FRONT_W;
        pos.push(
          s.a[0], y, wzOf(s.a[1]), s.b[0], y, wzOf(s.b[1]),
          s.b[0] + nx, y, wzOf(s.b[1] + ny), s.a[0] + nx, y, wzOf(s.a[1] + ny),
        );
        edge.push(0, 0, 1, 1);
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
        let r = ranges[ranges.length - 1];
        if (r && r.q === s.q && r.start + r.count === v) r.count += 4;
        else ranges.push({ q: s.q, start: v, count: 4 });
        v += 4;
      }
      this.frontRanges.set(plate, ranges);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
    this.frontCol = new THREE.BufferAttribute(new Float32Array(v * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCol', this.frontCol);
    geo.setIndex(idx);
    this.frontMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `attribute float aEdge; attribute vec4 aCol; varying float vE; varying vec4 vC; varying float vX;
        void main(){ vE = aEdge; vC = aCol; vec4 w = modelMatrix * vec4(position,1.0); vX = w.x + w.z; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float time; varying float vE; varying vec4 vC; varying float vX;
        void main(){
          if (vC.a < 0.01) discard;
          float pulse = 0.62 + 0.38 * sin(time * 4.5 + vX * 0.04);
          float a = vC.a * (1.0 - vE * 0.85) * pulse;
          vec3 c = mix(vC.rgb, vec3(1.0), 0.45 * (1.0 - vE) * vC.a);
          gl_FragColor = vec4(c, a);
        }`,
      transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.fronts = new THREE.Mesh(geo, this.frontMat);
    this.fronts.renderOrder = 2;
    this.fronts.frustumCulled = false;
    this.scene.add(this.fronts);
  }

  _refreshFront(plate) {
    const ranges = this.frontRanges.get(plate);
    if (!ranges) return;
    const own = this.owner.get(plate);
    const col = new THREE.Color(shadeHex(this.ownerHex.get(plate), 1.25));
    const A = this.frontCol.array;
    for (const r of ranges) {
      const other = this.owner.get(r.q);
      let a = 0;
      if (own && other !== own) a = other ? 1 : 0.6; // enemy front brighter than neutral edge
      for (let i = r.start; i < r.start + r.count; i++) {
        A[i * 4] = col.r; A[i * 4 + 1] = col.g; A[i * 4 + 2] = col.b; A[i * 4 + 3] = a;
      }
    }
    this.frontCol.needsUpdate = true;
  }

  _buildMarkers() {
    // Castles (awake teams' home provinces) and flags (conquered provinces).
    const mk = (key) => {
      const b = new Batch(this.assets.model(key), 81, null, this.matCache);
      this.scene.add(b.group);
      return b;
    };
    this.castleBatches = { castle_small: mk('castle_small'), castle_medium: mk('castle_medium'), castle_large: mk('castle_large') };
    this.flagBatch = mk('flag');
    this.markers = new Map(); // plate -> { castle: key|null, colorHex, flag: bool, pop, strength }
    this.markersDirty = true;
    this._m = new THREE.Matrix4();
    // Castle anchor (map coords): a bit south of the label point so the plate badge sits above it.
    this.castlePos = new Map();
    for (const p of this.provinces) {
      const [lx, ly] = p.labelPoint;
      let pos = [lx, ly - 7];
      if (!pointInProvince(pos[0], pos[1], p)) pos = [lx, ly];
      this.castlePos.set(p.plate, pos);
    }
  }

  /** World position of a province's castle anchor. */
  castleWorld(plate) {
    const [x, y] = this.castlePos.get(plate);
    return { x, z: wzOf(y) };
  }

  /** castleKey: null | 'castle_small' | ...; flag: show conquest flag. */
  setMarker(plate, castleKey, flag, colorHex) {
    const m = this.markers.get(plate) || { pop: 1, strength: 1 };
    const changed = m.castle !== castleKey || m.flag !== flag || m.colorHex !== colorHex;
    if (!changed) return;
    if (m.castle !== castleKey || m.flag !== flag) m.pop = 0;
    m.castle = castleKey; m.flag = flag; m.colorHex = colorHex;
    this.markers.set(plate, m);
    this.markersDirty = true;
  }

  /** Castles grow with the garrison they hold. */
  setStrength(plate, garrison) {
    const m = this.markers.get(plate);
    if (!m) return;
    const s = clamp(0.8 + 0.24 * Math.log2(1 + garrison / 30), 0.8, 1.8);
    if (Math.abs(s - m.strength) > 0.03) { m.strength = s; this.markersDirty = true; }
  }

  /** Castles/flags shrink toward natural size when the camera zooms in (like units). */
  setZoom(zoom) {
    const k = Math.pow(Math.max(1, zoom), -(this.config.visual.castleZoomShrink ?? 0.5));
    if (Math.abs(k - (this.zoomK || 1)) > 0.01) { this.zoomK = k; this.markersDirty = true; }
  }

  clearMarkers() {
    this.markers.clear();
    this.markersDirty = true;
  }

  _rebuildMarkers(dt) {
    let animating = false;
    for (const m of this.markers.values()) if (m.pop < 1) { m.pop = Math.min(1, m.pop + dt * 2.5); animating = true; }
    if (!this.markersDirty && !animating) return;
    this.markersDirty = false;
    for (const b of Object.values(this.castleBatches)) b.begin();
    this.flagBatch.begin();
    const models = this.assets.manifest.models;
    const cs = this.config.visual.castleScale * (this.zoomK || 1);
    for (const [plate, m] of this.markers) {
      const [x, y] = this.castlePos.get(plate);
      const t = m.pop;
      const pop = t < 1 ? Math.max(0.01, 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2)) : 1;
      if (m.castle) {
        const s = models[m.castle].scale * cs * pop * (m.strength || 1);
        this.castleBatches[m.castle].push(setYawMatrix(this._m, x, TILE_H, wzOf(y), 0, s), m.colorHex);
      } else if (m.flag) {
        const s = models.flag.scale * cs * 0.95 * pop * Math.sqrt(m.strength || 1);
        this.flagBatch.push(setYawMatrix(this._m, x + 3, TILE_H, wzOf(y), -0.6, s), m.colorHex);
      }
    }
    for (const b of Object.values(this.castleBatches)) b.end();
    this.flagBatch.end();
  }

  _buildDecorations() {
    // A few static props, instanced. Positions chosen inside provinces away from label points.
    const decor = [
      ['mountain_a', [25, 65, 4, 30, 36, 58, 24, 12, 49, 13, 62, 56, 1, 7, 33], 1.0],
      ['forest', [61, 53, 28, 52, 37, 67, 81, 14, 8, 74, 55, 78, 54, 19], 0.9],
      ['tree_a', [41, 54, 16, 10, 7, 48, 33, 46, 31, 17, 22, 59, 39], 1.2],
      ['tree_c', [35, 45, 20, 9, 43, 3, 42, 6, 26, 66, 38, 60, 5, 57], 1.1],
      ['rock_a', [42, 68, 51, 44, 2, 63, 21, 47, 40, 71], 1.2],
      ['house', [6, 34, 35, 16, 1, 27, 42, 7, 21, 55, 61, 38, 44, 50], 1.4],
    ];
    const m = new THREE.Matrix4();
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const [key, plates, sc] of decor) {
      const model = this.assets.model(key);
      if (!model) continue;
      const batch = new Batch(model, plates.length * 3, null, this.matCache);
      batch.begin();
      for (const plate of plates) {
        const p = this.byPlate.get(plate);
        for (let k = 0; k < 3; k++) {
          for (let tries = 0; tries < 30; tries++) {
            const r = Math.sqrt(p.area) * 0.45;
            const x = p.centroid[0] + (rnd() - 0.5) * 2 * r;
            const y = p.centroid[1] + (rnd() - 0.5) * 2 * r;
            const dl = Math.hypot(x - p.labelPoint[0], y - p.labelPoint[1]);
            if (dl < 22 || !pointInProvince(x, y, p)) continue;
            const s = this.assets.manifest.models[key].scale * sc * (0.8 + rnd() * 0.4);
            batch.push(setYawMatrix(m, x, TILE_H, wzOf(y), rnd() * 6.28, s));
            break;
          }
          if (key === 'mountain_a' && k === 0 && p.area < 4000) break;
          if (k === 1 && p.area < 3000) break;
        }
      }
      batch.end();
      this.scene.add(batch.group);
    }
    // Ships drifting at sea.
    this.ships = [];
    const shipBatch = new Batch(this.assets.model('ship'), 6, null, this.matCache);
    const boatBatch = new Batch(this.assets.model('ship_small'), 8, null, this.matCache);
    this.scene.add(shipBatch.group, boatBatch.group);
    this.shipBatch = shipBatch; this.boatBatch = boatBatch;
    const spots = [[-80, 222, 0], [180, 205, 1], [330, 190, 0], [-260, -225, 0], [60, -205, 1], [-470, 40, 1], [-430, -120, 0], [-150, -235, 1], [-330, 150, 1]];
    for (const [x, y, small] of spots) {
      if (this.provinces.some((p) => pointInProvince(x, y, p))) continue;
      this.ships.push({ x, y, small, phase: rnd() * 6.28, yaw: rnd() * 6.28 });
    }
  }

  /** owner: team plate or 0; hex: its colour. */
  setOwnerColor(plate, hex, animate = true, owner = undefined, from = null) {
    const t = this.tiles.get(plate);
    if (!t) return;
    if (owner !== undefined) {
      this.owner.set(plate, owner);
      this.ownerHex.set(plate, hex);
      this._refreshFront(plate);
      for (const n of this.byPlate.get(plate).neighbors) this._refreshFront(n);
    }
    t.target.setHex(shadeHex(hex, t.jitter));
    t.side.color.setHex(shadeHex(hex, 0.55));
    if (!animate) { t.cur.copy(t.target); t.floodT = -1; t.flood.uFR.value = 1e5; return; }
    t.flash = 1;
    // Colour flood: the new colour spreads from where the attackers broke in.
    t.flood.uPrev.value.copy(t.cur);
    t.cur.copy(t.target);
    const p = this.byPlate.get(plate);
    t.flood.uFC.value.set(from ? from.x : p.labelPoint[0], from ? from.z : wzOf(p.labelPoint[1]));
    t.floodT = 0;
    t.flood.uFR.value = 0;
    t.liftTarget = 0;
    t.lift = 0.9; // pop up, then settle
  }

  setLift(plate, lift) {
    const t = this.tiles.get(plate);
    if (t) t.liftTarget = lift;
  }

  update(dt) {
    this.time += dt;
    this.sea.material.uniforms.time.value = this.time;
    this.frontMat.uniforms.time.value = this.time;
    for (const t of this.tiles.values()) {
      if (!t.cur.equals(t.target)) t.cur.lerp(t.target, clamp(dt * 4, 0, 1));
      if (t.floodT >= 0) {
        t.floodT += dt;
        const k = Math.min(1, t.floodT / 0.75);
        t.flood.uFR.value = t.floodMax * (1 - Math.pow(1 - k, 2));
        if (k >= 1) { t.floodT = -1; t.flood.uFR.value = 1e5; }
      }
      if (t.flash > 0) {
        t.flash = Math.max(0, t.flash - dt * 1.4);
        t.top.color.copy(t.cur).lerp(_white, t.flash * 0.45);
      } else {
        t.top.color.copy(t.cur);
      }
      if (t.lift !== t.liftTarget) {
        t.lift += (t.liftTarget - t.lift) * clamp(dt * 5, 0, 1);
        if (Math.abs(t.lift - t.liftTarget) < 0.01) t.lift = t.liftTarget;
        t.mesh.scale.y = 1 + t.lift;
      }
    }
    this._rebuildMarkers(dt);
    if (this.ships && this.ships.length) {
      this.shipBatch.begin(); this.boatBatch.begin();
      const m = this._m;
      for (const s of this.ships) {
        const bob = Math.sin(this.time * 0.8 + s.phase) * 0.4;
        const x = s.x + Math.sin(this.time * 0.05 + s.phase) * 25;
        const sc = this.assets.manifest.models[s.small ? 'ship_small' : 'ship'].scale * (s.small ? 1.2 : 0.8);
        setYawMatrix(m, x, bob - 1, wzOf(s.y), s.yaw + Math.sin(this.time * 0.3 + s.phase) * 0.05, sc);
        (s.small ? this.boatBatch : this.shipBatch).push(m);
      }
      this.shipBatch.end(); this.boatBatch.end();
    }
  }
}

const _white = new THREE.Color(0xffffff);
