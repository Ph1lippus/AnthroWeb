import React, { useState, lazy, Suspense } from 'react';
import Title from '../Components/Title';
import AnalysisCards from '../Components/Dashboard/AnalysisCards';
import { DEFAULT_RANGE, RANGES } from '../Components/Dashboard/dateRange';
import type { DateRange } from '../Components/Dashboard/dateRange';
import { useDailyLogs } from '../hooks/useDailyLogs';
import { useHabitData } from '../hooks/useHabitData';
import { useUserSettings } from '../hooks/useUserSettings';

const MetricsCharts = lazy(() => import('../Components/Dashboard/MetricsCharts'));

// Mirrors the real layout so nothing reflows when the data lands.
const DashboardSkeleton: React.FC = () => (
    <div className="dashboard-skeleton" aria-hidden="true">
        <div className="metric-range-pills">
            {RANGES.map(r => (
                <div key={r.label} className="skeleton-pill" />
            ))}
        </div>
        <div className="analysis-grid">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="analysis-card skeleton-block" style={{ height: 92 }} />
            ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-block" style={{ height: 176 }} />
        ))}
    </div>
);

const DashboardPage: React.FC = () => {
    const { logs, isLoading: logsLoading } = useDailyLogs();
    const { habits, habitLogs, isLoading: habitsLoading } = useHabitData();
    const { settings, isLoading: settingsLoading } = useUserSettings();
    // Lifted so the insight cards and the charts always describe the same window.
    const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);

    const loading = logsLoading || habitsLoading || settingsLoading;

    return (
        <>
            <Title title="Dashboard" />
            <div className="page-main-with-secondary dashboard-page-wrapper">
                <div className="dashboard-section">
                    {loading ? (
                        <DashboardSkeleton />
                    ) : (
                        <>
                            {/* Governs both the analysis cards and every chart. */}
                            <div className="metric-range-pills">
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
                            <AnalysisCards
                                logs={logs}
                                habits={habits}
                                habitLogs={habitLogs}
                                settings={settings}
                                range={range}
                            />
                            <Suspense
                                fallback={
                                    <div className="dashboard-daily-card">
                                        <div className="profile-loading">
                                            <div className="profile-loading-spinner"></div>
                                            <p>Loading charts...</p>
                                        </div>
                                    </div>
                                }
                            >
                                <MetricsCharts
                                    logs={logs}
                                    habits={habits}
                                    habitLogs={habitLogs}
                                    settings={settings}
                                    range={range}
                                />
                            </Suspense>
                        </>
                    )}
                </div>
            </div>
        </>
    );
};

export default DashboardPage;
