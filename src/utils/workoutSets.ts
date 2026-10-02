// Per-set maths, shared by every surface that touches a workout.
//
// A strength exercise is a list of sets, each with its own reps and weight:
// 60kg x 10, then 70kg x 8, then 75kg x 6. That is what `sets_detail` holds --
// a jsonb array of `{reps, weight}` -- because the old aggregate triple
// (`sets` / `reps` / `weight`) cannot express it: 3 x 10 x 60 and 3 sets of
// 60/70/75 are the same three numbers in that column and completely different
// sessions.
//
// Everything here is pure and total. jsonb comes back from Postgres as
// `unknown` and users' older rows are shaped like whatever they typed years
// ago, so parsing is defensive: a malformed array degrades to "no detail" and
// the summary columns take over, rather than throwing inside a render.

/** The three kinds of thing a session can contain. Mirrored by a CHECK constraint. */
export const ACTIVITY_TYPES = ['strength', 'cardio', 'mobility'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
    strength: 'Strength',
    cardio: 'Cardio',
    mobility: 'Mobility',
};

export const isActivityType = (value: unknown): value is ActivityType =>
    typeof value === 'string' && (ACTIVITY_TYPES as readonly string[]).includes(value);

/** One working set. `reps` and `weight` are independent -- a warm-up or a drop set is legal. */
export interface WorkoutSet {
    reps?: number;
    /** Canonical kilograms, always. Display units are a rendering concern. */
    weight?: number;
}

export interface SetSummary {
    sets: number;
    /** The reps and weight of the heaviest set, which is what a reader expects to see. */
    reps?: number;
    weight?: number;
    /** Sum of reps x weight over every set. */
    volumeKg: number;
}

/** Canonical kilograms in, display unit out. Formatting labels, not maths. */
import { fromKg, type WeightUnit } from './units';

const num = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
};

/**
 * Coerce whatever the database returned into a list of sets.
 * Anything unrecognised becomes an empty set rather than a discarded entry, so
 * the set a user is looking at always stays on screen.
 */
export const parseSetDetail = (value: unknown): WorkoutSet[] => {
    if (!Array.isArray(value)) return [];
    return value.map(entry => {
        if (typeof entry !== 'object' || entry === null) return {};
        const record = entry as Record<string, unknown>;
        const set: WorkoutSet = {};
        const reps = num(record.reps);
        const weight = num(record.weight);
        if (reps !== undefined) set.reps = reps;
        if (weight !== undefined) set.weight = weight;
        return set;
    });
};

/** Drop trailing sets that record nothing, so "3 sets, 2 typed" stores 2. */
export const rowsToDetail = (rows: WorkoutSet[]): WorkoutSet[] => {
    const detail: WorkoutSet[] = [];
    for (const set of rows) {
        if (set.reps === undefined && set.weight === undefined) break;
        detail.push(set);
    }
    return detail;
};

export const uniformSets = (count: number, reps?: number, weight?: number): WorkoutSet[] =>
    Array.from({ length: Math.max(0, Math.trunc(count)) }, () => ({ reps, weight }));

/**
 * Always return exactly `count` sets, so the editor's row count is driven by
 * the user's set count and never by how much detail they happened to type.
 * Existing detail wins row by row; the tail falls back to the summary, which
 * is what makes a legacy `3 x 10 x 60` row editable as three identical sets.
 */
export const detailToRows = (
    detail: WorkoutSet[],
    count: number,
    reps?: number,
    weight?: number,
): WorkoutSet[] => {
    const rows: WorkoutSet[] = [];
    for (let i = 0; i < count; i++) {
        const existing = detail[i];
        rows.push({
            reps: existing?.reps ?? reps,
            weight: existing?.weight ?? weight,
        });
    }
    return rows;
};

/** Sum of reps x weight. Zero for bodyweight work, which is why volume is never the only stat. */
export const detailVolumeKg = (detail: WorkoutSet[]): number =>
    detail.reduce((total, set) => total + (set.reps ?? 0) * (set.weight ?? 0), 0);

/** The heaviest set, or undefined when nothing carries a weight. */
export const bestSet = (detail: WorkoutSet[]): WorkoutSet | undefined => {
    let best: WorkoutSet | undefined;
    for (const set of detail) {
        if (set.weight === undefined) continue;
        if (!best || set.weight > (best.weight ?? 0)) best = set;
    }
    return best;
};

/**
 * One place that turns "a row" into "what to display", so the template
 * preview, the session editor and the stats table can never disagree.
 */
export const summariseSets = (detail: WorkoutSet[], fallbackReps?: number, fallbackWeight?: number): SetSummary => {
    const best = bestSet(detail);
    return {
        sets: detail.length,
        reps: best?.reps ?? (detail.length ? fallbackReps : undefined),
        weight: best?.weight ?? (detail.length ? fallbackWeight : undefined),
        volumeKg: detailVolumeKg(detail),
    };
};

/** The summary row for an exercise that has no per-set detail yet. */
export const summariseFallback = (reps?: number, weight?: number): SetSummary =>
    summariseSets(uniformSets(reps !== undefined || weight !== undefined ? 1 : 0, reps, weight), reps, weight);

/**
 * Heatmap shade, 0-4, from a self-reported 1-10 session intensity.
 * Bucketed in pairs so the ramp has even steps and an honest legend, rather
 * than ten shades nobody can tell apart.
 */
export const HEAT_LEVELS = 5;

export const levelForIntensity = (intensity?: number | null): number => {
    if (intensity == null || intensity < 1) return 0;
    return Math.min(HEAT_LEVELS - 1, Math.max(0, Math.ceil(intensity / 2) - 1));
};

export const HEAT_LEVEL_LABELS = ['None', 'Very light', 'Light', 'Moderate', 'Hard', 'Maximal'];

/**
 * CSS modifier for a heat level: 0 is an empty square, 1-5 are the five
 * intensity shades. Clamped, because a level coming out of a bad reduction
 * should render as a colour, not as a class that silently does nothing.
 */
export const LEVEL_FOR = (level: number): string => `l${Math.max(0, Math.min(HEAT_LEVELS, Math.round(level)))}`;

/** Parse a form field that may be empty, negative or half-typed into a usable number. */
export const parseInputNumber = (value: string): number | undefined => {
    const parsed = Number(value.trim());
    return value.trim() === '' || !Number.isFinite(parsed) ? undefined : parsed;
};

/** The shape a template exercise's targets need in order to be described. */
export interface TargetLike {
    activity_type: ActivityType;
    target_sets_detail?: WorkoutSet[] | null;
    target_reps?: number | null;
    target_weight?: number | null;
    target_duration_minutes?: number | null;
    target_distance_km?: number | null;
}

/**
 * One line describing an exercise's targets: `4 sets × 10 reps × 60 kg`.
 *
 * With per-set detail there is no single rep count or weight to quote, so
 * distinct values are shown as `10/8/6` and `60/70/75`. Showing the mean
 * instead would be a number the user never wrote down.
 */
export const describeTargets = (exercise: TargetLike, weightUnit: WeightUnit): string => {
    if (exercise.activity_type !== 'strength') {
        const parts = [ACTIVITY_LABELS[exercise.activity_type]];
        if (exercise.target_duration_minutes) parts.push(`${exercise.target_duration_minutes} min`);
        if (exercise.target_distance_km) parts.push(`${exercise.target_distance_km} km`);
        return parts.join(' · ');
    }

    const detail = exercise.target_sets_detail ?? [];
    if (detail.length === 0) return 'No sets yet';

    const summary = summariseSets(detail, exercise.target_reps ?? undefined, exercise.target_weight ?? undefined);

    const reps = detail.length > 1
        ? [...new Set(detail.map(set => set.reps).filter((r): r is number => r != null))].join('/')
        : summary.reps;
    const weights = detail.length > 1
        ? [...new Set(detail.map(set => set.weight).filter((w): w is number => w != null))]
            .map(kg => String(fromKg(kg, weightUnit)))
            .join('/')
        : summary.weight != null ? String(fromKg(summary.weight, weightUnit)) : '';

    return [summary.sets, reps ? `${reps} reps` : '', weights && `${weights} ${weightUnit}`]
        .filter(Boolean)
        .join(' × ');
};