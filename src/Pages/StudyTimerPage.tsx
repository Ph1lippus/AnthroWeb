import React from 'react';
import Title from '../Components/Title';

const StudyTimerPage: React.FC = () => {
    return (
        <>
            <Title title="Study Timer" />
            <div className="page-main-with-secondary">
                <div className="dashboard-section">
                    <div className="dashboard-section__subtitle">
                        Track your study sessions and productivity
                    </div>
                </div>
            </div>
        </>
    );
};

export default StudyTimerPage;