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

            /* Form */
            body.${BODY_CLASS} .form-group label { font-weight: 600; color: #344054; font-size: .9rem; }
            body.${BODY_CLASS} select.form-control {
                border-radius: 4px;
                border: 1.5px solid #e4e7ec;
                transition: border-color .15s ease;
            }
            body.${BODY_CLASS} select.form-control:focus {
                outline: none;
                border-color: #3A67B2;
            }
            body.${BODY_CLASS} .radioOption { accent-color: #3A67B2; margin-right: 4px; }
            body.${BODY_CLASS} .radioOption + * { margin-right: 1.1rem; }
            body.${BODY_CLASS} input[type="submit"].btn-primary {
                border-radius: 4px;
                background: #3A67B2;
                border: none;
                font-weight: 600;
                box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
                transition: box-shadow .15s ease;
            }
            body.${BODY_CLASS} input[type="submit"].btn-primary:hover {
                box-shadow: 0 3px 3px -2px rgba(0,0,0,.2), 0 3px 4px 0 rgba(0,0,0,.14), 0 1px 8px 0 rgba(0,0,0,.12);
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
