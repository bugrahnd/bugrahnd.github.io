// Project Detail Page JavaScript
(function() {
    let currentProject  = null;
    let activeGalleryIndex = 0;
    let slideshowTimer  = null;

    function getProjectId() {
        const params = new URLSearchParams(window.location.search);
        return parseInt(params.get('id'));
    }

    // ============================================================
    // LOAD PROJECT
    // ============================================================
    function loadProject() {
        const id = getProjectId();
        if (!id) { showError('Proje bulunamadı'); return; }
        currentProject = window.projectsData.find(p => p.id === id);
        if (!currentProject) { showError('Proje bulunamadı'); return; }
        renderProject();
        initGallery();
        initLightbox();
    }

    // ============================================================
    // RENDER PROJECT
    // ============================================================
    function renderProject() {
        const contentDiv  = document.getElementById('projectContent');
        const galleryItems = (currentProject.gallery || []).filter(Boolean);
        const coverImgSrc  = currentProject.image || '';

        let mainMediaHtml = '';
        if (currentProject.videoUrl) {
            mainMediaHtml = `
                <div class="video-wrapper">
                    <iframe src="${currentProject.videoUrl}"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen></iframe>
                </div>`;
        } else if (galleryItems.length > 0) {
            const fitClass = currentProject.galleryFit === 'contain' ? ' img-contain' : '';
            mainMediaHtml = `
                <div class="main-image-wrapper main-clickable" id="mainImageWrapper" title="Büyütmek için tıkla">
                    <img src="${galleryItems[0]}" alt="${currentProject.title} Ana Görsel"
                         class="main-game-image${fitClass}" id="mainGalleryImg">
                    <div class="main-zoom-hint">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/>
                            <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                </div>`;
        }

        // Thumbnaillar — HEPSİ listelenir, aktif/pasif JS ile
        let thumbsHtml = '';
        if (galleryItems.length > 1 || currentProject.trailerUrl) {
            const fitClass = currentProject.galleryFit === 'contain' ? ' img-contain' : '';
            const imgThumbs = galleryItems.length > 1 ? galleryItems.map((src, i) => `
                        <div class="thumb-item${i === 0 ? ' thumb-active' : ''}"
                             data-src="${src}" data-index="${i}"
                             role="button" tabindex="0" title="Görseli değiştir">
                            <img src="${src}" alt="Ekran görüntüsü ${i + 1}" class="${fitClass.trim()}">
                            <div class="thumb-overlay"></div>
                        </div>
                    `).join('') : '';
            const videoThumb = currentProject.trailerUrl ? (() => {
                // YouTube video ID'sini çek (embed veya watch formatı)
                const ytMatch = currentProject.trailerUrl.match(/(?:embed\/|watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
                const thumbImg = ytMatch
                    ? `<img src="https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg" alt="Fragman">`
                    : `<div class="thumb-video-placeholder"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg></div>`;
                return `
                        <div class="thumb-item thumb-video-item"
                             data-trailer="${currentProject.trailerUrl}"
                             role="button" tabindex="0" title="Fragmanı izle">
                            ${thumbImg}
                            <div class="thumb-video-play-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                                    <circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.55)"/>
                                    <polygon points="10 8 16 12 10 16 10 8" fill="white"/>
                                </svg>
                            </div>
                            <div class="thumb-overlay"></div>
                        </div>`;
            })() : '';
            thumbsHtml = `
                <div class="project-thumbnail-gallery" id="thumbGallery">
                    ${videoThumb}${imgThumbs}
                </div>`;
        }

        const html = `
            <div class="project-content-3col">

                <aside class="project-sidebar left-sidebar">
                    ${coverImgSrc ? `
                    <div class="cover-image-wrapper">
                        <img src="${coverImgSrc}" alt="${currentProject.title} Kapak" class="cover-image">
                    </div>` : ''}

                    <div class="sidebar-section info-boxes">
                        <div class="info-item">
                            <h4>Kategori</h4>
                            <p>${getCategoryName(currentProject.category)}</p>
                        </div>
                        ${currentProject.downloadUrl ? `
                            <div class="info-item">
                                <h4>İndirme Bağlantısı</h4>
                                <a href="${currentProject.downloadUrl}" download class="file-link">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                        <polyline points="14 2 14 8 20 8"/>
                                    </svg>
                                    Dosyayı İndir
                                </a>
                            </div>
                        ` : ''}
                        ${currentProject.trailerUrl ? `
                            <div class="info-item">
                                <h4>Fragman</h4>
                                <a href="${currentProject.trailerUrl}" target="_blank" class="info-link trailer-link">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="10"/>
                                        <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>
                                    </svg>
                                    Fragmanı İzle
                                </a>
                            </div>
                        ` : ''}
                        ${currentProject.demoUrl ? `
                            <div class="info-item">
                                <h4>Canlı Link</h4>
                                <a href="${currentProject.demoUrl}" target="_blank" class="info-link">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
                                    </svg>
                                    Projeyi Görüntüle
                                </a>
                            </div>
                        ` : ''}
                        ${currentProject.details.github ? `
                            <div class="info-item">
                                <h4>Kaynak Kod</h4>
                                <a href="${currentProject.details.github}" target="_blank" class="info-link">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 22.167 22 18.418 22 12c0-5.523-4.477-10-10-10z"/>
                                    </svg>
                                    GitHub Repo
                                </a>
                            </div>
                        ` : ''}
                    </div>
                </aside>

                <main class="project-main-center">
                    <div class="project-header">
                        <h1 class="project-title">${currentProject.title}</h1>
                        <div class="project-tags-detail">
                            ${currentProject.tags.map(t => `<span>${t}</span>`).join('')}
                        </div>
                    </div>
                    ${mainMediaHtml}
                    ${thumbsHtml}
                    <div class="content-section text-content">
                        <h2>Hakkında</h2>
                        <p>${currentProject.details.description}</p>
                        ${currentProject.details.features && currentProject.details.features.length > 0 ? `
                            <h3>Özellikler</h3>
                            <ul class="features-list">
                                ${currentProject.details.features.map(f => `<li>${f}</li>`).join('')}
                            </ul>
                        ` : ''}
                    </div>
                </main>

                <aside class="project-sidebar right-sidebar">
                    <div class="sidebar-section">
                        <h3>Kullanılan Teknolojiler</h3>
                        <div class="tech-grid">
                            ${currentProject.details.technologies.map(t => `<div class="tech-item">${t}</div>`).join('')}
                        </div>
                    </div>
                    ${currentProject.details.role ? `
                        <div class="sidebar-section">
                            <h3>Üstlendiğim Rol</h3>
                            <div class="role-list">
                                ${currentProject.details.role.map(r => `<div class="role-item">${r}</div>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </aside>

            </div>
            ${renderRelatedProjects()}
        `;

        contentDiv.innerHTML = html;
    }

    // ============================================================
    // GALLERY INTERACTIONS
    // ============================================================
    function initGallery() {
        const galleryItems = (currentProject.gallery || []).filter(Boolean);
        if (!galleryItems.length && !currentProject.trailerUrl) return;
        if (currentProject.videoUrl) return;

        const mainImg      = document.getElementById('mainGalleryImg');
        const mainWrapper  = document.getElementById('mainImageWrapper');
        const thumbGallery = document.getElementById('thumbGallery');

        if (!mainWrapper) return;

        // --- Thumbnail tıklama → ana görsel değişir, lightbox AÇILMAZ ---
        if (thumbGallery) {
            thumbGallery.addEventListener('click', e => {
                // Video thumb tıklandı mı?
                const videoThumb = e.target.closest('.thumb-video-item');
                if (videoThumb) {
                    const trailerUrl = videoThumb.dataset.trailer;
                    showTrailerInMain(mainWrapper, trailerUrl, thumbGallery);
                    return;
                }
                // Normal resim thumb
                const thumb = e.target.closest('.thumb-item[data-index]');
                if (!thumb) return;
                restoreMainImage(mainWrapper, mainImg);
                switchMainImage(parseInt(thumb.dataset.index), galleryItems, mainImg);
            });
            thumbGallery.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    const videoThumb = document.activeElement.closest('.thumb-video-item');
                    if (videoThumb) {
                        showTrailerInMain(mainWrapper, videoThumb.dataset.trailer, thumbGallery);
                        return;
                    }
                    const thumb = document.activeElement.closest('.thumb-item[data-index]');
                    if (thumb) {
                        restoreMainImage(mainWrapper, mainImg);
                        switchMainImage(parseInt(thumb.dataset.index), galleryItems, mainImg);
                    }
                }
            });
        }

        // --- Ana görsel tıklama → lightbox açılır ---
        if (mainImg) {
            mainWrapper.addEventListener('click', () => {
                if (mainWrapper.querySelector('.trailer-embed')) return; // video modunda lightbox açma
                openLightbox(activeGalleryIndex);
            });
        }

        // --- Slideshow ---
        if (galleryItems.length > 1 && mainImg) {
            buildSlideshowUI(mainWrapper, galleryItems, mainImg);
        }
    }

    // Ana alanda trailer embed göster
    function showTrailerInMain(mainWrapper, url, thumbGallery) {
        // Zaten embed varsa çıkar
        let existing = mainWrapper.querySelector('.trailer-embed');
        if (existing) existing.remove();
        const img = mainWrapper.querySelector('.main-game-image');
        const hint = mainWrapper.querySelector('.main-zoom-hint');
        const dots = mainWrapper.querySelector('.slideshow-dots');
        const prog = mainWrapper.querySelector('.slideshow-progress');
        if (img)  img.style.display  = 'none';
        if (hint) hint.style.display = 'none';
        if (dots) dots.style.display = 'none';
        if (prog) prog.style.display = 'none';
        clearInterval(slideshowTimer);

        // Embed oluştur
        const embedDiv = document.createElement('div');
        embedDiv.className = 'trailer-embed';
        // Tüm YouTube formatlarını embed'e çevir
        const ytMatch = url.match(/(?:embed\/|watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
        const src = ytMatch
            ? `https://www.youtube-nocookie.com.com/embed/${ytMatch[1]}?rel=0`
            : url;
        embedDiv.innerHTML = `<iframe src="${src}" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        mainWrapper.appendChild(embedDiv);

        // Video thumb aktif yap
        if (thumbGallery) {
            thumbGallery.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('thumb-active'));
            const vThumb = thumbGallery.querySelector('.thumb-video-item');
            if (vThumb) vThumb.classList.add('thumb-active');
        }
    }

    // Ana alandaki embedi kaldır, görseli geri getir
    function restoreMainImage(mainWrapper, mainImg) {
        const embed = mainWrapper.querySelector('.trailer-embed');
        if (!embed) return;
        embed.remove();
        const img  = mainWrapper.querySelector('.main-game-image');
        const hint = mainWrapper.querySelector('.main-zoom-hint');
        const dots = mainWrapper.querySelector('.slideshow-dots');
        const prog = mainWrapper.querySelector('.slideshow-progress');
        if (img)  img.style.display  = '';
        if (hint) hint.style.display = '';
        if (dots) dots.style.display = '';
        if (prog) prog.style.display = '';
        const galleryItems = (currentProject.gallery || []).filter(Boolean);
        startTimer(galleryItems, mainImg);
        animateProgress();
    }

    function switchMainImage(idx, galleryItems, mainImg) {
        if (idx === activeGalleryIndex) return;
        activeGalleryIndex = idx;

        mainImg.style.opacity   = '0';
        mainImg.style.transform = 'scale(1.04)';
        setTimeout(() => {
            mainImg.src            = galleryItems[idx];
            // galleryFit class koru
            if (currentProject.galleryFit === 'contain') {
                mainImg.classList.add('img-contain');
            }
            mainImg.style.opacity  = '1';
            mainImg.style.transform = '';
        }, 180);

        updateThumbStates();
        animateProgress();
        updateSlideshowDots();
    }

    function updateThumbStates() {
        document.querySelectorAll('#thumbGallery .thumb-item').forEach(th => {
            th.classList.toggle('thumb-active', parseInt(th.dataset.index) === activeGalleryIndex);
        });
    }

    // ============================================================
    // SLIDESHOW
    // ============================================================
    const SLIDE_INTERVAL = 4000;

    function buildSlideshowUI(mainWrapper, galleryItems, mainImg) {
        const progressBar = document.createElement('div');
        progressBar.className = 'slideshow-progress';
        progressBar.id = 'slideshowProgress';
        mainWrapper.appendChild(progressBar);

        const dotsBar = document.createElement('div');
        dotsBar.className = 'slideshow-dots';
        dotsBar.id = 'slideshowDots';
        dotsBar.innerHTML = galleryItems.map((_, i) =>
            `<span class="slideshow-dot${i === 0 ? ' active' : ''}" data-i="${i}"></span>`
        ).join('');
        mainWrapper.appendChild(dotsBar);

        dotsBar.querySelectorAll('.slideshow-dot').forEach(dot => {
            dot.addEventListener('click', e => {
                e.stopPropagation();
                switchMainImage(parseInt(dot.dataset.i), galleryItems, mainImg);
                restartTimer(galleryItems, mainImg);
            });
        });

        mainWrapper.addEventListener('mouseenter', () => clearInterval(slideshowTimer));
        mainWrapper.addEventListener('mouseleave',  () => startTimer(galleryItems, mainImg));

        startTimer(galleryItems, mainImg);
        animateProgress();
    }

    function startTimer(galleryItems, mainImg) {
        clearInterval(slideshowTimer);
        slideshowTimer = setInterval(() => {
            const next = (activeGalleryIndex + 1) % galleryItems.length;
            switchMainImage(next, galleryItems, mainImg);
        }, SLIDE_INTERVAL);
    }

    function restartTimer(galleryItems, mainImg) {
        clearInterval(slideshowTimer);
        startTimer(galleryItems, mainImg);
    }

    function animateProgress() {
        const bar = document.getElementById('slideshowProgress');
        if (!bar) return;
        bar.style.transition = 'none';
        bar.style.width = '0';
        requestAnimationFrame(() => requestAnimationFrame(() => {
            bar.style.transition = `width ${SLIDE_INTERVAL}ms linear`;
            bar.style.width = '100%';
        }));
    }

    function updateSlideshowDots() {
        document.querySelectorAll('#slideshowDots .slideshow-dot').forEach((d, i) =>
            d.classList.toggle('active', i === activeGalleryIndex)
        );
    }

    // ============================================================
    // LIGHTBOX — sadece ana görsel tıklamasında açılır
    // ============================================================
    function initLightbox() {
        if (document.getElementById('lightboxOverlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'lightboxOverlay';
        overlay.className = 'lightbox-overlay';
        overlay.innerHTML = `
            <button class="lightbox-close" id="lightboxClose" aria-label="Kapat">✕</button>
            <div class="lightbox-inner">
                <button class="lightbox-btn lightbox-prev" id="lightboxPrev" aria-label="Önceki">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <img class="lightbox-img" id="lightboxImg" src="" alt="" style="transition:opacity 0.15s ease">
                <button class="lightbox-btn lightbox-next" id="lightboxNext" aria-label="Sonraki">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <div class="lightbox-caption" id="lightboxCaption"></div>
                <div class="lightbox-dots" id="lightboxDots"></div>
            </div>`;
        document.body.appendChild(overlay);

        let lbImages = [];
        let lbIndex  = 0;

        window._openLightbox = function(idx) {
            lbImages = (currentProject.gallery || []).filter(Boolean);
            if (!lbImages.length) return;
            lbIndex = idx;
            updateLB();
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';

            const dotsEl = document.getElementById('lightboxDots');
            dotsEl.innerHTML = lbImages.map((_, i) =>
                `<span class="lightbox-dot${i === idx ? ' active' : ''}" data-i="${i}"></span>`
            ).join('');
            dotsEl.querySelectorAll('.lightbox-dot').forEach(dot =>
                dot.addEventListener('click', () => lbGoTo(parseInt(dot.dataset.i)))
            );

            const showNav = lbImages.length > 1;
            document.getElementById('lightboxPrev').style.display = showNav ? '' : 'none';
            document.getElementById('lightboxNext').style.display = showNav ? '' : 'none';
        };

        function closeLB() {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
        function lbGoTo(i) {
            lbIndex = (i + lbImages.length) % lbImages.length;
            updateLB();
        }
        function updateLB() {
            const img = document.getElementById('lightboxImg');
            img.style.opacity = '0';
            setTimeout(() => {
                img.src = lbImages[lbIndex];
                img.alt = `${currentProject.title} — ${lbIndex + 1}/${lbImages.length}`;
                img.style.opacity = '1';
            }, 120);
            document.getElementById('lightboxCaption').textContent =
                `${currentProject.title} — ${lbIndex + 1} / ${lbImages.length}`;
            document.querySelectorAll('.lightbox-dot').forEach((d, i) =>
                d.classList.toggle('active', i === lbIndex)
            );
        }

        document.getElementById('lightboxClose').addEventListener('click', closeLB);
        document.getElementById('lightboxPrev').addEventListener('click', () => lbGoTo(lbIndex - 1));
        document.getElementById('lightboxNext').addEventListener('click', () => lbGoTo(lbIndex + 1));
        overlay.addEventListener('click', e => { if (e.target === overlay) closeLB(); });
        document.addEventListener('keydown', e => {
            if (!overlay.classList.contains('active')) return;
            if (e.key === 'Escape')     closeLB();
            if (e.key === 'ArrowLeft')  lbGoTo(lbIndex - 1);
            if (e.key === 'ArrowRight') lbGoTo(lbIndex + 1);
        });
    }

    function openLightbox(idx) {
        if (window._openLightbox) window._openLightbox(idx);
    }

    // ============================================================
    // RELATED PROJECTS
    // ============================================================
    function renderRelatedProjects() {
        const related = window.projectsData
            .filter(p => p.id !== currentProject.id && p.category === currentProject.category)
            .slice(0, 3);
        if (related.length === 0) return '';

        const placeholderMap = { web: 'placeholder-web', '3d': 'placeholder-game', app: 'placeholder-app' };
        const iconMap = {
            '3d': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="3"/><circle cx="8" cy="10" r="1.5" fill="currentColor"/><circle cx="16" cy="14" r="1.5" fill="currentColor"/></svg>`,
            app:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="2" width="14" height="20" rx="3"/><path d="M12 18h.01" stroke-linecap="round" stroke-width="2.5"/></svg>`,
            web:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 1 0 20M2 12h20" stroke-linecap="round"/></svg>`
        };

        return `
            <div class="related-projects">
                <h2>Benzer Projeler</h2>
                <div class="related-grid">
                    ${related.map(p => {
                        const pClass = placeholderMap[p.category] || 'placeholder-game';
                        const icon   = iconMap[p.category] || iconMap['3d'];
                        const img    = p.image
                            ? `<img src="${p.image}" alt="${p.title}" loading="lazy">`
                            : `<div class="project-placeholder ${pClass}">${icon}</div>`;
                        return `
                            <a href="project.html?id=${p.id}" class="project-card">
                                <div class="project-image">${img}</div>
                                <div class="project-overlay"></div>
                                <div class="card-arrow">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                        <path d="M3 13L13 3M13 3H6M13 3V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </div>
                                <div class="project-info">
                                    <span class="project-category">${getCategoryName(p.category)}</span>
                                    <h3>${p.title}</h3>
                                    <p>${p.description}</p>
                                </div>
                            </a>`;
                    }).join('')}
                </div>
            </div>`;
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function getCategoryName(cat) {
        return { web: 'Web', '3d': '3D Oyun', app: 'Mobil' }[cat] || cat;
    }

    function showError(msg) {
        const el = document.getElementById('projectContent');
        if (!el) return;
        el.innerHTML = `
            <div style="text-align:center;padding:4rem 0;">
                <svg width="80" height="80" viewBox="0 0 100 100" fill="none" style="margin:0 auto 2rem;display:block;">
                    <circle cx="50" cy="50" r="40" stroke="var(--accent-primary)" stroke-width="4" opacity="0.3"/>
                    <path d="M50 30v25M50 65v5" stroke="var(--accent-primary)" stroke-width="4" stroke-linecap="round"/>
                </svg>
                <h2 style="font-family:'Lexend',sans-serif;font-size:2rem;margin-bottom:1rem;">${msg}</h2>
                <a href="index.html#projects" class="btn btn-primary" style="margin-top:2rem;display:inline-flex;">
                    <span>Projelere Dön</span>
                </a>
            </div>`;
    }

    // ============================================================
    // INIT
    // ============================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.projectsData) loadProject(); else showError('Projeler yüklenemedi');
        });
    } else {
        if (window.projectsData) loadProject(); else showError('Projeler yüklenemedi');
    }

})();