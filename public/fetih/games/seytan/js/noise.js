// Seeded random numbers, value noise / fBm and small helpers that turn noise into canvases
// (stone, bark, clouds). Used once at start-up to build the realistic textures.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNoise(seed = 1) {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256);
  for (let i = 0; i < 256; i++) val[i] = r();
  const fade = (t) => t * t * (3 - 2 * t);
  const at = (x, y) => val[perm[(x & 255) + perm[y & 255]]];
  function noise(x, y) {
    const xi = Math.floor(x); const yi = Math.floor(y);
    const xf = fade(x - xi); const yf = fade(y - yi);
    const a = at(xi, yi); const b = at(xi + 1, yi); const c = at(xi, yi + 1); const d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  }
  function fbm(x, y, oct = 5, lac = 2, gain = 0.5) {
    let sum = 0; let amp = 0.5; let f = 1; let norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * noise(x * f, y * f); norm += amp; amp *= gain; f *= lac; }
    return sum / norm;
  }
  return { noise, fbm };
}

/** Canvas w x h whose pixels come from fn(x, y) -> [r, g, b, a] (0..255). */
export function pixelCanvas(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, gg, b, a] = fn(x, y);
      const i = (y * w + x) * 4;
      d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = a;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Stone grain texture: base colour [r,g,b] varied by fBm, with darker speckles. */
export function stoneTexture(w, h, base, seed = 3, scale = 0.035, contrast = 0.35) {
  const n = makeNoise(seed);
  const r = rng(seed + 9);
  return pixelCanvas(w, h, (x, y) => {
    const v = n.fbm(x * scale, y * scale, 5);
    const fine = n.noise(x * 0.4, y * 0.4);
    let k = 1 + (v - 0.5) * 2 * contrast + (fine - 0.5) * 0.12;
    if (r() < 0.015) k *= 0.7;
    return [base[0] * k, base[1] * k, base[2] * k, 255];
  });
}

/** Grain overlay tile (gray, transparent-ish): drawn over the frame each tick at a random offset. */
export function grainTile(size = 256) {
  const r = rng(77);
  return pixelCanvas(size, size, () => { const v = r() * 255; return [v, v, v, 255]; });
}
