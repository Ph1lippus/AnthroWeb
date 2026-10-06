import React, { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { LEVEL_FOR } from '../../utils/workoutSets';
import type { HeatCell, HeatWeek } from '../../utils/workoutStats';
import { formatWeight, type WeightUnit } from '../../utils/units';
import { formatDayLabel } from '../../utils/dates';

interface WorkoutYearHeatmapProps {
    weeks: HeatWeek[];
    weightUnit?: WeightUnit;
    isLoading?: boolean;
}

/**
 * Every weekday is labelled. This alternated before -- Sunday, Tuesday, Thursday,
 * Saturday only -- on the reasoning that it matched the grid's visual rhythm, but
 * it meant the row you had to identify was the row you could not identify, and
 * the labels are `aria-hidden` decoration anyway, so the cost was real and the
 * benefit was not. Sunday-first, because that is what `Date.getDay()` counts.
 */
const DAY_ROWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* Cell sizing. The square is a fixed size and the row spreads its columns with
   `space-between`, which is what makes the grid use the whole card without the
   squares growing: leftover width becomes air between the columns rather than
   fatter days. The cap is what stops that from turning into a sparse dot grid on
   a very wide card, and the floor is what stops a square becoming a dot. */
const CELL_MIN = 5;
const CELL_MAX = 12;
/** The weekday column plus the gap after it, matching `.workout-heat__body`. */
const DAY_COL_PX = 36;
/** `--heat-gap`. The tightest the row can be; `space-between` only widens it. */
const GAP_PX = 2;

/**
 * A year of training as a git-contribution grid.
 *
 * One square per day, 53 columns of 7, Sunday-first so the rows are weekdays.
 * The shade is the session's self-reported intensity bucketed into five steps,
 * all derived from --color-primary so it follows whatever accent the app wears
 * rather than being a second, fixed green.
 *
 * The grid is read-only. Hovering a square shows a styled tooltip of what the
 * day held -- the plan session's name when the day followed a named one,
 * exercises, sets, volume, duration, intensity -- and nothing here writes.
 * This replaces a click-popover with an intensity slider: a slider living
 * under the year meant a drag aimed at the calendar could quietly regrade a
 * past day, and a panel of facts does not need a dialog role. Marking a day
 * trained is the daily log's Gym habit; correcting a weight belongs in the
 * day editor.
 */

/**
 * The tooltip's fact line. Future days read as rest rather than as plans,
 * because a tooltip that says "rest day" about next Tuesday invites
 * correcting a day that has not happened.
 */
const dayFacts = (cell: HeatCell, weightUnit: WeightUnit): string[] => {
    const record = cell.record;
    if (cell.isFuture || cell.level === 0 || !record) return [];
    const facts = [
        `${record.exerciseCount} ${record.exerciseCount === 1 ? 'exercise' : 'exercises'}`,
        `${record.sets ?? 0} sets`,
    ];
    if (record.volumeKg > 0) facts.push(`${formatWeight(record.volumeKg, weightUnit, 0)} moved`);
    if (record.durationMinutes) facts.push(`${record.durationMinutes} min`);
    if (record.intensity != null) facts.push(`intensity ${record.intensity}/10`);
    return facts;
};

/** The tooltip, in viewport coordinates so no ancestor can clip it. */
interface TipState {
    cell: HeatCell;
    left: number;
    top: number;
    maxWidth: number;
}

interface HeatCellViewProps {
    cell: HeatCell;
    onHover: (cell: HeatCell, event: React.MouseEvent<HTMLElement>) => void;
}

const HeatCellView = memo<HeatCellViewProps>(({ cell, onHover }) => (
    <span
        role="gridcell"
        className={[
            'workout-heat__cell',
            `workout-heat__cell--${LEVEL_FOR(cell.level)}`,
            cell.isToday ? 'workout-heat__cell--today' : '',
            cell.isFuture ? 'workout-heat__cell--future' : '',
        ].filter(Boolean).join(' ')}
        onMouseEnter={event => onHover(cell, event)}
        aria-label={`${formatDayLabel(cell.date)}, ${cell.level > 0
            ? `trained at intensity ${cell.record?.intensity ?? 'unknown'}`
            : 'rest day'}`}
    />
));

const WorkoutYearHeatmap: React.FC<WorkoutYearHeatmapProps> = ({
    weeks,
    weightUnit = 'kg',
    isLoading = false,
}) => {
    const trained = useMemo(
        () => weeks.reduce((total, week) => total + week.cells.reduce((n, cell) => n + (cell.level > 0 ? 1 : 0), 0), 0),
        [weeks],
    );

    const [tip, setTip] = useState<TipState | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    /* How many weeks to draw and how big each square is. Solved together, because
       whether the full year fits is a question about the cell size: a 53-column
       row can be drawn at any size, so "does it fit" only has an answer once a
       size is chosen. All 53 whenever they fit at the minimum; on a phone that is
       not possible, so the most recent weeks win and the row scrolls sideways. */
    const [layout, setLayout] = useState(() => ({ weeks: weeks.length, cell: CELL_MIN }));

    useEffect(() => {
        const element = scrollRef.current;
        if (!element || weeks.length === 0) return;

        const solve = () => {
            const width = element.clientWidth;
            const usable = Math.max(0, width - DAY_COL_PX);
            const count = weeks.length;

            /* Whether the year fits is a question about the square, not a count to
               be picked first: 53 columns can be drawn at any size. So the smallest
               square is fixed, the tightest gap is charged against the width, and
               whatever is left after that is air the grid spreads on its own. */
            const fitAll = Math.floor((usable - GAP_PX * (count - 1)) / count);
            if (fitAll >= CELL_MIN) {
                setLayout({ weeks: count, cell: Math.min(CELL_MAX, fitAll) });
                return;
            }

            // Not enough room for the year at a legible size. Keep the newest weeks
            // -- the ones being asked about -- at the floor.
            const shownWeeks = Math.max(1, Math.min(count, Math.floor((usable + GAP_PX) / (CELL_MIN + GAP_PX))));
            setLayout({ weeks: shownWeeks, cell: CELL_MIN });
        };

        solve();
        const observer = new ResizeObserver(solve);
        observer.observe(element);
        return () => observer.disconnect();
    }, [weeks.length]);

    const shown = useMemo(() => weeks.slice(-layout.weeks), [weeks, layout.weeks]);

    /* One shared tooltip and memoized cells keep hovering local: changing the
       tooltip must not rerender the entire grid. */
    const showTip = useCallback((cell: HeatCell, event: React.MouseEvent<HTMLElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const nextTip = {
            cell,
            left: rect.right + 8,
            top: rect.top + rect.height / 2,
            maxWidth: Math.max(140, window.innerWidth - rect.right - 16),
        };
        setTip(previous => previous?.cell.date === cell.date ? previous : nextTip);
    }, []);

    const hideTip = useCallback(() => setTip(null), []);

    return (
        <div
            className="workout-heat"
            style={{
                '--heat-cell': `${layout.cell}px`,
                '--heat-week-count': layout.weeks,
            } as CSSProperties}
        >
            <div className="workout-heat__scroll" ref={scrollRef}>
                {/* `buildHeatGrid` marks the week a month begins on and nothing ever
                    drew it, so there was no way to tell where the year starts from
                    where it ends. Pinned to the same column pitch as the squares
                    below, so a label sits over the column it belongs to. */}
                <div className="workout-heat__months" aria-hidden="true">
                    {shown.map((week, index) => (
                        <span className="workout-heat__month" key={week.cells[0]?.date ?? index}>
                            {week.label ?? ''}
                        </span>
                    ))}
                </div>

                <div className="workout-heat__body">
                    <div className="workout-heat__days" aria-hidden="true">
                        {DAY_ROWS.map((label, index) => (
                            <span className="workout-heat__day" key={index}>{label}</span>
                        ))}
                    </div>

                    <div
                        className="workout-heat__weeks"
                        style={{
                            opacity: isLoading ? 0.4 : 1,
                            transition: 'opacity .2s ease',
                        }}
                        role="grid"
                        aria-label="Training activity by day"
                        onMouseLeave={hideTip}
                    >
                        {shown.map((week, weekIndex) => (
                            <div className="workout-heat__week" role="row" key={weekIndex}>
                                {week.cells.map(cell => (
                                    <HeatCellView
                                        key={cell.date}
                                        cell={cell}
                                        onHover={showTip}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="workout-heat__legend">
                <span>{trained} trained · less</span>
                {[0, 1, 2, 3, 4, 5].map(level => (
                    <span
                        key={level}
                        className={`workout-heat__legend-cell workout-heat__cell--${LEVEL_FOR(level)}`}
                    />
                ))}
                <span>more</span>
            </div>

            {tip && (
                <div
                    className="workout-heat__tip"
                    style={{ left: tip.left, top: tip.top, maxWidth: tip.maxWidth }}
                    aria-hidden="true"
                >
                    <span className="workout-heat__tip-date">{formatDayLabel(tip.cell.date)}</span>
                    {tip.cell.isFuture || tip.cell.level === 0 || !tip.cell.record ? (
                        <span className="workout-heat__tip-rest">rest day</span>
                    ) : (
                        <>
                            {tip.cell.record.name && (
                                <span className="workout-heat__tip-name">{tip.cell.record.name}</span>
                            )}
                            <span className="workout-heat__tip-facts">
                                {dayFacts(tip.cell, weightUnit).map(fact => (
                                    <span key={fact}>{fact}</span>
                                ))}
                            </span>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default WorkoutYearHeatmap;