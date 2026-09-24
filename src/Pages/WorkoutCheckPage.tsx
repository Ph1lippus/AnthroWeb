import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import WorkoutsNav from '../Components/Workout/WorkoutsNav';
import ExerciseNameInput from '../Components/Workout/ExerciseNameInput';
import {
    useActiveTemplate,
    useWorkoutPlan,
    useWorkoutLog,
    useWorkoutExercises,
    useSaveWorkoutSession,
    useCompleteWorkoutSession,
} from '../hooks/useWorkouts';
import { useUserSettings } from '../hooks/useUserSettings';
import { toKg, fromKg } from '../utils/units';
import type { PRHistory } from '../services/workoutService';
import {
    Dumbbell, Calendar, Flame, CircleCheck, Circle, StickyNote, Flag,
    Check, Loader2, Timer, Trash2, Trophy, X, Save, Medal,
} from 'lucide-react';

interface SessionExercise {
    key: string;
    exercise_name: string;
    sets: string;
    reps: string;
    weight: string;
    done: boolean;
    logId?: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const WorkoutCheckPage: React.FC = () => {
    const navigate = useNavigate();
    const weightUnit = useUserSettings().settings?.weight_unit ?? 'kg';

    const todayDate = new Date().toISOString().split('T')[0];
    const todayDay = new Date().getDay();
    const todayName = DAY_NAMES[todayDay];

    const { activeTemplate } = useActiveTemplate();
    const { data: plan = [] } = useWorkoutPlan(todayDay, !!activeTemplate);
    const { data: log } = useWorkoutLog(todayDate);
    const { data: loggedExercises = [] } = useWorkoutExercises(log?.id);

    const saveSession = useSaveWorkoutSession();
    const [prQueue, setPrQueue] = useState<PRHistory[]>([]);
    const completeSession = useCompleteWorkoutSession((pr) => {
        setPrQueue(prev => [...prev, pr]);
    });

    const [exercises, setExercises] = useState<SessionExercise[]>([]);
    const [intensity, setIntensity] = useState(5);
    const [duration, setDuration] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<Date | null>(null);
    const [newExerciseName, setNewExerciseName] = useState('');
    const [showPRModal, setShowPRModal] = useState(false);
    const initializedRef = useRef(false);

    // Build/refresh the session from server data once.
    useEffect(() => {
        if (initializedRef.current) return;

        const hasLoaded = log !== undefined;
        const hasExercises = loggedExercises !== null; // array
        if (!hasLoaded || !hasExercises) return;

        initializedRef.current = true;

        // Populating the session editor from server data is an external-system
        // sync (server -> local state), which is what effects are for.
        /* eslint-disable react-hooks/set-state-in-effect */
        if (log?.id) {
            setIntensity(log.intensity ?? 5);
            setDuration(log.duration_minutes?.toString() ?? '');
            setNotes(log.notes ?? '');
            const merged = new Map<string, SessionExercise>();

            for (const ex of loggedExercises) {
                merged.set(ex.exercise_name, {
                    key: ex.exercise_name,
                    exercise_name: ex.exercise_name,
                    sets: ex.sets?.toString() ?? '',
                    reps: ex.reps?.toString() ?? '',
                    weight: ex.weight != null ? fromKg(ex.weight, weightUnit).toString() : '',
                    done: true,
                    logId: ex.id,
                });
            }
            // Include planned exercises that weren't logged yet (incomplete).
            for (const p of plan) {
                if (!merged.has(p.exercise_name)) {
                    merged.set(p.exercise_name, {
                        key: p.exercise_name,
                        exercise_name: p.exercise_name,
                        sets: p.target_sets?.toString() ?? '',
                        reps: p.target_reps?.toString() ?? '',
                        weight: p.target_weight != null ? fromKg(p.target_weight, weightUnit).toString() : '',
                        done: false,
                    });
                }
            }
            setExercises([...merged.values()]);
        } else {
            // Fresh session: preload the plan.
            setExercises(plan.map(p => ({
                key: p.exercise_name,
                exercise_name: p.exercise_name,
                sets: p.target_sets?.toString() ?? '',
                reps: p.target_reps?.toString() ?? '',
                weight: p.target_weight != null ? fromKg(p.target_weight, weightUnit).toString() : '',
                done: false,
            })));
        }
        /* eslint-enable react-hooks/set-state-in-effect */
    }, [log, loggedExercises, plan, weightUnit]);

    const setExercise = (key: string, patch: Partial<SessionExercise>) => {
        setExercises(prev => prev.map(e => (e.key === key ? { ...e, ...patch } : e)));
    };

    const addExercise = () => {
        const name = newExerciseName.trim();
        if (!name) return;
        setExercises(prev => [...prev, {
            key: `${name}-${Date.now()}`,
            exercise_name: name,
            sets: '',
            reps: '',
            weight: '',
            done: false,
        }]);
        setNewExerciseName('');
    };

    const removeExercise = (key: string) => {
        setExercises(prev => prev.filter(e => e.key !== key));
    };

    const buildPayload = (completed: boolean) => ({
        date: todayDate,
        log: {
            workout_date: todayDate,
            workout_template_id: activeTemplate?.id,
            day_of_week: todayDay,
            completed,
            intensity,
            duration_minutes: duration ? parseInt(duration) : undefined,
            notes: notes || undefined,
        },
        exercises: exercises.map(e => ({
            id: e.logId,
            exercise_name: e.exercise_name,
            sets: e.done && e.sets ? parseInt(e.sets) : undefined,
            reps: e.done && e.reps ? parseInt(e.reps) : undefined,
            weight: e.done && e.weight ? toKg(parseFloat(e.weight), weightUnit) : undefined,
            done: e.done,
        })),
    });

    const handleSaveProgress = async () => {
        setSaving(true);
        try {
            await saveSession.mutateAsync(buildPayload(false));
            setSavedAt(new Date());
        } catch (err) {
            console.error('Error saving session:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleComplete = async () => {
        setSaving(true);
        try {
            await saveSession.mutateAsync(buildPayload(false));
            const prs = await completeSession.mutateAsync({
                date: todayDate,
                exercises: exercises.map(e => ({
                    exercise_name: e.exercise_name,
                    weight: e.done && e.weight ? toKg(parseFloat(e.weight), weightUnit) : undefined,
                    reps: e.done && e.reps ? parseInt(e.reps) : undefined,
                    done: e.done,
                })),
            });
            if (prs.length > 0) {
                setShowPRModal(true);
            } else {
                navigate('/Workouts');
            }
        } catch (err) {
            console.error('Error completing workout:', err);
        } finally {
            setSaving(false);
        }
    };

    const completedCount = exercises.filter(e => e.done).length;
    const progress = exercises.length > 0 ? (completedCount / exercises.length) * 100 : 0;
    const completed = log?.completed ?? false;

    const loading = log === undefined || loggedExercises === null;

    if (loading) {
        return (
            <>
                <Title title="Log Workout" />
                <div className="books-page-wrapper">
                    <div className="dashboard-section workout-section">
                        <div className="workout-card">
                            <div className="profile-loading"><div className="profile-loading-spinner"></div><p>Loading workout...</p></div>
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
                        <WorkoutsNav />

                        <div className="dashboard-section__head">
                            <h2>{completed ? 'Today\u2019s Session' : 'Log Today\u2019s Session'}</h2>
                            <span>Deviations are saved to this session only — your template stays untouched.</span>
                        </div>

                        <div className="workout-check-info">
                            <div className="workout-check-info__date">
                                <Calendar className="mr-1" />{todayName}, {new Date(todayDate).toLocaleDateString()}
                            </div>
                            <div className="workout-check-info__progress">
                                <div className="workout-check-progress-bar">
                                    <div className="workout-check-progress-fill" style={{ width: `${progress}%` }}></div>
                                </div>
                                <span className="workout-check-progress-text">{completedCount}/{exercises.length}</span>
                            </div>
                        </div>

                        {/* Session settings */}
                        <div className="workout-check-settings">
                            <div className="workout-check-intensity">
                                <label className="workout-check-intensity__label">
                                    <Flame className="mr-1" />Intensity: <span className="workout-check-intensity__value">{intensity}/10</span>
                                </label>
                                <input type="range" min="1" max="10" value={intensity}
                                    onChange={(e) => setIntensity(parseInt(e.target.value))}
                                    className="workout-check-intensity__slider" />
                            </div>
                            <div className="workout-check-duration">
                                <label className="workout-check-intensity__label">
                                    <Timer className="mr-1" />Duration (min)
                                </label>
                                <input type="number" min="0" value={duration}
                                    onChange={(e) => setDuration(e.target.value)}
                                    className="workout-check-duration__input" placeholder="45" />
                            </div>
                        </div>

                        {/* Exercises */}
                        <div className="workout-check-exercises">
                            {exercises.map(exercise => (
                                <div key={exercise.key}
                                    className={`workout-check-exercise ${exercise.done ? 'workout-check-exercise--completed' : ''}`}>
                                    <div className="workout-check-exercise__header">
                                        <div className="workout-check-exercise__info">
                                            <h4 className="workout-check-exercise__name">{exercise.exercise_name}</h4>
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            <button onClick={() => setExercise(exercise.key, { done: !exercise.done })}
                                                className="workout-check-exercise__toggle">
                                                {exercise.done ? <CircleCheck /> : <Circle />}
                                            </button>
                                            <button onClick={() => removeExercise(exercise.key)}
                                                className="workout-check-exercise__remove" title="Remove">
                                                <Trash2 />
                                            </button>
                                        </div>
                                    </div>
                                    {exercise.done && (
                                        <div className="workout-check-exercise__inputs">
                                            <div className="workout-check-input-group">
                                                <label>Sets</label>
                                                <input type="number" min="1" value={exercise.sets}
                                                    onChange={(e) => setExercise(exercise.key, { sets: e.target.value })}
                                                    placeholder="3" className="workout-check-input" />
                                            </div>
                                            <div className="workout-check-input-group">
                                                <label>Reps</label>
                                                <input type="number" min="1" value={exercise.reps}
                                                    onChange={(e) => setExercise(exercise.key, { reps: e.target.value })}
                                                    placeholder="10" className="workout-check-input" />
                                            </div>
                                            <div className="workout-check-input-group">
                                                <label>Weight ({weightUnit})</label>
                                                <input type="number" min="0" step="0.5" value={exercise.weight}
                                                    onChange={(e) => setExercise(exercise.key, { weight: e.target.value })}
                                                    placeholder="0" className="workout-check-input" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {exercises.length === 0 && (
                                <div className="workout-empty">
                                    <Dumbbell className="workout-empty-icon" />
                                    <p className="workout-empty-title">Nothing planned for {todayName}</p>
                                    <p className="workout-empty-text">Add exercises below to record a session anyway.</p>
                                </div>
                            )}
                        </div>

                        {/* Add exercise */}
                        <div className="workout-check-add">
                            <ExerciseNameInput value={newExerciseName} onChange={setNewExerciseName}
                                placeholder="Add an exercise..." className="form-control" />
                            <button onClick={addExercise} disabled={!newExerciseName.trim()} className="btn-action">
                                Add
                            </button>
                        </div>

                        {/* Notes */}
                        <div className="workout-check-notes">
                            <label className="workout-check-notes__label"><StickyNote className="mr-1" />Notes (optional)</label>
                            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                                className="workout-check-notes__textarea" rows={3}
                                placeholder="How did the workout feel?" />
                        </div>

                        {/* Actions */}
                        <div className="workout-check-actions">
                            {saving && <span className="workout-check-status__saving"><Loader2 className="mr-1" />Saving...</span>}
                            {savedAt && !saving && <span className="workout-check-status__saved"><Check className="mr-1" />Saved {savedAt.toLocaleTimeString()}</span>}
                            {completed && <span className="workout-check-status__saved"><Check className="mr-1" />Completed</span>}

                            <button onClick={handleSaveProgress} disabled={saving || completed} className="btn-secondary">
                                <Save className="mr-1" />Save Progress
                            </button>
                            <button
                                onClick={handleComplete}
                                disabled={saving || completed || completedCount === 0}
                                className={`btn-action btn-action--primary workout-check-complete-btn ${completed ? 'workout-check-complete-btn--completed' : ''}`}>
                                {completed ? <><Check className="mr-1" />Workout Completed</> : <><Flag className="mr-1" />Complete Workout</>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* PR modal */}
            {showPRModal && prQueue.length > 0 && (
                <div className="modal-overlay">
                    <div className="modal-content pr-modal">
                        <div className="modal-header">
                            <h3><Trophy className="mr-1" />New Personal Record!</h3>
                            <button onClick={() => { setShowPRModal(false); navigate('/Workouts/History'); }} className="modal-close"><X /></button>
                        </div>
                        <div className="modal-body">
                            <div className="pr-celebration">
                                <Medal />
                                <h4>Great job!</h4>
                                <ul className="pr-celebration-list">
                                    {prQueue.map(pr => (
                                        <li key={pr.exercise_name}>
                                            <strong>{pr.exercise_name}</strong> — {pr.weight}kg × {pr.reps} reps
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button onClick={() => { setShowPRModal(false); navigate('/Workouts/History'); }} className="btn-primary">
                                View History
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default WorkoutCheckPage;