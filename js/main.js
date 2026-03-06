(function() {
    function initThemeToggle() {
        const toggle = document.getElementById('themeToggle');
        const html = document.documentElement;
        
        const saved = localStorage.getItem('theme') || 'dark';
        html.setAttribute('data-theme', saved);

        if (!toggle) return;

        toggle.addEventListener('click', () => {
            const current = html.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
        });
    }

    // YENİ: Mobil menü mantığı buraya taşındı
    function initMobileMenu() {
        const btn = document.querySelector('.mobile-menu-btn');
        const links = document.querySelector('.nav-links');
        if (btn && links) {
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
                links.classList.toggle('active');
            });
        }
    }

    function initProjects() {
        updateFilterCounts();
        renderProjects('all');
        initProjectFilters();
    }

    function updateFilterCounts() {
        const counts = {
            'all': window.projectsData.length,
            '3d':  window.projectsData.filter(p => p.category === '3d').length,
            'app': window.projectsData.filter(p => p.category === 'app').length
        };

        document.querySelectorAll('.filter-text').forEach(btn => {
            const filter = btn.getAttribute('data-filter');
            const countEl = btn.querySelector('.count');
            if (countEl && counts[filter] !== undefined) {
                countEl.textContent = counts[filter].toString().padStart(2, '0');
            }
        });
    }

    function renderProjects(filter) {
        const grid = document.getElementById('projectsGrid');
        if (!grid) return;

        grid.innerHTML = '';

        const list = filter === 'all'
            ? window.projectsData
            : window.projectsData.filter(p => p.category === filter);

        list.forEach((project, index) => {
            const card = createProjectCard(project, index);
            grid.appendChild(card);
        });

        setTimeout(() => {
            document.querySelectorAll('#projectsGrid .project-card').forEach((card, i) => {
                setTimeout(() => card.classList.add('visible'), i * 60);
            });
        }, 80);
    }

    function createProjectCard(project, index) {
        const size = project.cardSize || 'normal';
        const sizeClass = size !== 'normal' ? `card-${size}` : '';

        const card = document.createElement('a');
        card.className = `project-card animate-on-scroll${sizeClass ? ' ' + sizeClass : ''}`;
        card.href = `project.html?id=${project.id}`;
        card.setAttribute('data-index', String(index + 1).padStart(2, '0'));

        const placeholderMap = { '3d': 'placeholder-game', app: 'placeholder-app' };
        const placeholderClass = placeholderMap[project.category] || 'placeholder-game';

        const iconMap = {
            '3d': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="3"/><circle cx="8" cy="10" r="1.5" fill="currentColor"/><circle cx="16" cy="14" r="1.5" fill="currentColor"/><path d="M14 10h2M13 14h-1" stroke-linecap="round"/></svg>`,
            app: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="2" width="14" height="20" rx="3"/><path d="M12 18h.01" stroke-linecap="round" stroke-width="2.5"/></svg>`
        };
        const iconSvg = iconMap[project.category] || iconMap['3d'];

        const imageContent = project.image
            ? `<img src="${project.image}" alt="${project.title}" loading="lazy">`
            : `<div class="project-placeholder ${placeholderClass}">${iconSvg}</div>`;

        card.innerHTML = `
            <div class="project-image">${imageContent}</div>
            <div class="project-overlay"></div>
            <div class="card-arrow">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 13L13 3M13 3H6M13 3V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>
            <div class="project-info">
                <span class="project-category">${getCategoryName(project.category)}</span>
                <h3>${project.title}</h3>
                <p>${project.description}</p>
            </div>
        `;

        return card;
    }

    function getCategoryName(cat) {
        return { '3d': '3D Oyun', app: 'Mobil' }[cat] || cat;
    }

    function initProjectFilters() {
        const buttons = document.querySelectorAll('.filter-text');
        const grid = document.getElementById('projectsGrid');

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.getAttribute('data-filter');
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                grid.style.opacity = '0';
                grid.style.transform = 'translateY(16px)';
                grid.style.transition = 'opacity 0.25s ease, transform 0.25s ease';

                setTimeout(() => {
                    renderProjects(filter);
                    grid.style.opacity = '1';
                    grid.style.transform = 'translateY(0)';
                }, 280);
            });
        });
    }

    function init() {
        initThemeToggle();
        initMobileMenu();
        initProjects();
        initDocLightbox();
    }

    // ── Doc Chip Lightbox ──
    function initDocLightbox() {
        // Overlay oluştur
        const overlay = document.createElement('div');
        overlay.className = 'doc-lightbox-overlay';
        overlay.id = 'docLightbox';
        overlay.innerHTML = `
            <button class="doc-lightbox-close" id="docLightboxClose">✕</button>
            <div class="doc-lightbox-inner" id="docLightboxInner">
                <div class="doc-lightbox-title" id="docLightboxTitle"></div>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('docLightboxClose').addEventListener('click', closeDocLB);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeDocLB(); });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && overlay.classList.contains('active')) closeDocLB();
        });

        // Chip tıklama delegasyonu
        document.addEventListener('click', e => {
            const chip = e.target.closest('.doc-chip[data-src]');
            if (!chip) return;
            openDocLB(chip.dataset.src, chip.dataset.label, chip.dataset.type);
        });

        function openDocLB(src, label, type) {
            const inner = document.getElementById('docLightboxInner');
            const title = document.getElementById('docLightboxTitle');
            // Önceki içeriği temizle
            inner.querySelectorAll('img, iframe').forEach(el => el.remove());
            title.textContent = label || '';

            if (type === 'pdf') {
                const iframe = document.createElement('iframe');
                iframe.src = src;
                inner.insertBefore(iframe, title);
            } else {
                const img = document.createElement('img');
                img.src = src;
                img.alt = label || 'Belge';
                inner.insertBefore(img, title);
            }

            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeDocLB() {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();


