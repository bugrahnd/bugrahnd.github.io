// Entry point: loads data and assets, wires systems together, runs the frame loop.
import * as THREE from 'three';
import { Assets } from './assets.js';
import { MapView, TILE_H, setMapStretch, wzOf } from './map.js';
import { CameraRig } from './camera.js';
import { Director } from './director.js';
import { Effects } from './effects.js';
import { UnitRenderer } from './units.js';
import { ArrowRenderer } from './arrows.js';
import { PlateLabels, ArmyLabels, Floaters, WorldTags, CommanderBadges } from './labels.js';
import { Hud } from './hud.js';
import { Minimap } from './minimap.js';
import { AudioManager } from './audio.js';
import { BridgeClient } from './net.js';
import { DemoSim, DEMO_PRESETS } from './demo-sim.js';
import { Game } from './game.js';
import { assignTeamColors, hexCss } from './colors.js';
import { urlOpts, isLoopbackHost } from './util.js';
import { applySettings } from './settings.js';

const fetchJson = (url) => fetch(url, { cache: 'no-cache' }).then((r) => {
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
});

async function main() {
  const fill = document.getElementById('loading-fill');
  const ltext = document.getElementById('loading-text');
  const [config, provData, aliases] = await Promise.all([
    fetchJson('config/game.json'), fetchJson('data/provinces.json'), fetchJson('data/aliases.json'),
  ]);
  // Pristine copy: streamer settings from the bridge are applied on top of this.
  const baseConfig = JSON.parse(JSON.stringify(config));
  const provinces = provData.provinces;
  for (const p of provinces) {
    // Defensive defaults for older data files.
    if (!Array.isArray(p.seaNeighbors)) p.seaNeighbors = [];
    if (!Array.isArray(p.neighbors)) p.neighbors = [];
  }
  setMapStretch(config.visual.mapStretch ?? 1);

  // Demo mode (static hosting: no bridge). ?demo=1|low|medium|high|chaos, ?demo=0 forces the bridge.
  // The bridge itself (or a DNS name for 127.0.0.1): same-origin bridge, stream layout, no demo.
  const isLocal = isLoopbackHost(location.hostname);
  const demoParam = urlOpts.demo;
  // Stream mode (?yayin=1 / ?bridge=…): always the bridge, never the demo, on any host.
  const streamBridge = urlOpts.bridgeUrl;
  let demoWanted = streamBridge ? false : demoParam === '0' ? false : !!demoParam || !isLocal;
  const demoPreset = DEMO_PRESETS[demoParam] ? demoParam : 'medium';
  // Phones / demo: cap the expensive bits instead of letting the frame rate crawl.
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
  if (mobile || demoWanted) {
    const v = config.visual;
    v.maxParticles = Math.min(v.maxParticles, mobile ? 1200 : 2000);
    v.maxFiguresTotal = Math.min(v.maxFiguresTotal, mobile ? 320 : 500);
    v.maxSiegeEngines = Math.min(v.maxSiegeEngines, 10);
    v.maxArrows = Math.min(v.maxArrows ?? 40, mobile ? 20 : 30);
  }
  const assets = await Assets.load((p) => { fill.style.width = `${Math.round(p * 100)}%`; });
  ltext.textContent = 'Harita hazırlanıyor…';

  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x0b1d2e, 1);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x3a4a5a, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(-250, 500, 350);
  scene.add(sun);

  const effects = new Effects(scene, assets.atlas, config.visual.maxParticles);
  const map = new MapView(scene, provinces, assets, config, effects);
  const rig = new CameraRig(config);
  {
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const p of provinces) for (const poly of p.polygons) for (const [x, y] of poly[0]) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, wzOf(y)); maxZ = Math.max(maxZ, wzOf(y));
    }
    rig.setBounds(minX, maxX, minZ, maxZ);
  }
  const director = new Director(rig, config);
  const hudRoot = document.getElementById('hud');
  const overlay = document.getElementById('overlay');
  // Portrait variant: the TikTok safe-zone "stream" layout on localhost (OBS source),
  // the full-height layout for the web demo on phones; ?layout=stream|full overrides.
  const hud = new Hud(hudRoot, assets, config, provinces.length, { variant: isLocal || streamBridge ? 'stream' : 'full', zones: urlOpts.zones });
  const minimap = new Minimap(hudRoot, provinces, 300);
  const plates = new PlateLabels(overlay, provinces, config);
  const armyLabels = new ArmyLabels(overlay);
  const commanders = new CommanderBadges(overlay, assets, 3);
  const tags = new WorldTags(overlay, config.hud.maxTags ?? 8);
  const floaters = new Floaters(overlay, config.hud.floaterMax);
  const units = new UnitRenderer(scene, assets, config);
  const arrows = new ArrowRenderer(scene, config.visual.maxArrows ?? 40);
  const audio = new AudioManager(assets.manifest, config, { mute: urlOpts.mute, noMusic: urlOpts.noMusic });
  const colors = assignTeamColors(provinces);

  let W = 1; let H = 1; let band = { x: 0, y: 0, w: 1, h: 1, u: 1 };
  let busy = false; // event rate above hud.busyEventsPerSec (chaos-level traffic)
  let lastCalm = true;
  const view = {
    map, effects, plates, hud, audio, camera: rig, director, arrows, tags, commanders,
    roundOverride: urlOpts.roundSec,
    floater(pv, text, colorHex, big = false, size = '') {
      // Heavy traffic in the overview: only the big floaters (gifts, bursts) are shown.
      if (!big && busy && rig.zoom <= 1.3) return;
      floaters.spawn(new THREE.Vector3(pv.wx, TILE_H + 8, pv.wz), text, hexCss(colorHex), rig.camera, W, H, big, size);
    },
  };
  const game = new Game({ provinces, aliases, colors, config, view });
  director.fallback = () => game.leaderFront();
  // Gift ladder tiles show "+N asker" from the live gift curve.
  hud.troopsFor = (coins) => game.giftTroops(coins);
  hud.setGiftStrip(config.hud.giftStrip, config.hud.giftStripTroops !== false);
  window.__game = game; // handy for debugging from the console
  window.__audio = audio;
  // ?audiolog=1: record which sounds fire or are skipped (window.__audio.trace).
  if (new URLSearchParams(location.search).get('audiolog') === '1') audio.trace = [];
  window.__director = director;
  window.__scene = scene; window.__renderer = renderer;

  // ---- streamer settings / commands / source changes from the bridge ----
  let resize = () => {}; // assigned below
  window.__settings = null;
  const onSettings = (values) => {
    const s = applySettings(config, baseConfig, values);
    window.__settings = { values, applied: s };
    hud.setGiftStrip(s.giftStrip, s.giftStripTroops);
    hud.setCta(s.cta.text, s.cta.example);
    hud.setTitle(s.title);
    hud.setGiftHeading?.(s.giftHeading);
    const zonesChanged = hud.setZones?.(s.zones);
    if (hud.setVisibility(s.show) || zonesChanged) resize();
    audio.applyVolumes(urlOpts.mute || s.mute);
    director.enabled = s.director;
  };
  const onCommand = (name) => {
    if (name === 'restartRound') game.restartRound();
    else if (name === 'endRound') game.endRound(null);
    else if (name === 'resetSession') { game.resetSession(); hud.feed('Günlük skor sıfırlandı', 0xffd166, 'trophy', true); }
    else if (name === 'clearMap') game.clearMap();
  };
  // Simulator <-> live switch: fake simulator teams must never stay on a real stream.
  let lastMode = null;
  const onBridgeMessage = (msg) => {
    if (msg.type === 'settings') { onSettings(msg.values); return; }
    if (msg.type === 'command') { onCommand(String(msg.name || '')); return; }
    if (msg.type === 'gifts') { hud.setGiftCatalog(msg.items); return; }
    if (msg.type === 'status' && (msg.mode === 'sim' || msg.mode === 'live')) {
      if (lastMode && msg.mode !== lastMode) game.clearMap();
      lastMode = msg.mode;
    }
    game.handleEvent(msg);
  };

  // Event source: the bridge WebSocket, or the in-browser demo simulator.
  let net = { connected: false };
  let demo = null;
  const startDemo = () => {
    if (demo) return;
    if (net.close) net.close();
    demo = new DemoSim((msg) => game.handleEvent(msg), demoPreset);
    net = { connected: true };
    hud.setDemo(demoPreset);
    hud.setConnected(true);
    demo.start();
    window.__demo = demo;
  };
  if (streamBridge) console.info(`Yayın modu: köprü ${streamBridge} (demo kapalı)`);
  if (demoWanted) startDemo();
  else {
    hud.setConnected(false);
    const bridge = new BridgeClient(onBridgeMessage, (ok) => hud.setConnected(ok), streamBridge);
    net = bridge;
    // On localhost the bridge is the real source: never fall back to fake viewers, keep
    // reconnecting and show a small waiting state (demo only with ?demo=1). Remote hosts
    // without ?demo=0 already start in demo mode above.
    setTimeout(() => { if (!bridge.connected && !bridge.received && !demo) hud.setStatus({ mode: '', connected: false, error: 'Köprü bekleniyor…' }); }, 4000);
  }

  resize = function resizeNow() {
    W =Math.max(1, Math.round(window.visualViewport?.width || window.innerWidth));
    H = Math.max(1, Math.round(window.visualViewport?.height || window.innerHeight));
    renderer.setSize(W, H, false);
    band = hud.applyLayout(W, H, urlOpts.layout);
    // The stream layout's band is wide and short: a steeper view fits Turkey wider in it.
    const streamNow = document.documentElement.classList.contains('stream');
    rig.setTilt(streamNow ? (config.visual.streamTiltDeg ?? config.visual.tiltDeg) : config.visual.tiltDeg);
    rig.fit(W, H, band.fit || band);
    tags.band = band;
    plates.layout(rig.camera, W, H, config.visual.labelSizePx * band.u, band);
    // Map overlays (plates, tags, counters) stay inside the map band.
    // (a clipped box with offset layers is much cheaper to composite than clip-path).
    Object.assign(overlay.style, { left: `${band.x}px`, top: `${band.y}px`, width: `${band.w}px`, height: `${band.h}px` });
    overlay.style.setProperty('--bx', `${band.x}px`); overlay.style.setProperty('--by', `${band.y}px`);
    overlay.style.setProperty('--vw', `${W}px`); overlay.style.setProperty('--vh', `${H}px`);
    document.documentElement.style.setProperty('--plate-k', String(band.u));
    // Name tags scale with the map, not the stage: a smaller map gets smaller tags.
    const mapK = band.fit ? Math.min(1, Math.max(0.6, band.fit.w / (960 * band.u))) : 1;
    document.documentElement.style.setProperty('--tag-k', String(band.u * mapK));
  };
  window.addEventListener('resize', () => resize());
  window.visualViewport?.addEventListener('resize', () => resize());
  // Phones: no page scroll, pinch zoom or double-tap zoom.
  for (const ev of ['touchmove', 'gesturestart', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  resize();

  // ---- audio (autoplay handling) ----
  const unlock = () => {
    audio.resume().then(() => hud.showAudioButton(audio.blocked, unlock));
  };
  audio.onStateChange = () => hud.showAudioButton(audio.blocked, unlock);
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('touchend', unlock);
  audio.load().then(() => {
    audio.resume();
    setTimeout(() => hud.showAudioButton(audio.blocked, unlock), 600);
  });

  // ---- keyboard shortcuts ----
  let debug = urlOpts.debug;
  hud.toggleDebug(debug);
  window.addEventListener('keydown', (e) => {
    unlock();
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'r') game.restartRound();
    else if (k === 'e') game.endRound(null);
    else if (k === 'm') hud.feed(audio.toggleMusic() ? 'Müzik açık' : 'Müzik kapalı', 0xffd166, 'hourglass', true);
    else if (k === 'n') hud.feed(audio.toggleMute() ? 'Ses kapalı' : 'Ses açık', 0xffd166, 'hourglass', true);
    else if (k === 'd') { debug = !debug; hud.toggleDebug(debug); }
    else if (k === 'c') director.enabled = !director.enabled;
    else if (k === 'x') onCommand('resetSession');
  });

  document.getElementById('loading').remove();

  const ownerHex = (plate) => map.ownerHex.get(plate);
  const fxBase = config.visual.fxScale ?? 1.5;

  // ---- frame loop ----
  let last = performance.now();
  let hudT = 0; let dbgT = 0; let frames = 0; let fps = 0; let fpsT = 0; let worstMs = 0;
  let lastEvents = 0; let evRate = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(0.1, Math.max(0, raw));
    frames++; fpsT += raw; worstMs = Math.max(worstMs, raw * 1000);
    if (fpsT >= 1) {
      fps = frames / fpsT; frames = 0; fpsT = 0;
      evRate = game.stats.events - lastEvents; lastEvents = game.stats.events;
      busy = evRate >= (config.hud.busyEventsPerSec ?? 14);
    }

    const zoom = rig.zoom;
    const unitK = config.visual.unitScale * Math.pow(Math.max(1, zoom), -(config.visual.unitZoomShrink ?? 0.5));
    effects.setScale(fxBase * Math.pow(Math.max(1, zoom), -(config.visual.fxZoomShrink ?? 0.85)));
    arrows.k = Math.pow(Math.max(1, zoom), -0.6);

    game.step(dt);
    director.update(dt);
    rig.update(dt);
    map.setZoom(rig.zoom);
    map.update(dt);
    units.update(dt, game.armies, game.sieges, game.projectiles, rig.zoom);
    arrows.update(dt, game.armies);
    effects.update(dt);
    // Draw the 3D view only inside the map band; the HUD background shows elsewhere.
    renderer.setScissorTest(false);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.setScissorTest(true);
    renderer.setScissor(band.x, H - band.y - band.h, band.w, band.h);
    renderer.setClearColor(0x0b1d2e, 1);
    renderer.render(scene, rig.camera);
    plates.update(rig.camera, W, H, rig.version, rig.zoom);
    armyLabels.update(game.armies, rig.camera, W, H, rig.zoom, unitK, busy ? (config.hud.busyArmyMinTroops ?? 150) : 0);
    commanders.update(rig.camera, W, H, unitK, rig.zoom, config.visual.labelSizePx * band.u * 1.6);
    // Heavy traffic in the overview: secondary plate extras (conqueror names, comeback flags) hide.
    const calm = !(busy && rig.zoom <= 1.3);
    if (calm !== lastCalm) { lastCalm = calm; overlay.classList.toggle('busy', !calm); }
    tags.maxNow = rig.zoom > 1.3 ? (config.hud.maxTags ?? 8) : (config.hud.maxTagsOverview ?? 4);
    // Stream layout: at most two name tags over the map at once.
    if (document.documentElement.classList.contains('stream')) tags.maxNow = Math.min(tags.maxNow, config.hud.maxTagsStream ?? 2);
    tags.update(dt, rig.camera, W, H);

    hudT -= dt;
    if (hudT <= 0) {
      hud.update(game.summary(), 0.25 - hudT); hudT = 0.25;
    }
    minimap.update(dt, rig.zoom, ownerHex, rig.zoom > 1.12 ? rig.visibleQuad(W, H, band) : null);
    if (debug) {
      dbgT -= dt;
      if (dbgT <= 0) {
        dbgT = 0.5;
        const info = renderer.info;
        const mem = performance.memory ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB` : '-';
        hud.setDebug([
          `FPS ${fps.toFixed(0)}  en kötü kare ${worstMs.toFixed(0)} ms  zoom ${rig.zoom.toFixed(2)}`,
          `çizim ${info.render.calls}  üçgen ${(info.render.triangles / 1000).toFixed(0)}k`,
          `ordu ${game.armies.length}  figür ${units.figureCount}+${units.tokenCount}  kuşatma ${game.sieges.length}  mermi ${game.projectiles.length}`,
          `parçacık ${effects.count}  oyuncu ${game.players.size}  bekleyen ${game.pending.size}`,
          `takım ${[...game.teams.values()].filter((t) => t.awake).length}  olay/sn ${evRate}  ws ${net.connected ? 'bağlı' : 'kopuk'}`,
          `bellek ${mem}  geo ${info.memory.geometries}  tex ${info.memory.textures}`,
          'R: yeni tur  E: bitir  M: müzik  N: ses  D: debug  C: kamera  X: skor sıfırla',
        ].join('\n'));
        worstMs = 0;
      }
    }
  }
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  const t = document.getElementById('loading-text');
  if (t) t.textContent = 'Yükleme hatası: ' + (e && e.message ? e.message : e);
});
