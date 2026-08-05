import { supabase } from './supabaseClient';

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
            name: semester.name,
            year: semester.year,
            semester: semester.semester,
            start_date: semester.start_date,
            end_date: semester.end_date,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating academic semester:', error.message);
        throw error;
    }
    return data;
};

export const updateAcademicSemester = async (id: string, updates: Partial<AcademicSemester>) => {
    const { data, error } = await supabase
        .from('academic_semesters')
        .update(updates)
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
