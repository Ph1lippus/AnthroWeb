import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { DailyLog } from '../../services/dailyLogService';

const AXIS_TICK = { fill: 'var(--chart-axis)', fontSize: 10, fontFamily: 'var(--font-mono)' };

interface Props {
    logs: DailyLog[];
}

const StepsPhoneCharts: React.FC<Props> = ({ logs }) => {
    const data = (logs ?? [])
        .slice()
        .sort((a, b) => a.log_date.localeCompare(b.log_date))
        .map(l => ({
            label: l.log_date.slice(5),
            steps: l.steps ?? null,
            phone: l.phone_usage ?? null,
        }));

    return (
        <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 280, height: 260 }}>
                    <h3 className="card-title" style={{ marginBottom: '0.5rem' }}>Steps</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'rgba(255, 255, 255, 0.12)' }} minTickGap={36} interval="preserveStartEnd" />
                            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
                            <Tooltip cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }} />
                            <Bar dataKey="steps" name="Steps" fill="var(--chart-primary)" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div style={{ flex: 1, minWidth: 280, height: 260 }}>
                    <h3 className="card-title" style={{ marginBottom: '0.5rem' }}>Phone Usage (min)</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'rgba(255, 255, 255, 0.12)' }} minTickGap={36} interval="preserveStartEnd" />
                            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
                            <Tooltip cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }} />
                            <Bar dataKey="phone" name="Phone Usage" fill="var(--chart-pink)" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default StepsPhoneCharts;