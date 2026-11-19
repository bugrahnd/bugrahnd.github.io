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

  // ---- Hediyeler ----
  const strip = v['gifts.strip'];
  const baseStrip = B.hud.giftStrip || [];
  if (Array.isArray(strip) && strip.length === 4) {
    // Name / coins / effect from the panel; icon and the "+" mark stay from the config.
    C.hud.giftStrip = strip.map((g, i) => ({
      ...(baseStrip[i] || {}),
      name: String(g?.name ?? '').slice(0, 40),
      coins: Math.max(1, Math.floor(Number(g?.coins) || 1)),
      effect: String(g?.effect ?? '').slice(0, 40),
    }));
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

  // ---- Bedava hareketler ----
  C.engage.chatTroops = isNum(v['engage.chatTroops'], 0, 50) ? v['engage.chatTroops'] : B.engage.chatTroops;
  C.engage.chatCooldownSec = isNum(v['engage.chatCooldownSec'], 0, 60) ? v['engage.chatCooldownSec'] : B.engage.chatCooldownSec;
  C.troops.followBonus = isNum(v['troops.followBonus'], 0, 1000) ? v['troops.followBonus'] : B.troops.followBonus;
  C.troops.shareBonus = isNum(v['troops.shareBonus'], 0, 1000) ? v['troops.shareBonus'] : B.troops.shareBonus;
  // "How fast likes fill morale": a multiplier on morale per like.
  C.morale.perLike = B.morale.perLike * (isNum(v['morale.likeSpeed'], 0.25, 4) ? v['morale.likeSpeed'] : 1);

  // ---- Kamera ve ses ----
  C.visual.cameraAttention = isBool(v['camera.director']) ? v['camera.director'] : B.visual.cameraAttention !== false;
  C.audio.music = isNum(v['audio.musicPct'], 0, 100) ? v['audio.musicPct'] / 100 : B.audio.music;
  C.audio.sfx = isNum(v['audio.sfxPct'], 0, 100) ? v['audio.sfxPct'] / 100 : B.audio.sfx;

  // ---- Ekran ----
  const show = {};
  for (const [key, id] of Object.entries(SHOW_KEYS)) show[id] = v[key] !== false;
  return {
    show,
    cta: {
      text: isStr(v['cta.text'], 24) ? v['cta.text'].trim() : 'PLAKANI YAZ:',
      example: isStr(v['cta.example'], 12) ? v['cta.example'].trim() : '34',
    },
    giftStrip: C.hud.giftStrip,
    mute: v['audio.mute'] === true,
    director: C.visual.cameraAttention,
  };
}
