import React from 'react';
import Title from '../Components/Title';

const DailyLogPage: React.FC = () => {
    return (
        <>
            <Title title="Daily Log" />
            <div className="page-main-with-secondary">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Daily Log</h2>
                        <span>Track your daily activities and habits</span>
                    </div>
                </div>
            </div>
        </>
    );
};

export default DailyLogPage;