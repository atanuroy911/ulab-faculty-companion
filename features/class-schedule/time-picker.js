// features/class-schedule/time-picker.js — a small, self-contained analog
// clock time picker (hour ring → minute ring → AM/PM), the way most phone
// clock/timer apps do it, used in place of the browser's native
// <input type="time"> for the counselling-hour start/end pickers.
(function () {
    let injected = false;
    function ensureStyles() {
        if (injected) return;
        injected = true;
        const style = document.createElement('style');
        style.textContent = `
            .tp-overlay { position: fixed; inset: 0; z-index: 700; background: rgba(8,12,22,0.72); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; opacity: 0; pointer-events: none; transition: opacity 0.15s ease; }
            .tp-overlay.open { opacity: 1; pointer-events: all; }
            .tp-card { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; width: 272px; box-shadow: 0 28px 64px -14px rgba(0,0,0,0.6); transform: translateY(10px) scale(0.97); transition: transform 0.15s ease; overflow: hidden; }
            .tp-overlay.open .tp-card { transform: translateY(0) scale(1); }
            .tp-header { background: linear-gradient(135deg, var(--accent), var(--accent2)); padding: 14px 20px 18px; }
            .tp-title { text-align: center; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,0.85); margin-bottom: 8px; }
            .tp-header-row { display: flex; align-items: center; justify-content: center; gap: 10px; }
            .tp-digital { display: flex; align-items: baseline; gap: 3px; font-size: 34px; font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; }
            .tp-digital button { background: none; border: none; color: rgba(255,255,255,0.55); font: inherit; font-size: inherit; font-weight: inherit; cursor: pointer; padding: 2px 4px; border-radius: 6px; }
            .tp-digital button.tp-active { color: #fff; background: rgba(255,255,255,0.18); }
            .tp-digital .tp-colon { color: rgba(255,255,255,0.7); }
            .tp-ampm { display: flex; flex-direction: column; gap: 3px; margin-left: 6px; }
            .tp-ampm button { font-size: 10px; font-weight: 700; padding: 3px 7px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.4); background: transparent; color: rgba(255,255,255,0.75); cursor: pointer; }
            .tp-ampm button.tp-active { background: #fff; color: var(--accent); border-color: #fff; }
            .tp-face-wrap { padding: 22px 20px 8px; display: flex; align-items: center; justify-content: center; }
            .tp-face { width: 216px; height: 216px; user-select: none; touch-action: none; cursor: pointer; }
            .tp-face circle.tp-face-bg { fill: var(--surface2); }
            .tp-face circle.tp-center-dot { fill: var(--accent); }
            .tp-face line.tp-hand { stroke: var(--accent); stroke-width: 2.5; stroke-linecap: round; }
            .tp-face circle.tp-hand-end { fill: var(--accent); }
            .tp-face circle.tp-hand-end-ring { fill: var(--surface); stroke: var(--accent); stroke-width: 2; }
            .tp-face text { fill: var(--text); font-size: 15px; font-weight: 600; text-anchor: middle; dominant-baseline: central; pointer-events: none; }
            .tp-face text.tp-selected { fill: #fff; font-weight: 800; }
            .tp-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px 18px; }
            .tp-footer button { font: inherit; font-size: 12.5px; font-weight: 700; padding: 8px 14px; border-radius: 8px; border: none; cursor: pointer; }
            .tp-btn-cancel { background: var(--surface2); color: var(--muted); border: 1px solid var(--border) !important; }
            .tp-btn-cancel:hover { color: var(--text); }
            .tp-btn-ok { background: var(--accent); color: #fff; }
            .tp-btn-ok:hover { opacity: 0.9; }

            /* The launcher buttons that replace native <input type="time"> */
            .consult-time-btn { display: inline-flex; align-items: center; gap: 5px; font: inherit; font-size: 12px; font-weight: 700; padding: 6px 10px; border-radius: 7px; border: 1.5px dashed var(--accent2); background: var(--surface); color: var(--text); cursor: pointer; }
            .consult-time-btn:hover { background: var(--badge2-bg); }
            .consult-time-btn.tp-unset { color: var(--accent2); font-weight: 700; }
            .consult-time-btn.tp-unset:hover { background: var(--accent2); color: #fff; border-style: solid; }
        `;
        document.head.appendChild(style);
    }

    function pad2(n) { return String(n).padStart(2, '0'); }
    function to12(h24) { const h = h24 % 12; return h === 0 ? 12 : h; }

    // opts: { initialMinutes: number|null, onConfirm(minutes) }
    function open(opts) {
        ensureStyles();

        let hour24 = opts.initialMinutes != null ? Math.floor(opts.initialMinutes / 60) : 9;
        let minute = opts.initialMinutes != null ? opts.initialMinutes % 60 : 0;
        let mode = 'hour'; // 'hour' | 'minute'

        const overlay = document.createElement('div');
        overlay.className = 'tp-overlay';
        overlay.innerHTML = `
            <div class="tp-card">
                <div class="tp-header">
                    ${opts.title ? `<div class="tp-title">${opts.title}</div>` : ''}
                    <div class="tp-header-row">
                        <div class="tp-digital">
                            <button type="button" data-mode="hour" class="tp-hour-btn"></button>
                            <span class="tp-colon">:</span>
                            <button type="button" data-mode="minute" class="tp-minute-btn"></button>
                        </div>
                        <div class="tp-ampm">
                            <button type="button" data-ampm="AM" class="tp-am-btn">AM</button>
                            <button type="button" data-ampm="PM" class="tp-pm-btn">PM</button>
                        </div>
                    </div>
                </div>
                <div class="tp-face-wrap">
                    <svg class="tp-face" viewBox="0 0 200 200"></svg>
                </div>
                <div class="tp-footer">
                    <button type="button" class="tp-btn-cancel">Cancel</button>
                    <button type="button" class="tp-btn-ok">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('open'));

        const svg = overlay.querySelector('.tp-face');
        const hourBtn = overlay.querySelector('.tp-hour-btn');
        const minuteBtn = overlay.querySelector('.tp-minute-btn');
        const amBtn = overlay.querySelector('.tp-am-btn');
        const pmBtn = overlay.querySelector('.tp-pm-btn');

        function close() {
            overlay.classList.remove('open');
            setTimeout(() => overlay.remove(), 150);
        }

        function updateDigital() {
            hourBtn.textContent = to12(hour24);
            minuteBtn.textContent = pad2(minute);
            hourBtn.classList.toggle('tp-active', mode === 'hour');
            minuteBtn.classList.toggle('tp-active', mode === 'minute');
            amBtn.classList.toggle('tp-active', hour24 < 12);
            pmBtn.classList.toggle('tp-active', hour24 >= 12);
        }

        const NS = 'http://www.w3.org/2000/svg';
        function el(tag, attrs) {
            const e = document.createElementNS(NS, tag);
            for (const k in attrs) e.setAttribute(k, attrs[k]);
            return e;
        }

        function drawFace() {
            svg.innerHTML = '';
            svg.appendChild(el('circle', { class: 'tp-face-bg', cx: 100, cy: 100, r: 92 }));

            const values = mode === 'hour'
                ? Array.from({ length: 12 }, (_, i) => (i === 0 ? 12 : i))
                : Array.from({ length: 12 }, (_, i) => i * 5);
            const selectedValue = mode === 'hour' ? to12(hour24) : (Math.round(minute / 5) * 5) % 60;

            values.forEach((val, i) => {
                const deg = i * 30 - 90;
                const rad = deg * Math.PI / 180;
                const r = 74;
                const x = 100 + r * Math.cos(rad), y = 100 + r * Math.sin(rad);
                const isSelected = mode === 'hour' ? val === to12(hour24) : val === selectedValue && (minute % 5 === 0);
                const t = el('text', { x, y, class: isSelected ? 'tp-selected' : '' });
                t.textContent = mode === 'minute' ? pad2(val) : String(val);
                svg.appendChild(t);
            });

            // Hand — points at the exact current value (continuous for
            // minutes, so dragging feels smooth even between the labels).
            const handDeg = mode === 'hour' ? (to12(hour24) % 12) * 30 - 90 : minute * 6 - 90;
            const handRad = handDeg * Math.PI / 180;
            const handLen = 62;
            const hx = 100 + handLen * Math.cos(handRad), hy = 100 + handLen * Math.sin(handRad);
            svg.appendChild(el('line', { class: 'tp-hand', x1: 100, y1: 100, x2: hx, y2: hy }));
            svg.appendChild(el('circle', { class: 'tp-hand-end-ring', cx: hx, cy: hy, r: 15 }));
            svg.appendChild(el('circle', { class: 'tp-center-dot', cx: 100, cy: 100, r: 4 }));
        }

        function angleToValue(clientX, clientY) {
            const rect = svg.getBoundingClientRect();
            const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
            const dx = clientX - cx, dy = clientY - cy;
            let deg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
            if (deg < 0) deg += 360;
            if (mode === 'hour') {
                let h = Math.round(deg / 30) % 12;
                if (h === 0) h = 12;
                return h;
            }
            let m = Math.round(deg / 6) % 60;
            if (m < 0) m += 60;
            return m;
        }

        function applyValue(val) {
            if (mode === 'hour') {
                const isPM = hour24 >= 12;
                hour24 = (val % 12) + (isPM ? 12 : 0);
            } else {
                minute = val;
            }
            updateDigital();
            drawFace();
        }

        let dragging = false;
        function pointerDown(e) {
            dragging = true;
            applyValue(angleToValue(e.clientX, e.clientY));
        }
        function pointerMove(e) {
            if (!dragging) return;
            applyValue(angleToValue(e.clientX, e.clientY));
        }
        function pointerUp() {
            if (!dragging) return;
            dragging = false;
            if (mode === 'hour') { mode = 'minute'; updateDigital(); drawFace(); }
        }
        svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture(e.pointerId); pointerDown(e); });
        svg.addEventListener('pointermove', pointerMove);
        svg.addEventListener('pointerup', pointerUp);

        hourBtn.addEventListener('click', () => { mode = 'hour'; updateDigital(); drawFace(); });
        minuteBtn.addEventListener('click', () => { mode = 'minute'; updateDigital(); drawFace(); });
        amBtn.addEventListener('click', () => { if (hour24 >= 12) hour24 -= 12; updateDigital(); drawFace(); });
        pmBtn.addEventListener('click', () => { if (hour24 < 12) hour24 += 12; updateDigital(); drawFace(); });

        overlay.querySelector('.tp-btn-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('.tp-btn-ok').addEventListener('click', () => {
            const totalMinutes = hour24 * 60 + minute;
            close();
            opts.onConfirm(totalMinutes);
        });

        updateDigital();
        drawFace();
    }

    // Inject styles immediately (not lazily on first open) — the launcher
    // buttons that use .consult-time-btn render as soon as the form does,
    // well before any picker is actually opened.
    ensureStyles();

    window.ULABTimePicker = { open };
})();
