// features/exam-routine/exam-parser.js — parses ULAB exam schedule xlsx files.
// The format differs from the class schedule:
//   • Row 0/1: Title rows (ignored)
//   • Row 2 (first data row with time-range headers): time slots in cols 1..N
//   • Row 3+ (exam rows): col 0 = "Day\nDD/MM/YYYY" (may span several rows),
//     cols 1..N = individual exam cells like:
//     "COURSE CODE / reg - section - ROOM - FACULTY_INITIALS"
//   • After a blank separator, the next day block starts.
//   • Toward the end: a legend section "Faculty Members" with rows of
//     "SHORT - Full Name" entries.
//
// The parser discovers everything heuristically — no hard-coded row numbers.
(function () {

    // ── Regex helpers ────────────────────────────────────────────────────
    const TIME_CELL_RE = /\d{1,2}\s*[:.]?\s*\d{0,2}\s*(am|pm)\b/i;

    // Date patterns inside a cell, e.g. "27/10/2026" or "27-10-2026"
    const DATE_CELL_RE = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;

    // Legend rows: "SHORT - Full Name"  (same heuristic as schedule-parser)
    const LEGEND_RE = /^([A-Za-z][A-Za-z .]{0,14})\s*-\s*([A-Za-z].{2,80})$/;

    function cellText(row, c) {
        if (!row) return '';
        const v = row[c];
        return v === undefined || v === null ? '' : String(v).trim();
    }

    // Is a row a time-header row? ≥2 cells that look like time ranges.
    function isTimeHeaderRow(row) {
        if (!row) return false;
        let hits = 0;
        for (let c = 1; c < row.length; c++) {
            if (TIME_CELL_RE.test(String(row[c] || ''))) hits++;
        }
        return hits >= 2;
    }

    // ── Legend discovery ─────────────────────────────────────────────────
    function buildLegend(sheets) {
        const shortToFull = {};
        const fullToShort = {};
        for (const rows of sheets) {
            for (const row of rows) {
                for (let c = 0; c < row.length; c++) {
                    const text = cellText(row, c);
                    if (!text || text.length > 90) continue;
                    const m = LEGEND_RE.exec(text);
                    if (!m) continue;
                    const short = m[1].trim();
                    const full  = m[2].trim();
                    if (!short || !full) continue;
                    if (/\d/.test(short)) continue;   // skip course-code-like tokens
                    shortToFull[short.toLowerCase()] = { short, full };
                    fullToShort[full.toLowerCase()] = short;
                }
            }
        }
        return { shortToFull, fullToShort };
    }

    // Resolve whatever the user typed (short form OR full name) to the
    // canonical short token that appears in exam cells.
    function resolveQuery(input, legend) {
        const q = (input || '').trim();
        if (!q) return { short: '', fullName: '' };
        const qLower = q.toLowerCase();

        if (legend.shortToFull[qLower]) {
            const entry = legend.shortToFull[qLower];
            return { short: entry.short, fullName: entry.full };
        }
        if (legend.fullToShort[qLower]) {
            const short = legend.fullToShort[qLower];
            return { short, fullName: legend.shortToFull[short.toLowerCase()]?.full || q };
        }
        // Partial full-name match
        for (const fullLower of Object.keys(legend.fullToShort)) {
            if (fullLower.includes(qLower)) {
                const short = legend.fullToShort[fullLower];
                return { short, fullName: legend.shortToFull[short.toLowerCase()]?.full || q };
            }
        }
        return { short: q, fullName: '' };
    }

    // ── Parse a date string like "27/10/2026" → Date or null ────────────
    function parseDate(raw) {
        const m = DATE_CELL_RE.exec(raw || '');
        if (!m) return null;
        // Format in the sheet is DD/MM/YYYY
        const day = parseInt(m[1], 10);
        const mon = parseInt(m[2], 10) - 1;
        const yr  = parseInt(m[3], 10);
        const d = new Date(yr, mon, day);
        return isNaN(d.getTime()) ? null : d;
    }

    // Format a Date → "Tuesday, 27 Oct 2026"
    function formatDate(d) {
        if (!d) return 'Date TBA';
        return d.toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'short', year: 'numeric'
        });
    }

    // Short date key for grouping: "2026-10-27"
    function dateKey(d) {
        if (!d) return 'unknown';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // ── Scan a single sheet for a teacher's exams ────────────────────────
    function scanSheetForTeacher(rows, shortForm) {
        const shortLower = shortForm.toLowerCase();
        const results = [];

        let headerTimes = null;   // { col: timeLabel }
        let currentDay = null;    // { label, date, dateKey, dateObj }
        let inLegend = false;

        for (let r = 0; r < rows.length; r++) {
            const row = rows[r] || [];
            const rowStr = row.map(v => String(v || '').trim()).join(' ');

            // Detect "Faculty Members" legend section start — stop scanning exams
            if (/faculty\s*members/i.test(rowStr)) {
                inLegend = true;
                continue;
            }
            if (inLegend) continue;

            // Time header row → extract column → time-label map
            if (isTimeHeaderRow(row)) {
                headerTimes = {};
                for (let c = 1; c < row.length; c++) {
                    const t = cellText(row, c);
                    if (t) headerTimes[c] = t;
                }
                // The day info for this block is in col 0 of this row (or next)
                const dayRaw = cellText(row, 0);
                const nextDayRaw = rows[r + 1] ? cellText(rows[r + 1], 0) : '';
                const combined = dayRaw + ' ' + nextDayRaw;
                const dateObj = parseDate(combined) || parseDate(dayRaw) || parseDate(nextDayRaw);
                const label = (dayRaw + (nextDayRaw ? '\n' + nextDayRaw : '')).trim();
                currentDay = {
                    label,
                    date: dateObj,
                    dateKey: dateKey(dateObj),
                    formatted: formatDate(dateObj),
                };
                continue;
            }

            if (!headerTimes) continue;  // haven't seen first header yet

            // Check if col 0 has a new day/date (continuation rows still have col 0 empty)
            const col0 = cellText(row, 0);
            if (col0) {
                // Try to detect a new day in col0 (day name + date, possibly multi-line)
                const dateObj = parseDate(col0);
                if (dateObj || /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|sun|mon|tue|wed|thu|fri|sat)\b/i.test(col0)) {
                    // This is a new day block starting here (without a time-header above)
                    const d = dateObj || currentDay?.date;
                    currentDay = {
                        label: col0,
                        date: d,
                        dateKey: dateKey(d),
                        formatted: formatDate(d),
                    };
                }
            }

            // Scan each data column for this teacher's short form
            for (const [colStr, timeLabel] of Object.entries(headerTimes)) {
                const c = parseInt(colStr, 10);
                const raw = cellText(row, c);
                if (!raw) continue;
                // Must have at least one digit (course number, section, room)
                if (!/\d/.test(raw)) continue;

                // Parse the cell: segments separated by " - "
                // Typical: "CSE 4417 - 1 - PD 207 - ASR"
                // or       "CSE 4417 / 0613-014-4417 - 1 - PA 201 - FK"
                const segments = raw.split('-').map(s => s.trim());

                // Find the teacher short form — it's the last name-like segment
                let matchIdx = -1;
                for (let i = segments.length - 1; i >= 0; i--) {
                    const seg = segments[i];
                    if (/^[A-Za-z][A-Za-z .]*$/.test(seg) && seg === seg) {
                        if (seg.toLowerCase() === shortLower) {
                            matchIdx = i;
                            break;
                        }
                    }
                }
                if (matchIdx < 0) continue;

                // Reconstruct course text (everything before the last dash-separated
                // teacher token, minus trailing section/room clutter).
                // More precisely: everything before the first purely-numeric-or-room segment
                // that comes after the course code.
                const courseRaw = segments.slice(0, matchIdx).join(' - ').trim();

                // Extract room: typically the segment just before the teacher initial
                // that looks like a room code (e.g. "PD 207", "PA 201", "PC 204")
                let room = '';
                for (let i = matchIdx - 1; i >= 0; i--) {
                    const seg = segments[i];
                    if (/^[A-Z]{1,3}\s*\d{3,}$/i.test(seg.trim())) {
                        room = seg.trim();
                        break;
                    }
                }

                // Extract section: typically a short pure-digit or digit+letter segment
                let section = '';
                for (let i = 1; i < matchIdx; i++) {
                    const seg = segments[i].trim();
                    if (/^\d{1,2}[A-Za-z]?$/.test(seg)) {
                        section = seg;
                        break;
                    }
                }

                // Course code/name: first segment (may include " / reg-no" part)
                const courseCode = segments[0].split('/')[0].trim();

                results.push({
                    dateObj: currentDay?.date || null,
                    dateKey: currentDay?.dateKey || 'unknown',
                    dateFormatted: currentDay?.formatted || 'Date TBA',
                    time: timeLabel,
                    course: courseCode,
                    section,
                    room,
                    raw,
                });
            }
        }

        return results;
    }

    // ── Main entry point ─────────────────────────────────────────────────
    function parseWorkbookForTeacher(workbook, query) {
        const sheets = workbook.SheetNames.map(name =>
            XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: '' })
        );

        const legend = buildLegend(sheets);
        const resolved = resolveQuery(query, legend);

        const allResults = [];
        for (const rows of sheets) {
            allResults.push(...scanSheetForTeacher(rows, resolved.short));
        }

        // Deduplicate
        const seen = new Set();
        const deduped = allResults.filter(e => {
            const key = e.dateKey + '|' + e.time + '|' + e.course + '|' + e.section;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Sort by date, then time slot order (as it appears in col order)
        deduped.sort((a, b) => {
            if (a.dateKey < b.dateKey) return -1;
            if (a.dateKey > b.dateKey) return 1;
            return 0;
        });

        return {
            shortForm: resolved.short,
            fullName: resolved.fullName,
            entries: deduped,
        };
    }

    // Detect exam type and semester from filename
    // e.g. "UG Mid term Exam Schedule For Fall 2026 - 11-10-2026.xlsx"
    function detectMetaFromFilename(name) {
        if (!name) return null;
        const semMatch = name.match(/\b(spring|summer|fall)\b/i);
        const yearMatch = name.match(/\b(20\d{2})\b/);
        const midMatch = /mid[\s-]?term/i.test(name);
        const finalMatch = /final/i.test(name);
        if (!semMatch && !yearMatch) return null;
        return {
            semester: semMatch ? semMatch[1][0].toUpperCase() + semMatch[1].slice(1).toLowerCase() : null,
            year: yearMatch ? parseInt(yearMatch[1], 10) : null,
            examType: midMatch ? 'Midterm' : finalMatch ? 'Final' : 'Exam',
        };
    }

    window.ULAB_ExamParser = {
        parseWorkbookForTeacher,
        detectMetaFromFilename,
    };
})();
