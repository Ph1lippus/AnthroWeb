import React, { useState } from 'react';
import { Lock, Unlock, TriangleAlert, Check } from 'lucide-react';
import { MIN_PIN_LENGTH } from '../../services/vault/keyring';
import { assertNotePin, retryAfterMs } from '../../services/vault/noteLock';
import type { Note } from '../../services/noteService';

/**
 * Set or remove a note's own PIN.
 *
 * Separate from the app lock because it answers a different question. The app
 * lock is "is this person allowed into the app at all"; this is "is this person
 * allowed to read *this page*", which is the case where the device is shared and
 * the app is unlocked legitimately.
 *
 * Which is why the dialog says plainly that locking a page does nothing while the
 * app is unlocked. It would be dishonest to let someone lock a page believing it
 * is hidden from someone who has the app PIN -- it is not, and the note key is
 * deliberately wrapped under the master key so that an unlocked app reads locked
 * notes without a prompt. The lock protects the page from a glance in the
 * sidebar, from someone opening the app on a shared device, and from the title
 * being visible at all.
 */

export type NoteLockMode = 'on' | 'off';

interface NotePinDialogProps {
    note: Note;
    mode: NoteLockMode;
    /** Attempts already made, for the backoff display. */
    failedAttempts?: number;
    onClose: () => void;
    onSubmit: (pin: string) => Promise<void>;
}

const NotePinDialog: React.FC<NotePinDialogProps> = ({ note, mode, failedAttempts = 0, onClose, onSubmit }) => {
    const [pin, setPin] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const wait = retryAfterMs(failedAttempts);

    const submit = async () => {
        setError(null);
        try {
            assertNotePin(pin);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'That PIN is too short.');
            return;
        }
        if (pin !== confirm) {
            setError('Those do not match.');
            return;
        }
        setBusy(true);
        try {
            await onSubmit(pin);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not lock this page.');
        } finally {
            setBusy(false);
        }
    };

    if (mode === 'off') {
        return (
            <div className="vault-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="note-unlock-title">
                <div className="vault-modal">
                    <div className="vault-lock-icon" aria-hidden="true"><Unlock size={24} /></div>
                    <h2 id="note-unlock-title" className="vault-lock-title">Remove this page&apos;s PIN?</h2>
                    <p>
                        &ldquo;{note.title || 'Untitled'}&rdquo; will be readable from the
                        sidebar and the editor without a PIN. Its contents stay
                        encrypted on disk exactly as they are now -- this only removes
                        the extra prompt.
                    </p>
                    <div className="vault-setup-actions">
                        <button
                            type="button"
                            className="btn-action vault-lock-danger"
                            disabled={busy}
                            onClick={() => void onSubmit('')}
                        >
                            {busy ? 'Removing...' : 'Remove PIN'}
                        </button>
                        <button type="button" className="btn-action vault-lock-link" onClick={onClose}>Cancel</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="vault-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="note-lock-title">
            <div className="vault-modal">
                <div className="vault-lock-icon" aria-hidden="true"><Lock size={24} /></div>
                <h2 id="note-lock-title" className="vault-lock-title">Lock this page</h2>

                <div className="vault-warning">
                    <TriangleAlert size={18} aria-hidden="true" />
                    <div>
                        <strong>What this does and does not do.</strong>
                        <p className="vault-lock-hint">
                            The page&apos;s title and contents stop showing in the
                            sidebar and stop loading until this PIN is entered. It
                            does <em>not</em> hide the page from someone who already
                            has into the app -- an unlocked app can read it. If you
                            need that, lock the whole app instead.
                        </p>
                    </div>
                </div>

                {wait > 0 ? (
                    <p className="vault-lock-error" role="alert">
                        Too many attempts. Try again in {Math.ceil(wait / 1000)}s.
                    </p>
                ) : (
                    <>
                        <label className="vault-lock-label" htmlFor="note-pin">PIN for this page</label>
                        <input
                            id="note-pin"
                            type="password"
                            className="vault-lock-input"
                            value={pin}
                            onChange={e => { setPin(e.target.value); setError(null); }}
                            autoComplete="new-password"
                            inputMode="numeric"
                        />
                        <p className="vault-lock-hint">
                            At least {MIN_PIN_LENGTH} characters. Longer is much
                            stronger. If you forget it, this page can still be
                            opened with your app recovery words.
                        </p>

                        <label className="vault-lock-label" htmlFor="note-pin-confirm">Type it again</label>
                        <input
                            id="note-pin-confirm"
                            type="password"
                            className="vault-lock-input"
                            value={confirm}
                            onChange={e => { setConfirm(e.target.value); setError(null); }}
                            autoComplete="new-password"
                            inputMode="numeric"
                        />
                    </>
                )}

                {error && <p className="vault-lock-error" role="alert">{error}</p>}

                <div className="vault-setup-actions">
                    <button
                        type="button"
                        className="btn-action vault-lock-primary"
                        disabled={busy || wait > 0 || pin.length < MIN_PIN_LENGTH || pin !== confirm}
                        onClick={() => void submit()}
                    >
                        {busy ? 'Locking...' : <><Check size={15} /> Lock page</>}
                    </button>
                    <button type="button" className="btn-action vault-lock-link" onClick={onClose}>Cancel</button>
                </div>
            </div>
        </div>
    );
};

export default NotePinDialog;