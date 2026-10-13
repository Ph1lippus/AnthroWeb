/**
 * Per-note locks.
 *
 * A note can carry its own PIN, independently of the app lock. That is what makes
 * "keep this one hidden" possible when someone shares a device but you still want
 * the rest of your notes to hand.
 *
 * THE KEY IS RANDOM, NOT DERIVED
 *
 * A locked note's key is 32 random bytes generated at lock time, and that key is
 * then *wrapped* three ways:
 *
 *   note key --AES-GCM--> lock_key_pin       (under PBKDF2(the note's PIN))
 *   note key --AES-GCM--> lock_key_master    (under the app master key)
 *   note key --AES-GCM--> lock_key_recovery  (under the recovery phrase)
 *
 * Deriving the key from the PIN directly would be simpler, and it is worse in two
 * ways. It cannot be stored, so changing the PIN would mean re-encrypting the
 * entire note -- turning a keystroke into a full rewrite of a document. And it
 * could not be reachable by the master key at all, so a locked note would need a
 * prompt even in an unlocked app, which is the opposite of what someone wants
 * from "locked": readable by me, not by anyone else.
 *
 * Three wraps is the same three-way problem the app vault has, solved the same
 * way, and for the same reason: each of them survives the other two being lost.
 *
 * THE TITLE GOES IN TOO
 *
 * A sidebar showing "Locked" next to a readable title has leaked the part people
 * are actually hiding. `title`, `content` and `notes_tags` are all inside the
 * sealed payload for a locked note, so it renders as an unnamed locked page.
 */

import { randomBytes, toBase64, fromBase64 } from '../crypto/bytes';
import { deriveKey, importRawKey, seal, tryOpen } from '../crypto/cipher';
import { KEY_BYTES, PBKDF2_ITERATIONS, SALT_BYTES, VAULT_FORMAT_VERSION } from '../crypto/cipher';
import { getMasterKey, MIN_PIN_LENGTH, retryAfterMs } from './keyring';

const AAD = (noteId: string) => `anthroweb/v${VAULT_FORMAT_VERSION}|note-key|${noteId}`;

export interface NoteLockColumns {
    lock_enabled: boolean;
    lock_salt: string | null;
    lock_iterations: number | null;
    lock_key_pin: string | null;
    lock_key_master: string | null;
    lock_key_recovery: string | null;
    lock_failed_attempts: number;
    lock_retry_after: string | null;
}

export interface NoteLockState extends NoteLockColumns {
    /** The note key, when the app is unlocked. Null while locked. */
    key: CryptoKey | null;
}

export const assertNotePin = (pin: string): void => {
    if (pin.length < MIN_PIN_LENGTH) {
        throw new Error(`A note PIN must be at least ${MIN_PIN_LENGTH} characters.`);
    }
};

/**
 * Arm a lock on a note.
 *
 * Two wraps, not three: the note's own PIN and the app's master key. A third wrap
 * under the recovery phrase would mean asking for 24 words every time somebody
 * locks a single page, and it would add no capability -- a lost note PIN is
 * already recovered by unlocking the app with the recovery phrase and using the
 * master wrap. `lock_key_recovery` stays null.
 *
 * Returns the columns to write. The caller writes them; nothing here touches the
 * database, because the note row has to be updated alongside its own content and
 * the two belong in one statement.
 *
 * `masterKeyOverride` exists so the scheme can be tested against real keys
 * without an armed keyring -- an ES module export is immutable, so there is no
 * way to swap `getMasterKey` after import. Same reasoning as `sealRow`.
 */
export const armNoteLock = async (
    noteId: string,
    pin: string,
    masterKeyOverride?: CryptoKey | null,
): Promise<Partial<NoteLockColumns>> => {
    assertNotePin(pin);
    const masterKey = masterKeyOverride !== undefined ? masterKeyOverride : getMasterKey();
    if (!masterKey) throw new Error('Turn on app encryption first.');

    const raw = randomBytes(KEY_BYTES);
    // Imported only to prove the bytes are a usable AES-256 key before they are
    // written anywhere. A truncated or malformed `raw` would otherwise be sealed
    // into two wraps and only discovered as an unwrap failure later.
    await importRawKey(raw);
    const aad = AAD(noteId);

    const salt = randomBytes(SALT_BYTES);
    const pinKey = await deriveKey(pin, salt, PBKDF2_ITERATIONS);
    const keyPin = await seal(pinKey, toBase64(raw), `${aad}|pin`);
    const keyMaster = await seal(masterKey, toBase64(raw), `${aad}|master`);

    return {
        lock_enabled: true,
        lock_salt: toBase64(salt),
        lock_iterations: PBKDF2_ITERATIONS,
        lock_key_pin: keyPin,
        lock_key_master: keyMaster,
        lock_key_recovery: null,
        lock_failed_attempts: 0,
        lock_retry_after: null,
    };
};

/** Disarm a lock. Requires the note to currently be open. */
export const disarmNoteLock = (): Partial<NoteLockColumns> => ({
    lock_enabled: false,
    lock_salt: null,
    lock_iterations: null,
    lock_key_pin: null,
    lock_key_master: null,
    lock_key_recovery: null,
    lock_failed_attempts: 0,
    lock_retry_after: null,
});

/**
 * Open a locked note with its own PIN.
 *
 * The note key is returned so the caller can cache it for the session; there is
 * no point asking for it per keystroke, and the derivation is 600k iterations.
 */
export const unlockNoteWithPin = async (
    lock: NoteLockColumns,
    noteId: string,
    pin: string,
): Promise<CryptoKey | null> => {
    if (!lock.lock_enabled) throw new Error('This note is not locked.');
    if (!lock.lock_salt || !lock.lock_iterations || !lock.lock_key_pin) return null;
    if (isCoolingDown(lock)) return null;

    const pinKey = await deriveKey(pin, fromBase64(lock.lock_salt), lock.lock_iterations);
    const opened = await tryOpen(pinKey, lock.lock_key_pin, `${AAD(noteId)}|pin`);
    if (!opened) return null;
    return importRawKey(fromBase64(opened));
};

/**
 * Open a locked note with the recovery phrase.
 *
 * Reachable only when the app itself has been unlocked with that phrase, since
 * the master wrap already covers every case where somebody holds it. Kept for the
 * case where the note's own PIN has been lost and the master wrap is somehow not
 * reachable -- and because it costs one function to have the escape hatch exist.
 */
export const unlockNoteWithRecovery = async (
    lock: NoteLockColumns,
    noteId: string,
    phrase: string,
): Promise<CryptoKey | null> => {
    if (!lock.lock_key_recovery || !lock.lock_salt || !lock.lock_iterations) return null;
    if (isCoolingDown(lock)) return null;

    const key = await deriveKey(
        phrase.trim().toLowerCase(),
        fromBase64(lock.lock_salt),
        lock.lock_iterations,
    );
    const opened = await tryOpen(key, lock.lock_key_recovery, `${AAD(noteId)}|recovery`);
    if (!opened) return null;
    return importRawKey(fromBase64(opened));
};

/**
 * Open a locked note with the app's master key.
 *
 * This is the path an unlocked app takes, and it is why the lock is honest about
 * what it does: a page locked with its own PIN is readable once the app is
 * unlocked, because the master wrap is there on purpose. The lock protects the
 * page from the sidebar, from a shared device where the app is open, and from its
 * title being visible at all. It is not a second vault around one document.
 */
export const unlockNoteWithMaster = async (
    lock: NoteLockColumns,
    noteId: string,
    masterKeyOverride?: CryptoKey | null,
): Promise<CryptoKey | null> => {
    if (!lock.lock_key_master) return null;
    const masterKey = masterKeyOverride !== undefined ? masterKeyOverride : getMasterKey();
    if (!masterKey) return null;
    const opened = await tryOpen(masterKey, lock.lock_key_master, `${AAD(noteId)}|master`);
    if (!opened) return null;
    return importRawKey(fromBase64(opened));
};

/**
 * How long to refuse attempts after `attempts` failures.
 *
 * Re-exported from the keyring rather than computed here, so a note PIN and the
 * app PIN back off on the same schedule. They had separate curves for a while --
 * this one exponential, the other a fixed ladder -- which meant the same mistake
 * could be tested against one and shipped into the other.
 */
export { retryAfterMs };

export const isCoolingDown = (lock: NoteLockColumns, now = Date.now()): boolean => {
    if (!lock.lock_retry_after) return false;
    return new Date(lock.lock_retry_after).getTime() > now;
};