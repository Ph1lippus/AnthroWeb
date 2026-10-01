import React from 'react';
import {
    percentToPoints,
    percentToScalePoints,
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
 * Picks which scale the whole page reads in, and shows the same grade on every
 * other scale so switching back and forth never loses the thread.
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
    const others = scales.filter(scale => scale.id !== active.id);

    // A reference grade, so the picker's value is legible before any course exists.
    const sample = 85;

    // Banded scales (4.0, 5.0) read through their bands; bandless ones keep the
    // full decimal, so "85% is a 17.00" survives instead of collapsing to 17.
    const readout = (percent: number, scale: GpaScale): string =>
        (scale.bands.length > 0 ? percentToPoints(percent, scale) : percentToScalePoints(percent, scale)).toFixed(2);

    // Rounding only changes a bandless result. A banded scale already says
    // exactly which grade a percentage earns.
    const showRounding = active.bands.length === 0;

    return (
        <div className="scale-picker">
            <select
                className="scale-picker__select"
                value={active.id ?? ''}
                onChange={event => onSelect(event.target.value)}
                title="Choose which scale grades are shown in"
            >
                {scales.map(scale => (
                    <option key={scale.id} value={scale.id ?? ''}>
                        {scale.name}
                    </option>
                ))}
            </select>

            {showRounding && (
                <label className="scale-picker__rounding" title="How a running result becomes the whole grade the teacher reports">
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

            {others.length > 0 && (
                <span
                    className="weight-badge weight-badge--empty"
                    title={`${sample}% reads as...`}
                >
                    {others.map(scale => `${readout(sample, scale)} ${scale.name}`).join('  ·  ')}
                </span>
            )}
        </div>
    );
};

export default GpaScalePicker;
