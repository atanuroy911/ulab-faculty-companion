// features/exam-routine/exam-routine.js — "Exam Routine Finder" tab.
// Upload the university's Exam Schedule xlsx and enter your short form (or
// full name) to open your personalized date-wise exam routine in a separate
// results page (exam-results.html).
(function () {
    if (!document.getElementById('ulab-wizard-css')) {
        const link = document.createElement('link');
        link.id = 'ulab-wizard-css';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('features/common/wizard.css');
        document.head.appendChild(link);
    }

    let root = null;
    let selectedFile = null;
    let xlsxLoadPromise = null;

    function $(id) { return root.querySelector('#' + id); }

    function ensureXlsx() {
        if (typeof XLSX !== 'undefined') return Promise.resolve();
        if (xlsxLoadPromise) return xlsxLoadPromise;
        xlsxLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('features/common/vendor/xlsx.full.min.js');
            script.onload = resolve;
            script.onerror = () => reject(new Error('Could not load the spreadsheet reader.'));
            document.head.appendChild(script);
        });
        return xlsxLoadPromise;
    }

    function updateGenerateEnabled() {
        const nameVal = $('ulab-exam-query').value.trim();
        $('ulab-exam-generate-btn').disabled = !(selectedFile && nameVal);
    }

    function setStatus(msg, isError) {
        const el = $('ulab-exam-status');
        if (!el) return;
        el.innerHTML = msg
            ? `<div class="${isError ? 'ulab-preview-warn' : 'ulab-preview-ok'}">${msg}</div>`
            : '';
    }

    function mount(container) {
        root = container;
        selectedFile = null;

        root.innerHTML = `
            <div class="ulab-step-title">Exam Routine Finder</div>
            <div class="ulab-step-subtitle">
                Upload the university's <strong>Exam Schedule</strong> Excel spreadsheet (.xlsx) and
                enter your short form (e.g. <strong>ASR</strong>) or full name. Your personal,
                date-wise exam duties and rooms will open in a clean results page.
            </div>

            <div class="ulab-format-box">
                <div class="ulab-format-label">1. Upload Exam Schedule Spreadsheet</div>
                <label class="ulab-link-chip" style="cursor:pointer">
                    📄 Choose .xlsx file…
                    <input type="file" accept=".xlsx,.xls" id="ulab-exam-file-input" style="display:none">
                </label>
                <span id="ulab-exam-file-name" class="ulab-format-hint" style="margin-left:8px"></span>
            </div>

            <div class="ulab-format-box">
                <div class="ulab-format-label">2. Faculty Short Form or Full Name</div>
                <input type="text" id="ulab-exam-query" placeholder="e.g. ASR or Atanu Shuvam Roy"
                    style="width:100%;padding:9px 12px;border-radius:8px;border:1px solid var(--border);color:var(--text);background:transparent;font:inherit">
                <div class="ulab-format-hint">💡 Short forms are matched against the faculty code sheet inside the file.</div>
            </div>

            <div class="ulab-format-box">
                <div class="ulab-format-label">3. Exam Term & Semester</div>
                <div style="display:flex;flex-wrap:wrap;gap:10px">
                    <select id="ulab-exam-type" style="flex:1;min-width:110px;padding:9px 8px;border-radius:8px;border:1px solid var(--border);color:var(--text);background:var(--surface);font:inherit">
                        <option value="Midterm">Midterm Exam</option>
                        <option value="Final">Final Exam</option>
                        <option value="Special">Special Exam</option>
                    </select>
                    <select id="ulab-exam-semester" style="flex:1;min-width:110px;padding:9px 8px;border-radius:8px;border:1px solid var(--border);color:var(--text);background:var(--surface);font:inherit">
                        <option value="">Not sure / other</option>
                        <option value="Spring">Spring</option>
                        <option value="Summer">Summer</option>
                        <option value="Fall">Fall</option>
                    </select>
                    <input type="number" id="ulab-exam-year" placeholder="Year" min="2020" max="2100"
                        style="flex:0 0 84px;min-width:0;padding:9px 8px;border-radius:8px;border:1px solid var(--border);color:var(--text);background:transparent;font:inherit">
                </div>
                <div class="ulab-format-hint" id="ulab-exam-meta-hint">💡 Usually detected from the file name — adjust if needed.</div>
            </div>

            <div id="ulab-exam-status"></div>

            <div class="ulab-wizard-nav">
                <button class="ulab-primary-btn" id="ulab-exam-generate-btn" disabled>📋 Find My Exams →</button>
            </div>
        `;

        // Auto-fill teacher initial if saved from class schedule or profile
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['ulabClassSchedule'], (data) => {
                if (data.ulabClassSchedule?.shortForm && !$('ulab-exam-query').value) {
                    $('ulab-exam-query').value = data.ulabClassSchedule.shortForm;
                    updateGenerateEnabled();
                }
            });
        }

        $('ulab-exam-file-input').addEventListener('change', (e) => {
            selectedFile = e.target.files[0] || null;
            $('ulab-exam-file-name').textContent = selectedFile ? `✅ ${selectedFile.name}` : '';

            const detected = selectedFile && window.ULAB_ExamParser?.detectMetaFromFilename(selectedFile.name);
            const hint = $('ulab-exam-meta-hint');
            if (detected) {
                if (detected.examType && $('ulab-exam-type').querySelector(`option[value="${detected.examType}"]`)) {
                    $('ulab-exam-type').value = detected.examType;
                }
                if (detected.semester) $('ulab-exam-semester').value = detected.semester;
                if (detected.year)     $('ulab-exam-year').value = detected.year;
                hint.textContent = `✅ Detected "${[detected.examType, detected.semester, detected.year].filter(Boolean).join(' ')}" from the file name.`;
            } else if (selectedFile) {
                hint.textContent = "⚠️ Couldn't detect exam type/semester from file name — please select them above.";
            } else {
                hint.textContent = '💡 Usually detected from the file name — adjust if needed.';
            }
            updateGenerateEnabled();
        });

        $('ulab-exam-query').addEventListener('input', updateGenerateEnabled);
        $('ulab-exam-generate-btn').addEventListener('click', runGenerate);
    }

    async function runGenerate() {
        const query = $('ulab-exam-query').value.trim();
        if (!selectedFile || !query) return;

        $('ulab-exam-generate-btn').disabled = true;
        setStatus('⏳ Loading spreadsheet reader…');

        try {
            await ensureXlsx();
            setStatus('⏳ Reading file…');
            const buf = await selectedFile.arrayBuffer();
            const workbook = XLSX.read(buf, { type: 'array' });

            setStatus('⏳ Scanning exam schedule for your entries…');
            const result = window.ULAB_ExamParser.parseWorkbookForTeacher(workbook, query);

            if (!result.entries.length) {
                setStatus(`❌ No exams found for "${result.shortForm || query}". Double-check the short form or spelling and try again.`, true);
                $('ulab-exam-generate-btn').disabled = false;
                return;
            }

            setStatus(`✅ Found ${result.entries.length} exam slot(s). Opening results page…`);

            const examEntry = {
                ...result,
                sourceFile: selectedFile.name,
                examType: $('ulab-exam-type').value || null,
                semester: $('ulab-exam-semester').value || null,
                year: $('ulab-exam-year').value ? parseInt($('ulab-exam-year').value, 10) : null,
                generatedAt: Date.now(),
            };

            // Save to chrome.storage.local and localStorage for reliable retrieval in results page
            chrome.storage.local.set({ ulabExamRoutine: examEntry }, () => {
                try {
                    localStorage.setItem('ulabExamRoutine', JSON.stringify(examEntry));
                } catch (_) {}

                if (window.ULAB_TOOLS_FRAME_SHOW_RESULTS) {
                    window.ULAB_TOOLS_FRAME_SHOW_RESULTS('features/exam-routine/exam-results.html');
                } else if (chrome?.runtime?.sendMessage) {
                    chrome.runtime.sendMessage({ action: 'openExamRoutineResults' }, () => {
                        if (chrome.runtime.lastError) {
                            chrome.tabs?.create?.({ url: chrome.runtime.getURL('features/exam-routine/exam-results.html') });
                        }
                    });
                } else if (chrome?.tabs?.create) {
                    chrome.tabs.create({ url: chrome.runtime.getURL('features/exam-routine/exam-results.html') });
                }

                $('ulab-exam-generate-btn').disabled = false;
            });

        } catch (err) {
            console.error('[ULAB Exam Routine]', err);
            setStatus(`❌ Error: ${err.message}`, true);
            $('ulab-exam-generate-btn').disabled = false;
        }
    }

    window.ULAB_FEATURES = window.ULAB_FEATURES || [];
    window.ULAB_FEATURES.push({
        id: 'exam-routine',
        icon: '🗒️',
        title: 'Exam Routine Finder',
        subtitle: 'Upload the Exam Schedule sheet and get your personal date-wise exam routine',
        mount,
    });
})();
