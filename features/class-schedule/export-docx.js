// features/class-schedule/export-docx.js — builds a minimal, dependency-free
// .docx file in the browser. Extension pages can't load a remote docx
// library (MV3 disallows remote script execution), and vendoring something
// like docx.js is overkill for "one table" — so this hand-builds the OOXML
// parts and zips them itself. A .docx is just a ZIP of XML parts; the ZIP
// spec allows uncompressed ("stored") entries, so no deflate implementation
// is needed either.
(function () {
    // ── Minimal ZIP (stored, no compression) ────────────────────────────
    let crcTable = null;
    function crc32(bytes) {
        if (!crcTable) {
            crcTable = new Uint32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                crcTable[n] = c >>> 0;
            }
        }
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xFF];
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function u16(n) { return [n & 0xFF, (n >> 8) & 0xFF]; }
    function u32(n) { return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF]; }

    // files: [{ name: 'word/document.xml', data: Uint8Array }]
    function buildZipBlob(files) {
        const encoder = new TextEncoder();
        const parts = [];
        const centralParts = [];
        let offset = 0;

        for (const f of files) {
            const nameBytes = encoder.encode(f.name);
            const data = f.data;
            const crc = crc32(data);
            const localHeader = new Uint8Array([
                ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
                ...u32(crc), ...u32(data.length), ...u32(data.length),
                ...u16(nameBytes.length), ...u16(0),
            ]);
            parts.push(localHeader, nameBytes, data);

            const centralHeader = new Uint8Array([
                ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
                ...u32(crc), ...u32(data.length), ...u32(data.length),
                ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
                ...u32(0), ...u32(offset),
            ]);
            centralParts.push(centralHeader, nameBytes);

            offset += localHeader.length + nameBytes.length + data.length;
        }

        const centralStart = offset;
        const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
        const eocd = new Uint8Array([
            ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
            ...u32(centralSize), ...u32(centralStart), ...u16(0),
        ]);

        return new Blob([...parts, ...centralParts, eocd], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
    }

    function xmlEscape(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
    }

    function toFile(name, xml) {
        return { name, data: new TextEncoder().encode(xml) };
    }

    const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

    // Runs a plain text block into one or more <w:r> with <w:br/> between
    // lines, so a multi-course table cell shows each course on its own line.
    function runsForLines(lines, bold) {
        return lines.map((line, i) => {
            const br = i > 0 ? '<w:br/>' : '';
            const rPr = bold ? '<w:rPr><w:b/></w:rPr>' : '';
            return `<w:r>${rPr}${br}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`;
        }).join('');
    }

    function cellXml(lines, { bold = false, widthTwips = 2000, center = false, gridSpan = null, vMerge = null } = {}) {
        const jc = center ? '<w:jc w:val="center"/>' : '';
        const content = lines.length
            ? `<w:p>${jc ? `<w:pPr>${jc}</w:pPr>` : ''}${runsForLines(lines, bold)}</w:p>`
            : `<w:p/>`;
        const spanTag = gridSpan ? `<w:gridSpan w:val="${gridSpan}"/>` : '';
        const mergeTag = vMerge === 'restart' ? '<w:vMerge w:val="restart"/>' : vMerge === 'continue' ? '<w:vMerge/>' : '';
        return `<w:tc><w:tcPr><w:tcW w:w="${widthTwips}" w:type="dxa"/>${spanTag}${mergeTag}</w:tcPr>${content}</w:tc>`;
    }

    function buildDocumentXml({ title, subtitle, daysPresent, dayNames, slotOrder, cellLinesFor }) {
        const colCount = daysPresent.length + 1;
        const colWidth = Math.floor(9000 / colCount);

        const tblGrid = `<w:tblGrid>${Array.from({ length: colCount }, () => `<w:gridCol w:w="${colWidth}"/>`).join('')}</w:tblGrid>`;

        const headerRow = `<w:tr>${cellXml(['Time'], { bold: true, widthTwips: colWidth })}${daysPresent
            .map((d) => cellXml([dayNames[d]], { bold: true, widthTwips: colWidth }))
            .join('')}</w:tr>`;

        const dataRows = slotOrder.map((slot) => {
            const timeCell = cellXml([slot], { widthTwips: colWidth });
            const dayCells = daysPresent.map((day) => cellXml(cellLinesFor(day, slot), { widthTwips: colWidth })).join('');
            return `<w:tr>${timeCell}${dayCells}</w:tr>`;
        }).join('');

        const borders = `<w:tblBorders>
            <w:top w:val="single" w:sz="4" w:color="auto"/>
            <w:left w:val="single" w:sz="4" w:color="auto"/>
            <w:bottom w:val="single" w:sz="4" w:color="auto"/>
            <w:right w:val="single" w:sz="4" w:color="auto"/>
            <w:insideH w:val="single" w:sz="4" w:color="auto"/>
            <w:insideV w:val="single" w:sz="4" w:color="auto"/>
        </w:tblBorders>`;

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${xmlEscape(title)}</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="666666"/></w:rPr><w:t>${xmlEscape(subtitle)}</w:t></w:r></w:p>
<w:p/>
<w:tbl><w:tblPr>${borders}<w:tblW w:w="0" w:type="auto"/></w:tblPr>${tblGrid}${headerRow}${dataRows}</w:tbl>
<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>
</w:body>
</w:document>`;
    }

    function buildScheduleDocx(opts) {
        const documentXml = buildDocumentXml(opts);
        const files = [
            toFile('[Content_Types].xml', CONTENT_TYPES),
            toFile('_rels/.rels', ROOT_RELS),
            toFile('word/document.xml', documentXml),
            toFile('word/_rels/document.xml.rels', DOC_RELS),
        ];
        return buildZipBlob(files);
    }

    // ── Consultation/office-door schedule (name+photo letterhead, then a
    // Class Hours / Counselling Hours table by day) ────────────────────────
    const ACCENT = '1F4E79';       // dark blue — header shading / accent rule
    const ACCENT_LIGHT = 'DCE6F1'; // light blue — table header row shading
    const LOCKED_FILL = 'F2F2F2';  // light grey — "fixed" class-hour cells

    function shd(hex) { return `<w:shd w:val="clear" w:color="auto" w:fill="${hex}"/>`; }

    // cellXml doesn't know about shading — layer it on by inserting a
    // <w:shd> into the tcPr of an already-built cell string. Cheaper than
    // threading a `fill` option through every call site.
    function withFill(cellStr, hex) {
        return cellStr.replace('</w:tcPr>', `${shd(hex)}</w:tcPr>`);
    }

    // Decodes a "data:image/png;base64,...." URL into raw bytes + the file
    // extension Word expects, or null if it's not a data URL we recognize.
    function decodeDataUrl(dataUrl) {
        const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(dataUrl || '');
        if (!m) return null;
        const ext = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
        const binary = atob(m[2]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return { ext, bytes };
    }

    // photo: null, or { dataUrl, width, height } (natural pixel size, used
    // to preserve aspect ratio when scaling to a fixed display width).
    function buildConsultationDocx(state, dayNames, photo) {
        const borders = `<w:tblBorders>
            <w:top w:val="single" w:sz="4" w:color="auto"/>
            <w:left w:val="single" w:sz="4" w:color="auto"/>
            <w:bottom w:val="single" w:sz="4" w:color="auto"/>
            <w:right w:val="single" w:sz="4" w:color="auto"/>
            <w:insideH w:val="single" w:sz="4" w:color="auto"/>
            <w:insideV w:val="single" w:sz="4" w:color="auto"/>
        </w:tblBorders>`;
        const noBorders = `<w:tblBorders>
            <w:top w:val="none" w:sz="0" w:color="auto"/><w:left w:val="none" w:sz="0" w:color="auto"/>
            <w:bottom w:val="none" w:sz="0" w:color="auto"/><w:right w:val="none" w:sz="0" w:color="auto"/>
            <w:insideH w:val="none" w:sz="0" w:color="auto"/><w:insideV w:val="none" w:sz="0" w:color="auto"/>
        </w:tblBorders>`;

        const h = state.header;

        // ── Photo (real embedded image part, not text) ──────────────────
        let imagePart = null;
        let drawingXml = '';
        const decoded = photo && photo.dataUrl && decodeDataUrl(photo.dataUrl);
        if (decoded) {
            const displayWidthEmu = 1150000; // ~1.26in
            const aspect = (photo.height && photo.width) ? photo.height / photo.width : 1;
            const displayHeightEmu = Math.round(displayWidthEmu * aspect);
            imagePart = { name: `word/media/photo.${decoded.ext}`, data: decoded.bytes };
            drawingXml = `<w:r><w:drawing>
                <wp:inline distT="0" distB="0" distL="0" distR="0">
                    <wp:extent cx="${displayWidthEmu}" cy="${displayHeightEmu}"/>
                    <wp:docPr id="1" name="Photo"/>
                    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                                <pic:nvPicPr><pic:cNvPr id="1" name="Photo"/><pic:cNvPicPr/></pic:nvPicPr>
                                <pic:blipFill><a:blip r:embed="rIdPhoto"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
                                <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${displayWidthEmu}" cy="${displayHeightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
                            </pic:pic>
                        </a:graphicData>
                    </a:graphic>
                </wp:inline>
            </w:drawing></w:r>`;
        }

        // ── Letterhead: borderless 2-col table — text block | photo ─────
        const nameRun = `<w:p><w:pPr><w:spacing w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="${ACCENT}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(h.name || 'Faculty Name')}</w:t></w:r></w:p>`;
        const subLines = [h.title, h.department].filter(Boolean)
            .map((line) => `<w:p><w:pPr><w:spacing w:after="20"/></w:pPr><w:r><w:rPr><w:color w:val="555555"/></w:rPr><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`).join('');
        const contactLines = [h.email ? `Email: ${h.email}` : '', h.contact ? `Contact: ${h.contact}` : ''].filter(Boolean)
            .map((line) => `<w:p><w:pPr><w:spacing w:before="60"/></w:pPr><w:r><w:rPr><w:sz w:val="19"/></w:rPr><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`).join('');
        const textCell = `<w:tc><w:tcPr><w:tcW w:w="7500" w:type="dxa"/></w:tcPr>${nameRun}${subLines}${contactLines}</w:tc>`;
        const photoCell = `<w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr>${drawingXml || ''}</w:p></w:tc>`;
        const letterhead = `<w:tbl><w:tblPr>${noBorders}<w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="7500"/><w:gridCol w:w="1600"/></w:tblGrid><w:tr>${textCell}${photoCell}</w:tr></w:tbl>`;

        // Accent rule under the letterhead — a thin, solid-filled 1-row table.
        const accentRule = `<w:tbl><w:tblPr>${noBorders}<w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="9100"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="60" w:hRule="exact"/></w:trPr>${withFill('<w:tc><w:tcPr><w:tcW w:w="9100" w:type="dxa"/></w:tcPr><w:p/></w:tc>', ACCENT)}</w:tr></w:tbl>`;

        // ── Schedule table: 6 columns, Day | Class(Courses/Time/Room) |
        // Counselling(Courses/Time), shaded header, locked class cells. ────
        const widths = [1200, 2600, 1600, 1200, 2600, 1600];
        const tblGrid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;

        const hdr = (lines, w, span, merge) => withFill(cellXml(lines, { bold: true, widthTwips: w, center: true, gridSpan: span, vMerge: merge }), ACCENT_LIGHT);
        const headRow1 = `<w:tr>
            ${hdr(['Day'], widths[0], null, 'restart')}
            ${hdr(['Class Hours (fixed)'], widths[1] + widths[2] + widths[3], 3, null)}
            ${hdr(['Counselling Hours', `Room: ${state.counsellingRoom || '—'}`], widths[4] + widths[5], 2, null)}
        </w:tr>`;
        const headRow2 = `<w:tr>
            ${withFill(cellXml([], { widthTwips: widths[0], vMerge: 'continue' }), ACCENT_LIGHT)}
            ${hdr(['Courses'], widths[1], null, null)}
            ${hdr(['Time'], widths[2], null, null)}
            ${hdr(['Room'], widths[3], null, null)}
            ${hdr(['Courses'], widths[4], null, null)}
            ${hdr(['Time'], widths[5], null, null)}
        </w:tr>`;

        const dataRows = state.days.map((d) => {
            const classCount = d.classBlocks.length;
            const rowCount = Math.max(classCount, d.counselling.length, 1);
            const rows = [];
            for (let ri = 0; ri < rowCount; ri++) {
                const dayCell = ri === 0
                    ? withFill(cellXml([dayNames[d.day]], { bold: true, widthTwips: widths[0], center: true, vMerge: rowCount > 1 ? 'restart' : null }), ACCENT_LIGHT)
                    : withFill(cellXml([], { widthTwips: widths[0], vMerge: 'continue' }), ACCENT_LIGHT);

                const cb = d.classBlocks[ri];
                let classLines1 = [], classLines2 = [], classLines3 = [];
                if (!classCount) { classLines1 = ['N/A']; classLines2 = ['N/A']; classLines3 = ['N/A']; }
                else if (cb) {
                    classLines1 = [`${cb.details.codeDisplay} (${cb.details.section})`];
                    classLines2 = cb.timeLines.slice();
                    classLines3 = [cb.details.room];
                }
                const c = d.counselling[ri];
                const isComplete = c && c.code && c.start != null && c.end != null;
                const cLines1 = isComplete ? [`${c.codeDisplay} (1)`] : [];
                const cLines2 = isComplete ? [formatMinutesRangeForDocx(c.start, c.end)] : [];

                rows.push(`<w:tr>
                    ${dayCell}
                    ${withFill(cellXml(classLines1, { widthTwips: widths[1] }), LOCKED_FILL)}
                    ${withFill(cellXml(classLines2, { widthTwips: widths[2], center: true }), LOCKED_FILL)}
                    ${withFill(cellXml(classLines3, { widthTwips: widths[3], center: true }), LOCKED_FILL)}
                    ${cellXml(cLines1, { widthTwips: widths[4] })}
                    ${cellXml(cLines2, { widthTwips: widths[5], center: true })}
                </w:tr>`);
            }
            return rows.join('');
        }).join('');

        const footerNote = `* To make an appointment at some other time (except counselling hours), or if I am unavailable in the given time, please contact via email${h.email ? `: ${h.email}` : ''}${h.contact ? ` or WhatsApp (${h.contact})` : ''}.`;

        const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<w:body>
${letterhead}
${accentRule}
<w:p/>
<w:tbl><w:tblPr>${borders}<w:tblW w:w="0" w:type="auto"/></w:tblPr>${tblGrid}${headRow1}${headRow2}${dataRows}</w:tbl>
<w:p/>
<w:p>${runsForLines([footerNote], false)}</w:p>
<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>
</w:body>
</w:document>`;

        const docRels = imagePart
            ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdPhoto" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/photo.${decoded.ext}"/>
</Relationships>`
            : DOC_RELS;

        const contentTypes = imagePart
            ? CONTENT_TYPES.replace('</Types>', `<Default Extension="${decoded.ext}" ContentType="image/${decoded.ext}"/></Types>`)
            : CONTENT_TYPES;

        const files = [
            toFile('[Content_Types].xml', contentTypes),
            toFile('_rels/.rels', ROOT_RELS),
            toFile('word/document.xml', documentXml),
            toFile('word/_rels/document.xml.rels', docRels),
        ];
        if (imagePart) files.push(imagePart);
        return buildZipBlob(files);
    }

    function formatMinutesRangeForDocx(start, end) {
        const fmt = (min) => {
            let h24 = Math.floor(min / 60), m = min % 60;
            const ap = h24 < 12 ? 'AM' : 'PM';
            let h12 = h24 % 12; if (h12 === 0) h12 = 12;
            return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
        };
        return `${fmt(start)} - ${fmt(end)}`;
    }

    window.ULAB_ScheduleDocx = { buildScheduleDocx, buildConsultationDocx };
})();
