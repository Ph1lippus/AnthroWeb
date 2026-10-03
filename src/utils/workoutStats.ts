// Aggregates for the workouts page: the year grid, streaks, volume, and the
// per-exercise rollup behind "stats about the template exercises".
//
// All date maths here runs in the user's local timezone via utils/dates.ts.
// The workout pages previously built their keys with `toISOString()`, which is
// UTC -- for a grid of days that quietly shifts every cell by one for anyone
// west of Greenwich, so a session logged at 11pm can land on the wrong square.

import { toDateString, addDays, todayString } from './dates';
import { parseSetDetail, detailVolumeKg, levelForIntensity, type ActivityType } from './workoutSets';
import { exerciseKey } from './prs';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A day the user trained on, reduced to what the grid needs. */
export interface DayRecord {
    completed: boolean;
    intensity?: number | null;
    exerciseCount: number;
    /** Working sets across the day's exercises, for the grid's hover tooltip. */
    sets?: number;
    volumeKg: number;
    durationMinutes?: number | null;
    /** The plan session's name, when the day followed a named one. */
    name?: string | null;
}

export const dayKey = (date: Date): string => toDateString(date);

// ---------------------------------------------------------------------------
// The git-style grid
// ---------------------------------------------------------------------------

export interface HeatCell {
    date: string;
    /** 0 = no session, 1-4 = intensity buckets. */
    level: number;
    record?: DayRecord;
    isToday: boolean;
    isFuture: boolean;
    /** Sunday-first column index inside its week. */
    weekday: number;
}

export interface HeatWeek {
    cells: HeatCell[];
    /** Month label, present only on the week a new month begins. */
    label?: string;
    monthIndex?: number;
}

/**
 * 53 columns of 7 days, Sunday-first, ending on the week containing `endDate`.
 *
 * The grid starts on a Sunday so weekday rows line up, which means it shows up
 * to six days beyond `endDate`. Those cells are marked `isFuture` and render
 * empty rather than as "missed", because nobody has failed to train on a day
 * that has not happened.
 *
 * `level` is 0 for no session and 1-5 for the five intensity buckets, so a
 * completed day always has a visible square even when no intensity was typed.
 */
export const buildHeatGrid = (
    records: Map<string, DayRecord>,
    endDate: Date = new Date(),
): HeatWeek[] => {
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    const endKey = toDateString(end);

    // Walk back 52 weeks, then back to the Sunday that starts that week.
    const start = new Date(end);
    start.setDate(start.getDate() - 364);
    const gridStart = new Date(start);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());

    // Forward to the Saturday that closes the week `end` falls in.
    const gridEnd = new Date(end);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

    const today = todayString();
    const weeks: HeatWeek[] = [];
    let week: HeatCell[] = [];
    let lastMonth = -1;
    const cursor = new Date(gridStart);

    // Bounded so a bad `endDate` can never spin here.
    for (let i = 0; i < 400 && cursor <= gridEnd; i++) {
        const key = toDateString(cursor);
        const record = records.get(key);
        const done = record?.completed === true;

        week.push({
            date: key,
            level: done ? levelForIntensity(record?.intensity) + 1 : 0,
            record,
            isToday: key === today,
            isFuture: key > endKey,
            weekday: cursor.getDay(),
        });

        if (cursor.getDay() === 6) {
            const labelled = labelWeek(week, lastMonth);
            weeks.push(labelled);
            // Label off the week's *first* day, so a week straddling a month
            // boundary doesn't get two labels or none.
            lastMonth = labelled.monthIndex ?? lastMonth;
            week = [];
        }
        cursor.setDate(cursor.getDate() + 1);
    }

    return weeks;
};

/** Label a week column when its first day falls in a new month. */
const labelWeek = (cells: HeatCell[], lastMonth: number): HeatWeek => {
    const [first] = cells;
    if (!first) return { cells };
    const monthIndex = new Date(first.date).getMonth();
    return monthIndex === lastMonth ? { cells } : { cells, label: MONTH_SHORT[monthIndex], monthIndex };
};

// ---------------------------------------------------------------------------
// Streaks and totals
// ---------------------------------------------------------------------------

/**
 * Consecutive trained days ending today.
 *
 * Today not being logged yet does not break the streak -- it is still
 * undecided, not failed -- so counting starts from yesterday if today is
 * empty. That is why this walks backwards from a cursor rather than testing
 * today's membership first.
 */
export const currentStreak = (records: Map<string, DayRecord>): number => {
    let streak = 0;
    let cursor = todayString();

    if (!records.get(cursor)?.completed) {
        cursor = addDays(cursor, -1);
    }

    // A 4-year cap: a decade-long streak is a data import, not a workout
    // history, and an unbounded loop over a corrupt map is a hang.
    for (let i = 0; i < 1460; i++) {
        if (!records.get(cursor)?.completed) break;
        streak++;
        cursor = addDays(cursor, -1);
    }
    return streak;
};

export const longestStreak = (dates: Iterable<string>): number => {
    const sorted = [...new Set(dates)].sort();
    let best = 0;
    let run = 0;
    let previous: string | null = null;

    for (const date of sorted) {
        run = previous && addDays(previous, 1) === date ? run + 1 : 1;
        if (run > best) best = run;
        previous = date;
    }
    return best;
};

export const completedDates = (records: Map<string, DayRecord>): string[] =>
    [...records.entries()].filter(([, r]) => r.completed).map(([date]) => date).sort();

export interface PeriodTotals {
    sessions: number;
    sets: number;
    volumeKg: number;
    minutes: number;
    avgIntensity: number | null;
}

export const emptyTotals = (): PeriodTotals =>
    ({ sessions: 0, sets: 0, volumeKg: 0, minutes: 0, avgIntensity: null });

/** Totals over every completed session whose date is inside `[from, to]`. */
export const totalsBetween = (
    records: Map<string, DayRecord>,
    from: string,
    to: string,
): PeriodTotals => {
    const totals = emptyTotals();
    let intensitySum = 0;
    let intensityCount = 0;

    for (const [date, record] of records) {
        if (date < from || date > to || !record.completed) continue;
        totals.sessions += 1;
        totals.volumeKg += record.volumeKg;
        totals.minutes += record.durationMinutes ?? 0;
        if (record.intensity != null) {
            intensitySum += record.intensity;
            intensityCount++;
        }
    }
    totals.avgIntensity = intensityCount ? intensitySum / intensityCount : null;
    return totals;
};

// ---------------------------------------------------------------------------
// Per-exercise rollup
// ---------------------------------------------------------------------------

export interface ExerciseRollup {
    key: string;
    exercise_name: string;
    activityType: ActivityType;
    /** wger's muscle list for this exercise, from the library row. */
    muscles: string[];
    /** Sessions in which this exercise was completed. */
    timesLogged: number;
    setsLogged: number;
    volumeKg: number;
    /** Minutes for cardio and mobility, which carry time instead of weight. */
    minutesLogged: number;
    distanceKm: number;
    bestWeight?: number;
    bestReps?: number;
    lastDate?: string;
    /** kg moved in the trailing 30 days, the standard way to read a trend. */
    recentVolumeKg: number;
}

export interface RollupSource {
    exercise_id?: string | null;
    exercise_name: string;
    activity_type?: ActivityType;
    /** Muscle names, attached by the caller from the library row. */
    muscles?: string[] | null;
    workout_date: string;
    completed: boolean;
    sets_detail?: unknown;
    duration_minutes?: number | null;
    distance_km?: number | null;
}

/**
 * Roll every logged exercise up into one row per exercise, in a single pass.
 *
 * `only` restricts the result to a set of keys -- the active template's
 * exercises, on the workouts page. Rows are returned in template order so the
 * table reads as the plan, not as an alphabetical accident.
 */
export const rollupExercises = (
    rows: RollupSource[],
    only?: Set<string>,
): ExerciseRollup[] => {
    const rollups = new Map<string, ExerciseRollup>();
    const cutoff = addDays(todayString(), -30);

    for (const row of rows) {
        const key = exerciseKey(row);
        if (only && !only.has(key)) continue;

        let rollup = rollups.get(key);
        if (!rollup) {
            rollup = {
                key,
                exercise_name: row.exercise_name,
                activityType: (row.activity_type ?? 'strength') as ActivityType,
                muscles: row.muscles ?? [],
                timesLogged: 0,
                setsLogged: 0,
                volumeKg: 0,
                minutesLogged: 0,
                distanceKm: 0,
                recentVolumeKg: 0,
            };
            rollups.set(key, rollup);
        }

        if (!row.completed) continue;

        const sets = parseSetDetail(row.sets_detail);
        const volume = detailVolumeKg(sets);

        rollup.timesLogged += 1;
        rollup.setsLogged += sets.length;
        rollup.volumeKg += volume;
        // Cardio and mobility move no weight, so their work is measured in
        // minutes and kilometres instead. Adding their time to tonnage would
        // invent kilograms nobody lifted.
        rollup.minutesLogged += row.duration_minutes ?? 0;
        rollup.distanceKm += row.distance_km ?? 0;
        if (row.workout_date >= cutoff) rollup.recentVolumeKg += volume;
        if (!rollup.lastDate || row.workout_date > rollup.lastDate) rollup.lastDate = row.workout_date;

        let heaviest: number | undefined;
        let heaviestReps: number | undefined;
        for (const set of sets) {
            if (set.weight !== undefined && (heaviest === undefined || set.weight > heaviest)) {
                heaviest = set.weight;
                heaviestReps = set.reps;
            }
        }
        if (heaviest !== undefined && (rollup.bestWeight === undefined || heaviest > rollup.bestWeight)) {
            rollup.bestWeight = heaviest;
            rollup.bestReps = heaviestReps;
        }
    }

    return [...rollups.values()];
};

// ---------------------------------------------------------------------------
// Muscle groups and non-weight work
// ---------------------------------------------------------------------------

export interface MuscleGroupTotal {
    /** wger's muscle name, as it appears in the library. */
    muscle: string;
    /** Completed sessions that included an exercise hitting this muscle. */
    sessions: number;
    setsLogged: number;
    volumeKg: number;
}

/**
 * How much work went through each muscle group.
 *
 * An exercise lists every muscle it works, so one session can land in several
 * groups -- a barbell row counts for chest, shoulders and arms at once. That is
 * the honest reading: the numbers answer "how much did I train this", not "how
 * many sets of chest press did I do".
 *
 * Sorted by sessions, then volume, so the group you actually train is first.
 * Groups that only ever appear on an unlogged plan row never make it in, which
 * is what keeps this a record of work done rather than of a template.
 *
 * `sessions` sums `timesLogged`, so a muscle on three exercises logged across
 * seven days reads 7. Counting rollups instead would answer a different
 * question -- "how many of my exercises touch this" -- while the field, the doc
 * above and the stats rail all call it sessions.
 */
export const muscleGroupTotals = (rollups: ExerciseRollup[]): MuscleGroupTotal[] => {
    const totals = new Map<string, MuscleGroupTotal>();

    for (const rollup of rollups) {
        if (rollup.timesLogged === 0) continue;
        for (const muscle of rollup.muscles) {
            let total = totals.get(muscle);
            if (!total) {
                total = { muscle, sessions: 0, setsLogged: 0, volumeKg: 0 };
                totals.set(muscle, total);
            }
            total.sessions += rollup.timesLogged;
            total.setsLogged += rollup.setsLogged;
            total.volumeKg += rollup.volumeKg;
        }
    }

    return [...totals.values()].sort(
        (a, b) => b.sessions - a.sessions || b.volumeKg - a.volumeKg || a.muscle.localeCompare(b.muscle),
    );
};

export interface KindTotals {
    strengthMinutes: number;
    cardioMinutes: number;
    mobilityMinutes: number;
    cardioDistanceKm: number;
    cardioSessions: number;
    mobilitySessions: number;
}

/**
 * Time spent on the two kinds of work that carry no weight.
 *
 * Cardio and mobility are measured in minutes and kilometres; folding them into
 * tonnage would invent kilograms nobody lifted. Strength minutes are the same
 * minutes attributed to strength rows, which is only useful as the denominator
 * for a share.
 */
export const kindTotals = (rollups: ExerciseRollup[]): KindTotals => {
    const totals: KindTotals = {
        strengthMinutes: 0,
        cardioMinutes: 0,
        mobilityMinutes: 0,
        cardioDistanceKm: 0,
        cardioSessions: 0,
        mobilitySessions: 0,
    };

    for (const rollup of rollups) {
        if (rollup.timesLogged === 0) continue;
        const minutes = rollup.minutesLogged;
        if (rollup.activityType === 'cardio') {
            totals.cardioMinutes += minutes;
            totals.cardioDistanceKm += rollup.distanceKm;
            totals.cardioSessions += 1;
        } else if (rollup.activityType === 'mobility') {
            totals.mobilityMinutes += minutes;
            totals.mobilitySessions += 1;
        } else {
            totals.strengthMinutes += minutes;
        }
    }

    return totals;
};