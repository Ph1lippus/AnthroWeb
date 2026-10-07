import React, { useEffect, useMemo, useState } from 'react';
import { MEASUREMENT_FIELDS, GROUP_LABELS, GROUP_ORDER } from './fieldConfig';
import { computeBodyCalculations } from '../../utils/measurementCalculations';
import type { BodyMeasurement } from '../../services/measurementService';
import { useSaveBodyMeasurement, useDeleteBodyMeasurement } from '../../hooks/useMeasurements';
import { Save, Trash2, Loader2 } from 'lucide-react';

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
    /**
     * The typed values, owned by the page.
     *
     * Controlled rather than internal because the calculated-metrics block now
     * lives in the page's left rail and has to re-derive on every keystroke. It
     * could not do that from inside this component without lifting the state here
     * anyway, and having it here also means the day's numbers survive the rail
     * being scrolled out of view.
     */
    values: Record<string, string>;
    onValuesChange: (values: Record<string, string>) => void;
    onSaved?: (saved: BodyMeasurement) => void;
    onDeleted?: () => void;
}

/**
 * The day's twenty-three fields.
 *
 * Laid out in the daily log's card grid and using its `.scored-input` fields, so
 * this page and the daily log are filled in the same way -- one floating label per
 * field, unit shown inline, the card title naming the group. It was a denser grid
 * of small labelled boxes before, and it did not match anything else in the app.
 *
 * Explicit save, unchanged. `saveBodyMeasurement` is a whole-row upsert, so
 * autosaving a partial change would write `null` over every field the form had not
 * been given -- including the tape measurements another page may hold for the same
 * date. A debounce is the wrong tool for a row this shape.
 */
const MeasurementEditor: React.FC<MeasurementEditorProps> = ({
    date,
    initial,
    context,
    fallbackWeight,
    values,
    onValuesChange,
    onSaved,
    onDeleted,
}) => {
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
        // sync (server data -> local state), which is what effects are for. The
        // component is also keyed on `date`, so this only runs on a day change.
        onValuesChange(next);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDeleteConfirm(false);
    }, [initial, date, onValuesChange]);

    const setField = (id: string, value: string) => onValuesChange({ ...values, [id]: value });

    const raw = useMemo(() => {
        const out: Record<string, number | null> = {};
        for (const f of MEASUREMENT_FIELDS) {
            const str = values[f.id]?.trim();
            const parsed = str === '' || str === undefined ? null : parseFloat(str);
            // A half-typed value like "-" or "1." parses to NaN. Sending that to
            // the database would write a number nobody meant, so it is treated as
            // "not entered" until it is a number.
            out[f.id] = parsed !== null && Number.isNaN(parsed) ? null : parsed;
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
            {/* One card per group, in two columns, so the left rail keeps the
                calculated metrics and the right side reads as a form rather than a
                wall of twenty-three boxes. */}
            <div className="measurements-puzzle">
                {GROUP_ORDER.map(group => {
                    const fields = MEASUREMENT_FIELDS.filter(f => f.group === group);
                    if (fields.length === 0) return null;
                    return (
                        <div key={group} className="card puzzle-card measurement-group-card">
                            <div className="card-header">
                                <h3 className="card-title">{GROUP_LABELS[group]}</h3>
                                <span className="text-xs opacity-50 ml-auto">{fields.length}</span>
                            </div>
                            <div className="card-body">
                                {fields.map(field => {
                                    const value = values[field.id] ?? '';
                                    return (
                                        <div key={field.id} className="scored-input-wrap">
                                            <input
                                                type="number"
                                                step={field.step}
                                                min="0"
                                                value={value}
                                                onChange={(e) => setField(field.id, e.target.value)}
                                                className={'scored-input' + (value ? '' : ' scored-input--empty')}
                                                placeholder=" "
                                                data-tip={field.help}
                                            />
                                            {/* The unit rides in the label rather than
                                                standing alone beside the box: it is part
                                                of what the field means, and this is where
                                                every other field in the app puts it. */}
                                            <label className="scored-input-label">
                                                {field.label} <span className="scored-input-goal-inline">{field.unit}</span>
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
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