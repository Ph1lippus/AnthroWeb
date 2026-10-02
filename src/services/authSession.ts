import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export interface AuthSessionState {
    /** The signed-in user, or null. */
    user: User | null;
    /**
     * True once we know whether anyone is signed in.
     *
     * Until this flips, `user === null` is ambiguous: it means either "nobody is
     * signed in" or "we have not asked yet". The boot screen gates on this, so a
     * page must never infer a signed-out state from a null user alone.
     */
    resolved: boolean;
}

let state: AuthSessionState = { user: null, resolved: false };
const listeners = new Set<() => void>();
let started = false;

/**
 * Merge a patch into the session state and notify subscribers.
 *
 * The early-out compares by value rather than always allocating: `useSyncExternalStore`
 * compares snapshots by reference and skips the re-render when they are equal, so
 * handing back a fresh object every call would re-render the entire app on every
 * auth event.
 */
const setState = (patch: Partial<AuthSessionState>): void => {
    const next: AuthSessionState = { ...state, ...patch };
    if (next.user === state.user && next.resolved === state.resolved) return;
    state = next;
    listeners.forEach(listener => listener());
};

/**
 * Begin resolving the session. Idempotent, so it is safe to call from both the
 * app entry point and the first subscription.
 *
 * This replaced five independent `getSession()` calls -- one each in the navbar,
 * the sidebar, the mobile navbar and two route guards. They raced: five identical
 * network round-trips on every cold start, and the guards could disagree with the
 * navbars about who was signed in for as long as their promises took to settle.
 *
 * Both resolution paths are kept on purpose:
 *
 *  - supabase-js emits `INITIAL_SESSION` as soon as it is subscribed, carrying the
 *    session restored from storage. That is the fast path.
 *  - `getSession()` runs alongside it so `resolved` still flips if that event is
 *    ever missed. A restored session on a slow Android WebView is exactly the case
 *    where an event-only implementation would leave the splash up forever.
 */
export const startAuthSession = (): void => {
    if (started) return;
    started = true;

    // The subscription lives for the lifetime of the module; there is nothing to
    // tear down, so the handle is deliberately not held onto.
    supabase.auth.onAuthStateChange((_event, session) => {
        setState({ user: session?.user ?? null, resolved: true });
    });

    void supabase.auth
        .getSession()
        .then(({ data }) => {
            setState({ user: data.session?.user ?? null, resolved: true });
        })
        .catch(() => {
            // A failed read is still an answer as far as the UI is concerned.
            // Reporting "signed out" lets the landing page render; leaving this
            // unresolved would hang the boot screen with no way out.
            setState({ user: null, resolved: true });
        });
};

/** Subscribe to session changes. Returns the unsubscribe function. */
export const subscribeAuthSession = (listener: () => void): (() => void) => {
    startAuthSession();
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

/**
 * Current session snapshot.
 *
 * Returns the same object until something actually changes, which is what
 * `useSyncExternalStore` needs to avoid an infinite render loop.
 */
export const getAuthSessionSnapshot = (): AuthSessionState => state;