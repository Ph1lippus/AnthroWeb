import { supabase, getCurrentUserId } from './supabaseClient';

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
    /**
     * Subjective 1-10 mood, once per end of the day. Set from the journal page,
     * which is where the writing for each half of the day already lives.
     *
     * Replaced the single `mood` column in 0014. Both are nullable and always
     * were meant to be: a day with only an evening rating is a real day, and
     * coercing a missing reading to a midpoint would drag every average toward
     * calm. Read them through `utils/moodSeries` rather than averaging by hand.
     */
    morning_mood?: number | null;
    evening_mood?: number | null;
    journal_entry?: string | null;
    journal_morning?: string | null;
    journal_evening?: string | null;
    journal_links?: string[] | null;
    created_at?: string;
    updated_at?: string;
    goal_snapshot?: Record<string, unknown> | null;
    sleep_quality?: number | null;
    morning_routine?: boolean;
    evening_routine?: boolean;
    fruit_serving?: boolean;
    studied?: boolean;
    journal?: boolean;
    stretching?: boolean;
    reading?: boolean;
    no_sleep?: boolean;
    /**
     * A day off the food plan: the four food macros are stored exactly as typed
     * but are left out of the day's score. Hydration still counts -- see
     * `computeDailyScore` for why.
     */
    cheat_day?: boolean;
    // Written by the workout pages (setGymForDate), never by this service, so
    // the habit score and the workout heatmap stay one fact rather than two.
    gym?: boolean;
}

// Fetch all daily logs for current user
//
// The journal columns and both mood ratings are on this select list because the
// mind-charts page builds its graph out of them -- topic frequency comes from
// `journal_links`, and node colour from the day's average mood -- and the
// dashboard's charts need the ratings too. They cost two text columns and two
// small ints per row, and the alternative is a second full-table query that
// returns the same rows, which is the more expensive way to get them.
export const getUserDailyLogs = async (): Promise<DailyLog[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('daily_logs')
        .select('log_date,wake_time,bedtime,sleep_duration,morning_systolic,morning_diastolic,morning_bpm,evening_systolic,evening_diastolic,evening_bpm,body_temperature,calories,protein,carbs,fat,water,daily_score,morning_mood,evening_mood,sleep_quality,morning_routine,evening_routine,fruit_serving,studied,journal,stretching,reading,project_work_done,no_sleep,cheat_day,gym,goal_snapshot,journal_morning,journal_evening,journal_links')
        .eq('user_id', userId)
        .order('log_date', { ascending: false });

    if (error) {
        console.error('Error fetching daily logs:', error.message);
        return [];
    }

    return (data as DailyLog[]) || [];
};

// Fetch a single daily log by date for current user
export const getDailyLogByDate = async (logDate: string): Promise<DailyLog | null> => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', userId)
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

// Create a daily log for a day, or overwrite it if that day already has one.
// Upserting against the (user_id, log_date) unique index means a second save
// for the same day updates instead of failing with a 23505 conflict.
export const createDailyLog = async (log: DailyLog) => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user found');

    const { data, error } = await supabase
        .from('daily_logs')
        .upsert({
            user_id: userId,
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
            morning_mood: log.morning_mood,
            evening_mood: log.evening_mood,
            journal_entry: log.journal_entry,
            journal_morning: log.journal_morning,
            journal_evening: log.journal_evening,
            journal_links: log.journal_links,
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
            no_sleep: log.no_sleep,
            cheat_day: log.cheat_day,
        }, { onConflict: 'user_id,log_date' })
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

// The built-in habits, named as the columns they are stored in. `gym` is absent on
// purpose: it is written by the workout pages (setGymForDate), never from here.
export type DailyLogHabitColumn =
    | 'morning_routine'
    | 'evening_routine'
    | 'fruit_serving'
    | 'studied'
    | 'journal'
    | 'stretching'
    | 'reading'
    | 'project_work_done'
    | 'no_sleep'
    | 'cheat_day';

/**
 * Writes one built-in habit for one day, on its own.
 *
 * The habit checkboxes used to reach the database only through the page's
 * debounced whole-row autosave, which meant three things went wrong at once: a
 * tick sat in a timer instead of being saved, a refresh inside the debounce window
 * lost it outright, and every tick put the whole ~35 column row on the wire. Two
 * ticks in quick succession were two competing whole-row writes, so whichever
 * response landed last won -- which could be the older one, silently undoing a
 * habit the user had already ticked.
 *
 * A habit is a single boolean column, so it is written as a single boolean
 * column. The upsert against (user_id, log_date) creates the day's row when this
 * is the first thing entered on it, and PostgREST only sets the columns in the
 * payload, so nothing else on the row moves. Two different habits can therefore
 * be written at the same moment without either clobbering the other, and the
 * page's own autosave still rewrites the whole row a moment later to bring
 * `daily_score` and the day's project links back in step with the tick.
 */
export const setDailyLogHabit = async (
    logDate: string,
    habit: DailyLogHabitColumn,
    completed: boolean
): Promise<void> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user found');

    const { error } = await supabase
        .from('daily_logs')
        .upsert(
            { user_id: userId, log_date: logDate, [habit]: completed },
            { onConflict: 'user_id,log_date' },
        );

    if (error) {
        console.error(`Error saving the ${habit} habit:`, error.message);
        throw error;
    }
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
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user found');

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
                    user_id: userId,
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
