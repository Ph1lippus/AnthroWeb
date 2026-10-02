import React, { useState } from 'react';
import { CalendarCheck, Dumbbell, Trash2 } from 'lucide-react';
import { formatDayLabel, isDateString, todayString } from '../../utils/dates';
import type { DayRecord } from '../../utils/workoutStats';
import { HEAT_LEVEL_LABELS, levelForIntensity } from '../../utils/workoutSets';

interface MarkDayPanelProps {
    days: Map<string, DayRecord>;
    onToggle: (date: string, trained: boolean, intensity: number) => void;
    isSaving?: boolean;
}

/**
 * Mark a day as trained without logging a full session.
 *
 * This is the same write as the daily log's Gym checkbox -- both call
 * setGymForDate -- so the habit chart, the heatmap and the streak cannot
 * disagree about a date. The heatmap's popover is the other door into that same
 * function.
 *
 * The intensity slider picks the heatmap shade, so it defaults to whatever the
 * day already holds and only commits when Mark or Remove is pressed. One write
 * per click rather than one per pixel of dragging.
 */
const MarkDayPanel: React.FC<MarkDayPanelProps> = ({ days, onToggle, isSaving = false }) => {
    const [date, setDate] = useState(todayString());

    // Keyed on the day so switching dates shows the right figure without an
    // effect that would re-render on every keystroke of the slider.
    const [picked, setPicked] = useState<{ date: string; value: number } | null>(null);

    const record = days.get(date);
    const trained = record?.completed === true;
    const intensity = picked?.date === date ? picked.value : record?.intensity ?? 5;
    const valid = isDateString(date);
    const isFuture = valid && date > todayString();

    return (
        <div className="card">
            <div className="card-header">
                <h3 className="card-title"><CalendarCheck size={12} />Mark a day</h3>
            </div>
            <div className="card-body">
                <form
                    className="form-group"
                    onSubmit={event => {
                        event.preventDefault();
                        if (!valid || isFuture) return;
                        onToggle(date, !trained, intensity);
                    }}
                >
                    <label className="form-label" htmlFor="mark-date">Date</label>
                    <input
                        id="mark-date"
                        type="date"
                        className="form-control"
                        value={date}
                        max={todayString()}
                        onChange={event => setDate(event.target.value)}
                    />

                    <label className="form-label" htmlFor="mark-intensity">
                        Intensity — {HEAT_LEVEL_LABELS[levelForIntensity(intensity) + 1]}
                    </label>
                    <input
                        id="mark-intensity"
                        type="range"
                        min={1}
                        max={10}
                        value={intensity}
                        disabled={isSaving || !valid}
                        onChange={event => setPicked({ date, value: Number(event.target.value) })}
                        style={{ width: '100%', accentColor: 'var(--color-primary)' }}
                    />

                    <div className="workout-ex__actions">
                        {trained && (
                            <a
                                className="btn-action"
                                href={`/Workouts?day=${date}`}
                                aria-label="Open this session to add detail"
                            >
                                <Dumbbell size={11} />Detail
                            </a>
                        )}
                        <button
                            type="submit"
                            className={`btn-action ${trained ? '' : 'btn-action--primary'}`}
                            disabled={isSaving || !valid || isFuture}
                        >
                            {trained
                                ? <><Trash2 size={11} />Remove</>
                                : <><Dumbbell size={11} />Mark as trained</>}
                        </button>
                    </div>
                </form>

                {trained && (
                    <p className="form-label" style={{ marginTop: '0.5rem', opacity: 0.55 }}>
                        {formatDayLabel(date)} is marked. Adding what you did changes this day
                        only — the template stays as it is.
                    </p>
                )}
            </div>
        </div>
    );
};

export default MarkDayPanel;