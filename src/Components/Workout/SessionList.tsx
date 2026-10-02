import React, { useState } from 'react';
import { ChevronRight, CircleCheck, Flame, Timer } from 'lucide-react';
import { formatWeight, type WeightUnit } from '../../utils/units';
import { formatDayLabel, todayString } from '../../utils/dates';
import { ACTIVITY_LABELS } from '../../utils/workoutSets';
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

interface SessionListProps {
    sessions: SessionWithExercises[];
    weightUnit: WeightUnit;
    onOpen: (date: string) => void;
}

/**
 * Every completed session in the window, newest first, each one expandable.
 *
 * This absorbs what used to be a separate History page. Reading it as a list
 * under the recent strip is better than a page of its own, because the question
 * it answers — "what did I actually do on the 8th" — is only interesting next
 * to the plan and the heatmap that surround it.
 *
 * A past session reads from its own materialised exercise rows, never from the
 * template it came from, so a template edited since cannot change what this says
 * you did.
 */
const SessionList: React.FC<SessionListProps> = ({ sessions, weightUnit, onOpen }) => {
    const [openDate, setOpenDate] = useState<string | null>(null);

    if (sessions.length === 0) {
        return (
            <div className="workout-empty">
                <p className="workout-empty__title">No completed sessions yet</p>
                <p className="workout-empty__text">Mark a day, or log a session, and it appears here.</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {sessions.map(session => {
                const open = openDate === session.workout_date;
                const done = session.exercises.filter(row => row.completed).length;

                return (
                    <div key={session.id} className={`collapse-card ${open ? 'collapse-card--open' : ''}`}>
                        <button
                            className="collapse-head"
                            onClick={() => setOpenDate(open ? null : session.workout_date)}
                            aria-expanded={open}
                        >
                            <span className="collapse-head__text">
                                <span className="semester-title" style={{ color: 'var(--color-light)' }}>
                                    {formatDayLabel(session.workout_date)}
                                </span>
                                <span className="semester-meta" style={{ display: 'flex', gap: '0.6rem' }}>
                                    <span style={{ color: 'var(--color-primary)', opacity: 0.9 }}>
                                        <CircleCheck size={10} /> done
                                    </span>
                                    <span>{done} exercises</span>
                                    {session.intensity != null && (
                                        <span><Flame size={10} /> {session.intensity}/10</span>
                                    )}
                                    {session.duration_minutes ? (
                                        <span><Timer size={10} /> {session.duration_minutes} min</span>
                                    ) : null}
                                </span>
                            </span>
<span className="collapse-head__right">
                                    {/* A chevron points right when closed and turns
                                        to point down when open, which reads as
                                        "opens downwards" rather than as a spin. */}
                                    <span
                                        className="collapse-chevron"
                                        style={{ transform: open ? 'rotate(90deg)' : 'none' }}
                                    >
                                        <ChevronRight size={15} />
                                    </span>
                                </span>
                        </button>

                        {open && (
                            <div className="collapse-body">
                                {session.notes && (
                                    <p className="form-label" style={{ marginBottom: '0.5rem' }}>
                                        {session.notes}
                                    </p>
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
                                <div className="workout-ex__actions" style={{ marginTop: '0.6rem' }}>
                                    <button
                                        className="btn-action"
                                        onClick={() => onOpen(session.workout_date)}
                                    >
                                        {session.workout_date === todayString() ? 'Open session' : 'Edit this day'}
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