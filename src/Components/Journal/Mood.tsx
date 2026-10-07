import React from 'react';
import { Link } from 'react-router-dom';
import { Sunrise, Moon } from 'lucide-react';
import { moodFor, moodColor, moodLabel } from '../../utils/moodSeries';
import type { MoodSlot, MoodBearing } from '../../utils/moodSeries';

/**
 * The two controls and two readouts for a day's mood, in one place.
 *
 * They were two unrelated things until migration 0014 split the single `mood`
 * column in two: a 1-10 scale on the daily log, and nothing at all on the
 * journal. Now both halves of the day are rated on the journal page, and the
 * daily log reads them back, so the two views are two ends of one value and had
 * to stop being written twice.
 *
 * `MoodScale` and `MoodReadout` are deliberately separate rather than one
 * component with a `readOnly` flag. The difference is not cosmetic -- a control
 * you can press and a value you can only look at are different affordances, and
 * they should not share a tab stop or a hover state. A single component with a
 * boolean would put the wrong one of the two in the tree half the time.
 */

interface MoodScaleProps {
    slot: MoodSlot;
    value: number | null;
    onChange: (value: number | null) => void;
    /** Names the half of the day on screen; also the accessible group name. */
    label: string;
}

/**
 * The interactive 1-10 rating, ten buttons wide.
 *
 * The rating is stepped rather than dragged: at this size a drag target is
 * smaller than a fingertip and there is no way to land on 7, whereas ten buttons
 * are each about 28px across and each says what it is. The scale also fills left
 * to the chosen step, so the current value is legible at a glance and to
 * someone who cannot distinguish the colours.
 *
 * A second click on the current step clears it. Setting a rating you then want
 * to withdraw is otherwise impossible, and "not rated" is a real answer here --
 * it is excluded from the averages rather than counted as a zero.
 */
export const MoodScale: React.FC<MoodScaleProps> = ({ slot, value, onChange, label }) => {
    const active = value == null ? 0 : value;
    const color = moodColor(value);

    return (
        <div className="mood-scale-wrap">
            <div
                className="mood-scale"
                role="group"
                aria-label={label}
                style={{ '--mood-color': color } as React.CSSProperties}
            >
                {Array.from({ length: 10 }, (_, i) => i + 1).map(step => {
                    const filled = active >= step;
                    const isValue = value === step;
                    return (
                        <button
                            key={step}
                            type="button"
                            className={
                                'mood-scale-btn'
                                + (filled ? ' mood-scale-btn--active' : '')
                                + (isValue ? ' mood-scale-btn--current' : '')
                            }
                            onClick={() => onChange(isValue ? null : step)}
                            data-tip={`${label} ${step} of 10`}
                            aria-label={`${label} ${step} out of 10`}
                            aria-pressed={isValue}
                        >
                            {step}
                        </button>
                    );
                })}
            </div>
            <span className="mood-scale-caption">
                <span>1 - rough</span>
                <span>goal 8+</span>
                <span>10 - great</span>
            </span>
            {/* Stated for anyone not looking at the colours, and for a screen
                reader, which gets the same sentence as everyone else. */}
            <span className="sr-only" aria-live="polite">
                {slot === 'morning' ? 'Morning' : 'Evening'} mood: {moodLabel(value)}
            </span>
        </div>
    );
};

interface MoodReadoutProps {
    log: MoodBearing | null | undefined;
    /** Where the link goes; omitted for a badge that is not a link. */
    linkTo?: string;
}

/**
 * The two ratings as they appear on the daily log: read-only, and a link to the
 * page that edits them.
 *
 * Shown as two badges rather than one averaged number because the disagreement
 * between them is the thing worth seeing at a glance. An unrated half is drawn
 * as an explicit "not rated" rather than hidden, so an empty slot is visibly a
 * gap in the record rather than an absence of a bad day.
 */
export const MoodReadout: React.FC<MoodReadoutProps> = ({ log, linkTo }) => {
    const slots: Array<{ slot: MoodSlot; label: string; Icon: typeof Sunrise }> = [
        { slot: 'morning', label: 'AM', Icon: Sunrise },
        { slot: 'evening', label: 'PM', Icon: Moon },
    ];

    const badges = slots.map(({ slot, label, Icon }) => {
        const value = moodFor(log, slot);
        const rated = value !== null;
        return (
            <span
                key={slot}
                className={
                    'mood-badge'
                    + (rated ? ` mood-badge--${value! <= 4 ? 'low' : value! <= 6 ? 'mid' : 'high'}` : '')
                }
                data-tip={rated ? `${label} mood ${value}/10` : `${label} mood not rated`}
            >
                <Icon className="mood-badge__icon" size={12} aria-hidden="true" />
                <span className="mood-badge__label">{label}</span>
                <span className="mood-badge__value">{rated ? `${value}/10` : '—'}</span>
            </span>
        );
    });

    if (!linkTo) return <div className="mood-readout">{badges}</div>;

    return (
        // The whole readout is the link rather than each badge: one target
        // instead of two, and one announced name instead of two.
        <Link to={linkTo} className="mood-readout mood-readout--link" data-tip="Rate your day on the journal">
            {badges}
        </Link>
    );
};