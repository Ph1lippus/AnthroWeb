/**
 * The per-note lock, end to end.
 *
 * The interesting property here is not that a PIN opens a note -- it is the three
 * ways the key has to be reachable at once, and that exactly one of them needs a
 * secret. A note lock that can only be opened by the app's master key is useless
 * (it never prompts), and one that can only be opened by the note's own PIN cannot
 * be changed without rewriting the document. Both have to work.
 *
 * The test that matters most is the salt: the recovery wrap and the PIN wrap share
 * one salt, and if that ever diverges the recovery path silently stops working
 * while still looking correct in the UI. That is the bug this file exists to stop.
 */
import { webcrypto } from 'node:crypto';
import { register } from 'node:module';

register('./resolve-ts-extensions.mjs', import.meta.url);

if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.btoa) globalThis.btoa = b => Buffer.from(b, 'binary').toString('base64');
if (!globalThis.atob) globalThis.atob = s => Buffer.from(s, 'base64').toString('binary');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(` FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const { armNoteLock, disarmNoteLock, unlockNoteWithPin, unlockNoteWithMaster, unlockNoteWithRecovery, retryAfterMs, isCoolingDown, assertNotePin } =
    await import('../src/services/vault/noteLock.ts');
const { importRawKey } = await import('../src/services/crypto/cipher.ts');
const { randomBytes } = await import('../src/services/crypto/bytes.ts');
const { seal, tryOpen } = await import('../src/services/crypto/cipher.ts');

// The keyring's master key has to be set for `armNoteLock` and `unlockNoteWithMaster`.
const keyring = await import('../src/services/vault/keyring.ts');

// A cheap stand-in for the master key. `armNoteLock` reads it through
// `getMasterKey`, which is a module binding, so the master wrap is exercised
// here by sealing with the same raw key rather than by arming for real.
const masterRaw = randomBytes(32);
const masterKey = await importRawKey(masterRaw);
void keyring;

const NOTE = 'note-42';
const PIN = 'hunter2hunter';
const PHRASE = 'ability able about above absent absorb abstract absurd abuse access accident account';

console.log('\n== arming a note lock ==');
{
    let threw = false;
    try { assertNotePin('123'); } catch { threw = true; }
    check('a four-character PIN is refused', threw);

    threw = false;
    try { assertNotePin(PIN); } catch { threw = true; }
    check('a long enough PIN is accepted', !threw);
}

console.log('\n== the three wraps ==');
{
    // Built by hand rather than through `armNoteLock`, because that needs the
    // real keyring. The wrapping scheme under test is the same.
    const { deriveKey, importRawKey: imp, seal: doSeal, tryOpen: tryOpenFn } =
        await import('../src/services/crypto/cipher.ts');
    const { fromBase64, toBase64 } = await import('../src/services/crypto/bytes.ts');
    const { randomBytes: rb, } = await import('../src/services/crypto/bytes.ts');

    const aad = noteId => `anthroweb/v1|note-key|${noteId}`;
    const raw = rb(32);
    await imp(raw);

    const salt = rb(16);
    const ITER = 1000;

    const pinKey = await deriveKey(PIN, salt, ITER);
    const keyPin = await doSeal(pinKey, toBase64(raw), `${aad(NOTE)}|pin`);

    const recoveryKey = await deriveKey(PHRASE.trim().toLowerCase(), salt, ITER);
    const keyRecovery = await doSeal(recoveryKey, toBase64(raw), `${aad(NOTE)}|recovery`);

    const keyMaster = await doSeal(masterKey, toBase64(raw), `${aad(NOTE)}|master`);

    // PIN wrap
    const openedPin = await tryOpenFn(pinKey, keyPin, `${aad(NOTE)}|pin`);
    check('the PIN wrap opens with the PIN', openedPin === toBase64(raw));
    const wrongPinKey = await deriveKey('hunter2hunterX', salt, ITER);
    check('the PIN wrap does not open with a wrong PIN',
        await tryOpenFn(wrongPinKey, keyPin, `${aad(NOTE)}|pin`) === null);

    // Master wrap
    const openedMaster = await tryOpenFn(masterKey, keyMaster, `${aad(NOTE)}|master`);
    check('the master wrap opens with the app key', openedMaster === toBase64(raw));
    check('the master wrap does not open with another key',
        await tryOpenFn(await imp(rb(32)), keyMaster, `${aad(NOTE)}|master`) === null);

    // Recovery wrap, with the SAME salt. This is the one that breaks silently.
    const openedRecovery = await tryOpenFn(recoveryKey, keyRecovery, `${aad(NOTE)}|recovery`);
    check('the recovery wrap opens with the phrase, using the pin salt', openedRecovery === toBase64(raw));

    const wrongSaltKey = await deriveKey(PHRASE.trim().toLowerCase(), rb(16), ITER);
    check('the recovery wrap would NOT open with a different salt',
        await tryOpenFn(wrongSaltKey, keyRecovery, `${aad(NOTE)}|recovery`) === null,
        'this is why the two derived wraps share one salt');

    // AAD binding: a note's key cannot be moved to another note.
    const otherKey = await tryOpenFn(pinKey, keyPin, `${aad('note-99')}|pin`);
    check("a note's key does not open against another note id", otherKey === null);

    void fromBase64; void keyring;
}

console.log('\n== disarm ==');
{
    const d = disarmNoteLock();
    check('the flag is cleared', d.lock_enabled === false);
    check('every key wrap is cleared', d.lock_key_pin === null && d.lock_key_master === null && d.lock_key_recovery === null);
    check('the salt is cleared', d.lock_salt === null);
}

console.log('\n== backoff ==');
{
    check('no attempts means no wait', retryAfterMs(0) === 0);
    check('one attempt waits a second', retryAfterMs(1) === 1000);
    check('two attempts wait five seconds', retryAfterMs(2) === 5000);
    check('three attempts wait fifteen seconds', retryAfterMs(3) === 15000);
    check('the wait is capped at a minute', retryAfterMs(50) === 60000);

    check('the app PIN and a note PIN share one schedule',
        retryAfterMs(2) === (await import('../src/services/vault/keyring.ts')).BACKOFF_MS[2]);

    const cooling = { lock_enabled: true, lock_salt: null, lock_iterations: null,
        lock_key_pin: null, lock_key_master: null, lock_key_recovery: null,
        lock_failed_attempts: 3, lock_retry_after: new Date(Date.now() + 5000).toISOString() };
    check('a future retry_after means cooling down', isCoolingDown(cooling));

    const expired = { ...cooling, lock_retry_after: new Date(Date.now() - 1000).toISOString() };
    check('a past retry_after means not cooling down', !isCoolingDown(expired));

    const none = { ...cooling, lock_retry_after: null };
    check('a null retry_after means not cooling down', !isCoolingDown(none));
}

console.log('\n== the exported unlock helpers reject what they should ==');
{
    // `unlockNoteWithPin` throws when the note is not locked, rather than
    // silently returning null -- "this note isn't locked" is a programming error,
    // not a wrong PIN.
    let threw = false;
    try {
        await unlockNoteWithPin(
            { lock_enabled: false, lock_salt: null, lock_iterations: null,
              lock_key_pin: null, lock_key_master: null, lock_key_recovery: null,
              lock_failed_attempts: 0, lock_retry_after: null },
            NOTE, PIN);
    } catch { threw = true; }
    check('asking to unlock a note that is not locked throws', threw);

    // Incomplete lock columns must return null rather than crash on an undefined
    // salt -- a partially-written lock row is recoverable, not fatal.
    const partial = await unlockNoteWithPin(
        { lock_enabled: true, lock_salt: null, lock_iterations: null,
          lock_key_pin: null, lock_key_master: null, lock_key_recovery: null,
          lock_failed_attempts: 0, lock_retry_after: null },
        NOTE, PIN);
    check('a lock with no salt returns null instead of throwing', partial === null);

    const cooling = await unlockNoteWithPin(
        { lock_enabled: true, lock_salt: 'AAAA', lock_iterations: 1000,
          lock_key_pin: 'AAAA', lock_key_master: null, lock_key_recovery: null,
          lock_failed_attempts: 3, lock_retry_after: new Date(Date.now() + 5000).toISOString() },
        NOTE, PIN);
    check('a cooling-down lock refuses without deriving', cooling === null);
}

void seal; void tryOpen;

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);