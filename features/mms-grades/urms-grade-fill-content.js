// urms-grade-fill-content.js — runs on the URMS "Section Wise Result Entry"
// page (and its variants). If a grade-fill session is pending (started from
// MMS), this fills in the on-page grade <select> dropdowns for the loaded
// students. It never submits anything itself — the user reviews the filled
// values and clicks URMS's own "Save" button, and this script just watches
// for that to finish so it can prompt the user to print the grade sheet.

(function () {
    const LOG_PREFIX = '[MMS Grade Fill]';
    const BANNER_ID = 'ulab-fc-grade-fill-banner';
    const SESSION_TTL_MS = 15 * 60 * 1000;

    function showBanner(html) {
        let banner = document.getElementById(BANNER_ID);
        if (!banner) {
            banner = document.createElement('div');
            banner.id = BANNER_ID;
            banner.style.cssText = [
                'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
                'background:#111827', 'color:#fff', 'padding:14px 18px', 'border-radius:10px',
                'box-shadow:0 6px 20px rgba(0,0,0,0.25)', 'font-family:system-ui,-apple-system,sans-serif',
                'font-size:13px', 'max-width:340px', 'line-height:1.5',
            ].join(';');
            document.body.appendChild(banner);
        }
        banner.innerHTML = html;
    }

    function removeBanner() {
        const el = document.getElementById(BANNER_ID);
        if (el) el.remove();
    }

    function reportStatus(payload) {
        console.log(LOG_PREFIX, 'reporting status', payload);
        try {
            chrome.runtime.sendMessage({ type: 'URMS_GRADE_FILL_STATUS', payload }, () => {
                // No response expected; just touch lastError so Chrome doesn't log it.
                void chrome.runtime.lastError;
            });
        } catch (error) {
            console.warn(LOG_PREFIX, 'sendMessage failed (extension context invalidated?):', error.message);
        }
    }

    function getToken() {
        const el = document.querySelector('input[name="__RequestVerificationToken"]');
        return el ? el.value : '';
    }

    function normalize(str) {
        // Strip ALL whitespace (not just leading/trailing) — MMS stores some
        // course codes with an internal space (e.g. "CSE 2105") while URMS's
        // own CourseId values never have one (e.g. "CSE2105"), and the same
        // helper is used for student ID matching where stray whitespace
        // would otherwise silently fail every match.
        return String(str || '').toUpperCase().replace(/\s+/g, '');
    }

    function getDataRows(table) {
        // The #T1 table exists on every load (header-only until "Load Student"
        // has actually run), so row COUNT — not table presence — is what tells
        // us whether students are loaded yet.
        return Array.from(table.querySelectorAll('tr')).slice(1);
    }

    function fillGrades(grades) {
        const table = document.getElementById('T1');
        const rows = table ? getDataRows(table) : [];
        const byId = new Map(grades.map((g) => [normalize(g.studentId), g]));

        let filled = 0;
        const notFound = [];
        const nameMismatches = [];

        rows.forEach((row) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) return;
            const studentId = normalize(cells[1].textContent);
            const urmsName = cells[2].textContent.trim();
            const entry = byId.get(studentId);
            if (!entry) return; // not one of MMS's students for this course

            if (entry.name && normalize(entry.name) !== normalize(urmsName)) {
                nameMismatches.push({ studentId: cells[1].textContent.trim(), urmsName, mmsName: entry.name });
                console.warn(LOG_PREFIX, 'name mismatch for', studentId, { urmsName, mmsName: entry.name });
                // ID match is authoritative — still fill, just flag it for review.
            }

            const select = row.querySelector('select[name="Mark"]');
            if (!select) {
                notFound.push(studentId);
                return;
            }

            const optionExists = Array.from(select.options).some((o) => o.value === entry.grade);
            if (!optionExists) {
                console.warn(LOG_PREFIX, 'grade value not in dropdown options', studentId, entry.grade);
                notFound.push(studentId);
                return;
            }

            select.value = entry.grade;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            row.style.backgroundColor = '#fef9c3';
            filled++;
        });

        return { filled, notFound, nameMismatches };
    }

    function watchForSaveCompletion(expectedFilledCount) {
        const table = document.getElementById('T1');
        if (!table) return;

        const observer = new MutationObserver(() => {
            const statusCells = Array.from(table.querySelectorAll('[id$="-status"]'));
            const resolved = statusCells.filter((cell) => cell.querySelector('svg')).length;
            if (resolved > 0 && resolved >= expectedFilledCount) {
                observer.disconnect();
                promptPrint();
            }
        });

        observer.observe(table, { childList: true, subtree: true });
    }

    function promptPrint() {
        const printLink = document.querySelector('a[href*="/RMS_ggs_result/Report?target="]');
        showBanner(
            'Grades saved! <br/><button id="ulab-fc-print-btn" style="margin-top:8px;background:#2563eb;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer;font-weight:600;">Print Grade Sheet</button>'
        );
        reportStatus({ type: 'GRADES_SAVED' });

        const btn = document.getElementById('ulab-fc-print-btn');
        if (btn && printLink) {
            btn.addEventListener('click', () => {
                window.open(printLink.href, '_blank');
                removeBanner();
            });
        }
    }

    function runGradeFillSession(session) {
        console.log(LOG_PREFIX, 'session active, checking page', location.href);

        const semesterEl = document.getElementById('SemesterCode');
        const courseEl = document.getElementById('CourseId');
        const sectionEl = document.getElementById('Section');
        if (!semesterEl || !courseEl || !sectionEl) {
            console.log(LOG_PREFIX, 'Semester/Course/Section elements not found on this page yet');
            return;
        }

        const courseId = courseEl.value;
        const section = sectionEl.value;
        if (!courseId || !section) {
            console.log(LOG_PREFIX, 'Course/Section not selected yet', { courseId, section });
            return;
        }

        const codeGroups = session.codeGroups || [];
        const expectedCourseCodes = codeGroups.map((g) => g.code);
        const matchedGroup = codeGroups.find((g) => normalize(g.code) === normalize(courseId));

        if (!matchedGroup) {
            console.log(LOG_PREFIX, 'course mismatch', { courseId, expected: expectedCourseCodes });
            showBanner(
                `This is course <strong>${courseId}</strong>, but MMS expected <strong>${expectedCourseCodes.join(' / ')}</strong>. Please select the correct course/section.`
            );
            reportStatus({ type: 'COURSE_MISMATCH', courseId, expectedCourseCodes });
            return;
        }

        const grades = matchedGroup.grades || [];

        const table = document.getElementById('T1');
        const dataRows = table ? getDataRows(table) : [];

        if (dataRows.length === 0) {
            // Student list not loaded yet on this page — click "Load Student" for
            // the user (this triggers a normal page navigation; our content
            // script re-runs on the resulting page).
            const loadBtn = document.querySelector('input[type="button"][onclick^="LoadStudent"]');
            console.log(LOG_PREFIX, 'no student rows yet, load button found?', Boolean(loadBtn));
            if (loadBtn) {
                showBanner('Loading students for grade fill...');
                loadBtn.click();
            }
            return;
        }

        const { filled, notFound, nameMismatches } = fillGrades(grades);
        console.log(LOG_PREFIX, 'fill result', { filled, notFound: notFound.length, nameMismatches: nameMismatches.length });

        if (filled === 0) {
            const rosterIds = dataRows.map((row) => {
                const cells = row.querySelectorAll('td');
                return cells.length >= 2 ? cells[1].textContent.trim() : null;
            }).filter(Boolean);
            console.warn(LOG_PREFIX, 'no grades filled — diagnostic dump', {
                urmsCourseId: courseId,
                urmsSection: section,
                mmsExpectedSection: session.expectedSection || '(not set)',
                matchedGroupCode: matchedGroup.code,
                urmsRosterIds: rosterIds,
                mmsStudentIds: grades.map((g) => g.studentId),
            });

            let banner = `No matching students found for course <strong>${courseId}</strong>, section <strong>${section}</strong> (${rosterIds.length} students on this page).`;
            if (session.expectedSection && normalize(session.expectedSection) !== normalize(section)) {
                banner += ` MMS course section is <strong>${session.expectedSection}</strong> — this may be the wrong section.`;
            } else {
                banner += ' Open the browser console (F12) on this page for a full ID comparison dump.';
            }
            showBanner(banner);
            reportStatus({
                type: 'NO_MATCHES',
                courseId,
                section,
                expectedSection: session.expectedSection || undefined,
                rosterCount: rosterIds.length,
            });
            return;
        }

        let message = `Filled in ${filled} grade(s)`;
        if (notFound.length) message += `, ${notFound.length} student(s) not matched`;
        if (nameMismatches.length) message += `, ${nameMismatches.length} name mismatch(es) — check console`;
        message += '. Please verify the values, then click <strong>Save</strong> on this page.';

        showBanner(message);
        reportStatus({ type: 'GRADES_FILLED', filled, notFound: notFound.length, nameMismatches });
        watchForSaveCompletion(filled);

        // Deliberately NOT clearing the session here: a course has old-code and
        // new-code groups with disjoint URMS rosters, so the user may switch
        // Course/Section within the same Auto-Fill run to fill the other group
        // too. The session is cleared when the MMS side disconnects (dialog
        // closed) or after its TTL, not after a single fill.
    }

    // If the extension was reloaded/updated while this tab was already open,
    // this content script instance is orphaned and every chrome.* call below
    // throws "Extension context invalidated" / "Access to storage is not
    // allowed from this context". Bail out quietly instead of crashing —
    // closing this tab and starting a fresh session from MMS fixes it.
    if (!chrome.runtime || !chrome.runtime.id) {
        console.warn(LOG_PREFIX, 'extension context unavailable (likely reloaded) — ignoring this page');
        return;
    }

    try {
        chrome.storage.session.get('activeGradeFillSession', (result) => {
            if (chrome.runtime.lastError) {
                console.warn(LOG_PREFIX, 'storage.get failed (extension context invalidated?):', chrome.runtime.lastError.message);
                return;
            }
            const activeGradeFillSession = result && result.activeGradeFillSession;
            if (!activeGradeFillSession) {
                console.log(LOG_PREFIX, 'no active grade-fill session');
                return;
            }
            if (Date.now() - activeGradeFillSession.timestamp > SESSION_TTL_MS) {
                chrome.storage.session.remove('activeGradeFillSession');
                return;
            }
            runGradeFillSession(activeGradeFillSession);
        });
    } catch (error) {
        console.warn(LOG_PREFIX, 'storage.get threw (extension context invalidated?):', error.message);
    }
})();
