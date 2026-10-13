import React, { useEffect, useState } from 'react';
import { useAuthSession } from '../../hooks/useAuthSession';
import { initialiseAppLock, useAppLock, useAutoLock } from '../../hooks/useAppLock';
import { getCurrentUserId } from '../../services/supabaseClient';
import LockScreen from './LockScreen';
import RecoveryPhraseDialog from './RecoveryPhraseDialog';

/**
 * The thing that stands in front of the whole app.
 *
 * Mounted once, inside the providers and outside the router, so that nothing
 * renders until the keyring is open. That ordering is the point: a lock screen
 * that sits *inside* the router lets the first route mount, fire its queries,
 * and paint private content for a frame before the screen appears -- and those
 * queries land in the persisted cache, so the lock would be guarding a copy that
 * was already written to disk.
 *
 * Three states, and the third is the important one:
 *
 *   checking -- we do not know yet whether this account has a PIN. Render
 *               nothing. Guessing either way is wrong: assuming "no PIN" flashes
 *               private data, assuming "locked" strands a user who has none.
 *   disabled -- no PIN. Render children, unchanged.
 *   locked   -- render the lock screen. Not the children underneath it.
 *   unlocked -- render children.
 *
 * `checking` is deliberately not an error state that fails open. If the settings
 * fetch fails the app waits, because the failure mode of the other choice is
 * showing someone's journal to whoever picks up the phone.
 */

interface AppLockGateProps {
    children: React.ReactNode;
}

const AppLockGate: React.FC<AppLockGateProps> = ({ children }) => {
    const { user } = useAuthSession();
    const { state, error } = useAppLock();
    const [showRecovery, setShowRecovery] = useState(false);

    // Derived, not state. It only ever comes from the session, and a `useState`
    // fed by an effect would render once with the previous account's name.
    const username = user?.user_metadata?.username ?? user?.email?.split('@')[0] ?? null;

    // Asked once a session exists. Runs on every auth change on purpose: signing
    // out has to reset the state to something the next sign-in will overwrite,
    // and a locked vault must not stay locked into a different account.
    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        void initialiseAppLock().then(() => {
            // A sign-out while the fetch was in flight must not re-open a vault
            // for the account that just left.
            if (!cancelled) void getCurrentUserId();
        });
        return () => { cancelled = true; };
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Only meaningful once open; mounting it while locked would arm a timer that
    // fires into a lock it cannot perform.
    useAutoLock(state === 'unlocked');

    if (!user) return <>{children}</>;

    if (state === 'unlocked' || state === 'disabled') {
        return <>{children}</>;
    }

    if (state === 'checking') {
        // Deliberately a blank screen rather than a spinner with a preview: there
        // is nothing safe to show until we know.
        return <div className="vault-lock-screen vault-lock-screen--checking" aria-busy="true">
            <p className="sr-only">Checking</p>
        </div>;
    }

    return (
        <>
            <LockScreen
                username={username}
                onRecoveryPhrase={() => setShowRecovery(true)}
            />
            {showRecovery && <RecoveryPhraseDialog onClose={() => setShowRecovery(false)} />}
            {error && <div className="sr-only" role="alert">{error}</div>}
        </>
    );
};

export default AppLockGate;