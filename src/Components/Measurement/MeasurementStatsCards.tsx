import React, { useMemo } from 'react';
import {
    Scale,
    Target,
    Percent,
    Dumbbell,
    Ruler,
    Activity,
    Flame,
    TrendingUp,
    CalendarCheck2,
    Layers,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { BodyMeasurement } from '../../services/measurementService';
import { computeBodyCalculations } from '../../utils/measurementCalculations';
import type { MeasurementContext } from './MeasurementEditor';

type Tone = 'good' | 'warn' | 'flat';

interface Stat {
    key: string;
    label: string;
    value: string;
    hint: string;
    icon: LucideIcon;
    tone: Tone;
    highlight?: boolean;
}

interface MeasurementStatsCardsProps {
    /** Oldest first, as returned by `getBodyMeasurements`. */
    records: BodyMeasurement[];
    context: MeasurementContext;
    targetWeight: number | null;
    targetBodyFat: number | null;
    /** Whole days since the most recent measurement; null when none exist. */
    recencyDays: number | null;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

const signed = (n: number, digits = 1): string => `${n > 0 ? '+' : ''}${round1(n).toFixed(digits)}`;

/** Latest record that actually carries a weight, plus the one before it. */
const useWeightSeries = (records: BodyMeasurement[]) =>
    useMemo(() => {
        const withWeight = records.filter(r => typeof r.weight === 'number' && !Number.isNaN(r.weight));
        return {
            latest: withWeight[withWeight.length - 1] ?? null,
            previous: withWeight[withWeight.length - 2] ?? null,
            count: withWeight.length,
        };
    }, [records]);

/**
 * Left-hand stat rail for the measurements page, mirroring the academic page's
 * card grid so the two pages read as the same design.
 *
 * Values come from the latest stored snapshot rather than the day's live form,
 * because the derived numbers depend on fields spread across three groups and a
 * half-filled form would mostly show dashes. The editor keeps its own live
 * preview directly under the inputs for exactly that reason.
 */
const MeasurementStatsCards: React.FC<MeasurementStatsCardsProps> = ({
    records,
    context,
    targetWeight,
    targetBodyFat,
    recencyDays,
}) => {
    const { latest, previous, count } = useWeightSeries(records);

    const calc = useMemo(() => {
        if (!latest) return null;
        return computeBodyCalculations(
            { ...latest },
            {
                gender: (context.gender || '') as 'male' | 'female' | 'other' | 'prefer_not_to_say' | '',
                height_cm: context.height_cm ?? null,
                age: context.age ?? null,
                relativeBestLift: context.relativeBestLift ?? null,
            }
        );
    }, [latest, context]);

    const stats = useMemo<Stat[]>(() => {
        const out: Stat[] = [];

        const weight = latest?.weight ?? null;
        const weightDelta =
            weight != null && previous?.weight != null ? weight - previous.weight : null;

        out.push({
            key: 'weight',
            label: 'Weight',
            value: weight != null ? `${round1(weight).toFixed(1)} kg` : '--',
            hint: weightDelta != null
                ? `${signed(weightDelta)} kg vs. previous`
                : weight != null ? 'Only one reading' : 'No readings yet',
            icon: Scale,
            tone: weight == null ? 'flat' : weightDelta == null ? 'flat' : weightDelta < 0 ? 'good' : 'warn',
            highlight: true,
        });

        const toTarget = weight != null && targetWeight != null ? targetWeight - weight : null;
        out.push({
            key: 'target',
            label: 'To target',
            value: toTarget != null ? `${Math.abs(round1(toTarget)).toFixed(1)} kg` : '--',
            hint: toTarget == null
                ? targetWeight == null ? 'No target weight set' : 'No readings yet'
                : Math.abs(toTarget) < 0.05 ? 'At target'
                : toTarget > 0 ? `${round1(toTarget).toFixed(1)} kg to gain` : `${Math.abs(round1(toTarget)).toFixed(1)} kg to lose`,
            icon: Target,
            tone: toTarget == null ? 'flat' : Math.abs(toTarget) < 0.05 ? 'good' : 'warn',
        });

        const bodyFat = calc?.body_fat_percent ?? null;
        const bfGap = bodyFat != null && targetBodyFat != null ? bodyFat - targetBodyFat : null;
        out.push({
            key: 'body-fat',
            label: 'Body fat',
            value: bodyFat != null ? `${round1(bodyFat).toFixed(1)}%` : '--',
            hint: bfGap == null
                ? 'Needs neck and waist'
                : Math.abs(bfGap) < 0.05 ? 'At target'
                : `${Math.abs(round1(bfGap)).toFixed(1)}% ${bfGap > 0 ? 'above' : 'below'} target`,
            icon: Percent,
            tone: bfGap == null ? 'flat' : Math.abs(bfGap) < 0.05 ? 'good' : bfGap > 0 ? 'warn' : 'good',
        });

        out.push({
            key: 'lean',
            label: 'Lean mass',
            value: calc?.lean_body_mass != null ? `${round1(calc.lean_body_mass).toFixed(1)} kg` : '--',
            hint: calc?.fat_mass != null ? `${round1(calc.fat_mass).toFixed(1)} kg fat mass` : 'Needs a weight',
            icon: Dumbbell,
            tone: 'flat',
        });

        const waist = latest?.waist ?? null;
        const waistPrev = previous?.waist ?? null;
        const waistDelta = waist != null && waistPrev != null ? waist - waistPrev : null;
        out.push({
            key: 'waist',
            label: 'Waist',
            value: waist != null ? `${round1(waist).toFixed(1)} cm` : '--',
            hint: waistDelta != null ? `${signed(waistDelta)} cm vs. previous` : 'No reading',
            icon: Ruler,
            tone: waistDelta == null ? 'flat' : waistDelta < 0 ? 'good' : 'warn',
        });

        out.push({
            key: 'v-taper',
            label: 'V-taper',
            value: calc?.shoulder_waist_ratio != null ? round1(calc.shoulder_waist_ratio).toFixed(2) : '--',
            hint: calc?.shoulder_waist_ratio != null ? 'Shoulder ÷ waist' : 'Needs shoulders and waist',
            icon: TrendingUp,
            tone: 'flat',
        });

        out.push({
            key: 'whr',
            label: 'Waist–hip',
            value: calc?.waist_hip_ratio != null ? round1(calc.waist_hip_ratio).toFixed(2) : '--',
            hint: calc?.waist_height_ratio != null
                ? `Waist ÷ height ${round1(calc.waist_height_ratio).toFixed(2)}`
                : 'Waist ÷ hips',
            icon: Layers,
            tone: 'flat',
        });

        out.push({
            key: 'ffmi',
            label: 'FFMI',
            value: calc?.ffmi != null ? round1(calc.ffmi).toFixed(1) : '--',
            hint: calc?.muscle_quality != null
                ? `Muscle quality ${round1(calc.muscle_quality).toFixed(0)}%`
                : 'Scaled for height',
            icon: Activity,
            tone: 'flat',
        });

        out.push({
            key: 'bmr',
            label: 'BMR',
            value: calc?.bmr != null ? `${Math.round(calc.bmr)} kcal` : '--',
            hint: 'Mifflin–St Jeor',
            icon: Flame,
            tone: 'flat',
        });

        out.push({
            key: 'recency',
            label: 'Last measured',
            value: recencyDays == null ? '--' : recencyDays === 0 ? 'Today' : `${recencyDays}d ago`,
            hint: recencyDays == null
                ? 'Nothing logged'
                : recencyDays <= 7 ? 'Fresh — recency score 100' : 'Recency score is dropping',
            icon: CalendarCheck2,
            tone: recencyDays == null ? 'flat' : recencyDays <= 7 ? 'good' : 'warn',
        });

        out.push({
            key: 'count',
            label: 'Readings',
            value: String(count),
            hint: records.length === count ? 'All include weight' : `${records.length} snapshots stored`,
            icon: Ruler,
            tone: 'flat',
        });

        return out;
    }, [latest, previous, calc, targetWeight, targetBodyFat, recencyDays, count, records.length]);

    return (
        <div className="analysis-grid">
            {stats.map(stat => {
                const Icon = stat.icon;
                return (
                    <div
                        key={stat.key}
                        className={`analysis-card analysis-card--${stat.tone}${stat.highlight ? ' measurements-weight-card' : ''}`}
                    >
                        <div className="analysis-card-head">
                            <Icon className="analysis-card-icon" size={15} aria-hidden="true" />
                            <span className="analysis-card-label">{stat.label}</span>
                        </div>
                        <div className="analysis-card-value">{stat.value}</div>
                        <div className="analysis-card-hint">{stat.hint}</div>
                    </div>
                );
            })}
        </div>
    );
};

export default MeasurementStatsCards;