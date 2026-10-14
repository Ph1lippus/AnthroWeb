/**
 * The PIN-change flow, checked against the source rather than the logic.
 *
 * `verify-pin-change.mjs` proves the *ordering* is right. This proves the code
 * actually does what that ordering assumes, which is a different failure: the
 * decision logic can be perfect while the form wires it to the wrong handler, or
 * a later edit puts the password field back on the first screen.
 *
 * The regression that matters is specific and has happened once already in this
 * repository: `changePin` was changed from taking the current PIN to taking only
 * the new one, and nothing failed. TypeScript was happy, lint was happy, and all
 * twenty-eight suites passed -- because no test asserted that the old PIN was
 * ever asked for. This file is that assertion.
 */
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(` FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const code = rel => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const lock = code('src/hooks/useAppLock.ts');
const settings = code('src/Components/Security/SecuritySettings.tsx');

console.log('\n== changePin requires the current PIN ==');
{
    check('changePin takes two arguments',
        /export const changePin = async \(\s*currentPin: string,\s*nextPin: string,/.test(lock));

    check('it verifies the old one before rewriting',
        /export const changePin[\s\S]*?verifyCurrentPin\(currentPin\)[\s\S]*?applyNewPin/.test(lock));

    check('a failed proof returns without rewriting',
        /if \(!proof\.ok\) \{[\s\S]*?return \{[\s\S]*?ok: false/.test(lock));

    check('the rewrite is not reachable without a proof',
        (lock.match(/applyNewPin\(/g) || []).length === 2,
        'expected the definition plus exactly one call inside changePin');

    check('there is no PIN-less entry point left',
        !/export const changePin = async \(nextPin: string\)/.test(lock),
        'the signature that lost the current-PIN check is the exact regression');
}

console.log('\n== the proof is counted server-side ==');
{
    check('the attempt counter is incremented',
        /vault_failed_attempts: attempts/.test(lock));

    check('a deadline is written with it',
        /vault_retry_after: backoff > 0 \? new Date/.test(lock));

    check('the counter is shared with the lock screen',
        (lock.match(/vault_failed_attempts: 0/g) || []).length >= 2,
        'the unlock path and the change path both clear it, so one ladder covers both');

    check('a standing throttle is refused before any derivation',
        /appRetryRemainingMs\(settings[\s\S]*?if \(wait > 0\)/.test(lock));

    check('a wrong proof leaves the vault untouched',
        !/verifyCurrentPin[\s\S]{0,600}lockKeyring\(\)/.test(lock),
        'a failed proof must not drop the key out from under an unlocked app');
}

console.log('\n== the password route comes second and ends the session ==');
{
    check('a separate exported entry point exists',
        /export const changePinWithAccountPassword = async \(/.test(lock));

    check('it verifies through Supabase',
        /verifyAccountPassword\(password\)/.test(lock));

    check('a failure ends the session',
        /if \(!await verifyAccountPassword\(password\)\) \{[\s\S]*?endSession\(\)/.test(lock));

    check('ending the session signs out and locks',
        /const endSession[\s\S]*?supabase\.auth\.signOut\(\)[\s\S]*?lock\(\)/.test(lock));

    check('it reports that it signed out',
        /signedOut: true/.test(lock));

    check('a sign-out that throws does not skip the lock',
        /catch \(error\)[\s\S]*?console\.warn[\s\S]*?lock\(\)/.test(lock));
}

console.log('\n== the form asks, in that order ==');
{
    check('the current PIN field exists',
        /id="vault-current-pin"/.test(settings));

    check('it is bound to the change-PIN state',
        /id="vault-current-pin"[\s\S]*?value=\{currentPin\}/.test(settings));

    check('the account password field exists',
        /id="vault-account-password"/.test(settings));

    check('it is bound to the change-password state, not the recovery one',
        /id="vault-account-password"[\s\S]*?value=\{changePassword\}/.test(settings),
        'a shared field would let a value typed for one flow appear in the other');

    check('the password form is behind a branch',
        /\{usePassword \? \(/.test(settings));

    check('the PIN form is the fallback of that branch',
        /\) : \(\s*<>\s*<label className="form-label" htmlFor="vault-current-pin">/.test(settings));

    check('exhaustion switches to the password route',
        /if \(result\.exhausted\) setUsePassword\(true\)/.test(settings));

    check('changePin is called with both values',
        /changePin\(currentPin, pin\)/.test(settings));

    check('the password route is called with both values',
        /changePinWithAccountPassword\(changePassword, pin\)/.test(settings));

    check('the PIN field is disabled once the route has switched',
        /\{usePassword \? \([\s\S]*?\) : \([\s\S]*?id="vault-current-pin"/.test(settings));
}

console.log('\n== nothing weakens the lock screen ==');
{
    check('unlockWithRecoveryPhrase is not offered as a PIN-change route',
        !/changePinWithAccountPassword[\s\S]{0,800}unlockWithRecoveryPhrase/.test(lock));

    check('the recovery phrase is still confined to the lock screen',
        /export const unlockWithRecovery = async \(phrase: string\)/.test(lock));

    check('the app PIN keeps its own minimum of six',
        /MIN_PIN_LENGTH = 6/.test(read('src/services/vault/keyring.ts')));

    check('note PINs keep their own, lower, minimum',
        /MIN_NOTE_PIN_LENGTH = \d+/.test(read('src/services/vault/noteLock.ts')));

    check('the two minimums are not the same constant',
        /MIN_NOTE_PIN_LENGTH = 4/.test(read('src/services/vault/noteLock.ts')),
        'sharing one meant changing the app PIN silently changed what a note accepted');
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);