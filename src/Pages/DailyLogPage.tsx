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

// Format sleep duration as HH:MM (e.g. 7.5 -> "07:30"), or "--:--" when no data
const formatSleepDuration = (duration: number | null): string => {
    if (duration === null || duration === undefined || isNaN(duration)) return '--:--';
    const hours = Math.floor(duration);
    const minutes = Math.round((duration - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

// Calculate time match score (0-100) - how close actual is to goal

// Calculate sleep duration match score (0-100)

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

// Analyze BPM
const analyzeBPM = (bpm?: number): { status: string; color: string } => {
    if (!bpm) return { status: 'No data', color: 'rgba(255, 255, 255, 0.4)' };
    if (bpm >= 60 && bpm <= 100) return { status: 'Normal', color: 'var(--color-primary)' };
    if (bpm < 60) return { status: 'Low', color: '#ffa500' };
    return { status: 'High', color: 'var(--color-danger)' };
};

// Analyze wake time
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

// Analyze sleep quality
const analyzeSleepQuality = (quality?: number): { status: string; color: string } => {
    if (!quality) return { status: 'No data', color: 'rgba(255, 255, 255, 0.4)' };
    if (quality >= 8) return { status: 'Excellent', color: 'var(--color-primary)' };
    if (quality >= 6) return { status: 'Good', color: 'var(--color-primary)' };
    if (quality >= 4) return { status: 'Fair', color: '#ffa500' };
    return { status: 'Poor', color: 'var(--color-danger)' };
};

// Analyze calories - uses user's goal from active_goals JSON
const analyzeCalories = (calories?: number, settings?: UserSettings | null): { status: string; color: string } => {
    if (!calories) return { status: 'No data - log your calories', color: 'rgba(255, 255, 255, 0.4)' };
    const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;
    const targetCal = activeGoals?.nutrition?.calories;
    if (!targetCal) return { status: 'Set a calorie goal in your profile', color: 'rgba(255, 255, 255, 0.4)' };
    const diff = calories - targetCal;
    if (Math.abs(diff) <= 200) return { status: `On Target (${targetCal} kcal) - great job!`, color: 'var(--color-primary)' };
    if (diff < 0) return { status: `Under by ${Math.abs(diff)} kcal - add more food`, color: '#ffa500' };
    return { status: `Over by ${diff} kcal - consider smaller portions`, color: 'var(--color-danger)' };
};

// Analyze protein - uses user's goal from active_goals JSON
const analyzeProtein = (protein?: number, settings?: UserSettings | null): { status: string; color: string } => {
    if (!protein) return { status: 'No data - log your protein', color: 'rgba(255, 255, 255, 0.4)' };
    const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;
    const targetProtein = activeGoals?.nutrition?.protein;
    if (!targetProtein) return { status: 'Set a protein goal in your profile', color: 'rgba(255, 255, 255, 0.4)' };
    const diff = protein - targetProtein;
    const ratio = protein / targetProtein;
    if (ratio >= 0.85 && ratio <= 1.15) return { status: `Adequate (${targetProtein}g) - well done!`, color: 'var(--color-primary)' };
    if (ratio < 0.85) return { status: `Low - need ${Math.max(0, targetProtein - protein)}g more`, color: '#ffa500' };
    return { status: `High - ${diff}g over your ${targetProtein}g goal`, color: 'var(--color-danger)' };
};

// Analyze carbs - uses user's goal from active_goals JSON
const analyzeCarbs = (carbs?: number, settings?: UserSettings | null): { status: string; color: string } => {
    if (!carbs) return { status: 'No data - log your carbs', color: 'rgba(255, 255, 255, 0.4)' };
    const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;
    const targetCarbs = activeGoals?.nutrition?.carbs;
    if (!targetCarbs) return { status: 'Set a carb goal in your profile', color: 'rgba(255, 255, 255, 0.4)' };
    const diff = carbs - targetCarbs;
    const ratio = carbs / targetCarbs;
    if (ratio >= 0.8 && ratio <= 1.2) return { status: `Adequate (${targetCarbs}g) - good job!`, color: 'var(--color-primary)' };
    if (ratio < 0.8) return { status: `Low - need ${Math.max(0, targetCarbs - carbs)}g more`, color: '#ffa500' };
    return { status: `High - ${diff}g over your ${targetCarbs}g goal`, color: 'var(--color-danger)' };
};

// Analyze fat - uses user's goal from active_goals JSON
const analyzeFat = (fat?: number, settings?: UserSettings | null): { status: string; color: string } => {
    if (!fat) return { status: 'No data - log your fat', color: 'rgba(255, 255, 255, 0.4)' };
    const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;
    const targetFat = activeGoals?.nutrition?.fat;
    if (!targetFat) return { status: 'Set a fat goal in your profile', color: 'rgba(255, 255, 255, 0.4)' };
    const diff = fat - targetFat;
    const ratio = fat / targetFat;
    if (ratio >= 0.8 && ratio <= 1.2) return { status: `Adequate (${targetFat}g) - well done!`, color: 'var(--color-primary)' };
    if (ratio < 0.8) return { status: `Low - need ${Math.max(0, targetFat - fat)}g more`, color: '#ffa500' };
    return { status: `High - ${diff}g over your ${targetFat}g goal`, color: 'var(--color-danger)' };
};

// Analyze water - uses user's goal from active_goals JSON
const analyzeWater = (water?: number, settings?: UserSettings | null): { status: string; color: string } => {
    if (!water) return { status: 'No data - log your water', color: 'rgba(255, 255, 255, 0.4)' };
    const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;
    const targetWater = activeGoals?.nutrition?.water;
    if (!targetWater) return { status: 'Set a water goal in your profile', color: 'rgba(255, 255, 255, 0.4)' };
    if (water >= targetWater) return { status: `Sufficient (${targetWater}ml) - great hydration!`, color: 'var(--color-primary)' };
    if (water >= targetWater * 0.6) return { status: `Adequate - ${targetWater - water}ml to go`, color: '#ffa500' };
    return { status: `Low - need ${targetWater - water}ml more`, color: 'var(--color-danger)' };
};

// Analyze weight - uses user's target_weight from settings
const analyzeWeight = (weight?: number, settings?: UserSettings | null): { status: string; color: string } => {
    if (!weight) return { status: 'No data - log your weight', color: 'rgba(255, 255, 255, 0.4)' };
    if (!settings?.height_cm) return { status: 'Set your height in your profile', color: 'rgba(255, 255, 255, 0.4)' };
    const bmi = weight / Math.pow((settings.height_cm / 100), 2);
    if (bmi < 18.5) return { status: `Underweight (BMI ${bmi.toFixed(1)}) - consider gaining`, color: '#ffa500' };
    if (bmi < 25) return { status: `Normal (BMI ${bmi.toFixed(1)}) - great!`, color: 'var(--color-primary)' };
    if (bmi < 30) return { status: `Overweight (BMI ${bmi.toFixed(1)}) - consider losing`, color: '#ffa500' };
    return { status: `Obese (BMI ${bmi.toFixed(1)}) - consult a professional`, color: 'var(--color-danger)' };
};

// Analyze body fat
const analyzeBodyFat = (bodyFat?: number): { status: string; color: string } => {
    if (!bodyFat) return { status: 'No data - log your body fat', color: 'rgba(255, 255, 255, 0.4)' };
    if (bodyFat < 10) return { status: 'Low - below healthy range', color: '#ffa500' };
    if (bodyFat <= 20) return { status: 'Athlete - excellent!', color: 'var(--color-primary)' };
    if (bodyFat <= 30) return { status: 'Fitness - good range', color: '#ffa500' };
    return { status: 'Obese - consider reducing body fat', color: 'var(--color-danger)' };
};

// Analyze mood
const analyzeMood = (mood?: number): { status: string; color: string } => {
    if (!mood) return { status: 'No data - log your mood', color: 'rgba(255, 255, 255, 0.4)' };
    if (mood >= 8) return { status: 'Great - keep it up!', color: 'var(--color-primary)' };
    if (mood >= 6) return { status: 'Good - nice!', color: 'var(--color-primary)' };
    if (mood >= 4) return { status: 'Neutral - try to lift your spirits', color: '#ffa500' };
    return { status: 'Low - consider rest or social connection', color: 'var(--color-danger)' };
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
    // Calculate score for a single metric (0-100)

    const calculateMetricScore = (type: string, value: string | number | boolean | null | undefined): { score: number; logged: boolean } => {

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

                const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;

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

                const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;

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

                const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;

                const targetCarbs = activeGoals?.nutrition?.carbs;

                if (!targetCarbs) return { score: 50, logged: true };

                const tolerance = targetCarbs * 0.375;

                const diff = Math.abs(c - targetCarbs);

                return { score: Math.max(0, Math.round(100 - (diff / tolerance) * 100)), logged: true };

            }

            case 'fat': {

                const f = parseFloat(value as string);

                if (isNaN(f)) return { score: 0, logged: false };

                const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;

                const targetFat = activeGoals?.nutrition?.fat;

                if (!targetFat) return { score: 50, logged: true };

                const tolerance = targetFat * 0.33;

                const diff = Math.abs(f - targetFat);

                return { score: Math.max(0, Math.round(100 - (diff / tolerance) * 100)), logged: true };

            }

            case 'water': {

                const w = parseFloat(value as string);

                if (isNaN(w)) return { score: 0, logged: false };

                const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;

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

                const activeGoals = (settings?.active_goals as ActiveGoals | undefined) || null;

                const goalHours = activeGoals?.sleep?.hours;

                const qualityScore = Math.round((sq / 10) * 100);

                if (goalHours && computedSleepDuration) {

                    const diff = Math.abs(computedSleepDuration - goalHours);

                    const durationScore = Math.max(0, Math.round(100 - ((diff / 2) * 100)));

                    return { score: Math.round((qualityScore * 0.5) + (durationScore * 0.5)), logged: true };

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

                const targetWeight = settings?.target_weight;

                if (!targetWeight) return { score: 50, logged: true };

                const diff = Math.abs(w - targetWeight);

                if (diff <= 2) return { score: 100, logged: true };

                return { score: Math.max(0, Math.round(100 - ((diff - 2) / 2) * 100)), logged: true };

            }

            case 'bodyFat': {

                const bf = parseFloat(value as string);

                if (isNaN(bf)) return { score: 0, logged: false };

                const targetBodyFat = settings?.target_bodyfat;

                if (!targetBodyFat) return { score: 50, logged: true };

                const diff = Math.abs(bf - targetBodyFat);

                if (diff <= 3) return { score: 100, logged: true };

                return { score: Math.max(0, Math.round(100 - ((diff - 3) / 3) * 100)), logged: true };

            }

            

            default:

                return { score: 0, logged: false };

        }

    };



    // Calculate overall daily score (average of all logged metrics)

    const calculatedScore = useMemo(() => {

        const metrics: { score: number; logged: boolean }[] = [

            calculateMetricScore('morningSystolic', morningSystolic),

            calculateMetricScore('morningDiastolic', morningDiastolic),

            calculateMetricScore('morningBpm', morningBpm),

            calculateMetricScore('eveningSystolic', eveningSystolic),

            calculateMetricScore('eveningDiastolic', eveningDiastolic),

            calculateMetricScore('eveningBpm', eveningBpm),

            calculateMetricScore('bodyTemperature', bodyTemperature),

            calculateMetricScore('calories', calories),

            calculateMetricScore('protein', protein),

            calculateMetricScore('carbs', carbs),

            calculateMetricScore('fat', fat),

            calculateMetricScore('water', water),

            calculateMetricScore('weight', weight),

            calculateMetricScore('bodyFat', bodyFat),

            calculateMetricScore('sleepQuality', sleepQuality),

            calculateMetricScore('morningRoutine', morningRoutine),

            calculateMetricScore('eveningRoutine', eveningRoutine),

            calculateMetricScore('fruitServing', fruitServing),

            calculateMetricScore('studied', studied),

            calculateMetricScore('journal', journal),

            calculateMetricScore('stretching', stretching),

            calculateMetricScore('reading', reading),

            calculateMetricScore('projectWorkDone', projectWorkDone),

        ];

        

        const loggedMetrics = metrics.filter(m => m.logged);

        if (loggedMetrics.length === 0) return 0;

        

        const avg = loggedMetrics.reduce((a, b) => a + b.score, 0) / loggedMetrics.length;

        return Math.round(avg);

    }, [calculateMetricScore, morningSystolic, morningDiastolic, morningBpm, eveningSystolic, eveningDiastolic, eveningBpm, bodyTemperature, calories, protein, carbs, fat, water, weight, bodyFat, sleepQuality, wakeTime, bedtime, computedSleepDuration, morningRoutine, eveningRoutine, fruitServing, studied, journal, stretching, reading, projectWorkDone, settings]);


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
                                </div>
                                <div className="card-body">
                                    <div className="form-group">
                                        <label className="form-label">
                                            Wake Time (24h format)
                                            {wakeTime && (
                                                <span className="text-xs ml-2" style={{ color: analyzeWakeTime(wakeTime || null, activeGoals?.sleep?.wake_time || null).color }}>
                                                    ({analyzeWakeTime(wakeTime || null, activeGoals?.sleep?.wake_time || null).status})
                                                </span>
                                            )}
                                        </label>
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
                                            className="form-control font-mono" 
                                            placeholder="--:--" 
                                            maxLength={5}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">
                                            Bedtime (24h format)
                                            {bedtime && (
                                                <span className="text-xs ml-2" style={{ color: analyzeBedtime(bedtime || null, activeGoals?.sleep?.bedtime || null).color }}>
                                                    ({analyzeBedtime(bedtime || null, activeGoals?.sleep?.bedtime || null).status})
                                                </span>
                                            )}
                                        </label>
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
                                            className="form-control font-mono" 
                                            placeholder="--:--" 
                                            maxLength={5}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">
                                            Sleep Duration
                                            <span className="text-xs ml-2" style={{ color: 'var(--color-primary)' }}>
                                                ({formatSleepDuration(computedSleepDuration)})
                                            </span>
                                        </label>
                                        <input type="text" value={formatSleepDuration(computedSleepDuration)} readOnly className="form-control font-mono" placeholder="--:--" style={{ opacity: 0.7, cursor: 'default' }} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">
                                            Sleep Quality (0-10)
                                            {sleepQuality && (
                                                <span className="text-xs ml-2" style={{ color: analyzeSleepQuality(sleepQuality ? parseInt(sleepQuality) : undefined).color }}>
                                                    ({analyzeSleepQuality(sleepQuality ? parseInt(sleepQuality) : undefined).status})
                                                </span>
                                            )}
                                        </label>
                                        <input type="number" min="0" max="10" value={sleepQuality} onChange={(e) => setSleepQuality(e.target.value)} className="form-control" placeholder="How well did you sleep?" />
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
                                        <div className="form-group">
                                            <label className="form-label">
                                                Morning Systolic
                                                {morningSystolic && morningDiastolic && (
                                                    <span className="text-xs ml-2" style={{ color: calculateBPScore(parseInt(morningSystolic), parseInt(morningDiastolic)).color }}>
                                                        ({calculateBPScore(parseInt(morningSystolic), parseInt(morningDiastolic)).status})
                                                    </span>
                                                )}
                                            </label>
                                            <input type="number" value={morningSystolic} onChange={(e) => setMorningSystolic(e.target.value)} className="form-control" placeholder="120" />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">
                                                Morning Diastolic
                                                {morningSystolic && morningDiastolic && (
                                                    <span className="text-xs ml-2" style={{ color: calculateBPScore(parseInt(morningSystolic), parseInt(morningDiastolic)).color }}>
                                                        ({calculateBPScore(parseInt(morningSystolic), parseInt(morningDiastolic)).status})
                                                    </span>
                                                )}
                                            </label>
                                            <input type="number" value={morningDiastolic} onChange={(e) => setMorningDiastolic(e.target.value)} className="form-control" placeholder="80" />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">
                                                Morning BPM
                                                {morningBpm && (
                                                    <span className="text-xs ml-2" style={{ color: analyzeBPM(morningBpm ? parseInt(morningBpm) : undefined).color }}>
                                                        ({analyzeBPM(morningBpm ? parseInt(morningBpm) : undefined).status})
                                                    </span>
                                                )}
                                            </label>
                                            <input type="number" value={morningBpm} onChange={(e) => setMorningBpm(e.target.value)} className="form-control" placeholder="60-100" />
                                        </div>
                                        </div>
                                        <div className="flex flex-col gap-3">
                                        <div className="form-group">
                                            <label className="form-label">
                                                Evening Systolic
                                                {eveningSystolic && eveningDiastolic && (
                                                    <span className="text-xs ml-2" style={{ color: calculateBPScore(parseInt(eveningSystolic), parseInt(eveningDiastolic)).color }}>
                                                        ({calculateBPScore(parseInt(eveningSystolic), parseInt(eveningDiastolic)).status})
                                                    </span>
                                                )}
                                            </label>
                                            <input type="number" value={eveningSystolic} onChange={(e) => setEveningSystolic(e.target.value)} className="form-control" placeholder="120" />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">
                                                Evening Diastolic
                                                {eveningSystolic && eveningDiastolic && (
                                                    <span className="text-xs ml-2" style={{ color: calculateBPScore(parseInt(eveningSystolic), parseInt(eveningDiastolic)).color }}>
                                                        ({calculateBPScore(parseInt(eveningSystolic), parseInt(eveningDiastolic)).status})
                                                    </span>
                                                )}
                                            </label>
                                            <input type="number" value={eveningDiastolic} onChange={(e) => setEveningDiastolic(e.target.value)} className="form-control" placeholder="80" />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">
                                                Evening BPM
                                                {eveningBpm && (
                                                    <span className="text-xs ml-2" style={{ color: analyzeBPM(eveningBpm ? parseInt(eveningBpm) : undefined).color }}>
                                                        ({analyzeBPM(eveningBpm ? parseInt(eveningBpm) : undefined).status})
                                                    </span>
                                                )}
                                            </label>
                                            <input type="number" value={eveningBpm} onChange={(e) => setEveningBpm(e.target.value)} className="form-control" placeholder="60-100" />
                                        </div>
                                        </div>
                                    </div>
                                    <div className="form-group mt-3">
                                        <label className="form-label">
                                            Body Temperature (°C)
                                            {bodyTemperature && (
                                                <span className="text-xs ml-2" style={{ color: calculateTempScore(parseFloat(bodyTemperature)).color }}>
                                                    ({calculateTempScore(parseFloat(bodyTemperature)).status})
                                                </span>
                                            )}
                                        </label>
                                        <input type="number" step="0.1" value={bodyTemperature} onChange={(e) => setBodyTemperature(e.target.value)} className="form-control" placeholder="36.5" />
                                    </div>
                                </div>
                            </div>

                            <div className="card puzzle-card">
                                <div className="card-header">
                                    <h3 className="card-title"><i className="i-lucide-flame mr-2"></i>Nutrition</h3>
                                </div>
                                <div className="card-body">
                                    <div className="form-group">
                                        <label className="form-label">
                                            Calories
                                            {calories && (
                                                <span className="text-xs ml-2" style={{ color: analyzeCalories(calories ? parseInt(calories) : undefined, settings).color }}>
                                                    ({analyzeCalories(calories ? parseInt(calories) : undefined, settings).status})
                                                </span>
                                            )}
                                        </label>
                                        <input type="number" value={calories} onChange={(e) => setCalories(e.target.value)} className="form-control" placeholder={nutritionGoals?.calories ? String(nutritionGoals.calories) : '2000'} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">
                                            Protein (g)
                                            {protein && (
                                                <span className="text-xs ml-2" style={{ color: analyzeProtein(protein ? parseInt(protein) : undefined, settings).color }}>
                                                    ({analyzeProtein(protein ? parseInt(protein) : undefined, settings).status})
                                                </span>
                                            )}
                                        </label>
                                        <input type="number" value={protein} onChange={(e) => setProtein(e.target.value)} className="form-control" placeholder={nutritionGoals?.protein ? String(nutritionGoals.protein) : '150'} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">
                                            Carbs (g)
                                            {carbs && (
                                                <span className="text-xs ml-2" style={{ color: analyzeCarbs(carbs ? parseInt(carbs) : undefined, settings).color }}>
                                                    ({analyzeCarbs(carbs ? parseInt(carbs) : undefined, settings).status})
                                                </span>
                                            )}
                                        </label>
                                        <input type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} className="form-control" placeholder={nutritionGoals?.carbs ? String(nutritionGoals.carbs) : '200'} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">
                                            Fat (g)
                                            {fat && (
                                                <span className="text-xs ml-2" style={{ color: analyzeFat(fat ? parseInt(fat) : undefined, settings).color }}>
                                                    ({analyzeFat(fat ? parseInt(fat) : undefined, settings).status})
                                                </span>
                                            )}
                                        </label>
                                        <input type="number" value={fat} onChange={(e) => setFat(e.target.value)} className="form-control" placeholder={nutritionGoals?.fat ? String(nutritionGoals.fat) : '65'} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">
                                            Water (ml)
                                            {water && (
                                                <span className="text-xs ml-2" style={{ color: analyzeWater(water ? parseInt(water) : undefined, settings).color }}>
                                                    ({analyzeWater(water ? parseInt(water) : undefined, settings).status})
                                                </span>
                                            )}
                                        </label>
                                        <input type="number" value={water} onChange={(e) => setWater(e.target.value)} className="form-control" placeholder={nutritionGoals?.water ? String(nutritionGoals.water) : '2500'} />
                                    </div>
                                </div>
                            </div>
                        <div className="card puzzle-card">
                                <div className="card-header">
                                    <h3 className="card-title"><i className="i-lucide-weight mr-2"></i>Body Metrics</h3>
                                </div>
                                <div className="card-body">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div className="form-group">
                                            <label className="form-label">
                                                Weight (kg)
                                                {weight && (
                                                    <span className="text-xs ml-2" style={{ color: analyzeWeight(weight ? parseFloat(weight) : undefined, settings).color }}>
                                                        ({analyzeWeight(weight ? parseFloat(weight) : undefined, settings).status})
                                                    </span>
                                                )}
                                            </label>
                                            <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className="form-control" placeholder="75.5" />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">
                                                Body Fat (%)
                                                {bodyFat && (
                                                    <span className="text-xs ml-2" style={{ color: analyzeBodyFat(bodyFat ? parseFloat(bodyFat) : undefined).color }}>
                                                        ({analyzeBodyFat(bodyFat ? parseFloat(bodyFat) : undefined).status})
                                                    </span>
                                                )}
                                            </label>
                                            <input type="number" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} className="form-control" placeholder="15.0" />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">
                                                Mood (1-10)
                                                {mood && (
                                                    <span className="text-xs ml-2" style={{ color: analyzeMood(mood ? parseInt(mood) : undefined).color }}>
                                                        ({analyzeMood(mood ? parseInt(mood) : undefined).status})
                                                    </span>
                                                )}
                                            </label>
                                            <input type="number" min="1" max="10" value={mood} onChange={(e) => setMood(e.target.value)} className="form-control" placeholder="7" />
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