import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ResponsiveContainer,
    ComposedChart,
    AreaChart,
    LineChart,
    BarChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    Legend,
    Area,
    Line,
    Bar,
} from 'recharts';
import { Maximize2, X } from 'lucide-react';
import type { DailyLog } from '../../services/dailyLogService';
import type { Habit, DailyHabitLog } from '../../services/habitService';
import type { UserSettings } from '../../services/profileService';
import type { ActiveGoals } from '../../utils/dailyScoring';

const C = {
    primary: '#00ffa6',
    greenDark: '#43b67d',
    blue: '#4da6ff',
    pink: '#ff7ba9',
    amber: '#ffb84d',
    purple: '#b48dff',
    cyan: '#4dd8e0',
    red: '#ff5a60',
};

const RANGES: { label: string; days: number | null }[] = [
    { label: '14 Days', days: 14 },
    { label: '30 Days', days: 30 },
    { label: '90 Days', days: 90 },
    { label: 'All Time', days: null },
];

const fmtDate = (d: string): string =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const inRange = (date: string, days: number | null): boolean => {
    if (days === null) return true;
    const diff = Math.floor((Date.now() - new Date(date + 'T00:00:00').getTime()) / 86400000);
    return diff >= 0 && diff < days;
};

interface ChartPoint {
    date: string;
    label: string;
    score: number | null;
    sleepDuration: number | null;
    sleepQuality: number | null;
    weight: number | null;
    bodyFat: number | null;
    mood: number | null;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    water: number | null;
    morningSystolic: number | null;
    morningDiastolic: number | null;
    morningBpm: number | null;
    eveningSystolic: number | null;
    eveningDiastolic: number | null;
    eveningBpm: number | null;
    bodyTemperature: number | null;
    habitPct: number | null;
}

interface TooltipEntry {
    dataKey?: string | number;
    value?: number | string | null;
    name?: string;
    stroke?: string;
    fill?: string;
    color?: string;
}

interface ChartTooltipProps {
    active?: boolean;
    label?: string | number;
    payload?: TooltipEntry[];
}

const ChartTooltip: React.FC<ChartTooltipProps> = ({ active, label, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const rows = payload.filter((p): p is TooltipEntry & { value: number | string } =>
        p.value !== undefined && p.value !== null);
    if (rows.length === 0) return null;
    return (
        <div className="chart-tooltip">
            <span className="chart-tooltip-date">{String(label)}</span>
            {rows.map((p, i) => (
                <div key={i} className="chart-tooltip-row">
                    <span className="chart-tooltip-dot" style={{ background: p.stroke || p.fill || p.color || C.primary }} />
                    <span>{p.name}</span>
                    <span className="chart-tooltip-value">{p.value}</span>
                </div>
            ))}
        </div>
    );
};

const AXIS_TICK = {
    fill: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
};

const ChartGrid: React.FC = () => <CartesianGrid stroke="rgba(255, 255, 255, 0.06)" vertical={false} />;

const ChartX: React.FC = () => (
    <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'rgba(255, 255, 255, 0.12)' }} minTickGap={36} interval="preserveStartEnd" />
);

const ChartY: React.FC<{ domain?: [number, number]; tickCount?: number }> = ({ domain, tickCount }) => (
    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} domain={domain} tickCount={tickCount ?? 5} width={38} allowDecimals={false} />
);

const ChartTip: React.FC = () => (
    <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255, 255, 255, 0.15)' }} />
);

const AVG_STROKE = 'rgba(255, 255, 255, 0.55)';

const AvgLine: React.FC<{ y: number | null; stroke?: string }> = ({ y, stroke }) => {
    if (y == null) return null;
    return (
        <ReferenceLine
            y={y}
            stroke={stroke ?? AVG_STROKE}
            strokeDasharray="6 4"
            strokeOpacity={0.85}
            label={{
                value: 'Avg',
                position: 'insideBottomRight',
                fill: stroke ?? AVG_STROKE,
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
            }}
        />
    );
};

interface ExpandedChart {
    title: string;
    chart: React.ReactNode;
    height: number;
}

interface ChartCardProps {
    title: string;
    chart?: React.ReactNode;
    height?: number;
    expandHeight?: number;
    onExpand?: (expanded: ExpandedChart) => void;
    empty?: boolean;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, chart, height = 150, expandHeight, onExpand, empty }) => (
    <div className="metrics-chart-card">
        <div className="metrics-chart-head">
            <h3>{title}</h3>
            {!empty && onExpand && chart && (
                <button
                    type="button"
                    className="metrics-chart-expand"
                    aria-label={`Enlarge ${title} chart`}
                    title="Enlarge chart"
                    onClick={() => onExpand({ title, chart, height: expandHeight ?? 560 })}
                >
                    <Maximize2 size={14} />
                </button>
            )}
        </div>
        {empty ? (
            <ChartEmpty />
        ) : (
            <ResponsiveContainer width="100%" height={height}>{chart}</ResponsiveContainer>
        )}
    </div>
);

const ChartEmpty: React.FC = () => (
    <div className="metrics-chart-empty">No data in this range</div>
);

const ChartModal: React.FC<{ expanded: ExpandedChart | null; onClose: () => void }> = ({ expanded, onClose }) => {
    useEffect(() => {
        if (!expanded) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [expanded, onClose]);

    if (!expanded) return null;

    return (
        <div className="chart-modal-overlay" onClick={onClose}>
            <div
                className="chart-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`${expanded.title} chart`}
                onClick={e => e.stopPropagation()}
            >
                <div className="chart-modal-head">
                    <h3>{expanded.title}</h3>
                    <button type="button" className="chart-modal-close" aria-label="Close chart" title="Close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                <div className="chart-modal-body">
                    <ResponsiveContainer width="100%" height={expanded.height}>
                        {expanded.chart}
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

interface MetricsChartsProps {
    logs: DailyLog[] | null;
    habits: Habit[] | null;
    habitLogs: DailyHabitLog[] | null;
    settings: UserSettings | null;
}

const MetricsCharts: React.FC<MetricsChartsProps> = ({ logs, habits, habitLogs, settings }) => {
    const [range, setRange] = useState<{ label: string; days: number | null }>(RANGES[0]);
    const [expanded, setExpanded] = useState<ExpandedChart | null>(null);

    const openChart = useCallback((e: ExpandedChart) => setExpanded(e), []);

    const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;
    const caloriesGoal = activeGoals?.nutrition?.calories ?? null;
    const waterGoal = activeGoals?.nutrition?.water ?? null;
    const proteinGoal = activeGoals?.nutrition?.protein ?? null;
    const carbsGoal = activeGoals?.nutrition?.carbs ?? null;
    const fatGoal = activeGoals?.nutrition?.fat ?? null;
    const targetWeight = settings?.target_weight ?? null;
    const targetBodyFat = settings?.target_bodyfat ?? null;

    const completedByDate = useMemo(() => {
        const map = new Map<string, number>();
        if (!habitLogs) return map;
        for (const l of habitLogs) {
            if (!l.completed) continue;
            map.set(l.log_date, (map.get(l.log_date) ?? 0) + 1);
        }
        return map;
    }, [habitLogs]);

    const chartData = useMemo<ChartPoint[]>(() => {
        if (!logs) return [];
        return logs
            .filter(l => inRange(l.log_date, range.days))
            .slice()
            .sort((a, b) => a.log_date.localeCompare(b.log_date))
            .map(l => {
                const builtinDone =
                    [l.morning_routine, l.evening_routine, l.fruit_serving, l.studied, l.journal, l.stretching, l.reading, l.project_work_done]
                        .filter(Boolean).length;
                const customTotal = habits?.length || 0;
                const customDone = completedByDate.get(l.log_date) ?? 0;
                const habitTotal = 8 + customTotal;
                return {
                    date: l.log_date,
                    label: fmtDate(l.log_date),
                    score: l.daily_score ?? null,
                    sleepDuration: l.sleep_duration ?? null,
                    sleepQuality: l.sleep_quality ?? null,
                    weight: l.weight ?? null,
                    bodyFat: l.body_fat ?? null,
                    mood: l.mood ?? null,
                    calories: l.calories ?? null,
                    protein: l.protein ?? null,
                    carbs: l.carbs ?? null,
                    fat: l.fat ?? null,
                    water: l.water ?? null,
                    morningSystolic: l.morning_systolic ?? null,
                    morningDiastolic: l.morning_diastolic ?? null,
                    morningBpm: l.morning_bpm ?? null,
                    eveningSystolic: l.evening_systolic ?? null,
                    eveningDiastolic: l.evening_diastolic ?? null,
                    eveningBpm: l.evening_bpm ?? null,
                    bodyTemperature: l.body_temperature ?? null,
                    habitPct: habitTotal > 0 ? Math.round(((builtinDone + customDone) / habitTotal) * 100) : null,
                };
            });
    }, [logs, range.days, habits, completedByDate]);

    const completedByHabit = useMemo(() => {
        const map = new Map<string, number>();
        if (!habitLogs) return map;
        const inRangeDates = new Set(chartData.map(d => d.date));
        for (const l of habitLogs) {
            if (!l.completed || !inRangeDates.has(l.log_date)) continue;
            map.set(l.habit_id, (map.get(l.habit_id) ?? 0) + 1);
        }
        return map;
    }, [habitLogs, chartData]);

    const customHabitData = useMemo(() => {
        if (!habits || habits.length === 0) return [];
        const logDates = new Set(chartData.map(d => d.date));
        return habits
            .map(h => ({
                name: h.name,
                pct: logDates.size > 0 ? Math.round(((completedByHabit.get(h.id ?? '') ?? 0) / logDates.size) * 100) : 0,
            }))
            .sort((a, b) => b.pct - a.pct);
    }, [habits, completedByHabit, chartData]);

    const hasAny = (...keys: (keyof ChartPoint)[]): boolean => chartData.some(p => keys.some(k => p[k] != null));

    const averages = useMemo(() => {
        const avg = (key: keyof ChartPoint): number | null => {
            let sum = 0;
            let n = 0;
            for (const p of chartData) {
                const v = p[key];
                if (typeof v === 'number') {
                    sum += v;
                    n++;
                }
            }
            return n > 0 ? Math.round((sum / n) * 10) / 10 : null;
        };
        return {
            score: avg('score'),
            sleepDuration: avg('sleepDuration'),
            sleepQuality: avg('sleepQuality'),
            morningSystolic: avg('morningSystolic'),
            eveningSystolic: avg('eveningSystolic'),
            morningDiastolic: avg('morningDiastolic'),
            eveningDiastolic: avg('eveningDiastolic'),
            morningBpm: avg('morningBpm'),
            eveningBpm: avg('eveningBpm'),
            bodyTemperature: avg('bodyTemperature'),
            calories: avg('calories'),
            protein: avg('protein'),
            carbs: avg('carbs'),
            fat: avg('fat'),
            water: avg('water'),
            weight: avg('weight'),
            bodyFat: avg('bodyFat'),
            mood: avg('mood'),
            habitPct: avg('habitPct'),
        };
    }, [chartData]);

    const customHabitAvg = customHabitData.length > 0
        ? Math.round(customHabitData.reduce((sum, h) => sum + h.pct, 0) / customHabitData.length)
        : null;

    const habitChartHeight = Math.max(160, customHabitData.length * 28);
    const habitExpandHeight = Math.max(320, customHabitData.length * 34);

    return (
        <div className="dashboard-metrics">
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

            {logs === null ? (
                <div className="dashboard-daily-card">
                    <div className="profile-loading">
                        <div className="profile-loading-spinner"></div>
                        <p>Loading charts...</p>
                    </div>
                </div>
            ) : chartData.length === 0 ? (
                <div className="metrics-chart-card">
                    <div className="metrics-chart-head"><h3>Metrics</h3></div>
                    <div className="metrics-chart-empty">No daily log data in this range.</div>
                </div>
            ) : (
                <div className="metrics-track">
                    {/* Score */}
                    <ChartCard
                        title="Score"
                        height={180}
                        onExpand={openChart}
                        chart={
                            <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={C.primary} stopOpacity={0.3} />
                                        <stop offset="100%" stopColor={C.primary} stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <ChartGrid />
                                <ChartX />
                                <ChartY domain={[0, 100]} />
                                <ChartTip />
                                <ReferenceLine y={80} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} label="Goal" />
                                <AvgLine y={averages.score} />
                                <Area type="monotone" dataKey="score" name="Score" stroke={C.primary} strokeWidth={2} fill="url(#scoreFill)" dot={false} connectNulls />
                            </ComposedChart>
                        }
                    />

                    {/* Sleep */}
                    <div className="metrics-columns">
                        <ChartCard
                            title="Sleep Duration"
                            empty={!hasAny('sleepDuration')}
                            onExpand={openChart}
                            chart={
                                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                    <ChartGrid />
                                    <ChartX />
                                    <ChartY domain={[0, 12]} />
                                    <ChartTip />
                                    <AvgLine y={averages.sleepDuration} />
                                    <Area type="monotone" dataKey="sleepDuration" name="Hours" stroke={C.primary} strokeWidth={2} fill="rgba(0, 255, 166, 0.15)" dot={false} connectNulls />
                                </AreaChart>
                            }
                        />
                        <ChartCard
                            title="Sleep Quality"
                            empty={!hasAny('sleepQuality')}
                            onExpand={openChart}
                            chart={
                                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                    <ChartGrid />
                                    <ChartX />
                                    <ChartY domain={[0, 10]} />
                                    <ChartTip />
                                    <AvgLine y={averages.sleepQuality} stroke={C.blue} />
                                    <Line type="monotone" dataKey="sleepQuality" name="Quality" stroke={C.blue} strokeWidth={2} dot={false} connectNulls />
                                </LineChart>
                            }
                        />
                    </div>

                    {/* Vitals & BP */}
                    <div className="metrics-columns">
                        <ChartCard
                            title="Systolic"
                            empty={!hasAny('morningSystolic', 'eveningSystolic')}
                            onExpand={openChart}
                            chart={
                                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                    <ChartGrid />
                                    <ChartX />
                                    <ChartY />
                                    <ChartTip />
                                    <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)', paddingBottom: 4 }} />
                                    <ReferenceLine y={120} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} />
                                    <AvgLine y={averages.morningSystolic} stroke={C.blue} />
                                    <AvgLine y={averages.eveningSystolic} stroke={C.pink} />
                                    <Line type="monotone" dataKey="morningSystolic" name="AM Systolic" stroke={C.blue} strokeWidth={2} dot={false} connectNulls />
                                    <Line type="monotone" dataKey="eveningSystolic" name="PM Systolic" stroke={C.pink} strokeWidth={2} dot={false} connectNulls />
                                </LineChart>
                            }
                        />
                        <ChartCard
                            title="Diastolic"
                            empty={!hasAny('morningDiastolic', 'eveningDiastolic')}
                            onExpand={openChart}
                            chart={
                                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                    <ChartGrid />
                                    <ChartX />
                                    <ChartY />
                                    <ChartTip />
                                    <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)', paddingBottom: 4 }} />
                                    <ReferenceLine y={80} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} />
                                    <AvgLine y={averages.morningDiastolic} stroke={C.blue} />
                                    <AvgLine y={averages.eveningDiastolic} stroke={C.pink} />
                                    <Line type="monotone" dataKey="morningDiastolic" name="AM Diastolic" stroke={C.blue} strokeWidth={2} dot={false} connectNulls />
                                    <Line type="monotone" dataKey="eveningDiastolic" name="PM Diastolic" stroke={C.pink} strokeWidth={2} dot={false} connectNulls />
                                </LineChart>
                            }
                        />
                        <ChartCard
                            title="Heart Rate"
                            empty={!hasAny('morningBpm', 'eveningBpm')}
                            onExpand={openChart}
                            chart={
                                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                    <ChartGrid />
                                    <ChartX />
                                    <ChartY />
                                    <ChartTip />
                                    <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)', paddingBottom: 4 }} />
                                    <AvgLine y={averages.morningBpm} stroke={C.blue} />
                                    <AvgLine y={averages.eveningBpm} stroke={C.pink} />
                                    <Line type="monotone" dataKey="morningBpm" name="AM BPM" stroke={C.blue} strokeWidth={2} dot={false} connectNulls />
                                    <Line type="monotone" dataKey="eveningBpm" name="PM BPM" stroke={C.pink} strokeWidth={2} dot={false} connectNulls />
                                </LineChart>
                            }
                        />
                        <ChartCard
                            title="Body Temperature"
                            empty={!hasAny('bodyTemperature')}
                            onExpand={openChart}
                            chart={
                                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                    <ChartGrid />
                                    <ChartX />
                                    <ChartY />
                                    <ChartTip />
                                    <ReferenceLine y={37} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} />
                                    <AvgLine y={averages.bodyTemperature} stroke={C.amber} />
                                    <Line type="monotone" dataKey="bodyTemperature" name="°C" stroke={C.amber} strokeWidth={2} dot={false} connectNulls />
                                </LineChart>
                            }
                        />
                    </div>

                    {/* Nutrition */}
                    <div className="metrics-columns">
                        <ChartCard
                            title="Calories"
                            empty={!hasAny('calories')}
                            onExpand={openChart}
                            chart={
                                <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                    <ChartGrid />
                                    <ChartX />
                                    <ChartY />
                                    <ChartTip />
                                    {caloriesGoal != null && <ReferenceLine y={caloriesGoal} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} label="Goal" />}
                                    <AvgLine y={averages.calories} />
                                    <Bar dataKey="calories" name="Calories" fill={C.primary} radius={[3, 3, 0, 0]} maxBarSize={18} />
                                </ComposedChart>
                            }
                        />
                        <ChartCard
                            title="Macros"
                            empty={!hasAny('protein', 'carbs', 'fat')}
                            onExpand={openChart}
                            chart={
                                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                    <ChartGrid />
                                    <ChartX />
                                    <ChartY />
                                    <ChartTip />
                                    <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)', paddingBottom: 4 }} />
{proteinGoal != null && <ReferenceLine y={proteinGoal} stroke={C.blue} strokeDasharray="4 4" strokeOpacity={0.4} />}
                                        {carbsGoal != null && <ReferenceLine y={carbsGoal} stroke={C.purple} strokeDasharray="4 4" strokeOpacity={0.4} />}
                                        {fatGoal != null && <ReferenceLine y={fatGoal} stroke={C.amber} strokeDasharray="4 4" strokeOpacity={0.4} />}
                                        <AvgLine y={averages.protein} stroke={C.blue} />
                                        <AvgLine y={averages.carbs} stroke={C.purple} />
                                        <AvgLine y={averages.fat} stroke={C.amber} />
                                        <Line type="monotone" dataKey="protein" name="Protein" stroke={C.blue} strokeWidth={2} dot={false} connectNulls />
                                    <Line type="monotone" dataKey="carbs" name="Carbs" stroke={C.purple} strokeWidth={2} dot={false} connectNulls />
                                    <Line type="monotone" dataKey="fat" name="Fat" stroke={C.amber} strokeWidth={2} dot={false} connectNulls />
                                </LineChart>
                            }
                        />
                        <ChartCard
                            title="Water"
                            empty={!hasAny('water')}
                            onExpand={openChart}
                            chart={
                                <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                    <ChartGrid />
                                    <ChartX />
                                    <ChartY />
                                    <ChartTip />
                                    {waterGoal != null && <ReferenceLine y={waterGoal} stroke={C.cyan} strokeDasharray="4 4" strokeOpacity={0.5} />}
                                    <AvgLine y={averages.water} stroke={C.cyan} />
                                    <Bar dataKey="water" name="ml" fill={C.cyan} radius={[3, 3, 0, 0]} maxBarSize={18} />
                                </ComposedChart>
                            }
                        />
                    </div>

                    {/* Body & Mood */}
                    <div className="metrics-columns">
                        <ChartCard
                            title="Weight"
                            empty={!hasAny('weight')}
                            onExpand={openChart}
                            chart={
                                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                    <ChartGrid />
                                    <ChartX />
                                    <ChartY />
                                    <ChartTip />
                                    {targetWeight != null && <ReferenceLine y={targetWeight} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} label="Target" />}
                                    <AvgLine y={averages.weight} />
                                    <Line type="monotone" dataKey="weight" name="kg" stroke={C.primary} strokeWidth={2} dot={false} connectNulls />
                                </LineChart>
                            }
                        />
                        <ChartCard
                            title="Body Fat"
                            empty={!hasAny('bodyFat')}
                            onExpand={openChart}
                            chart={
                                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                    <ChartGrid />
                                    <ChartX />
                                    <ChartY />
                                    <ChartTip />
                                    {targetBodyFat != null && <ReferenceLine y={targetBodyFat} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} label="Target" />}
                                    <AvgLine y={averages.bodyFat} stroke={C.pink} />
                                    <Line type="monotone" dataKey="bodyFat" name="%" stroke={C.pink} strokeWidth={2} dot={false} connectNulls />
                                </LineChart>
                            }
                        />
                        <ChartCard
                            title="Mood"
                            empty={!hasAny('mood')}
                            onExpand={openChart}
                            chart={
                                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                    <ChartGrid />
                                    <ChartX />
                                    <ChartY domain={[0, 10]} />
                                    <ChartTip />
                                    <AvgLine y={averages.mood} stroke={C.purple} />
                                    <Line type="monotone" dataKey="mood" name="Mood" stroke={C.purple} strokeWidth={2} dot={false} connectNulls />
                                </LineChart>
                            }
                        />
                    </div>

                    {/* Habits */}
                    <div className="metrics-columns">
                        <ChartCard
                            title="Habit Completion"
                            empty={!hasAny('habitPct')}
                            onExpand={openChart}
                            chart={
                                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                    <ChartGrid />
                                    <ChartX />
                                    <ChartY domain={[0, 100]} />
                                    <ChartTip />
                                    <AvgLine y={averages.habitPct} stroke={C.greenDark} />
                                    <Area type="monotone" dataKey="habitPct" name="Done %" stroke={C.greenDark} strokeWidth={2} fill="rgba(67, 182, 125, 0.16)" dot={false} connectNulls />
                                </AreaChart>
                            }
                        />
                        <ChartCard
                            title="Custom Habit Completion"
                            empty={customHabitData.length === 0}
                            height={habitChartHeight}
                            expandHeight={habitExpandHeight}
                            onExpand={openChart}
                            chart={
                                <BarChart data={customHabitData} layout="vertical" margin={{ top: 2, right: 12, left: 0, bottom: 0 }}>
                                    <CartesianGrid stroke="rgba(255, 255, 255, 0.06)" horizontal={false} />
                                    <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'rgba(255, 255, 255, 0.12)' }} allowDecimals={false} />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        width={130}
                                        tick={{ ...AXIS_TICK, fontSize: 10 }}
                                        tickLine={false}
                                        axisLine={{ stroke: 'rgba(255, 255, 255, 0.12)' }}
                                        interval={0}
                                        tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 16) + '…' : v)}
                                    />
                                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }} />
                                    {customHabitAvg != null && (
                                        <ReferenceLine
                                            x={customHabitAvg}
                                            stroke={AVG_STROKE}
                                            strokeDasharray="6 4"
                                            strokeOpacity={0.85}
                                            label={{ value: 'Avg', position: 'top', fill: AVG_STROKE, fontSize: 10, fontFamily: 'var(--font-mono)' }}
                                        />
                                    )}
                                    <Bar dataKey="pct" name="Done %" fill={C.blue} radius={[0, 3, 3, 0]} barSize={14} />
                                </BarChart>
                            }
                        />
                    </div>
                </div>
            )}

            <ChartModal expanded={expanded} onClose={() => setExpanded(null)} />
        </div>
    );
};

export default MetricsCharts;