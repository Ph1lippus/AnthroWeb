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
    if (![wakeH, wakeM, bedH, bedM].every(Number.isFinite)) return null;

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
    currentSettings: { active_goals?: unknown; target_weight?: number | null; target_bodyfat?: number | null } | null
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
            // Sleep quality is a subjective 0-10 rating that maps linearly to
            // 0-100. Short sleep is judged by its own metric (duration/recency),
            // so a restful 7h night is not punished here.
            const clamped = Math.min(10, Math.max(0, sq));
            return { score: clamped * 10, logged: true };
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

// Score for the time-based inputs (wake/bedtime).
//
// Mood used to be scored here too, as a case on 'mood'. It is not any more:
// splitting the rating into two made a single-string score wrong, so it moved to
// `moodMetricScore` below, which takes both readings. The switch is left as a
// lookup rather than a chain of `if`s only because the time analysis below is
// worth reusing on its own.
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
        default: {
            return calculateMetricScore(type, value, null);
        }
    }
};

/**
 * One `mood` metric from both of a day's ratings.
 *
 * Averaged over the readings that exist rather than over the full ten-wide
 * scale, so a day rated only in the evening is not scored as half a day. Same
 * reasoning as `meanMood` in utils/moodSeries, which this mirrors deliberately
 * -- if the score and the graph disagreed about what a half-rated day is worth,
 * the ring and the mind charts would describe different weeks.
 *
 * Unrated on both sides is `logged: false`, which is what keeps mood out of the
 * ring's denominator entirely instead of scoring it a zero.
 */
export const moodMetricScore = (morning: string, evening: string): MetricScore => {
    const rated: number[] = [];
    for (const raw of [morning, evening]) {
        if (raw === null || raw === undefined || raw === '') continue;
        const m = parseInt(raw as string);
        if (isNaN(m)) continue;
        rated.push(Math.min(10, Math.max(1, m)));
    }
    if (rated.length === 0) return { score: 0, logged: false };
    const mean = rated.reduce((sum, v) => sum + v, 0) / rated.length;
    return { score: Math.round(mean * 10), logged: true };
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

// Recency of body measurements. A measurement earns a full week at 100; on the
// 8th day the score drops 10 points per day unless you measure again.
// Untracked entirely -> not logged (does not drag the daily average).
export const calculateMeasurementRecency = (
    lastMeasurementDate: string | null | undefined
): MetricScore => {
    if (!lastMeasurementDate) return { score: 0, logged: false };
    const last = new Date(lastMeasurementDate + 'T00:00:00').getTime();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const daysSince = Math.floor((today - last) / 86400000);
    if (daysSince < 0) return { score: 100, logged: true };
    if (daysSince <= 7) return { score: 100, logged: true };
    return { score: Math.max(0, 170 - daysSince * 10), logged: true };
};

export interface DailyScoreResult {
    score: number;
    loggedCount: number;
    totalMetrics: number;
    metrics: Record<string, MetricScore>;
}

/**
 * The built-in habits, in display order.
 *
 * This list is the single definition of how many built-in habits exist. The
 * count was previously written as a literal `8` in five different files -- the
 * scorer, two dashboard charts, the analysis cards and the history chip -- so
 * adding a habit silently produced charts that disagreed with the score ring.
 * Gym is the ninth: it is a real habit that feeds both, and it is written by
 * the workout pages rather than by this one.
 */
export const BUILTIN_HABITS = [
    { key: 'morningRoutine', column: 'morning_routine', label: 'Morning Routine' },
    { key: 'eveningRoutine', column: 'evening_routine', label: 'Evening Routine' },
    { key: 'fruitServing', column: 'fruit_serving', label: 'Fruit Serving' },
    { key: 'studied', column: 'studied', label: 'Studied' },
    { key: 'journal', column: 'journal', label: 'Journaled' },
    { key: 'stretching', column: 'stretching', label: 'Stretching' },
    { key: 'reading', column: 'reading', label: 'Reading' },
    { key: 'projectWorkDone', column: 'project_work_done', label: 'Projects' },
    { key: 'gym', column: 'gym', label: 'Gym' },
] as const;

export const BUILTIN_HABIT_COUNT = BUILTIN_HABITS.length;

export type BuiltinHabitKey = (typeof BUILTIN_HABITS)[number]['key'];

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
    /**
     * Weight and body fat, unlike every field above them, arrive as numbers.
     *
     * They are not text on the daily log any more -- they come from
     * `body_measurements`, which is a real column rather than a form input, so
     * there is nothing to parse.
     */
    weight: number | string | null;
    bodyFat: number | string | null;
    /**
     * The day's two mood ratings, as typed into the form. Both are optional in
     * practice -- a day rated only in the evening is a complete day -- so both
     * accept an empty string and score the same single `mood` metric between
     * them. See the note on `mood` below.
     */
    morningMood: string;
    eveningMood: string;
    habits: Record<BuiltinHabitKey, boolean>;
    customCompleted: number;
    customTotal: number;
    activeGoals: ActiveGoals | null | undefined;
    settings: { active_goals?: unknown; target_weight?: number | null; target_bodyfat?: number | null } | null;
    noSleep: boolean;
    /**
     * A day the food plan was deliberately broken. Within the user's cheat-day
     * allowance the four food macros score a full 100: a planned break is a
     * choice, not a failure, and a day off the plan should not read as a bad day
     * because of it. Hydration is NOT wrapped -- water is the one nutrition habit
     * a day off the plan does not excuse, so it keeps scoring against its goal.
     */
    cheatDay: boolean;
    /**
     * Whether this cheat day falls inside the allowance (see `utils/cheatDays`).
     * Optional and defaults to true so a caller that does not know about budgets
     * keeps the always-free behaviour. When false, the four macros are pinned to
     * 0 *and* counted, so an over-budget day pulls the ring down.
     */
    cheatDayExempt?: boolean;
    lastMeasurementDate?: string | null;
}

export const computeDailyScore = (input: DailyScoringInput): DailyScoreResult => {
    const { activeGoals, settings, noSleep, cheatDay, cheatDayExempt = true } = input;

    // "No sleep" nights: mark the tracked night as score 0 (penalised). The three
    // sleep metrics count as logged so a bad night drags the daily average down.
    const noSleepMetric: MetricScore = { score: 0, logged: true };
    const sleep = (metric: MetricScore): MetricScore => (noSleep ? noSleepMetric : metric);

    // Cheat day, two ways. Within the allowance the macros score a full 100 *and*
    // stay logged, so a planned break reads as a good day rather than a hole in
    // the ring. Past the allowance the same macros are pinned to 0 *and* logged,
    // so an extra day off the plan drags the ring down instead of being waved
    // through. Water is unwrapped in both cases -- drinking is the one nutrition
    // habit a day off does not excuse.
    const macro = (metric: MetricScore): MetricScore => {
        if (!cheatDay) return metric;
        return cheatDayExempt ? { score: 100, logged: true } : { score: 0, logged: true };
    };

    const metrics: Record<string, MetricScore> = {
        wakeTime: sleep(getInputScore('wakeTime', input.wakeTime, activeGoals)),
        bedtime: sleep(getInputScore('bedtime', input.bedtime, activeGoals)),
        sleepQuality: sleep(calculateMetricScore('sleepQuality', input.sleepQuality, settings)),
        morningSystolic: calculateMetricScore('morningSystolic', input.morningSystolic, settings),
        morningDiastolic: calculateMetricScore('morningDiastolic', input.morningDiastolic, settings),
        morningBpm: calculateMetricScore('morningBpm', input.morningBpm, settings),
        eveningSystolic: calculateMetricScore('eveningSystolic', input.eveningSystolic, settings),
        eveningDiastolic: calculateMetricScore('eveningDiastolic', input.eveningDiastolic, settings),
        eveningBpm: calculateMetricScore('eveningBpm', input.eveningBpm, settings),
        bodyTemperature: calculateMetricScore('bodyTemperature', input.bodyTemperature, settings),
        calories: macro(calculateMetricScore('calories', input.calories, settings)),
        protein: macro(calculateMetricScore('protein', input.protein, settings)),
        carbs: macro(calculateMetricScore('carbs', input.carbs, settings)),
        fat: macro(calculateMetricScore('fat', input.fat, settings)),
        water: calculateMetricScore('water', input.water, settings),
        weight: calculateMetricScore('weight', input.weight, settings),
        bodyFat: calculateMetricScore('bodyFat', input.bodyFat, settings),
        measurementRecency: calculateMeasurementRecency(input.lastMeasurementDate),
        // One metric, not two, and this is the one judgement call in the split
        // of `mood` into morning and evening. The ring's denominator is
        // `totalMetrics`, and every logged metric is weighted equally in the
        // average, so scoring AM and PM as two chips would make mood the only
        // thing on the page that could fill two slots -- a user who rated both
        // would see their score ring's percentage move because of one day's
        // bookkeeping. Averaging whichever readings exist into a single chip
        // keeps the denominator at 19 for everybody and keeps yesterday's
        // score comparable with today's.
        //
        // Where the split itself is the information -- the journal sliders, the
        // mind graph, the dashboard's two series -- it is read directly from
        // `utils/moodSeries`, not through here.
        mood: moodMetricScore(input.morningMood, input.eveningMood),
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