// Şeytan Avı game core, drawn in 3D: round flow on wall-clock time, the devil's health, his hiding
// AI, every projectile kind (pebble, big stone, rock rain, catapult boulder, meteor) and the round
// scoreboard. Positions are world coordinates (x right, y up, z towards the camera, 1 unit ~ 1 m);
// name popups are placed with proj.js toScreen.
//
// Phases: countdown -> play -> win | lose -> countdown ...
//   win:  health reached 0 before the timer: the devil flees, the round's top thrower is shown.
//   lose: the timer ran out: the devil laughs, then a new round starts.
//
// Where things come from:
//   likes      the liker's figure in the crowd flicks a pebble (thrower3d.js: the players gather in
//              the middle of the courtyard and stay)
//   stone      the gifter's figure throws them overhand, one throw per stone
//   rain       the figure raises its arms; stones fall on the devil from above
//   arrows     the figure points; fire arrows fly from all over the crowd and set the devil burning
//   catapult   the figure points; a catapult rolls up behind the crowd and fires burning boulders
//   chains     the figure raises its arms; talisman chains (powers3d.js) hold the devil in the open:
//              no hiding, every stone does full damage
//   meteor     the figure raises its arms; a shooting star comes from behind, upper right
//   dragon     the figure raises its arms; a dragon (powers3d.js) sweeps in, breathes fire on the
//              devil and burns every hiding place
import { Vector3 } from 'three';
import { toScreen, camPose } from './proj.js';
import { makeCatapult } from './world3d.js';
import { Devil3D } from './devil3d.js';
import { Throwers } from './thrower3d.js';
import { Powers } from './powers3d.js';
import { fmt } from './overlay.js';
import { cleanNick } from '../../../shared/sanitize.js';

export const W = 1080;
export const H = 1920;

const SESSION_KEY = 'seytan.session.v2';
// Open spots: world position of the devil's torso, in front of the props (z > 0) and behind the
// crowd (which starts at z 3). Hiding spots come from the world (behind the props, z -1.4).
const OPEN_SPOTS = [
  { x: 0, y: 2.3, z: 1.1 }, { x: -1.3, y: 1.8, z: 1.3 }, { x: 1.3, y: 1.9, z: 1.2 },
  { x: 0.5, y: 2.9, z: 0.4 }, { x: -1.9, y: 1.5, z: 1.8 }, { x: 1.9, y: 1.5, z: 1.7 },
];
const ENTER_FROM = { x: 0, y: 11, z: 1.1 };
const ENTER_TO = { x: 0, y: 2.4, z: 1.1 };
const FLEE_TO = { x: 0, y: 13, z: -5 };
const LAUGH_AT = { x: 0, y: 2.6, z: 1.8 };
const DEVIL_UNIT = 0.85; // world size of one devil-model unit at full scale (devil3d DEVIL_BASE)
const WALK_SPEED = 4.6; // world units per second between spots (x devil.speed)
const TELEPORT_CHANCE = 0.12;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
// projectile radius (world units) by kind
const RADIUS = { like: 0.085, stone: 0.19, rain: 0.15, boulder: 0.3, meteor: 0.42, arrow: 1.45 };

// gift tiers, smallest first. key: the settings key of the tier's lowest coin value; bonus: damage
// multiplier when gift.tierBonus is on.
export const TIERS = [
  { id: 'like', icon: '🪨', name: 'Küçük taş', small: true },
  { id: 'stone', icon: '🪨', name: 'Büyük taş', bonus: 1 },
  { id: 'rain', icon: '🌧️', name: 'Kaya yağmuru', key: 'tier.rain', bonus: 1.1 },
  { id: 'arrows', icon: '🏹', name: 'Ateş okları', key: 'tier.arrows', bonus: 1.2 },
  { id: 'catapult', icon: '🔥', name: 'Mancınık', key: 'tier.catapult', bonus: 1.35 },
  { id: 'chains', icon: '⛓️', name: 'Tılsım zinciri', key: 'tier.chains', bonus: 1.5 },
  { id: 'meteor', icon: '🌠', name: 'Kayan yıldız', key: 'tier.meteor', bonus: 1.75 },
  { id: 'dragon', icon: '🐉', name: 'Ejderha', key: 'tier.dragon', bonus: 2 },
];
const BURN_SEC = 4; // fire arrows: the devil burns this long
const BURN_SHARE = 0.4; // share of the arrows' damage dealt by the burn (the rest on impact)

export class Game {
  /** view: { world, vfx, overlay } (world3d.js World, vfx3d.js Vfx3D, overlay.js Overlay). */
  constructor({ settings, emit = () => {}, view }) {
    this.settings = settings;
    this.emit = emit;
    this.world = view.world;
    this.vfx = view.vfx;
    this.overlay = view.overlay;
    this.world.shake = this.vfx.shakeOffset;
    this.devil3d = new Devil3D(this.world.scene);
    // the world's theme may place the devil's spots and the crowd differently
    const L = this.world.layout || {};
    this.openSpots = L.open || OPEN_SPOTS;
    this.enterTo = L.enter || ENTER_TO;
    this.laughAt = L.laugh || LAUGH_AT;
    this.throwers = new Throwers(this.world.scene, this.vfx, (a, pos, th) => this._onRelease(a, pos, th), { rows: L.crowdRows, style: this.world.theme });
    // hiding props from the 3D world (at = their middle, for the "cover shattered" effect)
    this.props = this.world.props.map((p) => ({ id: p.id, hides: p.hides, ref: p, at: { x: p.obj.position.x, y: 1.6, z: p.obj.position.z + 0.4 }, broken: 0 }));
    this.powers = new Powers(this.world.scene, this.vfx);
    this.burns = [];
    this.dragons = []; // waiting dragon calls: { user, dmg }
    this.dragonNow = null; // the one in the sky: { user, dmg, ticks }
    this.dragonGlow = 0;
    this.chainUser = null;
    this.t = 0;
    this.projs = [];
    this.catapults = [];
    this.queue = [];
    this.queueT = 0;
    this.board = new Map();
    this.likeSeen = new Map();
    this.lastLikePopup = 0;
    this.laughTint = 0;
    this.meteorDark = 0;
    this.session = loadSession();
    this.round = 0;
    this.devil = { x: 0, y: 2.4, z: 1.1, sx: 0, sy: 2.4, sz: 1.1, tx: 0, ty: 2.4, tz: 1.1, mode: 'idle', moveT: 0, moveDur: 1, dwell: 2, spot: null, flash: 0, face: 'smirk', faceT: 0, dazed: 0, dir: 1, scale: 1, alpha: 1, rot: 0, behind: false, arms: 'hips', peek: 0 };
    this.result = null;
    this.newRound();
  }

  get(k) { return this.settings.get(k); }

  // -------------------------------------------------------------------------- round flow

  newRound() {
    this.round++;
    this.board.clear();
    // like pebbles still flying keep going; gift stones were queued for this round
    for (const p of this.projs) if (p.kind !== 'like') this.vfx.releaseRock(p.mesh);
    this.projs = this.projs.filter((p) => p.kind === 'like');
    this._stopPowers();
    this.hpMax = Math.max(1, Math.round(Number(this.get('devil.hp')) * (this.get('devil.adaptive') ? this.session.hpScale : 1)));
    this.hp = this.hpMax;
    this.roundSec = Number(this.get('round.sec')) || 120;
    this.timeLeft = this.roundSec;
    this.result = null;
    const d = this.devil;
    this._moveTo(this.enterTo, ENTER_FROM);
    Object.assign(d, { mode: 'enter', moveDur: 1.2, spot: null, scale: 1, alpha: 1, rot: 0, dazed: 0, face: 'smirk', arms: 'wave', dwell: 1 });
    const cd = Number(this.get('round.countdownSec')) || 0;
    this.phase = cd > 0 ? 'countdown' : 'play';
    this.phaseT = cd;
    this._lastCount = -1;
    for (const p of this.props) p.broken = 0;
    this.emit('round', { round: this.round });
    if (this.phase === 'play') this.emit('start');
  }

  startPlay() {
    this.phase = 'play';
    this.phaseT = 0;
    this.emit('start');
  }

  win() {
    if (this.phase !== 'play') return;
    this.phase = 'win';
    this.phaseT = (Number(this.get('round.resultSec')) || 8) + 2;
    this.session.wins++;
    if (this.get('devil.adaptive')) this.session.hpScale = Math.min(20, this.session.hpScale * 1.25);
    saveSession(this.session);
    this._stopPowers(true);
    const d = this.devil;
    this._moveTo(FLEE_TO);
    Object.assign(d, { mode: 'flee', moveDur: 2.2, face: 'scared', arms: 'up', dazed: 0 });
    this.result = { win: true, top: this.topList(3), elapsed: this.roundSec - this.timeLeft, showAt: 1.4 };
    this.vfx.poof(this._devilWorld(), true);
    this.emit('win', this.result);
  }

  lose() {
    if (this.phase !== 'play') return;
    this.phase = 'lose';
    this.phaseT = (Number(this.get('round.resultSec')) || 8) + 1.5;
    this.session.losses++;
    if (this.get('devil.adaptive')) this.session.hpScale = Math.max(1, this.session.hpScale * 0.85);
    saveSession(this.session);
    this._stopPowers(true);
    const d = this.devil;
    this._moveTo(this.laughAt);
    Object.assign(d, { mode: 'laugh', moveDur: 0.8, face: 'laugh', arms: 'belly', dazed: 0, spot: null });
    this.result = { win: false, top: this.topList(3), hpLeft: this.hp, hpMax: this.hpMax, showAt: 1.0 };
    this.emit('lose', this.result);
  }

  topList(n) {
    return [...this.board.values()].sort((a, b) => b.dmg - a.dmg).slice(0, n);
  }

  /** Gold sparkles over the courtyard (round won). */
  celebrate(n = 60) { this.vfx.sparkle(n); }

  /** Bridge command. */
  command(name) {
    if (name === 'restartRound') { this.round--; this.newRound(); }
    else if (name === 'endRound') { if (this.phase === 'play') { if (this.hp <= 0) this.win(); else this.lose(); } }
    else if (name === 'resetSession') { this.session = { wins: 0, losses: 0, hpScale: 1 }; saveSession(this.session); this.emit('session'); }
  }

  /** sim <-> live switch: fresh round, nothing from the other source stays. */
  wipe() {
    this.queue = [];
    for (const p of this.projs) this.vfx.releaseRock(p.mesh);
    this.projs = [];
    for (const c of this.catapults) this.world.scene.remove(c.model.group);
    this.catapults = [];
    this.dragons = [];
    this.throwers.clear();
    this.round = 0;
    this.newRound();
  }

  // -------------------------------------------------------------------------- input

  like(user, count) {
    if (!this.get('like.enabled')) return;
    const n = clamp(Math.round(count) || 1, 1, 200);
    const dmg = n * Number(this.get('like.dmg'));
    const crowd = this.projs.length > 140;
    const stones = crowd ? 1 : Math.min(n, 4);
    // name popup throttle: one per viewer every 3 s, at most ~3 per second overall
    let showName = false;
    if (this.get('view.names')) {
      const last = this.likeSeen.get(user.name) || -9;
      if (this.t - last > 3 && this.t - this.lastLikePopup > 0.3) { showName = true; this.likeSeen.set(user.name, this.t); this.lastLikePopup = this.t; }
      if (this.likeSeen.size > 3000) this.likeSeen.clear();
    }
    // the liker joins the crowd in the middle and flicks the pebbles from there
    const actions = [];
    for (let i = 0; i < stones; i++) actions.push({ type: 'throw', kind: 'like', dmg: dmg / stones, name: showName && i === 0, stones: i === 0 ? n : 0 });
    this.throwers.request(user, 'like', actions);
  }

  gift(user, coins, count, giftName) {
    const c = Math.max(1, Number(coins) || 1);
    const k = clamp(Math.round(count) || 1, 1, 500);
    if (this.phase !== 'play') { if (this.queue.length < 400) this.queue.push({ user, coins: c, count: k, giftName }); return; }
    this._fireGift(user, c, k, giftName);
  }

  /** The tier of one gift of `coins` (the highest whose lowest value it reaches). */
  _tierOf(coins) {
    for (let i = TIERS.length - 1; i >= 2; i--) if (coins >= Number(this.get(TIERS[i].key))) return TIERS[i].id;
    return 'stone';
  }

  /** How far into its tier a gift is: 0 at the tier's lowest value, 1 at the next tier's. */
  _tierFrac(tier, coins) {
    const i = TIERS.findIndex((t) => t.id === tier);
    const lo = TIERS[i].key ? Number(this.get(TIERS[i].key)) : 1;
    const hi = TIERS[i + 1] ? Number(this.get(TIERS[i + 1].key)) : lo * 2;
    return clamp((coins - lo) / Math.max(1, hi - lo), 0, 1);
  }

  _fireGift(user, coins, count, giftName) {
    const total = coins * count;
    const tier = this._tierOf(coins);
    const T = TIERS.find((t) => t.id === tier);
    const dmg = total * Number(this.get('gift.dmgPerCoin')) * (this.get('gift.tierBonus') ? T.bonus : 1);
    const frac = this._tierFrac(tier, coins);
    this.emit('tier', tier);
    const nick = cleanNick(user.nick || user.name);
    if (tier === 'stone') {
      const n = Math.min(count, 8);
      const actions = [];
      for (let i = 0; i < n; i++) actions.push({ type: 'throw', kind: 'stone', dmg: dmg / n, name: i === 0, stones: i === 0 ? count : 0 });
      this.throwers.request(user, 'stone', actions);
    } else if (tier === 'rain') {
      this.banner(`${nick}: KAYA YAĞMURU`, '#8ef3ff');
      const n = clamp(Math.round(8 + Math.sqrt(total) * 1.6), 8, 40);
      this.throwers.request(user, 'rain', [{ type: 'summon', kind: 'rain', dmg, n }]);
      this.emit('rain');
    } else if (tier === 'arrows') {
      this.banner(`${nick}: ATEŞ OKLARI`, '#ff9a4a');
      // more arrows the more coins: 10 at 50, 22 near 250 (and more for a streak)
      const n = clamp(Math.round(10 + frac * 12 + (count - 1) * 4), 10, 34);
      this.throwers.request(user, 'arrows', [{ type: 'command', kind: 'arrows', dmg, n }]);
      this.emit('arrows');
    } else if (tier === 'catapult') {
      this.banner(`${nick}: MANCINIK`, '#ffb347');
      const shots = clamp(1 + Math.floor(frac * 3.999) + (count - 1), 1, 5);
      this.throwers.request(user, 'catapult', [{ type: 'command', kind: 'catapult', dmg, shots }]);
      this.emit('catapult');
    } else if (tier === 'chains') {
      this.banner(`${nick}: TILSIM ZİNCİRİ`, '#ffe27a');
      const sec = Number(this.get('chains.sec')) * (1 + frac * 0.4) + (count - 1) * 2;
      this.throwers.request(user, 'chains', [{ type: 'summon', kind: 'chains', dmg, sec: Math.min(sec, 20) }]);
      this.emit('chains');
    } else if (tier === 'meteor') {
      this.banner(`${nick}: KAYAN YILDIZ`, '#cfe2ff');
      this.throwers.request(user, 'meteor', [{ type: 'summon', kind: 'meteor', dmg, n: Math.min(count, 3) }]);
      this.meteorDark = 1;
      this.emit('meteor');
    } else {
      this.banner(`${nick}: EJDERHA!`, '#ff6a4a');
      this.throwers.request(user, 'dragon', [{ type: 'summon', kind: 'dragon', dmg, passes: Math.min(count, 3) }]);
      this.emit('dragonCall');
    }
  }

  // gift banners: under the status ribbon, above the devil's horns (clear of the crowd and of both columns)
  banner(text, color) {
    if (this.world.theme === 'sakura') this.overlay.banner(text, color, 494, 500);
    else this.overlay.banner(text, color, 1090);
  }

  /** A thrower's hand let go (throw), or its summon / command reached its peak. */
  _onRelease(a, hand, th) {
    const user = th.user;
    if (a.kind === 'like') {
      this.projs.push(this._proj(user, 'like', a.dmg, { from: hand, dur: rand(0.5, 0.7), peak: rand(0.7, 1.3), name: a.name, stones: a.stones }));
      this.emit('throw', 'like');
    } else if (a.kind === 'stone') {
      this.projs.push(this._proj(user, 'stone', a.dmg, { from: hand, dur: rand(0.75, 0.95), peak: rand(1.4, 2.2), name: a.name, stones: a.stones }));
      this.emit('throw', 'stone');
    } else if (a.kind === 'rain') {
      const d = this.devil;
      for (let i = 0; i < a.n; i++) {
        const from = { x: d.x + rand(-3, 3), y: d.y + rand(6, 8), z: d.z + rand(-0.6, 0.8) };
        this.projs.push(this._proj(user, 'rain', a.dmg / a.n, { from, delay: 0.15 + i * rand(0.04, 0.09), dur: rand(0.75, 1.05), name: i === a.n - 1, stones: i === 0 ? a.n : 0 }));
      }
    } else if (a.kind === 'meteor') {
      for (let i = 0; i < a.n; i++) {
        const from = { x: rand(11, 14), y: rand(14, 17), z: -30 };
        this.projs.push(this._proj(user, 'meteor', a.dmg / a.n, { from, delay: 0.3 + i * 1.4, dur: 1.5, name: true, stones: 1, breaks: true }));
      }
    } else if (a.kind === 'catapult') {
      this._spawnCatapult(user, a.dmg, a.shots);
    } else if (a.kind === 'arrows') {
      this._volley(user, a.dmg, a.n);
    } else if (a.kind === 'chains') {
      this._chain(user, a.dmg, a.sec);
    } else if (a.kind === 'dragon') {
      for (let i = 0; i < (a.passes || 1); i++) this.dragons.push({ user, dmg: a.dmg / (a.passes || 1) });
    }
  }

  /** Fire arrows loosed from all over the crowd at once; each sets the devil alight. */
  _volley(user, dmg, n) {
    const crowd = this.throwers.list.filter((x) => x.state === 'idle');
    const impact = (dmg * (1 - BURN_SHARE)) / n;
    const burn = (dmg * BURN_SHARE) / n;
    for (let i = 0; i < n; i++) {
      const th = crowd.length ? crowd[Math.floor(Math.random() * crowd.length)] : null;
      const from = th ? { x: th.x + rand(-0.2, 0.2), y: 1.5, z: th.z } : { x: rand(-2.5, 2.5), y: 1.5, z: rand(5, 7.5) };
      this.vfx.glowAt(from, { color: [1, 0.7, 0.3], size: 0.6, life: 0.2 });
      this.projs.push(this._proj(user, 'arrow', impact, { from, delay: i * rand(0.035, 0.07), dur: rand(1.0, 1.2), peak: rand(4.2, 5.6), name: i === n - 1, stones: i === 0 ? n : 0, burn, total: dmg }));
    }
  }

  /** Talisman chains: the devil is yanked out of cover into the open and held there. */
  _chain(user, dmg, sec) {
    const d = this.devil;
    if (this.phase !== 'play') { if (this.queue.length < 400) this.queue.push({ user, replay: 'boulder', dmg }); return; }
    // out of cover: the nearest open spot
    let spot = d.spot && d.spot.open ? d.spot : null;
    if (!spot) {
      const best = this.openSpots.reduce((a, b) => (Math.hypot(b.x - d.x, b.z - d.z) < Math.hypot(a.x - d.x, a.z - d.z) ? b : a));
      spot = { open: true, ...best };
      if (d.spot?.prop) { d.spot.prop.broken = sec + 1; d.spot.prop.ref.wobble = 1.2; }
      this._moveTo(spot);
      d.spot = spot; d.mode = 'move'; d.moveDur = 0.4;
    }
    d.bound = sec + 0.5;
    this.chainUser = user;
    this.chainDmg = dmg;
    this.powers.bind(spot.x, spot.z, sec);
  }

  _stopPowers(keepDragon = false) {
    this.burns = [];
    this.devil.bound = 0;
    this.powers.chains.release();
    if (!keepDragon) { this.powers.dragon?.hide(); this.dragonNow = null; }
  }

  _updatePowers(dt) {
    const d = this.devil;
    // the next dragon takes off once the sky is clear
    if (!this.powers.dragonBusy && this.dragons.length && this.phase === 'play') {
      this.dragonNow = { ...this.dragons.shift(), ticks: 0 };
      this.powers.callDragon(this._devilWorld());
      this.emit('dragon');
    }
    const ev = this.powers.update(dt, this.t, this._devilWorld());
    if (ev.chains === 'bound') {
      // the seal bites: part of the gift's damage at once, the rest while he is held
      this._direct(this.chainUser, this.chainDmg * 0.4, { stones: 1 });
      if (this.get('view.names')) this._popupAt(this.chainUser, this._devilWorld(), this.chainDmg, '#ffe27a');
      this.chainTick = { left: this.chainDmg * 0.6, per: (this.chainDmg * 0.6) / Math.max(1, d.bound * 2), t: 0.5 };
      this.vfx.impact(this._devilWorld(), 1.6, 'magic');
      this.emit('chainsBound');
    } else if (ev.chains === 'free') {
      // whatever the ticks did not deal lands as the chains burst
      if (this.chainTick?.left > 0) { this._direct(this.chainUser, this.chainTick.left, { flash: 0.5 }); this.chainTick.left = 0; }
      d.bound = 0; this.emit('chainsFree');
    }
    if (this.powers.chainsBound && this.chainTick?.left > 0) {
      this.chainTick.t -= dt;
      if (this.chainTick.t <= 0) {
        this.chainTick.t = 0.5;
        const step = Math.min(this.chainTick.left, this.chainTick.per);
        this.chainTick.left -= step;
        this._direct(this.chainUser, step, { flinch: true, flash: 0.35 });
      }
    }
    for (const e of ev.dragon) {
      const D = this.dragonNow;
      if (!D) continue;
      if (e === 'breathStart') {
        // every hiding place goes up in flames
        for (const p of this.props) { p.broken = 7; p.ref.wobble = 1.4; this.vfx.impact(p.at, 1.1, 'fire'); }
        d.dazed = Math.max(d.dazed, 3);
        if (d.mode !== 'idle' && d.mode !== 'move') { d.mode = 'idle'; d.alpha = 1; }
        this.vfx.shake(0.12);
        this.emit('dragonBreath');
      } else if (e === 'tick') {
        D.ticks++;
        const share = (D.dmg * 0.7) / 12;
        this._direct(D.user, share, { stones: D.ticks === 1 ? 1 : 0, flash: 0.18 });
        this.vfx.impact(this._devilWorld(), 0.5, 'fire');
        this.dragonGlow = 0.6;
        if (D.ticks === 1 && this.get('view.names')) this._popupAt(D.user, this._devilWorld(), D.dmg, '#ff6a4a');
      } else if (e === 'breathEnd') {
        // the final blast takes whatever is left of the gift
        const left = Math.max(0, D.dmg - (D.dmg * 0.7 / 12) * D.ticks);
        this._direct(D.user, left);
        this.vfx.explosion(this._devilWorld(), 2.2);
        this.vfx.shake(0.12);
        this.emit('hit', { kind: 'meteor', cover: false, live: this.phase === 'play', dmg: left });
      } else if (e === 'done') this.dragonNow = null;
    }
    this.dragonGlow = Math.max(0, this.dragonGlow - dt * 1.5);
  }

  _popupAt(user, at, dmg, col) {
    const s = toScreen(at.x, at.y, at.z);
    this.overlay.popup(s.x, s.y, cleanNick(user.nick || user.name, 16), dmg, 2, col);
  }

  /** Replayed stones (thrown last round, landed after it ended) fly in from just below the camera. */
  _fromCrowd(user, kind, dmg, { delay = 0, name = false, stones = 1 } = {}) {
    const cam = camPose().pos;
    const from = { x: rand(-2.5, 2.5), y: cam.y - 3.5, z: cam.z - 2.5 };
    const like = kind === 'like';
    this.projs.push(this._proj(user, kind, dmg, { from, delay, dur: like ? rand(0.6, 0.85) : rand(0.8, 1.0), peak: like ? rand(1.2, 2.4) : rand(2, 3), name, stones }));
  }

  _proj(user, kind, dmg, o) {
    const mesh = this.vfx.getRock(kind, RADIUS[kind] * rand(0.85, 1.15));
    mesh.visible = false;
    return {
      user, kind, dmg, mesh, from: { ...o.from }, pos: { ...o.from }, delay: o.delay || 0, t: 0, dur: o.dur || 0.8,
      peak: o.peak || 0, name: !!o.name, stones: o.stones ?? 1, breaks: !!o.breaks, burn: o.burn || 0, total: o.total || dmg,
      ox: rand(-0.55, 0.55), oy: rand(-0.8, 0.45), wx: rand(-9, 9), wy: rand(-9, 9), started: false,
    };
  }

  // -------------------------------------------------------------------------- update

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.t += dt;

    if (this.phase === 'countdown') {
      this.phaseT -= dt;
      const n = Math.ceil(this.phaseT);
      if (n !== this._lastCount && n > 0) { this._lastCount = n; this.emit('count', n); }
      if (this.phaseT <= 0) this.startPlay();
    } else if (this.phase === 'play') {
      this.timeLeft -= dt;
      this.queueT -= dt;
      if (this.queue.length && this.queueT <= 0) {
        const q = this.queue.shift();
        if (q.replay === 'meteor') {
          const from = { x: rand(11, 14), y: rand(14, 17), z: -30 };
          this.projs.push(this._proj(q.user, 'meteor', q.dmg, { from, dur: 1.5, name: true, stones: 1, breaks: true }));
        } else if (q.replay) this._fromCrowd(q.user, q.replay === 'boulder' ? 'boulder' : 'stone', q.dmg, { name: true });
        else this._fireGift(q.user, q.coins, q.count, q.giftName);
        this.queueT = q.replay ? 0.12 : 0.35;
      }
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.lose(); }
    } else {
      this.phaseT -= dt;
      if (this.result && this.result.showAt > 0) { this.result.showAt -= dt; if (this.result.showAt <= 0) this.emit('result', this.result); }
      if (this.phase === 'win' && Math.random() < dt * 3) this.vfx.sparkle(8);
      if (this.phase === 'lose' && Math.random() < dt * 2.2) this.overlay.laugh(pick(['HA HA HA!', 'HÖ HÖ HÖ!', 'HİHİHİ!', 'HA HA!']), rand(320, 760), rand(520, 640));
      if (this.phaseT <= 0) { this.emit('resultEnd'); this.newRound(); }
    }

    this.laughTint += ((this.phase === 'lose' ? 1 : 0) - this.laughTint) * Math.min(1, dt * 3);
    this.meteorDark = Math.max(0, this.meteorDark - dt * 0.4);
    for (const p of this.props) p.broken = Math.max(0, p.broken - dt);

    this._updateDevil(dt);
    const dw = this._devilWorld();
    this.throwers.update(dt, this.t, dw);
    this._updateProjs(dt);
    this._updateCatapults(dt);
    this._updateBurns(dt);
    this._updatePowers(dt);
    this.vfx.update(dt);
    this.world.update(this.t, dt);
    this.overlay.update(dt);
  }

  _speed() {
    let s = Number(this.get('devil.speed')) || 1;
    if (this.hp / this.hpMax < 0.3) s *= 1.4;
    return s;
  }

  _hidePos(spot) {
    if (!spot) return null;
    if (spot.open) return spot;
    return spot.hide;
  }

  /** Start a move of the devil from `from` (default: where he is) to world point `to`. */
  _moveTo(to, from = this.devil) {
    const d = this.devil;
    d.sx = from.x; d.sy = from.y; d.sz = from.z;
    d.x = from.x; d.y = from.y; d.z = from.z;
    d.tx = to.x; d.ty = to.y; d.tz = to.z;
    d.moveT = 0;
  }

  _pickSpot() {
    const d = this.devil;
    const hide = this.get('devil.hide');
    const covers = this.props.filter((p) => !p.broken).flatMap((p) => p.hides.map((h) => ({ prop: p, hide: h })));
    if (hide && covers.length && Math.random() < 0.55 && !(d.spot && !d.spot.open && Math.random() < 0.5)) {
      const options = covers.filter((c) => !d.spot || c.prop !== d.spot.prop);
      return pick(options.length ? options : covers);
    }
    const open = this.openSpots.filter((s) => !d.spot || !d.spot.open || Math.hypot(s.x - d.spot.x, s.y - d.spot.y, s.z - d.spot.z) > 0.6);
    return { open: true, ...pick(open) };
  }

  _goTo(spot, teleport = false) {
    const d = this.devil;
    const p = this._hidePos(spot);
    d.spot = spot;
    if (Math.abs(p.x - d.x) > 0.1) d.dir = p.x > d.x ? 1 : -1;
    if (teleport) {
      this.vfx.poof(this._devilWorld());
      this._moveTo(p);
      d.mode = 'tele';
      d.moveDur = 0.45;
      this.emit('teleport');
    } else {
      const dist = Math.hypot(p.x - d.x, p.y - d.y, p.z - d.z);
      this._moveTo(p);
      d.mode = 'move';
      d.moveDur = clamp(dist / (WALK_SPEED * this._speed()), 0.6, 1.8);
    }
  }

  /** World position of the devil's torso (with the peeking and bobbing offsets). */
  _devilWorld() {
    const d = this.devil;
    const bob = d.mode === 'idle' || d.mode === 'laugh' ? Math.sin(this.t * 2.4) * 0.08 : 0;
    return { x: d.x + d.peek, y: d.y + bob, z: d.z };
  }

  _updateDevil(dt) {
    const d = this.devil;
    d.flash = Math.max(0, d.flash - dt * 5);
    d.faceT -= dt;
    d.dazed = Math.max(0, d.dazed - dt);
    d.bound = Math.max(0, (d.bound || 0) - dt);

    if (d.mode === 'enter' || d.mode === 'move' || d.mode === 'flee' || d.mode === 'laugh') {
      d.moveT += dt;
      const k = clamp(d.moveT / d.moveDur, 0, 1);
      const e = ease(k);
      // a gentle hop between spots
      const arc = d.mode === 'move' ? Math.sin(k * Math.PI) * 0.6 : 0;
      d.x = d.sx + (d.tx - d.sx) * e;
      d.y = d.sy + (d.ty - d.sy) * e + arc;
      d.z = d.sz + (d.tz - d.sz) * e;
      if (d.mode === 'flee') {
        d.rot = d.moveT * 9;
        d.scale = Math.max(0.2, 1 - k * 0.7);
        if (Math.random() < 0.6) this.vfx.trail(this._devilWorld(), 'meteor');
        if (k >= 1 && d.alpha > 0) { d.alpha = 0; this.vfx.poof(this._devilWorld(), true); }
      } else if (d.mode === 'laugh') {
        d.scale = 1 + e * 0.25;
        d.rot = Math.sin(this.t * 14) * 0.06;
      } else d.rot = 0;
      if (k >= 1 && (d.mode === 'move' || d.mode === 'enter')) {
        d.mode = 'idle';
        d.dwell = rand(2.6, 5) / this._speed();
        if (d.spot && !d.spot.open) this.emit('hide', d.spot.hide.label);
      }
    } else if (d.mode === 'tele') {
      d.moveT += dt;
      if (d.moveT < d.moveDur) d.alpha = 0;
      else { d.x = d.tx; d.y = d.ty; d.z = d.tz; d.alpha = 1; d.mode = 'idle'; d.dwell = rand(2.6, 5) / this._speed(); this.vfx.poof(this._devilWorld()); }
    } else if (d.mode === 'idle') {
      const p = this._hidePos(d.spot);
      if (p) { const f = Math.min(1, dt * 6); d.x += (p.x - d.x) * f; d.y += (p.y - d.y) * f; d.z += (p.z - d.z) * f; }
      // chained: he strains against the chains instead of moving on
      if (d.bound > 0) d.rot = Math.sin(this.t * 17) * 0.07;
      else if (d.rot && d.mode === 'idle') d.rot *= Math.max(0, 1 - dt * 10);
      if (this.phase === 'play' && d.dazed <= 0 && d.bound <= 0) {
        d.dwell -= dt;
        if (d.spot && !d.spot.open && d.spot.prop.broken > 0) d.dwell = 0;
        if (d.dwell <= 0) this._goTo(this._pickSpot(), Math.random() < TELEPORT_CHANCE);
      }
      if (Math.abs(d.x) > 0.4 && d.mode === 'idle') d.dir = d.x > 0 ? -1 : 1;
    }

    // behind cover?
    const hp = this._hidePos(d.spot);
    d.behind = !!(!(d.bound > 0) && d.spot && !d.spot.open && !d.spot.prop.broken && hp && Math.hypot(d.x - hp.x, d.y - hp.y, d.z - hp.z) < 1.3 && (d.mode === 'idle' || d.mode === 'move' || d.mode === 'tele') && this.get('devil.hide'));
    d.peek = d.behind ? Math.sin(this.t * 2.2) * 0.14 : 0;

    // face / arms
    if (d.mode === 'flee') { d.face = 'scared'; d.arms = 'up'; }
    else if (d.mode === 'laugh') { d.face = 'laugh'; d.arms = 'belly'; }
    else if (d.dazed > 0) { d.face = 'dazed'; d.arms = 'up'; }
    else if (d.bound > 0) { d.face = d.faceT > 0 ? 'hurt' : 'scared'; d.arms = 'up'; }
    else if (d.faceT > 0) { d.face = 'hurt'; d.arms = 'up'; }
    else if (this.phase === 'countdown') { d.face = 'smirk'; d.arms = 'wave'; }
    else { d.face = 'smirk'; d.arms = d.behind ? 'hips' : (Math.sin(this.t * 0.7) > 0.6 ? 'wave' : 'hips'); }

    const w = this._devilWorld();
    this.devil3d.update({ pos: w, scale: d.scale, rot: d.rot, alpha: d.alpha, dir: d.dir, face: d.face, arms: d.arms, flash: d.flash, hpFrac: this.hp / this.hpMax, t: this.t }, dt);
    // smoke and embers rising from his fiery lower body
    if (d.alpha > 0.5 && d.mode !== 'tele') {
      const k = d.scale;
      const low = { x: w.x, y: w.y - 1.5 * k, z: w.z };
      if (Math.random() < dt * 18) this.vfx.devilSmoke({ x: low.x + rand(-0.3, 0.3) * k, y: low.y + rand(-0.6, 0.4) * k, z: low.z });
      if (Math.random() < dt * 14) this.vfx.ember({ x: low.x + rand(-0.5, 0.5) * k, y: low.y + rand(-0.4, 0.8) * k, z: low.z }, 1);
    }
  }

  /** Where a stone aimed with offset (ox, oy) hits the devil right now (world). */
  _target(p) {
    const d = this.devil;
    const s = d.scale * DEVIL_UNIT;
    return { x: d.x + d.peek + p.ox * s, y: d.y + p.oy * s, z: d.z + 0.35 };
  }

  _updateProjs(dt) {
    const keep = [];
    for (const p of this.projs) {
      if (p.delay > 0) { p.delay -= dt; keep.push(p); continue; }
      if (!p.started) { p.started = true; p.mesh.visible = true; if (p.kind !== 'stone') this.emit('throw', p.kind); }
      p.t += dt;
      const k = clamp(p.t / p.dur, 0, 1);
      const tg = this._target(p);
      const f = p.from;
      const px = p.pos.x; const py = p.pos.y; const pz = p.pos.z;
      if (p.kind === 'rain' || p.kind === 'meteor') {
        const e = p.kind === 'rain' ? k * k : k ** 1.6;
        p.pos.x = f.x + (tg.x - f.x) * e; p.pos.y = f.y + (tg.y - f.y) * e; p.pos.z = f.z + (tg.z - f.z) * e;
        if (p.kind === 'meteor') this.vfx.trail(p.pos, 'meteor');
      } else {
        // quadratic arc: control point above the midpoint
        const u = 1 - k;
        const cx = (f.x + tg.x) / 2; const cy = Math.max(f.y, tg.y) + p.peak; const cz = (f.z + tg.z) / 2;
        p.pos.x = u * u * f.x + 2 * u * k * cx + k * k * tg.x;
        p.pos.y = u * u * f.y + 2 * u * k * cy + k * k * tg.y;
        p.pos.z = u * u * f.z + 2 * u * k * cz + k * k * tg.z;
        if (p.kind === 'boulder') this.vfx.trail(p.pos, 'boulder');
        else if (p.kind === 'stone' && Math.random() < 0.5) this.vfx.trail(p.pos, 'stone');
      }
      p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
      if (p.kind === 'arrow') {
        // arrows point where they fly; the flame rides on the head
        const vx = p.pos.x - px; const vy = p.pos.y - py; const vz = p.pos.z - pz;
        if (vx * vx + vy * vy + vz * vz > 1e-8) p.mesh.lookAt(p.pos.x + vx, p.pos.y + vy, p.pos.z + vz);
        const L = Math.hypot(vx, vy, vz) || 1;
        const head = 0.42 * RADIUS.arrow;
        this.vfx.trail({ x: p.pos.x + (vx / L) * head, y: p.pos.y + (vy / L) * head, z: p.pos.z + (vz / L) * head }, 'arrow');
      } else { p.mesh.rotation.x += p.wx * dt; p.mesh.rotation.y += p.wy * dt; }
      if (k >= 1) this._hit(p);
      else keep.push(p);
    }
    this.projs = keep;
  }

  _hit(p) {
    const d = this.devil;
    this.vfx.releaseRock(p.mesh);
    const at = p.pos;
    const size = p.kind === 'like' ? 0.5 : p.kind === 'rain' ? 0.8 : p.kind === 'stone' ? 1.2 : p.kind === 'boulder' ? 2.2 : 3;
    if (p.kind === 'meteor') this.vfx.explosion(at, 3.4);
    else if (p.kind === 'boulder') this.vfx.explosion(at, 2);
    else if (p.kind === 'like') this.vfx.pebble(at);
    else if (p.kind === 'arrow') this.vfx.arrowHit(at);
    else this.vfx.impact(at, size, 'stone');

    const live = this.phase === 'play' && d.alpha > 0.5;
    if (!live) {
      // a gift's stone still in the air when the round ended is thrown again next round
      if (p.kind !== 'like' && this.phase !== 'play' && this.queue.length < 400) this.queue.push({ user: p.user, replay: p.kind, dmg: p.dmg });
      this.emit('hit', { kind: p.kind, cover: false, live: false });
      return;
    }

    const cover = d.behind && !p.breaks && p.kind !== 'boulder';
    let dmg = p.dmg;
    if (cover) dmg *= clamp(Number(this.get('devil.coverPct')), 0, 100) / 100;
    if ((p.breaks || p.kind === 'boulder') && d.spot && !d.spot.open) {
      // cover shattered: the devil is flushed out and dazed
      const prop = d.spot.prop;
      prop.broken = 6;
      prop.ref.wobble = 1.2;
      this.vfx.impact(prop.at, 2.5, 'stone');
    }
    if (p.kind === 'meteor' || p.kind === 'boulder') {
      d.dazed = p.kind === 'meteor' ? 2.2 : 1.2;
      if (d.mode !== 'idle') { d.mode = 'idle'; d.alpha = 1; }
      d.dwell = 0.01;
    }
    this.hp = Math.max(0, this.hp - dmg);
    // pebbles only tint him a little and leave his face alone; stones make him flinch
    if (p.kind === 'like') d.flash = Math.max(d.flash, cover ? 0.08 : 0.22);
    else { d.flash = cover ? 0.4 : 1; d.faceT = 0.35; }
    if (!cover && p.kind !== 'like' && d.mode === 'idle' && Math.random() < 0.3) d.dwell = Math.min(d.dwell, 0.25);
    if (p.kind === 'stone') this.vfx.shake(0.03);
    // a fire arrow sets him alight: the rest of its damage burns off over the next seconds
    if (p.kind === 'arrow' && p.burn > 0) this._ignite(p.user, p.burn * (cover ? clamp(Number(this.get('devil.coverPct')), 0, 100) / 100 : 1));

    this._credit(p.user, dmg, p.stones);

    if (p.name && this.get('view.names')) {
      const nick = cleanNick(p.user.nick || p.user.name, 16);
      const col = p.kind === 'like' ? '#ffffff' : p.kind === 'meteor' ? '#e6b3ff' : p.kind === 'boulder' ? '#ffb347' : p.kind === 'rain' ? '#8ef3ff' : p.kind === 'arrow' ? '#ff9a4a' : '#ffd34d';
      const size = p.kind === 'like' ? 0 : p.kind === 'meteor' || p.kind === 'boulder' ? 2 : 1;
      const s = toScreen(at.x, at.y, at.z);
      const shown = p.kind === 'arrow' ? p.total : dmg;
      this.overlay.popup(s.x, s.y, cover && p.kind !== 'like' ? `${nick} · SİPER` : nick, p.kind === 'like' || p.kind === 'rain' ? 0 : shown, size, col);
    }
    this.emit('hit', { kind: p.kind, cover, live: true, dmg });
    if (this.hp <= 0) this.win();
  }

  /** Adds damage to a viewer's line on the round board. */
  _credit(user, dmg, stones = 0) {
    const key = user.name || user.id || '?';
    let b = this.board.get(key);
    if (!b) { b = { key, user, dmg: 0, stones: 0 }; this.board.set(key, b); }
    b.user = user; b.dmg += dmg; b.stones += stones;
  }

  /** Damage that is not a projectile (burn, chains, dragon fire). Returns false outside play. */
  /** flash: how much the hit tints him (continuous damage like burn and dragon fire keeps it low). */
  _direct(user, dmg, { flinch = true, stones = 0, flash = 0.7 } = {}) {
    const d = this.devil;
    if (this.phase !== 'play' || d.alpha <= 0.5 || dmg <= 0) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this._credit(user, dmg, stones);
    d.flash = Math.max(d.flash, flash);
    if (flinch) d.faceT = Math.max(d.faceT, 0.25);
    if (this.hp <= 0) this.win();
    return true;
  }

  // -------------------------------------------------------------------------- burn, chains, dragon

  _ignite(user, dmg) {
    const b = this.burns.find((x) => x.user === user || x.user.name === user.name);
    if (b) { b.left += dmg; b.t = Math.max(b.t, BURN_SEC); b.dps = b.left / b.t; }
    else this.burns.push({ user, left: dmg, t: BURN_SEC, dps: dmg / BURN_SEC });
  }

  _updateBurns(dt) {
    if (!this.burns.length) return;
    const w = this._devilWorld();
    const s = this.devil.scale;
    const keep = [];
    for (const b of this.burns) {
      const step = Math.min(b.left, b.dps * dt);
      b.left -= step; b.t -= dt;
      this._direct(b.user, step, { flinch: false, flash: 0 });
      if (b.t > 0 && b.left > 0.01 && this.phase === 'play') keep.push(b);
    }
    this.burns = keep;
    // flames licking up his body while he burns
    if (keep.length && this.devil.alpha > 0.5) this.vfx.burnOn(w, s, dt);
  }

  // -------------------------------------------------------------------------- catapults

  _spawnCatapult(user, dmg, shots) {
    const model = makeCatapult();
    // where machines stand comes from the world's layout (sakura: they roll up from the bottom of the
    // screen to behind the crowd); the Ottoman courtyard rolls them in from the left
    const L = this.world.layout?.catapult || { home: [{ x: -4.4, z: 2.2 }, { x: -3.7, z: 2.2 }], from: { dx: -4.6 }, rotY: 0.12 };
    const used = new Set(this.catapults.map((c) => c.slot));
    const slot = used.has(0) && !used.has(1) ? 1 : 0;
    const home = L.home[slot % L.home.length];
    const from = { x: home.x + (L.from.dx || 0), z: home.z + (L.from.dz || 0) };
    model.group.position.set(from.x, 0, from.z);
    model.group.scale.setScalar(L.scale || 0.95);
    // the model faces +X; rotY turns it towards the devil
    model.group.rotation.y = L.rotY;
    this.world.scene.add(model.group);
    this.catapults.push({ user, model, slot, x: from.x, z: from.z, home, from, t: 0, shots, fired: 0, firedPrev: 0, dmg: dmg / shots, state: 'in' });
  }

  _updateCatapults(dt) {
    const keep = [];
    for (const c of this.catapults) {
      c.t += dt;
      const arm = c.model.arm;
      if (c.state === 'in') {
        const f = Math.min(1, dt * 3);
        c.x += (c.home.x - c.x) * f; c.z += (c.home.z - c.z) * f;
        if (Math.random() < dt * 10) this.vfx.dust({ x: c.x, z: c.z + 0.6 }, 1);
        if (Math.hypot(c.x - c.home.x, c.z - c.home.z) < 0.03) { c.state = 'aim'; c.t = 0; this.vfx.dust({ x: c.x, z: c.z }, 8); }
      } else if (c.state === 'aim') {
        arm.rotation.z = 0.35;
        if (c.t > 0.5) { c.state = 'fire'; c.t = 0; this.emit('catapultFire'); }
      } else if (c.state === 'fire') {
        const k = Math.min(1, c.t / 0.22);
        arm.rotation.z = 0.35 - 1.8 * k;
        if (k >= 1 && c.fired === c.firedPrev) {
          c.fired++;
          const cup = c.model.cup.getWorldPosition(new Vector3());
          const p = this._proj(c.user, 'boulder', c.dmg, { from: { x: cup.x, y: cup.y, z: cup.z }, dur: 1.05, peak: 3.2, name: true, stones: 1 });
          p.started = true; p.mesh.visible = true;
          this.projs.push(p);
          this.vfx.puff(cup, 4, { color: [0.3, 0.22, 0.18], size: 0.3, grow: 2.5, life: 0.6, speed: 1, alpha: 0.5 });
          this.emit('throw', 'boulder');
        }
        if (c.t > 0.6) {
          c.firedPrev = c.fired;
          c.state = c.fired >= c.shots ? 'out' : 'reload';
          c.t = 0;
        }
      } else if (c.state === 'reload') {
        arm.rotation.z = -1.45 + 1.8 * Math.min(1, c.t / 0.6);
        if (c.t > 0.75) { c.state = 'fire'; c.t = 0; this.emit('catapultFire'); }
      } else if (c.state === 'out') {
        // roll back out the way it came
        const dx = c.from.x - c.home.x; const dz = c.from.z - c.home.z; const len = Math.hypot(dx, dz) || 1;
        c.x += (dx / len) * dt * 6; c.z += (dz / len) * dt * 6;
        if ((c.x - c.home.x) * dx + (c.z - c.home.z) * dz > len * len) { this.world.scene.remove(c.model.group); continue; }
      }
      c.model.group.position.set(c.x, 0, c.z);
      keep.push(c);
    }
    this.catapults = keep;
  }

  // -------------------------------------------------------------------------- draw

  /** 3D frame. */
  render() { this.world.render(); }

  /** 2D layer over the 3D view, in design pixels: tints, vignette, grain, names, popups. */
  drawOverlay(g) {
    g.clearRect(0, 0, W, H);
    if (this.meteorDark > 0) { g.fillStyle = `rgba(0,4,20,${this.meteorDark * 0.35})`; g.fillRect(0, 0, W, H); }
    if (this.dragonGlow > 0.01) { g.fillStyle = `rgba(255,90,20,${this.dragonGlow * 0.12})`; g.fillRect(0, 0, W, H); }
    if (this.laughTint > 0.01) { g.fillStyle = `rgba(140,14,8,${this.laughTint * 0.22})`; g.fillRect(0, 0, W, H); }
    this.overlay.draw(g, W, H, this.get('view.names') ? this.throwers.labels() : []);
  }

  // -------------------------------------------------------------------------- HUD data

  statusText() {
    const d = this.devil;
    if (this.phase === 'countdown') return 'Şeytan harabelere döndü…';
    if (this.phase === 'win') return 'Şeytan kaçtı!';
    if (this.phase === 'lose') return 'Şeytan kahkahalarla gülüyor';
    if (this.dragonNow && this.powers.dragonBusy) return 'Ejderha geldi!';
    if (d.bound > 0) return 'Zincirde! Her taş tam işliyor';
    if (this.burns.length) return 'Şeytan yanıyor!';
    if (d.dazed > 0) return 'Şeytan sersemledi!';
    if (this.timeLeft <= 15) return `Son ${Math.ceil(this.timeLeft)} saniye`;
    if (this.hp / this.hpMax < 0.2) return 'Şeytan zor durumda!';
    if (d.behind && d.spot?.hide) return `Şeytan ${d.spot.hide.label} saklandı`;
    if (d.mode === 'tele') return 'Şeytan ışınlandı!';
    return 'Şeytan açıkta';
  }

  hud() {
    return {
      round: this.round,
      phase: this.phase,
      timeLeft: this.phase === 'countdown' ? this.roundSec : this.timeLeft,
      hp: this.hp,
      hpMax: this.hpMax,
      wins: this.session.wins,
      losses: this.session.losses,
      status: this.statusText(),
      top: this.topList(3),
      count: this.phase === 'countdown' ? Math.ceil(this.phaseT) : 0,
    };
  }
}

function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    return { wins: s.wins | 0, losses: s.losses | 0, hpScale: Number.isFinite(s.hpScale) && s.hpScale >= 1 ? s.hpScale : 1 };
  } catch { return { wins: 0, losses: 0, hpScale: 1 }; }
}
function saveSession(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* private mode */ } }

export { fmt };
