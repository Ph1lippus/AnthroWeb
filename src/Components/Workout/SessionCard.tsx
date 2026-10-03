import React, { useState } from 'react';
import { ChevronDown, Dumbbell, HeartPulse, Pencil, PersonStanding, Trash2 } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import ExerciseEditor from './ExerciseEditor';
import {
    useUpdateTemplateExercise,
    useAddTemplateExercise,
    useDeleteTemplateExercise,
    useDeletePlanSession,
} from '../../hooks/useWorkouts';
import { useUserSettings } from '../../hooks/useUserSettings';
import type { WorkoutPlanSession, WorkoutTemplateExercise } from '../../services/workoutService';

const TYPE_ICONS = {
    strength: Dumbbell,
    cardio: HeartPulse,
    mobility: PersonStanding,
};

interface SessionCardProps {
    session: WorkoutPlanSession;
    exercises: WorkoutTemplateExercise[];
    templateId: string;
    /** Whether the session's weekday is today. */
    isToday: boolean;
    onEdit: () => void;
}

/**
 * One session -- a whole workout on a chosen day -- and the exercises inside it.
 *
 * The same collapsible card the academic page's course row uses, and the same
 * reason: a session opens into a full per-exercise form with a set table per
 * strength exercise, and left open that is a wall of number inputs rather than a
 * week you can read.
 *
 * The session's own type decides what the exercises get, because that is the
 * difference between three sets of five reps and forty minutes on a bike. It is
 * applied on creation rather than derived per exercise, so switching a session
 * from strength to cardio moves all of its exercises with it.
 */
const SessionCard: React.FC<SessionCardProps> = ({
    session,
    exercises,
    templateId,
    isToday,
    onEdit,
}) => {
    const weightUnit = useUserSettings().settings?.weight_unit ?? 'kg';
    const addExercise = useAddTemplateExercise(templateId);
    const updateExercise = useUpdateTemplateExercise(templateId);
    const deleteExercise = useDeleteTemplateExercise(templateId);
    const deleteSession = useDeletePlanSession(templateId);

    const [open, setOpen] = useState(false);
    const [dropping, setDropping] = useState(false);

    const Icon = TYPE_ICONS[session.activity_type] ?? Dumbbell;
    const sets = exercises.reduce(
        (total, row) => total + (row.target_sets_detail?.length ?? 0),
        0,
    );

    const meta = [
        exercises.length > 0
            ? `${exercises.length} exercise${exercises.length === 1 ? '' : 's'}`
            : 'no exercises yet',
        sets > 0 && `${sets} sets`,
        session.target_duration_minutes ? `${session.target_duration_minutes} min` : null,
    ].filter(Boolean).join(' · ');

    return (
        <>
            <div className={`collapse-card ${open ? 'collapse-card--open' : ''}`}>
                <button
                    className="collapse-head"
                    onClick={() => setOpen(!open)}
                    aria-expanded={open}
                >
                    <span className={`workout-ex__type workout-ex__type--${session.activity_type}`}>
                        <Icon size={13} />
                    </span>
                    <span className="collapse-head__text">
                        <span className="semester-title" style={{ color: 'var(--color-light)' }}>
                            {session.name}
                        </span>
                        <span className="semester-meta">{meta}</span>
                    </span>
                    <span className="collapse-head__right">
                        {isToday && <span className="workout-chip">today</span>}
                        {/* Wrapped rather than putting the class on the icon:
                            whether an SVG component forwards `className` is not
                            something to depend on for a state indicator. */}
                        <span className="collapse-chevron">
                            <ChevronDown size={15} />
                        </span>
                    </span>
                </button>

                {open && (
                    <div className="collapse-body">
                        <ExerciseEditor
                            exercises={exercises}
                            dayOfWeek={session.day_of_week}
                            sessionId={session.id}
                            defaultActivityType={session.activity_type}
                            weightUnit={weightUnit}
                            isSaving={addExercise.isPending || updateExercise.isPending}
                            onAdd={input => addExercise.mutateAsync(input)}
                            onUpdate={(id, updates) => updateExercise.mutate({ id, updates })}
                            onDelete={id => deleteExercise.mutate(id)}
                        />

                        {/* Last, like the academic page's card and like the
                            template card above it: the things you can do to a
                            session sit under its contents, not above them. */}
                        <div className="course-actions">
                            <button type="button" className="btn-action" onClick={onEdit}>
                                <Pencil size={13} /> Edit session
                            </button>
                            <button
                                type="button"
                                className="book-action-btn book-action-btn--danger"
                                onClick={() => setDropping(true)}
                                title="Delete session"
                                aria-label="Delete session"
                            >
                                <Trash2 />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <ConfirmModal
                open={dropping}
                title={`Delete ${session.name}?`}
                description={
                    exercises.length > 0
                        ? `Its ${exercises.length} exercise${exercises.length === 1 ? '' : 's'} go with it. Workouts you already logged keep their own record.`
                        : 'Workouts you already logged keep their own record.'
                }
                confirmLabel="Delete"
                danger
                onConfirm={() => deleteSession.mutate(session.id!)}
                onCancel={() => setDropping(false)}
            />
        </>
    );
};

export default SessionCard;