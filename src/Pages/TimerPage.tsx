import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, Play, RotateCcw, Square, Timer as TimerIcon } from 'lucide-react';
import Title from '../Components/Title';
import ConfirmModal from '../Components/ConfirmModal';
import DurationPad from '../Components/Timer/DurationPad';
import TimerDisplay from '../Components/Timer/TimerDisplay';
import TimeUpOverlay from '../Components/Timer/TimeUpOverlay';
import SettingsPanel from '../Components/Timer/SettingsPanel';
import PresetPanel from '../Components/Timer/PresetPanel';
import IntervalEditor from '../Components/Timer/IntervalEditor';
import AlarmsPanel, { type AlarmDraft } from '../Components/Timer/AlarmsPanel';
import { useTimer, useTimerSound, type TimerMode } from '../hooks/useTimerEngine';
import { useTimerDocumentTitle } from '../hooks/useTimerDocumentTitle';
import { useWakeLock } from '../hooks/useWakeLock';
import { useNotice } from '../Components/Feedback/useNotice';
import { useAlarmScheduler } from '../hooks/useAlarmScheduler';
import { queryKeys } from '../utils/queryKeys';
import {
    buildLaps,
    formatClock,
    formatHumanDuration,
    formatStopwatch,
    normalizeSettings,
    progressFraction,
    type ChimeId,
    type TimerSettings,
} from '../utils/timerMath';
import { playChime, unlockAudio } from '../utils/timerChime';
import {
    createTimerAlarm,
    createTimerPreset,
    deleteTimerAlarm,
    deleteTimerPreset,
    getTimerAlarms,
    getTimerPresets,
    getTimerSettings,
    normalizePreset,
    saveTimerSettings,
    updateTimerAlarm,
    updateTimerPreset,
    type NormalizedPreset,
    type TimerAlarm,
} from '../services/timerService';

const MODES: { id: TimerMode; label: string }[] = [
    { id: 'countdown', label: 'Countdown' },
    { id: 'stopwatch', label: 'Stopwatch' },
    { id: 'interval', label: 'Intervals' },
];

/**
 * The keys two settings objects have to agree on.
 *
 * Declared before the component so both comparisons in it use one list. Written
 * out at each call site instead, they would be free to drift into covering
 * different subsets -- and that shows up as a setting that quietly stops
 * syncing, which is the hardest kind of bug to notice.
 */
const SETTINGS_KEYS: readonly (keyof TimerSettings)[] =
    ['chime', 'volume', 'vibrate', 'notify', 'keepAwake', 'hundredths'];

/** Whether two settings objects describe the same configuration. */
const sameSettings = (a: TimerSettings, b: TimerSettings): boolean =>
    SETTINGS_KEYS.every(key => a[key] === b[key]);

const TimerPage: React.FC = () => {
    const queryClient = useQueryClient();
    const engine = useTimer();

    const [deletePreset, setDeletePreset] = useState<NormalizedPreset | null>(null);
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
    useEffect(() => {
        const id = window.setInterval(() => setPanelNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
            if (event.code === 'Space') {
                event.preventDefault();
                unlockAudio();
                if (engine.running) engine.pause();
                else engine.start();
            } else if (event.key === 'r' || event.key === 'R') {
                if (!engine.running) engine.reset();
            } else if (event.key === 'l' || event.key === 'L') {
                if (engine.mode === 'stopwatch' && engine.running) engine.addLap();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [engine]);

    // ==================== DATA ====================

    const presetsQuery = useQuery({ queryKey: queryKeys.timerPresets, queryFn: getTimerPresets });
    const alarmsQuery = useQuery({ queryKey: queryKeys.timerAlarms, queryFn: getTimerAlarms });
    const settingsQuery = useQuery({ queryKey: queryKeys.timerSettings, queryFn: getTimerSettings });

    /**
     * Settings, always usable.
     *
     * The query returns null when nothing is saved yet, so the default is
     * `normalizeSettings(null)` rather than a spread of possibly-absent fields.
     * A volume of `undefined` reaching the audio graph is a silent failure, and
     * this is the one place that makes it impossible.
     */
    const savedSettings = useMemo(
        () => normalizeSettings(settingsQuery.data ?? null),
        [settingsQuery.data],
    );

    /**
     * The live settings, and the reason they are not just `savedSettings`.
     *
     * Held separately so a toggle moves under the finger immediately instead of
     * after a round trip -- 80ms is short, but it is enough to feel broken on a
     * switch, and the volume slider calls this on every one of its steps.
     *
     * Adopted during render rather than from an effect, which is the "adjusting
     * state when a prop changes" case React documents: comparing the incoming
     * value against the one in hand decides it before any render is committed.
     * The comparison is by value, not identity, so a background refetch cannot
     * yank the volume back while somebody is dragging it.
     */
    /**
     * The live settings, and the reason they are not just `savedSettings`.
     *
     * Held separately so a toggle moves under the finger immediately instead of
     * after a round trip. Adopting the server value only happens when it changed
     * on its own (another device, or the first load) -- not every time the local
     * draft differs from it, which is the normal state while the user is editing
     * and would otherwise yank the toggle back to its previous value.
     */
    const savedSettingsRef = useRef<TimerSettings>(savedSettings);
    const [draftSettings, setDraftSettings] = useState<TimerSettings>(savedSettings);
    if (!sameSettings(savedSettings, savedSettingsRef.current)) {
        savedSettingsRef.current = savedSettings;
        setDraftSettings(savedSettings);
    }

    const patchSettings = useCallback((patch: Partial<TimerSettings>) => {
        setDraftSettings(prev => normalizeSettings({ ...prev, ...patch }));
    }, []);

    /**
     * Whether there is anything to resume.
     *
     * A countdown that has been started or paused, or any elapsed time on the
     * other two modes. Reset is disabled when this is false because resetting
     * something that is already at zero does nothing but flicker the display.
     */
    const canResume = useMemo(() => (
        engine.mode === 'countdown'
            ? engine.deadline !== null
            : engine.elapsed > 0 || engine.laps.length > 0
    ), [engine.mode, engine.deadline, engine.elapsed, engine.laps.length]);

    useTimerSound({
        chime: draftSettings.chime,
        volume: draftSettings.volume,
        vibrate: draftSettings.vibrate,
        notify: draftSettings.notify,
    });

    const presets = useMemo(() => (presetsQuery.data ?? []).map(normalizePreset), [presetsQuery.data]);
    const alarms = useMemo(() => alarmsQuery.data ?? [], [alarmsQuery.data]);

    // ==================== MUTATIONS ====================

    const savePreset = useMutation({
        mutationFn: (preset: Omit<NormalizedPreset, 'id'>) => createTimerPreset(preset),
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.timerPresets }); },
    });
    const editPreset = useMutation({
        mutationFn: ({ id, preset }: { id: string; preset: Omit<NormalizedPreset, 'id'> }) =>
            updateTimerPreset(id, preset),
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.timerPresets }); },
    });
    const removePreset = useMutation({
        mutationFn: deleteTimerPreset,
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.timerPresets }); },
    });

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

    /**
     * Settings are written on a debounce.
     *
     * The volume slider calls this on every step and the switches on every tap,
     * so a write per change would be a request flood. Six hundred milliseconds is
     * long enough to coalesce a drag and short enough that the row is synced
     * before somebody closes the app.
     */
    const saveSettings = useMutation({
        mutationFn: saveTimerSettings,
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.timerSettings }); },
        onError: (error: unknown) => {
            notify('error', (error as Error)?.message || 'Could not save settings');
        },
    });
    useEffect(() => {
        if (sameSettings(draftSettings, savedSettings)) return;
        const id = window.setTimeout(() => saveSettings.mutate(draftSettings), 600);
        return () => window.clearTimeout(id);
    }, [draftSettings, savedSettings, saveSettings]);

    /**
     * Raise any mutation failure, once.
     *
     * Done during render rather than from an effect, for the reason the other
     * pages in this app do it this way: an error set in an effect can appear and
     * expire before it is ever read, and a failure that vanishes without a trace
     * is the one nobody can debug.
     */
    const anyError = savePreset.error ?? editPreset.error ?? removePreset.error
        ?? addAlarm.error ?? editAlarm.error ?? removeAlarm.error
        ?? settingsQuery.error ?? presetsQuery.error ?? alarmsQuery.error;
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

    // ==================== ALARMS + WAKE LOCK ====================

    const { raiseAlarm } = engine;
    useAlarmScheduler({
        alarms,
        onFire: alarm => raiseAlarm(alarm.label),
        enabled: true,
    });

    /**
     * The screen stays awake while something runs -- gated on the preference,
     * because a user who switched it off has said they would rather it dimmed.
     */
    useWakeLock(engine.running && draftSettings.keepAwake);

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
     * Whether the browser is refusing notifications.
     *
     * `denied` is permanent and cannot be re-asked, so the toggle is disabled with
     * an explanation rather than left clickable and silently inert. Read on a
     * timer rather than only on mount, because the user can revoke it from the
     * browser's own UI while the page is open.
     */
    const [notificationState, setNotificationState] = useState(
        typeof Notification !== 'undefined' ? Notification.permission : 'denied',
    );
    useEffect(() => {
        if (typeof Notification === 'undefined') return;
        const id = window.setInterval(() => setNotificationState(Notification.permission), 4000);
        return () => window.clearInterval(id);
    }, []);
    const notificationsBlocked = notificationState === 'denied';

    /**
     * Ask for permission the moment it is switched on.
     *
     * Deliberately from a click rather than on mount. A permission prompt with no
     * context is the one thing a browser will refuse permanently, and asking at
     * the moment somebody opts in is both better behaviour and the only variant
     * that tends to get granted.
     */
    const requestNotifications = useCallback(async () => {
        if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
        try {
            const result = await Notification.requestPermission();
            setNotificationState(result);
        } catch {
            // Refused outside a gesture, or the page is not on https. The sound
            // and the on-screen overlay still work, so this is not worth a toast.
        }
    }, []);

    // ==================== DISPLAY ====================

    /**
     * What the big digits say.
     *
     * The countdown reads the deadline; the stopwatch and the interval read
     * elapsed. That split is the reason the engine tracks a deadline and an
     * elapsed time separately -- the countdown must never be derived from
     * elapsed, because elapsed is accumulated from ticks and ticks are the thing
     * that goes wrong in a background tab.
     */
    const digits = engine.mode === 'countdown'
        ? formatClock(engine.remaining)
        : engine.mode === 'stopwatch'
            ? (draftSettings.hundredths ? formatStopwatch(engine.elapsed) : formatClock(engine.elapsed))
            : formatClock(engine.phase?.remainingMs ?? 0);

    /** The ring: a countdown has an end, the other two do not. */
    const fraction = engine.mode === 'countdown' && engine.deadline !== null
        ? progressFraction(engine.deadline, engine.totalMs, Date.now())
        : null;

    /** Expired: red, pulsing, and no longer counting. */
    const done = engine.mode === 'countdown' && engine.alert?.kind === 'timeup';

    const phaseLabel = engine.mode === 'interval' && engine.phase
        ? (engine.phase.kind === 'work' ? 'Focus' : engine.phase.kind === 'long' ? 'Long rest' : 'Rest')
        : engine.mode === 'stopwatch' ? 'Stopwatch'
            : engine.running ? 'Counting down' : 'Ready';

    const phaseTone = engine.mode === 'interval' && engine.phase
        ? (engine.phase.kind === 'work' ? 'work' : engine.phase.kind === 'long' ? 'long' : 'rest')
        : undefined;

    const roundLabel = engine.mode === 'interval' && engine.phase
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
     * Unlock audio before doing anything else.
     *
     * An AudioContext cannot start without a user gesture, and by the time a
     * timer expires there is no gesture left to offer. So every control that can
     * lead to an alert unlocks it on the click that begins the sequence, rather
     * than leaving the sound to fail silently at the end.
     */
    const tap = <T extends unknown[]>(fn: (...args: T) => void) => (...args: T) => {
        unlockAudio();
        fn(...args);
    };

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
                sound: found.sound,
                enabled,
            },
        });
    }, [alarms, editAlarm]);

    // ==================== RENDER ====================

    const anyLoading = presetsQuery.isLoading || alarmsQuery.isLoading;

    return (
        <>
            <Title title="Timer" />

            <div className="timer-page-wrapper">
                <div className="dashboard-section timer-section">
                    <div className="timer-card">
                        {/*
                            The page header. Two things and no more: what time it is
                            where you are, and -- only while something is running --
                            the run itself.

                            The world clock used to be a fourth tab holding a dozen
                            cities. The only part of it anybody used was their own
                            time, and that was already on the tab bar they had to
                            click through to reach. So the panel is gone and the one
                            figure that was wanted sits here, where it is visible
                            whatever else the page is doing.

                            `Intl` rather than a hand-built string, so it follows
                            the device's own region and 12/24-hour setting instead
                            of overriding them.
                        */}
                        <div className="timer-header">
                            {/* The running readout, mirrored here as well as into the
                                nav rail. The rail badge is the point -- this one is
                                for somebody already on the page who has scrolled the
                                ring out of view. */}
                            {engine.running && (
                                <span className="weight-badge weight-badge--ok">
                                    <TimerIcon size={11} aria-hidden="true" />
                                    {formatClock(
                                        engine.mode === 'countdown' ? engine.remaining
                                            : engine.mode === 'interval' ? (engine.phase?.remainingMs ?? 0)
                                                : engine.elapsed,
                                    )}
                                </span>
                            )}
                        </div>

                        {/* No tab bar. The things a timer page holds are not
                            alternatives between which you choose one -- they are
                            panels of the same instrument, and hiding three of them
                            behind a tab meant the page could only ever show a
                            quarter of itself at a time.

                            The clock and its controls stay in a column of their own
                            on the left, which is also what makes the rest safe to
                            show all at once: the running display never scrolls out of
                            reach and never gets covered by whichever panel you happen
                            to be reading. */}
                        <div className="timer-body">
                            {/* The display column, beside the mosaic rather than
                                above it. `order` puts it above on a phone, where
                                there is no room for two columns. */}
                            <div className="timer-stage">
                                <time className="timer-clock__now" dateTime={new Date(panelNow).toISOString()}>
                                    {new Date(panelNow).toLocaleTimeString(undefined, {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </time>
                                <TimerDisplay
                                    text={digits}
                                    fraction={fraction}
                                    running={engine.running}
                                    dimmed={!engine.running && !done}
                                    done={done}
                                    phase={phaseLabel}
                                    phaseTone={phaseTone}
                                    round={roundLabel}
                                />

                                <div className="timer-controls">
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

                                    <button
                                        type="button"
                                        className="timer-btn"
                                        onClick={tap(engine.reset)}
                                        data-tip="Reset"
                                        aria-label="Reset the timer"
                                        disabled={!canResume}
                                    >
                                        <RotateCcw size={14} />
                                    </button>
                                </div>


                            </div>

                            {/* The mosaic. Every panel is mounted and visible, and the
                                grid decides how they stack -- two-up on a wide
                                screen, one column on a phone. Nothing here is
                                conditionally rendered, so no panel can be the reason
                                a running timer appears to have stopped. */}
                            <div className="timer-mosaic">
                                <div className="daily-log-puzzle">
                                <div className="daily-log-col">
                                {/* ==================== RUN ==================== */}
                                <section className="card puzzle-card timer-mosaic__cell">
                                    <div className="card-body">
                                        <div className="timer-block">
                                        {/* Segmented rather than tabs: these three are
                                            one operation with different setup, and they
                                            share the display to the left. */}
                                        {/* Disabled while running, like the pad and
                                            the interval editor below it. `setMode`
                                            refuses mid-run rather than stopping the
                                            run, and a control that silently ignores
                                            you is worse than one that looks inert. */}
                                        <div className="timer-chips" style={{ marginBottom: '0.85rem' }}>
                                            {MODES.map(mode => (
                                                <button
                                                    key={mode.id}
                                                    type="button"
                                                    className={`timer-chip${engine.mode === mode.id ? ' timer-chip--on' : ''}`}
                                                    onClick={tap(() => engine.setMode(mode.id))}
                                                    aria-pressed={engine.mode === mode.id}
                                                    disabled={engine.running}
                                                    data-tip={engine.running ? 'Pause to change the mode' : undefined}
                                                >
                                                    {mode.label}
                                                </button>
                                            ))}
                                        </div>

                                        {engine.mode === 'countdown' && (
                                            <>
                                                <DurationPad
                                                    value={engine.totalMs}
                                                    onChange={engine.setDuration}
                                                    /* Locked while running: changing the
                                                       target mid-run would silently
                                                       restart it. Disabled says so,
                                                       which the engine refusing behind
                                                       an apparently dead input does
                                                       not. */
                                                    disabled={engine.running}
                                                />
                                                <p className="timer-empty-hint" style={{ marginTop: '0.5rem' }}>
                                                    {engine.running
                                                        ? 'Pause to change the length.'
                                                        : 'Type the hours, minutes and seconds.'}
                                                </p>
                                            </>
                                        )}

                                        {engine.mode === 'stopwatch' && (
                                            <p className="timer-empty-hint" style={{ textAlign: 'left' }}>
                                                Counts up from zero and runs until you stop it.
                                                Press the flag mid-run to mark a split.
                                            </p>
                                        )}

                                        {engine.mode === 'interval' && (
                                            <IntervalEditor
                                                config={engine.intervalConfig}
                                                onChange={engine.setIntervalConfig}
                                                disabled={engine.running}
                                            />
                                        )}

                                        {/* Laps, newest first. */}
                                        {engine.mode === 'stopwatch' && engine.laps.length > 0 && (
                                            <div style={{ marginTop: '0.85rem' }}>
                                                <span className="academic-kicker" style={{ display: 'block', marginBottom: '0.35rem' }}>
                                                    {engine.laps.length} {engine.laps.length === 1 ? 'lap' : 'laps'}
                                                </span>
                                                {laps.map(lap => (
                                                    <div
                                                        key={lap.index}
                                                        className={`course-row${bestSplit !== null && lap.splitMs === bestSplit ? ' timer-lap--best' : ''}${slowestSplit !== null && lap.splitMs === slowestSplit ? ' timer-lap--slow' : ''}`}
                                                        style={{ marginBottom: '0.3rem' }}
                                                    >
                                                        <div className="course-head">
                                                            <div className="course-head__text">
                                                                <span className="course-title">Lap {lap.index}</span>
                                                            </div>
                                                            <div className="course-scores">
                                                                {/* Split first, then total. The
                                                                    split is the number a lap
                                                                    is actually for; the total
                                                                    is the running context. */}
                                                                <span className="score-block">
                                                                    <span className="academic-kicker">Split</span>
                                                                    <span className="score-block__value">
                                                                        {formatHumanDuration(lap.splitMs)}
                                                                    </span>
                                                                </span>
                                                                <span className="score-block">
                                                                    <span className="academic-kicker">Total</span>
                                                                    <span className="score-block__value">
                                                                        {formatHumanDuration(lap.totalMs)}
                                                                    </span>
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    </div>
                                </section>

                                {/* ==================== PRESETS ==================== */}
                                <section className="card puzzle-card timer-mosaic__cell">
                                    <div className="card-body">
                                    <PresetPanel
                                        presets={presets}
                                        onCreate={preset => {
                                            savePreset.mutate(preset);
                                            showToast('success', `Saved "${preset.label}"`);
                                        }}
                                        onUpdate={(id, preset) => editPreset.mutate({ id, preset })}
                                        onDelete={id => setDeletePreset(presets.find(p => p.id === id) ?? null)}
                                        onUse={preset => {
                                            if (preset.kind === 'interval') {
                                                engine.setMode('interval');
                                                engine.setIntervalConfig(preset.config);
                                            } else {
                                                engine.setMode('countdown');
                                                engine.setDuration(preset.durationMs);
                                            }
                                            showToast('info', `Loaded "${preset.label}"`);
                                        }}
                                        busy={savePreset.isPending || editPreset.isPending}
                                    />
                                    </div>
                                </section>

                                </div>
                                <div className="daily-log-col">
                                {/* ==================== ALARMS ==================== */}
                                <section className="card puzzle-card timer-mosaic__cell">
                                    <div className="card-body">
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
                                    </div>
                                </section>

                                {/* ==================== SETTINGS ==================== */}
                                <section className="card puzzle-card timer-mosaic__cell">
                                    <div className="card-body">
                                    <SettingsPanel
                                        settings={draftSettings}
                                        onChange={patch => {
                                            patchSettings(patch);
                                            if (patch.notify === true) void requestNotifications();
                                        }}
                                        onPreview={(id: ChimeId) => playChime(id, draftSettings.volume)}
                                        notificationsBlocked={notificationsBlocked}
                                    />
                                    </div>
                                </section>

                                {anyLoading && (
                                    <p className="timer-empty-hint">Loading your presets and alarms…</p>
                                )}
                                </div>
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

            {/* Both dialogs stay open until the delete actually succeeds. Clearing
                the target straight after mutate() closed it while the request was
                still in flight, so `busy` was never seen and a failed delete
                vanished without a trace. */}
            <ConfirmModal
                open={!!deletePreset}
                title={deletePreset ? `Delete "${deletePreset.label}"?` : ''}
                confirmLabel="Delete"
                danger
                busy={removePreset.isPending}
                onConfirm={() => {
                    if (!deletePreset) return;
                    const label = deletePreset.label;
                    removePreset.mutate(deletePreset.id, {
                        onSuccess: () => {
                            setDeletePreset(null);
                            showToast('success', `Deleted "${label}"`);
                        },
                    });
                }}
                onCancel={() => setDeletePreset(null)}
            />

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





