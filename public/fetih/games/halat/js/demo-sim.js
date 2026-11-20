// In-browser audience simulator for ?demo=1 (static hosting, no bridge). Emits the same
// event objects as the bridge: chat joins ("1", "2", "kırmızı", "MAVİ", "1 🔥"…), chatter,
// likes, follows, gifts with a long tail (rose streaks up to the rare tractor/giant), and some
// gifts from viewers who join a few seconds later (held gifts). The join balance between the
// teams drifts slowly so rounds swing.

export const DEMO_PRESETS = { low: 24, medium: 120, high: 520, chaos: 1500 };

const FIRST = ['Mehmet', 'Ahmet', 'Mustafa', 'Ali', 'Hüseyin', 'Murat', 'Ömer', 'Emre', 'Yusuf', 'Burak', 'Can', 'Kerem', 'Efe', 'Arda', 'Eren', 'Oğuz', 'Furkan', 'Barış', 'Çağrı', 'Tolga', 'Kaan', 'Doğukan', 'Ayşe', 'Fatma', 'Zeynep', 'Elif', 'Merve', 'Büşra', 'Selin', 'Ece', 'Defne', 'Ceren', 'Gizem', 'Şeyma', 'Özge', 'İrem', 'Yağmur', 'Sude', 'Buse', 'Hilal', 'Damla', 'Aslı'];
const LAST = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Öztürk', 'Aydın', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Kara', 'Koç', 'Kurt', 'Şimşek', 'Polat', 'Güneş', 'Ateş', 'Bulut'];
const DECOR = ['', '', '', '', ' 🌸', ' 🔥', ' ⚡', ' 🇹🇷', ' ✨', ' 👑', ' 🦅', '_', ' 🐺'];
const EMOJI = ['🔥', '💪', '⚡', '👑', '🐺', '🦁', '❤️', '💙', '🇹🇷', '😎', '🏆', '🧿'];
const JOIN_TEXT = {
  1: ['1', '1', '1', '1', 'kırmızı', 'Kırmızı', 'KIRMIZI', 'kirmizi', ' 1 ', '1 🔥', 'Kırmızı 💪'],
  2: ['2', '2', '2', '2', 'mavi', 'Mavi', 'MAVİ', 'MAVI', ' 2', '2 💙', 'mavi ⚡'],
};
const CHATTER = ['selam', 'hadi kırmızı', 'hadi mavi!!', 'çekin çekin', 'kim kazanıyor?', 'bu oyun efsane', 'gg', 'asılın!', 'traktör gelsin', '😂😂', '🔥🔥🔥', 'güzel yayın', 'nasıl katılıyorum?', '12', 'kirmizi takım', 'mavii'];
const GIFTS = [
  { giftId: 5655, giftName: 'Rose', coins: 1, streak: true, w: 40 },
  { giftId: 5269, giftName: 'TikTok', coins: 1, streak: true, w: 12 },
  { giftId: 6064, giftName: 'GG', coins: 1, streak: true, w: 10 },
  { giftId: 5487, giftName: 'Finger Heart', coins: 5, streak: true, w: 9 },
  { giftId: 9947, giftName: 'Friendship Necklace', coins: 10, streak: true, w: 5 },
  { giftId: 5658, giftName: 'Perfume', coins: 20, streak: true, w: 4 },
  { giftId: 5879, giftName: 'Doughnut', coins: 30, streak: true, w: 3 },
  { giftId: 6104, giftName: 'Cap', coins: 99, streak: false, w: 2 },
  { giftId: 5660, giftName: 'Hand Hearts', coins: 100, streak: false, w: 4 },
  { giftId: 6267, giftName: 'Corgi', coins: 299, streak: false, w: 2 },
  { giftId: 7168, giftName: 'Money Gun', coins: 500, streak: false, w: 1.5 },
  { giftId: 11046, giftName: 'Galaxy', coins: 1000, streak: false, w: 6 },
  { giftId: 6820, giftName: 'Whale diving', coins: 2150, streak: false, w: 2 },
  { giftId: 7316, giftName: 'Unicorn Fantasy', coins: 5000, streak: false, w: 1.5 },
  { giftId: 6149, giftName: 'Interstellar', coins: 10000, streak: false, w: 0.4 },
];
// Probability of the coin band of one gift (long tail). Pehlivan-sized gifts (99+) stay rare
// so a demo round shows one or two of them, not a line full of strongmen.
const BANDS = [
  { min: 1, max: 1, p: 0.74 }, { min: 5, max: 30, p: 0.225 }, { min: 99, max: 999, p: 0.02 },
  { min: 1000, max: 4999, p: 0.0075 }, { min: 5000, max: Infinity, p: 0.0025 },
];

const TICK_MS = 200;
const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));

function weighted(list) {
  let t = 0; for (const x of list) t += x.w;
  let r = rnd() * t;
  for (const x of list) { r -= x.w; if (r < 0) return x; }
  return list[list.length - 1];
}

function avatarSvg(seed, hue) {
  const ch = seed.trim().charAt(0).toLocaleUpperCase('tr') || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="hsl(${hue},55%,45%)"/><text x="32" y="42" font-size="30" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="700">${ch.replace(/[<>&"]/g, '')}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export class DemoSim {
  /**
   * @param {(evt:object)=>void} emit
   * @param {string} preset key of DEMO_PRESETS
   * @param {()=>object} getState returns the game state (who is losing)
   */
  constructor(emit, preset = 'medium', getState = () => null) {
    this.emit = emit;
    this.audience = DEMO_PRESETS[preset] || DEMO_PRESETS.medium;
    this.getState = getState;
    this.viewers = []; // { user, team, joined, pendingJoinAt, giftK }
    this.serial = 0;
    this.timer = null;
    this.t0 = 0;
    this.giftRate = 1 / 70; // per joined viewer per second (scaled down for big audiences)
    this.burstUntil = 0;
  }

  start() {
    if (this.timer) return;
    this.t0 = performance.now();
    this.timer = setInterval(() => this._tick(), TICK_MS);
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  _newViewer() {
    const first = pick(FIRST); const last = pick(LAST);
    const n = ++this.serial;
    const name = `${first}${last}${n}`.toLocaleLowerCase('tr').replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c])).replace(/[^a-z0-9]/g, '');
    const nick = rnd() < 0.25 ? `${first.toLocaleLowerCase('tr')}_${last.toLocaleLowerCase('tr')}${n % 97}` : `${first} ${last.charAt(0)}.${pick(DECOR)}`;
    const user = { id: String(7000000000000000000n + BigInt(n * 7919)), name, nick, avatar: rnd() < 0.85 ? avatarSvg(first, randInt(0, 359)) : '' };
    return { user, team: 0, joined: false, pendingJoinAt: 0, giftK: rnd() < 0.15 ? 4 : rnd() < 0.5 ? 1 : 0.3 };
  }

  /** Share of new joins going to team 1: drifts so rounds swing. */
  _bias(sec) {
    return 0.5 + 0.11 * Math.sin(sec / 47) + 0.06 * Math.sin(sec / 13 + 1.3);
  }

  _ev(type, user, extra = {}) {
    this.emit({ type, ts: Date.now(), user, ...extra });
  }

  _tick() {
    const now = performance.now();
    const sec = (now - this.t0) / 1000;
    const dt = TICK_MS / 1000;
    const st = this.getState() || {};
    // Audience ramps up over the first ~50 s.
    const want = Math.round(this.audience * Math.min(1, 0.15 + sec / 50));
    while (this.viewers.length < want) {
      const v = this._newViewer();
      v.pendingJoinAt = now + rnd() * 6000;
      v.team = rnd() < this._bias(sec) ? 1 : 2;
      this.viewers.push(v);
    }
    // Some viewers leave and new ones arrive (they never re-join: membership lasts the session).
    if (rnd() < dt / 8 && this.viewers.length > 10) {
      const i = Math.floor(rnd() * this.viewers.length);
      const v = this.viewers[i];
      if (v.joined) { this.viewers.splice(i, 1); }
    }
    for (const v of this.viewers) {
      if (!v.joined && v.pendingJoinAt && now >= v.pendingJoinAt) {
        v.joined = true; v.pendingJoinAt = 0;
        if (rnd() < 0.08) this._ev('chat', v.user, { text: pick(CHATTER) }); // a stray message first
        this._ev('chat', v.user, { text: pick(JOIN_TEXT[v.team]) });
      }
    }
    const joined = this.viewers.filter((v) => v.joined);
    if (!joined.length) return;
    // Chatter.
    if (rnd() < Math.min(0.9, joined.length * dt / 30)) this._ev('chat', pick(joined).user, { text: pick(CHATTER) });
    // Likes (cosmetic).
    const likeEvents = Math.min(6, Math.round(joined.length * dt / 12 * rnd() * 2));
    for (let i = 0; i < likeEvents; i++) this._ev('like', pick(joined).user, { count: randInt(1, 15), totalLikes: 0 });
    if (rnd() < dt / 60) this._ev('follow', pick(joined).user);
    // Gifts: the rate shrinks a bit for big audiences so a 500-crowd stays readable.
    const scale = 1 / Math.sqrt(Math.max(1, joined.length / 40));
    const giftChance = joined.length * this.giftRate * scale * dt * (now < this.burstUntil ? 3 : 1);
    let n = giftChance > 1 ? Math.round(giftChance) : (rnd() < giftChance ? 1 : 0);
    if (rnd() < dt / 40) this.burstUntil = now + 4000; // gift rush now and then
    while (n-- > 0) {
      // Comebacks: the losing side's fans gift a bit more.
      const losing = st.rope < -0.25 ? 2 : st.rope > 0.25 ? 1 : 0;
      let pool = joined;
      if (losing && rnd() < 0.6) pool = joined.filter((v) => v.team === losing);
      if (!pool.length) pool = joined;
      const v = pool[Math.floor(rnd() * pool.length)];
      this._gift(v);
    }
    // A gift from somebody who has not joined yet (held, applied on join).
    if (rnd() < dt / 45) {
      const v = this._newViewer();
      v.team = rnd() < this._bias(sec) ? 1 : 2;
      this.viewers.push(v);
      this._giftOnce(v.user, pick(GIFTS.filter((g) => g.coins >= 5 && g.coins <= 100)), 1);
      v.pendingJoinAt = now + 2500 + rnd() * 3000;
    }
  }

  _gift(v) {
    // Big gifters roll the upper bands (99+) a bit more often.
    const ws = BANDS.map((b, i) => b.p * (v.giftK > 2 && i >= 2 ? 1.5 : 1));
    let r = rnd() * ws.reduce((a, b) => a + b, 0);
    let band = BANDS[0];
    for (let i = 0; i < BANDS.length; i++) { r -= ws[i]; if (r < 0) { band = BANDS[i]; break; } }
    const cands = GIFTS.filter((g) => g.coins >= band.min && g.coins <= band.max);
    const g = weighted(cands.length ? cands : GIFTS);
    if (g.streak && rnd() < 0.6) {
      // Streak: a burst of small deltas.
      let left = randInt(2, g.coins === 1 ? 18 : 5);
      let delay = 0;
      while (left > 0) {
        const c = Math.min(left, randInt(1, 4));
        left -= c;
        setTimeout(() => this._giftOnce(v.user, g, c), delay);
        delay += 250 + rnd() * 350;
      }
    } else this._giftOnce(v.user, g, 1);
  }

  _giftOnce(user, g, count) {
    this._ev('gift', user, { giftId: g.giftId, giftName: g.giftName, coins: g.coins, count, total: g.coins * count });
  }
}
