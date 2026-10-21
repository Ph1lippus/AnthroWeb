import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coffee, Flag, Maximize2, Minimize2, Moon, Play, RotateCcw, Square, Zap } from 'lucide-react';
import Title from '../Components/Title';
import ConfirmModal from '../Components/ConfirmModal';
import DurationPad from '../Components/Timer/DurationPad';
import TimerDisplay from '../Components/Timer/TimerDisplay';
import TimeUpOverlay from '../Components/Timer/TimeUpOverlay';
import AlarmsPanel from '../Components/Timer/AlarmsPanel';
import IntervalEditor from '../Components/Timer/IntervalEditor';
import { useTimer, type TimerMode } from '../hooks/useTimerEngine';
import { useSaveSession } from '../hooks/useAcademic';
import StudySessions from '../Components/Study/StudySessions';
import WorldClockPanel from '../Components/Timer/WorldClockPanel';
import { useTimerDocumentTitle } from '../hooks/useTimerDocumentTitle';
import { useWakeLock } from '../hooks/useWakeLock';
import { useNotice } from '../Components/Feedback/useNotice';
import { useAlarmScheduler } from '../hooks/useAlarmScheduler';
import { queryKeys } from '../utils/queryKeys';
import { buildLaps, completedBreakMs, formatAlarmTime, formatTimer, nextAlarmFire, phaseAt } from '../utils/timerMath';
import { toDateString } from '../utils/dates';
import { unlockAudio } from '../utils/timerChime';
import { requestNotificationPermission } from '../utils/timerNotification';
import {
    createTimerAlarm,
    deleteTimerAlarm,
    getTimerAlarms,
    updateTimerAlarm,
    type AlarmDraft,
    type TimerAlarm,
} from '../services/timerService';

/**
 * The name each mode's card wears.
 *
 * `Countdown` and `Stopwatch` and `Intervals` are not three views of one thing
 * that you pick between -- they are three instruments sharing a display, and
 * each owns the fields that configure it. So each gets a card of its own, always
 * on screen, and the card's own header is what selects it.
 */
const MODE_LABEL: Record<TimerMode, string> = {
    countdown: 'Countdown',
    stopwatch: 'Stopwatch',
    interval: 'Intervals',
};

/**
 * One mode's container: its name, the control that makes it the active mode,
 * and its own fields.
 *
 * The header is the switch rather than a segmented strip floating above all
 * three. Choosing a mode and configuring it are the same gesture, and the fields
 * a card owns are visibly the fields of that card -- which is the thing the
 * single-container layout could not express, because the two other modes were
 * only ever "the one that is not selected".
 *
 * Disabled while running, like the pad and the interval editor inside it.
 * `setMode` refuses mid-run rather than stopping the run, and a control that
 * silently ignores you is worse than one that looks inert.
 */
const ModeCard: React.FC<{
    mode: TimerMode;
    label: string;
    active: boolean;
    running: boolean;
    onSelect: () => void;
    children: React.ReactNode;
}> = ({ mode, label, active, running, onSelect, children }) => (
    <section
        className={`card puzzle-card timer-mosaic__cell timer-mode-card${active ? ' timer-mode-card--on' : ''}`}
        data-mode={mode}
    >
        {/* The daily log's own card anatomy: header, title, body. Reused rather
            than restyled, which is the whole point -- a card that looks like this
            page's other cards is a card that reads as this app, and a page that
            invents its own padding is a page whose containers sit further apart
            than the ones beside them.

            The title is text alone. These cards are the Daily Log's and the
            Measurements page's puzzle pieces, and every title on those pages is a
            name and nothing else. A glyph in the corner of each of these said
            nothing the word did not already say, and it made three cells of one
            grid read as three separate widgets. */}
        <div className="card-header">
            <h3 className="card-title">{label}</h3>
            <button
                type="button"
                className={`timer-chip${active ? ' timer-chip--on' : ''}`}
                onClick={onSelect}
                aria-pressed={active}
                disabled={running}
                data-tip={running ? 'Pause to change the mode' : `Run the ${label.toLowerCase()}`}
            >
                {active ? 'Active' : 'Use'}
            </button>
        </div>
        <div className="card-body">{children}</div>
    </section>
);

/**
 * Where the focus-mode flag lives, and why it is its own key.
 *
 * Separate from the engine's `anthroweb:timer:v1` because that blob is the *run*:
 * it is rewritten on every state change, holds a deadline, and is read before the
 * page has even rendered. Folding a view preference into it would mean a page
 * preference competing for space with state that has to be correct, and would put
 * a display choice inside the record of what the timer actually did.
 *
 * `'on'` rather than JSON, because the flag has two states and one of them is the
 * absence of the key -- so turning focus mode off is a removal, and anything that
 * has never heard of the setting reads `null` and starts off, which is the correct
 * default rather than an error.
 */
const FOCUS_KEY = 'anthroweb:timer:focus';

/** Focus mode as it was left. Never throws: storage can be unavailable or full. */
const readFocusMode = (): boolean => {
    if (typeof localStorage === 'undefined') return false;
    try {
        return localStorage.getItem(FOCUS_KEY) === 'on';
    } catch {
        // Private mode, or storage disabled. Focus mode simply starts off.
        return false;
    }
};

const writeFocusMode = (on: boolean): void => {
    if (typeof localStorage === 'undefined') return;
    try {
        if (on) localStorage.setItem(FOCUS_KEY, 'on');
        else localStorage.removeItem(FOCUS_KEY);
    } catch {
        // The same. The page works, it just forgets where it was on reload.
    }
};

const TimerPage: React.FC = () => {
    const queryClient = useQueryClient();
    const engine = useTimer();

    /**
     * A break that was in progress when a new run was started (or the run was
     * reset) leaves a partial break behind. Its elapsed minutes are carried
     * forward and added to the next session that is saved, so the time is not
     * lost. Cleared once consumed.
     */
    const [pendingBreakMinutes, setPendingBreakMinutes] = useState<number>(0);
    const lastRunRef = useRef<{ runId: string | null; elapsed: number; config: typeof engine.intervalConfig } | null>(null);

    const [deleteAlarm, setDeleteAlarm] = useState<TimerAlarm | null>(null);

    /**
     * A clock for the things that are not the timer.
     *
     * The engine's `now` only advances while something runs, so the header's
     * wall-clock readout and the "in 7h 20m" on each alarm need a tick of their
     * own. It is unconditional now that the panels are all on screen at once --
     * there is no longer a panel switch to key it off, and the header clock is
     * always visible whether or not anything is running.
     *
     * The initial `setPanelNow` is omitted because the interval fires within a
     * second anyway, and seeding it in an effect would be a render for a value
     * that is at most a second stale. `Date.now()` at mount is already correct,
     * and it is what the lazy initialiser used.
     */
    const [panelNow, setPanelNow] = useState(() => Date.now());
    const [focusMode, setFocusMode] = useState(readFocusMode);
    /**
     * Focus mode survives a reload.
     *
     * Written from an effect rather than inside the toggle, for the same reason the
     * engine persists its deadline from one: the state setter is where the value
     * is decided, and the write is the side effect of having decided it. It also
     * means the stored value can never disagree with what is on screen -- there is
     * one source of truth, and this keeps a copy of it.
     *
     * `readFocusMode` is the lazy initialiser, so a refresh paints the clock
     * centred on the first frame rather than laying the page out, then flipping it.
     */
    useEffect(() => { writeFocusMode(focusMode); }, [focusMode]);
    useEffect(() => {
        const id = window.setInterval(() => setPanelNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);

    // ==================== DATA ====================

    const alarmsQuery = useQuery({ queryKey: queryKeys.timerAlarms, queryFn: getTimerAlarms });

    const [worldClockTz, setWorldClockTz] = useState<string | null>(() => {
        try {
            return window.localStorage.getItem('anthroweb:world-clock-main');
        } catch {
            return null;
        }
    });
    const [worldClockActive, setWorldClockActive] = useState<string | null>(null);
    const [worldClockInUse, setWorldClockInUse] = useState(false);

    useEffect(() => {
        try {
            if (worldClockTz) window.localStorage.setItem('anthroweb:world-clock-main', worldClockTz);
            else window.localStorage.removeItem('anthroweb:world-clock-main');
        } catch {
            // ignore
        }
    }, [worldClockTz]);


    /**
     * Whether there is anything to resume.
     *
     * A countdown that has been started or paused, or any elapsed time on the
     * other two modes. Reset is disabled when this is false because resetting
     * something that is already at zero does nothing but flicker the display.
     *
     * `remaining` rather than `deadline > Date.now()`: that comparison needs the
     * wall clock, and reading the clock during render is both impure and a second
     * answer to a question the engine has already answered. `remaining` is that
     * answer, and an expired countdown reads zero exactly like one that was never
     * started -- which is the whole distinction this is making.
     */
    const canResume = useMemo(() => {
        if (engine.mode !== 'countdown') return engine.elapsed > 0 || engine.laps.length > 0 || engine.scheduledFor !== null;
        return engine.deadline !== null && engine.remaining > 0;
    }, [engine.mode, engine.deadline, engine.remaining, engine.elapsed, engine.laps.length, engine.scheduledFor]);

    const alarms = useMemo(() => alarmsQuery.data ?? [], [alarmsQuery.data]);

    /**
     * The closest alarm that will actually ring, if any.
     *
     * Only enabled alarms count: a paused alarm is not going to fire, so
     * counting it would show a countdown to a time that nothing happens at.
     * When several are enabled, the one whose next firing is soonest wins --
     * "closer" means sooner, and ties cannot happen because `nextAlarmFire` is
     * strictly after `now`.
     */
    const nextAlarm = useMemo(() => {
        const enabled = alarms.filter(alarm => alarm.enabled);
        if (enabled.length === 0) return null;
        let best: { alarm: TimerAlarm; fire: number } | null = null;
        for (const alarm of enabled) {
            const fire = nextAlarmFire(
                { hour: alarm.hour, minute: alarm.minute, days: alarm.days_of_week },
                new Date(panelNow),
            ).getTime();
            if (!best || fire < best.fire) best = { alarm, fire };
        }
        return best;
    }, [alarms, panelNow]);

    /**
     * Whether the clock is free for an alarm to take over the display.
     *
     * "Free" means no countdown, stopwatch or interval is loaded or running, no
     * splits are sitting on a stopwatch, and no scheduled start is armed. An
     * alarm countdown that displaced any of those would be lying about what the
     * clock is actually doing.
     */
    const alarmIdle = !engine.running
        && engine.deadline === null
        && engine.elapsed === 0
        && engine.laps.length === 0
        && engine.scheduledFor === null
        && engine.startDueAt === null
        && engine.alert === null;

    const alarmCountdownMs = alarmIdle && nextAlarm !== null
        ? Math.max(0, nextAlarm.fire - panelNow)
        : null;

    // ==================== MUTATIONS ====================

    const addAlarm = useMutation({
        mutationFn: (alarm: AlarmDraft) => createTimerAlarm(alarm),
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.timerAlarms }); },
    });
    const editAlarm = useMutation({
        mutationFn: ({ id, alarm }: { id: string; alarm: AlarmDraft }) => updateTimerAlarm(id, alarm),
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.timerAlarms }); },
    });
    const removeAlarm = useMutation({
        mutationFn: deleteTimerAlarm,
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.timerAlarms }); },
    });

    const saveSession = useSaveSession();
 
    // saveCurrentSession is defined after notify below.

    // (moved below, after `notify` is declared)

    /**
     * Turning an alarm on and off is an edit, not a different verb.
     *
     * It used to have its own mutation and its own `toggleAlarm` that rebuilt the
     * whole draft from the row it found. That is a second way to write the same
     * columns, and the two drift.
     */
    const toggleAlarm = useCallback((id: string, enabled: boolean) => {
        const found = alarms.find(alarm => alarm.id === id);
        if (!found) return;
        editAlarm.mutate({
            id,
            alarm: {
                label: found.label,
                hour: found.hour,
                minute: found.minute,
                days: found.days_of_week,
                enabled,
            },
        });
    }, [alarms, editAlarm]);

    /**
     * Raise any mutation failure, once.
     *
     * Done during render rather than from an effect, for the reason the other
     * pages in this app do it this way: an error set in an effect can appear and
     * expire before it is ever read, and a failure that vanishes without a trace
     * is the one nobody can debug.
     */
    const anyError = addAlarm.error ?? editAlarm.error ?? removeAlarm.error
        ?? alarmsQuery.error;
    /**
     * A query failure becomes a message, once per distinct message.
     *
     * This was `setShownError` + `setToast` called *during render*, guarded by
     * comparing against the last one shown. React permits adjusting a component's
     * own state during render, but this is what produces the "state update on a
     * component that hasn't mounted yet" warning, and a toast raised from a render
     * is raised whether or not anybody is looking -- including on the render React
     * throws away.
     *
     * In an effect it is raised exactly once per message, on a committed tree,
     * where it can be dismissed and has somewhere to land.
     */
    const errorMessage = anyError
        ? (anyError as Error).message || 'Something went wrong'
        : null;
    const { notify } = useNotice();
    useEffect(() => {
        if (errorMessage) notify('error', errorMessage);
        // Keyed on the message alone, which is what makes it one message per
        // failure rather than one per render.
    }, [errorMessage, notify]);

    const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
        notify(type, message);
    }, [notify]);

    // Capture a break that was in progress when the run changes, so its elapsed
    // minutes can be rolled into the next session rather than dropped.
    useEffect(() => {
        const prev = lastRunRef.current;
        if (prev && prev.runId && prev.runId !== engine.runId && engine.runId) {
            const phase = phaseAt(prev.elapsed, prev.config);
            if (phase && (phase.kind === 'rest' || phase.kind === 'long')) {
                const elapsedIntoBreak = phase.phaseMs - phase.remainingMs;
                setPendingBreakMinutes(prev => prev + Math.max(0, Math.round(elapsedIntoBreak / 60000)));
            }
        }
        lastRunRef.current = { runId: engine.runId, elapsed: engine.elapsed, config: engine.intervalConfig };
    }, [engine.runId, engine.elapsed, engine.intervalConfig]);

    const saveCurrentSession = useCallback(() => {
        // Only interval runs count towards study sessions.
        if (engine.mode !== 'interval') return;
        const elapsedMs = engine.elapsed > 0 ? engine.elapsed : 0;
        if (elapsedMs <= 0) return;
        const endedAt = new Date();
        const minutes = Math.max(1, Math.round(elapsedMs / 60000));
        // Only breaks that fully completed count; a break cut short is carried
        // forward as pending instead of being recorded here.
        const completed = engine.mode === 'interval'
            ? Math.round(completedBreakMs(engine.elapsed, engine.intervalConfig) / 60000)
            : 0;
        const breakMinutes = completed + pendingBreakMinutes;
        saveSession.mutate({
            user_id: '',
            session_date: toDateString(endedAt),
            duration_minutes: minutes,
            session_type: 'study',
            notes: `${engine.mode} run`,
            mode: engine.mode,
            source: 'timer',
            run_key: `${engine.runId ?? 'session'}:${Date.now()}`,
            started_at: new Date(endedAt.getTime() - elapsedMs).toISOString(),
            ended_at: endedAt.toISOString(),
            planned_minutes: undefined,
            break_minutes: breakMinutes > 0 ? breakMinutes : undefined,
        }, {
            onSuccess: () => {
                setPendingBreakMinutes(0);
                notify('success', 'Study session saved');
            },
        });
    }, [engine, notify, pendingBreakMinutes, saveSession]);

    // Auto-save a finished timer run as a study session (once per run).
    const savedRunsRef = useRef<Set<string>>(new Set());

    const saveRun = useCallback((runId: string) => {
        // Only interval runs count towards study sessions.
        if (engine.mode !== 'interval') return;
        const endedAt = new Date();
        const elapsedMs = engine.elapsed > 0 ? engine.elapsed : engine.totalMs;
        if (elapsedMs <= 0) return;
        const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60000));
        const startedAt = new Date(endedAt.getTime() - elapsedMs);

        if (engine.mode === 'interval') {
            const cfg = engine.intervalConfig;
            const rounds = cfg.totalRounds > 0
                ? cfg.totalRounds
                : Math.max(1, Math.round(elapsedMs / ((cfg.workSec + cfg.restSec) * 1000)));
            const roundsBeforeLong = cfg.roundsBeforeLong > 0 ? cfg.roundsBeforeLong : 4;
            // A break only exists between two rounds, so the last round carries no
            // break. The pending break from a previous run that was cut short is
            // rolled into the first round.
            for (let i = 0; i < rounds; i++) {
                const isLast = i === rounds - 1;
                const isLong = (i + 1) % roundsBeforeLong === 0 && cfg.longRestSec > 0;
                const breakSec = isLong ? cfg.longRestSec : cfg.restSec;
                const workMinutes = Math.max(1, Math.round(cfg.workSec / 60));
                const breakMinutes = isLast ? 0 : Math.max(0, Math.round(breakSec / 60));
                const rolledBreak = i === 0 ? pendingBreakMinutes : 0;
                const totalBreak = breakMinutes + rolledBreak;
                saveSession.mutate({
                    user_id: '',
                    session_date: toDateString(endedAt),
                    duration_minutes: workMinutes,
                    session_type: 'study',
                    notes: `Interval round ${i + 1}: ${workMinutes}m focus, ${totalBreak}m break`,
                    mode: 'interval',
                    source: 'timer',
                    run_key: `${runId}:${i}`,
                    started_at: startedAt.toISOString(),
                    ended_at: endedAt.toISOString(),
                    planned_minutes: Math.round(cfg.workSec / 60),
                    break_minutes: totalBreak > 0 ? totalBreak : undefined,
                }, {
                    onSuccess: () => {
                        if (i === 0) setPendingBreakMinutes(0);
                        notify('success', 'Study session saved');
                    },
                    onError: () => savedRunsRef.current.delete(runId),
                });
            }
        } else {
            const rolledBreak = pendingBreakMinutes;
            saveSession.mutate({
                user_id: '',
                session_date: toDateString(endedAt),
                duration_minutes: elapsedMinutes,
                session_type: 'study',
                notes: `${engine.mode === 'countdown' ? 'Countdown' : 'Stopwatch'} run`,
                mode: engine.mode,
                source: 'timer',
                run_key: runId,
                started_at: startedAt.toISOString(),
                ended_at: endedAt.toISOString(),
                planned_minutes: engine.mode === 'countdown' ? Math.round(engine.totalMs / 60000) : undefined,
                break_minutes: rolledBreak > 0 ? rolledBreak : undefined,
            }, {
                onSuccess: () => {
                    setPendingBreakMinutes(0);
                    notify('success', 'Study session saved');
                },
                onError: () => savedRunsRef.current.delete(runId),
            });
        }
    }, [engine, notify, pendingBreakMinutes, saveSession]);

    const finishRun = useCallback(() => {
        const runId = engine.runId;
        if (!runId || savedRunsRef.current.has(runId)) return;
        const elapsedMs = engine.elapsed > 0 ? engine.elapsed : engine.totalMs;
        if (elapsedMs <= 0) return;
        savedRunsRef.current.add(runId);
        saveRun(runId);
    }, [engine.runId, engine.elapsed, engine.totalMs, saveRun]);

    const handleReset = useCallback(() => {
        finishRun();
        engine.reset();
    }, [finishRun, engine]);

    useEffect(() => {
        if (engine.alert?.kind !== 'timeup') return;
        finishRun();
    }, [engine.alert, finishRun]);

    // ==================== ALARMS + WAKE LOCK ====================

    const { raiseAlarm } = engine;
    useAlarmScheduler({
        alarms,
        onFire: alarm => raiseAlarm(alarm.label),
        enabled: true,
    });

    /**
     * The screen stays awake while something runs.
     *
     * Unconditional. It used to be gated on a preference, and that preference was
     * a way to have a timer dim the screen halfway through -- which looks exactly
     * like a timer that stopped working. Running something and letting the display
     * go dark are not two readings of the same intention.
     */
    useWakeLock(engine.running);

    /**
     * The remaining time in the tab title.
     *
     * Registered on this page rather than in the engine, unlike the sound
     * preferences, and the difference is deliberate: the title is a property of
     * the browser chrome and there is no reason for it to survive leaving the
     * page, whereas the sound has to. A timer left running after navigating away
     * restores the old title, which is the honest thing -- the nav badge carries
     * the information instead, and only while it is running.
     */
    useTimerDocumentTitle();

    // ==================== NOTIFICATIONS ====================

    /**
     * Everything a run needs before it starts, done from one gesture.
     *
     * Audio first: an AudioContext cannot start without a user gesture, and by the
     * time a timer expires there is no gesture left to offer -- so the tap that
     * begins the sequence is the one that unlocks it, rather than leaving the
     * sound to fail silently at the end.
     *
     * Then the notification permission, asked unconditionally. There is no switch
     * for it any more, so this is the only place it can come from, and it has to
     * be a gesture: a prompt raised on mount is the contextless variant a browser
     * refuses permanently. `requestNotificationPermission` returns early once the
     * browser has decided, so asking on every tap costs nothing and cannot produce
     * a second prompt.
     *
     * Declared as one callback rather than repeated at each call site so the
     * keyboard shortcut cannot end up being the one way to start a timer that
     * never rings.
     */
    const prepareToRun = useCallback(() => {
        unlockAudio();
        void requestNotificationPermission();
    }, []);

    // ==================== DISPLAY ====================

    /**
     * What the big digits say, in milliseconds.
     *
     * The countdown reads the deadline; the stopwatch and the interval read
     * elapsed. That split is the reason the engine tracks a deadline and an
     * elapsed time separately -- the countdown must never be derived from
     * elapsed, because elapsed is accumulated from ticks and ticks are the thing
     * that goes wrong in a background tab.
     *
     * One number rather than three, so the formatting below cannot drift between
     * the modes -- which is what happened when the hundredths were a preference:
     * three call sites, each with its own idea of whether to include them.
     */
    const shownMs = alarmCountdownMs !== null
        ? alarmCountdownMs
        : engine.mode === 'countdown'
            ? engine.remaining
            : engine.mode === 'stopwatch'
                ? engine.elapsed
                // Waiting for a scheduled start: the dial counts down to the start, not
                // to the end of a phase that has not begun. `phase` is non-null here --
                // `phaseAt(0)` is a work phase -- so this has to be checked first, or the
                // dial shows 25:00 and reads as a session already under way.
                : engine.untilStartMs ?? engine.phase?.remainingMs ?? 0;

    /**
     * Milliseconds on every clock, always.
     *
     * It was a setting, off by default and described as stopwatch-only, so
     * switching modes quietly dropped the extra digits and it read as broken
     * rather than as a preference. There was no arrangement of it that was better
     * than always showing them, so the setting is gone and this is not conditional
     * on anything.
     */
    const digits = formatTimer(shownMs);

    /**
     * The ring: a countdown has an end, the other two do not.
     *
     * A scheduled start is the third case rather than a special one, and its arc
     * fills over the *last hour* before the session begins. The polarity matches the
     * countdown's -- empty at the start of a wait, full as it runs out -- so "nearly
     * full" reads the same way on both, and a schedule more than an hour out sits
     * empty rather than claiming a fraction of an elapsed wait that never happened.
     *
     * An hour rather than "since you set it" on purpose: measuring from the moment
     * of arming would need the arming instant held in state alongside the schedule,
     * which is three places to keep in sync for an arc nobody measures. A schedule
     * set for tomorrow would also fill its ring over sixteen hours, slowly and
     * meaninglessly, whereas an hour is a unit a person can hold in their head.
     */
    const WAIT_ARC_MS = 60 * 60 * 1000;
    const fraction = alarmCountdownMs !== null
        ? null
        : engine.untilStartMs == null
            ? engine.progress
            : Math.max(0, Math.min(1, 1 - engine.untilStartMs / WAIT_ARC_MS));

    /** Expired: red, pulsing, and no longer counting. */
    const done = engine.mode === 'countdown' && engine.alert?.kind === 'timeup';

    /**
     * Under the digits, and the thing that makes the wait legible.
     *
     * Naming the time is not optional here. A countdown with no label is still a
     * countdown, but a dial counting down to something unstated is just a number
     * getting smaller, and this one is counting toward the start of a session the
     * user is not running -- so without the time it would read as the timer running
     * backwards, or as one already broken.
     *
     * `24-hour` because that is what the field it is set in says, and because
     * `formatAlarmTime` is the only wall-clock format on the page -- the one place
     * that must not render "00:00 AM".
     */
    const phaseLabel = alarmCountdownMs !== null && nextAlarm !== null
        ? nextAlarm.alarm.label || 'Alarm'
        : engine.untilStartMs != null && engine.scheduledFor
            ? `Starts at ${formatAlarmTime(engine.scheduledFor.getHours(), engine.scheduledFor.getMinutes())}`
            : engine.mode === 'interval' && engine.phase
                ? (engine.phase.kind === 'work' ? 'Focus' : engine.phase.kind === 'long' ? 'Long rest' : 'Rest')
                : engine.mode === 'stopwatch' ? 'Stopwatch'
                    : engine.running ? 'Counting down' : 'Ready';

    // No work/rest colour while waiting. The tone colours the phase name, and
    // "Focus" in green while nothing is running would be claiming a phase that has
    // not started.
    const phaseTone = engine.untilStartMs != null
        ? undefined
        : engine.mode === 'interval' && engine.phase
            ? (engine.phase.kind === 'work' ? 'work' : engine.phase.kind === 'long' ? 'long' : 'rest')
            : undefined;

    // No round either: round 1 has not begun, and "Round 1" under a countdown to the
    // start would read as though it had.
    const roundLabel = engine.untilStartMs != null
        ? undefined
        : engine.mode === 'interval' && engine.phase
            ? (engine.phase.totalRounds > 0
                ? `Round ${engine.phase.round} of ${engine.phase.totalRounds}`
                : `Round ${engine.phase.round}`)
            : undefined;

    /** Laps, newest first -- the order they are read in. */
    const laps = useMemo(() => buildLaps(engine.laps).reverse(), [engine.laps]);
    const bestSplit = laps.length > 1 ? Math.min(...laps.map(lap => lap.splitMs)) : null;
    const slowestSplit = laps.length > 1 ? Math.max(...laps.map(lap => lap.splitMs)) : null;

    // ==================== HANDLERS ====================

    /**
     * Every control that can lead to an alert, wrapped in the gesture it needs.
     *
     * Delegates to `prepareToRun` so the button and the keyboard shortcut take
     * exactly the same path -- audio unlocked, permission asked -- rather than
     * one of them remembering to.
     */
    const tap = <T extends unknown[]>(fn: (...args: T) => void) => (...args: T) => {
        prepareToRun();
        fn(...args);
    };

    /**
     * Space starts and pauses, R resets, L marks a lap.
     *
     * Declared here rather than beside the other effects so `prepareToRun` is in
     * hand: a keypress is a user gesture exactly like a click, and routing it
     * through the same helper is what stops the spacebar from being the one way to
     * start a timer that never rings. It was previously declared earlier in the
     * file with only `engine` in its dependencies, which meant it closed over the
     * settings and the permission state as they were at mount.
     */
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
            if (event.code === 'Space') {
                event.preventDefault();
                prepareToRun();
                if (engine.running) engine.pause();
                else engine.start();
            } else if (event.key === 'r' || event.key === 'R') {
                if (!engine.running) handleReset();
            } else if (event.key === 'l' || event.key === 'L') {
                if (engine.mode === 'stopwatch' && engine.running) engine.addLap();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [engine, prepareToRun, handleReset]);

    // ==================== RENDER ====================

    const anyLoading = alarmsQuery.isLoading;

    return (
        <>
            <Title title="Timer" />

            <div className={`timer-page-wrapper${focusMode ? ' timer-page-wrapper--focus' : ''}`}>
                <div className="dashboard-section timer-section">
                    <div className="timer-card">
                        {/* No header bar.

                            This used to be an empty `.timer-header`, left behind when
                            the world-clock panel it once held was removed along with
                            everything else in it. An empty element with a
                            `border-bottom` is not invisible: it drew a rule straight
                            across the top of the page, sitting on the first row of
                            cards with nothing above it to belong to. Its own time
                            moved down into the display column, where it lives now,
                            so there is nothing left here and the border went with
                            it.

                            That clock reads through `Intl` rather than a hand-built
                            string, so it follows the device's own region and 12/24
                            setting instead of overriding them. */}
                        <div className="timer-body">
                            {/* The display column, beside the mosaic rather than
                                above it. `order` puts it above on a phone, where
                                there is no room for two columns. */}
                            <div className="timer-stage">
                                {(() => {
                                    const idle = !engine.running
                                        && engine.deadline === null
                                        && engine.elapsed === 0
                                        && engine.laps.length === 0
                                        && engine.scheduledFor === null
                                        && engine.startDueAt === null
                                        && engine.alert === null
                                        && alarmCountdownMs === null;
                                    const nowText = new Date(panelNow).toLocaleTimeString(undefined, {
                                        timeZone: worldClockTz && worldClockTz !== 'local' ? worldClockTz : undefined,
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                        hour12: false,
                                    });
                                    return (
                                        <TimerDisplay
                                            text={worldClockInUse || idle ? nowText : digits}
                                            now={idle ? undefined : nowText}
                                            fraction={idle ? null : fraction}
                                            running={worldClockInUse ? false : (idle ? false : engine.running)}
                                            dimmed={idle ? false : !engine.running && !done}
                                            done={idle ? false : done}
                                            phase={idle ? undefined : phaseLabel}
                                            phaseTone={idle ? undefined : phaseTone}
                                            round={idle ? undefined : roundLabel}
                                        />
                                    );
                                })()}

                                <div className="timer-controls">
                                    {!worldClockInUse && (<>
                                    <button
                                        type="button"
                                        className="timer-btn timer-btn--primary"
                                        onClick={tap(() => {
                                            if (engine.running) engine.pause();
                                            else engine.start();
                                        })}
                                    >
                                        {engine.running
                                            ? <><Square size={14} /> Pause</>
                                            : <><Play size={14} /> {canResume ? 'Resume' : 'Start'}</>}
                                    </button>

                                    {/* Choose which phase an interval run starts in.
                                        Only relevant in interval mode. */}
                                    {engine.mode === 'interval' && (
                                        <>
                                    <button
                                        type="button"
                                        className={`timer-btn${engine.intervalConfig.startPhase === 'work' ? ' timer-chip--on' : ''}`}
                                        onClick={tap(() => engine.setIntervalConfig({ ...engine.intervalConfig, startPhase: 'work' }))}
                                        data-phase="work"
                                        data-tip="Start in a work interval"
                                        aria-label="Start in a work interval"
                                        aria-pressed={engine.intervalConfig.startPhase === 'work'}
                                    >
                                        <Zap size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        className={`timer-btn${engine.intervalConfig.startPhase === 'rest' ? ' timer-chip--on' : ''}`}
                                        onClick={tap(() => engine.setIntervalConfig({ ...engine.intervalConfig, startPhase: 'rest' }))}
                                        data-phase="rest"
                                        data-tip="Start in a rest break"
                                        aria-label="Start in a rest break"
                                        aria-pressed={engine.intervalConfig.startPhase === 'rest'}
                                    >
                                        <Coffee size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        className={`timer-btn${engine.intervalConfig.startPhase === 'long' ? ' timer-chip--on' : ''}`}
                                        onClick={tap(() => engine.setIntervalConfig({ ...engine.intervalConfig, startPhase: 'long' }))}
                                        data-phase="long"
                                        data-tip="Start in a long break"
                                        aria-label="Start in a long break"
                                        aria-pressed={engine.intervalConfig.startPhase === 'long'}
                                    >
                                        <Moon size={14} />
                                    </button>
                                        </>
                                    )}

                                    {/* Lap. Stopwatch only, because a split is only
                                        meaningful against a count-up: on a countdown
                                        "lap" would just be the time remaining, which
                                        is already the number on the ring. */}
                                    {engine.mode === 'stopwatch' && (
                                        <button
                                            type="button"
                                            className="timer-btn"
                                            onClick={tap(engine.addLap)}
                                            disabled={!engine.running}
                                            data-tip="Mark a lap"
                                            aria-label="Mark a lap"
                                        >
                                            <Flag size={14} />
                                        </button>
                                    )}

                                    {engine.elapsed > 0 && (
                                    <button
                                        type="button"
                                        className="timer-btn"
                                        onClick={tap(saveCurrentSession)}
                                        data-tip="Save session"
                                        aria-label="Save the current run as a study session"
                                    >
                                        Save
                                    </button>
                                    )}

                                    {canResume && (
                                    <button
                                        type="button"
                                        className="timer-btn"
                                        onClick={handleReset}
                                        data-tip="Reset"
                                        aria-label="Reset the timer"
                                    >
                                        <RotateCcw size={14} />
                                    </button>
                                    )}
                                    </>)}
                                    <button
                                        type="button"
                                        className="timer-btn"
                                        onClick={() => setFocusMode(v => !v)}
                                        aria-pressed={focusMode}
                                        data-tip={focusMode ? 'Exit focus' : 'Focus mode'}
                                    >
                                        {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                                    </button>
                                </div>


                            </div>

                            {/* The mosaic. Every panel is mounted and visible, and the
                                grid decides how they stack -- two-up on a wide
                                screen, one column on a phone. Nothing here is
                                conditionally rendered, so no panel can be the reason
                                a running timer appears to have stopped.

                                Two columns, and the daily log's own classes rather than a restatement of
                                them: `.daily-log-puzzle` is the two-column grid,
                                `.daily-log-col` is a column that packs its cards
                                independently so a short card leaves no hole beside
                                a tall one. That is what the Measurements page
                                uses, and using the classes themselves rather than
                                copies is what keeps the two from drifting apart
                                again.

                                Which means the order that matters is reading
                                order -- down the left column, then down the right
                                -- and not the order in the file. So the containers
                                are placed by column deliberately: countdown and
                                stopwatch down the left, then the alarms and the
                                intervals down the right. The alarms are therefore
                                the very next thing read after the stopwatch, which
                                is what putting them there is for. Appending a
                                container at the end instead would have put it
                                beside the countdown, which is how it ended up in
                                the wrong place when this was a plain two-column
                                grid in source order.

                                Each mode owns its own card: the three used to be a
                                single container holding a segmented control and
                                whichever set of fields matched the active mode, so
                                two of the three functions existed only as "not the
                                one you are looking at". They stay mounted, carry
                                their own fields, and dim when they are not the one
                                the shared clock is running. */}
                            <div className="timer-mosaic daily-log-puzzle">
                                <div className="daily-log-col">
                                {/* ==================== STUDY SESSIONS ==================== */}
                                <section className={`card puzzle-card timer-mosaic__cell dim-until-hover${worldClockInUse ? ' dimmed-by-world-clock' : ''}`}>
                                    <StudySessions />
                                </section>

                                {/* ==================== COUNTDOWN ==================== */}
                                <ModeCard
                                    mode="countdown"
                                    label={MODE_LABEL.countdown}
                                    active={engine.mode === 'countdown' && !worldClockInUse}
                                    running={engine.running}
                                    onSelect={tap(() => { engine.setMode('countdown'); setWorldClockInUse(false); })}
                                >
                                    <DurationPad
                                        value={engine.totalMs}
                                        onChange={engine.setDuration}
                                        /* Locked while running, and while
                                           another mode is the active one:
                                           changing the target mid-run would
                                           silently restart it, and changing it
                                           for a mode the clock is not
                                           displaying would look like it did
                                           something. Disabled says so, which
                                           the engine refusing behind an
                                           apparently dead input does not. */
                                        disabled={engine.running || engine.mode !== 'countdown'}
                                    />
                                    <p className="timer-empty-hint" style={{ marginTop: '0.5rem' }}>
                                        {engine.running
                                            ? 'Pause to change the length.'
                                            : 'Type the hours, minutes and seconds.'}
                                    </p>
                                </ModeCard>

                                {/* ==================== STOPWATCH ==================== */}
                                <ModeCard
                                    mode="stopwatch"
                                    label={MODE_LABEL.stopwatch}
                                    active={engine.mode === 'stopwatch' && !worldClockInUse}
                                    running={engine.running}
                                    onSelect={tap(() => { engine.setMode('stopwatch'); setWorldClockInUse(false); })}
                                >
                                    <p className="timer-empty-hint" style={{ textAlign: 'left' }}>
                                        Counts up from zero and runs until you stop it.
                                        Press the flag mid-run to mark a split.
                                    </p>

                                    {/*
                                        The lap table.

                                        Newest first, and laid out as a table
                                        rather than as a list of course rows: a lap
                                        is a measurement of one thing, and it should
                                        read as two numbers on one line with their
                                        labels above them, not as a card with a
                                        title on the left and a stack of labelled
                                        boxes on the right. The split is the number
                                        a lap is actually for; the total is the
                                        running context it sits in, so the split
                                        leads and the total is the quieter column.
                                    */}
                                    {engine.laps.length > 0 && (
                                        <div className="timer-laps">
                                            <div className="timer-laps__head" aria-hidden="true">
                                                <span>Lap</span>
                                                <span>Split</span>
                                                <span>Total</span>
                                            </div>
                                            {laps.map(lap => (
                                                <div
                                                    key={lap.index}
                                                    className={[
                                                        'timer-lap',
                                                        bestSplit !== null && lap.splitMs === bestSplit ? 'timer-lap--best' : '',
                                                        slowestSplit !== null && lap.splitMs === slowestSplit ? 'timer-lap--slow' : '',
                                                    ].filter(Boolean).join(' ')}
                                                >
                                                    <span className="timer-lap__index">{lap.index}</span>
                                                    <span className="timer-lap__split">{formatTimer(lap.splitMs)}</span>
                                                    <span className="timer-lap__total">{formatTimer(lap.totalMs)}</span>
                                                </div>
                                            ))}
                                            {/* Only worth saying once there is something to
                                                compare. With one lap, best and slowest are the
                                                same number and the note would be claiming a
                                                distinction that does not exist. */}
                                            {laps.length > 1 && (
                                                <p className="timer-laps__note">
                                                    Fastest split {formatTimer(bestSplit ?? 0)}, slowest {formatTimer(slowestSplit ?? 0)}.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </ModeCard>

                                {/* Presets removed at user request. */}
                                </div>

                                {/*
                                    Right column, and the alarms lead it -- which is
                                    what makes them the next thing read after the
                                    stopwatch rather than the fourth thing seen.

                                    No `ModeCard`: an alarm is not a mode, so it has no
                                    "Use" switch and is never dimmed. It takes the same
                                    card anatomy directly, which is what makes the four
                                    read as one mosaic rather than three modes and a
                                    guest.

                                    Above the intervals rather than under them because an
                                    alarm is set once and forgotten, while the intervals
                                    form is the tallest thing on the page -- underneath,
                                    it would push the alarms off the screen.
                                */}
                                <div className="daily-log-col">
                                <section className={`card puzzle-card timer-mosaic__cell dim-until-hover${worldClockInUse ? ' dimmed-by-world-clock' : ''}`}>
                                    <AlarmsPanel
                                        alarms={alarms}
                                        onCreate={alarm => {
                                            addAlarm.mutate(alarm);
                                            showToast('success',
                                                `Alarm set for ${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')}`);
                                        }}
                                        onUpdate={(id, alarm) => editAlarm.mutate({ id, alarm })}
                                        onDelete={id => setDeleteAlarm(alarms.find(a => a.id === id) ?? null)}
                                        onToggle={toggleAlarm}
                                        busy={addAlarm.isPending || editAlarm.isPending}
                                        now={panelNow}
                                    />
                                </section>

                                {/* ==================== INTERVALS ==================== */}
                                <ModeCard
                                    mode="interval"
                                    label={MODE_LABEL.interval}
                                    active={engine.mode === 'interval' && !worldClockInUse}
                                    running={engine.running}
                                    onSelect={tap(() => { engine.setMode('interval'); setWorldClockInUse(false); })}
                                >
                                    <IntervalEditor
                                        config={engine.intervalConfig}
                                        onChange={engine.setIntervalConfig}
                                        disabled={engine.running || engine.mode !== 'interval'}
                                        dueAt={engine.startDueAt}
                                    />
                                </ModeCard>

                                {/* ==================== WORLD CLOCK ==================== */}
                                <WorldClockPanel
                                    activeTz={worldClockActive}
                                    mainTz={worldClockTz}
                                    inUse={worldClockInUse}
                                    onSelect={setWorldClockActive}
                                    onSelectMain={setWorldClockTz}
                                    onUse={() => setWorldClockInUse(v => !v)}
                                    onFullscreen={() => setFocusMode(true)}
                                />

                                {anyLoading && (
                                    <p className="timer-empty-hint">Loading your alarms…</p>
                                )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ==================== OVERLAYS ==================== */}

            <TimeUpOverlay
                alert={engine.alert}
                onDismiss={engine.dismissAlert}
                onRestart={engine.restart}
                onAddMinutes={minutes => {
                    engine.addMinutes(minutes);
                    engine.dismissAlert();
                }}
            />

            {/* Stays open until the delete actually succeeds. Clearing the target
                straight after mutate() closed it while the request was still in
                flight, so `busy` was never seen and a failed delete vanished
                without a trace. */}
            <ConfirmModal
                open={!!deleteAlarm}
                title={deleteAlarm ? `Delete "${deleteAlarm.label}"?` : ''}
                confirmLabel="Delete"
                danger
                busy={removeAlarm.isPending}
                onConfirm={() => {
                    if (!deleteAlarm) return;
                    const label = deleteAlarm.label;
                    removeAlarm.mutate(deleteAlarm.id, {
                        onSuccess: () => {
                            setDeleteAlarm(null);
                            showToast('success', `Deleted "${label}"`);
                        },
                    });
                }}
                onCancel={() => setDeleteAlarm(null)}
            />
        </>
    );
};

/**
 * The keys a settings comparison has to cover.
 *
 * Named here rather than inline as an array literal at each of the two call
 * sites so the two comparisons cannot drift into checking different subsets --
 * which would show up as a setting that silently stops syncing.
 */
export default TimerPage;





