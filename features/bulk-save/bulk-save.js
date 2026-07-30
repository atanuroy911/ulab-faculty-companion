// features/bulk-save/bulk-save.js — Save/Bill engine module (no side-panel UI).
//
// For a given student, this loads their AddAndDrop page (same call the
// Time/Advising features already make) and then replays exactly what
// clicking the page's own "Save" button does: submits the currently-staged
// Course/Section/CourseCredit rows back to URMS, using the live hidden-field
// values scraped from that same response (RegDateString, IsCreditBased,
// FineAmount, etc. are per-student/per-semester values baked into the page —
// never guessed or hardcoded here).
//
// This WRITES to real student registration records. It does not add, remove,
// or edit any course — it only confirms what's already staged on the
// student's own page, per design.
//
// Exposed as window.ULAB_SAVE_ENGINE, consumed by the merged results page
// (features/advising-billing/results.js) for both per-card and bulk
// Save/Save+Bill actions.
(function () {
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
    // Accepts an optional pre-fetched token/semesterId (used by a bulk run to
    // avoid re-fetching the token page for every student); fetches its own
    // when omitted (used by a standalone per-student Save action). `onLog`,
    // if given, is called as (studentId, name, statusClass, message) for
    // every notable event — the caller decides how/whether to display it.
    async function saveOneStudent(s, { parser, BASE, emailBillEnabled, sharedToken, semesterId, onLog }) {
        const log = onLog || (() => {});
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
            log(s.id, s.name, 'skip', '⚠️ No staged courses found — skipped');
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
            log(s.id, s.name, 'fail', `❌ HTTP ${saveRes.status} — please verify manually`);
            return {
                id: s.id, name: s.name, status: 'failed', detail: `HTTP ${saveRes.status}`, courses: state.rows,
                rowMsg: `❌ HTTP ${saveRes.status}`, rowClass: 'fail', token, semesterId,
            };
        }
        if (err) {
            log(s.id, s.name, 'fail', `❌ ${err}`);
            return {
                id: s.id, name: s.name, status: 'failed', detail: err, courses: state.rows,
                rowMsg: '❌ Failed', rowClass: 'fail', token, semesterId,
            };
        }
        if (confirmed) {
            log(s.id, s.name, 'ok', `✅ Saved successfully — ${state.rows.length} course(s)`);
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
                            log(s.id, s.name, 'ok', '📧 Bill emailed');
                            billDetail += ' — bill emailed';
                            rowMsg = '✅ Saved + 📧';
                        } else {
                            log(s.id, s.name, 'skip', `⚠️ Bill email request failed — HTTP ${billRes.status}`);
                            billDetail += ` — bill email failed (HTTP ${billRes.status})`;
                            rowMsg = '✅ Saved, ⚠️ bill failed';
                        }
                    } catch (billErr) {
                        log(s.id, s.name, 'skip', `⚠️ Bill email request failed — ${billErr.message}`);
                        billDetail += ` — bill email failed (${billErr.message})`;
                        rowMsg = '✅ Saved, ⚠️ bill failed';
                    }
                } else {
                    log(s.id, s.name, 'skip', '⚠️ No "Email Bill" link found on Save response — skipped');
                    billDetail += ' — no Email Bill link found';
                    rowMsg = '✅ Saved, ⚠️ no bill link';
                }
            }
            return {
                id: s.id, name: s.name, status: 'saved', detail: billDetail, courses: state.rows,
                rowMsg, rowClass: 'ok', token, semesterId,
            };
        }

        log(s.id, s.name, 'skip', `❓ No confirmation banner seen — please verify manually`);
        return {
            id: s.id, name: s.name, status: 'unconfirmed', detail: 'No "Saved successfully" banner in response', courses: state.rows,
            rowMsg: '❓ Unconfirmed', rowClass: 'skip', token, semesterId,
        };
    }

    // Fetches a fresh anti-forgery token + current semester id from the
    // StudentRegistration page — shared across a batch of saveOneStudent
    // calls so callers doing many students in a row don't refetch it each
    // time (saveOneStudent still refreshes its own token from each response).
    async function fetchSharedToken(parser, BASE) {
        const getRes = await fetch(`${BASE}/StudentRegistration`, { credentials: 'include' });
        const getDoc = parser.parseFromString(await getRes.text(), 'text/html');
        const tokenEl = getDoc.querySelector('input[name="__RequestVerificationToken"]');
        if (!tokenEl) throw new Error('Could not find anti-forgery token. Are you logged in to URMS?');
        const semesterEl = getDoc.querySelector('input[name="GenaratedCourseList.Semester"], select[name="GenaratedCourseList.Semester"]');
        return { token: tokenEl.value, semesterId: semesterEl ? semesterEl.value : '' };
    }

    window.ULAB_SAVE_ENGINE = { saveOneStudent, fetchSharedToken };
})();
