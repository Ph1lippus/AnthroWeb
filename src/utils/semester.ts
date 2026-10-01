/**
 * Semester labelling.
 *
 * Two conventions collide here, and this file is the single place they are
 * resolved so the service, the modals and the containers never disagree:
 *
 *   1. An academic year spans two calendar years. Institutions call it
 *      "2025/2026", so it is stored as the START year (2025) and rendered as a
 *      range. Storing a single year would make September 2025 and January 2026
 *      look like different terms when they are the same academic year.
 *
 *   2. A semester is numbered 1-3 within that year (many Belgian and Dutch
 *      programmes run three), and that number is what identifies the term.
 *
 * The name is derived from the two above, so it stays correct when either
 * changes. Users can still override it; an empty stored name means "derive it".
 */

/** Academic years start in September. */
const ACADEMIC_YEAR_START_MONTH = 9;

/** Lowest and highest year we accept, to keep typos out of the database. */
export const MIN_ACADEMIC_YEAR = 1950;
export const MAX_ACADEMIC_YEAR = 2200;

/** How many terms a year can hold. Matches the CHECK on academic_semesters. */
export const MAX_SEMESTER = 3;

const clampYear = (year: number): number => {
    if (!Number.isFinite(year)) return MIN_ACADEMIC_YEAR;
    return Math.min(MAX_ACADEMIC_YEAR, Math.max(MIN_ACADEMIC_YEAR, Math.round(year)));
};

const clampSemester = (semester: number): number | null => {
    if (!Number.isFinite(semester)) return null;
    const rounded = Math.round(semester);
    if (rounded < 1 || rounded > MAX_SEMESTER) return null;
    return rounded;
};

/** The academic year the current date falls in, as its starting year. */
export const currentAcademicYear = (now: Date = new Date()): number =>
    now.getMonth() + 1 >= ACADEMIC_YEAR_START_MONTH ? now.getFullYear() : now.getFullYear() - 1;

/** 2025 -> "2025/2026" */
export const academicYearLabel = (startYear: number): string => {
    const year = clampYear(startYear);
    return `${year}/${year + 1}`;
};

/** The full identity of a term: which semester, of which academic year. */
export const semesterLabel = (startYear: number, semester: number): string => {
    const number = clampSemester(semester);
    return number === null
        ? `Academic year ${academicYearLabel(startYear)}`
        : `Semester ${number} · ${academicYearLabel(startYear)}`;
};

/**
 * What to show as a semester's title. A blank stored name means the user never
 * typed one, so the derived label is used. Resolving at render time rather than
 * on write is what lets a semester that was auto-named follow a later change to
 * its year or number.
 */
export const resolveSemesterName = (
    name: string | null | undefined,
    startYear: number,
    semester: number,
): string => {
    const trimmed = (name ?? '').trim();
    return trimmed.length > 0 ? trimmed : semesterLabel(startYear, semester);
};

/** True when the displayed title is derived rather than user-written. */
export const hasCustomSemesterName = (name: string | null | undefined): boolean =>
    (name ?? '').trim().length > 0;