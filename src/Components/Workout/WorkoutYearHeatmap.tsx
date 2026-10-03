import React, { useEffect, useMemo, useState } from 'react';
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
    /** Open under the cell, when there is no room above it. */
    below: boolean;
}

/** Half the tooltip's maximum width, for keeping it inside the viewport. */
const TIP_HALF_WIDTH = 120;

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

    /* One shared tooltip rather than one per cell: 371 invisible nodes would be
       paid for every render. It is positioned at the hovered cell in viewport
       coordinates -- fixed-position escapes every overflow clipping ancestor --
       clamped so the edge weeks cannot push it offscreen, and flipped under the
       cell when the grid is near the top of the window. */
    const showTip = (cell: HeatCell, event: React.MouseEvent<HTMLElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        const nearTop = rect.top < 180;
        setTip({
            cell,
            left: Math.min(Math.max(center, TIP_HALF_WIDTH), window.innerWidth - TIP_HALF_WIDTH),
            top: nearTop ? rect.bottom : rect.top,
            below: nearTop,
        });
    };

    // Scrolling with the pointer parked on a cell would leave the tooltip
    // anchored where the cell used to be, so any scroll retires it.
    useEffect(() => {
        if (!tip) return;
        const hide = () => setTip(null);
        window.addEventListener('scroll', hide, true);
        return () => window.removeEventListener('scroll', hide, true);
    }, [tip]);

    return (
        <div className="workout-heat">
            <div className="workout-heat__scroll">
                <div className="workout-heat__body">
                    <div className="workout-heat__days" aria-hidden="true">
                        {DAY_ROWS.map((label, index) => (
                            <span className="workout-heat__day" key={index}>{label}</span>
                        ))}
                    </div>

                    <div
                        className="workout-heat__weeks"
                        style={{ opacity: isLoading ? 0.4 : 1, transition: 'opacity .2s ease' }}
                        role="grid"
                        aria-label="Training activity by day"
                        onMouseLeave={() => setTip(null)}
                    >
                        {weeks.map((week, weekIndex) => (
                            <div className="workout-heat__week" role="row" key={weekIndex}>
                                {week.cells.map(cell => (
                                    <span
                                        key={cell.date}
                                        role="gridcell"
                                        className={[
                                            'workout-heat__cell',
                                            `workout-heat__cell--${LEVEL_FOR(cell.level)}`,
                                            cell.isToday ? 'workout-heat__cell--today' : '',
                                            cell.isFuture ? 'workout-heat__cell--future' : '',
                                        ].filter(Boolean).join(' ')}
                                        onMouseEnter={event => showTip(cell, event)}
                                        aria-label={`${formatDayLabel(cell.date)}, ${cell.level > 0
                                            ? `trained at intensity ${cell.record?.intensity ?? 'unknown'}`
                                            : 'rest day'}`}
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
                    className={`workout-heat__tip${tip.below ? ' workout-heat__tip--below' : ''}`}
                    style={{ left: tip.left, top: tip.top }}
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
                                {dayFacts(tip.cell, weightUnit).join(' · ')}
                            </span>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default WorkoutYearHeatmap;