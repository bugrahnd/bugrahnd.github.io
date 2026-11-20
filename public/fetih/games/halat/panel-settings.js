// Panel module of Halat Çekme (oyun.json "panel.module"): the generated settings form
// (panel/schema-form.js) with three touches the generic form cannot express:
//   - the engagement forces sit in a collapsed block (TikTok may restrict streams that reward them),
//   - the gift tier table is a compact, collapsible grid (en az jeton / güç / süre / yazı per tier),
//   - team colours get a colour picker next to their text field.
import { mountSchemaForm } from '../../panel/schema-form.js';
import { ENGAGE_GROUP } from './js/settings-map.js';

const TIER_GROUP = 'Hediye kademeleri';
const STYLE_ID = 'halat-panel-css';
const CSS = `
.halat-fold { margin: 10px 0; border: 1px solid rgba(127,127,127,.35); border-radius: 10px; padding: 4px 10px; }
.halat-fold > summary { cursor: pointer; font-weight: 700; padding: 6px 0; }
.halat-fold > fieldset { border: 0; margin: 0; padding: 0; }
.halat-fold > fieldset > legend { display: none; }
.halat-fold.warn > summary { color: #c77700; }
.halat-tiers > fieldset { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 4px 12px; }
.halat-tiers .set-field .hint { display: none; }
.halat-tiers .set-field:focus-within .hint { display: block; }
.halat-color { width: 42px; height: 30px; padding: 0; margin-left: 6px; border: 0; background: none; vertical-align: middle; cursor: pointer; }
`;

function fold(fs, title, cls, open) {
  if (!fs || fs.parentElement?.tagName === 'DETAILS') return;
  const d = document.createElement('details');
  d.className = `halat-fold ${cls}`;
  d.open = open;
  const s = document.createElement('summary');
  s.textContent = title;
  fs.replaceWith(d);
  d.append(s, fs);
}

function decorate(root, timers) {
  for (const fs of root.querySelectorAll('fieldset.set-group')) {
    const legend = fs.querySelector(':scope > legend')?.textContent || '';
    if (legend === ENGAGE_GROUP) fold(fs, `${ENGAGE_GROUP} · varsayılan: kapalı (0)`, 'warn', false);
    else if (legend === TIER_GROUP) fold(fs, `${TIER_GROUP} (jeton, güç, süre, yazı)`, 'halat-tiers', false);
  }
  for (const n of [1, 2]) {
    const text = root.querySelector(`#sf-halat-team${n}-color`);
    if (!text || text.dataset.picker) continue;
    text.dataset.picker = '1';
    const pick = document.createElement('input');
    pick.type = 'color';
    pick.className = 'halat-color';
    pick.title = 'Renk seç';
    const sync = () => { if (/^#[0-9a-f]{6}$/i.test(text.value.trim())) pick.value = text.value.trim(); };
    sync();
    text.addEventListener('input', sync);
    pick.addEventListener('input', () => { text.value = pick.value; text.dispatchEvent(new Event('input', { bubbles: true })); });
    text.after(pick);
    // The form sets values programmatically after loading / saving: keep the picker in step.
    new MutationObserver(sync).observe(text, { attributes: true });
    timers.push(setInterval(sync, 1000));
  }
}

export function mount({ api, root, game }) {
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style');
    st.id = STYLE_ID; st.textContent = CSS;
    document.head.append(st);
  }
  const ui = mountSchemaForm({ api, root, scope: game.id, title: game.title, commands: game.commands || [] });
  const timers = [];
  const mo = new MutationObserver(() => decorate(root, timers));
  mo.observe(root, { childList: true, subtree: true });
  decorate(root, timers);
  return {
    onRemote: (msg) => ui.onRemote(msg),
    onGifts: (c) => ui.onGifts(c),
    onState: (s) => ui.onState(s),
    destroy() { mo.disconnect(); for (const t of timers) clearInterval(t); ui.destroy(); },
  };
}
