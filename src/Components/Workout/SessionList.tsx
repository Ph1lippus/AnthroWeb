import React, { useMemo, useState } from 'react';
import { ChevronDown, Dumbbell, HeartPulse, PersonStanding, Flame, Timer, Trash2 } from 'lucide-react';
import { formatWeight, type WeightUnit } from '../../utils/units';
import { addDays, formatDayLabel } from '../../utils/dates';
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
    onCreate?: () => void;
    onDelete?: (session: SessionWithExercises) => void;
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
const SessionList: React.FC<SessionListProps> = ({ sessions, weekStart = null, weightUnit, onOpen, onCreate, onDelete }) => {
    const [openSession, setOpenSession] = useState<string | null>(null);
    const inWeek = useMemo(() => {
        const weekEnd = weekStart ? addDays(weekStart, 6) : null;
        return sessions
            .filter(session =>
                weekEnd === null
                    ? true
                    : session.workout_date >= weekStart! && session.workout_date <= weekEnd)
            .sort((a, b) => b.workout_date.localeCompare(a.workout_date));
    }, [sessions, weekStart]);

    const grouped = useMemo(() => {
        const map = new Map<string, SessionWithExercises[]>();
        for (const session of inWeek) {
            const list = map.get(session.workout_date);
            if (list) list.push(session);
            else map.set(session.workout_date, [session]);
        }
        return [...map.entries()];
    }, [inWeek]);

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
            {grouped.map(([date, sessions]) => (
                <React.Fragment key={date}>
                    {sessions.length > 1 && (
                        <div className="workout-logged__day-group">{formatDayLabel(date)}</div>
                    )}
                    {sessions.map(session => {
                        const open = openSession === session.id;
                        const done = session.exercises.filter(row => row.completed).length;

                        return (
                    <div
                        key={session.id}
                        className={`workout-logged__row ${open ? 'workout-logged__row--open' : ''}`}
                    >
                        <div
                            role="button"
                            tabIndex={0}
                            className="workout-logged__head"
                            onClick={() => setOpenSession(open ? null : session.id ?? null)}
                            onKeyDown={event => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setOpenSession(open ? null : session.id ?? null);
                                }
                            }}
                            aria-expanded={open}
                        >
                            <span className="workout-logged__date">
                                {session.plan_session?.name && (
                                    <strong className="workout-logged__session-title">
                                        {session.plan_session.name}
                                    </strong>
                                )}
                                <span className="workout-logged__day">{formatDayLabel(session.workout_date)}</span>
                                <span className="workout-logged__stamp">{session.workout_date}</span>
                            </span>

                            <span className="workout-logged__chips">
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
                                {session.body_weight != null && (
                                    <span className="workout-logged__chip">
                                        {session.body_weight} kg
                                    </span>
                                )}
                            </span>

                            <span
                                className="collapse-chevron workout-logged__chevron"
                                style={{ transform: open ? 'rotate(180deg)' : 'none' }}
                            >
                                <ChevronDown size={15} aria-hidden="true" />
                            </span>
                            {onDelete && (
                                <button
                                    type="button"
                                    className="workout-logged__delete"
                                    aria-label={`Delete ${session.plan_session?.name ?? 'logged session'}`}
                                    data-tip="Delete session"
                                    onClick={event => {
                                        event.stopPropagation();
                                        onDelete(session);
                                    }}
                                >
                                    <Trash2 size={12} />
                                </button>
                            )}
                        </div>

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
                                        Open session
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
                    })}
                </React.Fragment>
            ))}
            {onCreate && (
                <div className="workout-ex__actions" style={{ marginTop: '0.75rem' }}>
                    <button type="button" className="btn-action btn-action--primary" onClick={onCreate}>
                        Create session
                    </button>
                </div>
            )}
        </div>
    );
};

export default SessionList;