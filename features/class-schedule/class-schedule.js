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

            <div id="ulab-cs-status"></div>

            <div class="ulab-wizard-nav">
                <button class="ulab-primary-btn" id="ulab-generate-btn" disabled>📅 Generate Schedule →</button>
            </div>
        `;

        $('ulab-cs-file-input').addEventListener('change', (e) => {
            selectedFile = e.target.files[0] || null;
            $('ulab-cs-file-name').textContent = selectedFile ? `✅ ${selectedFile.name}` : '';
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
            chrome.storage.local.set({
                ulabClassSchedule: {
                    ...result,
                    sourceFile: selectedFile.name,
                    generatedAt: Date.now(),
                },
            }, () => {
                chrome.runtime.sendMessage({ action: 'openClassScheduleResults' });
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
