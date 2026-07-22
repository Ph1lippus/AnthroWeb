import { supabase } from './supabaseClient';

export interface DailyLog {
    id?: string;
    user_id?: string;
    log_date: string;
    wake_time?: string;
    bedtime?: string;
    sleep_duration?: number;
    morning_systolic?: number;
    morning_diastolic?: number;
    morning_bpm?: number;
    evening_systolic?: number;
    evening_diastolic?: number;
    evening_bpm?: number;
    body_temperature?: number;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    water?: number;
    project_id?: string;
    project_work_done?: boolean;
    daily_score?: number;
    mood?: number;
    journal_entry?: string;
    created_at?: string;
    updated_at?: string;
    weight?: number;
    body_fat?: number;
    goal_snapshot?: any;
    sleep_quality?: number;
    // Built-in habits from DB
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
            project_id: log.project_id,
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
    const { data, error } = await supabase
        .from('daily_logs')
        .update({
            ...updates,
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