import React, { useState } from 'react';
import { formatPoints, percentToScalePoints, pointsToPercent, round2 } from '../../utils/academicGpa';
import type { AcademicCourse, GpaScale } from '../../utils/academicGpa';

interface CourseEditorModalProps {
    /** null creates a new course. */
    course: AcademicCourse | null;
    semesterId: string | null;
    scale: GpaScale;
    onClose: () => void;
    onSubmit: (course: AcademicCourse) => void;
    busy?: boolean;
}

const CourseEditorModal: React.FC<CourseEditorModalProps> = ({
    course,
    semesterId,
    scale,
    onClose,
    onSubmit,
    busy = false,
}) => {
    const [name, setName] = useState(course?.name ?? '');
    const [code, setCode] = useState(course?.code ?? '');
    const [credits, setCredits] = useState(String(course?.credits ?? 6));
    // Held in the active scale's units, not the stored percentage. The column
    // stays a percentage; the conversion happens on the way in and out.
    const [finalGrade, setFinalGrade] = useState(
        course?.final_grade === null || course?.final_grade === undefined
            ? ''
            : String(round2(percentToScalePoints(course.final_grade, scale))),
    );
    // Also held in the active scale's units, for the same reason as the final grade.
    // An empty box is meaningful: it hands the pass mark back to the scale rather
    // than storing a zero that would fail every course.
    const [minimumGrade, setMinimumGrade] = useState(
        course?.minimum_grade === null || course?.minimum_grade === undefined
            ? ''
            : String(round2(percentToScalePoints(course.minimum_grade, scale))),
    );
    const [notes, setNotes] = useState(course?.notes ?? '');

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!name.trim()) return;

        const parsedCredits = Number(credits);
        const trimmedFinal = finalGrade.trim();
        const trimmedMinimum = minimumGrade.trim();

        onSubmit({
            id: course?.id,
            user_id: course?.user_id ?? '',
            semester_id: course?.semester_id ?? semesterId ?? null,
            name: name.trim(),
            code: code.trim(),
            credits: parsedCredits > 0 ? parsedCredits : 6,
            final_grade: trimmedFinal === '' ? null : pointsToPercent(Number(trimmedFinal), scale),
            minimum_grade: trimmedMinimum === '' ? null : pointsToPercent(Number(trimmedMinimum), scale),
            notes: notes.trim(),
        });
    };

    const parsedMinimum = Number(minimumGrade);
    const scaleDefault =
        typeof scale.passing_grade === 'number' && !Number.isNaN(scale.passing_grade)
            ? formatPoints(percentToScalePoints(scale.passing_grade, scale), scale)
            : null;
    const minimumHint =
        minimumGrade.trim() === '' || Number.isNaN(parsedMinimum)
            ? scaleDefault
                ? `Empty means the ${scale.name} default applies (${scaleDefault}).`
                : 'Empty means no minimum. This subject is never failed.'
            : `You need ${formatPoints(parsedMinimum, scale)} · ${pointsToPercent(parsedMinimum, scale).toFixed(1)}% to pass`;

    const parsedFinal = Number(finalGrade);
    // `finalGrade` is already held in scale points, so it is formatted directly.
    // Converting it again would read 18 as 18% and report 3.60 / 20.
    const finalHint =
        finalGrade.trim() === '' || Number.isNaN(parsedFinal)
            ? `Left empty until the grade is out. Entered on the ${scale.name} scale.`
            : `Reads as ${formatPoints(parsedFinal, scale)} · ${pointsToPercent(parsedFinal, scale).toFixed(1)}%`;

    return (
        <div className="import-modal-overlay" onClick={() => { if (!busy) onClose(); }}>
            <div
                className="import-modal-card edit-modal-card"
                onClick={event => event.stopPropagation()}
            >
                <h3>{course ? 'Edit Course' : 'Add Course'}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="form-label">Subject</label>
                        <input
                            type="text"
                            value={name}
                            onChange={event => setName(event.target.value)}
                            className="form-control"
                            placeholder="e.g. Linear Algebra"
                            required
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="form-label">Code (optional)</label>
                            <input
                                type="text"
                                value={code}
                                onChange={event => setCode(event.target.value)}
                                className="form-control"
                                placeholder="e.g. MATH201"
                            />
                        </div>
                        <div>
                            <label className="form-label">Credits (ECTS)</label>
                            <input
                                type="number"
                                step="any"
                                min={0.1}
                                value={credits}
                                onChange={event => setCredits(event.target.value)}
                                className="form-control"
                                required
                            />
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="form-label">
                            Teacher's final grade <span className="form-label__optional">optional</span>
                        </label>
                        <div className="academic-year-field">
                            <input
                                type="number"
                                step="any"
                                min={scale.min_value}
                                max={scale.max_value}
                                value={finalGrade}
                                onChange={event => setFinalGrade(event.target.value)}
                                className="form-control"
                                placeholder="Leave empty until the grade is out"
                            />
                            <span className="academic-year-field__suffix">/ {scale.max_value}</span>
                        </div>
                        <span className="academic-field-hint">{finalHint}</span>
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
                                placeholder="Leave empty for the scale default"
                            />
                            <span className="academic-year-field__suffix">/ {scale.max_value}</span>
                        </div>
                        <span className="academic-field-hint">{minimumHint}</span>
                    </div>

                    <div className="mb-4">
                        <label className="form-label">Notes</label>
                        <textarea
                            value={notes}
                            onChange={event => setNotes(event.target.value)}
                            className="form-control"
                            rows={2}
                            placeholder="Anything worth remembering"
                        />
                    </div>

                    <div className="flex gap-2 justify-end mt-5">
                        <button type="button" className="btn-form-cancel" onClick={onClose} disabled={busy}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-form-submit" disabled={busy || !name.trim()}>
                            {busy ? 'Saving...' : course ? 'Update' : 'Add'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CourseEditorModal;
