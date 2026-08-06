import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import { useWorkoutStore } from '../stores/useWorkoutStore';

const WorkoutsPage: React.FC = () => {
    const navigate = useNavigate();
    const { 
        loading, 
        activeTemplate, 
        todayExercises, 
        templates, 
        fetchActiveTemplate, 
        fetchTodayExercises, 
        fetchTemplates, 
        setActiveTemplate: activateTemplate,
        checkWorkoutCompleted
    } = useWorkoutStore();
    
    const [todayCompleted, setTodayCompleted] = useState(false);

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[today.getDay()];

    useEffect(() => {
        const loadData = async () => {
            try {
                await Promise.all([
                    fetchActiveTemplate(),
                    fetchTodayExercises(),
                    fetchTemplates()
                ]);
                
                const completed = await checkWorkoutCompleted(todayStr);
                setTodayCompleted(completed);
            } catch (error) {
                console.error('Error loading workout data:', error);
            }
        };

        loadData();
    }, [todayStr, fetchActiveTemplate, fetchTodayExercises, fetchTemplates, checkWorkoutCompleted]);

    const handleActivateTemplate = async (templateId: string) => {
        try {
            await activateTemplate(templateId);
        } catch (error) {
            console.error('Error activating template:', error);
        }
    };

    return (
        <>
            <Title title="Workouts" />
            <div className="books-page-wrapper">
                <div className="dashboard-section workout-section">
                    <div className="workout-card">
                        {/* Top Bar */}
                        <div className="workout-top-bar">
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => navigate('/Workouts/Check')} className="btn-action">
                                    <i className="fa-solid fa-clipboard-check mr-1"></i>Log Workout
                                </button>
                                <button onClick={() => navigate('/Workouts/Templates')} className="btn-action">
                                    <i className="fa-solid fa-layer-group mr-1"></i>Templates
                                </button>
                                <button onClick={() => navigate('/Workouts/History')} className="btn-action">
                                    <i className="fa-solid fa-clock-rotate-left mr-1"></i>History
                                </button>
                                <button onClick={() => navigate('/Workouts/PRs')} className="btn-action">
                                    <i className="fa-solid fa-trophy mr-1"></i>PRs
                                </button>
                            </div>
                        </div>

                        {/* Workout Content */}
                        {loading ? (
                            <div className="profile-loading">
                                <div className="profile-loading-spinner"></div>
                                <p>Loading workout...</p>
                            </div>
                        ) : (
                            <div className="workout-main-content">
                                {/* Today's Status Card */}
                                <div className="workout-status-card">
                                    <div className="workout-status-card__header">
                                        <h3 className="workout-status-card__title">Today: {todayName}</h3>
                                        <span className={`workout-status-badge ${todayCompleted ? 'workout-status-badge--completed' : todayExercises.length > 0 ? 'workout-status-badge--pending' : 'workout-status-badge--none'}`}>
                                            {todayCompleted ? 'Completed' : todayExercises.length > 0 ? 'Not Started' : 'No Workout'}
                                        </span>
                                    </div>
                                    <div className="workout-status-card__body">
                                        {todayCompleted ? (
                                            <p className="workout-status-card__text">Great job! You completed today's workout. 💪</p>
                                        ) : todayExercises.length > 0 ? (
                                            <p className="workout-status-card__text">You have a workout scheduled for today. Click "Log Workout" to track your progress.</p>
                                        ) : (
                                            <p className="workout-status-card__text">No workout scheduled for today. Enjoy your rest day or set up a workout template.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Active Template Section */}
                                <div className="workout-section">
                                    <div className="workout-section-header">
                                        <i className="fa-solid fa-layer-group"></i>
                                        Active Template
                                    </div>
                                    {activeTemplate ? (
                                        <div className="workout-template-card-active">
                                            <div className="workout-template-card-active__info">
                                                <h4 className="workout-template-card-active__name">{activeTemplate.name}</h4>
                                                {activeTemplate.description && (
                                                    <p className="workout-template-card-active__description">{activeTemplate.description}</p>
                                                )}
                                            </div>
                                            <div className="workout-template-card-active__status">
                                                <span className="workout-template-card-active__badge">Active</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="workout-empty-simple">
                                            <p className="workout-empty-simple__text">No active template. Select one below to activate.</p>
                                        </div>
                                    )}
                                </div>

                                {/* Templates List */}
                                {templates.length > 0 && (
                                    <div className="workout-section">
                                        <div className="workout-section-header">
                                            <i className="fa-solid fa-dumbbell"></i>
                                            All Templates ({templates.length})
                                        </div>
                                        <div className="workout-templates-list">
                                            {templates.map((template) => (
                                                <div key={template.id} className="workout-template-item">
                                                    <div className="workout-template-item__info">
                                                        <h4 className="workout-template-item__name">{template.name}</h4>
                                                        {template.description && (
                                                            <p className="workout-template-item__description">{template.description}</p>
                                                        )}
                                                    </div>
                                                    <div className="workout-template-item__actions">
                                                        {activeTemplate?.id !== template.id ? (
                                                            <button
                                                                onClick={() => handleActivateTemplate(template.id!)}
                                                                className="workout-template-item__btn workout-template-item__btn--activate"
                                                            >
                                                                <i className="fa-solid fa-check mr-1"></i>Activate
                                                            </button>
                                                        ) : (
                                                            <span className="workout-template-item__active-label">Current</span>
                                                        )}
                                                        <button
                                                            onClick={() => navigate(`/Workouts/Template/${template.id}`)}
                                                            className="workout-template-item__btn workout-template-item__btn--edit"
                                                        >
                                                            <i className="fa-solid fa-pen mr-1"></i>Edit
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {templates.length === 0 && (
                                    <div className="workout-empty">
                                        <i className="fa-solid fa-dumbbell workout-empty-icon"></i>
                                        <p className="workout-empty-title">No workout templates</p>
                                        <p className="workout-empty-text">Create your first workout template to start tracking your exercises.</p>
                                        <button onClick={() => navigate('/Workouts/Templates')} className="btn-action">
                                            <i className="fa-solid fa-plus mr-1"></i>Create Template
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default WorkoutsPage;