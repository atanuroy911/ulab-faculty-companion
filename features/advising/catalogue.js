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
// unescoCode is normalised (no spaces) since that's the format URMS returns
// in student course-history tables.
(function () {
    const COURSES = [
        // ── Pre-Uni / GEF / ESK / UCC / GED (no prerequisites) ──────────────
        { code: 'ELL0099', unescoCode: '0231-000-0099', title: 'Remedial English', prereq: [] },
        { code: 'GEF1101', unescoCode: '0231-000-1101', title: 'Academic English I', prereq: [] },
        { code: 'GEF1201', unescoCode: '0231-000-1201', title: 'Academic English II', prereq: [] },
        { code: 'ESK1110', unescoCode: '0031-000-1110', title: 'Study Skills', prereq: [] },
        { code: 'ESK1111', unescoCode: '0031-000-1111', title: 'Healthy Life Skills', prereq: [] },
        { code: 'ESK1112', unescoCode: '0031-000-1112', title: 'Social Skills', prereq: [] },
        { code: 'ESK1113', unescoCode: '0031-000-1113', title: 'Professional Skills', prereq: [] },
        { code: 'UCC1101', unescoCode: '0232-000-1101', title: 'Bangla Bhasha O Sahitya', prereq: [] },
        { code: 'UCC1201', unescoCode: '0222-000-1201', title: 'History of the Emergence of Independent Bangladesh', prereq: [] },
        { code: 'GED2159', unescoCode: '0223-000-2159', title: 'Professional Ethics', prereq: [] },
        { code: 'SSC2243', unescoCode: '0521-000-2243', title: 'Environment and Sustainability', prereq: [] },
        { code: 'NSC2248', unescoCode: '0417-000-2248', title: 'Industrial Management', prereq: [] },

        // ── Math & Statistics ────────────────────────────────────────────
        { code: 'MAT1103', unescoCode: '0541-014-1103', title: 'Calculus and Differential Equations', prereq: [] },
        { code: 'MAT1203', unescoCode: '0541-014-1203', title: 'Coordinate Geometry, Vector Analysis and Complex Variables', prereq: ['MAT1103'] },
        { code: 'MAT2103', unescoCode: '0541-014-2103', title: 'Linear Algebra and Numerical Analysis', prereq: ['MAT1203'] },
        { code: 'STA2101', unescoCode: '0542-014-2101', title: 'Probability and Statistics', prereq: [] },

        // ── Basic Science ────────────────────────────────────────────────
        { code: 'PHY1101', unescoCode: '0533-014-1101', title: 'Physics I', prereq: [] },
        { code: 'PHY1102', unescoCode: '0533-014-1102', title: 'Physics I Lab', prereq: [] },
        { code: 'PHY1301', unescoCode: '0533-014-1301', title: 'Physics II', prereq: ['PHY1101'] },

        // ── Other Engineering ────────────────────────────────────────────
        { code: 'EEE1101', unescoCode: '0713-016-1101', title: 'Electrical Circuit 1', prereq: [] },
        { code: 'EEE1102', unescoCode: '0713-016-1102', title: 'Electrical Circuit 1 Lab', prereq: [] },
        { code: 'EEE1301', unescoCode: '0714-016-1301', title: 'Electronic Device and Circuits 1', prereq: ['EEE1101', 'EEE1102'] },
        { code: 'EEE1302', unescoCode: '0714-016-1302', title: 'Electronic Device and Circuits 1 Lab', prereq: ['EEE1101', 'EEE1102'] },

        // ── Major Core ───────────────────────────────────────────────────
        { code: 'CSE1201', unescoCode: '0613-014-1201', title: 'Structured Programming', prereq: [] },
        { code: 'CSE1202', unescoCode: '0613-014-1202', title: 'Structured Programming LAB', prereq: [] },
        { code: 'CSE1203', unescoCode: '0613-014-1203', title: 'Discrete Mathematics', prereq: [] },
        { code: 'CSE1301', unescoCode: '0613-014-1301', title: 'Data Structures', prereq: ['CSE1201', 'CSE1202'] },
        { code: 'CSE1302', unescoCode: '0613-014-1302', title: 'Data Structures LAB', prereq: ['CSE1201', 'CSE1202'] },
        { code: 'CSE2101', unescoCode: '0613-014-2101', title: 'Digital Logic Design', prereq: [] },
        { code: 'CSE2102', unescoCode: '0613-014-2102', title: 'Digital Logic Design Lab', prereq: [] },
        { code: 'CSE2103', unescoCode: '0613-014-2103', title: 'Object Oriented Programming', prereq: ['CSE1301', 'CSE1302'] },
        { code: 'CSE2104', unescoCode: '0613-014-2104', title: 'Object Oriented Programming LAB', prereq: ['CSE1301', 'CSE1302'] },
        { code: 'CSE2201', unescoCode: '0613-014-2201', title: 'Algorithms', prereq: ['CSE1301', 'CSE1302', 'CSE1203'] },
        { code: 'CSE2202', unescoCode: '0613-014-2202', title: 'Algorithms LAB', prereq: ['CSE1301', 'CSE1302', 'CSE1203'] },
        { code: 'CSE2203', unescoCode: '0613-014-2203', title: 'Computer Organization and Architecture', prereq: ['CSE2101', 'CSE2102'] },
        { code: 'CSE2200', unescoCode: '0613-014-2200', title: 'Design Project-I', prereq: ['CSE2103', 'CSE2104'] },
        { code: 'CSE2301', unescoCode: '0612-014-2301', title: 'Database Management System', prereq: [] },
        { code: 'CSE2302', unescoCode: '0612-014-2302', title: 'Database Management System Lab', prereq: [] },
        { code: 'CSE2303', unescoCode: '0613-014-2303', title: 'Automata and Theory of Computation', prereq: ['CSE2201', 'CSE2202'] },
        { code: 'CSE2305', unescoCode: '0613-014-2305', title: 'Operating Systems', prereq: ['CSE2203'] },
        { code: 'CSE2306', unescoCode: '0613-014-2306', title: 'Operating Systems Lab', prereq: ['CSE2203'] },
        { code: 'CSE3101', unescoCode: '0613-014-3101', title: 'Microprocessor and Microcontroller', prereq: ['CSE2203'] },
        { code: 'CSE3102', unescoCode: '0613-014-3102', title: 'Microprocessor and Microcontroller Lab', prereq: ['CSE2203'] },
        { code: 'CSE3103', unescoCode: '0613-014-3103', title: 'System Analysis and Design', prereq: ['CSE2103', 'CSE2104', 'CSE2200'] },
        { code: 'CSE3104', unescoCode: '0613-014-3104', title: 'System Analysis and Design Lab', prereq: ['CSE2103', 'CSE2104', 'CSE2200'] },
        { code: 'CSE3120', unescoCode: '0613-014-3120', title: 'Web Programming', prereq: ['CSE2301', 'CSE2302'] },
        { code: 'CSE3201', unescoCode: '0619-014-3201', title: 'Artificial Intelligence & Machine Learning', prereq: ['CSE2201', 'CSE2202', 'STA2101', 'MAT2103'] },
        { code: 'CSE3202', unescoCode: '0619-014-3202', title: 'Artificial Intelligence & Machine Learning Lab', prereq: ['CSE2201', 'CSE2202', 'STA2101', 'MAT2103'] },
        { code: 'CSE3203', unescoCode: '0613-014-3203', title: 'Software Engineering', prereq: ['CSE3103', 'CSE3104'] },
        { code: 'CSE3200', unescoCode: '0613-014-3200', title: 'Design Project-II', prereq: ['CSE2301', 'CSE2302', 'CSE3103', 'CSE3104', 'CSE2200'] },
        { code: 'CSE3205', unescoCode: '0612-014-3205', title: 'Computer Networks', prereq: [] },
        { code: 'CSE3206', unescoCode: '0612-014-3206', title: 'Computer Networks Lab', prereq: [] },
        { code: 'CSE3301', unescoCode: '0612-014-3301', title: 'Cyber Security', prereq: ['CSE2305', 'CSE2306', 'CSE3205', 'CSE3206'] },

        // ── Capstone / Internship ────────────────────────────────────────
        { code: 'CSE4098A', unescoCode: '0613-014-4098A', title: 'Capstone Project 1', prereq: ['CSE3103', 'CSE3203', 'CSE2200', 'CSE3200'], minCreditsCompleted: 105 },
        { code: 'CSE4098B', unescoCode: '0613-014-4098B', title: 'Capstone Project 2', prereq: ['CSE4098A'] },
        { code: 'CSE4098C', unescoCode: '0613-014-4098C', title: 'Capstone Project 3', prereq: ['CSE4098B'] },
        { code: 'CSE4099A', unescoCode: '0613-014-4099A', title: 'Internship', prereq: ['CSE4098C'] },
        { code: 'CSE4099B', unescoCode: '0613-014-4099B', title: 'Thesis', prereq: ['CSE4098C'] },
    ];

    function normalizeUnesco(code) {
        return (code || '').replace(/\s+/g, '').toUpperCase();
    }

    const byCode = {};
    const byUnesco = {};
    for (const c of COURSES) {
        byCode[c.code] = c;
        byUnesco[normalizeUnesco(c.unescoCode)] = c;
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

    window.ULAB_CATALOGUE = {
        courses: COURSES,
        byCode,
        byUnesco,
        normalizeUnesco,
        // Returns the theory course object for a lab's UNESCO code, or null if
        // this course isn't a lab / has no derivable theory sibling.
        theoryForLab(unescoCode) {
            return labTheoryMap[normalizeUnesco(unescoCode)] || null;
        },
        // Prerequisites as UNESCO codes for a given UNESCO course code (or [] if unknown/none).
        prereqUnescoFor(unescoCode) {
            const course = byUnesco[normalizeUnesco(unescoCode)];
            if (!course) return [];
            return course.prereq.map(code => (byCode[code] ? byCode[code].unescoCode : code));
        },
        titleFor(unescoCode) {
            const course = byUnesco[normalizeUnesco(unescoCode)];
            return course ? course.title : '';
        },
    };
})();
