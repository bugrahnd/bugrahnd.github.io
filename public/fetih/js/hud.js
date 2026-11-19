// DOM/CSS overlay: timer, leaderboards, feed, call to action, gift legend, nudges,
// callouts, announcements, countdown, end screen.
// Every untrusted string (nicknames, gift names) is inserted with textContent;
// avatars are <img> elements with a letter fallback.
import { fmt, fmtShort, fmtTime, safeImageUrl, setNameBadge, badgeKey } from './util.js';
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

/**
 * A gift picture from TikTok's CDN (plain <img>, no referrer). Hidden while empty or when
 * the URL fails; `fallback` (a game icon path) is shown instead when given.
 */
function giftImg(parent, cls, fallback = '') {
  const i = el('img', 'gift-img ' + cls, parent);
  i.alt = ''; i.decoding = 'async'; i.referrerPolicy = 'no-referrer'; i.draggable = false;
  let fb = fallback;
  const show = (src) => { if (src) { i.src = src; i.style.display = ''; } else { i.removeAttribute('src'); i.style.display = 'none'; } };
  i.onerror = () => { if (fb && i.getAttribute('src') !== fb) { i.classList.add('fb'); show(fb); } else show(''); };
  show(fallback);
  return {
    img: i,
    set(url, fallbackSrc = fb) {
      fb = fallbackSrc;
      const safe = safeImageUrl(url);
      i.classList.toggle('fb', !safe);
      const want = safe || fb;
      if (i.getAttribute('src') !== want) show(want);
    },
  };
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

// ---- Stream layout (portrait, TikTok LIVE safe zones) ----
// TikTok covers the top (header), the bottom-left (chat), the bottom edge and a right
// column of the lower half. Defaults below; hud.tiktokZones in game.json overrides.
// Everything a viewer needs sits between safeTop (= zones.top) and safeBottom
// (= zones.chatTop), and between the side insets (zones.side: a 9:16 stream shown on a
// taller phone screen is scaled to fill the height and cropped left and right, so the
// outer `side` units of each edge may not be visible). Rows, top-down from safeTop (keep
// in sync with the .stream rules in hud.css, which use the same offsets via --st / --sb /
// --sx / --s-*), x from side (sx) to 1080 - sx:
//   strip    st+4    h 66   timer (centre), session leader (left), top liker (right)
//   cities   st+76   h 48   top 3 cities as chips
//   gifters  st+130  h 48   top 3 gifters as chips
//   lead     st+184  h 104  round leader (left) | credit / held-gift hint / tips (right)
//   band     st+294 … sb-172   map; the imperative line overlays its top STREAM_MAP_INSET
//   cta row  sb-166  h 60   "PLAKANI YAZ: 34" | HÜCUM bar   } one unit, x sx … rightColLeft - sx
//   gifts    sb-100  h 96   gift ladder, 3 tiles per page    } (clear of the hearts column)
export const DEFAULT_ZONES = { top: 230, chatTop: 1250, chatRight: 720, bottomBar: 130, rightColLeft: 900, rightColTop: 1000, side: 60 };
// Row heights incl. their 6-unit gap. Rows of hidden blocks collapse (Hud._streamRows)
// and the map band grows into them.
const STREAM_STRIP_H = 76;
const STREAM_CHIPS_H = 54;
const STREAM_LEAD_H = 110;
const STREAM_GIFTS_H = 100; // gift ladder top above safeBottom (96 + 4)
const STREAM_CTA_H = 66; // cta row height + gap
const STREAM_MAP_INSET = 58; // imperative line over the top of the band

/** How-to lines in the tips slot; the like line uses the live likes-per-troop number. */
function ctaLines(cfg) {
  const per = cfg.engage?.likesPerTroop ?? 10;
  return [
    ['34', 'yaz → İstanbul’a katıl'],
    ['ankara', 'şehir adı da olur'],
    ['❤️ ekrana bas', per > 0 ? `${per} beğeni = 1 asker` : 'moral → HÜCUM!'],
    ['❤️ beğeni', 'moral dolar → HÜCUM!'],
    ['💬 her mesaj', '+1 asker'],
    ['🎁 hediye', 'adınla asker yürür'],
  ];
}

const LEADER_EMPTY = 'Hediye gönder, lider sen ol!';
export const DEFAULT_TITLE = 'PLAKA SAVAŞLARI';

/** Normalised gift name for matching strip entries to TikTok's catalogue. */
const giftKey = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, '');

export class Hud {
  /** opts.variant: default portrait variant, 'stream' (TikTok safe zones) or 'full'. */
  constructor(root, assets, config, provinceCount = 81, opts = {}) {
    this.root = root;
    this.assets = assets;
    this.cfg = config;
    this.provinceCount = provinceCount;
    this.layout = null;
    this.variant = null;
    this.defaultVariant = opts.variant === 'full' ? 'full' : 'stream';
    this.zones = { ...DEFAULT_ZONES, ...(config.hud.tiktokZones || {}) };
    this.show = {}; // block id -> false when hidden by the streamer (settings "Ekran")
    this._build();
    if (opts.zones) this._buildZones();
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
    this.lead.nick = el('div', 'leader-nick', lt, LEADER_EMPTY);
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
    this.cred.troopsBox = el('div', 'credit-troops', cr);
    // The sent gift's picture (TikTok CDN URL from the live bridge), hidden when missing.
    this.cred.gift = giftImg(this.cred.troopsBox, 'credit-gift');
    this.cred.troops = el('span', '', this.cred.troopsBox);

    // Top bar
    const top = el('div', 'topbar panel-dark', r);
    // Logo: the first word on a licence plate (blue TR band), the rest in gold. The text
    // is a streamer setting (title.text); see setTitle.
    const title = el('div', 'title', top);
    const plate = el('span', 'title-plate', title);
    el('span', 'title-tr', plate, 'TR');
    this.titleA = el('span', 'title-a', plate, 'PLAKA');
    this.titleB = el('span', 'title-b', title, 'SAVAŞLARI');
    const timer = el('div', 'timer', top);
    iconEl(a, 'icon_hourglass', timer, 'icon timer-icon');
    this.timerText = el('span', 'timer-text', timer, '10:00');
    this.roundText = el('span', 'round-text', timer, '1. TUR');
    this.timerEl = timer;
    this.topEl = top;
    // Technical status: only with ?debug=1 (hud.css hides .conn otherwise).
    const conn = el('div', 'conn', top);
    this.connEl = conn;
    this.connDot = el('span', 'conn-dot', conn);
    this.connText = el('span', 'conn-text', conn, 'Bağlanıyor…');
    this.statusText = el('span', 'status-text', conn, '');
    // Small waiting indicator while the bridge is down (no technical detail).
    this.waitEl = el('div', 'wait-pill', r, 'Köprü bekleniyor…');
    // Stream layout: one slim strip below TikTok's header (timer, session, likers).
    this.stripEl = el('div', 'strip panel-dark', r);
    this.stripL = el('div', 'strip-l', this.stripEl);
    this.stripC = el('div', 'strip-c', this.stripEl);
    this.stripR = el('div', 'strip-r', this.stripEl);
    // Stream layout: idle tips in the credit slot (when no credit / held gift shows).
    this.idleEl = el('div', 'idle-slot', r);

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
    this.boardEmpty = el('div', 'board-empty', list, 'Plakanı yaz, şehrini uyandır!');

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
    this.giftersEl = gift;
    this.likerBox = el('div', 'likers', gift);
    const lh = el('div', 'panel-title likers-title', this.likerBox);
    iconEl(a, 'icon_heart', lh);
    el('span', '', lh, 'EN ÇOK BEĞENENLER');
    this.likerRows = [];
    const llist = el('div', 'liker-list', this.likerBox);
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
    this.ctaEl = cta;
    const ctaMain = el('div', 'cta-main', cta);
    this.ctaA = el('span', 'cta-a', ctaMain, 'PLAKANI YAZ:');
    this.ctaMainChip = el('span', 'cta-chip', ctaMain, '34');
    this.ctaSub2 = el('div', 'cta-sub2', cta, 'İstersen emoji ekle, rozetin olur: 34 🔥');
    const ctaLine = el('div', 'cta-line', cta);
    const cl = ctaLines(this.cfg);
    this.ctaChip = el('span', 'cta-chip small', ctaLine, cl[0][0]);
    this.ctaText = el('span', 'cta-text', ctaLine, cl[0][1]);
    this.ctaLine = ctaLine;

    // Gift strip: four gifts by name, coin value and a two-word effect (hud.giftStrip in
    // the config; the game's own icons, not TikTok artwork). Other gifts work by coin value.
    // Gift ladder: every tile reads "gift · price → +N asker, effect" (N live from
    // troops.giftCurve via this.troopsFor). Shown as auto-advancing pages that fit the strip.
    this.tiersEl = el('div', 'tiers panel-dark', r);
    this.tierTrack = el('div', 'tier-track', this.tiersEl);
    this.tierMeasure = el('div', 'tier-measure', this.tiersEl);
    this.tierDots = el('div', 'tier-dots', this.tiersEl);
    this.giftIcons = { byId: new Map(), byName: new Map(), v: 0 };
    this.troopsFor = null; // (coins) => troops for ONE gift (set by main.js from the game)
    this.stripTroops = this.cfg.hud.giftStripTroops !== false;
    this.stripPage = 0; this.stripT = 0; this.pulseUntil = 0; this.pulseCoins = 0; this.pulseAt = -1e9;
    this.tiles = []; this.pages = [];
    this.setGiftStrip(this.cfg.hud.giftStrip);

    // HÜCUM bar: the city closest to (or in) HÜCUM, labelled, over the bottom of the map.
    this.hbEl = el('div', 'hucum-bar', r);
    this.hbEl.style.display = 'none';
    this.hbFill = el('div', 'hb-fill', this.hbEl);
    this.hbText = el('div', 'hb-text', this.hbEl);

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
    const ag = el('div', 'announce-gift', whoText);
    this.ann.giftImg = giftImg(ag, 'announce-gift-img');
    this.ann.gift = el('span', '', ag);
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

  /**
   * (Re)builds the gift ladder. Entries: { name, coins, effect, id?, icon?, plus? }, cheapest
   * first. Each tile reads "gift · price → +N asker, effect"; N comes live from the gift
   * curve (this.troopsFor) unless the streamer hid the number (troopsOn = false).
   */
  setGiftStrip(list, troopsOn) {
    if (troopsOn !== undefined) this.stripTroops = troopsOn !== false;
    const strip = (Array.isArray(list) && list.length ? list : this.cfg.gifts.tiers.map((t) => ({ name: '', coins: t.minCoins, plus: true, effect: t.legend })))
      .slice(0, 12);
    this._stripList = strip;
    const troops = strip.map((g) => (this.troopsFor ? Math.round(this.troopsFor(Math.max(1, Number(g.coins) || 1))) : 0));
    const key = JSON.stringify([strip, troops, this.stripTroops]);
    if (key === this._stripKey) return;
    this._stripKey = key;
    const a = this.assets;
    this.tiles = strip.map((g, i) => {
      const name = String(g.name || '').trim();
      const coins = Math.max(1, Number(g.coins) || 1);
      const t = el('div', `tier r${this._rankFor(coins)}`);
      t.classList.toggle('noname', !name);
      const head = el('div', 'tier-head', t);
      const fb = a.uiPath(g.icon || 'icon_gem');
      const img = giftImg(head, 'tier-img', fb);
      if (name) el('span', 'tier-name', head, name);
      const c = el('span', 'tier-coins', head);
      iconEl(a, 'icon_coin', c, 'icon tiny');
      el('span', '', c, `${fmt(coins)}${g.plus ? '+' : ''}`);
      if (!name) el('span', 'tier-jeton', c, ' jeton');
      const res = el('div', 'tier-res', t);
      if (this.stripTroops && troops[i] > 0) el('span', 'tier-troops', res, `+${fmt(troops[i])} asker`);
      if (String(g.effect || '').trim()) el('span', 'tier-label', res, String(g.effect).trim());
      el('div', 'tier-hot', t, 'AZ ÖNCE!');
      const tile = { el: t, g: { ...g, name, coins }, img, fb };
      img.set(this._iconForEntry(tile.g), fb);
      return tile;
    });
    this._paginate();
  }

  /** Spectacle class (gifts.tiers[].rank) for a coin value: colours the ladder steps. */
  _rankFor(coins) {
    let r = 0;
    for (const t of this.cfg.gifts.tiers || []) if (coins >= t.minCoins) r = t.rank ?? r;
    return Math.min(4, r);
  }

  _iconForEntry(g) {
    const I = this.giftIcons;
    if (g.id && I.byId.has(g.id)) return I.byId.get(g.id);
    return g.name ? I.byName.get(giftKey(g.name)) || '' : '';
  }

  /** Room gift catalogue from the bridge ({ type: "gifts", items: [{ id, name, coins, icon }] }). */
  setGiftCatalog(items) {
    if (!Array.isArray(items)) return;
    for (const it of items) {
      const icon = safeImageUrl(it?.icon);
      if (!icon || !/^https:/i.test(icon)) continue;
      const id = Math.floor(Number(it.id));
      if (id > 0) this.giftIcons.byId.set(id, icon);
      const k = giftKey(it.name);
      if (k && !this.giftIcons.byName.has(k)) this.giftIcons.byName.set(k, icon);
    }
    for (const t of this.tiles) t.img.set(this._iconForEntry(t.g), t.fb);
  }

  /** A gift event carried its picture: remember it (by id and name) for tiles and credits. */
  noteGiftIcon(id, name, icon) {
    const safe = safeImageUrl(icon);
    if (!safe) return;
    const k = giftKey(name);
    if ((id && this.giftIcons.byId.get(id) === safe) || (!id && k && this.giftIcons.byName.get(k) === safe)) return;
    if (id) this.giftIcons.byId.set(id, safe);
    if (k) this.giftIcons.byName.set(k, safe);
    for (const t of this.tiles) if ((id && t.g.id === id) || (k && giftKey(t.g.name) === k)) t.img.set(safe, t.fb);
  }

  giftIconFor(id, name) {
    return (id && this.giftIcons.byId.get(id)) || this.giftIcons.byName.get(giftKey(name)) || '';
  }

  /** Packs the tiles into pages that fit the strip (measured, so the type never shrinks). */
  _paginate() {
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 0;
    const W = u ? this.tiersEl.clientWidth / u : 0;
    if (!u || W < 50 || !this.tiles.length) { this.pages = this.tiles.length ? [[this.tiles.map((_, i) => i)]] : []; this._showPage(0); return; }
    this.tierMeasure.replaceChildren(...this.tiles.map((t) => t.el));
    const widths = this.tiles.map((t) => t.el.getBoundingClientRect().width / u);
    const stream = this.variant === 'stream';
    const avail = W - 34; // border + padding + page dots
    const gap = 6;
    const maxPer = this.cfg.hud.giftStripPageSize ?? 4;
    const rows = [];
    let row = []; let w = 0;
    widths.forEach((tw, i) => {
      if (row.length && (w + gap + tw > avail || row.length >= maxPer)) { rows.push(row); row = []; w = 0; }
      w += (row.length ? gap : 0) + tw; row.push(i);
    });
    if (row.length) rows.push(row);
    const per = stream ? 1 : 2; // the full layout has room for two rows
    this.pages = [];
    for (let i = 0; i < rows.length; i += per) this.pages.push(rows.slice(i, i + per));
    this.tierMeasure.replaceChildren();
    this.tierDots.replaceChildren(...this.pages.map(() => el('i')));
    this.tierDots.style.display = this.pages.length > 1 ? '' : 'none';
    this._showPage(Math.min(this.stripPage, this.pages.length - 1));
  }

  _showPage(n, animate = false) {
    if (!this.pages.length) { this.tierTrack.replaceChildren(); return; }
    this.stripPage = (n + this.pages.length) % this.pages.length;
    this.stripT = 0;
    const rows = this.pages[this.stripPage].map((r) => {
      const d = el('div', 'tier-row');
      for (const i of r) d.append(this.tiles[i].el);
      return d;
    });
    this.tierTrack.replaceChildren(...rows);
    [...this.tierDots.children].forEach((d, i) => d.classList.toggle('on', i === this.stripPage));
    if (animate) this.tierTrack.animate([{ opacity: 0, transform: 'translateX(4%)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'ease-out' });
  }

  /** A gift arrived: jump to its ladder step and mark it for a moment ("AZ ÖNCE!"). */
  giftPulse(coins, id = 0, name = '') {
    if (!this.tiles.length || !this._vis('giftStrip')) return;
    // Chaos-level traffic: a smaller gift does not steal a fresh pulse.
    if (this.timeNow - this.pulseAt < 1.2 && coins < this.pulseCoins) return;
    const T = this.tiles;
    let idx = id ? T.findIndex((t) => t.g.id === id) : -1;
    const k = giftKey(name);
    if (idx < 0 && k) idx = T.findIndex((t) => t.g.name && giftKey(t.g.name) === k);
    if (idx < 0) {
      let best = -1;
      T.forEach((t, i) => { if (t.g.coins <= coins && (best < 0 || t.g.coins > T[best].g.coins)) best = i; });
      idx = best < 0 ? 0 : best;
    }
    this.pulseAt = this.timeNow; this.pulseCoins = coins;
    this.pulseUntil = this.timeNow + (this.cfg.hud.giftPulseSec ?? 3.5);
    const page = this.pages.findIndex((p) => p.some((r) => r.includes(idx)));
    if (page >= 0 && page !== this.stripPage) this._showPage(page, true);
    this.stripT = 0;
    for (const t of T) t.el.classList.remove('hot');
    const tile = T[idx].el;
    tile.classList.add('hot');
    tile.animate([{ transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
  }

  _stepStrip(dt) {
    if (this.pulseUntil && this.timeNow > this.pulseUntil) {
      this.pulseUntil = 0;
      for (const t of this.tiles) t.el.classList.remove('hot');
    }
    if (this.pulseUntil || this.pages.length < 2) return;
    this.stripT += dt;
    if (this.stripT >= (this.cfg.hud.giftStripPageSec ?? 4)) this._showPage(this.stripPage + 1, true);
  }

  /** The labelled morale bar: "İSTANBUL HÜCUM %80"; full = "İSTANBUL HÜCUMDA! 12 sn". */
  _updateHucumBar(h) {
    const E = this.hbEl;
    const on = !!h && this._vis('hucumBar');
    // Stream layout: the bar shares the call-to-action row (the CTA narrows while it shows).
    if (on !== this._hbOn) { this._hbOn = on; this.root.classList.toggle('hb-on', on); }
    if (!on) { if (E.style.display !== 'none') E.style.display = 'none'; return; }
    if (E.style.display === 'none') E.style.display = '';
    E.style.setProperty('--c', hexCss(h.colorHex));
    E.classList.toggle('on', h.hucum);
    const up = h.name.toLocaleUpperCase('tr');
    const left = Math.max(0, Math.ceil(h.left));
    const pct = Math.floor(h.frac * 100);
    const t = this.variant === 'stream'
      ? (h.hucum ? `🔥 ${up} HÜCUMDA ${left}` : `❤ ${up} %${pct}`)
      : (h.hucum ? `🔥 ${up} HÜCUMDA! ${left} sn` : `❤ ${up} HÜCUM %${pct}`);
    if (this.hbText.textContent !== t) this.hbText.textContent = t;
    this.hbFill.style.transform = `scaleX(${h.frac.toFixed(3)})`;
    if (h.hucum && !this._hbWas) E.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 500, easing: 'ease-out' });
    this._hbWas = h.hucum;
  }

  /** Logo text (streamer setting): first word on the plate, the rest beside it in gold. */
  setTitle(text) {
    const words = String(text || DEFAULT_TITLE).trim().split(/\s+/);
    const a = words.shift() || '';
    const b = words.join(' ');
    if (this.titleA.textContent !== a) this.titleA.textContent = a;
    if (this.titleB.textContent !== b) this.titleB.textContent = b;
    this.titleB.style.display = b ? '' : 'none';
  }

  /** Call-to-action text ("PLAKANI YAZ:") and its example chip ("34"). */
  setCta(text, example) {
    if (this.ctaA.textContent !== text) this.ctaA.textContent = text;
    if (this.ctaMainChip.textContent !== example) this.ctaMainChip.textContent = example;
    const sub = `İstersen emoji ekle, rozetin olur: ${example} 🔥`;
    if (this.ctaSub2.textContent !== sub) this.ctaSub2.textContent = sub;
  }

  /**
   * Shows/hides HUD blocks (ids: cityBoard, gifterBoard, likers, leader, credit,
   * imperative, giftStrip, session, minimap). Returns true when the layout changed
   * (the caller then re-runs applyLayout so the map band grows into the freed rows).
   */
  setVisibility(show) {
    const next = { ...show };
    if (JSON.stringify(next) === JSON.stringify(this.show)) return false;
    this.show = next;
    for (const [id, on] of Object.entries(next)) this.root.classList.toggle(`hide-${id}`, on === false);
    return true;
  }

  _vis(id) { return this.show[id] !== false; }

  /** Drops queued/visible per-viewer items (credits, nudges, announcements): a wiped map. */
  clearTransient() {
    this.creditQueue.length = 0;
    if (this.crediting) this.crediting.until = this.timeNow;
    for (const name of [...this.nudges.keys()]) this.dismissNudge(name);
    this.announceQueue.length = 0;
    this.calloutQueue.length = 0;
  }

  /** Lays the stage out and returns the rectangle (px) where the map should be drawn. */
  applyLayout(w, h, forced) {
    // The HUD is designed on a 1080x1920 (portrait) or 1920x1080 (landscape) stage,
    // scaled by --u and centred in the viewport. A portrait screen taller than 9:16
    // (phones) gives the extra height to the map band (--ex design units) in the full
    // layout; the stream layout keeps the exact 9:16 stage so the TikTok zones line up.
    // forced: 'stream' | 'full' (portrait variants), 'portrait' | 'landscape'.
    const variantForced = forced === 'stream' || forced === 'full' ? forced : null;
    const portrait = variantForced ? true : forced ? forced === 'portrait' : w / h < 0.85;
    const variant = portrait ? (variantForced || this.defaultVariant) : 'full';
    const stream = portrait && variant === 'stream';
    const safe = this._safeArea();
    const ah = Math.max(1, h - safe.top - safe.bottom);
    const dw = portrait ? 1080 : 1920; let dh = portrait ? 1920 : 1080;
    const u = Math.min(w / dw, ah / dh);
    let ex = 0;
    if (portrait && !stream && ah / u > dh + 1) { ex = Math.min(700, ah / u - dh); dh += ex; }
    const ox = (w - dw * u) / 2; const oy = safe.top + (ah - dh * u) / 2;
    const doc = document.documentElement;
    doc.style.setProperty('--u', `${u}px`);
    doc.style.setProperty('--ex', String(ex));
    const Z = this.zones;
    doc.style.setProperty('--st', String(Z.top));
    doc.style.setProperty('--sb', String(Z.chatTop));
    doc.style.setProperty('--srx', String(Z.rightColLeft));
    doc.style.setProperty('--sx', String(Z.side));
    doc.classList.toggle('portrait', portrait);
    doc.classList.toggle('landscape', !portrait);
    doc.classList.toggle('stream', stream);
    this.root.style.left = `${ox}px`;
    this.root.style.top = `${oy}px`;
    this.root.style.width = `${dw * u}px`;
    this.root.style.height = `${dh * u}px`;
    this.layout = portrait ? 'portrait' : 'landscape';
    this._place(stream ? 'stream' : 'full');
    // Stream rows collapse when the streamer hides their blocks; the map band takes the
    // space. Still between safeTop and safeBottom (TikTok header / chat never overlap).
    const R = this._streamRows();
    doc.style.setProperty('--s-cities', String(R.cities));
    doc.style.setProperty('--s-gifters', String(R.gifters));
    doc.style.setProperty('--s-lead', String(R.lead));
    doc.style.setProperty('--s-bt', String(R.bandTop));
    doc.style.setProperty('--s-bb', String(R.bandBottom));
    doc.style.setProperty('--s-cta', String(R.cta));
    const b = stream
      ? { x: 0, y: Z.top + R.bandTop, w: 1080, h: Z.chatTop - R.bandBottom - (Z.top + R.bandTop) }
      : { ...BANDS[this.layout] };
    b.h += ex;
    this.bandDesign = b;
    const rect = { x: ox + b.x * u, y: oy + b.y * u, w: b.w * u, h: b.h * u, u };
    // A window wider than the portrait stage: let the map use the extra width (full
    // layout only; the stream frame is the 9:16 stage, its map stays inside the side insets).
    if (portrait && !stream && ox > 8) { rect.x = 8; rect.w = w - 16; }
    // Same for extra height in landscape.
    if (!portrait && oy > 8) { rect.y = oy + b.y * u; rect.h = b.h * u + oy * 0.5; }
    this.bandEl.style.left = `${rect.x - ox}px`;
    this.bandEl.style.top = `${rect.y - oy}px`;
    this.bandEl.style.width = `${rect.w}px`;
    this.bandEl.style.height = `${rect.h}px`;
    // The map itself is fitted below the leader spot and credit strip.
    const inset = (stream ? (this._vis('imperative') ? STREAM_MAP_INSET : 0) : MAP_TOP_INSET) * u;
    rect.fit = { x: rect.x, y: rect.y + inset, w: rect.w, h: Math.max(rect.h * 0.5, rect.h - inset) };
    if (stream) {
      // Turkey (with KKTC) spans the width between the side insets; nearly no extra margin.
      const sx = Z.side * u;
      Object.assign(rect.fit, { x: ox + sx, w: dw * u - 2 * sx, fx: 0.985, fy: 0.97 });
    }
    // Ladder pages depend on the strip width at this scale.
    this._paginate();
    return rect;
  }

  /**
   * Stream layout rows in design units (see the table at the top): offsets from safeTop
   * for the boards row, the leader row and the map band top; offsets above safeBottom for
   * the map band bottom and the call to action. All blocks shown = the original layout.
   */
  _streamRows() {
    let y = STREAM_STRIP_H;
    const cities = y;
    if (this._vis('cityBoard')) y += STREAM_CHIPS_H;
    const gifters = y;
    if (this._vis('gifterBoard')) y += STREAM_CHIPS_H;
    const lead = y;
    if (this._vis('leader') || this._vis('credit')) y += STREAM_LEAD_H;
    const cta = (this._vis('giftStrip') ? STREAM_GIFTS_H : 4) + STREAM_CTA_H;
    return { cities, gifters, lead, bandTop: y, bandBottom: cta + 6, cta };
  }

  /** Moves the few nodes that live in different containers per portrait variant. */
  _place(variant) {
    if (this.variant === variant) return;
    this.variant = variant;
    this._sessK = null;
    if (variant === 'stream') {
      this.stripL.append(this.sessEl);
      this.stripC.append(this.timerEl);
      this.stripR.append(this.likerBox);
      this.idleEl.append(this.ctaLine);
    } else {
      this.topEl.insertBefore(this.timerEl, this.connEl);
      this.root.insertBefore(this.sessEl, this.ctaEl);
      this.giftersEl.append(this.likerBox);
      this.ctaEl.append(this.ctaLine);
    }
  }

  /** ?zones=1: TikTok LIVE UI zones drawn over the stage (owner alignment check). */
  _buildZones() {
    const Z = this.zones;
    const H = 1920;
    const box = el('div', 'tt-zones', this.root);
    const rect = (x, y, w, h, label, cls) => {
      const d = el('div', 'tt-zone ' + cls, box);
      Object.assign(d.style, { left: `calc(var(--u) * ${x})`, top: `calc(var(--u) * ${y})`, width: `calc(var(--u) * ${w})`, height: `calc(var(--u) * ${h})` });
      el('span', 'tt-zone-l', d, label);
    };
    rect(0, 0, 1080, Z.top, `TikTok başlık / izleyici (0–${Z.top})`, 'z-top');
    rect(0, Z.chatTop, Z.chatRight, H - Z.bottomBar - Z.chatTop, `TikTok sohbet (y ≥ ${Z.chatTop}, x ≤ ${Z.chatRight})`, 'z-chat');
    rect(Z.rightColLeft, Z.rightColTop, 1080 - Z.rightColLeft, H - Z.bottomBar - Z.rightColTop, 'kalp / hediye', 'z-right');
    rect(0, H - Z.bottomBar, 1080, Z.bottomBar, 'yorum kutusu / hediye / paylaş', 'z-bottom');
    // Side insets: cropped on phones taller than 9:16 (the stream is scaled to fill the height).
    if (Z.side > 0) {
      rect(0, Z.top, Z.side, H - Z.top - Z.bottomBar, '', 'z-side');
      rect(1080 - Z.side, Z.top, Z.side, H - Z.top - Z.bottomBar, '', 'z-side');
    }
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
    this.waitEl.classList.toggle('on', !ok);
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
      r.troops.textContent = this.variant === 'stream'
        ? `${fmtShort(t.troops)} · ${fmtShort(t.members)} kişi`
        : `${fmtShort(t.troops)} asker · ${fmt(t.members)} kişi`;
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
      r.coins.textContent = this.variant === 'stream' ? fmt(g.coins) : `${fmt(g.coins)} jeton`;
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
    const stream = this.variant === 'stream';
    const ss = (sum.session || []).slice(0, stream ? 1 : 3);
    const sk = `${this.variant}|` + ss.map((s) => `${s.name}:${s.wins}`).join('|');
    if (sk !== this._sessK) {
      this._sessK = sk;
      this.sessEl.replaceChildren();
      this.sessEl.style.display = ss.length ? '' : 'none';
      if (ss.length) {
        if (!stream) iconEl(this.assets, 'icon_trophy', this.sessEl, 'icon tiny');
        ss.forEach((s, i) => {
          if (i && !stream) el('span', 'sess-dot', this.sessEl, '·');
          const e = el('span', 'sess-city', this.sessEl, stream ? `🏆 ${s.name} ${s.wins}` : `${s.name} ${s.wins}`);
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
      const cl = ctaLines(this.cfg);
      this.ctaI = (this.ctaI + 1) % cl.length;
      this.ctaLine.classList.remove('hint');
      this.root.classList.remove('hinting');
      this.ctaChip.textContent = cl[this.ctaI][0];
      this.ctaText.textContent = cl[this.ctaI][1];
      this.ctaLine.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 300 });
    }

    this._stepStrip(dt);
    this._updateHucumBar(sum.hucumBar);
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
    this.root.classList.add('hinting');
    this.ctaLine.style.setProperty('--c', hexCss(colorHex));
    this.ctaChip.textContent = example;
    this.ctaText.textContent = `${nick}, emoji ekle! Böyle yaz`;
    this.ctaLine.animate([{ transform: 'scale(0.8)' }, { transform: 'scale(1.06)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: 400 });
  }

  /** Short personal answer in the tips line ("Zaten İzmir'desin"). */
  reply(nick, text, colorHex) {
    this.hintUntil = this.timeNow + 3.5;
    this.ctaT = 0;
    this.ctaLine.classList.add('hint');
    this.root.classList.add('hinting');
    this.ctaLine.style.setProperty('--c', hexCss(colorHex));
    this.ctaChip.textContent = nick;
    this.ctaText.textContent = text;
    this.ctaLine.animate([{ transform: 'scale(0.8)' }, { transform: 'scale(1.06)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: 400 });
  }

  /** After a 100+ coin gift: minor callouts wait (and a minor one on screen yields). */
  holdCallouts(sec) {
    this.calloutHoldUntil = Math.max(this.calloutHoldUntil || 0, this.timeNow + sec);
    if (this.callouting && (this.callouting.prio || 0) < 3) this._calloutAnim?.cancel();
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

  /**
   * A viewer who has not joined sent gifts (coins) and/or likes: show them what to type.
   * likes > 0 without coins = "Beğenilerin boşa gidiyor: plakanı yaz" (the game rate-limits it).
   */
  nudge(name, nick, avatar, coins, cooldownSec, likes = 0) {
    const what = coins > 0 ? `${fmt(coins)} jeton bekliyor` : `❤ ${fmt(likes)} beğeni`;
    const msg = coins > 0 ? 'Plakanı yaz: ' : 'Beğenilerin boşa gidiyor: plakanı yaz ';
    const existing = this.nudges.get(name);
    if (existing) {
      existing.coins.textContent = what;
      existing.msg.textContent = msg;
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
    const c = el('span', 'nudge-coins', l1, what);
    const l2 = el('div', 'nudge-msg', txt);
    const m = el('span', '', l2, msg);
    const ex = this.ctaMainChip.textContent || '34';
    el('span', 'cta-chip tiny', l2, coins > 0 ? `${ex} 🔥` : ex);
    n.classList.toggle('likes', !(coins > 0));
    this.nudgeEl.append(n);
    n.animate([{ opacity: 0, transform: 'translateX(40px)' }, { opacity: 1, transform: 'none' }], { duration: 300 });
    this.nudges.set(name, { el: n, until: this.timeNow + (coins > 0 ? 8 : 6), coins: c, msg: m });
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
    const held = this.timeNow < (this.calloutHoldUntil || 0) && (o.prio || 0) < 3;
    if (!this.callouting && gapOk && !held && !this.calloutQueue.length) { this._showCallout(o); return; }
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
    if (this.timeNow < (this.calloutHoldUntil || 0) && (this.calloutQueue[0].prio || 0) < 3) return;
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
    A.giftImg.set(o.giftIcon || '');
    A.gift.textContent = `${o.giftName}${o.count > 1 ? ' ×' + o.count : ''} gönderdi`;
    A.troops.textContent = `${fmtShort(o.troops)} asker → ${o.team}`;
    A.effect.textContent = o.effect || '';
    A.effect.style.display = o.effect ? '' : 'none';
    const dur = (o.sec || 5) * 1000;
    const shorten = this.announceQueue.length > 1 ? 0.6 : 1;
    // Full-screen moment, then the card simply fades: the HUD credit strip (outside the
    // map band) carries the credit afterwards, so nothing on the map repeats it.
    const hold = o.tierId === 'sultan' ? 0.42 : 0.34;
    const total = dur * shorten * (hold + 0.1);
    const anim = A.card.animate([
      { opacity: 0, transform: 'scale(0.3) rotate(-4deg)' },
      { opacity: 1, transform: 'scale(1.08) rotate(1deg)', offset: 0.12 },
      { opacity: 1, transform: 'scale(1)', offset: 0.2 },
      { opacity: 1, transform: 'scale(1)', offset: 0.8 },
      { opacity: 0, transform: 'scale(0.85) translateY(-6%)' },
    ], { duration: total, easing: 'ease-out' });
    A.root.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: total });
    A.root.classList.add('vig');
    clearTimeout(this._vigT);
    this._vigT = setTimeout(() => A.root.classList.remove('vig'), total);
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
        L.nick.textContent = LEADER_EMPTY;
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
      if (o.troopsText) { into.troopsText = o.troopsText; into.troops = o.troops; }
      if (o.giftIcon && into.giftName === o.giftName) into.giftIcon = o.giftIcon; else if (into.giftName !== o.giftName) into.giftIcon = '';
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
    // A 100+ coin gift cuts a smaller credit short so it shows right away.
    if (cur && item.tierIndex >= 2 && (cur.tierIndex || 0) < item.tierIndex) cur.until = Math.min(cur.until, this.timeNow);
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
      anim.onfinish = () => { if (!this.crediting) { C.root.style.display = 'none'; this.root.classList.remove('crediting'); } anim.cancel(); };
    }
    if (this.crediting || !this.creditQueue.length) return;
    if (this.timeNow - this.lastCreditEnd < (this.cfg.hud.creditGapSec ?? 0.25)) return;
    const o = this.creditQueue.shift();
    o.shownAt = this.timeNow;
    o.until = this.timeNow + this._creditSec(o) + (o.extraSec || 0);
    this.crediting = o;
    C.root.style.display = '';
    this.root.classList.add('crediting');
    this._renderCredit(o, false);
    C.root.animate([
      { opacity: 0, transform: 'translateX(-50%) scale(0.8)' },
      { opacity: 1, transform: 'translateX(-50%) scale(1.05)', offset: 0.6 },
      { opacity: 1, transform: 'translateX(-50%) scale(1)' },
    ], { duration: 360, easing: 'ease-out' });
  }

  /**
   * A short like credit in the credit strip, only when it is idle (no gift credit showing or
   * queued): "Ahmet ❤ 50 beğeni · +5 asker". Returns true when shown.
   */
  likeCredit(o) {
    if (!this._vis('credit') || this.crediting || this.creditQueue.length) return false;
    if (this.timeNow - this.lastCreditEnd < 1) return false;
    this.credit({
      ...o, coins: 0, giftName: '', count: 0, tierIndex: 0, like: true,
      msg: `ekrana bastı: ${fmt(o.likes)} beğeni`,
      troopsText: `❤ ${fmt(o.likes)} beğeni${o.troops > 0 ? ` · +${fmtShort(o.troops)} asker` : ''}`,
    });
    return true;
  }

  _renderCredit(o, bump) {
    const C = this.cred;
    C.root.className = `credit tier${Math.min(4, o.tierIndex || 0)}${o.like ? ' like' : ''}`;
    C.root.style.setProperty('--c', hexCss(o.colorHex));
    C.av.set(o.avatar, o.nick, o.colorHex);
    setName(C.nick, o.nick, o.badge);
    C.msg.textContent = o.msg || `${o.giftName}${o.count > 1 ? ' ×' + o.count : ''} gönderdi · ${fmt(o.coins)} jeton`;
    C.gift.set(o.giftIcon || '');
    C.troops.textContent = o.troopsText || `+${fmtShort(o.troops)} asker → ${o.team}${o.x2 ? ' (2 KAT!)' : ''}`;
    if (bump) C.troopsBox.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'ease-out' });
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
    // Technical status text (bridge, simulator, errors, audio button) only in debug.
    document.documentElement.classList.toggle('dbg', !!on);
  }
}
