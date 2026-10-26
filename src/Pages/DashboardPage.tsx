import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Title from '../Components/Title';
import AnalysisCards from '../Components/Dashboard/AnalysisCards';
import DomainStats from '../Components/Dashboard/DomainStats';
import { DEFAULT_RANGE, RANGES } from '../Components/Dashboard/dateRange';
import type { DateRange } from '../Components/Dashboard/dateRange';
import { useDailyLogs } from '../hooks/useDailyLogs';
import { queryKeys } from '../utils/queryKeys';
import { recalcAllDailyScores } from '../services/scoreRecalc';
import { RefreshCw } from 'lucide-react';
import { useHabitData } from '../hooks/useHabitData';
import { useUserSettings } from '../hooks/useUserSettings';
import { useBodyMeasurements } from '../hooks/useMeasurements';
import { useBootHold } from '../services/bootScreen';
import MetricsCharts from '../Components/Dashboard/MetricsCharts';
import StudyChart from '../Components/Dashboard/StudyChart';
import WeightLossCards from '../Components/Dashboard/WeightLossCards';
import LoadingBar from '../Components/LoadingBar';

const DashboardPage: React.FC = () => {
    const queryClient = useQueryClient();
    const { logs, isLoading: logsLoading } = useDailyLogs();
    const { habits, habitLogs, isLoading: habitsLoading } = useHabitData();
    const { settings, isLoading: settingsLoading } = useUserSettings();
    // Weight is recorded on the Measurements page as well as in the daily log, so
    // the charts read both. Not part of `ready`: the weight line appearing a
    // moment after the rest of the page is better than the page waiting on it.
    const { data: measurements } = useBodyMeasurements();
    // Lifted so the insight cards and the charts always describe the same window.
    const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
    const [refreshingScores, setRefreshingScores] = useState(false);

    const habitStreaks = useMemo(() => {
        if (!habits || !habitLogs) return [];
        const today = new Date();
        const completedByHabit = new Map<string, Set<string>>();
        for (const log of habitLogs) {
            if (!log.completed) continue;
            if (!completedByHabit.has(log.habit_id)) completedByHabit.set(log.habit_id, new Set());
            completedByHabit.get(log.habit_id)!.add(log.log_date);
        }
        return habits.map(habit => {
            const dates = completedByHabit.get(habit.id!) ?? new Set<string>();
            let streak = 0;
            const cursor = new Date(today);
            for (let i = 0; i < 365; i++) {
                const key = cursor.toISOString().slice(0, 10);
                if (dates.has(key)) {
                    streak += 1;
                    cursor.setDate(cursor.getDate() - 1);
                } else break;
            }
            return { id: habit.id!, name: habit.name, streak };
        }).filter(h => h.streak > 0).sort((a, b) => b.streak - a.streak);
    }, [habits, habitLogs]);

    const handleRefreshScores = async () => {
        if (refreshingScores) return;
        setRefreshingScores(true);
        try {
            await recalcAllDailyScores();
            await queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogs });
            await queryClient.invalidateQueries({ queryKey: ['daily-log'] });
        } finally {
            setRefreshingScores(false);
        }
    };

    // The summary is useful before the optional chart bundle and measurement
    // query finish. Waiting for those two unrelated pieces made navigation
    // replace the previous page with a blocking loader, even when the cached
    // daily-log data was already available.
    const ready =
        !logsLoading &&
        !habitsLoading &&
        !settingsLoading;

    // The splash comes down when the critical summary is ready. Secondary data
    // and charts have their own local loading states.
    useBootHold(!ready);

    if (!ready) return <LoadingBar show blocking label="Loading dashboard" />;

    return (
        <>
            <Title title="Dashboard" />
            <div className="page-main-with-secondary dashboard-page-wrapper dashboard-page-enter">
                <div className="dashboard-section">
                    {/* Governs both the analysis cards and every chart. */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                        <div className="metric-range-pills" style={{ marginBottom: 0 }}>
                            {RANGES.map(r => (
                                <button
                                    key={r.label}
                                    type="button"
                                    onClick={() => setRange(r)}
                                    className={'metric-range-pill' + (range.label === r.label ? ' metric-range-pill--active' : '')}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={handleRefreshScores}
                            disabled={refreshingScores}
                            className="metric-range-pill"
                            title="Recalculate every day's score from its own stored goals"
                            aria-label="Refresh all scores"
                            style={{ marginLeft: 'auto' }}
                        >
                            <RefreshCw size={13} style={refreshingScores ? { animation: 'spin 1s linear infinite' } : undefined} />
                        </button>
                    </div>
                    <div className="analysis-grid">
                        <AnalysisCards
                            logs={logs}
                            habits={habits}
                            habitLogs={habitLogs}
                            settings={settings}
                            range={range}
                            measurements={measurements ?? null}
                        />
                        <WeightLossCards range={range} />
                        {/* Lifetime totals moved off the Projects, Books and Abstinence
                            pages. Deliberately outside `ready`: each card fills itself
                            in when its own query lands, so a slow library query cannot
                            hold the dashboard on the splash. */}
                        <DomainStats />
                    </div>
                    <div className="dashboard-charts-enter dashboard-charts-enter--ready">
                        
                        <MetricsCharts
                            logs={logs}
                            habits={habits}
                            habitLogs={habitLogs}
                            settings={settings}
                            range={range}
                            measurements={measurements ?? null}
                        />
                    </div>
                    <StudyChart range={range} />
                    {habitStreaks.length > 0 && (
                        <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
                            <h3 className="card-title" style={{ marginBottom: '0.5rem' }}>Habit streaks</h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {habitStreaks.map(s => (
                                    <span key={s.id} className="metric-range-pill" style={{ opacity: 1 }}>
                                        {s.name}: {s.streak} day{s.streak === 1 ? '' : 's'}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default DashboardPage;