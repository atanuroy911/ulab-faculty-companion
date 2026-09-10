// features/classroom/classroom.js — sidebar entry point for the Google
// Classroom helper. The actual work happens in a content script injected
// directly on drive.google.com folder pages (features/classroom/gc-content.js),
// since that's where the file list DOM and download session live. This tab
// is just the explainer/launcher.
(function () {
    function mount(container) {
        container.innerHTML = `
            <p class="ulab-step-desc">
                Download every file in a Google Drive assignment-submissions folder,
                renamed to <code>StudentID_StudentName_Date.ext</code> using the "Modified"
                column Drive already shows for each file.
            </p>
            <ol class="ulab-step-desc" style="padding-left: 1.2em;">
                <li>Open the Drive folder with the student submissions (list view, not grid).</li>
                <li>Make sure the "Modified" column is visible in the file list.</li>
                <li>A small "📥 Download &amp; Rename" panel appears in the bottom-right of the page.</li>
                <li>Click <strong>Scan Folder</strong>, review the detected names/IDs, then <strong>Download All</strong>.</li>
            </ol>
            <p class="ulab-step-desc">
                Native Google Docs/Sheets/Slides are exported as .docx/.xlsx/.pptx; everything else
                downloads as-is. Your browser may ask to allow multiple downloads the first time —
                choose "Allow".
            </p>
            <button class="ulab-primary-btn" id="ulab-open-drive">📁 Open Google Drive</button>
        `;
        container.querySelector('#ulab-open-drive').addEventListener('click', () => {
            window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener');
        });
    }

    window.ULAB_FEATURES = window.ULAB_FEATURES || [];
    window.ULAB_FEATURES.push({
        id: 'classroom',
        icon: '🎓',
        title: 'Google Classroom',
        subtitle: 'Download & rename assignment submissions from Drive',
        mount,
    });
})();
