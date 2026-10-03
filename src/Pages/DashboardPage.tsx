import React, { useState, useEffect } from 'react';
import Title from '../Components/Title';
import AnalysisCards from '../Components/Dashboard/AnalysisCards';
import DashboardExtras from '../Components/Dashboard/DashboardExtras';
import { DEFAULT_RANGE, RANGES } from '../Components/Dashboard/dateRange';
import type { DateRange } from '../Components/Dashboard/dateRange';
import { useDailyLogs } from '../hooks/useDailyLogs';
import { useHabitData } from '../hooks/useHabitData';
import { useUserSettings } from '../hooks/useUserSettings';
import { useDashboardExtras } from '../hooks/useDashboardExtras';
import { useBootHold } from '../services/bootScreen';
import type { MetricsChartsProps } from '../Components/Dashboard/MetricsCharts';

/**
 * The charts are code-split because Recharts is the largest dependency in the
 * app, so the request is made at module scope rather than inside an effect: the
 * download is in flight while React is still rendering instead of one commit
 * later. `import()` hands back the same promise for the same chunk every time, so
 * this is fetched once and every later visit resolves from cache.
 */
const chartsChunk = import('../Components/Dashboard/MetricsCharts');

const DashboardPage: React.FC = () => {
    const { logs, isLoading: logsLoading } = useDailyLogs();
    const { habits, habitLogs, isLoading: habitsLoading } = useHabitData();
    const { settings, isLoading: settingsLoading } = useUserSettings();
    const extras = useDashboardExtras();
    // Lifted so the insight cards and the charts always describe the same window.
    const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);

    // The loaded component itself, not a `lazy()` wrapper around a promise.
    //
    // `lazy` cannot be used here even though the chunk is already resolved: it
    // discovers that by attaching `.then` to the promise, which settles on a
    // microtask, so the first render attempt still sees the payload as pending,
    // suspends, and paints its fallback -- which is exactly what it did, one
    // spinner at the bottom of an otherwise finished page. Holding the resolved
    // component in state means the render is synchronous and there is no fallback
    // to paint, because by the time this renders the chunk is already here.
    const [Charts, setCharts] = useState<React.ComponentType<MetricsChartsProps> | null>(null);
    const [chartsSettled, setChartsSettled] = useState(false);
    const [chartsRevealed, setChartsRevealed] = useState(false);

    useEffect(() => {
        let active = true;
        chartsChunk.then(
            module => {
                if (!active) return;
                // Wrapped in a thunk: a bare function here would be read as a state
                // updater and called.
                setCharts(() => module.default);
                setChartsSettled(true);
            },
            // Settled, but with no component. Tracking this separately from `Charts`
            // is what keeps a failed chunk from looking like "still loading": the
            // usual symptom is a cached index.html pointing at chunks a deploy has
            // already deleted, and the page should show its cards rather than sit
            // on a gate that never opens. `Charts` alone cannot express that, since
            // `undefined` and `null` would both read as not-ready above.
            () => { if (active) setChartsSettled(true); },
        );
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!chartsSettled || !Charts) return;
        const reveal = window.setTimeout(() => setChartsRevealed(true), 80);
        return () => window.clearTimeout(reveal);
    }, [chartsSettled, Charts]);

    // Only critical health data gates the first paint. Charts and secondary
    // sections are deliberately allowed to arrive after the useful summary.
    const ready = !logsLoading && !habitsLoading && !settingsLoading;

    // The splash comes down when the critical summary is ready. Secondary data
    // and charts have their own local loading states.
    useBootHold(!ready);

    if (!ready) return null;

    return (
        <>
            <Title title="Dashboard" />
            <div className="page-main-with-secondary dashboard-page-wrapper">
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
                    />
                    <DashboardExtras {...extras} />
                    {!chartsSettled && <div className="dashboard-chart-loading">Loading charts...</div>}
                    {chartsSettled && Charts && (
                        <div className={`dashboard-charts-enter ${chartsRevealed ? 'dashboard-charts-enter--ready' : 'dashboard-charts-enter--pending'}`}>
                            <Charts
                                logs={logs}
                                habits={habits}
                                habitLogs={habitLogs}
                                settings={settings}
                                range={range}
                            />
                        </div>
                    )}
                    {chartsSettled && !Charts && (
                        <div className="dashboard-chart-loading">Charts are temporarily unavailable.</div>
                    )}
                </div>
            </div>
        </>
    );
};

export default DashboardPage;