import React from 'react';
import { formatAlarmTime, formatHumanDuration, type IntervalConfig } from '../../utils/timerMath';

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

/** Two digits of digits. The ceiling is applied when the value is read, not here. */
const digits = (raw: string): string => raw.replace(/\D/g, '').slice(0, 2);

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
}> = ({ id, label, seconds, onChange, disabled }) => (
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
 *
 * ## No header, no wrapper, no steppers
 *
 * This used to open a `.timer-block` with its own titled header, and to put a pair
 * of `±300s` chips under every field. All three are gone.
 *
 * The wrapper was a panel *inside* the card that already held it, carrying a second
 * copy of the name that card's own header already said -- so the intervals
 * container was a container inside a container, and the eye had two edges to read
 * as its boundary where there should have been one. It now renders its fields
 * straight into the card it is given, which is what makes the page read as one
 * mosaic of puzzle pieces rather than panels nested inside panels.
 *
 * The steppers were three pairs of buttons to nudge numbers that were already
 * typeable in the field above them, each one a route to a value by arithmetic
 * rather than by saying it. The fields do the job on their own.
 */
const IntervalEditor: React.FC<IntervalEditorProps> = ({ config, onChange, disabled }) => {
    const set = (patch: Partial<IntervalConfig>) => onChange({ ...config, ...patch });

    const startHour = config.startAt == null ? '' : String(Math.floor(config.startAt / 60));
    const startMinute = config.startAt == null ? '' : String(config.startAt % 60);

    /**
     * Start-at, recomposed from whichever half was just edited.
     *
     * Both blank means "no scheduled start". One blank counts as zero rather than as
     * nothing, so the hour can be typed before the minute -- the alternative is a
     * field that discards what you typed because its partner was still empty, which
     * is the same silent-nothing bug the rest of this file avoids.
     */
    const setStartAt = (hour: string, minute: string) => {
        if (hour === '' && minute === '') { set({ startAt: null }); return; }
        const h = Math.max(0, Math.min(23, parseInt(hour, 10) || 0));
        const m = Math.max(0, Math.min(59, parseInt(minute, 10) || 0));
        set({ startAt: h * 60 + m });
    };

    return (
        <>
            <div className="timer-field-grid">
                <Field
                    id="interval-work"
                    label="Work"
                    seconds={config.workSec}
                    onChange={workSec => set({ workSec })}
                    disabled={disabled}
                />
                <Field
                    id="interval-rest"
                    label="Rest"
                    seconds={config.restSec}
                    onChange={restSec => set({ restSec })}
                    disabled={disabled}
                />
                <Field
                    id="interval-long-rest"
                    label="Long rest"
                    seconds={config.longRestSec}
                    onChange={longRestSec => set({ longRestSec })}
                    disabled={disabled}
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
                            const raw = digits(event.target.value);
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
                            const raw = digits(event.target.value);
                            // 0 means unbounded, which is what clearing the field
                            // gives and what "Until stopped" displays.
                            set({ totalRounds: raw === '' ? 0 : Math.max(0, Math.min(99, parseInt(raw, 10))) });
                        }}
                        placeholder="Until stopped"
                    />
                    <span className="timer-pad__unit" style={{ textAlign: 'left' }}>total</span>
                </div>
            </div>

            {/*
                The scheduled start, in a row of its own rather than tucked beside the
                counts, because it is the one field here that is not describing the
                session. Everything above sets the shape of the session; this says when
                one begins, and mixing the two makes the shape unreadable.

                Both halves carry a *visible* label. That is the fix for the misalignment
                this row had before, and the cause was not the labels being different
                lengths -- it was that the minute half's label was `sr-only`. A
                visually hidden label is taken out of flow, so it contributes no height,
                and the input under it sat a line above its partner. Equal structure is
                what lines the two inputs up; equal wording is not required and would
                not have helped.

                The hour and minute are separate numeric fields rather than an
                `<input type="time">`, which renders in whatever 12/24-hour convention
                the browser's locale uses with no attribute to override it -- so on a
                12-hour device the one field on this page expressing a wall-clock time
                came out as "00:00 AM".
            */}
            <div className="timer-field-grid" style={{ marginTop: '0.6rem' }}>
                <div className="timer-field">
                    <label className="form-label" htmlFor="interval-start-hour">Start at, hour</label>
                    <input
                        id="interval-start-hour"
                        className="form-control"
                        type="text"
                        inputMode="numeric"
                        value={startHour}
                        disabled={disabled}
                        placeholder="--"
                        onChange={event => setStartAt(digits(event.target.value), startMinute)}
                    />
                    <span className="timer-pad__unit" style={{ textAlign: 'left' }}>0-23, 24-hour</span>
                </div>

                <div className="timer-field">
                    <label className="form-label" htmlFor="interval-start-minute">Start at, minute</label>
                    <input
                        id="interval-start-minute"
                        className="form-control"
                        type="text"
                        inputMode="numeric"
                        value={startMinute}
                        disabled={disabled}
                        placeholder="--"
                        onChange={event => setStartAt(startHour, digits(event.target.value))}
                    />
                    <span className="timer-pad__unit" style={{ textAlign: 'left' }}>0-59 · blank for none</span>
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
                        . Runs until stopped.
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

            {/* What the scheduled start will actually do, stated where it was set.

                The limitation is the important half of this sentence and it is not
                buried: it needs the page open, because nothing here can run when the
                app is shut. A control that appears to work and quietly does not is
                the same failure as the one this field used to be, and the difference
                now is that the user is told rather than left to discover it. */}
            {config.startAt != null && (
                <p className="timer-empty-hint" style={{ textAlign: 'left', marginTop: '0.35rem' }}>
                    Starts on its own at {formatAlarmTime(Math.floor(config.startAt / 60), config.startAt % 60)},
                    {' '}once, next time that minute comes round. Keep this page open until then — a closed
                    app cannot start it.
                </p>
            )}
        </>
    );
};

export default IntervalEditor;