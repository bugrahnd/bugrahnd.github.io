/* ══════════════════════════════════════════════════════════════════
   Buğrahan Deveci — site behaviour
   theme · rail · intro · reveals · cursor · hero mesh · work grid
   · archive expander · journey rows · project modal
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const pad = (n) => (n < 10 ? '0' : '') + n;

  const projects = window.PROJECTS || [];
  const journey = window.JOURNEY || [];
  const byId = new Map(projects.map((p) => [p.id, p]));

  /* ── theme ─────────────────────────────────────────────────── */
  const Theme = {
    apply(t) {
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('bd-theme', t); } catch (e) { /* private mode */ }
      $$('[data-theme-opt]').forEach((b) => {
        b.setAttribute('aria-pressed', b.dataset.themeOpt === t ? 'true' : 'false');
      });
      requestAnimationFrame(() => Hero.readColors());
    },
    init() {
      let stored = null;
      try { stored = localStorage.getItem('bd-theme'); } catch (e) { stored = null; }
      const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
      this.apply(stored === 'dark' || stored === 'light' ? stored : (prefersDark ? 'dark' : 'light'));
      $$('[data-theme-opt]').forEach((b) => b.addEventListener('click', () => this.apply(b.dataset.themeOpt)));
    }
  };

  /* ── mobile menu ───────────────────────────────────────────── */
  function initMenu() {
    const menu = $('#mobileMenu');
    if (!menu) return;
    const open = () => { menu.classList.add('is-open'); document.body.classList.add('is-locked'); };
    const close = () => { menu.classList.remove('is-open'); document.body.classList.remove('is-locked'); };
    $('#menuBtn').addEventListener('click', open);
    $('#menuClose').addEventListener('click', close);
    $$('a', menu).forEach((a) => a.addEventListener('click', close));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  /* ── section rail + scene readout ──────────────────────────── */
  function initRail() {
    const items = $$('[data-rail-item]');
    const scenes = $$('[data-scene]');
    const out = $('#sceneReadout');
    if (!scenes.length) return;
    let active = -1, raf = null;

    const sync = () => {
      raf = null;
      const line = innerHeight * 0.38;
      let idx = 0;
      scenes.forEach((s, i) => { if (s.getBoundingClientRect().top <= line) idx = i; });
      if (idx === active) return;
      active = idx;
      items.forEach((el, i) => {
        const on = i === idx;
        const rule = $('.rail-rule', el);
        const num = $('.rail-num', el);
        if (rule) {
          rule.style.width = on ? '26px' : '12px';
          rule.style.background = on ? 'var(--color-accent)' : 'var(--color-text)';
          rule.style.opacity = on ? '1' : '0.32';
        }
        if (num) {
          num.style.opacity = on ? '1' : '0.32';
          num.style.color = on ? 'var(--color-accent)' : '';
        }
        el.setAttribute('aria-current', on ? 'true' : 'false');
      });
      if (out) out.textContent = 'Scene ' + pad(idx + 1) + '/' + pad(scenes.length);
    };

    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(sync); }, { passive: true });
    sync();
  }

  /* ── one-time intro: name wipe + accent sweep ──────────────── */
  function initIntro() {
    if (reduceMotion()) return;
    const lines = $$('.name-line');
    const sweep = $('#sweep');
    lines.forEach((el, i) => {
      el.style.clipPath = 'inset(0 0 110% 0)';
      el.style.transform = 'translateY(16px)';
      const d = i * 110 + 90;
      el.style.transition = 'clip-path 820ms var(--ease) ' + d + 'ms, transform 820ms var(--ease) ' + d + 'ms';
    });

    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      lines.forEach((el, i) => {
        el.style.clipPath = 'inset(-30% -5% -20% -5%)';
        el.style.transform = 'none';
        setTimeout(() => { el.style.clipPath = 'none'; el.style.transition = ''; }, 1000 + i * 110);
      });
      if (!sweep) return;
      sweep.style.transition = 'transform 320ms cubic-bezier(0.4,0,0.2,1)';
      sweep.style.transform = 'scaleX(1)';
      setTimeout(() => {
        sweep.style.transformOrigin = 'right center';
        sweep.style.transition = 'transform 380ms cubic-bezier(0.4,0,0.2,1)';
        sweep.style.transform = 'scaleX(0)';
      }, 460);
    };
    requestAnimationFrame(reveal);
    setTimeout(reveal, 90);
    // Safety: never leave the name clipped if a frame or timer is dropped.
    setTimeout(() => lines.forEach((el) => {
      el.style.clipPath = 'none'; el.style.transform = 'none'; el.style.transition = '';
    }), 1800);
  }

  /* ── scroll reveals ────────────────────────────────────────── */
  let revealObserver = null;
  function observeReveals(scope) {
    if (typeof IntersectionObserver === 'undefined' || reduceMotion()) return;
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { en.target.classList.remove('is-hidden'); revealObserver.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -10% 0px' });
    }
    const els = $$('[data-rev]', scope).filter((el) => !el.dataset.revBound);
    els.forEach((el) => {
      el.dataset.revBound = '1';
      if (el.getBoundingClientRect().top > innerHeight * 0.9) {
        el.classList.add('is-hidden');
        revealObserver.observe(el);
      }
    });
    // Safety net: nothing stays invisible if the observer never fires.
    setTimeout(() => els.forEach((el) => el.classList.remove('is-hidden')), 6000);
  }

  /* ── contextual cursor label ───────────────────────────────── */
  function initCursor() {
    const cur = $('#cursor');
    if (!cur || matchMedia('(hover: none)').matches) return;
    document.addEventListener('mousemove', (e) => {
      cur.style.transform = 'translate3d(' + (e.clientX + 18) + 'px,' + (e.clientY + 18) + 'px,0)';
    }, { passive: true });
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest('[data-cursor-label]');
      if (!t) return;
      cur.textContent = t.getAttribute('data-cursor-label');
      cur.style.opacity = '1';
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest('[data-cursor-label]')) cur.style.opacity = '0';
    });
  }

  /* ── hero: wireframe mesh + name mask ──────────────────────── */
  const Hero = {
    density: 26,
    init() {
      this.cv = $('#heroCanvas');
      if (!this.cv || !this.cv.getContext) return;
      this.ctx = this.cv.getContext('2d');
      const nc = $('#nameCanvas');
      if (nc && nc.getContext) {
        this.nc = nc;
        this.nctx = nc.getContext('2d');
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.resize());
      }
      this.mx = 0; this.my = 0; this.t = 0;
      this.readColors();
      this.resize();
      window.addEventListener('resize', () => this.resize());

      if (reduceMotion()) { this.draw(0.6); return; }
      window.addEventListener('mousemove', (e) => {
        const r = this.cv.getBoundingClientRect();
        const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
        this.mx = Math.max(-1.6, Math.min(1.6, nx));
        this.my = Math.max(-1.6, Math.min(1.6, ny));
      }, { passive: true });

      const loop = (ms) => { this.t = ms / 1000; this.draw(this.t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    },

    readColors() {
      const cs = getComputedStyle(document.documentElement);
      this.ink = (cs.getPropertyValue('--color-text') || '').trim() || '#201e1d';
      this.acc = (cs.getPropertyValue('--color-accent') || '').trim() || '#ec3013';
      if (this.ctx) this.draw(this.t || 0);
    },

    resize() {
      if (!this.cv) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = this.cv.clientWidth || 600, h = this.cv.clientHeight || 400;
      this.cv.width = Math.round(w * dpr);
      this.cv.height = Math.round(h * dpr);
      this.w = w; this.h = h;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.nc) {
        const nw = this.nc.clientWidth || 0, nh = this.nc.clientHeight || 0;
        this.nc.width = Math.round(nw * dpr);
        this.nc.height = Math.round(nh * dpr);
        this.nw = nw; this.nh = nh;
        this.nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.prepName();
      }
      this.draw(this.t || 0);
    },

    draw(t) {
      if (this.ctx) this.mesh(this.ctx, this.w, this.h, t, {});
      if (this.nctx && this.nw > 8) {
        this.mesh(this.nctx, this.nw, this.nh, t + 3.5, {
          cols: 26, sxk: 0.52, tiltk: 0.17, myk: 0.25, zkk: 0.15, cyk: 0.5,
          alphak: 2.4, lwk: 1.1, noRidge: true
        });
        this.maskToName();
      }
      this.readout(t);
    },

    mesh(ctx, w, h, t, o) {
      if (!ctx || !w || !h) return;
      const COLS = Math.max(10, Math.round(o.cols || this.density));
      const ROWS = Math.max(6, Math.round(COLS * 0.62));
      ctx.clearRect(0, 0, w, h);

      const rz = 0.62 + this.mx * 0.42 + Math.sin(t * 0.13) * 0.05;
      const tilt = (o.tiltk || 0.40) + this.my * 0.10 * (o.myk == null ? 1 : o.myk);
      const cx = w / 2;
      const cy = h * (o.cyk || 0.56);
      const sx = o.sxk ? w * o.sxk : Math.min(w * 0.40, h * 0.92);
      const zk = o.zkk ? h * o.zkk : Math.min(h * 0.16, 90);
      const cos = Math.cos(rz), sin = Math.sin(rz);

      const pt = (gx, gy) => {
        const z = Math.sin(gx * 2.1 + t * 0.42) * Math.cos(gy * 1.7 - t * 0.28)
          + 0.45 * Math.sin((gx + gy) * 2.9 + t * 0.7);
        const X = gx * cos - gy * sin;
        const Y = gx * sin + gy * cos;
        return [cx + X * sx, cy + Y * sx * tilt - z * zk * 0.5, z];
      };

      const ridge = Math.round((ROWS - 1) * (0.5 + this.my * 0.22));
      ctx.lineCap = 'round';

      for (let r = 0; r < ROWS; r++) {
        const gy = (r / (ROWS - 1)) * 2 - 1;
        const isRidge = !o.noRidge && r === Math.max(0, Math.min(ROWS - 1, ridge));
        ctx.beginPath();
        for (let c = 0; c < COLS; c++) {
          const p = pt((c / (COLS - 1)) * 2 - 1, gy);
          if (c === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
        }
        ctx.strokeStyle = isRidge ? this.acc : this.ink;
        ctx.globalAlpha = Math.min(1, (isRidge ? 0.95 : 0.10 + 0.16 * (r / ROWS)) * (o.alphak || 1));
        ctx.lineWidth = (isRidge ? 2 : 1) * (o.lwk || 1);
        ctx.stroke();
      }

      for (let c = 0; c < COLS; c++) {
        const gx = (c / (COLS - 1)) * 2 - 1;
        ctx.beginPath();
        for (let r = 0; r < ROWS; r++) {
          const p = pt(gx, (r / (ROWS - 1)) * 2 - 1);
          if (r === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
        }
        ctx.strokeStyle = this.ink;
        ctx.globalAlpha = Math.min(1, (0.09 + 0.10 * (c / COLS)) * (o.alphak || 1));
        ctx.lineWidth = 1 * (o.lwk || 1);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      if (!o.noRidge) {
        ctx.fillStyle = this.acc;
        for (let c = 0; c < COLS; c += 4) {
          const p = pt((c / (COLS - 1)) * 2 - 1, (Math.max(0, Math.min(ROWS - 1, ridge)) / (ROWS - 1)) * 2 - 1);
          ctx.fillRect(p[0] - 2, p[1] - 2, 4, 4);
        }
      }
    },

    readout(t) {
      const out = $('#heroReadout');
      if (!out) return;
      const rz = 0.62 + this.mx * 0.42 + Math.sin(t * 0.13) * 0.05;
      const deg = ((rz * 180 / Math.PI) % 360 + 360) % 360;
      out.textContent = 'rot ' + (deg < 100 ? '0' : '') + (deg < 10 ? '0' : '') + deg.toFixed(1) + '°';
    },

    /* Measure the live DOM word once per layout, so the glyph mask matches it. */
    prepName() {
      const ctx = this.nctx;
      const span = $('.name-text');
      this.nameFont = null;
      if (!ctx || !span || !this.nh) return;
      const cs = getComputedStyle(span);
      const fs = parseFloat(cs.fontSize) || 100;
      ctx.font = (cs.fontWeight || '800') + ' ' + fs + 'px ' + (cs.fontFamily || 'sans-serif');
      if ('letterSpacing' in ctx) {
        ctx.letterSpacing = (cs.letterSpacing && cs.letterSpacing !== 'normal') ? cs.letterSpacing : '0px';
        this.nameLS = ctx.letterSpacing;
      }
      const txt = (span.textContent || '').toLocaleUpperCase('tr-TR');
      const m = ctx.measureText(txt);
      const a = m.fontBoundingBoxAscent || fs * 0.88;
      const d = m.fontBoundingBoxDescent || fs * 0.21;
      // CSS puts the baseline at half-leading + font ascent inside the line box.
      this.nameBase = (this.nh - (a + d)) / 2 + a;
      this.nameTxt = txt;
      this.nameFont = ctx.font;
    },

    maskToName() {
      const ctx = this.nctx;
      if (!ctx || !this.nameFont || !this.nameTxt) return;
      ctx.globalCompositeOperation = 'destination-in';
      ctx.globalAlpha = 1;
      ctx.font = this.nameFont;
      if (this.nameLS) ctx.letterSpacing = this.nameLS;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#000';
      ctx.fillText(this.nameTxt, 0, this.nameBase);
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  /* ── work grid ─────────────────────────────────────────────── */
  const mediaBlock = (p, cls) =>
    '<div class="work-media ' + cls + '">' +
      '<div class="work-img"><img src="' + esc(p.cover) + '" alt="' + esc(p.title) + ' cover" loading="lazy"></div>' +
    '</div>';

  const tagChips = (tags) => (tags || []).map((t) => '<span class="chip">' + esc(t) + '</span>').join('');
  const roleLine = (p) => esc('Role — ' + (p.role || []).join(' · '));

  function cardAttrs(p, extraClass) {
    return 'class="work-card' + (extraClass ? ' ' + extraClass : '') + '" data-project="' + esc(p.id) + '" ' +
      'data-cursor-label="View project →" role="button" tabindex="0" ' +
      'aria-label="Open ' + esc(p.title) + ' details"';
  }

  function renderWork() {
    const featured = projects.filter((p) => p.featured);
    const rest = projects.filter((p) => !p.featured);
    const host = $('#workGrid');
    if (!host) return;

    const f = featured[0];
    let html = '';

    if (f) {
      html += '<article ' + cardAttrs(f) + ' data-rev style="border-top:2px solid var(--color-divider)">' +
        '<div class="work-feature">' +
          '<div>' +
            '<div class="work-idrow"><span class="work-index">01</span>' +
            '<span class="eyebrow">' + esc(f.kicker) + '</span></div>' +
            '<h3 class="work-title">' + esc(f.title) + '</h3>' +
            '<p class="work-desc">' + esc(f.summary) + '</p>' +
            '<div class="work-tags">' + tagChips(f.tags) + '</div>' +
            '<div class="work-meta">' + roleLine(f) + '</div>' +
            '<span class="work-open">View project <span class="arrow" aria-hidden="true">→</span></span>' +
          '</div>' +
          mediaBlock(f, 'work-media--bleed') +
        '</div>' +
      '</article>';
    }

    const pair = featured.slice(1, 3);
    if (pair.length) {
      html += '<div class="work-pair">' + pair.map((p, i) =>
        '<article ' + cardAttrs(p) + ' data-rev>' +
          mediaBlock(p, 'work-media--sm') +
          '<div class="work-idrow" style="margin-top:18px">' +
            '<span class="work-index work-index--sm">' + pad(i + 2) + '</span>' +
            '<h3 class="work-title work-title--sm">' + esc(p.title) + '</h3>' +
          '</div>' +
          '<p class="work-desc">' + esc(p.summary) + '</p>' +
          '<div class="work-tags">' + tagChips(p.tags) + '</div>' +
          '<div class="work-meta">' + roleLine(p) + '</div>' +
        '</article>').join('') + '</div>';
    }

    const w = featured[3];
    if (w) {
      html += '<article ' + cardAttrs(w) + ' data-rev>' +
        '<div class="work-wide">' +
          mediaBlock(w, 'work-media--md') +
          '<div>' +
            '<div class="work-idrow"><span class="work-index work-index--sm">04</span>' +
            '<span class="eyebrow">' + esc(w.kicker) + '</span></div>' +
            '<h3 class="work-title work-title--md">' + esc(w.title) + '</h3>' +
            '<p class="work-desc">' + esc(w.summary) + '</p>' +
            '<div class="work-tags">' + tagChips(w.tags) + '</div>' +
            '<div class="work-meta">' + roleLine(w) + '</div>' +
          '</div>' +
        '</div>' +
      '</article>';
    }
    host.innerHTML = html;

    const grid = $('#archiveGrid');
    if (grid) {
      grid.innerHTML = rest.map((p, i) =>
        '<article ' + cardAttrs(p, 'archive-card') + ' data-rev>' +
          mediaBlock(p, 'work-media--sm') +
          '<div class="work-idrow">' +
            '<span class="work-index work-index--sm">' + pad(i + 5) + '</span>' +
            '<h3 class="work-title work-title--sm">' + esc(p.title) + '</h3>' +
          '</div>' +
          '<p class="work-desc">' + esc(p.summary) + '</p>' +
          '<div class="work-tags">' + tagChips((p.tags || []).slice(0, 3)) + '</div>' +
        '</article>').join('');
    }

    const count = $('#workCount');
    if (count) count.textContent = pad(projects.length) + ' projects';
    const archCount = $('#archiveCount');
    if (archCount) archCount.textContent = pad(rest.length) + ' more';
  }

  /* ── archive expander ──────────────────────────────────────── */
  function initArchive() {
    const btn = $('#archiveToggle');
    const body = $('#archiveBody');
    if (!btn || !body) return;
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      $('#archiveLabel').textContent = open ? 'View all projects' : 'Hide archive';
      if (open) {
        body.style.maxHeight = body.scrollHeight + 'px';
        void body.offsetHeight; // force reflow so the collapse animates from a real height
        body.style.maxHeight = '0px';
        body.classList.remove('is-open');
      } else {
        body.classList.add('is-open');
        body.style.maxHeight = body.scrollHeight + 'px';
        observeReveals(body);
        setTimeout(() => { if (body.classList.contains('is-open')) body.style.maxHeight = 'none'; }, 720);
      }
    });
    window.addEventListener('resize', () => {
      if (body.classList.contains('is-open')) body.style.maxHeight = 'none';
    });
  }

  /* ── journey ───────────────────────────────────────────────── */
  const DOC_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' +
    '<line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';

  function renderJourney() {
    const host = $('#journeyList');
    if (!host) return;
    host.innerHTML = journey.map((j) =>
      '<div class="jrow" data-rev tabindex="0" role="button" aria-expanded="false">' +
        '<div>' +
          '<div class="jyear nums">' + esc(j.year) + '</div>' +
          '<div class="jline"></div>' +
        '</div>' +
        '<div>' +
          '<h3 class="jtitle">' + esc(j.title) + '</h3>' +
          '<div class="jdetail">' +
            '<p>' + esc(j.text) + '</p>' +
            '<div class="chiprow">' + tagChips(j.tags) + '</div>' +
            (j.docs && j.docs.length
              ? '<div class="doc-chips">' + j.docs.map((d) =>
                  '<a class="doc-chip" href="' + esc(d.url) + '" target="_blank" rel="noopener">' + DOC_ICON +
                  '<span><b>' + esc(d.label) + '</b><small>' + esc(d.sub) + '</small></span></a>').join('') +
                '</div>'
              : '') +
          '</div>' +
        '</div>' +
        '<div class="jstate' + (j.accentState ? ' jstate--accent' : '') + '">' + esc(j.state) + '</div>' +
      '</div>').join('');

    const rows = $$('.jrow', host);
    const setRow = (row, open) => {
      const d = $('.jdetail', row);
      if (d) {
        d.style.maxHeight = open ? d.scrollHeight + 40 + 'px' : '0px';
        d.style.opacity = open ? '1' : '0';
      }
      const line = $('.jline', row);
      if (line) line.style.width = open ? '100%' : '0';
      row.setAttribute('aria-expanded', open ? 'true' : 'false');
      rows.forEach((r) => { r.style.opacity = open ? (r === row ? '1' : '0.34') : '1'; });
    };

    rows.forEach((row) => {
      row.addEventListener('mouseenter', () => setRow(row, true));
      row.addEventListener('mouseleave', () => setRow(row, false));
      row.addEventListener('focus', () => setRow(row, true));
      row.addEventListener('blur', () => setRow(row, false));
      row.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        setRow(row, row.getAttribute('aria-expanded') !== 'true');
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setRow(row, row.getAttribute('aria-expanded') !== 'true');
        }
      });
    });
  }

  /* ── project modal ─────────────────────────────────────────── */
  const Modal = {
    init() {
      this.el = $('#projectModal');
      if (!this.el) return;
      this.panel = $('.modal-panel', this.el);
      this.stage = $('#modalStage');
      this.thumbs = $('#modalThumbs');
      this.info = $('#modalInfo');
      this.media = $('#modalMedia');
      this.counter = $('#stageCounter');
      this.shots = [];
      this.index = 0;

      $('#modalClose').addEventListener('click', () => this.close());
      $('.modal-backdrop', this.el).addEventListener('click', () => this.close());
      $('#stagePrev').addEventListener('click', () => this.go(this.index - 1));
      $('#stageNext').addEventListener('click', () => this.go(this.index + 1));

      document.addEventListener('keydown', (e) => {
        if (!this.el.classList.contains('is-open')) return;
        if (e.key === 'Escape') { e.preventDefault(); this.close(); }
        if (e.key === 'ArrowLeft') this.go(this.index - 1);
        if (e.key === 'ArrowRight') this.go(this.index + 1);
      });

      // One delegated handler covers featured cards and the archive grid.
      document.addEventListener('click', (e) => {
        const card = e.target.closest('[data-project]');
        if (!card) return;
        this.open(card.dataset.project);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const card = e.target.closest && e.target.closest('[data-project]');
        if (!card) return;
        e.preventDefault();
        this.open(card.dataset.project);
      });
    },

    open(id) {
      const p = byId.get(id);
      if (!p) return;
      const n = projects.indexOf(p) + 1;
      this.shots = [p.cover].concat(p.gallery || []).filter(Boolean);
      this.index = 0;

      this.media.setAttribute('data-fit', p.galleryFit === 'contain' ? 'contain' : 'cover');
      this.stage.innerHTML = this.shots.map((src, i) =>
        '<img src="' + esc(src) + '" alt="' + esc(p.title) + ' screenshot ' + (i + 1) + '"' +
        (i === 0 ? ' class="is-active"' : ' loading="lazy"') + '>').join('');
      this.thumbs.innerHTML = this.shots.map((src, i) =>
        '<button type="button" data-shot="' + i + '" aria-current="' + (i === 0 ? 'true' : 'false') + '"' +
        ' aria-label="Show image ' + (i + 1) + '"><img src="' + esc(src) + '" alt="" loading="lazy"></button>').join('');
      $$('button', this.thumbs).forEach((b) => b.addEventListener('click', () => this.go(+b.dataset.shot)));
      const single = this.shots.length < 2;
      $('#stagePrev').style.display = single ? 'none' : '';
      $('#stageNext').style.display = single ? 'none' : '';
      this.thumbs.style.display = single ? 'none' : '';

      this.info.innerHTML =
        '<div class="modal-head">' +
          '<span class="modal-num">' + pad(n) + '</span>' +
          '<span class="eyebrow">' + esc(p.kicker) + '</span>' +
        '</div>' +
        '<h2 class="modal-title" id="modalTitle">' + esc(p.title) + '</h2>' +
        (p.tagline ? '<p class="modal-tagline">' + esc(p.tagline) + '</p>' : '') +
        '<div class="modal-facts">' +
          '<div class="modal-fact"><div class="k">Type</div><div class="v">' + esc(p.category) + '</div></div>' +
          '<div class="modal-fact"><div class="k">Year</div><div class="v nums">' + esc(p.year) + '</div></div>' +
          '<div class="modal-fact"><div class="k">Context</div><div class="v">' + esc(p.studio) + '</div></div>' +
          '<div class="modal-fact"><div class="k">Images</div><div class="v nums">' + pad(this.shots.length) + '</div></div>' +
        '</div>' +
        '<div class="modal-block"><h4>About the project</h4>' +
          (p.body || []).map((t) => '<p>' + esc(t) + '</p>').join('') +
        '</div>' +
        '<div class="modal-block"><h4>Stack</h4><div class="chiprow">' +
          (p.tech || []).map((t) => '<span class="chip chip--lg">' + esc(t) + '</span>').join('') +
        '</div></div>' +
        '<div class="modal-block"><h4>My role</h4><ul class="modal-roles">' +
          (p.role || []).map((r) => '<li>' + esc(r) + '</li>').join('') +
        '</ul></div>' +
        ((p.links && p.links.length)
          ? '<div class="modal-links">' + p.links.map((l, i) =>
              '<a class="btn ' + (i === 0 ? 'btn--primary' : 'btn--secondary') + '" href="' + esc(l.url) +
              '" target="_blank" rel="noopener">' + esc(l.label) + ' <span aria-hidden="true">↗</span></a>').join('') +
            '</div>'
          : '');

      this.info.scrollTop = 0;
      this.lastFocus = document.activeElement;
      this.el.classList.add('is-open');
      document.body.classList.add('is-locked');
      const cur = $('#cursor');
      if (cur) cur.style.opacity = '0';
      requestAnimationFrame(() => {
        this.el.classList.add('is-visible');
        $('#modalClose').focus();
      });
      this.updateCounter();
    },

    go(i) {
      if (!this.shots.length) return;
      const n = this.shots.length;
      this.index = ((i % n) + n) % n;
      $$('img', this.stage).forEach((img, k) => img.classList.toggle('is-active', k === this.index));
      $$('button', this.thumbs).forEach((b, k) => b.setAttribute('aria-current', k === this.index ? 'true' : 'false'));
      const active = $$('button', this.thumbs)[this.index];
      if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      this.updateCounter();
    },

    updateCounter() {
      if (this.counter) this.counter.textContent = pad(this.index + 1) + ' / ' + pad(this.shots.length);
    },

    close() {
      this.el.classList.remove('is-visible');
      document.body.classList.remove('is-locked');
      setTimeout(() => {
        this.el.classList.remove('is-open');
        this.stage.innerHTML = '';
        this.thumbs.innerHTML = '';
      }, 300);
      if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
    }
  };

  /* ── boot ──────────────────────────────────────────────────── */
  function boot() {
    Theme.init();
    renderWork();
    renderJourney();
    initMenu();
    initArchive();
    Modal.init();
    initCursor();
    Hero.init();
    initRail();
    initIntro();
    observeReveals(document);
    $('#year') && ($('#year').textContent = new Date().getFullYear());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
