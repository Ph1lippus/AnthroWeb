import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import { useWorkoutStore } from '../stores/useWorkoutStore';
import type { WorkoutTemplateDay, PRHistory } from '../services/workoutService';

interface ExerciseLog {
    templateDay: WorkoutTemplateDay;
    sets: string;
    reps: string;
    weight: string;
    completed: boolean;
}

const WorkoutStartPage: React.FC = () => {
    const { templateId } = useParams<{ templateId: string }>();
    const navigate = useNavigate();
    const { 
        currentTemplate, 
        templateExercises, 
        loading, 
        fetchTemplate, 
        fetchTemplateExercises,
        createCompletionLog,
        createExerciseLog,
        createPR,
        detectPR
    } = useWorkoutStore();
    
    const [exercises, setExercises] = useState<ExerciseLog[]>([]);
    const [intensity, setIntensity] = useState<number>(5);
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [showPRModal, setShowPRModal] = useState(false);
    const [selectedPR, setSelectedPR] = useState<PRHistory | null>(null);

    const today = new Date();
    const todayDate = today.toISOString().split('T')[0];

    useEffect(() => {
        if (!templateId) {
            navigate('/Workouts/Templates');
            return;
        }
        fetchTemplate(templateId);
        fetchTemplateExercises(templateId);
    }, [templateId, fetchTemplate, fetchTemplateExercises, navigate]);

    // Map template exercises to exercise logs
    useEffect(() => {
        const mappedExercises: ExerciseLog[] = templateExercises.map(template => ({
            templateDay: template,
            sets: template.target_sets?.toString() || '',
            reps: template.target_reps?.toString() || '',
            weight: template.target_weight?.toString() || '',
            completed: false,
        }));
        
        setExercises(mappedExercises);
    }, [templateExercises]);

    const handleExerciseChange = (index: number, field: 'sets' | 'reps' | 'weight', value: string) => {
        const updated = [...exercises];
        updated[index][field] = value;
        setExercises(updated);
    };

    const handleToggleComplete = (index: number) => {
        const updated = [...exercises];
        updated[index].completed = !updated[index].completed;
        setExercises(updated);
    };

    const handleCompleteWorkout = async () => {
        if (!currentTemplate || !templateId) return;
        
        try {
            setSaving(true);
            
            // Create completion log
            const completionLog = await createCompletionLog({
                workout_date: todayDate,
                workout_template_id: templateId,
                completed: true,
                intensity,
                notes: notes || undefined,
            });
            
            const logId: string | undefined = completionLog?.id;
            if (!logId) {
                throw new Error('Failed to create completion log');
            }
            
            // Save each exercise
            for (const exercise of exercises) {
                if (exercise.completed && exercise.sets && exercise.reps) {
                    await createExerciseLog({
                        workout_completion_id: logId,
                        exercise_name: exercise.templateDay.exercise_name,
                        sets: parseInt(exercise.sets),
                        reps: parseInt(exercise.reps),
                        weight: exercise.weight ? parseFloat(exercise.weight) : undefined,
                    });
                    
                    // Check for PRs
                    if (exercise.weight && exercise.reps) {
                        const weight = parseFloat(exercise.weight);
                        const reps = parseInt(exercise.reps);
                        
                        const isPR = await detectPR(exercise.templateDay.exercise_name, weight, reps);
                        
                        if (isPR) {
                            setSelectedPR({
                                exercise_name: exercise.templateDay.exercise_name,
                                weight,
                                reps,
                                workout_date: todayDate,
                                workout_completion_id: logId,
                            });
                            setShowPRModal(true);
                        }
                    }
                }
            }
            
            if (!showPRModal) {
                navigate('/Workouts/History');
            }
        } catch (error) {
            console.error('Error completing workout:', error);
            alert('Failed to complete workout. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleSavePR = async () => {
        if (selectedPR) {
            await createPR(selectedPR);
            setShowPRModal(false);
            setSelectedPR(null);
            navigate('/Workouts/History');
        }
    };

    const handleSkipPR = () => {
        setShowPRModal(false);
        setSelectedPR(null);
        navigate('/Workouts/History');
    };

    const completedCount = exercises.filter(e => e.completed).length;
    const totalCount = exercises.length;
    const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    if (loading) {
        return (
            <>
                <Title title="Start Workout" />
                <div className="books-page-wrapper">
                    <div className="dashboard-section workout-section">
                        <div className="workout-card">
                            <div className="profile-loading">
                                <div className="profile-loading-spinner"></div>
                                <p>Loading workout...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    if (!currentTemplate) {
        return (
            <>
                <Title title="Start Workout" />
                <div className="books-page-wrapper">
                    <div className="dashboard-section workout-section">
                        <div className="workout-card">
                            <p>Template not found</p>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Title title="Start Workout" />
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
                                <button onClick={() => navigate('/Workouts/History')} className="btn-action">
                                    <i className="fa-solid fa-clock-rotate-left mr-1"></i>History
                                </button>
                            </div>
                        </div>

                        {/* Template Info */}
                        <div className="dashboard-section__head">
                            <h2>{currentTemplate.name}</h2>
                            {currentTemplate.description && (
                                <span>{currentTemplate.description}</span>
                            )}
                        </div>

                        {/* Progress */}
                        <div className="workout-check-info">
                            <div className="workout-check-info__progress">
                                <div className="workout-check-progress-bar">
                                    <div 
                                        className="workout-check-progress-fill" 
                                        style={{ width: `${progress}%` }}
                                    ></div>
                                </div>
                                <span className="workout-check-progress-text">{completedCount}/{totalCount}</span>
                            </div>
                        </div>

                        {/* Intensity */}
                        <div className="workout-check-intensity">
                            <label className="workout-check-intensity__label">
                                <i className="fa-solid fa-fire mr-1"></i>
                                Intensity: <span className="workout-check-intensity__value">{intensity}/10</span>
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                value={intensity}
                                onChange={(e) => setIntensity(parseInt(e.target.value))}
                                className="workout-check-intensity__slider"
                            />
                        </div>

                        {/* Exercises */}
                        <div className="workout-check-exercises">
                            {exercises.map((exercise, index) => (
                                <div 
                                    key={index} 
                                    className={`workout-check-exercise ${exercise.completed ? 'workout-check-exercise--completed' : ''}`}
                                >
                                    <div className="workout-check-exercise__header">
                                        <div className="workout-check-exercise__info">
                                            <h4 className="workout-check-exercise__name">{exercise.templateDay.exercise_name}</h4>
                                            {exercise.templateDay.notes && (
                                                <p className="workout-check-exercise__notes">{exercise.templateDay.notes}</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleToggleComplete(index)}
                                            className={`workout-check-exercise__toggle ${exercise.completed ? 'workout-check-exercise__toggle--completed' : ''}`}
                                        >
                                            <i className={`fa-solid ${exercise.completed ? 'fa-check-circle' : 'fa-circle'}`}></i>
                                        </button>
                                    </div>
                                    
                                    {exercise.completed && (
                                        <div className="workout-check-exercise__inputs">
                                            <div className="workout-check-exercise__input-group">
                                                <label className="workout-check-exercise__label">Sets</label>
                                                <input
                                                    type="number"
                                                    className="workout-check-exercise__input"
                                                    value={exercise.sets}
                                                    onChange={(e) => handleExerciseChange(index, 'sets', e.target.value)}
                                                    placeholder={exercise.templateDay.target_sets?.toString()}
                                                />
                                            </div>
                                            <div className="workout-check-exercise__input-group">
                                                <label className="workout-check-exercise__label">Reps</label>
                                                <input
                                                    type="number"
                                                    className="workout-check-exercise__input"
                                                    value={exercise.reps}
                                                    onChange={(e) => handleExerciseChange(index, 'reps', e.target.value)}
                                                    placeholder={exercise.templateDay.target_reps?.toString()}
                                                />
                                            </div>
                                            <div className="workout-check-exercise__input-group">
                                                <label className="workout-check-exercise__label">Weight (lbs)</label>
                                                <input
                                                    type="number"
                                                    className="workout-check-exercise__input"
                                                    value={exercise.weight}
                                                    onChange={(e) => handleExerciseChange(index, 'weight', e.target.value)}
                                                    placeholder={exercise.templateDay.target_weight?.toString()}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Notes */}
                        <div className="workout-check-notes">
                            <label className="workout-check-notes__label">
                                <i className="fa-solid fa-sticky-note mr-1"></i>
                                Notes
                            </label>
                            <textarea
                                className="workout-check-notes__textarea"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="How did the workout feel?"
                                rows={3}
                            />
                        </div>

                        {/* Complete Button */}
                        <div className="workout-check-actions">
                            <button
                                onClick={handleCompleteWorkout}
                                className="btn-primary"
                                disabled={saving || completedCount === 0}
                            >
                                {saving ? 'Saving...' : 'Complete Workout'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* PR Modal */}
            {showPRModal && selectedPR && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal__header">
                            <h3>🏆 New Personal Record!</h3>
                        </div>
                        <div className="modal__body">
                            <p>
                                <strong>{selectedPR.exercise_name}</strong><br />
                                {selectedPR.weight} lbs × {selectedPR.reps} reps
                            </p>
                            <p>Do you want to save this to your PR history?</p>
                        </div>
                        <div className="modal__footer">
                            <button onClick={handleSkipPR} className="btn-secondary">
                                Skip
                            </button>
                            <button onClick={handleSavePR} className="btn-primary">
                                Save PR
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default WorkoutStartPage;