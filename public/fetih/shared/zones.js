// TikTok LIVE safe zones for a portrait 1080x1920 stage (design units). Same numbers as
// Plaka Savaşları (game/js/hud.js DEFAULT_ZONES, game/config/game.json hud.tiktokZones).
// TikTok covers the top (header), the bottom-left (chat), the bottom edge and a right column
// of the lower half. Everything viewers must see belongs between `top` and `chatTop`, and
// between the side insets (`side`: a 9:16 stream on a taller phone is cropped left and right).
// `chatTop` and `side` are stream-wide streamer settings (layout.chatTop, layout.side).

export const STAGE_W = 1080;
export const STAGE_H = 1920;
export const DEFAULT_ZONES = { top: 230, chatTop: 1340, chatRight: 720, bottomBar: 130, rightColLeft: 900, rightColTop: 1000, side: 60 };

/** Zones with the streamer's chatTop / side applied (clamped to the panel's ranges). */
export function zonesFrom({ chatTop, side } = {}) {
  const z = { ...DEFAULT_ZONES };
  if (Number.isFinite(chatTop)) z.chatTop = Math.min(1500, Math.max(1150, chatTop));
  if (Number.isFinite(side)) z.side = Math.min(120, Math.max(0, side));
  return z;
}

/** Scale and offset that fit the 1080x1920 stage into a w x h viewport (letterboxed, centred). */
export function fitStage(w, h) {
  const u = Math.min(w / STAGE_W, h / STAGE_H);
  return { u, x: (w - STAGE_W * u) / 2, y: (h - STAGE_H * u) / 2, w: STAGE_W * u, h: STAGE_H * u };
}

/** The always-visible area in design units: { x, y, w, h }. */
export function safeRect(z = DEFAULT_ZONES) {
  return { x: z.side, y: z.top, w: STAGE_W - 2 * z.side, h: z.chatTop - z.top };
}

/**
 * Positions `stageEl` (absolutely positioned) as the fitted 1080x1920 stage and sets CSS
 * variables on it: --u (px per design unit), --st (safe top), --sb (safe bottom = chatTop),
 * --sx (side inset). Lay out children with calc(var(--u) * N). Returns the fit.
 */
export function layoutStage(stageEl, z = DEFAULT_ZONES, w = innerWidth, h = innerHeight) {
  const f = fitStage(w, h);
  Object.assign(stageEl.style, { position: 'absolute', left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
  stageEl.style.setProperty('--u', `${f.u}px`);
  stageEl.style.setProperty('--st', String(z.top));
  stageEl.style.setProperty('--sb', String(z.chatTop));
  stageEl.style.setProperty('--sx', String(z.side));
  return f;
}

/** ?zones=1: draws the TikTok UI zones over the stage (alignment check). Returns the overlay. */
export function drawZones(stageEl, z = DEFAULT_ZONES) {
  stageEl.querySelector(':scope > .tt-zones')?.remove();
  const box = document.createElement('div');
  box.className = 'tt-zones';
  Object.assign(box.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '9999' });
  const H = STAGE_H;
  const rect = (x, y, w, h, label, color) => {
    const d = document.createElement('div');
    Object.assign(d.style, {
      position: 'absolute', left: `calc(var(--u) * ${x})`, top: `calc(var(--u) * ${y})`, width: `calc(var(--u) * ${w})`, height: `calc(var(--u) * ${h})`,
      background: color, outline: '1px dashed rgba(255,255,255,.6)', font: 'calc(var(--u) * 26) system-ui, sans-serif', color: '#fff', padding: 'calc(var(--u) * 8)',
    });
    d.textContent = label;
    box.append(d);
  };
  rect(0, 0, STAGE_W, z.top, `TikTok başlık / izleyici (0–${z.top})`, 'rgba(255,0,0,.25)');
  rect(0, z.chatTop, z.chatRight, H - z.bottomBar - z.chatTop, `TikTok sohbet (y ≥ ${z.chatTop})`, 'rgba(255,140,0,.25)');
  rect(z.rightColLeft, z.rightColTop, STAGE_W - z.rightColLeft, H - z.bottomBar - z.rightColTop, 'kalp / hediye', 'rgba(255,0,200,.22)');
  rect(0, H - z.bottomBar, STAGE_W, z.bottomBar, 'yorum kutusu / hediye / paylaş', 'rgba(255,0,0,.3)');
  if (z.side > 0) {
    rect(0, z.top, z.side, H - z.top - z.bottomBar, '', 'rgba(0,160,255,.2)');
    rect(STAGE_W - z.side, z.top, z.side, H - z.top - z.bottomBar, '', 'rgba(0,160,255,.2)');
  }
  stageEl.append(box);
  return box;
}
