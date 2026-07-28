// results.js — loaded inside features/capstone-eligibility/results.html (chrome-extension page)
chrome.storage.local.get(['ulabCapstoneResults'], (data) => {
    const results = data.ulabCapstoneResults || [];

    if (!results.length) {
        document.body.innerHTML = `
            <div style="color:#94a3b8;text-align:center;margin-top:120px;font-family:system-ui">
                <div style="font-size:48px;margin-bottom:16px">📭</div>
                <div style="font-size:20px;font-weight:600;color:#e2e8f0;margin-bottom:8px">No results yet</div>
                <div>Run <strong style="color:#38bdf8">Capstone Eligibility</strong> from the side panel first.</div>
            </div>`;
        return;
    }

    const GATING_COURSES = ['CSE2200', 'CSE3103', 'CSE3200', 'CSE3203'];

    const eligible = results.filter(r => r.eligibility === 'Eligible').length;
    const notEligible = results.filter(r => r.eligibility === 'Not Eligible').length;
    const errored = results.filter(r => r.error).length;

    document.getElementById('summary-text').textContent =
        `${results.length} student(s) checked — ${eligible} eligible, ${notEligible} not eligible${errored ? `, ${errored} error(s)` : ''}.`;
    document.getElementById('stat-eligible').textContent = eligible;
    document.getElementById('stat-not-eligible').textContent = notEligible;
    document.getElementById('stat-error').textContent = errored;

    function coursePillClass(status) {
        if (status === 'Passed') return 'course-passed';
        if (status === 'Taken') return 'course-taken';
        return 'course-not-completed';
    }

    function histClass(status) {
        return 'hist-' + status.toLowerCase().replace(/\s+/g, '-');
    }

    function buildDetailBodyHTML(r) {
        const explanationHTML = (r.explanation || []).map(line => `<div>${line}</div>`).join('');
        const historyRows = (r.courseHistory || []).map(c => `
            <tr class="${c.isGating ? 'gating-row' : ''} ${c.isExtra ? 'extra-row' : ''}">
                <td>${c.semester || '—'}</td>
                <td>${c.courseId}</td>
                <td>${c.title || '—'}</td>
                <td>${c.credit}</td>
                <td>${c.grade || '—'}</td>
                <td class="${histClass(c.status)}">${c.status}</td>
            </tr>
        `).join('');

        return `
            <div class="detail-explanation">${explanationHTML}</div>
            <div class="detail-history-wrap">
                <table class="detail-history">
                    <thead><tr><th>Semester</th><th>Course</th><th>Title</th><th>Credit</th><th>Grade</th><th>Status</th></tr></thead>
                    <tbody>${historyRows || '<tr><td colspan="6">No course history found.</td></tr>'}</tbody>
                </table>
            </div>
        `;
    }

    function openDetailModal(r) {
        const eligClass = r.error ? 'status-error' : (r.eligibility === 'Eligible' ? 'status-eligible' : 'status-not-eligible');
        const eligLabel = r.error ? 'Error' : r.eligibility;
        document.getElementById('modal-title').textContent = r.name || r.id;
        document.getElementById('modal-subtitle').innerHTML =
            `${r.id} · <span class="status-pill ${eligClass}" style="margin-left:4px">${eligLabel}</span>`;
        document.getElementById('modal-body').innerHTML = r.error
            ? `<div class="detail-explanation">${r.error}</div>`
            : buildDetailBodyHTML(r);
        document.getElementById('modal-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeDetailModal() {
        document.getElementById('modal-overlay').classList.remove('open');
        document.body.style.overflow = '';
    }

    document.getElementById('modal-close').addEventListener('click', closeDetailModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal-overlay')) closeDetailModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('modal-overlay').classList.contains('open')) closeDetailModal();
    });

    const tbody = document.getElementById('report-body');
    let rowCounter = 0;
    for (const r of results) {
        const tr = document.createElement('tr');
        tr.className = 'data-row' + (rowCounter++ % 2 === 0 ? ' row-odd' : '');

        if (r.error) {
            tr.innerHTML = `
                <td><button class="expand-btn" title="Show details">▶</button></td>
                <td>${r.id}</td>
                <td>${r.name || '—'}</td>
                <td><span class="status-pill status-error">Error</span></td>
                <td colspan="10">${r.error}</td>
            `;
            tr.addEventListener('click', () => openDetailModal(r));
            tbody.appendChild(tr);
            continue;
        }

        const cs = r.courseStatus || {};
        const coursesHTML = GATING_COURSES.map(code =>
            `<td><span class="course-pill ${coursePillClass(cs[code])}">${cs[code] || '—'}</span></td>`
        ).join('');
        const eligClass = r.eligibility === 'Eligible' ? 'status-eligible' : 'status-not-eligible';
        const extra = (r.extraCourses || []).join(', ');

        tr.innerHTML = `
            <td><button class="expand-btn" title="Show course details">▶</button></td>
            <td>${r.id}</td>
            <td>${r.name || '—'}</td>
            <td><span class="status-pill ${eligClass}">${r.eligibility}</span></td>
            ${coursesHTML}
            <td>${r.earnedCredit ?? ''}</td>
            <td>${r.currentCredit ?? ''}</td>
            <td>${r.totalCredit ?? ''}</td>
            <td>${r.email || ''}</td>
            <td>${r.mobile || ''}</td>
            <td class="extra-courses">${extra}</td>
        `;
        tbody.appendChild(tr);
        tr.addEventListener('click', () => openDetailModal(r));
    }

    const HEADERS = [
        'Student ID', 'Name', 'Eligibility', 'CSE2200', 'CSE3103', 'CSE3200', 'CSE3203',
        'Earned Credit', 'Current Credit', 'Total Credit', 'Email', 'Mobile', 'Extra Courses',
    ];

    function rowValues(r) {
        if (r.error) return [r.id, r.name || '', 'Error', '', '', '', '', '', '', '', '', '', r.error];
        const cs = r.courseStatus || {};
        return [
            r.id, r.name || '', r.eligibility,
            cs.CSE2200 || '', cs.CSE3103 || '', cs.CSE3200 || '', cs.CSE3203 || '',
            r.earnedCredit ?? '', r.currentCredit ?? '', r.totalCredit ?? '',
            r.email || '', r.mobile || '', (r.extraCourses || []).join(', '),
        ];
    }

    document.getElementById('btn-export-csv').addEventListener('click', () => {
        const rows = [HEADERS, ...results.map(rowValues)];
        const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, 'capstone-eligibility-report.csv');
    });

    document.getElementById('btn-export-xlsx').addEventListener('click', () => {
        const rows = [HEADERS, ...results.map(rowValues)];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
            { wch: 12 }, { wch: 26 }, { wch: 13 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
            { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 40 },
        ];

        const GREEN = { fgColor: { rgb: '92D050' } };
        const YELLOW = { fgColor: { rgb: 'FFD319' } };
        const headerFont = { bold: true };
        for (let c = 0; c < HEADERS.length; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
            if (cell) cell.s = { font: headerFont };
        }

        results.forEach((r, i) => {
            const rowIdx = i + 1;
            const eligCell = ws[XLSX.utils.encode_cell({ r: rowIdx, c: 2 })];
            if (!eligCell) return;
            eligCell.s = { font: { bold: true }, fill: r.eligibility === 'Eligible' ? GREEN : YELLOW };

            if (r.eligibility !== 'Eligible' && !r.error) {
                const cs = r.courseStatus || {};
                GATING_COURSES.forEach((code, idx) => {
                    if (cs[code] === 'Not Completed') {
                        const cell = ws[XLSX.utils.encode_cell({ r: rowIdx, c: 3 + idx })];
                        if (cell) cell.s = { fill: YELLOW };
                    }
                });
                if ((r.totalCredit || 0) < 105) {
                    const cell = ws[XLSX.utils.encode_cell({ r: rowIdx, c: 9 })];
                    if (cell) cell.s = { fill: YELLOW };
                }
            }
        });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Capstone Eligibility');
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        downloadBlob(blob, 'Capstone Eligibility.xlsx');
    });

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    const htmlEl = document.documentElement;
    const lbl = document.getElementById('toggle-label');
    const savedTheme = localStorage.getItem('ulab-theme') || 'light';
    applyTheme(savedTheme);
    document.getElementById('theme-toggle').addEventListener('click', () => {
        applyTheme(htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
    function applyTheme(t) {
        htmlEl.setAttribute('data-theme', t);
        localStorage.setItem('ulab-theme', t);
        lbl.textContent = t === 'dark' ? 'Light mode' : 'Dark mode';
    }
});
