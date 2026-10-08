import React from 'react';
import { computeBodyCalculations } from '../../utils/measurementCalculations';

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

interface DerivedGroup {
    key: string;
    title: string;
    rows: Array<{ key: keyof BodyCalculations; label: string; unit: string }>;
}

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
            { key: 'body_fat_percent', label: 'Body Fat (Navy)', unit: '%' },
            { key: 'fat_mass', label: 'Fat Mass', unit: 'kg' },
            { key: 'lean_body_mass', label: 'Lean Body Mass', unit: 'kg' },
            { key: 'muscle_quality', label: 'Muscle Quality', unit: '%' },
        ],
    },
    {
        key: 'ratios',
        title: 'Ratios',
        rows: [
            { key: 'waist_hip_ratio', label: 'Waist-Hip', unit: '' },
            { key: 'waist_height_ratio', label: 'Waist-Height', unit: '' },
            { key: 'shoulder_waist_ratio', label: 'Shoulder-Waist', unit: '' },
            { key: 'shoulder_chest_ratio', label: 'Shoulder-Chest', unit: '' },
            { key: 'shoulder_hip_ratio', label: 'Shoulder-Hip', unit: '' },
            { key: 'thigh_calf_ratio', label: 'Thigh-Calf', unit: '' },
            { key: 'bicep_ratio', label: 'Bicep-Forearm', unit: '' },
            { key: 'leg_torso_ratio', label: 'Leg-Torso', unit: '' },
        ],
    },
    {
        key: 'symmetry',
        title: 'Symmetry',
        rows: [
            { key: 'bicep_flexing_symmetry', label: 'Bicep', unit: '/100' },
            { key: 'forearm_symmetry', label: 'Forearm', unit: '/100' },
        ],
    },
    {
        key: 'metabolism',
        title: 'Metabolism',
        rows: [
            { key: 'bmr', label: 'BMR (Mifflin-St Jeor)', unit: 'kcal' },
            { key: 'metabolic_age', label: 'Metabolic Age', unit: 'yrs' },
        ],
    },
    {
        key: 'performance',
        title: 'Performance',
        rows: [
            { key: 'ffmi', label: 'FFMI', unit: '' },
            { key: 'dynamic_strength', label: 'Dynamic Strength', unit: '/100' },
            { key: 'adonis_index', label: 'Adonis Index', unit: '' },
            { key: 'torso_taper', label: 'Torso Taper (Shoulder-Waist)', unit: 'cm' },
        ],
    },
];

const formatValue = (value: number | null, unit: string): string =>
    value != null
        ? `${Number.isInteger(value) ? value : value.toFixed(1)}${unit ? ` ${unit}` : ''}`
        : '—';

const DerivedMetrics: React.FC<{ values: BodyCalculations; expanded: boolean }> = ({ values, expanded }) => {
    const groups = DERIVED_GROUPS.map(group => {
        const available = group.rows.filter(row => values[row.key] != null).length;
        return {
            ...group,
            count: `${available}/${group.rows.length}`,
            rows: group.rows.map(row => ({
                ...row,
                value: values[row.key],
                shown: formatValue(values[row.key], row.unit),
            })),
        };
    });

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
                                            className="measurement-derived__value"
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