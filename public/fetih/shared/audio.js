// Small Web Audio helper for games: master / music / sfx buses, the streamer's volume settings,
// and autoplay handling. Browsers (and TikTok LIVE Studio) may start an AudioContext suspended
// until a user gesture; `blocked` tells the page to show a small "sesi aç" button.
// Inside the player shell the game runs in an iframe that has allow="autoplay".
//
//   const audio = new SimpleAudio({ mute: urlMute });
//   await audio.load({ hit: 'assets/hit.mp3', music: 'assets/music.mp3' });
//   audio.unlockOn(window);                  // resume on the first pointer / key press
//   audio.setVolumes(settings.audio());      // from shared/settings-client.js
//   audio.play('hit'); audio.playMusic('music');

export class SimpleAudio {
  constructor({ mute = false } = {}) {
    this.forceMute = !!mute; // ?mute=1
    this.vol = { master: 1, music: 0.32, sfx: 0.75, mute: false };
    this.buffers = new Map();
    this.ctx = null;
    this.blocked = true;
    this.onStateChange = null;
    this._music = null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.blocked = this.ctx.state !== 'running';
      this.ctx.onstatechange = () => { this.blocked = this.ctx.state !== 'running'; this.onStateChange?.(this.blocked); };
    } catch {
      this.ctx = null; // no Web Audio: everything below is a no-op
    }
    this._applyVolumes();
  }

  /** { name: url } -> decoded buffers. Missing files are skipped with a console warning. */
  async load(map) {
    if (!this.ctx) return;
    await Promise.all(Object.entries(map).map(async ([name, url]) => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        this.buffers.set(name, await this.ctx.decodeAudioData(await r.arrayBuffer()));
      } catch (e) { console.warn('ses yüklenemedi', url, e.message || e); }
    }));
  }

  /** Try to start audio (call from a user gesture, or once at start: autoplay may allow it). */
  async resume() {
    if (!this.ctx) return;
    try { await this.ctx.resume(); } catch { /* still blocked */ }
    this.blocked = this.ctx.state !== 'running';
  }

  /** Resume on the first pointer / key / touch on `target` (window by default). */
  unlockOn(target = window) {
    const go = () => { this.resume(); };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) target.addEventListener(ev, go, { passive: true });
    this.resume();
  }

  /** { master, music, sfx } as 0..1 factors and mute (GameSettings.audio()). */
  setVolumes(v = {}) {
    this.vol = { ...this.vol, ...v };
    this._applyVolumes();
  }

  _applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const muted = this.forceMute || this.vol.mute;
    this.master.gain.setTargetAtTime(muted ? 0 : this.vol.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music, t, 0.2);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.1);
  }

  /** One-shot effect. opts: { vol = 1, rate = 1 } */
  play(name, { vol = 1, rate = 1 } = {}) {
    const buf = this.buffers.get(name);
    if (!buf || !this.ctx || this.blocked) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.sfxBus);
    src.start();
  }

  /** Looping background music (replaces the current track). */
  playMusic(name) {
    const buf = this.buffers.get(name);
    if (!buf || !this.ctx) return;
    this.stopMusic();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.musicBus);
    src.start();
    this._music = src;
  }

  stopMusic() {
    try { this._music?.stop(); } catch { /* already stopped */ }
    this._music = null;
  }
}
