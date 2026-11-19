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

// Design units at the top of the map band reserved for the leader spot + gift credit
// (the map is fitted below it). Keep in sync with .leader-card / .credit in hud.css.
const MAP_TOP_INSET = 206;

const CTA_LINES = [
  ['34', 'yaz → İstanbul ordusuna katıl'],
  ['ankara', 'şehir adı da olur'],
  ['❤️ ekrana bas', '→ moral dolar, HÜCUM!'],
  ['💬 her mesaj', '→ +1 asker'],
  ['🎁 hediye', '→ adınla asker yürür'],
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
    this.feedQueue = [];
    this.lastFeedAt = -1e9;
    this.lastCalloutEnd = -1e9;
    this.creditQueue = [];
    this.crediting = null;
    this.lastCreditEnd = -1e9;
    this.leaderKey = '';
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

    // Round leader (top gifter): permanent spot at the top of the map band, and the
    // personal gift credit strip right below it (upper-middle of the frame, clear of
    // TikTok's own top bar and bottom-left chat).
    const lead = el('div', 'leader-card empty', r);
    this.lead = { root: lead };
    this.lead.glow = el('div', 'leader-glow', lead);
    const lav = el('div', 'leader-av', lead);
    iconEl(a, 'icon_crown', lav, 'leader-crown');
    this.lead.av = makeAvatar(lav, 'leader');
    const lt = el('div', 'leader-text', lead);
    const ll = el('div', 'leader-label', lt);
    this.lead.label = el('span', '', ll, 'TURUN LİDERİ');
    this.lead.newTag = el('span', 'leader-new', ll, 'YENİ LİDER!');
    this.lead.nick = el('div', 'leader-nick', lt, 'İlk hediyeyi gönder, lider sen ol!');
    this.lead.sub = el('div', 'leader-sub', lt, '');
    const lc = el('div', 'leader-total', lead);
    this.lead.coins = el('div', 'leader-coins', lc, '');
    el('div', 'leader-coins-l', lc, 'jeton');

    const cr = el('div', 'credit', r);
    cr.style.display = 'none';
    this.cred = { root: cr };
    this.cred.av = makeAvatar(cr, 'credit-av');
    const ct = el('div', 'credit-text', cr);
    this.cred.nick = el('div', 'credit-nick', ct);
    this.cred.msg = el('div', 'credit-msg', ct);
    this.cred.troops = el('div', 'credit-troops', cr);

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
    // Top likers: recognition for viewers who only tap.
    const lh = el('div', 'panel-title likers-title', gift);
    iconEl(a, 'icon_heart', lh);
    el('span', '', lh, 'EN ÇOK BEĞENENLER');
    this.likerRows = [];
    const llist = el('div', 'liker-list', gift);
    for (let i = 0; i < (this.cfg.hud.topLikers ?? 2); i++) {
      const row = el('div', 'liker-row', llist);
      const nick = el('span', 'liker-nick', row);
      const n = el('span', 'liker-n', row);
      this.likerRows.push({ row, nick, n });
    }
    this.likerEmpty = el('div', 'liker-empty', llist, 'Ekrana bas, adın burada çıksın!');

    // Big situation-driven instruction (middle-upper part of the frame).
    this.impEl = el('div', 'imperative', r);
    this.impEl.style.display = 'none';
    this.impText = el('span', 'imp-text', this.impEl);
    // Finale "2 KAT" badge with its own countdown.
    this.finEl = el('div', 'finale', r);
    this.finEl.style.display = 'none';
    // Session scoreboard (rounds won per city).
    this.sessEl = el('div', 'session', r);
    this.sessEl.style.display = 'none';

    // Call to action
    const cta = el('div', 'cta', r);
    const ctaMain = el('div', 'cta-main', cta);
    el('span', 'cta-a', ctaMain, 'PLAKANI YAZ:');
    el('span', 'cta-chip', ctaMain, '34');
    el('div', 'cta-sub2', cta, 'İstersen emoji ekle, rozetin olur: 34 🔥');
    const ctaLine = el('div', 'cta-line', cta);
    this.ctaChip = el('span', 'cta-chip small', ctaLine, CTA_LINES[0][0]);
    this.ctaText = el('span', 'cta-text', ctaLine, CTA_LINES[0][1]);
    this.ctaLine = ctaLine;

    // Gift strip: four gifts by name, coin value and a two-word effect (hud.giftStrip in
    // the config; the game's own icons, not TikTok artwork). Other gifts work by coin value.
    const tiers = el('div', 'tiers panel-dark', r);
    const strip = this.cfg.hud.giftStrip || this.cfg.gifts.tiers.map((t) => ({ name: t.label, coins: t.minCoins, effect: t.legend }));
    strip.slice(0, 4).forEach((g, i) => {
      const s = el('div', `tier gs${i}`, tiers);
      const top = el('span', 'tier-name', s);
      iconEl(a, g.icon || 'icon_gem', top, 'icon tiny');
      el('span', '', top, String(g.name || ''));
      const c = el('span', 'tier-coins', s);
      iconEl(a, 'icon_coin', c, 'icon tiny');
      el('span', '', c, fmt(Number(g.coins) || 0));
      el('span', 'tier-label', s, String(g.effect || ''));
    });

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
    // Komutan in huge type.
    const cmd = el('div', 'end-cmd', ec);
    this.end.cmdAv = makeAvatar(cmd, 'big end-cmd-av');
    const cmdT = el('div', 'end-cmd-text', cmd);
    el('div', 'end-label', cmdT, '👑 KOMUTAN');
    this.end.cmdName = el('div', 'end-cmd-name', cmdT);
    this.end.cmdEl = cmd;
    // The winning city's members, scrolling.
    this.end.membersBox = el('div', 'end-members', ec);
    this.end.members = el('div', 'end-members-track', this.end.membersBox);
    const cols = el('div', 'end-cols', ec);
    const c1 = el('div', 'end-col', cols);
    el('div', 'end-col-title', c1, 'EN CÖMERTLER');
    this.end.gifters = el('div', 'end-gifters', c1);
    const c2 = el('div', 'end-col', cols);
    el('div', 'end-col-title', c2, 'EN ÇOK BEĞENENLER');
    this.end.likers = el('div', 'end-gifters', c2);
    this.end.cities = document.createElement('ol'); // kept for data, not shown
    this.end.countdown = el('div', 'end-countdown', ec);
    el('div', 'end-cta', ec, 'Yeni turda katıl: plakanı yaz (ör. 34)');

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
    // The map itself is fitted below the leader spot and credit strip.
    const inset = MAP_TOP_INSET * u;
    rect.fit = { x: rect.x, y: rect.y + inset, w: rect.w, h: Math.max(rect.h * 0.5, rect.h - inset) };
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

    // Likers
    const likers = sum.likers || [];
    this.likerRows.forEach((r, i) => {
      const l = likers[i];
      r.row.style.display = l ? '' : 'none';
      if (!l) return;
      setName(r.nick, l.nick, l.badge);
      r.nick.style.color = hexCss(l.colorHex);
      r.n.textContent = `❤ ${fmt(l.likes)}`;
    });
    this.likerEmpty.style.display = likers.length ? 'none' : '';

    // Session scoreboard
    const ss = sum.session || [];
    const sk = ss.map((s) => `${s.name}:${s.wins}`).join('|');
    if (sk !== this._sessK) {
      this._sessK = sk;
      this.sessEl.replaceChildren();
      this.sessEl.style.display = ss.length ? '' : 'none';
      if (ss.length) {
        iconEl(this.assets, 'icon_trophy', this.sessEl, 'icon tiny');
        ss.forEach((s, i) => {
          if (i) el('span', 'sess-dot', this.sessEl, '·');
          const e = el('span', 'sess-city', this.sessEl, `${s.name} ${s.wins}`);
          e.style.color = hexCss(s.colorHex);
        });
      }
    }

    // The instruction line never stacks with big callouts / announcements / countdown.
    const busy = !!this.callouting || !!this.announcing || this.countEl.style.display !== 'none';
    if (busy !== this._impHidden) { this._impHidden = busy; this.impEl.classList.toggle('hidden', busy); }

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

    this._pumpFeed();
    this._pumpCallout();
    this._pumpCredit();
    this._updateLeader(sum.gifters[0] || null);

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

  /** Feed lines are queued and released one per hud.feedMinGapSec; overflow drops the least important. */
  feed(text, colorHex = 0xffffff, icon = 'sword', important = false) {
    const q = this.feedQueue;
    const max = this.cfg.hud.feedQueueMax ?? 4;
    if (q.length >= max) {
      const i = q.findIndex((x) => !x.important);
      if (i >= 0) q.splice(i, 1);
      else if (!important) return;
      else q.shift();
    }
    q.push({ text, colorHex, icon, important });
    this._pumpFeed();
  }

  _pumpFeed() {
    const gap = this.cfg.hud.feedMinGapSec ?? 1.2;
    if (!this.feedQueue.length || this.timeNow - this.lastFeedAt < gap) return;
    this.lastFeedAt = this.timeNow;
    const o = this.feedQueue.shift();
    this._feedNow(o.text, o.colorHex, o.icon, o.important);
  }

  _feedNow(text, colorHex, icon, important) {
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
    // Only the last-seconds alarms may cut in; everything else waits its turn.
    if (this.callouting && (o.prio || 0) >= 4 && (this.callouting.prio || 0) < 4) { this._calloutAnim?.cancel(); this._showCallout(o); return; }
    const gapOk = this.timeNow - this.lastCalloutEnd >= (this.cfg.hud.calloutMinGapSec ?? 4);
    if (!this.callouting && gapOk && !this.calloutQueue.length) { this._showCallout(o); return; }
    o.queuedAt = this.timeNow;
    if (this.calloutQueue.length >= (this.cfg.hud.calloutQueueMax ?? 2)) {
      const low = this.calloutQueue.reduce((m, x, i, arr) => ((x.prio || 0) < (arr[m].prio || 0) ? i : m), 0);
      if ((this.calloutQueue[low].prio || 0) >= (o.prio || 0)) return;
      this.calloutQueue.splice(low, 1);
    }
    this.calloutQueue.push(o);
    this.calloutQueue.sort((a, b) => (b.prio || 0) - (a.prio || 0));
  }

  _pumpCallout() {
    if (this.callouting || this.announcing || !this.calloutQueue.length) return;
    if (this.timeNow - this.lastCalloutEnd < (this.cfg.hud.calloutMinGapSec ?? 4)) return;
    // Stale news is dropped rather than shown late.
    while (this.calloutQueue.length && this.timeNow - this.calloutQueue[0].queuedAt > 10 && (this.calloutQueue[0].prio || 0) < 3) this.calloutQueue.shift();
    const next = this.calloutQueue.shift();
    if (next) this._showCallout(next);
  }

  _showCallout(o) {
    this.callouting = o;
    // The instruction line yields immediately (never stacks with a big callout).
    this.impEl.classList.add('hidden'); this._impHidden = true;
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
      this.lastCalloutEnd = this.timeNow;
      C.style.display = 'none';
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
    this.impEl.classList.add('hidden'); this._impHidden = true;
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
    this.impEl.classList.add('hidden'); this._impHidden = true;
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
    // Ribbon sits below the leader spot and the gift credit strip.
    const ribbonY = (band.top + MAP_TOP_INSET) * u + cardH * 0.5 * 0.5 + 8 * u;
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

  // ---------- instruction line / finale ----------

  imperative(text, colorHex) {
    const E = this.impEl;
    E.style.display = '';
    if (this.impText.textContent === text) return;
    this.impText.textContent = text;
    E.style.setProperty('--c', hexCss(colorHex));
    E.animate([
      { opacity: 0, transform: 'translateX(-50%) scale(0.7)' },
      { opacity: 1, transform: 'translateX(-50%) scale(1.08)', offset: 0.6 },
      { opacity: 1, transform: 'translateX(-50%) scale(1)' },
    ], { duration: 380, easing: 'ease-out' });
  }

  /** left < 0 hides the finale badge. */
  setFinale(left, mult) {
    const F = this.finEl;
    if (left < 0) { if (F.style.display !== 'none') F.style.display = 'none'; return; }
    if (F.style.display === 'none') {
      F.style.display = '';
      F.animate([{ transform: 'scale(2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 500, easing: 'ease-out' });
    }
    const t = `${mult} KAT! · ${Math.max(0, Math.ceil(left))}`;
    if (F.textContent !== t) F.textContent = t;
  }

  // ---------- round leader ----------

  /** g: top gifter summary ({ nick, badge, avatar, coins, code, team, colorHex }) or null. */
  _updateLeader(g) {
    const L = this.lead;
    if (!g) {
      if (this.leaderKey !== '') {
        this.leaderKey = '';
        L.root.classList.add('empty');
        L.nick.textContent = 'İlk hediyeyi gönder, lider sen ol!';
        L.sub.textContent = ''; L.coins.textContent = '';
        L.av.set('', '?', 0xffd166);
      }
      return;
    }
    const who = `${g.nick}|${g.code}`;
    const changed = who !== this.leaderKey;
    L.root.classList.remove('empty');
    L.root.style.setProperty('--c', hexCss(g.colorHex));
    setName(L.nick, g.nick, g.badge);
    L.av.set(g.avatar, g.nick, g.colorHex);
    const sub = `${g.code} ${g.team}`;
    if (L.sub.textContent !== sub) L.sub.textContent = sub;
    const c = fmt(g.coins);
    if (L.coins.textContent !== c) {
      L.coins.textContent = c;
      if (!changed) L.coins.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'ease-out' });
    }
    if (changed) {
      const had = this.leaderKey !== '';
      this.leaderKey = who;
      // New leader: pop, glow and a "YENİ LİDER!" ribbon for a few seconds.
      L.root.animate([
        { transform: 'translateX(-50%) scale(0.7)', opacity: 0.4 },
        { transform: 'translateX(-50%) scale(1.12)', opacity: 1, offset: 0.35 },
        { transform: 'translateX(-50%) scale(1)', opacity: 1 },
      ], { duration: 700, easing: 'ease-out' });
      L.glow.animate([{ opacity: 1 }, { opacity: 0.8, offset: 0.7 }, { opacity: 0 }], { duration: 3200, easing: 'ease-out' });
      if (had) {
        L.root.classList.add('is-new');
        clearTimeout(this._leadT);
        this._leadT = setTimeout(() => L.root.classList.remove('is-new'), 4000);
      }
    }
  }

  // ---------- personal gift credits ----------

  _creditSec(o) {
    const list = this.cfg.hud.creditSec || [3.4, 4, 4.8, 6, 7];
    const base = list[Math.min(list.length - 1, o.tierIndex || 0)];
    // Under heavy traffic small credits get shorter, but never below 3 s.
    return this.creditQueue.length > 2 && (o.tierIndex || 0) < 2 ? Math.max(3, base * 0.85) : base;
  }

  /** o: { key, nick, badge, avatar, colorHex, troops, coins, giftName, count, team, code, tierIndex } */
  credit(o) {
    const mergeSec = this.cfg.hud.creditMergeSec ?? 6;
    const merge = (into) => {
      into.troops += o.troops; into.coins += o.coins;
      if (into.giftName === o.giftName) into.count += o.count; else { into.giftName = 'hediye'; into.count = 0; }
      into.tierIndex = Math.max(into.tierIndex, o.tierIndex);
      into.x2 = into.x2 || o.x2;
    };
    const cur = this.crediting;
    if (cur && cur.key === o.key && this.timeNow - cur.shownAt < mergeSec + this._creditSec(cur)) {
      merge(cur);
      cur.until = Math.max(cur.until, this.timeNow + Math.min(3, this._creditSec(o)));
      this._renderCredit(cur, true);
      return;
    }
    const q = this.creditQueue.find((x) => x.key === o.key);
    if (q) { merge(q); return; }
    const item = { ...o, count: o.count || 1 };
    const max = this.cfg.hud.creditQueueMax ?? 6;
    if (this.creditQueue.length >= max) {
      // Drop the smallest (oldest first) unless the new one is even smaller.
      let low = 0;
      this.creditQueue.forEach((x, i) => { if (x.tierIndex < this.creditQueue[low].tierIndex) low = i; });
      if (this.creditQueue[low].tierIndex > item.tierIndex) return;
      this.creditQueue.splice(low, 1);
    }
    // Bigger gifts jump ahead of small ones.
    let at = this.creditQueue.length;
    while (at > 0 && this.creditQueue[at - 1].tierIndex < item.tierIndex && item.tierIndex >= 2) at--;
    this.creditQueue.splice(at, 0, item);
    this._pumpCredit();
  }

  _pumpCredit() {
    const C = this.cred;
    const cur = this.crediting;
    if (cur && this.timeNow >= cur.until) {
      this.crediting = null;
      this.lastCreditEnd = this.timeNow;
      const anim = C.root.animate([{ opacity: 1, transform: 'translateX(-50%)' }, { opacity: 0, transform: 'translateX(-50%) translateY(-12px)' }], { duration: 220, fill: 'forwards' });
      anim.onfinish = () => { if (!this.crediting) C.root.style.display = 'none'; anim.cancel(); };
    }
    if (this.crediting || !this.creditQueue.length) return;
    if (this.timeNow - this.lastCreditEnd < (this.cfg.hud.creditGapSec ?? 0.25)) return;
    const o = this.creditQueue.shift();
    o.shownAt = this.timeNow;
    o.until = this.timeNow + this._creditSec(o);
    this.crediting = o;
    C.root.style.display = '';
    this._renderCredit(o, false);
    C.root.animate([
      { opacity: 0, transform: 'translateX(-50%) scale(0.8)' },
      { opacity: 1, transform: 'translateX(-50%) scale(1.05)', offset: 0.6 },
      { opacity: 1, transform: 'translateX(-50%) scale(1)' },
    ], { duration: 360, easing: 'ease-out' });
  }

  _renderCredit(o, bump) {
    const C = this.cred;
    C.root.className = `credit tier${Math.min(4, o.tierIndex || 0)}`;
    C.root.style.setProperty('--c', hexCss(o.colorHex));
    C.av.set(o.avatar, o.nick, o.colorHex);
    setName(C.nick, o.nick, o.badge);
    C.msg.textContent = o.msg || `${o.giftName}${o.count > 1 ? ' ×' + o.count : ''} gönderdi · ${fmt(o.coins)} jeton`;
    C.troops.textContent = `+${fmt(o.troops)} asker → ${o.team}${o.x2 ? ' (2 KAT!)' : ''}`;
    if (bump) C.troops.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'ease-out' });
  }

  // ---------- end screen ----------

  showEnd(d) {
    const E = this.end;
    E.root.style.display = '';
    E.title.textContent = `${d.round}. TUR BİTTİ`;
    if (d.winner) {
      E.winName.textContent = d.winner.name.toLocaleUpperCase('tr');
      E.winName.style.color = hexCss(d.winner.colorHex);
      E.winSub.textContent = `${d.winner.code} · ${d.winner.provinces} il fethetti`;
    } else {
      E.winName.textContent = 'Kazanan yok';
      E.winName.style.color = '';
      E.winSub.textContent = 'Bu turda kimse katılmadı';
    }
    const c = d.winner && d.winner.commander;
    E.cmdEl.style.display = c ? '' : 'none';
    if (c) {
      E.cmdAv.set(c.avatar, c.nick, d.winner.colorHex);
      setNameBadge(E.cmdName, c.nick, c.badge);
    }
    // Members scroll past (duplicated once for a seamless loop when long).
    const mem = d.members || [];
    E.members.replaceChildren();
    E.membersBox.style.display = mem.length ? '' : 'none';
    const addNames = () => mem.forEach((m) => setNameBadge(el('span', 'end-member', E.members), m.nick, m.badge));
    addNames();
    E.members.getAnimations().forEach((x) => x.cancel());
    if (mem.length > 6) {
      addNames();
      E.members.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }], { duration: Math.max(8000, mem.length * 900), iterations: Infinity });
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
    E.likers.replaceChildren();
    const likers = d.likers || [];
    if (!likers.length) el('div', 'board-empty', E.likers, 'Bu tur beğeni yok');
    likers.forEach((g, i) => {
      const row = el('div', 'end-gifter', E.likers);
      el('div', 'medal m' + (i + 1), row, String(i + 1));
      makeAvatar(row, 'mid').set(g.avatar, g.nick, g.colorHex);
      const info = el('div', 'gifter-info', row);
      setNameBadge(el('div', 'gifter-nick', info), g.nick, g.badge);
      const sub = el('div', 'gifter-sub', info, `❤ ${fmt(g.likes)} · ${g.team}`);
      sub.style.color = hexCss(g.colorHex);
    });
    this.impEl.style.display = 'none';
    this.finEl.style.display = 'none';
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
