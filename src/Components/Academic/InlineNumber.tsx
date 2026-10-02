import React, { useState } from 'react';

const toText = (value: number | null | undefined): string =>
    value === null || value === undefined ? '' : String(value);

interface InlineNumberProps {
    value: number | null | undefined;
    onCommit: (value: number | null) => void;
    placeholder?: string;
    className?: string;
    min?: number;
    max?: number;
    /** What an empty field means. 'null' clears the value, 'min' clamps up to it. */
    emptyValue?: number | null;
    /** What this number is. Required wherever the field has no visible label. */
    ariaLabel?: string;
}

/**
 * A number field that keeps the user's text while they type and only writes to
 * the database on blur or Enter. Typing "1." must not be truncated to "1" by a
 * round trip through the server on every keystroke.
 */
const InlineNumber: React.FC<InlineNumberProps> = ({
    value,
    onCommit,
    placeholder,
    className = 'num-input',
    min,
    max,
    emptyValue = null,
    ariaLabel,
}) => {
    const [text, setText] = useState(() => toText(value));
    const [syncedValue, setSyncedValue] = useState(value);

    // Re-sync when the server value changes underneath us (after a save or a
    // refetch). Adjusting during render rather than in an effect keeps the field
    // from tearing out and back while the user is typing in it.
    if (value !== syncedValue) {
        setSyncedValue(value);
        setText(toText(value));
    }

    const commit = () => {
        const trimmed = text.trim();

        if (trimmed === '') {
            if (emptyValue !== value) onCommit(emptyValue);
            return;
        }

        let parsed = Number(trimmed);
        if (Number.isNaN(parsed)) {
            setText(toText(value));
            return;
        }
        if (min !== undefined) parsed = Math.max(min, parsed);
        if (max !== undefined) parsed = Math.min(max, parsed);

        if (parsed !== value) onCommit(parsed);
        setText(String(parsed));
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            setText(toText(value));
            event.currentTarget.blur();
        }
    };

    return (
        <input
            type="number"
            inputMode="decimal"
            className={className}
            value={text}
            placeholder={placeholder}
            min={min}
            max={max}
            step="any"
            aria-label={ariaLabel}
            onChange={(event) => setText(event.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
        />
    );
};

export default InlineNumber;
