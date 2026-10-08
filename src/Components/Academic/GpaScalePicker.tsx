import React from 'react';
import {
    ROUNDING_LABELS,
    ROUNDING_MODES,
} from '../../utils/academicGpa';
import type { GpaScale, RoundingMode } from '../../utils/academicGpa';

interface GpaScalePickerProps {
    scales: GpaScale[];
    activeId: string | null;
    onSelect: (id: string) => void;
    /** Saves the round-down/nearest/round-up choice for the active scale. */
    onSetRounding: (mode: RoundingMode) => void;
    roundingBusy?: boolean;
}

/**
 * Picks which scale the whole page reads in.
 *
 * The scales themselves are fixed presets now: there is deliberately no add,
 * edit or delete here, because letting one account redefine "20/20" made every
 * shared number mean something different.
 */
const GpaScalePicker: React.FC<GpaScalePickerProps> = ({
    scales,
    activeId,
    onSelect,
    onSetRounding,
    roundingBusy = false,
}) => {
    if (scales.length === 0) return null;

    const active = scales.find(scale => scale.id === activeId) ?? scales[0];

    // Rounding only changes a bandless result. A banded scale already says
    // exactly which grade a percentage earns.
    const showRounding = active.bands.length === 0;

    return (
        <div className="scale-picker">
            <select
                className="scale-picker__select"
                value={active.id ?? ''}
                onChange={event => onSelect(event.target.value)}
                data-tip="Choose which scale grades are shown in"
                // The select has no visible label, so `title` was its only
                // accessible name. Renaming the attribute to `data-tip` would
                // have left a control with no name at all.
                aria-label="Grading scale"
            >
                {scales.map(scale => (
                    <option key={scale.id} value={scale.id ?? ''}>
                        {scale.name}
                    </option>
                ))}
            </select>

            {showRounding && (
                <label className="scale-picker__rounding" data-tip="How a running result becomes the whole grade the teacher reports">
                    <span className="academic-kicker">Rounding</span>
                    <select
                        value={active.rounding}
                        onChange={event => onSetRounding(event.target.value as RoundingMode)}
                        disabled={roundingBusy}
                    >
                        {ROUNDING_MODES.map(mode => (
                            <option key={mode} value={mode}>
                                {ROUNDING_LABELS[mode]}
                            </option>
                        ))}
                    </select>
                </label>
            )}
        </div>
    );
};

export default GpaScalePicker;
