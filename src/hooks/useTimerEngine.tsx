import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
    ALERT_VOLUME,
    DEFAULT_INTERVAL,
    MINUTE,
    clampDuration,
    nextStartAt,
    normalizeIntervalConfig,
    phaseAt,
    progressFraction,
    remainingMs,
    type IntervalConfig,
} from '../utils/timerMath';
import { playChime, stopChime, unlockAudio } from '../utils/timerChime';
import { showNotification } from '../utils/timerNotification';

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
    /** Whether the alert for the current finished run has already sounded. */
    alerted: boolean;
    alert: TimerAlert;
    /** Unique id for the current run, used to dedupe saved study sessions. */
    runId: string | null;
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
    alerted: true,
    alert: null,
    runId: null,
};

const STORAGE_KEY = 'anthroweb:timer:v1';

/** The fields worth keeping across a reload. `alert` deliberately is not one. */
type PersistedState = Pick<EngineState,
    'mode' | 'deadline' | 'elapsedBefore' | 'totalMs' | 'intervalConfig' | 'legStartedAt' | 'laps' | 'runId' | 'acknowledged' | 'alerted'>;

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
        // The interval config goes through the same normaliser a database row does,
        // rather than being trusted raw.
        //
        // The blob is written by this build but read by whichever build is running,
        // so it carries whatever shape an older one put there -- including fields
        // that have since been deleted, and values outside the ranges the editor
        // would have clamped. Normalising rebuilds the object from the current
        // shape, which drops a removed field on the next load instead of carrying
        // it around forever, and clamps the rest before the phase arithmetic below
        // sees them. It also matters that this happens *before* `restoreRunning`:
        // that function replays the elapsed time through the config to decide which
        // phase a closed tab should wake up in, and a config with an out-of-range
        // phase length in it would put that answer in the wrong place.
        // `restoreRunning` replays the elapsed time through the config to decide
        // which phase a closed tab should wake up in, so the config is normalised
        // once and shared with it rather than passed through raw. A config with an
        // out-of-range phase length in it would put that answer in the wrong place.
        const restored: Partial<PersistedState> = {
            ...parsed,
            intervalConfig: normalizeIntervalConfig(parsed.intervalConfig),
        };
        return {
            ...restored,
            // Restoring rather than persisting, so the flag cannot outlive the
            // deadline it was derived from. See `restoreRunning`.
            running: restoreRunning(restored, Date.now()),
            // A run that was dismissed stays dismissed across a reload; one that
            // ended while the app was shut has not been seen yet.
            acknowledged: parsed.acknowledged === true,
            // Whether the alert has already sounded for this finished run. Old
            // blobs lack it, so they chime once on the next open and then stop.
            alerted: parsed.alerted === true,
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
        runId: state.runId,
        acknowledged: state.acknowledged,
        alerted: state.alerted,
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
    /** 0..1 through a countdown, or null where there is no end to measure. */
    progress: number | null;
    phase: ReturnType<typeof phaseAt>;

    /**
     * When the armed scheduled start comes round, or null when nothing is armed.
     * Independent of mode, so the card can describe the schedule whichever mode is
     * showing.
     */
    startDueAt: Date | null;
    /**
     * The same instant, but only when the wait is what the dial is showing. Non-null
     * means the digits belong to `untilStartMs` rather than to `phase`.
     */
    scheduledFor: Date | null;
    /** Milliseconds until then, never negative. Null whenever `scheduledFor` is. */
    untilStartMs: number | null;

    setMode: (mode: TimerMode) => void;
    /** Countdown only. Ignored while running, and a zero duration is refused. */
    setDuration: (ms: number) => void;
    setIntervalConfig: (config: IntervalConfig) => void;
    start: (startPhase?: 'work' | 'rest' | 'long') => void;
    startPhase: (phase: 'work' | 'rest' | 'long') => void;
    startWork: () => void;
    startRest: () => void;
    startLongRest: () => void;
    pause: () => void;
    reset: () => void;
    /** Stopwatch splits in order. Persisted, so a reload does not lose them. */
    laps: number[];
    /** Unique id for the current run, for deduping saved sessions. */
    runId: string | null;
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

// `useTimerEngine` is the hook that lives beside its provider so the two cannot
// be split across files and drift out of sync -- the same reason
// `ConfirmModalProvider` and `useConfirmModal` share a file. Fast Refresh wants a
// module to export either components or non-components, not both, so the rule is
// opted out of here explicitly rather than by splitting the file and moving the
// context somewhere less convenient.
/* eslint-disable react-refresh/only-export-components */

/**
 * The repaint loop, on `requestAnimationFrame` rather than on a timer.
 *
 * This was a `setInterval` at 200ms, which was fine while the display showed whole
 * seconds and quietly wrong the moment it showed hundredths. A hundredth changes
 * every 10ms, so a 200ms repaint showed one value in twenty -- the fraction
 * appeared to jump rather than count, which is the bug this replaced.
 *
 * `requestAnimationFrame` is the right clock for this and not just a faster one.
 * It fires once per *actual paint*, so it cannot run ahead of the screen and queue
 * work that will be thrown away, and it runs at the display's own refresh rate --
 * 60Hz on a laptop, 90 or 120 on a phone. A fixed 10ms interval would ask for 100
 * renders a second and get whatever survived, which is more CPU for no additional
 * visible frame.
 *
 * The honest limit, since it is worth stating: hundredths are 100 distinct states
 * a second, and no 60Hz screen can show 100 of them. The fraction now advances as
 * fast as the hardware can present it rather than jumping twenty-fold, which is
 * the whole of what is achievable here. A 120Hz display resolves nearly all of
 * them.
 *
 * It also stops on its own when the tab is hidden, which is correct rather than a
 * loss: nothing is visible to repaint, and every derived value is recomputed from
 * the deadline when the tab comes back, so nothing is lost but the frames nobody
 * would have seen.
 */
export const TimerEngineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<EngineState>(() => ({ ...IDLE, ...loadPersisted() }));
    const [now, setNow] = useState(() => Date.now());

    /**
     * Sound and notification, in that order, both every time.
     *
     * Layered because a sound nobody was listening for is a timer that failed,
     * and either one alone leaves that gap: no sound and no notification is a
     * finished timer that says nothing at all. The order matters too -- audio is
     * the one that still works with the screen off, so it goes first while the
     * context is still live.
     *
     * Neither is conditional any more, and that is the point. There used to be a
     * panel that could switch the notification off, the screen lock off, and the
     * volume down, and every one of those was a way for the timer to end without
     * telling anybody -- which is the failure this page exists to prevent, offered
     * as three checkboxes. The level is a constant and the rest is unconditional.
     */
    const fireAlert = useCallback((alert: NonNullable<TimerAlert>) => {
        unlockAudio();
        playChime(ALERT_VOLUME);
        void showNotification(
            alert.kind === 'alarm'
                ? { title: alert.alarmLabel || 'Alarm', body: 'Your alarm is going off.' }
                : { title: "Time's up", body: alert.label || 'Your timer has finished.' },
        );
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

    /**
     * How far through its run a countdown is: 0 at the start, 1 at the deadline.
     *
     * Null for the two count-up modes, which have no end to measure against and
     * so have no honest arc.
     *
     * Computed here rather than by the page because it needs `now`, and the engine
     * owns the one reading of the wall clock the display is built on. The page
     * used to call `Date.now()` itself to fill the ring, which took a second
     * reading a fraction of a tick after the digits above it were derived -- so
     * the arc and the numbers were always very slightly out of step, and nothing
     * about that is visible until you look for it.
     */
    const progress = useMemo(() => (
        state.mode === 'countdown' && state.deadline !== null
            ? progressFraction(state.deadline, state.totalMs, now)
            : null
    ), [state.mode, state.deadline, state.totalMs, now]);

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
     *
     * `state.running || state.legStartedAt !== null` rather than `state.running`,
     * and the second clause is the case this file previously could not see at all:
     * a run that ended while the document was closed. `running` is deliberately not
     * persisted, so a countdown whose deadline passed an hour ago comes back from
     * `localStorage` with `running: false` -- `restoreRunning` reads the timestamps,
     * finds the deadline in the past, and correctly refuses to claim a live run --
     * and gating on it alone meant that run finished in silence. No chime, no
     * notification, no overlay: the single most expensive failure this page has,
     * and it hit precisely the runs nobody was sitting in front of.
     *
     * `legStartedAt` is what distinguishes that from a *paused* countdown, which is
     * the one case that must stay silent: pausing leaves the deadline where it is,
     * so it drifts past while the run is stopped, and every one of `pause`, `reset`
     * and `setMode` nulls `legStartedAt` on the way out. A leg that is still stamped
     * on a run that is no longer running can only have come back from storage, which
     * is exactly the case that needs telling.
     */
    const runFinished = runHasEnded(state, now)
        && (state.running || state.legStartedAt !== null);

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
     * When the armed schedule comes round, or null when nothing is scheduled.
     *
     * This is what lets the clock show the wait. Without it, setting a start time was
     * a thing you did and then could not see: the card said when, and the dial above
     * it sat on the pad showing nothing about it. A control whose effect is invisible
     * is the same failure as one with no effect at all, and this is what makes the
     * waiting visible in the one place the user is already looking.
     *
     * Derived from `now` rather than held, which is what makes it correct. Held, it
     * would have to be re-synced in three places -- when the schedule is set, when a
     * restored one is read at mount, and when it is cleared -- and a missed sync is
     * a clock counting down to nothing. Derived, there is one calculation and it is
     * right for any instant, including one the tab was asleep through.
     *
     * Independent of the current mode on purpose. The card is worth reading whichever
     * mode is showing, and a caption that disappeared whenever you glanced at a
     * countdown would be a caption that was not there when you needed it -- so this
     * answers "when is the armed schedule" and `scheduledFor` below answers "is the
     * dial showing it".
     */
    const startDueAt = useMemo(() => {
        const startAt = state.intervalConfig.startAt;
        if (startAt == null) return null;
        const shown = nextStartAt(startAt, now);
        // Same roll-forward as the arming block below, and it has to be the same
        // rule or the dial and the checker disagree about what the schedule means.
        // Left relaxed, `nextStartAt` puts a minute that is already under the clock
        // at the start of that minute -- which is already past -- so the ring would
        // sit at 00:00.00 reading "starting now" for up to a minute while nothing
        // was going to fire, and then jump to tomorrow on its own. A countdown that
        // lies about its own deadline is worse than one that is merely unhelpful.
        return shown && shown.getTime() < now ? (nextStartAt(startAt, now + MINUTE) ?? shown) : shown;
    }, [state.intervalConfig.startAt, now]);

    /**
     * The same instant, but only when the wait is what the clock is showing.
     *
     * The three exclusions are each a case where it is not. Interval mode only,
     * because that is the mode the schedule fires in and the card it was set on. No
     * run going, so a live session keeps its own digits. And nothing run *yet*, so a
     * session paused part-way through shows how much of it is left rather than being
     * replaced by a countdown to tomorrow.
     */
    const scheduledFor = useMemo(() => {
        if (startDueAt == null || state.mode !== 'interval' || active) return null;
        if (state.elapsedBefore > 0) return null;
        return startDueAt;
    }, [startDueAt, state.mode, state.elapsedBefore, active]);

    /**
     * Milliseconds until it is due, or null when nothing is scheduled.
     *
     * Floored at zero rather than allowed to go negative. There is up to a second
     * between the minute arriving and the checker noticing, and in that gap a
     * negative value would render as `-00:00:01` on the dial -- the one place on the
     * page where a formatting accident is unmissable. Zero is also the honest reading
     * for that instant: it is due, and it has not started yet.
     */
    const untilStartMs = useMemo(
        () => (scheduledFor ? Math.max(0, scheduledFor.getTime() - now) : null),
        [scheduledFor, now],
    );

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
        // A finished run that already chimed (on an earlier open, or before a
        // reload) must not chime again: the overlay stays until it is dismissed,
        // but the sound and notification fire once per run.
        if (state.alerted) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState(prev => ({ ...prev, alerted: true }));
        fireAlert(finishedReason);
    }, [finishedReason, fireAlert, state.alerted]);

    /**
     * A sound at every phase boundary, not only at the end of the run.
     *
     * The whole-run alert above covers "the session is over", but an interval
     * session is made of several intervals and the user needs to know when each
     * one stops -- a focus phase ending is the moment to switch to rest, and
     * nothing about it is visible if the tab is not in front of you. So every
     * transition between phases rings, the same way the final one does.
     *
     * Tracked by a phase key rather than by identity, because `phaseAt` hands
     * back a fresh object each tick and an identity comparison would fire on
     * every render. The first phase of a run is recorded but not announced:
     * starting is deliberately silent, and a restored run must not announce the
     * phase it happened to wake up in.
     */
    const prevPhaseRef = useRef<string | null>(null);
    useEffect(() => {
        if (state.mode !== 'interval' || !state.running) {
            prevPhaseRef.current = null;
            return;
        }
        const key = phase ? `${phase.kind}:${phase.round}:${phase.index}` : null;
        if (prevPhaseRef.current !== null && prevPhaseRef.current !== key && key !== null) {
            unlockAudio();
            playChime(ALERT_VOLUME);
            void showNotification({
                title: phase!.kind === 'work' ? 'Focus' : phase!.kind === 'long' ? 'Long rest' : 'Rest',
                body: 'The next phase has begun.',
            });
        }
        prevPhaseRef.current = key;
    }, [state.mode, state.running, phase]);

    // ==================== TICK ====================

    /**
     * The repaint loop, and the only place the wall clock is read.
     *
     * It holds no state and decides nothing. Gated on the *effective* running
     * flag rather than the stored one, so it is torn down the instant a run ends
     * rather than ticking out the rest of the session, and an idle page costs
     * nothing.
     *
     * The one exception is a page waiting for a scheduled start, which is idle in
     * exactly the sense that would tear this loop down and is the one case where a
     * frozen clock is wrong. The countdown to the start is made of the same `now`
     * everything else is, so with the loop down it sits at one value while the wall
     * clock walks away from it -- a wait that never visibly gets shorter. Ticking
     * while armed is the cost of showing the wait, and it stops the moment the
     * schedule clears.
     *
     * Rescheduled before the state update rather than after it: React renders
     * asynchronously, so queueing the next frame first is what keeps the loop
     * independent of how long a render takes. A render that overruns its frame
     * delays one repaint; it cannot stop the loop.
     */
    useEffect(() => {
        if (!active && scheduledFor == null) return;
        let frame = 0;
        const repaint = () => {
            frame = window.requestAnimationFrame(repaint);
            setNow(Date.now());
        };
        frame = window.requestAnimationFrame(repaint);
        return () => window.cancelAnimationFrame(frame);
    }, [active, scheduledFor]);

    // ==================== SCHEDULED START ====================

    /**
     * Starts the session on its own when the armed time arrives.
     *
     * This is the thing that reads `startAt`. Until now the field was written by a
     * control and read by nothing at all, which is why it was removed; it is back
     * only because there is now something on this side of it.
     *
     * Read through a ref rather than from `state` directly, for the same reason
     * `useAlarmScheduler` does: the checker runs on an interval, and closing over
     * `state` would tear that interval down and rebuild it on every keystroke in
     * the editor and every frame of a running timer.
     *
     * The due instant is computed once, when the schedule is set, and then held. That
     * is the whole design, and getting it wrong makes the feature impossible:
     * `nextStartAt` answers "the next time this minute comes round, no earlier than
     * now", so recomputing it on every poll would return a time in the future every
     * time and the schedule could never become due at all.
     *
     * Holding it also gives a shut page the right behaviour for free. A closed app
     * has no engine mounted, so on reopening the instant is computed against the
     * clock as it is then, and a minute that went by while the app was shut resolves
     * to tomorrow -- so nothing starts hours late on the strength of a stored value
     * that has been sitting there. A tab that was merely backgrounded keeps its held
     * instant instead and fires the first time it is asked, which is the point of a
     * scheduled start not requiring you to be in front of the screen.
     */
    const stateRef = useRef(state);
    const armedRef = useRef<{ startAt: number | null; dueAt: number | null }>({
        startAt: null, dueAt: null,
    });

    useEffect(() => {
        stateRef.current = state;
        // Arming lives here rather than inside the checker so that it happens the
        // moment the schedule is set, not on the first poll afterwards. Lazily arming
        // is the same bug in a different costume: a poll that arrives after the minute
        // has already gone by would resolve the schedule to *tomorrow*, so a schedule
        // armed from a page that had been open a while would silently never fire.
        const startAt = state.intervalConfig.startAt;
        if (startAt == null) {
            armedRef.current = { startAt: null, dueAt: null };
            return;
        }
        if (armedRef.current.startAt === startAt) return;

        // The schedule's own reading of itself, and the instant the checker acts on
        // -- which are not always the same, and the difference is the whole of this
        // block.
        //
        // `nextStartAt` is relaxed at the minute boundary on purpose: a schedule
        // typed for 09:05 while the clock reads 09:05:42 comes back as 09:05:00
        // *today*, so the dial can count down to "now" rather than report a
        // twenty-four hour wait for a time that is already happening. That is the
        // right answer for the display and the wrong one here, because as a fire
        // instant it is in the past from the moment it is computed -- so the first
        // poll after arming started the session immediately, and a schedule armed at
        // 09:05:42 ran at 09:05:42. A minute already under the clock has no moment
        // left to be armed for, so it resolves to the next time that minute comes
        // round instead.
        //
        // Strictly *before*, not `<=`: arming at exactly 09:05:00.000 has not missed
        // anything, and that has to fire immediately rather than wait a day. The
        // second call asks the same question from a minute later, which is what makes
        // `nextStartAt` roll a spent minute to tomorrow -- so this is still the one
        // calendar walk, not a second implementation of it.
        const shown = nextStartAt(startAt, Date.now());
        if (!shown) {
            armedRef.current = { startAt: null, dueAt: null };
            return;
        }
        const at = Date.now();
        const next = shown.getTime() < at ? nextStartAt(startAt, at + MINUTE) : shown;
        armedRef.current = { startAt, dueAt: (next ?? shown).getTime() };
    }, [state]);

    useEffect(() => {
        /**
         * Polling this often rather than every frame: the due time is a minute of
         * day, so the precision anyone can perceive is a second, and the state update
         * this triggers is a full re-render of the page.
         */
        const CHECK_MS = 1000;

        const check = () => {
            const current = stateRef.current;
            const dueAt = armedRef.current.dueAt;
            if (dueAt == null || Date.now() < dueAt) return;
            const startAt = armedRef.current.startAt;
            if (startAt == null) return;

            // A schedule only belongs to the interval session. Arming it while a
            // countdown is on screen would mean the field started a *different* kind
            // of run than the one it was set on, which is not what setting it on that
            // card means. It stays stored and fires if the user returns to interval
            // mode.
            if (current.mode !== 'interval') return;
            // Not started on top of a run already going. `state.running` alone is
            // wrong for this question for the same reason it is wrong everywhere else
            // in this file: it stays true after a run ends, so a finished timer would
            // look busy forever and the schedule would never fire again.
            //
            // `Date.now()` rather than the `now` this file keeps in state, and that is
            // not an inconsistency. `now` only advances inside the repaint loop, which
            // is torn down the moment a run ends and is throttled to nothing in a
            // background tab -- so it is the wrong answer precisely when the question
            // is asked. This checker reads the clock directly two lines above for the
            // due comparison; asking for the same instant here costs nothing and
            // cannot go stale.
            if (current.running && !runHasEnded(current, Date.now())) return;

            // Cleared synchronously, before the state update, and that is the whole of
            // the double-fire guard. `check()` is reachable twice in one tick -- on
            // mount, on `focus` and on `visibilitychange`, and a tab regaining focus
            // fires both -- and the second call would otherwise read a pre-update state
            // and start a second run on top of the first. Re-arming from scratch here
            // is safe rather than merely sufficient: the minute just went by, so a
            // second call re-arms to *tomorrow* and correctly declines to fire.
            armedRef.current = { startAt: null, dueAt: null };

            // Clearing the schedule in the same update that starts the run is what
            // makes it one-shot. There is no separate "fired today" bookkeeping to get
            // out of step with the clock, and a session that starts itself at 09:00
            // cannot also start itself at 09:30 because nobody noticed.
            //
            // No sound and no notification. The run beginning is not an event the user
            // needs to be woken for -- they set it precisely so they would not have to
            // be there -- and an alert here would go off in a tab nobody is looking
            // at. The ring starts moving, which is the feedback.
            setState(prev => {
                // Same reset `start()` does, and for the same reason. `elapsedBefore`
                // holds however far the *previous* run got, and a finished run leaves it
                // at the end of the sequence. Starting from there would begin a "new"
                // session already finished, alert immediately, and look like a timer
                // that cannot be restarted -- which is precisely the bug the branch in
                // `start()` was written to avoid.
                const exhausted = phaseAt(prev.elapsedBefore, prev.intervalConfig) === null;
                // When the previous run was exhausted, begin the new one in the
                // configured start phase rather than always at work.
                let initialElapsed = prev.elapsedBefore;
                if (exhausted) {
                    const phase = prev.intervalConfig.startPhase ?? 'work';
                    if (phase === 'work') initialElapsed = 0;
                    else {
                        const workMs = prev.intervalConfig.workSec * 1000;
                        let t = 0;
                        let found: number | null = null;
                        const maxRounds = prev.intervalConfig.totalRounds > 0 ? prev.intervalConfig.totalRounds : 500;
                        for (let round = 1; round <= maxRounds; round++) {
                            t += workMs;
                            const isLong = (prev.intervalConfig.roundsBeforeLong > 0
                                && round % prev.intervalConfig.roundsBeforeLong === 0);
                            const matches = (phase === 'long') ? isLong : !isLong;
                            if (matches) { found = t; break; }
                            t += isLong ? prev.intervalConfig.longRestSec * 1000 : prev.intervalConfig.restSec * 1000;
                            if (prev.intervalConfig.totalRounds > 0 && round === prev.intervalConfig.totalRounds) break;
                        }
                        initialElapsed = found ?? 0;
                    }
                }
                return {
                    ...prev,
                    acknowledged: false,
                    alerted: false,
                    running: true,
                    legStartedAt: Date.now(),
                    elapsedBefore: initialElapsed,
                    intervalConfig: { ...prev.intervalConfig, startAt: null },
                };
            });
        };

        check();
        const id = window.setInterval(check, CHECK_MS);
        // Re-checking on the way back in is what covers the tab that was asleep or
        // backgrounded across the due time. `setInterval` in a background tab is
        // throttled hard enough to be minutes late, and the whole point of a scheduled
        // start is that it does not need the tab to be in front of you.
        const onWake = () => { if (document.visibilityState === 'visible') check(); };
        document.addEventListener('visibilitychange', onWake);
        window.addEventListener('focus', check);
        return () => {
            window.clearInterval(id);
            document.removeEventListener('visibilitychange', onWake);
            window.removeEventListener('focus', check);
        };
    }, []);

    // ==================== PERSIST ====================

    useEffect(() => {
        persist(state);
    }, [state]);

    // ==================== HANDLERS ====================

    const start = useCallback((startPhase?: 'work' | 'rest' | 'long') => {
        try { unlockAudio(); } catch { /* ignore */ }
        // `now` only advances inside the repaint interval, which does not exist
        // until something is running. Pressing Start minutes after the page
        // settled left it at its mount value, so `remaining` compared a fresh
        // deadline against a stale clock and reported the idle time as time
        // still to run -- a 59 second timer read 01:07 after eight idle seconds.
        // Re-seeding it here is what makes the first frame exact.
        setNow(Date.now());
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
                    alerted: false,
                    running: true,
                    legStartedAt: at,
                    deadline: prev.deadline === null || expired ? at + total : prev.deadline,
                    runId: (prev.deadline !== null && !expired) ? prev.runId : (prev.runId ?? crypto.randomUUID()),
                };
            }
            if (prev.mode === 'stopwatch') {
                return { ...prev, acknowledged: false, alerted: false, running: true, legStartedAt: at, deadline: null, runId: prev.elapsedBefore > 0 ? prev.runId : (prev.runId ?? crypto.randomUUID()) };
            }
            // `elapsedBefore` is already the elapsed as of the last pause, so
            // starting a leg from it is what makes resume exact rather than
            // approximately right.
            const finished = phaseAt(prev.elapsedBefore, prev.intervalConfig) === null;
            const forcePhase = startPhase !== undefined;
            if (finished || prev.elapsedBefore === 0 || forcePhase) {
                const phase = startPhase ?? prev.intervalConfig.startPhase ?? 'work';
                // Begin at the start of the chosen phase. The rest of the
                // sequence then follows naturally from there.
                // initialElapsed is the elapsed time at the START of the chosen phase.
                // For 'work' that is 0; for a rest phase it is the end of the
                // preceding work block.
                let initialElapsed = 0;
                if (phase === 'work') initialElapsed = 0;
                else if (phase === 'rest' || phase === 'long') {
                    // elapsed at the start of the first matching rest
                    const workMs = prev.intervalConfig.workSec * 1000;
                    const restMs = prev.intervalConfig.restSec * 1000;
                    const longMs = prev.intervalConfig.longRestSec * 1000;
                    let t = 0;
                    let foundElapsed: number | null = null;
                    const maxRounds = prev.intervalConfig.totalRounds > 0 ? prev.intervalConfig.totalRounds : 500;
                    for (let round = 1; round <= maxRounds; round++) {
                        t += workMs; // end of this work block
                        const isLong = (prev.intervalConfig.roundsBeforeLong > 0
                            && round % prev.intervalConfig.roundsBeforeLong === 0);
                        const matches = (phase === 'long') ? isLong : !isLong;
                        if (matches) { foundElapsed = t; break; }
                        t += isLong ? longMs : restMs;
                        if (prev.intervalConfig.totalRounds > 0 && round === prev.intervalConfig.totalRounds) break;
                    }
                    if (foundElapsed !== null) initialElapsed = foundElapsed;
                    else initialElapsed = 0;
                }
                return {
                    ...prev,
                    acknowledged: false,
                    alerted: false,
                    elapsedBefore: initialElapsed,
                    running: true,
                    legStartedAt: at,
                    intervalConfig: startPhase ? { ...prev.intervalConfig, startPhase } : prev.intervalConfig,
                    runId: (prev.elapsedBefore > 0 && !finished) ? prev.runId : (prev.runId ?? crypto.randomUUID()),
                };
            }
            return { ...prev, acknowledged: false, alerted: false, running: true, legStartedAt: at, runId: prev.runId ?? crypto.randomUUID() };
        });
    }, []);

    // The aliases below forward to `start` with a fixed phase.
    const startWork = useCallback(() => { start('work'); }, [start]);
    const startRest = useCallback(() => { start('rest'); }, [start]);
    const startLongRest = useCallback(() => { start('long'); }, [start]);
    const startPhaseAlias = useCallback((phase: 'work' | 'rest' | 'long') => { start(phase); }, [start]);

    const pause = useCallback(() => {
        // Same stale-clock problem as `start`, seen from the other side: the leg
        // is banked against the moment the pause is pressed, so a stale `now`
        // would bank a run that is slightly too long.
        setNow(Date.now());
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
        setNow(Date.now());
        setState(prev => ({
            ...prev,
            running: false,
            deadline: null,
            legStartedAt: null,
            elapsedBefore: 0,
            laps: [],
            alert: null,
            acknowledged: true,
            alerted: true,
            runId: null,
            intervalConfig: { ...prev.intervalConfig, startAt: null },
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
        setNow(Date.now());
        setState(prev => {
            const at = Date.now();
            // `acknowledged: false` because this is a brand new run, so its end
            // has not been seen yet. Leaving it true would silence the restart.
            const phase = prev.intervalConfig.startPhase ?? 'work';
            let initialElapsed = 0;
            if (phase !== 'work' && prev.mode === 'interval') {
                const workMs = prev.intervalConfig.workSec * 1000;
                let t = 0;
                let found: number | null = null;
                const maxRounds = prev.intervalConfig.totalRounds > 0 ? prev.intervalConfig.totalRounds : 500;
                for (let round = 1; round <= maxRounds; round++) {
                    t += workMs;
                    const isLong = (prev.intervalConfig.roundsBeforeLong > 0
                        && round % prev.intervalConfig.roundsBeforeLong === 0);
                    const matches = (phase === 'long') ? isLong : !isLong;
                    if (matches) { found = t; break; }
                    t += isLong ? prev.intervalConfig.longRestSec * 1000 : prev.intervalConfig.restSec * 1000;
                    if (prev.intervalConfig.totalRounds > 0 && round === prev.intervalConfig.totalRounds) break;
                }
                initialElapsed = found ?? 0;
            }
            const base = {
                ...prev,
                alert: null,
                acknowledged: false,
                alerted: false,
                elapsedBefore: prev.mode === 'interval' ? initialElapsed : 0,
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
        setState(prev => {
            // `runHasEnded` rather than a bare `prev.running`, and the difference
            // is the whole bug this was reported as.
            //
            // `running` in stored state is a historical fact -- "the user pressed
            // start" -- and it deliberately stays true after a run finishes. So
            // testing it directly meant that a countdown which had run out left
            // every mode switch refusing: the buttons were enabled (the UI reads
            // the *derived* running flag, which is false once a run ends) and
            // clicking them did nothing at all. `runHasEnded` asks the question
            // that is actually meant -- is there still time left to run -- and is
            // the same test `start` and `pause` already use.
            const at = Date.now();
            if (prev.mode === mode || (prev.running && !runHasEnded(prev, at))) return prev;
            // A stopwatch carries no duration and an interval carries a shape, and
            // neither converts into the other, so switching abandons the loaded
            // configuration. That is the honest thing to do -- but it is only
            // reachable while stopped, where it costs nothing.
            return { ...prev, mode, running: false, deadline: null, legStartedAt: null, elapsedBefore: 0, laps: [], alert: null, acknowledged: true, alerted: true, runId: null };
        });
    }, []);

    const setDuration = useCallback((ms: number) => {
        setState(prev => {
            const total = clampDuration(ms);
            // Same `runHasEnded` reasoning as `setMode`: a finished run is still
            // flagged as having run, and refusing the pad on a timer that is
            // sitting at 00:00 is the same dead control.
            if (total <= 0 || (prev.running && !runHasEnded(prev, Date.now()))) return prev;
            return { ...prev, totalMs: total, deadline: null };
        });
    }, []);

    const setIntervalConfigCb = useCallback((config: IntervalConfig) => {
        // Refused while there is time left to run. Changing the shape mid-run would
        // silently re-derive the current phase from a different timeline.
        setState(prev => ((prev.running && !runHasEnded(prev, Date.now()))
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
        setState(prev => ({ ...prev, acknowledged: true, alerted: true, alert: null }));
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
        runId: state.runId,
        alert,
        remaining,
        elapsed,
        progress,
        phase,
        startDueAt,
        scheduledFor,
        untilStartMs,
        setMode,
        setDuration,
        setIntervalConfig: setIntervalConfigCb,
        start,
        startPhase: startPhaseAlias,
        startWork,
        startRest,
        startLongRest,
        pause,
        reset,
        restart,
        addLap,
        clearLaps,
        addMinutes,
        dismissAlert,
        testAlert,
        raiseAlarm,
    }), [
        state.mode, state.runId, active, state.deadline, state.totalMs, state.intervalConfig, state.laps, alert,
        remaining, elapsed, progress, phase, startDueAt, scheduledFor, untilStartMs,
        setMode, setDuration, setIntervalConfigCb, start, startPhaseAlias, startWork, startRest, startLongRest,
        pause, reset, restart, addLap, clearLaps, addMinutes, dismissAlert, testAlert, raiseAlarm,
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
