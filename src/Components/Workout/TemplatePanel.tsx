import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { DAY_SHORT } from '../../utils/workoutStats';
import type { WorkoutTemplate, WorkoutTemplateExercise } from '../../services/workoutService';

type TemplateWithDays = WorkoutTemplate & { days: WorkoutTemplateExercise[] };

interface TemplatePanelProps {
    activeTemplate: TemplateWithDays | null;
    templates: TemplateWithDays[];
    todayIndex: number;
    onActivate: (id: string) => void;
    isActivating: boolean;
}

/**
 * The active routine, the rest of them, and the way in to the template page.
 *
 * Sits in the right rail rather than the left because it answers a standing
 * question — "what is my week meant to be" — while the left rail holds the
 * numbers that change every week. Create and Edit both leave for the template
 * pages; nothing about a template is edited from here.
 *
 * Monday is first: a training week reads Mon..Sun, while the database counts
 * from Sunday.
 */
const TemplatePanel: React.FC<TemplatePanelProps> = ({
    activeTemplate,
    templates,
    todayIndex,
    onActivate,
    isActivating,
}) => {
    const navigate = useNavigate();

    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const row of activeTemplate?.days ?? []) {
        if (row.day_of_week >= 0 && row.day_of_week <= 6) {
            counts[(row.day_of_week + 6) % 7] += 1;
        }
    }

    return (
        <div className="card">
            <div className="card-header">
                <h3 className="card-title">Templates</h3>
                <button
                    className="btn-action"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => navigate('/Workouts/Templates')}
                >
                    <Plus size={11} className="mr-1" />Create
                </button>
            </div>
            <div className="card-body">
                {activeTemplate ? (
                    <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <strong style={{ fontSize: '0.8rem' }}>{activeTemplate.name}</strong>
                            <button
                                className="btn-action"
                                style={{ padding: '0.15rem 0.35rem', marginLeft: 'auto' }}
                                onClick={() => navigate(`/Workouts/Template/${activeTemplate.id}`)}
                            >
                                <Pencil size={11} />Edit
                            </button>
                        </div>
                        {activeTemplate.description && (
                            <p className="form-label" style={{ marginBottom: '0.6rem' }}>
                                {activeTemplate.description}
                            </p>
                        )}
                        <div className="workout-week">
                            {DAY_SHORT.map((label, index) => {
                                const weekday = (index + 1) % 7;
                                const count = counts[index];
                                return (
                                    <span
                                        key={label}
                                        className={[
                                            'workout-week__day',
                                            count > 0 ? 'workout-week__day--on' : '',
                                            weekday === todayIndex ? 'workout-week__day--today' : '',
                                        ].filter(Boolean).join(' ')}
                                        title={`${label}: ${count} exercise${count === 1 ? '' : 's'}`}
                                    >
                                        <span className="workout-week__label">{label.slice(0, 2)}</span>
                                        <span className={`workout-week__count ${count === 0 ? 'workout-week__count--rest' : ''}`}>
                                            {count || '·'}
                                        </span>
                                    </span>
                                );
                            })}
                        </div>
                    </>
                ) : templates.length === 0 ? (
                    <div className="workout-empty">
                        <p className="workout-empty__title">No templates yet</p>
                        <p className="workout-empty__text">
                            A template gives every day of the week its own exercises and fills the
                            session for you. You can still mark days without one.
                        </p>
                    </div>
                ) : (
                    <>
                        <p className="form-label" style={{ marginBottom: '0.6rem' }}>
                            None active, so today has no plan. Pick one.
                        </p>
                        <div className="workout-rows">
                            {templates.map(template => (
                                <div className="workout-row" key={template.id}>
                                    <span className="workout-row__name">{template.name}</span>
                                    <button
                                        className="btn-action btn-action--primary"
                                        disabled={isActivating}
                                        onClick={() => onActivate(template.id!)}
                                    >
                                        Activate
                                    </button>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {activeTemplate && templates.length > 1 && (
                    <p className="form-label" style={{ marginTop: '0.6rem' }}>
                        {templates.length - 1} other template{templates.length === 2 ? '' : 's'}
                    </p>
                )}
            </div>
        </div>
    );
};

export default TemplatePanel;