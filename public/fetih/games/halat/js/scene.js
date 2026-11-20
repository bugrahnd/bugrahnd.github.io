// 3D scene of Halat Çekme: builds the arena, rope, figures, crowd, tractors, effects and the
// camera rig, listens to the game core's events and animates everything per frame.
// World layout: rope along x, pit centred on x = 0, team 1 on the left (x < 0), team 2 on
// the right; the camera looks from +z (front) slightly down.
// Visuals come from the code generators in assets/gen/ (models.js); every piece falls back to
// the procedural version (arena.js, rope.js, crowd.js, figures.js) when its generator throws.
import * as THREE from 'three';
import { Arena } from './arena.js';
import { Rope } from './rope.js';
import { Effects } from './effects.js';
import { ProcFigures, makeFigure, dressFigure } from './figures.js';
import { createFigureSource, createTractorVisual } from './models.js';
import { Crowd, GenCrowd, TagPool } from './crowd.js';
import { CameraRig } from './camera.js';
import { clamp, damp, rand, hexNum, lerp, pick } from './util.js';

const side = (team) => (team === 1 ? -1 : 1);
const G = 14; // gravity for falls
const GIANT_SCALE = 2.2; // the giant's fists meet the rope at this scale (assets/gen gripFor('giant'))
const GIANT_SHIFT = 1.6; // a team's line steps back this far while its giant holds the front
const TRACTOR_LINE = 5; // pullers kept in line while a tractor pulls (the tractor stays in frame)
const PIT_FALLERS = 7; // most losers that end up in the pit (the rest sit down where they are)
const TIME_FALLERS = 2; // time-out ending: only the front few stumble into the pit

function lighten(hex, k) {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color(0xffffff), k);
  return c.getHex();
}

export class HalatScene {
  constructor({ renderer, assets, config, game, audio, gen = null }) {
    this.renderer = renderer;
    this.assets = assets;
    this.cfg = config;
    this.game = game;
    this.audio = audio;
    this.gen = gen;
    const scene = new THREE.Scene();
    this.scene = scene;
    const t0 = game.state.teams;
    const startColors = [hexNum(t0[0].color, 0xe63946), hexNum(t0[1].color, 0x2f7cf6)];

    // ---- arena, sky and lights (generator first) ----
    let arena = null;
    if (gen && typeof gen.createArena === 'function') {
      try { arena = gen.createArena({ teamColors: startColors, visual: config.visual, title: config.title, frontGap: 5 }); } catch (e) { console.warn('[halat] createArena hata verdi; yedek arena', e); arena = null; }
    }
    this.shadows = false;
    if (arena) {
      scene.add(arena.object3D);
      scene.background = arena.background || skyTexture();
      scene.fog = new THREE.Fog(arena.palette?.haze ?? 0xdde6e2, 30, 70);
      const L = arena.lights;
      if (L && L.hemi && L.sun) {
        scene.add(L.hemi, L.sun, L.sun.target);
        this.shadows = config.visual.shadows !== false;
        L.sun.castShadow = this.shadows;
      } else this._defaultLights();
      this.arena = arena;
    } else {
      scene.background = skyTexture();
      scene.fog = new THREE.Fog(0xbfe3f5, 30, 70);
      this._defaultLights();
      this.arena = new Arena(scene, assets, config);
    }
    renderer.shadowMap.enabled = this.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    // ---- rope ----
    this.ropeHandY = 0.98;
    let rope = null;
    if (gen && typeof gen.createRope === 'function') {
      try {
        rope = gen.createRope({ handY: gen.ROPE_Y ?? 0.62 });
        scene.add(rope.object3D);
        // A bigger centre marker (knot + flag) that reads on a phone.
        if (rope.marker) rope.marker.scale.setScalar(1.45);
        rope.object3D.traverse((o) => { if (o.isMesh) o.castShadow = this.shadows; });
        this.ropeHandY = gen.ROPE_Y ?? 0.62;
      } catch (e) { console.warn('[halat] createRope hata verdi; yedek halat', e); rope = null; }
    }
    this.rope = rope || new Rope(scene, assets);

    this.effects = new Effects(scene, assets.atlas, config.visual.maxParticles);
    this.proc = new ProcFigures(scene, 2 * 12 + 48);
    this.gltf = createFigureSource(scene, assets, gen, { shadows: this.shadows });
    let crowd = null;
    if (gen && typeof gen.createCrowd === 'function') {
      try { crowd = new GenCrowd(scene, config, gen); } catch (e) { console.warn('[halat] createCrowd hata verdi; yedek kalabalık', e); crowd = null; }
    }
    this.crowd = crowd || new Crowd(scene, config);
    this.tags = new TagPool(scene, 10);
    this.rig = new CameraRig(config);
    this.tractors = [createTractorVisual(assets, 1, gen, { shadows: this.shadows }), createTractorVisual(assets, 2, gen, { shadows: this.shadows })];
    for (const t of this.tractors) { t.group.visible = false; scene.add(t.group); }

    this.pool = [];
    this.figs = []; // active figures
    this.lines = new Map([[1, new Map()], [2, new Map()]]); // team -> key -> fig
    this.giants = new Map(); // effect id -> fig
    this.tractorFx = [null, null]; // effect per team
    this.lineDirty = true;
    this.lineTimer = 0;
    this.tagTimer = 0;
    this.t = 0;
    this.timeScale = 1;
    this.slowUntil = 0;
    this.heave = 0;
    this.ropeDisp = 0;
    this.ropeDispVel = 0;
    this.offset = 0;
    this.ending = null; // { winner, by, t, falls }
    this.colors = startColors;
    this.recentJoin = new Map(); // player id -> until (s)
    this.timers = []; // [{ at (scene s), fn }]
    this.creakT = 0;
    this.pitRippleT = 0;
    this.bandNdcTop = 1;
    this._applyColors();
    this._wire();
  }

  _defaultLights() {
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x5a6a4a, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-8, 20, 14);
    this.scene.add(sun);
  }

  /** Run fn after `sec` seconds of scene time (slow motion stretches it). */
  _after(sec, fn) { this.timers.push({ at: this.t + sec, fn }); }

  // ---------------------------------------------------------------- setup helpers

  _applyColors() {
    const t = this.game.state.teams;
    this.colors = [hexNum(t[0].color, 0xe63946), hexNum(t[1].color, 0x2f7cf6)];
    this.arena.setTeamColors(this.colors[0], this.colors[1]);
    this.crowd.setColors(this.colors[0], this.colors[1]);
    for (const f of this.figs) this._dressKind(f);
    for (const tr of this.tractors) tr.setColor(this.colors[tr.team - 1]);
    for (const tag of this.tags.all) tag.key = ''; // redraw tags in the new colours
  }

  _wire() {
    const g = this.game;
    g.on('join', (e) => {
      this.lineDirty = true;
      this.recentJoin.set(e.player.id, this.t + 4);
      this.audio.play('join_pop', { vol: 0.25, minGap: 0.18 });
    });
    g.on('effect', ({ effect }) => this._onEffect(effect));
    g.on('expire', ({ effect }) => this._onExpire(effect));
    g.on('captain', () => { this.lineDirty = true; });
    g.on('gift', (e) => this._onGift(e));
    g.on('like', (e) => { if (e.teamId) { this.crowd.likes(e.teamId, e.count); this.arena.cheer(0.03); } });
    g.on('phase', (e) => this._onPhase(e.phase));
    g.on('countdown', (e) => this._onCountdown(e.n));
    g.on('win', (e) => this._onWin(e));
    g.on('clear', () => this._clearAll());
    g.on('settings', () => { this._applyColors(); this.lineDirty = true; });
  }

  // ---------------------------------------------------------------- figures

  _alloc() {
    const f = this.pool.pop() || makeFigure();
    f.active = true;
    f.t = rand(0, 10); f.lean = 0; f.step = rand(0, 6); f.tilt = 0; f.roll = 0; f.y = 0; f.alpha = 1;
    f.crown = false; f.girth = 1; f.band = -1; f.player = null; f.effect = null; f.state = 'slot'; f.timer = 0; f.mode = 'idle';
    f.flexUntil = 0; f.stompUntil = 0; f.yankUntil = 0; f.tagUntil = 0; f.slot = -1; f.expr = ''; f.ropeSide = 'R'; f.intensity = 0;
    f.headX = 0; f.headY = 1.75; f.headZ = 0; f.noGrip = false; f.runRate = 1; f.arrived = false;
    this.figs.push(f);
    return f;
  }

  _free(f) {
    f.active = false;
    if (f.gltf) this.gltf.release(f);
    if (f.tag) { this.tags.release(f.tag); f.tag = null; }
    const i = this.figs.indexOf(f);
    if (i >= 0) this.figs.splice(i, 1);
    this.pool.push(f);
  }

  _dressKind(f) {
    const base = this.colors[f.team - 1];
    f.shirt = base; f.band = -1; f.crown = false; f.girth = 1;
    let sc = 0.97 + f.seed * 0.06;
    if (f.kind === 'captain') { sc = 1.1; f.crown = true; f.band = 0xffc83d; }
    else if (f.kind === 'helper') { sc = (f.effect?.size || 1) * 0.98; f.shirt = lighten(base, 0.22); f.band = 0xffffff; }
    else if (f.kind === 'strongman') { sc = 1.38; f.girth = 1.38; f.band = f.skin; }
    else if (f.kind === 'giant') { sc = GIANT_SCALE; f.girth = 1.3; f.band = 0x3b2a1a; }
    f.scale = sc;
    f.modelKey = this.gltf.available ? this.gltf.keyFor(f) : '';
    if (f.gltf && f.gltf.key !== f.modelKey) this.gltf.release(f);
  }

  /** Lateral distance of a figure from the rope (fists on the rope line). */
  _lateral(f) {
    if (this.gltf.gripOffset && f.modelKey) return this.gltf.gripOffset(f.kind, f.scale);
    return 0.36;
  }

  /** A team's giant holds the front of the line. */
  _giantOf(team) {
    for (const g of this.giants.values()) if (g.team === team && (g.state === 'slot' || g.state === 'enter')) return g;
    return null;
  }

  _slotPos(f) {
    const v = this.cfg.visual;
    const shift = this._giantOf(f.team) ? GIANT_SHIFT : 0;
    // Even slots behind the rope, odd ones in front: the captain (slot 0) is never hidden and a
    // pehlivan (slot 1) stands on the camera side.
    const zs = f.slot % 2 === 0 ? -1 : 1;
    return { x: side(f.team) * (v.frontX + shift + f.slot * v.slotGap), z: zs * this._lateral(f) };
  }

  _giantPos(f) {
    const v = this.cfg.visual;
    return { x: side(f.team) * (v.frontX + 0.15), z: -this._lateral(f) };
  }

  _spawnX(team) {
    const v = this.cfg.visual;
    return side(team) * (v.frontX + v.pullersPerSide * v.slotGap + 6);
  }

  /** Visible pullers of a team (fewer while its tractor pulls, so the tractor stays in frame). */
  _lineCap(team) {
    const N = Math.max(1, Math.round(this.cfg.visual.pullersPerSide) || 8);
    return this.tractorFx[team - 1] ? Math.min(N, TRACTOR_LINE) : N;
  }

  /** Who stands on the rope: captain, strongmen, helpers, then members by contribution. */
  _computeLine(team) {
    const N = this._lineCap(team);
    const out = [];
    const capRec = this.game.captainOf(team);
    if (capRec && capRec.teamId === team) out.push({ key: `p:${capRec.player.id}`, kind: 'captain', player: capRec.player });
    const effs = this.game.effects.filter((e) => e.teamId === team);
    for (const e of effs) if (e.kind === 'strongman') for (let u = 0; u < e.units && out.length < N; u++) out.push({ key: `e:${e.id}:${u}`, kind: 'strongman', player: e.player, effect: e });
    let helpers = 0;
    for (const e of effs) {
      if (e.kind !== 'helper') continue;
      for (let u = 0; u < e.units && out.length < N && helpers < this.cfg.gifts.maxHelpersPerTeam; u++, helpers++) out.push({ key: `e:${e.id}:${u}`, kind: 'helper', player: e.player, effect: e });
    }
    if (out.length < N) {
      const members = this.game.members(team);
      const capId = capRec ? capRec.player.id : null;
      let list = members;
      if (members.length > N) {
        // Contributors first, then the earliest joiners (stable).
        list = members.filter((r) => r.roundCoins > 0).sort((a, b) => b.roundCoins - a.roundCoins);
        if (list.length < N) for (const r of members) { if (r.roundCoins <= 0) list.push(r); if (list.length >= N + 1) break; }
      }
      for (const r of list) {
        if (out.length >= N) break;
        if (r.player.id === capId) continue;
        out.push({ key: `p:${r.player.id}`, kind: 'member', player: r.player });
      }
    }
    return out;
  }

  _syncLines() {
    const phase = this.game.state.phase;
    if (phase === 'ending' || phase === 'result') return;
    for (const team of [1, 2]) {
      const want = this._computeLine(team);
      const line = this.lines.get(team);
      const keep = new Set(want.map((w) => w.key));
      for (const [key, f] of line) {
        if (!keep.has(key)) { line.delete(key); this._leave(f); }
      }
      want.forEach((w, i) => {
        let f = line.get(w.key);
        if (!f) {
          f = this._alloc();
          f.key = w.key; f.team = team; f.kind = w.kind; f.player = w.player; f.effect = w.effect || null;
          dressFigure(f, w.key.startsWith('p:') ? w.key : `${w.key}${Math.random()}`);
          this._dressKind(f);
          f.x = this._spawnX(team) + rand(-1, 1); f.z = rand(-1.2, 1.2);
          f.state = 'enter';
          f.yaw = team === 1 ? 0 : Math.PI;
          if (w.player && (this.recentJoin.get(w.player.id) || 0) > this.t) f.tagUntil = this.t + 5;
          if (w.kind === 'strongman' || w.kind === 'helper') f.tagUntil = this.t + 6;
          line.set(w.key, f);
        } else if (f.kind !== w.kind) {
          f.kind = w.kind; f.player = w.player; this._dressKind(f);
        }
        f.slot = i;
      });
    }
  }

  _leave(f) {
    f.slot = -1;
    f.leaveX = side(f.team) * (Math.abs(this._spawnX(f.team)) + 4);
    if (f.state !== 'jump' && f.state !== 'falling' && f.state !== 'pit') f.state = 'leave';
  }

  _clearAll() {
    for (const f of [...this.figs]) this._free(f);
    this.lines.get(1).clear(); this.lines.get(2).clear();
    this.giants.clear();
    for (const tr of this.tractors) { tr.state = 'off'; tr.group.visible = false; if (tr.tag) { this.tags.release(tr.tag); tr.tag = null; } }
    this.tractorFx = [null, null];
    this.audio.setLoop('tractor_loop', 0);
    this.lineDirty = true;
  }

  // ---------------------------------------------------------------- events

  _onEffect(e) {
    this.lineDirty = true;
    const v = this.cfg.visual;
    if (e.kind === 'giant') {
      const f = this._alloc();
      f.key = `g:${e.id}`; f.team = e.teamId; f.kind = 'giant'; f.player = e.player; f.effect = e;
      dressFigure(f, f.key);
      this._dressKind(f);
      f.x = side(e.teamId) * (v.frontX + Math.min(v.pullersPerSide, 6) * v.slotGap + 4.5); f.z = -1.4;
      f.state = 'enter';
      f.tagUntil = this.t + 8;
      this.giants.set(e.id, f);
      // Hero framing: follow the giant's walk to the front.
      this.rig.heroAt(() => (f.active ? f.x * 0.75 : 0), 1.5, -0.4, 5.6, 0.86);
      this.audio.duck(4);
      this.audio.play('drum_roll', { vol: 0.8, minGap: 1 });
    } else if (e.kind === 'tractor') {
      const i = e.teamId - 1;
      const tr = this.tractors[i];
      this.tractorFx[i] = e;
      tr.player = e.player;
      if (tr.state === 'off' || tr.state === 'leave') {
        tr.state = 'enter';
        tr.x = side(e.teamId) * 30;
        tr.group.visible = true;
        this.rig.heroAt(side(e.teamId) * (v.frontX + TRACTOR_LINE * v.slotGap + 1.2), 1.1, 0, 4.2, 0.86);
        this.audio.play('sfx_tractor', { vol: 0.9 });
        this.audio.duck(3);
      }
      tr.tagUntil = this.t + 6;
    }
  }

  _onExpire(e) {
    this.lineDirty = true;
    if (e.kind === 'giant') {
      const f = this.giants.get(e.id);
      if (f) { this.giants.delete(e.id); this._leave(f); f.leaveX = side(f.team) * 34; }
    } else if (e.kind === 'tractor') {
      const i = e.teamId - 1;
      if (this.tractorFx[i] === e) {
        // Another tractor effect of this team still active keeps the tractor.
        const other = this.game.effects.find((x) => x !== e && x.kind === 'tractor' && x.teamId === e.teamId);
        if (other) this.tractorFx[i] = other;
        else { this.tractorFx[i] = null; this.tractors[i].state = 'leave'; }
      }
    }
  }

  _figureOf(player) {
    if (!player) return null;
    const line = this.lines.get(player.teamId);
    return line ? line.get(`p:${player.id}`) || null : null;
  }

  _onGift(e) {
    const f = this._figureOf(e.player);
    const sx = side(e.teamId);
    const v = this.cfg.visual;
    const coins = e.total;
    this.audio.play(coins >= 100 ? 'sfx_gift_big' : coins >= 10 ? 'sfx_gift_medium' : 'sfx_gift_small', { vol: 0.7, minGap: 0.12 });
    if (e.tier.id === 'tug') {
      this.rope.jerk(Math.min(0.12, 0.03 + e.count * 0.01));
      this.ropeDispVel += -sx * Math.min(0.06, 0.012 * e.count);
      if (f) {
        f.yankUntil = this.t + 0.8;
        f.tagUntil = Math.max(f.tagUntil, this.t + 2.5);
        this.effects.stars(f.headX || f.x, (f.headY || 2) + 0.25, f.headZ || f.z, 0xffd166, 3);
      } else this.effects.dust(sx * (v.frontX + 1.5) + this.offset, rand(-0.5, 0.5), 4);
      this.audio.play('sfx_rope', { vol: 0.45, minGap: 0.25 });
    } else {
      this.rope.jerk(0.08);
      this.arena.cheer(coins >= 1000 ? 1 : 0.3);
      this.crowd.cheerTeam?.(e.teamId, 0.5);
      if (coins >= 100) { this.crowd.likes(e.teamId, 30); this.audio.play('sfx_cheer', { vol: 0.6, minGap: 1 }); }
      if (coins >= 1000) this.rig.shake(0.45);
    }
  }

  _onPhase(phase) {
    if (phase === 'lobby') {
      this.ending = null;
      this.crowd.ending = null;
      this.lineDirty = true;
      // Everybody back on their feet; pit swimmers jump out.
      for (const f of this.figs) {
        if (f.state === 'pit' || f.state === 'falling') this._jumpOut(f);
        else if (f.state === 'down' || f.state === 'drag') f.state = f.slot >= 0 || f.kind === 'giant' ? 'slot' : 'leave';
        f.tilt = 0; f.expr = '';
      }
      this.audio.playMusic('music_main');
      this.audio.setLoop('rope_tension_loop', 0);
    } else if (phase === 'play') {
      this.rig.shake(0.2);
    } else if (phase === 'ending') {
      this.audio.setLoop('rope_tension_loop', 0);
    }
  }

  _onCountdown(n) {
    if (n === 0) {
      this.audio.play('sfx_whistle', { vol: 1, long: true, minGap: 0 });
      this.audio.play('countdown_go', { vol: 0.7, minGap: 0 });
      this.rope.jerk(0.15);
      this.arena.cheer(0.5);
      this.audio.play('crowd_cheer_b', { vol: 0.5, minGap: 2 });
    } else this.audio.play('countdown_beep', { vol: 0.6, minGap: 0 });
  }

  _onWin(e) {
    this.ending = { winner: e.teamId, by: e.by, t: 0, draw: !e.teamId };
    this.crowd.ending = { winner: e.teamId };
    if (!e.teamId) { this.audio.play('whistle_end', { vol: 0.8, minGap: 0 }); return; }
    const loser = e.teamId === 1 ? 2 : 1;
    const pit = e.by === 'pit';
    const losers = [...this.lines.get(loser).values()].filter((f) => f.state === 'slot').sort((a, b) => a.slot - b.slot);
    const n = Math.min(pit ? PIT_FALLERS : TIME_FALLERS, losers.length);
    losers.forEach((f, i) => {
      if (i < n) { f.state = 'drag'; f.fallDelay = (pit ? 0.15 : 0.5) + i * (pit ? 0.32 : 0.6); }
      else { f.state = 'down'; f.timer = rand(0.2, 0.9); }
    });
    // Giants of the losing team stumble too (they do not fit the pit: they sit down).
    for (const f of this.giants.values()) if (f.team === loser && f.state === 'slot') { f.state = 'down'; f.timer = 0.3; }
    const ls = side(loser);
    if (this.cfg.visual.slowMo) {
      // The decisive moment: a slow-motion beat on the edge of the pit.
      this.slowUntil = this.t + (pit ? 1.4 : 0.7);
      this.rig.heroAt(ls * (this.cfg.visual.pitHalf + 0.6), 0.7, 0.3, pit ? 2.6 : 1.8, 0.66);
      this.audio.play('drum_hit', { vol: 0.9, minGap: 0 });
    }
    this.rig.shake(0.4);
    this.audio.play('whistle_end', { vol: 0.8, minGap: 0 });
    this.audio.duck(6);
    const ws = side(e.teamId);
    this._after(0.5, () => this.audio.play('sfx_cheer', { vol: 1 }));
    this._after(0.9, () => this.audio.play('sfx_win', { vol: 0.9 }));
    void ws; // confetti and the stands' cheer follow in update() when the camera turns to the winners
    this.arena.cheer(1.0);
  }

  _jumpOut(f) {
    const sx = side(f.team);
    const tx = sx * (this.cfg.visual.pitHalf + 0.5);
    f.state = 'jump';
    f.timer = 0;
    f.jx0 = f.x; f.jy0 = f.y; f.jz0 = f.z;
    f.jx1 = tx; f.jz1 = clamp(f.z, -1.2, 1.2);
    f.jT = 0.6;
    f.expr = 'happy';
    this.effects.splash(f.x, this.arena.waterY + 0.02, f.z, 0.5);
  }

  // ---------------------------------------------------------------- per frame

  resize(W, H, band) {
    this.rig.fit(W, H, band);
    // Top of the action band in NDC (name tags stay below it, never under the HUD panels).
    this.bandNdcTop = band && H ? 1 - (2 * band.y) / H : 1;
    this.bandNdcBottom = band && H ? 1 - (2 * (band.y + band.h)) / H : -1;
    this.viewH = H;
    this.viewW = W;
  }

  update(dtReal) {
    // Slow motion at the decisive moment (visual only; the core runs on wall-clock time).
    const slow = this.t < this.slowUntil;
    this.timeScale += ((slow ? 0.28 : 1) - this.timeScale) * damp(slow ? 14 : 3, dtReal);
    const dt = dtReal * this.timeScale;
    this.t += dt;
    if (this.timers.length) {
      const due = this.timers.filter((x) => x.at <= this.t);
      if (due.length) { this.timers = this.timers.filter((x) => x.at > this.t); for (const d of due) { try { d.fn(); } catch (e) { console.error(e); } } }
    }
    const st = this.game.state;
    const v = this.cfg.visual;
    const vmax = this.cfg.force.ropeMaxSpeed || 0.06;

    // Lines.
    this.lineTimer -= dtReal;
    if (this.lineDirty || this.lineTimer <= 0) { this.lineDirty = false; this.lineTimer = 0.6; this._syncLines(); }

    // Displayed rope: a spring toward the core value (elastic give, overshoot on jerks).
    let ropeTarget = st.rope;
    if (this.ending && !this.ending.draw) {
      this.ending.t += dt;
      const ws = this.ending.winner === 1 ? -1 : 1;
      const extra = this.ending.by === 'pit' ? Math.min(0.8, this.ending.t * 0.3) : Math.min(0.35, this.ending.t * 0.15);
      ropeTarget = ws * (Math.abs(st.rope) + extra / Math.max(0.5, v.travel));
    }
    const k = 38; const c = 8.5;
    for (let rem = Math.min(dt, 0.5); rem > 1e-6; rem -= 1 / 60) {
      const h = Math.min(rem, 1 / 60);
      this.ropeDispVel += ((ropeTarget - this.ropeDisp) * k - this.ropeDispVel * c) * h;
      this.ropeDisp += this.ropeDispVel * h;
    }
    const offset = this.ropeDisp * v.travel;
    this.offset = offset;

    // Shared heave rhythm.
    const prevHeave = this.heave;
    this.heave = (this.heave + dt / Math.max(0.5, v.heaveSec)) % 1;
    const playing = st.phase === 'play';
    const fsum = st.teams[0].force + st.teams[1].force;
    const tension = clamp(fsum / (fsum + 25), 0, 1);
    if (playing && this.heave < prevHeave) {
      // Each heave: the rope twangs, creaks and the teams grunt.
      this.rope.jerk(0.015 + tension * 0.02);
      const strong = st.teams[0].force >= st.teams[1].force ? 0 : 1;
      if (st.teams[strong].members > 0) this.audio.playAny('sfx_heave_', { vol: 0.4, minGap: 1 });
      if (Math.random() < 0.5 + tension * 0.4) this.audio.play(pick(['sfx_rope', 'rope_creak_b', 'rope_creak_c']), { vol: 0.25 + tension * 0.35, minGap: 0.6 });
      if (Math.random() < 0.6) this.audio.playAny(Math.random() < 0.65 ? 'grunt_m_' : 'grunt_f_', { vol: 0.3, minGap: 0.5 });
    }
    if (playing) this.audio.setLoop('rope_tension_loop', 0.08 + tension * 0.22);
    const g1 = clamp((-st.ropeVel / vmax) * 2, -1, 1);
    const gains = [g1, -g1];
    this.arena.setDust?.(playing ? 0.25 + tension * 0.6 : 0.2);

    // Rope hand height: on the ground in the lobby, picked up for the countdown.
    const handTarget = st.phase === 'lobby' ? 0.12 : this.ropeHandY;
    this.rope.handY += (handTarget - this.rope.handY) * damp(st.phase === 'lobby' ? 1.5 : 5, dt);

    // Figures.
    this.proc.begin();
    let frontL = -v.pitHalf; let frontR = v.pitHalf;
    let lastL = -v.frontX; let lastR = v.frontX;
    for (let i = this.figs.length - 1; i >= 0; i--) {
      const f = this.figs[i];
      if (!f.active) continue;
      if (this._stepFigure(f, dt, st, offset, gains, tension)) continue; // freed
      if ((f.state === 'slot' || f.state === 'drag' || f.state === 'down') && f.kind !== 'giant') {
        if (f.team === 1) { frontL = Math.max(frontL, f.x); lastL = Math.min(lastL, f.x); } else { frontR = Math.min(frontR, f.x); lastR = Math.max(lastR, f.x); }
      } else if (f.kind === 'giant' && f.state === 'slot') {
        if (f.team === 1) frontL = Math.max(frontL, f.x); else frontR = Math.min(frontR, f.x);
      }
    }
    for (const f of this.figs) {
      if (f.modelKey && this.gltf.draw(f, dt)) {
        if (!this.shadows && f.y < 0.4) this.proc.shadowAt(f.x, f.z, 0.9 * f.scale * f.girth, 1);
        continue;
      }
      f.headX = f.x; f.headY = f.y + 2.0 * f.scale; f.headZ = f.z;
      this.proc.draw(f);
    }
    this.proc.end();

    // Tractors and the rope ends.
    const ropeEnd = v.frontX + v.pullersPerSide * v.slotGap + 4;
    const ends = [
      { anchorX: lastL - 0.3, endX: -ropeEnd, endY: 0.04, tied: false },
      { anchorX: lastR + 0.3, endX: ropeEnd, endY: 0.04, tied: false },
    ];
    for (const tr of this.tractors) this._stepTractor(tr, dt, offset, ends, lastL, lastR, gains);
    this.rope.update(dt, { offset, tension, left: ends[0], right: ends[1], front: [frontL, frontR], vel: this.ropeDispVel });

    // Crowd: members beyond the visible line.
    const t0 = st.teams[0]; const t1 = st.teams[1];
    const inLine = [this.lines.get(1).size, this.lines.get(2).size];
    this.crowd.setCounts(Math.max(0, t0.members - inLine[0]), Math.max(0, t1.members - inLine[1]), [t0.members, t1.members]);
    this.crowd.hideCounters = !!this.rig.hero;
    this.crowd.update(dt, this.rig.camera);
    this.arena.update(dt);
    this.effects.update(dt);

    // Pit life: swimmers make ripples.
    this.pitRippleT -= dt;
    if (this.pitRippleT <= 0) {
      this.pitRippleT = 0.45;
      for (const f of this.figs) if (f.state === 'pit' && Math.random() < 0.5) this.effects.ripple(f.x + rand(-0.2, 0.2), this.arena.waterY + 0.03, f.z + rand(-0.2, 0.2), 0xe8f6ff, rand(0.9, 1.5), 1.2);
    }

    // Camera.
    // A tractor sits at the end of its (shortened) line: frame it (shift and a little wider).
    let focusX = 0; let zoomOut = 1; let nTr = 0;
    for (const tr of this.tractors) if (tr.state === 'pull' || tr.state === 'enter') { focusX += side(tr.team) * 1.8; nTr++; }
    if (nTr) zoomOut = nTr > 1 ? 1.3 : 1.12;
    for (const g of this.giants.values()) if (g.state === 'slot') zoomOut = Math.max(zoomOut, 1.08);
    let endRope = st.rope;
    if (this.ending && this.ending.winner) {
      // First the losers' edge of the pit (the falls), then the winners celebrating.
      const ws = side(this.ending.winner);
      // Real time (slow motion stretches ending.t): the falls, then the winners.
      this.ending.rt = (this.ending.rt || 0) + dtReal;
      const tPit = this.ending.by === 'pit' ? 2.6 : 1.8;
      endRope = this.ending.rt < tPit ? ws * 0.85 : 0; // rope toward the winners = losers at the pit
      if (this.ending.rt >= tPit) {
        const k = clamp((this.ending.rt - tPit) / 1.2, 0, 1);
        focusX += (ws * 2.2 + offset * 0.2) * k * k * (3 - 2 * k);
        // Confetti over the winners (two bursts) as the camera turns to them.
        const bursts = this.ending.bursts || 0;
        if (bursts < 2 && this.ending.rt >= tPit + bursts * 1.1) {
          this.ending.bursts = bursts + 1;
          const c = this.colors[this.ending.winner - 1];
          const cols = [c, lighten(c, 0.5), 0xffd166, 0xffffff, c];
          const cx = ws * 2.6 + offset * 0.6;
          this.effects.confetti(cx, 3.6, 0.3, 3.6, 120, cols);
          if (!bursts) { this.arena.cheer(1.5); this.crowd.cheerTeam?.(this.ending.winner, 1.2); this.audio.play('crowd_cheer_c', { vol: 0.8, minGap: 1 }); }
        }
      }
    } else if (this.ending) endRope = 0;
    this.rig.update(dtReal, { rope: endRope, offset, focusX, zoomOut, ending: !!this.ending });
    // Fog follows the camera distance (the distance depends on the band shape).
    this.scene.fog.near = this.rig.curDist * 1.6;
    this.scene.fog.far = this.rig.curDist * 5.5;

    // Name tags (after the camera moved).
    this.tagTimer -= dtReal;
    if (this.tagTimer <= 0) { this.tagTimer = 0.25; this._assignTags(); }
    this._placeTags();
  }

  /** One figure's behaviour; returns true when it was freed. */
  _stepFigure(f, dt, st, offset, gains, tension) {
    f.t += dt;
    const v = this.cfg.visual;
    const gn = gains[f.team - 1];
    const sx = side(f.team);
    const faceYaw = f.team === 1 ? 0 : Math.PI;
    let target = null;
    if (f.kind === 'giant') { const p = this._giantPos(f); target = { x: p.x + offset, z: p.z }; }
    else if (f.slot >= 0) { const p = this._slotPos(f); target = { x: p.x + offset, z: p.z }; }
    // Rope side from where the figure stands relative to the rope (z = 0).
    const zRef = target && (f.state === 'slot' || f.state === 'drag' || f.state === 'down') ? target.z : f.z;
    f.ropeSide = (f.team === 1) === (zRef > 0) ? 'L' : 'R';
    f.expr = '';
    f.noGrip = false;

    switch (f.state) {
      case 'enter': {
        if (!target) { this._leave(f); break; }
        const speed = f.kind === 'giant' ? 3.0 : 5.5;
        if (this._runTo(f, target.x, target.z, speed, dt)) {
          f.state = 'slot'; f.yaw = faceYaw;
          this._arrive(f);
        }
        if (f.kind === 'giant') {
          // Heavy steps: shake + dust on each footfall.
          const cur = Math.floor(f.step / Math.PI);
          if (cur !== (f._lastStep || 0)) {
            f._lastStep = cur;
            this.rig.shake(0.22);
            this.effects.dust(f.x, f.z, 6, 0xc9a77a, 1.8);
            this.audio.play('sfx_giant_step', { vol: 0.9, minGap: 0.2 });
          }
        } else if (Math.random() < dt * 6) this.effects.dust(f.x, f.z, 1, 0xc9a77a, 0.7);
        break;
      }
      case 'leave': {
        if (this._runTo(f, f.leaveX, f.z, f.kind === 'giant' ? 3 : 5, dt)) { this._free(f); return true; }
        break;
      }
      case 'jump': {
        f.timer += dt;
        const u = clamp(f.timer / f.jT, 0, 1);
        f.x = lerp(f.jx0, f.jx1, u); f.z = lerp(f.jz0, f.jz1, u);
        f.y = lerp(f.jy0, 0, u) + Math.sin(u * Math.PI) * 1.0;
        f.mode = 'run'; f.step += dt * 10; f.tilt = 0; f.expr = 'happy';
        f.yaw = Math.atan2(0, f.jx1 - f.jx0);
        if (u >= 1) { f.y = 0; f.state = f.slot >= 0 || f.kind === 'giant' ? 'enter' : 'leave'; if (f.state === 'leave') f.leaveX = side(f.team) * (Math.abs(this._spawnX(f.team)) + 4); }
        break;
      }
      case 'drag': {
        // Pulled with the rope, then stumbling forward into the pit (no flying).
        f.fallDelay -= dt;
        f.yaw = faceYaw; f.y = 0; f.tilt = 0;
        f.mode = 'pull_slip'; f.expr = 'shock';
        f.ropeY = this.rope.heightAt(f.x - sx * 0.3);
        const edge = sx * (v.pitHalf + 0.3);
        if (f.fallDelay > 0) {
          if (target) { f.x += (target.x - f.x) * damp(10, dt); f.z += (target.z - f.z) * damp(10, dt); }
        } else {
          // Skid toward the pit edge at a stumbling pace.
          const d = edge - f.x;
          const step = Math.sign(d) * Math.min(Math.abs(d), dt * 3.0);
          f.x += step;
          f.noGrip = true;
          if (Math.random() < dt * 14) this.effects.dust(f.x + sx * 0.15, f.z, 1, 0xb08a5a, 1.0);
        }
        if (Math.abs(f.x) <= v.pitHalf + 0.45) this._startFall(f);
        break;
      }
      case 'falling': {
        f.timer += dt;
        f.vy -= G * dt;
        f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
        f.tilt += f.spin * dt;
        f.mode = 'fall'; f.expr = 'shock';
        if (f.y <= this.arena.waterY - 0.1 && f.vy < 0) {
          f.y = this.arena.waterY - 0.1; f.state = 'pit'; f.mode = 'sit'; f.tilt = 0;
          f.yaw = rand(-0.6, 0.6) + (f.team === 1 ? Math.PI : 0);
          this.effects.bigSplash(f.x, this.arena.waterY + 0.02, f.z, f.kind === 'strongman' ? 1.3 : 1);
          this.audio.play(Math.random() < 0.5 ? 'splash_water' : 'sfx_splash', { vol: 0.9, minGap: 0.08 });
          this.rig.shake(0.16);
        }
        break;
      }
      case 'pit': {
        f.mode = 'sit'; f.expr = 'dazed';
        f.y = this.arena.waterY - 0.12 + Math.sin(f.t * 2.2 + f.seed * 9) * 0.03;
        if (Math.random() < dt * 0.5) this.effects.stars(f.headX, f.headY + 0.15, f.headZ, 0xffe066, 2);
        break;
      }
      case 'down': {
        f.timer -= dt;
        if (target) { f.x = target.x; f.z = target.z; }
        f.y = 0; f.yaw = faceYaw;
        if (f.timer <= 0) { f.mode = 'sad'; f.lean = 0; } else { f.mode = 'pull_slip'; f.expr = 'worried'; f.ropeY = this.rope.heightAt(f.x - sx * 0.3); }
        break;
      }
      default: { // 'slot'
        if (!target) { this._leave(f); break; }
        const dx = target.x - f.x; const dz = target.z - f.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.6) { this._runTo(f, target.x, target.z, 5, dt); break; }
        f.x += dx * damp(10, dt); f.z += dz * damp(10, dt); f.y = 0;
        f.yaw = faceYaw;
        this._poseInLine(f, st, gn, dt, tension);
      }
    }
    return false;
  }

  /** A figure reached its place on the rope. */
  _arrive(f) {
    if (f.arrived) return;
    f.arrived = true;
    const c = this.colors[f.team - 1];
    if (f.kind === 'helper') { this.effects.ring(f.x, 0.05, f.z, c, 2.0); this.effects.dust(f.x, f.z, 4, 0xc9a77a, 1.0); }
    if (f.kind === 'strongman') {
      f.flexUntil = this.t + 1.9;
      this.effects.ring(f.x, 0.05, f.z, c, 2.6);
      this.effects.dust(f.x, f.z, 8, 0xc9a77a, 1.4);
      this.effects.spark(f.headX || f.x, (f.headY || 2.2) - 0.4, f.headZ || f.z, 0xffe08a, 10, 1);
      this.rig.shake(0.18);
      this.audio.play('strongman_roar', { vol: 0.85, minGap: 0.4 });
      if (!this.rig.hero) this.rig.heroAt(f.x, 1.1, f.z, 2.4, 0.88);
      f.tagUntil = Math.max(f.tagUntil, this.t + 4);
    }
    if (f.kind === 'giant') {
      f.stompUntil = this.t + 1.4;
      // The stomp clip slams at 58 % of its cycle.
      this._after(0.8, () => {
        if (!f.active) return;
        this.effects.ring(f.x, 0.05, f.z, 0xffffff, 6);
        this.effects.dust(f.x, f.z, 18, 0xc9a77a, 2.2);
        this.rig.shake(0.75);
        this.arena.cheer(1.0);
        this.audio.play('sfx_giant_step', { vol: 1, minGap: 0 });
        this.audio.play('drum_hit', { vol: 0.8, minGap: 0 });
        this.rope.jerk(0.25);
      });
    }
  }

  _poseInLine(f, st, gn, dt, tension) {
    const v = this.cfg.visual;
    const sx = side(f.team);
    f.ropeY = this.rope.heightAt(f.x - sx * 0.3 * f.scale);
    const ph = st.phase;
    let mode = 'idle'; let leanT = 0; let amp = 0;
    if (this.ending && this.ending.winner === f.team) {
      // Winners: keep pulling while losers fall, then cheer.
      if ((this.ending.rt || 0) > (this.ending.by === 'pit' ? 2.4 : 1.6)) mode = 'cheer';
      else { mode = 'pull'; leanT = 0.45; }
    } else if (this.ending && this.ending.draw) {
      mode = 'idle';
    } else if (ph === 'lobby') {
      mode = 'idle';
    } else if (ph === 'countdown') {
      mode = 'pull_hard'; leanT = 0.3; f.expr = 'determined';
    } else if (ph === 'play') {
      // Winning ground: pull; hard-pressed (even): pull_hard; losing ground: pull_slip.
      mode = gn > 0.15 ? 'pull' : gn < -0.15 ? 'pull_slip' : 'pull_hard';
      leanT = mode === 'pull' ? 0.42 : mode === 'pull_hard' ? 0.5 : 0.24;
      amp = mode === 'pull_slip' ? 0.05 : 0.1;
    } else mode = 'idle';
    if (f.flexUntil > this.t && !this.ending) mode = 'flex';
    if (f.stompUntil > this.t && !this.ending) mode = 'stomp';
    if (f.yankUntil > this.t && mode.startsWith('pull')) { leanT += 0.18; mode = 'pull_hard'; }
    f.mode = mode;
    const heave = Math.sin((this.heave + f.phase) * Math.PI * 2);
    f.heave = heave;
    f.lean += (leanT + heave * amp - f.lean) * damp(8, dt);
    const speed = Math.abs(this.ropeDispVel) * v.travel;
    f.speed = speed;
    f.intensity = clamp(Math.abs(gn) * 0.7 + tension * 0.5, 0, 1);
    if (mode === 'pull') f.step += dt * (4 + speed * 30);
    else if (mode === 'run' || mode === 'cheer') f.step += dt * 8;
    // Effort: dust at the feet scales with the effort; sweat flies on the hardest pulls.
    if (ph === 'play' && mode.startsWith('pull') && Math.abs(f.x - this.rig.cur.x) < 9) {
      const effort = mode === 'pull_slip' ? 1.2 : mode === 'pull_hard' ? 0.9 : 0.5;
      const rate = (0.6 + f.intensity * 3.5) * effort * (f.kind === 'giant' ? 3 : f.kind === 'strongman' ? 1.6 : 1);
      if (Math.random() < dt * rate) this.effects.dust(f.x + sx * (mode === 'pull_slip' ? -0.25 : 0.1) * f.scale, f.z, 1, 0xb08a5a, 0.7 + f.intensity * 0.5 + (f.kind === 'giant' ? 0.8 : 0));
      if (mode === 'pull_hard' && Math.random() < dt * (0.5 + f.intensity * 1.4)) this.effects.sweat(f.headX - sx * 0.1, f.headY - 0.12 * f.scale, f.headZ);
    }
  }

  _startFall(f) {
    const v = this.cfg.visual;
    const T = 0.7;
    const sx = side(f.team);
    const tx = sx * rand(0.05, v.pitHalf * 0.6);
    const tz = clamp(f.z + rand(-0.8, 0.8), -this.arena.pitZ + 0.6, this.arena.pitZ - 0.6);
    const ty = this.arena.waterY - 0.1;
    f.state = 'falling'; f.timer = 0;
    f.vx = (tx - f.x) / T; f.vz = (tz - f.z) / T;
    f.vy = (ty - f.y + 0.5 * G * T * T) / T;
    f.spin = rand(1.8, 3.2);
    f.yaw = f.team === 1 ? 0 : Math.PI;
    this.audio.play('sfx_lose', { vol: 0.3, minGap: 0.5 });
    this.audio.play('crowd_aww', { vol: 0.3, minGap: 1.5 });
  }

  /** Run toward (x, z); returns true on arrival. */
  _runTo(f, x, z, speed, dt) {
    const dx = x - f.x; const dz = z - f.z;
    const d = Math.hypot(dx, dz);
    f.mode = 'run';
    f.y = 0; f.tilt = 0;
    f.runRate = speed / (f.kind === 'giant' ? 2.6 : 4.6);
    if (d < 0.08) return true;
    const s = Math.min(d, speed * dt);
    f.x += (dx / d) * s; f.z += (dz / d) * s;
    f.yaw = Math.atan2(-dz, dx);
    f.step += dt * speed * (f.kind === 'giant' ? 0.9 : 2.6);
    return d - s < 0.08;
  }

  _stepTractor(tr, dt, offset, ends, lastL, lastR, gains) {
    if (tr.state === 'off') return;
    const v = this.cfg.visual;
    const sx = side(tr.team);
    const lastX = tr.team === 1 ? lastL : lastR;
    const lineEnd = tr.team === 1 ? Math.min(lastX, -(v.frontX + 1)) : Math.max(lastX, v.frontX + 1);
    const parkX = lineEnd + sx * (0.9 + tr.hitchOffset);
    const e = ends[tr.team - 1];
    let spin = 0;
    if (tr.state === 'enter') {
      const d = parkX - tr.x;
      const step = Math.sign(d) * Math.min(Math.abs(d), dt * 8);
      tr.x += step; spin = Math.abs(step) / Math.max(1e-4, dt);
      if (Math.abs(parkX - tr.x) < 0.05) {
        tr.state = 'pull';
        this.effects.dust(tr.x, 0, 14, 0xc9a77a, 2);
        this.rig.shake(0.5);
        this.effects.ring(tr.x, 0.05, 0, this.colors[tr.team - 1], 4);
        this.audio.play('drum_hit', { vol: 0.6, minGap: 0.3 });
      }
      if (Math.random() < dt * 14) this.effects.dust(tr.x - sx * 1.2, rand(-0.6, 0.6), 1, 0xc9a77a, 1.2);
    } else if (tr.state === 'pull') {
      tr.x += (parkX - tr.x) * damp(3, dt);
      const g = gains[tr.team - 1];
      spin = 2 + Math.max(0, -g) * 6 + Math.max(0, g) * 3;
      if (Math.random() < dt * (4 + spin)) this.effects.dust(tr.x - sx * 0.2, rand(-0.8, 0.8), 1, 0xb08a5a, 1.3);
    } else if (tr.state === 'leave') {
      tr.x += sx * dt * 8; spin = 8;
      if (Math.abs(tr.x) > 34) { tr.state = 'off'; tr.group.visible = false; return; }
    }
    tr.spin = spin;
    tr.wheelAngle += spin * dt;
    tr.group.position.set(tr.x, 0, 0);
    tr.update(dt, this.t);
    tr.group.position.x = tr.x;
    // Exhaust puffs (thicker while straining).
    if (Math.random() < dt * (tr.state === 'pull' ? 7 : 4)) {
      const ex = tr.exhaustWorld();
      this.effects.smoke(ex.x, ex.y + 0.05, ex.z, tr.state === 'pull' ? 0x4a4a4a : 0x6a6a6a, tr.state === 'pull' ? 0.38 : 0.3);
    }
    if (tr.state !== 'leave') {
      const h = tr.hitchWorld();
      e.tied = true;
      e.endX = h.x; e.endY = h.y;
      e.anchorX = tr.team === 1 ? Math.min(e.anchorX, lastX - 0.3) : Math.max(e.anchorX, lastX + 0.3);
    }
    // Engine loop while any tractor is on the field.
    const anyOn = this.tractors.some((t) => t.state === 'enter' || t.state === 'pull');
    this.audio.setLoop('tractor_loop', anyOn ? 0.35 : 0);
  }

  // ---------------------------------------------------------------- tags & anchors

  _assignTags() {
    for (const [id, until] of this.recentJoin) if (until < this.t) this.recentJoin.delete(id);
    if (!this.cfg.visual.nameTags) {
      for (const f of this.figs) if (f.tag) { this.tags.release(f.tag); f.tag = null; }
      for (const tr of this.tractors) if (tr.tag) { this.tags.release(tr.tag); tr.tag = null; }
      return;
    }
    const cands = [];
    for (const f of this.figs) {
      if (!f.player || f.state === 'leave' || f.state === 'falling') continue;
      let pri = 0;
      if (f.kind === 'captain') pri = 100;
      else if (f.kind === 'giant') pri = 95;
      else if (f.kind === 'strongman' && f.effect && f.key.endsWith(':0')) pri = 70;
      else if (f.tagUntil > this.t) pri = 40 + (f.tagUntil - this.t);
      if (f.state === 'pit') pri = Math.min(pri, 30);
      if (pri > 0) cands.push({ f, pri });
    }
    cands.sort((a, b) => b.pri - a.pri);
    // One tag per viewer (a captain who also sent a pehlivan is named once).
    const seen = new Set();
    const chosen = new Set();
    for (const c of cands) {
      if (chosen.size >= 7) break;
      if (seen.has(c.f.player.id)) continue;
      seen.add(c.f.player.id);
      chosen.add(c.f);
    }
    for (const f of this.figs) {
      if (f.tag && !chosen.has(f)) { this.tags.release(f.tag); f.tag = null; }
    }
    for (const f of chosen) {
      if (!f.tag) f.tag = this.tags.acquire();
      if (!f.tag) continue;
      const style = f.kind === 'captain' ? 'captain' : f.kind === 'member' ? 'join' : 'special';
      this.tags.set(f.tag, f.player.nick + (f.player.emoji ? ` ${f.player.emoji}` : ''), this.colors[f.team - 1], style);
    }
    // Tractor tags.
    for (const tr of this.tractors) {
      const want = tr.state !== 'off' && tr.state !== 'leave' && tr.player;
      if (want && !tr.tag) tr.tag = this.tags.acquire();
      if (!want && tr.tag) { this.tags.release(tr.tag); tr.tag = null; }
      if (tr.tag) this.tags.set(tr.tag, `🚜 ${tr.player.nick}`, this.colors[tr.team - 1], 'special');
    }
  }

  /**
   * Name tags at a constant on-screen size above the heads, kept inside the action band
   * (never under the HUD panels) and inside the side insets; overlapping tags stack or hide.
   */
  _placeTags() {
    const list = this.figs.filter((f) => f.tag);
    const pri = (f) => (f.kind === 'captain' ? 3 : f.kind === 'giant' ? 2 : f.kind === 'strongman' ? 1 : 0);
    list.sort((a, b) => pri(b) - pri(a));
    const cam = this.rig.camera;
    const placed = [];
    const p = this._tp || (this._tp = new THREE.Vector3());
    const H = this.viewH || 1920; const W = this.viewW || 1080;
    const u = H / 1920; // px per design unit
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const topLimit = this.bandNdcTop - (2 * 86 * u) / H; // below the band's top edge and the join pops
    const botLimit = (this.bandNdcBottom ?? -1) + (2 * 120 * u) / H; // above the gift credit strip
    const sideLimit = 1 - (2 * 70 * u) / W;
    const place = (sprite, wx, wy, wz, k, aspect, avoid) => {
      p.set(wx, wy, wz);
      const dist = Math.max(0.5, p.distanceTo(cam.position));
      // Constant size: tag box ~58 design units high.
      const hWorld = (84 * u * k) * (2 * dist * tanV) / H;
      sprite.scale.set(hWorld * (512 / 112), hWorld, 1);
      p.project(cam);
      const hNdc = (2 * 58 * u * k) / H;
      const wNdc = (2 * (aspect || 0.6) * 84 * (512 / 112) * u * k) / W;
      // The figure is out of frame: no tag. Near the edges the tag slides inward.
      if (Math.abs(p.x) > 0.98 || p.z > 1) return false;
      p.x = clamp(p.x, -sideLimit + wNdc / 2, sideLimit - wNdc / 2);
      for (let row = 0; row < 3; row++) {
        let y = Math.min(p.y + row * hNdc * 1.08, topLimit - hNdc / 2);
        if (y < botLimit) y = botLimit;
        const rect = { x: p.x, y, w: wNdc / 2, h: hNdc / 2 };
        if (avoid && placed.some((r) => Math.abs(r.x - rect.x) < r.w + rect.w && Math.abs(r.y - rect.y) < r.h + rect.h)) continue;
        placed.push(rect);
        p.y = y;
        p.unproject(cam);
        sprite.position.copy(p);
        return true;
      }
      return false;
    };
    for (const f of list) {
      const k = f.kind === 'captain' ? 1.15 : f.kind === 'giant' ? 1.3 : 1;
      f.tag.sprite.visible = place(f.tag.sprite, f.headX, f.headY + 0.28 + (f.crown ? 0.22 : 0), f.headZ, k, f.tag.aspect, true);
    }
    for (const tr of this.tractors) {
      if (!tr.tag) continue;
      tr.tag.sprite.visible = place(tr.tag.sprite, tr.x, 3.0, 0, 1.1, tr.tag.aspect, true);
    }
  }

  /** Screen anchors (CSS px) of figures with players, for the overlay (avatars etc.). */
  anchors() {
    const out = [];
    const cam = this.rig.camera;
    const W = this.rig.W; const H = this.rig.H;
    const p = new THREE.Vector3();
    for (const f of this.figs) {
      if (!f.player) continue;
      p.set(f.headX ?? f.x, (f.headY ?? f.y + 2.0 * f.scale) + 0.2, f.headZ ?? f.z).project(cam);
      out.push({ playerId: f.player.id, teamId: f.team, role: f.kind, state: f.state, x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H });
    }
    return out;
  }

  get stats() {
    return { figures: this.figs.length, particles: this.effects.count, crowd: this.crowd.bodies.count, gltf: this.figs.filter((f) => f.gltf).length, tractors: this.tractors.filter((t) => t.state !== 'off').length };
  }
}

function skyTexture() {
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#5fb4ef'); g.addColorStop(0.6, '#a9dcf7'); g.addColorStop(1, '#e8f6ff');
  c.fillStyle = g; c.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
