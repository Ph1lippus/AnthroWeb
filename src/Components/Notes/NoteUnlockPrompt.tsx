import React, { useCallback, useEffect, useState } from 'react';
import { Lock, Delete, AlertTriangle, KeyRound } from 'lucide-react';
import { MIN_PIN_LENGTH, BACKOFF_MS, describeRetry } from '../../services/vault/keyring';
import { isCoolingDown, retryAfterMs, MIN_NOTE_PIN_LENGTH } from '../../services/vault/noteLock';
import type { Note } from '../../services/noteService';

/**
 * The lock columns, read off a `Note`.
 *
 * A `Note` as it reaches this component is the display stub `openForDisplay`
 * returns -- deliberately without the key material -- so the cast is not papering
 * over a type error but expressing "these fields exist on the row and arrive with
 * it". The service still validates the columns before using them.
 */
const lockColumnsOf = (note: Note) => note as unknown as Parameters<typeof isCoolingDown>[0];

/**
 * Shown in place of the editor when a locked page is opened.
 *
 * Replaces the editor rather than sitting over it, for the same reason the app
 * lock does: an editor mounted underneath would have already loaded the note's
 * content into the DOM and into the query cache. The lock has to mean the text
 * was never in memory, not that it was hidden behind something.
 *
 * A six-digit pad rather than a text field, so a PIN typed on a phone gets the
 * numeric keypad and cannot be dictated into a notes search by accident.
 */

interface NoteUnlockPromptProps {
    note: Note;
    onUnlocked: (key: CryptoKey) => void;
    onUseRecovery: () => void;
    onForgotPin: () => void;
    onBack: () => void;
}

const PIN_LENGTH = MIN_NOTE_PIN_LENGTH;

const NoteUnlockPrompt: React.FC<NoteUnlockPromptProps> = ({ note, onUnlocked, onUseRecovery, onForgotPin, onBack }) => {
    const [entry, setEntry] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    /**
     * Recovered from the row on mount, not synced from it.
     *
     * The persisted counter is the one that matters -- it is what stops a reload
     * from resetting the backoff -- so it is read once into state this component
     * owns and increments. The workspace keys this prompt by note id, so opening a
     * different page remounts it and the value is re-read. Syncing it with an
     * effect instead would render once carrying the previous page's count.
     */
    const [attempts, setAttempts] = useState(() => note.lock_failed_attempts ?? 0);
    const [cooldown, setCooldown] = useState(() => (
        isCoolingDown(lockColumnsOf(note))
            ? Math.max(0, new Date(note.lock_retry_after!).getTime() - Date.now())
            : 0
    ));

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setInterval(() => setCooldown(v => Math.max(0, v - 1000)), 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    const submit = useCallback(async (pin: string) => {
        if (busy || cooldown > 0) return;
        setBusy(true);
        setError(null);
        try {
            const { unlockNoteWithPin } = await import('../../services/vault/noteLock');
            const { updateNoteLockAttempts } = await import('../../services/noteService');
            const key = await unlockNoteWithPin(lockColumnsOf(note), note.id!, pin);
            if (!key) {
                const next = attempts + 1;
                setAttempts(next);
                setCooldown(retryAfterMs(next));
                // Persisted so the backoff survives a reload or a tab switch.
                void updateNoteLockAttempts(note.id!, next);
                setError(cooldown > 0 ? 'That PIN is not right.' : 'That PIN is not right.');
                setEntry('');
                return;
            }
            onUnlocked(key);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not unlock this page.');
        } finally {
            setBusy(false);
        }
    }, [attempts, busy, cooldown, note, onUnlocked]);

    const press = (digit: string) => {
        if (busy || cooldown > 0) return;
        setError(null);
        const next = (entry + digit).slice(0, PIN_LENGTH);
        setEntry(next);
        if (next.length === PIN_LENGTH) void submit(next);
    };

    return (
        <div className="note-unlock" role="dialog" aria-modal="true" aria-labelledby="note-unlock-heading">
            <div className="note-unlock-card">
                <div className="vault-lock-icon" aria-hidden="true"><Lock size={24} /></div>
                <h2 id="note-unlock-heading" className="vault-lock-title">This page is locked</h2>
                <p className="vault-lock-hint">
                    Enter the PIN you set for this page. Use your app recovery
                    words if you do not have it.
                </p>

                <div className="vault-lock-dots" role="status" aria-label={`${entry.length} of ${PIN_LENGTH} digits entered`}>
                    {Array.from({ length: PIN_LENGTH }, (_, i) => (
                        <span key={i} className={`vault-lock-dot${i < entry.length ? ' vault-lock-dot--filled' : ''}`} />
                    ))}
                </div>

                <div className="vault-lock-pad">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                        <button
                            key={d}
                            type="button"
                            className="vault-lock-key"
                            onClick={() => press(d)}
                            disabled={busy || cooldown > 0}
                        >
                            {d}
                        </button>
                    ))}
                    <button
                        type="button"
                        className="vault-lock-key vault-lock-key--muted"
                        onClick={onUseRecovery}
                        disabled={busy || cooldown > 0}
                        data-tip="Use your recovery words"
                    >
                        <KeyRound size={18} />
                        <span className="sr-only">Use recovery words</span>
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
                        onClick={() => { setEntry(e => e.slice(0, -1)); setError(null); }}
                        disabled={busy || cooldown > 0 || entry.length === 0}
                        data-tip="Delete"
                    >
                        <Delete size={18} />
                        <span className="sr-only">Delete</span>
                    </button>
                </div>

                {error && (
                    <p className="t-error-msg" role="alert">
                        <AlertTriangle size={15} aria-hidden="true" />
                        {error}{cooldown > 0 ? ` Try again in ${describeRetry(cooldown)}.` : ''}
                    </p>
                )}

                <button type="button" className="btn btn-link" onClick={onForgotPin}>
                    I forgot this page&rsquo;s PIN
                </button>
                <button type="button" className="btn btn-link" onClick={onBack}>Back to pages</button>
            </div>
        </div>
    );
};

export { MIN_PIN_LENGTH, BACKOFF_MS };
export default NoteUnlockPrompt;

