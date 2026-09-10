// features/class-schedule/schedule-parser.js — parses a "Class Schedule"
// workbook (the university's per-semester routine sheet) generically: no
// hardcoded row/column numbers. It works the way a human reads the sheet —
// find the rows that look like a time header, figure out which day(s) that
// block covers from the label above/at that row, then scan every cell in
// the block for the requested teacher's short form and record where it
// shows up. The "who teaches under which short form" legend is discovered
// the same way — by scanning every cell for a "SHORT - Full Name" shape —
// rather than assumed to live at a fixed row range, so this keeps working
// if the university reshuffles the sheet next semester.
(function () {
    const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const DAY_NAME_RE = new RegExp(
        '\\b(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\\b',
        'gi'
    );
    const DAY_NAME_MAP = {
        sunday: 'Sun', sun: 'Sun',
        monday: 'Mon', mon: 'Mon',
        tuesday: 'Tue', tues: 'Tue', tue: 'Tue',
        wednesday: 'Wed', wed: 'Wed',
        thursday: 'Thu', thurs: 'Thu', thur: 'Thu', thu: 'Thu',
        friday: 'Fri', fri: 'Fri',
        saturday: 'Sat', sat: 'Sat',
    };
    // Single-letter/short tags used inside a trailing "(...)" note to pin a
    // course to just one of the block's two days (e.g. "(S)", "(T-for EEE)").
    const DAY_TAG_MAP = {
        s: 'Sun', sun: 'Sun', sunday: 'Sun',
        t: 'Tue', tue: 'Tue', tues: 'Tue', tuesday: 'Tue',
        m: 'Mon', mon: 'Mon', monday: 'Mon',
        w: 'Wed', wed: 'Wed', wednesday: 'Wed',
        thu: 'Thu', thurs: 'Thu', thursday: 'Thu',
        sat: 'Sat', saturday: 'Sat',
        f: 'Fri', fri: 'Fri', friday: 'Fri',
    };

    const TIME_CELL_RE = /\d{1,2}\s*[:.]\s*\d{1,3}[^a-zA-Z]{0,8}(am|pm)\b/i;

    function extractDayTokens(text) {
        if (!text) return [];
        const found = [];
        let m;
        DAY_NAME_RE.lastIndex = 0;
        while ((m = DAY_NAME_RE.exec(text))) {
            const day = DAY_NAME_MAP[m[1].toLowerCase()];
            if (day && !found.includes(day)) found.push(day);
        }
        return found;
    }

    function extractDayOverride(tagText) {
        if (!tagText) return null;
        const tokens = tagText.split(/[,/-]/);
        for (const raw of tokens) {
            const tok = raw.trim().toLowerCase();
            if (DAY_TAG_MAP[tok]) return DAY_TAG_MAP[tok];
        }
        return null;
    }

    // Rough sort key so slots print chronologically even though we never
    // fully parse the time strings for anything else. Assumes the
    // university's normal 8am-8pm teaching day: bare hours 1-7 are PM,
    // 8-11 are AM, 12 is noon.
    function parseStartMinutes(label) {
        if (!label) return 99999;
        const m = label.match(/(\d{1,2})\s*[:.]\s*(\d{1,2})/);
        if (!m) return 99999;
        let hour = parseInt(m[1], 10);
        const min = parseInt(m[2], 10) || 0;
        if (hour === 12) hour = 12;
        else if (hour >= 1 && hour <= 7) hour += 12;
        return hour * 60 + min;
    }

    // Heuristic meridiem for a bare hour when no am/pm marker sits next to
    // it in the label (see parseTimeRange below) — same assumption as
    // parseStartMinutes: the teaching day runs roughly 8am-8pm, so 8-11 is
    // AM, 12 is noon (PM), and 1-7 is PM.
    function heuristicMeridiem(hour) {
        if (hour === 12) return 'pm';
        return hour >= 8 ? 'am' : 'pm';
    }

    function toMinutes(hour, minute, meridiem) {
        let h = hour % 12;
        if (meridiem === 'pm') h += 12;
        return h * 60 + minute;
    }

    // Parses a slot label like "8:00 - 9:20 am" or the sheet's messier
    // "12:15 : 1 : 35 pm" / "1 : 40 : 3:00 pm" variants into actual
    // start/end minutes-since-midnight, for building calendar events.
    // Returns null if the label doesn't contain two recognizable times.
    function parseTimeRange(label) {
        if (!label) return null;
        const times = [...label.matchAll(/(\d{1,2})\s*[:.]\s*(\d{1,2})/g)].map((m) => ({ h: +m[1], m: +m[2] }));
        if (times.length < 2) return null;
        const [t1, t2] = times;
        const markers = [...label.matchAll(/\b(am|pm)\b/gi)].map((m) => m[1].toLowerCase());

        let mer1, mer2;
        if (markers.length >= 2) { mer1 = markers[0]; mer2 = markers[1]; }
        else if (markers.length === 1) { mer2 = markers[0]; mer1 = heuristicMeridiem(t1.h); }
        else { mer1 = heuristicMeridiem(t1.h); mer2 = heuristicMeridiem(t2.h); }

        return { start: toMinutes(t1.h, t1.m, mer1), end: toMinutes(t2.h, t2.m, mer2) };
    }

    function isTimeHeaderRow(row) {
        if (!row) return false;
        let hits = 0;
        for (let c = 1; c < row.length; c++) {
            if (TIME_CELL_RE.test(String(row[c] || ''))) hits++;
        }
        return hits >= 2;
    }

    function cellText(row, c) {
        if (!row) return '';
        const v = row[c];
        return v === undefined || v === null ? '' : String(v).trim();
    }

    // ── Legend discovery: any cell shaped "SHORT - Full Name" anywhere in
    // the sheet, where SHORT has no digits/slashes (so it can't be a course
    // code cell like "STA 2101 / 0542... - 2 - PB 205 - ASR"). ──────────────
    const LEGEND_RE = /^([A-Za-z][A-Za-z .]{0,11})\s*-\s*([A-Za-z].{2,80})$/;

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
                    const full = m[2].trim();
                    if (!short || !full) continue;
                    if (/\d/.test(short)) continue;
                    shortToFull[short.toLowerCase()] = { short, full };
                    fullToShort[full.toLowerCase()] = short;
                }
            }
        }
        return { shortToFull, fullToShort };
    }

    // Resolve whatever the user typed (short form OR full name) into the
    // literal short-form token that actually appears in schedule cells.
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
        // Partial full-name match (e.g. user typed just a first name).
        for (const fullLower of Object.keys(legend.fullToShort)) {
            if (fullLower.includes(qLower)) {
                const short = legend.fullToShort[fullLower];
                return { short, fullName: legend.shortToFull[short.toLowerCase()]?.full || q };
            }
        }
        return { short: q, fullName: '' };
    }

    // ── Main scan: walk every row, track the current time-block, and pull
    // out every cell whose teacher segment matches the resolved short form.
    function scanSheetForTeacher(rows, shortForm) {
        const entries = [];
        const shortLower = shortForm.toLowerCase();
        let header = null; // { rowIdx, times: {col: label}, days: [..] }
        let blankRun = 0;

        for (let r = 0; r < rows.length; r++) {
            const row = rows[r] || [];
            const rowIsEmpty = row.every((v) => !String(v || '').trim());
            if (rowIsEmpty) {
                blankRun++;
                if (blankRun >= 2) header = null; // end of block
                continue;
            }
            blankRun = 0;

            if (isTimeHeaderRow(row)) {
                const times = {};
                for (let c = 1; c < row.length; c++) {
                    const t = cellText(row, c);
                    if (t) times[c] = t;
                }
                const nextRow = rows[r + 1] || [];
                const dayLabel = cellText(row, 0) + ' ' + cellText(nextRow, 0);
                const days = extractDayTokens(dayLabel);
                header = { rowIdx: r, times, days: days.length ? days : DAY_ORDER.slice() };
                continue;
            }

            if (!header) continue; // stray text above the first header

            for (let c = 1; c < row.length; c++) {
                const raw = cellText(row, c);
                if (!raw) continue;
                // A real class cell always carries a digit somewhere (course
                // number, section, or room number) — this also keeps a
                // legend cell like "ASR - Atanu Shuvam Roy" from ever being
                // mistaken for a class of ASR's, without relying on exactly
                // where the legend happens to sit in the sheet.
                if (!/\d/.test(raw)) continue;

                const tagMatch = /\(([^)]*)\)\s*$/.exec(raw);
                const tagText = tagMatch ? tagMatch[1] : '';
                const remainder = tagMatch ? raw.slice(0, tagMatch.index).trim() : raw;
                const dayOverride = extractDayOverride(tagText);

                const segments = remainder.split('-').map((s) => s.trim());
                let matchIdx = -1;
                for (let i = segments.length - 1; i >= 0; i--) {
                    const seg = segments[i];
                    if (!seg || !/^[A-Za-z][A-Za-z .]*$/.test(seg)) continue;
                    if (seg.toLowerCase() === shortLower) { matchIdx = i; break; }
                }
                if (matchIdx <= 0) continue;

                const course = segments.slice(0, matchIdx).join(' - ').replace(/\s*\/\s*$/, '').trim();
                const timeLabel = header.times[c] || 'Time TBA';
                const days = dayOverride ? [dayOverride] : header.days;
                const range = parseTimeRange(timeLabel);

                for (const day of days) {
                    entries.push({
                        day,
                        time: timeLabel,
                        course: course || raw,
                        raw,
                        sortKey: parseStartMinutes(timeLabel),
                        startMin: range ? range.start : null,
                        endMin: range ? range.end : null,
                    });
                }
            }
        }
        return entries;
    }

    function parseWorkbookForTeacher(workbook, query) {
        const sheets = workbook.SheetNames.map((name) =>
            XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: '' })
        );

        const legend = buildLegend(sheets);
        const resolved = resolveQuery(query, legend);

        const entries = [];
        for (const rows of sheets) {
            entries.push(...scanSheetForTeacher(rows, resolved.short));
        }

        // Dedupe identical (day, time, course) hits (can legitimately happen
        // if the same short form appears twice pointing at the same class).
        const seen = new Set();
        const deduped = entries.filter((e) => {
            const key = e.day + '|' + e.time + '|' + e.course;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        deduped.sort((a, b) => {
            const da = DAY_ORDER.indexOf(a.day), db = DAY_ORDER.indexOf(b.day);
            if (da !== db) return da - db;
            return a.sortKey - b.sortKey;
        });

        return {
            shortForm: resolved.short,
            fullName: resolved.fullName,
            entries: deduped,
        };
    }

    window.ULAB_ScheduleParser = { parseWorkbookForTeacher, parseTimeRange, DAY_ORDER };
})();
