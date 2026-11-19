// Small shared helpers: URL options, maths, Turkish text handling, formatting.

const qs = new URLSearchParams(location.search);

/** Options from the page URL. */
export const urlOpts = {
  debug: qs.get('debug') === '1',
  mute: qs.get('mute') === '1',
  noMusic: qs.get('nomusic') === '1',
  layout: qs.get('layout'), // 'portrait' | 'landscape' | null (auto)
  roundSec: Number(qs.get('round')) || 0, // override round length (testing)
  demo: qs.get('demo'), // '1' | 'low' | 'medium' | 'high' | 'chaos' | '0' | null (auto)
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- Turkish text ----------

const FOLD = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/** Turkish-aware lowercase, ASCII fold, strip punctuation/emoji, collapse spaces. */
export function normalizeText(s) {
  if (typeof s !== 'string') return '';
  let t = s.toLocaleLowerCase('tr');
  t = t.replace(/[çğıöşüâîû]/g, (c) => FOLD[c]);
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  t = t.replace(/[^a-z0-9]+/g, ' ').trim();
  return t;
}

const VOWELS = 'aeıioöuüâîû';
const BACK = 'aıouâû';
const HARD = 'fstkçşhp';

function lastVowel(word) {
  const w = word.toLocaleLowerCase('tr');
  for (let i = w.length - 1; i >= 0; i--) if (VOWELS.includes(w[i])) return w[i];
  return 'e';
}
function lastLetter(word) {
  const w = word.toLocaleLowerCase('tr').replace(/[^a-zçğıöşüâîû]+$/u, '');
  return w[w.length - 1] || 'e';
}
function fourWay(v) {
  if ('aıâ'.includes(v)) return 'ı';
  if ('eiî'.includes(v)) return 'i';
  if ('ouû'.includes(v)) return 'u';
  return 'ü';
}

/** Accusative: Kocaeli'yi, Ankara'yı, İzmir'i, Muş'u. */
export function acc(name) {
  const buf = VOWELS.includes(lastLetter(name)) ? 'y' : '';
  return `${name}'${buf}${fourWay(lastVowel(name))}`;
}
/** Genitive: Ayşe'nin, Ahmet'in. */
export function gen(name) {
  const buf = VOWELS.includes(lastLetter(name)) ? 'n' : '';
  return `${name}'${buf}${fourWay(lastVowel(name))}n`;
}
/** Locative: Ankara'da, Kars'ta, İzmir'de. */
export function loc(name) {
  const d = HARD.includes(lastLetter(name)) ? 't' : 'd';
  const a = BACK.includes(lastVowel(name)) ? 'a' : 'e';
  return `${name}'${d}${a}`;
}
/** Dative: Ankara'ya, İzmir'e. */
export function dat(name) {
  const buf = VOWELS.includes(lastLetter(name)) ? 'y' : '';
  const a = BACK.includes(lastVowel(name)) ? 'a' : 'e';
  return `${name}'${buf}${a}`;
}

// ---------- emoji ----------

// One emoji "token": RGI emoji sequences (ZWJ, skin tones, flags, keycaps) when the
// engine supports the `v` flag, else an Extended_Pictographic based approximation.
// TikTok emotes may arrive as bracketed text such as "[laugh]"; those count too.
const EMOTE_SRC = String.raw`\[[\p{L}\p{N}_ -]{1,24}\]`;
let EMOJI_RE;
try {
  EMOJI_RE = new RegExp(String.raw`\p{RGI_Emoji}|${EMOTE_SRC}`, 'gv');
} catch {
  const pic = String.raw`\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?`;
  EMOJI_RE = new RegExp(String.raw`\p{Regional_Indicator}{2}|[0-9#*]️?⃣|${pic}(?:‍${pic})*|${EMOTE_SRC}`, 'gu');
}

const EMOTE_RE = new RegExp(EMOTE_SRC, 'gu');
const PICTO_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('tr', { granularity: 'grapheme' }) : null;

/**
 * First emoji (or bracketed emote like "[laugh]") in the text, and the text with all
 * of them removed. Emoji are found per grapheme cluster, so flags, skin tones, ZWJ
 * families and keycaps stay whole.
 */
export function splitEmoji(text) {
  if (typeof text !== 'string') return { emoji: '', rest: '' };
  let first = ''; let firstAt = Infinity;
  let s = text.replace(EMOTE_RE, (m, off) => { if (off < firstAt) { first = m; firstAt = off; } return ' '.repeat(m.length); });
  if (segmenter) {
    let out = '';
    for (const { segment, index } of segmenter.segment(s)) {
      if (PICTO_RE.test(segment)) {
        if (index < firstAt) { first = segment; firstAt = index; }
        out += ' ';
      } else out += segment;
    }
    s = out;
  } else {
    EMOJI_RE.lastIndex = 0;
    s = s.replace(EMOJI_RE, (m, off) => { if (off < firstAt) { first = m; firstAt = off; } return ' '; });
  }
  return { emoji: first, rest: s };
}

/** Display form of a text badge: real emoji as-is, emotes as their bracketed name (capped). */
export function badgeText(e) {
  if (!e) return '';
  if (e.startsWith('[')) return e.length > 12 ? e.slice(0, 11) + '…]' : e;
  return e;
}

/** TikTok emote image URL from a chat event's optional `emotes` array (several shapes tolerated). */
export function firstEmoteUrl(emotes) {
  if (!Array.isArray(emotes)) return '';
  for (const e of emotes) {
    if (!e || typeof e !== 'object') continue;
    const cand = e.url || e.image?.urlList?.[0] || e.emote?.image?.urlList?.[0] || e.emote?.url || '';
    const safe = safeImageUrl(cand);
    if (safe) return safe;
  }
  return '';
}

/**
 * Write "nick" plus the viewer's badge into an element. badge: { t: text, img: url }.
 * Image badges fall back to their text (or a star) if they fail to load.
 */
export function setNameBadge(el, nick, badge) {
  el.textContent = nick;
  if (!badge || (!badge.t && !badge.img)) return;
  el.append(' ');
  if (badge.img) {
    const img = document.createElement('img');
    img.className = 'badge-img'; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
    img.onerror = () => { img.replaceWith(document.createTextNode(badge.t || '★')); };
    img.src = badge.img;
    el.append(img);
  } else {
    const sp = document.createElement('span');
    sp.className = 'badge-emoji';
    sp.textContent = badge.t;
    el.append(sp);
  }
}

export const badgeKey = (b) => (b ? `${b.t || ''}|${b.img || ''}` : '');

// ---------- formatting ----------

const nfInt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const nfCompact = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });

export function fmt(n) {
  n = Math.max(0, Math.round(n));
  // Full numbers up to a million ("50.000" reads better than the compact "50 B").
  return n < 1e6 ? nfInt.format(n) : nfCompact.format(n);
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Only allow http(s) or same-origin absolute paths as image sources. */
export function safeImageUrl(url) {
  if (typeof url !== 'string' || !url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  // Inline images (demo-mode emotes); <img> never runs scripts from these.
  if (/^data:image\/(svg\+xml|png|webp|gif|jpeg)[;,]/i.test(url) && url.length < 20000) return url;
  return '';
}

/** Trim and cap untrusted display names (still inserted via textContent). */
export function cleanNick(s, max = 22) {
  if (typeof s !== 'string') return '?';
  const t = s.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').trim();
  const chars = Array.from(t);
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : t || '?';
}

/** Point in polygon (ring: [[x,y],...], unclosed). */
export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]; const yi = ring[i][1];
    const xj = ring[j][0]; const yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point in a province's polygons (outer ring + holes). */
export function pointInProvince(x, y, prov) {
  for (const poly of prov.polygons) {
    if (!pointInRing(x, y, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) if (pointInRing(x, y, poly[h])) { inHole = true; break; }
    if (!inHole) return true;
  }
  return false;
}
