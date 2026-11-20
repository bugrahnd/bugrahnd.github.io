// Untrusted viewer data (TikTok nicks, avatar / emote URLs): helpers to display it safely.
// Always insert text with textContent; these only trim, cap and filter.
// Same rules as Plaka Savaşları (game/js/util.js cleanNick / safeImageUrl / graphemes).

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('tr', { granularity: 'grapheme' }) : null;

/** User-perceived characters (grapheme clusters): emoji, flags and ZWJ families stay whole. */
export function graphemes(s) {
  if (segmenter) return Array.from(segmenter.segment(s), (x) => x.segment);
  return Array.from(s);
}

/**
 * Trim and cap a display name. Control and bidi characters are removed, stacked combining
 * marks ("zalgo") are cut to two per character, the cap counts graphemes (an emoji is never split).
 */
export function cleanNick(s, max = 22) {
  if (typeof s !== 'string') return '?';
  // eslint-disable-next-line no-control-regex
  const t = s.replace(/[\u0000-\u001f\u007f​‎‏‪-‮⁦-⁩]/g, '').replace(/(\p{M}{2})\p{M}+/gu, '$1').trim();
  const g = graphemes(t);
  return g.length > max ? g.slice(0, max - 1).join('').trimEnd() + '…' : t || '?';
}

/** Only http(s), same-origin absolute paths and small inline images are allowed as image sources. */
export function safeImageUrl(url) {
  if (typeof url !== 'string' || !url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (/^data:image\/(svg\+xml|png|webp|gif|jpeg)[;,]/i.test(url) && url.length < 20000) return url;
  return '';
}

/**
 * An <img> for an avatar (or '' -> a coloured initial). Never throws; a broken image falls back
 * to the initial. referrerPolicy no-referrer: TikTok's CDN refuses some referrers.
 */
export function avatarEl(user, size = 64) {
  const nick = cleanNick(user?.nick || user?.name || '?', 22);
  const box = document.createElement('span');
  box.className = 'avatar';
  Object.assign(box.style, { width: `${size}px`, height: `${size}px`, display: 'inline-grid', placeItems: 'center', borderRadius: '50%', overflow: 'hidden', background: '#334', color: '#fff', font: `700 ${Math.round(size * 0.45)}px system-ui, sans-serif` });
  const initial = () => { box.textContent = graphemes(nick)[0]?.toLocaleUpperCase('tr') || '?'; };
  const src = safeImageUrl(user?.avatar);
  if (!src) { initial(); return box; }
  const img = document.createElement('img');
  img.alt = ''; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
  Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover' });
  img.onerror = () => { img.remove(); initial(); };
  img.src = src;
  box.append(img);
  return box;
}

const FOLD = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/** Turkish-aware lowercase, ASCII fold, strip punctuation/emoji, collapse spaces ("KIRMIZI!" -> "kirmizi"). */
export function normalizeText(s) {
  if (typeof s !== 'string') return '';
  let t = s.toLocaleLowerCase('tr');
  t = t.replace(/[çğıöşüâîû]/g, (c) => FOLD[c]);
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return t.replace(/[^a-z0-9]+/g, ' ').trim();
}
