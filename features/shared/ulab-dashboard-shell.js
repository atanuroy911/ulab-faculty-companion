// features/shared/ulab-dashboard-shell.js — shared dashboard shell for every
// authenticated URMS page's modern-UI reskin (Home, Registration, Result
// Entry, Attendance/Advising forms, Manage Account). Loaded FIRST in each of
// those content-script bundles (see manifest.json) so it initializes before
// the page-specific file runs, and exposes window.ULAB_SHELL for that file
// to call into. Owns: the cloak/uncloak anti-flash trick, reading/writing
// the shared storage keys, building the persistent left sidebar + slim top
// bar + hamburger collapse, and the dark/light + modern-UI toggle switches
// (now living in the sidebar footer instead of a floating chip). Nothing
// here moves or deletes the page's own DOM — the original navbar is only
// hidden via CSS, and the sidebar reads (never relocates) the "Hello X" text
// and clicks the real hidden logout button so the anti-forgery token stays
// intact.
(function () {
    if (window.ULAB_SHELL) return; // idempotent if somehow injected twice

    // Several pages here (Print/Exam Attendance Sheet, etc.) submit a
    // target="_blank" form that opens a PDF/Excel/Word report in a new tab.
    // For PDFs, Chrome's built-in viewer still lives at the same URL (plus a
    // #page=1.00&gsr=0-style fragment), so this content script still
    // matches and would otherwise inject a sidebar/hamburger/cloak on top of
    // the PDF. Bail out completely — no cloak, no DOM, no-op mount() — so
    // page-specific files that call window.ULAB_SHELL.mount() stay safe.
    if (document.contentType && document.contentType !== 'text/html') {
        window.ULAB_SHELL = { cloak() {}, uncloak() {}, mount() {} };
        return;
    }

    const KEYS = {
        modern: 'ulabModernUI',
        theme: 'ulabModernTheme',        // 'light' | 'dark'
        collapsed: 'ulabSidebarCollapsed'
    };
    const CLOAK_ID = 'ulab-cloak-style';
    const SHELL_STYLE_ID = 'ulab-shell-css';
    const SIDEBAR_ID = 'ulab-sidebar';
    const TOPBAR_TOGGLE_ID = 'ulab-hamburger';
    const FLOATING_TOGGLE_ID = 'ulab-floating-modern-toggle';

    const NAV_GROUPS = [
        { label: null, items: [{ label: 'Home', href: '/', icon: 'home' }] },
        {
            label: 'Advisor',
            items: [
                { label: 'Student Registration', href: '/StudentRegistration', icon: 'edit' },
                { label: 'Add Drop Course', href: '/StudentRegistration/AddAndDrop', icon: 'swap' },
                { label: 'Section Wise Result Entry', href: '/RMS_ggs_result/ResultEntryFromExcel', icon: 'sheet' },
                { label: 'Print Attendance Sheet', href: '/AttendanceSheet', icon: 'clipboard' },
                { label: 'Exam Attendance Sheet', href: '/AttendanceSheet/ExamAttendance', icon: 'clipboard-check' },
                { label: 'Grade Sheet (Blank)', href: '/AttendanceSheet/GradeSheetBlank', icon: 'doc' },
                { label: 'Marks Distribution Sheet', href: '/AttendanceSheet/MarksDistribution', icon: 'chart' },
                { label: 'Advising Student', href: '/AdvisingStudent', icon: 'people' },
                { label: 'Teacher Evaluation Comments', href: '/EvaluationComments/TEComments', icon: 'chart' },
                { label: 'Course Evaluation Comments', href: '/EvaluationComments/CEComments', icon: 'chart' },
                { label: 'Change Password', href: '/Account/Manage', icon: 'gear' },
            ]
        },
        {
            label: 'Registration System',
            items: [{ label: 'Section Explorer', href: '/CourseGroup', icon: 'grid' }]
        }
    ];

    const ICONS = {
        home: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
        edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
        swap: '<path d="M17 3 21 7l-4 4"/><path d="M3 7h18"/><path d="M7 21 3 17l4-4"/><path d="M21 17H3"/>',
        sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>',
        clipboard: '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4V3h6v1"/>',
        'clipboard-check': '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 12l2 2 4-4"/>',
        doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
        chart: '<path d="M3 3v18h18"/><path d="M7 15l4-6 4 3 5-8"/>',
        people: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
        grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
        menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
    };
    function svg(name, size) {
        size = size || 16;
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
    }

    function cloak() {
        if (document.getElementById(CLOAK_ID)) return;
        const s = document.createElement('style');
        s.id = CLOAK_ID;
        s.textContent = 'html.ulab-cloak { visibility: hidden !important; }';
        (document.head || document.documentElement).appendChild(s);
        document.documentElement.classList.add('ulab-cloak');
        setTimeout(uncloak, 1500);
    }
    function uncloak() {
        document.documentElement.classList.remove('ulab-cloak');
    }

    function injectShellStyles() {
        if (document.getElementById(SHELL_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = SHELL_STYLE_ID;
        style.textContent = `
            :root {
                --ulab-sidebar-w: 240px;
                --ulab-sidebar-w-collapsed: 64px;
            }

            /* --- Sidebar shell (only while a page's own modern-ui class is
               active; each page file adds body.ulab-shell-mounted itself) --- */
            /* html/body overflow-x guard: Bootstrap's .container sets
               width:100% relative to the viewport, so simply adding
               margin-left below would push its right edge 240px past the
               viewport edge and force a horizontal scrollbar — fix the
               width explicitly instead of just the margin. */
            html.ulab-cloak, body.ulab-shell-mounted { overflow-x: hidden; }
            body.ulab-shell-mounted { padding-top: 0 !important; }
            body.ulab-shell-mounted header,
            body.ulab-shell-mounted footer {
                margin-left: var(--ulab-sidebar-w);
                transition: margin-left .18s ease;
            }
            body.ulab-shell-mounted > .container {
                margin-left: var(--ulab-sidebar-w) !important;
                margin-right: 0 !important;
                width: calc(100% - var(--ulab-sidebar-w)) !important;
                max-width: calc(min(1400px, 100% - var(--ulab-sidebar-w))) !important;
                box-sizing: border-box;
                transition: margin-left .18s ease, width .18s ease;
            }
            body.ulab-shell-mounted.ulab-sidebar-collapsed header,
            body.ulab-shell-mounted.ulab-sidebar-collapsed footer {
                margin-left: var(--ulab-sidebar-w-collapsed);
            }
            body.ulab-shell-mounted.ulab-sidebar-collapsed > .container {
                margin-left: var(--ulab-sidebar-w-collapsed) !important;
                width: calc(100% - var(--ulab-sidebar-w-collapsed)) !important;
                max-width: calc(min(1400px, 100% - var(--ulab-sidebar-w-collapsed))) !important;
            }
            /* Give the content room to breathe instead of sitting flush
               against the sidebar seam. */
            body.ulab-shell-mounted > .container {
                padding-left: clamp(1.25rem, 3vw, 2.5rem) !important;
                padding-right: clamp(1.25rem, 3vw, 2.5rem) !important;
            }
            body.ulab-shell-mounted footer .container { max-width: 1400px; }
            /* The stock left-side dropdown nav is replaced by the sidebar,
               and its brand logo is replaced by the sidebar's own — hiding
               it here (rather than removing it) avoids a duplicate logo
               while keeping the hamburger's insertion point intact. */
            body.ulab-shell-mounted header .navbar-nav.flex-grow-1 { display: none !important; }
            body.ulab-shell-mounted header nav.navbar .navbar-brand { display: none !important; }
            /* "Hello X" + Logout are reproduced in the sidebar footer (which
               clicks this real, hidden logout form to keep the anti-forgery
               token intact) — hide the originals so they don't show twice. */
            body.ulab-shell-mounted header .navbar-collapse.ml-auto,
            body.ulab-shell-mounted header .navbar-nav.ml-auto { display: none !important; }
            body.ulab-shell-mounted header nav.navbar .container { max-width: none; padding-left: 1rem; padding-right: 1rem; }

            #${SIDEBAR_ID} {
                display: none;
                position: fixed; top: 0; left: 0; bottom: 0;
                width: var(--ulab-sidebar-w);
                background: #1f2a44;
                color: #cbd5e1;
                z-index: 200000;
                flex-direction: column;
                overflow-y: auto; overflow-x: hidden;
                transition: width .18s ease;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            body.ulab-shell-mounted #${SIDEBAR_ID} { display: flex; }
            #${TOPBAR_TOGGLE_ID} { display: none; }
            body.ulab-shell-mounted #${TOPBAR_TOGGLE_ID} { display: flex; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} { width: var(--ulab-sidebar-w-collapsed); }

            #${SIDEBAR_ID} .ulab-sb-brand {
                display: flex; align-items: center; gap: 10px;
                padding: 16px 16px; flex-shrink: 0;
                border-bottom: 1px solid rgba(255,255,255,.08);
            }
            #${SIDEBAR_ID} .ulab-sb-brand img { height: 26px; width: auto; flex-shrink: 0; }
            #${SIDEBAR_ID} .ulab-sb-brand span { font-weight: 700; font-size: .92rem; color: #fff; white-space: nowrap; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-brand span { display: none; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-brand { justify-content: center; padding-left: 0; padding-right: 0; }

            #${SIDEBAR_ID} .ulab-sb-group-label {
                padding: 14px 16px 4px; font-size: .68rem; font-weight: 700;
                text-transform: uppercase; letter-spacing: .06em; color: #7c8aad;
                white-space: nowrap;
            }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-group-label { display: none; }

            #${SIDEBAR_ID} nav { flex: 1; padding-bottom: 8px; }
            #${SIDEBAR_ID} a.ulab-sb-link {
                display: flex; align-items: center; gap: 12px;
                padding: 9px 16px; margin: 1px 8px; border-radius: 4px;
                color: #cbd5e1; text-decoration: none !important; font-size: .87rem;
                white-space: nowrap; overflow: hidden;
                transition: background .12s ease, color .12s ease;
            }
            #${SIDEBAR_ID} a.ulab-sb-link svg { flex-shrink: 0; opacity: .85; }
            #${SIDEBAR_ID} a.ulab-sb-link:hover { background: rgba(255,255,255,.08); color: #fff; }
            #${SIDEBAR_ID} a.ulab-sb-link.active { background: #3A67B2; color: #fff; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} a.ulab-sb-link span.ulab-sb-text { display: none; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} a.ulab-sb-link {
                justify-content: center; padding-left: 0; padding-right: 0; margin-left: 8px; margin-right: 8px; gap: 0;
            }

            #${SIDEBAR_ID} .ulab-sb-footer {
                border-top: 1px solid rgba(255,255,255,.08);
                padding: 10px 8px; flex-shrink: 0;
            }
            #${SIDEBAR_ID} .ulab-sb-user {
                display: flex; align-items: center; gap: 8px;
                padding: 8px; font-size: .78rem; color: #9aa7c4;
                white-space: nowrap; overflow: hidden;
            }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-user span { display: none; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-user { justify-content: center; padding-left: 0; padding-right: 0; }
            #${SIDEBAR_ID} .ulab-sb-row {
                display: flex; align-items: center; justify-content: space-between;
                padding: 7px 8px; border-radius: 4px; cursor: pointer;
                font-size: .8rem; color: #cbd5e1;
            }
            #${SIDEBAR_ID} .ulab-sb-row:hover { background: rgba(255,255,255,.06); }
            #${SIDEBAR_ID} .ulab-sb-row .ulab-sb-row-label { display: flex; align-items: center; gap: 10px; white-space: nowrap; overflow: hidden; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-row .ulab-sb-row-label span.ulab-sb-text { display: none; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-row {
                justify-content: center; padding-left: 0; padding-right: 0;
            }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-row .ulab-switch-sm { display: none; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-logout {
                justify-content: center; padding-left: 0; padding-right: 0; gap: 0;
            }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-logout span.ulab-sb-text { display: none; }
            #${SIDEBAR_ID} .ulab-switch-sm {
                position: relative; width: 30px; height: 17px; border-radius: 999px; background: #3a4560;
                flex-shrink: 0; transition: background .15s ease;
            }
            #${SIDEBAR_ID} .ulab-switch-sm::after {
                content: ''; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px;
                border-radius: 50%; background: #fff; transition: transform .15s ease;
            }
            #${SIDEBAR_ID} .ulab-switch-sm.on { background: #3A67B2; }
            #${SIDEBAR_ID} .ulab-switch-sm.on::after { transform: translateX(13px); }
            #${SIDEBAR_ID} .ulab-sb-logout {
                display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
                background: none; border: none; color: #f3a0a0; font-size: .8rem;
                padding: 7px 8px; border-radius: 4px; cursor: pointer;
            }
            #${SIDEBAR_ID} .ulab-sb-logout:hover { background: rgba(255,255,255,.06); }

            /* Always-visible floating "Modern UI" toggle — the sidebar (and
               its own modern-UI switch) disappears entirely when modern UI
               is off, so this is the only way back on. Independent of
               body.ulab-shell-mounted; never hidden. */
            #${FLOATING_TOGGLE_ID} {
                position: fixed; right: 16px; bottom: 78px; z-index: 999999;
                display: flex; align-items: center; gap: 8px;
                background: #fff; border: 1px solid #e4e7ec; border-radius: 4px;
                padding: 6px 12px 6px 10px;
                font: 500 11.5px/1 -apple-system, "Segoe UI", sans-serif;
                color: #667085;
                box-shadow: 0 1px 3px 0 rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14);
                opacity: .5; transition: opacity .2s ease, box-shadow .2s ease;
                cursor: pointer; user-select: none;
            }
            #${FLOATING_TOGGLE_ID}:hover { opacity: 1; box-shadow: 0 3px 3px -2px rgba(0,0,0,.2), 0 3px 4px 0 rgba(0,0,0,.14), 0 1px 8px 0 rgba(0,0,0,.12); }
            #${FLOATING_TOGGLE_ID} .ulab-switch-sm {
                position: relative; width: 30px; height: 17px; border-radius: 999px; background: #d0d5dd;
                transition: background .15s ease; flex-shrink: 0;
            }
            #${FLOATING_TOGGLE_ID} .ulab-switch-sm::after {
                content: ''; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px;
                border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3);
                transition: transform .15s ease;
            }
            #${FLOATING_TOGGLE_ID} .ulab-switch-sm.on { background: #3A67B2; }
            #${FLOATING_TOGGLE_ID} .ulab-switch-sm.on::after { transform: translateX(13px); }

            /* Hamburger button injected into the (now-slimmer) top navbar */
            #${TOPBAR_TOGGLE_ID} {
                background: none; border: none; color: #fff; padding: 8px 12px;
                border-radius: 4px; cursor: pointer; align-items: center;
                margin-right: 8px; appearance: none; -webkit-appearance: none; outline: none;
            }
            #${TOPBAR_TOGGLE_ID}:hover { background: rgba(255,255,255,.12); }

            @media (max-width: 860px) {
                #${SIDEBAR_ID} { width: var(--ulab-sidebar-w-collapsed); }
                body.ulab-shell-mounted header,
                body.ulab-shell-mounted footer { margin-left: var(--ulab-sidebar-w-collapsed); }
                body.ulab-shell-mounted > .container {
                    margin-left: var(--ulab-sidebar-w-collapsed) !important;
                    width: calc(100% - var(--ulab-sidebar-w-collapsed)) !important;
                    max-width: calc(min(1400px, 100% - var(--ulab-sidebar-w-collapsed))) !important;
                }
                #${SIDEBAR_ID} .ulab-sb-brand span,
                #${SIDEBAR_ID} .ulab-sb-group-label,
                #${SIDEBAR_ID} a.ulab-sb-link span.ulab-sb-text,
                #${SIDEBAR_ID} .ulab-sb-user span,
                #${SIDEBAR_ID} .ulab-sb-logout span.ulab-sb-text,
                #${SIDEBAR_ID} .ulab-sb-row .ulab-switch-sm,
                #${SIDEBAR_ID} .ulab-sb-row-label span.ulab-sb-text { display: none; }
                #${SIDEBAR_ID} .ulab-sb-brand,
                #${SIDEBAR_ID} .ulab-sb-user,
                #${SIDEBAR_ID} .ulab-sb-row,
                #${SIDEBAR_ID} .ulab-sb-logout {
                    justify-content: center; padding-left: 0; padding-right: 0; gap: 0;
                }
                #${SIDEBAR_ID} a.ulab-sb-link {
                    justify-content: center; padding-left: 0; padding-right: 0; margin-left: 8px; margin-right: 8px; gap: 0;
                }
            }

            /* --- Dark mode (only ever active alongside modern UI) — broad,
               !important overrides so per-page light-mode rules never win. --- */
            body.ulab-dark { background: #14171f !important; color: #d7dbe4 !important; }
            body.ulab-dark header nav.navbar { background: #23283a !important; box-shadow: none !important; }
            body.ulab-dark main h2, body.ulab-dark main h1, body.ulab-dark main h5, body.ulab-dark main h6,
            body.ulab-dark main label, body.ulab-dark .form-group label, body.ulab-dark .card-title {
                color: #e2e5ec !important; -webkit-text-fill-color: unset !important;
            }
            body.ulab-dark .card, body.ulab-dark .modal-content, body.ulab-dark #T1, body.ulab-dark table {
                background: #1c202c !important; color: #d7dbe4 !important;
            }
            body.ulab-dark .table td, body.ulab-dark .table th { color: #d7dbe4 !important; }
            body.ulab-dark .table thead th, body.ulab-dark #T1 tr:first-child th, body.ulab-dark .table-bordered th {
                background: #262b3b !important; color: #aeb6c9 !important;
            }
            body.ulab-dark .table-striped tbody tr:nth-of-type(odd) { background-color: #20242f !important; }
            body.ulab-dark .table-hover tbody tr:hover { background-color: #262b3b !important; }
            body.ulab-dark .table-bordered td, body.ulab-dark .table-bordered th { border-color: #2c3142 !important; }
            body.ulab-dark select.form-control, body.ulab-dark input.form-control, body.ulab-dark input[type="text"],
            body.ulab-dark input[type="password"], body.ulab-dark input[type="file"] {
                background: #1c202c !important; color: #e2e5ec !important; border-color: #333a4d !important;
            }
            body.ulab-dark input[readonly] { background: #23283a !important; color: #9fb3dd !important; }
            body.ulab-dark .dropdown-menu { background: #1c202c !important; box-shadow: 0 8px 24px rgba(0,0,0,.5) !important; }
            body.ulab-dark .dropdown-item { color: #d7dbe4 !important; }
            body.ulab-dark .dropdown-item:hover { background: #262b3b !important; color: #fff !important; }
            body.ulab-dark hr { border-color: #2c3142 !important; }
            body.ulab-dark footer { border-color: #2c3142 !important; color: #7c8aad !important; }
            body.ulab-dark .btn-outline-secondary { color: #cbd5e1 !important; border-color: #3a4560 !important; }
            body.ulab-dark .btn-outline-info { color: #8ab4f8 !important; border-color: #33456e !important; }
            body.ulab-dark .modal-header { background: #23283a !important; }
        `;
        document.head.appendChild(style);
    }

    function buildSidebar() {
        if (document.getElementById(SIDEBAR_ID)) return document.getElementById(SIDEBAR_ID);

        const sidebar = document.createElement('nav');
        sidebar.id = SIDEBAR_ID;

        const brand = document.createElement('div');
        brand.className = 'ulab-sb-brand';
        brand.innerHTML = `<img src="/images/logo.png" alt="ULAB" /><span>URMS Portal</span>`;
        sidebar.appendChild(brand);

        const navWrap = document.createElement('div');
        const currentPath = location.pathname.replace(/\/$/, '') || '/';
        NAV_GROUPS.forEach((group) => {
            if (group.label) {
                const label = document.createElement('div');
                label.className = 'ulab-sb-group-label';
                label.textContent = group.label;
                navWrap.appendChild(label);
            }
            group.items.forEach((item) => {
                const a = document.createElement('a');
                a.className = 'ulab-sb-link';
                const itemPath = item.href.replace(/\/$/, '') || '/';
                if (itemPath === currentPath) a.classList.add('active');
                a.href = item.href;
                a.innerHTML = `${svg(item.icon)}<span class="ulab-sb-text">${item.label}</span>`;
                navWrap.appendChild(a);
            });
        });
        sidebar.appendChild(navWrap);

        const footer = document.createElement('div');
        footer.className = 'ulab-sb-footer';

        const helloEl = Array.from(document.querySelectorAll('.navbar-nav.ml-auto .nav-link'))
            .find(el => /Hello/i.test(el.textContent));
        const userRow = document.createElement('div');
        userRow.className = 'ulab-sb-user';
        userRow.innerHTML = `${svg('people', 14)}<span>${helloEl ? helloEl.textContent.trim() : 'Signed in'}</span>`;
        footer.appendChild(userRow);

        const themeRow = document.createElement('div');
        themeRow.className = 'ulab-sb-row';
        themeRow.id = 'ulab-theme-row';
        themeRow.innerHTML = `<span class="ulab-sb-row-label">${svg('moon', 14)}<span class="ulab-sb-text">Dark mode</span></span><span class="ulab-switch-sm"></span>`;
        footer.appendChild(themeRow);

        const modernRow = document.createElement('div');
        modernRow.className = 'ulab-sb-row';
        modernRow.id = 'ulab-modern-row';
        modernRow.innerHTML = `<span class="ulab-sb-row-label">${svg('grid', 14)}<span class="ulab-sb-text">Modern UI</span></span><span class="ulab-switch-sm"></span>`;
        footer.appendChild(modernRow);

        const logoutForm = Array.from(document.querySelectorAll('form')).find(f => /LogOff/i.test(f.action || ''));
        if (logoutForm) {
            const logoutBtn = document.createElement('button');
            logoutBtn.type = 'button';
            logoutBtn.className = 'ulab-sb-logout';
            logoutBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg><span class="ulab-sb-text">Logout</span>`;
            logoutBtn.addEventListener('click', () => {
                const submitEl = logoutForm.querySelector('button[type="submit"], input[type="submit"]');
                if (submitEl) submitEl.click(); else logoutForm.submit();
            });
            footer.appendChild(logoutBtn);
        }

        sidebar.appendChild(footer);
        document.body.appendChild(sidebar);
        return sidebar;
    }

    function buildFloatingToggle(isOn, pageBodyClass, onModernChange) {
        if (document.getElementById(FLOATING_TOGGLE_ID)) return;
        const toggle = document.createElement('div');
        toggle.id = FLOATING_TOGGLE_ID;
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('title', 'Toggle modern UI');
        toggle.innerHTML = `<span class="ulab-switch-sm${isOn ? ' on' : ''}"></span><span>Modern UI</span>`;
        toggle.addEventListener('click', () => {
            const next = !document.body.classList.contains(pageBodyClass);
            if (next) { buildSidebar(); buildHamburger(); }
            setModern(next, pageBodyClass, onModernChange);
            toggle.querySelector('.ulab-switch-sm').classList.toggle('on', next);
            chrome.storage.local.set({ [KEYS.modern]: next });
        });
        document.body.appendChild(toggle);
    }

    function buildHamburger() {
        if (document.getElementById(TOPBAR_TOGGLE_ID)) return;
        const brandLink = document.querySelector('header nav.navbar .navbar-brand');
        if (!brandLink || !brandLink.parentNode) return;
        const btn = document.createElement('button');
        btn.id = TOPBAR_TOGGLE_ID;
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Toggle sidebar');
        btn.innerHTML = svg('menu', 26);
        btn.addEventListener('click', () => {
            const collapsed = !document.body.classList.contains('ulab-sidebar-collapsed');
            document.body.classList.toggle('ulab-sidebar-collapsed', collapsed);
            chrome.storage.local.set({ [KEYS.collapsed]: collapsed });
        });
        brandLink.parentNode.insertBefore(btn, brandLink);
    }

    function setTheme(isDark) {
        document.body.classList.toggle('ulab-dark', isDark);
        const row = document.getElementById('ulab-theme-row');
        if (row) row.querySelector('.ulab-switch-sm').classList.toggle('on', isDark);
    }

    function setModern(isOn, pageBodyClass, onModernChange) {
        document.body.classList.toggle(pageBodyClass, isOn);
        document.body.classList.toggle('ulab-shell-mounted', isOn);
        const row = document.getElementById('ulab-modern-row');
        if (row) row.querySelector('.ulab-switch-sm').classList.toggle('on', isOn);
        const floating = document.getElementById(FLOATING_TOGGLE_ID);
        if (floating) floating.querySelector('.ulab-switch-sm').classList.toggle('on', isOn);
        if (typeof onModernChange === 'function') onModernChange(isOn);
    }

    // mount(pageBodyClass, onModernChange?) — call once DOMContentLoaded has
    // fired. pageBodyClass is the page-specific class (e.g.
    // 'ulab-modern-home') that file's OWN <style> block is scoped under;
    // this function toggles it alongside the shared shell/dark classes so
    // both sets of rules turn on/off together.
    function mount(pageBodyClass, onModernChange) {
        injectShellStyles();
        chrome.storage.local.get([KEYS.modern, KEYS.theme, KEYS.collapsed], (result) => {
            const isOn = result[KEYS.modern] !== false; // default on
            const isDark = result[KEYS.theme] === 'dark';
            const isCollapsed = !!result[KEYS.collapsed];

            if (isOn) { buildSidebar(); buildHamburger(); }
            buildFloatingToggle(isOn, pageBodyClass, onModernChange);
            document.body.classList.toggle('ulab-sidebar-collapsed', isCollapsed);

            setModern(isOn, pageBodyClass, onModernChange);
            setTheme(isDark);

            const themeRow = document.getElementById('ulab-theme-row');
            if (themeRow) themeRow.addEventListener('click', () => {
                const next = !document.body.classList.contains('ulab-dark');
                setTheme(next);
                chrome.storage.local.set({ [KEYS.theme]: next ? 'dark' : 'light' });
            });
            const modernRow = document.getElementById('ulab-modern-row');
            if (modernRow) modernRow.addEventListener('click', () => {
                const next = !document.body.classList.contains(pageBodyClass);
                if (next) { buildSidebar(); buildHamburger(); }
                setModern(next, pageBodyClass, onModernChange);
                chrome.storage.local.set({ [KEYS.modern]: next });
            });

            uncloak();
        });
    }

    window.ULAB_SHELL = { KEYS, cloak, uncloak, mount };

    // Cloak immediately at parse time (this file always loads first, at
    // document_start, in every bundle that includes it) so nothing paints
    // before mount() decides what to show.
    cloak();
})();
