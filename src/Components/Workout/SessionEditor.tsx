import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Circle, CircleCheck, Flag, Loader2, Plus, Trash2 } from 'lucide-react';
import SetTable, { SetCounter } from './SetTable';
import ExerciseNameInput from './ExerciseNameInput';
import { useActiveTemplate, useSessionByDate, useSessionExercises, useSaveSession } from '../../hooks/useWorkouts';
import { useUserSettings } from '../../hooks/useUserSettings';
import { formatDayLabel, todayString, addDays } from '../../utils/dates';
import { DAY_NAMES } from '../../utils/workoutStats';
import { detailToRows, rowsToDetail, parseInputNumber, type ActivityType, type WorkoutSet } from '../../utils/workoutSets';

interface DraftRow {
    id?: string;
    exercise_name: string;
    activity_type: ActivityType;
    planned: boolean;
    completed: boolean;
    sets_detail: WorkoutSet[];
    duration_minutes?: number | null;
    distance_km?: number | null;
}

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

    const [rows, setRows] = useState<DraftRow[]>([]);
    const [intensity, setIntensity] = useState(5);
    const [duration, setDuration] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState<ActivityType>('strength');

    const saveSession = useSaveSession();

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

    const handleSave = async (completed: boolean) => {
        setSaving(true);
        try {
            await saveSession.mutateAsync({
                date,
                createIfMissing: true,
                header: {
                    completed,
                    intensity,
                    duration_minutes: duration ? parseInt(duration, 10) : undefined,
                    notes: notes || undefined,
                    workout_template_id: activeTemplate?.id ?? null,
                },
                exercises: rows.map(row => ({
                    id: row.id,
                    exercise_name: row.exercise_name,
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
    };

    const step = (delta: number) => {
        const next = addDays(date, delta);
        if (next <= todayString()) onNavigate(next);
    };

    const loading = sessionLoading || (session?.id ? exercisesLoading : false);
    if (loading) return <p className="form-label">Loading&hellip;</p>;

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

                        <div className="workout-meter-row">
                            <span>Intensity</span>
                            <strong style={{ marginLeft: 'auto' }}>{intensity}/10</strong>
                        </div>
                        <input
                            type="range"
                            min={1}
                            max={10}
                            value={intensity}
                            aria-label="Session intensity"
                            style={{ width: '100%', accentColor: 'var(--color-primary)' }}
                            onChange={event => setIntensity(Number(event.target.value))}
                        />

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
                            />
                        </div>

                        <div className="workout-meter-row" style={{ marginTop: '0.85rem' }}>
                            <span>{doneCount}/{visible.length} done</span>
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
                            <div className="workout-empty">
                                <p className="workout-empty__title">Nothing on {DAY_NAMES[weekday]}</p>
                                <p className="workout-empty__text">
                                    {activeTemplate
                                        ? 'The active template has no exercises for this day. Add them below — this edits only this session.'
                                        : 'No active template. Add what you did below.'}
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {visible.map(row => (
                                    <SessionRow
                                        key={row.id ?? `new-${row.exercise_name}`}
                                        row={row}
                                        weightUnit={weightUnit}
                                        onChange={next => setRows(current => current.map(
                                            item => (item === row ? next : item),
                                        ))}
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
                                setRows(current => [
                                    ...current,
                                    {
                                        exercise_name: trimmed,
                                        activity_type: newType,
                                        planned: false,
                                        completed: false,
                                        sets_detail: detailToRows([], 1),
                                    },
                                ]);
                                setNewName('');
                            }}
                        >
                            <ExerciseNameInput
                                value={newName}
                                onChange={setNewName}
                                onPick={picked => setNewType(picked.activity_type)}
                                activityType={newType}
                                className="form-control"
                                placeholder="Add an exercise"
                            />
                            <button type="submit" className="btn-action" disabled={!newName.trim()}>
                                <Plus size={11} className="mr-1" />Add
                            </button>
                        </form>

                        <div className="workout-ex__actions" style={{ marginTop: '0.85rem' }}>
                            {saving && (
                                <span className="form-label">
                                    <Loader2 size={11} className="mr-1" />Saving
                                </span>
                            )}
                            {!saving && saved && <span className="workout-chip">saved</span>}
                            <button
                                className="btn-action"
                                style={{ marginLeft: 'auto' }}
                                disabled={saving}
                                onClick={() => handleSave(false)}
                            >
                                Save progress
                            </button>
                            <button
                                className="btn-action btn-action--primary"
                                disabled={saving || doneCount === 0}
                                onClick={() => handleSave(true)}
                            >
                                <Flag size={11} className="mr-1" />Complete
                            </button>
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
}> = ({ row, weightUnit, onChange }) => {
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
                            <SetTable
                                sets={row.sets_detail}
                                weightUnit={weightUnit}
                                showNumbers={false}
                                onChange={sets => onChange({ ...row, sets_detail: sets })}
                            />
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