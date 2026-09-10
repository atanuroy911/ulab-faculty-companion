// features/class-schedule/course-picker.js — a small square-tile grid
// picker for choosing a course (used by the "+" button in the counselling
// form), instead of a plain native <select> — same "pick a tile" feel as
// the clock time picker in features/class-schedule/time-picker.js.
(function () {
    let injected = false;
    function ensureStyles() {
        if (injected) return;
        injected = true;
        const style = document.createElement('style');
        style.textContent = `
            .cp-overlay { position: fixed; inset: 0; z-index: 700; background: rgba(8,12,22,0.72); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; opacity: 0; pointer-events: none; transition: opacity 0.15s ease; }
            .cp-overlay.open { opacity: 1; pointer-events: all; }
            .cp-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; width: 100%; max-width: 460px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 28px 64px -14px rgba(0,0,0,0.6); transform: translateY(10px) scale(0.97); transition: transform 0.15s ease; overflow: hidden; }
            .cp-overlay.open .cp-card { transform: translateY(0) scale(1); }
            .cp-header { padding: 16px 18px 12px; border-bottom: 1px solid var(--border); }
            .cp-title { font-size: 14px; font-weight: 800; color: var(--text); }
            .cp-subtitle { font-size: 11px; color: var(--muted); margin-top: 2px; }
            .cp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 16px 18px; overflow-y: auto; }
            .cp-tile { aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 8px; border-radius: 12px; border: 1.5px solid var(--border); background: var(--surface2); cursor: pointer; text-align: center; transition: border-color 0.12s, background 0.12s, transform 0.08s; }
            .cp-tile:hover { border-color: var(--accent2); background: var(--badge2-bg); transform: translateY(-1px); }
            .cp-tile.cp-selected { border-color: var(--accent); background: var(--accent); }
            .cp-tile.cp-selected .cp-tile-code, .cp-tile.cp-selected .cp-tile-title { color: #fff; }
            .cp-tile-code { font-size: 13px; font-weight: 800; color: var(--text); line-height: 1.2; }
            .cp-tile-title { font-size: 9.5px; color: var(--muted); line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
            .cp-empty { padding: 30px 18px; text-align: center; font-size: 12px; color: var(--muted); }
            .cp-footer { display: flex; justify-content: flex-end; padding: 10px 18px 16px; border-top: 1px solid var(--border); }
            .cp-footer button { font: inherit; font-size: 12.5px; font-weight: 700; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface2); color: var(--muted); cursor: pointer; }
            .cp-footer button:hover { color: var(--text); }

            /* Launcher button that replaces the native <select> */
            .consult-course-btn { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 12px; font-weight: 700; padding: 7px 11px; border-radius: 7px; border: 1.5px dashed var(--accent2); background: var(--surface); color: var(--text); cursor: pointer; text-align: left; }
            .consult-course-btn:hover { background: var(--badge2-bg); }
            .consult-course-btn.cp-unset { color: var(--accent2); font-weight: 700; }
            .consult-course-btn.cp-unset:hover { background: var(--accent2); color: #fff; border-style: solid; }
            .consult-course-btn .consult-subtitle { display: block; margin-top: 1px; }
        `;
        document.head.appendChild(style);
    }

    // opts: { courses: [{code,label}], selectedCode, onConfirm(code) }
    function open(opts) {
        ensureStyles();
        const overlay = document.createElement('div');
        overlay.className = 'cp-overlay';

        const tilesHtml = opts.courses.length
            ? opts.courses.map((c) => {
                const [code, ...rest] = c.label.split(' — ');
                const title = rest.join(' — ');
                const selected = c.code === opts.selectedCode;
                return `<button type="button" class="cp-tile${selected ? ' cp-selected' : ''}" data-code="${c.code}">
                    <span class="cp-tile-code">${code}</span>
                    ${title ? `<span class="cp-tile-title">${title}</span>` : ''}
                </button>`;
            }).join('')
            : `<div class="cp-empty">No courses found in this schedule.</div>`;

        overlay.innerHTML = `
            <div class="cp-card">
                <div class="cp-header">
                    <div class="cp-title">Choose a course</div>
                    <div class="cp-subtitle">From the courses in this schedule</div>
                </div>
                <div class="cp-grid">${tilesHtml}</div>
                <div class="cp-footer"><button type="button" class="cp-cancel">Cancel</button></div>
            </div>
        `;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('open'));

        function close() {
            overlay.classList.remove('open');
            setTimeout(() => overlay.remove(), 150);
        }

        overlay.querySelectorAll('.cp-tile').forEach((tile) => {
            tile.addEventListener('click', () => {
                const code = tile.dataset.code;
                close();
                opts.onConfirm(code);
            });
        });
        overlay.querySelector('.cp-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    }

    // Inject styles immediately (not lazily on first open) — the launcher
    // button that uses .consult-course-btn renders as soon as the form
    // does, well before any picker is actually opened.
    ensureStyles();

    window.ULABCoursePicker = { open };
})();
