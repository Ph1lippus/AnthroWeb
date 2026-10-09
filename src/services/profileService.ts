import { supabase, getCurrentUserId } from './supabaseClient';
import { REGISTRATION_ENABLED } from '../utils/appConfig';

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
    // Public sign-up is disabled (see utils/appConfig.ts). The guard lives here
    // too so no code path can create an account even if a screen is reached
    // directly or the UI is bypassed.
    if (!REGISTRATION_ENABLED) {
        throw new Error('Registration is currently closed on this deployment.');
    }

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
    active_goals?: Record<string, unknown> | null;
    /**
     * Dated goal versions; see `src/utils/goalHistory.ts`. `active_goals` remains
     * the current-goals pointer so readers that only need "now" keep working.
     */
    goal_history?: unknown[] | null;
    weight_unit?: 'kg' | 'lbs';
    /**
     * The cheat-day budget. Null means unlimited, which is the behaviour every
     * user had before the allowance existed; a number (including 0) applies.
     * `period` is the window the number is counted over. See
     * `src/utils/cheatDays.ts` for how a day is judged against it.
     */
    cheat_days_allowed?: number | null;
    cheat_days_period?: 'week' | 'month';
    created_at?: string;
    updated_at?: string;
}

// Fetch user settings
export const getUserSettings = async () => {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    
    const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
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
            weight_unit: settings.weight_unit || 'kg',
            cheat_days_allowed: settings.cheat_days_allowed ?? null,
            cheat_days_period: settings.cheat_days_period || 'week',
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
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user found');
    
    const { data, error } = await supabase
        .from('user_settings')
        .upsert({
            user_id: settings.user_id || userId,
            gender: settings.gender,
            height_cm: settings.height_cm,
            date_of_birth: settings.date_of_birth,
            goal: settings.goal,
            starting_weight: settings.starting_weight,
            starting_bodyfat: settings.starting_bodyfat,
            target_weight: settings.target_weight,
            target_bodyfat: settings.target_bodyfat,
            last_measurement_date: settings.last_measurement_date,
            weight_unit: settings.weight_unit || 'kg',
            active_goals: settings.active_goals,
            goal_history: settings.goal_history,
            // Only written when the caller actually carries them. EditProfilePage
            // builds a settings object without the cheat fields, and defaulting
            // `period` to 'week' here would silently reset a user who had chosen
            // 'month' every time they touched their profile. Left out entirely,
            // PostgREST leaves the stored columns alone.
            ...(settings.cheat_days_allowed !== undefined
                ? { cheat_days_allowed: settings.cheat_days_allowed }
                : {}),
            ...(settings.cheat_days_period !== undefined
                ? { cheat_days_period: settings.cheat_days_period }
                : {}),
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

/**
 * The most recent body composition on record.
 *
 * Reads `body_measurements`, which is where weight and body fat have lived since
 * migration 0013. It read `daily_logs` before that despite the name, so the
 * Profile page was showing whatever happened to be typed into the daily form
 * rather than an actual measurement.
 */
export const getLatestBodyMeasurements = async () => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
        .from('body_measurements')
        .select('weight, body_fat, measure_date')
        .eq('user_id', userId)
        .or('weight.not.is.null,body_fat.not.is.null')
        .order('measure_date', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching body measurements:', error.message);
        return null;
    }
    return data[0] || null;
};
