// Halat Çekme HUD: DOM overlay above the three.js scene, in a 1080x1920 design stage
// scaled to the viewport. Contract (see the core): mountHud(rootEl, game, { config,
// manifest, layout }) -> { destroy, setLayout, applySettings, getActionBand }.
// Untrusted strings (names, nicks, gift names) only go through textContent; avatars and
// gift pictures are <img> with fallbacks.
import {
  el, svg, CROWN_SVG, COIN_SVG, clip, nickOf, upperTr, dative, fmt, fmtTime, colorCss,
  makeAvatar, giftImg, anim, cleanText,
} from './util.js';
import { resolveZones, computeRows, place, STAGE_W, STAGE_H } from './layout.js';

const CSS_ID = 'halat-hud-css';
const KIND_EFFECT = { tug: 'kısa asılma', helper: 'yardımcı çekici', strongman: 'pehlivan', tractor: 'traktör', giant: 'dev' };

export const DEFAULT_TEAMS = [
  { id: 1, name: 'Kırmızı', color: '#e8402a', key: '1' },
  { id: 2, name: 'Mavi', color: '#2f7bf0', key: '2' },
];

// Default ladder: the first game's gift names and prices (game/config/game.json
// hud.giftStrip) with this game's effects. Used when the config has no ladder of its own;
// with config.gifts.tiers present the effect words follow the tier each price falls in.
export const DEFAULT_LADDER = [
  { name: 'TikTok', coins: 1, effect: 'kısa asılma' },
  { name: 'Gül', coins: 1, effect: 'kısa asılma', id: 5655 },
  { name: 'Finger Heart', coins: 5, effect: 'yardımcı çekici' },
  { name: 'Dostluk Kolyesi', coins: 10, effect: 'güçlü yardımcı' },
  { name: 'Parfüm', coins: 20, effect: 'güçlü yardımcı' },
  { name: 'Donat', coins: 30, effect: 'usta çekici' },
  { name: 'Şapka ve Bıyık', coins: 99, effect: 'pehlivan' },
  { name: 'Elle Kalp', coins: 100, effect: 'pehlivan' },
  { name: 'Kalpler', coins: 199, effect: 'çifte pehlivan' },
  { name: '', coins: 1000, plus: true, effect: 'traktör', kind: 'tractor' },
  { name: '', coins: 5000, plus: true, effect: 'dev', kind: 'giant' },
];

/** Effect word of the tier a price falls in (core rule: highest tier with min <= coins). */
function effectFor(tiers, coins) {
  if (!Array.isArray(tiers)) return null;
  let best = null;
  for (const t of tiers) if (t && coins >= Number(t.min) && (!best || Number(t.min) > Number(best.min))) best = t;
  if (!best) return null;
  return String(best.label || KIND_EFFECT[best.kind] || '').toLocaleLowerCase('tr');
}

/** Minimum coins of the tier of a kind (the ladder's "1.000+ traktör" tiles follow the table). */
function tierMin(tiers, kind) {
  if (!Array.isArray(tiers)) return null;
  const t = tiers.filter((x) => x && x.kind === kind).sort((a, b) => Number(a.min) - Number(b.min))[0];
  return t ? Number(t.min) : null;
}

// Every on-screen sentence. Descriptive, never a command to viewers (platform rules).
// {k1} {k2}: join keys, {team} {winner} {loser}: team names.
export const DEFAULT_TEXTS = {
  title: 'HALAT ÇEKME',
  joinLine: 'Katılmak için {k1} veya {k2} yaz',
  round: '{n}. TUR',
  lobbyTimer: 'HAZIRLIK',
  endTimer: 'BİTTİ',
  lobbyBanner: 'Yeni tur hazırlanıyor',
  members: '{n} kişi',
  captainEmpty: 'Halat başı henüz yok',
  captainTag: 'halat başı',
  even: 'BERABER',
  leads: '{team} ÖNDE',
  nearPit: '{team} ÇUKURA YAKIN',
  joined: '{team} katıldı',
  joinedMore: '+{n} kişi daha',
  newCaptain: 'halat başı',
  giftDid: '{team} {effect}',
  giftDefaultEffect: 'güç',
  held: 'Hediye, takım seçilince güce dönüşür',
  start: 'BAŞLADI!',
  winPitBanner: '{loser} ÇUKURA DÜŞTÜ!',
  winTimeBanner: 'SÜRE BİTTİ!',
  strongman: 'PEHLİVAN GELDİ!',
  tractor: 'TRAKTÖR GELDİ!',
  giant: 'DEV GELDİ!',
  specialSub: '{team} için çekiyor',
  resultLabel: 'KAZANAN',
  resultDrawLabel: 'TUR BİTTİ',
  resultDraw: 'BERABERE',
  resultDrawHow: 'Halat ortada kaldı',
  resultPit: '{loser} çukura düştü',
  resultTime: 'Süre bitti, halat {winner} tarafında',
  resultCaptain: 'Halat başı',
  resultNoGifts: 'Bu turda hediye yok',
  nextRound: 'Yeni tur birazdan',
  waiting: 'Köprü bekleniyor…',
};

const DEFAULT_TIMING = { creditMs: 3200, creditMinMs: 3000, joinPopMs: 2600, giftPopMs: 1800, ladderPageMs: 4500, perPage: 3 };
const POPS_PER_TEAM = 1; // one slot per side along the band's top edge
const CREDIT_H = 64;
const SPECIAL_MS = { strongman: 3400, tractor: 3800, giant: 4300 };

function tpl(s, vars) {
  return String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const href = new URL('../../css/hud.css', import.meta.url).href;
  // index.html may already link it
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === href)) return;
  const link = document.createElement('link');
  link.id = CSS_ID;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

/** Deep merge for settings patches; arrays of objects merge per index (teams). */
function merge(base, patch) {
  if (!isObj(patch)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (Array.isArray(v) && Array.isArray(base?.[k]) && k === 'teams') {
      out[k] = v.map((t, i) => (isObj(t) ? { ...(base[k][i] || {}), ...t } : t));
    } else if (isObj(v) && isObj(base?.[k])) out[k] = merge(base[k], v);
    else out[k] = v;
  }
  return out;
}

/**
 * Default ladder with effects taken from the core's force tiers when present, and gift
 * pictures (and ids) from the learned gift catalogue when a gift of that name is known.
 */
function defaultLadder(tiers, catalog) {
  const cat = Array.isArray(catalog) ? catalog : [];
  return DEFAULT_LADDER.map((g) => {
    const known = g.name ? cat.find((x) => x && (x.name === g.name || (g.id != null && String(x.id) === String(g.id)))) : null;
    const coins = (g.kind && tierMin(tiers, g.kind)) || g.coins;
    return { ...g, coins, effect: effectFor(tiers, coins) || g.effect, icon: known?.icon || known?.image || '', id: g.id ?? known?.id ?? null };
  });
}

function normalizeLadder(list, manifest) {
  if (!Array.isArray(list) || !list.length) list = DEFAULT_LADDER;
  const icons = manifest?.giftIcons || manifest?.gifts || {};
  return list
    .filter((g) => g && (g.name || g.coins))
    .map((g) => ({
      id: g.id ?? null,
      name: clip(g.name || '', 14),
      coins: Math.max(0, Number(g.coins) || 0),
      effect: clip(g.effect || g.label || '', 18),
      plus: !!g.plus,
      icon: g.icon || g.image || (g.id != null ? (icons[g.id]?.icon || (typeof icons[g.id] === 'string' ? icons[g.id] : '')) : ''),
    }))
    .sort((a, b) => a.coins - b.coins)
    .slice(0, 12);
}

class HalatHud {
  constructor(rootEl, game, opts) {
    this.host = rootEl;
    this.game = game;
    this.manifest = opts.manifest || {};
    this.rawConfig = isObj(opts.config) ? opts.config : {};
    this.layoutOverride = isObj(opts.layout) ? opts.layout : {};
    const q = new URLSearchParams(location.search);
    this.zonesOn = q.get('zones') === '1';
    this.debugOn = q.get('debug') === '1';
    ensureCss();
    this._resolve();

    this.root = el('div', 'hh-root', rootEl);
    // hidden until hud.css applies (measured text fitting needs the real styles)
    this.cssReady = getComputedStyle(this.root).position === 'absolute';
    if (!this.cssReady) this.root.style.visibility = 'hidden';
    this.stage = el('div', 'hh-stage', this.root);
    this._build();
    this._layout();

    this.creditQ = []; this.credit = null;
    this.pops = { 1: [], 2: [] }; this.popQ = { 1: [], 2: [] }; this.popOverflow = { 1: 0, 2: 0 };
    this.annQ = []; this.ann = null;
    this.page = 0; this.pageAt = performance.now();
    this.lastState = null;
    this.phase = null;

    this.handlers = {
      tick: (e) => this.render(e?.state || game.state),
      join: (e) => this.onJoin(e),
      gift: (e) => this.onGift(e),
      heldGift: (e) => this.onHeld(e),
      phase: (e) => this.onPhase(e),
      countdown: (e) => this.onCountdown(e),
      win: (e) => this.onWin(e),
      captain: (e) => this.onCaptain(e),
      special: (e) => this.onSpecial(e),
      // The core has already merged the streamer values into the shared config object.
      settings: () => this.refresh(),
      gifts: () => { this._resolve(); this._renderLadder(true); },
      clear: () => this.render(game?.state, true),
      session: () => this.render(game?.state, true),
    };
    for (const [t, h] of Object.entries(this.handlers)) game?.on?.(t, h);

    this._onResize = () => this._fit();
    window.addEventListener('resize', this._onResize);
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(this._onResize); this.ro.observe(rootEl); }
    this.timer = setInterval(() => this._step(), 100);
    this._fit();
    this.render(game?.state);
    // Fonts arriving late change text widths; refit the big titles once they are in.
    document.fonts?.ready?.then(() => { if (!this.dead) { this._renderLadder(true); this.render(this.game?.state, true); } });
  }

  // ---------- config ----------

  _resolve() {
    // rawConfig is the core's live config object (it updates it in place on settings);
    // overlay holds patches given to applySettings() directly.
    const c = merge(this.rawConfig, this.overlay || {});
    const ct = Array.isArray(c.teams) ? c.teams : [];
    this.teamsCfg = DEFAULT_TEAMS.map((d, i) => ({
      id: d.id,
      name: cleanText(ct[i]?.name || ct[i]?.label) || d.name,
      color: colorCss(ct[i]?.color, d.color),
      key: clip(String(ct[i]?.key ?? ct[i]?.joinKey ?? d.key), 4),
    }));
    this.texts = { ...DEFAULT_TEXTS, ...(isObj(c.hud?.texts) ? c.hud.texts : {}), ...(isObj(c.texts) ? c.texts : {}) };
    this.timing = { ...DEFAULT_TIMING, ...(isObj(c.hud?.timing) ? c.hud.timing : {}) };
    const explicit = c.gifts?.ladder ?? c.ladder ?? c.giftLadder ?? c.hud?.ladder;
    this.ladder = normalizeLadder(Array.isArray(explicit) && explicit.length ? explicit : defaultLadder(c.gifts?.tiers, this.game?.giftCatalog), this.manifest);
    const L = c.layout;
    // The core passes its stage layout object: { safe: { top, bottom, side }, band, … }.
    const lo = this.layoutOverride || {};
    const fromSafe = isObj(lo.safe) ? { top: lo.safe.top, chatTop: lo.safe.bottom, side: lo.safe.side } : null;
    this.zones = resolveZones(L?.zones, c.zones, c.hud?.zones, isObj(L) ? L : null, fromSafe, lo.zones, lo);
  }

  /** Re-reads the (live) config after the core applied streamer settings. */
  refresh() {
    this._resolve();
    this._layout();
    this._renderStatic();
    this._renderLadder(true);
    this.render(this.game?.state, true);
    this._fit(true);
  }

  /** Direct patch: nested ({ teams: [...], hud: { texts } }) or flat dotted keys ('team1.name', 'hud.texts.joinLine'). */
  applySettings(values) {
    if (!isObj(values)) return;
    const patch = {};
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined || v === null) continue;
      const m = /^team([12])\.(\w+)$/.exec(k);
      if (m) { patch.teams = patch.teams || [{}, {}]; patch.teams[m[1] - 1][m[2]] = v; continue; }
      const parts = k.split('.');
      if (parts.some((p) => p === '__proto__' || p === 'constructor' || p === 'prototype')) continue;
      let o = patch;
      for (let i = 0; i < parts.length - 1; i++) { if (!isObj(o[parts[i]])) o[parts[i]] = {}; o = o[parts[i]]; }
      o[parts[parts.length - 1]] = isObj(v) && isObj(o[parts[parts.length - 1]]) ? merge(o[parts[parts.length - 1]], v) : v;
    }
    this.overlay = merge(this.overlay || {}, patch);
    this.refresh();
  }

  setLayout(values) {
    if (!isObj(values)) return;
    this.layoutOverride = { ...this.layoutOverride, ...values };
    this._resolve();
    this._layout();
    this._fit(true);
  }

  /** Team view: live state name/colour first, config next. */
  team(id) {
    const i = id === 2 ? 1 : 0;
    const st = this.lastState?.teams?.find?.((t) => t && t.id === id) || this.lastState?.teams?.[i] || {};
    const cfg = this.teamsCfg[i];
    return {
      ...st,
      id: cfg.id,
      name: clip(st.name || cfg.name, 12),
      color: colorCss(st.color, cfg.color),
      key: cfg.key,
    };
  }

  // ---------- construction ----------

  _build() {
    const S = this.stage;
    const T = this.texts;

    // 0. soft vignette under everything: the eye goes to the rope in the action band
    this.vignette = el('div', 'hh-vignette', S);

    // 1. logo (top zone, decoration)
    this.logo = el('div', 'hh-abs hh-logo', S);
    const li = el('div', 'hh-logo-inner', this.logo);
    this.logoText = el('div', 'hh-logo-text', li, T.title);
    svg(`<svg viewBox="0 0 760 46" aria-hidden="true">
      <defs><pattern id="hhTwist" width="18" height="46" patternUnits="userSpaceOnUse" patternTransform="skewX(-35)">
        <rect width="18" height="46" fill="#e9c27a"/><rect width="7" height="46" fill="#a87632"/></pattern></defs>
      <rect x="40" y="15" width="680" height="16" rx="8" fill="url(#hhTwist)" stroke="#3a1d08" stroke-width="3"/>
      <circle cx="380" cy="23" r="17" fill="#e9c27a" stroke="#3a1d08" stroke-width="3"/>
      <path d="M368 16 Q380 30 392 16 M368 30 Q380 16 392 30" stroke="#a87632" stroke-width="4" fill="none"/>
      <path class="hh-tassel-l" d="M4 8 L40 14 L40 32 L4 38 Z" fill="var(--c1)" stroke="#3a1d08" stroke-width="3"/>
      <path class="hh-tassel-r" d="M756 8 L720 14 L720 32 L756 38 Z" fill="var(--c2)" stroke="#3a1d08" stroke-width="3"/>
    </svg>`, 'hh-logo-rope', li);

    // 2. timer strip
    this.strip = el('div', 'hh-abs hh-wood hh-strip', S);
    this.roundEl = el('div', 'hh-round hh-out', this.strip);
    this.timerEl = el('div', 'hh-timer hh-out', this.strip);
    this.scoreEl = el('div', 'hh-score hh-out', this.strip);
    this.score = [];
    for (const i of [0, 1]) {
      if (i === 1) el('span', 'hh-score-dot', this.scoreEl, '·');
      const name = el('span', 'hh-score-name hh-ell', null);
      const n = el('span', 'hh-score-n', null);
      this.scoreEl.append(name, n);
      this.score.push({ name, n });
    }

    // 3. team panels
    this.teamsBox = el('div', 'hh-abs', S);
    this.panels = [1, 2].map((id) => this._buildTeam(id));

    // 4. rope balance
    // one row: the leader chip rides inside the track, on the half away from the knot
    this.rope = el('div', 'hh-abs hh-rope', S);
    const tr = el('div', 'hh-rope-track', this.rope);
    this.ropeDangerL = el('div', 'hh-rope-danger l', tr);
    this.ropeDangerR = el('div', 'hh-rope-danger r', tr);
    this.ropeFill = el('div', 'hh-rope-fill', tr);
    el('div', 'hh-rope-cord', tr);
    el('div', 'hh-rope-mid', tr);
    el('div', 'hh-rope-pit l', tr);
    el('div', 'hh-rope-pit r', tr);
    this.ropeKnot = el('div', 'hh-rope-knot', tr);
    this.ropeChip = el('div', 'hh-rope-chip', tr);

    // 5. action band (scene shows through) and its anchored overlays
    this.band = el('div', 'hh-abs hh-band', S);
    this.bandFlash = el('div', 'hh-band-flash', this.band);
    // one pop slot per team along the band's top edge: team 1 left, team 2 right
    this.popBox = { 1: el('div', 'hh-pops t1', this.band), 2: el('div', 'hh-pops t2', this.band) };
    this.banner = el('div', 'hh-abs hh-phase-banner hh-hidden', this.band);
    this.cd = el('div', 'hh-abs hh-cd', this.band);

    // 6. gift credit strip: one line at the band's bottom edge
    this.cred = { root: el('div', 'hh-abs hh-credit hh-hidden', this.band) };
    this.cred.av = makeAvatar(this.cred.root);
    this.cred.nick = el('div', 'hh-credit-nick hh-ell', this.cred.root);
    this.cred.msg = el('div', 'hh-credit-msg hh-ell', this.cred.root);
    const cg = el('div', 'hh-credit-gift', this.cred.root);
    this.cred.img = giftImg(cg);
    this.cred.count = el('span', 'hh-credit-count', cg);

    // 7. gift ladder + join line
    this.ladderEl = el('div', 'hh-abs hh-wood hh-ladder', S);
    this.ladderTrack = el('div', 'hh-ladder-track', this.ladderEl);
    this.ladderDots = el('div', 'hh-dots', this.ladderEl);
    this.joinEl = el('div', 'hh-abs hh-join', S);

    // 8. big-gift announcements: band card (strongman/tractor) and full-stage giant
    this.annEl = el('div', 'hh-abs hh-ann hh-hidden', S);
    const card = el('div', 'hh-ann-card', this.annEl);
    el('div', 'hh-ann-shine', card);
    this.annTitle = el('div', 'hh-ann-title', card);
    const who = el('div', 'hh-ann-who', card);
    this.annAv = makeAvatar(who);
    this.annName = el('div', 'hh-ann-name hh-ell', who);
    this.annSub = el('div', 'hh-ann-sub hh-ell', card);

    this.giant = el('div', 'hh-abs hh-giant hh-hidden', S);
    el('div', 'hh-giant-bg', this.giant);
    this.giantIn = el('div', 'hh-giant-in', this.giant);
    this.giantTitle = el('div', 'hh-giant-title', this.giantIn);
    this.giantAv = makeAvatar(this.giantIn);
    this.giantName = el('div', 'hh-giant-name hh-ell', this.giantIn);
    this.giantSub = el('div', 'hh-giant-sub hh-ell', this.giantIn);
    this.giantTeam = el('div', 'hh-giant-team hh-ell', this.giantIn);

    // 9. result screen
    this.res = { root: el('div', 'hh-abs hh-wood hh-result hh-hidden', S) };
    const R = this.res;
    R.label = el('div', 'hh-res-label', R.root);
    R.team = el('div', 'hh-res-team', R.root);
    R.how = el('div', 'hh-res-how hh-ell', R.root);
    R.cap = el('div', 'hh-res-cap', R.root);
    R.capAv = makeAvatar(R.cap);
    svg(CROWN_SVG, 'hh-crown', R.capAv.wrap);
    const capT = el('div', 'hh-res-cap-text', R.cap);
    R.capL = el('div', 'hh-res-cap-l', capT);
    R.capN = el('div', 'hh-res-cap-n hh-ell', capT);
    const cols = el('div', 'hh-res-cols', R.root);
    R.cols = [1, 2].map(() => {
      const col = el('div', 'hh-res-col', cols);
      const h = el('div', 'hh-res-col-h hh-ell', col);
      const rows = [0, 1, 2].map(() => this._buildRow(col));
      const empty = el('div', 'hh-empty', col);
      return { col, h, rows, empty };
    });
    R.score = el('div', 'hh-res-score hh-out', R.root);
    R.scoreParts = [];
    for (const i of [0, 1]) {
      if (i === 1) el('span', 'hh-score-dot', R.score, '·');
      const name = el('span', 'hh-score-name hh-ell', R.score);
      const n = el('span', 'hh-score-n', R.score);
      R.scoreParts.push({ name, n });
    }
    R.next = el('div', 'hh-res-next hh-out', R.root);

    // 10. connection pill (+ debug)
    this.wait = el('div', 'hh-abs hh-wait hh-hidden', S);
    el('i', '', this.wait);
    this.waitText = el('span', '', this.wait);
    if (this.debugOn) this.debugEl = el('div', 'hh-abs hh-debug', S);

    this._renderStatic();
    this._renderLadder(true);
  }

  _buildTeam(id) {
    const p = { root: el('div', `hh-abs hh-wood hh-team t${id}`, this.teamsBox) };
    const head = el('div', 'hh-team-head', p.root);
    p.key = el('div', 'hh-key', head);
    p.name = el('div', 'hh-team-name hh-ell hh-out', head);
    p.count = el('div', 'hh-count hh-out', head);
    const f = el('div', 'hh-force', p.root);
    const track = el('div', 'hh-force-track', f);
    p.fill = el('div', 'hh-force-fill', track);
    p.force = el('div', 'hh-force-val hh-out', f);
    p.crew = el('div', 'hh-crew', p.root);
    // in play only the captain; the round's top contributors appear on the result screen
    p.rows = [this._buildRow(p.crew, true)];
    p.empty = el('div', 'hh-empty', p.crew);
    return p;
  }

  _buildRow(parent, cap = false) {
    const r = { root: el('div', 'hh-row' + (cap ? ' cap' : ''), parent) };
    r.av = makeAvatar(r.root);
    r.crown = svg(CROWN_SVG, 'hh-crown', r.av.wrap);
    r.nick = el('div', 'hh-row-nick hh-ell hh-out', r.root);
    r.coins = el('div', 'hh-row-coins hh-out', r.root);
    return r;
  }

  /** Texts and colours that only change with settings. */
  _renderStatic() {
    const T = this.texts;
    this.logoText.textContent = clip(T.title, 22);
    const t1 = this.team(1); const t2 = this.team(2);
    this.stage.style.setProperty('--c1', t1.color);
    this.stage.style.setProperty('--c2', t2.color);
    // join line: "Katılmak için [1] veya [2] yaz" with the keys as team-coloured badges
    const J = this.joinEl;
    J.replaceChildren();
    const parts = String(T.joinLine).split(/(\{k1\}|\{k2\})/);
    for (const part of parts) {
      if (part === '{k1}' || part === '{k2}') {
        const t = part === '{k1}' ? t1 : t2;
        const k = el('span', 'hh-k', J, t.key);
        k.style.setProperty('--c', t.color);
      } else if (part.trim()) el('span', '', J, cleanText(part));
    }
    this.waitText.textContent = T.waiting;
  }

  _layout() {
    const Z = this.zones;
    const R = computeRows(Z);
    this.rows = R;
    place(this.logo, R.logo);
    place(this.strip, R.strip);
    place(this.teamsBox, R.teams);
    for (const p of this.panels) { p.root.style.top = '0'; p.root.style.height = `${R.teams.h}px`; p.root.style.width = `${(R.teams.w - 18) / 2}px`; }
    place(this.rope, R.rope);
    place(this.band, R.band);
    place(this.ladderEl, R.ladder);
    place(this.joinEl, R.join);
    // pops sit inside the band, within the side insets
    const half = (R.band.w - 2 * Z.side) / 2 - 6;
    Object.assign(this.popBox[1].style, { left: `${Z.side}px`, width: `${half}px` });
    Object.assign(this.popBox[2].style, { right: `${Z.side}px`, width: `${half}px` });
    this.cred.root.style.top = `${R.band.h - CREDIT_H - 8}px`;
    this.cred.root.style.maxWidth = `${R.content.w}px`;
    place(this.annEl, { x: 0, y: R.band.y, w: STAGE_W, h: R.band.h });
    // giant: backdrop over the top of the stage, text above the action band's middle
    const gTop = R.content.y; const gH = Math.max(300, R.band.y + 150 - gTop);
    Object.assign(this.giantIn.style, { top: `${gTop}px`, height: `${gH}px`, left: `${Z.side}px`, right: `${Z.side}px` });
    this.giant.style.setProperty('--gh', `${gTop + gH + 120}px`);
    place(this.res.root, R.content);
    this.wait.style.right = `${Z.side}px`;
    this.wait.style.top = `${Math.max(4, Z.top - 54)}px`;
    if (this.zonesOn) this._buildZones();
  }

  /** ?zones=1: TikTok UI zones over the stage (alignment check). */
  _buildZones() {
    this.zonesEl?.remove();
    const Z = this.zones;
    const box = el('div', 'hh-zones', this.stage);
    this.zonesEl = box;
    const rect = (x, y, w, h, label, cls) => {
      const d = el('div', 'hh-zone ' + cls, box);
      Object.assign(d.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      if (label) el('span', '', d, label);
    };
    rect(0, 0, STAGE_W, Z.top, `TikTok başlık (0–${Z.top})`, 'z-top');
    rect(0, Z.chatTop, Z.chatRight, STAGE_H - Z.bottomBar - Z.chatTop, `TikTok sohbet (y ≥ ${Z.chatTop})`, 'z-chat');
    rect(Z.rightColLeft, Z.rightColTop, STAGE_W - Z.rightColLeft, STAGE_H - Z.bottomBar - Z.rightColTop, 'kalp / hediye', 'z-right');
    rect(0, STAGE_H - Z.bottomBar, STAGE_W, Z.bottomBar, 'yorum / hediye / paylaş', 'z-bottom');
    if (Z.side > 0) {
      rect(0, Z.top, Z.side, STAGE_H - Z.top - Z.bottomBar, '', 'z-side');
      rect(STAGE_W - Z.side, Z.top, Z.side, STAGE_H - Z.top - Z.bottomBar, '', 'z-side');
    }
    rect(Z.side, Z.contentTop, STAGE_W - 2 * Z.side, Z.chatTop - Z.contentTop, '', 'z-content');
  }

  // ---------- fitting the stage to the viewport ----------

  _fit(force = false) {
    if (this.dead) return;
    const r = this.host.getBoundingClientRect();
    const w = r.width || window.innerWidth; const h = r.height || window.innerHeight;
    const u = Math.min(w / STAGE_W, h / STAGE_H);
    const ox = (w - STAGE_W * u) / 2; const oy = (h - STAGE_H * u) / 2;
    this.stage.style.transform = `translate(${ox}px, ${oy}px) scale(${u})`;
    this.fitInfo = { u, ox: r.left + ox, oy: r.top + oy };
    const band = this.getActionBand();
    const key = `${band.x.toFixed(1)},${band.y.toFixed(1)},${band.w.toFixed(1)},${band.h.toFixed(1)}`;
    if (force || key !== this._bandKey) {
      this._bandKey = key;
      window.dispatchEvent(new CustomEvent('halat:layout', {
        detail: { band, stage: { x: this.fitInfo.ox, y: this.fitInfo.oy, w: STAGE_W * u, h: STAGE_H * u, u }, zones: { ...this.zones }, bandDesign: { ...this.rows.band } },
      }));
    }
  }

  /** Action band rectangle in viewport pixels (full stage width). */
  getActionBand() {
    const f = this.fitInfo || { u: 1, ox: 0, oy: 0 };
    const b = this.rows.band;
    return { x: f.ox + b.x * f.u, y: f.oy + b.y * f.u, w: b.w * f.u, h: b.h * f.u, u: f.u };
  }

  // ---------- per-tick render ----------

  render(state, force = false) {
    if (this.dead) return;
    const s = state || this.game?.state;
    if (!s) return;
    if (!this.cssReady) this._checkCss();
    this.lastState = s;
    if (force) { this._k = {}; for (const p of this.panels) p._k = null; }
    this._k = this._k || {};
    const K = this._k;
    const T = this.texts;
    const t1 = this.team(1); const t2 = this.team(2);
    if (K.c !== t1.color + t2.color) { K.c = t1.color + t2.color; this._renderStatic(); }

    // strip
    const round = Math.max(1, Number(s.round) || 1);
    const roundText = tpl(T.round, { n: round });
    if (K.round !== roundText) { K.round = roundText; this.roundEl.textContent = roundText; }
    let timer; let small = false; let urgent = false;
    if (s.phase === 'lobby') { timer = T.lobbyTimer; small = true; }
    else if (s.phase === 'countdown') timer = fmtTime(s.duration ?? 90);
    else if (s.phase === 'play') { timer = fmtTime(s.timeLeft); urgent = Number(s.timeLeft) <= 10; }
    else { timer = T.endTimer; small = true; }
    if (K.timer !== timer) { K.timer = timer; this.timerEl.textContent = timer; }
    this.timerEl.classList.toggle('small', small);
    this.timerEl.classList.toggle('urgent', urgent);
    const sc = `${t1.name}|${t1.sessionWins}|${t2.name}|${t2.sessionWins}|${t1.color}|${t2.color}`;
    if (K.score !== sc) {
      K.score = sc;
      for (const [i, t] of [t1, t2].entries()) {
        for (const parts of [this.score[i], this.res.scoreParts[i]]) {
          parts.name.textContent = t.name;
          parts.name.style.setProperty('--c', `color-mix(in srgb, ${t.color} 55%, #fff)`);
          parts.n.textContent = fmt(t.sessionWins || 0);
        }
      }
    }

    // team panels
    const f1 = Math.max(0, Number(t1.force) || 0); const f2 = Math.max(0, Number(t2.force) || 0);
    const tot = f1 + f2;
    const rope = Math.max(-1, Math.min(1, Number(s.rope) || 0));
    const leader = Math.abs(rope) < 0.03 ? 0 : rope < 0 ? 1 : 2;
    for (const [i, t] of [t1, t2].entries()) this._renderTeam(this.panels[i], t, tot > 0 ? (i ? f2 : f1) / tot : 0, leader === t.id && s.phase === 'play');

    // rope
    this._renderRope(rope, leader, t1, t2, s.phase);

    // band banner
    const banner = s.phase === 'lobby' ? T.lobbyBanner : '';
    if (K.banner !== banner) {
      K.banner = banner;
      this.banner.textContent = banner;
      this.banner.classList.toggle('hh-hidden', !banner);
    }

    // result screen follows the phase
    if (s.phase === 'result') {
      const rk = JSON.stringify([s.round, s.winner, t1.name, t2.name, t1.sessionWins, t2.sessionWins, t1.captain?.id, t2.captain?.id, (t1.top || []).map((x) => x?.id + ':' + x?.coins), (t2.top || []).map((x) => x?.id + ':' + x?.coins), t1.captain?.coins, t2.captain?.coins]);
      if (K.res !== rk) { K.res = rk; this._renderResult(s, t1, t2); }
      this._showResult(true);
    } else { K.res = null; this._showResult(false); }

    // connection
    const down = s.connected === false && s.mode !== 'demo';
    this.wait.classList.toggle('hh-hidden', !down);
    if (this.debugEl) this.debugEl.textContent = `mode ${s.mode} · ${s.connected ? 'bağlı' : 'bağlı değil'}\nfaz ${s.phase} · tur ${s.round}\nhalat ${rope.toFixed(2)} · güç ${f1.toFixed(0)}/${f2.toFixed(0)}`;
    this.phase = s.phase;
  }

  _renderTeam(p, t, share, lead) {
    const T = this.texts;
    const key = JSON.stringify([t.name, t.key, t.color, t.members, t.captain?.id, t.captain?.nick, t.captain?.name, t.captain?.avatar, t.captain?.coins, (t.top || []).slice(0, 4).map((x) => [x?.id, x?.nick, x?.name, x?.avatar, x?.coins])]);
    p.root.style.setProperty('--c', t.color);
    p.root.classList.toggle('lead', !!lead);
    p.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, share)).toFixed(3)})`;
    const fv = fmt(t.force || 0);
    if (p.force.textContent !== fv) p.force.textContent = fv;
    if (p._k === key) return;
    p._k = key;
    p.key.textContent = t.key;
    p.name.textContent = upperTr(t.name);
    p.count.textContent = tpl(T.members, { n: fmt(t.members || 0) });
    // crew: the captain (crowned) then the round's top contributors, three rows in all
    const list = [];
    if (t.captain) list.push({ ...t.captain, cap: true });
    for (const x of Array.isArray(t.top) ? t.top : []) {
      if (!x || list.length >= 3) continue;
      if (t.captain && x.id != null && x.id === t.captain.id) continue;
      list.push(x);
    }
    this._fillRows(p.rows, list, t.color, true);
    p.empty.textContent = T.captainEmpty;
    p.empty.classList.toggle('hh-hidden', list.length > 0);
  }

  _fillRows(rows, list, color, crownFirst) {
    rows.forEach((r, i) => {
      const x = list[i];
      r.root.classList.toggle('hh-hidden', !x);
      if (!x) return;
      const cap = !!(crownFirst && x.cap);
      r.root.classList.toggle('cap', cap);
      const nick = nickOf(x, cap ? 14 : 16);
      r.av.set(x.avatar, nick, color);
      r.nick.textContent = nick;
      r.coins.textContent = fmt(x.coins || 0);
      r.crown.style.display = cap ? '' : 'none';
    });
  }

  _renderRope(rope, leader, t1, t2, phase) {
    const T = this.texts;
    const pct = 50 + rope * 50;
    // knot within the pit lines (22 units each side of a ~950-unit track)
    this.ropeKnot.style.left = `calc(22px + (100% - 44px) * ${(pct / 100).toFixed(4)})`;
    const lead = leader === 1 ? t1 : leader === 2 ? t2 : null;
    const color = lead ? lead.color : '#6b5a45';
    this.ropeKnot.style.setProperty('--c', lead ? lead.color : '#fff');
    this.ropeFill.style.setProperty('--c', color);
    const a = Math.min(50, pct); const b = Math.max(50, pct);
    this.ropeFill.style.left = `${a}%`;
    this.ropeFill.style.width = `${b - a}%`;
    const danger = Math.abs(rope) > 0.7;
    this.ropeDangerL.classList.toggle('hot', danger && rope < 0);
    this.ropeDangerR.classList.toggle('hot', danger && rope > 0);
    let text;
    if (!lead) text = T.even;
    else {
      const loser = leader === 1 ? t2 : t1;
      // near the pit the chip names the side about to fall (the arrow still points at the leader)
      text = danger && phase === 'play' ? tpl(T.nearPit, { team: upperTr(loser.name) }) : tpl(T.leads, { team: upperTr(lead.name) });
      text = leader === 1 ? '◀ ' + text : text + ' ▶';
    }
    if (this.ropeChip.textContent !== text) this.ropeChip.textContent = text;
    this.ropeChip.style.setProperty('--c', color);
    // chip centred on the half of the track away from the knot
    this.ropeChip.style.left = rope < -0.02 ? '75%' : '25%';
    this.ropeChip.classList.toggle('hot', danger && phase === 'play');
  }

  _renderResult(s, t1, t2) {
    const T = this.texts; const R = this.res;
    const w = s.winner && (s.winner.teamId === 1 || s.winner.teamId === 2) ? s.winner : null;
    const win = w ? (w.teamId === 1 ? t1 : t2) : null;
    const lose = w ? (w.teamId === 1 ? t2 : t1) : null;
    R.root.style.setProperty('--c', win ? win.color : '#8a7a66');
    R.label.textContent = win ? T.resultLabel : T.resultDrawLabel;
    R.team.textContent = win ? upperTr(win.name) : T.resultDraw;
    R.how.textContent = !win ? T.resultDrawHow
      : w.by === 'pit' ? tpl(T.resultPit, { loser: lose.name, winner: win.name })
        : tpl(T.resultTime, { winner: win.name, loser: lose.name });
    const cap = win?.captain || null;
    R.cap.classList.toggle('hh-hidden', !cap);
    if (cap) {
      const n = nickOf(cap, 16);
      R.capAv.set(cap.avatar, n, win.color);
      R.capL.textContent = `${T.resultCaptain} · ${fmt(cap.coins || 0)}`;
      R.capN.textContent = n;
    }
    for (const [i, t] of [t1, t2].entries()) {
      const C = R.cols[i];
      C.col.style.setProperty('--c', t.color);
      C.h.textContent = upperTr(t.name);
      const list = [];
      const seen = new Set();
      for (const x of [t.captain, ...(Array.isArray(t.top) ? t.top : [])]) {
        if (!x || list.length >= 3) continue;
        const k = x.id ?? x.nick;
        if (seen.has(k)) continue;
        seen.add(k); list.push(x);
      }
      this._fillRows(C.rows, list, t.color, false);
      C.empty.textContent = T.resultNoGifts;
      C.empty.classList.toggle('hh-hidden', list.length > 0);
    }
    R.next.textContent = T.nextRound;
    // titles that must fit the panel
    requestAnimationFrame(() => { fitText(R.team, 128, 60); fitText(R.how, 42, 34); });
  }

  _showResult(on) {
    const R = this.res.root;
    if (on === this._resOn) return;
    this._resOn = on;
    if (on) {
      R.classList.remove('hh-hidden');
      anim(R, [{ opacity: 0, transform: 'scale(0.85)' }, { opacity: 1, transform: 'scale(1.03)', offset: 0.7 }, { opacity: 1, transform: 'scale(1)' }], { duration: 550, easing: 'ease-out', fill: 'forwards' });
      fitText(this.res.team, 128, 60);
    } else {
      const a = anim(R, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
      const done = () => { if (!this._resOn) R.classList.add('hh-hidden'); };
      if (a) a.onfinish = done;
      setTimeout(done, 350);
    }
  }

  // ---------- gift ladder ----------

  _renderLadder(rebuild = false) {
    const per = Math.max(1, this.timing.perPage | 0);
    const pages = Math.max(1, Math.ceil(this.ladder.length / per));
    if (this.page >= pages) this.page = 0;
    const key = `${this.page}|${pages}|${JSON.stringify(this.ladder)}`;
    if (!rebuild && key === this._ladderKey) return;
    this._ladderKey = key;
    this.ladderTrack.replaceChildren();
    this.tiles = [];
    const items = this.ladder.slice(this.page * per, this.page * per + per);
    for (const g of items) {
      const rank = g.coins >= 1000 ? 'r3' : g.coins >= 100 ? 'r2' : 'r1';
      const t = el('div', 'hh-tier ' + rank, this.ladderTrack);
      // two lines: [picture] name + price (the name gives way first) / effect;
      // a nameless tile reads "1.000+ jeton"
      const head = el('div', 'hh-tier-head', t);
      if (g.icon) giftImg(head).set(g.icon);
      if (g.name) el('div', 'hh-tier-name hh-ell', head, g.name);
      const c = el('div', 'hh-tier-coins hh-out', head);
      svg(COIN_SVG, 'hh-coin', c);
      c.append(document.createTextNode(fmt(g.coins) + (g.plus ? '+' : '') + (g.name ? '' : ' jeton')));
      if (g.effect) el('div', 'hh-tier-eff hh-ell', t, g.effect);
      this.tiles.push({ g, t });
    }
    // keep the tile width stable on a short last page
    for (let i = items.length; i < per && pages > 1; i++) el('div', 'hh-tier', this.ladderTrack).style.visibility = 'hidden';
    this.ladderDots.replaceChildren();
    this.ladderDots.classList.toggle('hh-hidden', pages < 2);
    for (let i = 0; i < pages; i++) el('i', i === this.page ? 'on' : '', this.ladderDots);
  }

  _hotTile(ev) {
    if (!this.tiles) return;
    const per = Number(ev.coins) || 0; // price of one gift
    let best = null;
    for (const x of this.tiles) {
      if ((ev.giftId != null && x.g.id != null && String(x.g.id) === String(ev.giftId)) || (x.g.name && x.g.name === ev.giftName)) { best = x; break; }
    }
    if (!best) for (const x of this.tiles) if (x.g.coins <= per && (!best || x.g.coins > best.g.coins)) best = x;
    if (!best) return;
    best.t.classList.add('hot');
    clearTimeout(best._t);
    best._t = setTimeout(() => best.t.classList.remove('hot'), 1400);
  }

  // ---------- events ----------

  onJoin(e) {
    if (!e?.player) return;
    const id = e.teamId === 2 ? 2 : 1;
    this._queuePop(id, { kind: 'join', player: e.player });
  }

  onCaptain(e) {
    if (!e?.player) return;
    const id = e.teamId === 2 ? 2 : 1;
    this._queuePop(id, { kind: 'cap', player: e.player, front: true });
  }

  _queuePop(id, item) {
    const vis = this.pops[id];
    if (vis.length < POPS_PER_TEAM) this._showPop(id, item);
    else if (item.front) this.popQ[id].unshift(item);
    else if (this.popQ[id].length < 6) this.popQ[id].push(item);
    else this.popOverflow[id]++;
  }

  _showPop(id, item) {
    const T = this.texts;
    const t = this.team(id);
    const box = this.popBox[id];
    const node = el('div', `hh-pop t${id} ${item.kind}`);
    node.style.setProperty('--c', t.color);
    if (item.kind === 'more') {
      const txt = el('div', 'hh-pop-text', node);
      el('span', '', txt, tpl(T.joinedMore, { n: fmt(item.n) }) + ' ');
      el('span', 'hh-pop-team', txt, tpl(T.joined, { team: dative(t.name) }));
    } else if (item.kind === 'gift') {
      const gi = giftImg(node); gi.set(item.icon);
      if (!item.icon) svg(COIN_SVG, 'hh-gift-img', node);
      el('div', 'hh-pop-text', node, `${clip(item.giftName || 'Hediye', 12)}${item.count > 1 ? ' ×' + fmt(item.count) : ''}`);
    } else {
      const nick = nickOf(item.player, 16);
      const av = makeAvatar(node); av.set(item.player.avatar, nick, t.color);
      if (item.kind === 'cap') svg(CROWN_SVG, 'hh-gift-img', node);
      // the name gives way first: the team part never truncates
      const txt = el('div', 'hh-pop-text', node);
      el('span', 'hh-pop-nick', txt, nick);
      el('span', 'hh-pop-team', txt, item.kind === 'cap' ? T.newCaptain : tpl(T.joined, { team: dative(t.name) }));
    }
    box.append(node);
    const ms = item.kind === 'gift' ? this.timing.giftPopMs : this.timing.joinPopMs;
    const entry = { node, until: performance.now() + ms };
    this.pops[id].push(entry);
    anim(node, [{ opacity: 0, transform: `translateX(${id === 1 ? -40 : 40}px)` }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  }

  onGift(e) {
    if (!e?.player) return;
    const id = e.teamId === 2 ? 2 : 1;
    this._hotTile(e);
    const busy = !!this.credit;
    // core semantics: coins = price of one gift, total = coins x count
    const count = Math.max(1, Number(e.count) || 1);
    const total = Number(e.total) || (Number(e.coins) || 0) * count;
    this._pushCredit({
      key: `${e.player.id ?? nickOf(e.player)}|${e.giftId ?? e.giftName}|g`,
      player: e.player, teamId: id, giftName: e.giftName, icon: e.icon,
      count, coins: total,
      effect: String(e.tier?.label || KIND_EFFECT.tug).toLocaleLowerCase('tr'), big: (Number(e.coins) || 0) >= 99,
    });
    // a small acknowledgement on the team's side while the credit strip is busy
    void busy; // gifts are acknowledged by the credit strip only (the band stays clear)
  }

  onHeld(e) {
    if (!e?.player) return;
    this._pushCredit({ key: `${e.player.id ?? nickOf(e.player)}|held`, player: e.player, teamId: 0, held: true, count: 1, coins: Number(e.coins) || 0, giftName: e.giftName, icon: e.icon });
  }

  _pushCredit(item) {
    const now = performance.now();
    const C = this.credit;
    if (C && C.key === item.key) {
      C.count += item.count; C.coins += item.coins;
      C.until = Math.max(C.until, now + 2000);
      this._paintCredit(C, true);
      return;
    }
    const q = this.creditQ.find((x) => x.key === item.key);
    if (q) { q.count += item.count; q.coins += item.coins; return; }
    this.creditQ.push(item);
    if (this.creditQ.length > 8) {
      // drop the smallest non-big item to keep the wait bounded
      let mi = -1;
      for (let i = 0; i < this.creditQ.length; i++) if (!this.creditQ[i].big && (mi < 0 || this.creditQ[i].coins < this.creditQ[mi].coins)) mi = i;
      this.creditQ.splice(mi < 0 ? 0 : mi, 1);
    }
    if (!C) this._nextCredit();
  }

  _nextCredit() {
    const item = this.creditQ.shift();
    this.credit = item || null;
    const R = this.cred.root;
    if (!item) {
      const a = anim(R, [{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
      const done = () => { if (!this.credit) R.classList.add('hh-hidden'); };
      if (a) a.onfinish = done;
      setTimeout(done, 320); // also when animations are paused (hidden page)
      return;
    }
    // shorter turns when a queue builds up, never under the readable minimum
    const ms = this.creditQ.length > 1 ? this.timing.creditMinMs : this.timing.creditMs;
    item.until = performance.now() + Math.max(this.timing.creditMinMs, ms);
    this._paintCredit(item, false);
    R.classList.remove('hh-hidden');
    anim(R, [{ opacity: 0, transform: 'translateX(-50%) translateY(30px) scale(0.9)' }, { opacity: 1, transform: 'translateX(-50%) scale(1.04)', offset: 0.6 }, { opacity: 1, transform: 'translateX(-50%) scale(1)' }], { duration: 320, easing: 'ease-out', fill: 'forwards' });
  }

  _paintCredit(c, bump) {
    const T = this.texts;
    const R = this.cred;
    const t = c.held ? null : this.team(c.teamId);
    R.root.classList.toggle('held', !!c.held);
    R.root.classList.toggle('big', !!c.big);
    if (t) R.root.style.setProperty('--c', t.color); else R.root.style.removeProperty('--c');
    const nick = nickOf(c.player, 14);
    R.av.set(c.player.avatar, nick, t ? t.color : '#8a7a66');
    R.nick.textContent = nick;
    R.msg.replaceChildren();
    if (c.held) R.msg.textContent = '· ' + T.held;
    else {
      el('span', '', R.msg, '· ' + clip(c.giftName || 'Hediye', 14) + ' · ');
      const did = tpl(T.giftDid, { team: '\u0000', effect: c.effect || T.giftDefaultEffect });
      const [pre, post] = did.split('\u0000');
      if (pre) el('span', '', R.msg, pre);
      el('b', '', R.msg, dative(t.name));
      if (post !== undefined) el('span', '', R.msg, post);
    }
    R.img.set(c.icon);
    R.count.textContent = c.count > 1 ? '×' + fmt(c.count) : '';
    if (bump) anim(R.count, [{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'ease-out' });
  }

  onPhase(e) {
    const ph = e?.phase;
    if (ph === 'play' && this.phase === 'countdown') { /* countdown {n:0} shows BAŞLADI */ }
    if (ph === 'lobby' || ph === 'countdown') this._clearTransient();
    if (ph) this.render({ ...(this.game?.state || {}), phase: ph, round: e.round ?? this.game?.state?.round });
  }

  _clearTransient() {
    for (const id of [1, 2]) { this.popQ[id].length = 0; this.popOverflow[id] = 0; }
  }

  onCountdown(e) {
    const n = Number(e?.n);
    const word = !(n > 0);
    this.cd.textContent = word ? this.texts.start : String(n);
    this.cd.classList.toggle('word', word);
    fitText(this.cd, word ? 150 : 260, 80);
    anim(this.cd, [
      { opacity: 0, transform: 'translateY(-50%) scale(2.2)' },
      { opacity: 1, transform: 'translateY(-50%) scale(0.95)', offset: 0.18 },
      { opacity: 1, transform: 'translateY(-50%) scale(1)', offset: 0.7 },
      { opacity: 0, transform: 'translateY(-50%) scale(0.8)' },
    ], { duration: word ? 1200 : 950, easing: 'ease-out', fill: 'forwards' });
    if (word) this._flash(0.5);
  }

  onWin(e) {
    const id = e?.teamId === 2 ? 2 : e?.teamId === 1 ? 1 : 0;
    const win = id ? this.team(id) : null;
    const lose = id ? this.team(id === 1 ? 2 : 1) : null;
    const title = e?.by === 'pit' && lose ? tpl(this.texts.winPitBanner, { loser: upperTr(lose.name) }) : this.texts.winTimeBanner;
    this.annQ.unshift({ kind: 'win', title, color: win ? win.color : '#8a7a66' });
    if (this.ann && this.ann.kind !== 'giant') this.ann.until = 0; // the result comes first
    this._flash(0.7);
  }

  onSpecial(e) {
    const kind = ['strongman', 'tractor', 'giant'].includes(e?.kind) ? e.kind : null;
    if (!kind || !e.player) return;
    if (this.annQ.length > 6) this.annQ.splice(this.annQ.findIndex((x) => x.kind === 'strongman') >>> 0, 1);
    this.annQ.push({ kind, player: e.player, teamId: e.teamId === 2 ? 2 : 1 });
  }

  _showAnn(a) {
    const T = this.texts;
    const now = performance.now();
    if (a.kind === 'giant') {
      const t = this.team(a.teamId);
      const nick = nickOf(a.player, 16);
      this.giant.style.setProperty('--c', t.color);
      this.giantTitle.textContent = T.giant;
      this.giantAv.set(a.player.avatar, nick, t.color);
      this.giantName.textContent = nick;
      this.giantSub.textContent = tpl(T.specialSub, { team: t.name });
      this.giantTeam.textContent = upperTr(t.name);
      this.giant.classList.remove('hh-hidden');
      fitText(this.giantTitle, 170, 90);
      a.until = now + SPECIAL_MS.giant;
      a.anim = anim(this.giant, [
        { opacity: 0, transform: 'scale(1.3)' }, { opacity: 1, transform: 'scale(1)', offset: 0.08 },
        { opacity: 1, transform: 'scale(1)', offset: 0.9 }, { opacity: 0, transform: 'scale(1.05)' },
      ], { duration: SPECIAL_MS.giant, easing: 'ease-out', fill: 'forwards' });
      anim(this.giantTitle, [{ transform: 'scale(0.3) rotate(-6deg)' }, { transform: 'scale(1.1) rotate(2deg)', offset: 0.5 }, { transform: 'scale(1) rotate(0)' }], { duration: 700, easing: 'ease-out' });
      this._flash(1);
      return;
    }
    const A = this.annEl;
    A.className = 'hh-abs hh-ann ' + a.kind;
    if (a.kind === 'win') {
      A.style.setProperty('--c', a.color);
      this.annTitle.textContent = a.title;
      this.annAv.wrap.parentElement.classList.add('hh-hidden');
      this.annSub.classList.add('hh-hidden');
      a.until = now + 2400;
    } else {
      const t = this.team(a.teamId);
      const nick = nickOf(a.player, 16);
      A.style.setProperty('--c', t.color);
      this.annTitle.textContent = T[a.kind];
      this.annAv.wrap.parentElement.classList.remove('hh-hidden');
      this.annSub.classList.remove('hh-hidden');
      this.annAv.set(a.player.avatar, nick, t.color);
      this.annName.textContent = nick;
      this.annSub.textContent = tpl(T.specialSub, { team: t.name });
      a.until = now + SPECIAL_MS[a.kind];
    }
    fitText(this.annTitle, a.kind === 'tractor' ? 80 : a.kind === 'strongman' ? 72 : 76, 46);
    const dur = a.until - now;
    a.anim = anim(A, [
      { opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.1 },
      { opacity: 1, transform: 'scale(1)', offset: 0.16 }, { opacity: 1, transform: 'scale(1)', offset: 0.88 },
      { opacity: 0, transform: 'scale(0.9)' },
    ], { duration: dur, easing: 'ease-out', fill: 'forwards' });
    if (a.kind === 'tractor') {
      anim(this.annEl.firstElementChild, [{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(0)' }], { duration: 160, iterations: 6, delay: 300 });
      this._flash(0.6);
    }
  }

  _hideAnn(a) {
    a.anim?.cancel?.();
    if (a.kind === 'giant') { this.giant.classList.add('hh-hidden'); this.giant.style.opacity = '0'; }
    else { this.annEl.classList.add('hh-hidden'); this.annEl.style.opacity = '0'; }
  }

  _flash(strength) {
    anim(this.bandFlash, [{ opacity: 0.55 * strength }, { opacity: 0 }], { duration: 500, easing: 'ease-out' });
  }

  _checkCss() {
    if (this.cssReady || this._cssChecking) return;
    if (getComputedStyle(this.root).position !== 'absolute') return;
    this.cssReady = true;
    this.root.style.visibility = '';
    this._cssChecking = true;
    try { this.refresh(); } finally { this._cssChecking = false; }
  }

  // ---------- queues (10 Hz) ----------

  _step() {
    if (this.dead) return;
    const now = performance.now();
    this._checkCss();
    // pops
    for (const id of [1, 2]) {
      const vis = this.pops[id];
      // fade during the last 250 ms, then leave the stack at once (no ghost pushing the others)
      for (let i = vis.length - 1; i >= 0; i--) {
        const p = vis[i];
        if (now >= p.until) { vis.splice(i, 1); p.node.remove(); }
        else if (!p.fading && now >= p.until - 250) {
          p.fading = true;
          anim(p.node, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-10px)' }], { duration: 240, fill: 'forwards' });
        }
      }
      while (vis.length < POPS_PER_TEAM && (this.popQ[id].length || this.popOverflow[id])) {
        if (this.popQ[id].length) this._showPop(id, this.popQ[id].shift());
        else { this._showPop(id, { kind: 'more', n: this.popOverflow[id] }); this.popOverflow[id] = 0; }
      }
    }
    // an announcement owns the band: pops and the credit strip step aside, and the
    // credit's reading time is paused so it still gets its full turn afterwards
    // (a strongman/win card sits in the upper band and leaves the credit strip visible)
    const annOn = !!this.ann;
    const annBig = annOn && this.ann.kind !== 'strongman' && this.ann.kind !== 'win';
    this.band.classList.toggle('ann-on', annOn);
    this.band.classList.toggle('ann-big', annBig);
    if (annBig && this.credit) this.credit.until += now - (this._lastStep || now);
    this._lastStep = now;
    // credit strip
    if (this.credit && now >= this.credit.until) this._nextCredit();
    // announcements
    if (this.ann && now >= this.ann.until) { this._hideAnn(this.ann); this.ann = null; }
    if (!this.ann && this.annQ.length) {
      this.ann = this.annQ.shift();
      if (this.ann.kind !== 'giant') this.annEl.classList.remove('hh-hidden');
      this._showAnn(this.ann);
    }
    // ladder pages
    const per = Math.max(1, this.timing.perPage | 0);
    const pages = Math.ceil(this.ladder.length / per);
    if (pages > 1 && now - this.pageAt > this.timing.ladderPageMs) {
      this.pageAt = now;
      this.page = (this.page + 1) % pages;
      this._renderLadder();
      anim(this.ladderTrack, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' });
    }
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    for (const [t, h] of Object.entries(this.handlers)) this.game?.off?.(t, h);
    clearInterval(this.timer);
    window.removeEventListener('resize', this._onResize);
    this.ro?.disconnect();
    this.root.remove();
  }
}

/** Shrinks a single-line title's font until it fits its box (design units). */
function fitText(node, max, min) {
  if (!node) return;
  node.style.fontSize = `${max}px`;
  const box = node.parentElement;
  if (!box) return;
  const cs = getComputedStyle(box);
  const inner = box.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  const limit = Math.min(node.clientWidth || Infinity, inner > 0 ? inner : Infinity);
  let size = max;
  let guard = 0;
  while (node.scrollWidth > limit + 1 && size > min && guard++ < 40) {
    size = Math.max(min, Math.floor(size * 0.92));
    node.style.fontSize = `${size}px`;
  }
}

export function mountHud(rootEl, game, { config, manifest, layout } = {}) {
  const hud = new HalatHud(rootEl, game, { config, manifest, layout });
  return {
    destroy: () => hud.destroy(),
    setLayout: (v) => hud.setLayout(v),
    applySettings: (v) => hud.applySettings(v),
    getActionBand: () => hud.getActionBand(),
    /** Optional hooks the core calls: resize(layout) after its own layout pass, update(now) per frame. */
    resize: (layout) => { if (isObj(layout)) hud.layoutOverride = layout; hud._resolve(); hud._layout(); hud._fit(); },
    update: () => {},
    /** Design-unit rectangles of every block (debugging, scene alignment). */
    getRows: () => JSON.parse(JSON.stringify(hud.rows)),
  };
}
