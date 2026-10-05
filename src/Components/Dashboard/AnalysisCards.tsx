import React, { useCallback, useMemo } from 'react';
import { Moon, Utensils, Droplets, Scale, HeartPulse, Smile } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DailyLog } from '../../services/dailyLogService';
import type { Habit, DailyHabitLog } from '../../services/habitService';
import type { UserSettings } from '../../services/profileService';
import type { BodyMeasurement } from '../../services/measurementService';
import type { ActiveGoals } from '../../utils/dailyScoring';
import { BUILTIN_HABIT_COUNT } from '../../utils/dailyScoring';
import { goalsForDate, parseGoalHistory } from '../../utils/goalHistory';
import type { DateRange } from './dateRange';

const inRange = (date: string, days: number | null): boolean => {
    if (days === null) return true;
    const diff = Math.floor((Date.now() - new Date(date + 'T00:00:00').getTime()) / 86400000);
    return diff >= 0 && diff < days;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

interface Stat {
    key: string;
    label: string;
    value: string;
    unit?: string;
    hint: string;
    icon: LucideIcon;
    /** Positive means the metric moved in a direction that is good. */
    tone: 'good' | 'warn' | 'flat';
}

interface AnalysisCardsProps {
    logs: DailyLog[] | null;
    habits: Habit[] | null;
    habitLogs: DailyHabitLog[] | null;
    settings: UserSettings | null;
    range: DateRange;
    /** Body measurements. Weight and body fat live here, not on the daily log. */
    measurements: BodyMeasurement[] | null;
}

const mean = (values: (number | null | undefined)[]): number | null => {
    let sum = 0;
    let n = 0;
    for (const v of values) {
        if (typeof v === 'number' && !Number.isNaN(v)) {
            sum += v;
            n++;
        }
    }
    return n > 0 ? sum / n : null;
};

const fmt = (n: number | null, suffix = '', digits = 1): string =>
    n === null ? '--' : `${digits === 0 ? Math.round(n) : round1(n)}${suffix}`;

const fmtDuration = (hours: number | null): string =>
    hours === null ? '--' : `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;

// Compares the second half of the window against the first half so the delta
// reflects the selected range rather than an arbitrary week-over-week slice.
const trend = (
    current: number | null,
    previous: number | null,
    lowerIsBetter: boolean
): { text: string; tone: 'good' | 'warn' | 'flat' } => {
    if (current === null || previous === null) return { text: 'No trend yet', tone: 'flat' };
    const diff = current - previous;
    if (Math.abs(diff) < Math.max(0.1, Math.abs(previous) * 0.01)) {
        return { text: 'Holding steady', tone: 'flat' };
    }
    const improved = lowerIsBetter ? diff < 0 : diff > 0;
    return {
        text: `${diff > 0 ? '+' : ''}${round1(diff)} vs. earlier in range`,
        tone: improved ? 'good' : 'warn',
    };
};

const AnalysisCards: React.FC<AnalysisCardsProps> = ({ logs, habits, habitLogs, settings, range, measurements }) => {
    const goalHistory = useMemo(() => parseGoalHistory(settings?.goal_history), [settings?.goal_history]);
    const currentGoals = (settings?.active_goals as ActiveGoals | undefined) || null;

    /**
     * A day's goal, falling back to the goals in force today.
     *
     * Aggregates mix days that may predate the current goal, so scoring the
     * whole window against today's target is what made history appear to
     * change. Each log is resolved on its own date instead.
     */
    const goalsOn = useCallback((date: string): ActiveGoals | null =>
        goalsForDate(goalHistory, date, currentGoals), [goalHistory, currentGoals]);

    const stats = useMemo<Stat[]>(() => {
        if (!logs) return [];

        const scoped = logs.filter(l => inRange(l.log_date, range.days));
        const sorted = scoped.slice().sort((a, b) => a.log_date.localeCompare(b.log_date));
        const half = Math.floor(sorted.length / 2);
        const first = sorted.slice(0, half);
        const second = sorted.slice(half);
        const pick = (list: typeof sorted, key: keyof DailyLog) => list.map(l => l[key] as number | null | undefined);

        const measurementsInRange = (measurements ?? [])
            .filter(m => m.measure_date && inRange(m.measure_date, range.days))
            .slice()
            .sort((a, b) => a.measure_date.localeCompare(b.measure_date));

        const out: Stat[] = [];

        // 1. Sleep - duration and quality together, since one is meaningless without the other.
        const duration = mean(sorted.map(l => l.sleep_duration));
        const quality = mean(sorted.map(l => l.sleep_quality));
        out.push({
            key: 'sleep',
            label: 'Sleep',
            value: fmtDuration(duration),
            hint: `Quality ${fmt(quality, '/10')}`,
            icon: Moon,
            tone: duration !== null && duration >= 7 ? 'good' : duration === null ? 'flat' : 'warn',
        });

        // 2. Nutrition - calories against the goal, with protein adherence.
        //
        // Mean intake is compared against the mean of each day's own goal, so a
        // window spanning a goal change isn't judged by a target most of it was
        // never aiming at.
        const calories = mean(sorted.map(l => l.calories));
        const calGoals = sorted.map(l => goalsOn(l.log_date)?.nutrition?.calories ?? null);
        const calGoal = mean(calGoals);
        const calDelta = calories !== null && calGoal ? calories - calGoal : null;
        out.push({
            key: 'nutrition',
            label: 'Nutrition',
            value: fmt(calories, ' kcal', 0),
            hint: calGoal
                ? `${calDelta === null ? 'No data' : `${calDelta > 0 ? '+' : ''}${Math.round(calDelta)} vs. goal`}`
                : 'No calorie goal set',
            icon: Utensils,
            tone: calDelta === null || calGoal === null
                ? 'flat'
                : Math.abs(calDelta) <= Math.max(150, calGoal * 0.1) ? 'good' : 'warn',
        });

        // 3. Hydration.
        const water = mean(sorted.map(l => l.water));
        const waterGoal = mean(sorted.map(l => goalsOn(l.log_date)?.nutrition?.water ?? null));
        // Per-day attainment, not intake-over-mean-goal: a day met its own target
        // even if a later edit raised that target above it.
        const attainmentRatios = sorted
            .map(l => ({ log: l.water, goal: goalsOn(l.log_date)?.nutrition?.water ?? null }))
            .filter((r): r is { log: number; goal: number } =>
                typeof r.log === 'number' && !Number.isNaN(r.log) && typeof r.goal === 'number' && r.goal > 0)
            .map(r => Math.min(1, r.log / r.goal));
        const waterAttainment = attainmentRatios.length
            ? Math.round((attainmentRatios.reduce((a, b) => a + b, 0) / attainmentRatios.length) * 100)
            : null;
        out.push({
            key: 'water',
            label: 'Hydration',
            value: fmt(water, ' ml', 0),
            hint: waterGoal === null
                ? 'No water goal set'
                : waterAttainment !== null ? `${waterAttainment}% of daily goal` : 'No data',
            icon: Droplets,
            tone: water === null ? 'flat' : waterAttainment === null ? 'flat' : waterAttainment >= 90 ? 'good' : 'warn',
        });

        // 4. Body - latest weight plus movement across the window. Read from
        // body_measurements rather than the daily log, which no longer has the
        // columns: weight is one record per date and lives in one place.
        const weights = measurementsInRange
            .filter(m => typeof m.weight === 'number')
            .map(m => m.weight as number);
        const latestWeight = weights.length > 0 ? weights[weights.length - 1] : null;
        const halfWeights = Math.floor(weights.length / 2);
        const weightTrend = trend(
            mean(weights.slice(halfWeights)),
            mean(weights.slice(0, halfWeights)),
            false,
        );
        out.push({
            key: 'body',
            label: 'Body',
            value: fmt(latestWeight, ' kg'),
            hint: latestWeight === null ? 'No measurements' : weightTrend.text,
            icon: Scale,
            tone: latestWeight === null ? 'flat' : weightTrend.tone,
        });

        // 5. Vitals - resting heart rate is the most actionable single number.
        const hr = mean([...sorted.map(l => l.morning_bpm), ...sorted.map(l => l.evening_bpm)]);
        const hrTrend = trend(mean(pick(second, 'morning_bpm')), mean(pick(first, 'morning_bpm')), true);
        out.push({
            key: 'vitals',
            label: 'Resting HR',
            value: fmt(hr, ' bpm', 0),
            hint: hr === null ? 'No readings' : hrTrend.text,
            icon: HeartPulse,
            tone: hr === null ? 'flat' : hrTrend.tone,
        });

        // 6. Mood and habit adherence travel together as a consistency signal.
        const mood = mean(sorted.map(l => l.mood));
        const completedByDate = new Map<string, number>();
        if (habitLogs) {
            for (const h of habitLogs) {
                if (!h.completed) continue;
                completedByDate.set(h.log_date, (completedByDate.get(h.log_date) ?? 0) + 1);
            }
        }
        const habitTotal = BUILTIN_HABIT_COUNT + (habits?.length ?? 0);
        const habitPct = sorted.length > 0 && habitTotal > 0
            ? Math.round(
                (sorted.reduce((sum, l) => {
                    const builtin = [
                        l.morning_routine, l.evening_routine, l.fruit_serving, l.studied,
                        l.journal, l.stretching, l.reading, l.project_work_done,
                    ].filter(Boolean).length;
                    return sum + builtin + (completedByDate.get(l.log_date) ?? 0);
                }, 0) / (sorted.length * habitTotal)) * 100
            )
            : null;
        out.push({
            key: 'mood',
            label: 'Mood & Habits',
            value: fmt(mood, '/10'),
            hint: habitPct === null ? 'No data' : `${habitPct}% habit completion`,
            icon: Smile,
            tone: mood === null ? 'flat' : mood >= 7 ? 'good' : 'warn',
        });

        return out;
    }, [logs, habits, habitLogs, goalsOn, range.days, measurements]);

    if (stats.length === 0) return null;

    return (
        <div className="analysis-grid">
            {stats.map(s => {
                const Icon = s.icon;
                return (
                    <div key={s.key} className={`analysis-card analysis-card--${s.tone}`}>
                        <div className="analysis-card-head">
                            <Icon className="analysis-card-icon" size={15} aria-hidden="true" />
                            <span className="analysis-card-label">{s.label}</span>
                        </div>
                        <div className="analysis-card-value">
                            {s.value}
                            {s.unit && <span className="analysis-card-unit">{s.unit}</span>}
                        </div>
                        <div className="analysis-card-hint">{s.hint}</div>
                    </div>
                );
            })}
        </div>
    );
};

export default AnalysisCards;
