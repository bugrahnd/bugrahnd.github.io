// Deterministic team colours: a vivid palette assigned greedily so that
// neighbouring provinces (and their neighbours) get clearly different colours.

export const NEUTRAL_HEX = 0x8f949a;

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function oklab([r, g, b]) {
  r = srgbToLinear(r); g = srgbToLinear(g); b = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function dist(a, b) {
  const dl = a[0] - b[0]; const da = a[1] - b[1]; const db = a[2] - b[2];
  return Math.sqrt(dl * dl * 1.4 + da * da + db * db);
}

function buildPalette() {
  const out = [];
  // 3 lightness/saturation bands x 12 hues, offset so bands do not share hues.
  const bands = [
    { s: 0.78, l: 0.52, off: 0 },
    { s: 0.65, l: 0.40, off: 15 },
    { s: 0.85, l: 0.64, off: 7 },
  ];
  for (const b of bands) {
    for (let i = 0; i < 12; i++) {
      const h = (i * 30 + b.off) % 360;
      const rgb = hslToRgb(h, b.s, b.l);
      out.push({ rgb, lab: oklab(rgb) });
    }
  }
  return out;
}

const toHex = ([r, g, b]) => (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);

/** @returns {Map<number, number>} plate -> 0xRRGGBB */
export function assignTeamColors(provinces) {
  const palette = buildPalette();
  const neutralLab = oklab([0x8f / 255, 0x94 / 255, 0x9a / 255]);
  const byPlate = new Map(provinces.map((p) => [p.plate, p]));
  const order = [...provinces].sort((a, b) => b.neighbors.length - a.neighbors.length || a.plate - b.plate);
  const chosen = new Map(); // plate -> palette index
  const usage = new Array(palette.length).fill(0);

  for (const p of order) {
    const near1 = p.neighbors;
    const near2 = new Set();
    for (const n of near1) for (const m of byPlate.get(n).neighbors) if (m !== p.plate && !near1.includes(m)) near2.add(m);
    let best = -1; let bestScore = -Infinity;
    for (let i = 0; i < palette.length; i++) {
      let minD = dist(palette[i].lab, neutralLab) * 1.2;
      for (const n of near1) if (chosen.has(n)) minD = Math.min(minD, dist(palette[i].lab, palette[chosen.get(n)].lab));
      let minD2 = 1;
      for (const n of near2) if (chosen.has(n)) minD2 = Math.min(minD2, dist(palette[i].lab, palette[chosen.get(n)].lab));
      const score = minD + 0.35 * minD2 - usage[i] * 0.02;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    chosen.set(p.plate, best);
    usage[best]++;
  }
  const result = new Map();
  for (const [plate, i] of chosen) result.set(plate, toHex(palette[i].rgb));
  return result;
}

export function hexCss(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

/** Scale brightness of a hex colour. */
export function shadeHex(hex, f) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}
