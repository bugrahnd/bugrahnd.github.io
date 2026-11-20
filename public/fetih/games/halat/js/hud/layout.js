// Stage layout in 1080x1920 design units, derived from TikTok LIVE's safe zones.
//
// TikTok covers the top of the frame (header, viewers), the chat from chatTop down on the
// left, a hearts/gift column on the right of the lower half and the comment bar at the
// bottom. A 9:16 stream shown on a taller phone is cropped at the sides, hence the side
// inset. Rows, top-down (defaults; all derived from the zones):
//   logo     0 … top            decoration only (y 66 … 214)
//   strip    top+4   h 70       round | timer | session score            (234-304)
//   teams    +4      h 180      two compact mirrored team panels         (308-488)
//   rope     +4      h 60       rope-balance track with the leader chip  (492-552)
//   band     +4 … ladder-4      3D action band, the biggest block        (556-1160, 604 high)
//   ladder   chatTop-176 h 112  gift ladder, 3 two-line tiles per page   (1164-1276)
//   join     chatTop-60  h 56   "Katılmak için 1 veya 2 yaz"             (1280-1336)
// x runs from side to 1080 - side for every readable block; the band spans the full width.

export const STAGE_W = 1080;
export const STAGE_H = 1920;

export const DEFAULT_ZONES = {
  top: 230, // TikTok header: decoration only above this
  contentTop: 234, // first readable row
  chatTop: 1340, // TikTok chat starts here: nothing important below
  side: 60, // cropped on tall phones
  minText: 34,
  // Drawn by ?zones=1 for reference only (the owner lets the ladder ignore the hearts column).
  chatRight: 720, rightColLeft: 900, rightColTop: 1000, bottomBar: 130,
};

const H = { strip: 70, teams: 180, rope: 60, ladder: 112, join: 56, gap: 4 };

export function resolveZones(...sources) {
  const z = { ...DEFAULT_ZONES };
  for (const s of sources) {
    if (!s || typeof s !== 'object') continue;
    for (const k of Object.keys(DEFAULT_ZONES)) {
      const v = Number(s[k]);
      if (s[k] !== undefined && s[k] !== null && s[k] !== '' && Number.isFinite(v)) z[k] = v;
    }
    // contentTop follows top unless given explicitly
    if (s.top !== undefined && s.contentTop === undefined) z.contentTop = z.top + 4;
  }
  z.top = clamp(z.top, 0, 600);
  z.contentTop = clamp(Math.max(z.contentTop, z.top), 0, 700);
  z.chatTop = clamp(z.chatTop, z.contentTop + 700, STAGE_H);
  z.side = clamp(z.side, 0, 200);
  return z;
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

/** Block rectangles {x, y, w, h} in design units. */
export function computeRows(Z) {
  const x = Z.side;
  const w = STAGE_W - 2 * Z.side;
  let y = Z.contentTop;
  const strip = { x, y, w, h: H.strip }; y += H.strip + H.gap;
  const teams = { x, y, w, h: H.teams }; y += H.teams + H.gap;
  const rope = { x, y, w, h: H.rope }; y += H.rope + H.gap;
  const join = { x, y: Z.chatTop - H.join - 4, w, h: H.join };
  const ladder = { x, y: join.y - H.gap - H.ladder, w, h: H.ladder };
  const band = { x: 0, y, w: STAGE_W, h: Math.max(160, ladder.y - H.gap - y) };
  const logoTop = Math.max(0, Z.top - 164);
  const logo = { x: 0, y: logoTop, w: STAGE_W, h: Math.max(60, Z.top - 16 - logoTop) };
  const content = { x, y: Z.contentTop, w, h: Z.chatTop - Z.contentTop };
  return { logo, strip, teams, rope, band, ladder, join, content };
}

export function place(node, r, withX = true) {
  node.style.top = `${r.y}px`;
  node.style.height = `${r.h}px`;
  if (withX) { node.style.left = `${r.x}px`; node.style.width = `${r.w}px`; }
}
