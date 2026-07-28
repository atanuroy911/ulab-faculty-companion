// features/advising/student-page-content.js — content script injected into
// the live URMS StudentRegistration page. Adds a floating "Run Advising
// [beta]" button that analyzes the student currently loaded on screen (using
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
            #${BTN_ID} .beta-tag {
                background: rgba(255,255,255,.25); border-radius: 6px; padding: 1px 6px; font-size: 10px;
            }
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
            #${MODAL_ID} .ulab-fa-section { font-weight: 700; margin: 14px 0 6px; font-size: 13px; color: #334155; }
            #${MODAL_ID} table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 6px; }
            #${MODAL_ID} th, #${MODAL_ID} td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
            #${MODAL_ID} .ulab-fa-ok { color: #15803d; }
            #${MODAL_ID} .ulab-fa-note { color: #64748b; font-size: 12px; margin-bottom: 8px; }
        `;
        document.head.appendChild(style);
    }

    function ensureButton() {
        if (document.getElementById(BTN_ID)) return;
        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.innerHTML = `🎓 Run Advising <span class="beta-tag">BETA</span>`;
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

    function openModal(html) {
        ensureModalShell();
        document.getElementById(MODAL_ID).innerHTML = html;
        const closeBtn = document.getElementById(MODAL_ID).querySelector('.ulab-fa-close');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        document.getElementById(`${MODAL_ID}-overlay`).classList.add('open');
    }

    function closeModal() {
        const overlay = document.getElementById(`${MODAL_ID}-overlay`);
        if (overlay) overlay.classList.remove('open');
    }

    function probationLabel(tier) {
        if (tier === null || tier === undefined) return '';
        return tier === 'unspecified' ? 'Probation (tier unspecified)' : `Probation — Tier ${tier}`;
    }

    function renderResult(info, advising, programId) {
        const name = info.urmsName || 'Student';
        let html = `<button class="ulab-fa-close" title="Close">✕</button>
            <h2>🎓 Advising Result — ${name}</h2>
            <div class="ulab-fa-sub">Program: ${programId || info.program || 'Unknown'} · Beta feature — verify before acting.</div>`;

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

        if (!info.probation && !advising.finalProbation && !openRetakes.length && !(advising.prereqIssues || []).length
            && !(advising.labWithoutTheory || []).length && !(advising.theoryDayConflicts || []).length) {
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
        openModal(renderResult(info, advising, programId));
    }

    injectStyles();
    ensureButton();
    // The page loads a student's data via AJAX after the "Load" button is
    // clicked, without a full navigation — re-check periodically in case the
    // button/CSS got removed by a page re-render (cheap, harmless if no-op).
    setInterval(() => { injectStyles(); ensureButton(); }, 2000);
})();
