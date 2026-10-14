/**
 * Sealing and opening a row's private fields.
 *
 * This is the layer the rest of the app talks to, and it has one overriding
 * property: **with the vault off it is a no-op that produces byte-identical
 * behaviour to not having it.** Every function here checks the keyring first
 * and passes the row straight through when the vault is off or locked. That is
 * what makes the feature safe to ship enabled-by-default-off -- nothing about an
 * account without a PIN changes, including the query shapes and the columns
 * written.
 *
 * THE SHAPE OF A SEALED ROW
 *
 * A row keeps the columns needed to *find* it and nothing else:
 *
 *   notes      -> id, user_id, is_pinned, notes_position, notes_parent_id,
 *                 notes_deleted_at, created_at, updated_at
 *   daily_logs -> id, user_id, log_date, created_at, updated_at
 *
 * Everything else goes into `vault`, one AES-256-GCM blob per row. So:
 *
 *  - Row level security keeps working. It filters on `user_id`, which is clear.
 *  - Date-range filters and ordering keep working. `log_date` is clear.
 *  - Every chart keeps working. The client decrypts on read and merges the
 *    payload back into the row object, so `dailyScoring`, `measurementCalculations`
 *    and every dashboard component see the shape they always saw.
 *
 * The alternative -- an `_enc` column per field -- looks tidier and leaks. It
 * leaves length, nullability, ordering and equality of every individual value
 * observable: an attacker learns that today's journal entry is longer than
 * yesterday's, that this week's weight is within a kilo of last week's, that
 * exactly one row this month has a blood-pressure reading. One blob per row
 * removes all of that. The server learns only that the row has some private
 * content.
 *
 * DENY BY DEFAULT
 *
 * The clear-column list is an allowlist per table, not a list of fields to seal.
 * A column added later is therefore sealed automatically rather than accidentally
 * left in the clear -- the failure mode of "fields to encrypt" is a silent
 * privacy gap in a schema that grows, and this app's schema has been growing
 * for a year.
 *
 * NEVER SILENTLY LOSES DATA
 *
 * If the vault is armed but locked and a read comes in, `openRow` throws
 * `VaultLockedError` rather than returning the row with its private fields
 * missing. Those two are indistinguishable at the call site: a partial row would
 * be saved back on the next autosave and would blank the fields it had lost.
 * Failing loudly is the only safe answer.
 */

import { rowAad, sealJson, tryOpenJson } from '../crypto/cipher';
import { getMasterKey } from './keyring';

/**
 * The columns that stay readable by the server for each sealed table.
 *
 * Everything not listed here goes into the payload. The lists are deliberately
 * short and contain only what a query genuinely needs:
 *
 *  - `user_id` -- row level security filters on it. Seal it and RLS stops.
 *  - `log_date`, `measure_date`, `session_date` etc. -- the app filters and
 *    orders ranges on these. Encrypting them would mean fetching the entire
 *    history to answer "this month".
 *  - ordering and tree columns -- `notes_position`, `notes_parent_id`, `id`.
 *  - the note's *lock* columns, which are key material addressed by row and must
 *    remain addressable for the lock to be verifiable at all.
 *
 * A date column is the one genuinely awkward case. It reveals *when* a row was
 * written, which is itself information -- but it is unavoidable for range
 * queries, and a calendar of dates is a far smaller disclosure than a calendar
 * of contents.
 */
const CLEAR_COLUMNS: Record<string, readonly string[]> = {
    daily_logs: ['id', 'user_id', 'log_date', 'created_at', 'updated_at', 'vault'],
    notes: [
        'id', 'user_id', 'is_pinned', 'notes_position', 'notes_parent_id',
        'notes_deleted_at', 'created_at', 'updated_at', 'vault',
        // The title stays in the clear, deliberately.
        //
        // A sidebar that lists twenty pages all reading "Locked" cannot be used.
        // You cannot tell which one you are unlocking, which is the whole reason
        // you locked any of them, and a lock you cannot navigate is a lock that
        // pushes you to keep everything unlocked instead.
        //
        // The cost is real and worth stating once: a database dump now reveals
        // what your pages are *about* even when it cannot read a word of them.
        // Titles like "Therapy" or "Boss" say something. That is the trade --
        // a lock you can navigate in exchange for what the labels are -- and it
        // is the owner's call to make, not a detail to hide in a comment.
        //
        // Tags are NOT on this list. They are a self-authored taxonomy that
        // tends to say more than the title does, and nothing about being able to
        // identify a page needs them in the clear.
        'title',
        // Lock state has to stay clear: it is how the app knows to prompt, and
        // how a locked note renders as locked rather than as blank.
        'lock_enabled', 'lock_salt', 'lock_iterations', 'lock_key_pin',
        'lock_key_master', 'lock_key_account', 'lock_key_recovery',
        'lock_failed_attempts', 'lock_retry_after',
    ],
    user_settings: [
        'id', 'user_id', 'created_at', 'updated_at', 'vault',
        // The keyring itself is never inside a payload -- it is how the payload
        // is opened, so sealing it would be circular.
        'vault_enabled', 'vault_version', 'vault_enabled_at', 'vault_pin_salt',
        'vault_pin_iterations', 'vault_pin_wrapped', 'vault_recovery_salt',
        'vault_recovery_iterations', 'vault_recovery_wrapped', 'vault_pin_changed_at',
    ],
};

/** Tables this module knows how to seal. Anything else passes through. */
const sealable = (table: string): boolean => Object.prototype.hasOwnProperty.call(CLEAR_COLUMNS, table);

/** Thrown when the vault is armed, locked, and something asked for private data. */
export class VaultLockedError extends Error {
    constructor(table: string) {
        super('The vault is locked.');
        this.name = 'VaultLockedError';
        this.table = table;
    }
    readonly table: string;
}

/** Thrown when a row is sealed and cannot be opened with the current key. */
export class VaultUnreadableError extends Error {
    constructor(table: string, rowId: string) {
        super(`Could not open this ${table} entry.`);
        this.name = 'VaultUnreadableError';
        this.table = table;
        this.rowId = rowId;
    }
    readonly table: string;
    readonly rowId: string;
}

/**
 * A row as it comes back from PostgREST.
 *
 * The constraint is `object`, not a record with an index signature: every row in
 * this app is a TypeScript *interface*, and an interface is not assignable to
 * `Record<string, unknown>` because it has no index signature. Constraining to
 * `Record` would force every caller to cast, and a cast at twenty call sites is
 * twenty places a wrong assumption can hide. The cast happens once, inside.
 */
export type VaultRow = {
    id?: string | null;
    user_id?: string | null;
    vault?: string | null;
};

const asRecord = (row: object): Record<string, unknown> => row as Record<string, unknown>;

/** What a write should actually send. */
export interface SealedWrite {
    /** Columns to write in the clear. Sensitive fields are absent. */
    clear: Record<string, unknown>;
    /** The sealed payload, or null when the vault is off for this row. */
    vault: string | null;
    /** True when this write changed what is stored, and so needs the row's fields. */
    sealed: boolean;
}

/**
 * The key to use, defaulting to whatever the keyring currently holds.
 *
 * The override exists so the sealing logic can be tested against real keys
 * without a database or an armed keyring -- ES module exports are immutable, so
 * there is no way to swap `getMasterKey` after import, and a test that reaches
 * for a mock of the module under test is testing the mock. Passing the key in
 * is dependency injection, and it costs one optional argument.
 */
const resolveKey = (override?: CryptoKey | null): CryptoKey | null =>
    override !== undefined ? override : getMasterKey();

/** Split a row into its clear columns and its private payload. */
const splitRow = (table: string, row: Record<string, unknown>): { clear: Record<string, unknown>; private: Record<string, unknown> } => {
    const keep = CLEAR_COLUMNS[table] ?? [];
    const clear: Record<string, unknown> = {};
    const priv: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        if (value === undefined) continue;
        if (keep.includes(key)) clear[key] = value;
        else priv[key] = value;
    }
    return { clear, private: priv };
};

/**
 * Prepare a row for writing.
 *
 * With the vault off this returns the row unchanged and `sealed: false`, so a
 * caller can use the result unconditionally without branching.
 */
export const sealRow = async (
    table: string,
    row: VaultRow,
    userId: string,
    keyOverride?: CryptoKey | null,
): Promise<SealedWrite> => {
    const record = asRecord(row);
    const rowId = typeof record.id === 'string' ? record.id : 'new';

    const key = resolveKey(keyOverride);

    /**
     * Nothing to seal: either the table has no rule, or the vault is off.
     *
     * Both cases return the row *whole*. Not "the clear columns" -- the whole
     * row. Returning only the allowlist columns here would mean that a user who
     * never turned the vault on had their journal silently dropped from every
     * write, because the allowlist is by definition everything the server is
     * allowed to see. With no key there is nothing to protect, so every field is
     * written exactly as it always was.
     */
    if (!sealable(table) || !key) {
        return { clear: stripUndefined(record), vault: null, sealed: false };
    }

    const { clear, private: priv } = splitRow(table, record);
    if (Object.keys(priv).length === 0) {
        return { clear, vault: null, sealed: true };
    }

    const vault = await sealJson(key, priv, rowAad(userId, table, rowId));
    return { clear, vault, sealed: true };
};

/**
 * Open a row that came back from the database.
 *
 * With the vault off, or on a row that is not sealed, the row is returned
 * untouched -- so the merge cost is one property check on rows that have nothing
 * to open.
 *
 * Throws `VaultLockedError` when the vault is armed and locked, rather than
 * handing back a row with fields silently missing. See the module comment: a
 * partial row saved back on the next autosave blanks what it lost.
 */
export const openRow = async <T extends object>(
    table: string,
    row: T,
    userId: string,
    keyOverride?: CryptoKey | null,
): Promise<T> => {
    const record = asRecord(row);
    if (!sealable(table) || !record.vault) return row;

    const key = resolveKey(keyOverride);
    if (!key) throw new VaultLockedError(table);

    const rowId = typeof record.id === 'string' ? record.id : '';
    const sealed = typeof record.vault === 'string' ? record.vault : '';
    const opened = await tryOpenJson<Record<string, unknown>>(key, sealed, rowAad(userId, table, rowId));
    if (!opened) throw new VaultUnreadableError(table, rowId);

    // The ciphertext is dropped before merging. Leaving it in place would mean
    // the raw blob rides along in `setQueryData`, in the persisted cache, and in
    // any payload built from this object -- which is the same disclosure the
    // sealing was for, sitting in the one place nobody thinks to look.
    const openedRow = { ...record, ...opened } as T & { vault?: string | null };
    delete openedRow.vault;
    return openedRow;
};

/**
 * Open a list of rows.
 *
 * Reports failures per row rather than throwing on the first one, because a
 * single unreadable row -- a note sealed under a key from a since-changed PIN,
 * say -- should cost that one note and not blank the whole notes sidebar.
 */
export const openRows = async <T extends object>(
    table: string,
    rows: T[],
    userId: string,
    keyOverride?: CryptoKey | null,
): Promise<{ rows: T[]; failed: string[] }> => {
    if (!sealable(table) || rows.length === 0) return { rows, failed: [] };

    /**
     * Only rows that actually carry a payload need opening.
     *
     * This check has to come *before* the key check, and the order is the whole
     * bug this replaced. `getMasterKey()` returns null in two unrelated
     * situations -- the vault was never armed, and the vault is armed and locked
     * -- and they need opposite answers. Only one of them is an error, and the
     * difference is whether there is anything to open.
     *
     * Checking the key first meant that with the vault off, every read of every
     * sealable table threw. `getUserNotes` failed, the query returned nothing, and
     * the notes page came up empty for an account that had never asked for any
     * of this.
     */
    const pending = rows.filter(row => typeof asRecord(row).vault === 'string' && asRecord(row).vault !== '');
    if (pending.length === 0) return { rows, failed: [] };

    const key = resolveKey(keyOverride);
    if (!key) throw new VaultLockedError(table);

    const out: T[] = [];
    const failed: string[] = [];
    for (const row of rows) {
        try {
            out.push(await openRow(table, row, userId, key));
        } catch (error) {
            if (error instanceof VaultUnreadableError) {
                failed.push(error.rowId);
                continue;
            }
            throw error;
        }
    }
    return { rows: out, failed };
};

/** Whether a table has a sealing rule here. */
export const isSealable = (table: string): boolean => sealable(table);

/**
 * The private columns of a row, set to null.
 *
 * Sealing is not enough on its own: a row that gets a `vault` blob while its
 * `journal_morning` stays populated is *more* exposed than before, because now
 * there are two copies and a future reader has to know which one is live. This
 * is what gets merged into the same write so the plaintext goes away in the same
 * round trip.
 *
 * Only columns the row actually carries. Writing `null` over a column the caller
 * never set would create it, and a row of nulls that was never filled in should
 * stay that way.
 */
export const blankPrivateColumns = (
    table: string,
    row: object,
): Record<string, null> => {
    if (!sealable(table)) return {};
    const { private: priv } = splitRow(table, asRecord(row));
    const blanks: Record<string, null> = {};
    for (const key of Object.keys(priv)) blanks[key] = null;
    return blanks;
};

/** The full write for a row whose private fields must be sealed in place. */
export const sealExistingRow = async (
    table: string,
    row: object,
    userId: string,
    keyOverride?: CryptoKey | null,
): Promise<{ vault: string | null; blanks: Record<string, null>; sealed: boolean }> => {
    const write = await sealRow(table, row, userId, keyOverride);
    if (!write.sealed || !write.vault) return { vault: null, blanks: {}, sealed: false };
    return { vault: write.vault, blanks: blankPrivateColumns(table, row), sealed: true };
};

const stripUndefined = (row: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) if (v !== undefined) out[k] = v;
    return out;
};