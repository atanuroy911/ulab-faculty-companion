// urms-attendance-import-content.js — runs on URMS's Attendance Sheet page for the MMS
// "Import Students from URMS" flow.
//
// The Section Wise Result Entry page (the older route, urms-import-content.js) only exists
// while result entry is open, and arrives preset to whichever semester that is - often last
// semester. The Attendance Sheet is always there, for any semester. So: once the teacher has
// picked Semester, Course and Section here, we hand those values (with the page's antiforgery
// token and the course's on-screen name) to the background script, which downloads the sheet
// as a PDF and sends it to MMS. MMS reads it with the same parser as its "Upload PDF" tab.
//
// Only acts while an import session started from MMS is active - visiting this page for any
// other reason leaves it alone.

(function () {
    const BANNER_ID = 'ulab-fc-mms-attendance-import-status';
    const SESSION_TTL_MS = 15 * 60 * 1000;
    let lastSentKey = null;
    let busy = false;

    function showBanner(text, isError) {
        let banner = document.getElementById(BANNER_ID);
        if (!banner) {
            banner = document.createElement('div');
            banner.id = BANNER_ID;
            banner.setAttribute('role', 'status');
            banner.style.cssText = [
                'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
                'color:#fff', 'padding:12px 16px', 'border-radius:10px',
                'box-shadow:0 6px 20px rgba(0,0,0,0.25)', 'font-family:system-ui,-apple-system,sans-serif',
                'font-size:13px', 'max-width:340px', 'line-height:1.4',
            ].join(';');
            document.body.appendChild(banner);
        }
        banner.style.background = isError ? '#7f1d1d' : '#111827';
        banner.textContent = text;
    }

    // The fields by name first (what the form posts), then by id.
    function field(...names) {
        for (const n of names) {
            const el = document.querySelector(`[name="${n}"]`) || document.getElementById(n);
            if (el) return el;
        }
        return null;
    }

    function selectedText(el) {
        if (!el) return '';
        if (el.tagName === 'SELECT') return el.selectedOptions?.[0]?.textContent?.trim() || '';
        return el.value || '';
    }

    function maybeSend() {
        if (busy) return;
        const semesterEl = field('SemesterCode', 'Semester');
        const courseEl = field('CourseId');
        const sectionEl = field('Section');
        const tokenEl = document.querySelector('input[name="__RequestVerificationToken"]');
        if (!semesterEl || !courseEl || !sectionEl || !tokenEl) return;

        const semester = semesterEl.value;
        const courseId = courseEl.value;
        const section = sectionEl.value;
        const token = tokenEl.value;
        // Placeholder options ("Select ...") have an empty value or "0".
        if (!semester || !courseId || courseId === '0' || !section || section === '0' || !token) {
            showBanner('MMS import: pick the Semester, Course and Section - the student list is fetched as soon as all three are set.', false);
            return;
        }

        const key = `${semester}|${courseId}|${section}`;
        if (key === lastSentKey) return;
        lastSentKey = key;
        busy = true;
        showBanner('Fetching the attendance sheet for MMS...', false);

        chrome.runtime.sendMessage(
            {
                type: 'URMS_ATTENDANCE_PARAMS_READY',
                semester,
                courseId,
                courseLabel: selectedText(courseEl),
                section,
                token,
            },
            (response) => {
                busy = false;
                if (chrome.runtime.lastError) return;
                if (response?.ok) {
                    showBanner(`Sent ${response.kb} KB attendance sheet to MMS - closing...`, false);
                    return; // the background script closes this tab
                }
                // Stays failed for this exact selection; changing any of the three tries again.
                showBanner(response?.error || 'Could not fetch the attendance sheet.', true);
            }
        );
    }

    // If the extension was reloaded while this tab was open, this instance is orphaned.
    if (!chrome.runtime || !chrome.runtime.id) return;

    try {
        chrome.storage.session.get(['activeImportSession'], (result) => {
            if (chrome.runtime.lastError) return;
            const session = result && result.activeImportSession;
            if (!session || session.source !== 'attendance-sheet-pdf') return;
            if (Date.now() - session.timestamp > SESSION_TTL_MS) {
                chrome.storage.session.remove('activeImportSession');
                return;
            }

            maybeSend();
            // The course and section lists can be filled in by the page after a choice, so
            // listen for changes and also check periodically while the session lasts.
            document.addEventListener('change', (e) => {
                const name = e.target?.name || e.target?.id;
                if (['CourseId', 'SemesterCode', 'Semester', 'Section'].includes(name)) lastSentKey = null;
                setTimeout(maybeSend, 300);
            });
            const timer = setInterval(() => {
                if (Date.now() - session.timestamp > SESSION_TTL_MS) return clearInterval(timer);
                maybeSend();
            }, 1500);
        });
    } catch {
        // Extension context invalidated - nothing to do.
    }
})();
