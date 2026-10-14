import React, { useRef, useState } from 'react';
import { describeRetry } from '../../services/vault/keyring';
import { MIN_NOTE_PIN_LENGTH } from '../../services/vault/noteLock';
import { useNotice } from '../Feedback/useNotice';
import type { Note } from '../../services/noteService';

/**
 * Set or remove the PIN on one page.
 *
 * Built from `auth-card` on purpose: this is a form asking for a secret, which is
 * exactly what the login and register forms are. It previously rendered in its own
 * `vault-modal` vocabulary, and because `.btn-primary` was only ever defined as
 * `.auth-card .btn-primary`, its buttons came out completely unstyled -- a bare
 * grey browser button sitting under a styled form. Sharing the auth card fixes
 * that by construction rather than by adding the missing rules again elsewhere.
 *
 * A real `<form>`, not a `<div>` with a button. Two reasons and both of them
 * showed up: the browser logged "Password field is not contained in a form" for
 * every one of these inputs, and pressing Enter in a PIN field did nothing --
 * because there was no form for it to submit. Every PIN in this dialog is
 * `type="password"` so it is masked and excluded from autofill's suggestions,
 * which is what the warning was about.
 *
 * Errors go to the notice stack at the top of the screen rather than to a block
 * inside this card. An error next to the field that caused it has to be looked
 * for; one in a fixed place does not. See `NoticeProvider`.
 */

export type NoteLockMode = 'on' | 'off';

interface NotePinDialogProps {
    note: Note;
    mode: NoteLockMode;
    /** Consecutive failed attempts already recorded on the row. */
    failedAttempts: number;
    onClose: () => void;
    /**
     * Empty string means "remove the lock". The caller owns the write, because it
     * also has to flush the pending autosave first -- a dialog that sealed the
     * page itself would race that timer and write stale text back over the new
     * key.
     */
    onSubmit: (pin: string) => Promise<void>;
}

const NotePinDialog: React.FC<NotePinDialogProps> = ({
    note, mode, onClose, onSubmit,
}) => {
    const [pin, setPin] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const { notify } = useNotice();

    /**
     * Whether this dialog is still on screen.
     *
     * The submit is a round trip that can outlive the dialog -- a failed lock
     * closes it in some flows, and a slow network can leave the user tapping
     * Cancel after the write has already gone out. Without this, the `finally`
     * below calls `setBusy` on a component React has already thrown away, which
     * is the "Can't perform a React state update on a component that hasn't
     * mounted yet" warning this component was producing.
     *
     * A ref rather than state: reading it must not itself schedule a render, and
     * the value is only ever consulted from an async continuation.
     */
    const mounted = useRef(true);
    React.useEffect(() => () => { mounted.current = false; }, []);

    // Read the persisted deadline on mount rather than deriving it from local
    // state, so a reload cannot reset how many attempts have already failed.
    const [wait] = useState(() => {
        const until = note.lock_retry_after;
        if (!until) return 0;
        return Math.max(0, new Date(until).getTime() - Date.now());
    });

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();

        // Mismatched PINs are a validation message, not a failure of anything, so
        // they stay with the field. Everything else is a real error and goes to
        // the one place errors go.
        if (mode === 'on' && pin !== confirm) {
            notify('error', 'Those PINs do not match.');
            return;
        }

        if (mode === 'on' && pin.length < MIN_NOTE_PIN_LENGTH) {
            notify('error', `A page PIN needs at least ${MIN_NOTE_PIN_LENGTH} digits.`);
            return;
        }

        if (mounted.current) setBusy(true);
        try {
            await onSubmit(mode === 'off' ? '' : pin);
            // Nothing is reported on success here: the editor that opened this
            // dialog raises its own confirmation, and two messages for one
            // action is one too many.
        } catch (err) {
            notify('error', err instanceof Error ? err.message : 'Could not update the PIN.');
        } finally {
            if (mounted.current) setBusy(false);
        }
    };

    const disabled = busy || wait > 0
        || (mode === 'on' && (pin.length < MIN_NOTE_PIN_LENGTH || pin !== confirm));

    return (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="note-lock-title">
            <form className="auth-card auth-card-narrow" onSubmit={submit}>
                <h2 id="note-lock-title" className="auth-title">
                    {mode === 'off' ? 'Remove this PIN?' : 'Lock this page'}
                </h2>
                <p className="auth-text auth-text-muted mb-3">
                    {mode === 'off'
                        ? <>
                            {note.title || 'This page'} becomes readable without a PIN. Its
                            contents stay encrypted as they are.
                        </>
                        : <>
                            Its contents stop showing until this PIN is entered.
                        </>}
                </p>

                {wait > 0 ? (
                    <p className="t-error-msg mb-3" role="alert">
                        Too many attempts. Try again in {describeRetry(wait)}.
                    </p>
                ) : mode === 'on' ? (
                    <>
                        <div className="mb-3 text-start">
                            <label htmlFor="note-pin" className="form-label">PIN</label>
                            <input
                                id="note-pin"
                                className="form-control"
                                type="password"
                                inputMode="numeric"
                                autoComplete="new-password"
                                aria-autocomplete="none"
                                placeholder={`At least ${MIN_NOTE_PIN_LENGTH} digits`}
                                value={pin}
                                onChange={e => setPin(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="mb-3 text-start">
                            <label htmlFor="note-pin-confirm" className="form-label">Confirm PIN</label>
                            <input
                                id="note-pin-confirm"
                                className={`form-control${pin && confirm && pin !== confirm ? ' is-invalid' : ''}`}
                                type="password"
                                inputMode="numeric"
                                autoComplete="new-password"
                                aria-autocomplete="none"
                                aria-invalid={Boolean(pin && confirm && pin !== confirm)}
                                placeholder="Type it again"
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                            />
                            {pin && confirm && pin !== confirm && (
                                <p className="t-error-msg">Those do not match.</p>
                            )}
                        </div>
                    </>
                ) : null}

                <button type="submit" className="btn-primary w-100" disabled={disabled}>
                    {busy
                        ? (mode === 'off' ? 'Removing...' : 'Locking...')
                        : (mode === 'off' ? 'Remove PIN' : 'Lock page')}
                </button>
                <button type="button" className="btn-link w-100" onClick={onClose}>
                    Cancel
                </button>
            </form>
        </div>
    );
};

export default NotePinDialog;


