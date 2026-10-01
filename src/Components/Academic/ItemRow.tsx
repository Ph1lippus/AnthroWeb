import React from 'react';
import { Plus, SquarePen, Trash2 } from 'lucide-react';
import InlineNumber from './InlineNumber';
import WeightBadge from './WeightBadge';
import { CATEGORY_LABELS, formatPoints, percentToScalePoints, resolveItemPercent, sortForDisplay } from '../../utils/academicGpa';
import {
    daysBetween,
    formatDayFull,
    formatDayShort,
    parseDueDate,
    startOfToday,
} from '../../utils/academicAlerts';
import type { AcademicItem, GpaScale, ItemNode, MissingLeafSolution } from '../../utils/academicGpa';

interface ItemRowProps {
    node: ItemNode;
    /** The active scale, so a score's own denominator can be shown in context. */
    scale: GpaScale;
    onEdit: (item: AcademicItem) => void;
    onDelete: (item: AcademicItem) => void;
    onAddChild: (parent: AcademicItem) => void;
    onPatch: (item: AcademicItem, patch: Partial<AcademicItem>) => void;
    onAssignWeights: (assignments: { id: string; weight: number }[]) => void;
    weightsBusy?: boolean;
    /** Set on the one ungraded input a known final grade can pin down. */
    backSolve?: MissingLeafSolution | null;
}

/**
 * One graded input, plus - when it has them - its own stacked sub-works.
 *
 * The component renders itself for its children, so a homework split into five
 * parts works with no special casing, and so does a fourth level if someone
 * goes that far.
 */
const ItemRow: React.FC<ItemRowProps> = ({
    node,
    scale,
    onEdit,
    onDelete,
    onAddChild,
    onPatch,
    onAssignWeights,
    weightsBusy = false,
    backSolve = null,
}) => {
    const { item, children } = node;
    const isParent = children.length > 0;
    const percent = resolveItemPercent(node);

    // The 20-vs-100 trap that made "18" read as 18%: a denominator of exactly
    // 100 while the active scale caps somewhere else. Deliberate small quizzes
    // (out of 10, 50) are left alone - their percentage is already shown, and
    // flagging every non-matching denominator would train people to ignore it.
    const offScale =
        !isParent && item.max_score === 100 && Math.abs(scale.max_value - 100) > 1e-9;

    // The score as it reads on the active scale, for the same reason: it lets
    // the user see "90% is an 18" without doing the division themselves.
    const points = percent === null ? null : percentToScalePoints(percent, scale);

    // Countdown shown beside the name, so "First Exam" says when it is. Parsed as
    // local midnight: a due date is a calendar day, and reading it as UTC would
    // show it a day early for anyone east of Greenwich.
    const dueAt = item.due_date ? parseDueDate(item.due_date) : null;
    const daysUntil = dueAt === null ? null : daysBetween(startOfToday(), dueAt);
    const isUpcoming = daysUntil !== null && daysUntil >= 0;
    const urgent = isUpcoming && daysUntil <= 3;
    const shortDue = dueAt === null ? '' : formatDayShort(dueAt);
    const fullDue = dueAt === null ? '' : formatDayFull(dueAt);

    return (
        <>
            <div className={`item-row${isParent ? ' item-row--parent' : ''}`}>
                <span className="item-row__name">{item.name}</span>
                <span className="item-row__cat">{CATEGORY_LABELS[item.category]}</span>
                {/* Only for dated work, and only while it is still ahead: a date
                    in the past is history, and repeating it on every past-dated
                    row would be clutter. */}
                {daysUntil !== null && (
                    <span
                        className={`item-row__due${urgent ? ' item-row__due--urgent' : ''}`}
                        title={fullDue}
                    >
                        {shortDue} · {daysUntil === 0 ? 'today' : daysUntil === 1 ? '1 day' : `${daysUntil} days`}
                    </span>
                )}

                {isParent ? (
                    // A parent's grade comes from its children, so it is shown read-only.
                    <span
                        className={`item-score__pct${percent === null ? ' item-score__pct--empty' : ''}`}
                        title={percent === null ? 'No sub-work graded yet' : 'Average of the sub-works'}
                    >
                        {percent === null ? '—' : formatPoints(points, scale)}
                    </span>
                ) : (
                    <span className="item-score">
                        <InlineNumber
                            value={item.score}
                            onCommit={value => onPatch(item, { score: value })}
                            placeholder="—"
                            emptyValue={null}
                        />
                        <span className="item-score__sep">/</span>
                        <InlineNumber
                            value={item.max_score}
                            onCommit={value => onPatch(item, { max_score: value ?? scale.max_value })}
                            emptyValue={scale.max_value}
                            min={0.1}
                            className={`num-input${offScale ? ' num-input--off-scale' : ''}`}
                        />
                        <span
                            className={`item-score__pct${percent === null ? ' item-score__pct--empty' : ''}`}
                            title={
                                offScale
                                    ? `Out of ${item.max_score} rather than the ${scale.max_value} on this scale`
                                    : undefined
                            }
                        >
                            {percent === null ? '—' : `${percent.toFixed(1)}%`}
                        </span>
                        {offScale && (
                            <button
                                type="button"
                                className="item-rebase"
                                title={`Change the denominator to ${scale.max_value} without changing the score. Only do this if the score was written on the ${scale.name} scale.`}
                                onClick={() => onPatch(item, { max_score: scale.max_value })}
                            >
                                → {scale.max_value}
                            </button>
                        )}
                        {backSolve !== null && backSolve.itemId === item.id && percent === null && (
                            <span
                                className={`item-inferred${backSolve.clamped ? ' item-inferred--warn' : ''}`}
                                title="Worked back from the final grade. Every score in this range is reported as the same grade, so the input is only knowable as a range."
                            >
                                ≈ {backSolve.loScore.toFixed(2)}–{backSolve.hiScore.toFixed(2)} / {backSolve.maxScore}
                                {backSolve.clamped ? ' · impossible' : ''}
                            </span>
                        )}
                    </span>
                )}

                <span className="item-score" title="Percentage of the course grade this input is worth">
                    <InlineNumber
                        value={item.weight}
                        onCommit={value => onPatch(item, { weight: value ?? 0 })}
                        emptyValue={0}
                        min={0}
                        max={100}
                        className="num-input num-input--weight"
                    />
                    <span className="item-score__sep">%</span>
                </span>

                <div className="flex gap-1 shrink-0">
                    <button
                        type="button"
                        className="book-action-btn"
                        onClick={() => onAddChild(item)}
                        title="Add a sub-work under this"
                    >
                        <Plus />
                    </button>
                    <button
                        type="button"
                        className="book-action-btn"
                        onClick={() => onEdit(item)}
                        title="Edit this input"
                    >
                        <SquarePen />
                    </button>
                    <button
                        type="button"
                        className="book-action-btn book-action-btn--danger"
                        onClick={() => onDelete(item)}
                        title="Delete this input"
                    >
                        <Trash2 />
                    </button>
                </div>
            </div>

            {isParent && (
                <div className="item-children">
                    <WeightBadge items={children.map(child => child.item)} onAssign={onAssignWeights} busy={weightsBusy} />
                    {sortForDisplay(children).map(child => (
                        <ItemRow
                            key={child.item.id}
                            node={child}
                            scale={scale}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onAddChild={onAddChild}
                            onPatch={onPatch}
                            onAssignWeights={onAssignWeights}
                            weightsBusy={weightsBusy}
                            backSolve={backSolve}
                        />
                    ))}
                </div>
            )}
        </>
    );
};

export default ItemRow;
