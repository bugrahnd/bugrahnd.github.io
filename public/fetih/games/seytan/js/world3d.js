// The 3D world of Şeytan Avı (three.js): renderer, camera (see proj.js), moonlight, fog, bloom and
// the scene: a painted night sky (crescent and evening star), Ottoman mosques with minarets and
// mahya lights across the water, the sea with a moon path, a stone balustrade, the paved courtyard
// with an eight-pointed star inlay, brass lanterns, and the hiding spots (an old wall with a striped
// blind arch and an oil lamp, boulders, a plane tree). Also builds the catapult model.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { NEAR, FAR, camPose, toView, legacyWorld } from './proj.js';
// the scenery keeps the layout of the first, straight-ahead camera (see proj.js)
const toWorld = legacyWorld;
import { rng, makeNoise, pixelCanvas, stoneTexture } from './noise.js';
import { buildShrine } from './shrine3d.js';

export const MOON_PX = { x: 560, y: 548 };
const FOG = 0x16203a;

const tex = (canvas, repeat = [1, 1], srgb = true) => {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
const std = (o) => new THREE.MeshStandardMaterial(o);
const shadow = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };

export class World {
  /** opts.theme: 'sakura' (default, Japanese shrine courtyard; shrine3d.js) or 'osmanli' (Ottoman courtyard). */
  constructor(canvas, opts = {}) {
    this.theme = opts.theme === 'osmanli' ? 'osmanli' : 'sakura';
    const sakura = this.theme === 'sakura';
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(1);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    // bright enough to read on a phone: a moonlit night, not a dark one (the sakura scene has many
    // light sources of its own and clips to white above ~1.3)
    r.toneMappingExposure = opts.theme === 'osmanli' ? 1.55 : 1.22;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap was removed in this three.js version
    this.renderer = r;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(sakura ? 0x2a2c62 : FOG, sakura ? 0.012 : 0.006);
    this.scene = scene;

    const cam = new THREE.PerspectiveCamera(50, 1080 / 1920, NEAR, FAR);
    this.camera = cam;
    this._applyProjection();

    this.lights = {};
    this._lights();
    this._sky();
    if (sakura) {
      const shrine = buildShrine(this);
      this.props = shrine.props;
      this.lanterns = shrine.lanterns;
      this.petals = shrine.petals;
      // the devil's open spots (torso, world) around the fire pit at (0, -0.8); he enters into the pit
      this.layout = {
        open: [{ x: 0, y: 2.2, z: -0.8 }, { x: 0, y: 2.2, z: -0.8 }, { x: -1.5, y: 1.9, z: -0.2 }, { x: 1.5, y: 1.9, z: -0.3 },
          { x: 0.3, y: 2.7, z: -2.2 }, { x: -2.2, y: 1.7, z: 0.9 }, { x: 2.2, y: 1.7, z: 0.8 }],
        enter: { x: 0, y: 2.2, z: -0.8 }, laugh: { x: 0, y: 2.5, z: 0.3 },
        crowdRows: [5.0, 5.9, 6.8, 7.7],
        // machines (the catapult) roll up from the bottom of the screen and stand behind the crowd,
        // facing the devil; two slots side by side
        catapult: { home: [{ x: 1.6, z: 8.6 }, { x: -1.6, z: 8.6 }], from: { dz: 9 }, rotY: Math.PI / 2, scale: 0.78 },
      };
    } else {
      this._skyline();
      this._sea();
      this._courtyard();
      this.props = this._props();
      this.lanterns = this._lanterns();
    }

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(540, 960), 0.85, 0.55, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.shake = { x: 0, y: 0 };
  }

  _applyProjection() {
    const p = camPose();
    const c = this.camera;
    c.fov = p.fov; c.aspect = 1080 / 1920;
    c.position.set(p.pos.x, p.pos.y, p.pos.z);
    c.lookAt(p.target.x, p.target.y, p.target.z);
    c.updateProjectionMatrix();
    this.camBase = p.pos;
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(Math.round(w / 2), Math.round(h / 2));
    this._applyProjection();
  }

  // ------------------------------------------------------------------------------- lights
  _lights() {
    const s = this.scene;
    const sakura = this.theme === 'sakura';
    // sakura: cool blue-violet ambient, bright enough that everything reads (reference/style.json)
    s.add(sakura ? new THREE.HemisphereLight(0x8c96e8, 0x3c3466, 1.6) : new THREE.HemisphereLight(0x8090c8, 0x2a2834, 1.7));
    const moon = new THREE.DirectionalLight(sakura ? 0xc8d0ff : 0xd4e0ff, sakura ? 2.2 : 3.0);
    // high and only a little behind: seen from above, a low moon threw long shadows towards the camera
    moon.position.set(6, 40, -12);
    moon.target.position.set(0, 0, 2);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    // covers the courtyard the raised camera sees: x -12..12, from the balustrade to z ~14
    Object.assign(moon.shadow.camera, { left: -12, right: 12, top: 14, bottom: -14, near: 1, far: 110 });
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.03;
    s.add(moon, moon.target);
    // from the camera's side, so the faces of the devil, the props and the crowd are lit
    const fill = new THREE.DirectionalLight(0x9aa8d8, 1.4);
    fill.position.set(-5, 16, 22);
    s.add(fill);
    this.lights.moon = moon;
  }

  // ------------------------------------------------------------------------------- sky
  _sky() {
    const W = 1024; const H = 1820;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.scale(W / 1080, H / 1920);
    const n = makeNoise(11); const r = rng(5);
    const sky = g.createLinearGradient(0, 0, 0, 1100);
    if (this.theme === 'sakura') { sky.addColorStop(0, '#0c1250'); sky.addColorStop(0.4, '#1d2c8c'); sky.addColorStop(0.75, '#2c40ad'); sky.addColorStop(1, '#5a4a9c'); }
    else { sky.addColorStop(0, '#010208'); sky.addColorStop(0.35, '#050d24'); sky.addColorStop(0.68, '#0e1b3a'); sky.addColorStop(0.9, '#1b2644'); sky.addColorStop(1, '#2c3150'); }
    g.fillStyle = sky; g.fillRect(0, 0, 1080, 1920);
    const mw = pixelCanvas(180, 180, (x, y) => {
      const u = x / 180; const v = y / 180; const d = (v - (0.15 + u * 0.55)) / 0.16;
      const a = Math.max(0, Math.exp(-d * d) * (n.fbm(x * 0.05, y * 0.05, 5) - 0.3) * 1.6);
      return [190, 200, 235, a * 70];
    });
    g.globalCompositeOperation = 'lighter'; g.drawImage(mw, 0, 0, 1080, 900); g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 1300; i++) {
      const x = r() * 1080; const y = Math.pow(r(), 1.3) * 1000;
      const s = r() < 0.03 ? 1.5 + r() : 0.4 + r() * 0.8;
      const t = r();
      g.fillStyle = `rgba(${t < 0.2 ? '255,220,190' : t < 0.4 ? '200,215,255' : '255,255,255'},${(0.25 + r() * 0.75) * Math.max(0, 1 - y / 1040)})`;
      g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
    }
    const cl = pixelCanvas(270, 160, (x, y) => {
      const v = n.fbm(x * 0.02 + 40, y * 0.06, 6);
      const a = Math.min(1, Math.max(0, (v - 0.5) / 0.22));
      const dx = (x / 270) * 1080 - MOON_PX.x; const dy = 120 + (y / 160) * 640 - MOON_PX.y;
      const near = Math.max(0, 1 - Math.hypot(dx, dy) / 520);
      return [36 + near * 90, 44 + near * 95, 66 + near * 110, a * (150 + near * 40)];
    });
    g.drawImage(cl, 0, 120, 1080, 640);
    // crescent with earthshine and the evening star
    const mx = MOON_PX.x; const my = MOON_PX.y; const R = 58;
    const halo = g.createRadialGradient(mx, my, R * 0.8, mx, my, 420);
    halo.addColorStop(0, 'rgba(230,235,255,0.32)'); halo.addColorStop(0.25, 'rgba(160,180,230,0.10)'); halo.addColorStop(1, 'rgba(120,140,200,0)');
    g.fillStyle = halo; g.fillRect(mx - 430, my - 430, 860, 860);
    g.fillStyle = 'rgba(120,140,190,0.12)'; g.beginPath(); g.arc(mx, my, R, 0, Math.PI * 2); g.fill();
    const mn = makeNoise(31);
    const moonTex = pixelCanvas(R * 2, R * 2, (x, y) => {
      const dx = (x - R) / R; const dy = (y - R) / R; const d = Math.hypot(dx, dy);
      if (d > 1) return [0, 0, 0, 0];
      const k = (0.75 + 0.25 * Math.sqrt(1 - d * d)) * (mn.fbm(x * 0.06, y * 0.06, 4) > 0.55 ? 0.82 : 1);
      return [255 * k, 248 * k, 228 * k, 255];
    });
    const moon = document.createElement('canvas'); moon.width = moon.height = R * 2;
    const mg = moon.getContext('2d'); mg.drawImage(moonTex, 0, 0);
    mg.globalCompositeOperation = 'destination-out'; mg.beginPath(); mg.arc(R - 27, R - 9, R * 0.93, 0, Math.PI * 2); mg.fill();
    g.drawImage(moon, mx - R, my - R);
    const sx = mx - 80; const sy = my - 12;
    const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 34);
    sg.addColorStop(0, 'rgba(255,255,255,1)'); sg.addColorStop(0.12, 'rgba(230,240,255,0.9)'); sg.addColorStop(1, 'rgba(180,200,255,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(sx, sy, 34, 0, Math.PI * 2); g.fill();

    // The painted sky is a backdrop facing the camera 480 units away, so a pixel of the painting
    // stays that pixel on screen whatever the camera angle; everything nearer is drawn over it.
    const pose = camPose();
    const dist = 480;
    const m = toView(540, 960, dist);
    const mat = new THREE.MeshBasicMaterial({ map: tex(c), fog: false, toneMapped: false, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * dist * pose.tanX, 2 * dist * pose.tanY), mat);
    plane.position.set(m.x, m.y, m.z);
    plane.rotation.x = (-pose.pitch * Math.PI) / 180;
    plane.renderOrder = -10;
    this.scene.add(plane);
    // bloom-only glows over the moon and the star
    const glowTex = radialTexture();
    const pxToWorld = (2 * (dist - 10) * pose.tanY) / 1920;
    for (const [px, py, s, col] of [[mx + 6, my, 70, 0xdfe6ff], [sx, sy, 34, 0xffffff]]) {
      const p = toView(px, py, dist - 10);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, opacity: 0.9 }));
      sp.scale.set(s * 2 * pxToWorld, s * 2 * pxToWorld, 1);
      sp.position.set(p.x, p.y, p.z);
      sp.renderOrder = -9;
      this.scene.add(sp);
    }
  }

  // ------------------------------------------------------------------------------- skyline
  _skyline() {
    const s = this.scene; const r = rng(3);
    const stone = std({ color: 0x8c90a2, roughness: 0.92 });
    const lead = std({ color: 0x5c6676, roughness: 0.55, metalness: 0.35 });
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffb96a, toneMapped: false });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe3b0, toneMapped: false });
    this.mahya = [];
    const halfSphere = (rad) => new THREE.SphereGeometry(rad, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const mosque = (px, z, sc, mins, mahya) => {
      const g = new THREE.Group();
      const add = (geo, mat, x, y, zz = 0, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, zz); m.scale.set(sx, sy, sz); g.add(m); return m; };
      add(new THREE.BoxGeometry(6, 1.45, 4), stone, 0, 0.72);
      add(new THREE.BoxGeometry(8.6, 0.85, 3), stone, 0, 0.42);
      for (const x of [-1.6, 1.6]) add(halfSphere(1.15), lead, x, 1.45, 0, 1, 0.82, 1);
      for (const [x, y, rr] of [[-2.8, 1.45, 0.45], [2.8, 1.45, 0.45], [-3.8, 0.85, 0.32], [3.8, 0.85, 0.32]]) add(halfSphere(rr), lead, x, y, 0, 1, 0.85, 1);
      add(new THREE.CylinderGeometry(1.45, 1.5, 1.05, 28), stone, 0, 1.97);
      add(halfSphere(1.6), lead, 0, 2.48, 0, 1, 0.86, 1);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), lead, 0, 4.0);
      add(new THREE.TorusGeometry(0.1, 0.022, 6, 16, Math.PI * 1.5), lead, 0, 4.36).rotation.z = Math.PI * 0.75;
      for (let k = -5; k <= 5; k++) add(new THREE.PlaneGeometry(0.1, 0.24), winMat, k * 0.48, 1.0, 2.01);
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI - Math.PI / 2; add(new THREE.PlaneGeometry(0.08, 0.22), winMat, Math.sin(a) * 1.46, 2.0, Math.cos(a) * 1.46 + 0.02).rotation.y = a; }
      const tops = [];
      for (const mx of mins) {
        const h = Math.abs(mx) > 4.5 ? 6.6 : 7.4;
        add(new THREE.BoxGeometry(0.42, 0.9, 0.42), stone, mx, 0.45);
        add(new THREE.CylinderGeometry(0.15, 0.18, h, 12), stone, mx, h / 2);
        const balc = Math.abs(mx) > 4.5 ? [0.62] : [0.55, 0.74, 0.88];
        for (const b of balc) {
          add(new THREE.CylinderGeometry(0.3, 0.2, 0.12, 14), stone, mx, h * b);
          for (let q = 0; q < 8; q++) { const a = (q / 8) * Math.PI * 2; add(new THREE.SphereGeometry(0.035, 6, 4), lampMat, mx + Math.cos(a) * 0.3, h * b + 0.1, Math.sin(a) * 0.3); }
        }
        add(new THREE.ConeGeometry(0.17, 1.25, 12), lead, mx, h + 0.62);
        add(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 5), lead, mx, h + 1.4);
        tops.push(new THREE.Vector3(mx, h * 0.78, 0));
      }
      if (mahya && tops.length >= 3) {
        const a = tops[1]; const b = tops[2];
        for (let i = 0; i <= 30; i++) {
          const k = i / 30;
          const m = add(new THREE.SphereGeometry(0.06, 6, 4), lampMat.clone(), a.x + (b.x - a.x) * k, a.y - Math.sin(k * Math.PI) * 0.9, 0);
          this.mahya.push(m);
        }
      }
      const base = toWorld(px, 0, z);
      g.position.set(base.x, -0.35, z);
      g.scale.setScalar(sc);
      g.traverse((o) => { if (o.isMesh) o.matrixAutoUpdate = true; });
      s.add(g);
    };
    mosque(70, -110, 1.1, [-5.2, 5.2], false);
    mosque(1010, -120, 1.15, [-5.0, 5.0], false);
    mosque(760, -88, 1.25, [-5.4, 5.4], false);
    mosque(300, -70, 1.35, [-6.0, -4.3, 4.3, 6.0], true);
    // far shore, city lights and cypresses
    const shore = new THREE.Mesh(new THREE.BoxGeometry(600, 3, 40), std({ color: 0x141b2e, roughness: 1 }));
    shore.position.set(0, -0.2, -150);
    s.add(shore);
    const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.35, 0.1), winMat, 260);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 260; i++) {
      const z = -95 - r() * 40;
      const p = toWorld(r() * 1080, 0, z);
      m4.makeTranslation(p.x, 0.2 + r() * 1.6, z);
      lights.setMatrixAt(i, m4);
    }
    s.add(lights);
    const cyp = std({ color: 0x0c1610, roughness: 1 });
    for (const [px, z, h] of [[520, -64, 4.5], [560, -66, 5.5], [600, -63, 4.2], [905, -80, 5], [140, -90, 4.4]]) {
      const p = toWorld(px, 0, z);
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), cyp);
      m.scale.set(0.55, h / 2, 0.55); m.position.set(p.x, h / 2 - 0.3, z);
      s.add(m);
    }
  }

  // ------------------------------------------------------------------------------- sea
  _sea() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFog: { value: new THREE.Color(FOG) } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `
        uniform float uTime; uniform vec3 uFog; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          float dist = length(vW - cameraPosition);
          vec3 col = mix(vec3(0.012,0.022,0.055), vec3(0.04,0.06,0.12), smoothstep(5.0, 160.0, dist));
          float w = n(vec2(vW.x*1.4 + uTime*0.15, vW.z*5.0 + uTime*0.8)) * n(vec2(vW.x*0.6 - uTime*0.25, vW.z*1.6 - uTime*0.3));
          float sx = vW.x * 22.0 / (22.0 - vW.z);
          float path = exp(-pow((sx - 0.2) / (0.16 + 3.0 / max(dist, 1.0)), 2.0));
          float glit = smoothstep(0.32, 0.55, w) * path;
          col += vec3(0.75, 0.8, 1.0) * glit * 1.8;
          col += vec3(0.25, 0.3, 0.5) * path * 0.08;
          float lights = smoothstep(0.62, 0.8, n(vec2(vW.x*3.0, vW.z*0.6 + uTime*0.4))) * smoothstep(60.0, 110.0, dist) * 0.5;
          col += vec3(1.0, 0.6, 0.25) * lights * 0.25;
          float f = 1.0 - exp(-pow(0.011 * dist, 2.0));
          gl_FragColor = vec4(mix(col, uFog, f), 1.0);
        }`,
      fog: false,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 500), mat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.35, -7.4 - 250);
    this.scene.add(sea);
    this.seaMat = mat;
  }

  // ------------------------------------------------------------------------------- courtyard
  _courtyard() {
    const s = this.scene;
    const stoneC = stoneTexture(256, 256, [150, 146, 156], 41, 0.04, 0.32);
    const stoneMat = std({ map: tex(stoneC, [3, 1]), bumpMap: tex(stoneC, [3, 1], false), bumpScale: 1.2, roughness: 0.9, color: 0xb8b6c4 });
    // balustrade
    const zB = -7.2;
    const base = shadow(new THREE.Mesh(new THREE.BoxGeometry(40, 0.38, 0.55), stoneMat)); base.position.set(0, 0.19, zB); s.add(base);
    const rail = shadow(new THREE.Mesh(new THREE.BoxGeometry(40, 0.14, 0.66), stoneMat)); rail.position.set(0, 0.98, zB); s.add(rail);
    const balGeo = new THREE.LatheGeometry([[0.06, 0], [0.09, 0.05], [0.05, 0.16], [0.1, 0.34], [0.05, 0.5], [0.08, 0.55]].map(([x, y]) => new THREE.Vector2(x, y)), 10);
    const nBal = 120;
    const bal = new THREE.InstancedMesh(balGeo, stoneMat, nBal);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < nBal; i++) { m4.makeTranslation(-18 + i * 0.3, 0.38, zB); bal.setMatrixAt(i, m4); }
    shadow(bal); s.add(bal);
    for (let x = -18; x <= 18; x += 3) { const p = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.12, 0.6), stoneMat)); p.position.set(x, 0.56, zB); s.add(p); }

    // paving: slabs with joints, painted on a canvas
    const pc = document.createElement('canvas'); pc.width = pc.height = 512;
    const pg = pc.getContext('2d');
    pg.drawImage(stoneTexture(256, 256, [92, 90, 100], 51, 0.03, 0.35), 0, 0, 512, 512);
    const r = rng(52);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { pg.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.07})`; pg.fillRect(i * 128, j * 128, 128, 128); }
    pg.strokeStyle = 'rgba(10,10,16,0.85)'; pg.lineWidth = 4;
    for (let i = 0; i <= 4; i++) { pg.beginPath(); pg.moveTo(i * 128, 0); pg.lineTo(i * 128, 512); pg.stroke(); pg.beginPath(); pg.moveTo(0, i * 128); pg.lineTo(512, i * 128); pg.stroke(); }
    // From the balustrade (z -7.2) to just in front of the camera (z 21): the bottom edge of the
    // 1080x1920 frame looks down at z ~19, so a shorter floor left an empty band under the chat line.
    const floorMat = std({ map: tex(pc, [10, 7]), bumpMap: tex(pc, [10, 7], false), bumpScale: 2, roughness: 0.82, color: 0xc0bfcc });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 28.2), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 6.9); floor.receiveShadow = true;
    s.add(floor);
    // eight-pointed star inlay
    const ic = document.createElement('canvas'); ic.width = ic.height = 512;
    const ig = ic.getContext('2d'); ig.translate(256, 256);
    const star8 = (rad) => { ig.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8 - Math.PI / 2; const rr = i % 2 ? rad * 0.78 : rad; ig.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ig.closePath(); };
    ig.beginPath(); ig.arc(0, 0, 250, 0, Math.PI * 2); ig.lineWidth = 10; ig.strokeStyle = 'rgba(214,204,186,0.5)'; ig.stroke();
    ig.fillStyle = 'rgba(214,204,186,0.55)'; star8(230); ig.fill();
    ig.lineWidth = 10; ig.strokeStyle = 'rgba(122,59,44,0.9)'; star8(230); ig.stroke();
    ig.fillStyle = 'rgba(28,50,70,0.85)'; star8(150); ig.fill();
    ig.strokeStyle = 'rgba(214,180,110,0.9)'; ig.lineWidth = 8; star8(150); ig.stroke();
    const inlay = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), std({ map: tex(ic), transparent: true, roughness: 0.4, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 }));
    inlay.rotation.x = -Math.PI / 2; inlay.position.set(0.1, 0.01, 1.4); inlay.receiveShadow = true;
    s.add(inlay);
    this.stoneMat = stoneMat;
  }

  _lanterns() {
    const out = [];
    const iron = std({ color: 0x1d1d22, roughness: 0.5, metalness: 0.7 });
    const brass = std({ color: 0x8a6a2c, roughness: 0.35, metalness: 0.85 });
    const glass = new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false });
    for (const [x, z] of [[-4.6, 0.6], [4.7, 0.6]]) {
      const g = new THREE.Group();
      const post = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.9, 10), iron)); post.position.y = 0.95; g.add(post);
      const foot = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.14, 12), iron)); foot.position.y = 0.07; g.add(foot);
      const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.42, 6), glass); gl.position.y = 2.14; g.add(gl);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.44, 0.02), brass); b.position.set(Math.cos(a) * 0.16, 2.14, Math.sin(a) * 0.16); g.add(b); }
      const cap = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.3, 6), brass)); cap.position.y = 2.5; g.add(cap);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), brass); tip.position.y = 2.7; g.add(tip);
      const light = new THREE.PointLight(0xffa860, 6, 6.5, 2);
      light.position.y = 2.14; g.add(light);
      g.position.set(x, 0, z);
      this.scene.add(g);
      out.push({ light, base: 6, seed: x });
    }
    return out;
  }

  // ------------------------------------------------------------------------------- props
  _props() {
    const wall = this._wall(); const rocks = this._rocks(); const tree = this._tree();
    // hiding spots: world position of the devil's torso when he hides there (behind the prop, z -1.4).
    // Low enough that, seen from the raised camera, his horns stay below the health bar (the old
    // "in the plane tree's branches" spot put them in TikTok's header and was dropped).
    const at = (px, py, label, y) => { const p = toWorld(px, py, -1.4); return { ...p, y: y ?? p.y, label }; };
    return [
      { id: 'wall', obj: wall, hides: [at(238, 818, 'eski duvarın arkasına', 2.2)], break: wall },
      { id: 'rocks', obj: rocks, hides: [at(560, 1048, 'kayaların arkasına')], break: rocks },
      { id: 'tree', obj: tree.group, hides: [at(862, 960, 'çınarın arkasına')], break: tree.group, canopy: tree.canopy },
    ];
  }

  _wall() {
    const g = new THREE.Group();
    const r = rng(21);
    // ashlar texture with courses
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const cg = c.getContext('2d');
    cg.drawImage(stoneTexture(256, 256, [138, 124, 106], 23, 0.05, 0.34), 0, 0, 512, 512);
    cg.strokeStyle = 'rgba(25,20,16,0.8)'; cg.lineWidth = 4;
    for (let row = 0, y = 512; y > 0; y -= 76, row++) {
      cg.beginPath(); cg.moveTo(0, y); cg.lineTo(512, y); cg.stroke();
      let x = (row % 2) * 60 - 60;
      while (x < 512) { x += 90 + r() * 70; cg.beginPath(); cg.moveTo(x, y); cg.lineTo(x, y - 76); cg.stroke(); }
    }
    const wallMat = std({ map: tex(c, [0.45, 0.45]), bumpMap: tex(c, [0.45, 0.45], false), bumpScale: 3, roughness: 0.92 });
    const top = [[-1.6, 3.15], [-1.4, 3.35], [-1.15, 3.25], [-0.92, 3.65], [-0.62, 3.58], [-0.4, 3.92], [-0.1, 3.8], [0.16, 4.02], [0.44, 3.76], [0.7, 3.84], [0.92, 3.45], [1.2, 3.52], [1.45, 3.1], [1.6, 2.95]];
    const shape = new THREE.Shape();
    shape.moveTo(-1.6, 0); for (const [x, y] of top) shape.lineTo(x, y); shape.lineTo(1.6, 0); shape.lineTo(-1.6, 0);
    const arch = (inset = 0) => {
      const p = new THREE.Path();
      p.moveTo(-0.7 + inset, 0.25); p.lineTo(-0.7 + inset, 1.9);
      p.quadraticCurveTo(-0.69 + inset, 2.5 - inset, 0, 2.78 - inset * 1.3);
      p.quadraticCurveTo(0.69 - inset, 2.5 - inset, 0.7 - inset, 1.9); p.lineTo(0.7 - inset, 0.25); p.lineTo(-0.7 + inset, 0.25);
      return p;
    };
    shape.holes.push(arch());
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.7, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1, curveSegments: 18 });
    geo.translate(0, 0, -0.35);
    g.add(shadow(new THREE.Mesh(geo, wallMat)));
    // recessed back of the niche, warm-lit by the lamp
    const nicheShape = new THREE.Shape(arch().getPoints(24));
    const niche = new THREE.Mesh(new THREE.ShapeGeometry(nicheShape), std({ color: 0x2a2630, roughness: 1 }));
    niche.position.z = -0.12; niche.receiveShadow = true; g.add(niche);
    // striped voussoirs (ablaq)
    const cream = std({ color: 0xd8ccb0, roughness: 0.75, bumpMap: tex(c, [0.45, 0.45], false), bumpScale: 2 });
    const red = std({ color: 0x84402e, roughness: 0.8, bumpMap: tex(c, [0.45, 0.45], false), bumpScale: 2 });
    const qp = (p0, p1, p2, k) => [(1 - k) ** 2 * p0[0] + 2 * (1 - k) * k * p1[0] + k * k * p2[0], (1 - k) ** 2 * p0[1] + 2 * (1 - k) * k * p1[1] + k * k * p2[1]];
    const halves = (o) => [[[-0.7 - o, 1.9], [-0.69 - o, 2.5 + o], [0, 2.78 + o * 1.3]], [[0, 2.78 + o * 1.3], [0.69 + o, 2.5 + o], [0.7 + o, 1.9]]];
    const inner = halves(0); const outer = halves(0.26);
    let idx = 0;
    for (let h = 0; h < 2; h++) {
      for (let k = 0; k < 6; k++) {
        const a0 = k / 6; const a1 = (k + 1) / 6;
        const pts = [qp(...inner[h], a0), qp(...outer[h], a0), qp(...outer[h], a1), qp(...inner[h], a1)];
        const sh = new THREE.Shape(); sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p); sh.lineTo(...pts[0]);
        const vg = new THREE.ExtrudeGeometry(sh, { depth: 0.76, bevelEnabled: false });
        vg.translate(0, 0, -0.38);
        g.add(shadow(new THREE.Mesh(vg, idx++ % 2 ? cream : red)));
      }
    }
    // little columns, capitals
    const marble = std({ color: 0xcfc8ba, roughness: 0.4 });
    for (const x of [-0.66, 0.66]) {
      const col = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.62, 12), marble)); col.position.set(x, 1.06, 0.3); g.add(col);
      const cap = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.2), marble)); cap.position.set(x, 1.92, 0.3); g.add(cap);
    }
    // hanging oil lamp (kandil)
    const chain = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2.72, 0.05), new THREE.Vector3(-0.08, 1.98, 0.05), new THREE.Vector3(0, 2.72, 0.05), new THREE.Vector3(0.08, 1.98, 0.05)]), new THREE.LineBasicMaterial({ color: 0x2a2218 }));
    g.add(chain);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffbf60, toneMapped: false }));
    lamp.position.set(0, 1.88, 0.05); lamp.scale.y = 0.85; g.add(lamp);
    const lampLight = new THREE.PointLight(0xffa050, 4, 3.4, 2); lampLight.position.set(0, 1.8, 0.25); g.add(lampLight);
    this.kandil = lampLight;
    // grass tufts at the base
    const grass = std({ color: 0x24402c, roughness: 1 });
    for (let i = 0; i < 26; i++) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22 + r() * 0.2, 4), grass);
      b.position.set(-1.7 + r() * 3.4, 0.1, 0.38 + r() * 0.15); b.rotation.z = (r() - 0.5) * 0.6; g.add(b);
    }
    const p = toWorld(230, 1158, 0);
    g.position.set(p.x, 0, 0);
    this.scene.add(g);
    return g;
  }

  _rocks() {
    const g = new THREE.Group();
    const n = makeNoise(82);
    const c = stoneTexture(256, 256, [120, 114, 106], 83, 0.05, 0.4);
    const mat = std({ map: tex(c, [2, 2]), bumpMap: tex(c, [2, 2], false), bumpScale: 3, roughness: 0.95, vertexColors: true });
    const list = [[-0.85, 0.82, 0.15, 1.05, [1.15, 0.82, 0.92]], [0.95, 0.88, 0.05, 1.12, [1.1, 0.85, 0.85]], [0.05, 1.45, -0.3, 0.98, [1.0, 0.92, 0.9]], [1.75, 0.34, 0.6, 0.46, [1.2, 0.75, 1]], [-1.55, 0.3, 0.55, 0.42, [1.2, 0.72, 1]]];
    for (const [x, y, z, rad, sc] of list) {
      const geo = new THREE.IcosahedronGeometry(rad, 4);
      const pos = geo.attributes.position; const col = new Float32Array(pos.count * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const d = 1 + (n.fbm(v.x * 1.6 + x * 3 + v.z * 0.7, v.y * 1.6 + v.z * 1.1, 4) - 0.5) * 0.5;
        v.multiplyScalar(d);
        pos.setXYZ(i, v.x, v.y, v.z);
        const up = v.y / rad;
        const moss = Math.max(0, Math.min(1, (up - 0.35) * 2.2)) * (0.5 + n.noise(v.x * 6, v.z * 6) * 0.6);
        col[i * 3] = 1 - moss * 0.55; col[i * 3 + 1] = 1 - moss * 0.2; col[i * 3 + 2] = 1 - moss * 0.6;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const m = shadow(new THREE.Mesh(geo, mat));
      m.position.set(x, y, z); m.scale.set(...sc); m.rotation.y = x;
      g.add(m);
    }
    const p = toWorld(560, 1158, 0);
    g.position.set(p.x, 0, 0);
    this.scene.add(g);
    return g;
  }

  _tree() {
    const g = new THREE.Group();
    const n = makeNoise(62);
    const bark = pixelCanvas(128, 256, (x, y) => {
      const v = n.fbm(x * 0.06, y * 0.03, 4);
      const k = 0.85 + n.noise(x * 0.5, y * 0.03) * 0.15 + n.noise(x * 0.3, y * 0.3) * 0.1;
      return v > 0.55 ? [160 * k, 156 * k, 132 * k, 255] : [88 * k, 76 * k, 60 * k, 255];
    });
    const barkMat = std({ map: tex(bark, [2, 1]), bumpMap: tex(bark, [2, 1], false), bumpScale: 3, roughness: 0.9 });
    const trunkGeo = new THREE.CylinderGeometry(0.36, 0.56, 4.6, 22, 14);
    const tp = trunkGeo.attributes.position; const v = new THREE.Vector3();
    for (let i = 0; i < tp.count; i++) {
      v.fromBufferAttribute(tp, i);
      const a = Math.atan2(v.z, v.x);
      const d = 1 + (n.noise(a * 2 + 5, v.y * 1.4) - 0.5) * 0.25;
      tp.setXYZ(i, v.x * d + Math.sin(v.y * 0.8) * 0.08, v.y, v.z * d);
    }
    trunkGeo.computeVertexNormals();
    const trunk = shadow(new THREE.Mesh(trunkGeo, barkMat)); trunk.position.y = 2.3; g.add(trunk);
    const flare = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.95, 0.5, 22), barkMat)); flare.position.y = 0.25; g.add(flare);
    for (const [rz, rx, len] of [[0.75, 0.1, 2.2], [-0.8, -0.1, 2.1], [0.25, 0.5, 1.7], [-0.2, -0.45, 1.8]]) {
      const b = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.2, len, 10), barkMat));
      b.geometry.translate(0, len / 2, 0);
      b.position.set(0, 3.9, 0); b.rotation.set(rx, 0, rz); g.add(b);
    }
    const canopy = new THREE.Group(); canopy.position.set(0, 5.75, -0.15); g.add(canopy);
    const r = rng(61);
    const leafGeo = new THREE.IcosahedronGeometry(1, 1);
    const leafMat = std({ color: 0xffffff, roughness: 0.85, flatShading: true });
    const N = 64;
    const inst = new THREE.InstancedMesh(leafGeo, leafMat, N);
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler();
    const color = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = r() * Math.PI * 2; const b = Math.acos(r() * 2 - 1); const d = Math.cbrt(r());
      const p = new THREE.Vector3(Math.sin(b) * Math.cos(a) * 2.0 * d, Math.cos(b) * 1.55 * d, Math.sin(b) * Math.sin(a) * 1.15 * d);
      const s = 0.45 + r() * 0.45;
      e.set(r() * 3, r() * 3, r() * 3); q.setFromEuler(e);
      m4.compose(p, q, new THREE.Vector3(s, s * 0.85, s));
      inst.setMatrixAt(i, m4);
      const lit = 0.5 + p.y / 3.2 + p.x / 6;
      color.setRGB(0.1 + lit * 0.06, 0.2 + lit * 0.1, 0.13 + lit * 0.05);
      inst.setColorAt(i, color);
    }
    shadow(inst); canopy.add(inst);
    const p = toWorld(862, 1158, 0);
    g.position.set(p.x, 0, -0.1);
    this.scene.add(g);
    return { group: g, canopy };
  }

  // ------------------------------------------------------------------------------- per frame
  update(t, dt) {
    if (this.seaMat) this.seaMat.uniforms.uTime.value = t;
    for (const l of this.lanterns) l.light.intensity = l.base * (0.85 + 0.1 * Math.sin(t * 13 + l.seed) + 0.05 * Math.sin(t * 29 + l.seed * 2));
    if (this.kandil) this.kandil.intensity = 4 * (0.8 + 0.12 * Math.sin(t * 11) + 0.08 * Math.sin(t * 23));
    for (const [i, m] of (this.mahya || []).entries()) m.material.color.setScalar(0.55 + 0.45 * Math.sin(t * 3 + i * 0.7)).multiply(new THREE.Color(1, 0.88, 0.7));
    for (const p of this.props) if (p.canopy) { p.canopy.rotation.z = Math.sin(t * 0.7) * 0.02; p.canopy.rotation.x = Math.sin(t * 0.53) * 0.015; }
    this.petals?.update(t, dt);
    for (const p of this.props) {
      if (p.wobble > 0) { p.wobble = Math.max(0, p.wobble - dt); p.obj.position.x = (p.baseX ??= p.obj.position.x) + Math.sin(t * 70) * 0.05 * p.wobble; }
    }
  }

  render() {
    const c = this.camera; const b = this.camBase;
    c.position.set(b.x + this.shake.x, b.y + this.shake.y, b.z);
    this.composer.render();
  }
}

/** Soft round sprite texture (white). */
export function radialTexture(size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** Catapult model (faces +X). Returns { group, arm, cup } with arm rotation.z: 0 cocked, -1.45 released. */
export function makeCatapult() {
  const g = new THREE.Group();
  const wood = std({ color: 0x6a4428, roughness: 0.85 });
  const dark = std({ color: 0x3e2716, roughness: 0.9 });
  const iron = std({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.7 });
  const box = (w, h, d, m, x, y, z, rz = 0) => { const b = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)); b.position.set(x, y, z); b.rotation.z = rz; g.add(b); return b; };
  for (const z of [-0.45, 0.45]) box(2.2, 0.16, 0.14, wood, 0, 0.42, z);
  for (const x of [-0.9, 0.9]) box(0.16, 0.14, 1.04, wood, x, 0.42, 0);
  for (const z of [-0.45, 0.45]) { box(0.12, 1.3, 0.12, wood, -0.25, 1.0, z, 0.45); box(0.12, 1.3, 0.12, wood, 0.35, 1.0, z, -0.45); }
  box(0.1, 0.1, 1.04, iron, 0.05, 1.55, 0);
  for (const [x, z] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]]) {
    const w = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 18), dark)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.34, z); g.add(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 8), iron); hub.rotation.x = Math.PI / 2; hub.position.set(x, 0.34, z); g.add(hub);
  }
  const arm = new THREE.Group(); arm.position.set(0.05, 1.55, 0); g.add(arm);
  const beam = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.12), wood)); beam.position.set(-0.6, 0, 0); arm.add(beam);
  const cupM = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), dark)); cupM.position.set(-1.5, 0.1, 0); cupM.rotation.z = Math.PI; arm.add(cupM);
  const cup = new THREE.Object3D(); cup.position.set(-1.5, 0.28, 0); arm.add(cup);
  arm.rotation.z = 0.35;
  return { group: g, arm, cup };
}
