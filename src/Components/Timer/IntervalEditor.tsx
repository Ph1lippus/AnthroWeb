import React from 'react';
import { Repeat } from 'lucide-react';
import { formatHumanDuration, type IntervalConfig } from '../../utils/timerMath';

interface IntervalEditorProps {
    config: IntervalConfig;
    onChange: (config: IntervalConfig) => void;
    disabled: boolean;
}

/** Seconds to `MM:SS`, or `HH:MM:SS` past an hour. */
const toInput = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

function parseInput(raw: string): number {
    const parts = raw.split(':').map(part => parseInt(part.replace(/\D/g, ''), 10) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

/**
 * A labelled numeric field that holds `MM:SS` but reports seconds.
 *
 * The stored value is in seconds because that is what the phase arithmetic
 * wants, and what the database wants. What the *user* types is `MM:SS`, because
 * nobody configuring a break wants to count sixty.
 */
const Field: React.FC<{
    id: string;
    label: string;
    seconds: number;
    onChange: (seconds: number) => void;
    disabled: boolean;
    /** A round-number stepper beside the field. */
    step?: number;
}> = ({ id, label, seconds, onChange, disabled, step }) => (
    <div className="timer-field">
        <label className="form-label" htmlFor={id}>{label}</label>
        <input
            id={id}
            className="form-control"
            value={toInput(seconds)}
            disabled={disabled}
            inputMode="numeric"
            placeholder="25:00"
            onChange={event => {
                const parsed = parseInput(event.target.value.replace(/[^\d:]/g, '').slice(0, 8));
                // Zero is refused: a zero-length phase is a phase the run cannot
                // move through, and `phaseAt` returns null for a zero work
                // length. Refusing here means the run never gets into that state.
                if (parsed > 0) onChange(parsed);
            }}
        />
        {step && (
            <div className="timer-chips" style={{ marginTop: '0.15rem' }}>
                {[-step, step].map(delta => (
                    <button
                        key={delta}
                        type="button"
                        className="btn-action"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.6rem' }}
                        disabled={disabled || (delta < 0 && seconds <= step)}
                        onClick={() => onChange(Math.max(step, seconds + delta))}
                        aria-label={`${delta > 0 ? 'Add' : 'Remove'} ${step}s`}
                    >
                        {delta > 0 ? '+' : '−'}{step}s
                    </button>
                ))}
            </div>
        )}
    </div>
);

/**
 * The interval shape: work, rest, a longer rest every N rounds, and how many
 * rounds to run.
 *
 * A plain form rather than a preset picker, because the numbers people use vary
 * enormously and the useful thing is being able to type your own. The summary
 * underneath is the part that earns the form: it turns five fields into the one
 * sentence somebody actually wants to check ("4 rounds of 25m, 15m after the
 * fourth"), so a mis-typed field is visible without doing arithmetic.
 */
const IntervalEditor: React.FC<IntervalEditorProps> = ({ config, onChange, disabled }) => {
    const set = (patch: Partial<IntervalConfig>) => onChange({ ...config, ...patch });

    return (
        <div className="timer-block">
            <div className="timer-block__head">
                <h3 className="timer-block__title">
                    <Repeat size={14} aria-hidden="true" /> Intervals
                </h3>
            </div>

            <div className="timer-field-grid">
                <Field
                    id="interval-work"
                    label="Work"
                    seconds={config.workSec}
                    onChange={workSec => set({ workSec })}
                    disabled={disabled}
                    step={300}
                />
                <Field
                    id="interval-rest"
                    label="Rest"
                    seconds={config.restSec}
                    onChange={restSec => set({ restSec })}
                    disabled={disabled}
                    step={60}
                />
                <Field
                    id="interval-long-rest"
                    label="Long rest"
                    seconds={config.longRestSec}
                    onChange={longRestSec => set({ longRestSec })}
                    disabled={disabled}
                    step={300}
                />
            </div>

            <div className="timer-field-grid" style={{ marginTop: '0.6rem' }}>
                <div className="timer-field">
                    <label className="form-label" htmlFor="interval-rounds">Long rest after</label>
                    <input
                        id="interval-rounds"
                        className="form-control"
                        type="text"
                        inputMode="numeric"
                        value={config.roundsBeforeLong === 0 ? 'Never' : config.roundsBeforeLong}
                        disabled={disabled}
                        onChange={event => {
                            const raw = event.target.value.replace(/\D/g, '').slice(0, 2);
                            set({ roundsBeforeLong: raw === '' ? 0 : Math.max(0, Math.min(24, parseInt(raw, 10))) });
                        }}
                        // "Never" is not digits, so the type is text and the
                        // placeholder carries the meaning.
                        placeholder="Never"
                    />
                    <span className="timer-pad__unit" style={{ textAlign: 'left' }}>rounds</span>
                </div>

                <div className="timer-field">
                    <label className="form-label" htmlFor="interval-total">Rounds to run</label>
                    <input
                        id="interval-total"
                        className="form-control"
                        type="text"
                        inputMode="numeric"
                        value={config.totalRounds === 0 ? 'Until stopped' : config.totalRounds}
                        disabled={disabled}
                        onChange={event => {
                            const raw = event.target.value.replace(/\D/g, '').slice(0, 2);
                            // 0 means unbounded, which is what clearing the field
                            // gives and what "Until stopped" displays.
                            set({ totalRounds: raw === '' ? 0 : Math.max(0, Math.min(99, parseInt(raw, 10))) });
                        }}
                        placeholder="Until stopped"
                    />
                    <span className="timer-pad__unit" style={{ textAlign: 'left' }}>total</span>
                </div>
            </div>

            {/* The summary. Deliberately worded as a sentence rather than as a
                formula: the point is to make a wrong field obvious, and nobody
                checks a formula at a glance the way they check a sentence. */}
            <p className="timer-empty-hint" style={{ textAlign: 'left', marginTop: '0.75rem' }}>
                {config.totalRounds > 0 ? (
                    <>
                        {config.totalRounds} {config.totalRounds === 1 ? 'round' : 'rounds'} of{' '}
                        {formatHumanDuration(config.workSec * 1000)}, {formatHumanDuration(config.restSec * 1000)} rest
                        {config.roundsBeforeLong > 0 && (
                            <> and {formatHumanDuration(config.longRestSec * 1000)} after round{' '}
                                {config.roundsBeforeLong}</>
                        )}
                        . Then it stops.
                    </>
                ) : (
                    <>
                        {formatHumanDuration(config.workSec * 1000)} on,{' '}
                        {formatHumanDuration(config.restSec * 1000)} rest
                        {config.roundsBeforeLong > 0 && (
                            <> and {formatHumanDuration(config.longRestSec * 1000)} after round{' '}
                                {config.roundsBeforeLong}</>
                        )}
                        . Runs until you stop it.
                    </>
                )}
            </p>
        </div>
    );
};

export default IntervalEditor;