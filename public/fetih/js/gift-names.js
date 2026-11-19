// TikTok gift names: the live feed sends English names ("Rose") while a Turkish TikTok app
// shows Turkish ones ("Gül"). Small built-in map for the common cheap gifts, shared by the
// bridge (server/gifts.js imports this file) and the game. No DOM, no imports.

/** English name as TikTok sends it -> name in the Turkish app. */
export const GIFT_NAMES_TR = {
  'TikTok': 'TikTok',
  'Rose': 'Gül',
  'Finger Heart': 'Finger Heart',
  'Friendship Necklace': 'Dostluk Kolyesi',
  'Perfume': 'Parfüm',
  'Doughnut': 'Donat',
  'Hat and Mustache': 'Şapka ve Bıyık',
  'Hand Hearts': 'Elle Kalp',
  'Hearts': 'Kalpler',
};

/** Normalised name for matching (case, spaces and punctuation ignored, Turkish casing). */
export const giftKey = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, '');

const EN_BY_KEY = new Map();
const TR_BY_KEY = new Map();
for (const [en, tr] of Object.entries(GIFT_NAMES_TR)) {
  EN_BY_KEY.set(giftKey(tr), en);
  EN_BY_KEY.set(giftKey(en), en);
  TR_BY_KEY.set(giftKey(en), tr);
}

/** Turkish app name for an English TikTok gift name ('' when not in the map). */
export const trName = (en) => TR_BY_KEY.get(giftKey(en)) || '';

/** English TikTok name for a ladder name in either language ('' when not in the map). */
export const enName = (name) => EN_BY_KEY.get(giftKey(name)) || '';

/**
 * Does a ladder entry name (Turkish or English) name this TikTok gift? Compares against the
 * gift's English name, its Turkish name from the catalogue (tr) and the built-in map.
 */
export function nameMatches(entryName, gift) {
  const k = giftKey(entryName);
  if (!k || !gift) return false;
  if (k === giftKey(gift.name) || (gift.tr && k === giftKey(gift.tr))) return true;
  const en = enName(entryName);
  return !!en && giftKey(en) === giftKey(gift.name);
}

/**
 * Catalogue item for one ladder entry: by its TikTok id when it has one, otherwise the gift
 * whose name matches (either language) at the same coin value (its id is then "learned").
 * Returns { item, auto } or null. `items` is iterable of { id, name, tr?, coins, icon }.
 */
export function resolveEntry(entry, items) {
  if (!entry) return null;
  const id = Math.floor(Number(entry.id));
  if (id > 0) {
    for (const it of items) if (it.id === id) return { item: it, auto: false };
    return null;
  }
  const coins = Math.floor(Number(entry.coins));
  if (!entry.name || entry.plus) return null;
  for (const it of items) if (it.coins === coins && nameMatches(entry.name, it)) return { item: it, auto: true };
  return null;
}
