export interface ActiveGoals {
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

export interface MetricScore {
    score: number;
    logged: boolean;
}

// Calculate sleep duration from bedtime and wake time
export const calculateSleepDuration = (wakeTime: string, bedtime: string): number | null => {
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

interface TimeAnalysis {
    status: string;
    color: string;
}

const analyzeTime = (time: string | null, goalTime: string | null): TimeAnalysis => {
    if (!time) return { status: 'No data', color: 'rgba(255, 255, 255, 0.4)' };
    if (!goalTime) return { status: 'Set', color: 'rgba(255, 255, 255, 0.4)' };
    const [actualH, actualM] = time.split(':').map(Number);
    const [goalH, goalM] = goalTime.split(':').map(Number);
    const actualMin = actualH * 60 + actualM;
    const goalMin = goalH * 60 + goalM;
    let diff = Math.abs(actualMin - goalMin);
    if (diff > 12 * 60) diff = 24 * 60 - diff;
    if (diff <= 15) return { status: 'On Time', color: 'var(--color-primary)' };
    if (diff <= 60) return { status: 'Close', color: '#ffa500' };
    return { status: 'Off', color: 'var(--color-danger)' };
};

export const getScoreColor = (score: number) => {
    if (score >= 80) return 'var(--color-primary)';
    if (score >= 60) return '#a8e600';
    if (score >= 30) return '#ffa500';
    return 'var(--color-danger)';
};

// Score a single numeric/boolean metric. Boolean habits are NOT handled here
// (they are grouped via habitGroupScore instead).
export const calculateMetricScore = (
    type: string,
    value: string | number | boolean | null | undefined,
    currentSettings: { active_goals?: unknown; target_weight?: number | null; target_bodyfat?: number | null } | null,
    computedSleepDuration: number | null
): MetricScore => {
    if (value === null || value === undefined || value === '' ) {
        return { score: 0, logged: false };
    }

    const activeGoals = (currentSettings?.active_goals as ActiveGoals | undefined) || null;

    switch (type) {
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

        // === USER-DEFINED GOALS (Linear Tolerance) ===
        case 'calories': {
            const cal = parseInt(value as string);
            if (isNaN(cal)) return { score: 0, logged: false };
            const targetCal = activeGoals?.nutrition?.calories;
            if (!targetCal) return { score: 50, logged: true };

            // Under-eating is NOT rewarded: penalise eating below a healthy floor
            const floor = targetCal * 0.5;
            if (cal < floor) {
                return { score: Math.max(0, Math.round((cal / floor) * 100)), logged: true };
            }
            if (cal <= targetCal) return { score: 100, logged: true };

            const tolerance = targetCal * 0.25;
            const diff = cal - targetCal;
            return { score: Math.max(0, Math.round(100 - (diff / tolerance) * 100)), logged: true };
        }

        case 'protein': {
            const p = parseFloat(value as string);
            if (isNaN(p)) return { score: 0, logged: false };
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
            const targetCarbs = activeGoals?.nutrition?.carbs;
            if (!targetCarbs) return { score: 50, logged: true };
            const tolerance = targetCarbs * 0.375;
            const diff = Math.abs(c - targetCarbs);
            return { score: Math.max(0, Math.round(100 - (diff / tolerance) * 100)), logged: true };
        }

        case 'fat': {
            const f = parseFloat(value as string);
            if (isNaN(f)) return { score: 0, logged: false };
            const targetFat = activeGoals?.nutrition?.fat;
            if (!targetFat) return { score: 50, logged: true };
            const tolerance = targetFat * 0.33;
            const diff = Math.abs(f - targetFat);
            return { score: Math.max(0, Math.round(100 - (diff / tolerance) * 100)), logged: true };
        }

        case 'water': {
            const w = parseFloat(value as string);
            if (isNaN(w)) return { score: 0, logged: false };
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
            const goalHours = activeGoals?.sleep?.hours;
            const qualityScore = Math.round((sq / 10) * 100);

            if (goalHours && computedSleepDuration) {
                const diff = Math.abs(computedSleepDuration - goalHours);
                const durationScore = Math.max(0, Math.round(100 - ((diff / 1.5) * 100)));
                let combined = Math.round((qualityScore * 0.4) + (durationScore * 0.6));
                if (diff > 2) combined = Math.min(combined, 30);
                return { score: combined, logged: true };
            }

            // Cap quality-only score to avoid inflated values when no duration is logged
            return { score: Math.min(60, qualityScore), logged: true };
        }

        // === OPTIONAL BODY FIELDS ===
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

// Score for time-based (wake/bedtime) and mood inputs.
// With no goal set, logging the value is neutral (50) rather than penalised.
export const getInputScore = (
    type: string,
    value: string | number | null | undefined,
    activeGoals: ActiveGoals | null | undefined
): MetricScore => {
    if (value === null || value === undefined || value === '') {
        return { score: 0, logged: false };
    }

    switch (type) {
        case 'wakeTime': {
            const goal = activeGoals?.sleep?.wake_time || null;
            if (!goal) return { score: 50, logged: true };
            const analysis = analyzeTime(value as string, goal);
            if (analysis.status === 'On Time') return { score: 100, logged: true };
            if (analysis.status === 'Close') return { score: 70, logged: true };
            return { score: 20, logged: true };
        }
        case 'bedtime': {
            const goal = activeGoals?.sleep?.bedtime || null;
            if (!goal) return { score: 50, logged: true };
            const analysis = analyzeTime(value as string, goal);
            if (analysis.status === 'On Time') return { score: 100, logged: true };
            if (analysis.status === 'Close') return { score: 70, logged: true };
            return { score: 20, logged: true };
        }
        case 'mood': {
            const m = parseInt(value as string);
            if (isNaN(m)) return { score: 0, logged: false };
            if (m >= 8) return { score: 100, logged: true };
            if (m >= 6) return { score: 80, logged: true };
            if (m >= 4) return { score: 50, logged: true };
            return { score: 20, logged: true };
        }
        default: {
            return calculateMetricScore(type, value, null, null);
        }
    }
};

// Group all habits (built-in booleans + customs) into one completion metric.
// Every habit the user tracks counts equally; completing N of T habits yields
// (N / T * 100). Always logged whenever at least one habit is tracked.
export const habitGroupScore = (
    habitValues: Record<string, boolean>,
    customCompletedCount: number,
    customTotal: number
): MetricScore => {
    const total = Object.keys(habitValues).length + customTotal;
    if (total === 0) return { score: 0, logged: false };
    const done = Object.values(habitValues).filter(Boolean).length + customCompletedCount;
    return { score: Math.round((done / total) * 100), logged: true };
};

export interface DailyScoreResult {
    score: number;
    loggedCount: number;
    totalMetrics: number;
    metrics: Record<string, MetricScore>;
}

export interface DailyScoringInput {
    wakeTime: string;
    bedtime: string;
    sleepQuality: string;
    morningSystolic: string;
    morningDiastolic: string;
    morningBpm: string;
    eveningSystolic: string;
    eveningDiastolic: string;
    eveningBpm: string;
    bodyTemperature: string;
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
    water: string;
    weight: string;
    bodyFat: string;
    mood: string;
    habits: {
        morningRoutine: boolean;
        eveningRoutine: boolean;
        fruitServing: boolean;
        studied: boolean;
        stretching: boolean;
        reading: boolean;
        journal: boolean;
        projectWorkDone: boolean;
    };
    customCompleted: number;
    customTotal: number;
    activeGoals: ActiveGoals | null | undefined;
    settings: { active_goals?: unknown; target_weight?: number | null; target_bodyfat?: number | null } | null;
    computedSleepDuration: number | null;
}

export const computeDailyScore = (input: DailyScoringInput): DailyScoreResult => {
    const { activeGoals, settings, computedSleepDuration } = input;

    const metrics: Record<string, MetricScore> = {
        wakeTime: getInputScore('wakeTime', input.wakeTime, activeGoals),
        bedtime: getInputScore('bedtime', input.bedtime, activeGoals),
        sleepQuality: calculateMetricScore('sleepQuality', input.sleepQuality, settings, computedSleepDuration),
        morningSystolic: calculateMetricScore('morningSystolic', input.morningSystolic, settings, computedSleepDuration),
        morningDiastolic: calculateMetricScore('morningDiastolic', input.morningDiastolic, settings, computedSleepDuration),
        morningBpm: calculateMetricScore('morningBpm', input.morningBpm, settings, computedSleepDuration),
        eveningSystolic: calculateMetricScore('eveningSystolic', input.eveningSystolic, settings, computedSleepDuration),
        eveningDiastolic: calculateMetricScore('eveningDiastolic', input.eveningDiastolic, settings, computedSleepDuration),
        eveningBpm: calculateMetricScore('eveningBpm', input.eveningBpm, settings, computedSleepDuration),
        bodyTemperature: calculateMetricScore('bodyTemperature', input.bodyTemperature, settings, computedSleepDuration),
        calories: calculateMetricScore('calories', input.calories, settings, computedSleepDuration),
        protein: calculateMetricScore('protein', input.protein, settings, computedSleepDuration),
        carbs: calculateMetricScore('carbs', input.carbs, settings, computedSleepDuration),
        fat: calculateMetricScore('fat', input.fat, settings, computedSleepDuration),
        water: calculateMetricScore('water', input.water, settings, computedSleepDuration),
        weight: calculateMetricScore('weight', input.weight, settings, computedSleepDuration),
        bodyFat: calculateMetricScore('bodyFat', input.bodyFat, settings, computedSleepDuration),
        mood: getInputScore('mood', input.mood, activeGoals),
        habits: habitGroupScore(input.habits, input.customCompleted, input.customTotal),
    };

    const metricValues = Object.values(metrics);
    const loggedMetrics = metricValues.filter(m => m.logged);
    const loggedCount = loggedMetrics.length;
    const totalMetrics = metricValues.length;

    if (loggedCount === 0) {
        return { score: 0, loggedCount: 0, totalMetrics, metrics };
    }

    const avg = loggedMetrics.reduce((a, m) => a + m.score, 0) / loggedCount;
    return { score: Math.round(avg), loggedCount, totalMetrics, metrics };
};