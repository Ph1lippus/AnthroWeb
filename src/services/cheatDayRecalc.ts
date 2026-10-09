import { getUserDailyLogs, updateDailyLog } from './dailyLogService';
import { getBodyMeasurements, getLatestMeasurement } from './measurementService';
import type { BodyMeasurement } from './measurementService';
import { getAllHabitLogs, getUserHabits } from './habitService';
import { getUserSettings } from './profileService';
import { cheatDayStatus, periodBounds } from '../utils/cheatDays';
import type { CheatDayPeriod } from '../utils/cheatDays';
import { parseGoalHistory, resolveGoalsForDay } from '../utils/goalHistory';
import { todayString } from '../utils/dates';
import { computeDailyScore } from '../utils/dailyScoring';
import type { ActiveGoals } from '../utils/dailyScoring';
import { buildScoringInputFromLog } from '../utils/logScoring';

/**
 * Re-score the cheat days whose verdict the window's arithmetic has changed.
 *
 * A cheat day's score is not a fact about the day alone: whether it is the first
 * free cheat day of the week or the third over-budget one depends on every other
 * cheat day around it. That falls out of sorting the window's dates, which keeps
 * `daily_logs` the single source of truth -- but it also means a stored
 * `daily_score` can be left stale when a day is added or removed out of order.
 * Opening and re-saving the day fixes it; this fixes it for every day in the
 * window at once, so a chart that reads yesterday's stored score is not showing
 * a number the app would no longer compute.
 *
 * Every write goes through the one scorer the live page uses, from the row that
 * is stored, so there is no second definition of a day's score to drift.
 */
export const recalcCheatDayScores = async (options: {
    allowed: number | null | undefined;
    period: CheatDayPeriod;
    /**
     * Restrict the sweep to the window holding this date. Omit to sweep every
     * cheat day -- the right reach when the budget itself changed, since that
     * moves the line in every window at once.
     */
    anchorDate?: string | null;
    /**
     * Days to leave alone, normally the one open in the form: its own autosave
     * owns its stored score and writing it twice would race that save.
     */
    excludeDates?: string[];
}): Promise<number> => {
    const exclude = new Set(options.excludeDates ?? []);

    let logs, settings, habits, habitLogs, measurements, latest;
    try {
        [logs, settings, habits, habitLogs, measurements, latest] = await Promise.all([
            getUserDailyLogs(),
            getUserSettings(),
            getUserHabits(),
            getAllHabitLogs(),
            getBodyMeasurements(),
            getLatestMeasurement(),
        ]);
    } catch (error) {
        console.error('Could not load the data to recalculate cheat-day scores:', error);
        return 0;
    }

    const cheatLogs = logs.filter(log => log.cheat_day);
    if (cheatLogs.length === 0) return 0;

    let targets = cheatLogs;
    if (options.anchorDate) {
        const { start, end } = periodBounds(options.anchorDate, options.period);
        targets = targets.filter(log => log.log_date >= start && log.log_date <= end);
    }
    targets = targets.filter(log => !exclude.has(log.log_date));
    if (targets.length === 0) return 0;

    const history = parseGoalHistory(settings?.goal_history);
    const fallback = (settings?.active_goals as ActiveGoals | null) ?? null;
    const today = todayString();
    const customTotal = habits.length;

    const completedByDate = new Map<string, number>();
    for (const habitLog of habitLogs) {
        if (!habitLog.completed) continue;
        completedByDate.set(habitLog.log_date, (completedByDate.get(habitLog.log_date) ?? 0) + 1);
    }

    const measurementByDate = new Map<string, BodyMeasurement>();
    for (const measurement of measurements) {
        measurementByDate.set(measurement.measure_date, measurement);
    }
    const lastMeasurementDate = latest?.measure_date ?? null;

    let written = 0;
    for (const log of targets) {
        if (!log.id) continue;

        const status = cheatDayStatus({
            logs,
            date: log.log_date,
            isCheat: true,
            allowed: options.allowed,
            period: options.period,
        });
        const goals = resolveGoalsForDay({
            snapshot: log.goal_snapshot,
            history,
            date: log.log_date,
            fallback,
            today,
        });
        const measurement = measurementByDate.get(log.log_date);

        const score = computeDailyScore(buildScoringInputFromLog(log, {
            goals,
            settings,
            weight: measurement?.weight ?? null,
            bodyFat: measurement?.body_fat ?? null,
            customCompleted: completedByDate.get(log.log_date) ?? 0,
            customTotal,
            cheatDayExempt: status.exempt,
            lastMeasurementDate,
        })).score;

        if (score === (log.daily_score ?? null)) continue;
        try {
            await updateDailyLog(log.id, { daily_score: score });
            written += 1;
        } catch (error) {
            console.error('Could not store a recalculated cheat-day score:', error);
        }
    }

    return written;
};
