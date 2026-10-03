import React, { useState } from 'react';
import { ChevronDown, Plus, SquarePen, Trash2, Check, Layers } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import SessionCard from './SessionCard';
import {
    useWorkoutTemplate,
    useDeleteWorkoutTemplate,
} from '../../hooks/useWorkouts';
import { DAY_NAMES } from '../../utils/workoutStats';

interface TemplateCardProps {
    templateId: string;
    /** Whether this card starts open. The first template does, as a semester does. */
    defaultOpen?: boolean;
    /** Today's weekday, so a session can say it is today. */
    todayIndex: number;
    onEdit: () => void;
    onEditSession: (sessionId: string) => void;
    onAddSession: (defaultDay: number) => void;
}

/**
 * One template -- a named routine -- and the sessions in it.
 *
 * This is the academic page's `SemesterContainer` with the units swapped, and it
 * is built the same way on purpose: the body is either its children or one quiet
 * empty state, and the actions sit at the bottom in a fixed order -- add with a
 * label, then edit and delete as bare icons. Same primitives, same interaction,
 * so a routine and a semester feel like the same object.
 *
 * The template itself carries nothing but a name. It is renamed from the edit
 * dialog rather than from fields in the body, because a body that both asks for
 * a name inline and offers a Rename button is asking twice.
 *
 * Nothing here rewrites history. A session materialises into its own rows when
 * the day is started, so editing a template changes what future days will offer
 * and leaves every past week exactly as it was logged.
 */
const TemplateCard: React.FC<TemplateCardProps> = ({
    templateId,
    defaultOpen = false,
    todayIndex,
    onEdit,
    onEditSession,
    onAddSession,
}) => {
    const { data, isLoading } = useWorkoutTemplate(templateId);
    const deleteTemplate = useDeleteWorkoutTemplate();

    const template = data?.template ?? null;
    const sessions = data?.sessions ?? [];
    const exercises = data?.exercises ?? [];

    const [open, setOpen] = useState(defaultOpen);
    const [dropping, setDropping] = useState(false);

    if (!template) {
        return (
            <div className="collapse-card">
                <div className="collapse-body">
                    <p className="form-label">{isLoading ? 'Loading…' : 'That template no longer exists'}</p>
                </div>
            </div>
        );
    }

    const dayGroups = DAY_NAMES.map((dayName, day) => ({
        day,
        dayName,
        sessions: sessions.filter(row => row.day_of_week === day),
    }));

    return (
        <>
            <div className={`collapse-card ${open ? 'collapse-card--open' : ''}`}>
                <button
                    className="collapse-head"
                    onClick={() => setOpen(!open)}
                    aria-expanded={open}
                >
                    <span className="collapse-head__text">
                        <span className="semester-title">{template.name}</span>
                        <span className="semester-meta">
                            {sessions.length === 0
                                ? 'no sessions yet'
                                : `${sessions.length} session${sessions.length === 1 ? '' : 's'} · ${exercises.length} exercise${exercises.length === 1 ? '' : 's'}`}
                        </span>
                    </span>
                    <span className="collapse-head__right">
                        {/* Read-only. A button inside the header button would be
                            nested interactive controls, which browsers resolve by
                            reparenting and clicking unpredictably -- so "set
                            active" lives in the edit dialog instead, beside delete
                            and duplicate. */}
                        {template.is_active && (
                            <span className="workout-chip"><Check size={10} />Active</span>
                        )}
                        <span className="collapse-chevron">
                            <ChevronDown size={15} />
                        </span>
                    </span>
                </button>

                {open && (
                    <div className="collapse-body">
                        {sessions.length === 0 ? (
                            <div className="academic-empty">
                                <Layers size={32} className="academic-empty__icon" />
                                <span className="academic-empty__title">No sessions yet</span>
                                <span className="academic-empty__text">
                                    A session is one whole workout on one day. Add it, then fill in the
                                    exercises it holds.
                                </span>
                            </div>
                        ) : (
                            <div className="tpl-days">
                                {dayGroups.map(group => group.sessions.length === 0 ? null : (
                                    <section key={group.day} className="tpl-day">
                                        <h4 className="tpl-day__label">
                                            {group.dayName}
                                            {group.day === todayIndex && (
                                                <span className="tpl-day__today">today</span>
                                            )}
                                        </h4>
                                        {group.sessions.map(session => (
                                            <SessionCard
                                                key={session.id}
                                                session={session}
                                                exercises={exercises.filter(
                                                    row => row.session_id === session.id,
                                                )}
                                                templateId={templateId}
                                                isToday={group.day === todayIndex}
                                                onEdit={() => onEditSession(session.id!)}
                                            />
                                        ))}
                                    </section>
                                ))}
                            </div>
                        )}

                        {/* Same order and same treatment as the academic page's
                            semester: add with a label, edit and delete as icons. */}
                        <div className="course-actions">
                            <button
                                type="button"
                                className="btn-action"
                                onClick={() => onAddSession(todayIndex)}
                            >
                                <Plus size={13} /> Add session
                            </button>
                            <button
                                type="button"
                                className="book-action-btn"
                                onClick={onEdit}
                                title="Edit template"
                            >
                                <SquarePen />
                            </button>
                            <button
                                type="button"
                                className="book-action-btn book-action-btn--danger"
                                onClick={() => setDropping(true)}
                                title="Delete template"
                            >
                                <Trash2 />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <ConfirmModal
                open={dropping}
                title="Delete this template?"
                description="Its sessions and exercises go with it. Workouts you already logged keep their own record."
                confirmLabel="Delete"
                danger
                onConfirm={() => { deleteTemplate.mutate(templateId); setOpen(false); }}
                onCancel={() => setDropping(false)}
            />
        </>
    );
};

export default TemplateCard;