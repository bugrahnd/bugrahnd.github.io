// 2D overlay drawn over the 3D view (design pixels): floating hit names (small), banners, the
// thrower name tags, a vignette and film grain.
import { grainTile } from './noise.js';

const MAX_POPUPS = 28;
export const fmt = (n) => Math.round(n).toLocaleString('tr-TR');
// size class -> [name px, damage px, life s]
const SIZES = [[22, 0, 1.1], [26, 22, 1.6], [30, 26, 1.9], [46, 0, 2.4]];

export class Overlay {
  constructor() {
    this.popups = [];
    this.grain = null;
    this.vignette = null;
  }

  /** Floating name at a hit. size: 0 like, 1 gift, 2 huge. */
  popup(x, y, name, dmg, size = 0, color = '#ffffff') {
    if (this.popups.length >= MAX_POPUPS) this.popups.shift();
    const p = { x: x + (Math.random() - 0.5) * 110, y: y - 30 - Math.random() * 40, name, dmg, size, color, age: 0, life: SIZES[size][2] };
    p.x = Math.max(170, Math.min(890, p.x));
    p.y = Math.max(520, p.y);
    this.popups.push(p);
  }

  banner(text, color, y = 1080) {
    this.popups.push({ x: 540, y, name: text, dmg: 0, size: 3, color, age: 0, life: SIZES[3][2], banner: true });
  }

  laugh(text, x, y) { this.popups.push({ x, y, name: text, dmg: 0, size: 2, color: '#ff8a64', age: 0, life: 1.4 }); }

  update(dt) {
    for (const p of this.popups) p.age += dt;
    this.popups = this.popups.filter((p) => p.age < p.life);
  }

  draw(g, W, H, labels = []) {
    if (!this.vignette) {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const vg = c.getContext('2d');
      const gr = vg.createRadialGradient(W / 2, H * 0.45, H * 0.32, W / 2, H * 0.45, H * 0.78);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(3,0,10,0.32)');
      vg.fillStyle = gr; vg.fillRect(0, 0, W, H);
      this.vignette = c;
      this.grain = g.createPattern(grainTile(256), 'repeat');
    }
    g.drawImage(this.vignette, 0, 0);
    g.save();
    g.globalAlpha = 0.045; g.globalCompositeOperation = 'overlay';
    g.translate(-Math.floor(Math.random() * 256), -Math.floor(Math.random() * 256));
    g.fillStyle = this.grain; g.fillRect(0, 0, W + 256, H + 256);
    g.restore();

    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    // thrower name tags
    for (const l of labels) {
      g.globalAlpha = l.alpha;
      g.font = '800 20px Nunito, system-ui, sans-serif';
      const txt = l.combo > 1 ? `${l.name}  ×${l.combo}` : l.name;
      const w = g.measureText(txt).width + 22;
      const sc = 1 + l.pulse * 0.25;
      g.save(); g.translate(l.x, l.y); g.scale(sc, sc);
      g.fillStyle = 'rgba(6,12,28,0.85)'; roundRect(g, -w / 2, -14, w, 28, 14); g.fill();
      g.strokeStyle = l.color; g.lineWidth = 2; roundRect(g, -w / 2, -14, w, 28, 14); g.stroke();
      g.fillStyle = '#f3e6c8'; g.fillText(txt, 0, 1);
      g.restore();
    }
    g.globalAlpha = 1;
    // popups
    for (const p of this.popups) {
      const k = p.age / p.life;
      const pop = Math.min(1, p.age / 0.12);
      const [fs, ds] = SIZES[p.size];
      const sc = (0.65 + 0.35 * pop) + (pop < 1 ? 0.2 : 0);
      const y = p.y - k * (p.banner ? 30 : 60);
      g.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      g.save(); g.translate(p.x, y); g.scale(sc, sc);
      g.font = `${fs}px Paytone, sans-serif`;
      g.lineWidth = Math.max(5, fs * 0.22); g.strokeStyle = 'rgba(8,4,16,0.9)';
      g.strokeText(p.name, 0, 0);
      g.fillStyle = p.color; g.fillText(p.name, 0, 0);
      if (p.dmg && ds) {
        g.font = `${ds}px Paytone, sans-serif`;
        const t = `-${fmt(p.dmg)}`;
        g.lineWidth = Math.max(4, ds * 0.22); g.strokeText(t, 0, fs * 0.95);
        g.fillStyle = '#ff8a6b'; g.fillText(t, 0, fs * 0.95);
      }
      g.restore();
    }
    g.globalAlpha = 1;
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
