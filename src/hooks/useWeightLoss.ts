import { useMemo } from 'react';
import { useBodyMeasurements } from './useMeasurements';
import { useUserSettings } from './useUserSettings';
import { useDailyLogs } from './useDailyLogs';
import type {
  WeightLossContext,
  CalorieTarget,
  WeightProgress,
} from '../utils/weightLoss';
import {
  calculateCalorieTarget,
  calculateWeightProgress,
  estimateWeeksToGoal,
  averageCalories,
} from '../utils/weightLoss';
import type { BodyMeasurement } from '../services/measurementService';

/** Latest measurement that carries a weight. */
const latestWeight = (measurements: BodyMeasurement[] | null | undefined): number | null => {
  if (!measurements || measurements.length === 0) return null;
  for (let i = measurements.length - 1; i >= 0; i--) {
    const w = measurements[i].weight;
    if (typeof w === 'number') return w;
  }
  return null;
};

interface UseWeightLossResult {
  context: WeightLossContext;
  calorieTarget: ReturnType<typeof calculateCalorieTarget>;
  progress: ReturnType<typeof calculateWeightProgress>;
  avgTrackedKcal: number | null;
  daysTracked: number;
  isLoading: boolean;
}

/**
 * Hook that wires together user settings, the latest weight measurement, and the
 * daily-log calorie readings into a full weight-loss picture:
 *
 * - BMR / TDEE from height, weight, age, gender, activity level
 * - Daily kcal target for the chosen goal (maintain / lose / gain)
 * - Calories actually tracked across the selected range
 * - Weight progress: to-go, percent of journey, estimated weeks at current deficit
 */
export const useWeightLoss = (days: number | null): UseWeightLossResult => {
  const { data: measurements = [], isLoading: measurementsLoading } = useBodyMeasurements();
  const { settings, isLoading: settingsLoading } = useUserSettings();
  const { logs = [], isLoading: logsLoading } = useDailyLogs();

  const weight = latestWeight(measurements as BodyMeasurement[] | null);

  const startingWeight = settings?.starting_weight ?? null;
  const targetWeight = settings?.target_weight ?? null;

  const context: WeightLossContext = useMemo(() => ({
    gender: settings?.gender ?? '',
    height_cm: settings?.height_cm ?? null,
    weight_kg: weight ?? null,
    date_of_birth: settings?.date_of_birth ?? null,
    activity_level: settings?.activity_level ?? null,
    goal: settings?.goal ?? '',
    target_weight: targetWeight,
    starting_weight: startingWeight,
  }), [settings, weight]);

  const calorieTarget = useMemo(() => calculateCalorieTarget(context), [context]);

  const progress = useMemo(() => calculateWeightProgress(weight, startingWeight, targetWeight, calorieTarget.deficitKcal ?? null),
    [weight, startingWeight, targetWeight, calorieTarget.deficitKcal]);

  const tracked = useMemo(() => {
    const inRange = (date: string, days: number | null): boolean => {
      if (days === null) return true;
      const diff = Math.floor((Date.now() - new Date(date + 'T00:00:00').getTime()) / 86400000);
      return diff >= 0 && diff < days;
    };
    const logList = logs ?? [];
    return logList.filter(l => inRange(l.log_date, days));
  }, [logs, days]);

  const kcalValues = (tracked ?? []).map(l => l.calories).filter((v): v is number => typeof v === 'number');
  const avgTrackedKcal = useMemo(() => averageCalories(kcalValues), [kcalValues]);
  const daysTracked = tracked?.length ?? 0;

  // Estimated weeks at the current average deficit vs TDEE.
  const estimatedWeeks = useMemo(() => {
    const deficit = calorieTarget.deficitKcal ?? null;
    const avgIntake = avgTrackedKcal ?? null;
    const weightToChange = progress.weightToChange ?? null;
    if (!weightToChange || weightToChange <= 0) return null;
    if (!deficit || deficit <= 0) return null;
    // Use the actual tracked deficit when intake is known, otherwise the target deficit.
    const effectiveDeficit = avgIntake != null
      ? Math.max(0, (calorieTarget.tdee ?? 0) - avgIntake)
      : deficit;
    return estimateWeeksToGoal(weightToChange, effectiveDeficit);
  }, [calorieTarget, progress.weightToChange, avgTrackedKcal]);

  return {
    context,
    calorieTarget,
    progress: { ...progress, estimatedWeeks },
    avgTrackedKcal,
    daysTracked,
    isLoading: measurementsLoading || settingsLoading || logsLoading,
  };
};

export type { WeightLossContext, CalorieTarget, WeightProgress };
export type { ActivityLevel } from '../utils/weightLoss';