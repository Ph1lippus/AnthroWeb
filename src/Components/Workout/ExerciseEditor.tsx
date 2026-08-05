import React, { useState } from 'react';
import type { WorkoutTemplateDay } from '../../services/workoutService';

interface ExerciseEditorProps {
    exercises: WorkoutTemplateDay[];
    onAddExercise: (exercise: Omit<WorkoutTemplateDay, 'id' | 'created_at'>) => void;
    onUpdateExercise: (id: string, updates: Partial<WorkoutTemplateDay>) => void;
    onDeleteExercise: (id: string) => void;
}

const ExerciseEditor: React.FC<ExerciseEditorProps> = ({
    exercises,
    onAddExercise,
    onUpdateExercise,
    onDeleteExercise
}) => {
    const [newExercise, setNewExercise] = useState({
        exercise_name: '',
        target_sets: '',
        target_reps: '',
        target_weight: '',
        notes: ''
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newExercise.exercise_name.trim()) return;

        onAddExercise({
            workout_template_id: '',
            user_id: '',
            day_of_week: 0,
            exercise_name: newExercise.exercise_name,
            target_sets: newExercise.target_sets ? parseInt(newExercise.target_sets) : undefined,
            target_reps: newExercise.target_reps ? parseInt(newExercise.target_reps) : undefined,
            target_weight: newExercise.target_weight ? parseFloat(newExercise.target_weight) : undefined,
            notes: newExercise.notes || undefined
        });

        setNewExercise({
            exercise_name: '',
            target_sets: '',
            target_reps: '',
            target_weight: '',
            notes: ''
        });
    };

    const handleInputChange = (field: string, value: string) => {
        setNewExercise(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="exercise-editor">
            <form className="exercise-editor__form" onSubmit={handleSubmit}>
                <div>
                    <label className="exercise-editor__label">Exercise Name *</label>
                    <input
                        type="text"
                        className="exercise-editor__input"
                        placeholder="e.g., Bench Press"
                        value={newExercise.exercise_name}
                        onChange={(e) => handleInputChange('exercise_name', e.target.value)}
                        required
                    />
                </div>
                <div>
                    <label className="exercise-editor__label">Target Sets</label>
                    <input
                        type="number"
                        className="exercise-editor__input"
                        placeholder="e.g., 3"
                        value={newExercise.target_sets}
                        onChange={(e) => handleInputChange('target_sets', e.target.value)}
                        min="1"
                    />
                </div>
                <div>
                    <label className="exercise-editor__label">Target Reps</label>
                    <input
                        type="number"
                        className="exercise-editor__input"
                        placeholder="e.g., 10"
                        value={newExercise.target_reps}
                        onChange={(e) => handleInputChange('target_reps', e.target.value)}
                        min="1"
                    />
                </div>
                <div>
                    <label className="exercise-editor__label">Target Weight (kg)</label>
                    <input
                        type="number"
                        className="exercise-editor__input"
                        placeholder="e.g., 60"
                        value={newExercise.target_weight}
                        onChange={(e) => handleInputChange('target_weight', e.target.value)}
                        min="0"
                        step="0.5"
                    />
                </div>
                <div>
                    <label className="exercise-editor__label">Notes</label>
                    <input
                        type="text"
                        className="exercise-editor__input"
                        placeholder="Optional notes"
                        value={newExercise.notes}
                        onChange={(e) => handleInputChange('notes', e.target.value)}
                    />
                </div>
                <div>
                    <button type="submit" className="btn-primary" style={{ marginTop: '1.5rem' }}>
                        <i className="fa-solid fa-plus mr-1"></i> Add Exercise
                    </button>
                </div>
            </form>

            <div className="exercise-editor__list">
                {exercises.length === 0 ? (
                    <p style={{ textAlign: 'center', opacity: 0.7, padding: '2rem' }}>
                        No exercises added yet. Add your first exercise above.
                    </p>
                ) : (
                    exercises.map((exercise) => (
                        <div key={exercise.id} className="exercise-editor__item">
                            <div className="exercise-editor__item-info">
                                <div className="exercise-editor__item-name">{exercise.exercise_name}</div>
                                <div className="exercise-editor__item-details">
                                    {exercise.target_sets && `${exercise.target_sets} sets`}
                                    {exercise.target_sets && exercise.target_reps && ' • '}
                                    {exercise.target_reps && `${exercise.target_reps} reps`}
                                    {exercise.target_weight && ` • ${exercise.target_weight}kg`}
                                    {exercise.notes && ` • ${exercise.notes}`}
                                </div>
                            </div>
                            <div className="exercise-editor__item-actions">
                                <button
                                    className="exercise-editor__item-action"
                                    onClick={() => {
                                        const newNotes = prompt('Update notes:', exercise.notes || '');
                                        if (newNotes !== null) {
                                            onUpdateExercise(exercise.id!, { notes: newNotes || undefined });
                                        }
                                    }}
                                    title="Edit notes"
                                >
                                    <i className="fa-solid fa-pen"></i>
                                </button>
                                <button
                                    className="exercise-editor__item-action danger"
                                    onClick={() => {
                                        if (window.confirm(`Delete ${exercise.exercise_name}?`)) {
                                            onDeleteExercise(exercise.id!);
                                        }
                                    }}
                                    title="Delete exercise"
                                >
                                    <i className="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ExerciseEditor;
