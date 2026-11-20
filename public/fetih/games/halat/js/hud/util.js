// Small DOM and text helpers for the Halat Çekme HUD.
// Viewer names, nicks, gift names and avatar URLs are untrusted: they only ever reach the
// page through textContent and <img src> (http/https/data:image only).

export function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  if (parent) parent.append(e);
  return e;
}

/** Static, trusted SVG markup (icons defined in this module only). */
export function svg(markup, cls, parent) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const node = t.content.firstElementChild;
  if (cls) node.setAttribute('class', cls);
  if (parent) parent.append(node);
  return node;
}

export const CROWN_SVG = '<svg viewBox="0 0 40 30" aria-hidden="true"><path d="M3 26 L1 7 L11 15 L20 2 L29 15 L39 7 L37 26 Z" fill="#ffd166" stroke="#5a2a00" stroke-width="2.5" stroke-linejoin="round"/><circle cx="20" cy="18" r="3" fill="#ff4f7b"/><rect x="3" y="24" width="34" height="4" rx="1" fill="#e0a830" stroke="#5a2a00" stroke-width="1.5"/></svg>';
export const COIN_SVG = '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="#ffd166" stroke="#7a4a00" stroke-width="2.5"/><circle cx="14" cy="14" r="7" fill="none" stroke="#b07a10" stroke-width="2"/></svg>';

export function safeImageUrl(u) {
  if (typeof u !== 'string') return '';
  const s = u.trim();
  if (!s || s.length > 4096) return '';
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(s)) return s;
  try {
    const url = new URL(s, location.href);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch { /* not a URL */ }
  return '';
}

const SEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('tr', { granularity: 'grapheme' }) : null;
export function graphemes(s) {
  return SEG ? Array.from(SEG.segment(s), (x) => x.segment) : Array.from(s);
}

/** Strips control/bidi characters, collapses whitespace and stacked combining marks. */
export function cleanText(s) {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, '')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Grapheme-safe truncation with an ellipsis. */
export function clip(s, max) {
  const t = cleanText(s);
  const g = graphemes(t);
  return g.length > max ? g.slice(0, Math.max(1, max - 1)).join('').trimEnd() + '…' : t;
}

export function nickOf(p, max = 18) {
  if (!p) return '';
  return clip(p.nick || p.nickname || p.name || p.uniqueId || 'İzleyici', max) || 'İzleyici';
}

export function upperTr(s) { return String(s).toLocaleUpperCase('tr'); }

const VOWELS = 'aeıioöuü';
/** Turkish dative with apostrophe: Kırmızı'ya, Mavi'ye, Yeşil'e, Turuncu'ya. */
export function dative(name) {
  const n = cleanText(name);
  const low = n.toLocaleLowerCase('tr');
  let last = '';
  for (const ch of low) if (VOWELS.includes(ch)) last = ch;
  const back = !last || 'aıou'.includes(last);
  const endsVowel = VOWELS.includes(low.slice(-1));
  return `${n}'${endsVowel ? 'y' : ''}${back ? 'a' : 'e'}`;
}

export function fmt(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('tr-TR');
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Team colour from config/state: '#rrggbb', 0xrrggbb, 'rgb(...)'. */
export function colorCss(c, fallback) {
  if (typeof c === 'number' && Number.isFinite(c)) return '#' + (c >>> 0 & 0xffffff).toString(16).padStart(6, '0');
  if (typeof c === 'string') {
    const s = c.trim();
    if (/^#[0-9a-f]{3,8}$/i.test(s) || /^(rgb|hsl)a?\([\d\s.,%/-]+\)$/i.test(s)) return s;
    if (/^[0-9a-f]{6}$/i.test(s)) return '#' + s;
  }
  return fallback;
}

/** Avatar: <img> over a coloured initial; the initial stays when the URL is missing or fails. */
export function makeAvatar(parent, cls = '') {
  const wrap = el('div', 'hh-av ' + cls, parent);
  const clipBox = el('div', 'hh-av-clip', wrap);
  const fb = el('span', 'hh-av-fb', clipBox);
  const img = el('img', '', clipBox);
  img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.draggable = false;
  img.style.display = 'none';
  img.onload = () => { img.style.display = ''; fb.style.display = 'none'; };
  img.onerror = () => { img.style.display = 'none'; fb.style.display = ''; };
  let cur = null;
  return {
    wrap,
    set(url, nick, color) {
      const initial = graphemes(cleanText(nick || '?'))[0] || '?';
      const up = initial.toLocaleUpperCase('tr');
      if (fb.textContent !== up) fb.textContent = up;
      if (color) wrap.style.setProperty('--c', color);
      const safe = safeImageUrl(url);
      if (safe === cur) return;
      cur = safe;
      img.style.display = 'none'; fb.style.display = '';
      if (safe) img.src = safe; else img.removeAttribute('src');
    },
  };
}

/** Gift picture (TikTok CDN URL); hidden when missing or broken. */
export function giftImg(parent, cls = '') {
  const i = el('img', 'hh-gift-img ' + cls, parent);
  i.alt = ''; i.decoding = 'async'; i.referrerPolicy = 'no-referrer'; i.draggable = false;
  i.style.display = 'none';
  i.onerror = () => { i.style.display = 'none'; i.removeAttribute('src'); };
  return {
    img: i,
    set(url) {
      const safe = safeImageUrl(url);
      if (!safe) { i.style.display = 'none'; i.removeAttribute('src'); return; }
      if (i.getAttribute('src') !== safe) i.src = safe;
      i.style.display = '';
    },
  };
}

export function anim(node, frames, opts) {
  try { return node.animate(frames, opts); } catch { return null; }
}
