// Şeytan Avı page: bridge connection, settings, audio, HUD and the render loop.
//   ?yayin=1   stream mode (bridge on this PC, never fake viewers)
//   ?demo=1    in-page simulator (low | medium | high | chaos for the pace)
//   ?zones=1   draw the TikTok safe zones, ?mute=1 silence, ?fps=1 frame-rate readout
// Two layers: #world is the three.js view, #overlay a 2D canvas (design pixels) on top of it for
// names, popups, the vignette and grain; the HTML HUD sits above both.
import { pageMode, BridgeClient } from '../../../shared/bridge.js';
import { GameSettings } from '../../../shared/settings-client.js';
import { zonesFrom, layoutStage, drawZones } from '../../../shared/zones.js';
import { cleanNick, avatarEl } from '../../../shared/sanitize.js';
import { SimpleAudio } from '../../../shared/audio.js';
import { defaults } from './settings-def.js';
import { Game, TIERS, fmt, W, H } from './game.js';
import { World } from './world3d.js';
import { Vfx3D } from './vfx3d.js';
import { Overlay } from './overlay.js';
import { startDemo } from './demo.js';
import { setCamera } from './proj.js';

// ?kamera=pitch,fov,dist (degrees, degrees, world units): camera tuning
{
  const raw = new URLSearchParams(location.search).get('kamera');
  if (raw) {
    const [pitch, fov, dist] = raw.split(',').map((s) => (s.trim() === '' ? NaN : Number(s)));
    setCamera({ pitch, fov, dist });
  }
}

const GAME_ID = 'seytan';
const qs = new URLSearchParams(location.search);
const mode = pageMode();
if (mode.stream) document.documentElement.classList.add('stream');
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const cv = $('world');
const ov = $('overlay');
const g = ov.getContext('2d');
// ?tema=osmanli: the earlier Ottoman courtyard; default the sakura shrine (reference/style.json)
const world = new World(cv, { theme: qs.get('tema') });
document.documentElement.classList.add(`tema-${world.theme}`);
const vfx = new Vfx3D(world.scene);
const overlay = new Overlay();

const settings = new GameSettings(defaults);
const audio = new SimpleAudio({ mute: qs.get('mute') === '1' });
audio.unlockOn(window);

// ------------------------------------------------------------------------------------- audio
const SFX = ['sfx_hit', 'sfx_hit_b', 'sfx_wood_hit', 'sfx_explosion', 'sfx_explosion_big', 'sfx_swing', 'sfx_swing_b', 'sfx_round_start', 'sfx_victory',
  'sfx_gift_small', 'sfx_gift_medium', 'sfx_gift_big', 'sfx_horn', 'sfx_hit_metal', 'countdown_beep', 'countdown_go', 'crowd_cheer_a', 'drum_roll', 'lose_aww', 'giant_step', 'music_battle'];
audio.load(Object.fromEntries(SFX.map((n) => [n, `assets/audio/${n}.ogg`]))).then(() => { musicOn(); });
let musicStarted = false;
function musicOn() { if (!musicStarted && audio.buffers.has('music_battle')) { musicStarted = true; audio.playMusic('music_battle'); } }
const lastPlay = new Map();
function sfx(name, vol = 1, { rate = 1, gap = 0 } = {}) {
  const now = performance.now();
  if (gap && now - (lastPlay.get(name) || 0) < gap) return;
  lastPlay.set(name, now);
  audio.play(name, { vol, rate });
}
/** Deep "HA HA HA" made with Web Audio (no recorded voice needed). */
function laugh() {
  const ctx = audio.ctx;
  if (!ctx || audio.blocked) return;
  const t0 = ctx.currentTime + 0.05;
  for (let i = 0; i < 7; i++) {
    const t = t0 + i * 0.19;
    const f = 150 - i * 6 + (i % 2) * 18;
    for (const [mul, vol] of [[1, 0.5], [0.5, 0.35]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * mul * 1.25, t);
      o.frequency.exponentialRampToValueAtTime(f * mul * 0.85, t + 0.16);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 2.5;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      const ga = ctx.createGain();
      ga.gain.setValueAtTime(0.0001, t);
      ga.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      ga.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      o.connect(bp).connect(lp).connect(ga).connect(audio.sfxBus);
      o.start(t); o.stop(t + 0.2);
    }
  }
}

// ------------------------------------------------------------------------------------- game
let drumPlayed = false;
const game = new Game({ settings, emit: onGameEvent, view: { world, vfx, overlay } });

function onGameEvent(type, data) {
  switch (type) {
    case 'throw':
      if (data === 'like') sfx('sfx_swing_b', 0.18, { rate: 1.3 + Math.random() * 0.4, gap: 90 });
      else if (data === 'stone') sfx('sfx_swing', 0.5, { rate: 0.9 + Math.random() * 0.2, gap: 60 });
      break;
    case 'hit':
      if (!data.live) { sfx('sfx_hit_b', 0.2, { gap: 120 }); break; }
      if (data.cover) { sfx('sfx_wood_hit', data.kind === 'like' ? 0.25 : 0.6, { gap: 70, rate: 0.9 + Math.random() * 0.3 }); break; }
      if (data.kind === 'like') sfx('sfx_hit_b', 0.3, { gap: 80, rate: 1.2 + Math.random() * 0.4 });
      else if (data.kind === 'rain') sfx('sfx_hit', 0.4, { gap: 70, rate: 0.9 + Math.random() * 0.4 });
      else if (data.kind === 'stone') sfx('sfx_hit', 0.8, { rate: 0.85 + Math.random() * 0.2 });
      else if (data.kind === 'boulder') sfx('sfx_explosion', 0.9);
      else if (data.kind === 'meteor') sfx('sfx_explosion_big', 1);
      else if (data.kind === 'arrow') sfx('sfx_hit_b', 0.35, { gap: 50, rate: 0.8 + Math.random() * 0.3 });
      hpHit();
      break;
    case 'rain': sfx('sfx_gift_medium', 0.8); break;
    case 'catapult': sfx('sfx_horn', 0.7); break;
    case 'catapultFire': sfx('sfx_wood_hit', 0.9, { rate: 0.7 }); break;
    case 'meteor': sfx('sfx_gift_big', 0.9); sfx('giant_step', 0.8); break;
    case 'arrows': sfx('sfx_gift_medium', 0.7, { rate: 1.15 }); for (let i = 0; i < 4; i++) setTimeout(() => sfx('sfx_swing_b', 0.45, { rate: 1.5 + Math.random() * 0.3 }), 250 + i * 70); break;
    case 'chains': sfx('sfx_gift_big', 0.7, { rate: 1.2 }); break;
    case 'chainsBound': sfx('sfx_hit_metal', 1, { rate: 0.8 }); setTimeout(() => sfx('sfx_hit_metal', 0.8, { rate: 0.65 }), 120); sfx('giant_step', 0.5); break;
    case 'chainsFree': sfx('sfx_hit_metal', 0.6, { rate: 1.3 }); break;
    case 'dragonCall': sfx('sfx_gift_big', 1, { rate: 0.85 }); break;
    case 'dragon': sfx('sfx_horn', 0.9, { rate: 0.55 }); sfx('giant_step', 0.9, { rate: 0.7 }); break;
    case 'dragonBreath': sfx('sfx_explosion_big', 0.9, { rate: 0.7 }); for (let i = 1; i < 6; i++) setTimeout(() => sfx('sfx_explosion', 0.55, { rate: 0.6 + Math.random() * 0.2 }), i * 420); break;
    case 'teleport': sfx('sfx_gift_small', 0.35, { rate: 0.6 }); break;
    case 'tier': flashTier(data); break;
    case 'count': sfx('countdown_beep', 0.8); showCenter(String(data)); break;
    case 'start': sfx('countdown_go', 0.8); sfx('sfx_round_start', 0.6); showCenter('BAŞLA!', true, 900); drumPlayed = false; hideResult(); break;
    case 'round': hideResult(); break;
    case 'win': sfx('sfx_victory', 0.9); sfx('crowd_cheer_a', 0.7); game.celebrate(90); break;
    case 'lose': laugh(); setTimeout(laugh, 1500); sfx('lose_aww', 0.6); break;
    case 'result': showResult(data); break;
    case 'resultEnd': hideResult(); break;
    default: break;
  }
}

// ------------------------------------------------------------------------------------- HUD
let bridgeOk = false;
const hud = { hp: -1, time: '', status: '', board: '', round: '', session: '' };
const hpfill = $('hpfill'); const hplag = $('hplag'); const hpbar = $('hpbar');

function hpHit() {
  hpbar.classList.remove('hit');
  void hpbar.offsetWidth;
  hpbar.classList.add('hit');
}

function av(user, units) {
  const el = avatarEl(user, 40);
  el.classList.add('av');
  el.style.width = el.style.height = `calc(var(--u) * ${units})`;
  el.style.fontSize = `calc(var(--u) * ${Math.round(units * 0.45)})`;
  return el;
}

function updateHud() {
  const h = game.hud();
  const frac = Math.max(0, h.hp / h.hpMax);
  if (frac !== hud.hp) {
    hud.hp = frac;
    hpfill.style.transform = `scaleX(${frac})`;
    hplag.style.transform = `scaleX(${frac})`;
    hpbar.classList.toggle('low', frac < 0.25);
    $('hptxt').textContent = `${fmt(h.hp)} / ${fmt(h.hpMax)}`;
  }
  const secs = Math.max(0, Math.ceil(h.timeLeft));
  const tt = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  if (tt !== hud.time) {
    hud.time = tt;
    $('timerTxt').textContent = tt;
    $('timer').classList.toggle('warn', h.phase === 'play' && secs <= 15);
    if (h.phase === 'play' && secs === 10 && !drumPlayed) { drumPlayed = true; sfx('drum_roll', 0.5); }
  }
  const rt = `TUR ${h.round}`;
  if (rt !== hud.round) { hud.round = rt; $('roundNo').textContent = rt; }
  const st = h.wins || h.losses ? `🏆 ${h.wins} · 😈 ${h.losses}` : '';
  if (st !== hud.session) { hud.session = st; $('session').textContent = st; }
  const status = !mode.demo && !bridgeOk ? 'Köprü bekleniyor…' : h.status;
  if (status !== hud.status) { hud.status = status; $('status').textContent = status; }

  const showBoard = settings.get('view.board') && h.phase === 'play';
  const sig = showBoard ? h.top.map((b) => `${b.key}:${Math.round(b.dmg)}`).join('|') : '-';
  if (sig !== hud.board) {
    hud.board = sig;
    const list = $('boardList');
    list.replaceChildren();
    for (const [i, b] of h.top.entries()) {
      const li = document.createElement('li');
      const rk = document.createElement('span'); rk.className = 'rk'; rk.textContent = `${i + 1}.`;
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = cleanNick(b.user.nick || b.user.name, 14);
      const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = fmt(b.dmg);
      li.append(rk, av(b.user, 38), nm, sc);
      list.append(li);
    }
    $('board').classList.toggle('empty', !showBoard || !h.top.length);
  }
}

let centerTimer = 0;
function showCenter(text, small = false, ms = 950) {
  const c = $('center');
  c.replaceChildren();
  const s = document.createElement('span');
  s.className = `pop${small ? ' small' : ''}`;
  s.textContent = text;
  c.append(s);
  clearTimeout(centerTimer);
  centerTimer = setTimeout(() => c.replaceChildren(), ms);
}

function showResult(r) {
  const box = $('result');
  box.replaceChildren();
  box.className = r.win ? 'win' : 'lose';
  $('hud').classList.add('res');
  const h1 = document.createElement('h1');
  h1.textContent = r.win ? 'ŞEYTAN KAÇTI!' : 'ŞEYTAN GÜLDÜ!';
  const sub = document.createElement('div'); sub.className = 'sub';
  if (r.win) { const s = Math.round(r.elapsed); sub.textContent = `Tur kazanıldı · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  else sub.textContent = `Süre bitti · kalan can ${fmt(r.hpLeft)}`;
  box.append(h1, sub);
  if (r.top.length) {
    const cr = document.createElement('div'); cr.className = 'crown'; cr.textContent = '👑 TURUN EN ÇOK TAŞ ATANI';
    const best = r.top[0];
    const hero = document.createElement('div'); hero.className = 'hero';
    const info = document.createElement('div');
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = cleanNick(best.user.nick || best.user.name, 18);
    const sc = document.createElement('div'); sc.className = 'sc'; sc.textContent = `${fmt(best.dmg)} hasar · ${fmt(best.stones)} taş`;
    info.append(nm, sc);
    hero.append(av(best.user, 110), info);
    box.append(cr, hero);
    if (r.top.length > 1) {
      const ol = document.createElement('ol');
      for (const [i, b] of r.top.slice(1).entries()) {
        const li = document.createElement('li');
        const t = document.createElement('span'); t.textContent = `${i + 2}. ${cleanNick(b.user.nick || b.user.name, 16)} · ${fmt(b.dmg)}`;
        li.append(av(b.user, 44), t);
        ol.append(li);
      }
      box.append(ol);
    }
  }
  const nx = document.createElement('div'); nx.className = 'sub next'; nx.textContent = 'Yeni tur birazdan';
  box.append(nx);
}
function hideResult() { $('result').className = 'hidden'; $('hud').classList.remove('res'); }

// gift guide
function renderLadder() {
  const el = $('ladder');
  el.replaceChildren();
  el.classList.toggle('hidden', !settings.get('view.ladder'));
  const rows = TIERS.map((t) => [t.id, t.id === 'like' ? (settings.get('like.enabled') ? 'Beğeni' : '—') : `${t.key ? fmt(settings.get(t.key)) : 1}+ jeton`]);
  for (const [id, co] of rows) {
    const t = TIERS.find((x) => x.id === id);
    const d = document.createElement('div'); d.className = 'step'; d.dataset.tier = id;
    const ic = document.createElement('div'); ic.className = `ic${t.small ? ' sm' : ''}`; ic.textContent = t.icon;
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = t.name;
    const c = document.createElement('div'); c.className = 'co'; c.textContent = co;
    d.append(ic, nm, c);
    el.append(d);
  }
}
function flashTier(id) {
  const s = $('ladder').querySelector(`[data-tier="${id}"]`);
  if (!s) return;
  s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash');
}

// ------------------------------------------------------------------------------------- layout + loop
// Never render more pixels than the 1080x1920 stream frame: a high-DPI or oversized window would
// multiply the cost of the 3D view (shadows, bloom) for nothing visible on TikTok.
const MAX_PX = 1080 * 1920;
function layout() {
  const z = zonesFrom(settings.zones());
  const f = layoutStage(stage, z);
  let r = Math.min(1.5, window.devicePixelRatio || 1);
  r = Math.min(r, Math.sqrt(MAX_PX / Math.max(1, f.w * f.h)));
  let w = Math.max(2, Math.round(f.w * r));
  let h = Math.max(2, Math.round(f.h * r));
  // ?res=1080: always draw the full 1080x1920 frame (performance test in a small window)
  if (qs.get('res') === '1080') { w = 1080; h = 1920; }
  world.resize(w, h);
  vfx.setViewport(h);
  ov.width = w; ov.height = h;
  if (qs.get('zones') === '1') drawZones(stage, z);
}
settings.onChange(() => { layout(); renderLadder(); audio.setVolumes(settings.audio()); hud.board = '?'; });
addEventListener('resize', layout);
layout();
renderLadder();
audio.setVolumes(settings.audio());

function paint() {
  game.render();
  const k = ov.width / W;
  g.setTransform(k, 0, 0, k, 0, 0);
  game.drawOverlay(g);
}

// ?fps=1: frame-rate readout (worst frame in the last second), for the performance check.
const fpsEl = qs.get('fps') === '1' ? Object.assign(document.createElement('div'), { id: 'fpsMeter' }) : null;
if (fpsEl) { Object.assign(fpsEl.style, { position: 'absolute', left: '8px', bottom: '8px', zIndex: 50, font: '600 13px monospace', color: '#9f9', background: 'rgba(0,0,0,.6)', padding: '3px 6px' }); document.body.append(fpsEl); }
let fpsN = 0; let fpsT = 0; let worst = 0;

let last = performance.now();
let hudAcc = 0;
function frame(now) {
  const raw = (now - last) / 1000;
  const dt = Math.min(0.1, raw);
  last = now;
  game.update(dt);
  paint();
  hudAcc += dt;
  if (hudAcc > 0.08) { hudAcc = 0; updateHud(); }
  if (fpsEl) {
    fpsN++; fpsT += raw; worst = Math.max(worst, raw);
    if (fpsT >= 1) { fpsEl.textContent = `FPS ${Math.round(fpsN / fpsT)} · en kötü ${Math.round(worst * 1000)} ms · ${cv.width}x${cv.height}`; fpsN = 0; fpsT = 0; worst = 0; }
  }
  requestAnimationFrame(frame);
}
// dev only: ?demo=1&shot=open|hurt|hide|laugh|win|meteor|arrows|chains|dragon (&at=frames at 60 fps)
const SHOT = mode.demo ? qs.get('shot') : null;
document.fonts?.load('44px Paytone').finally(() => (SHOT ? runShot(SHOT) : requestAnimationFrame(frame)));

/** Renders one deterministic frame of a scene for headless screenshots, then sets the title to READY. */
function runShot(name) {
  const step = (n) => { for (let i = 0; i < n; i++) game.update(1 / 60); };
  const d = game.devil;
  const user = (nick) => ({ id: nick, name: nick, nick, avatar: '' });
  const place = (spot, p) => { d.spot = spot; d.x = p.x; d.y = p.y; d.z = p.z; d.mode = 'idle'; d.dwell = 999; d.alpha = 1; };
  step(240);
  if (name === 'hide') { const p = game.props[0]; place({ prop: p, hide: p.hides[0] }, p.hides[0]); }
  else { const o = { open: true, x: 0, y: 2.3, z: 1.1 }; place(o, o); }
  // a crowd of players in the middle
  for (const nick of ['Ayşe 🌸', 'Burak', 'Can', 'Deniz 🌊', 'Ece', 'Fatih', 'Gizem', 'Hakan', 'İrem', 'Kaan', 'Leyla', 'Mert']) game.like(user(nick), 2);
  step(40);
  if (name === 'hurt') { game.hp = game.hpMax * 0.2; game.gift(user('Mehmet K.'), 10, 1, 'Rose'); step(50); d.faceT = 1; d.flash = 0.5; }
  if (name === 'meteor') { game.gift(user('Zeynep ✨'), 1000, 1, 'Galaxy'); step(110); }
  if (['arrows', 'chains', 'dragon'].includes(name)) game.hp = game.hpMax = 400000; // keep him alive to see the whole effect
  if (name === 'arrows') { game.gift(user('Arda 🔥'), 100, 1, 'Hand Hearts'); step(Number(qs.get('at')) || 75); }
  if (name === 'chains') { game.gift(user('Selin'), 699, 1, 'Swan'); step(Number(qs.get('at')) || 110); }
  if (name === 'dragon') { game.gift(user('Kaan'), 1500, 1, 'Dragon'); step(Number(qs.get('at')) || 200); }
  if (name === 'laugh') { game.timeLeft = 0.02; step(110); }
  if (name === 'win') { game.board.set('a', { key: 'a', user: user('Elif ✨'), dmg: 4200, stones: 37 }); game.hp = 0; game.win(); step(100); }
  step(name === 'hurt' ? 1 : 30);
  if (name === 'hurt') d.faceT = 1;
  paint();
  addEventListener('resize', () => setTimeout(paint, 0)); // a resize clears the canvas: repaint the frozen frame
  updateHud();
  document.title = 'READY';
}

// sound button (outside stream mode only)
const soundBtn = $('sound');
if (!mode.stream && qs.get('mute') !== '1') {
  const sync = () => soundBtn.classList.toggle('hidden', !audio.blocked);
  audio.onStateChange = () => { sync(); if (!audio.blocked) musicOn(); };
  soundBtn.addEventListener('click', async () => { await audio.resume(); sync(); musicOn(); });
  setTimeout(sync, 800);
}

// ------------------------------------------------------------------------------------- events
function onMessage(msg) {
  if (settings.apply(msg)) return;
  switch (msg.type) {
    case 'like': if (msg.user) game.like(msg.user, Number(msg.count) || 1); break;
    case 'gift': if (msg.user) game.gift(msg.user, Number(msg.coins) || 1, Number(msg.count) || 1, msg.giftName); break;
    case 'command': if (msg.game === GAME_ID) game.command(msg.name); break;
    case 'status':
      if (lastMode && msg.mode && msg.mode !== lastMode) game.wipe();
      if (msg.mode) lastMode = msg.mode;
      break;
    default: break;
  }
}
let lastMode = '';

if (mode.demo) {
  if (!SHOT) startDemo({ onMessage, preset: mode.demoPreset });
} else {
  new BridgeClient({
    url: mode.wsUrl,
    kind: 'game',
    game: GAME_ID,
    onMessage,
    onConnection(ok) { bridgeOk = ok; },
  });
}

window.__seytan = { game, settings, mode };
