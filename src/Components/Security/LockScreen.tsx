import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Delete, AlertTriangle } from 'lucide-react';
import { unlock, unlockWithRecovery } from '../../hooks/useAppLock';
import { BACKOFF_MS, RECOVERY_WORDS } from '../../services/vault/keyring';

/**
 * The lock screen.
 *
 * This is the only thing standing between someone who picks up an unlocked
 * device and everything in the app, so its failure modes matter more than its
 * appearance. Three, in order of how much they would hurt:
 *
 *  - It must not leak the journal behind it. Nothing is rendered until the
 *    keyring is open; there is no "peek" state and no blurred preview.
 *  - It must not be defeatable by patience, so failed attempts back off.
 *  - It must not be the way someone loses their data. The recovery phrase is
 *    reachable from here, because a lock you cannot get back into is the same
 *    outcome as having no lock at all.
 *
 * The keypad is a `<button>` grid rather than a real `<input type=password>`:
 * a hidden input still receives synthetic keystrokes from password managers and
 * from accessibility tooling, and `inputMode="numeric"` on a visible field lets a
 * phone offer the right keyboard without inviting autofill into a field that is
 * not a password field for the site's accounts.
 */

const PIN_LENGTH = 6;

/**
 * Backoff after a wrong PIN.
 *
 * The schedule lives in the keyring and is shared with per-note PINs. This is not
 * a strong defence -- the real cost per attempt is the 600,000-iteration key
 * derivation, which happens whether or not the UI waits -- but it turns a
 * machine-gun attempt into something a person cannot keep doing, and it costs
 * almost nothing.
 */

interface LockScreenProps {
    /** Shown under the title. */
    username?: string | null;
    onRecoveryPhrase: () => void;
}

const LockScreen: React.FC<LockScreenProps> = ({ username, onRecoveryPhrase }) => {
    const [entry, setEntry] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [cooldown, setCooldown] = useState(0);
    const [useRecovery, setUseRecovery] = useState(false);

    // Count the cooldown down so the remaining wait is visible rather than the
    // keypad simply being dead -- a keypad that does nothing looks broken, and a
    // lock screen is exactly where someone will assume it is.
    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setInterval(() => setCooldown(value => Math.max(0, value - 1000)), 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    const submit = useCallback(async (value: string) => {
        if (busy || cooldown > 0) return;
        setBusy(true);
        setError(null);
        try {
            const ok = useRecovery ? await unlockWithRecovery(value) : await unlock(value);
            if (!ok) {
                const next = attempts + 1;
                setAttempts(next);
                const wait = BACKOFF_MS[Math.min(next, BACKOFF_MS.length - 1)];
                if (wait > 0) setCooldown(wait);
                setError(useRecovery ? 'That recovery phrase did not work.' : 'That PIN is not right.');
                setEntry('');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not unlock.');
            setEntry('');
        } finally {
            setBusy(false);
        }
    }, [attempts, busy, cooldown, useRecovery]);

    const press = (digit: string) => {
        if (busy || cooldown > 0) return;
        setError(null);
        const next = useRecovery
            ? `${entry}${entry ? ' ' : ''}${digit.toLowerCase()}`
            : (entry + digit).slice(0, PIN_LENGTH);
        setEntry(next);

        // Submit as soon as there is enough to be worth trying. Auto-submit on the
        // last digit is what makes a PIN feel like a lock rather than a form.
        if (!useRecovery && next.length === PIN_LENGTH) void submit(next);
    };

    const backspace = () => {
        if (busy || cooldown > 0) return;
        setError(null);
        setEntry(value => (useRecovery ? value.replace(/\S+\s?$/, '') : value.slice(0, -1)));
    };

    const dots = useMemo(
        () => Array.from({ length: PIN_LENGTH }, (_, i) => i < entry.length),
        [entry],
    );

    const recoveryProgress = entry.trim() ? entry.trim().split(/\s+/).length : 0;

    return (
        <div className="vault-lock-screen" role="dialog" aria-modal="true" aria-labelledby="vault-lock-title">
            <div className="vault-lock-card">
                <div className="vault-lock-icon" aria-hidden="true">
                    <ShieldCheck size={30} />
                </div>
                <h1 id="vault-lock-title" className="vault-lock-title">AnthroWeb is locked</h1>
                {username && <p className="vault-lock-subtitle">Signed in as {username}</p>}

                {useRecovery ? (
                    <div className="vault-lock-recovery">
                        <label htmlFor="vault-recovery-input" className="form-label">
                            Recovery phrase
                        </label>
                        <p className="vault-lock-hint">
                            The {RECOVERY_WORDS} words you were given when you turned on encryption.
                        </p>
                        <textarea
                            id="vault-recovery-input"
                            className="form-control"
                            value={entry}
                            onChange={e => setEntry(e.target.value)}
                            placeholder="word word word ..."
                            rows={3}
                            autoComplete="off"
                            spellCheck={false}
                            autoCapitalize="none"
                            autoCorrect="off"
                        />
                        <p className="vault-lock-progress">
                            {recoveryProgress} of {RECOVERY_WORDS} words
                        </p>
                        <button
                            type="button"
                            className="btn-primary"
                            disabled={busy || cooldown > 0 || recoveryProgress === 0}
                            onClick={() => void submit(entry)}
                        >
                            {busy ? 'Unlocking...' : 'Unlock'}
                        </button>
                        <button
                            type="button"
                            className="btn-link"
                            onClick={() => { setUseRecovery(false); setEntry(''); setError(null); }}
                        >
                            Use your PIN instead
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="vault-lock-dots" role="status" aria-label={`${entry.length} of ${PIN_LENGTH} digits entered`}>
                            {dots.map((filled, i) => (
                                <span key={i} className={`vault-lock-dot${filled ? ' vault-lock-dot--filled' : ''}`} />
                            ))}
                        </div>

                        <div className="vault-lock-pad">
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
                                <button
                                    key={digit}
                                    type="button"
                                    className="vault-lock-key"
                                    onClick={() => press(digit)}
                                    disabled={busy || cooldown > 0}
                                >
                                    {digit}
                                </button>
                            ))}
                            <button
                                type="button"
                                className="vault-lock-key vault-lock-key--muted"
                                onClick={onRecoveryPhrase}
                                disabled={busy || cooldown > 0}
                                data-tip="Use a recovery phrase"
                            >
                                <span className="sr-only">Use a recovery phrase</span>
                                <KeyIcon />
                            </button>
                            <button
                                type="button"
                                className="vault-lock-key"
                                onClick={() => press('0')}
                                disabled={busy || cooldown > 0}
                            >
                                0
                            </button>
                            <button
                                type="button"
                                className="vault-lock-key vault-lock-key--muted"
                                onClick={backspace}
                                disabled={busy || cooldown > 0 || entry.length === 0}
                                data-tip="Delete"
                            >
                                <Delete size={20} />
                                <span className="sr-only">Delete</span>
                            </button>
                        </div>
                    </>
                )}

                {error && (
                    <p className="t-error-msg" role="alert">
                        <AlertTriangle size={15} aria-hidden="true" />
                        {cooldown > 0 ? `${error} Try again in ${Math.ceil(cooldown / 1000)}s.` : error}
                    </p>
                )}

                <button
                    type="button"
                    className="btn-link"
                    onClick={() => { setUseRecovery(true); setEntry(''); setError(null); }}
                    disabled={busy || useRecovery}
                >
                    Forgot your PIN?
                </button>
            </div>
        </div>
    );
};

/** A small key glyph, for the recovery-phrase key on the pad. */
const KeyIcon: React.FC = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="8" cy="15" r="3.5" />
        <path d="M10.8 12.2 20 3m-3 3 2 2m-5 1 2 2" strokeLinecap="round" />
    </svg>
);

export default LockScreen;