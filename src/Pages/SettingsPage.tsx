import React from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';

const SettingsPage: React.FC = () => {
    const navigate = useNavigate();

    const settingsItems = [
        {
            title: 'Profile',
            description: 'Edit your personal information and avatar',
            icon: 'fa-solid fa-user',
            action: () => navigate('/profile/edit')
        },
        {
            title: 'Daily Log Goals',
            description: 'Configure your nutrition, sleep, and fitness goals',
            icon: 'fa-solid fa-bullseye',
            action: () => navigate('/Daily-Log/Setup')
        },
        {
            title: 'Measurements',
            description: 'Track your weight, body fat, and progress',
            icon: 'fa-solid fa-weight-scale',
            action: () => navigate('/Measurements')
        },
        {
            title: 'Account',
            description: 'Sign out of your account',
            icon: 'fa-solid fa-right-from-bracket',
            action: async () => {
                const { signOutUser } = await import('../services/profileService');
                await signOutUser();
                navigate('/login');
            }
        }
    ];

    return (
        <>
            <Title title="Settings" />
            <div className="page-main-with-secondary">
                <div className="settings-container">
                    <div className="settings-header">
                        <h1 className="settings-title">Settings</h1>
                        <p className="settings-subtitle">Manage your account and preferences</p>
                    </div>

                    <div className="settings-list">
                        {settingsItems.map((item, index) => (
                            <button 
                                key={index} 
                                onClick={item.action}
                                className="settings-item"
                            >
                                <div className="settings-item-icon">
                                    <i className={item.icon}></i>
                                </div>
                                <div className="settings-item-content">
                                    <span className="settings-item-title">{item.title}</span>
                                    <span className="settings-item-description">{item.description}</span>
                                </div>
                                <div className="settings-item-arrow">
                                    <i className="fa-solid fa-chevron-right"></i>
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="settings-footer">
                        <p className="settings-version">AnthroWeb v1.0</p>
                    </div>
                </div>
            </div>
        </>
    );
};

export default SettingsPage;
