import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    getUserAcademicSemesters,
    createAcademicSemester,
    updateAcademicSemester,
    deleteAcademicSemester,
    getUserAcademicGoals,
    createAcademicGoal,
    updateAcademicGoal,
    deleteAcademicGoal,
    getUserStudySessions,
    createStudySession,
    updateStudySession,
    deleteStudySession,
    getUserAcademicCourses,
    createAcademicCourse,
    updateAcademicCourse,
    deleteAcademicCourse,
    getUserAcademicItems,
    createAcademicItem,
    updateAcademicItem,
    deleteAcademicItem,
    setAcademicItemWeights,
    ensureDefaultGpaScales,
    createGpaScale,
    updateGpaScale,
    updateGpaScaleBands,
    deleteGpaScale,
} from '../services/academicService';
import type { AcademicCourse, AcademicItem, GpaScale, GpaBand } from '../utils/academicGpa';
import type { AcademicSemester, AcademicGoal, StudySession } from '../services/academicService';
import { queryKeys } from '../utils/queryKeys';

export const useAcademicSemesters = () =>
    useQuery({
        queryKey: queryKeys.academicSemesters,
        queryFn: getUserAcademicSemesters,
    });

export const useSaveSemester = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (semester: AcademicSemester) =>
            semester.id ? updateAcademicSemester(semester.id, semester) : createAcademicSemester(semester),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.academicSemesters });
            onDone?.();
        },
    });
};

export const useDeleteSemester = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteAcademicSemester(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.academicSemesters });
            qc.invalidateQueries({ queryKey: queryKeys.academicCourses });
            qc.invalidateQueries({ queryKey: queryKeys.academicItems });
            onDone?.();
        },
    });
};

// Courses and items are fetched whole rather than per parent: a student's entire
// academic history is small, and two round trips beat N queries per semester.
export const useAcademicCourses = () =>
    useQuery({
        queryKey: queryKeys.academicCourses,
        queryFn: getUserAcademicCourses,
    });

export const useAcademicItems = () =>
    useQuery({
        queryKey: queryKeys.academicItems,
        queryFn: getUserAcademicItems,
    });

// Seeds the preset scales on first visit, so a new account always has something
// to display. Idempotent, so it is safe on every load.
export const useGpaScales = () =>
    useQuery({
        queryKey: queryKeys.gpaScales,
        queryFn: ensureDefaultGpaScales,
    });

// Edits invalidate only what they can actually change: a course edit cannot alter
// a weighting, and an item edit cannot alter a course row. Inline weight and
// score fields fire a save per edit, so the narrower the blast radius, the fewer
// refetches the page makes. Deletes cascade in the database, so those widen it.
const useInvalidateCourses = () => {
    const qc = useQueryClient();
    return () => {
        qc.invalidateQueries({ queryKey: queryKeys.academicCourses });
        // Alerts name the course as well as the item.
        qc.invalidateQueries({ queryKey: queryKeys.academicAlerts });
    };
};

const useInvalidateItems = () => {
    const qc = useQueryClient();
    return () => {
        qc.invalidateQueries({ queryKey: queryKeys.academicItems });
        // The navbar's deadline banner is derived from items, so a due date or a
        // score change has to refresh it too or the warning goes stale.
        qc.invalidateQueries({ queryKey: queryKeys.academicAlerts });
    };
};

const useInvalidateCoursesAndItems = () => {
    const invalidateCourses = useInvalidateCourses();
    const invalidateItems = useInvalidateItems();
    return () => {
        invalidateCourses();
        invalidateItems();
    };
};

export const useSaveCourse = (onDone?: () => void) => {
    const invalidate = useInvalidateCourses();
    return useMutation({
        mutationFn: (course: AcademicCourse & { id?: string }) =>
            course.id ? updateAcademicCourse(course.id, course) : createAcademicCourse(course),
        onSuccess: () => {
            invalidate();
            onDone?.();
        },
    });
};

export const useDeleteCourse = (onDone?: () => void) => {
    const invalidate = useInvalidateCoursesAndItems();
    return useMutation({
        mutationFn: (id: string) => deleteAcademicCourse(id),
        onSuccess: () => {
            invalidate();
            onDone?.();
        },
    });
};

export const useSaveItem = (onDone?: () => void) => {
    const invalidate = useInvalidateItems();
    return useMutation({
        mutationFn: (item: AcademicItem & { id?: string }) =>
            item.id ? updateAcademicItem(item.id, item) : createAcademicItem(item),
        onSuccess: () => {
            invalidate();
            onDone?.();
        },
    });
};

export const useDeleteItem = (onDone?: () => void) => {
    const invalidate = useInvalidateItems();
    return useMutation({
        mutationFn: (id: string) => deleteAcademicItem(id),
        onSuccess: () => {
            invalidate();
            onDone?.();
        },
    });
};

/** Distribute / Normalise. Only ever runs from an explicit click. */
export const useSetItemWeights = (onDone?: () => void) => {
    const invalidate = useInvalidateItems();
    return useMutation({
        mutationFn: (assignments: { id: string; weight: number }[]) => setAcademicItemWeights(assignments),
        onSuccess: () => {
            invalidate();
            onDone?.();
        },
    });
};

export const useSaveScale = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (scale: Pick<GpaScale, 'name' | 'basis' | 'max_value' | 'min_value'> & { bands?: GpaBand[] }) =>
            createGpaScale(scale),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.gpaScales });
            onDone?.();
        },
    });
};

export const useUpdateScale = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: { id: string; updates: Partial<GpaScale> }) =>
            updateGpaScale(payload.id, payload.updates),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.gpaScales });
            onDone?.();
        },
    });
};

export const useSaveScaleBands = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: { scaleId: string; bands: GpaBand[] }) =>
            updateGpaScaleBands(payload.scaleId, payload.bands),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.gpaScales });
            onDone?.();
        },
    });
};

export const useDeleteScale = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteGpaScale(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.gpaScales });
            onDone?.();
        },
    });
};

// =============================================================================
// Goals and study sessions, kept as secondary tabs on the same page
// =============================================================================

export const useAcademicGoals = () =>
    useQuery({
        queryKey: queryKeys.academicGoals,
        queryFn: getUserAcademicGoals,
    });

export const useSaveGoal = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (goal: AcademicGoal) => (goal.id ? updateAcademicGoal(goal.id, goal) : createAcademicGoal(goal)),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.academicGoals });
            onDone?.();
        },
    });
};

export const useDeleteGoal = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteAcademicGoal(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.academicGoals });
            onDone?.();
        },
    });
};

export const useStudySessions = () =>
    useQuery({
        queryKey: queryKeys.studySessions,
        queryFn: getUserStudySessions,
    });

export const useSaveSession = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (session: StudySession) =>
            session.id ? updateStudySession(session.id, session) : createStudySession(session),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.studySessions });
            onDone?.();
        },
    });
};

export const useDeleteSession = (onDone?: () => void) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteStudySession(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.studySessions });
            onDone?.();
        },
    });
};
