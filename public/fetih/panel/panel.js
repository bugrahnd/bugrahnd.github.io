// Control panel: one page for every game. Talks to the bridge via /api/* and listens to /ws.
//   Yayın (left, always visible): connection, the game on stream, open pages, simulator,
//     test events (adapted to the active game's simulator profile), gift list, live log.
//   Oyunlar (right, top): one card per registered game; "Bu oyunu yayına al" switches the stream.
//   Ayarlar (right, below): "Yayın ayarları" (stream-wide, generated form) and "<Oyun> ayarları" (the game's
//     own panel module from its oyun.json, or a form generated from its schema).
import { mountSchemaForm } from './schema-form.js';

const $ = (id) => document.getElementById(id);
const LOG_MAX = 100;

let lastState = null;
let status = null;
let games = []; // public game list from GET /api/games
let activeId = null;
let selectedId = null; // game whose settings are shown
let streamUi = null;
let gameUi = null;
let giftCatalog = null;

// ---------------------------------------------------------------- bridge address
// The panel runs either from the bridge itself (same origin) or as a static copy on another
// site (e.g. https://bugrahnd.com.tr/fetih/panel/). In the latter case it talks to the bridge
// on this computer. Only loopback addresses are accepted, so the panel never sends data elsewhere.
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const DEFAULT_BRIDGE = 'http://127.0.0.1:3000';
// Public DNS names that resolve to 127.0.0.1 (bridge ALLOWED_HOSTS defaults): the page is then served
// by the bridge itself, so use the same origin.
const LOOPBACK_NAMES = /^(([a-z0-9-]+\.)?localtest\.me|([a-z0-9-]+\.)?lvh\.me|local\.bugrahnd\.com\.tr)$/i;
const SERVED_BY_BRIDGE = (LOOPBACK.has(location.hostname) || LOOPBACK_NAMES.test(location.hostname)) && location.protocol === 'http:';

function resolveBridge() {
  const q = new URLSearchParams(location.search).get('bridge');
  if (q) {
    try {
      const u = new URL(q);
      if ((u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK.has(u.hostname)) return u.origin;
    } catch { /* fall through */ }
    console.warn('Geçersiz ?bridge= değeri (yalnızca 127.0.0.1 / localhost kabul edilir):', q);
  }
  if (SERVED_BY_BRIDGE) return location.origin;
  return DEFAULT_BRIDGE;
}
const BRIDGE = resolveBridge();
// ?c=panel: the bridge counts game pages and panels separately.
const WS_URL = BRIDGE.replace(/^http/, 'ws') + '/ws?c=panel';

// The stream URL for LIVE Studio / OBS: the site root next to this panel.
{
  const root = new URL('../', location.href);
  const bridgeQ = new URLSearchParams(location.search).get('bridge');
  let url = root.href;
  if (!SERVED_BY_BRIDGE) url += bridgeQ && BRIDGE !== DEFAULT_BRIDGE ? `?yayin=1&bridge=${encodeURIComponent(BRIDGE)}` : '?yayin=1';
  $('stream-url').textContent = url;
}

// ---------------------------------------------------------------- api
class BridgeDownError extends Error {}

let bridgeDown = false;
function setBridgeDown(down, detail) {
  bridgeDown = down;
  const el = $('bridge-down');
  if (!down) { el.hidden = true; return; }
  el.hidden = false;
  $('bridge-down-addr').textContent = BRIDGE;
  $('bridge-down-detail').textContent = detail || '';
}

async function api(path, body) {
  const opts = body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
  let res;
  try {
    res = await fetch(`${BRIDGE}/api/${path}`, opts);
  } catch {
    // Network failure: bridge not running, wrong port, or blocked by the browser.
    setBridgeDown(true);
    throw new BridgeDownError('Köprü sunucusuna ulaşılamıyor.');
  }
  let data;
  try {
    data = await res.json();
  } catch {
    setBridgeDown(true, `Beklenmeyen yanıt (HTTP ${res.status}). Adres doğru mu?`);
    throw new BridgeDownError('Beklenmeyen yanıt.');
  }
  if (res.status === 403 && /Origin/i.test(data.error || '')) {
    setBridgeDown(true, `Köprü bu sayfanın adresini (${location.origin}) kabul etmiyor. ALLOWED_ORIGINS ayarına ekleyin.`);
    throw new BridgeDownError(data.error);
  }
  if (bridgeDown) setBridgeDown(false);
  if (!data.ok) {
    flash(data.error || 'İstek başarısız.');
    throw new Error(data.error || 'İstek başarısız.');
  }
  if (data.status) applyState(data);
  return data;
}

let flashTimer;
function flash(msg) {
  const el = $('st-error');
  el.textContent = msg;
  el.hidden = false;
  el.dataset.flash = '1';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.dataset.flash = ''; renderStatus(); }, 4000);
}

// ---------------------------------------------------------------- state
function applyState(s) {
  lastState = s;
  status = s.status;
  const sel = $('sim-preset');
  if (!sel.options.length) {
    for (const [key, p] of Object.entries(s.sim.presets)) {
      sel.add(new Option(`${p.label} (~${p.viewers} izleyici)`, key));
    }
  }
  if (document.activeElement !== sel) sel.value = s.sim.preset;
  $('sim-info').textContent = s.sim.running ? `Çalışıyor · ${s.sim.viewers} sanal izleyici` : 'Duraklatıldı';
  $('sim-start').disabled = s.sim.running && s.status.mode === 'sim';
  $('sim-pause').disabled = !s.sim.running;
  const userInput = $('live-user');
  if (s.live.username && !userInput.value && document.activeElement !== userInput) userInput.value = s.live.username;
  $('live-hint').textContent = s.live.signApiKey
    ? 'İmza sunucusu API anahtarı yüklü. Bağlanınca simülatör durur.'
    : 'Bağlanınca simülatör durur. Bağlantı kesilince simülatör moduna dönülür.';
  renderStatus();
  renderPages(s.pages);
  if (s.active !== undefined && s.active !== activeId) loadGames();
  streamUi?.onState(s);
  gameUi?.onState(s);
}

function renderStatus() {
  if (!status) return;
  const live = status.mode === 'live';
  const mode = $('st-mode');
  mode.textContent = live ? 'Canlı' : 'Simülatör';
  mode.className = live ? 'live' : '';
  const dot = $('st-dot');
  let text;
  if (live) {
    if (status.connected) { text = `@${status.username} yayınına bağlı`; dot.className = 'dot ok'; }
    else if (status.error) { text = `@${status.username} bağlanamadı`; dot.className = 'dot bad'; }
    else { text = `@${status.username} bağlanılıyor…`; dot.className = 'dot wait'; }
  } else {
    text = status.connected ? 'Simülatör çalışıyor' : 'Simülatör duraklatıldı';
    dot.className = status.connected ? 'dot ok' : 'dot';
  }
  $('st-text').textContent = text;
  $('st-viewers').textContent = status.viewers != null ? `· ${status.viewers.toLocaleString('tr-TR')} izleyici` : '';
  const err = $('st-error');
  if (err.dataset.flash === '1') return;
  err.textContent = status.error || '';
  err.hidden = !status.error;
}

/** "Yayın sayfası: 1 · oyun sayfası: 1" (connected pages). */
function renderPages(p) {
  const e = $('onair-pages');
  if (!p) { e.textContent = ''; return; }
  const player = p.player || 0;
  const onAir = activeId ? p.games?.[activeId] || 0 : 0;
  const parts = [`Yayın sayfası: ${player}`, `yayındaki oyunun sayfası: ${onAir}`];
  if (p.game > onAir) parts.push(`diğer oyun sayfası: ${p.game - onAir}`);
  e.textContent = parts.join(' · ');
  e.className = 'set-pages ' + (player || onAir ? 'ok' : 'warn');
  if (!player && !onAir) e.textContent += ' — LIVE Studio / OBS kaynağı açık değil ya da köprüye bağlanamıyor.';
}

// ---------------------------------------------------------------- games
const gameById = (id) => games.find((g) => g.id === id);

async function loadGames() {
  let r;
  try { r = await api('games'); } catch { return; }
  games = (r.games || []).filter((g) => !g.hidden);
  const changed = activeId !== r.active;
  activeId = r.active;
  if (!selectedId || !gameById(selectedId)) selectedId = activeId || games[0]?.id || null;
  renderOnAir();
  renderCards();
  renderPicker();
  adaptTests();
  if (lastState) renderPages(lastState.pages);
  if (!gameUi || changed) mountGameSettings();
}

function renderOnAir() {
  const g = gameById(activeId);
  $('onair-title').textContent = g ? g.title : '(seçilmedi)';
}

function renderCards() {
  const box = $('game-cards');
  box.replaceChildren();
  for (const g of games) {
    const soon = g.status !== 'hazir';
    const card = document.createElement('article');
    card.className = 'game-card' + (g.id === activeId ? ' active' : '') + (g.id === selectedId ? ' selected' : '') + (soon ? ' soon' : '');
    card.tabIndex = 0;
    const head = document.createElement('div');
    head.className = 'gc-head';
    const h = document.createElement('h3');
    h.textContent = g.title;
    head.append(h);
    if (g.id === activeId) head.append(badge('Yayında', 'on'));
    if (soon) head.append(badge('Yakında', 'soon'));
    const p = document.createElement('p');
    p.textContent = g.description || '';
    const row = document.createElement('div');
    row.className = 'row wrap gc-actions';
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'primary';
    go.textContent = g.id === activeId ? 'Şu an yayında' : 'Bu oyunu yayına al';
    go.disabled = soon || g.id === activeId;
    go.onclick = (ev) => { ev.stopPropagation(); switchGame(g); };
    const set = document.createElement('button');
    set.type = 'button';
    set.textContent = 'Ayarları aç';
    set.disabled = soon;
    set.onclick = (ev) => { ev.stopPropagation(); selectGame(g.id); };
    row.append(go, set);
    card.append(head, p, row);
    card.onclick = () => { if (!soon) selectGame(g.id); };
    card.onkeydown = (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === card && !soon) { ev.preventDefault(); selectGame(g.id); } };
    box.append(card);
  }
  if (!games.length) box.textContent = 'Kayıtlı oyun yok.';
}

function badge(text, cls) {
  const b = document.createElement('span');
  b.className = `badge ${cls}`;
  b.textContent = text;
  return b;
}

async function switchGame(g) {
  if (g.status !== 'hazir' || g.id === activeId) return;
  const onLive = status?.mode === 'live' && status?.connected;
  if (onLive && !confirm(`Şu an canlı yayındasınız. Yayındaki oyun "${g.title}" olsun mu?\nİzleyiciler birkaç saniyelik bir geçiş kartı görür; mevcut oyun kapanır.`)) return;
  try {
    await api('games/active', { id: g.id });
    await loadGames();
  } catch { /* flash shows the error */ }
}

/** Open a game's settings (without changing the stream). */
function selectGame(id) {
  selectedId = id;
  renderCards();
  renderPicker();
  mountGameSettings();
  $('ayarlar').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPicker() {
  const sel = $('gs-pick');
  sel.replaceChildren();
  for (const g of games) {
    const o = new Option(`${g.title}${g.id === activeId ? ' (yayında)' : ''}${g.status !== 'hazir' ? ' (yakında)' : ''}`, g.id);
    sel.add(o);
  }
  sel.value = selectedId || '';
}
$('gs-pick').onchange = (ev) => selectGame(ev.target.value);

let mountToken = 0;
async function mountGameSettings() {
  const t = ++mountToken;
  gameUi?.destroy?.();
  gameUi = null;
  const root = $('game-form');
  const g = gameById(selectedId);
  $('gs-title').textContent = g ? `${g.title} ayarları` : 'Oyun ayarları';
  root.replaceChildren();
  if (!g) return;
  if (g.status !== 'hazir') {
    root.innerHTML = '<p class="muted">Bu oyun henüz hazır değil. Oyun eklenince ayarları burada görünür.</p>';
    return;
  }
  if (g.panelModule) {
    try {
      // Game modules are loaded from the same site as the panel (games/<id>/...).
      const mod = await import(new URL(`../${g.panelModule}`, location.href).href);
      if (t !== mountToken) return;
      gameUi = mod.mount({ api, root, game: g });
      if (giftCatalog) gameUi?.onGifts?.(giftCatalog);
      return;
    } catch (e) {
      console.error('oyun panel modülü yüklenemedi', e);
      if (t !== mountToken) return;
    }
  }
  gameUi = mountSchemaForm({ api, root, scope: g.id, title: g.title, commands: g.commands || [] });
}

// ---------------------------------------------------------------- test events
/** The join part of the test row follows the active game's simulator profile. */
function adaptTests() {
  const g = gameById(activeId);
  const sim = g?.sim || { kind: 'none' };
  $('t-join-plates').hidden = sim.kind !== 'plates';
  $('t-join-teams').hidden = sim.kind !== 'teams';
  $('sim-profile').textContent = g ? `Sanal izleyiciler ${g.title} oynar${sim.joinHint ? ` (${sim.joinHint})` : ''}.` : '';
  const hint = $('t-join-hint');
  if (sim.kind === 'plates') {
    hint.innerHTML = 'Plaka girilirse test kullanıcısı önce <code>plaka emoji</code> yazarak (ör. <code>34 🔥</code>, <code>KKTC 🦅</code>) katılır, sonra olay gönderilir. Plaka 1-81 veya <code>kktc</code>; emoji boşsa 🔥.';
  } else if (sim.kind === 'teams') {
    const sel = $('t-team');
    const prev = sel.value;
    sel.replaceChildren(new Option('(katılmadan)', ''));
    for (const t of sim.teams || []) sel.add(new Option(t.label || t.key, t.words?.[0] || t.key));
    sel.value = [...sel.options].some((o) => o.value === prev) ? prev : '';
    $('t-team-emoji-wrap').hidden = !sim.emoji;
    hint.textContent = 'Takım seçilirse test kullanıcısı önce takımını yazarak katılır, sonra olay gönderilir.';
  } else {
    hint.textContent = g ? `${g.title} için katılım yazısı yok; olaylar doğrudan gönderilir.` : '';
  }
  const text = $('t-text');
  if (sim.kind !== 'plates' && text.value === 'saldır 06') text.value = 'selam';
  if (sim.kind === 'plates' && text.value === 'selam') text.value = 'saldır 06';
}

for (const btn of document.querySelectorAll('[data-inject]')) {
  btn.addEventListener('click', () => {
    const body = {
      kind: btn.dataset.inject,
      name: $('t-name').value.trim(),
      nick: $('t-nick').value.trim(),
    };
    const sim = gameById(activeId)?.sim || { kind: 'none' };
    if (sim.kind === 'plates') {
      const plate = $('t-plate').value.trim();
      if (plate) {
        body.plate = /^\d+$/.test(plate) ? Number(plate) : plate; // number or "kktc"
        body.emoji = $('t-emoji').value.trim() || '🔥';
      }
    } else if (sim.kind === 'teams') {
      const word = $('t-team').value;
      if (word) body.joinText = sim.emoji ? `${word} ${$('t-team-emoji').value.trim() || '🔥'}` : word;
    }
    if (body.kind === 'chat') {
      body.text = $('t-text').value;
      const emoteUrl = $('t-emote').value.trim();
      if (emoteUrl) body.emoteUrl = emoteUrl;
    }
    if (body.kind === 'like') body.count = 100;
    if (body.kind === 'gift') body.coins = Number(btn.dataset.coins);
    api('inject', body).catch(() => {});
  });
}
$('t-text').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') document.querySelector('[data-inject="chat"]').click();
});

// ---------------------------------------------------------------- gift catalogue
function setGifts(c) {
  giftCatalog = { items: Array.isArray(c?.items) ? c.items : [], ts: Number(c?.ts) || 0, source: String(c?.source || '') };
  const items = giftCatalog.items;
  $('gift-cat-count').textContent = `(${items.length})`;
  $('gift-cat-note').textContent = items.length
    ? `Bütün oyunlar aynı listeyi kullanır. Liste, canlı yayında izleyiciler hediye gönderdikçe kendiliğinden büyür ve kaydedilir.${giftCatalog.ts ? ` Son değişiklik: ${new Date(giftCatalog.ts).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}.` : ''}`
    : 'Henüz hediye görülmedi. Liste, canlı yayında izleyiciler hediye gönderdikçe kendiliğinden dolar ve kaydedilir.';
  const list = $('gift-cat-list');
  list.replaceChildren();
  for (const it of items) {
    const row = document.createElement('div');
    row.className = 'gift-cat-item';
    const img = document.createElement('img');
    img.alt = ''; img.referrerPolicy = 'no-referrer'; img.loading = 'lazy';
    if (it.icon) img.src = it.icon; else img.style.visibility = 'hidden';
    img.onerror = () => { img.style.visibility = 'hidden'; };
    const name = document.createElement('span');
    name.textContent = it.tr && it.tr !== it.name ? `${it.tr} (${it.name})` : it.name;
    const coins = document.createElement('span');
    coins.className = 'gp-coins';
    coins.textContent = `${Number(it.coins).toLocaleString('tr-TR')} jeton`;
    row.append(img, name, coins);
    list.append(row);
  }
  gameUi?.onGifts?.(giftCatalog);
}

// ---------------------------------------------------------------- log
const logEl = $('log');
let pending = [];
let rafQueued = false;
let rateCount = 0;

function describe(e) {
  switch (e.type) {
    case 'chat': return [e.text, ...(e.emotes || []).map((m) => `[emote ${m.id}]`)].filter(Boolean).join(' ');
    case 'gift': return `${e.giftName} ×${e.count} (${e.coins} coin, toplam ${e.total})`;
    case 'like': return `+${e.count} beğeni (toplam ${e.totalLikes})`;
    case 'follow': return 'takip etti';
    case 'share': return 'yayını paylaştı';
    case 'join': return 'yayına girdi';
    case 'settings': {
      const who = e.scope === 'stream' ? 'yayın' : gameById(e.game)?.title || e.game || 'oyun';
      return `${who} ayarları gönderildi (${Object.keys(e.values || {}).length} değişiklik)`;
    }
    case 'command': return `komut: ${e.name}${e.game ? ` (${gameById(e.game)?.title || e.game})` : ''}`;
    case 'game': return `yayındaki oyun: ${e.title || e.id}`;
    case 'status': return `mod=${e.mode} bağlı=${e.connected}${e.username ? ' @' + e.username : ''}${e.viewers != null ? ' izleyici=' + e.viewers : ''}${e.error ? ' hata=' + e.error : ''}`;
    default: return JSON.stringify(e);
  }
}

const TYPE_TR = { chat: 'sohbet', gift: 'hediye', like: 'beğeni', follow: 'takip', share: 'paylaşım', join: 'giriş', status: 'durum', settings: 'ayar', command: 'komut', game: 'oyun' };

function queueLog(e) {
  rateCount++;
  if ($('log-pause').checked) return;
  pending.push(e);
  if (pending.length > LOG_MAX) pending = pending.slice(-LOG_MAX);
  if (!rafQueued) { rafQueued = true; requestAnimationFrame(flushLog); }
}

function flushLog() {
  rafQueued = false;
  const atBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 30;
  const frag = document.createDocumentFragment();
  for (const e of pending) {
    const li = document.createElement('li');
    if (e.type === 'gift' && e.total >= 100) li.className = 'big';
    const cells = [
      ['t', new Date(e.ts).toLocaleTimeString('tr-TR')],
      ['k ' + e.type, TYPE_TR[e.type] || e.type],
      ['u', e.user ? `${e.user.nick} (@${e.user.name})` : ''],
      ['d', describe(e)],
    ];
    for (const [cls, txt] of cells) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = txt;
      span.title = txt;
      li.append(span);
    }
    frag.append(li);
  }
  pending = [];
  logEl.append(frag);
  while (logEl.children.length > LOG_MAX) logEl.firstElementChild.remove();
  if (atBottom) logEl.scrollTop = logEl.scrollHeight;
}

setInterval(() => {
  $('rate').textContent = `· ${rateCount} olay/sn`;
  rateCount = 0;
}, 1000);

// ---------------------------------------------------------------- websocket
function connectWs() {
  let ws;
  try {
    ws = new WebSocket(WS_URL);
  } catch {
    setBridgeDown(true, 'WebSocket açılamadı (tarayıcı engelliyor olabilir).');
    setTimeout(connectWs, 3000);
    return;
  }
  ws.onopen = () => { if (bridgeDown) refresh(); };
  ws.onmessage = (m) => {
    let e;
    try { e = JSON.parse(m.data); } catch { return; }
    if (e.type === 'status') {
      status = e;
      renderStatus();
    }
    if (e.type === 'settings') { streamUi?.onRemote(e); gameUi?.onRemote(e); }
    if (e.type === 'gifts') { setGifts(e); return; } // catalogue: not an event for the log
    if (e.type === 'game') {
      if (e.id !== activeId) loadGames();
      if (!e.id || e.id === activeId) return; // the on-connect copy: not news
    }
    queueLog(e);
  };
  ws.onclose = () => {
    $('st-text').textContent = 'Köprü bağlantısı yok, yeniden deneniyor…';
    $('st-dot').className = 'dot bad';
    setBridgeDown(true);
    setTimeout(connectWs, 3000);
  };
}

// ---------------------------------------------------------------- controls
$('live-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const username = $('live-user').value.trim();
  if (!username) { flash('Kullanıcı adı girin.'); return; }
  api('live/connect', { username }).catch(() => {});
});
$('live-stop').onclick = () => api('live/disconnect', {}).catch(() => {});
$('sim-start').onclick = () => api('sim/start', {}).catch(() => {});
$('sim-pause').onclick = () => api('sim/pause', {}).catch(() => {});
$('sim-preset').onchange = (ev) => api('sim/preset', { preset: ev.target.value }).catch(() => {});
$('log-clear').onclick = () => { logEl.textContent = ''; };

// ---------------------------------------------------------------- boot
async function refresh() {
  try { await api('state'); } catch { /* shown via banner/flash */ }
}

(async () => {
  try {
    const { events } = await api('log');
    for (const e of events) queueLog(e);
  } catch { /* ignore */ }
  await loadGames();
  await refresh();
  streamUi = mountSchemaForm({ api, root: $('stream-form'), scope: 'stream', title: 'Yayın ayarları' });
  try { setGifts(await api('gifts')); } catch { setGifts(null); }
  connectWs();
  setInterval(refresh, 2000);
  // Bridge was down at start: retry the game list until it answers.
  setInterval(() => { if (!games.length) loadGames(); }, 3000);
})();
