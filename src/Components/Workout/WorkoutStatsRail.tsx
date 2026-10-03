import React, { useMemo } from 'react';
import {
    Activity,
    CalendarCheck,
    CalendarRange,
    Dumbbell,
    Flame,
    HeartPulse,
    Layers,
    Timer,
    TrendingUp,
    Trophy,
    Weight,
} from 'lucide-react';
import { usePREntries, usePRHistory } from '../../hooks/useWorkouts';
import { currentBestOf, buildPRCards } from '../../utils/prs';
import {
    kindTotals,
    muscleGroupTotals,
    totalsBetween,
    type DayRecord,
    type PeriodTotals,
    type ExerciseRollup,
    type KindTotals,
    type MuscleGroupTotal,
} from '../../utils/workoutStats';
import { formatWeight, type WeightUnit } from '../../utils/units';
import { addDays, formatDayLabel, todayString } from '../../utils/dates';

interface WorkoutStatsRailProps {
    /** Every day in the loaded window, keyed by date. */
    days: Map<string, DayRecord>;
    last7: PeriodTotals;
    last30: PeriodTotals;
    year: PeriodTotals;
    streak: number;
    /** Per-exercise rollups, already computed for the template-exercises table. */
    rollups: ExerciseRollup[];
    weightUnit: WeightUnit;
}

type Tone = 'good' | 'warn' | 'flat';

interface Tile {
    key: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    value: string;
    hint: string;
    tone: Tone;
}

/**
 * Every figure worth having, as bare tiles three to a row.
 *
 * No group headings. They were "This week", "Consistency", "Last 30 days" and so
 * on, which read as instructions rather than as labels and put a line of type
 * above every pair of tiles. Each tile already says what it is.
 *
 * Nothing here costs a query. `totalsBetween` is a pure helper over the day map
 * the overview already returned, so periods it did not precompute -- the seven
 * days before this week, the thirty before last month -- are arithmetic rather
 * than another fetch. The per-exercise figures come from the rollups the
 * template-exercises table already needs, and the record figures from the two PR
 * queries the records panel already runs.
 *
 * What the window cannot do is answer "all time": the overview asks for 372 days,
 * so a lifetime total would be a lie. Tiles that cover a window say which one.
 */
const WorkoutStatsRail: React.FC<WorkoutStatsRailProps> = ({
    days,
    last7,
    last30,
    year,
    streak,
    rollups,
    weightUnit,
}) => {
    const today = todayString();

    const { data: entries = [] } = usePREntries();
    const { data: history = [] } = usePRHistory();

    // The seven days before this one, which is the comparison that makes
    // "sessions" mean something rather than being a bare count.
    const prior7 = useMemo(
        () => totalsBetween(days, addDays(today, -13), addDays(today, -7)),
        [days, today],
    );
    const prior30 = useMemo(
        () => totalsBetween(days, addDays(today, -59), addDays(today, -30)),
        [days, today],
    );

    const streaks = useMemo(() => {
        const sorted = [...days.entries()]
            .filter(([, d]) => d.completed)
            .map(([key]) => key)
            .sort();
        let best = 0;
        let run = 0;
        let previous: string | null = null;
        for (const key of sorted) {
            run = previous && addDays(previous, 1) === key ? run + 1 : 1;
            previous = key;
            if (run > best) best = run;
        }
        return { longest: best, trainedDays: sorted.length, last: sorted.pop() };
    }, [days]);

    const exercises = useMemo(() => {
        const tracked = rollups.filter(row => row.timesLogged > 0);
        return {
            count: tracked.length,
            most: [...tracked].sort((a, b) => b.timesLogged - a.timesLogged)[0],
            heaviest: [...tracked]
                .filter(row => row.bestWeight != null)
                .sort((a, b) => (b.bestWeight ?? 0) - (a.bestWeight ?? 0))[0],
        };
    }, [rollups]);

    /* Muscle groups and time-based work. Both are derived from the same rollups
       the exercise tiles read, so they cost no query and cannot disagree with
       them about what was logged. */
    const muscles = useMemo<MuscleGroupTotal[]>(() => muscleGroupTotals(rollups), [rollups]);
    const kinds = useMemo<KindTotals>(() => kindTotals(rollups), [rollups]);

    const hours = (minutes: number) => (minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`);

    const records = useMemo(() => {
        const cards = buildPRCards(entries, history).filter(card => card.best);
        const bestGain = cards
            .map(card => ({
                name: card.entry.exercise_name,
                // `sortHistory` is newest-first, so the last row is the earliest.
                gain: card.history.length > 1
                    ? card.best!.weight - (card.history[card.history.length - 1].weight ?? 0)
                    : 0,
            }))
            .sort((a, b) => b.gain - a.gain)[0];
        return {
            tracked: cards.length,
            set: history.filter(row => row.weight != null).length,
            bestGain,
            heaviest: cards
                .map(card => currentBestOf(card.history))
                .filter((best): best is NonNullable<typeof best> => !!best)
                .sort((a, b) => b.weight - a.weight)[0],
        };
    }, [entries, history]);

    const delta = (now: number, before: number) => {
        if (before <= 0) return now > 0 ? 'up from nothing' : 'no change';
        const pct = Math.round((now - before) / before * 100);
        if (pct === 0) return 'no change';
        return `${pct > 0 ? '+' : ''}${pct}% vs before`;
    };

    const kgs = (kg: number) => formatWeight(kg, weightUnit, 0);
    const sets = (weight: number | undefined, reps: number | undefined) =>
        weight == null ? '—' : `${formatWeight(weight, weightUnit, 1)}${reps != null ? ` × ${reps}` : ''}`;

    const tiles: Tile[] = [
        // --- this week ---
        {
            key: 'sessions',
            icon: CalendarCheck,
            label: 'Sessions',
            value: String(last7.sessions),
            hint: delta(last7.sessions, prior7.sessions),
            tone: last7.sessions >= 4 ? 'good' : last7.sessions > 0 ? 'flat' : 'warn',
        },
        {
            key: 'sets',
            icon: Dumbbell,
            label: 'Sets',
            value: String(last7.sets),
            hint: delta(last7.sets, prior7.sets),
            tone: 'flat',
        },
        {
            key: 'week-volume',
            icon: Weight,
            label: 'Volume',
            value: last7.volumeKg > 0 ? kgs(last7.volumeKg) : '—',
            hint: last7.volumeKg > 0 ? 'moved this week' : 'nothing yet',
            tone: 'flat',
        },
        {
            key: 'week-intensity',
            icon: Flame,
            label: 'Intensity',
            value: last7.avgIntensity != null ? `${Math.round(last7.avgIntensity * 10)}%` : '—',
            hint: 'average this week',
            tone: 'flat',
        },

        // --- consistency ---
        {
            key: 'streak',
            icon: Flame,
            label: 'Streak',
            value: String(streak),
            hint: streak > 0 ? 'days in a row' : 'mark a day',
            tone: streak >= 3 ? 'good' : streak > 0 ? 'flat' : 'warn',
        },
        {
            key: 'longest',
            icon: Trophy,
            label: 'Best streak',
            value: String(streaks.longest),
            hint: 'in 12 months',
            tone: 'flat',
        },
        {
            key: 'trained-days',
            icon: CalendarCheck,
            label: 'Days trained',
            value: String(streaks.trainedDays),
            hint: 'in 12 months',
            tone: 'flat',
        },
        {
            key: 'last',
            icon: CalendarRange,
            label: 'Last trained',
            value: streaks.last ? formatDayLabel(streaks.last) : '—',
            hint: streaks.last ? 'most recent' : 'nothing yet',
            tone: 'flat',
        },

        // --- the last 30 days ---
        {
            key: 'month-volume',
            icon: TrendingUp,
            label: 'Volume 30d',
            value: last30.volumeKg > 0 ? kgs(last30.volumeKg) : '—',
            hint: delta(last30.volumeKg, prior30.volumeKg),
            tone: last30.volumeKg > prior30.volumeKg ? 'good' : 'flat',
        },
        {
            key: 'month-sessions',
            icon: Dumbbell,
            label: 'Sessions 30d',
            value: String(last30.sessions),
            hint: delta(last30.sessions, prior30.sessions),
            tone: 'flat',
        },
        {
            key: 'sets-per-session',
            icon: Layers,
            label: 'Sets / session',
            value: year.sessions > 0 ? (year.sets / year.sessions).toFixed(1) : '—',
            hint: '12-month average',
            tone: 'flat',
        },
        {
            key: 'time',
            icon: Timer,
            label: 'Time 12mo',
            value: year.minutes > 0 ? `${Math.round(year.minutes / 60)}h` : '—',
            hint: year.sessions > 0 ? `${Math.round(year.minutes / year.sessions)} min each` : 'nothing yet',
            tone: 'flat',
        },
        {
            key: 'year-volume',
            icon: Weight,
            label: 'Volume 12mo',
            value: year.volumeKg > 0 ? kgs(year.volumeKg) : '—',
            hint: `${year.sessions} sessions`,
            tone: 'flat',
        },
        {
            key: 'year-intensity',
            icon: Flame,
            label: 'Intensity 12mo',
            value: year.avgIntensity != null ? `${Math.round(year.avgIntensity * 10)}%` : '—',
            hint: 'across the year',
            tone: 'flat',
        },

        // --- exercises ---
        {
            key: 'tracked',
            icon: Layers,
            label: 'Exercises',
            value: String(exercises.count),
            hint: exercises.count === 1 ? 'distinct one' : 'distinct trained',
            tone: 'flat',
        },
        {
            key: 'most',
            icon: Dumbbell,
            label: 'Most trained',
            value: exercises.most?.exercise_name ?? '—',
            hint: exercises.most ? `${exercises.most.timesLogged} sessions` : 'nothing yet',
            tone: 'flat',
        },
        {
            key: 'heaviest',
            icon: Weight,
            label: 'Heaviest set',
            value: sets(exercises.heaviest?.bestWeight, exercises.heaviest?.bestReps),
            hint: exercises.heaviest?.exercise_name ?? 'nothing yet',
            tone: 'flat',
        },

        // --- records ---
        {
            key: 'pr-best',
            icon: Trophy,
            label: 'Best set',
            value: records.heaviest
                ? sets(records.heaviest.weight, records.heaviest.reps)
                : '—',
            hint: records.heaviest?.entry.exercise_name ?? 'no records yet',
            tone: 'good',
        },
        {
            key: 'pr-count',
            icon: Trophy,
            label: 'Records set',
            value: String(records.set),
            hint: `${records.tracked} lift${records.tracked === 1 ? '' : 's'} tracked`,
            tone: 'flat',
        },
        {
            key: 'pr-gain',
            icon: TrendingUp,
            label: 'Biggest gain',
            value: records.bestGain && records.bestGain.gain > 0
                ? kgs(records.bestGain.gain)
                : '—',
            hint: records.bestGain?.name ?? 'needs two records',
            tone: 'flat',
        },

        // --- muscle groups ---
        /* The first three are the groups that have had the most sessions. Three
           because the rail is three to a row, and a fourth would break the
           shape the rest of the tiles set. */
        ...muscles.slice(0, 3).map((total): Tile => ({
            key: `muscle-${total.muscle}`,
            icon: Activity,
            label: total.muscle,
            value: String(total.sessions),
            hint: total.volumeKg > 0 ? kgs(total.volumeKg) : `${total.setsLogged} sets`,
            tone: 'flat',
        })),
        {
            key: 'muscle-count',
            icon: Layers,
            label: 'Muscle groups',
            value: String(muscles.length),
            hint: muscles.length > 0 ? 'worked in 12 months' : 'none logged yet',
            tone: 'flat',
        },

        // --- cardio and mobility ---
        {
            key: 'cardio-time',
            icon: HeartPulse,
            label: 'Cardio',
            value: kinds.cardioMinutes > 0 ? hours(kinds.cardioMinutes) : '—',
            hint: kinds.cardioSessions > 0
                ? `${kinds.cardioSessions} sessions${kinds.cardioDistanceKm > 0 ? ` · ${kinds.cardioDistanceKm.toFixed(1)} km` : ''}`
                : 'nothing logged yet',
            tone: 'flat',
        },
        {
            key: 'mobility-time',
            icon: Activity,
            label: 'Mobility',
            value: kinds.mobilityMinutes > 0 ? hours(kinds.mobilityMinutes) : '—',
            hint: kinds.mobilitySessions > 0 ? `${kinds.mobilitySessions} sessions` : 'nothing logged yet',
            tone: 'flat',
        },
    ];

    return (
        <div className="stats-rail">
            {tiles.map(tile => {
                const Icon = tile.icon;
                return (
                    <div key={tile.key} className={`analysis-card analysis-card--${tile.tone}`}>
                        <div className="analysis-card-head">
                            <Icon className="analysis-card-icon" size={15} aria-hidden="true" />
                            <span className="analysis-card-label">{tile.label}</span>
                        </div>
                        <div className="analysis-card-value">{tile.value}</div>
                        <div className="analysis-card-hint">{tile.hint}</div>
                    </div>
                );
            })}
        </div>
    );
};

export default WorkoutStatsRail;