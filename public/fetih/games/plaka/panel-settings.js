// Plaka Savaşları panel module ("Plaka Savaşları ayarları" in the panel's Ayarlar area).
// Loaded by the panel through games/plaka/oyun.json -> panel.module. It edits this game's
// overrides stored by the bridge (GET/POST /api/settings?game=plaka, POST /api/settings/reset?game=plaka)
// and sends one-shot round commands (POST /api/command { name, game: "plaka" }). The bridge pushes
// saved settings to every connected Plaka Savaşları page. Stream-wide settings (TikTok zones,
// volumes) are in the panel's "Yayın ayarları", not here.
//
// Panel module contract (see games/README.md): export mount({ api, root, game }) returning
// { onRemote(msg), onGifts(msg), onState(state), destroy() }.

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
      { key: 'round.finaleSec', kind: 'num', label: '"2 kat" süresi', unit: 'saniye', hint: 'Turun son kaç saniyesinde hediyeler (ve açıksa etkileşim ödülleri) 2 kat sayılsın. 0 = kapalı; açıkken ekranda "2 kat" rozeti çıkar.' },
      { key: 'round.earlyWinPct', kind: 'num', label: 'Erken zafer', unit: '% il', hint: 'Bir şehir illerin bu kadarını alırsa tur hemen biter (100 = erken bitiş yok).' },
      { key: 'round.keepTeams', kind: 'toggle', label: 'Takımlar turlar arası kalsın', hint: 'Açıksa izleyiciler yeni turda yeniden plaka yazmadan aynı şehirde kalır.', nextRound: true },
    ],
  },
  {
    id: 'hiz', title: 'Hız',
    fields: [
      { key: 'pace', kind: 'pace', label: 'Oyun hızı', hint: 'Saldırı sıklığı, ordu hızı ve savaş süresi birlikte değişir.' },
      { key: 'war.momentum', kind: 'toggle', label: 'Büyük ordular ilerlesin', hint: 'Açıksa savaşı kazanan büyük ordu fethettiği ilde yeterli asker bırakır, kalanıyla kısa bir moladan sonra sıradaki komşuya yürür. Kapalıysa her ordu aldığı ilde kalır.' },
      { key: 'war.maxFronts', kind: 'num', label: 'Güçlü şehrin en çok cephesi', unit: 'cephe', hint: 'Çok asker toplayan bir şehir aynı anda en fazla bu kadar komşuya saldırır (sıradan şehirler hep tek cephe). Düşük = daha sakin harita.' },
    ],
  },
  {
    id: 'hediye', title: 'Hediyeler',
    fields: [
      { key: 'gifts.strip', kind: 'strip', label: 'Hediye merdiveni (haritanın altı)', hint: 'En ucuzdan pahalıya 1-16 hediye; ekranda sayfa sayfa döner. Hediye adı izleyicinin TikTok\'ta gördüğü ad olmalı (boş bırakılırsa jeton değeri yazar). "+N asker" kısmı asker eğrisinden otomatik gelir; etki yazısını siz yazarsınız. Etkiyi jeton değeri belirler, ad değil. "Listeden seç" yayında görülen hediyeleri gösterir: resim, ad ve fiyat hazır gelir.' },
      { key: 'gifts.heading', kind: 'text', label: 'Merdiven başlığı', hint: 'Yayın görünümünde hediye merdiveninin üstündeki sarı sekme. Açıklayıcı tutun (ör. HEDİYELER VE ORDULAR); "hediye at" gibi emir kipleri TikTok\'ta kısıtlamaya yol açabilir.' },
      { key: 'gifts.showTroops', kind: 'toggle', label: 'Kutularda asker sayısı', hint: 'Açıksa her hediye kutusunda "+N asker" yazar (sayı asker eğrisinden gelir).' },
      { key: 'gifts.curve', kind: 'curve', label: 'Hediye başına asker', hint: 'Tek bir hediyenin jeton değerine göre kaç asker verdiği. Aradaki değerler bu noktalardan hesaplanır; sayılar artan sırada olmalı.' },
    ],
  },
  {
    id: 'moral', title: 'Beğeni ve moral',
    intro: 'Beğeniler şehrin HÜCUM moralini doldurur; asker vermez (aşağıdaki ödüller kapalıyken).',
    fields: [
      { key: 'show.hucumBar', kind: 'toggle', label: 'HÜCUM çubuğu', hint: 'Haritanın altında HÜCUM\'a en yakın şehrin moral çubuğu (ör. "İSTANBUL HÜCUM %80"). Ekran bölümündeki ile aynı ayar.' },
      { key: 'morale.likeSpeed', kind: 'num', label: 'Beğeni moral hızı', unit: 'kat', hint: 'Beğenilerin HÜCUM moralini ne kadar hızlı doldurduğu (1 = normal, 2 = iki kat hızlı).' },
      { key: 'engage.likeMaxPerSec', kind: 'num', label: 'Beğeni hız sınırı', unit: 'beğeni / sn', hint: 'Hileye karşı: bir izleyicinin saniyede en fazla bu kadar beğenisi sayılır (kısa ataklara pay vardır). Elle hızlı basan sınırın altında kalır; otomatik tıklayıcının fazlası HÜCUM\'a ve beğenenler tablosuna yansımaz. 0 = sınırsız.' },
      { key: 'engage.likeMilestone', kind: 'num', label: 'Beğeni isim aralığı', unit: 'beğeni', hint: 'İzleyicinin adı şehrinde ara ara "hücumu dolduruyor" olarak çıkar (sayı göstermez, sıklığı sınırlıdır); bu, kaç beğenide bir çıkabileceğidir.' },
    ],
  },
  {
    id: 'odul', title: 'Etkileşim ödülleri (TikTok kısıtlayabilir)', collapsed: true,
    warn: 'TikTok, beğeni, yorum, takip veya paylaşım karşılığı ödül veren yayınların görünürlüğünü kısıtlayabilir. Varsayılan hepsi 0 (kapalı); açarsanız ekrandaki ilgili yazılar da geri gelir.',
    fields: [
      { key: 'engage.chatTroops', kind: 'num', label: 'Mesaj başına asker', unit: 'asker', hint: 'Takımdaki bir izleyici her yorum yazdığında şehrine giden asker; haritada "+N" ve durum satırında "HER MESAJ +N ASKER" çıkar. 0 = mesaj asker vermez, ekranda hiçbir şey göstermez.' },
      { key: 'engage.chatCooldownSec', kind: 'num', label: 'Mesaj bekleme süresi', unit: 'saniye', hint: 'Aynı izleyicinin mesajı en fazla bu sıklıkla asker verir.' },
      { key: 'engage.chatTroopCap', kind: 'num', label: 'Mesajdan en çok asker', unit: 'asker / tur', hint: 'Bir izleyicinin bir turda yorumlardan alabileceği en çok asker ("2 kat" ve isyan katları dahil). Dolunca izleyiciye bir kez "bedava hakkın doldu" notu çıkar. 0 = sınırsız.' },
      { key: 'troops.followBonus', kind: 'num', label: 'Takip bonusu', unit: 'asker', hint: 'Takip eden izleyicinin şehrine giden asker; ekranda teşekkür şeridi çıkar. 0 = takip ekranda hiçbir şey göstermez.' },
      { key: 'troops.shareBonus', kind: 'num', label: 'Paylaşım bonusu', unit: 'asker', hint: 'Yayını paylaşan izleyicinin şehrine giden asker. 0 = paylaşım asker vermez ve ekranda hiçbir şey göstermez.' },
      { key: 'engage.likesPerTroop', kind: 'num', label: 'Kaç beğeni = 1 asker', unit: 'beğeni', hint: 'Takımdaki izleyicinin her bu kadar beğenisi şehrine 1 asker verir; haritada "❤ +N", durum satırında "1 GÜL = N BEĞENİ" çıkar. 0 = beğeni asker vermez, yalnızca HÜCUM moralini doldurur.' },
      { key: 'engage.likeTroopCap', kind: 'num', label: 'Beğeniden en çok asker', unit: 'asker / tur', hint: 'Bir izleyicinin bir turda beğenilerden alabileceği en çok asker. Sınırdan sonra beğeniler yalnızca HÜCUM barını doldurur (o sınırsızdır). 0 = sınırsız.' },
      { key: 'engage.pendingLikesMax', kind: 'num', label: 'Katılmadan önceki beğeniler', unit: 'beğeni', hint: 'Beğeni asker verirken: plaka yazmadan beğenen izleyicinin beğenileri, katılınca en fazla bu kadarı sayılır (0 = sayılmaz).' },
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
      { key: 'show.imperative', kind: 'toggle', label: 'Durum satırı', hint: 'Haritanın üstündeki oyun durumu yazısı (ör. "İstanbul sınırda baskı altında", "Son 30 saniye").' },
      { key: 'show.giftStrip', kind: 'toggle', label: 'Hediye şeridi', hint: 'En alttaki hediye merdiveni (sayfa sayfa döner).' },
      { key: 'show.hucumBar', kind: 'toggle', label: 'HÜCUM çubuğu', hint: 'Haritanın altındaki "İSTANBUL HÜCUM %80" çubuğu.' },
      { key: 'show.minimap', kind: 'toggle', label: 'Küçük harita', hint: 'Kamera yakınlaşınca köşede çıkan Türkiye haritası.' },
      { key: 'cta.text', kind: 'text', label: 'Katılım yazısı', hint: 'Haritanın altındaki tek, sakin katılım satırı. Bağırmayan, açıklayıcı tutun.' },
      { key: 'cta.example', kind: 'text', label: 'Katılım örneği', hint: 'Katılım yazısının yanındaki örnek kutu (ör. plaka).' },
      { key: 'title.text', kind: 'text', label: 'Başlık yazısı', hint: 'En üstteki logo. İlk kelime plakanın içinde, gerisi yanında yazar (ör. "PLAKA SAVAŞLARI"). TikTok\'un üst çubuğu çoğunu kapatır; süs içindir.' },
    ],
  },
  {
    id: 'kamera', title: 'Kamera',
    fields: [
      { key: 'camera.director', kind: 'toggle', label: 'Otomatik kamera', hint: 'Büyük hediyelerde ve önemli anlarda kamera yakınlaşsın.' },
    ],
  },
];

// "Sade görünüm": only timer, leader card, status line, map, join line and gift strip.
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

export function mount({ api, root: host, game }) {
  const gid = game?.id || 'plaka';
  const q = `?game=${encodeURIComponent(gid)}`;
  // Own DOM inside the host element: pages line, intro, the form, save / reset.
  host.replaceChildren();
  const pagesEl = el('div', 'set-pages', host);
  el('p', 'hint', host, 'Değişiklikler "Kaydet"e basınca bu oyunun açık sayfalarına hemen gönderilir ve köprü kapanıp açılsa da saklanır. Oyun yayında değilken de hazırlanabilir; yayına alınınca uygulanır.');
  const root = el('div', 'settings-form', host);
  root.append(el('p', 'muted', null, 'Ayarlar yükleniyor…'));
  const actions = el('div', 'row wrap set-actions', host);
  const saveBtn = el('button', 'primary', actions, 'Kaydet'); saveBtn.type = 'button';
  const resetBtn = el('button', '', actions, 'Varsayılana dön'); resetBtn.type = 'button';
  const msgEl = el('span', 'set-msg', actions);
  msgEl.setAttribute('role', 'status'); msgEl.setAttribute('aria-live', 'polite');
  let schema = null; let defaults = null; let paces = null; let giftInfo = null;
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
   * same price; the game does the same (shared/gift-names.js), so the row learns its id.
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
    // Points above 5000 coins: the config's, scaled with the 5000 value (as game/js/settings.js does).
    const p5 = pts[pts.length - 1][1];
    const k = giftInfo?.curveBase5000 > 0 ? p5 / giftInfo.curveBase5000 : 1;
    for (const [x, y] of giftInfo?.curveTail || []) pts.push([x, Math.max(p5, Math.round(y * k))]);
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
      let fs;
      if (g.collapsed) {
        // A closed block with its own warning line (engagement rewards: off by default).
        fs = el('details', 'set-group set-collapsed', root);
        el('summary', '', fs, g.title);
      } else {
        fs = el('fieldset', 'set-group', root);
        el('legend', '', fs, g.title);
      }
      if (g.warn) el('p', 'set-warn', fs, `⚠ ${g.warn}`);
      if (g.intro) el('p', 'hint', fs, g.intro);
      if (g.id === 'tur') buildCommands(fs);
      if (g.id === 'hediye') buildGiftOverview(fs);
      if (g.id === 'ekran') {
        const row = el('div', 'row wrap', fs);
        const b = el('button', '', row, 'Sade görünüm');
        b.type = 'button';
        b.title = 'Yalnızca süre, lider kartı, durum satırı, harita, HÜCUM çubuğu, katılım satırı ve hediye şeridi kalır.';
        b.onclick = () => { for (const [k, v] of Object.entries(PLAIN)) inputs.get(k)?.set(v); save('Sade görünüm uygulandı'); };
        const all = el('button', '', row, 'Hepsini göster');
        all.type = 'button';
        all.onclick = () => { for (const k of Object.keys(PLAIN)) inputs.get(k)?.set(true); save('Bütün kutular açıldı'); };
        el('span', 'muted', row, 'Sade: süre, lider kartı, durum satırı, harita, HÜCUM çubuğu, katılım satırı ve hediye şeridi.');
      }
      for (const f of g.fields) buildField(fs, f);
    }
  }

  // ---------------------------------------------------------------- gift overview
  // "Hediyeler" table at the top of the gifts section: every ladder entry in price order with
  // its picture, TikTok name, price, in-game name (the label the owner also types next to the
  // gift in LIVE Studio, with a copy button), what it does and the troops it gives. It follows
  // the editor below live (unsaved edits included).
  let overviewEl = null;
  const gameUrl = (rel) => (rel ? new URL(rel, import.meta.url).href : '');
  function injectOverviewCss() {
    if (document.getElementById('plaka-gift-ov-css')) return;
    const st = document.createElement('style');
    st.id = 'plaka-gift-ov-css';
    st.textContent = `
.gift-ov { margin: 2px 0 12px; }
.gift-ov table { width: 100%; border-collapse: collapse; font-size: 14px; }
.gift-ov th { text-align: left; font-weight: 600; color: #9aa4b8; border-bottom: 1px solid #2a3040; padding: 4px 6px; white-space: nowrap; }
.gift-ov td { border-bottom: 1px solid #222838; padding: 4px 6px; vertical-align: middle; }
.gift-ov tr:last-child td { border-bottom: 0; }
.gift-ov .gov-icon { width: 40px; }
.gift-ov .gov-icon img { width: 32px; height: 32px; object-fit: contain; display: block; }
.gift-ov .gov-icon img.own { opacity: .75; }
.gift-ov .gov-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.gift-ov .gov-label { white-space: nowrap; }
.gift-ov .gov-label strong { margin-right: 6px; }
.gift-ov .gov-name small, .gift-ov .gov-does small { display: block; color: #8a93a6; font-size: 12px; }
.gift-ov .gov-copied { color: #7fd68a; font-size: 12px; margin-left: 4px; }
.gift-ov-wrap { overflow-x: auto; }
`;
    document.head.append(st);
  }
  function buildGiftOverview(parent) {
    injectOverviewCss();
    const box = el('div', 'gift-ov', parent);
    el('h4', '', box, 'Hediye listesi');
    el('p', 'hint', box, 'Merdivendeki her hediye, fiyat sırasıyla. "Oyundaki adı", LIVE Studio\'da o hediyenin yanına yazacağınız etikettir: "kopyala" ile alıp oraya yapıştırın. Resim ve adı bilinmeyen hediyeler, izleyiciler o fiyatta bir hediye gönderince kendiliğinden dolar.');
    overviewEl = el('div', 'gift-ov-wrap', box);
  }
  /** Gift step (gifts.tiers) for a coin value: the highest minCoins at or below it. */
  const tierFor = (coins) => {
    let t = null;
    for (const x of giftInfo?.tiers || []) if (coins >= x.minCoins && (!t || x.minCoins >= t.minCoins)) t = x;
    return t;
  };
  const ownIcon = (coins) => {
    let best = null;
    for (const [c, p] of giftInfo?.icons || []) if (c <= coins && (!best || c >= best[0])) best = [c, p];
    return gameUrl(best ? best[1] : giftInfo?.fallbackIcon);
  };
  async function copyText(text, btn) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      const ta = el('textarea', '', document.body); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      ta.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } ta.remove();
    }
    const n = btn.nextElementSibling?.classList.contains('gov-copied') ? btn.nextElementSibling : el('span', 'gov-copied');
    n.textContent = ok ? 'kopyalandı' : 'kopyalanamadı';
    btn.after(n);
    setTimeout(() => n.remove(), 1800);
  }
  function renderOverview(list) {
    if (!overviewEl) return;
    const rows = list.map((g, i) => ({ ...g, i })).filter((g) => g.coins >= 1).sort((a, b) => a.coins - b.coins || a.i - b.i);
    const showN = inputs.get('gifts.showTroops')?.get() !== false;
    const tbl = el('table');
    const hr = el('tr', '', el('thead', '', tbl));
    for (const h of ['', 'Hediye', 'Jeton', 'Oyundaki adı', 'Ne yapar', 'Asker']) el('th', h === 'Jeton' || h === 'Asker' ? 'gov-num' : '', hr, h);
    const tb = el('tbody', '', tbl);
    for (const g of rows) {
      // Catalogue gift: by id, else by name at the same price, else (no name) the most recently
      // sent gift at exactly this price, as the game does.
      let it = g.id ? catalog.items.find((x) => x.id === g.id) : resolveRow(g.name, g.coins, 0)?.item;
      if (!it && !g.name && !g.plus) it = catalog.items.filter((x) => x.seen && x.coins === g.coins).sort((a, b) => b.seen - a.seen)[0];
      const tr = el('tr', '', tb);
      const ic = el('td', 'gov-icon', tr);
      const img = el('img', '', ic); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.loading = 'lazy';
      const own = ownIcon(g.coins);
      if (it?.icon) { img.src = it.icon; img.onerror = () => { img.onerror = null; img.src = own; img.className = 'own'; }; } else { img.src = own; img.className = 'own'; }
      img.title = it?.icon ? 'TikTok resmi' : 'Oyunun kendi simgesi (TikTok resmi, hediye yayında görülünce gelir)';
      const nm = el('td', 'gov-name', tr);
      const shown = g.name || (it ? it.tr || it.name : '');
      nm.append(shown || `${g.coins.toLocaleString('tr-TR')} jeton`);
      if (!g.name && !it) el('small', '', nm, 'adı henüz bilinmiyor');
      else if (it && nameKey(it.name) !== nameKey(shown)) el('small', '', nm, `TikTok: ${it.name}`);
      el('td', 'gov-num', tr, `${g.coins.toLocaleString('tr-TR')}${g.plus ? '+' : ''}`);
      const lab = el('td', 'gov-label', tr);
      el('strong', '', lab, g.effect || '–');
      if (g.effect) {
        const b = el('button', 'small', lab, 'kopyala'); b.type = 'button';
        b.title = 'Oyundaki adı panoya kopyala (LIVE Studio\'da hediyenin etiketine yapıştırın)';
        b.onclick = () => copyText(g.effect, b);
      }
      const t = tierFor(g.coins);
      const does = el('td', 'gov-does', tr, t?.does || '–');
      if (t?.label && nameKey(t.label) !== nameKey(g.effect)) el('small', '', does, `Oyundaki adım: ${t.label}`);
      el('td', 'gov-num', tr, showN ? `+${previewTroops(g.coins).toLocaleString('tr-TR')}` : `(+${previewTroops(g.coins).toLocaleString('tr-TR')})`);
    }
    overviewEl.replaceChildren(tbl);
  }

  function buildCommands(parent) {
    const row = el('div', 'row wrap set-cmds', parent);
    for (const [name, label] of [['restartRound', 'Turu yeniden başlat'], ['endRound', 'Turu bitir'], ['clearMap', 'Haritayı temizle'], ['resetSession', 'Günlük skoru sıfırla']]) {
      const b = el('button', name === 'clearMap' || name === 'resetSession' ? 'danger' : '', row, label);
      b.type = 'button';
      b.onclick = async () => {
        if (!confirm(COMMAND_CONFIRM[name])) return;
        try {
          const r = await api('command', { name, game: gid });
          const n = r.gamePages ?? 0;
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
          renderOverview(rows.map((r) => ({ name: r.name.value.trim(), coins: Number(r.coins.value), effect: r.effect.value.trim(), id: r.id || r.autoId, plus: r.plus.checked })));
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
      const r = await api(`settings${q}`, { values: collect() });
      current = r.values; dirty = false; fill();
      const n = r.pages?.games?.[gid] ?? 0;
      say(n ? `${okText} ✓ ${n} oyun sayfasına gönderildi.` : `${okText} ✓ Şu an bağlı oyun sayfası yok; oyun açılınca uygulanır.`, 'ok');
      renderPages(r.pages);
    } catch (e) { say(e.message, 'bad'); }
  }

  async function reset() {
    if (!confirm(`Bütün ${game?.title || 'oyun'} ayarları varsayılana dönsün mü?`)) return;
    try {
      const r = await api(`settings/reset${q}`, {});
      current = r.values; fill();
      say('Varsayılana dönüldü ✓', 'ok');
    } catch (e) { say(e.message, 'bad'); }
  }

  function renderPages(p) {
    const e = pagesEl;
    if (!p) { e.textContent = ''; return; }
    const g = p.games?.[gid] || 0;
    e.textContent = g ? `Bu oyunun açık sayfası: ${g}` : 'Bu oyunun açık sayfası yok (yayında değil ya da köprüye bağlanamıyor)';
    e.className = 'set-pages ' + (g ? 'ok' : 'warn');
  }

  async function load() {
    const r = await api(`settings${q}`);
    schema = r.schema; defaults = r.defaults; paces = r.paces; giftInfo = r.giftInfo || r.extra?.giftInfo || null; current = r.values || {};
    build(); fill(); renderPages(r.pages);
    renderCatalogNote();
    loadCatalog();
  }

  saveBtn.onclick = () => save();
  resetBtn.onclick = () => reset();

  let loaded = false;
  const tryLoad = () => load().then(() => { loaded = true; }).catch(() => { /* bridge down: banner shows it */ });
  tryLoad();

  return {
    /** A settings message from the bridge (saved here or from another panel). */
    onRemote(msg) {
      if (msg.scope !== 'game' || msg.game !== gid) return;
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
    destroy() { picker?.remove(); host.replaceChildren(); },
  };
}
