// features/attendance/attendance-ui-content.js — content script covering all
// four Attendance Sheet pages (Print, Exam Attendance, Grade Sheet Blank,
// Marks Distribution Sheet) plus the Advising Student page — they all share
// the same simple static-form template (Semester/CourseId/Section or
// AdviserId selects, format radios, Print button), so one reskin covers all
// of them. Pure CSS on stable ids/classes; nothing is moved or replaced, and
// none of this page's elements are rewritten by runtime JS. Cloak/toggle/
// sidebar/dark-mode are all owned by the shared
// features/shared/ulab-dashboard-shell.js, loaded first in this bundle.
(function () {
    const STYLE_ID = 'ulab-modern-attendance-css';
    const BODY_CLASS = 'ulab-modern-attendance';

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

            /* Form panel — the whole filter form (Semester/CourseId/Section
               or AdviserId selects, format radios, Print button) sits
               directly on the page background in the original markup, with
               nothing separating it visually from the canvas. Confirmed
               anchor: .form-horizontal is the form element itself (already
               used above for the accent-bar hr), so styling it directly is
               safe and doesn't require guessing at any wrapper markup. */
            body.${BODY_CLASS} .form-horizontal {
                background: #fff;
                border: 1px solid #eef1f6;
                border-radius: 10px;
                box-shadow: 0 1px 2px rgba(16,24,40,.04);
                padding: 1.5rem 1.75rem;
            }
            body.${BODY_CLASS} .form-group label { font-weight: 600; color: #344054; font-size: .92rem; }
            body.${BODY_CLASS} select.form-control {
                border-radius: 4px;
                border: 1.5px solid #e4e7ec;
                font-size: .95rem;
                transition: border-color .15s ease;
            }
            body.${BODY_CLASS} select.form-control:focus {
                outline: none;
                border-color: #3A67B2;
            }
            /* Course/section identifiers in the selects read as codes, not
               prose — monospace keeps them one clean scannable unit. */
            body.${BODY_CLASS} #CourseId,
            body.${BODY_CLASS} #Section {
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            }
            body.${BODY_CLASS} .radioOption { accent-color: #3A67B2; margin-right: 4px; }
            body.${BODY_CLASS} .radioOption + * { margin-right: 1.1rem; }
            body.${BODY_CLASS} input[type="submit"].btn-primary {
                border-radius: 6px;
                background: #3A67B2;
                border: none;
                font-weight: 600;
                padding: .55rem 1.3rem;
                box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
                transition: box-shadow .15s ease, transform .1s ease;
            }
            body.${BODY_CLASS} input[type="submit"].btn-primary:hover {
                box-shadow: 0 3px 3px -2px rgba(0,0,0,.2), 0 3px 4px 0 rgba(0,0,0,.14), 0 1px 8px 0 rgba(0,0,0,.12);
            }

            /* Row-as-card tables — this bundle covers four print pages, some
               of which render a generated roster/attendance table below the
               filter form (structural selectors only, so this is a no-op
               where no table exists). Mirrors registration.js's treatment. */
            body.${BODY_CLASS} .table {
                border-collapse: separate;
                border-spacing: 0 8px;
            }
            body.${BODY_CLASS} .table th {
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
            body.${BODY_CLASS} .table td {
                padding: .7rem .8rem;
                vertical-align: middle;
                font-size: .95rem;
            }
            body.${BODY_CLASS} .table-bordered,
            body.${BODY_CLASS} .table-bordered td,
            body.${BODY_CLASS} .table-bordered th {
                border-color: transparent !important;
            }
            body.${BODY_CLASS} .table tbody tr {
                background: #fff;
                box-shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08);
                border-radius: 8px;
                transition: box-shadow .12s ease;
            }
            body.${BODY_CLASS} .table tbody tr:hover {
                box-shadow: 0 2px 4px -1px rgba(16,24,40,.1), 0 4px 8px 0 rgba(16,24,40,.1);
            }
            body.${BODY_CLASS} .table tbody td:first-child,
            body.${BODY_CLASS} .table tbody th:first-child {
                border-top-left-radius: 8px;
                border-bottom-left-radius: 8px;
            }
            body.${BODY_CLASS} .table tbody td:last-child,
            body.${BODY_CLASS} .table tbody th:last-child {
                border-top-right-radius: 8px;
                border-bottom-right-radius: 8px;
            }
            body.${BODY_CLASS} .table-responsive {
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
            }

            /* Print output must stay plain — no cards/shadows on the actual
               attendance sheet when printed. */
            @media print {
                body.${BODY_CLASS} .form-horizontal,
                body.${BODY_CLASS} .table tbody tr {
                    background: #fff !important;
                    box-shadow: none !important;
                    border: none !important;
                }
                body.${BODY_CLASS} .table {
                    border-spacing: 0 !important;
                }
            }

            @media (max-width: 991.98px) {
                body.${BODY_CLASS} main { padding-left: 1.25rem !important; padding-right: 1.25rem !important; }
                body.${BODY_CLASS} .form-horizontal { padding: 1.1rem 1.25rem; }
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
                body.${BODY_CLASS} table {
                    display: block;
                    width: 100%;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }
            }

            @media (max-width: 575.98px) {
                body.${BODY_CLASS} main { padding-left: .9rem !important; padding-right: .9rem !important; }
                body.${BODY_CLASS} main > h2:first-of-type { font-size: 1.25rem; }
                body.${BODY_CLASS} .form-horizontal { padding: 1rem; border-radius: 8px; }
                body.${BODY_CLASS} .form-group label { font-size: .85rem; }
                body.${BODY_CLASS} select.form-control { font-size: .9rem; }
                body.${BODY_CLASS} .radioOption + * { margin-right: .7rem; font-size: .9rem; }
                body.${BODY_CLASS} input[type="submit"].btn-primary {
                    width: 100%;
                    padding: .6rem 1rem;
                }
                body.${BODY_CLASS} .table th,
                body.${BODY_CLASS} .table td {
                    padding: .45rem .5rem;
                    font-size: .85rem;
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
