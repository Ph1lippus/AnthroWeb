import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import WorkoutContributionChart from '../Components/Workout/WorkoutContributionChart';
import { useWorkoutStore } from '../stores/useWorkoutStore';
import type { WorkoutCompletionLog } from '../services/workoutService';

const WorkoutHistoryPage: React.FC = () => {
    const navigate = useNavigate();
    const { 
        workoutHistory, 
        loading, 
        fetchWorkoutHistory, 
        fetchExerciseLogs,
        exerciseLogs 
    } = useWorkoutStore();
    
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedWorkout, setSelectedWorkout] = useState<WorkoutCompletionLog | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchWorkoutHistory(90); // Last 90 days
    }, [fetchWorkoutHistory]);

    const handleDateClick = async (date: string) => {
        const workout = workoutHistory.find(w => w.workout_date === date);
        if (workout && workout.id) {
            setSelectedDate(date);
            setSelectedWorkout(workout);
            
            try {
                await fetchExerciseLogs(workout.id);
            } catch (error) {
                console.error('Error loading exercise logs:', error);
            }
        } else {
            setSelectedDate(date);
            setSelectedWorkout(null);
        }
    };

    const completedDates = workoutHistory
        .filter(w => w.completed)
        .map(w => w.workout_date);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            weekday: 'long',
            month: 'long', 
            day: 'numeric', 
            year: 'numeric' 
        });
    };

    const filteredHistory = workoutHistory.filter(w =>
        w.workout_date.includes(searchQuery) ||
        (w.notes && w.notes.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const renderWorkoutCard = (workout: WorkoutCompletionLog) => {
        return (
            <div 
                key={workout.id} 
                className="workout-history-card"
                onClick={() => handleDateClick(workout.workout_date)}
            >
                <div className="workout-history-card__top">
                    <div className="workout-history-card__title-section">
                        <h3 className="workout-history-card__title">{formatDate(workout.workout_date)}</h3>
                        <div className="workout-history-card__meta">
                            {workout.completed ? (
                                <span className="workout-history-card__status workout-history-card__status--completed">
                                    <i className="fa-solid fa-check-circle mr-1"></i>Completed
                                </span>
                            ) : (
                                <span className="workout-history-card__status workout-history-card__status--incomplete">
                                    <i className="fa-solid fa-times-circle mr-1"></i>Not Completed
                                </span>
                            )}
                            {workout.intensity && (
                                <span className="workout-history-card__intensity">
                                    <i className="fa-solid fa-fire mr-1"></i>{workout.intensity}/10
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="workout-history-card__chevron">
                        <i className="fa-solid fa-chevron-right"></i>
                    </div>
                </div>
                {workout.notes && (
                    <p className="workout-history-card__notes">{workout.notes}</p>
                )}
            </div>
        );
    };

    return (
        <>
            <Title title="Workout History" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card">
                        {/* Top Bar */}
                        <div className="workout-history-top-bar">
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => navigate('/Workouts')} className="btn-action">
                                    <i className="fa-solid fa-dumbbell mr-1"></i>Dashboard
                                </button>
                                <button onClick={() => navigate('/Workouts/Check')} className="btn-action">
                                    <i className="fa-solid fa-clipboard-check mr-1"></i>Log Workout
                                </button>
                                <button onClick={() => navigate('/Workouts/Templates')} className="btn-action">
                                    <i className="fa-solid fa-layer-group mr-1"></i>Templates
                                </button>
                                <button onClick={() => navigate('/Workouts/PRs')} className="btn-action">
                                    <i className="fa-solid fa-trophy mr-1"></i>PRs
                                </button>
                            </div>
                            <div className="search-container workout-history-search">
                                <div className="search-input-wrapper">
                                    <i className="search-input-icon fa-solid fa-magnifying-glass"></i>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="search-input"
                                        placeholder="Search history..."
                                    />
                                    {searchQuery && (
                                        <button
                                            className="search-clear-btn"
                                            onClick={() => setSearchQuery('')}
                                            aria-label="Clear search"
                                        >
                                            <i className="fa-solid fa-xmark"></i>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        {loading ? (
                            <div className="profile-loading">
                                <div className="profile-loading-spinner"></div>
                                <p>Loading history...</p>
                            </div>
                        ) : (
                            <div className="workout-history-content">
                                <div className="workout-history-calendar-section">
                                    <WorkoutContributionChart
                                        completedDates={completedDates}
                                        onDateClick={handleDateClick}
                                    />
                                </div>

                                {selectedWorkout ? (
                                    <div className="workout-history-selected">
                                        <div className="workout-history-selected__header">
                                            <h3>{formatDate(selectedWorkout.workout_date)}</h3>
                                            <span className={`workout-history-selected__status ${selectedWorkout.completed ? 'workout-history-selected__status--completed' : 'workout-history-selected__status--incomplete'}`}>
                                                {selectedWorkout.completed ? (
                                                    <><i className="fa-solid fa-check-circle mr-1"></i>Completed</>
                                                ) : (
                                                    <><i className="fa-solid fa-times-circle mr-1"></i>Not Completed</>
                                                )}
                                            </span>
                                        </div>

                                        {selectedWorkout.intensity && (
                                            <div className="workout-history-selected__meta">
                                                <span>Intensity: {selectedWorkout.intensity}/10</span>
                                            </div>
                                        )}

                                        {selectedWorkout.notes && (
                                            <div className="workout-history-selected__notes">
                                                <span>Notes: {selectedWorkout.notes}</span>
                                            </div>
                                        )}

                                        {exerciseLogs.length > 0 ? (
                                            <div className="workout-history-selected__exercises">
                                                {exerciseLogs.map((log) => (
                                                    <div key={log.id} className="workout-history-exercise-item">
                                                        <div className="workout-history-exercise-item__name">{log.exercise_name}</div>
                                                        <div className="workout-history-exercise-item__details">
                                                            {log.sets && `${log.sets} sets`}
                                                            {log.sets && log.reps && ' • '}
                                                            {log.reps && `${log.reps} reps`}
                                                            {log.weight && ` • ${log.weight}kg`}
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
                                        <i className="fa-solid fa-calendar-xmark workout-history-empty__icon"></i>
                                        <p className="workout-history-empty__title">No Workout on {formatDate(selectedDate)}</p>
                                        <p className="workout-history-empty__text">Select a different date to view workout details.</p>
                                    </div>
                                ) : (
                                    <div className="workout-history-list">
                                        <div className="workout-history-section-header">
                                            <i className="fa-solid fa-clock-rotate-left"></i>
                                            Recent Workouts ({filteredHistory.length})
                                        </div>
                                        {filteredHistory.length > 0 ? (
                                            <div className="workout-history-grid">
                                                {filteredHistory.slice(0, 10).map(renderWorkoutCard)}
                                            </div>
                                        ) : (
                                            <div className="workout-history-empty">
                                                <i className="fa-solid fa-calendar-days workout-history-empty__icon"></i>
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