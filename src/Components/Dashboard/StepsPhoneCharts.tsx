import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { DailyLog } from '../../services/dailyLogService';

interface Props {
    logs: DailyLog[];
}

const StepsPhoneCharts: React.FC<Props> = ({ logs }) => {
    const data = (logs ?? [])
        .slice()
        .sort((a, b) => a.log_date.localeCompare(b.log_date))
        .map(l => ({
            date: l.log_date.slice(5),
            steps: l.steps ?? 0,
            phone: l.phone_usage ?? 0,
        }));

    return (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280, height: 260 }}>
                <h4 style={{ margin: '0 0 0.5rem' }}>Steps</h4>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="steps" fill="#17ec65" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, minWidth: 280, height: 260 }}>
                <h4 style={{ margin: '0 0 0.5rem' }}>Phone Usage (min)</h4>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="phone" fill="#ff7ba9" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default StepsPhoneCharts;