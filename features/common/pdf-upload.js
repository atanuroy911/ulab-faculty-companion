// features/common/pdf-upload.js — shared "upload a PDF instead of pasting"
// control for Student Advising / Bulk Save, both of which drive their whole
// Step 1 off a single #ulab-paste-box textarea + its `input` listener.
//
// Rather than teach each feature its own PDF parsing path, this extracts
// text from the uploaded PDF (via the vendored pdf.js — see
// features/common/vendor/pdf.min.js / pdf.worker.min.js) and writes it into
// that same textarea, then dispatches an `input` event — the feature's own
// existing paste-parsing logic takes it from there, completely unaware
// whether the text came from a paste or a PDF.
(function () {
    let workerConfigured = false;
    function ensureWorker() {
        if (workerConfigured) return;
        if (typeof pdfjsLib === 'undefined') return;
        pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('features/common/vendor/pdf.worker.min.js');
        workerConfigured = true;
    }

    // Reconstructs line-by-line text from a PDF page's text-content items.
    // pdf.js returns text runs in arbitrary order with position transforms,
    // not pre-joined lines — items are bucketed into rows by baseline Y
    // (rounded to a small tolerance so runs on the same printed row group
    // together despite minor sub-pixel differences), then each row's items
    // are sorted left-to-right by X before joining.
    function linesFromTextContent(items) {
        const rows = new Map();
        for (const item of items) {
            const y = item.transform[5];
            const bucket = Math.round(y / 3) * 3;
            if (!rows.has(bucket)) rows.set(bucket, []);
            rows.get(bucket).push(item);
        }
        const orderedBuckets = Array.from(rows.keys()).sort((a, b) => b - a); // top → bottom
        return orderedBuckets.map(bucket =>
            rows.get(bucket)
                .sort((a, b) => a.transform[4] - b.transform[4])
                .map(i => i.str)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim()
        ).filter(Boolean);
    }

    // Extracts all text from a PDF File/Blob, page by page, as a single
    // newline-joined string. Throws if pdf.js itself fails to parse the
    // file (e.g. it's not actually a PDF); returns '' (not an error) for a
    // structurally valid PDF that simply has no extractable text layer
    // (e.g. a scanned image with no OCR) — callers should treat an empty
    // result as "nothing found", not a crash.
    async function ulabExtractPdfText(file) {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF support failed to load (pdf.js missing).');
        }
        ensureWorker();
        const data = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        const allLines = [];
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            allLines.push(...linesFromTextContent(content.items));
        }
        return allLines.join('\n');
    }

    // Mounts a small "or upload the printed PDF" control into `container`,
    // wiring it to fill `textareaEl` with extracted text and dispatch the
    // `input` event the feature's own listener already expects.
    function ulabMountPdfUpload(container, textareaEl) {
        const wrap = document.createElement('div');
        wrap.className = 'ulab-format-box';
        wrap.innerHTML = `
            <div class="ulab-format-label">Or upload a PDF</div>
            <label class="ulab-link-chip" style="cursor:pointer">
                📄 Choose PDF file…
                <input type="file" accept="application/pdf" id="ulab-pdf-input" style="display:none">
            </label>
            <span id="ulab-pdf-status" class="ulab-format-hint" style="margin-left:8px"></span>
        `;
        container.appendChild(wrap);

        const input = wrap.querySelector('#ulab-pdf-input');
        const status = wrap.querySelector('#ulab-pdf-status');

        input.addEventListener('change', async () => {
            const file = input.files && input.files[0];
            if (!file) return;
            status.textContent = `⏳ Reading ${file.name}…`;
            try {
                const text = await ulabExtractPdfText(file);
                if (!text.trim()) {
                    status.textContent = '⚠️ No text found in that PDF — it may be a scanned image without a text layer. Try pasting instead.';
                    return;
                }
                textareaEl.value = text;
                textareaEl.dispatchEvent(new Event('input', { bubbles: true }));
                status.textContent = `✅ Extracted text from ${file.name} — check the preview below.`;
            } catch (err) {
                console.error('[ULAB PDF Upload]', err);
                status.textContent = `❌ Couldn't read that PDF: ${err.message}`;
            } finally {
                input.value = '';
            }
        });
    }

    window.ulabExtractPdfText = ulabExtractPdfText;
    window.ulabMountPdfUpload = ulabMountPdfUpload;
})();
