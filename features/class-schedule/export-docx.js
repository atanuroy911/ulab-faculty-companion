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

    function cellXml(lines, { bold = false, widthTwips = 2000 } = {}) {
        const content = lines.length
            ? `<w:p>${runsForLines(lines, bold)}</w:p>`
            : `<w:p/>`;
        return `<w:tc><w:tcPr><w:tcW w:w="${widthTwips}" w:type="dxa"/></w:tcPr>${content}</w:tc>`;
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

    window.ULAB_ScheduleDocx = { buildScheduleDocx };
})();
