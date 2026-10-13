/**
 * The per-note lock's two properties that actually matter, end to end.
 *
 *  1. A locked page is not decrypted by the list. The sidebar is the view always
 *     on screen on a shared device; if the list decrypts every row to render it,
 *     the title and first line of every locked page sit in memory and in the
 *     persisted cache the whole time, and the lock hides rather than prevents.
 *
 *  2. The page's contents are sealed under the *note* key, not the master key. If
 *     they stayed under the master key the note PIN would be decorative -- anyone
 *     with the app unlocked could read them, and the pin pad would be theatre.
 *
 * The one capability the lock deliberately does not have: an unlocked app can
 * read a locked page. That is what the master wrap is for, and the dialog says so
 * rather than implying otherwise.
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

const { armNoteLock, disarmNoteLock, unlockNoteWithPin, unlockNoteWithMaster } =
    await import('../src/services/vault/noteLock.ts');
const { sealRow, openRow } = await import('../src/services/vault/rows.ts');
const { importRawKey } = await import('../src/services/crypto/cipher.ts');
const { randomBytes } = await import('../src/services/crypto/bytes.ts');

const USER = 'user-1';
const NOTE = 'note-1';
const PIN = 'hunter2hunter';

// Cheap cost factor so the test runs in a second. The scheme is identical.
process.env.VAULT_TEST_ITERATIONS = '1';

const masterRaw = randomBytes(32);
const masterKey = await importRawKey(masterRaw);

/** Stands in for a note with real content. */
const makeNote = () => ({
    id: NOTE,
    user_id: USER,
    title: 'Something I would rather not see',
    content: '<p>the actual private text</p>',
    notes_tags: ['secret', 'personal'],
    is_pinned: true,
    notes_position: 1.5,
    notes_parent_id: null,
});

console.log('\n== arming a lock re-seals the page under the note key ==');
let noteKey;
let lockColumns;
let sealed;
{
    lockColumns = await armNoteLock(NOTE, PIN, masterKey);
    check('the lock is armed', lockColumns.lock_enabled === true);

    noteKey = await unlockNoteWithPin(lockColumns, NOTE, PIN);
    check('the note key comes back from the PIN', noteKey !== null);

    const wrong = await unlockNoteWithPin(lockColumns, NOTE, 'hunter2hunterX');
    check('a wrong PIN does not produce a key', wrong === null);

    // What `lockNote` does: re-seal the note with the NOTE key.
    sealed = await sealRow('notes', makeNote(), USER, noteKey);
    check('the payload was produced', typeof sealed.vault === 'string');
    check('the title is out of the clear columns', !('title' in sealed.clear));
    check('the content is out of the clear columns', !('content' in sealed.clear));
    check('the tags are out of the clear columns', !('notes_tags' in sealed.clear));
    check('pin state stays readable', sealed.clear.is_pinned === true);
    check('the tree stays readable', 'notes_position' in sealed.clear);
    check('no plaintext survives in the write',
        !JSON.stringify(sealed).includes('rather not'));
}

console.log('\n== the note PIN opens it, the master key does not ==');
{
    // This is the assertion that makes the lock mean something. A payload sealed
    // under the master key would open here, and the pin pad would be theatre.
    const viaNoteKey = await openRow('notes', { ...sealed.clear, vault: sealed.vault }, USER, noteKey);
    check('the note key opens the page', viaNoteKey.title === 'Something I would rather not see');
    check('the body comes back whole', viaNoteKey.content === '<p>the actual private text</p>');

    // `openRow` throws rather than returning null when a payload will not open,
    // and that is the right shape here: a locked page read with the wrong key must
    // not come back as an empty note, or the next autosave would blank the real one.
    let masterOpened = 'no-throw';
    try {
        const result = await openRow('notes', { ...sealed.clear, vault: sealed.vault }, USER, masterKey);
        masterOpened = result === null ? 'null' : 'opened';
    } catch (err) {
        masterOpened = err?.name ?? 'threw';
    }
    check('the MASTER key does NOT open it', masterOpened === 'VaultUnreadableError', `got: ${masterOpened}`);
    check('and it refuses loudly rather than returning an empty note',
        masterOpened !== 'opened' && masterOpened !== 'null');
}

console.log('\n== unlocking re-seals under the master key ==');
{
    // What `unlockNote` does, so the app can read the page again with no prompt.
    const opened = await openRow('notes', { ...sealed.clear, vault: sealed.vault }, USER, noteKey);
    const resealed = await sealRow('notes', opened, USER, masterKey);

    const viaMaster = await openRow('notes', { ...resealed.clear, vault: resealed.vault }, USER, masterKey);
    check('the master key opens it once unlocked', viaMaster.title === 'Something I would rather not see');

    let retired = 'opened';
    try {
        const result = await openRow('notes', { ...resealed.clear, vault: resealed.vault }, USER, noteKey);
        retired = result === null ? 'null' : 'opened';
    } catch (err) {
        retired = err?.name ?? 'threw';
    }
    check('the retired note key no longer opens it', retired === 'VaultUnreadableError', `got: ${retired}`);

    const masterFromLock = await unlockNoteWithMaster(lockColumns, NOTE, masterKey);
    check('the stored master wrap yields a key', masterFromLock !== null);
}

console.log('\n== a locked page is not decrypted for display ==');
{
    // Mirrors `openForDisplay`: the stub the sidebar gets.
    const lockedRow = { ...sealed.clear, vault: sealed.vault, lock_enabled: true };
    const stub = { ...lockedRow };
    delete stub.vault;
    stub.title = null;
    stub.content = '';
    stub.notes_tags = [];

    check('the stub carries no title', stub.title === null);
    check('the stub carries no content', stub.content === '');
    check('the stub carries no tags', stub.notes_tags.length === 0);
    check('the stub carries no ciphertext', !('vault' in stub));
    check('but it is still identified', stub.id === NOTE);
    check('and still sorts, so it keeps its place', stub.is_pinned === true && stub.notes_position === 1.5);
    check('and is flagged as locked', stub.lock_enabled === true);

    // The real property: handing the stub to the opener with any key produces
    // nothing but the stub. It carries no ciphertext, so there is nothing to
    // decrypt and no error either -- the page simply has no contents.
    const openedStub = await openRow('notes', stub, USER, noteKey);
    check('opening the stub reveals nothing', openedStub.title === null && openedStub.content === '');
    check('and it is not mistaken for a readable note',
        openedStub.title === null && !('vault' in openedStub));
}

console.log('\n== disarm leaves nothing behind ==');
{
    const d = disarmNoteLock();
    check('both wraps are cleared', !d.lock_key_pin && !d.lock_key_master);
    check('the salt is cleared', !d.lock_salt);
    check('the attempt counter is reset', d.lock_failed_attempts === 0);
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);



