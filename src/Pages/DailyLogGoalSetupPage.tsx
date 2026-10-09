import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../utils/queryKeys';
import Title from '../Components/Title';
import TimeField from '../Components/TimeField';
import { getUserSettings, updateUserSettings, type UserSettings } from '../services/profileService';
import LoadingSpinner from '../Components/LoadingSpinner';
import { goalsForDate, latestGoals, parseGoalHistory, withVersion } from '../utils/goalHistory';
import { todayString } from '../utils/dates';
import type { ActiveGoals } from '../utils/dailyScoring';
import { useBootHold } from '../services/bootScreen';

const DailyLogGoalSetupPage: React.FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
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
    // The cheat-day budget: an empty box means "no budget" (unlimited). The
    // stored default is one free cheat day per window, so a fresh account reads
    // "1" here.
    const [cheatAllowed, setCheatAllowed] = useState('');
    const [cheatPeriod, setCheatPeriod] = useState<'week' | 'month'>('week');

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
            try {
                const userSettings = await getUserSettings();
                setSettings(userSettings);
                // Prefill with the goals in force today, not the newest version on
                // record: the history can extend into the future only if a past
                // entry was edited, and today's is what the user is editing.
                const history = parseGoalHistory(userSettings?.goal_history);
                const goals = goalsForDate(history, todayString(), (userSettings?.active_goals as ActiveGoals | null) ?? null);
                if (goals) {
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
                setCheatAllowed(
                    userSettings?.cheat_days_allowed != null
                        ? String(userSettings.cheat_days_allowed)
                        : ''
                );
                setCheatPeriod(userSettings?.cheat_days_period === 'month' ? 'month' : 'week');
            } finally {
                // In a `finally` because this flag is both the page's gate and the
                // boot splash's. A rejected request has to count as "asked and
                // answered" or the hold below never releases.
                setLoading(false);
            }
        };
        load();
    }, [navigate]);

    // Toast notification state
    const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = (type: 'success' | 'error' | 'info', message: string) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ type, message });
        toastTimerRef.current = setTimeout(() => setToast(null), 2500);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;

        const hasAnyGoal = [calories, protein, carbs, fat, water, wakeTime, bedtime]
            .some(v => v.trim() !== '');
        if (!hasAnyGoal) {
            setMessage({ text: 'Set at least one goal before saving.', type: 'error' });
            showToast('error', 'Set at least one goal');
            return;
        }

        // Empty means unlimited, so only a filled box has to be a real count.
        const cheatAllowedValue = cheatAllowed.trim() === '' ? null : parseInt(cheatAllowed, 10);
        if (cheatAllowedValue !== null && (Number.isNaN(cheatAllowedValue) || cheatAllowedValue < 0)) {
            setMessage({ text: 'Cheat days must be a whole number of 0 or more, or left blank for no limit.', type: 'error' });
            showToast('error', 'Enter a valid cheat-day allowance');
            return;
        }

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
            // Saving writes a version effective today rather than overwriting.
            // Logs already written keep the goals they were scored against, so
            // today's edit only moves today and everything after it.
            const effectiveFrom = todayString();
            const history = withVersion(
                parseGoalHistory(settings.goal_history),
                effectiveFrom,
                goals
            );
            const updatedSettings: UserSettings = {
                ...settings,
                // active_goals stays the current-goals pointer for readers that
                // only ever ask "what are my goals now?".
                active_goals: latestGoals(history, goals) as unknown as Record<string, unknown>,
                goal_history: history,
                // The budget is a plain setting, not a versioned goal: it is a
                // rule about how many breaks you take, not a target a day is
                // scored against, so it is not stamped into goal_history.
                cheat_days_allowed: cheatAllowedValue,
                cheat_days_period: cheatPeriod,
            };
            await updateUserSettings(updatedSettings);
            // Charts, insight cards and the daily log all read settings through
            // this cache key; without this they keep scoring against the old
            // goals until a reload.
            queryClient.invalidateQueries({ queryKey: queryKeys.userSettings });
            setMessage({ text: 'Goals saved successfully! Redirecting...', type: 'success' });
            showToast('success', 'Goals saved successfully!');
            setTimeout(() => navigate('/Daily-Log'), 1200);
        } catch (err) {
            console.error('Error saving goals:', err);
            setMessage({ text: 'Failed to save goals.', type: 'error' });
            showToast('error', 'Failed to save goals');
        } finally {
            setSaving(false);
        }
    };

    // Settings come from a raw await rather than React Query, so the app-level
    // boot gate cannot see them: without this the splash lifts on top of the
    // spinner below. `loading` is safe to hold on because the loader clears it in
    // a `finally`, so a rejected fetch still lets the page (and the splash) go.
    useBootHold(loading);

    if (loading) {
        return (
            <>
                <Title title="Setup Goals" />
                <div className="page-main-with-secondary">
                    <div className="dashboard-section">
                        <LoadingSpinner />
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

                        {/* Sleep Goals - wake time drives the bedtime chart's axis,
                            so both are clamped to a valid 24-hour clock time. */}
                        <div className="form-grid">
                            <TimeField id="wakeTime" label="Wake Time" value={wakeTime} onChange={setWakeTime} hint="07:00" />
                            <TimeField id="bedtime" label="Bedtime" value={bedtime} onChange={setBedtime} hint="23:00" />
                        </div>

                        {/* Cheat-day budget. Blank box means no limit, which is how
                            the app behaved before this setting existed. */}
                        <div className="form-grid">
                            {renderInput('cheatAllowed', 'Cheat Days Allowed', cheatAllowed, setCheatAllowed, 'number', 'Blank = no limit')}
                            <div className="mb-3 text-start">
                                <label htmlFor="cheatPeriod" className="form-label">Cheat Days Per</label>
                                <div className="t-input-wrap">
                                    <div className="t-input">
                                        <select
                                            className="form-control"
                                            id="cheatPeriod"
                                            value={cheatPeriod}
                                            onChange={(e) => setCheatPeriod(e.target.value === 'month' ? 'month' : 'week')}
                                        >
                                            <option value="week">Week (Mon–Sun)</option>
                                            <option value="month">Month</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <p className="auth-text" style={{ marginBottom: '1.5rem' }}>
                            The first cheat days within the allowance score their food macros 100 for the day.
                            Past the allowance those macros score 0.
                        </p>

                        <div style={{ marginTop: '1.5rem' }}>
                            <button type="submit" className="btn btn-primary w-100" disabled={saving}>
                                {saving ? 'Saving...' : 'Save Goals'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Toast Notification */}
            {toast && (
                <div className="toast-container">
                    <div className={`toast toast--${toast.type}`}>
                        <span className="toast-text">{toast.message}</span>
                    </div>
                </div>
            )}
        </>
    );
};

export default DailyLogGoalSetupPage;