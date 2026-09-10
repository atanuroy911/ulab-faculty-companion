// features/classroom/gc-content.js — runs on Google Drive folder pages.
// Scans the file-list table for rows, pulls the student name/ID out of the
// "Modified" column Drive already renders, then for each row: selects it,
// simulates a click on Drive's own per-row "Download" button (so Drive does
// exactly what it would for a manual download — including exporting native
// Google Docs/Sheets/Slides to their default format), and asks the
// background service worker to rename the resulting download as it lands.
(function () {
    if (window.__ulabClassroomInjected) return;
    window.__ulabClassroomInjected = true;

    function sanitize(name) {
        return (name || '').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80);
    }

    function waitFor(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Parses "Modified Aug 16 Md. Mithu Alam (241014022)" (or similar,
    // whatever locale/format Drive renders) → { name, id, date }. The
    // leading date fragment is kept (sanitized) for use in the filename,
    // not displayed anywhere as "modified by" text.
    function parseModifiedBy(text) {
        if (!text) return null;
        const m = text.match(/\(([^()]+)\)\s*$/);
        if (!m) return null;
        const id = m[1].trim();
        let namePart = text.slice(0, m.index).trim();
        let date = null;
        const dateMatch = namePart.match(/^([A-Za-z]{3,9}\s+\d{1,2},?)\s*|^(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\s*|^(\d{1,2}\s+[A-Za-z]{3,9})\s*/);
        if (dateMatch) {
            date = (dateMatch[1] || dateMatch[2] || dateMatch[3]).replace(/,$/, '').trim();
            namePart = namePart.slice(dateMatch[0].length).trim();
        }
        if (!namePart) return null;
        return { name: namePart.trim(), id, date };
    }

    function findRows() {
        return Array.from(document.querySelectorAll('tr[data-id]'));
    }

    function extractRowInfo(tr) {
        const fileId = tr.getAttribute('data-id');
        if (!fileId) return null;

        const nameEl = tr.querySelector('[data-column-field="6"] .DNoYtb, [data-column-field="6"] strong');
        const fileName = nameEl ? nameEl.textContent.trim() : null;

        const modifiedCell = tr.querySelector('[data-column-field="5"] .YY3N9 .a65Cwf, [data-column-field="5"] .a65Cwf');
        let student = null;
        if (modifiedCell) {
            student = parseModifiedBy(modifiedCell.textContent.trim());
        }
        if (!student) {
            const labelEl = tr.querySelector('[data-column-field="5"] [aria-label]');
            if (labelEl) student = parseModifiedBy(labelEl.getAttribute('aria-label'));
        }

        return { tr, fileId, fileName, student };
    }

    function scan() {
        return findRows().map(extractRowInfo).filter(r => r && r.fileId && r.fileName);
    }

    // ── Drive interaction: select the row, then click its own Download btn ──
    function dispatchClick(el) {
        ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) => {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        });
    }

    function clickDownloadButton(tr) {
        const btn = tr.querySelector('button[aria-label="Download"]');
        if (!btn) return false;
        dispatchClick(btn);
        return true;
    }

    let pendingDownloadResolve = null;
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'gcDownloadComplete' && pendingDownloadResolve) {
            const resolve = pendingDownloadResolve;
            pendingDownloadResolve = null;
            resolve(msg);
        }
    });

    const DOWNLOAD_TIMEOUT_MS = 25000;

    async function downloadOneViaButton(row) {
        const baseName = row.student
            ? [row.student.id, row.student.name, row.student.date].filter(Boolean).map(sanitize).join('_')
            : sanitize(row.fileName.replace(/\.[^.]+$/, ''));

        // Select the row so Drive renders/attaches its per-row action toolbar.
        dispatchClick(row.tr);
        await waitFor(250);

        await chrome.runtime.sendMessage({ action: 'gcExpectDownload', baseName });

        const waitForCompletion = new Promise((resolve) => { pendingDownloadResolve = resolve; });

        const clicked = clickDownloadButton(row.tr);
        if (!clicked) {
            pendingDownloadResolve = null;
            throw new Error('Download button not found — is this row still visible?');
        }

        const result = await Promise.race([
            waitForCompletion,
            waitFor(DOWNLOAD_TIMEOUT_MS).then(() => ({ ok: false, error: 'Timed out waiting for download' })),
        ]);

        if (!result.ok) throw new Error(result.error || 'Download did not complete');
        return baseName;
    }

    // ── Floating panel UI ───────────────────────────────────────────────
    function buildPanel() {
        const fab = document.createElement('button');
        fab.id = 'ulab-gc-fab';
        fab.title = 'ULAB Faculty Companion — Download & Rename submissions';
        fab.textContent = '📥';
        document.body.appendChild(fab);

        const panel = document.createElement('div');
        panel.id = 'ulab-gc-panel';
        panel.hidden = true;
        panel.innerHTML = `
            <div id="ulab-gc-header">
                <span>📥 Download &amp; Rename</span>
                <button id="ulab-gc-collapse" title="Close">×</button>
            </div>
            <div id="ulab-gc-body">
                <button id="ulab-gc-scan" class="ulab-gc-btn">Scan Folder</button>
                <button id="ulab-gc-download" class="ulab-gc-btn ulab-gc-btn-primary" disabled>Download All</button>
                <div id="ulab-gc-progress-wrap">
                    <div id="ulab-gc-progress-bar"></div>
                </div>
                <div id="ulab-gc-progress-label"></div>
                <div id="ulab-gc-list"></div>
            </div>
        `;
        document.body.appendChild(panel);

        fab.addEventListener('click', () => {
            panel.hidden = !panel.hidden;
            fab.classList.toggle('ulab-gc-fab-active', !panel.hidden);
        });

        let rows = [];

        const listEl = panel.querySelector('#ulab-gc-list');
        const downloadBtn = panel.querySelector('#ulab-gc-download');
        const scanBtn = panel.querySelector('#ulab-gc-scan');
        const progressWrap = panel.querySelector('#ulab-gc-progress-wrap');
        const progressBar = panel.querySelector('#ulab-gc-progress-bar');
        const progressLabel = panel.querySelector('#ulab-gc-progress-label');

        function setProgress(done, total) {
            if (!total) {
                progressWrap.style.display = 'none';
                progressLabel.style.display = 'none';
                return;
            }
            progressWrap.style.display = '';
            progressLabel.style.display = '';
            progressBar.style.width = `${Math.round((done / total) * 100)}%`;
            progressLabel.textContent = `${done} / ${total} downloaded`;
        }

        function renderList() {
            if (!rows.length) {
                listEl.innerHTML = '<div class="ulab-gc-empty">No files scanned yet.</div>';
                return;
            }
            listEl.innerHTML = rows.map((r, i) => `
                <div class="ulab-gc-row" id="ulab-gc-row-${i}">
                    <span class="ulab-gc-status">⏳</span>
                    <span class="ulab-gc-name">${r.student ? [r.student.id, r.student.name, r.student.date].filter(Boolean).join('_') : '⚠️ ' + r.fileName}</span>
                </div>
            `).join('');
        }

        function setRowStatus(i, icon, title) {
            const row = panel.querySelector(`#ulab-gc-row-${i} .ulab-gc-status`);
            if (row) { row.textContent = icon; if (title) row.title = title; }
        }

        scanBtn.addEventListener('click', () => {
            rows = scan();
            renderList();
            downloadBtn.disabled = rows.length === 0;
            setProgress(0, 0);
        });

        downloadBtn.addEventListener('click', async () => {
            downloadBtn.disabled = true;
            scanBtn.disabled = true;
            setProgress(0, rows.length);
            for (let i = 0; i < rows.length; i++) {
                setRowStatus(i, '⬇️');
                try {
                    await downloadOneViaButton(rows[i]);
                    setRowStatus(i, '✅');
                } catch (err) {
                    setRowStatus(i, '❌', err.message);
                }
                setProgress(i + 1, rows.length);
                await waitFor(300);
            }
            downloadBtn.disabled = false;
            scanBtn.disabled = false;
        });

        panel.querySelector('#ulab-gc-collapse').addEventListener('click', () => {
            panel.hidden = true;
            fab.classList.remove('ulab-gc-fab-active');
        });

        renderList();
        setProgress(0, 0);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildPanel);
    } else {
        buildPanel();
    }
})();
