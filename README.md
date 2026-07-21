# ULAB Faculty Companion

A Chrome side-panel extension that gives ULAB faculty a set of tools built directly on top of URMS —
finding common free time across students, running automated advising checks, and (carefully) bulk-confirming
staged registrations. Everything runs locally in the browser using your existing URMS session; nothing is sent
to a third-party server.

📖 **[Full documentation](docs/index.html)** · 🔒 **[Privacy policy](docs/privacy-policy.html)**

## Features

| Feature | What it does |
|---|---|
| 🕐 **Free Time Finder** | Paste a student list, finds common free class periods across the group by pulling each student's schedule from URMS. |
| 🎓 **Student Advising** | Paste an Advising Student list, checks each student for probation status/tier, courses needing a retake, prerequisite violations, and labs registered without their theory course. Generates per-student or bulk advising emails and CSV exports. |
| 💾 **Bulk Save** | ⚠️ Writes data. Loads and confirms each student's already-staged course registration — replicates clicking "Save" on their Add/Drop page, for a whole list, unattended. Does not add/remove/edit courses itself. |
| 📖 **Course Catalogue Viewer** | Browsable, searchable table of the course/prerequisite/lab-theory data that Student Advising relies on, so its warnings can be spot-checked against source. |
| 📊 **Marks Management** | Opens the external [Marks Management System](https://ulab-mms.netlify.app/) in a new tab. A launcher only — no data is read from or written to it by this extension. |

## Installation

This is not published on the Chrome Web Store — load it as an unpacked extension:

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this repository's root folder.
4. Pin the extension to the toolbar and click its icon to open the side panel.
5. Make sure you're logged in to `urms-awp.ulab.edu.bd` in the same Chrome profile — every feature reuses that session's cookies.

After pulling changes, reload the extension from `chrome://extensions`.

## Project structure

```
manifest.json              MV3 manifest — side_panel + host_permissions for urms-awp.ulab.edu.bd
background.js               service worker: opens the side panel, opens report tabs
icons/                       toolbar/store icons (generated from ulab-logo.png)
sidebar/                     side panel shell (feature rail + router)
features/
  common/wizard.css          shared paste → confirm → run wizard styling
  time/                       Free Time Finder
  advising/                   Student Advising + catalogues/<program>.js prerequisite data (CSE/BBA/English/MSJ/EEE/Bangla)
  bulk-save/                  Bulk Save
  catalogue-viewer/           Course Catalogue Viewer
  marks/                       Marks Management System launcher
docs/
  index.html                  full documentation
  privacy-policy.html         privacy policy
```

## Development notes

- Each feature is a self-contained module that registers itself onto `window.ULAB_FEATURES` with an
  `id`, `icon`, `title`, `subtitle`, and `mount(container)` — see [`docs/index.html#architecture`](docs/index.html#architecture)
  for the full pattern.
- No build step — everything is plain HTML/CSS/JS, loaded directly by the manifest.
- The prerequisite/lab-theory data in `features/advising/catalogues/<program>.js` (one file per program: CSE, BBA,
  English, MSJ, EEE, Bangla) was hand-transcribed from the university's course catalogue PDFs and cross-matched
  against a real URMS course-code export for UNESCO codes; treat it as best-effort — use the Catalogue Viewer to
  check it against anything a warning looks wrong about.

## ⚠️ A note on Bulk Save

Bulk Save is a **write** action against real student registration records, not a read-only report. It runs
unattended once started (no per-student pause), so double-check the pasted student list before confirming.
Its success/failure detection depends on matching a specific banner in URMS's response — see
[`docs/index.html#feature-bulk-save`](docs/index.html#feature-bulk-save) for exactly how that works and what to
verify afterward.

## Changelog

See [`docs/index.html#changelog`](docs/index.html#changelog) for the full changelog. Recent highlights:

- **Added** multi-program support to Student Advising — pick CSE, BBA, English & Humanities, MSJ, EEE, or Bangla
  up front, and every catalogue lookup (degree progress, prerequisites, lab/theory checks) uses that program's own
  data. Capstone Eligibility remains CSE-only by design.
- **Added** a full Bangla department catalogue and real UNESCO codes for BBA/English/MSJ/EEE, cross-matched by
  title against a real URMS course-code export (`courses-scrapped-urms.txt`).
- **Added** a PDF upload option to Student Advising and Bulk Save — upload a "Save as PDF" export of the printed
  Advising Student page instead of copy/pasting; extracted locally via a vendored `pdf.js`, no network calls.
- **Added** 📊 Marks Management launcher (opens the external MMS site in a new tab).
- **Added** legacy course-code support, Degree Progress tracking, "Hide clean students" filter, and a
  per-student/bulk email modal to Student Advising.
- **Added** 📖 Course Catalogue Viewer, 🧪 lab-without-theory detection, and 💾 Bulk Save.
