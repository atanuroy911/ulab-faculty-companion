// features/advising/catalogues/bba.js — BBA (Bachelor of Business
// Administration) course catalogue & degree-requirement map.
//
// Course list transcribed from "Course-Catalogue-Undergraduate-Summer-2026.pdf"
// (Bachelor of Business Administration section). UNESCO codes were then
// cross-matched by course TITLE against "courses-scrapped-urms.txt" (a real
// export of URMS course codes, which lists both the UNESCO code and the old
// local code for each course actually offered). Where a confident title
// match was found, `unescoCode` holds the real UNESCO code and the local
// code is recorded in `oldCodes`; where no match was found in the scrape,
// `unescoCode` falls back to equalling the local `code` (unverified — flag
// if a student's row doesn't resolve). Matches were only accepted when the
// scraped title matched closely AND the UNESCO segment made sense for BBA
// (011 = BBA core, 051 = BBA/EMBA shared concentration pool) — ambiguous or
// grad-only (052/055) matches were left unmapped rather than guessed.
//
// Categories used: GED (GEF+UCC+GED-elective, matching the catalogue's own
// combined numbering), MajorCore, MajorElective, OptionalMinor, Internship.
// ESK is non-credit and not tracked in DEGREE_REQUIREMENTS (same convention
// as catalogues/cse.js).
(function () {
    const COURSES = [
        // ── GEF / UCC / ESK (no prerequisites) ──────────────────────────────
        { code: 'GEF1101', unescoCode: '0231-000-1101', title: 'Academic English I', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'GEF1201', unescoCode: '0231-000-1201', title: 'Academic English II', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'UCC1101', unescoCode: '0232-000-1101', title: 'Bangla Bhasha O Sahitya', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'UCC1201', unescoCode: '0222-000-1201', title: 'History of the Emergence of Independent Bangladesh', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'UCC1202', unescoCode: '0223-000-1202', title: 'Ethics', prereq: [], category: 'GED', oldCodes: [] },
        { code: 'ESK1110', unescoCode: '0031-000-1110', title: 'Study Skills', prereq: [], category: 'ESK', oldCodes: [] },
        { code: 'ESK1111', unescoCode: '0031-000-1111', title: 'Healthy Life Skills', prereq: [], category: 'ESK', oldCodes: [] },
        { code: 'ESK1112', unescoCode: '0031-000-1112', title: 'Social Skills', prereq: [], category: 'ESK', oldCodes: [] },
        { code: 'ESK1113', unescoCode: '0031-000-1113', title: 'Professional Skills', prereq: [], category: 'ESK', oldCodes: [] },

        // ── Major Core (20 courses / 60 credits) ────────────────────────────
        { code: 'BUS1101', unescoCode: '0410-011-1101', title: 'Introduction to Business', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'BUS1201', unescoCode: '0488-011-1201', title: 'Business Mathematics', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'BUS1301', unescoCode: '0411-011-1301', title: 'Financial Accounting', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'BUS1302', unescoCode: '0488-011-1302', title: 'Micro Economics', prereq: ['BUS1201'], category: 'MajorCore', oldCodes: [] },
        { code: 'BUS2101', unescoCode: '0488-011-2101', title: 'Macro Economics', prereq: ['BUS1302'], category: 'MajorCore', oldCodes: [] },
        { code: 'BUS2102', unescoCode: '0488-011-2102', title: 'Business Statistics', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'BUS2103', unescoCode: '0413-011-2103', title: 'Principles of Management', prereq: ['BUS1101'], category: 'MajorCore', oldCodes: [] },
        { code: 'BUS2201', unescoCode: '0488-011-2201', title: 'Quantitative Analysis for Business', prereq: ['BUS2102'], category: 'MajorCore', oldCodes: [] },
        { code: 'BUS2202', unescoCode: '0488-011-2202', title: 'Business Communication', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'BUS2203', unescoCode: '0488-011-2203', title: 'Legal Environment of Business', prereq: ['BUS1101'], category: 'MajorCore', oldCodes: [] },
        // No 011-segment UNESCO row found for Marketing Management in the
        // scrape (only the 051-segment "MKT501" one below, used for the
        // concentration elective) — left unmapped rather than guessed.
        { code: 'BUS2301', unescoCode: 'BUS2301', title: 'Marketing Management', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'BUS2302', unescoCode: '0413-051-525', title: 'Organizational Behavior', prereq: ['BUS2103'], category: 'MajorCore', oldCodes: [] },
        { code: 'BUS2303', unescoCode: '0412-051-501', title: 'Financial Management', prereq: ['BUS1301'], category: 'MajorCore', oldCodes: ['FIN501'] },
        { code: 'BUS3101', unescoCode: '0413-051-501', title: 'Human Resource Management', prereq: ['BUS2302'], category: 'MajorCore', oldCodes: ['HRM501'] },
        { code: 'BUS3102', unescoCode: '0413-000-503', title: 'Entrepreneurship', prereq: [], category: 'MajorCore', oldCodes: [] },
        { code: 'BUS3103', unescoCode: '0415-051-502', title: 'International Business', prereq: ['BUS2101', 'BUS1301'], category: 'MajorCore', oldCodes: ['BGE502'] },
        { code: 'BUS3104', unescoCode: '0411-051-516', title: 'Managerial Accounting', prereq: ['BUS1301'], category: 'MajorCore', oldCodes: [] },
        { code: 'BUS3201', unescoCode: 'BUS3201', title: 'Research Methodology', prereq: ['BUS2201'], category: 'MajorCore', oldCodes: [] },
        { code: 'BUS3202', unescoCode: '0416-051-501', title: 'Operations Management', prereq: [], category: 'MajorCore', oldCodes: ['SCM501'] },
        { code: 'BUS4999', unescoCode: 'BUS4999', title: 'Strategic Management', prereq: [], category: 'MajorCore', oldCodes: [] },

        // ── Project / Internship ─────────────────────────────────────────
        { code: 'BUS4398', unescoCode: 'BUS4398', title: 'Project', prereq: [], category: 'Internship', oldCodes: [] },
        { code: 'BUS4399', unescoCode: 'BUS4399', title: 'Internship', prereq: [], category: 'Internship', oldCodes: [] },

        // ── Major Elective (Concentration) courses seen in real URMS data ───
        // Only the concentration courses that actually turned up as
        // registered local codes in the URMS scrape are individually listed;
        // the rest of each concentration's course pool (see the PDF) is
        // still covered by classifyByPattern() below.
        { code: 'BUS4131', unescoCode: '0412-051-604', title: 'Corporate Finance', prereq: [], category: 'MajorElective', oldCodes: ['FIN604'] },
        { code: 'BUS4132', unescoCode: '0412-051-602', title: 'Financial Markets and Institutions', prereq: [], category: 'MajorElective', oldCodes: ['FIN602'] },
        { code: 'BUS4133', unescoCode: 'BUS4133', title: 'Security Analysis and Portfolio Management', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'BUS4141', unescoCode: 'BUS4141', title: 'Bank Management', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'BUS4142', unescoCode: 'BUS4142', title: 'Project Finance', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'BUS4111', unescoCode: 'BUS4111', title: 'Cost Accounting', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'BUS4112', unescoCode: 'BUS4112', title: 'Accounting Information System', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'BUS4113', unescoCode: 'BUS4113', title: 'Intermediate Accounting I', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'BUS4114', unescoCode: 'BUS4114', title: 'Intermediate Accounting II', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'BUS4121', unescoCode: 'BUS4121', title: 'Assurance and Auditing', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'BUS4151', unescoCode: 'BUS4151', title: 'Managerial Skills Development', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'BUS4152', unescoCode: 'BUS4152', title: 'Industrial and Employee Relations', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'BUS4154', unescoCode: '0413-051-602', title: 'Training and Development', prereq: [], category: 'MajorElective', oldCodes: ['HRM602'] },
        { code: 'BUS4162', unescoCode: 'BUS4162', title: 'Strategic Human Resource Management', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'BUS4171', unescoCode: '0414-051-601', title: 'Consumer Behavior', prereq: [], category: 'MajorElective', oldCodes: ['MKT601'] },
        { code: 'BUS4172', unescoCode: 'BUS4172', title: 'Service Marketing', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'BUS4173', unescoCode: '0414-051-602', title: 'Integrated Marketing Communication', prereq: [], category: 'MajorElective', oldCodes: ['MKT602'] },
        { code: 'BUS4183', unescoCode: '0414-051-604', title: 'Brand Management', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'BUS4184', unescoCode: '0414-051-603', title: 'Personal Selling & Sales Force Management', prereq: [], category: 'MajorElective', oldCodes: ['MKT603'] },
        { code: 'SCM4501', unescoCode: '0416-051-604', title: 'Principles of Supply Chain Management', prereq: [], category: 'MajorElective', oldCodes: ['SCM604'] },
        { code: 'SCM4502', unescoCode: '0416-051-602', title: 'Logistics Management', prereq: [], category: 'MajorElective', oldCodes: ['SCM602'] },
        { code: 'SCM4503', unescoCode: '0416-051-605', title: 'Procurement Management', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'SCM4507', unescoCode: 'SCM4507', title: 'Global Supply Chain Management', prereq: [], category: 'MajorElective', oldCodes: [] },
        { code: 'SCM4510', unescoCode: 'SCM4510', title: 'Maritime Logistics', prereq: [], category: 'MajorElective', oldCodes: [] },
    ];

    // Degree requirements for BBA (120 credits total) — from the catalogue's
    // "Degree Requirements for Bachelor of Business Administration" table.
    const DEGREE_REQUIREMENTS = {
        labels: {
            GED: 'General Education (GEF/UCC/GED Elective)',
            MajorCore: 'Major Core Courses',
            MajorElective: 'Major Elective (Concentration) Courses',
            OptionalMinor: 'Minor/Optional',
            Internship: 'Project/Internship',
        },
        credits: {
            GED: 24,
            MajorCore: 60,
            MajorElective: 18,
            OptionalMinor: 15,
            Internship: 3,
        },
        total: 120,
    };

    // Best-effort category classifier for course codes NOT individually
    // listed above: the 6-of-9 concentration Major Elective courses (BUS
    // 41xx–42xx and SCM 45xx codes across Accounting, Finance, HRM,
    // Marketing, SCM, Banking & Insurance, Economics, Management,
    // Entrepreneurship, MIS/e-Business — ~90 courses total, not worth hand-
    // listing) and other-department Minor/Optional courses. Pattern-based on
    // the raw course-code prefix — heuristic, not authoritative (see file
    // header re: no UNESCO codes available for this program).
    function classifyByPattern(codeRaw) {
        const code = (codeRaw || '').toUpperCase();
        if (/^ESK/.test(code)) return 'ESK';
        if (/^(GEF|UCC|GED|HUM|SSC|NSC)/.test(code)) return 'GED';
        if (/^BUS4[12]\d\d$/.test(code)) return 'MajorElective';
        if (/^SCM4\d\d\d$/.test(code)) return 'MajorElective';
        return 'OptionalMinor';
    }

    const catalogue = window.buildUlabCatalogue({ courses: COURSES, degreeRequirements: DEGREE_REQUIREMENTS, classifyByPattern });

    window.ULAB_CATALOGUES = window.ULAB_CATALOGUES || {};
    window.ULAB_CATALOGUES.BBA = catalogue;
})();
