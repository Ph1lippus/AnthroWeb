/**
 * Byte/string conversions, and the ones that have to be right every time.
 *
 * Everything in the vault crosses the network as base64 in a `text` column.
 * PostgREST returns `bytea` as a `\x`-prefixed hex string, which is a different
 * encoding with a different failure mode -- a key that looks fine and silently
 * unwraps to the wrong bytes -- so `bytea` is avoided on the wire and base64 is
 * used instead. `vault` and the wrapped-key columns are `text`, not `bytea`, and
 * these are the only conversions involved.
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
    const binary = atob(value);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
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
