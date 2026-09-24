import React, { useState } from 'react';
import Title from '../Components/Title';
import WorkoutsNav from '../Components/Workout/WorkoutsNav';
import { useWorkoutLogsWithVolume, useWorkoutExercises } from '../hooks/useWorkouts';
import { useUserSettings } from '../hooks/useUserSettings';
import { fromKg } from '../utils/units';
import type { WorkoutCompletionLog } from '../services/workoutService';
import { CircleCheck, CircleX, Flame, ChevronRight, History, CalendarX, CalendarDays, Timer } from 'lucide-react';

const WorkoutHistoryPage: React.FC = () => {
    const weightUnit = useUserSettings().settings?.weight_unit ?? 'kg';

    const { data: workoutHistory = [], isLoading } = useWorkoutLogsWithVolume(120);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    const selectedWorkout = workoutHistory.find(w => w.workout_date === selectedDate) ?? null;
    const { data: exerciseLogs = [], isLoading: exercisesLoading } = useWorkoutExercises(selectedWorkout?.id);

    const formatDate = (dateString: string) =>
        new Date(dateString).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });

    const handleDateClick = (date: string) => setSelectedDate(date);

    const renderWorkoutCard = (workout: WorkoutCompletionLog & { volume?: number }) => (
        <div key={workout.id} className="workout-history-card" onClick={() => handleDateClick(workout.workout_date)}>
            <div className="workout-history-card__top">
                <div className="workout-history-card__title-section">
                    <h3 className="workout-history-card__title">{formatDate(workout.workout_date)}</h3>
                    <div className="workout-history-card__meta">
                        {workout.completed ? (
                            <span className="workout-history-card__status workout-history-card__status--completed">
                                <CircleCheck className="mr-1" />Completed
                            </span>
                        ) : (
                            <span className="workout-history-card__status workout-history-card__status--incomplete">
                                <CircleX className="mr-1" />Not Completed
                            </span>
                        )}
                        {workout.intensity && (
                            <span className="workout-history-card__intensity">
                                <Flame className="mr-1" />{workout.intensity}/10
                            </span>
                        )}
                        {typeof workout.duration_minutes === 'number' && (
                            <span className="workout-history-card__intensity">
                                <Timer className="mr-1" />{workout.duration_minutes} min
                            </span>
                        )}
                    </div>
                </div>
                <div className="workout-history-card__chevron">
                    <ChevronRight />
                </div>
            </div>
            {workout.notes && <p className="workout-history-card__notes">{workout.notes}</p>}
        </div>
    );

    return (
        <>
            <Title title="Workout History" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card">
                        <WorkoutsNav />

                        {isLoading ? (
                            <div className="profile-loading">
                                <div className="profile-loading-spinner"></div>
                                <p>Loading history...</p>
                            </div>
                        ) : (
                            <div className="workout-history-content">
                                {selectedWorkout ? (
                                    <div className="workout-history-selected">
                                        <div className="workout-history-selected__header">
                                            <h3>{formatDate(selectedWorkout.workout_date)}</h3>
                                            <span className={`workout-history-selected__status ${selectedWorkout.completed ? 'workout-history-selected__status--completed' : 'workout-history-selected__status--incomplete'}`}>
                                                {selectedWorkout.completed ? (
                                                    <><CircleCheck className="mr-1" />Completed</>
                                                ) : (
                                                    <><CircleX className="mr-1" />Not Completed</>
                                                )}
                                            </span>
                                        </div>

                                        {(selectedWorkout.intensity || typeof selectedWorkout.duration_minutes === 'number') && (
                                            <div className="workout-history-selected__meta">
                                                {selectedWorkout.intensity && <span>Intensity: {selectedWorkout.intensity}/10</span>}
                                                {typeof selectedWorkout.duration_minutes === 'number' && <span>Duration: {selectedWorkout.duration_minutes} min</span>}
                                                {typeof selectedWorkout.volume === 'number'
                                                    && selectedWorkout.volume > 0 && (
                                                        <span>Volume: {fromKg(selectedWorkout.volume, weightUnit).toFixed(0)} {weightUnit}</span>
                                                    )}
                                            </div>
                                        )}

                                        {selectedWorkout.notes && (
                                            <div className="workout-history-selected__notes">
                                                <span>Notes: {selectedWorkout.notes}</span>
                                            </div>
                                        )}

                                        {exercisesLoading ? (
                                            <p className="workout-history-selected__empty">Loading exercises...</p>
                                        ) : exerciseLogs.length > 0 ? (
                                            <div className="workout-history-selected__exercises">
                                                {exerciseLogs.map((log) => (
                                                    <div key={log.id} className="workout-history-exercise-item">
                                                        <div className="workout-history-exercise-item__name">{log.exercise_name}</div>
                                                        <div className="workout-history-exercise-item__details">
                                                            {log.sets && `${log.sets} sets`}
                                                            {log.sets && log.reps && ' • '}
                                                            {log.reps && `${log.reps} reps`}
                                                            {log.weight && ` • ${fromKg(log.weight, weightUnit).toFixed(1)} ${weightUnit}`}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="workout-history-selected__empty">No exercises logged for this workout.</p>
                                        )}
                                    </div>
                                ) : selectedDate ? (
                                    <div className="workout-history-empty">
                                        <CalendarX className="workout-history-empty__icon" />
                                        <p className="workout-history-empty__title">No Workout on {formatDate(selectedDate)}</p>
                                        <p className="workout-history-empty__text">Select a different date to view workout details.</p>
                                    </div>
                                ) : (
                                    <div className="workout-history-list">
                                        <div className="workout-history-section-header">
                                            <History />
                                            Recent Workouts ({workoutHistory.length})
                                        </div>
                                        {workoutHistory.length > 0 ? (
                                            <div className="workout-history-grid">
                                                {workoutHistory.slice(0, 10).map(renderWorkoutCard)}
                                            </div>
                                        ) : (
                                            <div className="workout-history-empty">
                                                <CalendarDays className="workout-history-empty__icon" />
                                                <p className="workout-history-empty__title">No workout history</p>
                                                <p className="workout-history-empty__text">Start logging workouts to see your history here.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default WorkoutHistoryPage;