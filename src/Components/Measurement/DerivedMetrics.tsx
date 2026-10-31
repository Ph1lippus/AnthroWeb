import React from 'react';
import { computeBodyCalculations } from '../../utils/measurementCalculations';
import { calculateMeasurementRecency } from '../../utils/dailyScoring';


/**
 * The twenty derived body metrics.
 *
 * The measurements page's answer to the daily log's score card, minus the ring:
 * there is no score to show for a body measurement, so this panel is the whole of
 * it. Same card, same collapsible shell, same category headings -- filled with
 * figures a formula produced rather than scores out of 100.
 *
 * `computeBodyCalculations` is imported rather than the result being threaded
 * through, so this component can be handed the same typed values the editor holds
 * and derive from them itself. It is a pure function over plain numbers, so
 * calling it per keystroke costs nothing and needs no cache.
 */

type BodyCalculations = ReturnType<typeof computeBodyCalculations>;

type Tone = 'good' | 'warn' | null;

interface ToneContext {
    gender?: string;
    targetBodyFat?: number | null;
}

interface DerivedRow {
    key: string;
    label: string;
    unit: string;
    /** Decimal places to show. Ratios get two; everything else keeps one. */
    digits?: number;
    /** Judgement for a value, when one has a meaningful healthy range. */
    tone?: ((value: number, ctx: ToneContext) => Tone) | null;
}

interface DerivedGroup {
    key: string;
    title: string;
    rows: DerivedRow[];
}

/**
 * The two body-fat rows are judged against the user's own target rather than a
 * population table: the same number is fine for one body and not for another,
 * and a target is the only threshold this app already knows. No target, no
 * colour -- inventing one would be worse than staying neutral.
 */
const bodyFatTone = (value: number, ctx: ToneContext): Tone => {
    if (ctx.targetBodyFat == null) return null;
    return value <= ctx.targetBodyFat + 0.05 ? 'good' : 'warn';
};

/** WHO's rough cut-off: below half your height is healthy, above is not. */
const waistHeightTone = (value: number): Tone => (value < 0.5 ? 'good' : 'warn');

/** Waist-to-hip risk bands are sex-specific; unknown sex stays neutral. */
const waistHipTone = (value: number, ctx: ToneContext): Tone => {
    if (ctx.gender !== 'male' && ctx.gender !== 'female') return null;
    return value <= (ctx.gender === 'female' ? 0.85 : 0.9) ? 'good' : 'warn';
};

/** WHO bands. Unknown sex uses the male cut-off, which is the stricter one. */
const bmiTone = (value: number): Tone => {
    if (value < 18.5) return 'warn';
    if (value < 25) return 'good';
    if (value < 30) return 'warn';
    return 'warn';
};

/** Muscle quality: share of bodyweight that is lean. Above 80% is athletic. */
const muscleQualityTone = (value: number): Tone => (value >= 80 ? 'good' : 'warn');

/** FFMI: lean mass in kg per metre of height squared.
 *
 * Higher is better -- this is muscle, not fat. The 25/22 figures are the
 * conventional drug-free *ceilings* for men and women, not targets to climb
 * toward from below, so the old `>= 25 ? good : warn` flagged a 23.78 male as
 * bad. Anything above 20 (men) or 18 (women) is athletic; below that is where
 * a reading starts to suggest low muscle mass.
 */
const ffmiTone = (value: number, ctx: ToneContext): Tone => {
    const floor = ctx.gender === 'female' ? 18 : 20;
    return value >= floor ? 'good' : 'warn';
};

/** Adonis index: shoulders/waist. Above 1.1 is a visible taper. */
const adonisTone = (value: number): Tone => (value >= 1.1 ? 'good' : 'warn');

/** Torso taper in cm: shoulders minus waist. Above 12 cm is a strong taper. */
const torsoTaperTone = (value: number): Tone => (value >= 12 ? 'good' : 'warn');

/** Symmetry scores are out of 100; below 90 means a visible imbalance. */
const symmetryTone = (value: number): Tone => (value >= 90 ? 'good' : 'warn');

/**
 * Shoulder-to-chest. A shoulder line that sits wider than the chest reads as
 * broad; the aesthetic floor is 1.05, where the two are level.
 */
const shoulderChestTone = (value: number): Tone => (value >= 1.05 ? 'good' : 'warn');

/**
 * Shoulder-to-hip. The V-taper's headline ratio: shoulders over the widest part
 * of the lower body. Above 1.0 the upper body carries the silhouette.
 */
const shoulderHipTone = (value: number): Tone => (value >= 1.0 ? 'good' : 'warn');

/**
 * Thigh-to-calf. Longer thighs relative to the calf read as athletic -- the
 * femur does the work the gastrocnemius only stabilises. Above 1.4 is the
 * conventional athletic floor.
 */
const thighCalfTone = (value: number): Tone => (value >= 1.4 ? 'good' : 'warn');

/**
 * Bicep-to-forearm. A fuller bicep than forearm is the look most people are
 * training for; below 1.2 the arm reads as forearm-dominant.
 */
const bicepForearmTone = (value: number): Tone => (value >= 1.2 ? 'good' : 'warn');

/**
 * Thigh-to-bicep. Developed legs relative to the arm: above 1.5 the lower body
 * carries its own weight in the silhouette.
 */
const thighBicepTone = (value: number): Tone => (value >= 1.5 ? 'good' : 'warn');

/**
 * One figure per row, in the order a reader wants them.
 *
 * Rows rather than the daily log's chips: there are twenty of these and their
 * labels are longer than the numbers, which on a rail this narrow means chips
 * wrap two or three deep and the value ends up on a line of its own, away from
 * the name it belongs to. A row keeps the two together at every width.
 */
const DERIVED_GROUPS: DerivedGroup[] = [
    {
        key: 'composition',
        title: 'Composition',
        rows: [
            { key: 'bmi', label: 'BMI', unit: '', digits: 1, tone: bmiTone },
            { key: 'body_fat_measured', label: 'Body Fat (Measured)', unit: '%', tone: bodyFatTone },
            { key: 'body_fat_navy', label: 'Body Fat (Navy)', unit: '%', tone: bodyFatTone },
            { key: 'body_fat_ymca', label: 'Body Fat (YMCA)', unit: '%', tone: bodyFatTone },
            { key: 'fat_mass', label: 'Fat Mass', unit: 'kg' },
            { key: 'lean_body_mass', label: 'Lean Body Mass', unit: 'kg' },
            { key: 'muscle_quality', label: 'Lean Mass %', unit: '%', tone: muscleQualityTone },
        ],
    },
    {
        key: 'ratios',
        title: 'Ratios',
        rows: [
            { key: 'waist_hip_ratio', label: 'Waist-Hip', unit: '', digits: 2, tone: waistHipTone },
            { key: 'waist_height_ratio', label: 'Waist-Height', unit: '', digits: 2, tone: waistHeightTone },
            { key: 'shoulder_waist_ratio', label: 'Shoulder-Waist', unit: '', digits: 2, tone: adonisTone },
            { key: 'shoulder_chest_ratio', label: 'Shoulder-Chest', unit: '', digits: 2, tone: shoulderChestTone },
            { key: 'shoulder_hip_ratio', label: 'Shoulder-Hip', unit: '', digits: 2, tone: shoulderHipTone },
            { key: 'thigh_calf_ratio', label: 'Thigh-Calf', unit: '', digits: 2, tone: thighCalfTone },
            { key: 'bicep_ratio', label: 'Bicep-Forearm', unit: '', digits: 2, tone: bicepForearmTone },
            { key: 'leg_torso_ratio', label: 'Thigh-Bicep', unit: '', digits: 2, tone: thighBicepTone },
        ],
    },
    {
        key: 'symmetry',
        title: 'Symmetry',
        rows: [
            { key: 'bicep_flexing_symmetry', label: 'Bicep', unit: '/100', tone: symmetryTone },
            { key: 'forearm_symmetry', label: 'Forearm', unit: '/100', tone: symmetryTone },
        ],
    },
    {
        key: 'metabolism',
        title: 'Metabolism',
        rows: [
            { key: 'bmr', label: 'BMR (Mifflin-St Jeor)', unit: 'kcal', digits: 0 },
            { key: 'metabolic_age', label: 'Metabolic Age', unit: 'yrs', digits: 0 },
        ],
    },
    {
        key: 'performance',
        title: 'Performance',
        rows: [
            { key: 'ffmi', label: 'FFMI', unit: '', digits: 1, tone: ffmiTone },
            { key: 'dynamic_strength', label: 'Dynamic Strength', unit: '/100', digits: 0 },
            { key: 'adonis_index', label: 'Adonis Index', unit: '', digits: 2, tone: adonisTone },
            { key: 'torso_taper', label: 'Torso Taper (Shoulder-Waist)', unit: 'cm', tone: torsoTaperTone },
        ],
    },
];

/**
 * Numbers, not truncated prefixes.
 *
 * This used to floor every figure to one decimal, which made a true 0.571
 * waist-to-height read as "0.5" -- indistinguishable from a body exactly half
 * as wide as it is tall. Ratios now keep two decimals and every value is
 * rounded rather than cut off.
 */
const formatValue = (value: number | null, unit: string, digits = 1): string => {
    if (value == null) return '—';
    if (digits === 0) {
        const rounded = Math.round(value);
        return unit ? `${rounded} ${unit}` : String(rounded);
    }
    const factor = 10 ** digits;
    const rounded = Math.round(value * factor) / factor;
    const shown = Number.isInteger(rounded)
        ? String(rounded)
        : rounded.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
    return unit ? `${shown} ${unit}` : shown;
};

interface DerivedMetricsProps {
    values: BodyCalculations;
    expanded: boolean;
    /** Used only to pick the waist-to-hip risk band; unknown stays neutral. */
    gender?: string;
    latestWeight?: number | null;
    latestBodyFat?: number | null;
    latestDate?: string | null;
    targetWeight?: number | null;
    targetBodyFat?: number | null;
}

const DerivedMetrics: React.FC<DerivedMetricsProps> = ({ values, expanded, gender, latestWeight, latestBodyFat, latestDate, targetWeight, targetBodyFat }) => {
    const recency = calculateMeasurementRecency(latestDate ?? null);

    const weightProgress = targetWeight && latestWeight != null
        ? Math.max(0, Math.min(100, 100 - (Math.abs(latestWeight - targetWeight) / targetWeight) * 100))
        : null;
    const bfProgress = targetBodyFat && latestBodyFat != null
        ? Math.max(0, Math.min(100, 100 - (Math.abs(latestBodyFat - targetBodyFat) / targetBodyFat) * 100))
        : null;

    const bodyScoreRows = [
        { key: 'weight_progress' as any, label: 'Weight progress', unit: '/100', value: weightProgress },
        { key: 'bf_progress' as any, label: 'BF progress', unit: '/100', value: bfProgress },
        { key: 'measurement_recency' as any, label: 'Measurement recency', unit: '/100', value: recency.score },
    ].filter(r => r.value != null);

    const bodyScoreGroup = bodyScoreRows.length ? [{
        key: 'body_score',
        title: 'Body score',
        count: `${bodyScoreRows.length}/3`,
        rows: bodyScoreRows.map(r => ({
            key: r.key as string,
            label: r.label,
            unit: r.unit,
            value: r.value,
            shown: r.value != null ? `${Math.round(r.value)} ${r.unit}`.trim() : '—',
            tone: null as Tone,
        })),
    }] : [];

    const toneContext: ToneContext = { gender, targetBodyFat };
    const groups = [...bodyScoreGroup, ...DERIVED_GROUPS.map(group => {
        const available = group.rows.filter(row => values[row.key as keyof BodyCalculations] != null).length;
        return {
            ...group,
            count: `${available}/${group.rows.length}`,
            rows: group.rows.map(row => {
                const value = (values as unknown as Record<string, number | null>)[row.key] ?? null;
                const tone = value != null && row.tone ? row.tone(value, toneContext) : null;
                return {
                    ...row,
                    value,
                    tone,
                    shown: formatValue(value, row.unit, row.digits),
                };
            }),
        };
    })];

    return (
        <div className="daily-score-card measurement-derived measurement-derived--rail">
            {/*
                Every metric is drawn from the first paint, calculated or not. The
                panel is a map of what these twenty-three fields produce, so the
                list of names does not depend on whether they have been filled in
                yet -- a reader learns the whole set before typing anything, rather
                than being handed twenty new rows one keystroke at a time. A
                figure with nothing behind it is a muted dash, which says "not
                calculated" without claiming to be a reading of zero.
            */}
            <div
                className={`daily-score-breakdown ${expanded ? 'daily-score-breakdown--open' : ''}`}
                aria-hidden={!expanded}
            >
                <div className="measurement-derived__body daily-score-breakdown__inner">
                    {groups.map(group => (
                        <div key={group.key} className="daily-score-category">
                            <div className="daily-score-category-head">
                                <span className="daily-score-category-title">{group.title}</span>
                                <span className="daily-score-category-count">{group.count}</span>
                            </div>
                            <div className="measurement-derived__grid">
                                {group.rows.map(row => (
                                    <div key={row.key} className="measurement-derived__row">
                                        <span className="measurement-derived__label">{row.label}</span>
                                        <span
                                            className={`measurement-derived__value${row.tone ? ` measurement-derived__value--${row.tone}` : ''}`}
                                            data-empty={row.value == null ? 'true' : undefined}
                                        >
                                            {row.shown}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default DerivedMetrics;