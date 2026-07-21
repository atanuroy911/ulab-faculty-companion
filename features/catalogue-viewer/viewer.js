// viewer.js — loaded inside features/catalogue-viewer/viewer.html
(function () {
    const tbody = document.getElementById('cat-body');
    const programSelect = document.getElementById('program-select');
    const programs = window.ULAB_PROGRAMS || [];

    if (!programs.length || !window.ULAB_CATALOGUES) {
        document.getElementById('summary-text').textContent = 'Catalogue data failed to load.';
        return;
    }

    programSelect.innerHTML = programs.map(p => `<option value="${p.id}">${p.icon} ${p.short}</option>`).join('');

    function prereqChips(cat, course) {
        if (!course.prereq.length) return `<span class="none-label">none</span>`;
        return course.prereq.map(code => {
            const c = cat.byCode[code];
            return `<span class="prereq-chip">${code}${c ? ' — ' + c.title : ''}</span>`;
        }).join(' ');
    }

    function labChip(cat, course) {
        const theory = cat.theoryForLab(course.unescoCode);
        if (!theory) return `<span class="none-label">—</span>`;
        return `<span class="lab-chip">${theory.code} — ${theory.title}</span>`;
    }

    function renderRows(cat, list) {
        tbody.innerHTML = list.map(c => `
            <tr data-search="${(c.code + ' ' + c.unescoCode + ' ' + c.title).toLowerCase()}">
                <td class="code-cell">${c.code}</td>
                <td class="unesco-cell">${c.unescoCode}</td>
                <td>${c.title}</td>
                <td>${prereqChips(cat, c)}</td>
                <td>${labChip(cat, c)}</td>
            </tr>
        `).join('');
    }

    function loadProgram(id) {
        const cat = window.ULAB_CATALOGUES[id];
        if (!cat) {
            document.getElementById('summary-text').textContent = 'Catalogue data failed to load for this program.';
            tbody.innerHTML = '';
            return;
        }
        const courses = cat.courses;
        document.getElementById('summary-text').textContent = `${courses.length} courses transcribed from the catalogue.`;
        renderRows(cat, courses);
        const q = document.getElementById('search').value.toLowerCase().trim();
        if (q) filterRows(q);
    }

    function filterRows(q) {
        document.querySelectorAll('#cat-body tr').forEach(tr => {
            tr.style.display = !q || tr.dataset.search.includes(q) ? '' : 'none';
        });
    }

    programSelect.addEventListener('change', () => loadProgram(programSelect.value));
    loadProgram(programSelect.value);

    document.getElementById('search').addEventListener('input', function () {
        filterRows(this.value.toLowerCase().trim());
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
