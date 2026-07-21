// features/advising/catalogues/english.js — BA in English and Humanities
// (DEH) course catalogue & degree-requirement map.
//
// Course list transcribed from "Course-Catalogue-Undergraduate-Summer-2026.pdf"
// (Bachelor of Arts in English and Humanities section). UNESCO codes were
// cross-matched by title against "courses-scrapped-urms.txt" (a real URMS
// export listing each course's UNESCO code and old local code) — see
// catalogues/bba.js header for the matching methodology. Only DEH-segment
// (0232-013) matches were accepted; grad-only (055) rows were left unmapped.
// Where no scrape match exists, `unescoCode` falls back to the local `code`.
//
// The catalogue's own "Major Core Courses" table is headed "21 courses / 63
// credits" but the table beneath it actually lists 30 course rows (its text
// explicitly says the list "shows both Core Courses and Electives" without
// a clean split) — rather than guess which 21 of the 30 are the true core,
// all 30 are transcribed here under category MajorCore. This only affects
// how a specific course is labeled if referenced outside the 5-course
// concentration-elective picks transcribed separately below; degree-
// progress credit totals are unaffected. No prerequisites are published for
// this program's courses, so `prereq` is empty throughout — Advising's
// prerequisite-gap check will simply find nothing to flag for English.
(function () {
    const COURSES = [
        // ── GEF / UCC / ESK (no prerequisites) ──────────────────────────────
        { code: 'ELL0099', unescoCode: 'ELL0099', title: 'Remedial English', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'GEF1101', unescoCode: '0231-000-1101', title: 'Academic English I', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'GEF1201', unescoCode: '0231-000-1201', title: 'Academic English II', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'UCC1101', unescoCode: '0232-000-1101', title: 'Bangla Bhasha O Sahitya', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'UCC1201', unescoCode: '0222-000-1201', title: 'History of the Emergence of Independent Bangladesh', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'UCC1202', unescoCode: '0223-000-1202', title: 'Ethics', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'ESK1110', unescoCode: '0031-000-1110', title: 'Study Skills', prereq: [], category: 'ESK', oldCodes: [] },
        { code: 'ESK1111', unescoCode: '0031-000-1111', title: 'Healthy Life Skills', prereq: [], category: 'ESK', oldCodes: [] },
        { code: 'ESK1112', unescoCode: '0031-000-1112', title: 'Social Skills', prereq: [], category: 'ESK', oldCodes: [] },
        { code: 'ESK1113', unescoCode: '0031-000-1113', title: 'Professional Skills', prereq: [], category: 'ESK', oldCodes: [] },

        // ── Major Core (as listed in the catalogue's combined table) ────────
        { code: 'ENG1101', unescoCode: '0232-013-1101', title: 'Introduction to Literary Genres', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG1201', unescoCode: '0232-013-1201', title: 'Introduction to Poetry and Drama', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG1202', unescoCode: '0232-013-1202', title: 'Introduction to Fiction and Non-fiction', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG1203', unescoCode: '0232-013-1203', title: 'Pronunciation: Phonetics and Phonology', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG1301', unescoCode: 'ENG1301', title: 'Introduction to Linguistics', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG1303', unescoCode: 'ENG1303', title: 'Old and Middle English Literature', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG2101', unescoCode: '0232-013-2101', title: 'Elizabethan and Jacobean Drama (Excluding Shakespeare)', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG2102', unescoCode: '0232-013-2102', title: 'Writing about Literature', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG2103', unescoCode: '0232-013-2103', title: 'Morphology and Syntax', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG2107', unescoCode: 'ENG2107', title: '16th and 17th Century English Literature', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG2108', unescoCode: 'ENG2108', title: 'Shakespeare', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG2201', unescoCode: '0232-013-2201', title: 'Sociolinguistics', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG2202', unescoCode: '0232-013-2202', title: 'Restoration and Eighteenth Century Literature', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG2203', unescoCode: '0232-013-2203', title: 'Literary Criticism (Sidney to Leavis)', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG2204', unescoCode: 'ENG2204', title: 'Romantic Poetry', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG2205', unescoCode: 'ENG2205', title: 'Semantics and Pragmatics', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG2206', unescoCode: 'ENG2206', title: 'American Literature I', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG2301', unescoCode: 'ENG2301', title: 'Language Development and Acquisition', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG3101', unescoCode: 'ENG3101', title: 'Victorian Literature', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG3102', unescoCode: 'ENG3102', title: 'Psycholinguistics', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG3103', unescoCode: 'ENG3103', title: 'Ancient Greek Literature', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG3104', unescoCode: 'ENG3104', title: 'Modern British Drama', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG3201', unescoCode: 'ENG3201', title: 'American Literature II', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG3202', unescoCode: 'ENG3202', title: 'Modernism in Literature', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG3203', unescoCode: 'ENG3203', title: 'Theories of Language Acquisition', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG3204', unescoCode: 'ENG3204', title: 'Critical Theory', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG3218', unescoCode: 'ENG3218', title: 'Stylistics', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG4101', unescoCode: 'ENG4101', title: 'Research Methodology', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG4103', unescoCode: 'ENG4103', title: 'Digital Humanities', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'ENG4218', unescoCode: 'ENG4218', title: 'Transnational Literature', prereq: [], category: 'MajorCore', oldCodes: [] },

        // ── Elective (Concentration) courses — 5 of these / 15 credits ──────
        // i. Literature and Cultural Studies
        { code: 'ENG3108', unescoCode: 'ENG3108', title: 'Cinema and Literature', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG3205', unescoCode: 'ENG3205', title: 'Postcolonial Theories and Literature', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG3206', unescoCode: 'ENG3206', title: 'African Writings in English', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG3207', unescoCode: 'ENG3207', title: 'Culture and Representations', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG3208', unescoCode: 'ENG3208', title: 'Epics of World Literature', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG3209', unescoCode: 'ENG3209', title: 'Studies in Popular Culture', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG3210', unescoCode: 'ENG3210', title: 'Modern Continental Literature', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG3304', unescoCode: 'ENG3304', title: 'South Asian Literature', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4104', unescoCode: 'ENG4104', title: 'Introduction to Cultural Studies', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4105', unescoCode: 'ENG4105', title: 'Ecocriticism', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4106', unescoCode: 'ENG4106', title: 'Contemporary Literatures in English', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4111', unescoCode: 'ENG4111', title: 'Eastern Classics in Translation', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4201', unescoCode: 'ENG4201', title: 'Gender Theory and Literature', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4202', unescoCode: 'ENG4202', title: 'Bangladeshi Writing in English and in English Translation', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4203', unescoCode: 'ENG4203', title: 'World Literature in Translation - I (Non-European)', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4204', unescoCode: 'ENG4204', title: 'World Literature in Translation - II (European)', prereq: [], category: 'MajorElective', oldCodes: [] },
        // ii. Applied Linguistics and TESOL
        { code: 'ENG3211', unescoCode: 'ENG3211', title: 'Critical Language Awareness', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG3212', unescoCode: 'ENG3212', title: 'Methodology of Language Teaching', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG3213', unescoCode: 'ENG3213', title: 'English in the Workplace', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG3215', unescoCode: 'ENG3215', title: 'Classroom Techniques', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG3216', unescoCode: 'ENG3216', title: 'Teaching Reading and Writing', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG3217', unescoCode: 'ENG3217', title: 'Teaching Listening and Speaking', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4107', unescoCode: 'ENG4107', title: 'Syllabus Design and Materials Development', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4108', unescoCode: 'ENG4108', title: 'Critical Literacy and Technology', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4109', unescoCode: 'ENG4109', title: 'Teaching Language through Literature', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4110', unescoCode: 'ENG4110', title: 'Historical Linguistics', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4117', unescoCode: 'ENG4117', title: 'Teaching Young Learners', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4206', unescoCode: 'ENG4206', title: 'Teaching Practicum', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4207', unescoCode: 'ENG4207', title: 'Critical Pedagogy', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4209', unescoCode: 'ENG4209', title: 'Testing and Assessment', prereq: [], category: 'MajorElective', oldCodes: [] },
        // iii. Creative Writing
        { code: 'ENG4102', unescoCode: 'ENG4102', title: 'Introduction to Creative Writing', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4211', unescoCode: 'ENG4211', title: 'Creative Writing: Fiction', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4315', unescoCode: 'ENG4315', title: 'Creative Writing: Poetry', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4316', unescoCode: 'ENG4316', title: 'Creative Writing: Dialogue and Scriptwriting', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4317', unescoCode: 'ENG4317', title: 'Creative Writing: Non-fiction', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4318', unescoCode: 'ENG4318', title: 'Film Adaptations', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4319', unescoCode: 'ENG4319', title: 'Animation', prereq: [], category: 'MajorElective', oldCodes: [] },
        // iv. Translation Studies
        { code: 'ENG3390', unescoCode: 'ENG3390', title: 'Introduction to Translation Theory', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4205', unescoCode: 'ENG4205', title: 'Classics of Translation', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4291', unescoCode: 'ENG4291', title: 'Literary Translation: Bengali to English', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4292', unescoCode: 'ENG4292', title: 'Literary Translation: English to Bengali', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4293', unescoCode: 'ENG4293', title: 'Translating in a Professional Context', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4420', unescoCode: 'ENG4420', title: 'Translation Project', prereq: [], category: 'MajorElective', oldCodes: [] },
        // Seen in real URMS data but not in the PDF's concentration lists
        // above — kept as additional electives rather than guessed into one
        // of the 4 named concentrations.
        { code: 'ENG4112', unescoCode: 'ENG4112', title: 'Postmodernism in Literature', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'ENG4118', unescoCode: 'ENG4118', title: 'Clinical and Forensic Linguistics', prereq: [], category: 'MajorElective', oldCodes: [] },

        // ── Minor in English courses offered to OTHER departments' students —
        // seen in real URMS data, included so their titles resolve if an
        // English-major student's record happens to reference them too. ────
        { code: 'ENG2820', unescoCode: 'ENG2820', title: 'English for Professional Purposes', prereq: [], category: 'OptionalMinor', oldCodes: [] },
        { code: 'ENG2822', unescoCode: 'ENG2822', title: 'English in Media', prereq: [], category: 'OptionalMinor', oldCodes: [] },

        // ── Dissertation/Internship/Project/Non-thesis (1 course / 3 credits) ─
        { code: 'ENG4297', unescoCode: 'ENG4297', title: 'Project', prereq: [], category: 'Internship', oldCodes: [] },
        { code: 'ENG4298', unescoCode: 'ENG4298', title: 'Internship', prereq: [], category: 'Internship', oldCodes: [] },
        { code: 'ENG4299', unescoCode: 'ENG4299', title: 'Dissertation', prereq: [], category: 'Internship', oldCodes: [] },
        { code: 'ENG4208', unescoCode: 'ENG4208', title: 'Advanced Composition and Stylistics', prereq: [], category: 'Internship', oldCodes: [] },
    ];

    // Degree requirements for BA in English and Humanities (120 credits
    // total) — from the catalogue's "Degree Requirements for Bachelor of
    // Arts in English" table.
    const DEGREE_REQUIREMENTS = {
        labels: {
            GED: 'General Education (GEF/UCC/GED Elective)',
            MajorCore: 'Major Core Courses',
            MajorElective: 'Major Elective (Concentration) Courses',
            OptionalMinor: 'Minor/Optional',
            Internship: 'Dissertation/Internship/Project/Non-thesis',
        },
        credits: {
            GED: 24,
            MajorCore: 63,
            MajorElective: 15,
            OptionalMinor: 15,
            Internship: 3,
        },
        total: 120,
    };

    // Fallback classifier for course codes not individually listed above
    // (other-department Minor/Optional courses). Pattern-based on the raw
    // course-code prefix — heuristic, not authoritative (see file header).
    function classifyByPattern(codeRaw) {
        const code = (codeRaw || '').toUpperCase();
        if (/^ESK/.test(code)) return 'ESK';
        if (/^(GEF|UCC|GED|HUM|SSC|NSC|ELL)/.test(code)) return 'GED';
        return 'OptionalMinor';
    }

    const catalogue = window.buildUlabCatalogue({ courses: COURSES, degreeRequirements: DEGREE_REQUIREMENTS, classifyByPattern });

    window.ULAB_CATALOGUES = window.ULAB_CATALOGUES || {};
    window.ULAB_CATALOGUES.ENGLISH = catalogue;
})();
