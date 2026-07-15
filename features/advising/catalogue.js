// features/advising/catalogue.js — CSE course catalogue & prerequisite map.
//
// Transcribed from "UD Course Catalogue -UNESCO CODE (CSE)_updated (1).pdf"
// using `pdftotext -table`, which keeps the prerequisite column aligned to
// its row far more reliably than plain `-layout` mode (an earlier version of
// this file, built from `-layout` output, had several prerequisites shifted
// onto the wrong course — CSE3120, CSE3201/3202, CSE3203, CSE3200,
// CSE3205/3206, CSE3301, and the Capstone chain were all wrong; fixed here).
//
// Only Math & Statistics, Basic Science, Other Engineering, and Major Core
// declare prerequisites in the catalogue — GED/ESK/GEF/UCC and concentration
// electives have none, but are still listed below (with empty prereq) so
// their titles resolve when shown against a student's course history.
//
// Every course also carries a `category`: GED, ESK, Mathematics,
// BasicScience, OtherEngineering, MajorCore, MajorElective, OptionalMinor.
// Only the first seven of those (not ESK — confirmed not part of the CSE
// degree requirement, despite appearing in the catalogue's course listing)
// are tracked in DEGREE_REQUIREMENTS below, against the "Degree Requirements
// for Bachelor of Science in CSE" table. Major Elective (8 concentration
// groups, ~70 courses) and Optional/Minor (any other department's course)
// are NOT individually
// enumerated here — those are classified by UNESCO-code pattern instead via
// categoryFor(), since the exact list varies and isn't fixed by this
// catalogue. Treat that classification as heuristic, not authoritative.
//
// unescoCode is normalised (no spaces) since that's the format URMS returns
// in student course-history tables.
(function () {
    const COURSES = [
        // ── Pre-Uni / GEF / ESK / UCC / GED (no prerequisites) ──────────────
        { code: 'ELL0099', unescoCode: '0231-000-0099', title: 'Remedial English', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'GEF1101', unescoCode: '0231-000-1101', title: 'Academic English I', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'GEF1201', unescoCode: '0231-000-1201', title: 'Academic English II', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'ESK1110', unescoCode: '0031-000-1110', title: 'Study Skills', prereq: [], category: 'ESK', oldCodes: [] },
        { code: 'ESK1111', unescoCode: '0031-000-1111', title: 'Healthy Life Skills', prereq: [], category: 'ESK', oldCodes: [] },
        { code: 'ESK1112', unescoCode: '0031-000-1112', title: 'Social Skills', prereq: [], category: 'ESK', oldCodes: [] },
        { code: 'ESK1113', unescoCode: '0031-000-1113', title: 'Professional Skills', prereq: [], category: 'ESK', oldCodes: [] },
        { code: 'UCC1101', unescoCode: '0232-000-1101', title: 'Bangla Bhasha O Sahitya', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'UCC1201', unescoCode: '0222-000-1201', title: 'History of the Emergence of Independent Bangladesh', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'GED2159', unescoCode: '0223-000-2159', title: 'Professional Ethics', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'SSC2243', unescoCode: '0521-000-2243', title: 'Environment and Sustainability', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'NSC2248', unescoCode: '0417-000-2248', title: 'Industrial Management', prereq: [], category: 'GED', oldCodes: [] },

        // ── Math & Statistics ────────────────────────────────────────────
        { code: 'MAT1103', unescoCode: '0541-014-1103', title: 'Calculus and Differential Equations', prereq: [], category: 'Mathematics', oldCodes: [] },
        { code: 'MAT1203', unescoCode: '0541-014-1203', title: 'Coordinate Geometry, Vector Analysis and Complex Variables', prereq: ['MAT1103'], category: 'Mathematics', oldCodes: [] },
        { code: 'MAT2103', unescoCode: '0541-014-2103', title: 'Linear Algebra and Numerical Analysis', prereq: ['MAT1203'], category: 'Mathematics', oldCodes: [] },
        { code: 'STA2101', unescoCode: '0542-014-2101', title: 'Probability and Statistics', prereq: [], category: 'Mathematics', oldCodes: [] },

        // ── Basic Science ────────────────────────────────────────────────
        { code: 'PHY1101', unescoCode: '0533-014-1101', title: 'Physics I', prereq: [], category: 'BasicScience', oldCodes: [] },
        { code: 'PHY1102', unescoCode: '0533-014-1102', title: 'Physics I Lab', prereq: [], category: 'BasicScience', oldCodes: [] },
        { code: 'PHY1301', unescoCode: '0533-014-1301', title: 'Physics II', prereq: ['PHY1101'], category: 'BasicScience', oldCodes: [] },

        // ── Other Engineering ────────────────────────────────────────────
        { code: 'EEE1101', unescoCode: '0713-016-1101', title: 'Electrical Circuit 1', prereq: [], category: 'OtherEngineering', oldCodes: [] },
        { code: 'EEE1102', unescoCode: '0713-016-1102', title: 'Electrical Circuit 1 Lab', prereq: [], category: 'OtherEngineering', oldCodes: [] },
        { code: 'EEE1301', unescoCode: '0714-016-1301', title: 'Electronic Device and Circuits 1', prereq: ['EEE1101', 'EEE1102'], category: 'OtherEngineering', oldCodes: [] },
        { code: 'EEE1302', unescoCode: '0714-016-1302', title: 'Electronic Device and Circuits 1 Lab', prereq: ['EEE1101', 'EEE1102'], category: 'OtherEngineering', oldCodes: [] },

        // ── Major Core ───────────────────────────────────────────────────
        { code: 'CSE1201', unescoCode: '0613-014-1201', title: 'Structured Programming', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE1202', unescoCode: '0613-014-1202', title: 'Structured Programming LAB', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE1203', unescoCode: '0613-014-1203', title: 'Discrete Mathematics', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE1301', unescoCode: '0613-014-1301', title: 'Data Structures', prereq: ['CSE1201', 'CSE1202'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE1302', unescoCode: '0613-014-1302', title: 'Data Structures LAB', prereq: ['CSE1201', 'CSE1202'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE2101', unescoCode: '0613-014-2101', title: 'Digital Logic Design', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE2102', unescoCode: '0613-014-2102', title: 'Digital Logic Design Lab', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE2103', unescoCode: '0613-014-2103', title: 'Object Oriented Programming', prereq: ['CSE1301', 'CSE1302'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE2104', unescoCode: '0613-014-2104', title: 'Object Oriented Programming LAB', prereq: ['CSE1301', 'CSE1302'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE2201', unescoCode: '0613-014-2201', title: 'Algorithms', prereq: ['CSE1301', 'CSE1302', 'CSE1203'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE2202', unescoCode: '0613-014-2202', title: 'Algorithms LAB', prereq: ['CSE1301', 'CSE1302', 'CSE1203'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE2203', unescoCode: '0613-014-2203', title: 'Computer Organization and Architecture', prereq: ['CSE2101', 'CSE2102'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE2200', unescoCode: '0613-014-2200', title: 'Design Project-I', prereq: ['CSE2103', 'CSE2104'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE2301', unescoCode: '0612-014-2301', title: 'Database Management System', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE2302', unescoCode: '0612-014-2302', title: 'Database Management System Lab', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE2303', unescoCode: '0613-014-2303', title: 'Automata and Theory of Computation', prereq: ['CSE2201', 'CSE2202'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE2305', unescoCode: '0613-014-2305', title: 'Operating Systems', prereq: ['CSE2203'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE2306', unescoCode: '0613-014-2306', title: 'Operating Systems Lab', prereq: ['CSE2203'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE3101', unescoCode: '0613-014-3101', title: 'Microprocessor and Microcontroller', prereq: ['CSE2203'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE3102', unescoCode: '0613-014-3102', title: 'Microprocessor and Microcontroller Lab', prereq: ['CSE2203'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE3103', unescoCode: '0613-014-3103', title: 'System Analysis and Design', prereq: ['CSE2103', 'CSE2104', 'CSE2200'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE3104', unescoCode: '0613-014-3104', title: 'System Analysis and Design Lab', prereq: ['CSE2103', 'CSE2104', 'CSE2200'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE3120', unescoCode: '0613-014-3120', title: 'Web Programming', prereq: ['CSE2301', 'CSE2302'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE3201', unescoCode: '0619-014-3201', title: 'Artificial Intelligence & Machine Learning', prereq: ['CSE2201', 'CSE2202', 'STA2101', 'MAT2103'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE3202', unescoCode: '0619-014-3202', title: 'Artificial Intelligence & Machine Learning Lab', prereq: ['CSE2201', 'CSE2202', 'STA2101', 'MAT2103'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE3203', unescoCode: '0613-014-3203', title: 'Software Engineering', prereq: ['CSE3103', 'CSE3104'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE3200', unescoCode: '0613-014-3200', title: 'Design Project-II', prereq: ['CSE2301', 'CSE2302', 'CSE3103', 'CSE3104', 'CSE2200'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE3205', unescoCode: '0612-014-3205', title: 'Computer Networks', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE3206', unescoCode: '0612-014-3206', title: 'Computer Networks Lab', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE3301', unescoCode: '0612-014-3301', title: 'Cyber Security', prereq: ['CSE2305', 'CSE2306', 'CSE3205', 'CSE3206'], category: 'MajorCore', oldCodes: [] },

        // ── Capstone / Internship ────────────────────────────────────────
        { code: 'CSE4098A', unescoCode: '0613-014-4098A', title: 'Capstone Project 1', prereq: ['CSE3103', 'CSE3203', 'CSE2200', 'CSE3200'], minCreditsCompleted: 105, category: 'MajorCore', oldCodes: [] },
        { code: 'CSE4098B', unescoCode: '0613-014-4098B', title: 'Capstone Project 2', prereq: ['CSE4098A'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE4098C', unescoCode: '0613-014-4098C', title: 'Capstone Project 3', prereq: ['CSE4098B'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE4099A', unescoCode: '0613-014-4099A', title: 'Internship', prereq: ['CSE4098C'], category: 'MajorCore', oldCodes: [] },
        { code: 'CSE4099B', unescoCode: '0613-014-4099B', title: 'Thesis', prereq: ['CSE4098C'], category: 'MajorCore', oldCodes: [] },
    ];

    // Degree requirements for BSc in CSE (140 credits total) — from the
    // catalogue's "Degree Requirements" table. ESK (Essential Skills) is
    // NOT part of the CSE degree requirement — it's not tracked here, even
    // though ESK courses are still categorized below (for title lookups if a
    // student happens to have one on their record).
    const DEGREE_REQUIREMENTS = {
        labels: {
            GED: 'General Education (GED)',
            MajorCore: 'Major Core Courses',
            MajorElective: 'Major Elective Courses',
            OtherEngineering: 'Other Engineering',
            OptionalMinor: 'Optional/Minor',
            BasicScience: 'Basic Science',
            Mathematics: 'Mathematics',
        },
        credits: {
            GED: 24,
            MajorCore: 67,
            MajorElective: 13,
            OtherEngineering: 8,
            OptionalMinor: 9,
            BasicScience: 7,
            Mathematics: 12,
        },
        total: 140,
    };

    function normalizeUnesco(code) {
        return (code || '').replace(/\s+/g, '').toUpperCase();
    }

    // Local course codes (e.g. "CSE1301") are the legacy identifier scheme —
    // UNESCO codes are the newer one. Some students' history rows (typically
    // older/senior students who registered before the UNESCO switchover) can
    // still show the legacy local code instead of a UNESCO code, so local
    // codes need to be matchable the same way UNESCO codes are. Normalized by
    // stripping everything but letters/digits, since legacy codes appear with
    // inconsistent spacing/hyphenation ("CSE 1301", "CSE-1301", "CSE1301").
    function normalizeLocalCode(code) {
        return (code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    }

    const byCode = {};
    const byUnesco = {};
    const byLocalCode = {};
    for (const c of COURSES) {
        byCode[c.code] = c;
        byUnesco[normalizeUnesco(c.unescoCode)] = c;
        byLocalCode[normalizeLocalCode(c.code)] = c;
        // Further old/legacy UNESCO codes a course used to be listed under,
        // beyond its local code above — students' history can still show
        // these for courses taken before a renumbering. Not in the catalogue
        // PDF (it has no old-code column/mapping); add known ones to a
        // course's `oldCodes` array as they're identified.
        for (const old of (c.oldCodes || [])) {
            byUnesco[normalizeUnesco(old)] = c;
        }
    }

    // Resolves a course by either its UNESCO code or its legacy local code —
    // whichever format a student's record happens to show.
    function resolveCourse(rawCode) {
        return byUnesco[normalizeUnesco(rawCode)] || byLocalCode[normalizeLocalCode(rawCode)] || null;
    }

    // Lab/theory pairing — not declared as a formal "prerequisite" anywhere in
    // the catalogue PDF, but every lab in it is numbered exactly one above its
    // theory course (CSE2101 → CSE2102, EEE1101 → EEE1102, ...) and university
    // policy requires the theory to be taken before or alongside its lab.
    // Derived generically from that numbering rather than hand-listed, so it
    // stays correct if the catalogue array above changes.
    const labTheoryMap = {}; // normalized lab UNESCO code -> theory course object
    for (const c of COURSES) {
        if (!/\blab\b/i.test(c.title)) continue;
        const m = c.unescoCode.match(/^(\d+-\d+-)(\d+)$/);
        if (!m) continue;
        const [, prefix, numStr] = m;
        const theoryUnesco = prefix + String(parseInt(numStr, 10) - 1).padStart(numStr.length, '0');
        const theoryCourse = byUnesco[normalizeUnesco(theoryUnesco)];
        if (theoryCourse && !/\blab\b/i.test(theoryCourse.title)) {
            labTheoryMap[normalizeUnesco(c.unescoCode)] = theoryCourse;
        }
    }

    // Best-effort category classifier for UNESCO codes NOT individually
    // listed above (concentration electives and other-department Optional/
    // Minor courses) — pattern-based on UNESCO code segments, not exact.
    //
    // Verified against the catalogue's 8 concentration groups (Computational
    // Theory, Network & Communications, Security, Systems, Data Science,
    // Software Engineering, Hardware, ICT — 4 theory + 1 lab / 13 credits
    // each, matching DEGREE_REQUIREMENTS.credits.MajorElective below): almost
    // every elective's UNESCO code is <prefix>-4<rest> (e.g. 0613-014-4103).
    // One known exception: CSE4455 "Data Mining" is 0619-014-3355 — it will
    // be misclassified as OptionalMinor by this pattern rather than
    // MajorElective. Not worth hand-listing ~70 elective courses just to fix
    // one code; flagged here so it isn't a silent surprise.
    function classifyByPattern(unescoCode) {
        const m = unescoCode.match(/^(\d{4})-(\d{3})-(.+)$/);
        if (!m) return 'Unknown';
        const [, seg1, seg2, seg3] = m;
        if (seg1 === '0031') return 'ESK';
        if (seg2 === '000') return 'GED';
        if (['0613', '0612', '0619', '0688'].includes(seg1) && /^4/.test(seg3)) return 'MajorElective';
        return 'OptionalMinor';
    }

    window.ULAB_CATALOGUE = {
        courses: COURSES,
        byCode,
        byUnesco,
        byLocalCode,
        normalizeUnesco,
        normalizeLocalCode,
        degreeRequirements: DEGREE_REQUIREMENTS,
        // Resolves a course by either its UNESCO code or its legacy local
        // code (see resolveCourse above) — the general-purpose lookup.
        resolve: resolveCourse,
        // Returns the theory course object for a lab's code (UNESCO or legacy
        // local), or null if this course isn't a lab / has no derivable
        // theory sibling.
        theoryForLab(codeRaw) {
            const course = resolveCourse(codeRaw);
            if (!course) return null;
            return labTheoryMap[normalizeUnesco(course.unescoCode)] || null;
        },
        // Prerequisites as UNESCO codes for a given course code (UNESCO or
        // legacy local) — [] if unknown/none.
        prereqUnescoFor(codeRaw) {
            const course = resolveCourse(codeRaw);
            if (!course) return [];
            return course.prereq.map(code => (byCode[code] ? byCode[code].unescoCode : code));
        },
        titleFor(codeRaw) {
            const course = resolveCourse(codeRaw);
            return course ? course.title : '';
        },
        // Degree-requirement category for a course code (UNESCO or legacy
        // local) — exact match if this catalogue lists the course, otherwise
        // a pattern-based best guess (see classifyByPattern above; only
        // applies to UNESCO-shaped codes, since the pattern is UNESCO-code
        // structure — unrecognized local codes fall through to Unknown).
        categoryFor(codeRaw) {
            const course = resolveCourse(codeRaw);
            if (course) return course.category;
            return classifyByPattern(normalizeUnesco(codeRaw));
        },
        // True if this code resolved to a course but isn't that course's
        // current primary UNESCO code — i.e. it matched via the legacy local
        // code or a further old UNESCO code in `oldCodes`.
        isLegacyCode(codeRaw) {
            const course = resolveCourse(codeRaw);
            return !!course && normalizeUnesco(codeRaw) !== normalizeUnesco(course.unescoCode);
        },
    };
})();
