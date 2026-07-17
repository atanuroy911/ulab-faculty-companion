// features/catalogue-viewer/catalogue-viewer.js — sidebar entry point that
// opens the Course & Prerequisite Map in a full tab (a wide searchable table
// reads better than the narrow side panel).
(function () {
    if (!document.getElementById('ulab-wizard-css')) {
        const link = document.createElement('link');
        link.id = 'ulab-wizard-css';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('features/common/wizard.css');
        document.head.appendChild(link);
    }

    function mount(container) {
        container.innerHTML = `
            <p class="ulab-step-desc">
                Browse every course this extension knows about, along with its prerequisites
                and lab/theory pairing — the exact data Student Advising uses to generate its
                warnings. Opens in a full browser tab for easier searching.
            </p>
            <button class="ulab-primary-btn" id="ulab-open-catalogue-viewer">📖 Open Catalogue Viewer</button>
        `;
        container.querySelector('#ulab-open-catalogue-viewer').addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'openCatalogueViewer' });
        });
    }

    window.ULAB_FEATURES = window.ULAB_FEATURES || [];
    window.ULAB_FEATURES.push({
        id: 'catalogue-viewer',
        icon: '📖',
        title: 'Course Catalogue',
        subtitle: 'Browse the prerequisite map used by Student Advising',
        mount,
    });
})();
