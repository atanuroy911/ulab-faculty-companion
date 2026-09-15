// features/account/account-ui-content.js — content script for the URMS
// "Manage Account" (Change Password) page. Simple static Bootstrap 3-style
// form; pure CSS reskin, nothing moved or replaced. Cloak/toggle/sidebar/
// dark-mode are all owned by the shared
// features/shared/ulab-dashboard-shell.js, loaded first in this bundle.
(function () {
    const STYLE_ID = 'ulab-modern-account-css';
    const BODY_CLASS = 'ulab-modern-account';

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            body.${BODY_CLASS} {
                background: linear-gradient(180deg, #f7f9fd 0%, #eef2fb 100%);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
            }

            /* Navbar (shared look across all reskinned pages) */
            body.${BODY_CLASS} header nav.navbar {
                background: #3A67B2 !important;
                border-bottom: none !important;
                box-shadow: 0 2px 4px -1px rgba(0,0,0,.2), 0 4px 5px 0 rgba(0,0,0,.14), 0 1px 10px 0 rgba(0,0,0,.12) !important;
                padding-top: .6rem;
                padding-bottom: .6rem;
            }
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

            /* Page heading */
            body.${BODY_CLASS} main > h2:first-of-type {
                background: linear-gradient(135deg, #2c5296 0%, #63b3ed 100%);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
                font-weight: 800;
                letter-spacing: -.02em;
            }
            body.${BODY_CLASS} main h4 { font-weight: 700; color: #101828; font-size: 1.05rem; }
            body.${BODY_CLASS} main hr {
                border-color: rgba(16,24,40,.08);
            }

            /* Form panel — the change-password fields floated directly on
               the page canvas with no visual boundary; giving the whole
               .form-horizontal a bounded white card matches the panel
               treatment used for grouped sections elsewhere (registration,
               home) instead of leaving fields to float loose. */
            body.${BODY_CLASS} main .form-horizontal {
                background: #fff;
                border: 1px solid #eef1f6;
                border-radius: 10px;
                box-shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08);
                padding: 1.5rem 1.75rem;
                max-width: 640px;
            }
            body.${BODY_CLASS} .form-horizontal .form-group {
                margin-bottom: 1.1rem;
            }
            body.${BODY_CLASS} .control-label { font-weight: 600; color: #344054; font-size: .95rem; }
            body.${BODY_CLASS} .form-control {
                border-radius: 6px;
                border: 1.5px solid #e4e7ec;
                padding: .55rem .8rem;
                font-size: .95rem;
                transition: border-color .15s ease, box-shadow .15s ease;
            }
            body.${BODY_CLASS} .form-control:focus {
                outline: none;
                border-color: #3A67B2;
                box-shadow: 0 0 0 3px rgba(58,103,178,.12);
            }
            body.${BODY_CLASS} input[type="submit"].btn-primary {
                border-radius: 6px;
                background: #3A67B2;
                border: none;
                font-weight: 600;
                padding: .55rem 1.4rem;
                box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
                transition: box-shadow .15s ease, transform .1s ease;
            }
            body.${BODY_CLASS} input[type="submit"].btn-primary:hover {
                box-shadow: 0 3px 3px -2px rgba(0,0,0,.2), 0 3px 4px 0 rgba(0,0,0,.14), 0 1px 8px 0 rgba(0,0,0,.12);
            }
            body.${BODY_CLASS} .field-validation-error {
                color: #d92d20; font-size: .8rem;
            }

            @media (max-width: 991.98px) {
                body.${BODY_CLASS} main { padding-left: 1.25rem !important; padding-right: 1.25rem !important; }
                body.${BODY_CLASS} main .form-horizontal { max-width: 100%; padding: 1.25rem; }
                body.${BODY_CLASS} .form-horizontal .form-group {
                    display: flex;
                    flex-wrap: wrap;
                }
                body.${BODY_CLASS} .form-horizontal .control-label,
                body.${BODY_CLASS} .form-horizontal .col-sm-2,
                body.${BODY_CLASS} .form-horizontal .col-sm-3,
                body.${BODY_CLASS} .form-horizontal .col-sm-4,
                body.${BODY_CLASS} .form-horizontal .col-sm-6,
                body.${BODY_CLASS} .form-horizontal .col-sm-8,
                body.${BODY_CLASS} .form-horizontal .col-sm-10 {
                    max-width: 100%;
                    flex: 0 0 100%;
                }
            }

            @media (max-width: 575.98px) {
                body.${BODY_CLASS} main { padding-left: .9rem !important; padding-right: .9rem !important; }
                body.${BODY_CLASS} main > h2:first-of-type { font-size: 1.25rem; }
                body.${BODY_CLASS} main h4 { font-size: .95rem; }
                body.${BODY_CLASS} main .form-horizontal { padding: 1rem; border-radius: 8px; }
                body.${BODY_CLASS} .control-label { font-size: .85rem; }
                body.${BODY_CLASS} .form-control { font-size: .9rem; }
                body.${BODY_CLASS} input[type="submit"].btn-primary {
                    width: 100%;
                    padding: .6rem 1rem;
                }
                body.${BODY_CLASS} .modal-dialog {
                    max-width: calc(100% - 1rem) !important;
                    margin: .5rem auto;
                }
            }

            /* Footer */
            body.${BODY_CLASS} footer {
                background: transparent;
                border-top: 1px solid rgba(16,24,40,.06) !important;
                font-size: .8rem;
            }
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
