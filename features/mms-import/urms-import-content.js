// urms-import-content.js — runs on the URMS "Section Wise Result Entry" page
// (and its "change course" reload, /RMS_ggs_result/LoadExcel).
//
// As soon as Semester/CourseId/Section are all populated on the page (which,
// for single-section courses, is true right on load), we hand those values
// plus the page's antiforgery token to the background script, which fetches
// and parses the student list itself — no click needed, and the tab closes
// itself automatically once the background script is done.

(function () {
    const BANNER_ID = 'ulab-fc-mms-import-status';
    let lastSentKey = null;

    function showBanner(text, isError) {
        let banner = document.getElementById(BANNER_ID);
        if (!banner) {
            banner = document.createElement('div');
            banner.id = BANNER_ID;
            banner.style.cssText = [
                'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
                'color:#fff', 'padding:12px 16px', 'border-radius:10px',
                'box-shadow:0 6px 20px rgba(0,0,0,0.25)', 'font-family:system-ui,-apple-system,sans-serif',
                'font-size:13px', 'max-width:320px',
            ].join(';');
            document.body.appendChild(banner);
        }
        banner.style.background = isError ? '#7f1d1d' : '#111827';
        banner.textContent = text;
    }

    function getToken() {
        const el = document.querySelector('input[name="__RequestVerificationToken"]');
        return el ? el.value : '';
    }

    function maybeSendParams() {
        const semesterEl = document.getElementById('SemesterCode');
        const courseEl = document.getElementById('CourseId');
        const sectionEl = document.getElementById('Section');
        if (!semesterEl || !courseEl || !sectionEl) return;

        const semester = semesterEl.value;
        const courseId = courseEl.value;
        const section = sectionEl.value;
        const token = getToken();
        if (!semester || !courseId || !section || !token) return;

        const key = `${semester}|${courseId}|${section}`;
        if (key === lastSentKey) return;
        lastSentKey = key;

        showBanner('Fetching student list for MMS import...', false);

        chrome.runtime.sendMessage(
            { type: 'URMS_PARAMS_READY', semester, courseId, section, token },
            (response) => {
                if (chrome.runtime.lastError) return;
                if (response?.ok) {
                    // Tab will be closed by the background script shortly.
                    return;
                }
                showBanner(response?.error || 'Could not fetch students automatically.', true);
                lastSentKey = null; // allow retrying once the issue is fixed
            }
        );
    }

    // If the extension was reloaded/updated while this tab was already open,
    // this content script instance is orphaned — every chrome.* call below
    // would throw. Bail out quietly instead of crashing.
    if (!chrome.runtime || !chrome.runtime.id) return;

    const SESSION_TTL_MS = 15 * 60 * 1000;

    // Only act if the user actually started an import session from MMS
    // ("Import from URMS" tab) — not just because this page happens to look
    // ready. Without this, simply revisiting/reloading ResultEntryFromExcel
    // for ANY reason (including after an unrelated Auto-Fill Grades session)
    // would silently auto-fetch and close the tab.
    try {
        chrome.storage.session.get(['activeGradeFillSession', 'activeImportSession'], (result) => {
            if (chrome.runtime.lastError) return;
            if (result && result.activeGradeFillSession) return; // grade-fill flow owns this page

            const session = result && result.activeImportSession;
            if (!session) return; // no import requested — leave this page alone
            if (Date.now() - session.timestamp > SESSION_TTL_MS) {
                chrome.storage.session.remove('activeImportSession');
                return;
            }

            maybeSendParams();

            document.getElementById('Section')?.addEventListener('change', maybeSendParams);
            document.getElementById('CourseId')?.addEventListener('change', () => {
                lastSentKey = null;
            });
        });
    } catch {
        // Extension context invalidated — nothing to do.
    }
})();
