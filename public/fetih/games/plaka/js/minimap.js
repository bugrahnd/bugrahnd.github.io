// Small always-on-top overview of who owns what, shown while the director camera is
// zoomed in. 2D canvas, redrawn a few times per second, with the current view outlined.
import { wzOf } from './map.js';
import { hexCss } from './colors.js';

export class Minimap {
  constructor(parent, provinces, widthPx = 300) {
    this.provinces = provinces;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    parent.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const p of provinces) for (const poly of p.polygons) for (const [x, y] of poly[0]) {
      const z = wzOf(y);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    this.b = { minX, maxX, minZ, maxZ };
    this.W = widthPx; this.H = Math.round(widthPx * (maxZ - minZ) / (maxX - minX));
    this.pad = 6;
    this.canvas.width = this.W + this.pad * 2; this.canvas.height = this.H + this.pad * 2;
    const sx = this.W / (maxX - minX);
    this.tx = (x) => this.pad + (x - minX) * sx;
    this.tz = (z) => this.pad + (z - minZ) * sx;
    this.paths = new Map();
    for (const p of provinces) {
      const path = new Path2D();
      for (const poly of p.polygons) for (const ring of poly) {
        ring.forEach(([x, y], i) => { const X = this.tx(x); const Y = this.tz(wzOf(y)); if (i) path.lineTo(X, Y); else path.moveTo(X, Y); });
        path.closePath();
      }
      this.paths.set(p.plate, path);
    }
    this.t = 0;
    this.shown = false;
    this.canvas.style.opacity = '0';
  }

  /** ownerHex(plate) -> colour; quad: visible ground polygon [[x,z]...] */
  update(dt, zoom, ownerHex, quad) {
    const want = zoom > 1.12;
    if (want !== this.shown) { this.shown = want; this.canvas.style.opacity = want ? '1' : '0'; }
    if (!want) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.2;
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.lineWidth = 0.6;
    c.strokeStyle = 'rgba(20,16,10,0.9)';
    for (const p of this.provinces) {
      const path = this.paths.get(p.plate);
      c.fillStyle = hexCss(ownerHex(p.plate));
      c.fill(path, 'evenodd');
      c.stroke(path);
    }
    if (quad && quad.length === 4) {
      c.beginPath();
      quad.forEach(([x, z], i) => { const X = this.tx(x); const Y = this.tz(z); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); });
      c.closePath();
      c.lineWidth = 2.5;
      c.strokeStyle = '#ffd166';
      c.stroke();
    }
  }
}
