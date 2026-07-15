// results.js — loaded inside features/bulk-save/results.html (chrome-extension page)
chrome.storage.local.get(['ulabBulkSaveResults'], (data) => {
    const results = data.ulabBulkSaveResults || [];

    if (!results.length) {
        document.body.innerHTML = `
            <div style="color:#94a3b8;text-align:center;margin-top:120px;font-family:system-ui">
                <div style="font-size:48px;margin-bottom:16px">📭</div>
                <div style="font-size:20px;font-weight:600;color:#e2e8f0;margin-bottom:8px">No results yet</div>
                <div>Run <strong style="color:#38bdf8">Bulk Save</strong> from the side panel first.</div>
            </div>`;
        return;
    }

    const saved = results.filter(r => r.status === 'saved').length;
    const failed = results.filter(r => r.status === 'failed' || r.status === 'error').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const unconfirmed = results.filter(r => r.status === 'unconfirmed').length;

    document.getElementById('summary-text').textContent =
        `${results.length} student(s) processed — ${saved} saved, ${failed} failed, ${skipped} skipped, ${unconfirmed} unconfirmed.`;
    document.getElementById('stat-saved').textContent = saved;
    document.getElementById('stat-failed').textContent = failed;
    document.getElementById('stat-skipped').textContent = skipped;
    document.getElementById('stat-unconfirmed').textContent = unconfirmed;

    const tbody = document.getElementById('report-body');
    for (const r of results) {
        const tr = document.createElement('tr');
        const coursesHTML = (r.courses || []).length
            ? `<div class="courses-list">${r.courses.map(c => c.course).join(', ')}</div>`
            : '';
        tr.innerHTML = `
            <td>${r.id}</td>
            <td>${r.name || '—'}</td>
            <td><span class="status-pill status-${r.status}">${r.status}</span></td>
            <td>${r.detail || ''}${coursesHTML}</td>
        `;
        tbody.appendChild(tr);
    }

    document.getElementById('btn-export-csv').addEventListener('click', () => {
        const headers = ['Student ID', 'Name', 'Status', 'Detail', 'Courses'];
        const rows = [headers];
        for (const r of results) {
            rows.push([r.id, r.name || '', r.status, r.detail || '', (r.courses || []).map(c => c.course).join('; ')]);
        }
        const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bulk-save-report.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    });

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
