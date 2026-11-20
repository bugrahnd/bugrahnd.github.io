// Game core of Halat Çekme: teams, rope physics, gift tiers, round flow on wall-clock time
// and the event API the overlay and the 3D scene listen to.
//
// Rope convention: state.rope in [-1, 1]. Team 1 (teams[0]) pulls toward -1 and stands on
// the LEFT; team 2 pulls toward +1 and stands on the RIGHT. rope <= -1 means team 2 was
// dragged into the pit (team 1 wins); rope >= 1 means team 2 wins.
import { DEFAULT_CONFIG } from './defaults.js';
import { applyFlatSettings } from './settings-map.js';
import { normalizeText, cleanNick, splitEmoji, safeImageUrl, deepMerge, clone, clamp } from './util.js';

const WINS_KEY = 'halat.sessionWins.v1';
const TICK_MS = 100;
const PHASES = ['lobby', 'countdown', 'play', 'ending', 'result'];

export function createGame(config) {
  return new HalatGame(config);
}

/** Replace all keys of `target` with those of `src` (keeps the object identity). */
function replaceContents(target, src) {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, src);
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

class HalatGame {
  constructor(config) {
    // The config object is shared with main/scene: fill missing defaults in place.
    this.config = config || {};
    replaceContents(this.config, deepMerge(clone(DEFAULT_CONFIG), this.config));
    this.baseConfig = clone(this.config);
    this.handlers = new Map();
    this.players = new Map(); // key (user.name) -> record { key, player, teamId, roundCoins, nextCoins, totalCoins, joinedAt, lastChat }
    this.teamMembers = new Map(); // teamId -> [record] in join order
    this.held = new Map(); // key -> { user, gifts: [evt] }
    this.effects = []; // active and deferred forces (gifts, optional engagement)
    this.giftCatalog = [];
    this.lastMode = null;
    this._effectId = 1;
    this._lastNow = null;
    this._lastTick = 0;
    this._lastCount = -1;
    this.stats = { events: 0, gifts: 0, joins: 0 };
    const wins = this._loadWins();
    this.state = {
      phase: 'lobby',
      round: 1,
      timeLeft: 0,
      duration: this.config.round.durationSec,
      rope: 0,
      ropeVel: 0, // extra: rope units per second (scene uses it for intensity)
      waiting: false, // extra: lobby is waiting for round.minMembers joins
      teams: this.config.teams.slice(0, 2).map((t, i) => ({
        id: i + 1,
        name: t.name,
        color: t.color,
        members: 0,
        force: 0,
        giftForce: 0,
        memberForce: 0, // extra
        sessionWins: wins[i + 1] || 0,
        captain: null,
        top: [],
      })),
      winner: null,
      mode: 'sim',
      connected: false,
    };
    for (const t of this.state.teams) this.teamMembers.set(t.id, []);
    this._phaseEnd = 0;
    this._enterPhase('lobby', performance.now());
  }

  // ---------------------------------------------------------------- events

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    this.handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (e) { console.error(`[halat] ${type} handler`, e); }
    }
  }

  // ---------------------------------------------------------------- public helpers

  team(teamId) { return this.state.teams.find((t) => t.id === teamId) || null; }
  members(teamId) { return this.teamMembers.get(teamId) || []; }
  get totalMembers() { return this.state.teams[0].members + this.state.teams[1].members; }

  setMode(mode) { this.state.mode = mode; }
  setConnected(ok) { this.state.connected = !!ok; }

  // ---------------------------------------------------------------- bridge input

  handleEvent(evt) {
    if (!evt || typeof evt.type !== 'string') return;
    this.stats.events++;
    switch (evt.type) {
      case 'chat': this._chat(evt); break;
      case 'gift': this._gift(evt); break;
      case 'like': this._like(evt); break;
      case 'follow': this._bonus(evt, this.config.force.followForce); break;
      case 'share': this._bonus(evt, this.config.force.shareForce); break;
      case 'status': this._status(evt); break;
      case 'settings': this.applySettings(evt.values || {}); break;
      case 'command':
        if (evt.game && evt.game !== 'halat') break; // another game's command
        console.info(`[halat] komut: ${String(evt.name || '')}`);
        this.command(String(evt.name || ''));
        break;
      case 'gifts':
        this.giftCatalog = Array.isArray(evt.items) ? evt.items : [];
        this.emit('gifts', { items: this.giftCatalog });
        break;
      default: break; // join (entered the stream) and unknown types: nothing
    }
  }

  _status(evt) {
    if (evt.mode === 'sim' || evt.mode === 'live') {
      // Simulator <-> live switch: fake teams must never stay on a real stream.
      if (this.lastMode && evt.mode !== this.lastMode) {
        console.info(`[halat] kaynak değişti (${this.lastMode} → ${evt.mode}): takımlar temizlendi`);
        this.command('clearTeams');
      }
      this.lastMode = evt.mode;
      if (this.state.mode !== 'demo') this.state.mode = evt.mode;
    }
    // evt.connected is the TikTok / simulator source; the page's own link to the bridge is
    // state.connected (setConnected), shown as "Köprü bekleniyor…" when down.
    if (typeof evt.connected === 'boolean') this.state.source = evt.connected;
  }

  _userKey(user) {
    if (!user || typeof user !== 'object') return '';
    return String(user.name || user.id || '').slice(0, 64);
  }

  _makePlayer(user, teamId, emoji = '') {
    const name = String(user.name || user.id || '?').slice(0, 64);
    return {
      id: String(user.id || name).slice(0, 64),
      name,
      nick: cleanNick(user.nick || user.name || '?'),
      avatar: safeImageUrl(user.avatar),
      emoji,
      teamId,
    };
  }

  /** Team id for a join text, or 0. */
  _joinTeam(text) {
    if (typeof text !== 'string') return { teamId: 0, emoji: '' };
    const { emoji, rest } = splitEmoji(text);
    if (emoji && !this.config.join.allowEmojiSuffix) return { teamId: 0, emoji: '' };
    const norm = normalizeText(emoji ? rest : text);
    if (!norm) return { teamId: 0, emoji: '' };
    const cfgTeams = this.config.teams;
    for (let i = 0; i < 2; i++) {
      const id = i + 1;
      if (norm === String(id)) return { teamId: id, emoji };
      const t = cfgTeams[i] || {};
      const words = [t.key, t.name, ...(Array.isArray(t.words) ? t.words : [])];
      for (const w of words) if (w && normalizeText(String(w)) === norm) return { teamId: id, emoji };
    }
    return { teamId: 0, emoji: '' };
  }

  _chat(evt) {
    const key = this._userKey(evt.user);
    if (!key) return;
    const { teamId, emoji } = this._joinTeam(evt.text);
    const rec = this.players.get(key);
    if (teamId) {
      if (!rec || !rec.teamId) { this._join(evt.user, teamId, emoji); return; }
      if (rec.teamId === teamId) {
        // Re-sent join: refresh name/avatar/badge, nothing else.
        this._refreshPlayer(rec, evt.user, emoji);
        return;
      }
      return; // membership lasts the session: switching is ignored
    }
    // Optional chat force (off by default).
    const f = this.config.force;
    if (rec && rec.teamId && f.chatForce > 0 && this.state.phase === 'play') {
      const now = performance.now();
      if (now - (rec.lastChat || -1e9) >= f.chatCooldownSec * 1000) {
        rec.lastChat = now;
        this._engage(rec.teamId, f.chatForce, f.chatForceSec, rec.player);
      }
    }
  }

  _refreshPlayer(rec, user, emoji) {
    const p = rec.player;
    p.nick = cleanNick(user.nick || user.name || p.nick);
    const av = safeImageUrl(user.avatar);
    if (av) p.avatar = av;
    if (emoji) p.emoji = emoji;
  }

  _join(user, teamId, emoji) {
    const key = this._userKey(user);
    let rec = this.players.get(key);
    if (!rec) {
      rec = { key, player: this._makePlayer(user, teamId, emoji), teamId, roundCoins: 0, nextCoins: 0, totalCoins: 0, joinedAt: performance.now(), lastChat: 0 };
      this.players.set(key, rec);
    } else {
      rec.teamId = teamId;
      rec.player.teamId = teamId;
      rec.joinedAt = performance.now();
      this._refreshPlayer(rec, user, emoji);
    }
    this.teamMembers.get(teamId).push(rec);
    this.team(teamId).members++;
    this.stats.joins++;
    this.emit('join', { player: rec.player, teamId });
    // Gifts sent before joining are applied now.
    const h = this.held.get(key);
    if (h) {
      this.held.delete(key);
      for (const g of h.gifts) this._applyGift(rec, g, true);
    }
  }

  _gift(evt) {
    const key = this._userKey(evt.user);
    if (!key) return;
    const coins = Math.max(0, num(evt.coins));
    const count = Math.max(1, Math.floor(num(evt.count, 1)));
    if (coins <= 0) return;
    const g = {
      coins,
      count,
      total: Math.max(coins, num(evt.total, coins * count)),
      giftId: num(evt.giftId),
      giftName: String(evt.giftName || '').slice(0, 40),
      icon: safeImageUrl(evt.icon),
    };
    this.stats.gifts++;
    const rec = this.players.get(key);
    if (!rec || !rec.teamId) {
      // Held until the viewer joins a team.
      let h = this.held.get(key);
      if (!h) {
        if (this.held.size >= this.config.gifts.heldMaxViewers) {
          const oldest = this.held.keys().next().value;
          this.held.delete(oldest);
        }
        h = { user: evt.user, gifts: [] };
        this.held.set(key, h);
      }
      if (h.gifts.length < this.config.gifts.heldMaxGifts) h.gifts.push(g);
      else h.gifts[h.gifts.length - 1].count += g.count; // merge overflow into the last one
      this.emit('heldGift', { player: this._makePlayer(evt.user, null), coins: g.total });
      return;
    }
    this._applyGift(rec, g, false);
  }

  tierFor(coins) {
    const tiers = this.config.gifts.tiers;
    let best = null;
    for (const t of tiers) if (coins >= t.min && (!best || t.min > best.min)) best = t;
    return best;
  }

  _applyGift(rec, g, held) {
    const tier = this.tierFor(g.coins);
    if (!tier) return;
    const cfg = this.config.gifts;
    const scale = Math.min(cfg.tierScaleMax, Math.pow(g.coins / tier.min, cfg.tierScaleExp));
    const units = tier.units || 1;
    const force = tier.force * scale * g.count * units;
    const total = g.coins * g.count;
    const deferred = this.state.phase !== 'play';
    if (this.state.phase === 'ending' || this.state.phase === 'result') rec.nextCoins += total;
    else rec.roundCoins += total;
    rec.totalCoins += total;
    const teamId = rec.teamId;
    const now = performance.now();
    let eff = null;
    if (tier.kind === 'tug') {
      // Merge rapid tugs of one viewer into one effect (rose streaks).
      eff = this.effects.find((e) => e.kind === 'tug' && e.player === rec.player && !e.deferred === !deferred && (deferred || e.until > now));
      if (eff) {
        eff.force += force;
        eff.coins += total;
        if (!deferred) eff.until = Math.max(eff.until, now + tier.sec * 1000);
        eff.pulses++;
      }
    }
    if (!eff) {
      eff = {
        id: this._effectId++,
        teamId,
        kind: tier.kind,
        tierId: tier.id,
        label: tier.label,
        force,
        sec: tier.sec,
        coins: total,
        units: tier.kind === 'helper' ? Math.min(g.count, cfg.maxHelpersPerGift) : units,
        size: tier.size || 1,
        player: rec.player,
        start: deferred ? 0 : now,
        until: deferred ? 0 : now + tier.sec * 1000,
        deferred,
        gift: true,
        pulses: 1,
      };
      this.effects.push(eff);
      this.emit('effect', { effect: eff });
    }
    this.emit('gift', {
      player: rec.player, teamId, coins: g.coins, count: g.count, total, giftId: g.giftId, giftName: g.giftName,
      icon: g.icon, tier: { id: tier.id, label: tier.label }, force, held,
    });
    if (tier.kind === 'strongman' || tier.kind === 'tractor' || tier.kind === 'giant') {
      this.emit('special', { kind: tier.kind, teamId, player: rec.player });
    }
    this._updateLeaders(teamId);
  }

  _engage(teamId, force, sec, player) {
    const now = performance.now();
    const eff = { id: this._effectId++, teamId, kind: 'engage', tierId: 'engage', label: '', force, sec, coins: 0, units: 0, size: 1, player, start: now, until: now + sec * 1000, deferred: false, gift: false, pulses: 1 };
    this.effects.push(eff);
  }

  _like(evt) {
    const key = this._userKey(evt.user);
    if (!key) return;
    const count = Math.max(1, Math.floor(num(evt.count, 1)));
    const rec = this.players.get(key);
    if (rec && rec.teamId) {
      this.emit('like', { player: rec.player, teamId: rec.teamId, count });
      const f = this.config.force;
      if (f.likeForce > 0 && this.state.phase === 'play') this._engage(rec.teamId, f.likeForce * count, f.likeForceSec, rec.player);
    } else {
      this.emit('like', { player: this._makePlayer(evt.user, null), teamId: null, count });
    }
  }

  _bonus(evt, force) {
    if (!(force > 0) || this.state.phase !== 'play') return;
    const rec = this.players.get(this._userKey(evt.user));
    if (rec && rec.teamId) this._engage(rec.teamId, force, this.config.force.bonusSec, rec.player);
  }

  // ---------------------------------------------------------------- leaders

  _updateLeaders(teamId) {
    const team = this.team(teamId);
    const list = this.teamMembers.get(teamId);
    const top = [];
    for (const r of list) {
      if (r.roundCoins <= 0) continue;
      if (top.length < 3) { top.push(r); top.sort((a, b) => b.roundCoins - a.roundCoins); continue; }
      if (r.roundCoins > top[2].roundCoins) { top[2] = r; top.sort((a, b) => b.roundCoins - a.roundCoins); }
    }
    team.top = top.map((r) => ({ id: r.player.id, nick: r.player.nick, avatar: r.player.avatar, coins: r.roundCoins }));
    const cap = top[0] || null;
    const prevId = team.captain ? team.captain.id : null;
    team.captain = cap ? { id: cap.player.id, name: cap.player.name, nick: cap.player.nick, avatar: cap.player.avatar, coins: cap.roundCoins } : null;
    if ((cap ? cap.player.id : null) !== prevId) {
      this.captainRec = this.captainRec || {};
      this.captainRec[teamId] = cap;
      this.emit('captain', { teamId, player: cap ? cap.player : null });
    }
  }

  /** Internal record of a team's captain (scene). */
  captainOf(teamId) {
    return (this.captainRec && this.captainRec[teamId]) || null;
  }

  // ---------------------------------------------------------------- settings & commands

  /**
   * Streamer settings: the full set of effective flat values (js/settings-map.js keys plus the
   * stream-wide layout.* / audio.*), applied on top of the base config every time.
   */
  applySettings(values) {
    const v = values && typeof values === 'object' ? values : {};
    const plain = {};
    const flat = {};
    for (const [k, val] of Object.entries(v)) {
      if (val && typeof val === 'object' && !Array.isArray(val) && !k.includes('.')) plain[k] = val; // nested objects
      else flat[k] = val;
    }
    const next = applyFlatSettings(deepMerge(clone(this.baseConfig), plain), flat);
    replaceContents(this.config, next);
    this.config.teams.slice(0, 2).forEach((t, i) => {
      const st = this.state.teams[i];
      st.name = String(t.name || st.name);
      st.color = String(t.color || st.color);
    });
    if (this.state.phase !== 'play') this.state.duration = this.config.round.durationSec;
    this.emit('settings', { values: v });
  }

  command(name) {
    const now = performance.now();
    if (name === 'restartRound') this._newRound(now, true);
    else if (name === 'endRound') { if (this.state.phase === 'play' || this.state.phase === 'countdown') this._finish('time', now); }
    else if (name === 'resetSession') {
      for (const t of this.state.teams) t.sessionWins = 0;
      this._saveWins();
      this.emit('session', { teams: this.state.teams.map((t) => ({ id: t.id, sessionWins: 0 })) });
    } else if (name === 'clearTeams' || name === 'clearMap') {
      this._clearTeams();
      this._newRound(now, true);
    }
  }

  _clearTeams() {
    this.players.clear();
    this.held.clear();
    for (const t of this.state.teams) {
      this.teamMembers.set(t.id, []);
      t.members = 0; t.captain = null; t.top = [];
    }
    this.captainRec = {};
    this._expireAll();
    this.emit('clear', {});
  }

  // ---------------------------------------------------------------- session wins

  _loadWins() {
    try {
      const o = JSON.parse(localStorage.getItem(WINS_KEY) || '{}');
      return { 1: num(o[1]), 2: num(o[2]) };
    } catch { return { 1: 0, 2: 0 }; }
  }

  _saveWins() {
    try {
      localStorage.setItem(WINS_KEY, JSON.stringify({ 1: this.state.teams[0].sessionWins, 2: this.state.teams[1].sessionWins }));
    } catch { /* storage blocked */ }
  }

  // ---------------------------------------------------------------- round flow

  _enterPhase(phase, now) {
    const r = this.config.round;
    const s = this.state;
    s.phase = phase;
    if (phase === 'lobby') this._phaseEnd = now + r.lobbySec * 1000;
    else if (phase === 'countdown') { this._phaseEnd = now + r.countdownSec * 1000; this._lastCount = -1; }
    else if (phase === 'play') {
      s.duration = r.durationSec;
      this._phaseEnd = now + r.durationSec * 1000;
      this.playStart = now;
      // Gifts sent before the start begin now.
      for (const e of this.effects) {
        if (e.deferred) { e.deferred = false; e.start = now; e.until = now + e.sec * 1000; }
      }
    } else if (phase === 'ending') this._phaseEnd = now + (s.winner && s.winner.by === 'pit' ? r.endingPitSec : r.endingTimeSec) * 1000;
    else if (phase === 'result') this._phaseEnd = now + r.resultSec * 1000;
    s.timeLeft = Math.max(0, (this._phaseEnd - now) / 1000);
    this.emit('phase', { phase, round: s.round });
  }

  _newRound(now, immediate = false) {
    const s = this.state;
    s.round++;
    s.winner = null;
    s.ropeVel = 0;
    // Active effects end with the round (figures walk off); deferred ones carry over.
    this._expireAll(true);
    if (this.config.join.resetEachRound) {
      const keepHeld = this.held;
      this._clearTeams();
      this.held = keepHeld;
    }
    for (const r of this.players.values()) { r.roundCoins = r.nextCoins; r.nextCoins = 0; }
    for (const t of s.teams) this._updateLeaders(t.id);
    this._enterPhase('lobby', now);
    if (immediate) s.rope = s.rope; // rope eases back to 0 during the lobby
  }

  _expireAll(keepDeferred = false) {
    const keep = [];
    for (const e of this.effects) {
      if (keepDeferred && e.deferred) keep.push(e);
      else this.emit('expire', { effect: e });
    }
    this.effects = keep;
  }

  _finish(by, now) {
    const s = this.state;
    if (s.phase === 'ending' || s.phase === 'result') return;
    let teamId = null;
    if (by === 'pit') teamId = s.rope <= -1 ? 1 : 2;
    else if (s.rope < -this.config.round.drawEpsilon) teamId = 1;
    else if (s.rope > this.config.round.drawEpsilon) teamId = 2;
    s.winner = teamId ? { teamId, by } : { teamId: null, by: 'time', draw: true };
    if (teamId) {
      this.team(teamId).sessionWins++;
      this._saveWins();
    }
    s.ropeVel = 0;
    this._enterPhase('ending', now);
    this.emit('win', { teamId, by: s.winner.by, draw: !teamId });
  }

  // ---------------------------------------------------------------- frame update

  update(now) {
    if (!Number.isFinite(now)) now = performance.now();
    if (this._lastNow === null) this._lastNow = now;
    let dt = (now - this._lastNow) / 1000;
    this._lastNow = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 30); // a very long stall: do not simulate forever

    // Physics in small steps (long gaps after a hidden tab stay stable).
    const steps = Math.min(600, Math.ceil(dt / 0.05));
    const h = steps ? dt / steps : 0;
    for (let i = 0; i < steps; i++) {
      const t = now - (steps - 1 - i) * h * 1000;
      this._physics(h, t);
      if (this.state.phase === 'play' && Math.abs(this.state.rope) >= 1) break;
    }
    if (!steps) this._forces(now);
    this._phaseStep(now);

    if (now - this._lastTick >= TICK_MS) {
      this._lastTick = now;
      this.emit('tick', { state: this.state });
    }
  }

  _forces(now) {
    const f = this.config.force;
    for (const t of this.state.teams) {
      t.memberForce = f.perMember * Math.pow(t.members, f.memberExponent);
      t.giftForce = 0;
      t._engage = 0;
    }
    let expired = false;
    for (const e of this.effects) {
      if (e.deferred) continue;
      if (e.until <= now) { expired = true; continue; }
      if (e.start > now) continue;
      const t = e.teamId === 1 ? this.state.teams[0] : this.state.teams[1];
      if (e.gift) t.giftForce += e.force; else t._engage += e.force;
    }
    if (expired) {
      const keep = [];
      for (const e of this.effects) {
        if (!e.deferred && e.until <= now) this.emit('expire', { effect: e });
        else keep.push(e);
      }
      this.effects = keep;
    }
    for (const t of this.state.teams) t.force = t.memberForce + t.giftForce + t._engage;
  }

  _physics(dt, now) {
    const s = this.state;
    this._forces(now);
    if (s.phase === 'play') {
      const f = this.config.force;
      const [a, b] = s.teams;
      const target = -f.ropeMaxSpeed * (a.force - b.force) / (a.force + b.force + f.neutral);
      s.ropeVel += (target - s.ropeVel) * (1 - Math.exp(-dt / Math.max(0.05, f.inertiaSec)));
      s.rope = clamp(s.rope + s.ropeVel * dt, -1, 1);
    } else if (s.phase === 'lobby' || s.phase === 'countdown') {
      s.rope += (0 - s.rope) * (1 - Math.exp(-dt * 1.6));
      if (Math.abs(s.rope) < 1e-4) s.rope = 0;
      s.ropeVel = 0;
    } else {
      s.ropeVel = 0;
    }
  }

  _phaseStep(now) {
    const s = this.state;
    const r = this.config.round;
    s.timeLeft = Math.max(0, (this._phaseEnd - now) / 1000);
    switch (s.phase) {
      case 'lobby': {
        s.waiting = this.totalMembers < r.minMembers;
        if (s.waiting) {
          this._phaseEnd = Math.max(this._phaseEnd, now + Math.min(r.lobbySec, 3) * 1000);
          s.timeLeft = (this._phaseEnd - now) / 1000;
        } else if (now >= this._phaseEnd) this._enterPhase('countdown', now);
        break;
      }
      case 'countdown': {
        const n = Math.ceil((this._phaseEnd - now) / 1000);
        if (now >= this._phaseEnd) {
          this._enterPhase('play', now);
          this.emit('countdown', { n: 0 });
        } else if (n !== this._lastCount && n > 0) {
          this._lastCount = n;
          this.emit('countdown', { n });
        }
        break;
      }
      case 'play':
        if (s.rope <= -1 || s.rope >= 1) this._finish('pit', now);
        else if (now >= this._phaseEnd) this._finish('time', now);
        break;
      case 'ending':
        if (now >= this._phaseEnd) this._enterPhase('result', now);
        break;
      case 'result':
        if (now >= this._phaseEnd) this._newRound(now);
        break;
      default:
        if (!PHASES.includes(s.phase)) this._enterPhase('lobby', now);
    }
  }
}
