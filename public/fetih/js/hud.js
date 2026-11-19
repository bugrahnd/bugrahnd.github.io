// DOM/CSS overlay: timer, leaderboards, feed, call to action, gift legend, nudges,
// callouts, announcements, countdown, end screen.
// Every untrusted string (nicknames, gift names) is inserted with textContent;
// avatars are <img> elements with a letter fallback.
import { fmt, fmtTime, safeImageUrl, setNameBadge, badgeKey } from './util.js';
import { hexCss } from './colors.js';

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.append(e);
  return e;
}

/** Avatar element: <img> with a coloured initial as fallback. */
function makeAvatar(parent, cls = '') {
  const wrap = el('div', 'avatar ' + cls, parent);
  const fb = el('span', 'avatar-fb', wrap);
  const img = el('img', '', wrap);
  img.alt = '';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.draggable = false;
  img.style.display = 'none';
  img.onload = () => { img.style.display = ''; fb.style.display = 'none'; };
  img.onerror = () => { img.style.display = 'none'; fb.style.display = ''; };
  let cur = null;
  return {
    wrap,
    set(url, nick, colorHex) {
      const initial = Array.from((nick || '?').trim())[0] || '?';
      if (fb.textContent !== initial) fb.textContent = initial.toLocaleUpperCase('tr');
      if (colorHex !== undefined) wrap.style.setProperty('--c', hexCss(colorHex));
      const safe = safeImageUrl(url);
      if (safe === cur) return;
      cur = safe;
      img.style.display = 'none';
      fb.style.display = '';
      if (safe) img.src = safe; else img.removeAttribute('src');
    },
  };
}

function iconEl(assets, key, parent, cls = 'icon') {
  const i = el('img', cls, parent);
  i.src = assets.uiPath(key);
  i.alt = '';
  i.draggable = false;
  return i;
}

/** Name + badge, only rewritten when something changed. */
function setName(node, nick, badge) {
  const k = `${nick}|${badgeKey(badge)}`;
  if (node._k === k) return;
  node._k = k;
  setNameBadge(node, nick, badge);
}

const FEED_ICONS = {
  sword: 'icon_sword', flag: 'icon_flag', fire: 'icon_fire', gift: 'icon_gem', crown: 'icon_crown',
  skull: 'icon_skull', target: 'icon_dice_sword', trophy: 'icon_trophy', hourglass: 'icon_hourglass',
};

// Map band per stage (design units). Keep in sync with hud.css.
const BANDS = {
  portrait: { x: 6, y: 470, w: 1068, h: 690 },
  landscape: { x: 450, y: 100, w: 1020, h: 840 },
};

const CTA_LINES = [
  ['34 🔥', 'yaz → İstanbul ordusuna katıl'],
  ['ankara 🦅', 'şehir adı da olur'],
  ['❤️ beğen', '→ moral dolar, HÜCUM!'],
  ['🎁 hediye', '→ asker, top, büyük ordu'],
  ['saldır 06', '→ hedefi sen seç'],
];

export class Hud {
  constructor(root, assets, config, provinceCount = 81) {
    this.root = root;
    this.assets = assets;
    this.cfg = config;
    this.provinceCount = provinceCount;
    this.layout = null;
    this._build();
    this.feedLines = [];
    this.feedBudget = 2;
    this.nudges = new Map(); // name -> { el, until, avatar }
    this.nudgeCooldown = new Map();
    this.announceQueue = [];
    this.announcing = null;
    this.calloutQueue = [];
    this.callouting = null;
    this.timeNow = 0;
    this.ctaI = 0; this.ctaT = 0; this.hintUntil = 0;
  }

  // ---------- construction ----------

  _build() {
    const r = this.root;
    const a = this.assets;

    // Map band frame (top/bottom gold rules) and full-band flash.
    this.bandEl = el('div', 'band', r);
    this.flashEl = el('div', 'flash', this.bandEl);

    // Top bar
    const top = el('div', 'topbar panel-dark', r);
    const title = el('div', 'title', top);
    el('span', 'title-81', title, '81');
    const tt = el('span', 'title-txt', title);
    el('span', 'title-il', tt, 'İL');
    el('span', 'title-kktc', tt, '+ KKTC');
    el('span', 'title-fetih', title, 'FETİH');
    const timer = el('div', 'timer', top);
    iconEl(a, 'icon_hourglass', timer, 'icon timer-icon');
    this.timerText = el('span', 'timer-text', timer, '10:00');
    this.roundText = el('span', 'round-text', timer, '1. TUR');
    const conn = el('div', 'conn', top);
    this.connDot = el('span', 'conn-dot', conn);
    this.connText = el('span', 'conn-text', conn, 'Bağlanıyor…');
    this.statusText = el('span', 'status-text', conn, '');

    // Leaderboard
    const board = el('div', 'board panel-dark', r);
    const bh = el('div', 'panel-title', board);
    iconEl(a, 'icon_tower', bh);
    el('span', '', bh, 'EN GÜÇLÜ ŞEHİRLER');
    this.cityRows = [];
    const list = el('div', 'city-list', board);
    for (let i = 0; i < this.cfg.hud.topCities; i++) {
      const row = el('div', 'city-row', list);
      const rank = el('div', 'rank', row, String(i + 1));
      const plate = el('div', 'plate-badge', row, '');
      const info = el('div', 'city-info', row);
      const line1 = el('div', 'city-line1', info);
      const name = el('span', 'city-name', line1);
      const flag = el('span', 'hucum-tag', line1, 'HÜCUM!');
      const line2 = el('div', 'city-line2', info);
      const prov = el('span', 'city-prov', line2);
      const troops = el('span', 'city-troops', line2);
      const morale = el('div', 'morale', info);
      const fill = el('div', 'morale-fill', morale);
      const cmd = el('div', 'commander', row);
      const av = makeAvatar(cmd, 'small');
      const cmdText = el('div', 'cmd-text', cmd);
      el('span', 'cmd-label', cmdText, '👑 Komutan');
      const cmdName = el('span', 'cmd-name', cmdText);
      this.cityRows.push({ row, rank, plate, name, flag, prov, troops, fill, cmd, av, cmdName, key: '' });
    }
    this.boardEmpty = el('div', 'board-empty', list, 'Henüz kimse yok — plakanı + emoji yaz, şehrini uyandır!');

    // Top gifters
    const gift = el('div', 'gifters panel-dark', r);
    const gh = el('div', 'panel-title', gift);
    iconEl(a, 'icon_crown', gh);
    el('span', '', gh, 'EN CÖMERTLER');
    this.gifterRows = [];
    const glist = el('div', 'gifter-list', gift);
    for (let i = 0; i < this.cfg.hud.topGifters; i++) {
      const row = el('div', 'gifter-row', glist);
      el('div', 'medal m' + (i + 1), row, String(i + 1));
      const av = makeAvatar(row, 'mid');
      const info = el('div', 'gifter-info', row);
      const nick = el('div', 'gifter-nick', info);
      const l2 = el('div', 'gifter-l2', info);
      const sub = el('div', 'gifter-sub', l2);
      const coins = el('div', 'gifter-coins', l2);
      this.gifterRows.push({ row, av, nick, sub, coins });
    }
    this.gifterEmpty = el('div', 'board-empty', glist, 'İlk hediyeyi sen gönder!');

    // Call to action
    const cta = el('div', 'cta', r);
    const ctaMain = el('div', 'cta-main', cta);
    el('span', 'cta-a', ctaMain, 'PLAKANI + EMOJİ YAZ:');
    el('span', 'cta-chip', ctaMain, '34 🔥');
    el('div', 'cta-sub2', cta, 'ŞEHRİNİ SAVUN, TÜRKİYE\'Yİ FETHET!');
    const ctaLine = el('div', 'cta-line', cta);
    this.ctaChip = el('span', 'cta-chip small', ctaLine, CTA_LINES[0][0]);
    this.ctaText = el('span', 'cta-text', ctaLine, CTA_LINES[0][1]);
    this.ctaLine = ctaLine;

    // Gift legend: what each tier does, in two or three words.
    const tiers = el('div', 'tiers panel-dark', r);
    for (const t of this.cfg.gifts.tiers) {
      const s = el('div', 'tier tier-' + t.id, tiers);
      const c = el('span', 'tier-coins', s);
      iconEl(a, 'icon_coin', c, 'icon tiny');
      el('span', '', c, `${fmt(t.minCoins)}`);
      el('span', 'tier-label', s, t.legend || t.label);
    }

    // Feed
    this.feedEl = el('div', 'feed', r);

    // Nudges (held gifts)
    this.nudgeEl = el('div', 'nudges', r);

    // Hücum popups / round banner
    this.popEl = el('div', 'pops', r);

    // Callouts ("İSTANBUL DÜŞTÜ!") and the last-seconds countdown
    this.calloutEl = el('div', 'callout', r);
    this.calloutEl.style.display = 'none';
    this.calloutTitle = el('div', 'callout-title', this.calloutEl);
    this.calloutSub = el('div', 'callout-sub', this.calloutEl);
    this.countEl = el('div', 'countdown', r);
    this.countEl.style.display = 'none';

    // Big announcement
    const ann = el('div', 'announce', r);
    ann.style.display = 'none';
    this.ann = { root: ann, card: el('div', 'announce-card', ann) };
    const card = this.ann.card;
    this.ann.rays = el('div', 'announce-rays', card);
    this.ann.tier = el('div', 'announce-tier', card);
    const who = el('div', 'announce-who', card);
    this.ann.av = makeAvatar(who, 'big');
    const whoText = el('div', 'announce-who-text', who);
    this.ann.nick = el('div', 'announce-nick', whoText);
    this.ann.gift = el('div', 'announce-gift', whoText);
    this.ann.troops = el('div', 'announce-troops', card);
    this.ann.effect = el('div', 'announce-effect', card);

    // End screen
    const end = el('div', 'endscreen', r);
    end.style.display = 'none';
    const ec = el('div', 'end-card panel-detail', end);
    this.end = { root: end };
    this.end.title = el('div', 'end-title', ec, 'TUR BİTTİ');
    const win = el('div', 'end-winner', ec);
    iconEl(a, 'icon_trophy', win, 'icon trophy');
    const wt = el('div', 'end-winner-text', win);
    el('div', 'end-label', wt, 'KAZANAN');
    this.end.winName = el('div', 'end-win-name', wt);
    this.end.winSub = el('div', 'end-win-sub', wt);
    const cols = el('div', 'end-cols', ec);
    const c1 = el('div', 'end-col', cols);
    el('div', 'end-col-title', c1, 'İLK 5 ŞEHİR');
    this.end.cities = el('ol', 'end-cities', c1);
    const c2 = el('div', 'end-col', cols);
    el('div', 'end-col-title', c2, 'EN CÖMERT 3');
    this.end.gifters = el('div', 'end-gifters', c2);
    this.end.countdown = el('div', 'end-countdown', ec);
    el('div', 'end-cta', ec, 'Yeni turda katıl: plakanı + emoji yaz (ör. 34 🔥)');

    // Audio unlock
    this.audioBtn = el('button', 'audio-unlock', r, 'Sesi açmak için tıkla');
    this.audioBtn.style.display = 'none';

    // Debug
    this.debugEl = el('pre', 'debug', r);
    this.debugEl.style.display = 'none';
  }

  /** Lays the stage out and returns the rectangle (px) where the map should be drawn. */
  applyLayout(w, h, forced) {
    // The HUD is designed on a 1080x1920 (portrait) or 1920x1080 (landscape) stage,
    // scaled by --u and centred in the viewport. A portrait screen taller than 9:16
    // (phones) gives the extra height to the map band (--ex design units).
    const portrait = forced ? forced === 'portrait' : w / h < 0.85;
    const safe = this._safeArea();
    const ah = Math.max(1, h - safe.top - safe.bottom);
    const dw = portrait ? 1080 : 1920; let dh = portrait ? 1920 : 1080;
    const u = Math.min(w / dw, ah / dh);
    let ex = 0;
    if (portrait && ah / u > dh + 1) { ex = Math.min(700, ah / u - dh); dh += ex; }
    const ox = (w - dw * u) / 2; const oy = safe.top + (ah - dh * u) / 2;
    const doc = document.documentElement;
    doc.style.setProperty('--u', `${u}px`);
    doc.style.setProperty('--ex', String(ex));
    doc.classList.toggle('portrait', portrait);
    doc.classList.toggle('landscape', !portrait);
    this.root.style.left = `${ox}px`;
    this.root.style.top = `${oy}px`;
    this.root.style.width = `${dw * u}px`;
    this.root.style.height = `${dh * u}px`;
    this.layout = portrait ? 'portrait' : 'landscape';
    const b = { ...BANDS[this.layout] };
    b.h += ex;
    this.bandDesign = b;
    const rect = { x: ox + b.x * u, y: oy + b.y * u, w: b.w * u, h: b.h * u, u };
    // A window wider than the portrait stage: let the map use the extra width.
    if (portrait && ox > 8) { rect.x = 8; rect.w = w - 16; }
    // Same for extra height in landscape.
    if (!portrait && oy > 8) { rect.y = oy + b.y * u; rect.h = b.h * u + oy * 0.5; }
    this.bandEl.style.left = `${rect.x - ox}px`;
    this.bandEl.style.top = `${rect.y - oy}px`;
    this.bandEl.style.width = `${rect.w}px`;
    this.bandEl.style.height = `${rect.h}px`;
    return rect;
  }

  _safeArea() {
    if (!this._probe) {
      this._probe = el('div', 'safe-probe', document.body);
    }
    const cs = getComputedStyle(this._probe);
    return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  }

  setDemo(preset) {
    if (!this.demoTag) this.demoTag = el('span', 'demo-tag', this.root.querySelector('.title'), 'DEMO');
    this.demoTag.title = preset;
  }

  // ---------- live updates ----------

  setConnected(ok) {
    this.connDot.classList.toggle('ok', ok);
    this.connText.textContent = ok ? 'Bağlı' : 'Bağlantı yok – yeniden deneniyor…';
    this.root.classList.toggle('offline', !ok);
  }

  setStatus(s) {
    let t = '';
    if (s.mode === 'sim') t = s.connected ? `Simülatör · ${fmt(s.viewers || 0)} izleyici` : 'Simülatör duraklatıldı';
    else if (s.mode === 'live') t = s.connected ? `@${String(s.username || '').slice(0, 24)} · ${s.viewers != null ? fmt(s.viewers) + ' izleyici' : 'canlı'}` : 'TikTok bağlantısı bekleniyor';
    if (s.error) t += ` · ${String(s.error).slice(0, 80)}`;
    this.statusText.textContent = t;
  }

  update(sum, dt) {
    this.timeNow += dt;
    this.timerText.textContent = sum.phase === 'end' ? '0:00' : fmtTime(sum.left);
    this.timerText.classList.toggle('urgent', sum.phase === 'play' && sum.left <= 60);
    this.roundText.textContent = `${sum.round}. TUR`;

    // Cities
    sum.top.forEach((t, i) => {
      const r = this.cityRows[i];
      r.row.style.display = '';
      r.row.style.setProperty('--c', hexCss(t.colorHex));
      const key = `${t.plate}`;
      if (r.key !== key) {
        r.key = key;
        r.plate.textContent = t.code;
        r.plate.classList.toggle('wide', t.code.length > 2);
        r.name.textContent = t.name;
        r.row.animate([{ opacity: 0.3, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], { duration: 350 });
      }
      r.prov.textContent = t.landless ? 'İsyanda!' : `${t.provinces} il`;
      r.troops.textContent = `${fmt(t.troops)} asker · ${fmt(t.members)} kişi`;
      r.fill.style.transform = `scaleX(${t.morale.toFixed(3)})`;
      r.row.classList.toggle('hucum', t.hucum);
      if (t.commander) {
        r.cmd.style.visibility = '';
        setName(r.cmdName, t.commander.nick, t.commander.badge);
        r.av.set(i < 3 ? t.commander.avatar : '', t.commander.nick, t.colorHex);
      } else {
        r.cmd.style.visibility = 'hidden';
      }
    });
    for (let i = sum.top.length; i < this.cityRows.length; i++) { this.cityRows[i].row.style.display = 'none'; this.cityRows[i].key = ''; }
    this.boardEmpty.style.display = sum.top.length ? 'none' : '';

    // Gifters
    sum.gifters.forEach((g, i) => {
      const r = this.gifterRows[i];
      r.row.style.display = '';
      r.av.set(g.avatar, g.nick, g.colorHex);
      setName(r.nick, g.nick, g.badge);
      r.sub.textContent = `${g.code} ${g.team}`;
      r.sub.style.color = hexCss(g.colorHex);
      r.coins.textContent = `${fmt(g.coins)} jeton`;
    });
    for (let i = sum.gifters.length; i < this.gifterRows.length; i++) this.gifterRows[i].row.style.display = 'none';
    this.gifterEmpty.style.display = sum.gifters.length ? 'none' : '';

    // CTA example line cycles (unless a personal hint is showing).
    this.ctaT += dt;
    if (this.timeNow > this.hintUntil && this.ctaT > 3.2) {
      this.ctaT = 0;
      this.ctaI = (this.ctaI + 1) % CTA_LINES.length;
      this.ctaLine.classList.remove('hint');
      this.ctaChip.textContent = CTA_LINES[this.ctaI][0];
      this.ctaText.textContent = CTA_LINES[this.ctaI][1];
      this.ctaLine.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 300 });
    }

    // Feed budget refill (low-priority lines are rate limited).
    this.feedBudget = Math.min(3, this.feedBudget + dt * 1.5);

    // Expire nudges.
    for (const [name, n] of this.nudges) if (this.timeNow > n.until) this.dismissNudge(name);
  }

  /** A viewer typed a plate without emoji: show them exactly what to type. */
  emojiHint(nick, example, colorHex) {
    this.hintUntil = this.timeNow + 3.2;
    this.ctaT = 0;
    this.ctaLine.classList.add('hint');
    this.ctaLine.style.setProperty('--c', hexCss(colorHex));
    this.ctaChip.textContent = example;
    this.ctaText.textContent = `${nick}, emoji ekle! Böyle yaz`;
    this.ctaLine.animate([{ transform: 'scale(0.8)' }, { transform: 'scale(1.06)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: 400 });
  }

  feed(text, colorHex = 0xffffff, icon = 'sword', important = false) {
    if (!important) {
      if (this.feedBudget < 1) return;
      this.feedBudget -= 1;
    }
    const line = el('div', 'feed-line' + (important ? ' important' : ''));
    line.style.setProperty('--c', hexCss(colorHex));
    const ic = FEED_ICONS[icon];
    if (ic) iconEl(this.assets, ic, line, 'icon feed-icon');
    el('span', 'feed-text', line, text);
    this.feedEl.prepend(line);
    this.feedLines.unshift(line);
    line.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' });
    while (this.feedLines.length > this.cfg.hud.feedLines) this.feedLines.pop().remove();
  }

  nudge(name, nick, avatar, coins, cooldownSec) {
    const existing = this.nudges.get(name);
    if (existing) {
      existing.coins.textContent = `${fmt(coins)} jeton bekliyor`;
      existing.until = this.timeNow + 8;
      return;
    }
    if ((this.nudgeCooldown.get(name) || -1e9) > this.timeNow) return;
    this.nudgeCooldown.set(name, this.timeNow + cooldownSec);
    if (this.nudgeCooldown.size > 3000) this.nudgeCooldown.clear();
    if (this.nudges.size >= 2) {
      const oldest = this.nudges.keys().next().value;
      this.dismissNudge(oldest);
    }
    const n = el('div', 'nudge');
    const av = makeAvatar(n, 'mid');
    av.set(avatar, nick);
    const txt = el('div', 'nudge-text', n);
    const l1 = el('div', 'nudge-l1', txt);
    el('span', 'nudge-nick', l1, nick);
    const c = el('span', 'nudge-coins', l1, `${fmt(coins)} jeton bekliyor`);
    const l2 = el('div', 'nudge-msg', txt);
    el('span', '', l2, 'Hediyen bekliyor! Yaz: ');
    el('span', 'cta-chip tiny', l2, '34 🔥');
    this.nudgeEl.append(n);
    n.animate([{ opacity: 0, transform: 'translateX(40px)' }, { opacity: 1, transform: 'none' }], { duration: 300 });
    this.nudges.set(name, { el: n, until: this.timeNow + 8, coins: c });
  }

  dismissNudge(name) {
    const n = this.nudges.get(name);
    if (!n) return;
    this.nudges.delete(name);
    n.el.remove();
  }

  hucum(teamName, colorHex) {
    const p = el('div', 'pop hucum-pop', this.popEl);
    p.style.setProperty('--c', hexCss(colorHex));
    iconEl(this.assets, 'icon_fire', p);
    el('span', '', p, `${teamName} HÜCUM!`);
    const anim = p.animate([
      { opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'scale(1.1)', offset: 0.15 },
      { opacity: 1, transform: 'scale(1)', offset: 0.8 }, { opacity: 0, transform: 'scale(0.9)' },
    ], { duration: 2400, easing: 'ease-out' });
    anim.onfinish = () => p.remove();
    while (this.popEl.childElementCount > 2) this.popEl.firstElementChild.remove();
  }

  banner(title, sub) {
    const p = el('div', 'pop round-pop', this.popEl);
    el('div', 'round-pop-title', p, title);
    el('div', 'round-pop-sub', p, sub);
    const anim = p.animate([
      { opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1.05)', offset: 0.12 },
      { opacity: 1, transform: 'scale(1)', offset: 0.85 }, { opacity: 0 },
    ], { duration: 3500, easing: 'ease-out' });
    anim.onfinish = () => p.remove();
  }

  // ---------- callouts / flash / countdown ----------

  /** o: { title, sub, colorHex, prio, sec, kind, rivals? } — one at a time, small queue. */
  callout(o) {
    if (this.announcing) {
      // Big gift announcements own the centre; only urgent callouts wait.
      if ((o.prio || 0) < 3) return;
    }
    if (this.callouting) {
      if ((o.prio || 0) > (this.callouting.prio || 0) + 1) { this._calloutAnim?.cancel(); this._showCallout(o); return; }
      if (this.calloutQueue.length >= 2) {
        const low = this.calloutQueue.reduce((m, x, i, arr) => ((x.prio || 0) < (arr[m].prio || 0) ? i : m), 0);
        if ((this.calloutQueue[low].prio || 0) >= (o.prio || 0)) return;
        this.calloutQueue.splice(low, 1);
      }
      this.calloutQueue.push(o);
      return;
    }
    this._showCallout(o);
  }

  _showCallout(o) {
    this.callouting = o;
    const C = this.calloutEl;
    C.style.display = '';
    C.className = `callout kind-${o.kind || 'info'}`;
    C.style.setProperty('--c', hexCss(o.colorHex ?? 0xffd166));
    if (o.rivals) {
      this.calloutTitle.replaceChildren();
      const [a, b] = o.rivals;
      const sa = el('span', 'riv', this.calloutTitle, a.name.toLocaleUpperCase('tr')); sa.style.color = hexCss(a.colorHex);
      el('span', 'riv-x', this.calloutTitle, ' ⚔ ');
      const sb = el('span', 'riv', this.calloutTitle, b.name.toLocaleUpperCase('tr')); sb.style.color = hexCss(b.colorHex);
    } else {
      this.calloutTitle.textContent = o.title;
    }
    this.calloutSub.textContent = o.sub || '';
    this.calloutSub.style.display = o.sub ? '' : 'none';
    const dur = (o.sec || 2) * 1000;
    const anim = C.animate([
      { opacity: 0, transform: 'scale(2.2)' }, { opacity: 1, transform: 'scale(0.94)', offset: 0.1 },
      { opacity: 1, transform: 'scale(1)', offset: 0.16 }, { opacity: 1, transform: 'scale(1.02)', offset: 0.85 },
      { opacity: 0, transform: 'scale(0.9)' },
    ], { duration: dur, easing: 'ease-out' });
    this._calloutAnim = anim;
    anim.onfinish = () => {
      if (this.callouting !== o) return;
      this.callouting = null;
      C.style.display = 'none';
      const next = this.calloutQueue.shift();
      if (next) this._showCallout(next);
    };
    anim.oncancel = anim.onfinish;
  }

  rivalry(aName, aHex, bName, bHex) {
    this.callout({ rivals: [{ name: aName, colorHex: aHex }, { name: bName, colorHex: bHex }], sub: 'Cephe kızıştı!', colorHex: 0xffd166, prio: 1, sec: 2.6, kind: 'rival' });
  }

  flash(strength = 0.4, colorHex = 0xffffff) {
    if (this.timeNow - (this._lastFlash || -1) < 0.25) return;
    this._lastFlash = this.timeNow;
    this.flashEl.style.background = hexCss(colorHex);
    this.flashEl.animate([{ opacity: Math.min(0.8, strength) }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
  }

  countdown(sec) {
    const c = this.countEl;
    c.style.display = '';
    c.textContent = String(sec);
    c.classList.toggle('last3', sec <= 3);
    const anim = c.animate([
      { opacity: 0, transform: 'scale(2.5)' }, { opacity: 1, transform: 'scale(1)', offset: 0.2 },
      { opacity: 0.9, transform: 'scale(0.95)', offset: 0.8 }, { opacity: 0, transform: 'scale(0.7)' },
    ], { duration: 950, easing: 'ease-out' });
    anim.onfinish = () => { if (c.textContent === String(sec)) c.style.display = 'none'; };
  }

  // ---------- announcements ----------

  announce(o) {
    if (this.announceQueue.length >= 4) {
      // Keep the biggest ones if the queue overflows.
      this.announceQueue.sort((a, b) => b.troops - a.troops);
      this.announceQueue.length = 3;
    }
    this.announceQueue.push(o);
    if (!this.announcing) this._nextAnnounce();
  }

  _nextAnnounce() {
    const o = this.announceQueue.shift();
    if (!o) { this.announcing = null; this.ann.root.style.display = 'none'; return; }
    this.announcing = o;
    const A = this.ann;
    A.root.style.display = '';
    A.root.className = 'announce ' + (o.tierId === 'sultan' ? 'sultan' : 'ordu');
    A.card.style.setProperty('--c', hexCss(o.colorHex));
    A.tier.textContent = o.tier.toLocaleUpperCase('tr') + '!';
    A.av.set(o.avatar, o.nick, o.colorHex);
    setName(A.nick, o.nick, o.badge);
    A.gift.textContent = `${o.giftName}${o.count > 1 ? ' ×' + o.count : ''} gönderdi`;
    A.troops.textContent = `${fmt(o.troops)} asker → ${o.team}`;
    A.effect.textContent = o.effect || '';
    A.effect.style.display = o.effect ? '' : 'none';
    const dur = (o.sec || 5) * 1000;
    const shorten = this.announceQueue.length > 1 ? 0.6 : 1;
    // Full-screen moment first, then the card shrinks to a ribbon at the top of the map
    // band so the battle it started stays visible.
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
    const band = this.layout === 'landscape' ? { top: 100, h: 840 } : { top: 470, h: 690 };
    const cardH = A.card.offsetHeight || 500 * u;
    const rootTop = A.root.offsetTop; const rootH = A.root.offsetHeight;
    const centreY = rootTop + rootH / 2;
    const ribbonY = band.top * u + cardH * 0.5 * 0.5 + 8 * u;
    const dy = Math.round(ribbonY - centreY);
    const hold = o.tierId === 'sultan' ? 0.42 : 0.34;
    const small = `translateY(${dy}px) scale(0.5)`;
    const anim = A.card.animate([
      { opacity: 0, transform: 'scale(0.3) rotate(-4deg)' },
      { opacity: 1, transform: 'scale(1.08) rotate(1deg)', offset: 0.06 },
      { opacity: 1, transform: 'scale(1)', offset: 0.1 },
      { opacity: 1, transform: 'scale(1)', offset: hold },
      { opacity: 1, transform: small, offset: hold + 0.07 },
      { opacity: 1, transform: small, offset: 0.93 },
      { opacity: 0, transform: `translateY(${dy}px) scale(0.45)` },
    ], { duration: dur * shorten, easing: 'ease-out' });
    A.root.animate([{ opacity: 0 }, { opacity: 1, offset: 0.05 }, { opacity: 1, offset: hold }], { duration: dur * shorten });
    A.root.classList.add('vig');
    clearTimeout(this._vigT);
    this._vigT = setTimeout(() => A.root.classList.remove('vig'), dur * shorten * hold);
    anim.onfinish = () => this._nextAnnounce();
  }

  // ---------- end screen ----------

  showEnd(d) {
    const E = this.end;
    E.root.style.display = '';
    E.title.textContent = `${d.round}. TUR BİTTİ`;
    if (d.winner) {
      E.winName.textContent = `${d.winner.code} ${d.winner.name}`;
      E.winName.style.color = hexCss(d.winner.colorHex);
      E.winSub.replaceChildren();
      E.winSub.append(`${d.winner.provinces} il fethetti`);
      if (d.winner.commander) {
        E.winSub.append(' · Komutan: ');
        const s = el('span', '', E.winSub);
        setNameBadge(s, d.winner.commander.nick, d.winner.commander.badge);
      }
    } else {
      E.winName.textContent = 'Kazanan yok';
      E.winName.style.color = '';
      E.winSub.textContent = 'Bu turda kimse katılmadı';
    }
    E.cities.replaceChildren();
    for (const t of d.top) {
      const li = el('li', 'end-city', E.cities);
      li.style.setProperty('--c', hexCss(t.colorHex));
      el('span', 'plate-badge' + (t.code.length > 2 ? ' wide' : ''), li, t.code);
      el('span', 'end-city-name', li, t.name);
      el('span', 'end-city-prov', li, `${t.provinces} il`);
    }
    E.gifters.replaceChildren();
    if (!d.gifters.length) el('div', 'board-empty', E.gifters, 'Bu tur hediye yok');
    d.gifters.forEach((g, i) => {
      const row = el('div', 'end-gifter', E.gifters);
      el('div', 'medal m' + (i + 1), row, String(i + 1));
      makeAvatar(row, 'mid').set(g.avatar, g.nick, g.colorHex);
      const info = el('div', 'gifter-info', row);
      setNameBadge(el('div', 'gifter-nick', info), g.nick, g.badge);
      const sub = el('div', 'gifter-sub', info, `${fmt(g.coins)} jeton · ${g.team}`);
      sub.style.color = hexCss(g.colorHex);
    });
    E.root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600 });
    this.calloutEl.style.display = 'none'; this.callouting = null; this.calloutQueue.length = 0;
    this.countEl.style.display = 'none';
  }

  setEndCountdown(sec) {
    const t = `Yeni tur ${Math.max(0, Math.ceil(sec))} sn sonra başlıyor…`;
    if (this.end.countdown.textContent !== t) this.end.countdown.textContent = t;
  }

  hideEnd() {
    this.end.root.style.display = 'none';
  }

  showAudioButton(show, onClick) {
    this.audioBtn.style.display = show ? '' : 'none';
    this.audioBtn.onclick = onClick;
  }

  setDebug(text) {
    this.debugEl.textContent = text;
  }

  toggleDebug(on) {
    this.debugEl.style.display = on ? '' : 'none';
  }
}
