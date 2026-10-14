import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { fetchUserSettings, updateUserSettings } from '../services/profileService';
import { forgetAccountKey } from '../services/noteService';
import { supabase } from '../services/supabaseClient';
import { verifyAccountPassword } from '../services/vault/accountRecovery';
import type { UserSettings } from '../services/profileService';
import {
    FREE_ATTEMPTS,
    appRetryRemainingMs,
    describeRetry,
    generateRecoveryPhrase,
    getMasterKey,
    isUnlocked,
    lockKeyring,
    provisionVault,
    rewrapMasterForPin,
    retryAfterMs,
    unlockWithPin,
    unlockWithRecoveryPhrase,
    validateRecoveryPhrase,
    type VaultProvisioning,
    type VaultSettings,
} from '../services/vault/keyring';

/**
 * Narrow the settings row to what the keyring reads.
 *
 * The keyring wants exactly these fields and nothing else. Naming the shape
 * rather than casting means that if a column is renamed in the migration and in
 * `UserSettings` together, this stops compiling instead of quietly unwrapping
 * `undefined`.
 */
const toVaultSettings = (settings: UserSettings): VaultSettings => ({
    vault_enabled: settings.vault_enabled ?? false,
    vault_pin_salt: settings.vault_pin_salt ?? null,
    vault_pin_iterations: settings.vault_pin_iterations ?? null,
    vault_pin_wrapped: settings.vault_pin_wrapped ?? null,
    vault_recovery_salt: settings.vault_recovery_salt ?? null,
    vault_recovery_iterations: settings.vault_recovery_iterations ?? null,
    vault_recovery_wrapped: settings.vault_recovery_wrapped ?? null,
});

/**
 * Whether the app is showing a lock screen, and how it gets unlocked.
 *
 * Built on an external store rather than React context for the same reason
 * `useAuthSession` is: the gate has to be readable from a module that runs before
 * React renders anything -- `main.tsx` has to hold the boot splash until the
 * lock state is known, or the app paints a private page and then covers it.
 *
 * States, in the order they resolve:
 *
 *   'checking' -- we do not yet know whether this account has a PIN. The splash
 *                 stays up. Showing content here would flash private data
 *                 before the lock screen replaced it.
 *   'disabled' -- no PIN set. The app renders normally.
 *   'locked'   -- a PIN is set and the keyring is not open. Lock screen.
 *   'unlocked' -- the master key is in memory. The app renders.
 *
 * The master key lives in module scope inside `keyring.ts` and nowhere else. It
 * is never written to storage in the clear, so this store holds a boolean, not a
 * secret.
 */

export type LockState = 'checking' | 'disabled' | 'locked' | 'unlocked';

export interface LockSnapshot {
    state: LockState;
    /** Set when a PIN exists but the vault could not be opened for some reason. */
    error: string | null;
}

let snapshot: LockSnapshot = { state: 'checking', error: null };
const listeners = new Set<() => void>();

const emit = (next: Partial<LockSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const getSnapshot = () => snapshot;

export const useAppLock = (): LockSnapshot =>
    useSyncExternalStore(subscribe, getSnapshot);

/** Read the lock state without subscribing. For module-level gates. */
export const getLockState = (): LockState => snapshot.state;

/**
 * Should the app lock itself when it goes to the background?
 *
 * On by default, and it is the setting people are most likely to change and most
 * likely to need. A phone left on a table with the app open is the exact
 * scenario the PIN exists for, and on Android the WebView keeps running in the
 * background for a long time.
 */
const IDLE_LOCK_MS = 5 * 60_000;
let idleLockMs = IDLE_LOCK_MS;
let lockOnBackground = true;

export const configureLock = (options: { idleLockMs?: number; lockOnBackground?: boolean }) => {
    if (options.idleLockMs !== undefined) idleLockMs = options.idleLockMs;
    if (options.lockOnBackground !== undefined) lockOnBackground = options.lockOnBackground;
};

/**
 * Ask the keyring whether this account is armed, and adopt the answer.
 *
 * Called once at boot, before the first route renders. A failure here resolves to
 * 'checking' forever rather than to 'disabled' -- failing open on an error would
 * mean a transient network blip turns the lock off, which is the one direction
 * this can fail in that matters.
 */
export const initialiseAppLock = async (): Promise<LockState> => {
    try {
        const settings = await fetchUserSettings();
        const state: LockState = settings?.vault_enabled ? 'locked' : 'disabled';
        emit({ state, error: null });
        return state;
    } catch (error) {
        emit({
            state: 'checking',
            error: error instanceof Error ? error.message : 'Could not check the lock.',
        });
        return 'checking';
    }
};

/**
 * Try a PIN. Returns true on success.
 *
 * The false case covers "wrong PIN" and "the vault is broken" equally, on
 * purpose: telling a user which one it was is information about a stored key
 * that does not need to be handed out.
 *
 * Failed attempts are counted server-side in `vault_failed_attempts` and
 * refused outright while `vault_retry_after` is in the future. That is a real
 * control rather than a speed bump: the counter lives in the row, so reloading
 * the page, clearing storage, or opening a private window all start from the
 * same number, and the ladder eventually reaches a full day.
 *
 * A success clears the counter. Otherwise a user who fat-fingers their PIN three
 * times on Monday and remembers it on Tuesday would still be served a lockout.
 */
export const unlock = async (pin: string): Promise<boolean> => {
    const settings = await fetchUserSettings();
    if (!settings?.vault_enabled) {
        emit({ state: 'disabled', error: null });
        return true;
    }

    const locked = appRetryRemainingMs(settings as unknown as VaultSettings);
    if (locked > 0) {
        emit({ state: 'locked', error: `Too many attempts. Try again in ${describeRetry(locked)}.` });
        return false;
    }

    const ok = await unlockWithPin(toVaultSettings(settings), pin);
    if (ok) {
        if ((settings.vault_failed_attempts ?? 0) > 0) {
            await updateUserSettings({
                ...settings,
                vault_failed_attempts: 0,
                vault_retry_after: null,
            } as unknown as UserSettings);
        }
        emit({ state: 'unlocked', error: null });
        return true;
    }

    const attempts = (settings.vault_failed_attempts ?? 0) + 1;
    const wait = retryAfterMs(attempts);
    await updateUserSettings({
        ...settings,
        vault_failed_attempts: attempts,
        // An absolute deadline rather than a duration, so the value stays
        // meaningful when read back on a device whose clock has since moved.
        vault_retry_after: wait > 0 ? new Date(Date.now() + wait).toISOString() : null,
    } as unknown as UserSettings);

    if (wait > 0) {
        emit({ state: 'locked', error: `Wrong PIN. Try again in ${describeRetry(wait)}.` });
    }
    return false;
};

/** Try a recovery phrase. The way back in when the PIN is gone. */
export const unlockWithRecovery = async (phrase: string): Promise<boolean> => {
    const settings = await fetchUserSettings();
    if (!settings?.vault_enabled) return false;
    // Validated before the slow derivation so a mistyped word fails in
    // milliseconds with a useful message, rather than after half a second of
    // PBKDF2 and then the same unhelpful "wrong" answer.
    if (!(await validateRecoveryPhrase(phrase))) {
        emit({ error: 'That recovery phrase is not valid. Check the words and their order.' });
        return false;
    }
    const ok = await unlockWithRecoveryPhrase(toVaultSettings(settings), phrase);
    if (ok) emit({ state: 'unlocked', error: null });
    return ok;
};

/** Lock now. Drops the key and closes the cache so nothing private is on disk. */
export const lock = (): void => {
    lockKeyring();
    // The account wrap key is derived from the account password and has no
    // on-disk form to wipe, so the only way to drop it is to drop the reference.
    // Locking the app is exactly the moment that reference should go: it is what
    // stands between "someone walked away from an unlocked session" and a key
    // that unlocks locked pages without a PIN.
    forgetAccountKey();
    // Clear before the state flips, while the query client is still reachable.
    // Order matters: the persister's `shouldDehydrateQuery` asks this module
    // whether the vault is open, so clearing after `lockKeyring` but before the
    // emit is what stops the last flush from writing the cache that was just
    // populated.
    clearPrivateCache();
    emit({ state: 'locked', error: null });
};

/**
 * Empty the on-device cache.
 *
 * The persisted copy is the largest plaintext store of this app's private data
 * outside the database -- every note and journal day the user has opened, in
 * IndexedDB, for twenty-four hours. Locking that does not also clear it would
 * mean the PIN protects the app and not the disk it sits on, which is the
 * distinction that matters for the scenario the PIN exists for.
 *
 * Registered by `main.tsx`, which is the only place with the query client to
 * hand. Optional so this module stays testable without one.
 */
let clearPrivateCacheImpl: (() => void) | null = null;

export const registerCacheClear = (clear: () => void): void => {
    clearPrivateCacheImpl = clear;
};

const clearPrivateCache = (): void => {
    try {
        clearPrivateCacheImpl?.();
    } catch (error) {
        // A cache that cannot be cleared is worth knowing about, but not worth
        // refusing to lock over: the lock itself has already happened.
        console.warn('Could not clear the on-device cache on lock', error);
    }
};

/** Whether the vault is currently open. */
export const isVaultOpen = (): boolean => isUnlocked();

/** The master key handle, for services that seal and open rows. */
export const vaultKey = (): CryptoKey | null => getMasterKey();

export interface EnableVaultResult {
    ok: boolean;
    error?: string;
    /** Shown once, and never again. This is the only time it exists. */
    recoveryPhrase?: string;
}

/**
 * Turn the vault on: generate the master key and a recovery phrase, and write
 * both wraps to `user_settings`.
 *
 * The caller is responsible for then sealing existing rows with the key that is
 * now in memory -- this only arms the vault. That split is deliberate: arming is
 * one write that either lands or does not, whereas sealing is a long walk over
 * every row the user has ever written, and those must not be one operation.
 */
export const enableVault = async (pin: string): Promise<EnableVaultResult> => {
    try {
        const recoveryPhrase = await generateRecoveryPhrase();
        const { provisioning } = await provisionVault(pin, recoveryPhrase);
        await writeProvisioning(provisioning);
        emit({ state: 'unlocked', error: null });
        return { ok: true, recoveryPhrase };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Could not turn on encryption.' };
    }
};

/**
 * Change the PIN. Re-wraps 32 bytes; no stored data is rewritten.
 *
 * No current-PIN prompt, and that is deliberate rather than a shortcut. Reaching
 * this screen already means the app is unlocked -- `AppLockGate` sits in front of
 * every route -- so the master key is in memory and there is nothing the old PIN
 * would be proving.
 *
 * What gates it is proving the old PIN first. Someone standing at an unlocked
 * device can reach this screen, and without that check they could set a PIN of
 * their own and hold the account's contents behind a secret the owner does not
 * have -- the one attack the whole feature exists to prevent. The recovery words
 * remain the way back for an owner who has genuinely forgotten it, and on
 * exhaustion of the PIN attempts the session ends rather than continuing, which
 * puts the attacker's next problem in front of the account password instead.
 */
export const changePin = async (
    currentPin: string,
    nextPin: string,
): Promise<{ ok: boolean; error?: string; attempts?: number; exhausted?: boolean }> => {
    const settings = await fetchUserSettings();
    if (!settings?.vault_enabled) return { ok: false, error: 'Encryption is not on.' };
    if (!getMasterKey()) {
        return { ok: false, error: 'Unlock the app first, then change the PIN.' };
    }

    const proof = await verifyCurrentPin(currentPin);
    if (!proof.ok) {
        return {
            ok: false,
            attempts: proof.attempts,
            exhausted: proof.exhausted,
            error: proof.error,
        };
    }

    return applyNewPin(settings, nextPin);
};

/**
 * Prove the current app PIN, counting the attempt server-side.
 *
 * The counter is the same `vault_failed_attempts` the lock screen uses, on
 * purpose. Sharing it means an attacker cannot buy three free guesses on the
 * change screen and then three more at the lock screen -- it is one ladder over
 * one account, and a successful unlock anywhere clears it.
 *
 * A wrong PIN here leaves the vault exactly as it was. `unlockWithPin` only
 * replaces the held key on success, so a failed proof is inert: the app stays
 * unlocked, the master key is untouched, and nothing is written except the two
 * counter columns.
 */
export const verifyCurrentPin = async (
    pin: string,
): Promise<{ ok: boolean; attempts: number; exhausted: boolean; error?: string }> => {
    const settings = await fetchUserSettings();
    if (!settings?.vault_enabled) return { ok: false, attempts: 0, exhausted: false };

    const wait = appRetryRemainingMs(settings as unknown as VaultSettings);
    if (wait > 0) {
        return {
            ok: false,
            attempts: settings.vault_failed_attempts ?? 0,
            exhausted: true,
            error: `Too many attempts. Try again in ${describeRetry(wait)}.`,
        };
    }

    if (await unlockWithPin(toVaultSettings(settings), pin)) {
        if ((settings.vault_failed_attempts ?? 0) > 0) {
            await updateUserSettings({
                ...settings,
                vault_failed_attempts: 0,
                vault_retry_after: null,
            } as unknown as UserSettings);
        }
        return { ok: true, attempts: 0, exhausted: false };
    }

    const attempts = (settings.vault_failed_attempts ?? 0) + 1;
    const backoff = retryAfterMs(attempts);
    await updateUserSettings({
        ...settings,
        vault_failed_attempts: attempts,
        vault_retry_after: backoff > 0 ? new Date(Date.now() + backoff).toISOString() : null,
    } as unknown as UserSettings);

    return {
        ok: false,
        attempts,
        exhausted: attempts >= FREE_ATTEMPTS,
        error: backoff > 0
            ? `That PIN is not right. Try again in ${describeRetry(backoff)}.`
            : 'That PIN is not right.',
    };
};

/** The rewrap-and-persist half, shared by both verification routes. */
const applyNewPin = async (
    settings: UserSettings,
    nextPin: string,
): Promise<{ ok: boolean; error?: string }> => {
    try {
        const wrapped = await rewrapMasterForPin(nextPin);
        await updateUserSettings({
            ...settings,
            ...wrapped,
            vault_pin_changed_at: new Date().toISOString(),
            // A PIN change is a successful act, so it clears any standing
            // throttle from earlier wrong guesses -- otherwise the owner could
            // correctly change their PIN and still find the new one refused.
            vault_failed_attempts: 0,
            vault_retry_after: null,
        } as unknown as UserSettings);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Could not change the PIN.' };
    }
};

/**
 * Change the PIN after proving the account password instead of the old PIN.
 *
 * The second route for someone who has genuinely forgotten it. The password is
 * checked by Supabase rather than against a local copy, so it is the real
 * credential and not the recovery verifier standing in for it.
 *
 * On failure the session ends. That is deliberate and it is the user's explicit
 * design: after the PIN attempts are exhausted, the honest thing to do with a
 * session that may be someone else's is to end it and put the account password
 * in front of them. It cannot be reset by refreshing -- the attempt counter is
 * in the settings row -- and it is not something a fumble can trigger on its own,
 * because the PIN ladder runs first and the password is only ever offered after
 * it.
 */
export const changePinWithAccountPassword = async (
    password: string,
    nextPin: string,
): Promise<{ ok: boolean; error?: string; signedOut?: boolean }> => {
    const settings = await fetchUserSettings();
    if (!settings?.vault_enabled) return { ok: false, error: 'Encryption is not on.' };
    if (!getMasterKey()) {
        return { ok: false, error: 'Unlock the app first, then change the PIN.' };
    }

    if (!await verifyAccountPassword(password)) {
        await endSession();
        return {
            ok: false,
            signedOut: true,
            error: 'That is not your account password. You have been signed out.',
        };
    }

    return applyNewPin(settings, nextPin);
};

/** End the session. Isolated so the reason it can happen lives in one place. */
const endSession = async (): Promise<void> => {
    try {
        await supabase.auth.signOut();
    } catch (error) {
        // A sign-out that fails to reach the server still clears the local
        // session, and reporting that as a failure would leave the UI claiming
        // the user is still signed in when they are not.
        console.warn('Sign-out did not complete cleanly', error);
    }
    // `lock` drops the key and empties the cache, which is the whole point: a
    // session that ends with the key still in memory has not really ended.
    lock();
};

/** Turn the vault off. Requires the key in memory, and warns about the payload. */
export const disableVault = async (): Promise<{ ok: boolean; error?: string }> => {
    const settings = await fetchUserSettings();
    if (!settings?.vault_enabled) return { ok: true };
    if (!isUnlocked()) return { ok: false, error: 'Unlock the app first.' };
    try {
        await updateUserSettings({
            ...settings,
            vault_enabled: false,
            vault_pin_wrapped: null,
            vault_pin_salt: null,
            vault_recovery_wrapped: null,
            vault_recovery_salt: null,
        } as unknown as UserSettings);
        lockKeyring();
        emit({ state: 'disabled', error: null });
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Could not turn encryption off.' };
    }
};

const writeProvisioning = async (provisioning: VaultProvisioning): Promise<void> => {
    const settings = await fetchUserSettings();
    if (!settings) throw new Error('No settings row to enable encryption on.');
    await updateUserSettings({ ...settings, ...provisioning } as unknown as UserSettings);
};

/**
 * Lock after a period of inactivity, and on backgrounding.
 *
 * Mounted once by `AppLockGate`. Deliberately counts activity rather than only
 * checking whether the document is visible: a user reading a long journal entry
 * is present but not moving a mouse, and locking them out mid-sentence is worse
 * than leaving a phone unlocked on a table for five minutes.
 */
export const useAutoLock = (enabled: boolean): void => {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const reset = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            if (getLockState() === 'unlocked') lock();
        }, idleLockMs);
    }, []);

    useEffect(() => {
        if (!enabled) return;

        reset();
        const events = ['pointerdown', 'keydown', 'visibilitychange', 'focus'] as const;
        for (const event of events) window.addEventListener(event, reset, { passive: true });

        // Backgrounding is its own rule, independent of the idle timer: a phone
        // pocketed for ten seconds is not the same as a phone left on a desk.
        const onHide = () => {
            if (document.visibilityState === 'hidden' && lockOnBackground && getLockState() === 'unlocked') {
                lock();
            }
        };
        document.addEventListener('visibilitychange', onHide);

        return () => {
            for (const event of events) window.removeEventListener(event, reset);
            document.removeEventListener('visibilitychange', onHide);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [enabled, reset]);
};

/** Local convenience for components that want a plain boolean. */
export const useIsUnlocked = (): boolean => useAppLock().state === 'unlocked';

