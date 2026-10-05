import React, { useState } from 'react';
import { ChevronDown, Plus, SquarePen, Trash2 } from 'lucide-react';
import InlineNumber from './InlineNumber';
import ItemRow from './ItemRow';
import WeightBadge from './WeightBadge';
import {
    attainableLower,
    attainableUpper,
    formatPoints,
    integerInterval,
    letterFor,
    percentToPoints,
    percentToScalePoints,
    pointsToPercent,
    predictCoursePercent,
    solveMissingLeaf,
    sortForDisplay,
} from '../../utils/academicGpa';
import type { AcademicCourse, AcademicItem, GpaScale, ItemNode } from '../../utils/academicGpa';

interface CourseRowProps {
    course: AcademicCourse;
    tree: ItemNode[];
    scale: GpaScale;
    onEdit: (course: AcademicCourse) => void;
    onDelete: (course: AcademicCourse) => void;
    onAddItem: (parent: AcademicItem | null) => void;
    onEditItem: (item: AcademicItem) => void;
    onDeleteItem: (item: AcademicItem) => void;
    onPatchCourse: (course: AcademicCourse, patch: Partial<AcademicCourse>) => void;
    onPatchItem: (item: AcademicItem, patch: Partial<AcademicItem>) => void;
    onAssignWeights: (assignments: { id: string; weight: number }[]) => void;
    weightsBusy?: boolean;
}

/**
 * A subject inside a semester: the running prediction built from its inputs,
 * and at the end of the row the grade the teacher actually handed out.
 */
const CourseRow: React.FC<CourseRowProps> = ({
    course,
    tree,
    scale,
    onEdit,
    onDelete,
    onAddItem,
    onEditItem,
    onDeleteItem,
    onPatchCourse,
    onPatchItem,
    onAssignWeights,
    weightsBusy = false,
}) => {
    // Folded by default: opening a semester should show its subjects and their
    // grades at a glance, with the inputs one click away.
    const [open, setOpen] = useState(false);

    const prediction = predictCoursePercent(tree);
    const roots = tree.map(node => node.item);

    const hasFinal = typeof course.final_grade === 'number' && !Number.isNaN(course.final_grade);
    const finalGrade = hasFinal ? (course.final_grade as number) : null;

    const predictedPoints = prediction.percent === null ? null : percentToScalePoints(prediction.percent, scale);
    const finalPoints = finalGrade === null ? null : percentToScalePoints(finalGrade, scale);

    // The whole-point grade the teacher would report, and the continuous span
    // that still rounds to it. Showing the span is what turns a flat "16" into
    // "16, as long as you stay between 15.50 and 16.50".
    const predictedGrade = prediction.percent === null ? null : percentToPoints(prediction.percent, scale);
    const predictedRange = predictedGrade === null ? null : integerInterval(predictedGrade, scale);
    const nearEdge =
        predictedRange !== null && predictedPoints !== null
            ? Math.min(predictedPoints - predictedRange.loPoints, predictedRange.hiPoints - predictedPoints) < 0.15
            : false;

    // With a known final grade and exactly one input left, work out what that
    // input must have scored. Null whenever the answer would be a guess.
    const backSolve =
        hasFinal && prediction.percent !== null ? solveMissingLeaf(tree, course.final_grade as number, scale) : null;

    // How far the prediction landed from the real grade: the useful bit of
    // feedback. Expressed in scale points, because that is the unit the user
    // thinks in - "+1.50" on 20/20 is clearer than "+7.5%".
    const deltaPoints =
        predictedPoints !== null && finalPoints !== null
            ? Math.round((finalPoints - predictedPoints) * 100) / 100
            : null;

    return (
        <div className={`course-row${open ? ' course-row--open' : ''}`}>
            {/* Header doubles as the toggle, the way a semester does, so a long
                course can be folded away while its grade stays on screen. */}
            <button
                type="button"
                className="course-head"
                onClick={() => setOpen(current => !current)}
                aria-expanded={open}
            >
                <div className="course-head__text">
                    <span className="course-title">{course.name}</span>
                    <span className="course-sub">
                        <span>{course.credits} ECTS</span>
                        {course.code && <span>· {course.code}</span>}
                        <span>
                            · {prediction.gradedCount}/{prediction.totalCount || 0} inputs
                        </span>
                        {/* Count alone is misleading: one entered input out of the
                            one you have created so far reads as "1/1 done". */}
                        {prediction.percent !== null && (
                            <span>
                                ·{' '}
                                {prediction.weightsClosed
                                    ? `${prediction.gradedWeight}% of grade`
                                    : `weights ${prediction.totalWeight}% · ${prediction.gradedWeight}% graded`}
                            </span>
                        )}
                    </span>
                </div>

                <div className="course-scores">
                    <div
                        className={`score-block score-block--predicted${
                            prediction.isPartial ? ' score-block--provisional' : ''
                        }`}
                    >
                        <span className="academic-kicker">
                            {prediction.isPartial ? 'So far' : 'Predicted'}
                        </span>
                        <span
                            className={`score-block__value${prediction.percent === null ? ' score-block--muted' : ''}`}
                            data-tip={
                                prediction.isPartial
                                    ? `Only ${prediction.gradedWeight}% of this grade is entered${
                                          prediction.weightsClosed ? '' : `, out of ${prediction.totalWeight}% allocated so far`
                                      }. This is that slice scaled up - not the course's final result.`
                                    : 'Based on all inputs'
                            }
                        >
                            {formatPoints(predictedPoints, scale)}
                        </span>
                        {predictedPoints !== null &&
                            (prediction.isPartial ? (
                                // A letter grade here would read as a verdict. Half a
                                // course scored 20/20 is a 20/20 SO FAR, not an A.
                                <span className="score-block__letter">
                                    {prediction.weightsClosed
                                    ? `${prediction.gradedWeight}% of grade`
                                    : `${prediction.gradedWeight}% of ${prediction.totalWeight}% allocated`}
                                </span>
                            ) : (
                                <span className="score-block__letter">
                                    {letterFor(prediction.percent!)} · {prediction.percent!.toFixed(1)}%
                                </span>
                            ))}
                        {predictedRange !== null && (
                            <span
                                className={`score-block__range${nearEdge ? ' score-block__range--edge' : ''}`}
                                data-tip={
                                    prediction.isPartial
                                        ? `Based only on ${prediction.gradedWeight}% of the grade. On ${scale.name}, this span reports as ${predictedRange.grade}.`
                                        : `On ${scale.name}, any result in this span is reported as ${predictedRange.grade}`
                                }
                            >
                                {prediction.isPartial ? 'of that ' : 'stays '}
                                {predictedRange.grade} ·{' '}
                                {attainableLower(predictedRange.loPoints, predictedRange.loInclusive).toFixed(2)}–
                                {attainableUpper(predictedRange.hiPoints, predictedRange.hiInclusive).toFixed(2)}
                            </span>
                        )}
                    </div>

                    {hasFinal && (
                        <div className="score-block">
                            <span className="academic-kicker">Final</span>
                            <span className="score-block__value">{formatPoints(finalPoints, scale)}</span>
                            <span className="score-block__letter">
                                {letterFor(finalGrade!)} · {finalGrade!.toFixed(1)}%
                            </span>
                        </div>
                    )}

                    {deltaPoints !== null && deltaPoints !== 0 && (
                        <div className="score-block">
                            <span className="academic-kicker">Delta</span>
                            <span
                                className={`score-block__delta ${
                                    deltaPoints > 0 ? 'score-block__delta--good' : 'score-block__delta--warn'
                                }`}
                            >
                                {deltaPoints > 0 ? '+' : ''}
                                {deltaPoints.toFixed(2)}
                            </span>
                            <span className="score-block__letter">
                                {deltaPoints > 0 ? 'beat' : 'missed'}
                            </span>
                        </div>
                    )}
                </div>

                <ChevronDown size={15} className="course-chevron" />
            </button>

            {/* Everything below the header is detail, so it folds away with it. */}
            {open && (
                <>
            {tree.length > 0 && (
                <div
                    className="course-bar"
                    data-tip={`${formatPoints(predictedPoints, scale)} predicted`}
                    // A visual bar with no text in it, so its `title` was the only
                    // thing exposing the figure to anything reading the page.
                    // `role="img"` with a label is the honest version of that; an
                    // `aria-label` on a bare `div` is ignored.
                    role="img"
                    aria-label={`${formatPoints(predictedPoints, scale)} predicted`}
                >
                    <div
                        className={`course-bar__fill${prediction.percent === null ? ' course-bar__fill--muted' : ''}`}
                        style={{ width: `${Math.min(100, prediction.percent ?? 0)}%` }}
                    />
                </div>
            )}

            {/* Undated work first, then anything with a date in order, so a
                course reads as "here is my standing work, and here is my
                schedule" instead of however it happened to be typed. */}
            {tree.length > 0 && (
                <div className="course-items">
                    {sortForDisplay(tree).map(node => (
                        <ItemRow
                            key={node.item.id}
                            node={node}
                            scale={scale}
                            onEdit={onEditItem}
                            onDelete={onDeleteItem}
                            onAddChild={parent => onAddItem(parent)}
                            onPatch={onPatchItem}
                            onAssignWeights={onAssignWeights}
                            weightsBusy={weightsBusy}
                            backSolve={backSolve}
                        />
                    ))}
                </div>
            )}

            {/* Weight tools sit above the list; the empty note replaces the list entirely
                when there is nothing yet. */}
            <div className="course-actions">
                <WeightBadge items={roots} onAssign={onAssignWeights} busy={weightsBusy} />
                {tree.length === 0 && (
                    <span className="course-empty-note">
                        Add tests, homework or exams to start predicting this course.
                    </span>
                )}
            </div>

            {/* The grade the teacher gave, kept at the end of the line and always
                editable. It is entered and shown in the ACTIVE SCALE's units, so
                on 20/20 the user types 18 and it is stored as 90%. The database
                column stays a percentage; the conversion happens at the edges. */}
            <div className="course-final">
                <span className="academic-kicker">Teacher's final grade</span>
                <InlineNumber
                    value={finalPoints}
                    onCommit={value => onPatchCourse(course, { final_grade: pointsToPercent(value ?? 0, scale) })}
                    placeholder="—"
                    emptyValue={null}
                    min={scale.min_value}
                    max={scale.max_value}
                    className="num-input num-input--final"
                />
                <span className="item-score__sep">/ {scale.max_value}</span>
                {finalGrade !== null && (
                    <>
                        <span className="score-block__letter">
                            {letterFor(finalGrade)} · {finalGrade.toFixed(1)}%
                        </span>
                        {deltaPoints !== null && (
                            <span className="item-score__pct">
                                predicted {formatPoints(predictedPoints, scale)}
                            </span>
                        )}
                    </>
                )}
                {/* Adding, editing and deleting the subject all act on this same
                    line, so they sit together where the eye already is. */}
                <span className="flex gap-1" style={{ marginLeft: 'auto' }}>
                    <button
                        type="button"
                        className="btn-action"
                        onClick={() => onAddItem(null)}
                        data-tip="Add an input to this subject"
                    >
                        <Plus size={13} /> Add input
                    </button>
                    <button
                        type="button"
                        className="book-action-btn"
                        onClick={() => onEdit(course)}
                        data-tip="Edit course"
                    >
                        <SquarePen />
                    </button>
                    <button
                        type="button"
                        className="book-action-btn book-action-btn--danger"
                        onClick={() => onDelete(course)}
                        data-tip="Delete course"
                    >
                        <Trash2 />
                    </button>
                </span>
            </div>
                </>
            )}
        </div>
    );
};

export default CourseRow;
