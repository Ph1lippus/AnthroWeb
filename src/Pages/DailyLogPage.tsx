import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDailyLog, updateDailyLog, getDailyLogByDate } from '../services/dailyLogService';
import { getUserSettings } from '../services/profileService';
import { getUserHabits, toggleHabitForDate, createHabit } from '../services/habitService';
import { getUserProjects } from '../services/projectService';
import type { DailyLog } from '../services/dailyLogService';
import type { UserSettings } from '../services/profileService';
import type { Habit } from '../services/habitService';
import type { Project } from '../services/projectService';

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

// Calculate sleep duration from bedtime and wake time
const calculateSleepDuration = (wakeTime: string, bedtime: string): number | null => {
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

// Calculate BP score (0-100)
const calculateBPScore = (systolic?: number, diastolic?: number): { points: number; status: string; color: string } => {
    if (!systolic || !diastolic) return { points: 0, status: 'No data', color: 'rgba(255, 255, 255, 0.4)' };
    if (systolic >= 180 || diastolic >= 120) return { points: 0, status: 'Hypertensive Crisis', color: 'var(--color-danger)' };
    if (systolic >= 140 || diastolic >= 90) return { points: 25, status: 'High BP', color: 'var(--color-danger)' };
    if (systolic >= 130 || diastolic >= 80) return { points: 50, status: 'Elevated', color: '#ffa500' };
    if (systolic >= 90 && systolic < 130 && diastolic >= 60 && diastolic < 80) return { points: 100, status: 'Normal', color: 'var(--color-primary)' };
    if (systolic < 90 || diastolic < 60) return { points: 50, status: 'Low BP', color: '#ffa500' };
    return { points: 75, status: 'Other', color: 'rgba(255, 255, 255, 0.6)' };
};

// Calculate temperature score (0-100)
const calculateTempScore = (temp?: number): { points: number; status: string; color: string } => {
    if (!temp) return { points: 0, status: 'No data', color: 'rgba(255, 255, 255, 0.4)' };
    if (temp < 35) return { points: 0, status: 'Hypothermia', color: 'var(--color-danger)' };
    if (temp >= 38.5) return { points: 0, status: 'High Fever', color: 'var(--color-danger)' };
    if (temp >= 37.5) return { points: 50, status: 'Mild Fever', color: '#ffa500' };
    if (temp >= 36.5 && temp <= 37.5) return { points: 100, status: 'Normal', color: 'var(--color-primary)' };
    if (temp >= 35 && temp < 36.5) return { points: 50, status: 'Cool', color: '#ffa500' };
    return { points: 100, status: 'Normal', color: 'var(--color-primary)' };
};

const DailyLogPage: React.FC = () => {
    const navigate = useNavigate();
    const [saving, setSaving] = useState(false);
    const [existingLog, setExistingLog] = useState<DailyLog | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [habits, setHabits] = useState<Habit[]>([]);
    const [completedHabits, setCompletedHabits] = useState<Set<string>>(new Set());
    const [loadingHabits, setLoadingHabits] = useState(true);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    const logDate = new Date().toISOString().split('T')[0];

    const [wakeTime, setWakeTime] = useState('');
    const [bedtime, setBedtime] = useState('');
    const [sleepQuality, setSleepQuality] = useState('');
    const [morningSystolic, setMorningSystolic] = useState('');
    const [morningDiastolic, setMorningDiastolic] = useState('');
    const [morningBpm, setMorningBpm] = useState('');
    const [eveningSystolic, setEveningSystolic] = useState('');
    const [eveningDiastolic, setEveningDiastolic] = useState('');
    const [eveningBpm, setEveningBpm] = useState('');
    const [bodyTemperature, setBodyTemperature] = useState('');
    const [calories, setCalories] = useState('');
    const [protein, setProtein] = useState('');
    const [carbs, setCarbs] = useState('');
    const [fat, setFat] = useState('');
    const [water, setWater] = useState('');
    const [weight, setWeight] = useState('');
    const [bodyFat, setBodyFat] = useState('');
    const [mood, setMood] = useState('');
    const [journalEntry, setJournalEntry] = useState('');
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
    const [loadingProjects, setLoadingProjects] = useState(true);
    const [projectWorkDone, setProjectWorkDone] = useState(false);
    
    const [morningRoutine, setMorningRoutine] = useState(false);
    const [eveningRoutine, setEveningRoutine] = useState(false);
    const [fruitServing, setFruitServing] = useState(false);
    const [studied, setStudied] = useState(false);
    const [journal, setJournal] = useState(false);
    const [stretching, setStretching] = useState(false);
    const [reading, setReading] = useState(false);
    
    const [showCustomHabit, setShowCustomHabit] = useState(false);
    const [customHabitName, setCustomHabitName] = useState('');
    const [customHabitDesc, setCustomHabitDesc] = useState('');
    const [addingHabit, setAddingHabit] = useState(false);

    // Load user settings
    useEffect(() => {
        const loadSettings = async () => {
            const userSettings = await getUserSettings();
            setSettings(userSettings);
            setSettingsLoaded(true);
        };
        loadSettings();
    }, []);

    // Load habits
    useEffect(() => {
        const loadHabits = async () => {
            setLoadingHabits(true);
            const userHabits = await getUserHabits();
            setHabits(userHabits);
            setLoadingHabits(false);
        };
        loadHabits();
    }, []);

    // Load projects
    useEffect(() => {
        const loadProjects = async () => {
            setLoadingProjects(true);
            const userProjects = await getUserProjects();
            setProjects(userProjects);
            setLoadingProjects(false);
        };
        loadProjects();
    }, []);

    // Get active goals for placeholders
    const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;
    const nutritionGoals = activeGoals?.nutrition;

    // Compute sleep duration from wake/bed times
    const computedSleepDuration = useMemo(() => {
        return calculateSleepDuration(wakeTime, bedtime);
    }, [wakeTime, bedtime]);

    // Get only active projects (NOT planned or paused)
    const activeProjects = useMemo(() => {
        return projects.filter(p => p.status === 'active');
    }, [projects]);

    // Helper to score individual inputs (0-100)
    const scoreInput = useCallback((type: string, value: string | number | boolean | null | undefined): number => {
        if (!value && value !== 0) return 0;
        
        switch (type) {
            case 'sleepQuality': {
                const sq = parseInt(value as string);
                return Math.round((sq / 10) * 100);
            }
            case 'morningSystolic':
            case 'morningDiastolic': {
                const sys = morningSystolic ? parseInt(morningSystolic) : 0;
                const dia = morningDiastolic ? parseInt(morningDiastolic) : 0;
                if (!sys || !dia) return 0;
                return calculateBPScore(sys, dia).points;
            }
            case 'eveningSystolic':
            case 'eveningDiastolic': {
                const sys = eveningSystolic ? parseInt(eveningSystolic) : 0;
                const dia = eveningDiastolic ? parseInt(eveningDiastolic) : 0;
                if (!sys || !dia) return 0;
                return calculateBPScore(sys, dia).points;
            }
            case 'bodyTemperature': {
                const temp = parseFloat(value as string);
                return calculateTempScore(temp).points;
            }
            case 'calories': {
                const cal = parseInt(value as string);
                if (!settings?.starting_weight || !settings?.height_cm) return 50;
                const bmr = 10 * (settings.starting_weight || 70) + 6.25 * (settings.height_cm || 170) - 5 * 30 + 5;
                const tdee = bmr * 1.55;
                const targetCal = settings.goal === 'lose' ? tdee - 500 : settings.goal === 'gain' ? tdee + 500 : tdee;
                const diff = Math.abs(cal - targetCal);
                if (diff < 200) return 100;
                if (diff < 400) return 75;
                if (diff < 600) return 50;
                if (diff < 800) return 25;
                return 25;
            }
            case 'protein': {
                const proteinGrams = parseInt(value as string);
                if (!settings?.starting_weight) return 50;
                const targetProtein = (settings.starting_weight || 70) * 1.6;
                const ratio = proteinGrams / targetProtein;
                if (ratio >= 0.9 && ratio <= 1.3) return 100;
                if (ratio >= 0.7) return 75;
                if (ratio > 0) return 50;
                return 25;
            }
            case 'carbs':
            case 'fat': {
                return 75;
            }
            case 'water': {
                const waterMl = parseInt(value as string);
                if (waterMl >= 2500) return 100;
                if (waterMl >= 2000) return 80;
                if (waterMl >= 1500) return 60;
                if (waterMl >= 1000) return 40;
                return 20;
            }
            case 'weight': {
                if (!settings?.starting_weight || !settings?.height_cm) return 50;
                const bmi = parseFloat(value as string) / Math.pow((settings.height_cm / 100), 2);
                if (bmi >= 18.5 && bmi < 25) return 100;
                if (bmi >= 25 && bmi < 30) return 75;
                if (bmi >= 30) return 50;
                return 75;
            }
            case 'bodyFat': {
                const bf = parseFloat(value as string);
                if (bf >= 10 && bf <= 20) return 100;
                if (bf > 20 && bf <= 30) return 75;
                return 50;
            }
            case 'mood': {
                const moodVal = parseInt(value as string);
                return Math.round((moodVal / 10) * 100);
            }
            case 'journalEntry': {
                return (value as string).trim().length > 0 ? 100 : 0;
            }
            case 'projectWorkDone': {
                return value ? 100 : 0;
            }
            default:
                return 50;
        }
    }, [settings, morningSystolic, morningDiastolic, eveningSystolic, eveningDiastolic]);

    // Calculate individual input scores (each input = 5% weight)
    const inputScores = useMemo(() => {
        return {
            wakeTime: (wakeTime && bedtime ? 100 : 0),
            bedtime: (wakeTime && bedtime ? 100 : 0),
            sleepQuality: scoreInput('sleepQuality', sleepQuality),
            morningSystolic: scoreInput('morningSystolic', morningSystolic),
            morningDiastolic: scoreInput('morningDiastolic', morningDiastolic),
            morningBpm: morningBpm ? 100 : 0,
            eveningSystolic: scoreInput('eveningSystolic', eveningSystolic),
            eveningDiastolic: scoreInput('eveningDiastolic', eveningDiastolic),
            eveningBpm: eveningBpm ? 100 : 0,
            bodyTemperature: scoreInput('bodyTemperature', bodyTemperature),
            calories: scoreInput('calories', calories),
            protein: scoreInput('protein', protein),
            carbs: scoreInput('carbs', carbs),
            fat: scoreInput('fat', fat),
            water: scoreInput('water', water),
            weight: scoreInput('weight', weight),
            bodyFat: scoreInput('bodyFat', bodyFat),
            mood: scoreInput('mood', mood),
            journalEntry: scoreInput('journalEntry', journalEntry),
            projectWorkDone: scoreInput('projectWorkDone', projectWorkDone),
        };
    }, [wakeTime, bedtime, sleepQuality, morningSystolic, morningDiastolic, morningBpm, eveningSystolic, eveningDiastolic, eveningBpm, bodyTemperature, calories, protein, carbs, fat, water, weight, bodyFat, mood, journalEntry, projectWorkDone, scoreInput]);

    // Calculate overall daily score (average of all inputs)
    const calculatedScore = useMemo(() => {
        const scores = Object.values(inputScores);
        if (scores.length === 0) return 0;
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return Math.round(avg);
    }, [inputScores]);

    const fillForm = (log: DailyLog) => {
        setWakeTime(log.wake_time || '');
        setBedtime(log.bedtime || '');
        setSleepQuality(log.sleep_quality?.toString() || '');
        setMorningSystolic(log.morning_systolic?.toString() || '');
        setMorningDiastolic(log.morning_diastolic?.toString() || '');
        setMorningBpm(log.morning_bpm?.toString() || '');
        setEveningSystolic(log.evening_systolic?.toString() || '');
        setEveningDiastolic(log.evening_diastolic?.toString() || '');
        setEveningBpm(log.evening_bpm?.toString() || '');
        setBodyTemperature(log.body_temperature?.toString() || '');
        setCalories(log.calories?.toString() || '');
        setProtein(log.protein?.toString() || '');
        setCarbs(log.carbs?.toString() || '');
        setFat(log.fat?.toString() || '');
        setWater(log.water?.toString() || '');
        setWeight(log.weight?.toString() || '');
        setBodyFat(log.body_fat?.toString() || '');
        setMood(log.mood?.toString() || '');
        setJournalEntry(log.journal_entry || '');
        setProjectWorkDone(log.project_work_done || false);
        setMorningRoutine(log.morning_routine || false);
        setEveningRoutine(log.evening_routine || false);
        setFruitServing(log.fruit_serving || false);
        setStudied(log.studied || false);
        setJournal(log.journal || false);
        setStretching(log.stretching || false);
        setReading(log.reading || false);
    };

    useEffect(() => {
        const checkExisting = async () => {
            if (!logDate) return;
            const log = await getDailyLogByDate(logDate);
            if (log) {
                setExistingLog(log);
                setIsEditing(true);
                fillForm(log);
            } else {
                setExistingLog(null);
                setIsEditing(false);
            }
        };
        checkExisting();
    }, [logDate]);

    // Auto-save function
    const performSave = useCallback(async () => {
        if (!settings) return;
        
        setSaving(true);
        try {
            const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;
            const goalSnapshot = activeGoals || settings ? {
                nutrition: {
                    calories: activeGoals?.nutrition?.calories ?? (settings?.target_weight != null ? Math.round(settings.target_weight * 30) : null),
                    protein: activeGoals?.nutrition?.protein ?? (settings?.starting_weight != null ? Math.round(settings.starting_weight * 1.6) : null),
                    carbs: activeGoals?.nutrition?.carbs ?? null,
                    fat: activeGoals?.nutrition?.fat ?? null,
                    water: activeGoals?.nutrition?.water ?? 2500,
                },
                sleep: {
                    hours: activeGoals?.sleep?.hours ?? 8,
                    wake_time: activeGoals?.sleep?.wake_time ?? null,
                    bedtime: activeGoals?.sleep?.bedtime ?? null,
                }
            } : null;

            const logData: Omit<DailyLog, 'id' | 'created_at' | 'updated_at'> = {
                log_date: logDate,
                wake_time: wakeTime || undefined,
                bedtime: bedtime || undefined,
                sleep_duration: computedSleepDuration || undefined,
                sleep_quality: sleepQuality ? parseInt(sleepQuality) : undefined,
                morning_systolic: morningSystolic ? parseInt(morningSystolic) : undefined,
                morning_diastolic: morningDiastolic ? parseInt(morningDiastolic) : undefined,
                morning_bpm: morningBpm ? parseInt(morningBpm) : undefined,
                evening_systolic: eveningSystolic ? parseInt(eveningSystolic) : undefined,
                evening_diastolic: eveningDiastolic ? parseInt(eveningDiastolic) : undefined,
                evening_bpm: eveningBpm ? parseInt(eveningBpm) : undefined,
                body_temperature: bodyTemperature ? parseFloat(bodyTemperature) : undefined,
                calories: calories ? parseInt(calories) : undefined,
                protein: protein ? parseInt(protein) : undefined,
                carbs: carbs ? parseInt(carbs) : undefined,
                fat: fat ? parseInt(fat) : undefined,
                water: water ? parseInt(water) : undefined,
                weight: weight ? parseFloat(weight) : undefined,
                body_fat: bodyFat ? parseFloat(bodyFat) : undefined,
                mood: mood ? parseInt(mood) : undefined,
                daily_score: calculatedScore,
                journal_entry: journalEntry || undefined,
                project_id: selectedProjectIds.size > 0 ? Array.from(selectedProjectIds)[0] : undefined,
                project_work_done: projectWorkDone,
                goal_snapshot: goalSnapshot,
                morning_routine: morningRoutine,
                evening_routine: eveningRoutine,
                fruit_serving: fruitServing,
                studied: studied,
                journal: journal,
                stretching: stretching,
                reading: reading,
            };

            if (isEditing && existingLog?.id) {
                await updateDailyLog(existingLog.id, logData);
            } else {
                const newLog = await createDailyLog(logData);
                if (newLog) {
                    setExistingLog(newLog as DailyLog);
                    setIsEditing(true);
                }
            }
            setLastSaved(new Date());
        } catch (err) {
            console.error('Auto-save error:', err);
        } finally {
            setSaving(false);
        }
    }, [settings, logDate, wakeTime, bedtime, computedSleepDuration, sleepQuality, morningSystolic, morningDiastolic, morningBpm, eveningSystolic, eveningDiastolic, eveningBpm, bodyTemperature, calories, protein, carbs, fat, water, weight, bodyFat, mood, journalEntry, selectedProjectIds, projectWorkDone, calculatedScore, morningRoutine, eveningRoutine, fruitServing, studied, journal, stretching, reading, isEditing, existingLog]);

    // Debounced auto-save on any state change
    useEffect(() => {
        if (!settings) return;
        
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }
        
        autoSaveTimerRef.current = setTimeout(() => {
            performSave();
        }, 2000);

        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, [wakeTime, bedtime, sleepQuality, morningSystolic, morningDiastolic, morningBpm, eveningSystolic, eveningDiastolic, eveningBpm, bodyTemperature, calories, protein, carbs, fat, water, weight, bodyFat, mood, journalEntry, selectedProjectIds, projectWorkDone, morningRoutine, eveningRoutine, fruitServing, studied, journal, stretching, reading, performSave, settings]);

    const handleProjectToggle = (projectId: string) => {
        setSelectedProjectIds(prev => {
            const next = new Set(prev);
            if (next.has(projectId)) next.delete(projectId);
            else next.add(projectId);
            return next;
        });
    };

    const handleAddCustomHabit = async () => {
        if (!customHabitName.trim()) return;
        setAddingHabit(true);
        try {
            await createHabit({
                name: customHabitName.trim(),
                description: customHabitDesc.trim() || undefined,
            });
            const userHabits = await getUserHabits();
            setHabits(userHabits);
            setShowCustomHabit(false);
            setCustomHabitName('');
            setCustomHabitDesc('');
        } catch (err) {
            console.error('Error creating habit:', err);
        } finally {
            setAddingHabit(false);
        }
    };

    if (!settings) {
        return (
            <div className="daily-logs-page-wrapper">
                <div className="dashboard-section daily-logs-section">
                    <div className="daily-logs-card">
                        <div className="profile-loading">
                            <div className="profile-loading-spinner"></div>
                            <p>Loading...</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (settingsLoaded && !settings?.active_goals) {
        navigate('/Daily-Log/Setup');
        return null;
    }

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'var(--color-primary)';
        if (score >= 60) return '#ffa500';
        return 'var(--color-danger)';
    };

    return (
        <div className="daily-logs-page-wrapper">
            <div className="dashboard-section daily-logs-section">
                <div className="daily-logs-card">
                    <div className="flex gap-2 mb-4">
                        <button onClick={() => navigate('/Daily-Log/History')} className="btn-action">
                            <i className="i-lucide-history mr-1"></i>View History
                        </button>
                    </div>

                    {/* Auto-save indicator */}
                    <div className="flex items-center justify-end gap-2 mb-2 text-xs opacity-60">
                        {saving ? (
                            <span><i className="i-lucide-loader animate-spin mr-1"></i>Saving...</span>
                        ) : lastSaved ? (
                            <span><i className="i-lucide-check mr-1" style={{ color: 'var(--color-primary)' }}></i>Saved {lastSaved.toLocaleTimeString()}</span>
                        ) : (
                            <span>Auto-saves as you type</span>
                        )}
                    </div>

                    {/* Overall Score */}
                    <div className="card mb-4">
                        <div className="card-body">
                            <div className="flex items-center justify-between">
                                <span className="form-label mb-0">Overall Daily Score</span>
                                <span className="text-2xl font-bold" style={{ color: getScoreColor(calculatedScore) }}>
                                    {calculatedScore}/100
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Category Stat Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                        <div className="stat-card">
                            <div className="stat-icon"><i className="i-lucide-moon"></i></div>
                            <div className="stat-content">
                                <div className="stat-label">Sleep</div>
                                <div className="stat-value" style={{ color: getScoreColor(inputScores.sleepQuality) }}>
                                    {inputScores.sleepQuality}%
                                </div>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon"><i className="i-lucide-heart-pulse"></i></div>
                            <div className="stat-content">
                                <div className="stat-label">Blood Pressure</div>
                                <div className="stat-value" style={{ color: getScoreColor(inputScores.morningSystolic) }}>
                                    {inputScores.morningSystolic}%
                                </div>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon"><i className="i-lucide-thermometer"></i></div>
                            <div className="stat-content">
                                <div className="stat-label">Temperature</div>
                                <div className="stat-value" style={{ color: getScoreColor(inputScores.bodyTemperature) }}>
                                    {inputScores.bodyTemperature}%
                                </div>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon"><i className="i-lucide-flame"></i></div>
                            <div className="stat-content">
                                <div className="stat-label">Calories</div>
                                <div className="stat-value" style={{ color: getScoreColor(inputScores.calories) }}>
                                    {inputScores.calories}%
                                </div>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon"><i className="i-lucide-glass-water"></i></div>
                            <div className="stat-content">
                                <div className="stat-label">Water</div>
                                <div className="stat-value" style={{ color: getScoreColor(inputScores.water) }}>
                                    {inputScores.water}%
                                </div>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon"><i className="i-lucide-weight"></i></div>
                            <div className="stat-content">
                                <div className="stat-label">Weight</div>
                                <div className="stat-value" style={{ color: getScoreColor(inputScores.weight) }}>
                                    {inputScores.weight}%
                                </div>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon"><i className="i-lucide-file-text"></i></div>
                            <div className="stat-content">
                                <div className="stat-label">Journal</div>
                                <div className="stat-value" style={{ color: getScoreColor(inputScores.journalEntry) }}>
                                    {inputScores.journalEntry}%
                                </div>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon"><i className="i-lucide-briefcase"></i></div>
                            <div className="stat-content">
                                <div className="stat-label">Projects</div>
                                <div className="stat-value" style={{ color: getScoreColor(inputScores.projectWorkDone) }}>
                                    {inputScores.projectWorkDone}%
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="daily-log-form">
                        <div className="card mb-4">
                            <div className="card-body">
                                <div className="flex items-center gap-3">
                                    <i className="i-lucide-calendar" style={{ color: 'var(--color-primary)', fontSize: '1.1rem' }}></i>
                                    <div>
                                        <div className="form-label mb-0">Log Date</div>
                                        <div className="text-lg font-semibold" style={{ color: 'var(--color-light)' }}>
                                            {new Date(logDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div className="card">
                                <div className="card-header">
                                    <h3 className="card-title"><i className="i-lucide-sun mr-2"></i>Sleep</h3>
                                </div>
                                <div className="card-body">
                                    <div className="form-group">
                                        <label className="form-label">Wake Time</label>
                                        <input type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} className="form-control" step="1" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Bedtime</label>
                                        <input type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} className="form-control" step="1" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Sleep Quality (0-10)</label>
                                        <input type="number" min="0" max="10" value={sleepQuality} onChange={(e) => setSleepQuality(e.target.value)} className="form-control" placeholder="How well did you sleep?" />
                                    </div>
                                </div>
                            </div>

                            <div className="card">
                                <div className="card-header">
                                    <h3 className="card-title"><i className="i-lucide-activity mr-2"></i>Blood Pressure & Heart Rate</h3>
                                </div>
                                <div className="card-body">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="form-group">
                                            <label className="form-label">Morning Systolic</label>
                                            <input type="number" value={morningSystolic} onChange={(e) => setMorningSystolic(e.target.value)} className="form-control" placeholder="120" />
                                            {morningSystolic && morningDiastolic && (
                                                <span className="text-xs mt-1" style={{ color: calculateBPScore(parseInt(morningSystolic), parseInt(morningDiastolic)).color }}>
                                                    {calculateBPScore(parseInt(morningSystolic), parseInt(morningDiastolic)).status}
                                                </span>
                                            )}
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Morning Diastolic</label>
                                            <input type="number" value={morningDiastolic} onChange={(e) => setMorningDiastolic(e.target.value)} className="form-control" placeholder="80" />
                                            {morningSystolic && morningDiastolic && (
                                                <span className="text-xs mt-1" style={{ color: calculateBPScore(parseInt(morningSystolic), parseInt(morningDiastolic)).color }}>
                                                    {calculateBPScore(parseInt(morningSystolic), parseInt(morningDiastolic)).status}
                                                </span>
                                            )}
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Morning BPM</label>
                                            <input type="number" value={morningBpm} onChange={(e) => setMorningBpm(e.target.value)} className="form-control" placeholder="60-100" />
                                            {morningBpm && (
                                                <span className="text-xs mt-1" style={{ color: morningBpm && parseInt(morningBpm) >= 60 && parseInt(morningBpm) <= 100 ? 'var(--color-primary)' : '#ffa500' }}>
                                                    {morningBpm && parseInt(morningBpm) >= 60 && parseInt(morningBpm) <= 100 ? 'Normal' : morningBpm && parseInt(morningBpm) < 60 ? 'Low' : 'High'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Evening Systolic</label>
                                            <input type="number" value={eveningSystolic} onChange={(e) => setEveningSystolic(e.target.value)} className="form-control" placeholder="120" />
                                            {eveningSystolic && eveningDiastolic && (
                                                <span className="text-xs mt-1" style={{ color: calculateBPScore(parseInt(eveningSystolic), parseInt(eveningDiastolic)).color }}>
                                                    {calculateBPScore(parseInt(eveningSystolic), parseInt(eveningDiastolic)).status}
                                                </span>
                                            )}
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Evening Diastolic</label>
                                            <input type="number" value={eveningDiastolic} onChange={(e) => setEveningDiastolic(e.target.value)} className="form-control" placeholder="80" />
                                            {eveningSystolic && eveningDiastolic && (
                                                <span className="text-xs mt-1" style={{ color: calculateBPScore(parseInt(eveningSystolic), parseInt(eveningDiastolic)).color }}>
                                                    {calculateBPScore(parseInt(eveningSystolic), parseInt(eveningDiastolic)).status}
                                                </span>
                                            )}
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Evening BPM</label>
                                            <input type="number" value={eveningBpm} onChange={(e) => setEveningBpm(e.target.value)} className="form-control" placeholder="60-100" />
                                            {eveningBpm && (
                                                <span className="text-xs mt-1" style={{ color: eveningBpm && parseInt(eveningBpm) >= 60 && parseInt(eveningBpm) <= 100 ? 'var(--color-primary)' : '#ffa500' }}>
                                                    {eveningBpm && parseInt(eveningBpm) >= 60 && parseInt(eveningBpm) <= 100 ? 'Normal' : eveningBpm && parseInt(eveningBpm) < 60 ? 'Low' : 'High'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="form-group mt-3">
                                        <label className="form-label">Body Temperature (°C)</label>
                                        <input type="number" step="0.1" value={bodyTemperature} onChange={(e) => setBodyTemperature(e.target.value)} className="form-control" placeholder="36.5" />
                                        {bodyTemperature && (
                                            <span className="text-xs mt-1" style={{ color: calculateTempScore(parseFloat(bodyTemperature)).color }}>
                                                {calculateTempScore(parseFloat(bodyTemperature)).status}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div className="card">
                                <div className="card-header">
                                    <h3 className="card-title"><i className="i-lucide-flame mr-2"></i>Nutrition</h3>
                                </div>
                                <div className="card-body">
                                    <div className="form-group">
                                        <label className="form-label">Calories</label>
                                        <input type="number" value={calories} onChange={(e) => setCalories(e.target.value)} className="form-control" placeholder={nutritionGoals?.calories ? String(nutritionGoals.calories) : '2000'} />
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="form-group">
                                            <label className="form-label">Protein (g)</label>
                                            <input type="number" value={protein} onChange={(e) => setProtein(e.target.value)} className="form-control" placeholder={nutritionGoals?.protein ? String(nutritionGoals.protein) : '150'} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Carbs (g)</label>
                                            <input type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} className="form-control" placeholder={nutritionGoals?.carbs ? String(nutritionGoals.carbs) : '200'} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Fat (g)</label>
                                            <input type="number" value={fat} onChange={(e) => setFat(e.target.value)} className="form-control" placeholder={nutritionGoals?.fat ? String(nutritionGoals.fat) : '65'} />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Water (ml)</label>
                                        <input type="number" value={water} onChange={(e) => setWater(e.target.value)} className="form-control" placeholder={nutritionGoals?.water ? String(nutritionGoals.water) : '2500'} />
                                    </div>
                                </div>
                            </div>

                            <div className="card">
                                <div className="card-header">
                                    <h3 className="card-title"><i className="i-lucide-weight mr-2"></i>Body Metrics</h3>
                                </div>
                                <div className="card-body">
                                    <div className="form-group">
                                        <label className="form-label">Weight (kg)</label>
                                        <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className="form-control" placeholder="75.5" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Body Fat (%)</label>
                                        <input type="number" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} className="form-control" placeholder="15.0" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Mood (1-10)</label>
                                        <input type="number" min="1" max="10" value={mood} onChange={(e) => setMood(e.target.value)} className="form-control" placeholder="7" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Project Work Done</label>
                                        <label className="checkbox-label">
                                            <input type="checkbox" checked={projectWorkDone} onChange={(e) => setProjectWorkDone(e.target.checked)} className="checkbox-input" />
                                            <span className="checkbox-custom"></span>
                                            <span className="text-sm opacity-80">Completed project work today</span>
                                        </label>
                                    </div>
                                    <div className="form-group mt-3">
                                        <label className="form-label">Projects Worked On</label>
                                        <p className="text-xs opacity-50 mb-2">Select the active projects you worked on today</p>
                                        <div className="projects-checkbox-list">
                                            {loadingProjects ? (
                                                <p className="text-xs opacity-50">Loading projects...</p>
                                            ) : activeProjects.length > 0 ? (
                                                activeProjects.map(project => (
                                                    <label key={project.id} className="checkbox-label">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedProjectIds.has(project.id!)}
                                                            onChange={() => handleProjectToggle(project.id!)}
                                                            className="checkbox-input"
                                                        />
                                                        <span className="checkbox-custom"></span>
                                                        <span className="text-sm opacity-90">{project.title}</span>
                                                    </label>
                                                ))
                                            ) : (
                                                <p className="text-xs opacity-50">No active projects. Add projects in Projects page.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="card mb-4">
                            <div className="card-header">
                                <h3 className="card-title"><i className="i-lucide-file-text mr-2"></i>Journal</h3>
                            </div>
                            <div className="card-body">
                                <div className="form-group">
                                    <label className="form-label">Journal Entry</label>
                                    <textarea value={journalEntry} onChange={(e) => setJournalEntry(e.target.value)} className="form-control" rows={4} placeholder="How was your day? Any notes or reflections..." />
                                </div>
                            </div>
                        </div>

                        {/* Habits Section */}
                        <div className="card mb-4">
                            <div className="card-header">
                                <h3 className="card-title"><i className="i-lucide-check-circle mr-2"></i>Habits</h3>
                            </div>
                            <div className="card-body">
                                <div className="flex flex-col gap-2">
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={morningRoutine} onChange={(e) => setMorningRoutine(e.target.checked)} className="checkbox-input" />
                                        <span className="checkbox-custom"></span>
                                        <span className="text-sm opacity-90">Morning Routine</span>
                                    </label>
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={eveningRoutine} onChange={(e) => setEveningRoutine(e.target.checked)} className="checkbox-input" />
                                        <span className="checkbox-custom"></span>
                                        <span className="text-sm opacity-90">Evening Routine</span>
                                    </label>
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={fruitServing} onChange={(e) => setFruitServing(e.target.checked)} className="checkbox-input" />
                                        <span className="checkbox-custom"></span>
                                        <span className="text-sm opacity-90">Fruit Serving</span>
                                    </label>
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={studied} onChange={(e) => setStudied(e.target.checked)} className="checkbox-input" />
                                        <span className="checkbox-custom"></span>
                                        <span className="text-sm opacity-90">Studied</span>
                                    </label>
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={stretching} onChange={(e) => setStretching(e.target.checked)} className="checkbox-input" />
                                        <span className="checkbox-custom"></span>
                                        <span className="text-sm opacity-90">Stretching</span>
                                    </label>
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={reading} onChange={(e) => setReading(e.target.checked)} className="checkbox-input" />
                                        <span className="checkbox-custom"></span>
                                        <span className="text-sm opacity-90">Reading</span>
                                    </label>
                                    {loadingHabits ? (
                                        <p className="text-xs opacity-60">Loading custom habits...</p>
                                    ) : habits.length > 0 && (
                                        <div className="border-t border-[rgba(255,255,255,0.1)] pt-2 mt-1">
                                            <p className="text-xs opacity-50 mb-1">Custom Habits:</p>
                                            {habits.map((habit) => (
                                                <label key={habit.id} className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        checked={completedHabits.has(habit.id!)}
                                                        onChange={async () => {
                                                            const result = await toggleHabitForDate(habit.id!, logDate);
                                                            setCompletedHabits(prev => {
                                                                const next = new Set(prev);
                                                                if (result) next.add(habit.id!);
                                                                else next.delete(habit.id!);
                                                                return next;
                                                            });
                                                        }}
                                                        className="checkbox-input"
                                                    />
                                                    <span className="checkbox-custom"></span>
                                                    <span className="text-sm opacity-90">{habit.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                    {!showCustomHabit ? (
                                        <button type="button" onClick={() => setShowCustomHabit(true)} className="flex items-center gap-1 text-xs opacity-70 hover:opacity-100">
                                            <i className="i-lucide-plus"></i>Add Custom Habit
                                        </button>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            <input type="text" value={customHabitName} onChange={(e) => setCustomHabitName(e.target.value)} className="form-control text-sm" placeholder="Habit name" maxLength={50} />
                                            <textarea value={customHabitDesc} onChange={(e) => setCustomHabitDesc(e.target.value)} className="form-control text-sm" placeholder="Description (optional)" rows={1} maxLength={100} />
                                            <div className="flex gap-2">
                                                <button type="button" onClick={handleAddCustomHabit} disabled={addingHabit || !customHabitName.trim()} className="btn-form-submit text-xs px-2 py-1">
                                                    {addingHabit ? 'Adding...' : 'Add'}
                                                </button>
                                                <button type="button" onClick={() => setShowCustomHabit(false)} className="btn-form-cancel text-xs px-2 py-1">Cancel</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DailyLogPage;