import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { formatWeight, type WeightUnit } from '../../utils/units';
import { formatDayLabel, todayString } from '../../utils/dates';
import type { SessionWithExercises } from '../../services/workoutService';

interface RecentWorkoutsProps {
    sessions: SessionWithExercises[];
    weightUnit: WeightUnit;
}

/**
 * The last few sessions, as one band above the mosaic.
 *
 * This is the "what have I actually been doing" answer, and it sits above the
 * fold on purpose. Everything below it describes either the plan or a year, both
 * of which are reassuring and neither of which tells you about the last
 * fortnight.
 *
 * A single row that scrolls sideways rather than wrapping: wrapping would make
 * the page taller every time you train, which moves the chart you came to look
 * at further down the screen.
 */
const RecentWorkouts: React.FC<RecentWorkoutsProps> = ({ sessions, weightUnit }) => {
    const navigate = useNavigate();

    return (
        <div className="workout-mosaic__wide workout-mosaic__recent">
            {sessions.length === 0 ? (
                <div className="workout-recent__empty">
                    Nothing logged yet — mark a day, or log a session with sets and weights.
                </div>
            ) : (
                <div className="workout-recent">
                    {sessions.map(session => {
                        const volumeKg = session.exercises.reduce(
                            (total, row) => total + (row.sets_detail ?? []).reduce(
                                (sum, set) => sum + (set.reps ?? 0) * (set.weight ?? 0),
                                0,
                            ),
                            0,
                        );
                        const done = session.exercises.filter(row => row.completed).length;
                        const parts = [
                            `${done} ${done === 1 ? 'exercise' : 'exercises'}`,
                            volumeKg > 0 ? formatWeight(volumeKg, weightUnit, 0) : null,
                            session.duration_minutes ? `${session.duration_minutes} min` : null,
                        ].filter(Boolean);

                        return (
                            <button
                                type="button"
                                className="workout-recent__item"
                                key={session.id}
                                onClick={() => navigate(`/Workouts?day=${session.workout_date}`)}
                            >
                                <span className="workout-recent__date">
                                    {formatDayLabel(session.workout_date)}
                                    {session.workout_date === todayString() && (
                                        <span className="workout-chip">now</span>
                                    )}
                                    {session.intensity != null && (
                                        <span className="workout-recent__meta">
                                            <Flame size={10} /> {session.intensity}
                                        </span>
                                    )}
                                </span>
                                <span className="workout-recent__meta">{parts.join(' · ')}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default RecentWorkouts;