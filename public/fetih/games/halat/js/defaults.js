// Built-in defaults. config.json (same shape) is merged on top at load, then streamer
// settings from the bridge on top of that. Keep config.json in sync with this file.

export const DEFAULT_CONFIG = {
  title: 'HALAT ÇEKME',
  teams: [
    { id: 1, name: 'Kırmızı', color: '#e63946', key: '1', words: ['kırmızı', 'kirmizi', 'kırmızı takım', 'red'] },
    { id: 2, name: 'Mavi', color: '#2f7cf6', key: '2', words: ['mavi', 'mavi takım', 'blue'] },
  ],
  join: {
    resetEachRound: false, // true: everybody re-joins every round
    allowEmojiSuffix: true, // "1 🔥" also joins (the emoji becomes the badge)
  },
  round: {
    lobbySec: 5, // between rounds, before the countdown
    countdownSec: 3, // "3, 2, 1" (+ whistle)
    durationSec: 90, // play time
    endingPitSec: 8, // fall sequence after a pit win
    endingTimeSec: 5, // shorter fall when time ran out
    resultSec: 10, // result hold
    minMembers: 1, // the lobby waits until this many viewers joined (total)
    drawEpsilon: 0.01, // |rope| below this at time-out = draw
  },
  force: {
    perMember: 1.0, // base pull of one member
    memberExponent: 0.6, // crowd force = perMember * n^exponent (20 -> 6, 200 -> 24)
    neutral: 10, // added to the denominator: small forces move the rope slowly
    ropeMaxSpeed: 0.06, // rope units per second at total dominance (rope spans -1..1)
    inertiaSec: 1.1, // time constant of the rope speed (heavy feel)
    // Engagement forces are OFF by default (TikTok restricts streams that reward engagement).
    likeForce: 0, // force per like while active
    likeForceSec: 1.5,
    chatForce: 0, // force per member chat while active
    chatForceSec: 1.5,
    chatCooldownSec: 8,
    followForce: 0,
    shareForce: 0,
    bonusSec: 3,
  },
  gifts: {
    // Tier = highest entry whose min <= coins of ONE gift; count multiplies the force.
    // Gifts above a tier's min scale its force by (coins/min)^tierScaleExp (capped).
    tierScaleExp: 0.5,
    tierScaleMax: 3,
    maxHelpersPerGift: 3, // visible helper figures from one gift message (force still x count)
    maxHelpersPerTeam: 8,
    heldMaxViewers: 500, // viewers whose gifts are held until they join
    heldMaxGifts: 20,
    tiers: [
      { id: 'tug', label: 'Kısa asılma', min: 1, kind: 'tug', force: 6, sec: 1.2 },
      { id: 'helper_s', label: 'Yardımcı çekici', min: 5, kind: 'helper', force: 4, sec: 12, size: 0.92 },
      { id: 'helper_m', label: 'Güçlü Yardımcı', min: 10, kind: 'helper', force: 6, sec: 15, size: 1.0 },
      { id: 'helper_l', label: 'Usta Çekici', min: 30, kind: 'helper', force: 12, sec: 18, size: 1.08 },
      { id: 'strongman', label: 'Pehlivan', min: 99, kind: 'strongman', force: 30, sec: 25, units: 1 },
      { id: 'strongman2', label: 'Çifte Pehlivan', min: 199, kind: 'strongman', force: 30, sec: 30, units: 2 },
      { id: 'tractor', label: 'Traktör', min: 1000, kind: 'tractor', force: 120, sec: 20 },
      { id: 'giant', label: 'Dev', min: 5000, kind: 'giant', force: 300, sec: 25 },
    ],
  },
  visual: {
    pullersPerSide: 8, // full animated figures per side (alternating either side of the rope)
    crowdPerSide: 160, // cheap instanced crowd figures per side (the rest is a counter)
    maxPixelRatio: 1.5,
    antialias: true,
    shadows: true, // soft shadows from the arena's key light (off on weak devices)
    frontX: 3.05, // distance of the front puller from the pit centre
    slotGap: 0.56, // spacing of pullers along the rope
    pitHalf: 1.12, // half width of the pit along the rope
    travel: 1.9, // world units the rope moves between 0 and +-1 (front puller reaches the pit edge)
    heaveSec: 1.5, // shared pull rhythm
    nameTags: true,
    crowdCounter: true,
    maxParticles: 1400,
    slowMo: true,
    shake: 1,
  },
  camera: {
    fov: 50,
    pitchDeg: 40, // look-down angle
    span: 15.5, // world units across the band width at the target depth
    targetY: 0.9,
    targetZ: -1.4,
    drift: 1, // 0 = static camera
    push: 1, // push toward the losing edge
    hero: true, // short hero framing for tractor/giant arrivals
    // Used instead when the band is wide and short (the overlay's action band): framed on the
    // rope, the pit and the front of both lines so the pullers are the biggest thing on screen
    // (the far ends of long lines run out of frame).
    wide: { pitchDeg: 19, span: 10, targetY: 0.8, targetZ: 0.1 },
  },
  audio: {
    master: 0.9,
    music: 0.32,
    sfx: 0.8,
    maxVoices: 24,
    duckLevel: 0.35,
  },
};
