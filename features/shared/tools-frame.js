// tools-frame.js — single-feature-at-a-time host for the Faculty Companion
// tools, shown inside the URMS-native "My Tools" iframe overlay. Reuses the
// exact same feature modules as the side panel (window.ULAB_FEATURES); the
// only thing different here is the chrome around them — no left rail (the
// URMS hamburger already provides navigation), just prev/next + a row of
// quick-jump dots, styled to match the rest of the URMS reskin.

// Follow the same dark/light toggle used across the rest of the URMS
// reskin (features/shared/ulab-dashboard-shell.js writes 'ulabModernTheme'
// to chrome.storage.local) so this frame doesn't stay stuck in light mode
// when the surrounding page is switched to dark.
function applyTheme(theme) {
    document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
}
chrome.storage.local.get(['ulabModernTheme'], (result) => {
    applyTheme(result.ulabModernTheme);
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.ulabModernTheme) {
        applyTheme(changes.ulabModernTheme.newValue);
    }
});

// Lets a feature module tell whether it's running inside this frame (vs.
// the narrow side panel) — used to decide whether "view results" should
// open inline here instead of a new browser tab.
window.ULAB_TOOLS_FRAME = true;

const FEATURES = window.ULAB_FEATURES || [];

const titleEl    = document.getElementById('tf-title');
const subtitleEl = document.getElementById('tf-subtitle');
const bodyEl     = document.getElementById('tf-body');
const dotsEl     = document.getElementById('tf-dots');
const prevBtn    = document.getElementById('tf-prev');
const nextBtn    = document.getElementById('tf-next');
const footerEl   = document.getElementById('tf-footer');

let activeIndex = 0;

function renderDots() {
    dotsEl.innerHTML = '';
    FEATURES.forEach((feature, i) => {
        const dot = document.createElement('button');
        dot.className = 'tf-dot' + (i === activeIndex ? ' active' : '');
        dot.innerHTML = `<span class="tf-dot-icon">${feature.icon}</span><span class="tf-dot-label">${feature.title}</span>`;
        dot.addEventListener('click', () => selectIndex(i));
        dotsEl.appendChild(dot);
    });
}

function renderFeature() {
    const feature = FEATURES[activeIndex];
    bodyEl.classList.remove('tf-inline-mode');
    footerEl.style.display = '';
    if (!feature) {
        titleEl.textContent = 'No tools available';
        subtitleEl.textContent = '';
        bodyEl.innerHTML = '';
        return;
    }
    titleEl.textContent = `${feature.icon} ${feature.title}`;
    subtitleEl.textContent = feature.subtitle || '';
    bodyEl.innerHTML = '<div class="tf-card" id="tf-feature-card"></div>';
    feature.mount(document.getElementById('tf-feature-card'));

    prevBtn.disabled = activeIndex === 0;
    nextBtn.disabled = activeIndex === FEATURES.length - 1;
    renderDots();
}

function selectIndex(i) {
    if (i < 0 || i >= FEATURES.length || i === activeIndex) return;
    activeIndex = i;
    bodyEl.scrollTop = 0;
    renderFeature();
}

// Lets a feature module (e.g. "My Schedule" when it has nothing saved yet)
// jump straight to another tool tab instead of just telling the user to go
// find it themselves.
window.ULAB_TOOLS_FRAME_GOTO = function (featureId) {
    selectIndex(FEATURES.findIndex((f) => f.id === featureId));
};

// Shows an extension results page (e.g. results.html) inline, in the same
// tab/tool-slot, instead of the feature's usual chrome.tabs.create() new-tab
// behavior — used only when a feature module detects window.ULAB_TOOLS_FRAME.
// A small "open in new tab" affordance stays available too, since some
// report pages (print-formatted tables, etc.) are genuinely easier to work
// with as a real standalone tab.
window.ULAB_TOOLS_FRAME_SHOW_RESULTS = function (path) {
    const url = chrome.runtime.getURL(path);
    bodyEl.classList.add('tf-inline-mode');
    // The embedded results page has its own "Made by…" footer — showing
    // this frame's footer on top of it doubled it up. (Using inline
    // style.display, not the `hidden` attribute — #tf-footer's own
    // `display: flex` rule is an ID selector, which beats the browser's
    // `[hidden]` attribute-selector default in specificity and would
    // otherwise silently keep it visible.)
    footerEl.style.display = 'none';
    bodyEl.innerHTML = `
        <div id="tf-inline-toolbar">
            <button id="tf-inline-newtab" class="tf-nav-btn" title="Open in a new tab">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>
            </button>
        </div>
        <iframe id="tf-inline-frame"></iframe>
    `;
    document.getElementById('tf-inline-frame').src = url;
    document.getElementById('tf-inline-newtab').addEventListener('click', () => window.open(url, '_blank'));
};

prevBtn.addEventListener('click', () => selectIndex(activeIndex - 1));
nextBtn.addEventListener('click', () => selectIndex(activeIndex + 1));

const requestedId = new URLSearchParams(location.search).get('feature');
const initialIndex = requestedId ? FEATURES.findIndex(f => f.id === requestedId) : 0;
activeIndex = initialIndex >= 0 ? initialIndex : 0;

renderFeature();
