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
        collapsed: 'ulabSidebarCollapsed',
        fontScale: 'ulabFontScale',       // percentage, e.g. 100
        navGroups: 'ulabNavGroupsCollapsed' // { [groupLabel]: boolean }
    };
    const FONT_SCALE_MIN = 80;
    const FONT_SCALE_MAX = 150;
    const FONT_SCALE_STEP = 10;
    const CLOAK_ID = 'ulab-cloak-style';
    const SHELL_STYLE_ID = 'ulab-shell-css';
    const SIDEBAR_ID = 'ulab-sidebar';
    const SIDEBAR_BACKDROP_ID = 'ulab-sidebar-backdrop';
    const TOPBAR_TOGGLE_ID = 'ulab-hamburger';
    const FLOATING_TOGGLE_ID = 'ulab-floating-modern-toggle';
    const MOBILE_QUERY = '(max-width: 991.98px)';

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
        },
        // Extension-native features, surfaced directly in this URMS-styled
        // sidebar instead of only living in the side panel — same visual
        // language as the rest of the reskin, but the data behind them is
        // 100% local (chrome.storage), never fetched from URMS. `action`
        // items (no `href`) render as a <button> and open an in-page modal
        // instead of navigating. This group is the first of what's meant to
        // become a home for other side-panel features surfaced the same way.
        {
            label: 'My Tools',
            items: [
                { label: 'Advising & Save/Bill', icon: 'people', action: 'open-tool:advising-billing' },
                { label: 'Free Time Finder', icon: 'clock', action: 'open-tool:time' },
                { label: 'Capstone Eligibility', icon: 'clipboard-check', action: 'open-tool:capstone-eligibility' },
                { label: 'Course Catalogue', icon: 'book', action: 'open-tool:catalogue-viewer' },
                { label: 'Generate My Schedule', icon: 'calendar', action: 'open-tool:class-schedule' },
                { label: 'My Schedule', icon: 'calendar', action: 'open-tool:my-schedule' },
                { label: "Who's Free?", icon: 'people', action: 'open-tool:free-teachers' },
                { label: 'Exam Routine Finder', icon: 'clipboard', action: 'open-tool:exam-routine' },
                { label: 'Marks Management', icon: 'chart', action: 'open-tool:marks' },
                { label: 'Google Classroom', icon: 'school', action: 'open-tool:classroom' },
            ]
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
        'type-size': '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
        calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
        book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
        school: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/><path d="M22 10v6"/>',
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

            /* z-index sits just under Bootstrap 4's own modal stack (backdrop
               1040, dialog 1050) — a fixed sidebar that outranks the modal
               would visually sit on top of it and clip whatever part of the
               dialog falls under the sidebar's column. Everything here stays
               below that so any modal always wins. */
            #${SIDEBAR_ID} {
                display: none;
                position: fixed; top: 0; left: 0; bottom: 0;
                width: var(--ulab-sidebar-w);
                background: #0f1117;
                color: #d4d4d8;
                z-index: 1030;
                flex-direction: column;
                overflow-y: auto; overflow-x: hidden;
                transition: width .18s ease;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                border-right: 1px solid rgba(255,255,255,.06);
            }
            body.ulab-shell-mounted #${SIDEBAR_ID} { display: flex; }
            #${TOPBAR_TOGGLE_ID} { display: none; }
            body.ulab-shell-mounted #${TOPBAR_TOGGLE_ID} { display: flex; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} { width: var(--ulab-sidebar-w-collapsed); }

            /* Text labels fade/shrink in step with the sidebar's own width
               transition (both .18s) instead of vanishing via display:none
               a beat before the rail finishes narrowing. */
            #${SIDEBAR_ID} .ulab-sb-text,
            #${SIDEBAR_ID} .ulab-sb-brand span,
            #${SIDEBAR_ID} .ulab-sb-group-label,
            #${SIDEBAR_ID} .ulab-sb-user span {
                opacity: 1; max-width: 160px;
                transition: opacity .14s ease, max-width .18s ease;
            }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-text,
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-brand span,
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-group-label,
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-user span {
                opacity: 0; max-width: 0; margin: 0; pointer-events: none;
                transition: opacity .08s ease, max-width .18s ease;
            }
            #${SIDEBAR_ID} .ulab-sb-link, #${SIDEBAR_ID} .ulab-sb-row, #${SIDEBAR_ID} .ulab-sb-logout,
            #${SIDEBAR_ID} .ulab-sb-brand, #${SIDEBAR_ID} .ulab-sb-user {
                transition: background .12s ease, color .12s ease, gap .18s ease, padding .18s ease;
            }

            #${SIDEBAR_ID} .ulab-sb-brand {
                display: flex; align-items: center; gap: 10px;
                padding: 16px 16px; flex-shrink: 0;
                border-bottom: 1px solid rgba(255,255,255,.08);
            }
            #${SIDEBAR_ID} .ulab-sb-brand img { height: 26px; width: auto; flex-shrink: 0; }
            #${SIDEBAR_ID} .ulab-sb-brand span { font-weight: 700; font-size: .92rem; color: #fff; white-space: nowrap; overflow: hidden; display: inline-block; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-brand { justify-content: center; padding-left: 0; padding-right: 0; }

            #${SIDEBAR_ID} .ulab-sb-group-label {
                padding: 14px 16px 4px; font-size: .68rem; font-weight: 700;
                text-transform: uppercase; letter-spacing: .06em; color: #7c8aad;
                white-space: nowrap; overflow: hidden; display: block;
            }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-group-label { padding-top: 0; padding-bottom: 0; }

            /* Collapsible categories — click a group header to fold/unfold
               its items; state remembered per-group across visits. */
            #${SIDEBAR_ID} .ulab-sb-group-header {
                display: flex; align-items: center; justify-content: space-between;
                cursor: pointer; user-select: none;
                border-radius: 6px; margin: 0 8px;
            }
            #${SIDEBAR_ID} .ulab-sb-group-header:hover { background: rgba(255,255,255,.05); }
            #${SIDEBAR_ID} .ulab-sb-group-header .ulab-sb-group-label { padding-left: 8px; margin: 0; }
            #${SIDEBAR_ID} .ulab-sb-group-chevron {
                flex-shrink: 0; opacity: .55; transition: transform .15s ease;
                margin-right: 8px;
            }
            #${SIDEBAR_ID} .ulab-sb-group-header.collapsed .ulab-sb-group-chevron { transform: rotate(-90deg); }
            #${SIDEBAR_ID} .ulab-sb-group-items { overflow: hidden; }
            #${SIDEBAR_ID} .ulab-sb-group-items.collapsed { display: none; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-group-chevron { display: none; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-group-items.collapsed {
                /* Icon-rail mode ignores per-category collapse — always show
                   every icon flat, since there's no label to click anyway. */
                display: block;
            }

            #${SIDEBAR_ID} nav { flex: 1; padding-bottom: 8px; }
            /* .ulab-sb-link (not a.ulab-sb-link) — items without an href
               (e.g. "My Class Schedule", which opens an in-page modal
               instead of navigating) render as <button>, which needs its
               own reset (border/background/font/width/cursor/alignment)
               that <a> gets for free. */
            #${SIDEBAR_ID} .ulab-sb-link {
                display: flex; align-items: center; gap: 12px; width: 100%;
                padding: 8px 12px; margin: 1px 8px; border-radius: 6px;
                color: #a1a1aa; text-decoration: none !important; font-size: .85rem; font-weight: 500;
                white-space: nowrap; overflow: hidden;
                background: none; border: none; font-family: inherit; text-align: left; cursor: pointer;
            }
            #${SIDEBAR_ID} .ulab-sb-link svg { flex-shrink: 0; opacity: .85; }
            #${SIDEBAR_ID} .ulab-sb-link:hover { background: rgba(255,255,255,.06); color: #fafafa; }
            #${SIDEBAR_ID} .ulab-sb-link.active { background: #27272a; color: #fafafa; box-shadow: inset 2px 0 0 #6366f1; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-link {
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
            #${SIDEBAR_ID} .ulab-sb-user span { white-space: nowrap; overflow: hidden; display: inline-block; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-user { justify-content: center; padding-left: 0; padding-right: 0; }
            #${SIDEBAR_ID} .ulab-sb-row {
                display: flex; align-items: center; justify-content: space-between;
                padding: 7px 8px; border-radius: 6px; cursor: pointer;
                font-size: .8rem; color: #a1a1aa;
                transition: background .12s ease, padding .18s ease;
            }
            #${SIDEBAR_ID} .ulab-sb-row:hover { background: rgba(255,255,255,.06); }
            #${SIDEBAR_ID} .ulab-sb-row .ulab-sb-row-label { display: flex; align-items: center; gap: 10px; white-space: nowrap; overflow: hidden; transition: gap .18s ease; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-row .ulab-sb-row-label { gap: 0; }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-row {
                justify-content: center; padding-left: 0; padding-right: 0;
            }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-row .ulab-switch-sm {
                opacity: 0; max-width: 0; overflow: hidden; pointer-events: none;
                transition: opacity .08s ease, max-width .18s ease;
            }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-logout {
                justify-content: center; padding-left: 0; padding-right: 0; gap: 0;
            }
            #${SIDEBAR_ID} .ulab-switch-sm {
                position: relative; width: 30px; height: 17px; border-radius: 999px; background: #3f3f46;
                flex-shrink: 0; transition: background .15s ease;
            }
            #${SIDEBAR_ID} .ulab-switch-sm::after {
                content: ''; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px;
                border-radius: 50%; background: #fff; transition: transform .15s ease;
            }
            #${SIDEBAR_ID} .ulab-switch-sm.on { background: #6366f1; }
            #${SIDEBAR_ID} .ulab-switch-sm.on::after { transform: translateX(13px); }

            /* Font-size stepper (− 100% +) in the sidebar footer — scales
               the whole reskin uniformly via html's root font-size, since
               every size in this shell/page CSS is written in rem. */
            #${SIDEBAR_ID} .ulab-fontctl {
                display: flex; align-items: center; gap: 4px;
            }
            #${SIDEBAR_ID} .ulab-fontctl-btn {
                display: flex; align-items: center; justify-content: center;
                width: 20px; height: 20px; border-radius: 5px;
                background: #27272a; color: #d4d4d8; border: none;
                font: 700 12px/1 system-ui, sans-serif; cursor: pointer;
                flex-shrink: 0; transition: background .12s ease, color .12s ease;
            }
            #${SIDEBAR_ID} .ulab-fontctl-btn:hover { background: #3f3f46; color: #fff; }
            #${SIDEBAR_ID} .ulab-fontctl-btn:disabled { opacity: .35; cursor: not-allowed; }
            #${SIDEBAR_ID} .ulab-fontctl-val {
                min-width: 32px; text-align: center; font-size: .72rem;
                color: #a1a1aa; font-variant-numeric: tabular-nums;
            }
            body.ulab-sidebar-collapsed #${SIDEBAR_ID} .ulab-sb-row .ulab-fontctl { display: none; }

            #${SIDEBAR_ID} .ulab-sb-logout {
                display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
                background: none; border: none; color: #f87171; font-size: .8rem; font-weight: 500;
                padding: 7px 8px; border-radius: 6px; cursor: pointer;
            }
            #${SIDEBAR_ID} .ulab-sb-logout:hover { background: rgba(255,255,255,.06); }

            /* Always-visible floating "Modern UI" toggle — the sidebar (and
               its own modern-UI switch) disappears entirely when modern UI
               is off, so this is the only way back on. Independent of
               body.ulab-shell-mounted; never hidden. */
            #${FLOATING_TOGGLE_ID} {
                position: fixed; right: 16px; bottom: 78px; z-index: 1020;
                display: flex; align-items: center; gap: 8px;
                background: #fff; border: 1px solid #e4e4e7; border-radius: 6px;
                padding: 6px 12px 6px 10px;
                font: 500 11.5px/1 -apple-system, "Segoe UI", sans-serif;
                color: #52525b;
                box-shadow: 0 1px 2px 0 rgba(0,0,0,.06), 0 1px 3px 0 rgba(0,0,0,.1);
                opacity: .5; transition: opacity .2s ease, box-shadow .2s ease;
                cursor: pointer; user-select: none;
            }
            #${FLOATING_TOGGLE_ID}:hover { opacity: 1; box-shadow: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1); }
            #${FLOATING_TOGGLE_ID} .ulab-switch-sm {
                position: relative; width: 30px; height: 17px; border-radius: 999px; background: #d4d4d8;
                transition: background .15s ease; flex-shrink: 0;
            }
            #${FLOATING_TOGGLE_ID} .ulab-switch-sm::after {
                content: ''; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px;
                border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3);
                transition: transform .15s ease;
            }
            #${FLOATING_TOGGLE_ID} .ulab-switch-sm.on { background: #6366f1; }
            #${FLOATING_TOGGLE_ID} .ulab-switch-sm.on::after { transform: translateX(13px); }

            /* Hamburger button injected into the (now-slimmer) top navbar */
            #${TOPBAR_TOGGLE_ID} {
                background: none; border: none; color: #fff; padding: 8px 12px;
                border-radius: 6px; cursor: pointer; align-items: center;
                margin-right: 8px; appearance: none; -webkit-appearance: none; outline: none;
            }
            #${TOPBAR_TOGGLE_ID}:hover { background: rgba(255,255,255,.12); }

            /* --- Responsive: below desktop (tablet ≤991px, phone ≤575px)
               the sidebar stops pushing content and instead becomes an
               off-canvas drawer (translateX, hidden by default) that slides
               over the page with a backdrop; body.ulab-sidebar-open (set by
               the hamburger) reveals it. Desktop keeps the original
               push/collapse behavior untouched. --- */
            #${SIDEBAR_BACKDROP_ID} {
                display: none;
                position: fixed; inset: 0; z-index: 1029;
                background: rgba(15, 18, 28, .45);
                opacity: 0; transition: opacity .18s ease;
            }
            body.ulab-sidebar-open #${SIDEBAR_BACKDROP_ID} { display: block; opacity: 1; }

            @media (max-width: 991.98px) {
                body.ulab-shell-mounted header,
                body.ulab-shell-mounted footer,
                body.ulab-shell-mounted.ulab-sidebar-collapsed header,
                body.ulab-shell-mounted.ulab-sidebar-collapsed footer {
                    margin-left: 0 !important;
                }
                body.ulab-shell-mounted > .container,
                body.ulab-shell-mounted.ulab-sidebar-collapsed > .container {
                    margin-left: 0 !important;
                    width: 100% !important;
                    max-width: 100% !important;
                }
                body.ulab-shell-mounted > .container {
                    padding-left: clamp(1rem, 4vw, 1.5rem) !important;
                    padding-right: clamp(1rem, 4vw, 1.5rem) !important;
                }

                #${SIDEBAR_ID},
                body.ulab-sidebar-collapsed #${SIDEBAR_ID} {
                    width: var(--ulab-sidebar-w);
                    transform: translateX(-100%);
                    box-shadow: 2px 0 18px rgba(0,0,0,.25);
                    transition: transform .2s ease;
                }
                body.ulab-sidebar-open #${SIDEBAR_ID} { transform: translateX(0); }

                /* Full label set stays visible in the drawer — it's an
                   overlay now, not a squeezed icon rail. */
                #${SIDEBAR_ID} .ulab-sb-brand span,
                #${SIDEBAR_ID} .ulab-sb-group-label,
                #${SIDEBAR_ID} .ulab-sb-link span.ulab-sb-text,
                #${SIDEBAR_ID} .ulab-sb-user span,
                #${SIDEBAR_ID} .ulab-sb-logout span.ulab-sb-text,
                #${SIDEBAR_ID} .ulab-sb-row .ulab-switch-sm,
                #${SIDEBAR_ID} .ulab-sb-row-label span.ulab-sb-text { display: revert; }
                #${SIDEBAR_ID} .ulab-sb-brand { justify-content: flex-start; padding-left: 16px; padding-right: 16px; }
                #${SIDEBAR_ID} .ulab-sb-user,
                #${SIDEBAR_ID} .ulab-sb-row,
                #${SIDEBAR_ID} .ulab-sb-logout {
                    justify-content: flex-start; padding-left: 8px; padding-right: 8px; gap: 10px;
                }
                #${SIDEBAR_ID} .ulab-sb-link {
                    justify-content: flex-start; padding-left: 16px; padding-right: 16px; margin-left: 8px; margin-right: 8px; gap: 12px;
                }

                /* Hamburger always shown at this width — it's the only way
                   to open the drawer, independent of the collapse state. */
                #${TOPBAR_TOGGLE_ID} { display: flex !important; }
            }

            @media (max-width: 575.98px) {
                #${SIDEBAR_ID}, body.ulab-sidebar-collapsed #${SIDEBAR_ID} {
                    width: min(82vw, 280px);
                }
                body.ulab-shell-mounted header nav.navbar .container { padding-left: .5rem; padding-right: .5rem; }
                body.ulab-shell-mounted > .container { padding-left: 1rem !important; padding-right: 1rem !important; }
                #${FLOATING_TOGGLE_ID} { right: 10px; bottom: 66px; padding: 5px 10px 5px 8px; }

                /* Bootstrap modals: let them use the full viewport with a
                   small gutter instead of the desktop centered dialog, and
                   let wide tables inside them scroll instead of overflowing
                   the page. */
                .modal-dialog { margin: .5rem; max-width: calc(100% - 1rem); }
                .modal-dialog.modal-lg, .modal-dialog.modal-xl { max-width: calc(100% - 1rem) !important; }
                .modal-content { max-height: calc(100vh - 1rem); }
                .modal-body { overflow-y: auto; -webkit-overflow-scrolling: touch; }
                .modal-body table, .modal-body .table-responsive { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
            }

            /* --- Modals: the hamburger has no business showing once a
               Bootstrap modal is open (it sits behind the backdrop but
               visually competes with the modal's own close control), and
               opening a modal while the mobile drawer is open would stack
               two overlays — mount() below closes the drawer on show. --- */
            body.modal-open #${TOPBAR_TOGGLE_ID} { display: none !important; }
            body.modal-open #${FLOATING_TOGGLE_ID} { display: none !important; }

            /* --- Dark mode (only ever active alongside modern UI) — broad,
               !important overrides so per-page light-mode rules never win. --- */
            body.ulab-dark { background: #14171f !important; color: #d7dbe4 !important; }
            body.ulab-dark header nav.navbar { background: #23283a !important; box-shadow: none !important; }
            body.ulab-dark main h2, body.ulab-dark main h1, body.ulab-dark main h5, body.ulab-dark main h6,
            body.ulab-dark main label, body.ulab-dark .form-group label, body.ulab-dark .card-title {
                color: #e2e5ec !important; -webkit-text-fill-color: unset !important;
            }
            body.ulab-dark .card, body.ulab-dark .modal-content, body.ulab-dark #T1, body.ulab-dark table,
            body.ulab-dark .form-horizontal {
                background: #1c202c !important; color: #d7dbe4 !important;
            }
            /* Radio/checkbox option text sits as bare text nodes right after
               the input (e.g. attendance/advising print-format pickers), not
               inside a <label> — the label rule above never reaches it. */
            body.ulab-dark .radioOption, body.ulab-dark .radioOption + * {
                color: #d7dbe4 !important;
            }
            body.ulab-dark .table td, body.ulab-dark .table th { color: #d7dbe4 !important; }
            /* Row-as-card tables (registration/evaluation/result-entry all
               use this pattern) set an explicit white background directly
               on <tr>, which sits on top of, and isn't reached by, the
               bare table-tag rule above. */
            body.ulab-dark .table tbody tr {
                background: #1c202c !important;
                box-shadow: 0 1px 2px rgba(0,0,0,.3), 0 1px 3px rgba(0,0,0,.35) !important;
            }
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

    function buildSidebar(navGroupsState) {
        if (document.getElementById(SIDEBAR_ID)) return document.getElementById(SIDEBAR_ID);
        navGroupsState = navGroupsState || {};

        const sidebar = document.createElement('nav');
        sidebar.id = SIDEBAR_ID;

        const brand = document.createElement('div');
        brand.className = 'ulab-sb-brand';
        brand.innerHTML = `<img src="/images/logo.png" alt="ULAB" /><span>URMS Portal</span>`;
        sidebar.appendChild(brand);

        const navWrap = document.createElement('div');
        const currentPath = location.pathname.replace(/\/$/, '') || '/';
        NAV_GROUPS.forEach((group) => {
            const itemsWrap = document.createElement('div');
            itemsWrap.className = 'ulab-sb-group-items';

            if (group.label) {
                const groupKey = group.label;
                const header = document.createElement('div');
                header.className = 'ulab-sb-group-header';
                header.dataset.groupKey = groupKey;
                const chevron = document.createElement('span');
                chevron.className = 'ulab-sb-group-chevron';
                chevron.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
                header.innerHTML = `<span class="ulab-sb-group-label">${group.label}</span>`;
                header.appendChild(chevron);
                if (navGroupsState[groupKey]) {
                    header.classList.add('collapsed');
                    itemsWrap.classList.add('collapsed');
                }
                header.addEventListener('click', () => toggleGroup(groupKey, header, itemsWrap));
                navWrap.appendChild(header);
            }

            group.items.forEach((item) => {
                const el = document.createElement(item.href ? 'a' : 'button');
                el.className = 'ulab-sb-link';
                if (item.href) {
                    const itemPath = item.href.replace(/\/$/, '') || '/';
                    if (itemPath === currentPath) el.classList.add('active');
                    el.href = item.href;
                } else {
                    el.type = 'button';
                }
                el.innerHTML = `${svg(item.icon)}<span class="ulab-sb-text">${item.label}</span>`;
                if (item.action) el.addEventListener('click', () => handleNavAction(item.action));
                itemsWrap.appendChild(el);
            });

            navWrap.appendChild(itemsWrap);
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

        const fontRow = document.createElement('div');
        fontRow.className = 'ulab-sb-row';
        fontRow.id = 'ulab-font-row';
        fontRow.innerHTML = `<span class="ulab-sb-row-label">${svg('type-size', 14)}<span class="ulab-sb-text">Text size</span></span>
            <span class="ulab-fontctl">
                <button type="button" class="ulab-fontctl-btn" id="ulab-font-dec" aria-label="Decrease text size">−</button>
                <span class="ulab-fontctl-val" id="ulab-font-val">100%</span>
                <button type="button" class="ulab-fontctl-btn" id="ulab-font-inc" aria-label="Increase text size">+</button>
            </span>`;
        footer.appendChild(fontRow);

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
        buildSidebarBackdrop();
        return sidebar;
    }

    // Mobile/tablet-only scrim behind the off-canvas drawer — tapping it
    // closes the drawer, same as tapping outside a shadcn Sheet.
    function buildSidebarBackdrop() {
        if (document.getElementById(SIDEBAR_BACKDROP_ID)) return;
        const backdrop = document.createElement('div');
        backdrop.id = SIDEBAR_BACKDROP_ID;
        backdrop.addEventListener('click', closeMobileDrawer);
        document.body.appendChild(backdrop);
    }

    function closeMobileDrawer() {
        document.body.classList.remove('ulab-sidebar-open');
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
            // Below the tablet breakpoint the sidebar is an off-canvas
            // drawer (ulab-sidebar-open), not the desktop icon-rail
            // collapse (ulab-sidebar-collapsed) — same button, different
            // meaning depending on viewport.
            if (window.matchMedia(MOBILE_QUERY).matches) {
                document.body.classList.toggle('ulab-sidebar-open');
                return;
            }
            const collapsed = !document.body.classList.contains('ulab-sidebar-collapsed');
            document.body.classList.toggle('ulab-sidebar-collapsed', collapsed);
            chrome.storage.local.set({ [KEYS.collapsed]: collapsed });
        });
        brandLink.parentNode.insertBefore(btn, brandLink);

        // Crossing back up to desktop while the drawer happens to be open
        // (e.g. rotating a tablet, or a DevTools resize) shouldn't leave it
        // stuck open under the now-restored push layout.
        window.matchMedia(MOBILE_QUERY).addEventListener('change', (e) => {
            if (!e.matches) closeMobileDrawer();
        });

        // Bootstrap 4 modals toggle body.modal-open themselves (CSS above
        // hides the hamburger off that class already) — also collapse the
        // mobile drawer so a modal never opens on top of it.
        if (window.jQuery) {
            window.jQuery(document).on('show.bs.modal', closeMobileDrawer);
        } else {
            document.addEventListener('show.bs.modal', closeMobileDrawer);
        }
    }

    function setTheme(isDark) {
        document.body.classList.toggle('ulab-dark', isDark);
        const row = document.getElementById('ulab-theme-row');
        if (row) row.querySelector('.ulab-switch-sm').classList.toggle('on', isDark);
    }

    // Scales the whole reskin uniformly: every size in this shell's CSS
    // (and every page-specific file's CSS) is written in rem, which is
    // always relative to the root <html> element's font-size — so changing
    // that one value scales sidebar/cards/tables/text together, without
    // touching native (non-reskin) parts of the page that use px/em.
    function setFontScale(pct) {
        pct = Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, pct));
        document.documentElement.style.fontSize = pct + '%';
        const val = document.getElementById('ulab-font-val');
        if (val) val.textContent = pct + '%';
        const dec = document.getElementById('ulab-font-dec');
        if (dec) dec.disabled = pct <= FONT_SCALE_MIN;
        const inc = document.getElementById('ulab-font-inc');
        if (inc) inc.disabled = pct >= FONT_SCALE_MAX;
        return pct;
    }

    function toggleGroup(groupKey, header, itemsWrap) {
        const collapsed = !header.classList.contains('collapsed');
        header.classList.toggle('collapsed', collapsed);
        itemsWrap.classList.toggle('collapsed', collapsed);
        chrome.storage.local.get([KEYS.navGroups], (result) => {
            const map = result[KEYS.navGroups] || {};
            map[groupKey] = collapsed;
            chrome.storage.local.set({ [KEYS.navGroups]: map });
        });
    }

    function handleNavAction(action) {
        if (action && action.startsWith('open-tool:')) {
            const featureId = action.split(':')[1];
            const path = `features/shared/tools-frame.html?feature=${encodeURIComponent(featureId)}`;
            // The frame's own header (tools-frame.html) already shows the
            // specific tool name and updates live as the user pages through
            // tools with prev/next — a second, static title here would go
            // stale the moment they navigate, showing whatever tool was
            // open when the overlay was first launched. Keep this one
            // generic so there's nothing to go out of sync.
            openExtensionFrame(path, 'Faculty Companion Tools');
        }
    }

    // --- Extension pages opened as a full-page in-URMS overlay, instead of
    // reimplementing their UI a second time. An earlier attempt injected
    // the class-schedule/consultation feature's own JS files (consultation-
    // modal.js, time-picker.js, course-picker.js, etc.) directly into every
    // URMS page's content-script bundle so they could be called in-place —
    // that approach never actually got its scripts to run reliably (the
    // whole injected chunk silently failed to load even after a full
    // extension reload, root cause never pinned down) and added real
    // complexity (12 extra files per page, CSS var scoping, a duplicate
    // hand-built calendar renderer). This is simpler and more honest about
    // what's actually happening: the extension's own already-built page
    // (features/class-schedule/results.html — the exact same page the side
    // panel opens) is shown inside an iframe overlay on top of URMS. Same
    // code, same chrome.storage data, zero duplication, and — since it's
    // the extension's own origin inside the iframe, not the URMS page's —
    // none of the content-script loading/CSP complexity applies. Requires
    // "web_accessible_resources" in manifest.json for the URMS origin to be
    // allowed to frame it at all. ---
    const EXT_FRAME_ID = 'ulab-ext-frame-modal';

    function extFrameStyles() {
        if (document.getElementById('ulab-ext-frame-css')) return;
        const style = document.createElement('style');
        style.id = 'ulab-ext-frame-css';
        style.textContent = `
            #${EXT_FRAME_ID}-overlay {
                display: none; position: fixed; inset: 0; z-index: 1000001;
                background: rgba(15,23,42,.55); align-items: center; justify-content: center;
                padding: 20px;
            }
            #${EXT_FRAME_ID}-overlay.open { display: flex; }
            #${EXT_FRAME_ID}-card {
                background: #fff; width: 100%; height: 100%; max-width: 1400px;
                border-radius: 14px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.4);
                display: flex; flex-direction: column;
            }
            #${EXT_FRAME_ID}-bar {
                display: flex; align-items: center; justify-content: space-between;
                padding: 10px 16px; background: #1f2937; color: #fff; flex-shrink: 0;
            }
            #${EXT_FRAME_ID}-title { font: 600 13px system-ui, sans-serif; }
            #${EXT_FRAME_ID}-close {
                background: rgba(255,255,255,.12); border: none; color: #fff; width: 26px; height: 26px;
                border-radius: 6px; cursor: pointer; font-size: 15px; line-height: 1;
            }
            #${EXT_FRAME_ID}-close:hover { background: rgba(255,255,255,.22); }
            #${EXT_FRAME_ID}-iframe { flex: 1; border: none; width: 100%; }
            @media (max-width: 680px) {
                #${EXT_FRAME_ID}-overlay { padding: 0; }
                #${EXT_FRAME_ID}-card { border-radius: 0; max-width: none; }
            }
        `;
        document.head.appendChild(style);
    }

    function ensureExtFrameShell() {
        if (document.getElementById(`${EXT_FRAME_ID}-overlay`)) return;
        const overlay = document.createElement('div');
        overlay.id = `${EXT_FRAME_ID}-overlay`;
        overlay.innerHTML = `
            <div id="${EXT_FRAME_ID}-card">
                <div id="${EXT_FRAME_ID}-bar">
                    <span id="${EXT_FRAME_ID}-title"></span>
                    <button id="${EXT_FRAME_ID}-close" aria-label="Close" title="Close">✕</button>
                </div>
                <iframe id="${EXT_FRAME_ID}-iframe"></iframe>
            </div>`;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeExtFrame(); });
        document.body.appendChild(overlay);
        document.getElementById(`${EXT_FRAME_ID}-close`).addEventListener('click', closeExtFrame);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeExtFrame();
        });
    }

    function closeExtFrame() {
        const overlay = document.getElementById(`${EXT_FRAME_ID}-overlay`);
        if (overlay) overlay.classList.remove('open');
        const iframe = document.getElementById(`${EXT_FRAME_ID}-iframe`);
        if (iframe) iframe.src = 'about:blank'; // stop background work (e.g. pending exports) once closed
    }

    function openExtensionFrame(path, title) {
        extFrameStyles();
        ensureExtFrameShell();
        document.getElementById(`${EXT_FRAME_ID}-title`).textContent = title || '';
        document.getElementById(`${EXT_FRAME_ID}-iframe`).src = chrome.runtime.getURL(path);
        document.getElementById(`${EXT_FRAME_ID}-overlay`).classList.add('open');
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
        chrome.storage.local.get([KEYS.modern, KEYS.theme, KEYS.collapsed, KEYS.fontScale, KEYS.navGroups], (result) => {
            const isOn = result[KEYS.modern] !== false; // default on
            const isDark = result[KEYS.theme] === 'dark';
            const isCollapsed = !!result[KEYS.collapsed];
            const fontScale = typeof result[KEYS.fontScale] === 'number' ? result[KEYS.fontScale] : 100;
            const navGroupsState = result[KEYS.navGroups] || {};

            if (isOn) { buildSidebar(navGroupsState); buildHamburger(); }
            buildFloatingToggle(isOn, pageBodyClass, onModernChange);
            document.body.classList.toggle('ulab-sidebar-collapsed', isCollapsed);

            setModern(isOn, pageBodyClass, onModernChange);
            setTheme(isDark);
            setFontScale(fontScale);

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
            const decBtn = document.getElementById('ulab-font-dec');
            if (decBtn) decBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const next = setFontScale((document.documentElement.style.fontSize ? parseInt(document.documentElement.style.fontSize, 10) : 100) - FONT_SCALE_STEP);
                chrome.storage.local.set({ [KEYS.fontScale]: next });
            });
            const incBtn = document.getElementById('ulab-font-inc');
            if (incBtn) incBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const next = setFontScale((document.documentElement.style.fontSize ? parseInt(document.documentElement.style.fontSize, 10) : 100) + FONT_SCALE_STEP);
                chrome.storage.local.set({ [KEYS.fontScale]: next });
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
