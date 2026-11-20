// Small helpers for Halat Çekme (copied/trimmed from the first game; a shared library
// will replace this file later): URL options, maths, Turkish text, nick sanitising.

const qs = new URLSearchParams(location.search);

/** Options from the page URL. */
export const urlOpts = {
  debug: qs.get('debug') === '1',
  mute: qs.get('mute') === '1',
  noMusic: qs.get('nomusic') === '1',
  demo: qs.get('demo'), // '1' | 'low' | 'medium' | 'high' | 'chaos' | '0' | null (auto)
  roundSec: Number(qs.get('round')) || 0, // override round length (testing)
  zones: qs.get('zones') === '1', // draw the TikTok safe zones (testing)
  bridgeUrl: bridgeParam(),
  quality: qs.get('q') || '', // 'low' forces the cheap path
};

/** Host names that reach this PC (the bridge): loopback plus DNS names resolving to 127.0.0.1. */
export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '', 'localtest.me', 'lvh.me', 'local.bugrahnd.com.tr'];
const LOOPBACK_SUFFIXES = ['.localhost', '.localtest.me', '.lvh.me'];
export const isLoopbackHost = (h) => LOOPBACK_HOSTS.includes(h) || LOOPBACK_SUFFIXES.some((s) => h.endsWith(s));

/** The forced bridge WebSocket URL, or '' when the page's own host is the bridge (or demo). */
function bridgeParam() {
  const b = (qs.get('bridge') || '').trim();
  if (/^wss?:\/\/[^\s/]+\/\S*$/i.test(b)) return b;
  if (b === 'local' || qs.get('yayin') === '1') return 'ws://127.0.0.1:3000/ws';
  return '';
}

/** http(s) origin of a ws(s) URL: ws://127.0.0.1:3000/ws -> http://127.0.0.1:3000 */
export function httpOriginOf(wsUrl) {
  try {
    const u = new URL(wsUrl);
    return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}`;
  } catch { return ''; }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/** Frame-rate independent exponential approach factor. */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Deterministic 0..1 hash of a string (stable per-player variation). */
export function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

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

// ---------- emoji ----------

const EMOTE_RE = /\[[\p{L}\p{N}_ -]{1,24}\]/gu;
const PICTO_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('tr', { granularity: 'grapheme' }) : null;

/** First emoji grapheme in the text and the text with all emoji removed. */
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
    s = s.replace(/\p{Extended_Pictographic}/gu, (m, off) => { if (off < firstAt) { first = m; firstAt = off; } return ' '; });
  }
  return { emoji: first, rest: s };
}

/** User-perceived characters (grapheme clusters). */
export function graphemes(s) {
  if (segmenter) return Array.from(segmenter.segment(s), (x) => x.segment);
  return Array.from(s);
}

/** Trim and cap untrusted display names (zalgo marks cut, controls/bidi removed). */
export function cleanNick(s, max = 22) {
  if (typeof s !== 'string') return '?';
  const t = s.replace(/[\u0000-\u001f\u007f​‎‏‪-‮⁦-⁩]/g, '').replace(/(\p{M}{2})\p{M}+/gu, '$1').trim();
  const g = graphemes(t);
  return g.length > max ? g.slice(0, max - 1).join('').trimEnd() + '…' : t || '?';
}

/** Only allow http(s), root-relative or small inline images as image sources. */
export function safeImageUrl(url) {
  if (typeof url !== 'string' || !url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (/^data:image\/(svg\+xml|png|webp|gif|jpeg)[;,]/i.test(url) && url.length < 20000) return url;
  return '';
}

const nfInt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
export const fmt = (n) => nfInt.format(Math.max(0, Math.round(n)));

/** Deep merge plain objects (arrays and scalars replace). Mutates and returns target. */
export function deepMerge(target, src) {
  if (!src || typeof src !== 'object') return target;
  for (const [k, v] of Object.entries(src)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      deepMerge(target[k], v);
    } else {
      target[k] = Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : (v && typeof v === 'object' ? deepMerge({}, v) : v);
    }
  }
  return target;
}

export const clone = (o) => JSON.parse(JSON.stringify(o));

/** Hex colour string or number -> number. */
export function hexNum(c, fallback = 0xffffff) {
  if (typeof c === 'number') return c;
  if (typeof c === 'string') {
    const m = c.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h.split('').map((x) => x + x).join('');
      return parseInt(h, 16);
    }
  }
  return fallback;
}
