// features/evaluation/evaluation-ui-content.js — content script for the URMS
// Evaluation Comments pages (Teacher Evaluation Comments Report at
// /EvaluationComments/TEComments, and the Course Evaluation counterpart,
// which shares the same template: a semester/course picker made of plain
// text inputs sized with Bootstrap grid classes rather than .form-control,
// plus a "..." button that opens a searchable modal table of radio rows).
// Pure CSS reskin on stable ids/classes; nothing is moved or replaced —
// AddToTextbox()/searchCourses() keep working exactly as before. Cloak/
// toggle/sidebar/dark-mode are all owned by the shared
// features/shared/ulab-dashboard-shell.js, loaded first in this bundle.
(function () {
    const STYLE_ID = 'ulab-modern-evaluation-css';
    const BODY_CLASS = 'ulab-modern-evaluation';

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

            /* Picker panel — bound the semester/course picker fields into a
               white card like the results table area, instead of floating
               directly on the gradient canvas. */
            body.${BODY_CLASS} main .form-horizontal {
                background: #fff;
                border: 1px solid #eef1f6;
                border-radius: 10px;
                box-shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08);
                padding: 1.5rem 1.75rem;
                margin-bottom: 1.5rem;
            }

            /* Picker rows — these text inputs use Bootstrap grid classes
               (col-sm-*) for sizing instead of .form-control, so style them
               directly by type/context rather than relying on that class. */
            body.${BODY_CLASS} .col-form-label { font-weight: 600; color: #344054; font-size: .95rem; }
            body.${BODY_CLASS} .form-group.row input[type="text"] {
                border-radius: 4px;
                border: 1.5px solid #e4e7ec;
                padding: .45rem .7rem;
                font-size: .9rem;
                transition: border-color .15s ease;
            }
            body.${BODY_CLASS} .form-group.row input[type="text"]:focus {
                outline: none;
                border-color: #3A67B2;
            }
            body.${BODY_CLASS} .form-group.row input[readonly],
            body.${BODY_CLASS} .form-group.row input[type="text"][name$="Name"] {
                background: #eef2fb;
                color: #2c5296;
                font-weight: 600;
            }
            body.${BODY_CLASS} .form-group.row .btn-primary {
                border-radius: 4px;
                background: #3A67B2;
                border: none;
                font-weight: 700;
                box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
            }
            body.${BODY_CLASS} .form-group.row .btn-primary:hover {
                box-shadow: 0 3px 3px -2px rgba(0,0,0,.2), 0 3px 4px 0 rgba(0,0,0,.14), 0 1px 8px 0 rgba(0,0,0,.12);
            }
            body.${BODY_CLASS} input[type="submit"],
            body.${BODY_CLASS} main button[type="submit"] {
                border-radius: 4px;
                background: #3A67B2;
                color: #fff;
                border: none;
                font-weight: 600;
                box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
            }

            /* Results table — the comments/ratings report rendered below the
               picker. Row-as-card treatment matching registration.js: real
               <tr> rows here (no tr.d-flex on this page), so border-spacing
               handles the row gap. */
            body.${BODY_CLASS} main .table {
                border-collapse: separate;
                border-spacing: 0 8px;
            }
            body.${BODY_CLASS} main .table th {
                background: transparent;
                color: #667085;
                font-weight: 700;
                font-size: .8rem;
                text-transform: uppercase;
                letter-spacing: .05em;
                border-bottom: 2px solid #dbe3f5 !important;
                padding: .5rem .8rem .6rem;
            }
            body.${BODY_CLASS} main .table td {
                padding: .7rem .8rem;
                vertical-align: middle;
                font-size: .95rem;
            }
            body.${BODY_CLASS} main .table thead tr {
                border: none !important; box-shadow: none !important;
                background: transparent !important; margin: 0 !important;
            }
            body.${BODY_CLASS} main .table tbody tr {
                background: #fff;
                box-shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08);
                border-radius: 8px;
                transition: box-shadow .12s ease;
            }
            body.${BODY_CLASS} main .table tbody tr:hover {
                box-shadow: 0 2px 4px -1px rgba(16,24,40,.1), 0 4px 8px 0 rgba(16,24,40,.1);
            }
            body.${BODY_CLASS} main .table tbody td:first-child {
                border-top-left-radius: 8px;
                border-bottom-left-radius: 8px;
            }
            body.${BODY_CLASS} main .table tbody td:last-child {
                border-top-right-radius: 8px;
                border-bottom-right-radius: 8px;
            }
            body.${BODY_CLASS} main .table-bordered,
            body.${BODY_CLASS} main .table-bordered td,
            body.${BODY_CLASS} main .table-bordered th {
                border-color: transparent !important;
            }
            body.${BODY_CLASS} main .table-responsive {
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
            }

            /* Picker modal (semester/course search) */
            body.${BODY_CLASS} .modal-content {
                border: none;
                border-radius: 4px;
                box-shadow: 0 11px 15px -7px rgba(0,0,0,.2), 0 24px 38px 3px rgba(0,0,0,.14), 0 9px 46px 8px rgba(0,0,0,.12);
                overflow: hidden;
            }
            body.${BODY_CLASS} .modal-header {
                background: #3A67B2;
            }
            body.${BODY_CLASS} .modal-header .modal-title { color: #fff; font-size: 1rem; }
            body.${BODY_CLASS} .modal-header .close { color: #fff; opacity: .85; text-shadow: none; }
            body.${BODY_CLASS} .modal-header .close:hover { opacity: 1; }
            body.${BODY_CLASS} .modal-body #searchSem,
            body.${BODY_CLASS} .modal-body input.form-control {
                border-radius: 4px;
                border: 1.5px solid #e4e7ec;
                margin-bottom: .75rem;
            }
            body.${BODY_CLASS} .modal-body table thead th {
                background: #eef2fb;
                color: #344054;
                font-weight: 700;
                font-size: .76rem;
                text-transform: uppercase;
                letter-spacing: .03em;
                position: sticky; top: 0;
            }
            body.${BODY_CLASS} .modal-body table td { font-size: .87rem; vertical-align: middle; }
            body.${BODY_CLASS} .modal-body table tbody tr:hover { background: #eef2fb; cursor: pointer; }
            body.${BODY_CLASS} .modal-body input[type="radio"] { accent-color: #3A67B2; }
            body.${BODY_CLASS} .modal-body .table-responsive,
            body.${BODY_CLASS} .modal-body { overflow-x: auto; -webkit-overflow-scrolling: touch; }

            @media (max-width: 991.98px) {
                body.${BODY_CLASS} main .form-horizontal { padding: 1.25rem; }
                body.${BODY_CLASS} .form-group.row { flex-wrap: wrap; }
                body.${BODY_CLASS} .form-group.row .col-form-label,
                body.${BODY_CLASS} .form-group.row > div {
                    flex: 0 0 100%;
                    max-width: 100%;
                }
                body.${BODY_CLASS} .form-group.row .btn-primary { margin-top: .5rem; }
                body.${BODY_CLASS} main { overflow-x: auto; }
                body.${BODY_CLASS} main table {
                    display: block;
                    width: 100%;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }
                body.${BODY_CLASS} .modal-dialog.modal-lg {
                    max-width: calc(100% - 1rem);
                }
            }

            @media (max-width: 575.98px) {
                body.${BODY_CLASS} main > h2:first-of-type { font-size: 1.35rem; }
                body.${BODY_CLASS} main .form-horizontal { padding: 1rem; border-radius: 8px; }
                body.${BODY_CLASS} .col-form-label { font-size: .85rem; }
                body.${BODY_CLASS} .form-group.row input[type="text"] {
                    padding: .4rem .6rem;
                    font-size: .85rem;
                }
                body.${BODY_CLASS} .modal-header .modal-title { font-size: .9rem; }
                body.${BODY_CLASS} .modal-body #searchSem,
                body.${BODY_CLASS} .modal-body input.form-control {
                    font-size: .85rem;
                }
                body.${BODY_CLASS} .modal-body table td,
                body.${BODY_CLASS} .modal-body table th {
                    font-size: .78rem;
                    padding: .4rem .5rem;
                }
                body.${BODY_CLASS} main .table th,
                body.${BODY_CLASS} main .table td {
                    font-size: .85rem;
                    padding: .5rem .6rem;
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
