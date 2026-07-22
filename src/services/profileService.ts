import { supabase } from './supabaseClient';

export const signOutUser = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Error signing out:', error.message);
        throw error;
    }
};

export const getCurrentUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
        console.error('Error getting user:', error.message);
        return null;
    }
    return user;
};

export const signInWithEmail = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    
    if (error) {
        console.error('Error signing in:', error.message);
        throw error;
    }
    return data;
};

export const signUpWithEmail = async (email: string, password: string, username?: string) => {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                username,
            }
        }
    });
    
    if (error) {
        console.error('Error signing up:', error.message);
        throw error;
    }
    return data;
};

export const resetPassword = async (email: string) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    
    if (error) {
        console.error('Error resetting password:', error.message);
        throw error;
    }
    return data;
};

// User Settings types
export interface UserSettings {
    id?: string;
    user_id: string;
    gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | '';
    height_cm: number | null;
    date_of_birth: string | null;
    goal: 'maintain' | 'lose' | 'gain' | '';
    starting_weight: number | null;
    starting_bodyfat: number | null;
    target_weight: number | null;
    target_bodyfat: number | null;
    last_measurement_date: string | null;
    active_goals?: Record<string, any> | null;
    created_at?: string;
    updated_at?: string;
}

// Fetch user settings
export const getUserSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();
    
    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching user settings:', error.message);
        return null;
    }
    return data as UserSettings | null;
};

// Create user settings (after registration/onboarding)
export const createUserSettings = async (settings: UserSettings) => {
    const { data, error } = await supabase
        .from('user_settings')
        .insert({
            user_id: settings.user_id,
            gender: settings.gender,
            height_cm: settings.height_cm,
            date_of_birth: settings.date_of_birth,
            goal: settings.goal,
            starting_weight: settings.starting_weight,
            starting_bodyfat: settings.starting_bodyfat,
            target_weight: settings.target_weight,
            target_bodyfat: settings.target_bodyfat,
            last_measurement_date: settings.last_measurement_date,
        })
        .select()
        .single();
    
    if (error) {
        console.error('Error creating user settings:', error.message);
        throw error;
    }
    return data;
};

// Update user settings
export const updateUserSettings = async (settings: UserSettings) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');
    
    const { data, error } = await supabase
        .from('user_settings')
        .upsert({
            user_id: settings.user_id || user.id,
            gender: settings.gender,
            height_cm: settings.height_cm,
            date_of_birth: settings.date_of_birth,
            goal: settings.goal,
            starting_weight: settings.starting_weight,
            starting_bodyfat: settings.starting_bodyfat,
            target_weight: settings.target_weight,
            target_bodyfat: settings.target_bodyfat,
            last_measurement_date: settings.last_measurement_date,
            active_goals: (settings as any).active_goals,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'user_id'
        })
        .select()
        .single();
    
    if (error) {
        console.error('Error updating user settings:', error.message);
        throw error;
    }
    return data;
};

// Get latest body measurements for progress calculation
export const getLatestBodyMeasurements = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    const { data, error } = await supabase
        .from('daily_logs')
        .select('weight, body_fat, log_date')
        .eq('user_id', user.id)
        .not('weight', 'is', null)
        .order('log_date', { ascending: false })
        .limit(1);
    
    if (error) {
        console.error('Error fetching body measurements:', error.message);
        return null;
    }
    return data[0] || null;
};