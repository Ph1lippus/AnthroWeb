import React from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import WorkoutsNav from '../Components/Workout/WorkoutsNav';
import { useActiveTemplate, useWorkoutPlan, useWorkoutLog, useSetActiveTemplate } from '../hooks/useWorkouts';
import { Check, Pencil, Dumbbell, Plus, CircleCheck } from 'lucide-react';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const WorkoutsPage: React.FC = () => {
    const navigate = useNavigate();
    const { activeTemplate, templates } = useActiveTemplate();

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayName = DAY_NAMES[today.getDay()];

    const { data: todayExercises = [] } = useWorkoutPlan(today.getDay(), !!activeTemplate);
    const { data: todayLog } = useWorkoutLog(todayStr);
    const activateMutation = useSetActiveTemplate();

    const todayCompleted = todayLog?.completed ?? false;
    const activeTemplateId = activeTemplate?.id;

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

                        {/* Today's status */}
                        <div className="workout-status-card">
                            <div className="workout-status-card__header">
                                <h3 className="workout-status-card__title">Today: {todayName}</h3>
                                <span className={`workout-status-badge ${
                                    todayCompleted
                                        ? 'workout-status-badge--completed'
                                        : todayExercises.length > 0
                                            ? 'workout-status-badge--pending'
                                            : 'workout-status-badge--none'
                                }`}>
                                    {todayCompleted ? 'Completed' : todayExercises.length > 0 ? 'Not Started' : 'Rest Day'}
                                </span>
                            </div>
                            <div className="workout-status-card__body">
                                {todayCompleted ? (
                                    <p className="workout-status-card__text">Great job! You completed today's workout.</p>
                                ) : todayExercises.length > 0 ? (
                                    <p className="workout-status-card__text">
                                        {todayExercises.length} exercise{todayExercises.length !== 1 ? 's' : ''} scheduled for today.
                                    </p>
                                ) : (
                                    <p className="workout-status-card__text">Rest day — enjoy it!</p>
                                )}
                            </div>
                            {todayExercises.length > 0 && (
                                <button
                                    onClick={() => navigate('/Workouts/Check')}
                                    className="btn-action workout-status-card__btn"
                                >
                                    {todayCompleted ? 'Review Today' : 'Log Workout'}
                                </button>
                            )}
                        </div>

                        {/* Active template */}
                        <div className="workout-section">
                            <div className="workout-section-header">
                                <Dumbbell />
                                Active Template
                            </div>
                            {activeTemplate ? (
                                <div className="workout-template-card-active">
                                    <div className="workout-template-card-active__info">
                                        <h4 className="workout-template-card-active__name">{activeTemplate.name}</h4>
                                        {activeTemplate.description && (
                                            <p className="workout-template-card-active__description">{activeTemplate.description}</p>
                                        )}
                                        <p className="workout-template-card-active__meta">
                                            {(activeTemplate.days ?? []).length} planned exercises across the week
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => navigate(`/Workouts/Template/${activeTemplate.id}`)}
                                            className="btn-action"
                                        >
                                            <Pencil className="mr-1" />Edit Template
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="workout-empty-simple">
                                    <p className="workout-empty-simple__text">No active template yet.</p>
                                    <button onClick={() => navigate('/Workouts/Templates')} className="btn-action">
                                        <Plus className="mr-1" />Create Template
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="workout-section-header">
                            <Dumbbell />
                            Templates ({templates.length})
                        </div>
                        {templates.length === 0 ? (
                            <div className="workout-empty">
                                <Plus className="workout-empty-icon" />
                                <p className="workout-empty-title">No workout templates</p>
                                <p className="workout-empty-text">Build a weekly routine and we'll show today's plan here.</p>
                                <button onClick={() => navigate('/Workouts/Templates')} className="btn-action">
                                    <Plus className="mr-1" />Create Template
                                </button>
                            </div>
                        ) : (
                            <div className="workout-templates-list">
                                {templates.map(template => (
                                    <div key={template.id} className="workout-template-item">
                                        <div className="workout-template-item__info">
                                            <h4 className="workout-template-item__name">
                                                {template.name}
                                                {(template.days ?? []).length > 0 && (
                                                    <span className="workout-template-item__count">
                                                        {(template.days ?? []).length} exercises
                                                    </span>
                                                )}
                                            </h4>
                                        </div>
                                        <div className="workout-template-item__actions">
                                            {template.id !== activeTemplateId ? (
                                                <button
                                                    onClick={() => template.id && activateMutation.mutate(template.id)}
                                                    className="workout-template-item__btn workout-template-item__btn--activate"
                                                >
                                                    <Check className="mr-1" />Activate
                                                </button>
                                            ) : (
                                                <span className="workout-template-item__active-label">
                                                    <CircleCheck className="mr-1" />Current
                                                </span>
                                            )}
                                            <button
                                                onClick={() => navigate(`/Workouts/Template/${template.id}`)}
                                                className="workout-template-item__btn workout-template-item__btn--edit"
                                            >
                                                <Pencil className="mr-1" />Edit
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default WorkoutsPage;