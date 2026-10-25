import React, { useState } from 'react';

/**
 * A habit as the editor sees it. Custom habits arrive as `Habit` rows; built-in
 * habits arrive as an override-shaped object, because they have no row of their
 * own to write to.
 */
export interface HabitEditorValue {
    id?: string | null;
    /** True for the habits that ship with the app (Gym, Reading, ...). */
    builtIn?: boolean;
    /** The stable key an override is stored under. Built-ins only. */
    builtInKey?: string | null;
    name: string;
    description?: string | null;
    priority?: 'high' | 'medium' | 'low';
    schedule_days?: number[] | null;
    is_negative?: boolean | null;
}

export interface HabitEditorUpdates {
    name: string;
    description: string | null;
    priority: 'high' | 'medium' | 'low';
    is_negative: boolean;
    schedule_days: number[] | null;
}

interface HabitEditorModalProps {
    /** The habit being edited. Null means nothing is open. */
    habit: HabitEditorValue | null;
    busy?: boolean;
    /** Set when the last save was refused, e.g. the name is already taken. */
    error?: string | null;
    onClose: () => void;
    onSave: (updates: HabitEditorUpdates) => void;
    /**
     * Removes a custom habit. Built-ins have no row to remove, so the button is
     * not drawn for them. The confirmation still happens in the page's shared
     * `ConfirmModal`; this only asks for it.
     */
    onDelete?: () => void;
}

/**
 * The one editor for every habit on the Daily Log.
 *
 * Custom habits and built-ins are different storage -- a `habits` row versus an
 * override in `user_settings.habit_settings` -- but they are the same thing to
 * the reader: a checkbox with a name, a description, a priority, a schedule and
 * a polarity. Keeping one form for both is what stops the built-ins becoming a
 * second-class set of rows that can only be prioritised from a menu.
 *
 * A `form`, so Enter submits from the name field and Escape reaches the dialog
 * through the browser rather than needing a handler. Seeded from the habit once,
 * on mount -- the caller unmounts it on close, which is what stops a cancelled
 * edit from reappearing in the fields next time.
 */
const HabitEditorModal: React.FC<HabitEditorModalProps> = ({
    habit,
    busy = false,
    error = null,
    onClose,
    onSave,
    onDelete,
}) => {
    const [name, setName] = useState(habit?.name ?? '');
    const [description, setDescription] = useState(habit?.description ?? '');
    const [priority, setPriority] = useState<'high' | 'medium' | 'low'>(habit?.priority ?? 'medium');
    const [negative, setNegative] = useState<boolean>(habit?.is_negative ?? false);
    const [schedule, setSchedule] = useState<number[]>(habit?.schedule_days ?? [0, 1, 2, 3, 4, 5, 6]);

    if (!habit) return null;

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!name.trim() || busy) return;
        onSave({
            name: name.trim(),
            description: description.trim() || null,
            priority,
            is_negative: negative,
            schedule_days: schedule.length === 7 ? null : schedule,
        });
    };

    return (
        <div className="import-modal-overlay" onClick={() => { if (!busy) onClose(); }}>
            <div
                className="import-modal-card edit-modal-card"
                role="dialog"
                aria-modal="true"
                aria-label="Edit habit"
                onClick={event => event.stopPropagation()}
            >
                <h3>Edit habit</h3>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="form-label" htmlFor="habit-name">Name</label>
                        <input
                            id="habit-name"
                            type="text"
                            value={name}
                            onChange={event => setName(event.target.value)}
                            className="form-control"
                            placeholder="Habit name"
                            maxLength={50}
                            required
                            autoFocus
                        />
                    </div>

                    <div className="mb-4">
                        <label className="form-label" htmlFor="habit-description">
                            Description <span className="form-label__optional">optional</span>
                        </label>
                        <textarea
                            id="habit-description"
                            value={description}
                            onChange={event => setDescription(event.target.value)}
                            className="form-control"
                            rows={2}
                            maxLength={100}
                            placeholder="What this habit is, or when"
                        />
                    </div>

                    <div className="mb-4">
                        <label className="form-label" htmlFor="habit-priority">Priority</label>
                        <select
                            id="habit-priority"
                            value={priority}
                            onChange={event => setPriority(event.target.value as 'high' | 'medium' | 'low')}
                            className="form-control"
                        >
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>
                    </div>

                    <div className="mb-4">
                        <label className="checkbox-label">
                            <input type="checkbox" checked={negative} onChange={event => setNegative(event.target.checked)} className="checkbox-input" />
                            <span className="text-sm">Negative habit (avoid it)</span>
                        </label>
                    </div>

                    <div className="mb-4">
                        <label className="form-label">Schedule days</label>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                                <label key={d} className="checkbox-label" style={{ fontSize: '0.75rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={schedule.includes(i)}
                                        onChange={event => {
                                            setSchedule(prev =>
                                                event.target.checked ? [...prev, i] : prev.filter(x => x !== i)
                                            );
                                        }}
                                        className="checkbox-input"
                                    />
                                    {d}
                                </label>
                            ))}
                        </div>
                        <p className="academic-field-hint">
                            Off-schedule habits still appear on the log; they just do not count
                            towards the habit score on those days.
                        </p>
                    </div>

                    {/* On the name, because the only thing that can be refused is a
                        name that is already taken -- and that is decided by which
                        field the reader is looking at. */}
                    {error && (
                        <p className="update-modal-error" role="alert">{error}</p>
                    )}

                    <p className="academic-field-hint">
                        {habit.builtIn
                            ? 'This changes the built-in habit everywhere from now on. Days already logged keep their ticks.'
                            : 'Renaming changes the label everywhere from now on. Days already logged keep their ticks.'}
                    </p>

                    <div className="flex gap-2 justify-between items-center mt-5">
                        {!habit.builtIn && onDelete ? (
                            <button
                                type="button"
                                className="btn-form-cancel habit-editor-remove"
                                onClick={onDelete}
                                disabled={busy}
                            >
                                Remove habit
                            </button>
                        ) : <span />}
                        <div className="flex gap-2">
                            <button type="button" className="btn-form-cancel" onClick={onClose} disabled={busy}>
                                Cancel
                            </button>
                            <button type="submit" className="btn-form-submit" disabled={busy || !name.trim()}>
                                {busy ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default HabitEditorModal;
