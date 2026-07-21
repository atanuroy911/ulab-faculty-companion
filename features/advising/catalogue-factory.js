// features/advising/catalogue-factory.js — shared builder for per-program
// course catalogues. Each program file under features/advising/catalogues/
// calls window.buildUlabCatalogue({ courses, degreeRequirements,
// classifyByPattern }) and gets back an object shaped exactly like the
// original (CSE-only) window.ULAB_CATALOGUE — same lookup/classification
// helpers, just built from that program's own course list.
(function () {
    function normalizeUnesco(code) {
        return (code || '').replace(/\s+/g, '').toUpperCase();
    }

    // Local course codes (e.g. "CSE1301") are the legacy identifier scheme —
    // UNESCO codes are the newer one. Normalized by stripping everything but
    // letters/digits, since legacy codes appear with inconsistent
    // spacing/hyphenation ("CSE 1301", "CSE-1301", "CSE1301").
    function normalizeLocalCode(code) {
        return (code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    }

    // Builds a catalogue object from a program's COURSES array and
    // DEGREE_REQUIREMENTS table. `classifyByPattern(unescoCode)` is a
    // program-specific heuristic fallback used for elective/minor courses
    // not individually listed in `courses` — see each program file for its
    // own pattern and caveats.
    function buildUlabCatalogue({ courses, degreeRequirements, classifyByPattern }) {
        const byCode = {};
        const byUnesco = {};
        const byLocalCode = {};
        for (const c of courses) {
            byCode[c.code] = c;
            byUnesco[normalizeUnesco(c.unescoCode)] = c;
            byLocalCode[normalizeLocalCode(c.code)] = c;
            for (const old of (c.oldCodes || [])) {
                byUnesco[normalizeUnesco(old)] = c;
            }
        }

        function resolveCourse(rawCode) {
            return byUnesco[normalizeUnesco(rawCode)] || byLocalCode[normalizeLocalCode(rawCode)] || null;
        }

        // Lab/theory pairing — derived generically from UNESCO numbering
        // (every lab is numbered exactly one above its theory course) rather
        // than hand-listed, so it stays correct if `courses` changes.
        const labTheoryMap = {};
        for (const c of courses) {
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

        return {
            courses,
            byCode,
            byUnesco,
            byLocalCode,
            normalizeUnesco,
            normalizeLocalCode,
            degreeRequirements,
            resolve: resolveCourse,
            theoryForLab(codeRaw) {
                const course = resolveCourse(codeRaw);
                if (!course) return null;
                return labTheoryMap[normalizeUnesco(course.unescoCode)] || null;
            },
            prereqUnescoFor(codeRaw) {
                const course = resolveCourse(codeRaw);
                if (!course) return [];
                return course.prereq.map(code => (byCode[code] ? byCode[code].unescoCode : code));
            },
            titleFor(codeRaw) {
                const course = resolveCourse(codeRaw);
                return course ? course.title : '';
            },
            categoryFor(codeRaw) {
                const course = resolveCourse(codeRaw);
                if (course) return course.category;
                return classifyByPattern ? classifyByPattern(normalizeUnesco(codeRaw)) : 'Unknown';
            },
            isLegacyCode(codeRaw) {
                const course = resolveCourse(codeRaw);
                return !!course && normalizeUnesco(codeRaw) !== normalizeUnesco(course.unescoCode);
            },
        };
    }

    window.buildUlabCatalogue = buildUlabCatalogue;
})();
