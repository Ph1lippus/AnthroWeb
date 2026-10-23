import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { Copy, Download } from 'lucide-react';
import { copyCsvToClipboard, downloadCsv } from '../../utils/exportFiles';
import { useNotice } from '../../Components/Feedback/useNotice';
import { useStudySessions, useStudyGoal } from '../../hooks/useAcademic';
import type { DateRange } from './dateRange';
import { todayString, addDays } from '../../utils/dates';

interface StudyChartProps {
    range: DateRange;
}

const StudyChart: React.FC<StudyChartProps> = ({ range }) => {
    const { notify } = useNotice();
    const { data: sessions, isLoading } = useStudySessions();
    const { data: goal } = useStudyGoal();

    const dailyGoal = goal?.daily_goal_minutes ?? 60;

    const chartData = useMemo(() => {
        const studyMinutesByDate = new Map<string, number>();
        for (const session of sessions ?? []) {
            if (session.session_type === 'break') continue;
            // Only interval runs (and manually logged sessions) count.
            if (session.mode && session.mode !== 'interval') continue;
            studyMinutesByDate.set(
                session.session_date,
                (studyMinutesByDate.get(session.session_date) ?? 0) + session.duration_minutes,
            );
        }

        if (range.days === null) {
            return Array.from(studyMinutesByDate.keys())
                .sort()
                .map(date => ({
                    date: date.slice(5),
                    fullDate: date,
                    minutes: studyMinutesByDate.get(date) ?? 0,
                }));
        }

        const today = todayString();
        const data = [];
        for (let i = range.days - 1; i >= 0; i--) {
            const date = addDays(today, -i);
            data.push({
                date: date.slice(5),
                fullDate: date,
                minutes: studyMinutesByDate.get(date) ?? 0,
            });
        }
        return data;
    }, [sessions, range.days]);

    const hasData = chartData.some(point => point.minutes > 0);

    return (
        <div className="metrics-chart-card" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <div className="metrics-chart-head">
                <h3>Study time</h3>
                {hasData && (
                    <>
                        <button
                            type="button"
                            className="metrics-chart-expand"
                            aria-label="Copy Study time chart data"
                            data-tip="Copy chart data"
                            onClick={() => {
                                void copyCsvToClipboard(chartData.map(d => ({ date: (d as { fullDate?: string }).fullDate ?? d.date, minutes: d.minutes }))).then(ok => {
                                    if (ok) notify('success', 'Study time copied to clipboard');
                                    else notify('error', 'Could not copy to clipboard');
                                });
                            }}
                        >
                            <Copy size={14} />
                        </button>
                        <button
                            type="button"
                            className="metrics-chart-expand"
                            aria-label="Export Study time chart data"
                            data-tip="Export chart data"
                            onClick={() => downloadCsv(`anthroweb-study-time-${range.label}.csv`, chartData.map(d => ({ date: (d as { fullDate?: string }).fullDate ?? d.date, minutes: d.minutes })))}
                        >
                            <Download size={14} />
                        </button>
                    </>
                )}
            </div>
            {isLoading ? (
                <div className="metrics-chart-empty">Loading study sessions…</div>
            ) : !hasData ? (
                <div className="metrics-chart-empty">No study sessions in this range</div>
            ) : (
                <div className="chart-plot">
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--chart-axis)' }} />
                            <YAxis tick={{ fontSize: 10, fill: 'var(--chart-axis)' }} />
                            <Tooltip />
                            <ReferenceLine y={dailyGoal} stroke="var(--chart-primary, #3b82f6)" strokeDasharray="4 4" strokeOpacity={0.5} />
                            <Bar dataKey="minutes" name="Minutes" fill="var(--chart-primary, #3b82f6)" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};

export default StudyChart;