// Control panel: talks to the server via /api/* and listens to /ws like the game does.
const $ = (id) => document.getElementById(id);
const LOG_MAX = 100;

let lastState = null;
let status = null;

// ---------------------------------------------------------------- bridge address
// The panel runs either from the bridge itself (same origin) or as a static copy on another
// site (e.g. https://bugrahnd.com.tr/fetih/panel/). In the latter case it talks to the bridge
// on this computer. Only loopback addresses are accepted, so the panel never sends data elsewhere.
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const DEFAULT_BRIDGE = 'http://127.0.0.1:3000';
// Public DNS names that resolve to 127.0.0.1 (bridge ALLOWED_HOSTS defaults): the page is then served
// by the bridge itself, so use the same origin.
const LOOPBACK_NAMES = /^(([a-z0-9-]+\.)?localtest\.me|([a-z0-9-]+\.)?lvh\.me|local\.bugrahnd\.com\.tr)$/i;

function resolveBridge() {
  const q = new URLSearchParams(location.search).get('bridge');
  if (q) {
    try {
      const u = new URL(q);
      if ((u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK.has(u.hostname)) return u.origin;
    } catch { /* fall through */ }
    console.warn('Geçersiz ?bridge= değeri (yalnızca 127.0.0.1 / localhost kabul edilir):', q);
  }
  if ((LOOPBACK.has(location.hostname) || LOOPBACK_NAMES.test(location.hostname)) && location.protocol === 'http:') {
    return location.origin;
  }
  return DEFAULT_BRIDGE;
}
const BRIDGE = resolveBridge();
const WS_URL = BRIDGE.replace(/^http/, 'ws') + '/ws';

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
    case 'status': return `mod=${e.mode} bağlı=${e.connected}${e.username ? ' @' + e.username : ''}${e.viewers != null ? ' izleyici=' + e.viewers : ''}${e.error ? ' hata=' + e.error : ''}`;
    default: return JSON.stringify(e);
  }
}

const TYPE_TR = { chat: 'sohbet', gift: 'hediye', like: 'beğeni', follow: 'takip', share: 'paylaşım', join: 'giriş', status: 'durum' };

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

for (const btn of document.querySelectorAll('[data-inject]')) {
  btn.addEventListener('click', () => {
    const body = {
      kind: btn.dataset.inject,
      name: $('t-name').value.trim(),
      nick: $('t-nick').value.trim(),
    };
    const plate = $('t-plate').value.trim();
    if (plate) {
      body.plate = /^\d+$/.test(plate) ? Number(plate) : plate; // number or "kktc"
      body.emoji = $('t-emoji').value.trim() || '🔥';
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

// ---------------------------------------------------------------- boot
async function refresh() {
  try { await api('state'); } catch { /* shown via banner/flash */ }
}

(async () => {
  try {
    const { events } = await api('log');
    for (const e of events) queueLog(e);
  } catch { /* ignore */ }
  await refresh();
  connectWs();
  setInterval(refresh, 2000);
})();
