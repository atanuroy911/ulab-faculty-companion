// features/advising-billing/wizard.js — Advising & Save/Bill feature module.
//
// Merges what used to be two separate side-panel features (Student Advising,
// Bulk Save) into a single Typeform-style wizard: one question per screen,
// animated Next/Back. The pasted/uploaded student list is always run through
// the advising analysis (features/advising/advising.js's
// window.ULAB_ADVISING_CORE) before results open, since the merged results
// page uses "no advising issues found" as the eligibility gate for its
// auto Save+Bill action — students with issues are saved/billed manually
// from their own card there instead.
(function () {
    if (!document.getElementById('ulab-wizard-css')) {
        const link = document.createElement('link');
        link.id = 'ulab-wizard-css';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('features/common/wizard.css');
        document.head.appendChild(link);
    }

    const TOTAL_STEPS = 4;

    let root = null;
    let stage = null; // the sliding inner container each step renders into
    let SELECTED_PROGRAM = null;
    let INPUT_METHOD = null; // 'paste' | 'pdf'
    let PARSED_STUDENTS = [];
    let currentStep = 1;

    function $(id) { return root.querySelector('#' + id); }

    function core() { return window.ULAB_ADVISING_CORE || {}; }

    // ── Shell: progress dots + sliding stage ────────────────────────────────
    function renderShell(bodyHTML, { direction } = {}) {
        root.innerHTML = `
            <div class="ulab-progress-row">
                <span class="ulab-progress-label">STEP ${currentStep}/${TOTAL_STEPS}</span>
                <div class="ulab-progress-dots">
                    ${Array.from({ length: TOTAL_STEPS }, (_, i) => {
                        const n = i + 1;
                        const cls = n < currentStep ? 'done' : (n === currentStep ? 'active' : '');
                        return `<div class="ulab-progress-dot ${cls}"></div>`;
                    }).join('')}
                </div>
            </div>
            <div class="ulab-step-stage">
                <div class="ulab-step-slide ${direction === 'back' ? 'back' : ''}" id="ulab-stage-inner">${bodyHTML}</div>
            </div>
        `;
        stage = $('ulab-stage-inner');
    }

    function goTo(stepFn, direction) {
        stepFn(direction);
    }

    // ── Step 1: Program picker ──────────────────────────────────────────────
    function showStep1(direction) {
        currentStep = 1;
        const programs = window.ULAB_PROGRAMS || [];
        renderShell(`
            <div class="ulab-step-title">Which program are these students in?</div>
            <div class="ulab-step-subtitle">This determines which degree catalogue is used to check prerequisites and degree progress.</div>
            <div class="ulab-choice-tiles" id="ulab-program-list">
                ${programs.map(p => `
                    <div class="ulab-choice-tile ${SELECTED_PROGRAM === p.id ? 'selected' : ''}" data-id="${p.id}">
                        <div class="ulab-choice-tile-icon">${p.icon}</div>
                        <div class="ulab-choice-tile-body">
                            <div class="ulab-choice-tile-title">${p.short}</div>
                            <div class="ulab-choice-tile-sub">${p.name}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `, { direction });

        $('ulab-program-list').querySelectorAll('.ulab-choice-tile').forEach(el => {
            el.addEventListener('click', () => {
                SELECTED_PROGRAM = el.dataset.id;
                showStep2();
            });
        });
    }

    // ── Step 2: Get the list — instructions + method choice + input, all in
    // one screen (collapsed from what used to be 4 separate steps). Picking
    // a tile reveals the matching input area inline below it. ───────────────
    function showStep2(direction) {
        currentStep = 2;
        const program = (window.ULAB_PROGRAMS || []).find(p => p.id === SELECTED_PROGRAM);
        renderShell(`
            <div class="ulab-step-title">Get the list</div>
            <div class="ulab-step-subtitle">
                Program: <strong>${program ? program.short : SELECTED_PROGRAM}</strong> —
                open <a class="ulab-link-chip" href="https://urms-awp.ulab.edu.bd/AdvisingStudent" target="_blank" rel="noopener">🔗 Advising Student</a>,
                print or save as PDF, then paste the table or upload that PDF below.
            </div>
            <div class="ulab-choice-tiles" id="ulab-method-tiles">
                <div class="ulab-choice-tile ${INPUT_METHOD === 'paste' ? 'selected' : ''}" data-method="paste">
                    <div class="ulab-choice-tile-icon">📋</div>
                    <div class="ulab-choice-tile-body">
                        <div class="ulab-choice-tile-title">Paste the list</div>
                        <div class="ulab-choice-tile-sub">Paste the copied table text directly.</div>
                    </div>
                </div>
                <div class="ulab-choice-tile ${INPUT_METHOD === 'pdf' ? 'selected' : ''}" data-method="pdf">
                    <div class="ulab-choice-tile-icon">📄</div>
                    <div class="ulab-choice-tile-body">
                        <div class="ulab-choice-tile-title">Upload a PDF</div>
                        <div class="ulab-choice-tile-sub">Upload the saved-as-PDF file instead.</div>
                    </div>
                </div>
            </div>
            <div id="ulab-input-area"></div>
            <div class="ulab-wizard-nav">
                <button class="ulab-secondary-btn" id="ulab-back">← Back</button>
                <button class="ulab-primary-btn" id="ulab-next" disabled>Parse Students →</button>
            </div>
        `, { direction });

        $('ulab-back').onclick = () => showStep1('back');
        $('ulab-next').onclick = parseAndShowStep4;

        $('ulab-method-tiles').querySelectorAll('.ulab-choice-tile').forEach(el => {
            el.addEventListener('click', () => {
                INPUT_METHOD = el.dataset.method;
                $('ulab-method-tiles').querySelectorAll('.ulab-choice-tile').forEach(t => t.classList.toggle('selected', t.dataset.method === INPUT_METHOD));
                renderInputArea();
            });
        });

        if (INPUT_METHOD) renderInputArea();
    }

    function renderInputArea() {
        const area = $('ulab-input-area');
        const isPdf = INPUT_METHOD === 'pdf';
        area.innerHTML = !isPdf ? `
            <div class="ulab-format-box">
                <div class="ulab-format-label">Expected format (one student per line)</div>
                <div class="ulab-format-example">1 253014001 Md. Minhajur Rahman minhajur.rahman.cse@ulab.edu.bd 1855533355 OK 20 Apr 2026 OK
2 253014002 Jannatul Ferduws jannatul.ferduws.cse@ulab.edu.bd 01932006166 OK 20 Apr 2026 OK</div>
                <div class="ulab-format-hint">
                    💡 Each line needs a <strong>9-digit Student ID</strong> and an <strong>@ulab.edu.bd email</strong> somewhere on it.
                </div>
            </div>
            <textarea id="ulab-paste-box" placeholder="Paste the Advising Student table here…"></textarea>
            <div id="ulab-parse-preview"></div>
        ` : `
            <textarea id="ulab-paste-box" style="display:none"></textarea>
            <div id="ulab-pdf-upload-slot"></div>
            <div id="ulab-parse-preview"></div>
        `;
        if (isPdf && window.ulabMountPdfUpload) ulabMountPdfUpload($('ulab-pdf-upload-slot'), $('ulab-paste-box'));
        $('ulab-paste-box').addEventListener('input', updateParsePreview);
    }

    function updateParsePreview() {
        const text = $('ulab-paste-box').value;
        const students = core().parseAdvisingStudents ? core().parseAdvisingStudents(text) : [];
        const preview = $('ulab-parse-preview');
        const nextBtn = $('ulab-next');
        if (text.trim()) {
            preview.innerHTML = students.length
                ? `<div class="ulab-preview-ok">✅ Found ${students.length} student(s) — click Parse Students to confirm</div>`
                : `<div class="ulab-preview-warn">⚠️ No 9-digit Student IDs found yet. Keep pasting.</div>`;
        } else {
            preview.innerHTML = '';
        }
        if (nextBtn) nextBtn.disabled = students.length === 0;
    }

    function parseAndShowStep4() {
        const text = $('ulab-paste-box') ? $('ulab-paste-box').value : '';
        PARSED_STUDENTS = core().parseAdvisingStudents ? core().parseAdvisingStudents(text) : [];
        if (PARSED_STUDENTS.length === 0) {
            const preview = $('ulab-parse-preview');
            if (preview) preview.innerHTML = `<div class="ulab-preview-warn">❌ No Student IDs found. Make sure you copied/uploaded the full table.</div>`;
            return;
        }
        showStep4();
    }

    // ── Step 4: Confirm & edit list ──────────────────────────────────────────
    function showStep4(direction) {
        currentStep = 3;
        const listHTML = PARSED_STUDENTS.map((s, i) => `
            <div class="ulab-student-row">
                <div class="ulab-student-idx">${i + 1}</div>
                <div class="ulab-student-details">
                    <input class="ulab-id-input"   value="${s.id}"   data-idx="${i}" placeholder="Student ID" maxlength="9" />
                    <input class="ulab-name-input" value="${s.name}" data-idx="${i}" placeholder="Name (optional)" />
                </div>
                <button class="ulab-remove-btn" data-idx="${i}" title="Remove">✕</button>
            </div>
        `).join('');

        renderShell(`
            <div class="ulab-step-title">Confirm the student list</div>
            <div class="ulab-step-subtitle">Found <strong>${PARSED_STUDENTS.length}</strong> students. Edit or remove any incorrect entries.</div>
            <div id="ulab-student-list">${listHTML}</div>
            <div class="ulab-wizard-nav">
                <button class="ulab-secondary-btn" id="ulab-back">← Back</button>
                <button class="ulab-primary-btn" id="ulab-next">🚀 Run Advising Check →</button>
            </div>
        `, { direction });

        $('ulab-back').onclick = () => showStep2('back');
        $('ulab-next').onclick = showStep5;

        $('ulab-student-list').addEventListener('input', e => {
            const idx = parseInt(e.target.dataset.idx, 10);
            if (e.target.classList.contains('ulab-id-input')) PARSED_STUDENTS[idx].id = e.target.value.trim();
            if (e.target.classList.contains('ulab-name-input')) PARSED_STUDENTS[idx].name = e.target.value.trim();
        });
        $('ulab-student-list').addEventListener('click', e => {
            if (e.target.classList.contains('ulab-remove-btn')) {
                const idx = parseInt(e.target.dataset.idx, 10);
                PARSED_STUDENTS.splice(idx, 1);
                showStep4();
            }
        });
    }

    // ── Step 5: Run advising analysis, then hand off to the results page ────
    function showStep5(direction) {
        currentStep = 4;
        renderShell(`
            <div class="ulab-step-title">Checking each student…</div>
            <div class="ulab-step-subtitle">May take a moment for large lists.</div>
            <div id="ulab-run-status"></div>
            <div class="ulab-wizard-nav">
                <button class="ulab-secondary-btn" id="ulab-back">← Back</button>
            </div>
        `, { direction });
        $('ulab-back').onclick = () => showStep4('back');
        runAnalysis();
    }

    function setRunStatus(msg) {
        const el = $('ulab-run-status');
        if (el) el.innerHTML = `<div class="ulab-run-status-msg">${msg}</div>`;
    }

    async function runAnalysis() {
        const students = PARSED_STUDENTS.filter(s => /^\d{9}$/.test(s.id));
        if (!students.length) {
            setRunStatus('❌ No valid 9-digit IDs found. Please go back and check your entries.');
            return;
        }

        const c = core();
        if (!c.fetchAdvisingDetails) {
            setRunStatus('❌ Advising engine not loaded — please reload the side panel and try again.');
            return;
        }

        try {
            setRunStatus(`⏳ Checking ${students.length} students…`);
            const cat = (window.ULAB_CATALOGUES || {})[SELECTED_PROGRAM] || null;
            const details = await c.fetchAdvisingDetails(students, cat, (i, total, s) => {
                setRunStatus(`⏳ Checking ${i}/${total}: ${s.name || s.id}`);
            });

            setRunStatus('✅ Done! Opening results…');
            chrome.storage.local.set({
                ulabABStudents: students,
                ulabABDetails: details,
                ulabABProgram: SELECTED_PROGRAM,
            }, () => {
                chrome.runtime.sendMessage({ action: 'openAdvisingBillingResults' });
            });
        } catch (err) {
            console.error('[ULAB Advising & Billing]', err);
            setRunStatus(`❌ Error: ${err.message}`);
        }
    }

    // ── Feature entry point ─────────────────────────────────────────────────
    function mount(container) {
        root = container;
        SELECTED_PROGRAM = null;
        INPUT_METHOD = null;
        PARSED_STUDENTS = [];
        currentStep = 1;
        showStep1();
    }

    window.ULAB_FEATURES = window.ULAB_FEATURES || [];
    window.ULAB_FEATURES.push({
        id: 'advising-billing',
        icon: '🎓',
        title: 'Advising & Save/Bill',
        subtitle: 'Check advising status, then save & bill registrations for a group of students',
        mount,
    });
})();
