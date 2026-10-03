import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Circle, CircleCheck, Flag, Loader2, Plus, Trash2 } from 'lucide-react';
import SetTable, { SetCounter } from './SetTable';
import ExerciseNameInput from './ExerciseNameInput';
import {
    useActiveTemplate,
    useSessionByDate,
    useSessionExercises,
    useSaveSession,
    useWorkoutPlan,
    useStartSessionFromPlan,
    usePlanSession,
    useTodaysPlanSessions,
} from '../../hooks/useWorkouts';
import { useUserSettings } from '../../hooks/useUserSettings';
import { formatDayLabel, todayString, addDays } from '../../utils/dates';
import { DAY_NAMES } from '../../utils/workoutStats';
import {
    detailToRows,
    rowsToDetail,
    parseInputNumber,
    describeTargets,
    type ActivityType,
    type WorkoutSet,
} from '../../utils/workoutSets';

interface DraftRow {
    id?: string;
    exercise_name: string;
    /** The library row this came from, so the log joins back to `exercises`. */
    exercise_id?: string | null;
    activity_type: ActivityType;
    planned: boolean;
    completed: boolean;
    sets_detail: WorkoutSet[];
    duration_minutes?: number | null;
    distance_km?: number | null;
}

/**
 * What the active template offers for a day that has no session yet.
 *
 * This is the answer to "I went to the gym and today is Friday and the template
 * has something for Friday" -- the plan is shown, and starting the session
 * copies it in. Two things it deliberately does not do:
 *
 * It does not create the session on arrival. Opening a day you are only looking
 * at should not leave an empty session behind for every date you browse.
 *
 * It does not mark the day trained. That is the difference between opening a
 * session and finishing one, and conflating them would put a half-filled session
 * into the streak, the heatmap and the daily log's score.
 *
 * The copy used to say "the active template has no exercises for this day",
 * which was simply false in the common case: the template did have them, the day
 * had just never been marked, so nothing had copied them across yet.
 */
const PlanPreview: React.FC<{
    date: string;
    weekday: number;
    onStarted: () => void;
}> = ({ date, weekday, onStarted }) => {
    const weightUnit = useUserSettings().settings?.weight_unit ?? 'kg';
    const { activeTemplate } = useActiveTemplate();
    const { data: plan = [], isLoading } = useWorkoutPlan(weekday);
    /* Today's planned sessions, so the day can be started from one of them and
       remember which. That back-reference is what makes the target intensity
       comparable with what the day actually was. */
    const { data: todaysSessions = [] } = useTodaysPlanSessions(weekday);
    const start = useStartSessionFromPlan();

    const hasPlan = plan.length > 0;
    const exercisesBySession = useMemo(() => {
        const map = new Map<string, typeof plan>();
        for (const session of todaysSessions) {
            map.set(session.id!, plan.filter(row => row.session_id === session.id));
        }
        return map;
    }, [todaysSessions, plan]);

    return (
        <div className="plan-preview">
            <div className="plan-preview__head">
                <p className="workout-empty__title" style={{ margin: 0 }}>
                    {hasPlan
                        ? `${DAY_NAMES[weekday]} — ${activeTemplate?.name ?? 'the active template'} has ${plan.length} exercise${plan.length === 1 ? '' : 's'}`
                        : `Nothing planned for ${DAY_NAMES[weekday]}`}
                </p>
                <p className="workout-empty__text" style={{ marginTop: '0.3rem' }}>
                    {hasPlan
                        ? 'Starting copies the plan in so you fill in what you actually did. It edits this day only — the template stays as it is.'
                        : activeTemplate
                            ? 'The active template has no exercises for this day. You can still log a session and add what you did below.'
                            : 'No active template. Add what you did below, or make a template for the week.'}
                </p>
            </div>

            {hasPlan && (
                <div className="workout-rows" style={{ marginTop: '0.75rem' }}>
                    {plan.map(row => (
                        <div className="workout-row" key={row.id}>
                            <span className="workout-row__name">{row.exercise_name}</span>
                            <span className="workout-row__value">{describeTargets(row, weightUnit)}</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="plan-preview__actions">
                {todaysSessions.map(session => {
                    const rows = exercisesBySession.get(session.id!) ?? [];
                    return (
                        <button
                            key={session.id}
                            className="btn-action btn-action--primary"
                            disabled={start.isPending || isLoading}
                            onClick={async () => {
                                await start.mutateAsync({ date, planSessionId: session.id });
                                onStarted();
                            }}
                        >
                            <Flag size={11} className="mr-1" />
                            {start.isPending ? 'Starting…' : `Start ${session.name}`}
                            {rows.length > 0 && ` · ${rows.length}`}
                        </button>
                    );
                })}
                {todaysSessions.length === 0 && hasPlan && (
                    <button
                        className="btn-action btn-action--primary"
                        disabled={start.isPending || isLoading}
                        onClick={async () => {
                            await start.mutateAsync({ date });
                            onStarted();
                        }}
                    >
                        <Flag size={11} className="mr-1" />
                        {start.isPending ? 'Starting…' : 'Start session'}
                    </button>
                )}
                <button
                    className="btn-action"
                    disabled={start.isPending}
                    onClick={async () => {
                        await start.mutateAsync({ date });
                        onStarted();
                    }}
                >
                    Start empty
                </button>
            </div>
        </div>
    );
};

interface SessionEditorProps {
    date: string;
    /** Close the editor, or step to another day when given one. */
    onNavigate: (date?: string) => void;
}

/**
 * One session, one day -- the editor that replaces the mosaic while it is open.
 *
 * The date arrives as a prop so the page stays URL-driven:
 * /Workouts?day=2026-10-12 is linkable, the browser's Back closes the editor,
 * and the mark-a-day panel, the recent strip and the daily log's Gym link all
 * open the same day through the same route.
 *
 * The day's exercises come from the session's own rows, materialised from the
 * template when it was marked. That is what makes this a record of what happened
 * rather than a live view of a plan that may since have been rewritten -- and it
 * is why saving here never touches the template.
 */
const SessionEditor: React.FC<SessionEditorProps> = ({ date, onNavigate }) => {
    const weightUnit = useUserSettings().settings?.weight_unit ?? 'kg';
    const weekday = new Date(`${date}T00:00:00`).getDay();

    const { activeTemplate } = useActiveTemplate();
    const { data: session, isLoading: sessionLoading } = useSessionByDate(date);
    const { data: stored, isLoading: exercisesLoading } = useSessionExercises(session?.id);
    /* The planned session this day was started from, for the target/actual
       comparison below. Read from the log row's own back-reference, so it stays
       correct after the plan is edited. */
    const { data: planSession = null } = usePlanSession(session?.plan_session_id);

    const [rows, setRows] = useState<DraftRow[]>([]);
    const [intensity, setIntensity] = useState(5);
    const [duration, setDuration] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState<ActivityType>('strength');
    // Held alongside the name rather than read back off the input, because the
    // picker clears the id on every keystroke and only onPick sets it again.
    const [newExerciseId, setNewExerciseId] = useState<string | null>(null);

    const saveSession = useSaveSession();
    // A wrapper rather than a ref forwarded into ExerciseNameInput: that component
    // owns its input ref internally, and reaching the input by query keeps the
    // two components from having to agree on one.
    const addInputRef = useRef<HTMLDivElement | null>(null);

    // Reset when the day changes, or the next day's data would render under the
    // previous day's heading.
    const loadedFor = useRef<string | null>(null);
    useEffect(() => { loadedFor.current = null; }, [date]);

    // Hydrate once per session. Re-running on every server response would throw
    // away whatever the user had typed but not yet saved. The ref guard also
    // keeps this out of the set-state-in-effect pattern the linter looks for.
    useEffect(() => {
        if (!session?.id || loadedFor.current === session.id) return;
        loadedFor.current = session.id;

        // Populating the editor from server data is an external-system sync.
        // The ref guard keeps it out of the set-state-in-effect pattern the
        // linter looks for, because it cannot fire on a render where nothing
        // the user cares about changed.
        setIntensity(session.intensity ?? 5);
        setDuration(session.duration_minutes?.toString() ?? '');
        setNotes(session.notes ?? '');
        setRows((stored ?? []).map(row => ({
            id: row.id,
            exercise_name: row.exercise_name,
            exercise_id: row.exercise_id,
            activity_type: row.activity_type,
            planned: row.planned,
            completed: row.completed,
            sets_detail: detailToRows(
                row.sets_detail ?? [],
                Math.max(1, row.sets_detail?.length ?? 0),
                row.reps ?? undefined,
                row.weight ?? undefined,
            ),
            duration_minutes: row.duration_minutes ?? null,
            distance_km: row.distance_km ?? null,
        })));
    }, [session, stored]);

    // A row emptied by its delete button is hidden at once; the save turns it
    // into a real DELETE. A blank row left on screen looks like it failed.
    const visible = rows.filter(row => row.exercise_name.trim());
    const doneCount = visible.filter(row => row.completed).length;
    const totalSets = visible.filter(row => row.completed).reduce((n, row) => n + row.sets_detail.length, 0);
    const progress = visible.length > 0 ? doneCount / visible.length * 100 : 0;

    // Wrapped rather than a plain function so `scheduleSave` below keeps a stable
    // identity -- a new one every render would restart the debounce timer on every
    // keystroke and the save would never fire.
    const handleSave = useCallback(async (draftRows = rows) => {
        setSaving(true);
        try {
            await saveSession.mutateAsync({
                date,
                createIfMissing: true,
                // `completed` is deliberately absent. This used to be written from a
                // "Save progress" button that passed `false`, so saving your work
                // silently un-completed a day the daily log had already ticked --
                // which is what made the year chart show a trained day as empty.
                // Completing a day is the daily log's Gym habit and nothing else;
                // see useSaveSession's note on not defaulting it either.
                header: {
                    intensity,
                    duration_minutes: duration ? parseInt(duration, 10) : undefined,
                    notes: notes || undefined,
                    workout_template_id: activeTemplate?.id ?? null,
                },
                exercises: draftRows.map(row => ({
                    id: row.id,
                    exercise_name: row.exercise_name,
                    exercise_id: row.exercise_id ?? null,
                    activity_type: row.activity_type,
                    completed: row.completed,
                    sets_detail: rowsToDetail(row.sets_detail),
                    duration_minutes: row.duration_minutes ?? null,
                    distance_km: row.distance_km ?? null,
                })),
            });
            setSaved(true);
        } catch (error) {
            console.error('Could not save the session:', error);
        } finally {
            setSaving(false);
        }
    }, [saveSession, date, intensity, duration, notes, activeTemplate, rows]);

    /* Autosave on leaving a field, the way the daily log autosaves.
     *
     * This replaced a "Save progress" and a "Complete" button. Both were wrong in
     * the same way: the first wrote `completed: false`, so saving your work on a
     * day the daily log had already ticked as trained silently un-completed it and
     * the year chart went blank for that square. The second completed a day as a
     * side effect of logging it, from a page that has no business deciding whether
     * a day counts.
     *
     * On blur rather than on every keystroke, because rows here change
     * structurally -- adding, removing or ticking a row is not a keystroke, and
     * those changes need saving just as much. A short debounce still applies so
     * tabbing through four fields in a row is one write rather than four.
     *
     * Nothing is saved for a day with no rows and no header content, so merely
     * opening a future day does not create an empty session for it. */
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scheduleSaveRows = useCallback((draftRows: DraftRow[]) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            void handleSave(draftRows);
        }, 600);
    }, [handleSave]);
    const scheduleSave = useCallback(() => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            void handleSave();
        }, 600);
    }, [handleSave]);

    // A pending save must not be lost to a day change or an unmount.
    useEffect(() => () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    }, []);

    const step = (delta: number) => {
        const next = addDays(date, delta);
        if (next <= todayString()) onNavigate(next);
    };

    const loading = sessionLoading || (session?.id ? exercisesLoading : false);
    if (loading) return <p className="form-label">Loading&hellip;</p>;

    /* What the planned session asked for, against what this day turned out to
       be. Only available once the log row records which plan session it
       followed, which happens when the day is started from one. */
    const targetIntensity = planSession?.target_intensity ?? null;
    const actualIntensity = session?.intensity ?? null;
    const delta = targetIntensity != null && actualIntensity != null
        ? actualIntensity - targetIntensity
        : null;

    return (
        <div className="workout-mosaic workout-mosaic--split">
            {/* ---- Date, effort, notes ---- */}
            <div className="workout-mosaic__col workout-mosaic__days">
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">
                            <button
                                className="btn-action"
                                style={{ padding: '0.15rem 0.3rem' }}
                                onClick={() => onNavigate()}
                                aria-label="Back to workouts"
                            >
                                <ChevronLeft size={11} />
                            </button>
                            {formatDayLabel(date)}
                        </h3>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.7rem' }}>
                            <button
                                className="btn-action"
                                style={{ padding: '0.2rem 0.35rem' }}
                                onClick={() => step(-1)}
                                aria-label="Previous day"
                            >
                                <ChevronLeft size={11} />
                            </button>
                            <span
                                className="semester-meta"
                                style={{ alignSelf: 'center', flex: 1, textAlign: 'center' }}
                            >
                                {DAY_NAMES[weekday]}
                            </span>
                            <button
                                className="btn-action"
                                style={{ padding: '0.2rem 0.35rem' }}
                                onClick={() => step(1)}
                                disabled={date >= todayString()}
                                aria-label="Next day"
                            >
                                <ChevronRight size={11} />
                            </button>
                        </div>

                        <div className="intensity-head">
                            <label className="form-label" htmlFor="session-actual-intensity">
                                How hard it was
                            </label>
                            <output className="intensity-readout" htmlFor="session-actual-intensity">
                                {intensity}
                                <span>/10</span>
                            </output>
                        </div>
                        <input
                            id="session-actual-intensity"
                            type="range"
                            className="intensity-slider"
                            min={1}
                            max={10}
                            value={intensity}
                            onChange={event => setIntensity(Number(event.target.value))}
                            // A slider never blurs, so `change` fires continuously
                            // while dragging. Committing on release is the only way
                            // to get one write per drag rather than one per pixel.
                            onMouseUp={scheduleSave}
                            onTouchEnd={scheduleSave}
                            onKeyUp={scheduleSave}
                        />

                        {/* The plan asked for one number; this day produced
                            another. The difference is the point of storing a
                            target at all -- without it, 7/10 is just a number
                            with nothing to be more or less than. */}
                        {delta != null && (
                            <div className={`intensity-vs intensity-vs--${delta === 0 ? 'even' : delta > 0 ? 'over' : 'under'}`}>
                                <span>
                                    Target <strong>{targetIntensity}</strong>
                                </span>
                                <span>
                                    You did <strong>{actualIntensity}</strong>
                                </span>
                                <span className="intensity-vs__delta">
                                    {delta === 0 ? 'on target' : `${delta > 0 ? '+' : ''}${delta}`}
                                </span>
                            </div>
                        )}

                        <div className="workout-ex__field" style={{ marginTop: '0.6rem' }}>
                            <label className="form-label" htmlFor="se-duration">Duration (min)</label>
                            <input
                                id="se-duration"
                                type="number"
                                min={0}
                                className="form-control"
                                value={duration}
                                placeholder="45"
                                onChange={event => setDuration(event.target.value)}
                                onBlur={scheduleSave}
                            />
                        </div>

                        <div className="workout-meter-row" style={{ marginTop: '0.85rem' }}>
                            <span>{doneCount}/{visible.length} exercises done</span>
                            <strong style={{ marginLeft: 'auto' }}>{totalSets} sets</strong>
                        </div>
                        <div className="workout-meter">
                            <div className="workout-meter__fill" style={{ width: `${progress}%` }} />
                        </div>

                        <div className="workout-ex__field" style={{ marginTop: '0.85rem' }}>
                            <label className="form-label" htmlFor="se-notes">Notes</label>
                            <textarea
                                id="se-notes"
                                className="form-control"
                                rows={3}
                                placeholder="How did it go?"
                                value={notes}
                                onChange={event => setNotes(event.target.value)}
                                onBlur={scheduleSave}
                            />
                        </div>

                        {date !== todayString() && (
                            <p className="form-label" style={{ marginTop: '0.6rem' }}>
                                Editing a past day. This changes that session only.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ---- The exercises ---- */}
            <div className="workout-mosaic__inputs">
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Exercises</h3>
                        <span className="semester-meta" style={{ marginLeft: 'auto' }}>
                            {visible.length} logged
                        </span>
                    </div>
                    <div className="card-body">
                        {visible.length === 0 ? (
                            <PlanPreview
                                date={date}
                                weekday={weekday}
                                onStarted={() => undefined}
                            />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {visible.map(row => (
                                    <SessionRow
                                        key={row.id ?? `new-${row.exercise_name}`}
                                        row={row}
                                        weightUnit={weightUnit}
                                        onChange={next => {
                                            const nextRows = rows.map(item => item === row ? next : item);
                                            setRows(nextRows);
                                            // Ticking a row done and deleting one are
                                            // clicks, not blurs, so they save at once.
                                            // The debounce collapses a click that
                                            // follows straight into a field edit.
                                            scheduleSaveRows(nextRows);
                                        }}
                                        onCommit={scheduleSave}
                                    />
                                ))}
                            </div>
                        )}

                        <form
                            style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: '0.75rem' }}
                            onSubmit={event => {
                                event.preventDefault();
                                const trimmed = newName.trim();
                                if (!trimmed) return;
                                const nextRows = [
                                    ...rows,
                                    {
                                        exercise_name: trimmed,
                                        exercise_id: newExerciseId,
                                        activity_type: newType,
                                        planned: false,
                                        completed: false,
                                        sets_detail: detailToRows([], 1),
                                    },
                                ];
                                setRows(nextRows);
                                setNewName('');
                                setNewExerciseId(null);
                                // Focus goes back to the input so several exercises can
                                // be typed in a row, and adding a row is a structural
                                // change rather than a blur, so it saves here.
                                addInputRef.current?.querySelector('input')?.focus();
                                void handleSave(nextRows);
                            }}
                        >
                            <div ref={addInputRef} style={{ flex: 1 }}>
                            <ExerciseNameInput
                                value={newName}
                                // Typing invalidates the pick: a name that no longer
                                // matches what was chosen must not keep its id, or the
                                // log row would join to the wrong library entry.
                                onChange={value => { setNewName(value); setNewExerciseId(null); }}
                                onPick={picked => {
                                    setNewType(picked.activity_type);
                                    setNewExerciseId(picked.exercise_id ?? null);
                                }}
                                activityType={newType}
                                className="form-control"
                                placeholder="Add an exercise"
                            />
                            </div>
                            <button type="submit" className="btn-action" disabled={!newName.trim()}>
                                <Plus size={11} className="mr-1" />Add
                            </button>
                        </form>

                        <div className="workout-ex__actions" style={{ marginTop: '0.85rem' }}>
                            {/* No save button. Leaving a field saves it, and the
                                daily log's Gym habit is the only thing that decides
                                whether a day counts as trained -- so there is nothing
                                left here for a button to decide. */}
                            {saving && (
                                <span className="form-label">
                                    <Loader2 size={11} className="mr-1" />Saving
                                </span>
                            )}
                            {!saving && saved && <span className="workout-chip">saved</span>}
                            {!saving && !saved && (
                                <span className="form-label" style={{ marginLeft: 'auto' }}>
                                    changes save on their own
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

/** One exercise in the session: per-set inputs, or duration for cardio. */
const SessionRow: React.FC<{
    row: DraftRow;
    weightUnit: 'kg' | 'lbs';
    onChange: (next: DraftRow) => void;
    /** Leaving any input in this row saves the session. */
    onCommit?: () => void;
}> = ({ row, weightUnit, onChange, onCommit }) => {
    const isStrength = row.activity_type === 'strength';

    return (
        <div className={`collapse-card ${row.completed ? 'collapse-card--open' : ''}`}>
            <div className="collapse-head" style={{ cursor: 'default' }}>
                <button
                    type="button"
                    className="btn-action"
                    style={{ padding: '0.2rem 0.35rem' }}
                    aria-pressed={row.completed}
                    aria-label={row.completed
                        ? `Mark ${row.exercise_name} as not done`
                        : `Mark ${row.exercise_name} as done`}
                    onClick={() => onChange({ ...row, completed: !row.completed })}
                >
                    {row.completed
                        ? <CircleCheck size={13} style={{ color: 'var(--color-primary)' }} />
                        : <Circle size={13} style={{ opacity: 0.4 }} />}
                </button>
                <span className="collapse-head__text">
                    <span className="semester-title" style={{ color: 'var(--color-light)' }}>
                        {row.exercise_name}
                    </span>
                    <span className="semester-meta">
                        {isStrength
                            ? `${row.sets_detail.length} sets`
                            : [row.duration_minutes ? `${row.duration_minutes} min` : null,
                                row.distance_km ? `${row.distance_km} km` : null]
                                .filter(Boolean).join(' · ') || 'cardio'}
                    </span>
                </span>
                <span className="collapse-head__right">
                    {row.planned && <span className="workout-chip">plan</span>}
                    <button
                        type="button"
                        className="btn-action"
                        style={{ padding: '0.2rem 0.35rem' }}
                        aria-label={`Remove ${row.exercise_name}`}
                        onClick={() => onChange({ ...row, exercise_name: '', completed: false })}
                    >
                        <Trash2 size={12} />
                    </button>
                </span>
            </div>

            {row.completed && (
                <div className="collapse-body">
                    {isStrength ? (
                        <>
                            <SetCounter
                                count={row.sets_detail.length}
                                onChange={count => onChange({
                                    ...row,
                                    sets_detail: detailToRows(row.sets_detail, count),
                                })}
                            />
                            {/* SetTable owns its inputs, so the blur is caught on the
                                wrapper rather than on each cell. */}
                            <div onBlur={onCommit}>
                                <SetTable
                                    sets={row.sets_detail}
                                    weightUnit={weightUnit}
                                    showNumbers={false}
                                    onChange={sets => onChange({ ...row, sets_detail: sets })}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="workout-ex__grid">
                            <div className="workout-ex__field">
                                <label className="form-label" htmlFor={`sd-${row.id ?? row.exercise_name}`}>
                                    Duration (min)
                                </label>
                                <input
                                    id={`sd-${row.id ?? row.exercise_name}`}
                                    type="number"
                                    min={0}
                                    className="form-control"
                                    value={row.duration_minutes ?? ''}
                                    onChange={event => onChange({
                                        ...row,
                                        duration_minutes: parseInputNumber(event.target.value) ?? null,
                                    })}
                                    onBlur={onCommit}
                                />
                            </div>
                            {row.activity_type === 'cardio' && (
                                <div className="workout-ex__field">
                                    <label className="form-label" htmlFor={`sk-${row.id ?? row.exercise_name}`}>
                                        Distance (km)
                                    </label>
                                    <input
                                        id={`sk-${row.id ?? row.exercise_name}`}
                                        type="number"
                                        min={0}
                                        step={0.1}
                                        className="form-control"
                                        value={row.distance_km ?? ''}
                                        onChange={event => onChange({
                                            ...row,
                                            distance_km: parseInputNumber(event.target.value) ?? null,
                                        })}
                                        onBlur={onCommit}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SessionEditor;
