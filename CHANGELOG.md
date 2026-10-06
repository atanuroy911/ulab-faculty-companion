# Changelog

## Unreleased (manifest 3.2.0)

- **New: Who's Free?** Upload the semester's Class Schedule xlsx (the same file "Generate
  My Schedule" uses), pick a day and one of the sheet's own time slots or a custom range, and
  see which teachers have no class then. Busy teachers are listed with the class that
  clashes. A class counts as a clash if it overlaps the chosen time, so a long lab block
  makes its teacher busy for every slot it covers. Teachers who are in the sheet's legend but
  have no classes are shown as free. Available in the side panel and under My Tools on the
  site.

- **Changed: MMS "Import Students from URMS" now uses the Attendance Sheet.** The Section
  Wise Result Entry page only exists while result entry is open, and opens preset to that
  semester (often last semester's). The import now opens URMS's Attendance Sheet instead:
  pick Semester, Course and Section, and the extension downloads the sheet as a PDF and hands
  it to MMS, which reads it with its "Upload PDF" parser. The course is checked against the
  dropdown's label here and against the PDF in MMS. MMS builds that don't ask for this keep
  the old result-entry route.
- **New: MMS integration — Look Up Students (name + email).** When a coordinator adds
  students to a capstone group in MMS by ID alone, MMS can ask the extension to fill in
  each student's name and email. Same background StudentRegistration lookup as the email
  sync below (no popup, uses your existing URMS session), on its own `mms-urms-students`
  port so the email sync's payload shape is unchanged. If your URMS session has expired the
  extension reports that specifically, and MMS can ask it to open URMS's login in a popup
  window and retry without losing the list.
- **New: MMS integration — Sync Student Emails.** MMS can now ask the extension for a
  batch of student IDs' email addresses. The extension looks each one up via the same
  StudentRegistration "Load" request the Advising feature already uses, using your
  existing URMS session — no popup window needed. Note: the public version number here
  doesn't match this changelog's numbering (manifest is 3.2.0 vs. the 1.5.2 entry below) —
  reconcile before publishing to the Web Store.

## 1.5.2 — 2026-07-26

- **New: MMS integration — Import Students from URMS.** The [ULAB MMS](https://ulab-mms.netlify.app/)
  app can now request this extension to open URMS's Section Wise Result
  Entry page, and once you pick a Course/Section (or automatically, if
  there's only one), it fetches the student list directly using your
  existing URMS login — no copy/paste, and the popup closes itself when
  done.
- **New: MMS integration — Auto-Fill Grades (Beta).** MMS can ask the
  extension to open the same URMS page and fill in the grade dropdown for
  each student with the grade MMS calculated. Nothing is ever submitted
  automatically — you review the filled-in values and click URMS's own
  **Save** button yourself. Once saved, it prompts you to print the grade
  sheet.
- Both integrations cross-check the course/section against what MMS
  expects before touching anything, and correctly handle courses that are
  split into an old-code/new-code pair with separate, disjoint URMS
  rosters — grades are filled per matching group instead of a merged list.
- These MMS integrations only activate when MMS explicitly starts a
  session (e.g. clicking "Import from URMS" or "Auto-Fill Grades" in MMS)
  — simply browsing URMS on your own never triggers them.

## 1.0.0 — 2026-07-17

- **Capstone Eligibility**: student list input is now a plain freeform paste
  (one Student ID per line, optional trailing name) instead of requiring the
  AdvisingStudent print page — this tool checks whatever roster you're
  already working from, not a fixed URMS source.
- **Capstone Eligibility**: fixed a bug where every student's "Earned
  Credit" showed as 0, throwing off the total-credit eligibility check. The
  root cause — a label-parsing regex that left a trailing space in scraped
  field names like "Total Credit Hours Completed" — also affected Student
  Advising's Credits Completed/Attempted/Max Credit fields; both are fixed.
- **Capstone Eligibility**: each student's row in the report can now be
  expanded to show a full semester-by-semester course history (with course
  titles), plus a plain-language explanation of why they are or aren't
  eligible.
- Fixed light/dark theme toggle across all report pages (Capstone
  Eligibility, Bulk Save, Advising, Time, Catalogue Viewer) — a CSS rule
  was unconditionally re-applying the light palette regardless of the
  toggle, so switching to dark mode had no visible effect. Toggling now
  works correctly on every report page.

## 0.4.0 — 2026-07-17

- **New: Capstone Eligibility tab.** Ports the standalone "URMS Capstone
  Eligibility Application" desktop tool (Python/Selenium) into the
  extension. Paste a student list, and it checks each student's transcript
  (read-only) against the Capstone requirements: 105+ total credit hours
  and CSE2200/CSE3103/CSE3200/CSE3203 each passed or in progress. Flags
  transcript entries outside the expected course-code list (including
  ULAB's general-ed/core codes — GEF, UCC, GED, SSC, NSC, ESK) as "Extra
  Courses" worth a manual look.
- Course-code matching resolves through the extension's existing UNESCO
  course-code catalogue, so a course recorded under a legacy local code in
  one semester still matches correctly against the current UNESCO code.
- Results open in a report tab with CSV and color-coded Excel export
  (green = Eligible, yellow = blocking requirement), matching the original
  tool's spreadsheet output.

## 0.3.0 — 2026-07-17

- **Bulk Save**: added an optional "Email the bill" toggle that, after each
  student's Save succeeds, finds and hits the page's own "Email Bill" link
  so bills go out automatically without a separate manual step.
- **Bulk Save**: reworded the pre-run notice from a red "danger" warning to
  a calmer informational note — same disclosure, less alarming presentation.
- **Advising** & **Bulk Save**: step 1 instructions redesigned as a numbered
  how-to card list (numbered badges, titles, sub-text) with a clickable link
  chip to `urms-awp.ulab.edu.bd/AdvisingStudent`, replacing the old plain
  paragraph instructions.
- Removed the large duplicate icon shown at the top of every feature panel
  (Advising, Bulk Save, Time, Catalogue Viewer, Marks) — it repeated the
  icon already in the panel header, so removing it saves vertical space.

## 0.2.0 — prior release

- Initial tracked baseline (Time, Advising, Bulk Save, Catalogue Viewer,
  Marks features).
