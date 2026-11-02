import React, { useState } from 'react';
import { Dumbbell, HeartPulse, Pencil, PersonStanding, Plus, Trash2 } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import {
    useDeleteCustomExercise,
    useExerciseLibrary,
    useCreateCustomExercise,
    useUpdateCustomExercise,
} from '../../hooks/useWorkouts';
import type { LibraryExercise } from '../../services/workoutService';
import type { ActivityType } from '../../utils/workoutSets';
import { ACTIVITY_LABELS } from '../../utils/workoutSets';

const EQUIPMENT = ['Barbell', 'Dumbbell', 'Kettlebell', 'Machine', 'Cable', 'Smith Machine', 'Bodyweight', 'Bike', 'Treadmill', 'Rower', 'Resistance Band', 'Medicine Ball', 'Stability Ball', 'Trap Bar', 'EZ Bar', 'Other'];
const WEIGHTS = [
    { value: 'total', label: 'Total Weight' },
    { value: 'per_hand', label: 'Per Hand' },
    { value: 'per_side', label: 'Per Side' },
] as const;
const TYPE_ORDER: ActivityType[] = ['strength', 'cardio', 'mobility'];
const TYPE_ICONS = {
    strength: Dumbbell,
    cardio: HeartPulse,
    mobility: PersonStanding,
};

const ExerciseLibraryPanel: React.FC = () => {
    const { data: exercises = [], isLoading } = useExerciseLibrary();
    const update = useUpdateCustomExercise();
    const create = useCreateCustomExercise();
    const remove = useDeleteCustomExercise();
    const [editing, setEditing] = useState<LibraryExercise | null>(null);
    const [creating, setCreating] = useState(false);
    const [removing, setRemoving] = useState<LibraryExercise | null>(null);
    const [name, setName] = useState('');
    const [type, setType] = useState<ActivityType>('strength');
    const [equipment, setEquipment] = useState('');
    const [weightConvention, setWeightConvention] = useState<'total' | 'per_hand' | 'per_side'>('total');
    const [bodyPart, setBodyPart] = useState('');

    const openEdit = (exercise: LibraryExercise) => {
        setEditing(exercise);
        setName(exercise.name);
        setType(exercise.activity_type);
        setEquipment(exercise.equipment ?? '');
        setWeightConvention(exercise.weight_convention ?? 'total');
        setBodyPart(exercise.body_part ?? '');
    };

    const openCreate = () => {
        setCreating(true);
        setEditing(null);
        setName('');
        setType('strength');
        setEquipment('');
        setWeightConvention('total');
        setBodyPart('');
    };

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        if (creating) {
            await create.mutateAsync({ name, activity_type: type, equipment: equipment || null, weight_convention: weightConvention, body_part: bodyPart });
        } else if (editing?.id) {
            await update.mutateAsync({ id: editing.id, name, activity_type: type, equipment: equipment || null, weight_convention: weightConvention, body_part: bodyPart });
        } else return;
        setEditing(null);
        setCreating(false);
    };

    return (
        <>
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">My Exercises</h3>
                    <span className="semester-meta" style={{ marginLeft: 'auto' }}>{exercises.length} exercise{exercises.length === 1 ? '' : 's'}</span>
                    <button type="button" className="btn-action" aria-label="Add exercise" onClick={openCreate}><Plus size={13} /></button>
                </div>
                <div className="card-body">
                    {isLoading ? <p className="form-label">Loading…</p> : exercises.length === 0 ? (
                        <div className="workout-empty">
                            <p className="workout-empty__title">No exercises created yet</p>
                            <p className="workout-empty__text">Create one from any exercise picker while logging a workout or editing a template.</p>
                        </div>
                    ) : (
                        <div className="exercise-library-groups">
                            {TYPE_ORDER.map(activityType => {
                                const grouped = exercises.filter(exercise => exercise.activity_type === activityType);
                                if (grouped.length === 0) return null;
                                const Icon = TYPE_ICONS[activityType];
                                return (
                                    <section className={`exercise-library-group exercise-library-group--${activityType}`} key={activityType}>
                                        <h4 className="exercise-library-group__title">
                                            <Icon size={14} /> {ACTIVITY_LABELS[activityType]}
                                            <span>{grouped.length}</span>
                                        </h4>
                                        <div className="exercise-library-grid">
                                            {grouped.map(exercise => (
                                                <div className="workout-row" key={exercise.id}>
                                                    <span className="workout-row__name">
                                                        {exercise.name}
                                                        <span className="semester-meta">{[exercise.equipment, exercise.body_part].filter(Boolean).join(' · ') || 'No details'}</span>
                                                    </span>
                                                    <span className="workout-row__value">
                                                        <button type="button" className="btn-action" aria-label={`Edit ${exercise.name}`} onClick={() => openEdit(exercise)}><Pencil size={12} /></button>
                                                        <button type="button" className="btn-action" aria-label={`Remove ${exercise.name}`} onClick={() => setRemoving(exercise)}><Trash2 size={12} /></button>
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {(editing || creating) && (
                <div className="import-modal-overlay" onMouseDown={event => {
                    if (event.target === event.currentTarget && !update.isPending && !create.isPending) { setEditing(null); setCreating(false); }
                }}>
                    <form className="import-modal-card" onSubmit={save}>
                        <h3>{creating ? 'Add Exercise' : 'Edit Exercise'}</h3>
                        <label className="form-label" htmlFor="edit-exercise-name">Name</label>
                        <input id="edit-exercise-name" className="form-control" value={name} onChange={event => setName(event.target.value)} />
                        <label className="form-label" htmlFor="edit-exercise-type">Type</label>
                        <select id="edit-exercise-type" className="form-control" value={type} onChange={event => setType(event.target.value as ActivityType)}>
                            <option value="strength">Strength</option><option value="cardio">Cardio</option><option value="mobility">Mobility</option>
                        </select>
                        <label className="form-label" htmlFor="edit-exercise-equipment">Equipment</label>
                        <select id="edit-exercise-equipment" className="form-control" value={equipment} onChange={event => setEquipment(event.target.value)}>
                            <option value="">None / Not Specified</option>{EQUIPMENT.map(item => <option key={item}>{item}</option>)}
                        </select>
                        <label className="form-label" htmlFor="edit-exercise-weight">Weight Convention</label>
                        <select id="edit-exercise-weight" className="form-control" value={weightConvention} onChange={event => setWeightConvention(event.target.value as typeof weightConvention)}>
                            {WEIGHTS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                        <label className="form-label" htmlFor="edit-exercise-body-part">Muscle Group / Body Part</label>
                        <input id="edit-exercise-body-part" className="form-control" value={bodyPart} onChange={event => setBodyPart(event.target.value)} />
                        <div className="exercise-create-actions">
                            <button type="button" className="btn-form-cancel" onClick={() => { setEditing(null); setCreating(false); }}>Cancel</button>
                            <button type="submit" className="btn-form-submit" disabled={update.isPending || create.isPending}>{create.isPending || update.isPending ? 'Saving…' : creating ? 'Add Exercise' : 'Save Exercise'}</button>
                        </div>
                    </form>
                </div>
            )}
            <ConfirmModal
                open={Boolean(removing)}
                title="Remove exercise?"
                description={removing ? `Remove ${removing.name} from your exercise library? Existing workout logs are kept.` : undefined}
                confirmLabel="Remove"
                danger
                busy={remove.isPending}
                onCancel={() => setRemoving(null)}
                onConfirm={() => {
                    if (!removing?.id) return;
                    remove.mutate(removing.id, { onSuccess: () => setRemoving(null) });
                }}
            />
        </>
    );
};

export default ExerciseLibraryPanel;
