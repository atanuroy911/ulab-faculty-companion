// features/class-schedule/consultation-schedule.js — data helpers for the
// "office-door schedule" export: class hours come straight from the parsed
// timetable and are treated as fixed (they're literally what's assigned —
// not something to freehand-edit); counselling hours are added by hand,
// one at a time, by picking a course the user actually teaches and a
// start/end time — no auto-guessed placement, since that turned out less
// useful than just letting the user place them deliberately.
(function () {
    const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Sat']; // no Friday
    const DAY_NAMES = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Sat: 'Saturday' };

    function formatMinutes(min) {
        let h24 = Math.floor(min / 60), m = min % 60;
        const ap = h24 < 12 ? 'AM' : 'PM';
        let h12 = h24 % 12; if (h12 === 0) h12 = 12;
        return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
    }
    function formatRange(start, end) { return `${formatMinutes(start)} - ${formatMinutes(end)}`; }

    // "14:05" (native <input type="time"> value) → minutes since midnight.
    function timeInputToMinutes(value) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(value || '');
        if (!m) return null;
        return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    }
    function minutesToTimeInput(min) {
        return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
    }

    // Same "try every loaded program catalogue" convention as
    // features/class-schedule/results.js's own resolveTitle — duplicated
    // (rather than shared) since that one lives inside results.js's private
    // scope and this module needs to stay usable on its own.
    function resolveTitle(code) {
        if (!code) return '';
        const catalogues = window.ULAB_CATALOGUES || {};
        for (const key of Object.keys(catalogues)) {
            const title = catalogues[key].titleFor(code);
            if (title) return title;
        }
        return '';
    }

    // Pulls code/section/room/lab-ness out of one entry using its original
    // raw cell text (most reliable — untouched by the cleanup that built
    // entry.course) for the code, and entry.course (teacher/tag already
    // stripped) for section + room.
    function parseEntryDetails(entry) {
        const codeMatch = entry.raw.match(/^([A-Za-z]{2,6})\s?(\d{3,5})/);
        const deptLetters = codeMatch ? codeMatch[1].toUpperCase() : '';
        const deptNum = codeMatch ? codeMatch[2] : '';
        const code = deptLetters + deptNum;
        const codeDisplay = codeMatch ? `${deptLetters} ${deptNum}` : (entry.course || '').split('-')[0].trim();

        const locMatch = entry.course.match(/P[A-D]\s?\d{2,3}/i);
        const room = locMatch ? locMatch[0].toUpperCase().replace(/\s+/, ' ') : 'TBA';
        const beforeLoc = locMatch ? entry.course.slice(0, locMatch.index) : entry.course;
        const parts = beforeLoc.split('-').map((s) => s.trim()).filter(Boolean);
        const sectionRaw = parts.length ? parts[parts.length - 1] : '';
        const isLab = /L\s*$/i.test(sectionRaw);
        const section = sectionRaw.replace(/L\s*$/i, '').trim() || '1';

        return { code, codeDisplay, section, isLab, room };
    }

    // Groups a day's time-sorted entries into contiguous same-course blocks
    // (e.g. a 2-slot lab shows as one block with two time lines, not two
    // separate rows) and attaches the parsed course details.
    function mergeDayEntries(dayEntries) {
        const sorted = dayEntries.slice().sort((a, b) => a.startMin - b.startMin);
        const blocks = [];
        for (const e of sorted) {
            const last = blocks[blocks.length - 1];
            // University slots have a short passing period between them
            // (e.g. 9:20 → 9:25) — treat anything within 10 minutes as
            // "contiguous" so a 2-slot lab merges into one block.
            if (last && last.course === e.course && e.startMin - last.endMin <= 10) {
                last.endMin = e.endMin;
                last.timeLines.push(e.time);
            } else {
                blocks.push({
                    course: e.course, startMin: e.startMin, endMin: e.endMin,
                    timeLines: [e.time], details: parseEntryDetails(e),
                });
            }
        }
        return blocks;
    }

    // { header, counsellingRoom, days: [{day, classBlocks, counselling}] }.
    // classBlocks are fixed (derived straight from the parsed schedule).
    // counselling is a slot PER ROW (one per class row, or one lone row on
    // a day with none), so every row gets its own independent "pick a
    // course" / "pick a time" pair right next to that row's class — no
    // separate add-entry step. Each slot is null until the user sets
    // something in it; a slot can have just a course, just a time, or both
    // (only "both" counts as a real entry once exported).
    function buildInitialData(sched) {
        const days = DAY_ORDER.map((day) => {
            const classBlocks = mergeDayEntries(sched.entries.filter((e) => e.day === day));
            const rowCount = Math.max(classBlocks.length, 1);
            return {
                day,
                classBlocks,
                counselling: Array.from({ length: rowCount }, () => null), // null | { code, codeDisplay, title, start, end }
            };
        });

        return {
            header: {
                name: sched.fullName || sched.shortForm || '',
                title: 'Lecturer',
                department: 'Department of Computer Science & Engineering',
                email: '',
                contact: '',
                photoDataUrl: '',
            },
            counsellingRoom: '',
            days,
        };
    }

    // Distinct courses across the whole week, for the "add counselling
    // hour" course picker — one option per course code, in first-seen
    // (i.e. weekday) order.
    function courseOptions(data) {
        const seen = new Set();
        const options = [];
        for (const d of data.days) {
            for (const b of d.classBlocks) {
                const { code, codeDisplay } = b.details;
                if (seen.has(code)) continue;
                seen.add(code);
                const title = resolveTitle(code);
                options.push({ code, label: title ? `${codeDisplay} — ${title}` : codeDisplay });
            }
        }
        return options;
    }

    window.ULAB_ConsultationSchedule = {
        DAY_ORDER, DAY_NAMES, buildInitialData, courseOptions, resolveTitle,
        formatRange, formatMinutes, timeInputToMinutes, minutesToTimeInput,
    };
})();
