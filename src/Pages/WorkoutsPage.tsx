import React from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';

const WorkoutsPage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <>
            <Title title="Workouts" />
            <div className="page-main-with-secondary">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Workouts</h2>
                        <span>Manage your workout routines and progress</span>
                    </div>
                    
                    <div className="workouts-main-actions">
                        <button onClick={() => navigate('/Workouts/Check')} className="btn-primary">
                            <i className="fa-solid fa-clipboard-check mr-1"></i>
                            Check Today's Workout
                        </button>
                    </div>
                    
                    <div className="empty-state">
                        <i className="fa-solid fa-dumbbell"></i>
                        <h3>Workout Management</h3>
                        <p>Create and manage your workout templates. Set up exercises for each day of the week to track your progress.</p>
                        <div className="workout-features">
                            <div className="feature-card">
                                <i className="fa-solid fa-calendar-days"></i>
                                <h4>Daily Templates</h4>
                                <p>Set up different workouts for each day of the week</p>
                            </div>
                            <div className="feature-card">
                                <i className="fa-solid fa-chart-line"></i>
                                <h4>Track Progress</h4>
                                <p>Log your sets, reps, and weight for each exercise</p>
                            </div>
                            <div className="feature-card">
                                <i className="fa-solid fa-trophy"></i>
                                <h4>PR Tracking</h4>
                                <p>Automatically detect and save personal records</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default WorkoutsPage;