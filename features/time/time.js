// features/time/time.js — Free Time Finder feature module.
// Finds common free class periods for a list of ULAB students by pulling
// their schedules directly from URMS. Runs entirely inside the side panel;
// no content script or page injection required.
(function () {
    // Inject the shared wizard stylesheet once.
    if (!document.getElementById('ulab-wizard-css')) {
        const link = document.createElement('link');
        link.id = 'ulab-wizard-css';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('features/common/wizard.css');
        document.head.appendChild(link);
    }

    const DAY_ORDER = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

    // Official university class periods — only these are considered candidate free slots.
    const CLASS_SLOTS = [
        { label: "Slot 1", start:  8 * 60 +  0, end:  9 * 60 + 20 },
        { label: "Slot 2", start:  9 * 60 + 25, end: 10 * 60 + 45 },
        { label: "Slot 3", start: 10 * 60 + 50, end: 12 * 60 + 10 },
        { label: "Slot 4", start: 12 * 60 + 15, end: 13 * 60 + 35 },
        { label: "Slot 5", start: 13 * 60 + 40, end: 15 * 60 +  0 },
        { label: "Slot 6", start: 15 * 60 +  5, end: 16 * 60 + 25 },
        { label: "Slot 7", start: 16 * 60 + 30, end: 17 * 60 + 50 },
    ];

    const DEFAULT_THRESHOLD_PERCENT = 50;
    let FREE_THRESHOLD_PERCENT = DEFAULT_THRESHOLD_PERCENT;
    let PARSED_STUDENTS = [];
    let root = null; // feature body container

    function $(id) { return root.querySelector('#' + id); }

    // ── Step 1: Paste box ────────────────────────────────────────────────────
    function showStep1() {
        root.innerHTML = `
            <p class="ulab-step-desc">
                Open the attendance sheet PDF on URMS, press <kbd>Ctrl+A</kbd> then
                <kbd>Ctrl+C</kbd> to copy the text, then paste below —
                <strong>or</strong> type each entry manually.
            </p>
            <div class="ulab-format-box">
                <div class="ulab-format-label">Expected format (one student per line)</div>
                <div class="ulab-format-example">251016002 Md. Tanjim Al Abir
262016017 Abdullah-Al-Araf
231016001 Sadia Islam</div>
                <div class="ulab-format-hint">
                    💡 Each line should have the <strong>9-digit ID</strong> followed by the <strong>student name</strong>.<br>
                    Hyphens in names (e.g. <em>Al-Araf</em>) are handled automatically.
                </div>
            </div>
            <textarea id="ulab-paste-box" placeholder="Paste PDF text or type entries here…"></textarea>
            <div id="ulab-parse-preview"></div>
            <button class="ulab-primary-btn" id="ulab-step1-next">Parse Students →</button>
        `;
        $('ulab-step1-next').onclick = parseAndShowStep2;

        $('ulab-paste-box').addEventListener('input', () => {
            const text = $('ulab-paste-box').value;
            const students = parseStudents(text);
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

    // ── Parse pasted text into student list ─────────────────────────────────
    function parseStudents(text) {
        // Normalise special dashes/hyphens that PDF viewers sometimes emit
        const normalised = text
            .replace(/­/g, '-')
            .replace(/–/g, '-')
            .replace(/—/g, '-');

        const idRegex = /\b(\d{9})\b/g;
        const ids = [...new Set([...normalised.matchAll(idRegex)].map(m => m[1]))];

        return ids.map(sid => {
            const lines = normalised.split('\n');
            let name = '';
            for (const line of lines) {
                if (!line.includes(sid)) continue;
                const cleaned = line
                    .replace(sid, '')
                    .replace(/^\s*\d+\s*/, '')
                    .trim();
                const nameMatch = cleaned.match(
                    /([A-Z][a-zA-Z.'`]*(?:[\s-]+[A-Za-z][a-zA-Z.'`-]*){1,6})/
                );
                if (nameMatch) {
                    name = nameMatch[1]
                        .replace(/\s{2,}/g, ' ')
                        .replace(/^[-\s]+|[-\s]+$/g, '')
                        .trim();
                    break;
                }
            }
            return { id: sid, name: name || '' };
        });
    }

    // ── Step 2: Confirm student list & run ──────────────────────────────────
    function parseAndShowStep2() {
        const text = $('ulab-paste-box').value;
        PARSED_STUDENTS = parseStudents(text);

        if (PARSED_STUDENTS.length === 0) {
            $('ulab-parse-preview').innerHTML =
                `<div class="ulab-preview-warn">❌ No Student IDs found. Make sure you copied the full PDF text.</div>`;
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
                <button class="ulab-remove-btn" data-idx="${i}" title="Remove">✕</button>
            </div>
        `).join('');

        root.innerHTML = `
            <p class="ulab-step-desc">
                Found <strong>${PARSED_STUDENTS.length}</strong> students. Edit or remove any incorrect entries.
            </p>
            <div id="ulab-student-list">${listHTML}</div>
            ${thresholdSelectorHTML()}
            <div class="ulab-btn-row" style="margin-top:14px">
                <button class="ulab-secondary-btn" id="ulab-step2-back">← Back</button>
                <button class="ulab-primary-btn"   id="ulab-step2-run">🚀 Find Free Time</button>
            </div>
            <div id="ulab-run-status"></div>
        `;

        $('ulab-step2-back').onclick = showStep1;
        $('ulab-step2-run').onclick = runAnalysis;
        wireThresholdSelector();

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
            }
        });
    }

    // ── Free-time threshold selector ────────────────────────────────────────
    function thresholdSelectorHTML() {
        const presets = [50, 60, 75, 100];
        const presetBtns = presets.map(p => `
            <button type="button" class="ulab-threshold-preset${p === FREE_THRESHOLD_PERCENT ? ' active' : ''}" data-pct="${p}">${p}%</button>
        `).join('');
        return `
            <div class="ulab-threshold-box">
                <div class="ulab-format-label">Free-time threshold</div>
                <p class="ulab-step-hint" style="margin:2px 0 8px">
                    Minimum % of students who must be free for a class period to count as available.
                </p>
                <div class="ulab-threshold-presets">${presetBtns}</div>
                <div class="ulab-threshold-custom">
                    <label for="ulab-threshold-input">Custom:</label>
                    <input type="number" id="ulab-threshold-input" min="1" max="100" step="1" value="${FREE_THRESHOLD_PERCENT}" />
                    <span>%</span>
                </div>
            </div>
        `;
    }

    function wireThresholdSelector() {
        const input = $('ulab-threshold-input');
        if (!input) return;

        function setThreshold(pct) {
            pct = Math.min(100, Math.max(1, Math.round(pct)));
            FREE_THRESHOLD_PERCENT = pct;
            input.value = pct;
            root.querySelectorAll('.ulab-threshold-preset').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.pct) === pct);
            });
        }

        root.querySelectorAll('.ulab-threshold-preset').forEach(btn => {
            btn.addEventListener('click', () => setThreshold(parseInt(btn.dataset.pct)));
        });
        input.addEventListener('change', () => setThreshold(parseInt(input.value) || DEFAULT_THRESHOLD_PERCENT));
    }

    function setRunStatus(msg) {
        const el = $('ulab-run-status');
        if (el) el.innerHTML = `<div class="ulab-run-status-msg">${msg}</div>`;
    }

    // ── Schedule parsing & free-time evaluation ─────────────────────────────
    function parseScheduleString(text) {
        const validDays = new Set(DAY_ORDER);
        const dayRegex = /\b([A-Z]{3}(?:,[A-Z]{3})*)\b/g;
        const timeRegex = /(\d{1,2}:\d{2})\s*([AP]M)\s*-\s*(\d{1,2}:\d{2})\s*([AP]M)/g;

        function toMinutes(hm, ampm) {
            let [h, m] = hm.split(':').map(Number);
            if (ampm === 'PM' && h !== 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            return h * 60 + m;
        }

        let dayMatches = [];
        let match;
        while ((match = dayRegex.exec(text)) !== null) {
            const days = match[1].split(',');
            if (days.every(d => validDays.has(d))) dayMatches.push({ pos: match.index, days });
        }

        let intervals = [];
        while ((match = timeRegex.exec(text)) !== null) {
            const start = toMinutes(match[1], match[2]);
            const end = toMinutes(match[3], match[4]);
            let curDays = [];
            for (const dm of dayMatches) { if (dm.pos < match.index) curDays = dm.days; }
            if (!curDays.length && dayMatches.length) curDays = dayMatches[0].days;
            for (const d of curDays) intervals.push({ day: d, start, end });
        }
        return intervals;
    }

    // Evaluates each fixed university class period, marking it free only if
    // enough students have no class overlapping any part of that period.
    function evaluateSlots(busyByStudent, nStudents, thresholdPercent) {
        const results = [];
        for (const slot of CLASS_SLOTS) {
            let busyCount = 0;
            for (const sid in busyByStudent) {
                if (busyByStudent[sid].some(iv => iv.start < slot.end && iv.end > slot.start)) busyCount++;
            }
            const freeCount = nStudents - busyCount;
            const freePercent = nStudents > 0 ? (freeCount / nStudents) * 100 : 0;
            results.push({
                label: slot.label,
                start: slot.start,
                end: slot.end,
                freeCount,
                busyCount,
                isFree: freePercent >= thresholdPercent
            });
        }
        return results;
    }

    async function fetchSchedules(students) {
        const parser = new DOMParser();
        const schedules = {};
        const BASE = 'https://urms-awp.ulab.edu.bd';

        const getRes = await fetch(`${BASE}/StudentRegistration`, { credentials: 'include' });
        const getHtml = await getRes.text();
        const getDoc = parser.parseFromString(getHtml, 'text/html');

        const tokenEl = getDoc.querySelector('input[name="__RequestVerificationToken"]');
        if (!tokenEl) throw new Error('Could not find anti-forgery token on StudentRegistration page. Are you logged in to URMS?');
        const antiForgeryToken = tokenEl.value;

        const semesterEl = getDoc.querySelector('input[name="GenaratedCourseList.Semester"], select[name="GenaratedCourseList.Semester"]');
        const semesterId = semesterEl ? semesterEl.value : '';

        const today = new Date();
        const regDateString = [
            String(today.getDate()).padStart(2, '0'),
            String(today.getMonth() + 1).padStart(2, '0'),
            today.getFullYear()
        ].join('/');

        const staticFields = {
            'IsAddDropWithdraw': 'False',
            'IsCreditBased': '',
            'HasLateRegistrationWithoutFinePermission': 'False',
            'LateRegistrationFineEnabled': 'False',
            'RegistrationDateOver': 'True',
            'RegDateString': regDateString,
        };

        const total = students.length;
        for (let i = 0; i < students.length; i++) {
            const s = students[i];
            setRunStatus(`⏳ Fetching schedule ${i + 1}/${total}: ${s.name || s.id}`);

            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(staticFields)) params.append(k, v);
            params.append('GenaratedCourseList.Semester', semesterId);
            params.append('GenaratedCourseList.StudentId', s.id);
            params.append('btnLoad', 'Load');
            params.append('__RequestVerificationToken', antiForgeryToken);

            const postRes = await fetch(`${BASE}/StudentRegistration`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': `${BASE}/StudentRegistration`,
                },
                body: params.toString()
            });

            const postHtml = await postRes.text();
            const postDoc = parser.parseFromString(postHtml, 'text/html');

            const timeRangeRegex = /\d{1,2}:\d{2}\s*[AP]M\s*-\s*\d{1,2}:\d{2}\s*[AP]M/i;
            const scheds = [];
            for (const row of postDoc.querySelectorAll('table tr')) {
                const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());
                if (!cells.length) continue;
                const timeCell = cells.find(text => timeRangeRegex.test(text));
                if (timeCell) scheds.push(cells.join(' '));
            }
            schedules[s.id] = scheds;
        }
        return schedules;
    }

    async function runAnalysis() {
        const runBtn = $('ulab-step2-run');
        if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Running…'; }

        const students = PARSED_STUDENTS.filter(s => /^\d{9}$/.test(s.id));
        if (!students.length) {
            setRunStatus('❌ No valid 9-digit IDs found. Please check your entries.');
            if (runBtn) { runBtn.disabled = false; runBtn.textContent = '🚀 Find Free Time'; }
            return;
        }

        try {
            setRunStatus(`⏳ Fetching schedules for ${students.length} students…`);
            const schedules = await fetchSchedules(students);

            setRunStatus('⚙️ Computing common free time…');
            const busyByDayStudent = {};
            for (const d of DAY_ORDER) busyByDayStudent[d] = {};

            for (const s of students) {
                const sid = s.id;
                for (const text of (schedules[sid] || [])) {
                    for (const iv of parseScheduleString(text)) {
                        if (!busyByDayStudent[iv.day][sid]) busyByDayStudent[iv.day][sid] = [];
                        busyByDayStudent[iv.day][sid].push(iv);
                    }
                }
            }

            const nStudents = students.length;
            const results = {
                n_students: nStudents,
                threshold_percent: FREE_THRESHOLD_PERCENT,
                slots: CLASS_SLOTS.map(s => ({ label: s.label, start: s.start, end: s.end })),
                days: {}
            };
            for (const day of DAY_ORDER) {
                results.days[day] = evaluateSlots(busyByDayStudent[day], nStudents, FREE_THRESHOLD_PERCENT);
            }

            setRunStatus('✅ Done! Opening results…');
            chrome.storage.local.set({ ulabResults: results, ulabStudents: students, ulabSchedules: schedules }, () => {
                chrome.runtime.sendMessage({ action: 'openResults' });
                if (runBtn) { runBtn.disabled = false; runBtn.textContent = '🚀 Find Free Time'; }
            });

        } catch (err) {
            console.error('[ULAB]', err);
            setRunStatus(`❌ Error: ${err.message}`);
            if (runBtn) { runBtn.disabled = false; runBtn.textContent = '🚀 Find Free Time'; }
        }
    }

    // ── Feature entry point ─────────────────────────────────────────────────
    function mount(container) {
        root = container;
        showStep1();
    }

    window.ULAB_FEATURES = window.ULAB_FEATURES || [];
    window.ULAB_FEATURES.push({
        id: 'time',
        icon: '🕐',
        title: 'Free Time Finder',
        subtitle: 'Find common free class periods for a group of students',
        mount
    });
})();
