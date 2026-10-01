import { supabase, getCurrentUserId } from './supabaseClient';
import { SCALE_PRESETS } from '../utils/academicGpa';
import { MIN_ACADEMIC_YEAR, MAX_ACADEMIC_YEAR, MAX_SEMESTER } from '../utils/semester';
import type { AcademicCourse, AcademicItem, GpaScale, GpaBand, ScalePreset } from '../utils/academicGpa';

export type { AcademicCourse, AcademicItem, GpaScale, GpaBand };

// Academic Semester types
export interface AcademicSemester {
    id?: string;
    user_id: string;
    name: string;
    year: number;
    semester: number;
    start_date?: string;
    end_date?: string;
    created_at?: string;
}

// Grading Scale types
export interface GradingScale {
    id?: string;
    user_id: string;
    name: string;
    max_score?: number;
    passing_score?: number;
    created_at?: string;
}

// Academic Grade types
export interface AcademicGrade {
    id?: string;
    user_id: string;
    semester_id?: string;
    grading_scale_id?: string;
    course_name: string;
    grade?: number;
    weight?: number;
    attendance_grade?: number;
    attendance_weight?: number;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

// Academic Goal types
export interface AcademicGoal {
    id?: string;
    user_id: string;
    semester_id?: string;
    course_name: string;
    target_grade: number;
    current_grade?: number;
    created_at?: string;
    updated_at?: string;
}

// Academic Assessment types
export interface AcademicAssessment {
    id?: string;
    user_id: string;
    course_name: string;
    semester_id?: string;
    name: string;
    grade?: number;
    weight: number;
    is_completed?: boolean;
    created_at?: string;
    updated_at?: string;
}

// Study Session types
export interface StudySession {
    id?: string;
    user_id: string;
    session_date: string;
    duration_minutes: number;
    session_type?: 'study' | 'break';
    notes?: string;
    created_at?: string;
}

// ==================== ACADEMIC SEMESTERS ====================

const clampAcademicYear = (year: number): number =>
    Math.min(MAX_ACADEMIC_YEAR, Math.max(MIN_ACADEMIC_YEAR, Math.round(Number(year) || MIN_ACADEMIC_YEAR)));

/**
 * Grades are stored as percentages, so anything written here has to be a real
 * percentage. Clamping beats letting Postgres reject the whole save, since a
 * value typed on a 20/20 scale can legitimately arrive as 20.
 */
const clampGradePercent = (value: number): number =>
    Math.min(100, Math.max(0, Math.round(Number(value) * 100) / 100));

const clampSemesterNumber = (semester: number): number => {
    const rounded = Math.round(Number(semester));
    if (!Number.isFinite(rounded) || rounded < 1) return 1;
    return Math.min(MAX_SEMESTER, rounded);
};

export const getUserAcademicSemesters = async (): Promise<AcademicSemester[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('academic_semesters')
        .select('*')
        .eq('user_id', user.id)
        .order('year', { ascending: false })
        .order('semester', { ascending: false });

    if (error) {
        console.error('Error fetching academic semesters:', error.message);
        return [];
    }

    return data as AcademicSemester[];
};

export const createAcademicSemester = async (semester: AcademicSemester) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('academic_semesters')
        .insert({
            user_id: user.id,
            // An empty name is stored deliberately: it marks the semester as
            // auto-named, so the label follows a later change of year or number
            // instead of going stale. See utils/semester.ts.
            name: (semester.name ?? '').trim(),
            year: clampAcademicYear(semester.year),
            semester: clampSemesterNumber(semester.semester),
            start_date: semester.start_date || null,
            end_date: semester.end_date || null,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating academic semester:', error.message);
        throw error;
    }
    return data;
};

// Only the columns a user is allowed to touch are forwarded, so a stray id or
// user_id in `updates` can never overwrite ownership.
export const updateAcademicSemester = async (id: string, updates: Partial<AcademicSemester>) => {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = (updates.name ?? '').trim();
    if (updates.year !== undefined) payload.year = clampAcademicYear(updates.year);
    if (updates.semester !== undefined) payload.semester = clampSemesterNumber(updates.semester);
    if (updates.start_date !== undefined) payload.start_date = updates.start_date || null;
    if (updates.end_date !== undefined) payload.end_date = updates.end_date || null;

    const { data, error } = await supabase
        .from('academic_semesters')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating academic semester:', error.message);
        throw error;
    }
    return data;
};

export const deleteAcademicSemester = async (id: string) => {
    const { error } = await supabase
        .from('academic_semesters')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting academic semester:', error.message);
        throw error;
    }
};

// ==================== GRADING SCALES ====================

export const getUserGradingScales = async (): Promise<GradingScale[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('grading_scales')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching grading scales:', error.message);
        return [];
    }

    return data as GradingScale[];
};

export const createGradingScale = async (scale: GradingScale) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('grading_scales')
        .insert({
            user_id: user.id,
            name: scale.name,
            max_score: scale.max_score,
            passing_score: scale.passing_score,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating grading scale:', error.message);
        throw error;
    }
    return data;
};

export const updateGradingScale = async (id: string, updates: Partial<GradingScale>) => {
    const { data, error } = await supabase
        .from('grading_scales')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating grading scale:', error.message);
        throw error;
    }
    return data;
};

export const deleteGradingScale = async (id: string) => {
    const { error } = await supabase
        .from('grading_scales')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting grading scale:', error.message);
        throw error;
    }
};

// ==================== ACADEMIC GRADES ====================

export const getUserAcademicGrades = async (): Promise<AcademicGrade[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('academic_grades')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching academic grades:', error.message);
        return [];
    }

    return data as AcademicGrade[];
};

export const createAcademicGrade = async (grade: AcademicGrade) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('academic_grades')
        .insert({
            user_id: user.id,
            semester_id: grade.semester_id,
            grading_scale_id: grade.grading_scale_id,
            course_name: grade.course_name,
            grade: grade.grade,
            weight: grade.weight,
            attendance_grade: grade.attendance_grade,
            attendance_weight: grade.attendance_weight,
            notes: grade.notes,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating academic grade:', error.message);
        throw error;
    }
    return data;
};

export const updateAcademicGrade = async (id: string, updates: Partial<AcademicGrade>) => {
    const { data, error } = await supabase
        .from('academic_grades')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating academic grade:', error.message);
        throw error;
    }
    return data;
};

export const deleteAcademicGrade = async (id: string) => {
    const { error } = await supabase
        .from('academic_grades')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting academic grade:', error.message);
        throw error;
    }
};

// ==================== ACADEMIC GOALS ====================

export const getUserAcademicGoals = async (): Promise<AcademicGoal[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('academic_goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching academic goals:', error.message);
        return [];
    }

    return data as AcademicGoal[];
};

export const createAcademicGoal = async (goal: AcademicGoal) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('academic_goals')
        .insert({
            user_id: user.id,
            semester_id: goal.semester_id,
            course_name: goal.course_name,
            target_grade: goal.target_grade,
            current_grade: goal.current_grade,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating academic goal:', error.message);
        throw error;
    }
    return data;
};

export const updateAcademicGoal = async (id: string, updates: Partial<AcademicGoal>) => {
    const { data, error } = await supabase
        .from('academic_goals')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating academic goal:', error.message);
        throw error;
    }
    return data;
};

export const deleteAcademicGoal = async (id: string) => {
    const { error } = await supabase
        .from('academic_goals')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting academic goal:', error.message);
        throw error;
    }
};

// ==================== ACADEMIC ASSESSMENTS ====================

export const getUserAcademicAssessments = async (): Promise<AcademicAssessment[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('academic_assessments')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching academic assessments:', error.message);
        return [];
    }

    return data as AcademicAssessment[];
};

export const createAcademicAssessment = async (assessment: AcademicAssessment) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('academic_assessments')
        .insert({
            user_id: user.id,
            course_name: assessment.course_name,
            semester_id: assessment.semester_id,
            name: assessment.name,
            grade: assessment.grade,
            weight: assessment.weight,
            is_completed: assessment.is_completed,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating academic assessment:', error.message);
        throw error;
    }
    return data;
};

export const updateAcademicAssessment = async (id: string, updates: Partial<AcademicAssessment>) => {
    const { data, error } = await supabase
        .from('academic_assessments')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating academic assessment:', error.message);
        throw error;
    }
    return data;
};

export const deleteAcademicAssessment = async (id: string) => {
    const { error } = await supabase
        .from('academic_assessments')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting academic assessment:', error.message);
        throw error;
    }
};

export const toggleAssessmentComplete = async (id: string, isCompleted: boolean) => {
    return updateAcademicAssessment(id, { is_completed: isCompleted });
};

// ==================== STUDY SESSIONS ====================

export const getUserStudySessions = async (): Promise<StudySession[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('study_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('session_date', { ascending: false });

    if (error) {
        console.error('Error fetching study sessions:', error.message);
        return [];
    }

    return data as StudySession[];
};

export const createStudySession = async (session: StudySession) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('study_sessions')
        .insert({
            user_id: user.id,
            session_date: session.session_date,
            duration_minutes: session.duration_minutes,
            session_type: session.session_type || 'study',
            notes: session.notes,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating study session:', error.message);
        throw error;
    }
    return data;
};

export const updateStudySession = async (id: string, updates: Partial<StudySession>) => {
    const { data, error } = await supabase
        .from('study_sessions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating study session:', error.message);
        throw error;
    }
    return data;
};

export const deleteStudySession = async (id: string) => {
    const { error } = await supabase
        .from('study_sessions')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting study session:', error.message);
        throw error;
    }
};

// Export functions for CSV
export const exportAcademicGradesToCSV = (grades: AcademicGrade[]): string => {
    const headers = ['course_name', 'grade', 'weight', 'attendance_grade', 'attendance_weight', 'notes'];
    const escapeCsvField = (field: string | number | undefined): string => {
        if (field === undefined || field === null) return '';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };
    const rows = grades.map(grade => [
        escapeCsvField(grade.course_name),
        escapeCsvField(grade.grade),
        escapeCsvField(grade.weight),
        escapeCsvField(grade.attendance_grade),
        escapeCsvField(grade.attendance_weight),
        escapeCsvField(grade.notes)
    ].join(','));
    
    return [headers.join(','), ...rows].join('\n');
};

export const importAcademicGradesFromCSV = async (csvContent: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const lines = csvContent.trim().split('\n');
    const gradesToCreate: Partial<AcademicGrade>[] = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const parts = parseCsvLine(lines[i]);
        
        const course_name = parts[0] || '';
        const grade = parts[1] ? parseFloat(parts[1]) : undefined;
        const weight = parts[2] ? parseFloat(parts[2]) : 1.0;
        const attendance_grade = parts[3] ? parseFloat(parts[3]) : undefined;
        const attendance_weight = parts[4] ? parseFloat(parts[4]) : 0.0;
        const notes = parts[5] || undefined;
        
        if (course_name && course_name.trim()) {
            gradesToCreate.push({
                user_id: user.id,
                course_name: course_name.trim(),
                grade,
                weight,
                attendance_grade,
                attendance_weight,
                notes: notes || undefined,
            });
        }
    }

    if (gradesToCreate.length === 0) return [];

    const { data, error } = await supabase
        .from('academic_grades')
        .insert(gradesToCreate)
        .select();

    if (error) {
        console.error('Error importing academic grades:', error.message);
        throw error;
    }
    return data;
};

const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    
    return result;
};

// =============================================================================
// COURSES - a subject inside a semester, carrying credits and the final grade
// =============================================================================

export const getUserAcademicCourses = async (): Promise<AcademicCourse[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('academic_courses')
        .select('*')
        .eq('user_id', userId)
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching academic courses:', error.message);
        return [];
    }

    return (data ?? []) as AcademicCourse[];
};

export const createAcademicCourse = async (course: AcademicCourse): Promise<AcademicCourse> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user found');

    const { data, error } = await supabase
        .from('academic_courses')
        .insert({
            user_id: userId,
            semester_id: course.semester_id ?? null,
            name: course.name.trim(),
            code: course.code?.trim() || null,
            credits: course.credits > 0 ? course.credits : 6,
            final_grade: course.final_grade ?? null,
            // Null means "no minimum recorded". Coalescing to 0 here would fail
            // every course the moment one was saved without the field filled in.
            minimum_grade:
                typeof course.minimum_grade === 'number' && !Number.isNaN(course.minimum_grade)
                    ? clampGradePercent(course.minimum_grade)
                    : null,
            notes: course.notes ?? null,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating academic course:', error.message);
        throw error;
    }
    return data as AcademicCourse;
};

// Only the columns a user is allowed to touch are forwarded, so a stray id or
// user_id in `updates` can never overwrite ownership.
export const updateAcademicCourse = async (
    id: string,
    updates: Partial<AcademicCourse>,
): Promise<AcademicCourse> => {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.code !== undefined) payload.code = updates.code?.trim() || null;
    if (updates.credits !== undefined) payload.credits = updates.credits > 0 ? updates.credits : 6;
    if (updates.final_grade !== undefined) payload.final_grade = updates.final_grade;
    if (updates.minimum_grade !== undefined) {
        // Explicit null clears the course minimum and hands the decision back to
        // the scale, which is different from storing a zero.
        payload.minimum_grade =
            updates.minimum_grade === null || updates.minimum_grade === undefined
                ? null
                : clampGradePercent(updates.minimum_grade);
    }
    if (updates.notes !== undefined) payload.notes = updates.notes;
    if (updates.semester_id !== undefined) payload.semester_id = updates.semester_id;

    const { data, error } = await supabase
        .from('academic_courses')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating academic course:', error.message);
        throw error;
    }
    return data as AcademicCourse;
};

export const deleteAcademicCourse = async (id: string) => {
    const { error } = await supabase.from('academic_courses').delete().eq('id', id);

    if (error) {
        console.error('Error deleting academic course:', error.message);
        throw error;
    }
};

// =============================================================================
// ITEMS - the graded inputs, nested through parent_id
// =============================================================================

export const getUserAcademicItems = async (): Promise<AcademicItem[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('academic_items')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching academic items:', error.message);
        return [];
    }

    return (data ?? []) as AcademicItem[];
};

export const createAcademicItem = async (item: AcademicItem): Promise<AcademicItem> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user found');

    const { data, error } = await supabase
        .from('academic_items')
        .insert({
            user_id: userId,
            course_id: item.course_id,
            parent_id: item.parent_id ?? null,
            name: item.name.trim(),
            category: item.category || 'homework',
            weight: item.weight > 0 ? item.weight : 0,
            max_score: item.max_score > 0 ? item.max_score : 100,
            score: item.score ?? null,
            // Null means "inherit the course minimum", which is different from
            // storing zero and would fail every item.
            minimum_grade:
                typeof item.minimum_grade === 'number' && !Number.isNaN(item.minimum_grade)
                    ? clampGradePercent(item.minimum_grade)
                    : null,
            due_date: item.due_date || null,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating academic item:', error.message);
        throw error;
    }
    return data as AcademicItem;
};

export const updateAcademicItem = async (
    id: string,
    updates: Partial<AcademicItem>,
): Promise<AcademicItem> => {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.weight !== undefined) payload.weight = updates.weight > 0 ? updates.weight : 0;
    if (updates.max_score !== undefined) payload.max_score = updates.max_score > 0 ? updates.max_score : 100;
    if (updates.score !== undefined) payload.score = updates.score;
    if (updates.minimum_grade !== undefined) {
        // Explicit null hands the item back to the course's minimum.
        payload.minimum_grade =
            updates.minimum_grade === null ? null : clampGradePercent(updates.minimum_grade);
    }
    if (updates.due_date !== undefined) payload.due_date = updates.due_date || null;
    if (updates.parent_id !== undefined) payload.parent_id = updates.parent_id;

    const { data, error } = await supabase
        .from('academic_items')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating academic item:', error.message);
        throw error;
    }
    return data as AcademicItem;
};

/** Removes the item and, by way of the self-referencing ON DELETE CASCADE, its whole subtree. */
export const deleteAcademicItem = async (id: string) => {
    const { error } = await supabase.from('academic_items').delete().eq('id', id);

    if (error) {
        console.error('Error deleting academic item:', error.message);
        throw error;
    }
};

/** Applies a set of weights to sibling items in one pass, used by Distribute / Normalise. */
export const setAcademicItemWeights = async (
    assignments: { id: string; weight: number }[],
): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId || assignments.length === 0) return;

    for (const { id, weight } of assignments) {
        const { error } = await supabase
            .from('academic_items')
            .update({ weight, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', userId);

        if (error) {
            console.error('Error updating academic item weight:', error.message);
            throw error;
        }
    }
};

// =============================================================================
// GPA SCALES - one set of percentages, readable as 20/20, 4.0, 5.0 or 100/100
// =============================================================================

export const getUserGpaScales = async (): Promise<GpaScale[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('gpa_scales')
        .select('*')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching gpa scales:', error.message);
        return [];
    }

    const scales = (data ?? []) as Omit<GpaScale, 'bands'>[];
    if (scales.length === 0) return [];

    const normalize = (scale: Omit<GpaScale, 'bands'>): GpaScale => ({
        ...scale,
        rounding: scale.rounding ?? 'nearest',
        // Absent on rows written before the column existed, and null is
        // meaningful ("no minimum"), so only an undefined is defaulted.
        passing_grade: scale.passing_grade ?? null,
        bands: [],
    });

    const { data: bandData, error: bandError } = await supabase
        .from('gpa_scale_bands')
        .select('*')
        .in('scale_id', scales.map(scale => scale.id));

    if (bandError) {
        console.error('Error fetching gpa scale bands:', bandError.message);
        return scales.map(normalize);
    }

    const bands = (bandData ?? []) as GpaBand[];
    return scales.map(scale => ({
        ...normalize(scale),
        bands: bands
            .filter(band => band.scale_id === scale.id)
            .sort((a, b) => b.min_percentage - a.min_percentage),
    }));
};

const insertScaleWithBands = async (userId: string, scale: {
    name: string;
    basis: 'percentage' | 'points';
    max_value: number;
    min_value: number;
    is_preset: boolean;
    sort_order: number;
    rounding: GpaScale['rounding'];
    passing_grade?: number | null;
    bands: { min_percentage: number; points: number; letter?: string | null }[];
}): Promise<GpaScale> => {
    const { data: scaleRow, error: scaleError } = await supabase
        .from('gpa_scales')
        .insert({
            user_id: userId,
            name: scale.name,
            basis: scale.basis,
            max_value: scale.max_value,
            min_value: scale.min_value,
            is_preset: scale.is_preset,
            sort_order: scale.sort_order,
            rounding: scale.rounding,
            passing_grade: scale.passing_grade ?? null,
        })
        .select()
        .single();

    if (scaleError) throw scaleError;

    if (scale.bands.length > 0) {
        const { error: bandError } = await supabase.from('gpa_scale_bands').insert(
            scale.bands.map(band => ({
                scale_id: scaleRow.id,
                min_percentage: band.min_percentage,
                points: band.points,
                letter: band.letter ?? null,
            })),
        );
        if (bandError) throw bandError;
    }

    return {
        ...(scaleRow as Omit<GpaScale, 'bands'>),
        bands: scale.bands.map(band => ({ min_percentage: band.min_percentage, points: band.points, letter: band.letter ?? null })),
    };
};

export const createGpaScale = async (
    scale: Pick<GpaScale, 'name' | 'basis' | 'max_value' | 'min_value'> & {
        rounding?: GpaScale['rounding'];
        bands?: GpaBand[];
    },
): Promise<GpaScale> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user found');

    return insertScaleWithBands(userId, {
        name: scale.name.trim(),
        basis: scale.basis,
        max_value: scale.max_value > 0 ? scale.max_value : 4,
        min_value: scale.min_value ?? 0,
        is_preset: false,
        sort_order: SCALE_PRESETS.length,
        rounding: scale.rounding ?? 'nearest',
        bands: scale.bands ?? [],
    });
};

export const updateGpaScale = async (id: string, updates: Partial<GpaScale>) => {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.basis !== undefined) payload.basis = updates.basis;
    if (updates.max_value !== undefined) payload.max_value = updates.max_value;
    if (updates.min_value !== undefined) payload.min_value = updates.min_value;
    if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order;
    if (updates.rounding !== undefined) payload.rounding = updates.rounding;
    if (updates.passing_grade !== undefined) {
        payload.passing_grade =
            updates.passing_grade === null ? null : clampGradePercent(updates.passing_grade);
    }

    const { data, error } = await supabase.from('gpa_scales').update(payload).eq('id', id).select().single();

    if (error) {
        console.error('Error updating gpa scale:', error.message);
        throw error;
    }
    return data;
};

/** Replaces the whole band list for a scale, which is how the band editor saves. */
export const updateGpaScaleBands = async (scaleId: string, bands: GpaBand[]) => {
    const { error: deleteError } = await supabase
        .from('gpa_scale_bands')
        .delete()
        .eq('scale_id', scaleId);

    if (deleteError) {
        console.error('Error clearing gpa scale bands:', deleteError.message);
        throw deleteError;
    }

    if (bands.length === 0) return;

    const { error } = await supabase.from('gpa_scale_bands').insert(
        bands.map(band => ({
            scale_id: scaleId,
            min_percentage: band.min_percentage,
            points: band.points,
            letter: band.letter ?? null,
        })),
    );

    if (error) {
        console.error('Error saving gpa scale bands:', error.message);
        throw error;
    }
};

export const deleteGpaScale = async (id: string) => {
    const { error } = await supabase.from('gpa_scales').delete().eq('id', id);

    if (error) {
        console.error('Error deleting gpa scale:', error.message);
        throw error;
    }
};

const bandsMatch = (
    existing: GpaBand[],
    preset: { min_percentage: number; points: number }[],
): boolean => {
    if (existing.length !== preset.length) return false;
    const a = [...existing].sort((x, y) => x.min_percentage - y.min_percentage);
    const b = [...preset].sort((x, y) => x.min_percentage - y.min_percentage);
    return a.every((band, index) =>
        Math.abs(band.min_percentage - b[index].min_percentage) < 1e-9 &&
        Math.abs(band.points - b[index].points) < 1e-9,
    );
};

/**
 * Bring preset rows back in line with the current SCALE_PRESETS definition.
 *
 * This is what repairs an account seeded before rounding existed: the old 20/20
 * carried floor bands (75% → 15) and no rounding column, so a fair 77.5% read as
 * 15 instead of 16. Only rows flagged is_preset are touched, matched by name, so
 * a user's own scales are never modified.
 */
const reconcilePresetScales = async (userId: string, scales: GpaScale[]): Promise<GpaScale[]> => {
    let changed = false;

    for (const preset of SCALE_PRESETS) {
        const row = scales.find(scale => scale.is_preset && scale.name === preset.name);
        if (!row?.id) continue;

        if (row.rounding !== preset.rounding) {
            changed = true;
            const { error } = await supabase
                .from('gpa_scales')
                .update({ rounding: preset.rounding, updated_at: new Date().toISOString() })
                .eq('id', row.id)
                .eq('user_id', userId);
            if (error) console.error('Error healing gpa scale rounding:', error.message);
        }

        if (!bandsMatch(row.bands ?? [], preset.bands)) {
            changed = true;
            try {
                await updateGpaScaleBands(
                    row.id,
                    preset.bands.map(band => ({
                        scale_id: row.id,
                        min_percentage: band.min_percentage,
                        points: band.points,
                        letter: band.letter ?? null,
                    })),
                );
            } catch (error) {
                console.error('Error healing gpa scale bands:', error);
            }
        }
    }

    return changed ? getUserGpaScales() : scales;
};

/**
 * Seeds the preset scales the first time a user opens the page and keeps them
 * current on every later load. Idempotent by design: seeding only happens when
 * the account has no scales at all, and reconciliation only ever touches rows
 * flagged is_preset, so a user's own scales are never at risk.
 */
export const ensureDefaultGpaScales = async (): Promise<GpaScale[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    let existing = await getUserGpaScales();

    if (existing.length === 0) {
        const presets: ScalePreset[] = SCALE_PRESETS;
        const createdIds: string[] = [];

        for (let index = 0; index < presets.length; index++) {
            const preset = presets[index];
            try {
                const scale = await insertScaleWithBands(userId, { ...preset, is_preset: true, sort_order: index });
                if (scale.id) createdIds.push(scale.id);
            } catch (error) {
                console.error('Error seeding gpa scale preset:', error);
            }
        }

        // Seeding is all or nothing. A half-seeded account would count as
        // "already configured" on every later load, so the missing presets would
        // never come back. Undo this run instead and let the next attempt start clean.
        if (createdIds.length !== presets.length) {
            await Promise.all(createdIds.map(id => supabase.from('gpa_scales').delete().eq('id', id)));
        }

        // Read the rows back rather than trusting the locally assembled objects,
        // so the returned bands are exactly what is stored.
        existing = await getUserGpaScales();
    }

    return reconcilePresetScales(userId, existing);
};

