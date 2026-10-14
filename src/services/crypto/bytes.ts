/**
 * Byte/string conversions, and the ones that have to be right every time.
 *
 * Everything in the vault crosses the network as base64 in a `text` column.
 * PostgREST returns `bytea` as a `\x`-prefixed hex string, which is a different
 * encoding with a different failure mode -- a key that looks fine and silently
 * unwraps to the wrong bytes -- so `bytea` is to be avoided on the wire and
 * base64 used instead. These are the only conversions involved.
 *
 * THAT RULE WAS FOLLOWED FOR ONE COLUMN OUT OF TWENTY-FIVE
 *
 * Migrations 0024 and 0025 declared every *wrapped key* as `bytea` while
 * documenting, in the same files, why they must not be. So values written before
 * migration 0027 arrive here in the hex spelling, and `atob` rejects a `\x`
 * prefix outright. Every unlock -- app PIN, recovery phrase, page PIN, account
 * recovery -- surfaced the platform's own message for it:
 *
 *   Failed to execute 'atob' on 'Window': The string to be decoded is not
 *   correctly encoded.
 *
 * which names neither the column nor the row, and is reached by the most
 * ordinary thing in the app: opening a locked page. `fromBase64` therefore reads
 * both spellings, so a value from before the migration still opens. 0027 converts
 * the columns, after which every one of them is `text` and this becomes the
 * belt to that migration's braces rather than the only thing standing there.
 */

/** UTF-8 encode. */
export const encodeUtf8 = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);

/** UTF-8 decode. */
export const decodeUtf8 = (bytes: Uint8Array<ArrayBuffer>): string => new TextDecoder().decode(bytes);

/**
 * Standard base64 with padding.
 *
 * Deliberately not `btoa`/`atob`. Those take and return *latin1* strings, so a
 * key byte above 0x7F silently becomes the wrong character -- and only fails once
 * it is far enough from the device that the mistake is hard to trace back.
 */
export const toBase64 = (bytes: Uint8Array<ArrayBuffer>): string => {
    let binary = '';
    // Chunked, because `String.fromCharCode(...bytes)` on a 32-byte key is fine
    // but on a sealed note body it throws "Maximum call stack size exceeded" at
    // around 65k arguments, and notes are not reliably small.
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
};

export const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
    const binary = POSTGRES_HEX.test(value) ? fromPostgresHex(value) : fromStandardBase64(value);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

/**
 * PostgREST's spelling of a `bytea` value: `\x` followed by hex, two characters
 * per byte.
 *
 * Only ever produced by the wire, never by this module -- nothing here writes a
 * `bytea` column -- so there is no encoder to pair it with. It is read and
 * nothing more.
 */
const POSTGRES_HEX = /^\\x[0-9a-fA-F]*$/;

/**
 * The bytes of a `\x`-prefixed hex string, as a latin1 string.
 *
 * Hex is validated by the pattern the caller matched it with before getting
 * here, so `parseInt` cannot return `NaN`: the length is even by construction
 * and every character is a hex digit.
 */
const fromPostgresHex = (value: string): string => {
    const hex = value.slice(2);
    let binary = '';
    for (let i = 0; i < hex.length; i += 2) {
        binary += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
    }
    return binary;
};

/**
 * Standard base64, with an error that says what actually went wrong.
 *
 * The raw `InvalidCharacterError` from `atob` is not usable: it names a browser
 * function rather than a value, it arrives at a notice stack with no indication
 * of which column produced it, and the message a user would read is "Failed to
 * execute 'atob' on 'Window'". A stored key is never user-supplied, so a failure
 * here is corruption, and is worth saying in those terms.
 */
const fromStandardBase64 = (value: string): string => {
    try {
        return atob(value);
    } catch {
        throw new Error('Stored key material is not valid base64.');
    }
};

/** UTF-8 string to base64, without a round trip through a byte array. */
export const encodeBase64Utf8 = (value: string): string => toBase64(encodeUtf8(value));

export const decodeBase64Utf8 = (value: string): string => decodeUtf8(fromBase64(value));

/**
 * Overwrite a buffer in place.
 *
 * A `Uint8Array<ArrayBuffer>` holds the key; dropping the reference only marks it for
 * collection, and the bytes stay readable in memory until then. On lock the
 * master key is zeroed explicitly, so a later heap read does not find it.
 *
 * Best-effort by nature -- the JS engine is free to have copied the bytes into a
 * register or a compiled temporary by now, and no Web API lets you stop that.
 * It meaningfully shortens the window; it does not close it.
 */
export const wipeBytes = (bytes: Uint8Array<ArrayBuffer> | null | undefined): void => {
    if (!bytes) return;
    bytes.fill(0);
};

/** Constant-time byte comparison. */
export const constantTimeEqual = (a: Uint8Array<ArrayBuffer>, b: Uint8Array<ArrayBuffer>): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
};

/**
 * `crypto.getRandomValues`, with the length argument the WebView actually wants.
 *
 * Older Android WebViews throw on a plain `new Uint8Array<ArrayBuffer>(n)` argument in some
 * builds and accept an `ArrayBuffer` in others, so this is defensive rather than
 * decorative.
 */
export const randomBytes = (length: number): Uint8Array<ArrayBuffer> => {
    const bytes = new Uint8Array(new ArrayBuffer(length));
    crypto.getRandomValues(bytes);
    return bytes;
};

/** Whether this environment can do the cryptography the vault needs at all. */
export const isCryptoAvailable = (): boolean =>
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.deriveBits === 'function';
