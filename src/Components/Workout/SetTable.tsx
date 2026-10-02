import React from 'react';
import { CopyPlus, Trash2 } from 'lucide-react';
import { toKg, fromKg, type WeightUnit } from '../../utils/units';
import { parseInputNumber, type WorkoutSet } from '../../utils/workoutSets';

interface SetTableProps {
    sets: WorkoutSet[];
    onChange: (sets: WorkoutSet[]) => void;
    weightUnit: WeightUnit;
    /** Hide the row-number column, for the narrower session layout. */
    showNumbers?: boolean;
    disabled?: boolean;
}

/**
 * One row per working set, each with its own reps and weight.
 *
 * This is the reason `sets_detail` exists. The aggregate triple forced every
 * set in an exercise to be identical, which made a drop set, a warm-up or a
 * back-off impossible to write down -- the three cases that matter most in a
 * real training log.
 *
 * Values are edited in the display unit and stored in kilograms, so switching a
 * profile between kg and lbs never rewrites the number behind the user's back.
 */
const SetTable: React.FC<SetTableProps> = ({ sets, onChange, weightUnit, showNumbers = true, disabled = false }) => {
    const setAt = (index: number, patch: Partial<WorkoutSet>) =>
        onChange(sets.map((set, i) => (i === index ? { ...set, ...patch } : set)));

    /** Copy the last set down, the usual case when ramping weight. */
    const copyLastDown = () => {
        if (sets.length === 0) return;
        onChange([...sets, { ...sets[sets.length - 1] }]);
    };

    /** Push one row's values across every other row. */
    const applyRowToAll = (index: number) => {
        const source = sets[index];
        onChange(sets.map((set, i) => (i === index ? set : { ...source })));
    };

    return (
        <div className="workout-set-table">
            <div className="workout-set-table__head">
                {showNumbers && <span className="workout-set-table__head-cell">#</span>}
                <span className="workout-set-table__head-cell">Reps</span>
                <span className="workout-set-table__head-cell">{weightUnit}</span>
                <span className="workout-set-table__head-cell" />
            </div>

            {sets.map((set, index) => (
                <div className="workout-set-table__row" key={index}>
                    {showNumbers && <span className="workout-set-table__num">{index + 1}</span>}
                    <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={999}
                        className="workout-set-table__input"
                        value={set.reps ?? ''}
                        disabled={disabled}
                        placeholder="—"
                        aria-label={`Set ${index + 1} reps`}
                        onChange={event => setAt(index, { reps: parseInputNumber(event.target.value) })}
                    />
                    <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={weightUnit === 'kg' ? 0.5 : 1}
                        className="workout-set-table__input"
                        value={set.weight != null ? fromKg(set.weight, weightUnit) : ''}
                        disabled={disabled}
                        placeholder="—"
                        aria-label={`Set ${index + 1} weight in ${weightUnit}`}
                        onChange={event => {
                            const parsed = parseInputNumber(event.target.value);
                            setAt(index, { weight: parsed != null ? toKg(parsed, weightUnit) : undefined });
                        }}
                    />
                    <button
                        type="button"
                        className="workout-set-table__action"
                        title="Copy this set's values to every other set"
                        aria-label={`Apply set ${index + 1} to all sets`}
                        disabled={disabled || sets.length < 2}
                        onClick={() => applyRowToAll(index)}
                    >
                        <CopyPlus size={12} />
                    </button>
                </div>
            ))}

            <div className="workout-set-table__footer">
                <button
                    type="button"
                    className="btn-action"
                    disabled={disabled || sets.length === 0}
                    onClick={copyLastDown}
                >
                    <CopyPlus size={11} className="mr-1" />Duplicate last
                </button>
                <button
                    type="button"
                    className="btn-action"
                    disabled={disabled || sets.length === 0}
                    onClick={() => onChange(sets.map(() => ({})))}
                >
                    <Trash2 size={11} className="mr-1" />Clear
                </button>
            </div>
        </div>
    );
};

export default SetTable;

/**
 * Set count stepper. Grows or shrinks the row list, which is why the list is
 * never derived from how much detail happened to be typed.
 */
export const SetCounter: React.FC<{
    count: number;
    onChange: (count: number) => void;
    max?: number;
    disabled?: boolean;
}> = ({ count, onChange, max = 20, disabled = false }) => (
    <div className="workout-set-counter">
        <button
            type="button"
            className="workout-set-counter__btn"
            aria-label="Remove a set"
            disabled={disabled || count <= 1}
            onClick={() => onChange(Math.max(1, count - 1))}
        >
            −
        </button>
        <span className="workout-set-counter__value">{count} sets</span>
        <button
            type="button"
            className="workout-set-counter__btn"
            aria-label="Add a set"
            disabled={disabled || count >= max}
            onClick={() => onChange(Math.min(max, count + 1))}
        >
            +
        </button>
    </div>
);