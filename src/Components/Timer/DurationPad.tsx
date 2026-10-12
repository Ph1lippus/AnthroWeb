import React, { useState } from 'react';
import { clampDuration, joinDuration, splitDuration, MAX_DURATION_MS } from '../../utils/timerMath';

interface DurationPadProps {
    /** Current duration in ms. */
    value: number;
    onChange: (ms: number) => void;
    disabled?: boolean;
}

type FieldIndex = 0 | 1 | 2;

/** Hours are the only field with a hard ceiling; minutes and seconds wrap. */
const MAX_HOURS = Math.floor(MAX_DURATION_MS / 3_600_000);

const UNITS = ['hr', 'min', 'sec'] as const;
const IDS = ['timer-hours', 'timer-minutes', 'timer-seconds'] as const;

/** Digits only, capped at two, defaulting to 0. */
function toNumber(raw: string): number {
    const clean = raw.replace(/\D/g, '').slice(0, 2);
    if (!clean) return 0;
    const n = parseInt(clean, 10);
    return Number.isFinite(n) ? n : 0;
}

/**
 * The H / M / S entry for a countdown.
 *
 * Three inputs rather than one `HH:MM:SS` field, and that is the whole design
 * decision. A single field means knowing the format, clearing it to fix one
 * digit, and retyping everything after a typo. Three fields means each is typed
 * on its own, the value updates as the digits land, and fixing one digit never
 * touches the other two.
 *
 * Stepper buttons were the other option and they are worse on both inputs:
 * forty taps to reach an hour on a phone, forty clicks with a mouse, and no way
 * to express "1:30" at all.
 */
const DurationPad: React.FC<DurationPadProps> = ({ value, onChange, disabled }) => {
    const parts = splitDuration(value);

    /**
     * Held as strings so a half-typed "1" is not normalised to "01:00:00" under
     * the caret the moment it lands. Committed outward on every keystroke, so
     * the display above stays live -- that is the point of a pad rather than a
     * field you submit.
     */
    const [fields, setFields] = useState<[string, string, string]>(() => [
        String(parts.hours), String(parts.minutes), String(parts.seconds),
    ]);

    /**
     * Adopt an incoming value.
     *
     * Keyed on the incoming milliseconds, so a preset being tapped updates the
     * pad but a parent re-render does not overwrite what somebody is typing.
     */
    // Adopt an incoming value during render rather than from an effect, which is
    // the "adjusting state when a prop changes" case React documents: storing the
    // previous value in state and comparing it here is the supported pattern, and
    // doing the same thing in a `useEffect` is a second render for something that
    // can be decided before any of them.
    const [lastValue, setLastValue] = useState(value);
    if (value !== lastValue) {
        const next = splitDuration(value);
        setLastValue(value);
        setFields([String(next.hours), String(next.minutes), String(next.seconds)]);
    }

    const commit = (next: readonly string[]) => {
        const total = clampDuration(joinDuration(
            Math.min(toNumber(next[0]), MAX_HOURS),
            toNumber(next[1]),
            toNumber(next[2]),
        ));
        // Zero is refused rather than committed. A countdown at 00:00 has no
        // deadline to run to, and the engine would substitute a default behind
        // the user's back -- better to leave the previous value and let the
        // field sit empty.
        if (total > 0) onChange(total);
    };

    const setField = (index: FieldIndex, raw: string) => {
        const clean = raw.replace(/\D/g, '').slice(0, 2);
        const next: [string, string, string] = [...fields];
        next[index] = clean;
        setFields(next);
        commit(next);
    };

    /**
     * Canonicalise on blur, so leaving a field puts it back in order.
     *
     * Takes no index: all three fields are normalised together, because clamping
     * one of them changes what the others mean (a minute field over 59 carries
     * into the hour). Taking the index would suggest one could be done alone, and
     * it cannot.
     */
    const normalise = () => {
        const next: [string, string, string] = [...fields];
        const hours = Math.min(toNumber(next[0]), MAX_HOURS);
        const minutes = Math.min(toNumber(next[1]), 59);
        const seconds = Math.min(toNumber(next[2]), 59);
        next[0] = String(hours);
        next[1] = String(minutes);
        next[2] = String(seconds);
        setFields(next);
        commit(next);
    };

    return (
        <div className="timer-pad">
            {fields.map((raw, i) => {
                const index = i as FieldIndex;
                return (
                    <React.Fragment key={IDS[index]}>
                        {index > 0 && <span className="timer-pad__colon" aria-hidden="true">:</span>}
                        <div className="timer-pad__field">
                            <input
                                id={IDS[index]}
                                className="timer-pad__input"
                                value={raw}
                                disabled={disabled}
                                inputMode="numeric"
                                autoComplete="off"
                                // `text` with a numeric keypad rather than
                                // `number`, so the scroll-wheel spinner cannot
                                // change a duration while somebody is scrolling
                                // the page past it.
                                type="text"
                                maxLength={2}
                                onChange={event => setField(index, event.target.value)}
                                onBlur={normalise}
                                aria-label={UNITS[index]}
                            />
                            <span className="timer-pad__unit">{UNITS[index]}</span>
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default DurationPad;