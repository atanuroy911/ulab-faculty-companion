// features/marks/marks.js — Marks Management System launcher.
// Currently just redirects to the external MMS site; no data is read from or
// written to it by this extension.
(function () {
    if (!document.getElementById('ulab-wizard-css')) {
        const link = document.createElement('link');
        link.id = 'ulab-wizard-css';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('features/common/wizard.css');
        document.head.appendChild(link);
    }

    const MMS_URL = 'https://ulab-mms.netlify.app/';

    function mount(container) {
        container.innerHTML = `
            <div class="ulab-step-icon">📊</div>
            <p class="ulab-step-desc">
                Opens the Marks Management System in a new tab.
            </p>
            <button class="ulab-primary-btn" id="ulab-open-mms">📊 Manage Marks</button>
        `;
        container.querySelector('#ulab-open-mms').addEventListener('click', () => {
            window.open(MMS_URL, '_blank');
        });
    }

    window.ULAB_FEATURES = window.ULAB_FEATURES || [];
    window.ULAB_FEATURES.push({
        id: 'marks',
        icon: '📊',
        title: 'Marks Management',
        subtitle: 'Open the Marks Management System',
        mount,
    });
})();
