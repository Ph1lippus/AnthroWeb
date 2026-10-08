import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MEASUREMENT_FIELDS, GROUP_LABELS, GROUP_COLUMNS } from './fieldConfig';
import { computeBodyCalculations } from '../../utils/measurementCalculations';
import type { BodyMeasurement } from '../../services/measurementService';
import { useSaveBodyMeasurement, useDeleteBodyMeasurement } from '../../hooks/useMeasurements';
import { Trash2 } from 'lucide-react';

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
     * Controlled rather than internal because the calculated-metrics panel now
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
 * field, unit shown inline, the card title naming the group. Six cards rather than
 * three, because arms and legs are two things each rather than one, and a card
 * holding ten boxes of mostly-left/right pairs is not a group anyone would name.
 *
 * Left and right share a row. The comparison between them is the reason both
 * exist, so putting a box under its twin makes the pair readable and the boxes
 * half as wide.
 *
 * Autosaved, as the daily log is. `saveBodyMeasurement` is a whole-row upsert,
 * and every value it needs is held here, so a debounce coalesces a burst of
 * typing into one write rather than a partial one. Writes are chained, so two of
 * them in flight cannot resolve out of order and land the older snapshot last.
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
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
    const openWritesRef = useRef(0);

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

    const hasAny = useMemo(
        () => Object.values(raw).some(v => v !== null),
        [raw],
    );

    /**
     * Writes the whole row, chained behind any write already open.
     *
     * Each call carries the form as it stood when the debounce fired, so two of
     * them landing out of order would leave the older snapshot as the winner. The
     * chain is what makes "the last edit wins" true rather than "the last response
     * wins", the same rule the daily log's autosave follows.
     */
    const runSave = useCallback(() => {
        if (!hasAny) return;
        const payload: BodyMeasurement = {
            measure_date: date,
            weight,
            ...Object.fromEntries(MEASUREMENT_FIELDS.map(f => [f.id, raw[f.id] ?? null])),
            ...calc as unknown as Record<string, number | null>,
        };
        openWritesRef.current += 1;
        setSaveState('saving');
        let written = false;
        const run = () => saveMutation.mutateAsync(payload);
        saveChainRef.current = saveChainRef.current
            .then(run, run)
            .then(m => {
                written = true;
                return m;
            })
            .finally(() => {
                openWritesRef.current -= 1;
                if (openWritesRef.current > 0) return;
                if (!written) {
                    setSaveState('idle');
                    return;
                }
                setSaveState('saved');
                if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
                savedTimerRef.current = setTimeout(() => {
                    savedTimerRef.current = null;
                    setSaveState('idle');
                }, 2000);
            });
    }, [date, weight, raw, calc, hasAny, saveMutation]);

    // Debounced autosave. Reads the latest `runSave` through the same effect that
    // schedules it, so a day change cannot leave a timer pointing at yesterday.
    useEffect(() => {
        const timer = setTimeout(() => {
            saveTimerRef.current = null;
            runSave();
        }, 700);
        saveTimerRef.current = timer;
        return () => {
            if (saveTimerRef.current === timer) saveTimerRef.current = null;
            clearTimeout(timer);
        };
    }, [runSave]);

    // A pending write belongs to the day it was made for, so leaving the page
    // inside the debounce window must not throw the edit away.
    useEffect(() => () => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
            runSave();
        }
    }, [runSave]);

    const handleDelete = async () => {
        if (!initial?.id) return;
        await deleteMutation.mutateAsync(initial.id);
    };

    const hasExisting = !!initial;

    /**
     * One labelled box.
     *
     * The unit rides in the label rather than standing alone beside the box: it is
     * part of what the field means, and this is where every other field in the app
     * puts it.
     */
    const field = (f: typeof MEASUREMENT_FIELDS[number], label?: React.ReactNode) => {
        const value = values[f.id] ?? '';
        return (
            <div key={f.id} className="scored-input-wrap">
                <input
                    type="number"
                    step={f.step}
                    min="0"
                    value={value}
                    onChange={(e) => setField(f.id, e.target.value)}
                    className={'scored-input' + (value ? '' : ' scored-input--empty')}
                    placeholder=" "
                    data-tip={f.help}
                />
                <label className="scored-input-label">
                    {label ?? f.label} <span className="scored-input-goal-inline">{f.unit}</span>
                </label>
            </div>
        );
    };

    /**
     * The label for one half of a pair.
     *
     * A pair with sides shows the side as a tag and the noun on its own, because
     * the full name would repeat the side the tag already carries. A pair without
     * sides shows each box's own name: "Shoulders" and "Chest" beside each other
     * read fine, and "Shoulders" and "Waist" would not.
     */
    const pairLabel = (f: typeof MEASUREMENT_FIELDS[number]) => {
        if (!f.side) return f.label;
        return (
            <>
                <span className="measurement-pair__side">{f.side}</span>
                {f.shortLabel}
            </>
        );
    };

    return (
        <div>
            {/*
                Mosaic, as the daily log's cards are: two columns, each packing
                its cards independently, so a short card does not leave a hole
                waiting on the taller one beside it. The daily log's own classes
                rather than copies of them, so a change to that layout lands here
                too.
            */}
            <div className="daily-log-puzzle measurements-puzzle">
                {GROUP_COLUMNS.map((column, ci) => (
                    <div key={ci} className="daily-log-col">
                        {column.map(group => {
                            const fields = MEASUREMENT_FIELDS.filter(f => f.group === group);
                            if (fields.length === 0) return null;
                            // A field named as somebody's pair never gets a row of
                            // its own -- it is already drawn beside its head, and
                            // letting the loop reach it would put a second box of
                            // the same reading underneath.
                            const taken = new Set(
                                fields.filter(x => x.pair).map(x => x.pair as string),
                            );
                            return (
                                <div key={group} className="card puzzle-card measurement-group-card">
                                    <div className="card-header">
                                        <h3 className="card-title">{GROUP_LABELS[group]}</h3>
                                        <span className="text-xs opacity-50 ml-auto">{fields.length}</span>
                                    </div>
                                    <div className="card-body">
                                        {fields.map(f => {
                                            if (taken.has(f.id)) return null;
                                            // The head of a pair: both halves, side by
                                            // side. A pair with sides says which is
                                            // which; one without (chest beside
                                            // shoulders) takes each box's own name,
                                            // since there is no side to name.
                                            if (f.pair) {
                                                const other = fields.find(x => x.id === f.pair);
                                                return (
                                                    <div key={f.id} className="measurement-pair">
                                                        {field(f, pairLabel(f))}
                                                        {other && field(other, pairLabel(other))}
                                                    </div>
                                                );
                                            }
                                            return field(f);
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            <div className="measurement-actions">
                {/* Says out loud whether the last write has landed. A pending save
                    looks identical to a saved one, and a refresh in between used to
                    throw the edit away. */}
                <span className="measurement-save-state" aria-live="polite">
                    {saveState === 'saving' && 'Saving…'}
                    {saveState === 'saved' && 'Saved'}
                </span>
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