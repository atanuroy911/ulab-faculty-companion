// features/advising/student-page-content.js — content script injected into
// the live URMS StudentRegistration page. Adds a floating "Run Advising"
// button that analyzes the student currently loaded on screen (using
// the exact same scraping/analysis logic as the side-panel Advising feature,
// via window.ULAB_ADVISING_CORE — see features/advising/advising.js) and
// shows the result in a popup modal, without any extra network request:
// the page already has that student's data rendered when a staff member
// clicks "Load", so this just reads the live DOM directly.
(function () {
    const BTN_ID = 'ulab-floating-advising-btn';
    const MODAL_ID = 'ulab-floating-advising-modal';

    // Program label on this page (e.g. "Bachelor of Science in Computer
    // Science and Engineering", or sometimes just a short code) → the
    // catalogue id used by window.ULAB_CATALOGUES / window.ULAB_PROGRAMS.
    function resolveProgramId(programText) {
        const t = (programText || '').toLowerCase();
        if (/\bcse\b/.test(t) || /computer science/.test(t)) return 'CSE';
        if (/\bbba\b/.test(t) || /business administration/.test(t)) return 'BBA';
        if (/\bmsj\b/.test(t) || /media studies|journalism/.test(t)) return 'MSJ';
        if (/\beee\b/.test(t) || /electrical/.test(t)) return 'EEE';
        if (/\bbangla\b/.test(t)) return 'BANGLA';
        if (/english/.test(t)) return 'ENGLISH';
        return null;
    }

    function injectStyles() {
        if (document.getElementById('ulab-floating-advising-css')) return;
        const style = document.createElement('style');
        style.id = 'ulab-floating-advising-css';
        style.textContent = `
            #${BTN_ID} {
                position: fixed; right: 24px; bottom: 24px; z-index: 999999;
                background: #0ea5e9; color: #fff; border: none; border-radius: 999px;
                padding: 12px 18px; font: 600 14px/1 system-ui, sans-serif; cursor: pointer;
                box-shadow: 0 4px 16px rgba(0,0,0,.25); display: flex; align-items: center; gap: 8px;
            }
            #${BTN_ID}:hover { background: #0284c7; }
            #${BTN_ID}[disabled] { background: #94a3b8; cursor: not-allowed; }
            /* Full-page modal: fills the viewport with a small gutter on
               desktop/tablet and goes edge-to-edge on phone, instead of the
               old fixed 720px box — there's now enough content (student
               info, degree progress, full schedule) that a small centered
               card would mean constant internal scrolling. */
            #${MODAL_ID}-overlay {
                display: none; position: fixed; inset: 0; z-index: 1000000;
                background: rgba(15,23,42,.55); align-items: center; justify-content: center;
                padding: 28px;
            }
            #${MODAL_ID}-overlay.open { display: flex; }
            #${MODAL_ID} {
                background: #fff; color: #0f172a; width: 100%; height: 100%; max-width: 1080px;
                overflow-y: auto; -webkit-overflow-scrolling: touch;
                border-radius: 14px; padding: 22px 28px 32px; font: 14px/1.5 system-ui, sans-serif;
                box-shadow: 0 20px 60px rgba(0,0,0,.4); position: relative;
            }
            #${MODAL_ID} h2 { margin: 0 0 4px; font-size: 18px; padding-right: 90px; }
            #${MODAL_ID} .ulab-fa-sub { color: #64748b; font-size: 12px; margin-bottom: 16px; }
            #${MODAL_ID} .ulab-fa-close {
                position: absolute; top: 18px; right: 20px;
                background: none; border: none; font-size: 22px; cursor: pointer; color: #64748b;
                line-height: 1; padding: 4px;
            }
            #${MODAL_ID} .ulab-fa-grid {
                display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 10px 20px; margin-bottom: 4px;
            }
            #${MODAL_ID} .ulab-fa-grid dt { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #94a3b8; }
            #${MODAL_ID} .ulab-fa-grid dd { margin: 2px 0 0; font-size: 13.5px; font-weight: 600; color: #1e293b; }
            #${MODAL_ID} .ulab-fa-progress-bar {
                position: relative; height: 6px; border-radius: 999px; background: #e2e8f0; overflow: hidden; margin-top: 4px;
            }
            #${MODAL_ID} .ulab-fa-progress-bar > span {
                position: absolute; inset: 0 auto 0 0; background: #0ea5e9; border-radius: 999px;
            }
            #${MODAL_ID} .ulab-fa-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 6px; }
            #${MODAL_ID} .ulab-fa-table-wrap table { min-width: 480px; }

            /* Cards — issues found are the main focus, so they get a bold
               left-accent + tint keyed to severity; the info cards below
               (overview/schedule/degree progress) stay neutral. */
            #${MODAL_ID} .ulab-fa-card {
                background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
                padding: 14px 16px; margin-bottom: 14px;
            }
            #${MODAL_ID} .ulab-fa-card-title {
                font-weight: 700; font-size: 13.5px; margin-bottom: 8px; color: #1e293b;
                display: flex; align-items: center; gap: 6px;
            }
            #${MODAL_ID} .ulab-fa-card table { margin-bottom: 0; }
            #${MODAL_ID} .ulab-fa-card .ulab-fa-table-wrap:last-child { margin-bottom: 0; }
            #${MODAL_ID} .ulab-fa-card.issue { background: #fef2f2; border-color: #fecaca; border-left: 4px solid #ef4444; }
            #${MODAL_ID} .ulab-fa-card.warn { background: #fffbeb; border-color: #fde68a; border-left: 4px solid #f59e0b; }
            #${MODAL_ID} .ulab-fa-card.ok { background: #f0fdf4; border-color: #bbf7d0; border-left: 4px solid #22c55e; }
            #${MODAL_ID} .ulab-fa-issues-heading {
                font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
                color: #94a3b8; margin: 4px 0 8px;
            }

            /* Tabs — one panel visible at a time so the modal isn't a wall
               of stacked cards; Issues is the default/main focus. */
            #${MODAL_ID} .ulab-fa-tabs {
                display: flex; gap: 6px; flex-wrap: wrap; margin: 2px 0 16px;
                border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;
            }
            #${MODAL_ID} .ulab-fa-tab {
                background: #f1f5f9; border: 1px solid transparent; color: #475569;
                border-radius: 999px; padding: 6px 14px; font: 600 12.5px system-ui, sans-serif;
                cursor: pointer; display: flex; align-items: center; gap: 6px;
                transition: background .12s ease, color .12s ease;
            }
            #${MODAL_ID} .ulab-fa-tab:hover { background: #e2e8f0; }
            #${MODAL_ID} .ulab-fa-tab.active { background: #0ea5e9; color: #fff; }
            #${MODAL_ID} .ulab-fa-tab .ulab-fa-tab-count {
                background: rgba(0,0,0,.12); border-radius: 999px; padding: 0 6px; font-size: 11px;
            }
            #${MODAL_ID} .ulab-fa-tab.active .ulab-fa-tab-count { background: rgba(255,255,255,.25); }
            #${MODAL_ID} .ulab-fa-panel[hidden] { display: none; }

            /* Weekly calendar view of the schedule */
            #${MODAL_ID} .ulab-fa-cal-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
            #${MODAL_ID} .ulab-fa-cal {
                display: grid; grid-template-columns: 46px repeat(7, minmax(90px, 1fr));
                min-width: 680px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;
            }
            #${MODAL_ID} .ulab-fa-cal-head {
                background: #f8fafc; font: 700 11px system-ui, sans-serif; color: #64748b;
                text-align: center; padding: 6px 2px; border-bottom: 1px solid #e2e8f0; border-left: 1px solid #eef2f6;
            }
            #${MODAL_ID} .ulab-fa-cal-head:first-child { border-left: none; }
            #${MODAL_ID} .ulab-fa-cal-axis {
                position: relative; border-left: none; background: #fff;
            }
            #${MODAL_ID} .ulab-fa-cal-axis span {
                position: absolute; right: 4px; transform: translateY(-50%);
                font-size: 9.5px; color: #94a3b8;
            }
            #${MODAL_ID} .ulab-fa-cal-col {
                position: relative; border-left: 1px solid #eef2f6; background:
                    repeating-linear-gradient(#fff, #fff 59px, #f8fafc 60px, #f8fafc 60px);
            }
            #${MODAL_ID} .ulab-fa-cal-block {
                position: absolute; left: 2px; right: 2px; border-radius: 5px;
                padding: 2px 5px; font-size: 10px; line-height: 1.25; color: #fff; overflow: hidden;
                box-shadow: 0 1px 2px rgba(0,0,0,.15);
            }
            #${MODAL_ID} .ulab-fa-cal-block b { display: block; font-size: 10.5px; }
            #${MODAL_ID} .ulab-fa-cal-block .ulab-fa-cal-title {
                display: block; font-size: 9.5px; opacity: .9; white-space: nowrap;
                overflow: hidden; text-overflow: ellipsis;
            }
            #${MODAL_ID} .ulab-fa-cal-block .ulab-fa-cal-time { display: block; font-size: 9px; opacity: .85; }
            #${MODAL_ID} .ulab-fa-banner {
                background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 8px;
                padding: 10px 12px; margin-bottom: 10px; font-size: 13px;
            }
            #${MODAL_ID} .ulab-fa-banner.warn { background: #fffbeb; border-color: #fde68a; color: #92400e; }
            #${MODAL_ID} .ulab-fa-banner.info { background: #eff6ff; border-color: #bfdbfe; color: #1e40af; }
            #${MODAL_ID} table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 6px; }
            #${MODAL_ID} th, #${MODAL_ID} td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
            #${MODAL_ID} .ulab-fa-ok { color: #15803d; }
            #${MODAL_ID} .ulab-fa-note { color: #64748b; font-size: 12px; margin-bottom: 8px; }
            #${MODAL_ID} .ulab-fa-email-btn {
                float: right; margin-right: 32px; background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155;
                border-radius: 8px; padding: 5px 12px; font: 600 12px system-ui, sans-serif; cursor: pointer;
            }
            #${MODAL_ID} .ulab-fa-email-btn:hover { background: #e2e8f0; }
            #${MODAL_ID} .ulab-fa-back {
                background: none; border: none; color: #0ea5e9; font: 600 13px system-ui, sans-serif;
                cursor: pointer; padding: 0 0 10px; display: block;
            }
            #${MODAL_ID} label.ulab-fa-field-label { display: block; font-size: 12px; font-weight: 600; color: #334155; margin: 10px 0 4px; }
            #${MODAL_ID} input.ulab-fa-input, #${MODAL_ID} textarea.ulab-fa-textarea {
                width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px;
                font: 13px/1.4 system-ui, sans-serif; color: #0f172a;
            }
            #${MODAL_ID} textarea.ulab-fa-textarea { height: 260px; resize: vertical; }
            #${MODAL_ID} .ulab-fa-email-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
            #${MODAL_ID} .ulab-fa-email-actions button, #${MODAL_ID} .ulab-fa-email-actions a {
                background: #0ea5e9; color: #fff; border: none; border-radius: 8px; padding: 7px 14px;
                font: 600 12.5px system-ui, sans-serif; cursor: pointer; text-decoration: none;
            }
            #${MODAL_ID} .ulab-fa-email-actions .secondary { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }

            @media (max-width: 991.98px) {
                #${MODAL_ID}-overlay { padding: 0; }
                #${MODAL_ID} { max-width: none; height: 100%; border-radius: 0; padding: 18px 18px 28px; }
                #${MODAL_ID} .ulab-fa-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
            }
            @media (max-width: 575.98px) {
                #${MODAL_ID} { padding: 16px 14px 24px; }
                #${MODAL_ID} h2 { font-size: 16px; padding-right: 70px; }
                #${MODAL_ID} .ulab-fa-email-btn { padding: 5px 9px; font-size: 11px; }
                #${MODAL_ID} .ulab-fa-grid { grid-template-columns: 1fr 1fr; gap: 8px 14px; }
                #${MODAL_ID} table { font-size: 11.5px; }
                #${MODAL_ID} th, #${MODAL_ID} td { padding: 4px 6px; }
                #${MODAL_ID} .ulab-fa-tabs { gap: 5px; padding-bottom: 8px; }
                #${MODAL_ID} .ulab-fa-tab { padding: 5px 10px; font-size: 11.5px; }
            }
        `;
        document.head.appendChild(style);
    }

    function ensureButton() {
        if (document.getElementById(BTN_ID)) return;
        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.innerHTML = `🎓 Run Advising`;
        btn.addEventListener('click', runAdvisingForCurrentStudent);
        document.body.appendChild(btn);
    }

    function ensureModalShell() {
        if (document.getElementById(`${MODAL_ID}-overlay`)) return;
        const overlay = document.createElement('div');
        overlay.id = `${MODAL_ID}-overlay`;
        overlay.innerHTML = `<div id="${MODAL_ID}"></div>`;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
        document.body.appendChild(overlay);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });
    }

    let currentInfo = null;
    let currentAdvising = null;
    let currentProgramId = null;

    function openModal(html) {
        ensureModalShell();
        const modal = document.getElementById(MODAL_ID);
        modal.innerHTML = html;
        modal.querySelectorAll('[data-action]').forEach(el => {
            el.addEventListener('click', handleModalAction);
        });
        modal.querySelectorAll('[data-tab]').forEach(el => {
            el.addEventListener('click', () => switchTab(modal, el.dataset.tab));
        });
        modal.scrollTop = 0;
        document.getElementById(`${MODAL_ID}-overlay`).classList.add('open');
    }

    // One panel visible at a time so the result isn't a wall of stacked
    // cards — keeps the modal calm/scannable instead of a long scroll.
    function switchTab(modal, tabId) {
        modal.querySelectorAll('.ulab-fa-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tabId));
        modal.querySelectorAll('.ulab-fa-panel').forEach(el => { el.hidden = el.dataset.panel !== tabId; });
    }

    function handleModalAction(e) {
        const action = e.currentTarget.dataset.action;
        if (action === 'email') {
            openModal(renderEmailView(currentInfo, currentAdvising));
        } else if (action === 'back') {
            openModal(renderResult(currentInfo, currentAdvising, currentProgramId));
        } else if (action === 'copy-to') {
            copyText(document.getElementById('ulab-fa-email-to').value);
        } else if (action === 'copy-body') {
            copyText(document.getElementById('ulab-fa-email-body').value);
        } else if (action === 'close') {
            closeModal();
        } else if (action === 'pdf') {
            const cat = currentProgramId ? (window.ULAB_CATALOGUES || {})[currentProgramId] : null;
            const s = { id: currentStudentId(), name: currentInfo.urmsName };
            const html = window.ULAB_ADVISING_REPORT.buildReportHTML(
                [{ s, info: currentInfo, advising: currentAdvising, cat, programLabel: currentProgramId }],
                { title: `Advising Report — ${currentInfo.urmsName || 'Student'}` }
            );
            window.ULAB_ADVISING_REPORT.openPrintableReport(html);
        }
    }

    function closeModal() {
        const overlay = document.getElementById(`${MODAL_ID}-overlay`);
        if (overlay) overlay.classList.remove('open');
    }

    function probationLabel(tier) {
        if (tier === null || tier === undefined) return '';
        return tier === 'unspecified' ? 'Probation (tier unspecified)' : `Probation — Tier ${tier}`;
    }

    // Same disclaimer/note text as features/advising-billing/results.js's bulk
    // Advising email builder, kept in sync manually (this content script has
    // no access to that page's closures).
    const DISCLAIMER = 'This is an automated advising check generated from your URMS record. Please verify the details with your advisor before making any registration decisions. Credit totals and category breakdowns above are estimated from your course history and the department catalogue — always confirm your remaining requirements against the official major completion guidelines / course catalogue on the ULAB website (ulab.edu.bd) before finalizing your registration plan.';
    const THEORY_DAY_NOTE = 'Note: Please avoid selecting 3 theory courses on the same day of the week — their final exams will then also fall on that same day, which is not recommended. Section changes are only permitted to resolve a 3-theory-in-one-day conflict if it arises by chance during pre-registration, registration, or add/drop; section changes are not approved for any other reason.';

    function currentStudentId() {
        const el = document.querySelector('input[name="GenaratedCourseList.StudentId"]');
        return el ? el.value.trim() : '';
    }

    // Same computation as features/advising-billing/results.js's
    // creditsSummaryLine, kept in sync manually (this content script has no
    // access to that page's closures).
    function creditsSummaryLine(advising) {
        const cat = currentProgramId ? (window.ULAB_CATALOGUES || {})[currentProgramId] : null;
        if (!advising || !advising.degreeProgress || !cat || !cat.degreeRequirements) return null;
        const total = cat.degreeRequirements.total;
        if (!total) return null;
        const earned = advising.degreeProgress.progress.reduce((sum, p) => sum + p.earnedCredits, 0);
        const inProgress = advising.degreeProgress.progress.reduce((sum, p) => sum + p.inProgressCredits, 0);
        const remaining = Math.max(0, total - earned - inProgress);
        return `🎓 Credits toward graduation: ${earned} earned${inProgress ? ` + ${inProgress} in progress` : ''} of ${total} required (${remaining} remaining).`;
    }

    function buildStudentEmailText(info, advising) {
        const name = info.urmsName || 'Student';
        const sid = currentStudentId();
        const lines = [];
        lines.push(`Dear ${name},`);
        lines.push('');
        lines.push(`Please find your advising status below${sid ? ` (Student ID: ${sid})` : ''}.`);
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

        if (!info.registrationNotice && !info.paymentNotice && !openRetakes.length && !(advising.prereqIssues || []).length
            && !(advising.labWithoutTheory || []).length && !(advising.theoryDayConflicts || []).length
            && advising.probationTier === null) {
            lines.push('No issues found — you are clear to proceed with registration as planned.');
            lines.push('');
        }

        const creditsLine = creditsSummaryLine(advising);
        if (creditsLine) {
            lines.push(creditsLine);
            lines.push('');
        }

        lines.push(THEORY_DAY_NOTE);
        lines.push('');
        lines.push(DISCLAIMER);
        lines.push('');
        lines.push('Regards,');
        lines.push('Your Advisor');
        return lines.join('\n');
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

    function renderEmailView(info, advising) {
        const name = info.urmsName || 'Student';
        const to = info.urmsEmail || '';
        const body = buildStudentEmailText(info, advising);
        return `<button class="ulab-fa-close" data-action="close" title="Close">✕</button>
            <button class="ulab-fa-back" data-action="back">← Back to result</button>
            <h2>✉️ Advising Email — ${name}</h2>
            <div class="ulab-fa-sub">Review before sending.</div>
            <label class="ulab-fa-field-label">To</label>
            <input class="ulab-fa-input" id="ulab-fa-email-to" value="${to.replace(/"/g, '&quot;')}" />
            <label class="ulab-fa-field-label">Body</label>
            <textarea class="ulab-fa-textarea" id="ulab-fa-email-body">${body.replace(/</g, '&lt;')}</textarea>
            <div class="ulab-fa-email-actions">
                <button class="secondary" data-action="copy-to">📋 Copy Address</button>
                <button class="secondary" data-action="copy-body">📋 Copy Message</button>
                <a href="https://mail.google.com/mail/?view=cm&fs=1" target="_blank" rel="noopener">📧 Open Gmail</a>
            </div>`;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    function card(titleHtml, bodyHtml, variant) {
        return `<div class="ulab-fa-card${variant ? ' ' + variant : ''}">
            ${titleHtml ? `<div class="ulab-fa-card-title">${titleHtml}</div>` : ''}
            ${bodyHtml}
        </div>`;
    }

    // Overview grid: URMS-scraped fields (name/mobile/email/advisor/program)
    // plus anything else the "Student Information" card on the page shows
    // (CGPA, batch, etc. — varies by program) that isn't already covered.
    function renderStudentInfoSection(info) {
        const known = new Set(['Name', 'Mobile', 'Email', 'Advisor', 'Program']);
        const rows = [
            ['Student ID', currentStudentId()],
            ['Name', info.urmsName],
            ['Mobile', info.mobile],
            ['Email', info.urmsEmail],
            ['Advisor', info.advisor],
            ['Program', info.program],
        ];
        for (const [k, v] of Object.entries(info.studentInfo || {})) {
            if (!known.has(k)) rows.push([k, v]);
        }
        const body = `<dl class="ulab-fa-grid">
                ${rows.filter(([, v]) => v).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
            </dl>`;
        return card('👤 Student Overview', body);
    }

    // "Class schedule properly" — the actual course/section/time table the
    // student is registering for, previously only summarized in the email
    // text, never shown in the modal itself.
    function renderScheduleSection(info) {
        const rows = info.coursesToRegister || [];
        if (!rows.length) return '';
        const body = `<div class="ulab-fa-table-wrap">
            <table><thead><tr><th>Course</th><th>Title</th><th>Sec</th><th>Schedule</th></tr></thead><tbody>
            ${rows.map(r => `<tr><td>${esc(r.courseId)}</td><td>${esc(r.title)}</td><td>${esc(r.section)}</td><td>${esc(r.schedule)}</td></tr>`).join('')}
            </tbody></table>
            </div>`;
        return card(`🗓️ Class Schedule (${rows.length} course${rows.length === 1 ? '' : 's'})`, body);
    }

    const CAL_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const CAL_COLORS = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#6366f1', '#ef4444', '#14b8a6'];
    function colorForCourse(courseId) {
        let h = 0;
        for (let i = 0; i < courseId.length; i++) h = (h * 31 + courseId.charCodeAt(i)) >>> 0;
        return CAL_COLORS[h % CAL_COLORS.length];
    }
    function fmtHour(mins) {
        let h = Math.floor(mins / 60), m = mins % 60;
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12; if (h === 0) h = 12;
        return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, '0')}${ampm}`;
    }
    function fmtClock(mins) {
        let h = Math.floor(mins / 60), m = mins % 60;
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12; if (h === 0) h = 12;
        return `${h}:${String(m).padStart(2, '0')}${ampm}`;
    }

    // Weekly calendar view — same course/section data as the table above,
    // just laid out the way a student actually thinks about their week.
    // Uses window.ulabParseSchedule (features/time/time.js, loaded in the
    // same bundle) to turn "THU PD203 10:50AM-12:10PM TBA" style strings
    // into {day, start, end} minute intervals.
    function renderScheduleCalendar(info) {
        const rows = info.coursesToRegister || [];
        if (!rows.length || !window.ulabParseSchedule) return '';

        const blocks = [];
        for (const r of rows) {
            const intervals = window.ulabParseSchedule(r.schedule || '');
            for (const iv of intervals) blocks.push({ ...iv, courseId: r.courseId, title: r.title });
        }
        if (!blocks.length) return '';

        let minStart = Math.min(...blocks.map(b => b.start));
        let maxEnd = Math.max(...blocks.map(b => b.end));
        minStart = Math.max(0, Math.floor(minStart / 60) * 60 - 30);
        maxEnd = Math.min(24 * 60, Math.ceil(maxEnd / 60) * 60 + 30);
        const totalMin = maxEnd - minStart;

        // Always show the full week (not just days with a class) so the
        // grid's column count stays fixed and matches the CSS template.
        const days = CAL_DAYS;

        const hourLines = [];
        for (let t = Math.ceil(minStart / 60) * 60; t <= maxEnd; t += 60) {
            hourLines.push(`<span style="top:${((t - minStart) / totalMin) * 100}%">${fmtHour(t)}</span>`);
        }

        const dayCols = days.map(day => {
            const dayBlocks = blocks.filter(b => b.day === day);
            const chips = dayBlocks.map(b => {
                const top = ((b.start - minStart) / totalMin) * 100;
                const height = Math.max(((b.end - b.start) / totalMin) * 100, 4);
                return `<div class="ulab-fa-cal-block" style="top:${top}%;height:${height}%;background:${colorForCourse(b.courseId)}"
                    title="${esc(b.courseId)} — ${esc(b.title)} (${fmtClock(b.start)}–${fmtClock(b.end)})">
                    <b>${esc(b.courseId)}</b><span class="ulab-fa-cal-title">${esc(b.title)}</span><span class="ulab-fa-cal-time">${fmtClock(b.start)}–${fmtClock(b.end)}</span>
                </div>`;
            }).join('');
            return `<div class="ulab-fa-cal-col" style="height:${Math.max(totalMin, 480)}px">${chips}</div>`;
        }).join('');

        const body = `<div class="ulab-fa-cal-wrap">
            <div class="ulab-fa-cal">
                <div class="ulab-fa-cal-head"></div>
                ${days.map(d => `<div class="ulab-fa-cal-head">${d}</div>`).join('')}
                <div class="ulab-fa-cal-axis" style="height:${Math.max(totalMin, 480)}px">${hourLines.join('')}</div>
                ${dayCols}
            </div>
        </div>`;
        return card('📆 Weekly Schedule', body);
    }

    // "Things required to complete the grade/degree" — per-category credit
    // requirements vs. what's earned/in-progress, from computeDegreeProgress.
    function renderDegreeProgressSection(advising) {
        const progress = advising.degreeProgress && advising.degreeProgress.progress;
        if (!progress || !progress.length) return '';
        const body = `<div class="ulab-fa-table-wrap">
            <table><thead><tr><th>Category</th><th>Required</th><th>Earned</th><th>In Progress</th><th>Remaining</th></tr></thead><tbody>
            ${progress.map(p => {
                const pct = p.required ? Math.min(100, Math.round(((p.earnedCredits + p.inProgressCredits) / p.required) * 100)) : 0;
                return `<tr>
                    <td>${esc(p.label || p.category)}<div class="ulab-fa-progress-bar"><span style="width:${pct}%"></span></div></td>
                    <td>${p.required}</td>
                    <td>${p.earnedCredits}</td>
                    <td>${p.inProgressCredits || ''}</td>
                    <td>${p.shortBy > 0 ? p.shortBy : '<span class="ulab-fa-ok">✓ complete</span>'}</td>
                </tr>`;
            }).join('')}
            </tbody></table>
            </div>`;
        return card('🎯 Degree Requirements Progress', body);
    }

    // Each issue-finding is its own card with severity-keyed accent color —
    // these are the main thing a staff member is looking for, so they lead
    // the modal, right after the top banners.
    function renderIssueCards(info, advising) {
        let html = '';

        const openRetakes = (advising.needsRetake || []).filter(r => !r.retakingNow);
        if (openRetakes.length) {
            const body = `<div class="ulab-fa-table-wrap">
                <table><thead><tr><th>Course</th><th>Title</th><th>Attempts</th></tr></thead><tbody>
                ${openRetakes.map(r => `<tr><td>${esc(r.courseId)}</td><td>${esc(r.title)}</td><td>${esc(r.attempts.join(', '))}</td></tr>`).join('')}
                </tbody></table></div>`;
            html += card('↻ Courses to retake', body, 'issue');
        }

        if ((advising.prereqIssues || []).length) {
            const body = `<div class="ulab-fa-table-wrap">
                <table><thead><tr><th>Added Course</th><th>Missing Prerequisite(s)</th></tr></thead><tbody>
                ${advising.prereqIssues.map(p => `<tr><td>${esc(p.courseId)} — ${esc(p.title)}</td><td>${esc(p.missing.map(m => `${m.courseId} (${m.title})`).join(', '))}</td></tr>`).join('')}
                </tbody></table></div>`;
            html += card('⛔ Prerequisite issues', body, 'issue');
        }

        if ((advising.labWithoutTheory || []).length) {
            const body = `<div class="ulab-fa-table-wrap">
                <table><thead><tr><th>Lab</th><th>Missing Theory</th></tr></thead><tbody>
                ${advising.labWithoutTheory.map(l => `<tr><td>${esc(l.labCourseId)} — ${esc(l.labTitle)}</td><td>${esc(l.theoryCourseId)} (${esc(l.theoryTitle)})</td></tr>`).join('')}
                </tbody></table></div>`;
            html += card('🧪 Lab registered without theory', body, 'warn');
        }

        if ((advising.theoryDayConflicts || []).length) {
            const body = `<div class="ulab-fa-table-wrap">
                <table><thead><tr><th>Day</th><th>Theory Courses</th></tr></thead><tbody>
                ${advising.theoryDayConflicts.map(c => `<tr><td>${esc(c.day)}</td><td>${esc(c.courses.map(x => `${x.courseId} (${x.title})`).join(', '))}</td></tr>`).join('')}
                </tbody></table></div>
                <div class="ulab-fa-note">Not recommended — all 3 finals would fall on this day too. Section change is only permitted to resolve this specific conflict since it arose during pre-registration/registration/add-drop.</div>`;
            html += card('📅 3+ theory courses on the same day', body, 'warn');
        }

        if (!info.registrationNotice && !info.paymentNotice && !info.probation && !advising.finalProbation && !openRetakes.length
            && !(advising.prereqIssues || []).length && !(advising.labWithoutTheory || []).length
            && !(advising.theoryDayConflicts || []).length) {
            html += card(null, '<div class="ulab-fa-note ulab-fa-ok" style="margin:0">✓ No issues found.</div>', 'ok');
        }

        return html;
    }

    function countIssues(advising) {
        return (advising.needsRetake || []).filter(r => !r.retakingNow).length
            + (advising.prereqIssues || []).length
            + (advising.labWithoutTheory || []).length
            + (advising.theoryDayConflicts || []).length
            + (advising.finalProbation ? 1 : 0);
    }

    // Tabbed layout, one panel visible at a time, instead of every card
    // stacked in one long scroll — keeps the modal calm to look at. Issues
    // is the default tab since that's the main thing being checked for;
    // the urgent banners (registration/payment/probation) stay visible
    // above the tabs regardless of which panel is open.
    function renderResult(info, advising, programId) {
        const name = info.urmsName || 'Student';
        let html = `<button class="ulab-fa-close" data-action="close" title="Close">✕</button>
            <button class="ulab-fa-email-btn" data-action="email">✉️ Email</button>
            <button class="ulab-fa-email-btn" data-action="pdf">📄 PDF</button>
            <h2>🎓 Advising Result — ${name}</h2>
            <div class="ulab-fa-sub">Program: ${programId || info.program || 'Unknown'} · Automated check — verify before acting.</div>`;

        if (info.registrationNotice) html += `<div class="ulab-fa-banner info">🕒 ${info.registrationNotice}</div>`;

        if (info.paymentNotice) html += `<div class="ulab-fa-banner">💳 ${info.paymentNotice}</div>`;

        if (info.probation) html += `<div class="ulab-fa-banner">⚠️ ${info.probation}</div>`;

        if (advising.finalProbation) {
            html += `<div class="ulab-fa-banner">🚫 Final Probation (Probation 3 — CGPA below 2.00 for the last three consecutive terms): this student cannot access the online registration system independently. They may only register with the assistance of the Department Head or Coordinator, by sending a request email or visiting in person.</div>`;
        }

        const issueCount = countIssues(advising);
        const scheduleCount = (info.coursesToRegister || []).length;
        const progressCount = (advising.degreeProgress && advising.degreeProgress.progress || []).length;

        html += `<div class="ulab-fa-tabs">
            <button class="ulab-fa-tab active" data-tab="issues">⚠️ Issues${issueCount ? ` <span class="ulab-fa-tab-count">${issueCount}</span>` : ''}</button>
            <button class="ulab-fa-tab" data-tab="overview">👤 Overview</button>
            <button class="ulab-fa-tab" data-tab="schedule">🗓️ Schedule${scheduleCount ? ` <span class="ulab-fa-tab-count">${scheduleCount}</span>` : ''}</button>
            <button class="ulab-fa-tab" data-tab="progress">🎯 Degree Progress${progressCount ? ` <span class="ulab-fa-tab-count">${progressCount}</span>` : ''}</button>
        </div>`;

        html += `<div class="ulab-fa-panel" data-panel="issues">${renderIssueCards(info, advising) || card(null, '<div class="ulab-fa-note ulab-fa-ok" style="margin:0">✓ No issues found.</div>', 'ok')}</div>`;
        html += `<div class="ulab-fa-panel" data-panel="overview" hidden>${renderStudentInfoSection(info)}</div>`;
        html += `<div class="ulab-fa-panel" data-panel="schedule" hidden>${renderScheduleCalendar(info)}${renderScheduleSection(info)}</div>`;
        html += `<div class="ulab-fa-panel" data-panel="progress" hidden>${renderDegreeProgressSection(advising)}</div>`;

        return html;
    }

    function runAdvisingForCurrentStudent() {
        const core = window.ULAB_ADVISING_CORE;
        if (!core) {
            alert('Advising module not loaded yet — please reload the page and try again.');
            return;
        }
        const nameEl = document.querySelector('#StudentName');
        if (!nameEl || !nameEl.textContent.trim()) {
            alert('Load a student on this page first (enter Student ID and click Load), then run Advising.');
            return;
        }

        const info = core.extractAdvisingInfo(document);
        const programId = resolveProgramId(info.program);
        const cat = programId ? (window.ULAB_CATALOGUES || {})[programId] : null;
        if (!cat) {
            alert(`Could not determine a matching course catalogue for program "${info.program || 'unknown'}". Showing what could be checked without it.`);
        }
        const advising = core.analyzeStudent(info, cat);
        currentInfo = info;
        currentAdvising = advising;
        currentProgramId = programId;
        openModal(renderResult(info, advising, programId));
    }

    injectStyles();
    ensureButton();
    // The page loads a student's data via AJAX after the "Load" button is
    // clicked, without a full navigation — re-check periodically in case the
    // button/CSS got removed by a page re-render (cheap, harmless if no-op).
    setInterval(() => { injectStyles(); ensureButton(); }, 2000);
})();
