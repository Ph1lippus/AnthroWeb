import React, { useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, Legend } from 'recharts';
import type { DailyLog } from '../../services/dailyLogService';
import { moodFor } from '../../utils/moodSeries';
import { rangeStart } from './range';
import type { DateRange } from '../Dashboard/dateRange';

const C = {
    blue: 'var(--chart-blue)',
    pink: 'var(--chart-pink)',
    grid: 'var(--chart-grid)',
    axis: 'var(--chart-axis)',
};

const fmtDate = (d: string): string =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const fmtFullDate = (d: string): string =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

interface ChartRow {
    date: string;
    morningMood: number | null;
    eveningMood: number | null;
}

/**
 * The two ratings across the chosen range.
 *
 * Drawn as one band between the two lines rather than as two independent traces.
 * The band is the finding: it is wide on a day that started well and ended badly,
 * and it is the same colour on both lines because it is one measurement of how
 * much a day moved, not two separate measurements of how good it was.
 *
 * A translucent area rather than a solid one so the two lines stay readable
 * through it -- a filled band between them would hide the very values it is
 * describing.
 *
 * `connectNulls` on both lines, so a day rated only in the evening still traces a
 * morning line across it rather than breaking the series into fragments.
 */
const MoodBandChart: React.FC<{ logs: DailyLog[]; range: DateRange; height?: number }> = ({
    logs, range, height = 300,
}) => {
    const start = rangeStart(range.days);

    const data: ChartRow[] = useMemo(() => {
        return [...logs]
            .filter(l => start === null || l.log_date >= start)
            .sort((a, b) => (a.log_date < b.log_date ? -1 : 1))
            .map(l => ({
                date: l.log_date,
                morningMood: moodFor(l, 'morning'),
                eveningMood: moodFor(l, 'evening'),
            }));
    }, [logs, start]);

    if (data.length === 0) {
        return <div className="metrics-chart-empty">No entries in this range</div>;
    }

    // The band needs a low/high pair per day, and only where both halves exist:
    // on a day with one rating there is no gap to shade, and interpolating a
    // missing half into the band would invent a difference that was never rated.
    const bandData = data.map(row => ({
        ...row,
        bandLow: row.morningMood !== null && row.eveningMood !== null
            ? Math.min(row.morningMood, row.eveningMood)
            : null,
        bandHigh: row.morningMood !== null && row.eveningMood !== null
            ? Math.max(row.morningMood, row.eveningMood)
            : null,
    }));

    return (
        <div className="chart-plot">
            <ResponsiveContainer width="100%" height={height}>
                <ComposedChart data={bandData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <defs>
                        <linearGradient id="mood-band" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--chart-amber)" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="var(--chart-blue)" stopOpacity={0.12} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: C.axis }}
                        tickLine={false}
                        axisLine={{ stroke: 'rgba(255, 255, 255, 0.12)' }}
                        tickFormatter={fmtDate}
                        minTickGap={28}
                    />
                    <YAxis
                        domain={[0, 10]}
                        ticks={[0, 2, 4, 6, 8, 10]}
                        tick={{ fontSize: 10, fill: C.axis }}
                        tickLine={false}
                        axisLine={false}
                        width={28}
                    />
                    <Tooltip
                        labelFormatter={(l) => fmtFullDate(String(l))}
                        formatter={(value, name) => [
                            value == null ? 'not rated' : `${value}/10`,
                            name === 'morningMood' ? 'Morning' : 'Evening',
                        ]}
                        cursor={{ stroke: 'rgba(255,255,255,0.15)' }}
                        contentStyle={{
                            background: 'var(--chart-tooltip-bg)',
                            border: '1px solid var(--chart-tooltip-border)',
                            borderRadius: 12,
                            fontSize: 12,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-light)',
                        }}
                        itemStyle={{ color: 'var(--color-light)' }}
                    />
                    <Legend
                        iconType="plainline"
                        iconSize={14}
                        wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)', paddingBottom: 4 }}
                    />
                    {/* The goal line, at 8. The scale's caption calls 8 the goal and
                        a chart with no line at it leaves that claim unshown. */}
                    <ReferenceArea y1={8} y2={10} fill="var(--color-primary)" fillOpacity={0.05} />
                    {/* Band from the low series up to the high one, so the shaded
                        span between them is the day's swing. */}
                    <Area
                        dataKey="bandHigh"
                        stroke="none"
                        fill="url(#mood-band)"
                        connectNulls={false}
                        isAnimationActive={false}
                        legendType="none"
                        activeDot={false}
                    />
                    <Area
                        dataKey="bandLow"
                        stroke="none"
                        fill="var(--chart-tooltip-bg)"
                        fillOpacity={1}
                        connectNulls={false}
                        isAnimationActive={false}
                        legendType="none"
                        activeDot={false}
                    />
                    <Line
                        type="monotone" dataKey="morningMood" name="Morning"
                        stroke={C.blue} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }}
                        connectNulls isAnimationActive={false}
                    />
                    <Line
                        type="monotone" dataKey="eveningMood" name="Evening"
                        stroke={C.pink} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }}
                        connectNulls isAnimationActive={false}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

export default MoodBandChart;