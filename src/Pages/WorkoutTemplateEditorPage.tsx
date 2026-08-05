import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import ExerciseEditor from '../Components/Workout/ExerciseEditor';
import {
    getWorkoutTemplate,
    getWorkoutTemplateDays,
    updateWorkoutTemplate,
    createWorkoutTemplateDay,
    updateWorkoutTemplateDay,
    deleteWorkoutTemplateDay,
    type WorkoutTemplate,
    type WorkoutTemplateDay
} from '../services/workoutService';

const WorkoutTemplateEditorPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
    const [exercises, setExercises] = useState<WorkoutTemplateDay[]>([]);
    const [selectedDay, setSelectedDay] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [templateDescription, setTemplateDescription] = useState('');

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    useEffect(() => {
        if (!id) {
            navigate('/Workouts/Templates');
            return;
        }
        loadTemplate();
    }, [id]);

    useEffect(() => {
        if (template) {
            setTemplateName(template.name);
            setTemplateDescription(template.description || '');
        }
    }, [template]);

    const loadTemplate = async () => {
        try {
            setLoading(true);
            const templateData = await getWorkoutTemplate(id!);
            if (!templateData) {
                alert('Template not found');
                navigate('/Workouts/Templates');
                return;
            }
            setTemplate(templateData);
            await loadExercises(id!);
        } catch (error) {
            console.error('Error loading template:', error);
            alert('Failed to load template');
        } finally {
            setLoading(false);
        }
    };

    const loadExercises = async (templateId: string) => {
        const allExercises = await getWorkoutTemplateDays(templateId);
        setExercises(allExercises);
    };

    const handleUpdateTemplate = async () => {
        if (!template) return;
        
        try {
            setSaving(true);
            await updateWorkoutTemplate(template.id!, {
                name: templateName,
                description: templateDescription || undefined
            });
            alert('Template updated successfully');
        } catch (error) {
            console.error('Error updating template:', error);
            alert('Failed to update template');
        } finally {
            setSaving(false);
        }
    };

    const handleAddExercise = async (exercise: Omit<WorkoutTemplateDay, 'id' | 'created_at'>) => {
        if (!template || !template.id) return;

        try {
            const newExercise = await createWorkoutTemplateDay({
                ...exercise,
                workout_template_id: template.id,
                user_id: template.user_id,
                day_of_week: selectedDay
            });
            setExercises([...exercises, newExercise]);
        } catch (error) {
            console.error('Error adding exercise:', error);
            alert('Failed to add exercise');
        }
    };

    const handleUpdateExercise = async (exerciseId: string, updates: Partial<WorkoutTemplateDay>) => {
        try {
            await updateWorkoutTemplateDay(exerciseId, updates);
            setExercises(exercises.map(ex => 
                ex.id === exerciseId ? { ...ex, ...updates } : ex
            ));
        } catch (error) {
            console.error('Error updating exercise:', error);
            alert('Failed to update exercise');
        }
    };

    const handleDeleteExercise = async (exerciseId: string) => {
        try {
            await deleteWorkoutTemplateDay(exerciseId);
            setExercises(exercises.filter(ex => ex.id !== exerciseId));
        } catch (error) {
            console.error('Error deleting exercise:', error);
            alert('Failed to delete exercise');
        }
    };

    const getExercisesForDay = (day: number) => {
        return exercises.filter(ex => ex.day_of_week === day);
    };

    const getExerciseCountForDay = (day: number) => {
        return getExercisesForDay(day).length;
    };

    if (loading) {
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

    return (
        <>
            <Title title="Edit Template" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card">
                        {/* Top Bar */}
                        <div className="workout-top-bar">
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => navigate('/Workouts')} className="btn-action">
                                    <i className="fa-solid fa-dumbbell mr-1"></i>Dashboard
                                </button>
                                <button onClick={() => navigate('/Workouts/Templates')} className="btn-action">
                                    <i className="fa-solid fa-layer-group mr-1"></i>Templates
                                </button>
                                <button onClick={() => navigate('/Workouts/Check')} className="btn-action">
                                    <i className="fa-solid fa-clipboard-check mr-1"></i>Log Workout
                                </button>
                            </div>
                        </div>

                        <div className="dashboard-section__head">
                            <h2>Edit Template</h2>
                            <span>Configure your workout routine</span>
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
                        <button
                            className="btn-primary"
                            onClick={handleUpdateTemplate}
                            disabled={saving}
                        >
                            {saving ? 'Saving...' : 'Save Template'}
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
                            onAddExercise={handleAddExercise}
                            onUpdateExercise={handleUpdateExercise}
                            onDeleteExercise={handleDeleteExercise}
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
                            {exercises.length === 0 && (
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
