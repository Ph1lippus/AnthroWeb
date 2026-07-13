import React from 'react';
import Title from '../Components/Title';

const DashboardPage: React.FC = () => {
    return (
        <>
            <Title title="Dashboard" />
            <div className="page-main-with-secondary">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Dashboard</h2>
                        <span>Welcome to your personal dashboard</span>
                    </div>
                </div>
            </div>
        </>
    );
};

export default DashboardPage;