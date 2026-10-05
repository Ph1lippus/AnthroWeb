import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { getUserSettings, getLatestBodyMeasurements } from '../services/profileService';
import { supabase } from '../services/supabaseClient';
import { Pencil, Target } from 'lucide-react';
import Title from '../Components/Title';
import LoadingSpinner from '../Components/LoadingSpinner';
import { useBootHold } from '../services/bootScreen';

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
    /** A measurement's own date. Was `log_date`, back when this read the log. */
    measure_date: string | null;
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
            try {
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
            } finally {
                // One place clears it, so it cannot be missed: the no-user path
                // above returns before the old bottom-of-function call, and a
                // rejected fetch skips it entirely. Either would leave the flag
                // true, which is the page's gate and the boot splash's.
                setLoading(false);
            }
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

    // The profile loads the auth user, its settings and its latest measurements
    // with raw awaits, so none of it shows up in `client.isFetching()` and the
    // splash would lift over the spinner below. `loading` provably terminates:
    // the loader clears it in a `finally`, which also covers the signed-out
    // redirect.
    useBootHold(loading);

    if (loading) {
        return (
            <>
                <Title title="Profile" />
                <div className="profile-page-wrapper">
                    <div className="profile-scroll-area">
                        <div className="profile-container profile-loading-wrapper">
                            <LoadingSpinner />
                        </div>
                    </div>
                </div>
            </>
        );
    }

    const progress = calculateProgress();
    const age = calculateAge(settings?.date_of_birth);

    // BMI from the latest logged weight + stored height, so the card has a
    // number to show even before any measurement exists.
    const bmi = (() => {
        const h = settings?.height_cm;
        const w = latestMeasurements?.weight;
        if (!h || !w) return null;
        const m = h / 100;
        return Math.round((w / (m * m)) * 10) / 10;
    })();

    const bmiLabel = (() => {
        if (bmi == null) return null;
        if (bmi < 18.5) return 'Underweight';
        if (bmi < 25) return 'Healthy';
        if (bmi < 30) return 'Overweight';
        return 'Obese';
    })();

    return (
        <>
            <Title title="Profile" />
            <div className="profile-page-wrapper">
                <div className="profile-scroll-area">
                <div className="profile-container">
                    {/* Profile Header */}
                    <div className="profile-header">
                        <div className="profile-header-info">
                            <h1 className="profile-name">{username}</h1>
                            <p className="profile-email">{userEmail}</p>
                        </div>
                        <div className="profile-header-actions">
                            <Link to="/Daily-Log/Setup" className="profile-edit-btn" aria-label="Edit daily goals" data-tip="Edit daily goals">
                                <Target />
                            </Link>
                            <Link to="/profile/edit" className="profile-edit-btn" aria-label="Edit profile" data-tip="Edit profile">
                                <Pencil />
                            </Link>
                        </div>
                    </div>

                    {/* Two-Column Layout: Left and Right */}
                    <div className="profile-two-col">
                        {/* LEFT COLUMN */}
                        <div className="profile-left-col">
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
                                            <span className="profile-progress-start" />
                                            <span className="profile-progress-marker" style={{ left: `${Math.round(progress.overallProgress)}%` }} />
                                        </div>
                                        
                                        <div className="profile-progress-details">
                                            {settings.starting_weight && settings.target_weight && (
                                                <div className="profile-progress-detail">
                                                    <span>Weight: {settings.starting_weight} kg → {latestMeasurements?.weight ?? '—'} kg → {settings.target_weight} kg</span>
                                                </div>
                                            )}
                                            {settings.starting_bodyfat && settings.target_bodyfat && (
                                                <div className="profile-progress-detail">
                                                    <span>Body Fat: {settings.starting_bodyfat}% → {latestMeasurements?.body_fat ?? '—'}% → {settings.target_bodyfat}%</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Body Stats Section - mosaic of tiles, each a small
                                card like the daily log puzzle grid. */}
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
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Age</span>
                                        <span className="profile-info-value">{age != null ? `${age} years` : 'Not set'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Current Weight</span>
                                        <span className="profile-info-value">{latestMeasurements?.weight ? `${latestMeasurements.weight} kg` : 'Not logged'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Current Body Fat</span>
                                        <span className="profile-info-value">{latestMeasurements?.body_fat ? `${latestMeasurements.body_fat}%` : 'Not logged'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">BMI</span>
                                        <span className="profile-info-value">{bmi != null ? `${bmi}${bmiLabel ? ` · ${bmiLabel}` : ''}` : 'Not set'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Measurements Logged</span>
                                        <span className="profile-info-value">{latestMeasurements?.measure_date || 'Never'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Starting Measurements */}
                            <div className="profile-section">
                                <h2 className="profile-section-title">Starting Measurements</h2>
                                <div className="profile-info-grid">
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Starting Weight</span>
                                        <span className="profile-info-value">{settings?.starting_weight ? `${settings.starting_weight} kg` : 'Not set'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Starting Body Fat</span>
                                        <span className="profile-info-value">{settings?.starting_bodyfat ? `${settings.starting_bodyfat}%` : 'Not set'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Last Measurement</span>
                                        <span className="profile-info-value">{settings?.last_measurement_date || 'Not set'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN */}
                        <div className="profile-right-col">
                            {/* Goals Section - always lists every goal so the set is
                                visible even before a value has been entered. */}
                            <div className="profile-section">
                                <h2 className="profile-section-title">Goals</h2>
                                <div className="profile-info-grid">
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Goal</span>
                                        <span className="profile-info-value">{getGoalDisplay(settings?.goal)}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Target Weight</span>
                                        <span className="profile-info-value">{settings?.target_weight ? `${settings.target_weight} kg` : 'Not set'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Target Body Fat</span>
                                        <span className="profile-info-value">{settings?.target_bodyfat ? `${settings.target_bodyfat}%` : 'Not set'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Daily Calories</span>
                                        <span className="profile-info-value">{settings?.active_goals?.nutrition?.calories != null ? `${settings.active_goals.nutrition.calories} kcal` : 'Not set'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Protein</span>
                                        <span className="profile-info-value">{settings?.active_goals?.nutrition?.protein != null ? `${settings.active_goals.nutrition.protein} g` : 'Not set'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Carbs</span>
                                        <span className="profile-info-value">{settings?.active_goals?.nutrition?.carbs != null ? `${settings.active_goals.nutrition.carbs} g` : 'Not set'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Fat</span>
                                        <span className="profile-info-value">{settings?.active_goals?.nutrition?.fat != null ? `${settings.active_goals.nutrition.fat} g` : 'Not set'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Water</span>
                                        <span className="profile-info-value">{settings?.active_goals?.nutrition?.water != null ? `${settings.active_goals.nutrition.water} ml` : 'Not set'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Sleep Goal</span>
                                        <span className="profile-info-value">{settings?.active_goals?.sleep?.hours != null ? `${settings.active_goals.sleep.hours} hrs` : 'Not set'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Wake Time</span>
                                        <span className="profile-info-value">{settings?.active_goals?.sleep?.wake_time || 'Not set'}</span>
                                    </div>
                                    <div className="profile-info-item">
                                        <span className="profile-info-label">Bedtime</span>
                                        <span className="profile-info-value">{settings?.active_goals?.sleep?.bedtime || 'Not set'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            </div>
        </>
    );
};

export default ProfilePage;
