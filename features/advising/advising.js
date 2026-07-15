// features/advising/advising.js — Student Advising feature module.
// Paste an "Advising Student" list from URMS, then check every student one
// by one against their StudentRegistration/AddAndDrop page — surfacing
// probation status, advisor, CGPA, credits, and pending course registration.
// Runs entirely inside the side panel; no content script required.
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

    // ── Step 1: Paste box ────────────────────────────────────────────────────
    function showStep1() {
        root.innerHTML = `
            <div class="ulab-step-icon">🎓</div>
            <p class="ulab-step-desc">
                Open <strong>Advisor → Advising Student</strong> on URMS, select all
                the rows in the table, copy them, then paste below.
            </p>
            <div class="ulab-format-box">
                <div class="ulab-format-label">Expected format (one student per line)</div>
                <div class="ulab-format-example">1 253014001 Md. Minhajur Rahman minhajur.rahman.cse@ulab.edu.bd 1855533355 OK 20 Apr 2026 OK
2 253014002 Jannatul Ferduws jannatul.ferduws.cse@ulab.edu.bd 01932006166 OK 20 Apr 2026 OK</div>
                <div class="ulab-format-hint">
                    💡 Each line needs a <strong>9-digit Student ID</strong> and an
                    <strong>@ulab.edu.bd email</strong> somewhere on it — everything else
                    (name, contact, registration/payment flags) is parsed around those.
                </div>
            </div>
            <textarea id="ulab-paste-box" placeholder="Paste the Advising Student table here…"></textarea>
            <div id="ulab-parse-preview"></div>
            <button class="ulab-primary-btn" id="ulab-step1-next">Parse Students →</button>
        `;
        $('ulab-step1-next').onclick = parseAndShowStep2;

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

    // ── Parse pasted advising list into structured students ─────────────────
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

            const afterId = line.slice(idMatch.index + id.length);
            const nameSpan = emailMatch
                ? line.slice(idMatch.index + id.length, emailMatch.index)
                : afterId;
            const name = nameSpan.replace(/\s{2,}/g, ' ').trim();

            const tail = emailMatch ? line.slice(emailMatch.index + email.length).trim() : '';
            const contactMatch = tail.match(/\d{7,15}/);
            const contact = contactMatch ? contactMatch[0] : '';
            const flags = contactMatch ? tail.slice(contactMatch.index + contact.length).trim() : tail;

            students.push({ id, name, email, contact, flags });
        }
        return students;
    }

    // ── Step 2: Confirm student list & run ──────────────────────────────────
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
                <button class="ulab-remove-btn" data-idx="${i}" title="Remove">✕</button>
            </div>
        `).join('');

        root.innerHTML = `
            <p class="ulab-step-desc">
                Found <strong>${PARSED_STUDENTS.length}</strong> students. Edit or remove any incorrect entries.
            </p>
            <div id="ulab-student-list">${listHTML}</div>
            <div class="ulab-btn-row" style="margin-top:14px">
                <button class="ulab-secondary-btn" id="ulab-step2-back">← Back</button>
                <button class="ulab-primary-btn"   id="ulab-step2-run">🚀 Check Advising</button>
            </div>
            <div id="ulab-run-status"></div>
        `;

        $('ulab-step2-back').onclick = showStep1;
        $('ulab-step2-run').onclick = runAdvising;

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

    function setRunStatus(msg) {
        const el = $('ulab-run-status');
        if (el) el.innerHTML = `<div class="ulab-run-status-msg">${msg}</div>`;
    }

    // ── HTML scraping helpers (operate on a detached DOMParser document) ────
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
                const key = tds[0].textContent.replace(/\s+/g, ' ').trim().replace(/:\s*$/, '');
                const value = tds[1].textContent.replace(/\s+/g, ' ').trim();
                if (key) result[key] = value;
            }
        }
        return result;
    }

    function extractAdvisingInfo(doc) {
        const probationEl = doc.querySelector('p.bg-warning.text-dark');
        const t1Rows = Array.from(doc.querySelectorAll('#T1 tbody tr')).map(tr => {
            const tds = tr.querySelectorAll('td');
            return {
                courseId: tds[0] ? tds[0].textContent.trim() : '',
                title: tds[1] ? tds[1].textContent.trim() : '',
                section: tds[2] ? tds[2].textContent.trim() : '',
                schedule: tds[3] ? tds[3].textContent.trim() : '',
            };
        });

        const t4Tables = doc.querySelectorAll('#T4');
        const completedCourses = parseGenericTable(t4Tables[0]);
        const semesterGpa = parseGenericTable(t4Tables[1]);

        const totalCreditEl = doc.querySelector('#TotalCredit');

        const infoCard = findCardByTitle(doc, 'Student Information');
        const studentInfo = parseKeyValueTable(infoCard ? infoCard.querySelector('table') : null);

        const transferredCard = findCardByTitle(doc, 'Transferred/Waived Courses');
        const transferredCourses = parseGenericTable(transferredCard ? transferredCard.querySelector('table') : null);

        const nameEl = doc.querySelector('#StudentName');

        return {
            urmsName: nameEl ? nameEl.textContent.replace(/\s+/g, ' ').trim() : '',
            mobile: labeledValue(doc, 'Mobile'),
            urmsEmail: labeledValue(doc, 'Email'),
            advisor: labeledValue(doc, 'Advisor'),
            program: labeledValue(doc, 'Program'),
            probation: probationEl ? probationEl.textContent.replace(/\s+/g, ' ').trim() : null,
            coursesToRegister: t1Rows,
            totalCreditRegistering: totalCreditEl ? totalCreditEl.value : '',
            completedCourses,
            semesterGpa,
            studentInfo,
            transferredCourses,
        };
    }

    // ── Retake / prerequisite / probation-tier analysis ─────────────────────
    // Runs against data already scraped from the student's page. This is a
    // best-effort automated check (the prerequisite map is hand-transcribed
    // from the catalogue PDF) — results should be spot-checked, not treated
    // as authoritative.
    function normCode(c) { return (c || '').replace(/\s+/g, '').toUpperCase(); }

    // A student's course history can mix code formats across semesters —
    // older rows sometimes show the legacy local code (e.g. "CSE1301")
    // instead of the current UNESCO code. Resolve to the catalogue's
    // canonical UNESCO code wherever possible so the same course always maps
    // to the same key, regardless of which format a given row used; falls
    // back to the raw normalized code for anything the catalogue doesn't
    // recognize (at least self-consistent for repeated raw strings).
    function canonicalCode(rawCode) {
        const cat = window.ULAB_CATALOGUE;
        const resolved = cat && cat.resolve(rawCode);
        return resolved ? cat.normalizeUnesco(resolved.unescoCode) : normCode(rawCode);
    }

    function semesterRank(semStr) {
        const m = (semStr || '').match(/(Spring|Summer|Fall)\s+(\d{4})/i);
        if (!m) return 0;
        const termRank = { spring: 1, summer: 2, fall: 3 }[m[1].toLowerCase()] || 0;
        return parseInt(m[2], 10) * 10 + termRank;
    }

    // Sums a student's completed/in-progress credit hours per degree-
    // requirement category and compares against the catalogue's targets.
    // Failed courses don't count; blank-grade rows (in-progress this
    // semester) count separately from earned credits so both can be shown.
    function computeDegreeProgress(cat, completedRows) {
        const requirements = cat.degreeRequirements;
        const earned = {};
        const inProgress = {};

        for (const row of completedRows) {
            const courseId = normCode(row['CourseID'] || row['CourseId'] || '');
            if (!courseId) continue;
            const category = cat.categoryFor(courseId);
            if (!(category in requirements.credits)) continue; // e.g. ESK — not a CSE degree requirement
            const credit = parseFloat(row['Credit']) || 0;
            const grade = (row['Grade'] || '').trim();

            if (/^F$/i.test(grade)) continue; // failed — doesn't count toward completion

            if (grade) {
                earned[category] = (earned[category] || 0) + credit;
            } else {
                inProgress[category] = (inProgress[category] || 0) + credit;
            }
        }

        const progress = Object.keys(requirements.credits).map(category => {
            const earnedCredits = earned[category] || 0;
            const inProgressCredits = inProgress[category] || 0;
            const required = requirements.credits[category];
            const total = earnedCredits + inProgressCredits;
            return {
                category,
                label: requirements.labels[category],
                earnedCredits,
                inProgressCredits,
                required,
                shortBy: Math.max(0, required - total),
            };
        });

        return { progress };
    }

    function analyzeStudent(info) {
        const cat = window.ULAB_CATALOGUE;
        const result = { probationTier: null, needsRetake: [], prereqIssues: [], labWithoutTheory: [], degreeProgress: null };
        if (!cat) return result;

        result.degreeProgress = computeDegreeProgress(cat, info.completedCourses || []);

        // Probation tier, e.g. "Student is in Probation number-2" → 2.
        if (info.probation) {
            const m = info.probation.match(/number[-\s]*([0-9]+)/i);
            result.probationTier = m ? parseInt(m[1], 10) : 'unspecified';
        }

        // Group course history by canonical course code — resolved to the
        // catalogue's current UNESCO code where possible, so a course taken
        // under its legacy local code in one semester still matches the same
        // course referenced by UNESCO code elsewhere (e.g. as a prerequisite).
        const byCourse = {};
        for (const row of (info.completedCourses || [])) {
            const rawId = row['CourseID'] || row['CourseId'] || '';
            if (!rawId.trim()) continue;
            const courseId = canonicalCode(rawId);
            (byCourse[courseId] = byCourse[courseId] || []).push({
                semester: row['Semester'] || '',
                grade: (row['Grade'] || '').trim(),
                rank: semesterRank(row['Semester']),
            });
        }

        const registeringSet = new Set((info.coursesToRegister || []).map(c => canonicalCode(c.courseId)));

        // Courses that were failed and never passed since.
        for (const courseId in byCourse) {
            const attempts = byCourse[courseId].slice().sort((a, b) => a.rank - b.rank);
            const hasFail = attempts.some(a => /^F$/i.test(a.grade));
            const hasPass = attempts.some(a => a.grade && !/^F$/i.test(a.grade));
            if (hasFail && !hasPass) {
                result.needsRetake.push({
                    courseId,
                    title: cat.titleFor(courseId) || courseId,
                    attempts: attempts.map(a => `${a.semester || '—'}: ${a.grade || '—'}`),
                    retakingNow: registeringSet.has(courseId),
                });
            }
        }

        // Prerequisite gaps among courses the student has added this semester.
        for (const c of (info.coursesToRegister || [])) {
            const cid = canonicalCode(c.courseId);
            const prereqs = cat.prereqUnescoFor(cid);
            if (!prereqs.length) continue;
            const missing = prereqs.filter(p => {
                const norm = canonicalCode(p);
                const attempts = byCourse[norm];
                if (!attempts) return true;
                return !attempts.some(a => a.grade && !/^F$/i.test(a.grade));
            });
            if (missing.length) {
                result.prereqIssues.push({
                    courseId: cid,
                    title: c.title || cat.titleFor(cid) || cid,
                    missing: missing.map(m => ({ courseId: m, title: cat.titleFor(m) || m })),
                });
            }
        }

        // Labs registered without their theory course ever taken or being
        // taken concurrently. Not a declared "prerequisite" in the catalogue —
        // it's a separate policy (theory must come before or alongside its
        // lab) — so it's tracked separately from prereqIssues above.
        for (const c of (info.coursesToRegister || [])) {
            const cid = canonicalCode(c.courseId);
            const theory = cat.theoryForLab(cid);
            if (!theory) continue;
            const theoryCode = canonicalCode(theory.unescoCode);
            const takenBefore = !!byCourse[theoryCode];
            const takingNow = registeringSet.has(theoryCode);
            if (!takenBefore && !takingNow) {
                result.labWithoutTheory.push({
                    labCourseId: cid,
                    labTitle: c.title || cat.titleFor(cid) || cid,
                    theoryCourseId: theory.unescoCode,
                    theoryTitle: theory.title,
                });
            }
        }

        return result;
    }

    async function fetchAdvisingDetails(students) {
        const parser = new DOMParser();
        const details = {};
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
            setRunStatus(`⏳ Checking ${i + 1}/${total}: ${s.name || s.id}`);

            try {
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
                const info = extractAdvisingInfo(postDoc);
                info.advising = analyzeStudent(info);
                details[s.id] = info;
            } catch (err) {
                console.error('[ULAB Advising]', s.id, err);
                details[s.id] = { error: err.message };
            }
        }
        return details;
    }

    async function runAdvising() {
        const runBtn = $('ulab-step2-run');
        if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Running…'; }

        const students = PARSED_STUDENTS.filter(s => /^\d{9}$/.test(s.id));
        if (!students.length) {
            setRunStatus('❌ No valid 9-digit IDs found. Please check your entries.');
            if (runBtn) { runBtn.disabled = false; runBtn.textContent = '🚀 Check Advising'; }
            return;
        }

        try {
            setRunStatus(`⏳ Checking ${students.length} students…`);
            const details = await fetchAdvisingDetails(students);

            setRunStatus('✅ Done! Opening results…');
            chrome.storage.local.set({ ulabAdvisingStudents: students, ulabAdvisingDetails: details }, () => {
                chrome.runtime.sendMessage({ action: 'openAdvisingResults' });
                if (runBtn) { runBtn.disabled = false; runBtn.textContent = '🚀 Check Advising'; }
            });
        } catch (err) {
            console.error('[ULAB Advising]', err);
            setRunStatus(`❌ Error: ${err.message}`);
            if (runBtn) { runBtn.disabled = false; runBtn.textContent = '🚀 Check Advising'; }
        }
    }

    // ── Feature entry point ─────────────────────────────────────────────────
    function mount(container) {
        root = container;
        showStep1();
    }

    window.ULAB_FEATURES = window.ULAB_FEATURES || [];
    window.ULAB_FEATURES.push({
        id: 'advising',
        icon: '🎓',
        title: 'Student Advising',
        subtitle: 'Check probation, CGPA and registration status for a group of students',
        mount
    });
})();
