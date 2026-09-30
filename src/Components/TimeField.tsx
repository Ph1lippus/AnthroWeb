import React from 'react';

interface TimeFieldProps {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    /** Shown inside the input until it is filled, e.g. a goal time. */
    hint?: string;
    disabled?: boolean;
}

// 24-hour clock field. Same interaction as the Daily Log time inputs (digits only,
// an auto-inserted colon, and 23/59 clamping) so the goal form behaves exactly
// like the form it feeds.
const TimeField: React.FC<TimeFieldProps> = ({ id, label, value, onChange, hint, disabled }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length >= 3) {
            val = val.slice(0, 2) + ':' + val.slice(2, 4);
        }
        if (val.length > 5) val = val.slice(0, 5);
        if (/^(\d{2}:)?(\d{0,2})$/.test(val)) {
            const parts = val.split(':');
            if (parts[0] && parseInt(parts[0], 10) > 23) return;
            if (parts[1] && parseInt(parts[1], 10) > 59) return;
            onChange(val);
        }
    };

    // A pasted or fast-typed "0730" only picks up its colon on blur.
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val.length === 4 && !val.includes(':')) {
            onChange(val.slice(0, 2) + ':' + val.slice(2));
        }
    };

    return (
        <div className="mb-3 text-start">
            <label htmlFor={id} className="form-label">{label}</label>
            <div className="t-input-wrap">
                <div className="t-input">
                    {/* form-control picks up the shared 20px-radius field
                        treatment from .auth-card, matching every other input on
                        the login / register / goals / profile forms. */}
                    <input
                        className="form-control font-mono"
                        id={id}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="HH:MM"
                        maxLength={5}
                        value={value}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        disabled={disabled}
                    />
                    {hint && <span className="t-input-hint">{hint}</span>}
                </div>
            </div>
        </div>
    );
};

export default TimeField;
