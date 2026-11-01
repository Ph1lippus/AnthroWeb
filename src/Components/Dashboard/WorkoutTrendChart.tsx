import React, { useMemo } from 'react';
import {
    CartesianGrid,
    ComposedChart,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { useWorkoutsOverview } from '../../hooks/useWorkouts';
import type { DateRange } from './dateRange';

interface WorkoutTrendChartProps {
    range: DateRange;
}

const WorkoutTrendChart: React.FC<WorkoutTrendChartProps> = ({ range }) => {
    const { sessions, isLoading } = useWorkoutsOverview();
    const data = useMemo(() => {
        const cutoff = range.days == null ? null : Date.now() - range.days * 86400000;
        return sessions
            .filter(session => !cutoff || new Date(`${session.workout_date}T00:00:00`).getTime() >= cutoff)
            .flatMap(session => {
                const cardio = session.exercises
                    .filter(row => row.activity_type === 'cardio' && row.hr_max != null && row.hr_2_min != null)
                    .map(row => ({
                        date: session.workout_date,
                        hrr: Math.max(0, row.hr_max! - row.hr_2_min!),
                        bodyWeight: session.body_weight ?? null,
                    }));
                return cardio;
            })
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [range.days, sessions]);

    return (
        <div className="metrics-chart-card" style={{ marginTop: '1rem' }}>
            <div className="metrics-chart-head">
                <div>
                    <h3 className="metrics-chart-title">Cardio HRR Trend</h3>
                    <p className="metrics-chart-subtitle">Heart-rate recovery after two minutes, with workout body weight</p>
                </div>
            </div>
            {isLoading ? (
                <div className="metrics-chart-empty">Loading cardio sessions…</div>
            ) : data.length === 0 ? (
                <div className="metrics-chart-empty">Log HR max and HR +2 min on cardio sessions to see this trend</div>
            ) : (
                <div className="chart-plot">
                    <ResponsiveContainer width="100%" height={260}>
                        <ComposedChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--chart-axis)' }} />
                            <YAxis yAxisId="hrr" tick={{ fontSize: 10, fill: 'var(--chart-axis)' }} />
                            <YAxis yAxisId="weight" orientation="right" tick={{ fontSize: 10, fill: 'var(--chart-axis)' }} />
                            <Tooltip />
                            <Line yAxisId="hrr" type="monotone" dataKey="hrr" name="HRR (bpm)" stroke="var(--chart-primary)" dot={{ r: 3 }} connectNulls />
                            <Line yAxisId="weight" type="monotone" dataKey="bodyWeight" name="Body weight (kg)" stroke="var(--chart-green)" dot={{ r: 3 }} connectNulls />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};

export default WorkoutTrendChart;
