import React from 'react';
import Title from '../Components/Title';

const SettingsPage: React.FC = () => {
    return (
        <>
            <Title title="Settings" />
            <div className="page-main-with-secondary">
                <div className="dashboard-section">
                    <div className="dashboard-section__head">
                        <h2>Settings</h2>
                        <span>Manage your account preferences and configuration</span>
                    </div>
                </div>
            </div>
        </>
    );
};

export default SettingsPage;