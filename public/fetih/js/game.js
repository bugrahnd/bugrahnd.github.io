// Game rules: teams, membership, troops, gifts, morale, war AI, rebellion, rounds.
// Presentation goes through `view` (map, effects, labels, hud, audio, camera).
import { normalizeText, acc, gen, dat, loc, cleanNick, safeImageUrl, fmt, fmtShort, rand, clamp, pointInProvince, splitEmoji, badgeText, firstEmoteUrl } from './util.js';
import { layoutFigures } from './units.js';

/** "İzmir'desin", "Ankara'dasın", "Muş'tasın" (locative + 2nd person singular). */
const youAreIn = (name) => { const l = loc(name); return l + (l.endsWith('a') ? 'sın' : 'sin'); };
import { TILE_H, wzOf } from './map.js';
import { provCode } from './labels.js';
import { NEUTRAL_HEX, hexCss } from './colors.js';

const ATTACK_WORDS = new Set(['saldir', 'saldirin', 'saldiri', 'hedef', 'hucum', 'attack']);

export class Game {
  constructor({ provinces, aliases, colors, config, view }) {
    this.cfg = config;
    this.view = view;
    this.provList = provinces;
    this.colors = colors;
    this.aliases = new Map();
    for (const [k, v] of Object.entries(aliases)) this.aliases.set(normalizeText(k), v);
    for (const p of provinces) this.aliases.set(normalizeText(p.name), p.plate);
    this.prov = new Map();
    for (const p of provinces) {
      this.prov.set(p.plate, {
        p, plate: p.plate, owner: 0, garrison: 0, burnT: 0, burnFx: 0,
        wx: p.labelPoint[0], wz: wzOf(p.labelPoint[1]),
        sea: new Set(Array.isArray(p.seaNeighbors) ? p.seaNeighbors : []),
      });
    }
    // Adjacency for attacks: land neighbours plus sea crossings (both directions).
    for (const pv of this.prov.values()) {
      for (const n of pv.sea) { const o = this.prov.get(n); if (o) o.sea.add(pv.plate); else pv.sea.delete(n); }
    }
    for (const pv of this.prov.values()) pv.adj = [...new Set([...pv.p.neighbors, ...pv.sea])].filter((n) => this.prov.has(n));
    this.teams = new Map();
    for (const p of provinces) {
      this.teams.set(p.plate, {
        plate: p.plate, name: p.name, colorHex: colors.get(p.plate), memberCount: 0, awake: false,
        provinces: 0, garrisonSum: 0, morale: 0, hucumUntil: 0, nextAttackAt: 0, nextRebalanceAt: 0,
        nextRebelAt: 0, rebelPool: 0, coins: 0, commander: null, voters: new Map(), voteTarget: 0,
        lastVoteFeed: -1e9, lastHeartFx: 0, lastGiftArmy: null, target: 0, rally: 0, lastTargetFeed: 0,
      });
    }
    this.players = new Map();
    this.pending = new Map();
    this.emojiHintAt = new Map();
    this.barePlate = new Map(); // name -> { plate, t }: bare plate waiting for an emoji
    this.lastEmojiHint = -1e9;
    this.lastJoinTag = -1e9;
    this.lastCaptureCall = -1e9;
    this.lastSmallTag = -1e9;
    this.rivals = new Map(); // "a|b" -> { a, b, heat, x, z, t }
    this.drama = { leader: 0, lastLeaderCall: -1e9, lastRivalCall: -1e9, said60: false, said30: false, lastCount: -1 };
    this.armies = [];
    this.sieges = [];
    this.projectiles = [];
    this.deferred = [];
    this.time = 0;
    this.liveFigures = 0;
    this.round = { n: 0, phase: 'play', left: 0, duration: 0, endLeft: 0, winner: null, lastTick: -1, battleMusic: false };
    this.stats = { events: 0, gifts: 0, coins: 0 };
    this.nextArmyId = 1;
    this.passiveAcc = 0;
    this.likeAcc = 0; this.likeRate = 0; // likes per second (smoothed), scales the morale need
    this.likeBatches = new Set(); // players with a like floater waiting (engage.likeBatchSec)
    this.likePops = new Map(); // name -> pending like name pop
    this.freeCapQueue = []; this.lastFreeCapNudge = -1e9; // "bedava hakkın doldu" notes
    this.lastLikePop = -1e9; this.lastLikeCredit = -1e9; this.lastLikeHint = -1e9;
    this.labelTimer = 0;
    this.leadProvinces = 0;
    this.session = this.loadSession();
    this.startRound(true);
  }

  // ---------- helpers ----------

  team(plate) { return this.teams.get(plate); }
  codeOf(plate) { return provCode(this.prov.get(plate).p); }
  nameOf(plate) { return this.prov.get(plate).p.name; }
  ownerColor(owner) { return owner ? this.teams.get(owner).colorHex : NEUTRAL_HEX; }
  isHucum(team) { return team.hucumUntil > this.time; }
  /** Likes needed for HÜCUM: grows with team size and with the stream-wide like rate. */
  moraleNeed(team) {
    const m = this.cfg.morale;
    const rateK = Math.pow(Math.max(1, this.likeRate / (m.likeRateRef ?? 20)), m.likeRateExp ?? 0.6);
    return (m.needBase + m.needPerMember * team.memberCount) * rateK;
  }

  defenseMult(pv) {
    let m = this.cfg.war.defenderBonus;
    if (pv.owner && pv.owner === pv.plate) m *= this.cfg.war.capitalBonus;
    if (this.isFresh(pv)) m *= this.cfg.war.freshDefenseMult ?? 1;
    return m;
  }

  /** Captured only a moment ago: shielded so the map changes at a readable pace. */
  isFresh(pv) {
    return pv.owner !== 0 && this.time - (pv.capturedAt ?? -1e9) < (this.cfg.war.captureShieldSec ?? 0);
  }

  neutralGarrison(p) {
    const t = this.cfg.teams;
    return Math.min(t.neutralGarrisonMax, Math.round(t.neutralGarrisonBase + (p.area / 1000) * t.neutralGarrisonPer1000Area));
  }

  resolvePlace(tokens) {
    if (!tokens.length) return 0;
    const whole = tokens.join(' ');
    if (this.aliases.has(whole)) return this.aliases.get(whole);
    for (const t of tokens) {
      if (/^\d{1,2}$/.test(t)) {
        const n = parseInt(t, 10);
        const pv = this.prov.get(n);
        if (pv && pv.p.joinByNumber !== false) return n;
      }
    }
    for (let len = Math.min(3, tokens.length); len >= 1; len--) {
      for (let i = 0; i + len <= tokens.length; i++) {
        const s = tokens.slice(i, i + len).join(' ');
        if (this.aliases.has(s)) return this.aliases.get(s);
      }
    }
    return 0;
  }

  // ---------- events from the bridge ----------

  handleEvent(msg) {
    this.stats.events++;
    if (msg.type === 'status') { this.view.hud.setStatus(msg); return; }
    const u = msg.user;
    if (!u || typeof u.name !== 'string' || !u.name) return;
    switch (msg.type) {
      case 'chat': this.onChat(u, String(msg.text ?? ''), msg.emotes); break;
      case 'gift': this.onGift(u, msg); break;
      case 'like': this.onLike(u, Number(msg.count) || 1); break;
      case 'follow': this.onBonus(u, 'follow'); break;
      case 'share': this.onBonus(u, 'share'); break;
      default: break;
    }
  }

  touchPlayer(u) {
    const p = this.players.get(u.name);
    if (p) {
      p.lastSeen = this.time;
      if (u.nick) p.nick = cleanNick(u.nick);
      const av = safeImageUrl(u.avatar);
      if (av) p.avatar = av;
    }
    return p;
  }

  onChat(u, text, emotes) {
    const { emoji, rest } = splitEmoji(text.slice(0, 200));
    const emoteImg = firstEmoteUrl(emotes);
    const badge = emoteImg ? { t: emoji ? badgeText(emoji) : '★', img: emoteImg } : emoji ? { t: badgeText(emoji) } : null;
    const n = normalizeText(rest);
    const player = this.touchPlayer(u);
    if (player) {
      const other = n ? this.exactPlace(n) : 0;
      if (other && other !== player.team) { this.otherPlate(u, player, other, badge); return; }
      this.memberChat(player, n, badge);
      return;
    }
    if (!n) {
      // Emoji/emote-only message: completes a bare plate sent shortly before (gives the badge).
      const bare = this.barePlate.get(u.name);
      if (badge && bare && this.time - bare.t <= (this.cfg.teams.bareJoinWindowSec ?? 10)) {
        this.barePlate.delete(u.name);
        this.join(u, bare.plate, badge);
      }
      return;
    }
    const tokens = n.split(' ');
    if (ATTACK_WORDS.has(tokens[0])) return; // not joined yet
    if (badge) {
      const plate = this.resolvePlace(tokens);
      if (plate) { this.barePlate.delete(u.name); this.join(u, plate, badge); }
      return;
    }
    // A message that is ONLY a plate or city name joins too (no badge).
    const plate = this.exactPlace(n);
    if (!plate || this.cfg.engage?.bareJoin === false) return;
    this.join(u, plate, null);
  }

  /** The whole message is a place: an alias / city name or a single plate number. */
  exactPlace(n) {
    if (this.aliases.has(n)) return this.aliases.get(n);
    if (/^\d{1,2}$/.test(n)) {
      const pv = this.prov.get(parseInt(n, 10));
      if (pv && pv.p.joinByNumber !== false) return pv.plate;
    }
    return 0;
  }

  /**
   * A member typed another city's plate. In the first teams.switchWindowSec of a round
   * (before they sent a gift) they switch; otherwise they get a visible reply.
   */
  otherPlate(u, player, plate, badge) {
    const team = this.team(player.team);
    const win = this.cfg.teams.switchWindowSec ?? 0;
    if (this.round.phase === 'play' && win > 0 && this.time - (this.round.startedAt ?? -1e9) <= win && player.coins === 0) {
      team.memberCount = Math.max(0, team.memberCount - 1);
      if (team.commander === player) team.commander = null;
      this.players.delete(u.name);
      this.join(u, plate, badge || player.badge);
      const nt = this.team(plate);
      const at = this.prov.get(nt.plate);
      this.view.tags.spawn({ x: at.wx, z: at.wz, nick: player.nick, badge: badge || player.badge, avatar: player.avatar, text: `${team.name} → ${dat(nt.name)} geçti`, colorHex: nt.colorHex, size: 'm', sec: 3 });
      this.view.hud.reply(player.nick, `${dat(nt.name)} geçtin!`, nt.colorHex);
      return;
    }
    if (this.time - (player.lastReplyAt ?? -1e9) < (this.cfg.teams.replyCooldownSec ?? 20)) return;
    player.lastReplyAt = this.time;
    const text = `Zaten ${youAreIn(team.name)}`;
    const pv = this.prov.get(this.prov.get(team.plate).owner === team.plate ? team.plate : (team.rally || team.plate));
    this.view.plates.highlight(pv.plate, team.colorHex);
    this.view.tags.spawn({ x: pv.wx, z: pv.wz, nick: player.nick, badge: player.badge, avatar: player.avatar, text, colorHex: team.colorHex, size: 'm', sec: 3 });
    this.view.hud.reply(player.nick, text, team.colorHex);
  }

  /** Any message from a member does something: votes, badge, or +1 troop. */
  memberChat(player, n, badge) {
    const tokens = n ? n.split(' ') : [];
    if (tokens.length && ATTACK_WORDS.has(tokens[0])) {
      // Votes still work but are never advertised on screen.
      const target = this.resolvePlace(tokens.slice(1));
      if (target) this.vote(player, target);
    }
    // "34 🔥" again or an emoji-only message sets / changes the badge.
    if (badge && (!n || this.exactPlace(n) === player.team)) {
      player.badge = badge;
      const team = this.team(player.team);
      if (team.commander === player) this.updateCommanderBadges();
    }
    if (this.round.phase !== 'play') return;
    const e = this.cfg.engage || {};
    if (this.time - (player.lastChatTroop ?? -1e9) < (e.chatCooldownSec ?? 10)) return;
    player.lastChatTroop = this.time;
    const team = this.team(player.team);
    if (!team.awake) this.wakeTeam(team, true);
    const mult = this.actionMult(team);
    // engage.chatTroopCap: troops from chat per viewer per round (after multipliers; 0 = no cap).
    const cap = e.chatTroopCap ?? 10;
    let add = (e.chatTroops ?? 1) * mult;
    if (cap > 0) add = Math.min(add, Math.max(0, cap - (player.chatTroopsRound || 0)));
    if (add <= 0) { this.freeCapReached(player); return; }
    player.chatTroopsRound = (player.chatTroopsRound || 0) + add;
    const plate = this.addTroops(team, add);
    this.view.floater(this.prov.get(plate), `+${fmt(add)}${mult > 1 ? ' ×' + mult : ''}`, team.colorHex, false, 'tiny');
    if (cap > 0 && player.chatTroopsRound >= cap) this.freeCapReached(player);
  }

  /** Likes this many = what one 1-coin gift (a Rose) gives: "1 GÜL = 1.000 BEĞENİ". */
  likesPerRose() {
    const per = this.cfg.engage?.likesPerTroop ?? 100;
    return per > 0 ? Math.round(this.giftTroops(1)) * per : 0;
  }

  /**
   * A viewer used up their free troops (likes or chat cap): once per round, a personal note
   * in the credit slot and at their province ("bedava hakkın doldu · 1 Gül = 1.000 beğeni").
   * Stream-wide rate limit (engage.freeCapNudgeGapSec); waiting notes go out one by one.
   */
  freeCapReached(player) {
    if (player.freeNudged || this.round.phase !== 'play') return;
    player.freeNudged = true;
    this.freeCapQueue.push(player);
    if (this.freeCapQueue.length > 8) this.freeCapQueue.shift();
  }

  stepFreeCap() {
    if (!this.freeCapQueue.length || this.round.phase !== 'play') return;
    if (this.time - this.lastFreeCapNudge < (this.cfg.engage?.freeCapNudgeGapSec ?? 5)) return;
    const p = this.freeCapQueue.shift();
    if (!this.players.has(p.name)) return;
    this.lastFreeCapNudge = this.time;
    const team = this.team(p.team);
    const rate = this.likesPerRose();
    const text = rate > 0 ? `bedava hakkın doldu · 1 Gül = ${fmt(rate)} beğeni` : 'bedava hakkın doldu · Gül at, asker kazan';
    const pv = this.prov.get(team.provinces ? (team.rally || team.plate) : team.plate);
    this.view.tags.spawn({ x: pv.wx, z: pv.wz, nick: p.nick, badge: p.badge, avatar: p.avatar, colorHex: 0xffd166, size: 'm', sec: 3.4, text });
    this.view.hud.credit?.({
      key: 'free|' + p.name, nick: p.nick, badge: p.badge, avatar: p.avatar, colorHex: team.colorHex,
      coins: 0, giftName: '', count: 0, tierIndex: 0, like: true, troops: 0,
      msg: `${p.nick}: ${text}`, troopsText: text,
    });
    this.view.hud.feed?.(`${p.nick}: ${text}`, 0xffd166, 'gift', true);
  }

  /** Multiplier for free actions (likes, chat): finale and comeback stack. */
  actionMult(team) {
    return this.finaleMult() * (this.isComeback(team) ? (this.cfg.engage?.comebackMult ?? 2) : 1);
  }

  finaleMult() {
    const r = this.round;
    return r.phase === 'play' && r.left <= (this.cfg.round.finaleSec ?? 30) ? (this.cfg.round.finaleMult ?? 2) : 1;
  }

  /** Behind: no province, or far behind the leader. */
  isComeback(team) {
    if (!team.awake) return false;
    if (team.provinces === 0) return true;
    const e = this.cfg.engage || {};
    const lead = this.leadProvinces || 0;
    return lead >= (e.comebackMinLead ?? 4) && team.provinces <= lead * (e.comebackShare ?? 0.25);
  }

  join(u, plate, badge = null) {
    const team = this.team(plate);
    const player = {
      name: u.name, nick: cleanNick(u.nick || u.name), avatar: safeImageUrl(u.avatar), badge,
      team: plate, coins: 0, likes: 0, totalCoins: 0, lastSeen: this.time,
    };
    this.players.set(u.name, player);
    team.memberCount++;
    if (!team.joinBurst) team.joinBurstAt = this.time;
    team.joinBurst = (team.joinBurst || 0) + 1;
    const pv = this.prov.get(plate);
    if (!team.awake && this.round.phase === 'play') {
      this.wakeTeam(team, true);
    } else if (this.round.phase === 'play') {
      if (this.time - (team.lastJoinFx || 0) > 0.6) {
        team.lastJoinFx = this.time;
        this.view.effects.sparkle(pv.wx, TILE_H, pv.wz, team.colorHex, 3);
      }
    }
    // "Ahmet 🔥 İstanbul'a katıldı" at the province (throttled at chaos traffic).
    // The province flashes so the viewer learns where it is; their name flies to it.
    const at = this.prov.get(pv.owner === plate || !pv.owner ? plate : (team.rally || plate));
    this.view.plates.highlight(at.plate, team.colorHex);
    if (this.round.phase === 'play' && this.time - this.lastJoinTag > (this.cfg.hud.joinTagGapSec ?? 0.45)) {
      this.lastJoinTag = this.time;
      this.view.effects.sparkle(at.wx, TILE_H, at.wz, team.colorHex, 5, 1.2);
      this.view.tags.spawn({ x: at.wx, z: at.wz, nick: player.nick, badge: player.badge, avatar: player.avatar, text: `${dat(team.name)} katıldı`, colorHex: team.colorHex, size: 's', sec: 2.8, fly: true });
    }
    this.view.audio.play('sfx_join', { vol: 0.6, minGap: 0.15 });
    this.refreshMarker(plate);
    // Deliver gifts held while the viewer had not joined.
    const pend = this.pending.get(u.name);
    if (pend) {
      this.pending.delete(u.name);
      this.view.hud.dismissNudge(u.name);
      if (pend.gifts.length) {
        const coins = pend.gifts.reduce((s, g) => s + g.total, 0);
        this.view.hud.feed(`${player.nick} katıldı: bekleyen ${fmt(coins)} coin'lik hediye ${this.nameOf(plate)} ordusuna!`, team.colorHex, 'gift');
      }
      for (const g of pend.gifts) this.applyGift(player, g);
      if (pend.follow) this.applyBonus(player, 'follow');
      if (pend.share) this.applyBonus(player, 'share');
      // Likes sent before joining count now (capped by engage.pendingLikesMax).
      if (pend.likes > 0 && this.round.phase === 'play') {
        player.likes += pend.likes;
        this.likeTroops(player, team, pend.likes);
        if (player.likeBatch) player.likeBatch.held = pend.likes;
      }
    }
  }

  onGift(u, msg) {
    const coins = Math.max(0, Number(msg.coins) || 0);
    const count = Math.max(1, Number(msg.count) || 1);
    const total = Math.max(0, Number(msg.total) || coins * count);
    if (!coins || !total) return;
    const g = { coins, count, total, giftName: typeof msg.giftName === 'string' ? msg.giftName.slice(0, 40) : 'Hediye' };
    // TikTok gift id and image (live mode, optional): the HUD shows the real gift picture.
    g.giftId = Math.floor(Number(msg.giftId)) || 0;
    g.icon = /^https:///i.test(String(msg.icon || '')) ? safeImageUrl(msg.icon) : '';
    if (g.icon) this.view.hud.noteGiftIcon?.(g.giftId, g.giftName, g.icon, g.coins);
    if (!g.icon) g.icon = this.view.hud.giftIconFor?.(g.giftId, g.giftName) || '';
    this.stats.gifts++; this.stats.coins += total;
    const player = this.touchPlayer(u);
    if (!player) {
      let pend = this.pending.get(u.name);
      if (!pend) { pend = { gifts: [], follow: 0, share: 0, ts: this.time }; this.pending.set(u.name, pend); }
      pend.gifts.push(g);
      pend.ts = this.time;
      pend.nick = cleanNick(u.nick || u.name);
      pend.avatar = safeImageUrl(u.avatar);
      const coinsHeld = pend.gifts.reduce((s, x) => s + x.total, 0);
      this.view.hud.nudge(u.name, pend.nick, pend.avatar, coinsHeld, this.cfg.teams.nudgeCooldownSec);
      return;
    }
    if (this.round.phase !== 'play') { this.deferred.push({ name: u.name, g }); return; }
    this.applyGift(player, g);
  }

  onLike(u, count) {
    const player = this.touchPlayer(u);
    if (!player) { this.holdLikes(u, count); return; }
    if (this.round.phase !== 'play') return;
    player.likes += count;
    const team = this.team(player.team);
    this.likeTroops(player, team, count);
    if (!team.awake) this.wakeTeam(team, true);
    const pv = this.prov.get(team.provinces ? (team.rally || team.plate) : team.plate);
    // Sparks at the liker's province (light throttle) + the plate's morale bar fills.
    if (this.time - team.lastHeartFx > 0.35) {
      team.lastHeartFx = this.time;
      this.view.effects.hearts(pv.wx, TILE_H, pv.wz, Math.min(4, 1 + Math.floor(count / 10)));
      this.view.effects.sparkle(pv.wx, TILE_H, pv.wz, 0xff5a8a, 2, 0.9);
    }
    this.likeAcc += count;
    if (this.isHucum(team)) return;
    const mult = this.actionMult(team);
    const need = this.moraleNeed(team);
    team.morale = Math.min(need * 1.5, team.morale + count * this.cfg.morale.perLike * mult);
    this.view.plates.setMorale(team.plate, clamp(team.morale / need, 0, 1), mult > 1);
    // One HÜCUM at a time (morale.oneAtATime): a full bar waits for the current charge.
    if (team.morale >= need && !this.hucumBusy(team)) this.startHucum(team);
  }

  // ---------- likes -> troops, name pops, held likes ----------

  /**
   * Every engage.likesPerTroop likes from a member = +1 troop (finale and comeback
   * multiply). Troops land at once; the floater is batched per viewer (likeBatchSec) so a
   * burst reads as one "❤ +10". Milestones (likeMilestone likes in the round) pop the name.
   */
  likeTroops(player, team, count) {
    const e = this.cfg.engage || {};
    const per = e.likesPerTroop ?? 100;
    if (per > 0) {
      player.likeRem = (player.likeRem || 0) + count;
      const n = Math.floor(player.likeRem / per);
      if (n > 0) {
        player.likeRem -= n * per;
        if (!team.awake) this.wakeTeam(team, true);
        // engage.likeTroopCap: troops from likes per viewer per round (after multipliers;
        // 0 = no cap). Past it, likes still fill the HÜCUM bar (onLike), just no troops.
        const cap = e.likeTroopCap ?? 10;
        let add = n * this.actionMult(team);
        if (cap > 0) add = Math.min(add, Math.max(0, cap - (player.likeTroopsRound || 0)));
        if (add > 0) {
          const plate = this.addTroops(team, add);
          let b = player.likeBatch;
          if (!b) { b = player.likeBatch = { troops: 0, likes: 0, plate, at: this.time, x2: false }; this.likeBatches.add(player); }
          b.troops += add; b.plate = plate; b.x2 = b.x2 || add > n;
          player.likeTroopsRound = (player.likeTroopsRound || 0) + add;
        }
        if (cap > 0 && (player.likeTroopsRound || 0) >= cap) { player.likeCapped = true; this.freeCapReached(player); }
      }
    }
    if (player.likeBatch) player.likeBatch.likes += count;
    // Milestone name pop ("Ahmet · 50 beğeni"), and the very first likes of a viewer in the
    // round, so a viewer sees their own name within a second of tapping.
    const m = Math.max(10, e.likeMilestone ?? 50);
    const reached = Math.floor(player.likes / m) * m;
    if (reached > (player.likeMilestoneAt || 0) || !player.likeNamed) {
      player.likeMilestoneAt = Math.max(player.likeMilestoneAt || 0, reached);
      player.likeNamed = true;
      this.likePops.set(player.name, { player, likes: reached || player.likes, first: !reached, t: this.time });
      while (this.likePops.size > 6) this.likePops.delete(this.likePops.keys().next().value);
    }
  }

  /** Called every frame: rate-limited name pops / credits, then batched like floaters. */
  stepLikes() {
    const e = this.cfg.engage || {};
    if (this.likePops.size && this.round.phase === 'play' && this.time - this.lastLikePop >= (e.likeNameGapSec ?? 2.5)) this.likePop(e);
    this.stepFreeCap();
    const batchSec = e.likeBatchSec ?? 1;
    for (const p of this.likeBatches) {
      const b = p.likeBatch;
      if (!b) { this.likeBatches.delete(p); continue; }
      if (this.time - b.at < batchSec) continue;
      this.likeBatches.delete(p); p.likeBatch = null;
      const team = this.team(p.team);
      if (!team || this.round.phase !== 'play') continue;
      const pv = this.prov.get(b.plate);
      this.view.floater(pv, `❤ +${fmt(b.troops)}${b.x2 ? ' ×2' : ''}`, 0xff5a8a, b.troops >= 10, 'like');
    }
  }

  /**
   * One name pop at the liker's province ("Ahmet ❤ 50 beğeni · +5 asker"). A like batch that is
   * still waiting is folded into the pop (one readable label instead of a tag plus a floater).
   */
  likePop(e) {
    // Most likes first; stale pops (> 6 s) are dropped.
    let best = null;
    for (const [k, v] of this.likePops) {
      if (this.time - v.t > 6 || !this.players.has(k)) { this.likePops.delete(k); continue; }
      if (!best || v.likes > best.likes) best = v;
    }
    if (!best) return;
    this.likePops.delete(best.player.name);
    this.lastLikePop = this.time;
    const p = best.player; const team = this.team(p.team);
    const b = p.likeBatch;
    if (b) { p.likeBatch = null; this.likeBatches.delete(p); }
    const pv = this.prov.get(b ? b.plate : (team.provinces ? (team.rally || team.plate) : team.plate));
    const per = e.likesPerTroop ?? 100;
    const got = b ? ` · +${fmt(b.troops)} asker${b.x2 ? ' ×2' : ''}` : '';
    let text;
    if (p.likeCapped && !b) text = `❤ ${fmt(best.likes)} beğeni · HÜCUM doluyor!`;
    else if (best.first) text = b ? `❤ +${fmt(b.troops)} asker${b.x2 ? ' ×2' : ''} · ${per} beğeni = 1` : (per > 0 ? `❤ ${per} beğeni = 1 asker` : '❤ moral doluyor');
    else text = `❤ ${fmt(best.likes)} beğeni${got}`;
    this.view.tags.spawn({ x: pv.wx, z: pv.wz, nick: p.nick, badge: p.badge, avatar: p.avatar, colorHex: 0xff5a8a, size: 'm', sec: 2.8, text });
    // The credit strip shows a short like credit when it is idle.
    if (!best.first && this.time - this.lastLikeCredit > (e.likeCreditGapSec ?? 4)) {
      if (this.view.hud.likeCredit?.({
        key: 'like|' + p.name, nick: p.nick, badge: p.badge, avatar: p.avatar, colorHex: team.colorHex,
        troops: p.likeTroopsRound || 0, likes: best.likes, team: team.name, code: this.codeOf(team.plate),
      })) this.lastLikeCredit = this.time;
    }
  }

  /** Likes from a viewer who has not joined: held (capped) and a rate-limited hint. */
  holdLikes(u, count) {
    const e = this.cfg.engage || {};
    const cap = e.pendingLikesMax ?? 500;
    let pend = this.pending.get(u.name);
    if (!pend) { pend = { gifts: [], follow: 0, share: 0, likes: 0, ts: this.time }; this.pending.set(u.name, pend); }
    pend.likes = Math.min(cap, (pend.likes || 0) + count);
    pend.ts = this.time;
    pend.nick = cleanNick(u.nick || u.name);
    pend.avatar = safeImageUrl(u.avatar);
    if (this.round.phase !== 'play') return;
    if (this.time - this.lastLikeHint < (e.likeHintGapSec ?? 12)) return;
    if (this.time - (pend.likeHintAt ?? -1e9) < (e.likeHintPerUserSec ?? 30)) return;
    pend.likeHintAt = this.time;
    this.lastLikeHint = this.time;
    const coins = pend.gifts.reduce((s, x) => s + x.total, 0);
    this.view.hud.nudge(u.name, pend.nick, pend.avatar, coins, 0, pend.likes);
  }

  onBonus(u, kind) {
    // Share bonus 0 (default): a share does nothing at all (no troops, floater, credit or held count).
    if (kind === 'share' && !(this.cfg.troops.shareBonus > 0)) return;
    const player = this.touchPlayer(u);
    if (!player) {
      const pend = this.pending.get(u.name);
      if (pend) pend[kind]++;
      return;
    }
    if (this.round.phase !== 'play') return;
    this.applyBonus(player, kind);
  }

  applyBonus(player, kind) {
    if (kind === 'share' && !(this.cfg.troops.shareBonus > 0)) return; // held shares after the bonus was switched off
    const team = this.team(player.team);
    const n = (kind === 'follow' ? this.cfg.troops.followBonus : this.cfg.troops.shareBonus) * this.finaleMult();
    const plate = this.addTroops(team, n);
    const pv = this.prov.get(plate);
    this.view.floater(pv, `+${n} ${kind === 'follow' ? 'takip' : 'paylaşım'}`, team.colorHex, true);
    this.view.plates.highlight(plate, team.colorHex);
    this.view.hud.credit({
      key: player.name + '|' + kind, nick: player.nick, badge: player.badge, avatar: player.avatar, colorHex: team.colorHex,
      troops: n, coins: 0, giftName: '', count: 0, team: team.name, code: this.codeOf(team.plate), tierIndex: 1,
      msg: kind === 'follow' ? 'takip etti, teşekkürler!' : 'yayını paylaştı, teşekkürler!',
    });
  }

  /** Another team is charging right now (only one HÜCUM moment at a time). */
  hucumBusy(team) {
    if (this.cfg.morale.oneAtATime === false) return false;
    for (const t of this.teams.values()) if (t !== team && this.isHucum(t)) return true;
    return false;
  }

  startHucum(team) {
    const m = this.cfg.morale;
    team.morale = 0;
    team.hucumUntil = this.time + m.hucumSec;
    team.nextAttackAt = this.time;
    this.view.hud.feed(`${team.name} HÜCUM! Moral doldu, ${m.hucumSec} sn boyunca ordular daha hızlı ve güçlü!`, team.colorHex, 'fire');
    this.view.hud.callout({ title: `${team.name.toLocaleUpperCase('tr')} HÜCUMDA!`, sub: 'Beğeniler moral doldurdu!', colorHex: team.colorHex, prio: 2, sec: 2.6, kind: 'hucum' });
    this.view.plates.setMorale(team.plate, 1, false, true);
    // Its own sound (a low sword sweep), not the round-start hit.
    this.view.audio.play('sfx_swing_b', { vol: 0.85, rate: 0.82, minGap: 0.5, cat: 'hucum' });
    const pv = this.prov.get(team.rally || team.plate);
    this.view.effects.wake(pv.wx, TILE_H, pv.wz, 0xff5030);
  }

  vote(player, target) {
    const team = this.team(player.team);
    if (!team.awake || team.provinces === 0) return;
    if (!this.isValidTarget(team, target)) return;
    team.voters.set(player.name, { target, t: this.time });
    const prev = team.voteTarget;
    this.recountVotes(team);
    // Votes steer the army silently (no on-screen mention).
    if (team.voteTarget !== prev) team.lastVoteFeed = this.time;
  }

  recountVotes(team) {
    const window = this.cfg.war.voteWindowSec;
    const counts = new Map();
    for (const [name, v] of team.voters) {
      if (this.time - v.t > window) { team.voters.delete(name); continue; }
      counts.set(v.target, (counts.get(v.target) || 0) + 1);
    }
    let best = 0; let bestN = 0;
    for (const [t, n] of counts) {
      if (!this.isValidTarget(team, t)) continue;
      if (n > bestN) { best = t; bestN = n; }
    }
    team.voteTarget = best;
    team.voteCount = bestN;
  }

  isValidTarget(team, target) {
    const pv = this.prov.get(target);
    if (!pv || pv.owner === team.plate) return false;
    for (const n of pv.adj) if (this.prov.get(n).owner === team.plate) return true;
    return false;
  }

  // ---------- gifts ----------

  tierFor(coins) {
    const tiers = this.cfg.gifts.tiers;
    let t = tiers[0];
    for (const x of tiers) if (coins >= x.minCoins) t = x;
    return t;
  }

  /**
   * Troops for ONE gift worth `coins`: troops.giftCurve points ([coins, troops]) joined
   * on a log-log scale, so bigger gifts are clearly stronger but never round-ending.
   */
  giftTroops(coins) {
    const pts = this.cfg.troops.giftCurve || [[1, 5], [100, 170], [1000, 700], [5000, 1800]];
    const c = Math.max(1, coins);
    if (c <= pts[0][0]) return pts[0][1] * c / pts[0][0];
    let i = 1;
    while (i < pts.length - 1 && c > pts[i][0]) i++;
    const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
    const t = Math.log(c / x0) / Math.log(x1 / x0);
    return Math.round(y0 * Math.pow(y1 / y0, t));
  }

  applyGift(player, g) {
    const team = this.team(player.team);
    const tier = this.tierFor(g.coins);
    const fm = this.finaleMult();
    const troops = this.giftTroops(g.coins) * g.count * fm;
    player.coins += g.total; player.totalCoins += g.total;
    team.coins += g.total;
    if (!team.commander || (team.commander !== player && player.coins > team.commander.coins)) {
      const had = team.commander;
      team.commander = player;
      if (had && player.coins >= 100) this.view.hud.feed(`${player.nick} artık ${team.name} komutanı!`, team.colorHex, 'crown');
    }
    if (!team.awake) this.wakeTeam(team, true);
    // tier.rank (0-4) = spectacle class (sound, credit length, callouts, camera); the
    // ladder has more steps than classes. Older configs without rank use the list index.
    const tierIndex = Math.min(4, tier.rank ?? this.cfg.gifts.tiers.indexOf(tier));
    // The gift strip jumps to this step for a moment ("az önce atıldı").
    this.view.hud.giftPulse?.(g.coins, g.giftId, g.giftName);
    // Each tier has its own sound (tier.sfx: one key or a layered list).
    const sfx = Array.isArray(tier.sfx) ? tier.sfx : [tier.sfx || 'sfx_gift_small'];
    sfx.forEach((k, i) => this.view.audio.play(k, { vol: tierIndex === 0 ? 0.35 : i ? 0.6 : 0.8, minGap: tierIndex === 0 ? 0.1 : 0.2 }));
    if (tierIndex >= 1) this.view.audio.play('sfx_coins', { vol: 0.5, minGap: 0.3 });
    // 100+ coins: the gift is THE visible event for a moment (minor callouts wait).
    if (tierIndex >= 2) this.view.hud.holdCallouts(this.cfg.hud.giftHoldCalloutsSec ?? 1.5);
    if (tierIndex === 2) { this.view.camera.shake(3); this.view.hud.flash(0.22, team.colorHex); }
    // Small gifts get a name tag at the province; from 100 coins the HUD credit strip is
    // the single credit (no second tag on the map saying the same thing).
    const tagAt = (pv, extra = '') => tierIndex >= 2 ? null : this.view.tags.spawn({
      x: pv.wx, z: pv.wz, nick: player.nick, badge: player.badge, avatar: player.avatar,
      text: `${g.giftName}${g.count > 1 ? ' ×' + g.count : ''} → +${fmtShort(troops)} asker${extra}`,
      colorHex: team.colorHex, size: ['s', 'm', 'l', 'xl', 'xl'][Math.min(4, tierIndex)], sec: [2.6, 3.2, 3.8, 4.5, 5][Math.min(4, tierIndex)],
    });
    // Personal credit at a fixed HUD spot (queued, repeats merged) + the province lights up.
    this.view.hud.credit({
      key: player.name, nick: player.nick, badge: player.badge, avatar: player.avatar, colorHex: team.colorHex,
      troops, coins: g.total, giftName: g.giftName, giftIcon: g.icon, count: g.count, team: team.name, code: this.codeOf(team.plate), tierIndex, x2: fm > 1,
      // Announced gifts: the credit outlasts the full-screen card.
      extraSec: tier.announce ? (tier.announceSec || 5) * 0.5 : 0,
    });
    const litAt = team.provinces === 0 ? team.plate : (this.prov.get(team.plate).owner === team.plate ? team.plate : (team.rally || team.plate));
    this.view.plates.highlight(litAt, team.colorHex, player.nick);

    if (tier.mode === 'garrison' || tierIndex === 0) {
      // A small soldier carrying the gifter's name marches into their province.
      if (this.parade(team, player, troops, tier.paradeFigures || 1, tier.unit || "infantry")) return;
      const plate = this.addTroops(team, troops);
      const pv = this.prov.get(plate);
      this.view.floater(pv, `+${fmtShort(troops)}`, team.colorHex, true);
      this.view.effects.sparkle(pv.wx, TILE_H, pv.wz, team.colorHex, 6, 1.4);
      this.view.effects.giftBurst(pv.wx, TILE_H, pv.wz, team.colorHex, 0);
      if (this.time - this.lastSmallTag > 0.8) { this.lastSmallTag = this.time; tagAt(pv); }
      return;
    }

    if (tier.announce) {
      this.view.hud.announce({
        tier: tier.label, tierId: tier.id, nick: player.nick, badge: player.badge, avatar: player.avatar, effect: tier.legend || '',
        giftName: g.giftName, giftIcon: g.icon, count: g.count, troops, team: team.name, colorHex: team.colorHex,
        sec: tier.announceSec || 5,
      });
      // Music steps back under the announcement; the horn is capped (one at a time, faded).
      this.view.audio.duck((tier.announceSec || 5) + 0.5);
      if (tier.horn) this.view.audio.play(tier.horn, { vol: 0.9, minGap: 1 });
    }
    if (tierIndex >= 2) this.view.hud.feed(`${player.nick} → ${tier.label}! ${fmtShort(troops)} asker (${team.name})`, team.colorHex, 'gift');
    else if (tierIndex === 1 && g.coins >= 30) this.view.hud.feed(`${player.nick} → ${tier.label}: ${fmtShort(troops)} asker (${team.name})`, team.colorHex, 'gift', true);

    // Landless team: everything becomes an uprising at home.
    if (team.provinces === 0) {
      const army = this.launchRebels(team, troops, { nick: player.nick, tier, big: tierIndex >= 3 });
      if (tier.siege) this.launchSieges(team, tier, g, [team.plate], null);
      tagAt(this.prov.get(team.plate), ' (isyan!)');
      this.giftCamera(tierIndex, tier, army.x, army.z);
      return;
    }

    const types = (n) => {
      if (tier.units) return Array.from({ length: n }, (_, i) => tier.units[i % tier.units.length]);
      const unit = tier.cavalryFromCoins && g.coins >= tier.cavalryFromCoins ? 'cavalry' : tier.unit || 'knight';
      return new Array(n).fill(unit);
    };

    if (tier.mode === 'multi') {
      const targets = this.frontier(team).sort((a, b) => this.weakness(a) - this.weakness(b)).slice(0, tier.maxTargets || 3);
      if (!targets.length) { this.addTroops(team, troops); return; }
      const each = troops / targets.length;
      let first = null;
      for (const t of targets) {
        const src = this.bestSourceFor(team, t);
        const a = this.launchArmy(team, src, t, each, { kind: 'gift', types, nick: player.nick, giver: player, big: true, banner: true, maxFigures: tier.maxFigures, minFigures: tier.minFigures, unitKey: 'mixed' });
        first = first || a;
        this.view.effects.lightning(this.prov.get(t).wx, TILE_H, this.prov.get(t).wz);
      }
      this.launchSieges(team, tier, g, targets, null);
      const home = this.prov.get(team.rally || team.plate);
      this.view.effects.bigBurst(home.wx, TILE_H, home.wz, team.colorHex);
      tagAt(home, ` · ${targets.length} cephe`);
      if (tier.shake) { this.view.camera.shake(9); this.view.hud.flash(0.6, team.colorHex); }
      let cx = 0; let cz = 0;
      for (const t of targets) { cx += this.prov.get(t).wx; cz += this.prov.get(t).wz; }
      cx = (cx / targets.length + home.wx) / 2; cz = (cz / targets.length + home.wz) / 2;
      if (first) this.giftCamera(tierIndex, tier, cx, cz);
      return;
    }

    // Single army toward the team's current target.
    const target = this.chooseTarget(team);
    if (!target) {
      const plate = this.addTroops(team, troops);
      const pv = this.prov.get(plate);
      this.view.floater(pv, `+${fmtShort(troops)}`, team.colorHex, true);
      tagAt(pv);
      this.view.effects.giftBurst(pv.wx, TILE_H, pv.wz, team.colorHex, tierIndex);
      this.giftCamera(tierIndex, tier, pv.wx, pv.wz);
      return;
    }
    const src = this.bestSourceFor(team, target);
    // Merge rapid repeats from the same viewer into the army that just left.
    const last = team.lastGiftArmy;
    if (last && last.player === player && last.tier === tier && this.time - last.t < this.cfg.gifts.mergeSameUserArmySec
      && last.army.state === 'march' && last.army.traveled < last.army.dist * 0.4) {
      last.army.troops += troops;
      last.t = this.time;
      this.view.floater(this.prov.get(src), `+${fmtShort(troops)}`, team.colorHex);
      return;
    }
    const unitKey = tier.units ? 'mixed' : (tier.cavalryFromCoins && g.coins >= tier.cavalryFromCoins ? 'cavalry' : tier.unit || 'knight');
    const army = this.launchArmy(team, src, target, troops, {
      kind: 'gift', types, nick: player.nick, giver: player, big: tierIndex >= 3, banner: tierIndex >= 3, maxFigures: tier.maxFigures, minFigures: tier.minFigures, unitKey,
    });
    team.lastGiftArmy = { player, tier, army, t: this.time };
    if (tier.siege) this.launchSieges(team, tier, g, [target], src);
    const spv = this.prov.get(src);
    tagAt(spv);
    this.view.effects.giftBurst(spv.wx, TILE_H, spv.wz, team.colorHex, tierIndex);
    if (tierIndex >= 3) this.view.effects.bigBurst(spv.wx, TILE_H, spv.wz, team.colorHex);
    if (tier.shake) { this.view.camera.shake(6); this.view.hud.flash(0.45, team.colorHex); }
    const tpv = this.prov.get(target);
    this.giftCamera(tierIndex, tier, (spv.wx + tpv.wx) / 2, (spv.wz + tpv.wz) / 2);
  }

  /** Director camera for gifts: medium gifts get a nudge, big ones take over. */
  giftCamera(tierIndex, tier, x, z) {
    const d = this.view.director;
    if (!d) return;
    // Only the top two tiers (tier.camera) may zoom; the director enforces the gap.
    if (tier.camera) {
      const hold = tier.announceSec ? tier.announceSec : 4.5;
      d.force(x, z, this.cfg.visual.director?.zoom ?? 1.6, hold, tierIndex);
    }
  }

  /**
   * Small gifts: one soldier with the gifter's name marches into the province and
   * delivers the troops on arrival. Repeats from the same viewer join that soldier.
   * Returns false when no parade is possible (landless team, too many on the map).
   */
  parade(team, player, troops, figures = 1, unit = 'infantry') {
    const e = this.cfg.engage || {};
    if (team.provinces === 0) return false;
    const last = player.paradeArmy;
    if (last && last.state === 'march' && last.traveled < last.dist * 0.7) {
      last.troops += troops;
      this.view.floater(this.prov.get(last.dest), `+${fmtShort(troops)}`, team.colorHex);
      return true;
    }
    const live = this.armies.reduce((n, a) => n + (a.kind === 'parade' && a.state !== 'done' ? 1 : 0), 0);
    if (live >= (e.paradeMax ?? 24)) return false;
    const plate = this.rallyFor(team);
    const pv = this.prov.get(plate);
    // Start a short walk away, inside the province when possible.
    const d = e.paradeDistance ?? 26;
    let sx = pv.wx - d; let sz = pv.wz;
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const x = pv.p.labelPoint[0] + Math.cos(ang) * d; const y = pv.p.labelPoint[1] + Math.sin(ang) * d / (this.cfg.visual.mapStretch || 1);
      if (pointInProvince(x, y, pv.p)) { sx = x; sz = wzOf(y); break; }
    }
    const army = this._makeArmy(team, sx, sz, pv.wx, pv.wz, troops, {
      kind: 'parade', types: unit, unitKey: unit, nick: player.nick, maxFigures: figures, minFigures: figures, dest: plate, giver: player,
    });
    army.speed = Math.max(army.speed, 16);
    player.paradeArmy = army;
    this.view.effects.sparkle(sx, TILE_H, sz, team.colorHex, 4, 1.1);
    return true;
  }

  // ---------- troops & territory ----------

  /** Add troops to a team where they are useful; returns the province plate used. */
  addTroops(team, n) {
    if (team.provinces === 0) {
      team.rebelPool += n;
      return team.plate;
    }
    const plate = this.rallyFor(team);
    this.prov.get(plate).garrison += n;
    return plate;
  }

  ownedBy(team) {
    const out = [];
    for (const pv of this.prov.values()) if (pv.owner === team.plate) out.push(pv.plate);
    return out;
  }

  frontier(team) {
    const set = new Set();
    for (const pv of this.prov.values()) {
      if (pv.owner !== team.plate) continue;
      for (const n of pv.adj) if (this.prov.get(n).owner !== team.plate) set.add(n);
    }
    return [...set];
  }

  weakness(plate) {
    const pv = this.prov.get(plate);
    return pv.garrison * this.defenseMult(pv);
  }

  chooseTarget(team) {
    this.recountVotes(team);
    if (team.voteTarget) return (team.target = team.voteTarget);
    // The AI leaves freshly captured provinces alone (they are shielded anyway).
    const open = () => {
      const fr = this.frontier(team).filter((f) => !this.isFresh(this.prov.get(f)));
      return fr.length ? fr : this.frontier(team);
    };
    if (team.target && this.isValidTarget(team, team.target) && !this.isFresh(this.prov.get(team.target))) {
      // Keep the current target for a while unless something much weaker appears.
      const fr = open();
      let best = team.target; let bestW = this.weakness(team.target) * 0.7;
      for (const f of fr) { const w = this.weakness(f); if (w < bestW) { best = f; bestW = w; } }
      return (team.target = best);
    }
    const fr = open();
    if (!fr.length) return (team.target = 0);
    let best = 0; let bestW = Infinity;
    for (const f of fr) { const w = this.weakness(f) * (0.9 + Math.random() * 0.2); if (w < bestW) { best = f; bestW = w; } }
    return (team.target = best);
  }

  bestSourceFor(team, target) {
    let best = 0; let bestG = -1;
    for (const n of this.prov.get(target).adj) {
      const pv = this.prov.get(n);
      if (pv.owner === team.plate && pv.garrison > bestG) { best = n; bestG = pv.garrison; }
    }
    return best || this.rallyFor(team);
  }

  rallyFor(team) {
    const t = team.target && this.isValidTarget(team, team.target) ? team.target : this.chooseTarget(team);
    if (t) return (team.rally = this.bestSourceFor(team, t));
    const own = this.ownedBy(team);
    if (own.includes(team.plate)) return (team.rally = team.plate);
    return (team.rally = own[0] || team.plate);
  }

  wakeTeam(team, announce) {
    team.awake = true;
    team.nextAttackAt = this.time + (this.cfg.war.firstAttackDelaySec ?? 2) + Math.random() * 3;
    team.nextRebalanceAt = this.time + this.cfg.war.rebalanceIntervalSec * Math.random();
    const pv = this.prov.get(team.plate);
    if (pv.owner === 0) {
      this.setOwner(pv.plate, team.plate);
      pv.garrison = Math.max(pv.garrison, this.cfg.teams.wakeGarrison);
      this.view.effects.wake(pv.wx, TILE_H, pv.wz, team.colorHex);
      if (announce) {
        this.view.hud.feed(`${team.name} uyandı! Ordular toplanıyor.`, team.colorHex, 'flag', true);
        this.view.audio.play('sfx_capture_b', { vol: 0.4, minGap: 0.3 });
      }
    } else if (pv.owner !== team.plate) {
      team.rebelPool += this.cfg.teams.wakeGarrison;
      team.nextRebelAt = this.time + 1;
      if (announce) this.view.hud.feed(`${team.name} işgal altında! Halk isyana hazırlanıyor…`, team.colorHex, 'fire');
    }
    this.refreshMarker(team.plate);
  }

  setOwner(plate, owner, from = null) {
    const pv = this.prov.get(plate);
    const prev = pv.owner;
    if (prev === owner) return;
    if (prev) this.teams.get(prev).provinces--;
    if (owner) this.teams.get(owner).provinces++;
    pv.owner = owner;
    this.view.map.setOwnerColor(plate, this.ownerColor(owner), true, owner, from);
    this.refreshMarker(plate);
  }

  refreshMarker(plate) {
    const pv = this.prov.get(plate);
    const home = this.teams.get(plate);
    const color = this.ownerColor(pv.owner);
    let kind = 'neutral';
    if (home.awake && home.memberCount > 0) {
      const t = this.cfg.teams;
      const key = home.memberCount >= t.castleLargeMembers ? 'castle_large' : home.memberCount >= t.castleMediumMembers ? 'castle_medium' : 'castle_small';
      this.view.map.setMarker(plate, key, false, color);
      kind = pv.owner === plate ? 'home' : 'occupied';
    } else if (pv.owner) {
      this.view.map.setMarker(plate, null, true, color);
      kind = 'owned';
    } else {
      this.view.map.setMarker(plate, null, false, color);
    }
    this.view.plates.setOwner(plate, color, kind);
  }

  // ---------- armies ----------

  figureCountFor(troops, maxFigs, minFigs = 1) {
    const per = this.cfg.visual.troopsPerFigure;
    // minFigs: gift-ladder steps show at least this many figures (a squad looks like one).
    let n = clamp(Math.max(minFigs, 1 + Math.floor(Math.sqrt(troops / per))), 1, Math.max(maxFigs, minFigs));
    const budget = this.cfg.visual.maxFiguresTotal - this.liveFigures;
    if (n > budget) n = Math.max(budget > 0 ? 1 : 0, budget);
    return n;
  }

  _makeArmy(team, sx, sz, tx, tz, troops, o) {
    const war = this.cfg.war;
    const unitKey = o.unitKey || 'infantry';
    const hucum = this.isHucum(team);
    const n = this.figureCountFor(troops, o.maxFigures || this.cfg.visual.maxFiguresPerArmy, o.minFigures || 1);
    const types = typeof o.types === 'function' ? o.types(n) : new Array(n).fill(o.types || 'infantry');
    const figs = layoutFigures(types, 5.5 * this.cfg.visual.unitScale);
    this.liveFigures += figs.length;
    const dx = tx - sx; const dz = tz - sz;
    const dist = Math.max(1, Math.hypot(dx, dz));
    const army = {
      id: this.nextArmyId++, team: team.plate, colorHex: team.colorHex, kind: o.kind || 'attack',
      troops, power: (war.power[unitKey] || 1) * (hucum ? this.cfg.morale.powerMult : 1),
      speed: (war.speed[unitKey] || 20) * (hucum ? this.cfg.morale.speedMult : 1),
      sx, sz, tx, tz, x: sx, z: sz, dist, traveled: 0, yaw: Math.atan2(dx, dz),
      state: o.gather ? 'gather' : 'march', gatherT: o.gather || 0, appear: 0, figs, nick: o.nick || '',
      big: !!o.big, banner: !!o.banner, giver: o.giver || null, dest: o.dest, from: o.from || 0, fightT: 0, fxT: 0, dustT: Math.random() * 0.3,
    };
    this.armies.push(army);
    return army;
  }

  /** Army from an owned province toward a target province. */
  launchArmy(team, fromPlate, toPlate, troops, o = {}) {
    const a = this.prov.get(fromPlate); const b = this.prov.get(toPlate);
    const dx = b.wx - a.wx; const dz = b.wz - a.wz; const d = Math.hypot(dx, dz) || 1;
    // Start just outside the castle, stop a little before the target's badge.
    const sx = a.wx + (dx / d) * 8; const sz = a.wz + (dz / d) * 8;
    const tx = b.wx - (dx / d) * 6; const tz = b.wz - (dz / d) * 6;
    const army = this._makeArmy(team, sx, sz, tx, tz, troops, { ...o, dest: toPlate, from: fromPlate });
    // Sea crossing (e.g. Mersin <-> KKTC): a ship carries the army.
    if (a.sea.has(toPlate) && !a.p.neighbors.includes(toPlate)) { army.sea = true; army.speed = Math.max(army.speed, this.cfg.war.speed.ship || 40); }
    return army;
  }

  /** Uprising inside the home province of a landless team. */
  launchRebels(team, troops, o = {}) {
    const pv = this.prov.get(team.plate);
    const p = pv.p;
    let sx = pv.wx; let sz = pv.wz + 20;
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2; const r = 16 + Math.random() * 14;
      const x = p.labelPoint[0] + Math.cos(ang) * r; const y = p.labelPoint[1] + Math.sin(ang) * r;
      if (pointInProvince(x, y, p)) { sx = x; sz = wzOf(y); break; }
    }
    const army = this._makeArmy(team, sx, sz, pv.wx, pv.wz, troops, {
      kind: 'rebel', dest: team.plate, types: o.tier?.units ? (n) => Array.from({ length: n }, (_, i) => o.tier.units[i % o.tier.units.length]) : 'infantry',
      nick: o.nick || 'İsyan!', big: o.big, banner: o.big, gather: 0.9, maxFigures: o.tier?.maxFigures, unitKey: o.tier?.units ? 'mixed' : 'infantry',
    });
    this.view.effects.wake(sx, TILE_H, sz, team.colorHex);
    this.view.director?.note(sx, sz, 18 + Math.sqrt(troops));
    if (this.time - (team.lastRebelCall || -1e9) > 25 && troops >= 20) {
      team.lastRebelCall = this.time;
      this.view.hud.callout({ title: `${team.name.toLocaleUpperCase('tr')} AYAKLANDI!`, sub: `${fmtShort(troops)} isyancı şehrini geri istiyor`, colorHex: team.colorHex, prio: 1, sec: 2.2 });
    }
    if (this.time - (team.lastRebelFeed || 0) > 6) {
      team.lastRebelFeed = this.time;
      const occ = pv.owner ? this.teams.get(pv.owner).name : 'işgalci';
      this.view.hud.feed(`${team.name} ayaklandı! ${fmtShort(troops)} isyancı ${occ} garnizonuna saldırıyor`, team.colorHex, 'fire');
    }
    return army;
  }

  launchSieges(team, tier, g, targets, srcPlate) {
    const shots = tier.siegeShots || 3;
    const dmgTotal = this.giftTroops(g.coins) * g.count * (tier.siegeTroopShare ?? 0.3);
    const engines = tier.siegeEngines || 1;
    for (const target of targets) {
      const tp = this.prov.get(target);
      const from = srcPlate || (target === team.plate ? 0 : this.bestSourceFor(team, target));
      for (let e = 0; e < engines; e++) {
        let x; let z;
        if (from && from !== target) {
          const a = this.prov.get(from);
          const dx = tp.wx - a.wx; const dz = tp.wz - a.wz; const d = Math.hypot(dx, dz) || 1;
          const along = Math.min(d * 0.35, 22);
          x = a.wx + (dx / d) * along + (-dz / d) * (e - (engines - 1) / 2) * 12;
          z = a.wz + (dz / d) * along + (dx / d) * (e - (engines - 1) / 2) * 12;
        } else {
          const ang = Math.random() * Math.PI * 2;
          x = tp.wx + Math.cos(ang) * 30; z = tp.wz + Math.sin(ang) * 30;
        }
        const visible = this.sieges.filter((s) => !s.hidden).length < this.cfg.visual.maxSiegeEngines;
        this.sieges.push({
          kind: tier.siege, team: team.plate, colorHex: team.colorHex, x, z, target,
          yaw: Math.atan2(tp.wx - x, tp.wz - z), appear: 0, recoil: 0, hidden: !visible,
          shotsLeft: Math.ceil(shots / targets.length / engines) || 1, nextShot: 0.8 + e * 0.35,
          dmg: dmgTotal / targets.length / engines / Math.max(1, Math.ceil(shots / targets.length / engines)), done: false,
          // Explosion size / shake / flash follow the gift tier (damage is compressed).
          fx: tier.siege === 'trebuchet' ? 2 : tier.siege === 'catapult' ? 1 : 0,
        });
      }
    }
  }

  // ---------- simulation step ----------

  step(dt) {
    this.time += dt;
    const r = this.round;
    // Round clocks follow wall-clock time (keep running in a hidden tab / at low FPS).
    const nowMs = Date.now();
    if (r.phase === 'timeup') {
      // "SÜRE DOLDU!" beat between the clock reaching zero and the end card.
      r.left = 0;
      if (nowMs >= r.timeUpEndMs) { r.phase = 'play'; this.endRound(null); return; }
      this.stepArmies(dt, true);
      return;
    }
    if (r.phase === 'end') {
      r.endLeft = (r.endAtMs - nowMs) / 1000;
      this.view.hud.setEndCountdown(r.endLeft);
      if (r.endLeft <= 0) this.startRound(false);
      this.stepArmies(dt, true);
      return;
    }
    r.left = (r.endsAtMs - nowMs) / 1000;
    const sec = Math.ceil(r.left);
    if (sec <= 10 && sec >= 1 && sec !== r.lastTick) {
      r.lastTick = sec;
      this.view.audio.play('sfx_ui_tick', { vol: 0.7 });
      this.view.hud.countdown(sec);
    }
    if (!r.battleMusic && r.left < 120) { r.battleMusic = true; this.view.audio.playMusic('music_battle'); }
    if (r.left <= 0) { this.timeUp(); return; }

    this.stepIncome(dt);
    this.stepAI();
    this.stepArmies(dt, false);
    this.stepSieges(dt);
    this.stepBurning(dt);
    this.stepDrama();
    this.stepLikes();

    this.labelTimer -= dt;
    if (this.labelTimer <= 0) {
      this.labelTimer = 0.25;
      for (const pv of this.prov.values()) {
        this.view.plates.setGarrison(pv.plate, pv.garrison);
        this.view.map.setStrength(pv.plate, pv.garrison);
      }
      let lead = 0;
      for (const t of this.teams.values()) lead = Math.max(lead, t.provinces);
      this.leadProvinces = lead;
      // Komutan names at the capital: the leading teams after the big top-3 badges.
      const st = this.standings();
      const nameSet = new Set(st.slice(this.cfg.hud.commanderBadges ?? 3, (this.cfg.hud.commanderBadges ?? 3) + (this.cfg.hud.commanderNames ?? 5)).map((t) => t.plate));
      for (const t of this.teams.values()) {
        if (!t.awake) continue;
        // Plate extras: morale bar, comeback flag (landless teams only, to avoid clutter).
        const hucum = this.isHucum(t);
        this.view.plates.setMorale(t.plate, hucum ? 1 : clamp(t.morale / this.moraleNeed(t), 0, 1), false, hucum);
        this.view.plates.setComeback(t.plate, t.provinces === 0 && t.memberCount > 0 ? (this.cfg.engage?.comebackMult ?? 2) : 0);
        const home = this.prov.get(t.plate).owner === t.plate;
        this.view.plates.setCommander(t.plate, home && t.commander && nameSet.has(t.plate) ? t.commander.nick : null);
      }
      this.updateCommanderBadges();
      this.view.hud.setFinale(this.finaleMult() > 1 ? r.left : -1, this.cfg.round.finaleMult ?? 2);
    }
    this.impT = (this.impT ?? 0) - dt;
    if (this.impT <= 0) {
      this.impT = this.cfg.engage?.imperativeSec ?? 6;
      const line = this.imperative();
      if (line) this.view.hud.imperative(line.text, line.colorHex);
    }
  }

  // ---------- drama: leader / rivalry / last-minute callouts ----------

  noteRivalry(a, b, amount, x, z) {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    let r = this.rivals.get(key);
    if (!r) { r = { a: Math.min(a, b), b: Math.max(a, b), heat: 0, x, z, t: this.time }; this.rivals.set(key, r); }
    r.heat = r.heat * Math.pow(0.5, (this.time - r.t) / 30) + amount;
    r.t = this.time; r.x = x; r.z = z;
  }

  stepDrama() {
    const d = this.drama; const r = this.round; const hud = this.view.hud;
    const st = this.standings();
    const lead = st[0];
    if (r.left <= 60 && !d.said60) {
      d.said60 = true;
      hud.callout({ title: 'SON 60 SANİYE!', sub: lead ? `Lider: ${lead.name} · ${lead.provinces} il` : 'Plakanı + emoji yaz, katıl!', colorHex: 0xff4a3a, prio: 4, sec: 3, kind: 'alarm' });
      this.view.audio.play('sfx_horn', { vol: 0.7, minGap: 1 });
      return;
    }
    const fin = this.cfg.round.finaleSec ?? 30;
    if (r.left <= fin && !d.said30) {
      d.said30 = true;
      const m = this.cfg.round.finaleMult ?? 2;
      hud.callout({ title: `SON ${fin} SANİYE!`, sub: m > 1 ? `HER ŞEY ${m} KAT! Gül at, beğen, yaz!` : (lead ? `${lead.name} kazanmak üzere!` : ''), colorHex: 0xff4a3a, prio: 4, sec: 3.2, kind: 'alarm' });
      this.view.audio.play('sfx_horn_long', { vol: 0.8, minGap: 1 });
      hud.flash(0.5, 0xff4a3a);
      return;
    }
    // Final seconds: one slow push-in on the leader's front (bypasses the zoom gap).
    const dc = this.cfg.visual.director || {};
    if (!d.finalShot && r.left <= (dc.finalSecondsAt ?? 14) && lead) {
      const f = this.leaderFront() || this.prov.get(lead.plate);
      const x = f.x ?? f.wx; const z = f.z ?? f.wz;
      if (this.view.director?.force(x, z, dc.finalSecondsZoom ?? 1.5, Math.max(2, r.left - (dc.easeSec ?? 2.4) * 2 - 2), 9)) d.finalShot = true;
    }
    if (r.left < 12) return; // the big countdown owns the screen
    // New leader (or a periodic reminder of who leads).
    if (lead && lead.provinces >= 3) {
      const changed = lead.plate !== d.leader;
      if ((changed && this.time - d.lastLeaderCall > 20) || this.time - d.lastLeaderCall > 75) {
        d.leader = lead.plate; d.lastLeaderCall = this.time;
        hud.callout({ title: `${lead.name.toLocaleUpperCase('tr')} ÖNDE!`, sub: `${lead.provinces} il · ${fmtShort(lead.garrisonSum)} asker`, colorHex: lead.colorHex, prio: 1, sec: 2.2, kind: 'leader' });
        return;
      }
    }
    // Hottest front between two teams.
    if (this.time - d.lastRivalCall > (this.cfg.hud.rivalryEverySec ?? 35)) {
      let best = null; let bestHeat = this.cfg.hud.rivalryMinHeat ?? 120;
      for (const [k, v] of this.rivals) {
        const heat = v.heat * Math.pow(0.5, (this.time - v.t) / 30);
        if (heat < 5) { this.rivals.delete(k); continue; }
        if (heat > bestHeat && this.teams.get(v.a).provinces && this.teams.get(v.b).provinces) { best = v; bestHeat = heat; }
      }
      if (best) {
        d.lastRivalCall = this.time;
        const A = this.teams.get(best.a); const B = this.teams.get(best.b);
        hud.rivalry(A.name, A.colorHex, B.name, B.colorHex);
      }
    }
  }

  /** One short, situation-driven instruction for the viewers (rotates, never repeats twice). */
  imperative() {
    const r = this.round;
    if (r.phase !== 'play') return null;
    const up = (s) => s.toLocaleUpperCase('tr');
    const cands = [];
    const fin = this.cfg.round.finaleSec ?? 30;
    const st = this.standings();
    if (r.left <= fin) {
      cands.push({ k: 'fin', p: 9, text: `SON SANİYELER! HER ŞEY ${this.cfg.round.finaleMult ?? 2} KAT!`, colorHex: 0xff4a3a });
    }
    if (this.players.size < (this.cfg.engage?.fewPlayers ?? 6) || st.length < 3) {
      cands.push({ k: 'join', p: 8, text: 'PLAKANI YAZ, ŞEHRİNİ SEÇ!', colorHex: 0xffd166 });
    }
    // A capital under attack: an enemy army is heading for a team's home province.
    let danger = null;
    for (const a of this.armies) {
      if (a.state === 'done' || a.kind === 'move' || a.kind === 'parade') continue;
      const pv = this.prov.get(a.dest);
      if (!pv || pv.owner !== pv.plate || pv.owner === a.team) continue;
      const t = this.teams.get(pv.plate);
      if (!t.memberCount) continue;
      if (!danger || a.troops > danger.troops) danger = { t, troops: a.troops };
    }
    if (danger) cands.push({ k: 'danger' + danger.t.plate, p: 7, text: `${up(danger.t.name)} TEHLİKEDE! EKRANA BAS!`, colorHex: danger.t.colorHex });
    // Close to taking the lead.
    if (st.length >= 2 && st[0].provinces - st[1].provinces <= 1 && st[1].provinces >= 2) {
      cands.push({ k: 'close' + st[1].plate, p: 6, text: `${up(st[1].name)} LİDERLİĞE ÇOK YAKIN, GÜL AT!`, colorHex: st[1].colorHex });
    }
    // The strongest marching attack.
    let atk = null;
    for (const a of this.armies) {
      if (a.state !== 'march' || a.kind === 'move' || a.kind === 'parade') continue;
      if (!atk || a.troops > atk.troops) atk = a;
    }
    if (atk) { const t = this.teams.get(atk.team); cands.push({ k: 'atk' + t.plate, p: 5, text: `${up(t.name)} SALDIRIYOR, GÜL AT!`, colorHex: t.colorHex }); }
    const behind = st.find((t) => this.isComeback(t) && t.memberCount > 0);
    if (behind) cands.push({ k: 'reb' + behind.plate, p: 5, text: `${up(behind.name)} İSYANDA! BEĞEN, YAZ: ${this.cfg.engage?.comebackMult ?? 2} KAT!`, colorHex: behind.colorHex });
    cands.push({ k: 'tap', p: 1, text: 'EKRANA BAS, HÜCUMU DOLDUR!', colorHex: 0xff5a8a });
    const rose = this.likesPerRose();
    if (rose > 0) cands.push({ k: 'rose', p: 1, text: `1 GÜL = ${fmt(rose)} BEĞENİ!`, colorHex: 0xffd166 });
    cands.push({ k: 'chat', p: 1, text: 'YAZ: HER MESAJ +1 ASKER!', colorHex: 0x9bf09b });
    if (st[0]) cands.push({ k: 'lead', p: 1, text: `${up(st[0].name)} ÖNDE! DURDUR ONU!`, colorHex: st[0].colorHex });
    // Highest priority that was not just shown; urgent lines may repeat after one other.
    cands.sort((a, b) => b.p - a.p);
    this.impN = (this.impN || 0) + 1;
    // Every third line is a general "how to play" one, unless something urgent runs.
    let pool = cands;
    if (this.impN % 3 === 0 && cands[0].p < 8) pool = cands.filter((c) => c.p <= 1).sort(() => Math.random() - 0.5);
    const pick = pool.find((c) => c.k !== this.lastImp) || pool[0];
    this.lastImp = pick.k;
    return pick;
  }

  updateCommanderBadges() {
    const list = [];
    for (const t of this.standings()) {
      if (list.length >= (this.cfg.hud.commanderBadges ?? 3)) break;
      if (!t.commander || this.prov.get(t.plate).owner !== t.plate) continue;
      const c = this.view.map.castleWorld(t.plate);
      list.push({ x: c.x, z: c.z, nick: t.commander.nick, badge: t.commander.badge, avatar: t.commander.avatar, colorHex: t.colorHex });
    }
    this.view.commanders.set(list);
  }

  /** Where the director looks when nothing else is going on: the leader's front. */
  leaderFront() {
    const lead = this.standings()[0];
    if (!lead || !lead.provinces) return null;
    const t = lead.target && this.isValidTarget(lead, lead.target) ? lead.target : this.frontier(lead)[0];
    if (!t) return null;
    const pv = this.prov.get(t);
    return { x: pv.wx, z: pv.wz };
  }

  stepIncome(dt) {
    this.passiveAcc += dt;
    if (this.passiveAcc < 1) return;
    const secs = this.passiveAcc;
    this.passiveAcc = 0;
    const t = this.cfg.troops;
    this.likeRate += (this.likeAcc / secs - this.likeRate) * 0.25;
    this.likeAcc = 0;
    let ready = null; let anyHucum = false;
    for (const team of this.teams.values()) {
      if (!team.awake) continue;
      if (this.isHucum(team)) anyHucum = true;
      else if (team.morale >= this.moraleNeed(team) && (!ready || team.morale / this.moraleNeed(team) > ready.morale / this.moraleNeed(ready))) ready = team;
      // Crowd bonus: modest, grows with the square root of the member count.
      const crowd = (t.passivePerSqrtMemberPerSec ?? 0) * Math.sqrt(team.memberCount);
      if (team.provinces === 0) {
        team.rebelPool += (t.passivePerTeamPerSec + crowd) * t.passiveRebelShare * secs;
      } else {
        this.addTroops(team, (t.passivePerTeamPerSec + t.passivePerProvincePerSec * team.provinces + crowd) * secs);
      }
      // "+N kişi" when people join in numbers.
      if (team.joinBurst && this.time - team.joinBurstAt >= 1.2) {
        const n = team.joinBurst; team.joinBurst = 0;
        if (n >= (this.cfg.engage?.joinBurstMin ?? 3) && this.round.phase === 'play') {
          const pv = this.prov.get(this.prov.get(team.plate).owner === team.plate ? team.plate : (team.rally || team.plate));
          this.view.floater(pv, `+${fmt(n)} kişi`, team.colorHex, true);
          this.view.effects.sparkle(pv.wx, TILE_H, pv.wz, team.colorHex, Math.min(14, 4 + n), 1.4);
          if (n >= 10) this.view.effects.wake(pv.wx, TILE_H, pv.wz, team.colorHex);
        }
      }
    }
    if (ready && !anyHucum) this.startHucum(ready);
  }

  stepAI() {
    const war = this.cfg.war;
    for (const team of this.teams.values()) {
      if (!team.awake) continue;
      if (team.provinces === 0) {
        if (this.time >= team.nextRebelAt) {
          team.nextRebelAt = this.time + war.rebellionIntervalSec;
          if (team.rebelPool >= war.rebellionMin) {
            const n = team.rebelPool; team.rebelPool = 0;
            this.launchRebels(team, n);
          }
        }
        continue;
      }
      if (this.time >= team.nextAttackAt) {
        const hucum = this.isHucum(team);
        team.nextAttackAt = this.time + (war.attackIntervalSec * (hucum ? this.cfg.morale.attackIntervalMult : 1)) + Math.random() * war.attackJitterSec;
        this.tryAttack(team, hucum);
      }
      if (this.time >= team.nextRebalanceAt) {
        team.nextRebalanceAt = this.time + war.rebalanceIntervalSec;
        this.rebalance(team);
      }
    }
  }

  tryAttack(team, hucum) {
    const war = this.cfg.war;
    const target = this.chooseTarget(team);
    if (!target) return;
    const src = this.bestSourceFor(team, target);
    const sp = this.prov.get(src);
    if (sp.owner !== team.plate) return;
    const avail = sp.garrison - war.keepAtHome;
    const send = Math.floor(avail * war.sendFraction);
    if (send < war.minArmy) return;
    const voted = team.voteTarget === target;
    const power = war.power.infantry * (hucum ? this.cfg.morale.powerMult : 1);
    if (!voted && !hucum && send * power < this.weakness(target) * war.attackIfRatio) return;
    sp.garrison -= send;
    const unit = hucum ? 'knight' : 'infantry';
    this.launchArmy(team, src, target, send, { kind: 'attack', types: unit, unitKey: unit });
  }

  /** Move troops from interior provinces toward the front. */
  rebalance(team) {
    const war = this.cfg.war;
    const own = this.ownedBy(team);
    if (own.length < 2) return;
    const dist = new Map();
    const queue = [];
    for (const plate of own) {
      const border = this.prov.get(plate).adj.some((n) => this.prov.get(n).owner !== team.plate);
      if (border) { dist.set(plate, 0); queue.push(plate); }
    }
    while (queue.length) {
      const c = queue.shift();
      for (const n of this.prov.get(c).adj) {
        if (this.prov.get(n).owner !== team.plate || dist.has(n)) continue;
        dist.set(n, dist.get(c) + 1);
        queue.push(n);
      }
    }
    let moves = 0;
    for (const plate of own) {
      const d = dist.get(plate);
      if (!d) continue; // border province (0) or unreachable
      const pv = this.prov.get(plate);
      if (pv.garrison < war.rebalanceMin) continue;
      let next = 0;
      for (const n of pv.adj) if (dist.get(n) === d - 1) { next = n; break; }
      if (!next) continue;
      const n = Math.floor(pv.garrison * war.rebalanceFraction);
      pv.garrison -= n;
      this.launchArmy(team, plate, next, n, { kind: 'move', types: 'infantry', unitKey: 'infantry', maxFigures: 4 });
      if (++moves >= 2) break;
    }
  }

  stepArmies(dt, frozen) {
    const war = this.cfg.war;
    for (let i = this.armies.length - 1; i >= 0; i--) {
      const a = this.armies[i];
      if (a.state === 'done') {
        a.appear -= dt * 2.5;
        if (a.appear <= 0) { this.liveFigures -= a.figs.length; this.armies.splice(i, 1); }
        continue;
      }
      a.appear = Math.min(1, a.appear + dt * 3);
      if (frozen) continue;
      if (a.state === 'gather') {
        a.gatherT -= dt;
        if (a.gatherT <= 0) a.state = 'march';
        continue;
      }
      if (a.state === 'march') {
        a.traveled += a.speed * dt;
        const t = Math.min(1, a.traveled / a.dist);
        a.x = a.sx + (a.tx - a.sx) * t; a.z = a.sz + (a.tz - a.sz) * t;
        a.dustT -= dt;
        if (a.dustT <= 0 && a.figs.length >= 3) { a.dustT = 0.35; this.view.effects.dust(a.x, TILE_H, a.z); }
        if (t >= 1) {
          const pv = this.prov.get(a.dest);
          if (pv.owner === a.team || a.kind === 'parade') { this.resolve(a); continue; }
          a.state = 'fight';
          a.fightT = war.battleSec * (a.big ? 1.4 : 1);
          a.sea = false; // landed: soldiers storm the shore
          this.view.director?.note(pv.wx, pv.wz, Math.min(70, 6 + a.troops / 6) + (a.big ? 30 : 0) + (pv.owner ? 8 : 0));
          this.view.audio.play(Math.random() < 0.5 ? 'sfx_clash_a' : 'sfx_clash_b', { vol: a.big ? 0.8 : 0.4, minGap: 0.15 });
        }
        continue;
      }
      if (a.state === 'fight') {
        a.fightT -= dt;
        a.fxT -= dt;
        if (a.fxT <= 0) {
          a.fxT = a.big ? 0.08 : 0.18;
          const pv = this.prov.get(a.dest);
          this.view.effects.clash((a.x + pv.wx) / 2, TILE_H, (a.z + pv.wz) / 2);
          if (Math.random() < 0.3) this.view.audio.play(['sfx_clash_c', 'sfx_clash_d', 'sfx_hit', 'sfx_hit_metal'][Math.floor(Math.random() * 4)], { vol: 0.3, minGap: 0.12 });
        }
        if (a.fightT <= 0) this.resolve(a);
      }
    }
  }

  resolve(a) {
    a.state = 'done';
    const pv = this.prov.get(a.dest);
    const team = this.teams.get(a.team);
    if (a.kind === 'parade') {
      const plate = pv.owner === a.team ? pv.plate : this.addTroops(team, a.troops);
      if (pv.owner === a.team) pv.garrison += a.troops;
      this.view.floater(this.prov.get(plate), `+${fmtShort(a.troops)}`, team.colorHex);
      return;
    }
    if (pv.owner === a.team) { pv.garrison += a.troops; return; }
    const atk = a.troops * a.power;
    const mult = this.defenseMult(pv);
    const def = pv.garrison * mult;
    if (pv.owner && pv.owner !== a.team) this.noteRivalry(a.team, pv.owner, Math.min(a.troops, pv.garrison) + 10, pv.wx, pv.wz);
    // Capture shield: a freshly taken province only falls to a big gift army.
    const shielded = this.isFresh(pv) && !(a.kind === 'gift' && a.big);
    if (shielded) {
      pv.garrison = Math.max(1, pv.garrison - (atk / mult) * 0.3);
      this.view.effects.sparkle(pv.wx, TILE_H, pv.wz, 0x999999, 2);
      return;
    }
    if (atk > def) {
      this.capture(pv, team, (atk - def) / a.power, a);
    } else {
      pv.garrison = Math.max(0, (def - atk) / mult);
      if (a.big || a.troops > 200) {
        this.view.hud.feed(`${team.name} ordusu ${pv.p.name} önünde bozguna uğradı!`, team.colorHex, 'skull', true);
      }
      this.view.effects.sparkle(pv.wx, TILE_H, pv.wz, 0x999999, 2);
    }
  }

  capture(pv, team, garrison, army) {
    const prevOwner = pv.owner;
    const prevTeam = prevOwner ? this.teams.get(prevOwner) : null;
    this.setOwner(pv.plate, team.plate, army ? { x: army.x, z: army.z } : null);
    pv.garrison = Math.max(1, garrison);
    pv.capturedAt = this.time;
    // Taken by one viewer's gift army: their name stays on the province for a while.
    if (army && army.giver) this.view.plates.setConqueror(pv.plate, army.giver.nick, army.giver.badge, this.cfg.engage?.conquerorSec ?? 20);
    else this.view.plates.setConqueror(pv.plate, null);
    const capital = prevOwner && pv.plate === prevOwner;
    if (capital) {
      const dc = this.cfg.visual.director || {};
      this.view.director?.force(pv.wx, pv.wz, dc.capitalZoom ?? 1.6, 4, 3);
    }
    const bigOne = capital || (army && (army.big || army.troops > 150)) || (army && army.kind === 'rebel');
    this.view.effects.capture(pv.wx, TILE_H, pv.wz, team.colorHex, bigOne);
    this.view.plates.pulse(pv.plate);
    this.view.audio.play(Math.random() < 0.6 ? 'sfx_capture' : 'sfx_capture_b', { vol: bigOne ? 0.8 : 0.55, minGap: 0.25 });
    this.view.director?.note(pv.wx, pv.wz, 22 + (capital ? 45 : 0) + (army ? Math.min(40, army.troops / 8) : 0));
    const name = pv.p.name;
    // Big centre-screen callout for the captures that matter (rate limited in the HUD).
    if (capital || this.time - this.lastCaptureCall > (this.cfg.hud.captureCalloutGapSec ?? 6)) {
      this.lastCaptureCall = this.time;
      const title = army && army.kind === 'rebel' ? `${name.toLocaleUpperCase('tr')} ÖZGÜR!` : `${name.toLocaleUpperCase('tr')} DÜŞTÜ!`;
      const sub = army && army.kind === 'rebel' ? 'İsyan başarılı!' : capital ? `${team.name} başkenti aldı!` : `${team.name} fethetti`;
      this.view.hud.callout({ title, sub, colorHex: team.colorHex, prio: capital ? 3 : bigOne ? 2 : 1, sec: bigOne ? 2.4 : 1.8, kind: 'capture' });
    }
    if (army && army.kind === 'rebel') {
      this.view.hud.feed(`${name} yeniden özgür! İsyan başarılı!`, team.colorHex, 'flag', true);
    } else if (pv.plate === prevOwner) {
      this.view.hud.feed(`${team.name}, ${acc(name)} fethetti! Başkent düştü!`, team.colorHex, 'sword', true);
    } else {
      this.view.hud.feed(`${team.name}, ${acc(name)} fethetti!`, team.colorHex, 'sword', !!army?.big);
    }
    if (prevTeam && prevTeam.provinces === 0 && prevTeam.awake) {
      this.view.hud.feed(`${prevTeam.name} tüm topraklarını kaybetti! İsyan zamanı…`, prevTeam.colorHex, 'skull', true);
      this.view.audio.play('sfx_elimination', { vol: 0.6, minGap: 1 });
      prevTeam.nextRebelAt = this.time + 2;
    }
    if (team.target === pv.plate) team.target = 0;
    const need = Math.ceil(this.provList.length * this.cfg.round.earlyWinShare);
    if (team.provinces >= need) this.endRound(team);
  }

  stepSieges(dt) {
    for (let i = this.sieges.length - 1; i >= 0; i--) {
      const s = this.sieges[i];
      s.recoil = Math.max(0, s.recoil - dt * 4);
      if (s.done) {
        s.appear -= dt * 1.5;
        if (s.appear <= 0) this.sieges.splice(i, 1);
        continue;
      }
      s.appear = Math.min(1, s.appear + dt * 2.5);
      s.nextShot -= dt;
      if (s.nextShot <= 0 && s.shotsLeft > 0) {
        s.shotsLeft--;
        s.nextShot = 0.75 + Math.random() * 0.4;
        s.recoil = 1;
        const tp = this.prov.get(s.target);
        const fx = s.x + Math.sin(s.yaw) * 5; const fz = s.z + Math.cos(s.yaw) * 5;
        this.view.effects.muzzle(fx, TILE_H + 6, fz);
        this.view.audio.play('sfx_wood_hit', { vol: 0.35, minGap: 0.08 });
        const d = Math.hypot(tp.wx - s.x, tp.wz - s.z);
        this.projectiles.push({
          x0: fx, z0: fz, x1: tp.wx + (Math.random() - 0.5) * 14, z1: tp.wz + (Math.random() - 0.5) * 10,
          t: 0, dur: clamp(d / 70, 0.7, 1.6), h: clamp(d * 0.45, 18, 60), x: fx, y: TILE_H + 6, z: fz,
          team: s.team, target: s.target, dmg: s.dmg, fx: s.fx || 0, trailT: 0,
        });
        if (s.shotsLeft <= 0) s.done = true;
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.x = p.x0 + (p.x1 - p.x0) * k; p.z = p.z0 + (p.z1 - p.z0) * k;
      p.y = TILE_H + 6 * (1 - k) + p.h * 4 * k * (1 - k);
      p.trailT -= dt;
      if (p.trailT <= 0) { p.trailT = 0.04; this.view.effects.trail(p.x, p.y, p.z); }
      if (k >= 1) {
        this.projectiles.splice(i, 1);
        this.impact(p);
      }
    }
  }

  impact(p) {
    const pv = this.prov.get(p.target);
    const fx = p.fx || 0;
    this.view.effects.explosion(p.x1, TILE_H, p.z1, [1.1, 1.4, 1.6][fx]);
    this.view.audio.play(fx >= 1 ? 'sfx_explosion_big' : 'sfx_explosion', { vol: 0.7, minGap: 0.1 });
    this.view.director?.note(p.x1, p.z1, 8 + fx * 8);
    this.view.camera.shake([2.5, 4, 6][fx]);
    if (fx >= 1) this.view.hud.flash(fx === 2 ? 0.4 : 0.25);
    pv.burnT = Math.max(pv.burnT, 4);
    if (pv.owner === p.team || this.round.phase !== 'play') return;
    const dmg = Math.min(pv.garrison, p.dmg);
    pv.garrison -= dmg;
    if (dmg >= 1) this.view.floater(pv, `-${fmtShort(dmg)}`, 0xff4a3a);
  }

  stepBurning(dt) {
    for (const pv of this.prov.values()) {
      if (pv.burnT <= 0) continue;
      pv.burnT -= dt;
      pv.burnFx -= dt;
      if (pv.burnFx <= 0) { pv.burnFx = 0.35; this.view.effects.burning(pv.wx + (Math.random() - 0.5) * 10, TILE_H, pv.wz + (Math.random() - 0.5) * 8); }
    }
  }

  // ---------- rounds ----------

  startRound(first) {
    const r = this.round;
    r.n++;
    r.phase = 'play';
    r.duration = this.cfgRoundSec();
    r.left = r.duration;
    r.endsAtMs = Date.now() + r.duration * 1000;
    r.startedAt = this.time;
    r.winner = null;
    r.lastTick = -1;
    r.battleMusic = false;
    // Clear the battlefield.
    for (const a of this.armies) this.liveFigures -= a.figs.length;
    this.armies.length = 0;
    this.sieges.length = 0;
    this.projectiles.length = 0;
    this.liveFigures = 0;
    this.view.effects.clear();
    this.view.arrows?.clear();
    this.view.tags?.clear();
    this.view.director?.reset();
    this.rivals.clear();
    Object.assign(this.drama, { leader: 0, lastLeaderCall: this.time, lastRivalCall: this.time, said60: false, said30: false, finalShot: false });
    for (const pv of this.prov.values()) {
      pv.owner = 0; pv.garrison = this.neutralGarrison(pv.p); pv.burnT = 0; pv.capturedAt = -1e9;
      this.view.map.setOwnerColor(pv.plate, NEUTRAL_HEX, !first, 0);
    }
    this.view.map.clearMarkers();
    const keep = this.cfg.round.keepTeamsBetweenRounds;
    if (!keep) {
      this.players.clear();
    } else {
      const idle = this.cfg.round.forgetIdlePlayersMin * 60;
      for (const [name, p] of this.players) if (this.time - p.lastSeen > idle) this.players.delete(name);
    }
    for (const team of this.teams.values()) {
      Object.assign(team, {
        memberCount: 0, awake: false, provinces: 0, garrisonSum: 0, morale: 0, hucumUntil: 0, rebelPool: 0,
        coins: 0, commander: null, voteTarget: 0, voteCount: 0, target: 0, rally: 0, lastGiftArmy: null,
      });
      team.voters.clear();
    }
    this.view.plates.clearExtras?.();
    for (const p of this.players.values()) {
      p.coins = 0; p.likes = 0; p.paradeArmy = null; p.lastChatTroop = -1e9;
      p.likeRem = 0; p.likeMilestoneAt = 0; p.likeNamed = false; p.likeBatch = null; p.likeTroopsRound = 0;
      p.chatTroopsRound = 0; p.likeCapped = false; p.freeNudged = false; // free-troop caps are per round
      this.teams.get(p.team).memberCount++;
    }
    let woke = 0;
    for (const team of this.teams.values()) if (team.memberCount > 0) { this.wakeTeam(team, false); woke++; }
    for (const pv of this.prov.values()) this.refreshMarker(pv.plate);
    // Prune stale held gifts.
    const maxAge = this.cfg.teams.pendingGiftMaxAgeMin * 60;
    for (const [name, pend] of this.pending) if (this.time - pend.ts > maxAge) this.pending.delete(name);
    this.likeBatches.clear(); this.likePops.clear(); this.freeCapQueue.length = 0;

    this.view.hud.hideEnd();
    if (!first) {
      this.view.hud.banner(`${r.n}. TUR BAŞLADI!`, woke ? `${woke} şehir savaşa hazır` : 'Plakanı yaz, şehrini uyandır!');
      this.view.hud.feed(`${r.n}. tur başladı! ${woke ? `${woke} şehir sahada.` : 'Plakanı yaz ve katıl!'}`, 0xffd166, 'hourglass', true);
      this.view.audio.play('sfx_round_start', { vol: 0.8, minGap: 0.5 });
      this.view.audio.play('sfx_horn', { vol: 0.6, minGap: 1 });
    }
    // Alternate the two loops (each one full pass, crossfaded); odd rounds open with the
    // march, even rounds with the battle track. The last 2 minutes lock to the battle track.
    this.view.audio.playMusicCycle(r.n % 2 ? ['music_main', 'music_battle'] : ['music_battle', 'music_main']);
    // Gifts that arrived during the end screen.
    const deferred = this.deferred; this.deferred = [];
    for (const d of deferred) {
      const p = this.players.get(d.name);
      if (p) this.applyGift(p, d.g);
    }
  }

  cfgRoundSec() {
    return this.view.roundOverride || this.cfg.round.durationSec;
  }

  /** The clock hit zero: a short "SÜRE DOLDU!" beat (music out, round-end jingle), then the end card. */
  timeUp() {
    const r = this.round;
    if (r.phase !== 'play') return;
    r.phase = 'timeup';
    r.left = 0;
    r.timeUpEndMs = Date.now() + (this.cfg.round.timeUpSec ?? 1.8) * 1000;
    this.view.audio.stopMusic(0.6);
    this.view.audio.play('sfx_round_end', { vol: 0.9, minGap: 1 });
    this.view.hud.callout({ title: 'SÜRE DOLDU!', sub: 'Sonuçlar geliyor…', colorHex: 0xff4a3a, prio: 5, sec: this.cfg.round.timeUpSec ?? 1.8, kind: 'alarm', now: true });
    this.view.hud.flash?.(0.35, 0xff4a3a);
  }

  endRound(winner) {
    const r = this.round;
    if (r.phase !== 'play') return;
    const standings = this.standings();
    if (!winner && standings.length) winner = standings[0];
    r.phase = 'end';
    r.endLeft = this.cfg.round.endScreenSec;
    r.endAtMs = Date.now() + r.endLeft * 1000;
    r.winner = winner;
    for (const a of this.armies) if (a.state !== 'done') a.state = 'done';
    for (const s of this.sieges) s.done = true;
    this.projectiles.length = 0;
    const gifters = this.topGifters(3);
    if (winner) {
      this.session.wins[winner.plate] = (this.session.wins[winner.plate] || 0) + 1;
      this.saveSession();
    }
    const members = winner ? [...this.players.values()].filter((p) => p.team === winner.plate)
      .sort((a, b) => (b.coins - a.coins) || (b.likes - a.likes)).slice(0, 80).map((p) => ({ nick: p.nick, badge: p.badge || null })) : [];
    this.view.hud.showEnd({
      round: r.n,
      winner: winner ? { name: winner.name, plate: winner.plate, code: this.codeOf(winner.plate), colorHex: winner.colorHex, provinces: winner.provinces, commander: winner.commander } : null,
      top: standings.slice(0, 5).map((t) => ({ name: t.name, plate: t.plate, code: this.codeOf(t.plate), colorHex: t.colorHex, provinces: t.provinces, members: t.memberCount })),
      gifters,
      likers: this.topLikers(3),
      members,
      sec: this.cfg.round.endScreenSec,
    });
    // One victory theme (music_victory); sfx_victory is the same tune, so it is not layered on top.
    this.view.audio.playMusic('music_victory');
    if (winner) {
      const pv = this.prov.get(winner.plate);
      this.view.effects.bigBurst(pv.wx, TILE_H, pv.wz, winner.colorHex);
      this.view.hud.feed(`${winner.name} turu kazandı! (${winner.provinces} il)`, winner.colorHex, 'trophy', true);
      this.view.director?.force(pv.wx, pv.wz, 1.6, Math.min(8, this.cfg.round.endScreenSec), 9);
    }
  }

  restartRound() {
    // Streamer shortcut: start a fresh round now.
    this.round.phase = 'play';
    this.startRound(false);
  }

  /**
   * Wipes every team and player (incl. held gifts and gifts waiting for the next round)
   * and starts a fresh round. The session scoreboard (rounds won) is kept.
   * Used by the panel's "Haritayı temizle" and when the bridge switches simulator <-> live.
   */
  clearMap() {
    this.players.clear();
    this.pending.clear();
    this.barePlate.clear();
    this.emojiHintAt.clear();
    this.deferred = [];
    this.view.hud.clearTransient?.();
    this.restartRound();
  }

  // ---------- HUD summaries ----------

  updateGarrisonSums() {
    for (const t of this.teams.values()) t.garrisonSum = 0;
    for (const pv of this.prov.values()) if (pv.owner) this.teams.get(pv.owner).garrisonSum += pv.garrison;
  }

  standings() {
    this.updateGarrisonSums();
    return [...this.teams.values()]
      .filter((t) => t.awake || t.provinces > 0)
      .sort((a, b) => b.provinces - a.provinces || b.garrisonSum - a.garrisonSum || b.memberCount - a.memberCount || a.plate - b.plate);
  }

  topLikers(n) {
    return [...this.players.values()].filter((p) => p.likes > 0).sort((a, b) => b.likes - a.likes).slice(0, n)
      .map((p) => ({ nick: p.nick, badge: p.badge || null, avatar: p.avatar, likes: p.likes, code: this.codeOf(p.team), team: this.teams.get(p.team).name, colorHex: this.teams.get(p.team).colorHex }));
  }

  // ---------- session scoreboard (rounds won per city, survives reloads) ----------

  loadSession() {
    let wins = {};
    try {
      const raw = localStorage.getItem(this.cfg.round.sessionStorageKey || 'fetih.session.v1');
      const d = raw ? JSON.parse(raw) : null;
      if (d && typeof d.wins === 'object') for (const [k, v] of Object.entries(d.wins)) if (this.prov.has(+k) && v > 0) wins[+k] = Math.floor(v);
    } catch { wins = {}; }
    return { wins };
  }

  saveSession() {
    try { localStorage.setItem(this.cfg.round.sessionStorageKey || 'fetih.session.v1', JSON.stringify(this.session)); } catch { /* storage blocked */ }
  }

  resetSession() {
    this.session = { wins: {} };
    this.saveSession();
  }

  sessionBoard() {
    return Object.entries(this.session.wins).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, v]) => ({ name: this.nameOf(+k), wins: v, colorHex: this.teams.get(+k).colorHex }));
  }

  topGifters(n) {
    const top = [];
    for (const p of this.players.values()) {
      if (p.coins <= 0) continue;
      if (top.length < n || p.coins > top[top.length - 1].coins) {
        top.push(p);
        top.sort((a, b) => b.coins - a.coins);
        if (top.length > n) top.pop();
      }
    }
    return top.map((p) => ({ nick: p.nick, badge: p.badge || null, code: this.codeOf(p.team), avatar: p.avatar, coins: p.coins, plate: p.team, colorHex: this.teams.get(p.team).colorHex, team: this.teams.get(p.team).name }));
  }

  summary() {
    const standings = this.standings();
    const top = standings.slice(0, this.cfg.hud.topCities).map((t) => ({
      plate: t.plate, name: t.name, colorHex: t.colorHex, provinces: t.provinces, troops: t.garrisonSum + t.rebelPool,
      members: t.memberCount, morale: this.isHucum(t) ? 1 : clamp(t.morale / this.moraleNeed(t), 0, 1),
      hucum: this.isHucum(t), landless: t.provinces === 0,
      commander: t.commander ? { nick: t.commander.nick, badge: t.commander.badge || null, avatar: t.commander.avatar } : null,
      code: this.codeOf(t.plate),
    }));
    return {
      round: this.round.n, left: this.round.left, phase: this.round.phase, top,
      gifters: this.topGifters(this.cfg.hud.topGifters),
      likers: this.topLikers(this.cfg.hud.topLikers ?? 2),
      session: this.sessionBoard(),
      players: this.players.size, teams: standings.length, pending: this.pending.size,
      hucumBar: this.hucumBarInfo(),
    };
  }

  /** The city in HÜCUM, else the one closest to it (for the labelled morale bar). */
  hucumBarInfo() {
    if (this.round.phase !== 'play') return null;
    let best = null; let bestF = 0.02;
    for (const t of this.teams.values()) {
      if (!t.awake) continue;
      if (this.isHucum(t)) { this.hbTeam = t; return { name: t.name, colorHex: t.colorHex, frac: 1, hucum: true, left: t.hucumUntil - this.time }; }
      const f = clamp(t.morale / this.moraleNeed(t), 0, 1);
      if (f > bestF) { best = t; bestF = f; }
    }
    // Hysteresis: the shown city changes only when another one is clearly closer (readable at chaos).
    const cur = this.hbTeam;
    if (best && cur && cur !== best && cur.awake && !this.isHucum(cur)) {
      const cf = clamp(cur.morale / this.moraleNeed(cur), 0, 1);
      if (cf > 0.02 && bestF - cf < 0.1) { best = cur; bestF = cf; }
    }
    this.hbTeam = best;
    return best ? { name: best.name, colorHex: best.colorHex, frac: bestF, hucum: false, left: 0 } : null;
  }
}

export { hexCss, gen };
