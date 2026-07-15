// results.js — loaded inside results.html (chrome-extension page)
chrome.storage.local.get(['ulabResults', 'ulabStudents', 'ulabSchedules'], (data) => {
    if (!data.ulabResults) {
        document.body.innerHTML = `
            <div style="color:#94a3b8;text-align:center;margin-top:120px;font-family:system-ui">
                <div style="font-size:48px;margin-bottom:16px">📭</div>
                <div style="font-size:20px;font-weight:600;color:#e2e8f0;margin-bottom:8px">No results yet</div>
                <div>Go to the URMS Attendance page and click <strong style="color:#38bdf8">✨ Find Free Time</strong></div>
            </div>`;
        return;
    }

    const res       = data.ulabResults;
    const students  = data.ulabStudents  || [];
    const schedules = data.ulabSchedules || {};
    const DAY_ORDER = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
    const DAY_NAMES = { SUN:"Sunday", MON:"Monday", TUE:"Tuesday", WED:"Wednesday", THU:"Thursday", FRI:"Friday", SAT:"Saturday" };
    const nStudents = res.n_students;
    const thresholdPercent = res.threshold_percent || 50;

    // Update header stats
    document.getElementById('n-students-text').textContent = `${nStudents} Students Analyzed`;
    document.getElementById('threshold-text').innerHTML =
        `Free-time threshold: <strong>${thresholdPercent}%+ students free</strong>`;
    document.getElementById('stat-students').textContent = nStudents;
    document.getElementById('stat-maj').textContent      = `${thresholdPercent}%+`;


    // ── Format helpers ─────────────────────────────────────────
    function fmt(minutes) {
        if (minutes === undefined || minutes === null || isNaN(minutes)) return '?:??';
        const h24 = Math.floor(minutes / 60);
        const m   = minutes % 60;
        const ap  = h24 < 12 ? 'AM' : 'PM';
        const h12 = h24 % 12 || 12;
        return `${h12}:${String(m).padStart(2,'0')} ${ap}`;
    }

    function avatarColor(sid) {
        return `hsl(${parseInt(sid.slice(-3)) % 360},60%,45%)`;
    }
    function initials(name) {
        if (!name || name === 'Unknown Name') return '??';
        return name.split(' ').slice(0,2).map(w => w[0]?.toUpperCase() || '').join('');
    }

    // ── Build name map ─────────────────────────────────────────
    const nameMap = {};
    for (const s of students) nameMap[s.id] = s.name || '';

    // ── Build explain data (busy intervals per day) ─────────────
    const VALID_DAYS = new Set(DAY_ORDER);
    const explainData = {};
    for (const d of DAY_ORDER) explainData[d] = [];

    for (const s of students) {
        const sid  = s.id;
        const name = nameMap[sid] || 'Unknown';
        for (const text of (schedules[sid] || [])) {
            parseIntervals(text, (day, start, end) => {
                if (VALID_DAYS.has(day)) {
                    explainData[day].push({ sid, name, start, end, course: text });
                }
            });
        }
    }

    function parseIntervals(text, cb) {
        const dayRe  = /\b([A-Z]{3}(?:,[A-Z]{3})*)\b/g;
        const timeRe = /(\d{1,2}:\d{2})\s*([AP]M)\s*-\s*(\d{1,2}:\d{2})\s*([AP]M)/gi;
        const DAYS   = new Set(["SUN","MON","TUE","WED","THU","FRI","SAT"]);
        let dayHits  = [];
        let m;
        while ((m = dayRe.exec(text)) !== null) {
            const ds = m[1].split(',');
            if (ds.every(d => DAYS.has(d))) dayHits.push({ pos: m.index, days: ds });
        }
        while ((m = timeRe.exec(text)) !== null) {
            const toMin = (hm, ap) => {
                let [h, min] = hm.split(':').map(Number);
                if (ap.toUpperCase() === 'PM' && h !== 12) h += 12;
                if (ap.toUpperCase() === 'AM' && h === 12) h = 0;
                return h * 60 + min;
            };
            const start = toMin(m[1], m[2]), end = toMin(m[3], m[4]);
            let days = [];
            for (const dh of dayHits) { if (dh.pos < m.index) days = dh.days; }
            if (!days.length && dayHits.length) days = dayHits[0].days;
            for (const d of days) cb(d, start, end);
        }
    }

    // ── Day cards (free time grid) ─────────────────────────────
    function fmtSlotBadges(slots, filterFn, cls) {
        const matches = (slots || []).filter(filterFn);
        if (!matches.length) return `<span class="empty-label">No qualifying slots</span>`;
        return matches.map(s =>
            `<span class="${cls}" title="${s.freeCount}/${nStudents} free">${s.label}<span class="badge-sep">·</span>${fmt(s.start)}–${fmt(s.end)}</span>`
        ).join('');
    }

    const ftGrid = document.getElementById('ft-grid');
    for (const day of DAY_ORDER) {
        const daySlots = res.days[day] || [];
        const card = document.createElement('div');
        card.className = 'ft-card';
        card.innerHTML = `
            <div class="ft-day">
                <span>${day}</span>
                <button class="explain-btn" data-day="${day}">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd"/></svg>
                    Explain
                </button>
            </div>
            <div class="ft-section-label">100% free</div>
            <div>${fmtSlotBadges(daySlots, s => s.busyCount === 0, 'badge')}</div>
            <div class="ft-section-label">${thresholdPercent}%+ free</div>
            <div>${fmtSlotBadges(daySlots, s => s.isFree && s.busyCount !== 0, 'badge badge-maj')}</div>
        `;
        ftGrid.appendChild(card);
        card.querySelector('.explain-btn').addEventListener('click', () => openModal(day));
    }

    // ── Day-wise grouping for a student's schedule ──────────────
    function groupScheduleByDay(scheds) {
        const byDay = {};
        for (const d of DAY_ORDER) byDay[d] = [];
        for (const text of scheds) {
            parseIntervals(text, (day, start, end) => {
                byDay[day].push({ start, end, text });
            });
        }
        for (const d of DAY_ORDER) byDay[d].sort((a, b) => a.start - b.start);
        return byDay;
    }

    // Splits a raw scraped row ("0031-000-1113 Professional Skills 7 THU PD203  1:40PM- 3:00PM TBA")
    // into its course code / title / section / day(s) / room / time / instructor parts.
    function parseCourseRow(rowText) {
        const globalDayRegex = /\b([A-Z]{3}(?:,[A-Z]{3})*)\b/g;
        let dayMatch = null, m;
        while ((m = globalDayRegex.exec(rowText)) !== null) {
            const days = m[1].split(',');
            if (days.every(d => VALID_DAYS.has(d))) { dayMatch = m; break; }
        }
        const timeMatch = rowText.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
        if (!dayMatch || !timeMatch) return null;

        const codeMatch  = rowText.match(/^(\S+)\s+/);
        const codeEnd    = codeMatch ? codeMatch[0].length : 0;
        const courseCode = codeMatch ? codeMatch[1] : '';

        const beforeDay = rowText.slice(codeEnd, dayMatch.index).trim();
        const secMatch  = beforeDay.match(/(\d+)\s*$/);
        const section   = secMatch ? secMatch[1] : '';
        const title     = (secMatch ? beforeDay.slice(0, secMatch.index) : beforeDay).trim();

        const dayEnd  = dayMatch.index + dayMatch[0].length;
        const timeEnd = timeMatch.index + timeMatch[0].length;
        const room       = rowText.slice(dayEnd, timeMatch.index).trim();
        const instructor = rowText.slice(timeEnd).trim();

        return {
            courseCode, title, section,
            days: dayMatch[1].split(','),
            room,
            timeText: `${timeMatch[1].replace(/\s+/g, ' ')} – ${timeMatch[2].replace(/\s+/g, ' ')}`,
            instructor
        };
    }

    function courseRowHTML(rowText, idx, opts = {}) {
        const parsed = parseCourseRow(rowText);
        const shade  = idx % 2 === 0 ? 'odd-row' : 'even-row';
        if (!parsed) return `<div class="sched-row ${shade}">${rowText}</div>`;

        return `
            <div class="course-row ${shade}">
                <div class="course-row-top">
                    <span class="course-code">${parsed.courseCode}</span>
                    ${opts.hideDays ? '' : `<span class="course-days">${parsed.days.map(d => DAY_NAMES[d] ? DAY_NAMES[d].slice(0,3) : d).join(', ')}</span>`}
                </div>
                <div class="course-title">${parsed.title}</div>
                <div class="course-row-bottom">
                    <span class="course-time">🕐 ${parsed.timeText}</span>
                    ${parsed.room ? `<span class="course-room">📍 ${parsed.room}</span>` : ''}
                    ${parsed.instructor ? `<span class="course-instructor">${parsed.instructor}</span>` : ''}
                </div>
            </div>`;
    }

    function urmsOrderRowsHTML(scheds) {
        return scheds.map((t, i) => courseRowHTML(t, i)).join('') || `<div class="sched-empty">No schedule data found</div>`;
    }

    function dayWiseRowsHTML(scheds) {
        const byDay = groupScheduleByDay(scheds);
        const groups = DAY_ORDER
            .filter(d => byDay[d].length)
            .map(d => `
                <div class="sched-day-group">
                    <div class="sched-day-heading">${DAY_NAMES[d]}</div>
                    ${byDay[d].map((e, i) => courseRowHTML(e.text, i, { hideDays: true })).join('')}
                </div>
            `).join('');
        return groups || `<div class="sched-empty">No schedule data found</div>`;
    }

    let scheduleViewMode = 'urms'; // 'urms' | 'day'

    function buildRowsHTML(scheds) {
        return scheduleViewMode === 'day' ? dayWiseRowsHTML(scheds) : urmsOrderRowsHTML(scheds);
    }

    // ── Student schedule cards ─────────────────────────────────
    const grid = document.getElementById('students-grid');
    document.getElementById('view-toggle').addEventListener('click', () => {
        scheduleViewMode = scheduleViewMode === 'urms' ? 'day' : 'urms';
        document.getElementById('view-toggle').textContent =
            scheduleViewMode === 'day' ? '📋 URMS order' : '📅 Day-wise view';
        document.querySelectorAll('.student-card').forEach(card => {
            const sid = card.dataset.sid;
            const body = card.querySelector('.card-body');
            body.innerHTML = buildRowsHTML(schedules[sid] || []);
            if (card.classList.contains('open')) body.style.maxHeight = body.scrollHeight + 'px';
        });
    });

    for (const s of students) {
        const sid  = s.id;
        const name = nameMap[sid] || 'Unknown Name';
        const scheds = schedules[sid] || [];
        const col  = avatarColor(sid);
        const ini  = initials(name);
        const nc   = scheds.length;

        let rows = buildRowsHTML(scheds);

        const card = document.createElement('div');
        card.className = 'student-card';
        card.dataset.sid = sid;
        card.innerHTML = `
            <div class="card-header">
                <div class="avatar" style="background:${col}">${ini}</div>
                <div class="card-info">
                    <div class="card-id">${sid}</div>
                    <div class="card-name">${name}</div>
                </div>
                <div class="course-pill">${nc} course${nc !== 1 ? 's' : ''}</div>
                <svg class="chevron" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                    <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/>
                </svg>
            </div>
            <div class="card-body">${rows}</div>
        `;
        card.querySelector('.card-header').addEventListener('click', () => toggleCard(card));
        grid.appendChild(card);
    }

    // ── Card toggle ─────────────────────────────────────────────
    function toggleCard(el) {
        const body   = el.querySelector('.card-body');
        const isOpen = el.classList.contains('open');
        if (isOpen) {
            body.style.maxHeight = body.scrollHeight + 'px';
            requestAnimationFrame(() => { body.style.maxHeight = '0'; });
            el.classList.remove('open');
        } else {
            body.style.maxHeight = body.scrollHeight + 'px';
            el.classList.add('open');
            body.addEventListener('transitionend', function h() {
                body.style.maxHeight = '400px';
                body.removeEventListener('transitionend', h);
            });
        }
    }

    // ── Search ──────────────────────────────────────────────────
    document.getElementById('search').addEventListener('input', function() {
        const q = this.value.toLowerCase();
        document.querySelectorAll('.student-card').forEach(c => {
            const id   = c.querySelector('.card-id').textContent.toLowerCase();
            const name = c.querySelector('.card-name').textContent.toLowerCase();
            c.style.display = (id.includes(q) || name.includes(q)) ? '' : 'none';
        });
    });

    // ── Explain modal ────────────────────────────────────────────
    function openModal(day) {
        const busy     = explainData[day] || [];
        const daySlots = res.days[day]    || [];
        const freeSlots = daySlots.filter(s => s.isFree);

        document.getElementById('modal-title').textContent    = `${day} — Schedule Breakdown`;
        document.getElementById('modal-subtitle').textContent =
            `${nStudents} students · ${busy.length} busy entr${busy.length !== 1 ? 'ies' : 'y'} on this day`;

        let html = '';

        if (freeSlots.length) {
            html += '<div class="timeline-label">✅ Why these slots are free</div>';
            for (const s of freeSlots) {
                const label = s.busyCount === 0 ? 'Everyone Free' : `${thresholdPercent}%+ Free`;
                const note  = s.busyCount === 0
                    ? `All ${nStudents} students have no class during this period.`
                    : `${s.busyCount} student(s) busy; ${s.freeCount} are free (${Math.round(s.freeCount / nStudents * 100)}%).`;
                html += `<div class="free-slot-explain">
                    <div class="slot-time">${s.label} · ${fmt(s.start)} → ${fmt(s.end)} — ${label}</div>
                    <div class="slot-note">${note}</div>
                </div>`;
            }
        }

        if (busy.length) {
            html += '<div class="timeline-label">📚 Classes happening on this day</div>';
            const bySid = {};
            for (const b of busy) {
                if (!bySid[b.sid]) bySid[b.sid] = [];
                bySid[b.sid].push(b);
            }
            for (const sid of Object.keys(bySid)) {
                for (const b of bySid[sid]) {
                    const col = avatarColor(sid);
                    const ini = initials(b.name || 'Unknown');
                    html += `<div class="busy-entry">
                        <div class="busy-avatar" style="background:${col}">${ini}</div>
                        <div class="busy-info">
                            <div class="busy-name">${b.name || 'Unknown'} <span style="color:var(--muted);font-size:11px">${sid}</span></div>
                            <div class="busy-time">⏰ ${fmt(b.start)} – ${fmt(b.end)}</div>
                            <div class="busy-course" title="${b.course}">${b.course}</div>
                        </div>
                    </div>`;
                }
            }
        } else {
            html += '<div class="no-activity">No classes recorded for any student on this day.</div>';
        }

        document.getElementById('modal-body').innerHTML = html;
        document.getElementById('modal-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-overlay')) closeModal();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    function closeModal() {
        document.getElementById('modal-overlay').classList.remove('open');
        document.body.style.overflow = '';
    }

    // ── Theme toggle ─────────────────────────────────────────────
    const htmlEl = document.documentElement;
    const lbl    = document.getElementById('toggle-label');
    const saved  = localStorage.getItem('ulab-theme') || 'dark';
    applyTheme(saved);

    document.getElementById('theme-toggle').addEventListener('click', () => {
        applyTheme(htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    function applyTheme(t) {
        htmlEl.setAttribute('data-theme', t);
        localStorage.setItem('ulab-theme', t);
        lbl.textContent = t === 'dark' ? 'Light mode' : 'Dark mode';
    }
});
