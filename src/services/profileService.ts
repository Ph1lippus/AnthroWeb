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
