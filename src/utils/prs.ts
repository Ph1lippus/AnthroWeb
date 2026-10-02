// Personal records.
//
// A PR here is deliberately the simplest thing that could be called one: the
// heaviest set you have ever logged for an exercise. Not an estimated 1RM --
// that rewards trading weight for reps and makes the number unreadable as a
// number. A PR is raised when a logged set beats the recorded weight, and by
// nothing else.
//
// Two tables back this, because they answer different questions:
//   pr_entries   "which exercises am I tracking a PR for" -- seeded from a
//                template when one is created, plus reference-only extras the
//                user adds by hand. An entry with no history yet is a question
//                waiting to be answered, not an error.
//   pr_history   "the times I beat it" -- append-only. A row is written when a
//                set beats the best and never removed, except by deleting the
//                session that produced it, which removes the evidence too.
//
// These helpers are pure. The decision of what counts as a PR lives here so it
// can be read without tracing a Supabase call.

import type { PREntry, PRHistory } from '../services/workoutService';
import { parseSetDetail, bestSet, type WorkoutSet } from './workoutSets';

/**
 * How an exercise is matched across tables. `exercise_id` is authoritative when
 * both sides have one; the normalised name is the fallback for rows written
 * before the library existed, and the reason 'Bench Press' and 'bench  press'
 * don't become two different lifts.
 */
export const exerciseKey = (exercise: { exercise_id?: string | null; exercise_name: string }): string =>
    exercise.exercise_id ? `id:${exercise.exercise_id}` : `name:${exercise.exercise_name.trim().toLowerCase()}`;

/**
 * The key a record is compared under.
 *
 * Deliberately not `exerciseKey`. `pr_history` has no `exercise_id` column --
 * only `pr_entry_id`, which points at the tracked-lift row rather than at the
 * exercise library -- so a logged session's exercise and its own record cannot
 * be matched on an id. They can only be matched on the name.
 *
 * Using `exerciseKey` on both sides of that comparison is what made every save
 * announce a new record: the session side produced `id:<uuid>` and the history
 * side produced `entry:<uuid>`, so `previous` was always undefined and the
 * strictly-heavier gate in `detectNewPRs` never ran. Everything that reads or
 * writes records uses this key instead, so the two cannot drift apart again.
 */
export const prKey = (exerciseName: string): string =>
    `name:${exerciseName.trim().toLowerCase()}`;

export interface PRBest {
    weight: number;
    reps?: number;
    date: string;
    entry: PRHistory;
}

/**
 * The heaviest set ever recorded for an exercise.
 *
 * Ties are broken towards more reps, then towards the earlier date -- so
 * 'when did I first hit 100kg' answers with the day it happened rather than
 * the last time you tied it.
 */
export const currentBestOf = (history: PRHistory[]): PRBest | null => {
    let best: PRBest | null = null;
    for (const entry of history) {
        if (entry.weight == null) continue;
        if (!best
            || entry.weight > best.weight
            || (entry.weight === best.weight
                && (entry.reps ?? 0) > (best.reps ?? 0))) {
            best = { weight: entry.weight, reps: entry.reps, date: entry.workout_date, entry };
        }
    }
    return best;
};

export interface NewPR {
    /** `prKey` of the exercise. Records are compared by name, not by id. */
    exerciseKey: string;
    exercise_name: string;
    exercise_id?: string | null;
    weight: number;
    reps?: number;
}

/**
 * Decide which sets in a session earned a record. Read-only by design: the
 * caller writes the rows, so "which sets count" stays testable without a
 * database.
 *
 * `bests` is only read for its weights, so it accepts a partial record -- the
 * caller does not have a full PRBest to hand, only the number it is comparing
 * against.
 *
 * A set qualifies when it is the heaviest of its exercise in that session and
 * strictly heavier than the best already on record. Strictly is the point --
 * a tie is not a record, and reporting one every time you retest a max trains
 * the user to ignore the notification.
 */
export const detectNewPRs = (
    exercises: Array<{
        exercise_id?: string | null;
        exercise_name: string;
        activity_type?: string;
        sets_detail?: unknown;
        completed?: boolean;
    }>,
    bests: ReadonlyMap<string, { weight: number }>,
): NewPR[] => {
    const found: NewPR[] = [];

    for (const exercise of exercises) {
        if (exercise.completed === false) continue;
        if (exercise.activity_type && exercise.activity_type !== 'strength') continue;

        const heaviest = bestSet(parseSetDetail(exercise.sets_detail));
        if (!heaviest || heaviest.weight === undefined || heaviest.weight <= 0) continue;

        const key = prKey(exercise.exercise_name);
        const previous = bests.get(key);
        if (previous && previous.weight >= heaviest.weight) continue;

        found.push({
            exerciseKey: key,
            exercise_name: exercise.exercise_name,
            exercise_id: exercise.exercise_id ?? null,
            weight: heaviest.weight,
            reps: heaviest.reps,
        });
    }

    return found;
};

/** Newest first. Ties keep the earlier date first, matching `currentBestOf`. */
export const sortHistory = (history: PRHistory[]): PRHistory[] =>
    [...history].sort((a, b) =>
        a.workout_date === b.workout_date
            ? (a.weight ?? 0) - (b.weight ?? 0)
            : a.workout_date < b.workout_date ? 1 : -1);

/**
 * Growth since the first record, so a card can say "+20kg since 2024-03-01"
 * rather than making the user subtract two numbers in their head.
 */
export const prDelta = (history: PRHistory[]): { kg: number; fromDate: string } | null => {
    const dated = history.filter(h => h.weight != null).sort((a, b) =>
        a.workout_date === b.workout_date
            ? (a.weight ?? 0) - (b.weight ?? 0)
            : a.workout_date < b.workout_date ? -1 : 1);
    const first = dated[0];
    const best = currentBestOf(history);
    if (!first || !best || dated.length < 2) return null;
    return { kg: best.weight - (first.weight ?? 0), fromDate: first.workout_date };
};

/** Merge the entries the user tracks with their history, ready to render. */
export interface PRCard {
    entry: PREntry;
    best: PRBest | null;
    history: PRHistory[];
    untracked: boolean;
}

export const buildPRCards = (entries: PREntry[], history: PRHistory[]): PRCard[] => {
    const byEntry = new Map<string, PRHistory[]>();
    const byName = new Map<string, PRHistory[]>();

    for (const row of history) {
        if (row.pr_entry_id) {
            const list = byEntry.get(row.pr_entry_id);
            if (list) list.push(row);
            else byEntry.set(row.pr_entry_id, [row]);
        } else {
            const key = row.exercise_name.trim().toLowerCase();
            const list = byName.get(key);
            if (list) list.push(row);
            else byName.set(key, [row]);
        }
    }

    return entries.map(entry => {
        const rows = byEntry.get(entry.id ?? '')
            ?? byName.get(entry.exercise_name.trim().toLowerCase())
            ?? [];
        return {
            entry,
            best: currentBestOf(rows),
            history: sortHistory(rows),
            // An entry with no weight on record yet is somewhere to fill in,
            // not a record that failed to load.
            untracked: rows.every(r => r.weight == null),
        };
    });
};

/** The heaviest set of a session's exercise, for the "best set" column. */
export const bestSetOf = (sets: unknown): WorkoutSet | undefined => bestSet(parseSetDetail(sets));