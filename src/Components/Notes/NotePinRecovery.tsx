import React, { useState } from 'react';
import { KeyRound, AlertTriangle } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { establishAccountKey, forgetAccountKey, resetNotePin } from '../../services/noteService';
import { hasAccountRecovery } from '../../services/vault/accountRecovery';
import { fetchUserSettings } from '../../services/profileService';
import { MIN_NOTE_PIN_LENGTH } from '../../services/vault/noteLock';

/**
 * Replace a page PIN that has been forgotten.
 *
 * The point of this dialog is that a forgotten PIN is an inconvenience rather
 * than a loss. That only works because the note's key is wrapped under the
 * account password as well as the PIN, so recovery is a re-wrap: the account
 * password unwraps the key, the key is wrapped under a new PIN, and the page's
 * ciphertext is never opened. There is no point at which the text exists
 * unprotected, and nothing has to be re-encrypted.
 *
 * WHY A WRONG PASSWORD ENDS THE SESSION
 *
 * A wrong account password means either a typo or a different person at the
 * keyboard. The app cannot tell those apart, so it does not guess: it signs out.
 * Continuing to leave somebody else's hands on a page whose contents they cannot
 * read is the failure this is guarding against -- an unattended session that
 * looks like it is still being used by its owner.
 *
 * THAT ENDS UP BEING A RECOVERY ROUTE TOO
 *
 * Signing out and back in re-establishes the session, and the next sign-in is a
 * successful `signInWithPassword`. So the honest way back after a lockout is to
 * sign out and sign in with the real password -- which is what a user who has
 * genuinely forgotten their account password needs anyway, and is why this does
 * not attempt to be a softer alternative.
 */

interface NotePinRecoveryProps {
    noteId: string;
    onDone: () => void;
    onBack: () => void;
}

type Stage = 'password' | 'pin' | 'confirm';

const NotePinRecovery: React.FC<NotePinRecoveryProps> = ({ noteId, onDone, onBack }) => {
    const [stage, setStage] = useState<Stage>('password');
    const [password, setPassword] = useState('');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [recoveryOff, setRecoveryOff] = useState(false);

    React.useEffect(() => {
        void fetchUserSettings()
            .then(settings => setRecoveryOff(!hasAccountRecovery(settings)))
            .catch(() => setRecoveryOff(true));
    }, []);

    const verify = async () => {
        setBusy(true);
        setError(null);
        try {
            // Establishes the session key first, so a correct password is
            // proven once here rather than twice in resetNotePin.
            const ok = await establishAccountKey(password);
            if (!ok) {
                // Not a typo we should shrug off: sign out and let the session be
                // re-established with the real credentials.
                forgetAccountKey();
                await supabase.auth.signOut();
                setError('That is not your account password, so you have been signed out. Sign in again to continue.');
                setStage('password');
                return;
            }
            setPassword('');
            setStage('pin');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not verify your account password.');
        } finally {
            setBusy(false);
        }
    };

    const reset = async () => {
        setBusy(true);
        setError(null);
        try {
            await resetNotePin(noteId, password, pin);
            forgetAccountKey();
            onDone();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not reset that PIN.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="vault-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="note-pin-recovery-title">
            <div className="vault-modal">
                <div className="vault-lock-icon" aria-hidden="true"><KeyRound size={24} /></div>
                <h2 id="note-pin-recovery-title" className="vault-lock-title">Reset this page&rsquo;s PIN</h2>

                {recoveryOff ? (
                    <div className="vault-warning">
                        <AlertTriangle size={18} aria-hidden="true" />
                        <div>
                            <strong>Page recovery is not set up.</strong>
                            <p className="vault-lock-hint">
                                Turning it on in Settings lets a forgotten page PIN be replaced
                                with your account password. Without it, a forgotten PIN means
                                the page cannot be opened again.
                            </p>
                        </div>
                    </div>
                ) : stage === 'password' ? (
                    <>
                        <p className="vault-lock-hint">
                            Confirm your account password to replace this page&rsquo;s PIN. The
                            page itself is never decrypted -- only the key protecting it moves.
                        </p>
                        <label className="form-label" htmlFor="note-recovery-password">
                            Account password
                        </label>
                        <div className="t-input-wrap">
                            <div className="t-input">
                                <input
                                    id="note-recovery-password"
                                    className="form-control"
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                />
                            </div>
                        </div>
                        <p className="vault-lock-hint">
                            A wrong password signs you out. That is deliberate: the app
                            cannot tell a typo from somebody else at the keyboard.
                        </p>
                    </>
                ) : (
                    <>
                        <p className="vault-lock-hint">
                            Password confirmed. Choose a new PIN for this page.
                        </p>
                        <label className="form-label" htmlFor="note-recovery-pin">New PIN</label>
                        <div className="t-input-wrap">
                            <div className="t-input">
                                <input
                                    id="note-recovery-pin"
                                    className="form-control"
                                    type="password"
                                    value={pin}
                                    onChange={e => setPin(e.target.value)}
                                    inputMode="numeric"
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>
                        <label className="form-label" htmlFor="note-recovery-confirm">Type it again</label>
                        <div className="t-input-wrap">
                            <div className="t-input">
                                <input
                                    id="note-recovery-confirm"
                                    className="form-control"
                                    type="password"
                                    value={confirmPin}
                                    onChange={e => setConfirmPin(e.target.value)}
                                    inputMode="numeric"
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>
                        {pin && confirmPin && pin !== confirmPin && (
                            <p className="t-error-msg" role="alert">Those do not match.</p>
                        )}
                    </>
                )}

                {error && <p className="t-error-msg" role="alert">{error}</p>}

                <div className="vault-setup-actions">
                    {!recoveryOff && (
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busy || (stage === 'password' ? !password : pin.length < MIN_NOTE_PIN_LENGTH || pin !== confirmPin)}
                            onClick={() => void (stage === 'password' ? verify() : reset())}
                        >
                            {busy ? 'Working...' : stage === 'password' ? 'Confirm' : 'Reset PIN'}
                        </button>
                    )}
                    <button type="button" className="btn btn-link" onClick={onBack}>Back</button>
                </div>
            </div>
        </div>
    );
};

export default NotePinRecovery;