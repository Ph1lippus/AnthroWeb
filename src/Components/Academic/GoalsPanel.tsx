import React, { useState } from 'react';
import { Plus, SquarePen, Trash2, Target } from 'lucide-react';
import ConfirmModal from '../ConfirmModal';
import LoadingSpinner from '../LoadingSpinner';
import { useAcademicGoals, useSaveGoal, useDeleteGoal } from '../../hooks/useAcademic';
import type { AcademicCourse, CoursePrediction, GpaScale } from '../../utils/academicGpa';
import { formatPoints, percentToScalePoints, pointsToPercent } from '../../utils/academicGpa';
import { resolveSemesterName } from '../../utils/semester';
import type { AcademicSemester, AcademicGoal } from '../../services/academicService';

interface GoalsPanelProps {
    courses: AcademicCourse[];
    semesters: AcademicSemester[];
    /** Live predictions keyed by course id, used to keep goals honest. */
    predictions: Map<string, CoursePrediction>;
    /** Active scale, so targets are entered and read in the same units as grades. */
    scale: GpaScale;
}

/**
 * Secondary tab: a target grade per subject. Where the subject exists in the
 * grading model, the running prediction is shown next to the target so the goal
 * reflects reality instead of a number typed once and forgotten. Targets are
 * stored as a percentage but entered/displayed in the active scale's units,
 * matching how course final grades behave.
 */
const GoalsPanel: React.FC<GoalsPanelProps> = ({ courses, semesters, predictions, scale }) => {
    const { data: goals, isLoading } = useAcademicGoals();
    const saveGoal = useSaveGoal();
    const deleteGoal = useDeleteGoal();

    const [editing, setEditing] = useState<AcademicGoal | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<AcademicGoal | null>(null);

    const [courseName, setCourseName] = useState('');
    const [semesterId, setSemesterId] = useState('');
    const [targetGrade, setTargetGrade] = useState('');
    const [currentGrade, setCurrentGrade] = useState('');

    const openCreate = () => {
        setEditing(null);
        setCourseName('');
        setSemesterId(semesters[0]?.id ?? '');
        setTargetGrade('');
        setCurrentGrade('');
        setShowForm(true);
    };

    const openEdit = (goal: AcademicGoal) => {
        setEditing(goal);
        setCourseName(goal.course_name);
        setSemesterId(goal.semester_id ?? '');
        setTargetGrade(String(percentToScalePoints(goal.target_grade, scale)));
        setCurrentGrade(
            goal.current_grade === null || goal.current_grade === undefined
                ? ''
                : String(percentToScalePoints(goal.current_grade, scale)),
        );
        setShowForm(true);
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        const target = Number(targetGrade);
        if (!courseName.trim() || Number.isNaN(target)) return;

        const trimmedCurrent = currentGrade.trim();
        saveGoal.mutate(
            {
                id: editing?.id,
                user_id: editing?.user_id ?? '',
                semester_id: semesterId || undefined,
                course_name: courseName.trim(),
                target_grade: pointsToPercent(target, scale),
                current_grade:
                    trimmedCurrent === ''
                        ? undefined
                        : pointsToPercent(Number(trimmedCurrent), scale),
            },
            { onSuccess: () => setShowForm(false) },
        );
    };

    // Match a goal to its course so the live prediction can be surfaced.
    const liveFor = (goal: AcademicGoal): number | null => {
        const match = courses.find(
            course => course.name.toLowerCase() === goal.course_name.toLowerCase(),
        );
        if (!match?.id) return null;
        return predictions.get(match.id)?.percent ?? null;
    };

    // A goal can outlive the semester it was filed under, so fall back rather
    // than printing an empty heading.
    const semesterNameFor = (goal: AcademicGoal): string => {
        const match = semesters.find(semester => semester.id === goal.semester_id);
        if (!match) return 'No semester';
        return resolveSemesterName(match.name, match.year, match.semester);
    };

    const renderForm = () => (
        <div className="import-modal-overlay" onClick={() => { if (!saveGoal.isPending) setShowForm(false); }}>
            <div className="import-modal-card" onClick={event => event.stopPropagation()}>
                <h3>{editing ? 'Edit Goal' : 'Add Goal'}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="form-label">Subject</label>
                        <input
                            type="text"
                            value={courseName}
                            onChange={event => setCourseName(event.target.value)}
                            className="form-control"
                            list="academic-course-names"
                            placeholder="e.g. Linear Algebra"
                            required
                            autoFocus
                        />
                        <datalist id="academic-course-names">
                            {courses.map(course => (
                                <option key={course.id} value={course.name} />
                            ))}
                        </datalist>
                    </div>

                    <div className="mb-4">
                        <label className="form-label">Semester</label>
                        <select
                            value={semesterId}
                            onChange={event => setSemesterId(event.target.value)}
                            className="form-select"
                        >
                            <option value="">None</option>
                            {semesters.map(semester => (
                                <option key={semester.id} value={semester.id ?? ''}>
                                    {resolveSemesterName(semester.name, semester.year, semester.semester)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="form-label">Target grade (out of {scale.max_value})</label>
                            <input
                                type="number"
                                step="any"
                                min={scale.min_value}
                                max={scale.max_value}
                                value={targetGrade}
                                onChange={event => setTargetGrade(event.target.value)}
                                className="form-control"
                                required
                            />
                            {targetGrade.trim() !== '' && !Number.isNaN(Number(targetGrade)) && (
                                <span className="academic-field-hint">
                                    = {pointsToPercent(Number(targetGrade), scale).toFixed(1)}%
                                </span>
                            )}
                        </div>
                        <div>
                            <label className="form-label">
                                Current grade <span className="form-label__optional">optional</span>
                            </label>
                            <input
                                type="number"
                                step="any"
                                min={scale.min_value}
                                max={scale.max_value}
                                value={currentGrade}
                                onChange={event => setCurrentGrade(event.target.value)}
                                className="form-control"
                                placeholder="Optional"
                            />
                            {currentGrade.trim() !== '' && !Number.isNaN(Number(currentGrade)) && (
                                <span className="academic-field-hint">
                                    = {pointsToPercent(Number(currentGrade), scale).toFixed(1)}%
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-2 justify-end mt-5">
                        <button type="button" className="btn-form-cancel" onClick={() => setShowForm(false)}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-form-submit"
                            disabled={saveGoal.isPending || !courseName.trim()}
                        >
                            {saveGoal.isPending ? 'Saving...' : editing ? 'Update' : 'Add'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );

    return (
        <>
            <div className="books-top-bar">
                <button type="button" className="btn-action" onClick={openCreate}>
                    <Plus size={13} /> Add goal
                </button>
            </div>

            <div className="academic-scroll">
                {isLoading ? (
                    <LoadingSpinner />
                ) : !goals || goals.length === 0 ? (
                    <div className="academic-empty">
                        <Target size={32} className="academic-empty__icon" />
                        <span className="academic-empty__title">No goals yet</span>
                        <span className="academic-empty__text">
                            Set a target grade per subject to track how close you are.
                        </span>
                    </div>
                ) : (
                    goals.map(goal => {
                        const live = liveFor(goal);
                        const current = live ?? goal.current_grade ?? null;
                        const target = goal.target_grade;
                        const reached = current !== null && current >= target;

                        return (
                            <div key={goal.id} className="course-row">
                                <div className="course-head">
                                    <div className="course-head__text">
                                        <span className="course-title">{goal.course_name}</span>
                                        <span className="course-sub">
                                            <span>
                                                {semesterNameFor(goal)}
                                            </span>
                                            <span>
                                                · {current === null
                                                    ? 'no grade yet'
                                                    : `current ${formatPoints(percentToScalePoints(current, scale), scale)}`}
                                            </span>
                                        </span>
                                    </div>

                                    <div className="course-scores">
                                        <div className="score-block score-block--predicted">
                                            <span className="academic-kicker">Target</span>
                                            <span className="score-block__value">
                                                {formatPoints(percentToScalePoints(target, scale), scale)}
                                            </span>
                                        </div>
                                        {live !== null && (
                                            <div className="score-block">
                                                <span className="academic-kicker">Live</span>
                                                <span className="score-block__value">
                                                    {formatPoints(percentToScalePoints(live, scale), scale)}
                                                </span>
                                            </div>
                                        )}
                                        <span className="flex gap-1">
                                            <button
                                                type="button"
                                                className="book-action-btn"
                                                onClick={() => openEdit(goal)}
                                                title="Edit goal"
                                            >
                                                <SquarePen />
                                            </button>
                                            <button
                                                type="button"
                                                className="book-action-btn book-action-btn--danger"
                                                onClick={() => setDeleteTarget(goal)}
                                                title="Delete goal"
                                            >
                                                <Trash2 />
                                            </button>
                                        </span>
                                    </div>
                                </div>

                                <div className="course-bar">
                                    <div
                                        className={`course-bar__fill${current === null ? ' course-bar__fill--muted' : ''}`}
                                        style={{ width: `${Math.min(100, current ?? 0)}%` }}
                                    />
                                </div>

                                {reached && (
                                    <div className="weight-badge weight-badge--ok" style={{ marginTop: '0.5rem' }}>
                                        Target reached
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {showForm && renderForm()}

            <ConfirmModal
                open={!!deleteTarget}
                title={`Delete goal for ${deleteTarget?.course_name ?? ''}?`}
                confirmLabel="Delete"
                danger
                busy={deleteGoal.isPending}
                onConfirm={() => {
                    if (deleteTarget?.id) deleteGoal.mutate(deleteTarget.id);
                    setDeleteTarget(null);
                }}
                onCancel={() => setDeleteTarget(null)}
            />
        </>
    );
};

export default GoalsPanel;
