import React from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import { User, Target, Weight, Smartphone, LogOut, ChevronRight } from 'lucide-react';

const SettingsPage: React.FC = () => {
    const navigate = useNavigate();

    const settingsItems = [
        {
            title: 'Profile',
            description: 'Edit your personal information and avatar',
            icon: <User />,
            action: () => navigate('/profile/edit')
        },
        {
            title: 'Daily Log Goals',
            description: 'Configure your nutrition, sleep, and fitness goals',
            icon: <Target />,
            action: () => navigate('/Daily-Log/Setup')
        },
        {
            title: 'Measurements',
            description: 'Track your weight, body fat, and progress',
            icon: <Weight />,
            action: () => navigate('/Measurements')
        },
        {
            title: 'App',
            description: 'Version, updates, and installation',
            icon: <Smartphone />,
            action: () => navigate('/Settings/App')
        },
        {
            title: 'Account',
            description: 'Email and sign out',
            icon: <LogOut />,
            action: () => navigate('/Settings/Account')
        }
    ];

    return (
        <>
            <Title title="Settings" />
            <div className="page-main-with-secondary">
                <div className="settings-container">
                    <div className="settings-list">
                        {settingsItems.map((item, index) => (
                            <button
                                key={index}
                                onClick={item.action}
                                className="settings-item"
                            >
                                {item.icon}
                                <div className="settings-item-content">
                                    <span className="settings-item-title">{item.title}</span>
                                    <span className="settings-item-description">{item.description}</span>
                                </div>
                                <div className="settings-item-arrow">
                                    <ChevronRight />
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
};

export default SettingsPage;