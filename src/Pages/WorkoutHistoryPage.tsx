import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import WorkoutContributionChart from '../Components/Workout/WorkoutContributionChart';
import { useWorkoutStore } from '../stores/useWorkoutStore';
import type { WorkoutCompletionLog } from '../services/workoutService';
import { CircleCheck, CircleX, Flame, ChevronRight, Dumbbell, ClipboardCheck, Layers, Trophy, Search, X, CalendarX, History, CalendarDays } from 'lucide-react';

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
                        </div>
                    </div>
                    <div className="workout-history-card__chevron">
                        <ChevronRight />
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
                                    <Dumbbell className="mr-1" />Dashboard
                                </button>
                                <button onClick={() => navigate('/Workouts/Check')} className="btn-action">
                                    <ClipboardCheck className="mr-1" />Log Workout
                                </button>
                                <button onClick={() => navigate('/Workouts/Templates')} className="btn-action">
                                    <Layers className="mr-1" />Templates
                                </button>
                                <button onClick={() => navigate('/Workouts/PRs')} className="btn-action">
                                    <Trophy className="mr-1" />PRs
                                </button>
                            </div>
                            <div className="search-container workout-history-search">
                                <div className="search-input-wrapper">
                                    <Search className="search-input-icon" />
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
                                            <X />
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
                                                    <><CircleCheck className="mr-1" />Completed</>
                                                ) : (
                                                    <><CircleX className="mr-1" />Not Completed</>
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
                                        <CalendarX className="workout-history-empty__icon" />
                                        <p className="workout-history-empty__title">No Workout on {formatDate(selectedDate)}</p>
                                        <p className="workout-history-empty__text">Select a different date to view workout details.</p>
                                    </div>
                                ) : (
                                    <div className="workout-history-list">
                                        <div className="workout-history-section-header">
                                            <History />
                                            Recent Workouts ({filteredHistory.length})
                                        </div>
                                        {filteredHistory.length > 0 ? (
                                            <div className="workout-history-grid">
                                                {filteredHistory.slice(0, 10).map(renderWorkoutCard)}
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