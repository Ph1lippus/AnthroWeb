import React, { useCallback, useMemo } from 'react';
import { Moon, Utensils, Droplets, Scale, Smile } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DailyLog } from '../../services/dailyLogService';
import type { Habit, DailyHabitLog } from '../../services/habitService';
import type { UserSettings } from '../../services/profileService';
import type { BodyMeasurement } from '../../services/measurementService';
import type { ActiveGoals } from '../../utils/dailyScoring';
import { BUILTIN_HABIT_COUNT } from '../../utils/dailyScoring';
import { goalsForDate, parseGoalHistory } from '../../utils/goalHistory';
import { meanMoodAcross } from '../../utils/moodSeries';
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
    color?: string;
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
        const measurementsInRange = (measurements ?? [])
            .filter(m => m.measure_date && inRange(m.measure_date, range.days))
            .slice()
            .sort((a, b) => a.measure_date.localeCompare(b.measure_date));

        const out: Stat[] = [];

        // 1. Sleep - duration, bedtime, wake time.
        const parseClock = (t?: string | null): number | null => {
            if (!t) return null;
            const [h, m] = t.split(':').map(Number);
            if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
            return h + m / 60;
        };
        const duration = mean(sorted.map(l => l.sleep_duration));
        const bedtimes = sorted.map(l => parseClock(l.bedtime)).filter((v): v is number => v !== null);
        const wakes = sorted.map(l => parseClock(l.wake_time)).filter((v): v is number => v !== null);
        const avgBed = bedtimes.length ? bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length : null;
        const avgWake = wakes.length ? wakes.reduce((a, b) => a + b, 0) / wakes.length : null;
        const fmtClock = (h: number | null) => h === null ? '--' : `${String(Math.floor(h % 24)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
        out.push({
            key: 'sleepDuration',
            label: 'Duration',
            value: fmtDuration(duration),
            hint: `Quality ${fmt(mean(sorted.map(l => l.sleep_quality)), '/10')}`,
            icon: Moon,
            color: '#a78bfa',
            tone: duration !== null && duration >= 7 ? 'good' : duration === null ? 'flat' : 'warn',
        });
        out.push({
            key: 'bedtime',
            label: 'Bedtime',
            value: fmtClock(avgBed),
            hint: 'Average bedtime',
            icon: Moon,
            color: '#a78bfa',
            tone: 'flat',
        });
        out.push({
            key: 'wakeTime',
            label: 'Wake time',
            value: fmtClock(avgWake),
            hint: 'Average wake time',
            icon: Moon,
            color: '#a78bfa',
            tone: 'flat',
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
            color: '#38bdf8',
            tone: water === null ? 'flat' : waterAttainment === null ? 'flat' : waterAttainment >= 90 ? 'good' : 'warn',
        });

        // Macros: average intake and attainment against per-day goals.
        const macroDefs = [
            { key: 'calories', label: 'Calories', field: 'calories' as const, goalKey: 'calories' as const, suffix: ' kcal', icon: Utensils },
            { key: 'protein', label: 'Protein', field: 'protein' as const, goalKey: 'protein' as const, suffix: ' g', icon: Utensils },
            { key: 'carbs', label: 'Carbs', field: 'carbs' as const, goalKey: 'carbs' as const, suffix: ' g', icon: Utensils },
            { key: 'fat', label: 'Fat', field: 'fat' as const, goalKey: 'fat' as const, suffix: ' g', icon: Utensils },
        ];
        for (const m of macroDefs) {
            const vals = sorted.map(l => l[m.field] as number | null);
            const avg = mean(vals);
            const goal = mean(sorted.map(l => goalsOn(l.log_date)?.nutrition?.[m.goalKey] ?? null));
            const delta = avg !== null && goal !== null ? avg - goal : null;
            out.push({
                key: m.key,
                label: m.label,
                value: fmt(avg, m.suffix, 0),
                hint: goal === null
                    ? 'No goal set'
                    : delta === null ? 'No data' : `${delta > 0 ? '+' : ''}${Math.round(delta)} vs. goal`,
                icon: m.icon,
                color: '#22c55e',
                tone: delta === null || goal === null
                    ? 'flat'
                    : Math.abs(delta) <= Math.max(1, goal * 0.1) ? 'good' : 'warn',
            });
        }

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
            color: '#f59e0b',
            tone: latestWeight === null ? 'flat' : weightTrend.tone,
        });

        // 5. Mood and habit adherence as separate cards.
        // Mean of per-day means across both ratings, so a day rated twice is not
        // double-weighted against one rated once. This card is the only place on
        // the dashboard that collapses the pair into one number -- the charts
        // below it plot the two separately, which is where the split is legible.
        const mood = meanMoodAcross(sorted);
        if (mood !== null) {
            out.push({
                key: 'mood',
                label: 'Mood',
                value: fmt(mood, '/10'),
                hint: 'Average across the range',
                icon: Smile,
                color: '#ec4899',
                tone: mood >= 7 ? 'good' : 'warn',
            });
        }

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
        if (habitPct !== null) {
            out.push({
                key: 'habits',
                label: 'Habits',
                value: `${habitPct}%`,
                hint: 'Completion across the range',
                icon: Smile,
                color: '#ec4899',
                tone: habitPct >= 70 ? 'good' : 'warn',
            });
        }

        return out;
    }, [logs, habits, habitLogs, goalsOn, range.days, measurements]);

    if (stats.length === 0) return null;

    return (
        <>
            {stats.map(s => {
                const Icon = s.icon;
                return (
                    <div key={s.key} className={`analysis-card analysis-card--${s.tone}`}>
                        <div className="analysis-card-head">
                            <Icon className="analysis-card-icon" size={15} aria-hidden="true" style={s.color ? { color: s.color } : undefined} />
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
        </>
    );
};

export default AnalysisCards;
