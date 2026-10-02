import React, { useEffect, useMemo, useState } from 'react';
import { Plus, GraduationCap } from 'lucide-react';
import Title from '../Components/Title';
import ConfirmModal from '../Components/ConfirmModal';
import LoadingSpinner from '../Components/LoadingSpinner';
import AcademicStatsCards from '../Components/Academic/AcademicStatsCards';
import GpaScalePicker from '../Components/Academic/GpaScalePicker';
import SemesterContainer from '../Components/Academic/SemesterContainer';
import UpcomingPanel from '../Components/Academic/UpcomingPanel';
import SemesterEditorModal from '../Components/Academic/SemesterEditorModal';
import CourseEditorModal from '../Components/Academic/CourseEditorModal';
import ItemEditorModal from '../Components/Academic/ItemEditorModal';
import {
    buildItemTree,
    predictCoursePercent,
    SCALE_PRESETS,
} from '../utils/academicGpa';
import type {
    AcademicCourse,
    AcademicItem,
    CoursePrediction,
    GpaScale,
    ItemNode,
    RoundingMode,
} from '../utils/academicGpa';
import { resolveSemesterName } from '../utils/semester';
import type { AcademicSemester } from '../services/academicService';
import {
    useAcademicSemesters,
    useSaveSemester,
    useDeleteSemester,
    useAcademicCourses,
    useSaveCourse,
    useDeleteCourse,
    useAcademicItems,
    useSaveItem,
    useDeleteItem,
    useSetItemWeights,
    useGpaScales,
    useUpdateScale,
} from '../hooks/useAcademic';

const SCALE_STORAGE_KEY = 'academic:activeScaleId';

// Keeps the page renderable before the scales query resolves.
const FALLBACK_SCALE: GpaScale = {
    user_id: '',
    name: SCALE_PRESETS[0].name,
    basis: SCALE_PRESETS[0].basis,
    max_value: SCALE_PRESETS[0].max_value,
    min_value: SCALE_PRESETS[0].min_value,
    is_preset: true,
    sort_order: 0,
    rounding: SCALE_PRESETS[0].rounding,
    bands: SCALE_PRESETS[0].bands.map(band => ({
        min_percentage: band.min_percentage,
        points: band.points,
        letter: band.letter ?? null,
    })),
};

interface CourseFormState {
    course: AcademicCourse | null;
    semesterId: string | null;
}

interface ItemFormState {
    item: AcademicItem | null;
    course: AcademicCourse;
    parent: AcademicItem | null;
    siblings: AcademicItem[];
}

const AcademicPage: React.FC = () => {
    const [activeScaleId, setActiveScaleId] = useState<string | null>(
        () => window.localStorage.getItem(SCALE_STORAGE_KEY),
    );

    const [toast, setToast] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
    const [shownError, setShownError] = useState<string | null>(null);

    const [semesterForm, setSemesterForm] = useState<AcademicSemester | null>(null);
    const [showSemesterForm, setShowSemesterForm] = useState(false);
    const [courseForm, setCourseForm] = useState<CourseFormState | null>(null);
    const [itemForm, setItemForm] = useState<ItemFormState | null>(null);

    const [semesterDelete, setSemesterDelete] = useState<AcademicSemester | null>(null);
    const [courseDelete, setCourseDelete] = useState<AcademicCourse | null>(null);
    const [itemDelete, setItemDelete] = useState<AcademicItem | null>(null);

    // ==================== DATA ====================

    const semestersQuery = useAcademicSemesters();
    const coursesQuery = useAcademicCourses();
    const itemsQuery = useAcademicItems();
    const scalesQuery = useGpaScales();

    const saveSemester = useSaveSemester();
    const deleteSemester = useDeleteSemester();
    const saveCourse = useSaveCourse();
    const deleteCourse = useDeleteCourse();
    const saveItem = useSaveItem();
    const deleteItem = useDeleteItem();
    const setItemWeights = useSetItemWeights();
    const updateScale = useUpdateScale();

    const semesters = useMemo(() => semestersQuery.data ?? [], [semestersQuery.data]);
    const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);
    const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
    const scales = useMemo(() => scalesQuery.data ?? [], [scalesQuery.data]);

    const isLoading =
        semestersQuery.isLoading || coursesQuery.isLoading || itemsQuery.isLoading || scalesQuery.isLoading;

    // ==================== DERIVED ====================

    const scale = scales.find(s => s.id === activeScaleId) ?? scales[0] ?? FALLBACK_SCALE;

    // One tree per course, built once from the flat item list.
    const itemsByCourse = useMemo(() => {
        const grouped = new Map<string, ItemNode[]>();
        for (const course of courses) {
            const own = items.filter(item => item.course_id === course.id);
            grouped.set(course.id ?? '', buildItemTree(own));
        }
        return grouped;
    }, [courses, items]);

    const predictions = useMemo(() => {
        const map = new Map<string, CoursePrediction>();
        for (const course of courses) {
            map.set(course.id ?? '', predictCoursePercent(itemsByCourse.get(course.id ?? '') ?? []));
        }
        return map;
    }, [courses, itemsByCourse]);

    const coursesBySemester = useMemo(() => {
        const grouped = new Map<string, AcademicCourse[]>();
        for (const course of courses) {
            const key = course.semester_id ?? '';
            grouped.set(key, [...(grouped.get(key) ?? []), course]);
        }
        for (const list of grouped.values()) list.sort((a, b) => a.name.localeCompare(b.name));
        return grouped;
    }, [courses]);

    // ==================== EFFECTS ====================

    useEffect(() => {
        if (activeScaleId) window.localStorage.setItem(SCALE_STORAGE_KEY, activeScaleId);
    }, [activeScaleId]);

    const anyError =
        saveSemester.error ?? deleteSemester.error ?? saveCourse.error ?? deleteCourse.error ??
        saveItem.error ?? deleteItem.error ?? setItemWeights.error ?? updateScale.error ??
        semestersQuery.error ?? coursesQuery.error ?? itemsQuery.error ?? scalesQuery.error;

    const errorMessage = anyError ? (anyError as Error).message || 'Something went wrong' : null;

    // Surface a newly arrived failure. Raised during render rather than from an
    // effect so an error cannot appear and expire before it is ever read.
    if (errorMessage && errorMessage !== shownError) {
        setShownError(errorMessage);
        setToast({ type: 'error', message: errorMessage });
    }

    // Let the toast expire on its own.
    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(null), 3500);
        return () => clearTimeout(timer);
    }, [toast]);

    // ==================== HANDLERS ====================

    const openNewSemester = () => {
        setSemesterForm(null);
        setShowSemesterForm(true);
    };

    const openEditSemester = (semester: AcademicSemester) => {
        setSemesterForm(semester);
        setShowSemesterForm(true);
    };

    const openNewCourse = (semesterId: string | null) => {
        setCourseForm({ course: null, semesterId });
    };

    const openEditCourse = (course: AcademicCourse) => {
        setCourseForm({ course, semesterId: course.semester_id ?? null });
    };

    // The sibling set decides which 100% the weight check applies to.
    const openNewItem = (course: AcademicCourse, parent: AcademicItem | null) => {
        const siblings = items.filter(
            item => item.course_id === course.id && (item.parent_id ?? null) === (parent?.id ?? null),
        );
        setItemForm({ item: null, course, parent, siblings });
    };

    const openEditItem = (item: AcademicItem) => {
        const course = courses.find(c => c.id === item.course_id);
        if (!course) return;
        const siblings = items.filter(
            sibling => sibling.course_id === item.course_id && (sibling.parent_id ?? null) === (item.parent_id ?? null),
        );
        setItemForm({ item, course, parent: null, siblings });
    };

    const patchCourse = (course: AcademicCourse, patch: Partial<AcademicCourse>) => {
        if (!course.id) return;
        saveCourse.mutate({ ...course, ...patch });
    };

    const patchItem = (item: AcademicItem, patch: Partial<AcademicItem>) => {
        if (!item.id) return;
        saveItem.mutate({ ...item, ...patch });
    };

    // Rounding lives on the scale itself, so the choice follows the account
    // across devices instead of sitting in this browser's storage.
    const handleSetRounding = (mode: RoundingMode) => {
        if (!scale.id) return;
        updateScale.mutate({ id: scale.id, updates: { rounding: mode } });
    };

    // ==================== RENDER ====================

    return (
        <>
            <Title title="Academic" />

            <div className="books-page-wrapper">
                <div className="dashboard-section academic-section">
                    <div className="academic-card">
                        <div className="academic-body">
                            <aside className="academic-stats">
                                <AcademicStatsCards
                                    courses={courses}
                                    semesters={semesters}
                                    predictions={predictions}
                                    scale={scale}
                                />
                            </aside>

                            <section className="academic-grades">
                                <div className="books-top-bar">
                                    {/* Only "Add semester". "Add course" used to sit
                                        beside it, which meant two ways to reach the
                                        same thing -- the top bar for a course with no
                                        semester yet, and the row at the foot of the
                                        semester you were already looking at. The one
                                        inside the semester is the one you want. */}
                                    <div className="flex gap-2 flex-wrap">
                                        <button type="button" className="btn-action" onClick={openNewSemester}>
                                            <Plus size={13} /> Add semester
                                        </button>
                                    </div>

                                    <GpaScalePicker
                                        scales={scales}
                                        activeId={scale.id ?? null}
                                        onSelect={setActiveScaleId}
                                        onSetRounding={handleSetRounding}
                                        roundingBusy={updateScale.isPending}
                                    />
                                </div>

                                {isLoading ? (
                            <LoadingSpinner />
                                ) : semesters.length === 0 ? (
                                <div className="academic-empty">
                                    <GraduationCap size={32} className="academic-empty__icon" />
                                    <span className="academic-empty__title">No semesters yet</span>
                                    <span className="academic-empty__text">
                                        Add a semester, then a course, then break the course into tests and
                                        homework to watch the prediction build up.
                                    </span>
                                    <button
                                        type="button"
                                        className="btn-action"
                                        onClick={openNewSemester}
                                        style={{ marginTop: '0.5rem' }}
                                    >
                                        <Plus size={13} /> Add your first semester
                                    </button>
                                </div>
                            ) : (
                                <div className="academic-scroll">
                                    {semesters.map((semester, index) => (
                                        <SemesterContainer
                                            key={semester.id}
                                            semester={semester}
                                            courses={coursesBySemester.get(semester.id ?? '') ?? []}
                                            itemsByCourse={itemsByCourse}
                                            scale={scale}
                                            defaultOpen={index === 0}
                                            onEdit={openEditSemester}
                                            onDelete={setSemesterDelete}
                                            onAddCourse={target => openNewCourse(target.id ?? null)}
                                            onEditCourse={openEditCourse}
                                            onDeleteCourse={setCourseDelete}
                                            onAddItem={openNewItem}
                                            onEditItem={openEditItem}
                                            onDeleteItem={setItemDelete}
                                            onPatchCourse={patchCourse}
                                            onPatchItem={patchItem}
                                            onAssignWeights={assignments => setItemWeights.mutate(assignments)}
                                            weightsBusy={setItemWeights.isPending}
                                        />
                                    ))}
                                </div>
                                )
                                }
                            </section>

                            {/* Third rail. The component returns null when nothing is
                                due, and the grid column is sized to content, so a
                                quiet week gives the grading tree the space back
                                rather than leaving an empty box. */}
                            <UpcomingPanel courses={courses} items={items} />
                        </div>
                    </div>
                </div>
            </div>

            {/* ==================== MODALS ==================== */}

            {showSemesterForm && (
                <SemesterEditorModal
                    semester={semesterForm}
                    busy={saveSemester.isPending}
                    onClose={() => {
                        setShowSemesterForm(false);
                        setSemesterForm(null);
                    }}
                    onSubmit={semester =>
                        saveSemester.mutate(semester, {
                            onSuccess: () => {
                                setShowSemesterForm(false);
                                setSemesterForm(null);
                            },
                        })
                    }
                />
            )}

            {courseForm && (
                <CourseEditorModal
                    course={courseForm.course}
                    semesterId={courseForm.semesterId}
                    scale={scale}
                    busy={saveCourse.isPending}
                    onClose={() => setCourseForm(null)}
                    onSubmit={course =>
                        saveCourse.mutate({ ...course, semester_id: courseForm.semesterId ?? null }, {
                            onSuccess: () => setCourseForm(null),
                        })
                    }
                />
            )}

            {itemForm && (
                <ItemEditorModal
                    item={itemForm.item}
                    course={itemForm.course}
                    parent={itemForm.parent}
                    siblings={itemForm.siblings}
                    scale={scale}
                    busy={saveItem.isPending}
                    onClose={() => setItemForm(null)}
                    onSubmit={item => saveItem.mutate(item, { onSuccess: () => setItemForm(null) })}
                />
            )}

            {/* ==================== DELETE CONFIRMS ==================== */}

            {/* The dialog stays open until the delete actually succeeds. Clearing the
                target straight after mutate() closed it while the request was
                still in flight, so `busy` was never seen and a failed delete
                vanished without a trace. */}
            <ConfirmModal
                open={!!semesterDelete}
                title={`Delete ${semesterDelete ? resolveSemesterName(semesterDelete.name, semesterDelete.year, semesterDelete.semester) : ''} and every course in it?`}
                confirmLabel="Delete"
                danger
                busy={deleteSemester.isPending}
                onConfirm={() => {
                    const target = semesterDelete;
                    if (!target?.id) return;
                    deleteSemester.mutate(target.id, {
                        onSuccess: () => {
                            setSemesterDelete(null);
                            setToast({ type: 'success', message: `Deleted "${target.name || 'semester'}"` });
                        },
                    });
                }}
                onCancel={() => setSemesterDelete(null)}
            />

            <ConfirmModal
                open={!!courseDelete}
                title={`Delete ${courseDelete?.name ?? ''} and all of its inputs?`}
                confirmLabel="Delete"
                danger
                busy={deleteCourse.isPending}
                onConfirm={() => {
                    const target = courseDelete;
                    if (!target?.id) return;
                    deleteCourse.mutate(target.id, {
                        onSuccess: () => {
                            setCourseDelete(null);
                            setToast({ type: 'success', message: `Deleted "${target.name}"` });
                        },
                    });
                }}
                onCancel={() => setCourseDelete(null)}
            />

            <ConfirmModal
                open={!!itemDelete}
                title={`Delete "${itemDelete?.name ?? ''}"${itemDelete?.parent_id ? ' and its sub-works' : ''}?`}
                confirmLabel="Delete"
                danger
                busy={deleteItem.isPending}
                onConfirm={() => {
                    const target = itemDelete;
                    if (!target?.id) return;
                    deleteItem.mutate(target.id, {
                        onSuccess: () => {
                            setItemDelete(null);
                            setToast({ type: 'success', message: `Deleted "${target.name}"` });
                        },
                    });
                }}
                onCancel={() => setItemDelete(null)}
            />

            {toast && (
                <div className="toast-container">
                    <div className={`toast toast--${toast.type}`}>
                        <span className="toast-text">{toast.message}</span>
                    </div>
                </div>
            )}
        </>
    );
};

export default AcademicPage;
