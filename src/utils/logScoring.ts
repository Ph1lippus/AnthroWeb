import { computeDailyScore } from './dailyScoring';
import type { ActiveGoals, DailyScoringInput } from './dailyScoring';

/**
 * Re-score a stored day from its row.
 *
 * The daily log page builds the scorer's input from form state, because it is
 * looking at the day being typed. This builds the same input from a row that has
 * already been written, which is what lets a day nobody has open still be
 * re-judged -- the cheat-day budget changes a *stored* score when a later day
 * moves the window's first-cheat-day line, and the day in question is usually a
 * past one.
 *
 * Only the subset of columns the scorer reads is required, so `DailyLog`
 * satisfies it structurally without this module depending on the service.
 */
export interface ScorableDailyLog {
    log_date: string;
    wake_time?: string | null;
    bedtime?: string | null;
    sleep_quality?: number | null;
    morning_systolic?: number | null;
    morning_diastolic?: number | null;
    morning_bpm?: number | null;
    evening_systolic?: number | null;
    evening_diastolic?: number | null;
    evening_bpm?: number | null;
    body_temperature?: number | null;
    calories?: number | null;
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
    water?: number | null;
    morning_mood?: number | null;
    evening_mood?: number | null;
    morning_routine?: boolean | null;
    evening_routine?: boolean | null;
    fruit_serving?: boolean | null;
    studied?: boolean | null;
    journal?: boolean | null;
    stretching?: boolean | null;
    reading?: boolean | null;
    project_work_done?: boolean | null;
    gym?: boolean | null;
    no_sleep?: boolean | null;
    cheat_day?: boolean | null;
}

export interface LogScoringContext {
    /** Goals resolved for this day (snapshot / history), as the page resolves them. */
    goals: ActiveGoals | null;
    /** Body targets and settings the scorer reads. */
    settings: { active_goals?: unknown; target_weight?: number | null; target_bodyfat?: number | null } | null;
    weight: number | null;
    bodyFat: number | null;
    customCompleted: number;
    customTotal: number;
    cheatDayExempt: boolean;
    lastMeasurementDate?: string | null;
}

const text = (value: number | null | undefined): string =>
    value === null || value === undefined ? '' : String(value);

const flag = (value: boolean | null | undefined): boolean => Boolean(value);

export const buildScoringInputFromLog = (
    log: ScorableDailyLog,
    context: LogScoringContext,
): DailyScoringInput => {
    // The scorer reads the day's goals out of `settings.active_goals`, so the
    // resolved goals are folded in here the same way the page folds them in --
    // target_weight/target_bodyfat come from the settings row itself.
    const settings = context.goals
        ? { ...(context.settings ?? {}), active_goals: context.goals }
        : context.settings;

    return {
        wakeTime: log.wake_time ?? '',
        bedtime: log.bedtime ?? '',
        sleepQuality: text(log.sleep_quality),
        morningSystolic: text(log.morning_systolic),
        morningDiastolic: text(log.morning_diastolic),
        morningBpm: text(log.morning_bpm),
        eveningSystolic: text(log.evening_systolic),
        eveningDiastolic: text(log.evening_diastolic),
        eveningBpm: text(log.evening_bpm),
        bodyTemperature: text(log.body_temperature),
        calories: text(log.calories),
        protein: text(log.protein),
        carbs: text(log.carbs),
        fat: text(log.fat),
        water: text(log.water),
        weight: context.weight,
        bodyFat: context.bodyFat,
        morningMood: text(log.morning_mood),
        eveningMood: text(log.evening_mood),
        habits: {
            morningRoutine: flag(log.morning_routine),
            eveningRoutine: flag(log.evening_routine),
            fruitServing: flag(log.fruit_serving),
            studied: flag(log.studied),
            journal: flag(log.journal),
            stretching: flag(log.stretching),
            reading: flag(log.reading),
            projectWorkDone: flag(log.project_work_done),
            gym: flag(log.gym),
        },
        customCompleted: context.customCompleted,
        customTotal: context.customTotal,
        activeGoals: context.goals,
        settings,
        noSleep: flag(log.no_sleep),
        cheatDay: flag(log.cheat_day),
        cheatDayExempt: context.cheatDayExempt,
        lastMeasurementDate: context.lastMeasurementDate ?? null,
    };
};

/** Convenience wrapper: the score a stored row would produce. */
export const scoreStoredLog = (
    log: ScorableDailyLog,
    context: LogScoringContext,
): number => computeDailyScore(buildScoringInputFromLog(log, context)).score;
