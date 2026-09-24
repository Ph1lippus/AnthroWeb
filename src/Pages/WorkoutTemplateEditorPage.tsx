import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Title from '../Components/Title';
import WorkoutsNav from '../Components/Workout/WorkoutsNav';
import ExerciseEditor from '../Components/Workout/ExerciseEditor';
import {
    useWorkoutTemplate,
    useUpdateWorkoutTemplate,
    useAddWorkoutTemplateDay,
    useUpdateWorkoutTemplateDay,
    useDeleteWorkoutTemplateDay,
    useSetActiveTemplate,
} from '../hooks/useWorkouts';
import { useUserSettings } from '../hooks/useUserSettings';
import type { WorkoutTemplateDay } from '../services/workoutService';
import { Check, Save } from 'lucide-react';

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const WorkoutTemplateEditorPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const weightUnit = useUserSettings().settings?.weight_unit ?? 'kg';

    const { data, isLoading } = useWorkoutTemplate(id);
    const updateTemplate = useUpdateWorkoutTemplate();
    const addExercise = useAddWorkoutTemplateDay(id ?? '');
    const updateExercise = useUpdateWorkoutTemplateDay(id ?? '');
    const deleteExercise = useDeleteWorkoutTemplateDay(id ?? '');
    const setActive = useSetActiveTemplate();

    const [selectedDay, setSelectedDay] = useState<number>(0);
    const [templateName, setTemplateName] = useState('');
    const [templateDescription, setTemplateDescription] = useState('');

    const template = data?.template;
    const templateExercises = data?.days ?? [];

    useEffect(() => {
        // Populating the name/description fields from the fetched template is an
        // external-system sync (server data -> local state).
        /* eslint-disable react-hooks/set-state-in-effect */
        if (template) {
            setTemplateName(template.name);
            setTemplateDescription(template.description ?? '');
        }
        /* eslint-enable react-hooks/set-state-in-effect */
    }, [template]);

    if (isLoading) {
        return (
            <>
                <Title title="Edit Template" />
                <div className="books-page-wrapper">
                    <div className="dashboard-section workout-section">
                        <div className="workout-card">
                            <div className="profile-loading">
                                <div className="profile-loading-spinner"></div>
                                <p>Loading template...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    if (!template) {
        return (
            <>
                <Title title="Edit Template" />
                <div className="books-page-wrapper">
                    <div className="dashboard-section workout-section">
                        <div className="workout-card">
                            <WorkoutsNav />
                            <p>Template not found.</p>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    const getExercisesForDay = (day: number) => templateExercises.filter(ex => ex.day_of_week === day);
    const getExerciseCountForDay = (day: number) => getExercisesForDay(day).length;

    const handleUpdateTemplate = async () => {
        if (!template?.id) return;
        await updateTemplate.mutateAsync({
            id: template.id,
            updates: { name: templateName, description: templateDescription || undefined },
        });
    };

    const handleAddExercise = async (exercise: Omit<WorkoutTemplateDay, 'id' | 'created_at'>) => {
        if (!template?.id) return;
        await addExercise.mutateAsync({ ...exercise, day_of_week: selectedDay });
    };

    return (
        <>
            <Title title="Edit Template" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card">
                        <WorkoutsNav />

                        <div className="dashboard-section__head">
                            <h2>Edit Template</h2>
                            <span>Configure your weekly routine — past workouts are never changed.</span>
                        </div>

                        <div className="workout-template-editor__actions flex gap-2 mb-4">
                            {!template.is_active && (
                                <button
                                    className="btn-action"
                                    onClick={() => template.id && setActive.mutate(template.id)}
                                    disabled={setActive.isPending}
                                >
                                    <Check className="mr-1" />Set as Active
                                </button>
                            )}
                            {template.is_active && (
                                <span className="workout-template-item__active-label">
                                    <Check className="mr-1" />Active Template
                                </span>
                            )}
                        </div>

                        {/* Template Info */}
                        <div className="exercise-editor" style={{ marginBottom: '2rem' }}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className="exercise-editor__label">Template Name</label>
                                <input
                                    type="text"
                                    className="exercise-editor__input"
                                    value={templateName}
                                    onChange={(e) => setTemplateName(e.target.value)}
                                    placeholder="Template name"
                                />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label className="exercise-editor__label">Description</label>
                                <textarea
                                    className="exercise-editor__input"
                                    value={templateDescription}
                                    onChange={(e) => setTemplateDescription(e.target.value)}
                                    placeholder="Template description"
                                    rows={2}
                                />
                            </div>
                            <button className="btn-primary" onClick={handleUpdateTemplate} disabled={updateTemplate.isPending}>
                                <Save className="mr-1" />{updateTemplate.isPending ? 'Saving...' : 'Save Template'}
                            </button>
                        </div>

                        {/* Day Selector */}
                        <div style={{ marginBottom: '2rem' }}>
                            <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Select Day</h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {dayNames.map((day, index) => (
                                    <button
                                        key={day}
                                        className={`workout-template-card__day ${selectedDay === index ? 'active' : ''}`}
                                        onClick={() => setSelectedDay(index)}
                                        style={{
                                            background: selectedDay === index
                                                ? 'rgba(0, 255, 166, 0.2)'
                                                : 'rgba(255, 255, 255, 0.1)',
                                            border: selectedDay === index
                                                ? '1px solid var(--color-primary)'
                                                : '1px solid rgba(255, 255, 255, 0.2)',
                                            color: selectedDay === index
                                                ? 'var(--color-primary)'
                                                : 'var(--color-light)',
                                            padding: '0.5rem 1rem',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            fontSize: '0.875rem'
                                        }}
                                    >
                                        {day} ({getExerciseCountForDay(index)})
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Exercise Editor for Selected Day */}
                        <div>
                            <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>
                                Exercises for {dayNames[selectedDay]}
                            </h3>
                            <ExerciseEditor
                                exercises={getExercisesForDay(selectedDay)}
                                weightUnit={weightUnit}
                                onAddExercise={handleAddExercise}
                                onUpdateExercise={(id, updates) => updateExercise.mutateAsync({ id, updates })}
                                onDeleteExercise={deleteExercise.mutateAsync}
                            />
                        </div>

                        {/* Template Overview */}
                        <div style={{ marginTop: '2rem' }}>
                            <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Template Overview</h3>
                            <div className="exercise-editor__list">
                                {dayNames.map((day, index) => {
                                    const dayExercises = getExercisesForDay(index);
                                    if (dayExercises.length === 0) return null;
                                    return (
                                        <div key={day} className="exercise-editor__item">
                                            <div className="exercise-editor__item-info">
                                                <div className="exercise-editor__item-name">{day}</div>
                                                <div className="exercise-editor__item-details">
                                                    {dayExercises.map(ex => ex.exercise_name).join(', ')}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                                                {dayExercises.length} exercise{dayExercises.length !== 1 ? 's' : ''}
                                            </div>
                                        </div>
                                    );
                                })}
                                {templateExercises.length === 0 && (
                                    <p style={{ textAlign: 'center', opacity: 0.7, padding: '2rem' }}>
                                        No exercises added to this template yet.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default WorkoutTemplateEditorPage;