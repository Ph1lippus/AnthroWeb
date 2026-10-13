import { supabase } from './supabaseClient';
import { openRow, openRows, sealExistingRow } from './vault/rows';
import { getUserSettings } from './profileService';
import { armNoteLock, disarmNoteLock, openNoteKeyWithAccount, reWrapNotePin, retryAfterMs, unlockNoteWithMaster, unlockNoteWithPin } from './vault/noteLock';
import { checkAccountPassword, deriveAccountWrapKey, type AccountRecoveryColumns } from './vault/accountRecovery';
import { getMasterKey, isVaultOpen } from './vault/keyring';

/**
 * The account wrap key, held for the length of the session.
 *
 * Derived from the account password, which the app never stores -- so unlike the
 * app master key there is nothing to re-derive it from later. Keeping it in a
 * module variable is what lets `lockNote` add the account wrap without prompting
 * for the account password every time somebody locks a page.
 *
 * Cleared by `forgetAccountKey`, which the session-ending paths call. Held
 * nowhere else: not localStorage, not sessionStorage, not a module the UI can
 * reach for.
 */
let sessionAccountKey: CryptoKey | null = null;

/**
 * The account wrap key, if one has been established this session.
 *
 * Null when account recovery is off, or when the user has not re-entered their
 * account password since the page loaded. Both are ordinary states, not errors:
 * the note lock simply gets fewer wraps.
 */
const cachedAccountKey = async (): Promise<CryptoKey | null> => sessionAccountKey;

/**
 * Prove the account password and hold the resulting key for this session.
 *
 * Returns false for a wrong password without touching what is already cached, so
 * a mistyped attempt does not log the user out of the wrapping they had.
 */
export const establishAccountKey = async (password: string): Promise<boolean> => {
    const settings = await getUserSettings();
    const row = settings as unknown as AccountRecoveryColumns | null;
    if (!row?.account_recovery_verifier) return false;

    const key = await deriveAccountWrapKey(row, password);
    if (!key) return false;
    sessionAccountKey = key;
    return true;
};

/** Drop the cached account key. Called whenever the session ends. */
export const forgetAccountKey = (): void => {
    sessionAccountKey = null;
};

/**
 * Replace a forgotten note PIN.
 *
 * The recovery path, and the reason a forgotten PIN is an inconvenience rather
 * than a loss. It is a re-wrap: the account password unwraps the note key, and
 * that same key is wrapped under the new PIN. The page's ciphertext is never
 * opened, so there is no plaintext to mishandle and no window in which the
 * content exists unprotected.
 *
 * Throws when the account password is wrong -- the caller decides what that
 * means for the session, because only the UI knows whether this was a failed
 * recovery attempt or a different person at the keyboard.
 */
export const resetNotePin = async (id: string, accountPassword: string, newPin: string): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data: note, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();
    if (error) throw error;
    if (!note) throw new Error('That page no longer exists.');
    if (!note.lock_enabled) throw new Error('That page is not locked.');

    const settings = await getUserSettings();
    const recovery = settings as unknown as AccountRecoveryColumns | null;
    if (!recovery?.account_recovery_verifier) {
        throw new Error('Set up account recovery in Settings to reset a forgotten page PIN.');
    }
    if (!(await checkAccountPassword(recovery, accountPassword))) {
        throw new Error('That is not your account password.');
    }

    const accountKey = await deriveAccountWrapKey(recovery, accountPassword);
    if (!accountKey) throw new Error('Could not verify your account password.');

    const encodedKey = await openNoteKeyWithAccount(note as NoteLockColumns, id, accountKey);
    if (!encodedKey) {
        throw new Error(
            'This page was locked before account recovery was set up, so its PIN cannot be reset. ' +
            'Its other unlock routes still work.',
        );
    }

    const masterKey = getMasterKey();
    const columns = await reWrapNotePin(encodedKey, id, newPin, { masterKey });

    const { error: updateError } = await supabase
        .from('notes')
        .update(columns)
        .eq('id', id)
        .eq('user_id', user.id);
    if (updateError) throw updateError;
};

/**
 * Try every route to a note's key, cheapest rejection first.
 *
 * The master key is a single AES open, so it goes first. The PIN is a local
 * PBKDF2 over the stored salt and is the only route here that is a guess, so it
 * goes last and is the only one worth a backoff.
 */
export const tryNoteKeys = async (note: NoteLockColumns, id: string, pin: string): Promise<CryptoKey | null> => {
    const viaMaster = await unlockNoteWithMaster(note, id);
    if (viaMaster) return viaMaster;
    return unlockNoteWithPin(note, id, pin);
};
import type { NoteLockColumns } from './vault/noteLock';

export interface Note {
    id?: string;
    user_id: string;
    // Nullable after migration 0006: a page is created blank and titled as you
    // type, so the first write has an empty title. The client renders that as
    // "Untitled" rather than rejecting it.
    title: string | null;
    content: string;
    is_pinned: boolean;
    /**
     * The page's accent, stored by palette id ('blue', 'red', ...) rather than by
     * hex -- see `utils/noteColors`. Null means Default, which is also how a
     * colour is removed. Rows written before ids were stored hold one of seven
     * legacy hexes, which `resolveNoteColor` still resolves.
     */
    notes_color?: string | null;
    /** Lucide icon name shown above the title. Rows written before the switch to
     *  lucide hold an emoji; `resolveNoteIcon` still resolves those. */
    notes_icon?: string | null;
    /** Cover image URL drawn above the page. */
    notes_cover?: string | null;
    /** Parent page id, or null for a top-level page. Migration 0007. */
    notes_parent_id?: string | null;
    /**
     * Order among the pages sharing this page's parent.
     *
     * Read as a fraction, not an index: a page dropped between two others takes
     * the midpoint of their positions, so a reorder writes one row instead of
     * renumbering every sibling. Ties fall back to newest first, which is what
     * every page written before this column existed sits at.
     *
     * A `numeric`, and typed `string | number` because that is what it arrives as
     * -- Postgres has no numeric type that is reliably a JS number. Read it
     * through `positionOf` in `utils/noteTree`, never directly: adding two of
     * these as strings concatenates them, and the midpoint is an addition.
     */
    notes_position?: string | number | null;
    /** When the note was thrown away, or null while it is live. */
    notes_deleted_at?: string | null;
    /** Free-form labels. */
    notes_tags?: string[] | null;
    created_at?: string;
    updated_at?: string;
    /**
     * Sealed private fields, when the vault is on. Present on the way out of
     * the database and removed again by `openRow`; never hold one of these.
     */
    vault?: string | null;
    /** Whether this page carries its own PIN, independent of the app lock. */
    lock_enabled?: boolean;
    /** Failed unlock attempts, persisted so a reload cannot reset the backoff. */
    lock_failed_attempts?: number;
    /** When attempts are refused again. Null when there is no cooldown. */
    lock_retry_after?: string | null;
}

/**
 * Open a list of notes for display, leaving locked pages closed.
 *
 * A locked page must NOT be decrypted here. The sidebar is the reason somebody
 * locks a page in the first place -- it is the one view always on screen, and
 * the one a person glances at on a shared device. Decrypting every row to render
 * a list would make the lock decorative: the title and the first line of every
 * locked page would be sitting in memory and in the persisted cache the whole
 * time the sidebar is open.
 *
 * So a locked note comes back as a stub with no title, no body and no tags. It
 * renders as "Locked page", sorts by the `updated_at` that stays in the clear,
 * and prompts for its PIN when opened.
 */
const openForDisplay = async <T extends Note>(rows: (Note & T)[], userId: string): Promise<Note[]> => {
    const out: Note[] = [];
    for (const row of rows) {
        if (row.lock_enabled) {
            // Strip the ciphertext too. Leaving it here would put a sealed blob
            // into the query cache for a row nobody is allowed to read.
            const stub = { ...row } as Note;
            delete stub.vault;
            out.push({ ...stub, title: null, content: '', notes_tags: [], notes_cover: null });
            continue;
        }
        const { rows: opened } = await openRows<Note>('notes', [row], userId);
        if (opened[0]) out.push(opened[0]);
    }
    return out;
};

/**
 * Live notes for the sidebar: pinned first, then most recently touched.
 *
 * The `is('notes_deleted_at', null)` filter is the important part. Migration 0007
 * adds a trash, and a trashed page that still appears in the sidebar is worse than
 * a missing feature -- it looks like a live page and can be opened and edited.
 * Every read path that lists or resolves notes has to carry this filter.
 */
export const getUserNotes = async (): Promise<Note[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .is('notes_deleted_at', null)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('Error fetching notes:', error.message);
        return [];
    }

    return openForDisplay((data ?? []) as Note[], user.id);
};

/** Thrown-away pages, newest deletion first. Backs the trash view. */
export const getTrashedNotes = async (): Promise<Note[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .not('notes_deleted_at', 'is', null)
        .order('notes_deleted_at', { ascending: false });

    if (error) {
        console.error('Error fetching trashed notes:', error.message);
        return [];
    }

    return openForDisplay((data ?? []) as Note[], user.id);
};

// Single note for the editor. Scoped to the caller's id so a guessed uuid in the
// URL cannot read another account's note.
//
// includeTrashed is only for the trash view's restore action; everything else
// must go through the default, or a thrown-away page reappears as editable.
export const getNoteById = async (id: string, includeTrashed = false): Promise<Note | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    let query = supabase
        .from('notes')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id);

    query = includeTrashed ? query : query.is('notes_deleted_at', null);

    const { data, error } = await query.maybeSingle();

    if (error) {
        console.error('Error fetching note:', error.message);
        throw error;
    }

    if (!data) return null;
    const { rows } = await openRows<Note>('notes', [data as Note], user.id);
    return rows[0] ?? null;
};

// Create a new page. Title defaults to empty rather than being required, so
// "New note" can insert the row and hand the user straight to the editor.
export const createNote = async (note: {
    title?: string | null;
    content?: string;
    is_pinned?: boolean;
    notes_color?: string | null;
    notes_icon?: string | null;
    notes_cover?: string | null;
    notes_parent_id?: string | null;
    notes_position?: number;
    notes_tags?: string[];
}) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    /**
     * A new row has no id yet, so it cannot be sealed against one.
     *
     * `sealRow` binds the payload's authenticated data to the row id, which is
     * what stops a sealed note being copied onto another row and opened there.
     * For an insert there is nothing to bind to, so the row is created with its
     * fields in the clear and sealed by the very next update. That is a real and
     * brief window, and it is closed immediately below by re-sealing the row the
     * database assigned -- rather than by weakening the binding for everyone
     * after.
     */
    const { data, error } = await supabase
        .from('notes')
        .insert({
            user_id: user.id,
            title: note.title ?? '',
            content: note.content ?? '',
            is_pinned: note.is_pinned || false,
            notes_color: note.notes_color ?? null,
            notes_icon: note.notes_icon ?? null,
            notes_cover: note.notes_cover ?? null,
            notes_parent_id: note.notes_parent_id ?? null,
            // Past its new siblings rather than at zero, so a page created inside
            // a folder lands under the pages already there instead of above them.
            notes_position: note.notes_position ?? 0,
            notes_tags: note.notes_tags ?? [],
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating note:', error.message);
        throw error;
    }

    const created = data as Note;
    const resealed = await resealNote(created, user.id);
    return resealed;
};

/**
 * Move an already-written row's private fields into its sealed payload.
 *
 * Used in two places, both of which are the same situation: a row that was
 * written before the vault knew its id, or before the vault existed at all. The
 * fields are already in the database, so this reads the row, re-writes it with a
 * sealed payload, and blanks the plaintext columns.
 *
 * Best-effort by design. If the seal fails the row is still correct, just not
 * yet private, so the error is surfaced and nothing else changes -- the
 * alternative, refusing the write, would lose the user's text over a crypto
 * failure.
 */
const resealNote = async (note: Note, userId: string): Promise<Note> => {
    const { vault, blanks, sealed } = await sealExistingRow('notes', note as unknown as Record<string, unknown>, userId);
    if (!sealed || !vault) return note;

    const { error } = await supabase
        .from('notes')
        .update({ vault, ...blanks })
        .eq('id', note.id!);

    if (error) {
        console.error('Could not seal a new note:', error.message);
        return note;
    }
    return { ...note, ...blanks, vault } as Note;
};

// Update a note. Every write stamps updated_at, which is what the list sorts on
// -- so autosave also drives "last edited" ordering. Callers doing rapid
// successive updates need their own ordering guard; see useUpdateNote.
//
// When the vault is on, this is the only place a note's private fields change,
// so it is where they are sealed. `updates` is a *partial* -- a colour change
// carries no title -- so a partial update is merged onto the stored row rather
// than sealed on its own. Sealing the partial would seal a note whose title had
// been dropped from the payload, and the next read would reopen it without one.
export const updateNote = async (id: string, updates: Partial<Note>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const payload: Record<string, unknown> = {
        ...updates,
        updated_at: new Date().toISOString(),
    };

    // Nothing to merge onto when the row is not sealed -- a pin toggle, a colour,
    // a reorder. Those touch only clear columns, so the write goes out as it
    // always did, without paying for a read.
    if (isVaultOpen() && !updates.vault) {
        const existing = await getNoteById(id, true);
        if (existing) {
            const { vault, blanks, sealed } = await sealExistingRow(
                'notes',
                { ...existing, ...payload } as unknown as object,
                user.id,
            );
            if (sealed && vault) {
                for (const key of Object.keys(blanks)) {
                    if (key in payload) payload[key] = blanks[key];
                }
                payload.vault = vault;
            }
        }
    }

    const { data, error } = await supabase
        .from('notes')
        .update(payload)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

    if (error) {
        console.error('Error updating note:', error.message);
        throw error;
    }

    if (!isVaultOpen() || !data?.vault) return data as Note;
    const { rows } = await openRows<Note>('notes', [data as Note], user.id);
    return rows[0] ?? (data as Note);
};

/** Toggle pin status. */
export const togglePinNote = async (id: string, isPinned: boolean) => {
    return updateNote(id, { is_pinned: !isPinned });
};

/**
 * Lock a page behind its own PIN.
 *
 * Two things happen in one write, and they have to happen together: the page's
 * contents are re-sealed under the *note's* key rather than the app's master key,
 * and the note key is wrapped three ways so it survives any one of them being
 * lost.
 *
 * Re-sealing under the note key is the whole point. If the contents stayed sealed
 * under the master key, the per-note PIN would be decorative -- anyone with the
 * app unlocked could read them. The master wrap still exists, so the app can read
 * a locked page without a prompt; the note PIN is what stops the sidebar and the
 * list from showing it.
 */
export const lockNote = async (id: string, pin: string): Promise<Note> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data: fetched } = await supabase
        .from('notes')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();
    if (!fetched) throw new Error('That page no longer exists.');

    // The currently-open note, so the payload describes the whole page rather
    // than a partial.
    const current = await getNoteById(id, true);
    if (!current) throw new Error('That page no longer exists.');

    // The account wrap, when the user has opted into account recovery. Held in
    // memory only -- it is derived from a password that is not stored, so there
    // is nothing to read back on the next lock. A user without recovery enabled
    // gets a PIN-only lock, which works: `armNoteLock` treats the master wrap as
    // a bonus rather than a precondition.
    const accountKey = await cachedAccountKey();

    const lockColumns = await armNoteLock(id, pin, undefined, accountKey);
    const noteKey = await unlockNoteWithPin(lockColumns as NoteLockColumns, id, pin);
    if (!noteKey) throw new Error('Could not set that PIN.');

    const { vault, blanks, sealed } = await sealExistingRow('notes', current as unknown as object, user.id, noteKey);
    if (!sealed || !vault) throw new Error('Could not lock this page.');

    const { data, error } = await supabase
        .from('notes')
        .update({ vault, ...blanks, ...lockColumns })
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

    if (error) {
        console.error('Could not lock note:', error.message);
        throw error;
    }
    void fetched;
    return { ...data as Note, ...blanks, vault } as Note;
};

/**
 * Remove a page's PIN.
 *
 * The contents are re-sealed under the master key, because that is what the rest
 * of the app reads them with. Locking and unlocking therefore both rewrite the
 * note's payload -- which is a few kilobytes of AES-GCM on a document, not a
 * re-encryption of a vault.
 */
export const unlockNote = async (id: string): Promise<Note> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No user found');

    const { data: fetched } = await supabase
        .from('notes')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();
    if (!fetched) throw new Error('That page no longer exists.');

    // Read through the app's master key, which is how a locked page is opened
    // by an unlocked app.
    const noteKey = await unlockNoteWithMaster(fetched as NoteLockColumns, id);
    const current = noteKey
        ? (await openRow('notes', fetched as Note, user.id, noteKey))
        : await getNoteById(id, true);
    if (!current) throw new Error('That page no longer exists.');

    const { vault, blanks, sealed } = await sealExistingRow('notes', current as unknown as object, user.id);
    if (!sealed || !vault) throw new Error('Could not unlock this page.');

    const { data, error } = await supabase
        .from('notes')
        .update({ vault, ...blanks, ...disarmNoteLock() })
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

    if (error) {
        console.error('Could not unlock note:', error.message);
        throw error;
    }
    return { ...data as Note, ...blanks, vault } as Note;
};

/**
 * Record a failed unlock attempt.
 *
 * The backoff has to live in the database, not in component state: state resets
 * on a reload, and a lock whose backoff can be reset by refreshing the page is
 * not a lock.
 */
export const updateNoteLockAttempts = async (id: string, attempts: number): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const retryAfter = attempts > 0
        ? new Date(Date.now() + retryAfterMs(attempts)).toISOString()
        : null;
    await supabase
        .from('notes')
        .update({ lock_failed_attempts: attempts, lock_retry_after: retryAfter })
        .eq('id', id)
        .eq('user_id', user.id)
        .then(({ error }) => {
            if (error) console.error('Could not record a lock attempt:', error.message);
        });
};

/**
 * Throw a page away.
 *
 * A soft delete by default, so a mis-click is recoverable from the trash. The
 * permanent variant is only reachable from the trash view itself, where the user
 * has already seen what they are about to lose.
 *
 * Children are not touched: a page thrown away with sub-pages promotes them to
 * the top level, which is what the ON DELETE SET NULL in the schema does for a
 * hard delete and what keeps a trashed parent from stranding a live child.
 */
export const trashNote = async (id: string): Promise<Note> => {
    const { data, error } = await supabase
        .from('notes')
        .update({ notes_deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error trashing note:', error.message);
        throw error;
    }
    return data as Note;
};

/** Remove a page for good. Only ever called from the trash view. */
export const deleteNoteForever = async (id: string) => {
    const { error } = await supabase.from('notes').delete().eq('id', id);

    if (error) {
        console.error('Error deleting note:', error.message);
        throw error;
    }
};

/** Bring a page back out of the trash. */
export const restoreNote = async (id: string): Promise<Note> => {
    const { data, error } = await supabase
        .from('notes')
        .update({ notes_deleted_at: null })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error restoring note:', error.message);
        throw error;
    }
    return data as Note;
};

/** Empty the trash. */
export const emptyTrash = async () => {
    const { error } = await supabase
        .from('notes')
        .delete()
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .not('notes_deleted_at', 'is', null);

    if (error) {
        console.error('Error emptying trash:', error.message);
        throw error;
    }
};

/**
 * Re-parent a page, promote it to the top level with null, and/or place it among
 * its new siblings.
 *
 * `position` is optional because the two callers are different jobs: the trash
 * and nesting paths only change the parent, while a drag has to say where in the
 * new order the page lands. A drag inside one group writes only the position,
 * so the parent is passed through unchanged rather than being recomputed.
 */
export const moveNote = async (id: string, parentId: string | null, position?: number) => {
    return updateNote(id, {
        notes_parent_id: parentId,
        ...(position === undefined ? {} : { notes_position: position }),
    });
};

/** Copy a page, including its colour, icon and tags but never its pinned state. */
export const duplicateNote = async (note: Note): Promise<Note> => {
    return createNote({
        title: note.title ? `${note.title} (copy)` : '',
        content: note.content,
        notes_color: note.notes_color ?? null,
        notes_icon: note.notes_icon ?? null,
        notes_cover: note.notes_cover ?? null,
        // The copy sits beside the original rather than inside it, which is what
        // makes the duplicate useful: nesting it would be circular.
        notes_parent_id: note.notes_parent_id ?? null,
        notes_tags: note.notes_tags ?? [],
    });
};
