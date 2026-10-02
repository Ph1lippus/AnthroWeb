import React, { useState } from 'react';
import { ChevronDown, Plus, SquarePen, Trash2, BookOpen } from 'lucide-react';
import CourseRow from './CourseRow';
import {
    computeGpa,
    formatGpa,
} from '../../utils/academicGpa';
import {
    hasCustomSemesterName,
    resolveSemesterName,
    semesterLabel,
} from '../../utils/semester';
import type {
    AcademicCourse,
    AcademicItem,
    GpaScale,
    ItemNode,
} from '../../utils/academicGpa';
import type { AcademicSemester } from '../../services/academicService';

interface SemesterContainerProps {
    semester: AcademicSemester;
    courses: AcademicCourse[];
    itemsByCourse: Map<string, ItemNode[]>;
    scale: GpaScale;
    defaultOpen?: boolean;
    onEdit: (semester: AcademicSemester) => void;
    onDelete: (semester: AcademicSemester) => void;
    onAddCourse: (semester: AcademicSemester) => void;
    onEditCourse: (course: AcademicCourse) => void;
    onDeleteCourse: (course: AcademicCourse) => void;
    onAddItem: (course: AcademicCourse, parent: AcademicItem | null) => void;
    onEditItem: (item: AcademicItem) => void;
    onDeleteItem: (item: AcademicItem) => void;
    onPatchCourse: (course: AcademicCourse, patch: Partial<AcademicCourse>) => void;
    onPatchItem: (item: AcademicItem, patch: Partial<AcademicItem>) => void;
    onAssignWeights: (assignments: { id: string; weight: number }[]) => void;
    weightsBusy?: boolean;
}

/** One semester: the container that holds every course for that term. */
const SemesterContainer: React.FC<SemesterContainerProps> = ({
    semester,
    courses,
    itemsByCourse,
    scale,
    defaultOpen = true,
    onEdit,
    onDelete,
    onAddCourse,
    onEditCourse,
    onDeleteCourse,
    onAddItem,
    onEditItem,
    onDeleteItem,
    onPatchCourse,
    onPatchItem,
    onAssignWeights,
    weightsBusy = false,
}) => {
    const [open, setOpen] = useState(defaultOpen);

    const semesterGpa = computeGpa(courses, scale);
    const totalCredits = courses.reduce((sum, course) => sum + (course.credits > 0 ? course.credits : 0), 0);

    // A semester the user never named is titled by its year and number, so
    // repeating that in the meta line underneath would just be noise.
    const customName = hasCustomSemesterName(semester.name);
    const title = resolveSemesterName(semester.name, semester.year, semester.semester);

    const meta = [
        ...(customName ? [semesterLabel(semester.year, semester.semester)] : []),
        `${courses.length} ${courses.length === 1 ? 'course' : 'courses'}`,
        ...(totalCredits > 0 ? [`${totalCredits} ECTS`] : []),
    ].join(' · ');

    return (
        <div className={`collapse-card${open ? ' collapse-card--open' : ''}`}>
            <button
                type="button"
                className="collapse-head"
                onClick={() => setOpen(current => !current)}
                aria-expanded={open}
            >
                <span className="collapse-head__text">
                    <span className="semester-title">{title}</span>
                    <span className="semester-meta">{meta}</span>
                </span>

                <span className="collapse-head__right">
                    {semesterGpa.gpa !== null && (
                        <span className="semester-gpa" title={`Semester GPA on the ${scale.name} scale`}>
                            {formatGpa(semesterGpa.gpa, scale)}
                        </span>
                    )}
                    {courses.length === 0 && <span className="semester-count">empty</span>}
                    <ChevronDown size={16} className="collapse-chevron" />
                </span>
            </button>

            {open && (
                <div className="collapse-body">
                    {courses.length === 0 ? (
                        <div className="academic-empty">
                            <BookOpen size={32} className="academic-empty__icon" />
                            <span className="academic-empty__title">No courses yet</span>
                            <span className="academic-empty__text">
                                Add a subject, then break it into tests and homework to get a running
                                prediction.
                            </span>
                        </div>
                    ) : (
                        courses.map(course => (
                            <CourseRow
                                key={course.id}
                                course={course}
                                tree={itemsByCourse.get(course.id ?? '') ?? []}
                                scale={scale}
                                onEdit={onEditCourse}
                                onDelete={onDeleteCourse}
                                onAddItem={parent => onAddItem(course, parent)}
                                onEditItem={onEditItem}
                                onDeleteItem={onDeleteItem}
                                onPatchCourse={onPatchCourse}
                                onPatchItem={onPatchItem}
                                onAssignWeights={onAssignWeights}
                                weightsBusy={weightsBusy}
                            />
                        ))
                    )}

                    <div className="course-actions">
                        <button type="button" className="btn-action" onClick={() => onAddCourse(semester)}>
                            <Plus size={13} /> Add course
                        </button>
                        <button type="button" className="book-action-btn" onClick={() => onEdit(semester)} title="Edit semester">
                            <SquarePen />
                        </button>
                        <button
                            type="button"
                            className="book-action-btn book-action-btn--danger"
                            onClick={() => onDelete(semester)}
                            title="Delete semester"
                        >
                            <Trash2 />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SemesterContainer;
