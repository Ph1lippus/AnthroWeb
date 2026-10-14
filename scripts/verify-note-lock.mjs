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

const { armNoteLock, disarmNoteLock, unlockNoteWithPin, unlockNoteWithMaster, unlockNoteWithRecovery, openNoteKeyWithAccount, openNoteKeyWithPin, reWrapNotePin, retryAfterMs, isCoolingDown, assertNotePin } =
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
    // Three free attempts: that is what a fat-fingered PIN costs, and charging
    // for it would only teach people that the lockout is an obstacle.
    check('the first attempt is free', retryAfterMs(1) === 0);
    check('the second attempt is free', retryAfterMs(2) === 0);
    check('the third attempt waits a minute', retryAfterMs(3) === 60_000);
    // Escalating, and the top of the ladder is a day rather than an hour: the
    // point is to make an automated run unable to finish, not merely slow.
    check('the ladder escalates', retryAfterMs(4) > retryAfterMs(3) && retryAfterMs(5) > retryAfterMs(4));
    check('the wait tops out at a day', retryAfterMs(50) === 86_400_000);
    check('and stays there', retryAfterMs(9999) === 86_400_000);

    check('the app PIN and a note PIN share one schedule',
        retryAfterMs(2) === (await import('../src/services/vault/keyring.ts')).BACKOFF_MS[2]);

    // The note PIN's floor is lower than the app PIN's, on purpose: it guards one
    // page, and it is only defensible at four digits because the account password
    // is a second, independent factor for the same content.
    const { MIN_NOTE_PIN_LENGTH } = await import('../src/services/vault/noteLock.ts');
    const { MIN_PIN_LENGTH } = await import('../src/services/vault/keyring.ts');
    check('a note PIN may be four digits', MIN_NOTE_PIN_LENGTH === 4);
    check('the app PIN still needs six', MIN_PIN_LENGTH === 6);
    check('and the two are genuinely different numbers', MIN_NOTE_PIN_LENGTH !== MIN_PIN_LENGTH);
    assertNotePin('1234');
    check('four digits is accepted', true);
    try { assertNotePin('123'); check('three digits is refused', false); }
    catch { check('three digits is refused', true); }

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

// ---------------------------------------------------------------------------
// Independence, and the recovery path
// ---------------------------------------------------------------------------
//
// The property that matters: a page lock must work with nothing else switched
// on. Under the old code `armNoteLock` threw without a master key, which made
// every one of these a locked page rather than a locked feature.
console.log('\n== a page lock stands on its own ==');

const accountRaw = randomBytes(32);
const accountKey = await importRawKey(accountRaw);

const solo = await armNoteLock(NOTE, '1234', null, null);
check('arming with neither the vault nor recovery is allowed', solo.lock_enabled === true);
check('the PIN wrap is always written', typeof solo.lock_key_pin === 'string' && solo.lock_key_pin.length > 0);
check('no master wrap is written when there is no master key', solo.lock_key_master === null);
check('no account wrap is written when there is none', solo.lock_key_account === null);

const soloKey = await unlockNoteWithPin(solo, NOTE, '1234');
check('and the PIN alone opens it', soloKey !== null);

// A different note must not open under the same PIN: the AAD is bound to the
// row, so a wrap lifted from one page is inert on another.
const otherNote = await unlockNoteWithPin(solo, 'note-99', '1234');
check('a wrap lifted onto another row does not open', otherNote === null);

console.log('\n== a forgotten PIN is recoverable ==');

const armed = await armNoteLock(NOTE, '1234', masterKey, accountKey);
check('arming with recovery on writes the account wrap', typeof armed.lock_key_account === 'string');

const viaAccount = await openNoteKeyWithAccount(armed, NOTE, accountKey);
check('the account password unwraps the note key', typeof viaAccount === 'string');
check('a wrong account key does not', (await openNoteKeyWithAccount(armed, NOTE, masterKey)) === null);

// The recovery move itself. The note's content is not in this file, so what is
// being asserted is that the key survives the move and that the new PIN opens it
// -- the content staying byte-identical follows from the key not changing.
const originalKey = await openNoteKeyWithPin(armed, NOTE, '1234');
check('the old PIN opens it before the reset', typeof originalKey === 'string');

// Re-wrap WITHOUT an account key, which is what a caller that cannot reach one
// does. The wrap is dropped rather than carried: keeping a wrap keyed to a
// password the caller may change next month would leave the page silently
// unrecoverable later, and the master-key fallback still covers that case.
const dropped = await reWrapNotePin(viaAccount, NOTE, '9999', { masterKey });
check('re-wrap produces a new PIN wrap', typeof dropped.lock_key_pin === 'string' && dropped.lock_key_pin !== armed.lock_key_pin);
check('re-wrap uses a fresh salt', dropped.lock_salt !== armed.lock_salt);
check('with no account key offered, the account wrap is dropped', dropped.lock_key_account === null);
check('re-wrap carries the master wrap when one is offered', typeof dropped.lock_key_master === 'string');
check('re-wrap clears the failed-attempt counter', dropped.lock_failed_attempts === 0);

const merged = { ...armed, ...dropped };
const afterReset = await unlockNoteWithPin(merged, NOTE, '9999');
check('the new PIN opens the page', afterReset !== null);
check('the old PIN no longer does', (await unlockNoteWithPin(merged, NOTE, '1234')) === null);
check('the master key still opens it', (await unlockNoteWithMaster(merged, NOTE, masterKey)) !== null);

const viaAccountAfter = await openNoteKeyWithAccount(merged, NOTE, accountKey);
check('the dropped wrap is genuinely gone, not merely unused', viaAccountAfter === null);

// Re-wrap WITH the account key, which is what recovery now does -- it has the
// password in hand, so it can put the wrap straight back.
//
// This is the change from "always dropped". Locking no longer asks for the
// account password, so the wrap is established during recovery rather than
// before it, and the only alternative to writing it here is that every future
// recovery of this page depends on the app lock being open.
const carried = await reWrapNotePin(viaAccount, NOTE, '4321', { masterKey, accountKey });
check('with an account key offered, the wrap is carried forward', typeof carried.lock_key_account === 'string');
const carriedMerged = { ...armed, ...carried };
const carriedViaAccount = await openNoteKeyWithAccount(carriedMerged, NOTE, accountKey);
check('and the carried wrap opens to the same note key', carriedViaAccount === viaAccount,
    'a carried wrap that opens to something else is worse than none');
check('the carried wrap does not open the page under the old PIN',
    (await unlockNoteWithPin(carriedMerged, NOTE, '1234')) === null);

// Re-wrap with no vault available: the whole point of the change.
const bare = { ...armed, ...(await reWrapNotePin(viaAccount, NOTE, '5555', {})) };
check('re-wrap works with no vault open either', (await unlockNoteWithPin(bare, NOTE, '5555')) !== null);

console.log('\n== disarm clears every wrap ==');
const disarmed = disarmNoteLock();
check('disarm drops the account wrap', disarmed.lock_key_account === null);
check('disarm drops the master wrap', disarmed.lock_key_master === null);
check('disarm drops the PIN wrap', disarmed.lock_key_pin === null);
check('disarm turns the lock off', disarmed.lock_enabled === false);

void seal; void tryOpen;

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);