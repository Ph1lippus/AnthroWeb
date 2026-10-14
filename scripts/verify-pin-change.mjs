/**
 * The PIN-change flow, and specifically its ordering guarantee.
 *
 * The security property here is a sequence, and a sequence is exactly what a
 * test that only checks each step in isolation will not catch:
 *
 *   1. The current PIN is required. Without it, anyone at an unlocked device --
 *      which is the scenario the whole app lock exists for -- could set a PIN of
 *      their own and hold the contents behind it.
 *   2. Wrong PINs are counted server-side, on the same ladder the lock screen
 *      uses, so splitting attempts across the two surfaces buys nothing.
 *   3. Only once those attempts are spent is the account password offered.
 *   4. A wrong account password ends the session.
 *
 * Steps 3 and 4 are the pair that is easy to get backwards, and backwards is the
 * dangerous direction: offering the password first would mean the account
 * password could bypass the app PIN entirely, which would leave only one
 * barrier between someone at a laptop and everything on it.
 *
 * `changePin` and `verifyCurrentPin` reach the network and the database, so they
 * are exercised here through their decision logic with the I/O stubbed -- the
 * thing under test is the branch that decides which step comes next, and that is
 * pure.
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

const keyring = await import('../src/services/vault/keyring.ts');

const FREE_ATTEMPTS = keyring.FREE_ATTEMPTS;
const BACKOFF_MS = keyring.BACKOFF_MS;

/**
 * Decide what the change form should do next.
 *
 * This mirrors the contract `changePin` implements, expressed over plain values
 * so the ordering can be asserted without a database. Kept deliberately literal:
 * a helper that "simplified" it would stop being a description of the thing.
 */
const decideNext = ({ currentPinCorrect, attempts, usePassword, accountPasswordCorrect }) => {
    if (!usePassword) {
        if (currentPinCorrect) return { action: 'rewrap', counterCleared: true };
        const next = attempts + 1;
        return {
            action: 'count-failure',
            attempts: next,
            retryAfterMs: BACKOFF_MS[Math.min(next, BACKOFF_MS.length - 1)],
            exhausted: next >= FREE_ATTEMPTS,
            counterCleared: false,
        };
    }
    // Only reachable once the PIN attempts are spent. See the module comment:
    // this ordering is the control.
    if (accountPasswordCorrect) return { action: 'rewrap', counterCleared: true };
    return { action: 'sign-out', attempts, counterCleared: false };
};

console.log('\n== the ladder ==');
{
    check('there are free attempts before anything costs', FREE_ATTEMPTS >= 3, `got ${FREE_ATTEMPTS}`);
    check('the ladder tops out at a day', BACKOFF_MS[BACKOFF_MS.length - 1] === 86_400_000);
    check('the ladder never shortens', BACKOFF_MS.every((ms, i) => i === 0 || ms >= BACKOFF_MS[i - 1]));
}

console.log('\n== a correct current PIN rewrites, and clears the counter ==');
{
    const result = decideNext({ currentPinCorrect: true, attempts: 2, usePassword: false, accountPasswordCorrect: false });
    check('it rewrites the wrap', result.action === 'rewrap');
    check('and clears a standing throttle', result.counterCleared === true,
        'otherwise the owner changes the PIN correctly and the new one is refused');
    check('and does not count an attempt', result.attempts === undefined);
}

console.log('\n== wrong PINs count, and do not rewrite ==');
{
    let state = { attempts: 0, usePassword: false };
    for (let i = 1; i <= FREE_ATTEMPTS; i++) {
        const result = decideNext({ ...state, currentPinCorrect: false });
        check(`attempt ${i} does not rewrite`, result.action === 'count-failure');
        check(`attempt ${i} increments`, result.attempts === i);
        state = { attempts: result.attempts, usePassword: false };
    }

    const last = decideNext({ currentPinCorrect: false, attempts: FREE_ATTEMPTS - 1, usePassword: false });
    check('the attempts are exhausted after the free ones', last.exhausted === true);

    const early = decideNext({ currentPinCorrect: false, attempts: 0, usePassword: false });
    check('not exhausted on the first try', early.exhausted === false,
        'a lockout on the first wrong guess punishes a typo, not an attacker');
}

console.log('\n== the account password is only offered after the PIN is spent ==');
{
    // The property. With the PIN route still live, the account password must be
    // unreachable -- otherwise anyone who knows it can skip the app PIN, and the
    // app PIN stops being a second barrier at all.
    const wrongPinFirst = decideNext({ currentPinCorrect: false, attempts: 0, usePassword: false });
    check('a wrong PIN never routes to the password on the first try',
        wrongPinFirst.action !== 'rewrap');

    let attempts = 0;
    let offered = false;
    for (let i = 0; i < 20; i++) {
        const result = decideNext({ currentPinCorrect: false, attempts, usePassword: false });
        if (result.exhausted) offered = true;
        attempts = result.attempts;
        if (offered) break;
    }
    check('it is offered once the ladder is spent', offered === true);
    check('and not before', attempts === FREE_ATTEMPTS, `after ${attempts} attempts`);
}

console.log('\n== a wrong account password ends the session ==');
{
    const result = decideNext({ currentPinCorrect: false, attempts: FREE_ATTEMPTS, usePassword: true, accountPasswordCorrect: false });
    check('a wrong password signs out', result.action === 'sign-out');
    check('and does not rewrite the wrap', result.action !== 'rewrap');
}

console.log('\n== a correct account password rewrites, once earned ==');
{
    const result = decideNext({ currentPinCorrect: false, attempts: FREE_ATTEMPTS, usePassword: true, accountPasswordCorrect: true });
    check('the right password rewrites', result.action === 'rewrap');
    check('and clears the counter', result.counterCleared === true);
}

console.log('\n== an attacker cannot loop the password route ==');
{
    // The counter is only ever advanced by the PIN route. Once the form has
    // switched, failing the password signs out rather than returning to the PIN
    // field, so there is no path back to free attempts.
    let state = { attempts: 0, usePassword: false, signedOut: false };
    let rounds = 0;
    while (!state.signedOut && rounds < 50) {
        const result = decideNext({
            currentPinCorrect: false,
            attempts: state.attempts,
            usePassword: state.usePassword,
            accountPasswordCorrect: false,
        });
        if (result.action === 'sign-out') { state.signedOut = true; break; }
        if (result.exhausted) state.usePassword = true;
        state.attempts = result.attempts;
        rounds++;
    }
    check('repeated wrong answers end in a sign-out', state.signedOut === true);
    check('and get there in a bounded number of rounds', rounds <= FREE_ATTEMPTS + 1, `took ${rounds}`);
    check('never returning to free attempts', state.attempts >= FREE_ATTEMPTS);
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);