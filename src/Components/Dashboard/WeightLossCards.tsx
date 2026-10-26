import React, { useMemo } from 'react';
import {
  Flame,
  Scale,
  Target,
  TrendingDown,
  Calendar,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useWeightLoss } from '../../hooks/useWeightLoss';
import type { DateRange } from './dateRange';

interface Stat {
  key: string;
  label: string;
  value: string;
  unit?: string;
  hint: string;
  icon: LucideIcon;
  color?: string;
  tone: 'good' | 'warn' | 'flat';
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

const fmt = (n: number | null, suffix = '', digits = 1): string =>
  n === null ? '--' : `${digits === 0 ? Math.round(n) : round1(n).toFixed(digits)}${suffix}`;

const WeightLossCards: React.FC<{ range: DateRange }> = ({ range }) => {
  const { calorieTarget, progress, avgTrackedKcal, daysTracked, isLoading } =
    useWeightLoss(range.days);

  const { currentWeight, targetWeight, startingWeight, weightToChange, percentChanged, estimatedWeeks, onTrack } = progress;
  const { targetKcal, deficitKcal, tdee, safe } = calorieTarget;

  const deficit = tdee != null && avgTrackedKcal != null
    ? Math.round(tdee - avgTrackedKcal)
    : deficitKcal != null ? Math.round(deficitKcal) : null;

  const stats = useMemo<Stat[]>(() => {
    const out: Stat[] = [];

    out.push({
      key: 'currentWeight',
      label: 'Current Weight',
      value: fmt(currentWeight, ' kg'),
      hint: currentWeight === null ? 'No weight recorded yet' : 'Latest measurement',
      icon: Scale,
      color: '#f59e0b',
      tone: 'flat',
    });

    out.push({
      key: 'targetWeight',
      label: 'Target Weight',
      value: fmt(targetWeight, ' kg'),
      hint: targetWeight === null
        ? 'Set a target weight on your Profile'
        : startingWeight != null
          ? `From ${round1(startingWeight).toFixed(1)} kg starting weight`
          : 'Your goal weight',
      icon: Target,
      color: '#3b82f6',
      tone: 'flat',
    });

    out.push({
      key: 'weightToChange',
      label: 'Weight to Lose',
      value: weightToChange != null && weightToChange > 0
        ? `${round1(weightToChange).toFixed(1)} kg`
        : weightToChange != null && weightToChange < 0
          ? `${round1(Math.abs(weightToChange)).toFixed(1)} kg to gain`
          : weightToChange === 0 ? 'At goal' : '--',
      hint: percentChanged != null
        ? `${round1(percentChanged).toFixed(0)}% of the way there`
        : 'No start or target weight set',
      icon: TrendingDown,
      color: weightToChange != null && weightToChange > 0 ? '#10b981' : '#f59e0b',
      tone: weightToChange != null && weightToChange > 0 ? 'good' : 'flat',
    });

    return out;
  }, [currentWeight, targetWeight, startingWeight, weightToChange, percentChanged,
    targetKcal, tdee, safe, avgTrackedKcal, daysTracked, deficit, deficitKcal]);

  if (isLoading) {
    return null;
  }

  if (stats.length === 0) return null;

  return (
    <>
      {stats.map(s => {
        const Icon = s.icon;
        return (
          <div key={s.key} className={`analysis-card analysis-card--${s.tone}`}>
            <div className="analysis-card-head">
              <Icon className="analysis-card-icon" size={15} aria-hidden="true" style={s.color ? { color: s.color } : undefined} />
              <span className="analysis-card-label">{s.label}</span>
            </div>
            <div className="analysis-card-value">
              {s.value}
              {s.unit && <span className="analysis-card-unit">{s.unit}</span>}
            </div>
            <div className="analysis-card-hint">{s.hint}</div>
          </div>
        );
      })}
    </>
  );
};

export default WeightLossCards;