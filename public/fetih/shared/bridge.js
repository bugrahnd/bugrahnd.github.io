// Bridge address rules and a WebSocket client with automatic reconnect, shared by the player
// shell and the games. Same rules as Plaka Savaşları (game/js/util.js, game/js/main.js):
//   - ?yayin=1 or ?bridge=local      -> stream mode: the bridge on this PC, ws://127.0.0.1:3000/ws
//   - ?bridge=ws://127.0.0.1:3001/ws  -> stream mode with that address (http:// form also accepted)
//   - page served by the bridge itself (localhost, 127.0.0.1, localtest.me, lvh.me, ...) -> same origin
//   - any other host without ?yayin=1 -> demo mode (no bridge), unless ?demo=0
//   - ?demo=1|low|medium|high|chaos forces demo mode (not in stream mode)

/** Host names that reach this PC (the bridge): loopback plus DNS names resolving to 127.0.0.1. */
export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '', 'localtest.me', 'lvh.me', 'local.bugrahnd.com.tr'];
const LOOPBACK_SUFFIXES = ['.localhost', '.localtest.me', '.lvh.me'];
export const isLoopbackHost = (h) => LOOPBACK_HOSTS.includes(h) || LOOPBACK_SUFFIXES.some((s) => h.endsWith(s));
export const DEFAULT_BRIDGE_WS = 'ws://127.0.0.1:3000/ws';

/** ?bridge= value as a ws(s) URL ('' when absent or not acceptable). */
export function normalizeBridgeParam(raw) {
  const b = String(raw || '').trim();
  if (!b) return '';
  if (b === 'local') return DEFAULT_BRIDGE_WS;
  if (/^wss?:\/\/[^\s/]+\/\S*$/i.test(b)) return b;
  try {
    const u = new URL(b);
    if ((u.protocol === 'http:' || u.protocol === 'https:') && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) {
      return `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}/ws`;
    }
  } catch { /* ignore */ }
  return '';
}

/**
 * How this page should get its events.
 * Returns { stream, local, demo, demoPreset, wsUrl, httpOrigin }:
 *   wsUrl = '' in demo mode, else the bridge WebSocket URL (without query).
 */
export function pageMode(loc = location) {
  const qs = new URLSearchParams(loc.search);
  const local = isLoopbackHost(loc.hostname);
  let streamWs = normalizeBridgeParam(qs.get('bridge'));
  if (!streamWs && qs.get('yayin') === '1') streamWs = DEFAULT_BRIDGE_WS;
  const demoParam = qs.get('demo');
  const demo = streamWs ? false : demoParam === '0' ? false : !!demoParam || !local;
  const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = demo ? '' : streamWs || (local ? `${proto}://${loc.host}/ws` : DEFAULT_BRIDGE_WS);
  return { stream: !!streamWs, local, demo, demoPreset: demoParam || '', wsUrl, httpOrigin: httpOriginOf(wsUrl) };
}

/** http(s) origin of a ws(s) URL: ws://127.0.0.1:3000/ws -> http://127.0.0.1:3000 */
export function httpOriginOf(wsUrl) {
  try {
    const u = new URL(wsUrl);
    return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}`;
  } catch { return ''; }
}

const absolutize = (u, origin) => (typeof u === 'string' && u.startsWith('/') && !u.startsWith('//') ? origin + u : u);

/**
 * WebSocket client for the bridge.
 *   new BridgeClient({ url, kind: 'game' | 'player', game: '<id>', onMessage(msg), onConnection(ok) })
 * `kind` + `game` become ?c=<kind>&g=<id>: the bridge then sends this page its own game's
 * settings and commands, and the panel counts it. Root-relative image URLs in events
 * (simulator avatars /avatar/..., emotes /emote/...) are resolved against the bridge.
 */
export class BridgeClient {
  constructor({ url, kind = 'game', game = '', onMessage = () => {}, onConnection = () => {} }) {
    this.url = url;
    this.origin = httpOriginOf(url);
    this.query = `c=${encodeURIComponent(kind)}${game ? `&g=${encodeURIComponent(game)}` : ''}`;
    this.onMessage = onMessage;
    this.onConnection = onConnection;
    this.ws = null;
    this.retry = 0;
    this.connected = false;
    this.received = 0;
    this.closed = false;
    this._connect();
  }

  _connect() {
    if (this.closed) return;
    let ws;
    try {
      ws = new WebSocket(this.url + (this.url.includes('?') ? '&' : '?') + this.query);
    } catch {
      this._schedule();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.connected = true;
      this.onConnection(true);
    };
    ws.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }
      if (!msg || typeof msg.type !== 'string') return;
      this.received++;
      this._resolveUrls(msg);
      try { this.onMessage(msg); } catch (e) { console.error('bridge message handler', e); }
    };
    ws.onclose = () => {
      if (this.connected) { this.connected = false; this.onConnection(false); }
      this.ws = null;
      this._schedule();
    };
    ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
  }

  _resolveUrls(msg) {
    const o = this.origin;
    if (!o) return;
    if (msg.user && typeof msg.user === 'object') msg.user.avatar = absolutize(msg.user.avatar, o);
    if (Array.isArray(msg.emotes)) for (const e of msg.emotes) if (e && typeof e === 'object') e.url = absolutize(e.url, o);
  }

  /** Stop for good. */
  close() {
    this.closed = true;
    if (this.ws) { this.ws.onclose = null; try { this.ws.close(); } catch { /* ignore */ } }
  }

  _schedule() {
    if (this.closed) return;
    const delay = Math.min(5000, 1000 + this.retry * 700);
    this.retry++;
    setTimeout(() => this._connect(), delay);
  }
}
