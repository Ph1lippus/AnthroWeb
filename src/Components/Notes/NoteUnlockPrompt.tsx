import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { describeRetry } from '../../services/vault/keyring';
import { isCoolingDown, retryAfterMs, MIN_NOTE_PIN_LENGTH } from '../../services/vault/noteLock';
import type { Note } from '../../services/noteService';
import { useNotice } from '../Feedback/useNotice';

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
 * A REAL INPUT, NOT A SIX-BUTTON GRID
 *
 * This was a `<div className="vault-lock-pad">` of buttons, and the module
 * comment above it explained why that was deliberate: "a six-digit pad rather
 * than a text field". It was not a bad idea on a phone. It was the *only* way in,
 * and it meant the page could not be opened by anyone typing -- a hardware
 * keyboard, a Bluetooth keyboard, a switch, a screen reader user driving the
 * caret, or a person who simply expected a PIN field to be a PIN field. Nothing
 * received the keystrokes because there was nothing to receive them.
 *
 * `inputMode="numeric"` keeps the phone keypad, which was the thing the grid was
 * actually for, and `autoComplete="new-password"` keeps it out of password
 * managers' suggestions, which was the other thing. What is lost is the ability
 * to forbid anything but digits by construction; that is a `replace(/\D/g, '')`
 * on change instead, which is the same rule with one fewer reason to remember it.
 *
 * Auto-submits at four digits, which is the app lock's behaviour and the reason
 * it feels like a lock rather than a form.
 *
 * ONE WAY OUT, NOT TWO
 *
 * "Back to pages" and the key glyph both went. The glyph opened the same recovery
 * flow as the link beneath it -- `NotesWorkspace` wired both to the same
 * `setRecoveringPin(true)` -- so it was a second control for one action, on a
 * grid whose other cells were digits. And "Back to pages" left a page open that
 * could not be read, which is not a state worth offering a button for: the rail
 * is right there.
 *
 * NO ICON, NO HEADING, NO EXPLANATION
 *
 * All three are gone, and the card is now a field and a link.
 *
 * The icon and the heading said "this page is locked", which the prompt itself
 * already says by being the only thing on screen where the page should be. The
 * paragraph under them was worse than decoration. It read "Enter the PIN you set
 * for this page. Use your account password if you do not have it." -- which is
 * not true, and is untrue in the one way that costs somebody their page. There is
 * no field here that takes an account password. Recovery is the link underneath,
 * and it opens a different screen that asks for it; typing a password into the PIN
 * box can only produce a failed attempt against the page's own PIN, and after
 * three of those the backoff starts refusing attempts for a minute at a time.
 *
 * So the text described a route that does not exist, in a place where the reader
 * was about to type into a box. What is left says the same thing truthfully by
 * being the control itself: a field with a PIN placeholder, and a link that
 * plainly says what it opens. `aria-label` carries the same words for a screen
 * reader, which is the one reader that does need to be told what this is.
 */

interface NoteUnlockPromptProps {
    note: Note;
    onUnlocked: (key: CryptoKey) => void;
    onForgotPin: () => void;
}

const PIN_LENGTH = MIN_NOTE_PIN_LENGTH;

const NoteUnlockPrompt: React.FC<NoteUnlockPromptProps> = ({ note, onUnlocked, onForgotPin }) => {
    const [entry, setEntry] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const { notify } = useNotice();
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
                setError('That PIN is not right.');
                setEntry('');
                return;
            }
            onUnlocked(key);
        } catch (err) {
            // A *wrong PIN* keeps its message under the field. That is feedback on
            // the control being used rather than a failure of the app.
            //
            // Anything reaching this catch is something else -- the key could not be
            // derived, the row could not be read -- and that goes to the one place
            // errors go.
            notify('error', err instanceof Error ? err.message : 'Could not unlock this page.');
        } finally {
            setBusy(false);
        }
    }, [attempts, busy, cooldown, note, onUnlocked, notify]);

    const type = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (busy || cooldown > 0) return;
        setError(null);
        // Digits only, and never more than the PIN can be. Doing it on the way in
        // rather than on submit means a pasted "PIN: 1234" is accepted without
        // asking the reader to clean it up first.
        const next = event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH);
        setEntry(next);
        if (next.length === PIN_LENGTH) void submit(next);
    };

    // The form is what makes Enter work, the same reason the PIN dialog is one.
    const onSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (entry.length === PIN_LENGTH) void submit(entry);
    };

    return (
        // `aria-label` rather than `aria-labelledby`: there is no heading left to
        // point at, and a dialog that names itself is still named.
        <div
            className="note-unlock"
            role="dialog"
            aria-modal="true"
            aria-label="This page is locked"
        >
            <form className="note-unlock-card" onSubmit={onSubmit}>
                <div className="vault-lock-fields">
                    <label htmlFor="note-unlock-pin" className="sr-only">
                        Page PIN
                    </label>
                    <input
                        id="note-unlock-pin"
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
                </div>

                {error && (
                    <p className="t-error-msg" role="alert">
                        <AlertTriangle size={15} aria-hidden="true" />
                        {error}{cooldown > 0 ? ` Try again in ${describeRetry(cooldown)}.` : ''}
                    </p>
                )}

                <button type="button" className="btn-link" onClick={onForgotPin} disabled={busy}>
                    I forgot this page&rsquo;s PIN
                </button>
            </form>
        </div>
    );
};

export default NoteUnlockPrompt;
