import React, { useMemo } from 'react';
import {
  Scale,
  Target,
  TrendingDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useWeightLoss } from '../../hooks/useWeightLoss';
import type { DateRange } from './dateRange';

/**
 * One colour per tone. The icon used to be pinned to a fixed accent per card --
 * the weight card was always amber, the target card always blue -- which meant an
 * amber icon sat above a red hint on a card that had gone over budget. The icon
 * and the hint below it now draw from the same flag, so a card never contradicts
 * itself.
 */
const toneColor = (tone: 'good' | 'warn' | 'flat'): string =>
  tone === 'good' ? 'var(--color-good)'
  : tone === 'warn' ? 'var(--color-bad)'
  : 'var(--color-light)';

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

  const { currentWeight, targetWeight, startingWeight, weightToChange, percentChanged } = progress;
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
      color: toneColor('flat'),
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
      color: toneColor('flat'),
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
      color: toneColor(weightToChange != null && weightToChange > 0 ? 'good' : weightToChange === 0 ? 'flat' : 'warn'),
      tone: weightToChange != null && weightToChange > 0 ? 'good' : weightToChange === 0 ? 'flat' : 'warn',
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