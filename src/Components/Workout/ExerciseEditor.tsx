import React, { useState } from 'react';
import { ChevronDown, Dumbbell, HeartPulse, PersonStanding, Trash2 } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import SetTable, { SetCounter } from './SetTable';
import ExerciseNameInput from './ExerciseNameInput';
import type { WorkoutTemplateExercise } from '../../services/workoutService';
import type { ActivityType, WorkoutSet } from '../../utils/workoutSets';
import { ACTIVITY_LABELS, detailToRows, rowsToDetail, describeTargets } from '../../utils/workoutSets';
import type { WeightUnit } from '../../utils/units';

const TYPE_ICONS: Record<ActivityType, React.ReactNode> = {
    strength: <Dumbbell size={13} />,
    cardio: <HeartPulse size={13} />,
    mobility: <PersonStanding size={13} />,
};

const TYPE_OPTIONS: ActivityType[] = ['strength', 'cardio', 'mobility'];

interface ExerciseRowProps {
    exercise: WorkoutTemplateExercise;
    weightUnit: WeightUnit;
    onUpdate: (id: string, updates: Partial<WorkoutTemplateExercise>) => void;
    onDelete: (id: string) => void;
    isSaving?: boolean;
}

/**
 * One exercise in a template, collapsed by default.
 *
 * The collapse is the point. A day can hold a dozen exercises, each of which
 * opens into a full per-set table; left open the list becomes a wall of number
 * inputs and the shape of the day is unreadable. Collapsed, each row is one line
 * that still answers "what, and how heavy", so the day can be scanned.
 *
 * Built on the shared .collapse-card primitives, the same ones a semester or a
 * course row uses, so the interaction is already familiar.
 *
 * Edits write through on change rather than behind a save button. There is no
 * such thing as a half-edited template here, and a save per row across a dozen
 * rows is a lot of ceremony for a number.
 */
const ExerciseRow: React.FC<ExerciseRowProps> = ({ exercise, weightUnit, onUpdate, onDelete, isSaving }) => {
    const [open, setOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const isStrength = exercise.activity_type === 'strength';
    const stored = exercise.target_sets_detail ?? [];
    const setCount = Math.max(1, stored.length);

    // Rows always exist for the declared set count, so shrinking the counter is
    // what actually removes a set.
    const rows: WorkoutSet[] = detailToRows(
        stored,
        setCount,
        exercise.target_reps ?? undefined,
        exercise.target_weight ?? undefined,
    );

    const commit = (next: WorkoutSet[]) => {
        const detail = rowsToDetail(next);
        const heaviest = detail.reduce<WorkoutSet | undefined>(
            (best, set) => (best === undefined || (set.weight ?? 0) > (best.weight ?? 0) ? set : best),
            undefined,
        );
        onUpdate(exercise.id!, {
            target_sets_detail: detail,
            target_reps: heaviest?.reps ?? null,
            target_weight: heaviest?.weight ?? null,
        } as Partial<WorkoutTemplateExercise>);
    };

    const nameId = `ex-name-${exercise.id}`;
    const typeId = `ex-type-${exercise.id}`;
    const notesId = `ex-notes-${exercise.id}`;

    return (
        <div className={`collapse-card ${open ? 'collapse-card--open' : ''}`}>
            <button
                type="button"
                className="collapse-head"
                aria-expanded={open}
                onClick={() => setOpen(value => !value)}
            >
                <span className={`workout-ex__type workout-ex__type--${exercise.activity_type}`}>
                    {TYPE_ICONS[exercise.activity_type]}
                </span>
                <span className="collapse-head__text">
                    <span className="semester-title" style={{ color: 'var(--color-light)' }}>
                        {exercise.exercise_name}
                    </span>
                    <span className="semester-meta">{describeTargets(exercise, weightUnit)}</span>
                </span>
                <span className="collapse-head__right">
                    <ChevronDown size={15} className="collapse-chevron" />
                </span>
            </button>

            {open && (
                <div className="collapse-body">
                    <div className="workout-ex__grid">
                        <div className="workout-ex__field">
                            <label className="form-label" htmlFor={nameId}>Exercise</label>
                            <ExerciseNameInput
                                id={nameId}
                                value={exercise.exercise_name}
                                className="form-control"
                                activityType={exercise.activity_type}
                                onChange={name => onUpdate(exercise.id!, { exercise_name: name })}
                                onPick={picked => onUpdate(exercise.id!, {
                                    exercise_name: picked.name,
                                    exercise_id: picked.exercise_id ?? null,
                                    activity_type: picked.activity_type,
                                })}
                            />
                        </div>

                        <div className="workout-ex__field">
                            <label className="form-label" htmlFor={typeId}>Type</label>
                            <select
                                id={typeId}
                                className="form-control"
                                value={exercise.activity_type}
                                onChange={event => onUpdate(exercise.id!, {
                                    activity_type: event.target.value as ActivityType,
                                })}
                            >
                                {TYPE_OPTIONS.map(type => (
                                    <option key={type} value={type}>{ACTIVITY_LABELS[type]}</option>
                                ))}
                            </select>
                        </div>

                        {isStrength ? (
                            <div className="workout-ex__field">
                                <label className="form-label">Sets</label>
                                <SetCounter
                                    count={setCount}
                                    disabled={isSaving}
                                    onChange={count => commit(detailToRows(
                                        stored,
                                        count,
                                        exercise.target_reps ?? undefined,
                                        exercise.target_weight ?? undefined,
                                    ))}
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
                                    value={exercise.target_duration_minutes ?? ''}
                                    onChange={event => onUpdate(exercise.id!, {
                                        target_duration_minutes: event.target.value === ''
                                            ? null
                                            : Number(event.target.value),
                                    })}
                                />
                            </div>
                        )}

                        {exercise.activity_type === 'cardio' && (
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
                                    value={exercise.target_distance_km ?? ''}
                                    onChange={event => onUpdate(exercise.id!, {
                                        target_distance_km: event.target.value === ''
                                            ? null
                                            : Number(event.target.value),
                                    })}
                                />
                            </div>
                        )}
                    </div>

                    {isStrength && (
                        <SetTable sets={rows} onChange={commit} weightUnit={weightUnit} disabled={isSaving} />
                    )}

                    <div className="workout-ex__field">
                        <label className="form-label" htmlFor={notesId}>Notes</label>
                        <input
                            id={notesId}
                            type="text"
                            className="form-control"
                            placeholder="Optional"
                            defaultValue={exercise.notes ?? ''}
                            onBlur={event => {
                                if ((exercise.notes ?? '') !== event.target.value) {
                                    onUpdate(exercise.id!, { notes: event.target.value });
                                }
                            }}
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
                title={`Remove ${exercise.exercise_name}?`}
                description="This changes the template only. Workouts already logged keep their own record."
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
    weightUnit: WeightUnit;
    onAdd: (input: {
        exercise_id?: string | null;
        exercise_name: string;
        activity_type: ActivityType;
        day_of_week: number;
        position?: number;
    }) => Promise<unknown>;
    onUpdate: (id: string, updates: Partial<WorkoutTemplateExercise>) => void;
    onDelete: (id: string) => void;
    isSaving?: boolean;
}

/**
 * The exercise list for one weekday, plus the form that adds to it.
 *
 * Adding is name-only on purpose. An exercise that exists with no sets yet is a
 * normal thing to want -- jotting down what you will do is the common case --
 * and demanding numbers before the row exists makes that slower than writing it
 * on paper.
 */
const ExerciseEditor: React.FC<ExerciseEditorProps> = ({
    exercises,
    dayOfWeek,
    weightUnit,
    onAdd,
    onUpdate,
    onDelete,
    isSaving,
}) => {
    const [name, setName] = useState('');
    const [type, setType] = useState<ActivityType>('strength');
    const [exerciseId, setExerciseId] = useState<string | null>(null);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        await onAdd({
            exercise_id: exerciseId,
            exercise_name: trimmed,
            activity_type: type,
            day_of_week: dayOfWeek,
            position: exercises.length,
        });
        setName('');
        setExerciseId(null);
        setType('strength');
    };

    return (
        <>
            {exercises.length === 0 ? (
                <div className="workout-ex__empty">
                    Nothing on this day yet. Add the first exercise below.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {exercises.map(exercise => (
                        <ExerciseRow
                            key={exercise.id}
                            exercise={exercise}
                            weightUnit={weightUnit}
                            onUpdate={onUpdate}
                            onDelete={onDelete}
                            isSaving={isSaving}
                        />
                    ))}
                </div>
            )}

            <form
                onSubmit={submit}
                style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: '0.75rem' }}
            >
                <ExerciseNameInput
                    value={name}
                    onChange={setName}
                    onPick={picked => {
                        setExerciseId(picked.exercise_id ?? null);
                        setType(picked.activity_type);
                    }}
                    onActivityTypeChange={setType}
                    activityType={type}
                    className="form-control"
                    placeholder="Add an exercise"
                />
                <button
                    type="submit"
                    className="btn-action btn-action--primary"
                    disabled={isSaving || !name.trim()}
                >
                    Add
                </button>
            </form>
        </>
    );
};

export default ExerciseEditor;