import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { getUserSettings, signOutUser, getLatestBodyMeasurements } from '../services/profileService';
import { supabase } from '../services/supabaseClient';
import Title from '../Components/Title';

interface UserSettingsData {
    gender: string | null;
    height_cm: number | null;
    date_of_birth: string | null;
    goal: string | null;
    starting_weight: number | null;
    last_measurement_date: string | null;
    starting_bodyfat: number | null;
    target_weight: number | null;
    target_bodyfat: number | null;
    active_goals?: {
        nutrition?: {
            calories?: number | null;
            protein?: number | null;
            carbs?: number | null;
            fat?: number | null;
            water?: number | null;
        };
        sleep?: {
            hours?: number | null;
            wake_time?: string | null;
            bedtime?: string | null;
        };
    } | null;
}

interface LatestMeasurements {
    weight: number | null;
    body_fat: number | null;
    log_date: string | null;
}

const ProfilePage: React.FC = () => {
    const navigate = useNavigate();
    const [userEmail, setUserEmail] = useState<string>('');
    const [username, setUsername] = useState<string>('');
    const [settings, setSettings] = useState<UserSettingsData | null>(null);
    const [latestMeasurements, setLatestMeasurements] = useState<LatestMeasurements | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate('/login');
                return;
            }
            setUserEmail(user.email || '');
            setUsername(user.user_metadata?.username || userEmail.split('@')[0] || 'User');
            
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
    }, [navigate, userEmail]);

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
                    <div className="profile-loading">
                        <div className="profile-loading-spinner"></div>
                        <p>Loading profile...</p>
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
                <div className="profile-card-modern">
                    <div className="profile-header-modern">
                        <h2 className="profile-name">{username}</h2>
                        <p className="profile-email">{userEmail}</p>
                        <Link to="/profile/edit" className="profile-edit-btn-modern">
                            <i className="fa-solid fa-pen"></i>
                        </Link>
                    </div>

                    <div className="profile-content-modern">
                        {/* Body Stats Section */}
                        <div className="profile-section-modern">
                            <h3 className="profile-section-title-modern">
                                <i className="fa-solid fa-user"></i> Body Stats
                            </h3>
                            <div className="profile-grid">
                                <div className="profile-item">
                                    <span className="profile-item-label">Gender</span>
                                    <span className="profile-item-value">{getGenderDisplay(settings?.gender)}</span>
                                </div>
                                <div className="profile-item">
                                    <span className="profile-item-label">Height</span>
                                    <span className="profile-item-value">{settings?.height_cm ? `${settings.height_cm} cm` : 'Not set'}</span>
                                </div>
                                <div className="profile-item">
                                    <span className="profile-item-label">Date of Birth</span>
                                    <span className="profile-item-value">{settings?.date_of_birth || 'Not set'}</span>
                                </div>
                                {settings?.date_of_birth && (
                                    <div className="profile-item">
                                        <span className="profile-item-label">Age</span>
                                        <span className="profile-item-value">{calculateAge(settings.date_of_birth)} years</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Goals Section */}
                        <div className="profile-section-modern">
                            <h3 className="profile-section-title-modern">
                                <i className="fa-solid fa-bullseye"></i> Goals
                            </h3>
                            <div className="profile-grid">
                                <div className="profile-item">
                                    <span className="profile-item-label">Goal</span>
                                    <span className="profile-item-value">{getGoalDisplay(settings?.goal)}</span>
                                </div>
                                {settings?.target_weight && (
                                    <div className="profile-item">
                                        <span className="profile-item-label">Target Weight</span>
                                        <span className="profile-item-value">{settings.target_weight} kg</span>
                                    </div>
                                )}
                                {settings?.target_bodyfat && (
                                    <div className="profile-item">
                                        <span className="profile-item-label">Target Body Fat</span>
                                        <span className="profile-item-value">{settings.target_bodyfat}%</span>
                                    </div>
                                )}
                                {settings?.active_goals?.nutrition && (
                                    <div className="profile-item">
                                        <span className="profile-item-label">Daily Calories</span>
                                        <span className="profile-item-value">{settings.active_goals.nutrition.calories ?? 'Not set'}</span>
                                    </div>
                                )}
                                {settings?.active_goals?.sleep?.hours != null && (
                                    <div className="profile-item">
                                        <span className="profile-item-label">Sleep Goal</span>
                                        <span className="profile-item-value">{settings.active_goals.sleep.hours} hrs</span>
                                    </div>
                                )}
                            </div>
                            <div style={{ marginTop: '1rem' }}>
                                <button 
                                    onClick={() => navigate('/Daily-Log/Setup')}
                                    className="btn btn-primary w-100"
                                >
                                    <i className="fa-solid fa-pen" style={{ marginRight: '0.5rem' }}></i>
                                    Edit Goals
                                </button>
                            </div>
                        </div>

                        {/* Starting Measurements Section */}
                        <div className="profile-section-modern">
                            <h3 className="profile-section-title-modern">
                                <i className="fa-solid fa-weight-scale"></i> Starting Measurements
                            </h3>
                            <div className="profile-grid">
                                {settings?.starting_weight && (
                                    <div className="profile-item">
                                        <span className="profile-item-label">Starting Weight</span>
                                        <span className="profile-item-value">
                                            {settings.starting_weight} kg
                                            {settings.starting_bodyfat && (
                                                <><br/><span className="profile-item-label">Starting BF</span> {settings.starting_bodyfat}%</>
                                            )}
                                            {settings.last_measurement_date && (
                                                <><br/><span className="profile-item-label">Date</span> {settings.last_measurement_date}</>
                                            )}
                                        </span>
                                    </div>
                                )}
                                {!settings?.starting_weight && settings?.starting_bodyfat && (
                                    <div className="profile-item">
                                        <span className="profile-item-label">Starting Body Fat</span>
                                        <span className="profile-item-value">
                                            {settings.starting_bodyfat}%
                                        </span>
                                    </div>
                                )}
                                {!settings?.starting_weight && settings?.last_measurement_date && (
                                    <div className="profile-item">
                                        <span className="profile-item-label">Last Measurement Date</span>
                                        <span className="profile-item-value">{settings.last_measurement_date}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Progress Summary Section */}
                        {settings?.goal && settings.goal !== 'maintain' && settings.starting_weight && settings.target_weight && latestMeasurements?.weight && (
                            <div className="profile-section-modern">
                                <h3 className="profile-section-title-modern">
                                    <i className="fa-solid fa-chart-line"></i> Progress
                                </h3>
                                <div className="profile-progress">
                                    <div className="progress-bar-container">
                                        <div className="progress-bar">
                                            <div className="progress-fill" style={{ width: `${Math.round(progress.overallProgress)}%` }}></div>
                                        </div>
                                        <span className="progress-text">{Math.round(progress.overallProgress)}%</span>
                                    </div>
                                    {settings.starting_weight && settings.target_weight && (
                                        <div className="progress-details">
                                            <div className="progress-detail">
                                                <span className="progress-detail-label">Weight:</span>
                                                <span className="progress-detail-value">
                                                    {Math.abs(settings.starting_weight - latestMeasurements.weight).toFixed(1)} kg / {Math.abs(settings.starting_weight - settings.target_weight).toFixed(1)} kg
                                                </span>
                                            </div>
                                            {settings.starting_bodyfat && settings.target_bodyfat && latestMeasurements.body_fat && (
                                                <div className="progress-detail">
                                                    <span className="progress-detail-label">Body Fat:</span>
                                                    <span className="progress-detail-value">
                                                        {Math.abs(settings.starting_bodyfat - latestMeasurements.body_fat).toFixed(1)}% / {Math.abs(settings.starting_bodyfat - settings.target_bodyfat).toFixed(1)}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <button 
                        onClick={handleSignOut}
                        className="profile-signout-btn"
                    >
                        <i className="fa-solid fa-right-from-bracket"></i> Sign Out
                    </button>
                </div>
            </div>
        </>
    );
};

export default ProfilePage;