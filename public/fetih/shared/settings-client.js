// Streamer settings on a game page. The bridge sends each game page (connected with
// ?c=game&g=<id>) a message on connect and whenever the streamer saves:
//   { type: "settings", ts, game, values, stream, gameValues, defaults }
// `values` = stream-wide overrides merged with this game's overrides (only keys that differ from
// the default); `defaults` = the bridge's defaults for both scopes. This helper keeps the
// effective value of every key: override > bridge default > the page's own default.
//
//   const settings = new GameSettings({ 'round.sec': 90 });
//   settings.onChange((s) => applyVolumes(s.audio()));
//   bridge message handler: if (msg.type === 'settings') settings.apply(msg);

/** Stream-wide defaults (keep in sync with server/settings.js STREAM_DEFAULTS). */
export const STREAM_DEFAULTS = {
  'layout.chatTop': 1340,
  'layout.side': 60,
  'audio.masterPct': 100,
  'audio.musicPct': 32,
  'audio.sfxPct': 75,
  'audio.mute': false,
};

export class GameSettings {
  /** ownDefaults: this game's defaults (used before the bridge answers, and in demo mode). */
  constructor(ownDefaults = {}) {
    this.own = { ...STREAM_DEFAULTS, ...ownDefaults };
    this.bridgeDefaults = {};
    this.overrides = {};
    this.ts = 0;
    this._listeners = [];
  }

  /** Feed a { type: "settings" } message from the bridge. Returns true when applied. */
  apply(msg) {
    if (!msg || msg.type !== 'settings' || typeof msg.values !== 'object' || !msg.values) return false;
    this.overrides = { ...msg.values };
    if (msg.defaults && typeof msg.defaults === 'object') this.bridgeDefaults = { ...msg.defaults };
    this.ts = Number(msg.ts) || Date.now();
    for (const fn of this._listeners) {
      try { fn(this); } catch (e) { console.error('settings listener', e); }
    }
    return true;
  }

  /** Effective value of one key. */
  get(key) {
    if (Object.hasOwn(this.overrides, key)) return this.overrides[key];
    if (Object.hasOwn(this.bridgeDefaults, key)) return this.bridgeDefaults[key];
    return this.own[key];
  }

  /** All effective values. */
  all() {
    return { ...this.own, ...this.bridgeDefaults, ...this.overrides };
  }

  /** Volumes as 0..1 factors plus mute (for shared/audio.js SimpleAudio.setVolumes). */
  audio() {
    const pct = (k) => Math.max(0, Math.min(100, Number(this.get(k)) || 0)) / 100;
    return { master: pct('audio.masterPct'), music: pct('audio.musicPct'), sfx: pct('audio.sfxPct'), mute: this.get('audio.mute') === true };
  }

  /** TikTok safe-zone settings (for shared/zones.js). */
  zones() {
    return { chatTop: Number(this.get('layout.chatTop')), side: Number(this.get('layout.side')) };
  }

  onChange(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter((f) => f !== fn); };
  }
}
