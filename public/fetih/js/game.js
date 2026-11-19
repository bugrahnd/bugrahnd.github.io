// Game rules: teams, membership, troops, gifts, morale, war AI, rebellion, rounds.
// Presentation goes through `view` (map, effects, labels, hud, audio, camera).
import { normalizeText, acc, gen, dat, cleanNick, safeImageUrl, fmt, rand, clamp, pointInProvince, splitEmoji, badgeText, firstEmoteUrl } from './util.js';
import { layoutFigures } from './units.js';
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
    this.labelTimer = 0;
    this.startRound(true);
  }

  // ---------- helpers ----------

  team(plate) { return this.teams.get(plate); }
  codeOf(plate) { return provCode(this.prov.get(plate).p); }
  nameOf(plate) { return this.prov.get(plate).p.name; }
  ownerColor(owner) { return owner ? this.teams.get(owner).colorHex : NEUTRAL_HEX; }
  isHucum(team) { return team.hucumUntil > this.time; }
  moraleNeed(team) { return this.cfg.morale.needBase + this.cfg.morale.needPerMember * team.memberCount; }

  defenseMult(pv) {
    let m = this.cfg.war.defenderBonus;
    if (pv.owner && pv.owner === pv.plate) m *= this.cfg.war.capitalBonus;
    return m;
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
    if (!n) {
      // Emoji/emote-only message: completes a bare plate sent shortly before.
      const bare = this.barePlate.get(u.name);
      if (!player && badge && bare && this.time - bare.t <= (this.cfg.teams.bareJoinWindowSec ?? 10)) {
        this.barePlate.delete(u.name);
        this.join(u, bare.plate, badge);
      }
      return;
    }
    const tokens = n.split(' ');
    if (ATTACK_WORDS.has(tokens[0])) {
      if (!player) {
        // Not joined yet: treat "saldır 06" as nothing, but a bare place after it is not a join.
        return;
      }
      const target = this.resolvePlace(tokens.slice(1));
      if (target) this.vote(player, target);
      return;
    }
    if (player) return; // membership is fixed for the round
    const plate = this.resolvePlace(tokens);
    if (!plate) return;
    if (badge) { this.barePlate.delete(u.name); this.join(u, plate, badge); return; }
    // Plate without emoji: remember it briefly (an emoji-only follow-up joins), and
    // tell this viewer exactly what to type (rate limited).
    this.barePlate.set(u.name, { plate, t: this.time });
    if (this.barePlate.size > 4000) {
      for (const [k, v] of this.barePlate) if (this.time - v.t > 15) this.barePlate.delete(k);
    }
    const last = this.emojiHintAt.get(u.name) || -1e9;
    if (this.time - last < 30 || this.time - this.lastEmojiHint < 2.5) return;
    this.emojiHintAt.set(u.name, this.time);
    if (this.emojiHintAt.size > 3000) this.emojiHintAt.clear();
    this.lastEmojiHint = this.time;
    const pp = this.prov.get(plate).p;
    const typed = pp.joinByNumber === false ? normalizeText(pp.name) || provCode(pp).toLowerCase() : provCode(pp);
    this.view.hud.emojiHint(cleanNick(u.nick || u.name, 16), `${typed} 🔥`, this.team(plate).colorHex);
  }

  join(u, plate, badge = null) {
    const team = this.team(plate);
    const player = {
      name: u.name, nick: cleanNick(u.nick || u.name), avatar: safeImageUrl(u.avatar), badge,
      team: plate, coins: 0, likes: 0, totalCoins: 0, lastSeen: this.time,
    };
    this.players.set(u.name, player);
    team.memberCount++;
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
    if (this.round.phase === 'play' && this.time - this.lastJoinTag > (this.cfg.hud.joinTagGapSec ?? 0.45)) {
      this.lastJoinTag = this.time;
      const at = this.prov.get(pv.owner === plate || !pv.owner ? plate : (team.rally || plate));
      this.view.tags.spawn({ x: at.wx, z: at.wz, nick: player.nick, badge: player.badge, avatar: player.avatar, text: `${dat(team.name)} katıldı`, colorHex: team.colorHex, size: 's', sec: 2.2 });
    }
    this.view.audio.play('sfx_join', { vol: 0.35, minGap: 0.15 });
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
    }
  }

  onGift(u, msg) {
    const coins = Math.max(0, Number(msg.coins) || 0);
    const count = Math.max(1, Number(msg.count) || 1);
    const total = Math.max(0, Number(msg.total) || coins * count);
    if (!coins || !total) return;
    const g = { coins, count, total, giftName: typeof msg.giftName === 'string' ? msg.giftName.slice(0, 40) : 'Hediye' };
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
    if (!player || this.round.phase !== 'play') return;
    player.likes += count;
    const team = this.team(player.team);
    if (!team.awake) return;
    if (this.isHucum(team)) return;
    team.morale += count * this.cfg.morale.perLike;
    const pv = this.prov.get(team.rally || team.plate);
    if (this.time - team.lastHeartFx > 0.7) {
      team.lastHeartFx = this.time;
      this.view.effects.hearts(pv.wx, TILE_H, pv.wz, Math.min(4, 1 + Math.floor(count / 10)));
    }
    if (team.morale >= this.moraleNeed(team)) this.startHucum(team);
  }

  onBonus(u, kind) {
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
    const team = this.team(player.team);
    const n = kind === 'follow' ? this.cfg.troops.followBonus : this.cfg.troops.shareBonus;
    const plate = this.addTroops(team, n);
    const pv = this.prov.get(plate);
    this.view.floater(pv, `+${n} ${kind === 'follow' ? 'takip' : 'paylaşım'}`, team.colorHex);
  }

  startHucum(team) {
    const m = this.cfg.morale;
    team.morale = 0;
    team.hucumUntil = this.time + m.hucumSec;
    team.nextAttackAt = this.time;
    this.view.hud.feed(`${team.name} HÜCUM! Moral doldu, ${m.hucumSec} sn boyunca ordular daha hızlı ve güçlü!`, team.colorHex, 'fire');
    this.view.hud.hucum(team.name, team.colorHex);
    this.view.audio.play('sfx_round_start', { vol: 0.6, minGap: 0.5 });
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
    if (team.voteTarget && team.voteTarget !== prev && this.time - team.lastVoteFeed > 8) {
      team.lastVoteFeed = this.time;
      const votes = team.voteCount;
      this.view.hud.feed(`${team.name} hedefini seçti: ${this.nameOf(team.voteTarget)} (${votes} oy)`, team.colorHex, 'target');
      const pv = this.prov.get(team.voteTarget);
      this.view.floater(pv, 'HEDEF!', team.colorHex);
    }
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

  applyGift(player, g) {
    const team = this.team(player.team);
    const tier = this.tierFor(g.coins);
    const troops = g.total * this.cfg.troops.perCoin * (tier.troopBonus || 1);
    player.coins += g.total; player.totalCoins += g.total;
    team.coins += g.total;
    if (!team.commander || (team.commander !== player && player.coins > team.commander.coins)) {
      const had = team.commander;
      team.commander = player;
      if (had && player.coins >= 100) this.view.hud.feed(`${player.nick} artık ${team.name} komutanı!`, team.colorHex, 'crown');
    }
    if (!team.awake) this.wakeTeam(team, true);
    const tierIndex = this.cfg.gifts.tiers.indexOf(tier);
    this.view.audio.play(tier.sfx || 'sfx_gift_small', { vol: tierIndex === 0 ? 0.35 : 0.8, minGap: tierIndex === 0 ? 0.1 : 0.2 });
    if (tierIndex >= 1) this.view.audio.play('sfx_coins', { vol: 0.5, minGap: 0.3 });
    const tagAt = (pv, extra = '') => this.view.tags.spawn({
      x: pv.wx, z: pv.wz, nick: player.nick, badge: player.badge, avatar: player.avatar,
      text: `${g.giftName}${g.count > 1 ? ' ×' + g.count : ''} → +${fmt(troops)} asker${extra}`,
      colorHex: team.colorHex, size: ['s', 'm', 'l', 'xl', 'xl'][Math.min(4, tierIndex)], sec: [2.2, 2.8, 3.4, 4.5, 5][Math.min(4, tierIndex)],
    });

    if (tier.mode === 'garrison' || tierIndex === 0) {
      const plate = this.addTroops(team, troops);
      const pv = this.prov.get(plate);
      this.view.floater(pv, `+${fmt(troops)}`, team.colorHex, true);
      this.view.effects.sparkle(pv.wx, TILE_H, pv.wz, team.colorHex, 6, 1.4);
      this.view.effects.giftBurst(pv.wx, TILE_H, pv.wz, team.colorHex, 0);
      if (this.time - this.lastSmallTag > 0.8) { this.lastSmallTag = this.time; tagAt(pv); }
      return;
    }

    if (tier.announce) {
      this.view.hud.announce({
        tier: tier.label, tierId: tier.id, nick: player.nick, badge: player.badge, avatar: player.avatar, effect: tier.legend || '',
        giftName: g.giftName, count: g.count, troops, team: team.name, colorHex: team.colorHex,
        sec: tier.announceSec || 5,
      });
      if (tier.horn) this.view.audio.play(tier.horn, { vol: 0.9, minGap: 1 });
    }
    if (tierIndex >= 2) this.view.hud.feed(`${player.nick} → ${tier.label}! ${fmt(troops)} asker (${team.name})`, team.colorHex, 'gift');
    else if (tierIndex === 1 && g.coins >= 30) this.view.hud.feed(`${player.nick} → ${fmt(troops)} şövalye (${team.name})`, team.colorHex, 'gift', true);

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
        const a = this.launchArmy(team, src, t, each, { kind: 'gift', types, nick: player.nick, big: true, banner: true, maxFigures: tier.maxFigures, unitKey: 'mixed' });
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
      this.view.floater(pv, `+${fmt(troops)}`, team.colorHex, true);
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
      this.view.floater(this.prov.get(src), `+${fmt(troops)}`, team.colorHex);
      return;
    }
    const unitKey = tier.units ? 'mixed' : (tier.cavalryFromCoins && g.coins >= tier.cavalryFromCoins ? 'cavalry' : tier.unit || 'knight');
    const army = this.launchArmy(team, src, target, troops, {
      kind: 'gift', types, nick: player.nick, big: tierIndex >= 3, banner: tierIndex >= 3, maxFigures: tier.maxFigures, unitKey,
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
    if (tierIndex >= 2) {
      const hold = tier.announceSec ? tier.announceSec + 0.5 : 3.5;
      d.force(x, z, tierIndex >= 4 ? 2.3 : tierIndex >= 3 ? 2.5 : 2.8, hold, tierIndex);
    } else {
      d.note(x, z, tierIndex === 1 ? 22 : 4);
    }
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
    if (team.target && this.isValidTarget(team, team.target)) {
      // Keep the current target for a while unless something much weaker appears.
      const fr = this.frontier(team);
      let best = team.target; let bestW = this.weakness(team.target) * 0.7;
      for (const f of fr) { const w = this.weakness(f); if (w < bestW) { best = f; bestW = w; } }
      return (team.target = best);
    }
    const fr = this.frontier(team);
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
    team.nextAttackAt = this.time + 2 + Math.random() * 3;
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

  figureCountFor(troops, maxFigs) {
    const per = this.cfg.visual.troopsPerFigure;
    let n = clamp(1 + Math.floor(Math.sqrt(troops / per)), 1, maxFigs);
    const budget = this.cfg.visual.maxFiguresTotal - this.liveFigures;
    if (n > budget) n = Math.max(budget > 0 ? 1 : 0, budget);
    return n;
  }

  _makeArmy(team, sx, sz, tx, tz, troops, o) {
    const war = this.cfg.war;
    const unitKey = o.unitKey || 'infantry';
    const hucum = this.isHucum(team);
    const n = this.figureCountFor(troops, o.maxFigures || this.cfg.visual.maxFiguresPerArmy);
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
      big: !!o.big, banner: !!o.banner, dest: o.dest, from: o.from || 0, fightT: 0, fxT: 0, dustT: Math.random() * 0.3,
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
      this.view.hud.callout({ title: `${team.name.toLocaleUpperCase('tr')} AYAKLANDI!`, sub: `${fmt(troops)} isyancı şehrini geri istiyor`, colorHex: team.colorHex, prio: 1, sec: 2.2 });
    }
    if (this.time - (team.lastRebelFeed || 0) > 6) {
      team.lastRebelFeed = this.time;
      const occ = pv.owner ? this.teams.get(pv.owner).name : 'işgalci';
      this.view.hud.feed(`${team.name} ayaklandı! ${fmt(troops)} isyancı ${occ} garnizonuna saldırıyor`, team.colorHex, 'fire');
    }
    return army;
  }

  launchSieges(team, tier, g, targets, srcPlate) {
    const shots = tier.siegeShots || 3;
    const dmgTotal = g.total * (tier.siegeDamagePerCoin || 1);
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
        });
      }
    }
  }

  // ---------- simulation step ----------

  step(dt) {
    this.time += dt;
    const r = this.round;
    if (r.phase === 'end') {
      r.endLeft -= dt;
      this.view.hud.setEndCountdown(r.endLeft);
      if (r.endLeft <= 0) this.startRound(false);
      this.stepArmies(dt, true);
      return;
    }
    r.left -= dt;
    const sec = Math.ceil(r.left);
    if (sec <= 10 && sec >= 1 && sec !== r.lastTick) {
      r.lastTick = sec;
      this.view.audio.play('sfx_ui_tick', { vol: 0.7 });
      this.view.hud.countdown(sec);
    }
    if (!r.battleMusic && r.left < 120) { r.battleMusic = true; this.view.audio.playMusic('music_battle'); }
    if (r.left <= 0) { this.endRound(null); return; }

    this.stepIncome(dt);
    this.stepAI();
    this.stepArmies(dt, false);
    this.stepSieges(dt);
    this.stepBurning(dt);
    this.stepDrama();

    this.labelTimer -= dt;
    if (this.labelTimer <= 0) {
      this.labelTimer = 0.25;
      for (const pv of this.prov.values()) {
        this.view.plates.setGarrison(pv.plate, pv.garrison);
        this.view.map.setStrength(pv.plate, pv.garrison);
      }
      this.updateCommanderBadges();
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
    if (r.left <= 30 && !d.said30) {
      d.said30 = true;
      hud.callout({ title: 'SON 30 SANİYE!', sub: lead ? `${lead.name} kazanmak üzere!` : '', colorHex: 0xff4a3a, prio: 4, sec: 2.4, kind: 'alarm' });
      return;
    }
    if (r.left < 12) return; // the big countdown owns the screen
    // New leader (or a periodic reminder of who leads).
    if (lead && lead.provinces >= 3) {
      const changed = lead.plate !== d.leader;
      if ((changed && this.time - d.lastLeaderCall > 20) || this.time - d.lastLeaderCall > 75) {
        d.leader = lead.plate; d.lastLeaderCall = this.time;
        hud.callout({ title: `${lead.name.toLocaleUpperCase('tr')} ÖNDE!`, sub: `${lead.provinces} il · ${fmt(lead.garrisonSum)} asker`, colorHex: lead.colorHex, prio: 1, sec: 2.2, kind: 'leader' });
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
        this.view.director?.force(best.x, best.z, 2.6, 3.5, 1);
      }
    }
  }

  updateCommanderBadges() {
    const list = [];
    for (const t of this.standings()) {
      if (list.length >= 3) break;
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
    for (const team of this.teams.values()) {
      if (!team.awake) continue;
      if (team.provinces === 0) {
        team.rebelPool += t.passivePerTeamPerSec * t.passiveRebelShare * secs;
      } else {
        this.addTroops(team, (t.passivePerTeamPerSec + t.passivePerProvincePerSec * team.provinces) * secs);
      }
    }
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
          if (pv.owner === a.team) { this.resolve(a); continue; }
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
    if (pv.owner === a.team) { pv.garrison += a.troops; return; }
    const atk = a.troops * a.power;
    const mult = this.defenseMult(pv);
    const def = pv.garrison * mult;
    if (pv.owner && pv.owner !== a.team) this.noteRivalry(a.team, pv.owner, Math.min(a.troops, pv.garrison) + 10, pv.wx, pv.wz);
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
    const capital = prevOwner && pv.plate === prevOwner;
    const bigOne = capital || (army && (army.big || army.troops > 150)) || (army && army.kind === 'rebel');
    this.view.effects.capture(pv.wx, TILE_H, pv.wz, team.colorHex, bigOne);
    this.view.plates.pulse(pv.plate);
    this.view.audio.play(Math.random() < 0.6 ? 'sfx_capture' : 'sfx_capture_b', { vol: bigOne ? 0.8 : 0.55, minGap: 0.25 });
    this.view.director?.note(pv.wx, pv.wz, 22 + (capital ? 45 : 0) + (army ? Math.min(40, army.troops / 8) : 0));
    const name = pv.p.name;
    // Big centre-screen callout for the captures that matter (rate limited in the HUD).
    if (bigOne || this.time - this.lastCaptureCall > (this.cfg.hud.captureCalloutGapSec ?? 6)) {
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
          team: s.team, target: s.target, dmg: s.dmg, trailT: 0,
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
    this.view.effects.explosion(p.x1, TILE_H, p.z1, p.dmg > 400 ? 1.5 : 1.1);
    this.view.audio.play(p.dmg > 400 ? 'sfx_explosion_big' : 'sfx_explosion', { vol: 0.7, minGap: 0.1 });
    this.view.director?.note(p.x1, p.z1, 6 + Math.min(20, p.dmg / 40));
    if (p.dmg > 120) this.view.camera.shake(p.dmg > 600 ? 6 : 3.5);
    if (p.dmg > 300) this.view.hud.flash(Math.min(0.5, p.dmg / 2000 + 0.15));
    pv.burnT = Math.max(pv.burnT, 4);
    if (pv.owner === p.team || this.round.phase !== 'play') return;
    const dmg = Math.min(pv.garrison, p.dmg);
    pv.garrison -= dmg;
    if (dmg >= 1) this.view.floater(pv, `-${fmt(dmg)}`, 0xff4a3a);
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
    Object.assign(this.drama, { leader: 0, lastLeaderCall: this.time, lastRivalCall: this.time, said60: false, said30: false });
    for (const pv of this.prov.values()) {
      pv.owner = 0; pv.garrison = this.neutralGarrison(pv.p); pv.burnT = 0;
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
    for (const p of this.players.values()) {
      p.coins = 0; p.likes = 0;
      this.teams.get(p.team).memberCount++;
    }
    let woke = 0;
    for (const team of this.teams.values()) if (team.memberCount > 0) { this.wakeTeam(team, false); woke++; }
    for (const pv of this.prov.values()) this.refreshMarker(pv.plate);
    // Prune stale held gifts.
    const maxAge = this.cfg.teams.pendingGiftMaxAgeMin * 60;
    for (const [name, pend] of this.pending) if (this.time - pend.ts > maxAge) this.pending.delete(name);

    this.view.hud.hideEnd();
    if (!first) {
      this.view.hud.banner(`${r.n}. TUR BAŞLADI!`, woke ? `${woke} şehir savaşa hazır` : 'Plakanı yaz, şehrini uyandır!');
      this.view.hud.feed(`${r.n}. tur başladı! ${woke ? `${woke} şehir sahada.` : 'Plakanı yaz ve katıl!'}`, 0xffd166, 'hourglass', true);
      this.view.audio.play('sfx_round_start', { vol: 0.8, minGap: 0.5 });
      this.view.audio.play('sfx_horn', { vol: 0.6, minGap: 1 });
    }
    this.view.audio.playMusic('music_main');
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

  endRound(winner) {
    const r = this.round;
    if (r.phase !== 'play') return;
    const standings = this.standings();
    if (!winner && standings.length) winner = standings[0];
    r.phase = 'end';
    r.endLeft = this.cfg.round.endScreenSec;
    r.winner = winner;
    for (const a of this.armies) if (a.state !== 'done') a.state = 'done';
    for (const s of this.sieges) s.done = true;
    this.projectiles.length = 0;
    const gifters = this.topGifters(3);
    this.view.hud.showEnd({
      round: r.n,
      winner: winner ? { name: winner.name, plate: winner.plate, code: this.codeOf(winner.plate), colorHex: winner.colorHex, provinces: winner.provinces, commander: winner.commander } : null,
      top: standings.slice(0, 5).map((t) => ({ name: t.name, plate: t.plate, code: this.codeOf(t.plate), colorHex: t.colorHex, provinces: t.provinces, members: t.memberCount })),
      gifters,
      sec: this.cfg.round.endScreenSec,
    });
    this.view.audio.playMusic('music_victory');
    this.view.audio.play('sfx_victory', { vol: 0.8, minGap: 1 });
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
      players: this.players.size, teams: standings.length, pending: this.pending.size,
    };
  }
}

export { hexCss, gen };
