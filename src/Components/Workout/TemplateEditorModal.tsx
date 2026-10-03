import React, { useState } from 'react';
import { Target } from 'lucide-react';
import type { WorkoutTemplate } from '../../services/workoutService';

interface TemplateEditorModalProps {
    /** Null to create, the template to rename. */
    template: WorkoutTemplate | null;
    onClose: () => void;
    onSubmit: (input: { name: string; description?: string }) => void;
    onDelete?: () => void;
    onDuplicate?: () => void;
    onSetActive?: () => void;
    /** Add every exercise in this template to the records list. */
    onTrackAsPRs?: () => void;
    busy?: boolean;
    /** Exercises in the template, so the dialog can say what will be affected. */
    exerciseCount?: number;
}

/**
 * Create or rename a template, in the same dialog the academic page uses for a
 * semester or a course.
 *
 * It is a modal rather than an inline form for the reason every other editor in
 * the app is one: the thing being edited is the thing the page is organised
 * around, and covering it briefly to name it beats replacing the page with two
 * inputs and a Cancel.
 *
 * Deleting from here rather than from the template's own card, because this is
 * the dialog that knows what a template is -- how many exercises it holds, and
 * the fact that removing it leaves every workout already logged intact.
 */
const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({
    template,
    onClose,
    onSubmit,
    onDelete,
    onDuplicate,
    onSetActive,
    onTrackAsPRs,
    busy = false,
    exerciseCount = 0,
}) => {
    const [name, setName] = useState(template?.name ?? '');
    const [description, setDescription] = useState(template?.description ?? '');

    const trimmed = name.trim();
    const valid = trimmed.length > 0;

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!valid) return;
        onSubmit({ name: trimmed, description: description.trim() || undefined });
    };

    const editing = !!template;

    return (
        <div className="import-modal-overlay" onClick={() => { if (!busy) onClose(); }}>
            <div className="import-modal-card" onClick={event => event.stopPropagation()}>
                <h3>{editing ? 'Edit Template' : 'Add Template'}</h3>

                <form onSubmit={handleSubmit}>
                    <div className="mb-2">
                        <label className="form-label" htmlFor="tpl-modal-name">Name</label>
                        <input
                            id="tpl-modal-name"
                            type="text"
                            className="form-control"
                            value={name}
                            maxLength={60}
                            required
                            autoFocus
                            placeholder="Push / Pull / Legs"
                            onChange={event => setName(event.target.value)}
                        />
                    </div>

                    <div className="mb-2">
                        <label className="form-label">
                            Description <span className="form-label__optional">optional</span>
                        </label>
                        <input
                            type="text"
                            className="form-control"
                            value={description}
                            maxLength={200}
                            placeholder="What this routine is for"
                            onChange={event => setDescription(event.target.value)}
                        />
                    </div>

                    {editing && exerciseCount > 0 && (
                        <p className="academic-field-hint">
                            {exerciseCount} exercise{exerciseCount === 1 ? '' : 's'} this week.
                            {template?.is_active
                                ? ' It is your active template.'
                                : ' Activate it to have days fill themselves in.'}
                        </p>
                    )}

                    {!editing && (
                        <p className="academic-field-hint">
                            A template is a week: each day holds its own exercises, which you add
                            next. Marking a day copies the plan in so you only change what you
                            actually did.
                        </p>
                    )}

                    <div className="flex gap-2 justify-end mt-5">
                        {editing && onTrackAsPRs && exerciseCount > 0 && (
                            <button
                                type="button"
                                className="btn-form-cancel"
                                style={{ marginRight: 'auto' }}
                                onClick={onTrackAsPRs}
                                disabled={busy}
                                title="Add every exercise in this template to your records list"
                            >
                                <Target size={11} className="mr-1" />Track as PRs
                            </button>
                        )}
                        {editing && onSetActive && !template?.is_active && (
                            <button
                                type="button"
                                className="btn-form-cancel"
                                style={{ marginRight: 'auto' }}
                                onClick={onSetActive}
                                disabled={busy}
                            >
                                Set active
                            </button>
                        )}
                        {editing && onDuplicate && (
                            <button
                                type="button"
                                className="btn-form-cancel"
                                onClick={onDuplicate}
                                disabled={busy}
                            >
                                Duplicate
                            </button>
                        )}
                        {editing && onDelete && (
                            <button
                                type="button"
                                className="btn-form-submit btn-form-submit--danger"
                                onClick={onDelete}
                                disabled={busy}
                            >
                                Delete
                            </button>
                        )}
                        <button type="button" className="btn-form-cancel" onClick={onClose} disabled={busy}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-form-submit" disabled={busy || !valid}>
                            {busy ? 'Saving…' : editing ? 'Update' : 'Add'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TemplateEditorModal;