import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Undo2, Dumbbell } from 'lucide-react';
import { LEVEL_FOR, HEAT_LEVEL_LABELS, levelForIntensity } from '../../utils/workoutSets';
import type { HeatWeek } from '../../utils/workoutStats';
import { formatWeight, type WeightUnit } from '../../utils/units';
import { formatDayLabel } from '../../utils/dates';

interface WorkoutYearHeatmapProps {
    weeks: HeatWeek[];
    onToggleDay: (date: string, currentlyTrained: boolean) => void;
    onSetIntensity?: (date: string, intensity: number) => void;
    weightUnit?: WeightUnit;
    isSaving?: boolean;
    isLoading?: boolean;
}

/** Only alternate weekday labels get text, matching the grid's visual rhythm. */
const DAY_ROWS = ['Sun', '', 'Tue', '', 'Thu', '', 'Sat'];

/**
 * A year of training as a git-contribution grid.
 *
 * One square per day, 53 columns of 7, Sunday-first so the rows are weekdays.
 * The shade is the session's self-reported intensity bucketed into five steps,
 * all derived from --color-primary so it follows whatever accent the app wears
 * rather than being a second, fixed green.
 *
 * A day with a session always has a visible square even when no intensity was
 * typed, so "trained" is never confused with "trained hard" and neither is
 * confused with "did nothing".
 */
const WorkoutYearHeatmap: React.FC<WorkoutYearHeatmapProps> = ({
    weeks,
    onToggleDay,
    onSetIntensity,
    weightUnit = 'kg',
    isSaving = false,
    isLoading = false,
}) => {
    const [openDate, setOpenDate] = useState<string | null>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!openDate) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpenDate(null);
        };
        const onPointer = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setOpenDate(null);
            }
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onPointer);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onPointer);
        };
    }, [openDate]);

    const active = useMemo(
        () => (openDate ? weeks.flatMap(week => week.cells).find(cell => cell.date === openDate) : undefined),
        [openDate, weeks],
    );

    const trained = useMemo(
        () => weeks.reduce((total, week) => total + week.cells.reduce((n, cell) => n + (cell.level > 0 ? 1 : 0), 0), 0),
        [weeks],
    );

    const activate = useCallback((date: string, isFuture: boolean) => {
        // A day in the future is not a mistake to correct; it is a plan.
        if (isFuture) return;
        setOpenDate(current => (current === date ? null : date));
    }, []);

    return (
        <div className="workout-heat">
            <div className="workout-heat__scroll">
                <div className="workout-heat__months" aria-hidden="true">
                    {weeks.map((week, index) => (
                        <span className="workout-heat__month" key={index}>{week.label ?? ''}</span>
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
                        style={{ opacity: isLoading ? 0.4 : 1, transition: 'opacity .2s ease' }}
                        role="grid"
                        aria-label="Training activity by day"
                    >
                        {weeks.map((week, weekIndex) => (
                            <div className="workout-heat__week" role="row" key={weekIndex}>
                                {week.cells.map(cell => (
                                    <button
                                        key={cell.date}
                                        type="button"
                                        role="gridcell"
                                        className={[
                                            'workout-heat__cell',
                                            `workout-heat__cell--${LEVEL_FOR(cell.level)}`,
                                            cell.isToday ? 'workout-heat__cell--today' : '',
                                            cell.isFuture ? 'workout-heat__cell--future' : '',
                                            openDate === cell.date ? 'workout-heat__cell--open' : '',
                                        ].filter(Boolean).join(' ')}
                                        disabled={cell.isFuture || isSaving}
                                        title={`${formatDayLabel(cell.date)} — ${cell.level > 0 ? 'trained' : 'rest'}`}
                                        aria-label={`${formatDayLabel(cell.date)}, ${cell.level > 0
                                            ? `trained at intensity ${cell.record?.intensity ?? 'unknown'}`
                                            : 'rest day'}`}
                                        onClick={() => activate(cell.date, cell.isFuture)}
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

            {active && (
                <div
                    className="workout-heat-popover"
                    ref={popoverRef}
                    role="dialog"
                    aria-label={`Edit ${formatDayLabel(active.date)}`}
                >
                    <div className="workout-heat-popover__title">
                        <span>{formatDayLabel(active.date)}</span>
                        {active.isToday && <span className="workout-chip">today</span>}
                    </div>

                    {active.level > 0 && active.record ? (
                        <div className="workout-heat-popover__facts">
                            <span>
                                {active.record.exerciseCount}{' '}
                                {active.record.exerciseCount === 1 ? 'exercise' : 'exercises'}
                            </span>
                            {active.record.volumeKg > 0 && (
                                <span>{formatWeight(active.record.volumeKg, weightUnit, 0)} moved</span>
                            )}
                            {active.record.durationMinutes ? <span>{active.record.durationMinutes} min</span> : null}
                        </div>
                    ) : (
                        <p className="workout-heat-popover__note">Nothing logged for this day.</p>
                    )}

                    {onSetIntensity && (
                        <IntensityControl
                            date={active.date}
                            initial={active.record?.intensity ?? 5}
                            disabled={active.isFuture || isSaving}
                            onCommit={value => onSetIntensity(active.date, value)}
                        />
                    )}

                    <div className="workout-heat-popover__actions">
                        <button
                            type="button"
                            className="btn-action btn-action--primary"
                            disabled={isSaving}
                            onClick={() => {
                                onToggleDay(active.date, active.level > 0);
                                setOpenDate(null);
                            }}
                        >
                            {active.level > 0
                                ? <><Undo2 size={11} className="mr-1" />Remove</>
                                : <><Dumbbell size={11} className="mr-1" />Mark trained</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorkoutYearHeatmap;

/**
 * The intensity slider, committed on release rather than on every movement.
 *
 * A range input fires change continuously while dragging, so committing
 * directly turned one drag across the track into up to nine writes, each
 * invalidating the overview and refetching a year of sessions. The timer
 * collapses that into one write per pause.
 */
const IntensityControl: React.FC<{
    date: string;
    initial: number;
    disabled: boolean;
    onCommit: (value: number) => void;
}> = ({ date, initial, disabled, onCommit }) => {
    // Keyed on the day and the value the server holds, so moving the popover to
    // another day re-seeds during render rather than in an effect that would
    // briefly show the previous day's intensity.
    const source = `${date}:${initial}`;
    const [state, setState] = useState({ for: source, value: initial, committed: initial });

    const stale = state.for !== source;
    const value = stale ? initial : state.value;
    const committed = stale ? initial : state.committed;

    useEffect(() => {
        if (value === committed || disabled) return;
        const timer = setTimeout(() => {
            setState(current => ({ ...current, value, committed: value }));
            onCommit(value);
        }, 500);
        return () => clearTimeout(timer);
    }, [value, committed, disabled, onCommit]);

    return (
        <div className="workout-heat-popover__field">
            <label className="form-label" htmlFor={`heat-intensity-${date}`}>
                <Flame size={11} />Intensity — {HEAT_LEVEL_LABELS[levelForIntensity(value) + 1]}
            </label>
            <input
                id={`heat-intensity-${date}`}
                type="range"
                min={1}
                max={10}
                value={value}
                disabled={disabled}
                style={{ width: '100%', accentColor: 'var(--color-primary)' }}
                onChange={event => setState(current => ({ ...current, value: Number(event.target.value) }))}
            />
        </div>
    );
};