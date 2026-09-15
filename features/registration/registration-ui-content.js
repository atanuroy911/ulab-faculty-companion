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

            /* Cards — a crisp 1px border plus a real layered shadow (not
               the old material-design "2dp" recipe, which reads as flat on
               a light background) so the card actually separates from the
               page instead of blending into it. No colored top bar — a
               clean border+shadow reads as more contemporary than the
               dated "colored accent stripe" card pattern. */
            body.${BODY_CLASS} main .card {
                border: 1px solid #e4e7ec;
                border-radius: 12px;
                background: #fff;
                box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 4px 16px -4px rgba(16,24,40,.08);
                overflow: hidden;
            }
            body.${BODY_CLASS} main .card-title {
                font-weight: 700;
                color: #101828;
                font-size: 1.1rem;
                letter-spacing: -.015em;
            }

            /* Tables — structural selectors only, so dynamically inserted
               rows (via insertRow()) automatically inherit this styling. */
            /* .table th (not .table thead th): the "Course Schedule List"
               modal's section table has no real <thead> at all — its header
               is just the first <tr class="d-flex"> inside <tbody>, holding
               <th> cells directly — so a thead-scoped selector would miss
               it entirely. */
            body.${BODY_CLASS} .table th {
                background: #f8fafc;
                color: #475467;
                font-weight: 700;
                font-size: .74rem;
                text-transform: uppercase;
                letter-spacing: .06em;
                border-bottom: 1px solid #e4e7ec !important;
                padding: .75rem .9rem;
                white-space: nowrap;
                /* Sticks to the top of whichever ancestor actually scrolls
                   (e.g. #A's overflow:auto) instead of scrolling away with
                   the body rows — needs border-collapse:separate below;
                   position:sticky silently does nothing under
                   border-collapse:collapse. */
                position: sticky;
                top: 0;
                z-index: 2;
            }
            body.${BODY_CLASS} .table td {
                padding: .85rem .9rem;
                vertical-align: middle;
                font-size: .95rem;
            }
            body.${BODY_CLASS} .table-bordered,
            body.${BODY_CLASS} .table-bordered td,
            body.${BODY_CLASS} .table-bordered th {
                border-color: transparent !important;
            }
            /* Row styling — split into two deliberately different
               techniques depending on the row's actual display type:

               1) Real <tr> rows (display:table-row — the course catalogue,
                  "Courses to be registered", etc.): a border-collapse:
                  separate + non-zero border-spacing + per-row
                  border-radius/shadow "stacked cards" treatment was tried
                  here and reproducibly broke row-height calculation in
                  testing — rows collapsed to near-zero height with
                  overlapping text. That combo on real table-row elements is
                  less reliable than it looks, so this uses a plain,
                  conservative pattern instead: a bottom border per row and
                  a background change on hover, with border-spacing:0 (so
                  rows still sit flush, no gap) rather than
                  border-collapse:collapse — collapse would be simpler, but
                  it silently disables position:sticky on the header cells
                  below, which is what's used to keep the header pinned
                  while the body scrolls inside #A. No radius, no shadow, no
                  actual spacing — deliberately boring and safe, just not
                  literally "collapse".

               2) tr.d-flex rows (the "Course Schedule List" modal's section
                  table — display:flex, not table-row at all, so none of the
                  above bug applies): keep the rounded/shadowed card look,
                  spaced with margin (which only has effect on non-table-row
                  displays like flex). */
            body.${BODY_CLASS} .table {
                border-collapse: separate;
                border-spacing: 0;
            }
            /* Row dividers live on the cells, not the <tr> — under
               border-collapse:separate (needed for position:sticky above),
               browsers only paint borders set on table/cell elements; a
               border on <tr> itself is never rendered at all. !important:
               .table-bordered (T2/T6 both have it) already forces every
               cell's border-color transparent above, to hide Bootstrap's
               own busy full-grid borders — without !important that same
               rule would also swallow this divider. */
            body.${BODY_CLASS} .table tbody tr:not(.d-flex) > td {
                border-bottom: 1px solid #eef1f6 !important;
            }
            body.${BODY_CLASS} .table tbody tr:not(.d-flex):last-child > td {
                border-bottom: none !important;
            }
            body.${BODY_CLASS} .table tbody tr:not(.d-flex) {
                background: #fff;
                transition: background-color .12s ease;
            }
            body.${BODY_CLASS} .table tbody tr:not(.d-flex):hover {
                background: #f8fafc;
            }
            /* The header "row" in some of these tables isn't a <thead> —
               it's a tbody row that happens to contain <th>s directly — so
               exclude it from the above by detecting the th, not thead.
               Sticky lives on the ROW here (not just the th cells, which
               the generic ".table th" rule below already does): #T5's
               header is a tr.d-flex — a flex row nested inside a
               display:table-row-group <tbody>, an invalid/mixed layout
               combo browsers only "fix up" approximately — sticky on the
               individual th flex-items inside it was unreliable. Sticking
               the row itself as one unit works regardless of what display
               its children end up using. */
            body.${BODY_CLASS} .table thead tr,
            body.${BODY_CLASS} .table tbody tr:has(> th) {
                background: #f8fafc !important;
                position: sticky;
                top: 0;
                z-index: 3;
            }
            body.${BODY_CLASS} .table thead th,
            body.${BODY_CLASS} .table tbody tr:has(> th) > th {
                border-bottom: 2px solid #e4e7ec !important;
            }
            /* A sticky header bar shouldn't look like a floating rounded
               card (T5's header is also a .d-flex row, so it'd otherwise
               inherit the box-shadow/radius/margin below meant for data
               rows). */
            body.${BODY_CLASS} .table tbody tr.d-flex:has(> th) {
                box-shadow: none !important;
                border-radius: 0 !important;
                margin-bottom: 0 !important;
            }

            body.${BODY_CLASS} .table tbody tr.d-flex {
                background: #fff;
                box-shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08);
                border-radius: 8px;
                margin-bottom: 8px;
                transition: box-shadow .12s ease;
            }
            body.${BODY_CLASS} .table tbody tr.d-flex:hover {
                box-shadow: 0 2px 4px -1px rgba(16,24,40,.1), 0 4px 8px 0 rgba(16,24,40,.1);
            }
            body.${BODY_CLASS} .table tbody tr.d-flex td:first-child {
                border-top-left-radius: 8px;
                border-bottom-left-radius: 8px;
            }
            body.${BODY_CLASS} .table tbody tr.d-flex td:last-child {
                border-top-right-radius: 8px;
                border-bottom-right-radius: 8px;
            }
            /* Row-selection highlight — softened from its default neon
               green to a brand-tinted blue with a left accent, consistent
               with the rest of the card treatment. Confirmed against the
               real markup: the class is .selectedRow, not the generic
               .selected I'd originally guessed at — that guess never
               matched, so the green was still showing at full strength. */
            body.${BODY_CLASS} .table tbody tr.selectedRow,
            body.${BODY_CLASS} .table tbody tr.selectedRow td,
            body.${BODY_CLASS} .table tbody tr.selectedRow th {
                background: #eaf1fd !important;
                color: #1e3a68 !important;
            }
            body.${BODY_CLASS} .table tbody tr.selectedRow td:first-child,
            body.${BODY_CLASS} .table tbody tr.selectedRow th:first-child {
                box-shadow: inset 3px 0 0 #3A67B2;
            }

            /* Course ID — a hyphenated code like "0031-000-1113" mid-word
               wraps into "0031-000-" / "1113" in a narrow column, which is
               hard to scan and looks broken. Monospace + no-wrap keeps it
               one clean unit; the column just widens to fit instead. */
            body.${BODY_CLASS} .table td:first-child {
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                font-size: .9rem;
                font-weight: 600;
                color: #2c5296;
                white-space: nowrap;
                letter-spacing: -.01em;
            }

            /* Schedule column — the page renders multi-meeting schedules as
               one run-on string ("TUE PB103 10:50AM-12:10PM KTH PB103
               12:15PM- 1:35PM KTH"). The MutationObserver-based watcher
               below (formatScheduleCellForRow) parses it and rewrites the
               cell into one .ulab-sched-row per meeting — this just styles
               that structure. Falls back to the plain-text default table
               cell styling on any row the parser couldn't confidently read. */
            body.${BODY_CLASS} .ulab-sched-cell {
                max-width: 320px;
                display: flex; flex-direction: column; gap: 6px;
                padding-top: .55rem !important; padding-bottom: .55rem !important;
            }
            body.${BODY_CLASS} .ulab-sched-row {
                display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap;
                font-size: .92rem; line-height: 1.5; white-space: nowrap;
                background: #f8fafc; border: 1px solid #eef1f6; border-radius: 6px;
                padding: 5px 8px;
            }
            body.${BODY_CLASS} .ulab-sched-day {
                flex-shrink: 0; font-weight: 700; font-size: .76rem;
                color: #3A67B2; background: #eef2fb; border-radius: 4px;
                padding: 1px 6px; letter-spacing: .02em;
            }
            body.${BODY_CLASS} .ulab-sched-time { flex-shrink: 0; font-weight: 600; color: #344054; }
            body.${BODY_CLASS} .ulab-sched-room { color: #8a94a6; overflow: hidden; text-overflow: ellipsis; }

            /* Action icons (edit/drop) — were two bare SVGs touching each
               other with no affordance; give them a real hit target, more
               breathing room, and hover feedback so they read as buttons,
               not decoration. Only enlarged on real table rows: the "Course
               Schedule List" modal's tables use tr.d-flex fake rows instead
               of actual table rows, and forcing a bigger icon box there
               made the action cell taller than its flex row, so the icons
               visibly spilled into the row below — those keep their
               original 24px size with just padding + equal negative margin
               to grow the hover hit-area without growing layout footprint. */
            body.${BODY_CLASS} .table td:last-child {
                white-space: nowrap;
            }
            body.${BODY_CLASS} .table tr:not(.d-flex) td:last-child svg {
                cursor: pointer;
                width: 22px !important;
                height: 22px !important;
                padding: 5px;
                margin: 0 2px;
                border-radius: 6px;
                transition: background-color .12s ease, transform .1s ease;
                vertical-align: middle;
            }
            body.${BODY_CLASS} .table tr:not(.d-flex) td:last-child svg:hover { transform: scale(1.08); }
            body.${BODY_CLASS} .table tr.d-flex td:last-child svg {
                cursor: pointer;
                padding: 4px 3px;
                margin: -4px 0;
                border-radius: 5px;
                transition: background-color .12s ease;
                vertical-align: middle;
            }
            body.${BODY_CLASS} .table td:last-child svg:hover { background: #eef2fb; }
            body.${BODY_CLASS} .table td:last-child svg.text-danger:hover { background: #fef2f2; }

            /* Primary action buttons at the bottom of the card (Save / Email
               Bill / Advising Bill) and Drop — consistent pill shape and
               weight so the row reads as one coherent action bar instead of
               mismatched Bootstrap defaults. */
            body.${BODY_CLASS} main .btn {
                border-radius: 6px;
                font-weight: 600;
                padding: .5rem 1.1rem;
                transition: box-shadow .15s ease, transform .1s ease;
            }
            body.${BODY_CLASS} main .btn-primary {
                background: #3A67B2;
                border-color: #3A67B2;
                box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
            }
            body.${BODY_CLASS} main .btn-primary:hover { box-shadow: 0 3px 3px -2px rgba(0,0,0,.2), 0 3px 4px 0 rgba(0,0,0,.14), 0 1px 8px 0 rgba(0,0,0,.12); }
            body.${BODY_CLASS} main .btn-outline-primary,
            body.${BODY_CLASS} main .btn-outline-secondary {
                border-width: 1.5px;
            }
            body.${BODY_CLASS} main .btn-danger {
                box-shadow: 0 2px 1px -1px rgba(0,0,0,.15);
            }

            /* Modal — kept deliberately minimal this time: just width, a
               reversed header order, and the search bar. Nothing here
               touches row/table layout (the row-collapse bug from before
               was in the table CSS, already fixed separately and untouched
               by this block) or forces any fixed heights. */
            body.${BODY_CLASS} .modal-dialog.modal-lg {
                max-width: 1200px;
            }
            /* DOM order is Close button then title (data-dismiss button
               comes first in the actual markup); Bootstrap's default
               .modal-header is a flex row with space-between, so reversing
               the flex direction puts the title on the left and Close on
               the right without needing to touch the DOM. */
            body.${BODY_CLASS} .modal-header {
                flex-direction: row-reverse;
            }
            /* Search bar — icon positioned inside the input instead of
               sitting above it, rounded input, brand-colored focus ring. */
            body.${BODY_CLASS} .form-group.has-search {
                position: relative;
                margin-bottom: 1rem;
            }
            body.${BODY_CLASS} .form-group.has-search .form-control-feedback {
                position: absolute;
                z-index: 2;
                display: block;
                width: 2.375rem;
                height: 2.375rem;
                line-height: 2.375rem;
                text-align: center;
                color: #98a2b3;
                pointer-events: none;
            }
            body.${BODY_CLASS} .form-group.has-search .form-control {
                padding-left: 2.375rem;
                border-radius: 8px;
                border: 1px solid #dfe3ea;
                background: #f8fafc;
                transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
            }
            body.${BODY_CLASS} .form-group.has-search .form-control:focus {
                outline: none;
                border-color: #3A67B2;
                background: #fff;
                box-shadow: 0 0 0 3px rgba(58,103,178,.12);
            }
            /* Gap between "Courses to be registered" / "Schedule for X" and
               their tables — confirmed real ids, see advising.js's #T1/#T4
               notes for why bare text-matching was abandoned in favor of
               targeting these directly. */
            body.${BODY_CLASS} #tempCourseListDiv > h5,
            body.${BODY_CLASS} #tempCourseSchedule > h5 {
                margin-bottom: 1rem;
            }
            /* Equal 50/50 split instead of Bootstrap's native col-sm-5/
               col-sm-7 (41.67%/58.33%) — the parent .row is already a flex
               container (Bootstrap default), so overriding each column's
               own flex-basis/max-width is enough without touching .row. */
            body.${BODY_CLASS} #tempCourseListDiv,
            body.${BODY_CLASS} #tempCourseSchedule {
                flex: 0 0 50%;
                max-width: 50%;
            }
            /* Catalogue/schedule scroll container — clean framing only, no
               forced height/padding this time (that combination is what
               triggered the earlier row-collapse bug, even though the real
               cause turned out to be table row-spacing, not this). id="A"
               is reused across multiple scroll containers on this page, but
               that's harmless here since every instance wants this same
               plain visual treatment. */
            body.${BODY_CLASS} #A {
                border: 1px solid #e4e7ec;
                border-radius: 8px;
                box-shadow: 0 1px 2px rgba(16,24,40,.04);
            }
            body.${BODY_CLASS} .clickable-row {
                cursor: pointer;
            }

            /* Footer */
            body.${BODY_CLASS} footer {
                background: transparent;
                border-top: 1px solid rgba(16,24,40,.06) !important;
                font-size: .8rem;
            }

            /* Wrap wide tables so they scroll horizontally instead of
               overflowing the viewport, on any breakpoint. */
            body.${BODY_CLASS} .table-responsive {
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
            }

            @media (max-width: 991.98px) {
                body.${BODY_CLASS} main { padding-left: 1rem !important; padding-right: 1rem !important; }
                body.${BODY_CLASS} .form-group.row,
                body.${BODY_CLASS} main .row {
                    flex-wrap: wrap;
                }
                body.${BODY_CLASS} .table:not(.table-responsive *) {
                    display: block;
                    width: 100%;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }
            }

            @media (max-width: 575.98px) {
                body.${BODY_CLASS} main > h2:first-of-type { font-size: 1.3rem; }
                body.${BODY_CLASS} main .card { border-radius: 6px; }
                body.${BODY_CLASS} main .card-title { font-size: .92rem; }
                body.${BODY_CLASS} .form-group label,
                body.${BODY_CLASS} main label { font-size: .85rem; }
                body.${BODY_CLASS} .form-group.row > label,
                body.${BODY_CLASS} .form-group.row > div {
                    flex: 0 0 100%;
                    max-width: 100%;
                }
                body.${BODY_CLASS} #StudentID,
                body.${BODY_CLASS} #btnLoad {
                    padding: .5rem .65rem;
                    font-size: .85rem;
                }
                body.${BODY_CLASS} .table thead th,
                body.${BODY_CLASS} .table td {
                    padding: .45rem .5rem;
                    font-size: .85rem;
                }
                body.${BODY_CLASS} .ulab-sched-row { font-size: .82rem; gap: 5px; flex-wrap: wrap; }
                body.${BODY_CLASS} .ulab-sched-day { font-size: .7rem; padding: 1px 5px; }
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

    // Multi-meeting schedules render as one run-on string — e.g.
    // "TUE PB103 10:50AM-12:10PM KTH PB103 12:15PM- 1:35PM KTH" (a 2-period
    // lab, same day/room/instructor, back to back) — with no separator
    // between the two class periods. Splits it into one line per meeting;
    // a meeting with no leading day code (a continuation on the same day,
    // like the second segment above) inherits the last day seen.
    const SCHEDULE_MEETING_RE = /((?:[A-Z]{3}(?:,[A-Z]{3})*)?)\s*([A-Za-z0-9]*)\s*(\d{1,2}:\d{2})\s*([AP]M)\s*-\s*(\d{1,2}:\d{2})\s*([AP]M)\s*([A-Za-z]*)/g;

    function parseScheduleMeetings(raw) {
        const meetings = [];
        let lastDays = '';
        SCHEDULE_MEETING_RE.lastIndex = 0;
        let m;
        while ((m = SCHEDULE_MEETING_RE.exec(raw)) !== null) {
            const days = m[1] || lastDays;
            if (m[1]) lastDays = m[1];
            if (!m[3] || !m[5]) continue; // malformed match — skip rather than render garbage
            meetings.push({
                days,
                room: m[2] || '',
                start: `${m[3]}${m[4]}`,
                end: `${m[5]}${m[6]}`,
                instructor: m[7] || '',
            });
        }
        return meetings;
    }

    function formatScheduleCellForRow(row, scheduleIdx) {
        if (row.dataset.ulabSchedFormatted || row.cells.length <= scheduleIdx) return;
        row.dataset.ulabSchedFormatted = 'true';
        const cell = row.cells[scheduleIdx];
        const raw = cell.textContent.replace(/\s+/g, ' ').trim();
        if (!raw) return;
        const meetings = parseScheduleMeetings(raw);
        if (!meetings.length) return; // couldn't confidently parse — leave the original text alone
        cell.classList.add('ulab-sched-cell');
        cell.innerHTML = meetings.map(mt => `<div class="ulab-sched-row">
            <span class="ulab-sched-day">${mt.days || '—'}</span>
            <span class="ulab-sched-time">${mt.start}–${mt.end}</span>
            <span class="ulab-sched-room">${mt.room}${mt.instructor ? ' · ' + mt.instructor : ''}</span>
        </div>`).join('');
    }

    function findScheduleColumnIndex(table) {
        const headerRow = (table.tHead && table.tHead.rows[0]) || table.rows[0];
        if (!headerRow) return -1;
        const headers = Array.from(headerRow.cells).map(c => c.textContent.trim().toLowerCase());
        return headers.findIndex(h => h === 'schedule');
    }

    function watchCourseTable(table) {
        if (table.dataset.ulabTitleWatch) return;
        const { headerRow, idx: courseIdx } = findCourseIdColumnIndex(table);
        if (!headerRow || courseIdx === -1) return;
        table.dataset.ulabTitleWatch = 'true';

        const titleTh = document.createElement('th');
        titleTh.textContent = 'Title';
        headerRow.cells[courseIdx].after(titleTh);

        // Schedule column index is read once, before the Title <th> above
        // shifts every later column's position by one — re-reading it per
        // row would find the wrong cell.
        const scheduleIdx = findScheduleColumnIndex(table);

        const body = table.tBodies[0] || table;
        Array.from(body.rows).forEach((row) => {
            if (row === headerRow) return;
            insertTitleCellForRow(row, courseIdx);
            if (scheduleIdx !== -1) formatScheduleCellForRow(row, scheduleIdx);
        });

        new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                m.addedNodes.forEach((node) => {
                    if (node.nodeType !== 1 || node.tagName !== 'TR') return;
                    insertTitleCellForRow(node, courseIdx);
                    if (scheduleIdx !== -1) formatScheduleCellForRow(node, scheduleIdx);
                });
            });
        }).observe(body, { childList: true });
    }

    // The "Schedule for <course>" table shown after clicking a course's edit
    // (pencil) icon — see #scheduleTable in features/advising/advising.js's
    // #T1/#T4 id-collision fix — is a different shape (Schedule / Section /
    // Capacity / Remaining / Select, no CourseID column), so it never
    // matches isUnenhancedCourseTable above. It gets the same schedule-text
    // reformatting but no Title column (the heading above it already names
    // the course).
    function isUnenhancedSectionListTable(table) {
        if (!table || table.dataset.ulabSchedWatch) return false;
        const headerRow = (table.tHead && table.tHead.rows[0]) || table.rows[0];
        if (!headerRow) return false;
        const headers = Array.from(headerRow.cells).map(c => c.textContent.trim().toLowerCase());
        // #T5's actual headers are abbreviated ("Sec", "Cap.") rather than
        // the full "Section"/"Capacity" this originally checked for — that
        // mismatch meant this table was never being detected at all, so
        // none of the JS below (schedule formatting, sticky header) ever
        // ran on it.
        return headers.includes('schedule')
            && headers.some(h => h === 'section' || h === 'sec')
            && headers.some(h => h === 'capacity' || h === 'cap' || h === 'cap.')
            && !headers.some(h => h === 'courseid' || h === 'course');
    }

    // Native CSS position:sticky on the header is unreliable here: #T5's
    // header is a <tr class="d-flex"> — a flex row sitting inside a real
    // <table>/<tbody> (display:table-row-group), a non-standard mix that
    // browsers only approximate the layout of. Sticky positioning on
    // either the row or its th flex-items was tried and didn't actually
    // stick in testing. This replicates sticky manually instead: listen
    // for scroll on the nearest overflow:auto ancestor (#A) and translate
    // the header row down by the scrolled amount every time — a technique
    // that works regardless of the surrounding layout's quirks, since
    // `transform` doesn't depend on any table/flex positioning behavior.
    function pinDFlexHeader(table, headerRow) {
        if (!headerRow.classList.contains('d-flex') || headerRow.dataset.ulabPinned) return;
        let scrollParent = table.parentElement;
        while (scrollParent && scrollParent !== document.body) {
            const overflowY = getComputedStyle(scrollParent).overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll') break;
            scrollParent = scrollParent.parentElement;
        }
        if (!scrollParent || scrollParent === document.body) return;
        headerRow.dataset.ulabPinned = 'true';
        headerRow.style.position = 'relative';
        headerRow.style.zIndex = '3';
        headerRow.style.background = '#f8fafc';
        headerRow.style.willChange = 'transform';
        const reposition = () => {
            headerRow.style.transform = `translateY(${scrollParent.scrollTop}px)`;
        };
        scrollParent.addEventListener('scroll', reposition, { passive: true });
        reposition();
    }

    function watchSectionListTable(table) {
        if (table.dataset.ulabSchedWatch) return;
        const scheduleIdx = findScheduleColumnIndex(table);
        if (scheduleIdx === -1) return;
        table.dataset.ulabSchedWatch = 'true';

        const headerRow = (table.tHead && table.tHead.rows[0]) || table.rows[0];
        if (headerRow) pinDFlexHeader(table, headerRow);
        const body = table.tBodies[table.tBodies.length - 1] || table;
        Array.from(body.rows).forEach((row) => {
            if (row !== headerRow) formatScheduleCellForRow(row, scheduleIdx);
        });

        new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                m.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.tagName === 'TR') formatScheduleCellForRow(node, scheduleIdx);
                });
            });
        }).observe(body, { childList: true });
    }

    function scanForCourseTables(root) {
        if (!root.querySelectorAll) return;
        root.querySelectorAll('table').forEach((table) => {
            if (isUnenhancedCourseTable(table)) watchCourseTable(table);
            else if (isUnenhancedSectionListTable(table)) watchSectionListTable(table);
        });
    }

    // Modernize the action icons — these are server-rendered
    // <svg class="bi ..."><use href="/images/bootstrap-icons.svg#x"></use></svg>
    // elements with an inline onclick (AddCourseSectionSelection/
    // LoadScheduleFromT6/deleteRowN). Only the inner content is replaced
    // (a solid 24x24 path swapped in for the <use> sprite reference) — the
    // outer <svg> element itself, and everything on it (onclick, class,
    // width/height, fill="currentColor" for the text-danger/text-primary/
    // text-muted color classes already on it), is left completely alone,
    // so no click behavior is touched, only the glyph drawn inside it.
    const ICON_REPLACEMENTS = {
        // Heroicons "x-mark" solid — used for the T5 section-list
        // add/remove-selection toggle.
        x: '<path fill-rule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/>',
        // Same glyph for the x-square delete icon — a plain X reads clearer
        // for "remove this row" than the boxed version did.
        'x-square': '<path fill-rule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/>',
        // Heroicons "pencil-square" solid — edit/load-schedule icon.
        'pencil-square': '<path d="M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32l8.4-8.4Z"/><path d="M5.25 5.25a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3V13.5a.75.75 0 0 0-1.5 0v5.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V8.25a1.5 1.5 0 0 1 1.5-1.5h5.25a.75.75 0 0 0 0-1.5H5.25Z"/>',
    };

    function modernizeIcon(svg) {
        if (svg.dataset.ulabIconModernized) return;
        const use = svg.querySelector('use');
        if (!use) return;
        const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
        const name = href.split('#')[1];
        const replacement = name && ICON_REPLACEMENTS[name];
        if (!replacement) return;
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.innerHTML = replacement;
        svg.dataset.ulabIconModernized = 'true';
    }

    function modernizeIconsIn(root) {
        if (!root.querySelectorAll) return;
        // A newly-added icon can land either as a descendant of the added
        // node (the common case — a whole row/cell inserted at once) or as
        // the added node itself (querySelectorAll only searches
        // descendants, so check root directly too).
        if (root.matches && root.matches('svg.bi')) modernizeIcon(root);
        root.querySelectorAll('svg.bi').forEach(modernizeIcon);
    }

    // Catch tables already on the page (main "Courses to be Registered" /
    // history tables) plus any injected later — e.g. into the "Load Courses
    // to Add" modal, or the "Schedule for <course>" section-list panel,
    // once their content loads. Panel boundaries for that modal's
    // "Courses to be registered" / "Schedule for X" sections are handled
    // entirely by CSS now (#tempCourseListDiv / #tempCourseSchedule —
    // confirmed real, stable ids from the actual rendered markup), no JS
    // needed — an earlier text-matching approach here proved unreliable
    // (tagged one panel but silently missed the other) and was removed.
    function initCourseTitleWatchers() {
        scanForCourseTables(document);
        modernizeIconsIn(document);
        new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                m.addedNodes.forEach((node) => {
                    if (node.nodeType !== 1) return;
                    if (node.tagName === 'TABLE') {
                        if (isUnenhancedCourseTable(node)) watchCourseTable(node);
                        else if (isUnenhancedSectionListTable(node)) watchSectionListTable(node);
                    } else {
                        scanForCourseTables(node);
                    }
                    modernizeIconsIn(node);
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
