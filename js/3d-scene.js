/**
 * PORTFOLIO — Soft Aurora Background
 * ─────────────────────────────────────────────────────────────
 * • Canvas 2D tabanlı, Three.js bağımlılığı YOK
 * • Mouse parallax: renk orb'ları fare pozisyonunu takip eder
 * • Dark / Light tema: renk paleti otomatik değişir
 * • requestAnimationFrame + visibility API ile düşük güç tüketimi
 * • Mobil uyumlu: pointer/touch eventleri her ikisini de yakalar
 * ─────────────────────────────────────────────────────────────
 */
(function () {
    'use strict';

    /* ── 1. Erken çıkış: canvas3d yok ise hiçbir şey yapmadan dur ── */
    const canvas = document.getElementById('canvas3d');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    /* ── 2. Tema Paleti ── */
    const PALETTES = {
        dark: [
            { r: 255, g: 107, b:  53 },   // sıcak turuncu
            { r: 124, g:  92, b: 252 },   // elektrik mor
            { r:  38, g: 198, b: 218 },   // neon cyan
            { r: 236, g:  64, b: 122 },   // neon pembe
            { r:  79, g: 195, b:  85 },   // neon yeşil
        ],
        light: [
            { r: 139, g: 158, b: 245 },   // soft lavander
            { r:  99, g: 172, b: 255 },   // soft mavi
            { r: 255, g: 168, b: 107 },   // şeftali
            { r: 167, g: 139, b: 250 },   // lila
            { r:  96, g: 214, b: 186 },   // mint
        ]
    };

    /* ── 3. Aktif tema ── */
    function getTheme() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }

    /* ── 4. Orb tanımı ── */
    class Orb {
        constructor(index, total) {
            this.index = index;
            this.total = total;
            this.reset(true);
        }

        reset(init) {
            const W = canvas.width;
            const H = canvas.height;

            /* Başlangıç pozisyonu: ekranı eşit böl, sonra rastgele yerleştir */
            const cols = Math.ceil(Math.sqrt(this.total));
            const row  = Math.floor(this.index / cols);
            const col  = this.index % cols;
            const cellW = W / cols;
            const cellH = H / Math.ceil(this.total / cols);

            this.baseX = (col + 0.5) * cellW + (Math.random() - 0.5) * cellW * 0.8;
            this.baseY = (row + 0.5) * cellH + (Math.random() - 0.5) * cellH * 0.8;

            /* Mevcut ekran pozisyonu */
            this.x = init ? this.baseX : W * 0.5;
            this.y = init ? this.baseY : H * 0.5;

            /* Boyut: daha büyük = daha atmosferik */
            this.radius = Math.min(W, H) * (0.22 + Math.random() * 0.28);

            /* Salınım parametreleri */
            this.driftSpeed = 0.0004 + Math.random() * 0.0003;
            this.driftAngle = Math.random() * Math.PI * 2;
            this.driftRadius = 60 + Math.random() * 80;

            /* Renk indeksi (tema değişince güncellenir) */
            this.colorIndex = this.index % PALETTES.dark.length;

            /* Mouse parallax katsayısı: merkeze uzak orb'lar daha çok hareket eder */
            this.parallaxStrength = 0.04 + Math.random() * 0.06;

            /* Alpha nabız */
            this.pulseOffset = Math.random() * Math.PI * 2;
            this.pulseSpeed  = 0.0008 + Math.random() * 0.001;
        }
    }

    /* ── 5. Sahne durumu ── */
    const ORB_COUNT = 5;
    const orbs = Array.from({ length: ORB_COUNT }, (_, i) => new Orb(i, ORB_COUNT));

    /* Hedef mouse pozisyonu (lerp için) */
    let targetMX = 0;
    let targetMY = 0;
    /* Mevcut (smooth) mouse pozisyonu */
    let smoothMX = 0;
    let smoothMY = 0;

    /* requestAnimationFrame id */
    let rafId = null;
    let lastTime = 0;

    /* ── 6. Canvas boyutlandırma ── */
    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        /* Orb pozisyonlarını yeniden dağıt */
        orbs.forEach(o => o.reset(true));
    }

    /* ── 7. Pointer Olayları ── */
    function onPointerMove(e) {
        const x = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : canvas.width / 2);
        const y = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : canvas.height / 2);
        targetMX = (x / canvas.width  - 0.5) * 2;  // -1 … +1
        targetMY = (y / canvas.height - 0.5) * 2;
    }

    /* ── 8. Ana çizim döngüsü ── */
    function draw(timestamp) {
        const dt = Math.min(timestamp - lastTime, 50); // max 50ms (sekme arka planda ise)
        lastTime = timestamp;

        const W = canvas.width;
        const H = canvas.height;
        const theme  = getTheme();
        const palette = PALETTES[theme];

        /* Mouse smooth lerp */
        const lerpSpeed = 1 - Math.pow(0.02, dt / 16);
        smoothMX += (targetMX - smoothMX) * lerpSpeed;
        smoothMY += (targetMY - smoothMY) * lerpSpeed;

        /* Canvas temizle */
        ctx.clearRect(0, 0, W, H);

        /* Arka plan: tema rengine göre katmanlı */
        ctx.fillStyle = theme === 'dark'
            ? 'rgba(8, 12, 24, 1)'       /* dark --bg */
            : 'rgba(245, 240, 232, 1)';   /* light --bg */
        ctx.fillRect(0, 0, W, H);

        /* Orb'ları çiz */
        orbs.forEach(orb => {
            /* Salınım hareketi */
            orb.driftAngle += orb.driftSpeed * dt;

            /* Hedef pozisyon = baseX + salınım + mouse parallax */
            const driftX = Math.cos(orb.driftAngle) * orb.driftRadius;
            const driftY = Math.sin(orb.driftAngle * 0.7) * orb.driftRadius * 0.6;
            const mouseOffsetX = smoothMX * W * orb.parallaxStrength;
            const mouseOffsetY = smoothMY * H * orb.parallaxStrength;

            const targetX = orb.baseX + driftX + mouseOffsetX;
            const targetY = orb.baseY + driftY + mouseOffsetY;

            /* Pozisyon lerp: orb yavaşça hedefini takip eder */
            const posLerp = 1 - Math.pow(0.015, dt / 16);
            orb.x += (targetX - orb.x) * posLerp;
            orb.y += (targetY - orb.y) * posLerp;

            /* Alpha: nabız + tema */
            const pulse = 0.5 + 0.5 * Math.sin(timestamp * orb.pulseSpeed + orb.pulseOffset);
            const baseAlpha = theme === 'dark' ? 0.28 : 0.20;
            const alpha = baseAlpha + pulse * (theme === 'dark' ? 0.10 : 0.08);

            const col = palette[orb.colorIndex];

            /* Radial gradient */
            const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius);
            grad.addColorStop(0,   `rgba(${col.r},${col.g},${col.b},${alpha})`);
            grad.addColorStop(0.45,`rgba(${col.r},${col.g},${col.b},${alpha * 0.5})`);
            grad.addColorStop(1,   `rgba(${col.r},${col.g},${col.b},0)`);

            /* Çiz — elips yerine ölçeklenmiş daire */
            ctx.save();
            ctx.translate(orb.x, orb.y);
            ctx.scale(1, 0.65); // hafif yassılaştır → bulut formu
            ctx.translate(-orb.x, -orb.y);
            ctx.beginPath();
            ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.restore();
        });

        /* Üste ince vignette (karanlık kenarlık) — derinlik hissi */
        if (theme === 'dark') {
            const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.0);
            vignette.addColorStop(0, 'rgba(0,0,0,0)');
            vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, W, H);
        } else {
            /* Light modda hafif merkez aydınlık */
            const highlight = ctx.createRadialGradient(W * 0.4, H * 0.3, 0, W * 0.4, H * 0.3, H * 0.9);
            highlight.addColorStop(0, 'rgba(255,255,255,0.18)');
            highlight.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = highlight;
            ctx.fillRect(0, 0, W, H);
        }

        rafId = requestAnimationFrame(draw);
    }

    /* ── 9. Başlatma ── */
    function start() {
        if (rafId) return;
        lastTime = performance.now();
        rafId = requestAnimationFrame(draw);
    }

    function stop() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    /* ── 10. Visibility API: sekme arka plana geçince dur ── */
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { stop(); } else { start(); }
    });

    /* ── 11. Olay dinleyiciler ── */
    window.addEventListener('resize',      resize,        { passive: true });
    window.addEventListener('mousemove',   onPointerMove, { passive: true });
    window.addEventListener('touchmove',   onPointerMove, { passive: true });

    /* ── 12. Tema değişikliğini dinle ── */
    new MutationObserver(() => {
        /* Renk paletini güncelle, orb pozisyonlarını koru */
        /* (draw() zaten her karede getTheme() çağırıyor, ek işlem gerekmez) */
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    /* ── 13. Başlat ── */
    resize();
    start();

    /* ── 14. Merkeze hafif bir yıldız/parlak nokta (opsiyonel, sil istersen) ── */
    /* Bu blok hero'daki canvas3d üzerine küçük bir glow noktası ekler.
       3d-scene'deki icosahedron yerine minimal ama etkili bir merkez işareti. */
    const STAR_ENABLED = true;

    if (STAR_ENABLED) {
        /* Mevcut draw'ın üzerine ek bir after-draw katmanı */
        const _origDraw = draw;

        /* Yıldız durumu */
        const star = { angle: 0, scale: 1, pulse: 0 };

        /* Override: rafId zaten _origDraw'ı çağırıyor, buraya gerek yok.
           Bunun yerine draw fonksiyonunu genişletiyoruz: */
        const existingDraw = draw; // zaten yukarıda tanımlı

        /* Orb çiziminden sonra merkez glow eklemek için
           draw() fonksiyonuna closure ile patch yapalım */
        window.__bgDrawExtension = function(timestamp, W, H, theme) {
            const cx = W / 2;
            const cy = H / 2;
            star.angle += 0.004;
            star.pulse  = 0.7 + 0.3 * Math.sin(timestamp * 0.001);

            const size  = Math.min(W, H) * 0.04 * star.pulse;
            const color = theme === 'dark'
                ? `rgba(79, 142, 247, ${0.55 * star.pulse})`
                : `rgba(79, 142, 247, ${0.35 * star.pulse})`;

            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
            g.addColorStop(0, color);
            g.addColorStop(1, 'rgba(79,142,247,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, size, 0, Math.PI * 2);
            ctx.fill();

            /* Küçük çapraz artı çizgileri */
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(star.angle);
            ctx.strokeStyle = theme === 'dark'
                ? `rgba(124,92,252,${0.4 * star.pulse})`
                : `rgba(99,172,255,${0.35 * star.pulse})`;
            ctx.lineWidth = 1;
            const len = size * 2.2;
            for (let i = 0; i < 4; i++) {
                ctx.rotate(Math.PI / 4);
                ctx.beginPath();
                ctx.moveTo(0, size * 0.5);
                ctx.lineTo(0, len);
                ctx.stroke();
            }
            ctx.restore();
        };
    }

    /* draw() içine extension hook'u ekle */
    /* Yeniden tanımla — tüm çizim mantığı tek fonksiyonda */
    cancelAnimationFrame(rafId);
    rafId = null;

    function drawFull(timestamp) {
        const dt = Math.min(timestamp - lastTime, 50);
        lastTime = timestamp;

        const W = canvas.width;
        const H = canvas.height;
        const theme   = getTheme();
        const palette = PALETTES[theme];

        /* Mouse lerp */
        const lerpSpeed = 1 - Math.pow(0.02, dt / 16);
        smoothMX += (targetMX - smoothMX) * lerpSpeed;
        smoothMY += (targetMY - smoothMY) * lerpSpeed;

        /* Temizle + arka plan */
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = theme === 'dark'
            ? 'rgba(8, 12, 24, 1)'
            : 'rgba(245, 240, 232, 1)';
        ctx.fillRect(0, 0, W, H);

        /* Orb'lar */
        orbs.forEach(orb => {
            orb.driftAngle += orb.driftSpeed * dt;

            const driftX = Math.cos(orb.driftAngle) * orb.driftRadius;
            const driftY = Math.sin(orb.driftAngle * 0.7) * orb.driftRadius * 0.6;
            const mouseOffsetX = smoothMX * W * orb.parallaxStrength;
            const mouseOffsetY = smoothMY * H * orb.parallaxStrength;

            const targetX = orb.baseX + driftX + mouseOffsetX;
            const targetY = orb.baseY + driftY + mouseOffsetY;

            const posLerp = 1 - Math.pow(0.015, dt / 16);
            orb.x += (targetX - orb.x) * posLerp;
            orb.y += (targetY - orb.y) * posLerp;

            const pulse = 0.5 + 0.5 * Math.sin(timestamp * orb.pulseSpeed + orb.pulseOffset);
            const baseAlpha = theme === 'dark' ? 0.28 : 0.20;
            const alpha = baseAlpha + pulse * (theme === 'dark' ? 0.10 : 0.08);

            const col  = palette[orb.colorIndex];
            const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius);
            grad.addColorStop(0,    `rgba(${col.r},${col.g},${col.b},${alpha})`);
            grad.addColorStop(0.45, `rgba(${col.r},${col.g},${col.b},${alpha * 0.5})`);
            grad.addColorStop(1,    `rgba(${col.r},${col.g},${col.b},0)`);

            ctx.save();
            ctx.translate(orb.x, orb.y);
            ctx.scale(1, 0.65);
            ctx.translate(-orb.x, -orb.y);
            ctx.beginPath();
            ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.restore();
        });

        /* Vignette / highlight */
        if (theme === 'dark') {
            const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.0);
            v.addColorStop(0, 'rgba(0,0,0,0)');
            v.addColorStop(1, 'rgba(0,0,0,0.55)');
            ctx.fillStyle = v;
            ctx.fillRect(0, 0, W, H);
        } else {
            const hl = ctx.createRadialGradient(W * 0.4, H * 0.3, 0, W * 0.4, H * 0.3, H * 0.9);
            hl.addColorStop(0, 'rgba(255,255,255,0.18)');
            hl.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = hl;
            ctx.fillRect(0, 0, W, H);
        }

        /* Merkez glow ★ */
        if (STAR_ENABLED && window.__bgDrawExtension) {
            window.__bgDrawExtension(timestamp, W, H, theme);
        }

        rafId = requestAnimationFrame(drawFull);
    }

    /* Başlat */
    lastTime = performance.now();
    rafId = requestAnimationFrame(drawFull);

    /* Visibility API güncelle */
    document.removeEventListener('visibilitychange', () => {});
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelAnimationFrame(rafId); rafId = null;
        } else {
            lastTime = performance.now();
            rafId = requestAnimationFrame(drawFull);
        }
    });

})();