// sidebar.js — feature router for ULAB Faculty Companion

// ── Theme: auto (follows OS) → light → dark → back to auto. ────────────
const THEME_ORDER = ['auto', 'light', 'dark'];
const THEME_ICON = { auto: '🌗', light: '☀️', dark: '🌙' };
const themeToggle = document.getElementById('ulab-theme-toggle');

function applyTheme(theme) {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    if (themeToggle) themeToggle.textContent = THEME_ICON[theme] || THEME_ICON.auto;
}

function initTheme() {
    chrome.storage.local.get(['ulabTheme'], ({ ulabTheme }) => {
        applyTheme(THEME_ORDER.includes(ulabTheme) ? ulabTheme : 'auto');
    });
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        chrome.storage.local.get(['ulabTheme'], ({ ulabTheme }) => {
            const current = THEME_ORDER.includes(ulabTheme) ? ulabTheme : 'auto';
            const next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
            chrome.storage.local.set({ ulabTheme: next }, () => applyTheme(next));
        });
    });
}

initTheme();

// Each feature module registers itself on window.ULAB_FEATURES before this
// script runs, e.g. { id, icon, title, subtitle, mount(container) }.
const FEATURES = window.ULAB_FEATURES || [];

const rail    = document.getElementById('rail');
const content = document.getElementById('content');

function renderRail(activeId) {
    rail.innerHTML = '';
    for (const feature of FEATURES) {
        const btn = document.createElement('button');
        btn.className = 'rail-btn' + (feature.id === activeId ? ' active' : '');
        btn.title = feature.title;
        btn.textContent = feature.icon;
        btn.addEventListener('click', () => selectFeature(feature.id));
        rail.appendChild(btn);
    }
}

function renderFeature(feature) {
    content.innerHTML = `
        <div class="feature-header">
            <h1>${feature.icon} ${feature.title}</h1>
            <p>${feature.subtitle || ''}</p>
        </div>
        <div class="feature-body" id="feature-body"></div>
    `;
    feature.mount(document.getElementById('feature-body'));
}

function selectFeature(id) {
    const feature = FEATURES.find(f => f.id === id);
    if (!feature) return;
    renderRail(id);
    renderFeature(feature);
}

if (FEATURES.length) {
    selectFeature(FEATURES[0].id);
} else {
    content.innerHTML = `
        <div class="empty-state">
            <div class="icon">🧩</div>
            <div>No features registered yet.</div>
        </div>`;
}
