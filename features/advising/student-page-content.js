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
            #${MODAL_ID}-overlay {
                display: none; position: fixed; inset: 0; z-index: 1000000;
                background: rgba(15,23,42,.55); align-items: center; justify-content: center;
            }
            #${MODAL_ID}-overlay.open { display: flex; }
            #${MODAL_ID} {
                background: #fff; color: #0f172a; width: min(720px, 92vw); max-height: 85vh; overflow-y: auto;
                border-radius: 14px; padding: 22px 24px; font: 14px/1.5 system-ui, sans-serif; box-shadow: 0 20px 60px rgba(0,0,0,.4);
            }
            #${MODAL_ID} h2 { margin: 0 0 4px; font-size: 18px; }
            #${MODAL_ID} .ulab-fa-sub { color: #64748b; font-size: 12px; margin-bottom: 16px; }
            #${MODAL_ID} .ulab-fa-close {
                float: right; background: none; border: none; font-size: 20px; cursor: pointer; color: #64748b;
            }
            #${MODAL_ID} .ulab-fa-banner {
                background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 8px;
                padding: 10px 12px; margin-bottom: 10px; font-size: 13px;
            }
            #${MODAL_ID} .ulab-fa-banner.warn { background: #fffbeb; border-color: #fde68a; color: #92400e; }
            #${MODAL_ID} .ulab-fa-banner.info { background: #eff6ff; border-color: #bfdbfe; color: #1e40af; }
            #${MODAL_ID} .ulab-fa-section { font-weight: 700; margin: 14px 0 6px; font-size: 13px; color: #334155; }
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
        document.getElementById(`${MODAL_ID}-overlay`).classList.add('open');
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
    const DISCLAIMER = 'This is an automated advising check generated from your URMS record. Please verify the details with your advisor before making any registration decisions.';
    const THEORY_DAY_NOTE = 'Note: Please avoid selecting 3 theory courses on the same day of the week — their final exams will then also fall on that same day, which is not recommended. Section changes are only permitted to resolve a 3-theory-in-one-day conflict if it arises by chance during pre-registration, registration, or add/drop; section changes are not approved for any other reason.';

    function currentStudentId() {
        const el = document.querySelector('input[name="GenaratedCourseList.StudentId"]');
        return el ? el.value.trim() : '';
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

        if (!info.registrationNotice && !openRetakes.length && !(advising.prereqIssues || []).length
            && !(advising.labWithoutTheory || []).length && !(advising.theoryDayConflicts || []).length
            && advising.probationTier === null) {
            lines.push('No issues found — you are clear to proceed with registration as planned.');
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

    function renderResult(info, advising, programId) {
        const name = info.urmsName || 'Student';
        let html = `<button class="ulab-fa-close" data-action="close" title="Close">✕</button>
            <button class="ulab-fa-email-btn" data-action="email">✉️ Email</button>
            <h2>🎓 Advising Result — ${name}</h2>
            <div class="ulab-fa-sub">Program: ${programId || info.program || 'Unknown'} · Automated check — verify before acting.</div>`;

        if (info.registrationNotice) html += `<div class="ulab-fa-banner info">🕒 ${info.registrationNotice}</div>`;

        if (info.probation) html += `<div class="ulab-fa-banner">⚠️ ${info.probation}</div>`;

        if (advising.finalProbation) {
            html += `<div class="ulab-fa-banner">🚫 Final Probation (Probation 3 — CGPA below 2.00 for the last three consecutive terms): this student cannot access the online registration system independently. They may only register with the assistance of the Department Head or Coordinator, by sending a request email or visiting in person.</div>`;
        }

        const openRetakes = (advising.needsRetake || []).filter(r => !r.retakingNow);
        if (openRetakes.length) {
            html += `<div class="ulab-fa-section">↻ Courses to retake</div>
                <table><thead><tr><th>Course</th><th>Title</th><th>Attempts</th></tr></thead><tbody>
                ${openRetakes.map(r => `<tr><td>${r.courseId}</td><td>${r.title}</td><td>${r.attempts.join(', ')}</td></tr>`).join('')}
                </tbody></table>`;
        }

        if ((advising.prereqIssues || []).length) {
            html += `<div class="ulab-fa-section">⛔ Prerequisite issues</div>
                <table><thead><tr><th>Added Course</th><th>Missing Prerequisite(s)</th></tr></thead><tbody>
                ${advising.prereqIssues.map(p => `<tr><td>${p.courseId} — ${p.title}</td><td>${p.missing.map(m => `${m.courseId} (${m.title})`).join(', ')}</td></tr>`).join('')}
                </tbody></table>`;
        }

        if ((advising.labWithoutTheory || []).length) {
            html += `<div class="ulab-fa-section">🧪 Lab registered without theory</div>
                <table><thead><tr><th>Lab</th><th>Missing Theory</th></tr></thead><tbody>
                ${advising.labWithoutTheory.map(l => `<tr><td>${l.labCourseId} — ${l.labTitle}</td><td>${l.theoryCourseId} (${l.theoryTitle})</td></tr>`).join('')}
                </tbody></table>`;
        }

        if ((advising.theoryDayConflicts || []).length) {
            html += `<div class="ulab-fa-section">📅 3+ theory courses on the same day</div>
                <table><thead><tr><th>Day</th><th>Theory Courses</th></tr></thead><tbody>
                ${advising.theoryDayConflicts.map(c => `<tr><td>${c.day}</td><td>${c.courses.map(x => `${x.courseId} (${x.title})`).join(', ')}</td></tr>`).join('')}
                </tbody></table>
                <div class="ulab-fa-note">Not recommended — all 3 finals would fall on this day too. Section change is only permitted to resolve this specific conflict since it arose during pre-registration/registration/add-drop.</div>`;
        }

        if (!info.registrationNotice && !info.probation && !advising.finalProbation && !openRetakes.length
            && !(advising.prereqIssues || []).length && !(advising.labWithoutTheory || []).length
            && !(advising.theoryDayConflicts || []).length) {
            html += `<div class="ulab-fa-note ulab-fa-ok">✓ No issues found.</div>`;
        }

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
