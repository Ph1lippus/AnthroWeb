import { supabase } from './supabaseClient';

export interface WorkoutTemplate {
    id?: string;
    user_id: string;
    name: string;
    description?: string;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface WorkoutTemplateDay {
    id?: string;
    workout_template_id: string;
    user_id: string;
    day_of_week: number; // 0-6 (Sunday-Saturday)
    exercise_name: string;
    target_sets?: number;
    target_reps?: number;
    target_weight?: number;
    notes?: string;
    created_at?: string;
}

export interface WorkoutCompletionLog {
    id?: string;
    user_id?: string;
    workout_date: string;
    workout_template_id?: string;
    day_of_week?: number;
    completed: boolean;
    intensity?: number; // 1-10
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

export interface WorkoutExerciseLog {
    id?: string;
    workout_completion_id: string;
    user_id?: string;
    exercise_name: string;
    sets?: number;
    reps?: number;
    weight?: number;
    created_at?: string;
}

export interface PRHistory {
    id?: string;
    user_id?: string;
    exercise_name: string;
    weight?: number;
    reps?: number;
    workout_date: string;
    workout_completion_id?: string;
    created_at?: string;
}

// Fetch all workout templates for current user
export const getWorkoutTemplates = async (): Promise<WorkoutTemplate[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('workout_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching workout templates:', error.message);
        return [];
    }

    return data as WorkoutTemplate[];
};

// Fetch workout template days for a specific template
export const getWorkoutTemplateDays = async (templateId: string): Promise<WorkoutTemplateDay[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('workout_template_days')
        .select('*')
        .eq('workout_template_id', templateId)
        .eq('user_id', user.id)
        .order('day_of_week', { ascending: true });

    if (error) {
        console.error('Error fetching workout template days:', error.message);
        return [];
    }

    return data as WorkoutTemplateDay[];
};

// Fetch workout template days for a specific day of the week
export const getWorkoutTemplateDaysByDay = async (dayOfWeek: number): Promise<WorkoutTemplateDay[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('workout_template_days')
        .select('*')
        .eq('user_id', user.id)
        .eq('day_of_week', dayOfWeek)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching workout template days for day:', error.message);
        return [];
    }

    return data as WorkoutTemplateDay[];
};

// Create a new workout template
export const createWorkoutTemplate = async (template: { name: string; description?: string; is_active?: boolean }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('workout_templates')
        .insert({
            user_id: user.id,
            name: template.name,
            description: template.description,
            is_active: template.is_active || false,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating workout template:', error.message);
        throw error;
    }
    return data;
};

// Update a workout template
export const updateWorkoutTemplate = async (id: string, updates: Partial<WorkoutTemplate>) => {
    const { data, error } = await supabase
        .from('workout_templates')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating workout template:', error.message);
        throw error;
    }
    return data;
};

// Delete a workout template
export const deleteWorkoutTemplate = async (id: string) => {
    const { error } = await supabase
        .from('workout_templates')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting workout template:', error.message);
        throw error;
    }
};

// Create workout template day (exercise)
export const createWorkoutTemplateDay = async (day: WorkoutTemplateDay) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('workout_template_days')
        .insert({
            user_id: user.id,
            workout_template_id: day.workout_template_id,
            day_of_week: day.day_of_week,
            exercise_name: day.exercise_name,
            target_sets: day.target_sets,
            target_reps: day.target_reps,
            target_weight: day.target_weight,
            notes: day.notes,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating workout template day:', error.message);
        throw error;
    }
    return data;
};

// Update workout template day
export const updateWorkoutTemplateDay = async (id: string, updates: Partial<WorkoutTemplateDay>) => {
    const { data, error } = await supabase
        .from('workout_template_days')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating workout template day:', error.message);
        throw error;
    }
    return data;
};

// Delete workout template day
export const deleteWorkoutTemplateDay = async (id: string) => {
    const { error } = await supabase
        .from('workout_template_days')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting workout template day:', error.message);
        throw error;
    }
};

// Get workout completion log for a specific date
export const getWorkoutCompletionLog = async (date: string): Promise<WorkoutCompletionLog | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('workout_completion_log')
        .select('*')
        .eq('user_id', user.id)
        .eq('workout_date', date)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // No rows returned
        console.error('Error fetching workout completion log:', error.message);
        return null;
    }

    return data as WorkoutCompletionLog;
};

// Create workout completion log
export const createWorkoutCompletionLog = async (log: Omit<WorkoutCompletionLog, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('workout_completion_log')
        .insert({
            user_id: user.id,
            workout_date: log.workout_date,
            workout_template_id: log.workout_template_id,
            day_of_week: log.day_of_week,
            completed: log.completed,
            intensity: log.intensity,
            notes: log.notes,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating workout completion log:', error.message);
        throw error;
    }
    return data;
};

// Update workout completion log
export const updateWorkoutCompletionLog = async (id: string, updates: Partial<WorkoutCompletionLog>) => {
    const { data, error } = await supabase
        .from('workout_completion_log')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating workout completion log:', error.message);
        throw error;
    }
    return data;
};

// Get workout exercise logs for a completion log
export const getWorkoutExerciseLogs = async (completionId: string): Promise<WorkoutExerciseLog[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('workout_exercises_log')
        .select('*')
        .eq('workout_completion_id', completionId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching workout exercise logs:', error.message);
        return [];
    }

    return data as WorkoutExerciseLog[];
};

// Create workout exercise log
export const createWorkoutExerciseLog = async (log: Omit<WorkoutExerciseLog, 'id' | 'user_id' | 'created_at'>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('workout_exercises_log')
        .insert({
            user_id: user.id,
            workout_completion_id: log.workout_completion_id,
            exercise_name: log.exercise_name,
            sets: log.sets,
            reps: log.reps,
            weight: log.weight,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating workout exercise log:', error.message);
        throw error;
    }
    return data;
};

// Update workout exercise log
export const updateWorkoutExerciseLog = async (id: string, updates: Partial<WorkoutExerciseLog>) => {
    const { data, error } = await supabase
        .from('workout_exercises_log')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating workout exercise log:', error.message);
        throw error;
    }
    return data;
};

// Delete workout exercise log
export const deleteWorkoutExerciseLog = async (id: string) => {
    const { error } = await supabase
        .from('workout_exercises_log')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting workout exercise log:', error.message);
        throw error;
    }
};

// Get PR history for an exercise
export const getPRHistory = async (exerciseName: string): Promise<PRHistory[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('pr_history')
        .select('*')
        .eq('user_id', user.id)
        .eq('exercise_name', exerciseName)
        .order('workout_date', { ascending: false });

    if (error) {
        console.error('Error fetching PR history:', error.message);
        return [];
    }

    return data as PRHistory[];
};

// Create PR record
export const createPR = async (pr: Omit<PRHistory, 'id' | 'user_id' | 'created_at'>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('pr_history')
        .insert({
            user_id: user.id,
            exercise_name: pr.exercise_name,
            weight: pr.weight,
            reps: pr.reps,
            workout_date: pr.workout_date,
            workout_completion_id: pr.workout_completion_id,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating PR:', error.message);
        throw error;
    }
    return data;
};

// Get today's workout exercises based on day of week
export const getTodayWorkoutExercises = async (): Promise<WorkoutTemplateDay[]> => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0-6 (Sunday-Saturday)
    return getWorkoutTemplateDaysByDay(dayOfWeek);
};

// Check if workout is completed for a date
export const isWorkoutCompleted = async (date: string): Promise<boolean> => {
    const log = await getWorkoutCompletionLog(date);
    return log?.completed || false;
};

// Complete workout for a date
export const completeWorkout = async (date: string, _completionId: string, intensity?: number, notes?: string) => {
    const log = await getWorkoutCompletionLog(date);
    
    if (log) {
        return updateWorkoutCompletionLog(log.id!, { completed: true, intensity, notes });
    } else {
        return createWorkoutCompletionLog({
            workout_date: date,
            completed: true,
            intensity,
            notes,
        });
    }
};

// Get workout history for a user
export const getWorkoutHistory = async (limit: number = 30): Promise<WorkoutCompletionLog[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('workout_completion_log')
        .select('*')
        .eq('user_id', user.id)
        .order('workout_date', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching workout history:', error.message);
        return [];
    }

    return data as WorkoutCompletionLog[];
};

// Get all PRs for a user
export const getAllPRs = async (): Promise<PRHistory[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('pr_history')
        .select('*')
        .eq('user_id', user.id)
        .order('workout_date', { ascending: false });

    if (error) {
        console.error('Error fetching all PRs:', error.message);
        return [];
    }

    return data as PRHistory[];
};

// Get workout stats for a date range
export const getWorkoutStats = async (startDate: string, endDate: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('workout_completion_log')
        .select('*')
        .eq('user_id', user.id)
        .gte('workout_date', startDate)
        .lte('workout_date', endDate)
        .order('workout_date', { ascending: false });

    if (error) {
        console.error('Error fetching workout stats:', error.message);
        return null;
    }

    const completedWorkouts = data?.filter(log => log.completed).length || 0;
    const totalWorkouts = data?.length || 0;
    
    return {
        totalWorkouts,
        completedWorkouts,
        completionRate: totalWorkouts > 0 ? (completedWorkouts / totalWorkouts) * 100 : 0,
        logs: data as WorkoutCompletionLog[]
    };
};

// Duplicate a workout template
export const duplicateWorkoutTemplate = async (templateId: string) => {
    const originalTemplate = await getWorkoutTemplate(templateId);
    if (!originalTemplate) throw new Error('Template not found');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    // Create new template
    const { data: newTemplate, error: templateError } = await supabase
        .from('workout_templates')
        .insert({
            user_id: user.id,
            name: `${originalTemplate.name} (Copy)`,
            description: originalTemplate.description,
            is_active: false,
        })
        .select()
        .single();

    if (templateError) {
        console.error('Error duplicating template:', templateError.message);
        throw templateError;
    }

    // Copy all template days
    const originalDays = await getWorkoutTemplateDays(templateId);
    for (const day of originalDays) {
        await createWorkoutTemplateDay({
            workout_template_id: newTemplate.id,
            user_id: user.id,
            day_of_week: day.day_of_week,
            exercise_name: day.exercise_name,
            target_sets: day.target_sets,
            target_reps: day.target_reps,
            target_weight: day.target_weight,
            notes: day.notes,
        });
    }

    return newTemplate;
};

// Get a single workout template by ID
export const getWorkoutTemplate = async (id: string): Promise<WorkoutTemplate | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('workout_templates')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

    if (error) {
        console.error('Error fetching workout template:', error.message);
        return null;
    }

    return data as WorkoutTemplate;
};

// Set active template
export const setActiveTemplate = async (id: string) => {
    // First, deactivate all templates for this user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    await supabase
        .from('workout_templates')
        .update({ is_active: false })
        .eq('user_id', user.id);

    // Then activate the selected template
    return updateWorkoutTemplate(id, { is_active: true });
};

// Get active template
export const getActiveTemplate = async (): Promise<WorkoutTemplate | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('workout_templates')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // No rows returned
        console.error('Error fetching active template:', error.message);
        return null;
    }

    return data as WorkoutTemplate;
};
