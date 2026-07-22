import { supabase } from './supabaseClient';

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('habits')
        .select('*')
        .eq('user_id', user.id)
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    // Check if already logged
    const { data: existing } = await supabase
        .from('daily_habit_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('habit_id', habitId)
        .eq('log_date', logDate)
        .single();

    if (existing) {
        // Toggle
        const { error } = await supabase
            .from('daily_habit_logs')
            .update({ completed: !existing.completed })
            .eq('id', existing.id);

        if (error) throw error;
        return !existing.completed;
    } else {
        // Create new
        const { error } = await supabase
            .from('daily_habit_logs')
            .insert({
                user_id: user.id,
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data, error } = await supabase
        .from('habits')
        .insert({
            user_id: user.id,
            name: habit.name,
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

// Get completed habits for a date
export const getCompletedHabitsForDate = async (logDate: string): Promise<Set<string>> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Set();

    const { data, error } = await supabase
        .from('daily_habit_logs')
        .select('habit_id')
        .eq('user_id', user.id)
        .eq('log_date', logDate)
        .eq('completed', true);

    if (error) {
        console.error('Error fetching completed habits:', error.message);
        return new Set();
    }

    return new Set(data.map(item => item.habit_id));
};
