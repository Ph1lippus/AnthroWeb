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
export const getCompletedHabitsForDate = async (logDate: string): Promise<Set<string>> => {
    const userId = await getCurrentUserId();
    if (!userId) return new Set();

    const { data, error } = await supabase
        .from('daily_habit_logs')
        .select('habit_id')
        .eq('user_id', userId)
        .eq('log_date', logDate)
        .eq('completed', true);

    if (error) {
        console.error('Error fetching completed habits:', error.message);
        return new Set();
    }

    return new Set(data.map(item => item.habit_id));
};
