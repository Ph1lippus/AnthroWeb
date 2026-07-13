import React from 'react';
import Title from '../Components/Title';

const StudyTimerPage: React.FC = () => {
    return (
        <>
            <Title title="Study Timer" />
            <div className="page-main-with-secondary">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Study Timer</h2>
                        <span>Track your study sessions and productivity</span>
                    </div>
                </div>
            </div>
        </>
    );
};

export default StudyTimerPage;