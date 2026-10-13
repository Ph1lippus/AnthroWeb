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
import { getMasterKey, retryAfterMs } from './keyring';

/**
 * Four, not six.
 *
 * A note PIN guards one page, and the threat it addresses is someone glancing at
 * a shared device's sidebar. Six digits there is ceremony. The app PIN keeps its
 * own floor of six because it guards everything at once, and the two are
 * deliberately different numbers rather than one shared constant -- sharing it
 * meant a change to the app PIN silently changed what a note accepted.
 *
 * Four digits is only defensible because the account password is a second,
 * independent factor for the same content; see `accountRecovery.ts`. A 4-digit
 * note PIN alone would be a 10^4 brute force against a stored wrap.
 */
export const MIN_NOTE_PIN_LENGTH = 4;

const AAD = (noteId: string) => `anthroweb/v${VAULT_FORMAT_VERSION}|note-key|${noteId}`;

export interface NoteLockColumns {
    lock_enabled: boolean;
    lock_salt: string | null;
    lock_iterations: number | null;
    lock_key_pin: string | null;
    lock_key_master: string | null;
    lock_key_recovery: string | null;
    lock_key_account: string | null;
    lock_failed_attempts: number;
    lock_retry_after: string | null;
}

export interface NoteLockState extends NoteLockColumns {
    /** The note key, when the app is unlocked. Null while locked. */
    key: CryptoKey | null;
}

export const assertNotePin = (pin: string): void => {
    if (pin.length < MIN_NOTE_PIN_LENGTH) {
        throw new Error(`A note PIN must be at least ${MIN_NOTE_PIN_LENGTH} digits.`);
    }
};

/**
 * Arm a lock on a note.
 *
 * The PIN wrap is required. The other two are conditional, and that conditionality
 * is the whole point of this rewrite: a page lock is a feature in its own right
 * and must not refuse to work because some unrelated feature is off.
 *
 *   lock_key_pin     always. Under PBKDF2(the note's PIN).
 *   lock_key_master  when the app vault is on. So an unlocked app reads the page
 *                    without a prompt. Absent otherwise, which is what
 *                    `notes_lock_consistent` was rewritten in 0025 to allow.
 *   lock_key_account when the user has opted into account recovery. So a
 *                    forgotten PIN is recoverable by proving the account
 *                    password, without the content ever being decrypted.
 *
 * `lock_key_recovery` stays null. The recovery phrase is a 24-word answer to a
 * question nobody should have to be asked twice, and with the account wrap in
 * place a lost note PIN already has a way back that does not involve typing it
 * into a phone keyboard on a train.
 *
 * Returns the columns to write. The caller writes them; nothing here touches the
 * database, because the note row has to be updated alongside its own content and
 * the two belong in one statement.
 *
 * `masterKeyOverride` and `accountKeyOverride` exist so the scheme can be tested
 * against real keys without an armed keyring -- an ES module export is immutable,
 * so there is no way to swap `getMasterKey` after import. Same reasoning as
 * `sealRow`.
 */
export const armNoteLock = async (
    noteId: string,
    pin: string,
    masterKeyOverride?: CryptoKey | null,
    accountKeyOverride?: CryptoKey | null,
): Promise<Partial<NoteLockColumns>> => {
    assertNotePin(pin);

    const masterKey = masterKeyOverride !== undefined ? masterKeyOverride : getMasterKey();
    const accountKey = accountKeyOverride !== undefined ? accountKeyOverride : null;

    const raw = randomBytes(KEY_BYTES);
    // Imported only to prove the bytes are a usable AES-256 key before they are
    // written anywhere. A truncated or malformed `raw` would otherwise be sealed
    // into two wraps and only discovered as an unwrap failure later.
    await importRawKey(raw);
    const aad = AAD(noteId);
    const encoded = toBase64(raw);

    const salt = randomBytes(SALT_BYTES);
    const pinKey = await deriveKey(pin, salt, PBKDF2_ITERATIONS);
    const keyPin = await seal(pinKey, encoded, `${aad}|pin`);
    const keyMaster = masterKey ? await seal(masterKey, encoded, `${aad}|master`) : null;
    const keyAccount = accountKey ? await seal(accountKey, encoded, `${aad}|account`) : null;

    return {
        lock_enabled: true,
        lock_salt: toBase64(salt),
        lock_iterations: PBKDF2_ITERATIONS,
        lock_key_pin: keyPin,
        lock_key_master: keyMaster,
        lock_key_account: keyAccount,
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
    lock_key_account: null,
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
 * Open a locked note's key envelope with a key derived from the account password.
 *
 * Returns the note key still encoded, rather than importing it as a CryptoKey.
 * That is deliberate: recovery needs to carry this exact string into a new wrap,
 * and importing it would mean having to export it again to get there. Passing the
 * string around keeps the key material in one representation and leaves the
 * round-trip through WebCrypto out of the recovery path entirely.
 */
export const openNoteKeyWithAccount = async (
    lock: NoteLockColumns,
    noteId: string,
    accountKey: CryptoKey,
): Promise<string | null> => {
    if (!lock.lock_key_account) return null;
    // Not consulted here on purpose. Recovery is not a guess: the caller has
    // already proved the account password, and making someone sit out a backoff
    // timer to recover a page they can already prove they own would be the
    // lockout punishing the legitimate owner for the attacker's benefit.
    return tryOpen(accountKey, lock.lock_key_account, `${AAD(noteId)}|account`);
};

/** Open a locked note's key envelope with its own PIN, still encoded. */
export const openNoteKeyWithPin = async (
    lock: NoteLockColumns,
    noteId: string,
    pin: string,
): Promise<string | null> => {
    if (!lock.lock_salt || !lock.lock_iterations || !lock.lock_key_pin) return null;
    if (isCoolingDown(lock)) return null;

    const pinKey = await deriveKey(pin, fromBase64(lock.lock_salt), lock.lock_iterations);
    return tryOpen(pinKey, lock.lock_key_pin, `${AAD(noteId)}|pin`);
};

/**
 * Move a locked note onto a new PIN, given its current key envelope.
 *
 * The recovery move, and the reason the note key is random rather than derived
 * from the PIN in the first place. Deriving would make this impossible: there
 * would be no key to carry over, so a PIN change would mean decrypting the note
 * and re-encrypting it from scratch. Here the content is untouched -- the same
 * ciphertext stays in the row, and only the wrap around its key changes.
 *
 * The account wrap is deliberately dropped. The caller has just proved ownership
 * with the account password; keeping a wrap keyed to a password they may change
 * next month would leave the page silently unrecoverable later, which is the
 * exact failure this function exists to undo. What survives is the PIN wrap, plus
 * the master wrap if the app vault is open.
 */
export const reWrapNotePin = async (
    encodedKey: string,
    noteId: string,
    newPin: string,
    options: { masterKey?: CryptoKey | null } = {},
): Promise<Partial<NoteLockColumns>> => {
    assertNotePin(newPin);
    const aad = AAD(noteId);

    // A fresh salt each time, even though the old one would technically do:
    // reusing a salt across two PBKDF2 runs over related PINs is exactly the
    // cross-run correlation the salt exists to prevent.
    const salt = randomBytes(SALT_BYTES);
    const pinKey = await deriveKey(newPin, salt, PBKDF2_ITERATIONS);
    const keyPin = await seal(pinKey, encodedKey, `${aad}|pin`);
    const keyMaster = options.masterKey
        ? await seal(options.masterKey, encodedKey, `${aad}|master`)
        : null;

    return {
        lock_enabled: true,
        lock_salt: toBase64(salt),
        lock_iterations: PBKDF2_ITERATIONS,
        lock_key_pin: keyPin,
        lock_key_master: keyMaster,
        lock_key_account: null,
        lock_key_recovery: null,
        lock_failed_attempts: 0,
        lock_retry_after: null,
    };
};

/** How long to refuse attempts after `attempts` failures.
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