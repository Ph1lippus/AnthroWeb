import React from 'react';
import { checkWeights, distributeToHundred, normalizeWeights } from '../../utils/academicGpa';
import type { AcademicItem } from '../../utils/academicGpa';

interface WeightBadgeProps {
    /** The sibling group whose percentages should add up to 100. */
    items: AcademicItem[];
    onAssign: (assignments: { id: string; weight: number }[]) => void;
    busy?: boolean;
}

/**
 * Reports whether a group of inputs adds up to 100%.
 *
 * Nothing here ever rewrites the user's percentages on its own: a group that
 * already sums to 100 is left exactly as it is, and anything else is surfaced
 * with the shortfall spelled out. Distribute and Normalise only run when the
 * user asks for them.
 */
const WeightBadge: React.FC<WeightBadgeProps> = ({ items, onAssign, busy = false }) => {
    if (items.length === 0) return null;

    const check = checkWeights(items);
    const canAssign = items.every(item => !!item.id);

    const distribute = () => {
        const shares = distributeToHundred(items.length);
        onAssign(items.map((item, index) => ({ id: item.id as string, weight: shares[index] })));
    };

    const normalize = () => {
        const scaled = normalizeWeights(items.map(item => item.weight));
        onAssign(items.map((item, index) => ({ id: item.id as string, weight: scaled[index] })));
    };

    if (check.balanced && check.zeroCount === 0) {
        return (
            <span className="weight-badge weight-badge--ok" data-tip="Weights add up to 100%">
                100%
            </span>
        );
    }

    if (check.total === 0) {
        return (
            <span className="weight-badge weight-badge--empty">
                No weights
                <button
                    type="button"
                    className="weight-fix"
                    onClick={distribute}
                    disabled={busy || !canAssign}
                    data-tip="Give every input an equal share of 100%"
                >
                    Distribute
                </button>
            </span>
        );
    }

    // Sums to 100 but something in the group is worth 0: a new input that
    // joined a full group, counting for nothing. The total alone says "fine",
    // which is how such an input hides -- so this case gets the fix button
    // even though the arithmetic balances. Normalise is deliberately absent:
    // rescaling leaves 0 at 0, so Distribute is the only fix on offer.
    if (check.balanced) {
        return (
            <span
                className="weight-badge weight-badge--off"
                data-tip="The total is 100%, but some inputs are worth 0% and count for nothing"
            >
                {check.total}%
                <span style={{ opacity: 0.8 }}>
                    {check.zeroCount} at 0%
                </span>
                <button
                    type="button"
                    className="weight-fix"
                    onClick={distribute}
                    disabled={busy || !canAssign}
                    data-tip="Split 100% equally between these inputs"
                >
                    Distribute
                </button>
            </span>
        );
    }

    const overshoot = check.missing < 0;
    const shortfall = Math.abs(check.missing);

    return (
        <span className="weight-badge weight-badge--off" data-tip={overshoot ? 'Weights overshoot 100%' : 'Weights do not add up to 100% yet'}>
            {check.total}%
            <span style={{ opacity: 0.8 }}>
                {overshoot ? `+${shortfall} over` : `${shortfall} left`}
                {check.zeroCount > 0 ? ` · ${check.zeroCount} at 0%` : ''}
            </span>
            <button
                type="button"
                className="weight-fix"
                onClick={distribute}
                disabled={busy || !canAssign}
                data-tip="Split 100% equally between these inputs"
            >
                Distribute
            </button>
            <button
                type="button"
                className="weight-fix"
                onClick={normalize}
                disabled={busy || !canAssign}
                data-tip="Rescale these inputs to sum to 100%, keeping their ratios"
            >
                Normalise
            </button>
        </span>
    );
};

export default WeightBadge;
