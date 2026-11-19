// WebSocket client for the bridge with automatic reconnect.
// url: explicit bridge address (stream mode on another host, e.g. ws://127.0.0.1:3000/ws);
// empty = the page's own host. With an explicit address, root-relative URLs inside events
// (simulator avatars /avatar/..., emotes /emote/...) are resolved against the bridge's
// http origin instead of the page's origin.
import { httpOriginOf } from './util.js';

const absolutize = (u, origin) => (typeof u === 'string' && u.startsWith('/') && !u.startsWith('//') ? origin + u : u);

export class BridgeClient {
  constructor(onEvent, onConn, url = '') {
    this.onEvent = onEvent;
    this.onConn = onConn; // (connected:boolean) => void
    this.url = url;
    this.origin = url ? httpOriginOf(url) : '';
    this.ws = null;
    this.retry = 0;
    this.connected = false;
    this.received = 0;
    this._connect();
  }

  _connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws;
    try {
      ws = new WebSocket(this.url || `${proto}://${location.host}/ws`);
    } catch (e) {
      this._schedule();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.connected = true;
      this.onConn(true);
    };
    ws.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }
      if (!msg || typeof msg.type !== 'string') return;
      this.received++;
      if (this.origin) this._resolveUrls(msg);
      try { this.onEvent(msg); } catch (e) { console.error('event handler', e); }
    };
    ws.onclose = () => {
      if (this.connected) { this.connected = false; this.onConn(false); }
      this.ws = null;
      this._schedule();
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  /** Root-relative image URLs from the bridge point at the bridge, not at this page. */
  _resolveUrls(msg) {
    const o = this.origin;
    if (msg.user && typeof msg.user === 'object') msg.user.avatar = absolutize(msg.user.avatar, o);
    if (Array.isArray(msg.emotes)) {
      for (const e of msg.emotes) {
        if (!e || typeof e !== 'object') continue;
        e.url = absolutize(e.url, o);
        if (e.image && Array.isArray(e.image.urlList)) e.image.urlList = e.image.urlList.map((x) => absolutize(x, o));
      }
    }
    if (typeof msg.emoteUrl === 'string') msg.emoteUrl = absolutize(msg.emoteUrl, o);
  }

  /** Stop for good (switching to demo mode). */
  close() {
    this.closed = true;
    if (this.ws) { this.ws.onclose = null; try { this.ws.close(); } catch {} }
  }

  _schedule() {
    if (this.closed) return;
    const delay = Math.min(5000, 1000 + this.retry * 700);
    this.retry++;
    setTimeout(() => this._connect(), delay);
  }
}
