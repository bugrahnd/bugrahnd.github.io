// Player shell: the page at the stream URL (/ on the bridge, https://bugrahnd.com.tr/fetih/?yayin=1
// in TikTok LIVE Studio). It asks the bridge which game is on stream ({ type: "game" } over /ws)
// and shows that game full-frame in an iframe, passing the page query through (?yayin=1,
// ?bridge=, ?demo=, ?mute=, ?zones=, ?debug=, ...). When the streamer switches games in the
// panel, a short neutral card ("Sıradaki oyun: …") covers the swap; LIVE Studio never changes.
//   - Bridge unreachable (stream mode): the last known game (else Plaka Savaşları) is shown; it
//     shows its own calm "Köprü bekleniyor…" state and connects by itself when the bridge starts.
//   - Demo mode (public visitors, no bridge): ?oyun=<id> or the first ready game; a small picker
//     appears when more than one game is ready.
// Each game also works on its own at games/<id>/ (testing).
import { pageMode, BridgeClient, normalizeBridgeParam } from './shared/bridge.js';

const DEFAULT_GAME = { id: 'plaka', title: 'Plaka Savaşları', url: 'games/plaka/index.html' };
const LAST_KEY = 'oyun.sonYayinOyunu';
const CARD_MIN_MS = 1800; // the transition card stays at least this long
const FADE_MS = 350;

const mode = pageMode();
const stage = document.getElementById('stage');
const card = document.getElementById('card');
const debug = new URLSearchParams(location.search).get('debug') === '1';
const dlog = (...a) => { if (debug) console.info('[oynatıcı]', ...a); };

/** Query passed to the game page: the shell's own query minus shell-only keys. */
function gameQuery() {
  const q = new URLSearchParams(location.search);
  q.delete('oyun');
  // Games accept ?bridge= in ws:// form; the http:// form (as used for the panel) is converted.
  const b = q.get('bridge');
  if (b && b !== 'local') { const ws = normalizeBridgeParam(b); if (ws) q.set('bridge', ws); }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Only same-site relative game URLs (games/<id>/...) are ever loaded. */
const safeUrl = (u) => (typeof u === 'string' && /^games\/[a-z][a-z0-9-]{1,23}\/[^:\\]*$/.test(u) && !u.includes('..') ? u : '');

const store = {
  get() { try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch { return null; } },
  set(g) { try { localStorage.setItem(LAST_KEY, JSON.stringify({ id: g.id, title: g.title, url: g.url })); } catch { /* private mode */ } },
};

let current = null; // { id, url, frame }
let token = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function makeFrame(game) {
  const f = document.createElement('iframe');
  f.className = 'game-frame';
  f.title = game.title || game.id;
  // Same-site page; autoplay/fullscreen delegated so audio behaves as when the game is opened directly.
  f.allow = 'autoplay; fullscreen';
  f.src = game.url + gameQuery();
  f.addEventListener('load', () => { try { f.contentWindow.focus(); } catch { /* ignore */ } });
  return f;
}

function setCard(on, title = '') {
  if (on) {
    document.getElementById('card-title').textContent = title;
    card.hidden = false;
    requestAnimationFrame(() => card.classList.add('on'));
  } else {
    card.classList.remove('on');
    setTimeout(() => { if (!card.classList.contains('on')) card.hidden = true; }, FADE_MS);
  }
}

/** Reloads the page from the other hosted address (/x/ <-> /public/x/) when the game is found there. */
async function movedSite(url) {
  const p = location.pathname;
  const alt = p.startsWith('/public/') ? p.slice('/public'.length) : `/public${p}`;
  const there = await fetch(new URL(url, location.origin + alt).href, { method: 'HEAD', cache: 'no-cache' }).then((r) => r.ok, () => false);
  if (!there) return false;
  console.warn(`site ${alt} adresine taşınmış; sayfa oradan yeniden açılıyor`);
  location.replace(alt + location.search + location.hash);
  return true;
}

/** Show a game. The first one appears directly; later switches go through the card. */
async function show(game) {
  const url = safeUrl(game.url);
  if (!url || (current && current.id === game.id && current.url === url)) return;
  const t = ++token;
  const g = { ...game, url };
  dlog('oyun:', g.id, url);
  if (!current) {
    const frame = makeFrame(g);
    stage.append(frame);
    current = { id: g.id, url, frame };
    return;
  }
  // A game the bridge knows but this site does not have yet (hosted copy not rebuilt): keep the
  // current game on screen instead of showing an error page to viewers.
  const exists = await fetch(url, { method: 'HEAD', cache: 'no-cache' }).then((r) => r.ok, () => true);
  if (t !== token) return;
  if (!exists) {
    // The hosted copy can move between /fetih/ and /public/fetih/ (two GitHub Pages builds race on
    // every push). If the game is there, reload this page from that address: the bridge then tells
    // it the game again and it loads normally.
    if (!mode.local && await movedSite(url)) return;
    console.warn(`"${g.title || g.id}" bu sitede yok (${url}); site kopyası güncellenmeli. Mevcut oyun kalıyor.`);
    return;
  }
  const started = performance.now();
  setCard(true, g.title || g.id);
  await wait(FADE_MS);
  if (t !== token) return;
  // Remove the old game first (frees its WebGL context and audio), then load the new one behind the card.
  current.frame.remove();
  const frame = makeFrame(g);
  const loaded = new Promise((r) => { frame.addEventListener('load', r, { once: true }); setTimeout(r, 8000); });
  stage.append(frame);
  current = { id: g.id, url, frame };
  await loaded;
  await wait(Math.max(400, CARD_MIN_MS - (performance.now() - started)));
  if (t !== token) return;
  setCard(false);
}

// ---------------------------------------------------------------- bridge / stream mode
function startBridge() {
  // Until the bridge answers: the last game that was on stream here (else Plaka Savaşları).
  const last = store.get();
  show(last && safeUrl(last.url) ? last : DEFAULT_GAME);
  // ?c=player: the panel counts stream pages separately from game pages.
  new BridgeClient({
    url: mode.wsUrl,
    kind: 'player',
    onMessage(msg) {
      if (msg.type !== 'game' || !msg.id) return;
      const g = { id: String(msg.id), title: String(msg.title || msg.id), url: String(msg.url || `games/${msg.id}/index.html`) };
      store.set(g);
      show(g);
    },
    onConnection(ok) { dlog(ok ? 'köprüye bağlandı' : 'köprü bağlantısı yok'); },
  });
}

// ---------------------------------------------------------------- demo mode (no bridge)
async function startDemo() {
  let list = [];
  try {
    const r = await fetch('games/index.json', { cache: 'no-cache' });
    if (r.ok) list = (await r.json()).games || [];
  } catch { /* offline copy without the list: Plaka Savaşları */ }
  const ready = list.filter((g) => g.status === 'hazir' && !g.hidden && safeUrl(g.url));
  const want = new URLSearchParams(location.search).get('oyun');
  const pick = ready.find((g) => g.id === want) || ready.find((g) => g.id === DEFAULT_GAME.id) || ready[0] || DEFAULT_GAME;
  show(pick);
  if (ready.length > 1) buildPicker(list, pick.id);
}

function buildPicker(list, activeId) {
  const box = document.getElementById('picker');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = '☰ Oyunlar';
  const menu = document.createElement('div');
  menu.className = 'picker-list';
  menu.hidden = true;
  for (const g of list.filter((x) => !x.hidden)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = g.status === 'hazir' ? g.title : `${g.title} (yakında)`;
    b.disabled = g.status !== 'hazir';
    if (g.id === activeId) b.setAttribute('aria-current', 'true');
    b.onclick = () => {
      const q = new URLSearchParams(location.search);
      q.set('oyun', g.id);
      location.search = q.toString();
    };
    menu.append(b);
  }
  toggle.onclick = () => { menu.hidden = !menu.hidden; };
  box.append(toggle, menu);
  box.hidden = false;
}

if (mode.demo) startDemo();
else startBridge();
