// "Oyun ayarları" section: edits the streamer overrides stored by the bridge
// (GET/POST /api/settings, POST /api/settings/reset) and sends one-shot commands
// (POST /api/command). The bridge pushes saved settings to every connected game page.
const $ = (id) => document.getElementById(id);

const PACE_LABEL = { sakin: 'Sakin', normal: 'Normal', hizli: 'Hızlı' };
const CURVE_COINS = [1, 10, 100, 1000, 5000];

// Curated fields per group. kind: num | toggle | text | pace | range | strip | curve.
// `scale`: what the input shows vs what is stored (none needed now; values are stored as shown).
const GROUPS = [
  {
    id: 'tur', title: 'Tur',
    fields: [
      { key: 'round.durationMin', kind: 'num', label: 'Tur süresi', unit: 'dakika', hint: 'Bir turun uzunluğu.', nextRound: true },
      { key: 'round.endScreenSec', kind: 'num', label: 'Bitiş ekranı', unit: 'saniye', hint: 'Tur bitince kazananın gösterildiği süre.' },
      { key: 'round.finaleSec', kind: 'num', label: '"2 kat" süresi', unit: 'saniye', hint: 'Turun son kaç saniyesinde her şey 2 kat sayılsın (0 = kapalı).' },
      { key: 'round.earlyWinPct', kind: 'num', label: 'Erken zafer', unit: '% il', hint: 'Bir şehir illerin bu kadarını alırsa tur hemen biter (100 = erken bitiş yok).' },
      { key: 'round.keepTeams', kind: 'toggle', label: 'Takımlar turlar arası kalsın', hint: 'Açıksa izleyiciler yeni turda yeniden plaka yazmadan aynı şehirde kalır.', nextRound: true },
    ],
  },
  {
    id: 'hiz', title: 'Hız',
    fields: [
      { key: 'pace', kind: 'pace', label: 'Oyun hızı', hint: 'Saldırı sıklığı, ordu hızı ve savaş süresi birlikte değişir.' },
    ],
  },
  {
    id: 'hediye', title: 'Hediyeler',
    fields: [
      { key: 'gifts.strip', kind: 'strip', label: 'Haritanın altındaki 4 hediye', hint: 'İzleyicinin TikTok\'ta gördüğü hediye adı (boş bırakılırsa jeton değeri yazar), jeton değeri ve kısa etki yazısı. Etkiyi jeton değeri belirler, ad değil.' },
      { key: 'gifts.curve', kind: 'curve', label: 'Hediye başına asker', hint: 'Tek bir hediyenin jeton değerine göre kaç asker verdiği. Aradaki değerler bu noktalardan hesaplanır; sayılar artan sırada olmalı.' },
    ],
  },
  {
    id: 'bedava', title: 'Bedava hareketler',
    fields: [
      { key: 'engage.chatTroops', kind: 'num', label: 'Mesaj başına asker', unit: 'asker', hint: 'Takımdaki bir izleyici her yorum yazdığında şehrine giden asker.' },
      { key: 'engage.chatCooldownSec', kind: 'num', label: 'Mesaj bekleme süresi', unit: 'saniye', hint: 'Aynı izleyicinin mesajı en fazla bu sıklıkla asker verir.' },
      { key: 'troops.followBonus', kind: 'num', label: 'Takip bonusu', unit: 'asker', hint: 'Takip eden izleyicinin şehrine giden asker.' },
      { key: 'troops.shareBonus', kind: 'num', label: 'Paylaşım bonusu', unit: 'asker', hint: 'Yayını paylaşan izleyicinin şehrine giden asker.' },
      { key: 'morale.likeSpeed', kind: 'num', label: 'Beğeni moral hızı', unit: 'kat', hint: 'Beğenilerin HÜCUM moralini ne kadar hızlı doldurduğu (1 = normal, 2 = iki kat hızlı).' },
    ],
  },
  {
    id: 'ekran', title: 'Ekran',
    intro: 'Kapatılan kutuların yeri haritaya verilir (harita büyür). Süre, harita ve TikTok\'un kendi alanları her zaman korunur.',
    fields: [
      { key: 'show.cityBoard', kind: 'toggle', label: 'Şehir tablosu', hint: 'Sol üstte "En güçlü şehirler" listesi.' },
      { key: 'show.gifterBoard', kind: 'toggle', label: 'Hediye tablosu', hint: 'Sağ üstte "En cömertler" listesi.' },
      { key: 'show.likers', kind: 'toggle', label: 'En çok beğenenler', hint: 'Sürenin sağındaki beğeni isimleri.' },
      { key: 'show.session', kind: 'toggle', label: 'Günlük skor', hint: 'Sürenin solundaki kupa sayıları (kaç tur kazanıldı).' },
      { key: 'show.leader', kind: 'toggle', label: 'Lider kartı', hint: 'Turun en çok hediye gönderen izleyicisi.' },
      { key: 'show.credit', kind: 'toggle', label: 'Hediye teşekkür şeridi', hint: 'Hediye gelince "+asker" teşekkür kutusu ve ipuçları.' },
      { key: 'show.imperative', kind: 'toggle', label: 'Talimat satırı', hint: 'Haritanın üstündeki büyük yazı (ör. "BEĞEN, MORAL DOLSUN!").' },
      { key: 'show.giftStrip', kind: 'toggle', label: 'Hediye şeridi', hint: 'En alttaki 4 hediye kutusu.' },
      { key: 'show.minimap', kind: 'toggle', label: 'Küçük harita', hint: 'Kamera yakınlaşınca köşede çıkan Türkiye haritası.' },
      { key: 'cta.text', kind: 'text', label: 'Çağrı yazısı', hint: 'Haritanın altındaki kırmızı çağrının yazısı.' },
      { key: 'cta.example', kind: 'text', label: 'Çağrı örneği', hint: 'Çağrının yanındaki örnek kutu (ör. plaka).' },
    ],
  },
  {
    id: 'kamera', title: 'Kamera ve ses',
    fields: [
      { key: 'camera.director', kind: 'toggle', label: 'Otomatik kamera', hint: 'Büyük hediyelerde ve önemli anlarda kamera yakınlaşsın.' },
      { key: 'audio.musicPct', kind: 'range', label: 'Müzik sesi', unit: '%', hint: 'Arka plan müziği.' },
      { key: 'audio.sfxPct', kind: 'range', label: 'Efekt sesi', unit: '%', hint: 'Savaş, hediye ve uyarı sesleri.' },
      { key: 'audio.mute', kind: 'toggle', label: 'Tüm sesi kapat', hint: 'Oyun tamamen sessiz olur.' },
    ],
  },
];

// "Sade görünüm": only timer, leader card, imperative line, map, call to action and gift strip.
const PLAIN = {
  'show.cityBoard': false, 'show.gifterBoard': false, 'show.likers': false, 'show.session': false,
  'show.credit': false, 'show.minimap': false, 'show.leader': true, 'show.imperative': true, 'show.giftStrip': true,
};

const COMMAND_CONFIRM = {
  restartRound: 'Tur şimdi baştan başlasın mı? Haritadaki fetihler sıfırlanır (takımlar kalır).',
  endRound: 'Tur şimdi bitsin mi? O anki lider kazanan sayılır.',
  clearMap: 'Harita tamamen temizlensin mi? Bütün takımlar ve oyuncular silinir, izleyiciler yeniden plaka yazmalı. Günlük skor kalır.',
  resetSession: 'Günlük skor (kaç tur kazanıldı) sıfırlansın mı?',
};
const COMMAND_DONE = {
  restartRound: 'Tur yeniden başlatıldı', endRound: 'Tur bitirildi', clearMap: 'Harita temizlendi', resetSession: 'Günlük skor sıfırlandı',
};

const fmt = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : String(v));
const el = (tag, cls, parent, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.append(e);
  return e;
};

export function initSettings({ api }) {
  const root = $('settings-form');
  const msgEl = $('set-msg');
  let schema = null; let defaults = null; let paces = null;
  let current = {}; // saved overrides from the bridge
  let dirty = false;
  const inputs = new Map(); // key -> { get(), set(v) }

  const say = (text, kind = '') => {
    msgEl.textContent = text;
    msgEl.className = 'set-msg ' + kind;
    clearTimeout(say.t);
    if (kind === 'ok') say.t = setTimeout(() => { if (msgEl.textContent === text) { msgEl.textContent = ''; msgEl.className = 'set-msg'; } }, 6000);
  };
  const markDirty = () => {
    dirty = true;
    say('Kaydedilmemiş değişiklik var. Uygulamak için "Kaydet"e basın.', 'warn');
  };

  // ---------------------------------------------------------------- building
  function numInput(key, s, parent) {
    const i = el('input', '', parent);
    i.type = 'number';
    if (s.min !== undefined) i.min = s.min;
    if (s.max !== undefined) i.max = s.max;
    i.step = s.step || 1;
    i.inputMode = s.type === 'int' ? 'numeric' : 'decimal';
    return i;
  }

  function build() {
    root.replaceChildren();
    for (const g of GROUPS) {
      const fs = el('fieldset', 'set-group', root);
      el('legend', '', fs, g.title);
      if (g.intro) el('p', 'hint', fs, g.intro);
      if (g.id === 'tur') buildCommands(fs);
      if (g.id === 'ekran') {
        const row = el('div', 'row wrap', fs);
        const b = el('button', '', row, 'Sade görünüm');
        b.type = 'button';
        b.title = 'Yalnızca süre, lider kartı, talimat satırı, harita, çağrı ve hediye şeridi kalır.';
        b.onclick = () => { for (const [k, v] of Object.entries(PLAIN)) inputs.get(k)?.set(v); save('Sade görünüm uygulandı'); };
        const all = el('button', '', row, 'Hepsini göster');
        all.type = 'button';
        all.onclick = () => { for (const k of Object.keys(PLAIN)) inputs.get(k)?.set(true); save('Bütün kutular açıldı'); };
        el('span', 'muted', row, 'Sade: süre, lider kartı, talimat satırı, harita, çağrı ve hediye şeridi.');
      }
      for (const f of g.fields) buildField(fs, f);
    }
  }

  function buildCommands(parent) {
    const row = el('div', 'row wrap set-cmds', parent);
    for (const [name, label] of [['restartRound', 'Turu yeniden başlat'], ['endRound', 'Turu bitir'], ['clearMap', 'Haritayı temizle'], ['resetSession', 'Günlük skoru sıfırla']]) {
      const b = el('button', name === 'clearMap' || name === 'resetSession' ? 'danger' : '', row, label);
      b.type = 'button';
      b.onclick = async () => {
        if (!confirm(COMMAND_CONFIRM[name])) return;
        try {
          const r = await api('command', { name });
          const n = r.pages?.game ?? 0;
          say(n ? `${COMMAND_DONE[name]} (${n} oyun sayfasına gönderildi).` : `${COMMAND_DONE[name]}, ama şu an bağlı oyun sayfası yok.`, n ? 'ok' : 'warn');
        } catch (e) { say(e.message, 'bad'); }
      };
    }
  }

  function buildField(parent, f) {
    const s = schema[f.key];
    if (!s) return; // bridge does not know this key (older bridge)
    const row = el('div', 'set-field' + (f.kind === 'strip' || f.kind === 'curve' ? ' wide' : ''), parent);
    const head = el('div', 'set-head', row);
    const label = el('label', 'set-label', head);
    const id = 'set-' + f.key.replace(/\W/g, '-');
    label.htmlFor = id;
    label.textContent = f.label;
    if (f.nextRound) el('span', 'tag', head, 'sonraki turdan itibaren');
    const ctl = el('div', 'set-ctl', row);
    const def = defaults[f.key];
    let api_;
    switch (f.kind) {
      case 'num': {
        const i = numInput(f.key, s, ctl); i.id = id;
        if (f.unit) el('span', 'unit', ctl, f.unit);
        i.oninput = markDirty;
        // Empty stays '' so the bridge rejects it (NaN would serialise as null = "default").
        api_ = { get: () => (i.value.trim() === '' ? '' : Number(i.value)), set: (v) => { i.value = v; } };
        break;
      }
      case 'range': {
        const i = el('input', '', ctl); i.type = 'range'; i.id = id; i.min = s.min; i.max = s.max; i.step = 1;
        const out = el('output', 'unit', ctl);
        const show = () => { out.textContent = `%${i.value}`; };
        i.oninput = () => { show(); markDirty(); };
        api_ = { get: () => Number(i.value), set: (v) => { i.value = v; show(); } };
        break;
      }
      case 'toggle': {
        const lab = el('label', 'switch', ctl);
        const i = el('input', '', lab); i.type = 'checkbox'; i.id = id;
        const txt = el('span', '', lab);
        const show = () => { txt.textContent = i.checked ? 'Açık' : 'Kapalı'; };
        i.onchange = () => { show(); markDirty(); };
        api_ = { get: () => i.checked, set: (v) => { i.checked = !!v; show(); } };
        break;
      }
      case 'text': {
        const i = el('input', '', ctl); i.type = 'text'; i.id = id; i.maxLength = s.max; i.spellcheck = false;
        i.oninput = markDirty;
        api_ = { get: () => i.value.trim(), set: (v) => { i.value = v; } };
        break;
      }
      case 'pace': {
        const sel = el('select', '', ctl); sel.id = id;
        for (const k of s.values) sel.add(new Option(PACE_LABEL[k] || k, k));
        const adv = el('details', 'set-adv', row);
        el('summary', '', adv, 'Gelişmiş: seçeneklerin sayıları');
        const tbl = el('table', 'set-table', adv);
        const hr = el('tr', '', el('thead', '', tbl));
        for (const h of ['', 'Saldırı aralığı', 'Savaş süresi', 'Ordu hızı (piyade / şövalye / atlı)']) el('th', '', hr, h);
        const tb = el('tbody', '', tbl);
        const rows = {};
        for (const k of s.values) {
          const p = paces?.[k];
          const tr = el('tr', '', tb);
          rows[k] = tr;
          el('td', '', tr, PACE_LABEL[k] || k);
          el('td', '', tr, p ? `${fmt(p.attackIntervalSec)} sn` : '–');
          el('td', '', tr, p ? `${fmt(p.battleSec)} sn` : '–');
          el('td', '', tr, p ? `${fmt(p.speed.infantry)} / ${fmt(p.speed.knight)} / ${fmt(p.speed.cavalry)}` : '–');
        }
        const show = () => { for (const [k, tr] of Object.entries(rows)) tr.classList.toggle('on', k === sel.value); };
        sel.onchange = () => { show(); markDirty(); };
        api_ = { get: () => sel.value, set: (v) => { sel.value = v; show(); } };
        break;
      }
      case 'strip': {
        const tbl = el('table', 'set-table strip', ctl);
        const hr = el('tr', '', el('thead', '', tbl));
        for (const h of ['', 'Hediye adı', 'Jeton', 'Etki yazısı']) el('th', '', hr, h);
        const tb = el('tbody', '', tbl);
        const cells = [];
        for (let n = 0; n < s.count; n++) {
          const tr = el('tr', '', tb);
          el('td', 'muted', tr, `${n + 1}.`);
          const name = el('input', '', el('td', '', tr)); name.type = 'text'; name.maxLength = s.nameMax; name.placeholder = '(jeton değeri yazsın)';
          const coins = el('input', '', el('td', '', tr)); coins.type = 'number'; coins.min = s.coinsMin; coins.max = s.coinsMax; coins.step = 1;
          const effect = el('input', '', el('td', '', tr)); effect.type = 'text'; effect.maxLength = s.effectMax;
          for (const i of [name, coins, effect]) i.oninput = markDirty;
          cells.push({ name, coins, effect });
        }
        api_ = {
          get: () => cells.map((c) => ({ name: c.name.value.trim(), coins: c.coins.value.trim() === '' ? '' : Number(c.coins.value), effect: c.effect.value.trim() })),
          set: (v) => cells.forEach((c, n) => { c.name.value = v[n]?.name ?? ''; c.coins.value = v[n]?.coins ?? ''; c.effect.value = v[n]?.effect ?? ''; }),
        };
        break;
      }
      case 'curve': {
        const wrap = el('div', 'curve', ctl);
        const cells = (s.coins || CURVE_COINS).map((c) => {
          const lab = el('label', '', wrap, `${c.toLocaleString('tr-TR')} jeton`);
          const i = el('input', '', lab); i.type = 'number'; i.min = s.min; i.max = s.max; i.step = 1;
          i.oninput = markDirty;
          return i;
        });
        el('span', 'unit', wrap, 'asker');
        api_ = { get: () => cells.map((i) => (i.value.trim() === '' ? '' : Number(i.value))), set: (v) => cells.forEach((i, n) => { i.value = v[n] ?? ''; }) };
        break;
      }
      default: return;
    }
    el('p', 'hint', row, `${f.hint} Varsayılan: ${describeDefault(f, def)}.`);
    inputs.set(f.key, api_);
  }

  function describeDefault(f, v) {
    switch (f.kind) {
      case 'toggle': return v ? 'açık' : 'kapalı';
      case 'pace': return PACE_LABEL[v] || v;
      case 'range': return `%${v}`;
      case 'text': return `"${v}"`;
      case 'strip': return v.map((g) => `${g.name || '(ad yok)'} ${g.coins} jeton`).join(', ');
      case 'curve': return v.map((n, i) => `${CURVE_COINS[i]}→${n}`).join(', ');
      default: return `${fmt(v)}${f.unit ? ' ' + f.unit : ''}`;
    }
  }

  // ---------------------------------------------------------------- data
  function fill() {
    for (const [key, ctl] of inputs) ctl.set(key in current ? current[key] : defaults[key]);
    dirty = false;
  }

  function collect() {
    const values = {};
    for (const [key, ctl] of inputs) values[key] = ctl.get();
    return values;
  }

  async function save(okText = 'Kaydedildi') {
    say('Kaydediliyor…');
    try {
      const r = await api('settings', { values: collect() });
      current = r.values; dirty = false; fill();
      const n = r.pages?.game ?? 0;
      say(n ? `${okText} ✓ ${n} oyun sayfasına gönderildi.` : `${okText} ✓ Şu an bağlı oyun sayfası yok; oyun açılınca uygulanır.`, 'ok');
      renderPages(r.pages);
    } catch (e) { say(e.message, 'bad'); }
  }

  async function reset() {
    if (!confirm('Bütün oyun ayarları varsayılana dönsün mü?')) return;
    try {
      const r = await api('settings/reset', {});
      current = r.values; fill();
      say('Varsayılana dönüldü ✓', 'ok');
    } catch (e) { say(e.message, 'bad'); }
  }

  function renderPages(p) {
    const e = $('set-pages');
    if (!p) { e.textContent = ''; return; }
    const g = p.game || 0;
    let t = g ? `Bağlı oyun sayfası: ${g}` : 'Bağlı oyun sayfası yok (oyun açık değil ya da köprüye bağlanamıyor)';
    if (p.other) t += ` · diğer bağlantı: ${p.other}`;
    e.textContent = t;
    e.className = 'set-pages ' + (g ? 'ok' : 'warn');
  }

  async function load() {
    const r = await api('settings');
    schema = r.schema; defaults = r.defaults; paces = r.paces; current = r.values || {};
    build(); fill(); renderPages(r.pages);
  }

  $('set-save').onclick = () => save();
  $('set-reset').onclick = () => reset();

  let loaded = false;
  const tryLoad = () => load().then(() => { loaded = true; }).catch(() => { /* bridge down: banner shows it */ });
  tryLoad();

  return {
    /** A settings message from the bridge (saved here or from another panel). */
    onRemote(msg) {
      if (!loaded) { tryLoad(); return; }
      current = msg.values || {};
      if (!dirty) fill();
    },
    /** Periodic /api/state result: refresh the connected-pages line. */
    onState(s) {
      if (!loaded) tryLoad();
      renderPages(s.pages);
    },
  };
}
