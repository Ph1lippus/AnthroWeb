import React, { useMemo, useState } from 'react';
import {
    checkWeights,
    CATEGORY_LABELS,
    DEFAULT_ITEM_CATEGORY,
    effectiveMinimum,
    formatPoints,
    ITEM_CATEGORIES,
    percentToScalePoints,
    pointsToPercent,
    round2,
    suggestItemName,
} from '../../utils/academicGpa';
import type { AcademicCourse, AcademicItem, GpaScale, ItemCategory } from '../../utils/academicGpa';

interface ItemEditorModalProps {
    /** null creates a new input. */
    item: AcademicItem | null;
    course: AcademicCourse;
    /** null means this input sits at the top level of the course. */
    parent: AcademicItem | null;
    /** The current siblings, so the form can show the running weight total. */
    siblings: AcademicItem[];
    /** The active scale, which supplies the default denominator for a new input. */
    scale: GpaScale;
    onClose: () => void;
    onSubmit: (item: AcademicItem) => void;
    busy?: boolean;
}

const ItemEditorModal: React.FC<ItemEditorModalProps> = ({
    item,
    course,
    parent,
    siblings,
    scale,
    onClose,
    onSubmit,
    busy = false,
}) => {
    // A new input arrives unnamed, so the default type supplies a name and any
    // later type change replaces it while the name is still ours to own.
    const initialSuggestion = item === null ? suggestItemName(DEFAULT_ITEM_CATEGORY, siblings) : null;

    const [name, setName] = useState(item?.name ?? initialSuggestion ?? '');
    const [category, setCategory] = useState<ItemCategory>(item?.category ?? DEFAULT_ITEM_CATEGORY);
    // Flips the moment the user types, which stops a category change from
    // overwriting a name they wrote. An item opened for editing starts as
    // touched, so changing its type never renames work that is already saved.
    const [nameTouched, setNameTouched] = useState(item !== null);
    const [weight, setWeight] = useState(String(item?.weight ?? 0));
    // New inputs start on the active scale, so on 20/20 the box reads "/20" and
    // typing 18 means 18 out of 20. Existing inputs keep whatever they were
    // saved with - changing it here would silently reinterpret old scores.
    const [maxScore, setMaxScore] = useState(String(item?.max_score ?? scale.max_value));
    const [score, setScore] = useState(
        item?.score === null || item?.score === undefined ? '' : String(item.score),
    );
    const [dueDate, setDueDate] = useState(item?.due_date ?? '');
    // Held in the active scale's units, like every other grade on this page. Empty
    // inherits the course's minimum, which is the usual case.
    const [minimumGrade, setMinimumGrade] = useState(
        item?.minimum_grade === null || item?.minimum_grade === undefined
            ? ''
            : String(round2(percentToScalePoints(item.minimum_grade, scale))),
    );

    const applyCategory = (next: ItemCategory) => {
        setCategory(next);
        if (nameTouched) return;
        setName(suggestItemName(next, siblings));
    };

    /**
     * The denominators offered, sorted ascending: 10, 20 and 100 are the ones
     * that actually turn up, plus whatever the active scale caps at. The item's
     * current value is unioned in so an unusual saved denominator (say 50) is
     * still shown rather than silently snapping to something else on save.
     */
    const denominatorChoices = useMemo(() => {
        const candidates = [10, 20, scale.max_value, item?.max_score ?? 0, 100];
        const unique = Array.from(new Set(candidates.filter(value => Number.isFinite(value) && value > 0)));
        return unique.sort((a, b) => a - b);
    }, [scale.max_value, item?.max_score]);

    // What the group will add up to once this is saved, so the user can see the
    // shortfall before committing rather than after.
    const projected = useMemo(() => {
        const others = siblings.filter(sibling => sibling.id !== item?.id).map(s => ({ weight: s.weight }));
        const parsed = Number(weight);
        return checkWeights([...others, { weight: Number.isNaN(parsed) ? 0 : parsed }]);
    }, [siblings, weight, item?.id]);

    // Live read-out of the score as the user types, in both the input's own
    // units and the active scale's. This is what stops "18" being mistaken for 18%.
    const parsedMaxInput = Number(maxScore);
    const effectiveMax = parsedMaxInput > 0 ? parsedMaxInput : scale.max_value;
    const parsedScore = score.trim() === '' ? null : Number(score);
    const previewPercent =
        parsedScore === null || Number.isNaN(parsedScore)
            ? null
            : Math.min(100, Math.max(0, (parsedScore / effectiveMax) * 100));
    const previewPoints = previewPercent === null ? null : percentToScalePoints(previewPercent, scale);

    const parsedMinimum = Number(minimumGrade);
    const courseMinimum = effectiveMinimum(course, scale);
    const minimumHint =
        minimumGrade.trim() === '' || Number.isNaN(parsedMinimum)
            ? courseMinimum === null
                ? 'Empty means no minimum. This input is never failed.'
                : `Empty means ${course.name}'s minimum applies (${formatPoints(
                      percentToScalePoints(courseMinimum, scale),
                      scale,
                  )}).`
            : previewPercent === null
              ? `You need ${formatPoints(parsedMinimum, scale)} · ${pointsToPercent(
                    parsedMinimum,
                    scale,
                ).toFixed(1)}% to pass`
              : previewPercent >= pointsToPercent(parsedMinimum, scale)
                ? `Passes · needs ${formatPoints(parsedMinimum, scale)}`
                : `Short · needs ${formatPoints(parsedMinimum, scale)}, currently ${formatPoints(
                      previewPoints,
                      scale,
                  )}`;

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!name.trim()) return;

        const parsedMax = Number(maxScore);
        const parsedWeight = Number(weight);
        const trimmedScore = score.trim();
        const trimmedMinimum = minimumGrade.trim();

        onSubmit({
            id: item?.id,
            user_id: item?.user_id ?? '',
            course_id: course.id as string,
            parent_id: item?.parent_id ?? parent?.id ?? null,
            name: name.trim(),
            category,
            weight: parsedWeight > 0 ? parsedWeight : 0,
            max_score: parsedMax > 0 ? parsedMax : scale.max_value,
            score: trimmedScore === '' ? null : Number(trimmedScore),
            minimum_grade: trimmedMinimum === '' ? null : pointsToPercent(Number(trimmedMinimum), scale),
            due_date: dueDate || null,
        });
    };

    return (
        <div className="import-modal-overlay" onClick={() => { if (!busy) onClose(); }}>
            <div
                className="import-modal-card edit-modal-card"
                onClick={event => event.stopPropagation()}
            >
                <h3>{item ? 'Edit Input' : 'Add Input'}</h3>
                <p className="item-row__cat" style={{ display: 'inline-block', marginBottom: '0.75rem' }}>
                    {course.name}
                    {parent ? ` · under ${parent.name}` : ''}
                </p>

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="form-label">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={event => {
                            setName(event.target.value);
                            setNameTouched(true);
                        }}
                            className="form-control"
                            placeholder="e.g. Homework 3"
                            required
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="form-label">Type</label>
                            <select
                                value={category}
                                onChange={event => applyCategory(event.target.value as ItemCategory)}
                                className="form-select"
                            >
                                {ITEM_CATEGORIES.map(option => (
                                    <option key={option} value={option}>
                                        {CATEGORY_LABELS[option]}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="form-label">Weight (%)</label>
                            <input
                                type="number"
                                step="any"
                                min={0}
                                max={100}
                                value={weight}
                                onChange={event => setWeight(event.target.value)}
                                className="form-control"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="form-label">Score</label>
                            <input
                                type="number"
                                step="any"
                                min={0}
                                max={Number(maxScore) > 0 ? Number(maxScore) : undefined}
                                value={score}
                                onChange={event => setScore(event.target.value)}
                                className="form-control"
                                placeholder="Empty until graded"
                            />
                        </div>
                        <div>
                            <label className="form-label">Out of</label>
                            {/* A select rather than a free number, because the
                                denominator is a choice between a handful of
                                conventions (the scale's own, 100, 10) and a
                                typo there silently rescales every score. The
                                saved value is offered first even when it is not a
                                preset, so nothing can round-trip away. */}
                            <select
                                value={maxScore}
                                onChange={event => setMaxScore(event.target.value)}
                                className="form-select"
                            >
                                {denominatorChoices.map(value => (
                                    <option key={value} value={value}>
                                        /{value}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Spells out what the numbers above will mean, so 18 out of 20
                        is never misread as 18%. */}
                    <div className="academic-scale-preview">
                        <span>
                            Marked out of <strong>{effectiveMax}</strong>
                        </span>
                        <span className="item-score__sep">·</span>
                        <span>{previewPercent === null ? 'no score yet' : `${previewPercent.toFixed(1)}%`}</span>
                        <span className="item-score__sep">·</span>
                        <span>
                            reads as{' '}
                            <strong>
                                {previewPoints === null ? '—' : formatPoints(previewPoints, scale)}
                            </strong>{' '}
                            on the {scale.name} scale
                        </span>
                    </div>

                    <div className="mb-4">
                        <label className="form-label">
                            Minimum grade to pass <span className="form-label__optional">optional</span>
                        </label>
                        <div className="academic-year-field">
                            <input
                                type="number"
                                step="any"
                                min={scale.min_value}
                                max={scale.max_value}
                                value={minimumGrade}
                                onChange={event => setMinimumGrade(event.target.value)}
                                className="form-control"
                                placeholder={`Leave empty for ${course.name}'s minimum`}
                            />
                            <span className="academic-year-field__suffix">/ {scale.max_value}</span>
                        </div>
                        <span className="academic-field-hint">{minimumHint}</span>
                    </div>

                    <div className="mb-4">
                        <label className="form-label">Due date (optional)</label>
                        <input
                            type="date"
                            value={dueDate ?? ''}
                            onChange={event => setDueDate(event.target.value)}
                            className="form-control"
                        />
                    </div>

                    {/* Live check: reports the group total, never rewrites it. */}
                    <div className={`weight-badge ${projected.balanced ? 'weight-badge--ok' : projected.total === 0 ? 'weight-badge--empty' : 'weight-badge--off'}`}>
                        {projected.balanced
                            ? 'This group adds up to 100%'
                            : projected.total === 0
                              ? 'No weights set'
                              : `These will total ${projected.total}% (${projected.missing > 0 ? `${projected.missing} left` : `${Math.abs(projected.missing)} over`})`}
                    </div>

                    <div className="flex gap-2 justify-end mt-5">
                        <button type="button" className="btn-form-cancel" onClick={onClose} disabled={busy}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-form-submit" disabled={busy || !name.trim()}>
                            {busy ? 'Saving...' : item ? 'Update' : 'Add'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ItemEditorModal;
