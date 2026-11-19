// WebSocket client for the bridge with automatic reconnect.
export class BridgeClient {
  constructor(onEvent, onConn) {
    this.onEvent = onEvent;
    this.onConn = onConn; // (connected:boolean) => void
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
      ws = new WebSocket(`${proto}://${location.host}/ws`);
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
      try { this.onEvent(msg); } catch (e) { console.error('event handler', e); }
    };
    ws.onclose = () => {
      if (this.connected) { this.connected = false; this.onConn(false); }
      this.ws = null;
      this._schedule();
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
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
