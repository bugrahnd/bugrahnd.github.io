// Tribün Kupası <-> shared stream bridge (server/index.js). Loaded by index.html only when the page
// is opened under /games/futbol/ (from the bridge, the player shell or the hosted site); the game's
// own server.js mode (page at /) keeps its WebSocket as before.
//
// The bridge's events (PROTOCOL.md) are turned into the game's own event shape (window.fgl.handle):
//   chat  { user:{id,name,nick,avatar}, text }        -> { type:'chat', user, nick, pic, text }
//   gift  { user, giftName, coins, count }             -> { type:'gift', user, nick, pic, gift, diamonds, count }
//   like  { user, count }                              -> { type:'like', user, nick, pic, count }
//   status{ connected, username, error }               -> { type:'status', state, username, message }
//   command { name, game:'futbol' }                    -> new match / reset cups
// Mode rules are the shared ones (shared/bridge.js pageMode): ?yayin=1 or a page served by the bridge
// listens to the bridge; the hosted page without ?yayin=1 plays its own demo.
import { pageMode, BridgeClient } from '../../shared/bridge.js';

const GAME_ID = 'futbol';
const fgl = window.fgl;
const mode = pageMode();

const key = (u) => String(u?.name || u?.id || '');
const who = (u) => ({ user: key(u), nick: u?.nick || u?.name || '', pic: u?.avatar || '' });

function onMessage(m) {
  switch (m.type) {
    case 'chat':
      if (m.user && typeof m.text === 'string') fgl.handle({ type: 'chat', ...who(m.user), text: m.text });
      break;
    case 'gift':
      if (m.user) fgl.handle({ type: 'gift', ...who(m.user), gift: m.giftName || 'Hediye', diamonds: Math.max(1, Number(m.coins) || 1), count: Math.max(1, Number(m.count) || 1) });
      break;
    case 'like':
      if (m.user) fgl.handle({ type: 'like', ...who(m.user), count: Math.max(1, Number(m.count) || 1) });
      break;
    case 'status':
      fgl.handle({ type: 'status', state: m.connected ? 'connected' : m.error ? 'error' : 'connecting', username: m.username || '', message: m.error || '' });
      break;
    case 'command':
      if (m.game !== GAME_ID) break;
      if (m.name === 'newMatch') fgl.newMatch();
      else if (m.name === 'resetCups') fgl.resetCups();
      break;
    default: break;
  }
}

if (mode.demo) {
  // hosted page without ?yayin=1: the self-playing demo (as the other games)
  if (!fgl.demoOn) fgl.toggleDemo();
} else {
  new BridgeClient({
    url: mode.wsUrl,
    kind: 'game',
    game: GAME_ID,
    onMessage,
    onConnection(ok) { if (!ok) fgl.handle({ type: 'status', state: 'disconnected', username: '', message: 'köprü yok' }); },
  });
}
