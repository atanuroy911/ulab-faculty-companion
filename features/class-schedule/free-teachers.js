// features/class-schedule/free-teachers.js — "Who's Free?" tab.
// Upload the same Class Schedule xlsx used by "Generate My Schedule", pick
// a day and one of the sheet's own time slots (or a custom range), and see
// which teachers have no class overlapping that time — and, for the busy
// ones, what they're teaching. schedule-parser.js does one pass over the
// whole workbook (parseWorkbookAllTeachers); every later change to the
// day/slot/filter is recomputed in memory, no re-reading the file.
(function () {
    if (!document.getElementById('ulab-wizard-css')) {
        const link = document.createElement('link');
        link.id = 'ulab-wizard-css';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('features/common/wizard.css');
        document.head.appendChild(link);
    }

    const DAY_NAMES = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
    const CUSTOM = '__custom__';
    const FIELD_STYLE = 'padding:9px 8px;border-radius:8px;border:1px solid var(--border);color:var(--text);background:var(--surface);font:inherit;min-width:0;max-width:100%';

    let root = null;
    let parsed = null; // result of parseWorkbookAllTeachers
    let xlsxLoadPromise = null;

    function $(id) { return root.querySelector('#' + id); }

    function ensureXlsx() {
        if (typeof XLSX !== 'undefined') return Promise.resolve();
        if (xlsxLoadPromise) return xlsxLoadPromise;
        xlsxLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('features/common/vendor/xlsx.full.min.js');
            script.onload = resolve;
            script.onerror = () => reject(new Error('Could not load the spreadsheet reader.'));
            document.head.appendChild(script);
        });
        return xlsxLoadPromise;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function setStatus(msg, isError) {
        $('ulab-ft-status').innerHTML = msg ? `<div class="${isError ? 'ulab-preview-warn' : 'ulab-preview-ok'}">${msg}</div>` : '';
    }

    function fmtMinutes(min) {
        const h = Math.floor(min / 60), m = min % 60;
        const h12 = ((h + 11) % 12) + 1;
        return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
    }

    function hhmmToMinutes(v) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(v || '');
        return m ? +m[1] * 60 + +m[2] : null;
    }

    function slotText(slot) {
        return slot.startMin != null ? `${fmtMinutes(slot.startMin)} – ${fmtMinutes(slot.endMin)}` : slot.label;
    }

    function mount(container) {
        root = container;
        parsed = null;

        root.innerHTML = `
            <div class="ulab-step-title">Who's Free?</div>
            <div class="ulab-step-subtitle">
                Upload this semester's <strong>Class Schedule</strong> Excel file, pick a day and time slot,
                and see which teachers have no class then — handy for arranging make-up classes,
                meetings, exam invigilation or viva boards.
            </div>

            <div class="ulab-format-box">
                <div class="ulab-format-label">1. Upload the schedule file</div>
                <label class="ulab-link-chip" style="cursor:pointer">
                    📄 Choose .xlsx file…
                    <input type="file" accept=".xlsx,.xls" id="ulab-ft-file-input" style="display:none">
                </label>
                <span id="ulab-ft-file-name" class="ulab-format-hint" style="margin-left:8px"></span>
            </div>

            <div id="ulab-ft-status"></div>

            <div id="ulab-ft-controls" style="display:none">
                <div class="ulab-format-box">
                    <div class="ulab-format-label">2. Day and time</div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px">
                        <select id="ulab-ft-day" style="${FIELD_STYLE};flex:1 1 110px"></select>
                        <select id="ulab-ft-slot" style="${FIELD_STYLE};flex:2 1 170px"></select>
                    </div>
                    <div id="ulab-ft-custom" style="display:none;margin-top:8px;gap:8px;align-items:center;flex-wrap:wrap">
                        <input type="time" id="ulab-ft-from" value="10:00" style="${FIELD_STYLE};flex:1 1 100px">
                        <span class="ulab-format-hint">to</span>
                        <input type="time" id="ulab-ft-to" value="11:00" style="${FIELD_STYLE};flex:1 1 100px">
                    </div>
                    <div class="ulab-format-hint" style="margin-top:6px">💡 A teacher counts as busy if any of their classes overlaps the chosen time — so a long lab block makes them busy for every slot it covers.</div>
                </div>

                <input type="text" id="ulab-ft-filter" placeholder="Filter by short form or name…"
                    style="${FIELD_STYLE};width:100%;margin-bottom:12px">

                <div id="ulab-ft-results"></div>
            </div>
        `;

        $('ulab-ft-file-input').addEventListener('change', (e) => loadFile(e.target.files[0] || null));
        $('ulab-ft-day').addEventListener('change', () => { fillSlots(); render(); });
        $('ulab-ft-slot').addEventListener('change', () => {
            $('ulab-ft-custom').style.display = $('ulab-ft-slot').value === CUSTOM ? 'flex' : 'none';
            render();
        });
        $('ulab-ft-from').addEventListener('input', render);
        $('ulab-ft-to').addEventListener('input', render);
        $('ulab-ft-filter').addEventListener('input', render);
    }

    async function loadFile(file) {
        $('ulab-ft-file-name').textContent = file ? `✅ ${file.name}` : '';
        $('ulab-ft-controls').style.display = 'none';
        parsed = null;
        if (!file) { setStatus(''); return; }

        try {
            setStatus('⏳ Loading spreadsheet reader…');
            await ensureXlsx();
            setStatus('⏳ Reading every class in the sheet…');
            const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
            const result = window.ULAB_ScheduleParser.parseWorkbookAllTeachers(workbook);

            const teaching = result.teachers.filter((t) => t.entries.length).length;
            if (!result.days.length || !teaching) {
                setStatus("❌ Couldn't find any time slots or classes in this file. Is it the university's Class Schedule sheet?", true);
                return;
            }
            parsed = result;
            setStatus(`✅ Found ${result.teachers.length} teacher(s) (${teaching} with classes) across ${result.days.length} day(s).`);

            const today = window.ULAB_ScheduleParser.DAY_ORDER[new Date().getDay()];
            $('ulab-ft-day').innerHTML = result.days
                .map((d) => `<option value="${d}"${d === today ? ' selected' : ''}>${DAY_NAMES[d] || d}</option>`).join('');
            fillSlots();
            $('ulab-ft-controls').style.display = '';
            render();
        } catch (err) {
            console.error("[ULAB Who's Free]", err);
            setStatus(`❌ Error: ${escapeHtml(err.message)}`, true);
        }
    }

    function fillSlots() {
        const slots = parsed.slots[$('ulab-ft-day').value] || [];
        $('ulab-ft-slot').innerHTML =
            slots.map((s, i) => `<option value="${i}">${escapeHtml(slotText(s))}</option>`).join('') +
            `<option value="${CUSTOM}">Custom time range…</option>`;
        $('ulab-ft-custom').style.display = slots.length ? 'none' : 'flex';
        if (!slots.length) $('ulab-ft-slot').value = CUSTOM;
    }

    // { startMin, endMin, label } for the current selection, or null if a
    // custom range is incomplete/backwards.
    function currentRange() {
        const day = $('ulab-ft-day').value;
        const v = $('ulab-ft-slot').value;
        if (v !== CUSTOM) {
            const s = (parsed.slots[day] || [])[+v];
            return s ? { startMin: s.startMin, endMin: s.endMin, label: s.label } : null;
        }
        const from = hhmmToMinutes($('ulab-ft-from').value);
        const to = hhmmToMinutes($('ulab-ft-to').value);
        if (from == null || to == null || to <= from) return null;
        return { startMin: from, endMin: to, label: null };
    }

    function teacherLabel(t) {
        return `<strong>${escapeHtml(t.short)}</strong>${t.fullName ? ` <span style="color:var(--muted)">— ${escapeHtml(t.fullName)}</span>` : ''}`;
    }

    function render() {
        if (!parsed) return;
        const out = $('ulab-ft-results');
        const day = $('ulab-ft-day').value;
        const range = currentRange();
        if (!range) {
            out.innerHTML = '<div class="ulab-preview-warn">Pick a valid time range (end after start).</div>';
            return;
        }

        const q = $('ulab-ft-filter').value.trim().toLowerCase();
        const matches = (t) => !q || t.short.toLowerCase().includes(q) || t.fullName.toLowerCase().includes(q);

        const free = [], busy = [];
        for (const t of parsed.teachers) {
            if (!matches(t)) continue;
            const clashes = window.ULAB_ScheduleParser.busyEntriesFor(t, day, range.startMin, range.endMin, range.label);
            if (clashes.length) busy.push({ t, clashes });
            else free.push({ t, classesToday: t.entries.filter((e) => e.day === day).length });
        }

        const rowStyle = 'padding:7px 9px;border-radius:8px;margin-bottom:5px;font-size:12.5px;line-height:1.45;background:rgba(var(--overlay-rgb),0.03);border:1px solid rgba(var(--overlay-rgb),0.06)';
        const when = `${DAY_NAMES[day] || day}, ${escapeHtml(range.startMin != null ? `${fmtMinutes(range.startMin)} – ${fmtMinutes(range.endMin)}` : range.label)}`;

        const freeRows = free.map(({ t, classesToday }) => `
            <div style="${rowStyle}">
                ${teacherLabel(t)}
                <div class="ulab-format-hint">${!t.entries.length ? 'No classes found in the sheet' : classesToday ? `${classesToday} other class slot(s) this day` : 'No classes this day'}</div>
            </div>`).join('');

        const busyRows = busy.map(({ t, clashes }) => `
            <div style="${rowStyle}">
                ${teacherLabel(t)}
                ${clashes.map((e) => `<div class="ulab-format-hint">📘 ${escapeHtml(e.course)} · ${escapeHtml(e.time)}</div>`).join('')}
            </div>`).join('');

        out.innerHTML = `
            <div class="ulab-format-label" style="color:#34d399">✅ Free on ${when} (${free.length})</div>
            ${freeRows || '<div class="ulab-format-hint" style="margin-bottom:10px">Nobody matching is free then.</div>'}
            <details style="margin-top:12px">
                <summary class="ulab-format-label" style="cursor:pointer;color:#f59e0b">⛔ Busy (${busy.length})</summary>
                <div style="margin-top:6px">${busyRows || '<div class="ulab-format-hint">Nobody matching is busy then.</div>'}</div>
            </details>
            <div class="ulab-format-hint" style="margin-top:10px">Only covers classes in the uploaded sheet — meetings, consultation hours and other duties aren't included.</div>
        `;
    }

    window.ULAB_FEATURES = window.ULAB_FEATURES || [];
    window.ULAB_FEATURES.push({
        id: 'free-teachers',
        icon: '🧑‍🏫',
        title: "Who's Free?",
        subtitle: 'Upload the Class Schedule sheet and see which teachers are free in a time slot',
        mount,
    });
})();
