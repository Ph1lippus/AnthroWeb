import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Dumbbell, GripVertical, HeartPulse, PersonStanding, Trash2 } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import SetTable, { SetCounter } from './SetTable';
import ExerciseNameInput from './ExerciseNameInput';
import type { CardioSegment, CardioSegmentType, WorkoutTemplateExercise } from '../../services/workoutService';
import type { ActivityType, WorkoutSet } from '../../utils/workoutSets';
import { ACTIVITY_LABELS, detailToRows, rowsToDetail, describeTargets } from '../../utils/workoutSets';
import type { WeightUnit } from '../../utils/units';

const TYPE_ICONS: Record<ActivityType, React.ReactNode> = {
    strength: <Dumbbell size={13} />,
    cardio: <HeartPulse size={13} />,
    mobility: <PersonStanding size={13} />,
};

const TYPE_OPTIONS: ActivityType[] = ['strength', 'cardio', 'mobility'];

const templateCardioSegments = (segments: CardioSegment[]): CardioSegment[] =>
    segments.map(({ hr_1_min: _hr1, hr_2_min: _hr2, ...segment }) => segment);

/**
 * What the row is editing, held locally.
 *
 * This is the whole reason typing works. Previously every field read its value
 * straight from `exercise`, which is the server's copy, and wrote on change --
 * so each keystroke sent a request and the input was reset to the server's value
 * the moment React re-rendered. You got one character in before the field went
 * blank again, which reads as lag and is not lag.
 *
 * The row owns a draft, commits it once when focus leaves, and re-seeds from the
 * server only when it is opened. That is the same approach `InlineNumber` takes
 * on the academic page and `SessionEditor` takes for a whole session.
 */
interface Draft {
    exercise_name: string;
    activity_type: ActivityType;
    sets: WorkoutSet[];
    duration_minutes: number | null;
    distance_km: number | null;
    cardio_segments: CardioSegment[];
    notes: string;
}

const toDraft = (exercise: WorkoutTemplateExercise): Draft => {
    const stored = exercise.target_sets_detail ?? [];
    return {
        exercise_name: exercise.exercise_name,
        activity_type: exercise.activity_type,
        // Always at least one row, so a strength exercise has somewhere to type.
        sets: detailToRows(
            stored,
            Math.max(1, stored.length),
            exercise.target_reps ?? undefined,
            exercise.target_weight ?? undefined,
        ),
        duration_minutes: exercise.target_duration_minutes ?? null,
        distance_km: exercise.target_distance_km ?? null,
        cardio_segments: templateCardioSegments(exercise.cardio_segments ?? []),
        notes: exercise.notes ?? '',
    };
};

interface ExerciseRowProps {
    exercise: WorkoutTemplateExercise;
    weightUnit: WeightUnit;
    onUpdate: (id: string, updates: Partial<WorkoutTemplateExercise>) => void;
    onDelete: (id: string) => void;
    onPointerDown: (id: string) => void;
    isDragging: boolean;
    isDragOver: boolean;
    isSaving?: boolean;
}

/**
 * One exercise in a session, collapsed by default.
 *
 * The collapse is the point. A session can hold a dozen exercises, each of which
 * opens into a full per-set table; left open the list becomes a wall of number
 * inputs and the shape of the session is unreadable. Collapsed, each row is one
 * line that still answers "what, and how heavy".
 *
 * Built on the shared .collapse-card primitives, the same ones a semester or a
 * course row uses, so the interaction is already familiar.
 */
const ExerciseRow: React.FC<ExerciseRowProps & { completed?: boolean }> = ({
    exercise,
    weightUnit,
    onUpdate,
    onDelete,
    onPointerDown,
    isDragging,
    isDragOver,
    isSaving,
    completed = false,
}) => {
    const [open, setOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [draft, setDraft] = useState<Draft>(() => toDraft(exercise));

    const isStrength = draft.activity_type === 'strength';
    const setCount = Math.max(1, draft.sets.length);

    /** Writes the draft. `reps` and `weight` are denormalised from the heaviest set. */
    const commit = (next: Draft) => {
        if (!exercise.id) return;
        const detail = rowsToDetail(next.sets);
        const heaviest = detail.reduce<WorkoutSet | undefined>(
            (best, set) => (best === undefined || (set.weight ?? 0) > (best.weight ?? 0) ? set : best),
            undefined,
        );
        onUpdate(exercise.id, {
            exercise_name: next.exercise_name.trim() || exercise.exercise_name,
            activity_type: next.activity_type,
            target_sets_detail: detail,
            target_reps: heaviest?.reps ?? null,
            target_weight: heaviest?.weight ?? null,
            target_duration_minutes: next.duration_minutes,
            target_distance_km: next.distance_km,
            cardio_segments: next.cardio_segments.length
                ? templateCardioSegments(next.cardio_segments)
                : null,
            notes: next.notes.trim() || null,
        });
    };

    const close = () => {
        // Re-seed on the way out, so reopening starts from what is actually saved
        // rather than from whatever was half-typed last time.
        setOpen(false);
        setDraft(toDraft(exercise));
    };

    const patch = (next: Partial<Draft>) => setDraft(current => ({ ...current, ...next }));

    const nameId = `ex-name-${exercise.id}`;
    const typeId = `ex-type-${exercise.id}`;
    const notesId = `ex-notes-${exercise.id}`;

    return (
        <div
            className={`collapse-card exercise-row ${open ? 'collapse-card--open' : ''}${isDragging ? ' exercise-row--dragging' : ''}${isDragOver ? ' exercise-row--drag-over' : ''}`}
            data-exercise-id={exercise.id}
        >
            <span
                className="exercise-drag-handle"
                role="button"
                tabIndex={0}
                aria-label={`Reorder ${exercise.exercise_name}`}
                title="Drag to reorder"
                onKeyDown={event => event.stopPropagation()}
                onPointerDown={event => {
                    if (completed) return;
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    onPointerDown(exercise.id!);
                }}
                onPointerUp={event => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                }}
            >
                <GripVertical size={15} />
            </span>
            <button
                type="button"
                className="collapse-head"
                aria-expanded={open}
                onClick={() => {
                    if (completed) return; // Don't open completed exercises
                    if (open) close();
                    else setOpen(true);
                }}
            >
                <span className={`workout-ex__type workout-ex__type--${exercise.activity_type}`}>
                    {TYPE_ICONS[exercise.activity_type]}
                </span>
                <span className="collapse-head__text">
                    <span className="semester-title" style={{ color: 'var(--color-light)' }}>
                        {draft.exercise_name || exercise.exercise_name}
                    </span>
                    <span className="semester-meta">{describeTargets(exercise, weightUnit)}</span>
                </span>
                <span className="collapse-head__right">
                    <span className="collapse-chevron">
                        <ChevronDown size={15} />
                    </span>
                </span>
            </button>

            {open && (
                /* One commit per departure, not one per keystroke. Focusing
                   another field inside this body keeps the draft local; leaving
                   the body saves it. */
                <div
                    className="collapse-body"
                    onBlur={event => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            commit(draft);
                        }
                    }}
                >
                    <div className="workout-ex__grid">
                        <div className="workout-ex__field">
                            <label className="form-label" htmlFor={nameId}>Exercise</label>
                            <ExerciseNameInput
                                id={nameId}
                                value={draft.exercise_name}
                                className="form-control"
                                activityType={draft.activity_type}
                                onChange={name => patch({ exercise_name: name })}
                                onPick={picked => {
                                    const next = {
                                        ...draft,
                                        exercise_name: picked.name,
                                        activity_type: picked.activity_type,
                                    };
                                    setDraft(next);
                                    commit(next);
                                }}
                            />
                        </div>

                        <div className="workout-ex__field">
                            <label className="form-label" htmlFor={typeId}>Type</label>
                            <select
                                id={typeId}
                                className="form-control"
                                value={draft.activity_type}
                                onChange={event => {
                                    const next = { ...draft, activity_type: event.target.value as ActivityType };
                                    setDraft(next);
                                    commit(next);
                                }}
                            >
                                {TYPE_OPTIONS.map(type => (
                                    <option key={type} value={type}>{ACTIVITY_LABELS[type]}</option>
                                ))}
                            </select>
                        </div>

                        {isStrength ? (
                            <div className="workout-ex__field">
                                <label className="form-label" htmlFor={`ex-sets-${exercise.id}`}>Sets</label>
                                <SetCounter
                                    count={setCount}
                                    disabled={isSaving}
                                    onChange={count => patch({
                                        sets: detailToRows(
                                            draft.sets,
                                            count,
                                            exercise.target_reps ?? undefined,
                                            exercise.target_weight ?? undefined,
                                        ),
                                    })}
                                />
                            </div>
                        ) : (
                            <div className="workout-ex__field">
                                <label className="form-label" htmlFor={`ex-dur-${exercise.id}`}>
                                    Duration (min)
                                </label>
                                <input
                                    id={`ex-dur-${exercise.id}`}
                                    type="number"
                                    min={0}
                                    className="form-control"
                                    value={draft.duration_minutes ?? ''}
                                    onChange={event => patch({
                                        duration_minutes: event.target.value === ''
                                            ? null
                                            : Number(event.target.value),
                                    })}
                                />
                            </div>
                        )}

                        {draft.activity_type === 'cardio' && (
                            <div className="workout-ex__field">
                                <label className="form-label" htmlFor={`ex-dist-${exercise.id}`}>
                                    Distance (km)
                                </label>
                                <input
                                    id={`ex-dist-${exercise.id}`}
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    className="form-control"
                                    value={draft.distance_km ?? ''}
                                    onChange={event => patch({
                                        distance_km: event.target.value === ''
                                            ? null
                                            : Number(event.target.value),
                                    })}
                                />
                            </div>
                        )}
                    </div>

                    {draft.activity_type === 'cardio' && (
                        <div className="workout-cardio-segments">
                            <div className="workout-cardio-segments__head">
                                <span className="form-label">Cardio segments</span>
                                <SetCounter
                                    count={draft.cardio_segments.length}
                                    label="segments"
                                    min={0}
                                    onChange={count => {
                                        const segments = [...draft.cardio_segments];
                                        while (segments.length < count) segments.push({ type: 'work' });
                                        patch({ cardio_segments: segments.slice(0, count) });
                                    }}
                                />
                            </div>
                            {draft.cardio_segments.map((segment, index) => (
                                <div className="workout-cardio-segment" key={`${exercise.id}-template-segment-${index}`}>
                                    <select
                                        className="form-control"
                                        value={segment.type}
                                        onChange={event => {
                                            const next = [...draft.cardio_segments];
                                            next[index] = { ...segment, type: event.target.value as CardioSegmentType };
                                            patch({ cardio_segments: next });
                                        }}
                                        aria-label={`Segment ${index + 1} type`}
                                    >
                                        <option value="warm-up">Warm-up</option>
                                        <option value="work">Work</option>
                                        <option value="recovery">Recovery</option>
                                        <option value="cool-down">Cool-down</option>
                                    </select>
                                    {([
                                        ['Duration', 'duration_minutes', 0.1],
                                        ['Level', 'level', 0.1],
                                        ['Speed', 'speed', 0.1],
                                    ] as const).map(([label, field, step]) => (
                                        <input
                                            key={field}
                                            type="number"
                                            min={0}
                                            step={step}
                                            className="form-control"
                                            placeholder={label}
                                            aria-label={`${label} segment ${index + 1}`}
                                            value={segment[field] ?? ''}
                                            onChange={event => {
                                                const next = [...draft.cardio_segments];
                                                next[index] = {
                                                    ...segment,
                                                    [field]: event.target.value === '' ? null : Number(event.target.value),
                                                };
                                                patch({ cardio_segments: next });
                                            }}
                                        />
                                    ))}
                                    <button
                                        type="button"
                                        className="btn-action"
                                        aria-label={`Remove segment ${index + 1}`}
                                        onClick={() => patch({
                                            cardio_segments: draft.cardio_segments.filter((_, segmentIndex) => segmentIndex !== index),
                                        })}
                                    >
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {isStrength && (
                        <SetTable
                            sets={draft.sets}
                            onChange={sets => patch({ sets })}
                            weightUnit={weightUnit}
                            disabled={isSaving}
                        />
                    )}

                    <div className="workout-ex__field">
                        <label className="form-label" htmlFor={notesId}>Notes</label>
                        <input
                            id={notesId}
                            type="text"
                            className="form-control"
                            placeholder="Optional"
                            value={draft.notes}
                            onChange={event => patch({ notes: event.target.value })}
                        />
                    </div>

                    <div className="workout-ex__actions">
                        <button type="button" className="btn-action" onClick={() => setConfirming(true)}>
                            <Trash2 size={11} className="mr-1" />Remove
                        </button>
                    </div>
                </div>
            )}

            <ConfirmModal
                open={confirming}
                title={`Remove ${draft.exercise_name || exercise.exercise_name}?`}
                description="This changes the session only. Workouts already logged keep their own record."
                confirmLabel="Remove"
                danger
                onConfirm={() => {
                    setConfirming(false);
                    onDelete(exercise.id!);
                }}
                onCancel={() => setConfirming(false)}
            />
        </div>
    );
};

interface ExerciseEditorProps {
    exercises: WorkoutTemplateExercise[];
    dayOfWeek: number;
    /** Which session these belong to. Null for rows written before sessions. */
    sessionId?: string | null;
    /** What a new exercise defaults to -- usually its session's type. */
    defaultActivityType?: ActivityType;
    weightUnit: WeightUnit;
    onAdd: (input: {
        exercise_id?: string | null;
        exercise_name: string;
        activity_type: ActivityType;
        day_of_week: number;
        session_id?: string | null;
        position?: number;
    }) => Promise<unknown>;
    onUpdate: (id: string, updates: Partial<WorkoutTemplateExercise>) => void;
    onDelete: (id: string) => void;
    onReorder: (ordered: Array<{ id: string; position: number }>) => void;
    isSaving?: boolean;
}

/**
 * The exercise list for one session, plus the form that adds to it.
 *
 * Adding is name-only on purpose. An exercise that exists with no sets yet is a
 * normal thing to want -- jotting down what you will do is the common case --
 * and demanding numbers before the row exists makes that slower than writing it
 * on paper. The row opens into the full form: sets, reps, weight, or a duration
 * for cardio and mobility.
 */
const ExerciseEditor: React.FC<ExerciseEditorProps> = ({
    exercises,
    dayOfWeek,
    sessionId = null,
    defaultActivityType = 'strength',
    weightUnit,
    onAdd,
    onUpdate,
    onDelete,
    onReorder,
    isSaving,
}) => {
    const [name, setName] = useState('');
    const [type, setType] = useState<ActivityType>(defaultActivityType);
    const [exerciseId, setExerciseId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const dragOverIdRef = useRef<string | null>(null);
    const addId = useId();

    /* A failed add used to be invisible. `onAdd` rejects, the rejection was never
       caught, and the form just stopped -- no row, no message, nothing on screen
       to say the save had been refused by the database. That is how a stale unique
       constraint survived the sessions rewrite: it looked like the button was
       broken rather than the schema disagreeing with the code.

       The typed name is deliberately kept on failure, so the answer to "it did not
       save" is a visible reason and a retry, not retyping. */
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        setError(null);
        try {
            await onAdd({
                exercise_id: exerciseId,
                exercise_name: trimmed,
                activity_type: type,
                day_of_week: dayOfWeek,
                session_id: sessionId,
                position: exercises.length,
            });
            setName('');
            setExerciseId(null);
            setType(defaultActivityType);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not add the exercise.');
        }
    };

    const dropExercise = (targetId: string) => {
        if (!draggingId || draggingId === targetId) {
            setDraggingId(null);
            setDragOverId(null);
            return;
        }

        const reordered = [...exercises];
        const fromIndex = reordered.findIndex(exercise => exercise.id === draggingId);
        const targetIndex = reordered.findIndex(exercise => exercise.id === targetId);
        if (fromIndex === -1 || targetIndex === -1) return;

        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(targetIndex, 0, moved);
        onReorder(reordered.map((exercise, position) => ({ id: exercise.id!, position })));
        setDraggingId(null);
        setDragOverId(null);
    };

    useEffect(() => {
        if (!draggingId) return;

        const handlePointerMove = (event: PointerEvent) => {
            const target = document
                .elementFromPoint(event.clientX, event.clientY)
                ?.closest<HTMLElement>('[data-exercise-id]');
            const nextDragOverId = target?.dataset.exerciseId ?? null;
            dragOverIdRef.current = nextDragOverId;
            setDragOverId(nextDragOverId);
        };
        const handlePointerUp = () => {
            if (dragOverIdRef.current) dropExercise(dragOverIdRef.current);
            else setDraggingId(null);
            dragOverIdRef.current = null;
            setDragOverId(null);
        };
        const handlePointerCancel = () => {
            dragOverIdRef.current = null;
            setDraggingId(null);
            setDragOverId(null);
        };

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
        document.addEventListener('pointercancel', handlePointerCancel);
        return () => {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', handlePointerUp);
            document.removeEventListener('pointercancel', handlePointerCancel);
        };
    }, [draggingId, exercises]);

    return (
        <>
            {exercises.length === 0 ? null : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {exercises.map(exercise => (
                        <ExerciseRow
                            key={exercise.id}
                            exercise={exercise}
                            weightUnit={weightUnit}
                            onUpdate={onUpdate}
                            onDelete={onDelete}
                            onPointerDown={id => {
                                dragOverIdRef.current = id;
                                setDraggingId(id);
                            }}
                            isDragging={draggingId === exercise.id}
                            isDragOver={dragOverId === exercise.id && draggingId !== exercise.id}
                            isSaving={isSaving}
                        />
                    ))}
                </div>
            )}

            <form className="exercise-add" onSubmit={submit}>
                <div className="workout-ex__field">
                    <label className="form-label" htmlFor={addId}>Add an exercise</label>
                    <ExerciseNameInput
                        id={addId}
                        value={name}
                        onChange={value => {
                            setName(value);
                            /* A typed edit is a different exercise. The id picked
                               for the previous name would otherwise be submitted
                               with it, so "Bench Press" turned into "Bench Press,
                               narrow grip" and stored the barbell row's muscles.
                               The pick clears nothing on its own -- `commit` calls
                               `onChange` first and `onPick` second, so the order
                               here ends with the picked id either way. */
                            setExerciseId(null);
                            if (error) setError(null);
                        }}
                        onPick={picked => {
                            setExerciseId(picked.exercise_id ?? null);
                            setType(picked.activity_type);
                            setError(null);
                        }}
                        onActivityTypeChange={setType}
                        activityType={type}
                        className="form-control"
                        placeholder="Search or type a name"
                    />
                </div>
            </form>

            {/* `role="alert"` rather than a toast: the reason belongs next to the
                field that caused it, and it has to still be there if the user looks
                away and comes back. */}
            {error && (
                <p className="workout-ex__error" role="alert">{error}</p>
            )}
        </>
    );
};

export default ExerciseEditor;