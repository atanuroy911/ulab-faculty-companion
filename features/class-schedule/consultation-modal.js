// features/class-schedule/consultation-modal.js — the editable modal UI for
// the "office-door schedule" export (see consultation-schedule.js for the
// data helpers). Class hours are read straight from the parsed timetable
// and shown locked (they're a fixed assignment, not something to
// freehand-edit); counselling hours are added one at a time through a
// structured "pick a course, pick start/end time" form rather than typed
// freehand, and checked against that day's classes (and other counselling
// entries) for overlaps before being accepted.
(function () {
    const CS = window.ULAB_ConsultationSchedule;
    const HISTORY_KEY = 'ulabSavedConsultationSchedules';
    let state = null;
    let displayName = '';
    let shortFormKey = '';

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function nl2br(s) { return escapeHtml(s).replace(/\n/g, '<br>'); }
    function initials(name) {
        return (name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '👤';
    }

    function ensureModal() {
        if (document.getElementById('consult-modal-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'consult-modal-overlay';
        overlay.innerHTML = `
            <div class="modal consult-modal">
                <div class="modal-header">
                    <div>
                        <div class="modal-title">📋 Teaching &amp; Consultation Schedule</div>
                        <div class="modal-subtitle">Class hours are locked to your schedule. Add counselling hours one at a time below.</div>
                    </div>
                    <button class="modal-close" id="consult-modal-close">✕</button>
                </div>
                <div class="modal-body" id="consult-modal-body"></div>
                <div class="consult-modal-footer">
                    <div class="consult-footer-hint">💡 Aim for ~2 hrs/theory course, ~1 hr/lab course.</div>
                    <div style="flex:1"></div>
                    <button class="export-btn" id="consult-export-pdf">🖨️ Export as PDF</button>
                    <button class="export-btn export-btn-primary" id="consult-export-docx">📝 Export as DOCX</button>
                </div>
            </div>
        `;
        // A separate top-level sibling of the overlay (NOT nested inside
        // it) — print CSS hides every other direct child of <body> while
        // printing, so this has to actually BE a direct child, not buried
        // inside a wrapper the same rule would also hide.
        const printArea = document.createElement('div');
        printArea.id = 'consult-print-area';

        document.body.appendChild(overlay);
        document.body.appendChild(printArea);

        document.getElementById('consult-modal-close').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
        document.getElementById('consult-export-pdf').addEventListener('click', () => openExportConfirm('pdf'));
        document.getElementById('consult-export-docx').addEventListener('click', () => openExportConfirm('docx'));
    }

    // Saves the current (edited) schedule to chrome.storage.local, keyed by
    // short form, so it shows up as a "history" pill in the sidebar and can
    // be reopened later via ULAB_ConsultationModal.openSaved() — without
    // this, the export buttons would be the only way to get the work out,
    // and any further edits would mean starting over from the xlsx.
    function saveToHistory() {
        return new Promise((resolve) => {
            readHeaderFromDom();
            const key = shortFormKey || state.header.name || 'unnamed';
            chrome.storage.local.get([HISTORY_KEY], (data) => {
                const all = data[HISTORY_KEY] || {};
                all[key] = {
                    shortForm: shortFormKey,
                    displayName: state.header.name || displayName || key,
                    savedAt: Date.now(),
                    state: JSON.parse(JSON.stringify(state)),
                };
                chrome.storage.local.set({ [HISTORY_KEY]: all }, resolve);
            });
        });
    }

    // A small "before you export" confirmation — asks whether to also save
    // a copy locally (so it's reopenable later) or just export as-is.
    function openExportConfirm(kind) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay open';
        overlay.innerHTML = `
            <div class="modal modal-compact">
                <div class="modal-header">
                    <div>
                        <div class="modal-title">Export as ${kind === 'pdf' ? 'PDF' : 'DOCX'}</div>
                        <div class="modal-subtitle">Save a copy locally so you (or a future you) can reopen and keep editing this schedule later?</div>
                    </div>
                    <button class="modal-close" id="export-confirm-close">✕</button>
                </div>
                <div class="consult-modal-footer" style="justify-content:flex-end">
                    <button class="export-btn" id="export-confirm-only">Export Only</button>
                    <button class="export-btn export-btn-primary" id="export-confirm-save">💾 Save &amp; Export</button>
                </div>
            </div>
        `;
        overlay.style.zIndex = '750';
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        const runExport = () => (kind === 'pdf' ? exportPdf() : exportDocx());

        overlay.querySelector('#export-confirm-close').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('#export-confirm-only').addEventListener('click', () => { close(); runExport(); });
        overlay.querySelector('#export-confirm-save').addEventListener('click', async () => {
            close();
            await saveToHistory();
            runExport();
        });
    }

    function closeModal() {
        document.getElementById('consult-modal-overlay').classList.remove('open');
        document.body.style.overflow = '';
    }

    function readHeaderFromDom() {
        const body = document.getElementById('consult-modal-body');
        if (!body) return;
        const g = (id) => body.querySelector('#' + id);
        state.header.name = (g('h-name') && g('h-name').innerText.trim()) || '';
        state.header.title = (g('h-title') && g('h-title').innerText.trim()) || '';
        state.header.department = (g('h-dept') && g('h-dept').innerText.trim()) || '';
        state.header.email = (g('h-email') && g('h-email').innerText.trim()) || '';
        state.header.contact = (g('h-contact') && g('h-contact').innerText.trim()) || '';
        const roomEl = g('h-counsel-room');
        if (roomEl) state.counsellingRoom = roomEl.innerText.trim();
    }

    // ── Busy-interval helpers for overlap checking ──────────────────────
    function dayBusyIntervals(day, excludeRowIndex) {
        const intervals = day.classBlocks.map((b) => ({ start: b.startMin, end: b.endMin }));
        day.counselling.forEach((c, i) => {
            if (i === excludeRowIndex || !c || c.start == null || c.end == null) return;
            intervals.push({ start: c.start, end: c.end });
        });
        return intervals;
    }
    function overlaps(intervals, start, end) {
        return intervals.some((iv) => start < iv.end && end > iv.start);
    }

    // Every counselling slot starts as null; these get-or-create it so a
    // single field (just the course, or just the time) can be set without
    // requiring the other to exist yet.
    function ensureSlot(day, rowIndex) {
        if (!day.counselling[rowIndex]) {
            day.counselling[rowIndex] = { code: null, codeDisplay: '', title: '', start: null, end: null };
        }
        return day.counselling[rowIndex];
    }
    // Drops the slot back to null once neither a course nor a time is set,
    // so empty rows don't linger as "half-filled" objects.
    function pruneSlotIfEmpty(day, rowIndex) {
        const s = day.counselling[rowIndex];
        if (s && !s.code && s.start == null && s.end == null) day.counselling[rowIndex] = null;
    }

    // ── Rendering ─────────────────────────────────────────────────────
    // Each row's counselling course and time are independent, directly-
    // editable fields (a "+" in each) rather than one combined add-entry
    // form — click the course "+" to pick just a course, click the time
    // "+" to pick just a start/end. A slot can have either, both, or
    // neither set; only slots with both count as a real entry on export.
    function courseCellHtml(dayIndex, rowIndex) {
        const slot = state.days[dayIndex].counselling[rowIndex];
        const code = slot && slot.code;
        if (!code) {
            return `<td class="consult-cell consult-counsel-empty"><div class="consult-pill-row">
                <button type="button" class="consult-course-btn cp-unset" data-day="${dayIndex}" data-row="${rowIndex}">+ Add Course</button>
            </div></td>`;
        }
        return `<td class="consult-cell"><div class="consult-pill-row">
            <button type="button" class="consult-course-btn consult-course-btn-filled" data-day="${dayIndex}" data-row="${rowIndex}" title="Change course">
                ${escapeHtml(slot.codeDisplay)} (1)${slot.title ? `<span class="consult-subtitle">${escapeHtml(slot.title)}</span>` : ''}
            </button>
            <button class="consult-icon-btn consult-icon-btn-danger" data-action="clear-course" data-day="${dayIndex}" data-row="${rowIndex}" title="Clear course">×</button>
        </div></td>`;
    }

    function timeCellHtml(dayIndex, rowIndex) {
        const slot = state.days[dayIndex].counselling[rowIndex];
        const hasTime = slot && slot.start != null && slot.end != null;
        if (!hasTime) {
            return `<td class="consult-cell consult-nowrap consult-counsel-empty"><div class="consult-pill-row">
                <button type="button" class="consult-time-btn tp-unset" data-day="${dayIndex}" data-row="${rowIndex}">+ Add Time</button>
            </div></td>`;
        }
        return `<td class="consult-cell consult-nowrap"><div class="consult-pill-row">
            <button type="button" class="consult-time-btn consult-time-btn-filled" data-day="${dayIndex}" data-row="${rowIndex}" title="Change time">${CS.formatRange(slot.start, slot.end)}</button>
            <button class="consult-icon-btn consult-icon-btn-danger" data-action="clear-time" data-day="${dayIndex}" data-row="${rowIndex}" title="Clear time">×</button>
        </div></td>`;
    }

    function dayRowsHtml(dayIndex) {
        const day = state.days[dayIndex];
        const classCount = day.classBlocks.length;
        const rowCount = Math.max(classCount, 1);

        let rows = '';
        for (let ri = 0; ri < rowCount; ri++) {
            const dayCell = ri === 0
                ? `<td class="consult-day-cell" rowspan="${rowCount}">${CS.DAY_NAMES[day.day]}</td>`
                : '';

            const cb = day.classBlocks[ri];
            let classCells;
            if (!classCount) {
                classCells = `<td class="consult-cell consult-locked">N/A</td><td class="consult-cell consult-locked consult-nowrap">N/A</td><td class="consult-cell consult-locked consult-nowrap">N/A</td>`;
            } else if (cb) {
                classCells = `
                    <td class="consult-cell consult-locked">${cb.details.codeDisplay} (${cb.details.section})${(function () { const t = CS.resolveTitle(cb.details.code); return t ? `<div class="consult-subtitle">${escapeHtml(t)}</div>` : ''; })()}</td>
                    <td class="consult-cell consult-locked consult-nowrap">${nl2br(cb.timeLines.join('\n'))}</td>
                    <td class="consult-cell consult-locked consult-nowrap">${escapeHtml(cb.details.room)}</td>
                `;
            } else {
                classCells = `<td class="consult-cell consult-locked"></td><td class="consult-cell consult-locked"></td><td class="consult-cell consult-locked"></td>`;
            }

            rows += `<tr data-day="${dayIndex}">${dayCell}${classCells}${courseCellHtml(dayIndex, ri)}${timeCellHtml(dayIndex, ri)}</tr>`;
        }
        return rows;
    }

    // Fixed proportional column widths (table-layout:fixed) so long course
    // titles wrap inside their own column instead of stretching the row —
    // shared with the print output so both stay visually consistent.
    const TABLE_COLGROUP = `<colgroup>
        <col class="consult-col-day">
        <col class="consult-col-course"><col class="consult-col-time"><col class="consult-col-room">
        <col class="consult-col-course"><col class="consult-col-time">
    </colgroup>`;

    function tableHtml() {
        const dayGroups = state.days.map((d, di) => dayRowsHtml(di)).join('');
        return `
            <table class="consult-table">
                ${TABLE_COLGROUP}
                <thead>
                    <tr>
                        <th rowspan="2">Day</th>
                        <th colspan="3">Class Hours <span class="consult-locked-badge">🔒 fixed</span></th>
                        <th colspan="2">
                            Counselling Hours
                            <div class="consult-room-label">Room: <span id="h-counsel-room" class="consult-outlined-field" contenteditable="true" data-placeholder="e.g. PC 325">${nl2br(state.counsellingRoom)}</span></div>
                        </th>
                    </tr>
                    <tr>
                        <th>Courses</th><th>Time</th><th>Room</th>
                        <th>Courses</th><th>Time</th>
                    </tr>
                </thead>
                <tbody>${dayGroups}</tbody>
            </table>
        `;
    }

    function headerCardHtml() {
        const h = state.header;
        const photoBlock = h.photoDataUrl
            ? `<img src="${h.photoDataUrl}" alt="Photo" class="consult-photo">`
            : `<div class="consult-photo consult-photo-placeholder">📷</div>`;
        return `
            <div class="consult-header-card">
                <div class="consult-header-accent"></div>
                <div class="consult-header-inner">
                    <div class="consult-header-photo">
                        ${photoBlock}
                        <label class="consult-photo-upload-btn">Change photo<input type="file" accept="image/*" id="consult-photo-input" style="display:none"></label>
                    </div>
                    <div class="consult-header-text">
                        <div class="consult-field-label">Full name</div>
                        <div class="consult-h-name consult-outlined-field" id="h-name" contenteditable="true" data-placeholder="Full Name">${nl2br(h.name)}</div>
                        <div class="consult-field-row">
                            <div>
                                <div class="consult-field-label">Title</div>
                                <div class="consult-h-title consult-outlined-field" id="h-title" contenteditable="true" data-placeholder="e.g. Lecturer">${nl2br(h.title)}</div>
                            </div>
                            <div>
                                <div class="consult-field-label">Department</div>
                                <div class="consult-h-dept consult-outlined-field" id="h-dept" contenteditable="true" data-placeholder="Department">${nl2br(h.department)}</div>
                            </div>
                        </div>
                        <div class="consult-field-row">
                            <div>
                                <div class="consult-field-label">Email</div>
                                <div class="consult-h-line consult-outlined-field" id="h-email" contenteditable="true" data-placeholder="you@ulab.edu.bd">${nl2br(h.email)}</div>
                            </div>
                            <div>
                                <div class="consult-field-label">Contact</div>
                                <div class="consult-h-line consult-outlined-field" id="h-contact" contenteditable="true" data-placeholder="+8801…">${nl2br(h.contact)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // A plain, letterhead-style header for PDF/print — deliberately NOT
    // the editable-field markup above (no dashed outlines, no uppercase
    // "FULL NAME" micro-labels — those are edit-mode affordances that read
    // as clutter/a form once printed).
    function printHeaderHtml() {
        const h = state.header;
        const photoBlock = h.photoDataUrl
            ? `<img src="${h.photoDataUrl}" alt="Photo" class="consult-print-photo">`
            : `<div class="consult-print-photo consult-print-photo-placeholder">${escapeHtml(initials(h.name))}</div>`;
        const contactLine = [h.email, h.contact].filter(Boolean).join('   •   ');
        return `
            <div class="consult-print-header">
                <div class="consult-print-header-text">
                    <div class="consult-print-name">${escapeHtml(h.name || 'Faculty Name')}</div>
                    ${h.title || h.department ? `<div class="consult-print-role">${escapeHtml([h.title, h.department].filter(Boolean).join(' · '))}</div>` : ''}
                    ${contactLine ? `<div class="consult-print-contact">${escapeHtml(contactLine)}</div>` : ''}
                </div>
                ${photoBlock}
            </div>
        `;
    }

    function renderBody() {
        const body = document.getElementById('consult-modal-body');
        body.innerHTML = `
            ${headerCardHtml()}
            <div class="consult-table-wrap">${tableHtml()}</div>
        `;
        wireBody(body);
    }

    function wireBody(body) {
        const photoInput = body.querySelector('#consult-photo-input');
        if (photoInput) {
            photoInput.addEventListener('change', () => {
                const file = photoInput.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    readHeaderFromDom();
                    state.header.photoDataUrl = reader.result;
                    renderBody();
                };
                reader.readAsDataURL(file);
            });
        }

        // Course button (unset "+" or an already-chosen course, both open
        // the same square-tile picker to set/change it).
        body.querySelectorAll('.consult-course-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const dayIndex = parseInt(btn.dataset.day, 10), rowIndex = parseInt(btn.dataset.row, 10);
                const day = state.days[dayIndex];
                const current = day.counselling[rowIndex];
                window.ULABCoursePicker.open({
                    courses: CS.courseOptions(state),
                    selectedCode: current ? current.code : null,
                    onConfirm: (code) => {
                        readHeaderFromDom();
                        const slot = ensureSlot(day, rowIndex);
                        const opt = CS.courseOptions(state).find((o) => o.code === code);
                        slot.code = code;
                        slot.codeDisplay = opt ? opt.label.split(' — ')[0] : code;
                        slot.title = CS.resolveTitle(code);
                        renderBody();
                    },
                });
            });
        });
        body.querySelectorAll('[data-action="clear-course"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                readHeaderFromDom();
                const dayIndex = parseInt(btn.dataset.day, 10), rowIndex = parseInt(btn.dataset.row, 10);
                const day = state.days[dayIndex];
                const slot = day.counselling[rowIndex];
                if (slot) { slot.code = null; slot.codeDisplay = ''; slot.title = ''; }
                pruneSlotIfEmpty(day, rowIndex);
                renderBody();
            });
        });

        // Time button — opens the clock picker for START, then immediately
        // for END, validates against that day's classes and other
        // counselling rows, then saves both at once.
        body.querySelectorAll('.consult-time-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const dayIndex = parseInt(btn.dataset.day, 10), rowIndex = parseInt(btn.dataset.row, 10);
                const day = state.days[dayIndex];
                const current = day.counselling[rowIndex];
                window.ULABTimePicker.open({
                    title: 'Start time',
                    initialMinutes: current ? current.start : null,
                    onConfirm: (start) => {
                        window.ULABTimePicker.open({
                            title: 'End time',
                            initialMinutes: current && current.end != null ? current.end : start + 60,
                            onConfirm: (end) => {
                                readHeaderFromDom();
                                if (end <= start) { alert('End time must be after the start time.'); return; }
                                const busy = dayBusyIntervals(day, rowIndex);
                                if (overlaps(busy, start, end)) { alert('That overlaps a class or another counselling slot on this day.'); return; }
                                const slot = ensureSlot(day, rowIndex);
                                slot.start = start;
                                slot.end = end;
                                renderBody();
                            },
                        });
                    },
                });
            });
        });
        body.querySelectorAll('[data-action="clear-time"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                readHeaderFromDom();
                const dayIndex = parseInt(btn.dataset.day, 10), rowIndex = parseInt(btn.dataset.row, 10);
                const day = state.days[dayIndex];
                const slot = day.counselling[rowIndex];
                if (slot) { slot.start = null; slot.end = null; }
                pruneSlotIfEmpty(day, rowIndex);
                renderBody();
            });
        });
    }

    // ── Export ────────────────────────────────────────────────────────
    function readOnlyTableHtml() {
        const rows = state.days.map((d) => {
            const classCount = d.classBlocks.length;
            const rowCount = Math.max(classCount, d.counselling.length, 1);
            let out = '';
            for (let ri = 0; ri < rowCount; ri++) {
                const dayCell = ri === 0 ? `<td class="consult-day-cell" rowspan="${rowCount}">${CS.DAY_NAMES[d.day]}</td>` : '';
                const cb = d.classBlocks[ri];
                let classCells;
                if (!classCount) {
                    classCells = `<td class="consult-cell">N/A</td><td class="consult-cell consult-nowrap">N/A</td><td class="consult-cell consult-nowrap">N/A</td>`;
                } else if (cb) {
                    const t = CS.resolveTitle(cb.details.code);
                    classCells = `
                        <td class="consult-cell">${cb.details.codeDisplay} (${cb.details.section})${t ? `<div class="consult-subtitle">${escapeHtml(t)}</div>` : ''}</td>
                        <td class="consult-cell consult-nowrap">${nl2br(cb.timeLines.join('\n'))}</td>
                        <td class="consult-cell consult-nowrap">${escapeHtml(cb.details.room)}</td>
                    `;
                } else {
                    classCells = `<td class="consult-cell"></td><td class="consult-cell"></td><td class="consult-cell"></td>`;
                }
                const c = d.counselling[ri];
                const isComplete = c && c.code && c.start != null && c.end != null;
                const counsellingCells = isComplete
                    ? `<td class="consult-cell">${escapeHtml(c.codeDisplay)} (1)${c.title ? `<div class="consult-subtitle">${escapeHtml(c.title)}</div>` : ''}</td><td class="consult-cell consult-nowrap">${CS.formatRange(c.start, c.end)}</td>`
                    : `<td class="consult-cell"></td><td class="consult-cell"></td>`;
                out += `<tr>${dayCell}${classCells}${counsellingCells}</tr>`;
            }
            return out;
        }).join('');

        return `
            <table class="consult-table">
                ${TABLE_COLGROUP}
                <thead>
                    <tr>
                        <th rowspan="2">Day</th>
                        <th colspan="3">Class Hours</th>
                        <th colspan="2">Counselling Hours${state.counsellingRoom ? `<div class="consult-room-label">Room: ${escapeHtml(state.counsellingRoom)}</div>` : ''}</th>
                    </tr>
                    <tr><th>Courses</th><th>Time</th><th>Room</th><th>Courses</th><th>Time</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    function exportPdf() {
        readHeaderFromDom();
        const printArea = document.getElementById('consult-print-area');
        printArea.innerHTML = `
            <div class="consult-print-page">
                ${printHeaderHtml()}
                ${readOnlyTableHtml()}
                <div class="consult-print-footer">* To make an appointment at some other time (except counselling hours), or if I am unavailable in the given time, please contact via email${state.header.email ? `: ${escapeHtml(state.header.email)}` : ''}${state.header.contact ? ` or WhatsApp (${escapeHtml(state.header.contact)})` : ''}.</div>
            </div>
        `;
        document.body.classList.add('printing-consultation');
        window.print();
        const cleanup = () => {
            document.body.classList.remove('printing-consultation');
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
    }

    // Reads a data-URL image's natural pixel size — needed to keep the
    // embedded DOCX photo's aspect ratio correct when it's scaled down to a
    // fixed display width.
    function imageDimensions(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    }

    async function exportDocx() {
        readHeaderFromDom();
        let photo = null;
        if (state.header.photoDataUrl) {
            const dims = await imageDimensions(state.header.photoDataUrl);
            if (dims) photo = { dataUrl: state.header.photoDataUrl, width: dims.width, height: dims.height };
        }
        const blob = window.ULAB_ScheduleDocx.buildConsultationDocx(state, CS.DAY_NAMES, photo);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(displayName || 'Consultation_Schedule').replace(/\s+/g, '_')}_Consultation_Schedule.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function open(sched) {
        ensureModal();
        displayName = sched.fullName || sched.shortForm || '';
        shortFormKey = sched.shortForm || displayName || 'unnamed';
        state = CS.buildInitialData(sched);
        renderBody();
        document.getElementById('consult-modal-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    // Reopens a previously saved schedule (from the sidebar's history pill
    // list) exactly as it was left — no re-parsing of the xlsx, no
    // recomputed class blocks, just the saved state as-is.
    function openSaved(saved) {
        ensureModal();
        state = JSON.parse(JSON.stringify(saved.state));
        shortFormKey = saved.shortForm || state.header.name || 'unnamed';
        displayName = state.header.name || saved.displayName || '';
        renderBody();
        document.getElementById('consult-modal-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    window.ULAB_ConsultationModal = { open, openSaved };
})();
