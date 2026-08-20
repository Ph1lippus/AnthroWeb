import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createDailyLog, updateDailyLog, getDailyLogByDate, getDailyLogById, saveDailyLogProjects, getDailyLogProjects } from '../services/dailyLogService';
import { getUserSettings } from '../services/profileService';
import { getUserHabits, toggleHabitForDate, createHabit, getCompletedHabitsForDate } from '../services/habitService';
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

// Calculate time match score (0-100) - how close actual is to goal

// Calculate sleep duration from bedtime and wake time
const analyzeWakeTime = (time: string | null, goalTime: string | null): { status: string; color: string } => {
    if (!time) return { status: 'No data', color: 'rgba(255, 255, 255, 0.4)' };
    if (!goalTime) return { status: 'Set', color: 'rgba(255, 255, 255, 0.4)' };
    const [actualH, actualM] = time.split(':').map(Number);
    const [goalH, goalM] = goalTime.split(':').map(Number);
    const actualMin = actualH * 60 + actualM;
    const goalMin = goalH * 60 + goalM;
    let diff = Math.abs(actualMin - goalMin);
    if (diff > 12 * 60) diff = 24 * 60 - diff;
    if (diff <= 15) return { status: 'On Time', color: 'var(--color-primary)' };
    if (diff <= 30) return { status: 'Close', color: '#ffa500' };
    return { status: 'Off', color: 'var(--color-danger)' };
};

// Analyze bedtime
const analyzeBedtime = (time: string | null, goalTime: string | null): { status: string; color: string } => {
    if (!time) return { status: 'No data', color: 'rgba(255, 255, 255, 0.4)' };
    if (!goalTime) return { status: 'Set', color: 'rgba(255, 255, 255, 0.4)' };
    const [actualH, actualM] = time.split(':').map(Number);
    const [goalH, goalM] = goalTime.split(':').map(Number);
    const actualMin = actualH * 60 + actualM;
    const goalMin = goalH * 60 + goalM;
    let diff = Math.abs(actualMin - goalMin);
    if (diff > 12 * 60) diff = 24 * 60 - diff;
    if (diff <= 15) return { status: 'On Time', color: 'var(--color-primary)' };
    if (diff <= 30) return { status: 'Close', color: '#ffa500' };
    return { status: 'Off', color: 'var(--color-danger)' };
};

// Analyze calories - uses user's goal from active_goals JSON


const DailyLogPage: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id?: string }>();
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [existingLog, setExistingLog] = useState<DailyLog | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [habits, setHabits] = useState<Habit[]>([]);
    const [completedHabits, setCompletedHabits] = useState<Set<string>>(new Set());
    const [loadingHabits, setLoadingHabits] = useState(true);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [isLoadingData, setIsLoadingData] = useState(true);

    const [logDate, setLogDate] = useState(() => {
        return id ? '' : new Date().toISOString().split('T')[0];
    });

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

    // Load log by ID if in edit mode
    useEffect(() => {
        if (!id) return;
        const loadLog = async () => {
            setIsLoadingData(true);
            const log = await getDailyLogById(id);
            if (log) {
                setExistingLog(log);
                setIsEditing(true);
                setLogDate(log.log_date);
                fillForm(log);
                const projectIds = await getDailyLogProjects(log.id!);
                if (projectIds.length > 0) {
                    setSelectedProjectIds(new Set(projectIds));
                }
            }
            setIsLoadingData(false);
        };
        loadLog();
    }, [id]);

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

    // Load completed habits for the current date
    useEffect(() => {
        const loadCompletedHabits = async () => {
            const completed = await getCompletedHabitsForDate(logDate);
            setCompletedHabits(completed);
        };
        loadCompletedHabits();
    }, [logDate]);

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
    const effectiveSettings = useMemo(() => {
        if (id && existingLog?.goal_snapshot) {
            return {
                ...settings,
                active_goals: existingLog.goal_snapshot
            } as UserSettings;
        }
        return settings;
    }, [id, existingLog, settings]);

    const activeGoals = (effectiveSettings?.active_goals as ActiveGoals | undefined) || null;
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
// Calculate score for a single metric (0-100)

const calculateMetricScore = (type: string, value: string | number | boolean | null | undefined, currentSettings: UserSettings | null, computedSleepDuration: number | null): { score: number; logged: boolean } => {

    if (value === null || value === undefined || value === '' || value === false) {

        return { score: 0, logged: false };

    }

    



    switch (type) {

        /* eslint-disable no-fallthrough */
        // === FIXED MEDICAL GUIDELINES (Range-Based) ===

        case 'morningSystolic':

        case 'eveningSystolic': {

            const sys = parseFloat(value as string);

            if (isNaN(sys)) return { score: 0, logged: false };

            if (sys <= 120) return { score: 100, logged: true };

            if (sys >= 140) return { score: 0, logged: true };

            return { score: Math.round(((140 - sys) / 20) * 100), logged: true };

        }

        case 'morningDiastolic':

        case 'eveningDiastolic': {

            const dia = parseFloat(value as string);

            if (isNaN(dia)) return { score: 0, logged: false };

            if (dia <= 80) return { score: 100, logged: true };

            if (dia >= 100) return { score: 0, logged: true };

            return { score: Math.round(((100 - dia) / 20) * 100), logged: true };

        }

        case 'morningBpm':

        case 'eveningBpm': {

            const bpm = parseFloat(value as string);

            if (isNaN(bpm)) return { score: 0, logged: false };

            if (bpm >= 60 && bpm <= 100) return { score: 100, logged: true };

            if (bpm < 40 || bpm > 120) return { score: 0, logged: true };

            if (bpm < 60) return { score: Math.round(((bpm - 40) / 20) * 100), logged: true };

            return { score: Math.round(((120 - bpm) / 20) * 100), logged: true };

        }

        case 'bodyTemperature': {

            const temp = parseFloat(value as string);

            if (isNaN(temp)) return { score: 0, logged: false };

            if (temp >= 36.5 && temp <= 37.5) return { score: 100, logged: true };

            if (temp < 35.5 || temp > 38.5) return { score: 0, logged: true };

            if (temp < 36.5) return { score: Math.round(((temp - 35.5) / 1) * 100), logged: true };

            return { score: Math.round(((38.5 - temp) / 1) * 100), logged: true };

        }

        

        /* eslint-enable no-fallthrough */
        // === USER-DEFINED GOALS (Linear Tolerance) ===

        case 'calories': {

            const cal = parseInt(value as string);

            if (isNaN(cal)) return { score: 0, logged: false };

            const activeGoals = (currentSettings?.active_goals as ActiveGoals | undefined) || null;

            const targetCal = activeGoals?.nutrition?.calories;

            if (!targetCal) return { score: 50, logged: true };

            if (cal <= targetCal) return { score: 100, logged: true };

            const tolerance = targetCal * 0.25;

            const diff = cal - targetCal;

            return { score: Math.max(0, Math.round(100 - (diff / tolerance) * 100)), logged: true };

        }

        case 'protein': {

            const p = parseFloat(value as string);

            if (isNaN(p)) return { score: 0, logged: false };

            const activeGoals = (currentSettings?.active_goals as ActiveGoals | undefined) || null;

            const targetProtein = activeGoals?.nutrition?.protein;

            if (!targetProtein) return { score: 50, logged: true };

            if (p >= targetProtein) return { score: 100, logged: true };

            const tolerance = targetProtein * 0.33;

            const diff = targetProtein - p;

            return { score: Math.max(0, Math.round(100 - (diff / tolerance) * 100)), logged: true };

        }

        case 'carbs': {

            const c = parseFloat(value as string);

            if (isNaN(c)) return { score: 0, logged: false };

            const activeGoals = (currentSettings?.active_goals as ActiveGoals | undefined) || null;

            const targetCarbs = activeGoals?.nutrition?.carbs;

            if (!targetCarbs) return { score: 50, logged: true };

            const tolerance = targetCarbs * 0.375;

            const diff = Math.abs(c - targetCarbs);

            return { score: Math.max(0, Math.round(100 - (diff / tolerance) * 100)), logged: true };

        }

        case 'fat': {

            const f = parseFloat(value as string);

            if (isNaN(f)) return { score: 0, logged: false };

            const activeGoals = (currentSettings?.active_goals as ActiveGoals | undefined) || null;

            const targetFat = activeGoals?.nutrition?.fat;

            if (!targetFat) return { score: 50, logged: true };

            const tolerance = targetFat * 0.33;

            const diff = Math.abs(f - targetFat);

            return { score: Math.max(0, Math.round(100 - (diff / tolerance) * 100)), logged: true };

        }

        case 'water': {

            const w = parseFloat(value as string);

            if (isNaN(w)) return { score: 0, logged: false };

            const activeGoals = (currentSettings?.active_goals as ActiveGoals | undefined) || null;

            const targetWater = activeGoals?.nutrition?.water;

            if (!targetWater) return { score: 50, logged: true };

            if (w >= targetWater) return { score: 100, logged: true };

            const tolerance = targetWater * 0.3;

            const diff = targetWater - w;

            return { score: Math.max(0, Math.round(100 - (diff / tolerance) * 100)), logged: true };

        }

        case 'sleepQuality': {

            const sq = parseInt(value as string);

            if (isNaN(sq)) return { score: 0, logged: false };

            const activeGoals = (currentSettings?.active_goals as ActiveGoals | undefined) || null;

            const goalHours = activeGoals?.sleep?.hours;

            const qualityScore = Math.round((sq / 10) * 100);

            if (goalHours && computedSleepDuration) {

                const diff = Math.abs(computedSleepDuration - goalHours);

                const durationScore = Math.max(0, Math.round(100 - ((diff / 1.5) * 100)));

                let combined = Math.round((qualityScore * 0.4) + (durationScore * 0.6));

                if (diff > 2) combined = Math.min(combined, 30);

                return { score: combined, logged: true };

            }

            // Cap quality-only score at 60 to avoid inflated scores when only sleep quality is logged

            return { score: Math.min(60, qualityScore), logged: true };

        }

        

        /* eslint-disable no-fallthrough */
        // === BINARY HABITS ===

        case 'morningRoutine':

        case 'eveningRoutine':

        case 'fruitServing':

        case 'studied':

        case 'journal':

        case 'stretching':

        case 'reading':

        case 'projectWorkDone':

            return { score: value ? 100 : 0, logged: true };

        

        /* eslint-enable no-fallthrough */
        // === OPTIONAL FIELDS ===

        case 'weight': {

            const w = parseFloat(value as string);

            if (isNaN(w)) return { score: 0, logged: false };

            const targetWeight = currentSettings?.target_weight;

            if (!targetWeight) return { score: 50, logged: true };

            const diff = Math.abs(w - targetWeight);

            if (diff <= 2) return { score: 100, logged: true };

            return { score: Math.max(0, Math.round(100 - ((diff - 2) / 2) * 100)), logged: true };

        }

        case 'bodyFat': {

            const bf = parseFloat(value as string);

            if (isNaN(bf)) return { score: 0, logged: false };

            const targetBodyFat = currentSettings?.target_bodyfat;

            if (!targetBodyFat) return { score: 50, logged: true };

            const diff = Math.abs(bf - targetBodyFat);

            if (diff <= 3) return { score: 100, logged: true };

            return { score: Math.max(0, Math.round(100 - ((diff - 3) / 3) * 100)), logged: true };

        }

        

        default:

            return { score: 0, logged: false };

    }

};

const getInputScore = (type: string, value: string | number | null | undefined, activeGoals: ActiveGoals | null | undefined, computedSleepDuration: number | null): number => {
    switch (type) {
        case 'wakeTime': {
            if (!value) return 0;
            const analysis = analyzeWakeTime(value as string, activeGoals?.sleep?.wake_time || null);
            if (analysis.status === 'On Time') return 100;
            if (analysis.status === 'Close') return 70;
            if (analysis.status === 'Off') return 30;
            return 0;
        }
        case 'bedtime': {
            if (!value) return 0;
            const analysis = analyzeBedtime(value as string, activeGoals?.sleep?.bedtime || null);
            if (analysis.status === 'On Time') return 100;
            if (analysis.status === 'Close') return 70;
            if (analysis.status === 'Off') return 30;
            return 0;
        }
        case 'mood': {
            if (!value) return 0;
            const m = parseInt(value as string);
            if (isNaN(m)) return 0;
            if (m >= 8) return 100;
            if (m >= 6) return 80;
            if (m >= 4) return 50;
            return 20;
        }
        default: {
            const result = calculateMetricScore(type, value, settings, computedSleepDuration);
            return result.score;
        }
    }
};

    // Calculate overall daily score (average of all logged metrics)

    const calculatedScore = useMemo(() => {

        const metrics: { score: number; logged: boolean }[] = [

            calculateMetricScore('morningSystolic', morningSystolic, effectiveSettings, computedSleepDuration),

            calculateMetricScore('morningDiastolic', morningDiastolic, effectiveSettings, computedSleepDuration),

            calculateMetricScore('morningBpm', morningBpm, effectiveSettings, computedSleepDuration),

            calculateMetricScore('eveningSystolic', eveningSystolic, effectiveSettings, computedSleepDuration),

            calculateMetricScore('eveningDiastolic', eveningDiastolic, effectiveSettings, computedSleepDuration),

            calculateMetricScore('eveningBpm', eveningBpm, effectiveSettings, computedSleepDuration),

            calculateMetricScore('bodyTemperature', bodyTemperature, effectiveSettings, computedSleepDuration),

            calculateMetricScore('calories', calories, effectiveSettings, computedSleepDuration),

            calculateMetricScore('protein', protein, effectiveSettings, computedSleepDuration),

            calculateMetricScore('carbs', carbs, effectiveSettings, computedSleepDuration),

            calculateMetricScore('fat', fat, effectiveSettings, computedSleepDuration),

            calculateMetricScore('water', water, effectiveSettings, computedSleepDuration),

            calculateMetricScore('weight', weight, effectiveSettings, computedSleepDuration),

            calculateMetricScore('bodyFat', bodyFat, effectiveSettings, computedSleepDuration),

            calculateMetricScore('sleepQuality', sleepQuality, effectiveSettings, computedSleepDuration),

            calculateMetricScore('morningRoutine', morningRoutine, effectiveSettings, computedSleepDuration),

            calculateMetricScore('eveningRoutine', eveningRoutine, effectiveSettings, computedSleepDuration),

            calculateMetricScore('fruitServing', fruitServing, effectiveSettings, computedSleepDuration),

            calculateMetricScore('studied', studied, effectiveSettings, computedSleepDuration),

            calculateMetricScore('journal', journal, effectiveSettings, computedSleepDuration),

            calculateMetricScore('stretching', stretching, effectiveSettings, computedSleepDuration),

            calculateMetricScore('reading', reading, effectiveSettings, computedSleepDuration),

            calculateMetricScore('projectWorkDone', projectWorkDone, effectiveSettings, computedSleepDuration),

        ];

        

        const loggedMetrics = metrics.filter(m => m.logged);

        if (loggedMetrics.length === 0) return 0;

        

        const avg = loggedMetrics.reduce((a, b) => a + b.score, 0) / loggedMetrics.length;

        return Math.round(avg);

    }, [morningSystolic, morningDiastolic, morningBpm, eveningSystolic, eveningDiastolic, eveningBpm, bodyTemperature, calories, protein, carbs, fat, water, weight, bodyFat, sleepQuality, morningRoutine, eveningRoutine, fruitServing, studied, journal, stretching, reading, projectWorkDone, effectiveSettings, computedSleepDuration]);

    useEffect(() => {
        if (id) return;
        const checkExisting = async () => {
            if (!logDate) return;
            setIsLoadingData(true);
            const log = await getDailyLogByDate(logDate);
            if (log) {
                setExistingLog(log);
                setIsEditing(true);
                fillForm(log);
                // Load project associations from junction table
                const projectIds = await getDailyLogProjects(log.id!);
                if (projectIds.length > 0) {
                    setSelectedProjectIds(new Set(projectIds));
                }
            } else {
                setExistingLog(null);
                setIsEditing(false);
            }
            setIsLoadingData(false);
        };
        checkExisting();
    }, [logDate, id]);

    // Auto-save function
    const performSave = useCallback(async () => {
        if (!settings) return;
        
        setSaving(true);
        setSaveError(null);
        try {
            let goalSnapshot: Record<string, unknown> | undefined | null;
            if (id && existingLog?.goal_snapshot) {
                goalSnapshot = existingLog.goal_snapshot;
            } else {
                const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;
                goalSnapshot = activeGoals || settings ? {
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
            }

            const logData: Omit<DailyLog, 'id' | 'created_at' | 'updated_at'> = {
                log_date: logDate,
                wake_time: wakeTime || null,
                bedtime: bedtime || null,
                sleep_duration: computedSleepDuration || null,
                sleep_quality: sleepQuality ? Math.round(parseFloat(sleepQuality)) : null,
                morning_systolic: morningSystolic ? parseInt(morningSystolic) : null,
                morning_diastolic: morningDiastolic ? parseInt(morningDiastolic) : null,
                morning_bpm: morningBpm ? parseInt(morningBpm) : null,
                evening_systolic: eveningSystolic ? parseInt(eveningSystolic) : null,
                evening_diastolic: eveningDiastolic ? parseInt(eveningDiastolic) : null,
                evening_bpm: eveningBpm ? parseInt(eveningBpm) : null,
                body_temperature: bodyTemperature ? parseFloat(bodyTemperature) : null,
                calories: calories ? parseInt(calories) : null,
                protein: protein ? parseInt(protein) : null,
                carbs: carbs ? parseInt(carbs) : null,
                fat: fat ? parseInt(fat) : null,
                water: water ? parseInt(water) : null,
                weight: weight ? parseFloat(weight) : null,
                body_fat: bodyFat ? parseFloat(bodyFat) : null,
                mood: mood ? Math.round(parseFloat(mood)) : null,
                daily_score: calculatedScore,
                journal_entry: journalEntry || null,
                project_work_done: projectWorkDone,
                goal_snapshot: goalSnapshot ?? null,
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
                await saveDailyLogProjects(existingLog.id, Array.from(selectedProjectIds));
            } else {
                const newLog = await createDailyLog(logData);
                if (newLog) {
                    setExistingLog(newLog as DailyLog);
                    setIsEditing(true);
                    await saveDailyLogProjects(newLog.id, Array.from(selectedProjectIds));
                }
            }
            setLastSaved(new Date());
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save. Please try again.';
            setSaveError(message);
            console.error('Auto-save error:', err);
        } finally {
            setSaving(false);
        }
    }, [settings, logDate, wakeTime, bedtime, computedSleepDuration, sleepQuality, morningSystolic, morningDiastolic, morningBpm, eveningSystolic, eveningDiastolic, eveningBpm, bodyTemperature, calories, protein, carbs, fat, water, weight, bodyFat, mood, journalEntry, selectedProjectIds, projectWorkDone, calculatedScore, morningRoutine, eveningRoutine, fruitServing, studied, journal, stretching, reading, isEditing, existingLog, id]);

    useEffect(() => {
        if (saveError) {
            const timer = setTimeout(() => setSaveError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [saveError]);

    // Debounced auto-save on any state change
    useEffect(() => {
        if (!settings || isLoadingData) return;

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
    }, [wakeTime, bedtime, sleepQuality, morningSystolic, morningDiastolic, morningBpm, eveningSystolic, eveningDiastolic, eveningBpm, bodyTemperature, calories, protein, carbs, fat, water, weight, bodyFat, mood, journalEntry, selectedProjectIds, projectWorkDone, morningRoutine, eveningRoutine, fruitServing, studied, journal, stretching, reading, performSave, settings, isLoadingData]);

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
        if (score >= 60) return '#a8e600';
        if (score >= 30) return '#ffa500';
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
                        {id && (
                            <button onClick={() => navigate('/Daily-Log')} className="btn-action">
                                <i className="i-lucide-arrow-left mr-1"></i>Today's Log
                            </button>
                        )}
                    </div>
                    

                    {/* Auto-save indicator */}
                    <div className="flex items-center justify-end gap-2 mb-2 text-xs">
                        {saveError ? (
                            <span style={{ color: 'var(--color-danger)' }}><i className="i-lucide-alert-circle mr-1"></i>{saveError}</span>
                        ) : saving ? (
                            <span className="opacity-60"><i className="i-lucide-loader animate-spin mr-1"></i>Saving...</span>
                        ) : lastSaved ? (
                            <span className="opacity-60"><i className="i-lucide-check mr-1" style={{ color: 'var(--color-primary)' }}></i>Saved {lastSaved.toLocaleTimeString()}</span>
                        ) : (
                            <span className="opacity-60">Auto-saves as you type</span>
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
                                <span className="text-xs opacity-60">
                                {new Date(logDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                            </span>
                            </div>
                        </div>
                    </div>

                    <div className="daily-log-form">

                        {/* Puzzle/Masonry layout - each card only uses the height it needs */}
                        <div className="daily-log-puzzle daily-log-puzzle-3">
                            <div className="card puzzle-card">
                                <div className="card-header">
                                    <h3 className="card-title"><i className="i-lucide-sun mr-2"></i>Sleep</h3>
                                    {computedSleepDuration != null && (
                                        <span className="text-sm opacity-70 ml-2">{computedSleepDuration}h</span>
                                    )}
                                </div>
                                <div className="card-body">
                                    <div className="scored-input-wrap">
                                        <input 
                                            type="text" 
                                            value={wakeTime || ''} 
                                            onChange={(e) => {
                                                let val = e.target.value.replace(/\D/g, '');
                                                if (val.length >= 3) {
                                                    val = val.slice(0, 2) + ':' + val.slice(2, 4);
                                                }
                                                if (val.length > 5) val = val.slice(0, 5);
                                                if (/^(\d{2}:)?(\d{0,2})$/.test(val)) {
                                                    const parts = val.split(':');
                                                    if (parts[0] && parseInt(parts[0]) > 23) return;
                                                    if (parts[1] && parseInt(parts[1]) > 59) return;
                                                    setWakeTime(val);
                                                }
                                            }}
                                            onBlur={(e) => {
                                                const val = e.target.value;
                                                if (val.length === 4 && !val.includes(':')) {
                                                    setWakeTime(val.slice(0, 2) + ':' + val.slice(2));
                                                }
                                            }}
                                            className={"scored-input font-mono" + (wakeTime ? '' : ' scored-input--empty')} 
                                            placeholder=" "
                                            maxLength={5}
                                            style={wakeTime ? { borderColor: getScoreColor(getInputScore('wakeTime', wakeTime, activeGoals, computedSleepDuration)) } : undefined}
                                        />
                                        <label className="scored-input-label">Wake Time (24h format) <span className="scored-input-goal-inline">{activeGoals?.sleep?.wake_time || '--:--'}</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input 
                                            type="text" 
                                            value={bedtime || ''} 
                                            onChange={(e) => {
                                                let val = e.target.value.replace(/\D/g, '');
                                                if (val.length >= 3) {
                                                    val = val.slice(0, 2) + ':' + val.slice(2, 4);
                                                }
                                                if (val.length > 5) val = val.slice(0, 5);
                                                if (/^(\d{2}:)?(\d{0,2})$/.test(val)) {
                                                    const parts = val.split(':');
                                                    if (parts[0] && parseInt(parts[0]) > 23) return;
                                                    if (parts[1] && parseInt(parts[1]) > 59) return;
                                                    setBedtime(val);
                                                }
                                            }}
                                            onBlur={(e) => {
                                                const val = e.target.value;
                                                if (val.length === 4 && !val.includes(':')) {
                                                    setBedtime(val.slice(0, 2) + ':' + val.slice(2));
                                                }
                                            }}
                                            className={"scored-input font-mono" + (bedtime ? '' : ' scored-input--empty')} 
                                            placeholder=" "
                                            maxLength={5}
                                            style={bedtime ? { borderColor: getScoreColor(getInputScore('bedtime', bedtime, activeGoals, computedSleepDuration)) } : undefined}
                                        />
                                        <label className="scored-input-label">Bedtime (24h format) <span className="scored-input-goal-inline">{activeGoals?.sleep?.bedtime || '--:--'}</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input type="number" min="0" max="10" step="1" value={sleepQuality} onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 0 && val <= 10) setSleepQuality(e.target.value);
                                            else if (e.target.value === '') setSleepQuality('');
                                        }} className={"scored-input" + (sleepQuality ? '' : ' scored-input--empty')} placeholder=" " style={sleepQuality ? { borderColor: getScoreColor(getInputScore('sleepQuality', sleepQuality, activeGoals, computedSleepDuration)) } : undefined} />
                                        <label className="scored-input-label">Sleep Quality (0-10) <span className="scored-input-goal-inline">{activeGoals?.sleep?.hours || 8}h sleep</span></label>
                                    </div>
                                </div>
                            </div>

                            <div className="card puzzle-card">
                                <div className="card-header">
                                    <h3 className="card-title"><i className="i-lucide-activity mr-2"></i>Blood Pressure & Heart Rate</h3>
                                </div>
                                <div className="card-body">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-3">
                                        <div className="scored-input-wrap">
                                            <input type="number" value={morningSystolic} onChange={(e) => setMorningSystolic(e.target.value)} className={"scored-input" + (morningSystolic ? '' : ' scored-input--empty')} placeholder=" " style={morningSystolic ? { borderColor: getScoreColor(getInputScore('morningSystolic', morningSystolic, activeGoals, computedSleepDuration)) } : undefined} />
                                            <label className="scored-input-label">Morning Systolic <span className="scored-input-goal-inline">120</span></label>
                                        </div>
                                        <div className="scored-input-wrap">
                                            <input type="number" value={morningDiastolic} onChange={(e) => setMorningDiastolic(e.target.value)} className={"scored-input" + (morningDiastolic ? '' : ' scored-input--empty')} placeholder=" " style={morningDiastolic ? { borderColor: getScoreColor(getInputScore('morningDiastolic', morningDiastolic, activeGoals, computedSleepDuration)) } : undefined} />
                                            <label className="scored-input-label">Morning Diastolic <span className="scored-input-goal-inline">80</span></label>
                                        </div>
                                        <div className="scored-input-wrap">
                                            <input type="number" value={morningBpm} onChange={(e) => setMorningBpm(e.target.value)} className={"scored-input" + (morningBpm ? '' : ' scored-input--empty')} placeholder=" " style={morningBpm ? { borderColor: getScoreColor(getInputScore('morningBpm', morningBpm, activeGoals, computedSleepDuration)) } : undefined} />
                                            <label className="scored-input-label">Morning BPM <span className="scored-input-goal-inline">60-100</span></label>
                                        </div>
                                        </div>
                                        <div className="flex flex-col gap-3">
                                        <div className="scored-input-wrap">
                                            <input type="number" value={eveningSystolic} onChange={(e) => setEveningSystolic(e.target.value)} className={"scored-input" + (eveningSystolic ? '' : ' scored-input--empty')} placeholder=" " style={eveningSystolic ? { borderColor: getScoreColor(getInputScore('eveningSystolic', eveningSystolic, activeGoals, computedSleepDuration)) } : undefined} />
                                            <label className="scored-input-label">Evening Systolic <span className="scored-input-goal-inline">120</span></label>
                                        </div>
                                        <div className="scored-input-wrap">
                                            <input type="number" value={eveningDiastolic} onChange={(e) => setEveningDiastolic(e.target.value)} className={"scored-input" + (eveningDiastolic ? '' : ' scored-input--empty')} placeholder=" " style={eveningDiastolic ? { borderColor: getScoreColor(getInputScore('eveningDiastolic', eveningDiastolic, activeGoals, computedSleepDuration)) } : undefined} />
                                            <label className="scored-input-label">Evening Diastolic <span className="scored-input-goal-inline">80</span></label>
                                        </div>
                                        <div className="scored-input-wrap">
                                            <input type="number" value={eveningBpm} onChange={(e) => setEveningBpm(e.target.value)} className={"scored-input" + (eveningBpm ? '' : ' scored-input--empty')} placeholder=" " style={eveningBpm ? { borderColor: getScoreColor(getInputScore('eveningBpm', eveningBpm, activeGoals, computedSleepDuration)) } : undefined} />
                                            <label className="scored-input-label">Evening BPM <span className="scored-input-goal-inline">60-100</span></label>
                                        </div>
                                        </div>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input type="number" step="0.1" value={bodyTemperature} onChange={(e) => {
                                            const val = parseFloat(e.target.value);
                                            if (!isNaN(val) && val >= 35 && val <= 42) setBodyTemperature(e.target.value);
                                            else if (e.target.value === '') setBodyTemperature('');
                                        }} className={"scored-input" + (bodyTemperature ? '' : ' scored-input--empty')} placeholder=" " style={bodyTemperature ? { borderColor: getScoreColor(getInputScore('bodyTemperature', bodyTemperature, activeGoals, computedSleepDuration)) } : undefined} />
                                        <label className="scored-input-label">Body Temperature (°C) <span className="scored-input-goal-inline">36.5</span></label>
                                    </div>
                                </div>
                            </div>

                            <div className="card puzzle-card">
                                <div className="card-header">
                                    <h3 className="card-title"><i className="i-lucide-flame mr-2"></i>Nutrition</h3>
                                </div>
                                <div className="card-body">
                                    <div className="scored-input-wrap">
                                        <input type="number" value={calories} onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 0) setCalories(e.target.value);
                                            else if (e.target.value === '') setCalories('');
                                        }} className={"scored-input" + (calories ? '' : ' scored-input--empty')} placeholder=" " style={calories ? { borderColor: getScoreColor(getInputScore('calories', calories, activeGoals, computedSleepDuration)) } : undefined} />
                                        <label className="scored-input-label">Calories <span className="scored-input-goal-inline">{nutritionGoals?.calories || 2000}</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input type="number" value={protein} onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 0) setProtein(e.target.value);
                                            else if (e.target.value === '') setProtein('');
                                        }} className={"scored-input" + (protein ? '' : ' scored-input--empty')} placeholder=" " style={protein ? { borderColor: getScoreColor(getInputScore('protein', protein, activeGoals, computedSleepDuration)) } : undefined} />
                                        <label className="scored-input-label">Protein <span className="scored-input-goal-inline">{nutritionGoals?.protein || 150}g</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input type="number" value={carbs} onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 0) setCarbs(e.target.value);
                                            else if (e.target.value === '') setCarbs('');
                                        }} className={"scored-input" + (carbs ? '' : ' scored-input--empty')} placeholder=" " style={carbs ? { borderColor: getScoreColor(getInputScore('carbs', carbs, activeGoals, computedSleepDuration)) } : undefined} />
                                        <label className="scored-input-label">Carbs <span className="scored-input-goal-inline">{nutritionGoals?.carbs || 200}g</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input type="number" value={fat} onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 0) setFat(e.target.value);
                                            else if (e.target.value === '') setFat('');
                                        }} className={"scored-input" + (fat ? '' : ' scored-input--empty')} placeholder=" " style={fat ? { borderColor: getScoreColor(getInputScore('fat', fat, activeGoals, computedSleepDuration)) } : undefined} />
                                        <label className="scored-input-label">Fat <span className="scored-input-goal-inline">{nutritionGoals?.fat || 65}g</span></label>
                                    </div>
                                    <div className="scored-input-wrap">
                                        <input type="number" value={water} onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 0) setWater(e.target.value);
                                            else if (e.target.value === '') setWater('');
                                        }} className={"scored-input" + (water ? '' : ' scored-input--empty')} placeholder=" " style={water ? { borderColor: getScoreColor(getInputScore('water', water, activeGoals, computedSleepDuration)) } : undefined} />
                                        <label className="scored-input-label">Water <span className="scored-input-goal-inline">{nutritionGoals?.water || 2500}ml</span></label>
                                    </div>
                                </div>
                            </div>
                        <div className="card puzzle-card">
                                <div className="card-header">
                                    <h3 className="card-title"><i className="i-lucide-weight mr-2"></i>Body Metrics</h3>
                                </div>
                                <div className="card-body">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div className="scored-input-wrap">
                                            <input type="number" step="0.1" value={weight} onChange={(e) => {
                                            const val = parseFloat(e.target.value);
                                            if (!isNaN(val) && val >= 0) setWeight(e.target.value);
                                            else if (e.target.value === '') setWeight('');
                                        }} className={"scored-input" + (weight ? '' : ' scored-input--empty')} placeholder=" " style={weight ? { borderColor: getScoreColor(getInputScore('weight', weight, activeGoals, computedSleepDuration)) } : undefined} />
                                            <label className="scored-input-label">Weight (kg) <span className="scored-input-goal-inline">{settings?.target_weight || '--'}kg</span></label>
                                        </div>
                                        <div className="scored-input-wrap">
                                            <input type="number" step="0.1" value={bodyFat} onChange={(e) => {
                                            const val = parseFloat(e.target.value);
                                            if (!isNaN(val) && val >= 0 && val <= 100) setBodyFat(e.target.value);
                                            else if (e.target.value === '') setBodyFat('');
                                        }} className={"scored-input" + (bodyFat ? '' : ' scored-input--empty')} placeholder=" " style={bodyFat ? { borderColor: getScoreColor(getInputScore('bodyFat', bodyFat, activeGoals, computedSleepDuration)) } : undefined} />
                                            <label className="scored-input-label">Body Fat (%) <span className="scored-input-goal-inline">{settings?.target_bodyfat || '--'}%</span></label>
                                        </div>
                                        <div className="scored-input-wrap">
                                            <input type="number" min="1" max="10" step="1" value={mood} onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 1 && val <= 10) setMood(e.target.value);
                                            else if (e.target.value === '') setMood('');
                                        }} className={"scored-input" + (mood ? '' : ' scored-input--empty')} placeholder=" " style={mood ? { borderColor: getScoreColor(getInputScore('mood', mood, activeGoals, computedSleepDuration)) } : undefined} />
                                            <label className="scored-input-label">Mood (1-10) <span className="scored-input-goal-inline">8+</span></label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Habits Section */}
                            <div className="card puzzle-card mb-4">
                                <div className="card-header">
                                    <h3 className="card-title"><i className="i-lucide-check-circle mr-2"></i>Habits</h3>
                                </div>
                                <div className="card-body">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-2">
                                            <label className="checkbox-label">
                                                <input type="checkbox" checked={morningRoutine} onChange={(e) => setMorningRoutine(e.target.checked)} className="checkbox-input" />
                                                <span className="checkbox-custom"></span>
                                                <span className="text-sm opacity-90">Morning Routine</span>
                                                {morningRoutine && (
                                                    <span className="text-xs ml-2" style={{ color: 'var(--color-primary)' }}>(Done)</span>
                                                )}
                                            </label>
                                            <label className="checkbox-label">
                                                <input type="checkbox" checked={eveningRoutine} onChange={(e) => setEveningRoutine(e.target.checked)} className="checkbox-input" />
                                                <span className="checkbox-custom"></span>
                                                <span className="text-sm opacity-90">Evening Routine</span>
                                                {eveningRoutine && (
                                                    <span className="text-xs ml-2" style={{ color: 'var(--color-primary)' }}>(Done)</span>
                                                )}
                                            </label>
                                            <label className="checkbox-label">
                                                <input type="checkbox" checked={fruitServing} onChange={(e) => setFruitServing(e.target.checked)} className="checkbox-input" />
                                                <span className="checkbox-custom"></span>
                                                <span className="text-sm opacity-90">Fruit Serving</span>
                                                {fruitServing && (
                                                    <span className="text-xs ml-2" style={{ color: 'var(--color-primary)' }}>(Done)</span>
                                                )}
                                            </label>
                                            <label className="checkbox-label">
                                                <input type="checkbox" checked={studied} onChange={(e) => setStudied(e.target.checked)} className="checkbox-input" />
                                                <span className="checkbox-custom"></span>
                                                <span className="text-sm opacity-90">Studied</span>
                                                {studied && (
                                                    <span className="text-xs ml-2" style={{ color: 'var(--color-primary)' }}>(Done)</span>
                                                )}
                                            </label>
                                            <label className="checkbox-label">
                                                <input type="checkbox" checked={stretching} onChange={(e) => setStretching(e.target.checked)} className="checkbox-input" />
                                                <span className="checkbox-custom"></span>
                                                <span className="text-sm opacity-90">Stretching</span>
                                                {stretching && (
                                                    <span className="text-xs ml-2" style={{ color: 'var(--color-primary)' }}>(Done)</span>
                                                )}
                                            </label>
                                            <label className="checkbox-label">
                                                <input type="checkbox" checked={reading} onChange={(e) => setReading(e.target.checked)} className="checkbox-input" />
                                                <span className="checkbox-custom"></span>
                                                <span className="text-sm opacity-90">Reading</span>
                                                {reading && (
                                                    <span className="text-xs ml-2" style={{ color: 'var(--color-primary)' }}>(Done)</span>
                                                )}
                                            </label>
                                        </div>
                                        
                                        <div className="flex flex-col gap-2">
                                            <label className="checkbox-label">
                                                <input type="checkbox" checked={projectWorkDone} onChange={(e) => setProjectWorkDone(e.target.checked)} className="checkbox-input" />
                                                <span className="checkbox-custom"></span>
                                                <span className="text-sm opacity-90">Project Work Done</span>
                                                {projectWorkDone && (
                                                    <span className="text-xs ml-2" style={{ color: 'var(--color-primary)' }}>(Done)</span>
                                                )}
                                            </label>
                                            
                                            {projectWorkDone && (
                                                <div className="border-t border-[rgba(255,255,255,0.1)] pt-2 mt-1">
                                                    <p className="text-xs opacity-50 mb-2">Projects Worked On:</p>
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
                                                            <p className="text-xs opacity-50">No active projects</p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {loadingHabits ? (
                                        <p className="text-xs opacity-60 mt-3">Loading custom habits...</p>
                                    ) : habits.length > 0 && (
                                        <div className="border-t border-[rgba(255,255,255,0.1)] pt-2 mt-3">
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
        </div>
    );
};

export default DailyLogPage;
