// Entry point of Halat Çekme: config + manifest, bridge or demo connection (shared/bridge.js,
// shared/settings-client.js), the 3D scene, audio, the overlay (./hud/index.js, optional) and
// the frame loop.
import * as THREE from 'three';
import { pageMode, BridgeClient } from '../../../shared/bridge.js';
import { GameSettings } from '../../../shared/settings-client.js';
import { zonesFrom } from '../../../shared/zones.js';
import { createGame } from './core.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { flatFromConfig } from './settings-map.js';
import { Assets } from './assets.js';
import { AudioManager } from './audio.js';
import { HalatScene } from './scene.js';
import { loadGenerators } from './models.js';
import { DemoSim, DEMO_PRESETS } from './demo-sim.js';
import { urlOpts, deepMerge, clone } from './util.js';

const GAME_ID = 'halat'; // = oyun.json "id"
const DESIGN_W = 1080;
const DESIGN_H = 1920;
const SAFE = { top: 230, bottom: 1340, side: 60 };

async function loadConfig() {
  const cfg = clone(DEFAULT_CONFIG);
  try {
    const res = await fetch('config.json', { cache: 'no-cache' });
    if (res.ok) deepMerge(cfg, await res.json());
  } catch (e) { console.warn('[halat] config.json', e); }
  if (urlOpts.roundSec) cfg.round.durationSec = urlOpts.roundSec;
  return cfg;
}

/** Stage (1080x1920 design units, letterboxed) and the 3D band inside the TikTok safe zones. */
function computeLayout(layout, W, H) {
  const u = Math.min(W / DESIGN_W, H / DESIGN_H);
  const sw = DESIGN_W * u; const sh = DESIGN_H * u;
  const ox = (W - sw) / 2; const oy = (H - sh) / 2;
  layout.W = W; layout.H = H; layout.u = u;
  layout.stage = { x: ox, y: oy, w: sw, h: sh };
  layout.safe = { ...SAFE, designW: DESIGN_W, designH: DESIGN_H };
  layout.safeBand = { x: ox + SAFE.side * u, y: oy + SAFE.top * u, w: sw - 2 * SAFE.side * u, h: (SAFE.bottom - SAFE.top) * u };
  // The overlay may reserve design units at the top/bottom of the safe band for its panels:
  // layout.reserve = { top, bottom }; the 3D action is framed in what is left.
  const r = layout.reserve || (layout.reserve = { top: 0, bottom: 0 });
  const rt = Math.max(0, Number(r.top) || 0); const rb = Math.max(0, Number(r.bottom) || 0);
  const h = Math.max(200, SAFE.bottom - SAFE.top - rt - rb);
  layout.band = { x: layout.safeBand.x, y: layout.safeBand.y + rt * u, w: layout.safeBand.w, h: h * u };
  return layout;
}

async function main() {
  const boot = document.getElementById('boot');
  const setBoot = (t) => { if (boot) boot.textContent = t; };
  const mode = pageMode(); // { stream, local, demo, demoPreset, wsUrl }
  if (mode.stream) document.documentElement.classList.add('stream');
  const config = await loadConfig();
  const game = createGame(config); // fills defaults into `config` in place
  window.__halatGame = game;

  // Streamer settings: this game's keys + the stream-wide zones and volumes.
  const settings = new GameSettings(flatFromConfig(config));
  const applySettings = () => game.applySettings(settings.all());
  applySettings();

  const demoPreset = DEMO_PRESETS[mode.demoPreset] ? mode.demoPreset : 'medium';
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
  if (mobile || urlOpts.quality === 'low') {
    config.visual.maxParticles = Math.min(config.visual.maxParticles, 700);
    config.visual.crowdPerSide = Math.min(config.visual.crowdPerSide, 90);
    config.visual.antialias = false;
    config.visual.shadows = false;
  }
  if (urlOpts.quality === 'high') config.visual.shadows = true;

  const assets = await Assets.load((p) => setBoot(`Yükleniyor… %${Math.round(p * 100)}`));
  setBoot('Arena hazırlanıyor…');

  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !!config.visual.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.visual.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const audio = new AudioManager(assets.manifest, config.audio, { mute: urlOpts.mute || !!config.audio.mute, noMusic: urlOpts.noMusic });
  const gen = await loadGenerators();
  const view = new HalatScene({ renderer, assets, config, game, audio, gen });

  // Layout shared with the overlay (updated in place on resize).
  const layout = computeLayout({}, 1, 1);
  layout.anchors = () => view.anchors();
  layout.project = (x, y, z) => {
    const p = new THREE.Vector3(x, y, z).project(view.rig.camera);
    return { x: (p.x * 0.5 + 0.5) * layout.W, y: (-p.y * 0.5 + 0.5) * layout.H };
  };

  // Overlay (owned by another module); the game also runs without it.
  let hud = null;
  if (new URLSearchParams(location.search).get('nohud') !== '1') try {
    const mod = await import('./hud/index.js');
    hud = mod.mountHud(document.getElementById('hud'), game, { config, manifest: assets.manifest, layout }) || null;
  } catch (e) {
    console.warn('[halat] overlay yok, yalnız 3D sahne çalışıyor:', e?.message || e);
  }

  // Streamer settings that touch the scene / audio / safe zones.
  const applyStreamSide = () => {
    audio.applyVolumes(urlOpts.mute || !!config.audio.mute);
    const z = zonesFrom(settings.zones());
    SAFE.bottom = z.chatTop; SAFE.side = z.side;
    resize();
  };
  game.on('settings', () => applyStreamSide());

  // ---- event source: the bridge or the in-browser demo ----
  let net = { connected: false };
  let demo = null;
  if (mode.demo) {
    game.setMode('demo');
    game.setConnected(true);
    demo = new DemoSim((evt) => game.handleEvent(evt), demoPreset, () => game.state);
    demo.start();
  } else {
    net = new BridgeClient({
      url: mode.wsUrl,
      kind: 'game',
      game: GAME_ID,
      onMessage(msg) {
        if (msg.type === 'settings') {
          if (msg.game && msg.game !== GAME_ID) return;
          if (settings.apply(msg)) applySettings();
          return;
        }
        if (msg.type === 'command' && msg.game && msg.game !== GAME_ID) return;
        game.handleEvent(msg);
      },
      onConnection(ok) { game.setConnected(ok); },
    });
    console.info(`[halat] köprü: ${mode.wsUrl}${mode.stream ? ' (yayın modu)' : ''}`);
  }

  // ---- resize ----
  // The overlay owns the action band when it is mounted: it announces it with the
  // `halat:layout` event (and hud.getActionBand()); without an overlay our own band is used.
  let hudBand = null;
  let inResize = false;
  const insetBand = (b) => {
    const mx = b.w * 0.015; const my = b.h * 0.03;
    return { x: b.x + mx, y: b.y + my, w: Math.max(1, b.w - 2 * mx), h: Math.max(1, b.h - 2 * my) };
  };
  const fitView = () => {
    if (hudBand && hudBand.w > 10 && hudBand.h > 10) layout.band = insetBand(hudBand);
    view.resize(layout.W, layout.H, layout.band);
  };
  window.addEventListener('halat:layout', (e) => {
    const b = e.detail && e.detail.band;
    if (!b || !Number.isFinite(b.w) || !Number.isFinite(b.h)) return;
    hudBand = { x: b.x, y: b.y, w: b.w, h: b.h };
    if (!inResize) fitView();
  });
  let zonesEl = null;
  function resize() {
    inResize = true;
    try {
      const W = Math.max(1, Math.round(window.innerWidth));
      const H = Math.max(1, Math.round(window.innerHeight));
      renderer.setSize(W, H, false);
      computeLayout(layout, W, H);
      hud?.resize?.(layout);
      const hb = hud?.getActionBand?.();
      if (hb && Number.isFinite(hb.w)) hudBand = { x: hb.x, y: hb.y, w: hb.w, h: hb.h };
      fitView();
      if (zonesEl) drawZonesBoxes();
    } finally { inResize = false; }
  }
  // ?zones=1 without the overlay (the overlay draws its own).
  const drawZonesBoxes = () => {
    const s = layout.stage; const u = layout.u;
    zonesEl.innerHTML = '';
    const box = (x, y, w, h, c) => {
      const d = document.createElement('div');
      Object.assign(d.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, background: c, pointerEvents: 'none' });
      zonesEl.append(d);
    };
    box(s.x, s.y, s.w, SAFE.top * u, 'rgba(255,0,0,0.18)');
    box(s.x, s.y + SAFE.bottom * u, s.w, s.h - SAFE.bottom * u, 'rgba(255,0,0,0.18)');
    box(s.x, s.y, SAFE.side * u, s.h, 'rgba(255,200,0,0.15)');
    box(s.x + s.w - SAFE.side * u, s.y, SAFE.side * u, s.h, 'rgba(255,200,0,0.15)');
  };
  if (urlOpts.zones && !hud) {
    zonesEl = document.createElement('div');
    Object.assign(zonesEl.style, { position: 'fixed', inset: '0', zIndex: '50', pointerEvents: 'none' });
    document.body.append(zonesEl);
  }
  window.addEventListener('resize', resize);
  applyStreamSide();

  // ---- audio unlock ----
  const unlock = () => { audio.resume(); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  audio.load().then(() => { audio.resume(); audio.playMusic('music_main'); audio.setLoop('crowd_loop', 0.18); });
  // Outside stream mode a blocked AudioContext gets a small "Sesi aç" button.
  if (!mode.stream && !urlOpts.mute) {
    setTimeout(() => {
      if (!audio.blocked) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '🔊 Sesi aç';
      Object.assign(b.style, { position: 'fixed', right: '12px', bottom: '12px', zIndex: '70', font: '700 16px system-ui, sans-serif', padding: '8px 14px', borderRadius: '18px', border: '0', background: 'rgba(20,14,8,0.8)', color: '#fff', cursor: 'pointer' });
      b.onclick = () => { audio.resume().then(() => { audio.playMusic('music_main'); audio.setLoop('crowd_loop', 0.18); }); b.remove(); };
      document.body.append(b);
      audio.onStateChange = (s) => { if (s === 'running') b.remove(); };
    }, 1500);
  }

  // ---- debug panel and keys ----
  let debug = urlOpts.debug;
  const dbg = document.createElement('pre');
  Object.assign(dbg.style, { position: 'fixed', left: '8px', bottom: '8px', margin: '0', padding: '6px 8px', font: '12px/1.35 monospace', color: '#fff', background: 'rgba(0,0,0,0.6)', zIndex: '60', pointerEvents: 'none', display: debug ? 'block' : 'none', whiteSpace: 'pre' });
  document.body.append(dbg);
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (!debug && k !== 'd') return; // stream pages never react to stray keys
    if (k === 'r') game.command('restartRound');
    else if (k === 'e') game.command('endRound');
    else if (k === 'x') game.command('resetSession');
    else if (k === 'c') game.command('clearTeams');
    else if (k === 'm') audio.toggleMusic();
    else if (k === 'n') audio.toggleMute();
    else if (k === 'd' && urlOpts.debug) { debug = !debug; dbg.style.display = debug ? 'block' : 'none'; }
    else if (debug && /^[1-8]$/.test(k)) testGift(e.shiftKey ? 2 : 1, [1, 5, 10, 30, 100, 199, 1000, 5000][Number(k) - 1]);
  });

  // ---- test hooks (console / automated checks) ----
  let testN = 0;
  const testUser = (name) => ({ id: `test-${name}`, name, nick: name, avatar: '' });
  const testGift = (team, coins, count = 1, name = `test_${team}_${coins}`) => {
    game.handleEvent({ type: 'chat', user: testUser(name), text: String(team) });
    game.handleEvent({ type: 'gift', user: testUser(name), giftId: 1, giftName: `Hediye ${coins}`, coins, count, total: coins * count });
  };
  let fps = 0; let frames = 0; let fpsT = 0; let worstMs = 0; let worstShown = 0; let dbgT = 0;
  window.__halat = {
    game, view, audio, assets, layout, settings, renderer, mode,
    inject: (evt) => game.handleEvent(evt),
    gift: testGift,
    join: (n, team, prefix = 'u') => { for (let i = 0; i < n; i++) game.handleEvent({ type: 'chat', user: testUser(`${prefix}${team}_${++testN}`), text: String(team) }); },
    stats: () => ({ fps, worst: worstShown, ...view.stats, draw: renderer.info.render.calls, tris: renderer.info.render.triangles, geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, progs: renderer.info.programs?.length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }),
    audioLog: audio.log,
    demo: () => demo,
    net: () => net,
  };

  boot?.remove();

  // Keep the round clock running while the page is hidden (no animation frames then).
  setInterval(() => { if (document.hidden) game.update(performance.now()); }, 250);

  // ---- frame loop ----
  let reserveKey = `${layout.reserve?.top || 0}|${layout.reserve?.bottom || 0}`;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(0.1, Math.max(0, raw));
    frames++; fpsT += raw; worstMs = Math.max(worstMs, raw * 1000);
    if (fpsT >= 1) { fps = frames / fpsT; frames = 0; fpsT = 0; worstShown = worstMs; worstMs = 0; }
    game.update(now);
    // The overlay changed its reserved rows: re-frame the camera.
    const rk = `${layout.reserve?.top || 0}|${layout.reserve?.bottom || 0}`;
    if (rk !== reserveKey) { reserveKey = rk; resize(); }
    view.update(dt);
    renderer.render(view.scene, view.rig.camera);
    hud?.update?.(now);
    if (debug) {
      dbgT -= dt;
      if (dbgT <= 0) {
        dbgT = 0.5;
        const s = game.state; const i = renderer.info;
        dbg.textContent = [
          `FPS ${fps.toFixed(0)}  en kötü ${worstShown.toFixed(0)} ms  çizim ${i.render.calls}  üçgen ${(i.render.triangles / 1000).toFixed(0)}k`,
          `faz ${s.phase} tur ${s.round} süre ${s.timeLeft.toFixed(0)}  halat ${s.rope.toFixed(2)} hız ${s.ropeVel.toFixed(3)}`,
          `K: üye ${s.teams[0].members} güç ${s.teams[0].force.toFixed(1)} (hediye ${s.teams[0].giftForce.toFixed(0)})  M: üye ${s.teams[1].members} güç ${s.teams[1].force.toFixed(1)} (hediye ${s.teams[1].giftForce.toFixed(0)})`,
          `figür ${view.stats.figures}  parçacık ${view.stats.particles}  kalabalık ${view.stats.crowd}  etki ${game.effects.length}  bekleyen ${game.held.size}`,
          `mod ${s.mode} ${net.connected || s.connected ? 'bağlı' : 'kopuk'}  geo ${i.memory.geometries} tex ${i.memory.textures}`,
          'R yeni tur  E bitir  X skor sıfırla  C takımları sil  M müzik  N ses  D debug  1-8 hediye (Shift: Mavi)',
        ].join('\n');
      }
    }
  }
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.textContent = 'Yükleme hatası: ' + (e && e.message ? e.message : e);
});
