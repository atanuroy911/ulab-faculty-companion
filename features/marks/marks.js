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

    const MMS_LINKS = [
        { label: '📊 Marks Management (New)', url: 'https://mms.ulab.edu.bd/' },
        { label: '📊 Marks Management (Legacy)', url: 'https://ulab-mms.netlify.app/' },
    ];

    function mount(container) {
        container.innerHTML = `
            <p class="ulab-step-desc">
                Opens the Marks Management System in a new tab. ULAB has been
                migrating MMS to a new domain — both are listed until the
                move is complete, in case one isn't ready for your course yet.
            </p>
            <div style="display:flex;flex-wrap:wrap;gap:10px">
                ${MMS_LINKS.map((l, i) => `<button class="ulab-primary-btn" data-idx="${i}">${l.label}</button>`).join('')}
            </div>
        `;
        container.querySelectorAll('button[data-idx]').forEach((btn) => {
            btn.addEventListener('click', () => {
                window.open(MMS_LINKS[Number(btn.dataset.idx)].url, '_blank');
            });
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
