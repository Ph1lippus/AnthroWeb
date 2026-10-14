import React, { useState } from 'react';
import { describeRetry } from '../../services/vault/keyring';
import { MIN_NOTE_PIN_LENGTH } from '../../services/vault/noteLock';
import { hasAccountKey } from '../../services/noteService';
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
 * The icon that sat above the title is gone. On a card this narrow it pushed the
 * form down and repeated what the title already said.
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
    onSubmit: (pin: string, accountPassword?: string) => Promise<void>;
}

const NotePinDialog: React.FC<NotePinDialogProps> = ({
    note, mode, onClose, onSubmit,
}) => {
    const [pin, setPin] = useState('');
    const [confirm, setConfirm] = useState('');
    const [accountPassword, setAccountPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    /**
     * Whether this lock needs the account password.
     *
     * Asked for once, on the first page locked in a session, and never again
     * after that -- the derived key is held in memory for the rest of it. There
     * used to be a toggle for this in Settings that had to be found *before*
     * locking anything, and missing it meant the "Forgot your PIN?" link on the
     * lock pad -- the only place anyone would look -- dead-ended.
     *
     * Framed as what it is: not a setting to configure, but the thing that makes
     * this page recoverable if the PIN is forgotten.
     */
    const [needsAccountPassword, setNeedsAccountPassword] = useState(!hasAccountKey());

    // Read the persisted deadline on mount rather than deriving it from local
    // state, so a reload cannot reset how many attempts have already failed.
    const [wait] = useState(() => {
        const until = note.lock_retry_after;
        if (!until) return 0;
        return Math.max(0, new Date(until).getTime() - Date.now());
    });

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            await onSubmit(mode === 'off' ? '' : pin, needsAccountPassword ? accountPassword : undefined);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not update the PIN.');
            setBusy(false);
        }
    };

    if (mode === 'off') {
        return (
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="note-unlock-title">
                <div className="auth-card auth-card-narrow">
                    <h2 id="note-unlock-title" className="auth-title">Remove this PIN?</h2>
                    <p className="auth-text auth-text-muted mb-3">
                        {note.title || 'This page'} becomes readable without a PIN. Its
                        contents stay encrypted as they are.
                    </p>
                    {error && <div className="auth-error">{error}</div>}
                    <button
                        type="button"
                        className="btn-primary w-100"
                        disabled={busy}
                        onClick={() => void submit()}
                    >
                        {busy ? 'Removing...' : 'Remove PIN'}
                    </button>
                    <button type="button" className="btn-link w-100" onClick={onClose}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="note-lock-title">
            <div className="auth-card auth-card-narrow">
                <h2 id="note-lock-title" className="auth-title">Lock this page</h2>
                <p className="auth-text auth-text-muted mb-3">
                    Its title and contents stop showing until this PIN is entered.
                </p>

                {error && <div className="auth-error">{error}</div>}

                {wait > 0 ? (
                    <p className="t-error-msg mb-3" role="alert">
                        Too many attempts. Try again in {describeRetry(wait)}.
                    </p>
                ) : (
                    <>
                        <div className="mb-3 text-start">
                            <label htmlFor="note-pin" className="form-label">PIN</label>
                            <div className="t-input-wrap">
                                <div className="t-input">
                                    <input
                                        id="note-pin"
                                        className="form-control"
                                        type="password"
                                        inputMode="numeric"
                                        autoComplete="new-password"
                                        placeholder={`At least ${MIN_NOTE_PIN_LENGTH} digits`}
                                        value={pin}
                                        onChange={e => { setPin(e.target.value); setError(null); }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mb-3 text-start">
                            <label htmlFor="note-pin-confirm" className="form-label">Confirm PIN</label>
                            <div className="t-input-wrap">
                                <div className={`t-input ${pin && confirm && pin !== confirm ? 'is-error' : ''}`}>
                                    <input
                                        id="note-pin-confirm"
                                        className="form-control"
                                        type="password"
                                        inputMode="numeric"
                                        autoComplete="new-password"
                                        placeholder="Type it again"
                                        value={confirm}
                                        onChange={e => { setConfirm(e.target.value); setError(null); }}
                                    />
                                </div>
                                {pin && confirm && pin !== confirm && (
                                    <p className="t-error-msg">Those do not match.</p>
                                )}
                            </div>

                            {/*
                                Asked once per session, on the first page locked,
                                and only because it is what makes "Forgot your
                                PIN?" on the lock pad able to do anything. Framed as
                                part of locking this page rather than as a setting
                                to go and find, which is where this used to live
                                and where nobody looked.
                            */}
                            {needsAccountPassword && (
                                <div className="t-field">
                                    <label className="t-label" htmlFor="note-lock-account-password">
                                        Your account password
                                    </label>
                                    <div className="t-input-wrap">
                                        <div className="t-input">
                                            <input
                                                id="note-lock-account-password"
                                                type="password"
                                                value={accountPassword}
                                                onChange={e => { setAccountPassword(e.target.value); setError(null); }}
                                                autoComplete="current-password"
                                                placeholder="So you can recover this page"
                                            />
                                        </div>
                                    </div>
                                    <p className="t-hint">
                                        Only asked the first time you lock a page. It is
                                        checked by the sign-in server and never stored
                                        here &mdash; what gets saved only proves a correct
                                        password without revealing it.
                                    </p>
                                    {needsAccountPassword && accountPassword.length === 0 && (
                                        <button
                                            type="button"
                                            className="btn-link"
                                            onClick={() => setNeedsAccountPassword(false)}
                                        >
                                            Skip &mdash; this page cannot be recovered if I forget the PIN
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}

                <button
                    type="button"
                    className="btn-primary w-100"
                    disabled={busy || wait > 0 || pin.length < MIN_NOTE_PIN_LENGTH || pin !== confirm}
                    onClick={() => void submit()}
                >
                    {busy ? 'Locking...' : 'Lock page'}
                </button>
                <button type="button" className="btn-link w-100" onClick={onClose}>
                    Cancel
                </button>
            </div>
        </div>
    );
};

export default NotePinDialog;