// features/advising/report-pdf.js — builds a print-optimized HTML report
// (single student or bulk, one section per student) and hands it to the
// browser's own print-to-PDF flow. No PDF library is bundled on purpose:
// generating one client-side (jsPDF et al.) means hand-laying-out tables,
// pagination and typography, none of which prints as well as the browser's
// own engine — and it would need to be added as a vendored file to satisfy
// the extension's default script-src 'self' CSP anyway. Printing an
// extension-authored document instead reuses the same box model the rest of
// this feature already uses, so it stays visually consistent for free.
// Exposed as window.ULAB_ADVISING_REPORT, consumed by:
//   - features/advising-billing/results.js (side panel — individual + bulk)
//   - features/advising/student-page-content.js (in-page button — individual)
(function () {
    // Print-friendly light palette. Deliberately not theme-aware — printed
    // (or PDF'd) output should be ink-friendly regardless of which theme the
    // user was viewing the page in when they exported it.
    const CSS = `
        * { box-sizing: border-box; }
        body {
            margin: 0; font-family: 'Segoe UI', Arial, system-ui, sans-serif;
            color: #0f172a; background: #ffffff; font-size: 12.5px; line-height: 1.5;
        }
        .report-page { padding: 20mm 16mm 16mm; page-break-after: always; break-after: page; }
        .report-page:last-child { page-break-after: auto; break-after: auto; }

        .doc-masthead {
            display: flex; align-items: baseline; justify-content: space-between;
            border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 18px;
        }
        .doc-masthead .brand { font-size: 15px; font-weight: 800; letter-spacing: -0.2px; }
        .doc-masthead .meta { font-size: 10.5px; color: #64748b; text-align: right; }

        .stu-headline { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
        .stu-headline h1 { font-size: 19px; margin: 0 0 2px; }
        .stu-headline .sid { font-family: 'Courier New', monospace; color: #0284c7; font-size: 12px; }
        .stu-headline .prog { font-size: 11px; color: #64748b; margin-top: 2px; }

        .badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 16px; }
        .badge {
            display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 10.5px;
            font-weight: 700; border: 1px solid; white-space: nowrap;
        }
        .badge-ok    { background: #ecfdf5; border-color: #a7f3d0; color: #059669; }
        .badge-warn  { background: #fffbeb; border-color: #fde68a; color: #b45309; }
        .badge-bad   { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
        .badge-muted { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }

        .section-label {
            font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px;
            color: #4338ca; margin: 16px 0 6px;
        }
        .section-label:first-of-type { margin-top: 0; }

        table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
        thead { display: table-header-group; } /* repeat header if a table spans a page break */
        th {
            text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.4px;
            color: #64748b; font-weight: 700; padding: 5px 7px; border-bottom: 1.5px solid #0f172a;
        }
        td { padding: 6px 7px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
        tr:nth-child(even) td { background: #f8fafc; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .status-met  { color: #059669; font-weight: 700; }
        .status-short { color: #b45309; font-weight: 700; }
        .totals-row td { border-top: 1.5px solid #0f172a; border-bottom: none; font-weight: 800; background: #fff !important; }

        .credit-summary {
            display: flex; justify-content: space-between; align-items: baseline;
            background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px;
            padding: 10px 14px; margin: 10px 0 4px;
        }
        .credit-summary .label { font-size: 11px; color: #475569; font-weight: 600; }
        .credit-summary .value { font-size: 15px; font-weight: 800; color: #0f172a; }
        .credit-summary .value small { font-size: 10.5px; font-weight: 600; color: #64748b; }

        .empty-note { font-size: 11.5px; color: #64748b; font-style: italic; padding: 4px 0 10px; }
        .note-box {
            font-size: 11px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0;
            border-radius: 6px; padding: 8px 10px; margin-top: 14px;
        }
        .disclaimer { font-size: 10px; color: #64748b; margin-top: 18px; line-height: 1.6; }
        .doc-footer {
            text-align: center; font-size: 9.5px; color: #94a3b8; margin-top: 26px;
            border-top: 1px solid #e2e8f0; padding-top: 8px;
        }

        @media print {
            .report-page { padding: 12mm 14mm; }
            @page { size: A4; margin: 10mm; }
        }
    `;

    const DISCLAIMER = 'This is an automated advising check generated from your URMS record. Please verify the details with your advisor before making any registration decisions. Credit totals and category breakdowns above are estimated from your course history and the department catalogue — always confirm your remaining requirements against the official major completion guidelines / course catalogue on the ULAB website (ulab.edu.bd) before finalizing your registration plan.';

    function esc(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function badge(cls, text) { return `<span class="badge ${cls}">${esc(text)}</span>`; }

    function creditsBlock(advising, cat) {
        if (!advising || !advising.degreeProgress || !cat || !cat.degreeRequirements) return '';
        const { progress } = advising.degreeProgress;
        const total = cat.degreeRequirements.total;
        const earned = progress.reduce((s, p) => s + p.earnedCredits, 0);
        const inProgress = progress.reduce((s, p) => s + p.inProgressCredits, 0);
        const remaining = total ? Math.max(0, total - earned - inProgress) : null;

        return `
            <div class="section-label">🎓 Credit Completion</div>
            <table>
                <thead><tr><th>Category</th><th class="num">Earned</th><th class="num">In Progress</th><th class="num">Required</th><th>Status</th></tr></thead>
                <tbody>
                    ${progress.map(p => `
                        <tr>
                            <td>${esc(p.label)}</td>
                            <td class="num">${p.earnedCredits}</td>
                            <td class="num">${p.inProgressCredits || '—'}</td>
                            <td class="num">${p.required}</td>
                            <td class="${p.shortBy > 0 ? 'status-short' : 'status-met'}">${p.shortBy > 0 ? `Short by ${p.shortBy}` : '✓ Met'}</td>
                        </tr>`).join('')}
                    ${total ? `
                        <tr class="totals-row">
                            <td>Total</td>
                            <td class="num">${earned}</td>
                            <td class="num">${inProgress || '—'}</td>
                            <td class="num">${total}</td>
                            <td></td>
                        </tr>` : ''}
                </tbody>
            </table>
            ${total ? `
                <div class="credit-summary">
                    <span class="label">Credits toward graduation</span>
                    <span class="value">${earned}${inProgress ? ` + ${inProgress}` : ''} <small>of ${total} required</small> — ${remaining} remaining</span>
                </div>` : ''}
            <div class="empty-note">Major Elective and Optional/Minor credits are estimated from the course code pattern — treat as approximate.</div>
        `;
    }

    function issuesBlock(info, advising) {
        let html = '';

        if (info.error) {
            return `<div class="note-box">⚠️ Could not load this student's URMS record — please check manually.</div>`;
        }

        if (info.registrationNotice) html += `<div class="note-box">🕒 ${esc(info.registrationNotice)} Course list could not be checked at the time of this report.</div>`;
        if (info.paymentNotice) html += `<div class="note-box">💳 ${esc(info.paymentNotice)}</div>`;

        const openRetakes = (advising.needsRetake || []).filter(r => !r.retakingNow);
        if (openRetakes.length) {
            html += `<div class="section-label">↻ Courses to Retake</div>
                <table><thead><tr><th>Course</th><th>Attempts</th></tr></thead><tbody>
                    ${openRetakes.map(r => `<tr><td>${esc(r.courseId)} — ${esc(r.title)}</td><td>${esc(r.attempts.join(', '))}</td></tr>`).join('')}
                </tbody></table>`;
        }

        if ((advising.prereqIssues || []).length) {
            html += `<div class="section-label">⛔ Prerequisite Issues</div>
                <table><thead><tr><th>Course</th><th>Missing Prerequisite(s)</th></tr></thead><tbody>
                    ${advising.prereqIssues.map(p => `<tr><td>${esc(p.courseId)} — ${esc(p.title)}</td><td>${esc(p.missing.map(m => `${m.courseId} (${m.title})`).join(', '))}</td></tr>`).join('')}
                </tbody></table>`;
        }

        if ((advising.labWithoutTheory || []).length) {
            html += `<div class="section-label">🧪 Lab Without Theory</div>
                <table><thead><tr><th>Lab Course</th><th>Requires Theory</th></tr></thead><tbody>
                    ${advising.labWithoutTheory.map(l => `<tr><td>${esc(l.labCourseId)} — ${esc(l.labTitle)}</td><td>${esc(l.theoryCourseId)} — ${esc(l.theoryTitle)}</td></tr>`).join('')}
                </tbody></table>`;
        }

        if ((advising.theoryDayConflicts || []).length) {
            html += `<div class="section-label">📅 3+ Theory Courses, Same Day</div>
                <table><thead><tr><th>Day</th><th>Courses</th></tr></thead><tbody>
                    ${advising.theoryDayConflicts.map(c => `<tr><td>${esc(c.day)}</td><td>${esc(c.courses.map(x => `${x.courseId} (${x.title})`).join(', '))}</td></tr>`).join('')}
                </tbody></table>`;
        }

        if (!openRetakes.length && !(advising.prereqIssues || []).length && !(advising.labWithoutTheory || []).length
            && !(advising.theoryDayConflicts || []).length && !info.paymentNotice && advising.probationTier === null) {
            html += `<div class="empty-note">No issues found — clear to proceed with registration as planned.</div>`;
        }

        return html;
    }

    // `entry`: { s: {id,name,email}, info, advising, cat, programLabel }
    function buildStudentSection(entry) {
        const { s, info, advising, cat, programLabel } = entry;
        const name = (info && info.urmsName) || s.name || 'Student';
        const badges = [];

        if (advising.probationTier !== null && advising.probationTier !== undefined) {
            badges.push(badge('badge-warn', `Probation${advising.probationTier === 'unspecified' ? '' : ` — Tier ${advising.probationTier}`}`));
        }
        if (advising.finalProbation) badges.push(badge('badge-bad', '🚫 Final Probation (restricted)'));
        const openRetakeCount = (advising.needsRetake || []).filter(r => !r.retakingNow).length;
        if (openRetakeCount) badges.push(badge('badge-warn', `↻ ${openRetakeCount} retake${openRetakeCount === 1 ? '' : 's'}`));
        if ((advising.prereqIssues || []).length) badges.push(badge('badge-bad', `⛔ ${advising.prereqIssues.length} prereq issue${advising.prereqIssues.length === 1 ? '' : 's'}`));
        if ((advising.labWithoutTheory || []).length) badges.push(badge('badge-warn', `🧪 ${advising.labWithoutTheory.length} lab w/o theory`));
        if ((advising.theoryDayConflicts || []).length) badges.push(badge('badge-warn', '📅 Schedule conflict'));
        if (info.paymentNotice) badges.push(badge('badge-bad', '💳 Payment issue'));
        if (!badges.length && !info.error) badges.push(badge('badge-ok', '✓ Clean'));

        return `
            <section class="report-page">
                <div class="stu-headline">
                    <div>
                        <h1>${esc(name)}</h1>
                        <div class="sid">Student ID: ${esc(s.id)}</div>
                        <div class="prog">${esc(info.program || programLabel || '')}${info.advisor ? ` · Advisor: ${esc(info.advisor)}` : ''}</div>
                    </div>
                </div>
                <div class="badges">${badges.join('')}</div>
                ${issuesBlock(info, advising)}
                ${creditsBlock(advising, cat)}
                <div class="disclaimer">${esc(DISCLAIMER)}</div>
            </section>
        `;
    }

    // `entries`: array of { s, info, advising, cat, programLabel }
    // `opts.title`: document title shown in the masthead / browser tab.
    function buildReportHTML(entries, opts) {
        opts = opts || {};
        const generated = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
        const masthead = `
            <div class="doc-masthead">
                <div class="brand">🎓 ULAB Advising Report</div>
                <div class="meta">Generated ${esc(generated)}<br>${entries.length} student${entries.length === 1 ? '' : 's'}</div>
            </div>`;

        const sections = entries.map((entry, i) => {
            const section = buildStudentSection(entry);
            // Masthead only on the first page — repeating it per student would
            // be redundant since each section already carries the student's
            // own headline.
            return i === 0 ? section.replace('<section class="report-page">', `<section class="report-page">${masthead}`) : section;
        }).join('');

        const footer = `<div class="doc-footer">ULAB Faculty Companion — automated advising check, not an official transcript or degree audit.</div>`;

        return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(opts.title || 'Advising Report')}</title><style>${CSS}</style></head>
<body>${sections}${footer}</body></html>`;
    }

    // Opens the report in a new tab and hands off to the browser's native
    // print dialog (where "Save as PDF" is one of the destination options) —
    // deliberately not auto-triggering print() so the user can scroll/verify
    // the layout first for a bulk report before committing to print/export.
    function openPrintableReport(html) {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    window.ULAB_ADVISING_REPORT = { buildReportHTML, openPrintableReport };
})();
