import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
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
    ReferenceArea,
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
import { BUILTIN_HABITS, BUILTIN_HABIT_COUNT } from '../../utils/dailyScoring';
import { goalsForDate, parseGoalHistory } from '../../utils/goalHistory';
import { addDays } from '../../utils/dates';
import type { DateRange } from './dateRange';
import LoadingSpinner from '../../Components/LoadingSpinner';
import { useViewportHeight } from '../../hooks/useViewportHeight';

// Resolved from CSS variables so the palette lives in one place in index.css.
const cssVar = (name: string): string =>
    `var(${name})`;

const C = {
    primary: cssVar('--chart-primary'),
    greenDark: cssVar('--chart-green'),
    blue: cssVar('--chart-blue'),
    pink: cssVar('--chart-pink'),
    amber: cssVar('--chart-amber'),
    purple: cssVar('--chart-purple'),
    cyan: cssVar('--chart-cyan'),
    red: cssVar('--chart-red'),
};

const fmtDate = (d: string): string =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const inRange = (date: string, days: number | null): boolean => {
    if (days === null) return true;
    const diff = Math.floor((Date.now() - new Date(date + 'T00:00:00').getTime()) / 86400000);
    return diff >= 0 && diff < days;
};

// "23:30" / "23:30:00" -> 23.5 so a clock time can share a numeric axis with the
// rest of the metrics. The value is left on a plain 0-24 clock: shifting the
// small hours into the 24-36 range (the old behaviour) pushed every morning
// wake-up off the top of the chart and produced duplicate axis labels, and it
// made the "straight line" between two unrelated nights meaningless.
const clockToHours = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const match = /^(\d{1,2}):(\d{2})/.exec(value);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return ((hours + minutes / 60) % 24 + 24) % 24;
};

const hoursToClock = (hours: number | null): string => {
    if (hours === null) return '--';
    // Round to the minute first so 23.999 renders as 00:00, not 24:00.
    let totalMinutes = Math.round(hours * 60) % (24 * 60);
    if (totalMinutes < 0) totalMinutes += 24 * 60;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Average of several clock readings.
 *
 * A plain arithmetic mean is wrong on a 24-hour circle: 23:30 and 00:30 average
 * to midnight instead of to 00:00-of-the-following-day, which is exactly the
 * kind of bad reading the average line used to produce. Averaging the unit
 * vectors instead finds the centre of the cluster and is immune to the wrap.
 */
const averageClock = (values: (number | null)[]): number | null => {
    const valid = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (valid.length === 0) return null;
    const toRad = (h: number) => (h / 24) * Math.PI * 2;
    let x = 0;
    let y = 0;
    for (const v of valid) {
        x += Math.cos(toRad(v));
        y += Math.sin(toRad(v));
    }
    // A perfectly opposed set (e.g. 06:00 and 18:00) sums to zero length, which
    // has no meaningful angle - fall back to the plain mean.
    if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) {
        return valid.reduce((sum, v) => sum + v, 0) / valid.length;
    }
    const deg = (Math.atan2(y, x) * 180) / Math.PI;
    return ((deg < 0 ? deg + 360 : deg) / 360) * 24;
};

/**
 * Explicit tick sets.
 *
 * Every axis is given a fixed, readable set of ticks rather than letting the
 * library pick five arbitrary values. A 0-10 scale shows all eleven stops
 * (0,1,2...10) so any logged rating can be read straight off the chart, and
 * whole-number scales never show floats.
 */
const intTicks = (from: number, to: number, step = 1): number[] => {
    const out: number[] = [];
    // Guard against floating point drift (0.1 steps never land exactly).
    for (let i = 0; out.length < (to - from) / step + 1; i++) {
        const v = from + i * step;
        out.push(Math.round(v * 1e6) / 1e6);
        if (i > 1000) break;
    }
    return out;
};

const TICKS = {
    /** 0-10 rating scales: mood, sleep quality. Every step is shown. */
    rating0to10: intTicks(0, 10),
    percent: [0, 20, 40, 60, 80, 100],
    hours: intTicks(0, 14, 2),
    /** Night is shaded from 18:00 to 08:00, so bedtime/wake-up sit in context. */
    night: [18, 24],
    morning: [0, 8],
};

interface ChartPoint {
    date: string;
    label: string;
    score: number | null;
    sleepDuration: number | null;
    sleepQuality: number | null;
    bedtime: number | null;
    wakeTime: number | null;
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
    /**
     * The goal in force on that day's date, carried per point rather than as one
     * chart-wide constant. Goals are versioned by date (see `goalHistory.ts`), so
     * a window spanning an edit has several legitimate goal levels and a single
     * flat reference line would misdescribe the earlier part of it.
     */
    goalCalories: number | null;
    goalWater: number | null;
    goalProtein: number | null;
    goalCarbs: number | null;
    goalFat: number | null;
    goalSleepHours: number | null;
    goalBedtime: number | null;
    goalWakeTime: number | null;
}

interface TooltipEntry {
    dataKey?: string | number;
    value?: number | string | null;
    name?: string;
    stroke?: string;
    fill?: string;
    color?: string;
    /** Per-series formatter; Recharts forwards this through the payload. */
    formatter?: (value: FormatterValue) => string;
}

interface ChartTooltipProps {
    active?: boolean;
    label?: string | number;
    payload?: TooltipEntry[];
}

// Recharts types a series value as `ValueType`, which may also be a readonly
// array. Every formatter here renders a single number, so arrays read the first.
type FormatterValue = number | string | ReadonlyArray<number | string> | undefined;

const toNumber = (v: FormatterValue): number => {
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) return toNumber(v[0]);
    return parseFloat(String(v));
};

/** Trims a float to whole numbers unless the value genuinely needs decimals. */
const num = (v: FormatterValue, digits = 1): string => {
    const n = toNumber(v);
    if (!Number.isFinite(n)) return '';
    return String(Math.round(n * 10 ** digits) / 10 ** digits);
};

/** "23.5" -> "23:30", used for every clock series. */
const clockValue = (v: FormatterValue): string => {
    const n = toNumber(v);
    return Number.isFinite(n) ? hoursToClock(n) : '';
};

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
                    <span className="chart-tooltip-value">
                        {p.formatter ? p.formatter(p.value) : num(p.value)}
                    </span>
                </div>
            ))}
        </div>
    );
};

const AXIS_TICK = {
    fill: 'var(--chart-axis)',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
};

const ChartGrid: React.FC = () => <CartesianGrid stroke="var(--chart-grid)" vertical={false} />;

const ChartX: React.FC = () => (
    <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'rgba(255, 255, 255, 0.12)' }} minTickGap={36} interval="preserveStartEnd" />
);

interface ChartYProps {
    domain?: [number, number];
    /** Fixed tick values. Always prefer these over tickCount. */
    ticks?: number[];
    tickCount?: number;
    /** Axis width; widen for clock labels such as "23:00". */
    width?: number;
    tickFormatter?: (value: number) => string;
    /** Allow fractional tick labels (weight, temperature). */
    allowDecimals?: boolean;
}

const ChartY: React.FC<ChartYProps> = ({
    domain,
    ticks,
    tickCount,
    width,
    tickFormatter,
    allowDecimals = false,
}) => (
    <YAxis
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        domain={domain}
        ticks={ticks}
        // tickCount and ticks are mutually exclusive in Recharts; passing both
        // makes the axis collapse.
        tickCount={ticks ? undefined : (tickCount ?? 5)}
        tickFormatter={tickFormatter}
        width={width ?? 38}
        allowDecimals={allowDecimals}
    />
);

const ChartTip: React.FC = () => (
    <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255, 255, 255, 0.15)' }} />
);

interface DotRenderProps {
    cx?: number;
    cy?: number;
    value?: number | string | null;
    index?: number;
}

/**
 * Dot renderer for clock readings.
 *
 * Marks the individual nights behind the bedtime / wake-up trend line. The
 * line itself is the trend; the dot is the actual reading, which matters here
 * because a clock series wraps: two adjacent nights at 23:50 and 00:10 are ten
 * minutes apart in real life but a near-vertical jump on a 0-24 axis. The dot
 * is what tells you where the real value sits.
 *
 * `strokeOpacity={0}` is used on the line's *stroke* so the legend swatch and
 * the tooltip dot keep the series' real colour - Recharts reads the legend
 * colour straight off `stroke`, so `stroke="transparent"` would leave both
 * invisible. That trick is no longer needed now the line is visible again, but
 * the colour source is still `stroke`, so it stays explicit.
 */
const clockDot = (color: string) => {
    const render = ({ cx, cy, value, index }: DotRenderProps) => {
        if (typeof cx !== 'number' || typeof cy !== 'number' || value == null) {
            return <g key={index ?? 'empty'} />;
        }
        return (
            <circle
                key={index}
                cx={cx}
                cy={cy}
                r={3.5}
                fill={color}
                stroke="rgba(0, 0, 0, 0.5)"
                strokeWidth={1.5}
            />
        );
    };
    // Recharts compares the dot option by identity, so callers must memoise this
    // (see the bedtimeDot/wakeDot hooks below) or every render remounts the
    // entire point cloud.
    render.displayName = `clockDot(${color})`;
    return render;
};

/** Shared axis config for every clock chart: a 24-hour face, labelled every 3h. */
const CLOCK_AXIS_TICKS = intTicks(0, 24, 3);
// The domain top and bottom are the same instant, so label it 24:00 rather than
// printing "00:00" twice on the same axis.
const clockAxisLabel = (value: number): string => (value >= 24 ? '24:00' : hoursToClock(value));

/**
 * An all-null row standing in for a day that is missing from the log.
 *
 * Declared at module scope so its identity is stable - a fresh object per render
 * would be a new `useMemo` dependency every time and defeat the memo.
 */
const BLANK_POINT: ChartPoint = {
    date: '', label: '', score: null, sleepDuration: null, sleepQuality: null,
    bedtime: null, wakeTime: null, weight: null, bodyFat: null, mood: null,
    calories: null, protein: null, carbs: null, fat: null, water: null,
    morningSystolic: null, morningDiastolic: null, morningBpm: null,
    eveningSystolic: null, eveningDiastolic: null, eveningBpm: null,
    bodyTemperature: null, habitPct: null,
    goalCalories: null, goalWater: null, goalProtein: null, goalCarbs: null,
    goalFat: null, goalSleepHours: null, goalBedtime: null, goalWakeTime: null,
};

/**
 * A stepped goal line across days that each carry their own goal.
 *
 * Recharts' `ReferenceLine y={...}` is a single constant, so it cannot express a
 * goal that changed partway through the window. Its `segments` prop takes
 * explicit x/y pairs instead, which lets the line step at the day the goal
 * actually changed. Renders nothing when no day in the window had that goal set,
 * so charts with an unchanging goal look exactly as they did.
 */
const GoalSegments: React.FC<{
    points: ChartPoint[];
    dataKey: keyof ChartPoint;
    stroke: string;
    label?: string;
}> = ({ points, dataKey, stroke, label }) => {
    const segments = useMemo(() => {
        // Consecutive real days only: a day with no goal set breaks the line
        // rather than bridging it, so a stretch without a goal doesn't read as
        // "held steady".
        const run: { x: string; y: number }[][] = [];
        let current: { x: string; y: number }[] = [];
        points.forEach(p => {
            const y = p[dataKey];
            if (typeof y !== 'number' || Number.isNaN(y)) {
                if (current.length > 1) run.push(current);
                current = [];
                return;
            }
            current.push({ x: p.label, y });
        });
        if (current.length > 1) run.push(current);
        return run;
    }, [points, dataKey]);

    if (!segments.length) return null;

    // Recharts 3 dropped the multi-segment `segments` prop in favour of a single
    // `segment` tuple, so one <ReferenceLine> per run. The label rides the last
    // run only, otherwise a goal edited three times prints "Goal" three times.
    return (
        <>
            {segments.map((run, runIndex) =>
                run.slice(0, -1).map((p, i) => {
                    const q = run[i + 1];
                    const isLast = runIndex === segments.length - 1 && i === run.length - 2;
                    return (
                        <ReferenceLine
                            key={`${runIndex}-${i}`}
                            segment={[{ x: p.x, y: p.y }, { x: q.x, y: q.y }]}
                            stroke={stroke}
                            strokeDasharray="4 4"
                            strokeOpacity={0.5}
                            label={label && isLast ? { value: label, position: 'insideTopRight', fill: stroke, fontSize: 10 } : undefined}
                        />
                    );
                })
            )}
        </>
    );
};

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
    /** Shown under the title, e.g. the date range the plot covers. */
    subtitle?: string;
}

interface ChartCardProps {
    title: string;
    chart?: React.ReactNode;
    height?: number;
    expandHeight?: number;
    onExpand?: (expanded: ExpandedChart) => void;
    empty?: boolean;
    /** Span the whole row instead of sitting in a 2-up column. */
    fullWidth?: boolean;
}

/* ---------- the enlarged view's state ----------
   The chart that is open in the enlarged view, or null.
 *
 * This lives outside React on purpose. It used to be `useState` on MetricsCharts,
 * which meant opening a chart re-rendered MetricsCharts -- and therefore rebuilt
 * all sixteen chart elements, so every ResponsiveContainer, axis, tick and
 * legend on the dashboard recomputed. Closing did it again. That was the pause
 * behind opening a chart once the Recharts animation was taken out of the picture.
 *
 * A tiny external store plus `useSyncExternalStore` inverts that: MetricsCharts
 * writes to it on click and never reads it, and only the portal host subscribes.
 * Opening and closing now re-render the dialog and nothing else on the page.
 *
 * It is a snapshot store rather than a `useState` pair because `useState` has no
 * subscriber API, and React 19's `use`/context would put the value back into the
 * tree above the charts -- exactly the tree that must not re-render. */
let openChartSnapshot: ExpandedChart | null = null;
const openChartListeners = new Set<() => void>();

const notifyOpenChart = (): void => {
    // Copied before iterating: a listener that unmounts during the notification
    // mutates the set, and iterating a Set while it is being mutated is how you
    // end up calling a stale closure.
    for (const listener of [...openChartListeners]) listener();
};

const subscribeOpenChart = (listener: () => void): (() => void) => {
    openChartListeners.add(listener);
    return () => {
        openChartListeners.delete(listener);
    };
};

const getOpenChart = (): ExpandedChart | null => openChartSnapshot;

const setOpenChart = (next: ExpandedChart | null): void => {
    if (next === openChartSnapshot) return;
    openChartSnapshot = next;
    notifyOpenChart();
};

/** Stable identity, so it can be handed to the memoized dialog as a prop. */
const closeChart = (): void => setOpenChart(null);

/**
 * One chart, in a card.
 *
 * The plot sits in its own panel rather than directly on the card's translucent
 * surface, purely so it gets some breathing room -- the panel carries no
 * background, border or shadow. It used to: the cards are translucent white over
 * a near-black page, so the plot area had almost no contrast of its own and the
 * gridlines floated. But an outlined plot area reads as a frame drawn around the
 * data, which is the same shape as the stray border a tap used to leave behind,
 * and it was not worth it. The padding in `.chart-plot` is enough separation.
 *
 * The panel is a wrapper div rather than a background on the SVG, because
 * ResponsiveContainer measures its own parent to decide the plot size --
 * styling the SVG itself would have put the sizing and the decoration fighting
 * over the same box.
 */
const ChartCard: React.FC<ChartCardProps> = ({
    title,
    chart,
    height = 150,
    expandHeight,
    onExpand,
    empty,
    fullWidth,
}) => (
    <div className={`metrics-chart-card${fullWidth ? ' metrics-chart-card--full' : ''}`}>
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
            /* The panel is never swapped for a stand-in. It used to be: a card
               holding the chart that was open enlarged drew an empty box of
               `style={{ height }}` instead, which -- under the global
               `box-sizing: border-box` -- was the chart's height with none of
               this padding, and therefore 13.6px short of the real panel on
               desktop. Every close of the enlarged view shifted the whole grid
               down by that much. With no stand-in to be wrong about, the chart
               can just size itself again. */
            <div className="chart-plot">
                <ResponsiveContainer width="100%" height={height}>
                    {chart}
                </ResponsiveContainer>
            </div>
        )}
    </div>
);

const ChartEmpty: React.FC = () => (
    <div className="metrics-chart-empty">No data in this range</div>
);

const ChartModal = React.memo(function ChartModal({ expanded, onClose }: { expanded: ExpandedChart; onClose: () => void }) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    // Read live rather than once at open, so rotating the device or opening the
    // keyboard re-fits the plot instead of leaving it clipped.
    const viewportHeight = useViewportHeight();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }
            // Keep Tab inside the dialog; it is the only focusable content here.
            if (e.key === 'Tab' && dialogRef.current) {
                e.preventDefault();
                // Focus the close button so Escape and Tab work straight away, but
                // without scrolling: the default focus behaviour scrolls every
                // scrollable ancestor to bring the element into view, which on a
                // long dashboard meant the page jumping under the dialog as it
                // opened.
                closeRef.current?.focus({ preventScroll: true });
            }
        };
        window.addEventListener('keydown', onKey);
        // Stop the page behind from scrolling. `overflow: hidden` on the body
        // takes the scrollbar away with it, which reflows the whole dashboard --
        // and again on close when the scrollbar comes back. The gutter is
        // reserved permanently in index.css so the content width does not change
        // either time; without it, opening a chart measured and re-laid out every
        // chart behind the dialog, which was a visible pause on a loaded page.
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        // Same preventScroll reasoning as the Tab branch above -- and it was the
        // missing half of the same fix: opening a chart scrolled the dashboard to
        // the top because the close button sits above the fold.
        closeRef.current?.focus({ preventScroll: true });
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [onClose]);

    // The caller passes a preferred pixel height; cap it against the viewport so
    // tall charts (custom habits) never push the header off screen.
    const height = Math.max(260, Math.min(expanded.height, viewportHeight * 0.68));

    return (
        <div className="chart-modal-overlay" onClick={onClose}>
            <div
                ref={dialogRef}
                className="chart-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`${expanded.title} chart`}
                onClick={e => e.stopPropagation()}
            >
                <div className="chart-modal-head">
                    <div className="chart-modal-heading">
                        <h3>{expanded.title}</h3>
                        {expanded.subtitle && <span className="chart-modal-subtitle">{expanded.subtitle}</span>}
                    </div>
                    <button ref={closeRef} type="button" className="chart-modal-close" aria-label="Close chart" title="Close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                <div className="chart-modal-body">
                    <div className="chart-plot chart-plot--large">
                        <ResponsiveContainer width="100%" height={height}>
                            {expanded.chart}
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
});

/**
 * Mounts the enlarged view at the end of <body>, and only ever re-renders it.
 *
 * The portal target matters as much as the store does. The overlay was rendered
 * inline, inside the dashboard grid, so it inherited whatever z-index and
 * stacking context that grid had and had to be raised out of it by hand.
 * Rendering into <body> puts it last in the document -- on top of everything,
 * equal z-index or not -- and makes that a property of the tree rather than a
 * number someone has to remember to raise later.
 */
const ChartModalHost: React.FC = React.memo(function ChartModalHost() {
    const expanded = React.useSyncExternalStore(subscribeOpenChart, getOpenChart, getOpenChart);

    // The store is module scope, so it outlives any one render of this
    // component. Without this a chart left open while navigating away would
    // come back as an overlay over the next page.
    useEffect(() => () => setOpenChart(null), []);

    if (!expanded) return null;
    return createPortal(<ChartModal expanded={expanded} onClose={closeChart} />, document.body);
});
ChartModalHost.displayName = 'ChartModalHost';

export interface MetricsChartsProps {
    logs: DailyLog[] | null;
    habits: Habit[] | null;
    habitLogs: DailyHabitLog[] | null;
    settings: UserSettings | null;
    range: DateRange;
}

const MetricsCharts: React.FC<MetricsChartsProps> = ({ logs, habits, habitLogs, settings, range }) => {
    // Every chart on the page covers the same window, so the range is stamped on
    // here rather than threaded down through sixteen cards just for the enlarged
    // view to say what window it is showing.
    const openChart = useCallback(
        (e: ExpandedChart) => {
            setOpenChart({ ...e, subtitle: e.subtitle ?? range.label });
        },
        [range.label],
    );

    // Goals are versioned by date, so each point resolves its own (see
    // `goalHistory.ts`); the chart-wide constants below are only used to decide
    // whether a goal exists at all in this window.
    const goalHistory = useMemo(() => parseGoalHistory(settings?.goal_history), [settings?.goal_history]);
    const currentGoals = (settings?.active_goals as ActiveGoals | undefined) || null;
    const goalsOn = useCallback((date: string): ActiveGoals | null =>
        goalsForDate(goalHistory, date, currentGoals), [goalHistory, currentGoals]);

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
                    BUILTIN_HABITS.filter(h => (l as unknown as Record<string, unknown>)[h.column]).length;
                const customTotal = habits?.length || 0;
                const customDone = completedByDate.get(l.log_date) ?? 0;
                const habitTotal = BUILTIN_HABIT_COUNT + customTotal;
                return {
                    date: l.log_date,
                    label: fmtDate(l.log_date),
                    score: l.daily_score ?? null,
                    sleepDuration: l.sleep_duration ?? null,
                    sleepQuality: l.sleep_quality ?? null,
                    bedtime: clockToHours(l.bedtime),
                    wakeTime: clockToHours(l.wake_time),
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
                    goalCalories: goalsOn(l.log_date)?.nutrition?.calories ?? null,
                    goalWater: goalsOn(l.log_date)?.nutrition?.water ?? null,
                    goalProtein: goalsOn(l.log_date)?.nutrition?.protein ?? null,
                    goalCarbs: goalsOn(l.log_date)?.nutrition?.carbs ?? null,
                    goalFat: goalsOn(l.log_date)?.nutrition?.fat ?? null,
                    goalSleepHours: goalsOn(l.log_date)?.sleep?.hours ?? null,
                    // Clock goals come back as "HH:MM" strings; the chart plots
                    // the same decimal hours as the readings, so the goal lines
                    // land where they belong. A blank or malformed goal yields
                    // null, which simply hides the line for that day.
                    goalBedtime: clockToHours(goalsOn(l.log_date)?.sleep?.bedtime),
                    goalWakeTime: clockToHours(goalsOn(l.log_date)?.sleep?.wake_time),
                };
            });
    }, [logs, range.days, habits, completedByDate, goalsOn]);

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
    // True when a day is missing from the log entirely. Bedtime/wake-up are
    // clock readings, so joining a 22:00 on Tuesday to a 23:30 the following
    // Tuesday with a stroke would draw one straight line across three weeks of
    // nothing - which is exactly the "straight line" reading this chart had
    // before. Filling each missing day with an all-null row (BLANK_POINT) gives
    // the series a real break at every gap, so the line only ever joins nights
    // that are actually adjacent.
    const dayGap = (from: string, to: string): number => {
        const ms = new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime();
        return Math.round(ms / 86400000);
    };
    const clockData = useMemo<ChartPoint[]>(() => {
        if (chartData.length < 2) return chartData;
        // Cap the filler rows: a multi-year history at All Time would otherwise
        // synthesise thousands of empty days and dominate the x-axis.
        const MAX_FILLERS = 2000;
        const out: ChartPoint[] = [chartData[0]];
        let fillers = 0;
        for (let i = 1; i < chartData.length; i++) {
            const prev = out[out.length - 1];
            const gap = dayGap(prev.date, chartData[i].date);
            for (let d = 1; d < gap && fillers < MAX_FILLERS; d++, fillers++) {
                const day = addDays(prev.date, d);
                out.push({ ...BLANK_POINT, date: day, label: fmtDate(day) });
            }
            out.push(chartData[i]);
        }
        return out;
    }, [chartData]);

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
            // Clock averages are circular; a plain mean would place 23:30 and
            // 00:30 at midnight instead of just after it.
            bedtime: averageClock(chartData.map(p => p.bedtime)),
            wakeTime: averageClock(chartData.map(p => p.wakeTime)),
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

    // Memoised so the Recharts dot renderer keeps a stable identity between
    // renders, which stops the point cloud remounting on every parent update.
    const bedtimeDot = useMemo(() => clockDot(C.purple), []);
    const wakeDot = useMemo(() => clockDot(C.amber), []);

    // Each macro gets its own chart with its own axis, goal and average. Sharing
    // one chart for all three made them unreadable, because a 200g carb day
    // flattened a 60g fat day onto the same baseline.
    const macroChart = (
        dataKey: 'protein' | 'carbs' | 'fat',
        goalKey: 'goalProtein' | 'goalCarbs' | 'goalFat',
        label: string,
        color: string,
    ) => (
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
                <linearGradient id={`${dataKey}Fill`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
            </defs>
            <ChartGrid />
            <ChartX />
            <ChartY />
            <ChartTip />
            <GoalSegments points={chartData} dataKey={goalKey} stroke={color} label="Goal" />
            <AvgLine y={averages[dataKey]} stroke={color} />
            <Area
                type="monotone"
                dataKey={dataKey}
                name={label}
                stroke={color}
                strokeWidth={2.5}
                fill={`url(#${dataKey}Fill)`}
                dot={false}
                connectNulls
                formatter={(v) => `${num(v)}g`}
                isAnimationActive={false}
            />
        </AreaChart>
    );

    // Full-width card: one row per habit with room for the full name.
    const habitChartHeight = Math.max(180, customHabitData.length * 36);
    const habitExpandHeight = Math.max(340, customHabitData.length * 40);

    return (
        <div className="dashboard-metrics">
            {logs === null ? (
                <div className="dashboard-daily-card">
                    <LoadingSpinner />
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
                                <ChartY domain={[0, 100]} ticks={TICKS.percent} />
                                <ChartTip />
                                <ReferenceLine y={80} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} label="Goal" />
                                <AvgLine y={averages.score} />
                                <Area type="monotone" dataKey="score" name="Score" formatter={(v) => `${num(v)}/100`} stroke={C.primary} strokeWidth={2.5} fill="url(#scoreFill)" dot={false} connectNulls isAnimationActive={false} />
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
                                    <defs>
                                        <linearGradient id="sleepFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={C.primary} stopOpacity={0.28} />
                                            <stop offset="100%" stopColor={C.primary} stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <ChartGrid />
                                    <ChartX />
                                    {/* 14h ceiling with a tick every 2h: half-hour
                                        sleep still reads off the tooltip without
                                        cluttering the axis with quarters. */}
                                    <ChartY domain={[0, 14]} ticks={TICKS.hours} tickFormatter={(v) => `${v}h`} />
                                    <ChartTip />
                                    <GoalSegments points={chartData} dataKey="goalSleepHours" stroke={C.primary} label="Goal" />
                                    <AvgLine y={averages.sleepDuration} />
                                    <Area type="monotone" dataKey="sleepDuration" name="Hours" stroke={C.primary} strokeWidth={2.5} fill="url(#sleepFill)" dot={false} connectNulls formatter={(v) => `${num(v)}h`} isAnimationActive={false} />
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
                                    <ChartY domain={[0, 10]} ticks={TICKS.rating0to10} />
                                    <ChartTip />
                                    <AvgLine y={averages.sleepQuality} stroke={C.blue} />
                                    <Line type="monotone" dataKey="sleepQuality" name="Quality" formatter={(v) => `${num(v)}/10`} stroke={C.blue} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                                </LineChart>
                            }
                        />
                    </div>

                    {/* Bedtime and wake-up time share one 24-hour clock axis.
                        They carry a trend line, but only between nights that
                        are actually adjacent: clockData inserts an empty row
                        for every day missing from the log, so the line breaks
                        at real gaps instead of drawing one straight line across
                        weeks of nothing. Dots mark the individual readings. The
                        axis is a plain 0-24 clock, so a 23:30 bedtime and a
                        06:30 wake-up both sit where they belong and the labels
                        are unambiguous. */}
                    <div className="metrics-columns metrics-columns--single">
                        <ChartCard
                            title="Bedtime & Wake Time"
                            empty={!hasAny('bedtime', 'wakeTime')}
                            height={230}
                            onExpand={openChart}
                            chart={
                                <ComposedChart data={clockData} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                                    <ChartGrid />
                                    <ChartX />
                                    <ChartY
                                        domain={[0, 24]}
                                        ticks={CLOCK_AXIS_TICKS}
                                        width={46}
                                        tickFormatter={clockAxisLabel}
                                    />
                                    <ChartTip />
                                    <Legend
                                        verticalAlign="top"
                                        height={24}
                                        iconType="circle"
                                        iconSize={9}
                                        wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--chart-axis)' }}
                                    />
                                    {/* Night window, so both series are read in
                                        the context of when people actually sleep. */}
                                    <ReferenceArea y1={TICKS.night[0]} y2={24} fill="rgba(179, 141, 255, 0.07)" strokeOpacity={0} />
                                    <ReferenceArea y1={0} y2={TICKS.morning[1]} fill="rgba(179, 141, 255, 0.07)" strokeOpacity={0} />
                                    <GoalSegments
                                        points={chartData}
                                        dataKey="goalBedtime"
                                        stroke={C.purple}
                                        label="Goal"
                                    />
                                    <GoalSegments
                                        points={chartData}
                                        dataKey="goalWakeTime"
                                        stroke={C.amber}
                                        label="Goal"
                                    />
                                    <AvgLine y={averages.bedtime} stroke={C.purple} />
                                    <AvgLine y={averages.wakeTime} stroke={C.amber} />
                                    <Line
                                        type="monotone"
                                        dataKey="bedtime"
                                        name="Bedtime"
                                        stroke={C.purple}
                                        strokeWidth={2}
                                        dot={bedtimeDot}
                                        activeDot={{ r: 6 }}
                                        legendType="circle"
                                        connectNulls={false}
                                        formatter={clockValue}
                                        isAnimationActive={false}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="wakeTime"
                                        name="Wake Time"
                                        stroke={C.amber}
                                        strokeWidth={2}
                                        dot={wakeDot}
                                        activeDot={{ r: 6 }}
                                        legendType="circle"
                                        connectNulls={false}
                                        formatter={clockValue}
                                        isAnimationActive={false}
                                    />
                                </ComposedChart>
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
                                    <Line type="monotone" dataKey="morningSystolic" name="AM Systolic" formatter={(v) => `${num(v)} mmHg`} stroke={C.blue} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                                    <Line type="monotone" dataKey="eveningSystolic" name="PM Systolic" formatter={(v) => `${num(v)} mmHg`} stroke={C.pink} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
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
                                    <Line type="monotone" dataKey="morningDiastolic" name="AM Diastolic" formatter={(v) => `${num(v)} mmHg`} stroke={C.blue} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                                    <Line type="monotone" dataKey="eveningDiastolic" name="PM Diastolic" formatter={(v) => `${num(v)} mmHg`} stroke={C.pink} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
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
                                    <Line type="monotone" dataKey="morningBpm" name="AM Heart Rate" formatter={(v) => `${num(v)} bpm`} stroke={C.blue} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                                    <Line type="monotone" dataKey="eveningBpm" name="PM Heart Rate" formatter={(v) => `${num(v)} bpm`} stroke={C.pink} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
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
                                    <ChartY tickCount={5} allowDecimals tickFormatter={(v) => num(v, 1)} />
                                    <ChartTip />
                                    <ReferenceLine y={37} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} />
                                    <AvgLine y={averages.bodyTemperature} stroke={C.amber} />
                                    <Line type="monotone" dataKey="bodyTemperature" name="Temperature" formatter={(v) => `${num(v, 2)} °C`} stroke={C.amber} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
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
                                    <GoalSegments points={chartData} dataKey="goalCalories" stroke={C.primary} label="Goal" />
                                    <AvgLine y={averages.calories} />
                                    <Bar dataKey="calories" name="Calories" formatter={(v) => `${num(v)} kcal`} fill={C.primary} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                                </ComposedChart>
                            }
                        />
                        <ChartCard
                            title="Protein"
                            empty={!hasAny('protein')}
                            onExpand={openChart}
                            chart={macroChart('protein', 'goalProtein', 'Protein', C.blue)}
                        />
                        <ChartCard
                            title="Carbs"
                            empty={!hasAny('carbs')}
                            onExpand={openChart}
                            chart={macroChart('carbs', 'goalCarbs', 'Carbs', C.purple)}
                        />
                        <ChartCard
                            title="Fat"
                            empty={!hasAny('fat')}
                            onExpand={openChart}
                            chart={macroChart('fat', 'goalFat', 'Fat', C.amber)}
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
                                    <GoalSegments points={chartData} dataKey="goalWater" stroke={C.cyan} />
                                    <AvgLine y={averages.water} stroke={C.cyan} />
                                    <Bar dataKey="water" name="Water" formatter={(v) => `${num(v)} ml`} fill={C.cyan} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
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
                                    <ChartY tickCount={5} allowDecimals tickFormatter={(v) => num(v, 1)} />
                                    <ChartTip />
                                    {targetWeight != null && <ReferenceLine y={targetWeight} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} label="Target" />}
                                    <AvgLine y={averages.weight} />
                                    <Line type="monotone" dataKey="weight" name="Weight" formatter={(v) => `${num(v, 2)} kg`} stroke={C.primary} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
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
                                    <ChartY tickCount={5} allowDecimals tickFormatter={(v) => `${num(v, 1)}%`} />
                                    <ChartTip />
                                    {targetBodyFat != null && <ReferenceLine y={targetBodyFat} stroke={C.primary} strokeDasharray="4 4" strokeOpacity={0.5} label="Target" />}
                                    <AvgLine y={averages.bodyFat} stroke={C.pink} />
                                    <Line type="monotone" dataKey="bodyFat" name="Body Fat" formatter={(v) => `${num(v)}%`} stroke={C.pink} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
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
                                    <ChartY domain={[0, 10]} ticks={TICKS.rating0to10} />
                                    <ChartTip />
                                    <AvgLine y={averages.mood} stroke={C.purple} />
                                    <Line type="monotone" dataKey="mood" name="Mood" formatter={(v) => `${num(v)}/10`} stroke={C.purple} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
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
                                    <defs>
                                        <linearGradient id="habitFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={C.greenDark} stopOpacity={0.3} />
                                            <stop offset="100%" stopColor={C.greenDark} stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <ChartGrid />
                                    <ChartX />
                                    <ChartY domain={[0, 100]} ticks={TICKS.percent} />
                                    <ChartTip />
                                    <AvgLine y={averages.habitPct} stroke={C.greenDark} />
                                    <Area type="monotone" dataKey="habitPct" name="Done %" formatter={(v) => `${num(v)}%`} stroke={C.greenDark} strokeWidth={2.5} fill="url(#habitFill)" dot={false} connectNulls isAnimationActive={false} />
                                </AreaChart>
                            }
                        />
                    </div>
                    {/* Full width: habit names are long, and a 2-up column forced
                        them onto two lines. */}
                    <div className="metrics-columns metrics-columns--single">
                        <ChartCard
                            title="Custom Habit Completion"
                            fullWidth
                            empty={customHabitData.length === 0}
                            height={habitChartHeight}
                            expandHeight={habitExpandHeight}
                            onExpand={openChart}
                            chart={
                                <BarChart data={customHabitData} layout="vertical" margin={{ top: 2, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
                                    <XAxis type="number" domain={[0, 100]} ticks={TICKS.percent} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'rgba(255, 255, 255, 0.12)' }} allowDecimals={false} />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        width={180}
                                        tick={{ ...AXIS_TICK, fontSize: 10 }}
                                        tickLine={false}
                                        axisLine={{ stroke: 'rgba(255, 255, 255, 0.12)' }}
                                        interval={0}
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
                                    <Bar dataKey="pct" name="Done %" formatter={(v) => `${num(v)}%`} fill={C.blue} radius={[0, 3, 3, 0]} barSize={14} isAnimationActive={false} />
                                </BarChart>
                            }
                        />
                    </div>
                </div>
            )}

            <ChartModalHost />
        </div>
    );
};

export default MetricsCharts;