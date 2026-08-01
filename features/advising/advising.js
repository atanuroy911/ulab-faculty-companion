// features/advising/advising.js — Advising engine module (no side-panel UI).
// Exposes scraping + analysis of a student's StudentRegistration/AddAndDrop
// page (probation, prereqs, retakes, schedule conflicts) as
// window.ULAB_ADVISING_CORE, consumed by:
//   - features/advising-billing/wizard.js (side panel, runs the analysis for
//     a pasted/uploaded student list)
//   - features/advising/student-page-content.js (floating "Run Advising"
//     button injected on the live URMS StudentRegistration page)
(function () {
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
                const key = tds[0].textContent.replace(/\s+/g, ' ').trim().replace(/\s*:\s*$/, '');
                const value = tds[1].textContent.replace(/\s+/g, ' ').trim();
                if (key) result[key] = value;
            }
        }
        return result;
    }

    // URMS shows a plain sentence like "It is not Pre-Registration time." in
    // place of the course table when pre-registration/registration hasn't
    // opened yet for the current period — that's a *scheduling* notice, not
    // "the student has no courses added", so it needs to be surfaced
    // distinctly rather than silently rendered as an empty course list.
    function findRegistrationNotice(doc) {
        if (!doc.body) return null;
        // Walk text nodes directly (skipping <script>/<style> — inline <style>
        // blocks sitting inside <body> on this page otherwise leak raw CSS
        // text into body.textContent, e.g. "wCancel:hover { }" ending up
        // glued onto the front of the actual notice sentence).
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const tag = node.parentElement && node.parentElement.tagName;
                return (tag === 'SCRIPT' || tag === 'STYLE') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }
        });
        let combined = '';
        let node;
        while ((node = walker.nextNode())) combined += node.textContent + ' ';
        combined = combined.replace(/\s+/g, ' ').trim();

        // Reconstruct the known phrase directly rather than expanding out to
        // "sentence boundaries" — this page has no period (or any other
        // delimiter) between this notice and adjacent text like the logged-in
        // user's name or a "Logout" link, so any expansion attempt ends up
        // grabbing that unrelated neighboring text too (seen in practice:
        // "SHUVAM ! Logout Student Registration It is not Pre-Registration
        // time." instead of just the notice itself).
        const m = /\b(it\s+is\s+)?not\s+pre-?registration\s+time\b\.?/i.exec(combined);
        if (m) {
            let text = m[0].trim().replace(/\.$/, '');
            if (!/^it\s+is/i.test(text)) text = 'It is ' + text;
            return text.charAt(0).toUpperCase() + text.slice(1) + '.';
        }

        const m2 = /\bregistration\s+is\s+not\s+open\b\.?/i.exec(combined);
        if (m2) {
            const text = m2[0].trim().replace(/\.$/, '');
            return text.charAt(0).toUpperCase() + text.slice(1) + '.';
        }

        return null;
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
            registrationNotice: findRegistrationNotice(doc),
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
    function canonicalCode(rawCode, cat) {
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

    // Days of week code used by the schedule strings URMS returns (matches
    // features/time/time.js's DAY_ORDER, kept in sync manually since that
    // file's copy is module-private).
    const DAY_ORDER = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    // A student registering for 3+ theory courses that all meet on the same
    // day of week means all 3 finals would also fall on that same day —
    // discouraged, not a hard rule, so it's surfaced as a warning rather than
    // blocking anything. Only counts Theory courses (see courseType on each
    // catalogue entry) — labs don't have finals, so they don't count here.
    function findTheoryDayConflicts(coursesToRegister, cat) {
        if (!window.ulabParseSchedule) return []; // features/time/time.js not loaded
        const byDay = {};
        for (const c of (coursesToRegister || [])) {
            const cid = canonicalCode(c.courseId, cat);
            const course = cat && cat.resolve(cid);
            const isTheory = course ? course.courseType !== 'Lab' : !/\blab\b/i.test(c.title || '');
            if (!isTheory) continue;
            const days = new Set(window.ulabParseSchedule(c.schedule || '').map(iv => iv.day));
            for (const day of days) {
                (byDay[day] = byDay[day] || []).push({ courseId: cid, title: c.title || (cat && cat.titleFor(cid)) || cid });
            }
        }
        const conflicts = [];
        for (const day of DAY_ORDER) {
            if (byDay[day] && byDay[day].length >= 3) conflicts.push({ day, courses: byDay[day] });
        }
        return conflicts;
    }

    function analyzeStudent(info, cat) {
        const result = {
            probationTier: null,
            finalProbation: false,
            needsRetake: [],
            prereqIssues: [],
            labWithoutTheory: [],
            theoryDayConflicts: [],
            degreeProgress: null,
        };
        if (!cat) return result;

        result.degreeProgress = computeDegreeProgress(cat, info.completedCourses || []);

        // Probation tier, e.g. "Student is in Probation number-2" → 2.
        if (info.probation) {
            const m = info.probation.match(/number[-\s]*([0-9]+)/i);
            result.probationTier = m ? parseInt(m[1], 10) : 'unspecified';
            // Final probation (Probation 3 — CGPA below 2.00 for the last 3
            // consecutive terms): these students cannot self-register online;
            // registration must go through their Department Head/Coordinator
            // via request email or in person.
            result.finalProbation = result.probationTier === 3;
        }

        // Group course history by canonical course code — resolved to the
        // catalogue's current UNESCO code where possible, so a course taken
        // under its legacy local code in one semester still matches the same
        // course referenced by UNESCO code elsewhere (e.g. as a prerequisite).
        const byCourse = {};
        for (const row of (info.completedCourses || [])) {
            const rawId = row['CourseID'] || row['CourseId'] || '';
            if (!rawId.trim()) continue;
            const courseId = canonicalCode(rawId, cat);
            (byCourse[courseId] = byCourse[courseId] || []).push({
                semester: row['Semester'] || '',
                grade: (row['Grade'] || '').trim(),
                rank: semesterRank(row['Semester']),
            });
        }

        const registeringSet = new Set((info.coursesToRegister || []).map(c => canonicalCode(c.courseId, cat)));

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
            const cid = canonicalCode(c.courseId, cat);
            const prereqs = cat.prereqUnescoFor(cid);
            if (!prereqs.length) continue;
            const missing = prereqs.filter(p => {
                const norm = canonicalCode(p, cat);
                const attempts = byCourse[norm];
                if (!attempts) return true;
                const hasPass = attempts.some(a => a.grade && !/^F$/i.test(a.grade));
                if (hasPass) return false;
                // An attempt with no grade yet (blank/"—") means the course is
                // currently in progress this semester — not failed, just
                // ungraded — so don't flag it as a missing prerequisite.
                const inProgress = attempts.some(a => !a.grade);
                return !inProgress;
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
            const cid = canonicalCode(c.courseId, cat);
            const theory = cat.theoryForLab(cid);
            if (!theory) continue;
            const theoryCode = canonicalCode(theory.unescoCode, cat);
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

        // 3+ theory courses landing on the same day of the week.
        result.theoryDayConflicts = findTheoryDayConflicts(info.coursesToRegister, cat);

        return result;
    }

    async function fetchAdvisingDetails(students, cat, onProgress) {
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
            if (onProgress) onProgress(i + 1, total, s);

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
                info.advising = analyzeStudent(info, cat);
                details[s.id] = info;
            } catch (err) {
                console.error('[ULAB Advising]', s.id, err);
                details[s.id] = { error: err.message };
            }
        }
        return details;
    }

    // Exposed so other consumers (features/advising-billing/wizard.js in the
    // side panel, and the StudentRegistration page's floating "Run Advising"
    // button, features/advising/student-page-content.js) can reuse this
    // scraping/analysis logic instead of duplicating it.
    window.ULAB_ADVISING_CORE = { extractAdvisingInfo, analyzeStudent, canonicalCode, normCode, parseAdvisingStudents, fetchAdvisingDetails };
})();
