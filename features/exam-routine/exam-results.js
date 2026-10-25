// features/exam-routine/exam-results.js — Logic for the standalone Exam Routine results page.
// Loaded via <script src="exam-results.js"> in exam-results.html (no inline scripts, adhering to MV3 CSP).
(function () {
    const html = document.documentElement;
    const toggleBtn = document.getElementById('theme-toggle');
    const toggleLabel = document.getElementById('toggle-label');

    // ── Theme management ──────────────────────────────────────────────────
    function applyTheme(theme) {
        html.dataset.theme = theme;
        if (toggleLabel) {
            toggleLabel.textContent = theme === 'dark' ? 'Dark mode' : 'Light mode';
        }
    }

    function initTheme() {
        const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['ulabTheme'], ({ ulabTheme }) => {
                applyTheme(ulabTheme === 'dark' || ulabTheme === 'light' ? ulabTheme : sys);
            });
        } else {
            const saved = localStorage.getItem('ulabTheme');
            applyTheme(saved === 'dark' || saved === 'light' ? saved : sys);
        }

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
                applyTheme(next);
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ ulabTheme: next });
                }
                try { localStorage.setItem('ulabTheme', next); } catch (_) {}
            });
        }
    }

    // ── Data loading (with chrome.storage and localStorage fallback) ───────
    function loadExamData(callback) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['ulabExamRoutine'], ({ ulabExamRoutine }) => {
                if (ulabExamRoutine && ulabExamRoutine.entries && ulabExamRoutine.entries.length) {
                    callback(ulabExamRoutine);
                    return;
                }
                // Fallback to localStorage
                try {
                    const raw = localStorage.getItem('ulabExamRoutine');
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed && parsed.entries && parsed.entries.length) {
                            callback(parsed);
                            return;
                        }
                    }
                } catch (_) {}
                callback(null);
            });
        } else {
            try {
                const raw = localStorage.getItem('ulabExamRoutine');
                callback(raw ? JSON.parse(raw) : null);
            } catch (_) {
                callback(null);
            }
        }
    }

    // ── Helper functions ──────────────────────────────────────────────────
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
        );
    }

    function pad2(n) { return String(n).padStart(2, '0'); }

    function stamp(d) {
        return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
    }

    function parseTimeRange(timeStr) {
        if (!timeStr) return null;
        const timeRe = /(\d{1,2}):(\d{2})\s*([ap]m)?/gi;
        const matches = [...timeStr.matchAll(timeRe)];
        if (matches.length < 2) return null;

        function toMinutes(m) {
            let h = parseInt(m[1], 10);
            const min = parseInt(m[2], 10);
            const ampm = (m[3] || '').toLowerCase();
            if (ampm === 'pm' && h < 12) h += 12;
            if (ampm === 'am' && h === 12) h = 0;
            return h * 60 + min;
        }

        const startMin = toMinutes(matches[0]);
        let endMin = toMinutes(matches[1]);
        if (endMin <= startMin && endMin < 720) {
            endMin += 720; // 12-hour offset if afternoon am/pm omitted on start
        }
        return { startMin, endMin };
    }

    function entryToDateTimes(entry) {
        if (!entry.dateKey || entry.dateKey === 'unknown') return null;
        const [y, m, d] = entry.dateKey.split('-').map(Number);
        if (!y || !m || !d) return null;
        const times = parseTimeRange(entry.time);
        if (!times) return null;

        const startDate = new Date(y, m - 1, d, Math.floor(times.startMin / 60), times.startMin % 60, 0);
        const endDate = new Date(y, m - 1, d, Math.floor(times.endMin / 60), times.endMin % 60, 0);
        return { startDate, endDate };
    }

    function buildGCalUrl(entry) {
        const dt = entryToDateTimes(entry);
        if (!dt) return null;
        const title = `Exam: ${entry.course || 'ULAB Exam'}${entry.section ? ` Sec ${entry.section}` : ''}`;
        const location = entry.room ? `Room ${entry.room}, ULAB` : 'ULAB';
        const details = `Course: ${entry.course || ''}\nSection: ${entry.section || ''}\nRoom: ${entry.room || ''}\nSlot: ${entry.time}\nEntry: ${entry.raw || ''}\nGenerated via ULAB Faculty Companion`;
        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: title,
            dates: `${stamp(dt.startDate)}/${stamp(dt.endDate)}`,
            details: details,
            location: location,
            ctz: 'Asia/Dhaka',
        });
        return `https://calendar.google.com/calendar/render?${params.toString()}`;
    }

    function buildIcsForExams(entries, facultyName) {
        const lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//ULAB Faculty Companion//Exam Routine//EN',
            'CALSCALE:GREGORIAN'
        ];
        const stampNow = stamp(new Date());

        entries.forEach((entry, i) => {
            const dt = entryToDateTimes(entry);
            if (!dt) return;
            const title = `Exam: ${entry.course || 'ULAB Exam'}${entry.section ? ` Sec ${entry.section}` : ''}`;
            const location = entry.room ? `Room ${entry.room}, ULAB` : 'ULAB';
            const description = `Course: ${entry.course || ''}\\nSection: ${entry.section || ''}\\nRoom: ${entry.room || ''}\\nSlot: ${entry.time}\\nFaculty: ${facultyName || ''}\\nRaw: ${entry.raw || ''}`;
            lines.push(
                'BEGIN:VEVENT',
                `UID:ulab-exam-${i}-${Date.now()}@atanusroy.com`,
                `DTSTAMP:${stampNow}`,
                `DTSTART:${stamp(dt.startDate)}`,
                `DTEND:${stamp(dt.endDate)}`,
                `SUMMARY:${title.replace(/[,;]/g, ' ')}`,
                `LOCATION:${location.replace(/[,;]/g, ' ')}`,
                `DESCRIPTION:${description}`,
                'STATUS:CONFIRMED',
                'END:VEVENT'
            );
        });

        lines.push('END:VCALENDAR');
        return lines.join('\r\n');
    }

    function downloadIcs(entries, data) {
        const name = data.fullName || data.shortForm || 'Faculty';
        const icsContent = buildIcsForExams(entries, name);
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const term = [data.examType, data.semester, data.year].filter(Boolean).join('_') || 'Routine';
        a.download = `Exam_Schedule_${(data.shortForm || 'ULAB')}_${term}.ics`.replace(/[\s/]+/g, '_');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ── Build Single Exam Card ────────────────────────────────────────────
    function buildExamCard(e, idx, slotLabels) {
        const timeShort = (e.time || '').replace(/\s+/g, ' ').trim();
        const slotNum = slotLabels[idx] || `Slot ${idx + 1}`;
        const gcalUrl = buildGCalUrl(e);

        return `
            <div class="exam-card">
                <div class="exam-time-col">
                    <span class="exam-time-badge">${esc(timeShort)}</span>
                    <span class="exam-slot-num">${esc(slotNum)}</span>
                </div>
                <div class="exam-body">
                    <div class="exam-course-header">
                        <span class="exam-course-code">${esc(e.course || '—')}</span>
                    </div>
                    <div class="exam-section-room">
                        ${e.section ? `<span class="exam-pill section">§ Section ${esc(e.section)}</span>` : ''}
                        ${e.room ? `<span class="exam-pill room">🚪 Room ${esc(e.room)}</span>` : ''}
                        ${gcalUrl ? `<a href="${esc(gcalUrl)}" target="_blank" rel="noopener" class="exam-gcal-link" title="Add this exam to Google Calendar">+ Google Calendar</a>` : ''}
                    </div>
                </div>
                <div class="exam-raw-col">
                    <div class="exam-raw" title="Exact cell content in the schedule sheet">${esc(e.raw)}</div>
                </div>
            </div>
        `;
    }

    // ── Main Render ───────────────────────────────────────────────────────
    function render(data) {
        const content = document.getElementById('exam-content');
        if (!content) return;

        if (!data || !data.entries || !data.entries.length) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📭</div>
                    <div style="font-size:20px;font-weight:700;margin-bottom:8px">No exam routine generated yet</div>
                    <div>Upload an exam spreadsheet in <strong>🗒️ Exam Routine Finder</strong> first.</div>
                </div>
            `;
            return;
        }

        const entries = data.entries;
        const name = data.fullName || data.shortForm || 'Faculty';
        const term = [data.examType, data.semester, data.year].filter(Boolean).join(' ') || '';

        // Update page title & hero
        document.title = `${name} — ${term || 'ULAB'} Exam Routine`;
        document.getElementById('page-title').textContent = name;
        document.getElementById('hero-sub').textContent =
            [term, data.sourceFile ? `File: ${data.sourceFile}` : ''].filter(Boolean).join(' · ');

        const eyebrow = document.getElementById('hero-eyebrow');
        if (eyebrow) {
            eyebrow.textContent = term ? `ULAB ${term} Exam Routine` : 'ULAB Exam Routine';
        }

        // Stats chips
        const dateKeys = [...new Set(entries.map((e) => e.dateKey))].sort();
        const rooms = [...new Set(entries.map((e) => e.room).filter(Boolean))];

        const statsRow = document.getElementById('stats-row');
        if (statsRow) {
            statsRow.innerHTML = `
                <div class="stat-chip">
                    <span class="stat-icon">🧑‍🏫</span>
                    <div>
                        <div class="stat-label">Faculty</div>
                        <div class="stat-value">${esc(data.shortForm || '—')}</div>
                    </div>
                </div>
                <div class="stat-chip">
                    <span class="stat-icon">📝</span>
                    <div>
                        <div class="stat-label">Exam Slots</div>
                        <div class="stat-value">${entries.length}</div>
                    </div>
                </div>
                <div class="stat-chip">
                    <span class="stat-icon">📅</span>
                    <div>
                        <div class="stat-label">Exam Days</div>
                        <div class="stat-value">${dateKeys.length}</div>
                    </div>
                </div>
                <div class="stat-chip">
                    <span class="stat-icon">🚪</span>
                    <div>
                        <div class="stat-label">Rooms</div>
                        <div class="stat-value">${rooms.length}</div>
                    </div>
                </div>
                <div class="stat-chip">
                    <span class="stat-icon">📄</span>
                    <div>
                        <div class="stat-label">Source File</div>
                        <div class="stat-value" style="font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(data.sourceFile || '')}">
                            ${esc(data.sourceFile || '—')}
                        </div>
                    </div>
                </div>
            `;
        }

        // Action buttons
        const printBtn = document.getElementById('export-print-btn');
        if (printBtn) {
            printBtn.onclick = () => window.print();
        }

        const icsBtn = document.getElementById('export-ics-btn');
        if (icsBtn) {
            icsBtn.onclick = () => downloadIcs(entries, data);
        }

        // Time slot order preservation
        const timeOrder = {};
        entries.forEach((e, i) => {
            if (!(e.time in timeOrder)) timeOrder[e.time] = i;
        });

        // Group by date
        const byDate = {};
        entries.forEach((e) => {
            (byDate[e.dateKey] = byDate[e.dateKey] || []).push(e);
        });

        const slotLabels = ['1st slot', '2nd slot', '3rd slot', '4th slot', '5th slot'];

        let htmlContent = '';
        for (const dk of dateKeys) {
            const group = byDate[dk].sort(
                (a, b) => (timeOrder[a.time] ?? 999) - (timeOrder[b.time] ?? 999)
            );
            const firstEntry = group[0];
            const dateFormatted = firstEntry.dateFormatted || dk;

            htmlContent += `
                <div class="date-section">
                    <div class="date-header">
                        <span class="date-icon">📅</span>
                        <div class="date-text">
                            <div class="date-full">${esc(dateFormatted)}</div>
                        </div>
                        <span class="date-count">${group.length} exam${group.length > 1 ? 's' : ''}</span>
                    </div>
                    <div class="exam-list">
                        ${group.map((e, idx) => buildExamCard(e, idx, slotLabels)).join('')}
                    </div>
                </div>
            `;
        }

        content.innerHTML = htmlContent;
    }

    // ── Boot ──────────────────────────────────────────────────────────────
    initTheme();
    loadExamData(render);
})();
