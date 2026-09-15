// features/class-schedule/my-schedule.js — "My Schedule" tab: lists every
// schedule previously generated via "Generate My Schedule" (saved under
// SAVED_SCHEDULES_KEY, keyed by short-form + semester + year), and opens
// one back up — inline in the same tool slot when running inside the
// tools-frame overlay (window.ULAB_TOOLS_FRAME_SHOW_RESULTS), or in a new
// tab from the side panel. If nothing's been generated yet, jumps straight
// to the Generate tab instead of showing an empty list.
(function () {
    if (!document.getElementById('ulab-wizard-css')) {
        const link = document.createElement('link');
        link.id = 'ulab-wizard-css';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('features/common/wizard.css');
        document.head.appendChild(link);
    }

    const SAVED_SCHEDULES_KEY = 'ulabSavedClassSchedules';
    let root = null;

    function $(id) { return root.querySelector('#' + id); }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function fmtSavedAt(ts) {
        if (!ts) return '';
        return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function goToGenerate() {
        if (window.ULAB_TOOLS_FRAME_GOTO) window.ULAB_TOOLS_FRAME_GOTO('class-schedule');
        else if (window.ULAB_SIDEBAR_GOTO) window.ULAB_SIDEBAR_GOTO('class-schedule');
    }

    function openSchedule(entry) {
        chrome.storage.local.set({ ulabClassSchedule: entry }, () => {
            if (window.ULAB_TOOLS_FRAME_SHOW_RESULTS) {
                window.ULAB_TOOLS_FRAME_SHOW_RESULTS('features/class-schedule/results.html');
            } else {
                chrome.runtime.sendMessage({ action: 'openClassScheduleResults' });
            }
        });
    }

    function render(all) {
        const entries = Object.entries(all).sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0));

        if (!entries.length) {
            root.innerHTML = `
                <div class="ulab-step-title">My Schedule</div>
                <div class="ulab-step-subtitle">No schedules found — generate and save one first.</div>
                <div class="ulab-wizard-nav">
                    <button class="ulab-primary-btn" id="ulab-ms-generate-btn">📅 Generate My Schedule →</button>
                </div>
            `;
            $('ulab-ms-generate-btn').addEventListener('click', goToGenerate);
            return;
        }

        root.innerHTML = `
            <div class="ulab-step-title">My Schedule</div>
            <div class="ulab-step-subtitle">Every schedule you've generated, saved by name and semester — click one to view it.</div>
            <div id="ulab-ms-list"></div>
        `;

        const list = $('ulab-ms-list');
        list.innerHTML = entries.map(([key, entry]) => {
            const name = entry.fullName || entry.shortForm || 'Unnamed';
            const term = [entry.semester, entry.year].filter(Boolean).join(' ') || 'Semester not set';
            const count = entry.entries ? entry.entries.length : 0;
            const saved = fmtSavedAt(entry.savedAt);
            return `
                <div class="ulab-format-box ulab-ms-item" data-key="${escapeHtml(key)}" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px">
                    <div style="min-width:0">
                        <div style="font-weight:700">${escapeHtml(name)}</div>
                        <div class="ulab-format-hint" style="margin:2px 0 0">
                            ${escapeHtml(term)} · ${count} class slot(s)${saved ? ' · saved ' + escapeHtml(saved) : ''}
                        </div>
                    </div>
                    <button class="ulab-history-pill-remove" data-key="${escapeHtml(key)}" title="Delete this schedule">×</button>
                </div>
            `;
        }).join('');

        list.querySelectorAll('.ulab-ms-item').forEach((el) => {
            el.addEventListener('click', (ev) => {
                if (ev.target.closest('.ulab-history-pill-remove')) return;
                openSchedule(all[el.dataset.key]);
            });
        });
        list.querySelectorAll('.ulab-history-pill-remove').forEach((btn) => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                chrome.storage.local.get([SAVED_SCHEDULES_KEY], (data) => {
                    const current = data[SAVED_SCHEDULES_KEY] || {};
                    delete current[btn.dataset.key];
                    chrome.storage.local.set({ [SAVED_SCHEDULES_KEY]: current }, () => render(current));
                });
            });
        });
    }

    function mount(container) {
        root = container;
        chrome.storage.local.get([SAVED_SCHEDULES_KEY], (data) => render(data[SAVED_SCHEDULES_KEY] || {}));
    }

    window.ULAB_FEATURES = window.ULAB_FEATURES || [];
    window.ULAB_FEATURES.push({
        id: 'my-schedule',
        icon: '🗓️',
        title: 'My Schedule',
        subtitle: 'Reopen a schedule you\'ve already generated and saved',
        mount,
    });
})();
