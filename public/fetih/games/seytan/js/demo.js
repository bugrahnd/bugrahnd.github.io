// In-page simulator for the public demo (?demo=1 or a hosted page without ?yayin=1): fake
// viewers like and send gifts in bursts. Never contacts the bridge.

const NAMES = ['Ayşe 🌸', 'Mehmet K.', 'Zeynep', 'Emre_34', 'Elif ✨', 'Burak', 'Deniz 🌊', 'Can', 'Selin', 'Oğuz', 'Merve 💜', 'Kaan', 'İrem', 'Yusuf', 'Ece 🦋',
  'Hakan', 'Derya', 'Tolga', 'Buse', 'Arda 🔥', 'Gizem', 'Mert', 'Nazlı', 'Ozan', 'Pınar', 'Serkan', 'Tuğçe', 'Umut', 'Yağmur ☔', 'Barış'];
const GIFTS = [
  { name: 'Rose', coins: 1, w: 40 }, { name: 'TikTok', coins: 1, w: 12 }, { name: 'Finger Heart', coins: 5, w: 14 },
  { name: 'Doughnut', coins: 30, w: 6 }, { name: 'Hand Hearts', coins: 100, w: 3 }, { name: 'Hat and Mustache', coins: 99, w: 3 },
  { name: 'Perfume', coins: 20, w: 6 }, { name: 'Corgi', coins: 299, w: 1.2 }, { name: 'Money Gun', coins: 500, w: 0.8 },
  { name: 'Swan', coins: 699, w: 0.6 }, { name: 'Galaxy', coins: 1000, w: 0.35 }, { name: 'Fireworks', coins: 1088, w: 0.2 },
  { name: 'Unicorn Fantasy', coins: 5000, w: 0.15 },
];
const PACE = { low: 0.5, medium: 1, high: 1.8, chaos: 3.5 };

export function startDemo({ onMessage, preset = '' }) {
  const pace = PACE[preset] || 1;
  const users = NAMES.map((nick, i) => ({ id: `demo-${i}`, name: `demo_${i}`, nick, avatar: '' }));
  const fan = users.slice(0, 6); // a few viewers give most
  const pickUser = () => (Math.random() < 0.5 ? fan[Math.floor(Math.random() * fan.length)] : users[Math.floor(Math.random() * users.length)]);
  const total = GIFTS.reduce((s, g) => s + g.w, 0);
  const pickGift = () => { let r = Math.random() * total; for (const g of GIFTS) { r -= g.w; if (r <= 0) return g; } return GIFTS[0]; };
  onMessage({ type: 'status', mode: 'sim', connected: true });

  // round-level mood: some rounds are generous (the devil flees), some quiet (he laughs)
  let mood = 1;
  setInterval(() => { mood = Math.random() < 0.55 ? 1.5 : 0.5; }, 40000);

  const likeTick = () => {
    const u = pickUser();
    onMessage({ type: 'like', ts: Date.now(), user: u, count: 1 + Math.floor(Math.random() * 6), totalLikes: 0 });
    setTimeout(likeTick, (120 + Math.random() * 380) / pace);
  };
  const giftTick = () => {
    const u = pickUser();
    const g = pickGift();
    const streak = g.coins <= 5 && Math.random() < 0.5 ? 1 + Math.floor(Math.random() * 4) : 1;
    onMessage({ type: 'gift', ts: Date.now(), user: u, giftId: 0, giftName: g.name, coins: g.coins, count: streak, total: g.coins * streak });
    setTimeout(giftTick, (1800 + Math.random() * 3600) / (pace * mood));
  };
  setTimeout(likeTick, 600);
  setTimeout(giftTick, 1500);
}
