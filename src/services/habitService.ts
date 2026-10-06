import { supabase, getCurrentUserId } from './supabaseClient';

export interface Habit {
    id?: string;
    user_id: string;
    name: string;
    description?: string;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface DailyHabitLog {
    id?: string;
    user_id: string;
    habit_id: string;
    log_date: string;
    completed: boolean;
}

// Fetch all habits for current user
export const getUserHabits = async (): Promise<Habit[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('habits')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching habits:', error.message);
        return [];
    }

    return data as Habit[];
};

// Toggle habit completion for a specific date
export const toggleHabitForDate = async (habitId: string, logDate: string): Promise<boolean> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user found');

    // Check if already logged
    const { data: existing } = await supabase
        .from('daily_habit_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('habit_id', habitId)
        .eq('log_date', logDate)
        .single();

    if (existing) {
        // Toggle
        const { error } = await supabase
            .from('daily_habit_logs')
            .update({ completed: !existing.completed, updated_at: new Date().toISOString() })
            .eq('id', existing.id);

        if (error) throw error;
        return !existing.completed;
    } else {
        // Create new
        const { error } = await supabase
            .from('daily_habit_logs')
            .insert({
                user_id: userId,
                habit_id: habitId,
                log_date: logDate,
                completed: true,
            });

        if (error) throw error;
        return true;
    }
};

// Create a new habit
export const createHabit = async (habit: { name: string; description?: string }) => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user found');

    const name = habit.name;

    // Deletion is a soft delete (is_active=false), so a removed habit still
    // occupies the unique_user_habit (user_id, name) slot. If the user is
    // re-adding that name, reactivate the existing row instead of inserting a
    // duplicate (which would hit the unique constraint and return a 409).
    const { data: existing } = await supabase
        .from('habits')
        .select('*')
        .eq('user_id', userId)
        .eq('name', name)
        .eq('is_active', false)
        .maybeSingle();

    if (existing) {
        const { data, error } = await supabase
            .from('habits')
            .update({
                name,
                description: habit.description ?? existing.description,
                is_active: true,
                updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
            .select()
            .single();

        if (error) {
            console.error('Error restoring habit:', error.message);
            throw error;
        }
        return data;
    }

    const { data, error } = await supabase
        .from('habits')
        .insert({
            user_id: userId,
            name,
            description: habit.description,
            is_active: true,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating habit:', error.message);
        throw error;
    }
    return data;
};

// Delete a habit
export const deleteHabit = async (id: string) => {
    const { error } = await supabase
        .from('habits')
        .update({ is_active: false })
        .eq('id', id);

    if (error) {
        console.error('Error deleting habit:', error.message);
        throw error;
    }
};

/** What a rename can change. Either field, or both. */
export interface HabitUpdate {
    name?: string;
    description?: string | null;
}

/**
 * Rename a habit, or change what it says it is.
 *
 * Renaming touches no log: `daily_habit_logs` records `habit_id`, never the name, so
 * every tick, every streak and every chart keeps working against the same row. The
 * only thing that can refuse the write is `unique_user_habit (user_id, name)` --
 * and that constraint counts removed habits too, because removal is a soft delete.
 * So a name already in use, live or gone, is refused here with a sentence worth
 * showing, rather than arriving as an unexplained 409 from PostgREST.
 *
 * Every write stamps `updated_at`, as the other services do. Nothing sorts habits
 * by it -- they are ordered by `created_at` -- so renaming never moves a habit in
 * the list.
 */
export const updateHabit = async (id: string, updates: HabitUpdate): Promise<Habit> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user found');

    const name = updates.name?.trim();

    if (name !== undefined) {
        // Asked of the table rather than of the loaded list, which only ever holds
        // the habits that are still active: a removed one still holds its name, and
        // is exactly the name someone is most likely to type again.
        const { data: clash, error: clashError } = await supabase
            .from('habits')
            .select('id')
            .eq('user_id', userId)
            .eq('name', name)
            .neq('id', id)
            .limit(1);

        if (clashError) {
            console.error('Error checking habit name:', clashError.message);
            throw clashError;
        }
        if (clash && clash.length > 0) {
            throw new Error(`There is already a habit called "${name}".`);
        }
    }

    const { data, error } = await supabase
        .from('habits')
        .update({
            ...(name !== undefined ? { name } : {}),
            ...(updates.description !== undefined
                ? { description: updates.description }
                : {}),
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        // Scoped like `getUserHabits` reads. The policies would catch it too; this
        // means a habit that somehow is not the caller's matches nothing rather
        // than quietly reporting success.
        .eq('user_id', userId)
        .select()
        .single();

    if (error) {
        console.error('Error updating habit:', error.message);
        throw error;
    }

    return data as Habit;
};

// Fetch all habit logs for current user (used for charts)
export const getAllHabitLogs = async (): Promise<DailyHabitLog[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('daily_habit_logs')
        .select('*')
        .eq('user_id', userId);

    if (error) {
        console.error('Error fetching habit logs:', error.message);
        return [];
    }

    return (data as DailyHabitLog[]) || [];
};

// Get completed habits for a date
export const getCompletedHabitsForDate = async (logDate: string): Promise<string[]> => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
        .from('daily_habit_logs')
        .select('habit_id')
        .eq('user_id', userId)
        .eq('log_date', logDate)
        .eq('completed', true);

    if (error) {
        console.error('Error fetching completed habits:', error.message);
        return [];
    }

    // Keep query data JSON-serializable. React Query persistence turns a Set
    // into a plain object on restore, which makes `.has()` crash in the page.
    return data.map(item => item.habit_id);
};
