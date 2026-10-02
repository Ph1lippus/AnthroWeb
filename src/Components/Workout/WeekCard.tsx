import React from 'react';
import { CalendarDays } from 'lucide-react';
import { DAY_SHORT } from '../../utils/workoutStats';
import type { WorkoutTemplateExercise } from '../../services/workoutService';
import type { DayRecord } from '../../utils/workoutStats';

interface WeekCardProps {
    /** The active template's exercises, or empty when none is active. */
    plan: WorkoutTemplateExercise[];
    /** Every day in the window, keyed by date, for the trained state. */
    days: Map<string, DayRecord>;
    sessionsThisWeek: number;
    setsThisWeek: number;
}

/** The date of `weekday` (0 = Sunday) inside the current week, Monday-first. */
const mondayOf = (weekday: number): string => {
    const today = new Date();
    const offset = (weekday + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + offset);
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
};

/**
 * The week at a glance: what is planned, and what was done.
 *
 * This used to exist twice -- once in `TemplatePanel` showing the planned
 * exercise count per day, and once inline in the page showing a trained tick --
 * as two visually identical seven-chip strips carrying two halves of one answer.
 * One chip now carries both facts: the figure is the planned count, and the
 * filled accent means that day was trained. A day with a plan but no session
 * therefore reads as an empty chip you can still act on, rather than as a tick
 * you cannot interpret.
 */
const WeekCard: React.FC<WeekCardProps> = ({
    plan,
    days,
    sessionsThisWeek,
    setsThisWeek,
}) => {
    const todayIndex = new Date().getDay();

    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const row of plan) {
        if (row.day_of_week >= 0 && row.day_of_week <= 6) {
            // Sunday-first, same as DAY_SHORT above. This used to remap to a
            // Monday-first index, which paired the wrong count with the wrong
            // label.
            counts[row.day_of_week] += 1;
        }
    }

    return (
        <div className="card">
            <div className="card-header">
                <h3 className="card-title"><CalendarDays size={12} />This week</h3>
                <span className="semester-meta" style={{ marginLeft: 'auto' }}>plan &amp; progress</span>
            </div>
            <div className="card-body">
                <div className="workout-week">
                    {DAY_SHORT.map((label, index) => {
                        // `DAY_SHORT` is Sunday-first, because that is what
                        // `Date.getDay()` counts -- so the label's own index IS
                        // the weekday. Adding one here (the previous version did,
                        // assuming the array was Monday-first) shifted every chip
                        // by a day, so the chip labelled "Sun" was actually
                        // Monday and the week was mislabelled end to end.
                        const weekday = index;
                        const count = counts[index];
                        const trained = days.get(mondayOf(weekday))?.completed === true;
                        const isToday = weekday === todayIndex;
                        return (
                            <span
                                key={label}
                                className={[
                                    'workout-week__day',
                                    count > 0 ? 'workout-week__day--planned' : '',
                                    trained ? 'workout-week__day--on' : '',
                                    isToday ? 'workout-week__day--today' : '',
                                ].filter(Boolean).join(' ')}
                                title={[
                                    label,
                                    count > 0 ? `${count} exercise${count === 1 ? '' : 's'}` : 'rest day',
                                    trained ? 'trained' : 'not logged',
                                ].join(' — ')}
                            >
                                <span className="workout-week__label">{label.slice(0, 2)}</span>
                                <span className={`workout-week__count ${count === 0 && !trained ? 'workout-week__count--rest' : ''}`}>
                                    {count || (trained ? '✓' : '·')}
                                </span>
                            </span>
                        );
                    })}
                </div>
                <div className="workout-meter-row" style={{ marginTop: '0.6rem' }}>
                    <span>Sessions · sets</span>
                    <strong style={{ marginLeft: 'auto' }}>
                        {sessionsThisWeek} · {setsThisWeek}
                    </strong>
                </div>
                <div className="workout-meter">
                    <div
                        className="workout-meter__fill"
                        style={{ width: `${Math.min(100, sessionsThisWeek / 5 * 100)}%` }}
                    />
                </div>
            </div>
        </div>
    );
};

export default WeekCard;