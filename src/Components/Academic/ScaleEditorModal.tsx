import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { GpaBand, GpaScale } from '../../utils/academicGpa';

interface ScaleEditorModalProps {
    /** null creates a new scale. */
    scale: GpaScale | null;
    onClose: () => void;
    onSubmit: (payload: {
        id?: string;
        name: string;
        basis: 'percentage' | 'points';
        max_value: number;
        min_value: number;
        bands: GpaBand[];
    }) => void;
    busy?: boolean;
}

interface BandDraft {
    key: string;
    min_percentage: string;
    points: string;
    letter: string;
}

let draftKey = 0;
const nextKey = () => `band-${draftKey++}`;

const toDrafts = (bands: GpaBand[]): BandDraft[] =>
    [...bands]
        .sort((a, b) => b.min_percentage - a.min_percentage)
        .map(band => ({
            key: nextKey(),
            min_percentage: String(band.min_percentage),
            points: String(band.points),
            letter: band.letter ?? '',
        }));

const ScaleEditorModal: React.FC<ScaleEditorModalProps> = ({ scale, onClose, onSubmit, busy = false }) => {
    const [name, setName] = useState(scale?.name ?? '');
    const [basis, setBasis] = useState<'percentage' | 'points'>(scale?.basis ?? 'percentage');
    const [maxValue, setMaxValue] = useState(String(scale?.max_value ?? 4));
    const [minValue, setMinValue] = useState(String(scale?.min_value ?? 0));
    const [drafts, setDrafts] = useState<BandDraft[]>(() => toDrafts(scale?.bands ?? []));

    const updateDraft = (key: string, patch: Partial<BandDraft>) => {
        setDrafts(current => current.map(draft => (draft.key === key ? { ...draft, ...patch } : draft)));
    };

    const addDraft = () => {
        // Slot the new band just under the lowest one already there.
        const lowest = drafts.reduce(
            (min, draft) => Math.min(min, Number(draft.min_percentage) || 0),
            100,
        );
        setDrafts(current => [
            ...current,
            { key: nextKey(), min_percentage: String(Math.max(0, lowest - 5)), points: '0', letter: '' },
        ]);
    };

    // A scale with no floor band silently maps every low grade to min_value.
    const hasFloorBand = drafts.some(draft => Number(draft.min_percentage) === 0);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!name.trim()) return;

        const parsedMax = Number(maxValue);
        const bands: GpaBand[] =
            basis === 'points'
                ? []
                : drafts
                      .map(draft => ({
                          min_percentage: Number(draft.min_percentage),
                          points: Number(draft.points),
                          letter: draft.letter.trim() || null,
                      }))
                      .filter(band => !Number.isNaN(band.min_percentage) && !Number.isNaN(band.points))
                      .sort((a, b) => b.min_percentage - a.min_percentage);

        onSubmit({
            id: scale?.id,
            name: name.trim(),
            basis,
            max_value: parsedMax > 0 ? parsedMax : 4,
            min_value: Number(minValue) || 0,
            bands,
        });
    };

    return (
        <div className="import-modal-overlay" onClick={() => { if (!busy) onClose(); }}>
            <div
                className="import-modal-card edit-modal-card"
                onClick={event => event.stopPropagation()}
            >
                <h3>{scale ? 'Edit Scale' : 'Add Scale'}</h3>

                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="form-label">Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={event => setName(event.target.value)}
                                className="form-control"
                                placeholder="e.g. 20 / 20"
                                required
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="form-label">Type</label>
                            <select
                                value={basis}
                                onChange={event => setBasis(event.target.value as 'percentage' | 'points')}
                                className="form-select"
                            >
                                <option value="percentage">Converted from %</option>
                                <option value="points">Raw percentage</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="form-label">Maximum</label>
                            <input
                                type="number"
                                step="any"
                                min={0.1}
                                value={maxValue}
                                onChange={event => setMaxValue(event.target.value)}
                                className="form-control"
                                required
                            />
                        </div>
                        <div>
                            <label className="form-label">Minimum</label>
                            <input
                                type="number"
                                step="any"
                                value={minValue}
                                onChange={event => setMinValue(event.target.value)}
                                className="form-control"
                            />
                        </div>
                    </div>

                    {basis === 'points' ? (
                        <p className="academic-empty__text" style={{ marginBottom: '1rem', textAlign: 'left' }}>
                            A raw percentage scale reads the course grade as-is, so no bands are needed.
                        </p>
                    ) : (
                        <>
                            <label className="form-label">
                                Bands - a course grade of at least this percentage earns the points
                            </label>

                            <div className="flex flex-col gap-2" style={{ marginBottom: '0.75rem' }}>
                                <div className="grid grid-cols-3 gap-2">
                                    <span className="academic-kicker">From %</span>
                                    <span className="academic-kicker">Points</span>
                                    <span className="academic-kicker">Letter</span>
                                </div>

                                {drafts.map(draft => (
                                    <div key={draft.key} className="grid grid-cols-3 gap-2 items-center">
                                        <input
                                            type="number"
                                            step="any"
                                            min={0}
                                            max={100}
                                            value={draft.min_percentage}
                                            onChange={event => updateDraft(draft.key, { min_percentage: event.target.value })}
                                            className="form-control"
                                        />
                                        <input
                                            type="number"
                                            step="any"
                                            value={draft.points}
                                            onChange={event => updateDraft(draft.key, { points: event.target.value })}
                                            className="form-control"
                                        />
                                        <div className="flex gap-1">
                                            <input
                                                type="text"
                                                value={draft.letter}
                                                onChange={event => updateDraft(draft.key, { letter: event.target.value })}
                                                className="form-control"
                                                maxLength={3}
                                            />
                                            <button
                                                type="button"
                                                className="book-action-btn book-action-btn--danger"
                                                onClick={() => setDrafts(current => current.filter(d => d.key !== draft.key))}
                                                title="Remove band"
                                            >
                                                <Trash2 />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <button type="button" className="btn-action" onClick={addDraft}>
                                <Plus size={13} /> Add band
                            </button>

                            {!hasFloorBand && (
                                <p
                                    className="weight-badge weight-badge--off"
                                    style={{ marginTop: '0.75rem', whiteSpace: 'normal' }}
                                >
                                    No band starts at 0 - anything lower will read as the minimum value.
                                </p>
                            )}
                        </>
                    )}

                    <div className="flex gap-2 justify-end mt-5">
                        <button type="button" className="btn-form-cancel" onClick={onClose} disabled={busy}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-form-submit" disabled={busy || !name.trim()}>
                            {busy ? 'Saving...' : scale ? 'Update' : 'Add'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ScaleEditorModal;
