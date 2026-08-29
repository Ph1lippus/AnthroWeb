import React, { useMemo, useState } from 'react';
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

const ChartCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="metrics-chart-card">
        <div className="metrics-chart-head">
            <h3>{title}</h3>
        </div>
        {children}
    </div>
);

const ChartEmpty: React.FC = () => (
    <div className="metrics-chart-empty">No data in this range</div>
);

interface MetricsChartsProps {
    logs: DailyLog[] | null;
    habits: Habit[] | null;
    habitLogs: DailyHabitLog[] | null;
    settings: UserSettings | null;
}

const MetricsCharts: React.FC<MetricsChartsProps> = ({ logs, habits, habitLogs, settings }) => {
    const [range, setRange] = useState<{ label: string; days: number | null }>(RANGES[0]);

    const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;
    const caloriesGoal = activeGoals?.nutrition?.calories ?? null;
    const waterGoal = activeGoals?.nutrition?.water ?? null;
    const proteinGoal = activeGoals?.nutrition?.protein ?? null;
    const carbsGoal = activeGoals?.nutrition?.carbs ?? null;
    const fatGoal = activeGoals?.nutrition?.fat ?? null;
    const targetWeight = settings?.target_weight ?? null;
    const targetBodyFat = settings?.target_bodyfat ?? null;

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
                const customDone = (habitLogs || []).filter(h => h.log_date === l.log_date && h.completed).length;
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
    }, [logs, range.days, habits, habitLogs]);

    const customHabitData = useMemo(() => {
        if (!habits || habits.length === 0) return [];
        const logDates = new Set(chartData.map(d => d.date));
        return habits.map(h => {
            const done = (habitLogs || []).filter(x => x.habit_id === h.id && x.completed && logDates.has(x.log_date)).length;
            return {
                name: h.name,
                pct: logDates.size > 0 ? Math.round((done / logDates.size) * 100) : 0,
            };
        });
    }, [habits, habitLogs, chartData]);

    const hasAny = (...keys: (keyof ChartPoint)[]): boolean => chartData.some(p => keys.some(k => p[k] != null));

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
                    <ChartCard title="Score">
                        <ResponsiveContainer width="100%" height={180}>
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
                                <Area type="monotone" dataKey="score" name="Score" stroke={C.primary} strokeWidth={2} fill="url(#scoreFill)" dot={false} connectNulls />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    {/* Sleep */}
                    <div className="metrics-columns">
                        {hasAny('sleepDuration') ? (
                            <ChartCard title="Sleep Duration">
                                <ResponsiveContainer width="100%" height={150}>
                                    <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                        <ChartGrid />
                                        <ChartX />
                                        <ChartY domain={[0, 12]} />
                                        <ChartTip />
                                        <Area type="monotone" dataKey="sleepDuration" name="Hours" stroke={C.primary} strokeWidth={2} fill="rgba(0, 255, 166, 0.15)" dot={false} connectNulls />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        ) : (
                            <ChartCard title="Sleep Duration"><ChartEmpty /></ChartCard>
                        )}
                        {hasAny('sleepQuality') ? (
                            <ChartCard title="Sleep Quality">
                                <ResponsiveContainer width="100%" height={150}>
                                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                        <ChartGrid />
                                        <ChartX />
                                        <ChartY domain={[0, 10]} />
                                        <ChartTip />
                                        <Line type="monotone" dataKey="sleepQuality" name="Quality" stroke={C.blue} strokeWidth={2} dot={false} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        ) : (
                            <ChartCard title="Sleep Quality"><ChartEmpty /></ChartCard>
                        )}
                    </div>

                    {/* Vitals & BP */}
                    <div className="metrics-columns">
                        {hasAny('morningSystolic', 'eveningSystolic') ? (
                            <ChartCard title="Systolic">
                                <ResponsiveContainer width="100%" height={150}>
                                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                        <ChartGrid />
                                        <ChartX />
                                        <ChartY />
                                        <ChartTip />
                                        <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)', paddingBottom: 4 }} />
                                        <ReferenceLine y={120} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} />
                                        <Line type="monotone" dataKey="morningSystolic" name="AM Systolic" stroke={C.blue} strokeWidth={2} dot={false} connectNulls />
                                        <Line type="monotone" dataKey="eveningSystolic" name="PM Systolic" stroke={C.pink} strokeWidth={2} dot={false} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        ) : (
                            <ChartCard title="Systolic"><ChartEmpty /></ChartCard>
                        )}
                        {hasAny('morningDiastolic', 'eveningDiastolic') ? (
                            <ChartCard title="Diastolic">
                                <ResponsiveContainer width="100%" height={150}>
                                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                        <ChartGrid />
                                        <ChartX />
                                        <ChartY />
                                        <ChartTip />
                                        <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)', paddingBottom: 4 }} />
                                        <ReferenceLine y={80} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} />
                                        <Line type="monotone" dataKey="morningDiastolic" name="AM Diastolic" stroke={C.blue} strokeWidth={2} dot={false} connectNulls />
                                        <Line type="monotone" dataKey="eveningDiastolic" name="PM Diastolic" stroke={C.pink} strokeWidth={2} dot={false} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        ) : (
                            <ChartCard title="Diastolic"><ChartEmpty /></ChartCard>
                        )}
                        {hasAny('morningBpm', 'eveningBpm') ? (
                            <ChartCard title="Heart Rate">
                                <ResponsiveContainer width="100%" height={150}>
                                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                        <ChartGrid />
                                        <ChartX />
                                        <ChartY />
                                        <ChartTip />
                                        <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)', paddingBottom: 4 }} />
                                        <Line type="monotone" dataKey="morningBpm" name="AM BPM" stroke={C.blue} strokeWidth={2} dot={false} connectNulls />
                                        <Line type="monotone" dataKey="eveningBpm" name="PM BPM" stroke={C.pink} strokeWidth={2} dot={false} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        ) : (
                            <ChartCard title="Heart Rate"><ChartEmpty /></ChartCard>
                        )}
                        {hasAny('bodyTemperature') ? (
                            <ChartCard title="Body Temperature">
                                <ResponsiveContainer width="100%" height={150}>
                                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                        <ChartGrid />
                                        <ChartX />
                                        <ChartY />
                                        <ChartTip />
                                        <ReferenceLine y={37} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} />
                                        <Line type="monotone" dataKey="bodyTemperature" name="°C" stroke={C.amber} strokeWidth={2} dot={false} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        ) : (
                            <ChartCard title="Body Temperature"><ChartEmpty /></ChartCard>
                        )}
                    </div>

                    {/* Nutrition */}
                    <div className="metrics-columns">
                        {hasAny('calories') ? (
                            <ChartCard title="Calories">
                                <ResponsiveContainer width="100%" height={150}>
                                    <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                        <ChartGrid />
                                        <ChartX />
                                        <ChartY />
                                        <ChartTip />
                                        {caloriesGoal != null && <ReferenceLine y={caloriesGoal} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} label="Goal" />}
                                        <Bar dataKey="calories" name="Calories" fill={C.primary} radius={[3, 3, 0, 0]} maxBarSize={18} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        ) : (
                            <ChartCard title="Calories"><ChartEmpty /></ChartCard>
                        )}
                        {hasAny('protein', 'carbs', 'fat') ? (
                            <ChartCard title="Macros">
                                <ResponsiveContainer width="100%" height={150}>
                                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                        <ChartGrid />
                                        <ChartX />
                                        <ChartY />
                                        <ChartTip />
                                        <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)', paddingBottom: 4 }} />
                                        {proteinGoal != null && <ReferenceLine y={proteinGoal} stroke={C.blue} strokeDasharray="4 4" strokeOpacity={0.4} />}
                                        {carbsGoal != null && <ReferenceLine y={carbsGoal} stroke={C.purple} strokeDasharray="4 4" strokeOpacity={0.4} />}
                                        {fatGoal != null && <ReferenceLine y={fatGoal} stroke={C.amber} strokeDasharray="4 4" strokeOpacity={0.4} />}
                                        <Line type="monotone" dataKey="protein" name="Protein" stroke={C.blue} strokeWidth={2} dot={false} connectNulls />
                                        <Line type="monotone" dataKey="carbs" name="Carbs" stroke={C.purple} strokeWidth={2} dot={false} connectNulls />
                                        <Line type="monotone" dataKey="fat" name="Fat" stroke={C.amber} strokeWidth={2} dot={false} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        ) : (
                            <ChartCard title="Macros"><ChartEmpty /></ChartCard>
                        )}
                        {hasAny('water') ? (
                            <ChartCard title="Water">
                                <ResponsiveContainer width="100%" height={150}>
                                    <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                        <ChartGrid />
                                        <ChartX />
                                        <ChartY />
                                        <ChartTip />
                                        {waterGoal != null && <ReferenceLine y={waterGoal} stroke={C.cyan} strokeDasharray="4 4" strokeOpacity={0.5} />}
                                        <Bar dataKey="water" name="ml" fill={C.cyan} radius={[3, 3, 0, 0]} maxBarSize={18} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        ) : (
                            <ChartCard title="Water"><ChartEmpty /></ChartCard>
                        )}
                    </div>

                    {/* Body & Mood */}
                    <div className="metrics-columns">
                        {hasAny('weight') ? (
                            <ChartCard title="Weight">
                                <ResponsiveContainer width="100%" height={150}>
                                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                        <ChartGrid />
                                        <ChartX />
                                        <ChartY />
                                        <ChartTip />
                                        {targetWeight != null && <ReferenceLine y={targetWeight} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} label="Target" />}
                                        <Line type="monotone" dataKey="weight" name="kg" stroke={C.primary} strokeWidth={2} dot={false} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        ) : (
                            <ChartCard title="Weight"><ChartEmpty /></ChartCard>
                        )}
                        {hasAny('bodyFat') ? (
                            <ChartCard title="Body Fat">
                                <ResponsiveContainer width="100%" height={150}>
                                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                        <ChartGrid />
                                        <ChartX />
                                        <ChartY />
                                        <ChartTip />
                                        {targetBodyFat != null && <ReferenceLine y={targetBodyFat} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} label="Target" />}
                                        <Line type="monotone" dataKey="bodyFat" name="%" stroke={C.pink} strokeWidth={2} dot={false} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        ) : (
                            <ChartCard title="Body Fat"><ChartEmpty /></ChartCard>
                        )}
                        {hasAny('mood') ? (
                            <ChartCard title="Mood">
                                <ResponsiveContainer width="100%" height={150}>
                                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                        <ChartGrid />
                                        <ChartX />
                                        <ChartY domain={[0, 10]} />
                                        <ChartTip />
                                        <Line type="monotone" dataKey="mood" name="Mood" stroke={C.purple} strokeWidth={2} dot={false} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        ) : (
                            <ChartCard title="Mood"><ChartEmpty /></ChartCard>
                        )}
                    </div>

                    {/* Habits */}
                    <div className="metrics-columns">
                        {hasAny('habitPct') ? (
                            <ChartCard title="Habit Completion">
                                <ResponsiveContainer width="100%" height={150}>
                                    <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                        <ChartGrid />
                                        <ChartX />
                                        <ChartY domain={[0, 100]} />
                                        <ChartTip />
                                        <Area type="monotone" dataKey="habitPct" name="Done %" stroke={C.greenDark} strokeWidth={2} fill="rgba(67, 182, 125, 0.16)" dot={false} connectNulls />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        ) : (
                            <ChartCard title="Habit Completion"><ChartEmpty /></ChartCard>
                        )}
                        {customHabitData.length > 0 ? (
                            <ChartCard title="Custom Habit Completion">
                                <ResponsiveContainer width="100%" height={150}>
                                    <BarChart data={customHabitData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                        <ChartGrid />
                                        <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'rgba(255, 255, 255, 0.12)' }} interval={0} height={40} />
                                        <ChartY domain={[0, 100]} />
                                        <ChartTip />
                                        <Bar dataKey="pct" name="Done %" fill={C.blue} radius={[3, 3, 0, 0]} maxBarSize={22} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartCard>
                        ) : (
                            <ChartCard title="Custom Habit Completion"><ChartEmpty /></ChartCard>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MetricsCharts;