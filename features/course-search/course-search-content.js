// features/course-search/course-search-content.js — runs on the URMS
// StudentRegistration page. URMS's own "Search with Course Code" boxes
// (inline onkeyup="searchCourses('inputId','tableId',colIndex)") only match
// against the course-code column. This replaces that behavior with a filter
// that matches against both the course-code column and the course-name
// column (assumed to be the next column over), so staff can search by
// course name too.
(function () {
    const PATCHED_ATTR = 'data-ulab-course-search-patched';

    function filterTable(tableId, codeColIndex, term) {
        const table = document.getElementById(tableId);
        if (!table) return;
        const needle = term.trim().toLowerCase();
        const nameColIndex = codeColIndex + 1;

        Array.from(table.rows).forEach((row) => {
            if (row.querySelector('th')) return; // header row
            const cells = row.cells;
            if (!cells || cells.length <= codeColIndex) return;
            const code = (cells[codeColIndex].textContent || '').toLowerCase();
            const name = cells.length > nameColIndex ? (cells[nameColIndex].textContent || '').toLowerCase() : '';
            row.style.display = (!needle || code.includes(needle) || name.includes(needle)) ? '' : 'none';
        });
    }

    function patchInput(input) {
        if (input.hasAttribute(PATCHED_ATTR)) return;
        const onkeyup = input.getAttribute('onkeyup') || '';
        const m = onkeyup.match(/searchCourses\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(\d+)\s*\)/);
        if (!m) return;

        const [, inputId, tableId, colIndexStr] = m;
        const colIndex = parseInt(colIndexStr, 10);

        input.setAttribute(PATCHED_ATTR, '1');
        input.removeAttribute('onkeyup');
        input.placeholder = 'Search by course code or name';
        input.addEventListener('keyup', () => filterTable(tableId, colIndex, input.value));
    }

    function scan() {
        document.querySelectorAll('input[onkeyup*="searchCourses("]').forEach(patchInput);
    }

    scan();
    // Course-search boxes live inside modals that get re-rendered/reopened
    // via AJAX without a full page navigation — keep watching.
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
