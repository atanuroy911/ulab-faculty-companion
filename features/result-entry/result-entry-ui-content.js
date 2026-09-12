// features/result-entry/result-entry-ui-content.js — content script for the
// URMS Section Wise Result Entry page. Same narrow approach as the
// Registration page reskin: only navbar, static labels/selects/buttons and
// table header row get restyled via CSS on stable selectors/ids; the
// per-student mark inputs/selects and the status icons that
// MarkEntry()/LoadStudent() write into #Mark-N-status are left completely
// alone structurally (they still inherit generic input/select/table
// styling below, but nothing here moves or replaces them). Cloak/toggle/
// sidebar/dark-mode are all owned by the shared
// features/shared/ulab-dashboard-shell.js, loaded first in this bundle.
(function () {
    const STYLE_ID = 'ulab-modern-result-entry-css';
    const BODY_CLASS = 'ulab-modern-result-entry';

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
            body.${BODY_CLASS} .form-horizontal > hr:first-of-type {
                width: 64px;
                height: 4px;
                border: none;
                border-radius: 4px;
                background: linear-gradient(90deg, #3A67B2, #63b3ed);
                margin: .75rem 0 1.5rem;
            }

            /* Static labels & form controls */
            body.${BODY_CLASS} .form-group label { font-weight: 600; color: #344054; font-size: .9rem; }
            body.${BODY_CLASS} select.form-control,
            body.${BODY_CLASS} input.form-control,
            body.${BODY_CLASS} input[type="file"] {
                border-radius: 4px;
                border: 1.5px solid #e4e7ec;
                transition: border-color .15s ease;
            }
            body.${BODY_CLASS} select.form-control:focus,
            body.${BODY_CLASS} input.form-control:focus {
                outline: none;
                border-color: #3A67B2;
            }
            body.${BODY_CLASS} .btn-outline-secondary,
            body.${BODY_CLASS} .btn-outline-primary,
            body.${BODY_CLASS} .btn-outline-info {
                border-radius: 4px;
                font-weight: 600;
                transition: box-shadow .15s ease;
            }
            body.${BODY_CLASS} .btn-outline-primary {
                background: #3A67B2;
                color: #fff;
                border: none;
                box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
            }
            body.${BODY_CLASS} .btn-outline-primary:hover { box-shadow: 0 3px 3px -2px rgba(0,0,0,.2), 0 3px 4px 0 rgba(0,0,0,.14), 0 1px 8px 0 rgba(0,0,0,.12); }
            body.${BODY_CLASS} #SaveBtn.btn-primary {
                background: #3A67B2;
                border: none;
                border-radius: 4px;
                font-weight: 600;
            }
            body.${BODY_CLASS} h5.alert-warning {
                border-radius: 4px !important;
                background: #fffbeb !important;
                border: 1px solid #fde68a !important;
                color: #92400e !important;
                font-size: .85rem;
                padding: .5rem;
            }

            /* Result table — structural selectors, so per-student rows
               rendered by the server (or updated in place by MarkEntry())
               pick this up automatically without any DOM being touched. */
            body.${BODY_CLASS} #T1 {
                border-radius: 4px;
                overflow: hidden;
                background: #fff;
            }
            body.${BODY_CLASS} #T1 tr:first-child th {
                background: #eef2fb;
                color: #344054;
                font-weight: 700;
                font-size: .76rem;
                text-transform: uppercase;
                letter-spacing: .03em;
                border-bottom: none !important;
                padding: .7rem .8rem;
            }
            body.${BODY_CLASS} #T1 td {
                padding: .55rem .7rem;
                vertical-align: middle;
                font-size: .88rem;
            }
            body.${BODY_CLASS} #T1.table-bordered td,
            body.${BODY_CLASS} #T1.table-bordered th {
                border-color: #eef1f6 !important;
            }
            body.${BODY_CLASS} #T1.table-striped tbody tr:nth-of-type(odd) {
                background-color: #fafbfd;
            }

            /* Print/report split button */
            body.${BODY_CLASS} .btn-group .btn-outline-info {
                border-color: #cfe0f7;
                color: #2c5296;
            }
            body.${BODY_CLASS} .btn-group .btn-outline-info:hover { background: #eef2fb; }

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
