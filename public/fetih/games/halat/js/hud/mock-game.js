// Fake `game` for developing the HUD without the core: implements the interface contract
// (state, on/off, events) and plays scripted rounds: joins, every gift tier, specials,
// a pit win, a time win and a short bridge disconnect. scene(name) jumps to a fixed
// state for screenshots.

const NAMES = [
  ['ayse', 'Ayşe'], ['mehmet', 'Mehmet Yılmaz'], ['sukru', 'ŞÜKRÜ_ÇAĞLAYAN_ÖZTÜRK_1903_resmi_hesap'],
  ['x', 'x'], ['kralice', '👑 Kraliçe Gülşen 👑'], ['nur', 'نور الهدى'], ['zalgo', 'Z̵̡̢͚a̷̛͓l̶g̵o̴ Çağrı'],
  ['ismail', 'İsmail Işık'], ['fatma', 'Fatma E.'], ['oguz', 'Oğuz Turan'], ['ece', 'Ece 🌸'],
  ['burak', 'burak.34'], ['zeynep', 'Zeynep Güneş Doğan Öztürkmen'], ['emre', 'Emre'], ['seyma', 'Şeyma Aydın'],
  ['deniz', 'deniz_dalgasi_2009'], ['mert', 'Mert'], ['elif', 'Elif Nur'],
];

const AV_COLORS = ['#e8402a', '#2f7bf0', '#3cc47c', '#f0a42f', '#a05cf0', '#f05ca8', '#2fc4c4'];

function makeAvatarUrl(i) {
  if (i % 5 === 3) return ''; // no avatar: initials
  if (i % 7 === 5) return 'data:image/png;base64,AAAA'; // broken image: initials
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = AV_COLORS[i % AV_COLORS.length];
    g.fillRect(0, 0, 96, 96);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(48, 38, 20, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(48, 96, 36, 30, 0, 0, Math.PI * 2); g.fill();
    return c.toDataURL('image/png');
  } catch { return ''; }
}

function makeGiftIcon(color, shape) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = color; g.strokeStyle = '#3a1d08'; g.lineWidth = 6;
    g.beginPath();
    if (shape === 'heart') { g.moveTo(48, 84); g.bezierCurveTo(-10, 40, 24, -4, 48, 26); g.bezierCurveTo(72, -4, 106, 40, 48, 84); }
    else if (shape === 'star') { for (let k = 0; k < 10; k++) { const r = k % 2 ? 18 : 42; const a = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(48 + r * Math.cos(a), 50 + r * Math.sin(a)); } g.closePath(); }
    else { g.arc(48, 48, 38, 0, Math.PI * 2); }
    g.fill(); g.stroke();
    return c.toDataURL('image/png');
  } catch { return ''; }
}

export const MOCK_LADDER = [
  { id: 5655, name: 'Gül', coins: 1, effect: 'kısa asılma' },
  { id: 5487, name: 'Finger Heart', coins: 5, effect: 'yardımcı çekici' },
  { id: 5585, name: 'Şapka ve Bıyık', coins: 99, effect: 'pehlivan' },
  { id: 5996, name: 'Galaksi', coins: 1000, effect: 'traktör' },
  { id: 6034, name: 'Aslan', coins: 5000, effect: 'dev', plus: true },
];

export function createMockGame({ speed = 1, autoplay = true } = {}) {
  const listeners = new Map();
  const icons = {
    5655: makeGiftIcon('#ff4f7b', 'circle'), 5487: makeGiftIcon('#ff6fa8', 'heart'),
    5585: makeGiftIcon('#ffd166', 'star'), 5996: makeGiftIcon('#7a5cff', 'star'), 6034: makeGiftIcon('#ffb347', 'heart'),
  };
  const players = NAMES.map(([id, nick], i) => ({ id, name: id, nick, avatar: makeAvatarUrl(i), emoji: '', teamId: 0 }));
  const team = (id, name, color) => ({ id, name, color, members: 0, force: 0, giftForce: 0, sessionWins: 0, captain: null, top: [] });
  const state = {
    phase: 'lobby', round: 1, timeLeft: 90, duration: 90, rope: 0,
    teams: [team(1, 'Kırmızı', '#e8402a'), team(2, 'Mavi', '#2f7bf0')],
    winner: null, mode: 'sim', connected: true,
  };
  const coins = new Map(); // `${team}|${id}` -> coins this round
  const timers = [];
  let tickT = null; let roundNo = 0; let stopped = false;

  const game = {
    state,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    off(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, payload) { for (const fn of [...(listeners.get(type) || [])]) { try { fn(payload); } catch (e) { console.error(e); } } },
    stop() { stopped = true; for (const t of timers) clearTimeout(t); timers.length = 0; clearInterval(tickT); tickT = null; },
    start() { stopped = false; startTick(); runRound(); },
    scene,
    players, icons, ladder: MOCK_LADDER,
  };
  // like the core's learned catalogue: gives the HUD's default ladder its pictures
  game.giftCatalog = MOCK_LADDER.map((g) => ({ id: g.id, name: g.name, coins: g.coins, icon: icons[g.id] }));

  function at(sec, fn) { timers.push(setTimeout(() => { if (!stopped) fn(); }, (sec * 1000) / speed)); }
  function T(id) { return state.teams[id - 1]; }
  function tick() { game.emit('tick', { state }); }
  function startTick() { clearInterval(tickT); tickT = setInterval(tick, 100); }

  function setPhase(phase) { state.phase = phase; game.emit('phase', { phase, round: state.round }); tick(); }

  function join(p, teamId) {
    if (p.teamId) return;
    p.teamId = teamId; T(teamId).members++;
    game.emit('join', { player: p, teamId });
  }

  function recomputeTop(teamId) {
    const t = T(teamId);
    const list = players.filter((p) => coins.get(`${teamId}|${p.id}`)).map((p) => ({ id: p.id, nick: p.nick, avatar: p.avatar, coins: coins.get(`${teamId}|${p.id}`) }));
    list.sort((a, b) => b.coins - a.coins);
    t.top = list.slice(0, 5);
    const cap = list[0] || null;
    const prev = t.captain?.id;
    t.captain = cap ? { id: cap.id, name: cap.id, nick: cap.nick, avatar: cap.avatar, coins: cap.coins } : null;
    if (cap && cap.id !== prev) game.emit('captain', { teamId, player: players.find((p) => p.id === cap.id) });
  }

  function gift(p, ladderIdx, count = 1) {
    const g = MOCK_LADDER[ladderIdx];
    if (!p.teamId) { game.emit('heldGift', { player: p, coins: g.coins * count, giftName: g.name, icon: icons[g.id] }); return; }
    const total = g.coins * count;
    coins.set(`${p.teamId}|${p.id}`, (coins.get(`${p.teamId}|${p.id}`) || 0) + total);
    const force = total * 10;
    T(p.teamId).giftForce += force;
    const tierIds = ['tug', 'helper', 'strongman', 'tractor', 'giant'];
    game.emit('gift', {
      player: p, teamId: p.teamId, coins: g.coins, count, total, giftId: g.id, giftName: g.name,
      icon: ladderIdx === 1 ? '' : icons[g.id], tier: { id: tierIds[ladderIdx], label: g.effect }, force, held: false,
    });
    if (ladderIdx >= 2) game.emit('special', { kind: tierIds[ladderIdx], teamId: p.teamId, player: p });
    recomputeTop(p.teamId);
  }

  function resetRound() {
    coins.clear();
    for (const p of players) p.teamId = 0;
    for (const t of state.teams) Object.assign(t, { members: 0, force: 0, giftForce: 0, captain: null, top: [] });
    state.rope = 0; state.winner = null; state.timeLeft = state.duration;
  }

  // simple physics so the rope moves with the forces
  let physT = null;
  function physics(on) {
    clearInterval(physT);
    if (!on) return;
    physT = setInterval(() => {
      if (stopped || state.phase !== 'play') return;
      const t1 = T(1); const t2 = T(2);
      t1.force = t1.members * 12 + t1.giftForce * 0.4; t2.force = t2.members * 12 + t2.giftForce * 0.4;
      t1.giftForce *= 0.97; t2.giftForce *= 0.97;
      const d = (t2.force - t1.force) / Math.max(200, t1.force + t2.force);
      state.rope = Math.max(-1, Math.min(1, state.rope + d * 0.05 * speed + state.bias * 0.004 * speed));
      state.timeLeft = Math.max(0, state.timeLeft - 0.1 * speed);
    }, 100);
  }

  function endRound(teamId, by) {
    physics(false);
    state.winner = { teamId, by };
    T(teamId).sessionWins++;
    setPhase('ending');
    game.emit('win', { teamId, by });
    at(3, () => setPhase('result'));
  }

  function runRound() {
    if (stopped) return;
    resetRound();
    roundNo++;
    state.round = roundNo;
    const pitRound = roundNo % 2 === 1;
    state.bias = pitRound ? -1 : 0.2;
    setPhase('lobby');
    const P = players;
    at(0.6, () => join(P[0], 1)); at(1.2, () => join(P[1], 2)); at(1.8, () => join(P[2], 1)); at(2.4, () => join(P[3], 2));
    at(4, () => setPhase('countdown'));
    for (const n of [3, 2, 1, 0]) at(4 + (3 - n), () => game.emit('countdown', { n }));
    at(7, () => { setPhase('play'); physics(true); });
    // joins (a flood on team 1 to exercise the pop queue)
    for (let i = 4; i < 14; i++) at(7.5 + (i - 4) * 0.35, () => join(P[i], i % 3 ? 1 : 2));
    // every tier
    at(9, () => gift(P[0], 0, 1));
    at(9.4, () => gift(P[1], 1, 3));
    at(9.8, () => gift(P[2], 0, 5));
    at(10.2, () => gift(P[0], 0, 2)); // repeat: merges with the earlier one if still queued
    at(11, () => gift(P[16], 1, 1)); // not on a team yet: held gift
    at(14, () => gift(P[4], 2, 1)); // strongman
    at(20, () => gift(P[5], 3, 1)); // tractor
    at(27, () => gift(P[6], 4, 1)); // giant
    if (!pitRound) {
      at(33, () => { state.connected = false; state.mode = 'live'; tick(); });
      at(38, () => { state.connected = true; tick(); });
    }
    for (let k = 0; k < 8; k++) at(30 + k * 3, () => gift(P[(k * 5) % 14], k % 2, 1 + (k % 3)));
    // round end
    if (pitRound) {
      const check = setInterval(() => {
        if (stopped || state.phase !== 'play') { clearInterval(check); return; }
        if (state.rope <= -1) { clearInterval(check); endRound(1, 'pit'); at(11, runRound); }
      }, 100);
      at(60, () => { if (state.phase === 'play') { state.rope = -1; } });
    } else {
      // shortened clock for the demo
      at(7.2, () => { state.timeLeft = 50; });
      const check = setInterval(() => {
        if (stopped || state.phase !== 'play') { clearInterval(check); return; }
        if (state.timeLeft <= 0) { clearInterval(check); endRound(state.rope <= 0 ? 1 : 2, 'time'); at(11, runRound); }
      }, 100);
    }
  }

  // ---------- fixed scenes for screenshots ----------
  function fill(rope = -0.35) {
    resetRound();
    state.round = 3; state.rope = rope; state.timeLeft = 52; state.connected = true; state.mode = 'sim';
    T(1).sessionWins = 4; T(2).sessionWins = 3;
    players.forEach((p, i) => { if (i < 14) { p.teamId = i % 2 ? 2 : 1; T(p.teamId).members++; } });
    T(1).members = 27; T(2).members = 19;
    const give = (i, c) => coins.set(`${players[i].teamId}|${players[i].id}`, c);
    give(2, 5200); give(0, 340); give(4, 120); give(6, 15); give(1, 1000); give(3, 260); give(5, 40);
    recomputeTop(1); recomputeTop(2);
    T(1).force = 1840; T(2).force = 1210;
  }

  function scene(name) {
    game.stop();
    const P = players;
    const now = () => tick();
    switch (name) {
      case 'lobby': resetRound(); state.round = 4; state.phase = 'lobby'; T(1).sessionWins = 4; T(2).sessionWins = 3; join(P[0], 1); join(P[1], 2); join(P[2], 1); break;
      case 'countdown': fill(0); state.phase = 'countdown'; now(); game.emit('countdown', { n: 3 }); break;
      case 'play': fill(); state.phase = 'play'; now(); join(P[16], 1); join(P[17], 2); break;
      case 'danger': fill(0.82); state.phase = 'play'; state.timeLeft = 8; break;
      case 'credits':
        fill(); state.phase = 'play'; now();
        gift(P[0], 1, 3); gift(P[1], 0, 1); gift(P[2], 0, 4); gift(P[0], 1, 2);
        P[17].teamId = 0; gift(P[17], 0, 1);
        break;
      case 'strongman': fill(); state.phase = 'play'; now(); gift(P[4], 2, 1); break;
      case 'tractor': fill(); state.phase = 'play'; now(); gift(P[3], 3, 1); break;
      case 'giant': fill(); state.phase = 'play'; now(); gift(P[2], 4, 1); break;
      case 'result-pit': fill(-1); state.phase = 'result'; state.winner = { teamId: 1, by: 'pit' }; break;
      case 'result-time': fill(0.2); state.phase = 'result'; state.winner = { teamId: 2, by: 'time' }; break;
      case 'draw': fill(0); state.phase = 'result'; state.winner = null; break;
      case 'disconnected': fill(); state.phase = 'play'; state.mode = 'live'; state.connected = false; break;
      default: break;
    }
    game.emit('phase', { phase: state.phase, round: state.round });
    tick();
    startTick();
  }

  if (autoplay) setTimeout(() => game.start(), 0);
  return game;
}
