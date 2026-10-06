import React, { useState } from 'react';
import Title from '../Components/Title';
import AnalysisCards from '../Components/Dashboard/AnalysisCards';
import { DEFAULT_RANGE, RANGES } from '../Components/Dashboard/dateRange';
import type { DateRange } from '../Components/Dashboard/dateRange';
import { useDailyLogs } from '../hooks/useDailyLogs';
import { useHabitData } from '../hooks/useHabitData';
import { useUserSettings } from '../hooks/useUserSettings';
import { useBodyMeasurements } from '../hooks/useMeasurements';
import { useBootHold } from '../services/bootScreen';
import MetricsCharts from '../Components/Dashboard/MetricsCharts';
import LoadingBar from '../Components/LoadingBar';

const DashboardPage: React.FC = () => {
    const { logs, isLoading: logsLoading } = useDailyLogs();
    const { habits, habitLogs, isLoading: habitsLoading } = useHabitData();
    const { settings, isLoading: settingsLoading } = useUserSettings();
    // Weight is recorded on the Measurements page as well as in the daily log, so
    // the charts read both. Not part of `ready`: the weight line appearing a
    // moment after the rest of the page is better than the page waiting on it.
    const { data: measurements } = useBodyMeasurements();
    // Lifted so the insight cards and the charts always describe the same window.
    const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);

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
                        measurements={measurements ?? null}
                    />
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
                </div>
            </div>
        </>
    );
};

export default DashboardPage;