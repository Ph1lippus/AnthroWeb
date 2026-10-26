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
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
        console.error('Error resetting password:', error.message);
        throw error;
    }
    return data;
};

/**
 * Per-habit overrides that live in `user_settings.habit_settings`.
 *
 * Built-in habits are not rows in `habits`, so everything about them that is
 * editable -- including the label shown on the daily log -- has to live here.
 * The key is the habit's stable `BuiltinHabitKey` rather than its column or
 * label, so renaming a built-in never moves its settings.
 */
export interface HabitSetting {
    name?: string;
    description?: string | null;
    priority?: 'high' | 'medium' | 'low';
    schedule_days?: number[] | null;
    is_negative?: boolean;
}

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
     * The cheat-day budget. Defaults to 1 (one free cheat day per window).
     * Null means unlimited -- a cleared box deliberately turns the budget off; a
     * number (including 0) applies. `period` is the window the number is counted
     * over. See `src/utils/cheatDays.ts` for how a day is judged against it.
     */
    cheat_days_allowed?: number | null;
    cheat_days_period?: 'week' | 'month';
    /** Maintenance calorie target used to score cheat-day calories. User-chosen. */
    cheat_maintenance_calories?: number | null;
    /** Calorie ceiling above which cheat-day calories score zero. User-chosen. */
    cheat_calorie_ceiling?: number | null;
    habit_settings?: Record<string, HabitSetting> | null;
    created_at?: string;
    updated_at?: string;

    /**
     * The encryption keyring. `vault_enabled` is the only field anything
     * branches on; the rest are the wrapped master key and the parameters that
     * produced it, and are meaningless without it.
     *
     * `false` -- the default, and every account that has never set a PIN. Every
     * read and write path behaves exactly as it did before the vault existed,
     * which is what makes the feature safe to ship on.
     */
    vault_enabled?: boolean;
    vault_version?: number;
    vault_enabled_at?: string | null;
    vault_pin_salt?: string | null;
    vault_pin_iterations?: number | null;
    /** Master key sealed under PBKDF2(PIN). Useless without the PIN. */
    vault_pin_wrapped?: string | null;
    vault_recovery_salt?: string | null;
    vault_recovery_iterations?: number | null;
    /** Master key sealed under PBKDF2(recovery phrase). The way back in. */
    vault_recovery_wrapped?: string | null;
    vault_pin_changed_at?: string | null;

    /**
     * Failed app-PIN attempts, and when attempts stop being accepted.
     *
     * Server-side so the lockout survives a reload, a new tab, or a cleared
     * browser cache. Cleared on a successful unlock.
     */
    vault_failed_attempts?: number;
    vault_retry_after?: string | null;

    /**
     * Account-recovery material, so a forgotten page PIN can be reset.
     *
     * `account_recovery_verifier` is an AES-GCM wrap of a fixed probe string
     * under PBKDF2(account password) -- a password check, not a stored password
     * and not a password-equivalent. See `services/vault/accountRecovery.ts`.
     */
    account_recovery_salt?: string | null;
    account_recovery_iterations?: number | null;
    account_recovery_verifier?: string | null;

    /** Sealed private fields for this row, or null when not sealed. */
    vault?: string | null;
}

/**
 * The raw fetch. `null` means "no settings row"; a failure throws.
 *
 * This distinction is what the goals flow needs. The daily log reads a null
 * result as "this user has never set up goals" and redirects to setup -- so one
 * dropped connection would send a returning user through onboarding, where
 * saving collapses their `goal_history` to a single version. A row-level
 * rejection and a blank table are different facts.
 *
 * Throwing is right *here* and wrong in `getUserSettings` below. Six existing
 * callers -- including the sign-in path -- were written against a service that
 * degrades to null, and several of them are `try/finally` with no `catch`, so a
 * throw becomes an unhandled rejection or, in the login case, a "Failed to
 * login" message shown to someone whose password was correct. Rather than
 * change the contract under them, the throwing behaviour lives here and only
 * `useUserSettings` -- which can express the difference in React Query's error
 * state -- calls it.
 */
export const fetchUserSettings = async () => {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    // `maybeSingle` rather than `single`: "no rows" is a legitimate answer here,
    // not an error, and `single` reports it as PGRST116.
    const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.error('Error fetching user settings:', error.message);
        throw error;
    }
    return data as UserSettings | null;
};

/**
 * Fetch user settings, degrading to `null` on failure.
 *
 * The original contract, deliberately kept intact: eight call sites depend on
 * it, and a rejected request must not reach them as an exception. In particular
 * `LoginForm` awaits this between a successful sign-in and its navigation, so a
 * throw here would be reported to the user as a failed login with a correct
 * password.
 */
export const getUserSettings = async (): Promise<UserSettings | null> => {
    try {
        return await fetchUserSettings();
    } catch (error) {
        // Already logged by `fetchUserSettings`. Swallowed on purpose: for these
        // callers "no settings" and "settings unavailable" lead to the same
        // recovery, which is to render as if they were still being set up.
        void error;
        return null;
    }
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
            // One free cheat day a week is the default the app ships with; an
            // explicit null still means "no limit" for callers that ask for it.
            cheat_days_allowed: settings.cheat_days_allowed !== undefined ? settings.cheat_days_allowed : 1,
            cheat_days_period: settings.cheat_days_period || 'week',
            ...(settings.cheat_maintenance_calories !== undefined
                ? { cheat_maintenance_calories: settings.cheat_maintenance_calories }
                : {}),
            ...(settings.cheat_calorie_ceiling !== undefined
                ? { cheat_calorie_ceiling: settings.cheat_calorie_ceiling }
                : {}),
            ...(settings.habit_settings !== undefined ? { habit_settings: settings.habit_settings } : {}),
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
            ...(settings.cheat_maintenance_calories !== undefined
                ? { cheat_maintenance_calories: settings.cheat_maintenance_calories }
                : {}),
            ...(settings.cheat_calorie_ceiling !== undefined
                ? { cheat_calorie_ceiling: settings.cheat_calorie_ceiling }
                : {}),
            // Also conditional, and for the same reason: most callers build a
            // settings object for one screen and do not carry habits at all. An
            // unconditional write here would erase every built-in habit override
            // whenever somebody saved their profile.
            ...(settings.habit_settings !== undefined
                ? { habit_settings: settings.habit_settings }
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
