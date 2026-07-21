// results.js — loaded inside features/advising/results.html (chrome-extension page)
chrome.storage.local.get(['ulabAdvisingStudents', 'ulabAdvisingDetails', 'ulabAdvisingProgram'], (data) => {
    if (!data.ulabAdvisingStudents) {
        document.body.innerHTML = `
            <div style="color:#94a3b8;text-align:center;margin-top:120px;font-family:system-ui">
                <div style="font-size:48px;margin-bottom:16px">📭</div>
                <div style="font-size:20px;font-weight:600;color:#e2e8f0;margin-bottom:8px">No results yet</div>
                <div>Open the <strong style="color:#38bdf8">Student Advising</strong> feature in the side panel and run a check.</div>
            </div>`;
        return;
    }

    const students = data.ulabAdvisingStudents || [];
    const details  = data.ulabAdvisingDetails  || {};
    const nStudents = students.length;
    const programId = data.ulabAdvisingProgram || 'CSE';
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

    let probationCount = 0;
    let noCoursesCount = 0;
    let retakeCount = 0;
    let prereqIssueCount = 0;
    let labIssueCount = 0;

    const list = document.getElementById('students-list');

    for (const s of students) {
        const info = details[s.id] || {};
        const flags = parseFlags(s.flags);
        const col = avatarColor(s.id);
        const ini = initials(info.urmsName || s.name);
        const displayName = info.urmsName || s.name || 'Unknown';

        const advising = info.advising || { probationTier: null, needsRetake: [], prereqIssues: [], labWithoutTheory: [], degreeProgress: null };
        if (info.probation) probationCount++;
        const hasCourses = (info.coursesToRegister || []).length > 0;
        if (!info.error && !hasCourses) noCoursesCount++;
        const openRetakes = advising.needsRetake.filter(r => !r.retakingNow);
        if (openRetakes.length) retakeCount++;
        if (advising.prereqIssues.length) prereqIssueCount++;
        if ((advising.labWithoutTheory || []).length) labIssueCount++;

        const isClean = !info.error && !info.probation && hasCourses
            && !openRetakes.length && !advising.prereqIssues.length && !(advising.labWithoutTheory || []).length;

        const card = document.createElement('div');
        card.className = 'stu-card';
        card.dataset.sid = s.id;
        card.dataset.name = displayName.toLowerCase();
        card.dataset.clean = isClean ? '1' : '0';

        const headerBadges = info.error
            ? `<span class="badge badge-bad">⚠️ Fetch failed</span>`
            : `
                ${flagBadge('Reg', flags.regOk)}
                ${flagBadge('Pre-Reg', flags.preRegOk)}
                ${info.probation ? `<span class="badge badge-warn">⚠️ ${probationLabel(advising.probationTier)}</span>` : ''}
                ${openRetakes.length ? `<span class="badge badge-bad">↻ ${openRetakes.length} course(s) to retake</span>` : ''}
                ${advising.prereqIssues.length ? `<span class="badge badge-bad">⛔ Prereq issue</span>` : ''}
                ${(advising.labWithoutTheory || []).length ? `<span class="badge badge-bad">🧪 Lab without theory</span>` : ''}
                ${!hasCourses ? `<span class="badge badge-warn">📝 No courses added</span>` : `<span class="badge badge-ok">✓ ${info.coursesToRegister.length} course(s) added</span>`}
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
            if (info.probation) {
                bodyHTML += `<div class="probation-banner">⚠️ ${info.probation}</div>`;
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
                <div class="stu-flags">${headerBadges}</div>
                ${!info.error ? `<button class="card-email-btn" data-sid="${s.id}" title="Copy this student's advising email">✉️ Email</button>` : ''}
                <svg class="chevron" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                    <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/>
                </svg>
            </div>
            <div class="stu-body"></div>
        `;
        let bodyBuilt = false;
        card.querySelector('.stu-header').addEventListener('click', (e) => {
            if (e.target.closest('.card-email-btn')) return;
            if (!bodyBuilt) {
                card.querySelector('.stu-body').innerHTML = buildBodyHTML();
                bodyBuilt = true;
            }
            card.classList.toggle('open');
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
        list.appendChild(card);
    }

    document.getElementById('stat-probation').textContent = probationCount;
    document.getElementById('stat-nocourses').textContent = noCoursesCount;
    document.getElementById('stat-retake').textContent = retakeCount;
    document.getElementById('stat-prereq').textContent = prereqIssueCount;
    document.getElementById('stat-lab').textContent = labIssueCount;

    // ── Communication tools: bulk email, per-student email, CSV, email list ─
    const DISCLAIMER = 'This is an automated advising check generated from your URMS record. Please verify the details with your advisor before making any registration decisions.';

    function buildStudentEmailText(s, info, advising, flags) {
        const name = (info && info.urmsName) || s.name || 'Student';
        const lines = [];
        lines.push(`Dear ${name},`);
        lines.push('');
        lines.push(`Please find your advising status below (Student ID: ${s.id}).`);
        lines.push('');

        if (advising.probationTier !== null && advising.probationTier !== undefined) {
            lines.push(`⚠️ PROBATION: You are currently on academic probation${advising.probationTier === 'unspecified' ? '' : ` (Tier ${advising.probationTier})`}. Please meet your advisor as soon as possible to discuss your academic plan.`);
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

        if (!openRetakes.length && !(advising.prereqIssues || []).length && !(advising.labWithoutTheory || []).length && advising.probationTier === null) {
            lines.push('No issues found — you are clear to proceed with registration as planned.');
            lines.push('');
        }

        lines.push(`Registration status: ${flags.regOk === null ? '—' : (flags.regOk ? 'OK' : 'Not OK')}`);
        lines.push(`Pre-registration status: ${flags.preRegOk === null ? '—' : (flags.preRegOk ? 'OK' : 'Not OK')}`);
        if (flags.payDate) lines.push(`Payment due: ${flags.payDate}`);
        lines.push('');
        lines.push(DISCLAIMER);
        lines.push('');
        lines.push('Regards,');
        lines.push('Your Advisor');
        return lines.join('\n');
    }

    function buildBulkEmailText() {
        const lines = [];
        lines.push('Dear Advisees,');
        lines.push('');
        lines.push('Find your advising status below. Locate the entry matching your Student ID and follow up on any action items before registration closes.');
        lines.push('');

        students.forEach((s, idx) => {
            const info = details[s.id] || {};
            const advising = info.advising || { probationTier: null, needsRetake: [], prereqIssues: [], labWithoutTheory: [] };
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
            if (!openRetakes.length && !(advising.prereqIssues || []).length && !(advising.labWithoutTheory || []).length && advising.probationTier === null) {
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
        const headers = ['Student ID', 'Name', 'Email', 'Probation Tier', 'Courses To Retake', 'Prerequisite Issues', 'Lab Without Theory', 'Registration OK', 'Pre-Reg OK', 'Payment Due'];
        const rows = [headers];
        for (const s of students) {
            const info = details[s.id] || {};
            const advising = info.advising || { probationTier: null, needsRetake: [], prereqIssues: [], labWithoutTheory: [] };
            const flags = parseFlags(s.flags);
            const openRetakes = (advising.needsRetake || []).filter(r => !r.retakingNow);
            rows.push([
                s.id,
                info.urmsName || s.name || '',
                info.urmsEmail || s.email || '',
                advising.probationTier === null || advising.probationTier === undefined ? '' : advising.probationTier,
                openRetakes.map(r => r.courseId).join('; '),
                (advising.prereqIssues || []).map(p => `${p.courseId} needs ${p.missing.map(m => m.courseId).join('/')}`).join('; '),
                (advising.labWithoutTheory || []).map(l => `${l.labCourseId} needs ${l.theoryCourseId}`).join('; '),
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

    function openEmailModal({ title, to, body }) {
        currentEmail = { to, body };
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
    document.getElementById('email-open-gmail').addEventListener('click', () => {
        window.open('https://mail.google.com/mail/?view=cm&fs=1', '_blank');
    });

    document.getElementById('btn-bulk-email').addEventListener('click', () => {
        const emails = students
            .map(s => (details[s.id] && details[s.id].urmsEmail) || s.email)
            .filter(Boolean);
        openEmailModal({
            title: `Bulk Advising Email — ${students.length} Students`,
            to: emails.join(', '),
            body: buildBulkEmailText(),
        });
    });

    document.getElementById('btn-copy-emails').addEventListener('click', () => {
        const emails = students
            .map(s => (details[s.id] && details[s.id].urmsEmail) || s.email)
            .filter(Boolean);
        showOutput(`Advisee Emails (${emails.length})`, emails.join(', '));
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

    function applyFilters() {
        const q = document.getElementById('search').value.toLowerCase();
        const hideClean = document.getElementById('hide-clean').checked;
        document.querySelectorAll('.stu-card').forEach(c => {
            const matchesSearch = !q || c.dataset.sid.includes(q) || c.dataset.name.includes(q);
            const matchesClean = !hideClean || c.dataset.clean === '0';
            c.style.display = matchesSearch && matchesClean ? '' : 'none';
        });
    }

    document.getElementById('search').addEventListener('input', applyFilters);
    document.getElementById('hide-clean').addEventListener('change', applyFilters);

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
