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
      { key: 'gifts.strip', kind: 'strip', label: 'Hediye merdiveni (haritanın altı)', hint: 'En ucuzdan pahalıya 1-12 hediye; ekranda sayfa sayfa döner. Hediye adı izleyicinin TikTok\'ta gördüğü ad olmalı (boş bırakılırsa jeton değeri yazar). "+N asker" kısmı asker eğrisinden otomatik gelir; etki yazısını siz yazarsınız. Etkiyi jeton değeri belirler, ad değil. "Listeden seç" yayında görülen hediyeleri gösterir: resim, ad ve fiyat hazır gelir.' },
      { key: 'gifts.heading', kind: 'text', label: 'Merdiven başlığı', hint: 'Yayın görünümünde hediye merdiveninin üstündeki sarı sekme (ör. HEDİYE AT, ORDU KUR).' },
      { key: 'gifts.showTroops', kind: 'toggle', label: 'Kutularda asker sayısı', hint: 'Açıksa her hediye kutusunda "+N asker" yazar (sayı asker eğrisinden gelir).' },
      { key: 'gifts.curve', kind: 'curve', label: 'Hediye başına asker', hint: 'Tek bir hediyenin jeton değerine göre kaç asker verdiği. Aradaki değerler bu noktalardan hesaplanır; sayılar artan sırada olmalı.' },
    ],
  },
  {
    id: 'bedava', title: 'Bedava hareketler',
    fields: [
      { key: 'engage.chatTroops', kind: 'num', label: 'Mesaj başına asker', unit: 'asker', hint: 'Takımdaki bir izleyici her yorum yazdığında şehrine giden asker.' },
      { key: 'engage.chatCooldownSec', kind: 'num', label: 'Mesaj bekleme süresi', unit: 'saniye', hint: 'Aynı izleyicinin mesajı en fazla bu sıklıkla asker verir.' },
      { key: 'engage.chatTroopCap', kind: 'num', label: 'Mesajdan en çok asker', unit: 'asker / tur', hint: 'Bir izleyicinin bir turda yorumlardan alabileceği en çok asker (son 30 sn ve isyan katları dahil). Dolunca izleyiciye bir kez "bedava hakkın doldu" notu çıkar. 0 = sınırsız.' },
      { key: 'troops.followBonus', kind: 'num', label: 'Takip bonusu', unit: 'asker', hint: 'Takip eden izleyicinin şehrine giden asker.' },
      { key: 'troops.shareBonus', kind: 'num', label: 'Paylaşım bonusu', unit: 'asker', hint: 'Yayını paylaşan izleyicinin şehrine giden asker.' },
      { key: 'engage.likesPerTroop', kind: 'num', label: 'Kaç beğeni = 1 asker', unit: 'beğeni', hint: 'Takımdaki izleyicinin her bu kadar beğenisi şehrine 1 asker verir; haritada "❤ +N" olarak çıkar (0 = beğeni asker vermez, yalnızca moral). Ekrandaki "1 GÜL = N BEĞENİ" satırı bundan hesaplanır.' },
      { key: 'engage.likeTroopCap', kind: 'num', label: 'Beğeniden en çok asker', unit: 'asker / tur', hint: 'Bir izleyicinin bir turda beğenilerden alabileceği en çok asker. Sınırdan sonra beğeniler yalnızca HÜCUM barını doldurur (o sınırsızdır). 0 = sınırsız.' },
      { key: 'engage.likeMilestone', kind: 'num', label: 'Beğeni isim aralığı', unit: 'beğeni', hint: 'İzleyici turda her bu kadar beğeniye ulaşınca adı şehrinde çıkar (ör. "Ahmet · 50 beğeni").' },
      { key: 'engage.pendingLikesMax', kind: 'num', label: 'Katılmadan önceki beğeniler', unit: 'beğeni', hint: 'Plaka yazmadan beğenen izleyicinin beğenileri, katılınca en fazla bu kadarı sayılır (0 = sayılmaz).' },
      { key: 'show.hucumBar', kind: 'toggle', label: 'HÜCUM çubuğu', hint: 'Haritanın altında HÜCUM\'a en yakın şehrin moral çubuğu (ör. "İSTANBUL HÜCUM %80"). Ekran bölümündeki ile aynı ayar.' },
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
      { key: 'show.giftStrip', kind: 'toggle', label: 'Hediye şeridi', hint: 'En alttaki hediye merdiveni (sayfa sayfa döner).' },
      { key: 'show.hucumBar', kind: 'toggle', label: 'HÜCUM çubuğu', hint: 'Haritanın altındaki "İSTANBUL HÜCUM %80" çubuğu.' },
      { key: 'show.minimap', kind: 'toggle', label: 'Küçük harita', hint: 'Kamera yakınlaşınca köşede çıkan Türkiye haritası.' },
      { key: 'layout.chatTop', kind: 'num', label: 'Sohbet çizgisi', unit: 'birim (1920 üzerinden)', hint: 'Yayın görünümünde her şey bu çizginin üstünde kalır; altı TikTok sohbetine ayrılır. Telefonda sohbet hediye merdivenini ya da "PLAKANI YAZ" satırını kapatıyorsa küçültün, boşluk kalıyorsa büyütün (1150-1500). Kontrol: oyun adresine ?zones=1 ekleyin.' },
      { key: 'layout.side', kind: 'num', label: 'Yan boşluk', unit: 'birim', hint: 'Uzun ekranlı telefonlarda yayının sağı ve solu kırpılır; kutular kenardan bu kadar içeride durur (0-120).' },
      { key: 'cta.text', kind: 'text', label: 'Çağrı yazısı', hint: 'Haritanın altındaki kırmızı çağrının yazısı.' },
      { key: 'cta.example', kind: 'text', label: 'Çağrı örneği', hint: 'Çağrının yanındaki örnek kutu (ör. plaka).' },
      { key: 'title.text', kind: 'text', label: 'Başlık yazısı', hint: 'En üstteki logo. İlk kelime plakanın içinde, gerisi yanında yazar (ör. "PLAKA SAVAŞLARI"). TikTok\'un üst çubuğu çoğunu kapatır; süs içindir.' },
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
  'show.hucumBar': true,
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
  const peers = new Map(); // key -> controls (a key shown in two groups, e.g. show.hucumBar)
  // TikTok room gift list from the bridge (GET /api/gifts, { type: "gifts" } over /ws).
  let catalog = { items: [], ts: 0, source: '' };
  let catalogNote = null; let stripPreview = null; let picker = null;

  const catalogIcon = (id) => catalog.items.find((x) => x.id === id)?.icon || '';
  const nameKey = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, '');
  const when = (ms) => (ms ? new Date(ms).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '');
  /** "Gül (Rose)" when the bridge knows the Turkish app name, else TikTok's name. */
  const bothNames = (it) => (it.tr && nameKey(it.tr) !== nameKey(it.name) ? `${it.tr} (${it.name})` : it.name);
  /**
   * Catalogue gift for a ladder row: by its id, otherwise by name (Turkish or English) at the
   * same price; the game does the same (game/js/gift-names.js), so the row learns its id.
   */
  function resolveRow(name, coins, id) {
    if (id) {
      const it = catalog.items.find((x) => x.id === id);
      return it ? { item: it, auto: false } : null;
    }
    const k = nameKey(name);
    if (!k) return null;
    const it = catalog.items.find((x) => x.coins === coins && (nameKey(x.name) === k || nameKey(x.tr) === k));
    return it ? { item: it, auto: true } : null;
  }
  function renderCatalogNote() {
    if (!catalogNote) return;
    if (!catalog.items.length) {
      catalogNote.textContent = 'Henüz hediye görülmedi. Liste, canlı yayında izleyiciler hediye gönderdikçe kendiliğinden dolar ve kaydedilir. O zamana kadar ad ve jetonu elle yazın.';
      return;
    }
    const src = catalog.source === 'live' ? ' (TikTok oda listesi + yayında görülenler)' : catalog.source === 'test' ? ' (test verisi)' : '';
    catalogNote.textContent = `Şimdiye kadar görülen hediyeler: ${catalog.items.length}${src} · son değişiklik: ${when(catalog.ts) || 'bilinmiyor'}. "Listeden seç" ile resim, ad ve fiyat hazır gelir; liste izleyiciler hediye gönderdikçe büyür.`;
  }
  function setCatalog(c) {
    catalog = { items: Array.isArray(c?.items) ? c.items : [], ts: Number(c?.ts) || 0, source: String(c?.source || '') };
    renderCatalogNote();
    stripPreview?.();
  }
  async function loadCatalog() {
    try { setCatalog(await api('gifts')); } catch { setCatalog(null); }
  }

  /** Troops for ONE gift (same log-log curve as the game) from the curve inputs, for the preview. */
  function previewTroops(coins) {
    const cur = inputs.get('gifts.curve')?.get() || defaults?.['gifts.curve'] || [];
    const pts = CURVE_COINS.map((c, i) => [c, Number(cur[i]) || Number(defaults?.['gifts.curve']?.[i]) || 1]);
    const c = Math.max(1, coins);
    if (c <= pts[0][0]) return Math.round(pts[0][1] * c / pts[0][0]);
    let i = 1;
    while (i < pts.length - 1 && c > pts[i][0]) i++;
    const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
    return Math.round(y0 * Math.pow(y1 / y0, Math.log(c / x0) / Math.log(x1 / x0)));
  }

  /** Small searchable list of TikTok's gifts (icon, name, coin price) under a button. */
  function openPicker(anchor, onPick) {
    picker?.remove();
    if (picker?._anchor === anchor) { picker = null; return; }
    const box = el('div', 'gift-picker');
    box._anchor = anchor;
    picker = box;
    el('strong', 'gp-title', box, 'Şimdiye kadar görülen hediyeler');
    if (!catalog.items.length) {
      el('p', 'hint', box, 'Henüz hediye görülmedi. Liste, canlı yayında izleyiciler hediye gönderdikçe dolar. Şimdilik ad ve jetonu elle yazın.');
    } else {
      el('p', 'hint', box, 'Liste, izleyiciler hediye gönderdikçe dolar; burada olmayan bir hediyeyi elle yazabilirsiniz.');
      const q = el('input', '', box); q.type = 'search'; q.placeholder = 'Ara (Türkçe/İngilizce ad ya da jeton)…';
      const list = el('div', 'gift-picker-list', box);
      const render = () => {
        const t = q.value.trim().toLocaleLowerCase('tr');
        list.replaceChildren();
        for (const it of catalog.items) {
          if (t && !it.name.toLocaleLowerCase('tr').includes(t) && !String(it.tr || '').toLocaleLowerCase('tr').includes(t) && String(it.coins) !== t) continue;
          const b = el('button', 'gift-picker-item', list); b.type = 'button';
          const img = el('img', '', b); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.loading = 'lazy';
          if (it.icon) img.src = it.icon; else img.style.visibility = 'hidden';
          img.onerror = () => { img.style.visibility = 'hidden'; };
          const nm = el('span', 'gp-name', b, bothNames(it));
          el('small', 'gp-seen', nm, it.seen ? `son görülme: ${when(it.seen)}` : 'TikTok listesinden (yayında görülmedi)');
          el('span', 'gp-coins', b, `${it.coins.toLocaleString('tr-TR')} jeton · #${it.id}`);
          b.onclick = () => { onPick(it); box.remove(); picker = null; };
        }
        if (!list.childElementCount) el('p', 'hint', list, 'Eşleşen hediye yok.');
      };
      q.oninput = render;
      render();
      setTimeout(() => q.focus(), 0);
    }
    const close = el('button', 'small', box, 'Kapat'); close.type = 'button';
    close.onclick = () => { box.remove(); picker = null; };
    anchor.closest('.strip-row').append(box);
  }

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
    peers.clear(); inputs.clear();
    for (const g of GROUPS) {
      const fs = el('fieldset', 'set-group', root);
      el('legend', '', fs, g.title);
      if (g.intro) el('p', 'hint', fs, g.intro);
      if (g.id === 'tur') buildCommands(fs);
      if (g.id === 'ekran') {
        const row = el('div', 'row wrap', fs);
        const b = el('button', '', row, 'Sade görünüm');
        b.type = 'button';
        b.title = 'Yalnızca süre, lider kartı, talimat satırı, harita, HÜCUM çubuğu, çağrı ve hediye şeridi kalır.';
        b.onclick = () => { for (const [k, v] of Object.entries(PLAIN)) inputs.get(k)?.set(v); save('Sade görünüm uygulandı'); };
        const all = el('button', '', row, 'Hepsini göster');
        all.type = 'button';
        all.onclick = () => { for (const k of Object.keys(PLAIN)) inputs.get(k)?.set(true); save('Bütün kutular açıldı'); };
        el('span', 'muted', row, 'Sade: süre, lider kartı, talimat satırı, harita, HÜCUM çubuğu, çağrı ve hediye şeridi.');
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
    const id = 'set-' + f.key.replace(/\W/g, '-') + (peers.has(f.key) ? '-2' : '');
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
        api_ = { get: () => i.checked, set: (v) => { i.checked = !!v; show(); } };
        const self = api_;
        i.onchange = () => {
          show(); markDirty();
          for (const p of peers.get(f.key) || []) if (p !== self) p.set(i.checked); // same key elsewhere
          if (f.key === 'gifts.showTroops') stripPreview?.();
        };
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
        // Gift ladder: 1..maxCount rows (add / remove / reorder). A row picked from TikTok's
        // gift list keeps its id (the game then shows the real gift picture).
        const note = el('p', 'hint gift-cat-note', ctl);
        catalogNote = note;
        const tb = el('div', 'strip-rows', ctl);
        const addBtn = el('button', '', ctl, '+ Hediye ekle');
        addBtn.type = 'button';
        let rows = [];
        const preview = () => {
          for (const r of rows) {
            const c = Number(r.coins.value);
            const t = c >= 1 ? previewTroops(c) : 0;
            const showN = inputs.get('gifts.showTroops')?.get() !== false;
            r.out.textContent = c >= 1 ? `${showN ? `+${t.toLocaleString('tr-TR')} asker` : ''}${showN && r.effect.value.trim() ? ', ' : ''}${r.effect.value.trim()}` : '–';
            // Learn the id from the seen gifts (same name, same price) and flag a wrong price.
            const res = resolveRow(r.name.value.trim(), c, r.id);
            r.autoId = res?.auto ? res.item.id : 0;
            const id = r.id || r.autoId;
            r.idTag.textContent = id ? `#${id}${r.autoId ? ' (otomatik)' : ''}` : '';
            r.idTag.title = r.autoId
              ? 'TikTok hediye kimliği, yayında aynı ad ve fiyatla görülen hediyeden otomatik bulundu; "Kaydet" ile saklanır.'
              : id ? 'TikTok hediye kimliği. Resim ve gerçek fiyat buna göre bulunur.' : '';
            const it = res?.item;
            r.enTag.textContent = it && nameKey(it.name) !== nameKey(r.name.value) ? `TikTok: ${it.name}` : '';
            r.img.style.display = it?.icon ? '' : 'none';
            if (it?.icon && r.img.src !== it.icon) r.img.src = it.icon;
            const wrong = it && !r.plus.checked && c >= 1 && it.coins !== c;
            r.priceNote.textContent = wrong ? `Not: TikTok bu hediyeyi ${it.coins.toLocaleString('tr-TR')} jeton olarak bildiriyor; ekranda gerçek fiyat gösterilir.` : '';
            r.priceNote.style.display = wrong ? '' : 'none';
          }
          addBtn.disabled = rows.length >= s.maxCount;
        };
        stripPreview = preview;
        const renumber = () => rows.forEach((r, n) => { r.num.textContent = `${n + 1}.`; r.up.disabled = n === 0; r.down.disabled = n === rows.length - 1; r.del.disabled = rows.length <= s.minCount; });
        const addRow = (g = {}) => {
          const tr = el('div', 'strip-row', tb);
          const r = { tr, id: Number(g.id) > 0 ? Number(g.id) : 0 };
          const l1 = el('div', 'strip-l1', tr);
          r.num = el('span', 'muted strip-num', l1);
          const nameTd = el('span', 'gift-name-td', l1);
          r.img = el('img', 'gift-pick-img', nameTd); r.img.alt = ''; r.img.referrerPolicy = 'no-referrer'; r.img.style.display = 'none';
          r.img.onerror = () => { r.img.style.display = 'none'; };
          r.name = el('input', '', nameTd); r.name.type = 'text'; r.name.maxLength = s.nameMax; r.name.placeholder = '(jeton değeri yazsın)';
          r.idTag = el('span', 'muted gift-id', nameTd);
          r.enTag = el('span', 'muted gift-id', nameTd);
          const pick = el('button', 'small', nameTd, 'Listeden seç'); pick.type = 'button';
          pick.onclick = () => openPicker(pick, (it) => {
            r.id = it.id; r.name.value = (it.tr || it.name).slice(0, s.nameMax); r.coins.value = it.coins; r.plus.checked = false;
            markDirty(); preview();
          });
          r.pick = pick;
          const l2 = el('div', 'strip-l2', tr);
          const cl = el('label', 'strip-coins', l2, 'Jeton ');
          r.coins = el('input', '', cl); r.coins.type = 'number'; r.coins.min = s.coinsMin; r.coins.max = s.coinsMax; r.coins.step = 1;
          const pl = el('label', 'strip-plus', l2);
          r.plus = el('input', '', pl); r.plus.type = 'checkbox'; pl.append(' ve üstü'); r.plus.title = 'Bu değer ve üstü (ör. "1.000+ jeton")';
          const el_ = el('label', 'strip-effect', l2, 'Etki ');
          r.effect = el('input', '', el_); r.effect.type = 'text'; r.effect.maxLength = s.effectMax; r.effect.placeholder = 'ör. şövalye birliği';
          r.out = el('span', 'gift-out', l2);
          r.out.title = 'Ekranda böyle yazar';
          r.priceNote = el('p', 'hint gift-price-note', tr); r.priceNote.style.display = 'none';
          const act = el('span', 'row-act', l1);
          r.up = el('button', 'small', act, '↑'); r.down = el('button', 'small', act, '↓'); r.del = el('button', 'small danger', act, '✕');
          for (const b of [r.up, r.down, r.del]) b.type = 'button';
          r.up.title = 'Yukarı'; r.down.title = 'Aşağı'; r.del.title = 'Sil';
          const move = (d) => {
            const i = rows.indexOf(r); const j = i + d;
            if (j < 0 || j >= rows.length) return;
            rows.splice(i, 1); rows.splice(j, 0, r);
            tb.replaceChildren(...rows.map((x) => x.tr));
            renumber(); markDirty();
          };
          r.up.onclick = () => move(-1); r.down.onclick = () => move(1);
          r.del.onclick = () => { if (rows.length <= s.minCount) return; rows = rows.filter((x) => x !== r); tr.remove(); renumber(); preview(); markDirty(); };
          // Typing a different name drops the TikTok id (it no longer names the same gift).
          r.name.oninput = () => { r.id = 0; markDirty(); preview(); };
          r.coins.oninput = () => { markDirty(); preview(); };
          r.effect.oninput = () => { markDirty(); preview(); };
          r.plus.onchange = () => { markDirty(); preview(); };
          r.name.value = g.name ?? ''; r.coins.value = g.coins ?? ''; r.effect.value = g.effect ?? ''; r.plus.checked = g.plus === true;
          rows.push(r);
          return r;
        };
        addBtn.onclick = () => {
          if (rows.length >= s.maxCount) return;
          const last = rows[rows.length - 1];
          addRow({ coins: last ? Math.min(s.coinsMax, Number(last.coins.value) * 2 || 1) : 1, effect: last ? last.effect.value : '' });
          renumber(); preview(); markDirty();
        };
        api_ = {
          get: () => rows.map((r) => {
            const o = { name: r.name.value.trim(), coins: r.coins.value.trim() === '' ? '' : Number(r.coins.value), effect: r.effect.value.trim() };
            if (r.id || r.autoId) o.id = r.id || r.autoId;
            if (r.plus.checked) o.plus = true;
            return o;
          }),
          set: (v) => {
            tb.replaceChildren(); rows = [];
            for (const g of Array.isArray(v) ? v : []) addRow(g);
            renumber(); preview();
          },
        };
        break;
      }
      case 'curve': {
        const wrap = el('div', 'curve', ctl);
        const cells = (s.coins || CURVE_COINS).map((c) => {
          const lab = el('label', '', wrap, `${c.toLocaleString('tr-TR')} jeton`);
          const i = el('input', '', lab); i.type = 'number'; i.min = s.min; i.max = s.max; i.step = 1;
          i.oninput = () => { markDirty(); stripPreview?.(); };
          return i;
        });
        el('span', 'unit', wrap, 'asker');
        api_ = { get: () => cells.map((i) => (i.value.trim() === '' ? '' : Number(i.value))), set: (v) => cells.forEach((i, n) => { i.value = v[n] ?? ''; }) };
        break;
      }
      default: return;
    }
    el('p', 'hint', row, `${f.hint} Varsayılan: ${describeDefault(f, def)}.`);
    const list = peers.get(f.key) || [];
    list.push(api_);
    peers.set(f.key, list);
    inputs.set(f.key, list.length === 1 ? api_ : { get: api_.get, set: (v) => list.forEach((p) => p.set(v)) });
  }

  function describeDefault(f, v) {
    switch (f.kind) {
      case 'toggle': return v ? 'açık' : 'kapalı';
      case 'pace': return PACE_LABEL[v] || v;
      case 'range': return `%${v}`;
      case 'text': return `"${v}"`;
      case 'strip': return v.map((g) => `${g.name || '(ad yok)'} ${g.coins}${g.plus ? '+' : ''} jeton`).join(', ');
      case 'curve': return v.map((n, i) => `${CURVE_COINS[i]}→${n}`).join(', ');
      default: return `${fmt(v)}${f.unit ? ' ' + f.unit : ''}`;
    }
  }

  // ---------------------------------------------------------------- data
  function fill() {
    for (const [key, ctl] of inputs) ctl.set(key in current ? current[key] : defaults[key]);
    stripPreview?.(); // after the curve and the troop toggle are filled
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
    renderCatalogNote();
    loadCatalog();
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
    /** TikTok gift list pushed by the bridge ({ type: "gifts", ts, items }). */
    onGifts(msg) { setCatalog(msg); },
    /** Periodic /api/state result: refresh the connected-pages line. */
    onState(s) {
      if (!loaded) tryLoad();
      renderPages(s.pages);
    },
  };
}
