// results.js — loaded inside features/class-schedule/results.html
chrome.storage.local.get(['ulabClassSchedule', 'ulabConsultationToOpen'], (data) => {
    const sched = data.ulabClassSchedule;
    const pendingConsultation = data.ulabConsultationToOpen;
    if (pendingConsultation) chrome.storage.local.remove('ulabConsultationToOpen');

    if (!sched || !sched.entries || !sched.entries.length) {
        if (pendingConsultation) {
            // Opened straight from a sidebar "history" pill — no fresh xlsx
            // parse behind it, so skip the weekly-grid view entirely and
            // just bring the saved consultation schedule straight up.
            document.body.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📋</div>
                    <div style="font-size:20px;font-weight:600;margin-bottom:8px">Opening your saved schedule…</div>
                </div>`;
            window.ULAB_ConsultationModal.openSaved(pendingConsultation);
        } else {
            document.body.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📭</div>
                    <div style="font-size:20px;font-weight:600;margin-bottom:8px">No schedule generated yet</div>
                    <div>Go to <strong>📅 Generate My Schedule</strong> in the side panel first.</div>
                </div>`;
        }
        return;
    }

    const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const DAY_NAMES = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
    // JS Date#getDay() order matches DAY_ORDER above (Sun=0 ... Sat=6).
    const TIMEZONE = 'Asia/Dhaka';

    // ── Calendar helpers ─────────────────────────────────────────
    function pad2(n) { return String(n).padStart(2, '0'); }

    // First calendar date on/after `startDate` that falls on `dayAbbr`.
    function firstOccurrence(startDate, dayAbbr) {
        const targetIdx = DAY_ORDER.indexOf(dayAbbr);
        const d = new Date(startDate);
        const offset = (targetIdx - d.getDay() + 7) % 7;
        d.setDate(d.getDate() + offset);
        return d;
    }

    function dateAtMinutes(date, minutes) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setMinutes(minutes);
        return d;
    }

    function icsStamp(d) {
        return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
    }

    function gcalStamp(d) {
        return icsStamp(d); // same YYYYMMDDTHHMMSS shape Google's render URL expects
    }

    function getCalSettings() {
        const startVal = document.getElementById('cal-start-date').value;
        const weeks = Math.max(1, parseInt(document.getElementById('cal-weeks').value, 10) || 16);
        if (!startVal) return null;
        const [y, m, d] = startVal.split('-').map(Number);
        return { startDate: new Date(y, m - 1, d), weeks };
    }

    function buildGCalUrl(entry, startDate, weeks) {
        if (entry.startMin == null || entry.endMin == null) return null;
        const day0 = firstOccurrence(startDate, entry.day);
        const start = dateAtMinutes(day0, entry.startMin);
        const end = dateAtMinutes(day0, entry.endMin);
        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: entry.course,
            dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
            details: `Class slot: ${entry.time}\nSource: ULAB Faculty Companion — Generate My Schedule`,
            recur: `RRULE:FREQ=WEEKLY;COUNT=${weeks}`,
            ctz: TIMEZONE,
        });
        return `https://calendar.google.com/calendar/render?${params.toString()}`;
    }

    function buildIcsForAll(entries, startDate, weeks) {
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ULAB Faculty Companion//Class Schedule//EN', 'CALSCALE:GREGORIAN'];
        const stampNow = icsStamp(new Date());
        entries.forEach((entry, i) => {
            if (entry.startMin == null || entry.endMin == null) return;
            const day0 = firstOccurrence(startDate, entry.day);
            const start = dateAtMinutes(day0, entry.startMin);
            const end = dateAtMinutes(day0, entry.endMin);
            lines.push(
                'BEGIN:VEVENT',
                `UID:ulab-class-schedule-${i}-${Date.now()}@atanusroy.com`,
                `DTSTAMP:${stampNow}`,
                `DTSTART:${icsStamp(start)}`,
                `DTEND:${icsStamp(end)}`,
                `RRULE:FREQ=WEEKLY;COUNT=${weeks}`,
                `SUMMARY:${icsEscape(entry.course)}`,
                `DESCRIPTION:${icsEscape('Class slot: ' + entry.time)}`,
                'END:VEVENT'
            );
        });
        lines.push('END:VCALENDAR');
        return lines.join('\r\n');
    }

    function icsEscape(s) {
        return String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    const displayName = sched.fullName || sched.shortForm;
    document.getElementById('page-title').textContent = `${displayName}'s Schedule`;
    document.getElementById('hero-sub').textContent = sched.fullName
        ? `${sched.fullName} (${sched.shortForm})`
        : `Short form: ${sched.shortForm}`;
    document.getElementById('stat-short').textContent = sched.shortForm;
    document.getElementById('stat-count').textContent = sched.entries.length;
    document.getElementById('stat-file').textContent = sched.sourceFile || '—';
    document.title = `${displayName}'s Schedule`;

    // Days actually present, in week order.
    const daysPresent = DAY_ORDER.filter((d) => sched.entries.some((e) => e.day === d));

    // Distinct time-slot labels, ordered by their earliest sortKey seen.
    const slotOrder = [];
    const slotKey = new Map();
    for (const e of sched.entries) {
        if (!slotKey.has(e.time)) {
            slotKey.set(e.time, e.sortKey);
            slotOrder.push(e.time);
        }
    }
    slotOrder.sort((a, b) => slotKey.get(a) - slotKey.get(b));

    // ── Full course-name lookup ─────────────────────────────────────
    // The bundled program catalogues (CSE/BBA/English/MSJ/EEE/Bangla) each
    // resolve local + UNESCO codes to a title; GEF/UCC/GED/ESK general-ed
    // courses are duplicated across all of them, so loading all six gives
    // decent cross-department coverage even though this schedule spans many
    // more departments than those six catalogues individually cover. Codes
    // this doesn't resolve just fall back to showing the raw short form.
    let showFullNames = true;
    const titleCache = new Map();

    function resolveTitle(code) {
        if (!code) return '';
        const catalogues = window.ULAB_CATALOGUES || {};
        for (const key of Object.keys(catalogues)) {
            const title = catalogues[key].titleFor(code);
            if (title) return title;
        }
        return '';
    }

    // Pull the course code out of the *original* cell text (entry.raw),
    // not the already-cleaned `entry.course` string — raw still has the
    // UNESCO alt-code's hyphens intact, which the cleaned string lost.
    function courseTitleFor(entry) {
        if (titleCache.has(entry.raw)) return titleCache.get(entry.raw);

        let title = '';
        // Capstone/Internship/Thesis cells carry a trailing "-A"/"-B"/"-C"
        // section letter that's actually part of the catalogue code itself
        // (CSE4098A, CSE4099B, ...) — try with it first, then fall back to
        // the bare department+number for every other course.
        // {3,5} (not {3,4}) — MSJ's old pre-UNESCO numbering is 5 digits
        // (e.g. "MSJ 11431"), not just 3-4 like everyone else's local codes.
        const localMatchSuffixed = entry.raw.match(/^([A-Za-z]{2,6})\s?(\d{3,5})-([A-Za-z])\b/);
        if (localMatchSuffixed) {
            title = resolveTitle(localMatchSuffixed[1].toUpperCase() + localMatchSuffixed[2] + localMatchSuffixed[3].toUpperCase());
        }
        if (!title) {
            const localMatch = entry.raw.match(/^([A-Za-z]{2,6})\s?(\d{3,5})/);
            if (localMatch) {
                title = resolveTitle(localMatch[1].toUpperCase() + localMatch[2]);
            }
        }
        // A cell can list the code twice — an old numbering first, then the
        // current one after a "/" (e.g. "MSJ 11431 / MSJ 4131 - ..."). If
        // the first code didn't resolve, try the second one too, rather
        // than depending only on the catalogue having that exact oldCode.
        if (!title) {
            const secondMatch = entry.raw.match(/\/\s*([A-Za-z]{2,6})\s?(\d{3,5})/);
            if (secondMatch) {
                title = resolveTitle(secondMatch[1].toUpperCase() + secondMatch[2]);
            }
        }
        if (!title) {
            // Optional whitespace around each hyphen — the sheet isn't
            // consistent about it (e.g. "0613-014- 1202" with a stray space
            // after the second hyphen). The catalogue's own normalizeUnesco
            // strips whitespace anyway, so passing the match through as-is
            // (spaces included) still resolves correctly.
            const altMatch = entry.raw.match(/\d{3,4}\s*-\s*\d{3}\s*-\s*\d{3,4}/);
            if (altMatch) title = resolveTitle(altMatch[0]);
        }
        titleCache.set(entry.raw, title);
        return title;
    }

    function courseCellHtml(e) {
        const title = showFullNames ? courseTitleFor(e) : '';
        return (title ? `<span class="course-title-full">${escapeHtml(title)}</span>` : '') +
            `<span class="code">${escapeHtml(e.course)}</span>`;
    }

    // ── Grid table ────────────────────────────────────────────────
    function gcalChipHtml(e) {
        const settings = getCalSettings();
        if (!settings) return '';
        const url = buildGCalUrl(e, settings.startDate, settings.weeks);
        return url ? `<a class="gcal-link" href="${url}" target="_blank" rel="noopener">+ Google Calendar</a>` : '';
    }

    function renderAll() {
        const table = document.getElementById('sched-table');
        table.innerHTML = '';
        const thead = document.createElement('thead');
        thead.innerHTML = `<tr><th>Time</th>${daysPresent.map((d) => `<th>${DAY_NAMES[d]}</th>`).join('')}</tr>`;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (const slot of slotOrder) {
            const tr = document.createElement('tr');
            const timeTd = document.createElement('td');
            timeTd.className = 'time-col';
            timeTd.textContent = slot;
            tr.appendChild(timeTd);

            for (const day of daysPresent) {
                const td = document.createElement('td');
                const matches = sched.entries.filter((e) => e.day === day && e.time === slot);
                if (!matches.length) {
                    td.innerHTML = `<span class="empty-cell">—</span>`;
                } else {
                    td.innerHTML = matches.map((e) => `
                        <div class="course-chip">
                            ${courseCellHtml(e)}
                            ${gcalChipHtml(e)}
                        </div>
                    `).join('');
                }
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);

        // ── List view ─────────────────────────────────────────────
        const listWrap = document.getElementById('list-view');
        listWrap.innerHTML = '';
        let rowIdx = 0;
        for (const day of daysPresent) {
            const dayEntries = sched.entries.filter((e) => e.day === day);
            for (const e of dayEntries) {
                const row = document.createElement('div');
                row.className = 'list-row' + (rowIdx++ % 2 === 1 ? ' odd' : '');
                const gcalUrl = (() => {
                    const settings = getCalSettings();
                    return settings ? buildGCalUrl(e, settings.startDate, settings.weeks) : null;
                })();
                row.innerHTML = `
                    <div class="list-day">${e.day}</div>
                    <div class="list-time">${escapeHtml(e.time)}</div>
                    <div class="list-course">${courseCellHtml(e)}</div>
                    <div class="list-gcal">${gcalUrl ? `<a class="gcal-link" href="${gcalUrl}" target="_blank" rel="noopener">+ Google Calendar</a>` : ''}</div>
                `;
                listWrap.appendChild(row);
            }
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // Default the start-date picker (and weeks count) so the calendar
    // links work immediately without the user having to know the exact
    // semester start date. Prefers the semester/year captured on upload
    // (detected from the file name, or set manually there) — ULAB's term
    // start is approximated as "the Nth Sunday of an anchor month" per
    // features/class-schedule/schedule-parser.js; falls back to "the
    // coming Sunday" when no semester/year is known. Either way this is
    // just a starting point — both fields stay fully editable below.
    (function setDefaultStartDate() {
        const input = document.getElementById('cal-start-date');
        const weeksInput = document.getElementById('cal-weeks');
        const hint = document.getElementById('cal-semester-hint');

        const known = sched.semester && sched.year
            ? window.ULAB_ScheduleParser.semesterDefaults(sched.semester, sched.year)
            : null;

        if (known) {
            input.value = `${known.startDate.getFullYear()}-${pad2(known.startDate.getMonth() + 1)}-${pad2(known.startDate.getDate())}`;
            weeksInput.value = known.weeks;
            if (hint) hint.textContent = `📅 Defaulted to ${sched.semester} ${sched.year}'s approximate start (an estimate — confirm against the published academic calendar).`;
            return;
        }

        const today = new Date();
        const offset = (0 - today.getDay() + 7) % 7; // next Sunday (0 if today is Sunday)
        const nextSunday = new Date(today);
        nextSunday.setDate(today.getDate() + offset);
        input.value = `${nextSunday.getFullYear()}-${pad2(nextSunday.getMonth() + 1)}-${pad2(nextSunday.getDate())}`;
        if (hint) hint.textContent = "⚠️ Semester wasn't detected — defaulted to the coming Sunday. Set the real start date above.";
    })();

    document.getElementById('cal-start-date').addEventListener('change', renderAll);
    document.getElementById('cal-weeks').addEventListener('change', renderAll);

    document.getElementById('export-pdf-btn').addEventListener('click', () => window.print());

    document.getElementById('export-consult-btn').addEventListener('click', () => {
        window.ULAB_ConsultationModal.open(sched);
    });

    document.getElementById('export-docx-btn').addEventListener('click', () => {
        const cellLinesFor = (day, slot) => sched.entries
            .filter((e) => e.day === day && e.time === slot)
            .map((e) => {
                const title = showFullNames ? courseTitleFor(e) : '';
                return title ? `${title} — ${e.course}` : e.course;
            });

        const blob = window.ULAB_ScheduleDocx.buildScheduleDocx({
            title: `${displayName}'s Schedule`,
            subtitle: sched.fullName ? `${sched.fullName} (${sched.shortForm})` : `Short form: ${sched.shortForm}`,
            daysPresent,
            dayNames: DAY_NAMES,
            slotOrder,
            cellLinesFor,
        });
        downloadBlob(blob, `${(sched.fullName || sched.shortForm).replace(/\s+/g, '_')}_schedule.docx`);
    });

    const fullNameToggle = document.getElementById('full-name-toggle');
    const fullNameToggleLabel = document.getElementById('full-name-toggle-label');
    fullNameToggle.checked = showFullNames;
    fullNameToggle.addEventListener('change', () => {
        showFullNames = fullNameToggle.checked;
        fullNameToggleLabel.textContent = showFullNames ? 'Full course names' : 'Short codes';
        renderAll();
    });

    document.getElementById('gcal-all-btn').addEventListener('click', () => {
        const settings = getCalSettings();
        if (!settings) {
            alert('Please pick a semester start date first.');
            return;
        }
        const ics = buildIcsForAll(sched.entries, settings.startDate, settings.weeks);
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8;' });
        downloadBlob(blob, `${(sched.fullName || sched.shortForm).replace(/\s+/g, '_')}_schedule.ics`);
    });

    renderAll();

    if (pendingConsultation) window.ULAB_ConsultationModal.openSaved(pendingConsultation);

    // ── Theme toggle ─────────────────────────────────────────────
    const htmlEl = document.documentElement;
    const lbl = document.getElementById('toggle-label');
    // Default to the site-wide dark/light toggle when known (see
    // advising-billing/results.js for the full rationale), falling back to
    // this page's own last choice when opened standalone.
    chrome.storage.local.get(['ulabModernTheme'], (result) => {
        applyTheme(result.ulabModernTheme || localStorage.getItem('ulab-theme') || 'light');
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.ulabModernTheme) applyTheme(changes.ulabModernTheme.newValue);
    });

    document.getElementById('theme-toggle').addEventListener('click', () => {
        applyTheme(htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    function applyTheme(t) {
        htmlEl.setAttribute('data-theme', t);
        localStorage.setItem('ulab-theme', t);
        lbl.textContent = t === 'dark' ? 'Light mode' : 'Dark mode';
    }
});
