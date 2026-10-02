import { useSyncExternalStore } from 'react';
import type { AuthSessionState } from '../services/authSession';
import { getAuthSessionSnapshot, subscribeAuthSession } from '../services/authSession';

/**
 * The signed-in user, and whether we know yet.
 *
 * Every component that needs the session reads it from here, so the navbar, the
 * sidebar, the mobile navbar and the route guards can never disagree about who is
 * signed in.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the store is
 * module-level, so the subscription is created once and torn down only on unmount,
 * and the snapshot is read during render instead of one paint late. That last part
 * is what stops the boot screen from flashing an empty frame before it reads the
 * already-resolved session.
 */
export const useAuthSession = (): AuthSessionState =>
    useSyncExternalStore(subscribeAuthSession, getAuthSessionSnapshot);