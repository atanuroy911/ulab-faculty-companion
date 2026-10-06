// features/class-schedule/class-schedule.js — "Generate My Schedule" tab.
// Upload the university's Class Schedule xlsx and type a short form (or
// full name); features/class-schedule/schedule-parser.js scans every cell
// of the sheet for that person and builds a personal weekly timetable,
// shown in a report tab (results.html).
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
        const nameVal = $('ulab-teacher-query').value.trim();
        $('ulab-generate-btn').disabled = !(selectedFile && nameVal);
    }

    function setStatus(msg, isError) {
        const el = $('ulab-cs-status');
        el.innerHTML = msg ? `<div class="${isError ? 'ulab-preview-warn' : 'ulab-preview-ok'}">${msg}</div>` : '';
    }

    // Every generated schedule is also saved here, keyed by short-form +
    // semester + year, so it can be reopened later from the dedicated
    // "My Schedule" tool (features/class-schedule/my-schedule.js) without
    // re-uploading the spreadsheet. Separate from
    // 'ulabSavedConsultationSchedules', which is a different feature (the
    // "Export Teaching & Consultation Schedule" button inside results.html)
    // that was previously — confusingly — the key this history list read.
    const SAVED_SCHEDULES_KEY = 'ulabSavedClassSchedules';

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function scheduleKey(entry) {
        return `${entry.shortForm || 'unknown'}__${entry.semester || 'na'}__${entry.year || 'na'}`;
    }

    function saveScheduleToHistory(entry) {
        return new Promise((resolve) => {
            chrome.storage.local.get([SAVED_SCHEDULES_KEY], (data) => {
                const all = data[SAVED_SCHEDULES_KEY] || {};
                all[scheduleKey(entry)] = entry;
                chrome.storage.local.set({ [SAVED_SCHEDULES_KEY]: all }, resolve);
            });
        });
    }

    function mount(container) {
        root = container;
        selectedFile = null;

        root.innerHTML = `
            <div class="ulab-step-title">Generate My Schedule</div>
            <div class="ulab-step-subtitle">
                Upload this semester's <strong>Class Schedule</strong> Excel file and enter your short
                form (e.g. <strong>ASR</strong>) or full name — every cell in the sheet is searched for
                you, exactly as you'd read it by eye, and your personal weekly timetable is built from
                every class where it shows up.
            </div>

            <div class="ulab-format-box">
                <div class="ulab-format-label">1. Upload the schedule file</div>
                <label class="ulab-link-chip" style="cursor:pointer">
                    📄 Choose .xlsx file…
                    <input type="file" accept=".xlsx,.xls" id="ulab-cs-file-input" style="display:none">
                </label>
                <span id="ulab-cs-file-name" class="ulab-format-hint" style="margin-left:8px"></span>
            </div>

            <div class="ulab-format-box">
                <div class="ulab-format-label">2. Your short form or full name</div>
                <input type="text" id="ulab-teacher-query" placeholder="e.g. ASR or Atanu Shuvam Roy"
                    style="width:100%;padding:9px 12px;border-radius:8px;border:1px solid var(--border);color:var(--text);background:transparent;font:inherit">
                <div class="ulab-format-hint">💡 Short forms are listed at the bottom of the schedule sheet.</div>
            </div>

            <div class="ulab-format-box">
                <div class="ulab-format-label">3. Semester (also saved with your schedule, so 📅 My Schedule can tell your terms apart)</div>
                <div style="display:flex;flex-wrap:wrap;gap:10px">
                    <select id="ulab-cs-semester" style="flex:1;min-width:0;padding:9px 8px;border-radius:8px;border:1px solid var(--border);color:var(--text);background:var(--surface);font:inherit;max-width:100%">
                        <option value="">Not sure / other</option>
                        <option value="Spring">Spring</option>
                        <option value="Summer">Summer</option>
                        <option value="Fall">Fall</option>
                    </select>
                    <input type="number" id="ulab-cs-year" placeholder="Year" min="2000" max="2100"
                        style="flex:0 0 84px;min-width:0;padding:9px 8px;border-radius:8px;border:1px solid var(--border);color:var(--text);background:transparent;font:inherit">
                </div>
                <div class="ulab-format-hint" id="ulab-cs-semester-hint">💡 Usually detected from the file name — double-check it, then adjust if needed. This only sets a default start date on the next screen; it's always editable there too.</div>
            </div>

            <div id="ulab-cs-status"></div>

            <div class="ulab-wizard-nav">
                <button class="ulab-primary-btn" id="ulab-generate-btn" disabled>📅 Generate Schedule →</button>
            </div>
        `;

        $('ulab-cs-file-input').addEventListener('change', (e) => {
            selectedFile = e.target.files[0] || null;
            $('ulab-cs-file-name').textContent = selectedFile ? `✅ ${selectedFile.name}` : '';

            const detected = selectedFile && window.ULAB_ScheduleParser.detectSemesterFromFilename(selectedFile.name);
            const hint = $('ulab-cs-semester-hint');
            if (detected) {
                $('ulab-cs-semester').value = detected.semester;
                $('ulab-cs-year').value = detected.year;
                hint.textContent = `✅ Detected "${detected.semester} ${detected.year}" from the file name — change it above if that's wrong.`;
            } else if (selectedFile) {
                hint.textContent = "⚠️ Couldn't detect the semester/year from the file name — pick them above (or leave blank and set the start date manually on the next screen).";
            } else {
                hint.textContent = '💡 Usually detected from the file name — double-check it, then adjust if needed. This only sets a default start date on the next screen; it\'s always editable there too.';
            }

            updateGenerateEnabled();
        });

        $('ulab-teacher-query').addEventListener('input', updateGenerateEnabled);

        $('ulab-generate-btn').addEventListener('click', runGenerate);
    }

    async function runGenerate() {
        const query = $('ulab-teacher-query').value.trim();
        if (!selectedFile || !query) return;

        $('ulab-generate-btn').disabled = true;
        setStatus('⏳ Loading spreadsheet reader…');

        try {
            await ensureXlsx();
            setStatus('⏳ Reading file…');
            const buf = await selectedFile.arrayBuffer();
            const workbook = XLSX.read(buf, { type: 'array' });

            setStatus('⏳ Searching every cell for a match…');
            const result = window.ULAB_ScheduleParser.parseWorkbookForTeacher(workbook, query);

            if (!result.entries.length) {
                setStatus(`❌ No classes found for "${result.shortForm}". Double-check the short form / spelling and try again.`, true);
                $('ulab-generate-btn').disabled = false;
                return;
            }

            setStatus(`✅ Found ${result.entries.length} class slot(s). Opening your schedule…`);
            const scheduleEntry = {
                ...result,
                sourceFile: selectedFile.name,
                semester: $('ulab-cs-semester').value || null,
                year: $('ulab-cs-year').value ? parseInt($('ulab-cs-year').value, 10) : null,
                generatedAt: Date.now(),
                savedAt: Date.now(),
            };
            await saveScheduleToHistory(scheduleEntry);
            chrome.storage.local.set({ ulabClassSchedule: scheduleEntry }, () => {
                if (window.ULAB_TOOLS_FRAME_SHOW_RESULTS) {
                    window.ULAB_TOOLS_FRAME_SHOW_RESULTS('features/class-schedule/results.html');
                } else {
                    chrome.runtime.sendMessage({ action: 'openClassScheduleResults' });
                }
                $('ulab-generate-btn').disabled = false;
            });
        } catch (err) {
            console.error('[ULAB Class Schedule]', err);
            setStatus(`❌ Error: ${err.message}`, true);
            $('ulab-generate-btn').disabled = false;
        }
    }

    window.ULAB_FEATURES = window.ULAB_FEATURES || [];
    window.ULAB_FEATURES.push({
        id: 'class-schedule',
        icon: '📅',
        title: 'Generate My Schedule',
        subtitle: 'Upload the Class Schedule sheet and get your personal weekly timetable',
        mount,
    });
})();
