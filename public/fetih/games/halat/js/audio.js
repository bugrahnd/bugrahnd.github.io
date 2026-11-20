// Web Audio: decoded SFX from the manifest with per-sound gaps and a voice cap, looping
// music with ducking, and small synthesized fallbacks (whistle, chime, splash, fanfare)
// for sounds the manifest does not have yet.

export class AudioManager {
  constructor(manifest, cfg, { mute = false, noMusic = false } = {}) {
    this.entries = (manifest && manifest.audio) || {};
    this.cfg = cfg;
    this.muted = mute;
    this.musicOn = !noMusic;
    this.buffers = new Map();
    this.lastPlay = new Map();
    this.voices = 0;
    this.music = null;
    this.wantMusic = null;
    this.ctx = null;
    this.onStateChange = null;
    this.loops = new Map();
    this.log = [];
    this.consoleLog = new URLSearchParams(location.search).get('seslog') === '1';
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = mute ? 0 : cfg.master;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = cfg.sfx;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? cfg.music : 0;
    this.duckGain = this.ctx.createGain();
    this.musicBus.connect(this.duckGain).connect(this.master);
    this.ctx.onstatechange = () => this.onStateChange && this.onStateChange(this.ctx.state);
    this._noise = null;
  }

  get blocked() { return !!this.ctx && this.ctx.state !== 'running' && !this.muted; }
  get ready() { return !!this.ctx && this.ctx.state === 'running' && !this.muted; }

  async load() {
    if (!this.ctx) return;
    await Promise.all(Object.entries(this.entries).map(async ([key, e]) => {
      if (!e?.path) return;
      try {
        const res = await fetch(e.path);
        if (!res.ok) return;
        this.buffers.set(key, await this.ctx.decodeAudioData(await res.arrayBuffer()));
      } catch { /* missing sound: fallback or silence */ }
    }));
    if (this.wantMusic) this.playMusic(this.wantMusic);
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') return this.ctx.resume().catch(() => {});
    return Promise.resolve();
  }

  has(key) { return this.buffers.has(key); }

  /** Keys loaded for a prefix (e.g. "sfx_heave_"). */
  keysWith(prefix) { return [...this.buffers.keys()].filter((k) => k.startsWith(prefix)); }

  /** Sound log (window.__halat.audioLog): [{ t, key, ok }]; also on the console with ?seslog=1. */
  _log(key, ok, extra = '') {
    const t = Math.round(performance.now()) / 1000;
    this.log.push({ t, key, ok, extra });
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
    if (this.consoleLog) console.info(`[ses] ${t.toFixed(2)} ${key}${extra ? ' ' + extra : ''}${ok ? '' : ' (çalmadı)'}`);
  }

  /**
   * A looping sound on the effects bus at a volume (0 fades it out). Used for the rope
   * tension, the tractor engine and the crowd bed. Cheap to call every frame.
   */
  setLoop(key, vol) {
    const L = this.loops.get(key);
    if (!this.ctx || !this.ready) {
      if (L && vol <= 0) this.loops.delete(key);
      return;
    }
    const now = this.ctx.currentTime;
    if (vol <= 0.001) {
      if (L) {
        this.loops.delete(key);
        L.g.gain.cancelScheduledValues(now); L.g.gain.setTargetAtTime(0, now, 0.25);
        setTimeout(() => { try { L.src.stop(); } catch { /* ended */ } L.src.disconnect(); L.g.disconnect(); }, 1500);
        this._log(key, true, 'döngü bitti');
      }
      return;
    }
    if (!L) {
      const buf = this.buffers.get(key);
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, now);
      src.connect(g).connect(this.sfxBus);
      src.start();
      this.loops.set(key, { src, g, vol: -1 });
      this._log(key, true, 'döngü');
    }
    const cur = this.loops.get(key);
    if (Math.abs(cur.vol - vol) > 0.01) { cur.vol = vol; cur.g.gain.setTargetAtTime(vol, now, 0.3); }
  }

  /** Play a sound; returns true when it started. o: { vol, rate, minGap } */
  play(key, o = {}) {
    if (!this.ready) { if (this.ctx && !this.muted) this._log(key, false, 'ses kilitli'); return false; }
    const buf = this.buffers.get(key);
    const now = this.ctx.currentTime;
    if (now - (this.lastPlay.get(key) ?? -9) < (o.minGap ?? 0.06)) return false;
    if (this.voices >= this.cfg.maxVoices) { this._log(key, false, 'ses sınırı'); return false; }
    this._log(key, true);
    if (!buf) return this._synth(key, o);
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
    return true;
  }

  /** One random loaded sound with this prefix (sfx_heave_*). */
  playAny(prefix, o = {}) {
    const keys = this.keysWith(prefix);
    if (!keys.length) return this._synth(prefix, o);
    return this.play(keys[Math.floor(Math.random() * keys.length)], { ...o, minGap: o.minGap ?? 0.2 });
  }

  duck(sec = 3, level = this.cfg.duckLevel ?? 0.35) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const p = this.duckGain.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(level, now + 0.2);
    p.setValueAtTime(level, now + sec);
    p.linearRampToValueAtTime(1, now + sec + 1);
  }

  playMusic(key) {
    this.wantMusic = key;
    if (!this.ctx) return;
    if (this.music && this.music.key === key) return;
    const buf = this.buffers.get(key);
    if (!buf) return;
    const now = this.ctx.currentTime;
    if (this.music) this._fadeOut(this.music, 1.5);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = this.entries[key]?.loop !== false;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(1, now + 1.5);
    src.connect(g).connect(this.musicBus);
    src.start();
    this.music = { key, src, gain: g };
    this._log(key, true, 'müzik');
  }

  _fadeOut(m, sec) {
    const now = this.ctx.currentTime;
    m.gain.gain.cancelScheduledValues(now);
    m.gain.gain.setValueAtTime(m.gain.gain.value, now);
    m.gain.gain.linearRampToValueAtTime(0, now + sec);
    setTimeout(() => { try { m.src.stop(); } catch {} m.src.disconnect(); m.gain.disconnect(); }, sec * 1000 + 200);
  }

  applyVolumes(mute = null) {
    if (mute !== null) this.muted = !!mute;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.cfg.sfx, t, 0.1);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? this.cfg.music : 0, t, 0.2);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.cfg.master, t, 0.05);
  }

  toggleMusic() { this.musicOn = !this.musicOn; this.applyVolumes(); return this.musicOn; }
  toggleMute() { this.muted = !this.muted; this.applyVolumes(); return this.muted; }

  // ---------- synthesized fallbacks ----------

  _noiseBuf() {
    if (this._noise) return this._noise;
    const len = this.ctx.sampleRate;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = b;
    return b;
  }

  _env(dur, vol) {
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.sfxBus);
    this.voices++;
    setTimeout(() => { this.voices--; g.disconnect(); }, dur * 1000 + 100);
    return g;
  }

  _tone(freq, dur, vol, type = 'sine', delay = 0) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
    this.voices++;
    o.onended = () => { this.voices--; o.disconnect(); g.disconnect(); };
    return o;
  }

  _synth(key, o = {}) {
    const now = this.ctx.currentTime;
    const sk = `~${key}`;
    if (now - (this.lastPlay.get(sk) ?? -9) < (o.minGap ?? 0.12)) return false;
    this.lastPlay.set(sk, now);
    const v = (o.vol ?? 1) * 0.35;
    if (key === 'sfx_whistle') {
      const osc = this._tone(2900, o.long ? 0.9 : 0.45, v * 0.6, 'sine');
      const lfo = this.ctx.createOscillator(); const lg = this.ctx.createGain();
      lfo.frequency.value = 38; lg.gain.value = 140;
      lfo.connect(lg).connect(osc.frequency); lfo.start(); lfo.stop(now + 1);
      return true;
    }
    if (key.startsWith('sfx_gift')) {
      const base = key.endsWith('big') ? 523 : key.endsWith('medium') ? 659 : 784;
      [0, 0.07, 0.14].forEach((d, i) => this._tone(base * [1, 1.26, 1.5][i], 0.35, v * 0.5, 'triangle', d));
      return true;
    }
    if (key === 'sfx_win') {
      [0, 0.12, 0.24, 0.4].forEach((d, i) => this._tone([523, 659, 784, 1046][i], 0.5, v * 0.5, 'square', d));
      return true;
    }
    if (key === 'sfx_lose') {
      [0, 0.18].forEach((d, i) => this._tone([392, 311][i], 0.45, v * 0.35, 'triangle', d));
      return true;
    }
    if (key === 'sfx_splash' || key === 'sfx_giant_step' || key === 'sfx_rope') {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuf();
      const f = this.ctx.createBiquadFilter();
      f.type = key === 'sfx_splash' ? 'bandpass' : 'lowpass';
      f.frequency.value = key === 'sfx_splash' ? 900 : key === 'sfx_rope' ? 400 : 140;
      const dur = key === 'sfx_rope' ? 0.18 : 0.5;
      src.connect(f).connect(this._env(dur, v * (key === 'sfx_giant_step' ? 2.5 : 1.2)));
      src.start(); src.stop(now + dur + 0.05);
      return true;
    }
    return false; // no fallback (cheer, heave, music): silence
  }
}
