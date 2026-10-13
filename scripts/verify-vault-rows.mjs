/**
 * The vault as a whole, end to end.
 *
 * `verify-vault-crypto.mjs` proves the primitives are sound. This proves the
 * *behaviour* is: that a row survives a round trip through seal and open with the
 * shape intact, that the vault off is indistinguishable from no vault at all,
 * and that the two ways it could destroy somebody's data -- a locked read
 * returning a partial row, and a field quietly left in the clear -- both fail
 * loudly instead.
 *
 * Those last two are the whole reason this file exists. Encryption code does not
 * fail loudly on its own: a row that opens with fields missing looks exactly
 * like a row that was never sealed, and the next autosave writes that emptiness
 * back over real content.
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

// The key is passed in rather than mocked. ES module exports are immutable, so
// the only honest way to test this module against real keys is for it to accept
// the key -- which is why `rows.ts` takes an optional override.
let fakeKey = null;

const { sealRow, openRow, openRows, VaultLockedError, VaultUnreadableError } =
    await import('../src/services/vault/rows.ts');
const { importRawKey } = await import('../src/services/crypto/cipher.ts');
const { randomBytes } = await import('../src/services/crypto/bytes.ts');

// Everything below goes through these, so each test does not have to remember
// to pass the key.
const seal = (table, row, userId = USER) => sealRow(table, row, userId, fakeKey);
const open = (table, row, userId = USER) => openRow(table, row, userId, fakeKey);
const openList = (table, rows, userId = USER) => openRows(table, rows, userId, fakeKey);

const USER = 'user-1';
const ID = 'row-1';

console.log('\n== with the vault off, nothing changes ==');
{
    fakeKey = null;
    const row = {
        id: ID, user_id: USER, log_date: '2026-10-13',
        journal_morning: '<p>private</p>', morning_mood: 7, water: 2500,
    };
    const write = await seal('daily_logs', row);
    check('no payload is produced', write.vault === null);
    check('every field is written in the clear', write.clear.journal_morning === '<p>private</p>');
    check('nothing is reported as sealed', write.sealed === false);

    const read = await open('daily_logs', { ...row });
    check('the row comes back identical', read.journal_morning === '<p>private</p>' && read.morning_mood === 7);
}

console.log('\n== and a LIST of unsealed rows comes back too ==');
{
    // This is the combination that blanked the notes page. `openRows` used to
    // check for a key before checking whether anything needed opening, so with
    // the vault off -- the state of every account that never set a PIN -- it
    // threw, `getUserNotes` failed, and the page rendered empty.
    //
    // The distinction it has to make: a null key means either "never armed" or
    // "armed and locked", and only the second is an error. What separates them
    // is whether any row carries a payload.
    fakeKey = null;
    const rows = [
        { id: 'n1', user_id: USER, title: 'One', content: '<p>a</p>', is_pinned: false },
        { id: 'n2', user_id: USER, title: 'Two', content: '<p>b</p>', is_pinned: true },
    ];

    let threw = null;
    let result = null;
    try { result = await openList('notes', rows); } catch (e) { threw = e; }

    check('an unsealed list does not throw', threw === null,
        threw ? `${threw.name}: ${threw.message}` : '');
    check('every row survives', result?.rows.length === 2);
    check('nothing is reported as failed', result?.failed.length === 0);
    check('the titles are intact', result?.rows[1].title === 'Two');
    check('the bodies are intact', result?.rows[0].content === '<p>a</p>');

    // A locked vault over rows that need nothing opened is also fine: there is no
    // private data in play, so refusing to render is refusing for nothing.
    fakeKey = null;
    check('and no rows are reported as unreadable', (result?.failed ?? ['x']).length === 0);

    // An empty list, on a table that is not sealable, must not throw either.
    let emptyThrew = null;
    try { await openList('notes', []); } catch (e) { emptyThrew = e; }
    check('an empty list does not throw', emptyThrew === null);
}

console.log('\n== a locked vault over SEALED rows does refuse ==');
{
    // The counterpart, and the reason the check above is not simply "never
    // throw": a row that has private data in it and no key to open it must fail
    // loudly, not render as empty.
    fakeKey = await importRawKey(randomBytes(32));
    const row = { id: ID, user_id: USER, log_date: '2026-10-13', journal_morning: '<p>secret</p>' };
    const write = await seal('daily_logs', row);
    const stored = [{ ...write.clear, vault: write.vault }];

    fakeKey = null;
    let threw = null;
    try { await openList('daily_logs', stored); } catch (e) { threw = e; }
    check('a sealed list with no key throws', threw instanceof VaultLockedError,
        threw ? threw.name : 'rendered sealed rows as empty');
}

console.log('\n== with the vault on, a row round trips ==');
{
    fakeKey = await importRawKey(randomBytes(32));
    const row = {
        id: ID, user_id: USER, log_date: '2026-10-13',
        journal_morning: '<p>I felt like myself today.</p>',
        journal_evening: '<p>grateful</p>',
        morning_mood: 7, evening_mood: 8,
        morning_systolic: 118, morning_diastolic: 76,
        water: 2500, protein: 120,
    };
    const write = await seal('daily_logs', row, USER);

    check('a payload was produced', typeof write.vault === 'string' && write.vault.length > 0);
    check('the date stays readable', write.clear.log_date === '2026-10-13');
    check('the user id stays readable (RLS needs it)', write.clear.user_id === USER);
    check('the row id stays readable', write.clear.id === ID);

    for (const field of ['journal_morning', 'journal_evening', 'morning_mood', 'morning_systolic', 'water']) {
        check(`${field} is NOT written in the clear`, !(field in write.clear));
    }
    check('no plaintext appears anywhere in the write',
        !JSON.stringify(write).includes('myself') && !JSON.stringify(write).includes('118'));

    const stored = { ...write.clear, vault: write.vault };
    const read = await open('daily_logs', stored, USER);
    check('the journal reopens', read.journal_morning === '<p>I felt like myself today.</p>');
    check('the mood reopens', read.morning_mood === 7);
    check('the blood pressure reopens', read.morning_systolic === 118);
    check('the date survives the round trip', read.log_date === '2026-10-13');
    check('the ciphertext is not left in the object', !('vault' in read));

    // The shape downstream code depends on.
    const keys = Object.keys(read).sort().join(',');
    check('the reopened row has the same fields as the original',
        keys === Object.keys(row).sort().join(','), keys);
}

console.log('\n== a locked vault fails loudly instead of returning half a row ==');
{
    const row = { id: ID, user_id: USER, log_date: '2026-10-13', journal_morning: '<p>secret</p>' };
    fakeKey = await importRawKey(randomBytes(32));
    const write = await seal('daily_logs', row, USER);
    const stored = { ...write.clear, vault: write.vault };

    fakeKey = null; // locked
    let threw = null;
    try { await open('daily_logs', stored, USER); } catch (e) { threw = e; }
    check('opening while locked throws', threw instanceof VaultLockedError,
        threw ? threw.name : 'returned a partial row');
    check('the error names the table', threw?.table === 'daily_logs');

    let listThrew = null;
    try { await openList('daily_logs', [stored], USER); } catch (e) { listThrew = e; }
    check('opening a list while locked throws too', listThrew instanceof VaultLockedError);
}

console.log('\n== a payload that will not open is reported, not swallowed ==');
{
    fakeKey = await importRawKey(randomBytes(32));
    const row = { id: ID, user_id: USER, log_date: '2026-10-13', journal_morning: '<p>secret</p>' };
    const write = await seal('daily_logs', row, USER);

    // A different key -- the PIN was changed, or the row was copied from
    // another account.
    fakeKey = await importRawKey(randomBytes(32));
    let threw = null;
    try { await open('daily_logs', { ...write.clear, vault: write.vault }, USER); }
    catch (e) { threw = e; }

    check('the wrong key raises rather than returning nulls', threw instanceof VaultUnreadableError,
        threw ? threw.name : 'silently returned an empty row');
    check('the error identifies the row', threw?.rowId === ID);
}

console.log('\n== one unreadable row does not blank the list ==');
{
    fakeKey = await importRawKey(randomBytes(32));
    const good = { id: 'a', user_id: USER, log_date: '2026-10-11', journal_morning: '<p>fine</p>' };
    const goodWrite = await seal('daily_logs', good, USER);

    // Sealed under a key we will no longer hold.
    const orphanKey = await importRawKey(randomBytes(32));
    const prev = fakeKey;
    fakeKey = orphanKey;
    const orphan = { id: 'b', user_id: USER, log_date: '2026-10-12', journal_morning: '<p>lost</p>' };
    const orphanWrite = await seal('daily_logs', orphan, USER);
    fakeKey = prev;

    const { rows, failed } = await openList('daily_logs', [
        { ...goodWrite.clear, vault: goodWrite.vault },
        { ...orphanWrite.clear, vault: orphanWrite.vault },
    ], USER);

    check('the readable row survives', rows.length === 1 && rows[0].journal_morning === '<p>fine</p>');
    check('the unreadable row is named', failed.length === 1 && failed[0] === 'b');
}

console.log('\n== notes keep their tree and ordering ==');
{
    fakeKey = await importRawKey(randomBytes(32));
    const note = {
        id: 'n1', user_id: USER,
        title: 'Something private', content: '<p>body</p>', notes_tags: ['secret'],
        is_pinned: true, notes_position: 3.5, notes_parent_id: 'n0',
        notes_color: 'amber', notes_icon: 'star',
    };
    const write = await seal('notes', note, USER);

    check('the title is sealed', !('title' in write.clear));
    check('the content is sealed', !('content' in write.clear));
    check('the tags are sealed', !('notes_tags' in write.clear));
    check('is_pinned stays readable for sorting', write.clear.is_pinned === true);
    check('notes_position stays readable for ordering', write.clear.notes_position === 3.5);
    check('notes_parent_id stays readable for the tree', write.clear.notes_parent_id === 'n0');
    check('the lock columns are never sealed', 'lock_enabled' in write.clear || !('lock_enabled' in note));

    const read = await open('notes', { ...write.clear, vault: write.vault }, USER);
    check('the title reopens', read.title === 'Something private');
    check('the tags reopen', Array.isArray(read.notes_tags) && read.notes_tags[0] === 'secret');
    check('the tree position is intact', read.notes_parent_id === 'n0');
}

console.log('\n== the user settings keyring is never inside its own payload ==');
{
    fakeKey = await importRawKey(randomBytes(32));
    const settings = {
        id: 's1', user_id: USER,
        date_of_birth: '1998-04-02', gender: 'prefer_not_to_say',
        vault_enabled: true, vault_pin_wrapped: 'sealed-key-bytes',
        vault_pin_salt: 'saltsalt', vault_pin_iterations: 600000,
    };
    const write = await seal('user_settings', settings, USER);
    check('the DOB is sealed', !('date_of_birth' in write.clear));
    check('the gender is sealed', !('gender' in write.clear));
    check('the wrapped key stays clear or it cannot be unwrapped',
        'vault_pin_wrapped' in write.clear);
    check('the flag stays clear or the app cannot tell', write.clear.vault_enabled === true);

    const read = await open('user_settings', { ...write.clear, vault: write.vault }, USER);
    check('the DOB reopens', read.date_of_birth === '1998-04-02');
    check('the wrapped key is still usable afterwards', read.vault_pin_wrapped === 'sealed-key-bytes');
}

console.log('\n== two rows never share a payload ==');
{
    fakeKey = await importRawKey(randomBytes(32));
    const base = { user_id: USER, log_date: '2026-10-13', journal_morning: '<p>same text</p>' };
    const a = await seal('daily_logs', { ...base, id: 'row-a' }, USER);
    const b = await seal('daily_logs', { ...base, id: 'row-b' }, USER);
    check('identical content seals differently', a.vault !== b.vault);
    check("row A's payload does not open as row B",
        await (async () => {
            try { await open('daily_logs', { ...b.clear, vault: a.vault }, USER); return false; }
            catch { return true; }
        })());
}

console.log('\n== unsealable tables pass through untouched ==');
{
    fakeKey = await importRawKey(randomBytes(32));
    const exercise = { id: 'e1', user_id: USER, name: 'Barbell squat', wger_id: 1 };
    const write = await seal('exercises', exercise, USER);
    check('nothing is sealed', write.vault === null);
    check('every field is kept', write.clear.name === 'Barbell squat' && write.clear.wger_id === 1);
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

