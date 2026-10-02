import React, { useState } from 'react';
import type { WorkoutPlanSession } from '../../services/workoutService';
import type { ActivityType } from '../../utils/workoutSets';
import { ACTIVITY_LABELS } from '../../utils/workoutSets';

/**
 * Monday first, because a training week reads Mon..Sun while `Date.getDay()`
 * counts from Sunday. The stored value is the index into the Monday-first list
 * shifted by one, which is the sort of off-by-one that mislabelled the week
 * strip once already.
 */
const WEEKDAYS = [
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
    { value: 0, label: 'Sunday' },
];

const TYPES: ActivityType[] = ['strength', 'cardio', 'mobility'];

interface SessionEditorModalProps {
    /** The session being edited, or null to create one. */
    session: WorkoutPlanSession | null;
    /** Create mode: which day to start on. */
    defaultDay?: number;
    onClose: () => void;
    onSubmit: (input: {
        name: string;
        day_of_week: number;
        activity_type: ActivityType;
        target_duration_minutes?: number | null;
        target_intensity?: number | null;
    }) => void;
    busy?: boolean;
}

/**
 * Create or edit a session -- one whole workout on one day.
 *
 * `target_intensity` is what the session is *meant* to feel like, not what it
 * turned out to be: 1-10, set here, and compared against the intensity recorded
 * on the day it is actually performed. Nothing is remembered here about a session
 * you have already done, because that comparison belongs to the log.
 *
 * No explanatory prose. Every hint this form used to carry ("what happens when
 * you save", "strength sessions get sets") restated the field next to it, and
 * the dialog is short enough that the fields speak for themselves.
 */
const SessionEditorModal: React.FC<SessionEditorModalProps> = ({
    session,
    defaultDay,
    onClose,
    onSubmit,
    busy = false,
}) => {
    const [name, setName] = useState(session?.name ?? '');
    const [day, setDay] = useState(session?.day_of_week ?? defaultDay ?? 1);
    const [type, setType] = useState<ActivityType>(session?.activity_type ?? 'strength');
    const [duration, setDuration] = useState(
        session?.target_duration_minutes != null ? String(session.target_duration_minutes) : '',
    );
    const [intensity, setIntensity] = useState(session?.target_intensity ?? 5);

    const trimmed = name.trim();
    const valid = trimmed.length > 0;

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!valid) return;
        onSubmit({
            name: trimmed,
            day_of_week: day,
            activity_type: type,
            target_duration_minutes: duration.trim() ? Number(duration) : null,
            target_intensity: intensity,
        });
    };

    const editing = !!session;

    return (
        <div className="import-modal-overlay" onClick={() => { if (!busy) onClose(); }}>
            <div className="import-modal-card" onClick={event => event.stopPropagation()}>
                <h3>{editing ? 'Edit Session' : 'Add Session'}</h3>

                {/* The academic page's editor forms, field for field: `mb-4`
                    between blocks, `grid grid-cols-2 gap-4` for a pair,
                    `flex gap-2 justify-end mt-5` for the actions, and
                    `form-control` on everything. A dialog that measures its own
                    fields looks like it was made somewhere else, and this one is
                    the same kind of thing as "Add course".

                    The intensity slider is the one deliberate departure: it has
                    no Academic equivalent, and it needs the width. */}
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="form-label" htmlFor="session-name">Name</label>
                        <input
                            id="session-name"
                            type="text"
                            className="form-control"
                            value={name}
                            maxLength={60}
                            required
                            autoFocus
                            placeholder="Push / Legs / Upper"
                            onChange={event => setName(event.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="form-label" htmlFor="session-day">Day</label>
                            <select
                                id="session-day"
                                className="form-control"
                                value={day}
                                onChange={event => setDay(Number(event.target.value))}
                            >
                                {WEEKDAYS.map(option => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="form-label" htmlFor="session-type">Type</label>
                            <select
                                id="session-type"
                                className="form-control"
                                value={type}
                                onChange={event => setType(event.target.value as ActivityType)}
                            >
                                {TYPES.map(option => (
                                    <option key={option} value={option}>{ACTIVITY_LABELS[option]}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="form-label" htmlFor="session-duration">
                            Duration (min) <span className="form-label__optional">optional</span>
                        </label>
                        <input
                            id="session-duration"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={5}
                            className="form-control"
                            value={duration}
                            placeholder="45"
                            onChange={event => setDuration(event.target.value)}
                        />
                    </div>

                    {/* The number is always on screen. A bare slider cannot tell
                        you whether you set 4 or 7, and this asks you to imagine
                        an effort rather than recall one. */}
                    <div className="mb-4">
                        <div className="intensity-head">
                            <label className="form-label" htmlFor="session-intensity">Target intensity</label>
                            <output className="intensity-readout" htmlFor="session-intensity">
                                {intensity}
                                <span>/10</span>
                            </output>
                        </div>
                        <input
                            id="session-intensity"
                            type="range"
                            className="intensity-slider"
                            min={1}
                            max={10}
                            step={1}
                            value={intensity}
                            onChange={event => setIntensity(Number(event.target.value))}
                        />
                        <div className="intensity-scale" aria-hidden="true">
                            <span>easy</span>
                            <span>all out</span>
                        </div>
                    </div>

                    {/* No Delete here, for the same reason the academic editors
                        have none: deleting is a destructive act and belongs on
                        the thing that owns it -- the session card's trash icon,
                        behind a confirmation. */}
                    <div className="flex gap-2 justify-end mt-5">
                        <button type="button" className="btn-form-cancel" onClick={onClose} disabled={busy}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-form-submit" disabled={busy || !valid}>
                            {busy ? 'Saving...' : editing ? 'Update' : 'Add'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SessionEditorModal;