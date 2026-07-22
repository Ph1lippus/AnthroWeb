import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Title from '../Components/Title';
import { getUserSettings, updateUserSettings, type UserSettings } from '../services/profileService';

interface ActiveGoals {
    nutrition: {
        calories: number | null;
        protein: number | null;
        carbs: number | null;
        fat: number | null;
        water: number | null;
    };
    sleep: {
        hours: number | null;
        wake_time: string | null;
        bedtime: string | null;
    };
}

const DailyLogGoalSetupPage: React.FC = () => {
    const navigate = useNavigate();
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const [calories, setCalories] = useState('');
    const [protein, setProtein] = useState('');
    const [carbs, setCarbs] = useState('');
    const [fat, setFat] = useState('');
    const [water, setWater] = useState('');
    const [wakeTime, setWakeTime] = useState('');
    const [bedtime, setBedtime] = useState('');

    const formatTimeInput = (value: string): string => {
        const numbers = value.replace(/\D/g, '').slice(0, 4);
        if (numbers.length <= 2) {
            return numbers;
        }
        return `${numbers.slice(0, 2)}:${numbers.slice(2)}`;
    };

    const validateTime = (value: string): boolean => {
        if (value.length !== 5) return false;
        const [hours, minutes] = value.split(':');
        const h = parseInt(hours, 10);
        const m = parseInt(minutes, 10);
        return h >= 0 && h <= 23 && m >= 0 && m <= 59;
    };

    const calculateSleepDuration = (): number | null => {
        if (!wakeTime || !bedtime) return null;
        const [wakeH, wakeM] = wakeTime.split(':').map(Number);
        const [bedH, bedM] = bedtime.split(':').map(Number);
        let wakeMinutes = wakeH * 60 + wakeM;
        const bedMinutes = bedH * 60 + bedM;
        if (wakeMinutes <= bedMinutes) {
            wakeMinutes += 24 * 60;
        }
        const duration = (wakeMinutes - bedMinutes) / 60;
        return Math.round(duration * 10) / 10;
    };

    useEffect(() => {
        const load = async () => {
            const userSettings = await getUserSettings();
            setSettings(userSettings);
            setLoading(false);
            if (userSettings?.active_goals) {
                const goals = userSettings.active_goals as ActiveGoals;
                if (goals.nutrition) {
                    setCalories(goals.nutrition.calories?.toString() || '');
                    setProtein(goals.nutrition.protein?.toString() || '');
                    setCarbs(goals.nutrition.carbs?.toString() || '');
                    setFat(goals.nutrition.fat?.toString() || '');
                    setWater(goals.nutrition.water?.toString() || '');
                }
                if (goals.sleep) {
                    setWakeTime(goals.sleep.wake_time || '');
                    setBedtime(goals.sleep.bedtime || '');
                }
            }
        };
        load();
    }, [navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;
        setSaving(true);
        setMessage(null);
        try {
            const goals: ActiveGoals = {
                nutrition: {
                    calories: calories ? parseInt(calories) : null,
                    protein: protein ? parseInt(protein) : null,
                    carbs: carbs ? parseInt(carbs) : null,
                    fat: fat ? parseInt(fat) : null,
                    water: water ? parseInt(water) : null,
                },
                sleep: {
                    hours: calculateSleepDuration(),
                    wake_time: wakeTime || null,
                    bedtime: bedtime || null,
                }
            };
            const updatedSettings: UserSettings = {
                ...settings,
                active_goals: goals,
            };
            await updateUserSettings(updatedSettings);
            setMessage({ text: 'Goals saved successfully! Redirecting...', type: 'success' });
            setTimeout(() => navigate('/Daily-Log'), 1200);
        } catch (err) {
            console.error('Error saving goals:', err);
            setMessage({ text: 'Failed to save goals.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <>
                <Title title="Setup Goals" />
                <div className="page-main-with-secondary">
                    <div className="dashboard-section">
                        <div className="profile-loading">
                            <div className="profile-loading-spinner"></div>
                            <p>Loading...</p>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    const renderInput = (
        id: string,
        label: string,
        value: string,
        onChange: (value: string) => void,
        type: string = 'text',
        placeholder?: string,
        step?: string,
        isTime: boolean = false
    ) => {
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const raw = e.target.value;
            if (isTime) {
                const formatted = formatTimeInput(raw);
                if (formatted.length <= 5) {
                    onChange(formatted);
                }
            } else {
                onChange(raw);
            }
        };

        const handleBlur = () => {
            if (isTime && value && !validateTime(value)) {
                onChange('');
            }
        };

        return (
            <div className="mb-3 text-start">
                <label htmlFor={id} className="form-label">{label}</label>
                <div className="t-input-wrap">
                    <div className="t-input">
                        <input
                            className="form-control"
                            id={id}
                            type={type}
                            placeholder={placeholder}
                            value={value}
                            step={step}
                            onChange={handleChange}
                            onBlur={handleBlur}
                        />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            <Title title="Setup Goals" />
            <div className="page-main-with-secondary">
                <div className="auth-card auth-card-wide">
                    <h2 className="auth-title">Daily Goals Setup</h2>
                    <p className="auth-text" style={{ marginBottom: '1.5rem' }}>
                        Set your daily targets. These will be saved to your profile and used in your daily logs.
                    </p>
                    
                    {message && (
                        <div className={`auth-error ${message.type === 'success' ? 'auth-success' : ''}`} style={{ marginBottom: '1rem' }}>
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} noValidate>
                        {/* Nutrition Goals */}
                        <div className="form-grid">
                            {renderInput('calories', 'Calories', calories, setCalories, 'number', '2000')}
                            {renderInput('protein', 'Protein (g)', protein, setProtein, 'number', '150')}
                        </div>
                        
                        <div className="form-grid">
                            {renderInput('carbs', 'Carbs (g)', carbs, setCarbs, 'number', '200')}
                            {renderInput('fat', 'Fat (g)', fat, setFat, 'number', '65')}
                        </div>

                        <div className="form-grid">
                            {renderInput('water', 'Water (ml)', water, setWater, 'number', '2500')}
                        </div>

                        {/* Sleep Goals */}
                        <div className="form-grid">
                            {renderInput('wakeTime', 'Wake Time', wakeTime, setWakeTime, 'text', 'HH:MM', undefined, true)}
                            {renderInput('bedtime', 'Bedtime', bedtime, setBedtime, 'text', 'HH:MM', undefined, true)}
                        </div>

                        <div style={{ marginTop: '1.5rem' }}>
                            <button type="submit" className="btn btn-primary w-100" disabled={saving}>
                                {saving ? 'Saving...' : 'Save Goals'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
};

export default DailyLogGoalSetupPage;