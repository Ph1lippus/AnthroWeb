import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { getUserSettings, signOutUser, getLatestBodyMeasurements } from '../services/profileService';
import { getDailyLogByDate } from '../services/dailyLogService';
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
    const [latestLog, setLatestLog] = useState<any>(null);
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

            const today = new Date().toISOString().split('T')[0];
            const log = await getDailyLogByDate(today);
            if (log) {
                setLatestLog(log);
            }

            setLoading(false);
        };
        void loadProfile();
    }, [navigate, userEmail]);

    const calculateAge = (dateOfBirth: string | null | undefined): number | null => {
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
    const age = calculateAge(settings?.date_of_birth);

    return (
        <>
            <Title title="Profile" />
            <div className="page-main-with-secondary">
                <div className="profile-container">
                    {/* Profile Header */}
                    <div className="profile-header">
                        <div className="profile-avatar">
                            {username.charAt(0).toUpperCase()}
                        </div>
                        <div className="profile-header-info">
                            <h1 className="profile-name">{username}</h1>
                            <p className="profile-email">{userEmail}</p>
                        </div>
                        <Link to="/profile/edit" className="profile-edit-btn">
                            <i className="fa-solid fa-pen"></i>
                        </Link>
                    </div>

                    {/* Quick Stats */}
                    <div className="profile-stats">
                        <div className="profile-stat-card">
                            <div className="profile-stat-icon">
                                <i className="fa-solid fa-ruler-vertical"></i>
                            </div>
                            <div className="profile-stat-content">
                                <span className="profile-stat-label">Height</span>
                                <span className="profile-stat-value">{settings?.height_cm ? `${settings.height_cm} cm` : 'Not set'}</span>
                            </div>
                        </div>
                        <div className="profile-stat-card">
                            <div className="profile-stat-icon">
                                <i className="fa-solid fa-cake-candles"></i>
                            </div>
                            <div className="profile-stat-content">
                                <span className="profile-stat-label">Age</span>
                                <span className="profile-stat-value">{age ? `${age} years` : 'Not set'}</span>
                            </div>
                        </div>
                        <div className="profile-stat-card">
                            <div className="profile-stat-icon">
                                <i className="fa-solid fa-bullseye"></i>
                            </div>
                            <div className="profile-stat-content">
                                <span className="profile-stat-label">Goal</span>
                                <span className="profile-stat-value">{getGoalDisplay(settings?.goal)}</span>
                            </div>
                        </div>
                        <div className="profile-stat-card">
                            <div className="profile-stat-icon">
                                <i className="fa-solid fa-weight-scale"></i>
                            </div>
                            <div className="profile-stat-content">
                                <span className="profile-stat-label">Latest Weight</span>
                                <span className="profile-stat-value">{latestMeasurements?.weight ? `${latestMeasurements.weight} kg` : 'Not logged'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Progress Section */}
                    {settings?.goal && settings.goal !== 'maintain' && settings.starting_weight && settings.target_weight && (
                        <div className="profile-section">
                            <h2 className="profile-section-title">Progress</h2>
                            <div className="profile-progress-card">
                                <div className="profile-progress-header">
                                    <span className="profile-progress-label">Overall Progress</span>
                                    <span className="profile-progress-value">{Math.round(progress.overallProgress)}%</span>
                                </div>
                                <div className="profile-progress-bar">
                                    <div className="profile-progress-fill" style={{ width: `${Math.round(progress.overallProgress)}%` }}></div>
                                </div>
                                <div className="profile-progress-details">
                                    {settings.starting_weight && settings.target_weight && latestMeasurements?.weight && (
                                        <div className="profile-progress-detail">
                                            <span>Weight: {Math.abs(settings.starting_weight - latestMeasurements.weight).toFixed(1)} kg / {Math.abs(settings.starting_weight - settings.target_weight).toFixed(1)} kg</span>
                                        </div>
                                    )}
                                    {settings.starting_bodyfat && settings.target_bodyfat && latestMeasurements?.body_fat && (
                                        <div className="profile-progress-detail">
                                            <span>Body Fat: {Math.abs(settings.starting_bodyfat - latestMeasurements.body_fat).toFixed(1)}% / {Math.abs(settings.starting_bodyfat - settings.target_bodyfat).toFixed(1)}%</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Body Stats Section */}
                    <div className="profile-section">
                        <h2 className="profile-section-title">Body Stats</h2>
                        <div className="profile-info-grid">
                            <div className="profile-info-item">
                                <span className="profile-info-label">Gender</span>
                                <span className="profile-info-value">{getGenderDisplay(settings?.gender)}</span>
                            </div>
                            <div className="profile-info-item">
                                <span className="profile-info-label">Height</span>
                                <span className="profile-info-value">{settings?.height_cm ? `${settings.height_cm} cm` : 'Not set'}</span>
                            </div>
                            <div className="profile-info-item">
                                <span className="profile-info-label">Date of Birth</span>
                                <span className="profile-info-value">{settings?.date_of_birth || 'Not set'}</span>
                            </div>
                            {settings?.date_of_birth && age && (
                                <div className="profile-info-item">
                                    <span className="profile-info-label">Age</span>
                                    <span className="profile-info-value">{age} years</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Goals Section */}
                    <div className="profile-section">
                        <h2 className="profile-section-title">Goals</h2>
                        <div className="profile-info-grid">
                            <div className="profile-info-item">
                                <span className="profile-info-label">Goal</span>
                                <span className="profile-info-value">{getGoalDisplay(settings?.goal)}</span>
                            </div>
                            {settings?.target_weight && (
                                <div className="profile-info-item">
                                    <span className="profile-info-label">Target Weight</span>
                                    <span className="profile-info-value">{settings.target_weight} kg</span>
                                </div>
                            )}
                            {settings?.target_bodyfat && (
                                <div className="profile-info-item">
                                    <span className="profile-info-label">Target Body Fat</span>
                                    <span className="profile-info-value">{settings.target_bodyfat}%</span>
                                </div>
                            )}
                            {settings?.active_goals?.nutrition?.calories != null && (
                                <div className="profile-info-item">
                                    <span className="profile-info-label">Daily Calories</span>
                                    <span className="profile-info-value">{settings.active_goals.nutrition.calories}</span>
                                </div>
                            )}
                            {settings?.active_goals?.sleep?.hours != null && (
                                <div className="profile-info-item">
                                    <span className="profile-info-label">Sleep Goal</span>
                                    <span className="profile-info-value">{settings.active_goals.sleep.hours} hrs</span>
                                </div>
                            )}
                        </div>
                        <div className="profile-section-actions">
                            <button 
                                onClick={() => navigate('/Daily-Log/Setup')}
                                className="profile-btn profile-btn-primary"
                            >
                                <i className="fa-solid fa-pen"></i>
                                Edit Goals
                            </button>
                        </div>
                    </div>

                    {/* Starting Measurements */}
                    <div className="profile-section">
                        <h2 className="profile-section-title">Starting Measurements</h2>
                        <div className="profile-info-grid">
                            {settings?.starting_weight && (
                                <div className="profile-info-item">
                                    <span className="profile-info-label">Starting Weight</span>
                                    <span className="profile-info-value">
                                        {settings.starting_weight} kg
                                        {settings.starting_bodyfat && (
                                            <span className="profile-info-sub"> • BF: {settings.starting_bodyfat}%</span>
                                        )}
                                        {settings.last_measurement_date && (
                                            <span className="profile-info-sub"> • {settings.last_measurement_date}</span>
                                        )}
                                    </span>
                                </div>
                            )}
                            {!settings?.starting_weight && settings?.starting_bodyfat && (
                                <div className="profile-info-item">
                                    <span className="profile-info-label">Starting Body Fat</span>
                                    <span className="profile-info-value">{settings.starting_bodyfat}%</span>
                                </div>
                            )}
                            {!settings?.starting_weight && settings?.last_measurement_date && (
                                <div className="profile-info-item">
                                    <span className="profile-info-label">Last Measurement</span>
                                    <span className="profile-info-value">{settings.last_measurement_date}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Recent Activity */}
                    {latestLog && (
                        <div className="profile-section">
                            <h2 className="profile-section-title">Recent Activity</h2>
                            <div className="profile-activity-card">
                                <div className="profile-activity-header">
                                    <span className="profile-activity-date">
                                        <i className="fa-regular fa-calendar"></i>
                                        {new Date(latestLog.log_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                    </span>
                                    {latestLog.daily_score != null && (
                                        <span className="profile-activity-score">{latestLog.daily_score}/100</span>
                                    )}
                                </div>
                                <div className="profile-activity-body">
                                    {latestLog.sleep_duration && <span>Sleep: {latestLog.sleep_duration}h</span>}
                                    {latestLog.calories && <span>Calories: {latestLog.calories}</span>}
                                    {latestLog.weight && <span>Weight: {latestLog.weight}kg</span>}
                                    {latestLog.mood && <span>Mood: {latestLog.mood}/10</span>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="profile-actions">
                        <button 
                            onClick={() => navigate('/Daily-Log/History')}
                            className="profile-btn profile-btn-secondary"
                        >
                            <i className="i-lucide-history"></i>
                            View History
                        </button>
                        <button 
                            onClick={handleSignOut}
                            className="profile-btn profile-btn-danger"
                        >
                            <i className="fa-solid fa-right-from-bracket"></i>
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ProfilePage;
