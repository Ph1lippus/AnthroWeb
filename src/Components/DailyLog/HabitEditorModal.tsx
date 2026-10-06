import React, { useState } from 'react';
import type { Habit } from '../../services/habitService';

interface HabitEditorModalProps {
    /** The habit being edited. Null means nothing is open. */
    habit: Habit | null;
    busy?: boolean;
    /** Set when the last save was refused, e.g. the name is already taken. */
    error?: string | null;
    onClose: () => void;
    onSave: (updates: { name: string; description: string | null }) => void;
}

/**
 * Rename a custom habit, or say what it is for.
 *
 * Both fields, because a habit's description is the one place to write what it
 * means, and the quick route into a rename -- double-clicking the name in the
 * list -- can only edit the name without a dialog in the way. So this is the full
 * edit, and the list keeps the one-field version for the one-word change.
 *
 * A `form`, so Enter submits from the name field and Escape reaches the dialog
 * through the browser rather than needing a handler. Kept in step with the add
 * form beside it: same fields, same limits, same wording, so the two are
 * recognisably the same thing done twice.
 *
 * Seeded from the habit once, on mount -- the caller unmounts it on close, which
 * is what stops a cancelled edit from reappearing in the fields next time.
 */
const HabitEditorModal: React.FC<HabitEditorModalProps> = ({
    habit,
    busy = false,
    error = null,
    onClose,
    onSave,
}) => {
    const [name, setName] = useState(habit?.name ?? '');
    const [description, setDescription] = useState(habit?.description ?? '');

    if (!habit) return null;

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!name.trim() || busy) return;
        onSave({ name: name.trim(), description: description.trim() || null });
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

                    {/* On the name, because the only thing that can be refused is a
                        name that is already taken -- and that is decided by which
                        field the reader is looking at. */}
                    {error && (
                        <p className="update-modal-error" role="alert">{error}</p>
                    )}

                    {/* Says what renaming does and does not do, because it is the one
                        edit here whose consequence is not obvious: nothing about
                        past days moves. */}
                    <p className="academic-field-hint">
                        Renaming changes the label everywhere from now on. Days already
                        logged keep their ticks.
                    </p>

                    <div className="flex gap-2 justify-end mt-5">
                        <button type="button" className="btn-form-cancel" onClick={onClose} disabled={busy}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-form-submit" disabled={busy || !name.trim()}>
                            {busy ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default HabitEditorModal;