// A settings form generated from a bridge schema. Used for "Yayın ayarları" (stream-wide) and
// for every game that has no custom panel module (games/<id>/oyun.json without panel.module).
// Same interface as a game panel module: mount(ctx) -> { onRemote, onGifts, onState, destroy }.
//
// Schema entry fields used here: label, type (int | num | bool | str | enum; giftStrip / curve
// need a custom module), min, max, step, values (enum), labels (enum value -> Turkish text),
// group (fieldset title), hint, unit, widget ('range' for 0-100 style sliders), nextRound.

const fmt = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : String(v));
const el = (tag, cls, parent, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.append(e);
  return e;
};

/**
 * ctx: { api, root, scope: 'stream' | <game id>, title, intro, commands: [{ name, label, confirm, danger }] }
 */
export function mountSchemaForm({ api, root: host, scope, title = '', intro = '', commands = [] }) {
  const isStream = scope === 'stream';
  const getPath = isStream ? 'settings/stream' : `settings?game=${encodeURIComponent(scope)}`;
  const resetPath = isStream ? 'settings/stream/reset' : `settings/reset?game=${encodeURIComponent(scope)}`;

  host.replaceChildren();
  const pagesEl = el('div', 'set-pages', host);
  if (intro) el('p', 'hint', host, intro);
  const cmdRow = commands.length ? el('div', 'row wrap set-cmds', host) : null;
  const root = el('div', 'settings-form', host);
  el('p', 'muted', root, 'Ayarlar yükleniyor…');
  const actions = el('div', 'row wrap set-actions', host);
  const saveBtn = el('button', 'primary', actions, 'Kaydet'); saveBtn.type = 'button';
  const resetBtn = el('button', '', actions, 'Varsayılana dön'); resetBtn.type = 'button';
  const msgEl = el('span', 'set-msg', actions);
  msgEl.setAttribute('role', 'status'); msgEl.setAttribute('aria-live', 'polite');

  let schema = {}; let defaults = {}; let current = {};
  let dirty = false; let loaded = false;
  const inputs = new Map();

  const say = (text, kind = '') => {
    msgEl.textContent = text;
    msgEl.className = 'set-msg ' + kind;
    clearTimeout(say.t);
    if (kind === 'ok') say.t = setTimeout(() => { if (msgEl.textContent === text) { msgEl.textContent = ''; msgEl.className = 'set-msg'; } }, 6000);
  };
  const markDirty = () => { dirty = true; say('Kaydedilmemiş değişiklik var. Uygulamak için "Kaydet"e basın.', 'warn'); };

  for (const c of commands) {
    const b = el('button', c.danger ? 'danger' : '', cmdRow, c.label || c.name);
    b.type = 'button';
    b.onclick = async () => {
      if (c.confirm && !confirm(c.confirm)) return;
      try {
        const r = await api('command', { name: c.name, game: scope });
        const n = r.gamePages ?? 0;
        say(n ? `${c.label}: ${n} oyun sayfasına gönderildi.` : `${c.label}: gönderildi, ama bu oyunun açık sayfası yok.`, n ? 'ok' : 'warn');
      } catch (e) { say(e.message, 'bad'); }
    };
  }

  function describeDefault(s, v) {
    if (s.type === 'bool') return v ? 'açık' : 'kapalı';
    if (s.type === 'enum') return s.labels?.[v] || String(v);
    if (s.type === 'str') return `"${v}"`;
    if (s.widget === 'range' && s.unit === '%') return `%${v}`;
    return `${fmt(v)}${s.unit ? ' ' + s.unit : ''}`;
  }

  function buildField(parent, key, s) {
    const row = el('div', 'set-field', parent);
    const head = el('div', 'set-head', row);
    const label = el('label', 'set-label', head, s.label || key);
    const id = `sf-${scope}-${key.replace(/\W/g, '-')}`;
    label.htmlFor = id;
    if (s.nextRound) el('span', 'tag', head, 'sonraki turdan itibaren');
    const ctl = el('div', 'set-ctl', row);
    let api_;
    if ((s.type === 'int' || s.type === 'num') && s.widget === 'range') {
      const i = el('input', '', ctl); i.type = 'range'; i.id = id; i.min = s.min; i.max = s.max; i.step = s.step || 1;
      const out = el('output', 'unit', ctl);
      const show = () => { out.textContent = s.unit === '%' ? `%${i.value}` : `${i.value}${s.unit ? ' ' + s.unit : ''}`; };
      i.oninput = () => { show(); markDirty(); };
      api_ = { get: () => Number(i.value), set: (v) => { i.value = v; show(); } };
    } else if (s.type === 'int' || s.type === 'num') {
      const i = el('input', '', ctl); i.type = 'number'; i.id = id;
      if (s.min !== undefined) i.min = s.min;
      if (s.max !== undefined) i.max = s.max;
      i.step = s.step || (s.type === 'int' ? 1 : 'any');
      i.inputMode = s.type === 'int' ? 'numeric' : 'decimal';
      if (s.unit) el('span', 'unit', ctl, s.unit);
      i.oninput = markDirty;
      // Empty stays '' so the bridge rejects it (NaN would serialise as null = "default").
      api_ = { get: () => (i.value.trim() === '' ? '' : Number(i.value)), set: (v) => { i.value = v; } };
    } else if (s.type === 'bool') {
      const lab = el('label', 'switch', ctl);
      const i = el('input', '', lab); i.type = 'checkbox'; i.id = id;
      const txt = el('span', '', lab);
      const show = () => { txt.textContent = i.checked ? 'Açık' : 'Kapalı'; };
      i.onchange = () => { show(); markDirty(); };
      api_ = { get: () => i.checked, set: (v) => { i.checked = !!v; show(); } };
    } else if (s.type === 'str') {
      const i = el('input', '', ctl); i.type = 'text'; i.id = id; i.maxLength = s.max || 60; i.spellcheck = false;
      i.oninput = markDirty;
      api_ = { get: () => i.value.trim(), set: (v) => { i.value = v; } };
    } else if (s.type === 'enum') {
      const sel = el('select', '', ctl); sel.id = id;
      for (const v of s.values) sel.add(new Option(s.labels?.[v] || v, v));
      sel.onchange = markDirty;
      api_ = { get: () => sel.value, set: (v) => { sel.value = v; } };
    } else {
      el('span', 'muted', ctl, 'Bu ayar burada düzenlenemez (oyunun kendi panel modülü gerekir).');
      return;
    }
    el('p', 'hint', row, `${s.hint ? s.hint + ' ' : ''}Varsayılan: ${describeDefault(s, defaults[key])}.`);
    inputs.set(key, api_);
  }

  function build() {
    root.replaceChildren();
    inputs.clear();
    const groups = new Map();
    for (const [key, s] of Object.entries(schema)) {
      const g = s.group || title || 'Ayarlar';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push([key, s]);
    }
    if (!groups.size) el('p', 'muted', root, 'Bu oyunun ayarı yok.');
    for (const [g, list] of groups) {
      const fs = el('fieldset', 'set-group', root);
      el('legend', '', fs, g);
      for (const [key, s] of list) buildField(fs, key, s);
    }
    saveBtn.disabled = resetBtn.disabled = !inputs.size;
  }

  function fill() {
    for (const [key, ctl] of inputs) ctl.set(key in current ? current[key] : defaults[key]);
    dirty = false;
  }

  function renderPages(p) {
    if (!p) { pagesEl.textContent = ''; return; }
    if (isStream) {
      const n = p.game || 0;
      pagesEl.textContent = n ? `Açık oyun sayfası: ${n}` : 'Açık oyun sayfası yok; ayarlar oyun açılınca uygulanır.';
      pagesEl.className = 'set-pages ' + (n ? 'ok' : 'warn');
    } else {
      const n = p.games?.[scope] || 0;
      pagesEl.textContent = n ? `Bu oyunun açık sayfası: ${n}` : 'Bu oyunun açık sayfası yok (yayında değil ya da köprüye bağlanamıyor)';
      pagesEl.className = 'set-pages ' + (n ? 'ok' : 'warn');
    }
  }

  async function load() {
    const r = await api(getPath);
    schema = r.schema || {}; defaults = r.defaults || {}; current = r.values || {};
    build(); fill(); renderPages(r.pages);
    loaded = true;
  }

  async function save() {
    const values = {};
    for (const [key, ctl] of inputs) values[key] = ctl.get();
    say('Kaydediliyor…');
    try {
      const r = await api(getPath, { values });
      current = r.values; fill(); renderPages(r.pages);
      const n = isStream ? (r.pages?.game ?? 0) : (r.pages?.games?.[scope] ?? 0);
      say(n ? `Kaydedildi ✓ ${n} oyun sayfasına gönderildi.` : 'Kaydedildi ✓ Şu an açık oyun sayfası yok; açılınca uygulanır.', 'ok');
    } catch (e) { say(e.message, 'bad'); }
  }

  async function reset() {
    if (!confirm(isStream ? 'Bütün yayın ayarları varsayılana dönsün mü?' : `Bütün ${title || 'oyun'} ayarları varsayılana dönsün mü?`)) return;
    try {
      const r = await api(resetPath, {});
      current = r.values; fill();
      say('Varsayılana dönüldü ✓', 'ok');
    } catch (e) { say(e.message, 'bad'); }
  }

  saveBtn.onclick = save;
  resetBtn.onclick = reset;
  const tryLoad = () => load().catch(() => { /* bridge down: the banner shows it */ });
  tryLoad();

  return {
    onRemote(msg) {
      const mine = isStream ? msg.scope === 'stream' : msg.scope === 'game' && msg.game === scope;
      if (!mine) return;
      if (!loaded) { tryLoad(); return; }
      current = msg.values || {};
      if (!dirty) fill();
    },
    onGifts() {},
    onState(s) { if (!loaded) tryLoad(); renderPages(s.pages); },
    destroy() { host.replaceChildren(); },
  };
}
