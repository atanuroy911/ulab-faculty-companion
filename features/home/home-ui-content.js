// features/home/home-ui-content.js — content script injected into the URMS
// Home page. Purely a CSS reskin: no DOM is moved, replaced, or removed, so
// the page's own scripts (Bootstrap dropdowns/pills, the notification bell
// polling/AJAX) keep working exactly as before — this only changes how
// things look, via attribute/id selectors keyed to markup that already
// exists. Cloak/toggle/sidebar/dark-mode are all owned by the shared
// features/shared/ulab-dashboard-shell.js, loaded first in this bundle
// (see manifest.json) — this file only supplies page-specific CSS and
// mounts it through window.ULAB_SHELL.
(function () {
    const STYLE_ID = 'ulab-modern-home-css';
    const BODY_CLASS = 'ulab-modern-home';

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            body.${BODY_CLASS} {
                background: linear-gradient(180deg, #f7f9fd 0%, #eef2fb 100%);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
            }

            /* Navbar */
            body.${BODY_CLASS} header nav.navbar {
                background: #3A67B2 !important;
                border-bottom: none !important;
                box-shadow: 0 2px 4px -1px rgba(0,0,0,.2), 0 4px 5px 0 rgba(0,0,0,.14), 0 1px 10px 0 rgba(0,0,0,.12) !important;
                padding-top: .6rem;
                padding-bottom: .6rem;
            }
            body.${BODY_CLASS} .navbar-brand img { filter: drop-shadow(0 1px 2px rgba(0,0,0,.15)); }
            body.${BODY_CLASS} .navbar-nav .nav-link {
                border-radius: 4px;
                padding: .5rem .85rem !important;
                transition: background .15s ease;
            }
            body.${BODY_CLASS} .navbar-nav .nav-link:hover { background: rgba(255,255,255,.12); }
            body.${BODY_CLASS} .dropdown-menu {
                border: none;
                border-radius: 4px;
                box-shadow: 0 5px 5px -3px rgba(0,0,0,.2), 0 8px 10px 1px rgba(0,0,0,.14), 0 3px 14px 2px rgba(0,0,0,.12);
                padding: .4rem 0;
                margin-top: .5rem;
            }
            body.${BODY_CLASS} .dropdown-item {
                border-radius: 0;
                padding: .55rem .9rem;
                font-size: .9rem;
                color: #344054;
                transition: background .12s ease, color .12s ease;
            }
            body.${BODY_CLASS} .dropdown-item:hover { background: #eef2fb; color: #2c5296; }
            body.${BODY_CLASS} .navbar-nav.ml-auto .nav-link.text-light.btn {
                background: rgba(255,255,255,.14);
                border-radius: 4px;
                font-size: .85rem;
            }
            body.${BODY_CLASS} .navbar-nav.ml-auto form .btn-link {
                border-radius: 4px;
                padding: .4rem .9rem;
                transition: background .15s ease;
            }
            body.${BODY_CLASS} .navbar-nav.ml-auto form .btn-link:hover {
                background: rgba(255,255,255,.14);
                text-decoration: none;
            }

            /* Hero */
            body.${BODY_CLASS} main #welcomeTextHeader {
                background: linear-gradient(135deg, #2c5296 0%, #63b3ed 100%);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
                font-weight: 800;
                letter-spacing: -.02em;
                margin-top: 1rem;
            }
            body.${BODY_CLASS} main hr {
                width: 64px;
                height: 4px;
                border: none;
                border-radius: 4px;
                background: linear-gradient(90deg, #3A67B2, #63b3ed);
                margin: .75rem auto 2rem;
            }

            /* Dashboard card */
            body.${BODY_CLASS} main .card {
                border: none;
                border-radius: 8px;
                background: #fff;
                box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
                overflow: hidden;
            }
            body.${BODY_CLASS} main .card > .d-flex { align-items: stretch !important; }

            /* Vertical pill tabs -> segmented sidebar */
            body.${BODY_CLASS} #v-pills-tab {
                background: transparent !important;
                border-radius: 0;
                margin: 0 !important;
                padding: 1.5rem 1rem;
                min-width: 220px;
                border-right: 1px solid rgba(16,24,40,.06);
                gap: .35rem;
            }
            body.${BODY_CLASS} #v-pills-tab .nav-link {
                background: transparent;
                color: #475467;
                border-radius: 4px;
                padding: .65rem .9rem !important;
                font-size: .95rem !important;
                font-weight: 600;
                text-align: left;
                transition: background .15s ease, color .15s ease;
                position: relative;
                padding-left: 2.4rem !important;
            }
            body.${BODY_CLASS} #v-pills-tab .nav-link::before {
                content: '';
                position: absolute;
                left: .85rem; top: 50%; transform: translateY(-50%);
                width: 16px; height: 16px;
                background-repeat: no-repeat; background-size: contain;
                opacity: .55;
            }
            body.${BODY_CLASS} #menu1-tab::before {
                background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475467' stroke-width='2'><path d='M22 10 12 5 2 10l10 5 10-5Z'/><path d='M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5'/></svg>");
            }
            body.${BODY_CLASS} #menu2-tab::before {
                background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475467' stroke-width='2'><rect x='3' y='4' width='18' height='16' rx='2'/><path d='M3 9h18M9 4v16'/></svg>");
            }
            body.${BODY_CLASS} #v-pills-tab .nav-link:hover { background: #eef2fb; color: #2c5296; }
            body.${BODY_CLASS} #v-pills-tab .nav-link.active {
                background: #3A67B2 !important;
                color: #fff !important;
                box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
            }
            body.${BODY_CLASS} #v-pills-tab .nav-link.active::before { opacity: 1; filter: brightness(0) invert(1); }

            /* Tile grid */
            body.${BODY_CLASS} .tab-content { flex: 1; padding: 1.75rem 2rem !important; }
            body.${BODY_CLASS} .tab-pane {
                display: grid !important;
                grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
                gap: .9rem;
            }
            body.${BODY_CLASS} .tab-pane.fade:not(.show) { display: none !important; }
            body.${BODY_CLASS} .tab-pane a {
                display: flex;
                align-items: center;
                gap: .7rem;
                background: #fff;
                border: 1px solid rgba(16,24,40,.1);
                border-radius: 4px;
                padding: 1rem 1.1rem;
                text-decoration: none !important;
                transition: box-shadow .15s ease, border-color .15s ease;
            }
            body.${BODY_CLASS} .tab-pane a:hover {
                box-shadow: 0 3px 3px -2px rgba(0,0,0,.2), 0 3px 4px 0 rgba(0,0,0,.14), 0 1px 8px 0 rgba(0,0,0,.12);
                border-color: rgba(58,103,178,.3);
            }
            body.${BODY_CLASS} .tab-pane a::before {
                content: '';
                flex-shrink: 0;
                width: 34px; height: 34px;
                border-radius: 4px;
                background: #eef2fb url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233A67B2' stroke-width='2'><path d='M5 12h14M13 6l6 6-6 6'/></svg>") no-repeat center / 16px;
            }
            body.${BODY_CLASS} .tab-pane a h5 {
                margin: 0;
                font-size: .93rem;
                font-weight: 600;
                color: #101828;
            }

            @media (max-width: 991.98px) {
                body.${BODY_CLASS} main .card > .d-flex { flex-direction: column !important; }
                body.${BODY_CLASS} #v-pills-tab {
                    flex-direction: row !important;
                    border-right: none;
                    border-bottom: 1px solid rgba(16,24,40,.06);
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                    min-width: 0;
                    padding: 1rem;
                }
                body.${BODY_CLASS} #v-pills-tab .nav-link { white-space: nowrap; }
            }

            @media (max-width: 575.98px) {
                body.${BODY_CLASS} main #welcomeTextHeader { font-size: 1.5rem; }
                body.${BODY_CLASS} .tab-content { padding: 1.1rem 1rem !important; }
                body.${BODY_CLASS} .tab-pane {
                    grid-template-columns: 1fr;
                    gap: .6rem;
                }
                body.${BODY_CLASS} .tab-pane a { padding: .85rem .9rem; }
                body.${BODY_CLASS} #v-pills-tab .nav-link {
                    padding: .55rem .7rem !important;
                    padding-left: 2.1rem !important;
                    font-size: .85rem !important;
                }
            }

            /* Footer */
            body.${BODY_CLASS} footer {
                background: transparent;
                border-top: 1px solid rgba(16,24,40,.06) !important;
                font-size: .8rem;
            }

            /* Dark mode: the generic body.ulab-dark rules (shared shell) only
               reach .card/table/form elements, not these hand-styled tile
               links, so their white background + dark text survive untouched
               while a *different* dark-mode rule (body.ulab-dark main h5)
               still recolors the h5 text light-gray — leaving near-invisible
               light-gray-on-white. Give the tiles their own dark surface. */
            body.ulab-dark.${BODY_CLASS} .tab-pane a {
                background: #1c202c;
                border-color: #2c3142;
            }
            body.ulab-dark.${BODY_CLASS} .tab-pane a:hover {
                border-color: rgba(99,179,237,.4);
                box-shadow: 0 3px 8px rgba(0,0,0,.35);
            }
            body.ulab-dark.${BODY_CLASS} .tab-pane a h5 { color: #e2e8f0 !important; }
            body.ulab-dark.${BODY_CLASS} .tab-pane a::before { background-color: #262b3b; }
            body.ulab-dark.${BODY_CLASS} #v-pills-tab { border-color: #2c3142; }
            body.ulab-dark.${BODY_CLASS} #v-pills-tab .nav-link { color: #9aa5b8; }
            body.ulab-dark.${BODY_CLASS} #v-pills-tab .nav-link:hover { background: #1c202c; color: #63b3ed; }
        `;
        document.head.appendChild(style);
    }

    function init() {
        injectStyles();
        window.ULAB_SHELL.mount(BODY_CLASS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
