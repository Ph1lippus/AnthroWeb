import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { getCurrentUser, getUserSettings, signOutUser, getLatestBodyMeasurements } from '../services/profileService';
import Title from '../Components/Title';

interface UserSettingsData {
    gender: string | null;
    height_cm: number | null;
    date_of_birth: string | null;
    goal: string | null;
    starting_weight: number | null;
    starting_weight_date: string | null;
    starting_bodyfat: number | null;
    starting_bodyfat_date: string | null;
    target_weight: number | null;
    target_bodyfat: number | null;
}

interface LatestMeasurements {
    weight: number | null;
    body_fat: number | null;
    log_date: string | null;
}

const ProfilePage: React.FC = () => {
    const navigate = useNavigate();
    const [userEmail, setUserEmail] = useState<string>('');
    const [settings, setSettings] = useState<UserSettingsData | null>(null);
    const [latestMeasurements, setLatestMeasurements] = useState<LatestMeasurements | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadProfile = async () => {
            const user = await getCurrentUser();
            if (!user) {
                navigate('/login');
                return;
            }
            setUserEmail(user.email || '');
            
            const userSettings = await getUserSettings();
            if (userSettings) {
                setSettings(userSettings as UserSettingsData);
            }
            
            const latestMeas = await getLatestBodyMeasurements();
            if (latestMeas) {
                setLatestMeasurements(latestMeas as LatestMeasurements);
            }
            
            setLoading(false);
        };
        void loadProfile();
    }, [navigate]);

    const calculateAge = (dateOfBirth: string | null): number | null => {
        if (!dateOfBirth) return null;
        const birthDate = new Date(dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    };

    const calculateProgress = () => {
        if (!settings?.goal || settings.goal === 'maintain' || !latestMeasurements) {
            return { weightProgress: 0, bodyFatProgress: 0, overallProgress: 0 };
        }

        let weightProgress = 0;
        let bodyFatProgress = 0;

        if (settings.starting_weight && settings.target_weight && latestMeasurements.weight) {
            const totalToLose = settings.starting_weight - settings.target_weight;
            const lostSoFar = settings.starting_weight - latestMeasurements.weight;
            weightProgress = Math.min(100, Math.max(0, (lostSoFar / totalToLose) * 100));
        }

        if (settings.starting_bodyfat && settings.target_bodyfat && latestMeasurements.body_fat) {
            const totalToLose = settings.starting_bodyfat - settings.target_bodyfat;
            const lostSoFar = settings.starting_bodyfat - latestMeasurements.body_fat;
            bodyFatProgress = Math.min(100, Math.max(0, (lostSoFar / totalToLose) * 100));
        }

        const overallProgress = (weightProgress + bodyFatProgress) / 2;
        return { weightProgress, bodyFatProgress, overallProgress };
    };

    const handleSignOut = async () => {
        try {
            await signOutUser();
            navigate('/login');
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    const getGenderDisplay = (gender: string | null | undefined): string => {
        if (!gender) return 'Not set';
        const genderMap: Record<string, string> = {
            male: 'Male',
            female: 'Female',
            other: 'Other',
            prefer_not_to_say: 'Prefer not to say'
        };
        return genderMap[gender] || 'Not set';
    };

    const getGoalDisplay = (goal: string | null | undefined): string => {
        if (!goal) return 'Not set';
        const goalMap: Record<string, string> = {
            maintain: 'Maintain weight',
            lose: 'Lose weight',
            gain: 'Gain weight'
        };
        return goalMap[goal] || 'Not set';
    };

    if (loading) {
        return (
            <>
                <Title title="Profile" />
                <div className="page-main-with-secondary">
                    <div className="dashboard-section">
                        <div className="dashboard-section__head">
                            <h2>Profile</h2>
                            <span>Loading...</span>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    const progress = calculateProgress();

    return (
        <>
            <Title title="Profile" />
            <div className="page-main-with-secondary">
                <div className="profile-card">
                    <div className="profile-header">
                        <h2>Profile</h2>
                        <Link to="/profile/edit" className="profile-edit-btn">
                            <i className="fa-solid fa-pen"></i> Edit Profile
                        </Link>
                    </div>
                    
                    <div className="profile-content">
                        {/* User Section */}
                        <div className="profile-section">
                            <h3 className="profile-section-title">User</h3>
                            <div className="profile-field">
                                <span className="profile-field-label">Email:</span>
                                <span className="profile-field-value">{userEmail}</span>
                            </div>
                        </div>

                        {/* Body Stats Section */}
                        <div className="profile-section">
                            <h3 className="profile-section-title">Body Stats</h3>
                            <div className="profile-field">
                                <span className="profile-field-label">Gender:</span>
                                <span className="profile-field-value">{getGenderDisplay(settings?.gender)}</span>
                            </div>
                            <div className="profile-field">
                                <span className="profile-field-label">Height:</span>
                                <span className="profile-field-value">{settings?.height_cm ? `${settings.height_cm} cm` : 'Not set'}</span>
                            </div>
                            <div className="profile-field">
                                <span className="profile-field-label">Date of Birth:</span>
                                <span className="profile-field-value">{settings?.date_of_birth || 'Not set'}</span>
                            </div>
                            {settings?.date_of_birth && (
                                <div className="profile-field">
                                    <span className="profile-field-label">Age:</span>
                                    <span className="profile-field-value">{calculateAge(settings.date_of_birth)} years</span>
                                </div>
                            )}
                        </div>

                        {/* Goals Section */}
                        <div className="profile-section">
                            <h3 className="profile-section-title">Goals</h3>
                            <div className="profile-field">
                                <span className="profile-field-label">Goal:</span>
                                <span className="profile-field-value">{getGoalDisplay(settings?.goal)}</span>
                            </div>
                            {settings?.starting_weight && (
                                <div className="profile-field">
                                    <span className="profile-field-label">Starting Weight:</span>
                                    <span className="profile-field-value">
                                        {settings.starting_weight} kg ({settings.starting_weight_date || 'Date not set'})
                                    </span>
                                </div>
                            )}
                            {settings?.target_weight && (
                                <div className="profile-field">
                                    <span className="profile-field-label">Target Weight:</span>
                                    <span className="profile-field-value">{settings.target_weight} kg</span>
                                </div>
                            )}
                            {settings?.starting_bodyfat && (
                                <div className="profile-field">
                                    <span className="profile-field-label">Starting Body Fat:</span>
                                    <span className="profile-field-value">
                                        {settings.starting_bodyfat}% ({settings.starting_bodyfat_date || 'Date not set'})
                                    </span>
                                </div>
                            )}
                            {settings?.target_bodyfat && (
                                <div className="profile-field">
                                    <span className="profile-field-label">Target Body Fat:</span>
                                    <span className="profile-field-value">{settings.target_bodyfat}%</span>
                                </div>
                            )}
                        </div>

                        {/* Progress Summary Section */}
                        {settings?.goal && settings.goal !== 'maintain' && settings.starting_weight && settings.target_weight && latestMeasurements?.weight && (
                            <div className="profile-section">
                                <h3 className="profile-section-title">Progress Summary</h3>
                                <div className="profile-field">
                                    <span className="profile-field-label">Weight Loss:</span>
                                    <span className="profile-field-value">
                                        {settings.starting_weight - latestMeasurements.weight} kg / {settings.starting_weight - settings.target_weight} kg
                                    </span>
                                </div>
                                {settings.starting_bodyfat && settings.target_bodyfat && latestMeasurements.body_fat && (
                                    <div className="profile-field">
                                        <span className="profile-field-label">Body Fat Loss:</span>
                                        <span className="profile-field-value">
                                            {settings.starting_bodyfat - latestMeasurements.body_fat}% / {settings.starting_bodyfat - settings.target_bodyfat}%
                                        </span>
                                    </div>
                                )}
                                <div className="profile-field">
                                    <span className="profile-field-label">Progress:</span>
                                    <span className="profile-field-value">{Math.round(progress.overallProgress)}%</span>
                                </div>
                            </div>
                        )}

                        {/* Sign Out Button */}
                        <button 
                            onClick={handleSignOut}
                            className="btn btn-secondary w-100 mt-3"
                            style={{ background: 'rgba(219, 34, 42, 0.12)', border: '1px solid rgba(219, 34, 42, 0.4)', color: '#ff6b70' }}
                        >
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ProfilePage;