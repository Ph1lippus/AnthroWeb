import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
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
 * A REAL INPUT, NOT A GRID OF DIGIT BUTTONS
 *
 * This was a 3x4 `<button>` grid, and the comment above it explained why: "a
 * hidden input still receives synthetic keystrokes from password managers". True,
 * and paid for with something much more expensive -- the screen could only be
 * operated by clicking. No hardware keyboard, no Bluetooth keyboard, no switch,
 * no screen reader driving the caret, and no paste. Everyone who types their PIN
 * rather than taps it was locked out of the lock screen, which is the one screen
 * where being locked out is not a mild inconvenience.
 *
 * What the grid was actually buying is two things, and both survive in a real
 * field: `inputMode="numeric"` still gets a phone its number pad, and
 * `autoComplete="new-password"` still keeps the value out of a password
 * manager's suggestions and out of a dictation path into a field that is not one
 * of the site's accounts. Digits-only is a `replace(/\D/g, '')` on change rather
 * than something the markup prevents, which is a weaker guarantee stated in a
 * place that cannot silently rot.
 *
 * Auto-submits on the sixth digit, which is the same rule the page PIN uses and
 * the reason this reads as a lock rather than a form.
 *
 * The key glyph that shared a cell with `0` opened the recovery-phrase dialog.
 * It is a link beside the PIN field now, so nothing it could do has been lost.
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
    // field simply being dead -- a field that refuses input with no reason reads
    // as broken, and a lock screen is exactly where someone will assume it is.
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

    const type = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (busy || cooldown > 0) return;
        setError(null);
        const next = event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH);
        setEntry(next);

        // Submit as soon as there is enough to be worth trying. Auto-submit on the
        // last digit is what makes a PIN feel like a lock rather than a form.
        if (next.length === PIN_LENGTH) void submit(next);
    };

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
                    <div className="vault-lock-fields">
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
                    <div className="vault-lock-fields">
                        <label htmlFor="vault-pin-input" className="sr-only">App PIN</label>
                        <input
                            id="vault-pin-input"
                            className="vault-lock-input"
                            type="password"
                            inputMode="numeric"
                            autoComplete="new-password"
                            aria-autocomplete="none"
                            spellCheck={false}
                            maxLength={PIN_LENGTH}
                            placeholder={`${PIN_LENGTH}-digit PIN`}
                            value={entry}
                            onChange={type}
                            disabled={busy || cooldown > 0}
                            autoFocus
                        />
                        <div className="vault-lock-actions">
                            <button
                                type="button"
                                className="vault-lock-link"
                                onClick={onRecoveryPhrase}
                                disabled={busy || cooldown > 0}
                            >
                                Show my recovery words
                            </button>
                        </div>
                    </div>
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

export default LockScreen;