// features/login/login-ui-content.js — content script injected into the
// URMS Login page. Draws a modern split-screen layout OVER the stock
// Bootstrap login card without ever touching the real <form> (inputs, ids,
// anti-forgery token stay exactly where ASP.NET put them). The modern layer
// uses its own input elements that mirror values into the real ones and
// submit the real form on click, so toggling the look off just hides the
// overlay — the original card is always intact underneath. A small floating
// toggle lets a user opt in/out, remembered via chrome.storage.local so the
// choice persists across visits. Light mode only, by design.
(function () {
    const STORAGE_KEY = 'ulabModernUI';
    const STYLE_ID = 'ulab-modern-login-css';
    const SHELL_ID = 'ulab-login-shell';
    const TOGGLE_ID = 'ulab-modern-login-toggle';
    const CLOAK_ID = 'ulab-cloak-style';

    // Runs at document_start, before the browser has painted anything, so we
    // can hide the page instantly and reveal it only once we've decided
    // (synchronously-feeling, a few ms later) whether to show the stock card
    // or the modern one — avoids the old-UI-then-swap flash entirely.
    function cloak() {
        const s = document.createElement('style');
        s.id = CLOAK_ID;
        s.textContent = 'html.ulab-cloak { visibility: hidden !important; }';
        (document.head || document.documentElement).appendChild(s);
        document.documentElement.classList.add('ulab-cloak');
        // Safety net: never leave the page permanently blank if something
        // above throws or storage never responds.
        setTimeout(uncloak, 1500);
    }
    function uncloak() {
        document.documentElement.classList.remove('ulab-cloak');
    }

    const ICONS = {
        user: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        lock: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
        eye: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>',
        eyeOff: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>',
        arrow: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
    };

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            body.ulab-modern-login { background: #f4f6fb; }
            body.ulab-modern-login header, body.ulab-modern-login footer, body.ulab-modern-login > .container {
                display: none !important;
            }
            body.ulab-modern-login #${SHELL_ID} { display: grid; }
            /* The real form stays in the DOM untouched; just keep it out of
               sight (not display:none, so validation/layout still compute
               and .submit()/.click() on it work exactly as before). */
            body.ulab-modern-login .login-container {
                position: absolute !important;
                left: -9999px !important;
                top: -9999px !important;
            }

            #${SHELL_ID} {
                display: none;
                position: fixed;
                inset: 0;
                z-index: 100000;
                grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
                background: #fff;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
            }

            #${SHELL_ID} .ulab-visual {
                position: relative;
                overflow: hidden;
                background: linear-gradient(160deg, #2c5296 0%, #3A67B2 55%, #4f8fdb 100%);
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                padding: 3rem 3.25rem;
                color: #fff;
            }
            /* Soft ambient glow — was dead markup before (.ulab-blob { display: none }
               while the divs sat unused in the DOM); gives the visual panel
               some depth instead of a completely flat gradient. */
            #${SHELL_ID} .ulab-blob {
                position: absolute; border-radius: 50%; filter: blur(60px);
                opacity: .35; pointer-events: none;
            }
            #${SHELL_ID} .ulab-blob.b1 { width: 320px; height: 320px; background: #7fb3ff; top: -80px; right: -100px; }
            #${SHELL_ID} .ulab-blob.b2 { width: 260px; height: 260px; background: #1e3a68; bottom: -60px; left: -60px; opacity: .4; }
            #${SHELL_ID} .ulab-grid-pattern {
                position: absolute; inset: 0;
                background-image: radial-gradient(rgba(255,255,255,.16) 1px, transparent 1px);
                background-size: 26px 26px;
                mask-image: linear-gradient(180deg, rgba(0,0,0,.7), transparent 75%);
            }
            #${SHELL_ID} .ulab-visual-top { position: relative; z-index: 1; display: flex; align-items: center; gap: 12px; }
            #${SHELL_ID} .ulab-visual-top img { height: 34px; width: auto; filter: brightness(0) invert(1); }
            #${SHELL_ID} .ulab-visual-top span { font-weight: 700; font-size: 1.05rem; letter-spacing: .01em; }

            #${SHELL_ID} .ulab-visual-mid { position: relative; z-index: 1; max-width: 420px; }
            #${SHELL_ID} .ulab-visual-mid h1 {
                font-size: 2.15rem; line-height: 1.2; font-weight: 700; letter-spacing: -.02em; margin: 0 0 .85rem;
            }
            #${SHELL_ID} .ulab-visual-mid p { font-size: .98rem; line-height: 1.55; color: rgba(255,255,255,.85); margin: 0; }

            #${SHELL_ID} .ulab-visual-features { position: relative; z-index: 1; display: flex; flex-direction: column; gap: .7rem; margin-top: 1.6rem; }
            #${SHELL_ID} .ulab-visual-features div { display: flex; align-items: center; gap: 10px; font-size: .88rem; color: rgba(255,255,255,.92); }
            #${SHELL_ID} .ulab-visual-features div::before {
                content: ''; width: 6px; height: 6px; border-radius: 50%; background: #fff; flex-shrink: 0;
            }

            #${SHELL_ID} .ulab-visual-bottom { position: relative; z-index: 1; font-size: .78rem; color: rgba(255,255,255,.65); }

            #${SHELL_ID} .ulab-formside {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 2.5rem;
                background: #fafbfd;
            }
            #${SHELL_ID} .ulab-formbox {
                width: 100%; max-width: 400px;
                background: #fff;
                border: 1px solid #eef1f6;
                border-radius: 14px;
                box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 12px 32px -8px rgba(16,24,40,.1);
                padding: 2.25rem 2.25rem 2rem;
            }
            #${SHELL_ID} .ulab-formbox h2 {
                font-size: 1.6rem; font-weight: 700; color: #101828; margin: 0 0 .35rem; letter-spacing: -.01em;
            }
            #${SHELL_ID} .ulab-formbox .ulab-sub { color: #667085; font-size: .92rem; margin: 0 0 1.75rem; }

            #${SHELL_ID} .ulab-field { margin-bottom: 1.15rem; }
            #${SHELL_ID} .ulab-field label {
                display: block; font-size: .8rem; font-weight: 600; color: #344054; margin-bottom: .4rem;
            }
            #${SHELL_ID} .ulab-input-wrap {
                position: relative; display: flex; align-items: center;
            }
            #${SHELL_ID} .ulab-input-wrap .ulab-icon {
                position: absolute; left: 13px; color: #98a2b3; display: flex; pointer-events: none;
            }
            #${SHELL_ID} .ulab-input-wrap input {
                width: 100%; box-sizing: border-box;
                padding: .72rem .95rem .72rem 2.5rem;
                border: none;
                border-bottom: 2px solid #d0d5dd;
                border-radius: 4px 4px 0 0;
                font-size: .95rem;
                background: #eef2fb;
                color: #101828;
                transition: border-color .15s ease, background .15s ease;
            }
            #${SHELL_ID} .ulab-input-wrap input::placeholder { color: #98a2b3; }
            #${SHELL_ID} .ulab-input-wrap input:focus {
                outline: none;
                border-bottom-color: #3A67B2;
                background: #e7edf9;
            }
            #${SHELL_ID} .ulab-input-wrap.password input { padding-right: 2.6rem; }
            #${SHELL_ID} .ulab-eye-btn {
                position: absolute; right: 12px; background: none; border: none; padding: 4px;
                color: #98a2b3; cursor: pointer; display: flex; border-radius: 50%;
            }
            #${SHELL_ID} .ulab-eye-btn:hover { color: #3A67B2; background: #f2f5fb; }

            #${SHELL_ID} .ulab-row { display: flex; align-items: center; justify-content: space-between; margin: 1.3rem 0 1.4rem; }
            #${SHELL_ID} .ulab-remember { display: flex; align-items: center; gap: 8px; }
            #${SHELL_ID} .ulab-remember input {
                appearance: none; -webkit-appearance: none;
                width: 17px; height: 17px; border-radius: 2px; border: 1.5px solid #d0d5dd;
                cursor: pointer; position: relative; margin: 0; flex-shrink: 0;
                transition: background .15s ease, border-color .15s ease;
            }
            #${SHELL_ID} .ulab-remember input:checked { background: #3A67B2; border-color: #3A67B2; }
            #${SHELL_ID} .ulab-remember input:checked::after {
                content: ''; position: absolute; left: 5px; top: 1px;
                width: 4px; height: 9px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg);
            }
            #${SHELL_ID} .ulab-remember label { font-size: .86rem; color: #475467; cursor: pointer; margin: 0; }

            #${SHELL_ID} .ulab-submit {
                width: 100%; border: none; border-radius: 4px; padding: .8rem 1rem;
                background: #3A67B2;
                color: #fff; font-size: .9rem; font-weight: 600;
                text-transform: uppercase; letter-spacing: .03em;
                display: flex; align-items: center; justify-content: center; gap: 8px;
                box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12);
                cursor: pointer;
                transition: box-shadow .15s ease, background .15s ease;
            }
            #${SHELL_ID} .ulab-submit:hover {
                background: #2c5296;
                box-shadow: 0 3px 3px -2px rgba(0,0,0,.2), 0 3px 4px 0 rgba(0,0,0,.14), 0 1px 8px 0 rgba(0,0,0,.12);
            }
            #${SHELL_ID} .ulab-submit:active { box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12); }

            #${SHELL_ID} .ulab-errors {
                background: #fef3f2; border-left: 3px solid #d92d20; color: #b42318;
                border-radius: 2px; padding: .7rem .9rem; font-size: .85rem; margin-bottom: 1.1rem;
            }
            #${SHELL_ID} .ulab-field-error {
                color: #d92d20; font-size: .78rem; margin-top: .3rem; display: block;
            }

            #${SHELL_ID} .ulab-formbox .ulab-footnote {
                text-align: center; margin-top: 1.8rem; font-size: .78rem; color: #98a2b3;
            }

            @media (max-width: 991.98px) {
                #${SHELL_ID} { grid-template-columns: 1fr; overflow-y: auto; }
                #${SHELL_ID} .ulab-visual { display: none; }
                #${SHELL_ID} .ulab-formside {
                    padding: 1.5rem;
                    align-items: flex-start;
                    min-height: 100%;
                    padding-top: 3rem;
                }
                #${SHELL_ID} .ulab-formbox { max-width: 420px; }
            }

            @media (max-width: 575.98px) {
                #${SHELL_ID} .ulab-formside { padding: 1.25rem 1rem; padding-top: 2rem; }
                #${SHELL_ID} .ulab-formbox { max-width: 100%; }
                #${SHELL_ID} .ulab-formbox h2 { font-size: 1.35rem; }
                #${SHELL_ID} .ulab-formbox .ulab-sub { font-size: .85rem; margin-bottom: 1.5rem; }
                #${SHELL_ID} .ulab-field { margin-bottom: .95rem; }
                #${SHELL_ID} .ulab-input-wrap input { padding: .65rem .85rem .65rem 2.3rem; font-size: .9rem; }
                #${SHELL_ID} .ulab-row { margin: 1.1rem 0 1.2rem; flex-wrap: wrap; gap: .6rem; }
                #${SHELL_ID} .ulab-submit { padding: .75rem 1rem; }
                #${TOGGLE_ID} { right: 10px; bottom: 10px; padding: 5px 10px 5px 8px; font-size: 10.5px; }
            }

            /* Floating "modern UI" toggle */
            #${TOGGLE_ID} {
                position: fixed;
                right: 16px;
                bottom: 16px;
                z-index: 999999;
                display: flex;
                align-items: center;
                gap: 8px;
                background: #fff;
                border: 1px solid #e4e7ec;
                border-radius: 4px;
                padding: 6px 12px 6px 10px;
                font: 500 11.5px/1 -apple-system, "Segoe UI", sans-serif;
                color: #667085;
                box-shadow: 0 1px 3px 0 rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14);
                opacity: .5;
                transition: opacity .2s ease, box-shadow .2s ease;
                cursor: pointer;
                user-select: none;
            }
            #${TOGGLE_ID}:hover { opacity: 1; box-shadow: 0 3px 3px -2px rgba(0,0,0,.2), 0 3px 4px 0 rgba(0,0,0,.14), 0 1px 8px 0 rgba(0,0,0,.12); }
            #${TOGGLE_ID} .ulab-switch {
                position: relative; width: 30px; height: 17px; border-radius: 999px; background: #d0d5dd;
                transition: background .2s ease; flex-shrink: 0;
            }
            #${TOGGLE_ID} .ulab-switch::after {
                content: ''; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px;
                border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3);
                transition: transform .2s ease;
            }
            #${TOGGLE_ID}.on .ulab-switch { background: #3A67B2; }
            #${TOGGLE_ID}.on .ulab-switch::after { transform: translateX(13px); }
        `;
        document.head.appendChild(style);
    }

    // Builds a labeled, icon-prefixed field around a NEW input that mirrors
    // its value into `realInput` (the untouched original) on every keystroke,
    // so the real form is always ready to submit with current values.
    function buildField(realInput, labelText, iconSvg, opts) {
        opts = opts || {};
        const mirrorId = 'ulab-mirror-' + realInput.id;

        const field = document.createElement('div');
        field.className = 'ulab-field';

        const label = document.createElement('label');
        label.setAttribute('for', mirrorId);
        label.textContent = labelText;
        field.appendChild(label);

        const wrap = document.createElement('div');
        wrap.className = 'ulab-input-wrap' + (opts.password ? ' password' : '');
        const icon = document.createElement('span');
        icon.className = 'ulab-icon';
        icon.innerHTML = iconSvg;
        wrap.appendChild(icon);

        const mirrorInput = document.createElement('input');
        mirrorInput.id = mirrorId;
        mirrorInput.type = opts.password ? 'password' : 'text';
        mirrorInput.autocomplete = realInput.autocomplete || (opts.password ? 'current-password' : 'username');
        mirrorInput.placeholder = opts.placeholder || '';
        mirrorInput.value = realInput.value || '';
        mirrorInput.addEventListener('input', () => { realInput.value = mirrorInput.value; });
        wrap.appendChild(mirrorInput);

        if (opts.password) {
            const eyeBtn = document.createElement('button');
            eyeBtn.type = 'button';
            eyeBtn.className = 'ulab-eye-btn';
            eyeBtn.innerHTML = ICONS.eye;
            eyeBtn.setAttribute('aria-label', 'Show password');
            eyeBtn.addEventListener('click', () => {
                const showing = mirrorInput.type === 'text';
                mirrorInput.type = showing ? 'password' : 'text';
                eyeBtn.innerHTML = showing ? ICONS.eye : ICONS.eyeOff;
            });
            wrap.appendChild(eyeBtn);
        }
        field.appendChild(wrap);

        if (opts.onEnter) {
            mirrorInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); opts.onEnter(); }
            });
        }

        const errorSpan = document.querySelector(`[data-valmsg-for="${realInput.name}"]`);
        if (errorSpan && errorSpan.textContent.trim()) {
            const errorClone = document.createElement('span');
            errorClone.className = 'ulab-field-error';
            errorClone.textContent = errorSpan.textContent.trim();
            field.appendChild(errorClone);
        }
        return { field, mirrorInput };
    }

    function buildShell() {
        const userInput = document.getElementById('UserName');
        const passInput = document.getElementById('Password');
        const rememberInput = document.getElementById('RememberMe');
        const form = document.getElementById('loginPostForm');
        const realSubmit = form && form.querySelector('input[type="submit"]');
        if (!userInput || !passInput || !form || !realSubmit) return null;

        const shell = document.createElement('div');
        shell.id = SHELL_ID;

        // Left visual panel
        const visual = document.createElement('div');
        visual.className = 'ulab-visual';
        visual.innerHTML = `
            <div class="ulab-grid-pattern"></div>
            <div class="ulab-blob b1"></div>
            <div class="ulab-blob b2"></div>
            <div class="ulab-visual-top">
                <img src="/images/logo.png" alt="ULAB" />
            </div>
            <div class="ulab-visual-mid">
                <h1>Welcome back to URMS</h1>
                <p>Sign in to manage advising, results, schedules and everything else on the university resource management system.</p>
                <div class="ulab-visual-features">
                    <div>Secure single sign-on for faculty</div>
                    <div>Advising, billing &amp; results in one place</div>
                    <div>Built for the ULAB academic community</div>
                </div>
            </div>
            <div class="ulab-visual-bottom">&copy; 2024 - ValuePLUS Computer Systems Ltd.</div>
        `;

        // Right form panel
        const formside = document.createElement('div');
        formside.className = 'ulab-formside';
        const formbox = document.createElement('div');
        formbox.className = 'ulab-formbox';
        formbox.innerHTML = `<h2>Sign in</h2><p class="ulab-sub">Enter your credentials to access your account.</p>`;

        const summaryErrors = document.querySelector('.validation-summary-errors');
        if (summaryErrors && summaryErrors.textContent.trim()) {
            const err = document.createElement('div');
            err.className = 'ulab-errors';
            err.textContent = summaryErrors.textContent.trim();
            formbox.appendChild(err);
        }

        const doSubmit = () => realSubmit.click();

        const { field: userField } = buildField(userInput, 'Username', ICONS.user, {
            placeholder: 'Enter your username'
        });
        formbox.appendChild(userField);

        const { field: passField } = buildField(passInput, 'Password', ICONS.lock, {
            password: true,
            placeholder: 'Enter your password',
            onEnter: doSubmit
        });
        formbox.appendChild(passField);

        const row = document.createElement('div');
        row.className = 'ulab-row';
        if (rememberInput) {
            const remember = document.createElement('div');
            remember.className = 'ulab-remember';
            const mirrorRemember = document.createElement('input');
            mirrorRemember.type = 'checkbox';
            mirrorRemember.id = 'ulab-mirror-RememberMe';
            mirrorRemember.checked = rememberInput.checked;
            mirrorRemember.addEventListener('change', () => { rememberInput.checked = mirrorRemember.checked; });
            remember.appendChild(mirrorRemember);
            const rememberLabel = document.createElement('label');
            rememberLabel.setAttribute('for', mirrorRemember.id);
            rememberLabel.textContent = 'Remember me';
            remember.appendChild(rememberLabel);
            row.appendChild(remember);
        }
        formbox.appendChild(row);

        const submitBtn = document.createElement('button');
        submitBtn.type = 'button';
        submitBtn.className = 'ulab-submit';
        submitBtn.innerHTML = `<span>Log in</span>${ICONS.arrow}`;
        submitBtn.addEventListener('click', doSubmit);
        formbox.appendChild(submitBtn);

        const footnote = document.createElement('div');
        footnote.className = 'ulab-footnote';
        footnote.textContent = 'ULAB Web Portal';
        formbox.appendChild(footnote);

        formside.appendChild(formbox);
        shell.appendChild(visual);
        shell.appendChild(formside);
        return shell;
    }

    function injectToggle(isOn) {
        if (document.getElementById(TOGGLE_ID)) return;
        const toggle = document.createElement('div');
        toggle.id = TOGGLE_ID;
        toggle.className = isOn ? 'on' : '';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-checked', String(isOn));
        toggle.setAttribute('title', 'Toggle modern login UI');
        toggle.innerHTML = `<span class="ulab-switch"></span><span>Modern UI</span>`;
        toggle.addEventListener('click', () => {
            const next = !document.body.classList.contains('ulab-modern-login');
            applyState(next);
            chrome.storage.local.set({ [STORAGE_KEY]: next });
        });
        document.body.appendChild(toggle);
    }

    function applyState(isOn) {
        document.body.classList.toggle('ulab-modern-login', isOn);
        const toggle = document.getElementById(TOGGLE_ID);
        if (toggle) {
            toggle.classList.toggle('on', isOn);
            toggle.setAttribute('aria-checked', String(isOn));
        }
    }

    function init() {
        injectStyles();
        const shell = buildShell();
        if (shell) document.body.appendChild(shell);

        chrome.storage.local.get([STORAGE_KEY], (result) => {
            const isOn = shell ? result[STORAGE_KEY] !== false : false; // default on
            applyState(isOn);
            injectToggle(isOn);
            uncloak();
        });
    }

    cloak();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
