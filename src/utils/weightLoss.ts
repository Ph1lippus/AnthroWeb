// Weight-loss math: BMR, TDEE, calorie targets, and progress projections.
// All formulas are pure functions over plain numbers so they can be unit-tested
// and recomputed per keystroke without any cache.

import { ageFromDob } from './measurementCalculations';

export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
} as const;

export type ActivityLevel = keyof typeof ACTIVITY_FACTORS;
export const DEFAULT_DEFICIT_PERCENT = 0.2;
export const KCAL_PER_KG = 7700;
export const MIN_SAFE_KCAL = {
  male: 1500,
  female: 1200,
  other: 1400,
} as const;

export interface WeightLossContext {
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | '';
  height_cm: number | null;
  weight_kg: number | null;
  date_of_birth: string | null;
  activity_level: ActivityLevel | null;
  goal: 'maintain' | 'lose' | 'gain' | '';
  target_weight: number | null;
  starting_weight: number | null;
}

export interface CalorieTarget {
  bmr: number | null;
  tdee: number | null;
  targetKcal: number | null;
  deficitKcal: number | null;
  deficitPercent: number | null;
  safe: boolean;
}

export interface WeightProgress {
  currentWeight: number | null;
  startingWeight: number | null;
  targetWeight: number | null;
  weightToChange: number | null;
  percentChanged: number | null;
  estimatedWeeks: number | null;
  onTrack: boolean | null;
}

const bmrMifflinStJeor = (
  weightKg: number,
  heightCm: number,
  age: number,
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | '',
): number | null => {
  if (weightKg <= 0 || heightCm <= 0 || age <= 0) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return gender === 'female' ? base - 161 : base + 5;
};

export const calculateCalorieTarget = (ctx: WeightLossContext): CalorieTarget => {
  const age = ctx.date_of_birth ? ageFromDob(ctx.date_of_birth) : null;
  const weight = ctx.weight_kg ?? null;
  const height = ctx.height_cm ?? null;

  const bmr = weight != null && height != null && age != null
    ? bmrMifflinStJeor(weight, height, age, ctx.gender)
    : null;

  const activity = ctx.activity_level ?? 'sedentary';
  const tdee = bmr != null ? bmr * ACTIVITY_FACTORS[activity] : null;

  const safeMin = MIN_SAFE_KCAL[
    ctx.gender === 'male' ? 'male' : ctx.gender === 'female' ? 'female' : 'other'
  ];

  let targetKcal: number | null = null;
  let deficitKcal: number | null = null;
  let deficitPercent: number | null = null;

  if (tdee != null) {
    if (ctx.goal === 'lose') {
      targetKcal = Math.round(tdee * (1 - DEFAULT_DEFICIT_PERCENT));
    } else if (ctx.goal === 'gain') {
      targetKcal = Math.round(tdee * 1.15);
    } else {
      targetKcal = Math.round(tdee);
    }

    if (targetKcal < safeMin) targetKcal = safeMin;

    deficitKcal = tdee - targetKcal;
    deficitPercent = tdee > 0 ? deficitKcal / tdee : null;
  }

  return {
    bmr,
    tdee,
    targetKcal,
    deficitKcal,
    deficitPercent,
    safe: targetKcal != null ? targetKcal >= safeMin : false,
  };
};

export const calculateWeightProgress = (
  currentWeight: number | null,
  startingWeight: number | null,
  targetWeight: number | null,
  dailyDeficit: number | null,
): WeightProgress => {
  const weightToChange =
    currentWeight != null && targetWeight != null ? currentWeight - targetWeight : null;

  const percentChanged =
    currentWeight != null && startingWeight != null && targetWeight != null
      && startingWeight !== targetWeight
      ? ((startingWeight - currentWeight) / (startingWeight - targetWeight)) * 100
      : null;

  const estimatedWeeks = estimateWeeksToGoal(weightToChange, dailyDeficit);

  const onTrack =
    currentWeight != null && targetWeight != null && dailyDeficit != null
      ? (currentWeight > targetWeight ? dailyDeficit > 0 : dailyDeficit < 0)
      : null;

  return {
    currentWeight,
    startingWeight,
    targetWeight,
    weightToChange,
    percentChanged,
    estimatedWeeks,
    onTrack,
  };
};

export const estimateWeeksToGoal = (
  weightToChange: number | null,
  deficitKcal: number | null,
): number | null => {
  if (!weightToChange || weightToChange <= 0) return null;
  if (!deficitKcal || deficitKcal <= 0) return null;
  const totalKcal = weightToChange * KCAL_PER_KG;
  return totalKcal / deficitKcal / 7;
};

export const averageCalories = (values: (number | null | undefined)[]): number | null => {
  let sum = 0;
  let n = 0;
  for (const v of values) {
    if (typeof v === 'number' && !Number.isNaN(v)) {
      sum += v;
      n++;
    }
  }
  return n > 0 ? sum / n : null;
};

/**
 * Projected weight for a future date based on current daily deficit.
 * `daysFromNow` is how many days ahead to project. Returns null when there's
 * no current weight, no target weight, or no deficit to project from.
 */
export const projectWeight = (
  currentWeight: number | null,
  targetWeight: number | null,
  dailyDeficit: number | null,
  daysFromNow: number,
): number | null => {
  if (currentWeight == null || targetWeight == null || dailyDeficit == null || dailyDeficit === 0)
    return null;
  // 7700 kcal ≈ 1 kg of body mass
  const kgChange = (dailyDeficit * daysFromNow) / KCAL_PER_KG;
  return currentWeight - kgChange;
};

/**
 * Projected body fat percentage for a future date based on the current daily
 * deficit.
 *
 * Body fat is a *percentage* of body mass, so it can't be shifted by kilograms
 * the way weight can. Instead we scale the loss proportionally: the lean
 * body mass (weight × (1 - fat%)) is assumed to stay constant, so as total
 * weight drops the fat percentage follows. This is a simplification - it
 * ignores changes in lean mass - but it keeps the BF% projection visually
 * consistent with the weight projection using the same deficit.
 *
 * Returns null when any input is missing, the deficit is zero, or the current
 * weight is too small to scale against.
 */
export const projectBodyFat = (
  currentWeight: number | null,
  currentBodyFat: number | null,
  targetWeight: number | null,
  dailyDeficit: number | null,
  daysFromNow: number,
): number | null => {
  const projected = projectWeight(currentWeight, targetWeight, dailyDeficit, daysFromNow);
  if (projected == null || currentBodyFat == null || currentWeight == null || currentWeight <= 0)
    return null;
  // Lean body mass stays constant; fat% follows the weight change.
  const leanMass = currentWeight * (1 - currentBodyFat / 100);
  const newFatMass = Math.max(0, projected - leanMass);
  return projected > 0 ? (newFatMass / projected) * 100 : null;
};