// Animations & Interactions
(function() {

    // ============================================================
    // SCROLL ANIMATIONS (IntersectionObserver)
    // ============================================================
    function initScrollAnimations() {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target); // Fire once
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -80px 0px' });

        document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));
    }

    // ============================================================
    // COUNTER ANIMATION
    // ============================================================
    function initCounters() {
        const counterObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !entry.target.classList.contains('counted')) {
                    animateCounter(entry.target);
                    entry.target.classList.add('counted');
                }
            });
        }, { threshold: 0.5 });

        document.querySelectorAll('.stat-number[data-target]').forEach(el => counterObserver.observe(el));
    }

    function animateCounter(el) {
        const raw = el.getAttribute('data-target');
        const target = parseInt(raw);
        if (isNaN(target)) return;

        const duration = 1800;
        const step = target / (duration / 16);
        let current = 0;

        const tick = () => {
            current += step;
            if (current < target) {
                el.textContent = Math.floor(current);
                requestAnimationFrame(tick);
            } else {
                el.textContent = target;
            }
        };
        tick();
    }

    // ============================================================
    // SMOOTH SCROLL
    // ============================================================
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(a => {
            a.addEventListener('click', e => {
                const href = a.getAttribute('href');
                if (href === '#') return;
                const target = document.querySelector(href);
                if (!target) return;
                e.preventDefault();
                window.scrollTo({ top: target.offsetTop - 75, behavior: 'smooth' });
            });
        });
    }

    // ============================================================
    // NAVBAR SCROLL EFFECT
    // ============================================================
    function initNavbar() {
        const navbar = document.getElementById('navbar');
        if (!navbar) return;

        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 80) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        }, { passive: true });
    }

    // ============================================================
    // MOBILE MENU
    // ============================================================
    function initMobileMenu() {
        const btn = document.getElementById('mobileMenuBtn');
        const links = document.getElementById('navLinks');
        if (!btn || !links) return;

        btn.addEventListener('click', () => {
            const open = links.classList.toggle('active');
            btn.classList.toggle('active', open);
            btn.setAttribute('aria-expanded', open);
        });

        // Close on link click
        links.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                links.classList.remove('active');
                btn.classList.remove('active');
                btn.setAttribute('aria-expanded', false);
            });
        });

        // Close on outside click
        document.addEventListener('click', e => {
            if (!navbar?.contains(e.target)) {
                links.classList.remove('active');
                btn.classList.remove('active');
            }
        });
    }

    // ============================================================
    // HERO PARALLAX (subtle)
    // ============================================================
    function initParallax() {
        const hero = document.querySelector('.hero-content');
        if (!hero) return;

        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            if (scrolled < window.innerHeight) {
                hero.style.transform = `translateY(${scrolled * 0.35}px)`;
                hero.style.opacity = Math.max(0, 1 - scrolled / (window.innerHeight * 0.85));
            }
        }, { passive: true });
    }

    // ============================================================
    // ADD ANIMATE CLASSES TO STATIC ELEMENTS
    // ============================================================
    function addAnimationClasses() {
        document.querySelectorAll('.expertise-card:not(.animate-on-scroll)').forEach(el => {
            el.classList.add('animate-on-scroll');
        });
        document.querySelectorAll('.contact-method:not(.animate-on-scroll)').forEach(el => {
            el.classList.add('animate-on-scroll');
        });
        document.querySelectorAll('.stat-item:not(.animate-on-scroll)').forEach(el => {
            el.classList.add('animate-on-scroll');
        });
    }

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        addAnimationClasses();
        initScrollAnimations();
        initCounters();
        initSmoothScroll();
        initNavbar();
        initMobileMenu();
        initParallax();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();