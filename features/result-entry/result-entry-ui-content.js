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

            /* Course/section selector panel — bounded white card so the
               form controls read as one distinct zone above the result
               table, instead of floating directly on the page background.
               .form-horizontal is the actual wrapper around the selector
               fields on this page (confirmed by the existing hr selector
               above, which already targeted it before this change). */
            body.${BODY_CLASS} .form-horizontal {
                background: #fff;
                border: 1px solid #eef1f6;
                border-radius: 10px;
                box-shadow: 0 1px 2px rgba(16,24,40,.04);
                padding: 1.25rem 1.5rem 1.5rem;
                margin-bottom: 1.5rem;
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
                border-radius: 6px;
                font-weight: 600;
                padding: .5rem 1.1rem;
                transition: box-shadow .15s ease, transform .1s ease;
            }
            body.${BODY_CLASS} .btn-outline-primary {
                background: #3A67B2;
                color: #fff;
                border: none;
                box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
            }
            body.${BODY_CLASS} .btn-outline-primary:hover { box-shadow: 0 3px 3px -2px rgba(0,0,0,.2), 0 3px 4px 0 rgba(0,0,0,.14), 0 1px 8px 0 rgba(0,0,0,.12); }
            body.${BODY_CLASS} .btn-outline-secondary { border-width: 1.5px; }
            body.${BODY_CLASS} #SaveBtn.btn-primary {
                background: #3A67B2;
                border: none;
                border-radius: 6px;
                font-weight: 600;
                padding: .5rem 1.2rem;
                box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
                transition: box-shadow .15s ease;
            }
            body.${BODY_CLASS} #SaveBtn.btn-primary:hover { box-shadow: 0 3px 3px -2px rgba(0,0,0,.2), 0 3px 4px 0 rgba(0,0,0,.14), 0 1px 8px 0 rgba(0,0,0,.12); }
            body.${BODY_CLASS} h5.alert-warning {
                border-radius: 6px !important;
                background: #fffbeb !important;
                border: 1px solid #fde68a !important;
                color: #92400e !important;
                font-size: .85rem;
                padding: .6rem .8rem;
            }

            /* Result table — structural selectors, so per-student rows
               rendered by the server (or updated in place by MarkEntry())
               pick this up automatically without any DOM being touched.
               Row-as-card treatment matches registration.js: real <tr>
               table rows here (no tr.d-flex fake rows on this page), so
               border-collapse:separate + border-spacing gives the row gap. */
            body.${BODY_CLASS} #T1 {
                border-collapse: separate;
                border-spacing: 0 8px;
                background: transparent;
            }
            body.${BODY_CLASS} #T1 tr:first-child th {
                background: transparent;
                color: #667085;
                font-weight: 700;
                font-size: .8rem;
                text-transform: uppercase;
                letter-spacing: .05em;
                border-bottom: 2px solid #dbe3f5 !important;
                padding: .5rem .8rem .6rem;
                white-space: nowrap;
            }
            body.${BODY_CLASS} #T1 tbody tr:not(:first-child) {
                background: #fff;
                box-shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08);
                border-radius: 8px;
                transition: box-shadow .12s ease;
            }
            body.${BODY_CLASS} #T1 tbody tr:not(:first-child):hover {
                box-shadow: 0 2px 4px -1px rgba(16,24,40,.1), 0 4px 8px 0 rgba(16,24,40,.1);
            }
            body.${BODY_CLASS} #T1 tbody tr:not(:first-child) td:first-child {
                border-top-left-radius: 8px;
                border-bottom-left-radius: 8px;
            }
            body.${BODY_CLASS} #T1 tbody tr:not(:first-child) td:last-child {
                border-top-right-radius: 8px;
                border-bottom-right-radius: 8px;
            }
            body.${BODY_CLASS} #T1 td {
                padding: .6rem .8rem;
                vertical-align: middle;
                font-size: .95rem;
            }
            body.${BODY_CLASS} #T1.table-bordered td,
            body.${BODY_CLASS} #T1.table-bordered th {
                border-color: transparent !important;
            }
            body.${BODY_CLASS} #T1.table-striped tbody tr:nth-of-type(odd) {
                background-color: #fff;
            }

            /* Student ID / registration number column reads like a code —
               monospace keeps it one clean scannable unit, matching the
               Course ID treatment in registration.js. */
            body.${BODY_CLASS} #T1 td:first-child {
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                font-size: .92rem;
                font-weight: 600;
                color: #2c5296;
                white-space: nowrap;
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

            /* Wrap the result table so it scrolls horizontally rather than
               overflowing the viewport when it doesn't already sit inside a
               .table-responsive wrapper. */
            body.${BODY_CLASS} .table-responsive {
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
            }

            @media (max-width: 991.98px) {
                body.${BODY_CLASS} main { padding-left: 1rem !important; padding-right: 1rem !important; }
                body.${BODY_CLASS} .form-horizontal .form-group,
                body.${BODY_CLASS} main .row {
                    flex-wrap: wrap;
                }
                body.${BODY_CLASS} .form-horizontal {
                    padding: 1rem 1.1rem 1.25rem;
                }
                body.${BODY_CLASS} #T1:not(.table-responsive *) {
                    display: block;
                    width: 100%;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }
                body.${BODY_CLASS} .btn-group {
                    flex-wrap: wrap;
                }
            }

            @media (max-width: 575.98px) {
                body.${BODY_CLASS} main > h2:first-of-type { font-size: 1.3rem; }
                body.${BODY_CLASS} .form-group label { font-size: .82rem; }
                body.${BODY_CLASS} .form-horizontal {
                    border-radius: 6px;
                    padding: .85rem .9rem 1.1rem;
                }
                body.${BODY_CLASS} .form-horizontal .form-group > label,
                body.${BODY_CLASS} .form-horizontal .form-group > div {
                    flex: 0 0 100%;
                    max-width: 100%;
                }
                body.${BODY_CLASS} select.form-control,
                body.${BODY_CLASS} input.form-control,
                body.${BODY_CLASS} .btn-outline-secondary,
                body.${BODY_CLASS} .btn-outline-primary,
                body.${BODY_CLASS} .btn-outline-info {
                    font-size: .82rem;
                    padding: .4rem .6rem;
                }
                body.${BODY_CLASS} #T1 tr:first-child th,
                body.${BODY_CLASS} #T1 td {
                    padding: .4rem .45rem;
                    font-size: .8rem;
                }
                body.${BODY_CLASS} h5.alert-warning { font-size: .78rem; }
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
