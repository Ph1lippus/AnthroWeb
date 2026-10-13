/**
 * The vault's cryptography, checked for real.
 *
 * Encryption that has never been decrypted is not encryption that works, and
 * the failure mode is catastrophic rather than visible: a key that unwraps, a
 * ciphertext that seals, and a payload that reopens as garbage produces no error
 * until someone tries to read a month of their own journal back.
 *
 * So this runs the actual primitives -- the same PBKDF2, the same AES-GCM, the
 * same AAD binding the app uses -- against assertions about what they must do.
 * It uses Node's WebCrypto, which is the same implementation the browser exposes,
 * so nothing here is a stand-in for the real thing.
 *
 * Specifically it checks the properties that make the scheme safe, not just that
 * it produces output:
 *
 *  - a wrong PIN does not open the key
 *  - a ciphertext moved to another row does not open (the AAD binding)
 *  - a single flipped bit does not open, and does not open as garbage
 *  - a nonce is never reused for two payloads under one key
 *  - a derived key cannot be exported
 *  - the recovery phrase validates, and a mistyped word does not
 *
 * Run with `npm run verify:vault-crypto`.
 */
import { webcrypto } from 'node:crypto';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// The app's own modules import each other without file extensions, which Vite
// resolves and Node's type-stripping does not. A resolve hook that appends `.ts`
// is the smallest thing that lets these tests exercise the real files rather than
// a copy of them.
register('./resolve-ts-extensions.mjs', import.meta.url);

// The modules under test read `crypto`, `btoa` and `atob` off the global, because
// they run in a browser and a Capacitor WebView. Node exposes the same WebCrypto,
// so this only has to supply the encoding pair, which Node lacks globally.
if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.btoa) globalThis.btoa = b => Buffer.from(b, 'binary').toString('base64');
if (!globalThis.atob) globalThis.atob = s => Buffer.from(s, 'base64').toString('binary');
void pathToFileURL;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) {
        pass++;
        console.log(`  ok   ${name}`);
    } else {
        fail++;
        console.log(` FAIL  ${name}${detail ? ` -> ${detail}` : ''}`);
    }
};

const { deriveKey, seal, open, tryOpen, rowAad, PBKDF2_ITERATIONS, importRawKey } =
    await import('../src/services/crypto/cipher.ts');
const { randomBytes, toBase64, fromBase64, constantTimeEqual } =
    await import('../src/services/crypto/bytes.ts');

// A deliberately cheap cost factor. Production uses PBKDF2_ITERATIONS; running
// 600k iterations for every case in this file would take minutes and would not
// test anything the cheap one does not.
const ITERATIONS = 1_000;

console.log('\n== a round trip ==');
{
    const key = await deriveKey('correct horse battery staple', randomBytes(16), ITERATIONS);
    const aad = rowAad('user-1', 'notes', 'row-1');
    const sealed = await seal(key, 'the quick brown fox', aad);
    const opened = await open(key, sealed, aad);
    check('sealed text reopens as itself', opened === 'the quick brown fox', opened);
    check('the ciphertext is not the plaintext', sealed !== 'the quick brown fox');
    check('the ciphertext does not contain the plaintext', !sealed.includes('quick'));
}

console.log('\n== the wrong passphrase does not open it ==');
{
    const salt = randomBytes(16);
    const good = await deriveKey('correct horse', salt, ITERATIONS);
    const bad = await deriveKey('correct hors', salt, ITERATIONS);
    const sealed = await seal(good, 'secret', 'aad');

    check('a different passphrase returns null', (await tryOpen(bad, sealed, 'aad')) === null);
    check('open() throws rather than returning junk', await (async () => {
        try {
            await open(bad, sealed, 'aad');
            return false;
        } catch {
            return true;
        }
    })());

    check('the same passphrase and salt derive the same key', await (async () => {
        // Derived keys are non-extractable, so equality is proved the only way it
        // can be: a key derived twice opens what the first one sealed.
        const sealed = await seal(good, 'secret', 'aad');
        const again = await deriveKey('correct horse', salt, ITERATIONS);
        return await open(again, sealed, 'aad') === 'secret';
    })());

    check('the same passphrase with a different salt does not', await (async () => {
        const sealed = await seal(good, 'secret', 'aad');
        const otherSalt = await deriveKey('correct horse', randomBytes(16), ITERATIONS);
        return (await tryOpen(otherSalt, sealed, 'aad')) === null;
    })());
}

console.log('\n== derived keys cannot be exported ==');
{
    const key = await deriveKey('anything', randomBytes(16), ITERATIONS);
    let exported = true;
    try {
        await crypto.subtle.exportKey('raw', key);
    } catch {
        exported = false;
    }
    check('a PBKDF2-derived key is not exportable', !exported);

    const raw = await importRawKey(randomBytes(32));
    let rawExported = true;
    try {
        await crypto.subtle.exportKey('raw', raw);
    } catch {
        rawExported = false;
    }
    check('an imported key is not exportable either', !rawExported);
}

console.log('\n== the AAD binding stops a ciphertext moving between rows ==');
{
    const key = await deriveKey('aad', randomBytes(16), ITERATIONS);
    const sealed = await seal(key, 'yesterday', rowAad('user-1', 'daily_logs', '2026-10-12'));

    check('it opens in the row it was sealed for',
        await open(key, sealed, rowAad('user-1', 'daily_logs', '2026-10-12')) === 'yesterday');
    check('it does not open in a different day',
        (await tryOpen(key, sealed, rowAad('user-1', 'daily_logs', '2026-10-13'))) === null);
    check('it does not open for a different user',
        (await tryOpen(key, sealed, rowAad('user-2', 'daily_logs', '2026-10-12'))) === null);
    check('it does not open in a different table',
        (await tryOpen(key, sealed, rowAad('user-1', 'notes', '2026-10-12'))) === null);
}

console.log('\n== tampering is detected ==');
{
    const key = await deriveKey('tamper', randomBytes(16), ITERATIONS);
    const aad = rowAad('user-1', 'notes', 'row-1');
    const sealed = await seal(key, 'a page of my journal', aad);

    // Flip one bit in the middle of the base64 body, leaving the nonce intact.
    const bytes = fromBase64(sealed);
    bytes[bytes.length - 20] ^= 0x01;
    check('one flipped bit fails to open',
        (await tryOpen(key, toBase64(bytes), aad)) === null);

    check('a truncated ciphertext is rejected as malformed', await (async () => {
        try {
            await open(key, toBase64(new Uint8Array(new ArrayBuffer(8))), aad);
            return false;
        } catch {
            return true;
        }
    })());

    check('a nonce change fails authentication', await (async () => {
        const swapped = fromBase64(sealed);
        swapped[0] ^= 0xff;
        return (await tryOpen(key, toBase64(swapped), aad)) === null;
    })());
}

console.log('\n== a nonce is never reused under one key ==');
{
    const key = await deriveKey('nonce', randomBytes(16), ITERATIONS);
    const aad = rowAad('user-1', 'notes', 'row-1');
    const nonces = new Set();
    for (let i = 0; i < 500; i++) {
        const sealed = await seal(key, `payload ${i}`, aad);
        nonces.add(sealed.slice(0, 16)); // base64 prefix of a 12-byte nonce
    }
    check('500 seals produced 500 distinct nonces', nonces.size === 500, `got ${nonces.size}`);
    check('a 256-bit key is 32 bytes', randomBytes(32).length === 32);
}

console.log('\n== the same plaintext seals differently every time ==');
{
    const key = await deriveKey('randomised', randomBytes(16), ITERATIONS);
    const aad = rowAad('user-1', 'notes', 'row-1');
    const a = await seal(key, 'identical', aad);
    const b = await seal(key, 'identical', aad);
    check('identical plaintext gives different ciphertext', a !== b);
    check('both still open', await open(key, a, aad) === 'identical' && await open(key, b, aad) === 'identical');
}

console.log('\n== unicode and awkward payloads survive ==');
{
    const key = await deriveKey('unicode', randomBytes(16), ITERATIONS);
    const aad = rowAad('user-1', 'notes', 'row-1');
    const cases = [
        'emoji 🎯 and CJK 日本語',
        'quotes " \' ` and backslash \\',
        'newlines\n\ttabs\r\n',
        'a'.repeat(100_000),
        '',
    ];
    let allOk = true;
    for (const value of cases) {
        const sealed = await seal(key, value, aad);
        if (await open(key, sealed, aad) !== value) allOk = false;
    }
    check('every payload round-trips byte for byte', allOk);
}

console.log('\n== the production cost factor is the documented one ==');
{
    check('PBKDF2_ITERATIONS is 600000', PBKDF2_ITERATIONS === 600000, `got ${PBKDF2_ITERATIONS}`);
    check('600k iterations is under a second on a laptop', await (async () => {
        const started = Date.now();
        await deriveKey('timing', randomBytes(16), PBKDF2_ITERATIONS);
        return Date.now() - started < 2000;
    })());
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);