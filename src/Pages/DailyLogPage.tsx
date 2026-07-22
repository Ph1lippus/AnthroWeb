import React, { useState, useEffect, useMemo } from 'react';
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
    
    // If wake time is before bedtime, add 24 hours
    if (wakeMinutes <= bedMinutes) {
        wakeMinutes += 24 * 60;
    }
    
    const duration = (wakeMinutes - bedMinutes) / 60;
    return Math.round(duration * 10) / 10; // Round to 1 decimal
};

// Calculate BP score based on medical guidelines (American Heart Association)
const calculateBPScore = (systolic?: number, diastolic?: number): { points: number; status: string; color: string } => {
    if (!systolic || !diastolic) return { points: 0, status: 'No data', color: 'rgba(255, 255, 255, 0.4)' };
    
    if (systolic >= 180 || diastolic >= 120) {
        return { points: 0, status: 'Hypertensive Crisis', color: 'var(--color-danger)' };
    }
    if (systolic >= 140 || diastolic >= 90) {
        return { points: 4, status: 'High BP', color: 'var(--color-danger)' };
    }
    if (systolic >= 130 || diastolic >= 80) {
        return { points: 7, status: 'Elevated', color: '#ffa500' };
    }
    if (systolic >= 90 && systolic < 130 && diastolic >= 60 && diastolic < 80) {
        return { points: 15, status: 'Normal', color: 'var(--color-primary)' };
    }
    // Low readings
    if (systolic < 90 || diastolic < 60) {
        return { points: 8, status: 'Low BP', color: '#ffa500' };
    }
    return { points: 10, status: 'Other', color: 'rgba(255, 255, 255, 0.6)' };
};

// Calculate temperature score based on medical guidelines
const calculateTempScore = (temp?: number): { points: number; status: string; color: string } => {
    if (!temp) return { points: 0, status: 'No data', color: 'rgba(255, 255, 255, 0.4)' };
    
    if (temp < 35) {
        return { points: 0, status: 'Hypothermia', color: 'var(--color-danger)' };
    }
    if (temp >= 38.5) {
        return { points: 0, status: 'High Fever', color: 'var(--color-danger)' };
    }
    if (temp >= 37.5) {
        return { points: 5, status: 'Mild Fever', color: '#ffa500' };
    }
    if (temp >= 36.5 && temp <= 37.5) {
        return { points: 10, status: 'Normal', color: 'var(--color-primary)' };
    }
    if (temp >= 35 && temp < 36.5) {
        return { points: 5, status: 'Cool', color: '#ffa500' };
    }
    return { points: 10, status: 'Normal', color: 'var(--color-primary)' };
};

const DailyLogPage: React.FC = () => {
    const navigate = useNavigate();
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [existingLog, setExistingLog] = useState<DailyLog | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [habits, setHabits] = useState<Habit[]>([]);
    const [completedHabits, setCompletedHabits] = useState<Set<string>>(new Set());
    const [loadingHabits, setLoadingHabits] = useState(true);
    const [settingsLoaded, setSettingsLoaded] = useState(false);

    const logDate = new Date().toISOString().split('T')[0];

    const [wakeTime, setWakeTime] = useState('');
    const [bedtime, setBedtime] = useState('');
    const [sleepDuration, setSleepDuration] = useState('');
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
    
    // Built-in habit states (stored in daily_logs table)
    const [morningRoutine, setMorningRoutine] = useState(false);
    const [eveningRoutine, setEveningRoutine] = useState(false);
    const [fruitServing, setFruitServing] = useState(false);
    const [studied, setStudied] = useState(false);
    const [journal, setJournal] = useState(false);
    const [stretching, setStretching] = useState(false);
    const [reading, setReading] = useState(false);
    
    // Custom habit creation state
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
    const sleepGoals = activeGoals?.sleep;

    // Calculate daily score (0-100)
    const calculatedScore = useMemo(() => {
        let totalPoints = 0;
        let maxPoints = 0;

        // Sleep quality (max 20 points)
        maxPoints += 20;
        if (sleepQuality) {
            const sq = parseInt(sleepQuality);
            if (sq >= 8) totalPoints += 20;
            else if (sq >= 6) totalPoints += 15;
            else if (sq >= 4) totalPoints += 10;
            else if (sq > 0) totalPoints += 5;
        }

        // Sleep duration (max 15 points)
        maxPoints += 15;
        if (sleepDuration) {
            const hours = parseFloat(sleepDuration);
            if (hours >= 7 && hours <= 9) totalPoints += 15;
            else if (hours >= 6 && hours < 7) totalPoints += 12;
            else if (hours > 9 && hours <= 10) totalPoints += 12;
            else if (hours >= 5 && hours < 6) totalPoints += 8;
            else if (hours > 10) totalPoints += 8;
            else if (hours > 0) totalPoints += 4;
        }

        // Nutrition - Calories (max 10 points)
        maxPoints += 10;
        if (calories && settings?.starting_weight && settings?.height_cm) {
            const cal = parseInt(calories);
            const bmr = 10 * (settings.starting_weight || 70) + 6.25 * (settings.height_cm || 170) - 5 * 30 + 5;
            const tdee = bmr * 1.55;
            const targetCal = settings.goal === 'lose' ? tdee - 500 : settings.goal === 'gain' ? tdee + 500 : tdee;
            const diff = Math.abs(cal - targetCal);
            if (diff < 200) totalPoints += 10;
            else if (diff < 400) totalPoints += 7;
            else if (diff < 600) totalPoints += 4;
        } else if (calories) {
            totalPoints += 5; // partial if no settings
        }

        // Protein (max 10 points)
        maxPoints += 10;
        if (protein && settings?.starting_weight) {
            const proteinGrams = parseInt(protein);
            const targetProtein = (settings.starting_weight || 70) * 1.6;
            const ratio = proteinGrams / targetProtein;
            if (ratio >= 0.9 && ratio <= 1.3) totalPoints += 10;
            else if (ratio >= 0.7) totalPoints += 7;
            else if (ratio > 0) totalPoints += 4;
        } else if (protein) {
            totalPoints += 5;
        }

        // Water (max 10 points)
        maxPoints += 10;
        if (water) {
            const waterMl = parseInt(water);
            if (waterMl >= 2500) totalPoints += 10;
            else if (waterMl >= 2000) totalPoints += 8;
            else if (waterMl >= 1500) totalPoints += 6;
            else if (waterMl >= 1000) totalPoints += 3;
        }

        // Blood Pressure (max 15 points)
        maxPoints += 15;
        if (morningSystolic && morningDiastolic) {
            const bpScore = calculateBPScore(parseInt(morningSystolic), parseInt(morningDiastolic));
            totalPoints += bpScore.points;
        }

        // Body Temperature (max 10 points)
        maxPoints += 10;
        if (bodyTemperature) {
            const tempScore = calculateTempScore(parseFloat(bodyTemperature));
            totalPoints += tempScore.points;
        }

        // Exercise (max 15 points)
        maxPoints += 15;
        if (projectWorkDone) totalPoints += 15;

        // Mood (max 10 points)
        maxPoints += 10;
        if (mood) {
            const moodVal = parseInt(mood);
            totalPoints += Math.round((moodVal / 10) * 10);
        }

        // Journal (max 10 points)
        maxPoints += 10;
        if (journalEntry && journalEntry.trim().length > 0) totalPoints += 10;

        const score = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
        return Math.min(100, Math.max(0, score));
    }, [sleepQuality, sleepDuration, calories, protein, water, bodyTemperature, morningSystolic, morningDiastolic, projectWorkDone, mood, journalEntry, settings]);

    const fillForm = (log: DailyLog) => {
        setWakeTime(log.wake_time || '');
        setBedtime(log.bedtime || '');
        setSleepDuration(log.sleep_duration?.toString() || '');
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
        // Built-in habits
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

    const resetForm = () => {
        setWakeTime('');
        setBedtime('');
        setSleepDuration('');
        setSleepQuality('');
        setMorningSystolic('');
        setMorningDiastolic('');
        setMorningBpm('');
        setEveningSystolic('');
        setEveningDiastolic('');
        setEveningBpm('');
        setBodyTemperature('');
        setCalories('');
        setProtein('');
        setCarbs('');
        setFat('');
        setWater('');
        setWeight('');
        setBodyFat('');
        setMood('');
        setJournalEntry('');
        setProjectWorkDone(false);
        // Reset built-in habits
        setMorningRoutine(false);
        setEveningRoutine(false);
        setFruitServing(false);
        setStudied(false);
        setJournal(false);
        setStretching(false);
        setReading(false);
        setExistingLog(null);
        setIsEditing(false);
        setShowCustomHabit(false);
        setCustomHabitName('');
        setCustomHabitDesc('');
    };

    // Handle project selection toggle
    const handleProjectToggle = (projectId: string) => {
        setSelectedProjectIds(prev => {
            const next = new Set(prev);
            if (next.has(projectId)) {
                next.delete(projectId);
            } else {
                next.add(projectId);
            }
            return next;
        });
    };

    // Handle custom habit creation
    const handleAddCustomHabit = async () => {
        if (!customHabitName.trim()) return;
        setAddingHabit(true);
        try {
            await createHabit({
                name: customHabitName.trim(),
                description: customHabitDesc.trim() || undefined,
            });
            // Reload habits
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

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
                user_id: '',
                log_date: logDate,
                wake_time: wakeTime || undefined,
                bedtime: bedtime || undefined,
                sleep_duration: sleepDuration ? parseFloat(sleepDuration) : undefined,
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
                // Built-in habits
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
                setMessage({ text: 'Log updated successfully!', type: 'success' });
            } else {
                await createDailyLog(logData);
                setMessage({ text: 'Log saved successfully!', type: 'success' });
                setExistingLog(null);
                setIsEditing(false);
            }

            setTimeout(() => setMessage(null), 3000);
        } catch (err) {
            console.error('Error saving log:', err);
            setMessage({ text: 'Failed to save log. Please try again.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // Show loading while settings load
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

    // If settings loaded and no active goals, redirect to setup page
    if (settingsLoaded && !settings?.active_goals) {
        navigate('/Daily-Log/Setup');
        return null;
    }

    // Main daily log form
    return (
        <div className="daily-logs-page-wrapper">
            <div className="dashboard-section daily-logs-section">
                <div className="daily-logs-card">
                    <div className="flex gap-2 mb-4">
                        <button onClick={() => navigate('/Daily-Log/History')} className="btn-action">
                            <i className="i-lucide-history mr-1"></i>View History
                        </button>
                        {isEditing && (
                            <button onClick={resetForm} className="btn-form-cancel">
                                New Entry
                            </button>
                        )}
                    </div>

                    {message && (
                        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-error'} mb-4`}>
                            {message.text}
                        </div>
                    )}

                    {/* Auto-calculated score preview */}
                    <div className="card mb-4">
                        <div className="card-body">
                            <div className="flex items-center justify-between">
                                <span className="form-label mb-0">Daily Score</span>
                                <span className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>
                                    {calculatedScore}/100
                                </span>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="daily-log-form">
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
                                        <input 
                                            type="time" 
                                            value={wakeTime} 
                                            onChange={(e) => setWakeTime(e.target.value)} 
                                            className="form-control" 
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Bedtime</label>
                                        <input 
                                            type="time" 
                                            value={bedtime} 
                                            onChange={(e) => setBedtime(e.target.value)} 
                                            className="form-control" 
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Sleep Duration (hours)</label>
                                        <input 
                                            type="text" 
                                            value={sleepDuration || calculateSleepDuration(wakeTime, bedtime) || ''} 
                                            readOnly 
                                            className="form-control" 
                                            placeholder={sleepGoals?.hours ? `Target: ${sleepGoals.hours}h` : 'Auto-calculated from times above'} 
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Sleep Quality (0-10)</label>
                                        <input 
                                            type="number" 
                                            min="0" 
                                            max="10" 
                                            value={sleepQuality} 
                                            onChange={(e) => setSleepQuality(e.target.value)} 
                                            className="form-control" 
                                            placeholder={sleepGoals?.hours ? `Target: ${sleepGoals.hours * 10}/10` : 'How well did you sleep?'} 
                                        />
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
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Morning BPM</label>
                                            <input type="number" value={morningBpm} onChange={(e) => setMorningBpm(e.target.value)} className="form-control" placeholder="72" />
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
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Evening BPM</label>
                                            <input type="number" value={eveningBpm} onChange={(e) => setEveningBpm(e.target.value)} className="form-control" placeholder="72" />
                                        </div>
                                    </div>
                                    <div className="form-group mt-3">
                                        <label className="form-label">Body Temperature (°C)</label>
                                        <input 
                                            type="number" 
                                            step="0.1" 
                                            value={bodyTemperature} 
                                            onChange={(e) => setBodyTemperature(e.target.value)} 
                                            className="form-control" 
                                            placeholder={nutritionGoals?.water ? '36.5-37.5 (normal)' : '36.5'} 
                                        />
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
                                        <input 
                                            type="number" 
                                            value={calories} 
                                            onChange={(e) => setCalories(e.target.value)} 
                                            className="form-control" 
                                            placeholder={nutritionGoals?.calories ? String(nutritionGoals.calories) : '2000'} 
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="form-group">
                                            <label className="form-label">Protein (g)</label>
                                            <input 
                                                type="number" 
                                                value={protein} 
                                                onChange={(e) => setProtein(e.target.value)} 
                                                className="form-control" 
                                                placeholder={nutritionGoals?.protein ? String(nutritionGoals.protein) : '150'} 
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Carbs (g)</label>
                                            <input 
                                                type="number" 
                                                value={carbs} 
                                                onChange={(e) => setCarbs(e.target.value)} 
                                                className="form-control" 
                                                placeholder={nutritionGoals?.carbs ? String(nutritionGoals.carbs) : '200'} 
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Fat (g)</label>
                                            <input 
                                                type="number" 
                                                value={fat} 
                                                onChange={(e) => setFat(e.target.value)} 
                                                className="form-control" 
                                                placeholder={nutritionGoals?.fat ? String(nutritionGoals.fat) : '65'} 
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Water (ml)</label>
                                        <input 
                                            type="number" 
                                            value={water} 
                                            onChange={(e) => setWater(e.target.value)} 
                                            className="form-control" 
                                            placeholder={nutritionGoals?.water ? String(nutritionGoals.water) : '2500'} 
                                        />
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
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="form-group">
                                            <label className="form-label">Mood (1-10)</label>
                                            <input type="number" min="1" max="10" value={mood} onChange={(e) => setMood(e.target.value)} className="form-control" placeholder="7" />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Project Work Done</label>
                                            <div className="flex items-center gap-2 mt-2">
                                                <input
                                                    type="checkbox"
                                                    checked={projectWorkDone}
                                                    onChange={(e) => setProjectWorkDone(e.target.checked)}
                                                    className="w-4 h-4"
                                                />
                                                <span className="text-sm opacity-80">Completed project work today</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="form-group mt-3">
                                        <label className="form-label">Projects Worked On</label>
                                        <div className="relative">
                                            <select 
                                                className="form-select w-100" 
                                                disabled={loadingProjects || projects.length === 0}
                                            >
                                                <option value="">-- Select projects --</option>
                                            </select>
                                            {!loadingProjects && projects.length > 0 && (
                                                <div className="mt-2 max-h-32 overflow-y-auto border border-[rgba(255,255,255,0.1)] rounded-lg p-2" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                                                    {projects.filter(p => p.status !== 'completed' && p.status !== 'archived').map(project => (
                                                        <label key={project.id} className="flex items-center gap-2 cursor-pointer py-1">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedProjectIds.has(project.id!)}
                                                                onChange={() => handleProjectToggle(project.id!)}
                                                                className="w-3 h-3"
                                                            />
                                                            <span className="text-sm opacity-90">{project.title}</span>
                                                        </label>
                                                    ))}
                                                    {projects.filter(p => p.status !== 'completed' && p.status !== 'archived').length === 0 && (
                                                        <p className="text-xs opacity-50">No active projects. Add projects in Projects page.</p>
                                                    )}
                                                </div>
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
                                    <textarea
                                        value={journalEntry}
                                        onChange={(e) => setJournalEntry(e.target.value)}
                                        className="form-control"
                                        rows={4}
                                        placeholder="How was your day? Any notes or reflections..."
                                    />
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
                                    {/* Built-in habits */}
                                    <label className="flex items-center gap-2 cursor-pointer habit-item">
                                        <input
                                            type="checkbox"
                                            checked={morningRoutine}
                                            onChange={(e) => setMorningRoutine(e.target.checked)}
                                            className="w-4 h-4 accent-[var(--color-primary)]"
                                        />
                                        <span className="text-sm opacity-90">Morning Routine</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer habit-item">
                                        <input
                                            type="checkbox"
                                            checked={eveningRoutine}
                                            onChange={(e) => setEveningRoutine(e.target.checked)}
                                            className="w-4 h-4 accent-[var(--color-primary)]"
                                        />
                                        <span className="text-sm opacity-90">Evening Routine</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer habit-item">
                                        <input
                                            type="checkbox"
                                            checked={fruitServing}
                                            onChange={(e) => setFruitServing(e.target.checked)}
                                            className="w-4 h-4 accent-[var(--color-primary)]"
                                        />
                                        <span className="text-sm opacity-90">Fruit Serving</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer habit-item">
                                        <input
                                            type="checkbox"
                                            checked={studied}
                                            onChange={(e) => setStudied(e.target.checked)}
                                            className="w-4 h-4 accent-[var(--color-primary)]"
                                        />
                                        <span className="text-sm opacity-90">Studied</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer habit-item">
                                        <input
                                            type="checkbox"
                                            checked={stretching}
                                            onChange={(e) => setStretching(e.target.checked)}
                                            className="w-4 h-4 accent-[var(--color-primary)]"
                                        />
                                        <span className="text-sm opacity-90">Stretching</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer habit-item">
                                        <input
                                            type="checkbox"
                                            checked={reading}
                                            onChange={(e) => setReading(e.target.checked)}
                                            className="w-4 h-4 accent-[var(--color-primary)]"
                                        />
                                        <span className="text-sm opacity-90">Reading</span>
                                    </label>
                                    {/* Custom habits from DB */}
                                    {loadingHabits ? (
                                        <p className="text-xs opacity-60">Loading custom habits...</p>
                                    ) : habits.length > 0 && (
                                        <div className="border-t border-[rgba(255,255,255,0.1)] pt-2 mt-1">
                                            <p className="text-xs opacity-50 mb-1">Custom Habits:</p>
                                            {habits.map((habit) => (
                                                <label key={habit.id} className="flex items-center gap-2 cursor-pointer habit-item">
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
                                                        className="w-4 h-4 accent-[var(--color-primary)]"
                                                    />
                                                    <span className="text-sm opacity-90">{habit.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                {/* Custom Habit Creation */}
                                <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                    {!showCustomHabit ? (
                                        <button 
                                            type="button" 
                                            onClick={() => setShowCustomHabit(true)}
                                            className="flex items-center gap-1 text-xs opacity-70 hover:opacity-100"
                                        >
                                            <i className="i-lucide-plus"></i>Add Custom Habit
                                        </button>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            <input
                                                type="text"
                                                value={customHabitName}
                                                onChange={(e) => setCustomHabitName(e.target.value)}
                                                className="form-control text-sm"
                                                placeholder="Habit name"
                                                maxLength={50}
                                            />
                                            <textarea
                                                value={customHabitDesc}
                                                onChange={(e) => setCustomHabitDesc(e.target.value)}
                                                className="form-control text-sm"
                                                placeholder="Description (optional)"
                                                rows={1}
                                                maxLength={100}
                                            />
                                            <div className="flex gap-2">
                                                <button 
                                                    type="button" 
                                                    onClick={handleAddCustomHabit}
                                                    disabled={addingHabit || !customHabitName.trim()}
                                                    className="btn-form-submit text-xs px-2 py-1"
                                                >
                                                    {addingHabit ? 'Adding...' : 'Add'}
                                                </button>
                                                <button 
                                                    type="button" 
                                                    onClick={() => setShowCustomHabit(false)}
                                                    className="btn-form-cancel text-xs px-2 py-1"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 justify-end mt-5">
                            <button type="button" onClick={resetForm} className="btn-form-cancel" disabled={saving}>
                                Clear
                            </button>
                            <button type="submit" className="btn-form-submit" disabled={saving}>
                                {saving ? 'Saving...' : isEditing ? 'Update Log' : 'Save Log'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default DailyLogPage;