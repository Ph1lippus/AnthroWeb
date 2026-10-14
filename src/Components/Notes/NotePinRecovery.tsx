import React, { useRef, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { MIN_NOTE_PIN_LENGTH } from '../../services/vault/noteLock';
import { forgetAccountKey, resetNotePin } from '../../services/noteService';
import { useNotice } from '../Feedback/useNotice';

interface NotePinRecoveryProps {
    noteId: string;
    onDone: () => void;
    onBack: () => void;
}

/**
 * "Forgot your PIN?" on the lock pad.
 *
 * A forgotten page PIN is answered here and nowhere else -- no Settings toggle,
 * no hidden section, nothing to have found beforehand. Locking a page no longer
 * asks for the account password, precisely so that this is the only moment
 * anybody types it, and the only moment they are asked for it is when they have
 * already said they cannot get in.
 *
 * ONE STEP, NOT TWO
 *
 * It used to confirm the password first and then ask for the new PIN. That put
 * a correctly-typed password behind a step where the only outcome was "now do
 * the same thing again", and it needed the account key to be *already*
 * established -- which it was not, because locking had never asked for the
 * password. `establishAccountKey` therefore returned false for a perfectly good
 * password, and this screen treated that as a wrong one and signed the user out.
 *
 * Both fields are now collected together and handed to `resetNotePin`, which
 * verifies the password against the sign-in server itself and reports the
 * difference between "wrong" and "no way to reach this page" honestly.
 *
 * A wrong password still signs out. That is not a punishment for mistyping: the
 * app cannot tell a typo from somebody else at the keyboard, and the counter
 * backing the decision lives on the server, so there is nothing on the client
 * that a reload would not reset.
 */
const NotePinRecovery: React.FC<NotePinRecoveryProps> = ({ noteId, onDone, onBack }) => {
    const [password, setPassword] = useState('');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [busy, setBusy] = useState(false);
    const { notify } = useNotice();

    /**
     * Whether this dialog is still on screen.
     *
     * `resetNotePin` is a network round trip that can be followed by a sign-out
     * and a navigation. Without this the `finally` below calls `setBusy` on a
     * component React has already discarded -- the "state update on a component
     * that hasn't mounted yet" warning, raised by the very screen that exists to
     * get a locked page back open.
     */
    const mounted = useRef(true);
    React.useEffect(() => () => { mounted.current = false; }, []);

    const reset = async (event: React.FormEvent) => {
        event.preventDefault();

        if (pin !== confirmPin) {
            notify('error', 'Those PINs do not match.');
            return;
        }
        if (pin.length < MIN_NOTE_PIN_LENGTH) {
            notify('error', `A page PIN needs at least ${MIN_NOTE_PIN_LENGTH} digits.`);
            return;
        }

        if (mounted.current) setBusy(true);
        try {
            await resetNotePin(noteId, password, pin);
            forgetAccountKey();
            // The password has done its job. Held in component state it would
            // outlive the dialog in any snapshot of the tree, and in a
            // password field it is one autofill away from being put back.
            setPassword('');
            notify('success', 'PIN reset. This page has a new PIN.');
            onDone();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not reset that PIN.';

            if (/not your account password/i.test(message)) {
                notify('error', message);
                forgetAccountKey();
                await supabase.auth.signOut();
                return;
            }
            notify('error', message);
        } finally {
            if (mounted.current) setBusy(false);
        }
    };

    const disabled = busy || password.length === 0
        || pin.length < MIN_NOTE_PIN_LENGTH || pin !== confirmPin;

    return (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="note-pin-recovery-title">
            <form className="auth-card auth-card-narrow" onSubmit={reset}>
                <h2 id="note-pin-recovery-title" className="auth-title">Reset this page&rsquo;s PIN</h2>

                <p className="auth-text auth-text-muted mb-3">
                    Confirm your account password and choose a new PIN. The page is
                    never decrypted &mdash; only the key protecting it moves.
                </p>

                <div className="mb-3 text-start">
                    <label className="form-label" htmlFor="note-recovery-password">
                        Account password
                    </label>
                    <input
                        id="note-recovery-password"
                        className="form-control"
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete="current-password"
                        autoFocus
                    />
                    <p className="auth-text auth-text-muted">
                        A wrong password signs you out. The app cannot tell a typo from
                        somebody else at the keyboard.
                    </p>
                </div>

                <div className="mb-3 text-start">
                    <label className="form-label" htmlFor="note-recovery-pin">New PIN</label>
                    <input
                        id="note-recovery-pin"
                        className={`form-control${pin && confirmPin && pin !== confirmPin ? ' is-invalid' : ''}`}
                        type="password"
                        value={pin}
                        onChange={e => setPin(e.target.value)}
                        inputMode="numeric"
                        autoComplete="new-password"
                        aria-autocomplete="none"
                        aria-invalid={Boolean(pin && confirmPin && pin !== confirmPin)}
                        placeholder={`At least ${MIN_NOTE_PIN_LENGTH} digits`}
                    />
                </div>

                <div className="mb-3 text-start">
                    <label className="form-label" htmlFor="note-recovery-confirm">Confirm PIN</label>
                    <input
                        id="note-recovery-confirm"
                        className="form-control"
                        type="password"
                        value={confirmPin}
                        onChange={e => setConfirmPin(e.target.value)}
                        inputMode="numeric"
                        autoComplete="new-password"
                        aria-autocomplete="none"
                    />
                    {pin && confirmPin && pin !== confirmPin && (
                        <p className="t-error-msg">Those do not match.</p>
                    )}
                </div>

                <div className="vault-setup-actions">
                    <button type="submit" className="btn-primary w-100" disabled={disabled}>
                        {busy ? 'Working...' : 'Reset PIN'}
                    </button>
                    <button type="button" className="btn-link w-100" onClick={onBack}>Back</button>
                </div>
            </form>
        </div>
    );
};

export default NotePinRecovery;
