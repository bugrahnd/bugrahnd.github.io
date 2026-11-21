// DOM overlays anchored to the 3D map: plate badges (always visible), army counters,
// floating "+N" texts, viewer name tags (joins, gifts) and komutan badges.
// All untrusted text goes through textContent.
import * as THREE from 'three';
import { TILE_H, wzOf } from './map.js';
import { fmtShort as fmt, cleanNick, safeImageUrl, setNameBadge, badgeKey, pointInProvince } from './util.js';
import { hexCss } from './colors.js';

const _v = new THREE.Vector3();
const SVG_NS = 'http://www.w3.org/2000/svg';

export const provCode = (p) => (typeof p.code === 'string' && p.code ? p.code : String(p.plate).padStart(2, '0'));

/** Project a world point to viewport px; returns false when behind the camera. */
function toScreen(x, y, z, camera, w, h, out) {
  _v.set(x, y, z).project(camera);
  if (_v.z > 1) return false;
  out.x = (_v.x * 0.5 + 0.5) * w;
  out.y = (-_v.y * 0.5 + 0.5) * h;
  return true;
}

export class PlateLabels {
  constructor(container, provinces, config) {
    this.cfg = config.visual;
    this.root = document.createElement('div');
    this.root.className = 'plates';
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'plate-leaders');
    container.append(this.svg, this.root);
    this.items = new Map();
    for (const p of provinces) {
      const el = document.createElement('div');
      el.className = 'plate neutral';
      const code = provCode(p);
      if (code.length > 2) el.classList.add('wide');
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = code;
      const gar = document.createElement('span');
      gar.className = 'gar';
      el.append(num);
      if (this.cfg.showGarrisonOnPlates) el.append(gar);
      // Tiny provinces get a smaller plate so the map colour stays visible around it.
      const small = (p.area || 1e9) < (this.cfg.plateSmallArea ?? 0);
      const ps = small ? (this.cfg.plateSmallScale ?? 0.8) : 1;
      if (small) el.style.setProperty('--ps', String(ps));
      if ((this.cfg.plateTroops ?? 'owned') === 'owned') el.classList.add('troops-owned');
      this.root.append(el);
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'leader');
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('r', '3');
      dot.setAttribute('class', 'leader-dot');
      this.svg.append(line, dot);
      this.items.set(p.plate, {
        p, el, num, gar, line, dot, chars: code.length, ps,
        // Anchored a little north of the label point; the castle stands just south of it.
        anchor: new THREE.Vector3(p.labelPoint[0], TILE_H, wzOf(p.labelPoint[1] + 3)),
        ox: 0, oy: 0, w: 0, h: 0, lastGar: -1, color: null, cls: 'neutral',
      });
    }
    this.lastVersion = -1;
    this.pt = { x: 0, y: 0 };
  }

  setOwner(plate, hex, kind) {
    const it = this.items.get(plate);
    if (!it) return;
    const css = hexCss(hex);
    if (it.color !== css) { it.el.style.setProperty('--c', css); it.color = css; }
    if (it.cls !== kind) {
      it.el.classList.remove(it.cls);
      it.el.classList.add(kind);
      it.cls = kind;
    }
  }

  pulse(plate) {
    const it = this.items.get(plate);
    if (!it) return;
    // Flag change: a short, modest pop (labels never balloon). Animate the number, not the
    // positioned plate: the CSS `scale` property would also scale the plate's translate().
    it.num.animate([{ scale: 1.35 }, { scale: 1 }], { duration: 700, easing: 'ease-out' });
  }

  /** A viewer joined / gifted for this province: glowing ring so they can find it. */
  highlight(plate, hex) {
    const it = this.items.get(plate);
    if (!it) return;
    it.el.style.setProperty('--hl', hexCss(hex));
    it.el.classList.remove('lit');
    void it.el.offsetWidth; // restart the CSS animation
    it.el.classList.add('lit');
    clearTimeout(it.litT);
    it.litT = setTimeout(() => it.el.classList.remove('lit'), (this.cfg.highlightSec ?? 3) * 1000);
  }

  _extra(it, key, cls, tag = 'div') {
    if (!it[key]) { it[key] = document.createElement(tag); it[key].className = cls; it.el.append(it[key]); }
    return it[key];
  }

  /** Team morale under its home plate (likes fill it); flash when HÜCUM starts. */
  setMorale(plate, frac, boosted = false, hucum = false) {
    const it = this.items.get(plate);
    if (!it) return;
    const k = `${frac.toFixed(2)}|${boosted}|${hucum}`;
    if (it.morK === k) return;
    it.morK = k;
    const bar = this._extra(it, 'mor', 'mor');
    if (!bar.firstChild) bar.append(document.createElement('i'));
    bar.style.display = frac > 0.01 || hucum ? '' : 'none';
    bar.firstChild.style.transform = `scaleX(${frac.toFixed(3)})`;
    bar.classList.toggle('hucum', hucum);
  }

  /** Comeback multiplier flag ("İSYAN x2"); 0 hides it. */
  setComeback(plate, mult) {
    const it = this.items.get(plate);
    if (!it || it.cbK === mult) return;
    it.cbK = mult;
    const f = this._extra(it, 'cb', 'x2');
    f.textContent = mult ? `İSYAN x${mult}` : '';
    f.style.display = mult ? '' : 'none';
  }

  /** Komutan's name at the capital, for the round. */
  setCommander(plate, nick) {
    const it = this.items.get(plate);
    if (!it || it.cmK === nick) return;
    it.cmK = nick;
    const s = this._extra(it, 'cm', 'cmdn');
    s.textContent = nick ? `👑 ${nick}` : '';
    s.style.display = nick && !it.conq ? '' : 'none';
  }

  /** "Fetheden: <ad> <emoji>" on a province taken thanks to one viewer's gift. */
  setConqueror(plate, nick, badge = null, sec = 20) {
    const it = this.items.get(plate);
    if (!it) return;
    clearTimeout(it.conqT);
    const s = this._extra(it, 'cq', 'conq');
    if (!nick) { it.conq = false; s.style.display = 'none'; if (it.cm) it.cm.style.display = it.cmK ? '' : 'none'; return; }
    it.conq = true;
    s.replaceChildren('Fetheden: ');
    const n = document.createElement('span');
    setNameBadge(n, nick, badge);
    s.append(n);
    s.style.display = '';
    if (it.cm) it.cm.style.display = 'none';
    s.animate([{ opacity: 0, transform: 'translateX(-50%) scale(0.6)' }, { opacity: 1, transform: 'translateX(-50%) scale(1)' }], { duration: 400, easing: 'ease-out' });
    it.conqT = setTimeout(() => this.setConqueror(plate, null), sec * 1000);
  }

  clearExtras() {
    for (const [plate, it] of this.items) {
      if (it.mor) { it.mor.style.display = 'none'; it.morK = ''; }
      if (it.cq) this.setConqueror(plate, null);
      this.setCommander(plate, null);
      this.setComeback(plate, 0);
    }
  }

  setGarrison(plate, n) {
    const it = this.items.get(plate);
    const r = Math.round(n);
    if (r === it.lastGar) return;
    it.lastGar = r;
    it.gar.textContent = fmt(r);
  }

  /** Overlap relaxation in screen space, run on resize (overview camera). */
  layout(camera, w, h, sizePx, rect = null) {
    this.root.style.setProperty('--plate-size', `${sizePx}px`);
    const list = [...this.items.values()];
    for (const it of list) {
      _v.copy(it.anchor).project(camera);
      it.ax = (_v.x * 0.5 + 0.5) * w;
      it.ay = (-_v.y * 0.5 + 0.5) * h;
      const s = sizePx * it.ps;
      it.w = s * (it.chars > 2 ? 0.55 * it.chars + 0.35 : 1.3);
      it.h = s * (this.cfg.showGarrisonOnPlates ? 1.5 : 1.1);
      it.x = it.ax; it.y = it.ay;
    }
    const pad = sizePx * 0.03;
    // Plates stay near their province: a capped nudge, never a long trip across the map.
    const maxOff = sizePx * 1.1;
    const cap = (it) => {
      const dx = it.x - it.ax; const dy = it.y - it.ay; const d = Math.hypot(dx, dy);
      if (d > maxOff) { it.x = it.ax + (dx / d) * maxOff; it.y = it.ay + (dy / d) * maxOff; }
    };
    for (let iter = 0; iter < 160; iter++) {
      let moved = false;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          const ox = (a.w + b.w) / 2 + pad - Math.abs(a.x - b.x);
          const oy = (a.h + b.h) / 2 + pad - Math.abs(a.y - b.y);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          if (ox < oy * 1.3) {
            const s = (a.x < b.x ? -1 : 1) * ox * 0.5;
            a.x += s; b.x -= s;
          } else {
            const s = (a.y < b.y ? -1 : 1) * oy * 0.5;
            a.y += s; b.y -= s;
          }
        }
      }
      for (const it of list) { it.x += (it.ax - it.x) * 0.02; it.y += (it.ay - it.y) * 0.02; cap(it); }
      if (!moved) break;
    }
    // Never clipped by the frame edge.
    if (rect) {
      for (const it of list) {
        const m = 3;
        it.x = Math.min(rect.x + rect.w - it.w / 2 - m, Math.max(rect.x + it.w / 2 + m, it.x));
        it.y = Math.min(rect.y + rect.h - it.h / 2 - m, Math.max(rect.y + it.h / 2 + m, it.y));
      }
    }
    for (const it of list) { it.ox = it.x - it.ax; it.oy = it.y - it.ay; }
    this.lastVersion = -1;
  }

  update(camera, w, h, version, zoom = 1) {
    if (version === this.lastVersion) return;
    this.lastVersion = version;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    // Overview de-overlap offsets shrink as the camera zooms in (natural spacing grows).
    const k = 1 / Math.max(1, zoom * zoom);
    const pt = this.pt;
    for (const it of this.items.values()) {
      if (!toScreen(it.anchor.x, it.anchor.y, it.anchor.z, camera, w, h, pt)) continue;
      const ax = pt.x; const ay = pt.y;
      const x = ax + it.ox * k; const y = ay + it.oy * k;
      it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      const far = Math.hypot(it.ox * k, it.oy * k) > it.h * 0.5;
      if (far) {
        it.line.setAttribute('x1', ax.toFixed(1)); it.line.setAttribute('y1', ay.toFixed(1));
        it.line.setAttribute('x2', x.toFixed(1)); it.line.setAttribute('y2', y.toFixed(1));
        it.dot.setAttribute('cx', ax.toFixed(1)); it.dot.setAttribute('cy', ay.toFixed(1));
      }
      if (far !== it.far) {
        it.far = far;
        it.line.style.display = far ? '' : 'none';
        it.dot.style.display = far ? '' : 'none';
      }
    }
  }
}

/**
 * Territory names (visual.mapLabels "territory", the default): one big name per team over its
 * land instead of 82 plate badges. The name is the team's home city, placed at the area-weighted
 * centre of its largest connected block and sized by that block's area; under it a small line
 * with the komutan and the member count, and the HÜCUM morale bar. Names are placed biggest
 * first; one that would overlap a bigger one shrinks to its plate code, and is hidden when even
 * that does not fit. Landless teams (rebelling) show a small "İSYAN" name at home.
 * It also takes the PlateLabels calls the game makes (highlight, setMorale, setCommander, ...).
 */
export class TerritoryLabels {
  constructor(container, provinces, config) {
    this.cfg = config.visual;
    this.root = document.createElement('div');
    this.root.className = 'terr-labels';
    container.append(this.root);
    this.prov = new Map(provinces.map((p) => [p.plate, p]));
    const areas = provinces.map((p) => p.area || 0).sort((a, b) => a - b);
    this.unitArea = areas[Math.floor(areas.length / 2)] || 1; // median province
    this.items = new Map(); // team plate -> label
    this.morale = new Map(); // team plate -> { frac, hucum }
    this.size = 22;
    this.game = null;
    this.dataT = 0;
    this.dirty = true;
    this.lastVersion = -1;
    this.pt = { x: 0, y: 0 };
    this.rect = null;
  }

  bind(game) { this.game = game; }

  _item(plate) {
    let it = this.items.get(plate);
    if (it) return it;
    const el = document.createElement('div');
    el.className = 'terr';
    const name = document.createElement('div'); name.className = 'terr-name';
    const sub = document.createElement('div'); sub.className = 'terr-sub';
    const mor = document.createElement('div'); mor.className = 'terr-mor';
    mor.append(document.createElement('i'));
    el.append(name, sub, mor);
    this.root.append(el);
    it = { el, name, sub, mor, anchor: new THREE.Vector3(), nameK: '', subK: '', morK: '', mode: '', px: 0, w: 0, h: 0, vis: true };
    this.items.set(plate, it);
    return it;
  }

  /** Re-reads ownership from the game (cheap: 82 provinces); called a few times a second. */
  refresh() {
    const g = this.game;
    if (!g) return;
    const seen = new Set();
    for (const t of g.teams.values()) {
      if (!t.awake && !t.provinces) continue;
      const own = [];
      for (const pv of g.prov.values()) if (pv.owner === t.plate) own.push(pv);
      let block = null; let area = 0;
      if (own.length) {
        // Largest connected block of the team's land.
        const left = new Set(own.map((pv) => pv.plate));
        while (left.size) {
          const start = left.values().next().value; left.delete(start);
          const comp = [start]; let a = 0;
          for (let i = 0; i < comp.length; i++) {
            a += this.prov.get(comp[i]).area || 0;
            for (const n of g.prov.get(comp[i]).adj) if (left.has(n)) { left.delete(n); comp.push(n); }
          }
          if (a > area) { area = a; block = comp; }
        }
      }
      const it = this._item(t.plate);
      seen.add(t.plate);
      let x; let y;
      if (block) {
        let sx = 0; let sy = 0; let sa = 0;
        for (const pl of block) { const p = this.prov.get(pl); const a = p.area || 1; sx += p.labelPoint[0] * a; sy += p.labelPoint[1] * a; sa += a; }
        x = sx / sa; y = sy / sa;
        // Concave land: a centre outside it snaps to the nearest own label point.
        if (!block.some((pl) => pointInProvince(x, y, this.prov.get(pl)))) {
          let best = null; let bd = Infinity;
          for (const pl of block) { const p = this.prov.get(pl); const d = (p.labelPoint[0] - x) ** 2 + (p.labelPoint[1] - y) ** 2; if (d < bd) { bd = d; best = p; } }
          x = best.labelPoint[0]; y = best.labelPoint[1];
        }
      } else {
        const p = this.prov.get(t.plate); x = p.labelPoint[0]; y = p.labelPoint[1];
      }
      it.anchor.set(x, TILE_H, wzOf(y));
      it.weight = block ? area : 0;
      it.landless = !block;
      it.color = hexCss(t.colorHex);
      it.provinces = t.provinces;
      // Size by land: one median province = 1, grows with the square root of the area.
      const s = Math.sqrt((block ? area : this.unitArea * 0.5) / this.unitArea);
      it.k = Math.min(2.6, Math.max(0.62, 0.5 + 0.42 * s));
      const nameText = t.name.toLocaleUpperCase('tr');
      if (it.nameK !== nameText) { it.nameK = nameText; it.name.textContent = nameText; }
      it.code = provCode(this.prov.get(t.plate));
      const cmd = t.commander?.nick || '';
      const subText = it.landless ? (t.memberCount ? `İSYAN · ${t.memberCount} kişi` : 'İSYAN')
        : [cmd ? `👑 ${cmd}` : '', t.memberCount ? `${t.memberCount} kişi` : ''].filter(Boolean).join(' · ');
      if (it.subK !== subText) { it.subK = subText; it.sub.textContent = subText; }
      if (it.colorK !== it.color) { it.colorK = it.color; it.el.style.setProperty('--c', it.color); }
      it.el.classList.toggle('landless', it.landless);
      const m = this.morale.get(t.plate);
      const mk = m ? `${m.frac.toFixed(2)}|${m.hucum}` : '';
      if (it.morK !== mk) {
        it.morK = mk;
        const show = m && (m.frac > 0.01 || m.hucum);
        it.mor.style.display = show ? '' : 'none';
        if (show) it.mor.firstChild.style.transform = `scaleX(${m.hucum ? 1 : m.frac.toFixed(3)})`;
        it.mor.classList.toggle('hucum', !!m?.hucum);
      }
    }
    for (const [plate, it] of this.items) {
      if (seen.has(plate)) continue;
      it.el.remove();
      this.items.delete(plate);
    }
    this.lastVersion = -1; // re-place on the next frame
  }

  layout(camera, w, h, sizePx, rect = null) {
    this.size = sizePx;
    this.rect = rect;
    this.lastVersion = -1;
  }

  update(camera, w, h, version, zoom = 1, dt = 0) {
    this.dataT -= dt;
    if (this.dataT <= 0) { this.dataT = 0.5; this.refresh(); }
    if (version === this.lastVersion) return;
    this.lastVersion = version;
    // Zoomed in, names grow a little with the map (not fully: they must not cover it).
    const zk = Math.pow(Math.max(1, zoom), 0.5);
    const list = [...this.items.values()].sort((a, b) => b.weight - a.weight);
    const placed = [];
    const pt = this.pt;
    const r = this.rect;
    for (const [idx, it] of list.entries()) {
      if (!toScreen(it.anchor.x, it.anchor.y, it.anchor.z, camera, w, h, pt)) { this._hide(it); continue; }
      const base = this.size * zk;
      // The komutan / member line only under the big territories (the rest stays clean).
      const sub = !!it.subK && (idx < 6 || it.k >= 1.05);
      if (it.subOn !== sub) { it.subOn = sub; it.el.classList.toggle('nosub', !sub); }
      // Full name, else the plate code, else hidden (overlap with a bigger territory).
      let mode = '';
      for (const m of ['full', 'code']) {
        const px = base * (m === 'full' ? it.k : 0.8);
        const chars = m === 'full' ? it.nameK.length : it.code.length;
        const bw = px * (0.62 * chars + 0.4);
        const bh = px * (m === 'full' && sub ? 1.75 : 1.15);
        const box = { x0: pt.x - bw / 2, x1: pt.x + bw / 2, y0: pt.y - px * 0.6, y1: pt.y - px * 0.6 + bh };
        if (r && (box.x0 < r.x || box.x1 > r.x + r.w || box.y0 < r.y || box.y1 > r.y + r.h)) {
          // Clamp into the band instead of dropping a name at the edge.
          const dx = Math.max(0, r.x - box.x0) - Math.max(0, box.x1 - (r.x + r.w));
          box.x0 += dx; box.x1 += dx;
        }
        if (placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
        placed.push(box);
        mode = m; it.px = px; it.cx = (box.x0 + box.x1) / 2; it.cy = pt.y;
        break;
      }
      if (!mode) { this._hide(it); continue; }
      if (!it.vis) { it.vis = true; it.el.style.display = ''; }
      if (it.mode !== mode) {
        it.mode = mode;
        it.name.textContent = mode === 'full' ? it.nameK : it.code;
        it.el.classList.toggle('code', mode === 'code');
      }
      const tz = `${it.px.toFixed(1)}px`;
      if (it.tzK !== tz) { it.tzK = tz; it.el.style.setProperty('--tz', tz); }
      const tr = `translate(${it.cx.toFixed(1)}px, ${it.cy.toFixed(1)}px) translate(-50%, -0.6em)`;
      if (it.trK !== tr) { it.trK = tr; it.el.style.transform = tr; }
    }
  }

  _hide(it) { if (it.vis) { it.vis = false; it.el.style.display = 'none'; } }

  /** A viewer joined / gifted: the team's name pops so they can find it. */
  highlight(plate) {
    const g = this.game;
    const owner = g?.prov.get(plate)?.owner || plate;
    const it = this.items.get(owner);
    if (!it) return;
    it.name.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)', filter: 'brightness(1.6)' }, { transform: 'scale(1)' }], { duration: 900, easing: 'ease-out' });
  }

  pulse(plate) { this.highlight(plate); this.dataT = 0; }
  setMorale(plate, frac, boosted = false, hucum = false) { this.morale.set(plate, { frac, hucum }); }
  setOwner() { this.dataT = Math.min(this.dataT, 0.1); }
  setComeback() {}
  setCommander() {}
  setConqueror() {}
  setGarrison() {}
  clearExtras() { this.morale.clear(); this.dataT = 0; }
}

/** Pooled army counters ("1.250" + optional gifter name). */
export class ArmyLabels {
  constructor(container) {
    this.root = document.createElement('div');
    this.root.className = 'army-labels';
    container.append(this.root);
    this.pool = [];
    this.live = new Map(); // army -> el record
    this.pt = { x: 0, y: 0 };
  }

  _get() {
    let r = this.pool.pop();
    if (!r) {
      const el = document.createElement('div');
      el.className = 'army-label';
      const n = document.createElement('span'); n.className = 'n';
      const who = document.createElement('span'); who.className = 'who';
      el.append(n, who);
      r = { el, n, who, lastN: -1, lastWho: null };
      this.root.append(el);
    }
    r.el.style.display = '';
    return r;
  }

  /** busyMin > 0: heavy traffic in the overview, only armies this big (or big gifts) get a counter. */
  update(armies, camera, w, h, zoom = 1, unitK = 1, busyMin = 0) {
    const seen = new Set();
    // In the overview only sizeable or named armies get a counter (less clutter).
    const overview = zoom <= 1.3;
    const minTroops = overview ? Math.max(40, busyMin) : 0;
    for (const a of armies) {
      if (a.appear < 0.2 || a.kind === 'move') continue;
      if (a.troops < minTroops && !a.big && (!a.nick || (overview && busyMin > 0))) continue;
      let r = this.live.get(a);
      if (!r) {
        r = this._get();
        this.live.set(a, r);
        r.el.style.setProperty('--c', hexCss(a.colorHex));
        r.el.classList.toggle('big', !!a.big);
        r.el.classList.toggle('rebel', a.kind === 'rebel');
      }
      seen.add(a);
      const n = Math.round(a.troops);
      if (n !== r.lastN) { r.lastN = n; r.n.textContent = fmt(n); }
      const who = a.nick || '';
      if (who !== r.lastWho) {
        r.lastWho = who;
        r.who.textContent = who ? cleanNick(who, 18) : '';
        r.who.style.display = who ? '' : 'none';
      }
      if (!toScreen(a.x, TILE_H + 14 * unitK, a.z, camera, w, h, this.pt)) continue;
      r.el.style.transform = `translate(${this.pt.x.toFixed(1)}px, ${this.pt.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (const [a, r] of this.live) {
      if (seen.has(a)) continue;
      this.live.delete(a);
      r.el.style.display = 'none';
      this.pool.push(r);
    }
  }
}

/** Floating texts (+N troops, hearts...) using the Web Animations API. */
export class Floaters {
  constructor(container, max) {
    this.root = document.createElement('div');
    this.root.className = 'floaters';
    container.append(this.root);
    this.max = max;
    this.pool = [];
    this.active = 0;
  }

  spawn(worldPos, text, cssColor, camera, w, h, big = false, size = '') {
    if (this.active >= this.max) return;
    let el = this.pool.pop();
    if (!el) { el = document.createElement('div'); el.className = 'floater'; this.root.append(el); }
    el.classList.toggle('tiny', size === 'tiny');
    el.classList.toggle('like', size === 'like');
    _v.copy(worldPos).project(camera);
    const x = (_v.x * 0.5 + 0.5) * w + (Math.random() - 0.5) * 24;
    const y = (-_v.y * 0.5 + 0.5) * h - 14;
    el.textContent = text;
    el.style.color = cssColor;
    el.classList.toggle('big', big);
    el.style.display = '';
    this.active++;
    const anim = el.animate([
      { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(0.5)`, opacity: 0 },
      { transform: `translate(${x}px, ${y - 22}px) translate(-50%, -50%) scale(1.15)`, opacity: 1, offset: 0.15 },
      { transform: `translate(${x}px, ${y - 40}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${x}px, ${y - 80}px) translate(-50%, -50%) scale(0.95)`, opacity: 0 },
    ], { duration: big ? 2400 : 1600, easing: 'ease-out' });
    anim.onfinish = () => { el.style.display = 'none'; this.pool.push(el); this.active--; };
  }
}

function avatarInto(wrap, url, nick, colorCss) {
  // Letter fallback underneath, image on top once loaded.
  wrap.style.setProperty('--c', colorCss);
  const fb = wrap.firstChild; const img = wrap.lastChild;
  fb.textContent = (Array.from((nick || '?').trim())[0] || '?').toLocaleUpperCase('tr');
  const safe = safeImageUrl(url);
  img.style.display = 'none';
  if (safe) { img.onload = () => { img.style.display = ''; }; img.src = safe; } else img.removeAttribute('src');
}

function makeAvatarEl(cls) {
  const wrap = document.createElement('div');
  wrap.className = 'avatar ' + cls;
  const fb = document.createElement('span'); fb.className = 'avatar-fb';
  const img = document.createElement('img'); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
  img.onerror = () => { img.style.display = 'none'; };
  wrap.append(fb, img);
  return wrap;
}

/**
 * Viewer name tags that pop up at a province (joins, gifts), tracking the map as the
 * camera moves. Sizes: s (join), m (small gift), l (medium gift), xl (big gift).
 */
export class WorldTags {
  constructor(container, max = 8) {
    this.root = document.createElement('div');
    this.root.className = 'world-tags';
    container.append(this.root);
    this.max = max;
    this.pool = [];
    this.live = []; // { el, x, z, until, born, size, rank }
    this.pt = { x: 0, y: 0 };
    this.t = 0;
  }

  _get() {
    let r = this.pool.pop();
    if (!r) {
      // Outer element is positioned by transform; the pill inside carries the pop-in
      // scale (a CSS `scale` on the outer one would also scale its translate()).
      const el = document.createElement('div');
      el.className = 'wtag';
      const pill = document.createElement('div'); pill.className = 'wtag-in';
      const av = makeAvatarEl('tag');
      const txt = document.createElement('div'); txt.className = 'wtag-text';
      const nick = document.createElement('div'); nick.className = 'wtag-nick';
      const msg = document.createElement('div'); msg.className = 'wtag-msg';
      txt.append(nick, msg);
      pill.append(av, txt);
      el.append(pill);
      this.root.append(el);
      r = { el, pill, av, nick, msg };
    }
    return r;
  }

  /** o: { x, z, nick, badge, avatar, text, colorHex, size, sec } */
  spawn(o) {
    const rank = { s: 0, m: 1, l: 2, xl: 3 }[o.size] ?? 0;
    // Small tags never take the last slots (kept for big gifts), fewer in the overview.
    const cap = Math.min(this.max, this.maxNow ?? this.max);
    if (rank <= 1 && this.live.length >= cap - 1) {
      if (this.live.some((t) => t.rank > rank)) return;
    }
    if (this.live.length >= cap) {
      // Replace the oldest tag of the lowest rank, if the new one is at least as important.
      let worst = -1;
      for (let i = 0; i < this.live.length; i++) {
        if (worst < 0 || this.live[i].rank < this.live[worst].rank || (this.live[i].rank === this.live[worst].rank && this.live[i].born < this.live[worst].born)) worst = i;
      }
      if (this.live[worst].rank > rank) return;
      this._release(worst);
    }
    const r = this._get();
    r.el.className = `wtag size-${o.size || 's'}`;
    r.el.style.setProperty('--c', hexCss(o.colorHex));
    avatarInto(r.av, o.avatar, o.nick, hexCss(o.colorHex));
    setNameBadge(r.nick, o.nick, o.badge);
    r.msg.textContent = o.text || '';
    r.msg.style.display = o.text ? '' : 'none';
    r.el.style.display = '';
    const sec = o.sec || 2.4;
    r.pill.animate([
      { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1.12, offset: 0.1 }, { opacity: 1, scale: 1, offset: 0.18 },
      { opacity: 1, scale: 1, offset: 0.85 }, { opacity: 0, scale: 0.9 },
    ], { duration: sec * 1000, easing: 'ease-out' });
    // Join: the name flies in from the call-to-action area to the province.
    if (o.fly && this.cam && toScreen(o.x, TILE_H + 10, o.z, this.cam, this.w, this.h, this.pt)) {
      const dx = this.w / 2 - this.pt.x; const dy = this.h * 0.86 - this.pt.y;
      r.el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: 750, easing: 'cubic-bezier(.2,.7,.3,1)' });
    }
    // Stack: older tags at the same spot move up out of the way.
    const push = [44, 54, 70, 96][rank] * (this.k || 1);
    for (const it of this.live) if ((it.x - o.x) ** 2 + (it.z - o.z) ** 2 < 40 * 40) it.lift += push;
    // Size for keeping the tag inside the map band (measured once).
    this.live.push({ r, x: o.x, z: o.z, born: this.t, until: this.t + sec, rank, lift: 0, hw: r.el.offsetWidth / 2, hh: r.el.offsetHeight });
  }

  _release(i) {
    const it = this.live[i];
    it.r.el.style.display = 'none';
    this.pool.push(it.r);
    this.live.splice(i, 1);
  }

  update(dt, camera, w, h) {
    this.t += dt;
    this.cam = camera; this.w = w; this.h = h;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const it = this.live[i];
      if (this.t >= it.until) { this._release(i); continue; }
      it.lift += dt * 14;
      if (!toScreen(it.x, TILE_H + 10, it.z, camera, w, h, this.pt)) continue;
      let x = this.pt.x; let y = this.pt.y - it.lift;
      const b = this.band;
      if (b) {
        // Name tags never leave the map band (anchor: bottom centre of the tag).
        const m = 4;
        x = Math.min(Math.max(x, b.x + it.hw + m), b.x + b.w - it.hw - m);
        // Vertically inside the fitted map area: clear of the instruction line and HÜCUM bar.
        const f = b.fit || b;
        y = Math.min(Math.max(y, f.y + it.hh + m), f.y + f.h - m);
      }
      it.r.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  clear() { while (this.live.length) this._release(0); }
}

/** Komutan badges (avatar + crown) standing at the capitals of the leading teams. */
export class CommanderBadges {
  constructor(container, assets, n = 3) {
    this.root = document.createElement('div');
    this.root.className = 'cmd-badges';
    container.append(this.root);
    this.items = [];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'cmd-badge rank' + (i + 1);
      const crown = document.createElement('img'); crown.className = 'cmd-crown'; crown.src = assets.uiPath('icon_crown'); crown.alt = '';
      const av = makeAvatarEl('cmd');
      const name = document.createElement('div'); name.className = 'cmd-badge-name';
      el.append(crown, av, name);
      el.style.display = 'none';
      this.root.append(el);
      this.items.push({ el, av, name, key: '', x: 0, z: 0, on: false });
    }
    this.pt = { x: 0, y: 0 };
  }

  /** list: [{ x, z, nick, badge, avatar, colorHex }] (leaders first) */
  set(list) {
    this.items.forEach((it, i) => {
      const d = list[i];
      if (!d) { if (it.on) { it.el.style.display = 'none'; it.on = false; it.key = ''; } return; }
      const key = `${d.nick}|${d.avatar}|${d.colorHex}|${badgeKey(d.badge)}`;
      if (key !== it.key) {
        it.key = key;
        avatarInto(it.av, d.avatar, d.nick, hexCss(d.colorHex));
        setNameBadge(it.name, d.nick, d.badge);
        it.el.style.setProperty('--c', hexCss(d.colorHex));
        it.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' });
      }
      it.x = d.x; it.z = d.z;
      if (!it.on) { it.el.style.display = ''; it.on = true; }
    });
  }

  update(camera, w, h, unitK = 1, zoom = 1, plateH = 40) {
    // Smaller in the overview; always above the plate badge.
    const s = Math.min(1, 0.62 + (zoom - 1) * 0.3);
    for (const it of this.items) {
      if (!it.on) continue;
      if (!toScreen(it.x, TILE_H + 26 * unitK, it.z, camera, w, h, this.pt)) continue;
      it.el.style.transform = `translate(${this.pt.x.toFixed(1)}px, ${(this.pt.y - plateH * 0.6).toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(2)})`;
    }
  }
}
