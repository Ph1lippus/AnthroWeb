/**
 * Key derivation and authenticated encryption.
 *
 * The choices here are the ones the current guidance actually recommends, with
 * the reasoning kept inline because the numbers look arbitrary and are not:
 *
 *  - AES-256-GCM. GCM is authenticated, so a modified ciphertext fails to open
 *    rather than decrypting to garbage; 256-bit keys because there is no cost
 *    to it in WebCrypto and it is the only AES size NIST still considers
 *    appropriate for data with a long confidentiality lifetime (SP 800-57).
 *
 *  - A random 96-bit nonce per encryption, never a counter and never derived
 *    from the plaintext. SP 800-38D section 8.2 allows random IVs for GCM when
 *    the number of encryptions under one key stays far below 2^32, and makes
 *    deterministic or reused IVs a hard failure -- reusing a nonce under the
 *    same key leaks the authentication key and allows plaintext recovery. A
 *    random nonce makes reuse a probability rather than a coding mistake, which
 *    is the right trade for a client that re-encrypts the same note on every
 *    keystroke.
 *
 *  - AAD bound to the row. Without it, a ciphertext is a valid ciphertext
 *    anywhere: an attacker with write access could copy a sealed journal from
 *    one day to another, or a locked note's payload onto an unlocked note, and
 *    every decryption would succeed. Binding user id, table, row and field into
 *    the authenticated data means a ciphertext only opens where it belongs.
 *
 *  - PBKDF2-HMAC-SHA256 at 600_000 iterations. OWASP's guidance prefers Argon2id,
 *    which WebCrypto does not implement and which would mean shipping and
 *    reviewing a WASM implementation -- not a trade worth making for this. Among
 *    what the platform offers, PBKDF2-SHA256 at 600k is the current OWASP
 *    figure. The count is stored per row rather than fixed here, because the
 *    right number rises over time and a hardcoded one cannot be raised without
 *    shipping a new client to every user.
 *
 *  - 16-byte salts, per purpose. Salt is not secret; it exists so two identical
 *    PINs derive different keys and so precomputation across users is useless.
 */

import { constantTimeEqual, decodeUtf8, encodeUtf8, fromBase64, randomBytes, toBase64 } from './bytes';

/** OWASP's current figure for PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;

/** 128-bit salt. */
export const SALT_BYTES = 16;

/** AES-GCM nonce. 96 bits is the size GCM is defined for and the one with no
 *  additional derivation step. */
export const NONCE_BYTES = 12;

/** 256-bit key. */
export const KEY_BYTES = 32;

/** GCM's authentication tag, which travels in the same buffer as the ciphertext. */
export const TAG_BYTES = 16;

/** A derived key plus the parameters that produced it. */
export interface DerivedKey {
    key: CryptoKey;
    salt: Uint8Array<ArrayBuffer>;
    iterations: number;
}

/**
 * Derive a key from a passphrase.
 *
 * `extractable: false` on the result. Nothing needs to read these bytes back
 * out -- they exist only to unwrap a stored key or to seal data in this session
 * -- and making them non-extractable means there is no code path, ours or an
 * attacker's, that can serialise them. The `CryptoKey` can still be used.
 */
export const deriveKey = async (
    passphrase: string,
    salt: Uint8Array<ArrayBuffer>,
    iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> => {
    const material = await crypto.subtle.importKey(
        'raw',
        encodeUtf8(passphrase),
        'PBKDF2',
        false,
        ['deriveKey'],
    );

    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
};

/** A fresh AES-GCM key from random bytes. */
export const importRawKey = async (raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> =>
    crypto.subtle.importKey('raw', toArrayBuffer(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);

/**
 * Seal a value.
 *
 * Output is `base64(nonce || ciphertext || tag)`. The nonce is prepended rather
 * than kept alongside, so a sealed row is a single opaque string with no way to
 * separate or reuse parts of it by accident, and so the format is
 * self-contained -- decrypting does not require having also found the nonce.
 */
export const seal = async (
    key: CryptoKey,
    plaintext: string,
    aad: string,
): Promise<string> => {
    const nonce = randomBytes(NONCE_BYTES);
    const sealed = new Uint8Array<ArrayBuffer>(
        await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: toArrayBuffer(nonce), additionalData: encodeUtf8(aad), tagLength: 128 },
            key,
            encodeUtf8(plaintext),
        ),
    );

    const out = new Uint8Array(new ArrayBuffer(NONCE_BYTES + sealed.length));
    out.set(nonce, 0);
    out.set(sealed, NONCE_BYTES);
    return toBase64(out);
};

/**
 * Open a sealed value.
 *
 * Throws if the key is wrong, the AAD does not match, or a single bit of the
 * ciphertext was changed -- GCM cannot tell those apart, and deliberately so.
 *
 * `trySeal` below is the version callers use when that is a recoverable
 * condition; this one is for paths where it is not.
 */
export const open = async (
    key: CryptoKey,
    sealedBase64: string,
    aad: string,
): Promise<string> => {
    const bytes = fromBase64(sealedBase64);
    if (bytes.length < NONCE_BYTES + TAG_BYTES) {
        throw new Error('Sealed value is malformed');
    }
    const nonce = bytes.subarray(0, NONCE_BYTES);
    const body = bytes.subarray(NONCE_BYTES);

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(nonce), additionalData: encodeUtf8(aad), tagLength: 128 },
        key,
        toArrayBuffer(body),
    );
    return decodeUtf8(new Uint8Array<ArrayBuffer>(plaintext));
};

/** `open`, with the failure returned rather than thrown. */
export const tryOpen = async (
    key: CryptoKey,
    sealedBase64: string,
    aad: string,
): Promise<string | null> => {
    try {
        return await open(key, sealedBase64, aad);
    } catch {
        return null;
    }
};

/** Seal a JSON value. */
export const sealJson = (key: CryptoKey, value: unknown, aad: string): Promise<string> =>
    seal(key, JSON.stringify(value), aad);

/** Open a JSON value, or `null` on any failure. */
export const tryOpenJson = async <T>(
    key: CryptoKey,
    sealedBase64: string,
    aad: string,
): Promise<T | null> => {
    const raw = await tryOpen(key, sealedBase64, aad);
    if (raw === null) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
};

/**
 * Additional authenticated data for a row's payload.
 *
 * Every part is included, and the row id is included, because the row id is the
 * thing that stops a ciphertext being moved between rows. A payload sealed for
 * one day will not open as another day's, which is what makes "reorder these
 * rows in the database" a detectable act rather than a silent one.
 */
export const rowAad = (userId: string, table: string, rowId: string): string =>
    `anthroweb/v${VAULT_FORMAT_VERSION}|${userId}|${table}|${rowId}`;

/** Bumped only if the sealed format changes incompatibly. */
export const VAULT_FORMAT_VERSION = 1;

/** Verify a passphrase against a wrapped key, in constant time. */
export const verifyWrapped = async (
    key: CryptoKey,
    wrapped: Uint8Array<ArrayBuffer>,
    aad: string,
): Promise<Uint8Array<ArrayBuffer> | null> => {
    const opened = await tryOpen(key, toBase64(wrapped), aad);
    if (opened === null) return null;
    return encodeUtf8(opened);
};

/**
 * Comparison for anything the user has to enter twice.
 *
 * Not security-relevant -- both values are in the same string in the same
 * function -- but constant-time is the habit worth having in a file that
 * contains real key comparisons, so nobody reaches for `===` later and assumes
 * it is fine here.
 */
export const secretsMatch = (a: string, b: string): boolean =>
    constantTimeEqual(encodeUtf8(a), encodeUtf8(b));

/**
 * `Uint8Array<ArrayBuffer>` to `ArrayBuffer`, narrowed to exactly the view's own bytes.
 *
 * The slice is what makes a subarray work: `seal` builds its IV and ciphertext
 * views out of a larger buffer, and handing WebCrypto the whole underlying
 * buffer would pass it the neighbouring bytes as well. Passing the view itself
 * is not an option -- WebCrypto wants an `ArrayBuffer` and rejects the view on
 * some builds, silently truncates on others.
 */
const toArrayBuffer = (bytes: Uint8Array<ArrayBuffer>): ArrayBuffer =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
