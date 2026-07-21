// features/bulk-save/bulk-save.js — Bulk Save feature module.
//
// For every pasted student, this loads their AddAndDrop page (same call the
// Time/Advising features already make) and then replays exactly what
// clicking the page's own "Save" button does: submits the currently-staged
// Course/Section/CourseCredit rows back to URMS, using the live hidden-field
// values scraped from that same response (RegDateString, IsCreditBased,
// FineAmount, etc. are per-student/per-semester values baked into the page —
// never guessed or hardcoded here).
//
// This WRITES to real student registration records. It does not add, remove,
// or edit any course — it only confirms what's already staged on the
// student's own page, per design. There is no per-student pause once
// started; the one deliberate gate is the "I understand" run button.
(function () {
    if (!document.getElementById('ulab-wizard-css')) {
        const link = document.createElement('link');
        link.id = 'ulab-wizard-css';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('features/common/wizard.css');
        document.head.appendChild(link);
    }

    let PARSED_STUDENTS = [];
    let root = null;

    function $(id) { return root.querySelector('#' + id); }

    // ── Step 1: Paste box (same list format as Student Advising) ───────────
    function showStep1() {
        root.innerHTML = `
            <div class="ulab-howto">
                <div class="ulab-howto-item">
                    <div class="ulab-howto-badge">1</div>
                    <div class="ulab-howto-body">
                        <div class="ulab-howto-title">Open the Advising Student page, then print it or save it as a PDF</div>
                        <a class="ulab-link-chip" href="https://urms-awp.ulab.edu.bd/AdvisingStudent" target="_blank" rel="noopener">
                            🔗 urms-awp.ulab.edu.bd/AdvisingStudent
                        </a>
                        <div class="ulab-howto-sub">Click <strong>Print</strong> on that page — either print it, or choose "Save as PDF" as the destination.</div>
                    </div>
                </div>
                <div class="ulab-howto-item">
                    <div class="ulab-howto-badge">2</div>
                    <div class="ulab-howto-body">
                        <div class="ulab-howto-title">Copy the printed table, or upload the saved PDF</div>
                        <div class="ulab-howto-sub">Select it all (Ctrl/Cmd+A), copy, then paste into the box below — or use the PDF upload option instead.</div>
                    </div>
                </div>
                <div class="ulab-howto-item">
                    <div class="ulab-howto-badge">3</div>
                    <div class="ulab-howto-body">
                        <div class="ulab-howto-title">Parse and run</div>
                        <div class="ulab-howto-sub">
                            Click <strong>Parse Students</strong>, then <strong>Run Bulk Save</strong> — each
                            student's currently staged registration is loaded and saved as-is; no courses
                            are added, removed, or changed by this tool.
                        </div>
                    </div>
                </div>
            </div>
            <div class="ulab-format-box">
                <div class="ulab-format-label">Expected format (one student per line)</div>
                <div class="ulab-format-example">1 253014001 Md. Minhajur Rahman minhajur.rahman.cse@ulab.edu.bd 1855533355 OK 20 Apr 2026 OK
2 253014002 Jannatul Ferduws jannatul.ferduws.cse@ulab.edu.bd 01932006166 OK 20 Apr 2026 OK</div>
            </div>
            <textarea id="ulab-paste-box" placeholder="Paste the Advising Student table here…"></textarea>
            <div id="ulab-parse-preview"></div>
            <div id="ulab-pdf-upload-slot"></div>
            <button class="ulab-primary-btn" id="ulab-step1-next">Parse Students →</button>
        `;
        $('ulab-step1-next').onclick = parseAndShowStep2;
        if (window.ulabMountPdfUpload) ulabMountPdfUpload($('ulab-pdf-upload-slot'), $('ulab-paste-box'));

        $('ulab-paste-box').addEventListener('input', () => {
            const text = $('ulab-paste-box').value;
            const students = parseAdvisingStudents(text);
            const preview = $('ulab-parse-preview');
            if (text.trim()) {
                preview.innerHTML = students.length
                    ? `<div class="ulab-preview-ok">✅ Found ${students.length} student(s) — click Parse to confirm</div>`
                    : `<div class="ulab-preview-warn">⚠️ No 9-digit Student IDs found yet. Keep pasting.</div>`;
            } else {
                preview.innerHTML = '';
            }
        });
    }

    function parseAdvisingStudents(text) {
        const emailRe = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/;
        const idRe = /\b(\d{9})\b/;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const students = [];

        for (const line of lines) {
            const idMatch = line.match(idRe);
            if (!idMatch) continue;
            const id = idMatch[1];
            const emailMatch = line.match(emailRe);
            const email = emailMatch ? emailMatch[0] : '';
            const nameSpan = emailMatch
                ? line.slice(idMatch.index + id.length, emailMatch.index)
                : line.slice(idMatch.index + id.length);
            const name = nameSpan.replace(/\s{2,}/g, ' ').trim();
            students.push({ id, name, email });
        }
        return students;
    }

    // ── Step 2: Confirm list, show warning, run ─────────────────────────────
    function parseAndShowStep2() {
        const text = $('ulab-paste-box').value;
        PARSED_STUDENTS = parseAdvisingStudents(text);
        if (PARSED_STUDENTS.length === 0) {
            $('ulab-parse-preview').innerHTML =
                `<div class="ulab-preview-warn">❌ No Student IDs found. Make sure you copied the full table.</div>`;
            return;
        }
        renderStep2();
    }

    function renderStep2() {
        const listHTML = PARSED_STUDENTS.map((s, i) => `
            <div class="ulab-student-row">
                <div class="ulab-student-idx">${i + 1}</div>
                <div class="ulab-student-details">
                    <input class="ulab-id-input"   value="${s.id}"   data-idx="${i}" placeholder="Student ID" maxlength="9" />
                    <input class="ulab-name-input" value="${s.name}" data-idx="${i}" placeholder="Name (optional)" />
                </div>
                <span class="ulab-row-status" id="ulab-row-status-${i}"></span>
                <button class="ulab-row-save-btn" data-idx="${i}" title="Save this student only">💾 Save</button>
                <button class="ulab-remove-btn" data-idx="${i}" title="Remove">✕</button>
            </div>
        `).join('');

        root.innerHTML = `
            <p class="ulab-step-desc">
                Found <strong>${PARSED_STUDENTS.length}</strong> students. Edit or remove any incorrect
                entries, or use each row's own <strong>💾 Save</strong> button to save just that student.
            </p>
            <div id="ulab-student-list">${listHTML}</div>
            <div class="ulab-info-box">
                💾 <strong>Run Bulk Save</strong> below clicks <strong>Save</strong> on every student's
                page for you, one after another — or save just one student at a time with the button
                next to their row. Either way, nothing is added, removed, or changed beyond what's
                already staged. It writes to real URMS records, so it's worth a quick look at the list
                before you start, but it's the same action you'd take by hand either way.
            </div>
            <label class="ulab-checkbox-row" style="display:flex;align-items:center;gap:8px;margin-top:10px">
                <input type="checkbox" id="ulab-email-bill-toggle" />
                <span>📧 Email the bill to each student right after their Save succeeds</span>
            </label>
            <div class="ulab-btn-row" style="margin-top:14px">
                <button class="ulab-secondary-btn" id="ulab-step2-back">← Back</button>
                <button class="ulab-primary-btn" id="ulab-step2-run">Run Bulk Save</button>
            </div>
            <div id="ulab-run-status"></div>
            <div id="ulab-run-log"></div>
        `;

        $('ulab-step2-back').onclick = showStep1;
        $('ulab-step2-run').onclick = runBulkSave;

        $('ulab-student-list').addEventListener('input', e => {
            const idx = parseInt(e.target.dataset.idx);
            if (e.target.classList.contains('ulab-id-input')) PARSED_STUDENTS[idx].id = e.target.value.trim();
            if (e.target.classList.contains('ulab-name-input')) PARSED_STUDENTS[idx].name = e.target.value.trim();
        });
        $('ulab-student-list').addEventListener('click', e => {
            if (e.target.classList.contains('ulab-remove-btn')) {
                const idx = parseInt(e.target.dataset.idx);
                PARSED_STUDENTS.splice(idx, 1);
                renderStep2();
                return;
            }
            if (e.target.classList.contains('ulab-row-save-btn')) {
                const idx = parseInt(e.target.dataset.idx);
                runSingleSave(idx, e.target);
            }
        });
    }

    function setRowStatus(idx, msg, cls) {
        const el = $('ulab-row-status-' + idx);
        if (el) { el.textContent = msg; el.className = `ulab-row-status ulab-row-status-${cls || ''}`; }
    }

    async function runSingleSave(idx, btn) {
        const s = PARSED_STUDENTS[idx];
        if (!s || !/^\d{9}$/.test(s.id)) {
            setRowStatus(idx, '❌ Invalid ID', 'fail');
            return;
        }
        const emailBillEnabled = $('ulab-email-bill-toggle') ? $('ulab-email-bill-toggle').checked : false;
        if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
        setRowStatus(idx, '⏳ Saving…', 'pending');

        const parser = new DOMParser();
        const BASE = 'https://urms-awp.ulab.edu.bd';

        try {
            const result = await saveOneStudent(s, { parser, BASE, emailBillEnabled });
            setRowStatus(idx, result.rowMsg, result.rowClass);
        } catch (err) {
            console.error('[ULAB Bulk Save]', s.id, err);
            setRowStatus(idx, `❌ ${err.message}`, 'fail');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '💾 Save'; }
        }
    }

    function setRunStatus(msg) {
        const el = $('ulab-run-status');
        if (el) el.innerHTML = `<div class="ulab-run-status-msg">${msg}</div>`;
    }

    function appendLog(sid, name, statusClass, msg) {
        const el = $('ulab-run-log');
        if (!el) return;
        const row = document.createElement('div');
        row.className = `ulab-log-row ulab-log-${statusClass}`;
        row.textContent = `${sid} ${name ? '(' + name + ')' : ''} — ${msg}`;
        el.appendChild(row);
        el.scrollTop = el.scrollHeight;
    }

    // ── Scrape a loaded AddAndDrop response for everything Save needs ──────
    function fieldValue(doc, id, fallback) {
        const el = doc.querySelector('#' + id);
        return el ? el.value : fallback;
    }

    function extractSaveState(doc) {
        const rows = Array.from(doc.querySelectorAll('#T1 tbody tr')).map(tr => {
            const courseInput = tr.querySelector('input[name="Course"]');
            const sectionInput = tr.querySelector('input[name="Section"]');
            const creditInput = tr.querySelector('input[name="CourseCredit"]');
            const tds = tr.querySelectorAll('td');
            return {
                course: courseInput ? courseInput.value : (tds[0] ? tds[0].textContent.trim() : ''),
                section: sectionInput ? sectionInput.value : (tds[2] ? tds[2].textContent.trim() : ''),
                credit: creditInput ? creditInput.value : '',
                title: tds[1] ? tds[1].textContent.trim() : '',
            };
        }).filter(r => r.course);

        return {
            rows,
            isAddDropWithdraw: fieldValue(doc, 'IsAddDropWithdraw', 'True'),
            isCreditBased: fieldValue(doc, 'IsCreditBased', 'True'),
            hasLateRegFinePermission: fieldValue(doc, 'HasLateRegistrationWithoutFinePermission', 'False'),
            lateRegFineEnabled: fieldValue(doc, 'LateRegistrationFineEnabled', 'False'),
            registrationDateOver: fieldValue(doc, 'RegistrationDateOver', 'True'),
            regDateString: fieldValue(doc, 'RegDateString', ''),
            fineAmount: fieldValue(doc, 'FineAmount', '0'),
            finePercent: fieldValue(doc, 'FinePercent', '0'),
            comments: fieldValue(doc, 'Comments', ''),
            token: (doc.querySelector('input[name="__RequestVerificationToken"]') || {}).value || '',
        };
    }

    function looksLikeSuccess(doc) {
        const banner = doc.querySelector('p.bg-success');
        return !!(banner && /saved successfully/i.test(banner.textContent));
    }

    function looksLikeError(doc) {
        const summary = doc.querySelector('.validation-summary-errors, .field-validation-error');
        if (summary && summary.textContent.trim()) return summary.textContent.trim();
        return null;
    }

    function findEmailBillHref(doc) {
        const link = Array.from(doc.querySelectorAll('a[href*="/StudentRegistration/Print"]'))
            .find(a => /email bill/i.test(a.textContent));
        return link ? link.getAttribute('href') : null;
    }

    // ── Save exactly one student: Load → Save → (optionally) Email Bill ────
    // Accepts an optional pre-fetched token/semesterId (used by the bulk run
    // to avoid re-fetching the token page for every student); fetches its
    // own when omitted (used by the per-row Save button).
    async function saveOneStudent(s, { parser, BASE, emailBillEnabled, sharedToken, semesterId }) {
        let token = sharedToken;
        if (!token || semesterId === undefined) {
            const getRes = await fetch(`${BASE}/StudentRegistration`, { credentials: 'include' });
            const getDoc = parser.parseFromString(await getRes.text(), 'text/html');
            const tokenEl = getDoc.querySelector('input[name="__RequestVerificationToken"]');
            if (!tokenEl) throw new Error('Could not find anti-forgery token. Are you logged in to URMS?');
            token = tokenEl.value;
            if (semesterId === undefined) {
                const semesterEl = getDoc.querySelector('input[name="GenaratedCourseList.Semester"], select[name="GenaratedCourseList.Semester"]');
                semesterId = semesterEl ? semesterEl.value : '';
            }
        }

        const today = new Date();
        const loadRegDateString = [
            String(today.getDate()).padStart(2, '0'),
            String(today.getMonth() + 1).padStart(2, '0'),
            today.getFullYear()
        ].join('/');

        // Step 1: Load — same call Time/Advising already make.
        const loadParams = new URLSearchParams();
        loadParams.append('IsAddDropWithdraw', 'False');
        loadParams.append('IsCreditBased', '');
        loadParams.append('HasLateRegistrationWithoutFinePermission', 'False');
        loadParams.append('LateRegistrationFineEnabled', 'False');
        loadParams.append('RegistrationDateOver', 'True');
        loadParams.append('RegDateString', loadRegDateString);
        loadParams.append('GenaratedCourseList.Semester', semesterId);
        loadParams.append('GenaratedCourseList.StudentId', s.id);
        loadParams.append('btnLoad', 'Load');
        loadParams.append('__RequestVerificationToken', token);

        const loadRes = await fetch(`${BASE}/StudentRegistration`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': `${BASE}/StudentRegistration` },
            body: loadParams.toString(),
        });
        const loadDoc = parser.parseFromString(await loadRes.text(), 'text/html');
        const state = extractSaveState(loadDoc);

        if (!state.rows.length) {
            appendLog(s.id, s.name, 'skip', '⚠️ No staged courses found — skipped');
            return {
                id: s.id, name: s.name, status: 'skipped', detail: 'No staged courses', courses: [],
                rowMsg: '⚠️ Nothing staged', rowClass: 'skip', token, semesterId,
            };
        }

        if (state.token) token = state.token;

        // Step 2: Save — replicate the page's own Save submission exactly.
        const saveParams = new URLSearchParams();
        saveParams.append('IsAddDropWithdraw', state.isAddDropWithdraw);
        saveParams.append('IsCreditBased', state.isCreditBased);
        saveParams.append('HasLateRegistrationWithoutFinePermission', state.hasLateRegFinePermission);
        saveParams.append('LateRegistrationFineEnabled', state.lateRegFineEnabled);
        saveParams.append('RegistrationDateOver', state.registrationDateOver);
        saveParams.append('RegDateString', state.regDateString);
        saveParams.append('GenaratedCourseList.Semester', semesterId);
        saveParams.append('GenaratedCourseList.StudentId', s.id);
        for (const row of state.rows) {
            saveParams.append('Course', row.course);
            saveParams.append('Section', row.section);
            saveParams.append('CourseCredit', row.credit);
        }
        saveParams.append('FineAmount', state.fineAmount);
        saveParams.append('FinePercent', state.finePercent);
        saveParams.append('Comments', state.comments);
        saveParams.append('__RequestVerificationToken', token);

        const saveRes = await fetch(`${BASE}/StudentRegistration`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': `${BASE}/StudentRegistration` },
            body: saveParams.toString(),
        });
        const saveHtml = await saveRes.text();
        const saveDoc = parser.parseFromString(saveHtml, 'text/html');
        const err = looksLikeError(saveDoc);
        const confirmed = looksLikeSuccess(saveDoc);

        if (!saveRes.ok) {
            appendLog(s.id, s.name, 'fail', `❌ HTTP ${saveRes.status} — please verify manually`);
            return {
                id: s.id, name: s.name, status: 'failed', detail: `HTTP ${saveRes.status}`, courses: state.rows,
                rowMsg: `❌ HTTP ${saveRes.status}`, rowClass: 'fail', token, semesterId,
            };
        }
        if (err) {
            appendLog(s.id, s.name, 'fail', `❌ ${err}`);
            return {
                id: s.id, name: s.name, status: 'failed', detail: err, courses: state.rows,
                rowMsg: '❌ Failed', rowClass: 'fail', token, semesterId,
            };
        }
        if (confirmed) {
            appendLog(s.id, s.name, 'ok', `✅ Saved successfully — ${state.rows.length} course(s)`);
            let billDetail = 'Saved successfully';
            let rowMsg = '✅ Saved';
            if (emailBillEnabled) {
                const billHref = findEmailBillHref(saveDoc);
                if (billHref) {
                    try {
                        const billRes = await fetch(`${BASE}${billHref}`, {
                            credentials: 'include',
                            headers: { 'Referer': `${BASE}/StudentRegistration` },
                        });
                        if (billRes.ok) {
                            appendLog(s.id, s.name, 'ok', '📧 Bill emailed');
                            billDetail += ' — bill emailed';
                            rowMsg = '✅ Saved + 📧';
                        } else {
                            appendLog(s.id, s.name, 'skip', `⚠️ Bill email request failed — HTTP ${billRes.status}`);
                            billDetail += ` — bill email failed (HTTP ${billRes.status})`;
                            rowMsg = '✅ Saved, ⚠️ bill failed';
                        }
                    } catch (billErr) {
                        appendLog(s.id, s.name, 'skip', `⚠️ Bill email request failed — ${billErr.message}`);
                        billDetail += ` — bill email failed (${billErr.message})`;
                        rowMsg = '✅ Saved, ⚠️ bill failed';
                    }
                } else {
                    appendLog(s.id, s.name, 'skip', '⚠️ No "Email Bill" link found on Save response — skipped');
                    billDetail += ' — no Email Bill link found';
                    rowMsg = '✅ Saved, ⚠️ no bill link';
                }
            }
            return {
                id: s.id, name: s.name, status: 'saved', detail: billDetail, courses: state.rows,
                rowMsg, rowClass: 'ok', token, semesterId,
            };
        }

        appendLog(s.id, s.name, 'skip', `❓ No confirmation banner seen — please verify manually`);
        return {
            id: s.id, name: s.name, status: 'unconfirmed', detail: 'No "Saved successfully" banner in response', courses: state.rows,
            rowMsg: '❓ Unconfirmed', rowClass: 'skip', token, semesterId,
        };
    }

    async function runBulkSave() {
        const runBtn = $('ulab-step2-run');
        const emailBillEnabled = $('ulab-email-bill-toggle') ? $('ulab-email-bill-toggle').checked : false;
        if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Running…'; }
        $('ulab-run-log').innerHTML = '';

        const indexedStudents = PARSED_STUDENTS
            .map((s, idx) => ({ s, idx }))
            .filter(({ s }) => /^\d{9}$/.test(s.id));
        if (!indexedStudents.length) {
            setRunStatus('❌ No valid 9-digit IDs found.');
            if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Run Bulk Save'; }
            return;
        }

        const parser = new DOMParser();
        const BASE = 'https://urms-awp.ulab.edu.bd';
        const results = [];

        try {
            setRunStatus('⏳ Fetching session token…');
            const getRes = await fetch(`${BASE}/StudentRegistration`, { credentials: 'include' });
            const getDoc = parser.parseFromString(await getRes.text(), 'text/html');
            const tokenEl = getDoc.querySelector('input[name="__RequestVerificationToken"]');
            if (!tokenEl) throw new Error('Could not find anti-forgery token. Are you logged in to URMS?');
            let sharedToken = tokenEl.value;
            const semesterEl = getDoc.querySelector('input[name="GenaratedCourseList.Semester"], select[name="GenaratedCourseList.Semester"]');
            const semesterId = semesterEl ? semesterEl.value : '';

            for (let i = 0; i < indexedStudents.length; i++) {
                const { s, idx } = indexedStudents[i];
                setRunStatus(`⏳ ${i + 1}/${indexedStudents.length}: saving ${s.name || s.id}…`);
                setRowStatus(idx, '⏳ Saving…', 'pending');

                try {
                    const result = await saveOneStudent(s, { parser, BASE, emailBillEnabled, sharedToken, semesterId });
                    sharedToken = result.token;
                    setRowStatus(idx, result.rowMsg, result.rowClass);
                    results.push(result);
                } catch (err) {
                    console.error('[ULAB Bulk Save]', s.id, err);
                    appendLog(s.id, s.name, 'fail', `❌ ${err.message}`);
                    setRowStatus(idx, `❌ ${err.message}`, 'fail');
                    results.push({ id: s.id, name: s.name, status: 'error', detail: err.message, courses: [] });
                }
            }

            setRunStatus('✅ Done! Opening report…');
            chrome.storage.local.set({ ulabBulkSaveResults: results }, () => {
                chrome.runtime.sendMessage({ action: 'openBulkSaveResults' });
                if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Run Bulk Save'; }
            });
        } catch (err) {
            console.error('[ULAB Bulk Save]', err);
            setRunStatus(`❌ Error: ${err.message}`);
            if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Run Bulk Save'; }
        }
    }

    function mount(container) {
        root = container;
        showStep1();
    }

    window.ULAB_FEATURES = window.ULAB_FEATURES || [];
    window.ULAB_FEATURES.push({
        id: 'bulk-save',
        icon: '💾',
        title: 'Bulk Save',
        subtitle: 'Load and Save registration for a group of students — writes to URMS',
        mount,
    });
})();
