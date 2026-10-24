import { getUserDailyLogs, updateDailyLog } from './dailyLogService';
import { getBodyMeasurements, getLatestMeasurement } from './measurementService';
import type { BodyMeasurement } from './measurementService';
import { getAllHabitLogs, getUserHabits } from './habitService';
import { getUserSettings } from './profileService';
import { cheatDayStatus } from '../utils/cheatDays';
import { parseGoalHistory, resolveGoalsForDay } from '../utils/goalHistory';
import { todayString } from '../utils/dates';
import { computeDailyScore } from '../utils/dailyScoring';
import type { ActiveGoals } from '../utils/dailyScoring';
import { buildScoringInputFromLog } from '../utils/logScoring';

/**
 * Re-score every stored day from its own row, using each day's own goals.
 *
 * The dashboard button exists so scores written under an older version of the
 * scorer can be repaired without touching anything else: goals, habits, mood and
 * measurements are read as stored, only `daily_score` is rewritten. A past day
 * keeps the goals it was scored against (its frozen snapshot, or the version
 * effective on that date) instead of being re-judged against today's targets.
 */
export const recalcAllDailyScores = async (): Promise<number> => {
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
        console.error('Could not load the data to recalculate scores:', error);
        return 0;
    }

    if (logs.length === 0) return 0;

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
    for (const log of logs) {
        if (!log.id) continue;

        const goals = resolveGoalsForDay({
            snapshot: log.goal_snapshot,
            history,
            date: log.log_date,
            fallback,
            today,
        });

        const status = cheatDayStatus({
            logs,
            date: log.log_date,
            isCheat: Boolean(log.cheat_day),
            allowed: settings?.cheat_days_allowed ?? null,
            period: settings?.cheat_days_period ?? 'week',
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
            console.error('Could not store a recalculated score:', error);
        }
    }

    return written;
};