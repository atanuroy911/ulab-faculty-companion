// features/capstone-eligibility/capstone-eligibility.js — Capstone Eligibility feature module.
//
// Port of the standalone "URMS Capstone Eligibility Application.py" desktop
// tool into the extension. Same rule set, same gating courses, same
// allow-list of expected course codes (including the general-ed / core
// codes — GEF/UCC/GED/SSC/NSC/ESK — that must stay in the allow-list or
// every student gets a false "extra courses" flag). Uses the same
// authenticated fetch()/Load pattern the Advising and Bulk Save features
// already use instead of Selenium + a login form.
(function () {
    if (!document.getElementById('ulab-wizard-css')) {
        const link = document.createElement('link');
        link.id = 'ulab-wizard-css';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('features/common/wizard.css');
        document.head.appendChild(link);
    }

    // ── Config (ported from the Python tool) ────────────────────────────────
    const GATING_COURSES = ['CSE2200', 'CSE3103', 'CSE3200', 'CSE3203'];
    const PASSING_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D'];
    const NOT_COMPLETED_GRADES = ['F', 'R', 'I', 'S', 'W', 'AW'];
    const MIN_TOTAL_CREDIT = 105;

    // Every course code a student's transcript is expected to contain by the
    // time they reach Capstone. Anything else on the transcript is flagged as
    // an "extra course" worth a manual look. Includes ULAB's general-ed/core
    // codes (GEF, UCC, GED, SSC, NSC, ESK) alongside the CSE/MAT/PHY/EEE/STA
    // major courses — do not drop those when editing this list.
    const ALLOWED_COURSES = [
        'CSE1102', 'MAT1101', 'PHY1101', 'PHY1102',
        'CSE1201', 'CSE1202', 'CSE1203', 'MAT1201', 'PHY1301', 'CSE1301', 'CSE1302',
        'EEE1101', 'EEE1102',
        'MAT2101', 'CSE2101', 'CSE2102', 'CSE2103', 'CSE2104', 'CSE2201', 'CSE2202', 'CSE2203', 'STA2101',
        'EEE1301', 'EEE1302', 'CSE2200', 'CSE2301', 'CSE2302', 'CSE2303', 'CSE2305', 'CSE2306',
        'CSE3101', 'CSE3102', 'CSE3103', 'CSE3201', 'CSE3202', 'CSE3203', 'CSE3200', 'CSE3205', 'CSE3206', 'CSE3301', 'CSE3120',
        'GEF1101', 'GEF1201', 'UCC1101', 'UCC1201', 'GED2159', 'SSC2243', 'NSC2248',
        'ESK1110', 'ESK1111', 'ESK1112', 'ESK1113',
        'CSE4098-A', 'CSE4098-B', 'CSE4098-C', 'CSE4099',
    ];

    let PARSED_STUDENTS = [];
    let root = null;
    let stage = null;
    let currentStep = 1;
    const TOTAL_STEPS = 3;

    function $(id) { return root.querySelector('#' + id); }

    // ── Shell: progress dots + sliding stage (same pattern as the merged
    // Advising & Save/Bill wizard, features/advising-billing/wizard.js) ─────
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

    // ── Step 1: Get the list — instructions + paste box, one screen ─────────
    function showStep1(direction) {
        currentStep = 1;
        renderShell(`
            <div class="ulab-step-title">Get the list of students to check</div>
            <div class="ulab-step-subtitle">
                Whatever list you're working from — a department roster, an advising list, an Excel
                column of IDs — paste the Student IDs below, one per line. Each student's transcript is
                then checked (read-only) against the Capstone requirements: 105+ total credits and
                <strong>CSE2200, CSE3103, CSE3200, CSE3203</strong> all passed or in progress.
            </div>
            <div class="ulab-format-box">
                <div class="ulab-format-label">Expected format (one student per line)</div>
                <div class="ulab-format-example">253014001
253014002 Jannatul Ferduws
253014003, Md. Minhajur Rahman</div>
                <div class="ulab-format-hint">
                    💡 Only the <strong>9-digit Student ID</strong> is required per line — a name after it
                    is optional and just used as a label in the results.
                </div>
            </div>
            <textarea id="ulab-paste-box" placeholder="Paste or type Student IDs here, one per line…"></textarea>
            <div id="ulab-parse-preview"></div>
            <div class="ulab-wizard-nav">
                <button class="ulab-primary-btn" id="ulab-next" disabled>Parse Students →</button>
            </div>
        `, { direction });
        $('ulab-next').onclick = parseAndShowStep2;

        $('ulab-paste-box').addEventListener('input', () => {
            const text = $('ulab-paste-box').value;
            const students = parseStudentList(text);
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
        });
    }

    // Freeform: one Student ID per line, with an optional name (and optional
    // separating comma) after it — unlike Advising/Bulk Save, this list isn't
    // expected to come from any particular URMS page or fixed column layout.
    function parseStudentList(text) {
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
            const rest = emailMatch
                ? line.slice(idMatch.index + id.length, emailMatch.index)
                : line.slice(idMatch.index + id.length);
            const name = rest.replace(/^[\s,]+/, '').replace(/\s{2,}/g, ' ').trim();
            students.push({ id, name, email });
        }
        return students;
    }

    // ── Step 2: Confirm & edit list ──────────────────────────────────────────
    function parseAndShowStep2() {
        const text = $('ulab-paste-box').value;
        PARSED_STUDENTS = parseStudentList(text);
        if (PARSED_STUDENTS.length === 0) {
            $('ulab-parse-preview').innerHTML =
                `<div class="ulab-preview-warn">❌ No Student IDs found. Make sure you copied the full table.</div>`;
            return;
        }
        showStep2();
    }

    function showStep2(direction) {
        currentStep = 2;
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
            <div class="ulab-info-box">
                🎓 This only <strong>reads</strong> each student's transcript — nothing is submitted or
                changed in URMS. Results open in a report tab you can export as CSV or Excel.
            </div>
            <div class="ulab-wizard-nav">
                <button class="ulab-secondary-btn" id="ulab-back">← Back</button>
                <button class="ulab-primary-btn" id="ulab-next">🎓 Check Eligibility →</button>
            </div>
        `, { direction });

        $('ulab-back').onclick = () => showStep1('back');
        $('ulab-next').onclick = showStep3;

        $('ulab-student-list').addEventListener('input', e => {
            const idx = parseInt(e.target.dataset.idx, 10);
            if (e.target.classList.contains('ulab-id-input')) PARSED_STUDENTS[idx].id = e.target.value.trim();
            if (e.target.classList.contains('ulab-name-input')) PARSED_STUDENTS[idx].name = e.target.value.trim();
        });
        $('ulab-student-list').addEventListener('click', e => {
            if (e.target.classList.contains('ulab-remove-btn')) {
                const idx = parseInt(e.target.dataset.idx, 10);
                PARSED_STUDENTS.splice(idx, 1);
                showStep2();
            }
        });
    }

    // ── Step 3: Run the eligibility check, then hand off to the report tab ──
    function showStep3(direction) {
        currentStep = 3;
        renderShell(`
            <div class="ulab-step-title">Checking each student…</div>
            <div class="ulab-step-subtitle">Reading each student's transcript (read-only). May take a moment for large lists.</div>
            <div id="ulab-run-status"></div>
            <div class="ulab-wizard-nav">
                <button class="ulab-secondary-btn" id="ulab-back">← Back</button>
            </div>
        `, { direction });
        $('ulab-back').onclick = () => showStep2('back');
        runEligibilityCheck();
    }

    function setRunStatus(msg) {
        const el = $('ulab-run-status');
        if (el) el.innerHTML = `<div class="ulab-run-status-msg">${msg}</div>`;
    }

    // ── HTML scraping helpers (same shape as Advising's) ────────────────────
    function labeledValue(doc, label) {
        const nodes = doc.querySelectorAll('div.col-sm-4, label.col-sm-4');
        for (const node of nodes) {
            const text = node.textContent.replace(/\s+/g, ' ').trim();
            if (text.startsWith(label)) {
                const sib = node.nextElementSibling;
                return sib ? sib.textContent.replace(/\s+/g, ' ').trim() : '';
            }
        }
        return '';
    }

    function findCardByTitle(doc, titleText) {
        const titles = doc.querySelectorAll('.card-title');
        for (const el of titles) {
            if (el.textContent.replace(/\s+/g, ' ').trim() === titleText) {
                return el.closest('.card');
            }
        }
        return null;
    }

    function parseGenericTable(table) {
        if (!table) return [];
        const headers = Array.from(table.querySelectorAll('thead th'))
            .map(th => th.textContent.replace(/\s+/g, ' ').trim());
        const rows = [];
        for (const tr of table.querySelectorAll('tbody tr')) {
            const cells = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.replace(/\s+/g, ' ').trim());
            if (!cells.length || cells.every(c => !c)) continue;
            if (headers.length) {
                const row = {};
                headers.forEach((h, i) => { row[h || `col${i}`] = cells[i] || ''; });
                rows.push(row);
            } else {
                rows.push({ cells });
            }
        }
        return rows;
    }

    function parseKeyValueTable(table) {
        const result = {};
        if (!table) return result;
        for (const tr of table.querySelectorAll('tr')) {
            const tds = tr.querySelectorAll('td');
            if (tds.length >= 2) {
                const key = tds[0].textContent.replace(/\s+/g, ' ').trim().replace(/\s*:\s*$/, '');
                const value = tds[1].textContent.replace(/\s+/g, ' ').trim();
                if (key) result[key] = value;
            }
        }
        return result;
    }

    function semesterRank(semStr) {
        const m = (semStr || '').match(/(Spring|Summer|Fall)\s+(\d{4})/i);
        if (!m) return 0;
        const termRank = { spring: 1, summer: 2, fall: 3 }[m[1].toLowerCase()] || 0;
        return parseInt(m[2], 10) * 10 + termRank;
    }

    // Resolve a raw transcript course code to the catalogue's canonical
    // UNESCO code where known, so legacy-vs-UNESCO code mismatches between
    // semesters don't break the gating-course or extra-course checks. Falls
    // back to the normalized raw code for anything the catalogue doesn't
    // recognize (e.g. codes with no catalogue entry yet).
    function canonicalCode(rawCode) {
        const raw = (rawCode || '').replace(/\s+/g, '').toUpperCase();
        const cat = window.ULAB_CATALOGUE;
        const resolved = cat && cat.resolve(raw);
        return resolved ? cat.normalizeUnesco(resolved.unescoCode) : raw;
    }

    const ALLOWED_CANONICAL = new Set(ALLOWED_COURSES.map(canonicalCode));

    // ── Load one student's transcript and evaluate Capstone eligibility ────
    async function checkOneStudent(s, { parser, BASE, token, semesterId }) {
        const today = new Date();
        const regDateString = [
            String(today.getDate()).padStart(2, '0'),
            String(today.getMonth() + 1).padStart(2, '0'),
            today.getFullYear()
        ].join('/');

        const params = new URLSearchParams();
        params.append('IsAddDropWithdraw', 'False');
        params.append('IsCreditBased', '');
        params.append('HasLateRegistrationWithoutFinePermission', 'False');
        params.append('LateRegistrationFineEnabled', 'False');
        params.append('RegistrationDateOver', 'True');
        params.append('RegDateString', regDateString);
        params.append('GenaratedCourseList.Semester', semesterId);
        params.append('GenaratedCourseList.StudentId', s.id);
        params.append('btnLoad', 'Load');
        params.append('__RequestVerificationToken', token);

        const res = await fetch(`${BASE}/StudentRegistration`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': `${BASE}/StudentRegistration` },
            body: params.toString(),
        });
        const doc = parser.parseFromString(await res.text(), 'text/html');

        const nameEl = doc.querySelector('#StudentName');
        const urmsName = nameEl ? nameEl.textContent.replace(/\s+/g, ' ').trim() : '';
        const email = labeledValue(doc, 'Email');
        const mobile = labeledValue(doc, 'Mobile');

        const t4Tables = doc.querySelectorAll('#T4');
        const completedCourses = parseGenericTable(t4Tables[0]);

        const infoCard = findCardByTitle(doc, 'Student Information');
        const studentInfo = parseKeyValueTable(infoCard ? infoCard.querySelector('table') : null);
        const earnedCredit = parseFloat(studentInfo['Total Credit Hours Completed']) || 0;

        // Group grades per canonical course code, taking the most recent
        // semester's grade as the course's current status (a retake in a
        // later semester should override an earlier failing grade).
        const byCourse = {};
        let currentCredit = 0;
        const seenCodes = new Set();
        const courseHistory = [];

        for (const row of completedCourses) {
            const rawId = (row['CourseID'] || row['CourseId'] || '').trim();
            if (!rawId) continue;
            const code = canonicalCode(rawId);
            seenCodes.add(code);
            const grade = (row['Grade'] || '').trim();
            const credit = parseFloat(row['Credit']) || 0;
            const semester = (row['Semester'] || '').trim();
            const rank = semesterRank(semester);

            const attempts = (byCourse[code] = byCourse[code] || []);
            attempts.push({ grade, rank });

            const inProgress = grade === '';
            if (inProgress) currentCredit += credit; // in progress this semester

            let rowStatus;
            if (inProgress) rowStatus = 'In Progress';
            else if (PASSING_GRADES.includes(grade)) rowStatus = 'Passed';
            else if (NOT_COMPLETED_GRADES.includes(grade)) rowStatus = 'Not Completed';
            else rowStatus = 'Unknown Grade';

            const cat = window.ULAB_CATALOGUE;
            const title = (cat && cat.titleFor(code)) || '';

            courseHistory.push({
                semester,
                courseId: rawId,
                canonicalCode: code,
                title,
                credit,
                grade: inProgress ? '' : grade,
                status: rowStatus,
                isGating: GATING_COURSES.map(canonicalCode).includes(code),
                isExtra: !ALLOWED_CANONICAL.has(code),
            });
        }
        courseHistory.sort((a, b) => semesterRank(a.semester) - semesterRank(b.semester));

        function statusFor(code) {
            const attempts = byCourse[code];
            if (!attempts || !attempts.length) return 'Not Completed';
            const latest = attempts.slice().sort((a, b) => a.rank - b.rank).pop();
            if (latest.grade === '') return 'Taken'; // in progress
            if (PASSING_GRADES.includes(latest.grade)) return 'Passed';
            if (NOT_COMPLETED_GRADES.includes(latest.grade)) return 'Not Completed';
            return 'Not Completed';
        }

        const courseStatus = {};
        for (const code of GATING_COURSES) courseStatus[code] = statusFor(canonicalCode(code));

        const totalCredit = earnedCredit + currentCredit;
        const coursesOk = GATING_COURSES.every(code => ['Passed', 'Taken'].includes(courseStatus[code]));
        const eligible = totalCredit >= MIN_TOTAL_CREDIT && coursesOk;

        const extraCourses = Array.from(seenCodes).filter(code => !ALLOWED_CANONICAL.has(code));

        // Plain-language reasoning behind the eligibility verdict, shown when
        // a student's row is expanded in the report.
        const explanation = [];
        explanation.push(
            totalCredit >= MIN_TOTAL_CREDIT
                ? `✅ Total credit is ${totalCredit} (${earnedCredit} completed + ${currentCredit} in progress) — meets the ${MIN_TOTAL_CREDIT}-credit minimum.`
                : `❌ Total credit is ${totalCredit} (${earnedCredit} completed + ${currentCredit} in progress) — short of the ${MIN_TOTAL_CREDIT}-credit minimum by ${(MIN_TOTAL_CREDIT - totalCredit).toFixed(2)}.`
        );
        for (const code of GATING_COURSES) {
            const status = courseStatus[code];
            const ok = ['Passed', 'Taken'].includes(status);
            explanation.push(`${ok ? '✅' : '❌'} ${code}: ${status}.`);
        }
        if (extraCourses.length) {
            explanation.push(`ℹ️ ${extraCourses.length} transcript course(s) fell outside the expected course list — see "Extra Courses" below; worth a manual look, not necessarily a problem.`);
        }

        return {
            id: s.id,
            name: s.name || urmsName,
            email: email || s.email || '',
            mobile,
            eligibility: eligible ? 'Eligible' : 'Not Eligible',
            courseStatus,
            earnedCredit,
            currentCredit,
            totalCredit,
            extraCourses,
            explanation,
            courseHistory,
        };
    }

    async function runEligibilityCheck() {
        const students = PARSED_STUDENTS.filter(s => /^\d{9}$/.test(s.id));
        if (!students.length) {
            setRunStatus('❌ No valid 9-digit IDs found. Please go back and check your entries.');
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
            let token = tokenEl.value;
            const semesterEl = getDoc.querySelector('input[name="GenaratedCourseList.Semester"], select[name="GenaratedCourseList.Semester"]');
            const semesterId = semesterEl ? semesterEl.value : '';

            for (let i = 0; i < students.length; i++) {
                const s = students[i];
                setRunStatus(`⏳ ${i + 1}/${students.length}: checking ${s.name || s.id}…`);
                try {
                    const result = await checkOneStudent(s, { parser, BASE, token, semesterId });
                    results.push(result);
                } catch (err) {
                    console.error('[ULAB Capstone Eligibility]', s.id, err);
                    results.push({ id: s.id, name: s.name, error: err.message });
                }
            }

            setRunStatus('✅ Done! Opening report…');
            chrome.storage.local.set({ ulabCapstoneResults: results }, () => {
                chrome.runtime.sendMessage({ action: 'openCapstoneResults' });
            });
        } catch (err) {
            console.error('[ULAB Capstone Eligibility]', err);
            setRunStatus(`❌ Error: ${err.message}`);
        }
    }

    function mount(container) {
        root = container;
        PARSED_STUDENTS = [];
        currentStep = 1;
        showStep1();
    }

    window.ULAB_FEATURES = window.ULAB_FEATURES || [];
    window.ULAB_FEATURES.push({
        id: 'capstone-eligibility',
        icon: '📜',
        title: 'Capstone Eligibility',
        subtitle: 'Check a batch of students against the Capstone requirements — read-only (Only for CSE)',
        mount,
    });
})();
