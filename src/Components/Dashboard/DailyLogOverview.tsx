import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DailyLog } from '../../services/dailyLogService';
import { getScoreColor } from '../../utils/dailyScoring';

const toDateString = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const addDays = (dateStr: string, delta: number): string => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    return toDateString(d);
};

interface DailyLogOverviewProps {
    logs: DailyLog[] | null;
}

const DailyLogOverview: React.FC<DailyLogOverviewProps> = ({ logs }) => {
    const navigate = useNavigate();

    const stats = useMemo(() => {
        const list = logs ?? [];
        const scored = list.filter(l => l.daily_score != null);
        const today = toDateString(new Date());

        const todayLog = list.find(l => l.log_date === today);
        const todayScore = todayLog?.daily_score ?? null;

        const dateSet = new Set(list.map(l => l.log_date));
        let streak = 0;
        let cursor = dateSet.has(today) ? today : addDays(today, -1);
        while (dateSet.has(cursor)) {
            streak++;
            cursor = addDays(cursor, -1);
        }

        const avgScore = scored.length > 0
            ? Math.round(scored.reduce((a, l) => a + (l.daily_score as number), 0) / scored.length)
            : 0;

        return { todayScore, streak, avgScore, loggedCount: list.length };
    }, [logs]);

    if (logs === null) {
        return (
            <div className="dashboard-daily-card">
                <div className="profile-loading">
                    <div className="profile-loading-spinner"></div>
                    <p>Loading daily log...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-daily-card">
            <div className="dashboard-daily-topbar">
                <div className="dashboard-daily-heading">
                    <h3>Daily Log</h3>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={() => navigate('/Daily-Log')} className="btn-action">Open Daily Log</button>
                    <button onClick={() => navigate('/Daily-Log/History')} className="btn-action">View History</button>
                </div>
            </div>

            <div className="dashboard-overview">
                <div className="stat-card">
                    <div className="stat-content">
                        <div className="stat-label">Today's Score</div>
                        <div className="stat-value" style={{ color: stats.todayScore != null ? getScoreColor(stats.todayScore) : 'rgba(255,255,255,0.5)' }}>
                            {stats.todayScore != null ? `${stats.todayScore}/100` : '—'}
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-content">
                        <div className="stat-label">Current Streak</div>
                        <div className="stat-value">{stats.streak} {stats.streak === 1 ? 'day' : 'days'}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-content">
                        <div className="stat-label">Average Score</div>
                        <div className="stat-value">{stats.loggedCount > 0 ? stats.avgScore : '—'}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-content">
                        <div className="stat-label">Days Logged</div>
                        <div className="stat-value">{stats.loggedCount}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DailyLogOverview;