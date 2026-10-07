import React from 'react';
import { Calculator } from 'lucide-react';
import { computeBodyCalculations } from '../../utils/measurementCalculations';

/**
 * The twenty derived body metrics.
 *
 * Lifted out of the editor's scroll area and into the page's left rail, where the
 * numbers they describe are not twenty-three fields away. The trade is that they
 * now describe the form rather than the saved snapshot, which is the point: a
 * derived figure is only interesting while the inputs producing it are still in
 * reach.
 *
 * `computeBodyCalculations` is imported rather than the result being threaded
 * through, so this component can be handed the same typed values the editor holds
 * and derive from them itself. It is a pure function over plain numbers, so
 * calling it per keystroke costs nothing and needs no cache.
 */

/** Kept in one list, in the order a reader wants them: composition, then effort. */
const DERIVED_ROWS: Array<{ key: keyof ReturnType<typeof computeBodyCalculations>; label: string; unit: string }> = [
    { key: 'body_fat_percent', label: 'Body Fat (Navy)', unit: '%' },
    { key: 'fat_mass', label: 'Fat Mass', unit: 'kg' },
    { key: 'lean_body_mass', label: 'Lean Body Mass', unit: 'kg' },
    { key: 'ffmi', label: 'FFMI', unit: '' },
    { key: 'bmr', label: 'BMR (Mifflin-St Jeor)', unit: 'kcal' },
    { key: 'metabolic_age', label: 'Metabolic Age', unit: 'yrs' },
    { key: 'muscle_quality', label: 'Muscle Quality', unit: '%' },
    { key: 'dynamic_strength', label: 'Dynamic Strength', unit: '/100' },
    { key: 'waist_hip_ratio', label: 'Waist-Hip Ratio', unit: '' },
    { key: 'waist_height_ratio', label: 'Waist-Height Ratio', unit: '' },
    { key: 'shoulder_waist_ratio', label: 'Shoulder-Waist Ratio', unit: '' },
    { key: 'shoulder_chest_ratio', label: 'Shoulder-Chest Ratio', unit: '' },
    { key: 'shoulder_hip_ratio', label: 'Shoulder-Hip Ratio', unit: '' },
    { key: 'thigh_calf_ratio', label: 'Thigh-Calf Ratio', unit: '' },
    { key: 'bicep_ratio', label: 'Bicep-Forearm Ratio', unit: '' },
    { key: 'torso_taper', label: 'Torso Taper (Shoulder-Waist)', unit: 'cm' },
    { key: 'leg_torso_ratio', label: 'Leg-Torso Ratio', unit: '' },
    { key: 'adonis_index', label: 'Adonis Index', unit: '' },
    { key: 'bicep_flexing_symmetry', label: 'Bicep Symmetry', unit: '/100' },
    { key: 'forearm_symmetry', label: 'Forearm Symmetry', unit: '/100' },
];

// The shape `computeBodyCalculations` returns, taken from the function itself so
// the list below cannot drift out of step with it.
type BodyCalculations = ReturnType<typeof computeBodyCalculations>;

const DerivedMetrics: React.FC<{ values: BodyCalculations }> = ({ values }) => {
    const anyInput = Object.values(values).some(v => v !== null && Number.isFinite(v));

    return (
        <div className="measurement-derived measurement-derived--rail">
            <h4 className="measurement-derived__title">
                <Calculator />Calculated
            </h4>

            {/* An explicit empty state rather than twenty em-dashes. Before
                anything is typed there is nothing to calculate, and a column of
                dashes reads as twenty broken numbers instead of one honest gap. */}
            {!anyInput ? (
                <p className="measurement-derived__empty">
                    Fill in any measurement and the twenty derived figures appear here as you type.
                </p>
            ) : (
                <div className="measurement-derived__grid">
                    {DERIVED_ROWS.map(row => {
                        const value = values[row.key];
                        const shown = value != null
                            ? `${Number.isInteger(value) ? value : value.toFixed(1)}${row.unit ? ` ${row.unit}` : ''}`
                            : '—';
                        return (
                            <div key={row.key} className="measurement-derived__row">
                                <span className="measurement-derived__label">{row.label}</span>
                                <span className="measurement-derived__value">{shown}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            <p className="measurement-derived__note">
                Published formulas (US Navy body fat, Mifflin-St Jeor BMR, FFMI, Adonis index).
                Stored with this snapshot when you save.
            </p>
        </div>
    );
};

export default DerivedMetrics;