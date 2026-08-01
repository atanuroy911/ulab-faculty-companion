// results.js — loaded inside features/advising-billing/results.html
// (chrome-extension page). Combines the old advising report with live
// Save/Bill actions against URMS, using window.ULAB_SAVE_ENGINE
// (features/bulk-save/bulk-save.js) for the actual Load→Save→Email Bill
// network calls.
chrome.storage.local.get(['ulabABStudents', 'ulabABDetails', 'ulabABProgram'], (data) => {
    if (!data.ulabABStudents) {
        document.body.innerHTML = `
            <div style="color:#94a3b8;text-align:center;margin-top:120px;font-family:system-ui">
                <div style="font-size:48px;margin-bottom:16px">📭</div>
                <div style="font-size:20px;font-weight:600;color:#e2e8f0;margin-bottom:8px">No results yet</div>
                <div>Open the <strong style="color:#38bdf8">Advising & Save/Bill</strong> feature in the side panel and run a check.</div>
            </div>`;
        return;
    }

    const students = data.ulabABStudents || [];
    const details  = data.ulabABDetails  || {};
    const nStudents = students.length;
    const programId = data.ulabABProgram || 'CSE';
    const programMeta = (window.ULAB_PROGRAMS || []).find(p => p.id === programId);
    const programCat = (window.ULAB_CATALOGUES || {})[programId];
    const programLabel = programMeta ? programMeta.short : programId;

    document.getElementById('n-students-text').textContent = `${nStudents} Students Checked`;
    document.getElementById('stat-students').textContent = nStudents;

    function semesterRank(semStr) {
        const m = (semStr || '').match(/(Spring|Summer|Fall)\s+(\d{4})/i);
        if (!m) return 0;
        const termRank = { spring: 1, summer: 2, fall: 3 }[m[1].toLowerCase()] || 0;
        return parseInt(m[2], 10) * 10 + termRank;
    }

    function avatarColor(sid) {
        return `hsl(${parseInt(sid.slice(-3)) % 360},60%,45%)`;
    }
    function initials(name) {
        if (!name) return '??';
        return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
    }

    // Parse the raw trailing "flags" text captured from the pasted advising
    // list (e.g. "OK 20 Apr 2026 OK") into registration / payment-date / pre-reg.
    function parseFlags(flags) {
        if (!flags) return { regOk: null, payDate: '', preRegOk: null };
        const dateMatch = flags.match(/\d{1,2}\s+\w{3,9}\s+\d{4}/);
        const payDate = dateMatch ? dateMatch[0] : '';
        const before = dateMatch ? flags.slice(0, dateMatch.index).trim() : flags.trim();
        const after  = dateMatch ? flags.slice(dateMatch.index + payDate.length).trim() : '';
        const regOk = before ? /ok/i.test(before) && !/not/i.test(before) : null;
        const preRegOk = after ? /ok/i.test(after) && !/not/i.test(after) : null;
        return { regOk, payDate, preRegOk };
    }

    function flagBadge(label, ok) {
        if (ok === null) return `<span class="badge badge-muted">${label}: —</span>`;
        return ok
            ? `<span class="badge badge-ok">${label}: OK</span>`
            : `<span class="badge badge-bad">${label}: Not OK</span>`;
    }

    function probationLabel(tier) {
        if (tier === null || tier === undefined) return '';
        return tier === 'unspecified' ? 'Probation (tier unspecified)' : `Probation — Tier ${tier}`;
    }

    // ── Student detail modal (replaces the old inline expand-in-place card) ──
    let detailModalCtx = null; // { s, info, advising, flags, displayName } of the currently open modal
    function openDetailModal({ s, info, advising, flags, displayName, ini, col, headerBadges, buildBodyHTML }) {
        detailModalCtx = { s, info, advising, flags, displayName };
        document.getElementById('detail-modal-avatar').style.background = col;
        document.getElementById('detail-modal-avatar').textContent = ini;
        document.getElementById('detail-modal-name').textContent = displayName;
        document.getElementById('detail-modal-id').textContent = s.id + (s.email ? ' · ' + s.email : '');
        document.getElementById('detail-modal-badges').innerHTML = headerBadges;
        document.getElementById('detail-modal-body').innerHTML = buildBodyHTML();
        document.getElementById('detail-modal-email-btn').style.display = info.error ? 'none' : '';
        document.getElementById('detail-modal-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    function closeDetailModal() {
        document.getElementById('detail-modal-overlay').classList.remove('open');
        document.body.style.overflow = '';
        detailModalCtx = null;
    }
    document.getElementById('detail-modal-close').addEventListener('click', closeDetailModal);
    document.getElementById('detail-modal-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('detail-modal-overlay')) closeDetailModal();
    });
    document.getElementById('detail-modal-email-btn').addEventListener('click', () => {
        if (!detailModalCtx) return;
        const { s, info, advising, flags, displayName } = detailModalCtx;
        openEmailModal({
            title: `Advising Email — ${displayName}`,
            to: info.urmsEmail || s.email || '',
            subject: `Advising Status — ${displayName} (${s.id})`,
            body: buildStudentEmailText(s, info, advising, flags),
        });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('detail-modal-overlay').classList.contains('open')) closeDetailModal();
    });

    // ── Small "Issues" modal — just the issues + why, with a Details escape ──
    let issuesModalCtx = null;
    function openIssuesModal(ctx) {
        issuesModalCtx = ctx;
        const { displayName, buildIssuesBodyHTML } = ctx;
        document.getElementById('issues-modal-title').textContent = `Issues — ${displayName}`;
        document.getElementById('issues-modal-body').innerHTML = buildIssuesBodyHTML();
        document.getElementById('issues-modal-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    function closeIssuesModal() {
        document.getElementById('issues-modal-overlay').classList.remove('open');
        document.body.style.overflow = '';
        issuesModalCtx = null;
    }
    document.getElementById('issues-modal-close').addEventListener('click', closeIssuesModal);
    document.getElementById('issues-modal-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('issues-modal-overlay')) closeIssuesModal();
    });
    document.getElementById('issues-modal-details-btn').addEventListener('click', () => {
        if (!issuesModalCtx) return;
        const ctx = issuesModalCtx;
        closeIssuesModal();
        openDetailModal(ctx);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('issues-modal-overlay').classList.contains('open')) closeIssuesModal();
    });

    let probationCount = 0;
    let noCoursesCount = 0;
    let retakeCount = 0;
    let prereqIssueCount = 0;
    let labIssueCount = 0;
    let finalProbationCount = 0;
    let theoryConflictCount = 0;
    let paymentIssueCount = 0;
    let cleanCount = 0;

    const list = document.getElementById('students-list');
    const bulkEligible = []; // { s, name, categories } — candidates for the bulk Save & Email Bill modal (see below)
    const bulkExcluded = []; // { s, name, reasons } — never offered in the bulk modal; surfaced as a "left out" reminder instead

    for (const s of students) {
        const info = details[s.id] || {};
        const flags = parseFlags(s.flags);
        const col = avatarColor(s.id);
        const ini = initials(info.urmsName || s.name);
        const displayName = info.urmsName || s.name || 'Unknown';

        const advising = info.advising || { probationTier: null, finalProbation: false, needsRetake: [], prereqIssues: [], labWithoutTheory: [], theoryDayConflicts: [], degreeProgress: null };
        if (info.probation) probationCount++;
        const hasCourses = (info.coursesToRegister || []).length > 0;
        if (!info.error && !hasCourses) noCoursesCount++;
        const openRetakes = advising.needsRetake.filter(r => !r.retakingNow);
        if (openRetakes.length) retakeCount++;
        if (advising.prereqIssues.length) prereqIssueCount++;
        if ((advising.labWithoutTheory || []).length) labIssueCount++;
        if (advising.finalProbation) finalProbationCount++;
        if ((advising.theoryDayConflicts || []).length) theoryConflictCount++;
        if (info.paymentNotice) paymentIssueCount++;

        const isClean = !info.error && !info.probation && !info.paymentNotice && hasCourses
            && !openRetakes.length && !advising.prereqIssues.length && !(advising.labWithoutTheory || []).length
            && !(advising.theoryDayConflicts || []).length;
        if (isClean) cleanCount++;

        // One or more issue-category keys this student matches — drives the
        // "Filter by issue" panel (see applyFilters below). Kept in sync with
        // the categories surfaced in the stats row / issues modal.
        const issueKeys = [];
        if (info.error) issueKeys.push('error');
        if (isClean) issueKeys.push('clean');
        if (!isClean) issueKeys.push('anyissue');
        if (info.probation) issueKeys.push('probation');
        if (advising.finalProbation) issueKeys.push('finalprobation');
        if (!info.error && !hasCourses) issueKeys.push('nocourses');
        if (openRetakes.length) issueKeys.push('retake');
        if (advising.prereqIssues.length) issueKeys.push('prereq');
        if ((advising.labWithoutTheory || []).length) issueKeys.push('lab');
        if ((advising.theoryDayConflicts || []).length) issueKeys.push('theoryconflict');
        if (info.paymentNotice) issueKeys.push('payment');

        // Candidates for the bulk Save & Email Bill modal — anyone whose
        // course list actually exists and isn't blocked by an open retake.
        // A retake-pending student's registration is presumptively wrong
        // (they should be retaking the failed course, not what they added),
        // and "no courses added" has nothing to save — so both are hard
        // exclusions, never offered as checklist options.
        const bulkBlocked = !!info.error || !hasCourses || openRetakes.length > 0;
        if (!bulkBlocked) {
            bulkEligible.push({
                s,
                name: displayName,
                categories: issueKeys.filter(k => ['clean', 'probation', 'finalprobation', 'prereq', 'lab', 'theoryconflict'].includes(k)),
            });
        } else {
            // Never offered in the bulk checklist — the advisor has to reach
            // these students individually (see the "Left out" panel in the
            // bulk modal), so keep the reason around for that reminder.
            const reasons = [];
            if (info.error) reasons.push('error');
            if (!info.error && !hasCourses) reasons.push('nocourses');
            if (openRetakes.length) reasons.push('retake');
            bulkExcluded.push({ s, name: displayName, reasons });
        }

        const card = document.createElement('div');
        card.className = 'stu-card';
        card.dataset.sid = s.id;
        card.dataset.name = displayName.toLowerCase();
        card.dataset.clean = isClean ? '1' : '0';
        card.dataset.issues = issueKeys.join(' ');

        // Issues modal body — one table per issue category (same shape as the
        // detail modal's tables), instead of a single flattened list, so e.g.
        // several retaken courses each get their own row with course/title/
        // attempts columns rather than being squashed into one text blob.
        // Deferred (like buildBodyHTML) since it's only needed if opened.
        function buildIssuesBodyHTML() {
            let html = '';
            if (info.error) {
                return `<div class="error-note">Could not load this student's page: ${info.error}</div>`;
            }
            if (info.probation) {
                html += `<div class="probation-banner">⚠️ ${info.probation}</div>`;
            }
            if (advising.finalProbation) {
                html += `<div class="probation-banner">🚫 Final Probation (Tier 3) — cannot self-register; must go through Dept. Head/Coordinator.</div>`;
            }
            if (info.paymentNotice) {
                html += `<div class="probation-banner">💳 ${info.paymentNotice}</div>`;
            }
            if ((advising.theoryDayConflicts || []).length) {
                html += `<div class="section-label">📅 3+ theory courses on the same day</div>
                    <table class="mini-table">
                        <thead><tr><th>Day</th><th>Theory Courses</th></tr></thead>
                        <tbody>
                            ${advising.theoryDayConflicts.map(c => `
                                <tr><td>${c.day}</td><td class="grade-fail">${c.courses.map(x => `${x.courseId} (${x.title})`).join(', ')}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>`;
            }
            if (openRetakes.length) {
                html += `<div class="section-label">↻ Courses to retake (failed, not yet passed)</div>
                    <table class="mini-table">
                        <thead><tr><th>Course</th><th>Title</th><th>Attempts</th></tr></thead>
                        <tbody>
                            ${openRetakes.map(r => `
                                <tr><td>${r.courseId}</td><td>${r.title}</td><td>${r.attempts.join(', ')}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>`;
            }
            if (advising.prereqIssues.length) {
                html += `<div class="section-label">⛔ Prerequisite issues in added courses</div>
                    <table class="mini-table">
                        <thead><tr><th>Added Course</th><th>Missing Prerequisite(s)</th></tr></thead>
                        <tbody>
                            ${advising.prereqIssues.map(p => `
                                <tr><td>${p.courseId} — ${p.title}</td><td class="grade-fail">${p.missing.map(m => `${m.courseId} (${m.title})`).join(', ')}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>`;
            }
            if ((advising.labWithoutTheory || []).length) {
                html += `<div class="section-label">🧪 Lab registered without its theory course</div>
                    <table class="mini-table">
                        <thead><tr><th>Lab Course</th><th>Missing Theory Course</th></tr></thead>
                        <tbody>
                            ${advising.labWithoutTheory.map(l => `
                                <tr><td>${l.labCourseId} — ${l.labTitle}</td><td class="grade-fail">${l.theoryCourseId} (${l.theoryTitle})</td></tr>
                            `).join('')}
                        </tbody>
                    </table>`;
            }
            if (!hasCourses && !info.registrationNotice) {
                html += `<div class="section-label">📝 No courses added</div>
                    <div class="empty-note">This student has not added any courses for the semester yet.</div>`;
            }
            return html || `<div class="empty-note">No specific issues recorded.</div>`;
        }

        // Full verbose badge set — only shown inside the detail modal, where
        // there's room and the user has explicitly asked to see everything.
        const detailBadges = info.error
            ? `<span class="badge badge-bad">⚠️ Fetch failed</span>`
            : `
                ${flagBadge('Reg', flags.regOk)}
                ${info.probation ? `<span class="badge badge-warn">⚠️ ${probationLabel(advising.probationTier)}</span>` : ''}
                ${advising.finalProbation ? `<span class="badge badge-bad">🚫 Final Probation — cannot self-register</span>` : ''}
                ${info.paymentNotice ? `<span class="badge badge-bad">💳 Pre-reg payment issue</span>` : ''}
                ${openRetakes.length ? `<span class="badge badge-bad">↻ ${openRetakes.length} course(s) to retake</span>` : ''}
                ${advising.prereqIssues.length ? `<span class="badge badge-bad">⛔ Prereq issue</span>` : ''}
                ${(advising.labWithoutTheory || []).length ? `<span class="badge badge-bad">🧪 Lab without theory</span>` : ''}
                ${(advising.theoryDayConflicts || []).length ? `<span class="badge badge-warn">📅 3+ theory in 1 day</span>` : ''}
                ${hasCourses ? `<span class="badge badge-ok">✓ ${info.coursesToRegister.length} course(s) added</span>` : (info.registrationNotice ? '' : `<span class="badge badge-warn">📝 No courses added</span>`)}
                ${isClean ? `<span class="badge badge-ok">✓ Clean — auto Save+Bill eligible</span>` : ''}
            `;

        // Compact card-header cluster — one glance, minimal text. A small
        // course-count chip, and a single clickable "N issues" chip that
        // summarizes every issue category at once instead of one pill per
        // category (details live in the Issues modal / detail modal on demand).
        const issueCategoryCount = (info.probation ? 1 : 0) + (openRetakes.length ? 1 : 0)
            + (advising.prereqIssues.length ? 1 : 0) + ((advising.labWithoutTheory || []).length ? 1 : 0)
            + ((advising.theoryDayConflicts || []).length ? 1 : 0) + (info.paymentNotice ? 1 : 0);

        const compactBadges = info.error
            ? `<span class="chip chip-bad">⚠️ Fetch failed</span>`
            : `
                ${hasCourses
                    ? `<span class="chip chip-muted">📚 ${info.coursesToRegister.length} course${info.coursesToRegister.length === 1 ? '' : 's'} added</span>`
                    : (info.registrationNotice ? '' : `<span class="chip chip-warn">📝 No courses added</span>`)}
                ${advising.finalProbation ? `<span class="chip chip-bad" title="Final Probation — cannot self-register online">🚫 Restricted</span>` : ''}
                ${isClean
                    ? `<span class="chip chip-ok">✓ Clean</span>`
                    : (issueCategoryCount ? `<button class="chip chip-warn chip-clickable" data-sid="${s.id}" title="Click to see the issues">⚠ ${issueCategoryCount} issue${issueCategoryCount > 1 ? 's' : ''}</button>` : '')}
            `;

        // Body HTML is expensive to build (several nested tables) and stays
        // visually collapsed until expanded — with large lists (100+
        // students) building all of this up front is the real cost, so it's
        // deferred until the card is first opened (see the click handler
        // below) rather than computed here for every card immediately.
        function buildBodyHTML() {
        let bodyHTML = '';
        if (info.error) {
            bodyHTML = `<div class="error-note">Could not load this student's page: ${info.error}</div>`;
        } else {
            if (info.registrationNotice) {
                bodyHTML += `<div class="info-banner">🕒 ${info.registrationNotice}</div>`;
            }

            if (info.paymentNotice) {
                bodyHTML += `<div class="probation-banner">💳 ${info.paymentNotice} Pre-registration payment needs to be cleared before the course list can be checked.</div>`;
            }

            if (info.probation) {
                bodyHTML += `<div class="probation-banner">⚠️ ${info.probation}</div>`;
            }

            if (advising.finalProbation) {
                bodyHTML += `<div class="probation-banner">🚫 Final Probation (Tier 3) — cannot self-register; must go through Dept. Head/Coordinator.</div>`;
            }

            if ((advising.theoryDayConflicts || []).length) {
                bodyHTML += `<div class="section-label">📅 3+ theory courses on the same day</div>
                    <table class="mini-table">
                        <thead><tr><th>Day</th><th>Theory Courses</th></tr></thead>
                        <tbody>
                            ${advising.theoryDayConflicts.map(c => `
                                <tr>
                                    <td>${c.day}</td>
                                    <td class="grade-fail">${c.courses.map(x => `${x.courseId} (${x.title})`).join(', ')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="empty-note">3 theory courses on the same day means all 3 finals will also fall on that day — not recommended. Section change is only permitted to resolve this specific conflict if it arose by chance during pre-registration/registration/add-drop; otherwise section changes are not allowed.</div>`;
            }

            if (openRetakes.length) {
                bodyHTML += `<div class="section-label">↻ Courses to retake (failed, not yet passed)</div>
                    <table class="mini-table">
                        <thead><tr><th>Course</th><th>Title</th><th>Attempts</th><th>Status</th></tr></thead>
                        <tbody>
                            ${openRetakes.map(r => `
                                <tr>
                                    <td>${r.courseId}</td>
                                    <td>${r.title}</td>
                                    <td>${r.attempts.join(', ')}</td>
                                    <td class="grade-fail">Not yet retaken</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>`;
            }
            const retakingNow = advising.needsRetake.filter(r => r.retakingNow);
            if (retakingNow.length) {
                bodyHTML += `<div class="empty-note">↻ Currently re-registered for: ${retakingNow.map(r => r.courseId).join(', ')} — please confirm before advising, automated check.</div>`;
            }

            if (advising.prereqIssues.length) {
                bodyHTML += `<div class="section-label">⛔ Prerequisite issues in added courses</div>
                    <table class="mini-table">
                        <thead><tr><th>Added Course</th><th>Missing Prerequisite(s)</th></tr></thead>
                        <tbody>
                            ${advising.prereqIssues.map(p => `
                                <tr>
                                    <td>${p.courseId} — ${p.title}</td>
                                    <td class="grade-fail">${p.missing.map(m => `${m.courseId} (${m.title})`).join(', ')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="empty-note">Suggestion: consider registering for the missing prerequisite(s) this semester instead. Automated check — please verify.</div>`;
            }

            if ((advising.labWithoutTheory || []).length) {
                bodyHTML += `<div class="section-label">🧪 Lab registered without its theory course</div>
                    <table class="mini-table">
                        <thead><tr><th>Lab Course</th><th>Missing Theory Course</th></tr></thead>
                        <tbody>
                            ${advising.labWithoutTheory.map(l => `
                                <tr>
                                    <td>${l.labCourseId} — ${l.labTitle}</td>
                                    <td class="grade-fail">${l.theoryCourseId} (${l.theoryTitle})</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="empty-note">Theory should be taken before or alongside its lab. Suggestion: register for the theory course this semester too. Automated check — please verify.</div>`;
            }

            const si = info.studentInfo || {};
            bodyHTML += `
                <div class="detail-grid">
                    <div class="detail-chip"><div class="detail-label">Advisor</div><div class="detail-value">${info.advisor || '—'}</div></div>
                    <div class="detail-chip"><div class="detail-label">Program</div><div class="detail-value">${info.program || '—'}</div></div>
                    <div class="detail-chip"><div class="detail-label">CGPA</div><div class="detail-value">${si['CGPA'] || '—'}</div></div>
                    <div class="detail-chip"><div class="detail-label">Credits Completed</div><div class="detail-value">${si['Total Credit Hours Completed'] || '—'}</div></div>
                    <div class="detail-chip"><div class="detail-label">Credits Attempted</div><div class="detail-value">${si['Credits Attempted'] || '—'}</div></div>
                    <div class="detail-chip"><div class="detail-label">Degree Requirement</div><div class="detail-value">${si['Degree Requirement'] || '—'}</div></div>
                    <div class="detail-chip"><div class="detail-label">Max Credit (this sem)</div><div class="detail-value">${si['Max Credit'] || '—'}</div></div>
                    <div class="detail-chip"><div class="detail-label">Payment Due</div><div class="detail-value">${flags.payDate || '—'}</div></div>
                </div>
            `;

            if (advising.degreeProgress) {
                const { progress } = advising.degreeProgress;
                const totalCredits = programCat && programCat.degreeRequirements ? programCat.degreeRequirements.total : null;
                bodyHTML += `<div class="section-label">🎓 Degree Progress (${programMeta ? programMeta.name : programLabel}${totalCredits ? `, ${totalCredits} credits` : ''})</div>
                    <table class="mini-table">
                        <thead><tr><th>Category</th><th>Earned</th><th>In Progress</th><th>Required</th><th>Status</th></tr></thead>
                        <tbody>
                            ${progress.map(p => `
                                <tr>
                                    <td>${p.label}</td>
                                    <td>${p.earnedCredits}</td>
                                    <td>${p.inProgressCredits || '—'}</td>
                                    <td>${p.required}</td>
                                    <td class="${p.shortBy > 0 ? 'grade-fail' : ''}">${p.shortBy > 0 ? `Short by ${p.shortBy}` : '✓ Met'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="empty-note">
                        Major Elective and Optional/Minor credits are estimated from the course code pattern
                        (concentration electives and other-department courses aren't individually listed in the
                        catalogue) — treat as approximate. "Short by" is normal for earlier-semester students; it's
                        not an issue on its own.
                    </div>`;
            }

            bodyHTML += `<div class="section-label">📝 Courses to be registered${info.totalCreditRegistering ? ` — ${info.totalCreditRegistering} credit(s)` : ''}</div>`;
            if (hasCourses) {
                bodyHTML += `
                    <table class="mini-table">
                        <thead><tr><th>Course</th><th>Title</th><th>Sec</th><th>Schedule</th></tr></thead>
                        <tbody>
                            ${info.coursesToRegister.map(c => `
                                <tr><td>${c.courseId}</td><td>${c.title}</td><td>${c.section}</td><td>${c.schedule}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>`;
            } else if (info.registrationNotice) {
                bodyHTML += `<div class="empty-note">🕒 ${info.registrationNotice} — the course list can't be checked until pre-registration/registration opens.</div>`;
            } else {
                bodyHTML += `<div class="empty-note">No courses added yet for this semester.</div>`;
            }

            if ((info.semesterGpa || []).length) {
                const gpaRows = info.semesterGpa;
                const headers = Object.keys(gpaRows[gpaRows.length - 1]).filter(k => k !== 'cells');
                bodyHTML += `<div class="section-label">📈 Semester-wise GPA</div>
                    <table class="mini-table">
                        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                        <tbody>
                            ${gpaRows.map(r => `<tr>${headers.map(h => `<td>${r[h] || ''}</td>`).join('')}</tr>`).join('')}
                        </tbody>
                    </table>`;
            }

            if ((info.completedCourses || []).length) {
                const cat = programCat;
                const rows = info.completedCourses.slice().sort((a, b) => semesterRank(a['Semester']) - semesterRank(b['Semester']));
                bodyHTML += `<div class="section-label">📚 Completed / Registered Courses</div>
                    <table class="mini-table">
                        <thead><tr><th>Semester</th><th>Course</th><th>Title</th><th>Credit</th><th>Grade</th></tr></thead>
                        <tbody>
                            ${rows.map(r => {
                                const courseId = (r['CourseID'] || r['CourseId'] || '').trim();
                                const title = cat ? (cat.titleFor(courseId) || '—') : '—';
                                const grade = (r['Grade'] || '').trim();
                                const cls = /^F$/.test(grade) ? 'grade-fail' : '';
                                return `
                                    <tr>
                                        <td>${r['Semester'] || ''}</td>
                                        <td>${courseId}</td>
                                        <td>${title}</td>
                                        <td>${r['Credit'] || ''}</td>
                                        <td class="${cls}">${grade || '—'}</td>
                                    </tr>`;
                            }).join('')}
                        </tbody>
                    </table>`;
            }
        }
        return bodyHTML;
        }

        card.innerHTML = `
            <div class="stu-header">
                <div class="avatar" style="background:${col}">${ini}</div>
                <div class="stu-info">
                    <div class="stu-name">${displayName}</div>
                    <div class="stu-id">${s.id}${s.email ? ' · ' + s.email : ''}</div>
                </div>
                <div class="stu-flags">${compactBadges}</div>
                ${!info.error ? `<button class="card-email-btn" data-sid="${s.id}" title="Copy this student's advising email">✉️ Email</button>` : ''}
                <span class="view-details-hint">Details ›</span>
            </div>
            <div class="stu-actions">
                <button class="save-action-btn" data-sid="${s.id}" data-mode="save" ${info.error ? 'disabled' : ''}>💾 Save</button>
                <button class="save-action-btn" data-sid="${s.id}" data-mode="bill" ${info.error ? 'disabled' : ''}>📧 Save + Bill</button>
                <span class="save-status" id="save-status-${s.id}"></span>
            </div>
        `;
        const cardCtx = { s, info, advising, flags, displayName, ini, col, headerBadges: detailBadges, buildBodyHTML, buildIssuesBodyHTML };
        card.querySelector('.stu-header').addEventListener('click', (e) => {
            if (e.target.closest('.card-email-btn') || e.target.closest('.chip-clickable')) return;
            openDetailModal(cardCtx);
        });
        const emailBtn = card.querySelector('.card-email-btn');
        if (emailBtn) {
            emailBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEmailModal({
                    title: `Advising Email — ${displayName}`,
                    to: info.urmsEmail || s.email || '',
                    body: buildStudentEmailText(s, info, advising, flags),
                });
            });
        }
        const issuesChip = card.querySelector('.chip-clickable');
        if (issuesChip) {
            issuesChip.addEventListener('click', (e) => {
                e.stopPropagation();
                openIssuesModal(cardCtx);
            });
        }
        card.querySelectorAll('.save-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                runSaveAction(s, btn.dataset.mode === 'bill', btn);
            });
        });
        list.appendChild(card);
    }

    document.getElementById('stat-clean').textContent = cleanCount;
    document.getElementById('stat-probation').textContent = probationCount;
    document.getElementById('stat-nocourses').textContent = noCoursesCount;
    document.getElementById('stat-retake').textContent = retakeCount;
    document.getElementById('stat-prereq').textContent = prereqIssueCount;
    document.getElementById('stat-lab').textContent = labIssueCount;
    document.getElementById('stat-final-probation').textContent = finalProbationCount;
    document.getElementById('stat-theory-conflict').textContent = theoryConflictCount;
    document.getElementById('stat-payment').textContent = paymentIssueCount;

    // ── Save / Save+Bill actions — live against URMS via ULAB_SAVE_ENGINE ───
    const BASE = 'https://urms-awp.ulab.edu.bd';
    let sharedToken = null;
    let sharedSemesterId;

    function setSaveStatus(sid, msg, cls) {
        const el = document.getElementById('save-status-' + sid);
        if (el) { el.textContent = msg; el.className = `save-status save-status-${cls || ''}`; }
    }

    async function runSaveAction(s, emailBillEnabled, btn) {
        const engine = window.ULAB_SAVE_ENGINE;
        if (!engine) { setSaveStatus(s.id, '❌ Save engine not loaded', 'fail'); return; }
        const card = btn.closest('.stu-card');
        card.querySelectorAll('.save-action-btn').forEach(b => b.disabled = true);
        setSaveStatus(s.id, '⏳ Saving…', 'pending');

        const parser = new DOMParser();
        try {
            const result = await engine.saveOneStudent(s, { parser, BASE, emailBillEnabled, sharedToken, semesterId: sharedSemesterId });
            sharedToken = result.token;
            if (sharedSemesterId === undefined) sharedSemesterId = result.semesterId;
            setSaveStatus(s.id, result.rowMsg, result.rowClass);
        } catch (err) {
            console.error('[ULAB Advising & Billing]', s.id, err);
            setSaveStatus(s.id, `❌ ${err.message}`, 'fail');
        } finally {
            card.querySelectorAll('.save-action-btn').forEach(b => b.disabled = false);
        }
    }

    // ── Bulk "Save & Email Bill" modal ───────────────────────────────────────
    // Opens a checklist modal instead of saving immediately: Clean is checked
    // by default, but Probation / Final Probation / Prerequisite issues /
    // Lab without theory / 3+ theory in 1 day can each be opted in too.
    // Students with an open retake or no courses added are never offered —
    // they're excluded from bulkEligible entirely (see the main student loop).
    const CATEGORY_LABELS = {
        clean: '✓ Clean (no issues)',
        probation: '⚠️ On probation',
        finalprobation: '🚫 Final probation (restricted)',
        prereq: '⛔ Prerequisite issues',
        lab: '🧪 Lab without theory',
        theoryconflict: '📅 3+ theory in 1 day',
    };

    const bulkModalOverlay = document.getElementById('bulk-save-modal-overlay');
    const bulkChecklist = document.getElementById('bulk-save-checklist');
    const bulkCountEl = document.getElementById('bulk-save-count');
    const bulkStartBtn = document.getElementById('bulk-save-start');
    const bulkStartLabel = document.getElementById('bulk-save-start-label');
    const bulkProgressWrap = document.getElementById('bulk-save-progress-wrap');
    const bulkProgressBar = document.getElementById('bulk-save-progress-bar');
    const bulkProgressText = document.getElementById('bulk-save-progress-text');
    const bulkLog = document.getElementById('bulk-run-log');
    const bulkEmailToggle = document.getElementById('bulk-email-toggle');
    const bulkLeftoutHeader = document.getElementById('bulk-leftout-header');
    const bulkLeftoutBody = document.getElementById('bulk-leftout-body');
    const bulkLeftoutCount = document.getElementById('bulk-leftout-count');
    let bulkStopRequested = false;
    let bulkRunning = false;

    const REASON_LABELS = {
        retake: '↻ Needs to retake a course',
        nocourses: '📝 No courses added',
        error: '⚠️ Fetch failed',
        unselected: 'Category not checked for this run',
    };

    // "Left out" = hard-excluded (retake/no courses/fetch error, never
    // offered) plus anyone eligible but whose category isn't currently
    // checked — the whole point being a standing reminder that these
    // students still need a human advisor to reach out and email them,
    // since the bulk action won't touch them.
    function renderLeftOut() {
        const checked = Array.from(document.querySelectorAll('.bulk-cat-check')).filter(cb => cb.checked).map(cb => cb.dataset.key);
        const unselected = bulkEligible.filter(e => !e.categories.some(c => checked.includes(c)));
        const rows = [
            ...bulkExcluded.map(e => ({ s: e.s, name: e.name, reasons: e.reasons })),
            ...unselected.map(e => ({ s: e.s, name: e.name, reasons: ['unselected'] })),
        ];
        bulkLeftoutCount.textContent = rows.length;
        bulkLeftoutBody.innerHTML = rows.length
            ? rows.map(r => `<div class="leftout-row">
                    <span>${r.s.id} ${r.name ? '(' + r.name + ')' : ''}</span>
                    <span class="leftout-reason">${r.reasons.map(k => REASON_LABELS[k] || k).join(', ')}</span>
                </div>`).join('')
            : `<div class="empty-note">Nobody left out — every student is either included above or has no advising record to act on.</div>`;
    }
    bulkLeftoutHeader.addEventListener('click', () => {
        bulkLeftoutHeader.classList.toggle('open');
        bulkLeftoutBody.classList.toggle('open');
    });

    // Only offer checklist rows for categories that actually have at least
    // one eligible student, so e.g. a cohort with no probation cases doesn't
    // show a dead checkbox.
    const categoriesPresent = Object.keys(CATEGORY_LABELS).filter(key =>
        bulkEligible.some(e => e.categories.includes(key))
    );
    bulkChecklist.innerHTML = categoriesPresent.map(key => {
        const n = bulkEligible.filter(e => e.categories.includes(key)).length;
        return `<label class="filter-option">
            <input type="checkbox" class="bulk-cat-check" data-key="${key}" ${key === 'clean' ? 'checked' : ''}>
            ${CATEGORY_LABELS[key]} (${n})
        </label>`;
    }).join('') || `<div class="empty-note">No eligible students (everyone either needs a retake or has no courses added).</div>`;

    function selectedBulkStudents() {
        const checked = Array.from(document.querySelectorAll('.bulk-cat-check')).filter(cb => cb.checked).map(cb => cb.dataset.key);
        if (!checked.length) return [];
        const seen = new Set();
        const out = [];
        for (const e of bulkEligible) {
            if (seen.has(e.s.id)) continue;
            if (e.categories.some(c => checked.includes(c))) { out.push(e); seen.add(e.s.id); }
        }
        return out;
    }

    function refreshBulkCount() {
        const n = selectedBulkStudents().length;
        bulkCountEl.textContent = n;
        bulkStartBtn.disabled = n === 0 || bulkRunning;
        renderLeftOut();
    }
    document.getElementById('btn-bulk-save').addEventListener('click', () => {
        if (!categoriesPresent.length) return;
        refreshBulkCount();
        bulkProgressWrap.style.display = 'none';
        bulkLog.innerHTML = '';
        bulkLog.classList.remove('show');
        bulkModalOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    });
    bulkChecklist.addEventListener('change', refreshBulkCount);

    function closeBulkModal() {
        if (bulkRunning) { bulkStopRequested = true; return; }
        bulkModalOverlay.classList.remove('open');
        document.body.style.overflow = '';
    }
    document.getElementById('bulk-save-modal-close').addEventListener('click', closeBulkModal);
    bulkModalOverlay.addEventListener('click', (e) => { if (e.target === bulkModalOverlay) closeBulkModal(); });

    // Accordion-style log row: the header is the one-line status (same as
    // before), collapsed by default; clicking it reveals the verbose detail
    // (full engine response text, and which issue categories put this
    // student in the run) instead of cramming everything into one line.
    function appendBulkLog(sid, name, cls, msg, verbose) {
        bulkLog.classList.add('show');
        const item = document.createElement('div');
        item.className = 'log-accordion-item';
        const header = document.createElement('button');
        header.type = 'button';
        header.className = `log-accordion-header bulk-log-${cls}`;
        header.innerHTML = `<span>${sid} ${name ? '(' + name + ')' : ''} — ${msg}</span>${verbose ? '<span class="accordion-caret">▾</span>' : ''}`;
        item.appendChild(header);
        if (verbose) {
            const body = document.createElement('div');
            body.className = 'log-accordion-body';
            body.textContent = verbose;
            item.appendChild(body);
            header.addEventListener('click', () => {
                header.classList.toggle('open');
                body.classList.toggle('open');
            });
        }
        bulkLog.appendChild(item);
        bulkLog.scrollTop = bulkLog.scrollHeight;
    }

    bulkStartBtn.addEventListener('click', async () => {
        const engine = window.ULAB_SAVE_ENGINE;
        const targets = selectedBulkStudents();
        if (!engine || !targets.length) return;
        const emailBillEnabled = bulkEmailToggle.checked;

        bulkRunning = true;
        bulkStopRequested = false;
        bulkStartBtn.disabled = true;
        bulkStartLabel.textContent = '⏳ Running…';
        document.querySelectorAll('.bulk-cat-check').forEach(cb => cb.disabled = true);
        bulkProgressWrap.style.display = '';
        bulkLog.innerHTML = '';
        bulkLog.classList.add('show');

        const parser = new DOMParser();
        try {
            if (!sharedToken) {
                const shared = await engine.fetchSharedToken(parser, BASE);
                sharedToken = shared.token;
                sharedSemesterId = shared.semesterId;
            }

            for (let i = 0; i < targets.length; i++) {
                if (bulkStopRequested) { appendBulkLog('', '', 'skip', `Stopped — ${targets.length - i} student(s) not run.`); break; }
                const { s, categories } = targets[i];
                const categoryText = `Included for: ${categories.map(c => CATEGORY_LABELS[c] || c).join(', ')}`;
                bulkProgressText.textContent = `${i + 1} / ${targets.length} — ${s.name || s.id}`;
                bulkProgressBar.style.width = `${Math.round((i / targets.length) * 100)}%`;
                setSaveStatus(s.id, '⏳ Saving…', 'pending');
                try {
                    const result = await engine.saveOneStudent(s, { parser, BASE, emailBillEnabled, sharedToken, semesterId: sharedSemesterId });
                    sharedToken = result.token;
                    setSaveStatus(s.id, result.rowMsg, result.rowClass);
                    appendBulkLog(s.id, s.name, result.rowClass, result.rowMsg, `${categoryText}\n${result.detail || result.rowMsg}`);
                } catch (err) {
                    console.error('[ULAB Advising & Billing]', s.id, err);
                    setSaveStatus(s.id, `❌ ${err.message}`, 'fail');
                    appendBulkLog(s.id, s.name, 'fail', 'Failed', `${categoryText}\n${err.message}`);
                }
                bulkProgressBar.style.width = `${Math.round(((i + 1) / targets.length) * 100)}%`;
            }
            if (!bulkStopRequested) bulkProgressText.textContent = `Done — ${targets.length} / ${targets.length}`;
        } finally {
            bulkRunning = false;
            document.querySelectorAll('.bulk-cat-check').forEach(cb => cb.disabled = false);
            bulkStartLabel.textContent = '▶ Start Save & Email Bill';
            refreshBulkCount();
            if (bulkStopRequested) closeBulkModal();
        }
    });

    // ── Communication tools: bulk email, per-student email, CSV, email list ─
    const DISCLAIMER = 'This is an automated advising check generated from your URMS record. Please verify the details with your advisor before making any registration decisions.';
    // General note included in every email regardless of whether this
    // particular student currently has a conflict — students should know the
    // rule before they register, not just after they've already broken it.
    const THEORY_DAY_NOTE = 'Note: Please avoid selecting 3 theory courses on the same day of the week — their final exams will then also fall on that same day, which is not recommended. Section changes are only permitted to resolve a 3-theory-in-one-day conflict if it arises by chance during pre-registration, registration, or add/drop; section changes are not approved for any other reason.';

    function buildStudentEmailText(s, info, advising, flags) {
        const name = (info && info.urmsName) || s.name || 'Student';
        const lines = [];
        lines.push(`Dear ${name},`);
        lines.push('');
        lines.push(`Please find your advising status below (Student ID: ${s.id}).`);
        lines.push('');

        if (info.registrationNotice) {
            lines.push(`🕒 ${info.registrationNotice} Your course list can't be checked yet — this email covers everything else on your record.`);
            lines.push('');
        }

        if (info.paymentNotice) {
            lines.push(`💳 ${info.paymentNotice} Your pre-registration payment needs to be cleared before your course list can be checked.`);
            lines.push('');
        }

        if (advising.probationTier !== null && advising.probationTier !== undefined) {
            lines.push(`⚠️ PROBATION: You are currently on academic probation${advising.probationTier === 'unspecified' ? '' : ` (Tier ${advising.probationTier})`}. Please meet your advisor as soon as possible to discuss your academic plan.`);
            lines.push('');
        }

        if (advising.finalProbation) {
            lines.push('🚫 FINAL PROBATION (Probation 3 — CGPA below 2.00 for the last three consecutive terms): you will not be able to access the online registration system independently.');
            lines.push('You may still register with the assistance of the Department Head or Coordinator — please send a request email or visit in person.');
            lines.push('');
        }

        const openRetakes = (advising.needsRetake || []).filter(r => !r.retakingNow);
        if (openRetakes.length) {
            lines.push('Courses you need to retake (previously failed, not yet passed):');
            for (const r of openRetakes) lines.push(`  - ${r.courseId} (${r.title}) — attempts: ${r.attempts.join(', ')}`);
            lines.push('');
        }
        const retakingNow = (advising.needsRetake || []).filter(r => r.retakingNow);
        if (retakingNow.length) {
            lines.push(`Note: you appear to be currently re-registered for: ${retakingNow.map(r => r.courseId).join(', ')}. Please confirm this is correct.`);
            lines.push('');
        }

        if ((advising.prereqIssues || []).length) {
            lines.push('Prerequisite issues found in the courses you have added this semester:');
            for (const p of advising.prereqIssues) {
                lines.push(`  - ${p.courseId} (${p.title}) requires: ${p.missing.map(m => `${m.courseId} (${m.title})`).join(', ')}`);
            }
            lines.push('Recommendation: consider registering for the missing prerequisite course(s) instead this semester.');
            lines.push('');
        }

        if ((advising.labWithoutTheory || []).length) {
            lines.push('Lab course(s) registered without their theory course:');
            for (const l of advising.labWithoutTheory) {
                lines.push(`  - ${l.labCourseId} (${l.labTitle}) — requires theory: ${l.theoryCourseId} (${l.theoryTitle})`);
            }
            lines.push('Recommendation: register for the theory course this semester alongside the lab.');
            lines.push('');
        }

        if ((advising.theoryDayConflicts || []).length) {
            lines.push('📅 Scheduling note: you have 3 or more theory courses on the same day:');
            for (const c of advising.theoryDayConflicts) {
                lines.push(`  - ${c.day}: ${c.courses.map(x => `${x.courseId} (${x.title})`).join(', ')}`);
            }
            lines.push('This means all of those finals will also fall on the same day — not recommended. A section change to fix this specific conflict is permitted since it arose during pre-registration/registration/add-drop.');
            lines.push('');
        }

        if (!info.paymentNotice && !openRetakes.length && !(advising.prereqIssues || []).length && !(advising.labWithoutTheory || []).length
            && !(advising.theoryDayConflicts || []).length && advising.probationTier === null) {
            lines.push('No issues found — you are clear to proceed with registration as planned.');
            lines.push('');
        }

        lines.push(`Registration status: ${flags.regOk === null ? '—' : (flags.regOk ? 'OK' : 'Not OK')}`);
        lines.push(`Pre-registration status: ${flags.preRegOk === null ? '—' : (flags.preRegOk ? 'OK' : 'Not OK')}`);
        if (flags.payDate) lines.push(`Payment due: ${flags.payDate}`);
        lines.push('');
        lines.push(THEORY_DAY_NOTE);
        lines.push('');
        lines.push(DISCLAIMER);
        lines.push('');
        lines.push('Regards,');
        lines.push('Your Advisor');
        return lines.join('\n');
    }

    function buildBulkEmailText(recipients) {
        const lines = [];
        lines.push('Dear Advisees,');
        lines.push('');
        lines.push('Find your advising status below. Locate the entry matching your Student ID and follow up on any action items before registration closes.');
        lines.push('');
        lines.push(THEORY_DAY_NOTE);
        lines.push('');

        (recipients || students).forEach((s, idx) => {
            const info = details[s.id] || {};
            const advising = info.advising || { probationTier: null, finalProbation: false, needsRetake: [], prereqIssues: [], labWithoutTheory: [], theoryDayConflicts: [] };
            const name = info.urmsName || s.name || 'Unknown';
            const openRetakes = (advising.needsRetake || []).filter(r => !r.retakingNow);

            lines.push(`${idx + 1}. ${name} — ${s.id}`);

            if (info.error) {
                lines.push(`   ⚠️ Could not load this student's URMS record — please check manually.`);
                lines.push('');
                return;
            }

            const probationText = advising.probationTier !== null && advising.probationTier !== undefined
                ? `Probation${advising.probationTier === 'unspecified' ? '' : ` — Tier ${advising.probationTier}`}`
                : 'Not on probation';
            lines.push(`   Status: ${probationText}`);

            if (advising.finalProbation) {
                lines.push('   🚫 FINAL PROBATION: cannot self-register online — must register via Department Head/Coordinator (request email or in person).');
            }

            if (info.registrationNotice) {
                lines.push(`   🕒 ${info.registrationNotice} Course list can't be checked yet.`);
            }

            if (info.paymentNotice) {
                lines.push(`   💳 ${info.paymentNotice} Pre-registration payment needs to be cleared.`);
            }

            if (openRetakes.length) {
                lines.push(`   Courses to retake: ${openRetakes.map(r => `${r.courseId} (${r.title})`).join(', ')}`);
            }
            const retakingNow = (advising.needsRetake || []).filter(r => r.retakingNow);
            if (retakingNow.length) {
                lines.push(`   Currently re-registered for: ${retakingNow.map(r => r.courseId).join(', ')} — please confirm`);
            }
            if ((advising.prereqIssues || []).length) {
                lines.push(`   Prerequisite issues: ${advising.prereqIssues.map(p => `${p.courseId} needs ${p.missing.map(m => m.courseId).join('/')}`).join('; ')}`);
            }
            if ((advising.labWithoutTheory || []).length) {
                lines.push(`   Lab without theory: ${advising.labWithoutTheory.map(l => `${l.labCourseId} needs ${l.theoryCourseId}`).join('; ')}`);
            }
            if ((advising.theoryDayConflicts || []).length) {
                lines.push(`   3+ theory in 1 day: ${advising.theoryDayConflicts.map(c => `${c.day} (${c.courses.map(x => x.courseId).join(', ')})`).join('; ')} — section change permitted to fix this`);
            }
            if (!info.paymentNotice && !openRetakes.length && !(advising.prereqIssues || []).length && !(advising.labWithoutTheory || []).length
                && !(advising.theoryDayConflicts || []).length && advising.probationTier === null) {
                lines.push('   No issues found — clear to proceed with registration.');
            }
            lines.push('');
        });

        lines.push(DISCLAIMER);
        lines.push('');
        lines.push('Regards,');
        lines.push('Your Advisor');
        return lines.join('\n');
    }

    function buildCSV() {
        const headers = ['Student ID', 'Name', 'Email', 'Clean (Auto Save+Bill Eligible)', 'Probation Tier', 'Final Probation (Restricted)', 'Courses To Retake', 'Prerequisite Issues', 'Lab Without Theory', '3+ Theory In 1 Day', 'Pre-Registration Payment Issue', 'Registration OK', 'Pre-Reg OK', 'Payment Due'];
        const rows = [headers];
        for (const s of students) {
            const info = details[s.id] || {};
            const advising = info.advising || { probationTier: null, finalProbation: false, needsRetake: [], prereqIssues: [], labWithoutTheory: [], theoryDayConflicts: [] };
            const flags = parseFlags(s.flags);
            const openRetakes = (advising.needsRetake || []).filter(r => !r.retakingNow);
            const hasCourses = (info.coursesToRegister || []).length > 0;
            const isClean = !info.error && !info.probation && !info.paymentNotice && hasCourses
                && !openRetakes.length && !advising.prereqIssues.length && !(advising.labWithoutTheory || []).length
                && !(advising.theoryDayConflicts || []).length;
            rows.push([
                s.id,
                info.urmsName || s.name || '',
                info.urmsEmail || s.email || '',
                isClean ? 'Yes' : 'No',
                advising.probationTier === null || advising.probationTier === undefined ? '' : advising.probationTier,
                advising.finalProbation ? 'Yes' : '',
                openRetakes.map(r => r.courseId).join('; '),
                (advising.prereqIssues || []).map(p => `${p.courseId} needs ${p.missing.map(m => m.courseId).join('/')}`).join('; '),
                (advising.labWithoutTheory || []).map(l => `${l.labCourseId} needs ${l.theoryCourseId}`).join('; '),
                (advising.theoryDayConflicts || []).map(c => `${c.day}: ${c.courses.map(x => x.courseId).join('/')}`).join('; '),
                info.paymentNotice ? 'Yes' : '',
                flags.regOk === null ? '' : (flags.regOk ? 'OK' : 'Not OK'),
                flags.preRegOk === null ? '' : (flags.preRegOk ? 'OK' : 'Not OK'),
                flags.payDate || '',
            ]);
        }
        return rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    }

    function showOutput(title, text) {
        document.getElementById('comm-output-title').textContent = title;
        document.getElementById('comm-output-text').value = text;
        document.getElementById('comm-output').style.display = '';
        document.getElementById('comm-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ── Email modal: copy address(es)/message, or hand off to Gmail compose ─
    function flashCopied(feedbackId) {
        const el = document.getElementById(feedbackId);
        if (!el) return;
        el.classList.add('show');
        clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(() => el.classList.remove('show'), 1500);
    }

    function copyText(text) {
        navigator.clipboard.writeText(text).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        });
    }

    let currentEmail = null;

    // `bulk: true` sends recipients as Bcc instead of To when prefilling
    // Gmail — a multi-student email put in To would expose every
    // recipient's address to every other recipient.
    function openEmailModal({ title, to, subject, body, bulk }) {
        currentEmail = { to, subject: subject || 'Advising Status Update', body, bulk: !!bulk };
        document.getElementById('email-modal-title').textContent = title;
        document.getElementById('email-modal-to').value = to;
        document.getElementById('email-modal-body').value = body;
        document.getElementById('email-modal-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeEmailModal() {
        document.getElementById('email-modal-overlay').classList.remove('open');
        document.body.style.overflow = '';
    }

    document.getElementById('email-modal-close').addEventListener('click', closeEmailModal);
    document.getElementById('email-modal-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('email-modal-overlay')) closeEmailModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('email-modal-overlay').classList.contains('open')) closeEmailModal();
    });

    document.getElementById('email-copy-to').addEventListener('click', () => {
        if (!currentEmail) return;
        copyText(currentEmail.to);
        flashCopied('email-copy-to-feedback');
    });
    document.getElementById('email-copy-body').addEventListener('click', () => {
        if (!currentEmail) return;
        copyText(currentEmail.body);
        flashCopied('email-copy-body-feedback');
    });
    const gmailIdxInput = document.getElementById('gmail-account-idx');
    gmailIdxInput.value = localStorage.getItem('ulab-gmail-account-idx') || '0';
    gmailIdxInput.addEventListener('change', () => {
        const idx = Math.max(0, parseInt(gmailIdxInput.value, 10) || 0);
        gmailIdxInput.value = idx;
        localStorage.setItem('ulab-gmail-account-idx', String(idx));
    });

    document.getElementById('email-open-gmail').addEventListener('click', () => {
        if (!currentEmail) return;
        const idx = Math.max(0, parseInt(gmailIdxInput.value, 10) || 0);
        const params = new URLSearchParams({ view: 'cm', fs: '1', su: currentEmail.subject, body: currentEmail.body });
        params.set(currentEmail.bulk ? 'bcc' : 'to', currentEmail.to);
        window.open(`https://mail.google.com/mail/u/${idx}/?${params.toString()}`, '_blank');
    });

    // Both bulk actions below target whichever students currently pass the
    // search box + "Filter by issue" panel (see applyFilters) — so checking
    // e.g. "⛔ Prerequisite issues" and hitting "Generate Bulk Email" sends
    // only to that subset, instead of always the full roster. Uses the
    // rendered cards' visibility rather than re-deriving the filter logic,
    // so the two stay in sync automatically.
    function getVisibleStudents() {
        const visibleIds = new Set(
            Array.from(document.querySelectorAll('.stu-card'))
                .filter(c => c.style.display !== 'none')
                .map(c => c.dataset.sid)
        );
        return students.filter(s => visibleIds.has(s.id));
    }

    document.getElementById('btn-bulk-email').addEventListener('click', () => {
        const recipients = getVisibleStudents();
        const emails = recipients
            .map(s => (details[s.id] && details[s.id].urmsEmail) || s.email)
            .filter(Boolean);
        const filtered = recipients.length !== students.length;
        openEmailModal({
            title: `Bulk Advising Email — ${recipients.length} Student${recipients.length === 1 ? '' : 's'}${filtered ? ' (filtered)' : ''}`,
            to: emails.join(', '),
            subject: 'Advising Status Update',
            body: buildBulkEmailText(recipients),
            bulk: true,
        });
    });

    document.getElementById('btn-copy-emails').addEventListener('click', () => {
        const recipients = getVisibleStudents();
        const emails = recipients
            .map(s => (details[s.id] && details[s.id].urmsEmail) || s.email)
            .filter(Boolean);
        const filtered = recipients.length !== students.length;
        showOutput(`Advisee Emails (${emails.length})${filtered ? ' — filtered' : ''}`, emails.join(', '));
    });

    document.getElementById('btn-export-csv').addEventListener('click', () => {
        const csv = buildCSV();
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'advising-report.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    });

    document.getElementById('btn-copy-output').addEventListener('click', () => {
        const textarea = document.getElementById('comm-output-text');
        textarea.select();
        navigator.clipboard.writeText(textarea.value).catch(() => document.execCommand('copy'));
    });

    document.getElementById('btn-close-output').addEventListener('click', () => {
        document.getElementById('comm-output').style.display = 'none';
    });

    // ── Filter-by-issue dropdown ──────────────────────────────────────────
    // Replaces the old single "hide clean students" checkbox: any number of
    // issue categories can be selected at once (OR — a card shows if it
    // matches ANY checked category); with nothing checked, everyone shows,
    // same as the old unchecked default.
    const filterChecks = Array.from(document.querySelectorAll('.filter-check'));
    const filterBtn = document.getElementById('filter-btn');
    const filterPanel = document.getElementById('filter-panel');
    const filterCountEl = document.getElementById('filter-count');

    function applyFilters() {
        const q = document.getElementById('search').value.toLowerCase();
        const selected = filterChecks.filter(cb => cb.checked).map(cb => cb.dataset.key);

        filterCountEl.style.display = selected.length ? '' : 'none';
        filterCountEl.textContent = selected.length;

        document.querySelectorAll('.stu-card').forEach(c => {
            const matchesSearch = !q || c.dataset.sid.includes(q) || c.dataset.name.includes(q);
            const cardIssues = (c.dataset.issues || '').split(' ');
            const matchesFilter = !selected.length || selected.some(key => cardIssues.includes(key));
            c.style.display = matchesSearch && matchesFilter ? '' : 'none';
        });
    }

    document.getElementById('search').addEventListener('input', applyFilters);
    filterChecks.forEach(cb => cb.addEventListener('change', applyFilters));

    filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        filterPanel.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (!filterPanel.contains(e.target) && e.target !== filterBtn) filterPanel.classList.remove('open');
    });
    document.getElementById('filter-clear').addEventListener('click', () => {
        filterChecks.forEach(cb => { cb.checked = false; });
        applyFilters();
    });

    // ── Theme toggle ─────────────────────────────────────────────
    const htmlEl = document.documentElement;
    const lbl = document.getElementById('toggle-label');
    const saved = localStorage.getItem('ulab-theme') || 'light';
    applyTheme(saved);
    document.getElementById('theme-toggle').addEventListener('click', () => {
        applyTheme(htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
    function applyTheme(t) {
        htmlEl.setAttribute('data-theme', t);
        localStorage.setItem('ulab-theme', t);
        lbl.textContent = t === 'dark' ? 'Light mode' : 'Dark mode';
    }
});
