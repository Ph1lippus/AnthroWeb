import React, { lazy, Suspense } from 'react';
import Title from '../Components/Title';
import DailyLogOverview from '../Components/Dashboard/DailyLogOverview';
import TodayScoreCard from '../Components/Dashboard/TodayScoreCard';
import { useDailyLogs } from '../hooks/useDailyLogs';
import { useHabitData } from '../hooks/useHabitData';
import { useUserSettings } from '../hooks/useUserSettings';

const MetricsCharts = lazy(() => import('../Components/Dashboard/MetricsCharts'));

const DashboardPage: React.FC = () => {
    const { logs } = useDailyLogs();
    const { habits, habitLogs } = useHabitData();
    const { settings } = useUserSettings();

    return (
        <>
            <Title title="Dashboard" />
            <div className="page-main-with-secondary dashboard-page-wrapper">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Dashboard</h2>
                    </div>
                    <DailyLogOverview logs={logs} />
                    <TodayScoreCard logs={logs} habits={habits} settings={settings} />
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
                        <MetricsCharts logs={logs} habits={habits} habitLogs={habitLogs} settings={settings} />
                    </Suspense>
                </div>
            </div>
        </>
    );
};

export default DashboardPage;