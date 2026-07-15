// viewer.js — loaded inside features/catalogue-viewer/viewer.html
(function () {
    const cat = window.ULAB_CATALOGUE;
    const tbody = document.getElementById('cat-body');

    if (!cat) {
        document.getElementById('summary-text').textContent = 'Catalogue data failed to load.';
        return;
    }

    const courses = cat.courses;
    document.getElementById('summary-text').textContent = `${courses.length} courses transcribed from the catalogue.`;

    function prereqChips(course) {
        if (!course.prereq.length) return `<span class="none-label">none</span>`;
        return course.prereq.map(code => {
            const c = cat.byCode[code];
            return `<span class="prereq-chip">${code}${c ? ' — ' + c.title : ''}</span>`;
        }).join(' ');
    }

    function labChip(course) {
        const theory = cat.theoryForLab(course.unescoCode);
        if (!theory) return `<span class="none-label">—</span>`;
        return `<span class="lab-chip">${theory.code} — ${theory.title}</span>`;
    }

    function renderRows(list) {
        tbody.innerHTML = list.map(c => `
            <tr data-search="${(c.code + ' ' + c.unescoCode + ' ' + c.title).toLowerCase()}">
                <td class="code-cell">${c.code}</td>
                <td class="unesco-cell">${c.unescoCode}</td>
                <td>${c.title}</td>
                <td>${prereqChips(c)}</td>
                <td>${labChip(c)}</td>
            </tr>
        `).join('');
    }

    renderRows(courses);

    document.getElementById('search').addEventListener('input', function () {
        const q = this.value.toLowerCase().trim();
        document.querySelectorAll('#cat-body tr').forEach(tr => {
            tr.style.display = !q || tr.dataset.search.includes(q) ? '' : 'none';
        });
    });

    const htmlEl = document.documentElement;
    const lbl = document.getElementById('toggle-label');
    const saved = localStorage.getItem('ulab-theme') || 'light';
    applyTheme(saved);
    document.getElementById('theme-toggle').addEventListener('click', () => {
        applyTheme(htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
    function applyTheme(t) {
        htmlEl.setAttribute('data-theme', t);
        localStorage.setItem('ulab-theme', t);
        lbl.textContent = t === 'dark' ? 'Light mode' : 'Dark mode';
    }
})();
