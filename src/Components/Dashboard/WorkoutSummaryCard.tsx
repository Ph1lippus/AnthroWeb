import React, { useMemo } from 'react';
import { Activity, ArrowRight, Dumbbell, HeartPulse } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWorkoutsOverview } from '../../hooks/useWorkouts';

const WorkoutSummaryCard: React.FC = () => {
    const { sessions, isLoading } = useWorkoutsOverview();
    const summary = useMemo(() => {
        const completed = sessions.filter(session => session.completed);
        const recent = completed.slice(0, 3);
        const exercises = completed.reduce((total, session) => total + session.exercises.length, 0);
        const cardio = completed.reduce(
            (total, session) => total + session.exercises.filter(exercise => exercise.activity_type === 'cardio').length,
            0,
        );
        return { completed: completed.length, exercises, cardio, recent };
    }, [sessions]);

    return (
        <div className="card dashboard-workout-summary" style={{ marginBottom: '1rem' }}>
            <div className="card-header">
                <h3 className="card-title"><Dumbbell size={13} /> Workouts</h3>
                <Link to="/workouts" className="metric-range-pill">
                    View workouts <ArrowRight size={11} />
                </Link>
            </div>
            <div className="card-body">
                {isLoading ? (
                    <p className="form-label">Loading workout summary…</p>
                ) : (
                    <>
                        <div className="analysis-grid">
                            <div className="analysis-card analysis-card--flat">
                                <div className="analysis-card-head"><Dumbbell className="analysis-card-icon" size={15} /><span className="analysis-card-label">Sessions</span></div>
                                <div className="analysis-card-value">{summary.completed}</div>
                                <div className="analysis-card-hint">completed workouts</div>
                            </div>
                            <div className="analysis-card analysis-card--flat">
                                <div className="analysis-card-head"><Activity className="analysis-card-icon" size={15} /><span className="analysis-card-label">Exercises</span></div>
                                <div className="analysis-card-value">{summary.exercises}</div>
                                <div className="analysis-card-hint">logged across sessions</div>
                            </div>
                            <div className="analysis-card analysis-card--flat">
                                <div className="analysis-card-head"><HeartPulse className="analysis-card-icon" size={15} /><span className="analysis-card-label">Cardio</span></div>
                                <div className="analysis-card-value">{summary.cardio}</div>
                                <div className="analysis-card-hint">cardio exercises logged</div>
                            </div>
                        </div>
                        {summary.recent.length > 0 && (
                            <div className="workout-rows" style={{ marginTop: '0.75rem' }}>
                                {summary.recent.map(session => (
                                    <Link key={session.id ?? session.workout_date} to={`/workouts?day=${session.workout_date}`} className="workout-row">
                                        <span className="workout-row__name">{session.workout_date}</span>
                                        <span className="workout-row__value">{session.exercises.length} exercise{session.exercises.length === 1 ? '' : 's'}</span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default WorkoutSummaryCard;
