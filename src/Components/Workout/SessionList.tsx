import React, { useMemo, useState } from 'react';
import { ChevronDown, Dumbbell, HeartPulse, PersonStanding, Flame, Timer, CircleCheck } from 'lucide-react';
import { formatWeight, type WeightUnit } from '../../utils/units';
import { addDays, formatDayLabel, todayString } from '../../utils/dates';
import { ACTIVITY_LABELS, type ActivityType } from '../../utils/workoutSets';
import type { SessionWithExercises } from '../../services/workoutService';

/** "60 kg × 10, 70 kg × 8" — every set, because they can differ now. */
const setsLabel = (sets: Array<{ reps?: number; weight?: number }>, unit: WeightUnit): string =>
    sets
        .map(set => [
            set.weight != null ? formatWeight(set.weight, unit, 1) : '',
            set.reps != null ? `× ${set.reps}` : '',
        ].filter(Boolean).join(' '))
        .filter(Boolean)
        .join(', ');

const ACTIVITY_ICONS: Record<ActivityType, React.ReactNode> = {
    strength: <Dumbbell size={10} />,
    cardio: <HeartPulse size={10} />,
    mobility: <PersonStanding size={10} />,
};

interface SessionListProps {
    sessions: SessionWithExercises[];
    /**
     * The Sunday the list is narrowed to, or null for every session in the window.
     *
     * The week is the header's business, not the list's: the title, the arrows and
     * the count share one row, so the state that picks the range lives with them.
     */
    weekStart?: string | null;
    weightUnit: WeightUnit;
    onOpen: (date: string) => void;
}

/**
 * Completed sessions for a week at a time, newest first, each one expandable.
 *
 * This absorbs what used to be a separate History page. Reading it as a list
 * under the recent strip is better than a page of its own, because the question
 * it answers — "what did I actually do on the 8th" — is only interesting next
 * to the plan and the heatmap that surround it.
 *
 * The week at a time is the header's choice, not this one's, and the header can
 * also say "all" — a week view that cannot be left is a filter with no way out,
 * and most people looking for a session from six weeks ago want the list, not the
 * arrows.
 *
 * A past session reads from its own materialised exercise rows, never from the
 * template it came from, so a template edited since cannot change what this says
 * you did.
 */
const SessionList: React.FC<SessionListProps> = ({ sessions, weekStart = null, weightUnit, onOpen }) => {
    const [openDate, setOpenDate] = useState<string | null>(null);
    const today = todayString();

    const inWeek = useMemo(() => {
        const weekEnd = weekStart ? addDays(weekStart, 6) : null;
        return sessions
            .filter(session =>
                weekEnd === null
                    ? true
                    : session.workout_date >= weekStart! && session.workout_date <= weekEnd)
            .sort((a, b) => b.workout_date.localeCompare(a.workout_date));
    }, [sessions, weekStart]);

    if (inWeek.length === 0) {
        return (
            <div className="workout-empty">
                <p className="workout-empty__title">
                    {weekStart ? 'Nothing logged this week' : 'No completed sessions yet'}
                </p>
                <p className="workout-empty__text">
                    {weekStart
                        ? 'Step forward with the arrows, or switch to all sessions.'
                        : 'Mark a day, or log a session, and it appears here.'}
                </p>
            </div>
        );
    }

    return (
        <div className="workout-logged">
            {inWeek.map(session => {
                const open = openDate === session.workout_date;
                const done = session.exercises.filter(row => row.completed).length;
                const isToday = session.workout_date === today;

                return (
                    <div
                        key={session.id}
                        className={`workout-logged__row ${open ? 'workout-logged__row--open' : ''}`}
                    >
                        <button
                            className="workout-logged__head"
                            onClick={() => setOpenDate(open ? null : session.workout_date)}
                            aria-expanded={open}
                        >
                            <span className="workout-logged__date">
                                <span className="workout-logged__day">{formatDayLabel(session.workout_date)}</span>
                                <span className="workout-logged__stamp">{session.workout_date}</span>
                            </span>

                            <span className="workout-logged__chips">
                                <span className="workout-logged__chip workout-logged__chip--done">
                                    <CircleCheck size={10} aria-hidden="true" />
                                    done
                                </span>
                                <span className="workout-logged__chip">
                                    <Dumbbell size={10} aria-hidden="true" />
                                    {done} {done === 1 ? 'exercise' : 'exercises'}
                                </span>
                                {session.intensity != null && (
                                    <span className="workout-logged__chip">
                                        <Flame size={10} aria-hidden="true" />
                                        {session.intensity}/10
                                    </span>
                                )}
                                {session.duration_minutes ? (
                                    <span className="workout-logged__chip">
                                        <Timer size={10} aria-hidden="true" />
                                        {session.duration_minutes} min
                                    </span>
                                ) : null}
                                {isToday && (
                                    <span className="workout-logged__chip workout-logged__chip--today">
                                        today
                                    </span>
                                )}
                            </span>

                            <span
                                className="collapse-chevron workout-logged__chevron"
                                style={{ transform: open ? 'rotate(180deg)' : 'none' }}
                            >
                                <ChevronDown size={15} aria-hidden="true" />
                            </span>
                        </button>

                        {open && (
                            <div className="workout-logged__body">
                                {session.notes && (
                                    <p className="workout-logged__notes">{session.notes}</p>
                                )}
                                {session.exercises.length === 0 ? (
                                    <p className="form-label">Marked as trained, no exercises logged.</p>
                                ) : (
                                    <div className="workout-rows">
                                        {session.exercises.map(row => (
                                            <div className="workout-row" key={row.id}>
                                                <span
                                                    className={`workout-row__name ${row.completed ? '' : 'workout-table__muted'}`}
                                                >
                                                    <span className="workout-row__kind">
                                                        {ACTIVITY_ICONS[row.activity_type]}
                                                    </span>
                                                    {row.exercise_name}
                                                </span>
                                                <span className="workout-row__value">
                                                    {row.activity_type !== 'strength'
                                                        ? [
                                                            ACTIVITY_LABELS[row.activity_type],
                                                            row.duration_minutes ? `${row.duration_minutes} min` : null,
                                                            row.distance_km ? `${row.distance_km} km` : null,
                                                        ].filter(Boolean).join(' · ')
                                                        : setsLabel(row.sets_detail ?? [], weightUnit) || 'no sets'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="workout-ex__actions">
                                    <button
                                        className="btn-action"
                                        onClick={() => onOpen(session.workout_date)}
                                    >
                                        {isToday ? 'Open session' : 'Edit this day'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default SessionList;