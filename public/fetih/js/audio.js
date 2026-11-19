// Web Audio: decoded SFX buffers with per-sound throttling, looping music with
// crossfades, mute options and autoplay-unlock handling.
export class AudioManager {
  constructor(manifest, config, { mute = false, noMusic = false } = {}) {
    this.entries = manifest.audio || {};
    this.cfg = config.audio;
    this.muted = mute;
    this.musicOn = !noMusic;
    this.buffers = new Map();
    this.lastPlay = new Map();
    this.voices = 0;
    this.music = null; // { key, src, gain }
    this.wantMusic = null;
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
    this.musicBus.connect(this.master);
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
    if (this.wantMusic) this.playMusic(this.wantMusic);
  }

  /** Try to start the context (works without a gesture in OBS). */
  resume() {
    if (this.ctx && this.ctx.state !== 'running') return this.ctx.resume().catch(() => {});
    return Promise.resolve();
  }

  /**
   * @param {string} key manifest audio key
   * @param {object} o { vol, rate, minGap (s), detune }
   */
  play(key, o = {}) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const buf = this.buffers.get(key);
    if (!buf) return;
    const now = this.ctx.currentTime;
    const gap = o.minGap ?? 0.06;
    if (now - (this.lastPlay.get(key) ?? -1) < gap) return;
    if (this.voices >= this.cfg.maxVoices) return;
    this.lastPlay.set(key, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1 + (Math.random() - 0.5) * 0.08;
    const g = this.ctx.createGain();
    g.gain.value = o.vol ?? 1;
    src.connect(g).connect(this.sfxBus);
    this.voices++;
    src.onended = () => { this.voices--; src.disconnect(); g.disconnect(); };
    src.start();
  }

  playMusic(key) {
    this.wantMusic = key;
    if (!this.ctx) return;
    if (this.music && this.music.key === key) return;
    const buf = this.buffers.get(key);
    if (!buf) return;
    const now = this.ctx.currentTime;
    if (this.music) {
      const old = this.music;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + 1.5);
      setTimeout(() => { try { old.src.stop(); } catch {} old.src.disconnect(); old.gain.disconnect(); }, 1700);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!this.entries[key]?.loop;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(1, now + 1.5);
    src.connect(g).connect(this.musicBus);
    src.start();
    this.music = { key, src, gain: g };
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
