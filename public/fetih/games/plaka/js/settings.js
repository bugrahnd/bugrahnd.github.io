// Streamer settings from the bridge ({ type: "settings", values }) applied on top of the
// loaded config/game.json. The game keeps a pristine copy of its own config (`base`) and,
// for every known key, writes either the override or the base value back into the live
// config object, so removing an override restores this page's own default.
// Game systems read config values live, so most changes take effect immediately; the
// round length is read when a round starts (applies from the next round).

const clone = (o) => JSON.parse(JSON.stringify(o));

// Pace presets: attack interval (s), march speed multiplier, battle time (s).
// 'normal' = the values in config/game.json.
export const PACE_PRESETS = {
  sakin: { attackMult: 1.5, speedMult: 0.75, battleMult: 1.3 },
  normal: { attackMult: 1, speedMult: 1, battleMult: 1 },
  hizli: { attackMult: 0.62, speedMult: 1.35, battleMult: 0.75 },
};

const CURVE_COINS = [1, 10, 100, 1000, 5000];

// The one calm how-to-join line (streamer setting cta.text; keep in sync with server/settings.js).
export const DEFAULT_CTA = 'Katılmak için plakanı yaz:';

// HUD blocks that can be hidden (setting key -> Hud block id).
export const SHOW_KEYS = {
  'show.cityBoard': 'cityBoard',
  'show.gifterBoard': 'gifterBoard',
  'show.likers': 'likers',
  'show.leader': 'leader',
  'show.credit': 'credit',
  'show.imperative': 'imperative',
  'show.giftStrip': 'giftStrip',
  'show.session': 'session',
  'show.minimap': 'minimap',
  'show.hucumBar': 'hucumBar',
};

const isNum = (v, a, b) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
const isBool = (v) => typeof v === 'boolean';
const isStr = (v, max) => typeof v === 'string' && v.trim() !== '' && Array.from(v).length <= max;

/**
 * Writes settings into `config` (mutated in place). `base` is the untouched config.
 * Invalid values are ignored defensively (the bridge validates too).
 * Returns { show, cta, giftStrip, audio, director } describing presentation state.
 */
export function applySettings(config, base, values = {}) {
  const v = values && typeof values === 'object' ? values : {};
  const C = config; const B = base;

  // ---- Tur ----
  C.round.durationSec = isNum(v['round.durationMin'], 1, 30) ? Math.round(v['round.durationMin'] * 60) : B.round.durationSec;
  C.round.endScreenSec = isNum(v['round.endScreenSec'], 5, 60) ? v['round.endScreenSec'] : B.round.endScreenSec;
  C.round.finaleSec = isNum(v['round.finaleSec'], 0, 120) ? v['round.finaleSec'] : B.round.finaleSec;
  C.round.earlyWinShare = isNum(v['round.earlyWinPct'], 30, 100) ? v['round.earlyWinPct'] / 100 : B.round.earlyWinShare;
  C.round.keepTeamsBetweenRounds = isBool(v['round.keepTeams']) ? v['round.keepTeams'] : B.round.keepTeamsBetweenRounds;

  // ---- Hız ----
  const pace = PACE_PRESETS[v.pace] || PACE_PRESETS.normal;
  C.war.attackIntervalSec = +(B.war.attackIntervalSec * pace.attackMult).toFixed(2);
  C.war.attackJitterSec = +(B.war.attackJitterSec * pace.attackMult).toFixed(2);
  C.war.battleSec = +(B.war.battleSec * pace.battleMult).toFixed(2);
  C.war.speed = Object.fromEntries(Object.entries(B.war.speed).map(([k, s]) => [k, +(s * pace.speedMult).toFixed(2)]));
  // The pause before a winning army marches on follows the battle time.
  if (typeof B.war.momentumPauseSec === 'number') C.war.momentumPauseSec = +(B.war.momentumPauseSec * pace.battleMult).toFixed(2);

  // ---- Savaş ----
  C.war.momentum = isBool(v['war.momentum']) ? v['war.momentum'] : B.war.momentum !== false;
  C.war.maxFronts = isNum(v['war.maxFronts'], 1, 8) ? Math.round(v['war.maxFronts']) : B.war.maxFronts;

  // ---- Hediyeler ----
  const strip = v['gifts.strip'];
  const baseStrip = B.hud.giftStrip || [];
  if (Array.isArray(strip) && strip.length >= 1 && strip.length <= 12) {
    // Gift ladder from the panel (variable length). The game's own fallback icon comes from
    // the config entry with the same (or the nearest lower) coin value; id / plus from the panel.
    C.hud.giftStrip = strip.map((g) => {
      const coins = Math.max(1, Math.floor(Number(g?.coins) || 1));
      const like = baseStrip.find((b) => b.coins === coins) || [...baseStrip].reverse().find((b) => b.coins <= coins) || baseStrip[0] || {};
      const o = { icon: like.icon, name: String(g?.name ?? '').slice(0, 40), coins, effect: String(g?.effect ?? '').slice(0, 40) };
      const id = Math.floor(Number(g?.id));
      if (id > 0) o.id = id;
      if (g?.plus === true) o.plus = true;
      return o;
    });
  } else {
    C.hud.giftStrip = clone(baseStrip);
  }
  const curve = v['gifts.curve'];
  if (Array.isArray(curve) && curve.length === CURVE_COINS.length && curve.every((n) => isNum(n, 1, 100000))) {
    const pts = CURVE_COINS.map((c, i) => [c, curve[i]]);
    // Keep the config's points above 5000 coins, scaled with the new 5000-coin value.
    const b5000 = (B.troops.giftCurve || []).find((p) => p[0] === 5000);
    const k = b5000 && b5000[1] > 0 ? curve[4] / b5000[1] : 1;
    for (const p of B.troops.giftCurve || []) if (p[0] > 5000) pts.push([p[0], Math.max(curve[4], Math.round(p[1] * k))]);
    C.troops.giftCurve = pts;
  } else {
    C.troops.giftCurve = clone(B.troops.giftCurve);
  }

  // ---- Beğeni ve moral; etkileşim ödülleri (varsayılan 0) ----
  C.engage.chatTroops = isNum(v['engage.chatTroops'], 0, 50) ? v['engage.chatTroops'] : B.engage.chatTroops;
  C.engage.chatCooldownSec = isNum(v['engage.chatCooldownSec'], 0, 60) ? v['engage.chatCooldownSec'] : B.engage.chatCooldownSec;
  C.engage.chatTroopCap = isNum(v['engage.chatTroopCap'], 0, 1000) ? v['engage.chatTroopCap'] : B.engage.chatTroopCap;
  C.engage.likeTroopCap = isNum(v['engage.likeTroopCap'], 0, 1000) ? v['engage.likeTroopCap'] : B.engage.likeTroopCap;
  C.troops.followBonus = isNum(v['troops.followBonus'], 0, 1000) ? v['troops.followBonus'] : B.troops.followBonus;
  C.troops.shareBonus = isNum(v['troops.shareBonus'], 0, 1000) ? v['troops.shareBonus'] : B.troops.shareBonus;
  C.engage.likesPerTroop = isNum(v['engage.likesPerTroop'], 0, 1000) ? v['engage.likesPerTroop'] : B.engage.likesPerTroop;
  C.engage.likeMilestone = isNum(v['engage.likeMilestone'], 10, 10000) ? v['engage.likeMilestone'] : B.engage.likeMilestone;
  C.engage.pendingLikesMax = isNum(v['engage.pendingLikesMax'], 0, 100000) ? v['engage.pendingLikesMax'] : B.engage.pendingLikesMax;
  C.hud.giftStripTroops = isBool(v['gifts.showTroops']) ? v['gifts.showTroops'] : B.hud.giftStripTroops !== false;
  // "How fast likes fill morale": a multiplier on morale per like.
  C.morale.perLike = B.morale.perLike * (isNum(v['morale.likeSpeed'], 0.25, 4) ? v['morale.likeSpeed'] : 1);

  // ---- Kamera ve ses ----
  C.visual.cameraAttention = isBool(v['camera.director']) ? v['camera.director'] : B.visual.cameraAttention !== false;
  C.audio.music = isNum(v['audio.musicPct'], 0, 100) ? v['audio.musicPct'] / 100 : B.audio.music;
  C.audio.sfx = isNum(v['audio.sfxPct'], 0, 100) ? v['audio.sfxPct'] / 100 : B.audio.sfx;
  // Stream-wide master volume (panel "Yayın ayarları"), on top of this game's own master level.
  C.audio.master = B.audio.master * (isNum(v['audio.masterPct'], 0, 100) ? v['audio.masterPct'] / 100 : 1);

  // ---- Ekran ----
  const show = {};
  for (const [key, id] of Object.entries(SHOW_KEYS)) show[id] = v[key] !== false;
  return {
    show,
    cta: {
      text: isStr(v['cta.text'], 30) ? v['cta.text'].trim() : DEFAULT_CTA,
      example: isStr(v['cta.example'], 12) ? v['cta.example'].trim() : '34',
    },
    title: isStr(v['title.text'], 20) ? v['title.text'].trim() : 'PLAKA SAVAŞLARI',
    zones: {
      chatTop: isNum(v['layout.chatTop'], 1150, 1500) ? v['layout.chatTop'] : undefined,
      side: isNum(v['layout.side'], 0, 120) ? v['layout.side'] : undefined,
    },
    giftHeading: isStr(v['gifts.heading'], 24) ? v['gifts.heading'].trim() : (B.hud.giftHeading || 'HEDİYELER VE ORDULAR'),
    giftStrip: C.hud.giftStrip,
    giftStripTroops: C.hud.giftStripTroops,
    mute: v['audio.mute'] === true,
    director: C.visual.cameraAttention,
  };
}
