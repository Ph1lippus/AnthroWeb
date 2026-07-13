import React from 'react';
import Title from '../Components/Title';

const WorkoutsPage: React.FC = () => {
    return (
        <>
            <Title title="Workouts" />
            <div className="page-main-with-secondary">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Workouts</h2>
                        <span>Manage your workout routines and progress</span>
                    </div>
                </div>
            </div>
        </>
    );
};

export default WorkoutsPage;