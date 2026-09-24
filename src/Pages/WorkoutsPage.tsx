import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import WorkoutsNav from '../Components/Workout/WorkoutsNav';
import { useActiveTemplate, useWorkoutPlan, useWorkoutLog, useSetActiveTemplate } from '../hooks/useWorkouts';
import { useUserSettings } from '../hooks/useUserSettings';
import { fromKg } from '../utils/units';
import { Dumbbell, Layers, Pencil, Plus, CalendarDays, CircleCheck, ChevronRight } from 'lucide-react';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const WorkoutsPage: React.FC = () => {
    const navigate = useNavigate();
    const { activeTemplate, templates } = useActiveTemplate();
    const weightUnit = useUserSettings().settings?.weight_unit ?? 'kg';

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayDayIndex = today.getDay();
    const todayName = DAY_NAMES[todayDayIndex];

    const { data: todayExercises = [] } = useWorkoutPlan(todayDayIndex, !!activeTemplate);
    const { data: todayLog } = useWorkoutLog(todayStr);
    const activateMutation = useSetActiveTemplate();

    const todayCompleted = todayLog?.completed ?? false;

    // Exercise count per weekday for the active template (0 = Sunday).
    const activeDays = useMemo(() => {
        const counts = [0, 0, 0, 0, 0, 0, 0];
        for (const ex of activeTemplate?.days ?? []) {
            const d = ex.day_of_week;
            if (typeof d === 'number' && d >= 0 && d <= 6) counts[d] += 1;
        }
        return counts;
    }, [activeTemplate]);

    const statusBadge = todayCompleted
        ? 'workout-status-badge--completed'
        : todayExercises.length > 0
            ? 'workout-status-badge--pending'
            : 'workout-status-badge--none';
    const statusLabel = todayCompleted
        ? 'Completed'
        : todayExercises.length > 0
            ? 'Not Started'
            : 'Rest Day';

    const renderTemplateCard = (templateName: string, templateId: string | undefined, description?: string, exerciseCount = 0) => (
        <div className="workout-landing-template" key={templateId ?? templateName}>
            <div className="workout-landing-template__info">
                <h4 className="workout-landing-template__name">{templateName}</h4>
                {description && <p className="workout-landing-template__description">{description}</p>}
                <span className="workout-landing-template__meta">
                    {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
                </span>
            </div>
            <div className="workout-landing-template__actions">
                <button
                    onClick={() => templateId && navigate(`/Workouts/Template/${templateId}`)}
                    className="btn-action"
                >
                    <Pencil className="mr-1" />Edit
                </button>
                <button
                    onClick={() => templateId && activateMutation.mutate(templateId)}
                    disabled={activateMutation.isPending}
                    className="btn-action btn-action--primary"
                >
                    <CircleCheck className="mr-1" />Set as Active
                </button>
            </div>
        </div>
    );

    return (
        <>
            <Title title="Workouts" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card">
                        <WorkoutsNav />

                        <div className="dashboard-section__head">
                            <h2>Workouts</h2>
                            <span>Your weekly routine at a glance</span>
                        </div>

                        {templates.length === 0 ? (
                            <div className="workout-onboard">
                                <div className="workout-onboard__icon"><Layers /></div>
                                <h3 className="workout-onboard__title">Build your first routine</h3>
                                <p className="workout-onboard__text">
                                    Create a weekly workout template and today's plan will show up here.
                                    You can log an unplanned session anytime.
                                </p>
                                <div className="workout-onboard__actions">
                                    <button
                                        onClick={() => navigate('/Workouts/Templates')}
                                        className="btn-action btn-action--primary"
                                    >
                                        <Plus className="mr-1" />Create Template
                                    </button>
                                    <button
                                        onClick={() => navigate('/Workouts/Check')}
                                        className="btn-action"
                                    >
                                        <Dumbbell className="mr-1" />Log Workout Manually
                                    </button>
                                </div>
                            </div>
                        ) : !activeTemplate ? (
                            <>
                                <div className="workout-choose-note">
                                    <CalendarDays className="workout-choose-note__icon" />
                                    <p>No active template — today has no plan yet. Pick a template to get started.</p>
                                </div>

                                <div className="workout-section-header">
                                    <Layers />
                                    Choose a template
                                </div>

                                <div className="workout-landing-templates">
                                    {templates.map(t => renderTemplateCard(t.name, t.id, t.description, (t.days ?? []).length))}
                                </div>

                                <div className="workout-landing-footer">
                                    <button onClick={() => navigate('/Workouts/Templates')} className="btn-action">
                                        <Plus className="mr-1" />New Template
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Today's status */}
                                <div className="workout-today-hero">
                                    <div className="workout-today-hero__head">
                                        <span className="workout-today-hero__date">Today · {todayName}</span>
                                        <span className={`workout-status-badge ${statusBadge}`}>{statusLabel}</span>
                                    </div>
                                    {todayCompleted ? (
                                        <p className="workout-today-hero__text">Great job — you completed today's workout.</p>
                                    ) : todayExercises.length > 0 ? (
                                        <p className="workout-today-hero__text">
                                            {todayExercises.length} exercise{todayExercises.length !== 1 ? 's' : ''} scheduled.
                                        </p>
                                    ) : (
                                        <p className="workout-today-hero__text">Rest day — enjoy it.</p>
                                    )}
                                    {todayExercises.length > 0 && (
                                        <ul className="workout-today-hero__list">
                                            {todayExercises.map((ex, index) => (
                                                <li key={ex.id ?? `${ex.exercise_name}-${index}`} className="workout-today-hero__item">
                                                    <span className="workout-today-hero__item-name">{ex.exercise_name}</span>
                                                    {ex.target_sets && ex.target_reps && (
                                                        <span className="workout-today-hero__sets">
                                                            {ex.target_sets} × {ex.target_reps}
                                                            {ex.target_weight != null && ` · ${fromKg(ex.target_weight, weightUnit).toFixed(0)} ${weightUnit}`}
                                                        </span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    <div className="workout-today-hero__actions">
                                        <button
                                            onClick={() => navigate('/Workouts/Check')}
                                            className="btn-action btn-action--primary"
                                        >
                                            <Dumbbell className="mr-1" />{todayCompleted ? 'Review Session' : 'Log Workout'}
                                        </button>
                                    </div>
                                </div>

                                {/* Active template */}
                                <div className="workout-active-template">
                                    <div className="workout-active-template__head">
                                        <div className="workout-active-template__title-group">
                                            <h3 className="workout-active-template__name">
                                                <CircleCheck className="workout-active-template__pin" />
                                                {activeTemplate.name}
                                            </h3>
                                            {activeTemplate.description && (
                                                <p className="workout-active-template__description">{activeTemplate.description}</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => navigate(`/Workouts/Template/${activeTemplate.id}`)}
                                            className="btn-action"
                                        >
                                            <Pencil className="mr-1" />Edit
                                        </button>
                                    </div>
                                    <p className="workout-active-template__meta">
                                        {(activeTemplate.days ?? []).length} planned exercise{(activeTemplate.days ?? []).length !== 1 ? 's' : ''} across the week
                                    </p>
                                    <div className="workout-day-strip" aria-label="Weekly plan">
                                        {DAY_NAMES.map((name, i) => (
                                            <span
                                                key={name}
                                                className={`workout-day-strip__chip ${
                                                    activeDays[i] > 0 ? 'workout-day-strip__chip--on' : ''
                                                } ${i === todayDayIndex ? 'workout-day-strip__chip--today' : ''}`}
                                            >
                                                <span className="workout-day-strip__day">{name.slice(0, 2)}</span>
                                                {activeDays[i] > 0 && (
                                                    <span className="workout-day-strip__count">{activeDays[i]}</span>
                                                )}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="workout-landing-footer">
                                    <button onClick={() => navigate('/Workouts/Templates')} className="btn-action workout-landing-footer__link">
                                        <Layers className="mr-1" />Manage Templates
                                        <ChevronRight className="ml-1 workout-landing-footer__chevron" />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default WorkoutsPage;