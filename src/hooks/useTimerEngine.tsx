import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
    DEFAULT_INTERVAL,
    clampDuration,
    phaseAt,
    remainingMs,
    type ChimeId,
    type IntervalConfig,
} from '../utils/timerMath';
import { playChime, stopChime, unlockAudio, vibrationPattern } from '../utils/timerChime';

/**
 * The timer engine, and the reason it is not inside the page.
 *
 * A countdown that lives in a component dies with that component, so this used
 * to mean leaving the page stopped the clock -- which is precisely when someone
 * looks at it, because they are checking how long is left from somewhere else
 * in the app. So the engine lives here, above the router, and the page is one
 * of its views rather than its owner. The nav badge reads this same state, so
 * the badge and the page can never disagree about what the timer is doing.
 *
 * ## Deadlines, never tick counts
 *
 * The whole design rests on one decision: state is an absolute epoch timestamp
 * and what is displayed is always recomputed as `deadline - now`. Nothing here
 * holds a number that it decrements.
 *
 * A tick counter is wrong in a way that stays invisible right up until it is
 * embarrassing. Browsers throttle `setInterval` to roughly once a minute in a
 * background tab and stop it entirely in a frozen one; a phone may suspend the
 * timer for the length of a commute. A counter ticked sixty times a minute
 * would report five minutes elapsed after an hour. Deriving from a timestamp
 * makes all of those cases identical to the foreground case, because there is no
 * per-tick accumulation for them to lose.
 *
 * ## What is persisted, and why not more
 *
 * Only the *running* timer, and only to `localStorage`. Two consequences worth
 * stating plainly:
 *
 *  - Reload, crash, or the app being killed and reopened resumes the same
 *    deadline. A wall-clock deadline survives all of those; an in-memory one
 *    does not.
 *  - It does *not* follow the user to another device, and that is correct. A
 *    countdown is something happening on this machine right now, and copying it
 *    would leave a second device claiming to be twelve minutes away from
 *    something it was never told about. Presets and alarms do sync -- they are
 *    configuration, and configuration is what should follow you.
 */

export type TimerMode = 'countdown' | 'stopwatch' | 'interval';

/** Why the alert fired. Drives the overlay's wording and the buttons it offers. */
export type TimerAlert = {
    kind: 'timeup' | 'alarm';
    /** For a countdown or interval, so the overlay can name what finished. */
    label?: string;
    /** For an alarm, so the notification and overlay can name it. */
    alarmLabel?: string;
} | null;

/** The sound preferences the engine alerts with. Supplied by the page. */
export interface ChimeArgs {
    chime: ChimeId;
    volume: number;
    vibrate: boolean;
    notify: boolean;
}

interface EngineState {
    mode: TimerMode;
    /** Epoch ms the current leg ends at. Null when idle or when paused. */
    deadline: number | null;
    /**
     * Elapsed banked before the current leg, in ms.
     *
     * The interval mode needs this because its phase is a function of *total*
     * elapsed, and a pause cannot simply stop a deadline moving without
     * eventually needing the banked time back. For a countdown this stays 0.
     */
    elapsedBefore: number;
    running: boolean;
    /** Epoch ms the current leg began. Null while paused or idle. */
    legStartedAt: number | null;
    /** Countdown target. 0 for the stopwatch, which has no end. */
    totalMs: number;
    intervalConfig: IntervalConfig;
    /** Stopwatch splits, in order. Persisted, so a reload does not lose them. */
    laps: number[];
    /**
     * Whether the current run's "time's up" overlay has been dismissed.
     *
     * Needed because `finishedReason` is *derived* -- it is true for as long as a
     * finished run is loaded, which would put the overlay back the instant it was
     * dismissed. This is the acknowledgement half of that, and it is cleared by
     * anything that starts a new run.
     */
    acknowledged: boolean;
    alert: TimerAlert;
}

const IDLE: EngineState = {
    mode: 'countdown',
    deadline: null,
    elapsedBefore: 0,
    running: false,
    legStartedAt: null,
    totalMs: 25 * 60 * 1000,
    intervalConfig: DEFAULT_INTERVAL,
    laps: [],
    acknowledged: true,
    alert: null,
};

const STORAGE_KEY = 'anthroweb:timer:v1';

/** The fields worth keeping across a reload. `alert` deliberately is not one. */
type PersistedState = Pick<EngineState,
    'mode' | 'deadline' | 'elapsedBefore' | 'totalMs' | 'intervalConfig' | 'legStartedAt' | 'laps'>;

/**
 * Reconstruct the running state from what was persisted.
 *
 * `running` is deliberately *not* persisted, and this is why. It is the one piece
 * of state that is not derivable from a wall clock, and persisting it would make
 * it a second source of truth that can disagree with the deadline: a tab closed
 * mid-run and reopened would restore "running", which happens to be right, until
 * the deadline passed while it was closed, at which point a persisted `true` would
 * show a live Pause button on a timer that expired hours ago.
 *
 * So it is derived from the timestamps, which cannot be wrong:
 *   - a countdown whose deadline is still ahead is running,
 *   - a stopwatch or interval whose leg started and has not finished is running,
 *   - anything past its end restores as finished, and the expiry logic alerts on
 *     the first tick exactly as it would have while the tab was open.
 */
function restoreRunning(persisted: Partial<PersistedState>, now: number): boolean {
    const { mode, deadline, legStartedAt } = persisted;

    if (mode === 'countdown') {
        // No deadline means nothing was ever started, whatever `legStartedAt` says.
        return typeof deadline === 'number' && deadline > now;
    }

    // The two count-up modes have no deadline, so the leg's own start is the only
    // evidence a run was in progress. Without it, nothing was running.
    if (legStartedAt == null) return false;

    if (mode === 'interval' && persisted.intervalConfig) {
        // An interval run can finish while the tab is closed, so the elapsed time at
        // restore decides. Same arithmetic the live display uses, which is what makes
        // the restored phase the right one rather than a plausible one.
        const banked = typeof persisted.elapsedBefore === 'number' ? persisted.elapsedBefore : 0;
        const elapsed = clampDuration(banked + (now - legStartedAt));
        return phaseAt(elapsed, persisted.intervalConfig) !== null;
    }

    // A stopwatch counts up without ending, so a started leg is a running one.
    return true;
}

/** What a restore produces: the persisted fields, plus two that are re-derived. */
type RestoredState = Partial<PersistedState> & { running?: boolean; acknowledged?: boolean };

function loadPersisted(): RestoredState {
    if (typeof localStorage === 'undefined') return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        if (!parsed || typeof parsed !== 'object') return {};
        return {
            ...parsed,
            // Restoring rather than persisting, so the flag cannot outlive the
            // deadline it was derived from. See `restoreRunning`.
            running: restoreRunning(parsed, Date.now()),
            // Nothing has been seen ending yet, so a restored run that turns out to
            // be over alerts on its first tick.
            acknowledged: false,
        };
    } catch {
        // Corrupt or unreadable. Starting over costs one click, which is not worth
        // a crash on mount.
        return {};
    }
}

function persist(state: EngineState): void {
    if (typeof localStorage === 'undefined') return;
    const payload: PersistedState = {
        mode: state.mode,
        deadline: state.deadline,
        elapsedBefore: state.elapsedBefore,
        totalMs: state.totalMs,
        intervalConfig: state.intervalConfig,
        legStartedAt: state.legStartedAt,
        laps: state.laps,
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
        // Private mode, or the quota is full. The timer keeps working; it just
        // will not survive a reload.
    }
}

export interface EngineApi {
    mode: TimerMode;
    running: boolean;
    /** Epoch ms the current leg ends at. Null when idle or paused. */
    deadline: number | null;
    totalMs: number;
    intervalConfig: IntervalConfig;
    alert: TimerAlert;

    /** All recomputed on a tick. None of it is stored. */
    remaining: number;
    elapsed: number;
    phase: ReturnType<typeof phaseAt>;

    setMode: (mode: TimerMode) => void;
    /** Countdown only. Ignored while running, and a zero duration is refused. */
    setDuration: (ms: number) => void;
    setIntervalConfig: (config: IntervalConfig) => void;
    start: () => void;
    pause: () => void;
    reset: () => void;
    /** Stopwatch splits in order. Persisted, so a reload does not lose them. */
    laps: number[];
    /** Re-arm from a finished state, which is the overlay's "Restart". */
    restart: () => void;
    /**
     * Record a split at the current elapsed time. Stopwatch only.
     *
     * Refused outside a running stopwatch because a lap at a fixed zero is a
     * split of nothing and it would be impossible to tell from a real one
     * afterwards.
     */
    addLap: () => void;
    /** Drop every split. Called by reset, so a new run never inherits the last. */
    clearLaps: () => void;
    /** Extend a running countdown by whole minutes. The overlay's "+5 min". */
    addMinutes: (minutes: number) => void;
    dismissAlert: () => void;
    /** Raise the overlay without a timer having ended, for the preview control. */
    testAlert: () => void;
    /** Raise an alarm-specific overlay. Used by the alarm scheduler. */
    raiseAlarm: (alarmLabel: string) => void;
    /** Hand over the sound preferences. See `useTimerSound`. */
    setChime: (args: ChimeArgs | null) => void;
}

/**
 * Whether a run described by this state has run out of time, as of `now`.
 *
 * A free function rather than an inline expression because it is needed in three
 * places that must agree: the render that derives `running`, and the `start` and
 * `pause` handlers. When those three disagreed the symptom was precise and bad --
 * a timer that had expired kept `running: true` in stored state, so pressing Start
 * hit the `if (prev.running) return prev` guard and did nothing at all, leaving the
 * only way out being Reset. One definition, three call sites.
 *
 * `now` is passed in rather than read here so the callers can use the render's own
 * tick instead of taking a second reading of the wall clock.
 */
function runHasEnded(
    state: Pick<EngineState, 'mode' | 'deadline' | 'legStartedAt' | 'elapsedBefore' | 'intervalConfig'>,
    now: number,
): boolean {
    if (state.mode === 'countdown') {
        return state.deadline !== null && state.deadline <= now;
    }
    // The count-up modes. The interval one has a real end, derived from elapsed;
    // a stopwatch has none.
    if (state.mode !== 'interval') return false;
    if (state.legStartedAt === null) return false;
    const elapsed = clampDuration(state.elapsedBefore + (now - state.legStartedAt));
    return phaseAt(elapsed, state.intervalConfig) === null;
}

const EngineContext = createContext<EngineApi | null>(null);

/**
 * Two constants rather than a fresh object literal each render.
 *
 * The identity matters: the alert effect below keys on the reason, so an object
 * rebuilt every render would re-fire the sound five times a second. The dependency
 * that lint flags about `finishedReason` is this same problem.
 */
const REASON_TIMEUP: TimerAlert = { kind: 'timeup' };
const REASON_INTERVAL_DONE: TimerAlert = { kind: 'timeup', label: 'Interval run complete' };

// `useTimerEngine` and `useTimerSound` are hooks that live beside their provider so
// the two cannot be split across files and drift out of sync -- the same reason
// `ConfirmModalProvider` and `useConfirmModal` share a file. Fast Refresh wants a
// module to export either components or non-components, not both, so the rule is
// opted out of here explicitly rather than by splitting the file and moving the
// context somewhere less convenient.
/* eslint-disable react-refresh/only-export-components */

/** How often the display repaints. Fast enough to read as continuous, cheap enough to idle. */
const TICK_MS = 200;

export const TimerEngineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<EngineState>(() => ({ ...IDLE, ...loadPersisted() }));
    const [now, setNow] = useState(() => Date.now());

    /**
     * The sound preferences, in a ref rather than in state.
     *
     * The tick has to be able to read the current volume at the moment it fires,
     * but the preferences live in React Query on the page, which unmounts on
     * navigation. Holding them in a ref means a volume change is picked up
     * without the repaint loop being torn down and rebuilt -- a rebuilt loop
     * races against expiry, because the effect that fires the alert is keyed on
     * the same state that schedules the interval.
     */
    const chimeRef = useRef<ChimeArgs | null>(null);

    const setChime = useCallback((args: ChimeArgs | null) => {
        chimeRef.current = args;
    }, []);

    /**
     * Sound, vibration and notification, in that order.
     *
     * Layered because a sound nobody was listening for is a timer that failed,
     * and any one of the three alone leaves that gap: muted and no notification
     * permission means a finished timer that says nothing at all. The order
     * matters too -- audio is the one that still works with the screen off, so
     * it goes first while the context is still live.
     */
    const fireAlert = useCallback((alert: NonNullable<TimerAlert>) => {
        const args = chimeRef.current;
        if (!args) return;

        unlockAudio();
        playChime(args.chime, args.volume);

        if (args.vibrate) {
            const pattern = vibrationPattern(args.chime);
            if (pattern) {
                try {
                    navigator.vibrate(pattern);
                } catch {
                    // Some Android WebViews expose `vibrate` and refuse the
                    // call. The sound has already played; nothing to recover.
                }
            }
        }

        if (args.notify && typeof Notification !== 'undefined') {
            try {
                if (Notification.permission === 'granted') {
                    new Notification(
                        alert.kind === 'alarm' ? (alert.alarmLabel || 'Alarm') : "Time's up",
                        {
                            body: alert.kind === 'alarm'
                                ? 'Your alarm is going off.'
                                : alert.label || 'Your timer has finished.',
                            // The app's own favicon rather than a new asset for
                            // the one notification the app already looks like.
                            icon: '/favicon.ico',
                        },
                    );
                }
            } catch {
                // The constructor can exist with the permission revoked under
                // it, in which case constructing throws.
            }
        }
    }, []);

    // ==================== DERIVED ====================

    /**
     * Banked time plus the live leg.
     *
     * This is the clock the stopwatch and the interval both read, because both
     * count up. For a countdown it is informational only -- the remaining time
     * comes from the deadline, which cannot drift.
     */
    const elapsed = useMemo(() => {
        if (state.mode === 'countdown') {
            const left = state.deadline ? remainingMs(state.deadline, now) : state.totalMs;
            return clampDuration(state.totalMs - left);
        }
        const live = state.running && state.legStartedAt ? now - state.legStartedAt : 0;
        return clampDuration(state.elapsedBefore + live);
    }, [state.mode, state.totalMs, state.deadline, state.elapsedBefore, state.running, state.legStartedAt, now]);

    /** Time left on a countdown. A stopwatch has no "remaining", so 0. */
    const remaining = useMemo(() => {
        if (state.mode !== 'countdown' || !state.deadline) return 0;
        return remainingMs(state.deadline, now);
    }, [state.mode, state.deadline, now]);

    /** The current interval phase, or null when not in interval mode / run over. */
    const phase = useMemo(
        () => (state.mode === 'interval' ? phaseAt(elapsed, state.intervalConfig) : null),
        [state.mode, elapsed, state.intervalConfig],
    );

    /**
     * The end of a run, derived rather than stored.
     *
     * This is the crux of the whole file, and it is worth being explicit about
     * why it is not a `setState` in an effect. A countdown ends when
     * `deadline <= now`. That is a comparison between two values already in hand,
     * so it can be *computed* on every render -- and computing it means the
     * expired state can never lag a render behind the moment it actually happened,
     * which is exactly the bug a stored flag would reintroduce.
     *
     * Detected on a tick rather than by scheduling a `setTimeout` for the
     * deadline. A timeout is the same class of bug this file exists to avoid: it
     * fires late by however long the tab was throttled, and there is no upper bound
     * on that. Polling means the alert lands on the first tick *after* the real
     * moment -- at most one interval late, never unboundedly so.
     *
     * Two ways a run ends, both pure functions of what has already happened:
     *   - a countdown whose deadline has passed, and
     *   - an interval run whose last phase is over, which `phaseAt` reports as null
     *     because there is no phase left to be in.
     */
    const runFinished = state.running && runHasEnded(state, now);

    /**
     * Which of the two endings it was, for the wording on the overlay and the
     * notification body. A countdown that ran out and an interval run that
     * finished need different sentences, and only this can tell them apart.
     */
    const endedByInterval = state.mode === 'interval' && phase === null;

    /**
     * The reason this run ended, shown to the user -- or null while it is still
     * running, and null again once it has been acknowledged.
     *
     * Gated on `acknowledged` because derivation alone would put the overlay back
     * the instant it was dismissed: the run is still loaded and still finished, so
     * the condition is still true. The acknowledgement is the "the user has seen
     * this" half, and it is what makes dismissal stick without having to pretend the
     * run never happened.
     *
     * Kept distinct from `runFinished` for the same reason. Folding the
     * acknowledgement into that one makes "running" depend on the user having
     * dismissed the overlay -- so dismissing a finished timer would report it as
     * running again, with a live Pause button and a spinning ring, and pressing
     * Pause would "pause" a clock with nothing left to run. Two questions, two
     * booleans.
     */
    const finishedReason: TimerAlert = !runFinished || state.acknowledged
        ? null
        : endedByInterval
            ? REASON_INTERVAL_DONE
            : REASON_TIMEUP;

    /**
     * Running as the UI should see it.
     *
     * The stored flag says the user pressed start; this says whether there is still
     * time left to run. After a run ends the two differ, and everything that
     * displays "running" reads this one -- so the pause button, the ring and the nav
     * badge cannot disagree about whether the clock is going.
     */
    const active = state.running && !runFinished;

    /**
     * The overlay's alert: a finished run, or one raised explicitly (an alarm, or
     * the preview control).
     *
     * A finished run takes priority, because it is the thing that actually just
     * happened -- an alarm queued behind a stale manual alert would look like it
     * had never rung.
     */
    const alert: TimerAlert = finishedReason ?? state.alert;

    /**
     * Sound and vibration, once per finished run.
     *
     * The only genuinely imperative part of this, and correctly so: driving an
     * audio graph is an external system being touched, which is what an effect is
     * for. It reads the derived reason rather than setting it, and the
     * `alertedRef` guard is what makes it fire once rather than on every
     * re-render the finished state causes.
     */
    const alertedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!finishedReason) {
            // Cleared rather than left stale, so the next run alerts on its own.
            alertedRef.current = null;
            return;
        }
        const key = `${finishedReason.kind}:${finishedReason.label ?? ''}`;
        if (alertedRef.current === key) return;
        alertedRef.current = key;
        fireAlert(finishedReason);
    }, [finishedReason, fireAlert]);

    // ==================== TICK ====================

    /**
     * The repaint loop, and the only place the wall clock is read.
     *
     * It holds no state and decides nothing. Gated on the *effective* running
     * flag rather than the stored one, so it is torn down the instant a run ends
     * rather than ticking out the rest of the session, and an idle page costs
     * nothing.
     */
    useEffect(() => {
        if (!active) return;
        const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
        return () => window.clearInterval(id);
    }, [active]);

    // ==================== PERSIST ====================

    useEffect(() => {
        persist(state);
    }, [state]);

    // ==================== HANDLERS ====================

    const start = useCallback(() => {
        setState(prev => {
            // `runHasEnded` rather than a bare `prev.running` check. An expired run
            // leaves `running` true in stored state -- it is a historical fact about
            // the run, not a statement about whether time is left -- so testing it
            // directly meant Start on an expired timer returned the state unchanged
            // and did nothing.
            const at = Date.now();
            if (prev.running && !runHasEnded(prev, at)) return prev;
            // `acknowledged: false` on every branch. Starting a run means the next
            // one has not been seen ending yet, and leaving a stale `true` would
            // silently swallow the alert at the end of it.
            //
            // An expired countdown has no time left to resume, so it is re-armed from
            // its own length. Resuming it as-is would restart nothing and
            // immediately re-alert, which reads as a stuck timer.
            //
            // `prev.deadline ?? (at + total)` rather than a plain `prev.deadline`,
            // and the difference is the whole first start. A timer that has never
            // been started has no deadline, so carrying it forward unchanged would
            // start a running countdown with nothing to count down to.
            if (prev.mode === 'countdown') {
                const expired = prev.deadline !== null && prev.deadline <= at;
                const total = prev.totalMs > 0 ? prev.totalMs : 25 * 60 * 1000;
                return {
                    ...prev,
                    totalMs: total,
                    acknowledged: false,
                    running: true,
                    legStartedAt: at,
                    deadline: prev.deadline === null || expired ? at + total : prev.deadline,
                };
            }
            if (prev.mode === 'stopwatch') {
                return { ...prev, acknowledged: false, running: true, legStartedAt: at, deadline: null };
            }
            // `elapsedBefore` is already the elapsed as of the last pause, so
            // starting a leg from it is what makes resume exact rather than
            // approximately right.
            const finished = phaseAt(prev.elapsedBefore, prev.intervalConfig) === null;
            if (finished) {
                return {
                    ...prev,
                    acknowledged: false,
                    elapsedBefore: 0,
                    running: true,
                    legStartedAt: at,
                };
            }
            return { ...prev, acknowledged: false, running: true, legStartedAt: at };
        });
    }, []);

    const pause = useCallback(() => {
        setState(prev => {
            const at = Date.now();
            // Same reasoning as `start`, for the same reason: pausing a run that has
            // already ended is not a thing, and the stored flag does not know that.
            if (!prev.running || runHasEnded(prev, at)) return prev;
            if (prev.mode === 'countdown') {
                // The deadline stays exactly where it is; it simply stops being
                // compared against a moving `now`. Resume pushes it forward by
                // the paused duration, which is what "resume" has to mean.
                return { ...prev, running: false, legStartedAt: null };
            }
            const live = prev.legStartedAt ? at - prev.legStartedAt : 0;
            return {
                ...prev,
                running: false,
                legStartedAt: null,
                elapsedBefore: clampDuration(prev.elapsedBefore + live),
            };
        });
    }, []);

    const reset = useCallback(() => {
        setState(prev => ({
            ...prev,
            running: false,
            deadline: null,
            legStartedAt: null,
            elapsedBefore: 0,
            laps: [],
            alert: null,
        }));
        stopChime();
    }, []);

    /**
     * Re-arm from a finished state.
     *
     * Done as a single update rather than a reset followed by a start. Two
     * updates would be two renders, and `start` reads the state the first one is
     * replacing -- so the reset would be undone. One update has no such window.
     */
    const restart = useCallback(() => {
        setState(prev => {
            const at = Date.now();
            // `acknowledged: false` because this is a brand new run, so its end
            // has not been seen yet. Leaving it true would silence the restart.
            const base = {
                ...prev,
                alert: null,
                acknowledged: false,
                elapsedBefore: 0,
                running: true,
                legStartedAt: at,
            };
            if (prev.mode === 'interval') return { ...base, deadline: null };
            if (prev.mode === 'stopwatch') return { ...base, deadline: null };
            const total = prev.totalMs > 0 ? prev.totalMs : 25 * 60 * 1000;
            return { ...base, totalMs: total, deadline: at + total };
        });
        stopChime();
    }, []);

    /**
     * Switch between countdown, stopwatch and interval.
     *
     * Refused while a run is going, the same as `setDuration` and
     * `setIntervalConfig` below it, and for the same reason: these are not
     * independent fields, they replace each other's configuration wholesale.
     *
     * This used to stop the run instead of refusing, which read as "the timer
     * stopped when I touched the buttons". The chips look like a tab strip, so
     * touching one mid-run was an entirely reasonable thing to do and it silently
     * threw the run away -- no alert, no confirmation, the display simply reset.
     * The two controls already in that panel refused rather than stopping, so
     * this was the odd one out rather than a deliberate choice.
     */
    const setMode = useCallback((mode: TimerMode) => {
        setState(prev => (prev.mode === mode || prev.running
            ? prev
            // A stopwatch carries no duration and an interval carries a shape, and
            // neither converts into the other, so switching abandons the loaded
            // configuration. That is the honest thing to do -- but it is only
            // reachable while stopped, where it costs nothing.
            : { ...prev, mode, deadline: null, legStartedAt: null, elapsedBefore: 0, laps: [], alert: null }));
    }, []);

    const setDuration = useCallback((ms: number) => {
        setState(prev => {
            const total = clampDuration(ms);
            if (total <= 0 || prev.running) return prev;
            return { ...prev, totalMs: total, deadline: null };
        });
    }, []);

    const setIntervalConfigCb = useCallback((config: IntervalConfig) => {
        // Refused while running. Changing the shape mid-run would silently
        // re-derive the current phase from a different timeline.
        setState(prev => (prev.running
            ? prev
            : { ...prev, intervalConfig: config, deadline: null, elapsedBefore: 0 }));
    }, []);

    const addMinutes = useCallback((minutes: number) => {
        setState(prev => {
            if (prev.mode !== 'countdown' || !prev.deadline) return prev;
            const extra = minutes * 60 * 1000;
            return {
                ...prev,
                deadline: prev.deadline + extra,
                // `totalMs` is the ring's denominator. Leaving it alone would
                // make the ring leap backwards the moment time was added, so it
                // grows with the deadline and the arc stays where it was.
                totalMs: prev.totalMs + extra,
            };
        });
    }, []);

    /**
     * Dismiss the overlay.
     *
     * Sets `acknowledged` rather than merely clearing the alert, because the
     * finished state is derived and would otherwise put the overlay straight
     * back. The run is left loaded so "Resume" still has something to resume --
     * which on an expired countdown means nothing, and is why `canResume` on the
     * page checks the deadline rather than just this flag.
     */
    const dismissAlert = useCallback(() => {
        setState(prev => ({ ...prev, acknowledged: true, alert: null }));
        stopChime();
    }, []);

    /**
     * Record a split.
     *
     * The elapsed time is recomputed here from the same banked-plus-live formula
     * the display uses, rather than passed in. Passing it would mean two places
     * compute elapsed, and they would disagree the moment one of them was
     * changed -- a lap that disagrees with the digits above it is worse than no
     * lap at all.
     */
    const addLap = useCallback(() => {
        setState(prev => {
            if (prev.mode !== 'stopwatch' || !prev.running) return prev;
            const live = prev.legStartedAt ? Date.now() - prev.legStartedAt : 0;
            const at = clampDuration(prev.elapsedBefore + live);
            return { ...prev, laps: [...prev.laps, at] };
        });
    }, []);

    const clearLaps = useCallback(() => {
        setState(prev => (prev.laps.length === 0 ? prev : { ...prev, laps: [] }));
    }, []);

    const testAlert = useCallback(() => {
        setState(prev => ({ ...prev, alert: { kind: 'timeup', label: 'This is what time’s up looks like' } }));
        fireAlert({ kind: 'timeup' });
    }, [fireAlert]);

    const raiseAlarm = useCallback((alarmLabel: string) => {
        setState(prev => ({ ...prev, alert: { kind: 'alarm', alarmLabel } }));
        fireAlert({ kind: 'alarm', alarmLabel });
    }, [fireAlert]);

    const value = useMemo<EngineApi>(() => ({
        mode: state.mode,
        /**
     * The stored flag, or the derived one?
     *
     * `active`. Every consumer here wants "is the clock going right now", and
     * after a run has ended the two disagree -- the user pressed start, but
     * there is no longer any time to run down. Exposing the stored flag as
     * `running` would put a live Pause button and a spinning ring on a finished
     * timer.
     */
    running: active,
        deadline: state.deadline,
        totalMs: state.totalMs,
        intervalConfig: state.intervalConfig,
        laps: state.laps,
        alert,
        remaining,
        elapsed,
        phase,
        setMode,
        setDuration,
        setIntervalConfig: setIntervalConfigCb,
        start,
        pause,
        reset,
        restart,
        addLap,
        clearLaps,
        addMinutes,
        dismissAlert,
        testAlert,
        raiseAlarm,
        setChime,
    }), [
        state.mode, active, state.deadline, state.totalMs, state.intervalConfig, state.laps, alert,
        remaining, elapsed, phase,
        setMode, setDuration, setIntervalConfigCb, start, pause, reset, restart, addLap, clearLaps,
        addMinutes, dismissAlert, testAlert, raiseAlarm, setChime,
    ]);

    return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
};

export function useTimer(): EngineApi {
    const context = useContext(EngineContext);
    if (!context) {
        // Thrown rather than defaulted. A timer that silently does nothing when
        // its provider is missing is worse than a crash, because the page still
        // looks like a timer.
        throw new Error('useTimer must be used inside TimerEngineProvider');
    }
    return context;
}

/**
 * Hand the engine the preferences it should alert with.
 *
 * An effect rather than provider props because the preferences live in React
 * Query on the page, and the page unmounts on navigation while the engine does
 * not. Registering them here is what lets a countdown started on the timer page
 * still ring correctly after the user has gone somewhere else for the
 * twenty-five minutes. Nothing re-registers on navigation, so the last value
 * the page set simply stands.
 */
export function useTimerSound(settings: ChimeArgs): void {
    const { setChime } = useTimer();
    useEffect(() => {
        setChime(settings);
    }, [settings, setChime]);
}
