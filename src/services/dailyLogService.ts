import { supabase } from './supabaseClient';

export interface DailyLog {
    id?: string;
    user_id?: string;
    log_date: string;
    wake_time?: string | null;
    bedtime?: string | null;
    sleep_duration?: number | null;
    morning_systolic?: number | null;
    morning_diastolic?: number | null;
    morning_bpm?: number | null;
    evening_systolic?: number | null;
    evening_diastolic?: number | null;
    evening_bpm?: number | null;
    body_temperature?: number | null;
    calories?: number | null;
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
    water?: number | null;
    project_work_done?: boolean;
    daily_score?: number | null;
    mood?: number | null;
    journal_entry?: string | null;
    created_at?: string;
    updated_at?: string;
    weight?: number | null;
    body_fat?: number | null;
    goal_snapshot?: Record<string, unknown> | null;
    sleep_quality?: number | null;
    morning_routine?: boolean;
    evening_routine?: boolean;
    fruit_serving?: boolean;
    studied?: boolean;
    journal?: boolean;
    stretching?: boolean;
    reading?: boolean;
}

// Fetch all daily logs for current user
export const getUserDailyLogs = async (): Promise<DailyLog[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('log_date', { ascending: false });

    if (error) {
        console.error('Error fetching daily logs:', error.message);
        return [];
    }

    return (data as DailyLog[]) || [];
};

// Fetch a single daily log by date for current user
export const getDailyLogByDate = async (logDate: string): Promise<DailyLog | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('log_date', logDate)
        .single();

    if (error) {
        console.error('Error fetching daily log by date:', error.message);
        return null;
    }

    return data as DailyLog;
};

// Fetch a single daily log by id
export const getDailyLogById = async (id: string): Promise<DailyLog | null> => {
    const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching daily log:', error.message);
        return null;
    }

    return data as DailyLog;
};

// Create a new daily log
export const createDailyLog = async (log: DailyLog) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('daily_logs')
        .insert({
            user_id: user.id,
            log_date: log.log_date,
            wake_time: log.wake_time,
            bedtime: log.bedtime,
            sleep_duration: log.sleep_duration,
            morning_systolic: log.morning_systolic,
            morning_diastolic: log.morning_diastolic,
            morning_bpm: log.morning_bpm,
            evening_systolic: log.evening_systolic,
            evening_diastolic: log.evening_diastolic,
            evening_bpm: log.evening_bpm,
            body_temperature: log.body_temperature,
            calories: log.calories,
            protein: log.protein,
            carbs: log.carbs,
            fat: log.fat,
            water: log.water,
            project_work_done: log.project_work_done,
            daily_score: log.daily_score,
            mood: log.mood,
            journal_entry: log.journal_entry,
            weight: log.weight,
            body_fat: log.body_fat,
            goal_snapshot: log.goal_snapshot,
            sleep_quality: log.sleep_quality,
            // Built-in habits
            morning_routine: log.morning_routine,
            evening_routine: log.evening_routine,
            fruit_serving: log.fruit_serving,
            studied: log.studied,
            journal: log.journal,
            stretching: log.stretching,
            reading: log.reading,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating daily log:', error.message);
        throw error;
    }
    return data;
};

// Update a daily log
export const updateDailyLog = async (id: string, updates: Partial<DailyLog>) => {
    // Explicitly exclude fields that should never be updated via this function
    const updateData: Record<string, unknown> = {};
    const excludedFields = ['user_id', 'id', 'created_at', 'updated_at'];
    for (const [key, value] of Object.entries(updates)) {
        if (!excludedFields.includes(key)) {
            updateData[key] = value;
        }
    }
    const { data, error } = await supabase
        .from('daily_logs')
        .update({
            ...updateData,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating daily log:', error.message);
        throw error;
    }
    return data;
};

// Delete a daily log
export const deleteDailyLog = async (id: string) => {
    const { error } = await supabase
        .from('daily_logs')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting daily log:', error.message);
        throw error;
    }
};

// Save project associations for a daily log (replaces existing associations)
export const saveDailyLogProjects = async (dailyLogId: string, projectIds: string[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    // Delete existing associations
    const { error: deleteError } = await supabase
        .from('daily_log_projects')
        .delete()
        .eq('daily_log_id', dailyLogId);

    if (deleteError) {
        console.error('Error deleting daily log projects:', deleteError.message);
        throw deleteError;
    }

    // Insert new associations
    if (projectIds.length > 0) {
        const { error: insertError } = await supabase
            .from('daily_log_projects')
            .insert(
                projectIds.map(projectId => ({
                    daily_log_id: dailyLogId,
                    project_id: projectId,
                    user_id: user.id,
                }))
            );

        if (insertError) {
            console.error('Error saving daily log projects:', insertError.message);
            throw insertError;
        }
    }
};

// Get project IDs associated with a daily log
export const getDailyLogProjects = async (dailyLogId: string): Promise<string[]> => {
    const { data, error } = await supabase
        .from('daily_log_projects')
        .select('project_id')
        .eq('daily_log_id', dailyLogId);

    if (error) {
        console.error('Error fetching daily log projects:', error.message);
        return [];
    }

    return data.map(item => item.project_id);
};
