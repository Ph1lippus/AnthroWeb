import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import {
    getTodayWorkoutExercises,
    getWorkoutCompletionLog,
    createWorkoutCompletionLog,
    updateWorkoutCompletionLog,
    createWorkoutExerciseLog,
    updateWorkoutExerciseLog,
    deleteWorkoutExerciseLog,
    getWorkoutExerciseLogs,
    getPRHistory,
    createPR,
    type WorkoutTemplateDay,
    type PRHistory,
} from '../services/workoutService';

interface ExerciseLog {
    templateDay: WorkoutTemplateDay;
    logId?: string;
    sets: string;
    reps: string;
    weight: string;
    completed: boolean;
}

const WorkoutCheckPage: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [exercises, setExercises] = useState<ExerciseLog[]>([]);
    const [completionLog, setCompletionLog] = useState<any>(null);
    const [intensity, setIntensity] = useState<number>(5);
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [showPRModal, setShowPRModal] = useState(false);
    const [selectedPR, setSelectedPR] = useState<PRHistory | null>(null);

    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const today = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[today.getDay()];
    const todayDate = today.toISOString().split('T')[0];

    // Load today's workout
    useEffect(() => {
        const loadWorkout = async () => {
            setLoading(true);
            
            // Get today's exercises from template
            const templateExercises = await getTodayWorkoutExercises();
            
            // Get existing completion log
            const existingLog = await getWorkoutCompletionLog(todayDate);
            setCompletionLog(existingLog);
            
            if (existingLog) {
                setIntensity(existingLog.intensity || 5);
                setNotes(existingLog.notes || '');
                
                // Get existing exercise logs
                const exerciseLogs = await getWorkoutExerciseLogs(existingLog.id!);
                
                // Map template exercises with existing logs
                const mappedExercises: ExerciseLog[] = templateExercises.map(template => {
                    const existingLogEntry = exerciseLogs.find(log => log.exercise_name === template.exercise_name);
                    return {
                        templateDay: template,
                        logId: existingLogEntry?.id,
                        sets: existingLogEntry?.sets?.toString() || template.target_sets?.toString() || '',
                        reps: existingLogEntry?.reps?.toString() || template.target_reps?.toString() || '',
                        weight: existingLogEntry?.weight?.toString() || template.target_weight?.toString() || '',
                        completed: !!existingLogEntry,
                    };
                });
                
                setExercises(mappedExercises);
            } else {
                // No existing log, create from template
                const mappedExercises: ExerciseLog[] = templateExercises.map(template => ({
                    templateDay: template,
                    sets: template.target_sets?.toString() || '',
                    reps: template.target_reps?.toString() || '',
                    weight: template.target_weight?.toString() || '',
                    completed: false,
                }));
                setExercises(mappedExercises);
            }
            
            setLoading(false);
        };
        
        loadWorkout();
    }, [todayDate]);

    // Auto-save function
    const performSave = async () => {
        if (saving) return;
        
        setSaving(true);
        try {
            // Create or update completion log
            let logId = completionLog?.id;
            
            if (!logId) {
                const newLog = await createWorkoutCompletionLog({
                    workout_date: todayDate,
                    completed: false,
                    intensity,
                    notes: notes || undefined,
                });
                logId = newLog.id;
                setCompletionLog(newLog);
            } else {
                await updateWorkoutCompletionLog(logId, {
                    intensity,
                    notes: notes || undefined,
                });
            }
            
            // Save each exercise
            for (const exercise of exercises) {
                if (exercise.completed && exercise.sets && exercise.reps) {
                    if (exercise.logId) {
                        await updateWorkoutExerciseLog(exercise.logId, {
                            sets: parseInt(exercise.sets),
                            reps: parseInt(exercise.reps),
                            weight: exercise.weight ? parseFloat(exercise.weight) : undefined,
                        });
                    } else {
                        const newExerciseLog = await createWorkoutExerciseLog({
                            workout_completion_id: logId!,
                            exercise_name: exercise.templateDay.exercise_name,
                            sets: parseInt(exercise.sets),
                            reps: parseInt(exercise.reps),
                            weight: exercise.weight ? parseFloat(exercise.weight) : undefined,
                        });
                        exercise.logId = newExerciseLog.id;
                    }
                } else if (!exercise.completed && exercise.logId) {
                    await deleteWorkoutExerciseLog(exercise.logId);
                    exercise.logId = undefined;
                }
            }
            
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            console.error('Auto-save error:', err);
        } finally {
            setSaving(false);
        }
    };

    // Debounced auto-save
    useEffect(() => {
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        autoSaveTimerRef.current = setTimeout(() => {
            performSave();
        }, 2000);

        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, [exercises, intensity, notes]);

    const handleExerciseChange = (index: number, field: 'sets' | 'reps' | 'weight', value: string) => {
        const updated = [...exercises];
        updated[index][field] = value;
        setExercises(updated);
    };

    const handleToggleComplete = async (index: number) => {
        const updated = [...exercises];
        updated[index].completed = !updated[index].completed;
        setExercises(updated);
    };

    const handleCompleteWorkout = async () => {
        if (!completionLog?.id) {
            await performSave();
        }
        
        const logId = completionLog?.id;
        if (logId) {
            await updateWorkoutCompletionLog(logId, { completed: true });
            
            // Check for PRs
            for (const exercise of exercises) {
                if (exercise.completed && exercise.weight && exercise.reps) {
                    const weight = parseFloat(exercise.weight);
                    const reps = parseInt(exercise.reps);
                    
                    // Get existing PRs for this exercise
                    const existingPRs = await getPRHistory(exercise.templateDay.exercise_name);
                    
                    // Check if this is a new PR (higher weight with same or more reps, or same weight with more reps)
                    const isPR = existingPRs.every(pr => 
                        !pr.weight || !pr.reps || 
                        (weight > (pr.weight || 0) && reps >= (pr.reps || 0)) ||
                        (weight >= (pr.weight || 0) && reps > (pr.reps || 0))
                    );
                    
                    if (isPR && existingPRs.length === 0) {
                        // First entry for this exercise - save as PR
                        await createPR({
                            exercise_name: exercise.templateDay.exercise_name,
                            weight,
                            reps,
                            workout_date: todayDate,
                            workout_completion_id: logId,
                        });
                    } else if (isPR) {
                        // New PR - show modal
                        setSelectedPR({
                            exercise_name: exercise.templateDay.exercise_name,
                            weight,
                            reps,
                            workout_date: todayDate,
                            workout_completion_id: logId,
                            user_id: '', // Will be set by service
                        });
                        setShowPRModal(true);
                    }
                }
            }
            
            setCompletionLog({ ...completionLog, completed: true });
        }
    };

    const handleSavePR = async () => {
        if (selectedPR) {
            await createPR(selectedPR);
            setShowPRModal(false);
            setSelectedPR(null);
        }
    };

    const handleSkipPR = () => {
        setShowPRModal(false);
        setSelectedPR(null);
    };

    const completedCount = exercises.filter(e => e.completed).length;
    const totalCount = exercises.length;
    const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    if (loading) {
        return (
            <>
                <Title title="Log Workout" />
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

    if (exercises.length === 0) {
        return (
            <>
                <Title title="Log Workout" />
                <div className="books-page-wrapper">
                    <div className="dashboard-section workout-section">
                        <div className="workout-card">
                            <div className="dashboard-section__head">
                                <h2>Workout Check</h2>
                                <span>Log your daily workout progress</span>
                            </div>
                            <div className="workout-empty-state">
                                <div className="workout-empty-state__icon">
                                    <i className="fa-solid fa-dumbbell"></i>
                                </div>
                                <h3 className="workout-empty-state__title">No workout scheduled for {todayName}</h3>
                                <p className="workout-empty-state__description">
                                    You haven't set up any exercises for {todayName}. Go to the Workouts page to create a workout template.
                                </p>
                                <button onClick={() => navigate('/Workouts/Templates')} className="btn-primary">
                                    <i className="fa-solid fa-plus mr-1"></i>Setup Workout
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Title title="Log Workout" />
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
                                <button onClick={() => navigate('/Workouts/PRs')} className="btn-action">
                                    <i className="fa-solid fa-trophy mr-1"></i>PRs
                                </button>
                            </div>
                            <div className="workout-check-status">
                                {saving ? (
                                    <span className="workout-check-status__saving">
                                        <i className="fa-solid fa-circle-notch fa-spin mr-1"></i>Saving...
                                    </span>
                                ) : saved ? (
                                    <span className="workout-check-status__saved">
                                        <i className="fa-solid fa-check mr-1"></i>Saved
                                    </span>
                                ) : (
                                    <span className="workout-check-status__auto">Auto-saves</span>
                                )}
                            </div>
                        </div>

                        {/* Workout Info */}
                        <div className="workout-check-info">
                            <div className="workout-check-info__date">
                                <i className="fa-regular fa-calendar mr-1"></i>
                                {todayName}, {today.toLocaleDateString()}
                            </div>
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
                                            {exercise.templateDay.target_sets && exercise.templateDay.target_reps && (
                                                <span className="workout-check-exercise__target">
                                                    Target: {exercise.templateDay.target_sets}×{exercise.templateDay.target_reps}
                                                    {exercise.templateDay.target_weight && ` @ ${exercise.templateDay.target_weight}kg`}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleToggleComplete(index)}
                                            className="workout-check-exercise__toggle"
                                        >
                                            <i className={`fa-solid ${exercise.completed ? 'fa-check-circle' : 'fa-circle'}`}></i>
                                        </button>
                                    </div>

                                    {exercise.completed && (
                                        <div className="workout-check-exercise__inputs">
                                            <div className="workout-check-input-group">
                                                <label>Sets</label>
                                                <input
                                                    type="number"
                                                    value={exercise.sets}
                                                    onChange={(e) => handleExerciseChange(index, 'sets', e.target.value)}
                                                    placeholder="3"
                                                    className="workout-check-input"
                                                />
                                            </div>
                                            <div className="workout-check-input-group">
                                                <label>Reps</label>
                                                <input
                                                    type="number"
                                                    value={exercise.reps}
                                                    onChange={(e) => handleExerciseChange(index, 'reps', e.target.value)}
                                                    placeholder="10"
                                                    className="workout-check-input"
                                                />
                                            </div>
                                            <div className="workout-check-input-group">
                                                <label>Weight (kg)</label>
                                                <input
                                                    type="number"
                                                    value={exercise.weight}
                                                    onChange={(e) => handleExerciseChange(index, 'weight', e.target.value)}
                                                    placeholder="20"
                                                    className="workout-check-input"
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
                                <i className="fa-solid fa-note-sticky mr-1"></i>
                                Notes (optional)
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="workout-check-notes__textarea"
                                placeholder="How did the workout feel? Any observations?"
                                rows={3}
                            />
                        </div>

                        {/* Actions */}
                        <div className="workout-check-actions">
                            <button
                                onClick={handleCompleteWorkout}
                                disabled={completionLog?.completed || completedCount === 0}
                                className={`btn-action workout-check-complete-btn ${completionLog?.completed ? 'workout-check-complete-btn--completed' : ''}`}
                            >
                                {completionLog?.completed ? (
                                    <>
                                        <i className="fa-solid fa-check mr-1"></i>Workout Completed
                                    </>
                                ) : (
                                    <>
                                        <i className="fa-solid fa-flag-checkered mr-1"></i>Complete Workout
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* PR Modal */}
            {showPRModal && selectedPR && (
                <div className="modal-overlay" onClick={() => setShowPRModal(false)}>
                    <div className="modal-content pr-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3><i className="fa-solid fa-trophy mr-1"></i>New Personal Record!</h3>
                            <button onClick={() => setShowPRModal(false)} className="modal-close">
                                <i className="fa-solid fa-times"></i>
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="pr-celebration">
                                <i className="fa-solid fa-medal"></i>
                                <h4>Great job!</h4>
                                <p>You set a new PR for <strong>{selectedPR.exercise_name}</strong></p>
                                <div className="pr-stats">
                                    <div className="pr-stat">
                                        <span className="pr-label">Weight</span>
                                        <span className="pr-value">{selectedPR.weight}kg</span>
                                    </div>
                                    <div className="pr-stat">
                                        <span className="pr-label">Reps</span>
                                        <span className="pr-value">{selectedPR.reps}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button onClick={handleSkipPR} className="btn-secondary">
                                Skip
                            </button>
                            <button onClick={handleSavePR} className="btn-primary">
                                <i className="fa-solid fa-save mr-1"></i>Save PR
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default WorkoutCheckPage;
