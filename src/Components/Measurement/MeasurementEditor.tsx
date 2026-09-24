import React, { useEffect, useMemo, useState } from 'react';
import { MEASUREMENT_FIELDS, GROUP_LABELS, GROUP_ORDER } from './fieldConfig';
import { computeBodyCalculations } from '../../utils/measurementCalculations';
import type { BodyMeasurement } from '../../services/measurementService';
import { useSaveBodyMeasurement, useDeleteBodyMeasurement } from '../../hooks/useMeasurements';
import { Save, Trash2, Calculator, Loader2 } from 'lucide-react';

export interface MeasurementContext {
    gender?: string;
    height_cm?: number | null;
    age?: number | null;
    relativeBestLift?: number | null;
}

interface MeasurementEditorProps {
    date: string;
    initial: BodyMeasurement | null;
    context: MeasurementContext;
    fallbackWeight?: number | null;
    onSaved?: (saved: BodyMeasurement) => void;
    onDeleted?: () => void;
}

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
    { key: 'bicep_ratio', label: 'Bicep-Forarm Ratio', unit: '' },
    { key: 'torso_taper', label: 'Torso Taper (Shoulder-Waist)', unit: 'cm' },
    { key: 'leg_torso_ratio', label: 'Leg-Torso Ratio', unit: '' },
    { key: 'adonis_index', label: 'Adonis Index', unit: '' },
    { key: 'bicep_flexing_symmetry', label: 'Bicep Symmetry', unit: '/100' },
    { key: 'forearm_symmetry', label: 'Forearm Symmetry', unit: '/100' },
];

const MeasurementEditor: React.FC<MeasurementEditorProps> = ({
    date,
    initial,
    context,
    fallbackWeight,
    onSaved,
    onDeleted,
}) => {
    const [values, setValues] = useState<Record<string, string>>({});
    const saveMutation = useSaveBodyMeasurement(m => onSaved?.(m));
    const deleteMutation = useDeleteBodyMeasurement(() => onDeleted?.());
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    useEffect(() => {
        const next: Record<string, string> = {};
        for (const f of MEASUREMENT_FIELDS) {
            const v = initial?.[f.id as keyof BodyMeasurement];
            next[f.id] = v != null ? String(v) : '';
        }
        // Populating the editor from the fetched record is an external-system
        // sync (server data -> local state), which is what effects are for.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setValues(next);
        setDeleteConfirm(false);
    }, [initial, date]);

    const setField = (id: string, value: string) => setValues(prev => ({ ...prev, [id]: value }));

    const raw = useMemo(() => {
        const out: Record<string, number | null> = {};
        for (const f of MEASUREMENT_FIELDS) {
            const str = values[f.id]?.trim();
            out[f.id] = str === '' ? null : parseFloat(str);
        }
        return out;
    }, [values]);

    const weight = raw.weight ?? fallbackWeight ?? null;

    const calc = useMemo(() => computeBodyCalculations(
        { ...raw, weight },
        {
            gender: (context.gender || '') as 'male' | 'female' | 'other' | 'prefer_not_to_say' | '',
            height_cm: context.height_cm ?? null,
            age: context.age ?? null,
            relativeBestLift: context.relativeBestLift ?? null,
        }
    ), [raw, weight, context]);

    const handleSave = async () => {
        const payload: BodyMeasurement = {
            measure_date: date,
            weight,
            ...Object.fromEntries(MEASUREMENT_FIELDS.map(f => [f.id, raw[f.id] ?? null])),
            ...calc as unknown as Record<string, number | null>,
        };
        await saveMutation.mutateAsync(payload);
    };

    const handleDelete = async () => {
        if (!initial?.id) return;
        await deleteMutation.mutateAsync(initial.id);
    };

    const hasExisting = !!initial;

    return (
        <div>
            <div className="measurement-form">
                {GROUP_ORDER.map(group => (
                    <div key={group} className="measurement-group">
                        <h4 className="measurement-group__title">{GROUP_LABELS[group]}</h4>
                        <div className="measurement-group__fields">
                            {MEASUREMENT_FIELDS.filter(f => f.group === group).map(field => (
                                <div key={field.id} className="measurement-field">
                                    <label className="measurement-field__label" title={field.help}>
                                        {field.label} <span className="measurement-field__unit">({field.unit})</span>
                                    </label>
                                    <input
                                        type="number"
                                        className="measurement-field__input"
                                        value={values[field.id] ?? ''}
                                        step={field.step}
                                        min="0"
                                        onChange={(e) => setField(field.id, e.target.value)}
                                        placeholder={field.unit}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Derived preview */}
            <div className="measurement-derived">
                <h4 className="measurement-derived__title"><Calculator /> Calculated Metrics</h4>
                <div className="measurement-derived__grid">
                    {DERIVED_ROWS.map(row => {
                        const val = calc[row.key];
                        return (
                            <div key={row.key} className="measurement-derived__row">
                                <span className="measurement-derived__label">{row.label}</span>
                                <span className="measurement-derived__value">
                                    {val != null ? `${typeof val === 'number' ? (Number.isInteger(val) ? val : val.toFixed(1)) : val} ${row.unit}`.trim() : '—'}
                                </span>
                            </div>
                        );
                    })}
                </div>
                <p className="measurement-derived__note">
                    All calculations use published formulas (US Navy body fat, Mifflin-St Jeor BMR, FFMI, Adonis index).
                    They are stored with this snapshot and update automatically as you type.
                </p>
            </div>

            <div className="measurement-actions">
                <button className="btn-action" onClick={handleSave} disabled={saveMutation.isPending}>
                    {saveMutation.isPending
                        ? <><Loader2 className="mr-1" />Saving...</>
                        : <><Save className="mr-1" />{hasExisting ? 'Update Measurement' : 'Save Measurement'}</>}
                </button>
                {hasExisting && !deleteConfirm && (
                    <button className="btn-danger-inline" onClick={() => setDeleteConfirm(true)}>
                        <Trash2 className="mr-1" />Delete
                    </button>
                )}
                {deleteConfirm && (
                    <span className="measurement-delete-confirm">
                        <span className="measurement-delete-confirm__text">Delete this day?</span>
                        <button className="btn-danger-inline" onClick={handleDelete}>Yes</button>
                        <button className="btn-form-cancel" onClick={() => setDeleteConfirm(false)}>No</button>
                    </span>
                )}
            </div>
        </div>
    );
};

export default MeasurementEditor;