import React, { useState } from 'react';
import {
    formatAlarmTime,
    formatHumanDuration,
    type IntervalConfig,
} from '../../utils/timerMath';

interface IntervalEditorProps {
    config: IntervalConfig;
    onChange: (config: IntervalConfig) => void;
    disabled: boolean;
    /**
     * When the armed schedule next comes round, or null when nothing is armed.
     *
     * Passed in rather than worked out here, and the reason is worth stating because
     * it is the rule this project holds everywhere: rendering does not read the clock.
     * A component that called `new Date()` to decide whether an armed time falls today
     * or tomorrow would get a different answer on a re-render for no reason, would
     * disagree with the engine and the countdown by however long it took to get there,
     * and would be untestable against a controlled clock. The engine already holds the
     * one reading of the wall clock the page is built on, so this formats what it says.
     */
    dueAt?: Date | null;
}

/**
 * A duration for typing: whole minutes on their own, `M:SS` below an hour's worth of
 * seconds, `H:MM:SS` past that.
 *
 * Whole minutes rather than `MM:SS` because a phase length is nearly always a whole
 * number of minutes, and "25" is what somebody means when they configure a pomodoro.
 * The previous form showed `25:00` and read `20` as twenty *seconds*, so writing
 * twenty minutes was impossible without typing the colon and the two zeroes as well
 * -- and a stray digit in that one field produced hours of nonsense, with nothing on
 * the card to catch it.
 */
const toInput = (seconds: number): string => {
    const total = Math.max(0, Math.floor(seconds));
    if (total === 0) return '';
    if (total % 60 === 0) return String(total / 60);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/**
 * The same, the other way, and the bare-number-means-minutes rule lives here.
 *
 * One number is minutes. Two is minutes and seconds. Three is hours, minutes and
 * seconds. Anything finer than a minute stays reachable by typing the colon, so the
 * default that makes the common case right does not cost the uncommon one.
 *
 * Deliberately not symmetric with `toInput`: `1:30` types as `1:30` but normalises
 * to `90`, and that is the point. The shorter form is the one worth reading at a
 * glance, and the precise form is what you type when the short one would be wrong.
 */
function parseInput(raw: string): number {
    const parts = raw.split(':').map(part => parseInt(part.replace(/\D/g, ''), 10) || 0);
    if (parts.length >= 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Math.max(0, parts[0] ?? 0) * 60;
}

/** Two digits of digits. The ceiling is applied when the value is read, not here. */
const digits = (raw: string): string => raw.replace(/\D/g, '').slice(0, 2);

/**
 * Read one half of a wall-clock entry while somebody is still typing it.
 *
 * An empty half means that half has not been entered yet. Zero is a real
 * value, so it is represented as `'0'` rather than as absence. Out-of-range
 * digits remain text here and are clamped only when the pair is committed,
 * which makes the next keystroke predictable without turning typing into an
 * immediate correction.
 */
const readClockPart = (raw: string, max: number): number | null => {
    if (raw.trim() === '') return null;
    const value = Number(digits(raw));
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.min(max, value));
};

/**
 * A labelled duration field that reads in minutes.
 *
 * Held as a string rather than being re-derived from the prop on every keystroke,
 * which is the bug this shape is here to avoid. A controlled field whose value is
 * `toInput(seconds)` cannot be typed into at all: type `1` and the value parses to
 * sixty seconds and comes back as `1`, which is not what was typed; type `1:` for a
 * minute and thirty and the trailing colon is eaten the moment it lands, so the next
 * keystroke appends to something else. Holding the raw text and canonicalising on
 * blur is what the countdown pad does for the same reason, and it is the only reason
 * `1:30` can be typed at all.
 *
 * The scheduled-start row uses the same principle, but keeps its draft as a pair:
 * an hour or minute is only a complete wall-clock time when both halves are known.
 *
 * Adopts an incoming value during render rather than from an effect -- React's
 * documented "adjusting state when a prop changes" case -- so a change from outside
 * (a preset, a restore) lands without a second render, and a parent re-render cannot
 * overwrite what somebody is halfway through typing.
 */
const Field: React.FC<{
    id: string;
    label: string;
    seconds: number;
    onChange: (seconds: number) => void;
    disabled: boolean;
}> = ({ id, label, seconds, onChange, disabled }) => {
    const [raw, setRaw] = useState(() => toInput(seconds));
    const [adopted, setAdopted] = useState(seconds);
    if (seconds !== adopted) {
        setAdopted(seconds);
        setRaw(toInput(seconds));
    }

    const commit = (text: string) => {
        setRaw(text);
        const parsed = parseInput(text);
        // Zero is refused: a zero-length phase is a phase the run cannot move
        // through, and `phaseAt` returns null for a zero work length. Refusing here
        // means the run never gets into that state. The text is kept either way, so
        // an empty field reads as empty rather than snapping back mid-keystroke.
        if (parsed > 0) onChange(parsed);
    };

    return (
        <div className="timer-field">
            <label className="form-label" htmlFor={id}>{label}</label>
            <input
                id={id}
                className="form-control"
                // `text` with a numeric keypad rather than `number`, so the
                // scroll-wheel spinner cannot change a duration while somebody is
                // scrolling the page past it.
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={raw}
                disabled={disabled}
                placeholder="25"
                aria-describedby={`${id}-unit`}
                onChange={event => commit(event.target.value.replace(/[^\d:]/g, '').slice(0, 8))}
                onBlur={() => setRaw(toInput(seconds))}
            />
            <span className="timer-pad__unit" id={`${id}-unit`} style={{ textAlign: 'left' }}>min · 1:30 for m:ss</span>
        </div>
    );
};

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
const IntervalEditor: React.FC<IntervalEditorProps> = ({ config, onChange, disabled, dueAt }) => {
    const set = (patch: Partial<IntervalConfig>) => onChange({ ...config, ...patch });

    /**
     * The halves currently being typed for the scheduled start.
     *
     * `null` means the fields are showing the committed config directly. Once
     * editing begins, the pair is held here until both halves are complete. A
     * `null` half preserves the committed value for that half, so clearing the
     * other half cannot silently reinterpret the pair as an earlier time.
     */
    const [startDraft, setStartDraft] = useState<{ hour: string | null; minute: string | null }>({
        hour: null,
        minute: null,
    });

    /**
     * Start-at, recomputed only when both typed halves contain a complete value.
     *
     * The old implementation treated an empty minute as zero, so clearing one
     * field committed the other field as a fresh time before the replacement
     * could be typed. That is why typing into a previously armed schedule
     * appeared to bounce, flash an unrelated value, or leave no schedule at
     * all. A blank half is now a draft: it is stored locally and the schedule
     * changes only once the user has supplied the whole pair.
     */
    const commitStartAt = (hour: string | null, minute: string | null) => {
        const h = readClockPart(hour ?? '', 23);
        const m = readClockPart(minute ?? '', 59);
        if (h == null || m == null) return;
        set({ startAt: h * 60 + m });
        setStartDraft({ hour: null, minute: null });
    };

    /**
     * The visible value of one start-at half.
     *
     * `config.startAt` is the committed schedule, while `startDraft` holds a
     * partially entered replacement. A non-null draft half wins so that the
     * text under the caret stays exactly what the user typed; a null half
     * still shows the committed value it is preserving.
     */
    const startDraftPart = (
        draft: { hour: string | null; minute: string | null },
        part: 'hour' | 'minute',
    ): string => {
        if (draft[part] != null) return draft[part] ?? '';
        if (config.startAt == null) return '';
        return part === 'hour'
            ? String(Math.floor(config.startAt / 60))
            : String(config.startAt % 60);
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
                        value={startDraftPart(startDraft, 'hour')}
                        disabled={disabled}
                        placeholder="--"
                        onChange={event => {
                            const next = { ...startDraft, hour: digits(event.target.value) };
                            setStartDraft(next);
                            const m = next.minute ?? '';
                            if (digits(event.target.value).length >= 1 && m.length === 2) {
                                commitStartAt(next.hour, next.minute);
                            }
                        }}
                        onBlur={() => {
                            commitStartAt(startDraft.hour, startDraft.minute);
                        }}
                    />
                    <span className="timer-pad__unit" style={{ textAlign: 'left' }}>0-23 · 20 is 8pm</span>
                </div>

                <div className="timer-field">
                    <label className="form-label" htmlFor="interval-start-minute">Start at, minute</label>
                    <input
                        id="interval-start-minute"
                        className="form-control"
                        type="text"
                        inputMode="numeric"
                        value={startDraftPart(startDraft, 'minute')}
                        disabled={disabled}
                        onBlur={() => {
                            // Same as the hour half: the pair commits once it is
                            // complete, and an incomplete entry remains a draft.
                            commitStartAt(startDraft.hour, startDraft.minute);
                        }}
                    />
                    <span className="timer-pad__unit" style={{ textAlign: 'left' }}>0-59 · blank to cancel</span>
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

                The day is the whole of it, and it is here because the time alone is
                ambiguous in exactly the way that produces a wrong answer: `20` in the
                hour box means twenty in the evening, which is twenty hours away if it
                is currently nine in the morning and nearly a full day away if it is
                currently nine at night. Same field, same reading, an hour's wait or a
                day's. So the sentence names the day, and the clock above the card is
                counting down to the same instant.

                The limitation is the other important half, and it is not buried: it
                needs the page open, because nothing here can run when the app is shut.
                A control that appears to work and quietly does not is the same failure
                as the one this field used to be, and the difference now is that the
                user is told rather than left to discover it. */}
            {config.startAt != null && dueAt && (
                <p className="timer-empty-hint" style={{ textAlign: 'left', marginTop: '0.35rem' }}>
                    Starts on its own at {formatAlarmTime(dueAt.getHours(), dueAt.getMinutes())}, once, then the
                    field empties itself. Keep this page open until then — a closed app cannot start it.
                </p>
            )}
        </>
    );
};

export default IntervalEditor;