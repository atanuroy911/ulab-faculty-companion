// background.js — service worker for ULAB Faculty Companion

// chrome.storage.session defaults to TRUSTED_CONTEXTS (background/extension
// pages only) — the grade-fill content script needs to read it directly, so
// opt in to letting content scripts access it too.
chrome.storage.session
    .setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
    .catch((error) => console.error('[Faculty Companion] Failed to set storage access level', error));

// Open the side panel when the toolbar icon is clicked.
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[Faculty Companion]', error));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openResults') {
        chrome.tabs.create({ url: chrome.runtime.getURL('features/time/results.html') });
    } else if (request.action === 'openAdvisingResults') {
        chrome.tabs.create({ url: chrome.runtime.getURL('features/advising/results.html') });
    } else if (request.action === 'openBulkSaveResults') {
        chrome.tabs.create({ url: chrome.runtime.getURL('features/bulk-save/results.html') });
    } else if (request.action === 'openCapstoneResults') {
        chrome.tabs.create({ url: chrome.runtime.getURL('features/capstone-eligibility/results.html') });
    } else if (request.action === 'openCatalogueViewer') {
        chrome.tabs.create({ url: chrome.runtime.getURL('features/catalogue-viewer/viewer.html') });
    } else if (request.type === 'URMS_PARAMS_READY') {
        handleUrmsParamsReady(request, sender, sendResponse);
        return true; // keep the message channel open for the async response
    } else if (request.type === 'URMS_GRADE_FILL_STATUS') {
        // Relay from the grade-fill content script (course mismatch / all saved)
        // to whichever MMS tab started the session.
        if (activeGradesPort) {
            try {
                activeGradesPort.postMessage(request.payload);
            } catch (error) {
                console.error('[Faculty Companion] Failed to relay grade-fill status to MMS tab', error);
            }
        }
    }
});

// --- MMS "Import Students from URMS" integration ---
// A MMS tab connects here (via externally_connectable) to start an import
// session. We open the real URMS page for the user; as soon as our injected
// content script sees Semester/CourseId/Section all populated on that page,
// it hands those values (plus the page's antiforgery token) to us here, and
// we fetch + parse the student list ourselves, directly, using the user's
// existing URMS session cookies — no further tab interaction needed. On
// success we close the popup tab automatically.

const URMS_RESULT_ENTRY_URL = 'https://urms-awp.ulab.edu.bd/RMS_ggs_result/ResultEntryFromExcel';
const URMS_LOAD_STUDENT_URL = 'https://urms-awp.ulab.edu.bd/RMS_ggs_result/LoadStudentFromExcel';

/** @type {chrome.runtime.Port | null} */
let activeImportPort = null;
/** The MMS course's known code(s), used to make sure the user doesn't accidentally
 *  pick the wrong course/section in URMS. Empty means "don't check". */
let activeImportExpectedCodes = [];

chrome.runtime.onConnectExternal.addListener((port) => {
    if (port.name !== 'mms-urms-import') return;

    activeImportPort = port;

    // A cached result may already be sitting from before this port existed
    // (e.g. the previous connection died while the background script was
    // mid-fetch). Check immediately on every (re)connect, not just on
    // START_IMPORT, so a silent MMS-side reconnect can pick it up too.
    deliverPendingImportIfFresh(port);

    port.onMessage.addListener((message) => {
        if (message?.type === 'START_IMPORT') {
            activeImportExpectedCodes = Array.isArray(message.expectedCourseCodes) ? message.expectedCourseCodes : [];
            chrome.storage.session.set({
                activeImportSession: { expectedCourseCodes: activeImportExpectedCodes, timestamp: Date.now() },
            });
            chrome.windows.create({ url: URMS_RESULT_ENTRY_URL, type: 'popup', width: 1100, height: 800 });
        } else if (message?.type === 'RESUME_IMPORT') {
            if (Array.isArray(message.expectedCourseCodes) && message.expectedCourseCodes.length > 0) {
                activeImportExpectedCodes = message.expectedCourseCodes;
            }
            chrome.storage.session.set({
                activeImportSession: { expectedCourseCodes: activeImportExpectedCodes, timestamp: Date.now() },
            });
            // MMS silently reconnecting after the previous port died — just
            // re-check the cache, don't pop another URMS window.
            deliverPendingImportIfFresh(port);
        }
    });

    port.onDisconnect.addListener(() => {
        if (activeImportPort === port) activeImportPort = null;
    });
});

// --- MMS "Auto-Fill Grades in URMS" integration (Beta) ---
// A MMS tab connects here to start a grade-fill session: we open URMS for
// the user, and once the injected grade-fill content script confirms this is
// the right course/section, it reads the { studentId, grade } list straight
// out of chrome.storage.session (set below) and fills the on-page <select>
// grade dropdowns itself. The user reviews and clicks URMS's own "Save"
// button — the extension never submits anything to URMS on its own.

/** @type {chrome.runtime.Port | null} */
let activeGradesPort = null;

chrome.runtime.onConnectExternal.addListener((port) => {
    if (port.name !== 'mms-urms-grades') return;

    activeGradesPort = port;

    port.onMessage.addListener((message) => {
        if (message?.type === 'START_GRADE_FILL') {
            // codeGroups: [{ code, grades: [{studentId, name, grade}] }, ...] —
            // URMS lists old-code/new-code courses as fully separate, disjoint
            // rosters, so we keep grades grouped by which real URMS course they
            // belong under rather than merging them into one list.
            const codeGroups = Array.isArray(message.codeGroups) ? message.codeGroups : [];
            const expectedSection = message.expectedSection || '';
            chrome.storage.session.set({
                activeGradeFillSession: { codeGroups, expectedSection, timestamp: Date.now() },
            });
            chrome.windows.create({ url: URMS_RESULT_ENTRY_URL, type: 'popup', width: 1100, height: 800 });
        }
    });

    port.onDisconnect.addListener(() => {
        if (activeGradesPort === port) {
            activeGradesPort = null;
            // MMS side closed/navigated away — stop auto-filling on any further
            // page visits in the URMS tab (already-filled dropdowns are untouched).
            chrome.storage.session.remove('activeGradeFillSession');
        }
    });
});

// Also answer a plain PING (used by MMS to detect the extension is installed).
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (request?.type === 'PING') {
        sendResponse({ type: 'PONG', version: chrome.runtime.getManifest().version });
    }
});

const PENDING_IMPORT_TTL_MS = 15 * 60 * 1000;

function deliverPendingImportIfFresh(port) {
    chrome.storage.session.get('pendingUrmsImport', ({ pendingUrmsImport }) => {
        if (!pendingUrmsImport) return;
        if (Date.now() - pendingUrmsImport.timestamp > PENDING_IMPORT_TTL_MS) {
            chrome.storage.session.remove('pendingUrmsImport');
            return;
        }
        const { students, semester, courseId, section } = pendingUrmsImport;
        port.postMessage({ type: 'STUDENTS', students, semester, courseId, section });
        chrome.storage.session.remove('pendingUrmsImport');
    });
}

function deliverStudents(students, semester, courseId, section) {
    if (activeImportPort) {
        try {
            activeImportPort.postMessage({ type: 'STUDENTS', students, semester, courseId, section });
            return;
        } catch (error) {
            console.error('[Faculty Companion] Failed to deliver students to MMS tab', error);
        }
    }

    // No active import session (e.g. MMS tab was closed) — briefly cache the
    // result so a reconnect can still pick it up.
    chrome.storage.session.set({
        pendingUrmsImport: { students, semester, courseId, section, timestamp: Date.now() },
    });
}

function normalizeCode(str) {
    // Strip ALL whitespace, not just leading/trailing — MMS stores some
    // course codes with an internal space (e.g. "CSE 2105") while URMS's own
    // CourseId values never have one (e.g. "CSE2105").
    return String(str || '').toUpperCase().replace(/\s+/g, '');
}

function courseIdMatchesExpected(courseId, expectedCodes) {
    if (!expectedCodes || expectedCodes.length === 0) return true; // nothing to check against
    const normalized = normalizeCode(courseId);
    return expectedCodes.some((code) => normalizeCode(code) === normalized);
}

async function handleUrmsParamsReady(request, sender, sendResponse) {
    const { semester, courseId, section, token } = request;

    if (!courseIdMatchesExpected(courseId, activeImportExpectedCodes)) {
        if (activeImportPort) {
            try {
                activeImportPort.postMessage({
                    type: 'COURSE_MISMATCH',
                    courseId,
                    expectedCourseCodes: activeImportExpectedCodes,
                });
            } catch (error) {
                console.error('[Faculty Companion] Failed to notify MMS tab of course mismatch', error);
            }
        }
        sendResponse({
            ok: false,
            error: `This is course "${courseId}", but MMS expected ${activeImportExpectedCodes.join(' / ')}. Please select the correct course.`,
        });
        return;
    }

    try {
        const students = await fetchStudentsFromUrms({ semester, courseId, section, token });

        if (!students || students.length === 0) {
            sendResponse({ ok: false, error: 'No students found for this course/section.' });
            return;
        }

        deliverStudents(students, semester, courseId, section);
        sendResponse({ ok: true, count: students.length });
        chrome.storage.session.remove('activeImportSession');

        // Nothing left for the user to do on this page — close it.
        if (sender.tab?.id) {
            chrome.tabs.remove(sender.tab.id).catch(() => {});
        }
    } catch (error) {
        console.error('[Faculty Companion] Failed to fetch students from URMS', error);
        sendResponse({ ok: false, error: error.message || 'Could not fetch students from URMS.' });
    }
}

async function fetchStudentsFromUrms({ semester, courseId, section, token }) {
    const body = new URLSearchParams({
        Semester: semester,
        GradeSystem: '',
        Component: '',
        CourseId: courseId,
        Program: '',
        Section: section,
        ApproveResult: '0',
        __RequestVerificationToken: token,
    });

    const response = await fetch(URMS_LOAD_STUDENT_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    const html = await response.text();

    if (response.redirected && /Account\/Login/i.test(response.url)) {
        throw new Error('Your URMS session appears to have expired. Please log in again.');
    }

    const students = extractStudentsFromHtml(html);
    if (students === null) {
        throw new Error('Could not find the student table in URMS\'s response. Please try again.');
    }
    return students;
}

function extractStudentsFromHtml(html) {
    const tableMatch = html.match(/<table[^>]*id=["']T1["'][^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatch) return null;

    const rows = [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].slice(1); // skip header row
    const students = [];

    for (const row of rows) {
        const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
        if (cells.length < 3) continue;
        const studentId = stripTags(cells[1][1]);
        const name = stripTags(cells[2][1]);
        if (studentId && name) students.push({ studentId, name });
    }

    return students;
}

function stripTags(html) {
    return decodeEntities(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function decodeEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}
