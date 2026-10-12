import React, { useState } from 'react';
import { Plus, Save, SquarePen, Trash2, X } from 'lucide-react';
import { formatHumanDuration } from '../../utils/timerMath';
import type { NormalizedPreset } from '../../services/timerService';

interface PresetPanelProps {
    presets: NormalizedPreset[];
    onCreate: (preset: Omit<NormalizedPreset, 'id'>) => void;
    onUpdate: (id: string, preset: Omit<NormalizedPreset, 'id'>) => void;
    onDelete: (id: string) => void;
    /** Tapping a preset loads it into the display. */
    onUse: (preset: NormalizedPreset) => void;
    busy: boolean;
}

/** Seconds -> the `HH:MM:SS` a text field shows. */
const toInput = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/** `HH:MM:SS` -> seconds, digits only so a stray character cannot reach the DB. */
function parseInput(raw: string): number {
    const parts = raw.split(':').map(part => parseInt(part.replace(/\D/g, ''), 10) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

/**
 * Saved durations and interval shapes.
 *
 * A "preset" here is purely a way to avoid retyping a number, so the list is
 * ordered and short by design rather than a library. The row reuses the app's
 * `.course-row` treatment so it is visually the same kind of object as every
 * other list in the app.
 *
 * The editor is inline in the block rather than a modal. It is two fields, and a
 * modal for two fields is more clicks than the thing is worth -- the same
 * reasoning as the Daily Log's inline habit rows against its larger editors.
 */
const PresetPanel: React.FC<PresetPanelProps> = ({
    presets, onCreate, onUpdate, onDelete, onUse, busy,
}) => {
    const [adding, setAdding] = useState(false);
    const [label, setLabel] = useState('');
    const [duration, setDuration] = useState('25:00');

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');
    const [editDuration, setEditDuration] = useState('25:00');

    const submitAdd = () => {
        const seconds = parseInput(duration);
        if (seconds <= 0) return;
        onCreate({
            // Falls back to the duration itself. A preset called "25:00" is less
            // useful than one called "Focus", but it is never wrong, whereas an
            // empty name is not a thing the list can render.
            label: label.trim() || toInput(seconds),
            kind: 'countdown',
            durationMs: seconds * 1000,
            config: { workSec: seconds, restSec: 300, longRestSec: 900, roundsBeforeLong: 4, totalRounds: 4 },
        });
        setLabel('');
        setDuration('25:00');
        setAdding(false);
    };

    const submitEdit = (id: string) => {
        const seconds = parseInput(editDuration);
        const existing = presets.find(p => p.id === id);
        if (!existing) return;
        onUpdate(id, {
            label: editLabel.trim() || toInput(seconds),
            kind: existing.kind,
            durationMs: seconds * 1000,
            config: existing.config,
        });
        setEditingId(null);
    };

    return (
        <div className="timer-block">
            <div className="timer-block__head">
                <h3 className="timer-block__title">
                    <Save size={14} aria-hidden="true" /> Presets
                </h3>
                <div className="timer-block__actions">
                    <button
                        type="button"
                        className="book-action-btn"
                        onClick={() => setAdding(v => !v)}
                        data-tip={adding ? 'Cancel' : 'Add a preset'}
                        aria-label={adding ? 'Cancel adding a preset' : 'Add a preset'}
                    >
                        {adding ? <X /> : <Plus />}
                    </button>
                </div>
            </div>

            {adding && (
                <div style={{ marginBottom: '0.75rem' }}>
                    <div className="timer-field-grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)' }}>
                        <div className="timer-field">
                            <label className="form-label" htmlFor="preset-label">Name</label>
                            <input
                                id="preset-label"
                                className="form-control"
                                value={label}
                                placeholder="Focus"
                                maxLength={40}
                                onChange={event => setLabel(event.target.value)}
                            />
                        </div>
                        <div className="timer-field">
                            <label className="form-label" htmlFor="preset-duration">Length</label>
                            <input
                                id="preset-duration"
                                className="form-control"
                                value={duration}
                                inputMode="numeric"
                                placeholder="25:00"
                                onChange={event => setDuration(event.target.value.replace(/[^\d:]/g, '').slice(0, 8))}
                            />
                        </div>
                    </div>
                    <div className="timer-controls" style={{ justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                        <button type="button" className="btn-form-cancel" onClick={() => setAdding(false)}>
                            Cancel
                        </button>
                        <button type="button" className="btn-form-submit" onClick={submitAdd} disabled={busy}>
                            Save
                        </button>
                    </div>
                </div>
            )}

            {presets.length === 0 && !adding ? (
                <p className="timer-empty-hint">
                    No presets yet. Anything you time more than once is worth saving.
                </p>
            ) : (
                presets.map(preset => (
                    <div key={preset.id} className="course-row" style={{ marginBottom: '0.4rem' }}>
                        {editingId === preset.id ? (
                            <>
                                <div className="timer-field-grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)' }}>
                                    <div className="timer-field">
                                        <label className="form-label" htmlFor={`preset-label-${preset.id}`}>Name</label>
                                        <input
                                            id={`preset-label-${preset.id}`}
                                            className="form-control"
                                            value={editLabel}
                                            maxLength={40}
                                            onChange={event => setEditLabel(event.target.value)}
                                        />
                                    </div>
                                    <div className="timer-field">
                                        <label className="form-label" htmlFor={`preset-duration-${preset.id}`}>Length</label>
                                        <input
                                            id={`preset-duration-${preset.id}`}
                                            className="form-control"
                                            value={editDuration}
                                            inputMode="numeric"
                                            onChange={event => setEditDuration(event.target.value.replace(/[^\d:]/g, '').slice(0, 8))}
                                        />
                                    </div>
                                </div>
                                <div className="timer-controls" style={{ justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                    <button type="button" className="btn-form-cancel" onClick={() => setEditingId(null)}>
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-form-submit"
                                        onClick={() => submitEdit(preset.id)}
                                        disabled={busy}
                                    >
                                        Save
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="course-head">
                                <div className="course-head__text">
                                    <span className="course-title">{preset.label}</span>
                                    <span className="course-sub">
                                        <span>{preset.kind === 'interval' ? 'Interval' : 'Countdown'}</span>
                                        <span>· {formatHumanDuration(preset.durationMs)}</span>
                                    </span>
                                </div>
                                <div className="course-scores">
                                    <button
                                        type="button"
                                        className="btn-action"
                                        onClick={() => onUse(preset)}
                                        data-tip="Load into the timer"
                                    >
                                        Use
                                    </button>
                                    <span className="flex gap-1">
                                        <button
                                            type="button"
                                            className="book-action-btn"
                                            onClick={() => {
                                                setEditingId(preset.id);
                                                setEditLabel(preset.label);
                                                setEditDuration(toInput(Math.round(preset.durationMs / 1000)));
                                            }}
                                            data-tip="Edit preset"
                                            aria-label={`Edit ${preset.label}`}
                                        >
                                            <SquarePen />
                                        </button>
                                        <button
                                            type="button"
                                            className="book-action-btn book-action-btn--danger"
                                            onClick={() => onDelete(preset.id)}
                                            data-tip="Delete preset"
                                            aria-label={`Delete ${preset.label}`}
                                        >
                                            <Trash2 />
                                        </button>
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    );
};

export default PresetPanel;