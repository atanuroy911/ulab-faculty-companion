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
    } else if (request.action === 'openAdvisingBillingResults') {
        chrome.tabs.create({ url: chrome.runtime.getURL('features/advising-billing/results.html') });
    } else if (request.action === 'openCapstoneResults') {
        chrome.tabs.create({ url: chrome.runtime.getURL('features/capstone-eligibility/results.html') });
    } else if (request.action === 'openCatalogueViewer') {
        chrome.tabs.create({ url: chrome.runtime.getURL('features/catalogue-viewer/viewer.html') });
    } else if (request.action === 'openClassScheduleResults') {
        chrome.tabs.create({ url: chrome.runtime.getURL('features/class-schedule/results.html') });
    } else if (request.type === 'URMS_PARAMS_READY') {
        handleUrmsParamsReady(request, sender, sendResponse);
        return true; // keep the message channel open for the async response
    } else if (request.type === 'URMS_ATTENDANCE_PARAMS_READY') {
        handleAttendanceParamsReady(request, sender, sendResponse);
        return true;
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
    } else if (request.action === 'gcExpectDownload') {
        gcPendingRename = { baseName: request.baseName, tabId: sender.tab?.id };
        sendResponse({ ok: true });
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
// The Attendance Sheet is there for every semester (the result entry page only while result
// entry is open). MMS builds that ask for it (rosterSource: 'attendance-sheet-pdf') get the
// sheet as a PDF and parse it themselves; older MMS builds keep the result entry route.
const URMS_ATTENDANCE_URL = 'https://urms-awp.ulab.edu.bd/AttendanceSheet';

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
            const source = message.rosterSource === 'attendance-sheet-pdf' ? 'attendance-sheet-pdf' : 'result-entry';
            chrome.storage.session.set({
                activeImportSession: { expectedCourseCodes: activeImportExpectedCodes, source, timestamp: Date.now() },
            });
            chrome.windows.create({
                url: source === 'attendance-sheet-pdf' ? URMS_ATTENDANCE_URL : URMS_RESULT_ENTRY_URL,
                type: 'popup',
                width: 1100,
                height: 800,
            });
        } else if (message?.type === 'RESUME_IMPORT') {
            if (Array.isArray(message.expectedCourseCodes) && message.expectedCourseCodes.length > 0) {
                activeImportExpectedCodes = message.expectedCourseCodes;
            }
            chrome.storage.session.get('activeImportSession', ({ activeImportSession }) => {
                chrome.storage.session.set({
                    activeImportSession: {
                        expectedCourseCodes: activeImportExpectedCodes,
                        source: activeImportSession?.source || (message.rosterSource === 'attendance-sheet-pdf' ? 'attendance-sheet-pdf' : 'result-entry'),
                        timestamp: Date.now(),
                    },
                });
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

// --- MMS "Sync Student Emails" integration ---
// A MMS tab connects here with a list of student IDs it already knows about
// (from a prior roster import) and asks us to look up each one's email.
// URMS has no dedicated "get email" API - the address is a side-effect field
// on the StudentRegistration ("Load student") response, so we replay that
// same POST once per student ID using the user's existing URMS session
// cookies, exactly like the Advising feature's fetchAdvisingDetails()
// (features/advising/advising.js) does - just ported to regex-only HTML
// parsing here since DOMParser isn't available in a service worker. No popup
// window is opened; this runs entirely in the background using whatever URMS
// session cookies the browser already has.

const URMS_STUDENT_REGISTRATION_URL = 'https://urms-awp.ulab.edu.bd/StudentRegistration';

chrome.runtime.onConnectExternal.addListener((port) => {
    if (port.name !== 'mms-urms-emails') return;

    let cancelled = false;

    port.onMessage.addListener((message) => {
        if (message?.type !== 'START_EMAIL_SYNC') return;
        const studentIds = Array.isArray(message.studentIds) ? message.studentIds.filter(Boolean) : [];
        if (studentIds.length === 0) {
            port.postMessage({ type: 'EMAILS', emails: [] });
            return;
        }
        runEmailSync(studentIds, port, () => cancelled);
    });

    port.onDisconnect.addListener(() => {
        cancelled = true;
    });
});

async function runEmailSync(studentIds, port, isCancelled) {
    try {
        const getRes = await fetch(URMS_STUDENT_REGISTRATION_URL, { credentials: 'include' });
        const getHtml = await getRes.text();

        if (getRes.redirected && /Account\/Login/i.test(getRes.url)) {
            port.postMessage({ type: 'EMAIL_SYNC_ERROR', error: 'Your URMS session appears to have expired. Please log in to URMS in this browser and try again.' });
            return;
        }

        const tokenMatch = getHtml.match(/<input[^>]*name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i);
        const token = tokenMatch ? tokenMatch[1] : null;
        if (!token) {
            port.postMessage({ type: 'EMAIL_SYNC_ERROR', error: 'Could not find the anti-forgery token on the StudentRegistration page. Are you logged in to URMS?' });
            return;
        }

        const semesterMatch = getHtml.match(/name=["']GenaratedCourseList\.Semester["'][^>]*value=["']([^"']*)["']/i);
        const semesterId = semesterMatch ? semesterMatch[1] : '';

        const today = new Date();
        const regDateString = [
            String(today.getDate()).padStart(2, '0'),
            String(today.getMonth() + 1).padStart(2, '0'),
            today.getFullYear(),
        ].join('/');

        const staticFields = {
            IsAddDropWithdraw: 'False',
            IsCreditBased: '',
            HasLateRegistrationWithoutFinePermission: 'False',
            LateRegistrationFineEnabled: 'False',
            RegistrationDateOver: 'True',
            RegDateString: regDateString,
        };

        const emails = [];
        const total = studentIds.length;

        for (let i = 0; i < studentIds.length; i++) {
            if (isCancelled()) return;
            const studentId = studentIds[i];
            let result = { status: 'error' };

            try {
                const params = new URLSearchParams();
                for (const [k, v] of Object.entries(staticFields)) params.append(k, v);
                params.append('GenaratedCourseList.Semester', semesterId);
                params.append('GenaratedCourseList.StudentId', studentId);
                params.append('btnLoad', 'Load');
                params.append('__RequestVerificationToken', token);

                const postRes = await fetch(URMS_STUDENT_REGISTRATION_URL, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Referer: URMS_STUDENT_REGISTRATION_URL,
                    },
                    body: params.toString(),
                });
                const postHtml = await postRes.text();
                const email = labeledValueFromHtml(postHtml, 'Email');
                if (email && /@/.test(email)) {
                    emails.push({ studentId, email: email.toLowerCase() });
                    result = { status: 'found', email: email.toLowerCase() };
                } else {
                    result = { status: 'not-found' };
                }
            } catch (err) {
                console.error('[Faculty Companion] Email lookup failed for', studentId, err);
                result = { status: 'error', error: String(err?.message || err) };
            }

            // Each student's outcome rides along, so MMS can show a live log and keep what was
            // found if the teacher cancels part-way (older MMS builds read only done/total).
            port.postMessage({ type: 'EMAIL_SYNC_PROGRESS', done: i + 1, total, studentId, ...result });
        }

        port.postMessage({ type: 'EMAILS', emails });
    } catch (error) {
        console.error('[Faculty Companion] Email sync failed', error);
        port.postMessage({ type: 'EMAIL_SYNC_ERROR', error: error.message || 'Could not sync emails from URMS.' });
    }
}

// ── Student detail lookup (name + email) for MMS capstone group entry ────────────────────
//
// Same StudentRegistration replay as the email sync above, but returns the student's NAME as
// well, and reports a missing URMS session as its own message type so MMS can offer to open
// the login window instead of just showing an error.
//
// Kept as a separate port from 'mms-urms-emails' rather than widening that one: the emails
// channel has a published payload shape that an older MMS build still depends on, and
// changing it under them would break course email sync.

const URMS_LOGIN_URL = 'https://urms-awp.ulab.edu.bd/Account/Login';

chrome.runtime.onConnectExternal.addListener((port) => {
    if (port.name !== 'mms-urms-students') return;

    let cancelled = false;

    port.onMessage.addListener((message) => {
        if (message?.type === 'OPEN_URMS_LOGIN') {
            // A popup window rather than a tab, matching the result-entry flow - it keeps
            // the MMS page visible behind it so the user can come back and retry.
            chrome.windows.create({ url: URMS_LOGIN_URL, type: 'popup', width: 980, height: 760 });
            return;
        }

        if (message?.type !== 'START_STUDENT_LOOKUP') return;
        const studentIds = Array.isArray(message.studentIds) ? message.studentIds.filter(Boolean) : [];
        if (studentIds.length === 0) {
            port.postMessage({ type: 'STUDENT_DETAILS', students: [] });
            return;
        }
        runStudentLookup(studentIds, port, () => cancelled);
    });

    port.onDisconnect.addListener(() => {
        cancelled = true;
    });
});

async function runStudentLookup(studentIds, port, isCancelled) {
    try {
        const getRes = await fetch(URMS_STUDENT_REGISTRATION_URL, { credentials: 'include' });
        const getHtml = await getRes.text();

        if (getRes.redirected && /Account\/Login/i.test(getRes.url)) {
            port.postMessage({ type: 'URMS_LOGIN_REQUIRED' });
            return;
        }

        const tokenMatch = getHtml.match(/<input[^>]*name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i);
        const token = tokenMatch ? tokenMatch[1] : null;
        if (!token) {
            // No anti-forgery token almost always means the page served a login form rather
            // than the registration page, so treat it as "needs login" too.
            port.postMessage({ type: 'URMS_LOGIN_REQUIRED' });
            return;
        }

        const semesterMatch = getHtml.match(/name=["']GenaratedCourseList\.Semester["'][^>]*value=["']([^"']*)["']/i);
        const semesterId = semesterMatch ? semesterMatch[1] : '';

        const today = new Date();
        const regDateString = [
            String(today.getDate()).padStart(2, '0'),
            String(today.getMonth() + 1).padStart(2, '0'),
            today.getFullYear(),
        ].join('/');

        const staticFields = {
            IsAddDropWithdraw: 'False',
            IsCreditBased: '',
            HasLateRegistrationWithoutFinePermission: 'False',
            LateRegistrationFineEnabled: 'False',
            RegistrationDateOver: 'True',
            RegDateString: regDateString,
        };

        const students = [];
        const notFound = [];
        const total = studentIds.length;

        for (let i = 0; i < studentIds.length; i++) {
            if (isCancelled()) return;
            const studentId = studentIds[i];

            try {
                const params = new URLSearchParams();
                for (const [k, v] of Object.entries(staticFields)) params.append(k, v);
                params.append('GenaratedCourseList.Semester', semesterId);
                params.append('GenaratedCourseList.StudentId', studentId);
                params.append('btnLoad', 'Load');
                params.append('__RequestVerificationToken', token);

                const postRes = await fetch(URMS_STUDENT_REGISTRATION_URL, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Referer: URMS_STUDENT_REGISTRATION_URL,
                    },
                    body: params.toString(),
                });
                const postHtml = await postRes.text();

                const email = labeledValueFromHtml(postHtml, 'Email');
                // URMS labels this field "Student Name" on the registration page; fall back
                // to a plain "Name" label in case that ever differs.
                const name =
                    labeledValueFromHtml(postHtml, 'Student Name') ||
                    labeledValueFromHtml(postHtml, 'Name');

                if (name || (email && /@/.test(email))) {
                    students.push({
                        studentId,
                        name: name || '',
                        email: email && /@/.test(email) ? email.toLowerCase() : '',
                    });
                } else {
                    notFound.push(studentId);
                }
            } catch (err) {
                console.error('[Faculty Companion] Student lookup failed for', studentId, err);
                notFound.push(studentId);
            }

            port.postMessage({ type: 'STUDENT_LOOKUP_PROGRESS', done: i + 1, total });
        }

        port.postMessage({ type: 'STUDENT_DETAILS', students, notFound });
    } catch (error) {
        console.error('[Faculty Companion] Student lookup failed', error);
        port.postMessage({
            type: 'STUDENT_LOOKUP_ERROR',
            error: error.message || 'Could not look up students on URMS.',
        });
    }
}

// Regex port of advising.js's DOM-based labeledValue() helper, for use here in the service
// worker context where DOMParser isn't available. Finds a Bootstrap "col-sm-4" label/div
// whose text starts with `label`, then returns the stripped text of the element right after
// it (mirrors `node.nextElementSibling` in the DOM version).
function labeledValueFromHtml(html, label) {
    const blockRe = /<(div|label)\b[^>]*class="[^"]*col-sm-4[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    let matchEnd = -1;
    while ((match = blockRe.exec(html))) {
        if (stripTags(match[2]).startsWith(label)) {
            matchEnd = blockRe.lastIndex;
            break;
        }
    }
    if (matchEnd === -1) return '';

    const siblingMatch = /<(div|span|label|td)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(html.slice(matchEnd));
    return siblingMatch ? stripTags(siblingMatch[2]) : '';
}

// Also answer a plain PING (used by MMS to detect the extension is installed).
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (request?.type === 'PING') {
        sendResponse({ type: 'PONG', version: chrome.runtime.getManifest().version });
    } else if (request?.type === 'URMS_SESSION') {
        // Is this browser logged in to URMS? A page that needs a login redirects to
        // Account/Login when it isn't. MMS shows this before starting anything with URMS.
        checkUrmsSession()
            .then((state) => sendResponse({ type: 'URMS_SESSION', ...state }))
            .catch(() => sendResponse({ type: 'URMS_SESSION', loggedIn: false, reachable: false }));
        return true; // async response
    } else if (request?.type === 'OPEN_URMS_LOGIN') {
        chrome.windows.create({ url: 'https://urms-awp.ulab.edu.bd/Account/Login', type: 'popup', width: 1000, height: 760 });
        sendResponse({ ok: true });
    }
});

async function checkUrmsSession() {
    const res = await fetch('https://urms-awp.ulab.edu.bd/AttendanceSheet', { method: 'GET', credentials: 'include', cache: 'no-store' });
    const loggedOut = (res.redirected && /Account\/Login/i.test(res.url)) || /Account\/Login/i.test(res.url);
    return { loggedIn: res.ok && !loggedOut, reachable: true };
}

const PENDING_IMPORT_TTL_MS = 15 * 60 * 1000;

function deliverPendingImportIfFresh(port) {
    chrome.storage.session.get('pendingUrmsImport', ({ pendingUrmsImport }) => {
        if (!pendingUrmsImport) return;
        if (Date.now() - pendingUrmsImport.timestamp > PENDING_IMPORT_TTL_MS) {
            chrome.storage.session.remove('pendingUrmsImport');
            return;
        }
        const { students, pdfBase64, courseLabel, semester, courseId, section } = pendingUrmsImport;
        if (pdfBase64) port.postMessage({ type: 'ROSTER_PDF', pdfBase64, courseLabel, semester, courseId, section });
        else port.postMessage({ type: 'STUDENTS', students, semester, courseId, section });
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

// --- Attendance Sheet route ---

/** The course check for the Attendance Sheet: its CourseId value is URMS's internal id
 *  (e.g. "0613-016-2105"), so the code is looked for in the option's label as well. */
function attendanceCourseMatches(courseId, courseLabel, expectedCodes) {
    if (!expectedCodes || expectedCodes.length === 0) return true;
    // Labels without a recognisable code (a whole word like "CSE2105" or "CSE 2105") can't be
    // checked here - MMS checks the PDF itself.
    const label = String(courseLabel || '').toUpperCase();
    if (!/\b[A-Z]{2,5}\s?\d{3,4}[A-Z]?\b/.test(label)) return true;
    const haystack = normalizeCode(label);
    return expectedCodes.some((code) => code && haystack.includes(normalizeCode(code)));
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

async function fetchAttendanceSheetPdf({ semester, courseId, section, token }) {
    const body = new URLSearchParams({
        ReportType: '',
        SemesterCode: semester,
        CourseId: courseId,
        Section: section,
        ExamName: '',
        ReportOutputFormat: 'pdf',
        __RequestVerificationToken: token,
    });
    const response = await fetch(URMS_ATTENDANCE_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    if (response.redirected && /Account\/Login/i.test(response.url)) {
        throw new Error('Your URMS session appears to have expired. Please log in again.');
    }
    if (!response.ok) throw new Error(`URMS answered ${response.status} for the attendance sheet. Please try again.`);
    const type = response.headers.get('content-type') || '';
    const buffer = await response.arrayBuffer();
    // A PDF starts with "%PDF" - anything else is URMS's HTML page (an error or a login form).
    const head = new Uint8Array(buffer.slice(0, 4));
    const isPdf = /pdf/i.test(type) || String.fromCharCode(...head) === '%PDF';
    if (!isPdf) throw new Error('URMS did not return a PDF - check the semester, course and section, or log in again.');
    if (buffer.byteLength > 8 * 1024 * 1024) throw new Error('The attendance sheet is unexpectedly large. Please download it and use "Upload PDF" in MMS.');
    return buffer;
}

async function handleAttendanceParamsReady(request, sender, sendResponse) {
    const { semester, courseId, courseLabel, section, token } = request;

    if (!attendanceCourseMatches(courseId, courseLabel, activeImportExpectedCodes)) {
        if (activeImportPort) {
            try {
                activeImportPort.postMessage({ type: 'COURSE_MISMATCH', courseId: courseLabel || courseId, expectedCourseCodes: activeImportExpectedCodes });
            } catch (error) {
                console.error('[Faculty Companion] Failed to notify MMS tab of course mismatch', error);
            }
        }
        sendResponse({ ok: false, error: `This is "${courseLabel || courseId}", but MMS expected ${activeImportExpectedCodes.join(' / ')}. Please pick the right course.` });
        return;
    }

    try {
        const buffer = await fetchAttendanceSheetPdf({ semester, courseId, section, token });
        const pdfBase64 = arrayBufferToBase64(buffer);
        if (activeImportPort) {
            try {
                activeImportPort.postMessage({ type: 'ROSTER_PDF', pdfBase64, courseLabel, semester, courseId, section });
            } catch (error) {
                console.error('[Faculty Companion] Failed to deliver attendance sheet to MMS tab', error);
                chrome.storage.session.set({ pendingUrmsImport: { pdfBase64, courseLabel, semester, courseId, section, timestamp: Date.now() } });
            }
        } else {
            // MMS tab not connected right now - keep it briefly so a reconnect can pick it up.
            chrome.storage.session.set({ pendingUrmsImport: { pdfBase64, courseLabel, semester, courseId, section, timestamp: Date.now() } });
        }
        sendResponse({ ok: true, kb: Math.max(1, Math.round(buffer.byteLength / 1024)) });
        chrome.storage.session.remove('activeImportSession');
        if (sender.tab?.id) {
            setTimeout(() => chrome.tabs.remove(sender.tab.id).catch(() => {}), 800);
        }
    } catch (error) {
        console.error('[Faculty Companion] Failed to fetch the attendance sheet', error);
        sendResponse({ ok: false, error: error.message || 'Could not fetch the attendance sheet from URMS.' });
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

// --- Google Classroom: rename Drive's own per-row download as it lands ---
// The content script simulates a click on Drive's native row "Download"
// button (rather than re-fetching the file itself) so it gets exactly what
// Drive would normally save. Right before each click it tells us the
// desired base filename via 'gcExpectDownload'; we apply it to the very
// next download Chrome starts and tell the content script's tab once that
// download finishes, so it can move on to the next row.

/** @type {{ baseName: string, tabId?: number } | null} */
let gcPendingRename = null;
let gcActiveDownloadId = null;
let gcActiveTabId = null;

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    if (!gcPendingRename) {
        suggest();
        return;
    }
    const dot = item.filename.lastIndexOf('.');
    const ext = dot > -1 ? item.filename.slice(dot) : '';
    // Preserve any subfolder Chrome would have used, only rename the leaf.
    const slash = item.filename.lastIndexOf('/');
    const dir = slash > -1 ? item.filename.slice(0, slash + 1) : '';

    gcActiveDownloadId = item.id;
    gcActiveTabId = gcPendingRename.tabId;
    const baseName = gcPendingRename.baseName;
    gcPendingRename = null;

    suggest({ filename: dir + baseName + ext, conflictAction: 'uniquify' });
});

chrome.downloads.onChanged.addListener((delta) => {
    if (delta.id !== gcActiveDownloadId) return;
    if (delta.state && delta.state.current === 'complete') {
        notifyGcTab(gcActiveTabId, { action: 'gcDownloadComplete', downloadId: delta.id, ok: true });
        gcActiveDownloadId = null;
        gcActiveTabId = null;
    } else if (delta.error && delta.error.current) {
        notifyGcTab(gcActiveTabId, { action: 'gcDownloadComplete', downloadId: delta.id, ok: false, error: delta.error.current });
        gcActiveDownloadId = null;
        gcActiveTabId = null;
    }
});

function notifyGcTab(tabId, message) {
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, message).catch(() => {});
}
