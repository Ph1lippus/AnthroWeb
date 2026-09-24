import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cache the authenticated user so data services don't each perform a network
// round-trip to /auth/v1/user before every query. The value is kept in sync via
// auth events (sign-in, sign-out, token refresh) so it stays correct for the
// whole session, which also matters for the native Capacitor app.
let cachedUserId: string | null = null;
let userIdPromise: Promise<string | null> | null = null;

supabase.auth.onAuthStateChange((_event, session) => {
    cachedUserId = session?.user?.id ?? null;
});

export const getCurrentUserId = async (): Promise<string | null> => {
    if (cachedUserId) return cachedUserId;
    if (!userIdPromise) {
        userIdPromise = supabase.auth
            .getUser()
            .then(({ data }) => {
                cachedUserId = data.user?.id ?? null;
                return cachedUserId;
            })
            .catch((err) => {
                console.error('Error getting user:', err.message);
                return null;
            })
            .finally(() => {
                userIdPromise = null;
            });
    }
    return userIdPromise;
};