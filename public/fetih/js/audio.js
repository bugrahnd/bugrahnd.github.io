// Web Audio: decoded SFX buffers with per-sound throttling, per-category rate limits, one war
// horn at a time (capped length, faded tail), music that alternates tracks with crossfades,
// music ducking under big announcements, mute options and autoplay-unlock handling.

// Sound categories by key (rate limits and the horn rule work per category).
function categoryOf(key) {
  if (key.startsWith('sfx_capture')) return 'capture';
  if (/^sfx_(clash|hit|swing|wood_hit)/.test(key)) return 'clash';
  if (key.startsWith('sfx_explosion')) return 'explosion';
  if (key.startsWith('sfx_horn')) return 'horn';
  if (key.startsWith('sfx_gift') || key === 'sfx_coins') return 'gift';
  if (key === 'sfx_join' || key === 'sfx_march') return 'crowd';
  return 'misc';
}

// Max plays per second per category (sliding 1 s window), on top of the voice cap.
// Overridable with audio.ratePerSec in the game config.
const RATE_PER_SEC = { capture: 2, clash: 4, explosion: 3, gift: 6, crowd: 5, horn: 1, hucum: 2, misc: 8 };
const CROSSFADE_SEC = 2.5;

export class AudioManager {
  constructor(manifest, config, { mute = false, noMusic = false } = {}) {
    this.entries = manifest.audio || {};
    this.cfg = config.audio;
    this.muted = mute;
    this.musicOn = !noMusic;
    this.buffers = new Map();
    this.lastPlay = new Map();
    this.recent = new Map(); // category -> recent play times (s)
    this.voices = 0;
    this.horn = null; // { src, gain, end } while a horn sounds
    this.music = null; // { key, src, gain }
    this.wantMusic = null;
    this.cycle = null; // { keys, i, timer } alternating music
    this.trace = null; // ?audiolog=1: [{ t, key, ok, why }] (verification without hearing)
    this.ctx = null;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('no audio', e);
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = mute ? 0 : this.cfg.master;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.cfg.sfx;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? this.cfg.music : 0;
    // Ducking stage after the music volume (announcements pull the music down briefly).
    this.duckGain = this.ctx.createGain();
    this.duckGain.gain.value = 1;
    this.musicBus.connect(this.duckGain).connect(this.master);
    this.onStateChange = null;
    this.ctx.onstatechange = () => this.onStateChange && this.onStateChange(this.ctx.state);
  }

  get blocked() {
    return !!this.ctx && this.ctx.state !== 'running' && !this.muted;
  }

  async load() {
    if (!this.ctx) return;
    const jobs = Object.entries(this.entries).map(async ([key, e]) => {
      try {
        const res = await fetch(e.path);
        const buf = await res.arrayBuffer();
        this.buffers.set(key, await this.ctx.decodeAudioData(buf));
      } catch (err) {
        console.warn('audio load failed', key, err);
      }
    });
    await Promise.all(jobs);
    if (this.cycle) this._cycleStart();
    else if (this.wantMusic) this.playMusic(this.wantMusic);
  }

  /** Try to start the context (works without a gesture in OBS). */
  resume() {
    if (this.ctx && this.ctx.state !== 'running') return this.ctx.resume().catch(() => {});
    return Promise.resolve();
  }

  _log(key, ok, why = '') {
    if (!this.trace) return;
    this.trace.push({ t: +(performance.now() / 1000).toFixed(2), key, ok, why });
    if (this.trace.length > 2000) this.trace.splice(0, 500);
  }

  /**
   * @param {string} key manifest audio key
   * @param {object} o { vol, rate, minGap (s), cat (category override, own rate limit) }
   * Returns true when the sound started.
   */
  play(key, o = {}) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') { this._log(key, false, 'muted/locked'); return false; }
    const buf = this.buffers.get(key);
    if (!buf) { this._log(key, false, 'not loaded'); return false; }
    const now = this.ctx.currentTime;
    const gap = o.minGap ?? 0.06;
    if (now - (this.lastPlay.get(key) ?? -1) < gap) { this._log(key, false, 'minGap'); return false; }
    const cat = o.cat || categoryOf(key);
    // One horn at a time: a new horn never stacks on one still sounding.
    if (cat === 'horn' && this.horn && now < this.horn.end) { this._log(key, false, 'horn busy'); return false; }
    const rate = this.cfg.ratePerSec?.[cat] ?? RATE_PER_SEC[cat] ?? 8;
    const times = (this.recent.get(cat) || []).filter((t) => now - t < 1);
    if (times.length >= rate) { this.recent.set(cat, times); this._log(key, false, `rate ${cat}`); return false; }
    if (this.voices >= this.cfg.maxVoices) { this._log(key, false, 'voices'); return false; }
    times.push(now);
    this.recent.set(cat, times);
    this.lastPlay.set(key, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1 + (Math.random() - 0.5) * 0.08;
    const g = this.ctx.createGain();
    const vol = o.vol ?? 1;
    g.gain.value = vol;
    src.connect(g).connect(this.sfxBus);
    this.voices++;
    src.onended = () => { this.voices--; src.disconnect(); g.disconnect(); if (this.horn?.src === src) this.horn = null; };
    src.start();
    let len = buf.duration / src.playbackRate.value;
    if (cat === 'horn') {
      // Long horns are cut to hornMaxSec with a fade, so they never ride over the next callout.
      const max = this.cfg.hornMaxSec ?? 5;
      const fade = this.cfg.hornFadeSec ?? 1.2;
      if (len > max) {
        g.gain.setValueAtTime(vol, now + max - fade);
        g.gain.linearRampToValueAtTime(0.0001, now + max);
        src.stop(now + max + 0.05);
        len = max;
      }
      this.horn = { src, gain: g, end: now + len };
    }
    this._log(key, true, cat);
    return true;
  }

  /**
   * Pull the music down for a big announcement: to `level` within 0.2 s, back up over
   * 1 s after `sec` seconds. Overlapping calls extend the duck.
   */
  duck(sec = 4, level = this.cfg.duckLevel ?? 0.3) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const until = Math.max(now + sec, this._duckUntil ?? 0);
    this._duckUntil = until;
    const p = this.duckGain.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(level, now + 0.2);
    p.setValueAtTime(level, until);
    p.linearRampToValueAtTime(1, until + 1);
    this._log('(duck)', true, `${sec}s`);
  }

  /** Fade the music out (round end beat); the next playMusic fades in as usual. */
  stopMusic(fadeSec = 1) {
    this._cycleStop();
    this.wantMusic = null;
    if (!this.ctx || !this.music) return;
    this._fadeOut(this.music, fadeSec);
    this.music = null;
    this._log('(music off)', true);
  }

  _fadeOut(m, sec) {
    const now = this.ctx.currentTime;
    m.gain.gain.cancelScheduledValues(now);
    m.gain.gain.setValueAtTime(m.gain.gain.value, now);
    m.gain.gain.linearRampToValueAtTime(0, now + sec);
    setTimeout(() => { try { m.src.stop(); } catch {} m.src.disconnect(); m.gain.disconnect(); }, sec * 1000 + 200);
  }

  /** One track (a loop, or a one-shot like the victory theme). Cancels any alternation. */
  playMusic(key) {
    this._cycleStop();
    this._startTrack(key);
  }

  _startTrack(key, fade = 1.5) {
    this.wantMusic = key;
    if (!this.ctx) return false;
    if (this.music && this.music.key === key) return true;
    const buf = this.buffers.get(key);
    if (!buf) return false;
    const now = this.ctx.currentTime;
    if (this.music) this._fadeOut(this.music, fade);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!this.entries[key]?.loop;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(1, now + fade);
    src.connect(g).connect(this.musicBus);
    src.start();
    this.music = { key, src, gain: g };
    this._log(`(music ${key})`, true);
    return true;
  }

  /**
   * Alternate looping tracks: each plays one full pass, then crossfades into the next
   * (keys[0] first). The track already playing is kept if it is keys[0].
   */
  playMusicCycle(keys) {
    const list = keys.filter((k) => this.entries[k]);
    if (!list.length) return;
    if (list.length === 1) { this.playMusic(list[0]); return; }
    this._cycleStop();
    this.cycle = { keys: list, i: 0, timer: null };
    this._cycleStart();
  }

  _cycleStart() {
    const c = this.cycle;
    if (!c) return;
    const key = c.keys[c.i % c.keys.length];
    const fresh = !(this.music && this.music.key === key);
    if (!this._startTrack(key, CROSSFADE_SEC)) return; // buffers not loaded yet: load() retries
    const dur = this.buffers.get(key)?.duration || 40;
    // A track kept from before is not restarted: switch after the rest of a pass at most.
    const wait = Math.max(5, (fresh ? dur : dur / 2) - CROSSFADE_SEC);
    clearTimeout(c.timer);
    c.timer = setTimeout(() => {
      if (this.cycle !== c) return;
      c.i++;
      this._cycleStart();
    }, wait * 1000);
  }

  _cycleStop() {
    if (this.cycle) clearTimeout(this.cycle.timer);
    this.cycle = null;
  }

  /** Streamer settings: re-read cfg.music / cfg.sfx and set mute (null = leave as is). */
  applyVolumes(mute = null) {
    if (mute !== null) this.muted = !!mute;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.cfg.sfx, t, 0.1);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? this.cfg.music : 0, t, 0.2);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.cfg.master, t, 0.05);
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.musicOn ? this.cfg.music : 0, this.ctx.currentTime, 0.2);
    return this.musicOn;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.cfg.master, this.ctx.currentTime, 0.05);
    return this.muted;
  }
}
