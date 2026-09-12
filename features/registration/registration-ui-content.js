// features/registration/registration-ui-content.js — content script for the
// URMS Student Registration page. Deliberately narrow in scope: this page's
// course tables are rewritten at runtime by the page's own inline JS
// (AddRow/SetSection/etc., raw innerHTML on <td>s), so this reskin only
// touches the navbar, static labels/cards/table headers and other elements
// the runtime JS never rewrites — no DOM is moved or replaced. Dynamic rows
// still pick up the generic table/row CSS below since that targets
// table/tr/td structurally, not specific injected content. Cloak/toggle/
// sidebar/dark-mode are all owned by the shared
// features/shared/ulab-dashboard-shell.js, loaded first in this bundle.
(function () {
    const STYLE_ID = 'ulab-modern-registration-css';
    const BODY_CLASS = 'ulab-modern-registration';

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            body.${BODY_CLASS} {
                background: linear-gradient(180deg, #f7f9fd 0%, #eef2fb 100%);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
            }

            /* Navbar (shared look with the Home page reskin) */
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
            body.${BODY_CLASS} main > hr:first-of-type {
                width: 64px;
                height: 4px;
                border: none;
                border-radius: 4px;
                background: linear-gradient(90deg, #3A67B2, #63b3ed);
                margin: .75rem 0 1.5rem;
            }

            /* Labels & static fields (not touched by runtime JS) */
            body.${BODY_CLASS} .form-group label,
            body.${BODY_CLASS} main label {
                font-weight: 600;
                color: #344054;
                font-size: .92rem;
            }
            body.${BODY_CLASS} #RegDateString,
            body.${BODY_CLASS} #TotalCredit,
            body.${BODY_CLASS} #PerCreditAmount {
                border-radius: 4px !important;
                background: #eef2fb !important;
                padding: .3rem .6rem;
                font-weight: 600;
                color: #2c5296;
            }
            body.${BODY_CLASS} #StudentID {
                border-radius: 4px;
                border: 1.5px solid #e4e7ec;
                padding: .6rem .8rem;
                transition: border-color .15s ease;
            }
            body.${BODY_CLASS} #StudentID:focus {
                outline: none;
                border-color: #3A67B2;
            }
            body.${BODY_CLASS} #btnLoad {
                border-radius: 4px;
                background: #3A67B2;
                color: #fff;
                border: none;
                font-weight: 600;
                box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
                transition: box-shadow .15s ease;
            }
            body.${BODY_CLASS} #btnLoad:hover { box-shadow: 0 3px 3px -2px rgba(0,0,0,.2), 0 3px 4px 0 rgba(0,0,0,.14), 0 1px 8px 0 rgba(0,0,0,.12); }

            /* Cards */
            body.${BODY_CLASS} main .card {
                border: none;
                border-radius: 8px;
                background: #fff;
                box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
            }
            body.${BODY_CLASS} main .card-title {
                font-weight: 700;
                color: #101828;
                font-size: 1rem;
            }

            /* Tables — structural selectors only, so dynamically inserted
               rows (via insertRow()) automatically inherit this styling. */
            body.${BODY_CLASS} .table thead th {
                background: #eef2fb;
                color: #344054;
                font-weight: 700;
                font-size: .78rem;
                text-transform: uppercase;
                letter-spacing: .03em;
                border-bottom: none !important;
                padding: .7rem .8rem;
            }
            body.${BODY_CLASS} .table td {
                padding: .6rem .8rem;
                vertical-align: middle;
                font-size: .88rem;
            }
            body.${BODY_CLASS} .table-bordered,
            body.${BODY_CLASS} .table-bordered td,
            body.${BODY_CLASS} .table-bordered th {
                border-color: #eef1f6 !important;
            }
            body.${BODY_CLASS} .table-striped tbody tr:nth-of-type(odd) {
                background-color: #fafbfd;
            }
            body.${BODY_CLASS} .table-hover tbody tr:hover {
                background-color: #eef2fb;
            }

            /* Modal — widened beyond .modal-lg to make room for the Title
               column we add to its course table. */
            body.${BODY_CLASS} .modal-dialog.modal-lg {
                max-width: min(1100px, 92vw);
            }
            body.${BODY_CLASS} .modal-content {
                border: none;
                border-radius: 4px;
                box-shadow: 0 11px 15px -7px rgba(0,0,0,.2), 0 24px 38px 3px rgba(0,0,0,.14), 0 9px 46px 8px rgba(0,0,0,.12);
                overflow: hidden;
            }
            body.${BODY_CLASS} .modal-header {
                background: #3A67B2;
            }
            body.${BODY_CLASS} .modal-header .modal-title { color: #fff; }
            body.${BODY_CLASS} .modal-header .btn-secondary {
                background: rgba(255,255,255,.18);
                border: none;
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

    // Same program-name → catalogue-id mapping used by the floating Advising
    // button (features/advising/student-page-content.js), duplicated here
    // since this is a separate content-script bundle with its own globals.
    function resolveProgramId(programText) {
        const t = (programText || '').toLowerCase();
        if (/\bcse\b/.test(t) || /computer science/.test(t)) return 'CSE';
        if (/\bbba\b/.test(t) || /business administration/.test(t)) return 'BBA';
        if (/\bmsj\b/.test(t) || /media studies|journalism/.test(t)) return 'MSJ';
        if (/\beee\b/.test(t) || /electrical/.test(t)) return 'EEE';
        if (/\bbangla\b/.test(t)) return 'BANGLA';
        if (/english/.test(t)) return 'ENGLISH';
        return null;
    }

    function findProgramCatalogue() {
        if (!window.ULAB_CATALOGUES) return null;
        const rows = document.querySelectorAll('main .row');
        for (const row of rows) {
            const first = row.children[0];
            if (first && /^Program\s*:?\s*$/i.test(first.textContent.trim())) {
                const second = row.children[1];
                const id = resolveProgramId(second ? second.textContent : '');
                return id ? window.ULAB_CATALOGUES[id] : null;
            }
        }
        return null;
    }

    // The advising catalogue scripts (features/advising/catalogue-factory.js
    // + catalogues/*.js) load in a separate "document_idle" content-script
    // block, so they may not have populated window.ULAB_CATALOGUES yet by
    // the time this "document_start" bundle reaches DOMContentLoaded —
    // poll briefly rather than assuming a fixed ordering.
    function whenCataloguesReady(cb, attemptsLeft) {
        if (attemptsLeft === undefined) attemptsLeft = 20;
        if (window.ULAB_CATALOGUES || attemptsLeft <= 0) { cb(); return; }
        setTimeout(() => whenCataloguesReady(cb, attemptsLeft - 1), 150);
    }

    // --- Course-name column, added generically to ANY course table on this
    // page that has a CourseID/Course column but no Title yet: the "List of
    // completed/registered courses" summary (static, server-rendered) AND
    // the "Load Courses to Add" modal's course tables (built incrementally
    // by the page's own inline AddRow()/SetSection() JS, one row at a time,
    // as the user picks courses — those run in the page's own "main world"
    // JS context, invisible to and unpatchable from this content script, so
    // rather than hooking those functions we just watch each table's <tbody>
    // with a MutationObserver and insert a Title cell into every row as it
    // appears, keeping the extra column in sync no matter when/how rows
    // show up. ---
    function findCourseIdColumnIndex(table) {
        const headerRow = (table.tHead && table.tHead.rows[0]) || table.rows[0];
        if (!headerRow) return { headerRow: null, idx: -1 };
        const headers = Array.from(headerRow.cells).map(c => c.textContent.trim().toLowerCase());
        const idx = headers.findIndex(h => h === 'courseid' || h === 'course');
        return { headerRow, idx };
    }

    function isUnenhancedCourseTable(table) {
        if (!table || table.dataset.ulabTitleWatch) return false;
        const { headerRow, idx } = findCourseIdColumnIndex(table);
        if (!headerRow || idx === -1) return false;
        const headers = Array.from(headerRow.cells).map(c => c.textContent.trim().toLowerCase());
        return !headers.some(h => h === 'title' || h === 'course name');
    }

    function insertTitleCellForRow(row, courseIdx) {
        if (row.dataset.ulabTitled || row.cells.length <= courseIdx) return;
        const cat = findProgramCatalogue();
        const courseCell = row.cells[courseIdx];
        const courseId = courseCell.textContent.trim();
        const titleTd = document.createElement('td');
        titleTd.textContent = (cat && courseId && cat.titleFor(courseId)) || '—';
        courseCell.after(titleTd);
        row.dataset.ulabTitled = 'true';
    }

    function watchCourseTable(table) {
        if (table.dataset.ulabTitleWatch) return;
        const { headerRow, idx: courseIdx } = findCourseIdColumnIndex(table);
        if (!headerRow || courseIdx === -1) return;
        table.dataset.ulabTitleWatch = 'true';

        const titleTh = document.createElement('th');
        titleTh.textContent = 'Title';
        headerRow.cells[courseIdx].after(titleTh);

        const body = table.tBodies[0] || table;
        Array.from(body.rows).forEach((row) => {
            if (row !== headerRow) insertTitleCellForRow(row, courseIdx);
        });

        new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                m.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.tagName === 'TR') insertTitleCellForRow(node, courseIdx);
                });
            });
        }).observe(body, { childList: true });
    }

    function scanForCourseTables(root) {
        if (!root.querySelectorAll) return;
        root.querySelectorAll('table').forEach((table) => {
            if (isUnenhancedCourseTable(table)) watchCourseTable(table);
        });
    }

    // Catch tables already on the page (main "Courses to be Registered" /
    // history tables) plus any injected later — e.g. into the "Load Courses
    // to Add" modal once its content loads.
    function initCourseTitleWatchers() {
        scanForCourseTables(document);
        new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                m.addedNodes.forEach((node) => {
                    if (node.nodeType !== 1) return;
                    if (node.tagName === 'TABLE') { if (isUnenhancedCourseTable(node)) watchCourseTable(node); }
                    else scanForCourseTables(node);
                });
            });
        }).observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        injectStyles();
        window.ULAB_SHELL.mount(BODY_CLASS);
        // Independent of the cloak/reveal timing above — don't block the
        // page appearing on this, just add the column(s) whenever ready.
        whenCataloguesReady(initCourseTitleWatchers);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
