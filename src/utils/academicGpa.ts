import { round1 } from './units';

// =============================================================================
// Academic grading math.
//
// Everything here is pure so it can be reasoned about and tested without React,
// Supabase or the DOM. The three jobs:
//
//   1. Turn a flat list of items into a tree and resolve a percentage for any
//      node, no matter how deeply the user nested their sub-works.
//   2. Validate the user's own percentages per group without ever rewriting
//      them. A group that already sums to 100 is left exactly as it is.
//   3. Turn a set of teacher-given final grades into a GPA on any scale.
// =============================================================================

export type ItemCategory =
    | 'homework'
    | 'exam'
    | 'quiz'
    | 'project'
    | 'lab'
    | 'participation'
    | 'other';

export const ITEM_CATEGORIES: ItemCategory[] = [
    // Exam leads the list because it is the default for a new input, and the
    // most common thing a course has several of.
    'exam',
    'homework',
    'quiz',
    'project',
    'lab',
    'participation',
    'other',
];

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
    homework: 'Homework',
    exam: 'Exam',
    quiz: 'Quiz',
    project: 'Project',
    lab: 'Lab',
    participation: 'Participation',
    other: 'Other',
};

/**
 * The type a new input starts on, and so also the name it starts with. Exams
 * are what a course is usually built from, so it is the least surprising
 * starting point.
 */
export const DEFAULT_ITEM_CATEGORY: ItemCategory = 'exam';

/**
 * The type a new SUB-work starts on. A sub-work is a slice of something bigger
 * -- one problem set out of a homework, one section out of a project -- and
 * those slices are work you do rather than work you sit, so Homework is the
 * honest default. The parent's own type is deliberately not inherited: the
 * children of an Exam are still homework.
 */
export const DEFAULT_SUBWORK_CATEGORY: ItemCategory = 'homework';

/**
 * Categories that a course normally has more than one of, so their suggested
 * name carries an ordinal ("Second Exam").
 *
 * Homework and participation are deliberately NOT here: "First Homework" and
 * "First Participation" read as if there is a second one coming, when in a
 * course they are usually a single running commitment rather than a numbered
 * series. They take their bare label instead -- at the top level. Under a
 * parent they are a real series, and `suggestItemName`'s `repeat` flag is what
 * makes them ordinal there.
 */
const CATEGORIES_THAT_REPEAT: ReadonlySet<ItemCategory> = new Set<ItemCategory>(['exam', 'quiz', 'project']);

const ORDINAL_WORDS = [
    'First',
    'Second',
    'Third',
    'Fourth',
    'Fifth',
    'Sixth',
    'Seventh',
    'Eighth',
    'Ninth',
    'Tenth',
];

/** Capitalise every word: "second exam" -> "Second Exam". */
export const titleCase = (value: string): string =>
    value
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

export const ordinalWord = (position: number): string =>
    ORDINAL_WORDS[position - 1] ?? `${position}th`;

/**
 * A ready-made name for an input of the given type, counted against the inputs
 * that already exist beside it. Typing is always optional: picking "Exam" in a
 * course with no exams gives "First Exam", and with one already there it gives
 * "Second Exam".
 *
 * `repeat` forces the ordinal on regardless of the category's usual habit --
 * a sub-work is a slice of one parent, so those are a numbered series whatever
 * they are called, and "First Homework" under a project reads as the first of
 * the parts rather than as a promise that homework follows.
 */
export const suggestItemName = (category: ItemCategory, existing: AcademicItem[], repeat = false): string => {
    const label = CATEGORY_LABELS[category] ?? 'Item';
    if (!repeat && !CATEGORIES_THAT_REPEAT.has(category)) return titleCase(label);

    // An edited item must not count itself, or re-picking its own category would
    // jump the name forward by one every time.
    const alreadyUsed = existing.filter(item => item.category === category).length;
    return titleCase(`${ordinalWord(alreadyUsed + 1)} ${label}`);
};

// -----------------------------------------------------------------------------
// Entities. The shape mirrors the new academic_courses / academic_items /
// gpa_scales / gpa_scale_bands tables.
// -----------------------------------------------------------------------------

export interface AcademicCourse {
    id?: string;
    user_id: string;
    semester_id?: string | null;
    name: string;
    code?: string | null;
    credits: number;
    order_index?: number;
    /** The grade the teacher handed out, stored as a percentage. */
    final_grade?: number | null;
    /**
     * Percentage (0-100) needed to pass this subject. Null when no minimum
     * applies, which is not the same as zero - zero would fail every course.
     * Falls back to the active scale's passing_grade when unset.
     */
    minimum_grade?: number | null;
    notes?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface AcademicItem {
    id?: string;
    user_id: string;
    course_id: string;
    parent_id?: string | null;
    name: string;
    category: ItemCategory;
    /** The user's own percentage. Never normalised without an explicit click. */
    weight: number;
    max_score: number;
    /** null means "not graded yet", which is unknown, not zero. */
    score?: number | null;
    /**
     * Percentage (0-100) needed to pass THIS input. Null inherits the course's
     * minimum, so an exam can be held to a higher bar than its subject without
     * anyone having to restate the subject's rule.
     */
    minimum_grade?: number | null;
    due_date?: string | null;
    /**
     * The hour on that day, as "HH:MM" (or "HH:MM:SS" off Postgres). Null means
     * the deadline is the whole day; a value makes it an instant -- 09:00 for a
     * sitting, 23:59 for a portal closing -- which is what lets a past-due exam
     * call itself finished the moment the hour passes rather than at midnight.
     */
    due_time?: string | null;
    /**
     * "Done", independent of grading: handed-in work with no score yet is
     * finished, and a graded piece may not be. Never read by the GPA maths --
     * it is a progress marker, not a score.
     *
     * A parent row's value is derived from its children in the UI and is not
     * stored, so this only ever matters for leaves.
     */
    completed?: boolean;
    order_index?: number;
    created_at?: string;
    updated_at?: string;
}

export interface ItemNode {
    item: AcademicItem;
    children: ItemNode[];
}

export interface GpaBand {
    id?: string;
    scale_id?: string;
    min_percentage: number;
    points: number;
    letter?: string | null;
}

export interface GpaScale {
    id?: string;
    user_id: string;
    name: string;
    /** 'points' means the percentage is already the grade (a 100/100 scale). */
    basis: 'percentage' | 'points';
    max_value: number;
    min_value: number;
    is_preset: boolean;
    sort_order: number;
/**
     * How a continuous result becomes the integer grade the teacher reports, used by
     * bandless scales (20/20, 100/100). Banded scales ignore it and use their
     * explicit bands instead.
     */
    rounding: RoundingMode;
    /**
     * Percentage (0-100) needed to pass on this scale, used by any course that
     * has not set its own minimum. Null when the scale defines no minimum.
     */
    passing_grade?: number | null;
    bands: GpaBand[];
}

export type RoundingMode = 'nearest' | 'floor' | 'ceil';

export const ROUNDING_MODES: RoundingMode[] = ['nearest', 'floor', 'ceil'];

export const ROUNDING_LABELS: Record<RoundingMode, string> = {
    nearest: 'Round to nearest',
    floor: 'Always round down',
    ceil: 'Always round up',
};

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

export const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

export const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Round to a whole number by the mode the scale is configured with. */
export const roundTo = (value: number, mode: RoundingMode): number => {
    if (mode === 'floor') return Math.floor(value);
    if (mode === 'ceil') return Math.ceil(value);
    return Math.round(value);
};

/** Two decimals everywhere, so "15.5 on 20/20" is never flattened to 15. */
export const scaleDecimals = (): number => 2;

const byOrder = (a: { order_index?: number; name: string }, b: { order_index?: number; name: string }): number =>
    (a.order_index ?? 0) - (b.order_index ?? 0) || a.name.localeCompare(b.name);

// -----------------------------------------------------------------------------
// Tree building
// -----------------------------------------------------------------------------

/**
 * Groups a flat item list into a tree using `parent_id`. An item whose parent is
 * missing from the list is treated as a root rather than being dropped, so a
 * half-loaded or filtered list still renders.
 */
export const buildItemTree = (items: AcademicItem[]): ItemNode[] => {
    const nodes = new Map<string, ItemNode>();
    for (const item of [...items].sort(byOrder)) {
        if (item.id) nodes.set(item.id, { item, children: [] });
    }

    const roots: ItemNode[] = [];
    for (const node of nodes.values()) {
        const parentId = node.item.parent_id;
        const parent = parentId ? nodes.get(parentId) : undefined;
        if (parent) parent.children.push(node);
        else roots.push(node);
    }
    return roots;
};

/**
 * Rank of a type within a sibling group, taken from ITEM_CATEGORIES so the
 * dropdown order and the display order can never disagree.
 */
const categoryRank = (category: ItemCategory): number => {
    const index = ITEM_CATEGORIES.indexOf(category);
    return index === -1 ? ITEM_CATEGORIES.length : index;
};

/**
 * Order a sibling group for display.
 *
 * Undated work first, grouped by type so a course's exams read as one block
 * rather than being scattered between homework; dated work after, in
 * chronological order, because that is the only order a schedule makes sense in.
 *
 * Sorting by name alone put "First Exam, Homework, Second Exam" in that order,
 * which hides the fact that two of the three rows are exams.
 */
export const sortForDisplay = (nodes: ItemNode[]): ItemNode[] =>
    [...nodes].sort((a, b) => {
        // Dates are plain YYYY-MM-DD strings, so a string compare is also a
        // chronological one and cannot drift with the viewer's timezone.
        const dateA = a.item.due_date ?? null;
        const dateB = b.item.due_date ?? null;

        // Undated before dated.
        if (dateA && !dateB) return 1;
        if (!dateA && dateB) return -1;

        if (dateA && dateB && dateA !== dateB) return dateA < dateB ? -1 : 1;

        // Same day: a clock time settles it, earliest hour first. Work with no
        // hour is end-of-day -- the deadline for a plain date IS midnight -- so
        // it sorts after anything timed and two untimed rows fall through to the
        // type ranking below.
        if (dateA && dateB) {
            const timeA = a.item.due_time ? a.item.due_time.slice(0, 5) : '23:59';
            const timeB = b.item.due_time ? b.item.due_time.slice(0, 5) : '23:59';
            if (timeA !== timeB) return timeA < timeB ? -1 : 1;
        }

        // Same datedness: group by type so exams stay together, then by name.
        const rankA = categoryRank(a.item.category);
        const rankB = categoryRank(b.item.category);
        if (rankA !== rankB) return rankA - rankB;

        return a.item.name.localeCompare(b.item.name);
    });

/** Depth-first search for a node by id, used when adding or re-parenting. */
export const findNode = (tree: ItemNode[], id: string | null | undefined): ItemNode | null => {
    if (!id) return null;
    for (const node of tree) {
        if (node.item.id === id) return node;
        const hit = findNode(node.children, id);
        if (hit) return hit;
    }
    return null;
};

/** Flat list of a subtree in display order. */
export const flattenNodes = (tree: ItemNode[]): ItemNode[] => {
    const out: ItemNode[] = [];
    const walk = (nodes: ItemNode[]) => {
        for (const node of nodes) {
            out.push(node);
            walk(node.children);
        }
    };
    walk(tree);
    return out;
};

/** The ids a new item under `parentId` may not use, to avoid cycles. */
export const descendantIds = (node: ItemNode): string[] =>
    flattenNodes(node.children)
        .map(n => n.item.id)
        .filter((id): id is string => !!id);

// -----------------------------------------------------------------------------
// Weight validation
//
// The rule the user asked for: if a group already sums to 100, leave it alone.
// We only ever report; the two fixers below run on explicit click.
// -----------------------------------------------------------------------------

export interface WeightCheck {
    total: number;
    balanced: boolean;
    /** 100 - total. Negative means the group overshoots. */
    missing: number;
    count: number;
    /**
     * Inputs worth 0%: present in the group but contributing nothing to it.
     * A group can sum to 100 while one of these exists -- a new input joins a
     * full group at 0 -- so the total alone cannot say the group is healthy.
     */
    zeroCount: number;
}

export const checkWeights = (items: { weight: number }[]): WeightCheck => {
    const total = round2(items.reduce((sum, item) => sum + (item.weight || 0), 0));
    return {
        total,
        balanced: Math.abs(total - 100) < 0.01,
        missing: round2(100 - total),
        count: items.length,
        zeroCount: items.filter(item => !item.weight).length,
    };
};

/** An n-way split of 100 that sums to exactly 100, remainder on the first rows. */
export const distributeToHundred = (count: number): number[] => {
    if (count <= 0) return [];
    const base = Math.floor((100 / count) * 100) / 100;
    let assigned = 0;
    const parts = Array.from({ length: count }, () => base);
    for (const part of parts) assigned += part;
    // Push the rounding remainder onto the first row so the total is exact.
    parts[0] = round2(parts[0] + (100 - assigned));
    return parts;
};

/** Rescale existing weights to sum to 100, preserving their ratios. */
export const normalizeWeights = (weights: number[]): number[] => {
    const total = weights.reduce((sum, w) => sum + (w || 0), 0);
    if (total <= 0) return distributeToHundred(weights.length);
    const scaled = weights.map(w => round2(((w || 0) / total) * 100));
    const drift = round2(100 - scaled.reduce((sum, w) => sum + w, 0));
    if (drift !== 0 && scaled.length > 0) {
        let biggest = 0;
        for (let i = 1; i < scaled.length; i++) if (scaled[i] > scaled[biggest]) biggest = i;
        scaled[biggest] = round2(scaled[biggest] + drift);
    }
    return scaled;
};

// -----------------------------------------------------------------------------
// Prediction
// -----------------------------------------------------------------------------

/**
 * The percentage this node is worth.
 *
 * A leaf derives it from `score / max_score`. A parent derives it from its
 * children the same way a course derives itself from its inputs: divided by the
 * group's full weight, so ungraded children contribute nothing rather than being
 * renormalised away.
 *
 * That matters for consistency. A "Homework" worth half the course, with one of
 * its two parts graded at full marks, is half the course times half earned -
 * a quarter of the grade. Renormalising inside the parent would report the parent
 * as 100%, and the course would then credit half the grade for it.
 *
 * `null` means unknown.
 */
export const resolveItemPercent = (
    node: ItemNode,
    overrides?: Map<string, number | null>,
): number | null => {
    if (node.children.length > 0) {
        const graded = node.children
            .map(child => ({ child, percent: resolveItemPercent(child, overrides) }))
            .filter(entry => entry.percent !== null);

        if (graded.length === 0) return null;

        const weighted = graded.reduce((sum, entry) => sum + (entry.child.item.weight || 0) * entry.percent!, 0);
        const gradedWeight = graded.reduce((sum, entry) => sum + (entry.child.item.weight || 0), 0);

        // No weights set anywhere: fall back to an even split rather than
        // reporting zero for work the user has graded but not yet weighted.
        if (gradedWeight <= 0) {
            return graded.reduce((sum, entry) => sum + entry.percent!, 0) / graded.length;
        }

        return weighted / 100;
    }

    // A forced value is used by the back-solve, which asks "what if this leaf
    // had scored X?". It takes precedence over whatever is stored.
    if (overrides && node.item.id && overrides.has(node.item.id)) {
        const forced = overrides.get(node.item.id);
        return forced === null || forced === undefined ? null : clamp(forced, 0, 100);
    }

    const { score, max_score } = node.item;
    if (score === null || score === undefined || !max_score || max_score <= 0) return null;
    return clamp((score / max_score) * 100, 0, 100);
};

export interface CoursePrediction {
    /** Renormalised prediction over graded inputs only, or null if none. */
    percent: number | null;
    /** Weight of the inputs that produced the prediction. */
    gradedWeight: number;
    /** Weight of every input, graded or not. */
    totalWeight: number;
    ungradedWeight: number;
    /**
     * True when the inputs' weights add up to 100%. A course holding only a 10%
     * participation is not finished work just because everything it contains has
     * been marked - the other 90% has not been created yet.
     */
    weightsClosed: boolean;
    /**
     * True when the prediction is not the whole course: either some inputs are
     * ungraded, or the weights have not reached 100%.
     */
    isPartial: boolean;
    gradedCount: number;
    totalCount: number;
}

/**
 * The running figure for a course: what the graded inputs are actually worth so
 * far, out of the whole grade.
 *
 * Ungraded work contributes NOTHING rather than being renormalised away. A 20/20
 * homework worth 10% of the course therefore reads 10%, which is 2.00 out of 20 -
 * not a flawless 20/20, which would claim 100% of the grade from a tenth of it.
 * Renormalising is arithmetically tidy and completely misleading: it silently
 * promotes a sliver of the course to the whole of it.
 *
 * The consequence worth knowing: this is a floor, not a forecast. 16.00 out of 20
 * means 80% is earned and the rest is still open, so the real grade can only go
 * up. Treat it as "points banked", which is exactly what it is.
 */
export const predictCoursePercent = (
    tree: ItemNode[],
    overrides?: Map<string, number | null>,
): CoursePrediction => {
    let totalWeight = 0;
    let gradedWeight = 0;
    let weightedSum = 0;
    let gradedCount = 0;

    for (const node of tree) {
        const weight = node.item.weight || 0;
        totalWeight += weight;

        const percent = resolveItemPercent(node, overrides);
        if (percent === null) continue;

        gradedCount++;
        gradedWeight += weight;
        weightedSum += weight * percent;
    }

    const totalCount = tree.length;
    const weightsClosed = Math.abs(totalWeight - 100) <= 0.5;
    const base: Omit<CoursePrediction, 'percent' | 'isPartial' | 'gradedCount'> = {
        gradedWeight: round2(gradedWeight),
        totalWeight: round2(totalWeight),
        ungradedWeight: round2(Math.max(0, totalWeight - gradedWeight)),
        weightsClosed,
        totalCount,
    };

    if (gradedCount === 0) {
        return { ...base, percent: null, isPartial: true, gradedCount: 0 };
    }

    // Divided by 100, not by gradedWeight: an input worth 10% can only ever be
    // worth 10% of the course, however well it was scored.
    const percent = round2(weightedSum / 100);

    return {
        ...base,
        percent,
        // Partial means the figure covers only part of the grade, which is true
        // whenever an input is ungraded or the weights have not reached 100%.
        isPartial: !weightsClosed || gradedWeight < totalWeight - 0.01,
        gradedCount,
    };
};

// -----------------------------------------------------------------------------
// Scales
// -----------------------------------------------------------------------------

/**
 * The exact, unbanded reading of a percentage on this scale: 80.7% -> 16.14 on
 * 20/20. This is what the page DISPLAYS, so a running prediction or a delta
 * keeps its decimals and never snaps to a whole point. Bands are only used for
 * the GPA (percentToPoints).
 */
export const percentToScalePoints = (percent: number, scale: GpaScale): number => {
    if (!Number.isFinite(percent) || scale.max_value <= 0) return 0;
    return clamp((percent / 100) * scale.max_value, scale.min_value, scale.max_value);
};

/**
 * The official grade points for a percentage, used by the GPA.
 *
 * A scale with explicit bands (4.0, 5.0) maps through them. A bandless scale
 * (20/20, 100/100) applies the configured rounding, so 77.5% is a 16 when the
 * mode is "nearest" instead of the 15 the old floor bands produced.
 */
export const percentToPoints = (percent: number, scale: GpaScale): number => {
    const bands = scale.bands ?? [];
    if (bands.length === 0) {
        const raw = percentToScalePoints(percent, scale);
        return clamp(roundTo(raw, scale.rounding), scale.min_value, scale.max_value);
    }

    const sorted = [...bands].sort((a, b) => b.min_percentage - a.min_percentage);
    for (const band of sorted) {
        if (percent >= band.min_percentage) return band.points;
    }
    return scale.min_value;
};

/** The letter grade the winning band carries, if any. */
export const pointsToLetter = (percent: number, scale: GpaScale): string | null => {
    if ((scale.bands ?? []).length === 0) return null;
    const sorted = [...scale.bands].sort((a, b) => b.min_percentage - a.min_percentage);
    for (const band of sorted) {
        if (percent >= band.min_percentage) return band.letter || null;
    }
    return null;
};

/** "16.14 / 20", "3.33 / 4", "87.30 / 100". */
export const formatGpa = (value: number | null, scale: GpaScale): string => {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return `${value.toFixed(scaleDecimals())} / ${scale.max_value}`;
};

/**
 * Grade points back into the percentage the database stores.
 *
 * This is the inverse of percentToScalePoints and is what makes the app
 * scale-native end to end: if the active scale is 20/20 and the user types 18,
 * the stored percentage becomes 90, not 18. Without it every number a user
 * types is silently read as "out of 100" regardless of which scale is active.
 */
export const pointsToPercent = (points: number, scale: GpaScale): number => {
    if (!Number.isFinite(points) || scale.max_value <= 0) return 0;
    return clamp((points / scale.max_value) * 100, 0, 100);
};

/**
 * What the same grade looks like on another scale, for comparing side by side.
 * "16.14 / 20" alongside "80.70%" is the pairing that catches denominator mistakes.
 */
export const formatPoints = (points: number | null, scale: GpaScale): string =>
    points === null || points === undefined || Number.isNaN(points)
        ? '—'
        : `${points.toFixed(scaleDecimals())} / ${scale.max_value}`;

export interface NextGrade {
    points: number;
    letter: string | null;
    /** Percentage needed to reach it. */
    minPercent: number;
}

/**
 * The next grade step above what a percentage currently earns, or null when the
 * percentage is already at the top of the scale. Answers "what do I need on the
 * next exam to move up a grade?", which is the question the prediction cannot
 * answer on its own.
 */
export const nextGradeUp = (percent: number, scale: GpaScale): NextGrade | null => {
    const bands = scale.bands ?? [];

    if (bands.length === 0) {
        // Bandless: step up one whole point (halves on a small scale like 4.0).
        const raw = percentToScalePoints(percent, scale);
        const step = scale.max_value > 10 ? 1 : 0.5;
        const next = Math.floor((raw + 1e-9) / step) * step + step;
        if (next > scale.max_value) return null;
        return { points: next, letter: null, minPercent: pointsToPercent(next, scale) };
    }

    const ascending = [...bands].sort((a, b) => a.min_percentage - b.min_percentage);
    const current = percentToPoints(percent, scale);
    const band = ascending.find(candidate => candidate.points > current + 1e-9);
    if (!band) return null;
    return { points: band.points, letter: band.letter || null, minPercent: band.min_percentage };
};

export interface GradeInterval {
    grade: number;
    /**
     * Continuous point span that the teacher still reports as `grade`. Both ends
     * are bounds on the reported grade, not necessarily values it can take: see
     * the inclusive flags.
     */
    loPoints: number;
    hiPoints: number;
    /**
     * False when the bound itself lands on the NEXT grade, so it can only ever
     * be approached. Round-to-nearest makes the top bound exclusive: 18.5 rounds
     * up to 19, so a final grade of 18 means the continuous result is below
     * 18.5, never equal to it. Always-round-up makes the bottom bound exclusive
     * for the same reason.
     */
    loInclusive: boolean;
    hiInclusive: boolean;
    /** The same span expressed as a percentage. */
    loPercent: number;
    hiPercent: number;
}

export const integerInterval = (grade: number, scale: GpaScale): GradeInterval | null => {
    const bands = scale.bands ?? [];

    if (bands.length > 0) {
        const ascending = [...bands].sort((a, b) => a.min_percentage - b.min_percentage);
        const index = ascending.findIndex(band => Math.abs(band.points - grade) < 1e-9);
        if (index === -1) return null;
        const loPercent = ascending[index].min_percentage;
        const isTop = index + 1 >= ascending.length;
        const hiPercent = isTop ? 100 : ascending[index + 1].min_percentage;
        return {
            grade,
            loPoints: percentToScalePoints(loPercent, scale),
            hiPoints: percentToScalePoints(hiPercent, scale),
            // A band's floor is attainable; the next band's floor is not.
            loInclusive: true,
            hiInclusive: isTop,
            loPercent,
            hiPercent,
        };
    }

    // Each mode's interval is half-open, never closed: whichever end the rounding
    // pushes over to the neighbouring grade must be excluded.
    const loInclusive = scale.rounding !== 'ceil';
    const hiInclusive = scale.rounding === 'ceil';
    const lowerBump = scale.rounding === 'ceil' ? 1 : scale.rounding === 'nearest' ? 0.5 : 0;
    const upperBump = scale.rounding === 'floor' ? 1 : scale.rounding === 'nearest' ? 0.5 : 0;
    const loPoints = clamp(grade - lowerBump, scale.min_value, scale.max_value);
    const hiPoints = clamp(grade + upperBump, scale.min_value, scale.max_value);
    return {
        grade,
        loPoints,
        hiPoints,
        loInclusive,
        hiInclusive,
        loPercent: pointsToPercent(loPoints, scale),
        hiPercent: pointsToPercent(hiPoints, scale),
    };
};

/**
 * The nearest value to a bound that still rounds to the intended grade.
 *
 * An exclusive bound is a limit that cannot be reached, so printing it verbatim
 * would advertise a score that actually earns the next grade up: "up to 18.5"
 * next to a final grade of 18 is self-contradictory, because 18.5 is a 19. Each
 * bound therefore steps inward, one display unit, in the only direction that
 * stays inside the interval.
 */
export const attainableLower = (points: number, inclusive: boolean): number =>
    inclusive ? round2(points) : round2(points + 0.01);

export const attainableUpper = (points: number, inclusive: boolean): number =>
    inclusive ? round2(points) : round2(points - 0.01);

export interface MissingLeafSolution {
    /** The one ungraded input the final grade pins down. */
    itemId: string;
    maxScore: number;
    /** Inferred score range, clamped to the input's own denominator. */
    loScore: number;
    hiScore: number;
    loPercent: number;
    hiPercent: number;
    /** True when the endpoints had to be clamped, i.e. the goal is impossible. */
    clamped: boolean;
}

/**
 * When a course has a final grade and exactly ONE input is still ungraded, work
 * backwards to what that input must have scored. The course average is linear
 * in that single unknown, so two evaluations pin the whole line and the final
 * grade's interval maps straight onto a score range.
 *
 * Returns null - showing nothing rather than a guess - when:
 *   - there is anything other than exactly one ungraded leaf, since two unknowns
 *     make the answer wildly inaccurate;
 *   - that leaf carries no weight, so the final grade says nothing about it;
 *   - the top-level weights do not add up to 100%. Predictions renormalise over
 *     whatever is graded, so with weights still open the course could gain inputs
 *     that absorb the missing one's share and the inferred range would be wrong.
 *     Closing the weights is what makes the number trustworthy.
 */
export const solveMissingLeaf = (
    tree: ItemNode[],
    finalPercent: number,
    scale: GpaScale,
): MissingLeafSolution | null => {
    // The prediction averages the root nodes by weight, so this is the set whose
    // weights have to total 100% for the back-solve to mean anything.
    const totalWeight = tree.reduce((sum, node) => sum + (node.item.weight || 0), 0);
    if (Math.abs(totalWeight - 100) > 0.5) return null;

    const ungraded = flattenNodes(tree).filter(
        node => node.children.length === 0 && (node.item.score === null || node.item.score === undefined),
    );
    if (ungraded.length !== 1) return null;

    const leaf = ungraded[0];
    const leafId = leaf.item.id;
    if (!leafId) return null;

    const at = (value: number): number | null =>
        predictCoursePercent(tree, new Map<string, number | null>([[leafId, value]])).percent;

    const atZero = at(0);
    const atHundred = at(100);
    if (atZero === null || atHundred === null || Math.abs(atHundred - atZero) < 1e-9) return null;

    // The final grade is itself a band, so the missing input is only knowable as
    // a range. The far bound is exclusive - it is the first value that earns the
    // NEXT grade - so it is pulled back inside before being solved for.
    const targetGrade = Math.round(percentToScalePoints(finalPercent, scale));
    const interval = integerInterval(targetGrade, scale);
    const loTarget = interval
        ? pointsToPercent(attainableLower(interval.loPoints, interval.loInclusive), scale)
        : finalPercent;
    const hiTarget = interval
        ? pointsToPercent(attainableUpper(interval.hiPoints, interval.hiInclusive), scale)
        : finalPercent;

    const toLeafPercent = (coursePercent: number) =>
        ((coursePercent - atZero) / (atHundred - atZero)) * 100;

    const rawLo = toLeafPercent(loTarget);
    const rawHi = toLeafPercent(hiTarget);
    const lo = Math.min(rawLo, rawHi);
    const hi = Math.max(rawLo, rawHi);

    const maxScore = leaf.item.max_score > 0 ? leaf.item.max_score : 100;
    const clamped = lo < -1e-6 || hi > 100 + 1e-6;
    const loPercent = clamp(lo, 0, 100);
    const hiPercent = clamp(hi, 0, 100);

    return {
        itemId: leafId,
        maxScore,
        loScore: round2((loPercent / 100) * maxScore),
        hiScore: round2((hiPercent / 100) * maxScore),
        loPercent: round2(loPercent),
        hiPercent: round2(hiPercent),
        clamped,
    };
};

/**
 * The cut-off that actually applies to a course: its own minimum if set,
 * otherwise the active scale's.
 *
 * Returns null when neither is set, which is the answer "no minimum recorded"
 * rather than "you failed". Callers must not treat null as zero.
 */
export const effectiveMinimum = (course: AcademicCourse, scale: GpaScale): number | null => {
    const own = typeof course.minimum_grade === 'number' && !Number.isNaN(course.minimum_grade)
        ? course.minimum_grade
        : null;
    if (own !== null) return clamp(own, 0, 100);

    const scaleMin = typeof scale.passing_grade === 'number' && !Number.isNaN(scale.passing_grade)
        ? scale.passing_grade
        : null;
    return scaleMin === null ? null : clamp(scaleMin, 0, 100);
};

/**
 * The cut-off for one input: its own if set, otherwise the course's, otherwise
 * the scale's.
 *
 * This is the chain that makes "the exam needs 14/20 but the subject only needs
 * 10/20" expressible without duplicating the subject rule on every exam row.
 */
export const effectiveItemMinimum = (
    item: AcademicItem,
    course: AcademicCourse,
    scale: GpaScale,
): number | null => {
    if (typeof item.minimum_grade === 'number' && !Number.isNaN(item.minimum_grade)) {
        return clamp(item.minimum_grade, 0, 100);
    }
    return effectiveMinimum(course, scale);
};

/** Whether one input clears its minimum, given what it scored. */
export const checkItemPassing = (
    item: AcademicItem,
    course: AcademicCourse,
    scale: GpaScale,
): PassResult => {
    const inherited = typeof item.minimum_grade !== 'number' || Number.isNaN(item.minimum_grade);
    const minimum = effectiveItemMinimum(item, course, scale);

    if (minimum === null) {
        return { passing: null, minimum: null, inheritedFromScale: false };
    }

    const scored = resolveItemPercent({ item, children: [] });
    if (scored === null) {
        return { passing: null, minimum, inheritedFromScale: inherited };
    }

    return { passing: scored >= minimum, minimum, inheritedFromScale: inherited };
};

export interface PassResult {
    /** null when no minimum is recorded, which is not a failure. */
    passing: boolean | null;
    /** The percentage that applies, or null. */
    minimum: number | null;
    /** True when the source is the scale rather than the course. */
    inheritedFromScale: boolean;
}

/** Whether a course clears its minimum, given a percentage. */
export const checkPassing = (course: AcademicCourse, scale: GpaScale, percent: number): PassResult => {
    const inherited = typeof course.minimum_grade !== 'number' || Number.isNaN(course.minimum_grade);
    const minimum = effectiveMinimum(course, scale);

    if (minimum === null) {
        return { passing: null, minimum: null, inheritedFromScale: false };
    }

    return {
        passing: percent >= minimum,
        minimum,
        inheritedFromScale: inherited,
    };
};

/** Generic letter grade on the usual percentage curve, for course rows. */
export const letterFor = (percent: number): string => {
    if (percent >= 93) return 'A';
    if (percent >= 90) return 'A-';
    if (percent >= 87) return 'B+';
    if (percent >= 83) return 'B';
    if (percent >= 80) return 'B-';
    if (percent >= 77) return 'C+';
    if (percent >= 73) return 'C';
    if (percent >= 70) return 'C-';
    if (percent >= 63) return 'D';
    if (percent > 0) return 'F';
    return '—';
};

// -----------------------------------------------------------------------------
// GPA
// -----------------------------------------------------------------------------

export interface CourseGpaEntry {
    courseId: string;
    name: string;
    credits: number;
    percent: number;
    points: number;
}

export interface GpaResult {
    /** Credit-weighted average, or null when no course has a final grade. */
    gpa: number | null;
    /** The same average as an unscaled percentage, for "points to next grade". */
    percent: number | null;
    /** Sum of credits counted. */
    credits: number;
    coursesCounted: number;
    /** Courses carrying a final grade but no credits, so they are visible but excluded. */
    uncountedCourses: number;
    perCourse: CourseGpaEntry[];
}

/**
 * Credit-weighted GPA across every course that has a final grade. Courses with
 * no credits set are reported separately rather than silently dropped.
 */
export const computeGpa = (courses: AcademicCourse[], scale: GpaScale): GpaResult => {
    const graded = courses.filter(
        course => typeof course.final_grade === 'number' && !Number.isNaN(course.final_grade),
    );

    let weighted = 0;
    let weightedPercent = 0;
    let credits = 0;
    let uncountedCourses = 0;

    const perCourse: CourseGpaEntry[] = graded.map(course => {
        const percent = course.final_grade as number;
        const points = percentToPoints(percent, scale);
        const courseCredits = course.credits > 0 ? course.credits : 0;

        if (courseCredits === 0) uncountedCourses++;
        weighted += points * courseCredits;
        weightedPercent += percent * courseCredits;
        credits += courseCredits;

        return {
            courseId: course.id ?? '',
            name: course.name,
            credits: courseCredits,
            percent,
            points: round2(points),
        };
    });

    const gpa = credits > 0 ? round2(weighted / credits) : null;
    const percent = credits > 0 ? round2(weightedPercent / credits) : null;
    return {
        gpa,
        percent,
        credits: round1(credits),
        coursesCounted: graded.length,
        uncountedCourses,
        perCourse,
    };
};

export interface ProjectedGpa {
    /** Credit-weighted average in scale points, or null when nothing is measured. */
    points: number | null;
    /** The same figure as an unscaled percentage. */
    percent: number | null;
    credits: number;
    /** Final courses plus predicted courses together. */
    coursesCounted: number;
    /** How many of those are real, teacher-given grades. */
    finalCount: number;
    /** How many are still being estimated from entered work. */
    predictedCount: number;
}

/**
 * The whole programme as it stands: every finished course at its real final
 * grade, every unfinished one at what it has earned so far.
 *
 * Earlier this averaged ONLY the unfinished courses, which made "Projected GPA"
 * a completely different measure from "Earned GPA" sitting right next to it - a
 * 15.4 average alongside a projection of 20 was arithmetically consistent and
 * meaningless, because the 20 described two unfinished subjects and the 15.4
 * described thirty finished ones. Blending them means the projection can never
 * contradict the earned figure; it is the same measurement at a later date.
 *
 * Because a course prediction is a floor (see predictCoursePercent), this is a
 * floor too: it can only rise as more work is marked.
 */
export const computeProjectedGpa = (
    courses: AcademicCourse[],
    predictions: Map<string, CoursePrediction>,
    scale: GpaScale,
): ProjectedGpa => {
    let weightedPoints = 0;
    let weightedPercent = 0;
    let credits = 0;
    let finalCount = 0;
    let predictedCount = 0;

    for (const course of courses) {
        if (!course.id || course.credits <= 0) continue;

        const finalGrade = typeof course.final_grade === 'number' && !Number.isNaN(course.final_grade)
            ? course.final_grade
            : null;

        let percent: number | null;
        let countedAs: 'final' | 'predicted';

        if (finalGrade !== null) {
            percent = finalGrade;
            countedAs = 'final';
        } else {
            const predicted = predictions.get(course.id)?.percent ?? null;
            // Courses with open weights ARE counted. A course prediction is a
            // floor - it reflects what is banked, not what might be earned - so a
            // partly-marked course contributes honestly instead of being
            // excluded, and the blended figure still only ever rises.
            if (predicted === null) continue;
            percent = predicted;
            countedAs = 'predicted';
        }

        weightedPoints += percentToPoints(percent, scale) * course.credits;
        weightedPercent += percent * course.credits;
        credits += course.credits;
        if (countedAs === 'final') finalCount++;
        else predictedCount++;
    }

    if (credits <= 0) {
        return { points: null, percent: null, credits: 0, coursesCounted: 0, finalCount: 0, predictedCount: 0 };
    }

    return {
        points: round2(weightedPoints / credits),
        percent: round2(weightedPercent / credits),
        credits: round1(credits),
        coursesCounted: finalCount + predictedCount,
        finalCount,
        predictedCount,
    };
};

export interface RankedCourse {
    course: AcademicCourse;
    percent: number;
    points: number;
}

/** Every course that can currently be predicted, weakest first. */
export const rankCoursesByPrediction = (
    courses: AcademicCourse[],
    predictions: Map<string, CoursePrediction>,
    scale: GpaScale,
): RankedCourse[] =>
    courses
        .flatMap(course => {
            if (!course.id) return [];
            const percent = predictions.get(course.id)?.percent;
            if (percent === null || percent === undefined) return [];
            return [{ course, percent, points: percentToScalePoints(percent, scale) }];
        })
        .sort((a, b) => a.percent - b.percent);

/** How far the running prediction landed from the grade the teacher gave. */
export const predictionAccuracy = (
    courses: AcademicCourse[],
    predictions: Map<string, CoursePrediction>,
): { meanAbsError: number | null; count: number } => {
    const errors: number[] = [];

    for (const course of courses) {
        if (typeof course.final_grade !== 'number' || Number.isNaN(course.final_grade)) continue;
        const prediction = predictions.get(course.id ?? '');
        if (!prediction || prediction.percent === null) continue;
        errors.push(Math.abs(prediction.percent - course.final_grade));
    }

    if (errors.length === 0) return { meanAbsError: null, count: 0 };
    return {
        meanAbsError: round1(errors.reduce((sum, e) => sum + e, 0) / errors.length),
        count: errors.length,
    };
};

/**
 * How uneven the finished grades are, in scale points.
 *
 * Two numbers because they answer different questions: `stdDev` is how far a
 * typical grade sits from the mean, while `spread` is the full best-to-worst
 * distance. A high stdDev with a small spread just means everything is mid.
 */
export const computeGradeSpread = (
    courses: AcademicCourse[],
    scale: GpaScale,
): { stdDev: number | null; spread: number | null } => {
    const points = courses
        .filter(course => typeof course.final_grade === 'number' && !Number.isNaN(course.final_grade))
        .map(course => percentToPoints(course.final_grade as number, scale));

    if (points.length < 2) return { stdDev: null, spread: null };

    const mean = points.reduce((sum, value) => sum + value, 0) / points.length;
    const variance = points.reduce((sum, value) => sum + (value - mean) ** 2, 0) / points.length;

    return {
        stdDev: round2(Math.sqrt(variance)),
        spread: round2(Math.max(...points) - Math.min(...points)),
    };
};

/**
 * How much of the year is actually entered, counted as graded inputs against all
 * of them. Deliberately counts inputs rather than courses: a course with one
 * graded test and a course with six graded tests are not equally done, and this
 * is the number that shows it.
 */
export const computeInputProgress = (
    predictions: Map<string, CoursePrediction>,
): { graded: number; total: number; percent: number | null } => {
    let graded = 0;
    let total = 0;

    for (const prediction of predictions.values()) {
        graded += prediction.gradedCount;
        total += prediction.totalCount;
    }

    return {
        graded,
        total,
        percent: total > 0 ? round2((graded / total) * 100) : null,
    };
};

/** Courses that still have no final grade, so they count towards the projection. */
export const countCoursesInProgress = (courses: AcademicCourse[]): number =>
    courses.filter(course => typeof course.final_grade !== 'number' || Number.isNaN(course.final_grade)).length;

/**
 * Mean ECTS per course, which is what makes the weighting meaningful. Two
 * decimals, because a real average like 5.25 is meaningful and rounding it to
 * 5.3 would quietly misstate the workload.
 */
export const averageCredits = (courses: AcademicCourse[]): number | null => {
    if (courses.length === 0) return null;
    return round2(courses.reduce((sum, course) => sum + (course.credits || 0), 0) / courses.length);
};

/** Every course with a final grade, strongest first, for comparing semesters. */
export const rankSemestersByGpa = <T>(
    semesters: T[],
    courses: AcademicCourse[],
    scale: GpaScale,
    gpaOf: (semester: T) => number | null,
): { semester: T; points: number | null }[] =>
    semesters
        .map(semester => {
            const id = (semester as { id?: string }).id ?? '';
            const owned = courses.filter(course => (course.semester_id ?? '') === id);
            const result = computeGpa(owned, scale);
            return { semester, points: result.gpa ?? gpaOf(semester) };
        })
        .sort((a, b) => (b.points ?? -1) - (a.points ?? -1));

// -----------------------------------------------------------------------------
// Default scales, seeded on a user's first visit. Bands are editable in the UI.
// -----------------------------------------------------------------------------

export interface ScalePreset {
    name: string;
    basis: 'percentage' | 'points';
    max_value: number;
    min_value: number;
    rounding: RoundingMode;
    bands: { min_percentage: number; points: number; letter?: string }[];
}

export const SCALE_PRESETS: ScalePreset[] = [
    {
        // Bandless on purpose: a running 16.14 stays 16.14 instead of snapping to
        // the old floor bands (which turned a 77.5% into a 15). Rounding to the
        // reported whole grade happens once, at the end, via `rounding`.
        name: '20 / 20',
        basis: 'percentage',
        max_value: 20,
        min_value: 0,
        rounding: 'nearest',
        bands: [],
    },
    {
        name: '4.0',
        basis: 'percentage',
        max_value: 4,
        min_value: 0,
        rounding: 'nearest',
        bands: [
            { min_percentage: 90, points: 4.0, letter: 'A' },
            { min_percentage: 80, points: 3.0, letter: 'B' },
            { min_percentage: 70, points: 2.0, letter: 'C' },
            { min_percentage: 60, points: 1.0, letter: 'D' },
            { min_percentage: 0, points: 0, letter: 'F' },
        ],
    },
    {
        name: '5.0',
        basis: 'percentage',
        max_value: 5,
        min_value: 2,
        rounding: 'nearest',
        bands: [
            { min_percentage: 90, points: 5.0, letter: 'A' },
            { min_percentage: 80, points: 4.5, letter: 'B' },
            { min_percentage: 70, points: 4.0, letter: 'C' },
            { min_percentage: 60, points: 3.5, letter: 'D' },
            { min_percentage: 50, points: 3.0, letter: 'E' },
            { min_percentage: 0, points: 2.0, letter: 'F' },
        ],
    },
    {
        name: '100 / 100',
        basis: 'points',
        max_value: 100,
        min_value: 0,
        rounding: 'nearest',
        bands: [],
    },
];
