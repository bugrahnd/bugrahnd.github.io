// In-browser audience simulator for demo mode (static hosting, no bridge).
// Ported from server/simulator.js + server/data.js: emits the same event objects
// as the bridge WebSocket (chat with "<plate> <emoji>" joins incl. KKTC and bare-plate
// retries, like, gift with long-tail tiers and streaks, follow, share, join, status).
// Avatars are left empty (the HUD draws coloured initials); emotes are inline SVG data URLs.

export const DEMO_PRESETS = { low: 20, medium: 100, high: 400, chaos: 1500 };

const PROVINCES = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin', 'Aydın', 'Balıkesir',
  'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli',
  'Diyarbakır', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari',
  'Hatay', 'Isparta', 'Mersin', 'İstanbul', 'İzmir', 'Kars', 'Kastamonu', 'Kayseri', 'Kırklareli', 'Kırşehir',
  'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Kahramanmaraş', 'Mardin', 'Muğla', 'Muş', 'Nevşehir',
  'Niğde', 'Ordu', 'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Tekirdağ', 'Tokat',
  'Trabzon', 'Tunceli', 'Şanlıurfa', 'Uşak', 'Van', 'Yozgat', 'Zonguldak', 'Aksaray', 'Bayburt', 'Karaman',
  'Kırıkkale', 'Batman', 'Şırnak', 'Bartın', 'Ardahan', 'Iğdır', 'Yalova', 'Karabük', 'Kilis', 'Osmaniye',
  'Düzce',
];
const BIG = {
  34: 40, 6: 18, 35: 14, 16: 9, 1: 7, 7: 7, 27: 7, 42: 7, 63: 6, 21: 6, 61: 5, 55: 5,
  33: 5, 41: 5, 31: 4, 45: 4, 38: 4, 26: 3, 65: 3, 44: 3, 10: 3, 20: 3, 46: 3, 25: 3,
  54: 3, 9: 3, 52: 2, 47: 2, 59: 2, 58: 2, 48: 2, 3: 2, 60: 2, 23: 2, 72: 2,
};
const PLATE_WEIGHTS = PROVINCES.map((_, i) => BIG[i + 1] || 1);
const GIFTS = [
  { giftId: 5655, giftName: 'Rose', coins: 1, streak: true, w: 40 },
  { giftId: 5269, giftName: 'TikTok', coins: 1, streak: true, w: 12 },
  { giftId: 6064, giftName: 'GG', coins: 1, streak: true, w: 10 },
  { giftId: 5827, giftName: 'Ice Cream Cone', coins: 1, streak: true, w: 8 },
  { giftId: 7934, giftName: 'Heart Me', coins: 1, streak: true, w: 6 },
  { giftId: 5487, giftName: 'Finger Heart', coins: 5, streak: true, w: 9 },
  { giftId: 9947, giftName: 'Friendship Necklace', coins: 10, streak: true, w: 5 },
  { giftId: 5658, giftName: 'Perfume', coins: 20, streak: true, w: 4 },
  { giftId: 5879, giftName: 'Doughnut', coins: 30, streak: true, w: 3 },
  { giftId: 6104, giftName: 'Cap', coins: 99, streak: true, w: 2 },
  { giftId: 5660, giftName: 'Hand Hearts', coins: 100, streak: false, w: 4 },
  { giftId: 5585, giftName: 'Confetti', coins: 100, streak: false, w: 3 },
  { giftId: 6267, giftName: 'Corgi', coins: 299, streak: false, w: 2 },
  { giftId: 7168, giftName: 'Money Gun', coins: 500, streak: false, w: 1.5 },
  { giftId: 8352, giftName: 'Swan', coins: 699, streak: false, w: 1 },
  { giftId: 11046, giftName: 'Galaxy', coins: 1000, streak: false, w: 6 },
  { giftId: 6820, giftName: 'Whale diving', coins: 2150, streak: false, w: 3 },
  { giftId: 7316, giftName: 'Unicorn Fantasy', coins: 5000, streak: false, w: 1.5 },
  { giftId: 6149, giftName: 'Interstellar', coins: 10000, streak: false, w: 0.6 },
  { giftId: 6369, giftName: 'Lion', coins: 29999, streak: false, w: 0.25 },
  { giftId: 7312, giftName: 'TikTok Universe', coins: 44999, streak: false, w: 0.1 },
];
const GIFT_TIERS = [
  { min: 1, max: 1, p: 0.72 }, { min: 5, max: 99, p: 0.215 }, { min: 100, max: 999, p: 0.055 }, { min: 1000, max: Infinity, p: 0.01 },
];
const FIRST_NAMES = [
  'Mehmet', 'Ahmet', 'Mustafa', 'Ali', 'Hüseyin', 'Hasan', 'İbrahim', 'Murat', 'Ömer', 'Emre',
  'Yusuf', 'Burak', 'Can', 'Kerem', 'Efe', 'Arda', 'Eren', 'Oğuz', 'Serkan', 'Volkan',
  'Furkan', 'Berk', 'Barış', 'Çağrı', 'Tolga', 'Onur', 'Uğur', 'Kaan', 'Doğukan', 'Enes',
  'Ayşe', 'Fatma', 'Zeynep', 'Elif', 'Emine', 'Merve', 'Büşra', 'Esra', 'Selin', 'Ece',
  'Defne', 'Ceren', 'Gizem', 'Kübra', 'Şeyma', 'Derya', 'Özge', 'İrem', 'Nur', 'Yağmur',
  'Sude', 'Buse', 'Melike', 'Hilal', 'Gül', 'Damla', 'Aslı', 'Tuğba', 'Hande', 'Duygu',
];
const LAST_NAMES = [
  'Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir',
  'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek',
  'Polat', 'Korkmaz', 'Erdoğan', 'Güneş', 'Aksoy', 'Tekin', 'Ateş', 'Bulut', 'Turan', 'Güler',
];
const NICK_DECOR = ['', '', '', '', ' 🌸', ' 🔥', ' ⚡', ' 🇹🇷', ' ✨', ' 👑', ' 🦅', ' 💫', '_', ' 🐺'];
const EMOJIS = [
  '🔥', '🦅', '⚡', '👑', '🐺', '🦁', '🐯', '💪', '⚔️', '🛡️', '🚀', '💎', '🌙', '⭐', '🌟', '✨',
  '❤️', '💙', '💚', '💛', '🖤', '💜', '🧡', '🤍', '🇹🇷', '🏴‍☠️', '😎', '😈', '🤠', '👻', '💀', '🤖',
  '🐉', '🦊', '🐻', '🐼', '🦄', '🐝', '🦋', '🐬', '🌹', '🌻', '🍀', '🌊', '⚽', '🏆', '🎯', '🎮',
  '🍉', '🍕', '☕', '🧿', '👍🏽', '✌🏻', '🙏🏼', '🧑‍🚀', '👨‍🌾', '❄️', '☀️', '🌈', '🎸', '🥇',
];
const KKTC_WORDS = ['KKTC', 'kktc', 'Kktc', 'KKTC', 'kıbrıs', 'Kıbrıs', 'KIBRIS', 'girne', 'Girne', 'lefkoşa', 'Lefkoşa', 'mağusa'];
const CHATTER = [
  'selam', 'selamlar herkese', 'merhaba', 'kolay gelsin', 'hadi bakalım', 'bu oyun çok iyi',
  'nasıl oynanıyor?', 'takip ettim', 'beğeni yağdırın', 'hahaha', '😂😂😂', '❤️❤️', '🔥🔥🔥',
  'ilk kez geliyorum', 'harita çok güzel', 'kim kazanıyor?', 'saldırın!!', 'birleşelim',
  'abi selam', 'güzel yayın', 'gül atın gül', 'askerler nerde', 'efsane', 'helal olsun', 'gg',
];
const CHEER_TEMPLATES = ['{city} güçlü!', 'hadi {city}!!', '{city} burada', '{plate} gelsin', 'yaşasın {city}', '{plate} {plate} {plate}'];
const COMMAND_TEMPLATES = ['saldır {target}', 'saldir {target}', 'SALDIR {target}', 'hedef {target}', 'Hedef {target}'];

const TICK_MS = 200;
const MEAN_STAY_S = 240;
const RATE = { chat: 1 / 45, like: 1 / 25, gift: 1 / 150, follow: 1 / 900, share: 1 / 1500 };

const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));
function weightedIndex(ws) {
  let t = 0; for (const w of ws) t += w;
  let r = rnd() * t;
  for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r < 0) return i; }
  return ws.length - 1;
}
function poisson(l) {
  if (l <= 0) return 0;
  if (l > 30) {
    const g = Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
    return Math.max(0, Math.round(l + Math.sqrt(l) * g));
  }
  const L = Math.exp(-l); let k = 0; let p = 1;
  do { k++; p *= rnd(); } while (p > L);
  return k - 1;
}
const TR_FOLD = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };
const fold = (s) => s.replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => TR_FOLD[c]).toLowerCase();
const randomPlate = () => weightedIndex(PLATE_WEIGHTS) + 1;
const typePlate = (p) => (p < 10 && rnd() < 0.5 ? '0' + p : String(p));
function typeCity(p) {
  const n = PROVINCES[p - 1]; const r = rnd();
  if (r < 0.45) return fold(n);
  if (r < 0.75) return n;
  if (r < 0.9) return n.toLocaleLowerCase('tr');
  return n.toLocaleUpperCase('tr');
}
const randomRegion = (k = 0.04) => (rnd() < k ? 'kktc' : randomPlate());
const typeRegion = (r) => (r === 'kktc' ? pick(KKTC_WORDS) : rnd() < 0.75 ? typePlate(r) : typeCity(r));
const typeTarget = (r) => (r === 'kktc' ? 'kktc' : rnd() < 0.85 ? typePlate(r) : typeCity(r));
const regionName = (r) => (r === 'kktc' ? 'KKTC' : PROVINCES[r - 1]);
function joinText(v) {
  const base = typeRegion(v.plate); const r = rnd();
  if (r < 0.86) return `${base} ${v.emoji}`;
  if (r < 0.93) return `${base} ${v.emoji}${rnd() < 0.5 ? v.emoji : pick(EMOJIS)}`;
  return `${base}${v.emoji}`;
}

/** Small inline SVG "sticker" used as a TikTok emote stand-in. */
function emoteUrl(n) {
  const hue = (n * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="hsl(${hue},80%,55%)" stroke="#fff" stroke-width="4"/><circle cx="22" cy="26" r="5" fill="#fff"/><circle cx="42" cy="26" r="5" fill="#fff"/><path d="M18 40 Q32 54 46 40" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export class DemoSim {
  constructor(onEvent, preset = 'medium') {
    this.onEvent = onEvent;
    this.preset = DEMO_PRESETS[preset] ? preset : 'medium';
    this.viewers = [];
    this.usedNames = new Set();
    this.queue = [];
    this.totalLikes = 0;
    this.timer = null;
    this.startedAt = 0;
    this.nextBigAt = 0;
    this.lastReport = -1; this.lastReportAt = 0;
  }

  get target() { return DEMO_PRESETS[this.preset]; }

  start() {
    if (this.timer) return;
    this.startedAt = this.lastTick = Date.now();
    // A top-tier gift early on, then every 1.5-2.5 minutes, so the big moments are seen.
    this.nextBigAt = this.startedAt + randInt(35, 60) * 1000;
    this.timer = setInterval(() => this._tick(), TICK_MS);
    this._status();
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  _status() {
    this.onEvent({ type: 'status', ts: Date.now(), mode: 'sim', connected: true, username: null, viewers: this.viewers.length, error: null });
  }

  _makeUser() {
    let first; let last; let handle;
    for (let tries = 0; tries < 20; tries++) {
      first = pick(FIRST_NAMES); last = pick(LAST_NAMES);
      const f = fold(first); const l = fold(last);
      const n = rnd() < 0.7 ? String(randInt(1, 99)) : String(randInt(1985, 2009));
      handle = [`${f}${l}${n}`, `${f}.${l}`, `${f}_${l}${n}`, `${f}${n}`, `${f}.${l}${n}`, `${l}_${f}`][randInt(0, 5)];
      if (!this.usedNames.has(handle)) break;
      handle += randInt(100, 999);
      if (!this.usedNames.has(handle)) break;
    }
    this.usedNames.add(handle);
    const s = rnd();
    let nick;
    if (s < 0.35) nick = `${first} ${last}`;
    else if (s < 0.6) nick = `${first} ${last[0]}.`;
    else if (s < 0.8) nick = first + pick(NICK_DECOR);
    else if (s < 0.9) nick = first.toLocaleUpperCase('tr') + randInt(1, 81);
    else nick = handle;
    let id = '7'; for (let i = 0; i < 18; i++) id += randInt(0, 9);
    return { id, name: handle, nick, avatar: '' };
  }

  _arrive(now) {
    const v = { user: this._makeUser(), plate: null, joined: false, emoji: pick(EMOJIS), followed: false, leaveAt: now - Math.log(rnd() || 1e-9) * MEAN_STAY_S * 1000 };
    this.viewers.push(v);
    this._emit('join', v);
    if (rnd() < 0.85) this._later(now + randInt(800, 9000), () => this._firstMessage(v));
  }

  _firstMessage(v) {
    if (!this.viewers.includes(v) || v.joined) return;
    if (!v.plate) v.plate = randomRegion();
    if (rnd() < 0.21) {
      this._emit('chat', v, { text: typeRegion(v.plate) });
      if (rnd() < 0.8) this._later(Date.now() + randInt(2500, 7000), () => this._join(v));
      return;
    }
    this._join(v);
  }

  _join(v) {
    if (!this.viewers.includes(v)) return;
    if (!v.plate) v.plate = randomRegion();
    v.joined = true;
    if (rnd() < 0.03) {
      const n = randInt(1, 8);
      const emotes = [{ id: `demo-emote-${n}`, url: emoteUrl(n) }];
      const text = typeRegion(v.plate);
      if (rnd() < 0.3) {
        this._emit('chat', v, { text });
        this._later(Date.now() + randInt(600, 2500), () => this._emit('chat', v, { text: '', emotes }));
      } else this._emit('chat', v, { text, emotes });
      return;
    }
    this._emit('chat', v, { text: joinText(v) });
  }

  _leave(i) { const [v] = this.viewers.splice(i, 1); this.usedNames.delete(v.user.name); }
  _later(at, fn) { this.queue.push({ at, fn }); }

  _randomViewer(preferJoined = false) {
    if (!this.viewers.length) return null;
    for (let i = 0; preferJoined && i < 4; i++) { const v = pick(this.viewers); if (v.joined) return v; }
    return pick(this.viewers);
  }

  _chat(v) {
    const r = rnd();
    if (!v.joined) { this._firstMessage(v); return; }
    if (r < 0.12) { if (rnd() < 0.15) v.plate = randomRegion(); this._join(v); return; }
    let text;
    if (r < 0.4) {
      let t = randomRegion(0.04); if (t === v.plate) t = randomRegion(0.04);
      text = pick(COMMAND_TEMPLATES).replace('{target}', typeTarget(t));
    } else if (r < 0.55) {
      text = pick(CHEER_TEMPLATES).replaceAll('{city}', regionName(v.plate)).replaceAll('{plate}', v.plate === 'kktc' ? 'KKTC' : typePlate(v.plate));
    } else text = pick(CHATTER);
    this._emit('chat', v, { text });
  }

  _like(v) {
    const r = rnd();
    const count = r < 0.6 ? randInt(1, 5) : r < 0.92 ? randInt(6, 15) : randInt(16, 50);
    this.totalLikes += count;
    this._emit('like', v, { count, totalLikes: this.totalLikes });
  }

  _pickGift() {
    const t = weightedIndex(GIFT_TIERS.map((x) => x.p));
    const { min, max } = GIFT_TIERS[t];
    const pool = GIFTS.filter((g) => g.coins >= min && g.coins <= max);
    return pool[weightedIndex(pool.map((g) => g.w))];
  }

  _gift(v, now, g = this._pickGift()) {
    if (g.streak && rnd() < 0.4) {
      const len = Math.min(99, 2 + Math.floor(-Math.log(rnd() || 1e-9) * (g.coins === 1 ? 12 : 5)));
      let sent = 0; let at = now;
      while (sent < len) {
        const d = Math.min(len - sent, randInt(1, 4));
        sent += d; at += randInt(250, 900);
        this._later(at, () => this._emitGift(v, g, d));
      }
    } else this._emitGift(v, g, 1);
  }

  _emitGift(v, g, count) {
    this._emit('gift', v, { giftId: g.giftId, giftName: g.giftName, coins: g.coins, count, total: g.coins * count });
  }

  _emit(type, v, fields = {}) {
    this.onEvent({ type, ts: Date.now(), user: { ...v.user }, ...fields });
  }

  _tick() {
    const now = Date.now();
    const dt = Math.min(1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    const target = this.target;
    for (let i = this.viewers.length - 1; i >= 0; i--) if (this.viewers[i].leaveAt <= now) this._leave(i);
    const excess = this.viewers.length - target;
    if (excess > 0) {
      const n = Math.min(excess, Math.max(1, Math.round((excess / 4) * dt)));
      for (let i = 0; i < n; i++) this._leave(Math.floor(rnd() * this.viewers.length));
    }
    const deficit = Math.max(0, target - this.viewers.length);
    const arrivals = poisson((target / MEAN_STAY_S + deficit / 6) * dt);
    for (let i = 0; i < Math.min(arrivals, deficit + 5); i++) this._arrive(now);
    const n = this.viewers.length;
    if (n) {
      for (let i = poisson(n * RATE.chat * dt); i > 0; i--) this._chat(this._randomViewer());
      for (let i = poisson(n * RATE.like * dt); i > 0; i--) this._like(this._randomViewer());
      for (let i = poisson(n * RATE.gift * dt); i > 0; i--) this._gift(this._randomViewer(true), now);
      for (let i = poisson(n * RATE.follow * dt); i > 0; i--) { const v = this._randomViewer(); if (!v.followed) { v.followed = true; this._emit('follow', v); } }
      for (let i = poisson(n * RATE.share * dt); i > 0; i--) this._emit('share', this._randomViewer());
    }
    // Guaranteed showcase: a 1000 or 5000 coin gift from a viewer who has joined.
    if (now >= this.nextBigAt) {
      const v = this.viewers.find((x) => x.joined && rnd() < 0.3) || this.viewers.find((x) => x.joined);
      if (v) {
        const coins = rnd() < 0.55 ? 1000 : 5000;
        this._gift(v, now, GIFTS.find((g) => g.coins === coins));
        this.nextBigAt = now + randInt(90, 150) * 1000;
      } else this.nextBigAt = now + 5000;
    }
    if (this.queue.length) {
      const due = [];
      this.queue = this.queue.filter((q) => (q.at <= now ? (due.push(q), false) : true));
      due.sort((a, b) => a.at - b.at);
      for (const q of due) q.fn();
    }
    if (this.viewers.length !== this.lastReport && now - this.lastReportAt >= 1000) {
      this.lastReport = this.viewers.length; this.lastReportAt = now;
      this._status();
    }
  }
}
