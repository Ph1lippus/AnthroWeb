import type { ActiveGoals } from './dailyScoring';
import { isDateString } from './dates';

/**
 * Goals are a history, not a setting.
 *
 * `user_settings.active_goals` used to hold one flat blob that every day read
 * from, which meant raising the water goal silently rewrote the denominator for
 * every past day too. Scoring a day against a target you had not set yet is
 * meaningless, so the numbers moved for no reason the user could see.
 *
 * Instead each save writes a *version* stamped with the day it took effect:
 *
 *     [
 *       { effective_from: '2026-08-01', goals: { nutrition: { water: 2000 } } },
 *       { effective_from: '2026-09-14', goals: { nutrition: { water: 2500 } } },
 *     ]
 *
 * Reading a day means taking the newest version whose `effective_from` is on or
 * before that day, so a log keeps the targets it was actually written against.
 * Days before the first version fall back to that first version, which is the
 * honest answer: those logs were made under whatever the earliest recorded goal
 * was, and inventing "no goal" would score them all 50 and read as data loss.
 */
export interface GoalVersion {
    effective_from: string;
    goals: ActiveGoals;
}

const isGoalObject = (value: unknown): value is ActiveGoals => {
    if (!value || typeof value !== 'object') return false;
    const g = value as Partial<ActiveGoals>;
    // Tolerate a partial blob rather than dropping the version: an old row that
    // only recorded `water` still tells us what the water goal was that day.
    return typeof g.nutrition === 'object' || typeof g.sleep === 'object';
};

/**
 * Read the version list off a settings row, dropping anything malformed.
 *
 * Never throws: a corrupt history must not stop the daily log from rendering.
 * A missing or unusable history yields an empty list, and callers fall back to
 * `active_goals`.
 */
export const parseGoalHistory = (raw: unknown): GoalVersion[] => {
    if (!Array.isArray(raw)) return [];

    const versions: GoalVersion[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const candidate = entry as Partial<GoalVersion>;
        if (!isDateString(candidate.effective_from)) continue;
        if (!isGoalObject(candidate.goals)) continue;
        versions.push({
            effective_from: candidate.effective_from,
            goals: {
                nutrition: {
                    calories: candidate.goals.nutrition?.calories ?? null,
                    protein: candidate.goals.nutrition?.protein ?? null,
                    carbs: candidate.goals.nutrition?.carbs ?? null,
                    fat: candidate.goals.nutrition?.fat ?? null,
                    water: candidate.goals.nutrition?.water ?? null,
                },
                sleep: {
                    hours: candidate.goals.sleep?.hours ?? null,
                    wake_time: candidate.goals.sleep?.wake_time ?? null,
                    bedtime: candidate.goals.sleep?.bedtime ?? null,
                },
            },
        });
    }

    // Sorted ascending so the "newest at or before" scan can walk forward and
    // stop at the first match. Duplicate days collapse to the last one written,
    // which is the version the user actually saved for that day.
    versions.sort((a, b) => a.effective_from.localeCompare(b.effective_from));
    const byDate = new Map<string, GoalVersion>();
    for (const v of versions) byDate.set(v.effective_from, v);
    return [...byDate.values()];
};

/**
 * The goals in force on `date`.
 *
 * `fallback` is used when the history is empty, which is the case for rows
 * written before versioning existed — those have only `active_goals`.
 */
export const goalsForDate = (
    history: GoalVersion[],
    date: string | null | undefined,
    fallback: ActiveGoals | null = null
): ActiveGoals | null => {
    if (!history.length) return fallback;
    if (!isDateString(date)) return history[history.length - 1].goals;

    let match: ActiveGoals | null = history[0].goals;
    for (const version of history) {
        if (version.effective_from > date) break;
        match = version.goals;
    }
    return match;
};

/** The newest version's goals, i.e. what a new day starts with. */
export const latestGoals = (history: GoalVersion[], fallback: ActiveGoals | null = null): ActiveGoals | null =>
    history.length ? history[history.length - 1].goals : fallback;

/**
 * Which goals apply to one day.
 *
 * The precedence is the whole point, and it is not uniform:
 *
 *  - For a past day the log's own `goal_snapshot` wins. It records the targets
 *    that day was actually scored against, so it is the most truthful answer, and
 *    it is what stops an edit to today's goals from silently rewriting history.
 *  - For today the version history wins *instead*. Editing a goal writes a new
 *    version effective today, so if the snapshot still won then a goal change
 *    would be invisible for the rest of the day and would only take effect
 *    tomorrow. Today's snapshot is re-stamped from this same resolution, so it
 *    cannot drift away from the history.
 *
 * This lives here rather than inline in DailyLogPage so the rule can be tested
 * directly. It was previously inlined in the component, which is how it managed
 * to be both wrong and untestable.
 */
export const resolveGoalsForDay = (options: {
    snapshot: unknown;
    history: GoalVersion[];
    date: string | null | undefined;
    fallback: ActiveGoals | null;
    today: string;
}): ActiveGoals | null => {
    const { snapshot, history, date, fallback, today } = options;

    const fromHistory = (): ActiveGoals | null => {
        if (!isDateString(date)) return fallback;
        return goalsForDate(history, date, fallback);
    };

    if (isDateString(date) && date === today) return fromHistory();

    const record = snapshot as ActiveGoals | undefined;
    if (record && (record.nutrition || record.sleep)) return record;

    return fromHistory();
};

/**
 * Add or replace the version starting on `effectiveFrom`.
 *
 * Re-saving on the same day overwrites that day's version instead of appending
 * a duplicate, so repeatedly tweaking today's goals leaves one entry, not a
 * timeline of near-identical rows. Entries after the edited day are dropped:
 * they were derived from goals that no longer exist, and keeping them would
 * resurrect the old target on some future date.
 */
export const withVersion = (
    history: GoalVersion[],
    effectiveFrom: string,
    goals: ActiveGoals
): GoalVersion[] => {
    const kept = history.filter(v => v.effective_from < effectiveFrom);
    return [...kept, { effective_from: effectiveFrom, goals }];
};